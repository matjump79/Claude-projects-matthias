"""Second pass: Wikimedia Commons only, sequential and rate-limit friendly. Merges into candidates.json."""
import json, time, pathlib, requests
from io import BytesIO
from PIL import Image
import collect_photos as cp

cp.S.headers["User-Agent"] = "VintageHiFiDatabase/1.0 (https://github.com/matjump79/claude-projects-matthias) python-requests"
_get = cp.S.get
def polite_get(url, **kw):
    for attempt in range(6):
        r = _get(url, **kw)
        if r.status_code != 429:
            time.sleep(1.5)
            return r
        wait = int(r.headers.get("retry-after", "0") or 0) or 20 * (attempt + 1)
        print("  429, waiting", wait, flush=True); time.sleep(wait)
    return r
cp.S.get = polite_get

HERE = pathlib.Path(__file__).parent
products = json.loads((HERE / "products.json").read_text())
cands = json.loads((HERE / "candidates.json").read_text())
for p in products:
    try:
        found = cp.commons(p)
    except Exception as e:
        print("err", p["id"], e); continue
    have = {c["src"] for c in cands.get(p["id"], [])}
    new = []
    for i, c in enumerate(found[:3]):
        if c["src"] in have: continue
        try:
            r = cp.S.get(c["src"], timeout=40); im = Image.open(BytesIO(r.content)); im.load()
        except Exception:
            continue
        f = cp.CAND / p["id"] / f"c{i}.jpg"; f.parent.mkdir(parents=True, exist_ok=True)
        im.convert("RGB").save(f, quality=88)
        c.update(file=str(f.relative_to(HERE)), w=im.width, h=im.height); new.append(c)
    cands[p["id"]] = new + cands.get(p["id"], [])
    print(p["id"], "commons:", len(new), flush=True)
    (HERE / "candidates.json").write_text(json.dumps(cands, indent=1, ensure_ascii=False))
