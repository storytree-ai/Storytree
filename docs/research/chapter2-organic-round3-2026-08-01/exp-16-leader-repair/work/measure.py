import sys, os, json, glob
from PIL import Image

THR = 8

def bounds(im):
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y] >= THR:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if maxx < 0:
        return None
    return (minx, miny, maxx - minx + 1, maxy - miny + 1)

def anchor(im):
    """alpha-weighted x across bottom three occupied rows; bottom-most occupied y"""
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    rows = [y for y in range(h) if any(px[x, y] >= THR for x in range(w))]
    if not rows:
        return None
    bot = max(rows)
    use = [y for y in rows if y >= bot - 2]
    num = 0.0
    den = 0.0
    for y in use:
        for x in range(w):
            v = px[x, y]
            if v >= THR:
                num += x * v
                den += v
    return (round(num / den), bot)

def opaque_count(im):
    a = im.split()[3]
    return sum(1 for v in a.getdata() if v >= THR)

def report(paths):
    out = []
    for p in paths:
        im = Image.open(p).convert('RGBA')
        b = bounds(im)
        an = anchor(im)
        out.append({
            'file': os.path.basename(p),
            'canvas': list(im.size),
            'bbox': list(b) if b else None,
            'anchor': list(an) if an else None,
            'alphaPx': opaque_count(im),
            'bytes': os.path.getsize(p),
        })
    return out

if __name__ == '__main__':
    pat = sys.argv[1]
    paths = sorted(glob.glob(pat))
    rows = report(paths)
    print(json.dumps(rows, indent=1))
    print('---')
    print(f"{'file':<22}{'canvas':>10}{'bbox(x,y,w,h)':>22}{'anchor':>12}{'alphaPx':>9}{'bytes':>8}")
    for r in rows:
        print(f"{r['file']:<22}{str(r['canvas']):>10}{str(r['bbox']):>22}{str(r['anchor']):>12}{r['alphaPx']:>9}{r['bytes']:>8}")
