from PIL import Image
import os, collections
B = os.path.dirname(os.path.abspath(__file__))
isl = Image.open(os.path.join(B, 'island-plate.png')).convert('RGB')
w, h = isl.size
px = isl.load()
# background is the pale pink hex field ~ (242,227,220); island body is tan/khaki
def isbg(c):
    r, g, b = c
    return abs(r-242) < 14 and abs(g-227) < 16 and abs(b-220) < 16
minx, miny, maxx, maxy = w, h, -1, -1
for y in range(h):
    for x in range(w):
        if not isbg(px[x, y]):
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('island body bbox', minx, miny, maxx-minx+1, maxy-miny+1)
crop = isl.crop((minx, miny, maxx+1, maxy+1))
crop.save(os.path.join(B, 'island-body.png'))
# dominant island-body colours (exclude bg)
c = collections.Counter()
cp = crop.load()
for y in range(crop.size[1]):
    for x in range(crop.size[0]):
        v = cp[x, y]
        if not isbg(v):
            c[v] += 1
tot = sum(c.values())
print('island body px', tot)
for col, n in c.most_common(14):
    print(f'  {col}  {n:6d}  {100*n/tot:5.1f}%')
