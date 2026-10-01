"""Translate the German HiFi-Wiki texts (features, remarks, maker notes) into English.

Uses Argos Translate (offline) after replacing HiFi terms with their English names, so the
translator does not turn "Endstufe" into "final stage". Results are cached in tools/hw/translations.json.
"""
import json, pathlib, re, sys
from concurrent.futures import ThreadPoolExecutor

T = pathlib.Path(__file__).parent
CACHE = T / "hw" / "translations.json"

# Longest terms first; applied case-insensitively before machine translation.
GLOSSARY = [
    ("Vor- und Endstufe", "preamp and power amp"), ("Vor-/Endstufe", "preamp/power amp"),
    ("Vor-Endstufe", "preamp/power amp"), ("Vorverstärker", "preamplifier"), ("Vorstufe", "preamp"),
    ("Endstufe", "power amp"), ("Endverstärker", "power amplifier"), ("Vollverstärker", "integrated amplifier"),
    ("auftrennbar", "separable"), ("trennbar", "separable"),
    ("Plattenspieler", "turntable"), ("Plattenteller", "platter"), ("Tonabnehmersystem", "cartridge"),
    ("Tonabnehmer", "cartridge"), ("Tonarmlift", "cue lift"), ("Tonarm", "tonearm"), ("Endabschaltung", "auto stop"),
    ("Rückführung", "auto return"), ("Halbautomat", "semi-automatic"), ("Vollautomat", "fully automatic"),
    ("Riemenantrieb", "belt drive"), ("Direktantrieb", "direct drive"), ("Reibradantrieb", "idler drive"),
    ("Subchassis", "sub-chassis"), ("Stroboskop", "stroboscope"), ("Drehzahlfeinregulierung", "pitch control"),
    ("UKW", "FM"), ("Mittelwelle", "medium wave"), ("Langwelle", "long wave"), ("Kurzwelle", "short wave"),
    ("Senderspeicher", "station presets"), ("Sendersuchlauf", "station scan"), ("Sendermittenanzeige", "centre-tuning indicator"),
    ("Feldstärkeanzeige", "signal-strength meter"), ("Kopfhörerausgang", "headphone output"), ("Kopfhörer", "headphones"),
    ("Lautsprecherpaare", "speaker pairs"), ("Lautsprecher", "speakers"), ("Klangregelung", "tone controls"),
    ("Klangregler", "tone controls"), ("Aufnahmewahlschalter", "record selector"), ("Mikrofonmischer", "microphone mixer"),
    ("Umschalter", "switch"), ("Leistungsanzeige", "power meter"), ("Aussteuerungsanzeige", "level meter"),
    ("Fernbedienung", "remote control"), ("Ringkerntrafo", "toroidal transformer"), ("Ringkerntransformator", "toroidal transformer"),
    ("Netzteil", "power supply"), ("Holzgehäuse", "wooden case"), ("Frontplatte", "front panel"),
    ("Nachfolgemodell", "successor"), ("Vorgängermodell", "predecessor"), ("Schwestermodell", "sister model"),
    ("baugleich", "identical in construction"), ("Klirrfaktor", "distortion"), ("Gegenkopplung", "negative feedback"),
    ("Rauschfilter", "noise filter"), ("Rumpelfilter", "rumble filter"), ("Loudness", "loudness"),
    ("abschaltbar", "can be switched off"), ("zuschaltbar", "can be switched on"), ("umschaltbar", "switchable"),
    ("Schalter", "switch"), ("Gusskühlkörper", "cast heat sinks"), ("Gußkühlkörper", "cast heat sinks"), ("Kühlkörper", "heat sinks"),
    ("Ausführung", "version"), ("Gesamtanlage", "system"), ("Komponente", "component"), ("Modell", "model"), ("Serie", "series"),
    ("foliert", "foil-covered"), ("Kupferplattenteller", "copper platter"), ("regelbar", "adjustable"),
    ("Lautstärkeabsenkung", "volume dimmer"), ("Anschluss", "socket"), ("Anschlüsse", "connections"),
]
POSTFIX = [(r"\bfollicated\b", "foil-covered"), (r"\bRegulateable\b", "adjustable"), (r"\bplater\b", "platter"),
           (r"\bcooling bodies\b", "heat sinks"), (r"\bphonomotor\b", "motor"), (r"\bfinal stage\b", "power amp"),
           (r"\bpre-stage\b", "preamp"), (r"\bVHF\b", "FM")]
def post(s):
    for a, b in POSTFIX:
        s = re.sub(a, b, s, flags=re.I)
    return s
JUNK = re.compile(r"\[\s*Bearbeiten\s*\]|\bBilder\b\s*(?=\[|$)|\bBild:\s*|\bBerichte\b\s*(?=\[|$)|\bDokumente\b\s*(?=\[|$)|\[\d+\]")

def clean(s):
    s = JUNK.sub(" ", s or "")
    s = re.sub(r"\b(Bilder|Berichte|Dokumente)\s*$", "", s.strip())
    return re.sub(r"\s+", " ", s).strip(" -–")

NOTE_SPLIT = re.compile(r"\s*\(|,\s+(?=\D)|\s+(?=(mit|ohne|in Schwarz|in Silber|Komponente|Ausführung|Version|Serie)\b)", re.I)
def split_model(m):
    """'KA-3006 (US-Ausführung)' -> ('KA-3006', 'US-Ausführung'); notes stay untranslated here."""
    parts = NOTE_SPLIT.split(m, maxsplit=1)
    core = parts[0].strip(" ,")
    rest = m[len(parts[0]):].strip(" ,")
    if not rest or not core or not looks_german(rest + " ") and not re.search(r"Langwelle|Ausführung|Modell|Schwarz|Silber|baugleich|Komponente|Gesamtanlage|Serie|ähnlich|wie\b|nur\b", rest, re.I):
        return m, ""
    rest = rest[1:-1] if rest.startswith("(") and rest.endswith(")") and rest.count("(") == 1 else rest
    return core, rest.strip()

def pre(s):
    for de, en in GLOSSARY:
        s = re.sub(re.escape(de), en, s, flags=re.I)
    return s

def looks_german(s):
    return bool(re.search(r"[äöüß]|\b(und|mit|der|die|das|des|für|nur|wird|wurde|ist|bei|auf|von|ein|eine|nicht|auch|als|oder|zum|zur|im|vom)\b", s, re.I))

SHORT_DE = re.compile(r"\b(ca|ab|um|bis|etwa|Mitte|Anfang|Ende|seit|von|im|in den|Jahre|wahrscheinlich|nicht|nur|heute|kein|Januar|Februar|März|Mai|Juni|Juli|Oktober|Dezember|bei|nach|Kanal|Kanäle|oder|beide|betrieben|pro|mit|und|weniger|bzw|Leistung|Klirr\w*|Sinus\w*|Musik\w*|Nenn\w*|Ausgangs\w*|Frequenzgang|Abmessungen|Gewicht|siehe|Technische|Daten|entspricht|unbekannt|UVP|war|ohne|Paar|Systempreis|erhältlich|für|angeboten|umgerechnet|netto|komplett|Holz\w*|Verpackung|Prospekt|vorgestellt|aktuelles|gekauft|mindestens|Programm)\b", re.I)

def main():
    import argostranslate.translate as tr
    js = (T.parent / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    W = json.loads(js[js.index("["): js.rindex("]") + 1])
    texts = set()
    for w in W:
        texts.update(clean(x) for x in w.get("f", []))
        for k in ("r", "o"):
            if w.get(k): texts.add(clean(w[k]))
        for k in ("bu", "p", "wt", "pw"):
            if w.get(k) and SHORT_DE.search(w[k]): texts.add(w[k])
        core, note = split_model(w["m"])
        if note: texts.add(clean(note))
    texts.discard("")
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if "--refresh" in sys.argv:   # re-translate texts touched by newer glossary entries
        terms = [d.lower() for d, _ in GLOSSARY[-12:]]
        cache = {k: v for k, v in cache.items() if not any(t in k.lower() for t in terms)}
    todo = [t for t in texts if t not in cache]
    print(len(texts), "texts,", len(todo), "to translate", flush=True)
    def one(t):
        p = pre(t)
        return t, post(tr.translate(p, "de", "en") if looks_german(p) or p != t or re.search(r"[A-Za-zäöü]{5,}", p) else p)
    with ThreadPoolExecutor(4) as ex:
        for n, (t, e) in enumerate(ex.map(one, todo), 1):
            cache[t] = e
            if n % 300 == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False)); print(n, flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    print("done", len(cache))

if __name__ == "__main__":
    main()
