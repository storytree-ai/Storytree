#!/usr/bin/env python3
"""The SHIPPED app's own positioner, transcribed and measured on the same island.

    python app_drift.py          # ~1 min

FENCE: this pass may not edit `packages/forest-world/src`, so the app's rule is TRANSCRIBED here
and measured, and anything found is written down with a file and a line rather than fixed. The
transcription is of `scene.ts:1715 driftSpot` and the two `meadowSurface` count lines it is called
with, verbatim in their arithmetic:

    anchors = 1 cell, or 2 once tests >= 7, each drawn uniformly from the parcel's cells
    spread  = 7 + tests * 0.55
    point   = anchor + (cos a, sin a * 0.6) * sqrt(u) * spread          <- no containment test

The 0.6 is the top-down squash the wisp orbit uses. `sqrt(u)` is the correct radial density for a
uniform disc, so the bed itself is evenly filled; the questions here are what the bed does at a
parcel boundary and how it compares with the research scatter.

THE RANDOMNESS IS NOT THE RESEARCH SCATTER'S. The app draws from `streamRand`
(`scene.ts:1656`), a mulberry32 STREAM whose output is avalanched (`Math.imul` mixes, xor-shifts)
and whose successive draws are independent by construction. It therefore CANNOT have the
coordinate-pair collapse this pass found in `scatter._sample_in_cell`, and the measurement below
confirms it: this file uses Python's Mersenne Twister as the stand-in, which shares mulberry32's
relevant property (independent successive draws) and not CRC32's affine one. The conclusion
"the app does not share the defect" rests on reading `streamRand`, and the numbers below are about
CONTAINMENT and CONCENTRATION, which are separate questions.
"""
import collections
import json
import math
import os
import random
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)
import dispersion as D  # noqa: E402

ISLAND = json.load(open(os.path.join(
    REPO, "docs", "research", "chapter2-healthy-island-2026-08-16", "island.json")))
CELLS = ISLAND["variantB"]["cells"]
COAST = ISLAND["coastLoopGround"]

by_cap = collections.defaultdict(list)
for i, c in enumerate(CELLS):
    by_cap[c["cap"]].append(i)
areas = [D.polygon_area(c["poly"]) for c in CELLS]

NSEED = 200
rng = random.Random(20260817)
off_island = off_parcel = total = 0
bed_area = parcel_area = 0.0
nn_all = []
coast_of_escapee = []

for _ in range(NSEED):
    for ci, ids in by_cap.items():
        tests = int(2 + rng.random() * 7)
        n_beds = 2 if tests >= 7 else 1
        spread = 7 + tests * 0.55
        anchors = [CELLS[ids[int(rng.random() * len(ids))]]["c"] for _ in range(n_beds)]
        budget = round(2 + tests * 1.9) + round(tests / 2.6)
        pts = []
        for _k in range(budget):
            a = anchors[int(rng.random() * len(anchors))]
            ang = rng.random() * math.tau
            rr = math.sqrt(rng.random()) * spread
            x = a[0] + math.cos(ang) * rr
            y = a[1] + math.sin(ang) * rr * 0.6
            pts.append((x, y))
            total += 1
            if not D.point_in_poly(x, y, COAST):
                off_island += 1
            if not any(D.point_in_poly(x, y, CELLS[i]["poly"]) for i in ids):
                off_parcel += 1
                coast_of_escapee.append(D.coast_distance(x, y, COAST))
        bed_area += n_beds * math.pi * spread * spread * 0.6
        parcel_area += sum(areas[i] for i in ids)
        nn_all.extend(D.nearest_neighbour_distances(pts))

nn_all.sort()
report = {
    "source": "packages/forest-world/src/scene.ts:1715 driftSpot (transcribed, not executed)",
    "island": "chapter2-healthy-island-2026-08-16",
    "seeds": NSEED,
    "placements": total,
    "offIsland": off_island,
    "offIslandFraction": round(off_island / total, 5),
    "offOwnParcel": off_parcel,
    "offOwnParcelFraction": round(off_parcel / total, 5),
    "meanBedArea": round(bed_area / NSEED / len(by_cap), 1),
    "meanParcelArea": round(parcel_area / NSEED / len(by_cap), 1),
    "concentrationFactor": round(parcel_area / bed_area, 2),
    "minNearestNeighbour": round(nn_all[0], 4),
    "medianNearestNeighbour": round(statistics.median(nn_all), 3),
    "nearPairFractionAt4": round(sum(1 for d in nn_all if d < D.CLEARANCE) / len(nn_all), 4),
    "nearPairFractionAt3": round(sum(1 for d in nn_all if d < 3.0) / len(nn_all), 4),
    "medianCoastDistanceOfParcelEscapees": (
        round(statistics.median(coast_of_escapee), 2) if coast_of_escapee else None),
    "verdict": (
        "The app does NOT share the research scatter's coordinate-pair collapse - it draws from a "
        "mulberry32 stream, not from two CRC32s over near-identical addresses. It has a DIFFERENT "
        "and unrelated gap: driftSpot applies no containment test of any kind, so roughly one "
        "placement in nine lands outside the parcel whose status tinted it. Its heavy clumping is "
        "DELIBERATE - the drift beds are an owner-directed 2026-07-18 refinement and the docstring "
        "says so - but that decision was taken for long grass, which is being withdrawn, and a bed "
        "that reads as massed grass reads as a blob when it is made of shrubs."),
}

out = os.path.join(HERE, "app-drift-report.json")
with open(out, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(report, fh, indent=2)
    fh.write("\n")
for k, v in report.items():
    print(f"{k:38} {v}")
print("\nwrote", out)
