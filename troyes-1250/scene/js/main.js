// main.js — assemble the town, and render one photograph of it.
//
// The frame is built in tiles: the camera's projection is offset so each pass
// draws one rectangle of a much larger image, and the tiles are stitched
// afterwards. Within each tile the image is ACCUMULATED over many passes — see
// render.js for why — which is what produces the soft shadows, the ambient
// occlusion and the antialiasing, all of them by sampling rather than by
// approximation.

import * as THREE from '../vendor/three.module.js';
import { makeRng } from './rng.js';
import { buildMaterials } from './textures.js';
import { Accumulator, cosineHemisphere, jitterCone, skyColour } from './render.js';
import { buildLand, buildStreets, groundHeight } from './land.js';
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
const SKY_MAP = +(q.get('skymap') || 2048);
const SAMPLES = +(q.get('samples') || 1);
const EXPOSURE = +(q.get('exposure') || 1.72);
const SKY_STRENGTH = +(q.get('sky') || 0.62);
const SUN_STRENGTH = +(q.get('sunI') || 6.4);

// ---------------------------------------------------------------------------
// Camera presets. Azimuth is the compass bearing FROM the subject TO the
// camera, so "158" means the camera stands south-south-east and looks
// north-north-west across the town.
// ---------------------------------------------------------------------------
export const VIEWS = {
  hero:     { target: { x: -420, z: 130 }, azimuth: 158, distance: 1130, height: 470,  fov: 39, targetY: 26 },
  master:   { target: { x: -430, z: 30 },  azimuth: 156, distance: 1500, height: 475,  fov: 34, targetY: 55 },
  fair:     { target: { x: -478, z: 145 }, azimuth: 163, distance: 470,  height: 178,  fov: 33, targetY: 14 },
  cite:     { target: { x: -90,  z: 20 },  azimuth: 208, distance: 620,  height: 245,  fov: 31, targetY: 20 },
  works:    { target: { x: 6,    z: 14 },  azimuth: 196, distance: 245,  height: 118,  fov: 33, targetY: 20 },
  cavalier: { target: { x: -430, z: 90 },  azimuth: 180, distance: 2450, height: 1150, fov: 30, targetY: 20 },
};

function placeCamera(cam, v, aspect, jx, jy, tiles, tx, ty) {
  const a = v.azimuth * Math.PI / 180;
  const ox = Math.sin(a) * v.distance;
  const oz = -Math.cos(a) * v.distance;
  cam.position.set(v.target.x + ox, v.height, v.target.z + oz);
  cam.fov = v.fov;
  cam.aspect = aspect;
  cam.near = 5;
  cam.far = 16000;
  cam.lookAt(v.target.x, v.targetY, v.target.z);
  // the sub-pixel jitter rides on the same offset the tiling already uses
  cam.setViewOffset(W * tiles, H * tiles, tx * W + jx, ty * H + jy, W, H);
  cam.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------

const t0 = performance.now();
const rng = makeRng(SEED);

const scene = new THREE.Scene();
const M = buildMaterials();
const stats = {};

// Texture repeats are set per material rather than per call site: the UVs in
// the geometry are world metres, so one number here fixes the physical size of
// every tile, stone and plaster panel in the town.
const repeat = (mat, k) => {
  for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) if (t) t.repeat.set(k, k);
};
repeat(M.wall, 0.26);
repeat(M.stone, 0.20);
repeat(M.roofTile, 0.34);
repeat(M.roofThatch, 0.22);
repeat(M.roofShingle, 0.30);
repeat(M.ground, 0.10);

const MATS = {
  main: M.wall,
  stone: M.stone,
  roofTile: M.roofTile,
  roofThatch: M.roofThatch,
  roofShingle: M.roofShingle,
  ground: M.ground,
  foliage: M.foliage,
  cloth: M.cloth,
  water: M.water,
};

// --- build ------------------------------------------------------------------
const L = buildLand(rng);
const streets = buildStreets(rng);
const T = buildTown(rng);
const walls = buildWalls(rng);
const mon = new Mesher('stone');
buildCathedral(mon, rng);
buildMonuments(mon, rng);
const F = buildFair(rng);

stats.houses = T.count;
stats.stalls = F.stalls;
stats.people = F.people;

/** Turn every channel of a mesher into a mesh on the right material. */
function addMesher(mesher, { cast = true, receive = true } = {}) {
  for (const [name, geo] of Object.entries(mesher.geometries())) {
    const mat = MATS[name];
    if (!mat) { console.warn('no material for channel', name); continue; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast && name !== 'water';
    mesh.receiveShadow = receive;
    scene.add(mesh);
    stats['t_' + name] = (stats['t_' + name] || 0) + geo.attributes.position.count / 3;
  }
}

addMesher(L.land, { cast: false });
addMesher(streets, { cast: false });
addMesher(L.foliage);
addMesher(T.town);
addMesher(T.gardens);
addMesher(walls.walls);
addMesher(mon);
addMesher(F.fair);
addMesher(F.cloth);
addMesher(L.water, { cast: false });
addMesher(walls.water, { cast: false });

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  antialias: false,                 // the accumulation does the antialiasing
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = SHADOWS;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // graded in render.js
renderer.toneMapping = THREE.NoToneMapping;               // accumulate in HDR
document.body.appendChild(renderer.domElement);

// --- sky, environment, smoke ------------------------------------------------
const dome = buildSky(scene);
scene.add(smokeMesh(buildSmoke(rng, groundHeight), groundHeight, rng));

// Image-based lighting. The sky dome is prefiltered into an environment map so
// every surface gets a plausible specular response; without it the water is a
// flat colour and the lead roofs look like paper.
if (dome?.material?.map) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(dome.material.map);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.28;
  pmrem.dispose();
}

// --- light ------------------------------------------------------------------
const sunDir = sunDirection();
const TARGET = new THREE.Vector3(-430, 0, 60);

const sun = new THREE.DirectionalLight(0xfff0d6, SUN_STRENGTH);
sun.target.position.copy(TARGET);
scene.add(sun, sun.target);
if (SHADOWS) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const S = 1250;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 2100; sun.shadow.camera.far = 4900;
  sun.shadow.bias = -0.00010;
  sun.shadow.normalBias = 0.28;
}

// The sky, sampled one direction at a time. Over many passes this becomes true
// occluded ambient light; on a single pass it is just one odd-angled lamp, so a
// preview at samples=1 looks harsher than the finished frame.
const skyLight = new THREE.DirectionalLight(0xbfd4ee, SKY_STRENGTH);
skyLight.target.position.copy(TARGET);
scene.add(skyLight, skyLight.target);
if (SHADOWS) {
  skyLight.castShadow = true;
  skyLight.shadow.mapSize.set(SKY_MAP, SKY_MAP);
  const S = 1250;
  skyLight.shadow.camera.left = -S; skyLight.shadow.camera.right = S;
  skyLight.shadow.camera.top = S; skyLight.shadow.camera.bottom = -S;
  skyLight.shadow.camera.near = 500; skyLight.shadow.camera.far = 5400;
  skyLight.shadow.bias = -0.00018;
  skyLight.shadow.normalBias = 0.55;
}

// a floor of bounce, so the deepest occlusion is not pure black
scene.add(new THREE.AmbientLight(0xb9ad92, 0.06));

// ---------------------------------------------------------------------------

const camera = new THREE.PerspectiveCamera(34, W / H, 5, 16000);
const accum = new Accumulator(renderer, W, H);
accum.grade.uExposure.value = EXPOSURE;

let triangles = 0;
scene.traverse((o) => {
  if (o.isMesh && o.geometry?.attributes?.position) triangles += o.geometry.attributes.position.count / 3;
});

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const SUN_HALF_ANGLE = 0.011;        // rad — a shade wider than the real disc

// A long accumulation has to be driven in chunks. One pass over 2.5 M
// triangles with two shadow maps takes a couple of seconds in a software
// rasteriser, so a 48-sample tile in a single call would block the page for two
// minutes and the driving script's next command would time out waiting for it.
let tile = null;

/** Set a tile up and clear its accumulation buffer. */
function beginTile(view, tiles, tx, ty) {
  tile = {
    v: VIEWS[view] || VIEWS.hero,
    tiles, tx, ty,
    fullW: W * tiles, fullH: H * tiles,
    // Every tile must walk the SAME sequence of sun and sky directions. Seed it
    // per tile and each tile averages a slightly different set of lights, which
    // shows up as faint brightness steps along the seams.
    srand: makeRng(0xA17E5),
    done: 0,
  };
  accum.clear();
}

/** Fold `n` more passes into the current tile. */
function accumulate(n) {
  const { v, tiles, tx, ty, fullW, fullH, srand } = tile;
  for (let s = 0; s < n; s++) {
    const single = tile.done === 0 && n === 1 && SAMPLES === 1;
    const jx = single ? 0 : srand() - 0.5;
    const jy = single ? 0 : srand() - 0.5;
    placeCamera(camera, v, fullW / fullH, jx, jy, tiles, tx, ty);

    const d = single ? _v.copy(sunDir) : jitterCone(sunDir, SUN_HALF_ANGLE, srand, _v);
    sun.position.set(TARGET.x + d.x * 3000, d.y * 3000, TARGET.z + d.z * 3000);

    const sd = cosineHemisphere(srand);
    skyLight.position.set(
      TARGET.x + sd.x * 2600,
      Math.max(200, sd.y * 2600),
      TARGET.z + sd.z * 2600,
    );
    skyColour(sd, sunDir, _c);
    skyLight.color.copy(_c);

    accum.add(scene, camera);
    tile.done++;
  }
  return tile.done;
}

/** Average, grade and present the tile that has been accumulating. */
function finishTile() {
  const { tiles, tx, ty, fullW, fullH, done } = tile;
  accum.resolve(done, [tx * W, ty * H], [W, H], [fullW, fullH]);
  return done;
}

/** Render one tile in a single call — convenient for small previews. */
function renderTile(view, tiles, tx, ty, samples = SAMPLES) {
  const v = VIEWS[view] || VIEWS.hero;
  const fullW = W * tiles, fullH = H * tiles;
  const srand = makeRng(0xA17E5);

  accum.clear();
  for (let s = 0; s < samples; s++) {
    const jx = samples === 1 ? 0 : srand() - 0.5;
    const jy = samples === 1 ? 0 : srand() - 0.5;
    placeCamera(camera, v, fullW / fullH, jx, jy, tiles, tx, ty);

    const d = samples === 1 ? _v.copy(sunDir) : jitterCone(sunDir, SUN_HALF_ANGLE, srand, _v);
    sun.position.set(TARGET.x + d.x * 3000, d.y * 3000, TARGET.z + d.z * 3000);

    const sd = cosineHemisphere(srand);
    skyLight.position.set(
      TARGET.x + sd.x * 2600,
      Math.max(200, sd.y * 2600),
      TARGET.z + sd.z * 2600,
    );
    skyColour(sd, sunDir, _c);
    skyLight.color.copy(_c);

    accum.add(scene, camera);
  }
  accum.resolve(samples, [tx * W, ty * H], [W, H], [fullW, fullH]);
}

window.__troyes = {
  renderTile, beginTile, accumulate, finishTile,
  views: Object.keys(VIEWS),
  grade: accum.grade,
  stats,
  triangles,
  buildMs: performance.now() - t0,
  W, H,
};

renderTile('hero', 1, 0, 0, 1);
window.__troyesReady = true;
console.log(`built in ${Math.round(performance.now() - t0)} ms, ${triangles.toLocaleString()} triangles`, stats);
