#!/usr/bin/env python3
"""HOW EVENLY the plants stand — the instrument, with no opinion about how they got there.

The owner asked why the island is dense at its edges, and asked for the answer to become a property
the pass can assert rather than eyeball. This module is the second half: a measure over a bag of
ground points that a `verify.py` can hold a positioner to.

It measures FOUR things, and keeping them apart is the whole point — the first two are the
positioner's fault and fixable, the last two are the COUNT rules' and are not this pass's to change:

  1. `clarkEvans`      — the nearest-neighbour index. 1.0 is a uniform-random (Poisson) scatter;
                         below 1 is clumped, above 1 is spread. A positioner that draws its points
                         independently scores 1.0 BY CONSTRUCTION however good it looks, because
                         independence IS the Poisson null. This is the number that separates
                         "scattered" from "dispersed".
  2. `nearPairFraction`— the share of plants whose nearest neighbour is closer than `CLEARANCE`
                         ground units. This is the one a viewer sees: two shrubs three units apart
                         are one blob.
  3. `overload`        — budget / capacity per parcel, where capacity is how many plants fit at
                         `CLEARANCE` under hexagonal packing. Above 1.0 the parcel is asked to
                         carry more plants than its land has room for, and NO positioner can help.
                         This is the honest name for density that is not a placement defect.
  4. `densityByCoast`  — placements per unit ground area binned by distance to the coast, reported
                         both raw and CONDITIONED ON CAPABILITY. The conditioned number is the one
                         that tells you whether the rim gradient lives inside parcels (a positioner
                         defect) or between them (a budget consequence).
  5. `axisCorrelation` — the correlation between where a plant sits ACROSS its cell's bounding box
                         and where it sits UP it. Two independent draws give zero. Anything else
                         means the two coordinates are not independent and the plants are lying on
                         a curve rather than filling an area — which is the defect this pass found
                         and the single sharpest thing to assert, because its null value is exactly
                         zero and needs no threshold negotiated from taste.

`CLEARANCE` is not a taste dial. A `parcel-shrub` in the shipped app (`scene.ts` ~1812) is three
under-lobes at x = -2.3s..+2.1s with radii ~2.0s and s = 1.1..1.5, so one shrub covers roughly 9-14
ground units across — call it a 4.5-7 unit half-width. Two shrubs closer than about four units
overlap outright. Four is therefore the loosest threshold that still means "these two are separate
plants", which is why it is the floor rather than a prettier larger number.
"""
import math

#: Ground units below which two plants read as one. Derived from the app's own shrub footprint —
#: see the module docstring. NOT an art-direction dial.
CLEARANCE = 4.0

#: Hexagonal packing puts one point per `c^2 * sqrt(3)/2` of area at spacing `c`. Used for capacity.
_HEX = math.sqrt(3.0) / 2.0


def polygon_area(poly):
    """Shoelace area of a simple polygon."""
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xx = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if x < xx:
                inside = not inside
    return inside


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def coast_distance(px, py, coast, signed=False):
    """Distance from a ground point to the coast loop. Positive inland when `signed`."""
    d = min(_seg_dist(px, py, coast[i][0], coast[i][1],
                      coast[(i + 1) % len(coast)][0], coast[(i + 1) % len(coast)][1])
            for i in range(len(coast)))
    if signed and not point_in_poly(px, py, coast):
        return -d
    return d


def nearest_neighbour_distances(points):
    """Every point's distance to its closest other point. O(n^2) and deliberately so — n is in the
    low hundreds here, and a grid index would be a second thing to get wrong."""
    n = len(points)
    if n < 2:
        return []
    out = []
    for i in range(n):
        xi, yi = points[i]
        best = float("inf")
        for j in range(n):
            if j == i:
                continue
            xj, yj = points[j]
            d = (xi - xj) ** 2 + (yi - yj) ** 2
            if d < best:
                best = d
        out.append(math.sqrt(best))
    return out


def clark_evans(points, area):
    """The nearest-neighbour index R = observed mean NN distance / the Poisson expectation.

    Under complete spatial randomness at intensity `lambda = n/area`, the mean nearest-neighbour
    distance is `1 / (2*sqrt(lambda))`. R < 1 clumped, R = 1 random, R > 1 spread; the hexagonal
    limit is 2.149.

    NO EDGE CORRECTION IS APPLIED, and that is a stated bias rather than an oversight: points near
    the parcel boundary have neighbours outside the parcel that this measure cannot see, so their
    observed NN distance is too large and R is biased UPWARD. The bias is the same for every
    positioner measured on the same parcels, so a BEFORE/AFTER comparison is sound; an absolute R
    quoted against the literature is not. It is also why the floor in `verify.py` is set from the
    measured spread between the two positioners and not from a textbook value.
    """
    n = len(points)
    if n < 2 or area <= 0:
        return None
    nn = nearest_neighbour_distances(points)
    lam = n / area
    return (sum(nn) / n) / (0.5 / math.sqrt(lam))


def near_pair_fraction(points, clearance=CLEARANCE):
    """Share of points whose nearest neighbour is closer than `clearance`."""
    nn = nearest_neighbour_distances(points)
    if not nn:
        return 0.0
    return sum(1 for d in nn if d < clearance) / len(nn)


def capacity(area, clearance=CLEARANCE):
    """How many plants fit in `area` at `clearance` spacing, under hexagonal packing."""
    return area / (clearance * clearance * _HEX)


def bbox_uv(x, y, poly):
    """Where a point sits inside a polygon's AXIS-ALIGNED BOUNDING BOX, as (u, v) in 0..1.

    The bounding box rather than the polygon because that is the frame the sampler draws in — the
    defect being measured is a relationship between the two DRAWS, and the draws are made in bbox
    coordinates. Measuring in polygon coordinates would launder the very structure being looked for.
    """
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    if w <= 0 or h <= 0:
        return None
    return (x - min(xs)) / w, (y - min(ys)) / h


def axis_uv(placements, cells):
    """Every placement's (u, v) within its own cell's bounding box — the raw pairs, so a caller
    measuring across many seeds can POOL them and get a correlation with real statistical power
    instead of taking the worst of many noisy per-seed estimates."""
    out = []
    for gx, gy, ci in placements:
        uv = bbox_uv(gx, gy, cells[ci]["poly"])
        if uv is not None:
            out.append(uv)
    return out


def correlation(pairs):
    """Pearson correlation of a list of (a, b)."""
    n = len(pairs)
    if n < 3:
        return None
    ma = sum(p[0] for p in pairs) / n
    mb = sum(p[1] for p in pairs) / n
    sa = math.sqrt(sum((p[0] - ma) ** 2 for p in pairs) / n)
    sb = math.sqrt(sum((p[1] - mb) ** 2 for p in pairs) / n)
    if sa == 0 or sb == 0:
        return None
    return sum((p[0] - ma) * (p[1] - mb) for p in pairs) / n / (sa * sb)


def axis_correlation(placements, cells):
    """Pearson correlation between a placement's u and v within its own cell's bounding box.

    THE NULL IS EXACTLY ZERO. Two independent uniform draws are uncorrelated whatever the cell
    shapes are, whatever the counts are, and whatever the island looks like — so this number needs
    no baseline run, no threshold argued from taste, and no edge correction. A sampler that draws
    its two coordinates independently scores zero; one that does not, does not.

    `placements` is `[(gx, gy, cell_index), ...]`.
    """
    us, vs = [], []
    for gx, gy, ci in placements:
        uv = bbox_uv(gx, gy, cells[ci]["poly"])
        if uv is None:
            continue
        us.append(uv[0])
        vs.append(uv[1])
    n = len(us)
    if n < 3:
        return None
    mu = sum(us) / n
    mv = sum(vs) / n
    su = math.sqrt(sum((u - mu) ** 2 for u in us) / n)
    sv = math.sqrt(sum((v - mv) ** 2 for v in vs) / n)
    if su == 0 or sv == 0:
        return None
    return sum((u - mu) * (v - mv) for u, v in zip(us, vs)) / n / (su * sv)


def on_diagonal_fraction(placements, cells, tol=0.02):
    """Share of placements whose (u, v) lies within `tol` of the bounding box's main diagonal.

    For independent draws this is about `2*tol - tol^2` = 4.0% at the default tolerance. The
    companion to `axis_correlation`: the correlation says the two draws are related, this says how
    tightly, in a unit a reader can picture.
    """
    n = hit = 0
    for gx, gy, ci in placements:
        uv = bbox_uv(gx, gy, cells[ci]["poly"])
        if uv is None:
            continue
        n += 1
        if abs(uv[0] - uv[1]) <= tol:
            hit += 1
    return (hit / n) if n else None


def coincident_groups(points, eps=1e-9):
    """Points sharing a location — the signature of a sampler that collapsed onto a fallback."""
    seen = {}
    for x, y in points:
        seen.setdefault((round(x / eps), round(y / eps)), 0)
        seen[(round(x / eps), round(y / eps))] += 1
    return {k: v for k, v in seen.items() if v > 1}


# --------------------------------------------------------------------------- the island-wide report
def measure(island, points_by_cap, placements=None, bins=(0, 12, 20, 28, 36)):
    """Every statistic above, for one island and one positioner's output.

    `points_by_cap` is `{capability index: [(gx, gy), ...]}` — grouped, because the capability is
    the unit the count rules budget over and therefore the unit the conditioned density has to
    condition on. `placements`, when given, is `[(gx, gy, cell_index), ...]` and unlocks the two
    within-cell statistics, which need to know which cell frame each point was drawn in.
    """
    cells = island["variantB"]["cells"]
    coast = island["coastLoopGround"]
    areas = [polygon_area(c["poly"]) for c in cells]
    cell_dist = [coast_distance(c["c"][0], c["c"][1], coast) for c in cells]

    owned = {}
    for i, c in enumerate(cells):
        owned.setdefault(c["cap"], []).append(i)

    def binof(d):
        for k in range(len(bins) - 1):
            if bins[k] <= d < bins[k + 1]:
                return k
        return len(bins) - 1

    nbins = len(bins)
    area_bin = [0.0] * nbins
    for i in range(len(cells)):
        area_bin[binof(cell_dist[i])] += areas[i]

    all_points = [p for pts in points_by_cap.values() for p in pts]
    total_area = sum(areas)

    # ---- raw density by coast distance
    #
    # A PLACEMENT IS BINNED BY ITS CELL'S CENTROID, NOT BY ITS OWN DISTANCE TO THE COAST, and the
    # inconsistency this avoids is not hypothetical — it manufactured a result. The denominator is
    # necessarily per-CELL area (a cell is the smallest thing whose area is known), so binning the
    # numerator by the point's own distance puts placements in bins whose area was never counted:
    # a cell centred 14 units inland contributes all its area to the 12-20 bin while its plants
    # scatter across the 8-20 range. Any positioner that pushes points toward cell EDGES — which
    # is exactly what a spacing rule does — then reads as having created a rim gradient. Measured
    # with the mixed binning, this pass's fix appeared to raise the rim/core ratio from 2.24x to
    # 3.18x; measured consistently it leaves it at 2.28x, which is the true answer, because the
    # gradient is a property of the COUNT rules and the fix does not touch a single count.
    count_bin = [0] * nbins
    if placements:
        for _x, _y, ci in placements:
            count_bin[binof(cell_dist[ci])] += 1
    else:
        for x, y in all_points:
            count_bin[binof(coast_distance(x, y, coast))] += 1
    density_by_coast = [
        {"from": bins[b], "to": (bins[b + 1] if b + 1 < len(bins) else None),
         "area": round(area_bin[b], 1), "placements": count_bin[b],
         "per1000Area": round(count_bin[b] / area_bin[b] * 1000, 4) if area_bin[b] else None}
        for b in range(nbins)
    ]

    # ---- the discriminator: the same gradient CONDITIONED on capability.
    # Each capability's own cells are split at that capability's own median coast distance, so a
    # capability that lives entirely at the rim contributes to both halves and cannot masquerade as
    # a rim effect. A ratio near 1.0 says the gradient is BETWEEN capabilities, not within them.
    near_n = near_a = far_n = far_a = 0.0
    for ci, cell_ids in owned.items():
        if len(cell_ids) < 4:
            continue
        ds = sorted(cell_dist[i] for i in cell_ids)
        med = ds[len(ds) // 2] if len(ds) % 2 else (ds[len(ds) // 2 - 1] + ds[len(ds) // 2]) / 2
        na = sum(areas[i] for i in cell_ids if cell_dist[i] <= med)
        fa = sum(areas[i] for i in cell_ids if cell_dist[i] > med)
        if na <= 0 or fa <= 0:
            continue
        for x, y in points_by_cap.get(ci, []):
            # attribute the placement to the half its own cell sits in
            hit = min(cell_ids, key=lambda i: (cells[i]["c"][0] - x) ** 2 + (cells[i]["c"][1] - y) ** 2)
            if cell_dist[hit] <= med:
                near_n += 1
            else:
                far_n += 1
        near_a += na
        far_a += fa
    conditioned = ((near_n / near_a) / (far_n / far_a)) if (near_a and far_a and far_n) else None

    # ---- per capability: dispersion, and whether the budget even fits
    per_cap = []
    r_values, overloads = [], []
    for ci in sorted(owned):
        pts = points_by_cap.get(ci, [])
        oa = sum(areas[i] for i in owned[ci])
        cap = capacity(oa)
        R = clark_evans(pts, oa)
        row = {
            "cap": ci, "cells": len(owned[ci]), "area": round(oa, 1),
            "placements": len(pts),
            "per1000Area": round(len(pts) / oa * 1000, 3) if oa else None,
            "meanCoastDistance": round(sum(cell_dist[i] for i in owned[ci]) / len(owned[ci]), 2),
            "capacityAtClearance": round(cap, 1),
            "overload": round(len(pts) / cap, 3) if cap else None,
            "clarkEvans": round(R, 4) if R is not None else None,
            "nearPairFraction": round(near_pair_fraction(pts), 4) if len(pts) > 1 else None,
        }
        per_cap.append(row)
        if R is not None and len(pts) >= 6:
            r_values.append(R)
        if cap:
            overloads.append(len(pts) / cap)

    nn_all = nearest_neighbour_distances(all_points)
    nn_sorted = sorted(nn_all)
    ax = axis_correlation(placements, cells) if placements else None
    diag = on_diagonal_fraction(placements, cells) if placements else None
    return {
        "clearance": CLEARANCE,
        "axisCorrelation": round(ax, 4) if ax is not None else None,
        "onDiagonalFraction": round(diag, 4) if diag is not None else None,
        "placements": len(all_points),
        "islandArea": round(total_area, 1),
        "clarkEvansIsland": round(clark_evans(all_points, total_area), 4) if len(all_points) > 1 else None,
        "clarkEvansPerCapabilityMean": round(sum(r_values) / len(r_values), 4) if r_values else None,
        "capabilitiesScored": len(r_values),
        "nearPairFraction": round(near_pair_fraction(all_points), 4),
        "minNearestNeighbour": round(nn_sorted[0], 4) if nn_sorted else None,
        "medianNearestNeighbour": round(nn_sorted[len(nn_sorted) // 2], 4) if nn_sorted else None,
        "coincidentGroups": len(coincident_groups(all_points)),
        "densityByCoast": density_by_coast,
        "rimCoreRatio": (
            round(density_by_coast[0]["per1000Area"] / density_by_coast[-1]["per1000Area"], 3)
            if density_by_coast[0]["per1000Area"] and density_by_coast[-1]["per1000Area"] else None),
        "conditionedNearFarRatio": round(conditioned, 4) if conditioned else None,
        # the four raw accumulators behind that ratio, so a caller across many seeds can pool them
        # rather than average a ratio of small counts (which is biased and noisy)
        "conditionedCounts": {"nearPlacements": near_n, "nearArea": round(near_a, 2),
                              "farPlacements": far_n, "farArea": round(far_a, 2)},
        "maxOverload": round(max(overloads), 3) if overloads else None,
        "overloadedCapabilities": sum(1 for o in overloads if o > 1.0),
        "perCapability": per_cap,
    }
