"""Second source #1: audio-database.com (English edition of audio-heritage.jp).

Step 1: crawl brand and category index pages, collecting English model pages (*-e.html).
Step 2: match them to our models (brand + model number) and fetch matched pages:
        release date, price, English commentary and product images.
Output: tools/hw/audiodb.json  {our id: {...}}
"""
import gzip, html, json, pathlib, re, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests

T = pathlib.Path(__file__).parent
OUT = T / "hw" / "audiodb"; (OUT / "pages").mkdir(parents=True, exist_ok=True)
BASE = "https://audio-database.com/"
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"

def get(url):
    for i in range(3):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200:
                r.encoding = r.apparent_encoding or "utf-8"
                return r.text
            if r.status_code == 404: return None
        except requests.RequestException:
            pass
        time.sleep(5 * (i + 1))
    return None

norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

def index():
    f = OUT / "index.json"
    if f.exists(): return json.loads(f.read_text())
    home = get(BASE) or ""
    brands = sorted(set(re.findall(r'href="([A-Za-z0-9_\-()&.]+)/(?:[a-z]+/)?index\.html"', home)))
    pages = []
    for b in brands:
        s = get(f"{BASE}{b}/index.html") or ""; time.sleep(0.3)
        cats = sorted(set(c for c in re.findall(r'href="([a-z]+/[A-Za-z0-9\-_]+\.html)"', s) if not c.endswith("-e.html"))) or ["index.html"]
        for c in cats:
            cs = get(f"{BASE}{b}/{c}") or ""; time.sleep(0.3)
            d = c.rsplit("/", 1)[0] if "/" in c else ""
            for link in re.findall(r'href="([a-z0-9\-_.()]+-e\.html)"', cs, re.I):
                pages.append({"brand_dir": b, "url": f"{BASE}{b}/{d + '/' if d else ''}{link}", "key": norm(link[:-7])})
        print("brand", b, len(pages), flush=True)
    f.write_text(json.dumps(pages)); return pages

def parse(s):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    imgs = [i for i in re.findall(r'<img[^>]+src="([^"]+\.(?:jpe?g|JPG|png))"', t, re.I) if not re.search(r"logo|banner|icon", i, re.I)]
    t = html.unescape(re.sub(r"<[^>]+>", "\n", t)); t = re.sub(r"[ \t]+", " ", t)
    lines = [l.strip() for l in t.split("\n") if l.strip()]
    out = {"images": imgs[:6]}
    for l in lines[:12]:
        m = re.search(r"([¥$£€]\s?[\d,.]+|[\d,.]+\s?(?:yen|JPY))[^(]*\((?:Released|Launched|Released in)\s+([^)]+)\)", l, re.I)
        if m: out["price"], out["released"] = m.group(1).strip(), m.group(2).strip(); break
        m = re.search(r"\((?:Released|Launched)\s+(?:in\s+)?([^)]+)\)", l, re.I)
        if m: out["released"] = m.group(1).strip()
    if "Commentary" in lines:
        i = lines.index("Commentary"); body = []
        for l in lines[i + 1:]:
            if re.match(r"(Specifications|Specification|Type|Rated output|Format|Drive system)\b", l): break
            body.append(l)
        out["commentary"] = " ".join(body)[:2500]
    return out

# export brand -> Japanese home-market brand names used by the Japanese sites
ALIAS = {"jvc": ["victor"], "hitachi": ["lod", "hitachi"], "toshiba": ["aurex", "toshiba"], "mitsubishi": ["diatone"],
         "kenwood": ["trio", "kenwood"], "trio": ["trio", "kenwood"], "harmankardon": ["harman"], "revox": ["studer", "revox"],
         "studer": ["studer", "revox"], "teac": ["teac", "esoteric"], "esoteric": ["teac", "esoteric"], "optonica": ["sharp"],
         "lo-d": ["lod"], "aurex": ["aurex"], "bangolufsen": ["bang"], "columbia": ["denon"], "nippon": ["denon"]}
def brand_ok(brand, brand_dir):
    bn, d = re.sub(r"[^a-z0-9]", "", brand.lower()), re.sub(r"[^a-z0-9]", "", brand_dir.lower())
    keys = ALIAS.get(bn, []) + ALIAS.get(bn.split()[0] if " " in bn else bn[:5], []) + [bn[:5]]
    return any(k and k in d for k in keys)

def main():
    pages = index()
    print(len(pages), "English model pages", flush=True)
    js = (T.parent / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    import subprocess
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late','world','world2'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=T.parent))
    ours = [{"id": w["id"], "b": w["b"], "m": w["m"]} for w in W] + \
           [{"id": re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", (p["brand"] + "-" + p["model"]).lower())), "b": p["brand"].split(" /")[0], "m": p["model"]} for p in deep]
    by = {}
    for p in pages: by.setdefault(p["key"], []).append(p)
    matched = {}
    for o in ours:
        cands = by.get(norm(o["m"]), [])
        cands = [c for c in cands if brand_ok(o["b"], c["brand_dir"])]
        if cands: matched[o["id"]] = cands[0]["url"]
    print(len(matched), "matched of", len(ours), flush=True)
    res_f = T / "hw" / "audiodb.json"
    res = json.loads(res_f.read_text()) if res_f.exists() else {}
    def fetch(item):
        pid, url = item
        if pid in res: return pid, res[pid]
        fn = OUT / "pages" / (re.sub(r"[^a-z0-9]+", "_", url.lower())[-120:] + ".gz")
        if fn.exists(): s = gzip.decompress(fn.read_bytes()).decode("utf-8", "ignore")
        else:
            s = get(url); time.sleep(0.4)
            if not s: return pid, None
            fn.write_bytes(gzip.compress(s.encode("utf-8")))
        d = parse(s); d["url"] = url
        d["images"] = [urllib.parse.urljoin(url, i) for i in d["images"]]
        return pid, d
    with ThreadPoolExecutor(3) as ex:
        for n, (pid, d) in enumerate(ex.map(fetch, matched.items()), 1):
            if d: res[pid] = d
            if n % 200 == 0: res_f.write_text(json.dumps(res, ensure_ascii=False)); print("fetched", n, flush=True)
    res_f.write_text(json.dumps(res, ensure_ascii=False))
    print("done", len(res), "with commentary:", sum(1 for v in res.values() if v.get("commentary")))

if __name__ == "__main__":
    main()
