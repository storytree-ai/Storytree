"""Per-candidate mass measurement: alpha area, foliage px, wood px, pale artifact px, bbox."""
import glob
import os
import sys

import numpy as np
from PIL import Image


def stats(p):
    a = np.array(Image.open(p).convert('RGBA')).astype(int)
    al = a[..., 3] > 8
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = al & (g > r + 12) & (g > b + 12)
    wood = al & (r >= g) & (r > b + 15)
    pale = al & (r > 190) & (g > 190) & (b > 185)
    ys, xs = np.nonzero(al)
    return dict(
        file=os.path.basename(p), alpha=int(al.sum()), green=int(green.sum()),
        wood=int(wood.sum()), pale=int(pale.sum()),
        w=int(xs.max() - xs.min() + 1), h=int(ys.max() - ys.min() + 1),
    )


if __name__ == '__main__':
    rows = []
    for pat in sys.argv[1:]:
        for p in sorted(glob.glob(pat)):
            rows.append(stats(p))
    rows.sort(key=lambda r: r['green'])
    print(f"{'file':30}{'alpha':>7}{'green':>7}{'wood':>7}{'pale':>6}{'w':>5}{'h':>5}")
    for r in rows:
        print(f"{r['file']:30}{r['alpha']:7}{r['green']:7}{r['wood']:7}{r['pale']:6}{r['w']:5}{r['h']:5}")
