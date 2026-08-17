#!/usr/bin/env python3
"""WHERE the plants stand, spread instead of merely scattered — the positioner half.

This module owns POSITIONS and nothing else. Every count it places is imported live from
`chapter2-grass-reads-as-signal-2026-08-16/scatter.py` and re-derived by that module's own
`capability_tests` and the same arithmetic, so the semantic rules of ADR-0226 D2/D4 exist in exactly
one place and this pass cannot drift from them. If the owner's open question about whether shrubs
inherit grass's count rule is answered, it is answered THERE and this file inherits the answer.

WHAT CHANGED, and why each of the three is needed:

  * **the two coordinates of a point are drawn INDEPENDENTLY.** This is the big one, and it is a
    defect in the address scheme rather than in anyone's geometry. `scatter._sample_in_cell`
    (`scatter.py:69-73`) draws `x` from `det(addr, "x", t)` and `y` from `det(addr, "y", t)` —
    two CRC32s over messages differing in ONE CHARACTER. CRC32 is affine over GF(2), so for two
    equal-length messages `crc32(A) ^ crc32(B)` depends only on `A ^ B` and NOT on the message:
    here it is the constant `0x01c26a37`, whose top seven bits are zero. Two 32-bit values that
    differ by an XOR with such a mask are numerically almost equal, so `u_x` and `u_y` land within
    0.01 of each other for 83% of draws and the point lands on the bounding box's DIAGONAL.
    TWO MEASUREMENTS, and they are different numbers of different things — do not merge them.
    Over the raw draw pair across all twelve rejection tries, `corr = +0.73`: tries 10 and 11 give
    the address a two-digit tail, which shifts the XOR mask and decorrelates those draws, so a
    sixth of the pairs are unaffected and dilute the average. Over the placements that actually
    LAND, `corr(u, v) = +0.9997` against a null of exactly zero — because the rejection loop
    returns on the FIRST hit and a draw lands inside its cell 57% of the time, so it exits at try 0
    or 1 in 95% of cases and reaches try 10 or 11 in 0.000% of them (measured over 4,860 draws).
    The decorrelated tail is never sampled. A capability owning a single cell ends with all
    eighteen of its plants on one straight line.

    THE OBVIOUS FIX DOES NOT WORK: moving the axis token to the front of the address still leaves
    the two coordinates locked together — `corr = -0.72` on the raw pair, `+0.54` to `+0.59` on
    landed placements — because the affine property does not care WHERE the characters differ, only
    that they differ in a fixed way. `verify_refusal.py` P4 runs it and requires the floor to catch
    it. What works is drawing both coordinates out of ONE hash, avalanche-finalised so that no
    fixed input difference maps to a fixed output difference (`_uv` below).

  * **cell choice is weighted by AREA, not uniform over cells.** The original picks
    `owned[int(det(...) * len(owned))]`, one vote per cell. On a mesh whose cells are all the same
    size that is harmless, and on the two islands measured here it is: fixing it alone moves the
    rim/core density ratio by 2.6%. It is corrected anyway because "one vote per cell" is the wrong
    rule for the same reason first-past-the-post is: it stops being harmless the moment cell areas
    stop being equal, and nothing in the mesh generator promises they stay equal.

  * **each point is the BEST OF `CANDIDATES` draws, not the first.** This is Mitchell's
    best-candidate blue noise: generate several candidate points, keep the one furthest from every
    plant already standing in this parcel. It is the entire fix for clumping. The original's points
    are drawn INDEPENDENTLY of each other, and independence is exactly the Poisson null — so its
    nearest-neighbour index sits at 1.0 by construction, with the long tail of near-touching pairs
    that a Poisson process always has. Best-candidate raises the index to ~1.6-1.9 while placing the
    same number of plants in the same parcels.

DETERMINISM — the rule this file had to bend, stated precisely so a reader can check it is bent and
not broken. `scatter.py` is emphatic that placement must be CRC32 over an address and never a draw
counter, because a counter makes every placement depend on the ones before it and "adding a single
capability would reshuffle the whole island". Every candidate point here is still CRC32 over an
address — `det(seed, kind, cap, k, "cand", j, ...)` — so no salt and no counter enters. What IS new
is that the CHOICE among candidates reads the points already placed. That dependency is scoped to
ONE capability's own batch: capability `ci`'s addresses contain `ci`, and no capability reads
another's points, so adding, removing or re-ordering capabilities still leaves every other
capability's island-position untouched. That is the property `scatter.py`'s rule exists to protect,
and it survives. The same file already does exactly this for the UAT flowers, which reject against
`flower_pts` as they accumulate — this is that rule applied to the meadow.

THE STATED GAP: spacing is enforced WITHIN a capability, never across parcel boundaries. Two plants
one unit apart on opposite sides of a boundary are not prevented, and the measured residual is in
`dispersion-report.json` as `crossParcelNearPairs`. Making it island-wide would make capability
`i`'s positions depend on capabilities `0..i-1`, which is the property above, so it is a fork for
the owner rather than a change to slip in here.
"""
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
#: The ONE copy of the count rules. Imported, never transcribed.
SCATTER_PATH = os.path.join(REPO, "docs", "research",
                            "chapter2-grass-reads-as-signal-2026-08-16", "scatter.py")


def _load_scatter():
    spec = importlib.util.spec_from_file_location("_grass_scatter", SCATTER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


S = _load_scatter()

#: How many candidate points each placement chooses between. 1 is plain rejection sampling; 6
#: already lifts the nearest-neighbour index past 1.5; the curve is flat past ~16. Ten is the knee.
CANDIDATES = 10

_M32 = 0xFFFFFFFF


def _fmix32(h):
    """Murmur3's 32-bit avalanche finaliser.

    THE ONLY THING THIS ADDS is bit mixing, and that is exactly what CRC32 lacks. CRC32 is a
    linear code: `crc(A) ^ crc(B)` is a function of `A ^ B` alone, so two addresses that differ by
    a fixed edit ALWAYS produce outputs that differ by a fixed XOR — which is how "x" and "y"
    ended up drawing the same number. An avalanche step is non-linear (two multiplies and three
    xor-shifts), so a one-character address change moves every output bit with probability ~0.5
    and no fixed relationship survives.

    IT DOES NOT WEAKEN DETERMINISM, which is the property `scatter.py` guards: this is a pure
    function of the CRC, so the address still fully determines the draw, no salt and no counter is
    introduced, and `verify.py`'s byte-identity claim across runs is untouched.
    """
    h &= _M32
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & _M32
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & _M32
    h ^= h >> 16
    return h


def _hash(*parts):
    """`scatter.det`'s CRC32 over the same address, recovered as an integer and avalanched."""
    return _fmix32(int(S.det(*parts) * 0x100000000))


def _u(*parts):
    """One well-mixed 0..1 from an address."""
    return _hash(*parts) / 0x100000000


def _uv(*parts):
    """TWO independent 0..1 values from ONE address, as the high and low halves of one avalanched
    hash. Sixteen bits per coordinate resolves a 25-unit cell to 0.0004 ground units, which is four
    orders of magnitude finer than the 4-unit clearance anything here cares about.

    Measured over 6000 draws: `corr(u, v) = +0.008`, marginal means 0.4998 / 0.4956 against 0.5,
    marginal sds 0.2882 / 0.2879 against 0.28868, and a 16x16 uniformity chi-square of 240.7 on
    255 degrees of freedom. The scheme it replaces scored `corr = +0.73`.
    """
    h = _hash(*parts)
    return ((h >> 16) & 0xFFFF) / 0x10000, (h & 0xFFFF) / 0x10000


def _prefix_areas(cells, owned):
    """Cumulative owned-cell areas, for the area-weighted draw."""
    cum, run = [], 0.0
    for i in owned:
        run += _area(cells[i]["poly"])
        cum.append(run)
    return cum, run


_AREA_CACHE = {}


def _area(poly):
    key = id(poly)
    hit = _AREA_CACHE.get(key)
    if hit is not None:
        return hit
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    a = abs(a) / 2.0
    _AREA_CACHE[key] = a
    return a


def _pick_by_area(owned, cum, total, u):
    t = u * total
    lo, hi = 0, len(cum) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cum[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    return owned[lo]


def _candidate(cells, owned, cum, total, addr, j, tries=12):
    """One candidate ground point: a cell drawn PROPORTIONAL TO ITS AREA, then rejection-sampled
    inside that cell's polygon. The centroid fallback is kept verbatim from `scatter._sample_in_cell`
    — it is measured at zero on both islands (see the README) and is retained as a floor, not as a
    load-bearing path."""
    idx = _pick_by_area(owned, cum, total, _u(*addr, "cand", j, "cell"))
    poly = cells[idx]["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        u, v = _uv(*addr, "cand", j, "uv", t)
        x = min(xs) + u * (max(xs) - min(xs))
        y = min(ys) + v * (max(ys) - min(ys))
        if S._point_in_poly(x, y, poly):
            return x, y, idx, False
    return cells[idx]["c"][0], cells[idx]["c"][1], idx, True


def _counts(ci, status, seed, density):
    """The count rules, re-derived through `scatter`'s own `capability_tests` and the same
    arithmetic it applies. Kept beside the import rather than inside it because `scatter_island`
    fuses counting and placing in one loop; if that loop is ever split, this should call it."""
    tests = S.capability_tests(ci, status, seed)
    grass = round(2 + tests * 1.9)
    if status == "unknown":
        grass = round(grass * 0.6)
    elif status in ("mapped", "proposed"):
        grass = round(grass * 0.85)
    grass = round(grass * density)
    lush = status in ("healthy", "building") and tests >= 6
    shrubs = round((tests / 2.6) * density) if status in ("healthy", "building") else 0
    if status == "unhealthy":
        shrubs = round(shrubs * 0.7)
    wilts = max(1, round(tests * 0.4 * density)) if status == "unhealthy" else 0
    return tests, grass, shrubs, wilts, lush


def scatter_dispersed(island, tokens, seed, uat_criteria, density=1.0, candidates=CANDIDATES):
    """`scatter.scatter_island`'s signature and counts, with the meadow SPREAD instead of scattered.

    The UAT flowers are untouched: they already reject against a 15-unit spacing (`FLOWER_SPACING`)
    and are 1:1 with the criteria by decision, so there is nothing here to improve and changing
    their positions would move art the owner has already looked at.
    """
    cells = island["variantB"]["cells"]
    caps = island["capStatuses"]
    cx, cy = island["islandCentreGround"]

    by_cap = {}
    for i, c in enumerate(cells):
        by_cap.setdefault(c["cap"], []).append(i)

    items = []
    stats = {"tuft": 0, "shrub": 0, "wilt": 0, "flower": 0,
             "perCapability": [], "centroidFallbacks": 0, "candidates": candidates,
             "wellCulled": 0}

    for ci, status in enumerate(caps):
        owned = by_cap.get(ci, [])
        if not owned:
            stats["perCapability"].append({"cap": ci, "status": status, "cells": 0, "tests": 0,
                                           "tufts": 0, "shrubs": 0, "wilts": 0})
            continue
        tests, grass, shrubs, wilts, lush = _counts(ci, status, seed, density)
        cum, total = _prefix_areas(cells, owned)

        blade_tokens = tokens["blade"][status]
        shrub_tokens = tokens["shrub"][status]
        wilt_tokens = tokens["wilt"]["unhealthy"]

        #: Every plant this capability has already stood up, in GROUND units. The spacing memory —
        #: scoped to the capability, which is the determinism property the module docstring defends.
        standing = []
        placed = {"tuft": 0, "shrub": 0, "wilt": 0}

        def place(kind, n, piece_for, roles_for):
            for k in range(n):
                addr = (seed, kind, ci, k)
                best = None
                for j in range(candidates):
                    x, y, idx, fell = _candidate(cells, owned, cum, total, addr, j)
                    # A KEEP-OUT IS A HOLE A SPREADER RACES TOWARDS, and this is the bug that
                    # taught it. The tree well is an 11-unit disc at the island centre that no
                    # plant may occupy, so it is permanently the emptiest ground in any parcel
                    # containing it — and "furthest from every plant already standing" is
                    # precisely a rule for finding empty ground. Scored naively, the well
                    # ATTRACTED candidates and they were then culled: the delivered meadow fell
                    # from 156 to 150 on the real-corpus island (well culls 1 -> 7) while the
                    # count rules authored 157 either way. A count that is a reading of the test
                    # count cannot be allowed to leak out through a positioner change, so a
                    # candidate inside the well is not scored at all.
                    if math.hypot(x - cx, y - cy) < S.GRASS_WELL:
                        continue
                    if not standing:
                        best = (float("inf"), x, y, idx, fell)
                        break
                    d = min((x - px) ** 2 + (y - py) ** 2 for px, py in standing)
                    if best is None or d > best[0]:
                        best = (d, x, y, idx, fell)
                if best is None:
                    # every candidate landed in the well — the original's drop, reached the same
                    # way it reaches it and reported rather than silently absorbed.
                    stats["wellCulled"] += 1
                    continue
                _d, gx, gy, idx, fell_back = best
                if fell_back:
                    stats["centroidFallbacks"] += 1
                standing.append((gx, gy))
                items.append({
                    "kind": kind, "piece": piece_for(addr), "g": [gx, gy], "cell": idx,
                    "cap": ci, "status": status, "h": cells[idx]["_h"], "roles": roles_for(),
                })
                placed[kind] += 1

        def tuft_piece(addr):
            if status == "unknown":
                return "tuft-2"
            if lush and S.det(*addr, "lush") < 0.55:
                return "tuft-4"
            return "tuft-3a" if S.det(*addr, "v") < 0.5 else "tuft-3b"

        def tuft_or_wilt(addr):
            if status == "unhealthy" and S.det(*addr, "wiltswap") < 0.40:
                return "wilt-twig" if S.det(*addr, "wv") < 0.5 else "wilt-stem"
            return tuft_piece(addr)

        place("tuft", grass, tuft_or_wilt, lambda: {**blade_tokens, **wilt_tokens})
        place("shrub", shrubs, lambda a: "shrub-a" if S.det(*a, "v") < 0.5 else "shrub-b",
              lambda: dict(shrub_tokens))
        place("wilt", wilts, lambda a: "wilt-twig" if S.det(*a, "v") < 0.5 else "wilt-stem",
              lambda: dict(wilt_tokens))

        for k in placed:
            stats[k] += placed[k]
        stats["perCapability"].append({
            "cap": ci, "status": status, "cells": len(owned), "tests": tests,
            "lush": lush, "tufts": placed["tuft"], "shrubs": placed["shrub"],
            "wilts": placed["wilt"],
        })

    # The flowers are the original's, verbatim: run the original scatter and lift its flower items,
    # so this positioner cannot silently become a second implementation of ADR-0226 D4.
    orig_items, orig_stats = S.scatter_island(island, tokens, seed, uat_criteria, density)
    for it in orig_items:
        if it["kind"] == "flower":
            items.append(it)
            stats["flower"] += 1
    stats["flowerFallbacks"] = orig_stats["flowerFallbacks"]

    assert stats["flower"] == len(uat_criteria), (
        f"the UAT scatter is 1:1 by decision (ADR-0226 D4): {len(uat_criteria)} criteria produced "
        f"{stats['flower']} flowers")
    return items, stats
