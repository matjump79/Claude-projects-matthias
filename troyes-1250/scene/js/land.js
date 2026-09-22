// land.js — the floor of the world: the Seine plain, the channels, the fields.
//
// Troyes sits on flat alluvium. There is no hill anywhere near it and no
// natural ground from which to look down on it; the plain barely moves through
// the whole frame. That flatness is the most important fact about the site and
// the reason the cathedral and the abbey towers carry the skyline alone.
//
// The town stands in the Champagne humide — wet meadow, willow and poplar along
// the water — with the open cereal country of the dry Champagne beyond. In late
// July the corn is standing ripe and the hay is already in.

import { Mesher, shade, mix, distToPolyline, inPolygon } from './geom.js';
import { C } from './palette.js';
import { WATER, ENCEINTE, STREETS } from './survey.js';

const EXT = 7200;                 // half-extent of the modelled plain, metres
export const WATER_Y = -0.25;     // the surface of every channel
const BED = -2.3;                 // the bottom of a cut channel

// ---------------------------------------------------------------------------
// The channels are cut into the plain, so the ground has to know where they
// run. Segments are flattened once, at module load, and queried per vertex.
// ---------------------------------------------------------------------------
const SEGS = [];
function addSegs(pts, halfWidth, depth) {
  for (let i = 0; i < pts.length - 1; i++) {
    SEGS.push({ a: pts[i], b: pts[i + 1], hw: halfWidth, depth });
  }
}
addSegs(WATER.seineIn.concat([WATER.split]), 15, 1.0);
for (const ch of WATER.channels) addSegs(ch.pts, ch.w / 2, 1.0);
addSegs(WATER.seineOut, 17, 1.0);

// the wet ditch outside the Bourg wall, set out 17 m from the curtain
export const DITCH = ENCEINTE.bourg.map((p, i, arr) => {
  const q = arr[(i + 1) % arr.length];
  const r = arr[(i - 1 + arr.length) % arr.length];
  const dx = q.x - r.x, dz = q.z - r.z;
  const L = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dz / L) * 17, z: p.z + (-dx / L) * 17 };
});
addSegs(DITCH.concat([DITCH[0]]), 11, 0.95);

/** Distance to the nearest watercourse edge, metres (0 inside the channel). */
export function waterDist(x, z) {
  let best = Infinity;
  for (const s of SEGS) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - s.a.x) * dx + (z - s.a.z) * dz) / L2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const d = Math.hypot(x - (s.a.x + dx * t), z - (s.a.z + dz * t)) - s.hw;
    if (d < best) best = d;
  }
  return Math.max(0, best);
}

function trench(x, z) {
  let cut = 0;
  for (const s of SEGS) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - s.a.x) * dx + (z - s.a.z) * dz) / L2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const d = Math.hypot(x - (s.a.x + dx * t), z - (s.a.z + dz * t));
    const outer = s.hw + 7;
    if (d > outer) continue;
    // flat bed inside the channel, banks sloping up over 7 m
    const k = d <= s.hw ? 1 : 1 - (d - s.hw) / 7;
    const smooth = k * k * (3 - 2 * k);
    cut = Math.max(cut, smooth * s.depth);
  }
  return cut;
}

/** Gentle alluvial swell — barely a metre over the whole plain. */
function baseHeight(x, z) {
  return 0.72
    + Math.sin(x * 0.00042 + 1.1) * 0.42
    + Math.cos(z * 0.00037 - 0.4) * 0.38
    + Math.sin((x + z) * 0.00091) * 0.20;
}

export function groundHeight(x, z) {
  const b = baseHeight(x, z);
  const cut = trench(x, z);
  return cut > 0 ? b + (BED - b) * cut : b;
}

// ---------------------------------------------------------------------------

/** The approach roads, published so the fair traffic can be put on them. */
export const export_roads = [];

export function buildLand(rng) {
  const m = new Mesher();
  const water = new Mesher();
  const foliage = new Mesher();

  // ---- the plain -------------------------------------------------------
  // Fine near the town where the eye goes, coarse out at the edges.
  const rings = [
    { from: 0, to: 1450, step: 13 },
    { from: 1450, to: 2450, step: 26 },
    { from: 2450, to: 4000, step: 78 },
    { from: 4000, to: EXT, step: 260 },
  ];

  // The open-field country is ploughed in long narrow lands gathered into
  // furlongs, and the direction turns from one furlong to the next. What the
  // eye picks up from the air is the furlong, not the individual land, so that
  // is what is drawn: coherent parcels with a headland between them, each under
  // one crop, rather than a per-pixel stripe that would only make moire.
  const hash = (i, j) => {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Late July in the Champagne: wheat and barley standing or just cut, the
  // three-field rota leaving a third in fallow, hay meadow along the water.
  const CROPS = [
    C.wheat, C.wheat,
    mix(C.wheat, C.grassDry, 0.45),
    mix(C.wheat, C.fallow, 0.22),
    C.grassDry,
    C.meadow, C.meadow,
    mix(C.meadow, C.grass, 0.5),
    C.fallow, C.fallow,
    mix(C.fallow, C.grassDry, 0.35),
    mix(C.grass, C.meadow, 0.4),
  ];

  const cellColour = (x, z) => {
    // The banks first: the Seine here runs in braided channels through wet
    // meadow, and that band of rank green is the most conspicuous thing in the
    // whole landscape after the town itself.
    const wd = waterDist(x, z);
    if (wd < 34) {
      const k = wd / 34;
      return mix(C.bank, mix(C.meadow, C.grass, 0.5), k * k);
    }

    const d = Math.hypot(x + 620, z + 60);

    // which furlong are we in, and which way does it run?
    const ri = Math.floor(x / 620), rj = Math.floor(z / 620);
    const ang = hash(ri, rj) * Math.PI;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const u = x * ca + z * sa, v = -x * sa + z * ca;

    const near = d < 560;
    const pw = near ? 46 : d < 1300 ? 78 : 104;      // across the lands
    const pl = near ? 64 : d < 1300 ? 150 : 215;     // along them
    const pi = Math.floor(u / pw), pj = Math.floor(v / pl);
    const h = hash(pi * 7 + ri * 101, pj * 13 + rj * 57);

    let col;
    if (near) {
      // the closes: gardens, hemp and flax plots, orchard, a little vineyard
      col = h < 0.10 ? mix(C.vineyard, C.grass, 0.2)
          : h < 0.44 ? mix(C.meadow, C.grass, 0.45)
          : h < 0.72 ? mix(C.grass, C.grassDry, 0.3)
          : h < 0.88 ? mix(C.meadow, C.vineyard, 0.35)
          : mix(C.fallow, C.grassDry, 0.4);
    } else {
      col = CROPS[Math.floor(h * CROPS.length) % CROPS.length];
    }

    // the headland: a strip of rough grass where the plough turned
    const fu = u / pw - Math.floor(u / pw);
    const fv = v / pl - Math.floor(v / pl);
    const edge = Math.min(fu, 1 - fu) * pw < 3.5 || Math.min(fv, 1 - fv) * pl < 4.5;
    if (edge) col = mix(col, C.grassDry, 0.42);

    // and the faint grain of the lands themselves within the furlong
    const ridge = 0.965 + 0.035 * Math.sin(u * (Math.PI * 2 / (near ? 7 : 11)));
    return shade(col, ridge);
  };

  for (const ring of rings) {
    const s = ring.step;
    for (let x = -ring.to; x < ring.to; x += s) {
      for (let z = -ring.to; z < ring.to; z += s) {
        // skip the middle of the coarse ring, the fine one covers it
        if (ring.from > 0 && Math.abs(x) < ring.from && Math.abs(z) < ring.from) continue;
        if (ring.from === 0 && (Math.abs(x) >= ring.to || Math.abs(z) >= ring.to)) continue;
        const x1 = x + s, z1 = z + s;
        const col = shade(cellColour(x + s / 2, z + s / 2), 0.94 + rng() * 0.12);
        m.quad(
          [x, groundHeight(x, z), z],
          [x1, groundHeight(x1, z), z],
          [x1, groundHeight(x1, z1), z1],
          [x, groundHeight(x, z1), z1],
          col, 0.09,
        );
      }
    }
  }

  // ---- the water surfaces ----------------------------------------------
  const allChannels = [
    { name: 'Seine amont', w: 26, pts: WATER.seineIn.concat([WATER.split]) },
    ...WATER.channels,
    { name: 'Seine aval', w: 30, pts: WATER.seineOut },
  ];
  for (const ch of allChannels) {
    water.ribbon(ch.pts, ch.w, WATER_Y, C.water, 0.05);
  }
  water.ribbon(DITCH.concat([DITCH[0]]), 20, WATER_Y - 0.1, mix(C.water, C.mudWet, 0.25), 0.04);

  // ---- willow, poplar and alder along every bank -------------------------
  for (const ch of allChannels) {
    for (let i = 0; i < ch.pts.length - 1; i++) {
      const a = ch.pts[i], b = ch.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.floor(L / 7);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
        for (const side of [-1, 1]) {
          if (rng() > 0.86) continue;
          const off = (ch.w / 2 + 4 + rng() * 16) * side;
          const tx = px + nx * off + (rng() - 0.5) * 12;
          const tz = pz + nz * off + (rng() - 0.5) * 12;
          if (inPolygon(tx, tz, ENCEINTE.bourg)) continue;
          tree(foliage, tx, groundHeight(tx, tz), tz, 8 + rng() * 11, rng, true);
        }
      }
    }
  }

  // ---- hedgerows, copses and orchards -----------------------------------
  // Trees in open-field country do not stand about singly: they mark the
  // headlands between furlongs, the edges of the closes, and the odd copse on
  // ground too wet or too poor to plough.
  const plant = (tx, tz, h) => {
    if (trench(tx, tz) > 0.05) return;
    if (inPolygon(tx, tz, ENCEINTE.bourg)) return;
    tree(foliage, tx, groundHeight(tx, tz), tz, h, rng);
  };

  // hedgerows: short lines of trees along a field boundary
  for (let i = 0; i < 280; i++) {
    const a = rng() * Math.PI * 2;
    const d = 560 + Math.sqrt(rng()) * 2600;
    const hx = -620 + Math.cos(a) * d, hz = -60 + Math.sin(a) * d;
    const dir = (Math.floor(hx / 260) % 7) * 0.4 + Math.PI / 2;
    const len = 60 + rng() * 170;
    const n = Math.round(len / 9);
    for (let k = 0; k < n; k++) {
      if (rng() < 0.22) continue;
      plant(hx + Math.cos(dir) * k * 9 + (rng() - 0.5) * 5,
            hz + Math.sin(dir) * k * 9 + (rng() - 0.5) * 5, 7 + rng() * 9);
    }
  }
  // copses
  for (let i = 0; i < 44; i++) {
    const a = rng() * Math.PI * 2;
    const d = 700 + Math.sqrt(rng()) * 2500;
    const cx = -620 + Math.cos(a) * d, cz = -60 + Math.sin(a) * d;
    const r = 25 + rng() * 55;
    for (let k = 0; k < r * 0.9; k++) {
      const b = rng() * Math.PI * 2, e = Math.sqrt(rng()) * r;
      plant(cx + Math.cos(b) * e, cz + Math.sin(b) * e, 10 + rng() * 10);
    }
  }
  // the orchard and garden belt in the close ring outside the gates
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2;
    const d = 330 + Math.sqrt(rng()) * 430;
    const ox = -620 + Math.cos(a) * d * 1.45, oz = -60 + Math.sin(a) * d;
    const rows = 3 + Math.floor(rng() * 4), per = 4 + Math.floor(rng() * 6);
    const dir = rng() * Math.PI;
    for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < per; c2++) {
      const lx = c2 * 7.5, lz = r2 * 7.5;
      plant(ox + lx * Math.cos(dir) - lz * Math.sin(dir),
            oz + lx * Math.sin(dir) + lz * Math.cos(dir), 6 + rng() * 3.5);
    }
  }

  // ---- the roads out ---------------------------------------------------
  // A medieval road is a worn track that wanders round the wet places, not a
  // ruled line, so each one is given a slow meander and run right out to the
  // edge of the modelled ground rather than stopping in the middle of a field.
  export_roads.length = 0;
  for (const g of ENCEINTE.gates) {
    if (!g.out) continue;
    const dx = g.out.x - g.at.x, dz = g.out.z - g.at.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    const nx = -uz, nz = ux;
    const reach = 3100;
    const pts = [];
    for (let t = 0; t <= reach; t += 95) {
      const wander = Math.sin(t * 0.0021 + g.at.x * 0.01) * 46 + Math.sin(t * 0.0057) * 18;
      pts.push({ x: g.at.x + ux * t + nx * wander, z: g.at.z + uz * t + nz * wander });
    }
    roadOnGround(m, pts, 5.6, mix(C.mud, C.grassDry, 0.3), rng);
    export_roads.push({ gate: g, pts });
  }

  // ---- trees along every road out ---------------------------------------
  for (const road of export_roads) {
    for (let i = 1; i < road.pts.length - 1; i++) {
      const a = road.pts[i], b = road.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      for (const side of [-1, 1]) {
        if (rng() > 0.42) continue;
        const off = (6 + rng() * 5) * side;
        const tx = a.x + nx * off + (rng() - 0.5) * 8;
        const tz = a.z + nz * off + (rng() - 0.5) * 8;
        if (inPolygon(tx, tz, ENCEINTE.bourg)) continue;
        tree(foliage, tx, groundHeight(tx, tz), tz, 7 + rng() * 8, rng);
      }
    }
  }

  return { land: m, water, foliage, hamlets: HAMLETS };
}

// ---------------------------------------------------------------------------
// The outlying settlements. Troyes did not stand alone in an empty plain: the
// villages of its banlieue ringed it within an hour's walk, each with its own
// church, and their roofs and steeples are what give the middle distance scale.
// Positions are indicative — these are the directions the villages lay in, not
// surveyed sites.
// ---------------------------------------------------------------------------
export const HAMLETS = [
  { name: 'Sainte-Savine',   x: -2250, z: 120,  n: 46, church: true },
  { name: 'Saint-Martin',    x: -1150, z: -980, n: 30, church: true },
  { name: 'Les Trevois',     x: -1050, z: 1180, n: 26, church: false },
  { name: 'Saint-Julien',    x: 420,   z: 1320, n: 34, church: true },
  { name: 'Pont-Sainte-Marie', x: 980, z: -1260, n: 30, church: true },
  { name: 'Croncels',        x: -820,  z: 1020, n: 20, church: false },
  { name: 'La Moline',       x: -1700, z: -620, n: 18, church: false },
  { name: 'Preize',          x: -640,  z: -1420, n: 22, church: false },
];

/** Lay a road down following the ground, one short length at a time. */
function roadOnGround(m, pts, width, col, rng) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.round(L / 22));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      dense.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  dense.push(pts[pts.length - 1]);
  for (let i = 0; i < dense.length - 1; i++) {
    const a = dense[i], b = dense[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * width / 2, nz = dx / L * width / 2;
    const ya = groundHeight(a.x, a.z) + 0.07, yb = groundHeight(b.x, b.z) + 0.07;
    m.quad(
      [a.x - nx, ya, a.z - nz], [b.x - nx, yb, b.z - nz],
      [b.x + nx, yb, b.z + nz], [a.x + nx, ya, a.z + nz],
      shade(col, 0.95 + rng() * 0.1), 0.25,
    );
  }
}

/** A tree.
 *
 * Deciduous, with a heavy rounded crown: oak, elm, ash and field maple on the
 * headlands and in the town gardens, willow and alder down on the wet ground.
 * Nothing here is conical. In particular there are no Lombardy poplars, however
 * much they say "France" today — Populus nigra 'Italica' does not reach western
 * Europe until the middle of the 18th century.
 *
 * Mature trees in an unmanaged medieval landscape are BIG — a standard oak in a
 * hedgerow runs to 18 or 20 m, half as tall again as the houses it stands over.
 * Drawing them at the height of a garden shrub is the single commonest way to
 * make a reconstruction look like a model village.
 */
export function tree(m, x, y, z, h, rng, riverside = false) {
  const trunkH = h * (riverside ? 0.22 : 0.30);
  const a = rng() * 6.3;
  m.prism(x, y, z, 0.24 + h * 0.028, trunkH * 1.2, a, C.oakDark, 5);

  const pick = rng();
  const col = riverside
    ? mix(C.willow, C.treeLight, rng() * 0.6)
    : pick < 0.30 ? mix(C.tree, C.treeDark, rng())
    : pick < 0.62 ? mix(C.tree, C.treeLight, rng())
    : pick < 0.85 ? mix(C.treeLight, C.treeOlive, rng())
    : mix(C.treeDark, C.treeOlive, rng());

  const r = h * (riverside ? 0.34 : 0.40);
  const crown = h - trunkH;
  // Three stacked drums of falling radius read as a round, heavy canopy; the
  // slight rotation between them breaks up the silhouette.
  m.prism(x, y + trunkH, z, r * 0.70, crown * 0.28, a, shade(col, 0.84), 8, 1.34);
  m.prism(x, y + trunkH + crown * 0.28, z, r, crown * 0.40, a + 0.4, col, 8, 0.96);
  m.prism(x, y + trunkH + crown * 0.68, z, r * 0.95, crown * 0.34, a + 0.8,
          shade(col, 1.08), 8, 0.30);
  // a second, offset lobe on the larger trees, so no two read alike
  if (h > 9 && rng() < 0.7) {
    const off = r * 0.5, oa = rng() * 6.3;
    m.prism(x + Math.cos(oa) * off, y + trunkH + crown * 0.34, z + Math.sin(oa) * off,
            r * 0.62, crown * 0.46, a + 1.2, shade(col, 0.94), 7, 0.55);
  }
}

/** A clump of trees round a point — how they actually grow. */
export function copse(m, x, z, radius, count, h0, h1, rng, ground, riverside = false) {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, e = Math.sqrt(rng()) * radius;
    const tx = x + Math.cos(a) * e, tz = z + Math.sin(a) * e;
    tree(m, tx, ground(tx, tz), tz, h0 + rng() * (h1 - h0), rng, riverside);
  }
}

/** The street surfaces inside the walls: beaten earth, the fair quarter paved. */
export function buildStreets(rng) {
  const m = new Mesher();
  for (const s of STREETS) {
    const paved = s.tag === 'fair' || s.tag === 'money' || s.tag === 'main' || s.tag === 'cite';
    const col = paved ? C.cobble : C.mud;
    // follow the ground: a single height for a whole street leaves it floating
    // at one end and buried at the other
    roadOnGround(m, s.pts, s.w, col, rng);
  }
  return m;
}

export { EXT, trench };
