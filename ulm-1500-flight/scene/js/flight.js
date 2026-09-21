// ---------------------------------------------------------------------------
// The flight. A single unbroken camera move, in the manner of an aerial shot:
// in from the south-east over the Danube -- the viewpoint of the oldest
// surviving picture of Ulm, the woodcut in Hartmann Schedel's world chronicle
// of 1493 -- then down to the bridge, along the river wall, over the fishermen's
// quarter, round the Minster, across the market, out over the fields, and up
// again for the wide final view.
// ---------------------------------------------------------------------------
import { fbm2 } from './rng.js';

// t is seconds. Each key gives the camera's position and what it looks at.
export const KEYS = [
  { t: 0,    pos: [1750, 520, 2050], look: [-60, 120, 200] },
  { t: 9,    pos: [1180, 430, 1560], look: [-60, 110, 220] },
  { t: 17,   pos: [760, 330, 1180], look: [-40, 90, 260] },
  { t: 25,   pos: [430, 215, 880],  look: [40, 60, 380] },      // the bridge comes up
  { t: 32,   pos: [232, 118, 690],  look: [96, 40, 430] },
  { t: 38,   pos: [150, 74, 545],   look: [-60, 30, 430] },      // low over the Herdbrucke
  { t: 45,   pos: [-40, 66, 520],   look: [-240, 26, 415] },     // along the Danube wall
  { t: 52,   pos: [-250, 72, 505],  look: [-420, 24, 400] },     // past Metzgerturm, Adlerbastei
  { t: 59,   pos: [-430, 96, 470],  look: [-300, 20, 350] },
  { t: 66,   pos: [-420, 104, 330], look: [-180, 18, 330] },     // banking over the Blau
  { t: 73,   pos: [-260, 118, 300], look: [-30, 40, 200] },      // the fishermen's lanes
  { t: 81,   pos: [-170, 170, 300], look: [0, 52, 60] },         // the Minster rises ahead
  { t: 90,   pos: [-330, 215, 120], look: [-20, 56, 0] },        // west front, the great tower
  { t: 99,   pos: [-260, 240, -230], look: [-10, 52, 0] },       // orbit: north side
  { t: 108,  pos: [110, 235, -300], look: [10, 50, 0] },
  { t: 116,  pos: [340, 210, -80],  look: [20, 48, 10] },        // choir and its stumpy towers
  { t: 124,  pos: [180, 165, 170],  look: [-40, 40, 180] },      // down towards the market
  { t: 131,  pos: [20, 120, 260],   look: [-60, 22, 196] },      // the town hall
  { t: 139,  pos: [-150, 130, 180], look: [-300, 30, -60] },
  { t: 147,  pos: [-330, 175, -60], look: [-420, 40, -330] },    // out over the north-west wall
  { t: 155,  pos: [-430, 240, -330], look: [-700, 30, -800] },   // the fields and bleaching greens
  { t: 163,  pos: [-380, 330, -680], look: [-100, 40, -200] },
  { t: 172,  pos: [80, 430, -760],  look: [0, 50, 100] },        // climbing, turning back
  { t: 182,  pos: [620, 560, -320], look: [-40, 60, 260] },
  { t: 192,  pos: [980, 660, 420],  look: [-80, 50, 260] },
  { t: 202,  pos: [1180, 740, 1150], look: [-100, 60, 240] },    // the wide farewell
  { t: 212,  pos: [1420, 830, 1720], look: [-120, 70, 220] },
];

export const DURATION = 212;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function sampleSpline(keys, field, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const span = k2.t - k1.t || 1;
  let u = (t - k1.t) / span;
  u = Math.max(0, Math.min(1, u));
  // ease within each leg so the move breathes instead of running at one speed
  const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
  return [0, 1, 2].map((a) => catmull(k0[field][a], k1[field][a], k2[field][a], k3[field][a], e));
}

export function cameraAt(t) {
  const tt = Math.max(0, Math.min(DURATION, t));
  const pos = sampleSpline(KEYS, 'pos', tt);
  const look = sampleSpline(KEYS, 'look', tt);
  // a slow drift, as if the camera were carried rather than driven
  const n = (s, o) => (fbm2(tt * s + o, o * 1.7, 3, 3) - 0.5);
  pos[0] += n(0.06, 3) * 9;
  pos[1] += n(0.05, 11) * 5;
  pos[2] += n(0.06, 21) * 9;
  look[0] += n(0.04, 31) * 8;
  look[1] += n(0.045, 41) * 5;
  // a touch of roll into the turns, taken from how fast the heading changes
  const h0 = heading(tt - 0.4), h1 = heading(tt + 0.4);
  let dh = h1 - h0;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const roll = Math.max(-0.34, Math.min(0.34, dh * 1.1));
  const fov = 47 + Math.sin(tt * 0.021) * 3;
  return { pos, look, roll, fov };
}

function heading(t) {
  const tt = Math.max(0, Math.min(DURATION, t));
  const p = sampleSpline(KEYS, 'pos', tt);
  const l = sampleSpline(KEYS, 'look', tt);
  return Math.atan2(l[2] - p[2], l[0] - p[0]);
}
