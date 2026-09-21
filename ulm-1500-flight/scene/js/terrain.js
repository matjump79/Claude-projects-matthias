// Landscape: the Danube valley, the strip fields of the city's own territory,
// the meadows and the wooded hills behind the town.
import { Builder, jitter } from './geom.js';
import { T } from './atlas.js';
import { makeRng, fbm2, noise2 } from './rng.js';
import {
  terrainHeight, DANUBE, DANUBE_HALFWIDTH, BLAU, BLAU_ARM, BLAU_HALFWIDTH,
  polyDistance, insideWall, wallDistance, WATER_Y,
} from './plan.js';

// Graded grid: fine near the town, coarse towards the horizon.
function axis(limit, near, step0, growth) {
  const out = [0];
  let v = 0, s = step0;
  while (v < limit) { v += s; out.push(v); if (v > near) s *= growth; }
  const neg = out.slice(1).map((a) => -a).reverse();
  return neg.concat(out);
}

// Which crop or cover a patch of ground carries. Medieval Ulm's fields were
// worked in long strips (Gewanne) grouped into blocks that shared a direction
// and a place in the three-field rotation: winter corn, spring corn, fallow.
function coverOf(x, z, h, rng) {
  const d = wallDistance(x, z);
  const inside = insideWall(x, z);
  if (inside) {
    // trodden earth between the houses, with yards and kitchen gardens in the
    // gaps -- a medieval town was not paved from wall to wall
    const g = fbm2(x / 70, z / 70, 3, 53);
    if (g > 0.62) return { tile: T.MEADOW, col: [0.86, 0.92, 0.78] };
    if (g < 0.36) return { tile: T.COBBLE, col: [0.96, 0.94, 0.9] };
    return { tile: T.DIRT, col: [0.97, 0.94, 0.88] };
  }

  const dRiver = polyDistance(DANUBE, x, z).d;
  const dBlau = polyDistance(BLAU, x, z).d;

  if (dRiver < 95 || dBlau < 34) {                       // water meadows and reeds
    return { tile: rng() < 0.4 ? T.REED : T.MEADOW, col: [0.95, 1.0, 0.86] };
  }
  if (d < 46) return { tile: T.MEADOW, col: [0.92, 0.98, 0.84] };   // the ditch and its glacis
  if (d < 130) return { tile: rng() < 0.55 ? T.ORCHARD : T.MEADOW, col: [0.95, 1.0, 0.9] };

  const slope = slopeAt(x, z);
  if (h > 46 && slope > 0.12) {
    // wooded slopes above the town
    return { tile: T.FOLIAGE, col: [0.62, 0.72, 0.5], forest: true };
  }
  // south-facing slopes on the hill flanks carry vines
  if (h > 24 && h < 66 && slope > 0.07 && facingSouth(x, z) && noise2(x / 300, z / 300, 91) > 0.55) {
    return { tile: T.VINEYARD, col: [1, 1, 0.95] };
  }

  // arable: pick a block direction, then stripe it. The blocks are large and
  // their directions few, as real Gewanne are -- otherwise the pattern breaks
  // up into noise as soon as the camera gains height.
  const blockId = Math.floor(fbm2(x / 1600, z / 1600, 2, 17) * 5);
  const ang = blockId * 0.55 + 0.25;
  const u = x * Math.cos(ang) + z * Math.sin(ang);
  const strip = Math.floor(u / (26 + (blockId % 3) * 11));
  const phase = ((strip % 3) + 3) % 3;
  const wear = 0.94 + noise2(strip * 1.7, blockId * 3.1, 5) * 0.14;
  // not everything is arable: common pasture, scrub and hedged closes break
  // the pattern up
  const use = fbm2(x / 420, z / 420, 3, 37);
  if (use > 0.66) return { tile: T.MEADOW, col: [wear * 0.9, wear * 1.02, wear * 0.8] };
  if (use < 0.30) return { tile: T.ORCHARD, col: [wear * 0.92, wear, wear * 0.84] };
  if (phase === 0) return { tile: T.WHEAT, col: [wear, wear * 0.98, wear * 0.86] };
  if (phase === 1) return { tile: T.PLOUGH, col: [wear, wear * 0.95, wear * 0.9] };
  return { tile: T.MEADOW, col: [wear * 0.95, wear, wear * 0.86] };
}

function slopeAt(x, z) {
  const e = 26;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}
function facingSouth(x, z) {
  const e = 26;
  return terrainHeight(x, z + e) < terrainHeight(x, z - e) - 0.6;
}

export function buildTerrain(THREE, texture) {
  const b = new Builder();
  const rng = makeRng(4711);
  const xs = axis(4200, 900, 13, 1.055);
  const zs = axis(4200, 900, 13, 1.055);
  const H = new Map();
  const h = (x, z) => {
    const k = x + ':' + z;
    let v = H.get(k);
    if (v === undefined) { v = terrainHeight(x, z); H.set(k, v); }
    return v;
  };
  const forestSpots = [];

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const y00 = h(x0, z0), y10 = h(x1, z0), y11 = h(x1, z1), y01 = h(x0, z1);
      const cover = coverOf(cx, cz, (y00 + y11) / 2, rng);
      const size = Math.max(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.min(6, Math.round(size / 24)));
      b.quad(
        [x0, y01, z1], [x1, y11, z1], [x1, y10, z0], [x0, y00, z0],
        cover.tile, jitter(cover.col, rng, 0.022), n, n,
      );
      if (cover.forest && size < 200 && rng() < 0.55) forestSpots.push([cx, cz, (y00 + y11) / 2, size]);
    }
  }

  // Woodland: lumpy canopy shells rather than individual trunks, which reads
  // correctly from the air and costs a fraction of the triangles.
  const canopy = new Builder();
  for (const [x, z, y, size] of forestSpots) {
    const n = Math.max(1, Math.round(size / 34));
    for (let k = 0; k < n; k++) {
      const px = x + (rng() - 0.5) * size, pz = z + (rng() - 0.5) * size;
      const py = terrainHeight(px, pz);
      const r = 9 + rng() * 11, hh = 9 + rng() * 9;
      const col = [0.55 + rng() * 0.2, 0.68 + rng() * 0.18, 0.42 + rng() * 0.14];
      canopy.prism(px, py + hh * 0.35, pz, r, hh * 0.35, 5, rng() * 6, { side: T.FOLIAGE, top: T.FOLIAGE }, col, 0, false);
      canopy.spire(px, py + hh * 0.7, pz, r * 1.02, hh * 0.6, 5, rng() * 6, T.FOLIAGE, col);
      canopy.spire(px, py + hh * 0.35, pz, r * 1.02, -hh * 0.42, 5, rng() * 6, T.FOLIAGE, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]);
    }
  }
  b.merge(canopy);

  // beyond the modelled ground, a plain ring that carries the eye to the
  // horizon instead of ending in a visible edge
  const far = new Builder();
  const R0 = 4100, R1 = 16000;
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
    const h0 = 34 + fbm2(Math.cos(a0) * 3, Math.sin(a0) * 3, 3, 71) * 90;
    const h1 = 34 + fbm2(Math.cos(a1) * 3, Math.sin(a1) * 3, 3, 71) * 90;
    far.quad(
      [Math.cos(a0) * R0, 18, Math.sin(a0) * R0], [Math.cos(a1) * R0, 18, Math.sin(a1) * R0],
      [Math.cos(a1) * R1, h1, Math.sin(a1) * R1], [Math.cos(a0) * R1, h0, Math.sin(a0) * R1],
      T.MEADOW, [0.78, 0.82, 0.68], 2, 6,
    );
  }
  b.merge(far);

  const geo = b.build(THREE);
  const mat = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

// ------------------------------------------------------------------ water ---
function waterTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const rng = makeRng(99);
  ctx.fillStyle = '#7b8f86'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const x = rng() * 256, y = rng() * 256, w = 6 + rng() * 44;
    ctx.fillStyle = `rgba(${190 + rng() * 60 | 0},${215 + rng() * 40 | 0},${210 + rng() * 40 | 0},${0.04 + rng() * 0.10})`;
    ctx.fillRect(x, y, w, 1 + rng() * 1.6);
    if (rng() < 0.25) ctx.fillRect(x, y + 3, w * 0.5, 1);
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(20,40,34,${0.03 + rng() * 0.07})`;
    ctx.fillRect(rng() * 256, rng() * 256, 10 + rng() * 60, 2 + rng() * 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function riverGeometry(THREE, pts, halfwidths, uvRepeat) {
  const pos = [], nrm = [], uv = [], col = [];
  let run = 0;
  const hwAt = (i) => (typeof halfwidths === 'number' ? halfwidths : halfwidths[Math.min(i, halfwidths.length - 1)]);
  const sides = pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0], dz = next[1] - prev[1];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L, hw = hwAt(i);
    return [[p[0] - nx * hw, p[1] - nz * hw], [p[0] + nx * hw, p[1] + nz * hw]];
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const [L0, R0] = sides[i], [L1, R1] = sides[i + 1];
    const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const v0 = run / uvRepeat, v1 = (run + seg) / uvRepeat;
    run += seg;
    const quad = [
      [L0[0], WATER_Y, L0[1], 0, v0], [R0[0], WATER_Y, R0[1], 1, v0],
      [R1[0], WATER_Y, R1[1], 1, v1], [L1[0], WATER_Y, L1[1], 0, v1],
    ];
    for (const [a, bb, c] of [[0, 1, 2], [0, 2, 3]]) {
      for (const k of [a, bb, c]) {
        const q = quad[k];
        pos.push(q[0], q[1], q[2]); nrm.push(0, 1, 0); uv.push(q[3], q[4]); col.push(1, 1, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export function buildWater(THREE) {
  const tex = waterTexture(THREE);
  const mat = new THREE.MeshPhongMaterial({
    map: tex, color: 0xc6d8d2, specular: 0x9fb4ae, shininess: 54,
    transparent: true, opacity: 0.94, vertexColors: true,
  });
  const group = new THREE.Group();
  const danube = new THREE.Mesh(riverGeometry(THREE, DANUBE, DANUBE_HALFWIDTH, 90), mat);
  danube.renderOrder = 1;
  group.add(danube);
  for (const arm of [BLAU, BLAU_ARM]) {
    const m = new THREE.Mesh(riverGeometry(THREE, arm, BLAU_HALFWIDTH, 26), mat);
    m.position.y = 1.2;    // the Blau runs a little above the Danube's level
    m.renderOrder = 1;
    group.add(m);
  }
  group.name = 'water';
  group.userData.texture = tex;
  return group;
}
