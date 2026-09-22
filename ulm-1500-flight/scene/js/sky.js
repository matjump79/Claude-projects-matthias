// Sky, sun and weather. A late-summer morning: the sun is in the east-south-
// east, low enough to rake the roofs and throw the tower's bulk into relief.
import { makeRng } from './rng.js';

// Radians: azimuth from +x, elevation. The sun was at 0.60 rad — about 34
// degrees — which is high enough that nothing casts a shadow worth seeing.
// 0.46 rad is roughly 26 degrees: mid-morning, and every roof ridge and every
// buttress throws a shadow about twice its own height.
export const SUN_DIR = { az: 1.82, el: 0.46 };

export function sunVector() {
  const { az, el } = SUN_DIR;
  return [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
}

export function buildSky(THREE) {
  const sun = sunVector();
  const uniforms = {
    topColor: { value: new THREE.Color(0x3f6fa8) },
    midColor: { value: new THREE.Color(0x9dbcd6) },
    horizon: { value: new THREE.Color(0xdfd8c6) },
    sunDir: { value: new THREE.Vector3(sun[0], sun[1], sun[2]).normalize() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizon, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 col = mix(horizon, midColor, smoothstep(0.0, 0.34, h));
        col = mix(col, topColor, smoothstep(0.26, 0.95, h));
        // the sun and its aureole
        float c = max(dot(d, normalize(sunDir)), 0.0);
        col += vec3(1.0, 0.92, 0.76) * pow(c, 900.0) * 1.5;
        col += vec3(1.0, 0.88, 0.68) * pow(c, 16.0) * 0.22;
        col += vec3(1.0, 0.9, 0.72) * pow(c, 3.0) * 0.05;
        // haze thickening towards the ground
        col = mix(col, horizon * 1.02, smoothstep(0.10, -0.12, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  // Large enough to enclose the whole modelled plain, whose corners now reach
  // about 12.7 km, so no piece of ground is ever drawn outside the sky.
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(18000, 40, 24), mat);
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

function cloudTexture(THREE, seed) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const ctx = cv.getContext('2d');
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, 1024, 1024);
  // fair-weather cumulus: clumps of soft discs
  for (let c = 0; c < 26; c++) {
    const cx = rng() * 1024, cy = rng() * 1024;
    const scale = 40 + rng() * 120;
    const puffs = 14 + rng() * 22;
    for (let p = 0; p < puffs; p++) {
      const a = rng() * 6.28, r = rng() * scale;
      const x = cx + Math.cos(a) * r * 1.7, y = cy + Math.sin(a) * r * 0.75;
      const rad = scale * (0.35 + rng() * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const alpha = 0.16 + rng() * 0.2;
      g.addColorStop(0, `rgba(255,255,255,${alpha})`);
      g.addColorStop(0.55, `rgba(248,246,240,${alpha * 0.5})`);
      g.addColorStop(1, 'rgba(240,238,232,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildClouds(THREE) {
  const group = new THREE.Group();
  // A flat cloud deck seen from below foreshortens to nothing near the horizon,
  // and at 1550 m over a camera flying at 300 m that happens across most of the
  // frame — the deck came out as a few hard stripes. Lifting it to a realistic
  // cumulus base and spreading the texture out keeps it reading as cloud.
  const layers = [
    { y: 3400, size: 34000, rep: 3, op: 0.62, seed: 11, drift: 1.2 },
    { y: 5200, size: 46000, rep: 2, op: 0.34, seed: 23, drift: 0.6 },
  ];
  for (const L of layers) {
    const tex = cloudTexture(THREE, L.seed);
    tex.repeat.set(L.rep, L.rep);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: L.op, depthWrite: false, fog: true,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L.size, L.size), mat);
    m.rotation.x = Math.PI / 2;
    m.position.y = L.y;
    m.userData.drift = L.drift;
    m.renderOrder = -5;
    group.add(m);
  }
  group.name = 'clouds';
  return group;
}
