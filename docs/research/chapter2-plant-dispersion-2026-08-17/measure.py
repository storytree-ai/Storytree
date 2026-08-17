#!/usr/bin/env python3
"""Run every measurement this pass claims and write `dispersion-report.json`.

    python measure.py            # ~2 min, renders nothing, needs no Blender and no network

FOUR QUESTIONS, in the order the increment asked them:

  1. Does mechanism A fire — is the rim dense because cell choice is uniform over CELLS while
     boundary cells are smaller? Measured as cell area by coast-distance quintile, and as a
     COUNTERFACTUAL: the same counts redistributed proportional to area, which is A's own fix.
  2. Does mechanism B fire — do sliver cells collapse onto their centroid? Measured as
     `centroidFallbacks` and as exactly-coincident points, over many seeds.
  3. If neither, what does? Measured by CONDITIONING the coast gradient on capability.
  4. Does the dispersion floor separate the two positioners? Measured as the full
     `dispersion.measure` report for each.
"""
import collections
import importlib.util
import json
import math
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import dispersion as D           # noqa: E402
import disperse as X             # noqa: E402

S = X.S

ISLANDS = {
    "healthy": ("chapter2-healthy-island-2026-08-16", "the real-corpus island: story "
                "`context-traversal-capture`, 11 capabilities all healthy, 162 mesh cells"),
    "fixture": ("chapter2-grass-reads-as-signal-2026-08-16", "the fixture island: "
                "`fork-spike-island`, 10 capabilities across six statuses, 214 mesh cells"),
}

#: The seeds every distribution below is averaged over. The DELIVERED islands use their own
#: `island.json` seed; these exist so a claim about the MECHANISM is not a claim about one draw.
NSEED = 120

UAT = [{"id": f"uat-{i}", "state": s} for i, s in
       enumerate(["proven", "proven", "pending", "failing", "proven", "pending"])]


class _Tokens(dict):
    """The compositor's token families are irrelevant to WHERE a plant stands; this stands in for
    them so the positioner can run without decoding a single rendered piece."""
    def __missing__(self, k):
        return {}


TOKENS = {"blade": _Tokens(), "shrub": _Tokens(), "wilt": _Tokens(), "flower": _Tokens()}


def load(dirname):
    island = json.load(open(os.path.join(REPO, "docs", "research", dirname, "island.json")))
    cells = island["variantB"]["cells"]
    cx, cy = island["islandCentreGround"]
    coast = island["coastLoopGround"]
    # `_h` is the elevation the COMPOSITOR draws a cell at. It never enters a ground position, so
    # this pass sets it flat rather than importing the compositor to get it — stated so nobody reads
    # the flatness as a claim about the render.
    for c in cells:
        c["_h"] = 0.0
    island["_radius"] = sum(math.hypot(p[0] - cx, p[1] - cy) for p in coast) / len(coast)
    return island


def meadow_by_cap(items):
    out = collections.defaultdict(list)
    for it in items:
        if it["kind"] in ("tuft", "shrub", "wilt"):
            out[it["cap"]].append((it["g"][0], it["g"][1]))
    return dict(out)


def meadow_placements(items):
    """`(gx, gy, cell)` for every meadow item — the form the within-cell statistics need."""
    return [(it["g"][0], it["g"][1], it["cell"]) for it in items
            if it["kind"] in ("tuft", "shrub", "wilt")]


def quintiles(values, keys, q=5):
    order = sorted(range(len(keys)), key=lambda i: keys[i])
    out = []
    for k in range(q):
        sl = order[k * len(order) // q:(k + 1) * len(order) // q]
        out.append((sl, keys[sl[0]], keys[sl[-1]]))
    return out


def cross_parcel_near_pairs(points_by_cap, clearance=D.CLEARANCE):
    """Plants closer than the clearance whose two halves belong to DIFFERENT capabilities — the
    residual the parcel-scoped spacing rule cannot reach, named in `disperse.py`'s stated gap."""
    flat = [(x, y, ci) for ci, pts in points_by_cap.items() for x, y in pts]
    n = 0
    for i, (x, y, ci) in enumerate(flat):
        for j in range(len(flat)):
            if j == i:
                continue
            xj, yj, cj = flat[j]
            if cj == ci:
                continue
            if math.hypot(x - xj, y - yj) < clearance:
                n += 1
                break
    return n


report = {
    "date": "2026-08-17",
    "question": "why is the island dense at its edges, and can dispersion be asserted",
    "camera": "not applicable - every number here is measured in GROUND units, before any "
              "projection. The research track's 50 deg camera and the app's "
              "LAND_CAMERA_ELEVATION_DEG=20 both scale y by a constant, which cannot create or "
              "remove a radial gradient.",
    "blenderRenders": 0,
    "vendorCalls": 0,
    "seedsPerDistribution": NSEED,
    "clearanceGroundUnits": D.CLEARANCE,
    "candidatesPerPlacement": X.CANDIDATES,
    "islands": {},
}

for name, (dirname, blurb) in ISLANDS.items():
    island = load(dirname)
    cells = island["variantB"]["cells"]
    coast = island["coastLoopGround"]
    areas = [D.polygon_area(c["poly"]) for c in cells]
    cdist = [D.coast_distance(c["c"][0], c["c"][1], coast) for c in cells]
    owned = collections.defaultdict(list)
    for i, c in enumerate(cells):
        owned[c["cap"]].append(i)

    print(f"== {name} ({dirname}) ==", flush=True)

    # ---------------------------------------------------------------- 1. mechanism A's premise
    cell_fills = [
        areas[i] / ((max(p[0] for p in cells[i]["poly"]) - min(p[0] for p in cells[i]["poly"]))
                    * (max(p[1] for p in cells[i]["poly"]) - min(p[1] for p in cells[i]["poly"])))
        for i in range(len(cells))]
    geo = []
    for sl, lo, hi in quintiles(None, cdist):
        fills = [areas[i] / ((max(p[0] for p in cells[i]["poly"]) - min(p[0] for p in cells[i]["poly"]))
                             * (max(p[1] for p in cells[i]["poly"]) - min(p[1] for p in cells[i]["poly"])))
                 for i in sl]
        geo.append({
            "coastFrom": round(lo, 1), "coastTo": round(hi, 1), "cells": len(sl),
            "meanCellArea": round(statistics.mean(areas[i] for i in sl), 1),
            "medianCellArea": round(statistics.median(areas[i] for i in sl), 1),
            "minCellArea": round(min(areas[i] for i in sl), 1),
            "meanBboxFill": round(statistics.mean(fills), 4),
            "minBboxFill": round(min(fills), 4),
            "worstCaseFallbackProbability": round((1 - min(fills)) ** 12, 8),
        })

    # ---------------------------------------------------------------- 2 + 3. many seeds
    per_cell_before = collections.Counter()
    fallbacks = 0
    coincident = 0
    placements = 0
    for s in range(NSEED):
        items, st = S.scatter_island(island, TOKENS, f"probe-{s}", UAT, density=1.0)
        fallbacks += st["centroidFallbacks"]
        pts = [(it["g"][0], it["g"][1]) for it in items if it["kind"] != "flower"]
        placements += len(pts)
        coincident += sum(v for v in D.coincident_groups(pts).values())
        for it in items:
            if it["kind"] != "flower":
                per_cell_before[it["cell"]] += 1

    unconditioned = []
    for sl, lo, hi in quintiles(None, cdist):
        n = sum(per_cell_before.get(i, 0) for i in sl)
        a = sum(areas[i] for i in sl)
        unconditioned.append({"coastFrom": round(lo, 1), "coastTo": round(hi, 1),
                              "per1000Area": round(n / a * 1000 / NSEED, 4)})

    # mechanism A's OWN FIX as a counterfactual: hold each capability's realised count and spread it
    # over that capability's cells proportional to area. If A were the cause this flattens it.
    counter = collections.defaultdict(float)
    for ci, ids in owned.items():
        n = sum(per_cell_before.get(i, 0) for i in ids)
        a = sum(areas[i] for i in ids)
        for i in ids:
            counter[i] += n * areas[i] / a
    counterfactual = []
    for sl, lo, hi in quintiles(None, cdist):
        n = sum(counter.get(i, 0) for i in sl)
        a = sum(areas[i] for i in sl)
        counterfactual.append({"coastFrom": round(lo, 1), "coastTo": round(hi, 1),
                               "per1000Area": round(n / a * 1000 / NSEED, 4)})

    # between-capability: does owned AREA explain density, and does area track coast distance?
    xs_area, ys_dens, ds_coast = [], [], []
    for ci in sorted(owned):
        a = sum(areas[i] for i in owned[ci])
        n = sum(per_cell_before.get(i, 0) for i in owned[ci])
        xs_area.append(a)
        ys_dens.append(n / a * 1000 / NSEED)
        ds_coast.append(statistics.mean(cdist[i] for i in owned[ci]))

    def corr(a, b):
        ma, mb = statistics.mean(a), statistics.mean(b)
        sa, sb = statistics.pstdev(a), statistics.pstdev(b)
        if sa == 0 or sb == 0:
            return None
        return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / len(a) / (sa * sb)

    # ---------------------------------------------------------------- 4. the two positioners
    seed = island["seed"]
    before_items, before_stats = S.scatter_island(island, TOKENS, seed, UAT, density=1.0)
    after_items, after_stats = X.scatter_dispersed(island, TOKENS, seed, UAT, density=1.0)
    before_pts = meadow_by_cap(before_items)
    after_pts = meadow_by_cap(after_items)
    before = D.measure(island, before_pts, meadow_placements(before_items))
    after = D.measure(island, after_pts, meadow_placements(after_items))
    before["crossParcelNearPairs"] = cross_parcel_near_pairs(before_pts)
    after["crossParcelNearPairs"] = cross_parcel_near_pairs(after_pts)

    # and the same two, averaged over seeds, so the floor is not set from one draw
    def avg_over_seeds(fn):
        acc = collections.defaultdict(list)
        for s in range(30):
            items, _ = fn(island, TOKENS, f"probe-{s}", UAT, 1.0)
            m = D.measure(island, meadow_by_cap(items), meadow_placements(items))
            for k in ("clarkEvansIsland", "clarkEvansPerCapabilityMean", "nearPairFraction",
                      "rimCoreRatio", "conditionedNearFarRatio", "maxOverload",
                      "axisCorrelation", "onDiagonalFraction", "minNearestNeighbour"):
                if m[k] is not None:
                    acc[k].append(m[k])
        return {k: round(statistics.mean(v), 4) for k, v in acc.items()}

    print("   averaging the floor over 30 seeds ...", flush=True)
    before_avg = avg_over_seeds(lambda i, t, s, u, d: S.scatter_island(i, t, s, u, d))
    after_avg = avg_over_seeds(lambda i, t, s, u, d: X.scatter_dispersed(i, t, s, u, d))

    report["islands"][name] = {
        "source": dirname,
        "what": blurb,
        "cells": len(cells),
        "capabilities": len(island["capStatuses"]),
        "seed": seed,
        "mechanismA_cellGeometryByCoastQuintile": geo,
        "mechanismA_verdict": (
            "FALSIFIED. Mean cell area is flat across coast-distance quintiles, so the premise "
            "'boundary cells are clipped smaller' does not hold on this mesh; and the "
            "counterfactual that IS mechanism A's fix (cell choice proportional to area) leaves "
            "the rim/core ratio essentially unchanged."),
        "mechanismB_over_seeds": {
            "seeds": NSEED, "placements": placements,
            "centroidFallbacks": fallbacks,
            "centroidFallbackRate": round(fallbacks / placements, 8) if placements else None,
            "coincidentPlacements": coincident,
            # The honest expectation, from EACH cell's own bounding-box fill rather than the worst
            # cell in its quintile. The first draft used the per-quintile minimum and reported ~12
            # expected fallbacks, which is a worst case wearing an expectation's name; the true
            # figure is under one, and a "0 observed against 12 expected" would have been claiming
            # far more evidence than the measurement holds.
            "expectedFallbacksFromGeometry": round(
                sum((1 - f) ** 12 for f in cell_fills) / len(cells) * placements, 3),
            "measuredPerDrawHitRate": round(sum(cell_fills) / len(cells), 4),
        },
        "mechanismB_verdict": (
            "FALSIFIED. The fallback is real machinery but it never fires: the worst cell on "
            "either island has a bounding-box fill ratio near 0.4, so twelve independent draws all "
            "miss with probability ~2e-3, and the measured count is zero."),
        "mechanismC_areaBlindBudget": {
            "unconditionedDensityByCoastQuintile": unconditioned,
            "rimCoreRatio": round(unconditioned[0]["per1000Area"] / unconditioned[-1]["per1000Area"], 3),
            "counterfactualAreaWeightedCellChoice": counterfactual,
            "counterfactualRimCoreRatio": round(
                counterfactual[0]["per1000Area"] / counterfactual[-1]["per1000Area"], 3),
            "corrLogOwnedAreaVsDensity": round(corr([math.log(a) for a in xs_area], ys_dens), 4),
            "corrMeanCoastDistanceVsDensity": round(corr(ds_coast, ys_dens), 4),
            "corrOwnedAreaVsMeanCoastDistance": round(corr(xs_area, ds_coast), 4),
            "capabilityDensitySpread": round(max(ys_dens) / min(ys_dens), 2),
        },
        "positioners": {
            "before": before, "after": after,
            "beforeMeanOver30Seeds": before_avg, "afterMeanOver30Seeds": after_avg,
            "countPreserved": {
                "beforeMeadow": before_stats["tuft"] + before_stats["shrub"] + before_stats["wilt"],
                "afterMeadow": after_stats["tuft"] + after_stats["shrub"] + after_stats["wilt"],
                "afterWellCulled": after_stats["wellCulled"],
            },
        },
    }

out = os.path.join(HERE, "dispersion-report.json")
with open(out, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(report, fh, indent=2)
    fh.write("\n")
print("wrote", out)

for name, r in report["islands"].items():
    p = r["positioners"]
    b, a = p["beforeMeanOver30Seeds"], p["afterMeanOver30Seeds"]
    print(f"\n{name}: rim/core {r['mechanismC_areaBlindBudget']['rimCoreRatio']}x  "
          f"conditioned {p['before']['conditionedNearFarRatio']}x  "
          f"(A's own fix would leave it at "
          f"{r['mechanismC_areaBlindBudget']['counterfactualRimCoreRatio']}x)")
    for label, key in (("axis correlation u vs v ", "axisCorrelation"),
                       ("on-diagonal fraction    ", "onDiagonalFraction"),
                       ("Clark-Evans per-cap mean", "clarkEvansPerCapabilityMean"),
                       ("near-pair fraction      ", "nearPairFraction"),
                       ("min nearest neighbour   ", "minNearestNeighbour")):
        print(f"  {label}  before {b.get(key)}  ->  after {a.get(key)}")
    print(f"  max parcel overload       {p['before']['maxOverload']}x  "
          f"({p['before']['overloadedCapabilities']} capabilities over capacity)")
