// ---------------------------------------------------------------------------
// The fortifications: a brick circuit of roughly 3.5 km, about 9 m high, with
// six main gates and a chain of wall towers. On the south side the wall was
// pushed right down to the Danube in 1480 and stands in the water, with iron
// rings for mooring; landward there is a ditch and a low outer wall.
// The leaning Metzgerturm (c. 1340, 36 m, out of plumb by about 2 m) guards
// the stretch west of the bridge; the Adlerbastei of c. 1480 sits on the
// river front.
// ---------------------------------------------------------------------------
import { Builder } from './geom.js';
import { T } from './atlas.js';
import { makeRng } from './rng.js';
import { WALL, GATES, METZGERTURM, ADLERBASTEI, BRIDGE, terrainHeight, WATER_Y, TOWN_Y } from './plan.js';

const BRICK = [1.0, 0.96, 0.92];
const BRICK_D = [0.86, 0.83, 0.8];
const TILE_RED = [0.95, 0.82, 0.76];

// A box whose top face is displaced sideways: used for the leaning tower.
function leaning(b, cx, y0, cz, sx, h, sz, dx, dz, tile, col, uv) {
  const hx = sx / 2, hz = sz / 2, y1 = y0 + h;
  const A = [cx - hx, y0, cz - hz], B = [cx + hx, y0, cz - hz], C = [cx + hx, y0, cz + hz], D = [cx - hx, y0, cz + hz];
  const A1 = [cx - hx + dx, y1, cz - hz + dz], B1 = [cx + hx + dx, y1, cz - hz + dz];
  const C1 = [cx + hx + dx, y1, cz + hz + dz], D1 = [cx - hx + dx, y1, cz + hz + dz];
  const nu = Math.max(1, Math.round(sx / uv)), nv = Math.max(1, Math.round(h / uv));
  b.quad(A, B, B1, A1, tile, col, nu, nv);
  b.quad(B, C, C1, B1, tile, col, nu, nv);
  b.quad(C, D, D1, C1, tile, col, nu, nv);
  b.quad(D, A, A1, D1, tile, col, nu, nv);
  return [A1, B1, C1, D1];
}

function crenellate(b, x0, z0, x1, z1, yTop, rng) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  const nx = -uz, nz = ux;
  const step = 2.4;
  const n = Math.floor(len / step);
  for (let i = 0; i < n; i++) {
    if (i % 2) continue;                                   // gaps = embrasures
    const t = (i + 0.5) * step;
    const cx = x0 + ux * t, cz = z0 + uz * t;
    const ang = Math.atan2(uz, ux);
    b.box(cx, yTop, cz, step * 0.92, 1.7, 2.0, ang, { side: T.BRICK, top: T.BRICK }, BRICK, 3);
  }
  // the wall-walk itself
  b.quad([x0 + nx * 0.9, yTop, z0 + nz * 0.9], [x1 + nx * 0.9, yTop, z1 + nz * 0.9],
    [x1 - nx * 1.1, yTop, z1 - nz * 1.1], [x0 - nx * 1.1, yTop, z0 - nz * 1.1],
    T.PLANK, [0.8, 0.75, 0.68], Math.max(1, Math.round(len / 5)), 1);
}

function towerRoof(b, cx, y, cz, r, sides, rot, h) {
  b.spire(cx, y, cz, r, h, sides, rot, T.ROOF_TILE, TILE_RED);
}

export function buildWalls(rngSeed = 1480) {
  const b = new Builder();
  const rng = makeRng(rngSeed);
  const closed = WALL.concat([WALL[0]]);
  const gateList = Object.values(GATES);

  let dist = 0;
  let nextTower = 40;

  for (let i = 0; i < closed.length - 1; i++) {
    const [x0, z0] = closed[i], [x1, z1] = closed[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
    const riverSide = (z0 + z1) / 2 > 330;                  // the Danube front

    // The wall is built as short pieces so it steps down with the ground.
    const pieces = Math.max(1, Math.round(len / 16));
    for (let p = 0; p < pieces; p++) {
      const t0 = p / pieces, t1 = (p + 1) / pieces;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const gTop = Math.max(riverSide ? WATER_Y - 1 : 0, Math.min(terrainHeight(ax, az), terrainHeight(bx, bz)));
      const foot = riverSide ? WATER_Y - 3.5 : gTop - 2.5;
      const top = TOWN_Y + 9.0;
      b.strip([[ax, az], [bx, bz]], foot, top - foot, 2.4, T.BRICK, BRICK, 5, false);
      crenellate(b, ax, az, bx, bz, top, rng);
    }

    // wall towers at intervals, doubled where the ground is weak
    let d = 0;
    while (d < len) {
      const step = nextTower;
      if (dist + d > 0 && d + step < len) {
        const cx = x0 + ux * (d + step), cz = z0 + uz * (d + step);
        const nearGate = gateList.some((g) => Math.hypot(g.at[0] - cx, g.at[1] - cz) < 48);
        if (!nearGate) {
          const g = Math.max(riverSide ? WATER_Y - 2 : 0, terrainHeight(cx, cz));
          const base = riverSide ? WATER_Y - 3 : g - 2;
          const round = rng() < 0.45;
          const h = TOWN_Y + 9 - base + 5 + rng() * 6;
          const ang = Math.atan2(uz, ux);
          if (round) {
            b.prism(cx, base, cz, 4.2, h, 10, 0, { side: T.BRICK, top: null }, BRICK, 5, false);
            towerRoof(b, cx, base + h, cz, 4.8, 10, 0, 5.5 + rng() * 2);
          } else {
            b.box(cx, base, cz, 7.6, h, 7.6, ang, { side: T.BRICK, top: null }, BRICK, 5);
            b.spire(cx, base + h, cz, 5.6, 6 + rng() * 2.5, 4, ang + Math.PI / 4, T.ROOF_TILE, TILE_RED);
          }
        }
      }
      d += step;
      nextTower = 62 + rng() * 34;
    }
    dist += len;
  }

  // ------------------------------------------------------------- the gates --
  for (const key of Object.keys(GATES)) {
    const g = GATES[key];
    const [gx, gz] = g.at;
    const y = Math.max(TOWN_Y - 1, terrainHeight(gx, gz));
    const w = g.big ? 13 : 10.5, h = g.big ? 26 : 20;
    b.box(gx, y - 3, gz, w, h, w * 0.85, g.dir, { side: T.BRICK, top: null }, BRICK, 5);
    // the gateway itself
    b.box(gx, y, gz - w * 0.46, 4.6, 7, 0.7, g.dir, { side: T.ARCADE, top: null }, [1, 1, 1], 0);
    b.box(gx, y, gz + w * 0.46, 4.6, 7, 0.7, g.dir, { side: T.ARCADE, top: null }, [1, 1, 1], 0);
    // machicolated top course and tiled roof
    b.box(gx, y - 3 + h, gz, w + 1.4, 1.8, w * 0.85 + 1.4, g.dir, { side: T.BRICK, top: null }, BRICK_D, 4);
    b.spire(gx, y - 3 + h + 1.8, gz, w * 0.78, g.big ? 13 : 10, 4, g.dir + Math.PI / 4, T.ROOF_TILE, TILE_RED);
    // the black-and-white banner of the imperial city
    b.box(gx + 2, y - 3 + h + (g.big ? 12 : 9), gz, 0.25, 6, 0.25, 0, { side: T.PLANK, top: null }, [0.3, 0.28, 0.24]);
    b.quad([gx + 2, y - 3 + h + (g.big ? 18 : 15), gz], [gx + 2, y - 3 + h + (g.big ? 18 : 15), gz + 4.5],
      [gx + 2, y - 3 + h + (g.big ? 14.6 : 11.6), gz + 4.5], [gx + 2, y - 3 + h + (g.big ? 14.6 : 11.6), gz],
      T.BLANK, [0.95, 0.95, 0.93], 1, 1);
    b.quad([gx + 2.05, y - 3 + h + (g.big ? 16.3 : 13.3), gz], [gx + 2.05, y - 3 + h + (g.big ? 16.3 : 13.3), gz + 4.5],
      [gx + 2.05, y - 3 + h + (g.big ? 14.6 : 11.6), gz + 4.5], [gx + 2.05, y - 3 + h + (g.big ? 14.6 : 11.6), gz],
      T.BLANK, [0.12, 0.12, 0.13], 1, 1);
  }

  // ------------------------------------------------------- the Metzgerturm --
  {
    const [mx, mz] = METZGERTURM;
    const base = WATER_Y - 2;
    // 36 m tall and leaning about 2 m to the north-west
    leaning(b, mx, base, mz, 9.2, 36, 9.2, -1.5, -1.3, T.BRICK, BRICK, 5);
    b.box(mx - 1.5, base + 36, mz - 1.3, 10.4, 1.6, 10.4, 0, { side: T.BRICK, top: null }, BRICK_D, 4);
    b.spire(mx - 1.6, base + 37.6, mz - 1.4, 7.4, 11, 4, Math.PI / 4, T.ROOF_TILE, TILE_RED);
    // the gateway through its foot
    b.box(mx, TOWN_Y, mz - 4.7, 3.6, 6, 0.6, 0, { side: T.ARCADE, top: null }, [1, 1, 1], 0);
  }

  // -------------------------------------------------------- the Adlerbastei --
  {
    const [ax, az] = ADLERBASTEI;
    b.prism(ax, WATER_Y - 3, az, 13, TOWN_Y + 10, 12, 0, { side: T.BRICK, top: T.WALKWAY }, BRICK, 6, true);
    for (let i = 0; i < 12; i += 2) {
      const a = (i / 12) * Math.PI * 2;
      b.box(ax + Math.cos(a) * 12.4, TOWN_Y + 10, az + Math.sin(a) * 12.4, 2.6, 1.6, 2.2, a, { side: T.BRICK, top: T.BRICK }, BRICK, 3);
    }
  }

  // ------------------------------------------------------------ the ditch --
  // Landward the circuit is fronted by a dry ditch and a low outer wall.
  const outer = [];
  for (let i = 0; i < WALL.length; i++) {
    const [x, z] = WALL[i];
    if (z > 340) continue;                                   // no ditch on the river side
    const cx = WALL.reduce((s, p) => s + p[0], 0) / WALL.length;
    const cz = WALL.reduce((s, p) => s + p[1], 0) / WALL.length;
    const dx = x - cx, dz = z - cz, L = Math.hypot(dx, dz);
    outer.push([x + (dx / L) * 34, z + (dz / L) * 34]);
  }
  for (let i = 0; i < outer.length - 1; i++) {
    const [x0, z0] = outer[i], [x1, z1] = outer[i + 1];
    const y = Math.min(terrainHeight(x0, z0), terrainHeight(x1, z1));
    b.strip([[x0, z0], [x1, z1]], y - 1, 3.4, 1.6, T.BRICK, BRICK_D, 5, true);
  }

  return b;
}

// ---------------------------------------------------------------- bridge ----
// The Herdbrucke: a timber deck carried on stone-and-timber piers, the only
// crossing of the Danube here and the city's gate towards Bavaria.
export function buildBridge() {
  const b = new Builder();
  const rng = makeRng(77);
  const [x0, z0] = BRIDGE.from, [x1, z1] = BRIDGE.to;
  const n = 9;
  const deckY = TOWN_Y - 0.6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const g = terrainHeight(x, z);
    const pierTop = deckY - 0.9;
    if (i < n) {
      // cutwater piers of rough stone with a timber starling
      b.prism(x, Math.min(g, WATER_Y - 2.6), z, 3.4, pierTop - Math.min(g, WATER_Y - 2.6), 6, 0.4,
        { side: T.RUBBLE, top: T.RUBBLE }, [0.92, 0.9, 0.86], 4, true);
      for (let k = 0; k < 5; k++) {
        const a = 0.6 + k * 1.1;
        b.box(x + Math.cos(a) * 4.2, WATER_Y - 2, z + Math.sin(a) * 4.2, 0.4, 5.5, 0.4, 0,
          { side: T.PLANK, top: null }, [0.42, 0.36, 0.28]);
      }
    }
  }
  // deck and parapet
  const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
  b.box((x0 + x1) / 2, deckY - 0.9, (z0 + z1) / 2, L, 0.9, 7.2, ang, { side: T.PLANK, top: T.PLANK }, [0.78, 0.72, 0.6], 4);
  for (const s of [-1, 1]) {
    const nx = -Math.sin(ang) * 3.4 * s, nz = Math.cos(ang) * 3.4 * s;
    b.box((x0 + x1) / 2 + nx, deckY, (z0 + z1) / 2 + nz, L, 1.1, 0.35, ang, { side: T.PLANK, top: T.PLANK }, [0.6, 0.53, 0.4], 3);
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      b.box(x0 + (x1 - x0) * t + nx, deckY, z0 + (z1 - z0) * t + nz, 0.3, 1.9, 0.3, ang, { side: T.PLANK, top: null }, [0.5, 0.44, 0.34]);
    }
  }
  // a little bridge chapel-cum-tollhouse at the south end, as most such
  // bridges carried
  b.box(x1 + 6, terrainHeight(x1 + 6, z1 + 6), z1 + 8, 7, 5, 6, 0.3, { side: T.RUBBLE, top: null }, [0.95, 0.93, 0.88], 4);
  b.gableRoof(x1 + 6, terrainHeight(x1 + 6, z1 + 6) + 5, z1 + 8, 7, 6, 3.4, 0.3, T.ROOF_TILE, TILE_RED, 0.5);
  return b;
}
