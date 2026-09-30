"""Score how much an image looks like a printed page (text/table) rather than a product photo."""
from PIL import Image, ImageFilter
import numpy as np
def docscore(path_or_img):
    im = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
    im = im.convert("RGB"); im.thumbnail((240, 180))
    a = np.asarray(im).astype(float)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    paper = ((mx > 170) & (sat < 0.22)).mean()                 # bright, colourless background (white or cream paper)
    g = np.asarray(im.convert("L")).astype(float)
    dx = np.abs(np.diff(g, axis=1)).mean(); dy = np.abs(np.diff(g, axis=0)).mean()
    rows = (np.abs(np.diff(g, axis=1)) > 40).mean(1)            # text rows: many sharp transitions per row
    textrows = (rows > 0.06).mean()
    return round(paper * 2 + textrows * 2 + (dx + dy) / 20, 3), round(paper, 2), round(textrows, 2)
