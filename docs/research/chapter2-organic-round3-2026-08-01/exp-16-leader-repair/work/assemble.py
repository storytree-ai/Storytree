"""Splice the repaired track: authored poses + accepted model in-betweens."""
import os, shutil, json
from collections import deque
from PIL import Image

THR = 8


def prune_strays(im, keep_frac=0.35):
    """Delete every 8-connected opaque component that is NOT the one holding the
    bottom-most pixel (the rooted body), unless it is a large fraction of the
    sprite (which would mean the anchor pick was wrong, not that it is debris).

    This is what makes 'the tree is one body' a property of the pipeline rather
    than of luck: a floating leaf or a detached canopy blob cannot survive it.
    Returns (image, pruned_pixel_count)."""
    w, h = im.size
    a = im.split()[3].load()
    lab = [[-1]*w for _ in range(h)]
    comps = []
    for sy in range(h):
        for sx in range(w):
            if a[sx, sy] < THR or lab[sy][sx] >= 0:
                continue
            cid = len(comps); q = deque([(sx, sy)]); lab[sy][sx] = cid; px = []
            while q:
                x, y = q.popleft(); px.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < w and 0 <= ny < h and lab[ny][nx] < 0 and a[nx, ny] >= THR:
                            lab[ny][nx] = cid; q.append((nx, ny))
            comps.append(px)
    if len(comps) <= 1:
        return im, 0
    total = sum(len(c) for c in comps)
    root = max(range(len(comps)), key=lambda i: max(y for _, y in comps[i]))
    out = im.copy(); op = out.load(); pruned = 0
    for i, c in enumerate(comps):
        if i == root or len(c)/total >= keep_frac:
            continue
        for x, y in c:
            op[x, y] = (0, 0, 0, 0)
        pruned += len(c)
    return out, pruned

# (source file, provenance label)
TRACK = [
    ('raw/d0s-00.png',           'sprout e2 (edit_image seedling, anchored)  <- grows from nothing'),
    ('raw/d0s-01.png',           'tween d0s-01  (sprout->f00 interp)'),
    ('raw/d0s-02.png',           'tween d0s-02  (sprout->f00 interp)'),
    ('raw/d0s-03.png',           'tween d0s-03  (sprout->f00 interp)'),
    ('work/tuned/frame-00.png',  'pose f00  (round-1 pose 0, restyled)'),
    ('work/tuned/frame-01.png',  'pose f01  (round-1 pose 1, restyled)'),
    ('raw/d12b-02.png',          'tween d12b-02 (f01->f02 interp)'),
    ('work/tuned/frame-02.png',  'pose f02  (round-1 pose 2, restyled)'),
    ('work/tuned/frame-03.png',  'pose f03  (round-1 pose 3, restyled)'),
    ('raw/d35-01.png',           'tween d35-01  (f03->f05 interp)'),
    ('raw/d35-02.png',           'tween d35-02  (f03->f05 interp)'),
    ('work/tuned/frame-05.png',  'pose f05  (round-1 pose 5, restyled)'),
    ('raw/d56b-01.png',          'tween d56b-01 (f05->f06 interp)  <- the repaired cut'),
    ('raw/d56b-02.png',          'tween d56b-02 (f05->f06 interp)  <- the repaired cut'),
    ('raw/d56b-03.png',          'tween d56b-03 (f05->f06 interp)  <- the repaired cut'),
    ('work/tuned/frame-06.png',  'pose f06  (round-1 pose 6, restyled + de-grounded)'),
    ('raw/d68-01.png',           'tween d68-01  (f06->f08 interp)'),
    ('work/tuned/frame-07.png',  'pose f07  (round-1 pose 7, restyled + de-grounded)'),
    ('work/tuned/frame-08.png',  'pose f08  (round-1 pose 8, restyled + de-grounded)'),
]

DST = 'work/spliced'
os.makedirs(DST, exist_ok=True)
prov = []
for i, (src, label) in enumerate(TRACK):
    im = Image.open(src).convert('RGBA')
    a = im.split()[3].point(lambda v: 0 if v < 96 else 255)   # hard alpha, no halo
    im.putalpha(a)
    im, pruned = prune_strays(im)
    if pruned:
        print(f'  frame-{i:02d}: pruned {pruned} stray px (detached fragment)')
    f = f'{DST}/frame-{i:02d}.png'
    im.save(f)
    prov.append({'index': i, 'file': os.path.basename(f), 'source': src,
                 'provenance': label, 'prunedStrayPx': pruned})
json.dump(prov, open(f'{DST}/_provenance.json', 'w'), indent=1)
print('spliced', len(TRACK), 'frames ->', DST)
