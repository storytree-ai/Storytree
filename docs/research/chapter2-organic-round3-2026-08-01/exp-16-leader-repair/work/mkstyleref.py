"""Build the style-target reference plate.

Left panel  : the real SVG island body, untouched -> teaches outline weight,
              flat-facet shading, low contrast, the world's value range.
Right panel : the SAME facets hue-rotated into foliage green (upper) and
              trunk brown (lower) -> teaches what green/brown look like when
              they are drawn in that language.

Nothing here is generated art; it is a deterministic recolour of the real plate.
"""
from PIL import Image
import os, colorsys
B = os.path.dirname(os.path.abspath(__file__))
isl = Image.open(os.path.join(B, 'island-body.png')).convert('RGB')
w, h = isl.size
px = isl.load()

def istan(c):
    r, g, b = c
    return (r - b) > 45 and 120 < r < 235

def recol(c, target_h, target_s_mul, target_v_mul):
    r, g, b = [v/255 for v in c]
    hh, s, v = colorsys.rgb_to_hsv(r, g, b)
    nr, ng, nb = colorsys.hsv_to_rgb(target_h, min(1.0, s*target_s_mul), min(1.0, v*target_v_mul))
    return (int(nr*255), int(ng*255), int(nb*255))

green = isl.copy(); gp = green.load()
split = int(h*0.58)
for y in range(h):
    for x in range(w):
        c = px[x, y]
        if istan(c):
            if y < split:
                gp[x, y] = recol(c, 0.235, 1.35, 0.92)   # sage / olive foliage
            else:
                gp[x, y] = recol(c, 0.068, 1.15, 0.80)   # warm bark brown
        # cream outline + pink bg left exactly as the world draws them

out = Image.new('RGB', (w*2+6, h), (242, 227, 220))
out.paste(isl, (0, 0))
out.paste(green, (w+6, 0))
out.save(os.path.join(B, 'style-target.png'))
print('style-target', out.size)
