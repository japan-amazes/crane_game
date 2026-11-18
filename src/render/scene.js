// =============================================================
// 3D描画（Three.js）
// 物理側が返す visual（body ＋ 部品リスト）から形を作り、毎フレーム位置を写す
// カメラ：正面（front）/ フック付近の拡大（zoom）
// =============================================================

export function createScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12151c);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 500);

  // 照明
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(12, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20; sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // 真下ガイド：アームの真下に、周りをぼかした黒い丸（影のような目印）を表示
  const GUIDE_SIZE = 3.5;    // 直径（cm）
  const guide = new THREE.Mesh(
    new THREE.PlaneGeometry(GUIDE_SIZE, GUIDE_SIZE),
    new THREE.MeshBasicMaterial({
      map: softDotTexture(),
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

  // 中心が黒く、外側に向かって透明になる丸い画像
  function softDotTexture() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.35, 'rgba(0,0,0,0.85)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

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

  function buildPart(p) {
    let geo;
    if (p.type === 'box') geo = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    else if (p.type === 'capsule') geo = new THREE.CapsuleGeometry(p.radius, p.halfHeight * 2, 6, 12);
    else if (p.type === 'ball') geo = new THREE.SphereGeometry(p.radius, 16, 12);
    else if (p.type === 'torus') geo = new THREE.TorusGeometry(p.radius, p.tube, 12, 40);
    else if (p.type === 'chainlink') geo = chainLinkGeometry(p.length, p.width, p.wire, 0);
    else if (p.type === 'curblink') geo = chainLinkGeometry(p.length, p.width, p.wire, p.twist);
    else if (p.type === 'splitring') geo = splitRingGeometry(p.radius, p.wire, p.gap);
    let mat;
    if (p.finish === 'chrome') {
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
      const face = new THREE.MeshStandardMaterial({ map: canvasTex(prizeBoxArt.front), roughness: 0.5 });
      const side = new THREE.MeshStandardMaterial({ color: prizeBoxArt.side, roughness: 0.5 });
      const top = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      mat = [side, side, top, side, face, face];   // +x, −x, +y, −y, +z（正面）, −z
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: p.color,
        metalness: p.type === 'box' ? 0.1 : 0.6,
        roughness: 0.45
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.quat) mesh.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    if (p.rotY) mesh.rotation.y = p.rotY;
    mesh.castShadow = p.castShadow !== false; // リング・チェーン・アームは影を落とさない（真下の目印を影として使う）
    mesh.receiveShadow = true;
    return mesh;
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
        if (o.material) for (const m of [].concat(o.material)) { if (m.map && m.map !== netTex) m.map.dispose(); m.dispose(); }
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
      scene.add(group);
      const t = v.body.translation(), q = v.body.rotation();
      tracked.push({
        body: v.body, group,
        prevP: new THREE.Vector3(t.x, t.y, t.z),
        prevQ: new THREE.Quaternion(q.x, q.y, q.z, q.w)
      });
    }
    setView(viewName);
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
    const top = round.preset.field.armHeight + 2;
    const fitH = (height, fovDeg) => (height / 2) / Math.tan(fovDeg * Math.PI / 360);
    if (name === 'zoom') {
      const d = Math.max(16, fit(11, 40));
      return {
        fov: 40,
        pos: new THREE.Vector3(h.x + d * 0.45, h.y + 5, h.z + d * 0.9),
        look: new THREE.Vector3(h.x, h.y + 1.5, h.z + 0.8)
      };
    }
    const d = Math.max(40, fit(30, 50), fitH(top * 1.35, 50));
    return { fov: 50, pos: new THREE.Vector3(0, top * 0.6, d), look: new THREE.Vector3(0, top * 0.5, 0) };
  }

  // 今のカメラの状態（切り替えの途中もここを基準にする）
  const cur = { fov: 50, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let tween = null;   // { from, to, start, dur }

  function applyPose(p) {
    camera.fov = p.fov;
    camera.position.copy(p.pos);
    camera.lookAt(p.look);
    camera.updateProjectionMatrix();
    cur.fov = p.fov; cur.pos.copy(p.pos); cur.look.copy(p.look);
  }

  // duration（秒）を付けると、今の位置からなめらかに移る
  function setView(name, duration = 0) {
    viewName = name;
    if (!round) return;
    const to = viewPose(name);
    if (duration > 0) {
      tween = {
        from: { fov: cur.fov, pos: cur.pos.clone(), look: cur.look.clone() },
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
      look: tween.from.look.clone().lerp(tween.to.look, t)
    });
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
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
    renderer.render(scene, camera);
  }

  // 筐体：背面は白いパネル、左右はガラス（見た目だけ。当たり判定はなし）
  //   背面は景品パネルのすぐ後ろ、左右のガラスは網の棚と取り出し口より外側に置く
  const CAB = { halfW: 20, height: 58, front: 14 };
  let cabinet = null, cabinetKey = '';
  function setCabinet(field) {
    const back = (field ? field.zBack : -10) - 4.6;
    const key = String(back);
    if (cabinet && key === cabinetKey) return;
    if (cabinet) {
      scene.remove(cabinet);
      cabinet.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    cabinetKey = key;
    cabinet = new THREE.Group();
    const depth = CAB.front - back;
    const zc = (CAB.front + back) / 2;
    // 背面の白いパネル
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(CAB.halfW * 2, CAB.height, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xf4f5f7, emissive: 0x5a5d63, roughness: 0.7, metalness: 0 })   // 照明が弱くても白く見えるよう少し自発光
    );
    wall.position.set(0, CAB.height / 2 - 2, back - 0.3);
    wall.receiveShadow = true;
    cabinet.add(wall);
    // 左右のガラス（うっすら青く、照明が映り込む）と、ふちの金属フレーム
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd8ecff, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2,
      envMap: chromeEnv(), envMapIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a919c, metalness: 0.8, roughness: 0.3, envMap: chromeEnv() });
    for (const sx of [-1, 1]) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(depth, CAB.height), glassMat);
      glass.rotation.y = Math.PI / 2;
      glass.position.set(sx * CAB.halfW, CAB.height / 2 - 2, zc);
      glass.renderOrder = 10;
      cabinet.add(glass);
      // フレーム（手前・奥の縦、上・下の横）
      for (const z of [back, CAB.front]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, CAB.height, 0.8), frameMat);
        post.position.set(sx * CAB.halfW, CAB.height / 2 - 2, z);
        cabinet.add(post);
      }
      for (const y of [-2, CAB.height - 2]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, depth), frameMat);
        rail.position.set(sx * CAB.halfW, y, zc);
        cabinet.add(rail);
      }
    }
    scene.add(cabinet);
  }

  // 景品パネル：板の後ろ（移動範囲の奥より後ろ）に立てる。絵は呼び出し側が canvas で渡す
  let prizePanel = null;
  function setPrizePanel(canvas, field) {
    if (!prizePanel) {
      const W = 30, H = 28;   // 台の奥の壁全体を覆う大きさ
      prizePanel = new THREE.Group();
      const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, H + 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.3, roughness: 0.6 }));
      back.position.z = -0.25;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ toneMapped: false }));
      prizePanel.add(back, face);
      prizePanel.userData.face = face;
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
    prizePanel.position.z = (field ? field.zBack : -10) - 3.5;
  }

  return {
    setRound,
    setPrizePanel,
    setPrizeBoxArt(art) { prizeBoxArt = art; },
    savePrev,
    setView,
    render,
    setGuide(on) { showGuide = on; }
  };
}
