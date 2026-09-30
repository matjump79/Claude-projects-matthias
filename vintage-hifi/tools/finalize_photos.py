"""Turn the hand-verified picks into web-sized photos plus a manifest (data/photos.js)."""
import json, pathlib
from PIL import Image
H = pathlib.Path(__file__).parent; ROOT = H.parent
picks = json.loads((H / "picks.json").read_text())
cr = json.loads((H / "cand_relaxed.json").read_text())
RELAXED = {"sony-str-v7": 1, "luxman-l-58a": 0, "technics-sl-10": 0, "mcintosh-mac-4100": 1, "saba-9241-digital": 2,
    "grundig-r-3000": 1, "marantz-sr-8100dc": 0, "accuphase-e-303": 0, "technics-su-a2": 1, "thorens-td-126-mkiii": 2,
    "dual-cs-505": 0, "rega-planar-3": 0, "bang-olufsen-beogram-8000": 1, "kenwood-l-07d": 0, "pioneer-exclusive-p3": 0,
    "denon-dp-80": 3, "quad-44": 1, "braun-a-501": 2, "harman-kardon-citation-xx": 1, "hafler-dh-200": 0,
    "verdier-la-platine-verdier": 1, "onkyo-a-8017-integra": 0}
for k, i in RELAXED.items():
    picks[k] = cr[k][i]
out = ROOT / "photos"; out.mkdir(exist_ok=True)
manifest = {}
for k, c in sorted(picks.items()):
    im = Image.open(H / c["file"]).convert("RGB")
    im.thumbnail((720, 540), Image.LANCZOS)
    f = out / f"{k}.jpg"
    im.save(f, quality=78, optimize=True, progressive=True)
    manifest[k] = {"src": f"photos/{k}.jpg", "site": c.get("site") or "commons.wikimedia.org", "page": c["page"]}
(ROOT / "data" / "photos.js").write_text(
    "// Hand-checked product photos: file, and the page it was taken from (shown as credit).\n"
    "window.HIFI_PHOTOS = " + json.dumps(manifest, indent=1) + ";\n")
print(len(manifest), "photos,", sum(f.stat().st_size for f in out.iterdir()) // 1024, "KB")
