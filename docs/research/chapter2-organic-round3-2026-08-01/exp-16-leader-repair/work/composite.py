import sys, os, glob
from PIL import Image, ImageDraw
B = os.path.dirname(os.path.abspath(__file__))
R = os.path.dirname(B)

def comp(tree_paths, out, scale=3, anchor=(96,188), plant=(78,116), tree_scale=0.62):
    isl = Image.open(os.path.join(B, 'island-plate.png')).convert('RGBA')
    iw, ih = isl.size
    cells = []
    for p in tree_paths:
        t = Image.open(p).convert('RGBA')
        tw, th = t.size
        nt = t.resize((int(tw*tree_scale), int(th*tree_scale)), Image.LANCZOS)
        ax = int(anchor[0]*tree_scale); ay = int(anchor[1]*tree_scale)
        base = isl.copy()
        base.alpha_composite(nt, (plant[0]-ax, plant[1]-ay))
        cells.append((os.path.basename(p), base))
    pad = 6; lab = 14
    cw, ch = iw*scale, ih*scale
    W = len(cells)*(cw+pad)+pad
    H = ch+lab+pad*2
    sheet = Image.new('RGBA', (W, H), (240,240,240,255))
    d = ImageDraw.Draw(sheet)
    for i,(name, im) in enumerate(cells):
        x = pad+i*(cw+pad)
        sheet.alpha_composite(im.resize((cw,ch), Image.NEAREST), (x, pad))
        d.rectangle([x, pad+ch, x+cw-1, pad+ch+lab-1], fill=(15,15,15,255))
        d.text((x+4, pad+ch+2), name, fill=(255,255,255,255))
    sheet.convert('RGB').save(out)
    print(out, sheet.size)

if __name__ == '__main__':
    pat = sys.argv[1]; out = sys.argv[2]
    sc = float(sys.argv[3]) if len(sys.argv) > 3 else 0.62
    comp(sorted(glob.glob(pat)), out, tree_scale=sc)
