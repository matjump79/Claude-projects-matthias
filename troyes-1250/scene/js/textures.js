// textures.js — a proper material set: albedo, normal and roughness for every
// surface in the town.
//
// The previous version shaded everything with flat vertex colour and one sheet
// of grey noise, which is why it read as coloured cardboard. What a photograph
// of a roof actually contains is a thousand small shadows: the lip of every
// tile, the ripple of thatch, the coursing of stone, the proud edge of every
// timber. None of that is colour — it is RELIEF, and relief needs a normal map.
//
// Each generator paints an albedo canvas and a height canvas at the same time;
// the height is then differentiated into a tangent-space normal map. Roughness
// comes out of the same height field, because in practice the rough parts of a
// surface are the broken parts.

import * as THREE from '../vendor/three.module.js';

const rnd = (() => {
  let s = 0x9e3779b9;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
})();

function canvas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return cv;
}

/** Sobel the height canvas into a tangent-space normal map. */
function normalFromHeight(heightCv, strength = 2.4) {
  const size = heightCv.width;
  const hc = heightCv.getContext('2d').getImageData(0, 0, size, size).data;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const H = (x, y) => {
    const xi = ((x % size) + size) % size, yi = ((y % size) + size) % size;
    return hc[(yi * size + xi) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) -
        (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy =
        (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) -
        (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const L = Math.hypot(nx, ny, nz);
      nx /= L; ny /= L; nz /= L;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Roughness from height: the broken parts of a surface are the rough parts. */
function roughFromHeight(heightCv, lo = 0.62, hi = 0.96) {
  const size = heightCv.width;
  const hc = heightCv.getContext('2d').getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const h = hc[i * 4] / 255;
    const v = Math.round((hi - (hi - lo) * h) * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(cv, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

// ---------------------------------------------------------------------------
// FLAT CLAY TILE — tuile plate, the roof of the fair quarter.
// Small flat rectangular tiles, hung in overlapping courses, each one standing
// a few millimetres proud of the one below. That lip is the whole look.
// ---------------------------------------------------------------------------
function clayTile(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#8d8d8d'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#404040'; hc.fillRect(0, 0, size, size);

  const courses = 22;
  const ch = size / courses;
  const per = 26;
  const tw = size / per;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    const off = (r % 2) * tw * 0.5;
    for (let i = -1; i <= per; i++) {
      const x = i * tw + off;
      // each tile slightly its own colour: they were fired in a clamp, not a kiln
      const v = 118 + rnd() * 74;
      const warm = rnd() * 22;
      ac.fillStyle = `rgb(${(v + warm) | 0},${(v * 0.93) | 0},${(v * 0.86) | 0})`;
      ac.fillRect(x + 0.6, y + 0.6, tw - 1.2, ch * 1.55);
      // height: the tile face rises toward its exposed lower edge
      const g = hc.createLinearGradient(0, y, 0, y + ch * 1.55);
      g.addColorStop(0, 'rgb(74,74,74)');
      g.addColorStop(0.72, 'rgb(150,150,150)');
      g.addColorStop(1, 'rgb(196,196,196)');
      hc.fillStyle = g;
      hc.fillRect(x + 0.6, y + 0.6, tw - 1.2, ch * 1.55);
      // the vertical joint between neighbours
      hc.fillStyle = 'rgb(38,38,38)';
      hc.fillRect(x - 0.5, y, 1.4, ch * 1.55);
    }
    // the shadow line where the next course laps over
    ac.fillStyle = 'rgba(0,0,0,0.30)';
    ac.fillRect(0, y, size, ch * 0.30);
    hc.fillStyle = 'rgb(26,26,26)';
    hc.fillRect(0, y - 1, size, 2.4);
  }
  // moss and weathering in the laps
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, r = 2 + rnd() * 11;
    ac.fillStyle = `rgba(${70 + rnd() * 40 | 0},${88 + rnd() * 44 | 0},${52 + rnd() * 30 | 0},${0.05 + rnd() * 0.20})`;
    ac.beginPath(); ac.ellipse(x, y, r, r * 0.55, rnd() * 3, 0, 7); ac.fill();
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// THATCH — long straw, combed and pegged, with a deep ragged eaves line.
// ---------------------------------------------------------------------------
function thatch(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#9a8556'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#6a6a6a'; hc.fillRect(0, 0, size, size);
  // the straws themselves, all running down the pitch
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * size, y = rnd() * size;
    const len = 8 + rnd() * 26;
    const v = 120 + rnd() * 92;
    ac.strokeStyle = `rgba(${(v * 1.06) | 0},${(v * 0.92) | 0},${(v * 0.60) | 0},0.55)`;
    ac.lineWidth = 0.7 + rnd() * 1.5;
    ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + (rnd() - 0.5) * 3, y + len); ac.stroke();
    const hv = 90 + rnd() * 120;
    hc.strokeStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.5)`;
    hc.lineWidth = 0.9 + rnd() * 1.7;
    hc.beginPath(); hc.moveTo(x, y); hc.lineTo(x + (rnd() - 0.5) * 3, y + len); hc.stroke();
  }
  // the courses where it is pegged down
  for (let r = 0; r < 7; r++) {
    const y = (r + 0.5) * (size / 7);
    ac.fillStyle = 'rgba(0,0,0,0.13)';
    ac.fillRect(0, y, size, 5);
    hc.fillStyle = 'rgba(40,40,40,0.6)';
    hc.fillRect(0, y, size, 5);
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// OAK SHINGLE — split, not sawn, so no two are the same width.
// ---------------------------------------------------------------------------
function shingle(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#6b6152'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#505050'; hc.fillRect(0, 0, size, size);
  const courses = 17, ch = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    let x = -rnd() * 40;
    while (x < size) {
      const w = 18 + rnd() * 34;
      const v = 78 + rnd() * 74;
      ac.fillStyle = `rgb(${(v * 1.04) | 0},${(v * 0.95) | 0},${(v * 0.80) | 0})`;
      ac.fillRect(x, y, w - 1.5, ch * 1.6);
      const g = hc.createLinearGradient(0, y, 0, y + ch * 1.6);
      g.addColorStop(0, 'rgb(64,64,64)');
      g.addColorStop(1, 'rgb(188,188,188)');
      hc.fillStyle = g; hc.fillRect(x, y, w - 1.5, ch * 1.6);
      hc.fillStyle = 'rgb(30,30,30)'; hc.fillRect(x - 1.2, y, 2.2, ch * 1.6);
      x += w;
    }
    ac.fillStyle = 'rgba(0,0,0,0.26)'; ac.fillRect(0, y, size, ch * 0.24);
    hc.fillStyle = 'rgb(24,24,24)'; hc.fillRect(0, y - 1, size, 2.2);
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// LIME-WASHED DAUB between oak framing — the wall of nine houses in ten.
// The frame is drawn in the texture as well as in geometry: the geometry gives
// the big members, this gives the studs, the render lines and the shadow each
// timber throws onto the panel beside it.
// ---------------------------------------------------------------------------
function daub(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#a8a49a'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#b4b4b4'; hc.fillRect(0, 0, size, size);
  // the trowelled surface: daub is never flat
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * size, y = rnd() * size, r = 6 + rnd() * 40;
    const v = 148 + rnd() * 66;
    ac.fillStyle = `rgba(${v | 0},${(v * 0.99) | 0},${(v * 0.95) | 0},0.16)`;
    ac.beginPath(); ac.ellipse(x, y, r, r * (0.5 + rnd() * 0.7), rnd() * 3, 0, 7); ac.fill();
    const hv = 150 + rnd() * 80;
    hc.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.13)`;
    hc.beginPath(); hc.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 7); hc.fill();
  }
  // studs and rails, standing proud
  const timber = (x, y, w, hh) => {
    const v = 44 + rnd() * 30;
    ac.fillStyle = `rgb(${(v * 1.12) | 0},${(v * 0.96) | 0},${(v * 0.74) | 0})`;
    ac.fillRect(x, y, w, hh);
    // the grain
    for (let i = 0; i < Math.max(w, hh) / 2; i++) {
      ac.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.09})`;
      if (w > hh) ac.fillRect(x + rnd() * w, y + rnd() * hh, 1 + rnd() * 9, 0.8);
      else ac.fillRect(x + rnd() * w, y + rnd() * hh, 0.8, 1 + rnd() * 9);
    }
    hc.fillStyle = 'rgb(232,232,232)'; hc.fillRect(x, y, w, hh);
    // the shadow the timber throws on the panel
    ac.fillStyle = 'rgba(0,0,0,0.22)'; ac.fillRect(x + w, y, 3.5, hh);
    ac.fillStyle = 'rgba(0,0,0,0.16)'; ac.fillRect(x, y + hh, w + 3.5, 3);
    hc.fillStyle = 'rgb(84,84,84)'; hc.fillRect(x + w, y, 3, hh);
  };
  const railH = 15;
  timber(0, 0, size, railH);
  timber(0, size - railH, size, railH);
  const bays = 6, bw = size / bays;
  for (let i = 0; i <= bays; i++) timber(i * bw - 7, 0, 14, size);
  // a brace in one bay, as they actually were — not in every one
  ac.save(); hc.save();
  ac.translate(bw * 1.5, size); hc.translate(bw * 1.5, size);
  ac.rotate(-0.72); hc.rotate(-0.72);
  ac.fillStyle = '#5c4f39'; ac.fillRect(0, -13, size * 0.55, 13);
  hc.fillStyle = 'rgb(226,226,226)'; hc.fillRect(0, -13, size * 0.55, 13);
  ac.restore(); hc.restore();
  // weather staining running down from the rails
  for (let i = 0; i < 180; i++) {
    const x = rnd() * size;
    ac.fillStyle = `rgba(120,112,92,${0.03 + rnd() * 0.07})`;
    ac.fillRect(x, railH, 2 + rnd() * 10, 40 + rnd() * 260);
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// STONE — coursed rubble with a lime pointing, for the churches and the walls.
// ---------------------------------------------------------------------------
function stone(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#9b968a'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#3c3c3c'; hc.fillRect(0, 0, size, size);
  const courses = 17, ch = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    let x = -rnd() * 60;
    while (x < size) {
      const w = 38 + rnd() * 92;
      const v = 168 + rnd() * 72;
      const warm = rnd() * 16;
      ac.fillStyle = `rgb(${(v + warm) | 0},${(v * 0.985) | 0},${(v * 0.93) | 0})`;
      ac.beginPath();
      ac.roundRect(x + 2, y + 2, w - 4, ch - 4, 2 + rnd() * 3);
      ac.fill();
      const g = hc.createRadialGradient(x + w / 2, y + ch / 2, 1, x + w / 2, y + ch / 2, w * 0.7);
      g.addColorStop(0, 'rgb(212,212,212)');
      g.addColorStop(1, 'rgb(120,120,120)');
      hc.fillStyle = g;
      hc.beginPath(); hc.roundRect(x + 2, y + 2, w - 4, ch - 4, 3); hc.fill();
      // the pick marks
      for (let i = 0; i < 16; i++) {
        ac.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.07})`;
        ac.fillRect(x + 4 + rnd() * (w - 10), y + 4 + rnd() * (ch - 10), 1 + rnd() * 4, 1 + rnd() * 2);
      }
      x += w;
    }
  }
  // lichen
  for (let i = 0; i < 520; i++) {
    const x = rnd() * size, y = rnd() * size, r = 3 + rnd() * 14;
    ac.fillStyle = `rgba(${140 + rnd() * 50 | 0},${148 + rnd() * 46 | 0},${110 + rnd() * 40 | 0},${0.05 + rnd() * 0.16})`;
    ac.beginPath(); ac.ellipse(x, y, r, r * 0.8, 0, 0, 7); ac.fill();
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// GROUND — trodden earth, grass and crop, all in one sheet. The ground carries
// less relief than anything built, but it must not be perfectly smooth either.
// ---------------------------------------------------------------------------
function ground(size = 1024) {
  const a = canvas(size), h = canvas(size);
  const ac = a.getContext('2d'), hc = h.getContext('2d');
  ac.fillStyle = '#9c9c9c'; ac.fillRect(0, 0, size, size);
  hc.fillStyle = '#808080'; hc.fillRect(0, 0, size, size);
  for (let i = 0; i < 16000; i++) {
    const x = rnd() * size, y = rnd() * size;
    const v = 120 + rnd() * 120;
    ac.fillStyle = `rgba(${v | 0},${(v * 1.02) | 0},${(v * 0.9) | 0},0.30)`;
    ac.beginPath(); ac.ellipse(x, y, 2 + rnd() * 11, 1 + rnd() * 7, rnd() * 3, 0, 7); ac.fill();
  }
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * size, y = rnd() * size;
    const hv = 70 + rnd() * 150;
    hc.fillStyle = `rgba(${hv | 0},${hv | 0},${hv | 0},0.22)`;
    hc.beginPath(); hc.ellipse(x, y, 2 + rnd() * 9, 2 + rnd() * 6, 0, 0, 7); hc.fill();
  }
  // the grain of a ploughed land
  for (let i = 0; i < 260; i++) {
    const y = rnd() * size;
    ac.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`;
    ac.fillRect(0, y, size, 1 + rnd() * 3);
  }
  return { a, h };
}

// ---------------------------------------------------------------------------
// FOLIAGE — a sheet of leaves on transparency, for the cross-planes that make
// up a tree canopy. This is the single biggest difference between a tree and a
// green cone.
// ---------------------------------------------------------------------------
function leaves(size = 512) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  // clusters of small leaves, thinning toward the edge of the sheet
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.pow(rnd(), 0.62) * size * 0.49;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.86;
    const fade = 1 - r / (size * 0.5);
    if (rnd() > fade * 1.25) continue;
    const s = 3 + rnd() * 9;
    const g = 96 + rnd() * 92;
    const warm = rnd() * 30;
    ctx.fillStyle = `rgba(${(g * 0.52 + warm) | 0},${g | 0},${(g * 0.42) | 0},${0.55 + rnd() * 0.45})`;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rnd() * Math.PI);
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * (0.45 + rnd() * 0.3), 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  // a few twigs showing through
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * size * 0.4;
    ctx.strokeStyle = `rgba(62,50,36,${0.25 + rnd() * 0.4})`;
    ctx.lineWidth = 0.8 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  return cv;
}

// ---------------------------------------------------------------------------

export function buildMaterials() {
  const mk = (gen, repeat, opts = {}) => {
    const { a, h } = gen(opts.size || 1024);
    const map = tex(a, repeat);
    const normalMap = tex(normalFromHeight(h, opts.strength ?? 2.4), repeat, false);
    const roughnessMap = tex(roughFromHeight(h, opts.lo ?? 0.60, opts.hi ?? 0.97), repeat, false);
    const mat = new THREE.MeshStandardMaterial({
      map, normalMap, roughnessMap,
      normalScale: new THREE.Vector2(opts.ns ?? 1.0, opts.ns ?? 1.0),
      vertexColors: true,
      roughness: 1.0,
      metalness: 0.0,
      ...(opts.mat || {}),
    });
    if (opts.tint) mat.color.setScalar(opts.tint);
    return mat;
  };

  // `tint` compensates for the mean brightness of each detail sheet. The maps
  // multiply the per-building vertex colour, so a texture whose average sits at
  // 60% grey would drag every roof in the town two stops down and desaturate it
  // on the way. These numbers put the product back where the palette intends.
  const roofTile = mk(clayTile, 1, { strength: 3.0, ns: 1.2, tint: 1.85 });
  const roofThatch = mk(thatch, 1, { strength: 2.0, lo: 0.82, hi: 1.0, tint: 1.55 });
  const roofShingle = mk(shingle, 1, { strength: 2.6, tint: 1.95 });
  const wall = mk(daub, 1, { strength: 2.2, lo: 0.66, hi: 0.98, tint: 0.88 });
  const stoneM = mk(stone, 1, { strength: 2.8, lo: 0.62, hi: 0.98, tint: 1.10 });
  const groundM = mk(ground, 1, { strength: 1.1, lo: 0.80, hi: 1.0, ns: 0.6, tint: 1.22 });

  const leafTex = tex(leaves(512), 1);
  leafTex.wrapS = leafTex.wrapT = THREE.ClampToEdgeWrapping;
  const foliage = new THREE.MeshStandardMaterial({
    map: leafTex,
    vertexColors: true,
    transparent: false,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0.0,
  });
  foliage.color.setScalar(1.7);

  // River water, not a mirror: a slow channel with a light ripple on it sits
  // around 0.12-0.18 roughness, which spreads the sun's reflection into a broad
  // sheen instead of one hard white blob.
  const water = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.16,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
  });

  const cloth = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide,
    roughness: 0.94, metalness: 0.0,
  });

  return { roofTile, roofThatch, roofShingle, wall, stone: stoneM, ground: groundM, foliage, water, cloth };
}
