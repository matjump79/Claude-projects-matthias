// A single procedurally painted texture atlas. Everything in the city samples
// from this one 2048x2048 canvas, so the whole scene can be drawn in a handful
// of draw calls -- essential because the film is rasterised in software
// (SwiftShader), where draw-call and state-change overhead is expensive.
import { makeRng } from './rng.js';

// TILE is the tile's size in DRAWING space. Every tile painter below works in
// that space with its own hardcoded pixel sizes, so the atlas is enlarged by
// drawing through a canvas transform rather than by rescaling those constants:
// the strokes stay in proportion and come out genuinely sharper, not upscaled.
export const TILE = 256, COLS = 8;
export const ATLAS_SS = 2;                       // supersample factor
export const ATLAS_PX = TILE * COLS * ATLAS_SS;

// Tile slots. Names are used everywhere instead of raw indices.
export const T = {
  PLASTER: 0, PLASTER_OCHRE: 1, TIMBER_POST: 2, TIMBER_BRACE: 3, TIMBER_DENSE: 4,
  RUBBLE: 5, ASHLAR: 6, BRICK: 7,
  ROOF_TILE: 8, ROOF_TILE_WORN: 9, SHINGLE: 10, PLANK: 11,
  BLANK: 12, GRASS: 13, PLOUGH: 14, WHEAT: 15,
  VINEYARD: 16, FOLIAGE: 17, LANCET: 18, TRACERY: 19,
  COBBLE: 20, DIRT: 21, ROOF_CHURCH: 22, SCAFFOLD: 23,
  MEADOW: 24, MARKET: 25, THATCH: 26, WALKWAY: 27,
  WATER: 28, SHUTTER: 29, GABLE_PLASTER: 30, ORCHARD: 31,
  ARCADE: 32, TOWER_ASHLAR: 33, ROOF_LEAD: 34, REED: 35,
};

// UV rectangle of a tile, inset by half a texel to stop neighbouring tiles
// bleeding in at lower mip levels.
export function uvOf(tile) {
  const col = tile % COLS, row = Math.floor(tile / COLS);
  const s = 1 / COLS, pad = 0.6 / ATLAS_PX;
  return {
    u0: col * s + pad, u1: (col + 1) * s - pad,
    v0: 1 - (row + 1) * s + pad, v1: 1 - row * s - pad,
  };
}

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// Sprinkle of darker/lighter pixels: gives surfaces a bit of tooth so large
// flat walls do not read as plastic.
function grain(ctx, x0, y0, w, h, rng, amount, dark = 'rgba(0,0,0,0.10)', light = 'rgba(255,255,255,0.10)') {
  for (let i = 0; i < amount; i++) {
    const x = x0 + rng() * w, y = y0 + rng() * h, s = 1 + rng() * 2.5;
    ctx.fillStyle = rng() < 0.5 ? dark : light;
    ctx.fillRect(x, y, s, s);
  }
}

// ---------------------------------------------------------------- facades ---
// Late-medieval Swabian burgher house fronts. Ground floor is usually masonry
// or heavy timber; upper floors are framed and lime-washed between the posts.
// Timbers are painted weathered oak, not black: the black-and-white look of
// tourist half-timbering is largely a 19th/20th-century taste.
function facade(ctx, x, y, rng, opts) {
  const { plaster, timber, style, windows = 2, storeys = 2, shutters = true } = opts;
  px(ctx, x, y, TILE, TILE, plaster);
  grain(ctx, x, y, TILE, TILE, rng, 900);

  const beam = (bx, by, bw, bh) => {
    ctx.fillStyle = timber; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(bx, by + bh - 2, bw, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(bx, by, bw, 1.5);
  };
  const diag = (x1, y1, x2, y2, w) => {
    ctx.save(); ctx.strokeStyle = timber; ctx.lineWidth = w; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };

  const sH = TILE / storeys;
  if (style !== 'plain') {
    for (let s = 0; s <= storeys; s++) beam(x, y + s * sH - 5, TILE, 10);        // sills / plates
    const posts = style === 'dense' ? 5 : 3;
    for (let s = 0; s < storeys; s++) {
      const top = y + s * sH;
      for (let p = 0; p <= posts; p++) beam(x + (p * TILE) / posts - 4, top, 8, sH);
      if (style === 'brace' || style === 'dense') {
        for (let p = 0; p < posts; p++) {
          const x0 = x + (p * TILE) / posts, x1 = x0 + TILE / posts;
          if ((p + s) % 2 === 0) { diag(x0 + 4, top + sH - 6, x1 - 4, top + 6, 7); }
          else { diag(x0 + 4, top + 6, x1 - 4, top + sH - 6, 7); }
          if (style === 'dense' && p % 2 === 1) diag(x1 - 4, top + 6, x0 + 4, top + sH - 6, 6);
        }
      }
    }
  }

  // Windows: small, leaded, irregular. Glass was costly; many openings are
  // shuttered or closed with oiled cloth, so they read as dark voids.
  for (let s = 0; s < storeys; s++) {
    for (let w = 0; w < windows; w++) {
      const ww = 34 + rng() * 10, wh = 40 + rng() * 12;
      const wx = x + ((w + 0.5) * TILE) / windows - ww / 2 + (rng() - 0.5) * 10;
      const wy = y + s * sH + sH * 0.30 - wh / 2 + sH * 0.1;
      px(ctx, wx - 3, wy - 3, ww + 6, wh + 6, timber);
      px(ctx, wx, wy, ww, wh, '#2b2a26');
      // leaded panes
      ctx.strokeStyle = 'rgba(190,200,190,0.30)'; ctx.lineWidth = 1;
      for (let gx = 1; gx < 3; gx++) { ctx.beginPath(); ctx.moveTo(wx + (gx * ww) / 3, wy); ctx.lineTo(wx + (gx * ww) / 3, wy + wh); ctx.stroke(); }
      for (let gy = 1; gy < 3; gy++) { ctx.beginPath(); ctx.moveTo(wx, wy + (gy * wh) / 3); ctx.lineTo(wx + ww, wy + (gy * wh) / 3); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,245,210,0.13)'; ctx.fillRect(wx, wy, ww, wh * 0.4);
      if (shutters && rng() < 0.35) px(ctx, wx - 3, wy - 3, (ww + 6) * 0.5, wh + 6, timber);
    }
  }
}

// ------------------------------------------------------------------ roofs ---
// Hollow clay "Biberschwanz" (beaver-tail) tiles: the standard roof of a rich
// south-German town by 1500. Ulm's council had pushed tile over thatch since
// the 14th century as fire protection.
function roofTiles(ctx, x, y, rng, base, worn) {
  px(ctx, x, y, TILE, TILE, base);
  const rows = 16, rh = TILE / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rh;
    const off = (r % 2) * 8;
    for (let c = 0; c < 16; c++) {
      const xx = x + c * 16 + off;
      const v = rng();
      ctx.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + rng() * 0.12})`;
      ctx.beginPath();
      ctx.moveTo(xx, yy); ctx.lineTo(xx + 16, yy); ctx.lineTo(xx + 16, yy + rh * 0.8);
      ctx.quadraticCurveTo(xx + 8, yy + rh * 1.25, xx, yy + rh * 0.8);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fillRect(x, yy, TILE, 1.6);
  }
  if (worn) { // moss and soot in the lee of the roof
    for (let i = 0; i < 70; i++) {
      const bx = x + rng() * TILE, by = y + rng() * TILE, s = 4 + rng() * 14;
      ctx.fillStyle = `rgba(${90 + rng() * 40 | 0},${100 + rng() * 40 | 0},60,${0.10 + rng() * 0.18})`;
      ctx.beginPath(); ctx.ellipse(bx, by, s, s * 0.6, 0, 0, 7); ctx.fill();
    }
  }
  grain(ctx, x, y, TILE, TILE, rng, 500);
}

function shingles(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#6d6357');
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 12; c++) {
      const xx = x + c * 22 + (r % 2) * 11, yy = y + r * (TILE / 20);
      const g = 80 + rng() * 55;
      ctx.fillStyle = `rgb(${g | 0},${(g * 0.93) | 0},${(g * 0.82) | 0})`;
      ctx.fillRect(xx, yy, 20, TILE / 20 * 1.6);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(xx, yy, 20, 1.5);
    }
  }
  grain(ctx, x, y, TILE, TILE, rng, 700);
}

// ---------------------------------------------------------------- masonry ---
function rubble(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#8b8477');
  for (let i = 0; i < 260; i++) {
    const w = 12 + rng() * 34, h = 9 + rng() * 18;
    const bx = x + rng() * (TILE - w), by = y + rng() * (TILE - h);
    const g = 120 + rng() * 60;
    ctx.fillStyle = `rgb(${g | 0},${(g * 0.97) | 0},${(g * 0.87) | 0})`;
    ctx.beginPath(); ctx.ellipse(bx + w / 2, by + h / 2, w / 2, h / 2, rng(), 0, 7); ctx.fill();
  }
  grain(ctx, x, y, TILE, TILE, rng, 1200);
}

function ashlar(ctx, x, y, rng, base = '#cdc4ad', course = 32) {
  px(ctx, x, y, TILE, TILE, base);
  const rows = TILE / course;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * course, off = (r % 2) * 32;
    for (let c = 0; c < 4; c++) {
      const xx = x + c * 64 + off, w = 62, h = course - 2;
      const g = 0.92 + rng() * 0.16;
      ctx.fillStyle = `rgba(255,252,238,${(g - 0.9) * 2})`;
      ctx.fillRect(xx, yy, w, h);
      ctx.fillStyle = `rgba(90,84,66,${0.05 + rng() * 0.10})`;
      ctx.fillRect(xx, yy, w, h);
      ctx.strokeStyle = 'rgba(70,64,50,0.30)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(xx + 0.5, yy + 0.5, w, h);
    }
  }
  grain(ctx, x, y, TILE, TILE, rng, 900);
}

// Ulm's late fortifications are brick: the 1480 wall driven down to the
// Danube bank is brickwork, and the source describes the circuit as brick.
function brick(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#8d5a43');
  const rows = 22, rh = TILE / rows;
  for (let r = 0; r < rows; r++) {
    const yy = y + r * rh, off = (r % 2) * 26;
    for (let c = 0; c < 6; c++) {
      const xx = x + c * 52 + off - 26, w = 48, h = rh - 2.5;
      const t = rng();
      const rr = 128 + t * 46, gg = 74 + t * 30, bb = 58 + t * 26;
      ctx.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
      ctx.fillRect(xx, yy, w, h);
    }
  }
  grain(ctx, x, y, TILE, TILE, rng, 1400);
}

// ----------------------------------------------------------------- ground ---
function ground(ctx, x, y, rng, kind) {
  const bases = {
    grass: ['#6f7a46', '#7c8750', '#66723f'],
    meadow: ['#7e8a4e', '#8b9557', '#93a05d'],
    plough: ['#6b5a41', '#7a674a', '#5e4f3a'],
    wheat: ['#b09a52', '#bda75c', '#a89149'],
    dirt: ['#7d6f57', '#8a7c62', '#6f6350'],
    cobble: ['#7a7365', '#867e70', '#6e675b'],
    market: ['#857a66', '#8f8471', '#786d5b'],
    reed: ['#6c7548', '#7b8452', '#5f6a40'],
  };
  const pal = bases[kind] || bases.grass;
  px(ctx, x, y, TILE, TILE, pal[0]);
  for (let i = 0; i < 1400; i++) {
    const bx = x + rng() * TILE, by = y + rng() * TILE;
    ctx.fillStyle = pal[1 + (rng() < 0.5 ? 0 : 1)];
    ctx.globalAlpha = 0.25 + rng() * 0.5;
    ctx.fillRect(bx, by, 2 + rng() * 6, 2 + rng() * 6);
  }
  ctx.globalAlpha = 1;
  if (kind === 'plough') {
    for (let r = 0; r < 26; r++) {
      ctx.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.08})`;
      ctx.fillRect(x, y + r * (TILE / 26), TILE, 4);
      ctx.fillStyle = 'rgba(255,240,210,0.06)';
      ctx.fillRect(x, y + r * (TILE / 26) + 4, TILE, 2);
    }
  }
  if (kind === 'wheat') {
    for (let i = 0; i < 900; i++) {
      const bx = x + rng() * TILE, by = y + rng() * TILE;
      ctx.strokeStyle = `rgba(${200 + rng() * 40 | 0},${180 + rng() * 40 | 0},110,0.35)`;
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 1, by - 7); ctx.stroke();
    }
  }
  if (kind === 'cobble') {
    for (let i = 0; i < 700; i++) {
      const bx = x + rng() * TILE, by = y + rng() * TILE, s = 5 + rng() * 7;
      const g = 110 + rng() * 55;
      ctx.fillStyle = `rgb(${g | 0},${(g * 0.97) | 0},${(g * 0.88) | 0})`;
      ctx.beginPath(); ctx.ellipse(bx, by, s * 0.6, s * 0.45, rng() * 3, 0, 7); ctx.fill();
    }
  }
  grain(ctx, x, y, TILE, TILE, rng, 900);
}

function vineyard(ctx, x, y, rng) {
  ground(ctx, x, y, rng, 'dirt');
  for (let r = 0; r < 7; r++) {
    const yy = y + r * (TILE / 7) + 12;
    for (let i = 0; i < 40; i++) {
      const bx = x + i * 6.4 + rng() * 3;
      ctx.fillStyle = `rgba(${50 + rng() * 40 | 0},${90 + rng() * 45 | 0},${40 + rng() * 25 | 0},0.9)`;
      ctx.beginPath(); ctx.ellipse(bx, yy, 4, 7, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, yy + 9, TILE, 3);
  }
}

function foliage(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#4c5c33');
  for (let i = 0; i < 1600; i++) {
    const bx = x + rng() * TILE, by = y + rng() * TILE, s = 3 + rng() * 11;
    const g = 60 + rng() * 70;
    ctx.fillStyle = `rgba(${(g * 0.75) | 0},${g | 0},${(g * 0.48) | 0},${0.35 + rng() * 0.5})`;
    ctx.beginPath(); ctx.ellipse(bx, by, s, s * 0.8, 0, 0, 7); ctx.fill();
  }
}

function planks(ctx, x, y, rng, base = '#6f6145') {
  px(ctx, x, y, TILE, TILE, base);
  for (let c = 0; c < 8; c++) {
    const xx = x + c * 32;
    const g = 0.85 + rng() * 0.3;
    ctx.fillStyle = `rgba(255,240,215,${(g - 0.8) * 0.5})`; ctx.fillRect(xx, y, 30, TILE);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(xx + 30, y, 2, TILE);
    for (let i = 0; i < 40; i++) { // grain lines
      const yy = y + rng() * TILE;
      ctx.fillStyle = 'rgba(60,45,30,0.10)'; ctx.fillRect(xx, yy, 30, 1);
    }
  }
}

// Gothic openings for the Minster: painted, not modelled, because software
// rasterisation makes real tracery far too expensive at this scale.
function lancet(ctx, x, y, rng, count, tracery) {
  ashlar(ctx, x, y, rng, '#cfc6b0', 42);
  const w = TILE / count;
  for (let i = 0; i < count; i++) {
    const cx = x + (i + 0.5) * w, ww = w * (tracery ? 0.66 : 0.5), top = y + TILE * 0.10, bot = y + TILE * 0.93;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - ww / 2, bot); ctx.lineTo(cx - ww / 2, top + ww * 0.55);
    ctx.quadraticCurveTo(cx, top - ww * 0.15, cx + ww / 2, top + ww * 0.55);
    ctx.lineTo(cx + ww / 2, bot); ctx.closePath();
    ctx.fillStyle = '#332f28'; ctx.fill();
    ctx.clip();
    // mullions and leaded glazing; a faint warm glow where glass catches light
    ctx.strokeStyle = 'rgba(190,190,175,0.40)'; ctx.lineWidth = 3;
    for (let m = 1; m < (tracery ? 4 : 3); m++) {
      const mx = cx - ww / 2 + (m * ww) / (tracery ? 4 : 3);
      ctx.beginPath(); ctx.moveTo(mx, top); ctx.lineTo(mx, bot); ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (let t = 1; t < 9; t++) { const ty = top + (t * (bot - top)) / 9; ctx.beginPath(); ctx.moveTo(cx - ww, ty); ctx.lineTo(cx + ww, ty); ctx.stroke(); }
    if (tracery) { // foiled head
      ctx.strokeStyle = 'rgba(205,200,182,0.75)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, top + ww * 0.45, ww * 0.26, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,90,50,0.10)'; ctx.fillRect(x, top, TILE, (bot - top) * 0.5);
    ctx.restore();
    ctx.strokeStyle = 'rgba(96,88,70,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - ww / 2, bot); ctx.lineTo(cx - ww / 2, top + ww * 0.55);
    ctx.quadraticCurveTo(cx, top - ww * 0.15, cx + ww / 2, top + ww * 0.55);
    ctx.lineTo(cx + ww / 2, bot); ctx.stroke();
  }
}

function arcade(ctx, x, y, rng) {
  ashlar(ctx, x, y, rng, '#c9bfa6', 48);
  for (let i = 0; i < 3; i++) {
    const cx = x + (i + 0.5) * (TILE / 3), ww = TILE / 3 * 0.66;
    ctx.fillStyle = '#39342c';
    ctx.beginPath();
    ctx.moveTo(cx - ww / 2, y + TILE); ctx.lineTo(cx - ww / 2, y + TILE * 0.42);
    ctx.quadraticCurveTo(cx, y + TILE * 0.10, cx + ww / 2, y + TILE * 0.42);
    ctx.lineTo(cx + ww / 2, y + TILE); ctx.closePath(); ctx.fill();
  }
}

function water(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#5a6f63');
  for (let i = 0; i < 500; i++) {
    const bx = x + rng() * TILE, by = y + rng() * TILE, w = 10 + rng() * 60;
    ctx.fillStyle = `rgba(${200 + rng() * 55 | 0},${225 + rng() * 30 | 0},225,${0.03 + rng() * 0.07})`;
    ctx.fillRect(bx, by, w, 1.5 + rng() * 2);
  }
  grain(ctx, x, y, TILE, TILE, rng, 400);
}

function scaffold(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#7a6a4e');
  planks(ctx, x, y, rng, '#7a6a4e');
  ctx.fillStyle = 'rgba(40,30,18,0.55)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 64 + 26, y, 10, TILE);
  for (let i = 0; i < 5; i++) ctx.fillRect(x, y + i * 51 + 18, TILE, 8);
}

function thatch(ctx, x, y, rng) {
  px(ctx, x, y, TILE, TILE, '#8a7444');
  for (let i = 0; i < 2600; i++) {
    const bx = x + rng() * TILE, by = y + rng() * TILE;
    const g = 110 + rng() * 70;
    ctx.strokeStyle = `rgba(${g | 0},${(g * 0.85) | 0},${(g * 0.55) | 0},0.5)`;
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + (rng() - 0.5) * 3, by + 12); ctx.stroke();
  }
  for (let r = 0; r < 7; r++) { ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(x, y + r * 36 + 30, TILE, 4); }
}

export function buildAtlas(THREE) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_PX;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rng = makeRng(20250920);
  // Each painter draws at the origin of its own tile-sized space; `tile` puts
  // that space where it belongs in the atlas and scales it up by ATLAS_SS.
  const x = 0, y = 0;
  const tile = (t, draw) => {
    ctx.save();
    ctx.translate((t % COLS) * TILE * ATLAS_SS, Math.floor(t / COLS) * TILE * ATLAS_SS);
    ctx.scale(ATLAS_SS, ATLAS_SS);
    draw();
    ctx.restore();
  };

  tile(T.PLASTER, () => { facade(ctx, x, y, rng, { plaster: '#d9cfb8', timber: '#6d5c45', style: 'plain', windows: 2 }); });
  tile(T.PLASTER_OCHRE, () => { facade(ctx, x, y, rng, { plaster: '#cdb98d', timber: '#6a5a44', style: 'plain', windows: 2 }); });
  tile(T.TIMBER_POST, () => { facade(ctx, x, y, rng, { plaster: '#ded5c0', timber: '#6f5d44', style: 'post', windows: 2 }); });
  tile(T.TIMBER_BRACE, () => { facade(ctx, x, y, rng, { plaster: '#d3c8ae', timber: '#63523c', style: 'brace', windows: 2 }); });
  tile(T.TIMBER_DENSE, () => { facade(ctx, x, y, rng, { plaster: '#cfc4a8', timber: '#5d4d39', style: 'dense', windows: 3 }); });
  tile(T.GABLE_PLASTER, () => { facade(ctx, x, y, rng, { plaster: '#d6ccb4', timber: '#67563f', style: 'post', windows: 1, storeys: 1 }); });
  tile(T.SHUTTER, () => { facade(ctx, x, y, rng, { plaster: '#c9bda0', timber: '#5a4a36', style: 'brace', windows: 1, storeys: 1 }); });
  tile(T.RUBBLE, () => { rubble(ctx, x, y, rng); });
  tile(T.ASHLAR, () => { ashlar(ctx, x, y, rng, '#cdc4ad', 32); });
  tile(T.TOWER_ASHLAR, () => { ashlar(ctx, x, y, rng, '#c6bda5', 26); });
  tile(T.BRICK, () => { brick(ctx, x, y, rng); });
  tile(T.ROOF_TILE, () => { roofTiles(ctx, x, y, rng, '#9d5b41', false); });
  tile(T.ROOF_TILE_WORN, () => { roofTiles(ctx, x, y, rng, '#8c5740', true); });
  tile(T.ROOF_CHURCH, () => { roofTiles(ctx, x, y, rng, '#7d4f3c', true); });
  tile(T.ROOF_LEAD, () => { px(ctx, x, y, TILE, TILE, '#7f8484'); planks(ctx, x, y, rng, '#7f8484'); });
  tile(T.SHINGLE, () => { shingles(ctx, x, y, rng); });
  tile(T.PLANK, () => { planks(ctx, x, y, rng); });
  tile(T.BLANK, () => { px(ctx, x, y, TILE, TILE, '#ffffff'); });
  tile(T.GRASS, () => { ground(ctx, x, y, rng, 'grass'); });
  tile(T.MEADOW, () => { ground(ctx, x, y, rng, 'meadow'); });
  tile(T.PLOUGH, () => { ground(ctx, x, y, rng, 'plough'); });
  tile(T.WHEAT, () => { ground(ctx, x, y, rng, 'wheat'); });
  tile(T.DIRT, () => { ground(ctx, x, y, rng, 'dirt'); });
  tile(T.COBBLE, () => { ground(ctx, x, y, rng, 'cobble'); });
  tile(T.MARKET, () => { ground(ctx, x, y, rng, 'market'); });
  tile(T.REED, () => { ground(ctx, x, y, rng, 'reed'); });
  tile(T.VINEYARD, () => { vineyard(ctx, x, y, rng); });
  tile(T.ORCHARD, () => { ground(ctx, x, y, rng, 'meadow'); for (let i = 0; i < 26; i++) { const bx = x + rng() * TILE, by = y + rng() * TILE; ctx.fillStyle = 'rgba(55,75,40,0.75)'; ctx.beginPath(); ctx.ellipse(bx, by, 11, 10, 0, 0, 7); ctx.fill(); } });
  tile(T.FOLIAGE, () => { foliage(ctx, x, y, rng); });
  tile(T.LANCET, () => { lancet(ctx, x, y, rng, 2, false); });
  tile(T.TRACERY, () => { lancet(ctx, x, y, rng, 1, true); });
  tile(T.ARCADE, () => { arcade(ctx, x, y, rng); });
  tile(T.WATER, () => { water(ctx, x, y, rng); });
  tile(T.SCAFFOLD, () => { scaffold(ctx, x, y, rng); });
  tile(T.THATCH, () => { thatch(ctx, x, y, rng); });
  tile(T.WALKWAY, () => { ground(ctx, x, y, rng, 'cobble'); });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 16;
  return tex;
}
