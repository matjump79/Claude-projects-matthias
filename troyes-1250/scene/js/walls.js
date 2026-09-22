// walls.js — the circuit, the gates, the bridges and the mills.
//
// A warning about the walls, because this is the part of the reconstruction
// that is most often got wrong. The "champagne cork" outline that makes Troyes
// instantly recognisable from the air is NOT the 1250 circuit. The counts
// pushed the ramparts outward through the 12th and 13th centuries and the line
// only reached its greatest extent at the END of the 13th century — and the
// wall the 19th-century boulevards replaced was later still, rebuilt and
// re-rebuilt down to the 17th century, by then 5.2 km round with 21 gates.
//
// What is drawn here is the mid-century state: the late-antique castrum curtain
// still standing round the Cite, and a comital wall with a wet ditch round the
// Bourg, already roughly cork-shaped but tighter than the final line.

import { Mesher, shade, mix, distToPolyline } from './geom.js';
import { C } from './palette.js';
import { ENCEINTE, CITE, WATER, LANDMARKS } from './survey.js';
import { groundHeight } from './land.js';
import { citePolygon } from './town.js';

export function buildWalls(rng) {
  const m = new Mesher('stone');
  const water = new Mesher('water');

  // the curtain foot is buried a little so it never floats over the swell
  const baseY = () => -0.6;

  // ---- the Bourg circuit -----------------------------------------------
  const poly = ENCEINTE.bourg;
  const H = ENCEINTE.wallH;

  // The ditch itself is cut into the terrain and filled by land.js; here we
  // only build the masonry standing behind it.
  m.curtain(poly, 2.4, baseY(), H + 0.6, C.stoneOld, shade(C.stoneOld, 1.06));
  // crenellations
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.floor(L / 2.1);
    const dir = Math.atan2(b.z - a.z, b.x - a.x);
    for (let k = 0; k < n; k += 2) {
      const t = (k + 0.5) / n;
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      m.box(px, baseY() + H + 0.6, pz, 1.1, 2.6, 1.3, dir, shade(C.stoneOld, 1.02), { uvScale: 1.5 });
    }
  }

  // mural towers, open-backed and square, as they were before the round tower
  // became standard in this region
  let run = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = Math.atan2(b.z - a.z, b.x - a.x);
    const nx = -Math.sin(dir), nz = Math.cos(dir);
    let t = ENCEINTE.bourgTowerEvery - (run % ENCEINTE.bourgTowerEvery);
    while (t < L) {
      const px = a.x + Math.cos(dir) * t - nx * 2.4;
      const pz = a.z + Math.sin(dir) * t - nz * 2.4;
      const gate = ENCEINTE.gates.some((g) => Math.hypot(g.at.x - px, g.at.z - pz) < 26);
      if (!gate) {
        m.box(px, baseY(), pz, 6.2, 6.8, ENCEINTE.towerH, dir, C.stoneOld, { top: false, uvScale: 0.8 });
        m.box(px, baseY() + ENCEINTE.towerH, pz, 7.0, 7.6, 1.2, dir, shade(C.stoneOld, 1.05), { uvScale: 1.2 });
        m.hip(px, baseY() + ENCEINTE.towerH + 1.2, pz, 6.6, 7.2, 4.6, dir, C.shingle, 0.4);
      }
      t += ENCEINTE.bourgTowerEvery;
    }
    run += L;
  }

  // ---- the gates --------------------------------------------------------
  for (const g of ENCEINTE.gates) {
    const dir = g.out
      ? Math.atan2(g.out.z - g.at.z, g.out.x - g.at.x)
      : 0;
    gatehouse(m, g.at.x, g.at.z, dir, baseY(), g.name.includes('Comtale'));
    // the bridge over the ditch
    if (g.out) {
      for (let k = 0; k < 4; k++) {
        const t = 7 + k * 6;
        const bx = g.at.x + Math.cos(dir) * t, bz = g.at.z + Math.sin(dir) * t;
        m.box(bx, 0.55, bz, 6.5, 6.2, 0.55, dir, C.oakPale, { uvScale: 1.2 });
      }
    }
  }

  // ---- the castrum curtain round the Cite -------------------------------
  // Late-antique work of c.380, built of re-used Roman stone because there is
  // no building stone worth the name in this country. By 1250 it is old,
  // patched, and has houses leaning on it inside and out.
  const cite = citePolygon();
  m.curtain(cite, 3.2, baseY(), 9.5, mix(C.stoneDark, C.stoneOld, 0.5), shade(C.stoneOld, 1.0));
  for (let i = 0; i < cite.length; i++) {
    const a = cite[i], b = cite[(i + 1) % cite.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const dir = Math.atan2(b.z - a.z, b.x - a.x);
    const n = Math.max(2, Math.round(L / 58));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      m.prism(px, baseY(), pz, 3.6, 12.5, dir, mix(C.stoneDark, C.stoneOld, 0.4), 8);
      m.spire(px, baseY() + 12.5, pz, 3.8, 4.0, dir, C.shingle, 8);
    }
  }

  // ---- the bridges over the channels -------------------------------------
  // The Pons Aulae, the count's own bridge from the palace into the Bourg.
  {
    const p = LANDMARKS.ponsAulae.at;
    m.box(p.x, 0.45, p.z, LANDMARKS.ponsAulae.span, 7.5, 0.8, LANDMARKS.ponsAulae.rot, C.stoneOld, { uvScale: 1.0 });
    for (const side of [-1, 1]) {
      m.box(p.x, 1.25, p.z + side * 3.6, LANDMARKS.ponsAulae.span, 0.5, 1.0, LANDMARKS.ponsAulae.rot, C.stoneOld, { uvScale: 1.5 });
    }
    for (let i = -1; i <= 1; i++) {
      m.box(p.x + i * 11, -2.1, p.z, 2.0, 8.5, 2.6, LANDMARKS.ponsAulae.rot, C.stoneDark, { uvScale: 1.2 });
    }
  }

  // ---- the mills ---------------------------------------------------------
  // Water mills sit on the rus from the 12th century, driving the fulling
  // stocks of the drapers and the tanners' bark mills as well as grinding corn.
  // The Jaillard mill on its own canal is attested in 1152.
  for (const ch of WATER.channels) {
    if (!ch.mills) continue;
    for (let k = 0; k < ch.mills; k++) {
      const t = (k + 1) / (ch.mills + 1);
      const idx = Math.min(ch.pts.length - 2, Math.floor(t * (ch.pts.length - 1)));
      const a = ch.pts[idx], b = ch.pts[idx + 1];
      const f = (t * (ch.pts.length - 1)) - idx;
      const px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f;
      const dir = Math.atan2(b.z - a.z, b.x - a.x);
      mill(m, px, pz, dir, ch.w, rng);
    }
  }

  return { walls: m, water };
}

function gatehouse(m, x, z, dir, y, small) {
  const w = small ? 9 : 11;
  const h = small ? 13 : 16;
  m.box(x, y, z, 7, w, h, dir, C.stoneOld, { top: false, uvScale: 0.7 });
  // the two flanking drums
  for (const side of [-1, 1]) {
    const px = x - Math.sin(dir) * (w / 2 + 1.4) * side;
    const pz = z + Math.cos(dir) * (w / 2 + 1.4) * side;
    m.prism(px, y, pz, 3.4, h + 2.5, dir, C.stoneOld, 10);
    m.spire(px, y + h + 2.5, pz, 3.6, 6.0, dir, C.shingle, 10);
  }
  // the arch, as a dark recess
  m.box(x, y, z, 7.6, 4.0, 5.2, dir, shade(C.stoneDark, 0.5), { top: false, uvScale: 1.0 });
  m.box(x, y + h, z, 8.2, w + 1.0, 1.2, dir, shade(C.stoneOld, 1.05), { uvScale: 1.2 });
  m.hip(x, y + h + 1.2, z, 7.6, w, 5.5, dir, C.shingle, 0.4);
}

function mill(m, x, z, dir, chW, rng) {
  m.channel('main');
  const nx = -Math.sin(dir), nz = Math.cos(dir);
  const off = chW / 2 + 4.5;
  const px = x + nx * off, pz = z + nz * off;
  const y = groundHeight(px, pz);
  m.box(px, y, pz, 9, 7, 5.0, dir, mix(C.daubBuff, C.daubOchre, rng()), { top: false });
  m.gable(px, y + 5.0, pz, 9, 7, 4.2, dir, rng() < 0.6 ? C.tileOld : C.thatch, C.daubBuff, 0.5);
  // the wheel, standing in the race
  const wx = x + nx * (chW / 2 - 0.5), wz = z + nz * (chW / 2 - 0.5);
  m.prism(wx, y + 0.4, wz, 2.2, 0.5, dir + Math.PI / 2, C.oakDark, 12);
  m.channel('stone');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    m.box(wx + Math.cos(a) * 1.9 * nx, y + 0.4 + Math.sin(a) * 1.9, wz + Math.cos(a) * 1.9 * nz,
          0.12, 0.9, 0.5, dir, C.oak, { uvScale: 3 });
  }
}
