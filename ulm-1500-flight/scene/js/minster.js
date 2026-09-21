// ---------------------------------------------------------------------------
// The Minster of Our Lady, as it stood in 1500 -- a building site, not a
// finished church.
//
// Documented state at that date:
//  * Foundation stone 1377; built by the townspeople, not a bishop.
//  * Matthaeus Boeblinger raised the west tower to the square platform at
//    c. 70 m -- the stage King Maximilian I climbed on his visit in July 1492.
//  * In 1492 stones fell from the vault of the under-founded tower during a
//    sermon; work on the tower stopped. The square was finished in 1494 and
//    the octagon begun above it was broken off after about five metres and
//    covered with a provisional pyramid roof. It stayed that way until 1890.
//  * Burkhard Engelberg became master mason in 1493. His rebuilding of the
//    aisles into five naves only began in 1502 -- so in 1500 the church is
//    still a THREE-aisled basilica.
//  * The choir flanking towers were likewise unfinished stumps; their present
//    86 m spires are 19th-century work.
//
// Proportions follow the finished building (123.5 m long, central nave 41.6 m,
// aisles 20.55 m) with the 1500 state substituted where it is known to differ.
// ---------------------------------------------------------------------------
import { Builder } from './geom.js';
import { T } from './atlas.js';
import { makeRng } from './rng.js';

const STONE = [1.0, 0.98, 0.92];          // Alb limestone, warm pale grey
const STONE_D = [0.9, 0.88, 0.82];
const ROOF = [0.86, 0.72, 0.66];

export function buildMinster(base = 8.5) {
  const b = new Builder();
  const rng = makeRng(1377);
  const Y = base;

  // ----------------------------------------------------------- dimensions --
  const westX = -62, naveEndX = 6, choirEndX = 48, apexX = 62;
  const naveHalf = 7.6;        // central vessel
  const aisleHalf = 18.4;      // outer face of the (still only two) aisles
  const aisleTop = Y + 24, clerTop = Y + 46, ridge = Y + 60;
  const choirHalf = 11.5, choirTop = Y + 34, choirRidge = Y + 47;

  const wall = (x0, z0, x1, z1, y0, y1, tile, col, nu, nv) => {
    b.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], tile, col, nu, nv);
  };

  // ------------------------------------------------------------- the nave --
  // outer aisle walls, pierced by tall traceried windows between buttresses
  for (const s of [-1, 1]) {
    const z = s * aisleHalf;
    wall(westX, z, naveEndX, z, Y, Y + 8, T.ASHLAR, STONE, 9, 1);
    wall(westX, z, naveEndX, z, Y + 8, aisleTop, T.TRACERY, STONE, 8, 1);
    // buttresses with weathered offsets and pinnacles
    for (let x = westX + 6; x < naveEndX; x += 8.2) {
      b.box(x, Y, z + s * 1.6, 2.6, 19, 3.6, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.box(x, Y + 19, z + s * 1.2, 2.2, 5, 2.6, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.spire(x, Y + 24, z + s * 1.2, 1.5, 4.5, 4, Math.PI / 4, T.ASHLAR, STONE);
    }
    // lean-to aisle roof rising against the clerestory
    b.quad([westX, aisleTop, z], [naveEndX, aisleTop, z], [naveEndX, aisleTop + 7, s * naveHalf], [westX, aisleTop + 7, s * naveHalf],
      T.ROOF_CHURCH, ROOF, 12, 2);
    // clerestory
    const cz = s * naveHalf;
    wall(westX, cz, naveEndX, cz, aisleTop + 7, clerTop, T.LANCET, STONE, 8, 1);
  }
  // steep main roof over the central vessel
  b.gableRoof((westX + naveEndX) / 2, clerTop, 0, naveEndX - westX, naveHalf * 2, ridge - clerTop, 0,
    T.ROOF_CHURCH, ROOF, 0.4, T.ASHLAR, STONE_D);

  // ------------------------------------------------------------ the choir --
  for (const s of [-1, 1]) {
    const z = s * choirHalf;
    wall(naveEndX, z, choirEndX, z, Y, Y + 9, T.ASHLAR, STONE, 6, 1);
    wall(naveEndX, z, choirEndX, z, Y + 9, choirTop, T.TRACERY, STONE, 5, 1);
    for (let x = naveEndX + 5; x < choirEndX; x += 8.5) {
      b.box(x, Y, z + s * 1.5, 2.4, 22, 3.2, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.spire(x, Y + 22, z + s * 1.2, 1.4, 4, 4, Math.PI / 4, T.ASHLAR, STONE);
    }
  }
  b.gableRoof((naveEndX + choirEndX) / 2, choirTop, 0, choirEndX - naveEndX, choirHalf * 2, choirRidge - choirTop, 0,
    T.ROOF_CHURCH, ROOF, 0.4, T.ASHLAR, STONE_D);

  // apse: a five-sided closure with its own half-cone roof
  const apsePts = [];
  const seg = 5;
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    apsePts.push([choirEndX + Math.cos(a) * (apexX - choirEndX), Math.sin(a) * choirHalf]);
  }
  for (let i = 0; i < apsePts.length - 1; i++) {
    const [x0, z0] = apsePts[i], [x1, z1] = apsePts[i + 1];
    wall(x0, z0, x1, z1, Y, Y + 9, T.ASHLAR, STONE, 2, 1);
    wall(x0, z0, x1, z1, Y + 9, choirTop, T.TRACERY, STONE, 1, 1);
    b.tri([x0, choirTop, z0], [x1, choirTop, z1], [choirEndX, choirRidge, 0],
      [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], ROOF);
  }

  // ---------------------------------------------- choir flanking towers ----
  // Unfinished in 1500: square shafts carried a little above the choir roof
  // and closed with provisional roofs. (Their spires date from the 1880s.)
  for (const s of [-1, 1]) {
    const tx = naveEndX + 7, tz = s * (choirHalf + 6.5);
    b.box(tx, Y, tz, 13, 32, 13, 0, { side: T.ASHLAR, top: null }, STONE, 7);
    b.box(tx, Y + 32, tz, 13.6, 2, 13.6, 0, { side: T.ASHLAR, top: null }, STONE_D, 7);
    b.box(tx, Y + 12, tz + s * 6.8, 6, 18, 0.6, 0, { side: T.LANCET, top: null }, STONE, 6);
    b.spire(tx, Y + 34, tz, 9.6, 11, 4, Math.PI / 4, T.SHINGLE, [0.8, 0.78, 0.72]);
  }

  // ------------------------------------------------------- the west tower --
  // Square shaft in three diminishing stages to the platform at c. 70 m, with
  // paired corner buttresses; then the stump of the octagon Boeblinger began
  // and the pyramidal emergency roof that closed it in 1494.
  const tx = westX + 12, sq = 21;

  const stage = (y0, h, w, tile, uv) => {
    b.box(tx, y0, 0, w, h, w, 0, { side: tile, top: null }, STONE, uv);
    // string course marking the top of the stage
    b.box(tx, y0 + h - 0.9, 0, w + 1.5, 1.1, w + 1.5, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 4);
  };

  stage(Y, 26, sq, T.ASHLAR, 7);
  stage(Y + 26, 24, sq - 1.6, T.ASHLAR, 7);
  stage(Y + 50, 20, sq - 3.2, T.ASHLAR, 7);

  // paired buttresses clasping each corner, stepping back with the stages
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = tx + sx * (sq / 2 - 0.4), bz = sz * (sq / 2 - 0.4);
    for (const [ox, oz] of [[sx * 1.9, 0], [0, sz * 1.9]]) {
      b.box(bx + ox, Y, bz + oz, 4.2, 30, 4.2, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.box(bx + ox * 0.9, Y + 30, bz + oz * 0.9, 3.6, 22, 3.6, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.box(bx + ox * 0.75, Y + 52, bz + oz * 0.75, 3.0, 18, 3.0, 0, { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 6);
      b.spire(bx + ox * 0.75, Y + 70, bz + oz * 0.75, 2.1, 7.5, 4, Math.PI / 4, T.ASHLAR, STONE);
    }
  }

  // the great west window over the portal, and the tall openings above
  b.box(tx, Y + 12, -sq / 2 - 0.35, 10.5, 15, 0.7, 0, { side: T.TRACERY, top: null }, STONE, 0);
  b.box(tx - sq / 2 - 0.35, Y + 14, 0, 0.7, 12, 8, 0, { side: T.TRACERY, top: null }, STONE, 0);
  b.box(tx + sq / 2 + 0.35, Y + 14, 0, 0.7, 12, 8, 0, { side: T.TRACERY, top: null }, STONE, 0);
  // the main portal
  b.box(tx, Y, -sq / 2 - 0.5, 7.5, 10, 0.9, 0, { side: T.ARCADE, top: null }, [1, 1, 1], 0);
  // second stage windows
  for (const [dx, dz, along] of [[0, -(sq - 1.6) / 2 - 0.35, true], [0, (sq - 1.6) / 2 + 0.35, true],
                                 [-(sq - 1.6) / 2 - 0.35, 0, false], [(sq - 1.6) / 2 + 0.35, 0, false]]) {
    b.box(tx + dx, Y + 30, dz, along ? 9 : 0.7, 16, along ? 0.7 : 9, 0, { side: T.TRACERY, top: null }, STONE, 0);
  }
  // belfry openings of the top stage
  for (const [dx, dz, along] of [[0, -(sq - 3.2) / 2 - 0.35, true], [0, (sq - 3.2) / 2 + 0.35, true],
                                 [-(sq - 3.2) / 2 - 0.35, 0, false], [(sq - 3.2) / 2 + 0.35, 0, false]]) {
    b.box(tx + dx, Y + 54, dz, along ? 10 : 0.7, 13, along ? 0.7 : 10, 0, { side: T.LANCET, top: null }, STONE, 0);
  }

  // the platform Maximilian climbed in 1492, with its parapet
  b.box(tx, Y + 70, 0, sq - 1.5, 1.8, sq - 1.5, 0, { side: T.ASHLAR, top: T.WALKWAY }, STONE_D, 4);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const px = tx + Math.cos(a) * (sq - 1.5) / 2, pz = Math.sin(a) * (sq - 1.5) / 2;
    b.box(px, Y + 71.8, pz, i % 2 ? 1.0 : sq - 1.5, 1.5, i % 2 ? sq - 1.5 : 1.0, 0,
      { side: T.ASHLAR, top: T.ASHLAR }, STONE, 3);
  }

  // the octagon, broken off after about five metres, and its makeshift roof
  b.prism(tx, Y + 71.8, 0, 8.6, 5.4, 8, Math.PI / 8, { side: T.ASHLAR, top: null }, STONE, 4, false);
  b.prism(tx, Y + 77.2, 0, 9.0, 1.0, 8, Math.PI / 8, { side: T.ASHLAR, top: null }, STONE_D, 3, false);
  b.spire(tx, Y + 78.2, 0, 9.2, 9.5, 8, Math.PI / 8, T.SHINGLE, [0.66, 0.63, 0.56]);
  // a weather-vane on the makeshift roof
  b.box(tx, Y + 87.7, 0, 0.28, 3.2, 0.28, 0, { side: T.PLANK, top: null }, [0.3, 0.28, 0.25]);
  b.quad([tx, Y + 90.2, 0], [tx, Y + 90.2, 1.8], [tx, Y + 89.0, 1.8], [tx, Y + 89.0, 0],
    T.BLANK, [0.25, 0.24, 0.22], 1, 1);

  // --------------------------------------------------- the building works --
  // The lodge (Bauhuette) was still at work: scaffolding stands against the
  // tower and a treadwheel crane sits on the platform.
  const WOOD = [0.78, 0.66, 0.45];
  const scaf = (x, z, y0, h, w, d) => {
    for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      b.box(x + dx, y0, z + dz, 0.3, h, 0.3, 0, { side: T.PLANK, top: null }, WOOD);
    }
    for (let k = 1; k * 5 < h; k++) {
      b.box(x, y0 + k * 5, z, w + 0.5, 0.26, 0.3, 0, { side: T.PLANK, top: T.PLANK }, WOOD);
      b.box(x, y0 + k * 5, z, 0.3, 0.26, d + 0.5, 0, { side: T.PLANK, top: T.PLANK }, WOOD);
      if (k % 2 === 0) b.box(x, y0 + k * 5 - 0.2, z, w, 0.22, d, 0, { side: T.PLANK, top: T.PLANK }, [0.72, 0.62, 0.44]);
    }
  };
  // the working stage sits round the top, where the octagon was abandoned
  scaf(tx - sq / 2 - 2.2, 0, Y + 44, 34, 2.6, 10);
  scaf(tx, -sq / 2 - 2.2, Y + 44, 34, 10, 2.6);
  // a hoist mast beside the lodge below
  b.box(tx - sq / 2 - 6, Y, 16, 0.4, 26, 0.4, 0, { side: T.PLANK, top: null }, WOOD);

  // treadwheel crane on the platform
  const cx = tx + 4, cy = Y + 71.8, cz = 0;
  b.box(cx, cy, cz, 7, 0.7, 5.5, 0, { side: T.PLANK, top: T.PLANK }, [0.62, 0.54, 0.4]);
  for (const s of [-1, 1]) b.box(cx, cy, cz + s * 2.2, 0.5, 5, 0.5, 0, { side: T.PLANK, top: null }, [0.5, 0.43, 0.32]);
  b.prism(cx, cy + 2.2, cz, 2.6, 2.4, 10, 0, { side: T.PLANK, top: T.PLANK }, [0.58, 0.5, 0.37], 0, true);
  b.box(cx + 5.5, cy + 4.4, cz, 11, 0.5, 0.5, 0.22, { side: T.PLANK, top: null }, [0.5, 0.43, 0.32]);
  b.box(cx + 10.5, cy, cz + 2.4, 0.16, 4.4, 0.16, 0, { side: T.PLANK, top: null }, [0.3, 0.27, 0.22]);

  // stacks of dressed stone and a lodge shed on the north side
  for (let i = 0; i < 7; i++) {
    const px = westX + 18 + rng() * 56, pz = -aisleHalf - 6 - rng() * 12;
    b.box(px, Y, pz, 2.4 + rng() * 2, 1.2 + rng() * 1.4, 1.6 + rng(), rng(), { side: T.ASHLAR, top: T.ASHLAR }, STONE_D, 3);
  }
  b.box(westX + 26, Y, -aisleHalf - 16, 16, 4.5, 9, 0.05, { side: T.PLANK, top: null }, [0.68, 0.6, 0.46], 4);
  b.gableRoof(westX + 26, Y + 4.5, -aisleHalf - 16, 16, 9, 3.6, 0, T.SHINGLE, [0.78, 0.76, 0.7], 0.7);

  return b;
}
