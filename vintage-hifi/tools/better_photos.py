"""For entries whose photo looks like a printed page, try the other images on the same HiFi-Wiki page
and keep the most photo-like one. Writes tools/hw/photo_kind.json: {file id: "photo" | "catalogue"}."""
import gzip, json, pathlib, re, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from docscore import docscore
T = pathlib.Path(__file__).parent; ROOT = T.parent; PH = ROOT / "photos" / "hw"
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
CUT = 2.75
sc = json.loads((T / "hw" / "docscore.json").read_text())
js = (ROOT / "data" / "hifiwiki.js").read_text(encoding="utf-8")
entries = json.loads(js[js.index("["): js.rindex("]") + 1])

def page_file(url):
    title = url.split("/index.php/", 1)[1]
    return T / "hw" / "pages" / (re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.unquote(title))[:150] + ".html.gz")

KF = T / "hw" / "photo_kind.json"
done = json.loads(KF.read_text()) if KF.exists() else {}

def improve(e):
    fid = pathlib.Path(e["ph"]).stem
    if fid in done: return fid, done[fid]
    if fid not in sc and (PH / f"{fid}.jpg").exists(): sc[fid] = docscore(PH / f"{fid}.jpg")
    cur = sc.get(fid, [9])[0]
    if cur < CUT: return fid, "photo"
    try:
        s = gzip.decompress(page_file(e["u"]).read_bytes()).decode("utf-8", "ignore")
    except Exception:
        return fid, "catalogue"
    body = s.split('id="mw-content-text"', 1)[-1]
    imgs = [urllib.parse.urljoin("https://www.hifi-wiki.de", i) for i in re.findall(r'<img[^>]+src="(/images/[^"]+\.(?:jpe?g|png))"', body, re.I)]
    imgs = [i for i in dict.fromkeys(imgs) if i != e.get("i")][:6]
    best = (cur, None)
    for u in imgs:
        try:
            r = S.get(u, timeout=60); time.sleep(0.3)
            im = Image.open(BytesIO(r.content)).convert("RGB")
        except Exception:
            continue
        if im.width < 250: continue
        d = docscore(im)[0]
        if d < best[0]: best = (d, im)
    if best[1] is not None and best[0] < CUT:
        im = best[1]; im.thumbnail((400, 300), Image.LANCZOS)
        im.save(PH / f"{fid}.jpg", quality=72, optimize=True, progressive=True)
        return fid, "photo"
    return fid, "catalogue"

todo = [e for e in entries if "ph" in e]
kind = {}
with ThreadPoolExecutor(3) as ex:
    for n, (fid, k) in enumerate(ex.map(improve, todo), 1):
        kind[fid] = k
        if n % 250 == 0: print(n, "/", len(todo), sum(v == "catalogue" for v in kind.values()), "catalogue so far", flush=True)
KF.write_text(json.dumps(kind)); (T / "hw" / "docscore.json").write_text(json.dumps(sc))
print("done", sum(v == "photo" for v in kind.values()), "photos,", sum(v == "catalogue" for v in kind.values()), "catalogue pages")
