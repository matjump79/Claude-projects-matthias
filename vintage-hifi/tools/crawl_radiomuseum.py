"""Second source #2: Radiomuseum.org (multilingual, English pages).

1. Resolve each brand's maker slug (/m/<brand>_<country>_en_1.html), following redirects.
2. Read the maker's model lists (all pages) and match our models.
3. Fetch matched model pages: country, year, power, price, English notes and photos.
Output: tools/hw/radiomuseum.json {our id: {...}}
"""
import gzip, html, json, pathlib, re, subprocess, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests

T = pathlib.Path(__file__).parent
OUT = T / "hw" / "rm"; (OUT / "pages").mkdir(parents=True, exist_ok=True)
BASE = "https://www.radiomuseum.org"
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
CC = ["j", "d", "usa", "gb", "ch", "dk", "nl", "i", "f", "s", "n", "a", "tw", "hk", "kor", "cdn", "aus", "b", "sf", "e"]
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

def get(url):
    for i in range(3):
        try:
            r = S.get(url, timeout=40, allow_redirects=True)
            if r.status_code == 200: return r
            if r.status_code in (404, 410): return None
        except requests.RequestException:
            pass
        time.sleep(5 * (i + 1))
    return None

def resolve(brand):
    base = re.sub(r"[^a-z0-9]+", "_", brand.lower()).strip("_")
    first = base.split("_")[0]
    for b in dict.fromkeys([base, first]):
        for cc in CC:
            r = get(f"{BASE}/m/{b}_{cc}_en_1.html"); time.sleep(0.25)
            if r is not None and "/m/" in r.url and brand.split()[0].lower()[:4] in r.text.lower():
                return re.sub(r"_en_\d+(~\w+)?\.html$", "", r.url.split("/m/")[1])
    return None

def model_list(slug):
    rows, page = [], 1
    while page < 60:
        r = get(f"{BASE}/m/{slug}_en_{page}~model.html"); time.sleep(0.3)
        if r is None: break
        found = re.findall(r'<td><a href="(https://www\.radiomuseum\.org/r/[^"]+\.html)">([^<]*)</a>\s*([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>', r.text)
        new = [(u, (a + " " + b).strip(), y.strip(), c.strip()) for u, a, b, y, c in found]
        if not new or (rows and new[0][0] == rows[-len(new)][0] if len(rows) >= len(new) else False): break
        rows += new
        if f"_en_{page + 1}~model.html" not in r.text: break
        page += 1
    return rows

def parse_model(s, url):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    imgs = [urllib.parse.urljoin(url, i) for i in re.findall(r'<img[^>]+src="(/images/radio/[^"]+\.jpg)"', t)]
    txt = html.unescape(re.sub(r"<[^>]+>", "\n", t)); lines = [l.strip() for l in txt.split("\n") if l.strip()]
    d = {"url": url, "images": imgs[:6]}
    for key, name in (("Country", "country"), ("Year", "year"), ("Power out", "power"), ("Price in first year of sale", "price"),
                      ("Net weight (2.2 lb = 1 kg)", "weight"), ("Dimensions (WHD)", "dims")):
        if key in lines:
            i = lines.index(key)
            if i + 1 < len(lines): d[name] = lines[i + 1][:120]
    if "Notes" in lines:
        i = lines.index("Notes"); body = []
        for l in lines[i + 1:]:
            if re.match(r"(Net weight|Price in first year|Author|Source of data|Literature|Mentioned in|Other Models)", l): break
            body.append(l)
        d["notes"] = " ".join(body)[:1500]
    return d

def main():
    js = (T.parent / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=T.parent))
    ours = [{"id": w["id"], "b": w["b"], "m": w["m"]} for w in W] + \
           [{"id": re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", (p["brand"] + "-" + p["model"]).lower())), "b": p["brand"].split(" /")[0], "m": p["model"]} for p in deep]
    brands = sorted({o["b"] for o in ours})
    sf = OUT / "slugs.json"; slugs = json.loads(sf.read_text()) if sf.exists() else {}
    for b in brands:
        if b not in slugs:
            slugs[b] = resolve(b); sf.write_text(json.dumps(slugs, indent=1)); print("slug", b, slugs[b], flush=True)
    lf = OUT / "lists.json"; lists = json.loads(lf.read_text()) if lf.exists() else {}
    for b, sl in slugs.items():
        if sl and sl not in lists:
            lists[sl] = model_list(sl); lf.write_text(json.dumps(lists)); print("list", sl, len(lists[sl]), flush=True)
    matched = {}
    for o in ours:
        sl = slugs.get(o["b"])
        if not sl: continue
        key = norm(o["m"])
        for u, name, year, cat in lists.get(sl, []):
            n = norm(name)
            if n == key or n.endswith(key) and len(key) >= 4 and not n[:-len(key)][-1:].isdigit():
                matched[o["id"]] = u; break
    print(len(matched), "matched of", len(ours), flush=True)
    rf = T / "hw" / "radiomuseum.json"; res = json.loads(rf.read_text()) if rf.exists() else {}
    def fetch(item):
        pid, url = item
        if pid in res: return pid, res[pid]
        fn = OUT / "pages" / (url.rsplit("/", 1)[1] + ".gz")
        if fn.exists(): s = gzip.decompress(fn.read_bytes()).decode("utf-8", "ignore")
        else:
            r = get(url); time.sleep(0.4)
            if r is None: return pid, None
            s = r.text; fn.write_bytes(gzip.compress(s.encode("utf-8")))
        return pid, parse_model(s, url)
    with ThreadPoolExecutor(2) as ex:
        for n, (pid, d) in enumerate(ex.map(fetch, matched.items()), 1):
            if d: res[pid] = d
            if n % 200 == 0: rf.write_text(json.dumps(res, ensure_ascii=False)); print("fetched", n, flush=True)
    rf.write_text(json.dumps(res, ensure_ascii=False))
    print("done", len(res), "with notes:", sum(1 for v in res.values() if v.get("notes")), "with images:", sum(1 for v in res.values() if v.get("images")))

if __name__ == "__main__":
    main()
