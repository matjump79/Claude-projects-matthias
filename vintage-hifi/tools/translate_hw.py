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
]
JUNK = re.compile(r"\[\s*Bearbeiten\s*\]|\bBilder\b\s*(?=\[|$)|\bBild:\s*|\bBerichte\b\s*(?=\[|$)|\bDokumente\b\s*(?=\[|$)|\[\d+\]")

def clean(s):
    s = JUNK.sub(" ", s or "")
    s = re.sub(r"\b(Bilder|Berichte|Dokumente)\s*$", "", s.strip())
    return re.sub(r"\s+", " ", s).strip(" -–")

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
    texts.discard("")
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [t for t in texts if t not in cache]
    print(len(texts), "texts,", len(todo), "to translate", flush=True)
    def one(t):
        p = pre(t)
        return t, (tr.translate(p, "de", "en") if looks_german(p) or p != t or re.search(r"[A-Za-zäöü]{5,}", p) else p)
    with ThreadPoolExecutor(4) as ex:
        for n, (t, e) in enumerate(ex.map(one, todo), 1):
            cache[t] = e
            if n % 300 == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False)); print(n, flush=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    print("done", len(cache))

if __name__ == "__main__":
    main()
