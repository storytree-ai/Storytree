"""Emit the nine pure-ablation rungs (no model involved) plus their measurements."""
import sys
import json
import numpy as np

sys.path.insert(0, "work")
from ablate import load_mask, apply_mask, bounds, dilate, erode
from sheath import stage
from clusters import components

MATURE = "raw/mature-b-d6aec8de-0941-4ec5-9789-af54e22aa0db-00.png"
PLAN = [(30, 0), (62, 3), (80, 6), (98, 14), (106, 18), (113, 23), (121, 29), (130, 36), (None, None)]


def largest(k):
    lab, n = components(k, 1)
    if n <= 1:
        return k
    sizes = sorted(((int((lab == j).sum()), j) for j in range(1, n + 1)), reverse=True)
    return lab == sizes[0][1]


def main(outdir="work/ablated"):
    import os
    os.makedirs(outdir, exist_ok=True)
    im, m = load_mask(MATURE)
    age = np.load("work/field.npy")
    wood = np.load("work/wood.npy")
    leaf = np.load("work/leaf.npy")
    rows = []
    keeps = []
    for i, (r, rho) in enumerate(PLAN):
        k = largest(stage(wood, leaf, age, r, rho))
        # close hairline slivers left where the front cut along a cluster rim (pure removal:
        # the filled pixels are the mature sprite's own, and the outer silhouette is unchanged)
        k = (erode(dilate(k, 1), 1) & m) | k
        keeps.append(k)
        p = f"{outdir}/ablated-{i:02d}.png"
        apply_mask(im, k).save(p)
        rows.append({"stage": i, "r": r, "rho": rho, "px": int(k.sum()), "bbox": bounds(k), "file": p})
    # strict-subset (monotonicity) check
    for i in range(len(keeps) - 1):
        rows[i]["lost_next"] = int((keeps[i] & ~keeps[i + 1]).sum())
    np.save("work/keeps.npy", np.array(keeps))
    print(json.dumps(rows, indent=1))


if __name__ == "__main__":
    main()
