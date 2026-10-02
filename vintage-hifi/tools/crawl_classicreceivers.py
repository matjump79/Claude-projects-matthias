"""Second source #3: classicreceivers.com (USA, English write-ups of receivers).

Guesses the page address from brand + model, checks the page title names the model,
and keeps the first English paragraphs and product images.
Output: tools/hw/classicreceivers.json {our id: {...}}
"""
import html, json, pathlib, re, subprocess, time
from concurrent.futures import ThreadPoolExecutor
import requests

T = pathlib.Path(__file__).parent
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())

def slug(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")

def fetch(o):
    for u in dict.fromkeys([f"https://classicreceivers.com/{slug(o['b'] + ' ' + o['m'])}",
                            f"https://classicreceivers.com/{slug(o['b'])}-{norm(o['m'])}"]):
        try:
            r = S.get(u, timeout=40); time.sleep(0.5)
        except requests.RequestException:
            continue
        if r.status_code != 200: continue
        title = html.unescape(re.search(r"<title>(.*?)</title>", r.text, re.S).group(1)) if "<title>" in r.text else ""
        if norm(o["m"]) not in norm(title): continue
        body = r.text[r.text.find("entry-content"):][:40000]
        ps = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", body, re.S)]
        ps = [p for p in ps if len(p) > 80 and "cookie" not in p.lower()][:4]
        imgs = re.findall(r'src="(https://classicreceivers\.com/wp-content/uploads/[^"]+\.(?:jpe?g|png))"', body)
        if ps: return o["id"], {"url": r.url, "text": ps, "images": imgs[:6]}
    return o["id"], None

def main():
    js = (T.parent / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late','world','world2'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=T.parent))
    ours = [{"id": w["id"], "b": w["b"], "m": w["m"]} for w in W if w["c"] == "receiver"] + \
           [{"id": re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", (p["brand"] + "-" + p["model"]).lower())), "b": p["brand"].split(" /")[0], "m": p["model"]} for p in deep if p["cat"] == "receiver"]
    f = T / "hw" / "classicreceivers.json"; res = json.loads(f.read_text()) if f.exists() else {}
    todo = [o for o in ours if o["id"] not in res]
    print(len(ours), "receivers,", len(todo), "to check", flush=True)
    with ThreadPoolExecutor(2) as ex:
        for n, (pid, d) in enumerate(ex.map(fetch, todo), 1):
            res[pid] = d
            if n % 100 == 0: f.write_text(json.dumps(res, ensure_ascii=False)); print(n, sum(1 for v in res.values() if v), "found", flush=True)
    f.write_text(json.dumps(res, ensure_ascii=False))
    print("done", sum(1 for v in res.values() if v), "found")

if __name__ == "__main__":
    main()
