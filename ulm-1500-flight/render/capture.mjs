// Frame renderer. Opens the scene in headless Chromium (WebGL via SwiftShader,
// software rasterised), drives it frame by frame at fixed timesteps, and
// writes JPEGs for ffmpeg. Frames are split across several browser processes.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { argv } from 'node:process';

const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (k) => argv.includes(`--${k}`);

const FPS = +arg('fps', 24);
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const WORKERS = +arg('workers', 4);
const OUT = arg('out', 'frames');
const PORT = +arg('port', 8099);
const SHADOWS = arg('shadows', '1');
const FROM = +arg('from', 0);
const TO = arg('to', null);
const ONLY = arg('only', null);          // comma-separated times, for stills
const RESUME = flag('resume');

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist',
  '--disable-dev-shm-usage', '--disable-background-timer-throttling',
  '--js-flags=--max-old-space-size=3072',
];

const pad = (n) => String(n).padStart(5, '0');

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  const url = `http://127.0.0.1:${PORT}/scene/index.html?w=${W}&h=${H}&shadows=${SHADOWS}`;
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction('window.__ulmReady === true', null, { timeout: 300000 });
  return page;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const probe = await openPage(browser);
  const info = await probe.evaluate(() => ({
    duration: window.__ulm.DURATION, stats: window.__ulm.stats,
    triangles: window.__ulm.triangles, buildMs: Math.round(window.__ulm.buildMs),
  }));
  console.log(`scene built in ${info.buildMs} ms, ${info.triangles.toLocaleString()} triangles`);
  console.log('  ' + Object.entries(info.stats).map(([k, v]) => `${k}=${v.toLocaleString()}`).join('  '));

  let times = [];
  if (ONLY) {
    times = ONLY.split(',').map(Number).map((t, i) => ({ t, i }));
  } else {
    const end = TO === null ? info.duration : +TO;
    const total = Math.round((end - FROM) * FPS);
    for (let i = 0; i < total; i++) times.push({ t: FROM + i / FPS, i: Math.round(FROM * FPS) + i });
  }

  if (RESUME) {
    const have = new Set(readdirSync(OUT).filter((f) => f.endsWith('.jpg')));
    times = times.filter((f) => !have.has(`f${pad(f.i)}.jpg`));
    console.log(`resuming: ${times.length} frames left`);
  }

  // one shot: a still, straight from the probe page
  if (ONLY) {
    for (const { t, i } of times) {
      await probe.evaluate((tt) => window.__ulm.render(tt), t);
      await probe.screenshot({ path: `${OUT}/still_${pad(Math.round(t))}.jpg`, type: 'jpeg', quality: 94 });
      console.log(`still t=${t}s`);
    }
    await browser.close();
    return;
  }
  await probe.close();

  const chunks = Array.from({ length: WORKERS }, () => []);
  times.forEach((f, k) => chunks[k % WORKERS].push(f));

  let done = 0;
  const started = Date.now();
  const report = () => {
    done++;
    if (done % 25 === 0 || done === times.length) {
      const el = (Date.now() - started) / 1000;
      const rate = done / el;
      const eta = (times.length - done) / rate;
      console.log(`  ${done}/${times.length} frames  ${rate.toFixed(2)} fps  eta ${(eta / 60).toFixed(1)} min`);
    }
  };

  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length) return;
    const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
    const page = await openPage(b);
    for (const { t, i } of chunk) {
      await page.evaluate((tt) => window.__ulm.render(tt), t);
      await page.screenshot({ path: `${OUT}/f${pad(i)}.jpg`, type: 'jpeg', quality: 93 });
      report();
    }
    await b.close();
  }));

  await browser.close();
  console.log(`done in ${((Date.now() - started) / 60000).toFixed(1)} min`);
}

main().catch((e) => { console.error(e); process.exit(1); });
