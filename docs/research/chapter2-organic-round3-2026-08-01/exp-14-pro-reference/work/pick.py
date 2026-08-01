"""Choose the 9-frame ladder out of the whole Pro candidate pool by MEASUREMENT, not by eye.

Every candidate is scored on: foliage mass (must increase monotonically), silhouette height,
silhouette width, root-fan spread at the base, trunk width just above the flare, and the
trunk's horizontal offset from the root anchor. A DP over candidates sorted by foliage picks
the 9-chain with the least total adjacent change — i.e. the least frame-to-frame identity jump.
"""
import glob
import os

import numpy as np
from PIL import Image

TH = 8


def feats(p):
    a = np.array(Image.open(p).convert('RGBA')).astype(int)
    al = a[..., 3] > TH
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    leaf = int((al & (g >= r) & (g > b + 8)).sum())
    pale = int((al & (r > 190) & (g > 190) & (b > 185)).sum())
    ys, xs = np.nonzero(al)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    h, w = y1 - y0 + 1, x1 - x0 + 1
    rows = al[max(0, y1 - 2): y1 + 1, :]
    cols = np.arange(al.shape[1])
    ax = float((rows.sum(axis=0) * cols).sum() / max(1, rows.sum()))
    basew = 0
    seg = al[max(0, y1 - 5): y1 + 1, :].any(axis=0)
    if seg.any():
        bx = np.nonzero(seg)[0]
        basew = bx.max() - bx.min() + 1
    ty = max(0, y1 - int(0.30 * h))
    trow = al[ty, :]
    trunkw, trunkc = 0, ax
    if trow.any():
        tx = np.nonzero(trow)[0]
        trunkw = int(tx.max() - tx.min() + 1)
        trunkc = float(tx.mean())
    return dict(file=p, leaf=leaf, pale=pale, h=int(h), w=int(w), basew=int(basew),
                trunkw=trunkw, trunkoff=float(trunkc - ax))


import math

# A ladder must GROW at an even rate, not merely change little: the growth term prices any
# step whose foliage ratio departs from the even geometric pace across the whole ladder.
TARGET_RATIO = (5100.0 / 610.0) ** (1.0 / 8.0)


def cost(a, b):
    pace = abs(math.log(b['leaf'] / a['leaf']) - math.log(TARGET_RATIO)) * 220.0
    return (abs(a['h'] - b['h']) * 1.0 + abs(a['w'] - b['w']) * 0.6
            + abs(a['basew'] - b['basew']) * 0.8 + abs(a['trunkw'] - b['trunkw']) * 1.6
            + abs(a['trunkoff'] - b['trunkoff']) * 1.2 + pace)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pool = [feats(p) for p in sorted(glob.glob(os.path.join(root, 'raw', 'v3s*.png')))]
    pool = [c for c in pool if c['pale'] <= 3]
    pool.sort(key=lambda c: c['leaf'])
    n = len(pool)
    K = 9
    INF = float('inf')
    dp = [[INF] * n for _ in range(K + 1)]
    par = [[-1] * n for _ in range(K + 1)]
    for i, c in enumerate(pool):
        if c['leaf'] <= 950:
            dp[1][i] = 0.0
    for k in range(2, K + 1):
        for j in range(n):
            for i in range(j):
                if dp[k - 1][i] == INF:
                    continue
                if pool[j]['leaf'] <= pool[i]['leaf'] * 1.04:
                    continue  # must actually grow
                v = dp[k - 1][i] + cost(pool[i], pool[j])
                if v < dp[k][j]:
                    dp[k][j], par[k][j] = v, i
    best, bi = INF, -1
    for i, c in enumerate(pool):
        if c['leaf'] >= 4500 and dp[K][i] < best:
            best, bi = dp[K][i], i
    chain, k, i = [], K, bi
    while i >= 0:
        chain.append(pool[i])
        i = par[k][i]
        k -= 1
    chain.reverse()
    print(f'total adjacent-change cost {best:.1f}')
    print(f"{'frame':6}{'file':30}{'leaf':>6}{'h':>5}{'w':>5}{'basew':>7}{'trunkw':>8}{'trunkoff':>9}")
    for idx, c in enumerate(chain):
        print(f"{idx:<6}{os.path.basename(c['file']):30}{c['leaf']:6}{c['h']:5}{c['w']:5}"
              f"{c['basew']:7}{c['trunkw']:8}{c['trunkoff']:9.1f}")
    with open(os.path.join(root, 'work', 'ladder-dp.txt'), 'w', encoding='utf-8') as fh:
        for c in chain:
            fh.write('raw/' + os.path.basename(c['file']) + '\n')


if __name__ == '__main__':
    main()
