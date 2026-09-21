// monuments.js — the great buildings, and the state each of them is in.
//
// THE CATHEDRAL, Saint-Pierre-et-Saint-Paul, in July 1250
//   The old cathedral burned in the fire of 1188. Bishop Garnier de Trainel
//   began the new Gothic choir about 1200, working from the radiating chapels
//   on the north side of the ambulatory. In November 1228 a cyclone threw down
//   the upper works and the lower part of the choir's south aisle. The upper
//   walls went back up between 1235 and 1240, and the rebuilders took the
//   chance to glaze the triforium — an idea barely tried before, at Saint-Denis.
//   The transept was not vaulted until about 1310. The nave is 14th-15th c.
//
//   So on this morning: a finished, ten-year-old chevet and choir, its glass
//   still bright; a transept whose walls are up but open to the sky, with the
//   masons' crane standing over the crossing; and, west of that, the patched
//   older nave still roofed and still in use, because the chapter has to sing
//   the office somewhere. A temporary wall closes the new work off from the old.
//   That west end is the least certain thing in this reconstruction.

import { Mesher, shade, mix } from './geom.js';
import { C } from './palette.js';
import { LANDMARKS, GRID } from './survey.js';
import { groundHeight, tree } from './land.js';

const S = Math.sin, Cs = Math.cos;

/** Local-to-world for a monument placed at p with yaw rot. */
function frame(p, rot) {
  const c = Cs(rot), s = S(rot);
  return (along, across) => ({ x: p.x + along * c - across * s, z: p.z + along * s + across * c });
}

// ---------------------------------------------------------------------------
// A generic church: nave, aisles, apse, roof, tower. Serves the parish churches
// and, with bigger numbers, the abbeys.
// ---------------------------------------------------------------------------
function church(m, p, rot, o) {
  const F = frame(p, rot);
  const y = groundHeight(p.x, p.z);
  const {
    length, width, height, aisle = 0, aisleH = 0,
    tower = 0, towerAt = 'west', spire = 0, apse = true,
    stone = C.stone, roofCol = C.tileOld, clerestory = false,
  } = o;

  const half = length / 2;

  // nave / choir vessel
  const cen = F(0, 0);
  m.box(cen.x, y, cen.z, length, width, height, rot, stone, { top: false, uvScale: 0.6 });
  m.gable(cen.x, y + height, cen.z, length, width, width * 0.95, rot, roofCol, shade(stone, 0.96), 0.5);

  // aisles
  if (aisle > 0) {
    for (const side of [-1, 1]) {
      const a = F(0, (width / 2 + aisle / 2) * side);
      m.box(a.x, y, a.z, length, aisle, aisleH, rot, shade(stone, 0.97), { top: false, uvScale: 0.6 });
      // lean-to roof
      const lo = F(-half, (width / 2 + aisle) * side);
      const hi = F(-half, (width / 2) * side);
      const lo2 = F(half, (width / 2 + aisle) * side);
      const hi2 = F(half, (width / 2) * side);
      m.quad([lo.x, y + aisleH, lo.z], [lo2.x, y + aisleH, lo2.z],
             [hi2.x, y + aisleH + aisle * 0.5, hi2.z], [hi.x, y + aisleH + aisle * 0.5, hi.z],
             roofCol, 1.4);
      // buttresses
      const n = Math.max(3, Math.round(length / 6));
      for (let i = 0; i <= n; i++) {
        const b = F(-half + (i / n) * length, (width / 2 + aisle + 0.5) * side);
        m.box(b.x, y, b.z, 1.2, 1.8, aisleH * 0.92, rot, shade(stone, 0.94), { uvScale: 1.5 });
      }
    }
  }

  // apse at the (liturgical) east end
  if (apse) {
    const sides = 5;
    const r = width / 2;
    const c0 = F(half, 0);
    for (let i = 0; i < sides; i++) {
      const a0 = -Math.PI / 2 + (i / sides) * Math.PI;
      const a1 = -Math.PI / 2 + ((i + 1) / sides) * Math.PI;
      const q0 = F(half + Cs(a0) * r, S(a0) * r);
      const q1 = F(half + Cs(a1) * r, S(a1) * r);
      m.quad([q0.x, y, q0.z], [q1.x, y, q1.z], [q1.x, y + height, q1.z], [q0.x, y + height, q0.z],
             stone, 0.6);
      // conical roof segment
      const apex = F(half - 1, 0);
      m.tri([q0.x, y + height, q0.z], [q1.x, y + height, q1.z], [apex.x, y + height + width * 0.85, apex.z], roofCol);
    }
  }

  // tower
  if (tower > 0) {
    const tw = width * 0.56;
    const tp = towerAt === 'west' ? F(-half - tw / 2 + 1, 0)
      : towerAt === 'crossing' ? F(0, 0)
      : F(-half + tw / 2, (width / 2 + (aisle || 0)) * -1);       // south-west angle
    const base = towerAt === 'crossing' ? y + height : y;
    m.box(tp.x, base, tp.z, tw, tw, tower, rot, shade(stone, 1.02), { top: false, uvScale: 0.8 });
    // belfry openings read as a darker band
    m.box(tp.x, base + tower - 2.6, tp.z, tw + 0.16, tw + 0.16, 2.0, rot, shade(stone, 0.62), { top: false, uvScale: 1.2 });
    if (spire > 0) {
      m.spire(tp.x, base + tower, tp.z, tw / 2, spire, rot, C.shingle, 4);
    } else {
      m.hip(tp.x, base + tower, tp.z, tw, tw, tw * 0.6, rot, C.shingle, 0.3);
    }
  }
  return y + height;
}

// ---------------------------------------------------------------------------
// A cloister: four ranges round a garth, with an arcaded walk.
// ---------------------------------------------------------------------------
function cloister(m, p, rot, size, rangeD, rangeH, stone, roofCol, rng) {
  const F = frame(p, rot);
  const y = groundHeight(p.x, p.z);
  const half = size / 2;
  for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = F(ax * (half + rangeD / 2), az * (half + rangeD / 2));
    const w = ax ? rangeD : size + rangeD * 2;
    const d = ax ? size + rangeD * 2 : rangeD;
    m.box(c.x, y, c.z, w, d, rangeH, rot, stone, { top: false, uvScale: 0.7 });
    m.gable(c.x, y + rangeH, c.z, Math.max(w, d), Math.min(w, d), Math.min(w, d) * 0.45,
            rot + (ax ? Math.PI / 2 : 0), roofCol, shade(stone, 0.96), 0.4);
  }
  // the garth
  const g = F(0, 0);
  m.poly([F(-half, -half), F(half, -half), F(half, half), F(-half, half)], y + 0.08, C.grass);
  if (rng) tree(m, g.x, y, g.z, 5 + rng() * 3, rng);
}

// ---------------------------------------------------------------------------
// THE CATHEDRAL
// ---------------------------------------------------------------------------
export function buildCathedral(m, rng) {
  const L = LANDMARKS.cathedral;
  const rot = L.rot;
  const F = frame(L.at, rot);
  const y = groundHeight(L.at.x, L.at.z);

  const {
    chevetLength, choirWidth, aisleWidth, transeptReach, transeptWidth,
    naveLength, naveWidth, vaultHeight, naveHeight, aisleHeight,
  } = L;

  const newStone = C.stoneNew;             // 10-50 years old, still pale
  const oldStone = shade(C.stoneOld, 0.94); // the 12th-century survivals
  const roofLead = C.lead;

  // ---- the finished choir, east of the crossing ------------------------
  const choirLen = chevetLength - 14;                       // straight bays
  const cc = F(choirLen / 2 + 2, 0);
  m.box(cc.x, y, cc.z, choirLen, choirWidth, vaultHeight, rot, newStone, { top: false, uvScale: 0.45 });
  // the glazed triforium and clerestory read as two darker bands
  for (const [h, t] of [[vaultHeight - 9.5, 2.6], [vaultHeight - 6.0, 5.0]]) {
    m.box(cc.x, y + h, cc.z, choirLen - 1.6, choirWidth + 0.2, t, rot, shade(C.slate, 1.25), { top: false, uvScale: 1.1 });
  }
  m.gable(cc.x, y + vaultHeight, cc.z, choirLen, choirWidth, choirWidth * 1.35, rot, roofLead, newStone, 0.6);

  // choir aisles + ambulatory
  for (const side of [-1, 1]) {
    const a = F(choirLen / 2 + 2, (choirWidth / 2 + aisleWidth / 2) * side);
    m.box(a.x, y, a.z, choirLen, aisleWidth, aisleHeight, rot, newStone, { top: false, uvScale: 0.5 });
    const p0 = F(2, (choirWidth / 2 + aisleWidth) * side);
    const p1 = F(choirLen + 2, (choirWidth / 2 + aisleWidth) * side);
    const p2 = F(choirLen + 2, (choirWidth / 2) * side);
    const p3 = F(2, (choirWidth / 2) * side);
    m.quad([p0.x, y + aisleHeight, p0.z], [p1.x, y + aisleHeight, p1.z],
           [p2.x, y + aisleHeight + 2.6, p2.z], [p3.x, y + aisleHeight + 2.6, p3.z], roofLead, 1.2);
  }

  // ---- the chevet: apse, ambulatory, radiating chapels -----------------
  const apseR = choirWidth / 2;
  const ambR = apseR + aisleWidth;
  const apex = F(choirLen + 2, 0);
  const sides = 7;
  for (let i = 0; i < sides; i++) {
    const a0 = -Math.PI / 2 + (i / sides) * Math.PI;
    const a1 = -Math.PI / 2 + ((i + 1) / sides) * Math.PI;
    const q0 = F(choirLen + 2 + Cs(a0) * apseR, S(a0) * apseR);
    const q1 = F(choirLen + 2 + Cs(a1) * apseR, S(a1) * apseR);
    m.quad([q0.x, y, q0.z], [q1.x, y, q1.z], [q1.x, y + vaultHeight, q1.z], [q0.x, y + vaultHeight, q0.z],
           newStone, 0.5);
    m.box((q0.x + q1.x) / 2, y + vaultHeight - 6, (q0.z + q1.z) / 2, 3.4, 0.4, 5.0, rot + a0,
          shade(C.slate, 1.3), { top: false, uvScale: 1.2 });
    m.tri([q0.x, y + vaultHeight, q0.z], [q1.x, y + vaultHeight, q1.z],
          [apex.x, y + vaultHeight + choirWidth * 1.15, apex.z], roofLead);

    // ambulatory bay
    const r0 = F(choirLen + 2 + Cs(a0) * ambR, S(a0) * ambR);
    const r1 = F(choirLen + 2 + Cs(a1) * ambR, S(a1) * ambR);
    m.quad([r0.x, y, r0.z], [r1.x, y, r1.z], [r1.x, y + aisleHeight, r1.z], [r0.x, y + aisleHeight, r0.z],
           newStone, 0.5);
    m.quad([r0.x, y + aisleHeight, r0.z], [r1.x, y + aisleHeight, r1.z],
           [q1.x, y + aisleHeight + 2.6, q1.z], [q0.x, y + aisleHeight + 2.6, q0.z], roofLead, 1.2);

    // radiating chapel — the north side went up first, so those are weathered
    // a shade more than the south
    const am = (a0 + a1) / 2;
    const chR = ambR + 5.5;
    const ch = F(choirLen + 2 + Cs(am) * chR, S(am) * chR);
    const north = S(am) < 0;
    m.prism(ch.x, y, ch.z, 4.6, 9.2, rot + am, north ? shade(newStone, 0.95) : newStone, 5);
    m.spire(ch.x, y + 9.2, ch.z, 4.6, 5.2, rot + am, roofLead, 5);
  }

  // flying buttresses over the choir aisles
  for (const side of [-1, 1]) {
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const along = 4 + (i / n) * (choirLen - 4);
      const pier = F(along, (choirWidth / 2 + aisleWidth + 2.2) * side);
      m.box(pier.x, y, pier.z, 3.1, 4.0, aisleHeight + 9.5, rot, newStone, { uvScale: 1.0 });
      m.box(pier.x, y + aisleHeight + 9.5, pier.z, 2.4, 3.0, 2.2, rot, newStone, { uvScale: 1.2 });
      m.spire(pier.x, y + aisleHeight + 11.7, pier.z, 1.5, 6.5, rot, newStone, 4);
      // the flyer itself
      const a = F(along, (choirWidth / 2 + 0.3) * side);
      for (const lift of [[7.5, 4.5], [13.0, 10.0]]) {
        m.quad(
          [a.x, y + vaultHeight - lift[0], a.z], [pier.x, y + aisleHeight + lift[1], pier.z],
          [pier.x, y + aisleHeight + lift[1] + 1.5, pier.z], [a.x, y + vaultHeight - lift[0] + 1.5, a.z],
          shade(newStone, 0.97), 1.0,
        );
      }
    }
  }

  // ---- the transept: walls up, no vault, open to the sky ---------------
  // The transept is not vaulted until about 1310. In 1250 it is a roofless
  // shell: walls part-risen, their ends left toothed so the next campaign can
  // bond into them, timber everywhere, and the chapter singing next door.
  const workH = 11.5;                     // how far the masonry has got
  for (const side of [-1, 1]) {
    const t = F(0, (transeptReach / 2) * side);
    m.box(t.x, y, t.z, transeptWidth, transeptReach, workH, rot, shade(C.chalk, 0.99), { top: false, uvScale: 0.5 });
    // the raw top course, lighter where it is freshly cut, and left toothed
    m.box(t.x, y + workH, t.z, transeptWidth + 0.3, transeptReach, 0.7, rot, C.chalk, { uvScale: 1.4 });
    for (let i = 0; i < 7; i++) {
      const tooth = F(-transeptWidth / 2 + 1.4 + i * 2.5, (transeptReach - 1) * side);
      m.box(tooth.x, y + workH + 0.7, tooth.z, 1.5, 1.2, 0.5 + (i % 3) * 0.45, rot, C.chalk, { uvScale: 1.6 });
    }
    // the end wall of the arm, lower still — this campaign has not reached it
    const end = F(0, transeptReach * side);
    m.box(end.x, y, end.z, transeptWidth + 0.6, 1.8, workH - 3.4, rot, shade(C.chalk, 0.98), { uvScale: 0.8 });
    // scaffolding: uprights, ledgers, and a lift of boards
    scaffold(m, F, rot, y, side, transeptReach, transeptWidth, workH, rng);
  }
  // the crossing piers, standing free and waiting
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const q = F(a * transeptWidth / 2, b * transeptWidth / 2);
    m.box(q.x, y, q.z, 3.0, 3.0, workH + 5.5, rot, C.chalk, { uvScale: 1.0 });
  }

  // ---- the cranes -------------------------------------------------------
  // The great treadwheel over the crossing, and a smaller one working the
  // north transept where the next lift of ashlar is going up.
  crane(m, F(0, 0), y + workH + 5.5, rot, rng, 1.7);
  crane(m, F(-3, -transeptReach * 0.78), y + workH + 0.7, rot + 1.9, rng, 0.85);
  crane(m, F(choirLen * 0.55, choirWidth / 2 + aisleWidth + 9), y, rot + 0.6, rng, 0.62);

  // a timber gantry and ramp up the side of the work
  for (let i = 0; i < 9; i++) {
    const g = F(-transeptWidth / 2 - 3.5, -transeptReach * 0.35 + i * 2.2);
    m.box(g.x, y, g.z, 2.6, 2.0, 1.1 + i * 1.15, rot, C.oakPale, { uvScale: 2 });
  }

  // ---- the old nave, west of the crossing, still in use -----------------
  const nc = F(-naveLength / 2 - transeptWidth / 2, 0);
  m.box(nc.x, y, nc.z, naveLength, naveWidth, naveHeight, rot, oldStone, { top: false, uvScale: 0.5 });
  m.gable(nc.x, y + naveHeight, nc.z, naveLength, naveWidth, naveWidth * 1.0, rot,
          mix(C.tileOld, C.tileNew, 0.55), oldStone, 0.6);
  for (const side of [-1, 1]) {
    const a = F(-naveLength / 2 - transeptWidth / 2, (naveWidth / 2 + 4.5) * side);
    m.box(a.x, y, a.z, naveLength, 9, 9.5, rot, oldStone, { top: false, uvScale: 0.5 });
    const p0 = F(-transeptWidth / 2, (naveWidth / 2 + 9) * side);
    const p1 = F(-naveLength - transeptWidth / 2, (naveWidth / 2 + 9) * side);
    const p2 = F(-naveLength - transeptWidth / 2, (naveWidth / 2) * side);
    const p3 = F(-transeptWidth / 2, (naveWidth / 2) * side);
    m.quad([p0.x, y + 9.5, p0.z], [p1.x, y + 9.5, p1.z],
           [p2.x, y + 12.5, p2.z], [p3.x, y + 12.5, p3.z], mix(C.tileOld, C.tileNew, 0.35), 1.2);
  }
  // the west front of the old nave, patched after the fire of 1188, with the
  // bell-cote that serves until there is a tower to hang the bells in
  const wf = F(-naveLength - transeptWidth / 2 - 1, 0);
  m.box(wf.x, y, wf.z, 3.0, naveWidth + 18, naveHeight + 3.5, rot, oldStone, { top: false, uvScale: 0.6 });
  const bc = F(-naveLength - transeptWidth / 2 - 1, 0);
  m.box(bc.x, y + naveHeight + 3.5, bc.z, 2.2, 6.0, 4.2, rot, oldStone, { uvScale: 1.0 });
  m.gable(bc.x, y + naveHeight + 7.7, bc.z, 6.0, 2.2, 2.2, rot + Math.PI / 2, C.shingle, oldStone, 0.3);

  // the temporary wall shutting the building site off from the choir
  const tw = F(transeptWidth / 2 + 1, 0);
  m.box(tw.x, y, tw.z, 1.2, choirWidth + aisleWidth * 2, 13.5, rot, shade(C.stoneOld, 0.88), { uvScale: 0.8 });

  // scaffolding still standing against the choir, where the glaziers are
  // finishing the clerestory
  for (let i = 0; i < 6; i++) {
    const p = F(6 + i * 6.5, -(choirWidth / 2 + aisleWidth + 3.2));
    m.box(p.x, y, p.z, 0.24, 0.24, vaultHeight + 2.5, rot, C.oakPale, { uvScale: 5 });
  }
  for (const lift of [10, 18, 26, vaultHeight + 1.5]) {
    const p = F(6 + 16, -(choirWidth / 2 + aisleWidth + 3.2));
    m.box(p.x, y + lift, p.z, 1.4, 36, 0.14, rot, C.oakPale, { uvScale: 1.5 });
  }

  // ---- the mason's yard ------------------------------------------------
  masonsYard(m, F, rot, y, rng);
}

/** Timber scaffolding against a rising wall. */
function scaffold(m, F, rot, y, side, reach, width, h, rng) {
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const along = -width / 2 - 1.6;
    const across = (2 + (i / n) * (reach - 2)) * side;
    const p = F(along, across);
    m.box(p.x, y, p.z, 0.24, 0.24, h + 7.5, rot, C.oakPale, { uvScale: 4 });
    const p2 = F(along + width + 3.2, across);
    m.box(p2.x, y, p2.z, 0.24, 0.24, h + 7.5, rot, C.oakPale, { uvScale: 4 });
  }
  // lifts of boards
  for (const lift of [h * 0.35, h * 0.68, h + 1.0, h + 5.4]) {
    for (const s2 of [-1, 1]) {
      const c = F(s2 * (width / 2 + 1.0), ((reach + 2) / 2) * side);
      m.box(c.x, y + lift, c.z, 1.5, reach, 0.14, rot, C.oakPale, { uvScale: 1.5 });
    }
  }
}

/** The masons' great wheel crane — a treadwheel, a jib and a stone on the hook. */
function crane(m, p, y, rot, rng, k = 1) {
  // pale, freshly worked oak, so the frame reads against the dark lead roof
  const C_oak = C.oakPale, C_oakDark = C.oak;
  const baseH = 2.4 * k;
  m.box(p.x, y, p.z, 5.6 * k, 4.2 * k, baseH, rot, C_oakDark, { uvScale: 1.5 });
  // the treadwheel: two rims, wide enough for a man to walk inside
  const R = 2.5 * k;
  for (const off of [-1.45 * k, 1.45 * k]) {
    const c = Cs(rot), s = S(rot);
    const wx = p.x - off * s, wz = p.z + off * c;
    m.prism(wx, y + baseH, wz, R, 0.24, rot, C_oak, 16);
    m.prism(wx, y + baseH + R * 1.94, wz, R, 0.24, rot, C_oak, 16);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      m.box(wx + Cs(a) * R * 0.95, y + baseH + R * 0.97 + S(a) * R * 0.95, wz,
            0.17, 0.17, 0.6 * k, rot, C_oak, { uvScale: 3 });
    }
  }
  // the mast, its stays, and the jib
  const mastH = 13.5 * k;
  m.box(p.x, y + baseH, p.z, 0.58 * k, 0.58 * k, mastH, rot, C_oakDark, { uvScale: 3 });
  const c = Cs(rot), s = S(rot);
  const reach = 11.5 * k;
  const tip = { x: p.x + reach * c, z: p.z + reach * s };
  m.quad(
    [p.x - 0.26 * s, y + baseH + mastH - 0.3, p.z + 0.26 * c],
    [tip.x - 0.26 * s, y + baseH + mastH * 0.52, tip.z + 0.26 * c],
    [tip.x + 0.26 * s, y + baseH + mastH * 0.50, tip.z - 0.26 * c],
    [p.x + 0.26 * s, y + baseH + mastH - 0.5, p.z - 0.26 * c],
    C_oakDark, 2,
  );
  for (const sgn of [-1, 1]) {
    const foot = { x: p.x - reach * 0.55 * c + sgn * 3.4 * k * s, z: p.z - reach * 0.55 * s - sgn * 3.4 * k * c };
    m.quad(
      [p.x, y + baseH + mastH - 1.0, p.z], [foot.x, y, foot.z],
      [foot.x + 0.14, y, foot.z + 0.14], [p.x + 0.14, y + baseH + mastH - 1.0, p.z + 0.14],
      C.oakPale, 3,
    );
  }
  // rope, hook, and the block of ashlar swinging below it
  const hook = y + baseH + mastH * 0.50;
  m.box(tip.x, hook - 11 * k, tip.z, 0.1, 0.1, 11 * k, rot, C.oakPale, { uvScale: 6 });
  m.box(tip.x, hook - 12.1 * k, tip.z, 1.7 * k, 1.15 * k, 1.0 * k, rot + 0.3, C.chalk, { uvScale: 1.5 });
}

/** Stone yard, lime pits, timber stacks and the masons' lodge. */
function masonsYard(m, F, rot, y, rng) {
  // the lodge — a long timber shed where the templates are cut
  const lodge = F(-18, 46);
  m.box(lodge.x, y, lodge.z, 22, 7.5, 3.4, rot, C.oakPale, { top: false, uvScale: 1.2 });
  m.gable(lodge.x, y + 3.4, lodge.z, 22, 7.5, 3.0, rot, C.shingle, C.oakPale, 0.6);

  // dressed blocks waiting, in rows
  for (let i = 0; i < 46; i++) {
    const p = F(-34 + (i % 12) * 3.1 + rng() * 0.6, 30 + Math.floor(i / 12) * 3.4 + rng() * 0.8);
    const hgt = 0.7 + rng() * 1.5;
    m.box(p.x, y, p.z, 1.3 + rng() * 0.5, 0.9 + rng() * 0.5, hgt, rot + rng() * 0.3, C.chalk, { uvScale: 1.6 });
  }
  // rough blocks, newly come up the Seine
  for (let i = 0; i < 18; i++) {
    const p = F(6 + rng() * 26, 40 + rng() * 14);
    m.box(p.x, y, p.z, 1.6 + rng(), 1.4 + rng(), 1.0 + rng() * 0.8, rot + rng() * 1.5, shade(C.stoneDark, 1.05), { uvScale: 1.4 });
  }
  // lime pits
  for (let i = 0; i < 3; i++) {
    const p = F(-44 + i * 9, 44 + rng() * 5);
    m.box(p.x, y - 0.3, p.z, 5.0, 4.2, 0.5, rot, shade(C.chalk, 1.02), { uvScale: 1.0 });
  }
  // timber for the centring, stacked
  for (let i = 0; i < 24; i++) {
    const p = F(-52 + (i % 6) * 1.0, 22 + Math.floor(i / 6) * 1.1);
    m.box(p.x, y + (i % 4) * 0.42, p.z, 0.4, 9.0, 0.4, rot + 0.04, C.oakPale, { uvScale: 2 });
  }
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------
export function buildMonuments(m, rng) {
  const L = LANDMARKS;

  // --- the Cite ---------------------------------------------------------
  // Saint-Loup: Benedictine abbey, south-east of the cathedral.
  church(m, L.saintLoup.at, L.saintLoup.rot, {
    length: L.saintLoup.church.l, width: L.saintLoup.church.w, height: L.saintLoup.church.h,
    aisle: 6, aisleH: 9, tower: 22, towerAt: 'crossing', stone: C.stoneOld, roofCol: C.tileOld,
  });
  cloister(m, { x: L.saintLoup.at.x + 30, z: L.saintLoup.at.z + 34 }, L.saintLoup.rot,
           L.saintLoup.cloister, 9, 8.5, C.stoneOld, C.tileOld, rng);

  // Saint-Nizier, on the site of a late-Roman oratory.
  church(m, L.saintNizier.at, L.saintNizier.rot, {
    length: L.saintNizier.l, width: L.saintNizier.w, height: L.saintNizier.h,
    aisle: 4.5, aisleH: 7, tower: L.saintNizier.tower, towerAt: 'west',
    stone: C.stoneOld, roofCol: C.tileOld,
  });

  // The canons' close, with the chapter's tithe cellar. The surviving Cellier
  // Saint-Pierre is dendro-dated to c.1256 — its predecessor stands here.
  {
    const p = L.canonsClose.at, rot = L.canonsClose.rot;
    const F = frame(p, rot), y = groundHeight(p.x, p.z);
    const cel = F(0, 0);
    m.box(cel.x, y, cel.z, 26, 11, 5.0, rot, C.stoneOld, { top: false, uvScale: 0.8 });
    m.gable(cel.x, y + 5.0, cel.z, 26, 11, 6.4, rot, C.tileOld, C.stoneOld, 0.6);
    for (let i = 0; i < 5; i++) {
      const h = F(-22 - i * 8, -14 + (i % 2) * 22);
      m.box(h.x, y, h.z, 7, 9, 6.2, rot + 0.1, mix(C.daubWhite, C.daubBuff, rng()), { top: false });
      m.gable(h.x, y + 6.2, h.z, 7, 9, 4.0, rot + 0.1, C.tileOld, C.daubWhite, 0.4);
    }
  }

  // The bishop's palace, on the cathedral's south flank.
  {
    const p = L.bishopsPalace.at, rot = L.bishopsPalace.rot;
    const y = groundHeight(p.x, p.z);
    m.box(p.x, y, p.z, L.bishopsPalace.w, L.bishopsPalace.d, L.bishopsPalace.h, rot, C.stone, { top: false, uvScale: 0.6 });
    m.gable(p.x, y + L.bishopsPalace.h, p.z, L.bishopsPalace.w, L.bishopsPalace.d, 8.5, rot, C.tileOld, C.stone, 0.6);
  }

  // --- the comital complex, Henri le Liberal's single programme of 1157 ---
  // Collegiate church of Saint-Etienne: 72 m long outside, with the count's
  // tribune at the west end opening from the palace next door.
  church(m, L.saintEtienne.at, L.saintEtienne.rot, {
    length: L.saintEtienne.length - 14, width: L.saintEtienne.width, height: L.saintEtienne.h,
    aisle: 7, aisleH: 10, tower: L.saintEtienne.towerH, towerAt: 'crossing', spire: 16,
    stone: C.stone, roofCol: C.lead,
  });
  // the count's tribune at the west end, reached from the palace next door
  {
    const F2 = frame(L.saintEtienne.at, L.saintEtienne.rot);
    const y2 = groundHeight(L.saintEtienne.at.x, L.saintEtienne.at.z);
    const tr = F2(-(L.saintEtienne.length - 14) / 2 - 5, 0);
    m.box(tr.x, y2, tr.z, 10, L.saintEtienne.width + 8, 14, L.saintEtienne.rot, C.stone, { top: false, uvScale: 0.7 });
    m.gable(tr.x, y2 + 14, tr.z, 10, L.saintEtienne.width + 8, 7, L.saintEtienne.rot + Math.PI / 2, C.lead, C.stone, 0.5);
    for (const sd2 of [-1, 1]) {
      const turret = F2(-(L.saintEtienne.length - 14) / 2 - 5, (L.saintEtienne.width / 2 + 4) * sd2);
      m.prism(turret.x, y2, turret.z, 2.4, 20, L.saintEtienne.rot, C.stone, 8);
      m.spire(turret.x, y2 + 20, turret.z, 2.5, 6.5, L.saintEtienne.rot, C.slate, 8);
    }
  }

  // The palace — the Aula — two storeys, its north wing against the collegiate.
  {
    const p = L.palace.at, rot = L.palace.rot;
    const F = frame(p, rot), y = groundHeight(p.x, p.z);
    m.box(p.x, y, p.z, L.palace.w, L.palace.d, L.palace.h, rot, C.stone, { top: false, uvScale: 0.5 });
    m.gable(p.x, y + L.palace.h, p.z, L.palace.w, L.palace.d, 9.5, rot, C.lead, C.stone, 0.6);
    // the great hall's buttresses and the stair turret
    for (let i = -2; i <= 2; i++) {
      const b = F(i * 11, L.palace.d / 2 + 0.8);
      m.box(b.x, y, b.z, 1.4, 1.8, L.palace.h * 0.85, rot, shade(C.stone, 0.95), { uvScale: 1.2 });
    }
    const t = F(-L.palace.w / 2 - 2.5, -L.palace.d / 2 - 2.5);
    m.prism(t.x, y, t.z, 3.0, L.palace.h + 6, rot, C.stone, 8);
    m.spire(t.x, y + L.palace.h + 6, t.z, 3.0, 6.5, rot, C.slate, 8);
    // and the south wing, toward the friars
    const s = F(-4, 26);
    m.box(s.x, y, s.z, 30, 12, 9, rot, C.stone, { top: false, uvScale: 0.6 });
    m.gable(s.x, y + 9, s.z, 30, 12, 6.5, rot, C.tileOld, C.stone, 0.5);
  }

  // Hotel-Dieu-le-Comte, founded by Henri I on ground next to his palace.
  {
    const p = L.hotelDieu.at, rot = L.hotelDieu.rot;
    const F = frame(p, rot), y = groundHeight(p.x, p.z);
    m.box(p.x, y, p.z, L.hotelDieu.w, L.hotelDieu.d, L.hotelDieu.h, rot, C.stoneOld, { top: false, uvScale: 0.6 });
    m.gable(p.x, y + L.hotelDieu.h, p.z, L.hotelDieu.w, L.hotelDieu.d, 9, rot, C.tileOld, C.stoneOld, 0.6);
    const ch = F(L.hotelDieu.w / 2 + 9, 2);
    church(m, ch, rot, { length: 18, width: 9, height: 9, tower: 0, stone: C.stoneOld, roofCol: C.tileOld });
  }

  // --- the Bourg ---------------------------------------------------------
  // Saint-Jean-au-Marche: the fair's own parish. Merchants rent logettes — small
  // lock-up booths "the size of half a stained-glass window" — off its walls.
  {
    const J = L.saintJean;
    church(m, J.at, J.rot, {
      length: J.l, width: J.w, height: J.h, aisle: 5.5, aisleH: 8.5,
      tower: J.tower, towerAt: 'angle', stone: C.stoneOld, roofCol: C.tileOld,
    });
    const F = frame(J.at, J.rot), y = groundHeight(J.at.x, J.at.z);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const p = F(-J.l / 2 + 3 + i * (J.l - 6) / 8, (J.w / 2 + 5.5 + 1.6) * side);
        m.box(p.x, y, p.z, 2.4, 3.0, 2.7, J.rot, mix(C.daubBuff, C.daubOchre, ((i * 7) % 5) / 5), { top: false });
        m.gable(p.x, y + 2.7, p.z, 2.4, 3.0, 1.1, J.rot + Math.PI / 2, C.tileOld, C.daubBuff, 0.25);
      }
    }
  }

  // Notre-Dame-aux-Nonnains: the Benedictine nunnery whose abbess outranks the
  // town, burnt in 1188 and rebuilt. Its precinct wall is a real boundary.
  {
    const N = L.nonnains;
    church(m, N.at, N.rot, {
      length: N.church.l, width: N.church.w, height: N.church.h,
      aisle: 6.5, aisleH: 10, tower: 26, towerAt: 'crossing',
      stone: C.stone, roofCol: C.tileOld,
    });
    cloister(m, { x: N.at.x + 12, z: N.at.z + 40 }, N.rot, N.cloister, 9.5, 9, C.stone, C.tileOld, rng);
  }

  // the parish churches of the Bourg
  const parish = [
    ['saintRemy', C.stoneOld, 0],
    ['saintFrobert', C.stoneOld, 0],
    ['sainteMadeleine', C.stone, 8],
    ['saintPantaleon', C.stoneOld, 0],
    ['saintNicolas', C.stoneOld, 6],
  ];
  for (const [key, stone, spire] of parish) {
    const P = L[key];
    church(m, P.at, P.rot, {
      length: P.l, width: P.w, height: P.h, aisle: 4.5, aisleH: 7,
      tower: P.tower, towerAt: 'west', spire, stone, roofCol: C.tileOld,
    });
  }

  // The cobbler's house whose son becomes Urban IV. In 1250 it is nothing at
  // all: a shop on a corner, twelve years from being pulled down for a basilica.
  {
    const p = L.cobblerPantaleon.at, rot = L.cobblerPantaleon.rot;
    const y = groundHeight(p.x, p.z);
    m.box(p.x, y, p.z, 6.0, 9.5, 5.4, rot, mix(C.daubWhite, C.daubBuff, 0.4), { top: false });
    m.gable(p.x, y + 5.4, p.z, 6.0, 9.5, 4.2, rot + Math.PI / 2, C.tileOld, C.daubWhite, 0.4);
  }
}

export { church, cloister, frame };
