// =============================================================
// 景品の絵（canvas 2D）
// 100×100 の座標で描く。濃淡（グラデーション）・ツヤ・影・縁取りで立体感を出す
// item.c（主な色）・item.c2（差し色）・item.label（ラベル文字）を使う
// =============================================================

const OUT = 'rgba(40,24,12,0.55)';   // 縁取りの色

export function paintArt(ctx, item) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  (ART[item.shape] || ART.gift)(ctx, item.c, item.c2, item);
}

// ---------------------------------------------------------------
// 色と道具
// ---------------------------------------------------------------
function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// amt：＋で明るく、−で暗く（−1〜1）
function shade(c, amt) {
  const [r, g, b] = hex(c);
  const f = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
// 丸みのある塗り：左上が明るく右下が暗い
function ball(ctx, x, y, r, c) {
  return rad(ctx, x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05, [[0, shade(c, 0.45)], [0.45, c], [1, shade(c, -0.45)]]);
}
// 円筒の横方向の濃淡
function cylFill(ctx, x0, x1, c) {
  return lin(ctx, x0, 0, x1, 0, [[0, shade(c, -0.45)], [0.22, shade(c, 0.15)], [0.38, shade(c, 0.4)], [0.6, c], [1, shade(c, -0.5)]]);
}
function fillStroke(ctx, path, fill, lw = 2, stroke = OUT) {
  ctx.fillStyle = fill; ctx.fill(path);
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(path); }
}
function P() { return new Path2D(); }
function ellipseP(x, y, rx, ry, rot = 0) { const p = P(); p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); return p; }
function rrectP(x, y, w, h, r) { const p = P(); p.roundRect(x, y, w, h, r); return p; }
function shadow(ctx, x, y, rx, ry) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, rx, [[0, 'rgba(0,0,0,0.32)'], [1, 'rgba(0,0,0,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function gloss(ctx, x, y, rx, ry, rot = 0, a = 0.6) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
  ctx.fillStyle = rad(ctx, 0, 0, 0, 0, 0, rx, [[0, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function streak(ctx, x, y, w, h, a = 0.5) {
  ctx.fillStyle = lin(ctx, x, 0, x + w, 0, [[0, 'rgba(255,255,255,0)'], [0.5, `rgba(255,255,255,${a})`], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(x, y, w, h);
}
function text(ctx, s, x, y, size, fill, stroke, maxW) {
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = size * 0.28; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y, maxW); }
  ctx.fillStyle = fill; ctx.fillText(s, x, y, maxW);
}
function leafAt(ctx, x, y, rot, len = 20, c = '#3cb043') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const p = P(); p.moveTo(0, 0); p.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); p.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  fillStroke(ctx, p, lin(ctx, 0, -len * 0.4, len, len * 0.3, [[0, shade(c, 0.4)], [1, shade(c, -0.3)]]), 1.2, shade(c, -0.6));
  ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.08, len * 0.92, 0);
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
  ctx.restore();
}
// 箱（斜め上から見た直方体）：正面・上面・側面
function box3(ctx, x, y, w, h, d, c, top = null, side = null) {
  const dx = d * 0.7, dy = d * 0.45;
  const front = rrectP(x, y, w, h, 2);
  const tp = P(); tp.moveTo(x, y); tp.lineTo(x + dx, y - dy); tp.lineTo(x + w + dx, y - dy); tp.lineTo(x + w, y); tp.closePath();
  const sd = P(); sd.moveTo(x + w, y); sd.lineTo(x + w + dx, y - dy); sd.lineTo(x + w + dx, y + h - dy); sd.lineTo(x + w, y + h); sd.closePath();
  fillStroke(ctx, sd, side || shade(c, -0.35), 1.6);
  fillStroke(ctx, tp, top || shade(c, 0.3), 1.6);
  fillStroke(ctx, front, lin(ctx, x, y, x + w, y + h, [[0, shade(c, 0.15)], [1, shade(c, -0.12)]]), 1.6);
  return { dx, dy };
}

// ---------------------------------------------------------------
// 形ごとの絵
// ---------------------------------------------------------------
const ART = {
  // ---- お菓子 ----
  bag(ctx, c, c2, it) {
    shadow(ctx, 50, 91, 30, 5);
    const body = P();
    body.moveTo(22, 20); body.quadraticCurveTo(16, 52, 22, 84); body.lineTo(78, 84); body.quadraticCurveTo(84, 52, 78, 20); body.closePath();
    fillStroke(ctx, body, lin(ctx, 16, 0, 84, 0, [[0, shade(c, -0.3)], [0.25, c], [0.55, shade(c, 0.35)], [1, shade(c, -0.35)]]));
    for (const [yIn, yEdge] of [[22, 12], [82, 92]]) {
      const p = P(); p.moveTo(22, yIn);
      for (let i = 0; i <= 14; i++) p.lineTo(22 + i * 4, yEdge + (i % 2 ? 0 : (yEdge < yIn ? 2 : -2)));
      p.lineTo(78, yIn); p.closePath();
      fillStroke(ctx, p, lin(ctx, 0, Math.min(yIn, yEdge), 0, Math.max(yIn, yEdge), [[0, shade(c, -0.1)], [1, shade(c, -0.4)]]));
      ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8;
      for (let x = 25; x < 77; x += 3) { ctx.beginPath(); ctx.moveTo(x, Math.min(yIn, yEdge) + 3); ctx.lineTo(x, Math.max(yIn, yEdge) - 3); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = lin(ctx, 0, 26, 0, 42, [[0, shade(c2, 0.2)], [1, shade(c2, -0.2)]]);
    ctx.beginPath(); ctx.moveTo(10, 30); ctx.quadraticCurveTo(50, 22, 90, 30); ctx.lineTo(90, 42); ctx.quadraticCurveTo(50, 34, 10, 42); ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, it.label || 'ポテト', 50, 35, 11, '#fff', shade(c2, -0.5));
    const win = ellipseP(50, 62, 20, 14);
    fillStroke(ctx, win, '#fff6d8', 2, c2);
    ctx.save(); ctx.clip(win);
    const chip = (x, y, r, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const p = P();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = r * (1 + 0.08 * Math.sin(i * 3)); p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.75); }
      p.closePath();
      fillStroke(ctx, p, rad(ctx, -r * 0.3, -r * 0.3, 1, 0, 0, r, [[0, '#fff1a8'], [0.7, '#f2c14e'], [1, '#c98b0a']]), 0.8, 'rgba(150,90,0,0.6)');
      ctx.restore();
    };
    chip(40, 66, 9, 0.4); chip(58, 68, 9, -0.3); chip(50, 58, 9, 0.1); chip(64, 58, 7, 0.8); chip(36, 56, 7, -0.6);
    ctx.restore();
    ctx.save(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(30, 46); ctx.quadraticCurveTo(28, 60, 31, 76); ctx.stroke(); ctx.restore();
    gloss(ctx, 30, 50, 5, 22, 0, 0.6);
  },

  bar(ctx, c, c2) {
    shadow(ctx, 52, 86, 34, 5);
    ctx.save(); ctx.translate(50, 52); ctx.rotate(-0.22);
    // 板チョコ本体（溝つき）
    const choc = rrectP(-34, -24, 68, 46, 4);
    fillStroke(ctx, choc, lin(ctx, -34, -24, 34, 22, [[0, shade(c, 0.25)], [1, shade(c, -0.35)]]));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const x = -31 + i * 16, y = -21 + j * 13;
      const p = rrectP(x, y, 14, 11, 2);
      fillStroke(ctx, p, lin(ctx, x, y, x + 14, y + 11, [[0, shade(c, 0.35)], [0.5, c], [1, shade(c, -0.3)]]), 1, shade(c, -0.6));
    }
    // 包み紙（下半分）
    const wrap = P(); wrap.moveTo(-36, 2); wrap.lineTo(36, -2); wrap.lineTo(36, 24); wrap.lineTo(-36, 24); wrap.closePath();
    fillStroke(ctx, wrap, lin(ctx, 0, -2, 0, 24, [[0, shade(c2, 0.2)], [1, shade(c2, -0.3)]]));
    ctx.beginPath(); ctx.moveTo(-36, 2); ctx.lineTo(36, -2); ctx.lineWidth = 2; ctx.strokeStyle = '#e8c35a'; ctx.stroke();
    text(ctx, 'CHOCOLATE', 0, 13, 9, '#fff', shade(c2, -0.6));
    streak(ctx, -30, -22, 6, 20, 0.35);
    ctx.restore();
  },

  cookie(ctx, c, c2) {
    shadow(ctx, 50, 88, 30, 5);
    const p = P();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, r = 30 + Math.sin(i * 2.7) * 1.4; p.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r); }
    p.closePath();
    fillStroke(ctx, p, ball(ctx, 50, 52, 32, c));
    ctx.save(); ctx.clip(p);
    for (let i = 0; i < 40; i++) { const a = i * 2.4, r = (i * 7.3) % 26; ctx.fillStyle = 'rgba(255,240,200,0.25)'; ctx.fillRect(50 + Math.cos(a) * r, 52 + Math.sin(a) * r, 1.2, 1.2); }
    ctx.restore();
    for (const [x, y, r] of [[38, 40, 4.5], [60, 42, 4], [48, 58, 5], [64, 62, 4], [34, 60, 3.5], [52, 32, 3.5], [70, 50, 3]]) {
      fillStroke(ctx, ellipseP(x, y, r, r * 0.85, x), ball(ctx, x, y, r, c2), 0.8, shade(c2, -0.5));
    }
    gloss(ctx, 38, 38, 10, 6, -0.5, 0.3);
  },

  candy(ctx, c, c2) {
    shadow(ctx, 50, 82, 32, 5);
    for (const s of [-1, 1]) {
      const p = P(); p.moveTo(50 + s * 18, 52); p.lineTo(50 + s * 40, 36); p.quadraticCurveTo(50 + s * 34, 52, 50 + s * 40, 68); p.closePath();
      fillStroke(ctx, p, lin(ctx, 50 + s * 18, 0, 50 + s * 40, 0, [[0, shade(c2, -0.1)], [1, shade(c2, 0.4)]]), 1.6);
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
      for (const dy of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(50 + s * 22, 52); ctx.lineTo(50 + s * 37, 52 + dy * 2); ctx.stroke(); }
      ctx.restore();
    }
    const b = ellipseP(50, 52, 22, 20);
    fillStroke(ctx, b, ball(ctx, 50, 52, 22, c));
    ctx.save(); ctx.clip(b); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 12, 30); ctx.quadraticCurveTo(50 + i * 12, 52, 30 + i * 12, 76); ctx.stroke(); }
    ctx.restore();
    gloss(ctx, 42, 43, 7, 5, -0.5, 0.8);
  },

  jar(ctx, c, c2) {
    shadow(ctx, 50, 90, 28, 5);
    // ふた
    const lid = rrectP(28, 14, 44, 12, 3);
    fillStroke(ctx, lid, cylFill(ctx, 28, 72, c2));
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.8; for (let x = 31; x < 70; x += 3) { ctx.beginPath(); ctx.moveTo(x, 16); ctx.lineTo(x, 24); ctx.stroke(); } ctx.restore();
    // ビン
    const jar = rrectP(22, 26, 56, 62, 12);
    fillStroke(ctx, jar, 'rgba(235,245,255,0.65)');
    ctx.save(); ctx.clip(jar);
    const cols = ['#ff4d6d', '#ffd23f', '#5fd068', '#3fb8ff', '#ff8fd1', '#ff9f1a'];
    let k = 0;
    for (let y = 84; y > 34; y -= 9) for (let x = 27 + (y % 2) * 4; x < 76; x += 10) {
      const col = cols[(k++ * 7) % cols.length];
      ctx.save(); ctx.translate(x, y); ctx.rotate(k);
      // くまの形のグミ
      const g = P(); g.arc(0, -3, 3, 0, Math.PI * 2); g.ellipse(0, 2, 4, 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = rad(ctx, -1.5, -2, 0.5, 0, 0, 6, [[0, shade(col, 0.5)], [1, shade(col, -0.25)]]); ctx.globalAlpha = 0.92; ctx.fill(g);
      ctx.restore();
    }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(80,110,140,0.6)'; ctx.stroke(jar);
    // ラベル
    const lab = rrectP(28, 50, 44, 18, 3);
    fillStroke(ctx, lab, lin(ctx, 0, 50, 0, 68, [[0, '#ffffff'], [1, '#ffe3ea']]), 1.2);
    text(ctx, 'GUMMY', 50, 59.5, 10, c2 === '#ffffff' ? '#ff4d6d' : shade(c2, -0.2), null);
    streak(ctx, 27, 30, 6, 54, 0.6);
  },

  senbei(ctx, c, c2) {
    shadow(ctx, 50, 88, 30, 5);
    const p = P();
    for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2, r = 30 + Math.sin(i * 3.3) * 1.2; p.lineTo(50 + Math.cos(a) * r, 52 + Math.sin(a) * r * 0.92); }
    p.closePath();
    fillStroke(ctx, p, rad(ctx, 42, 42, 2, 50, 52, 32, [[0, shade(c, 0.35)], [0.6, c], [0.85, shade(c, -0.25)], [1, shade(c, -0.5)]]));
    // しょうゆの照り・焦げ
    ctx.save(); ctx.clip(p);
    for (const [x, y, r] of [[38, 44, 6], [62, 40, 5], [64, 64, 7], [40, 66, 5], [52, 52, 4]]) {
      ctx.fillStyle = rad(ctx, x, y, 0, x, y, r, [[0, 'rgba(90,40,10,0.55)'], [1, 'rgba(90,40,10,0)']]); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // のり
    const nori = P(); nori.moveTo(40, 20); nori.lineTo(60, 21); nori.lineTo(62, 84); nori.lineTo(41, 83); nori.closePath();
    ctx.save(); ctx.clip(p);
    fillStroke(ctx, nori, lin(ctx, 40, 0, 62, 0, [[0, shade(c2, 0.15)], [0.5, shade(c2, 0.35)], [1, c2]]), 1.2, '#0b1a0b');
    ctx.restore();
    gloss(ctx, 36, 38, 10, 5, -0.6, 0.35);
  },

  donut(ctx, c, c2) {
    shadow(ctx, 50, 86, 32, 5);
    const ring = P(); ring.ellipse(50, 54, 32, 26, 0, 0, Math.PI * 2); ring.ellipse(50, 52, 10, 8, 0, 0, Math.PI * 2, true);
    ctx.fillStyle = ball(ctx, 50, 54, 32, c); ctx.fill(ring, 'evenodd'); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(ring);
    // アイシング（ふちが波打つ）
    const ic = P();
    for (let i = 0; i <= 36; i++) { const a = i / 36 * Math.PI * 2, r = 27 + Math.sin(i * 1.9) * 2.2; ic.lineTo(50 + Math.cos(a) * r, 51 + Math.sin(a) * r * 0.8); }
    ic.closePath(); ic.ellipse(50, 51, 12, 9.5, 0, 0, Math.PI * 2, true);
    ctx.fillStyle = ball(ctx, 50, 51, 28, c2); ctx.fill(ic, 'evenodd'); ctx.lineWidth = 1.2; ctx.strokeStyle = shade(c2, -0.4); ctx.stroke(ic);
    const cols = ['#ffffff', '#7ed957', '#5fd3e8', '#ffd93b', '#b36bff'];
    for (let i = 0; i < 22; i++) {
      const a = i * 0.9, r = 15 + (i * 5.1) % 9;
      ctx.save(); ctx.translate(50 + Math.cos(a) * r, 51 + Math.sin(a) * r * 0.8); ctx.rotate(i * 1.3);
      ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.roundRect(-2.6, -0.9, 5.2, 1.8, 0.9); ctx.fill(); ctx.restore();
    }
    gloss(ctx, 36, 40, 9, 4, -0.5, 0.6);
  },

  cake(ctx, c, c2) {
    shadow(ctx, 52, 86, 34, 5);
    // 皿
    fillStroke(ctx, ellipseP(50, 82, 38, 7), lin(ctx, 0, 76, 0, 88, [[0, '#ffffff'], [1, '#c9d3e0']]), 1.4);
    // 三角のショートケーキ（正面・側面・上面）
    const top = P(); top.moveTo(16, 40); top.lineTo(70, 30); top.lineTo(86, 44); top.lineTo(34, 52); top.closePath();
    const front = P(); front.moveTo(16, 40); front.lineTo(34, 52); front.lineTo(34, 80); front.lineTo(16, 70); front.closePath();
    const side = P(); side.moveTo(34, 52); side.lineTo(86, 44); side.lineTo(86, 72); side.lineTo(34, 80); side.closePath();
    fillStroke(ctx, side, lin(ctx, 34, 0, 86, 0, [[0, '#ffe9b8'], [1, '#e8c88a']]));
    // 断面：スポンジ／クリーム／いちご
    ctx.save(); ctx.clip(side);
    for (const y of [57, 66]) {
      ctx.fillStyle = '#fffaf2'; ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(86, y - 8); ctx.lineTo(86, y - 4); ctx.lineTo(34, y + 4); ctx.closePath(); ctx.fill();
      for (let x = 40; x < 84; x += 11) { ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(x, y + 2 - (x - 34) * 0.15, 3.5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(side);
    fillStroke(ctx, front, lin(ctx, 16, 0, 34, 0, [[0, '#f6f2ea'], [1, '#e2dccf']]), 1.6);
    fillStroke(ctx, top, lin(ctx, 16, 30, 86, 52, [[0, '#ffffff'], [1, '#f1ebe0']]), 1.6);
    // ホイップと いちご
    for (const [x, y] of [[30, 41], [44, 38], [58, 36], [72, 38]]) fillStroke(ctx, ellipseP(x, y, 5, 3.5), rad(ctx, x - 1, y - 1, 0.5, x, y, 5, [[0, '#ffffff'], [1, '#ece3d4']]), 1, 'rgba(120,100,80,0.4)');
    const sb = P(); sb.moveTo(50, 22); sb.bezierCurveTo(40, 22, 40, 34, 50, 40); sb.bezierCurveTo(60, 34, 60, 22, 50, 22);
    fillStroke(ctx, sb, ball(ctx, 50, 30, 10, c2), 1.4, shade(c2, -0.5));
    for (const [x, y] of [[47, 28], [53, 28], [50, 33], [46, 33], [54, 33]]) { ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(x, y, 0.7, 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
    leafAt(ctx, 50, 22, -2.2, 8); leafAt(ctx, 50, 22, -0.9, 8);
  },

  gift(ctx, c, c2) {
    shadow(ctx, 50, 90, 36, 5);
    const { dx, dy } = box3(ctx, 16, 42, 58, 44, 18, c);
    // リボン（縦・横）
    ctx.fillStyle = lin(ctx, 40, 0, 50, 0, [[0, shade(c2, -0.2)], [0.5, shade(c2, 0.35)], [1, shade(c2, -0.2)]]);
    ctx.fillRect(40, 42, 10, 44);
    ctx.beginPath(); ctx.moveTo(40, 42); ctx.lineTo(40 + dx, 42 - dy); ctx.lineTo(50 + dx, 42 - dy); ctx.lineTo(50, 42); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16 + dx * 0.5, 42 - dy * 0.5); ctx.lineTo(74 + dx * 0.5, 42 - dy * 0.5); ctx.lineWidth = 6; ctx.strokeStyle = shade(c2, 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(74, 64); ctx.lineTo(74 + dx, 64 - dy); ctx.lineWidth = 6; ctx.stroke();
    // ちょう結び
    const cx = 45 + dx * 0.5, cy = 42 - dy * 0.5 - 2;
    for (const s of [-1, 1]) {
      const l = P(); l.moveTo(cx, cy); l.bezierCurveTo(cx + s * 6, cy - 16, cx + s * 22, cy - 12, cx + s * 16, cy - 2); l.bezierCurveTo(cx + s * 12, cy + 2, cx + s * 4, cy + 1, cx, cy);
      fillStroke(ctx, l, ball(ctx, cx + s * 12, cy - 7, 12, c2), 1.4, shade(c2, -0.5));
      const t = P(); t.moveTo(cx, cy + 1); t.lineTo(cx + s * 10, cy + 14); t.lineTo(cx + s * 6, cy + 15); t.closePath();
      fillStroke(ctx, t, shade(c2, -0.1), 1, shade(c2, -0.5));
    }
    fillStroke(ctx, ellipseP(cx, cy, 4, 3.4), ball(ctx, cx, cy, 4, c2), 1, shade(c2, -0.5));
    streak(ctx, 20, 46, 5, 36, 0.3);
  },

  // ---- 生活雑貨 ----
  tissue(ctx, c, c2) {
    shadow(ctx, 50, 88, 38, 5);
    box3(ctx, 12, 50, 62, 34, 24, c);
    // 取り出し口
    const hole = P(); hole.ellipse(52, 43, 20, 4, -0.08, 0, Math.PI * 2);
    fillStroke(ctx, hole, '#2a4060', 1.2);
    // ティッシュ
    const t = P(); t.moveTo(38, 44); t.bezierCurveTo(30, 30, 44, 26, 46, 14); t.bezierCurveTo(54, 22, 62, 18, 66, 26); t.bezierCurveTo(68, 34, 62, 38, 64, 44); t.closePath();
    fillStroke(ctx, t, lin(ctx, 38, 14, 66, 44, [[0, '#ffffff'], [1, '#dfe7f0']]), 1.4, 'rgba(90,110,140,0.6)');
    ctx.beginPath(); ctx.moveTo(46, 18); ctx.quadraticCurveTo(50, 30, 48, 42); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(120,140,170,0.5)'; ctx.stroke();
    // 箱の模様
    ctx.save(); ctx.globalAlpha = 0.35;
    for (const [x, y] of [[22, 62], [36, 74], [54, 64], [66, 76]]) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  },

  roll(ctx, c, c2) {
    shadow(ctx, 50, 88, 34, 5);
    // 垂れた紙
    const tail = P(); tail.moveTo(72, 50); tail.lineTo(84, 54); tail.lineTo(84, 86); tail.lineTo(72, 82); tail.closePath();
    fillStroke(ctx, tail, lin(ctx, 72, 0, 84, 0, [[0, '#e8edf3'], [1, '#ffffff']]), 1.4);
    ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(120,140,160,0.5)'; ctx.beginPath(); ctx.moveTo(72, 66); ctx.lineTo(84, 70); ctx.stroke(); ctx.restore();
    // 本体
    const body = P(); body.moveTo(26, 30); body.lineTo(26, 80); body.ellipse(50, 80, 24, 8, 0, Math.PI, 0, true); body.lineTo(74, 30); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, 26, 74, '#f2f4f7'));
    ctx.save(); ctx.clip(body); ctx.strokeStyle = 'rgba(150,165,185,0.35)'; ctx.lineWidth = 0.8;
    for (let y = 40; y < 88; y += 7) { ctx.beginPath(); ctx.ellipse(50, y, 24, 8, 0, 0.1, Math.PI - 0.1); ctx.stroke(); }
    ctx.restore();
    fillStroke(ctx, ellipseP(50, 30, 24, 8), lin(ctx, 26, 22, 74, 38, [[0, '#ffffff'], [1, '#e1e6ec']]), 1.6);
    fillStroke(ctx, ellipseP(50, 30, 9, 3.2), rad(ctx, 50, 30, 1, 50, 30, 9, [[0, '#8a6a4a'], [1, '#c9a882']]), 1.2);
  },

  toothbrush(ctx, c, c2) {
    shadow(ctx, 50, 86, 34, 4);
    ctx.save(); ctx.translate(50, 54); ctx.rotate(-0.6);
    // 持ち手
    const h = P(); h.moveTo(-40, -3); h.quadraticCurveTo(-42, 0, -40, 4); h.lineTo(14, 3); h.quadraticCurveTo(18, 0, 14, -3); h.closePath();
    fillStroke(ctx, h, lin(ctx, 0, -4, 0, 4, [[0, shade(c, 0.45)], [0.5, c], [1, shade(c, -0.4)]]));
    fillStroke(ctx, rrectP(-30, -2.2, 16, 4.4, 2.2), lin(ctx, 0, -2, 0, 2, [[0, '#ffffff'], [1, '#bcd8f0']]), 0.8);
    // ヘッド
    const hd = rrectP(14, -4, 26, 8, 4);
    fillStroke(ctx, hd, lin(ctx, 0, -4, 0, 4, [[0, shade(c, 0.45)], [1, shade(c, -0.4)]]));
    // 毛
    for (let i = 0; i < 7; i++) {
      const x = 17 + i * 3.3, col = i % 2 ? '#7fd4ff' : '#ffffff';
      fillStroke(ctx, rrectP(x, -16, 2.6, 12, 1.2), lin(ctx, x, 0, x + 2.6, 0, [[0, shade(col, -0.15)], [1, col]]), 0.6, 'rgba(60,90,120,0.6)');
    }
    streak(ctx, -36, -3, 50, 2, 0.5);
    ctx.restore();
  },

  detergent(ctx, c, c2) {
    shadow(ctx, 50, 90, 30, 5);
    // 持ち手つきボトル
    const body = P();
    body.moveTo(28, 34); body.quadraticCurveTo(26, 30, 32, 28); body.lineTo(40, 28); body.lineTo(40, 20); body.lineTo(54, 20); body.lineTo(54, 28);
    body.lineTo(66, 28); body.quadraticCurveTo(76, 30, 76, 42); body.lineTo(76, 82); body.quadraticCurveTo(76, 88, 70, 88); body.lineTo(32, 88); body.quadraticCurveTo(26, 88, 26, 82); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, 26, 76, c));
    // 持ち手の穴
    fillStroke(ctx, rrectP(62, 34, 8, 18, 4), shade(c, -0.55), 1.2);
    // キャップ
    fillStroke(ctx, rrectP(38, 12, 18, 10, 2), cylFill(ctx, 38, 56, c2), 1.4);
    // ラベル
    const lab = rrectP(31, 52, 38, 28, 4);
    fillStroke(ctx, lab, lin(ctx, 0, 52, 0, 80, [[0, '#ffffff'], [1, '#e6f7ee']]), 1.2);
    for (const [x, y, r] of [[42, 62, 5], [52, 68, 4], [58, 60, 3], [46, 72, 3]]) {
      fillStroke(ctx, ellipseP(x, y, r, r), rad(ctx, x - r * 0.4, y - r * 0.4, 0, x, y, r, [[0, '#ffffff'], [0.7, 'rgba(160,220,255,0.6)'], [1, 'rgba(90,170,230,0.9)']]), 0.8, 'rgba(60,140,200,0.7)');
    }
    streak(ctx, 31, 34, 6, 50, 0.5);
  },

  mug(ctx, c, c2) {
    shadow(ctx, 50, 88, 30, 5);
    // 取っ手
    const hd = P(); hd.ellipse(72, 56, 12, 14, 0, -1.4, 1.4); hd.ellipse(72, 56, 6, 8, 0, 1.4, -1.4, true); hd.closePath();
    fillStroke(ctx, hd, cylFill(ctx, 66, 84, c));
    // 本体
    const body = P(); body.moveTo(24, 32); body.lineTo(26, 78); body.quadraticCurveTo(26, 86, 48, 86); body.quadraticCurveTo(70, 86, 70, 78); body.lineTo(72, 32); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, 24, 72, c));
    // 中のコーヒー
    fillStroke(ctx, ellipseP(48, 32, 24, 6), lin(ctx, 24, 26, 72, 38, [[0, shade(c, 0.5)], [1, shade(c, -0.2)]]), 1.6);
    fillStroke(ctx, ellipseP(48, 33, 20, 4.4), rad(ctx, 44, 32, 1, 48, 33, 20, [[0, '#a0623a'], [1, '#4a2410']]), 0.8);
    // ハート
    const h = P(); h.moveTo(48, 72); h.bezierCurveTo(30, 60, 38, 46, 48, 54); h.bezierCurveTo(58, 46, 66, 60, 48, 72);
    fillStroke(ctx, h, ball(ctx, 48, 60, 12, c2), 1, shade(c2, -0.4));
    streak(ctx, 30, 38, 6, 42, 0.5);
  },

  towel(ctx, c, c2) {
    shadow(ctx, 50, 86, 36, 5);
    const cols = [c, c2, c];
    for (let i = 0; i < 3; i++) {
      const y = 64 - i * 16, x0 = 16 + i * 3, w = 68 - i * 6;
      const p = rrectP(x0, y, w, 18, 8);
      fillStroke(ctx, p, lin(ctx, 0, y, 0, y + 18, [[0, shade(cols[i], 0.3)], [0.5, cols[i]], [1, shade(cols[i], -0.3)]]));
      // パイル（ふわふわ）
      ctx.save(); ctx.clip(p); ctx.globalAlpha = 0.25; ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 40; k++) ctx.fillRect(x0 + (k * 13.7) % w, y + (k * 5.3) % 18, 1.2, 1.2);
      ctx.restore();
      // 縁のライン
      ctx.beginPath(); ctx.moveTo(x0 + 4, y + 14); ctx.lineTo(x0 + w - 4, y + 14); ctx.lineWidth = 1.6; ctx.strokeStyle = shade(cols[i], -0.25); ctx.stroke();
    }
    gloss(ctx, 34, 36, 12, 3, 0, 0.4);
  },

  umbrella(ctx, c, c2) {
    shadow(ctx, 52, 90, 30, 4);
    // 柄
    ctx.beginPath(); ctx.moveTo(50, 40); ctx.lineTo(50, 80); ctx.arc(43, 80, 7, 0, Math.PI); ctx.lineWidth = 4.5; ctx.strokeStyle = c2; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(49, 42); ctx.lineTo(49, 78); ctx.stroke();
    // 傘（4枚の布）
    const segs = 4, L = 12, R = 88, base = 50;
    for (let i = 0; i < segs; i++) {
      const x0 = L + (R - L) * i / segs, x1 = L + (R - L) * (i + 1) / segs;
      const p = P(); p.moveTo(50, 12); p.quadraticCurveTo(x0 + (x0 < 50 ? -4 : 4), 20, x0, base); p.quadraticCurveTo((x0 + x1) / 2, base - 8, x1, base); p.quadraticCurveTo(x1 + (x1 < 50 ? -4 : 4), 20, 50, 12);
      const col = i % 2 ? shade(c, -0.15) : shade(c, 0.12);
      fillStroke(ctx, p, lin(ctx, 0, 12, 0, base, [[0, shade(col, 0.35)], [1, col]]), 1.4);
    }
    fillStroke(ctx, ellipseP(50, 12, 2.5, 2.5), c2, 1);
    gloss(ctx, 34, 26, 10, 5, -0.6, 0.45);
  },

  clock(ctx, c, c2) {
    shadow(ctx, 50, 90, 30, 5);
    // 足
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(50 + s * 14, 76); ctx.lineTo(50 + s * 22, 88); ctx.lineWidth = 4; ctx.strokeStyle = '#444'; ctx.stroke(); }
    // ベル
    for (const s of [-1, 1]) fillStroke(ctx, ellipseP(50 + s * 18, 24, 11, 9, s * 0.5), ball(ctx, 50 + s * 18, 24, 11, '#e8c35a'), 1.6);
    ctx.beginPath(); ctx.moveTo(50, 16); ctx.lineTo(50, 26); ctx.lineWidth = 3; ctx.strokeStyle = '#666'; ctx.stroke();
    // 本体
    fillStroke(ctx, ellipseP(50, 56, 28, 28), ball(ctx, 50, 56, 28, c));
    fillStroke(ctx, ellipseP(50, 56, 21, 21), rad(ctx, 46, 50, 2, 50, 56, 21, [[0, '#ffffff'], [1, '#dfe5ec']]), 1.4);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a) * 17, 56 + Math.sin(a) * 17); ctx.lineTo(50 + Math.cos(a) * (i % 3 ? 19 : 15), 56 + Math.sin(a) * (i % 3 ? 19 : 15)); ctx.lineWidth = i % 3 ? 1 : 2; ctx.strokeStyle = '#333'; ctx.stroke(); }
    ctx.lineWidth = 2.6; ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.moveTo(50, 56); ctx.lineTo(50, 43); ctx.moveTo(50, 56); ctx.lineTo(60, 60); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#e23'; ctx.beginPath(); ctx.moveTo(50, 56); ctx.lineTo(38, 64); ctx.stroke();
    fillStroke(ctx, ellipseP(50, 56, 2, 2), '#222', 0);
    gloss(ctx, 40, 44, 10, 6, -0.6, 0.5);
  },

  kettle(ctx, c, c2) {
    shadow(ctx, 50, 90, 32, 5);
    // 台座
    fillStroke(ctx, rrectP(18, 80, 60, 8, 4), lin(ctx, 0, 80, 0, 88, [[0, shade(c2, 0.3)], [1, shade(c2, -0.3)]]));
    // 取っ手
    const hd = P(); hd.moveTo(66, 34); hd.quadraticCurveTo(90, 36, 86, 58); hd.quadraticCurveTo(84, 74, 70, 74); hd.lineTo(70, 66); hd.quadraticCurveTo(78, 64, 78, 56); hd.quadraticCurveTo(80, 44, 66, 42); hd.closePath();
    fillStroke(ctx, hd, lin(ctx, 66, 0, 90, 0, [[0, shade(c2, 0.2)], [1, shade(c2, -0.3)]]));
    // 注ぎ口
    const sp = P(); sp.moveTo(32, 38); sp.lineTo(14, 26); sp.lineTo(12, 30); sp.lineTo(30, 46); sp.closePath();
    fillStroke(ctx, sp, cylFill(ctx, 12, 32, c));
    // 本体
    const body = P(); body.moveTo(30, 30); body.lineTo(66, 30); body.lineTo(72, 80); body.lineTo(24, 80); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, 24, 72, c));
    // 水量の窓
    fillStroke(ctx, rrectP(30, 46, 6, 28, 3), lin(ctx, 0, 46, 0, 74, [[0, 'rgba(120,200,255,0.3)'], [0.5, 'rgba(120,200,255,0.3)'], [0.5, 'rgba(60,150,230,0.85)'], [1, 'rgba(40,120,210,0.9)']]), 1);
    // ふた
    fillStroke(ctx, rrectP(32, 24, 32, 7, 3), lin(ctx, 0, 24, 0, 31, [[0, shade(c2, 0.4)], [1, c2]]), 1.4);
    // スイッチの青いランプ
    fillStroke(ctx, ellipseP(64, 76, 2.4, 2.4), rad(ctx, 63, 75, 0, 64, 76, 3, [[0, '#cff2ff'], [1, '#1e90ff']]), 0.8);
    streak(ctx, 40, 32, 7, 46, 0.65);
  },

  // ---- 野菜・果物 ----
  carrot(ctx, c, c2) {
    shadow(ctx, 50, 90, 16, 3);
    for (const [r, l] of [[-1.9, 22], [-1.57, 26], [-1.25, 22], [-2.2, 16], [-0.95, 16]]) leafAt(ctx, 50, 28, r, l, c2);
    const p = P(); p.moveTo(34, 30); p.quadraticCurveTo(50, 22, 66, 30); p.quadraticCurveTo(62, 60, 52, 88); p.quadraticCurveTo(50, 91, 48, 88); p.quadraticCurveTo(38, 60, 34, 30);
    fillStroke(ctx, p, lin(ctx, 34, 0, 66, 0, [[0, shade(c, -0.25)], [0.35, shade(c, 0.3)], [0.6, c], [1, shade(c, -0.4)]]));
    ctx.save(); ctx.clip(p); ctx.strokeStyle = shade(c, -0.45); ctx.lineWidth = 1;
    for (const [y, x, w] of [[40, 40, 8], [50, 52, 9], [60, 44, 7], [70, 52, 6], [78, 47, 5]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w / 2, y + 2, x + w, y); ctx.stroke(); }
    ctx.restore();
    streak(ctx, 40, 32, 4, 34, 0.45);
  },

  round(ctx, c, c2) {   // トマト
    shadow(ctx, 50, 88, 30, 5);
    const p = P();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, r = 30 + Math.cos(a * 5) * 1.5; p.lineTo(50 + Math.cos(a) * r * 1.05, 56 + Math.sin(a) * r * 0.9); }
    p.closePath();
    fillStroke(ctx, p, ball(ctx, 50, 56, 32, c));
    ctx.save(); ctx.clip(p); ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 1;
    for (const x of [38, 62]) { ctx.beginPath(); ctx.moveTo(50, 32); ctx.quadraticCurveTo(x, 56, 50 + (x - 50) * 0.6, 84); ctx.stroke(); }
    ctx.restore();
    for (let i = 0; i < 5; i++) leafAt(ctx, 50, 30, i * 1.26 - 1.57, 12, c2);
    ctx.beginPath(); ctx.moveTo(50, 30); ctx.lineTo(51, 20); ctx.lineWidth = 3; ctx.strokeStyle = shade(c2, -0.3); ctx.stroke();
    gloss(ctx, 34, 44, 8, 11, 0.5, 0.75);
  },

  onion(ctx, c, c2) {
    shadow(ctx, 50, 90, 26, 4);
    // ひげ根
    ctx.save(); ctx.strokeStyle = '#d8c6a0'; ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(50, 84); ctx.quadraticCurveTo(50 + i * 3, 88, 50 + i * 4, 92); ctx.stroke(); }
    ctx.restore();
    const p = P(); p.moveTo(50, 14); p.quadraticCurveTo(54, 32, 72, 46); p.quadraticCurveTo(86, 74, 50, 86); p.quadraticCurveTo(14, 74, 28, 46); p.quadraticCurveTo(46, 32, 50, 14);
    fillStroke(ctx, p, ball(ctx, 50, 58, 34, c));
    ctx.save(); ctx.clip(p); ctx.lineWidth = 1.2;
    for (const k of [-16, -8, 0, 8, 16]) { ctx.strokeStyle = k ? shade(c, -0.3) : shade(c, 0.4); ctx.beginPath(); ctx.moveTo(50, 18); ctx.quadraticCurveTo(50 + k * 1.6, 54, 50 + k, 86); ctx.stroke(); }
    ctx.restore();
    gloss(ctx, 38, 54, 6, 14, 0.2, 0.5);
  },

  potato(ctx, c, c2) {
    shadow(ctx, 50, 84, 34, 5);
    const p = P();
    for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2, r = 1 + Math.sin(i * 1.7) * 0.05; p.lineTo(50 + Math.cos(a) * 34 * r, 56 + Math.sin(a) * 22 * r); }
    p.closePath();
    ctx.save(); ctx.translate(50, 56); ctx.rotate(-0.2); ctx.translate(-50, -56);
    fillStroke(ctx, p, ball(ctx, 50, 56, 36, c));
    ctx.save(); ctx.clip(p);
    for (let k = 0; k < 50; k++) { ctx.fillStyle = 'rgba(110,80,40,0.25)'; ctx.fillRect(20 + (k * 17.3) % 60, 38 + (k * 7.7) % 36, 1.3, 1.3); }
    ctx.restore();
    for (const [x, y] of [[36, 50], [56, 46], [64, 62], [44, 66], [74, 52]]) {
      fillStroke(ctx, ellipseP(x, y, 2.6, 1.8), rad(ctx, x, y, 0, x, y, 3, [[0, shade(c2, -0.4)], [1, shade(c2, 0.1)]]), 0);
    }
    gloss(ctx, 38, 46, 12, 5, -0.2, 0.4);
    ctx.restore();
  },

  apple(ctx, c, c2) {
    shadow(ctx, 50, 90, 26, 5);
    const p = P();
    p.moveTo(50, 30); p.bezierCurveTo(32, 18, 10, 32, 16, 58); p.bezierCurveTo(21, 80, 38, 92, 50, 86);
    p.bezierCurveTo(62, 92, 79, 80, 84, 58); p.bezierCurveTo(90, 32, 68, 18, 50, 30); p.closePath();
    ctx.fillStyle = rad(ctx, 36, 42, 3, 50, 58, 42, [[0, shade(c, 0.45)], [0.35, c], [0.8, shade(c, -0.35)], [1, shade(c, -0.55)]]); ctx.fill(p);
    ctx.save(); ctx.clip(p); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(26 + i * 6, 34); ctx.quadraticCurveTo(24 + i * 6.5, 60, 30 + i * 5, 86); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(70,0,10,0.6)'; ctx.stroke(p);
    ctx.fillStyle = rad(ctx, 50, 32, 0, 50, 32, 9, [[0, 'rgba(80,0,10,0.6)'], [1, 'rgba(80,0,10,0)']]); ctx.beginPath(); ctx.ellipse(50, 32, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(50, 32); ctx.quadraticCurveTo(50, 22, 55, 14); ctx.lineWidth = 3.5; ctx.strokeStyle = '#5a3416'; ctx.stroke();
    leafAt(ctx, 56, 20, -0.5, 22, c2);
    gloss(ctx, 32, 46, 8, 13, 0.4, 0.75);
    gloss(ctx, 68, 70, 4, 3, 0, 0.3);
  },

  banana(ctx, c, c2) {
    shadow(ctx, 52, 88, 34, 5);
    const one = (rot, dx, dy, k) => {
      ctx.save(); ctx.translate(50 + dx, 54 + dy); ctx.rotate(rot);
      const p = P(); p.moveTo(-34, -16); p.quadraticCurveTo(-14, 30, 34, 4); p.quadraticCurveTo(36, 8, 32, 10); p.quadraticCurveTo(-18, 34, -38, -12); p.closePath();
      fillStroke(ctx, p, lin(ctx, 0, -10, 0, 28, [[0, shade(c, 0.35)], [0.5, c], [1, shade(c, -0.35)]]));
      ctx.beginPath(); ctx.moveTo(-34, -12); ctx.quadraticCurveTo(-14, 26, 32, 7); ctx.lineWidth = 1; ctx.strokeStyle = shade(c, -0.3); ctx.stroke();
      fillStroke(ctx, rrectP(32, 3, 5, 6, 1.5), '#4a3410', 0.8);
      for (const [x, y] of [[-10, 10], [6, 12], [-20, -2]]) { ctx.fillStyle = 'rgba(110,70,10,0.45)'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      void k;
    };
    one(0.25, 2, -10, 0); one(0, 0, 0, 1); one(-0.25, -2, 10, 2);
    // 付け根
    const st = P(); st.moveTo(10, 36); st.lineTo(22, 30); st.lineTo(24, 40); st.lineTo(12, 46); st.closePath();
    fillStroke(ctx, st, lin(ctx, 10, 30, 24, 46, [[0, '#9a7a2a'], [1, c2]]), 1.4);
  },

  grape(ctx, c, c2) {
    shadow(ctx, 50, 90, 22, 4);
    ctx.beginPath(); ctx.moveTo(50, 22); ctx.quadraticCurveTo(52, 14, 58, 10); ctx.lineWidth = 3; ctx.strokeStyle = '#6b4a1f'; ctx.stroke();
    leafAt(ctx, 54, 16, -0.3, 22, c2);
    let y = 30;
    for (const row of [[30, 42, 54, 66], [36, 48, 60, 72].map(x => x - 6), [42, 54, 66].map(x => x - 6), [48, 60].map(x => x - 6), [48]]) {
      for (const x of row) {
        fillStroke(ctx, ellipseP(x + 2, y, 7, 7.5), ball(ctx, x + 2, y, 7.5, c), 1.2, shade(c, -0.6));
        gloss(ctx, x, y - 3, 2.4, 1.6, -0.5, 0.8);
      }
      y += 12;
    }
  },

  melon(ctx, c, c2) {
    shadow(ctx, 50, 90, 32, 5);
    const b = ellipseP(50, 56, 32, 30);
    fillStroke(ctx, b, ball(ctx, 50, 56, 32, c));
    // 網目
    ctx.save(); ctx.clip(b); ctx.strokeStyle = shade(c2, 0.1); ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath(); ctx.moveTo(50 + i * 8, 24); ctx.bezierCurveTo(50 + i * 9 + 6, 40, 50 + i * 9 - 6, 70, 50 + i * 8 + 4, 88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 56 + i * 7); ctx.bezierCurveTo(34, 56 + i * 8 - 5, 64, 56 + i * 8 + 5, 82, 56 + i * 7); ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(b);
    // T字のつる
    ctx.beginPath(); ctx.moveTo(50, 27); ctx.lineTo(50, 16); ctx.moveTo(42, 16); ctx.lineTo(58, 16); ctx.lineWidth = 3.5; ctx.strokeStyle = '#6b8f3f'; ctx.stroke();
    gloss(ctx, 36, 42, 10, 8, -0.5, 0.45);
  },

  basket(ctx, c, c2) {
    shadow(ctx, 50, 90, 38, 5);
    // 中身（後ろから）
    fillStroke(ctx, ellipseP(64, 40, 12, 12), ball(ctx, 64, 40, 12, '#ff9f1a'), 1.4);
    ctx.save(); ctx.translate(46, 30); ctx.rotate(0.5);
    const bn = P(); bn.moveTo(-18, -6); bn.quadraticCurveTo(0, 14, 20, -2); bn.quadraticCurveTo(0, 6, -18, -6);
    fillStroke(ctx, bn, lin(ctx, 0, -6, 0, 10, [[0, '#ffe36b'], [1, '#e0b020']]), 1.4); ctx.restore();
    for (const [x, y] of [[30, 42], [36, 36], [24, 38], [30, 32]]) fillStroke(ctx, ellipseP(x, y, 4.6, 4.8), ball(ctx, x, y, 5, '#7b3fa0'), 1, '#3a1050');
    fillStroke(ctx, ellipseP(48, 46, 11, 10), ball(ctx, 48, 46, 11, c2), 1.4);
    leafAt(ctx, 50, 36, -1.2, 10);
    // 持ち手
    ctx.beginPath(); ctx.ellipse(50, 50, 34, 36, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 4; ctx.strokeStyle = shade(c, -0.2); ctx.stroke();
    // かご
    const bk = P(); bk.moveTo(12, 50); bk.lineTo(88, 50); bk.lineTo(78, 86); bk.lineTo(22, 86); bk.closePath();
    fillStroke(ctx, bk, lin(ctx, 0, 50, 0, 86, [[0, shade(c, 0.25)], [1, shade(c, -0.35)]]));
    ctx.save(); ctx.clip(bk); ctx.strokeStyle = shade(c, -0.45); ctx.lineWidth = 1.2;
    for (let y = 56; y < 86; y += 6) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(90, y); ctx.stroke(); }
    for (let x = 16; x < 88; x += 7) { ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x + (50 - x) * 0.12, 86); ctx.stroke(); }
    ctx.restore();
    fillStroke(ctx, rrectP(10, 47, 80, 6, 3), lin(ctx, 0, 47, 0, 53, [[0, shade(c, 0.35)], [1, shade(c, -0.2)]]), 1.4);
  },

  // ---- 飲料 ----
  pet(ctx, c, c2, it) {
    shadow(ctx, 50, 91, 22, 4);
    // キャップ
    fillStroke(ctx, rrectP(42, 8, 16, 10, 2), cylFill(ctx, 42, 58, c), 1.4);
    ctx.save(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7; for (let x = 44; x < 57; x += 2) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, 17); ctx.stroke(); } ctx.restore();
    // ボトル（透明＋中身）
    const b = P(); b.moveTo(43, 18); b.lineTo(57, 18); b.quadraticCurveTo(58, 26, 66, 32); b.quadraticCurveTo(70, 36, 69, 44); b.lineTo(68, 58); b.quadraticCurveTo(71, 62, 68, 66); b.lineTo(68, 84);
    b.quadraticCurveTo(68, 90, 60, 90); b.lineTo(40, 90); b.quadraticCurveTo(32, 90, 32, 84); b.lineTo(32, 66); b.quadraticCurveTo(29, 62, 32, 58); b.lineTo(31, 44); b.quadraticCurveTo(30, 36, 34, 32); b.quadraticCurveTo(42, 26, 43, 18); b.closePath();
    ctx.save(); ctx.clip(b);
    ctx.fillStyle = cylFill(ctx, 30, 70, c2); ctx.fillRect(28, 30, 44, 62);
    ctx.fillStyle = 'rgba(230,245,255,0.5)'; ctx.fillRect(28, 16, 44, 16);
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(60,90,120,0.6)'; ctx.stroke(b);
    // ラベル
    const lab = rrectP(31, 66, 38, 18, 1);
    fillStroke(ctx, lab, cylFill(ctx, 31, 69, c), 1.2);
    text(ctx, it.label || '', 50, 75, 9, '#fff', shade(c, -0.6), 34);
    streak(ctx, 35, 30, 5, 56, 0.7);
  },

  can(ctx, c, c2, it) {
    shadow(ctx, 50, 91, 24, 5);
    const x0 = 29, x1 = 71, top = 18, bot = 86;
    const body = P(); body.moveTo(x0, top + 6); body.lineTo(x0, bot - 4); body.ellipse(50, bot - 4, 21, 5, 0, Math.PI, 0, true); body.lineTo(x1, top + 6); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, x0, x1, c));
    const lab = P(); lab.moveTo(x0, 42); lab.ellipse(50, 42, 21, 4, 0, Math.PI, 0, true); lab.lineTo(x1, 64); lab.ellipse(50, 64, 21, 4, 0, 0, Math.PI, false); lab.closePath();
    ctx.fillStyle = cylFill(ctx, x0, x1, c2); ctx.fill(lab);
    if (it.id === 'coffee') {
      ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.4);
      ctx.fillStyle = rad(ctx, -2, -2, 0, 0, 0, 6, [[0, '#9a5a2a'], [1, '#4a2410']]); ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(-2, 0, 0, 5); ctx.lineWidth = 1; ctx.strokeStyle = '#e8c9a0'; ctx.stroke();
      ctx.restore();
      text(ctx, it.label || '', 50, 61, 9, shade(c, -0.2), null);
    } else {
      // 稲妻マーク
      const z = P(); z.moveTo(53, 43); z.lineTo(44, 54); z.lineTo(50, 54); z.lineTo(46, 64); z.lineTo(57, 51); z.lineTo(51, 51); z.closePath();
      fillStroke(ctx, z, shade(c, -0.1), 1, '#fff');
      text(ctx, it.label || '', 50, 72, 8, c2, '#000');
    }
    const lid = ellipseP(50, top + 6, 21, 6);
    fillStroke(ctx, lid, lin(ctx, x0, top, x1, top + 10, [[0, '#8e98a6'], [0.4, '#f4f7fb'], [1, '#7b8592']]), 1.6);
    ctx.beginPath(); ctx.ellipse(50, top + 6, 17, 4.6, 0, 0, Math.PI * 2); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(60,70,80,0.6)'; ctx.stroke();
    fillStroke(ctx, ellipseP(52, top + 5, 6, 2.6, 0.1), '#c9d1db', 1, 'rgba(60,70,80,0.7)');
    fillStroke(ctx, ellipseP(52, top + 5, 2.2, 1, 0.1), '#7b8592', 0);
    streak(ctx, 35, top + 10, 6, bot - top - 16, 0.55);
  },

  carton(ctx, c, c2, it) {
    shadow(ctx, 52, 91, 28, 5);
    const x = 28, w = 36, y = 34, h = 54, d = 12;
    const dx = d * 0.8, dy = d * 0.45;
    // 側面
    const sd = P(); sd.moveTo(x + w, y); sd.lineTo(x + w + dx, y - dy); sd.lineTo(x + w + dx, y + h - dy); sd.lineTo(x + w, y + h); sd.closePath();
    fillStroke(ctx, sd, lin(ctx, x + w, 0, x + w + dx, 0, [[0, shade(c2, -0.2)], [1, shade(c2, -0.35)]]), 1.6);
    // 屋根
    const r1 = P(); r1.moveTo(x, y); r1.lineTo(x + w / 2 + dx / 2, y - 18 - dy / 2); r1.lineTo(x + w, y); r1.closePath();
    fillStroke(ctx, r1, lin(ctx, x, y - 18, x + w, y, [[0, '#ffffff'], [1, shade(c2, -0.15)]]), 1.6);
    const r2 = P(); r2.moveTo(x + w, y); r2.lineTo(x + w / 2 + dx / 2, y - 18 - dy / 2); r2.lineTo(x + w / 2 + dx * 1.5, y - 18 - dy * 1.5); r2.lineTo(x + w + dx, y - dy); r2.closePath();
    fillStroke(ctx, r2, shade(c2, -0.3), 1.6);
    fillStroke(ctx, rrectP(x + w / 2 + dx / 2 - 1, y - 22 - dy, dx + 2, 5, 1), shade(c2, -0.1), 1.2);
    // 正面
    fillStroke(ctx, rrectP(x, y, w, h, 1), lin(ctx, x, 0, x + w, 0, [[0, shade(c2, 0.05)], [1, shade(c2, -0.1)]]), 1.6);
    const band = rrectP(x, y + 14, w, 26, 0);
    ctx.fillStyle = lin(ctx, 0, y + 14, 0, y + 40, [[0, shade(c, 0.2)], [1, shade(c, -0.2)]]); ctx.fill(band);
    if (it.id === 'orange') {
      fillStroke(ctx, ellipseP(x + w / 2, y + 26, 9, 9), ball(ctx, x + w / 2, y + 26, 9, '#ffb31a'), 1, '#c06a00');
      leafAt(ctx, x + w / 2 + 2, y + 17, -0.6, 8);
    } else {
      // 牛のぶち模様
      ctx.save(); ctx.clip(band); ctx.fillStyle = '#ffffff';
      for (const [px, py, r] of [[x + 8, y + 20, 5], [x + 26, y + 30, 6], [x + 16, y + 36, 3.5]]) { ctx.beginPath(); ctx.ellipse(px, py, r * 1.2, r, 0.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    text(ctx, it.label || '', x + w / 2, y + 47, 8.5, shade(c, -0.3), null, w - 4);
  },

  // ---- 冷凍・冷蔵食品 ----
  popsicle(ctx, c, c2) {
    shadow(ctx, 50, 92, 14, 3);
    fillStroke(ctx, rrectP(45, 62, 10, 28, 4), lin(ctx, 45, 0, 55, 0, [[0, shade(c2, 0.2)], [1, shade(c2, -0.25)]]), 1.4);
    const p = P(); p.moveTo(30, 68); p.lineTo(30, 30); p.quadraticCurveTo(30, 12, 50, 12); p.quadraticCurveTo(70, 12, 70, 30); p.lineTo(70, 68); p.quadraticCurveTo(70, 72, 66, 72); p.lineTo(34, 72); p.quadraticCurveTo(30, 72, 30, 68);
    fillStroke(ctx, p, cylFill(ctx, 30, 70, c));
    // ひとかじり
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    for (const [x, y] of [[70, 22], [66, 16], [72, 30]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // 霜のつぶ
    ctx.save(); ctx.clip(p); ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 30; k++) ctx.fillRect(32 + (k * 11.3) % 36, 16 + (k * 7.9) % 54, 1.3, 1.3);
    ctx.restore();
    streak(ctx, 36, 20, 6, 46, 0.65);
  },

  cup(ctx, c, c2, it) {
    shadow(ctx, 50, 90, 32, 5);
    const body = P(); body.moveTo(22, 38); body.lineTo(30, 84); body.quadraticCurveTo(50, 90, 70, 84); body.lineTo(78, 38); body.closePath();
    fillStroke(ctx, body, cylFill(ctx, 22, 78, c));
    // ふた
    fillStroke(ctx, ellipseP(50, 38, 29, 8), lin(ctx, 22, 30, 78, 46, [[0, shade(c2, 0.35)], [1, shade(c2, -0.2)]]), 1.6);
    fillStroke(ctx, ellipseP(50, 38, 22, 5), lin(ctx, 28, 33, 72, 43, [[0, '#ffffff'], [1, '#e2e8ef']]), 1);
    // 絵柄
    if (it.id === 'yogurt') {
      for (const [x, y] of [[40, 62], [56, 66]]) {
        const sb = P(); sb.moveTo(x, y - 8); sb.bezierCurveTo(x - 8, y - 8, x - 7, y + 2, x, y + 7); sb.bezierCurveTo(x + 7, y + 2, x + 8, y - 8, x, y - 8);
        fillStroke(ctx, sb, ball(ctx, x, y, 8, '#e8263c'), 1, '#7a0010');
        leafAt(ctx, x, y - 8, -2.2, 6); leafAt(ctx, x, y - 8, -0.9, 6);
      }
    } else {
      fillStroke(ctx, rrectP(32, 54, 36, 18, 5), lin(ctx, 0, 54, 0, 72, [[0, shade(c2, 0.2)], [1, shade(c2, -0.2)]]), 1.2);
      text(ctx, 'ICE', 50, 63.5, 11, '#fff3dc', null);
    }
    text(ctx, it.label || '', 50, 80, 7, shade(c2, -0.2), null, 40);
    streak(ctx, 30, 44, 6, 36, 0.55);
  },

  gyoza(ctx, c, c2) {
    shadow(ctx, 50, 90, 38, 5);
    box3(ctx, 10, 46, 68, 40, 14, c2);
    text(ctx, 'ギョーザ', 44, 76, 13, '#fff', shade(c2, -0.6));
    // 箱の上にギョーザ
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(26 + i * 20, 44 - i * 2);
      const g = P(); g.moveTo(-12, 6); g.quadraticCurveTo(-10, -12, 0, -14); g.quadraticCurveTo(10, -12, 12, 6); g.quadraticCurveTo(0, 10, -12, 6);
      fillStroke(ctx, g, lin(ctx, 0, -14, 0, 8, [[0, '#fffaf0'], [0.6, c], [1, '#d9a35b']]), 1.4);
      ctx.strokeStyle = 'rgba(150,110,60,0.6)'; ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 4, -12 + Math.abs(k)); ctx.lineTo(k * 4 + 1.5, -6 + Math.abs(k)); ctx.stroke(); }
      gloss(ctx, -4, -4, 4, 2.4, -0.5, 0.5);
      ctx.restore();
    }
  },

  pudding(ctx, c, c2) {
    shadow(ctx, 50, 90, 34, 5);
    fillStroke(ctx, ellipseP(50, 82, 36, 8), lin(ctx, 0, 74, 0, 90, [[0, '#ffffff'], [1, '#c9d3e0']]), 1.4);
    const p = P(); p.moveTo(28, 80); p.quadraticCurveTo(30, 52, 36, 36); p.lineTo(64, 36); p.quadraticCurveTo(70, 52, 72, 80); p.quadraticCurveTo(50, 86, 28, 80);
    fillStroke(ctx, p, lin(ctx, 28, 0, 72, 0, [[0, shade(c, -0.15)], [0.3, shade(c, 0.35)], [0.6, c], [1, shade(c, -0.3)]]));
    // カラメル
    const cr = P(); cr.moveTo(36, 36); cr.lineTo(64, 36); cr.quadraticCurveTo(66, 46, 62, 48); cr.quadraticCurveTo(58, 44, 56, 50); cr.quadraticCurveTo(52, 44, 48, 48); cr.quadraticCurveTo(44, 43, 40, 50); cr.quadraticCurveTo(34, 46, 36, 36);
    fillStroke(ctx, cr, lin(ctx, 36, 30, 64, 50, [[0, shade(c2, 0.35)], [1, c2]]), 1.2, shade(c2, -0.5));
    fillStroke(ctx, ellipseP(50, 36, 14, 3.5), shade(c2, 0.2), 1, shade(c2, -0.5));
    // ホイップとさくらんぼ
    fillStroke(ctx, ellipseP(50, 31, 8, 5), rad(ctx, 48, 29, 0.5, 50, 31, 8, [[0, '#ffffff'], [1, '#ece3d4']]), 1, 'rgba(120,100,80,0.4)');
    ctx.beginPath(); ctx.moveTo(51, 22); ctx.quadraticCurveTo(54, 14, 60, 12); ctx.lineWidth = 1.6; ctx.strokeStyle = '#3a6a1a'; ctx.stroke();
    fillStroke(ctx, ellipseP(50, 23, 5, 5), ball(ctx, 50, 23, 5, '#e8263c'), 1, '#6a0010');
    gloss(ctx, 38, 54, 4, 12, 0.15, 0.6);
  },

  pizza(ctx, c, c2) {
    shadow(ctx, 50, 86, 38, 6);
    ctx.save(); ctx.translate(50, 54); ctx.scale(1, 0.72);
    const crust = ellipseP(0, 0, 38, 38);
    fillStroke(ctx, crust, rad(ctx, -10, -10, 4, 0, 0, 40, [[0, '#f3c27a'], [1, '#b8742e']]));
    fillStroke(ctx, ellipseP(0, 0, 31, 31), rad(ctx, -6, -6, 2, 0, 0, 32, [[0, shade(c, 0.5)], [0.7, c], [1, '#e08a2a']]), 1.2, '#b8742e');
    // ソースが見える所
    ctx.save(); ctx.clip(ellipseP(0, 0, 31, 31)); ctx.globalAlpha = 0.5; ctx.fillStyle = '#d9481c';
    for (const [x, y, r] of [[-18, 10, 6], [16, -16, 5], [20, 14, 4], [-8, -22, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // サラミ・ピーマン
    for (const [x, y] of [[-12, -10], [12, -6], [0, 14], [-20, 8], [20, 14], [2, -22]]) {
      fillStroke(ctx, ellipseP(x, y, 6.5, 6.5), rad(ctx, x - 2, y - 2, 1, x, y, 7, [[0, shade(c2, 0.3)], [1, shade(c2, -0.3)]]), 1, shade(c2, -0.5));
      ctx.fillStyle = 'rgba(255,220,200,0.6)'; for (const [a, r] of [[0.5, 3], [2.5, 2.5], [4.2, 3.4]]) { ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.9, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = '#3cb043'; ctx.lineWidth = 2.2;
    for (const [x, y, a] of [[-4, 0, 0.4], [14, 6, 2], [-22, -6, 1.1], [6, -14, 2.6]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, a, a + 3.5); ctx.stroke(); }
    // 切れ目
    ctx.strokeStyle = 'rgba(150,90,30,0.5)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(-Math.cos(a) * 31, -Math.sin(a) * 31); ctx.lineTo(Math.cos(a) * 31, Math.sin(a) * 31); ctx.stroke(); }
    ctx.restore();
  },

  cheese(ctx, c, c2) {
    shadow(ctx, 52, 86, 38, 5);
    const top = P(); top.moveTo(12, 58); top.lineTo(70, 26); top.lineTo(88, 52); top.closePath();
    const front = P(); front.moveTo(12, 58); front.lineTo(88, 52); front.lineTo(88, 74); front.lineTo(12, 80); front.closePath();
    const side = P(); side.moveTo(70, 26); side.lineTo(88, 52); side.lineTo(88, 74); side.lineTo(70, 48); side.closePath();
    fillStroke(ctx, front, lin(ctx, 0, 52, 0, 80, [[0, shade(c, 0.1)], [1, shade(c, -0.25)]]));
    fillStroke(ctx, top, lin(ctx, 12, 26, 88, 58, [[0, shade(c, 0.45)], [1, c]]));
    // 穴
    for (const [x, y, rx, ry, p] of [[40, 66, 5, 4, front], [62, 68, 4, 3.2, front], [76, 62, 3, 2.4, front], [54, 46, 4.5, 2.4, top], [70, 44, 3, 1.6, top], [36, 54, 3, 1.6, top]]) {
      ctx.save(); ctx.clip(p);
      fillStroke(ctx, ellipseP(x, y, rx, ry), rad(ctx, x + rx * 0.3, y + ry * 0.3, 0, x, y, rx, [[0, shade(c2, 0.2)], [1, shade(c2, -0.4)]]), 0.8, shade(c2, -0.5));
      ctx.restore();
    }
    gloss(ctx, 40, 50, 14, 3, -0.5, 0.45);
  },

  shrimp(ctx, c, c2) {
    shadow(ctx, 50, 88, 30, 5);
    const N = 7;
    const at = i => { const a = -2.7 + i * 0.5; return [50 + Math.cos(a) * 22, 52 + Math.sin(a) * 22, a]; };
    // 尾
    const [tx, ty, ta] = at(N);
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta + Math.PI / 2);
    const tail = P(); tail.moveTo(0, -3); tail.lineTo(-10, 12); tail.quadraticCurveTo(0, 8, 10, 12); tail.closePath();
    fillStroke(ctx, tail, lin(ctx, 0, -3, 0, 12, [[0, shade(c, 0.1)], [1, '#d8381c']]), 1.4);
    ctx.restore();
    for (let i = N - 1; i >= 0; i--) {
      const [x, y, a] = at(i);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      const seg = ellipseP(0, 0, 12 - i * 0.9, 8 - i * 0.4);
      fillStroke(ctx, seg, lin(ctx, 0, -8, 0, 8, [[0, shade(c, 0.5)], [0.5, c], [1, shade(c, -0.25)]]), 1.4);
      ctx.beginPath(); ctx.ellipse(0, 0, 10 - i * 0.9, 6 - i * 0.4, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
      ctx.restore();
    }
    const [hx, hy] = at(0);
    // 足
    ctx.strokeStyle = shade(c, -0.2); ctx.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) { const [x, y, a] = at(i); ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6); ctx.lineTo(x - Math.cos(a) * 12, y - Math.sin(a) * 12 + 2); ctx.stroke(); }
    // ひげ
    ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 4); ctx.quadraticCurveTo(hx - 22, hy - 22, hx - 6, hy - 36); ctx.moveTo(hx - 2, hy - 6); ctx.quadraticCurveTo(hx - 8, hy - 28, hx + 12, hy - 34); ctx.stroke();
    fillStroke(ctx, ellipseP(hx + 2, hy - 2, 2.4, 2.4), '#1a1a1a', 0);
    gloss(ctx, hx + 1, hy - 3, 1, 1, 0, 0.9);
  }
};
