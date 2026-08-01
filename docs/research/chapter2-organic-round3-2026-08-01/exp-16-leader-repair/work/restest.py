from PIL import Image, ImageDraw
import os
B = os.path.dirname(os.path.abspath(__file__))
R = os.path.dirname(B)
src = Image.open(os.path.join(R, 'src-frames', 'frame-06.png')).convert('RGBA')
isl = Image.open(os.path.join(B, 'island-plate.png')).convert('RGBA')

variants = []
variants.append(('orig-192', src))
d128 = src.resize((128,128), Image.LANCZOS)
variants.append(('down128', d128))
variants.append(('128->192-nearest', d128.resize((192,192), Image.NEAREST)))
variants.append(('128->192-lanczos', d128.resize((192,192), Image.LANCZOS)))
d96 = src.resize((96,96), Image.LANCZOS)
variants.append(('down96', d96))

# side-by-side at a common display scale of 3x on the 192 grid
cell = 192*3
pad = 6
W = len(variants)*(cell+pad)+pad
H = cell+pad*2+16
sheet = Image.new('RGBA', (W, H), (200,200,200,255))
d = ImageDraw.Draw(sheet)
for i,(name,im) in enumerate(variants):
    s = im.resize((cell, cell), Image.NEAREST)
    x = pad + i*(cell+pad)
    sheet.alpha_composite(s, (x, pad))
    d.rectangle([x, pad+cell, x+cell-1, pad+cell+15], fill=(15,15,15,255))
    d.text((x+4, pad+cell+2), f'{name} {im.size}', fill=(255,255,255,255))
sheet.convert('RGB').save(os.path.join(B, 'restest.png'))
print('ok', sheet.size)

# island pixel-density probe: count distinct colours and estimate facet size
import collections
c = collections.Counter(isl.convert('RGB').getdata())
print('island size', isl.size, 'distinct rgb', len(c))
print('island top colours', c.most_common(10))
c2 = collections.Counter(src.convert('RGBA').getdata())
opaque = [k for k in c2 if k[3] > 8]
print('tree frame-06 distinct rgba (a>8):', len(opaque))
