// =============================================================
// 筐体の飾り（見た目だけ。当たり判定はなし）
// テーマ「キュート」「クール」ごとに、用意した画像（assets/cabinet/）を貼る
//   back_*.webp  … 背面の壁（1024×1536）
//   side_*.webp  … 左の側面の壁（1024×1536）。右は左右反転して使う
//   floor_*.webp … 床（くり返して貼る）
//   frame_*.webp … 手前の枠（真ん中が透明）。3Dの上に重ねる画像として、画面側（index.html）で使う
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
  const back = (field ? field.zBack : -10) - 4.6;   // 背面：景品パネルのすぐ後ろ
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
  return g;
}

// 床（台の上面）の材質：床の画像をくり返して貼る
export function floorMaterial(THREE, theme) {
  const th = theme === 'cool' ? 'cool' : 'cute';
  const map = tex(THREE, `floor_${th}`, { repeat: [60 / FLOOR_TILE, 50 / FLOOR_TILE] });
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.1 });
}

// 手前の枠の画像
export function frameImage(theme) { return `${BASE}frame_${theme === 'cool' ? 'cool' : 'cute'}.webp`; }

// 背景（筐体の外）の色
export function backgroundColor(theme) { return theme === 'cool' ? 0x05070c : 0x2a1745; }
