"""Verify the three structural claims of reverse ablation, on the delivered frames.

1. SUB-IMAGE: every opaque pixel of every rung is byte-identical (RGB) to the mature pose at
   the same canvas coordinate -- except the pixels the model was allowed to ADD into empty space.
2. STRICT SUBSET: rung k's silhouette is contained in rung k+1's (nothing ever disappears).
3. ANCHOR: the alpha-weighted bottom anchor is the same pixel in every rung.
"""
import sys
import glob
import json
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from imglib import bottom_anchor

MATURE = "raw/mature-b-d6aec8de-0941-4ec5-9789-af54e22aa0db-00.png"
T = 8

mat = np.array(Image.open(MATURE).convert("RGBA"))
mm = mat[:, :, 3] >= T
frames = sorted(glob.glob("frames/frame-*.png"))
prev = None
rows = []
for i, f in enumerate(frames):
    a = np.array(Image.open(f).convert("RGBA"))
    k = a[:, :, 3] >= T
    inherited = k & mm
    added = k & ~mm
    diff = int((a[:, :, :3][inherited] != mat[:, :, :3][inherited]).any(axis=1).sum())
    lost = int((prev & ~k).sum()) if prev is not None else 0
    anc = bottom_anchor(f, T, 3)
    rows.append({
        "frame": i,
        "opaque": int(k.sum()),
        "inheritedFromMature": int(inherited.sum()),
        "inheritedPixelsThatDiffer": diff,
        "generatedPixels": int(added.sum()),
        "pixelsLostFromPreviousFrame": lost,
        "anchor": list(anc),
    })
    prev = k
print(json.dumps(rows, indent=1))
tot_gen = sum(r["generatedPixels"] for r in rows)
tot = sum(r["opaque"] for r in rows)
print(f"\nTOTAL opaque {tot}  inherited {tot - tot_gen} ({100*(tot-tot_gen)/tot:.1f}%)  generated {tot_gen} ({100*tot_gen/tot:.1f}%)")
print("inherited pixels that differ from the mature pose:", sum(r["inheritedPixelsThatDiffer"] for r in rows))
print("pixels ever lost between consecutive frames:", sum(r["pixelsLostFromPreviousFrame"] for r in rows))
ax = {tuple(r["anchor"]) for r in rows}
print("distinct anchors across the track:", ax)
