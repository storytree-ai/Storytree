"""Splice the three v3 interpolations into one evenly-paced 16-frame track and normalize
it onto the round-1 tree canvas (192x192, root anchor 96,188).

Source order (44 frames):
  animA[00..11]     sapling -> young tree        v3 interpolation #1
  bridge[01..16]    young tree -> filled crown   v3 #2, run across the MEASURED snap at
                                                 animA 11->12 (L1 69.6 vs a ~33 median).
                                                 bridge[00] == animA[11], so it is dropped.
  bridge2[01..16]   crown settles onto the end   v3 #3, run across the second measured
                                                 snap animA 12->16 (direct L1 66.5).
                                                 bridge2[00] == animA[12] == bridge[16].
                                                 bridge2[16] == the authored end pose.

Pacing: 16 frames are chosen from the 44 to MINIMISE THE LARGEST direct per-pixel L1 step
between delivered neighbours (binary search on the threshold + shortest-hop DP), so the
growth never lurches; spare frames then halve whatever the biggest remaining steps are.
"""
import json
import os

from PIL import Image, ImageChops

import imglib as L

RAW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "raw")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frames")
N_OUT = 16

seq = (
    [("animA", i) for i in range(0, 12)]
    + [("bridge", i) for i in range(1, 17)]
    + [("bridge2", i) for i in range(1, 17)]
)
ims = [L.load(os.path.join(RAW, "%s-%02d.png" % (t, i))) for t, i in seq]
print("spliced source frames:", len(ims))

# cumulative perceptual step
cum = [0.0]
for k in range(1, len(ims)):
    d = ImageChops.difference(ims[k], ims[k - 1])
    cum.append(cum[-1] + sum(sum(p) for p in d.getdata()) / (176 * 176))
total = cum[-1]
print("total perceptual path", round(total, 1))

# Pairwise DIRECT perceptual distance (mean per-pixel RGBA L1) between every source pair —
# what the eye actually sees between two DELIVERED frames, not the path length through the
# frames we drop. Pick exactly N_OUT frames (endpoints fixed) minimising the LARGEST step:
# binary-search the threshold, DP for reachability 0 -> last in <= N_OUT-1 hops.
import numpy as np  # noqa: E402

arr = np.stack([np.asarray(i, dtype=np.int16) for i in ims])
occ = arr[:, :, :, 3] >= 8
n = len(ims)
D = np.zeros((n, n))
for i in range(n):
    # per-OCCUPIED-pixel change, not per-canvas-pixel: a 700px seedling doubling in size is
    # a bigger visual event than a 10,000px crown reshuffling the same absolute pixel count,
    # and a canvas-normalised L1 hides that (it spends all its frames on the mature end).
    # Pure canvas-normalisation spends every frame on the mature end (a big crown moves more
    # absolute pixels); pure occupancy-normalisation spends every frame on the seedling. The
    # geometric mean of the two denominators is the compromise that samples both ends.
    union = np.maximum((occ | occ[i]).sum(axis=(1, 2)), 1)
    D[i] = np.abs(arr - arr[i]).sum(axis=(1, 2, 3)) / np.sqrt(union * 176.0 * 176.0)


def reachable(T):
    """Shortest hop count 0 -> j using only steps of direct distance <= T."""
    INF = 10**9
    hops = [INF] * n
    hops[0] = 0
    for _ in range(n):
        changed = False
        for i in range(n):
            if hops[i] == INF:
                continue
            for j in range(i + 1, n):
                if D[i][j] <= T and hops[i] + 1 < hops[j]:
                    hops[j] = hops[i] + 1
                    changed = True
        if not changed:
            break
    return hops[n - 1]


cands = sorted(set(D[np.triu_indices(n, 1)].tolist()))
lo, hi = 0, len(cands) - 1
while lo < hi:
    mid = (lo + hi) // 2
    if reachable(cands[mid]) <= N_OUT - 1:
        hi = mid
    else:
        lo = mid + 1
T = cands[lo]

# rebuild the chain at T, preferring the *smallest* step at each hop so the pace is even
INF = 10**9
hops = [INF] * n
prev = [-1] * n
hops[0] = 0
order = list(range(n))
for _ in range(n):
    for i in order:
        if hops[i] == INF:
            continue
        for j in range(i + 1, n):
            if D[i][j] <= T and hops[i] + 1 < hops[j]:
                hops[j] = hops[i] + 1
                prev[j] = i
picked = []
k = n - 1
while k != -1:
    picked.append(k)
    k = prev[k]
picked = sorted(picked)
# spend the spare frames halving the largest remaining steps
while len(picked) < N_OUT:
    gaps = sorted(((D[picked[i]][picked[i + 1]], i) for i in range(len(picked) - 1)), reverse=True)
    inserted = False
    for _, i in gaps:
        free = [k for k in range(picked[i] + 1, picked[i + 1]) if k not in picked]
        if free:
            picked.append(min(free, key=lambda k: abs(D[picked[i]][k] - D[k][picked[i + 1]])))
            inserted = True
            break
    if not inserted:
        break
    picked = sorted(picked)
picked = sorted(picked)
steps = [D[picked[i]][picked[i + 1]] for i in range(len(picked) - 1)]
print("picked source indices:", [(seq[k][0], seq[k][1]) for k in picked])
print("direct perceptual step min %.2f max %.2f mean %.2f" % (min(steps), max(steps), sum(steps) / len(steps)))

os.makedirs(OUT, exist_ok=True)
rows = []
for out_i, k in enumerate(picked):
    src = ims[k]
    raw_b = L.alpha_bbox(src)
    raw_a = L.root_anchor(src)
    norm = L.place(src, 1.0)  # crop -> paste so root anchor lands on (96,188) of a 192 sq
    path = os.path.join(OUT, "frame-%02d.png" % out_i)
    norm.save(path, optimize=True)
    nb = L.alpha_bbox(norm)
    na = L.root_anchor(norm)
    rows.append(
        {
            "file": "frame-%02d.png" % out_i,
            "source": "%s-%02d" % (seq[k][0], seq[k][1]),
            "sourceAnchor": {"x": raw_a[0], "y": raw_a[1]},
            "sourceFootprint": {
                "x": raw_b[0],
                "y": raw_b[1],
                "width": raw_b[2] - raw_b[0],
                "height": raw_b[3] - raw_b[1],
            },
            "normalizedAnchor": {"x": na[0], "y": na[1]},
            "normalizedFootprint": {
                "x": nb[0],
                "y": nb[1],
                "width": nb[2] - nb[0],
                "height": nb[3] - nb[1],
            },
            "encodedBytes": os.path.getsize(path),
        }
    )

reg = {
    "canvas": {"width": 192, "height": 192, "format": "PNG", "decoded": "RGBA8"},
    "frameCount": len(rows),
    "targetAnchor": {"x": 96, "y": 188},
    "alphaThreshold": 8,
    "anchorRule": "alpha-weighted x across bottom three occupied rows; bottom-most occupied y",
    "sourceCanvas": {"width": 176, "height": 176},
    "frames": rows,
    "totalEncodedBytes": sum(r["encodedBytes"] for r in rows),
}
with open(os.path.join(os.path.dirname(OUT), "registration.json"), "w", encoding="utf-8") as f:
    json.dump(reg, f, indent=2)

print("total bytes", reg["totalEncodedBytes"])
xs = [r["normalizedAnchor"]["x"] for r in rows]
ys = [r["normalizedAnchor"]["y"] for r in rows]
print("normalized anchor x range", min(xs), max(xs), "y range", min(ys), max(ys))
rxs = [r["sourceAnchor"]["x"] for r in rows]
rys = [r["sourceAnchor"]["y"] for r in rows]
print("RAW anchor x range", min(rxs), max(rxs), "y range", min(rys), max(rys))
