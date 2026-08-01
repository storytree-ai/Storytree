"""Build the growth-age field for a mature pose.

age(p) = chamfer-3-4 geodesic distance from the ROOT COLLAR (a few pixels of ground contact
directly under the stem axis) to p, travelling only through the tree's own body.

Seeding at the collar rather than at the whole bottom edge makes the buttress roots grow
OUTWARD from the collar as well, instead of existing at age 0 as a detached spider.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from ablate import load_mask, dilate, geodesic, is_leaf, BIG


def build_field(path, collar_half=4, collar_rows=3):
    im, m = load_mask(path)
    rgb = np.array(im)[:, :, :3]
    leaf = is_leaf(rgb) & m
    wood = m & ~leaf
    h, w = m.shape
    ys = np.where(m.any(axis=1))[0]
    ymax = int(ys[-1])
    # collar x = alpha-weighted centre of the bottom occupied rows
    a = np.array(im)[:, :, 3].astype(float)
    band = np.zeros_like(m)
    band[max(0, ymax - collar_rows + 1):ymax + 1, :] = True
    band &= m
    xs = np.where(band.any(axis=0))[0]
    wts = a * band
    cx = int(round((wts.sum(axis=0) * np.arange(w)).sum() / wts.sum()))
    seed = np.zeros_like(m)
    seed[max(0, ymax - collar_rows + 1):ymax + 1, max(0, cx - collar_half):cx + collar_half + 1] = True
    seed &= m
    mb = dilate(m, 1)
    D = geodesic(mb, seed & mb)
    D = np.where(m, D, BIG)
    return im, m, wood, leaf, D, ymax, cx, int(xs.min()), int(xs.max())


if __name__ == "__main__":
    P = sys.argv[1]
    im, m, wood, leaf, D, ymax, cx, x0, x1 = build_field(P)
    f = D[D < BIG]
    print("mask", int(m.sum()), "reachable", f.size, "collar x", cx, "ymax", ymax, "base span", x0, x1)
    print("max px", round(float(f.max()) / 3, 1))
    for q in (5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100):
        print(q, round(float(np.percentile(f, q)) / 3, 1))
    lf = D[leaf]
    print("leaf age min/med/max", round(float(lf.min()) / 3, 1), round(float(np.median(lf)) / 3, 1), round(float(lf.max()) / 3, 1))
    np.save("work/field.npy", D)
    np.save("work/wood.npy", wood)
    np.save("work/leaf.npy", leaf)
    h, w = m.shape
    norm = np.clip(D / f.max(), 0, 1)
    vis = np.zeros((h, w, 3), np.uint8)
    vis[..., 0] = (255 * norm).astype(np.uint8)
    vis[..., 1] = (255 * (1 - norm)).astype(np.uint8)
    vis[..., 2] = (255 * (np.sin(norm * 12) * 0.5 + 0.5)).astype(np.uint8)
    vis[~m] = 0
    Image.fromarray(vis).resize((w * 3, h * 3), Image.NEAREST).save("work/field.png")
