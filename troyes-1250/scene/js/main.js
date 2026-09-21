// main.js — assemble the town and hold the camera.
//
// The view is rendered in tiles: the camera's projection is offset so that each
// pass draws one rectangle of a much larger frame, and the tiles are stitched
// afterwards. That is the only dependable way to get a true 8K frame out of a
// software rasteriser, and it has the side benefit that the shadow map, which
// is scene-wide, stays identical across every tile.

import * as THREE from '../vendor/three.module.js';
import { makeRng } from './rng.js';
import { materials, C } from './palette.js';
import { buildLand, buildStreets, groundHeight, EXT } from './land.js';
import { buildTown } from './town.js';
import { buildWalls } from './walls.js';
import { buildCathedral, buildMonuments } from './monuments.js';
import { buildFair } from './fair.js';
import { buildSky, buildSmoke, smokeMesh, sunDirection } from './sky.js';
import { Mesher } from './geom.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920);
const H = +(q.get('h') || 1080);
const SHADOWS = q.get('shadows') !== '0';
const SEED = +(q.get('seed') || 20250724);
const SHADOW_MAP = +(q.get('smap') || 4096);
const SHADOW_SPAN = +(q.get('sspan') || 1200);
const SHADOW_BIAS = +(q.get('sbias') || -0.00012);
const SHADOW_TYPE = q.get('stype') || 'pcf';

// ---------------------------------------------------------------------------
// Camera presets. Azimuth is the compass bearing FROM the subject TO the
// camera, so "150" means the camera stands south-south-east and looks
// north-north-west across the town.
// ---------------------------------------------------------------------------
export const VIEWS = {
  // The main plate: the whole cork, the Cite on the right with the cathedral
  // building site, the fair quarter centre, the Bourg running away to the left.
  // Framing note: with the plain now modelled out to 7.2 km, sky only appears
  // if the camera's downward pitch is less than half the vertical field of
  // view. atan((height - targetY) / distance) = 15.6 deg against a half-FOV of
  // 17 deg leaves about a degree and a half of sky above the horizon — a real
  // horizon band rather than a cut-off edge of terrain.
  master: { target: { x: -430, z: 30 }, azimuth: 156, distance: 1500, height: 475, fov: 34, targetY: 55 },

  // Lower and closer, over the fairground, with the cathedral behind it.
  fair:   { target: { x: -478, z: 145 }, azimuth: 163, distance: 470, height: 178, fov: 33, targetY: 14 },

  // The Cite from the south-west: cathedral, palace, collegiate, Hotel-Dieu,
  // and the channel that divides the two halves of the town.
  cite:   { target: { x: -90, z: 20 }, azimuth: 208, distance: 620, height: 245, fov: 31, targetY: 20 },

  // Close on the cathedral works: the finished chevet, the roofless transept,
  // the cranes and the masons' yard.
  works:  { target: { x: 6, z: 14 }, azimuth: 196, distance: 245, height: 118, fov: 33, targetY: 20 },

  // High and square-on from the south, nearest to a surveyor's cavalier view.
  cavalier: { target: { x: -430, z: 90 }, azimuth: 180, distance: 2450, height: 1150, fov: 30, targetY: 20 },
};

function placeCamera(cam, v, aspect) {
  const a = v.azimuth * Math.PI / 180;
  // bearing measured from north (-Z), clockwise toward east (+X)
  const ox = Math.sin(a) * v.distance;
  const oz = -Math.cos(a) * v.distance;
  cam.position.set(v.target.x + ox, v.height, v.target.z + oz);
  cam.fov = v.fov;
  cam.aspect = aspect;
  cam.near = 5;
  cam.far = 14000;
  cam.updateProjectionMatrix();
  cam.lookAt(v.target.x, v.targetY, v.target.z);
}

// ---------------------------------------------------------------------------

const t0 = performance.now();
const rng = makeRng(SEED);

const scene = new THREE.Scene();
const mats = materials();
const stats = {};

// --- ground, water, planting ------------------------------------------------
const L = buildLand(rng);
const landMesh = new THREE.Mesh(L.land.geometry(), mats.ground);
landMesh.receiveShadow = true;
scene.add(landMesh);
stats.land = L.land.tris;

const streets = buildStreets(rng);

// --- the built town ---------------------------------------------------------
const T = buildTown(rng);
stats.houses = T.count;
stats.town = T.town.tris;

const walls = buildWalls(rng);
stats.walls = walls.walls.tris;

// monuments and the cathedral share one buffer
const mon = new Mesher();
buildCathedral(mon, rng);
buildMonuments(mon, rng);
stats.monuments = mon.tris;

const F = buildFair(rng);
stats.stalls = F.stalls;
stats.people = F.people;
stats.fair = F.fair.tris;

// merge the big opaque buffers into as few meshes as the materials allow
function add(mesher, material, cast = true, receive = true) {
  if (!mesher.tris) return null;
  const mesh = new THREE.Mesh(mesher.geometry(), material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

add(streets, mats.ground, false, true);
add(T.town, mats.solid);
add(T.gardens, mats.foliage);
add(L.foliage, mats.foliage);
add(walls.walls, mats.solid);
add(mon, mats.solid);
add(F.fair, mats.solid);
add(F.cloth, mats.cloth);

// water last, and it neither casts nor receives
const waterM = new Mesher();
for (const src of [L.water, walls.water]) {
  waterM.pos.push(...src.pos); waterM.nrm.push(...src.nrm);
  waterM.col.push(...src.col); waterM.uv.push(...src.uv);
  waterM.tris += src.tris;
}
const water = new THREE.Mesh(waterM.geometry(), mats.water);
water.receiveShadow = true;
scene.add(water);
stats.water = waterM.tris;

// --- sky, sun, smoke --------------------------------------------------------
buildSky(scene);
const smoke = smokeMesh(buildSmoke(rng, groundHeight), groundHeight, rng);
scene.add(smoke);

const sun = new THREE.DirectionalLight(0xffe9c4, 3.05);
const sd = sunDirection();
sun.position.set(sd.x * 3000, sd.y * 3000, sd.z * 3000);
sun.target.position.set(-520, 0, 60);
scene.add(sun.target);
if (SHADOWS) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  // The shadow frustum is kept as tight as the town allows: at 4096 across
  // 2400 m that is 0.6 m per texel, about the width of a roof ridge. The depth
  // range matters just as much — a bias is a fraction of it, so a loose near
  // and far turns a small bias into several metres and eats every shadow.
  const S = SHADOW_SPAN;   // half-width of the shadow frustum, metres
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 2250; sun.shadow.camera.far = 4750;
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = 0.35;
}
scene.add(sun);

// Sky light, and the warm bounce off chalk and stubble. Kept deliberately low:
// on a clear July morning the sun carries almost all of it, and a shadow that
// only costs a few per cent of brightness is no shadow at all.
scene.add(new THREE.HemisphereLight(0x93b4da, 0xbaa478, 0.60));
scene.add(new THREE.AmbientLight(0xffffff, 0.09));

// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = SHADOWS;
// PCFSoft blurs by a fixed number of texels. At roughly half a metre per texel
// over a town this size that smears a house's shadow across several metres and
// washes it out completely, so plain PCF is the right choice here.
renderer.shadowMap.type = SHADOW_TYPE === 'soft' ? THREE.PCFSoftShadowMap
  : SHADOW_TYPE === 'basic' ? THREE.BasicShadowMap : THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.34;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(27, W / H, 5, 14000);

let triangles = 0;
scene.traverse((o) => { if (o.isMesh && o.geometry.attributes.position) triangles += o.geometry.attributes.position.count / 3; });

/**
 * Render one tile of a larger frame.
 *   view   name of a preset in VIEWS
 *   tiles  how many tiles per axis (1 = ordinary single-pass render)
 *   tx,ty  which tile, 0-based, ty counted from the top
 */
function renderTile(view, tiles, tx, ty) {
  const v = VIEWS[view] || VIEWS.master;
  const fullW = W * tiles, fullH = H * tiles;
  placeCamera(camera, v, fullW / fullH);
  if (tiles > 1) camera.setViewOffset(fullW, fullH, tx * W, ty * H, W, H);
  else camera.clearViewOffset();
  renderer.render(scene, camera);
}

// diagnostic: the tallest point in each buffer, so a runaway mesh is obvious
const tallest = {};
for (const [name, mesher] of [['land', L.land], ['town', T.town], ['gardens', T.gardens],
     ['foliage', L.foliage], ['walls', walls.walls], ['monuments', mon], ['fair', F.fair], ['cloth', F.cloth]]) {
  let maxY = -1e9, at = null;
  for (let i = 1; i < mesher.pos.length; i += 3) {
    if (mesher.pos[i] > maxY) { maxY = mesher.pos[i]; at = [mesher.pos[i - 1], mesher.pos[i + 1]]; }
  }
  tallest[name] = { y: Math.round(maxY), at: at && at.map((v) => Math.round(v)) };
}

window.__troyes = {
  renderTile,
  tallest,
  shadow: SHADOWS ? {
    enabled: renderer.shadowMap.enabled,
    map: SHADOW_MAP, span: SHADOW_SPAN, bias: SHADOW_BIAS,
    near: sun.shadow.camera.near, far: sun.shadow.camera.far,
    lightPos: sun.position.toArray().map((v) => Math.round(v)),
    distToTarget: Math.round(sun.position.distanceTo(sun.target.position)),
  } : null,
  views: Object.keys(VIEWS),
  stats,
  triangles,
  buildMs: performance.now() - t0,
  W, H,
};

renderTile('master', 1, 0, 0);
window.__troyesReady = true;
console.log(`built in ${Math.round(performance.now() - t0)} ms, ${triangles.toLocaleString()} triangles`, stats);
