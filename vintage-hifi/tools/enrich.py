"""Combine the second sources into richer English descriptions, extra source links and better photos.

Inputs : data/hifiwiki.js, the in-depth data files, tools/hw/{audiodb,radiomuseum,classicreceivers}.json
Outputs: data/enrich.js   window.HIFI_ENRICH = {id: {more: [paragraphs], src: [sources], facts: {...}}}
         photos/x/<id>.jpg + entries in data/enrich.js (photo) for units whose photo was missing or a catalogue page
"""
import json, pathlib, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from PIL import Image

T = pathlib.Path(__file__).parent; ROOT = T.parent
sys.path.insert(0, str(T))
from docscore import docscore
from translate_hw import looks_german

S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
PX = ROOT / "photos" / "x"; PX.mkdir(parents=True, exist_ok=True)
load = lambda n: json.loads((T / "hw" / n).read_text()) if (T / "hw" / n).exists() else {}

def sentences(text, limit=3, maxlen=520):
    text = re.sub(r"\s+", " ", text or "").strip()
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", text)
    out = []
    for p in parts:
        if len(" ".join(out + [p])) > maxlen: break
        out.append(p)
        if len(out) >= limit: break
    return " ".join(out).strip()

TIDY = [(r"\bpre-?main amplifiers?\b", "integrated amplifier"), (r"\bcontrol amplifier\b", "preamplifier"), (r"¥\s+(?=\d)", "¥"),
        (r"\bIntegrated A\W?ifier\b", "integrated amplifier"), (r"\bA\s?。?ifier\b", "amplifier"), (r"\ban integrated\b", "an integrated"),
        (r"\ba integrated\b", "an integrated"), (r"\s+([,.;:])", r"\1")]
def tidy(t):
    for a, b in TIDY: t = re.sub(a, b, t, flags=re.I)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:1].upper() + t[1:]

def english(text):
    """Keep only text that reads as English (Radiomuseum notes are sometimes German, French or Italian)."""
    if not text or looks_german(text): return ""
    if re.search(r"\b(le|la|les|des|avec|il|della|con|que|para)\b", text) and not re.search(r"\b(the|and|with|is)\b", text): return ""
    return text

def nice_released(s):
    s = re.sub(r"^in\s+", "", s or "").strip()
    return s

def main():
    js = (ROOT / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    deep = json.loads(subprocess.check_output(["node", "-e", "global.HIFI=[];for(const f of ['receivers','amplifiers','turntables','early','late'])require('./data/'+f+'.js');console.log(JSON.stringify(HIFI))"], cwd=ROOT))
    slug = lambda s: re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))
    deep_ids = {slug(p["brand"] + "-" + p["model"]): p for p in deep}
    kinds = load("photo_kind.json")
    ad, rm, cr, ah = load("audiodb.json"), load("radiomuseum.json"), load("classicreceivers.json"), load("audioheritage.json")
    pj = (ROOT / "data" / "photos.js").read_text(); hand = json.loads(pj[pj.index("{"): pj.rindex("}") + 1])

    units = [(w["id"], w["b"], w["m"], w) for w in W] + [(i, p["brand"], p["model"], None) for i, p in deep_ids.items()]
    out, photo_todo = {}, []
    for pid, brand, model, w in units:
        more, src, facts = [], [], {}
        a, r, c = ad.get(pid), rm.get(pid), cr.get(pid)
        if a:
            bits = []
            if a.get("released"): bits.append(f"Released {nice_released(a['released'])}" + (f" at {a['price']}" if a.get("price") else "") + ".")
            com = sentences(english(a.get("commentary", "")), 3)
            if com: bits.append(com)
            if bits: more.append({"t": tidy(" ".join(bits)), "s": "audio-database.com"})
            src.append({"t": f"audio-database.com – {brand} {model} (catalogue commentary)", "u": a["url"], "lang": "en"})
        h = ah.get(pid) if not a else None
        if h:
            bits = []
            if h.get("released"): bits.append(f"Released {h['released']}" + (f" at {h['price']}" if h.get("price") else "") + ".")
            com = sentences(h.get("commentary_en", ""), 3)
            if com: bits.append(com)
            if bits: more.append({"t": tidy(" ".join(bits)), "s": "audio-heritage.jp, translated from Japanese"})
            src.append({"t": f"audio-heritage.jp – {brand} {model} (catalogue commentary)", "u": h["url"], "lang": "ja"})
        if c:
            txt = sentences(" ".join(c.get("text", [])), 3, 600)
            if txt: more.append({"t": txt, "s": "classicreceivers.com"})
            src.append({"t": f"classicreceivers.com – {brand} {model}", "u": c["url"], "lang": "en"})
        if r:
            note = sentences(english(r.get("notes", "")), 2, 360)
            if note: more.append({"t": note, "s": "Radiomuseum.org"})
            for k in ("country", "power", "price", "weight", "dims"):
                if r.get(k) and "unknown" not in r[k].lower(): facts[k] = re.sub(r"\s+", " ", r[k].replace("\xa0", " "))
            src.append({"t": f"Radiomuseum.org – {brand} {model}", "u": r["url"], "lang": "multi"})
        if more or src or facts:
            out[pid] = {"more": more, "src": src, "facts": facts}
        # photo: only where nothing hand-checked exists and the current image is missing or a catalogue page
        if pid in hand: continue
        cur_bad = (w is None) or ("ph" not in w) or kinds.get(pathlib.Path(w.get("ph", "x")).stem) == "catalogue"
        if cur_bad:
            cands = [(u, "audio-database.com", a["url"]) for u in (a or {}).get("images", [])[:3]] + \
                    [(u, "audio-heritage.jp", h["url"]) for u in (h or {}).get("images", [])[:3]] + \
                    [(u, "radiomuseum.org", r["url"]) for u in (r or {}).get("images", [])[:3]] + \
                    [(u, "classicreceivers.com", c["url"]) for u in (c or {}).get("images", [])[:2]]
            if cands: photo_todo.append((pid, cands))
    print(len(out), "units with second-source content;", len(photo_todo), "units to try for a better photo", flush=True)

    def best_photo(item):
        pid, cands = item
        f = PX / f"{pid}.jpg"
        if f.exists(): return pid, None
        best = None
        for u, site, page in cands:
            try:
                resp = S.get(u, timeout=40, headers={"Referer": page}); time.sleep(0.3)
                im = Image.open(BytesIO(resp.content)).convert("RGB")
            except Exception:
                continue
            if im.width < 300 or im.height < 160: continue
            d = docscore(im)[0]
            if d < 2.6 and (best is None or d < best[0]): best = (d, im, site, page, u)
        if not best: return pid, None
        im = best[1]; im.thumbnail((400, 300), Image.LANCZOS); im.save(f, quality=74, optimize=True, progressive=True)
        return pid, {"site": best[2], "page": best[3], "u": best[4]}
    pf = T / "hw" / "xphotos.json"; xp = json.loads(pf.read_text()) if pf.exists() else {}
    with ThreadPoolExecutor(3) as ex:
        for n, (pid, info) in enumerate(ex.map(best_photo, photo_todo), 1):
            if info: xp[pid] = info
            if n % 100 == 0: pf.write_text(json.dumps(xp)); print("photos", n, len(xp), flush=True)
    pf.write_text(json.dumps(xp))
    for n, pid in enumerate(sorted(p for p in xp if (PX / f"{p}.jpg").exists())):
        out.setdefault(pid, {"more": [], "src": [], "facts": {}})["photo"] = {"ph": f"photos/x/{pid}.jpg", "xc": n // 100, **xp[pid]}
    (ROOT / "data" / "enrich.js").write_text("// Generated by tools/enrich.py: second-source descriptions, links and photos.\nwindow.HIFI_ENRICH = "
                                             + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    two = sum(1 for pid, *_ in units if out.get(pid, {}).get("src") or pid in deep_ids)
    print("wrote enrich.js:", len(out), "units;", len(xp), "new photos;", two, "units with 2+ sources")

if __name__ == "__main__":
    main()
