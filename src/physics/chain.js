// =============================================================
// チェーン（キヘイ風のねじれた平たいコマ）
// 計算方法：点をつないで長さを保つ方式（布・ロープのシミュレーションと同じ考え方）
//   ・点はコマの継ぎ目。上端はアーム、下端は大きいリングの上端に固定
//   ・最後の1区間は、つなぎの小さいリング（二重リング）。軽い部品を物理エンジンで
//     単独に動かすと暴れるので、チェーンの一部として扱う
//   ・隣の点との距離＝ピッチ（伸び縮みしない）
//   ・曲がり制限：1つ飛ばしの点の距離が縮みすぎないようにする（折れ角の上限）
//   ・こすれ：隣の点との速度差を少しずつならす（全体の振り子の揺れは弱めない）
//   ・板・台・フックとの当たり判定（めり込んだら押し出し、接している間は摩擦で滑りを弱める）
// リング（と景品）の重さは、アーム〜大きいリングの「ロープ」（ring.js）が支える。
// チェーン自身の重さがリングの揺れに与える影響は小さいものとして扱う。
//
// ねじれ（createChainDynamics）：リングの向きが元に戻ろうとする力（ばね＋減衰）。
//   チェーンの見た目のねじれは、上端0〜下端でリングと同じ角度になるよう均等に配る
// =============================================================
import { quatAxisAngle, rotateVec } from './world.js';

// 見た目のコマ（cm）
const LINK_WIDTH = 0.42;  // コマの幅（中心線）
const LINK_WIRE = 0.06;   // コマの線の太さ（半径）
const ITER = 10;          // 1ステップあたりの拘束の繰り返し回数
const PLAY = 0.85;        // コマが縮める下限（かみ合わせの遊び）

export function createChain(preset, armPos) {
  const c = preset.chain;
  const n = Math.max(2, Math.round(c.length / c.pitch));   // コマ数
  const segLen = c.length / n;                              // 実際のピッチ
  const r = c.linkRadius;
  const k = preset.connector;
  const kRc = (k.diameter - k.thickness) / 2;
  const kSpan = 2 * kRc;                                    // つなぎのリングの長さ（中心線）
  const N = n + 1;                                          // 区間数（チェーン n ＋ つなぎ 1）
  const lens = Array.from({ length: N }, (_, i) => (i < n ? segLen : kSpan));
  const total = segLen * n + kSpan;

  // 点（N+1個）：位置と1ステップ前の位置
  const P = [], Q = [];
  let yy = armPos.y;
  for (let i = 0; i <= N; i++) {
    P.push({ x: armPos.x, y: yy, z: armPos.z });
    Q.push({ x: armPos.x, y: yy, z: armPos.z });
    if (i < N) yy -= lens[i];
  }

  // 見た目用：各コマの位置と向き（描画側は translation()/rotation() を読む）
  let ringTwist = 0;
  const links = [];
  for (let i = 0; i < n; i++) {
    const st = { t: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 } };
    links.push({
      translation: () => st.t,
      rotation: () => st.q,
      linvel: () => st.v,
      angvel: () => ({ x: 0, y: 0, z: 0 }),
      _st: st
    });
  }
  const visuals = links.map(b => ({
    body: b,
    parts: [{
      type: 'curblink',
      length: segLen + LINK_WIDTH * 0.55,
      width: LINK_WIDTH,
      wire: LINK_WIRE,
      twist: Math.PI / 3,          // コマ自体のねじれ（60°）
      pos: [0, 0, 0],
      color: 0xc4c8d0,
      castShadow: false
    }]
  }));

  // つなぎのリングの見た目（二重リング）
  const kst = { t: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 }, v: { x: 0, y: 0, z: 0 } };
  const connectorBody = { translation: () => kst.t, rotation: () => kst.q, linvel: () => kst.v, angvel: () => ({ x: 0, y: 0, z: 0 }) };
  const ringYaw = (preset.ring.yawDeg || 0) * Math.PI / 180;
  visuals.push({
    body: connectorBody,
    parts: [{ type: 'splitring', radius: kRc, wire: k.thickness / 4, gap: k.thickness / 2, pos: [0, 0, 0], color: 0xc9ccd3, castShadow: false }]
  });

  const cosHalf = Math.cos(((c.maxBendDeg ?? 70) * Math.PI / 180) / 2);
  const minSkip = 2 * segLen * cosHalf;   // 1つ飛ばしの点の最小距離（折れ角の上限）

  function refreshLinks(dt) {
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[i + 1];
      const st = links[i]._st;
      const nt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      if (dt) st.v = { x: (nt.x - st.t.x) / dt, y: (nt.y - st.t.y) / dt, z: (nt.z - st.t.z) / dt };
      st.t = nt;
      // コマの向き：上→下の方向を縦軸に。縦軸まわりの回転＝90°ずつ交互＋ねじれの配分
      let d = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      d = { x: d.x / len, y: d.y / len, z: d.z / len };
      const qDir = quatFromY(d);
      const spin = (i % 2) * Math.PI / 2 + ringTwist * ((i + 0.5) / n);
      st.q = mul(qDir, quatAxisAngle(0, 1, 0, spin));
    }
    // つなぎのリング：最後の区間の中点。大きいリングと直交する向き＋リングのねじれ
    {
      const a = P[n], b = P[N];
      const nt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      if (dt) kst.v = { x: (nt.x - kst.t.x) / dt, y: (nt.y - kst.t.y) / dt, z: (nt.z - kst.t.z) / dt };
      kst.t = nt;
      let d = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      d = { x: d.x / len, y: d.y / len, z: d.z / len };
      kst.q = mul(quatFromY(d), quatAxisAngle(0, 1, 0, ringYaw + Math.PI / 2 + ringTwist));
    }
  }
  refreshLinks(0);

  return {
    links,
    segLen,
    length: total,                      // アーム〜大きいリング上端（チェーン＋つなぎのリング）
    bottomY: armPos.y - total,          // 下端の高さ（生成時）
    visuals,
    setRingTwist(rad) { ringTwist = rad; },
    points: () => P,                    // テスト用
    // 全体を上下にずらす（テスト用）
    shift(dy) { for (const p of [...P, ...Q]) p.y += dy; refreshLinks(0); },

    // 1ステップ進める。top：アームの位置 / bottom：大きいリング上端の位置
    // machine：板・フックの当たり判定に使う
    update(dt, top, bottom, machine) {
      const g = -981;
      const lin = Math.max(0, 1 - (c.linearDamping || 0) * dt);
      // 1) 速度をならす（こすれ）
      const rub = Math.min(0.5, (c.rubDamping || 0) * dt);
      const V = P.map((p, i) => ({ x: p.x - Q[i].x, y: p.y - Q[i].y, z: p.z - Q[i].z }));
      if (rub > 0) {
        for (let i = 1; i < N; i++) {
          const m = { x: (V[i - 1].x + V[i + 1].x) / 2, y: (V[i - 1].y + V[i + 1].y) / 2, z: (V[i - 1].z + V[i + 1].z) / 2 };
          V[i].x += (m.x - V[i].x) * rub; V[i].y += (m.y - V[i].y) * rub; V[i].z += (m.z - V[i].z) * rub;
        }
      }
      // 2) 移動（端は固定）
      for (let i = 1; i < N; i++) {
        const p = P[i];
        Q[i] = { x: p.x, y: p.y, z: p.z };
        p.x += V[i].x * lin;
        p.y += V[i].y * lin + g * dt * dt;
        p.z += V[i].z * lin;
      }
      Q[0] = { ...P[0] }; Q[N] = { ...P[N] };
      P[0] = { x: top.x, y: top.y, z: top.z };
      P[N] = { x: bottom.x, y: bottom.y, z: bottom.z };

      // 3) 拘束：長さ・曲がり制限・当たり判定
      // ロープ（リングの重さを支える側）がわずかに伸びて両端の距離がチェーンの長さを超えたときは、
      // コマの長さをその分だけ伸ばして合わせる（両端に引っ張られて暴れるのを防ぐ）
      const span = Math.hypot(P[N].x - P[0].x, P[N].y - P[0].y, P[N].z - P[0].z);
      const stretch = Math.max(1, span / total);
      const env = machine ? makeEnv(machine, preset, r) : null;   // 板・フックの位置（1ステップに1回だけ取得）
      const contact = new Uint8Array(N + 1);
      const tautNow = span / total >= 0.999;    // 張りきっているときは後で直線にそろえるので拘束は1回だけ
      for (let it = 0; it < (tautNow ? 1 : ITER); it++) {
        // 上から下・下から上を交互に解く（片側だけだと誤差が下端にたまって震える）
        const down = it % 2 === 0;
        for (let j = 0; j < N; j++) {
          const i = down ? j : N - 1 - j;
          const wa = i === 0 ? 0 : 1, wb = i + 1 === N ? 0 : 1;
          if (wa + wb === 0) continue;
          // コマはかみ合わせの遊びの分だけ縮むことができる（伸びはしない）。
          // 「ちょうどの長さ」に固定すると、ピンと張ったときに点同士が押し合って震える
          const L = lens[i] * stretch;
          satisfyDist(P[i], P[i + 1], wa, wb, L * PLAY, L);
        }
        for (let i = 1; i < n; i++) {              // 曲がり制限はチェーン部分だけ
          const wa = i - 1 === 0 ? 0 : 1;
          satisfyDist(P[i - 1], P[i + 1], wa, 1, minSkip * stretch, Infinity);
        }
        if (tautNow || it % 3 === 2 || it === ITER - 1) {
          for (let i = 1; i < N; i++) {
            if (collide(P[i], env, r)) contact[i] = 1;
          }
        }
      }

      // 4) ピンと張っているときは、両端を結ぶ直線の上にそろえる
      //    （点をつなぐ方式は、張りきった長い鎖をまっすぐに保つのが苦手で、下のほうが折れて震えるため）
      const taut = smoothstep(0.985, 0.999, span / total);
      if (taut > 0) {
        let acc = 0;
        for (let i = 1; i < N; i++) {
          acc += lens[i - 1];
          const f = acc / total;
          const lx = P[0].x + (P[N].x - P[0].x) * f;
          const ly = P[0].y + (P[N].y - P[0].y) * f;
          const lz = P[0].z + (P[N].z - P[0].z) * f;
          P[i].x += (lx - P[i].x) * taut;
          P[i].y += (ly - P[i].y) * taut;
          P[i].z += (lz - P[i].z) * taut;
        }
      }

      // 5) 接している点は摩擦で滑りを弱める
      const fr = 0.5;
      for (let i = 1; i < N; i++) {
        if (!contact[i]) continue;
        Q[i].x += (P[i].x - Q[i].x) * fr;
        Q[i].z += (P[i].z - Q[i].z) * fr;
      }

      refreshLinks(dt);
    }
  };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// 2点の距離を [minL, maxL] に収める（w=0の点は動かさない）
function satisfyDist(a, b, wa, wb, minL, maxL) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz) || 1e-9;
  let target;
  if (d < minL) target = minL; else if (d > maxL) target = maxL; else return;
  const k = (d - target) / d / (wa + wb);
  a.x += dx * k * wa; a.y += dy * k * wa; a.z += dz * k * wa;
  b.x -= dx * k * wb; b.y -= dy * k * wb; b.z -= dz * k * wb;
}

// 当たり判定に使う板・フックの情報（1ステップに1回まとめて取る）
function makeEnv(machine, preset, r) {
  const b = preset.board;
  const t = machine.board.translation(), q = machine.board.rotation();
  const hook = machine.hookLineWorld();
  const hookR = machine.rodR + r;
  // フック全体を囲む球（遠い点はフックの判定を省く）
  let cx = 0, cy = 0, cz = 0;
  for (const h of hook) { cx += h.x; cy += h.y; cz += h.z; }
  cx /= hook.length; cy /= hook.length; cz /= hook.length;
  let rad = 0;
  for (const h of hook) rad = Math.max(rad, Math.hypot(h.x - cx, h.y - cy, h.z - cz));
  return {
    t: { x: t.x, y: t.y, z: t.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w },
    iq: { x: -q.x, y: -q.y, z: -q.z, w: q.w },
    hx: b.width / 2 + r, hy: b.height / 2 + r, hz: b.depth / 2 + r,
    boardR: Math.hypot(b.width / 2, b.height / 2, b.depth / 2) + r,
    hook, hookR, hc: { x: cx, y: cy, z: cz }, hookBound: rad + hookR
  };
}

// 板・台・フックからの押し出し。接していたら true
function collide(p, env, r) {
  let hit = false;
  // 台（床）
  if (p.y < r) { p.y = r; hit = true; }
  if (!env) return hit;
  // 板（箱）：近いときだけ板のローカル座標で判定
  const t = env.t;
  if (Math.abs(p.x - t.x) < env.boardR && Math.abs(p.y - t.y) < env.boardR && Math.abs(p.z - t.z) < env.boardR) {
    const l = rotateVec(env.iq, { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z });
    const hx = env.hx, hy = env.hy, hz = env.hz;
    if (Math.abs(l.x) < hx && Math.abs(l.y) < hy && Math.abs(l.z) < hz) {
      // いちばん浅い面から押し出す
      const ox = hx - Math.abs(l.x), oy = hy - Math.abs(l.y), oz = hz - Math.abs(l.z);
      if (oy <= ox && oy <= oz) l.y = Math.sign(l.y || 1) * hy;
      else if (ox <= oz) l.x = Math.sign(l.x) * hx;
      else l.z = Math.sign(l.z) * hz;
      const w = rotateVec(env.q, l);
      p.x = t.x + w.x; p.y = t.y + w.y; p.z = t.z + w.z;
      hit = true;
    }
  }
  // フック（中心線の折れ線＋太さ）：囲む球の中にいるときだけ
  const hc = env.hc;
  if (Math.hypot(p.x - hc.x, p.y - hc.y, p.z - hc.z) > env.hookBound) return hit;
  const hook = env.hook, hookR = env.hookR;
  for (let i = 0; i < hook.length - 1; i++) {
    const a = hook[i], c = hook[i + 1];
    const ex = c.x - a.x, ey = c.y - a.y, ez = c.z - a.z;
    const ee = ex * ex + ey * ey + ez * ez || 1e-9;
    let s = ((p.x - a.x) * ex + (p.y - a.y) * ey + (p.z - a.z) * ez) / ee;
    s = Math.max(0, Math.min(1, s));
    const cx = a.x + ex * s, cy = a.y + ey * s, cz = a.z + ez * s;
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d = Math.hypot(dx, dy, dz);
    if (d < hookR && d > 1e-6) {
      const k = hookR / d;
      p.x = cx + dx * k; p.y = cy + dy * k; p.z = cz + dz * k;
      hit = true;
    }
  }
  return hit;
}

// =============================================================
// リングのねじれ（ばね＋減衰）と、つなぎのリングをリングの向きに合わせる処理
// =============================================================
export function createChainDynamics(chain, ringBody, preset) {
  const c = preset.chain;
  const g = preset.ring;

  // 組み立て直後の向き（ねじれ0の基準）
  const rest = { ...ringBody.rotation() };

  // 初期のねじれ：リングを上から見て initialTwistDeg 回す
  const init = (g.initialTwistDeg || 0) * Math.PI / 180;
  if (init) ringBody.setRotation(mul(quatAxisAngle(0, 1, 0, init), ringBody.rotation()), true);

  function twist() {
    const q = ringBody.rotation();
    const d = mul(q, { x: -rest.x, y: -rest.y, z: -rest.z, w: rest.w });
    return wrap(2 * Math.atan2(d.y, d.w));
  }

  return {
    step(dt) {
      const K = c.twistStiffness;     // ねじれの戻る強さ
      const C = c.twistDamping;       // ねじれの止まりやすさ
      const th = twist();
      const wr = ringBody.angvel().y;
      ringBody.applyTorqueImpulse({ x: 0, y: (-K * th - C * wr) * dt, z: 0 }, true);
      chain.setRingTwist(th);
    },
    ringTwistDeg() {
      return twist() * 180 / Math.PI;
    }
  };
}

// y軸を方向 d に向ける回転
function quatFromY(d) {
  if (d.y < -0.9999) return quatAxisAngle(1, 0, 0, Math.PI);
  const q = { x: d.z, y: 0, z: -d.x, w: 1 + d.y };
  const m = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / m, y: q.y / m, z: q.z / m, w: q.w / m };
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
