// Life in and around the city: river craft, carts on the field roads, the
// bleaching greens of the fustian trade, orchards, wayside chapels, the
// gallows on its hill, and the birds over the roofs.
import { Builder } from './geom.js';
import { T } from './atlas.js';
import { makeRng } from './rng.js';
import {
  DANUBE, BLAU, GATES, WALL, polyDistance, terrainHeight, insideWall,
  wallDistance, TOWN_Y, WATER_Y, BRIDGE,
} from './plan.js';

// Point on the Danube centreline at parameter s (0..1), plus its heading.
export function danubeAt(s) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < DANUBE.length - 1; i++) {
    const L = Math.hypot(DANUBE[i + 1][0] - DANUBE[i][0], DANUBE[i + 1][1] - DANUBE[i][1]);
    segs.push(L); total += L;
  }
  let d = s * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) {
      const t = d / segs[i];
      const [x0, z0] = DANUBE[i], [x1, z1] = DANUBE[i + 1];
      return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, ang: Math.atan2(z1 - z0, x1 - x0) };
    }
    d -= segs[i];
  }
  const n = DANUBE.length - 1;
  return { x: DANUBE[n][0], z: DANUBE[n][1], ang: 0 };
}

// A flat-bottomed Danube barge of the kind Ulm's shippers worked downstream
// to Vienna: planked hull, a single mast or none, a steering oar aft.
function barge(b, len, wid, cargo, rng) {
  const y = WATER_Y - 0.35;
  const hull = [0.72, 0.62, 0.46];
  b.box(0, y, 0, len, 1.5, wid, 0, { side: T.PLANK, top: null }, hull, 3);
  b.quad([-len / 2, y + 1.5, -wid / 2], [len / 2, y + 1.5, -wid / 2], [len / 2, y + 1.5, wid / 2], [-len / 2, y + 1.5, wid / 2],
    T.PLANK, [0.66, 0.57, 0.42], Math.round(len / 3), 2);
  // raked bow and stern
  b.spire(len / 2 + 1.4, y, 0, wid / 2, 1.9, 4, Math.PI / 4, T.PLANK, hull);
  b.spire(-len / 2 - 1.2, y, 0, wid / 2, 1.7, 4, Math.PI / 4, T.PLANK, hull);
  if (cargo) {
    for (let i = 0; i < 3; i++) {
      b.box(-len * 0.2 + i * len * 0.2, y + 1.5, (rng() - 0.5) * wid * 0.3, 2.4, 1.2, wid * 0.55, 0,
        { side: T.PLANK, top: T.PLANK }, [0.78, 0.72, 0.58], 2);
    }
    b.gableRoof(len * 0.22, y + 1.5, 0, 4.5, wid * 0.8, 1.3, 0, T.SHINGLE, [0.8, 0.78, 0.7], 0.3);
  }
  // steering oar
  b.box(-len / 2 - 1.5, y + 1.3, 0, 4.5, 0.2, 0.3, 0.2, { side: T.PLANK, top: null }, [0.5, 0.44, 0.34]);
  return b;
}

export function buildBoats(THREE, material) {
  const rng = makeRng(321);
  const group = new THREE.Group();
  const specs = [
    { s: 0.36, len: 17, wid: 4.2, cargo: true, speed: 0.012 },
    { s: 0.52, len: 13, wid: 3.6, cargo: true, speed: 0.010 },
    { s: 0.64, len: 9, wid: 3.0, cargo: false, speed: 0.014 },
    { s: 0.30, len: 11, wid: 3.4, cargo: false, speed: -0.004 },   // poling upstream
    { s: 0.46, len: 20, wid: 4.6, cargo: true, speed: 0.011 },
  ];
  for (const sp of specs) {
    const b = new Builder();
    barge(b, sp.len, sp.wid, sp.cargo, rng);
    const mesh = new THREE.Mesh(b.build(THREE), material);
    mesh.userData = sp;
    group.add(mesh);
  }
  // a timber raft coming down from the Alb forests
  {
    const b = new Builder();
    for (let i = 0; i < 9; i++) b.box(0, WATER_Y - 0.25, -4 + i, 22, 0.55, 1.0, 0, { side: T.PLANK, top: T.PLANK }, [0.66, 0.58, 0.44], 3);
    b.box(6, WATER_Y + 0.3, 0, 2.4, 1.6, 2.0, 0, { side: T.PLANK, top: T.PLANK }, [0.7, 0.62, 0.48], 2);
    const mesh = new THREE.Mesh(b.build(THREE), material);
    mesh.userData = { s: 0.24, len: 22, wid: 9, speed: 0.009 };
    group.add(mesh);
  }
  group.name = 'boats';
  return group;
}

// ------------------------------------------------------------ static props --
export function buildProps() {
  const b = new Builder();
  const rng = makeRng(808);

  // --- roads radiating from the gates across the open field ----------------
  const roadTargets = {
    herdbrucker: [230, 1500], gaens: [-900, 700], ehinger: [-1500, 60],
    goeckler: [-1100, -900], neu: [-60, -1400], frauen: [1100, -700],
  };
  for (const [key, target] of Object.entries(roadTargets)) {
    const g = GATES[key];
    const pts = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = g.at[0] + (target[0] - g.at[0]) * t + Math.sin(t * 5 + key.length) * 40 * t;
      const z = g.at[1] + (target[1] - g.at[1]) * t + Math.cos(t * 4 + key.length) * 40 * t;
      pts.push([x, z]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      if (polyDistance(DANUBE, (x0 + x1) / 2, (z0 + z1) / 2).d < 62) continue;   // the river needs the bridge
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const nx = -uz * 3.2, nz = ux * 3.2;
      const y0 = terrainHeight(x0, z0) + 0.12, y1 = terrainHeight(x1, z1) + 0.12;
      b.quad([x0 + nx, y0, z0 + nz], [x1 + nx, y1, z1 + nz], [x1 - nx, y1, z1 - nz], [x0 - nx, y0, z0 - nz],
        T.DIRT, [1, 0.98, 0.94], Math.max(1, Math.round(len / 12)), 1);
    }
  }
  // the road on the far bank continuing from the bridge towards Bavaria
  {
    const [x0, z0] = BRIDGE.to;
    for (let i = 0; i < 12; i++) {
      const t = i / 12, t2 = (i + 1) / 12;
      const p = (t) => [x0 + 90 * t + Math.sin(t * 4) * 30, z0 + 900 * t];
      const [ax, az] = p(t), [bx, bz] = p(t2);
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      b.quad([ax - uz * 3.4, terrainHeight(ax, az) + 0.12, az + ux * 3.4],
        [bx - uz * 3.4, terrainHeight(bx, bz) + 0.12, bz + ux * 3.4],
        [bx + uz * 3.4, terrainHeight(bx, bz) + 0.12, bz - ux * 3.4],
        [ax + uz * 3.4, terrainHeight(ax, az) + 0.12, az - ux * 3.4],
        T.DIRT, [1, 0.98, 0.94], Math.max(1, Math.round(len / 12)), 1);
    }
  }

  // --- the bleaching greens -------------------------------------------------
  // Ulm's wealth was fustian (barchent), linen warp and cotton weft. Some
  // 60,000 pieces a year were bleached here in the 15th century; the cloth was
  // laid out in strips on the meadows by the water.
  const bleachAreas = [[-560, 520], [-760, 430], [330, 560], [520, 610], [-300, 620]];
  for (const [bx, bz] of bleachAreas) {
    for (let i = 0; i < 26; i++) {
      const x = bx + (rng() - 0.5) * 150, z = bz + (rng() - 0.5) * 90;
      if (polyDistance(DANUBE, x, z).d < 66) continue;
      const y = terrainHeight(x, z) + 0.14;
      const ang = 0.35 + rng() * 0.2;
      b.box(x, y, z, 2.6 + rng() * 1.2, 0.05, 16 + rng() * 14, ang, { side: T.BLANK, top: T.BLANK }, [1.0, 0.99, 0.95]);
    }
    // the bleacher's hut and water trough
    b.box(bx + 40, terrainHeight(bx + 40, bz - 40) , bz - 40, 5, 3, 4, 0.3, { side: T.PLANK, top: null }, [0.72, 0.64, 0.5], 3);
    b.gableRoof(bx + 40, terrainHeight(bx + 40, bz - 40) + 3, bz - 40, 5, 4, 2.2, 0.3, T.THATCH, [0.9, 0.85, 0.7], 0.4);
  }

  // --- scattered trees, orchards and hedgerows ------------------------------
  const tree = (x, z, scale, kind) => {
    const y = terrainHeight(x, z);
    const h = (6 + rng() * 5) * scale;
    b.prism(x, y, z, 0.35 * scale, h * 0.45, 5, rng(), { side: T.PLANK, top: null }, [0.45, 0.38, 0.3], 0, false);
    const col = [0.5 + rng() * 0.22, 0.62 + rng() * 0.2, 0.36 + rng() * 0.16];
    if (kind === 'conifer') {
      b.spire(x, y + h * 0.3, z, h * 0.34, h * 0.9, 6, rng(), T.FOLIAGE, [col[0] * 0.8, col[1] * 0.85, col[2] * 0.8]);
    } else {
      b.prism(x, y + h * 0.42, z, h * 0.42, h * 0.3, 6, rng(), { side: T.FOLIAGE, top: T.FOLIAGE }, col, 0, false);
      b.spire(x, y + h * 0.72, z, h * 0.44, h * 0.5, 6, rng(), T.FOLIAGE, col);
      b.spire(x, y + h * 0.42, z, h * 0.44, -h * 0.34, 6, rng(), T.FOLIAGE, [col[0] * 0.7, col[1] * 0.72, col[2] * 0.66]);
    }
  };
  for (let i = 0; i < 620; i++) {
    const a = rng() * Math.PI * 2, r = 120 + Math.pow(rng(), 0.6) * 1500;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85 + 60;
    if (insideWall(x, z) || wallDistance(x, z) < 26) continue;
    if (polyDistance(DANUBE, x, z).d < 70) continue;
    tree(x, z, 0.8 + rng() * 0.6, rng() < 0.22 ? 'conifer' : 'broad');
  }
  // gardens and a few big trees inside the walls, in the convent precincts
  for (let i = 0; i < 90; i++) {
    const x = -420 + rng() * 880, z = -360 + rng() * 740;
    if (!insideWall(x, z)) continue;
    if (Math.hypot(x, z) < 110) continue;
    tree(x, z, 0.55 + rng() * 0.35, 'broad');
  }
  // willows and alders along the river banks
  for (let i = 0; i < 150; i++) {
    const s = rng();
    const p = danubeAt(s);
    const side = rng() < 0.5 ? -1 : 1;
    const x = p.x - Math.sin(p.ang) * side * (72 + rng() * 40);
    const z = p.z + Math.cos(p.ang) * side * (72 + rng() * 40);
    if (insideWall(x, z)) continue;
    tree(x, z, 0.6 + rng() * 0.4, 'broad');
  }

  // --- outside the gates: chapel, gallows, kilns ---------------------------
  // A wayside chapel on the road south, beyond the bridge.
  {
    const x = 262, z = 760, y = terrainHeight(x, z);
    b.box(x, y, z, 9, 6, 6, 0.2, { side: T.RUBBLE, top: null }, [0.96, 0.94, 0.9], 3);
    b.gableRoof(x, y + 6, z, 9, 6, 4, 0.2, T.ROOF_TILE, [0.88, 0.7, 0.62], 0.5);
    b.prism(x + 3, y + 10, z, 1.2, 3, 4, 0.2, { side: T.PLANK, top: null }, [0.6, 0.55, 0.45], 0, false);
    b.spire(x + 3, y + 13, z, 1.5, 3, 4, 0.2, T.SHINGLE, [0.74, 0.72, 0.66]);
  }
  // The gallows stood in plain sight of the roads: a right of the imperial city.
  {
    const x = -760, z = -520, y = terrainHeight(x, z);
    for (const dx of [-3, 3]) b.box(x + dx, y, z, 0.5, 6, 0.5, 0, { side: T.PLANK, top: null }, [0.45, 0.4, 0.32]);
    b.box(x, y + 6, z, 7.4, 0.5, 0.5, 0, { side: T.PLANK, top: null }, [0.45, 0.4, 0.32]);
  }
  // brick and lime kilns downwind of the town, by the river
  for (const [x, z] of [[620, 430], [700, 470]]) {
    const y = terrainHeight(x, z);
    b.prism(x, y, z, 4.5, 6, 8, 0, { side: T.BRICK, top: null }, [0.95, 0.9, 0.86], 4, false);
    b.prism(x, y + 6, z, 3.2, 2.5, 8, 0, { side: T.BRICK, top: T.BRICK }, [0.9, 0.85, 0.8], 3, true);
  }

  // --- carts and waggons on the roads and in the market --------------------
  const cart = (x, z, ang, load) => {
    const y = terrainHeight(x, z) + 0.6;
    b.box(x, y, z, 4.2, 1.1, 2.0, ang, { side: T.PLANK, top: T.PLANK }, [0.66, 0.56, 0.4], 2);
    if (load) b.box(x, y + 1.1, z, 3.6, 1.2, 1.7, ang, { side: T.THATCH, top: T.THATCH }, [0.95, 0.9, 0.7], 2);
    for (const dx of [-1.5, 1.5]) for (const dz of [-1.1, 1.1]) {
      const wx = x + Math.cos(ang) * dx - Math.sin(ang) * dz;
      const wz = z + Math.sin(ang) * dx + Math.cos(ang) * dz;
      b.prism(wx, y - 0.6, wz, 0.75, 0.2, 8, 0, { side: T.PLANK, top: T.PLANK }, [0.5, 0.44, 0.34], 0, true);
    }
    // the ox team
    for (const d of [3.2, 4.8]) {
      const ox = x + Math.cos(ang) * d, oz = z + Math.sin(ang) * d;
      b.box(ox, terrainHeight(ox, oz) + 0.7, oz, 2.2, 1.1, 0.9, ang, { side: T.BLANK, top: T.BLANK }, [0.42, 0.34, 0.26], 0);
    }
  };
  for (let i = 0; i < 16; i++) {
    const g = Object.values(GATES)[i % 6];
    const t = 0.1 + rng() * 0.8;
    const x = g.at[0] * (1 + t * 0.5) + (rng() - 0.5) * 30;
    const z = g.at[1] * (1 + t * 0.5) + (rng() - 0.5) * 30;
    if (insideWall(x, z) || polyDistance(DANUBE, x, z).d < 70) continue;
    cart(x, z, rng() * 6.28, rng() < 0.6);
  }

  // --- flocks and herds on the meadows -------------------------------------
  for (let i = 0; i < 90; i++) {
    const a = rng() * 6.28, r = 500 + rng() * 900;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 + 300;
    if (insideWall(x, z) || polyDistance(DANUBE, x, z).d < 70) continue;
    const y = terrainHeight(x, z) + 0.5;
    const white = rng() < 0.7;
    b.box(x, y, z, 1.3, 0.8, 0.7, rng() * 6.28, { side: T.BLANK, top: T.BLANK },
      white ? [0.86, 0.84, 0.78] : [0.4, 0.33, 0.26], 0);
  }

  return b;
}

// ------------------------------------------------------------------ birds ---
export function buildBirds(THREE) {
  const rng = makeRng(555);
  const b = new Builder();
  for (let i = 0; i < 26; i++) {
    const x = (rng() - 0.5) * 60, y = (rng() - 0.5) * 22, z = (rng() - 0.5) * 60;
    const s = 0.5 + rng() * 0.5;
    b.tri([x - 1.6 * s, y, z], [x, y + 0.5 * s, z - 0.5 * s], [x + 1.6 * s, y, z],
      [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.16, 0.15, 0.14]);
    b.tri([x + 1.6 * s, y, z], [x, y + 0.5 * s, z + 0.5 * s], [x - 1.6 * s, y, z],
      [0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.16, 0.15, 0.14]);
  }
  const g = b.build(THREE);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'birds';
  return mesh;
}

// ------------------------------------------------------------------ smoke ---
// Thin hearth smoke drifting off the roofs: quads that always face the camera
// are too costly here, so these are simple crossed planes.
export function buildSmoke(THREE) {
  const rng = makeRng(606);
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd8d4cc, transparent: true, opacity: 0.16, depthWrite: false, fog: true,
  });
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const x = -420 + rng() * 860, z = -340 + rng() * 730;
    if (!insideWall(x, z)) { i--; continue; }
    spots.push([x, z, rng()]);
  }
  for (const [x, z, ph] of spots) {
    const h = 26 + rng() * 34;
    const g = new THREE.PlaneGeometry(6 + rng() * 6, h);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, TOWN_Y + 16 + h / 2, z);
    m.userData.phase = ph;
    group.add(m);
    const m2 = m.clone();
    m2.rotation.y = Math.PI / 2;
    group.add(m2);
  }
  group.name = 'smoke';
  return group;
}
