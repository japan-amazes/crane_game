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
import { celebrate } from './ui/celebrate.js';
import { startTitleMusic } from './audio/titleMusic.js';

// トップ画面：START を押したらフェードして消す（ゲームの準備は後ろで進める）
// トップ画面の曲は START で小さくして止め、ゲームのBGMはそのあとから始める（titleDone）
let titleDoneResolve;
const titleDone = new Promise(ok => { titleDoneResolve = ok; });
{
  const title = document.getElementById('title');
  const btnStart = document.getElementById('btnStart');
  const titleMusic = startTitleMusic(title, btnStart);
  btnStart.addEventListener('click', () => {
    titleMusic.stop();
    titleDoneResolve();
    title.classList.add('out');
    setTimeout(() => title.remove(), 500);
  });
}

// 開発中：特訓ボタンを常に表示し、テスト用の項目（クレジット無制限など）を出す。完成版では false にする
const DEV_MODE = true;

// 3D表示（Three.js 0.187.0）と物理（Rapier 0.21.0）は vendor/ に同梱（電波がなくても起動できるように）
const LIB = {
  three: '../vendor/three/three.module.js',
  rapier: '../vendor/rapier/rapier.mjs'
};

// ---------------------------------------------------------------
// 1プレイ分の物理を組み立てる
// ---------------------------------------------------------------
export function buildRound(RAPIER, preset) {
  // 景品の網と箱は、初期位置と同じ側（左から始まる台なら左側）に置く。板とフックもその側へ少し寄せる
  //   実機と同じく、リングの初期位置が取り出し口（床の穴）の真上になる
  const side = preset.field.startSide === 'right' ? 1 : -1;
  preset = JSON.parse(JSON.stringify(preset));
  preset.board.posX = SHELF.boardX * side;
  const world = createWorld(RAPIER);
  const table = createTable(RAPIER, world, preset, shelfHole(side));
  const machine = createHookMachine(RAPIER, world, preset);
  const shelf = createPrizeShelf(RAPIER, world, preset, machine, side);
  const g = preset.ring;

  // 高さは実機と同じ考え方：アームの高さ（固定）＋下降制限（止まる高さ）で決まり、
  // チェーンの長さでリングとフックの距離・着地したときのたるみが変わる
  //   高さは「標準の板（厚み0.8cm）の上面」から測る。板の厚みや傾きを変えても、アームとリングの高さは変わらない
  const homeY = REF_BOARD_TOP + preset.field.armHeight;
  const bottomY = REF_BOARD_TOP + preset.arm.dropLimit;

  const arm = new Arm(RAPIER, world, preset, homeY, bottomY);
  const chain = createChain(preset, arm.pos);
  const ring = createRing(RAPIER, world, preset, chain, arm.pos, arm.body);
  const chainDyn = createChainDynamics(chain, ring.body, preset);

  const round = {
    world, arm, chain, ring, machine, shelf, preset, chainDyn,
    forceDrop: false, // 確定チケット：網を強制的に傾けて箱を落とす
    swing: {},        // ①②を押した瞬間の揺れ
    hookRecord: null, // 引き上げ直前のフックとの位置関係
    press: {},        // ①②を押していた時間（秒）：{ x, z }
    dropOffset: null, // 下降を始めた瞬間のリング中心の、フックの先からのずれ { dx（右＋）, dz（手前＋） }
    result: null,     // 'win' | 'lose'
    maxLift: 0,
    visuals: [table.visual, ...machine.extraVisuals, machine.visual, ...shelf.visuals, arm.visual, ...chain.visuals, ring.visual],
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
      round.press = {};
      round.dropOffset = null;
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

  const pressFrom = {};
  arm.onPhase = (next) => {
    if (next === PHASE.ASCEND) winTimer = 0;
    if (next === PHASE.MOVE_X) round.swing.x = measureSwing(round);
    if (next === PHASE.MOVE_Z) round.swing.z = measureSwing(round);
    // ①②を押していた時間：押して動き始めてから、離して止まり始めるまで（実際の時間で測る）
    const now = performance.now() / 1000;
    if (next === PHASE.MOVE_X) pressFrom.x = now;
    if (next === PHASE.STOP_X && pressFrom.x != null) round.press.x = now - pressFrom.x;
    if (next === PHASE.MOVE_Z) pressFrom.z = now;
    if (next === PHASE.STOP_Z && pressFrom.z != null) round.press.z = now - pressFrom.z;
    // 下降を始めた瞬間：リングの中心とフックの先の水平のずれ
    if (next === PHASE.DESCEND) {
      const c = ring.body.translation(), line = machine.hookLineWorld(), tip = line[line.length - 1];
      round.dropOffset = { dx: c.x - tip.x, dz: c.z - tip.z };
    }
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

const PANEL_FONT = '"M PLUS Rounded 1c"';   // 景品パネルの文字のフォント（index.html で読み込む）

// ステージの設定：基本設定に、各項目の値を重ねる
// order が "random"：ステージ番号から決まるランダムで、各項目の値を選ぶ（同じステージはいつも同じ設定）
// それ以外：ステージ番号を各項目の段階に分けて順に変える（最初の項目がいちばん早く変わる）
// ステージの★レベル（1〜starCycle）。ステージ1（i=0）が★1
export function stageStars(spec, i) {
  return (i % (spec.starCycle || 5)) + 1;
}
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
  // リングの向き：フックの向きに対して、ステージの★レベルで決まる角度にする
  //   上から見たフックの面とリングの面の角度 A（90＝直角で一番引っ掛かりやすい、0＝平行で一番引っ掛かりにくい）
  //   フックとリングの yaw が同じとき直角（A=90）になるので、リングの yaw ＝ フックの yaw ±（90−A）。＋−はランダム
  const rt = spec.ringToHook;
  if (rt && rt.planeAngleByStar) {
    const A = rt.planeAngleByStar[stageStars(spec, i) - 1] ?? 90;
    const sign = rand ? (rand() < 0.5 ? -1 : 1) : 1;
    p.ring.yawDeg = ((p.hook.yawDeg + sign * (90 - A)) % 180 + 180) % 180;   // リングは180°回すと同じ形
  }
  // 板の形：★が低いステージは正方形（長い辺に合わせる）。フックが手前・奥を向いても板の幅が狭くならない
  //   ★が boardSquareMaxStar より高いステージは、元の長方形（横長）のまま
  const sqMax = spec.boardSquareMaxStar ?? 3;
  if (stageStars(spec, i) <= sqMax) p.board.depth = p.board.width = Math.max(p.board.width, p.board.depth);
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

// 高さの基準：標準の板の厚み（板の上面の高さ）
export const REF_BOARD_TOP = 0.8;

// 高さの目安（調整パネルに表示）：チェーン・リングの寸法と、アームの高さ・下降制限から計算
export function heightInfo(preset) {
  const c = preset.chain, g = preset.ring, k = preset.connector, h = preset.hook;
  const n = Math.max(2, Math.round(c.length / c.pitch));
  const chainLen = (c.length / n) * n;
  const hang = chainLen + (k.diameter - k.thickness) + g.diameter - g.thickness / 2; // アーム〜リング下端
  const thick = (preset.board.height ?? REF_BOARD_TOP) - REF_BOARD_TOP;   // 標準より厚いぶん、板の上面が近くなる
  return {
    gapAtHome: preset.field.armHeight - thick - hang - h.height,   // 待機中：リング下端 − フック頂点
    bottomAtStop: preset.arm.dropLimit - thick - hang              // 下がりきったとき：リング下端の板からの高さ（負＝たるみ）
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

  const [RAPIER, THREE, sceneMod, debugMod, soundMod, prizeMod, progressMod, screensMod, itemsMod, presetJson, stageJson] = await Promise.all([
    import(LIB.rapier).then(m => m.default || m),
    import(LIB.three),
    import('./render/scene.js'),
    import('./ui/debug.js'),
    import('./audio/sound.js'),
    import('./game/prizes.js'),
    import('./game/progress.js'),
    import('./ui/screens.js'),
    import('./game/items.js'),
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
  // 特訓モード：好きな設定で遊ぶ。クレジットを使わず、取った景品はマイボックスに入らない（ステージも進まない）
  let training = false;
  const debug = debugMod.createDebugPanel(document.getElementById('debug'), stagePreset(basePreset, stages, progress.stage), () => restart(true), heightInfo,
    // 最初の状態に戻す（テスト用）：進み具合・特訓の「NEW」を消し、クレジット無制限をオフにして読み込み直す
    //   テーマ・音のオンオフ・特訓の設定は残す
    () => {
      try {
        localStorage.removeItem('crane.progress.v1');
        localStorage.removeItem('crane.trainingSeen.v1');
        localStorage.setItem('crane.debug.unlimited', '0');
      } catch { /* 保存できない環境 */ }
      location.reload();
    },
    { dev: DEV_MODE, stageName: () => `STAGE ${progress.stage + 1}`, isTraining: () => training, setTraining: on => { training = on; updatePrizeBadge(); if (round) { setStatus(); showStageLabel(); } } });
  // 「特訓」ボタン：全コンプリートで開放（開発中は常に表示）
  const btnDebug = document.getElementById('btnDebug');
  // 開放されてまだ押していないときは、光らせて「NEW」を付ける
  const TRAINING_SEEN_KEY = 'crane.trainingSeen.v1';
  let trainingSeen = false;
  try { trainingSeen = localStorage.getItem(TRAINING_SEEN_KEY) === '1'; } catch { /* 保存できない環境 */ }
  function showTrainingButton() {
    btnDebug.hidden = !(DEV_MODE || progress.trainingUnlocked);
    btnDebug.classList.toggle('is-new', progress.trainingUnlocked && !trainingSeen);
  }
  btnDebug.addEventListener('click', () => {
    if (trainingSeen || !progress.trainingUnlocked) return;
    trainingSeen = true;
    try { localStorage.setItem(TRAINING_SEEN_KEY, '1'); } catch { /* 保存できない環境 */ }
    showTrainingButton();
  });
  showTrainingButton();
  // 新しいステージで始める（景品も新しく引く）
  function goStage(i) {
    progress.goStage(i);
    debug.setBase(stagePreset(basePreset, stages, progress.stage));
    restart(false);
  }
  await prizeMod.loadPrizeImages();   // 景品の画像（あるものだけ）
  // 景品パネルの商品名のフォントを読み込んでおく（最大3秒。間に合わなければ普通のフォントで描く）
  try {
    await Promise.race([
      document.fonts.load(`800 76px ${PANEL_FONT}`, prizeMod.ALL_ITEMS.map(it => it.name).join('')),
      new Promise(r => setTimeout(r, 3000))
    ]);
  } catch { /* フォントが使えない環境 */ }
  const view = sceneMod.createScene(THREE, document.getElementById('view'));
  const screens = screensMod.createScreens({
    progress, onPickStage: i => goStage(i),
    canUseReady: () => canUseItems(),
    onUseItem: (id, arg) => useItem(id, arg),
    sfx: (name, arg) => sound.sfx(name, arg)
  });

  // ---- 景品 ----
  // ステージの★レベルの品からランダムで1つ。はずれて続けている間・「最初から」では変わらない
  let prize = null;
  let pendingFilter = null;   // 獲得の結果画面で使った景品の券：次のステージの景品に使う
  // filter：選べる景品をしぼる（カテゴリー指定券・未所持確定券）
  // 券を使っていなければ、このステージで保存してある景品を出す（再起動やスキップしてから戻っても変わらない）
  function newPrize(filter) {
    if (!filter && pendingFilter) filter = pendingFilter;
    pendingFilter = null;
    const stars = stageStars(stages, progress.stage);
    const kept = !filter && prizeMod.findItem(progress.savedPrize());
    if (kept && kept.rarity === stars) prize = kept;
    else {
      prize = prizeMod.drawPrize(stars, Math.random, filter);
      progress.setPrize(prize.id);
    }
    view.setPrizePanel(prizePanelCanvas(prize), debug.currentPreset().field);
    view.setPrizeBoxArt(prizeBoxArt(prize));
    updatePrizeBadge();
  }
  // 「未獲得!!」シール：今の景品がマイボックスにまだ無いときだけ（特訓モードでは出さない）
  function updatePrizeBadge() {
    view.setPrizeBadge(!!prize && !training && progress.count(prize.id) === 0);
  }
  // 景品の箱（幅5×高さ7）の正面の絵：上の帯にカテゴリーと★、真ん中に景品、下に名前
  function prizeBoxArt(it) {
    const W = 250, H = 350;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cat = prizeMod.findCategory(it.cat);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = cat.color; g.fillRect(0, 0, W, 50); g.fillRect(0, H - 70, W, 70);
    g.fillStyle = '#ffd166'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★'.repeat(it.rarity), W / 2, 27);
    g.save(); g.translate(15, 62); prizeMod.paintPrize(g, it, 220); g.restore();
    g.fillStyle = '#1f2533'; g.font = 'bold 30px sans-serif';
    g.fillText(it.name, W / 2, H - 35, W - 16);
    return { front: c, side: cat.color };
  }
  // 文字が maxW に収まるまでフォントを小さくする（最初は size px）
  function fitFont(g, text, size, weight, family, maxW) {
    for (let px = size; px >= 24; px -= 2) {
      g.font = `${weight} ${px}px ${family}`;
      if (g.measureText(text).width <= maxW) return;
    }
  }
  // パネル（横30cm×縦28cm）と同じ縦横比の絵：上の帯にカテゴリーと★、真ん中に大きく景品、下に景品名
  function prizePanelCanvas(it) {
    if (theme === 'cool') return prizePanelCool(it);
    const royal = theme === 'royal';   // フック王：えんじ色の帯に金色の文字、金色のふち
    const W = 900, H = 840;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cat = prizeMod.findCategory(it.cat);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, cat.color);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = royal ? '#5c0b16' : cat.color; g.fillRect(0, 0, W, 90);
    if (royal) { g.strokeStyle = '#d9a53a'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10); g.fillStyle = '#d9a53a'; g.fillRect(0, 86, W, 6); }
    g.fillStyle = '#fff'; g.font = 'bold 52px sans-serif'; g.textBaseline = 'middle';
    // カテゴリー名は中央（左上は「未獲得!!」シールの場所）。右の★にかかるときは文字を小さくする
    const starsL = W - 26 - g.measureText('★'.repeat(it.rarity)).width;
    g.textAlign = 'right'; g.fillStyle = royal ? '#f3c64a' : '#ffd166'; g.fillText('★'.repeat(it.rarity), W - 26, 47);
    g.fillStyle = royal ? '#f6dc8e' : '#fff'; g.textAlign = 'center';
    fitFont(g, cat.name, 52, 'bold', 'sans-serif', 2 * (starsL - 16 - W / 2));
    g.fillText(cat.name, W / 2, 47);
    // 画像の余白を切り落として、カテゴリー帯の下いっぱいに出す（品名は出さない。マイボックスと結果画面で出す）
    prizeMod.paintPrizeFit(g, it, 30, 105, W - 60, H - 125);
    return c;
  }
  // クールの景品パネル：紺色の六角形（ハニカム）模様、青く光るふち、白い商品名に青いふち取り
  function prizePanelCool(it) {
    const W = 900, H = 840;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const cat = prizeMod.findCategory(it.cat);
    const bg = g.createRadialGradient(W / 2, H * 0.45, 50, W / 2, H / 2, W * 0.75);
    bg.addColorStop(0, '#123a7a'); bg.addColorStop(1, '#050d22');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 六角形の模様
    g.strokeStyle = 'rgba(80,150,255,0.18)'; g.lineWidth = 3;
    const r = 26, hw = r * Math.sqrt(3);
    for (let row = -1, y = 0; y < H + r; row++, y = row * r * 1.5) {
      for (let x = (row % 2 ? hw / 2 : 0) - hw; x < W + hw; x += hw) {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        g.closePath(); g.stroke();
      }
    }
    // 青く光るふち
    g.save(); g.shadowColor = '#2fb8ff'; g.shadowBlur = 30; g.strokeStyle = '#5fd0ff'; g.lineWidth = 14;
    g.strokeRect(14, 14, W - 28, H - 28); g.restore();
    // 上の見出し
    g.font = `800 50px ${PANEL_FONT}, sans-serif`; g.textBaseline = 'middle';
    // カテゴリー名は中央（左上は「未獲得!!」シールの場所）。右の★にかかるときは文字を小さくする
    const starsL = W - 46 - g.measureText('★'.repeat(it.rarity)).width;
    g.textAlign = 'right'; g.fillStyle = '#5fd0ff'; g.fillText('★'.repeat(it.rarity), W - 46, 78);
    g.fillStyle = '#9fdcff'; g.textAlign = 'center';
    fitFont(g, `// ${cat.name} //`, 50, '800', `${PANEL_FONT}, sans-serif`, 2 * (starsL - 16 - W / 2));
    g.fillText(`// ${cat.name} //`, W / 2, 78);
    // 画像の余白を切り落として、カテゴリー帯の下いっぱいに出す（品名は出さない。マイボックスと結果画面で出す）
    prizeMod.paintPrizeFit(g, it, 50, 120, W - 100, H - 160);
    return c;
  }

  // ---- 見た目のテーマ（キュート／クール）----
  // 画面（CSS の body のクラス）と、景品パネル・箱の絵を切り替える。選んだテーマは保存して次も使う
  const THEME_KEY = 'crane.theme.v1';
  let theme = 'royal';   // 初めて起動したときはフック王
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'cool' || t === 'cute') theme = t; } catch { /* 保存できない環境 */ }
  function applyTheme(t, redraw) {
    theme = t;
    document.body.classList.toggle('theme-cool', t === 'cool');
    document.body.classList.toggle('theme-cute', t === 'cute');
    document.body.classList.toggle('theme-royal', t === 'royal');
    for (const b of document.querySelectorAll('#themeToggle button')) b.classList.toggle('on', b.dataset.theme === t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* 保存できない環境 */ }
    view.setTheme(t);   // 背景・筐体・床
    if (redraw && prize) view.setPrizePanel(prizePanelCanvas(prize), debug.currentPreset().field);
  }
  for (const b of document.querySelectorAll('#themeToggle button')) b.addEventListener('click', () => applyTheme(b.dataset.theme, true));
  applyTheme(theme, false);

  // ---- クレジット ----
  // 1回のプレイ（はずれ後に続ける場合も）で1クレジット。①を押したときに使う
  let paid = false;          // このプレイの分はもう使ったか
  const hud = document.getElementById('hud');
  // 次の回復までの残り時間（10以上・無制限のときは出さない）
  function regenText(unl) {
    const ms = unl ? null : progress.regenRemain;
    if (ms == null) return '';
    const s = Math.ceil(ms / 1000);
    return ` <small class="hud-r">あと ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</small>`;
  }
  setInterval(() => { if (round) showHud(); }, 1000);   // 残り時間と回復を1秒ごとに表示しなおす
  // マイボックスのボタンに、まだ開けていないカードパックの数のバッジ
  const btnBoxEl = document.getElementById('btnBox');
  function showBoxBadge() {
    const n = progress.packs;
    if (n > 0) btnBoxEl.dataset.badge = n; else delete btnBoxEl.dataset.badge;
  }
  function showHud() {
    showBoxBadge();
    const unl = debug.unlimited;
    hud.innerHTML = `
      ${training ? '<span class="hud-c">特訓モード：クレジット不要</span>' : `<span class="hud-c">クレジット <b>${unl ? '∞' : progress.credits}</b>${regenText(unl)}</span>`}
      <span class="hud-p"><b>${progress.points}</b>pt</span>
      ${effectChips()}`;
  }
  // 使用中のアイテム（リトライ券・強化）を小さく表示
  function effectChips() {
    const out = [];
    if (progress.retryArmed) out.push(itemsMod.iconTag(itemsMod.findItemDef('retry'), 'it-hud'));
    for (const it of itemsMod.ITEMS.filter(x => x.boost)) {
      const r = progress.boostRemain(it.id);
      if (r > 0) out.push(`${itemsMod.iconTag(it, 'it-hud')}${Math.ceil(r / 3600000)}h`);
    }
    return out.length ? `<span class="hud-e">${out.join(' ')}</span>` : '';
  }

  // ---- アイテムを使う（マイボックスから）----
  // 景品やステージが変わる券は、プレイ中（①を押してから結果が出るまで）以外ならいつでも使える
  //   はずれの結果画面・初期位置へ戻っている間：今の景品がその場で変わる（次のプレイから）
  //   獲得の結果画面：次のステージの景品に使う（予約）
  function canUseItems() { return !!round && (!paid || round.arm.phase === PHASE.DONE); }
  // 戻り値 { ok, msg, close }（close：画面を閉じてゲームに戻る）
  function useItem(id, arg) {
    const def = itemsMod.findItemDef(id);
    if (training && def.when === 'ready') return { ok: false, msg: '特訓モード中は使えません' };
    if (def.when === 'ready' && !canUseItems()) return { ok: false, msg: 'プレイ中は使えません' };
    const nextStage = round.arm.phase === PHASE.DONE && round.result === 'win';   // 獲得の結果画面（ステージはもう次に進めてある）
    const stars = stageStars(stages, progress.stage);
    if ((id === 'catPick' || id === 'newPick') && nextStage && pendingFilter) return { ok: false, msg: '次のステージ用の券はもう使っています' };
    if (id === 'catPick') {
      const filter = it => it.cat === arg;
      if (!prizeMod.ITEMS.some(it => it.rarity === stars && filter(it))) return { ok: false, msg: 'そのカテゴリーにはこの★の景品がありません' };
      progress.useItem(id);
      if (nextStage) { pendingFilter = filter; return { ok: true, msg: 'カテゴリー指定券：次のステージの景品に使われます' }; }
      newPrize(filter);
      showHud();
      return { ok: true, close: true };
    }
    if (id === 'newPick') {
      const unowned = prizeMod.ITEMS.filter(it => it.rarity === stars && progress.count(it.id) === 0);
      if (!unowned.length) return { ok: false, msg: `${nextStage ? '次のステージの' : 'この'}★の景品はすべて持っています` };
      progress.useItem(id);
      if (nextStage) { pendingFilter = it => progress.count(it.id) === 0; return { ok: true, msg: '未所持確定券：次のステージの景品に使われます' }; }
      // 今の景品と同じカテゴリーに未所持があれば、そちらを優先
      const sameCat = unowned.some(it => it.cat === prize.cat);
      newPrize(it => progress.count(it.id) === 0 && (!sameCat || it.cat === prize.cat));
      showHud();
      return { ok: true, close: true };
    }
    if (id === 'skip') {
      progress.useItem(id);
      progress.skipStage();
      goStage(progress.stage);
      return { ok: true, close: true };
    }
    // クレジット＋10：クレジットが0のときだけ使える（残っているときに使うと上限で切られて損をするので）
    if (id === 'credit10' && progress.credits > 0) return { ok: false, msg: 'クレジットが0のときだけ使えます' };
    const before = progress.credits;
    if (!progress.useItem(id)) return { ok: false, msg: '持っていません' };
    showHud();
    const msg = {
      credit10: `クレジットが${progress.credits - before}増えました`,
      retry: 'リトライ券を使いました。次にはずれたらクレジットが戻ります',
      regenMax: '回復上限アップ：24時間、上限が15になります',
      regenFast: '回復の速さアップ：24時間、4分ごとに回復します'
    }[id];
    return { ok: true, msg };
  }
  // ①を押したとき：まだ払っていなければクレジットを使う。足りなければ広告の案内
  function startPlay() {
    if (paid) return true;
    if (!training && !progress.useCredit(debug.unlimited)) {   // 特訓モードはクレジットを使わない
      screens.showNoCredit(() => showHud());
      return false;
    }
    paid = true;
    showHud();
    return true;
  }

  // ---- 音（BGM・効果音）----
  const sound = soundMod.createSound();
  titleDone.then(() => sound.loadBgm('./assets/music/bgm.json'));   // ゲームのBGMはトップ画面を閉じてから
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
  // normal：ずっと正面 / front（正面ズーム）・zoom（斜めズーム）：移動中は正面、下降が始まったらフック付近の拡大に切り替え、
  //   上昇が始まったら正面へ戻す。front は正面と同じ向きのまま拡大、zoom は斜めから拡大
  const CAM_KEY = 'crane.cameraMode.v1';
  const CAM_MODES = ['normal', 'front', 'zoom'];
  let camMode = 'normal';
  try { const m = localStorage.getItem(CAM_KEY); if (CAM_MODES.includes(m)) camMode = m; } catch { /* 保存できない環境 */ }
  const ZOOM_DELAY = 1.0;   // 下降が始まってから拡大に切り替えるまで（秒）
  const ZOOM_MOVE = 0.8;    // 切り替えにかける時間（秒）
  const UNZOOM_MOVE = 1.5;  // 引きに戻るときにかける時間（秒）。寄るときよりゆっくり
  const UNZOOM_DELAY = 1.5; // 上昇が始まってから正面へ戻すまで（秒）
  let zoomAt = null;        // 拡大に切り替える予定時刻（performance.now の値）
  let zoomed = false;
  let unzoomAt = null;      // 正面へ戻す予定時刻
  function applyCamera(duration = 0) {
    const zoomNow = camMode !== 'normal' && zoomed;
    view.setView(!zoomNow ? 'front' : camMode === 'front' ? 'zoomFront' : 'zoom', duration);
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === camMode));
  }
  // 確認用ズーム：①を押す前だけ、筐体の画面を押している間、斜めからフック（口の向き）を見られる。離すと戻る
  let peek = false;
  function setPeek(on) {
    if (peek === on) return;
    peek = on;
    if (on) view.setView('zoom', 0.5); else applyCamera(0.5);
  }
  function setCamMode(mode) {
    camMode = mode;
    try { localStorage.setItem(CAM_KEY, mode); } catch { /* 保存できない環境 */ }
    peek = false;
    applyCamera(0.5);
  }

  function showStageLabel() {
    stageLabel.textContent = training ? '特訓モード' : `STAGE ${progress.stage + 1}${progress.isCleared(progress.stage) ? ' ✓' : ''}`;
  }
  // keepPrize：true＝同じ景品のまま作り直す（「最初から」・調整の適用）
  function restart(keepPrize = true) {
    if (!keepPrize || !prize) newPrize();
    round = buildRound(RAPIER, debug.currentPreset());
    round.onPhase = onPhase;
    view.setRound(round);
    showStageLabel();
    paid = false;
    acc = 0;
    showResult(null);
    setStatus();
    zoomAt = null;
    unzoomAt = null;
    zoomed = false;
    peek = false;
    applyCamera();
  }

  // 「もう一度」：失敗なら続けて（初期位置へ戻る）、獲得なら次のステージへ（獲得時にもう進めてある）
  function again() {
    if (round && round.result === 'win') {
      if (training) restart(true);   // 特訓モード：同じ設定・同じ景品でもう一度
      else goStage(progress.stage);
      return;
    }
    // はずれでも板が持ち上がっていた（リングが掛かったまま・網が傾いたまま）ときは、続けずに台を元に戻す（店員さんが直すイメージ）
    if (round && round.result === 'lose' && (round.machine.lifted() > 0.5 || round.shelf.thetaDeg > 1)) {
      restart(true);
      return;
    }
    if (round && round.result === 'lose') {
      paid = false;
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
  let refunded = false; // はずれでリトライ券が効いた
  function onPhase(next) {
    if (next === PHASE.DONE) {
      refunded = !training && round.result !== 'win' && paid && !debug.unlimited && progress.refundRetry();
      if (training) lastWin = round.result === 'win' ? { training: true, item: prize } : null;   // 特訓モード：記録しない
      else if (round.result === 'win') {
        const played = progress.stage;
        const got = progress.addPrize(prize.id);
        progress.setPrize(null);   // 獲得したら、このステージの保存は消す（選び直したら新しく引く）
        updatePrizeBadge();
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
    ticker.hidden = ph !== PHASE.READY;   // 下の帯は①を押す前だけ
    if (peek && ph !== PHASE.READY) setPeek(false);
    showHud();
  }

  // ---- 入力（ボタン＋キーボード）----
  const btnX = document.getElementById('btnX');
  const btnZ = document.getElementById('btnZ');
  // 筐体の画面を押している間だけ確認用ズーム（①を押す前だけ）
  const viewEl = document.getElementById('view');
  const ticker = document.getElementById('ticker');
  viewEl.addEventListener('pointerdown', e => {
    if (round.arm.phase !== PHASE.READY || !resultEl.hidden) return;
    try { viewEl.setPointerCapture(e.pointerId); } catch { /* 取れない環境 */ }
    setPeek(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) viewEl.addEventListener(ev, () => setPeek(false));
  viewEl.addEventListener('contextmenu', e => e.preventDefault());
  document.getElementById('btnShop').addEventListener('click', () => screens.showShop());
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
    if (e.key === '3' || e.key === ' ') { setCamMode(CAM_MODES[(CAM_MODES.indexOf(camMode) + 1) % CAM_MODES.length]); e.preventDefault(); }
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
    // 下降した地点（フックの先からのずれ。画面で見た向き：右／左、奥／手前）
    const d = r.dropOffset;
    const lr = v => Math.abs(v) < 0.05 ? 'ちょうど' : `${v > 0 ? '右' : '左'}に${Math.abs(v).toFixed(1)}cm`;
    const fb = v => Math.abs(v) < 0.05 ? 'ちょうど' : `${v > 0 ? '手前' : '奥'}に${Math.abs(v).toFixed(1)}cm`;
    const dropText = !d ? '—' : `左右：${lr(d.dx)}　前後：${fb(d.dz)}`;
    const sec = v => v == null ? '—' : `${v.toFixed(2)}秒`;
    const w = r.result === 'win' ? lastWin : null;
    const title = !w ? '残念！' : w.training ? '特訓モード：獲得！' : w.wrapped ? '全ステージクリア！' : `STAGE ${w.played + 1} クリア！`;
    const btn = !w || w.training ? 'もう一度' : w.wrapped ? 'ステージ1から' : '次のステージへ';
    const prizeRow = !w ? '' : w.training ? `
      <div class="res-prize">
        <div class="res-pic"></div>
        <div><b>${w.item.name}</b><br>特訓モードなので、マイボックスには入りません</div>
      </div>` : `
      <div class="res-prize">
        <div class="res-pic"></div>
        <div><b>${w.item.name}</b> <span class="stars">${'★'.repeat(w.item.rarity)}</span><br>
        ${w.isNew ? '<span class="res-new">NEW！ マイボックスに入りました</span>' : `ダブり：<b>＋${w.points}pt</b>`}
        ${w.completedCat ? `<br><span class="res-new">${w.completedCat.name} コンプリート！ カードパック＋1</span>` : ''}
        ${w.allComplete ? `<br><span class="res-new">全コンプリート！${w.trainingNew ? ' 特訓モードが開放されました（右上の「特訓」）。' : ''}${w.nextRound != null ? `ラウンド${w.nextRound + 1}に進みます` : '次のラウンドの景品を選べます'}</span>` : ''}</div>
      </div>`;
    const refundRow = refunded ? '<div class="res-row res-new">🔁 リトライ券：クレジットが1戻りました</div>' : '';
    resultEl.innerHTML = `
      <div class="res-title ${r.result}">${title}</div>
      ${prizeRow}
      ${refundRow}
      <div class="res-row">下降した地点（フックの先から）：${dropText}</div>
      <div class="res-row">① 押していた時間：${sec(r.press.x)}</div>
      <div class="res-row">② 押していた時間：${sec(r.press.z)}</div>
      <div class="res-btns"><button id="btnAgain" class="big">${btn}</button>${w || training ? '' : '<button id="btnSkip">別のステージへ</button>'}</div>`;
    resultEl.hidden = false;
    if (w) resultEl.querySelector('.res-pic').appendChild(screens.prizeCanvas(w.item, 56));
    document.getElementById('btnAgain').addEventListener('click', again);
    const skip = document.getElementById('btnSkip');
    if (skip) skip.addEventListener('click', () => { progress.skipStage(); goStage(progress.stage); });
    if (w && w.completedCat) setTimeout(() => showComplete(w), 1300);   // 獲得の音のあとにお祝い
  }

  // コンプリートのお祝い（全コンプリートなら特訓モードの開放・次のラウンドへ）
  const PACK_ICON = '<img class="cel-pack" src="./assets/items/card_pack.webp" alt="">';
  function showComplete(w) {
    const pack = { icon: PACK_ICON, title: 'カードパック ×1', text: `${w.completedCat.name}のコンプリート報酬。マイボックスの「アイテム」から開けられます` };
    if (w.allComplete) {
      sound.sfx('grand');
      const rewards = [pack];
      if (w.trainingNew) rewards.push({ icon: '🎯', title: '特訓モード 開放', text: '右上の「特訓」ボタンから、好きな設定で遊べます' });
      celebrate({
        kind: 'grand', theme, label: 'ALL CATEGORIES', title: 'COMPLETE', sub: '全コンプリート おめでとう！',
        rewards,
        note: w.nextRound != null
          ? `ラウンド${w.nextRound + 1}に進みます（ポイント・アイテムはそのまま）`
          : '次のラウンドの景品を選べます（ポイント・アイテムはそのまま）',
        onClose: () => { showTrainingButton(); if (progress.roundPickPending) showRoundPick(); }
      });
      return;
    }
    const done = prizeMod.CATEGORIES.filter(c => c.items.every(it => progress.count(it.id) > 0)).length;
    sound.sfx('complete');
    celebrate({
      kind: 'cat', theme, label: w.completedCat.name, title: 'COMPLETE', sub: `${w.completedCat.name} コンプリート！`,
      rewards: [pack], note: `全コンプリートまで あと${prizeMod.CATEGORIES.length - done}カテゴリー`
    });
  }

  // 次のラウンドを選ぶ画面（選ぶまで閉じられない）。選んだらマイボックスはそのラウンド用になり、景品を引き直す
  function showRoundPick() {
    screens.showRoundPick(i => {
      progress.startRound(i);
      newPrize();
      updatePrizeBadge();
    });
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
      if (camMode !== 'normal') applyCamera(ZOOM_MOVE);
    }
    // 上昇開始から UNZOOM_DELAY 秒たったら正面へ戻す
    if (unzoomAt !== null && now >= unzoomAt) {
      unzoomAt = null;
      zoomAt = null;
      if (zoomed) {
        zoomed = false;
        if (camMode !== 'normal') applyCamera(UNZOOM_MOVE);
      }
    }
    view.setGuide(debug.guide);
    // 物理の刻みの途中を補って描く（停止後は最新の状態をそのまま描く）
    view.render(running ? acc / STEP : 1);
    requestAnimationFrame(frame);
  }

  restart(false);
  if (progress.roundPickPending) showRoundPick();   // 選ぶ前にアプリを閉じていたとき
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
