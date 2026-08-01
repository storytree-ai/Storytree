import sys
sys.path.insert(0, '.')
from imgtools import *
from plan import LADDER
from PIL import ImageDraw

base = Image.open('base.png').convert('RGBA')
tiles = []
for name, mx, my, mw, mh, young in LADDER:
    im = base.copy()
    if young:
        px = im.load()
        cut = my + mh          # keep everything at or below the mask's bottom edge
        for y in range(0, cut):
            for x in range(192):
                px[x, y] = (0, 0, 0, 0)
        # The horizontal cut can strand twig fragments that hang below it but are no
        # longer joined to the trunk. Keep only the component that reaches the ground.
        keep = set()
        stack = [(x, 191 - dy) for dy in range(8) for x in range(192)
                 if px[x, 191 - dy][3] > 8]
        while stack:
            x, y = stack.pop()
            if (x, y) in keep or not (0 <= x < 192 and 0 <= y < 192):
                continue
            if px[x, y][3] <= 8:
                continue
            keep.add((x, y))
            for ddx in (-1, 0, 1):
                for ddy in (-1, 0, 1):
                    stack.append((x + ddx, y + ddy))
        for y in range(192):
            for x in range(192):
                if px[x, y][3] > 0 and (x, y) not in keep:
                    px[x, y] = (0, 0, 0, 0)
    im.save('input-%s.png' % name)
    v = im.copy()
    ImageDraw.Draw(v).rectangle([mx, my, mx + mw - 1, my + mh - 1], outline=(255, 0, 0, 255))
    v.save('vis-%s.png' % name)
    tiles.append('vis-%s.png' % name)
sheet(tiles, 3, scale=2).save('mask-plan.png')
print('prepped', len(tiles))
