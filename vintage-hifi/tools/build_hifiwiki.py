"""Turn crawled HiFi-Wiki pages into database entries (data/hifiwiki.js) and small photos (photos/hw/).

Keeps models whose production started 1970–1989. Photos: the page's main product image (brochure,
schematic and rear-view images are skipped when a better one exists), resized to 400×300.
"""
import json, pathlib, re, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from PIL import Image

T = pathlib.Path(__file__).parent
sys.path.insert(0, str(T))
ROOT = T.parent
PH = ROOT / "photos" / "hw"; PH.mkdir(parents=True, exist_ok=True)
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"
PER_CHUNK = 100
YEAR_MIN, YEAR_MAX = 1970, 1989

def slug(s):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))

BRAND_FIX = {"saba": "SABA", "harmankardon": "Harman Kardon", "victor": "Victor", "bo": "Bang & Olufsen",
             "bangolufsen": "Bang & Olufsen", "cec": "C.E.C.", "teac": "TEAC", "sae": "SAE", "jvc": "JVC",
             "nad": "NAD", "itt": "ITT", "rft": "RFT", "akg": "AKG", "bic": "BIC", "adc": "ADC"}
def norm_b(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())
def clean_brand(raw):
    b = re.sub(r"[\[\]]", "", raw).strip()
    b = re.split(r"\s*\(|\s*,|\s+-\s+|\s+/\s+|\s+\bOEM\b", b)[0].strip() or raw
    return BRAND_FIX.get(norm_b(b), b)

TR_FILE = T / "hw" / "translations.json"
TR = json.loads(TR_FILE.read_text()) if TR_FILE.exists() else {}
PLACEHOLDER = re.compile(r"^(hier,? (wenn|falls) vorhanden|-+|k\.?\s?a\.?|keine?|n/a|\?)$", re.I)
NO_PRICE = re.compile(r"siehe Technische Daten|unbekannt", re.I)
def en(s):
    """English version of a HiFi-Wiki text (translation cache), first letter capitalised."""
    if not s: return s
    from translate_hw import clean, post
    c = clean(s)
    t = post(TR.get(c) or TR.get(s) or c)
    return t[:1].upper() + t[1:] if t else t

SHORT_RULES = [(r"\s*\([^)]*$", ""), (r"\s+(Was|Gerät)\b.*$", ""), (r"\(Silber-Ausführung\)", "(silver version)"),
    (r"gemäß Testbericht", "according to test report"), (r"\bteilw\.?", "partly"),(r"\(das entspric\w*", "(equivalent to"), (r"Japan-Version der", "Japanese version of the"),
    (r"Mark der DDR", "East German marks"), (r"\(\s*Stück\s*!?\s*\)", "(each)"), (r"Soweit bekannt,?", "as far as known,"),
    (r"Was das Ge\w*", ""), (r"Messwert der Zeitschrift (\w+)", r"measured by \1 magazine"),
    (r"\s+bis\s+\+", " to +"), (r"^Zahlreiche Kühlöffnungen oben, unten und an den Seiten\.?$", "Numerous cooling vents on top, bottom and sides."),
    (r"\bWatt\b", "W"), (r"\bOhm\b", "Ω"),(r"\(?\s*wer es wei(ß|ss), bitte eintragen\s*\)?", ""), (r"\bevtl\.?\s*erst\s*", "possibly only "),
    (r"\bca\.\s*", "approx. "), (r"\betwa\b", "approx."), (r"\s+bis\s+", "–"), (r"\bab\s+(?=\d|[A-Z][a-z]+ \d)", "from "),
    (r"\bseit\b", "since"), (r"\bum\b(?=\s*\d)", "around"), (r"\bvorgestellt\b", "introduced"),
    (r"\bKlirr(faktor)?\b", "THD"), (r"Klemmanschlüsse", "terminals"), (r"\bUKW\b", "FM"), (r"\bAntenne\b", "antenna"),
    (r"\bdas entsprich\w*", "equivalent to"), (r"\bentsprechend\b", "equivalent to"), (r"\bentspricht\b", "equivalent to"),
    (r"\s*/\s*Stück\b", " each"), (r"Set-Preis", "set price"), (r"Vorverstärker?", "preamplifier"), (r"\bin D\b", "in Germany"),
    (r"\bWurde\b", "Was"), (r"\bfür\b", "for"), (r"\bmit\b", "with"), (r"\bohne\b", "without"), (r"\bund\b", "and"),
    (r"\bmindestens\b", "at least"), (r"\bnetto\b", "net"), (r"Gesamtklirrfaktor", "THD"), (r"\bW/K\.?", "W/ch"), (r"\bSinus\b", "sine"),
    (r"Messbereich", "measuring range"), (r"Impulsleistung", "peak power"), (r"Dauerleistung", "continuous power"),
    (r"Frequenzbereich", "frequency range"), (r"\bpro Paar\b", "per pair"), (r"Japanischer Ye\w*", "Japanese yen"),
    (r"Plastikgehäuse", "plastic case"), (r"Preisempfehlung", "recommended price"), (r"\ban (?=\d+\s*Ω)", "into "), (r"\bpro\b", "per")]
def fix_short(v):
    for a, b in SHORT_RULES:
        v = re.sub(a, b, v, flags=re.I)
    return re.sub(r"\s+", " ", v).strip(" ,;")

def first_year(s):
    m = re.search(r"(19\d\d)", s or "")
    return int(m.group(1)) if m else None

def en_power(s):
    if not s: return ""
    s = s.split(";")[0]
    s = re.sub(r"(\d)\s*x\s*", r"\1 × ", s, flags=re.I)
    s = s.replace("Ohm", "Ω").replace("Watt", "W").replace("Klasse", "Class")
    return re.sub(r"\s+", " ", s).strip()

DRIVE = [("direkt", "Direct drive"), ("riemen", "Belt drive"), ("reibrad", "Idler drive"), ("faden", "String drive")]
def en_drive(s):
    s = (s or "").lower()
    for k, v in DRIVE:
        if k in s: return v
    return ""

BAD_IMG = re.compile(r"daten|spec|manual|anleitung|bedienung|prospekt|brosch|katalog|schalt|schema|test|rueck|rück|back|innen|inside|detail|typenschild|anzeige|werbung|logo", re.I)
def pick_image(images):
    good = [i for i in images if not BAD_IMG.search(i.rsplit("/", 1)[-1])]
    return (good or images or [None])[0]

def fetch_photo(item):
    pid, url = item
    f = PH / f"{pid}.jpg"
    if f.exists(): return pid, True
    try:
        r = S.get(url, timeout=60); time.sleep(0.4)
        im = Image.open(BytesIO(r.content)).convert("RGB")
        im.thumbnail((400, 300), Image.LANCZOS)
        im.save(f, quality=72, optimize=True, progressive=True)
        return pid, True
    except Exception:
        return pid, False

def main():
    rows = [json.loads(l) for l in open(T / "hw" / "parsed.jsonl", encoding="utf-8")]
    out, seen = [], set()
    for d in rows:
        y = first_year(d.get("Baujahre") or d.get("Baujahr"))
        if not y or not (YEAR_MIN <= y <= YEAR_MAX): continue
        raw = (d.get("Hersteller") or d["title"].split(" ")[0]).strip()
        model = (d.get("Modell") or d["title"][len(raw):]).strip() or d["title"]
        fid = slug(raw + "-" + model)          # photo file name (stable across brand clean-ups)
        brand = clean_brand(raw)
        from translate_hw import split_model
        model, note = split_model(model)
        model = re.sub(r"^Modell\b", "Model", model)
        pid = slug(brand + "-" + model)
        if pid in seen: continue
        seen.add(pid)
        built = re.sub(r"\s*[-–]\s*", "–", (d.get("Baujahre") or d.get("Baujahr") or str(y)).strip())
        e = {"id": pid, "fid": fid, "b": brand, "o": raw if norm_b(raw) != norm_b(brand) else "", "m": model, "c": d["cat"], "y": y, "bu": built[:30], "u": d["url"],
             "pw": en_power(d.get("Leistung")) if d["cat"] != "turntable" else "",
             "dr": en_drive(d.get("Antrieb") or d.get("Antriebsart")) if d["cat"] == "turntable" else "",
             "p": (d.get("Neupreis") or "").strip()[:40], "wt": (d.get("Gewicht") or "").strip()[:20],
             "f": [x for x in d.get("Ausstattung", []) if len(x) < 140 and not PLACEHOLDER.match(x.strip())][:6],
             "r": (d.get("Bemerkungen") or "")[:500]}
        if NO_PRICE.search(e["p"]): e["p"] = ""
        for k in ("bu", "p", "wt", "pw"):
            if e.get(k) in TR:
                from translate_hw import post
                e[k] = post(TR[e[k]])
        for k in ("bu", "p", "wt", "pw"):
            if e.get(k): e[k] = fix_short(e[k])
        if re.match(r"(Eingänge|Inputs|Abmessungen|Dimensions|UKW|FM)\b", e.get("pw", "")): e["pw"] = ""
        e["f"] = [fix_short(x) for x in (en(x) for x in e["f"]) if x and not PLACEHOLDER.match(x)]
        e["r"] = en(e["r"]); e["o"] = en(e["o"]) if e["o"] else ""
        e["m"] = e["m"].replace("(ohne MW)", "(without MW)")
        e["vn"] = fix_short(en(note)) if note else ""
        img = pick_image(d.get("images", []))
        if img: e["i"] = img
        out.append({k: v for k, v in e.items() if v not in ("", [], None)})
    print(len(out), f"entries {YEAR_MIN}–{YEAR_MAX}")
    todo = [(e["fid"], e["i"]) for e in out if "i" in e]
    ok = {}
    with ThreadPoolExecutor(3) as ex:
        for n, (pid, good) in enumerate(ex.map(fetch_photo, todo), 1):
            ok[pid] = good
            if n % 200 == 0: print("photos", n, "/", len(todo), flush=True)
    with_photo = sorted(e["id"] for e in out if ok.get(e["fid"]))
    chunk = {pid: i // PER_CHUNK for i, pid in enumerate(with_photo)}
    kf = T / "hw" / "photo_kind.json"
    kind = json.loads(kf.read_text()) if kf.exists() else {}
    for e in out:
        if kind.get(e["fid"]) == "catalogue": e["k"] = 1
        if e["id"] in chunk:
            e["pc"] = chunk[e["id"]]; e["ph"] = f"photos/hw/{e['fid']}.jpg"
        e.pop("fid", None)
    out.sort(key=lambda e: (e["y"], e["b"].lower(), e["m"]))
    (ROOT / "data" / "hifiwiki.js").write_text(
        "// Generated by tools/build_hifiwiki.py from hifi-wiki.de (models introduced 1970–1989). Do not edit by hand.\n"
        "window.HIFI_WIKI = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print("wrote", len(out), "entries,", len(with_photo), "with photos")

if __name__ == "__main__":
    main()
