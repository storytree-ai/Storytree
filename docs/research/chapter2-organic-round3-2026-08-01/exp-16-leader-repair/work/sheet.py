import sys, os, glob, math
from PIL import Image, ImageDraw

def checker(w, h, cell=8, a=(210,210,210), b=(170,170,170)):
    im = Image.new('RGB', (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x//cell)+(y//cell)) % 2:
                d.rectangle([x, y, x+cell-1, y+cell-1], fill=b)
    return im

def build(paths, out, scale=2, cols=None, label=True, bg='checker'):
    ims = [Image.open(p).convert('RGBA') for p in paths]
    w, h = ims[0].size
    sw, sh = w*scale, h*scale
    n = len(ims)
    if cols is None:
        cols = min(n, int(math.ceil(math.sqrt(n))))
    rows = int(math.ceil(n/cols))
    pad = 4
    lab = 14 if label else 0
    W = cols*sw + (cols+1)*pad
    H = rows*(sh+lab) + (rows+1)*pad
    if bg == 'checker':
        sheet = checker(W, H, cell=scale*4).convert('RGBA')
    else:
        sheet = Image.new('RGBA', (W, H), (18, 20, 24, 255))
    d = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c*(sw+pad)
        y = pad + r*(sh+lab+pad)
        up = im.resize((sw, sh), Image.NEAREST)
        sheet.alpha_composite(up, (x, y))
        if label:
            d.rectangle([x, y+sh, x+sw-1, y+sh+lab-1], fill=(20,20,20,255))
            d.text((x+3, y+sh+2), os.path.basename(paths[i])[:28], fill=(240,240,240,255))
    sheet.convert('RGB').save(out)
    print(out, sheet.size, n, 'frames')

if __name__ == '__main__':
    pat = sys.argv[1]
    out = sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else None
    bg = sys.argv[5] if len(sys.argv) > 5 else 'checker'
    build(sorted(glob.glob(pat)), out, scale, cols, True, bg)
