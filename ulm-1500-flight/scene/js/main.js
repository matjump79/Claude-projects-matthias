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
const SHADOW_MAP = +(params.get('smap') || 4096);
const CAPTIONS = params.get('captions') !== '0';

const HAZE = 0xd3cdba;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// ACES rather than Neutral: Neutral is faithful but very flat, and over a
// hazy landscape it leaves the whole frame sitting in the middle of the range.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
if (SHADOWS) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// The haze was thick enough to grey out the far half of every frame. Enough
// to give depth, not enough to eat the Alb.
scene.fog = new THREE.FogExp2(HAZE, 0.00015);

// The far plane has to clear the sky dome as seen from the far side of the
// camera's own travel, not just from the origin: at far = 9000 against a dome
// of radius 7000, the dome was being clipped away in the distance and the black
// background showed through it as a triangular hole on the horizon.
const camera = new THREE.PerspectiveCamera(47, WIDTH / HEIGHT, 2.0, 26000);

// ------------------------------------------------------------------ light ---
const sv = sunVector();
// A low sun means a horizontal surface only catches sin(elevation) of it, so
// the sun has to be turned up as it is brought down the sky or the whole town
// goes dark. Lit ground ends up around three times the brightness of shaded
// ground, which is about right for a clear morning.
const sun = new THREE.DirectionalLight(0xffeecb, 4.2);
sun.position.set(sv[0] * 1200, sv[1] * 1200, sv[2] * 1200);
sun.target.position.set(0, 0, 0);
scene.add(sun, sun.target);
if (SHADOWS) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const S = 480;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  // The depth bias is a FRACTION of the frustum's depth range, so a loose near
  // and far quietly turn a small-looking number into metres of offset and eat
  // every shadow in the scene. The light sits 1200 m out along its own axis;
  // 500 to 2000 brackets the town with room to spare, and -0.00012 of that
  // range is about 18 cm.
  sun.shadow.camera.near = 500; sun.shadow.camera.far = 2000;
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.25;
}
// Sky light kept low. A clear morning is carried almost entirely by the sun,
// and a fill bright enough to compete with it leaves the town looking like a
// model lit from everywhere at once.
scene.add(new THREE.HemisphereLight(0xa8c6e6, 0x9a8f70, 0.88));
scene.add(new THREE.AmbientLight(0xffffff, 0.10));

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

const overlay = CAPTIONS ? makeOverlay(document) : () => {};
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
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

/**
 * Render one tile of a much larger frame.
 *
 * Chromium rasterises WebGL in software here, and a single 7680x4320 drawing
 * buffer is an allocation that tends to fail silently and come back black. So a
 * big still is cut into tiles, each drawn with its projection offset, and glued
 * together afterwards. The scene, the lights and the shadow map are identical
 * across tiles, so the seams are exact.
 */
function renderTile(t, tiles, tx, ty) {
  setFrame(t);
  const fullW = WIDTH * tiles, fullH = HEIGHT * tiles;
  camera.aspect = fullW / fullH;
  if (tiles > 1) camera.setViewOffset(fullW, fullH, tx * WIDTH, ty * HEIGHT, WIDTH, HEIGHT);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

window.__ulm = {
  render, renderTile, DURATION, stats, buildMs,
  scene, camera,                       // exposed so a render problem can be probed
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
