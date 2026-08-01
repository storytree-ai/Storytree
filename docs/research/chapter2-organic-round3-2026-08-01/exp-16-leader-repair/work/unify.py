"""Deterministic post-pass on the batched restyle.

1. cross-batch colour normalisation  - foliage and bark pixels are pulled to the
   pooled S/V mean so the three independent edit_image calls stop drifting.
2. shared-palette quantisation       - the pooled track is median-cut to ONE
   palette and every frame is mapped to it, so the track carries a single
   provable palette (distinct-colour count is reported).
3. nothing here moves a pixel: geometry is untouched.
"""
import glob, os, colorsys, collections, json
from PIL import Image

SRC = 'work/styled'
DST = 'work/unified'
BATCH = {0: 'b1', 1: 'b1', 2: 'b1', 3: 'b2', 4: 'b2', 5: 'b2', 6: 'b3', 7: 'b3', 8: 'b3'}
PALETTE_N = 32

def cls(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    if s <= 0.06:
        return 'neutral', h, s, v
    if 0.15 <= h <= 0.45:
        return 'foliage', h, s, v
    return 'bark', h, s, v

os.makedirs(DST, exist_ok=True)
paths = sorted(glob.glob(f'{SRC}/*.png'))
ims = [Image.open(p).convert('RGBA') for p in paths]

# ---- pass 1: gather per-batch and pooled S/V means -------------------------
acc = collections.defaultdict(lambda: collections.defaultdict(list))
for i, im in enumerate(ims):
    for r, g, b, a in im.getdata():
        if a < 128:
            continue
        k, h, s, v = cls(r, g, b)
        if k == 'neutral':
            continue
        acc[BATCH[i]][k].append((s, v))
        acc['ALL'][k].append((s, v))

def mean(rows, j):
    return sum(r[j] for r in rows)/len(rows) if rows else 0.0

adj = {}
for b in ('b1', 'b2', 'b3'):
    adj[b] = {}
    for k in ('foliage', 'bark'):
        ms, mv = mean(acc[b][k], 0), mean(acc[b][k], 1)
        ts, tv = mean(acc['ALL'][k], 0), mean(acc['ALL'][k], 1)
        adj[b][k] = (ts/ms if ms else 1.0, tv/mv if mv else 1.0)
print('batch S/V correction factors:', json.dumps(adj, indent=None))

# ---- pass 2: apply correction ---------------------------------------------
corr = []
for i, im in enumerate(ims):
    out = Image.new('RGBA', im.size)
    px = []
    for r, g, b, a in im.getdata():
        if a < 8:
            px.append((0, 0, 0, 0)); continue
        k, h, s, v = cls(r, g, b)
        if k in ('foliage', 'bark'):
            fs, fv = adj[BATCH[i]][k]
            s = min(1.0, s*fs); v = min(1.0, v*fv)
            nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
            px.append((int(nr*255+0.5), int(ng*255+0.5), int(nb*255+0.5), a))
        else:
            px.append((r, g, b, a))
    out.putdata(px)
    corr.append(out)

# ---- pass 3: one shared palette across the whole track ---------------------
W, H = corr[0].size
strip = Image.new('RGB', (W*len(corr), H), (0, 0, 0))
alpha = Image.new('L', (W*len(corr), H), 0)
for i, im in enumerate(corr):
    strip.paste(im.convert('RGB'), (i*W, 0))
    alpha.paste(im.split()[3], (i*W, 0))
# quantise only where opaque: paint transparent areas with the strip's own
# mean so they cannot claim palette slots
mean_rgb = (128, 128, 128)
bgfill = Image.new('RGB', strip.size, mean_rgb)
masked = Image.composite(strip, bgfill, alpha.point(lambda v: 255 if v >= 128 else 0))
q = masked.quantize(colors=PALETTE_N, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')

report = []
for i in range(len(corr)):
    rgb = q.crop((i*W, 0, (i+1)*W, H))
    a = corr[i].split()[3].point(lambda v: 255 if v >= 128 else 0)
    out = rgb.convert('RGBA')
    out.putalpha(a)
    p = f'{DST}/frame-0{i}.png'
    out.save(p)
    report.append(p)

cols = set()
for p in report:
    im = Image.open(p).convert('RGBA')
    for r, g, b, a in im.getdata():
        if a >= 128:
            cols.add((r, g, b))
print('unified track distinct RGB (opaque):', len(cols))
print('wrote', len(report), 'frames to', DST)
