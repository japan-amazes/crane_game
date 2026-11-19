// =============================================================
// 音（BGM・効果音）
// 音声ファイルは使わず、ブラウザの音の機能（Web Audio）でファミコン風の音を作って鳴らす
// BGM は楽譜データ（assets/music/bgm.json）を読んで演奏する。形式は assets/music/README.md
// スマホは画面を一度タップするまで音を出せないため、最初の操作で鳴り始める
// （iPhone の Safari では「押した瞬間」では許可が下りず、「指を離したとき／タップ」で下りる。
//   そのため音の準備はタップの完了時に行い、無音を一瞬鳴らして音を出せる状態にする。鳴るまで操作のたびにやり直す）
// =============================================================

const STORE_KEY = 'crane.sound.v1';

// 音名 → 周波数（A4 = 440Hz）。例：C4, F#5, Bb3
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  let n = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + n;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 楽譜の1トラック（"C5:2 E5:2 -:4 ..."）を [{ step, len, note }] にする
export function parseTrack(text) {
  const out = [];
  let step = 0;
  for (const tok of String(text).trim().split(/\s+/)) {
    if (!tok || tok === '|') continue;            // | は小節の区切り（読みやすさ用、無視）
    const [note, lenStr] = tok.split(':');
    const len = Number(lenStr || 1);
    if (!(len > 0)) continue;
    if (note !== '-') out.push({ step, len, note });
    step += len;
  }
  return { events: out, total: step };
}

export function createSound() {
  let settings = { bgm: true, sfx: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch { /* 保存できない環境 */ }

  let ctx = null, master = null, bgmGain = null, sfxGain = null;
  const waves = {};
  let noiseBuf = null;
  let song = null;          // { stepSec, totalSteps, swing, swingUnit, tracks: [{ wave, volume, events }] }
  let playing = false;
  let timer = null;
  let nextStep = 0, nextTime = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.45; bgmGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
    // パルス波（デューティ比 12.5% / 25%）：ファミコンの矩形波の音色
    for (const [name, duty] of [['pulse12', 0.125], ['pulse25', 0.25]]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      waves[name] = ctx.createPeriodicWave(re, im);
    }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 音を出せる状態になったら BGM を始める
    ctx.addEventListener('statechange', () => { if (ctx.state === 'running') startBgm(); });
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
    return ctx;
  }

  // 1音を鳴らす（音色・周波数・開始時刻・長さ・音量・出力先）
  function tone(wave, freq, t, dur, vol, out, slideTo) {
    const o = ctx.createOscillator();
    if (waves[wave]) o.setPeriodicWave(waves[wave]); else o.type = wave === 'triangle' ? 'triangle' : wave === 'sine' ? 'sine' : 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    const rel = Math.min(0.04, dur * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.01);
  }

  // 打楽器（K＝バスドラ、S＝スネア、H＝ハイハット）
  function drum(kind, t, vol, out) {
    if (kind === 'K') { tone('sine', 150, t, 0.12, vol, out, 40); return; }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'H' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'H' ? 7000 : 1800;
    const g = ctx.createGain();
    const dur = kind === 'H' ? 0.04 : 0.12;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.01);
  }

  // ---- BGM ----
  function loadSong(json) {
    const stepsPerBeat = json.stepsPerBeat || 4;
    const stepSec = 60 / (json.bpm || 120) / stepsPerBeat;
    let totalSteps = 0;
    const tracks = (json.tracks || []).map(tr => {
      const { events, total } = parseTrack(tr.notes);
      totalSteps = Math.max(totalSteps, total);
      return { wave: tr.wave || 'pulse25', volume: tr.volume ?? 0.3, gate: tr.gate ?? 0.85, events };
    });
    // swing：跳ね具合（0＝跳ねない。0.33で3連符のシャッフル）。swingUnit マスごとの裏拍を遅らせる
    song = { stepSec, totalSteps, tracks, swing: json.swing || 0, swingUnit: json.swingUnit || 2 };
  }

  function schedule() {
    const ahead = ctx.currentTime + 0.25;
    while (nextTime < ahead) {
      const off = Math.floor(nextStep / song.swingUnit) % 2 === 1 ? song.swing * song.swingUnit * song.stepSec : 0;
      const at = nextTime + off;
      for (const tr of song.tracks) {
        for (const ev of tr.events) {
          if (ev.step !== nextStep) continue;
          const dur = ev.len * song.stepSec;
          if (tr.wave === 'noise') drum(ev.note, at, tr.volume, bgmGain);
          else {
            const f = noteFreq(ev.note);
            if (f) tone(tr.wave, f, at, dur * tr.gate, tr.volume, bgmGain);
          }
        }
      }
      nextTime += song.stepSec;
      nextStep = (nextStep + 1) % song.totalSteps;
    }
  }

  function startBgm() {
    if (playing || !song || !song.totalSteps || !settings.bgm || !ensure() || ctx.state !== 'running') return;
    playing = true;
    nextStep = 0;
    nextTime = ctx.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 50);
  }
  function stopBgm() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
  }

  // ---- 効果音 ----
  const SFX = {
    tap(t)     { tone('pulse25', 1320, t, 0.05, 0.25, sfxGain); },
    descend(t) { tone('pulse12', 880, t, 0.35, 0.18, sfxGain, 330); },
    ascend(t)  { tone('pulse12', 330, t, 0.35, 0.18, sfxGain, 880); },
    win(t) {
      // 華やかなファンファーレ：駆け上がり → 和音で伸ばす → キラキラ
      ['C5', 'F5', 'A5', 'C6', 'F6'].forEach((n, i) => tone('pulse25', noteFreq(n), t + i * 0.06, 0.06, 0.26, sfxGain));
      const h = t + 0.32;
      [['F5', 'pulse25', 0.24], ['A5', 'pulse12', 0.16], ['C6', 'pulse12', 0.14], ['F3', 'triangle', 0.4]]
        .forEach(([n, w, v]) => tone(w, noteFreq(n), h, 0.7, v, sfxGain));
      ['A6', 'C7', 'F7', 'C7', 'A6', 'C7', 'F7'].forEach((n, i) => tone('pulse12', noteFreq(n), h + 0.7 + i * 0.05, 0.05, 0.12, sfxGain));
      [['F5', 'pulse25', 0.24], ['C6', 'pulse12', 0.14], ['F2', 'triangle', 0.4]]
        .forEach(([n, w, v]) => tone(w, noteFreq(n), h + 1.05, 0.5, v, sfxGain));
    },
    // カテゴリーのコンプリート：駆け上がり → 明るい和音 → きらめき
    complete(t) {
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => tone('pulse25', noteFreq(n), t + i * 0.07, 0.08, 0.22, sfxGain));
      const h = t + 0.38;
      [['C6', 'pulse25', 0.2], ['E6', 'pulse12', 0.14], ['G6', 'pulse12', 0.12], ['C3', 'triangle', 0.4]]
        .forEach(([n, w, v]) => tone(w, noteFreq(n), h, 0.8, v, sfxGain));
      ['G6', 'C7', 'E7', 'G7', 'C8'].forEach((n, i) => tone('pulse12', noteFreq(n), h + 0.25 + i * 0.07, 0.07, 0.08, sfxGain));
    },
    // 全コンプリート：小太鼓の連打 → 3つの和音で盛り上げて → 長く伸ばしてきらめき
    grand(t) {
      for (let i = 0; i < 14; i++) drum('S', t + i * 0.045, 0.08 + i * 0.012, sfxGain);
      const a = t + 0.66;
      // メロディ（上）と和音・ベース
      [['G5', 0, 0.14], ['C6', 0.15, 0.14], ['E6', 0.3, 0.14], ['G6', 0.45, 0.42], ['E6', 0.9, 0.14], ['G6', 1.05, 0.14], ['A6', 1.2, 0.14], ['B6', 1.35, 0.14]]
        .forEach(([n, d, l]) => tone('pulse25', noteFreq(n), a + d, l, 0.22, sfxGain));
      [[0, ['C5', 'E5', 'G5'], 'C3', 0.85], [0.9, ['F5', 'A5', 'C6'], 'F3', 0.45], [1.35, ['G5', 'B5', 'D6'], 'G3', 0.15]]
        .forEach(([d, ch, b, l]) => {
          ch.forEach(n => tone('pulse12', noteFreq(n), a + d, l, 0.09, sfxGain));
          tone('triangle', noteFreq(b), a + d, l, 0.38, sfxGain);
        });
      const e = a + 1.5;
      drum('K', e, 0.5, sfxGain);
      [['C7', 'pulse25', 0.2], ['E6', 'pulse12', 0.12], ['G6', 'pulse12', 0.12], ['C6', 'pulse12', 0.1], ['C3', 'triangle', 0.4], ['C2', 'triangle', 0.3]]
        .forEach(([n, w, v]) => tone(w, noteFreq(n), e, 1.4, v, sfxGain));
      ['C7', 'E7', 'G7', 'C8', 'G7', 'E7', 'G7', 'C8'].forEach((n, i) => tone('pulse12', noteFreq(n), e + 0.3 + i * 0.08, 0.07, 0.07, sfxGain));
    },
    lose(t) {
      ['G4', 'E4', 'C4'].forEach((n, i) => tone('pulse25', noteFreq(n), t + i * 0.16, i === 2 ? 0.4 : 0.14, 0.25, sfxGain));
    }
  };
  function sfx(name) {
    if (!settings.sfx || !ctx || ctx.state !== 'running' || !SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01);
  }

  // 最初の操作で音を使えるようにする（スマホの決まり）
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'running') { startBgm(); return; }
    // 無音をごく短く鳴らす（iPhone で音を出せる状態にする定番の方法）
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = b; src.connect(ctx.destination); src.start(0);
    } catch { /* 無視 */ }
    const r = ctx.resume();
    if (r && r.then) r.then(() => { if (ctx.state === 'running') startBgm(); }).catch(() => { /* 次の操作でやり直す */ });
  }
  // タップの完了時（指を離したとき）・クリック・キー入力で準備する。押した瞬間（pointerdown）では行わない
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* 保存できない環境 */ } }

  return {
    settings,
    sfx,
    async loadBgm(url) {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        loadSong(await r.json());
        if (ctx && ctx.state === 'running') startBgm();
      } catch (e) { console.warn('BGMを読み込めませんでした', e); }
    },
    setBgm(on) { settings.bgm = on; save(); if (on) { unlock(); } else stopBgm(); },
    setSfx(on) { settings.sfx = on; save(); }
  };
}
