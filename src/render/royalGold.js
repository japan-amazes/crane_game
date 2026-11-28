const GOLD_MATERIALS = new Set(['Polished warm brass', 'Champagne edge trim']);

function createGoldEnvironment(THREE, renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(0x51443c);

  // Width, height, position, sRGB color and linear radiance multiplier.
  const lights = [
    [7, 17, [-5.6, 0.9, 11], 0xffebd2, 0.72],
    [1.5, 19, [-1.5, 0.5, 9], 0xfff5e8, 1.65],
    [1.45, 18, [5.8, 1.2, 9], 0xfff6e0, 1.4],
    [5.4, 15, [9, 0.25, 7.2], 0xf1eeff, 0.56],
    [15, 3.8, [0, 8.5, 4.5], 0xfff1d9, 1.18],
    [3.3, 16, [-7.2, 1.4, -6.8], 0xffd6a0, 0.75],
    [17, 11, [0, -7, 3.5], 0xcda784, 0.28],
  ];

  for (const [width, height, position, color, radiance] of lights) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(radiance),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }

  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(studio, 0.055, 0.1, 50, { size: 256 });
  } finally {
    generator.dispose();
    for (const panel of studio.children) {
      panel.geometry.dispose();
      panel.material.dispose();
    }
  }
}

/**
 * Create once per WebGLRenderer. Apply to an owned royal GLB scene after
 * loading it. Dispose after all models using this finish have been removed.
 */
export function createRoyalGoldFinish(THREE, renderer) {
  let environment;
  let disposed = false;

  return {
    apply(root) {
      if (disposed) throw new Error('Royal gold finish has been disposed');

      const materials = new Set();
      root.traverse((object) => {
        if (!object.isMesh) return;
        const slots = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of slots) {
          if (material?.isMeshStandardMaterial && GOLD_MATERIALS.has(material.name)) {
            materials.add(material);
          }
        }
      });
      if (materials.size === 0) return 0;

      environment ??= createGoldEnvironment(THREE, renderer);
      for (const material of materials) {
        material.color.setHex(0xffd58a);
        material.metalness = 0.97;
        material.roughness = 0.125;
        material.envMap = environment.texture;
        material.envMapIntensity = 2.55;
        material.emissive.setHex(0xffd27a);
        material.emissiveIntensity = 0.035;
        material.needsUpdate = true;
      }
      return materials.size;
    },

    dispose() {
      disposed = true;
      environment?.dispose();
      environment = undefined;
    },
  };
}
