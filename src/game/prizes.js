// =============================================================
// 景品の一覧と抽選・絵
// 5カテゴリー×9品。レア度（★1〜★4）で出やすさが変わる
// 絵は画像ファイルを使わず、canvas にプログラムで描く（drawPrize）
// 商品名は一般名だけ（実在のブランド名は使わない）
// =============================================================

export const RARITY_WEIGHT = { 1: 55, 2: 30, 3: 11, 4: 4 };   // 出やすさ（%）
export const DUP_POINTS = { 1: 1, 2: 2, 3: 5, 4: 10 };        // ダブりでもらえるポイント
export const EXCHANGE_COST = { 1: 10, 2: 20, 3: 50, 4: 100 }; // 交換に必要なポイント

// shape：絵の形 / c：主な色 / c2：差し色
export const CATEGORIES = [
  {
    id: 'sweets', name: 'お菓子', color: '#ff8fb1',
    items: [
      { id: 'chips', name: 'ポテトチップス', rarity: 1, shape: 'bag', c: '#f4c430', c2: '#d9481c' },
      { id: 'choco', name: 'チョコレート', rarity: 1, shape: 'bar', c: '#6b3a1f', c2: '#c0392b' },
      { id: 'cookie', name: 'クッキー', rarity: 1, shape: 'cookie', c: '#d9a35b', c2: '#5a3416' },
      { id: 'candy', name: 'キャンディ', rarity: 1, shape: 'candy', c: '#ff5e8a', c2: '#ffd1dc' },
      { id: 'gummy', name: 'グミ', rarity: 2, shape: 'jar', c: '#ffffff', c2: '#ff6b6b' },
      { id: 'senbei', name: 'せんべい', rarity: 2, shape: 'senbei', c: '#c98a3f', c2: '#1e3a1e' },
      { id: 'donut', name: 'ドーナツ', rarity: 2, shape: 'donut', c: '#d9a35b', c2: '#ff8fb1' },
      { id: 'shortcake', name: 'ショートケーキ', rarity: 3, shape: 'cake', c: '#fff6e8', c2: '#e8263c' },
      { id: 'chocoset', name: '高級チョコ詰め合わせ', rarity: 4, shape: 'gift', c: '#3b1f12', c2: '#d4af37' }
    ]
  },
  {
    id: 'goods', name: '生活雑貨', color: '#7fb8ff',
    items: [
      { id: 'tissue', name: 'ティッシュ', rarity: 1, shape: 'tissue', c: '#8ec5ff', c2: '#ffffff' },
      { id: 'toilet', name: 'トイレットペーパー', rarity: 1, shape: 'roll', c: '#ffffff', c2: '#cfd8e3' },
      { id: 'toothbrush', name: '歯ブラシ', rarity: 1, shape: 'toothbrush', c: '#3fa7ff', c2: '#ffffff' },
      { id: 'detergent', name: '洗剤', rarity: 1, shape: 'detergent', c: '#2ecc71', c2: '#ffffff' },
      { id: 'mug', name: 'マグカップ', rarity: 2, shape: 'mug', c: '#ff7a59', c2: '#ffffff' },
      { id: 'towel', name: 'タオル', rarity: 2, shape: 'towel', c: '#ffd166', c2: '#ffffff' },
      { id: 'umbrella', name: '傘', rarity: 2, shape: 'umbrella', c: '#5b6cff', c2: '#2b2b2b' },
      { id: 'clock', name: '目覚まし時計', rarity: 3, shape: 'clock', c: '#e74c3c', c2: '#ffffff' },
      { id: 'kettle', name: '電気ケトル', rarity: 4, shape: 'kettle', c: '#ecf0f1', c2: '#2c3e50' }
    ]
  },
  {
    id: 'produce', name: '野菜・果物', color: '#7ed957',
    items: [
      { id: 'carrot', name: 'にんじん', rarity: 1, shape: 'carrot', c: '#ff8c1a', c2: '#3cb043' },
      { id: 'tomato', name: 'トマト', rarity: 1, shape: 'round', c: '#e8263c', c2: '#3cb043' },
      { id: 'onion', name: 'たまねぎ', rarity: 1, shape: 'onion', c: '#c98a3f', c2: '#8a5a2b' },
      { id: 'potato', name: 'じゃがいも', rarity: 1, shape: 'potato', c: '#c9a26b', c2: '#8a6a3f' },
      { id: 'apple', name: 'りんご', rarity: 2, shape: 'apple', c: '#d62828', c2: '#3cb043' },
      { id: 'banana', name: 'バナナ', rarity: 2, shape: 'banana', c: '#ffd93b', c2: '#7a5a1a' },
      { id: 'grape', name: 'ぶどう', rarity: 2, shape: 'grape', c: '#7b3fa0', c2: '#3cb043' },
      { id: 'melon', name: 'メロン', rarity: 3, shape: 'melon', c: '#9ccf5a', c2: '#e8f5d0' },
      { id: 'fruitbasket', name: 'フルーツ盛り合わせ', rarity: 4, shape: 'basket', c: '#c98a3f', c2: '#d62828' }
    ]
  },
  {
    id: 'drinks', name: '飲料', color: '#5fd3e8',
    items: [
      { id: 'tea', name: 'お茶', rarity: 1, shape: 'pet', c: '#3f8f3f', c2: '#d8f0c0' },
      { id: 'water', name: '水', rarity: 1, shape: 'pet', c: '#3fa7ff', c2: '#e8f6ff' },
      { id: 'coffee', name: '缶コーヒー', rarity: 1, shape: 'can', c: '#6b3a1f', c2: '#f0e0c8' },
      { id: 'orange', name: 'オレンジジュース', rarity: 1, shape: 'carton', c: '#ff9f1a', c2: '#ffffff' },
      { id: 'soda', name: '炭酸ソーダ', rarity: 2, shape: 'pet', c: '#2bc4d9', c2: '#ffffff' },
      { id: 'milk', name: '牛乳', rarity: 2, shape: 'carton', c: '#3f7fff', c2: '#ffffff' },
      { id: 'sports', name: 'スポーツドリンク', rarity: 2, shape: 'pet', c: '#1f6fd9', c2: '#e8f6ff' },
      { id: 'energy', name: 'エナジードリンク', rarity: 3, shape: 'can', c: '#1c1c1c', c2: '#9dff2e' },
      { id: 'juiceset', name: 'ジュースギフトセット', rarity: 4, shape: 'gift', c: '#ff9f1a', c2: '#ffffff' }
    ]
  },
  {
    id: 'chilled', name: '冷凍・冷蔵食品', color: '#b39dff',
    items: [
      { id: 'popsicle', name: 'アイスキャンディ', rarity: 1, shape: 'popsicle', c: '#5fd3e8', c2: '#d9a35b' },
      { id: 'yogurt', name: 'ヨーグルト', rarity: 1, shape: 'cup', c: '#ffffff', c2: '#ff8fb1' },
      { id: 'gyoza', name: '冷凍ギョーザ', rarity: 1, shape: 'gyoza', c: '#f3e3c3', c2: '#d9481c' },
      { id: 'pudding', name: 'プリン', rarity: 1, shape: 'pudding', c: '#ffd166', c2: '#7a3f12' },
      { id: 'pizza', name: '冷凍ピザ', rarity: 2, shape: 'pizza', c: '#f4c430', c2: '#d62828' },
      { id: 'cheese', name: 'チーズ', rarity: 2, shape: 'cheese', c: '#ffd93b', c2: '#e0b020' },
      { id: 'icecup', name: 'カップアイス', rarity: 2, shape: 'cup', c: '#fff6e8', c2: '#6b3a1f' },
      { id: 'shrimp', name: '冷凍エビ', rarity: 3, shape: 'shrimp', c: '#ff8a65', c2: '#ffffff' },
      { id: 'icegift', name: '高級アイス詰め合わせ', rarity: 4, shape: 'gift', c: '#5fd3e8', c2: '#d4af37' }
    ]
  }
];

export const ALL_ITEMS = CATEGORIES.flatMap(cat => cat.items.map(it => ({ ...it, cat: cat.id, catName: cat.name })));
export function findItem(id) { return ALL_ITEMS.find(it => it.id === id); }

// 抽選：レア度を重みで選んでから、そのレア度の中で等確率
export function drawPrize(rand = Math.random) {
  const total = Object.values(RARITY_WEIGHT).reduce((a, b) => a + b, 0);
  let r = rand() * total, rarity = 1;
  for (const [k, w] of Object.entries(RARITY_WEIGHT)) { if (r < w) { rarity = Number(k); break; } r -= w; }
  const pool = ALL_ITEMS.filter(it => it.rarity === rarity);
  return pool[Math.floor(rand() * pool.length)];
}

// ---------------------------------------------------------------
// 絵（canvas 2D）。size×size の正方形に描く
// ---------------------------------------------------------------
export function paintPrize(ctx, item, size) {
  const s = size / 100;            // 100×100 の座標で描いて拡大
  ctx.save();
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  (SHAPES[item.shape] || SHAPES.gift)(ctx, item.c, item.c2);
  ctx.restore();
}

// よく使う描き方
function fs(ctx, fill) { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function shine(ctx, x, y, w, h) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; rr(ctx, x, y, w, h, Math.min(w, h) / 2); ctx.fill(); ctx.restore(); }
function leaf(ctx, x, y, rot, color) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ell(ctx, 0, -6, 4, 8); fs(ctx, color); ctx.restore(); }

const SHAPES = {
  bag(ctx, c, c2) {
    ctx.beginPath();
    ctx.moveTo(24, 18);
    for (let i = 0; i <= 8; i++) ctx.lineTo(24 + i * 6.5, i % 2 ? 14 : 18);
    ctx.lineTo(78, 84); ctx.lineTo(22, 84); ctx.closePath(); fs(ctx, c);
    ell(ctx, 50, 52, 17, 13); fs(ctx, c2);
    ell(ctx, 50, 52, 9, 6); fs(ctx, '#ffe08a');
    shine(ctx, 28, 26, 6, 40);
  },
  bar(ctx, c, c2) {
    ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.25);
    rr(ctx, -30, -20, 60, 40, 4); fs(ctx, c);
    for (let i = -1; i <= 1; i++) for (let j = 0; j <= 1; j++) { rr(ctx, -26 + (i + 1) * 18, -16 + j * 17, 15, 14, 2); fs(ctx, '#7d4a2a'); }
    rr(ctx, -32, -3, 64, 26, 3); fs(ctx, c2);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CHOCO', 0, 14);
    ctx.restore();
  },
  cookie(ctx, c, c2) {
    circ(ctx, 50, 52, 30); fs(ctx, c);
    for (const [x, y] of [[38, 40], [60, 42], [48, 58], [64, 62], [34, 60], [52, 30]]) { circ(ctx, x, y, 3.5); fs(ctx, c2); }
  },
  candy(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(30, 50); ctx.lineTo(12, 36); ctx.lineTo(14, 64); ctx.closePath(); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(70, 50); ctx.lineTo(88, 36); ctx.lineTo(86, 64); ctx.closePath(); fs(ctx, c2);
    circ(ctx, 50, 50, 22); fs(ctx, c);
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(50, 50, 12, 0.3, 2.8); ctx.stroke(); ctx.restore();
  },
  jar(ctx, c, c2) {
    rr(ctx, 30, 18, 40, 10, 3); fs(ctx, '#ff6b6b');
    rr(ctx, 24, 28, 52, 56, 10); fs(ctx, 'rgba(255,255,255,0.85)');
    const cols = ['#ff6b6b', '#ffd93b', '#7ed957', '#5fd3e8', '#ff8fb1'];
    let k = 0;
    for (let y = 40; y <= 74; y += 11) for (let x = 34; x <= 66; x += 11) { ell(ctx, x, y, 4.5, 5.5); fs(ctx, cols[k++ % cols.length]); }
  },
  senbei(ctx, c, c2) {
    circ(ctx, 50, 50, 30); fs(ctx, c);
    for (const [x, y] of [[40, 40], [58, 36], [62, 58], [42, 62]]) { circ(ctx, x, y, 2); fs(ctx, '#8a5a2b'); }
    rr(ctx, 40, 22, 20, 56, 2); fs(ctx, c2);
  },
  donut(ctx, c, c2) {
    circ(ctx, 50, 52, 30); fs(ctx, c);
    ctx.beginPath(); ctx.arc(50, 50, 27, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill();
    circ(ctx, 50, 52, 10); fs(ctx, '#fff4ea');
    const cols = ['#fff', '#7ed957', '#5fd3e8', '#ffd93b'];
    for (let i = 0; i < 12; i++) { const a = i * 0.52, r = 19; ctx.save(); ctx.translate(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); ctx.rotate(a * 2); rr(ctx, -3, -1, 6, 2.5, 1); ctx.fillStyle = cols[i % 4]; ctx.fill(); ctx.restore(); }
  },
  cake(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(18, 74); ctx.lineTo(82, 74); ctx.lineTo(82, 46); ctx.lineTo(18, 36); ctx.closePath(); fs(ctx, '#f3d9a4');
    ctx.beginPath(); ctx.moveTo(18, 36); ctx.lineTo(82, 46); ctx.lineTo(82, 52); ctx.lineTo(18, 42); ctx.closePath(); fs(ctx, c);
    rr(ctx, 18, 56, 64, 6, 2); fs(ctx, '#ffd1dc');
    circ(ctx, 50, 32, 9); fs(ctx, c2); leaf(ctx, 50, 24, 0, '#3cb043');
  },
  gift(ctx, c, c2) {
    rr(ctx, 18, 38, 64, 46, 4); fs(ctx, c);
    rr(ctx, 14, 30, 72, 12, 3); fs(ctx, c);
    rr(ctx, 45, 30, 10, 54, 1); fs(ctx, c2);
    ctx.beginPath(); ctx.ellipse(40, 24, 10, 6, -0.5, 0, Math.PI * 2); fs(ctx, c2);
    ctx.beginPath(); ctx.ellipse(60, 24, 10, 6, 0.5, 0, Math.PI * 2); fs(ctx, c2);
    circ(ctx, 50, 28, 4); fs(ctx, c2);
  },
  tissue(ctx, c, c2) {
    rr(ctx, 16, 40, 68, 40, 4); fs(ctx, c);
    rr(ctx, 30, 48, 40, 8, 4); fs(ctx, '#5a8fd0');
    ctx.beginPath(); ctx.moveTo(38, 52); ctx.quadraticCurveTo(30, 26, 50, 22); ctx.quadraticCurveTo(70, 26, 62, 52); ctx.closePath(); fs(ctx, c2);
  },
  roll(ctx, c, c2) {
    rr(ctx, 26, 30, 48, 50, 4); fs(ctx, c);
    ell(ctx, 50, 30, 24, 9); fs(ctx, '#f6f6f6');
    ell(ctx, 50, 30, 8, 3.5); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(74, 60); ctx.lineTo(84, 64); ctx.lineTo(84, 88); ctx.lineTo(74, 84); ctx.closePath(); fs(ctx, c);
  },
  toothbrush(ctx, c, c2) {
    ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.7);
    rr(ctx, -38, -5, 58, 10, 5); fs(ctx, c);
    rr(ctx, 20, -7, 20, 14, 3); fs(ctx, c);
    for (let i = 0; i < 5; i++) { rr(ctx, 22 + i * 3.5, -18, 2.5, 12, 1); fs(ctx, i % 2 ? '#5fd3e8' : c2); }
    ctx.restore();
  },
  detergent(ctx, c, c2) {
    rr(ctx, 26, 30, 44, 54, 8); fs(ctx, c);
    rr(ctx, 36, 18, 18, 14, 3); fs(ctx, '#ffffff');
    ctx.beginPath(); ctx.arc(70, 50, 10, -1.2, 1.2); ctx.lineWidth = 5; ctx.strokeStyle = c; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 32, 48, 32, 20, 4); fs(ctx, c2);
    circ(ctx, 48, 58, 5); fs(ctx, '#5fd3e8');
  },
  mug(ctx, c, c2) {
    ctx.beginPath(); ctx.arc(72, 52, 12, -1.3, 1.3); ctx.lineWidth = 7; ctx.strokeStyle = c; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 24, 30, 48, 52, 8); fs(ctx, c);
    ell(ctx, 48, 31, 22, 5); fs(ctx, '#6b3a1f');
    circ(ctx, 48, 58, 9); fs(ctx, c2);
  },
  towel(ctx, c, c2) {
    for (let i = 0; i < 3; i++) { rr(ctx, 18 + i * 2, 66 - i * 16, 64 - i * 4, 16, 5); fs(ctx, i % 2 ? c2 : c); }
    rr(ctx, 18, 70, 64, 4, 2); ctx.fillStyle = c2; ctx.fill();
  },
  umbrella(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(14, 50); ctx.quadraticCurveTo(50, 2, 86, 50);
    for (let i = 3; i >= 0; i--) ctx.quadraticCurveTo(14 + i * 18 + 9, 42, 14 + i * 18, 50);
    ctx.closePath(); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(50, 46); ctx.lineTo(50, 82); ctx.arc(44, 82, 6, 0, Math.PI); ctx.lineWidth = 4; ctx.strokeStyle = c2; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  },
  clock(ctx, c, c2) {
    circ(ctx, 32, 24, 9); fs(ctx, c); circ(ctx, 68, 24, 9); fs(ctx, c);
    circ(ctx, 50, 54, 28); fs(ctx, c);
    circ(ctx, 50, 54, 21); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(50, 54); ctx.lineTo(50, 40); ctx.moveTo(50, 54); ctx.lineTo(60, 58); ctx.lineWidth = 3; ctx.strokeStyle = '#333'; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  },
  kettle(ctx, c, c2) {
    rr(ctx, 20, 82, 56, 6, 3); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(26, 82); ctx.lineTo(30, 30); ctx.lineTo(66, 30); ctx.lineTo(70, 82); ctx.closePath(); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(14, 26); ctx.lineTo(16, 22); ctx.lineTo(32, 28); ctx.closePath(); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(66, 36); ctx.quadraticCurveTo(88, 38, 84, 60); ctx.quadraticCurveTo(82, 72, 69, 72); ctx.lineWidth = 6; ctx.strokeStyle = c2; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, 32, 24, 32, 7, 3); fs(ctx, c2);
    shine(ctx, 36, 38, 6, 34);
  },
  carrot(ctx, c, c2) {
    leaf(ctx, 44, 24, -0.5, c2); leaf(ctx, 50, 20, 0, c2); leaf(ctx, 56, 24, 0.5, c2);
    ctx.beginPath(); ctx.moveTo(36, 30); ctx.quadraticCurveTo(50, 22, 64, 30); ctx.lineTo(52, 88); ctx.lineTo(48, 88); ctx.closePath(); fs(ctx, c);
    for (const y of [44, 58, 70]) { ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(52, y + 2); ctx.stroke(); }
  },
  round(ctx, c, c2) {
    circ(ctx, 50, 56, 28); fs(ctx, c);
    for (let i = 0; i < 5; i++) leaf(ctx, 50, 32, i * 1.26, c2);
    shine(ctx, 32, 44, 8, 16);
  },
  onion(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(50, 16); ctx.quadraticCurveTo(54, 30, 74, 46); ctx.quadraticCurveTo(84, 76, 50, 84); ctx.quadraticCurveTo(16, 76, 26, 46); ctx.quadraticCurveTo(46, 30, 50, 16); ctx.closePath(); fs(ctx, c);
    for (const x of [40, 50, 60]) { ctx.beginPath(); ctx.moveTo(50, 22); ctx.quadraticCurveTo(x, 50, 50 + (x - 50) * 0.6, 82); ctx.stroke(); }
  },
  potato(ctx, c, c2) {
    ctx.beginPath(); ctx.ellipse(50, 54, 32, 22, 0.3, 0, Math.PI * 2); fs(ctx, c);
    for (const [x, y] of [[36, 48], [56, 44], [62, 62], [44, 64]]) { circ(ctx, x, y, 2.2); fs(ctx, c2); }
  },
  apple(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(50, 32); ctx.bezierCurveTo(30, 18, 12, 40, 22, 62); ctx.bezierCurveTo(30, 84, 44, 86, 50, 80); ctx.bezierCurveTo(56, 86, 70, 84, 78, 62); ctx.bezierCurveTo(88, 40, 70, 18, 50, 32); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(50, 32); ctx.lineTo(52, 18); ctx.lineWidth = 3; ctx.strokeStyle = '#6b3a1f'; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    leaf(ctx, 58, 22, 1.1, c2); shine(ctx, 30, 42, 7, 16);
  },
  banana(ctx, c, c2) {
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(50, 50); ctx.rotate((i - 1) * 0.25);
      ctx.beginPath(); ctx.moveTo(-34, -18); ctx.quadraticCurveTo(-10, 34, 34, 8); ctx.quadraticCurveTo(-6, 22, -26, -22); ctx.closePath(); fs(ctx, c);
      ctx.restore();
    }
    rr(ctx, 14, 26, 10, 8, 2); fs(ctx, c2);
  },
  grape(ctx, c, c2) {
    leaf(ctx, 56, 20, 1.2, c2);
    let y = 30;
    for (const row of [[34, 46, 58, 70], [40, 52, 64], [46, 58], [52]]) { for (const x of row) { circ(ctx, x, y, 7); fs(ctx, c); } y += 12; }
  },
  melon(ctx, c, c2) {
    circ(ctx, 50, 54, 30); fs(ctx, c);
    ctx.save(); circ(ctx, 50, 54, 29); ctx.clip(); ctx.strokeStyle = c2; ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 9, 24); ctx.lineTo(50 + i * 9, 86); ctx.stroke(); ctx.beginPath(); ctx.moveTo(70 + i * 9, 24); ctx.lineTo(50 + i * 9, 86); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(44, 22); ctx.lineTo(50, 26); ctx.lineTo(56, 22); ctx.lineWidth = 3; ctx.strokeStyle = '#6b8f3f'; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  },
  basket(ctx, c, c2) {
    circ(ctx, 36, 44, 12); fs(ctx, c2);
    circ(ctx, 64, 42, 11); fs(ctx, '#ff9f1a');
    circ(ctx, 50, 36, 10); fs(ctx, '#7b3fa0');
    ctx.save(); ctx.translate(58, 30); ctx.rotate(0.6); ell(ctx, 0, 0, 14, 5); fs(ctx, '#ffd93b'); ctx.restore();
    ctx.beginPath(); ctx.moveTo(14, 50); ctx.lineTo(86, 50); ctx.lineTo(76, 84); ctx.lineTo(24, 84); ctx.closePath(); fs(ctx, c);
    ctx.save(); ctx.strokeStyle = '#8a5a2b'; for (let x = 24; x <= 76; x += 9) { ctx.beginPath(); ctx.moveTo(x, 52); ctx.lineTo(x + 2, 82); ctx.stroke(); } ctx.restore();
  },
  pet(ctx, c, c2) {
    rr(ctx, 42, 12, 16, 10, 2); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(42, 22); ctx.lineTo(58, 22); ctx.quadraticCurveTo(70, 30, 68, 42); ctx.lineTo(68, 84); ctx.quadraticCurveTo(50, 90, 32, 84); ctx.lineTo(32, 42); ctx.quadraticCurveTo(30, 30, 42, 22); ctx.closePath(); fs(ctx, c2);
    rr(ctx, 32, 48, 36, 22, 2); fs(ctx, c);
    shine(ctx, 36, 28, 5, 18);
  },
  can(ctx, c, c2) {
    rr(ctx, 30, 20, 40, 64, 6); fs(ctx, c);
    ell(ctx, 50, 20, 20, 5); fs(ctx, '#cfd8e3');
    rr(ctx, 30, 44, 40, 16, 1); fs(ctx, c2);
    shine(ctx, 34, 26, 5, 50);
  },
  carton(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(30, 34); ctx.lineTo(50, 16); ctx.lineTo(70, 34); ctx.closePath(); fs(ctx, c2);
    rr(ctx, 30, 34, 40, 52, 2); fs(ctx, c2);
    rr(ctx, 30, 48, 40, 26, 1); fs(ctx, c);
    circ(ctx, 50, 61, 7); fs(ctx, c2);
  },
  popsicle(ctx, c, c2) {
    rr(ctx, 46, 64, 8, 24, 3); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(32, 66); ctx.lineTo(32, 32); ctx.quadraticCurveTo(50, 8, 68, 32); ctx.lineTo(68, 66); ctx.closePath(); fs(ctx, c);
    shine(ctx, 38, 30, 5, 28);
  },
  cup(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(24, 36); ctx.lineTo(76, 36); ctx.lineTo(68, 82); ctx.lineTo(32, 82); ctx.closePath(); fs(ctx, c);
    ell(ctx, 50, 36, 27, 7); fs(ctx, c2);
    rr(ctx, 34, 52, 32, 14, 3); fs(ctx, c2);
  },
  gyoza(ctx, c, c2) {
    rr(ctx, 14, 46, 72, 36, 5); fs(ctx, c2);
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(30 + i * 20, 52); ctx.beginPath(); ctx.moveTo(-10, 8); ctx.quadraticCurveTo(0, -18, 10, 8); ctx.closePath(); fs(ctx, c); ctx.restore();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ギョーザ', 50, 76);
  },
  pudding(ctx, c, c2) {
    ell(ctx, 50, 82, 30, 6); fs(ctx, '#e8eef5');
    ctx.beginPath(); ctx.moveTo(30, 80); ctx.lineTo(36, 36); ctx.lineTo(64, 36); ctx.lineTo(70, 80); ctx.closePath(); fs(ctx, c);
    ell(ctx, 50, 36, 14, 5); fs(ctx, c2);
    ctx.beginPath(); ctx.moveTo(36, 38); ctx.quadraticCurveTo(50, 50, 64, 38); ctx.lineTo(64, 36); ctx.lineTo(36, 36); ctx.closePath(); ctx.fillStyle = c2; ctx.fill();
    circ(ctx, 50, 26, 5); fs(ctx, '#e8263c');
  },
  pizza(ctx, c, c2) {
    circ(ctx, 50, 52, 32); fs(ctx, '#d9a35b');
    circ(ctx, 50, 52, 26); fs(ctx, c);
    for (const [x, y] of [[40, 42], [60, 40], [52, 58], [36, 62], [66, 60]]) { circ(ctx, x, y, 5); fs(ctx, c2); }
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(50, 52); ctx.lineTo(50 + Math.cos(i * 0.785) * 26, 52 + Math.sin(i * 0.785) * 26); ctx.stroke(); }
  },
  cheese(ctx, c, c2) {
    ctx.beginPath(); ctx.moveTo(14, 70); ctx.lineTo(80, 36); ctx.lineTo(86, 70); ctx.closePath(); fs(ctx, c);
    ctx.beginPath(); ctx.moveTo(14, 70); ctx.lineTo(86, 70); ctx.lineTo(86, 82); ctx.lineTo(14, 82); ctx.closePath(); fs(ctx, c2);
    for (const [x, y, r] of [[60, 60, 5], [74, 52, 3.5], [40, 64, 3], [70, 76, 3]]) { circ(ctx, x, y, r); fs(ctx, '#e0b020'); }
  },
  shrimp(ctx, c, c2) {
    // 丸まったエビ：頭から尾へ、弧に沿って節を並べる
    const N = 7;
    for (let i = N - 1; i >= 0; i--) {
      const a = -2.7 + i * 0.5, r = 22;
      const x = 50 + Math.cos(a) * r, y = 52 + Math.sin(a) * r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ell(ctx, 0, 0, 12 - i * 0.9, 8 - i * 0.4); fs(ctx, i % 2 ? '#ffab91' : c);
      ctx.restore();
    }
    const ta = -2.7 + N * 0.5, tx = 50 + Math.cos(ta) * 22, ty = 52 + Math.sin(ta) * 22;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(-8, 12); ctx.lineTo(8, 12); ctx.closePath(); fs(ctx, c);
    ctx.restore();
    const hx = 50 + Math.cos(-2.7) * 22, hy = 52 + Math.sin(-2.7) * 22;
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 4); ctx.quadraticCurveTo(hx - 20, hy - 22, hx - 6, hy - 34); ctx.moveTo(hx - 2, hy - 6); ctx.quadraticCurveTo(hx - 8, hy - 26, hx + 10, hy - 32); ctx.stroke();
    circ(ctx, hx + 2, hy - 2, 2.2); fs(ctx, '#222');
  }
};
