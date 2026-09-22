// sky.js — a July morning over the Seine plain.
//
// Late July, a little after eight. The sun is about 30 degrees up in the
// east-south-east, so the light rakes in from the right of frame and every
// roof-ridge throws a shadow nearly twice its own height to the west. There is
// river haze in the bottom of the valley, and smoke: a town of twenty thousand
// cooking breakfast, plus the tanners' fires and the limekilns at the cathedral.

import * as THREE from '../vendor/three.module.js';
import { hex } from './geom.js';

// Where the sun actually stands over Troyes (48.30 N, 4.08 E) during the Hot
// Fair. Solar declination on 24 July is about +19.8 deg, so
//     sin(alt) = sin(48.3)sin(19.8) + cos(48.3)cos(19.8)cos(H)
// gives altitude 30 deg at an hour angle of about 67 deg — mid-morning, three
// or four hours after sunrise, with the fair in full cry. The azimuth works out
// at 93 deg, within a few degrees of due east. Shadows run about 1.7 times the
// height of what casts them, which is enough to model every roof without
// dropping the yards and the gardens into black.
export const SUN = { azimuthDeg: 93, altitudeDeg: 30 };

/** Unit vector pointing from the scene toward the sun. */
export function sunDirection() {
  const az = SUN.azimuthDeg * Math.PI / 180;
  const al = SUN.altitudeDeg * Math.PI / 180;
  return new THREE.Vector3(
    Math.cos(al) * Math.sin(az),
    Math.sin(al),
    -Math.cos(al) * Math.cos(az),
  );
}

function skyTexture(w = 2048, h = 1024) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');

  // the vertical gradient: deep at the zenith, bleached and warm at the horizon
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.00, '#3a68a4');
  g.addColorStop(0.26, '#6a97c6');
  g.addColorStop(0.50, '#a4c2da');
  g.addColorStop(0.70, '#d0d7d4');
  g.addColorStop(0.86, '#e6dcc0');
  g.addColorStop(1.00, '#e2d2ac');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // the sun's own glow, at azimuth 95 deg. u = 0 is north, increasing eastward.
  const su = ((SUN.azimuthDeg / 360) % 1) * w;
  const sv = h * (1 - SUN.altitudeDeg / 90) * 0.5;
  const glow = ctx.createRadialGradient(su, sv, 0, su, sv, w * 0.24);
  glow.addColorStop(0, 'rgba(255,246,214,0.97)');
  glow.addColorStop(0.14, 'rgba(255,236,190,0.55)');
  glow.addColorStop(1, 'rgba(255,230,184,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // fair-weather cumulus, well up and thinning toward the horizon
  const puff = (cx, cy, r, a) => {
    const rg = ctx.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy, r);
    rg.addColorStop(0, `rgba(255,255,252,${a})`);
    rg.addColorStop(0.55, `rgba(246,245,240,${a * 0.75})`);
    rg.addColorStop(1, 'rgba(232,231,226,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.3); ctx.fill();
  };
  for (let i = 0; i < 46; i++) {
    const cx = Math.random() * w;
    const cy = h * (0.10 + Math.random() * 0.44);
    const s = 26 + Math.random() * 90;
    const a = 0.30 + Math.random() * 0.5;
    const lobes = 3 + Math.floor(Math.random() * 5);
    for (let k = 0; k < lobes; k++) {
      puff(cx + (Math.random() - 0.5) * s * 2.4, cy + (Math.random() - 0.5) * s * 0.5,
           s * (0.5 + Math.random() * 0.6), a);
    }
    // a flat grey base
    ctx.fillStyle = `rgba(178,184,190,${a * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.42, s * 1.5, s * 0.20, 0, 0, 6.3);
    ctx.fill();
  }

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildSky(scene, radius = 9000) {
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -1;
  scene.add(dome);

  // the haze the town sits in
  scene.fog = new THREE.FogExp2(0xd8d2ba, 0.000245);
  return dome;
}

/** Smoke rising from roofs, the limekilns and the tanners' fires.
 *
 * Built as camera-facing sprites rather than geometry. Flat quads standing in
 * the world look like panes of glass the moment the camera moves off their
 * plane, which at this scale is most of the time.
 */
export function buildSmoke(rng, groundHeight) {
  const cols = [];
  const put = (x, z, h, w, strength) => cols.push({ x, z, h, w, strength });

  // the limekilns and the masons' fires on the cathedral site
  put(-16, 96, 30, 7, 0.50);
  put(-40, 88, 24, 6, 0.40);
  // the tanners and the fullers, down on the Ru Corde
  put(-702, 302, 24, 7, 0.40);
  put(-664, 282, 20, 6, 0.32);
  put(-742, 326, 18, 6, 0.28);
  // the smiths in the Bourg
  put(-560, 250, 16, 5, 0.26);
  // ordinary hearths, and the fair's cookshops
  for (let i = 0; i < 34; i++) {
    put(-1090 + rng() * 780, -210 + rng() * 730, 11 + rng() * 13, 3.5 + rng() * 4, 0.10 + rng() * 0.13);
  }
  for (let i = 0; i < 10; i++) {
    put(-560 + rng() * 190, 70 + rng() * 150, 10 + rng() * 9, 3.5 + rng() * 3.5, 0.16 + rng() * 0.16);
  }
  return cols;
}

function puffTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeMesh(cols, groundHeight, rng) {
  const group = new THREE.Group();
  const tex = puffTexture();
  for (const c of cols) {
    const y0 = groundHeight(c.x, c.z) + 5;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      // it leans away downwind and spreads as it cools
      const drift = c.h * t * 0.62;
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: new THREE.Color().setHSL(0.09, 0.05, 0.78 - t * 0.06),
        opacity: c.strength * (1 - t * 0.82) * 0.75,
        transparent: true, depthWrite: false, fog: true,
      });
      const sp = new THREE.Sprite(mat);
      const w = c.w * (0.55 + t * 2.1);
      sp.scale.set(w, w * 0.9, 1);
      sp.position.set(c.x - drift, y0 + c.h * t, c.z + drift * 0.35);
      group.add(sp);
    }
  }
  return group;
}
