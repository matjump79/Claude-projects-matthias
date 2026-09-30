"""Try extra pages (hifi-wiki.de guesses and hand-picked URLs) for products without candidates."""
import json, pathlib, sys
from io import BytesIO
from PIL import Image
import collect_photos as cp
HERE = pathlib.Path(__file__).parent
products = {p["id"]: p for p in json.loads((HERE / "products.json").read_text())}
EXTRA = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
cands = json.loads((HERE / "candidates.json").read_text())
for pid, p in products.items():
    if cands.get(pid) and pid not in EXTRA: continue
    b = p["brand"].split(" /")[0].replace(" ", "_"); m = p["model"].split(" (")[0].replace(" ", "_")
    urls = EXTRA.get(pid, []) + [f"https://www.hifi-wiki.de/index.php/{b}_{m}", f"https://hifi-wiki.com/index.php/{b}_{m}"]
    found = []
    for u in urls:
        found += cp.page_images(p, u)
    kept = []
    for i, c in enumerate(found[:6]):
        try:
            r = cp.S.get(c["src"], timeout=40, headers={"Referer": c["page"], "User-Agent": "Mozilla/5.0 Safari/605.1.15"})
            im = Image.open(BytesIO(r.content)); im.load()
        except Exception: continue
        if im.width < 300: continue
        f = cp.CAND / pid / f"x{i}.jpg"; f.parent.mkdir(parents=True, exist_ok=True)
        im.convert("RGB").save(f, quality=88); c.update(file=str(f.relative_to(HERE)), w=im.width, h=im.height); kept.append(c)
    cur = json.loads((HERE / "candidates.json").read_text())
    cur[pid] = cur.get(pid, []) + kept
    (HERE / "candidates.json").write_text(json.dumps(cur, indent=1, ensure_ascii=False))
    print(pid, len(kept), flush=True)
