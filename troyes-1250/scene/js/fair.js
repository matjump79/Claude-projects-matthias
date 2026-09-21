// fair.js — the Hot Fair of Saint-Jean, open since 24 June.
//
// Six great fairs ran through the year in the county: two at Provins, one at
// Lagny, one at Bar-sur-Aube, and the two big ones here — the "hot" fair of
// Saint-Jean opening 24 June and the "cold" fair of Saint-Remi on 1 October.
// They are held on the ground of the parish of Saint-Jean-au-Marche, spilling
// into every street and square around it, each pitch given over to one trade:
// drapery, mercery, old clothes, poultry, grain, salt, furs, spices.
//
// The counts supply the plant — halls, scales, weights and measures, all
// closely policed — and the Conduit des Foires, the safe-conduct that protects
// a merchant and his goods on the road even outside Champagne. The money is
// handled by changeurs, mostly Italians acting for the great houses at home,
// on the benches up the Montee des Changes. What actually changes hands: cloth
// and wool and furs from Flanders and the north, going against silk and spices
// and alum out of the Levant by way of Genoa and Venice.
//
// By 1250 this is the clearing house of European trade, and it is at its peak.
// Within two generations it will be gone, killed by the sea route to Bruges.

import { Mesher, shade, mix } from './geom.js';
import { C } from './palette.js';
import { FAIR, STREETS, ENCEINTE, LANDMARKS } from './survey.js';
import { groundHeight, export_roads } from './land.js';

const CLOTH = [C.canvas, C.woad, C.madder, C.weld, C.scarlet, C.green];

/** Dress for the crowd: mostly undyed wool and russet, with better colours
 *  on the merchants and a lot of woad blue, Champagne's own dye trade. */
const DRESS = [
  [0.30, 0.26, 0.21], [0.36, 0.30, 0.22], [0.24, 0.27, 0.33],
  [0.42, 0.36, 0.27], [0.21, 0.24, 0.31], [0.38, 0.22, 0.18],
  [0.45, 0.41, 0.33], [0.28, 0.32, 0.26], [0.50, 0.44, 0.30],
];

export function buildFair(rng) {
  const m = new Mesher();       // solid things: trestles, bales, carts, people
  const cloth = new Mesher();   // the awnings and tents, double-sided

  let stalls = 0, people = 0;

  // ---- the specialised pitches ------------------------------------------
  // Stalls in rows back to back, but a fair is not a car park: rows wander,
  // pitches are unequal, gangways open where the crowd has worn them, and every
  // few pitches someone has simply spread a cloth on the ground.
  for (const f of FAIR.fields) {
    const rot = -8 * Math.PI / 180 + (rng() - 0.5) * 0.35;
    const c = Math.cos(rot), s = Math.sin(rot);
    const rows = Math.max(2, Math.round(f.d / 10.5));
    for (let r = 0; r < rows; r++) {
      const lz = -f.d / 2 + (r + 0.5) * (f.d / rows) + (rng() - 0.5) * 2.2;
      let lx = -f.w / 2 + rng() * 3;
      let gapRun = 0;
      while (lx < f.w / 2) {
        const wide = 2.9 + rng() * 1.9;
        // a gangway every so often
        if (gapRun > 2 && rng() < 0.22) { lx += 3 + rng() * 3.5; gapRun = 0; continue; }
        const jitter = (rng() - 0.5) * 1.3;
        const x = f.at.x + lx * c - (lz + jitter) * s;
        const z = f.at.z + lx * s + (lz + jitter) * c;
        if (rng() < 0.12) {
          // a pitch on the bare ground: goods on a cloth, no trestle at all
          groundPitch(m, cloth, x, z, rot + (rng() - 0.5) * 0.5, f.kind, rng);
        } else {
          stall(m, cloth, x, z, rot + (rng() - 0.5) * 0.28, f.kind, rng);
        }
        stalls++; gapRun++;
        const n = 2 + Math.floor(rng() * 5);
        for (let k = 0; k < n; k++) {
          figure(m, x + (rng() - 0.5) * 3.6, z + 2.0 + rng() * 2.8, rng);
          people++;
        }
        lx += wide + rng() * 0.7;
      }
    }
  }

  // ---- the crowd in the streets of the fair quarter ----------------------
  for (const st of STREETS) {
    const busy = { fair: 1.0, money: 0.85, main: 0.6, alley: 0.35, tanners: 0.3,
                   cite: 0.25, burgess: 0.3, juiverie: 0.3, poor: 0.2, close: 0.15, bridge: 0.5 }[st.tag] ?? 0.2;
    for (let i = 0; i < st.pts.length - 1; i++) {
      const a = st.pts[i], b = st.pts[i + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const dir = Math.atan2(b.z - a.z, b.x - a.x);
      const nx = -Math.sin(dir), nz = Math.cos(dir);
      const n = Math.floor(L * busy * 0.55);
      for (let k = 0; k < n; k++) {
        const t = rng() * L;
        const off = (rng() - 0.5) * st.w * 0.85;
        figure(m, a.x + Math.cos(dir) * t + nx * off, a.z + Math.sin(dir) * t + nz * off, rng);
        people++;
      }
      // carts and pack animals on the wider streets
      if (st.w >= 6) {
        const carts = Math.floor(L / 55);
        for (let k = 0; k < carts; k++) {
          const t = (k + 0.5) / carts * L;
          cart(m, a.x + Math.cos(dir) * t, a.z + Math.sin(dir) * t, dir, rng);
        }
      }
    }
  }

  // ---- merchants' tents on the open ground and outside the gates ---------
  // The walls cannot hold the fair. Every summer the meadows outside fill with
  // tented lodging, horse lines and waggon parks.
  const camps = [
    { x: -900, z: 760, r: 130 },        // outside the porte de Croncels
    { x: -1330, z: 120, r: 110 },       // outside the porte de la Madeleine
    { x: -1290, z: 470, r: 95 },        // outside the porte Saint-Jacques
    { x: -730, z: -440, r: 105 },       // outside the porte de Preize
  ];
  for (const camp of camps) {
    const n = Math.round(camp.r * 0.55);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * camp.r;
      const x = camp.x + Math.cos(a) * d, z = camp.z + Math.sin(a) * d;
      if (rng() < 0.62) tent(m, cloth, x, z, rng() * Math.PI, rng);
      else {
        cart(m, x, z, rng() * Math.PI * 2, rng);
        for (let k = 0; k < 3; k++) { figure(m, x + (rng() - 0.5) * 6, z + (rng() - 0.5) * 6, rng); people++; }
      }
    }
    // horse lines
    for (let i = 0; i < 16; i++) {
      const x = camp.x + (rng() - 0.5) * camp.r * 1.4;
      const z = camp.z + camp.r * 0.75 + (rng() - 0.5) * 20;
      beast(m, x, z, rng() * 6.3, rng, 'horse');
    }
  }

  // ---- the roads in ------------------------------------------------------
  // For six weeks the roads into Troyes carry the trade of half of Europe:
  // waggon trains out of Flanders and the Rhine, mule trains over the Alpine
  // passes from Lombardy, and the ordinary country traffic of a market week.
  for (const road of export_roads) {
    const busy = /Paris|Sens|Chalons/.test(road.gate.road) ? 1.0 : 0.55;
    const n = Math.round(road.pts.length * busy * 0.75);
    for (let i = 0; i < n; i++) {
      const k = 1 + Math.floor(rng() * (road.pts.length - 2));
      const a = road.pts[k], b = road.pts[k + 1];
      const dir = Math.atan2(b.z - a.z, b.x - a.x) + (rng() < 0.5 ? 0 : Math.PI);
      const t = rng();
      const nx = -Math.sin(dir), nz = Math.cos(dir);
      const off = (rng() - 0.5) * 3.2;
      const px = a.x + (b.x - a.x) * t + nx * off;
      const pz = a.z + (b.z - a.z) * t + nz * off;
      // closer in to the gate the traffic thickens
      const dGate = Math.hypot(px - road.gate.at.x, pz - road.gate.at.z);
      if (rng() > Math.max(0.2, 1 - dGate / 2400)) continue;
      const r = rng();
      if (r < 0.34) {
        cart(m, px, pz, dir, rng);
      } else if (r < 0.62) {
        // a pack train: mules nose to tail
        const count = 3 + Math.floor(rng() * 5);
        for (let q = 0; q < count; q++) {
          beast(m, px + Math.cos(dir) * q * 3.0, pz + Math.sin(dir) * q * 3.0, dir, rng, 'horse');
          if (q % 2 === 0) { figure(m, px + Math.cos(dir) * q * 3.0 + 1.4, pz + Math.sin(dir) * q * 3.0, rng); people++; }
        }
      } else {
        const count = 1 + Math.floor(rng() * 4);
        for (let q = 0; q < count; q++) {
          figure(m, px + (rng() - 0.5) * 3, pz + (rng() - 0.5) * 3, rng);
          people++;
        }
      }
    }
  }

  // ---- the river quay: goods coming up the Seine -------------------------
  for (let i = 0; i < 26; i++) {
    const x = -292 + (rng() - 0.5) * 22;
    const z = 120 + i * 9 + (rng() - 0.5) * 6;
    if (rng() < 0.5) bale(m, x, z, rng() * 3, rng);
    else barrel(m, x, z, rng);
  }
  for (let i = 0; i < 9; i++) boat(m, -292 + (rng() - 0.5) * 8, 150 + i * 26, rng);

  return { fair: m, cloth, stalls, people };
}

// ---------------------------------------------------------------------------

function stall(m, cloth, x, z, rot, kind, rng) {
  const y = groundHeight(x, z);
  const w = 2.4 + rng() * 1.1, d = 1.7 + rng() * 0.7;
  // trestle counter
  m.box(x, y + 0.72, z, w, d, 0.10, rot, C.oakPale, { uvScale: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const lx = sx * (w / 2 - 0.2), lz = sz * (d / 2 - 0.15);
    m.box(x + lx * c - lz * s, y, z + lx * s + lz * c, 0.09, 0.09, 0.72, rot, C.oakDark, { uvScale: 4 });
  }
  // the goods on the counter
  const goods = {
    cloth: () => { for (let i = 0; i < 3; i++) m.box(x + (rng() - 0.5) * w * 0.7, y + 0.82, z + (rng() - 0.5) * d * 0.5, 0.8, 0.45, 0.22, rot, CLOTH[(rng() * 6) | 0], { uvScale: 2 }); },
    mercery: () => { for (let i = 0; i < 5; i++) m.box(x + (rng() - 0.5) * w * 0.8, y + 0.80, z + (rng() - 0.5) * d * 0.6, 0.3, 0.25, 0.16, rot, CLOTH[(rng() * 6) | 0], { uvScale: 3 }); },
    grain: () => { for (let i = 0; i < 4; i++) m.prism(x + (rng() - 0.5) * w, y, z + (rng() - 0.5) * d + 1.1, 0.34, 0.85, rng() * 3, mix(C.canvas, C.daubOchre, rng()), 7, 0.75); },
    clothes: () => { for (let i = 0; i < 4; i++) m.box(x + (rng() - 0.5) * w * 0.8, y + 0.80, z + (rng() - 0.5) * d * 0.5, 0.42, 0.35, 0.3, rot, shade(CLOTH[(rng() * 6) | 0], 0.8), { uvScale: 2 }); },
    poultry: () => { for (let i = 0; i < 6; i++) m.box(x + (rng() - 0.5) * w, y + 0.82, z + (rng() - 0.5) * d, 0.5, 0.4, 0.4, rot + rng(), C.oakPale, { uvScale: 3 }); },
    money: () => { m.box(x, y + 0.84, z, w * 0.75, d * 0.6, 0.12, rot, C.oakDark, { uvScale: 2 }); m.box(x + 0.4, y + 0.90, z, 0.35, 0.3, 0.2, rot, C.lead, { uvScale: 3 }); },
    salt: () => { for (let i = 0; i < 3; i++) m.prism(x + (rng() - 0.5) * w, y, z + 1.0, 0.42, 0.7, rng() * 3, C.chalk, 7, 0.6); },
    furs: () => { for (let i = 0; i < 4; i++) m.box(x + (rng() - 0.5) * w * 0.8, y + 0.82, z + (rng() - 0.5) * d * 0.5, 0.55, 0.4, 0.18, rot, mix(C.oakDark, C.oak, rng()), { uvScale: 2 }); },
  }[kind];
  if (goods) goods();

  // the awning — about one pitch in six makes do without
  if (rng() < 0.16) return;
  const col = CLOTH[(rng() * CLOTH.length) | 0];
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz, ly) => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
  const hw = w / 2 + 0.25 + rng() * 0.35, hd = d / 2 + 0.4 + rng() * 0.4;
  const back = 2.05 + rng() * 0.45, front = back - 0.25 - rng() * 0.35;
  for (const sx of [-1, 1]) {
    const lx = sx * hw;
    m.box(x + lx * c + hd * s, y, z + lx * s - hd * c, 0.07, 0.07, back, rot, C.oakPale, { uvScale: 5 });
    m.box(x + lx * c - hd * s, y, z + lx * s + hd * c, 0.07, 0.07, front, rot, C.oakPale, { uvScale: 5 });
  }
  cloth.quad(P(-hw, -hd, back), P(hw, -hd, back), P(hw, hd, front), P(-hw, hd, front), col, 1);
}

/** Goods spread on a cloth on the ground — the cheapest pitch at the fair. */
function groundPitch(m, cloth, x, z, rot, kind, rng) {
  const y = groundHeight(x, z);
  const w = 1.8 + rng() * 1.2, d = 1.4 + rng() * 0.9;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c - lz * s, y + 0.04, z + lx * s + lz * c];
  cloth.quad(P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2),
             CLOTH[(rng() * CLOTH.length) | 0], 1);
  for (let i = 0; i < 4; i++) {
    m.box(x + (rng() - 0.5) * w * 0.7, y + 0.06, z + (rng() - 0.5) * d * 0.7,
          0.34, 0.28, 0.22, rot + rng(), mix(C.oak, C.canvas, rng()), { uvScale: 3 });
  }
}

function tent(m, cloth, x, z, rot, rng) {
  const y = groundHeight(x, z);
  const r = 1.9 + rng() * 1.5;
  const h = 2.4 + rng() * 1.5;
  const col = rng() < 0.55 ? C.canvas : CLOTH[(rng() * CLOTH.length) | 0];
  if (rng() < 0.45) {
    // ridge tent
    const w = r * 2.2, d = r * 1.5;
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, lz, ly) => [x + lx * c - lz * s, y + ly, z + lx * s + lz * c];
    const A = P(-w / 2, -d / 2, 0), B = P(w / 2, -d / 2, 0), Cc = P(w / 2, d / 2, 0), D = P(-w / 2, d / 2, 0);
    const R0 = P(-w / 2, 0, h), R1 = P(w / 2, 0, h);
    cloth.quad(A, B, R1, R0, col, 1);
    cloth.quad(Cc, D, R0, R1, col, 1);
    cloth.tri(B, Cc, R1, shade(col, 0.92));
    cloth.tri(D, A, R0, shade(col, 0.92));
  } else {
    cloth.tri([x, y, z], [x, y, z], [x, y, z], col);   // keep counts aligned
    m.spire(x, y, z, r, h, rot, col, 8);
    m.box(x, y + h, z, 0.06, 0.06, 0.8, rot, C.oakPale, { uvScale: 4 });
  }
}

/** A person: 1.6-1.75 m, seen from 400 m up, so: legs, body, head. */
function figure(m, x, z, rng) {
  const y = groundHeight(x, z);
  const h = 1.58 + rng() * 0.18;
  const col = DRESS[(rng() * DRESS.length) | 0];
  const rot = rng() * Math.PI * 2;
  m.box(x, y, z, 0.34, 0.24, h * 0.52, rot, shade(col, 0.82), { top: false });
  m.box(x, y + h * 0.5, z, 0.42, 0.28, h * 0.36, rot, col, { top: false });
  m.box(x, y + h * 0.86, z, 0.21, 0.21, h * 0.14, rot, [0.44, 0.35, 0.28], { uvScale: 3 });
}

function beast(m, x, z, rot, rng, kind = 'ox') {
  const y = groundHeight(x, z);
  const L = kind === 'horse' ? 2.1 : 2.3;
  const H = kind === 'horse' ? 1.45 : 1.3;
  const col = kind === 'horse'
    ? [0.26 + rng() * 0.22, 0.19 + rng() * 0.15, 0.13 + rng() * 0.1]
    : [0.42 + rng() * 0.2, 0.36 + rng() * 0.16, 0.28 + rng() * 0.12];
  m.box(x, y + H * 0.52, z, L, 0.62, H * 0.42, rot, col, { uvScale: 2 });
  const c = Math.cos(rot), s = Math.sin(rot);
  m.box(x + L * 0.55 * c, y + H * 0.72, z + L * 0.55 * s, 0.5, 0.34, 0.38, rot, shade(col, 0.9), { uvScale: 3 });
  for (const lx of [-L * 0.34, L * 0.34]) for (const lz of [-0.22, 0.22]) {
    m.box(x + lx * c - lz * s, y, z + lx * s + lz * c, 0.14, 0.14, H * 0.52, rot, shade(col, 0.8), { uvScale: 4 });
  }
}

function cart(m, x, z, rot, rng) {
  const y = groundHeight(x, z);
  const L = 2.8 + rng() * 1.0, W = 1.5;
  m.box(x, y + 0.72, z, L, W, 0.55, rot, C.oakPale, { uvScale: 2 });
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const side of [-1, 1]) {
    const lz = side * (W / 2 + 0.08);
    m.prism(x - lz * s, y + 0.62, z + lz * c, 0.62, 0.12, rot + Math.PI / 2, C.oakDark, 10);
  }
  // load
  if (rng() < 0.7) {
    for (let i = 0; i < 3; i++) {
      m.box(x + (rng() - 0.5) * L * 0.6, y + 1.3, z + (rng() - 0.5) * W * 0.5, 0.7, 0.55, 0.5,
            rot + rng() * 0.5, rng() < 0.5 ? C.canvas : CLOTH[(rng() * 6) | 0], { uvScale: 2 });
    }
  }
  // the team
  beast(m, x + (L / 2 + 1.5) * c, z + (L / 2 + 1.5) * s, rot, rng, rng() < 0.5 ? 'ox' : 'horse');
}

function bale(m, x, z, rot, rng) {
  const y = groundHeight(x, z);
  const n = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    m.box(x + (rng() - 0.5) * 0.4, y + i * 0.55, z + (rng() - 0.5) * 0.4, 1.3, 0.85, 0.55,
          rot + rng() * 0.3, mix(C.canvas, C.daubOchre, rng() * 0.6), { uvScale: 1.5 });
  }
}

function barrel(m, x, z, rng) {
  const y = groundHeight(x, z);
  m.prism(x, y, z, 0.42, 1.0, rng() * 3, mix(C.oak, C.oakDark, rng()), 9, 0.9);
}

/** A flat-bottomed river barge on the channel. */
function boat(m, x, z, rng) {
  const rot = Math.PI / 2 + (rng() - 0.5) * 0.2;
  m.box(x, -0.55, z, 2.6, 9.5 + rng() * 4, 0.9, rot, C.oakDark, { uvScale: 1.5 });
  m.box(x, 0.35, z, 2.0, 4.0, 0.8, rot, mix(C.canvas, C.oakPale, rng()), { uvScale: 1.5 });
}
