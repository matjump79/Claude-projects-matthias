// Geometry builder. Everything in the city is accumulated into a few large
// flat-shaded buffers that share the single texture atlas, which keeps the
// draw-call count in the low dozens.
import { uvOf } from './atlas.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

export class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; }

  get triangles() { return this.pos.length / 9; }

  tri(a, b, c, uva, uvb, uvc, color) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const P = this.pos, N = this.nrm, U = this.uv, C = this.col;
    for (const [p, t] of [[a, uva], [b, uvb], [c, uvc]]) {
      P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]);
      U.push(t[0], t[1]); C.push(color[0], color[1], color[2]);
    }
  }

  // Quad a-b-c-d (counter-clockwise seen from the front). `nu`/`nv` repeat the
  // atlas tile across the face instead of stretching it.
  quad(a, b, c, d, tile, color = [1, 1, 1], nu = 1, nv = 1) {
    const r = uvOf(tile);
    const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
        const P = (u, v) => lerp3(lerp3(a, b, u), lerp3(d, c, u), v);
        const p00 = P(u0, v0), p10 = P(u1, v0), p11 = P(u1, v1), p01 = P(u0, v1);
        const t00 = [r.u0, r.v0], t10 = [r.u1, r.v0], t11 = [r.u1, r.v1], t01 = [r.u0, r.v1];
        this.tri(p00, p10, p11, t00, t10, t11, color);
        this.tri(p00, p11, p01, t00, t11, t01, color);
      }
    }
  }

  // Axis-aligned-ish box, optionally rotated about Y. Origin is the centre of
  // the footprint, y0 the base height.
  box(cx, y0, cz, sx, h, sz, rotY, tiles, color = [1, 1, 1], uvScale = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const pt = (dx, dz, y) => [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
    const hx = sx / 2, hz = sz / 2, y1 = y0 + h;
    const A = pt(-hx, -hz, y0), B = pt(hx, -hz, y0), C = pt(hx, hz, y0), D = pt(-hx, hz, y0);
    const A1 = pt(-hx, -hz, y1), B1 = pt(hx, -hz, y1), C1 = pt(hx, hz, y1), D1 = pt(-hx, hz, y1);
    const side = tiles.side, top = tiles.top ?? tiles.side;
    const nx = uvScale ? Math.max(1, Math.round(sx / uvScale)) : 1;
    const nz = uvScale ? Math.max(1, Math.round(sz / uvScale)) : 1;
    const ny = uvScale ? Math.max(1, Math.round(h / uvScale)) : 1;
    const sideCol = color;
    this.quad(A, B, B1, A1, side, sideCol, nx, ny);
    this.quad(B, C, C1, B1, side, sideCol, nz, ny);
    this.quad(C, D, D1, C1, side, sideCol, nx, ny);
    this.quad(D, A, A1, D1, side, sideCol, nz, ny);
    if (tiles.top !== null) this.quad(A1, B1, C1, D1, top, tiles.topColor ?? color, nx, nz);
    if (tiles.bottom) this.quad(D, C, B, A, tiles.bottom, color, nx, nz);
  }

  // Gabled roof running along local X (ridge parallel to the X axis before
  // rotation). `over` extends the eaves past the walls.
  gableRoof(cx, y0, cz, sx, sz, rise, rotY, tile, color, over = 0.5, gableTile = null, gableColor = null) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const pt = (dx, dz, y) => [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
    const hx = sx / 2 + over, hz = sz / 2 + over;
    const y1 = y0 + rise;
    const eaveA = pt(-hx, -hz, y0), eaveB = pt(hx, -hz, y0);
    const eaveC = pt(hx, hz, y0), eaveD = pt(-hx, hz, y0);
    const ridgeA = pt(-hx, 0, y1), ridgeB = pt(hx, 0, y1);
    const n = Math.max(1, Math.round(sx / 6));
    const m = Math.max(1, Math.round((hz * 1.3) / 5));
    this.quad(eaveA, eaveB, ridgeB, ridgeA, tile, color, n, m);
    this.quad(eaveC, eaveD, ridgeA, ridgeB, tile, color, n, m);
    // gable triangles closing the ends
    const gt = gableTile ?? tile, gc = gableColor ?? color;
    const gA = pt(-sx / 2, -sz / 2, y0), gB = pt(-sx / 2, sz / 2, y0), gR = pt(-sx / 2, 0, y1);
    const gC = pt(sx / 2, -sz / 2, y0), gD = pt(sx / 2, sz / 2, y0), gR2 = pt(sx / 2, 0, y1);
    const r = uvOf(gt);
    this.tri(gB, gA, gR, [r.u0, r.v0], [r.u1, r.v0], [(r.u0 + r.u1) / 2, r.v1], gc);
    this.tri(gC, gD, gR2, [r.u0, r.v0], [r.u1, r.v0], [(r.u0 + r.u1) / 2, r.v1], gc);
  }

  // Hip roof: ridge shortened at both ends, four slopes.
  hipRoof(cx, y0, cz, sx, sz, rise, rotY, tile, color, over = 0.5, ridgeFrac = 0.45) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const pt = (dx, dz, y) => [cx + dx * c - dz * s, y, cz + dx * s + dz * c];
    const hx = sx / 2 + over, hz = sz / 2 + over, y1 = y0 + rise;
    const rx = (sx / 2) * ridgeFrac;
    const A = pt(-hx, -hz, y0), B = pt(hx, -hz, y0), C = pt(hx, hz, y0), D = pt(-hx, hz, y0);
    const R1 = pt(-rx, 0, y1), R2 = pt(rx, 0, y1);
    const n = Math.max(1, Math.round(sx / 6)), m = Math.max(1, Math.round(hz / 5));
    this.quad(A, B, R2, R1, tile, color, n, m);
    this.quad(C, D, R1, R2, tile, color, n, m);
    const r = uvOf(tile);
    this.tri(B, C, R2, [r.u0, r.v0], [r.u1, r.v0], [(r.u0 + r.u1) / 2, r.v1], color);
    this.tri(D, A, R1, [r.u0, r.v0], [r.u1, r.v0], [(r.u0 + r.u1) / 2, r.v1], color);
  }

  // Regular prism (towers, apses, spire bases).
  prism(cx, y0, cz, r, h, sides, rot, tiles, color = [1, 1, 1], uvScale = 0, closeTop = true) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
    const y1 = y0 + h;
    const per = (2 * Math.PI * r) / sides;
    const nu = uvScale ? Math.max(1, Math.round(per / uvScale)) : 1;
    const nv = uvScale ? Math.max(1, Math.round(h / uvScale)) : 1;
    for (let i = 0; i < sides; i++) {
      const p = pts[i], q = pts[(i + 1) % sides];
      this.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], tiles.side, color, nu, nv);
    }
    if (closeTop && tiles.top != null) {
      const r2 = uvOf(tiles.top);
      const cUV = [(r2.u0 + r2.u1) / 2, (r2.v0 + r2.v1) / 2];
      for (let i = 0; i < sides; i++) {
        const p = pts[i], q = pts[(i + 1) % sides];
        this.tri([cx, y1, cz], [p[0], y1, p[1]], [q[0], y1, q[1]], cUV, [r2.u0, r2.v0], [r2.u1, r2.v0], tiles.topColor ?? color);
      }
    }
    return pts;
  }

  // Pyramid / conical spire.
  spire(cx, y0, cz, r, h, sides, rot, tile, color = [1, 1, 1], tipOffset = 0) {
    const r0 = uvOf(tile);
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2, b = rot + ((i + 1) / sides) * Math.PI * 2;
      const p = [cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r];
      const q = [cx + Math.cos(b) * r, y0, cz + Math.sin(b) * r];
      this.tri(p, q, [cx, y0 + h, cz + tipOffset], [r0.u0, r0.v0], [r0.u1, r0.v0], [(r0.u0 + r0.u1) / 2, r0.v1], color);
    }
  }

  // Flat horizontal patch (ground, water, market squares).
  plane(x0, z0, x1, z1, y, tile, color = [1, 1, 1], nu = 1, nv = 1) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], tile, color, nu, nv);
  }

  // Arbitrary convex/simple polygon, triangulated as a fan, laid flat at y.
  polyFlat(points, y, tile, color = [1, 1, 1], uvScale = 30) {
    const r = uvOf(tile);
    const span = uvScale;
    const uvFor = (p) => [
      r.u0 + ((p[0] / span) % 1 + 1) % 1 * (r.u1 - r.u0),
      r.v0 + ((p[1] / span) % 1 + 1) % 1 * (r.v1 - r.v0),
    ];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[0], b = points[i], c = points[i + 1];
      this.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], uvFor(a), uvFor(b), uvFor(c), color);
    }
  }

  // Extruded strip along a polyline (walls, quays, bridges, river banks).
  strip(points, y0, h, width, tile, color = [1, 1, 1], uvScale = 6, capTop = true, topTile = null) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * (width / 2), nz = (dx / len) * (width / 2);
      const y1 = y0 + h;
      const A = [x0 - nx, y0, z0 - nz], B = [x1 - nx, y0, z1 - nz];
      const C = [x1 + nx, y0, z1 + nz], D = [x0 + nx, y0, z0 + nz];
      const A1 = [A[0], y1, A[2]], B1 = [B[0], y1, B[2]], C1 = [C[0], y1, C[2]], D1 = [D[0], y1, D[2]];
      const nu = Math.max(1, Math.round(len / uvScale)), nv = Math.max(1, Math.round(h / uvScale));
      this.quad(A, B, B1, A1, tile, color, nu, nv);
      this.quad(C, D, D1, C1, tile, color, nu, nv);
      if (capTop) this.quad(A1, B1, C1, D1, topTile ?? tile, color, nu, 1);
    }
  }

  merge(other) {
    // chunked: spreading million-element arrays into push overflows the stack
    const app = (dst, src) => {
      for (let i = 0; i < src.length; i += 8192) {
        dst.push(...src.slice(i, i + 8192));
      }
    };
    app(this.pos, other.pos); app(this.nrm, other.nrm);
    app(this.uv, other.uv); app(this.col, other.col);
  }

  build(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// Small colour helpers -------------------------------------------------------
export const tint = (r, g, b) => [r, g, b];
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
export function jitter(c, rng, amt = 0.08) {
  const f = 1 + (rng() - 0.5) * amt * 2;
  const w = 1 + (rng() - 0.5) * amt;
  return [Math.min(1.4, c[0] * f), Math.min(1.4, c[1] * f * w), Math.min(1.4, c[2] * f)];
}
