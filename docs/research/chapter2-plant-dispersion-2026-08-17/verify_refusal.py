#!/usr/bin/env python3
"""MAKE THE FLOOR FIRE — because a green floor that cannot go red is worth nothing.

    python verify_refusal.py         # ~2 min

`verify.py` reports fourteen green rungs. This file is what makes that green mean something, by
feeding each rung the thing it exists to catch and REQUIRING it to catch it.

The perturbations are not invented defects. Each one is a real state the code was in:

  P1  the ORIGINAL positioner, unmodified, imported live from
      `chapter2-grass-reads-as-signal-2026-08-16/scatter.py`. This is the code that produced every
      committed picture on this arc, and it must trip rungs 1, 2 and 3. It is the load-bearing
      perturbation: the others are ablations of the fix, this one is the shipped state.
  P2  the fix WITHOUT the avalanche finaliser - two raw CRC32 draws for x and y, everything else
      the new positioner. Isolates the coordinate-pair collapse from the blue noise, and proves
      rung 1 is measuring the hash and not the spacing.
  P3  the fix WITHOUT best-candidate (`candidates=1`). Isolates the blue noise from the hash, and
      proves rung 3 is measuring the spacing and not the hash.
  P4  the axis token moved to the FRONT of the address instead of drawing both coordinates from one
      hash - the obvious fix that does not work. Must trip rung 1: CRC32's affine property does not
      care where in the message the characters differ, so the coordinates stay locked together
      (`|corr| = 0.54-0.59`) and only the WIDTH of the band changes.
      IT IS EXPECTED TO TRIP RUNG 1 AND NOT RUNG 2, and that asymmetry is why both rungs exist.
      Rung 2 counts placements within 0.02 of the diagonal, so it is a detector for the TIGHT band
      the original produces (100%, against a 3.96% null). P4's band is loose - 6.9% on the fixture
      island, under the 7% limit - so rung 2 lets it through and rung 1, which is a signed
      correlation and cares about any linear relationship at any width, catches it at 25 standard
      deviations. Rung 1 is the load-bearing test; rung 2 exists because it is the one a reader can
      picture, and this pair is the evidence that it must never be the only one. The first draft of
      this file expected rung 2 to fire here and recorded a MISS; the expectation was wrong, not
      the rung.
  P5  best-candidate scoring the tree well like ordinary ground - the bug this pass hit and fixed.
      Must trip rung 5, because it leaks delivered plants out of a semantic count.

TWO RULES, inherited from the prior passes' own mistakes:
  * a fire counts ONLY when the named rung is the one that failed. A perturbation that raises an
    ImportError, or that trips some other rung, has not exercised anything.
  * every perturbation runs the REAL rung code from `verify.py`'s module, never a re-implementation
    of the check, so a rung that is quietly wrong here is quietly wrong there too.
"""
import collections
import json
import math
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import dispersion as D          # noqa: E402
import disperse as X            # noqa: E402
import verify as V              # noqa: E402

S = X.S
UAT = V.UAT
TOKENS = V.TOKENS
SEEDS = ["refusal-%d" % i for i in range(12)]
ISLANDS = {k: V.load(v) for k, v in V.ISLANDS.items()}


# ------------------------------------------------------------------ the perturbations
def p1_original(island, seed):
    """The shipped positioner, untouched."""
    return S.scatter_island(island, TOKENS, seed, UAT, 1.0)[0]


def _with_candidate(fn):
    """Swap `disperse._candidate` for the duration of one run, and put it back."""
    def run(island, seed, **kw):
        real = X._candidate
        X._candidate = fn
        try:
            return X.scatter_dispersed(island, TOKENS, seed, UAT, 1.0, **kw)[0]
        finally:
            X._candidate = real
    return run


def _raw_crc_candidate(cells, owned, cum, total, addr, j, tries=12):
    """P2: the new positioner drawing x and y from two RAW CRC32s, as `scatter` does."""
    idx = X._pick_by_area(owned, cum, total, S.det(*addr, "cand", j, "cell"))
    poly = cells[idx]["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        x = min(xs) + S.det(*addr, "cand", j, "x", t) * (max(xs) - min(xs))
        y = min(ys) + S.det(*addr, "cand", j, "y", t) * (max(ys) - min(ys))
        if S._point_in_poly(x, y, poly):
            return x, y, idx, False
    return cells[idx]["c"][0], cells[idx]["c"][1], idx, True


def _axis_first_candidate(cells, owned, cum, total, addr, j, tries=12):
    """P4: the obvious fix - move the axis token to the front so the difference is 'far' from the
    end of the message. It does not work, and this proves it rather than asserting it."""
    idx = X._pick_by_area(owned, cum, total, S.det(*addr, "cand", j, "cell"))
    poly = cells[idx]["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        x = min(xs) + S.det("x", *addr, "cand", j, t) * (max(xs) - min(xs))
        y = min(ys) + S.det("y", *addr, "cand", j, t) * (max(ys) - min(ys))
        if S._point_in_poly(x, y, poly):
            return x, y, idx, False
    return cells[idx]["c"][0], cells[idx]["c"][1], idx, True


def p5_well_scored_as_ground(island, seed):
    """P5: best-candidate allowed to prefer the tree well, which then culls the plant."""
    cells = island["variantB"]["cells"]
    cx, cy = island["islandCentreGround"]
    by_cap = collections.defaultdict(list)
    for i, c in enumerate(cells):
        by_cap[c["cap"]].append(i)
    items = []
    for ci, status in enumerate(island["capStatuses"]):
        owned = by_cap.get(ci, [])
        if not owned:
            continue
        _t, grass, shrubs, wilts, _l = X._counts(ci, status, seed, 1.0)
        cum, total = X._prefix_areas(cells, owned)
        standing = []
        for kind, n in (("tuft", grass), ("shrub", shrubs), ("wilt", wilts)):
            for k in range(n):
                addr = (seed, kind, ci, k)
                best = None
                for j in range(X.CANDIDATES):
                    x, y, idx, _f = X._candidate(cells, owned, cum, total, addr, j)
                    if not standing:
                        best = (float("inf"), x, y, idx)
                        break
                    d = min((x - px) ** 2 + (y - py) ** 2 for px, py in standing)
                    if best is None or d > best[0]:
                        best = (d, x, y, idx)
                _d, gx, gy, idx = best
                if math.hypot(gx - cx, gy - cy) < S.GRASS_WELL:
                    continue                       # the leak
                standing.append((gx, gy))
                items.append({"kind": kind, "g": [gx, gy], "cell": idx, "cap": ci})
    return items


PERTURBATIONS = [
    ("P1 the shipped positioner (scatter.py, unmodified)", p1_original, (1, 2, 3)),
    ("P2 the fix minus the avalanche finaliser (two raw CRC32 draws)",
     lambda i, s: _with_candidate(_raw_crc_candidate)(i, s), (1, 2)),
    ("P3 the fix minus best-candidate (candidates=1)",
     lambda i, s: X.scatter_dispersed(i, TOKENS, s, UAT, 1.0, candidates=1)[0], (3,)),
    # rung 1 only, deliberately - see the module docstring on why rung 2 is blind to a loose band
    ("P4 the obvious wrong fix (axis token moved to the front of the address)",
     lambda i, s: _with_candidate(_axis_first_candidate)(i, s), (1,)),
    ("P5 the tree well scored as ordinary ground (the bug this pass hit)",
     p5_well_scored_as_ground, (5,)),
]


# ------------------------------------------------------------------ run every rung, on each
def rungs(island, seed_items, island_name, seed_list):
    """Evaluate every numbered rung of `verify.py` against a supplied set of item lists. Returns
    {rung number: (ok, detail)}. The thresholds are READ FROM `verify`, never restated."""
    cells = island["variantB"]["cells"]
    ms, uv_pool = [], []
    for items, seed in zip(seed_items, seed_list):
        by_cap = collections.defaultdict(list)
        placements = []
        for it in items:
            if it["kind"] in ("tuft", "shrub", "wilt"):
                by_cap[it["cap"]].append((it["g"][0], it["g"][1]))
                placements.append((it["g"][0], it["g"][1], it["cell"]))
        m = D.measure(island, dict(by_cap), placements)
        m["_delivered"] = len(placements)
        m["_authored"] = V.authored_meadow(island, seed)
        uv_pool.extend(D.axis_uv(placements, cells))
        worst = None
        for row in m["perCapability"]:
            if row["overload"] is None or row["placements"] < 2 or row["overload"] > 1.0:
                continue
            nn = D.nearest_neighbour_distances(by_cap[row["cap"]])
            if nn and (worst is None or min(nn) < worst):
                worst = min(nn)
        m["_roomyMinNN"] = worst
        ms.append(m)

    ax = abs(D.correlation(uv_pool))
    dg = sum(1 for u, v in uv_pool if abs(u - v) <= 0.02) / len(uv_pool)
    ce = statistics.mean(m["clarkEvansPerCapabilityMean"] for m in ms
                         if m["clarkEvansPerCapabilityMean"] is not None)
    roomy = [m["_roomyMinNN"] for m in ms if m["_roomyMinNN"] is not None]
    mn = min(roomy) if roomy else float("inf")
    counts_ok = all(m["_delivered"] == m["_authored"] for m in ms)
    coin = max(m["coincidentGroups"] for m in ms)
    nn_p = sum(m["conditionedCounts"]["nearPlacements"] for m in ms)
    na_p = sum(m["conditionedCounts"]["nearArea"] for m in ms)
    fn_p = sum(m["conditionedCounts"]["farPlacements"] for m in ms)
    fa_p = sum(m["conditionedCounts"]["farArea"] for m in ms)
    cond = (nn_p / na_p) / (fn_p / fa_p) if (na_p and fn_p and fa_p) else 1.0
    return {
        1: (ax <= V.AXIS_CORRELATION_MAX, f"|corr(u,v)|={ax:.4f}"),
        2: (dg <= V.DIAGONAL_FRACTION_MAX, f"onDiagonal={dg:.4f}"),
        3: (ce >= V.CLARK_EVANS_MIN, f"clarkEvans={ce:.3f}"),
        4: (mn >= V.MIN_NEAREST_NEIGHBOUR, f"minNN={mn:.3f}"),
        5: (counts_ok, "delivered==authored" if counts_ok else
            f"delivered {ms[0]['_delivered']} vs authored {ms[0]['_authored']}"),
        6: (coin == 0, f"coincidentGroups={coin}"),
        7: (V.CONDITIONED_RATIO[0] <= cond <= V.CONDITIONED_RATIO[1], f"conditioned={cond:.3f}"),
    }


results = []
missed = []
print()
for label, fn, expect in PERTURBATIONS:
    print(f"{label}")
    for iname, island in ISLANDS.items():
        items = [fn(island, s) for s in SEEDS]
        r = rungs(island, items, iname, SEEDS)
        fired = sorted(n for n, (ok, _) in r.items() if not ok)
        got = [n for n in expect if not r[n][0]]
        ok = set(expect) <= set(fired)
        detail = "  ".join(f"rung{n}:{r[n][1]}" for n in sorted(r))
        print(f"   [{iname:<7}] expected rungs {list(expect)} to fire, fired {fired}"
              f"  ->  {'CAUGHT' if ok else 'MISSED'}")
        print(f"             {detail}")
        results.append({"perturbation": label, "island": iname,
                        "expectedToFire": list(expect), "actuallyFired": fired,
                        "caught": ok,
                        "values": {str(n): r[n][1] for n in sorted(r)}})
        if not ok:
            missed.append(f"{label} [{iname}]: expected {list(expect)}, fired {fired}")
    print()

out = os.path.join(HERE, "verify-refusal-report.json")
with open(out, "w", encoding="utf-8", newline="\n") as fh:
    json.dump({"seeds": SEEDS, "results": results}, fh, indent=2)
    fh.write("\n")
print("wrote", out)

if missed:
    print(f"\nREFUSAL HARNESS: RED - {len(missed)} perturbations were NOT caught")
    for m in missed:
        print("  x", m)
    sys.exit(1)
print(f"\nREFUSAL HARNESS: GREEN - all {len(results)} perturbation/island pairs tripped the rung "
      f"they were built to trip. The floor is not vacuous.")
