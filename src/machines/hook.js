// =============================================================
// フック台：景品の板（動く物体）＋板に固定された「？」形フック
// フック形状（ローカル、yaw=0 で開口部が手前 +z を向く）
//   柱：板上面から高さ postHeight まで
//   半円：柱の上から手前へ半径 arcRadius で曲がり、下向きになる
//   先端：下へ tailLength 伸びる（板との隙間＝柱の高さ−tailLength）
// リングがフックに掛かった状態で上昇すると板ごと持ち上がる → 獲得
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from '../physics/world.js';

const ARC_SEGMENTS = 8;

export function createHookMachine(RAPIER, world, preset) {
  const b = preset.board;
  const h = preset.hook;
  const mat = preset.materials[b.material] || preset.materials.plastic;

  // ---- 板（台の上に置く）----
  const boardY = b.height / 2;
  const board = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, boardY, 0)
      .setLinearDamping(b.linearDamping ?? 0.05)
      .setAngularDamping(b.angularDamping ?? 0.2)
      .setCcdEnabled(true)
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(b.width / 2, b.height / 2, b.depth / 2)
      .setMass(b.mass)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution)
      .setCollisionGroups(groups(GROUP.BOARD, GROUP.TABLE | GROUP.RING | GROUP.CHAIN)),
    board
  );

  // ---- フックの中心線（ローカル・yaw前）----
  const H = h.postHeight, R = h.arcRadius, T = h.tailLength;
  const line = [{ x: 0, y: 0, z: 0 }, { x: 0, y: H, z: 0 }];
  for (let i = 1; i <= ARC_SEGMENTS; i++) {
    const t = Math.PI * i / ARC_SEGMENTS;
    line.push({ x: 0, y: H + R * Math.sin(t), z: R - R * Math.cos(t) });
  }
  line.push({ x: 0, y: H - T, z: 2 * R });

  // 板ローカルへ：yaw回転＋取り付け位置
  const qYaw = quatAxisAngle(0, 1, 0, (h.yawDeg || 0) * Math.PI / 180);
  const base = { x: h.offsetX || 0, y: b.height / 2, z: h.offsetZ || 0 };
  const toBoard = p => {
    const r = rotateVec(qYaw, p);
    return { x: base.x + r.x, y: base.y + r.y, z: base.z + r.z };
  };
  const pts = line.map(toBoard);

  const rodR = h.thickness / 2;
  const parts = [
    { type: 'box', size: [b.width, b.height, b.depth], pos: [0, 0, 0], color: colorOf(b.material) }
  ];
  const hookGroups = groups(GROUP.BOARD, GROUP.TABLE | GROUP.RING | GROUP.CHAIN);

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const d = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-4) continue;
    const q = quatFromY({ x: d.x / len, y: d.y / len, z: d.z / len });
    const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 };
    world.createCollider(
      RAPIER.ColliderDesc.capsule(len / 2, rodR)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation(q)
        .setMass(0.3)
        .setFriction(h.friction)
        .setCollisionGroups(hookGroups),
      board
    );
    parts.push({ type: 'capsule', radius: rodR, halfHeight: len / 2, pos: [mid.x, mid.y, mid.z], quat: q, color: 0xe8e8ee });
  }

  // 玉付き（先端に球）
  if (h.tipBallRadius > 0) {
    const tip = pts[pts.length - 1];
    world.createCollider(
      RAPIER.ColliderDesc.ball(h.tipBallRadius)
        .setTranslation(tip.x, tip.y, tip.z)
        .setMass(0.3)
        .setFriction(h.friction)
        .setCollisionGroups(hookGroups),
      board
    );
    parts.push({ type: 'ball', radius: h.tipBallRadius, pos: [tip.x, tip.y, tip.z], color: 0xe8e8ee });
  }

  // 記録用：フック中心線を細かく分割した点（板ローカル）
  const samples = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      samples.push({
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
        z: pts[i].z + (pts[i + 1].z - pts[i].z) * t
      });
    }
  }
  samples.push(pts[pts.length - 1]);

  const initialY = boardY;
  const hookTopLocalY = base.y + H + R + rodR;

  return {
    board,
    rodR,
    hookTop: H + R + rodR,                  // 板上面からフック頂点まで
    boardTop: b.height,                     // 台からの板上面の高さ
    hookWorldBase() {                       // カメラ用：フック根元のワールド座標
      return toWorld(board, { x: base.x, y: hookTopLocalY / 2, z: base.z });
    },
    lifted() {
      return board.translation().y - initialY;
    },
    // リングとフックの位置関係（引き上げ直前に呼ぶ）
    measure(ring, axis) {
      const c = ring.body.translation();
      const pw = samples.map(p => toWorld(board, p));
      const inner = ring.innerR;
      let crossing = false;
      let minDist = Infinity;
      let prevAxial = null, prevRadial = null;
      for (const p of pw) {
        const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z };
        const axial = d.x * axis.x + d.y * axis.y + d.z * axis.z;
        const rx = d.x - axial * axis.x, ry = d.y - axial * axis.y, rz = d.z - axial * axis.z;
        const radial = Math.hypot(rx, ry, rz);
        // 中心線がリングの穴（円盤）を貫いているか
        if (prevAxial !== null && Math.sign(axial) !== Math.sign(prevAxial)) {
          const t = prevAxial / (prevAxial - axial);
          const rCross = prevRadial + (radial - prevRadial) * t;
          if (rCross < inner) crossing = true;
        }
        // 穴の円盤までの距離
        const over = Math.max(0, radial - inner);
        minDist = Math.min(minDist, Math.hypot(over, axial));
        prevAxial = axial; prevRadial = radial;
      }
      return { inside: crossing, distance: crossing ? 0 : Math.max(0, minDist - this.rodR) };
    },
    visual: { body: board, parts }
  };
}

function toWorld(body, p) {
  const t = body.translation();
  const r = rotateVec(body.rotation(), p);
  return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
}

// y軸を方向 d に向ける回転
function quatFromY(d) {
  if (d.y < -0.9999) return quatAxisAngle(1, 0, 0, Math.PI);
  const q = { x: d.z, y: 0, z: -d.x, w: 1 + d.y };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

function colorOf(material) {
  return { plastic: 0x4f8cff, metal: 0x9aa3b2, wood: 0xb07a45 }[material] || 0x4f8cff;
}

