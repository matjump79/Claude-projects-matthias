// still.mjs — render one frame of the flight as a large still, in tiles.
//
// The film renderer (capture.mjs) draws a whole frame in one pass, which is
// right for 1920x1080 at 24 fps. A print-sized still is a different problem:
// Chromium rasterises WebGL in software here, and asking it for a single
// 7680x4320 drawing buffer is an allocation that tends to fail silently and
// come back black. So the frame is cut into tiles, each drawn with its
// projection offset, and stitched afterwards. The scene, the lights and the
// shadow map are identical across tiles, so the seams are exact.

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { argv } from 'node:process';

const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const FULL_W = +arg('w', 7680);
const FULL_H = +arg('h', 4320);
const TILES = +arg('tiles', 4);
const T = +arg('t', 0);
const NAME = arg('name', `still-${T}`);
const OUT = arg('out', `out/stills/${NAME}.jpg`);
const PORT = +arg('port', 8098);
const SHADOWS = arg('shadows', '1');
const CAPTIONS = arg('captions', '0');
const SMAP = arg('smap', '4096');
const QUALITY = +arg('quality', 95);

const TILE_W = Math.round(FULL_W / TILES);
const TILE_H = Math.round(FULL_H / TILES);

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage', '--disable-background-timer-throttling',
  '--js-flags=--max-old-space-size=6144',
];

const TMP = `/tmp/ulm-tiles-${NAME.replace(/\W/g, '_')}`;

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true });

  console.log(`${NAME}: t=${T}s  ${FULL_W}x${FULL_H} as ${TILES}x${TILES} tiles of ${TILE_W}x${TILE_H}`);

  const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const page = await browser.newPage({
    viewport: { width: TILE_W, height: TILE_H }, deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

  const url = `http://127.0.0.1:${PORT}/scene/index.html`
    + `?w=${TILE_W}&h=${TILE_H}&shadows=${SHADOWS}&captions=${CAPTIONS}&smap=${SMAP}`;
  await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction('window.__ulmReady === true', null, { timeout: 900000 });

  const info = await page.evaluate(() => ({
    triangles: window.__ulm.triangles,
    buildMs: Math.round(window.__ulm.buildMs),
    stats: window.__ulm.stats,
  }));
  console.log(`  scene built in ${(info.buildMs / 1000).toFixed(1)} s, ${info.triangles.toLocaleString()} triangles`);

  const started = Date.now();
  let n = 0;
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      await page.evaluate(
        ([t, tiles, x, y]) => window.__ulm.renderTile(t, tiles, x, y),
        [T, TILES, tx, ty],
      );
      await page.screenshot({
        path: `${TMP}/t_${String(ty).padStart(2, '0')}_${String(tx).padStart(2, '0')}.png`,
        type: 'png',
      });
      n++;
      if (n % 4 === 0 || n === TILES * TILES) {
        const el = (Date.now() - started) / 1000;
        console.log(`  tile ${n}/${TILES * TILES}  (${el.toFixed(0)}s, eta ${((el / n) * (TILES * TILES - n)).toFixed(0)}s)`);
      }
    }
  }
  await browser.close();

  const r = spawnSync('python3', ['render/stitch.py', TMP, OUT, String(TILES), String(TILE_W), String(TILE_H), String(QUALITY)], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('stitch failed');
  rmSync(TMP, { recursive: true, force: true });
  console.log(`  -> ${OUT}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
