"""Mean foliage / bark colour per candidate, so a ladder can be assembled without a style pop."""
import glob
import os
import sys

import numpy as np
from PIL import Image

rows = []
for pat in sys.argv[1:]:
    for p in sorted(glob.glob(pat)):
        a = np.array(Image.open(p).convert('RGBA')).astype(int)
        al = a[..., 3] > 8
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        leaf = al & (g >= r) & (g > b + 8)
        bark = al & (r > g + 10) & (r > b + 25)
        lm = a[leaf][:, :3].mean(axis=0) if leaf.sum() > 40 else np.array([0, 0, 0])
        bm = a[bark][:, :3].mean(axis=0) if bark.sum() > 40 else np.array([0, 0, 0])
        rows.append((os.path.basename(p), int(leaf.sum()), tuple(lm.round().astype(int)),
                     int(bark.sum()), tuple(bm.round().astype(int))))
print(f"{'file':30}{'leafpx':>7}  leafRGB          {'barkpx':>7}  barkRGB")
for f, lp, lc, bp, bc in rows:
    print(f'{f:30}{lp:7}  {str(lc):17}{bp:7}  {bc}')
