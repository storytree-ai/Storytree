"""Final pass: one shared palette for the whole spliced track, then anchor
normalisation onto the delivered 128x128 canvas.

Colour and geometry are kept in separate steps so each can be measured:
  * quantise  -> changes colour only, every pixel keeps its position
  * anchor    -> changes position only (integer translation), no resampling
"""
import os, glob, json, shutil
from PIL import Image
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anchor import normalise, anchor, bbox  # noqa: E402

SRC = 'work/spliced'
QDIR = 'work/quantised'
OUT = 'frames'
PALETTE_N = 32
TX, TY = 64, 122

paths = sorted(glob.glob(f'{SRC}/frame-*.png'))
ims = [Image.open(p).convert('RGBA') for p in paths]
W, H = ims[0].size

before = set()
for im in ims:
    for r, g, b, a in im.getdata():
        if a >= 128:
            before.add((r, g, b))
print('spliced track distinct RGB before quantise:', len(before))

# ---- one shared palette across the whole track ----------------------------
strip = Image.new('RGB', (W*len(ims), H), (128, 128, 128))
for i, im in enumerate(ims):
    m = im.split()[3].point(lambda v: 255 if v >= 128 else 0)
    strip.paste(Image.composite(im.convert('RGB'), Image.new('RGB', (W, H), (128, 128, 128)), m), (i*W, 0))
q = strip.quantize(colors=PALETTE_N, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')

os.makedirs(QDIR, exist_ok=True)
after = set()
for i, im in enumerate(ims):
    rgb = q.crop((i*W, 0, (i+1)*W, H))
    o = rgb.convert('RGBA')
    o.putalpha(im.split()[3].point(lambda v: 255 if v >= 128 else 0))
    o.save(f'{QDIR}/frame-{i:02d}.png')
    for r, g, b, a in o.getdata():
        if a >= 128:
            after.add((r, g, b))
print('after quantise:', len(after))

# ---- anchor normalisation --------------------------------------------------
if os.path.isdir(OUT):
    shutil.rmtree(OUT)
rows = normalise(f'{QDIR}/frame-*.png', OUT, TX, TY, (128, 128))
prov = json.load(open(f'{SRC}/_provenance.json'))
for r, p in zip(rows, prov):
    r['provenance'] = p['provenance']
    r['rawSource'] = p['source']
json.dump({'canvas': {'width': 128, 'height': 128, 'format': 'PNG', 'decoded': 'RGBA8'},
           'frameCount': len(rows), 'targetAnchor': {'x': TX, 'y': TY},
           'anchorRule': 'alpha-weighted x over the 10-row band 32..22 px above the bottom-most '
                         'opaque row (the trunk axis above the root flare); groundY = bottom-most '
                         'opaque row',
           'alphaThreshold': 8, 'palette': {'sharedColours': len(after), 'method': 'MEDIANCUT/32'},
           'frames': rows,
           'encodedFrameBytes': sum(r['bytes'] for r in rows),
           'decodedRgbaBytes': 128*128*4*len(rows)},
          open(f'{OUT}/registration.json', 'w'), indent=1)
if os.path.exists(f'{OUT}/_anchors.json'):
    os.remove(f'{OUT}/_anchors.json')

print()
print(f"{'file':<13}{'srcAnchor':>15}{'offset':>10}{'normAnchor':>14}{'dX':>7}{'dY':>5}{'bbox':>21}{'alphaPx':>9}{'bytes':>7}")
prev = None
for r in rows:
    d = '' if prev is None else f"  {100*(r['alphaPx']-prev)/prev:+.1f}%"
    print(f"{r['file']:<13}{str(r['sourceAnchor']):>15}{str(r['offset']):>10}{str(r['normalizedAnchor']):>14}"
          f"{r['driftX']:>7}{r['driftY']:>5}{str(r['bbox']):>21}{r['alphaPx']:>9}{r['bytes']:>7}{d}")
    prev = r['alphaPx']
xs = [r['normalizedAnchor'][0] for r in rows]
print(f"\nroot-anchor drift after normalisation: max |dx| = {max(abs(x-TX) for x in xs):.2f} px, "
      f"max |dy| = {max(abs(r['normalizedAnchor'][1]-TY) for r in rows)} px")
print('total encoded bytes:', sum(r['bytes'] for r in rows))
