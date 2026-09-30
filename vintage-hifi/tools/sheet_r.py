"""Contact sheets: one row per product, candidate thumbnails labelled with their index."""
import json, sys, pathlib
from PIL import Image, ImageDraw, ImageFont
HERE = pathlib.Path(__file__).parent
cands = json.loads((HERE / "cand_relaxed.json").read_text())
ids = sys.argv[2:] or list(cands)
out = sys.argv[1]
TW, TH, LW = 220, 150, 230
rows = [i for i in ids if cands.get(i)]
im = Image.new("RGB", (LW + TW * 6, TH * len(rows) + 4), "white")
d = ImageDraw.Draw(im)
try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except Exception: f = ImageFont.load_default()
for r, pid in enumerate(rows):
    y = r * TH
    d.text((6, y + 8), pid, fill="black", font=f)
    for k, c in enumerate(cands[pid][:6]):
        t = Image.open(HERE / c["file"]); t.thumbnail((TW - 8, TH - 22))
        x = LW + k * TW
        im.paste(t, (x, y + 20))
        d.text((x, y + 2), f"{k} {c['kind'][:4]} {c.get('site', '')[:18]}", fill="red", font=f)
    d.line([(0, y + TH - 1), (im.width, y + TH - 1)], fill="#ccc")
im.save(out, quality=80)
print(out, len(rows))
