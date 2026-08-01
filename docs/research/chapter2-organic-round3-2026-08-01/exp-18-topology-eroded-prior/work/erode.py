"""
erode.py — build the apical-erosion silhouette PRIORS from a mature tree plate.

Metric: chamfer(2,3) geodesic (orthogonal step 2, diagonal step 3 -- the standard
integer approximation of Euclidean distance-along-the-shape), multi-source from the
ROOT CONTACT band, propagated only through the tree's own alpha. A stage keeps the
alpha pixels whose geodesic distance from the root is <= cutoff, so the silhouette
retreats from the branch TIPS inward along the tree's topology -- never a wipe, never
a uniform erode.

Outputs:
  silhouettes/sil-XX.png   the RGB-carrying eroded prior (mature pixels, cut mask)
  silhouettes/mask-XX.png  the same as a flat white-on-transparent silhouette
  work/erosion-table.json  cutoff / area / bbox / height for every stage
"""
import heapq
import json
import sys
from PIL import Image

ALPHA_T = 32
ORTH, DIAG = 2, 3


def build(src, n_stages, outdir, taper=None, root_band=4):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    A = im.getchannel("A").load()
    inside = [False] * (w * h)
    for y in range(h):
        for x in range(w):
            inside[y * w + x] = A[x, y] >= ALPHA_T

    ys = [y for y in range(h) if any(inside[y * w + x] for x in range(w))]
    ymax = max(ys)
    seeds = [
        y * w + x
        for y in range(ymax - root_band + 1, ymax + 1)
        for x in range(w)
        if inside[y * w + x]
    ]

    INF = 1 << 30
    D = [INF] * (w * h)
    pq = []
    for p in seeds:
        D[p] = 0
        heapq.heappush(pq, (0, p))
    while pq:
        d, p = heapq.heappop(pq)
        if d > D[p]:
            continue
        y, x = divmod(p, w)
        for dy in (-1, 0, 1):
            yy = y + dy
            if yy < 0 or yy >= h:
                continue
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                xx = x + dx
                if xx < 0 or xx >= w:
                    continue
                n = yy * w + xx
                if not inside[n]:
                    continue
                nd = d + (DIAG if (dx and dy) else ORTH)
                if nd < D[n]:
                    D[n] = nd
                    heapq.heappush(pq, (nd, n))

    dmax = max(D[p] for p in range(w * h) if inside[p] and D[p] < INF)

    # cutoff -> (area, bbox) curve, so stages can be chosen on a real measurement
    curve = {}
    for cut in range(0, dmax + 1, 2):
        keep = [p for p in range(w * h) if inside[p] and D[p] <= cut]
        if not keep:
            continue
        xs = [p % w for p in keep]
        yy2 = [p // w for p in keep]
        curve[cut] = (len(keep), min(xs), min(yy2), max(xs), max(yy2))

    return im, w, h, inside, D, dmax, curve, ymax


def main():
    src = sys.argv[1]
    outdir = sys.argv[2]
    n = int(sys.argv[3])
    im, w, h, inside, D, dmax, curve, ymax = build(src, n, outdir)
    print("dmax", dmax, "root_y", ymax)
    # print the height curve so the stage cutoffs are chosen on measurement
    rows = []
    for cut, (area, x0, y0, x1, y1) in curve.items():
        rows.append((cut, area, x1 - x0 + 1, y1 - y0 + 1))
    for r in rows[::4]:
        print("cut=%3d area=%5d w=%3d h=%3d" % r)
    json.dump({"dmax": dmax, "root_y": ymax, "curve": {str(k): v for k, v in curve.items()}},
              open(outdir + "/erosion-curve.json", "w"), indent=1)


if __name__ == "__main__":
    main()
