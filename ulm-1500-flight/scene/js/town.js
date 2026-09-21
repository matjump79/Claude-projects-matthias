// ---------------------------------------------------------------------------
// The built fabric inside the walls: burgher houses crowding the lanes, the
// public buildings, the convents, the mills on the Blau.
//
// Form follows what late-medieval Swabian towns actually looked like: narrow
// plots with the GABLE to the street, two to four storeys, a masonry or heavy
// timber ground floor with the trade in it, framed and lime-washed floors
// above, often jettied out over the lane, and a steep tiled roof with a
// hoist-loft. Timbers are weathered oak, not the black-and-white paint of
// modern restoration.
// ---------------------------------------------------------------------------
import { Builder } from './geom.js';
import { T } from './atlas.js';
import { makeRng } from './rng.js';
import {
  STREETS, SQUARES, WALL, GATES, MINSTER, RATHAUS, WENGEN, FRANCISCAN, DOMINICAN,
  SPITAL, WEINHOF_PFALZ, BLAU, BLAU_ARM, DANUBE, polyDistance, insideWall,
  wallDistance, terrainHeight, TOWN_Y, WATER_Y,
} from './plan.js';

// Clay tile, fired in the kilns downwind of the town: orange-red through to
// a sooty brown, with the odd grey shingle roof on an outbuilding.
const ROOFS = [
  [1.15, 0.80, 0.66], [1.08, 0.70, 0.56], [1.20, 0.86, 0.70], [0.98, 0.64, 0.52],
  [1.12, 0.76, 0.60], [0.90, 0.58, 0.48], [1.18, 0.82, 0.62],
];
const WALLS_T = [T.TIMBER_POST, T.TIMBER_BRACE, T.TIMBER_DENSE, T.PLASTER, T.PLASTER_OCHRE];

// ------------------------------------------------------------- occupancy ---
class Occ {
  constructor(cell = 3.5) { this.cell = cell; this.set = new Set(); }
  key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  free(cx, cz, w, d) {
    for (let x = cx - w / 2; x <= cx + w / 2; x += this.cell / 2)
      for (let z = cz - d / 2; z <= cz + d / 2; z += this.cell / 2)
        if (this.set.has(this.key(x, z))) return false;
    return true;
  }
  mark(cx, cz, w, d) {
    for (let x = cx - w / 2; x <= cx + w / 2; x += this.cell / 2)
      for (let z = cz - d / 2; z <= cz + d / 2; z += this.cell / 2)
        this.set.add(this.key(x, z));
  }
}

function inSquare(x, z) {
  for (const s of SQUARES) if (Math.hypot(x - s.c[0], z - s.c[1]) < s.r) return s;
  return null;
}
function nearWater(x, z, m = 13) {
  return polyDistance(BLAU, x, z).d < m || polyDistance(BLAU_ARM, x, z).d < m || polyDistance(DANUBE, x, z).d < 66;
}

// ----------------------------------------------------------------- houses ---
// One burgher house. `gableToStreet` puts the ridge perpendicular to the lane,
// which is the normal plot shape; wider corner houses turn their eaves out.
function house(b, rng, x, z, ang, w, d, storeys, opts = {}) {
  const y = opts.baseY ?? TOWN_Y;
  const floor = 3.0 + rng() * 0.5;
  const h = storeys * floor;
  const wallTile = opts.wallTile ?? rng.pick(WALLS_T);
  const stoneGround = opts.stone || rng() < 0.32;
  // lime-wash: white, but as often tinted with ochre, red earth or a wash of
  // the local marl
  const wash = rng();
  const col = wash < 0.42 ? [0.98 + rng() * 0.14, 0.96 + rng() * 0.12, 0.90 + rng() * 0.12]
    : wash < 0.70 ? [1.05 + rng() * 0.16, 0.94 + rng() * 0.12, 0.74 + rng() * 0.12]
      : wash < 0.86 ? [1.02 + rng() * 0.12, 0.88 + rng() * 0.1, 0.78 + rng() * 0.1]
        : [0.86 + rng() * 0.12, 0.86 + rng() * 0.1, 0.80 + rng() * 0.12];
  const roofCol = rng.pick(ROOFS).map((c) => c * (0.92 + rng() * 0.16));

  // ground floor: masonry, or a heavy framed shopfront
  const gh = floor * 1.12;
  b.box(x, y, z, w, gh, d, ang, { side: stoneGround ? T.RUBBLE : T.TIMBER_DENSE, top: null },
    stoneGround ? [0.92, 0.9, 0.86] : col, 3.6);
  // upper floors, jettied a little over the lane
  const jut = rng() < 0.6 ? 0.55 : 0;
  b.box(x, y + gh, z, w + jut * 2, h - gh, d + jut * 2, ang, { side: wallTile, top: null }, col, 3.4);
  if (jut) { // the underside of the overhang
    b.box(x, y + gh - 0.25, z, w + jut * 2, 0.3, d + jut * 2, ang, { side: T.PLANK, top: null }, [0.55, 0.48, 0.37]);
  }

  const rw = w + jut * 2, rd = d + jut * 2;
  const steep = 0.74 + rng() * 0.30;          // steep roofs: they shed snow and
  const gableToStreet = opts.eaves ? false : rng() < 0.72;   // hold a hoist loft
  if (gableToStreet) {
    b.gableRoof(x, y + h, z, rd, rw, (rw / 2) * steep * 1.5, ang + Math.PI / 2,
      rng() < 0.12 ? T.SHINGLE : T.ROOF_TILE, roofCol, 0.45, wallTile, col);
  } else {
    b.gableRoof(x, y + h, z, rw, rd, (rd / 2) * steep * 1.5, ang,
      rng() < 0.12 ? T.SHINGLE : T.ROOF_TILE, roofCol, 0.45, wallTile, col);
  }
  // chimney
  if (rng() < 0.8) {
    const cx = x + (rng() - 0.5) * w * 0.4, cz = z + (rng() - 0.5) * d * 0.4;
    b.box(cx, y + h, cz, 0.9, (rw / 2) * steep * 1.5 + 1.6, 0.9, ang, { side: T.RUBBLE, top: T.RUBBLE }, [0.85, 0.8, 0.75], 2);
  }
  return h;
}

// --------------------------------------------------------------- the town ---
export function buildTown() {
  const b = new Builder();
  const rng = makeRng(1500);
  const occ = new Occ(3.4);

  // keep the Minster, its yard and the public buildings clear
  occ.mark(MINSTER.x, MINSTER.z, 142, 50);   // the church footprint itself
  for (const s of SQUARES) occ.mark(s.c[0], s.c[1], s.r * 1.7, s.r * 1.7);
  for (const p of [RATHAUS, WENGEN, FRANCISCAN, DOMINICAN, SPITAL, WEINHOF_PFALZ]) occ.mark(p.x, p.z, 76, 76);
  for (const g of Object.values(GATES)) occ.mark(g.at[0], g.at[1], 26, 26);

  // --- streets: lay the roadway, then line it with houses -------------------
  const ground = new Builder();
  for (const st of STREETS) {
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [x0, z0] = st.pts[i], [x1, z1] = st.pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len, nx = -uz, nz = ux;
      const hw = st.w / 2;
      ground.quad(
        [x0 + nx * hw, TOWN_Y + 0.05, z0 + nz * hw], [x1 + nx * hw, TOWN_Y + 0.05, z1 + nz * hw],
        [x1 - nx * hw, TOWN_Y + 0.05, z1 - nz * hw], [x0 - nx * hw, TOWN_Y + 0.05, z0 - nz * hw],
        T.COBBLE, [0.95, 0.93, 0.9], Math.max(1, Math.round(len / 9)), 1,
      );
      occ.mark((x0 + x1) / 2, (z0 + z1) / 2, 0, 0);
      // the street itself must stay clear
      for (let t = 0; t < len; t += 2) {
        occ.mark(x0 + ux * t, z0 + uz * t, st.w * 0.7, st.w * 0.7);
      }
    }
  }

  let placed = 0;
  for (const st of STREETS) {
    for (let i = 0; i < st.pts.length - 1; i++) {
      const [x0, z0] = st.pts[i], [x1, z1] = st.pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const ang = Math.atan2(uz, ux);
      const nx = -uz, nz = ux;
      for (const side of [-1, 1]) {
        let t = rng() * 3;
        while (t < len - 3) {
          const w = 5.4 + rng() * 5.0;                 // plot frontage
          const d = 9 + rng() * 7;                     // depth into the block
          const off = st.w / 2 + d / 2 + 1.2;
          const cx = x0 + ux * (t + w / 2) + nx * side * off;
          const cz = z0 + uz * (t + w / 2) + nz * side * off;
          t += w + rng() * 0.9;
          if (rng() < 0.10) t += 2.5;                  // the odd gateway into a yard
          if (!insideWall(cx, cz) || wallDistance(cx, cz) < 13) continue;
          if (inSquare(cx, cz) || nearWater(cx, cz)) continue;
          if (!occ.free(cx, cz, w - 0.4, d - 0.4)) continue;
          occ.mark(cx, cz, w + 0.4, d + 0.4);
          // taller and richer towards the market and the Minster
          const dCentre = Math.hypot(cx + 20, cz - 90);
          const storeys = dCentre < 170 ? (rng() < 0.5 ? 4 : 3) : dCentre < 320 ? (rng() < 0.55 ? 3 : 2) : (rng() < 0.3 ? 3 : 2);
          house(b, rng, cx, cz, ang + Math.PI / 2, d, w, storeys, { stone: dCentre < 150 && rng() < 0.5 });
          placed++;
          // the plot runs back from the street: a rear wing, then sheds
          const backOff = d / 2 + 5.5;
          const bx = cx + nx * side * backOff, bz = cz + nz * side * backOff;
          if (rng() < 0.55 && insideWall(bx, bz) && !inSquare(bx, bz) && !nearWater(bx, bz)
              && wallDistance(bx, bz) > 13 && occ.free(bx, bz, w - 1, 8)) {
            occ.mark(bx, bz, w + 0.4, 9);
            house(b, rng, bx, bz, ang + Math.PI / 2, 8, w - 0.8, Math.max(1, storeys - 1), { eaves: true });
            placed++;
          } else if (rng() < 0.5 && insideWall(bx, bz) && occ.free(bx, bz, 5, 5) && !nearWater(bx, bz)) {
            occ.mark(bx, bz, 5.4, 5.4);
            b.box(bx, TOWN_Y, bz, 3.6, 2.6, 3.2, ang, { side: T.PLANK, top: null }, [0.72, 0.64, 0.5], 3);
            b.gableRoof(bx, TOWN_Y + 2.6, bz, 3.6, 3.2, 1.5, ang, T.SHINGLE, [0.8, 0.78, 0.72], 0.4);
          }
        }
      }
    }
  }

  // --- infill: the blocks behind the lanes are not empty --------------------
  for (let i = 0; i < 9000 && placed < 2400; i++) {
    const cx = -520 + rng() * 1010, cz = -400 + rng() * 840;
    if (!insideWall(cx, cz) || wallDistance(cx, cz) < 15) continue;
    if (inSquare(cx, cz) || nearWater(cx, cz, 16)) continue;
    const w = 5.2 + rng() * 4.6, d = 7.5 + rng() * 5.5;
    if (!occ.free(cx, cz, w, d)) continue;
    occ.mark(cx, cz, w + 0.5, d + 0.5);
    const ang = Math.round(rng() * 4) * (Math.PI / 4) + (rng() - 0.5) * 0.35;
    const dCentre = Math.hypot(cx + 20, cz - 90);
    const storeys = dCentre < 200 ? (rng() < 0.45 ? 3 : 2) : (rng() < 0.25 ? 3 : 2);
    house(b, rng, cx, cz, ang, d, w, storeys, {});
    placed++;
  }

  // --- the market squares get their ground surface --------------------------
  for (const s of SQUARES) {
    const tile = s.tile === 'cobble' ? T.COBBLE : s.tile === 'dirt' ? T.DIRT : T.MARKET;
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push([s.c[0] + Math.cos(a) * s.r * (0.9 + 0.2 * Math.sin(i * 2.3)), s.c[1] + Math.sin(a) * s.r * (0.9 + 0.2 * Math.cos(i * 1.7))]);
    }
    ground.polyFlat(pts, TOWN_Y + 0.06, tile, [0.97, 0.95, 0.92], 24);
  }
  b.merge(ground);

  // ------------------------------------------------------------- landmarks --
  buildRathaus(b, rng);
  buildConvent(b, rng, WENGEN, 'wengen');
  buildConvent(b, rng, FRANCISCAN, 'franciscan');
  buildConvent(b, rng, DOMINICAN, 'dominican');
  buildSpital(b, rng);
  buildPfalz(b, rng);
  buildMills(b, rng);
  buildMarketStalls(b, rng);
  return b;
}

// The town hall: the city bought the merchants' hall of 1370 and moved its
// council in in 1419. In 1500 it is a big plain gabled block -- the painted
// facade and the famous astronomical clock only arrive between 1520 and 1540.
function buildRathaus(b, rng) {
  const { x, z, rot } = RATHAUS;
  const y = TOWN_Y;
  b.box(x, y, z, 38, 5.5, 17, rot, { side: T.ARCADE, top: null }, [0.96, 0.94, 0.9], 4);
  b.box(x, y + 5.5, z, 38, 12, 17, rot, { side: T.PLASTER, top: null }, [0.95, 0.92, 0.85], 3.6);
  b.gableRoof(x, y + 17.5, z, 38, 17, 11, rot, T.ROOF_TILE, [0.9, 0.72, 0.64], 0.7, T.PLASTER, [0.95, 0.92, 0.85]);
  // stair turret and the council's bell-cot
  b.prism(x - 16, y, z - 9.5, 2.6, 21, 8, 0, { side: T.RUBBLE, top: null }, [0.93, 0.91, 0.87], 4, false);
  b.spire(x - 16, y + 21, z - 9.5, 3, 5, 8, 0, T.SHINGLE, [0.75, 0.73, 0.68]);
  b.box(x + 6, y + 28.5, z, 3.2, 4, 3.2, rot, { side: T.PLANK, top: null }, [0.6, 0.54, 0.42]);
  b.spire(x + 6, y + 32.5, z, 2.6, 4.5, 4, rot + Math.PI / 4, T.SHINGLE, [0.72, 0.7, 0.64]);
  // the east wing, the old Kaufhaus of 1370, with its high sales hall
  b.box(x + 26, y, z + 4, 16, 9, 14, rot, { side: T.ARCADE, top: null }, [0.95, 0.93, 0.89], 4);
  b.box(x + 26, y + 9, z + 4, 16, 7, 14, rot, { side: T.PLASTER_OCHRE, top: null }, [0.95, 0.9, 0.82], 3.6);
  b.gableRoof(x + 26, y + 16, z + 4, 16, 14, 9, rot, T.ROOF_TILE, [0.86, 0.68, 0.6], 0.6, T.PLASTER_OCHRE, [0.95, 0.9, 0.82]);
}

// Convents: church with a modest tower or ridge turret, cloister ranges round
// a garth, precinct wall, orchard.
function buildConvent(b, rng, at, kind) {
  const { x, z, rot } = at;
  const y = TOWN_Y;
  const len = kind === 'wengen' ? 52 : 42, wid = 17;
  // church
  b.box(x, y, z, len, 13, wid, rot, { side: T.LANCET, top: null }, [0.97, 0.95, 0.9], 5);
  b.gableRoof(x, y + 13, z, len, wid, 10, rot, T.ROOF_CHURCH, [0.85, 0.68, 0.62], 0.6, T.ASHLAR, [0.95, 0.93, 0.88]);
  // apse
  b.prism(x + len / 2 + 3, y, z, 8.5, 12, 5, rot, { side: T.LANCET, top: null }, [0.97, 0.95, 0.9], 5, false);
  b.spire(x + len / 2 + 3, y + 12, z, 8.8, 7, 5, rot, T.ROOF_CHURCH, [0.85, 0.68, 0.62]);
  if (kind === 'wengen') {          // a real tower over the west end
    b.box(x - len / 2 - 4, y, z, 11, 34, 11, rot, { side: T.ASHLAR, top: null }, [0.96, 0.94, 0.89], 6);
    b.box(x - len / 2 - 4, y + 22, z - 5.6, 5, 9, 0.5, rot, { side: T.LANCET, top: null }, [1, 1, 1], 0);
    b.spire(x - len / 2 - 4, y + 34, z, 8, 14, 8, rot, T.SHINGLE, [0.74, 0.72, 0.66]);
  } else {                           // friars' churches carry only a ridge turret
    b.prism(x + 4, y + 23, z, 2.2, 6, 6, 0, { side: T.PLANK, top: null }, [0.6, 0.55, 0.45], 0, false);
    b.spire(x + 4, y + 29, z, 2.6, 6.5, 6, 0, T.SHINGLE, [0.74, 0.72, 0.66]);
  }
  // cloister ranges around a garth
  const c = Math.cos(rot), s = Math.sin(rot);
  const pt = (dx, dz) => [x + dx * c - dz * s, z + dx * s + dz * c];
  const side = 34;
  for (const [dx, dz, w, d] of [
    [0, wid / 2 + side / 2 + 4, side, 9],
    [-side / 2 - 2, wid / 2 + side / 2 + 4, 9, side],
    [side / 2 + 2, wid / 2 + side / 2 + 4, 9, side],
    [0, wid / 2 + side + 8, side, 9],
  ]) {
    const [px, pz] = pt(dx, dz);
    b.box(px, y, pz, w, 8.5, d, rot, { side: T.PLASTER, top: null }, [0.95, 0.93, 0.88], 3.6);
    b.gableRoof(px, y + 8.5, pz, w, d, Math.min(w, d) * 0.5, rot, T.ROOF_TILE, [0.88, 0.7, 0.63], 0.5);
  }
  // precinct wall
  const wallPts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    wallPts.push([x + Math.cos(a) * 58, z + Math.sin(a) * 46]);
  }
  b.strip(wallPts, y, 2.6, 0.6, T.RUBBLE, [0.9, 0.88, 0.84], 5, true);
}

// The Holy Ghost hospital by the river: hall, chapel and yard.
function buildSpital(b, rng) {
  const { x, z, rot } = SPITAL;
  const y = TOWN_Y;
  b.box(x, y, z, 34, 11, 15, rot, { side: T.TIMBER_BRACE, top: null }, [0.95, 0.93, 0.88], 3.6);
  b.gableRoof(x, y + 11, z, 34, 15, 10, rot, T.ROOF_TILE, [0.9, 0.72, 0.64], 0.6, T.TIMBER_BRACE, [0.95, 0.93, 0.88]);
  b.box(x - 22, y, z + 2, 14, 9, 11, rot, { side: T.LANCET, top: null }, [0.96, 0.94, 0.9], 5);
  b.gableRoof(x - 22, y + 9, z + 2, 14, 11, 7, rot, T.ROOF_CHURCH, [0.85, 0.68, 0.62], 0.5);
  b.prism(x - 22, y + 16, z + 2, 1.8, 5, 6, 0, { side: T.PLANK, top: null }, [0.6, 0.55, 0.45], 0, false);
  b.spire(x - 22, y + 21, z + 2, 2.2, 5, 6, 0, T.SHINGLE, [0.74, 0.72, 0.66]);
}

// The Weinhof: the old royal hall (Pfalz) at the origin of the city, by 1500
// a courtyard of civic and trade buildings around an open square.
function buildPfalz(b, rng) {
  const { x, z, rot } = WEINHOF_PFALZ;
  const y = TOWN_Y;
  b.box(x, y, z, 30, 14, 14, rot, { side: T.RUBBLE, top: null }, [0.94, 0.92, 0.88], 4);
  b.gableRoof(x, y + 14, z, 30, 14, 9, rot, T.ROOF_TILE, [0.86, 0.7, 0.62], 0.6, T.RUBBLE, [0.94, 0.92, 0.88]);
  b.box(x + 19, y, z - 8, 12, 17, 12, rot, { side: T.RUBBLE, top: null }, [0.93, 0.91, 0.86], 4);
  b.spire(x + 19, y + 17, z - 8, 8.6, 8, 4, rot + Math.PI / 4, T.ROOF_TILE, [0.86, 0.7, 0.62]);
}

// Mills on the Blau. The stream's fall drove grain mills, fulling stocks and
// the tanners' and dyers' works that made the quarter.
function buildMills(b, rng) {
  const spots = [[-300, 312], [-206, 344], [-140, 380], [-402, 322]];
  for (const [x, z] of spots) {
    const y = TOWN_Y - 0.6;
    const ang = 0.5;
    b.box(x, y, z, 12, 9, 9, ang, { side: T.TIMBER_DENSE, top: null }, [0.94, 0.92, 0.86], 3.4);
    b.gableRoof(x, y + 9, z, 12, 9, 6, ang, T.ROOF_TILE, [0.88, 0.7, 0.62], 0.5, T.TIMBER_DENSE, [0.94, 0.92, 0.86]);
    // the wheel, undershot in the stream
    const wx = x + Math.sin(ang) * 6.6, wz = z - Math.cos(ang) * 6.6;
    b.prism(wx, y - 2.2, wz, 3.2, 1.4, 12, 0, { side: T.PLANK, top: T.PLANK }, [0.5, 0.44, 0.34], 0, true);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.box(wx + Math.cos(a) * 2.6, y - 2.2 + Math.sin(a) * 2.6, wz, 1.1, 0.25, 1.6, a, { side: T.PLANK, top: null }, [0.46, 0.4, 0.3]);
    }
  }
}

// Market: rows of stalls under cloth awnings on the Marktplatz, and the
// bread bench and fish stones near the Minster yard.
function buildMarketStalls(b, rng) {
  const rows = [[-46, 178, 0.1, 9], [-6, 120, 0.0, 7], [-60, 196 - 26, 0.06, 6]];
  for (const [x0, z0, ang, n] of rows) {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.cos(ang) * (i - n / 2) * 6.2 + (rng() - 0.5) * 1.2;
      const z = z0 + Math.sin(ang) * (i - n / 2) * 6.2 + (rng() - 0.5) * 1.2;
      const y = TOWN_Y + 0.1;
      b.box(x, y, z, 4.2, 1.1, 2.6, ang, { side: T.PLANK, top: T.PLANK }, [0.7, 0.62, 0.48], 2);
      for (const [dx, dz] of [[-1.9, -1.1], [1.9, -1.1], [1.9, 1.1], [-1.9, 1.1]])
        b.box(x + dx, y, z + dz, 0.18, 2.6, 0.18, ang, { side: T.PLANK, top: null }, [0.45, 0.4, 0.3]);
      const cloth = rng() < 0.5 ? [0.9, 0.86, 0.74] : rng() < 0.5 ? [0.78, 0.4, 0.3] : [0.5, 0.55, 0.65];
      b.gableRoof(x, y + 2.6, z, 4.6, 3.2, 0.9, ang, T.BLANK, cloth, 0.5);
    }
  }
}
