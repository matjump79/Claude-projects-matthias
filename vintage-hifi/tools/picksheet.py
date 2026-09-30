import json, sys, pathlib
from PIL import Image, ImageDraw, ImageFont
H = pathlib.Path(__file__).parent
p = json.loads((H / "picks.json").read_text())
ids = list(p); cols = 6; TW, TH = 250, 190
im = Image.new("RGB", (cols * TW, ((len(ids) + cols - 1) // cols) * TH), "white"); d = ImageDraw.Draw(im)
f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
for n, k in enumerate(ids):
    x, y = (n % cols) * TW, (n // cols) * TH
    t = Image.open(H / p[k]["file"]); t.thumbnail((TW - 10, TH - 26)); im.paste(t, (x + 5, y + 20))
    d.text((x + 5, y + 3), k[:34], fill="red", font=f)
im.save(sys.argv[1], quality=80); print(len(ids))
