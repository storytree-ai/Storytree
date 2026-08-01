"""
build_priors2.py — anisotropic apical-erosion silhouette PRIORS (exp-18, final).

Metric: an ANISOTROPIC chamfer geodesic propagated only through the mature plate's
own alpha, multi-source from the ROOT CONTACT band.
    vertical step   costs CV
    horizontal step costs CH   (CH > CV: lateral spread is expensive)
    diagonal step   costs CD
Because horizontal travel is expensive, distance grows fastest out along the SPLAYED
ROOTS and out to the CROWN's lateral tips, and slowest straight up the trunk. Stage k
keeps alpha pixels with distance <= CUT[k], so the silhouette retreats from the branch
and root TIPS inward along the tree's own topology: the young stages are a slim upright
sapling, not a flat sawn stump and not a bottom-up wipe.

A horizontal-only LATERAL TAPER of TAPER[k] px per run end then thins the remaining
trunk. Taper never lifts the bottom contact row (it only shortens horizontal runs), so
the root anchor row is invariant by construction.

usage: build_priors2.py <mature.png> <outdir> <cuts,csv> <tapers,csv> <CV> <CH> <CD>
"""
import heapq
import json
import os
import sys
from PIL import Image

ALPHA_T = 32
ROOT_BAND = 4


def field(im, CV, CH, CD):
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
    seed_xs = []
    for y in range(ymax - ROOT_BAND + 1, ymax + 1):
        for x in range(w):
            p = y * w + x
            if inside[p]:
                D[p] = 0
                pq.append((0, p))
                seed_xs.append(x)
    heapq.heapify(pq)
    steps = ((0, -1, CV), (0, 1, CV), (-1, 0, CH), (1, 0, CH),
             (-1, -1, CD), (1, -1, CD), (-1, 1, CD), (1, 1, CD))
    while pq:
        d, p = heapq.heappop(pq)
        if d > D[p]:
            continue
        y, x = divmod(p, w)
        for dx, dy, c in steps:
            xx, yy = x + dx, y + dy
            if xx < 0 or xx >= w or yy < 0 or yy >= h:
                continue
            n = yy * w + xx
            if not inside[n]:
                continue
            nd = d + c
            if nd < D[n]:
                D[n] = nd
                heapq.heappush(pq, (nd, n))
    root_axis = (min(seed_xs) + max(seed_xs)) / 2.0
    return inside, D, ymax, root_axis, INF


MIN_RUN = 2


def taper_x(mask, w, h, r):
    """Shrink every horizontal run by r px per end, but never below MIN_RUN px
    (the run keeps its centre). No run can vanish, so the bottom contact row and
    the contact-span CENTRE are both invariant under the taper."""
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
            width = e - s
            keep = max(MIN_RUN, width - 2 * r)
            keep = min(keep, width)
            a = s + (width - keep) // 2
            for xx in range(a, a + keep):
                out[row + xx] = 1
    return out


def keep_largest(mask, w, h):
    """Drop islands that the cut severed from the root-bearing body."""
    from collections import deque
    seen = bytearray(w * h)
    best, bestn = None, -1
    for s in range(w * h):
        if mask[s] and not seen[s]:
            q = deque([s]); seen[s] = 1; comp = [s]
            while q:
                p = q.popleft(); y, x = divmod(p, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h: continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            n = yy * w + xx
                            if mask[n] and not seen[n]:
                                seen[n] = 1; q.append(n); comp.append(n)
            if len(comp) > bestn:
                best, bestn = comp, len(comp)
    out = bytearray(w * h)
    for p in best or []:
        out[p] = 1
    return out, bestn


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    cuts = [int(v) for v in sys.argv[3].split(",")]
    tapers = [int(v) for v in sys.argv[4].split(",")]
    CV, CH, CD = int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    inside, D, root_y, root_axis, INF = field(im, CV, CH, CD)
    dmax = max(D[p] for p in range(w * h) if inside[p] and D[p] < INF)
    print("metric CV=%d CH=%d CD=%d  dmax=%d  root_y=%d  root_axis=%.1f" %
          (CV, CH, CD, dmax, root_y, root_axis))
    px = im.load()
    os.makedirs(outdir, exist_ok=True)
    table = []
    for k, (cut, tap) in enumerate(zip(cuts, tapers)):
        m = bytearray(w * h)
        for p in range(w * h):
            if inside[p] and D[p] <= cut:
                m[p] = 1
        m = taper_x(m, w, h, tap)
        m, _ = keep_largest(m, w, h)
        keep = [p for p in range(w * h) if m[p]]
        xs = [p % w for p in keep]; yy = [p // w for p in keep]
        x0, y0, x1, y1 = min(xs), min(yy), max(xs), max(yy)
        cxs = [p % w for p in keep if p // w == y1]
        cx = (min(cxs) + max(cxs)) / 2.0
        prior = Image.new("RGBA", (w, h), (0, 0, 0, 0)); ppx = prior.load()
        flat = Image.new("RGBA", (w, h), (0, 0, 0, 0)); fpx = flat.load()
        for p in keep:
            y, x = divmod(p, w)
            ppx[x, y] = px[x, y]
            fpx[x, y] = (38, 28, 22, 255)
        prior.save("%s/prior-%02d.png" % (outdir, k))
        flat.save("%s/mask-%02d.png" % (outdir, k))
        table.append({"stage": k, "cut": cut, "taper_px": tap, "area_px": len(keep),
                      "bbox": [x0, y0, x1, y1], "width": x1 - x0 + 1, "height": y1 - y0 + 1,
                      "contact_row": y1, "contact_span": [min(cxs), max(cxs)],
                      "contact_centre_x": cx})
        print("stage %d cut=%3d taper=%2d area=%5d bbox=(%3d,%3d,%3d,%3d) w=%3d h=%3d cy=%d cx=%.1f"
              % (k, cut, tap, len(keep), x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, y1, cx))
    json.dump({"src": src, "root_y": root_y, "root_axis_x": root_axis,
               "alpha_threshold": ALPHA_T,
               "metric": {"kind": "anisotropic chamfer geodesic, 8-connected, "
                                  "multi-source from the %d-row root contact band" % ROOT_BAND,
                          "vertical_cost": CV, "horizontal_cost": CH, "diagonal_cost": CD,
                          "dmax": dmax},
               "stages": table}, open("work/erosion-table.json", "w"), indent=2)


main()
