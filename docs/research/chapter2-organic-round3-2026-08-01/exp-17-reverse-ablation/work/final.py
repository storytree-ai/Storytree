"""Final assembly: the model is used as a SILHOUETTE ORACLE, never as a source of pixels.

Measured problem with using the model's own pixels (rejects below): a generated young crown is
smoother than the ablated one and its outline pokes outside the mature tree, so ~12% of rung 2
vanished at rung 3 and the foliage tone drifted.

Fix, at zero extra cost: keep only the model's SHAPE decision -- where a young crown should sit --
intersect it with the mature silhouette, and paint every pixel from the mature pose. The whole
track then contains nothing but the mature tree's own pixels, at their own coordinates, and each
rung is a strict subset of the next.
"""
import sys
import os
import json
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from ablate import dilate, erode

T = 8
MATURE = "raw/mature-b-d6aec8de-0941-4ec5-9789-af54e22aa0db-00.png"
ORACLES = {  # rung -> (model return, mask used)
    0: ("raw/ip-a32d216b-29e4-42b1-8aa4-44f7d989cc5b-00.png", "work/dome-00c.png"),
    1: ("raw/ip-eb6f19f2-e431-4cb4-b469-8c99158ea76b-00.png", "work/dome-01.png"),
    2: ("raw/ip-187166b5-7742-4883-b0c6-86dddc4db5be-00.png", "work/dome-02.png"),
}


def main(outdir="frames"):
    os.makedirs(outdir, exist_ok=True)
    mat = np.array(Image.open(MATURE).convert("RGBA"))
    mm = mat[:, :, 3] >= T
    keeps = []
    prev = None
    stats = []
    for i in range(9):
        k = np.array(Image.open(f"work/ablated/ablated-{i:02d}.png").convert("RGBA"))[:, :, 3] >= T
        oracle = 0
        if i in ORACLES:
            mp, dm = ORACLES[i]
            new = np.array(Image.open(mp).convert("RGBA"))
            dome = np.array(Image.open(dm).convert("L")) >= 128
            add = dome & (new[:, :, 3] >= T) & mm & ~k
            oracle = int(add.sum())
            k = k | add
        k = ((erode(dilate(k, 1), 1) & mm) | k)
        if prev is not None:
            k = k | prev  # monotone by construction
        keeps.append(k)
        prev = k
        out = mat.copy()
        out[:, :, 3] = np.where(k, 255, 0)
        out[:, :, :3][~k] = 0
        Image.fromarray(out, "RGBA").save(f"{outdir}/frame-{i:02d}.png", optimize=True)
        stats.append({"frame": i, "opaque": int(k.sum()), "oracleAddedPx": oracle})
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
