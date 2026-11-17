// =============================================================
// 3D描画（Three.js）
// 物理側が返す visual（body ＋ 部品リスト）から形を作り、毎フレーム位置を写す
// カメラ：正面 / 横から / フック拡大
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
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      metalness: p.type === 'box' ? 0.1 : 0.6,
      roughness: 0.45
    });
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
        if (o.material) o.material.dispose();
      });
    }
    tracked = [];
  }

  function setRound(r) {
    clear();
    round = r;
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

  function setView(name) {
    viewName = name;
    if (!round) return;
    const h = round.machine.hookWorldBase();
    // 縦長の画面でも台全体（横幅約26cm）が入るよう、縦横比に合わせて距離を決める
    const aspect = camera.aspect || 0.5;
    const fit = (width, fovDeg) => {
      const hfov = 2 * Math.atan(Math.tan(fovDeg * Math.PI / 360) * aspect);
      return (width / 2) / Math.tan(hfov / 2);
    };
    if (name === 'front') {
      camera.fov = 50;
      const d = Math.max(40, fit(30, 50));
      camera.position.set(0, 14 + d * 0.3, d);
      camera.lookAt(0, 9, 0);
    } else if (name === 'side') {
      camera.fov = 50;
      const d = Math.max(40, fit(26, 50));
      camera.position.set(d, 14 + d * 0.3, 0);
      camera.lookAt(0, 9, 0);
    } else if (name === 'zoom') {
      camera.fov = 40;
      const d = Math.max(16, fit(11, 40));
      camera.position.set(h.x + d * 0.45, h.y + 5, h.z + d * 0.9);
      camera.lookAt(h.x, h.y + 1.5, h.z + 0.8);
    }
    camera.updateProjectionMatrix();
    document.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
  }

  function toggleZoom() {
    setView(viewName === 'zoom' ? 'front' : 'zoom');
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      setView(viewName);
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

  return {
    setRound,
    savePrev,
    setView,
    toggleZoom,
    render,
    setGuide(on) { showGuide = on; }
  };
}
