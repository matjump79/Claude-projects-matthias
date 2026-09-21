# Ulm 1500 — a rendered flight over the Free Imperial City

A 3½-minute film: one unbroken aerial move over Ulm as it stood around the
year 1500, built as a procedural 3-D reconstruction and rendered frame by
frame.

| | |
|---|---|
| **Film** | `out/ulm-1500.mp4` — 1280×720, 24 fps, 3 min 32 s, H.264 + AAC |
| **Historical apparatus** | [`docs/HISTORICAL-NOTES.md`](docs/HISTORICAL-NOTES.md) — what is documented, what is inferred, what is invented, with sources |
| **Scene** | `scene/` — the model, written in JavaScript against three.js |
| **Renderer** | `render/` — headless Chromium frame capture, then ffmpeg |
| **Score** | `music/compose.py` — an original period-style piece, synthesised from scratch |

## What you are looking at

The flight follows the viewpoint of the **oldest surviving picture of Ulm** —
the woodcut in Hartmann Schedel's *Liber chronicarum* (Nuremberg, 1493), a
panorama from the south — then comes down to the bridge, runs along the river
wall, crosses the fishermen's quarter, circles the Minster, passes the town
hall, goes out over the fields, and climbs away.

The reconstruction is deliberately **not** the Ulm of the postcards. In 1500:

- the Minster's tower is a **stump** at about 70 m under a makeshift pyramid
  roof — work stopped after stones fell from the vault in 1492, and the spire
  is only finished in **1890**;
- the nave is still **three-aisled**; Engelberg's rebuilding into five runs
  1502–07;
- the town hall has **no painted façade and no astronomical clock** — both come
  after 1520;
- the wall stands **in the Danube**, as it was built in 1480;
- and the meadows outside the walls are white with **fustian laid out to
  bleach**, which is where the money came from.

Read `docs/HISTORICAL-NOTES.md` before drawing any conclusions from the film:
it is explicit about which details are evidenced and which are informed
guesswork.

## How it is made

There is no GPU in the build environment, so everything is rasterised in
software (SwiftShader) inside headless Chromium. That constraint shaped the
design:

- **One texture atlas.** All facades, roofs, masonry, crops and water are
  painted procedurally into a single 2048² canvas (`scene/js/atlas.js`), so the
  whole city draws in a handful of calls.
- **Merged geometry.** Buildings are accumulated into a few large buffers by a
  small geometry builder (`scene/js/geom.js`) rather than being separate
  objects.
- **Deterministic everything.** A seeded PRNG drives the city, so frame *n*
  renders identically on every run and the film can be resumed or re-rendered
  in pieces.
- **Frames, not real time.** The page exposes `window.__ulm.render(t)`; the
  capture script steps `t` in 1/24 s intervals and screenshots each frame.
  Nothing depends on wall-clock timing.
- **Supersampling.** Rendered at 1920×1080 and resampled to 1280×720, which
  buys anti-aliasing the software rasteriser will not give for free.

## Reproducing it

```bash
npm install                       # three.js + playwright
npm run serve &                   # static server on 127.0.0.1:8099
python3 music/compose.py          # writes music/ulm-1500.wav  (needs numpy)
node render/capture.mjs --w=1920 --h=1080 --workers=4   # ~5,000 frames
bash render/encode.sh             # frames + score -> out/ulm-1500.mp4
```

Useful flags for `capture.mjs`:

| Flag | Meaning |
|---|---|
| `--only=12,90,196` | render single stills at those times instead of the film |
| `--from=60 --to=90` | render a range of seconds |
| `--resume` | skip frames already on disk |
| `--shadows=0` | drop the shadow pass (about 25 % faster) |
| `--workers=N` | parallel browser processes |

To look at the scene live in a browser, open
`http://127.0.0.1:8099/scene/index.html?preview=1&w=1280&h=720`.

## Layout

```
scene/js/plan.js       the city plan: wall circuit, gates, rivers, landmarks, terrain function
scene/js/terrain.js    landscape, strip fields, woods, the Danube and the Blau
scene/js/minster.js    the Minster in its 1500 state
scene/js/walls.js      fortifications, gates, the Metzgerturm, the bridge
scene/js/town.js       burgher houses, town hall, convents, mills, market
scene/js/props.js      river craft, roads, bleaching greens, trees, carts
scene/js/sky.js        sky shader, sun, cloud layers
scene/js/flight.js     the camera move
scene/js/titles.js     the captions
```
