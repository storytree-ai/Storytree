"""Build the ablation ladder: stage_k = erode(mature, e_k) INTERSECT geodesic-ball(r_k), plus a
foot that drops the stem back to the original ground row so the root anchor cannot move.

Every stage is a strict pixel-subset of the mature pose in the SAME canvas coordinates, so
registration drift is structurally zero -- there is nothing to register.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit("\\", 1)[0] if "\\" in __file__ else ".")
from ablate import load_mask, dilate, erode, apply_mask, bounds, BIG
from clusters import components


def foot(keep, m, ymax):
    """Re-attach the retained body to the original ground row through the original silhouette."""
    out = keep.copy()
    h, w = m.shape
    ys = np.where(out.any(axis=1))[0]
    if len(ys) == 0:
        return out
    y0 = int(ys[-1])
    if y0 >= ymax:
        return out
    cols = np.where(out[y0])[0]
    for x in cols:
        for y in range(y0, ymax + 1):
            if m[y, x]:
                out[y, x] = True
            else:
                break
    # thicken the foot sideways only where the original mask allows, so the stem
    # meets the ground with the same width it has just above.
    return out


def largest_component(keep):
    lab, n = components(keep, min_size=1)
    if n <= 1:
        return keep
    sizes = [(int((lab == i).sum()), i) for i in range(1, n + 1)]
    sizes.sort(reverse=True)
    return lab == sizes[0][1]


def build(mature_path, radii, erosions, out_prefix, keep_islands=False):
    im, m = load_mask(mature_path)
    D = np.load("work/dist2.npy")
    ys = np.where(m.any(axis=1))[0]
    ymax = int(ys[-1])
    stages = []
    prev = None
    for k, (r, e) in enumerate(zip(radii, erosions)):
        ball = m if r is None else (m & (D <= r * 3))
        keep = erode(ball, e) if e else ball.copy()
        keep = foot(keep, m, ymax)
        if not keep_islands:
            keep = largest_component(keep)
        if prev is not None:
            keep = keep | prev if False else keep  # monotonicity is checked, not forced
        stages.append(keep)
        prev = keep
    return im, m, stages, ymax
