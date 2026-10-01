"""Second photo for every unit: another view (rear, top, detail, period ad) from HiFi-Wiki or a second-source site.

Candidates per unit: all images on its HiFi-Wiki page, then audio-heritage.jp / audio-database.com /
classicreceivers.com / the HiFi-Wiki main image when another photo is shown first. Near-duplicates of the
main photo (8x8 average hash) are skipped; real photos are preferred over catalogue pages.
Output: photos/y/<id>.jpg and data/photos2.js  window.HIFI_PHOTOS2 = {id: {yc, site, page, u, k}}
"""
import json, pathlib, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from PIL import Image

T = pathlib.Path(__file__).parent; ROOT = T.parent
sys.path.insert(0, str(T))
from docscore import docscore

S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
PY = ROOT / "photos" / "y"; PY.mkdir(parents=True, exist_ok=True)
CUT = 2.75
load = lambda n: json.loads((T / "hw" / n).read_text()) if (T / "hw" / n).exists() else {}
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
slug = lambda s: re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))

def ahash(im):
    g = im.convert("L").resize((8, 8), Image.BILINEAR); px = list(g.getdata()); m = sum(px) / 64
    return sum(1 << i for i, v in enumerate(px) if v > m)
same = lambda a, b: bin(a ^ b).count("1") <= 10

def fetch(u, referer=None):
    for i in range(2):
        try:
            r = S.get(u, timeout=40, headers={"Referer": referer} if referer else {}); time.sleep(0.3)
            if r.status_code == 200: return Image.open(BytesIO(r.content)).convert("RGB")
            if r.status_code == 404: return None
        except Exception:
            pass
        time.sleep(3)
    return None

def main():
    js = (ROOT / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=ROOT))
    pages = {}
    for l in open(T / "hw" / "parsed.jsonl", encoding="utf-8"):
        d = json.loads(l); pages[d["url"]] = d.get("images", [])
    pj = (ROOT / "data" / "photos.js").read_text(); hand = json.loads(pj[pj.index("{"): pj.rindex("}") + 1])
    ej = (ROOT / "data" / "enrich.js").read_text(); enr = json.loads(ej[ej.index("{"): ej.rindex("}") + 1])
    ad, ah, cr = load("audiodb.json"), load("audioheritage.json"), load("classicreceivers.json")
    kinds = load("photo_kind.json")
    wkey = {norm(w["b"] + w["m"]): w for w in W}

    units = []   # (id, main photo file or None, [(url, site, page)])
    for w in W:
        main, extra = None, []
        if w["id"] in hand: main = ROOT / hand[w["id"]]["src"]
        elif "photo" in enr.get(w["id"], {}): main = ROOT / enr[w["id"]]["photo"]["ph"]
        elif "ph" in w: main = ROOT / w["ph"]
        if "ph" in w and main != ROOT / w["ph"]: extra.append(("file:" + w["ph"], "hifi-wiki.de", w["u"]))
        units.append((w["id"], w, main, extra))
    for p in deep:
        pid = slug(p["brand"] + "-" + p["model"]); w = wkey.get(norm(p["brand"].split(" /")[0] + p["model"]))
        if w and w["id"] == pid: continue          # same id already handled above
        main = ROOT / hand[pid]["src"] if pid in hand else None
        extra = [("file:" + w["ph"], "hifi-wiki.de", w["u"])] if w and "ph" in w else []
        units.append((pid, w, main, extra))

    def cands(pid, w, extra):
        out = list(extra)
        if w: out += [(u, "hifi-wiki.de", w["u"]) for u in pages.get(w["u"], [])]
        for src, site in ((ah, "audio-heritage.jp"), (ad, "audio-database.com"), (cr, "classicreceivers.com")):
            d = src.get(pid) or (src.get(w["id"]) if w else None)
            if d: out += [(u, site, d["url"]) for u in d.get("images", [])[:4]]
        return out

    pf = T / "hw" / "photos2.json"; res = json.loads(pf.read_text()) if pf.exists() else {}
    def work(item):
        pid, w, main, extra = item
        if pid in res or (PY / f"{pid}.jpg").exists(): return pid, None
        seen = []
        if main and main.exists():
            try: seen.append(ahash(Image.open(main).convert("RGB")))
            except Exception: pass
        best = None
        for u, site, page in cands(pid, w, extra)[:8]:
            im = Image.open(ROOT / u[5:]).convert("RGB") if u.startswith("file:") else fetch(u, page)
            if im is None or im.width < 200 or im.height < 120: continue
            h = ahash(im)
            if any(same(h, s) for s in seen): continue
            seen.append(h)
            d = docscore(im)[0]
            if best is None or (d < CUT) > (best[0] < CUT): best = (d, im, site, page, u)
            if d < CUT: break                       # a real photo: good enough
        if not best: return pid, {}
        im = best[1]; im.thumbnail((400, 300), Image.LANCZOS); im.save(PY / f"{pid}.jpg", quality=70, optimize=True, progressive=True)
        return pid, {"site": best[2], "page": best[3], "u": "" if best[4].startswith("file:") else best[4], "k": int(best[0] >= CUT)}
    print(len(units), "units", flush=True)
    with ThreadPoolExecutor(4) as ex:
        for n, (pid, info) in enumerate(ex.map(work, units), 1):
            if info is not None: res[pid] = info
            if n % 200 == 0: pf.write_text(json.dumps(res)); print(n, sum(1 for v in res.values() if v), "with second photo", flush=True)
    pf.write_text(json.dumps(res))
    have = sorted(p for p, v in res.items() if v and (PY / f"{p}.jpg").exists())
    out = {p: {"yc": i // 100, **res[p]} for i, p in enumerate(have)}
    (ROOT / "data" / "photos2.js").write_text("// Generated by tools/second_photos.py: a second photo per unit.\nwindow.HIFI_PHOTOS2 = "
                                              + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("done", len(out), "units with a second photo of", len(units))

if __name__ == "__main__":
    main()
