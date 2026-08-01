"""Build a non-rectangular (canopy-shaped) inpaint mask: WHITE = regenerate.

usage: python mkmask.py <name> <cx> <cy> <rx> <ry>
Draws a union of five ellipses arranged as a lumpy dome so the model is not being
handed a rectangle to fill. Saved as maskimg-<name>.png (192x192, RGB).
"""
import sys
from PIL import Image, ImageDraw

name, cx, cy, rx, ry = sys.argv[1], *map(int, sys.argv[2:6])
m = Image.new("RGB", (192, 192), (0, 0, 0))
d = ImageDraw.Draw(m)


def ell(x, y, a, b):
    d.ellipse([x - a, y - b, x + a, y + b], fill=(255, 255, 255))


ell(cx, cy, rx, ry)
ell(cx - int(rx * 0.55), cy + int(ry * 0.25), int(rx * 0.52), int(ry * 0.60))
ell(cx + int(rx * 0.55), cy + int(ry * 0.25), int(rx * 0.52), int(ry * 0.60))
ell(cx - int(rx * 0.35), cy - int(ry * 0.45), int(rx * 0.45), int(ry * 0.50))
ell(cx + int(rx * 0.35), cy - int(ry * 0.45), int(rx * 0.45), int(ry * 0.50))
m.save("maskimg-%s.png" % name)
bb = m.convert("L").point(lambda v: 255 if v > 127 else 0).getbbox()
print("maskimg-%s.png" % name, "white bbox", bb)
