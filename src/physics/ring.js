// =============================================================
// リング：カプセルを輪状に並べた複合形状
// 生成時はリング面が x-y 平面（穴の向き＝z方向＝手前-奥）。yawDeg で回す
// 鎖の最下段 → つなぎの小さいリング → 大きいリング の順に球面ジョイントでつなぐ
// （実機は径の大きいリングは細く、径の小さいつなぎのリングは太い）
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from './world.js';

const SEGMENTS = 16;
const LINK_SEGMENTS = 10;  // つなぎのリングの分割数

export function createRing(RAPIER, world, preset, chain, armPos) {
  const g = preset.ring;
  const th = g.thickness;
  const tubeR = th / 2;
  const Rc = (g.diameter - th) / 2;          // 中心線の半径
  const yaw = (g.yawDeg || 0) * Math.PI / 180;
  const qYaw = quatAxisAngle(0, 1, 0, yaw);

  // ---- つなぎの小さいリング（大きいリングと直交する向き：穴の向き＝x方向）----
  const k = preset.connector;
  const kTube = k.thickness / 2;
  const kRc = (k.diameter - k.thickness) / 2;
  const kCenter = { x: armPos.x, y: chain.bottomY - kRc, z: armPos.z };
  const qLink = quatMulYawY(qYaw); // 大きいリングに対して90°回した向き
  const link = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(kCenter.x, kCenter.y, kCenter.z)
      .setRotation(qLink)
      .setLinearDamping(g.linearDamping)
      .setAngularDamping(g.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(false)
  );
  const kChord = 2 * kRc * Math.sin(Math.PI / LINK_SEGMENTS);
  for (let i = 0; i < LINK_SEGMENTS; i++) {
    const phi = (i + 0.5) * (2 * Math.PI / LINK_SEGMENTS);
    world.createCollider(
      RAPIER.ColliderDesc.capsule(Math.max(kChord / 2, 0.01), kTube)
        .setTranslation(kRc * Math.cos(phi), kRc * Math.sin(phi), 0)
        .setRotation(quatAxisAngle(0, 0, 1, phi))
        .setMass(k.mass / LINK_SEGMENTS)
        .setFriction(g.friction)
        .setCollisionGroups(groups(GROUP.CHAIN, GROUP.TABLE | GROUP.BOARD)),
      link
    );
  }
  // 鎖の最下段 → つなぎのリング上端
  world.createImpulseJoint(
    RAPIER.JointData.spherical(chain.bottomAnchor, { x: 0, y: kRc, z: 0 }),
    chain.bottom, link, true
  );

  const center = { x: armPos.x, y: kCenter.y - kRc - Rc, z: armPos.z };
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
        .setCollisionGroups(groups(GROUP.RING, GROUP.TABLE | GROUP.BOARD)),
      body
    );
  }

  // つなぎのリング下端 → 大きいリング上端
  world.createImpulseJoint(
    RAPIER.JointData.spherical({ x: 0, y: -kRc, z: 0 }, { x: 0, y: Rc, z: 0 }),
    link, body, true
  );

  const ring = {
    body,
    Rc,
    tubeR,
    innerR: Rc - tubeR,
    link,                                   // つなぎのリング
    linkSpan: 2 * kRc,                      // つなぎのリングの長さ（上端〜下端の中心線）
    visual: {
      body,
      parts: [{ type: 'torus', radius: Rc, tube: tubeR, pos: [0, 0, 0], color: 0xc9ccd3 /* シルバー */, castShadow: false }]
    },
    linkVisual: {
      body: link,
      // 見た目は二重リング（キーリング型）：線を2周巻いた形
      parts: [{ type: 'splitring', radius: kRc, wire: k.thickness / 4, gap: k.thickness / 2, pos: [0, 0, 0], color: 0xc9ccd3, castShadow: false }]
    }
  };
  return ring;
}

// 大きいリングの向きから、縦軸まわりに90°回した向き（つなぎのリング用）
function quatMulYawY(qYaw) {
  const q90 = quatAxisAngle(0, 1, 0, Math.PI / 2);
  return {
    w: qYaw.w * q90.w - qYaw.y * q90.y,
    x: 0,
    y: qYaw.w * q90.y + qYaw.y * q90.w,
    z: 0
  };
}

// リングの向き（穴の軸）をワールド座標で返す
export function ringAxis(ring) {
  const q = ring.body.rotation();
  return rotateVec(q, { x: 0, y: 0, z: 1 });
}
