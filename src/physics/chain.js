// =============================================================
// 鎖：短い棒（カプセル）を球面ジョイントで数珠つなぎにする
// 一番上はアーム、一番下はリングにつながる
// 鎖同士・鎖とリングは当たらない（フック・板・台には当たる）
// =============================================================
import { GROUP, groups } from './world.js';

// 見た目のチェーンの輪（cm）
const LINK_WIDTH = 0.5;  // 輪の幅（中心線）
const LINK_WIRE = 0.07;  // 輪の線の太さ（半径）

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
        .setCanSleep(false)   // 揺れが小さくなった途中で急に止まらないように
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
    // 見た目：物理の1コマにつき楕円の輪を2つ描き、輪の向きを90°ずつ交互に変える（実機のチェーン風）
    const pitch = segLen / 2;
    const vis = [];
    for (let k = 0; k < 2; k++) {
      vis.push({
        type: 'chainlink',
        length: pitch + LINK_WIDTH * 0.6,
        width: LINK_WIDTH,
        wire: LINK_WIRE,
        pos: [0, segLen / 4 - k * pitch, 0],
        rotY: ((i * 2 + k) % 2) * Math.PI / 2,
        color: 0xb8bcc6,
        castShadow: false
      });
    }
    parts.push({ body, parts: vis });
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
