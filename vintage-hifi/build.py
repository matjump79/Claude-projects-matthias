"""Inline the data files into one self-contained HTML file for easy sharing."""
import pathlib, re

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")

def inline(m):
    return "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "</script>"

out = re.sub(r'<script src="(data/[^"]+\.js)"></script>', inline, html)
target = root / "vintage-hifi-1977-1983.html"
target.write_text(out, encoding="utf-8")
print(f"wrote {target.name} ({len(out) // 1024} KB)")
