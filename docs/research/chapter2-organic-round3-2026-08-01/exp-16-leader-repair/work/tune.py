"""Deterministic palette tune applied to the shared 30-colour track palette.

Operates on the PALETTE, not on pixels, so every frame gets the identical
transform: geometry untouched, cross-frame palette identity preserved.
"""
import sys, os, glob, colorsys, json
from PIL import Image


CLASS_BY_COLOUR = {}


def cls(r, g, b):
    """Classify a palette colour as foliage / bark / neutral.

    Hue alone mis-sorts the canopy: the crown highlight sits at 52 deg and the
    trunk at 33 deg, so the pale cream-green canopy tops were being browned as
    bark. Colours in the ambiguous 36-62 deg olive band are therefore resolved
    by WHERE they occur - CLASS_BY_COLOUR is filled by measure_classes() from
    each colour's mean y across the track.
    """
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    if (r, g, b) in CLASS_BY_COLOUR:
        return CLASS_BY_COLOUR[(r, g, b)], h, s, v
    if s <= 0.07:
        return 'neutral', h, s, v
    if 0.10 <= h <= 0.47:
        return 'foliage', h, s, v
    return 'bark', h, s, v


def measure_classes(paths):
    """hue band + mean-y tiebreak -> a fixed class per palette colour."""
    import collections
    cnt = collections.Counter(); ys = collections.Counter(); H = 128
    for p in paths:
        im = Image.open(p).convert('RGBA'); H = im.size[1]; px = im.load()
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                r, g, b, a = px[x, y]
                if a < 128:
                    continue
                cnt[(r, g, b)] += 1; ys[(r, g, b)] += y
    CLASS_BY_COLOUR.clear()
    for c, n in cnt.items():
        h, s, v = colorsys.rgb_to_hsv(*[q/255 for q in c])
        deg = h*360; my = ys[c]/n/H
        if s <= 0.07:
            k = 'neutral'
        elif deg < 36 or deg > 169:
            k = 'bark'
        elif deg < 62:
            k = 'foliage' if my < 0.55 else 'bark'
        else:
            k = 'foliage'
        CLASS_BY_COLOUR[c] = k
    return CLASS_BY_COLOUR


def palette(paths):
    cols = set()
    for p in paths:
        im = Image.open(p).convert('RGBA')
        for r, g, b, a in im.getdata():
            if a >= 128:
                cols.add((r, g, b))
    return sorted(cols)


def build_map(cols, P):
    fol = [(c, cls(*c)) for c in cols if cls(*c)[0] == 'foliage']
    bar = [(c, cls(*c)) for c in cols if cls(*c)[0] == 'bark']
    fv = [t[3] for _, t in fol] or [0, 1]
    bv = [t[3] for _, t in bar] or [0, 1]
    fmin, fmax = min(fv), max(fv)
    bmin, bmax = min(bv), max(bv)
    m = {}
    for c in cols:
        k, h, s, v = cls(*c)
        if k == 'foliage':
            h2 = h + P['fol_hue']
            s2 = min(P['fol_smax'], max(P.get('fol_smin', 0.0), s*P['fol_s']))
            t = (v - fmin)/(fmax - fmin) if fmax > fmin else 0.5
            v2 = P['fol_vlo'] + t*(P['fol_vhi'] - P['fol_vlo'])
        elif k == 'bark':
            h2 = h + P['bark_hue']
            s2 = min(P['bark_smax'], max(P.get('bark_smin', 0.0), s*P['bark_s']))
            t = (v - bmin)/(bmax - bmin) if bmax > bmin else 0.5
            v2 = P['bark_vlo'] + t*(P['bark_vhi'] - P['bark_vlo'])
        else:
            m[c] = c
            continue
        r, g, b = colorsys.hsv_to_rgb(h2 % 1.0, max(0.0, min(1.0, s2)), max(0.0, min(1.0, v2)))
        m[c] = (int(r*255+0.5), int(g*255+0.5), int(b*255+0.5))
    return m


def apply(paths, dst, m):
    os.makedirs(dst, exist_ok=True)
    out = []
    for i, p in enumerate(paths):
        im = Image.open(p).convert('RGBA')
        px = [(0, 0, 0, 0) if a < 128 else (*m.get((r, g, b), (r, g, b)), a)
              for r, g, b, a in im.getdata()]
        o = Image.new('RGBA', im.size)
        o.putdata(px)
        f = os.path.join(dst, f'frame-{i:02d}.png')
        o.save(f)
        out.append(f)
    return out


PRESETS = {
    'p0': dict(fol_hue=0.0,   fol_s=1.0,  fol_smax=0.9, fol_vlo=0.00, fol_vhi=1.00,
               bark_hue=0.0,  bark_s=1.0, bark_smax=0.9, bark_vlo=0.00, bark_vhi=1.00),  # identity-ish (recomputed range)
    'p1': dict(fol_hue=0.006, fol_s=1.45, fol_smax=0.58, fol_vlo=0.34, fol_vhi=0.72,
               bark_hue=-0.004, bark_s=1.30, bark_smax=0.62, bark_vlo=0.26, bark_vhi=0.60),
    'p2': dict(fol_hue=0.010, fol_s=1.80, fol_smax=0.68, fol_vlo=0.30, fol_vhi=0.70,
               bark_hue=-0.006, bark_s=1.45, bark_smax=0.70, bark_vlo=0.22, bark_vhi=0.56),
    'p3': dict(fol_hue=0.003, fol_s=1.25, fol_smax=0.48, fol_vlo=0.38, fol_vhi=0.76,
               bark_hue=-0.002, bark_s=1.15, bark_smax=0.55, bark_vlo=0.30, bark_vhi=0.64),
    'p4': dict(fol_hue=0.006, fol_s=1.45, fol_smax=0.58, fol_smin=0.34, fol_vlo=0.34, fol_vhi=0.72,
               bark_hue=-0.004, bark_s=1.30, bark_smax=0.62, bark_smin=0.34, bark_vlo=0.26, bark_vhi=0.60),
    'p5': dict(fol_hue=0.008, fol_s=1.60, fol_smax=0.62, fol_smin=0.40, fol_vlo=0.32, fol_vhi=0.70,
               bark_hue=-0.005, bark_s=1.38, bark_smax=0.66, bark_smin=0.38, bark_vlo=0.24, bark_vhi=0.58),
}

if __name__ == '__main__':
    srcglob, dst, preset = sys.argv[1], sys.argv[2], sys.argv[3]
    paths = sorted(glob.glob(srcglob))
    measure_classes(paths)
    cols = palette(paths)
    m = build_map(cols, PRESETS[preset])
    apply(paths, dst, m)
    print(preset, 'palette in', len(cols), '-> out', len(set(m.values())), '->', dst)
