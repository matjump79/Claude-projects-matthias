// geom.js — a small triangle-soup builder.
//
// Everything in the town is accumulated into a handful of big buffers rather
// than thousands of Meshes: at 8K, in a software rasteriser, draw calls are the
// thing that kills you. Colour is carried per-vertex, so one material can serve
// limewash, oak, thatch, tile and stone at once.

import * as THREE from '../vendor/three.module.js';

export class Mesher {
  // Geometry is written into named CHANNELS, one per material. A roof and the
  // wall under it are built by the same call but have to be shaded by different
  // textures, so they cannot share a buffer.
  //
  //   ch      the channel ordinary surfaces go to (walls, stone, ground, ...)
  //   roofCh  the channel a roof SLOPE goes to; a gable END stays on `ch`,
  //           because a gable end is wall, not roof
  constructor(channel = 'main') {
    this.b = {};
    this.ch = channel;
    this.roofCh = 'roofTile';
    this.tris = 0;
    this.buf(channel);
  }

  buf(name) {
    let b = this.b[name];
    if (!b) b = this.b[name] = { pos: [], nrm: [], col: [], uv: [], tris: 0 };
    return b;
  }

  channel(name) { this.ch = name; return this; }
  roof(name) { this.roofCh = name; return this; }

  // the 'main' channel's arrays, so older code that pokes at them still works
  get pos() { return this.buf(this.ch).pos; }
  get nrm() { return this.buf(this.ch).nrm; }
  get col() { return this.buf(this.ch).col; }
  get uv() { return this.buf(this.ch).uv; }

  // Triangles are given in the order that reads naturally when you lay a face
  // out on paper — a, b, c going round the outside of it. In this coordinate
  // frame (+X east, +Y up, +Z south) that order winds the wrong way for
  // three.js, which would cull every roof and leave the ground invisible, so
  // the vertices are emitted a, c, b and the normal is taken to match.
  tri(a, b, c, color, uvs, channel) {
    const t = this.buf(channel || this.ch);
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, c, b]) t.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 3; i++) t.nrm.push(nx, ny, nz);
    for (let i = 0; i < 3; i++) t.col.push(color[0], color[1], color[2]);
    if (uvs) t.uv.push(uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]);
    else t.uv.push(0, 0, 1, 1, 1, 0);
    t.tris++; this.tris++;
  }

  quad(a, b, c, d, color, scale = 1, channel) {
    // uv scaled by world size so textures keep a constant grain
    const w = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * scale;
    const h = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) * scale;
    this.tri(a, b, c, color, [0, 0, w, 0, w, h], channel);
    this.tri(a, c, d, color, [0, 0, w, h, 0, h], channel);
  }

  /** Axis-aligned-in-local box, yawed by rot about its centre. */
  box(cx, y0, cz, w, d, h, rot, color, opts = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2, hd = d / 2, y1 = y0 + h;
    const P = (lx, lz, ly) => [cx + lx * c - lz * s, ly, cz + lx * s + lz * c];
    const A = P(-hw, -hd, y0), B = P(hw, -hd, y0), C = P(hw, hd, y0), D = P(-hw, hd, y0);
    const E = P(-hw, -hd, y1), F = P(hw, -hd, y1), G = P(hw, hd, y1), H = P(-hw, hd, y1);
    const col = color, sc = opts.uvScale ?? 1;
    this.quad(A, B, F, E, col, sc);
    this.quad(B, C, G, F, col, sc);
    this.quad(C, D, H, G, col, sc);
    this.quad(D, A, E, H, col, sc);
    if (opts.top !== false) this.quad(E, F, G, H, opts.topColor || col, sc);
    if (opts.bottom) this.quad(D, C, B, A, col, sc);
    return { A, B, C, D, E, F, G, H, P, y1 };
  }

  /** Gabled roof sitting on a w x d footprint. Ridge runs along the local X. */
  gable(cx, y0, cz, w, d, rise, rot, roofCol, gableCol, overhang = 0.5) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const P = (lx, lz, ly) => [cx + lx * c - lz * s, ly, cz + lx * s + lz * c];
    const y1 = y0 + rise;
    const A = P(-hw, -hd, y0), B = P(hw, -hd, y0), C = P(hw, hd, y0), D = P(-hw, hd, y0);
    const R0 = P(-hw, 0, y1), R1 = P(hw, 0, y1);
    this.quad(A, B, R1, R0, roofCol, 1.6, this.roofCh);
    this.quad(C, D, R0, R1, roofCol, 1.6, this.roofCh);
    // gable ends (the triangles) — these are wall, not roof
    this.tri(B, C, R1, gableCol);
    this.tri(D, A, R0, gableCol);
    return { ridge: [R0, R1], y1 };
  }

  /** Hipped roof. */
  hip(cx, y0, cz, w, d, rise, rot, roofCol, overhang = 0.4) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const hw = w / 2 + overhang, hd = d / 2 + overhang;
    const P = (lx, lz, ly) => [cx + lx * c - lz * s, ly, cz + lx * s + lz * c];
    const y1 = y0 + rise;
    const ridgeHalf = Math.max(0.1, hw - hd);
    const A = P(-hw, -hd, y0), B = P(hw, -hd, y0), C = P(hw, hd, y0), D = P(-hw, hd, y0);
    const R0 = P(-ridgeHalf, 0, y1), R1 = P(ridgeHalf, 0, y1);
    this.quad(A, B, R1, R0, roofCol, 1.6, this.roofCh);
    this.quad(C, D, R0, R1, roofCol, 1.6, this.roofCh);
    this.tri(B, C, R1, roofCol, null, this.roofCh);
    this.tri(D, A, R0, roofCol, null, this.roofCh);
    return { y1 };
  }

  /** A flat card with UVs running 0..1 across it — a foliage billboard. */
  card(cx, cy, cz, w, h, yaw, tilt, color, channel) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    // local axes: u across the card, v up it (tilted back by `tilt`)
    const ux = c * w / 2, uz = s * w / 2;
    const vx = -s * ct * h / 2, vy = st * h / 2, vz = c * ct * h / 2;
    const A = [cx - ux - vx, cy - vy, cz - uz - vz];
    const B = [cx + ux - vx, cy - vy, cz + uz - vz];
    const C = [cx + ux + vx, cy + vy, cz + uz + vz];
    const D = [cx - ux + vx, cy + vy, cz - uz + vz];
    const ch = channel || this.ch;
    this.tri(A, B, C, color, [0, 0, 1, 0, 1, 1], ch);
    this.tri(A, C, D, color, [0, 0, 1, 1, 0, 1], ch);
  }

  /** Pyramid / broach spire on a square or polygonal base. */
  spire(cx, y0, cz, r, h, rot, color, sides = 4) {
    const apex = [cx, y0 + h, cz];
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2;
      const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      const k = sides === 4 ? Math.SQRT2 : 1;
      const p0 = [cx + Math.cos(a0) * r * k, y0, cz + Math.sin(a0) * r * k];
      const p1 = [cx + Math.cos(a1) * r * k, y0, cz + Math.sin(a1) * r * k];
      this.tri(p0, p1, apex, color);
    }
  }

  /** Prism (tower, column, chimney) with n sides. */
  prism(cx, y0, cz, r, h, rot, color, sides = 8, taper = 1) {
    const y1 = y0 + h;
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2;
      const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const q0 = [cx + Math.cos(a0) * r * taper, y1, cz + Math.sin(a0) * r * taper];
      const q1 = [cx + Math.cos(a1) * r * taper, y1, cz + Math.sin(a1) * r * taper];
      this.quad(p0, p1, q1, q0, color, 1);
    }
    // cap
    const cap = [cx, y1, cz];
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2;
      const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      this.tri([cx + Math.cos(a0) * r * taper, y1, cz + Math.sin(a0) * r * taper],
               [cx + Math.cos(a1) * r * taper, y1, cz + Math.sin(a1) * r * taper], cap, color);
    }
  }

  /** A flat ribbon following a polyline — streets, water, ditches. */
  ribbon(pts, width, y, color, jitter = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L, nz = dx / L;
      const w0 = width / 2 * (1 + (jitter ? (Math.sin(i * 2.3) * jitter) : 0));
      const w1 = width / 2 * (1 + (jitter ? (Math.sin((i + 1) * 2.3) * jitter) : 0));
      this.quad(
        [a.x - nx * w0, y, a.z - nz * w0],
        [b.x - nx * w1, y, b.z - nz * w1],
        [b.x + nx * w1, y, b.z + nz * w1],
        [a.x + nx * w0, y, a.z + nz * w0],
        color, 0.25,
      );
    }
  }

  /** A vertical curtain following a polyline: town walls, revetments. */
  curtain(pts, thickness, y0, h, color, capColor, close = true) {
    const n = pts.length;
    const last = close ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * thickness / 2, nz = dx / L * thickness / 2;
      const A = [a.x - nx, y0, a.z - nz], B = [b.x - nx, y0, b.z - nz];
      const C = [b.x + nx, y0, b.z + nz], D = [a.x + nx, y0, a.z + nz];
      const E = [a.x - nx, y0 + h, a.z - nz], F = [b.x - nx, y0 + h, b.z - nz];
      const G = [b.x + nx, y0 + h, b.z + nz], H = [a.x + nx, y0 + h, a.z + nz];
      this.quad(A, B, F, E, color, 0.5);
      this.quad(C, D, H, G, color, 0.5);
      this.quad(E, F, G, H, capColor || color, 0.5);
    }
  }

  /** Convex polygon fan, flat at height y. */
  poly(pts, y, color) {
    for (let i = 1; i < pts.length - 1; i++) {
      this.tri([pts[0].x, y, pts[0].z], [pts[i].x, y, pts[i].z], [pts[i + 1].x, y, pts[i + 1].z], color);
    }
  }

  /** One channel as a BufferGeometry, or null if nothing was written to it. */
  geometry(channel) {
    const b = this.b[channel || this.ch];
    if (!b || !b.tris) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    // No tangent attribute: the geometry is non-indexed triangle soup with
    // per-face UVs, so three falls back to deriving the tangent frame in the
    // fragment shader, which is what we want here anyway.
    g.computeBoundingSphere();
    return g;
  }

  /** Every non-empty channel, as { name: BufferGeometry }. */
  geometries() {
    const out = {};
    for (const name of Object.keys(this.b)) {
      const geo = this.geometry(name);
      if (geo) out[name] = geo;
    }
    return out;
  }
}

/** Multiply a colour triple, for shading variation. */
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** Mix two colour triples. */
export const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** sRGB hex to linear-ish triple. three's renderer works in linear space. */
export function hex(h) {
  const r = ((h >> 16) & 255) / 255, g = ((h >> 8) & 255) / 255, b = (h & 255) / 255;
  const f = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
}

/** Distance from point to a polyline, and the parametric position along it. */
export function distToPolyline(x, z, pts) {
  let best = Infinity, bestT = 0, acc = 0, total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz || 1;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestT = (acc + Math.sqrt(L2) * t) / (total || 1); }
    acc += Math.sqrt(L2);
  }
  return { d: best, t: bestT, length: total };
}

/** Is (x,z) inside the closed polygon? */
export function inPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Shrink a closed polygon toward its centroid. */
export function shrink(poly, metres) {
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  cx /= poly.length; cz /= poly.length;
  return poly.map((p) => {
    const dx = p.x - cx, dz = p.z - cz;
    const L = Math.hypot(dx, dz) || 1;
    const k = Math.max(0, (L - metres)) / L;
    return { x: cx + dx * k, z: cz + dz * k };
  });
}
