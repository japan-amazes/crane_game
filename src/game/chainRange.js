// =============================================================
// チェーンの長さの範囲（リングの直径と下降制限から決まる）
// 最短：チェーン＋リングの直径で、下がりきったときにリングの下のふちがちょうど板に着く長さ
// 最長：下がりきったときに、リングが板にペタッと寝て全周が着く長さ
// chain.lengthRatio（0＝最短〜1＝最長）があれば、その割合で chain.length を決める
// =============================================================
export function chainRange(p) {
  const kSpan = p.connector.diameter - p.connector.thickness;   // つなぎのリングの長さ
  const th = p.ring.thickness;
  const min = p.arm.dropLimit - kSpan - p.ring.diameter + th / 2;
  const max = p.arm.dropLimit - kSpan - th / 2;
  return { min, max };
}

export function applyChainRatio(p) {
  const r = p.chain.lengthRatio;
  if (r === undefined || r === null) return p;
  const { min, max } = chainRange(p);
  p.chain.length = Math.round((min + (max - min) * r) * 100) / 100;
  return p;
}
