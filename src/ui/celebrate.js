// =============================================================
// お祝いの演出（コンプリートしたとき）
//   画面全体に、ゆっくり回る光・紙吹雪・タイトル・もらえたものを出す
//   kind：'grand'＝全コンプリート / 'cat'＝カテゴリー1つのコンプリート
//   rewards：[{ icon, title, text }]（icon は HTML）
// =============================================================

const PALETTE = {
  cute: ['#ff7eb6', '#ffd34d', '#ffffff', '#c9a7ff', '#ff4f9a', '#ffe9a8'],
  cool: ['#5fd0ff', '#ffffff', '#2f7bff', '#bfe9ff', '#9aa6b8', '#00e0ff'],
  royal: ['#f6dc8e', '#e0ad3c', '#ffffff', '#c41e34', '#fff2b8', '#8a1424']   // デフォルト：金・赤・白
};

export function celebrate({ kind = 'cat', theme = 'cute', label = '', title = 'COMPLETE', sub = '', rewards = [], note = '', button = 'OK', onClose }) {
  const th = theme === 'cool' || theme === 'royal' ? theme : 'cute';
  const root = document.createElement('div');
  root.className = `cel cel-${kind} cel-${th}`;
  root.innerHTML = `
    <div class="cel-bg"></div>
    <div class="cel-rays"></div>
    <canvas class="cel-fx"></canvas>
    <div class="cel-body">
      ${label ? `<div class="cel-label">${label}</div>` : ''}
      <div class="cel-title">${title}</div>
      ${sub ? `<div class="cel-sub">${sub}</div>` : ''}
      <div class="cel-rewards">${rewards.map((r, i) => `
        <div class="cel-reward" style="--d:${0.9 + i * 0.18}s">
          <div class="cel-ic">${r.icon}</div>
          <div class="cel-rt"><b>${r.title}</b><small>${r.text}</small></div>
        </div>`).join('')}</div>
      ${note ? `<div class="cel-note" style="--d:${1.1 + rewards.length * 0.18}s">${note}</div>` : ''}
      <button class="big cel-ok" style="--d:${1.3 + rewards.length * 0.18}s">${button}</button>
    </div>`;
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add('in'));

  const stop = confetti(root.querySelector('.cel-fx'), PALETTE[th], kind === 'grand' ? 2 : 1);
  root.querySelector('.cel-ok').addEventListener('click', () => {
    root.classList.remove('in');
    root.classList.add('out');
    setTimeout(() => { stop(); root.remove(); if (onClose) onClose(); }, 350);
  });
}

// 紙吹雪：下の左右（grand）か真ん中（cat）から打ち上げて、ひらひら落ちる
//   長方形とリボンを、裏表がひっくり返るように見せる（横幅を cos で縮める）
function confetti(canvas, colors, waves) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const g = canvas.getContext('2d');
  let W = 0, H = 0;
  const resize = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const parts = [];
  const burst = (x, y, n, dir) => {
    for (let i = 0; i < n; i++) {
      const ang = (-90 + dir * (12 + Math.random() * 38)) * Math.PI / 180;
      const sp = (0.55 + Math.random() * 0.6) * H * 1.55;
      parts.push({
        x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        w: 5 + Math.random() * 6, h: 9 + Math.random() * 9,
        ribbon: Math.random() < 0.22,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 9,
        flip: Math.random() * Math.PI * 2, vf: 6 + Math.random() * 8,
        sway: Math.random() * Math.PI * 2,
        c: colors[(Math.random() * colors.length) | 0]
      });
    }
  };
  const fire = () => {
    if (waves >= 2) { burst(W * 0.04, H * 1.02, 90, 1); burst(W * 0.96, H * 1.02, 90, -1); }
    else { burst(W * 0.5, H * 1.02, 45, 1); burst(W * 0.5, H * 1.02, 45, -1); }
  };
  fire();
  const second = waves >= 2 ? setTimeout(fire, 900) : null;

  let last = performance.now(), raf = 0, alive = true;
  const step = now => {
    if (!alive) return;
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    g.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      // 空気の抵抗：速いほど強く減速。落ちるときはゆっくり（ひらひら）
      p.vx *= Math.pow(0.12, dt);
      p.vy = p.vy * Math.pow(0.18, dt) + H * 1.1 * dt;
      if (p.vy > H * 0.22) p.vy = H * 0.22;
      p.sway += dt * 3;
      p.x += (p.vx + Math.sin(p.sway) * 22) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;
      if (p.y > H + 30) { parts.splice(i, 1); continue; }
      const sx = Math.cos(p.flip);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.scale(sx, 1);
      g.fillStyle = p.c;
      g.globalAlpha = 0.75 + 0.25 * Math.abs(sx);   // 裏返るときに少し暗く
      if (p.ribbon) {
        g.beginPath();
        g.moveTo(-p.w * 0.25, -p.h);
        g.quadraticCurveTo(p.w * 0.9, -p.h * 0.3, -p.w * 0.25, p.h * 0.2);
        g.quadraticCurveTo(-p.w * 1.1, p.h * 0.7, -p.w * 0.25, p.h * 1.2);
        g.lineWidth = 2.2; g.strokeStyle = p.c; g.stroke();
      } else {
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      g.restore();
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    if (second) clearTimeout(second);
    window.removeEventListener('resize', resize);
  };
}
