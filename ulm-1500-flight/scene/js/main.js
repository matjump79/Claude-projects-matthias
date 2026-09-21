// Scene assembly and the deterministic frame hook the renderer drives.
import * as THREE from '../vendor/three.module.js';
import { buildAtlas } from './atlas.js';
import { buildTerrain, buildWater } from './terrain.js';
import { buildMinster } from './minster.js';
import { buildWalls, buildBridge } from './walls.js';
import { buildTown } from './town.js';
import { buildProps, buildBoats, buildBirds, danubeAt } from './props.js';
import { buildSky, buildClouds, sunVector } from './sky.js';
import { cameraAt, DURATION } from './flight.js';
import { makeOverlay } from './titles.js';
import { DANUBE } from './plan.js';

const params = new URLSearchParams(location.search);
const WIDTH = +(params.get('w') || 1920);
const HEIGHT = +(params.get('h') || 1080);
const SHADOWS = params.get('shadows') !== '0';
const PREVIEW = params.get('preview') === '1';

const HAZE = 0xd9d3c2;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
if (SHADOWS) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(HAZE, 0.00028);

const camera = new THREE.PerspectiveCamera(47, WIDTH / HEIGHT, 1.2, 9000);

// ------------------------------------------------------------------ light ---
const sv = sunVector();
const sun = new THREE.DirectionalLight(0xfff2da, 3.0);
sun.position.set(sv[0] * 1200, sv[1] * 1200, sv[2] * 1200);
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);
if (SHADOWS) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 480;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 200; sun.shadow.camera.far = 3000;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.4;
}
scene.add(new THREE.HemisphereLight(0xbcd6f0, 0x8d8768, 1.85));

// ------------------------------------------------------------------ build ---
const t0 = performance.now();
const atlas = buildAtlas(THREE);
// Two-sided: the buildings are open shells assembled from quads, and a
// mis-wound face would otherwise punch a hole in a roof or a nave wall.
const cityMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, side: THREE.DoubleSide });

scene.add(buildSky(THREE));
const clouds = buildClouds(THREE);
scene.add(clouds);

const terrain = buildTerrain(THREE, atlas);
terrain.receiveShadow = SHADOWS;
scene.add(terrain);

const water = buildWater(THREE);
scene.add(water);

function addBuilder(builder, name) {
  const mesh = new THREE.Mesh(builder.build(THREE), cityMat);
  mesh.name = name;
  mesh.castShadow = SHADOWS;
  mesh.receiveShadow = SHADOWS;
  scene.add(mesh);
  return mesh;
}

const stats = {};
const townB = buildTown();       stats.town = townB.triangles;      addBuilder(townB, 'town');
const minsterB = buildMinster(); stats.minster = minsterB.triangles; addBuilder(minsterB, 'minster');
const wallsB = buildWalls();     stats.walls = wallsB.triangles;     addBuilder(wallsB, 'walls');
const bridgeB = buildBridge();   stats.bridge = bridgeB.triangles;   addBuilder(bridgeB, 'bridge');
const propsB = buildProps();     stats.props = propsB.triangles;     addBuilder(propsB, 'props');
stats.terrain = terrain.geometry.attributes.position.count / 3;

const boats = buildBoats(THREE, cityMat);
for (const m of boats.children) { m.castShadow = SHADOWS; }
scene.add(boats);

const birds = buildBirds(THREE);
scene.add(birds);

// total length of the river polyline, for moving the boats at a sane speed
let RIVER_LEN = 0;
for (let i = 0; i < DANUBE.length - 1; i++) {
  RIVER_LEN += Math.hypot(DANUBE[i + 1][0] - DANUBE[i][0], DANUBE[i + 1][1] - DANUBE[i][1]);
}

const overlay = makeOverlay(document);
const buildMs = performance.now() - t0;

// ----------------------------------------------------------------- frame ----
const up = new THREE.Vector3(0, 1, 0);
const tmpLook = new THREE.Vector3();

function setFrame(t) {
  const c = cameraAt(t);
  camera.fov = c.fov;
  camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  tmpLook.set(c.look[0], c.look[1], c.look[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(tmpLook);
  camera.rotateZ(c.roll);
  camera.updateProjectionMatrix();

  // the shadow frustum follows the camera's subject, not the world origin
  if (SHADOWS) {
    const fx = c.look[0] * 0.55 + c.pos[0] * 0.45;
    const fz = c.look[2] * 0.55 + c.pos[2] * 0.45;
    sun.position.set(fx + sv[0] * 1200, sv[1] * 1200, fz + sv[2] * 1200);
    sun.target.position.set(fx, 0, fz);
    sun.target.updateMatrixWorld();
    sun.shadow.camera.updateProjectionMatrix?.();
  }

  // the river runs
  const wtex = water.userData.texture;
  wtex.offset.y = -t * 0.016;
  wtex.offset.x = Math.sin(t * 0.12) * 0.004;

  for (const m of boats.children) {
    const u = m.userData;
    const s = u.s + (u.speed * t * 2.4) / RIVER_LEN * 60;
    const p = danubeAt(((s % 1) + 1) % 1);
    m.position.set(p.x, Math.sin(t * 0.7 + u.s * 20) * 0.12, p.z);
    m.rotation.y = -p.ang + (u.speed < 0 ? Math.PI : 0);
    m.rotation.z = Math.sin(t * 0.9 + u.s * 13) * 0.012;
  }

  // a flock turning over the meadows east of the town
  const ba = t * 0.10;
  birds.position.set(420 + Math.cos(ba) * 260, 120 + Math.sin(t * 0.3) * 16, 120 + Math.sin(ba) * 220);
  birds.rotation.y = -ba;

  for (const c2 of clouds.children) {
    c2.position.x = -t * c2.userData.drift * 1.4;
    c2.position.z = -t * c2.userData.drift * 0.5;
  }

  overlay(t);
}

function render(t) {
  setFrame(t);
  renderer.render(scene, camera);
}

window.__ulm = {
  render, DURATION, stats, buildMs,
  width: WIDTH, height: HEIGHT,
  triangles: Object.values(stats).reduce((a, b) => a + b, 0),
};
window.__ulmReady = true;
document.title = 'Ulm 1500';

// A live preview when the page is opened by hand, frozen frames when the
// renderer drives it.
if (PREVIEW) {
  const start = performance.now();
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % DURATION;
    render(t);
    requestAnimationFrame(loop);
  };
  loop();
} else {
  render(+(params.get('t') || 0));
}
