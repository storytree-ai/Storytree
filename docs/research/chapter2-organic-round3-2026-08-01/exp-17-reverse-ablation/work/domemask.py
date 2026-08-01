"""Dome-shaped inpaint mask: an ellipse sized to the crown a tree of this stage should carry,
unioned with a thin collar around the retained branch tips so the sawn ends fall inside the
regenerated region and can be rounded off.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from ablate import dilate, load_mask


def dome(stage_png, rx, ry, dy=0, tip_band=16, tip_pad=3, squash_bottom=0.55):
    im, k = load_mask(stage_png)
    ys = np.where(k.any(axis=1))[0]
    xs = np.where(k.any(axis=0))[0]
    ytop = int(ys[0])
    tips = k.copy()
    tips[ytop + tip_band:, :] = False
    tx = np.where(tips.any(axis=0))[0]
    cx = int(round((tx.min() + tx.max()) / 2))
    cy = ytop + dy
    h, w = k.shape
    yy, xx = np.mgrid[0:h, 0:w]
    ry_eff = np.where(yy <= cy, ry, ry * squash_bottom)
    ell = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry_eff) ** 2 <= 1.0
    env = ell | (dilate(tips, tip_pad))
    return im, k, env, (cx, cy)


def save_mask(env, path):
    h, w = env.shape
    a = np.zeros((h, w, 3), np.uint8)
    a[env] = 255
    Image.fromarray(a).save(path)
    return path


if __name__ == "__main__":
    src, rx, ry, dy, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
    im, k, env, c = dome(src, rx, ry, dy)
    save_mask(env, out)
    ys = np.where(env.any(axis=1))[0]
    xs = np.where(env.any(axis=0))[0]
    print(f"mask px {int(env.sum())} centre {c} rows {ys.min()}-{ys.max()} cols {xs.min()}-{xs.max()} overlap {int((env & k).sum())}")
