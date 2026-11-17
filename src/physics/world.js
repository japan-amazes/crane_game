// =============================================================
// 物理ワールドの初期化（Rapier）
// 単位：長さ=cm / 重さ=g / 時間=秒
// RAPIER は呼び出し側から渡す（ブラウザはCDN、テストはnpm版）
// =============================================================

// 衝突グループ（ビット）
export const GROUP = {
  TABLE: 0x0001, // 台（固定の床）
  BOARD: 0x0002, // 景品の板＋フック
  RING: 0x0004,  // リング
  CHAIN: 0x0008  // 鎖
};

// Rapier の衝突グループ値を作る（上位16bit=所属 / 下位16bit=当たる相手）
export function groups(member, filter) {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

// 物理の固定ステップ（1秒あたり240回）
export const STEP = 1 / 240;

export function createWorld(RAPIER) {
  const world = new RAPIER.World({ x: 0, y: -981, z: 0 });
  world.lengthUnit = 100;          // 1m = 100単位（cm）として誤差許容を合わせる
  world.timestep = STEP;
  world.numSolverIterations = 16;  // 鎖が伸びないよう多めに
  // 接触を硬めに：重い板を吊ったときにリングがフックへめり込んで抜けるのを防ぐ
  world.integrationParameters.contact_natural_frequency = 120;
  return world;
}

// 台（固定の床）。上面が y=0。傾きは手前-奥方向（x軸まわり）
export function createTable(RAPIER, world, preset) {
  const tilt = (preset.field.tableTiltDeg || 0) * Math.PI / 180;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0)
      .setRotation(quatAxisAngle(1, 0, 0, tilt))
  );
  const desc = RAPIER.ColliderDesc.cuboid(30, 1, 25)
    .setTranslation(0, -1, 0)
    .setFriction(1.0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max) // 板が台の上で滑らないように
    .setRestitution(0.05)
    .setCollisionGroups(groups(GROUP.TABLE, GROUP.BOARD | GROUP.RING | GROUP.CHAIN));
  world.createCollider(desc, body);

  const visual = {
    body,
    parts: [{ type: 'box', size: [60, 2, 50], pos: [0, -1, 0], color: 0x2a2f3a }]
  };
  return { body, visual };
}

// ---- 小さな数学ヘルパー ----
export function quatAxisAngle(x, y, z, angle) {
  const s = Math.sin(angle / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(angle / 2) };
}

export function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

export function rotateVec(q, v) {
  // v' = q * v * q^-1
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x
  };
}
