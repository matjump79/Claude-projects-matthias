// ---------------------------------------------------------------------------
// The city plan of Ulm as it stood around 1500.
//
// Coordinates are metres. +x runs east, +z runs SOUTH, +y is up. The origin is
// the crossing of the Minster, whose long axis runs west-east (liturgical east
// end towards +x), as it does in reality.
//
// The layout follows the topography and the documented shape of the late
// medieval city: a walled town of roughly 85 hectares on the NORTH bank of the
// Danube, with the Blau entering from the west and joining the Danube inside
// the fortifications; the 1480 wall pushed right down to the Danube bank; the
// Herdbrucke, the only bridge, leading south out of the Herdbrucker gate; the
// Minster standing free in the middle of the town, not on the market.
//
// Distances between landmarks are approximate but proportionate: Minster to
// Rathaus c. 200 m, Minster to the Danube c. 430 m, wall circuit c. 3.4 km
// (documented: c. 3,500 m, c. 9 m high, brick).
// ---------------------------------------------------------------------------
import { fbm2, noise2 } from './rng.js';

export const WATER_Y = 0;          // Danube surface = datum
export const TOWN_Y = 7.0;         // the town terrace stands above the river
export const MINSTER_Y = 9.0;

// --------------------------------------------------------------- topography --
// Ulm lies where the Danube leaves the Swabian Alb. North and north-west the
// ground climbs to the Michelsberg and Eselsberg; south of the river the
// ground is flat meadow and field (the future Neu-Ulm, then open country).
export function terrainHeight(x, z) {
  const riverT = riverBandFactor(x, z);           // 1 inside the Danube channel
  let h = 3.0;

  // south bank: flat alluvial plain, rising very gently far to the south
  const south = smooth(430, 1500, z);
  h += south * 9 + smooth(1500, 4200, z) * 55;

  // town terrace on the north bank
  const north = smooth(470, 330, z);
  h += north * (TOWN_Y - 3.0);

  // hills behind the town (Michelsberg / Safranberg / Eselsberg)
  const hill = smooth(-250, -1500, z);
  h += hill * 78;
  h += smooth(-900, -2600, z) * 55;
  // the Alb edge to the west / north-west
  h += smooth(-500, -2200, x) * smooth(200, -1800, z) * 60;
  // Kuhberg, south-west of the town across the Blau mouth
  const kx = (x + 1500) / 900, kz = (z - 500) / 700;
  h += Math.max(0, 1 - (kx * kx + kz * kz)) * 70;

  // gentle undulation everywhere, damped inside the town so streets stay usable
  const townish = insideWallSoft(x, z);
  h += (fbm2(x / 520, z / 520, 4, 11) - 0.5) * 26 * (1 - townish * 0.85);
  h += (fbm2(x / 90, z / 90, 3, 29) - 0.5) * 3.2 * (1 - townish * 0.6);

  // the Blau's own little valley cutting in from the west
  const bl = blauValley(x, z);
  h -= bl * 5.5;

  // carve the Danube channel
  h = h * (1 - riverT) + (WATER_Y - 3.2) * riverT;
  return h;
}

function smooth(a, b, v) { const t = (v - a) / (b - a); return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

// ------------------------------------------------------------------- rivers --
// The Danube, running WSW to ENE past the south side of the town.
export const DANUBE = [
  [-2600, 700], [-1900, 620], [-1350, 560], [-900, 520], [-520, 500],
  [-160, 496], [180, 505], [520, 525], [900, 560], [1400, 620], [2100, 720], [2900, 860],
];
export const DANUBE_HALFWIDTH = [80, 74, 70, 64, 60, 58, 58, 60, 64, 72, 86, 110];

// The Blau, arriving from the west out of the Alb, splitting round the
// fishermen's and tanners' quarter and joining the Danube inside the walls.
export const BLAU = [
  [-1700, 240], [-1300, 250], [-1000, 268], [-760, 288], [-560, 306],
  [-430, 330], [-330, 352], [-230, 372], [-150, 392], [-80, 420], [-30, 455], [-10, 486],
];
export const BLAU_HALFWIDTH = 9;
// the second arm ("Kleine Blau") that makes the quarter an island of lanes
export const BLAU_ARM = [
  [-430, 330], [-360, 318], [-280, 320], [-210, 336], [-150, 358], [-96, 386], [-60, 416],
];

export function polyDistance(pts, x, z) {
  let best = 1e9, bestT = 0, bestI = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - x0) * dx + (z - z0) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t, pz = z0 + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestT = t; bestI = i; }
  }
  return { d: best, i: bestI, t: bestT };
}

function riverBandFactor(x, z) {
  const { d, i, t } = polyDistance(DANUBE, x, z);
  const hw = DANUBE_HALFWIDTH[i] * (1 - t) + DANUBE_HALFWIDTH[Math.min(i + 1, DANUBE_HALFWIDTH.length - 1)] * t;
  const wob = (noise2(x / 130, z / 130, 5) - 0.5) * 12;
  return 1 - smooth(hw * 0.5 + wob, hw + 52 + wob, d);
}

function blauValley(x, z) {
  const { d } = polyDistance(BLAU, x, z);
  return 1 - smooth(20, 190, d);
}

// -------------------------------------------------------------- the circuit --
// The wall: a closed polygon. The southern run stands directly on the Danube
// bank (built 1480), the landward sides are fronted by a ditch and a low
// outer wall (Zwinger).
export const WALL = [
  [-470, 398], [-330, 392], [-180, 394], [-40, 404], [110, 418], [250, 436], [372, 452],
  [430, 404], [452, 300], [466, 170], [470, 30], [452, -110],
  [392, -232], [288, -318], [150, -372], [-10, -390], [-168, -374],
  [-310, -322], [-410, -236], [-470, -120], [-500, 20], [-506, 170], [-492, 296],
];

// Gate positions, each keyed to the wall segment it sits in. Six main gates are
// documented; three survive today (Metzgerturm, Gaenstor, Seelturm/Zundeltor).
export const GATES = {
  herdbrucker: { at: [96, 411], dir: 0.06, name: 'Herdbrucker Tor', big: true },   // south, to the bridge
  gaens: { at: [-436, 396], dir: 0.0, name: 'Gaenstor', big: false },               // south-west, at the Blau mouth
  ehinger: { at: [-503, 96], dir: Math.PI / 2, name: 'Ehinger Tor', big: true },    // west
  goeckler: { at: [-392, -258], dir: Math.PI * 0.72, name: 'Goecklertor', big: false }, // north-west
  neu: { at: [-20, -389], dir: Math.PI * 1.5, name: 'Neutor', big: true },           // north
  frauen: { at: [330, -272], dir: Math.PI * 1.25, name: 'Frauentor', big: false },   // north-east
};

// The leaning Metzgerturm ("butchers' tower", c. 1340) sits in the southern
// wall west of the bridge; the Adlerbastei (c. 1480) stands on the Danube front.
export const METZGERTURM = [-86, 400];
export const ADLERBASTEI = [-236, 393];

// Distance from the wall polygon, positive inside.
export function insideWall(x, z) {
  let inside = false;
  for (let i = 0, j = WALL.length - 1; i < WALL.length; j = i++) {
    const [xi, zi] = WALL[i], [xj, zj] = WALL[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function wallDistance(x, z) {
  const closed = WALL.concat([WALL[0]]);
  return polyDistance(closed, x, z).d;
}
function insideWallSoft(x, z) {
  const d = wallDistance(x, z);
  return insideWall(x, z) ? 1 : 1 - smooth(0, 260, d);
}

// ------------------------------------------------------------------ streets --
// A radial-concentric plan: lanes run from each gate towards the market and the
// Minster, with a lane following the inside of the wall. There is no straight
// boulevard -- the Neue Strasse that cuts through Ulm today was driven through
// the ruins only after 1945.
export const STREETS = [
  // --- the main north-south axis: bridge gate -> market -> Minster -> Neutor
  { w: 9, pts: [[96, 405], [70, 350], [40, 300], [10, 250], [-14, 196], [-24, 150], [-30, 104], [-34, 62]] },
  { w: 8, pts: [[-34, 62], [-46, 10], [-52, -40], [-46, -96], [-34, -150], [-26, -230], [-20, -320], [-20, -382]] },
  // --- the east-west spine south of the Minster (Hirschstrasse / Sattlergasse)
  { w: 8, pts: [[-470, 150], [-390, 152], [-300, 150], [-210, 140], [-130, 128], [-60, 118], [10, 116], [90, 122], [170, 130], [260, 140], [350, 148], [430, 150]] },
  // --- north of the Minster
  { w: 7, pts: [[-300, -80], [-200, -84], [-110, -80], [-20, -74], [80, -70], [180, -72], [280, -84], [380, -100]] },
  // --- from the west gate towards the Minster square
  { w: 7, pts: [[-500, 90], [-420, 82], [-340, 66], [-250, 46], [-170, 28], [-110, 14], [-66, 6]] },
  // --- from the north-west gate down into the town
  { w: 6, pts: [[-396, -254], [-346, -200], [-300, -146], [-250, -96], [-190, -60], [-130, -30], [-80, -10]] },
  // --- from the north-east gate
  { w: 6, pts: [[326, -268], [292, -216], [250, -166], [200, -122], [150, -90], [96, -74]] },
  // --- eastern quarter towards the Wengen convent
  { w: 7, pts: [[90, 122], [160, 104], [230, 84], [290, 60], [330, 20], [352, -30], [362, -90]] },
  // --- the Weinhof and the way down to the Danube wall
  { w: 7, pts: [[-130, 128], [-160, 176], [-186, 220], [-208, 260], [-222, 300], [-230, 350], [-232, 386]] },
  { w: 6, pts: [[-24, 150], [-70, 168], [-124, 186], [-176, 206], [-224, 226], [-280, 244]] },
  // --- fishermen's and tanners' lanes along the Blau
  { w: 5, pts: [[-330, 340], [-270, 336], [-210, 344], [-160, 362], [-120, 382], [-90, 406]] },
  { w: 5, pts: [[-300, 300], [-240, 300], [-186, 312], [-140, 334], [-104, 360], [-76, 390]] },
  { w: 5, pts: [[-352, 366], [-300, 372], [-250, 380], [-200, 388], [-150, 396], [-108, 404]] },
  // --- lanes filling the north-west and north-east quarters
  { w: 6, pts: [[-440, 10], [-380, -20], [-320, -56], [-258, -96], [-200, -140], [-150, -190], [-110, -250]] },
  { w: 6, pts: [[-430, 250], [-380, 208], [-330, 160], [-290, 100], [-262, 30], [-250, -40], [-248, -120]] },
  { w: 6, pts: [[150, -372], [160, -300], [172, -230], [186, -160], [196, -90], [200, -20], [196, 50], [186, 120]] },
  { w: 6, pts: [[430, 150], [420, 60], [410, -20], [396, -100], [372, -180]] },
  { w: 6, pts: [[-360, 392], [-330, 340], [-310, 280], [-296, 220], [-286, 160]] },
  { w: 5, pts: [[250, 436], [240, 380], [232, 320], [222, 260], [212, 200], [204, 150]] },
  { w: 5, pts: [[-60, 118], [-62, 60], [-64, 10], [-70, -40], [-84, -96], [-100, -160]] },
  { w: 5, pts: [[80, -70], [86, -130], [96, -190], [104, -250], [112, -320]] },
  { w: 5, pts: [[-190, 388], [-196, 330], [-200, 270], [-206, 214]] },
  { w: 5, pts: [[300, 442], [296, 390], [292, 330], [286, 270], [280, 210], [272, 150]] },
  { w: 5, pts: [[-470, 330], [-420, 300], [-380, 262], [-350, 216], [-332, 168]] },
];

// Open spaces kept free of houses: the Minster yard, the market, the Weinhof,
// the convent precincts, the timber yard on the Danube bank.
export const SQUARES = [
  { c: [-4, 40], r: 40, tile: 'market', name: 'Kirchhof' },          // the churchyard, not a square
  { c: [-46, 178], r: 52, tile: 'market', name: 'Marktplatz' },
  { c: [-196, 250], r: 44, tile: 'cobble', name: 'Weinhof' },
  { c: [-300, 402], r: 40, tile: 'dirt', name: 'Holzhof' },          // timber landing on the Danube
  { c: [188, 404], r: 44, tile: 'dirt', name: 'Bridge landing' },
];

// ---------------------------------------------------------------- landmarks --
export const MINSTER = { x: 0, z: 0, rot: 0 };
export const RATHAUS = { x: -60, z: 196, rot: 0.06 };                 // "new Kaufhaus" of 1370, town hall from 1419
export const WENGEN = { x: 336, z: -42, rot: 0.12 };                  // Wengen convent (Augustinian canons)
export const FRANCISCAN = { x: -318, z: -140, rot: -0.15 };           // Barfuesser (Franciscan) friary
export const DOMINICAN = { x: 236, z: -196, rot: 0.2 };               // Dominican friary
export const SPITAL = { x: 116, z: 300, rot: 0.04 };                  // Holy Ghost hospital, near the river
export const WEINHOF_PFALZ = { x: -214, z: 268, rot: 0.1 };           // the old royal hall, core of the city

// The bridge: timber deck on stone piers, the only crossing, leading to the
// Bavarian bank and the road to Munich.
export const BRIDGE = { from: [104, 424], to: [150, 616] };
