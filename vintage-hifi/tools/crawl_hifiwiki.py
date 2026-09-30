"""Crawl hifi-wiki.de category pages and parse each model's data box.

Step 1: list all pages of the five categories (tools/hw/index.json).
Step 2: fetch each page politely (2 workers, pause between requests), cache gzipped HTML,
        parse the data box and write tools/hw/parsed.jsonl. Re-runs skip cached pages.
"""
import gzip, html, json, pathlib, re, sys, time, threading, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests

H = pathlib.Path(__file__).parent / "hw"
(H / "pages").mkdir(parents=True, exist_ok=True)
BASE = "https://www.hifi-wiki.de"
CATS = {"Receiver": "receiver", "Vollverstärker": "integrated", "Vorverstärker": "preamp",
        "Endstufen": "poweramp", "Plattenspieler": "turntable"}
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 (Macintosh) Safari/605.1.15 (personal vintage-hifi research)"

def get(url, tries=4):
    for i in range(tries):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200:
                return r.text
            if r.status_code in (429, 503):
                time.sleep(30 * (i + 1)); continue
            return None
        except requests.RequestException:
            time.sleep(10 * (i + 1))
    return None

def list_category(cat):
    titles, url = [], f"{BASE}/index.php/Kategorie:{urllib.parse.quote(cat)}"
    while url:
        s = get(url) or ""
        block = s.split('id="mw-pages"', 1)[-1]
        titles += re.findall(r'<li><a href="/index.php/([^"#]+)" title="[^"]+"', block)
        nxt = re.search(r'href="([^"]+pagefrom=[^"]+)"[^>]*>nächste Seite', block)
        url = BASE + html.unescape(nxt.group(1)) if nxt else None
        time.sleep(0.5)
    return [t for t in dict.fromkeys(titles) if ":" not in urllib.parse.unquote(t)]

def text_of(s):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>|</(li|p|div|tr|h\d)>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return html.unescape(re.sub(r"[ \t\xa0]+", " ", s))

FIELDS = ["Hersteller", "Modell", "Baujahre", "Baujahr", "Farbe", "Neupreis ca.", "Neupreis", "Gewicht",
          "Abmessungen (B×H×T)", "Antriebsart", "Antrieb", "Leistungsaufnahme"]

def parse(title, s):
    body = s.split('id="mw-content-text"', 1)[-1]
    t = text_of(body)
    d = {"title": urllib.parse.unquote(title).replace("_", " "), "url": f"{BASE}/index.php/{title}"}
    for f in FIELDS:
        m = re.search(r"\n[ \t]*" + re.escape(f) + r"[ \t]*:[ \t]*([^\n]*)", t)
        if m and m.group(1).strip():
            d.setdefault(f.replace(" ca.", "").replace(" (B×H×T)", ""), m.group(1).strip())
    # power lines: first two "8 Ohm ...: 2× .. Watt" style lines after Dauerleistung / Nennleistung
    m = re.search(r"(Dauerleistung|Nennleistung|Sinusleistung|Ausgangsleistung)[^\n]*\n((?:[^\n]*\n){1,4})", t)
    if m:
        lines = [l.strip() for l in m.group(2).split("\n") if re.search(r"\d", l) and ":" in l]
        d["Leistung"] = "; ".join(lines[:2])
    m = re.search(r"Besondere Ausstattungen\s*\n(.*?)(Bemerkungen|Weitere Modelle|Links|$)", t, re.S)
    if m:
        d["Ausstattung"] = [l.strip() for l in m.group(1).split("\n") if l.strip() and "Bearbeiten" not in l][:8]
    m = re.search(r"Bemerkungen\s*\[\s*Bearbeiten\s*\]\s*(.*?)(Weitere Modelle der gleichen Serie|Links\s*\[|Einzelnachweise|Kategorie|$)", t, re.S)
    if m:
        d["Bemerkungen"] = re.sub(r"\s*\n\s*", " ", m.group(1)).strip()[:700]
    imgs = re.findall(r'<img[^>]+src="(/images/[^"]+\.(?:jpe?g|png))"', body, re.I)
    d["images"] = [BASE + i for i in imgs if "/thumb/" not in i or True][:4]
    return d

def fetch(item):
    title, cat = item
    f = H / "pages" / (re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.unquote(title))[:150] + ".html.gz")
    if f.exists():
        s = gzip.decompress(f.read_bytes()).decode("utf-8", "ignore")
    else:
        s = get(f"{BASE}/index.php/{title}")
        time.sleep(0.6)
        if not s:
            return None
        f.write_bytes(gzip.compress(s.encode("utf-8")))
    d = parse(title, s); d["cat"] = cat
    return d

if __name__ == "__main__":
    idx_f = H / "index.json"
    if idx_f.exists():
        index = json.loads(idx_f.read_text())
    else:
        index = {}
        for cat, key in CATS.items():
            for t in list_category(cat):
                index.setdefault(t, key)
            print("listed", cat, len(index), flush=True)
        idx_f.write_text(json.dumps(index))
    items = list(index.items())
    out = open(H / "parsed.jsonl", "w")
    lock = threading.Lock(); n = 0
    with ThreadPoolExecutor(2) as ex:
        for d in ex.map(fetch, items):
            n += 1
            if d:
                with lock:
                    out.write(json.dumps(d, ensure_ascii=False) + "\n")
            if n % 250 == 0:
                print("done", n, "/", len(items), flush=True); out.flush()
    out.close()
    print("finished", n)
