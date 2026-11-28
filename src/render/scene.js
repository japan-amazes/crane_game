// =============================================================
// 3D描画（Three.js）
// 物理側が返す visual（body ＋ 部品リスト）から形を作り、毎フレーム位置を写す
// カメラ：正面（front）/ フック付近の斜めからの拡大（zoom）/ 正面の向きのままフック付近を拡大（zoomFront）
// =============================================================

import { createRoyalGoldFinish } from './royalGold.js';
import * as cabinetMod from './cabinet.js';

export function createScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // デフォルト（royal）の筐体の鏡面ゴールド（Codex 製）。反射マップはここで一度だけ作り、テーマを切り替えても使い回す
  const royalGold = createRoyalGoldFinish(THREE, renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;   // 試験：床を筐体の内側だけ描くため
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;   // 影のふちを柔らかく

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12151c);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 500);

  // 照明
  // 全体の明るさは少し控えめにして、影がはっきり出るようにする（色はテーマで変える）
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.7);
  scene.add(hemi);
  // 筐体の照明の色：左右の壁のネオンから部品に色が回り込む（テーマで色を変える）
  const sideLights = [-1, 1].map(sx => {
    const l = new THREE.PointLight(0xff6fb0, 60, 60, 1.6);
    l.position.set(sx * 17, 14, 2);
    scene.add(l);
    return l;
  });
  // 手前上からの柔らかい光：部品の正面を明るくして、つやを見せる
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(0, 20, 40);
  scene.add(fill);
  const THEME_LIGHT = {
    cute: { sky: 0xfff0f8, ground: 0x6a3a5a, side: 0xff6fb0 },
    cool: { sky: 0xe6f2ff, ground: 0x1a2a44, side: 0x3aa8ff },
    royal: { sky: 0xfff3dc, ground: 0x5a1a10, side: 0xffc46a }
  };
  function applyThemeLight(th) {
    const c = THEME_LIGHT[th];
    hemi.color.set(c.sky); hemi.groundColor.set(c.ground);
    for (const l of sideLights) l.color.set(c.side);
  }
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(6, 40, 12);   // ほぼ真上から：部品のすぐ下に影が落ちる
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun);

  // 真下ガイド：アームの真下に、周りをぼかした丸（影のような目印）を表示
  // テーマで変える（キュート：黒いぼかしの丸／クール：床が黒っぽいので、レーザーポインターのような赤い十字）
  const GUIDE_SIZE = 3.5;    // 直径（cm）
  const guide = new THREE.Mesh(
    new THREE.PlaneGeometry(GUIDE_SIZE, GUIDE_SIZE),
    new THREE.MeshBasicMaterial({
      map: softDotTexture(),
      color: 0x000000,
      toneMapped: false,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  guide.rotation.x = -Math.PI / 2;
  guide.visible = false;
  scene.add(guide);

  // 中心が濃く、外側に向かって透明になる丸い画像（白で作り、色は材質の color で付ける）
  function softDotTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  // 赤い十字＋真ん中の点。周りを少しぼかして光っているように見せる（クール用）
  function laserCrossTexture() {
    const size = 128, m = size / 2;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.strokeStyle = g.fillStyle = 'rgb(255,30,30)';
    g.shadowColor = 'rgba(255,0,0,0.9)';
    g.lineCap = 'round';
    for (const [blur, w] of [[14, 6], [4, 3]]) {   // 外側のぼかし → 内側の芯
      g.shadowBlur = blur; g.lineWidth = w;
      g.beginPath();
      g.moveTo(m, 14); g.lineTo(m, m - 12); g.moveTo(m, m + 12); g.lineTo(m, size - 14);
      g.moveTo(14, m); g.lineTo(m - 12, m); g.moveTo(m + 12, m); g.lineTo(size - 14, m);
      g.stroke();
      g.beginPath(); g.arc(m, m, w * 0.9, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const guideTex = { cute: guide.material.map, royal: guide.material.map, cool: laserCrossTexture() };

  // メッキの写り込み用の周囲（画面には出さない）：暗い筐体の中に、照明の光る帯が並んでいるイメージ
  let chromeEnvTex = null;
  function chromeEnv() {
    if (chromeEnvTex) return chromeEnvTex;
    const env = new THREE.Scene();
    env.background = new THREE.Color(0x1a1d24);
    const lit = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const warm = new THREE.MeshBasicMaterial({ color: 0xfff1dc, side: THREE.DoubleSide });
    const dim = new THREE.MeshBasicMaterial({ color: 0x5a6070, side: THREE.DoubleSide });
    const add = (mat, w, h, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
    };
    add(lit, 30, 3, 0, 9, -6, Math.PI / 2);        // 天井の蛍光灯（2本）
    add(lit, 30, 3, 0, 9, 6, Math.PI / 2);
    add(warm, 2, 14, -10, 2, 0, 0, Math.PI / 2);   // 左右の縦の照明
    add(warm, 2, 14, 10, 2, 0, 0, Math.PI / 2);
    add(lit, 16, 1.2, 0, 4, 10);                   // 手前上の帯
    add(dim, 40, 40, 0, -8, 0, Math.PI / 2);       // 下（板・台のぼんやりした反射）
    const pm = new THREE.PMREMGenerator(renderer);
    chromeEnvTex = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    return chromeEnvTex;
  }

  // 景品の箱の絵（呼び出し側が setPrizeBoxArt で渡す）と、網の格子の絵
  let prizeBoxArt = null;
  function canvasTex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  let netTex = null;
  function netTexture() {
    if (netTex) return netTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#c9d1db'; g.lineWidth = 6;
    g.strokeRect(0, 0, 64, 64);
    netTex = new THREE.CanvasTexture(c);
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    netTex.repeat.set(6, 8);
    return netTex;
  }

  let tracked = [];   // { body, group }
  let round = null;
  let viewName = 'front';
  let showGuide = false;

  // 試験：筐体の外にはみ出した部分を描かない（見た目だけ。当たり判定はそのまま）
  const CABINET_CLIP = [
    new THREE.Plane(new THREE.Vector3(1, 0, 0), 20), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 20),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 14.6), new THREE.Plane(new THREE.Vector3(0, 0, -1), 15.5)
  ];
  function clipGroup(group) {
    group.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) { m.clippingPlanes = CABINET_CLIP; } });
  }
  function buildPart(p) {
    let geo;
    if (p.type === 'box') geo = p.round ? roundedBox(p.size[0], p.size[1], p.size[2], p.round)
      : new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    else if (p.type === 'capsule') geo = new THREE.CapsuleGeometry(p.radius, p.halfHeight * 2, 8, 16);
    else if (p.type === 'cylinder') geo = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.sides || 24);
    else if (p.type === 'rod') geo = new THREE.CylinderGeometry(p.radius, p.radius, 1, 12);
    else if (p.type === 'ball') geo = new THREE.SphereGeometry(p.radius, 16, 12);
    else if (p.type === 'torus') geo = new THREE.TorusGeometry(p.radius, p.tube, 12, 40);
    else if (p.type === 'chainlink') geo = chainLinkGeometry(p.length, p.width, p.wire, 0);
    else if (p.type === 'curblink') geo = chainLinkGeometry(p.length, p.width, p.wire, p.twist);
    else if (p.type === 'splitring') geo = splitRingGeometry(p.radius, p.wire, p.gap);
    let mat;
    if (p.floor) {
      // 台の上面（床）：テーマ別の材質
      mat = cabinetMod.floorMaterial(THREE, theme, chromeEnv());
    } else if (p.finish === 'brass') {
      // 真ちゅう（フック）：金色の金属のつや＋筐体照明の写り込み
      mat = new THREE.MeshStandardMaterial({ color: 0xe0b24a, metalness: 1, roughness: 0.22, envMap: chromeEnv(), envMapIntensity: 1.4 });
    } else if (p.finish === 'gloss') {
      // つやのあるプラスチック（板）：表面に薄いコーティングの光沢
      mat = new THREE.MeshPhysicalMaterial({ color: p.color, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
        envMap: chromeEnv(), envMapIntensity: 0.5 });
    } else if (p.finish === 'chrome') {
      // メッキ調（リング・チェーン・つなぎのリング）：強い光沢＋筐体照明の写り込み
      mat = new THREE.MeshStandardMaterial({ color: p.color, metalness: 1, roughness: 0.14, envMap: chromeEnv(), envMapIntensity: 1.2 });
    } else if (p.plastic) {
      // プラスチック（景品の網を引くチェーン）
      mat = new THREE.MeshStandardMaterial({ color: p.color, metalness: 0, roughness: 0.35 });
    } else if (p.net) {
      // 網：格子の絵を貼った半透明の板
      mat = new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    } else if (p.prizeBox && prizeBoxArt) {
      // 景品の箱：正面・背面に景品の絵、側面はカテゴリーの色
      // 紙の箱：少しつやのある印刷面（角は丸めた形）
      const face = new THREE.MeshStandardMaterial({ map: canvasTex(prizeBoxArt.front), roughness: 0.55, envMap: chromeEnv(), envMapIntensity: 0.25 });
      const side = new THREE.MeshStandardMaterial({ color: prizeBoxArt.side, roughness: 0.55, envMap: chromeEnv(), envMapIntensity: 0.25 });
      const top = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, envMap: chromeEnv(), envMapIntensity: 0.25 });
      mat = [side, side, top, side, face, face];   // +x, −x, +y, −y, +z（正面）, −z
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: p.color,
        metalness: p.type === 'box' ? 0.1 : 0.6,
        roughness: 0.45
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    if (p.floor) mesh.userData.floor = true;
    if (p.hideInView) mesh.visible = false;   // 試験：描かない部品（アームの上に突き出た棒）
    if (p.type === 'rod') {
      // 2点を結ぶ棒（from → to）
      const a = new THREE.Vector3(...p.from), b = new THREE.Vector3(...p.to);
      mesh.scale.y = a.distanceTo(b);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      mesh.castShadow = p.castShadow !== false;
      mesh.receiveShadow = true;
      return mesh;
    }
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.quat) mesh.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    if (p.rotY) mesh.rotation.y = p.rotY;
    mesh.castShadow = p.castShadow !== false; // リング・チェーン・アームは影を落とさない（真下の目印を影として使う）
    mesh.receiveShadow = true;
    return mesh;
  }

  // 角を丸めた箱（見た目だけ。当たり判定はふつうの箱のまま）
  //   細かく分けた箱の頂点を、角から r の帯に寄せてから丸める。面ごとの材質（景品の箱の絵）はそのまま使える
  function roundedBox(w, h, d, r) {
    const m = 3, n = 2 + 2 * m;   // 丸める帯に3分割ずつ
    const geo = new THREE.BoxGeometry(w, h, d, n, n, n);
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    // 各頂点がどの面か（+x, −x, +y, −y, +z, −z の順に作られている）
    const face = new Array(pos.count);
    for (const [gi, gr] of geo.groups.entries()) for (let i = gr.start; i < gr.start + gr.count; i++) face[geo.index.getX(i)] = gr.materialIndex;
    const half = [w / 2, h / 2, d / 2];
    const band = 2 * m / n;
    const v = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      v[0] = pos.getX(i); v[1] = pos.getY(i); v[2] = pos.getZ(i);
      const inner = [0, 0, 0], off = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const H = half[k], rr = Math.min(r, H * 0.9), g = v[k] / H;
        let c;
        if (g < -1 + band) c = -H + rr * (g + 1) / band;
        else if (g > 1 - band) c = H - rr * (1 - g) / band;
        else c = g / (1 - band) * (H - rr);
        inner[k] = Math.max(-(H - rr), Math.min(H - rr, c));
        off[k] = c - inner[k];
        v[k] = c;
      }
      const len = Math.hypot(off[0], off[1], off[2]);
      if (len > 1e-6) {
        const rr = Math.min(r, Math.min(...half) * 0.9);
        for (let k = 0; k < 3; k++) v[k] = inner[k] + off[k] / len * rr;
        nor.setXYZ(i, off[0] / len, off[1] / len, off[2] / len);
      }
      pos.setXYZ(i, v[0], v[1], v[2]);
      // 貼る絵の位置（UV）を、丸めたあとの位置から決め直す（絵が真ん中に寄って引き伸ばされないように）
      const f = face[i], U = (k, sign) => (sign > 0 ? v[k] + half[k] : half[k] - v[k]) / (2 * half[k]);
      if (f === 0) uv.setXY(i, U(2, -1), U(1, 1));        // +x
      else if (f === 1) uv.setXY(i, U(2, 1), U(1, 1));    // −x
      else if (f === 2) uv.setXY(i, U(0, 1), U(2, -1));   // +y
      else if (f === 3) uv.setXY(i, U(0, 1), U(2, 1));    // −y
      else if (f === 4) uv.setXY(i, U(0, 1), U(1, 1));    // +z（正面）
      else uv.setXY(i, U(0, -1), U(1, 1));                // −z
    }
    return geo;
  }

  // チェーンの輪：縦長の楕円（直線＋半円2つ）に沿った管。同じ寸法は1回だけ作って使い回す
  const linkGeoCache = new Map();
  // twist：コマ自体のねじれ（上端と下端で何ラジアン回っているか。0ならふつうの楕円の輪）
  function chainLinkGeometry(length, width, wire, twist) {
    const key = `${length}|${width}|${wire}|${twist}`;
    if (linkGeoCache.has(key)) return linkGeoCache.get(key);
    const rr = width / 2;
    const straight = Math.max(length - width, 0);
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {           // 上の半円
      const t = Math.PI * i / N;
      pts.push(new THREE.Vector3(rr * Math.cos(t), straight / 2 + rr * Math.sin(t), 0));
    }
    for (let i = 0; i <= N; i++) {           // 下の半円
      const t = Math.PI + Math.PI * i / N;
      pts.push(new THREE.Vector3(rr * Math.cos(t), -straight / 2 + rr * Math.sin(t), 0));
    }
    // ねじれ：高さに応じて縦軸まわりに回す（キヘイのような平たくねじれたコマ）
    if (twist) {
      for (const p of pts) {
        const a = twist * (p.y / length);
        const x = p.x * Math.cos(a), z = p.x * Math.sin(a);
        p.x = x; p.z = z;
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, 48, wire, 6, true);
    geo.userData.shared = true;
    linkGeoCache.set(key, geo);
    return geo;
  }

  // 二重リング（キーリング型）：線をらせん状に2周巻いた形。gap＝2周の間隔
  function splitRingGeometry(radius, wire, gap) {
    const key = `split|${radius}|${wire}|${gap}`;
    if (linkGeoCache.has(key)) return linkGeoCache.get(key);
    const pts = [];
    const N = 64;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 4;              // 2周
      pts.push(new THREE.Vector3(radius * Math.cos(t), radius * Math.sin(t), (i / N - 0.5) * gap));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false);
    const geo = new THREE.TubeGeometry(curve, 96, wire, 6, false);
    geo.userData.shared = true;
    linkGeoCache.set(key, geo);
    return geo;
  }

  function clear() {
    for (const t of tracked) {
      scene.remove(t.group);
      t.group.traverse(o => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material) for (const m of [].concat(o.material)) { if (m.map && m.map !== netTex && !m.map.userData.keep) m.map.dispose(); m.dispose(); }
      });
    }
    tracked = [];
  }

  function setRound(r) {
    clear();
    round = r;
    setCabinet(r.preset.field);
    for (const v of r.visuals) {
      const group = new THREE.Group();
      for (const p of v.parts) group.add(buildPart(p));
      // 試験：床のかたまり（取り出し口の穴の壁も含む）は、筐体の内側（x −20〜20、z −14.6〜15.5）だけ描く
      if (v.parts.some(p => p.floor)) { group.userData.clipToCabinet = true; clipGroup(group); }
      scene.add(group);
      const t = v.body.translation(), q = v.body.rotation();
      tracked.push({
        body: v.body, group,
        prevP: new THREE.Vector3(t.x, t.y, t.z),
        prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w)
      });
    }
    fitFrame();   // 手前の枠も置き直す
    setView(viewName);
  }

  const FRONT_ARM_HEIGHT = 45;
  let camDistance = 0;   // ノーマルの距離：0＝全体、1＝中、2＝近い
  // 試験：「全体」の構図（完成予想図から逆算した値が出発点）
  const FULL_VIEW = { z: 59, y: 24, widthRatio: 0.95, topAt: 0.091 };
  const NEAR_VIEW = { width: 30, centerY: 22 };   // 近い：z = 0 で横30cmが画面幅。中：全体と近いの真ん中の距離
  function setDistance(level, duration = 0) {
    camDistance = level;
    if (viewName === 'front') setView('front', duration);
  }
  // 各カメラの位置・注視点・画角を計算する
  function viewPose(name) {
    const h = round.machine.hookWorldBase();
    // 縦長の画面でも台全体（横幅約26cm）が入るよう、縦横比に合わせて距離を決める
    const aspect = camera.aspect || 0.5;
    const fit = (width, fovDeg) => {
      const hfov = 2 * Math.atan(Math.tan(fovDeg * Math.PI / 360) * aspect);
      return (width / 2) / Math.tan(hfov / 2);
    };
    // 正面：板からアームまでの高さ全体が入るように引く
    //   距離は通常のアームの高さ（45cm）で決めて固定する（特訓でアームの高さを変えても、筐体の見え方は変わらない）
    const top = FRONT_ARM_HEIGHT + 2;
    const fitH = (height, fovDeg) => (height / 2) / Math.tan(fovDeg * Math.PI / 360);
    if (name === 'zoom') {
      const d = Math.max(16, fit(11, 40));
      return {
        fov: 40,
        pos: new THREE.Vector3(h.x + d * 0.45, h.y + 5, h.z + d * 0.9),
        look: new THREE.Vector3(h.x, h.y + 1.5, h.z + 0.8),
        offY: 0.5 - layoutFull().playCenter   // 試験：見ている点を上のプレイ領域の中央へ
      };
    }
    // 手前の枠（キュート・クール）を置くときに使う、今までの「近い」
    const d = Math.max(40, fit(30, 50), fitH(top * 1.35, 50));
    const oldNear = { fov: 50, pos: new THREE.Vector3(0, top * 0.6, d), look: new THREE.Vector3(0, top * 0.5, 0) };
    if (name === 'frontNear') return oldNear;
    // 試験：新しい画面構成
    //   全体：完成予想図に合わせた構図（layoutFull で決める）
    //   中・近い：全体と同じ横の画角・高さ・水平な視線のまま前へ寄る。上のプレイ領域の中央に、板からアームまで（y ≒ 22）が来るようにずらす
    const L = layoutFull();
    const full = L.pose;
    const tH = Math.tan(L.hHalf);
    const zNear = NEAR_VIEW.width / 2 / tH;                 // z = 0 で横 NEAR_VIEW.width cm が画面幅になる距離
    const horiz = z => {
      const p = { fov: full.fov, pos: new THREE.Vector3(0, FULL_VIEW.y, z), look: new THREE.Vector3(0, FULL_VIEW.y, -100) };
      const t = Math.tan(full.fov * Math.PI / 360);
      const f0 = 0.5 - ((NEAR_VIEW.centerY - FULL_VIEW.y) / z) / t / 2;   // y = centerY（z = 0）の、ずらす前の位置
      p.offY = f0 - L.playCenter;
      return p;
    };
    const front = camDistance === 2 ? horiz(zNear) : camDistance === 1 ? horiz((zNear + FULL_VIEW.z) / 2) : full;
    if (name === 'zoomFront') {
      // 正面ズーム：正面と同じ向き・角度のまま、フック付近へ寄る（見える幅は斜めズームと同じ）
      const dir = front.look.clone().sub(front.pos).normalize();
      const look = new THREE.Vector3(h.x, h.y + 1.5, h.z);
      const dz = Math.max(16, fit(11, 40));
      return { fov: 40, pos: look.clone().addScaledVector(dir, -dz), look, offY: 0.5 - layoutFull().playCenter };
    }
    return front;
  }

  // 今のカメラの状態（切り替えの途中もここを基準にする）
  const cur = { fov: 50, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let tween = null;   // { from, to, start, dur }

  function applyPose(p) {
    camera.fov = p.fov;
    camera.position.copy(p.pos);
    camera.lookAt(p.look);
    // 試験：絵を上下にずらす（カメラの向きは変えないので、遠近感はそのまま）
    const off = p.offY || 0;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    if (off) camera.setViewOffset(w, h, 0, off * h, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    cur.fov = p.fov; cur.pos.copy(p.pos); cur.look.copy(p.look); cur.offY = off;
  }

  // duration（秒）を付けると、今の位置からなめらかに移る
  function setView(name, duration = 0) {
    viewName = name;
    if (!round) return;
    const to = viewPose(name);
    if (duration > 0) {
      tween = {
        from: { fov: cur.fov, pos: cur.pos.clone(), look: cur.look.clone(), offY: cur.offY || 0 },
        to, start: performance.now(), dur: duration * 1000
      };
    } else {
      tween = null;
      applyPose(to);
    }
  }

  function updateTween() {
    if (!tween) return;
    let t = (performance.now() - tween.start) / tween.dur;
    if (t >= 1) { applyPose(tween.to); tween = null; return; }
    t = t * t * (3 - 2 * t);   // 動き出しと止まり際をゆっくり
    applyPose({
      fov: tween.from.fov + (tween.to.fov - tween.from.fov) * t,
      pos: tween.from.pos.clone().lerp(tween.to.pos, t),
      look: tween.from.look.clone().lerp(tween.to.look, t),
      offY: (tween.from.offY || 0) + ((tween.to.offY || 0) - (tween.from.offY || 0)) * t
    });
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      fitFrame();
      if (tween) tween.to = viewPose(viewName); else setView(viewName);
    }
  }

  // 目印を置く高さ：アームの真下が板の上なら板の上面、外なら台の床面
  function guideHeight(a) {
    const b = round.preset.board;
    const t = round.machine.board.translation();
    const onBoard = Math.abs(a.x - t.x) <= b.width / 2 && Math.abs(a.z - t.z) <= b.depth / 2;
    return onBoard ? t.y + b.height / 2 + 0.02 : 0.02;
  }

  // 物理を1ステップ進める直前に呼ぶ：今の位置を「1つ前」として覚える
  function savePrev() {
    for (const t of tracked) {
      const p = t.body.translation(), q = t.body.rotation();
      t.prevP.set(p.x, p.y, p.z);
      t.prevQ.set(q.x, q.y, q.z, q.w);
    }
  }

  // alpha：1つ前の物理状態(0)〜最新の物理状態(1)の間のどこを描くか
  // 画面の更新と物理の刻みがずれても、動きがカクつかないように間を補って描く
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function render(alpha = 1) {
    resize();
    updateTween();
    let armGroup = null;
    for (const t of tracked) {
      const p = t.body.translation(), q = t.body.rotation();
      tmpP.set(p.x, p.y, p.z);
      tmpQ.set(q.x, q.y, q.z, q.w);
      t.group.position.lerpVectors(t.prevP, tmpP, alpha);
      t.group.quaternion.slerpQuaternions(t.prevQ, tmpQ, alpha);
      if (round && t.body === round.arm.body) armGroup = t.group;
    }
    if (round) {
      guide.visible = showGuide;
      const a = armGroup ? armGroup.position : round.arm.pos;
      guide.position.set(a.x, guideHeight(a), a.z);
    }
    // 試験：上のプレイ領域は今のカメラで、下部外装（操作パネル）は「全体」のカメラで描く
    //   全体の構図で止まっているときは、同じ絵なので1回で描く
    const same = viewName === 'front' && camDistance === 0 && !tween;
    if (same) { renderer.render(scene, camera); return; }
    const L = updateFixedCam();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const split = Math.round(L.consoleTop * h);   // 上から split px までがプレイ領域
    renderer.setScissorTest(true);
    renderer.setScissor(0, h - split, w, split);
    renderer.render(scene, camera);
    renderer.setScissor(0, 0, w, h - split);
    renderer.render(scene, fixedCam);
    renderer.setScissorTest(false);
  }

  // 筐体の飾り（テーマ別。cabinet.js）。フィールドの奥行きかテーマが変わったときだけ作り直す
  let theme = 'cute';
  applyThemeLight(theme);
  let cabinet = null, cabinetKey = '';
  // ---- 試験：新しい画面構成 ----
  // 全体の構図：カメラ z = FULL_VIEW.z、高さ y、水平な視線。前面（z = 15.5、幅40cm）が画面幅の ratio になる横の画角
  //   絵の上下の位置は setViewOffset で、上の飾りのてっぺん（y = 56）が画面の上から topAt の位置に来るようにする
  //   決め方：ratio をなるべく大きく（最大 0.95）、topAt はなるべく 0.091（完成予想図）に近く。ただし
  //     ・下部外装の底が画面の下から CONSOLE_FIT.margin px 以内に収まる
  //     ・下部外装の高さ（画面上）が、操作ボタンに必要な高さ（controlsReserve）以上
  let controlsReserve = 0;   // 操作ボタン（流れる文字の帯を含む）に必要な高さ（px）。main.js から
  let layoutCache = null, layoutKey = '';
  function poseFor(ratio, topAt, aspect) {
    const FV = FULL_VIEW;
    const hHalf = Math.atan((40 / ratio / 2) / (FV.z - 15.5));
    const vfov = 2 * Math.atan(Math.tan(hHalf) / aspect) * 180 / Math.PI;
    const t = Math.tan(vfov * Math.PI / 360);
    const frac = (y, z) => 0.5 - ((y - FV.y) / (FV.z - z)) / t / 2;   // ずらす前の、画面の上からの位置（0〜1）
    const offY = frac(56, 15) - topAt;
    return {
      pose: { fov: vfov, pos: new THREE.Vector3(0, FV.y, FV.z), look: new THREE.Vector3(0, FV.y, -100), offY },
      hHalf, ratio, topAt,
      consoleTop: frac(TEMP_CONSOLE.top, TEMP_CONSOLE.front) - offY,
      consoleBottom: frac(TEMP_CONSOLE.bottom, TEMP_CONSOLE.front) - offY
    };
  }
  function layoutFull() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    const key = `${w}x${h}:${controlsReserve}`;
    if (layoutCache && key === layoutKey) return layoutCache;
    const aspect = w / h;
    let best = null;
    for (let ratio = FULL_VIEW.widthRatio; ratio >= 0.6 && !best; ratio -= 0.005) {
      for (let topAt = FULL_VIEW.topAt; topAt >= CONSOLE_FIT.minTopAt - 1e-9; topAt -= 0.005) {
        const L = poseFor(ratio, topAt, aspect);
        const okBottom = L.consoleBottom * h <= h - (h < 700 ? CONSOLE_FIT.marginShort : CONSOLE_FIT.margin);
        const okHeight = (L.consoleBottom - L.consoleTop) * h >= controlsReserve;
        if (okBottom && okHeight) { best = L; break; }
      }
    }
    best = best || poseFor(0.6, CONSOLE_FIT.minTopAt, aspect);
    best.playCenter = best.consoleTop / 2;   // 上のプレイ領域（画面の上〜下部外装の上の端）の中央
    layoutCache = best; layoutKey = key;
    return best;
  }
  function setControlsReserve(px) {
    if (Math.abs(px - controlsReserve) < 1) return;
    controlsReserve = px;
    if (round) setView(viewName);
  }
  // 下部外装（操作パネル）は、いつも「全体」のカメラで描く（ズームや距離を変えても動かない）
  const fixedCam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  function updateFixedCam() {
    const L = layoutFull(), p = L.pose;
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    fixedCam.aspect = w / h; fixedCam.fov = p.fov; fixedCam.near = camera.near; fixedCam.far = camera.far;
    fixedCam.position.copy(p.pos); fixedCam.lookAt(p.look);
    fixedCam.setViewOffset(w, h, 0, p.offY * h, w, h);
    fixedCam.updateProjectionMatrix(); fixedCam.updateMatrixWorld();
    return L;
  }
  // 試験：仮の下部外装。筐体の台（y = −2）の下から、前面 z = TEMP_CONSOLE.front に立つ箱
  const TEMP_CONSOLE = { halfW: 20, top: -2, bottom: -25, front: 16, depth: 2 };
  const CONSOLE_FIT = { margin: 14, marginShort: 10, minTopAt: 0.03 };   // 外装の底と画面の下の余白（px）、上の飾りを上げてよい限度
  function tempConsole() {
    const c = TEMP_CONSOLE;
    const color = theme === 'cool' ? 0x26324a : theme === 'cute' ? 0x7a3f9a : 0x8a1424;   // 背景と見分けがつく色
    const m = new THREE.Mesh(new THREE.BoxGeometry(c.halfW * 2, c.top - c.bottom, c.depth),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 }));
    m.position.set(0, (c.top + c.bottom) / 2, c.front - c.depth / 2);
    m.userData.tempConsole = true;
    return m;
  }
  // 試験：操作ボタンを置く場所。「全体」の構図で仮外装の前面の四すみを画面に写した位置（ピクセル）
  function consoleRect() {
    const c = TEMP_CONSOLE;
    const L = updateFixedCam();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const toPx = v => { v.project(fixedCam); return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h }; };
    const tl = toPx(new THREE.Vector3(-c.halfW, c.top, c.front));
    const tr = toPx(new THREE.Vector3(c.halfW, c.top, c.front));
    const bl = toPx(new THREE.Vector3(-c.halfW, c.bottom, c.front));
    return { left: tl.x, right: tr.x, top: tl.y, bottom: bl.y, width: tr.x - tl.x, screenH: h, widthRatio: L.ratio, topAt: L.topAt };
  }
  function setCabinet(field) {
    const key = theme;   // 筐体はテーマが変わったときだけ作り直す
    if (cabinet && key === cabinetKey) return;
    if (cabinet) {
      scene.remove(cabinet);
      cabinet.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of [].concat(o.material)) m.dispose();   // テクスチャは使い回すので残す
      });
    }
    cabinetKey = key;
    cabinet = cabinetMod.buildCabinet(THREE, { field, theme, envMap: chromeEnv(), goldFinish: royalGold });
    // 試験：仮の下部外装（操作ボタンを囲む部分）。装飾なしの箱
    cabinet.add(tempConsole());
    scene.add(cabinet);
    fitFrame();
  }
  // 手前の枠：正面カメラで見たとき、天幕が画面の上端、柱が左右の端、電球の帯が下端に来るように並べる
  function fitFrame() {
    if (!cabinet || !round) return;
    const p = viewPose('frontNear');   // 枠は「近い」で見たときの画面の端に合わせて置く（距離を変えても筐体の同じ場所にある）
    const c = camera.clone();
    c.fov = p.fov; c.position.copy(p.pos); c.lookAt(p.look);
    c.updateProjectionMatrix(); c.updateMatrixWorld();
    const zf = cabinetMod.FRAME.z;
    const at = (nx, ny) => {   // 画面上の点から見た先が、枠を立てる面と交わる位置
      const dir = new THREE.Vector3(nx, ny, 0.5).unproject(c).sub(c.position).normalize();
      return c.position.clone().addScaledVector(dir, (zf - c.position.z) / dir.z);
    };
    cabinetMod.layoutFrame(cabinet, theme, { L: at(-1, 0).x, R: at(1, 0).x, T: at(0, 1).y, B: at(0, -1).y });
  }
  // テーマを切り替える：背景・筐体・床
  function setTheme(t) {
    theme = t === 'cool' || t === 'royal' ? t : 'cute';
    applyThemeLight(theme);
    scene.background = new THREE.Color(cabinetMod.backgroundColor(theme));
    guide.material.map = guideTex[theme];
    guide.material.color.set(theme === 'cool' ? 0xffffff : 0x000000);
    guide.material.opacity = theme === 'cool' ? 1 : 0.55;
    guide.material.needsUpdate = true;
    if (round) {
      setCabinet(round.preset.field);
      for (const tr of tracked) tr.group.traverse(o => {
        if (o.userData.floor) { o.material.dispose(); o.material = cabinetMod.floorMaterial(THREE, theme, chromeEnv()); }
        if (o.userData.floor) o.material.clippingPlanes = CABINET_CLIP;
      });
    }
  }

  // 景品パネル：板の後ろ（移動範囲の奥より後ろ）に立てる。絵は呼び出し側が canvas で渡す
  let prizePanel = null;
  let badgeOn = false;
  function setPrizePanel(canvas, field) {
    if (!prizePanel) {
      const W = 30, H = 28;   // 台の奥の壁全体を覆う大きさ
      prizePanel = new THREE.Group();
      // 縁取りなし：絵の板だけ（裏は薄い白い板）
      const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      back.position.z = -0.2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ toneMapped: false }));
      prizePanel.add(back, face);
      prizePanel.userData.face = face;
      // 「未獲得!!」のシール：左上の角から少しはみ出して、少し斜めに貼る（未獲得の景品のときだけ表示）
      const bw = 10, bh = bw * 466 / 512;   // 画像（512×466）と同じ縦横比
      const badgeTex = new THREE.TextureLoader().load('./assets/badge_unowned.webp');
      badgeTex.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh),
        new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, alphaTest: 0.1, toneMapped: false }));
      badge.position.set(-W / 2 - 2.7 + bw / 2, H / 2 + 3.2 - bh / 2, 0.3);
      badge.rotation.z = 12 * Math.PI / 180;
      badge.visible = badgeOn;
      prizePanel.add(badge);
      prizePanel.userData.badge = badge;
      prizePanel.position.y = H / 2 + 0.4;
      scene.add(prizePanel);
    }
    const face = prizePanel.userData.face;
    if (face.material.map) face.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    face.material.map = tex;
    face.material.needsUpdate = true;
    prizePanel.position.z = -10 - 3.5;   // 決まった位置（移動範囲を変えても動かない）
  }

  return {
    consoleRect,   // 試験：操作ボタンを置く場所
    setControlsReserve,
    poseInfo: (dist, name = 'front') => { const saved = camDistance; camDistance = dist; const p = viewPose(name); camDistance = saved; const L = layoutFull();
      return { fov: p.fov, hfov: 2 * Math.atan(Math.tan(p.fov * Math.PI / 360) * camera.aspect) * 180 / Math.PI, pos: p.pos.toArray(), look: p.look.toArray(), offY: p.offY, widthRatio: L.ratio, topAt: L.topAt, consoleTop: L.consoleTop, consoleBottom: L.consoleBottom }; },
    setRound,
    setPrizePanel,
    // 景品パネルの「未獲得!!」シールを出す／消す
    setPrizeBadge(on) { badgeOn = on; if (prizePanel) prizePanel.userData.badge.visible = on; },
    setPrizeBoxArt(art) { prizeBoxArt = art; },
    setTheme,
    savePrev,
    setView,
    setDistance,
    render,
    setGuide(on) { showGuide = on; }
  };
}
