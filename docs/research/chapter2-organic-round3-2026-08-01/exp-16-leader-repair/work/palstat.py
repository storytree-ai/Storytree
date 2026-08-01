import sys, glob, colorsys, json
from PIL import Image

def stats(paths):
    fol = []   # foliage: hue 0.15..0.45
    bark = []  # bark: hue < 0.13 or > 0.9
    for p in paths:
        im = Image.open(p).convert('RGBA')
        for r, g, b, a in im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata():
            if a < 128:
                continue
            h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
            if 0.15 <= h <= 0.45 and s > 0.06:
                fol.append((h, s, v))
            elif s > 0.06:
                bark.append((h, s, v))
    def agg(rows, name):
        if not rows:
            return {name: None}
        n = len(rows)
        m = [sum(r[i] for r in rows)/n for i in range(3)]
        sd = [(sum((r[i]-m[i])**2 for r in rows)/n)**0.5 for i in range(3)]
        return {name: {'n': n, 'h': round(m[0], 4), 's': round(m[1], 4), 'v': round(m[2], 4),
                       'hsd': round(sd[0], 4), 'ssd': round(sd[1], 4), 'vsd': round(sd[2], 4)}}
    out = {}
    out.update(agg(fol, 'foliage'))
    out.update(agg(bark, 'bark'))
    return out

if __name__ == '__main__':
    for label, pat in [a.split('=', 1) for a in sys.argv[1:]]:
        paths = sorted(glob.glob(pat))
        print(label, len(paths), json.dumps(stats(paths)))
