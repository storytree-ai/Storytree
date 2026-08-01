"""
build_priors3.py — the exp-18 apical-erosion PRIOR generator (final form).

Everything below is pure PIL, deterministic, model-free. It turns ONE mature tree
plate into N silhouette priors.

  1. WOOD / LEAF split by colour (leaf iff G > R+LEAF_D and G > B+LEAF_D).
  2. ANISOTROPIC chamfer geodesic D over the plate's own alpha, multi-source from the
     ROOT CONTACT band (all root feet in the bottom ROOT_BAND rows). Vertical steps
     cost CV, horizontal CH, diagonal CD, with CH > CV so lateral spread is expensive:
     distance therefore grows fastest out along the SPLAYED ROOTS and out to the
     CROWN's lateral tips, slowest straight up the trunk.
  3. Stage k retains R_k = { p : D(p) <= CUT[k] } -- the silhouette retreats from the
     branch and root TIPS inward along the tree's own topology. Wood W_k = R_k n wood,
     real leaf L_k = R_k n leaf.
  4. LATERAL TAPER of TAPER[k] px per run end on W_k (never below MIN_RUN px, so no
     run can vanish: the bottom contact row and the contact-span CENTRE are invariant
     by construction).
  5. CROWN MASS S_k: the apical band of W_k (the branch tips the cut just exposed,
     D >= CUT[k] - APEX_BAND) dilated by CROWN_R[k] and filled with three greens
     SAMPLED FROM THE PLATE'S OWN CANOPY (light above the mass centroid, mid below,
     dark on the rim). This is a flat colour PRIOR, not art: it tells the model where
     a canopy of that age belongs and hands it the palette. All leaf detail is the
     model's. S_k excludes wood and real leaf, so late stages are almost pure plate.

  prior_k = W_k (plate colours) u L_k (plate colours) u S_k (flat sampled greens)
"""
import heapq
import json
import os
import sys
from collections import Counter, deque
from PIL import Image

ALPHA_T = 32
ROOT_BAND = 4
LEAF_D = 12
MIN_RUN = 2
APEX_BAND = 60
CROWN_FLOOR = 14
CROWN_SHARE = 0.45


def classify(im):
    w, h = im.size
    px = im.load()
    inside = bytearray(w * h)
    leaf = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= ALPHA_T:
                inside[y * w + x] = 1
                if g > r + LEAF_D and g > b + LEAF_D:
                    leaf[y * w + x] = 1
    return inside, leaf


def geodesic(inside, w, h, CV, CH, CD):
    ys = [y for y in range(h) if any(inside[y * w + x] for x in range(w))]
    ymax = max(ys)
    INF = 1 << 30
    D = [INF] * (w * h)
    pq = []
    band = []
    for y in range(ymax - ROOT_BAND + 1, ymax + 1):
        for x in range(w):
            p = y * w + x
            if inside[p]:
                D[p] = 0
                pq.append((0, p))
                band.append(x)
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
            if 0 <= xx < w and 0 <= yy < h:
                n = yy * w + xx
                if inside[n] and d + c < D[n]:
                    D[n] = d + c
                    heapq.heappush(pq, (d + c, n))
    return D, ymax, INF


def taper_x(mask, w, h, r, frac=1.0, root_y=None, protect=6, blend=20):
    """Lateral taper. Each horizontal run is shrunk about its own centre to
        keep = max(MIN_RUN, min(width - 2*r, round(frac * width)))
    The PROPORTIONAL term (frac) is what slims a young stage's trunk and root flare:
    a sapling's stem is a FRACTION of the mature's width, not 'mature minus r px'.
    MIN_RUN guarantees no run can vanish, so the bottom contact row survives every
    stage and the contact anchor is invariant by construction."""
    if r <= 0 and frac >= 1.0:
        return bytearray(mask)
    def frac_at(y):
        # no taper inside the protected contact band, ramping to the full fraction
        # `blend` rows above it. Tapering the root feet themselves severs the arch that
        # joins them, largest() then drops one foot, and the contact anchor jumps 23 px
        # -- measured, and the reason this ramp exists.
        if root_y is None:
            return frac
        t = (root_y - y - protect) / float(blend)
        t = 0.0 if t < 0 else (1.0 if t > 1 else t)
        return 1.0 - (1.0 - frac) * t
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
            width = x - s
            f = frac_at(y)
            keep = min(width, max(MIN_RUN, min(width - 2 * r, int(round(f * width)))))
            a = s + (width - keep) // 2
            for xx in range(a, a + keep):
                out[row + xx] = 1
    return out


def dilate(mask, w, h, r):
    """Euclidean-ish dilation by radius r (multi-source BFS on a chamfer(3,4) field)."""
    INF = 1 << 30
    D = [INF] * (w * h)
    pq = []
    for p in range(w * h):
        if mask[p]:
            D[p] = 0
            pq.append((0, p))
    heapq.heapify(pq)
    lim = r * 3
    steps = ((0, -1, 3), (0, 1, 3), (-1, 0, 3), (1, 0, 3),
             (-1, -1, 4), (1, -1, 4), (-1, 1, 4), (1, 1, 4))
    while pq:
        d, p = heapq.heappop(pq)
        if d > D[p] or d >= lim:
            continue
        y, x = divmod(p, w)
        for dx, dy, c in steps:
            xx, yy = x + dx, y + dy
            if 0 <= xx < w and 0 <= yy < h:
                n = yy * w + xx
                if d + c < D[n] and d + c <= lim:
                    D[n] = d + c
                    heapq.heappush(pq, (d + c, n))
    out = bytearray(w * h)
    for p in range(w * h):
        if D[p] <= lim:
            out[p] = 1
    return out, D


def largest(mask, w, h):
    seen = bytearray(w * h)
    best, bn = None, -1
    for s in range(w * h):
        if mask[s] and not seen[s]:
            q = deque([s]); seen[s] = 1; comp = [s]
            while q:
                p = q.popleft(); y, x = divmod(p, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            n = yy * w + xx
                            if mask[n] and not seen[n]:
                                seen[n] = 1; q.append(n); comp.append(n)
            if len(comp) > bn:
                best, bn = comp, len(comp)
    out = bytearray(w * h)
    for p in best or []:
        out[p] = 1
    return out


def canopy_tones(im, leaf, w, h):
    px = im.load()
    c = Counter()
    for p in range(w * h):
        if leaf[p]:
            y, x = divmod(p, w)
            c[px[x, y][:3]] += 1
    common = [k for k, _ in c.most_common(24)]
    common.sort(key=lambda t: t[0] + t[1] + t[2])
    dark = common[max(0, len(common) // 6)]
    mid = common[len(common) // 2]
    light = common[min(len(common) - 1, (len(common) * 5) // 6)]
    return light, mid, dark


def main():
    src, outdir = sys.argv[1], sys.argv[2]
    cuts = [int(v) for v in sys.argv[3].split(",")]
    tapers = [int(v) for v in sys.argv[4].split(",")]
    fracs = [float(v) for v in sys.argv[7].split(",")] if len(sys.argv) > 7 else [1.0] * len(tapers)
    crowns = [int(v) for v in sys.argv[5].split(",")]
    CV, CH, CD = (int(v) for v in sys.argv[6].split(","))
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    inside, leaf = classify(im)
    D, root_y, INF = geodesic(inside, w, h, CV, CH, CD)
    dmax = max(D[p] for p in range(w * h) if inside[p] and D[p] < INF)
    light, mid, dark = canopy_tones(im, leaf, w, h)
    print("dmax=%d root_y=%d wood=%d leaf=%d tones light=%s mid=%s dark=%s"
          % (dmax, root_y, sum(inside) - sum(leaf), sum(leaf), light, mid, dark))
    os.makedirs(outdir, exist_ok=True)
    table = []
    for k, (cut, tap, cr, frc) in enumerate(zip(cuts, tapers, crowns, fracs)):
        R = bytearray(w * h)
        for p in range(w * h):
            if inside[p] and D[p] <= cut:
                R[p] = 1
        W = bytearray(w * h)
        L = bytearray(w * h)
        for p in range(w * h):
            if R[p]:
                (L if leaf[p] else W)[p] = 1
        W = taper_x(W, w, h, tap, frc, root_y)
        # APEX = the branch tips the cut just exposed: high geodesic distance AND in the
        # upper CROWN_SHARE of the retained stem's own height. The height rule is what
        # stops a young stage's splayed ROOT tips (also high-D, because lateral travel is
        # expensive) from being dilated into a horizontal crown lying on the ground.
        floor = max(cut - APEX_BAND, int(0.60 * cut))
        wys = [p // w for p in range(w * h) if W[p]]
        wtop, wbot = min(wys), max(wys)
        ycap = wtop + int(CROWN_SHARE * (wbot - wtop))
        apex = bytearray(w * h)
        for p in range(w * h):
            if W[p] and D[p] >= floor and (p // w) <= ycap:
                apex[p] = 1
        if cr > 0 and sum(apex):
            env, _ = dilate(apex, w, h, cr)
            # the REAL retained canopy joins the envelope, so it is re-clustered too --
            # otherwise the anisotropic cut leaves a flat triangular "sail" edge on the
            # mid stages, which the redraw preserves as a spike.
            for p in range(w * h):
                if L[p]:
                    env[p] = 1
            ay = [p // w for p in range(w * h) if apex[p]]
            # a canopy never reaches the ground
            ylimit = min(max(ay) + cr, root_y - CROWN_FLOOR)
            # CLUSTERED mass: the envelope is re-expressed as overlapping round leaf
            # clusters -- discs of radius ~0.62*cr on a deterministic lattice of spacing
            # cr inside the envelope. This hands the model the plate's own canopy
            # STRUCTURE (overlapping rounded clumps with dark rims), not just a blob,
            # which is what kept the young frames from popping style against the mature.
            dr = max(3, int(round(0.68 * cr)))
            g = max(5, int(round(1.35 * dr)))
            centres = [p for p in range(w * h)
                       if env[p] and (p % w) % g == g // 2 and (p // w) % g == g // 2]
            if not centres:
                centres = [p for p in range(w * h) if apex[p]][:1]
            # solid CORE = the envelope eroded by ~0.55*dr, so the clustered mass has no
            # interior holes; the discs then scallop its boundary into leaf clumps.
            outside = bytearray(1 if not env[p] else 0 for p in range(w * h))
            grown, _ = dilate(outside, w, h, max(1, int(round(0.55 * dr))))
            mass = bytearray(w * h)
            rim = bytearray(w * h)
            for p in range(w * h):
                if env[p] and not grown[p]:
                    mass[p] = 1
            for c in centres:
                cyy, cxx = divmod(c, w)
                for yy in range(max(0, cyy - dr), min(h, cyy + dr + 1)):
                    for xx in range(max(0, cxx - dr), min(w, cxx + dr + 1)):
                        d2 = (yy - cyy) ** 2 + (xx - cxx) ** 2
                        if d2 <= dr * dr:
                            mass[yy * w + xx] = 1
                            if d2 > (dr - 1.4) ** 2:
                                rim[yy * w + xx] = 1
            for p in range(w * h):
                if mass[p]:
                    rim[p] = 1 if rim[p] else 0
        else:
            mass, rim, ylimit = bytearray(w * h), bytearray(w * h), 0
        if cr > 0:
            for p in range(w * h):
                if L[p] and not mass[p]:
                    L[p] = 0
        S = bytearray(w * h)
        for p in range(w * h):
            if mass[p] and not W[p] and not L[p] and (p // w) <= ylimit:
                S[p] = 1
        # a rim pixel that another disc covers from the inside is interior, not a rim
        for p in range(w * h):
            if rim[p]:
                y, x = divmod(p, w)
                nb = sum(1 for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                         if 0 <= x + dx < w and 0 <= y + dy < h and mass[(y + dy) * w + x + dx])
                if nb == 9:
                    rim[p] = 0
        full = bytearray(w * h)
        for p in range(w * h):
            if W[p] or L[p] or S[p]:
                full[p] = 1
        full = largest(full, w, h)
        # centroid of the synthetic mass drives the light/mid split
        sp = [p for p in range(w * h) if S[p] and full[p]]
        cy = (sum(p // w for p in sp) / len(sp)) if sp else 0
        my0 = min((p // w for p in sp), default=0)
        my1 = max((p // w for p in sp), default=1)
        prior = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        pp = prior.load()
        for p in range(w * h):
            if not full[p]:
                continue
            y, x = divmod(p, w)
            if W[p] or L[p]:
                pp[x, y] = px[x, y]
            else:
                t = (y - my0) / max(1.0, float(my1 - my0))
                tone = dark if rim[p] else (light if t < 0.38 else (mid if t < 0.72 else dark))
                pp[x, y] = (tone[0], tone[1], tone[2], 255)
        keep = [p for p in range(w * h) if full[p]]
        xs = [p % w for p in keep]; yy = [p // w for p in keep]
        x0, y0, x1, y1 = min(xs), min(yy), max(xs), max(yy)
        cxs = [p % w for p in keep if p // w == y1]
        cxc = (min(cxs) + max(cxs)) / 2.0
        prior.save("%s/prior-%02d.png" % (outdir, k))
        flat = Image.new("RGBA", (w, h), (0, 0, 0, 0)); fp = flat.load()
        for p in keep:
            y, x = divmod(p, w)
            fp[x, y] = (38, 28, 22, 255)
        flat.save("%s/mask-%02d.png" % (outdir, k))
        table.append({"stage": k, "cut": cut, "taper_px": tap, "taper_frac": frc, "crown_r_px": cr,
                      "area_px": len(keep), "wood_px": sum(W), "real_leaf_px": sum(L),
                      "synthetic_crown_px": sum(S), "bbox": [x0, y0, x1, y1],
                      "width": x1 - x0 + 1, "height": y1 - y0 + 1,
                      "contact_row": y1, "contact_span": [min(cxs), max(cxs)],
                      "contact_centre_x": cxc})
        print("s%d cut=%3d tap=%d crown=%2d area=%5d wood=%5d leaf=%5d synth=%5d "
              "bbox=(%3d,%3d,%3d,%3d) w=%3d h=%3d cy=%d cx=%.1f"
              % (k, cut, tap, cr, len(keep), sum(W), sum(L), sum(S),
                 x0, y0, x1, y1, x1 - x0 + 1, y1 - y0 + 1, y1, cxc))
    json.dump({"src": src, "root_y": root_y, "alpha_threshold": ALPHA_T,
               "leaf_split_delta": LEAF_D, "apex_band": APEX_BAND, "min_run_px": MIN_RUN,
               "root_band_rows": ROOT_BAND,
               "metric": {"kind": "anisotropic chamfer geodesic, 8-connected, "
                                  "multi-source from the root contact band",
                          "vertical_cost": CV, "horizontal_cost": CH,
                          "diagonal_cost": CD, "dmax": dmax},
               "canopy_tones": {"light": light, "mid": mid, "dark": dark},
               "stages": table}, open("work/erosion-table.json", "w"), indent=2)


main()
