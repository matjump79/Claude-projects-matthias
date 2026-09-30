"""Inline the data files into self-contained HTML.

python3 build.py              -> vintage-hifi-1977-1983.html (download version, live Commons photos)
python3 build.py --artifact X -> X (hosted page: no document wrapper, no remote photo lookups)
"""
import pathlib, re, sys

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
import base64
def embed_photos(js):
    return re.sub(r'"src": "(photos/[^"]+\.jpg)"', lambda m: '"src": "data:image/jpeg;base64,'
                  + base64.b64encode((root / m.group(1)).read_bytes()).decode() + '"', js)
html = re.sub(r'<script src="(data/[^"]+\.js)"></script>',
              lambda m: "<script>\n" + embed_photos((root / m.group(1)).read_text(encoding="utf-8")) + "</script>", html)

if "--artifact" in sys.argv:
    target = pathlib.Path(sys.argv[sys.argv.index("--artifact") + 1])
    for tag in ("<!doctype html>", '<html lang="en">', "<head>", "</head>", "<body>", "</body>", "</html>",
                '<meta charset="utf-8">', '<meta name="viewport" content="width=device-width, initial-scale=1">'):
        html = html.replace(tag, "")
    html = html.replace("<script>window.HIFI = [];</script>", "<script>window.HIFI = []; window.HIFI_NO_REMOTE = true;</script>")
    html = html.lstrip()
else:
    target = root / "vintage-hifi-1977-1983.html"
target.write_text(html, encoding="utf-8")
print(f"wrote {target} ({len(html) // 1024} KB)")
