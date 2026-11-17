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
  CHAIN: 0x0008, // 鎖
  PRIZE: 0x0010  // 景品の箱
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
// hole：取り出し口の穴 { x0, x1, z0, z1 }（あれば床をその形に抜く）
export function createTable(RAPIER, world, preset, hole = null) {
  const tilt = (preset.field.tableTiltDeg || 0) * Math.PI / 180;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(0, 0, 0)
      .setRotation(quatAxisAngle(1, 0, 0, tilt))
  );
  // 床を長方形のかたまりに分けて作る（穴の部分を抜く）
  const X0 = -30, X1 = 30, Z0 = -25, Z1 = 25;
  const rects = !hole ? [[X0, X1, Z0, Z1]] : [
    [X0, hole.x0, Z0, Z1], [hole.x1, X1, Z0, Z1],
    [hole.x0, hole.x1, Z0, hole.z0], [hole.x0, hole.x1, hole.z1, Z1]
  ].filter(([a, b, c, d]) => b - a > 0.01 && d - c > 0.01);
  const parts = [];
  for (const [a, b, c, d] of rects) {
    const cx = (a + b) / 2, cz = (c + d) / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((b - a) / 2, 1, (d - c) / 2)
        .setTranslation(cx, -1, cz)
        .setFriction(1.0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max) // 板が台の上で滑らないように
        .setRestitution(0.05)
        .setCollisionGroups(groups(GROUP.TABLE, GROUP.BOARD | GROUP.RING | GROUP.CHAIN | GROUP.PRIZE)),
      body);
    parts.push({ type: 'box', size: [b - a, 2, d - c], pos: [cx, -1, cz], color: 0x2a2f3a });
  }
  if (hole) {
    // 穴の底（落ちた箱を受け止める）と、穴の中の暗い壁
    const cx = (hole.x0 + hole.x1) / 2, cz = (hole.z0 + hole.z1) / 2, w = hole.x1 - hole.x0, d = hole.z1 - hole.z0;
    const pit = (hx, hy, hz, sx, sy, sz) => world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(sx, sy, sz).setFriction(0.8)
        .setCollisionGroups(groups(GROUP.TABLE, GROUP.PRIZE)), body);
    pit(w / 2 + 1, 1, d / 2 + 1, cx, -13, cz);                       // 底
    pit(0.5, 7, d / 2 + 1, hole.x0 - 0.5, -6, cz);                    // 左右・手前奥の壁（箱が穴から出ないように）
    pit(0.5, 7, d / 2 + 1, hole.x1 + 0.5, -6, cz);
    pit(w / 2 + 1, 7, 0.5, cx, -6, hole.z0 - 0.5);
    pit(w / 2 + 1, 7, 0.5, cx, -6, hole.z1 + 0.5);
    parts.push({ type: 'box', size: [w, 0.2, d], pos: [cx, -11.9, cz], color: 0x07080b, castShadow: false });
    for (const [px, pz, sx, sz] of [[hole.x0, cz, 0.2, d], [hole.x1, cz, 0.2, d], [cx, hole.z0, w, 0.2], [cx, hole.z1, w, 0.2]]) {
      parts.push({ type: 'box', size: [sx, 12, sz], pos: [px, -6, pz], color: 0x0d0f14, castShadow: false });
    }
  }
  const visual = { body, parts };
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
