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

const LIB = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js',
  rapier: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/+esm'
};

// ---------------------------------------------------------------
// 1プレイ分の物理を組み立てる
// ---------------------------------------------------------------
export function buildRound(RAPIER, preset) {
  const world = createWorld(RAPIER);
  const table = createTable(RAPIER, world, preset);
  const machine = createHookMachine(RAPIER, world, preset);
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
    world, arm, chain, ring, machine, preset, chainDyn,
    swing: {},        // ①②を押した瞬間の揺れ
    hookRecord: null, // 引き上げ直前のフックとの位置関係
    result: null,     // 'win' | 'lose'
    maxLift: 0,
    visuals: [table.visual, machine.visual, arm.visual, ...chain.visuals, ring.visual],
    step() {
      arm.update(STEP);
      chainDyn.step(STEP);
      machine.dampHanging(ring, STEP, preset.board.hangDamping ?? 40);
      world.step();
      chain.update(STEP, arm.pos, ring.top(), machine);
      if (arm.phase === PHASE.ASCEND || arm.phase === PHASE.JUDGE) {
        round.maxLift = Math.max(round.maxLift, machine.lifted());
      }
      if (arm.phase === PHASE.ASCEND) earlyJudge();
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

  // 上がりきる前の判定（上昇開始から arm.judgeDelay 秒たってから）
  // はずれ：リングの一番下がフックの頂点より上に抜けていて、板も浮いていない（もう掛かりようがない）
  // 獲得：板が判定の高さ以上に浮いた状態が WIN_HOLD 秒以上続いている
  // どちらとも言えないときは判定を続け、上がりきったら今まで通り判定待ちのあと判定する
  const MISS_MARGIN = 0.5;  // cm
  const WIN_HOLD = 1.0;     // 秒
  let winTimer = 0;
  function earlyJudge() {
    const lift = machine.lifted();
    winTimer = lift >= preset.board.liftJudge ? winTimer + STEP : 0;
    if (arm.timer < (preset.arm.judgeDelay ?? 3)) return;
    if (winTimer >= WIN_HOLD) { arm.finish(); return; }
    if (lift > 0.3) return;
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
      round.result = machine.lifted() >= preset.board.liftJudge ? 'win' : 'lose';
    }
    if (round.onPhase) round.onPhase(next);
  };

  // 生成直後の揺れを落ち着かせる（1秒分）
  // （初期のねじれは残したまま、振り子の揺れだけ落ち着かせる）
  for (let i = 0; i < 240; i++) { world.step(); chain.update(STEP, arm.pos, ring.top(), machine); }
  return round;
}

// ステージの設定：基本設定に、そのステージの変更点（"arm.speedX": 8 のような形）を重ねる
export function stagePreset(base, stages, i) {
  const p = JSON.parse(JSON.stringify(base));
  const ovr = (stages[i] && stages[i].overrides) || {};
  for (const [path, v] of Object.entries(ovr)) {
    const ks = path.split('.');
    let o = p;
    for (const k of ks.slice(0, -1)) o = o[k];
    o[ks[ks.length - 1]] = v;
  }
  return p;
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

  const [RAPIER, THREE, sceneMod, debugMod, soundMod, presetJson, stageJson] = await Promise.all([
    import(LIB.rapier).then(m => m.default || m),
    import(LIB.three),
    import('./render/scene.js'),
    import('./ui/debug.js'),
    import('./audio/sound.js'),
    fetch('./presets/hook-presets.json').then(r => r.json()),
    fetch('./presets/stages.json').then(r => r.json())
  ]);
  await RAPIER.init();

  // ---- ステージ ----
  // ステージ1＝基本設定。以降は stages.json の変更点を基本設定に重ねる。獲得で次へ、はずれは同じステージで続ける
  const basePreset = presetJson.presets[0];
  const stages = stageJson.stages;
  const STAGE_KEY = 'crane.stage.v1';
  let stageNo = 0;          // 0始まり
  try { stageNo = Math.min(Math.max(0, Number(JSON.parse(localStorage.getItem(STAGE_KEY))?.stage) || 0), stages.length - 1); } catch { /* 保存できない環境 */ }
  const stageLabel = document.getElementById('stageLabel');
  function saveStage() { try { localStorage.setItem(STAGE_KEY, JSON.stringify({ stage: stageNo })); } catch { /* 保存できない環境 */ } }
  const debug = debugMod.createDebugPanel(document.getElementById('debug'), stagePreset(basePreset, stages, stageNo), () => restart(), heightInfo,
    () => goStage(0));
  function goStage(i) {
    stageNo = i;
    saveStage();
    debug.setBase(stagePreset(basePreset, stages, stageNo));
    restart();
  }
  const view = sceneMod.createScene(THREE, document.getElementById('view'));

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
  function setCamMode(mode) {
    camMode = mode;
    try { localStorage.setItem(CAM_KEY, mode); } catch { /* 保存できない環境 */ }
    applyCamera(0.5);
  }

  function restart() {
    round = buildRound(RAPIER, debug.currentPreset());
    round.onPhase = onPhase;
    view.setRound(round);
    stageLabel.textContent = `STAGE ${stageNo + 1}`;
    acc = 0;
    showResult(null);
    setStatus();
    zoomAt = null;
    unzoomAt = null;
    zoomed = false;
    applyCamera();
  }

  // 「もう一度」：失敗なら続けて（初期位置へ戻る）、獲得なら次のステージへ（最後なら1から）
  function again() {
    if (round && round.result === 'win') {
      goStage(stageNo + 1 < stages.length ? stageNo + 1 : 0);
      return;
    }
    if (round && round.result === 'lose') {
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

  function onPhase(next) {
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
  }

  // ---- 入力（ボタン＋キーボード）----
  const btnX = document.getElementById('btnX');
  const btnZ = document.getElementById('btnZ');
  bindHold(btnX, on => { if (on) sound.sfx('tap'); round.arm.setInput('x', on); });
  bindHold(btnZ, on => { if (on) sound.sfx('tap'); round.arm.setInput('z', on); });
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key === '1' || e.key === 'ArrowRight') round.arm.setInput('x', true);
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
  document.getElementById('btnRetry').addEventListener('click', restart);
  document.getElementById('btnDebug').addEventListener('click', () => debug.toggle());

  // ---- 結果表示 ----
  const resultEl = document.getElementById('result');
  function showResult(r) {
    if (!r) { resultEl.hidden = true; return; }
    const hk = r.hookRecord;
    const hookText = !hk ? '—' : hk.inside ? 'フックの内側' : `フックの外側 ${hk.distance.toFixed(1)}cm`;
    const sw = s => s ? `横${s.tiltX.toFixed(1)}° 奥${s.tiltZ.toFixed(1)}° 速さ${s.speed.toFixed(1)}cm/s` : '—';
    const last = stageNo + 1 >= stages.length;
    const title = r.result !== 'win' ? 'はずれ' : last ? '全ステージクリア！' : `STAGE ${stageNo + 1} クリア！`;
    const btn = r.result !== 'win' ? 'もう一度' : last ? 'ステージ1から' : '次のステージへ';
    resultEl.innerHTML = `
      <div class="res-title ${r.result}">${title}</div>
      <div class="res-row">引き上げ直前：${hookText}</div>
      <div class="res-row">板の持ち上がり：${r.maxLift.toFixed(1)}cm</div>
      <div class="res-row">① 押した瞬間の揺れ：${sw(r.swing.x)}</div>
      <div class="res-row">② 押した瞬間の揺れ：${sw(r.swing.z)}</div>
      <button id="btnAgain" class="big">${btn}</button>`;
    resultEl.hidden = false;
    document.getElementById('btnAgain').addEventListener('click', again);
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

  restart();
  requestAnimationFrame(frame);
}

function bindHold(el, cb) {
  const down = e => { e.preventDefault(); if (!el.disabled) { el.classList.add('on'); cb(true); } };
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
