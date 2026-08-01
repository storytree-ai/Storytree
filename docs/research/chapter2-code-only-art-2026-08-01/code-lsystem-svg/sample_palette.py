"""Sample the real palettes we must belong to: exp-16's own frames and the island plate.

Read-only. Prints ranked opaque colours so the generator's palette constants can be
lifted from measured game art rather than invented.
"""
import sys, colorsys
from collections import Counter
from PIL import Image

R3 = r"C:/code/storytree/docs/research/chapter2-organic-round3-2026-08-01"
EXP16 = R3 + "/exp-16-leader-repair/frames"
PLATE = R3 + "/exp-11-in-context-inpaint/reference/plate-pad.png"


def rank(img, label, top=40):
    px = img.convert("RGBA").load()
    w, h = img.size
    c = Counter()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200:
                c[(r, g, b)] += 1
    tot = sum(c.values())
    print(f"\n=== {label}  ({len(c)} distinct opaque colours, {tot} px) ===")
    for (r, g, b), n in c.most_common(top):
        hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        print(f"  #{r:02x}{g:02x}{b:02x}  ({r:3d},{g:3d},{b:3d})  {n:6d} px  {100*n/tot:5.2f}%  h={hh*360:6.1f} s={ss:.3f} v={vv:.3f}")
    return c


tot = Counter()
for i in (0, 4, 9, 14, 18):
    im = Image.open(f"{EXP16}/frame-{i:02d}.png")
    c = rank(im, f"exp-16 frame-{i:02d}", top=12)
    tot.update(c)
rank(Image.open(PLATE), "island plate-pad", top=24)

print(f"\n=== exp-16 union over sampled frames: {len(tot)} distinct ===")
for (r, g, b), n in tot.most_common(40):
    hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    print(f"  #{r:02x}{g:02x}{b:02x}  ({r:3d},{g:3d},{b:3d})  {n:6d}  h={hh*360:6.1f} s={ss:.3f} v={vv:.3f}")
