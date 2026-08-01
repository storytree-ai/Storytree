"""
build_priors.py — emit the N apical-erosion silhouette PRIORS.

Stage k keeps the mature plate's alpha pixels whose chamfer(2,3) geodesic distance
from the ROOT CONTACT band is <= CUT[k], then applies a horizontal-only LATERAL
TAPER of radius TAPER[k] (each horizontal run loses TAPER[k] px from each end).
The taper thins trunk + root flare for the young stages without ever lifting the
bottom contact row, so the root anchor is fixed by construction.

Writes:
  silhouettes/prior-XX.png  RGBA: the mature plate's own pixels, cut to the stage mask
  silhouettes/mask-XX.png   the same mask as flat ink on transparent (documentation)
  work/erosion-table.json   per-stage cutoff, taper, area, bbox, contact row/centre
"""
import heapq
import json
import os
import sys
from PIL import Image

ALPHA_T = 32
ORTH, DIAG = 2, 3
ROOT_BAND = 4


def geodesic_field(im):
    w, h = im.size
    A = im.getchannel("A").load()
    inside = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if A[x, y] >= ALPHA_T:
                inside[y * w + x] = 1
    ys = [y for y in range(h) if any(inside[y * w + x] for x in range(w))]
    ymax = max(ys)
    INF = 1 << 30
    D = [INF] * (w * h)
    pq = []
    for y in range(ymax - ROOT_BAND + 1, ymax + 1):
        for x in range(w):
            p = y * w + x
            if inside[p]:
                D[p] = 0
                pq.append((0, p))
    heapq.heapify(pq)
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
    return inside, D, ymax, INF


def taper_x(mask, w, h, r):
    """Remove r px from each END of every horizontal run. Bottom row y never lifts
    while any run survives there, so the root contact row is invariant."""
    if r <= 0:
        return bytearray(mask)
    out = bytearray(w * h)
    for y in range(h):
        row = y * w
        x = 0
        while x < w:
            if not mask[row + x]:
                x += 1
                continue
            s = x
            while x < w and mask[row + x]:
                x += 1
            e = x  # [s, e)
            a, b = s + r, e - r
            for xx in range(a, b):
                out[row + xx] = 1
    return out


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    cuts = [int(v) for v in sys.argv[3].split(",")]
    tapers = [int(v) for v in sys.argv[4].split(",")]
    assert len(cuts) == len(tapers)
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    inside, D, root_y, INF = geodesic_field(im)
    px = im.load()
    os.makedirs(outdir, exist_ok=True)
    table = []
    for k, (cut, tap) in enumerate(zip(cuts, tapers)):
        m = bytearray(w * h)
        for p in range(w * h):
            if inside[p] and D[p] <= cut:
                m[p] = 1
        m = taper_x(m, w, h, tap)
        keep = [p for p in range(w * h) if m[p]]
        xs = [p % w for p in keep]
        yy = [p // w for p in keep]
        x0, y0, x1, y1 = min(xs), min(yy), max(xs), max(yy)
        contact_xs = [p % w for p in keep if p // w == y1]
        cx = (min(contact_xs) + max(contact_xs)) / 2.0
        prior = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ppx = prior.load()
        flat = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        fpx = flat.load()
        for p in keep:
            y, x = divmod(p, w)
            ppx[x, y] = px[x, y]
            fpx[x, y] = (40, 30, 24, 255)
        prior.save("%s/prior-%02d.png" % (outdir, k))
        flat.save("%s/mask-%02d.png" % (outdir, k))
        table.append({
            "stage": k, "cut": cut, "taper_px": tap, "area_px": len(keep),
            "bbox": [x0, y0, x1, y1], "width": x1 - x0 + 1, "height": y1 - y0 + 1,
            "contact_row": y1, "contact_span": [min(contact_xs), max(contact_xs)],
            "contact_centre_x": cx,
        })
        print("stage %d cut=%3d taper=%2d area=%5d bbox=%s w=%3d h=%3d contact_y=%d cx=%.1f"
              % (k, cut, tap, len(keep), (x0, y0, x1, y1), x1 - x0 + 1, y1 - y0 + 1, y1, cx))
    json.dump({"src": src, "root_y": root_y, "alpha_threshold": ALPHA_T,
               "metric": "chamfer(2,3) geodesic, 8-connected, multi-source from the %d-row root contact band" % ROOT_BAND,
               "stages": table}, open("work/erosion-table.json", "w"), indent=2)


main()
