// palette.js — colours and the two procedural textures the town is built from.
//
// Colour notes for a Champagne town of the mid-13th century:
//  * Walls are wattle-and-daub limewashed off-white to buff, with oak framing
//    left bare and silvered by weather. The black-painted frames people picture
//    are a much later fashion, so the timber here is grey-brown, not black.
//  * Roofs: flat clay tiles (tuile plate) predominate in the rich fair quarter,
//    the counts having every reason to push tile after the fire of 1188. Thatch
//    and oak shingle survive on the edges and the poor streets.
//  * Stone is the local chalky tuffeau-like limestone and Champagne chalk:
//    very pale, almost cream, going grey in shadow. New-cut work on the
//    cathedral is markedly whiter than the weathered fabric next to it.

import * as THREE from '../vendor/three.module.js';
import { hex } from './geom.js';

export const C = {
  // timber and daub
  daubWhite:   hex(0xe8ddc6),
  daubBuff:    hex(0xd9c9a6),
  daubOchre:   hex(0xc9ac7c),
  daubGrey:    hex(0xbfb6a2),
  daubPink:    hex(0xd9bda4),
  oak:         hex(0x7d6a52),
  oakPale:     hex(0x93816a),
  oakDark:     hex(0x5e4f3d),

  // Roofs. A medieval roofscape is not a field of new terracotta: flat clay
  // tile weathers brown and grey within a decade, takes moss on the north
  // pitch, and sits alongside a great deal of oak shingle and thatch. The
  // spread below is deliberately wide and centred on brown, not orange.
  tileNew:     hex(0x9c5a3e),
  tileOld:     hex(0x7f4f39),
  tileBrown:   hex(0x6d4c39),
  tileMossy:   hex(0x5f5440),
  tileGrey:    hex(0x736358),
  tileDark:    hex(0x54423a),
  thatch:      hex(0xa8915f),
  thatchOld:   hex(0x8a7a52),
  thatchGrey:  hex(0x7d7461),
  shingle:     hex(0x6a5d4d),
  shingleGrey: hex(0x655f55),
  lead:        hex(0x83888d),
  slate:       hex(0x555b62),

  // stone
  stoneNew:    hex(0xe9e2cf),
  stone:       hex(0xd8d0bb),
  stoneOld:    hex(0xc3bca8),
  stoneDark:   hex(0xa9a290),
  chalk:       hex(0xefe9db),

  // ground
  mud:         hex(0x8a7a5f),
  mudWet:      hex(0x6f6249),
  cobble:      hex(0x9a9483),
  grass:       hex(0x7b9046),
  grassDry:    hex(0xa0a055),
  meadow:      hex(0x86a24b),
  wheat:       hex(0xc9b169),
  vineyard:    hex(0x67853c),
  fallow:      hex(0x9c8a68),
  tree:        hex(0x4d6b38),
  treeDark:    hex(0x3a5228),
  treeLight:   hex(0x6a8347),
  treeOlive:   hex(0x74804a),
  willow:      hex(0x7f8f52),
  bank:        hex(0x648f3a),
  gardenBed:   hex(0x6b5f42),
  gardenRow:   hex(0x5f7a3c),

  // water
  water:       hex(0x4e6b6d),
  waterPale:   hex(0x6e8a86),

  // fair cloth — the tents and awnings, dyed with the trade's own dyestuffs:
  // woad blue, madder red, weld yellow, and a lot of undyed hemp canvas.
  canvas:      hex(0xc8bda1),
  woad:        hex(0x3f5a7a),
  madder:      hex(0x9c4436),
  weld:        hex(0xc3a44e),
  scarlet:     hex(0xa8382f),
  green:       hex(0x4f6b47),
};

/** Mottled, seamless noise — the general surface grain. */
export function grainTexture(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  // value noise, several octaves, wrapped
  const oct = [4, 8, 16, 48, 128];
  const amp = [0.34, 0.26, 0.2, 0.13, 0.07];
  const grids = oct.map((n) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return g;
  });
  const sample = (g, n, u, v) => {
    const x = u * n, y = v * n;
    const x0 = Math.floor(x) % n, y0 = Math.floor(y) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * n + x0], b = g[y0 * n + x1], c = g[y1 * n + x0], e = g[y1 * n + x1];
    return (a + (b - a) * sx) + ((c + (e - c) * sx) - (a + (b - a) * sx)) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let o = 0; o < oct.length; o++) v += sample(grids[o], oct[o], x / size, y / size) * amp[o];
      const g = Math.round(150 + v * 190);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, g));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Banded noise — roof courses. Bands run along V so they read as tile courses. */
export function courseTexture(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, size, size);
  const courses = 26;
  const ch = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    // the course itself, slightly varied
    const base = 148 + Math.random() * 26;
    ctx.fillStyle = `rgb(${base | 0},${base | 0},${base | 0})`;
    ctx.fillRect(0, y, size, ch);
    // individual tiles within the course
    const tiles = 34;
    const tw = size / tiles;
    const offset = (r % 2) * tw * 0.5;
    for (let i = -1; i < tiles + 1; i++) {
      const v = base + (Math.random() - 0.5) * 34;
      ctx.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      ctx.fillRect(i * tw + offset + 0.4, y + 0.5, tw - 0.8, ch - 1.0);
    }
    // the shadow line under the overlap
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, y + ch - Math.max(1, ch * 0.13), size, Math.max(1, ch * 0.13));
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function materials() {
  const grain = grainTexture(512);
  const course = courseTexture(512);

  const solid = new THREE.MeshLambertMaterial({
    vertexColors: true, map: grain,
  });
  const roof = new THREE.MeshLambertMaterial({
    vertexColors: true, map: course,
  });
  const ground = new THREE.MeshLambertMaterial({
    vertexColors: true, map: grain,
  });
  const water = new THREE.MeshPhongMaterial({
    vertexColors: true, shininess: 90, specular: 0x9fb4b0,
    transparent: true, opacity: 0.93,
  });
  const foliage = new THREE.MeshLambertMaterial({
    vertexColors: true, map: grain,
  });
  const cloth = new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  });
  return { solid, roof, ground, water, foliage, cloth, grain, course };
}
