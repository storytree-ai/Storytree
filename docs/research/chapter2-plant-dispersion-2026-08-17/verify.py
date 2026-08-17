#!/usr/bin/env python3
"""THE DISPERSION FLOOR — the property this pass adds so nobody has to eyeball it again.

    python verify.py            # ~90 s, renders nothing, needs no Blender and no network

Every check below is run against BOTH islands and against a declared list of seeds, not one draw,
so a green here is a statement about the positioner and not about a lucky picture.

WHAT EACH RUNG IS FOR — and read the two classes apart, because they earn their thresholds
differently:

  FIXES (these FAILED before this pass and pass after; `verify_refusal.py` proves the failure):
    1. axis independence      the two coordinates of a placement must be uncorrelated within their
                              cell's bounding box. THE NULL IS EXACTLY ZERO and needs no negotiated
                              threshold; the tolerance is only sampling noise.
    2. no diagonal band       the share of placements within 0.02 of the bbox diagonal must be near
                              the 3.96% two independent draws produce, not the 100% a collapsed
                              coordinate pair produces.
    3. dispersion index       the nearest-neighbour index, averaged per capability, must clear 1.35.
                              1.0 is a uniform-random scatter; the threshold sits between the two
                              positioners' measured values with margin on both sides.
    4. no touching plants     the closest pair on the island must be at least 1.0 ground units
                              apart, against a shrub that is 9-14 units across.

  FENCES (these already held and are asserted so they cannot silently stop holding):
    5. counts unchanged       the delivered meadow must equal the count rules' own total. This is
                              the ADR-0226 D2 semantics and a positioner may not spend it.
    6. no coincident points   the centroid fallback must not become a load-bearing path.
    7. no NEW rim gradient    the coast gradient CONDITIONED on capability must stay near 1.0. The
                              unconditioned gradient is not asserted and must not be: it is a
                              consequence of the count rules, is 2.28x on the real-corpus island,
                              and is the owner's to decide, not this floor's to launder.

WHAT IS DELIBERATELY NOT ASSERTED. The island-wide near-pair fraction is REPORTED and not floored,
because on the real-corpus island it cannot reach zero: capability 5 owns one 198-unit cell and is
budgeted 18 plants, which is 1.26x what that much ground holds at the clearance. That residual is
an over-planted parcel, not a badly-placed one, and a floor that failed on it would be demanding
the positioner fix a decision it does not own. For the same reason rung 4 skips any parcel over
capacity: it is the one rung that asks for a guarantee, and a guarantee cannot be given about
ground that has no room.

WHY TWO RUNGS POOL ACROSS SEEDS INSTEAD OF TAKING THE WORST ONE, and it is not to make them
easier. The first draft asserted the worst of twenty seeds on rungs 1 and 7, and both went red on
numbers that are indistinguishable from their own null: one seed places ~100 plants, so the
sampling standard deviation of a correlation is 1/sqrt(100) = 0.10 and the worst of twenty draws
from a zero-mean noise of that width lands near 0.22 as a matter of arithmetic. Rung 7 is a ratio
of four small counts, which is biased as well as noisy. Both now pool the raw quantities over
every seed first and take ONE estimate from ~2000 placements, where the null width is 0.022. That
is a strictly TIGHTER test than the one it replaces - the tolerance stayed at 0.15 while the noise
it has to survive fell by a factor of four - and it is the difference between a floor that
measures the positioner and one that measures the seed list.
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

#: The floor. Each value is set from the measured spread between the two positioners with margin on
#: both sides — see `dispersion-report.json` for the numbers these sit between.
AXIS_CORRELATION_MAX = 0.15        # measured: 0.9997 before, 0.014-0.055 after
DIAGONAL_FRACTION_MAX = 0.07       # measured: 1.0000 before, 0.040-0.044 after (chance is 0.0396)
CLARK_EVANS_MIN = 1.35             # measured: 0.97 / 1.17 before, 1.91 / 1.93 after
MIN_NEAREST_NEIGHBOUR = 1.0        # measured: 0.04 / 0.32 before, 1.46 / 3.61 after
CONDITIONED_RATIO = (0.70, 1.40)   # a fence, not a fix: holds for both positioners

ISLANDS = {
    "healthy": "chapter2-healthy-island-2026-08-16",
    "fixture": "chapter2-grass-reads-as-signal-2026-08-16",
}
SEEDS = ["verify-%d" % i for i in range(20)]
UAT = [{"id": f"uat-{i}", "state": s} for i, s in
       enumerate(["proven", "proven", "pending", "failing", "proven", "pending"])]


class _Tokens(dict):
    def __missing__(self, k):
        return {}


TOKENS = {"blade": _Tokens(), "shrub": _Tokens(), "wilt": _Tokens(), "flower": _Tokens()}


def load(dirname):
    island = json.load(open(os.path.join(REPO, "docs", "research", dirname, "island.json")))
    cx, cy = island["islandCentreGround"]
    coast = island["coastLoopGround"]
    for c in island["variantB"]["cells"]:
        c["_h"] = 0.0
    island["_radius"] = sum(math.hypot(p[0] - cx, p[1] - cy) for p in coast) / len(coast)
    return island


def authored_meadow(island, seed):
    """What the COUNT RULES asked for, independent of any positioner."""
    n = 0
    for ci, status in enumerate(island["capStatuses"]):
        if not any(c["cap"] == ci for c in island["variantB"]["cells"]):
            continue
        _t, grass, shrubs, wilts, _l = X._counts(ci, status, seed, 1.0)
        n += grass + shrubs + wilts
    return n


def measure_one(island, seed):
    items, stats = X.scatter_dispersed(island, TOKENS, seed, UAT, 1.0)
    by_cap = collections.defaultdict(list)
    placements = []
    for it in items:
        if it["kind"] in ("tuft", "shrub", "wilt"):
            by_cap[it["cap"]].append((it["g"][0], it["g"][1]))
            placements.append((it["g"][0], it["g"][1], it["cell"]))
    m = D.measure(island, dict(by_cap), placements)
    m["_delivered"] = len(placements)
    m["_authored"] = authored_meadow(island, seed)
    m["_uv"] = D.axis_uv(placements, island["variantB"]["cells"])
    # rung 4 asks for a GUARANTEE, so it is evaluated only where one is possible: the closest pair
    # inside each parcel that has room for its own budget. An over-capacity parcel is excluded and
    # named, never quietly averaged away.
    m["_roomyMinNN"] = None
    m["_skippedParcels"] = []
    worst = None
    for row in m["perCapability"]:
        if row["overload"] is None or row["placements"] < 2:
            continue
        if row["overload"] > 1.0:
            m["_skippedParcels"].append((row["cap"], row["overload"]))
            continue
        nn = D.nearest_neighbour_distances(by_cap[row["cap"]])
        if nn and (worst is None or min(nn) < worst):
            worst = min(nn)
    m["_roomyMinNN"] = worst
    flat = [(x, y, ci) for ci, pts in by_cap.items() for x, y in pts]
    m["_crossParcel"] = sum(
        1 for i, (x, y, ci) in enumerate(flat)
        if any(cj != ci and math.hypot(x - xj, y - yj) < D.CLEARANCE
               for j, (xj, yj, cj) in enumerate(flat) if j != i))
    return m


failures = []
rows = []


def check(ok, label, detail):
    rows.append(("PASS" if ok else "FAIL", label, detail))
    if not ok:
        failures.append(f"{label}: {detail}")


for name, dirname in ISLANDS.items():
    island = load(dirname)
    ms = [measure_one(island, s) for s in SEEDS]

    def col(k):
        return [m[k] for m in ms if m.get(k) is not None]

    pooled_uv = [p for m in ms for p in m["_uv"]]
    ax = abs(D.correlation(pooled_uv))
    check(ax <= AXIS_CORRELATION_MAX, f"[{name}] 1. axis independence",
          f"|corr(u,v)| pooled over {len(pooled_uv)} placements = {ax:.4f} "
          f"(limit {AXIS_CORRELATION_MAX}, null width 1/sqrt(n) = "
          f"{1/math.sqrt(len(pooled_uv)):.4f})")

    dg = sum(1 for u, v in pooled_uv if abs(u - v) <= 0.02) / len(pooled_uv)
    check(dg <= DIAGONAL_FRACTION_MAX, f"[{name}] 2. no diagonal band",
          f"on-diagonal share pooled over {len(pooled_uv)} placements = {dg:.4f} "
          f"(limit {DIAGONAL_FRACTION_MAX}, chance is 0.0396 +- "
          f"{math.sqrt(0.0396 * 0.9604 / len(pooled_uv)):.4f})")

    ce = statistics.mean(col("clarkEvansPerCapabilityMean"))
    ce_worst = min(col("clarkEvansPerCapabilityMean"))
    check(ce >= CLARK_EVANS_MIN, f"[{name}] 3. dispersion index",
          f"mean per-capability Clark-Evans = {ce:.3f}, worst seed {ce_worst:.3f} "
          f"(floor {CLARK_EVANS_MIN}, a uniform-random scatter scores 1.00)")

    mn = min(m["_roomyMinNN"] for m in ms if m["_roomyMinNN"] is not None)
    skipped = sorted({p for m in ms for p in m["_skippedParcels"]})
    check(mn >= MIN_NEAREST_NEIGHBOUR, f"[{name}] 4. no touching plants",
          f"closest pair in a parcel WITH ROOM, over all seeds = {mn:.3f} ground units "
          f"(floor {MIN_NEAREST_NEIGHBOUR}, a shrub is 9-14 across)"
          + (f"; skipped over-capacity parcels {skipped}" if skipped else ""))

    bad = [(m["_delivered"], m["_authored"]) for m in ms if m["_delivered"] != m["_authored"]]
    check(not bad, f"[{name}] 5. counts unchanged",
          f"delivered == authored on all {len(SEEDS)} seeds"
          if not bad else f"{len(bad)} seeds differ, e.g. {bad[0]}")

    co = max(m["coincidentGroups"] for m in ms)
    check(co == 0, f"[{name}] 6. no coincident points",
          f"worst seed has {co} coincident groups")

    nn_p = sum(m["conditionedCounts"]["nearPlacements"] for m in ms)
    na_p = sum(m["conditionedCounts"]["nearArea"] for m in ms)
    fn_p = sum(m["conditionedCounts"]["farPlacements"] for m in ms)
    fa_p = sum(m["conditionedCounts"]["farArea"] for m in ms)
    cond = (nn_p / na_p) / (fn_p / fa_p)
    check(CONDITIONED_RATIO[0] <= cond <= CONDITIONED_RATIO[1],
          f"[{name}] 7. no rim gradient WITHIN a parcel",
          f"conditioned near/far density ratio, pooled over {int(nn_p + fn_p)} placements = "
          f"{cond:.3f} (fence {CONDITIONED_RATIO[0]}..{CONDITIONED_RATIO[1]})")

    # reported, never floored - see the module docstring
    npf = statistics.mean(col("nearPairFraction"))
    over = max(m["maxOverload"] for m in ms if m["maxOverload"])
    rows.append(("NOTE", f"[{name}] near-pair fraction (reported, not floored)",
                 f"{npf:.4f} at clearance {D.CLEARANCE}; worst parcel overload {over:.3f}x - "
                 f"a parcel over 1.0 is asked for more plants than its ground holds"))
    # A KNOWN REGRESSION, reported so it cannot be forgotten rather than floored so the pass looks
    # clean. Spacing is scoped to a capability, so pushing plants away from their own parcel's
    # plants pushes them toward its boundary, where the rule cannot see the neighbour on the other
    # side. It is not floored because the fix that would satisfy a floor here - island-wide
    # spacing memory - trades away the determinism property `scatter.py` is built on, and that is
    # the owner's call. See the README's gaps.
    xp = statistics.mean(m["_crossParcel"] for m in ms)
    rows.append(("NOTE", f"[{name}] cross-parcel near pairs (reported; a KNOWN REGRESSION)",
                 f"{xp:.1f} per island on average - plants under {D.CLEARANCE} units apart whose "
                 f"two halves belong to different capabilities. Spacing is scoped to a capability, "
                 f"so this case got WORSE, not better; see the README's gaps"))
    rows.append(("NOTE", f"[{name}] rim/core density gradient (reported, not floored)",
                 f"{statistics.mean(col('rimCoreRatio')):.3f}x - a consequence of the count rules, "
                 f"not of the positioner; see README"))

w = max(len(r[1]) for r in rows)
print()
for verdict, label, detail in rows:
    print(f"  {verdict:4}  {label:<{w}}  {detail}")
print()
if failures:
    print(f"DISPERSION FLOOR: RED - {len(failures)} of "
          f"{sum(1 for r in rows if r[0] != 'NOTE')} checks failed")
    for f in failures:
        print("  x", f)
    sys.exit(1)
print(f"DISPERSION FLOOR: GREEN - {sum(1 for r in rows if r[0] == 'PASS')} checks, "
      f"{len(ISLANDS)} islands, {len(SEEDS)} seeds each")
