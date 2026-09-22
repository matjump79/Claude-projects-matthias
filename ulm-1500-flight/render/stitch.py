#!/usr/bin/env python3
"""Glue the rendered tiles into one frame and save it as a JPEG."""
import sys, os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

tmp, out, tiles, tw, th, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])

full = Image.new('RGB', (tw * tiles, th * tiles))
for ty in range(tiles):
    for tx in range(tiles):
        p = os.path.join(tmp, f't_{ty:02d}_{tx:02d}.png')
        with Image.open(p) as im:
            full.paste(im.convert('RGB'), (tx * tw, ty * th))

os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
full.save(out, 'JPEG', quality=quality, subsampling=0, optimize=True, progressive=True)
print(f'  {full.size[0]}x{full.size[1]}  {os.path.getsize(out)/1e6:.1f} MB')
