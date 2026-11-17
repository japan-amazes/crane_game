// =============================================================
// フック台：景品の板（動く物体）＋板に固定された「？」形フック
// フック形状：「？」形のねじ込みフック写真の中心線をなぞった点列（比率のみ使用）
//   根元から上へ伸び、S字に右へふくらんでから大きな弧で上を回り、
//   先端は手前斜め下を向いて終わる。先端と首の間が「開き」
//   yaw=0 で開口部（先端側）が手前 +z を向く
//   大きさは height（板上面〜フック頂点の外側）で決める。実機の寸法は未確定（仮の値）
// リングがフックに掛かった状態で上昇すると板ごと持ち上がる → 獲得
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from '../physics/world.js';

// 写真の中心線（根元=原点、横=手前方向が＋、縦=上が＋）。単位は「フック全高=1」
// 元画像の座標（根元 x=445,y=875、外側てっぺん y=55、全高820px）から換算
const BRASS = 0xc8a046; // フックの色（真鍮）

const QUESTION_SHAPE = [
  [445, 875], [445, 800], [455, 730], [490, 670], [545, 625], [610, 585],
  [660, 545], [695, 490], [715, 420], [718, 350], [705, 280], [675, 215],
  [625, 155], [560, 115], [490, 95], [420, 95], [350, 110], [285, 140],
  [230, 185], [190, 240], [165, 300], [145, 360], [130, 410]
].map(([x, y]) => ({ z: -(x - 445) / 820, y: (875 - y) / 820 }));

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
  const rodR = h.thickness / 2;
  // 写真の全高は「外側のてっぺん」まで。中心線は線の太さの半分だけ低い
  const scale = h.height - rodR;
  const topLine = Math.max(...QUESTION_SHAPE.map(p => p.y));
  const line = QUESTION_SHAPE.map(p => ({ x: 0, y: p.y / topLine * scale, z: p.z / topLine * scale }));

  // 板ローカルへ：yaw回転＋取り付け位置
  const qYaw = quatAxisAngle(0, 1, 0, (h.yawDeg || 0) * Math.PI / 180);
  const base = { x: h.offsetX || 0, y: b.height / 2, z: h.offsetZ || 0 };
  const toBoard = p => {
    const r = rotateVec(qYaw, p);
    return { x: base.x + r.x, y: base.y + r.y, z: base.z + r.z };
  };
  const pts = line.map(toBoard);

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
    parts.push({ type: 'capsule', radius: rodR, halfHeight: len / 2, pos: [mid.x, mid.y, mid.z], quat: q, color: BRASS });
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
    parts.push({ type: 'ball', radius: h.tipBallRadius, pos: [tip.x, tip.y, tip.z], color: BRASS });
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
  const hookTop = h.height;
  const hookTopLocalY = base.y + hookTop;

  return {
    board,
    rodR,
    hookTop,                                // 板上面からフック頂点まで
    boardTop: b.height,                     // 台からの板上面の高さ
    hookWorldBase() {                       // カメラ用：フック根元のワールド座標
      return toWorld(board, { x: base.x, y: hookTopLocalY / 2, z: base.z });
    },
    lifted() {
      return board.translation().y - initialY;
    },
    // チェーンの当たり判定用：フックの中心線（ワールド座標の点列）
    hookLineWorld() {
      return pts.map(p => toWorld(board, p));
    },
    // 吊り下げ中の接触部の減衰（摩擦によるエネルギー損失の代わり）
    // 板を吊ると軽いリングが鎖と板の間で張られて細かく震える。実物は接触部の摩擦ですぐ収まるので、
    // リングと板の相対速度だけを弱める（全体の揺れ＝振り子の動きはそのまま残る）
    dampHanging(ring, dt, rate) {
      if (board.translation().y - initialY < 0.2) return; // 板が浮いていないときは何もしない
      const vr = ring.body.linvel(), vb = board.linvel();
      const mr = ring.body.mass(), mb = board.mass();
      const k = Math.min(rate * dt, 1);
      // 相対速度を k の割合だけ減らす（運動量は保存）
      const mu = mr * mb / (mr + mb);
      const ix = -k * mu * (vr.x - vb.x), iy = -k * mu * (vr.y - vb.y), iz = -k * mu * (vr.z - vb.z);
      ring.body.applyImpulse({ x: ix, y: iy, z: iz }, true);
      board.applyImpulse({ x: -ix, y: -iy, z: -iz }, true);
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

