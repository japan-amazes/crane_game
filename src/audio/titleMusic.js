// =============================================================
// トップ画面の曲（assets/music/title.m4a）
// 曲：Majestic Brass Fanfare（Luis_Humanoide／Pixabay Content License：クレジット表記は不要）
// ・アプリ版：開いたらすぐ流れる（Capacitor は画面に触れなくても音を出せる設定）
// ・Web版：音は画面に触れるまで出せないので、START 以外のところを押したら流れ始める
// ・曲が終わったら少し間を空けて頭から繰り返す
// ・START を押したら、だんだん小さくして止める（そのあとはゲームのBGM）
// ・BGM をオフにしているときは流さない
// =============================================================
const SRC = './assets/music/title.m4a';
const VOLUME = 0.7;
const LOOP_GAP = 1.0;     // 曲が終わってから頭に戻るまでの間（秒）。曲の前後の無音と合わせて約1.5秒空く
const FADE_OUT = 1.0;     // START を押してから消えるまで（秒）

export function startTitleMusic(titleEl, startBtn) {
  let bgmOn = true, bgmVol = 1;   // 設定画面の BGM のオン・オフと音量
  try {
    const st = JSON.parse(localStorage.getItem('crane.sound.v1') || '{}');
    bgmOn = st.bgm !== false;
    if (Number.isFinite(st.bgmVol)) bgmVol = st.bgmVol;
  } catch { /* 保存できない環境 */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!bgmOn || !AC) return { stop() {} };

  const ctx = new AC();
  const gain = ctx.createGain();
  gain.gain.value = VOLUME * bgmVol;
  gain.connect(ctx.destination);
  let buffer = null, src = null, gapTimer = null, stopped = false;

  function play() {
    if (stopped || !buffer || src || ctx.state !== 'running') return;
    src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.onended = () => {
      src = null;
      if (!stopped) gapTimer = setTimeout(play, LOOP_GAP * 1000);
    };
    src.start();
  }
  // 音を出せる状態にして流す（アプリ版は触れなくても通る。Web版は画面に触れたときに通る）
  function tryStart() {
    if (stopped) return;
    const r = ctx.resume();
    if (r && r.then) r.then(play).catch(() => { /* 次に触れたときにやり直す */ });
    else play();
  }

  fetch(SRC)
    .then(r => r.arrayBuffer())
    .then(data => new Promise((ok, ng) => ctx.decodeAudioData(data, ok, ng)))
    .then(b => { buffer = b; tryStart(); })
    .catch(e => console.warn('トップ画面の曲を読み込めませんでした', e));

  // Web版：START 以外のところを押したら流し始める
  const onTap = e => { if (!startBtn.contains(e.target)) tryStart(); };
  titleEl.addEventListener('pointerup', onTap);
  titleEl.addEventListener('touchend', onTap, { passive: true });

  // 別のアプリに切り替えている間は止めておく
  const onVis = () => { if (stopped) return; if (document.hidden) ctx.suspend(); else tryStart(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    // START：だんだん小さくして止める
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(gapTimer);
      titleEl.removeEventListener('pointerup', onTap);
      titleEl.removeEventListener('touchend', onTap);
      document.removeEventListener('visibilitychange', onVis);
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime(0, t + FADE_OUT);
      setTimeout(() => { try { if (src) src.stop(); } catch { /* 止まっている */ } ctx.close(); }, FADE_OUT * 1000 + 100);
    }
  };
}
