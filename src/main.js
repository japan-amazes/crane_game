// =============================================================
// 起動と1プレイの流れ
// buildRound() は物理だけで完結（ブラウザでもテスト環境でも動く）
// boot() はブラウザ専用（描画・入力・画面）
// =============================================================
import { createWorld, createTable, STEP } from './physics/world.js';
import { Arm, PHASE } from './physics/arm.js';
import { createChain, createChainDynamics } from './physics/chain.js';
import { createRing, ringAxis } from './physics/ring.js';
import { createHookMachine } from './machines/hook.js';
import { createPrizeShelf, shelfHole, SHELF } from './machines/prizeShelf.js';
import { applyChainRatio } from './game/chainRange.js';

const LIB = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js',
  rapier: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/+esm'
};

// ---------------------------------------------------------------
// 1プレイ分の物理を組み立てる
// ---------------------------------------------------------------
export function buildRound(RAPIER, preset) {
  // 景品の網と箱は、初期位置と反対側（左から始まる台なら右側）に置く。板とフックもその側へ少し寄せる
  const side = preset.field.startSide === 'right' ? -1 : 1;
  preset = JSON.parse(JSON.stringify(preset));
  preset.board.posX = SHELF.boardX * side;
  const world = createWorld(RAPIER);
  const table = createTable(RAPIER, world, preset, shelfHole(side));
  const machine = createHookMachine(RAPIER, world, preset);
  const shelf = createPrizeShelf(RAPIER, world, preset, machine, side);
  const g = preset.ring;

  // 高さは実機と同じ考え方：アームの高さ（固定）＋下降制限（止まる高さ）で決まり、
  // チェーンの長さでリングとフックの距離・着地したときのたるみが変わる
  const homeY = machine.boardTop + preset.field.armHeight;
  const bottomY = machine.boardTop + preset.arm.dropLimit;

  const arm = new Arm(RAPIER, world, preset, homeY, bottomY);
  const chain = createChain(preset, arm.pos);
  const ring = createRing(RAPIER, world, preset, chain, arm.pos, arm.body);
  const chainDyn = createChainDynamics(chain, ring.body, preset);

  const round = {
    world, arm, chain, ring, machine, shelf, preset, chainDyn,
    forceDrop: false, // 確定チケット：網を強制的に傾けて箱を落とす
    swing: {},        // ①②を押した瞬間の揺れ
    hookRecord: null, // 引き上げ直前のフックとの位置関係
    result: null,     // 'win' | 'lose'
    maxLift: 0,
    visuals: [table.visual, machine.visual, ...shelf.visuals, arm.visual, ...chain.visuals, ring.visual],
    step() {
      arm.update(STEP);
      chainDyn.step(STEP);
      machine.dampHanging(ring, STEP, preset.board.hangDamping ?? 40);
      if (round.forceDrop && (arm.phase === PHASE.ASCEND || arm.phase === PHASE.JUDGE)) shelf.forceTilt(STEP);
      shelf.step(STEP);
      world.step();
      chain.update(STEP, arm.pos, ring.top(), machine);
      if (arm.phase === PHASE.ASCEND || arm.phase === PHASE.JUDGE) {
        round.maxLift = Math.max(round.maxLift, machine.lifted());
      }
      if (arm.phase === PHASE.ASCEND || arm.phase === PHASE.JUDGE) earlyJudge();
    },
    swingNow() { return measureSwing(round); },
    // 失敗後に続ける：作り直さず、記録だけ消してアームを初期位置へ戻す（揺れ・板の位置はそのまま）
    continueRound() {
      round.swing = {};
      round.hookRecord = null;
      round.result = null;
      round.maxLift = 0;
      arm.startReturn();
    }
  };

  // 上がりきる前の判定
  // 獲得：景品の箱が網から取り出し口に落ちたら、その時点で確定
  //   箱が落ち切らなくても、リングがフックに掛かって板が判定の高さ（board.liftJudge）以上に WIN_HOLD 秒持ち上がれば獲得（実機と同じ扱い）
  // はずれ（上昇開始から arm.judgeDelay 秒たってから）：リングの一番下がフックの頂点より上に抜けていて、
  //   板も浮いておらず網も傾いていない（もう掛かりようがない）
  // どちらとも言えないときは判定を続け、上がりきったら判定待ちのあと判定する
  const MISS_MARGIN = 0.5;  // cm
  const WIN_HOLD = 1.0;     // 秒
  let winTimer = 0;
  function earlyJudge() {
    if (shelf.fallen()) { arm.finish(); return; }
    const lift = machine.lifted();
    winTimer = lift >= preset.board.liftJudge ? winTimer + STEP : 0;
    if (winTimer >= WIN_HOLD) { arm.finish(); return; }
    if (arm.phase !== PHASE.ASCEND) return;
    if (arm.timer < (preset.arm.judgeDelay ?? 3)) return;
    if (lift > 0.3 || shelf.thetaDeg > 1) return;
    const c = ring.body.translation(), t = ring.top();
    const ringLow = 2 * c.y - t.y - ring.tubeR;
    let hookHigh = -Infinity;
    for (const p of machine.hookLineWorld()) hookHigh = Math.max(hookHigh, p.y);
    hookHigh += machine.rodR;
    if (ringLow > hookHigh + MISS_MARGIN) arm.finish();
  }

  arm.onPhase = (next) => {
    if (next === PHASE.ASCEND) winTimer = 0;
    if (next === PHASE.MOVE_X) round.swing.x = measureSwing(round);
    if (next === PHASE.MOVE_Z) round.swing.z = measureSwing(round);
    if (next === PHASE.ASCEND) round.hookRecord = machine.measure(ring, ringAxis(ring));
    if (next === PHASE.DONE) {
      round.result = shelf.fallen() || machine.lifted() >= preset.board.liftJudge ? 'win' : 'lose';
    }
    if (round.onPhase) round.onPhase(next);
  };

  // 生成直後の揺れを落ち着かせる（1秒分）
  // （初期のねじれは残したまま、振り子の揺れだけ落ち着かせる）
  for (let i = 0; i < 240; i++) { shelf.step(STEP); world.step(); chain.update(STEP, arm.pos, ring.top(), machine); }
  return round;
}

// ステージの設定：基本設定に、各項目の値を重ねる
// order が "random"：ステージ番号から決まるランダムで、各項目の値を選ぶ（同じステージはいつも同じ設定）
// それ以外：ステージ番号を各項目の段階に分けて順に変える（最初の項目がいちばん早く変わる）
export function stageCount(spec) {
  return spec.levels.reduce((n, lv) => n * lv.values.length, 1);
}
export function stagePreset(base, spec, i) {
  const p = JSON.parse(JSON.stringify(base));
  const rand = spec.order === 'random' ? seededRandom((spec.seed || 1) * 100003 + i) : null;
  let rest = i;
  for (const lv of spec.levels) {
    const n = lv.values.length;
    const v = rand ? lv.values[Math.floor(rand() * n)] : lv.values[rest % n];
    rest = Math.floor(rest / n);
    // path があればその1か所に、値が {パス: 値} ならまとめて設定する
    const sets = lv.path ? { [lv.path]: v } : v;
    for (const [path, val] of Object.entries(sets)) {
      const ks = path.split('.');
      let o = p;
      for (const k of ks.slice(0, -1)) o = o[k];
      o[ks[ks.length - 1]] = val;
    }
  }
  return applyChainRatio(p);   // チェーンの長さは、リングの直径と下降制限から決まる範囲の割合で
}
// 種（seed）から決まる乱数（mulberry32）
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 高さの目安（調整パネルに表示）：チェーン・リングの寸法と、アームの高さ・下降制限から計算
export function heightInfo(preset) {
  const c = preset.chain, g = preset.ring, k = preset.connector, h = preset.hook;
  const n = Math.max(2, Math.round(c.length / c.pitch));
  const chainLen = (c.length / n) * n;
  const hang = chainLen + (k.diameter - k.thickness) + g.diameter - g.thickness / 2; // アーム〜リング下端
  return {
    gapAtHome: preset.field.armHeight - hang - h.height,   // 待機中：リング下端 − フック頂点
    bottomAtStop: preset.arm.dropLimit - hang              // 下がりきったとき：リング下端の板からの高さ（負＝たるみ）
  };
}

// リングの揺れ：吊り元から見た傾き（度）と動きの速さ（cm/s）
function measureSwing(round) {
  const a = round.arm.pos;
  const c = round.ring.body.translation();
  const v = round.ring.body.linvel();
  const dy = a.y - c.y;
  return {
    tiltX: Math.atan2(c.x - a.x, dy) * 180 / Math.PI,   // ＋＝右へ傾き
    tiltZ: Math.atan2(a.z - c.z, dy) * 180 / Math.PI,   // ＋＝奥へ傾き
    speed: Math.hypot(v.x - round.arm.vel.x, v.z - round.arm.vel.z)
  };
}

// ---------------------------------------------------------------
// ブラウザ側
// ---------------------------------------------------------------
async function boot() {
  const status = document.getElementById('status');
  status.textContent = '読み込み中…';

  const [RAPIER, THREE, sceneMod, debugMod, soundMod, prizeMod, progressMod, screensMod, presetJson, stageJson] = await Promise.all([
    import(LIB.rapier).then(m => m.default || m),
    import(LIB.three),
    import('./render/scene.js'),
    import('./ui/debug.js'),
    import('./audio/sound.js'),
    import('./game/prizes.js'),
    import('./game/progress.js'),
    import('./ui/screens.js'),
    fetch('./presets/hook-presets.json').then(r => r.json()),
    fetch('./presets/stages.json').then(r => r.json())
  ]);
  await RAPIER.init();

  // ---- ステージ・記録 ----
  // stages.json の段階の組み合わせでステージの設定が決まる。獲得で次へ、はずれは同じステージで続ける（別のステージへも行ける）
  const basePreset = presetJson.presets[0];
  const stages = stageJson;
  const STAGE_TOTAL = stageCount(stages);
  const progress = progressMod.createProgress(STAGE_TOTAL);
  const stageLabel = document.getElementById('stageLabel');
  const debug = debugMod.createDebugPanel(document.getElementById('debug'), stagePreset(basePreset, stages, progress.stage), () => restart(true), heightInfo,
    () => { progress.resetAll(); goStage(0); });
  // 新しいステージで始める（景品も新しく引く）
  function goStage(i) {
    progress.goStage(i);
    debug.setBase(stagePreset(basePreset, stages, progress.stage));
    restart(false);
  }
  const view = sceneMod.createScene(THREE, document.getElementById('view'));
  const screens = screensMod.createScreens({ progress, onPickStage: i => goStage(i) });

  // ---- 景品 ----
  // ステージごとにランダムで1つ。はずれて続けている間・「最初から」では変わらない
  let prize = null;
  function newPrize() {
    prize = prizeMod.drawPrize();
    view.setPrizePanel(prizePanelCanvas(prize), debug.currentPreset().field);
    view.setPrizeBoxArt(prizeBoxArt(prize));
  }
  // 景品の箱（幅5×高さ7）の正面の絵：上の帯にカテゴリーと★、真ん中に景品、下に名前
  function prizeBoxArt(it) {
    const W = 250, H = 350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cat = prizeMod.CATEGORIES.find(x => x.id === it.cat);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = cat.color; g.fillRect(0, 0, W, 50); g.fillRect(0, H - 70, W, 70);
    g.fillStyle = '#ffd166'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★'.repeat(it.rarity), W / 2, 27);
    g.save(); g.translate(15, 62); prizeMod.paintPrize(g, it, 220); g.restore();
    g.fillStyle = '#1f2533'; g.font = 'bold 30px sans-serif';
    g.fillText(it.name, W / 2, H - 35, W - 16);
    return { front: c, side: cat.color };
  }
  // パネル（横30cm×縦28cm）と同じ縦横比の絵：上の帯にカテゴリーと★、真ん中に大きく景品、下に景品名
  function prizePanelCanvas(it) {
    const W = 900, H = 840;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cat = prizeMod.CATEGORIES.find(x => x.id === it.cat);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, cat.color);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = cat.color; g.fillRect(0, 0, W, 90);
    g.fillStyle = '#fff'; g.font = 'bold 52px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(cat.name, 30, 47);
    g.textAlign = 'right'; g.fillStyle = '#ffd166'; g.fillText('★'.repeat(it.rarity), W - 26, 47);
    const pic = 600;
    g.save(); g.translate((W - pic) / 2, 100); prizeMod.paintPrize(g, it, pic); g.restore();
    g.fillStyle = '#1f2533'; g.textAlign = 'center'; g.font = 'bold 72px sans-serif';
    g.fillText(it.name, W / 2, H - 70, W - 40);
    return c;
  }

  // ---- クレジット・確定チケット ----
  // 1回のプレイ（はずれ後に続ける場合も）で1クレジット。①を押したときに使う
  let paid = false;          // このプレイの分はもう使ったか
  let ticketArmed = false;   // 確定チケットを使う予定（①を押したときに消費）
  let ticketUsed = false;    // このプレイで確定チケットを使った
  const hud = document.getElementById('hud');
  function showHud() {
    const unl = debug.unlimited;
    hud.innerHTML = `
      <span class="hud-c">クレジット <b>${unl ? '∞' : progress.credits}</b></span>
      <span class="hud-t">確定チケット <b>${progress.tickets}</b></span>
      <span class="hud-p"><b>${progress.points}</b>pt</span>`;
    btnTicket.disabled = round.arm.phase !== PHASE.READY || paid || (progress.tickets <= 0 && !ticketArmed);
    btnTicket.classList.toggle('active', ticketArmed);
    btnTicket.textContent = ticketArmed ? '確定チケット：使う' : '確定チケット';
  }
  // ①を押したとき：まだ払っていなければクレジットを使う。足りなければ広告の案内
  function startPlay() {
    if (paid) return true;
    if (!progress.useCredit(debug.unlimited)) {
      screens.showNoCredit(() => showHud());
      return false;
    }
    paid = true;
    if (ticketArmed) { ticketArmed = false; ticketUsed = progress.useTicket(); round.forceDrop = ticketUsed; }
    showHud();
    return true;
  }

  // ---- 音（BGM・効果音）----
  const sound = soundMod.createSound();
  sound.loadBgm('./assets/music/bgm.json');
  const btnBgm = document.getElementById('btnBgm');
  const btnSfx = document.getElementById('btnSfx');
  function showSoundButtons() {
    btnBgm.classList.toggle('active', sound.settings.bgm);
    btnSfx.classList.toggle('active', sound.settings.sfx);
    btnBgm.textContent = sound.settings.bgm ? '♪ BGM オン' : '♪ BGM オフ';
    btnSfx.textContent = sound.settings.sfx ? '効果音 オン' : '効果音 オフ';
  }
  btnBgm.addEventListener('click', () => { sound.setBgm(!sound.settings.bgm); showSoundButtons(); });
  btnSfx.addEventListener('click', () => { sound.setSfx(!sound.settings.sfx); showSoundButtons(); });
  showSoundButtons();

  let round = null;
  let acc = 0;
  let last = performance.now();

  // ---- カメラモード ----
  // normal：ずっと正面 / zoom：移動中は正面、下降が始まったらフック付近の拡大に切り替え、上昇が始まったら正面へ戻す
  const CAM_KEY = 'crane.cameraMode.v1';
  let camMode = 'normal';
  try { camMode = localStorage.getItem(CAM_KEY) === 'zoom' ? 'zoom' : 'normal'; } catch { /* 保存できない環境 */ }
  const ZOOM_DELAY = 1.0;   // 下降が始まってから拡大に切り替えるまで（秒）
  const ZOOM_MOVE = 0.8;    // 切り替えにかける時間（秒）
  const UNZOOM_DELAY = 1.0; // 上昇が始まってから正面へ戻すまで（秒）
  let zoomAt = null;        // 拡大に切り替える予定時刻（performance.now の値）
  let zoomed = false;
  let unzoomAt = null;      // 正面へ戻す予定時刻
  function applyCamera(duration = 0) {
    const zoomNow = camMode === 'zoom' && zoomed;
    view.setView(zoomNow ? 'zoom' : 'front', duration);
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === camMode));
  }
  // 確認用ズーム：①を押す前だけ、斜めからフック（口の向き）を見られる
  let peek = false;
  function setPeek(on) {
    peek = on;
    btnPeek.classList.toggle('active', on);
    if (on) view.setView('zoom', 0.5); else applyCamera(0.5);
  }
  function setCamMode(mode) {
    camMode = mode;
    try { localStorage.setItem(CAM_KEY, mode); } catch { /* 保存できない環境 */ }
    if (peek) { peek = false; btnPeek.classList.remove('active'); }
    applyCamera(0.5);
  }

  // keepPrize：true＝同じ景品のまま作り直す（「最初から」・調整の適用）
  function restart(keepPrize = true) {
    if (!keepPrize || !prize) newPrize();
    round = buildRound(RAPIER, debug.currentPreset());
    round.onPhase = onPhase;
    view.setRound(round);
    stageLabel.textContent = `STAGE ${progress.stage + 1}${progress.isCleared(progress.stage) ? ' ✓' : ''}`;
    paid = false;
    ticketUsed = false;
    acc = 0;
    showResult(null);
    setStatus();
    zoomAt = null;
    unzoomAt = null;
    zoomed = false;
    if (peek) { peek = false; btnPeek.classList.remove('active'); }
    applyCamera();
  }

  // 「もう一度」：失敗なら続けて（初期位置へ戻る）、獲得なら次のステージへ（獲得時にもう進めてある）
  function again() {
    if (round && round.result === 'win') {
      goStage(progress.stage);
      return;
    }
    // はずれでも板が持ち上がっていた（リングが掛かったまま・網が傾いたまま）ときは、続けずに台を元に戻す（店員さんが直すイメージ）
    if (round && round.result === 'lose' && (round.machine.lifted() > 0.5 || round.shelf.thetaDeg > 1)) {
      restart(true);
      return;
    }
    if (round && round.result === 'lose') {
      paid = false;
      ticketUsed = false;
      round.forceDrop = false;
      showResult(null);
      zoomAt = null;
      unzoomAt = null;
      zoomed = false;
      round.continueRound();
      applyCamera(0.5);
      setStatus();
    } else {
      restart();
    }
  }

  let lastWin = null;   // 獲得したときの記録（結果画面に出す）
  function onPhase(next) {
    if (next === PHASE.DONE) {
      if (ticketUsed) round.result = 'win';   // 確定チケット：必ず獲得
      if (round.result === 'win') {
        const played = progress.stage;
        const got = progress.addPrize(prize.id);
        const { wrapped } = progress.clearStage();
        lastWin = { played, item: prize, ...got, wrapped };
      } else lastWin = null;
    }
    setStatus();
    if (next === PHASE.DESCEND) zoomAt = performance.now() + ZOOM_DELAY * 1000;
    if (next === PHASE.ASCEND) unzoomAt = performance.now() + UNZOOM_DELAY * 1000;
    if (next === PHASE.DESCEND) sound.sfx('descend');
    if (next === PHASE.ASCEND) sound.sfx('ascend');
    if (next === PHASE.DONE) sound.sfx(round.result === 'win' ? 'win' : 'lose');
    if (next === PHASE.DONE) showResult(round);
  }

  function setStatus() {
    const ph = round.arm.phase;
    const msg = {
      ready: '① を押している間、横へ動きます',
      moveX: '横へ移動中…',
      stopX: '停止中…',
      waitZ: '② を押している間、奥へ動きます（離すと下降）',
      moveZ: '奥へ移動中…',
      stopZ: '停止中…',
      descend: '下降中…',
      hold: '下で待機中…',
      ascend: '引き上げ中…',
      judge: '判定中…',
      returnUp: '初期位置に戻っています…',
      returnZ: '初期位置に戻っています…',
      returnX: '初期位置に戻っています…',
      done: ''
    }[ph];
    status.textContent = msg;
    btnX.disabled = !(ph === PHASE.READY || ph === PHASE.MOVE_X);
    btnZ.disabled = !(ph === PHASE.WAIT_Z || ph === PHASE.STOP_X || ph === PHASE.MOVE_Z);
    btnPeek.disabled = ph !== PHASE.READY;
    if (peek && ph !== PHASE.READY) setPeek(false);
    showHud();
  }

  // ---- 入力（ボタン＋キーボード）----
  const btnX = document.getElementById('btnX');
  const btnZ = document.getElementById('btnZ');
  const btnPeek = document.getElementById('btnPeek');
  const btnTicket = document.getElementById('btnTicket');
  btnPeek.addEventListener('click', () => { if (!btnPeek.disabled) setPeek(!peek); });
  btnTicket.addEventListener('click', () => {
    if (btnTicket.disabled) return;
    ticketArmed = !ticketArmed;
    showHud();
  });
  document.getElementById('btnBox').addEventListener('click', () => screens.showBox());
  document.getElementById('btnStages').addEventListener('click', () => screens.showStages());
  // ①：プレイ開始の押下ならクレジットを使う（足りなければ動かさない）
  function pressX(on) {
    if (on && round.arm.phase === PHASE.READY && !startPlay()) return false;
    round.arm.setInput('x', on);
    return true;
  }
  bindHold(btnX, on => { if (on) sound.sfx('tap'); return pressX(on); });
  bindHold(btnZ, on => { if (on) sound.sfx('tap'); round.arm.setInput('z', on); });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (screens.isOpen) return;
    if (e.key === '1' || e.key === 'ArrowRight') pressX(true);
    if (e.key === '2' || e.key === 'ArrowUp') round.arm.setInput('z', true);
    if (e.key === '3' || e.key === ' ') { setCamMode(camMode === 'zoom' ? 'normal' : 'zoom'); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.key === '1' || e.key === 'ArrowRight') round.arm.setInput('x', false);
    if (e.key === '2' || e.key === 'ArrowUp') round.arm.setInput('z', false);
  });
  document.querySelectorAll('[data-cam]').forEach(b => {
    b.addEventListener('click', () => setCamMode(b.dataset.cam));
  });
  document.getElementById('btnRetry').addEventListener('click', () => restart(true));
  document.getElementById('btnDebug').addEventListener('click', () => debug.toggle());

  // ---- 結果表示 ----
  const resultEl = document.getElementById('result');
  function showResult(r) {
    if (!r) { resultEl.hidden = true; return; }
    const hk = r.hookRecord;
    const hookText = !hk ? '—' : hk.inside ? 'フックの内側' : `フックの外側 ${hk.distance.toFixed(1)}cm`;
    const sw = s => s ? `横${s.tiltX.toFixed(1)}° 奥${s.tiltZ.toFixed(1)}° 速さ${s.speed.toFixed(1)}cm/s` : '—';
    const w = r.result === 'win' ? lastWin : null;
    const title = !w ? 'はずれ' : w.wrapped ? '全ステージクリア！' : `STAGE ${w.played + 1} クリア！`;
    const btn = !w ? 'もう一度' : w.wrapped ? 'ステージ1から' : '次のステージへ';
    const prizeRow = !w ? '' : `
      <div class="res-prize">
        <div class="res-pic"></div>
        <div><b>${w.item.name}</b> <span class="stars">${'★'.repeat(w.item.rarity)}</span><br>
        ${w.isNew ? '<span class="res-new">NEW！ マイボックスに入りました</span>' : `ダブり：<b>＋${w.points}pt</b>`}
        ${w.completedCat ? `<br><span class="res-new">${w.completedCat.name} コンプリート！ 確定チケット＋1</span>` : ''}</div>
      </div>`;
    resultEl.innerHTML = `
      <div class="res-title ${r.result}">${title}</div>
      ${prizeRow}
      <div class="res-row">引き上げ直前：${hookText}</div>
      <div class="res-row">板の持ち上がり：${r.maxLift.toFixed(1)}cm</div>
      <div class="res-row">① 押した瞬間の揺れ：${sw(r.swing.x)}</div>
      <div class="res-row">② 押した瞬間の揺れ：${sw(r.swing.z)}</div>
      <div class="res-btns"><button id="btnAgain" class="big">${btn}</button>${w ? '' : '<button id="btnSkip">別のステージへ</button>'}</div>`;
    resultEl.hidden = false;
    if (w) resultEl.querySelector('.res-pic').appendChild(screens.prizeCanvas(w.item, 56));
    document.getElementById('btnAgain').addEventListener('click', again);
    const skip = document.getElementById('btnSkip');
    if (skip) skip.addEventListener('click', () => { progress.skipStage(); goStage(progress.stage); });
  }

  // ---- ループ（物理は固定ステップ）----
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    let n = 0;
    // 結果が出たら物理計算を止めて、その瞬間の状態で静止させる
    // （板を吊ったまま計算を続けると、張ったチェーンが細かく震え出すため）
    const running = round.arm.phase !== PHASE.DONE;
    while (running && acc >= STEP && n < 16) { view.savePrev(); round.step(); acc -= STEP; n++; }
    if (!running) acc = 0;
    if (n === 16) acc = 0; // 端末が重いときは遅れを捨てる
    // 下降開始から ZOOM_DELAY 秒たったら拡大へ（ズームモードのときだけ動く）
    if (zoomAt !== null && now >= zoomAt) {
      zoomAt = null;
      zoomed = true;
      if (camMode === 'zoom') applyCamera(ZOOM_MOVE);
    }
    // 上昇開始から UNZOOM_DELAY 秒たったら正面へ戻す
    if (unzoomAt !== null && now >= unzoomAt) {
      unzoomAt = null;
      zoomAt = null;
      if (zoomed) {
        zoomed = false;
        if (camMode === 'zoom') applyCamera(ZOOM_MOVE);
      }
    }
    view.setGuide(debug.guide);
    // 物理の刻みの途中を補って描く（停止後は最新の状態をそのまま描く）
    view.render(running ? acc / STEP : 1);
    requestAnimationFrame(frame);
  }

  restart(false);
  requestAnimationFrame(frame);
}

// cb(true) が false を返したら押していないことにする（クレジット不足など）
function bindHold(el, cb) {
  const down = e => { e.preventDefault(); if (!el.disabled) { if (cb(true) === false) return; el.classList.add('on'); } };
  const up = e => { e.preventDefault(); if (el.classList.contains('on')) { el.classList.remove('on'); cb(false); } };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot().catch(err => {
    console.error(err);
    const s = document.getElementById('status');
    if (s) s.textContent = '起動エラー：' + err.message;
  });
}
