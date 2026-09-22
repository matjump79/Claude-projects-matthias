// town.js — the houses.
//
// What a Troyes house looks like in 1250, and what it does NOT look like:
//
//  * The town burned on 23 July 1188, in the middle of the fair. Everything
//    here has been built since about 1195, so the fabric is young, regular and
//    mostly of one generation — not the accreted muddle of a 15th-century town.
//  * It is timber-framed: oak posts, rails and braces with wattle-and-daub
//    panels, limewashed. But the tall, richly carved, heavily jettied frames
//    that tourists photograph in Troyes today belong to the rebuilding after
//    the NEXT great fire, in 1524. These are lower — one or two storeys and an
//    attic — with a shallow jetty of a third of a metre or so, plain straight
//    braces, and no carving to speak of at this distance.
//  * Roofs are steep, 45-55 deg, gable to the street on the burgage plots.
//    Flat clay tile in the fair quarter and on the main streets; thatch and oak
//    shingle survive on the back lanes and against the wall.
//  * A handful of merchants build in stone, as their opposite numbers did at
//    Provins. Those are the deep, low, two-storey blocks with undercrofts.

import { Mesher, shade, mix, distToPolyline, inPolygon, shrink } from './geom.js';
import { C } from './palette.js';
import { STREETS, ENCEINTE, LANDMARKS, CITE, WATER, FAIR } from './survey.js';
import { groundHeight, tree, HAMLETS, waterDist } from './land.js';

// Areas no house may stand in: the monuments, their precincts, the fairground,
// the water, and the wall's clear lane behind the rampart.
function exclusions() {
  const E = [];
  const add = (x, z, r) => E.push({ x, z, r });
  add(LANDMARKS.cathedral.at.x + 5, LANDMARKS.cathedral.at.z + 6, 88);
  add(LANDMARKS.saintEtienne.at.x, LANDMARKS.saintEtienne.at.z, 62);
  add(LANDMARKS.palace.at.x, LANDMARKS.palace.at.z, 46);
  add(LANDMARKS.hotelDieu.at.x, LANDMARKS.hotelDieu.at.z, 40);
  add(LANDMARKS.saintLoup.at.x, LANDMARKS.saintLoup.at.z, 58);
  add(LANDMARKS.saintNizier.at.x, LANDMARKS.saintNizier.at.z, 30);
  add(LANDMARKS.canonsClose.at.x, LANDMARKS.canonsClose.at.z, 44);
  add(LANDMARKS.bishopsPalace.at.x, LANDMARKS.bishopsPalace.at.z, 36);
  add(LANDMARKS.nonnains.at.x, LANDMARKS.nonnains.at.z, 78);
  add(LANDMARKS.saintJean.at.x, LANDMARKS.saintJean.at.z, 40);
  for (const k of ['saintRemy', 'saintFrobert', 'sainteMadeleine', 'saintPantaleon', 'saintNicolas']) {
    add(LANDMARKS[k].at.x, LANDMARKS[k].at.z, 27);
  }
  // the fair's own pitches: these are open ground under stalls, not built on
  for (const f of FAIR.fields) add(f.at.x, f.at.z, Math.max(f.w, f.d) * 0.55);
  return E;
}

const EXCL = exclusions();
const blocked = (x, z) => EXCL.some((e) => Math.hypot(x - e.x, z - e.z) < e.r);

function nearWater(x, z, pad = 9) {
  for (const ch of WATER.channels) {
    const { d } = distToPolyline(x, z, ch.pts);
    if (d < ch.w / 2 + pad) return true;
  }
  return false;
}

/** A kitchen-garden bed: dug earth with the crop standing in drills. */
function bed(m, x, z, dir, rng) {
  const y = groundHeight(x, z) + 0.05;
  const rot = dir + (rng() - 0.5) * 0.4;
  const c = Math.cos(rot), s = Math.sin(rot);
  const w = 4.5 + rng() * 4, d = 3.5 + rng() * 3.5;
  const P = (lx, lz) => ({ x: x + lx * c - lz * s, z: z + lx * s + lz * c });
  m.poly([P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)],
         y, mix(C.gardenBed, C.mud, rng() * 0.4));
  // the drills — a few raised rows of green across the bed
  const rows = Math.max(2, Math.round(d / 0.75));
  for (let i = 0; i < rows; i++) {
    const lz = -d / 2 + (i + 0.5) * (d / rows);
    const p = P(0, lz);
    m.box(p.x, y, p.z, w * 0.9, 0.34, 0.20 + rng() * 0.18, rot,
          mix(C.gardenRow, C.treeLight, rng() * 0.6), { uvScale: 3 });
  }
}

/** Nearest named street: its distance, and its local direction. */
function nearestStreet(x, z) {
  let best = null, bestD = Infinity;
  for (const s of STREETS) {
    const { d } = distToPolyline(x, z, s.pts);
    if (d < bestD) { bestD = d; best = s; }
  }
  // direction of the closest segment
  let dir = 0, bd = Infinity;
  for (let i = 0; i < best.pts.length - 1; i++) {
    const a = best.pts[i], b = best.pts[i + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const d = Math.hypot(x - mx, z - mz);
    if (d < bd) { bd = d; dir = Math.atan2(b.z - a.z, b.x - a.x); }
  }
  return { street: best, d: bestD, dir };
}

/**
 * One house. `rot` is the ridge direction; the gable faces the street when
 * gableToStreet is true, which on a burgage plot is the normal case.
 */
function house(m, x, z, opts, rng) {
  const y = groundHeight(x, z);
  const w = opts.w, d = opts.d;
  const storeys = opts.storeys;
  const sh = opts.storeyH;
  const rot = opts.rot;

  const wallCol = opts.wall;
  const frameCol = opts.frame;

  let y0 = y;
  // ground floor — often a stone or cob sill wall, and in the fair quarter an
  // open shop front with its shutter let down to make a counter
  const sill = opts.stone ? sh : 0.7 + rng() * 0.4;
  m.box(x, y0, z, w, d, sill, rot, opts.stone ? opts.wall : shade(C.stoneOld, 0.92 + rng() * 0.1), { top: false });
  y0 += sill;

  const upper = storeys - (opts.stone ? 1 : 0);
  for (let s = 0; s < upper; s++) {
    // the jetty: each storey oversails the one below by a little
    const jet = opts.stone ? 0 : (s === 0 ? 0 : 0.28 + rng() * 0.22);
    const ww = w + jet * 2, dd = d + jet * 2;
    const h = sh * (s === 0 ? 1 : 0.92);
    m.box(x, y0, z, ww, dd, h, rot, wallCol, { top: false });

    if (!opts.stone) framing(m, x, y0, z, ww, dd, h, rot, frameCol, rng, opts.rich);
    y0 += h;
  }

  // the roof
  // The roof. Pitch varies a good deal — a thatched roof has to be steeper
  // than a tiled one to throw the water off — and perhaps one in six is hipped
  // rather than gabled, which is what stops a street reading as a row of
  // identical cardboard tents.
  const roofRot = opts.gableToStreet ? rot + Math.PI / 2 : rot;
  const rw = opts.gableToStreet ? d : w;
  const rd = opts.gableToStreet ? w : d;
  const pitch = (opts.thatched ? 0.72 : 0.50) + rng() * 0.26;
  const rise = rd * pitch;
  if (!opts.gableToStreet && rng() < 0.28) {
    m.hip(x, y0, z, rw, rd, rise, roofRot, opts.roof, 0.4);
  } else {
    m.gable(x, y0, z, rw, rd, rise, roofRot, opts.roof, wallCol, 0.4);
  }

  // Dormers and hoist lofts. The attic is working storage — grain, wool,
  // bales — so the bigger houses break the roof for a loading door.
  if (rd > 7 && rng() < (opts.rich ? 0.72 : 0.34)) {
    const n = 1 + (rd > 11 && rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const along = (n === 1 ? (rng() - 0.5) * rw * 0.5 : (i - 0.5) * rw * 0.42);
      const side = rng() < 0.5 ? -1 : 1;
      const c = Math.cos(roofRot), s = Math.sin(roofRot);
      const lz = side * rd * 0.26;
      const dx2 = x + along * c - lz * s, dz2 = z + along * s + lz * c;
      const dy = y0 + rise * 0.45;
      m.box(dx2, dy, dz2, 1.5, 1.4, 1.5, roofRot, wallCol, { top: false });
      m.gable(dx2, dy + 1.5, dz2, 1.5, 1.4, 0.9, roofRot + Math.PI / 2, opts.roof, wallCol, 0.18);
    }
  }

  // chimney or smoke louvre
  if (opts.chimney) {
    const cx = x + Math.cos(rot) * (rw * 0.3) * (rng() < 0.5 ? -1 : 1);
    const cz = z + Math.sin(rot) * (rw * 0.3) * (rng() < 0.5 ? -1 : 1);
    m.box(cx, y0 + rise * 0.5, cz, 0.78, 0.78, rise * 0.5 + 0.9, rot,
          mix(C.stoneOld, C.oakDark, 0.3 + rng() * 0.25), { uvScale: 2 });
  }

  // ---- the back of the plot ---------------------------------------------
  // A burgage plot is not one building. The street range is the front of an
  // L or a U: a rear wing runs back down the plot, and behind that stand the
  // stable, the workshop, the store and the privy, round a yard. That mass of
  // low outbuildings is most of what a town actually looked like from above.
  const c0 = Math.cos(rot), s0 = Math.sin(rot);
  const back = (along, across) => ({
    x: x + along * c0 - across * s0,
    z: z + along * s0 + across * c0,
  });

  if (rng() < (opts.rich ? 0.68 : 0.42)) {
    const wl = d * (0.5 + rng() * 0.55);
    const ww2 = w * (0.45 + rng() * 0.3);
    const p = back((w / 2 - ww2 / 2) * (rng() < 0.5 ? 1 : -1), d / 2 + wl / 2 - 0.4);
    const wy = groundHeight(p.x, p.z);
    const wh = sh * (opts.storeys > 2 ? 2 : 1) + 0.6;
    m.box(p.x, wy, p.z, ww2, wl, wh, rot, wallCol, { top: false });
    if (!opts.stone) framing(m, p.x, wy, p.z, ww2, wl, wh, rot, frameCol, rng, false);
    m.gable(p.x, wy + wh, p.z, wl, ww2, ww2 * (0.5 + rng() * 0.25), rot + Math.PI / 2,
            opts.roof, wallCol, 0.35);
  }

  const sheds = rng() < 0.5 ? 1 : rng() < 0.75 ? 2 : 0;
  for (let i = 0; i < sheds; i++) {
    const p = back((rng() - 0.5) * w * 1.5, d / 2 + 3 + rng() * d * 0.9);
    const sy = groundHeight(p.x, p.z);
    const sw = 2.2 + rng() * 2.6, sd = 2.0 + rng() * 2.4, shh = 1.9 + rng() * 1.1;
    const srot = rot + (rng() - 0.5) * 0.5;
    m.box(p.x, sy, p.z, sw, sd, shh, srot, mix(wallCol, C.oakPale, 0.35 + rng() * 0.3), { top: false });
    m.gable(p.x, sy + shh, p.z, Math.max(sw, sd), Math.min(sw, sd),
            Math.min(sw, sd) * (0.45 + rng() * 0.3), srot + (sw >= sd ? 0 : Math.PI / 2),
            rng() < 0.45 ? mix(C.thatch, C.thatchOld, rng()) : mix(C.shingle, C.tileOld, rng()),
            wallCol, 0.3);
  }
  return y0 + rise;
}

/** Posts, rails and braces on the two long faces — this is the half-timbering. */
function framing(m, x, y0, z, w, d, h, rot, col, rng, rich) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const T = 0.075;              // how far the timber stands proud of the daub
  const member = (lx, lz, ly, mw, mh, md, mrot) => {
    m.box(x + lx * c - lz * s, y0 + ly, z + lx * s + lz * c, mw, md, mh, mrot ?? rot,
          col, { top: false, uvScale: 3 });
  };

  // the two long faces (perpendicular to local Z)
  for (const face of [-1, 1]) {
    const lz = (d / 2 + T) * face;
    // sill and head rails
    member(0, lz, 0.02, w, 0.19, 0.12);
    member(0, lz, h - 0.21, w, 0.21, 0.12);
    // posts
    const bays = Math.max(2, Math.round(w / 1.25));
    for (let i = 0; i <= bays; i++) {
      const lx = -w / 2 + (i / bays) * w;
      member(lx, lz, 0.15, 0.155, h - 0.36, 0.11);
    }
    // straight braces, corner bays only — the plain 13th-century kind
    if (rich || rng() < 0.55) {
      for (const sgn of [-1, 1]) {
        const lx = sgn * (w / 2 - w / bays * 0.55);
        const bh = h * 0.56;
        const ang = Math.atan2(bh, w / bays) * sgn * -1;
        const len = Math.hypot(bh, w / bays);
        // a braced member, rotated in the plane of the wall: approximate with a
        // thin box yawed in plan is wrong, so build it as a tilted quad instead
        brace(m, x, y0, z, lx, lz, h, len, ang, rot, col, sgn);
      }
    }
  }
  // the short faces get posts only
  for (const face of [-1, 1]) {
    const lx = (w / 2 + T) * face;
    member(lx, 0, 0.02, 0.14, h, d, rot + Math.PI / 2);
  }
}

/** A diagonal brace, drawn as a thin tilted slab in the plane of the wall. */
function brace(m, x, y0, z, lx, lz, h, len, ang, rot, col, sgn) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = 0.15, T = 0.1;
  const dx = Math.cos(ang) * len * sgn, dy = Math.abs(Math.sin(ang) * len);
  const p = (ux, uy) => {
    const wx = x + (lx + ux) * c - lz * s;
    const wz = z + (lx + ux) * s + lz * c;
    return [wx, y0 + uy, wz];
  };
  const y1 = h * 0.14, y2 = y1 + dy;
  const A = p(0, y1), B = p(W * 1.1, y1), Cc = p(dx + W * 1.1, y2), D = p(dx, y2);
  m.quad(A, B, Cc, D, col, 2);
}

export function buildTown(rng) {
  const m = new Mesher();
  const gardens = new Mesher();
  let count = 0;

  const bourgIn = shrink(ENCEINTE.bourg, 16);
  const placed = [];

  const tooClose = (x, z, r) => {
    for (const p of placed) {
      if (Math.hypot(p.x - x, p.z - z) < r + p.r) return true;
    }
    return false;
  };

  /** Decide what kind of house belongs at this spot. */
  const spec = (x, z, dir, near) => {
    const tag = near.street.tag;
    const inCite = Math.abs(x - CITE.castrum.cx) < 240 && Math.abs(z - CITE.castrum.cz) < 240;
    const rich = tag === 'fair' || tag === 'money' || tag === 'main' || (tag === 'cite' && rng() < 0.4);
    const poor = tag === 'poor' || tag === 'alley' || tag === 'tanners';

    let storeys = 2;
    if (rich) storeys = rng() < 0.42 ? 3 : 2;
    if (poor) storeys = rng() < 0.5 ? 1 : 2;
    if (tag === 'close' || inCite) storeys = rng() < 0.3 ? 1 : 2;

    // roofing: tile where money and the count's fire rules reach, thatch behind
    // Roofing. Tile has the money and the count's fire rules behind it after
    // 1188, but it has by no means driven thatch and shingle out of the back
    // lanes yet, and a tile roof fifty years old is a long way from new-brick red.
    let roof, thatched;
    const tileChance = rich ? 0.88 : poor ? 0.26 : 0.60;
    if (rng() < tileChance) {
      const age = rng();
      roof = age < 0.18 ? mix(C.tileNew, C.tileOld, rng() * 0.6)
           : age < 0.44 ? mix(C.tileOld, C.tileBrown, rng())
           : age < 0.70 ? mix(C.tileBrown, C.tileGrey, rng())
           : age < 0.88 ? mix(C.tileOld, C.tileMossy, 0.4 + rng() * 0.5)
           : mix(C.tileDark, C.tileBrown, rng());
      if (rng() < 0.22) roof = mix(roof, C.tileGrey, 0.4);
      thatched = false;
    } else {
      const k = rng();
      roof = k < 0.42 ? mix(C.thatch, C.thatchOld, rng())
           : k < 0.58 ? mix(C.thatchOld, C.thatchGrey, rng())
           : k < 0.84 ? mix(C.shingle, C.thatchOld, rng() * 0.6)
           : mix(C.shingleGrey, C.slate, rng() * 0.5);
      thatched = k < 0.58;
    }

    const stone = rich && rng() < 0.11;
    const wallPick = rng();
    const wall = stone ? mix(C.stone, C.stoneOld, rng())
      : wallPick < 0.5 ? mix(C.daubWhite, C.daubBuff, rng())
      : wallPick < 0.78 ? mix(C.daubBuff, C.daubOchre, rng())
      : wallPick < 0.92 ? mix(C.daubGrey, C.daubWhite, rng())
      : mix(C.daubPink, C.daubBuff, rng());

    return {
      w: (rich ? 5.4 : poor ? 4.0 : 4.8) + rng() * (rich ? 3.4 : 2.2),
      d: (rich ? 11 : poor ? 7 : 9) + rng() * (rich ? 8 : 5),
      storeys,
      storeyH: (rich ? 2.85 : 2.5) + rng() * 0.45,
      rot: dir + Math.PI / 2 + (rng() - 0.5) * 0.10,
      gableToStreet: rng() < (poor ? 0.6 : 0.82),
      wall,
      frame: mix(C.oak, rng() < 0.5 ? C.oakPale : C.oakDark, rng()),
      roof,
      stone,
      rich,
      // A chimney stack is still a novelty in 1250 and a mark of money. Most
      // of these houses vent through a louvre or a gable hole, not a flue.
      chimney: rng() < (rich ? 0.30 : poor ? 0.03 : 0.11),
    };
  };

  // ---- 1. proper rows along every named street -------------------------
  for (const s of STREETS) {
    if (s.tag === 'bridge') continue;
    for (let i = 0; i < s.pts.length - 1; i++) {
      const a = s.pts[i], b = s.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = Math.atan2(b.z - a.z, b.x - a.x);
      const nx = -Math.sin(dir), nz = Math.cos(dir);
      for (const side of [-1, 1]) {
        let t = 1.5;
        while (t < L - 2) {
          const near = { street: s, dir };
          const px = a.x + Math.cos(dir) * t;
          const pz = a.z + Math.sin(dir) * t;
          const sp = spec(px, pz, dir, near);
          const off = (s.w / 2 + sp.d / 2 + 0.4) * side;
          const hx = px + nx * off, hz = pz + nz * off;
          t += sp.w + 0.25 + rng() * 0.6;
          if (blocked(hx, hz) || nearWater(hx, hz) || !inPolygon(hx, hz, bourgIn) && !inCiteArea(hx, hz)) continue;
          if (tooClose(hx, hz, sp.w * 0.45)) continue;
          sp.rot = dir + (side < 0 ? 0 : Math.PI);
          house(m, hx, hz, sp, rng);
          placed.push({ x: hx, z: hz, r: sp.w * 0.45 });
          count++;
        }
      }
    }
  }

  // ---- 2. fill the blocks behind the frontages -------------------------
  // A jittered lattice, oriented by the nearest street so back lanes run with
  // the grain of the quarter rather than against it.
  const fill = (poly, density, citeMode) => {
    const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const z0 = Math.min(...zs), z1 = Math.max(...zs);
    const g = density;
    for (let x = x0; x < x1; x += g) {
      for (let z = z0; z < z1; z += g) {
        const px = x + (rng() - 0.5) * g * 0.85;
        const pz = z + (rng() - 0.5) * g * 0.85;
        if (!inPolygon(px, pz, poly)) continue;
        if (blocked(px, pz) || nearWater(px, pz)) continue;
        const near = nearestStreet(px, pz);
        if (near.d < 7) continue;                       // that's the roadway
        // leave gardens and yards: a medieval town is not wall-to-wall
        const openness = citeMode ? 0.30 : Math.min(0.5, 0.1 + near.d / 120);
        if (rng() < openness) {
          // Not empty ground: a medieval town is full of working garden. Every
          // plot behind the street range carries beds of pot-herbs, leeks and
          // beans, a few fruit trees, and a vine up the south wall.
          const k = rng();
          if (k < 0.34) {
            // a standard tree in the yard — apple, pear, walnut, or a great elm
            tree(gardens, px, groundHeight(px, pz), pz, 7 + rng() * 8, rng);
            if (rng() < 0.35) {
              tree(gardens, px + (rng() - 0.5) * 7, groundHeight(px, pz), pz + (rng() - 0.5) * 7,
                   5 + rng() * 5, rng);
            }
          } else if (k < 0.78) {
            bed(gardens, px, pz, near.dir, rng);
          } else {
            const gy = groundHeight(px, pz) + 0.05;
            gardens.poly([
              { x: px - 4.5, z: pz - 3.5 }, { x: px + 4.5, z: pz - 3.5 },
              { x: px + 4.5, z: pz + 3.5 }, { x: px - 4.5, z: pz + 3.5 },
            ], gy, mix(C.grass, C.meadow, rng() * 0.7));
          }
          continue;
        }
        const sp = spec(px, pz, near.dir, near);
        if (tooClose(px, pz, sp.w * 0.5)) continue;
        house(m, px, pz, sp, rng);
        placed.push({ x: px, z: pz, r: sp.w * 0.5 });
        count++;
      }
    }
  };

  fill(bourgIn, 11.5, false);
  fill(citePolygon(), 10.0, true);

  // The comital quarter, between the Bourg's east wall and the Cite's west
  // curtain. This is the count's own ground — palace, collegiate church and
  // hospital stand on it — and the rest of it is garden, orchard and vineyard
  // belonging to the palace and the chapter, not open field.
  const comital = [
    { x: -330, z: -210 }, { x: -110, z: -210 },
    { x: -110, z: 320 }, { x: -336, z: 320 },
  ];
  fill(comital, 15.0, true);
  for (let i = 0; i < 210; i++) {
    const px = -330 + rng() * 215, pz = -205 + rng() * 520;
    if (blocked(px, pz) || nearWater(px, pz, 6)) continue;
    const k = rng();
    if (k < 0.46) {
      tree(gardens, px, groundHeight(px, pz), pz, 6 + rng() * 8, rng);
    } else if (k < 0.8) {
      bed(gardens, px, pz, 0.2, rng);
    } else {
      gardens.poly([
        { x: px - 5, z: pz - 4 }, { x: px + 5, z: pz - 4 },
        { x: px + 5, z: pz + 4 }, { x: px - 5, z: pz + 4 },
      ], groundHeight(px, pz) + 0.05, mix(C.vineyard, C.meadow, rng() * 0.5));
    }
  }

  // ---- 3. the faubourgs: ribbon development outside the gates ----------
  for (const g of ENCEINTE.gates) {
    if (!g.out) continue;
    const dir = Math.atan2(g.out.z - g.at.z, g.out.x - g.at.x);
    const nx = -Math.sin(dir), nz = Math.cos(dir);
    const L = Math.hypot(g.out.x - g.at.x, g.out.z - g.at.z);
    for (const side of [-1, 1]) {
      let t = 34;
      while (t < L * 0.85) {
        const px = g.at.x + Math.cos(dir) * t + nx * (6 + rng() * 4) * side;
        const pz = g.at.z + Math.sin(dir) * t + nz * (6 + rng() * 4) * side;
        t += 9 + rng() * 16;
        if (nearWater(px, pz) || inPolygon(px, pz, ENCEINTE.bourg)) continue;
        const sp = spec(px, pz, dir, { street: { tag: rng() < 0.4 ? 'poor' : 'burgess' }, dir });
        sp.rot = dir + (side < 0 ? 0 : Math.PI);
        sp.storeys = Math.min(2, sp.storeys);
        house(m, px, pz, sp, rng);
        count++;
      }
    }
  }

  // ---- 4. the villages of the banlieue -----------------------------------
  // Within an hour's walk of the gates the plain carries a ring of villages,
  // each a huddle of farms round a small church, with its own closes and
  // orchards. They are what stops the middle distance reading as empty board.
  for (const v of HAMLETS) {
    const dir0 = rng() * Math.PI;
    for (let i = 0; i < v.n; i++) {
      const a = rng() * Math.PI * 2;
      const e = Math.sqrt(rng()) * (26 + v.n * 1.9);
      const px = v.x + Math.cos(a) * e, pz = v.z + Math.sin(a) * e;
      if (waterDist(px, pz) < 8) continue;
      const sp = spec(px, pz, dir0 + (rng() - 0.5) * 0.9,
                      { street: { tag: rng() < 0.7 ? 'poor' : 'burgess' }, dir: dir0 });
      sp.storeys = rng() < 0.82 ? 1 : 2;
      sp.d *= 1.25;                      // farmsteads run deep: byre behind house
      sp.rich = false;
      sp.rot = dir0 + (rng() - 0.5) * 1.1;
      house(m, px, pz, sp, rng);
      count++;
      if (rng() < 0.5) {
        tree(gardens, px + (rng() - 0.5) * 22, groundHeight(px, pz), pz + (rng() - 0.5) * 22,
             7 + rng() * 9, rng);
      }
    }
    if (v.church) {
      const cy = groundHeight(v.x, v.z);
      const crot = dir0 * 0.2;
      m.box(v.x, cy, v.z, 17, 8, 7.5, crot, C.stoneOld, { top: false, uvScale: 0.8 });
      m.gable(v.x, cy + 7.5, v.z, 17, 8, 6.5, crot, C.tileOld, C.stoneOld, 0.5);
      const c2 = Math.cos(crot), s2 = Math.sin(crot);
      const tx = v.x - 9.5 * c2, tz = v.z - 9.5 * s2;
      m.box(tx, cy, tz, 5, 5, 13, crot, C.stoneOld, { top: false, uvScale: 1.0 });
      m.spire(tx, cy + 13, tz, 2.5, 8, crot, C.shingle, 4);
    }
    // the village's own trees
    for (let i = 0; i < v.n * 0.9; i++) {
      const a = rng() * Math.PI * 2, e = Math.sqrt(rng()) * (40 + v.n * 2.2);
      const tx = v.x + Math.cos(a) * e, tz = v.z + Math.sin(a) * e;
      tree(gardens, tx, groundHeight(tx, tz), tz, 6 + rng() * 9, rng);
    }
  }

  return { town: m, gardens, count };
}

function inCiteArea(x, z) {
  return inPolygon(x, z, citePolygon());
}

/** The walled Cite, as a polygon in world coordinates. */
export function citePolygon() {
  const { cx, cz, w, d, rot } = CITE.castrum;
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = w / 2 - 10, hd = d / 2 - 10;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => ({
    x: cx + lx * c - lz * s, z: cz + lx * s + lz * c,
  }));
}
