// =============================================================
// 鎖：短い棒（カプセル）を球面ジョイントで数珠つなぎにする
// 一番上はアーム、一番下はリングにつながる
// 鎖同士・鎖とリングは当たらない（フック・板・台には当たる）
// =============================================================
import { GROUP, groups } from './world.js';

export function createChain(RAPIER, world, preset, armBody, armPos) {
  const c = preset.chain;
  const n = Math.max(2, Math.round(c.links));
  const segLen = c.length / n;
  const r = c.linkRadius;
  const halfH = Math.max(segLen / 2 - r, 0.02);

  const links = [];
  const parts = [];
  let prev = armBody;
  let prevAnchor = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < n; i++) {
    const cy = armPos.y - segLen * (i + 0.5);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(armPos.x, cy, armPos.z)
        .setLinearDamping(c.linearDamping)
        .setAngularDamping(c.angularDamping)
        .setCcdEnabled(true)
    );
    world.createCollider(
      RAPIER.ColliderDesc.capsule(halfH, r)
        .setMass(c.linkMass)
        .setFriction(0.3)
        .setCollisionGroups(groups(GROUP.CHAIN, GROUP.TABLE | GROUP.BOARD)),
      body
    );
    const joint = RAPIER.JointData.spherical(prevAnchor, { x: 0, y: segLen / 2, z: 0 });
    world.createImpulseJoint(joint, prev, body, true);

    links.push(body);
    parts.push({
      body,
      parts: [{ type: 'capsule', radius: r, halfHeight: halfH, pos: [0, 0, 0], color: 0xb8bcc6 }]
    });
    prev = body;
    prevAnchor = { x: 0, y: -segLen / 2, z: 0 };
  }

  return {
    links,
    bottom: links[links.length - 1],
    bottomAnchor: prevAnchor,                          // 最下段リンクの下端（ローカル）
    bottomY: armPos.y - c.length,                      // 最下段の下端の高さ（生成時）
    visuals: parts
  };
}
