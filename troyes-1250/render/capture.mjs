// capture.mjs — render the frame, in tiles, and stitch it.
//
// Chromium here rasterises WebGL in software (SwiftShader). Asking it for one
// 7680x4320 drawing buffer is asking for trouble: the allocation is large, and
// if it fails it tends to fail silently with a black frame. So the frame is cut
// into a grid of ordinary-sized tiles, each rendered with an offset projection,
// and glued together afterwards. The scene, the lights and the shadow map are
// identical across tiles, so the seams are exact.

import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { argv } from 'node:process';

const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const FULL_W = +arg('w', 7680);
const FULL_H = +arg('h', 4320);
const TILES = +arg('tiles', 4);
const VIEW = arg('view', 'master');
const OUT = arg('out', `out/stills/${VIEW}.jpg`);
const PORT = +arg('port', 8111);
const SHADOWS = arg('shadows', '1');
const SEED = arg('seed', '20250724');
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

const TMP = `/tmp/troyes-tiles-${VIEW}`;

async function main() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT.split('/').slice(0, -1).join('/') || '.', { recursive: true });

  console.log(`${FULL_W}x${FULL_H} as ${TILES}x${TILES} tiles of ${TILE_W}x${TILE_H} — view "${VIEW}"`);

  const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const page = await browser.newPage({
    viewport: { width: TILE_W, height: TILE_H }, deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console]', m.text());
    else if (m.type() === 'log') console.log('[page]', m.text());
  });

  const url = `http://127.0.0.1:${PORT}/scene/index.html`
    + `?w=${TILE_W}&h=${TILE_H}&shadows=${SHADOWS}&seed=${SEED}`;
  await page.goto(url, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction('window.__troyesReady === true', null, { timeout: 900000 });

  const info = await page.evaluate(() => ({
    stats: window.__troyes.stats,
    triangles: window.__troyes.triangles,
    buildMs: Math.round(window.__troyes.buildMs),
    views: window.__troyes.views,
  }));
  console.log(`scene built in ${(info.buildMs / 1000).toFixed(1)} s, ${info.triangles.toLocaleString()} triangles`);
  console.log('  ' + Object.entries(info.stats).map(([k, v]) => `${k}=${v.toLocaleString()}`).join('  '));

  const started = Date.now();
  let n = 0;
  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      await page.evaluate(
        ([v, t, x, y]) => window.__troyes.renderTile(v, t, x, y),
        [VIEW, TILES, tx, ty],
      );
      await page.screenshot({
        path: `${TMP}/t_${String(ty).padStart(2, '0')}_${String(tx).padStart(2, '0')}.png`,
        type: 'png',
      });
      n++;
      const el = (Date.now() - started) / 1000;
      console.log(`  tile ${n}/${TILES * TILES}  (${el.toFixed(0)}s elapsed, eta ${((el / n) * (TILES * TILES - n)).toFixed(0)}s)`);
    }
  }
  await browser.close();

  console.log('stitching...');
  const r = spawnSync('python3', ['render/stitch.py', TMP, OUT, String(TILES), String(TILE_W), String(TILE_H), String(QUALITY)], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('stitch failed');
  rmSync(TMP, { recursive: true, force: true });
  console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)} min -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
