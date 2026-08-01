"""Young stages, second design.

The first design (a rectangular mask over an empty box above a flat-cut trunk)
failed three times: with nothing but a cut pole under the mask the model always
completed the pole and never grew leaves. What DID work was f4 — a lumpy dome
mask laid over the tree's own twigs. So the young stages use the same recipe
translated down the trunk: clear the canvas above the dome, keep the ground-
connected remainder, and lay the dome over whatever branch tips survive.
"""
import sys
sys.path.insert(0, '.')
from imgtools import *
from PIL import ImageDraw

# (name, clear_above, cx, cy, rx, ry)
YOUNG = [
    ("f0", 164, 96, 152, 20, 14),
    ("f1", 140, 96, 126, 28, 19),
    ("f2", 112, 96, 100, 34, 24),
    ("f3",  86, 96,  74, 44, 30),
]


def dome(cx, cy, rx, ry):
    m = Image.new("RGB", (192, 192), (0, 0, 0))
    d = ImageDraw.Draw(m)

    def ell(x, y, a, b):
        d.ellipse([x - a, y - b, x + a, y + b], fill=(255, 255, 255))
    ell(cx, cy, rx, ry)
    ell(cx - int(rx * .55), cy + int(ry * .25), int(rx * .52), int(ry * .60))
    ell(cx + int(rx * .55), cy + int(ry * .25), int(rx * .52), int(ry * .60))
    ell(cx - int(rx * .35), cy - int(ry * .45), int(rx * .45), int(ry * .50))
    ell(cx + int(rx * .35), cy - int(ry * .45), int(rx * .45), int(ry * .50))
    return m


def ground_connected(im):
    px = im.load()
    keep, stack = set(), [(x, 191 - dy) for dy in range(10) for x in range(192)
                         if px[x, 191 - dy][3] > 8]
    while stack:
        x, y = stack.pop()
        if (x, y) in keep or not (0 <= x < 192 and 0 <= y < 192) or px[x, y][3] <= 8:
            continue
        keep.add((x, y))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                stack.append((x + dx, y + dy))
    for y in range(192):
        for x in range(192):
            if px[x, y][3] > 0 and (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)
    return im


if __name__ == "__main__":
    base = Image.open("base.png").convert("RGBA")
    vis = []
    for name, cut, cx, cy, rx, ry in YOUNG:
        im = base.copy()
        px = im.load()
        for y in range(cut):
            for x in range(192):
                px[x, y] = (0, 0, 0, 0)
        ground_connected(im)
        im.save("input2-%s.png" % name)
        m = dome(cx, cy, rx, ry)
        m.save("maskimg2-%s.png" % name)
        v = im.copy()
        mk = m.convert("L").load()
        vp = v.load()
        for y in range(192):
            for x in range(192):
                if mk[x, y] > 127 and vp[x, y][3] < 8:
                    vp[x, y] = (255, 0, 0, 90)
        v.save("vis2-%s.png" % name)
        vis.append("vis2-%s.png" % name)
        print(name, "input bounds", alpha_bounds(im), "mask bbox",
              m.convert("L").point(lambda v: 255 if v > 127 else 0).getbbox())
    sheet(vis, 4, scale=2).save("young-plan.png")
