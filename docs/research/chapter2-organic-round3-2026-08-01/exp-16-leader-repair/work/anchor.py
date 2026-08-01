"""Author-time anchor normalisation + drift measurement.

anchor = (trunkX, groundY)
  groundY : bottom-most opaque row  (where the tree meets the land)
  trunkX  : alpha-weighted x over the 10-row band 32..22 px above groundY,
            i.e. the trunk axis ABOVE the root flare, so a wider or narrower
            root spread cannot drag the anchor sideways.
"""
import sys, os, glob, json
from PIL import Image

THR = 8
BAND_HI, BAND_LO = 32, 22


def anchor(im):
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    rows = [y for y in range(h) if any(px[x, y] >= THR for x in range(w))]
    if not rows:
        return None
    gy = max(rows)
    lo, hi = max(0, gy - BAND_HI), max(0, gy - BAND_LO)
    num = den = 0.0
    for y in range(lo, hi + 1):
        for x in range(w):
            v = px[x, y]
            if v >= THR:
                num += x * v
                den += v
    if den == 0:
        # degenerate (very short sprite): fall back to whole-sprite centroid x
        for y in rows:
            for x in range(w):
                v = px[x, y]
                if v >= THR:
                    num += x * v
                    den += v
    return (num / den, gy)


def bbox(im):
    a = im.split()[3]
    w, h = im.size
    px = a.load()
    xs = [x for x in range(w) if any(px[x, y] >= THR for y in range(h))]
    ys = [y for y in range(h) if any(px[x, y] >= THR for x in range(w))]
    if not xs:
        return None
    return (min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


def normalise(src_glob, dst, tx, ty, canvas=None):
    os.makedirs(dst, exist_ok=True)
    rows = []
    for i, p in enumerate(sorted(glob.glob(src_glob))):
        im = Image.open(p).convert('RGBA')
        W, H = canvas or im.size
        ax, ay = anchor(im)
        dx, dy = int(round(tx - ax)), int(round(ty - ay))
        out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        out.alpha_composite(im, (dx, dy))
        na = anchor(out)
        f = os.path.join(dst, f'frame-{i:02d}.png')
        out.save(f)
        rows.append({
            'file': os.path.basename(f), 'src': os.path.basename(p),
            'sourceAnchor': [round(ax, 2), ay], 'offset': [dx, dy],
            'normalizedAnchor': [round(na[0], 2), na[1]],
            'driftX': round(na[0] - tx, 2), 'driftY': na[1] - ty,
            'bbox': list(bbox(out)),
            'alphaPx': sum(1 for v in out.split()[3].getdata() if v >= THR),
            'bytes': os.path.getsize(f),
        })
    return rows


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    tx, ty = float(sys.argv[3]), int(sys.argv[4])
    cw = int(sys.argv[5]) if len(sys.argv) > 5 else None
    rows = normalise(src, dst, tx, ty, (cw, cw) if cw else None)
    print(f"{'file':<13}{'src':<16}{'srcAnchor':>15}{'offset':>10}{'normAnchor':>14}{'driftX':>8}{'driftY':>8}{'bbox':>20}{'alphaPx':>9}{'bytes':>8}")
    for r in rows:
        print(f"{r['file']:<13}{r['src']:<16}{str(r['sourceAnchor']):>15}{str(r['offset']):>10}{str(r['normalizedAnchor']):>14}{r['driftX']:>8}{r['driftY']:>8}{str(r['bbox']):>20}{r['alphaPx']:>9}{r['bytes']:>8}")
    with open(os.path.join(dst, '_anchors.json'), 'w') as f:
        json.dump(rows, f, indent=1)
