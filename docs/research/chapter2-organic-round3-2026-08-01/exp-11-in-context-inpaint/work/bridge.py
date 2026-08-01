from PIL import Image, ImageDraw
import lib, oneoff, os
HERE = os.path.dirname(os.path.abspath(__file__))
base = Image.open(os.path.join(HERE,'base-crop.png')).convert('RGBA')
clean = base.copy(); prev = Image.open(os.path.join(HERE,'cut-03.png')).convert('RGBA')
clean.alpha_composite(prev)
m = Image.new('L', clean.size, 0)
ImageDraw.Draw(m).ellipse([47-25, 50, 47+25, 108], fill=255)
b = lib.alpha_bounds(prev); fp = prev.load(); mp = m.load()
for y in range(max(0,b[3]-11), clean.height):
    for x in range(clean.width):
        if fp[x,y][3] > 8: mp[x,y] = 0
desc = ("a tree with a thick brown trunk and a broad rounded dark green leafy canopy, filling this "
        "whole area, standing on the tan hexagonal ground. Keep the tan ground and the sand coast "
        "exactly as they are; exactly one tree; no shadow, no soil patch.")
oneoff.go('s04b', clean, m, desc, 31121)
