"""Second source #4: audio-heritage.jp (Japanese pages), for models without an English audio-database page.

Collects all model pages from the brand/category indexes, matches them to our models, parses
price, release month and the catalogue commentary (解説), and translates the commentary to English.
Output: tools/hw/audioheritage.json {our id: {url, price, released, commentary_en, images}}
"""
import gzip, html, json, pathlib, re, subprocess, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests

T = pathlib.Path(__file__).parent
OUT = T / "hw" / "ah"; (OUT / "pages").mkdir(parents=True, exist_ok=True)
BASE = "https://audio-heritage.jp/"
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

def get(url):
    for i in range(3):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200:
                return r.content.decode("utf-8", "ignore")
            if r.status_code == 404: return None
        except requests.RequestException:
            pass
        time.sleep(5 * (i + 1))
    return None

def index():
    f = OUT / "index.json"
    if f.exists(): return json.loads(f.read_text())
    home = get(BASE) or ""
    brands = sorted(set(re.findall(r'href="(?:https://audio-heritage\.jp/)?([A-Za-z0-9_()&.-]+)/index\.html"', home)))
    pages = []
    for b in brands:
        s = get(f"{BASE}{b}/index.html") or ""; time.sleep(0.3)
        cats = sorted(set(c for c in re.findall(r'href="([a-z]+/[A-Za-z0-9_-]+\.html)"', s) if not c.endswith("-e.html")))
        for c in cats:
            cs = get(f"{BASE}{b}/{c}") or ""; time.sleep(0.3)
            d = c.rsplit("/", 1)[0]
            for link in re.findall(r'href="([a-z0-9_.()-]+\.html)"', cs, re.I):
                if link.startswith("index") or link.endswith("-e.html"): continue
                pages.append({"brand_dir": b, "url": f"{BASE}{b}/{d}/{link}", "key": norm(link[:-5])})
        print("brand", b, len(pages), flush=True)
    f.write_text(json.dumps(pages)); return pages

def parse(s, url):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    imgs = [urllib.parse.urljoin(url, i) for i in re.findall(r'<img[^>]+src="([^"]+\.(?:jpe?g|JPG|png))"', t, re.I) if not re.search(r"logo|banner|icon|valuecommerce", i, re.I)]
    lines = [l.strip() for l in html.unescape(re.sub(r"<[^>]+>", "\n", t)).split("\n") if l.strip()]
    d = {"url": url, "images": imgs[:6]}
    for l in lines[:15]:
        m = re.search(r"[￥¥]\s*([\d,]+)[^(（]*[（(]\s*(\d{4})年(?:(\d{1,2})月)?", l)
        if m:
            d["price"] = f"¥{m.group(1)}"
            d["released"] = (MONTHS[int(m.group(3)) - 1] + " " if m.group(3) else "") + m.group(2)
            break
    for i, l in enumerate(lines):
        if l.replace("　", "").strip() == "解説":
            body = []
            for x in lines[i + 1:]:
                if x.startswith("機種の定格") or x in ("型式", "定格"): break
                body.append(x)
            d["commentary_ja"] = "".join(body)[:900]
            break
    return d

def main():
    import argostranslate.translate as tr
    pages = index(); print(len(pages), "Japanese model pages", flush=True)
    js = (T.parent / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=T.parent))
    ours = [{"id": w["id"], "b": w["b"], "m": w["m"]} for w in W] + \
           [{"id": re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", (p["brand"] + "-" + p["model"]).lower())), "b": p["brand"].split(" /")[0], "m": p["model"]} for p in deep]
    have = json.loads((T / "hw" / "audiodb.json").read_text())
    by = {}
    for p in pages: by.setdefault(p["key"], []).append(p)
    matched = {}
    for o in ours:
        if o["id"] in have: continue
        bn = norm(o["b"])[:5]
        cands = [c for c in by.get(norm(o["m"]), []) if bn and bn in norm(c["brand_dir"])]
        if cands: matched[o["id"]] = cands[0]["url"]
    print(len(matched), "matched", flush=True)
    rf = T / "hw" / "audioheritage.json"; res = json.loads(rf.read_text()) if rf.exists() else {}
    def fetch(item):
        pid, url = item
        if pid in res: return pid, None
        fn = OUT / "pages" / (re.sub(r"[^a-z0-9]+", "_", url.lower())[-120:] + ".gz")
        if fn.exists(): s = gzip.decompress(fn.read_bytes()).decode("utf-8", "ignore")
        else:
            s = get(url); time.sleep(0.4)
            if not s: return pid, None
            fn.write_bytes(gzip.compress(s.encode("utf-8")))
        return pid, parse(s, url)
    with ThreadPoolExecutor(3) as ex:
        got = [x for x in ex.map(fetch, matched.items()) if x[1]]
    print(len(got), "pages parsed; translating", flush=True)
    def trans(item):
        pid, d = item
        ja = d.pop("commentary_ja", "")
        if ja:
            parts = re.split(r"(?<=。)", ja)
            d["commentary_en"] = " ".join(tr.translate(p, "ja", "en") for p in parts[:4] if p.strip())
        return pid, d
    with ThreadPoolExecutor(4) as ex:
        for n, (pid, d) in enumerate(ex.map(trans, got), 1):
            res[pid] = d
            if n % 100 == 0: rf.write_text(json.dumps(res, ensure_ascii=False)); print("translated", n, flush=True)
    rf.write_text(json.dumps(res, ensure_ascii=False))
    print("done", len(res), "with commentary:", sum(1 for v in res.values() if v.get("commentary_en")))

if __name__ == "__main__":
    main()
