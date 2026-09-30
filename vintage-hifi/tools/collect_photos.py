"""Collect candidate product photos.

Order per product: Wikimedia Commons (free licence) → images on the product's own source pages.
Writes tools/candidates.json and downloads candidates to tools/cand/<id>/.
Candidates are reviewed by eye (contact sheet) before any is used.
"""
import json, re, pathlib, time, unicodedata, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import requests
from PIL import Image
from io import BytesIO

HERE = pathlib.Path(__file__).parent
CAND = HERE / "cand"
UA = {"User-Agent": "VintageHiFiDatabase/1.0 (personal research; matjump project) python-requests"}
S = requests.Session(); S.headers.update(UA)

def norm(s):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s.lower()))

def keys(p):
    m = norm(re.split(r"[\s/(]", p["model"])[0])
    b = norm(re.split(r"[\s/]", p["brand"])[0])
    return m, b

def title_ok(p, title):
    t = norm(re.sub(r"\.[a-z]+$", "", urllib.parse.unquote(title), flags=re.I))
    m, b = keys(p)
    needles = [m, b + m] if (re.search(r"[a-z]", m) and re.search(r"\d", m) and len(m) >= 5) else [b + m]
    for n in needles:
        i = t.find(n)
        while i != -1:
            nxt = t[i + len(n): i + len(n) + 1]
            if not nxt.isdigit():
                return True
            i = t.find(n, i + 1)
    return False

def commons(p):
    out = []
    brand = re.sub(r"\s*/.*$", "", p["brand"])
    model = re.sub(r"\s*\(.*\)", "", p["model"])
    for q in (f"{brand} {model}", model):
        r = S.get("https://commons.wikimedia.org/w/api.php", params={
            "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 20,
            "gsrsearch": q, "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 800}, timeout=30)
        pages = sorted((r.json().get("query") or {}).get("pages", {}).values(), key=lambda x: x.get("index", 0))
        for pg in pages:
            ii = (pg.get("imageinfo") or [{}])[0]
            if not re.match(r"image/(jpeg|png|webp)", ii.get("mime", "")) or not title_ok(p, pg["title"]):
                continue
            md = ii.get("extmetadata", {})
            strip = lambda h: re.sub(r"<[^>]*>", "", h or "").strip()
            out.append({"kind": "commons", "src": ii.get("thumburl") or ii["url"], "page": ii["descriptionurl"],
                        "title": pg["title"][5:], "license": strip(md.get("LicenseShortName", {}).get("value")),
                        "author": strip(md.get("Artist", {}).get("value"))[:100]})
        if out:
            break
        time.sleep(0.3)
    return out

IMG_RE = re.compile(r"""<img[^>]+?src=["']([^"']+)["'][^>]*>""", re.I)

def page_images(p, url):
    try:
        r = S.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 (Macintosh) Safari/605.1.15"})
    except Exception:
        return []
    if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
        return []
    html = r.text
    found = []
    og = re.findall(r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)""", html, re.I)
    for tag in IMG_RE.finditer(html):
        found.append((tag.group(1), tag.group(0)))
    found = [(u, t) for u, t in found]
    res = []
    for u, tag in found + [(o, o) for o in og]:
        full = urllib.parse.urljoin(r.url, u)
        if not re.search(r"\.(jpe?g|png|webp)(\?|$)", full, re.I):
            continue
        if re.search(r"logo|icon|banner|avatar|flag|ebayimg|gifbanner|/dates/|sprite|button", full, re.I):
            continue
        # the image name or its alt text must name the model
        if not (title_ok(p, full.rsplit("/", 1)[-1]) or title_ok(p, tag)):
            continue
        res.append({"kind": "page", "src": full, "page": url, "title": full.rsplit("/", 1)[-1],
                    "site": urllib.parse.urlparse(url).netloc.replace("www.", "")})
    return res

PREFERRED = ["hifi-wiki", "radiomuseum", "audio-heritage", "classicreceivers", "wikipedia", "thevintageknob",
             "studerundrevox", "hifimuseum", "denon.jp", "mcintoshlabs", "liquidaudio", "1001hifi", "beocentral"]

def collect(p):
    cands = []
    try:
        cands += commons(p)
    except Exception as e:
        print("commons err", p["id"], e)
    urls = list(dict.fromkeys([p["photos"]] + p["sources"]))
    urls.sort(key=lambda u: next((i for i, d in enumerate(PREFERRED) if d in u), 99))
    for u in urls:
        cands += page_images(p, u)
    seen, uniq = set(), []
    for c in cands:
        if c["src"] not in seen:
            seen.add(c["src"]); uniq.append(c)
    # download first few, keep those big enough
    d = CAND / p["id"]; d.mkdir(parents=True, exist_ok=True)
    kept = []
    for i, c in enumerate(uniq[:8]):
        try:
            r = S.get(c["src"], timeout=40, headers={"Referer": c["page"], "User-Agent": "Mozilla/5.0 Safari/605.1.15"})
            im = Image.open(BytesIO(r.content)); im.load()
        except Exception:
            continue
        if im.width < 300 or im.height < 150:
            continue
        f = d / f"{i}.jpg"
        im.convert("RGB").save(f, quality=88)
        c.update(file=str(f.relative_to(HERE)), w=im.width, h=im.height)
        kept.append(c)
    print(f"{p['id']}: {len(uniq)} found, {len(kept)} kept", flush=True)
    return p["id"], kept

if __name__ == "__main__":
    products = json.loads((HERE / "products.json").read_text())
    with ThreadPoolExecutor(6) as ex:
        result = dict(ex.map(collect, products))
    (HERE / "candidates.json").write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print("missing:", [k for k, v in result.items() if not v])
