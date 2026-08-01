"""Organic ('lollipop') inpaint masks for the young stages.

A young tree is a stem plus a leafy top, so the mask is a stem plus a lumpy oval
rather than a rectangle: whatever the model does inside it, the silhouette that
comes back cannot be a box. WHITE = regenerate.

usage: python mkmask2.py <name> <stem_bottom_y> <stem_top_y> <stem_halfw> <cx> <cy> <rx> <ry>
"""
import sys
from PIL import Image, ImageDraw

name = sys.argv[1]
sb, st, sw, cx, cy, rx, ry = map(int, sys.argv[2:9])
m = Image.new("RGB", (192, 192), (0, 0, 0))
d = ImageDraw.Draw(m)
d.rectangle([96 - sw, st, 96 + sw, sb], fill=(255, 255, 255))


def ell(x, y, a, b):
    d.ellipse([x - a, y - b, x + a, y + b], fill=(255, 255, 255))


ell(cx, cy, rx, ry)
ell(cx - int(rx * 0.6), cy + int(ry * 0.3), int(rx * 0.55), int(ry * 0.6))
ell(cx + int(rx * 0.6), cy + int(ry * 0.3), int(rx * 0.55), int(ry * 0.6))
ell(cx, cy - int(ry * 0.5), int(rx * 0.7), int(ry * 0.6))
m.save("maskimg-%s.png" % name)
print("maskimg-%s.png" % name, m.convert("L").point(lambda v: 255 if v > 127 else 0).getbbox())
