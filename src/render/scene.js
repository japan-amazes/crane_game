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

  // 真下ガイド（アームの真下に点を表示）
  const guide = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xff5577, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  guide.rotation.x = -Math.PI / 2;
  guide.visible = false;
  scene.add(guide);

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
    else if (p.type === 'chainlink') geo = chainLinkGeometry(p.length, p.width, p.wire);
    const mat = new THREE.MeshStandardMaterial({
      color: p.color,
      metalness: p.type === 'box' || p.type === 'ball' ? 0.1 : 0.6,
      roughness: 0.45
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.quat) mesh.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    if (p.rotY) mesh.rotation.y = p.rotY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // チェーンの輪：縦長の楕円（直線＋半円2つ）に沿った管。同じ寸法は1回だけ作って使い回す
  const linkGeoCache = new Map();
  function chainLinkGeometry(length, width, wire) {
    const key = `${length}|${width}|${wire}`;
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
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, 48, wire, 6, true);
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
      tracked.push({ body: v.body, group });
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

  function render() {
    resize();
    for (const t of tracked) {
      const p = t.body.translation();
      const q = t.body.rotation();
      t.group.position.set(p.x, p.y, p.z);
      t.group.quaternion.set(q.x, q.y, q.z, q.w);
    }
    if (round) {
      guide.visible = showGuide;
      const a = round.arm.pos;
      guide.position.set(a.x, round.machine.boardTop + 0.02, a.z);
    }
    renderer.render(scene, camera);
  }

  return {
    setRound,
    setView,
    toggleZoom,
    render,
    setGuide(on) { showGuide = on; }
  };
}
