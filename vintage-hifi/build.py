"""Inline the data files into self-contained HTML.

python3 build.py                -> vintage-hifi-1970-1989.html (download version; HiFi-Wiki photos load from hifi-wiki.de)
python3 build.py --artifact DIR -> DIR/vintage-hifi.html + DIR/photos/pNN.json
                                   (hosted page: no document wrapper; HiFi-Wiki photos packed into chunk files)
"""
import base64, json, pathlib, re, sys

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")

def data_uri(path):
    return "data:image/jpeg;base64," + base64.b64encode((root / path).read_bytes()).decode()

def embed_photos(js):
    # hand-checked in-depth photos are small in number: embed them directly
    return re.sub(r'"src": "(photos/[^"]+\.jpg)"', lambda m: '"src": "' + data_uri(m.group(1)) + '"', js)

html = re.sub(r'<script src="(data/[^"]+\.js)"></script>',
              lambda m: "<script>\n" + embed_photos((root / m.group(1)).read_text(encoding="utf-8")) + "</script>", html)

html = re.sub(r'src="(photos/[^"]+\.jpg)"', lambda m: 'src="' + data_uri(m.group(1)) + '"', html)   # banner image

if "--artifact" in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index("--artifact") + 1]); (out / "photos").mkdir(parents=True, exist_ok=True)
    for tag in ("<!doctype html>", '<html lang="en">', "<head>", "</head>", "<body>", "</body>", "</html>",
                '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">'):
        html = html.replace(tag, "")
    html = html.replace("<script>window.HIFI = [];</script>",
                        "<script>window.HIFI = []; window.HIFI_NO_REMOTE = true; window.HIFI_PHOTO_CHUNKS = true;</script>")
    target = out / "vintage-hifi.html"
    # HiFi-Wiki photos → photos/pNN.json, {id: data URI}
    js = (root / "data" / "hifiwiki.js").read_text(encoding="utf-8")
    entries = json.loads(js[js.index("["): js.rindex("]") + 1])
    chunks = {}
    for e in entries:
        if "pc" in e and (root / e["ph"]).exists():
            chunks.setdefault(e["pc"], {})[e["id"]] = data_uri(e["ph"])
    for n, c in chunks.items():
        (out / "photos" / f"p{n:02d}.json").write_text(json.dumps(c), encoding="utf-8")
    print(f"{len(chunks)} photo chunks")
    html = html.lstrip()
else:
    target = root / "vintage-hifi-1970-1989.html"
target.write_text(html, encoding="utf-8")
print(f"wrote {target} ({len(html) // 1024} KB)")
