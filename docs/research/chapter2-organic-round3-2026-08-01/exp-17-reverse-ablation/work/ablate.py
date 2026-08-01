"""Reverse ablation core: geodesic-from-root distance through the tree's own silhouette.

The newest growth of a tree is, by definition, the tissue FURTHEST from the root
*measured along the plant's own connected body* -- not furthest from the centroid.
So a younger stage is exactly the sub-silhouette within some geodesic radius of the
root contact. Removing the far end is apical growth run backwards.
"""
import numpy as np
from PIL import Image

ALPHA_T = 8
# chamfer 3-4 weights -> divide by 3 for approximate euclidean pixels
ORTH, DIAG = 3, 4
BIG = 1 << 28


def load_mask(path, thresh=ALPHA_T):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :, 3]
    return im, (a >= thresh)


def dilate(m, r=1):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1, constant_values=False)
        acc = np.zeros_like(out)
        for dy in (0, 1, 2):
            for dx in (0, 1, 2):
                acc |= p[dy:dy + out.shape[0], dx:dx + out.shape[1]]
        out = acc
    return out


def erode(m, r=1):
    if r <= 0:
        return m.copy()
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1, constant_values=False)
        acc = np.ones_like(out)
        for dy in (0, 1, 2):
            for dx in (0, 1, 2):
                acc &= p[dy:dy + out.shape[0], dx:dx + out.shape[1]]
        out = acc
    return out


def geodesic(mask, seed, iters=64):
    """Chamfer 3-4 geodesic distance inside `mask`, seeded at `seed` (both bool arrays)."""
    h, w = mask.shape
    d = np.full((h, w), BIG, dtype=np.int32)
    d[seed & mask] = 0
    d[~mask] = BIG
    for _ in range(iters):
        prev = d.copy()
        # forward raster
        for y in range(h):
            row = d[y]
            for x in range(w):
                if not mask[y, x]:
                    continue
                best = row[x]
                if x > 0:
                    best = min(best, row[x - 1] + ORTH)
                if y > 0:
                    up = d[y - 1]
                    best = min(best, up[x] + ORTH)
                    if x > 0:
                        best = min(best, up[x - 1] + DIAG)
                    if x + 1 < w:
                        best = min(best, up[x + 1] + DIAG)
                row[x] = best
        # backward raster
        for y in range(h - 1, -1, -1):
            row = d[y]
            for x in range(w - 1, -1, -1):
                if not mask[y, x]:
                    continue
                best = row[x]
                if x + 1 < w:
                    best = min(best, row[x + 1] + ORTH)
                if y + 1 < h:
                    dn = d[y + 1]
                    best = min(best, dn[x] + ORTH)
                    if x > 0:
                        best = min(best, dn[x - 1] + DIAG)
                    if x + 1 < w:
                        best = min(best, dn[x + 1] + DIAG)
                row[x] = best
        if np.array_equal(prev, d):
            break
    return d


def root_seed(mask, rows=4):
    ys = np.where(mask.any(axis=1))[0]
    ymax = int(ys[-1])
    seed = np.zeros_like(mask)
    seed[max(0, ymax - rows + 1):ymax + 1, :] = True
    return seed & mask, ymax


def is_leaf(rgb):
    """Green-dominant pixels are foliage; everything else is wood/bark."""
    r = rgb[:, :, 0].astype(int)
    g = rgb[:, :, 1].astype(int)
    b = rgb[:, :, 2].astype(int)
    return (g > r + 8) & (g > b + 8)


def apply_mask(im, keep):
    a = np.array(im).copy()
    a[:, :, 3] = np.where(keep, a[:, :, 3], 0)
    return Image.fromarray(a, "RGBA")


def bounds(keep):
    ys, xs = np.where(keep)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
