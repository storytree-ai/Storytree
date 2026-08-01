import sys, os, glob
from PIL import Image, ImageDraw
B = os.path.dirname(os.path.abspath(__file__))
def comp(paths, out, scale=3, plant=(78,118), ts=0.92):
    isl = Image.open(os.path.join(B,'island-plate.png')).convert('RGBA')
    iw, ih = isl.size
    cells=[]
    for p in paths:
        t = Image.open(p).convert('RGBA')
        n = t.resize((int(t.size[0]*ts), int(t.size[1]*ts)), Image.NEAREST) if ts!=1 else t
        ax, ay = int(64*ts), int(122*ts)
        base = isl.copy(); base.alpha_composite(n, (plant[0]-ax, plant[1]-ay))
        cells.append((os.path.basename(p), base))
    pad=6; lab=14; cw,ch = iw*scale, ih*scale
    sheet = Image.new('RGBA',(len(cells)*(cw+pad)+pad, ch+lab+pad*2),(240,240,240,255))
    d=ImageDraw.Draw(sheet)
    for i,(name,im) in enumerate(cells):
        x=pad+i*(cw+pad); sheet.alpha_composite(im.resize((cw,ch),Image.NEAREST),(x,pad))
        d.rectangle([x,pad+ch,x+cw-1,pad+ch+lab-1],fill=(15,15,15,255))
        d.text((x+4,pad+ch+2),name,fill=(255,255,255,255))
    sheet.convert('RGB').save(out); print(out, sheet.size)
if __name__=='__main__':
    comp(sorted(glob.glob(sys.argv[1])), sys.argv[2], ts=float(sys.argv[3]) if len(sys.argv)>3 else 0.92)
