// =============================================================
// チェーン（キヘイ風のねじれた平たいコマ）
// 物理：コマ1つ＝短いカプセル。ピッチ（コマの長さ）ごとに球面ジョイントで数珠つなぎ
//   一番上はアーム、一番下はつなぎのリング（ring.js）につながる
//   チェーン同士・チェーンとリングは当たらない（フック・板・台には当たる）
// 追加の力学（createChainDynamics）：
//   ・ねじれ：リングの向きが元に戻ろうとする力（ばね＋減衰）。チェーン全体に均等に分配
//   ・曲がり制限：隣のコマとの折れ角が上限を超えると押し戻す（平たいので向きで上限が違う）
//   ・こすれ：隣のコマとの相対的な回転だけを弱める（全体の振り子の揺れは弱めない）
//   どれも「速度を少しずつ目標に近づける」形で計算するので、軽いコマでも暴れない
// =============================================================
import { GROUP, groups, quatAxisAngle, rotateVec } from './world.js';

// 見た目のコマ（cm）
const LINK_WIDTH = 0.42;  // コマの幅（中心線）
const LINK_WIRE = 0.06;   // コマの線の太さ（半径）

export function createChain(RAPIER, world, preset, armBody, armPos) {
  const c = preset.chain;
  const n = Math.max(2, Math.round(c.length / c.pitch));
  const segLen = c.length / n;                 // 実際のピッチ（長さが割り切れるよう調整）
  const r = c.linkRadius;
  const halfH = Math.max(segLen / 2 - r, 0.02);
  const linkMass = c.massPerCm * segLen;

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
        .setMass(linkMass)
        .setFriction(0.3)
        .setCollisionGroups(groups(GROUP.CHAIN, GROUP.TABLE | GROUP.BOARD)),
      body
    );
    const joint = RAPIER.JointData.spherical(prevAnchor, { x: 0, y: segLen / 2, z: 0 });
    world.createImpulseJoint(joint, prev, body, true);

    links.push(body);
    // 見た目：ねじれた平たいコマを1つ。隣同士で向きを90°ずらしてかみ合って見えるように
    parts.push({
      body,
      parts: [{
        type: 'curblink',
        length: segLen + LINK_WIDTH * 0.55,
        width: LINK_WIDTH,
        wire: LINK_WIRE,
        twist: Math.PI / 3,          // コマ自体のねじれ（60°）
        pos: [0, 0, 0],
        rotY: (i % 2) * Math.PI / 2,
        color: 0xc4c8d0,
        castShadow: false
      }]
    });
    prev = body;
    prevAnchor = { x: 0, y: -segLen / 2, z: 0 };
  }

  return {
    links,
    segLen,
    bottom: links[links.length - 1],
    bottomAnchor: prevAnchor,                          // 最下段リンクの下端（ローカル）
    bottomY: armPos.y - segLen * n,                    // 最下段の下端の高さ（生成時）
    visuals: parts
  };
}

// =============================================================
// チェーンの追加の力学（ねじれ・曲がり制限・こすれ）
// chain：createChain の戻り値 / connector・ringBody：つなぎのリングと大きいリング
// =============================================================
export function createChainDynamics(chain, connector, ringBody, preset) {
  const c = preset.chain;
  const g = preset.ring;
  const links = chain.links;
  const all = [...links, connector, ringBody];   // 上から順に
  const n = all.length;

  // 組み立て直後の向き（ねじれ0の基準）
  const rest = all.map(b => ({ ...b.rotation() }));

  // 初期のねじれ：リングを上から見て initialTwistDeg 回し、チェーンには上から均等に分配
  const init = (g.initialTwistDeg || 0) * Math.PI / 180;
  if (init) {
    all.forEach((b, i) => {
      const share = Math.min((i + 1) / links.length, 1);
      const q = mul(quatAxisAngle(0, 1, 0, init * share), b.rotation());
      b.setRotation(q, true);
    });
  }

  const maxBendFlat = (c.maxBendFlatDeg ?? 70) * Math.PI / 180;  // 平たい面の方向に曲がる上限
  const maxBendEdge = (c.maxBendEdgeDeg ?? 40) * Math.PI / 180;  // 厚みの方向に曲がる上限

  // 上から見た水平面での回転角（基準の向きからのねじれ）
  function twistOf(i) {
    const q = all[i].rotation();
    const r = rest[i];
    // d = q * r^-1（基準からの回転）。そのうち縦軸まわりの成分の角度
    const d = mul(q, { x: -r.x, y: -r.y, z: -r.z, w: r.w });
    return 2 * Math.atan2(d.y, d.w);
  }

  function inertiaOf(b) {
    const p = b.principalInertia();
    return Math.max(Math.min(p.x, p.y, p.z), 1e-6);
  }

  return {
    step(dt) {
      const K = c.twistStiffness;     // ねじれの戻る強さ
      const C = c.twistDamping;       // ねじれの止まりやすさ
      const ringIdx = n - 1;

      // ---- 1) リングのねじれ：ばね＋減衰（リングは重いので普通の力で安定）----
      const th = wrap(twistOf(ringIdx));
      const wr = ringBody.angvel().y;
      ringBody.applyTorqueImpulse({ x: 0, y: (-K * th - C * wr) * dt, z: 0 }, true);

      // ---- 2) チェーン・つなぎのリングのねじれをリングに合わせて均等に分配 ----
      //      （速度を目標に近づける形。反作用はリングへ）
      const blend = Math.min(0.5, 30 * dt);
      let reaction = 0;
      for (let i = 0; i < n - 1; i++) {
        const share = Math.min((i + 1) / links.length, 1);
        const target = th * share, targetW = wr * share;
        const b = all[i];
        const w = b.angvel();
        const err = wrap(twistOf(i) - target);
        const dw = (targetW - w.y) - err * 0.2 / dt;
        const imp = inertiaOf(b) * dw * blend;
        b.applyTorqueImpulse({ x: 0, y: imp, z: 0 }, true);
        reaction -= imp;
      }
      ringBody.applyTorqueImpulse({ x: 0, y: reaction, z: 0 }, true);

      // ---- 3) 曲がり制限とこすれ（隣同士の相対的な回転）----
      const rub = Math.min(0.5, (c.rubDamping ?? 0) * dt);
      for (let i = 0; i < links.length - 1; i++) {
        const a = links[i], b = links[i + 1];
        const qa = a.rotation(), qb = b.rotation();
        const ya = rotateVec(qa, { x: 0, y: 1, z: 0 });
        const yb = rotateVec(qb, { x: 0, y: 1, z: 0 });
        const wa = a.angvel(), wb = b.angvel();
        const ia = inertiaOf(a), ib = inertiaOf(b);
        const ie = ia * ib / (ia + ib);
        const rel = { x: wb.x - wa.x, y: wb.y - wa.y, z: wb.z - wa.z };

        // こすれ：相対回転のうち、ねじれ以外（曲げ方向）を弱める
        if (rub > 0) {
          const along = rel.x * ya.x + rel.y * ya.y + rel.z * ya.z;
          const bend = { x: rel.x - along * ya.x, y: rel.y - along * ya.y, z: rel.z - along * ya.z };
          const s = rub * ie;
          a.applyTorqueImpulse({ x: s * bend.x, y: s * bend.y, z: s * bend.z }, true);
          b.applyTorqueImpulse({ x: -s * bend.x, y: -s * bend.y, z: -s * bend.z }, true);
        }

        // 曲がり制限：折れ角が上限を超えたら戻す（上限はコマの平たい向きによって変わる）
        const cx = ya.y * yb.z - ya.z * yb.y, cy = ya.z * yb.x - ya.x * yb.z, cz = ya.x * yb.y - ya.y * yb.x;
        const sinA = Math.hypot(cx, cy, cz);
        const cosA = ya.x * yb.x + ya.y * yb.y + ya.z * yb.z;
        const ang = Math.atan2(sinA, cosA);
        if (sinA < 1e-6) continue;
        const ax = { x: cx / sinA, y: cy / sinA, z: cz / sinA };   // 曲がる軸（ワールド）
        // 上側のコマの平たい面の法線（ローカルz）と曲がる軸の関係で上限を決める
        const nz = rotateVec(qa, { x: 0, y: 0, z: 1 });
        const t = Math.abs(ax.x * nz.x + ax.y * nz.y + ax.z * nz.z); // 1＝平たい面の中で曲がる
        const limit = maxBendEdge + (maxBendFlat - maxBendEdge) * t;
        if (ang <= limit) continue;
        const excess = ang - limit;
        const relAx = rel.x * ax.x + rel.y * ax.y + rel.z * ax.z;
        const dw = -(excess * 0.2 / dt) - Math.max(0, relAx);
        const imp = ie * dw;
        a.applyTorqueImpulse({ x: -imp * ax.x, y: -imp * ax.y, z: -imp * ax.z }, true);
        b.applyTorqueImpulse({ x: imp * ax.x, y: imp * ax.y, z: imp * ax.z }, true);
      }
    },
    // 今のリングのねじれ（度）。表示・記録用
    ringTwistDeg() {
      return wrap(twistOf(n - 1)) * 180 / Math.PI;
    }
  };
}

function mul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
