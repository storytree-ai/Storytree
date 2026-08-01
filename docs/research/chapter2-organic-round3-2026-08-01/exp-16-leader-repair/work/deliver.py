"""Build contact-sheet.png, preview.gif and the on-island composite strip."""
import glob, os, json
from PIL import Image, ImageDraw

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(R, 'work')
frames = sorted(glob.glob(os.path.join(R, 'frames', 'frame-*.png')))
ims = [Image.open(p).convert('RGBA') for p in frames]
W, H = ims[0].size
N = len(ims)

# ---------- contact sheet: checkerboard grid, 5 columns, 3x --------------
S = 3
cols, rows = 5, (N + 4) // 5
cell = 6
pad, lab = 5, 13
cw, ch = W*S, H*S
SW, SH = cols*(cw+pad)+pad, rows*(ch+lab+pad)+pad
sheet = Image.new('RGB', (SW, SH), (200, 200, 200))
d = ImageDraw.Draw(sheet)
for y in range(0, SH, cell):
    for x in range(0, SW, cell):
        if ((x//cell)+(y//cell)) % 2:
            d.rectangle([x, y, x+cell-1, y+cell-1], fill=(170, 170, 170))
sheet = sheet.convert('RGBA')
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    r, c = divmod(i, cols)
    x, y = pad + c*(cw+pad), pad + r*(ch+lab+pad)
    sheet.alpha_composite(im.resize((cw, ch), Image.NEAREST), (x, y))
    d.rectangle([x, y+ch, x+cw-1, y+ch+lab-1], fill=(20, 20, 20, 255))
    d.text((x+3, y+ch+2), os.path.basename(frames[i]), fill=(238, 238, 238, 255))
sheet.convert('RGB').save(os.path.join(R, 'contact-sheet.png'))
print('contact-sheet.png', sheet.size)

# ---------- preview.gif: dark field, 3x nearest, hold on the final frame ----
GS = 3
bg = (22, 24, 28)
gif = []
durs = []
for i, im in enumerate(ims):
    f = Image.new('RGB', (W*GS, H*GS), bg)
    f.paste(im.resize((W*GS, H*GS), Image.NEAREST), (0, 0), im.resize((W*GS, H*GS), Image.NEAREST))
    gif.append(f)
    durs.append(160)
durs[-1] = 1400          # settle on the mature tree
durs[0] = 500            # beat on the seedling
gif[0].save(os.path.join(R, 'preview.gif'), save_all=True, append_images=gif[1:],
            duration=durs, loop=0, optimize=True, disposal=2)
print('preview.gif', os.path.getsize(os.path.join(R, 'preview.gif')), 'bytes', len(gif), 'frames')

# ---------- on-island composite strip + gif -------------------------------
isl = Image.open(os.path.join(B, 'island-plate.png')).convert('RGBA')
iw, ih = isl.size
ts = 0.92
plant = (78, 118)
comp = []
for im in ims:
    n = im.resize((int(W*ts), int(H*ts)), Image.NEAREST)
    base = isl.copy()
    base.alpha_composite(n, (plant[0]-int(64*ts), plant[1]-int(122*ts)))
    comp.append(base.convert('RGB'))
cd = [160]*len(comp)
cd[-1] = 1400
cd[0] = 500
comp[0].resize((iw*2, ih*2), Image.NEAREST).save(
    os.path.join(R, 'preview-on-island.gif'), save_all=True,
    append_images=[c.resize((iw*2, ih*2), Image.NEAREST) for c in comp[1:]],
    duration=cd, loop=0, optimize=True, disposal=2)
print('preview-on-island.gif', os.path.getsize(os.path.join(R, 'preview-on-island.gif')), 'bytes')

pick = [0, 3, 5, 8, 11, 14, 16, 18]
SC = 3
strip = Image.new('RGB', (len(pick)*(iw*SC+4)+4, ih*SC+4+lab), (238, 238, 238))
d = ImageDraw.Draw(strip)
for i, k in enumerate(pick):
    x = 4 + i*(iw*SC+4)
    strip.paste(comp[k].resize((iw*SC, ih*SC), Image.NEAREST), (x, 4))
    d.rectangle([x, 4+ih*SC, x+iw*SC-1, 4+ih*SC+lab-1], fill=(15, 15, 15))
    d.text((x+3, 6+ih*SC), f'frame-{k:02d}', fill=(255, 255, 255))
strip.save(os.path.join(R, 'on-island-strip.png'))
print('on-island-strip.png', strip.size)
