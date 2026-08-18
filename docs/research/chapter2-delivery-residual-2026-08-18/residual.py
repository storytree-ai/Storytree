#!/usr/bin/env python3
"""WHAT THE 17.2% WAS: a SECOND defect stacked on the first, and it is already gone.

    python residual.py              # the measurement + residual-report.json   (~12 min)

THE CLAIM THIS EXISTS TO TEST, quoted from the increment that commissioned it:

    "The real-corpus island's grass delivery residual is 17.2%, more than twice the fixture's 7.1%
     and unattributed."

It is attributed here, and the attribution is that **the number no longer exists**. 17.2% was
measured on 2026-08-17 against the plant positions the affine-CRC32 scatterer produced. PR #1393
replaced that positioner the next morning. On the same island, the same compositor, the same seed and
the same piece set, the real-corpus rate is now **6.6%** against the fixture's **7.0%** — so the
"more than twice the fixture" gap is not merely explained, it is ABSENT.

    THE 2x2 THAT SAYS SO. Two defects, two switches, four corners, one run:

                                  depth key = OLD (pre-#1387)   depth key = SHIPPED
      positioner = LEGACY_AFFINE            52.2%                      16.7%
      positioner = SPREAD (shipped)         35.9%                       6.6%

    Reading the corners: the top-left corner reproduces PR #1387's committed "before" EXACTLY
    (94 of 180). The top-right corner reproduces its committed "after" to within one placement
    (30 vs 31 of 180) - that is the 17.2% figure, and the one-placement gap is stated below rather
    than smoothed. The bottom-right corner is what a reader looking at the track TODAY gets.

WHY THIS IS NOT A RE-RUN DRESSED AS A DIAGNOSIS. Reproducing a magnitude is the weak form of an
attribution; PR #1383 earned trust on this arc because its prediction had a SIGN - above the cell
centroid 78.3% of placements delivered nothing, below it 3.8%, a 20x split across a comparison
containing no pixel quantity at all. The same bar is met here, and the sign is CO-TENANCY:

    THE DIAGONAL ONLY COSTS DELIVERY WHERE TWO PLANTS SHARE A CELL.

Under the affine draw every plant stood on its cell's bounding-box diagonal, so two plants in one
cell were not merely close - they were COLLINEAR, on a line whose direction the cell fixed. A plant
alone in its cell has nothing to collide with and loses nothing. So the prediction, made before the
numbers below were read and falsifiable by them:

  1. Under LEGACY, the zero-delivery rate must RISE MONOTONICALLY with the number of co-tenants of
     a placement's own cell, and placements alone in their cell must sit near the SPREAD rate.
  2. Under SPREAD that gradient must COLLAPSE, because best-candidate blue noise is precisely a rule
     for separating co-tenants.
  3. Therefore the two islands' 10x difference in what the dispersion fix BOUGHT (10.1 points on the
     real island, 1.0 point on the fixture) must be predicted by their per-cell plant density alone
     - 1.12 plants per cell against 0.52 - and by nothing about their shapes, their statuses or
     their sizes.

Point 3 is the one that can fail loudly: the two islands were never chosen to differ in density, and
nothing in the pipeline knows that density is the axis.

    AND THE FIX IS DECOMPOSED, not credited whole. `scatter.py`'s replacement changed THREE things
    at once - an avalanche-finalised hash (which is what kills the diagonal), an area-weighted cell
    choice, and best-candidate blue noise. `candidates=1` turns the third off while keeping the first
    two, so the 10.1 points are split between "the diagonal" and "the spacing" rather than attributed
    to a bundle.

WHAT IS LEFT, AND WHAT IT IS. After both fixes the real island's residual is 12 of 181 placements,
11 of them TRUE zeros (one is co-credited to a colour-identical neighbour, which is an instrument
artefact and not a loss). Those 11 are attributed one by one below. They are NOT a third defect: they
are the raster's own floor, and the honest reading of them is the SIZE question this arc already has
open, not a new bug.

SCALE, PINNED. One delivered raster per corner, supersample 3, 1 ground unit = 1 delivered pixel,
camera 50 deg (the research track's named parameter; the app's `LAND_CAMERA_ELEVATION_DEG` is 20 and
is neither read nor written here). No Blender render: every piece is a committed PNG. The scatter
seed is the instrument's own (`grass.SEED`) on both geometries, because the seed decides WHERE inside
a cell a placement lands and holding it fixed is what makes two islands comparable at all.
"""
import contextlib
import functools
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
DEFECTS = os.path.join(RESEARCH, "chapter2-grass-defects-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
LOSS = os.path.join(RESEARCH, "chapter2-grass-delivery-loss-2026-08-17")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")

sys.path.insert(0, LOSS)
sys.path.insert(0, DEFECTS)
sys.path.insert(0, GRASS)

import delivery as L                        # noqa: E402  the instrument, imported and not forked
from delivery import C, D, diagnose as G    # noqa: E402
import scatter                              # noqa: E402

#: The instrument's own defaults, captured before anything rebinds them. `mount_fixture` restores
#: these, because a stale rebind is silent: the two islands carry a different number of capabilities,
#: so the first thing that reads `caps[cell["cap"]]` on the wrong pair raises deep inside the shipped
#: compositor rather than saying which mount was wrong.
ORIGINAL_TESTS = scatter.capability_tests
ORIGINAL_SCATTER = scatter.scatter_island
FIXTURE_UAT = list(D.UAT_CRITERIA)
FIXTURE_ISLAND_PATH = D.ISLAND_PATH


def mount_fixture():
    """The spike fixture every prior appearance judgment on this arc was made against."""
    D.ISLAND_PATH = FIXTURE_ISLAND_PATH
    D.ISLAND, D.LAND_META = D.rebind()
    meta = G.mount()
    D.UAT_CRITERIA = FIXTURE_UAT
    scatter.capability_tests = ORIGINAL_TESTS
    return meta, D.ISLAND


def mount_real():
    """PR #1382's REAL story island - `context-traversal-capture` - on ITS OWN geometry.

    Three rebinds and no restated arithmetic, the move `compose_healthy.use_island` makes:
    `compose_core` reads its island, camera and piece set from module state at CALL time. Two things
    are bound to the real STORY and not to the fixture, or this would be the fixture's decor standing
    on the real island's cells and the measurement would be about neither: `scatter.capability_tests`
    INVENTS a test count from a hash (it says so itself), so it is replaced by the story's own
    contract counts; and the UAT criteria are the story's real ones, so the flowers are 1:1 with real
    criteria (ADR-0226 D4) rather than with six invented ones.
    """
    D.ISLAND_PATH = os.path.join(HEALTHY, "island.json")
    D.ISLAND, D.LAND_META = D.rebind()
    meta = D.use_pieces(os.path.join(GRASS, "pieces-m00-blade"), expect_mix=0.0,
                        expect_geometry="blade")
    real = D.ISLAND
    D.UAT_CRITERIA = real["uatCriteria"]
    tests = [c["tests"] for c in real["capabilities"]]
    scatter.capability_tests = lambda ci, status, seed: tests[ci]
    return meta, real


@contextlib.contextmanager
def positioner(name, candidates=None):
    """Compose with a named positioner, patching the module the callee actually resolves in.

    `diagnose.island_run` calls `scatter.scatter_island` by attribute on the `scatter` MODULE, so the
    patch has to land there and nowhere else. That is the trap PR #1393 walked into twice in the
    opposite direction: making `disperse` an alias for `scatter` left two monkey-patches aimed at the
    ALIAS inert, and both kept printing as though they were working. Patch the canonical module.

    `LEGACY_AFFINE` is `scatter.py`'s own retained pre-2026-08-18 path, proved bit-for-bit equal to
    the deleted code over sixteen island/seed pairs by the dispersion pass's rung 8. It is NOT a
    reimplementation of the defect written here, which would make every "before" number below a
    measurement of my own guess.
    """
    kw = {}
    if name == "legacy":
        kw["positioner"] = scatter.LEGACY_AFFINE
    if candidates is not None:
        kw["candidates"] = candidates
    scatter.scatter_island = functools.partial(ORIGINAL_SCATTER, **kw)
    try:
        yield
    finally:
        scatter.scatter_island = ORIGINAL_SCATTER


@contextlib.contextmanager
def depth_key(which):
    """SHIPPED, or the pre-#1387 key via `delivery.centroid_key` - the instrument's switch, not a
    second copy of the compositor carrying the old rule."""
    if which == "old":
        with L.centroid_key():
            yield
    else:
        yield


# ---------------------------------------------------------------- co-tenancy, the signed axis
def co_tenancy(items, cells):
    """For each placement: how many OTHER placements share its cell, and how far the nearest one is.

    This is the axis the whole attribution turns on, and it is deliberately a COUNT and a GROUND
    DISTANCE rather than anything measured in pixels. A diagnosis that predicts a pixel quantity from
    a pixel quantity can be right for the wrong reason; one that predicts a pixel outcome from a
    plain count of neighbours cannot.
    """
    by_cell = {}
    for i, it in enumerate(items):
        by_cell.setdefault(it["cell"], []).append(i)
    out = []
    for i, it in enumerate(items):
        mates = [j for j in by_cell[it["cell"]] if j != i]
        gx, gy = it["g"]
        near_cell = min((math.hypot(gx - items[j]["g"][0], gy - items[j]["g"][1])
                         for j in mates), default=None)
        same_cap = [j for j, o in enumerate(items) if j != i and o["cap"] == it["cap"]]
        near_cap = min((math.hypot(gx - items[j]["g"][0], gy - items[j]["g"][1])
                        for j in same_cap), default=None)
        out.append({
            "coTenants": len(mates),
            "nearestCoTenantGround": None if near_cell is None else round(near_cell, 2),
            "nearestSameCapabilityGround": None if near_cap is None else round(near_cap, 2),
            "cellArea": round(float(scatter._area(cells[it["cell"]]["poly"])), 1),
        })
    return out


def rate(rows, sel):
    """Zero-delivery rate over a selection, with the co-credited class held out.

    A co-credited placement's pixels ARE on the island; the attribution's tiebreak credited them to a
    colour-identical neighbour. Counting it as loss would overstate every number here, so it is
    subtracted throughout and reported separately.
    """
    got = [rows[i] for i in sel]
    if not got:
        return {"n": 0, "trueZero": 0, "pct": None}
    z = sum(1 for r in got if r["fate"] in (L.OCCLUDED, L.OUTVOTED))
    return {"n": len(got), "trueZero": z, "pct": round(100.0 * z / len(got), 1)}


def corner(meta, caps, label, pos, key, candidates=None):
    """One corner of the 2x2 (or one ablation), fully measured."""
    with positioner(pos, candidates=candidates), depth_key(key):
        run = L.run_captured(meta, caps, label)
        rows = L.per_placement(run)
        prof = L.occluder_profile(run, rows)
    cells = D.prepare(D.ISLAND["variantB"]["cells"])
    tenancy = co_tenancy(run["items"], cells)
    for r, t in zip(rows, tenancy):
        r.update(t)
    n = len(rows)
    zero = [r for r in rows if r["deliveredPx"] == 0]
    true_zero = [r for r in zero if r["fate"] != L.CO_CREDITED]
    fates = {}
    for r in rows:
        fates[r["fate"]] = fates.get(r["fate"], 0) + 1
    return {
        "label": label, "positioner": pos, "depthKey": key,
        "candidates": candidates,
        "placements": n,
        "deliveringNothing": len(zero),
        "deliveringNothingPct": round(100.0 * len(zero) / n, 1),
        "TRULYdeliveringNothing": len(true_zero),
        "TRULYdeliveringNothingPct": round(100.0 * len(true_zero) / n, 1),
        "fates": fates,
        "vegetationPxDelivered": int((run["cls"] == 2).sum()),
        "deliveredIslandPx": int(run["solid"].sum()),
        "medianPxPerSurvivor": int(np.median([r["deliveredPx"] for r in rows
                                              if r["deliveredPx"] > 0])),
        "wellCulled": run["stats"].get("wellCulled"),
        "centroidFallbacks": run["stats"].get("centroidFallbacks"),
        "aboveVsBelowTheCentroid": prof["paintedBeforeItsOwnCell"],
        "whatOwnsAnOccludedPlacementsFootprint":
            prof["whatOwnsAnOccludedPlacementsFootprint"],
    }, rows


def by_co_tenants(rows):
    """THE SIGNED PREDICTION, tabulated: zero-delivery rate against a plain count of co-tenants."""
    buckets = {"0": [], "1": [], "2": [], "3+": []}
    for i, r in enumerate(rows):
        k = str(r["coTenants"]) if r["coTenants"] < 3 else "3+"
        buckets[k].append(i)
    return {k: rate(rows, sel) for k, sel in buckets.items()}


def residual_detail(rows):
    """The surviving zeros, one row each - so 'what is left' is a list and not an adjective."""
    out = []
    for r in rows:
        if r["fate"] in (L.OCCLUDED, L.OUTVOTED):
            out.append({k: r[k] for k in ("i", "kind", "piece", "status", "cell", "fate",
                                          "footprintSS", "ownedSS", "occludedSS",
                                          "blocksTouched", "maxOwnedInABlock",
                                          "coTenants", "nearestCoTenantGround", "cellArea",
                                          "screenX", "screenY")})
    return out


def out_vote_threshold(rows):
    """WHAT THE SURVIVING RESIDUAL IS, said as a THRESHOLD rather than as a magnitude.

    The back half's downsample is a 3x3 majority, so a colour needs **5 of 9** to take a delivered
    pixel. That is a hard, stated boundary and not a tuning knob, which makes it the right shape for
    the second half of this attribution: if every out-voted placement sits BELOW it and every
    placement that reaches it delivers, the residual is the raster's own floor and there is no third
    defect left to find. If some placement owned six of a block and still delivered nothing, there
    would be.

    `maxOwnedInABlock` is the most supersampled pixels a placement still owns in any ONE delivered
    block after the whole composite - so it is measured after occlusion, which is why a placement can
    paint 34 supersampled pixels and reach 4.
    """
    below, above = [], []
    for r in rows:
        (above if r["maxOwnedInABlock"] >= 5 else below).append(r)
    out_voted = [r for r in rows if r["fate"] == L.OUTVOTED]
    delivered_above = [r for r in above if r["fate"] in ("delivered", L.CO_CREDITED)]
    return {
        "theMajorityNeeds": "5 of 9 supersampled pixels in one delivered block",
        "outVotedPlacements": len(out_voted),
        "outVotedMaxOwnedInABlock": sorted(r["maxOwnedInABlock"] for r in out_voted),
        "noOutVotedPlacementReachesTheThreshold":
            all(r["maxOwnedInABlock"] < 5 for r in out_voted),
        "placementsReachingTheThreshold": len(above),
        "ofWhichDeliverOrAreCoCredited": len(delivered_above),
        "everyPlacementReachingItDelivers": len(above) == len(delivered_above),
        "placementsBelowIt": len(below),
        "ofWhichStillDeliver": sum(1 for r in below if r["fate"] == "delivered"),
        "reading": "a placement below the threshold MAY still deliver, because the majority is a "
                   "mode and four can win when the other five are split. Reaching it is what is "
                   "sufficient, and no out-voted placement does.",
    }


def main():
    report = {
        "fence": "every path this pass writes is under docs/research/**; "
                 "LAND_CAMERA_ELEVATION_DEG is neither read nor written",
        "camera": {"elevationDeg": C.ELEV, "supersample": C.SS,
                   "note": "the research track's named parameter, owner look verdict 2026-08-16"},
        "geometries": {},
    }
    all_rows = {}
    for gname, mount in (("fixture", mount_fixture), ("realCorpus", mount_real)):
        meta, isl = mount()
        caps = list(isl["capStatuses"])
        cells = D.prepare(isl["variantB"]["cells"])
        g = {
            "island": ("chapter2-grass-reads-as-signal-2026-08-16/island.json" if gname == "fixture"
                       else "chapter2-healthy-island-2026-08-16/island.json"),
            "storyId": isl.get("storyId"),
            "capabilities": len(caps),
            "cells": len(cells),
            "corners": {},
        }
        for pos in ("legacy", "spread"):
            for key in ("old", "shipped"):
                lab = f"{gname}-{pos}-{key}"
                print(f"  running {lab} ...", flush=True)
                c, rows = corner(meta, caps, lab, pos, key)
                g["corners"][f"{pos}/{key}"] = c
                all_rows[lab] = rows
                print(f"    {c['placements']:4d} placements  "
                      f"{c['TRULYdeliveringNothingPct']:5.1f}% deliver nothing  "
                      f"{c['vegetationPxDelivered']:5d} veg px", flush=True)

        # --- the ablation: hash + area-weighting WITHOUT best-candidate blue noise ---------------
        print(f"  running {gname}-spread-c1 (ablation: no blue noise) ...", flush=True)
        c1, rows_c1 = corner(meta, caps, f"{gname}-spread-c1", "spread", "shipped", candidates=1)
        g["corners"]["spreadNoBlueNoise/shipped"] = c1
        all_rows[f"{gname}-spread-c1"] = rows_c1

        legacy_sh = g["corners"]["legacy/shipped"]["TRULYdeliveringNothingPct"]
        spread_sh = g["corners"]["spread/shipped"]["TRULYdeliveringNothingPct"]
        c1_sh = c1["TRULYdeliveringNothingPct"]
        g["plantsPerCell"] = round(g["corners"]["spread/shipped"]["placements"] / len(cells), 2)
        g["whatEachFixBought"] = {
            "painterOrder_ADR1387": round(g["corners"]["legacy/old"]["TRULYdeliveringNothingPct"]
                                          - legacy_sh, 1),
            "dispersion_PR1393_total": round(legacy_sh - spread_sh, 1),
            "ofWhich_theDiagonalAndAreaWeighting": round(legacy_sh - c1_sh, 1),
            "ofWhich_bestCandidateBlueNoise": round(c1_sh - spread_sh, 1),
            "residual": spread_sh,
            "unit": "percentage points of placements delivering zero pixels",
        }
        g["theSignedPrediction"] = {
            "axis": "co-tenants of the placement's own cell (a COUNT, no pixel quantity in it)",
            "legacy": by_co_tenants(all_rows[f"{gname}-legacy-shipped"]),
            "spread": by_co_tenants(all_rows[f"{gname}-spread-shipped"]),
        }
        g["residualDetail"] = residual_detail(all_rows[f"{gname}-spread-shipped"])
        g["theOutVoteThreshold"] = out_vote_threshold(all_rows[f"{gname}-spread-shipped"])
        occ = g["corners"]["spread/shipped"]["whatOwnsAnOccludedPlacementsFootprint"]
        g["whatTheResidualIS"] = {
            "trueZeros": g["corners"]["spread/shipped"]["TRULYdeliveringNothing"],
            "occluded": {"total": sum(occ.values()), "byWhat": occ,
                         "reading": "ownCellsFill is ZERO - the fixed defect. What remains is a "
                                    "plant genuinely standing behind a nearer raised cell, a wall, "
                                    "or another plant, which is correct 2.5D occlusion and not a "
                                    "defect to remove."},
            "outVoted": {"total": g["theOutVoteThreshold"]["outVotedPlacements"],
                         "reading": "the raster's own quantisation floor - the SIZE question this "
                                    "arc already has open, not a new bug."},
        }
        report["geometries"][gname] = g

    # --- the cross-island claim, which is the one that could have failed loudly -------------------
    fx, rl = report["geometries"]["fixture"], report["geometries"]["realCorpus"]
    report["theCrossIslandClaim"] = {
        "claim": "the two islands differ in what the dispersion fix bought BECAUSE they differ in "
                 "plants per cell, and in nothing else the pipeline knows about",
        "fixture": {"plantsPerCell": fx["plantsPerCell"],
                    "dispersionBought": fx["whatEachFixBought"]["dispersion_PR1393_total"]},
        "realCorpus": {"plantsPerCell": rl["plantsPerCell"],
                       "dispersionBought": rl["whatEachFixBought"]["dispersion_PR1393_total"]},
        "densityRatio": round(rl["plantsPerCell"] / fx["plantsPerCell"], 2),
    }
    report["theHeadline"] = {
        "quotedRate17_2": rl["corners"]["legacy/shipped"]["TRULYdeliveringNothingPct"],
        "quotedRateAsPublished": 17.2,
        "todaysRate": rl["corners"]["spread/shipped"]["TRULYdeliveringNothingPct"],
        "fixtureToday": fx["corners"]["spread/shipped"]["TRULYdeliveringNothingPct"],
        "reading": "17.2% was measured on the affine-CRC32 placements PR #1393 replaced the next "
                   "morning. On today's positioner the real-corpus island is at or below the "
                   "fixture, so the 'more than twice the fixture' gap is absent rather than "
                   "explained. The committed order-and-caps README table was never updated when "
                   "that PR re-ran its own report; the report JSON already carries these numbers.",
    }
    with open(os.path.join(HERE, "residual-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    print("\nwrote residual-report.json")
    print(json.dumps(report["theHeadline"], indent=1))
    print(json.dumps(report["theCrossIslandClaim"], indent=1))
    return report


if __name__ == "__main__":
    main()
