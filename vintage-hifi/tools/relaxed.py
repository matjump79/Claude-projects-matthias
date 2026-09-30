"""Relaxed pass for products without a good photo: take the main content images of each source page."""
import json, re, sys, pathlib, urllib.parse
from io import BytesIO
from PIL import Image
import collect_photos as cp
H = pathlib.Path(__file__).parent
products = {p["id"]: p for p in json.loads((H / "products.json").read_text())}
want = sys.argv[1].split(",")
extra = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
BAD = re.compile(r"logo|icon|banner|avatar|flag|ebayimg|gifbanner|/dates/|sprite|button|schematic|thumb_|/skins/|poweredby|gravatar|emoji|ads?/", re.I)
out = json.loads((H / "relaxed.json").read_text()) if (H / "relaxed.json").exists() else {}
for pid in want:
    p = products[pid]
    urls = extra.get(pid, []) + list(dict.fromkeys([p["photos"]] + p["sources"]))
    kept = []
    for u in urls:
        try:
            r = cp.S.get(u, timeout=25, headers={"User-Agent": "Mozilla/5.0 (Macintosh) Safari/605.1.15"})
        except Exception:
            continue
        if r.status_code != 200: continue
        srcs = re.findall(r"""<img[^>]+?src=["']([^"']+)["']""", r.text, re.I)
        srcs += re.findall(r"""property=["']og:image["'][^>]+content=["']([^"']+)""", r.text, re.I)
        n = 0
        for s in dict.fromkeys(srcs):
            full = urllib.parse.urljoin(r.url, s)
            if BAD.search(full) or not re.search(r"\.(jpe?g|png|webp)(\?|$)", full, re.I): continue
            try:
                ir = cp.S.get(full, timeout=25, headers={"Referer": u, "User-Agent": "Mozilla/5.0 Safari/605.1.15"})
                im = Image.open(BytesIO(ir.content)); im.load()
            except Exception: continue
            if im.width < 350 or im.height < 180: continue
            f = H / "cand" / pid / f"r{len(kept)}.jpg"; f.parent.mkdir(parents=True, exist_ok=True)
            im.convert("RGB").save(f, quality=88)
            kept.append({"kind": "page", "src": full, "page": u, "site": urllib.parse.urlparse(u).netloc.replace("www.", ""),
                         "file": str(f.relative_to(H)), "w": im.width, "h": im.height})
            n += 1
            if n >= 3 or len(kept) >= 6: break
        if len(kept) >= 6: break
    out[pid] = kept
    print(pid, len(kept), flush=True)
    (H / "relaxed.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
