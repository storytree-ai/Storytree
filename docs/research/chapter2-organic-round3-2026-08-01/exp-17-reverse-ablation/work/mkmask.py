"""Build an ORGANIC crown-shaped inpaint mask for a rung of the ladder.

A rectangular mask makes the model draw a rectangular canopy (measured, exp-17 reject
1edc9efa). Shaping the mask as an envelope dilated off the retained branch TIPS gives the
generated foliage a lobed crown silhouette and keeps the frozen region (trunk, roots, forks)
byte-identical.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from ablate import dilate, load_mask


def tip_envelope(stage_png, radius, tip_band=14, floor_pad=6):
    im, k = load_mask(stage_png)
    ys = np.where(k.any(axis=1))[0]
    ytop = int(ys[0])
    ybot = int(ys[-1])
    # "tips" = the retained body in the upper tip_band rows of its own bbox
    tips = k.copy()
    tips[ytop + tip_band:, :] = False
    env = dilate(tips, radius)
    # never let the mask touch anything more than floor_pad rows below the tip band
    env[ytop + tip_band + floor_pad:, :] = False
    return im, k, env


def save_mask(env, path):
    h, w = env.shape
    a = np.zeros((h, w, 3), np.uint8)
    a[env] = 255
    Image.fromarray(a).save(path)
    return path


if __name__ == "__main__":
    src, radius, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    band = int(sys.argv[4]) if len(sys.argv) > 4 else 14
    im, k, env = tip_envelope(src, radius, band)
    save_mask(env, out)
    overlap = int((env & k).sum())
    print(f"mask px {int(env.sum())} overlap-with-body {overlap} rows {np.where(env.any(axis=1))[0].min()}-{np.where(env.any(axis=1))[0].max()}")
