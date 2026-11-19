// =============================================================
// 筐体の飾り（見た目だけ。当たり判定はなし）
// テーマ「キュート」「クール」ごとに、用意した画像（assets/cabinet/）を貼る
//   back_*.webp  … 背面の壁（1024×1536）
//   side_*.webp  … 左の側面の壁（1024×1536）。右は左右反転して使う
//   floor_*.webp … 床（くり返して貼る）
//   frame_*.webp … 手前の枠（真ん中が透明）。上（天幕）・左右（柱）・下（電球の帯）に切り分けて、筐体の手前の口に立てる
// =============================================================

export const CAB = { halfW: 20, height: 58, front: 14 };
const BASE = './assets/cabinet/';
const FLOOR_TILE = 12;   // 床の画像1枚の大きさ（cm）

// テクスチャは読み込みなおさず使い回す
const texCache = {};
function tex(THREE, name, { repeat = null, flipX = false } = {}) {
  const key = name + (flipX ? '#flip' : '');
  if (!texCache[key]) {
    const t = new THREE.TextureLoader().load(BASE + name + '.webp');
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.keep = true;   // 使い回すので、片付けのときに捨てない
    if (flipX) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
    texCache[key] = t;
  }
  const t = texCache[key];
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function buildCabinet(THREE, { field, theme }) {
  const g = new THREE.Group();
  const th = theme === 'cool' ? 'cool' : 'cute';
  const back = -10 - 4.6;   // 背面：景品パネルのすぐ後ろ（移動範囲を変えても動かない）
  const depth = CAB.front - back, zc = (CAB.front + back) / 2;
  const H = CAB.height, yMid = H / 2 - 2;
  const flat = map => new THREE.MeshBasicMaterial({ map, toneMapped: false });

  // 背面の壁
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(CAB.halfW * 2, H), flat(tex(THREE, `back_${th}`)));
  wall.position.set(0, yMid, back);
  g.add(wall);

  // 左右の側面（左はそのまま、右は左右反転）
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(depth, H), flat(tex(THREE, `side_${th}`, { flipX: sx > 0 })));
    m.position.set(sx * CAB.halfW, yMid, zc);
    m.rotation.y = -sx * Math.PI / 2;   // 内側を向ける
    g.add(m);
  }
  // 手前の枠：取り出し口の穴より手前に立てる。置く位置と大きさは正面カメラに合わせて layoutFrame で決める
  const s = FRAME.slice[th], map = tex(THREE, `frame_${th}`);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.05, toneMapped: false, depthTest: false });
  const piece = (name, x0, x1, y0, y1) => {
    const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (uv.getX(i) ? x1 : x0) / FRAME.imgW, 1 - (uv.getY(i) ? y0 : y1) / FRAME.imgH);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.z = FRAME.z; m.renderOrder = 10;
    m.userData.framePart = name;
    g.add(m);
  };
  piece('top', 0, FRAME.imgW, 0, s.top);
  piece('bottom', 0, FRAME.imgW, s.bottom[0], s.bottom[1]);
  piece('left', 0, s.side, s.top, s.bottom[0]);
  piece('right', FRAME.imgW - s.side, FRAME.imgW, s.top, s.bottom[0]);

  // クール：窓のまわりの縁取り（銀色の金属の縁＋青く光るネオンのライン）。角は丸くする
  //   形と位置は layoutFrame で決める（画面の大きさで変わるので、その都度作る）
  //   筐体の外形（四隅の丸み・外側のネオン）は、画面側の index.html で付ける
  if (th === 'cool') {
    const chrome = new THREE.MeshBasicMaterial({ color: 0xb8c4d4, toneMapped: false, depthTest: false });
    const neon = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false, depthTest: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0x2aa8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
      toneMapped: false, depthTest: false, depthWrite: false });
    for (const [m, px, order] of [[glow, 44, 11], [chrome, 18, 12], [neon, 6, 13]]) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      mesh.renderOrder = order;
      mesh.userData.trimRing = { px, THREE };
      g.add(mesh);
    }
  }
  return g;
}

// 手前の枠の画像の切り分け（画像のピクセル）
//   top：天幕の下の端　bottom：電球の帯の上下　side：柱の幅
export const FRAME = {
  z: 15.5, imgW: 1024, imgH: 1536,
  slice: {
    cute: { top: 250, bottom: [1380, 1460], side: 100 },
    cool: { top: 215, bottom: [1440, 1536], side: 100 }
  }
};

// 枠の部品を並べる。L/R/T/B は、正面カメラで見たときの画面の左右上下の端（枠を立てる面での座標）
export function layoutFrame(g, theme, { L, R, T, B }) {
  const s = FRAME.slice[theme === 'cool' ? 'cool' : 'cute'];
  const W = R - L, k = W / FRAME.imgW;
  const topH = s.top * k, botH = (s.bottom[1] - s.bottom[0]) * k, sideW = s.side * k;
  const midTop = T - topH, midBot = B + botH;
  for (const m of g.children) {
    const p = m.userData.framePart;
    if (!p) continue;
    if (p === 'top') { m.scale.set(W, topH, 1); m.position.set((L + R) / 2, T - topH / 2, FRAME.z); }
    if (p === 'bottom') { m.scale.set(W, botH, 1); m.position.set((L + R) / 2, B + botH / 2, FRAME.z); }
    if (p === 'left' || p === 'right') {
      m.scale.set(sideW, midTop - midBot, 1);
      m.position.set(p === 'left' ? L + sideW / 2 : R - sideW / 2, (midTop + midBot) / 2, FRAME.z);
    }
  }
  // 窓のまわりの縁取り（クール）：角の丸い四角の輪。太さは画像のピクセルで決めて、画面の大きさに合わせる
  const x0 = L + sideW, x1 = R - sideW, cx = (L + R) / 2, cy = (midTop + midBot) / 2;
  const ww = x1 - x0, hh = midTop - midBot, RAD = 60 * k;   // 角の丸み
  for (const m of g.children) {
    const t = m.userData.trimRing;
    if (!t) continue;
    const THREE = t.THREE, w = t.px * k;
    const rrect = (path, hw, hh2, r) => {
      r = Math.min(r, hw, hh2);
      path.moveTo(-hw + r, -hh2);
      path.lineTo(hw - r, -hh2); path.quadraticCurveTo(hw, -hh2, hw, -hh2 + r);
      path.lineTo(hw, hh2 - r); path.quadraticCurveTo(hw, hh2, hw - r, hh2);
      path.lineTo(-hw + r, hh2); path.quadraticCurveTo(-hw, hh2, -hw, hh2 - r);
      path.lineTo(-hw, -hh2 + r); path.quadraticCurveTo(-hw, -hh2, -hw + r, -hh2);
      return path;
    };
    const shape = rrect(new THREE.Shape(), ww / 2 + w / 2, hh / 2 + w / 2, RAD + w / 2);
    shape.holes.push(rrect(new THREE.Path(), ww / 2 - w / 2, hh / 2 - w / 2, Math.max(0.01, RAD - w / 2)));
    m.geometry.dispose();
    m.geometry = new THREE.ShapeGeometry(shape, 12);
    m.position.set(cx, cy, FRAME.z + 0.01);
  }
}

// 床（台の上面）の材質：床の画像をくり返して貼る
export function floorMaterial(THREE, theme) {
  const th = theme === 'cool' ? 'cool' : 'cute';
  const map = tex(THREE, `floor_${th}`, { repeat: [60 / FLOOR_TILE, 50 / FLOOR_TILE] });
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.3, roughness: 0.35, metalness: 0.1 });
}

// 背景（筐体の外）の色
export function backgroundColor(theme) { return theme === 'cool' ? 0x05070c : 0x2a1745; }
