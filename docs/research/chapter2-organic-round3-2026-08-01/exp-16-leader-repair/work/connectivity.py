"""Is the tree ONE body?

Every recorded failure of this round is a canopy that is not physically joined
to its trunk. That is a measurable property, not an opinion: label the opaque
pixels into 8-connected components and report how much mass sits OUTSIDE the
component that contains the root.
"""
import glob, os, sys, json, colorsys
from collections import deque
from PIL import Image

THR = 8


def components(im):
    w, h = im.size
    a = im.split()[3].load()
    lab = [[-1]*w for _ in range(h)]
    comps = []
    for sy in range(h):
        for sx in range(w):
            if a[sx, sy] < THR or lab[sy][sx] >= 0:
                continue
            cid = len(comps)
            q = deque([(sx, sy)])
            lab[sy][sx] = cid
            px = []
            while q:
                x, y = q.popleft()
                px.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h and lab[ny][nx] < 0 and a[nx, ny] >= THR:
                            lab[ny][nx] = cid
                            q.append((nx, ny))
            comps.append(px)
    return comps


def foliage_stats(im):
    tot = n = 0.0
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, al = px[x, y]
            if al < THR:
                continue
            hh, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
            if 0.15 <= hh <= 0.47 and s > 0.07:
                tot += v
                n += 1
    return (tot/n if n else 0.0), int(n)


rows = []
for p in sorted(glob.glob(sys.argv[1])):
    im = Image.open(p).convert('RGBA')
    comps = components(im)
    comps.sort(key=len, reverse=True)
    total = sum(len(c) for c in comps)
    # the component that owns the bottom-most pixel is the rooted body
    bot = max((max(y for _, y in c), i) for i, c in enumerate(comps))[1]
    root_px = len(comps[bot])
    stray = total - root_px
    # canopy = opaque pixels in the top 45% of the sprite's bbox
    ys = [y for c in comps for _, y in c]
    top, bottom = min(ys), max(ys)
    cut = top + 0.45*(bottom-top)
    canopy = sum(1 for c in comps for _, y in c if y <= cut)
    canopy_in_root = sum(1 for _, y in comps[bot] if y <= cut)
    fv, fn = foliage_stats(im)
    rows.append({
        'file': os.path.basename(p), 'components': len(comps),
        'rootedPx': root_px, 'strayPx': stray,
        'strayPct': round(100*stray/total, 3),
        'largestStray': len(comps[1]) if len(comps) > 1 and comps[1] is not comps[bot] else 0,
        'canopyPx': canopy, 'canopyDetachedPx': canopy - canopy_in_root,
        'foliageMeanV': round(fv, 4), 'foliagePx': fn,
    })

print(f"{'file':<14}{'comps':>6}{'rootedPx':>9}{'strayPx':>8}{'stray%':>8}{'maxStray':>9}"
      f"{'canopyPx':>9}{'canopyDetached':>15}{'foliageV':>9}")
for r in rows:
    print(f"{r['file']:<14}{r['components']:>6}{r['rootedPx']:>9}{r['strayPx']:>8}{r['strayPct']:>8}"
          f"{r['largestStray']:>9}{r['canopyPx']:>9}{r['canopyDetachedPx']:>15}{r['foliageMeanV']:>9}")
print()
print('max stray %:', max(r['strayPct'] for r in rows))
print('max detached canopy px:', max(r['canopyDetachedPx'] for r in rows))
if len(sys.argv) > 2:
    json.dump(rows, open(sys.argv[2], 'w'), indent=1)
