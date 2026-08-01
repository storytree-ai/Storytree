from PIL import Image
import os, collections
B = os.path.dirname(os.path.abspath(__file__))
isl = Image.open(os.path.join(B, 'island-plate.png')).convert('RGB')
w, h = isl.size
px = isl.load()

def tan(c):
    r, g, b = c
    return (r - b) > 45 and r > 120 and r < 235

minx, miny, maxx, maxy = w, h, -1, -1
for y in range(h):
    for x in range(w):
        if tan(px[x, y]):
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('tan bbox', minx, miny, maxx-minx+1, maxy-miny+1)
pad = 3
crop = isl.crop((max(0, minx-pad), max(0, miny-pad), min(w, maxx+1+pad), min(h, maxy+1+pad)))
crop.save(os.path.join(B, 'island-body.png'))
print('crop', crop.size)

# palette quantise island body to its facet tones
c = collections.Counter()
cp = crop.load()
for y in range(crop.size[1]):
    for x in range(crop.size[0]):
        v = cp[x, y]
        if tan(v):
            c[(v[0]//8*8, v[1]//8*8, v[2]//8*8)] += 1
tot = sum(c.values())
print('tan px', tot)
for col, n in c.most_common(10):
    print(f'  {col}  {n:6d}  {100*n/tot:5.1f}%')
