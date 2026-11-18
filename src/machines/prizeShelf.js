// =============================================================
// 景品の網と箱（フック台の横に置く）
// 網の上に景品の箱が乗っている。板の横のふちと網の奥側のふちが、プラスチックの太いチェーンでつながっていて、
// フックで板が持ち上がるとチェーンが張って網の奥側を引き上げる → 網が手前に傾いて箱がすべり落ち、
// 手前の取り出し口（床の穴）に落ちたら獲得
// 初期位置が左（①で右へ）の台は板の右側に、右の台は左側に置く（side = +1 / −1）
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from '../physics/world.js';

// 置き場所と大きさ（cm）。side を掛けて左右を反転する
export const SHELF = {
  boardX: 2,                 // 板の中心（真ん中から寄せる量）
  netX: 13.5,                // 網の中心
  netW: 6, netD: 9,          // 網の幅（左右）・奥行き
  netT: 0.4,                 // 網の厚み
  netTop: 2.0,               // 傾く前の網の上面の高さ
  netZ: -0.5,                // 網の中心（手前奥）
  box: [5, 7, 4],            // 箱：幅・高さ・奥行き
  boxZ: -2,                  // 箱を置く位置（網の中心より奥）
  boxMass: 40,
  hole: { w: 10, z0: 4.3, z1: 15 },  // 取り出し口：網の手前に開いた床の穴
  slack: 1.0,                // チェーンのたるみ（板がこれだけ上がってから網が引かれる）
  maxDeg: 70,                // 網が傾く最大の角度
  linkLen: 1.3, linkW: 0.8, linkWire: 0.16  // プラスチックチェーンのコマ
};

// 床の穴の範囲（台を作る前に必要）。倒れながら落ちる箱が飛び越えないよう、手前に長めに開ける
export function shelfHole(side) {
  const x = SHELF.netX * side, hw = SHELF.hole.w / 2;
  return { x0: x - hw, x1: x + hw, z0: SHELF.hole.z0, z1: SHELF.hole.z1 };
}

export function createPrizeShelf(RAPIER, world, preset, machine, side) {
  const S = SHELF;
  const b = preset.board;
  const hx = S.netX * side;
  const hz = S.netZ + S.netD / 2;          // 支点（網の手前のふち）
  const hy = S.netTop;

  // ---- 網（支点まわりに傾くキネマティック）----
  const net = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hx, hy, hz));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(S.netW / 2, S.netT / 2, S.netD / 2)
      .setTranslation(0, -S.netT / 2, -S.netD / 2)
      .setFriction(0.35)
      .setCollisionGroups(groups(GROUP.TABLE, GROUP.RING | GROUP.BOARD | GROUP.PRIZE)),
    net
  );

  // ---- 景品の箱 ----
  const [bw, bh, bd] = S.box;
  const box = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(hx, hy + bh / 2 + 0.01, S.boxZ).setCcdEnabled(true).setAngularDamping(0.2)
      .setCanSleep(false)   // 網が傾き始めたときに眠ったまま動かない、を防ぐ
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(bw / 2, bh / 2, bd / 2).setMass(S.boxMass).setFriction(0.3).setRestitution(0.1)
      .setCollisionGroups(groups(GROUP.PRIZE, GROUP.TABLE | GROUP.BOARD | GROUP.RING | GROUP.PRIZE)),
    box
  );

  // ---- チェーンの両端 ----
  // 板側：板の横のふち（網に近い側）の奥寄り。網側：網の奥のふちの、板に近い角
  const boardBody = machine.board;
  const aLocal = { x: (b.width / 2 - 0.6) * side, y: b.height / 2, z: -2.5 };
  const bLocal = { x: -(S.netW / 2 - 0.8) * side, y: 0, z: -S.netD + 0.4 };
  const toWorld = (body, p) => {
    const t = body.translation(), r = rotateVec(body.rotation(), p);
    return { x: t.x + r.x, y: t.y + r.y, z: t.z + r.z };
  };
  const netQuat = th => quatAxisAngle(1, 0, 0, th);
  const netPoint = (p, th) => { const r = rotateVec(netQuat(th), p); return { x: hx + r.x, y: hy + r.y, z: hz + r.z }; };
  const dist = (a, c) => Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z);
  const L = dist(toWorld(boardBody, aLocal), netPoint(bLocal, 0)) + S.slack;   // チェーンの長さ（見た目のたるみ用）
  const boardY0 = boardBody.translation().y;

  let theta = 0;         // 網の傾き（ラジアン）
  let force = 0;         // 確定チケットで強制的に傾ける量（0〜1）

  // チェーンの見た目：コマを両端の間に並べる（たるみがあれば下にふくらませる）
  // 板が高く持ち上がって両端が離れても、コマが離れて浮かないよう、距離に合わせて使うコマの数を増やす
  // （使わないコマは網側の端に重ねておく）
  const PITCH = S.linkLen * 0.75;
  const nBase = Math.max(3, Math.round(L / PITCH));
  const nMax = Math.max(nBase, Math.ceil(60 / PITCH));
  const links = [];
  for (let i = 0; i < nMax; i++) {
    const st = { t: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } };
    links.push({ st, body: { translation: () => st.t, rotation: () => st.q } });
  }
  function updateLinks() {
    const A = toWorld(boardBody, aLocal), B = netPoint(bLocal, theta);
    const d = dist(A, B);
    const sag = d < L ? Math.sqrt(Math.max(0, L * L - d * d)) * 0.5 : 0;
    const pt = u => ({
      x: A.x + (B.x - A.x) * u,
      y: A.y + (B.y - A.y) * u - sag * 4 * u * (1 - u),
      z: A.z + (B.z - A.z) * u
    });
    const nUse = Math.min(nMax, Math.max(nBase, Math.ceil(d / PITCH)));
    for (let i = 0; i < nMax; i++) {
      const k = Math.min(i, nUse - 1);
      const u0 = k / nUse, u1 = (k + 1) / nUse;
      const p0 = pt(u0), p1 = pt(u1);
      links[i].st.t = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2 };
      const dir = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      links[i].st.q = alignY(dir.x / len, dir.y / len, dir.z / len, i % 2 ? Math.PI / 2 : 0);
    }
  }

  // 毎ステップ：板が上がった分（たるみを引いた分）だけ、チェーンが網の奥側を引き上げる
  const lifted = () => boardBody.translation().y - boardY0;
  function step(dt) {
    const raise = Math.max(0, lifted() - S.slack);
    let target = Math.asin(Math.min(1, raise / S.netD));
    target = Math.min(target, S.maxDeg * Math.PI / 180);
    target = Math.max(target, force * S.maxDeg * 0.6 * Math.PI / 180);
    // 急に動かさない（1秒に最大90°）
    const maxD = Math.PI / 2 * dt;
    theta += Math.max(-maxD, Math.min(maxD, target - theta));
    const pos = netPoint({ x: 0, y: 0, z: 0 }, theta);
    net.setNextKinematicTranslation(pos);
    net.setNextKinematicRotation(netQuat(theta));
    updateLinks();
  }
  updateLinks();

  // ---- 見た目 ----
  const netVisual = {
    body: net,
    parts: [{ type: 'box', size: [S.netW, S.netT, S.netD], pos: [0, -S.netT / 2, -S.netD / 2], color: 0x9aa3b0, net: true, castShadow: false }]
  };
  // 網の下の支え（固定の見た目だけ）
  const legsBody = { translation: () => ({ x: hx, y: 0, z: S.netZ }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }) };
  const legs = { body: legsBody, parts: [] };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    legs.parts.push({ type: 'box', size: [0.4, hy - S.netT, 0.4], pos: [sx * (S.netW / 2 - 0.4), (hy - S.netT) / 2, sz * (S.netD / 2 - 0.6)], color: 0x5a6070, castShadow: false });
  }
  const boxVisual = { body: box, parts: [{ type: 'box', size: [bw, bh, bd], pos: [0, 0, 0], color: 0xffffff, prizeBox: true }] };
  const chainVisuals = links.map(l => ({
    body: l.body,
    parts: [{ type: 'chainlink', length: S.linkLen, width: S.linkW, wire: S.linkWire, pos: [0, 0, 0], color: 0xf2f2f2, plastic: true, castShadow: false }]
  }));

  return {
    net, box,
    visuals: [legs, netVisual, boxVisual, ...chainVisuals],
    step,
    // 箱が取り出し口に落ちたか
    fallen() { return box.translation().y < -3; },
    // 確定チケット：網を強制的に傾けていく（呼ぶたびに少しずつ）
    forceTilt(dt) { force = Math.min(1, force + dt / 1.2); },
    get thetaDeg() { return theta * 180 / Math.PI; }
  };
}

// y軸を (dx,dy,dz) に向け、その軸まわりに roll だけ回すクォータニオン
function alignY(dx, dy, dz, roll) {
  // (0,1,0) → d への回転：軸＝外積 (0,1,0)×d = (dz, 0, −dx)
  const ax = dz, ay = 0, az = -dx;
  const dot = dy;
  let q;
  if (dot < -0.9999) q = { x: 1, y: 0, z: 0, w: 0 };
  else {
    const w = 1 + dot;
    const n = Math.hypot(ax, ay, az, w);
    q = { x: ax / n, y: ay / n, z: az / n, w: w / n };
  }
  // 軸まわりの回転（ローカルの y 軸まわり＝先に掛ける）
  const r = { x: 0, y: Math.sin(roll / 2), z: 0, w: Math.cos(roll / 2) };
  return {
    w: q.w * r.w - q.x * r.x - q.y * r.y - q.z * r.z,
    x: q.w * r.x + q.x * r.w + q.y * r.z - q.z * r.y,
    y: q.w * r.y - q.x * r.z + q.y * r.w + q.z * r.x,
    z: q.w * r.z + q.x * r.y - q.y * r.x + q.z * r.w
  };
}
