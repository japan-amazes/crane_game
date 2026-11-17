// =============================================================
// リング：カプセルを輪状に並べた複合形状
// 生成時はリング面が x-y 平面（穴の向き＝z方向＝手前-奥）。yawDeg で回す
// アーム →（ロープ＝チェーン＋つなぎのリングの長さ）→ 大きいリング
// チェーンとつなぎのリングの見た目と動き（たるみ・当たり判定）は chain.js が受け持つ
// （実機は径の大きいリングは細く、径の小さいつなぎのリングは太い）
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from './world.js';

const SEGMENTS = 16;

export function createRing(RAPIER, world, preset, chain, armPos, armBody) {
  const g = preset.ring;
  const th = g.thickness;
  const tubeR = th / 2;
  const Rc = (g.diameter - th) / 2;          // 中心線の半径
  const yaw = (g.yawDeg || 0) * Math.PI / 180;
  const qYaw = quatAxisAngle(0, 1, 0, yaw);

  const center = { x: armPos.x, y: chain.bottomY - Rc, z: armPos.z };
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setRotation(qYaw)
      .setLinearDamping(g.linearDamping)
      .setAngularDamping(g.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(false)     // 揺れが小さくなった途中で急に止まらないように
  );

  // 弦の長さ分のカプセルを円周に並べる
  const chord = 2 * Rc * Math.sin(Math.PI / SEGMENTS);
  const halfH = Math.max(chord / 2, 0.01);
  for (let i = 0; i < SEGMENTS; i++) {
    const phi = (i + 0.5) * (2 * Math.PI / SEGMENTS);
    const q = quatAxisAngle(0, 0, 1, phi); // y軸 → 接線方向
    world.createCollider(
      RAPIER.ColliderDesc.capsule(halfH, tubeR)
        .setTranslation(Rc * Math.cos(phi), Rc * Math.sin(phi), 0)
        .setRotation(q)
        .setMass(g.mass / SEGMENTS)
        .setFriction(g.friction)
        .setCollisionGroups(groups(GROUP.RING, GROUP.TABLE | GROUP.BOARD | GROUP.PRIZE)),
      body
    );
  }

  // アーム → 大きいリング上端：チェーン＋つなぎのリングの長さの「ロープ」
  // （張れば伸びず、たるむことはできる。リングと景品の重さはここで支える）
  world.createImpulseJoint(
    RAPIER.JointData.rope(chain.length, { x: 0, y: 0, z: 0 }, { x: 0, y: Rc, z: 0 }),
    armBody, body, true
  );

  const ring = {
    body,
    Rc,
    tubeR,
    innerR: Rc - tubeR,
    top() {                                 // 大きいリング上端（チェーンの下端）のワールド座標
      const t = body.translation();
      const r = rotateVec(body.rotation(), { x: 0, y: Rc, z: 0 });
      return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
    },
    visual: {
      body,
      parts: [{ type: 'torus', radius: Rc, tube: tubeR, pos: [0, 0, 0], color: 0xe6e8ec /* メッキ調シルバー */, finish: 'chrome', castShadow: false }]
    }
  };
  return ring;
}

// リングの向き（穴の軸）をワールド座標で返す
export function ringAxis(ring) {
  const q = ring.body.rotation();
  return rotateVec(q, { x: 0, y: 0, z: 1 });
}
