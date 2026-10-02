"""US for-sale check for every unit, via HiFi Shark (aggregates eBay, Reverb, Audiogon, US Audio Mart, AVS Forum ...).

For each unit: real-time search for "<brand> <model>", keep only listings located in the USA whose title names the
brand and the exact model number, and drop parts/accessory listings (knobs, manuals, lamps ...).
Output: tools/hw/market.json and data/market.js
  window.HIFI_MARKET = {date, units: {id: [[site, [[title, price, url, parts?], ...]], ...]}}
"""
import json, pathlib, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
import requests

T = pathlib.Path(__file__).parent; ROOT = T.parent
OUT = T / "hw" / "market.json"
BASE = "https://www.hifishark.com"
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
PARTS = re.compile(r"\b(knobs?|screws?|manuals?|schematics?|service (manual|kit)|remote|face ?plates?|front panel|lamps?|bulbs?|led kit|kits?|"
                   r"capacitors?|caps?|transistors?|relays?|fuses?|boards?|pcb|feet|foot|cabinet only|wood (case|cabinet|sides)|side panels?|"
                   r"dust ?cover|lid|belts?|stylus|needle|headshell|spindle|mat|buttons?|switch(es)?|dial (glass|string|cord)|cords?|cables?|"
                   r"handles?|sticker|badge|logo|brochure|catalog(ue)?|advert(isement)?|\bad\b|box only|empty box|packaging|chips?|\bic\b|"
                   r"meter|heat ?sink|transformer|power supply only|cover only|glass|bezel)\b", re.I)
WHOLE = re.compile(r"\b(receiver|amplifier|amp|turntable|record player|preamp|pre-amp|tested|working|serviced|recapped|restored)\b", re.I)
HARD = re.compile(r"\b(kits?|rebuild|recap|assembly|assy|scale|plug|knobs?|manuals?|schematics?|bulbs?|lamps?|leds?|pointer|replacement|upgrade|"
                  r"board|pcb|module|transistors?|capacitors?|relays?|faceplate|front panel|dial|meter|belt|stylus|needle|headshell|cover|feet|foot|"
                  r"screws?|handles?|glass|bezel|cord|cable|panels?|terminals?|part|transformers?|volume control|section|pots?|potentiometers?|review|pgs|pages|annuncio|anzeige|publicit\w*|print ad|frames?|adaptador|bridge rectifier|connectors?|case|cabinet|plywood|chassis|heat ?sinks?|bottom|lid|hinges?|antenna|power amp board|brochure|catalog|advert|sticker|badge|gałka|knopf|bouton|manopola|perilla)\b", re.I)
MODEL_TOKEN = re.compile(r"\b[A-Za-z]{0,5}[- ]?\d{3,5}[A-Za-z]{0,4}\b")
FOR_PARTS = re.compile(r"for parts|not working|as[- ]is|repair", re.I)

def session():
    s = requests.Session(); s.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15"
    s.get(BASE + "/search?q=sansui", timeout=30)
    return s

def search(s, q, pages=2):
    info = {"type": "search", "value": q, "filter": "listing_category:hifi", "sold": False, "from": 0,
            "order": "_score,-1", "currencyIso": None, "searchRT": True, "sellerSlug": None}
    hits = []
    for page in range(pages):
        info["from"] = page * 48
        for attempt in range(4):
            try:
                r = s.post(BASE + "/searchSlice", json={"searchInfo": info}, headers={"X-Requested-With": "XMLHttpRequest"}, timeout=40)
                if r.status_code == 200: break
                time.sleep(20 * (attempt + 1))
            except requests.RequestException:
                time.sleep(10)
        else:
            return None
        d = r.json(); hits += d.get("hits", [])
        if len(hits) >= d.get("total", 0) or not d.get("hits"): break
        time.sleep(0.6)
    return hits

def link(h):
    u = h.get("url", "")
    m = re.match(r"/goto/ebay_(\d+)", u)
    return f"https://www.ebay.com/itm/{m.group(1)}" if m else BASE + u

def keep(h, brand, model):
    if (h.get("location") or {}).get("country_iso", "").upper() != "US": return None
    t = h.get("description") or ""
    nt = norm(t); mk = norm(model)
    i = nt.find(mk)
    if not mk or i < 0: return None
    after = nt[i + len(mk): i + len(mk) + 1]
    if mk[-1].isdigit() and after.isdigit(): return None          # AU-717 must not match AU-7170
    if not any(norm(b)[:5] in nt for b in brand.split(" / ") if norm(b)): return None
    try: price = float(str((h.get("price") or {}).get("value") or 0).replace(",", ""))
    except ValueError: price = 0
    if HARD.search(t): return None
    if ((h.get("price") or {}).get("currency_iso") or "USD").upper() != "USD" or (price and price < 40): return None
    if PARTS.search(t) and (price < 150 or not WHOLE.search(t)): return None
    if re.search(r"(/|\bor\b|,)\s*[A-Za-z]{0,4}-?\d{3,5}", t) and len({norm(x) for x in MODEL_TOKEN.findall(t)} - {mk}) >= 1: return None
    others = {norm(x) for x in MODEL_TOKEN.findall(t)} - {mk}
    if len(others - {norm(b) for b in brand.split()}) >= 2: return None     # lists several models: a part or accessory
    return [re.sub(r"\s+", " ", t).strip()[:110], h.get("display_price") or "", link(h), 1 if FOR_PARTS.search(t) else 0, price]

def main():
    js = (ROOT / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late','world','world2'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=ROOT))
    slug = lambda s: re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))
    units = {slug(p["brand"] + "-" + p["model"]): (p["brand"], p["model"].split(" (")[0]) for p in deep}
    for w in W: units.setdefault(w["id"], (w["b"], w["m"]))
    res = json.loads(OUT.read_text()) if OUT.exists() and "--fresh" not in sys.argv else {}
    todo = [(k, v) for k, v in units.items() if k not in res]
    if "--limit" in sys.argv: todo = todo[: int(sys.argv[sys.argv.index("--limit") + 1])]
    print(len(units), "units,", len(todo), "to check", flush=True)
    s = session()
    for n, (pid, (brand, model)) in enumerate(todo, 1):
        hits = search(s, f"{brand.split(' /')[0]} {model}")
        if hits is None:
            print("blocked/failed at", pid, flush=True); time.sleep(120); s = session(); continue
        by = {}
        for h in hits:
            k = keep(h, brand, model)
            if k: by.setdefault(h.get("site_name") or "Other", []).append(k)
        allp = sorted(l[4] for ls in by.values() for l in ls if l[4])
        if len(allp) >= 3:                                                 # drop listings far below the typical price (parts)
            med = allp[len(allp) // 2]
            by = {k: [l for l in ls if not l[4] or l[4] >= 0.2 * med] for k, ls in by.items()}
            by = {k: v for k, v in by.items() if v}
        res[pid] = sorted([[site, [l[:4] for l in sorted(ls, key=lambda l: (l[3], l[4] or 9e9))[:5]], len(ls)] for site, ls in by.items()], key=lambda x: -x[2])
        if n % 50 == 0:
            OUT.write_text(json.dumps(res)); print(n, "checked;", sum(1 for v in res.values() if v), "with US listings", flush=True)
        time.sleep(0.8)
    OUT.write_text(json.dumps(res))
    date = time.strftime("%Y-%m-%d")
    (ROOT / "data" / "market.js").write_text("// Generated by tools/crawl_market.py: US listings found via HiFi Shark on the given date.\n"
        "window.HIFI_MARKET = " + json.dumps({"date": date, "units": {k: v for k, v in res.items() if v}}, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("done", len(res), "checked;", sum(1 for v in res.values() if v), "with US listings")

if __name__ == "__main__":
    main()
