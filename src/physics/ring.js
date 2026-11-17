// =============================================================
// リング：カプセルを輪状に並べた複合形状
// 生成時はリング面が x-y 平面（穴の向き＝z方向＝手前-奥）。yawDeg で回す
// 鎖の最下段とリング上端を球面ジョイントでつなぐ
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from './world.js';

const SEGMENTS = 16;

export function createRing(RAPIER, world, preset, chain, armPos) {
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
        .setCollisionGroups(groups(GROUP.RING, GROUP.TABLE | GROUP.BOARD)),
      body
    );
  }

  // 鎖の最下段 → リング上端（ローカル (0, Rc, 0)）
  world.createImpulseJoint(
    RAPIER.JointData.spherical(chain.bottomAnchor, { x: 0, y: Rc, z: 0 }),
    chain.bottom, body, true
  );

  const ring = {
    body,
    Rc,
    tubeR,
    innerR: Rc - tubeR,
    targetYaw: yaw,
    twist: g.twistReturn || 0,
    visual: {
      body,
      parts: [{ type: 'torus', radius: Rc, tube: tubeR, pos: [0, 0, 0], color: 0xc9ccd3 /* シルバー */ }]
    }
  };
  return ring;
}

// リングの向き（穴の軸）をワールド座標で返す
export function ringAxis(ring) {
  const q = ring.body.rotation();
  return rotateVec(q, { x: 0, y: 0, z: 1 });
}

// 鎖のねじれ戻し：リングの向き（水平面での回転）を初期角へ戻すトルク
export function applyTwistReturn(ring, dt) {
  if (!ring.twist) return;
  const a = ringAxis(ring);
  const h = Math.hypot(a.x, a.z);
  if (h < 0.2) return; // 横倒し時は効かせない
  const yawNow = Math.atan2(a.x, a.z);
  let err = yawNow - ring.targetYaw;
  // 穴の向きは表裏同じなので ±90° に折りたたむ
  while (err > Math.PI / 2) err -= Math.PI;
  while (err < -Math.PI / 2) err += Math.PI;
  const w = ring.body.angvel();
  const torque = (-ring.twist * err - ring.twist * 0.2 * w.y) * dt;
  ring.body.applyTorqueImpulse({ x: 0, y: torque, z: 0 }, true);
}

