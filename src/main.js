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
    },
    swingNow() { return measureSwing(round); }
  };

  arm.onPhase = (next) => {
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

  const [RAPIER, THREE, sceneMod, debugMod, presetJson] = await Promise.all([
    import(LIB.rapier).then(m => m.default || m),
    import(LIB.three),
    import('./render/scene.js'),
    import('./ui/debug.js'),
    fetch('./presets/hook-presets.json').then(r => r.json())
  ]);
  await RAPIER.init();

  const basePreset = presetJson.presets[0];
  const debug = debugMod.createDebugPanel(document.getElementById('debug'), basePreset, () => restart(), heightInfo);
  const view = sceneMod.createScene(THREE, document.getElementById('view'));

  let round = null;
  let acc = 0;
  let last = performance.now();

  // ---- カメラモード ----
  // normal：ずっと正面 / zoom：移動中は正面、下降が始まったらフック付近の拡大に切り替え
  const CAM_KEY = 'crane.cameraMode.v1';
  let camMode = 'normal';
  try { camMode = localStorage.getItem(CAM_KEY) === 'zoom' ? 'zoom' : 'normal'; } catch { /* 保存できない環境 */ }
  const ZOOM_PHASES = [PHASE.DESCEND, PHASE.HOLD, PHASE.ASCEND, PHASE.JUDGE, PHASE.DONE];
  function applyCamera() {
    const zoomNow = camMode === 'zoom' && round && ZOOM_PHASES.includes(round.arm.phase);
    view.setView(zoomNow ? 'zoom' : 'front');
    document.querySelectorAll('[data-cam]').forEach(b => b.classList.toggle('active', b.dataset.cam === camMode));
  }
  function setCamMode(mode) {
    camMode = mode;
    try { localStorage.setItem(CAM_KEY, mode); } catch { /* 保存できない環境 */ }
    applyCamera();
  }

  function restart() {
    round = buildRound(RAPIER, debug.currentPreset());
    round.onPhase = onPhase;
    view.setRound(round);
    acc = 0;
    showResult(null);
    setStatus();
    applyCamera();
  }

  function onPhase(next) {
    setStatus();
    if (next === PHASE.DESCEND) applyCamera();
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
      done: ''
    }[ph];
    status.textContent = msg;
    btnX.disabled = !(ph === PHASE.READY || ph === PHASE.MOVE_X);
    btnZ.disabled = !(ph === PHASE.WAIT_Z || ph === PHASE.STOP_X || ph === PHASE.MOVE_Z);
  }

  // ---- 入力（ボタン＋キーボード）----
  const btnX = document.getElementById('btnX');
  const btnZ = document.getElementById('btnZ');
  bindHold(btnX, on => round.arm.setInput('x', on));
  bindHold(btnZ, on => round.arm.setInput('z', on));
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
    resultEl.innerHTML = `
      <div class="res-title ${r.result}">${r.result === 'win' ? '獲得！' : 'はずれ'}</div>
      <div class="res-row">引き上げ直前：${hookText}</div>
      <div class="res-row">板の持ち上がり：${r.maxLift.toFixed(1)}cm</div>
      <div class="res-row">① 押した瞬間の揺れ：${sw(r.swing.x)}</div>
      <div class="res-row">② 押した瞬間の揺れ：${sw(r.swing.z)}</div>
      <button id="btnAgain" class="big">もう一度</button>`;
    resultEl.hidden = false;
    document.getElementById('btnAgain').addEventListener('click', restart);
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
