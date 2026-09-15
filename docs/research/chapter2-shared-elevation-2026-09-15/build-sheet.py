#!/usr/bin/env python3
"""Lay the four renders out as ONE comparison sheet, at both framings.

The sheet exists so the owner can answer ONE question — which camera elevation should the studio's
SVG map and the 3D land canvas SHARE — by looking rather than by reading numbers. Every picture in
it is the REAL forest (36 islands, live corpus), never a fixture, and the two columns differ in the
elevation and in nothing else.

Reproduce (from this directory, after the renders exist):  python3 build-sheet.py
"""
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
CELL_W = 1180
PAD = 26
BG = (24, 27, 31)
INK = (232, 238, 243)
DIM = (150, 165, 178)
ACCENT = (183, 224, 138)

f_title = ImageFont.truetype(BOLD, 40)
f_head = ImageFont.truetype(BOLD, 30)
f_cap = ImageFont.truetype(FONT, 21)
f_small = ImageFont.truetype(FONT, 19)

# (row label, file at 20, file at 50, caption at 20, caption at 50, crop)
#
# ⚠ `crop` CROPS BOTH ARMS TO ONE RECT, never to each picture's own content. The 3D frames are
# mostly background at these zooms, and cropping each to what IT happens to contain would scale the
# two arms differently — so the row would show a size difference this sheet invented. One rect over
# both keeps the pair comparable as pictures, which is the only thing a look can be made on.
ROWS = [
    ('THE MAP, resting — the framing the studio actually opens on, and the one everybody works in',
     '2d-resting-at-20.png', '2d-resting-at-50.png',
     'scale 3.095 px/unit  ·  median island 206 px wide',
     'scale 2.947 px/unit  ·  median island 201 px wide  —  2.6% smaller, and that is the whole cost here',
     None),
    ('THE MAP, fitted — the whole forest in one screen',
     '2d-fit-at-20.png', '2d-fit-at-50.png',
     'scale 1.400 px/unit  ·  median island 86 px wide  ·  world box 826 x 1310',
     'scale 0.659 px/unit  ·  median island 42 px wide  ·  world box 826 x 2819  —  HALF the island',
     None),
    ('THE LAND at the map’s own scale — 1.400 px per world x unit, the fitted map’s delivered zoom',
     '3d-at-20/3d-matched.png', '3d-at-50/3d-matched.png',
     'land covers 1.52% of the frame  ·  4.26% of its own box',
     'land covers 1.17% of the frame  ·  7.17% of its own box  —  the depth ADR-0517 took',
     (980, 0, 1700, 1600)),
    ('THE LAND, read zoom — one island at 8 px/unit',
     '3d-at-20/3d-one.png', '3d-at-50/3d-one.png',
     'at 20° the corridor stacks up behind the island: land fills 1854 x 1544 px',
     'at 50° the island reads as an island: land fills 956 x 520 px',
     (700, 0, 1900, 1600)),
]

def cell(path, crop=None):
    im = Image.open(path).convert('RGB')
    if crop is not None:
        im = im.crop(crop)
    return im.resize((CELL_W, round(CELL_W * im.height / im.width)), Image.LANCZOS)

samples = [cell(r[1], r[5]) for r in ROWS]
row_h = [s.height for s in samples]
head_h, cap_h, rowlab_h = 168, 34, 44
H = head_h + sum(h + rowlab_h + cap_h + PAD * 2 for h in row_h) + PAD
W = PAD * 3 + CELL_W * 2

sheet = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(sheet)
d.text((PAD, 24), 'ONE ELEVATION FOR BOTH MAP LAYERS — 20° against 50°, on the real forest', font=f_title, fill=INK)
d.text((PAD, 76), "storytree's live corpus, 36 islands, rendered 2026-09-15 on an RTX 2060. Left: today — the map draws at 20°, the land is", font=f_small, fill=DIM)
d.text((PAD, 102), 'viewed at 50°, and the two layers cannot be registered. Right: both at 50°. The two columns differ in the elevation and', font=f_small, fill=DIM)
d.text((PAD, 128), 'in nothing else — same corpus, same layout, same paint. Which one they share is the owner\'s look; this picks neither.', font=f_small, fill=DIM)

y = head_h
for (label, p20, p50, c20, c50, crop), h in zip(ROWS, row_h):
    d.text((PAD, y), label, font=f_head, fill=ACCENT)
    y += rowlab_h
    for i, (p, c) in enumerate(((p20, c20), (p50, c50))):
        x = PAD + i * (CELL_W + PAD)
        sheet.paste(cell(p, crop), (x, y))
        d.text((x, y + h + 8), ('20°  ' if i == 0 else '50°  ') + c, font=f_cap, fill=INK if i == 0 else ACCENT)
    y += h + cap_h + PAD * 2

sheet.save('sheet-shared-elevation.png')
print(f'sheet-shared-elevation.png  {W}x{H}')
