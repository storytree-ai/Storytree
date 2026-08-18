#!/usr/bin/env python3
"""THE DISPERSION FLOOR — the property this pass adds so nobody has to eyeball it again.

    python verify.py            # ~3 min, renders nothing, needs no Blender and no network

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

  STRUCTURAL RUNGS (island-independent; added when the fix moved into `scatter.py` itself):
    8. the legacy path is     `scatter.LEGACY_AFFINE` must still COLLAPSE onto the bounding-box
       really the defect      diagonal. `verify_refusal.py` P1 used to read the shipped module with
                              no argument, so it could not drift from reality; now it names a
                              branch, and a branch that quietly stopped reproducing the defect would
                              turn the load-bearing refusal probe into a probe of nothing while it
                              kept printing CAUGHT.
    9. exactly one            `disperse.scatter_dispersed` must BE `scatter.scatter_island`, and the
       implementation        two committed `scatter.py` copies must be byte-identical. The three-way
                              copy is how this arc kept paying the same bill twice.
   10. no compositor takes    nothing under `docs/research/**` outside this pass's own harness may
       the legacy path        pass `LEGACY_AFFINE` or call `legacy_affine_sample_in_cell`. It exists
                              to make a refusal fire, and a compositor reaching for it would be
                              re-introducing the defect through the door built to prove it is gone.

   11. the cross-parcel rise   the total near-pair count must FALL between the two positioners. PR
       is a redistribution     #1388 left the cross-parcel rise as a bare NOTE; measuring the total
                              settles it, because the rise happens inside a total that drops by
                              63%. Floored on the TOTAL rather than on the slice, so a later change
                              that flattered the cross-parcel number by giving the total back goes
                              red — which the NOTE could not catch.
   14. the UAT flowers are    a flower's DELIVERED polar angle and radius must be uncorrelated. The
       not on a spiral        meadow's diagonal was the loud instance of the affine-CRC32 property;
                              this was the quiet one, scoped out of PR #1388 on the reasoning that
                              the flowers already reject against a 15-unit spacing. That sampler
                              rejects on distance BETWEEN points and is structurally blind to one
                              point's own angle-radius relationship, so the correlation passed
                              through into delivered positions at +0.507 / +0.509. The mask differs
                              from the meadow's (0x7d65435d vs 0x01c26a37), so the SHAPE differs
                              too — a spiral rather than a diagonal. The diagonal was a symptom of
                              the affine property, never its definition; hunting the symptom would
                              have missed this.
   13. nobody calls the       `_sample_in_cell` was the affine draw's entry point, and it had an
       removed sampler        unlisted caller: `compose_grass.carpet_items` filled a fixed quota per
                              cell with it, so the CARPET variant stood on the diagonal too. The
                              name was REMOVED rather than aliased to the fix, because an alias
                              would have silently repaired this caller while silently mis-serving
                              any caller that actually wanted the legacy draw. Public replacement:
                              `scatter.sample_in_cell`.
   12. the area cache         `_area` caches on `id()`, which is unique only among LIVE objects.
       survives a reload      Measured on the pre-fix cache shape: 689 of 3,008 lookups across
                              sixteen island loads — 22.9% — returned a FREED cell's area to the
                              area-weighted draw. This rung drives the real load-use-free sequence
                              rather than inspecting the cache's shape, so a rewrite that keeps the
                              bug in another shape still fails.

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
import gc
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

# ---------------------------------------------------------------- the structural rungs (8, 9, 10)
# These ask about the CODE rather than about a draw, so they run once rather than per island/seed.
S = X.S
_leg_island = load(ISLANDS["fixture"])
_leg = [it for it in S.scatter_island(_leg_island, TOKENS, "verify-0", UAT, 1.0,
                                      positioner=S.LEGACY_AFFINE)[0]
        if it["kind"] in ("tuft", "shrub", "wilt")]
_leg_uv = D.axis_uv([(it["g"][0], it["g"][1], it["cell"]) for it in _leg],
                    _leg_island["variantB"]["cells"])
_leg_diag = sum(1 for u, v in _leg_uv if abs(u - v) <= 0.02) / len(_leg_uv)
check(_leg_diag > 0.90, "8. the legacy path still reproduces the defect",
      f"scatter.LEGACY_AFFINE puts {_leg_diag:.4f} of its placements within 0.02 of the "
      f"bounding-box diagonal (must stay above 0.90; the fixed positioner scores ~0.04, chance is "
      f"0.0396). This is what makes verify_refusal.py P1 a probe of the real pre-fix state.")

_grass = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16",
                      "scatter.py")
_dressed = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16",
                        "scatter.py")
_same_impl = X.scatter_dispersed is S.scatter_island
_same_bytes = open(_grass, "rb").read() == open(_dressed, "rb").read()
check(_same_impl and _same_bytes, "9. exactly one implementation",
      f"disperse.scatter_dispersed is scatter.scatter_island: {_same_impl}; the two committed "
      f"scatter.py copies are byte-identical: {_same_bytes}")

# THE ALLOWLIST IS THE CHECK. A blanket "only this pass may say it" would have been wrong — the
# high-frequency options pass has a legitimate, environment-gated refusal hatch that must feed the
# real defect to its own corr gate. So the rule is not "nobody else" but "nobody else WITHOUT a
# stated reason on this list", which means adding a caller is an edit a reviewer sees rather than a
# silent import.
_RESEARCH = os.path.join(REPO, "docs", "research")
_ALLOWED = {
    "chapter2-grass-reads-as-signal-2026-08-16/scatter.py":
        "defines it",
    "chapter2-island-place-dressing-2026-08-16/scatter.py":
        "the byte-identical committed copy, held identical by rung 9",
    "chapter2-plant-dispersion-2026-08-17/verify.py":
        "rungs 8 and 10 — this file",
    "chapter2-plant-dispersion-2026-08-17/verify_refusal.py":
        "P1, the load-bearing perturbation",
    "chapter2-plant-dispersion-2026-08-17/measure.py":
        "the before/after measurement this pass's report is made of",
    "chapter2-plant-dispersion-2026-08-17/picture.py":
        "the before/after picture",
    "chapter2-high-frequency-options-2026-08-17/compose_options.py":
        "its STORYTREE_OPTIONS_PERTURB=unfixed-positioner hatch, asserted OFF at rest by its own "
        "verify.py",
    "chapter2-high-frequency-options-2026-08-17/verify.py":
        "its 'the UNFIXED sampler TRIPS the same gate' non-vacuity check",
    "chapter2-plant-dispersion-2026-08-17/disperse.py":
        "NAMES IT IN A COMMENT ONLY, to say why it is not re-exported — asserted below, because a "
        "text scan cannot tell a comment from a call",
}
_leaks = []
for root, _dirs, files in os.walk(_RESEARCH):
    for f in files:
        if not f.endswith(".py"):
            continue
        p = os.path.abspath(os.path.join(root, f))
        rel = os.path.relpath(p, _RESEARCH).replace(os.sep, "/")
        if rel in _ALLOWED:
            continue
        src = open(p, encoding="utf-8", errors="replace").read()
        for token in ("LEGACY_AFFINE", "legacy_affine_sample_in_cell"):
            if token in src:
                _leaks.append(f"{rel} mentions {token}")
# RUNG 11 — THE CROSS-PARCEL REGRESSION, DECIDED RATHER THAN REPORTED.
# PR #1388 left this as a NOTE because the remedy (island-wide spacing memory) trades away the
# determinism property `scatter.py` is built on, and that read as an owner fork. Measuring the
# thing the fork actually turns on settles it without one: the cross-parcel count rises INSIDE A
# MUCH SMALLER TOTAL. On the real-corpus island near-pair plants fall 75.9 -> 28.4 while the
# cross-parcel slice rises 1.7 -> 16.6 — so each cross-parcel pair gained is bought against ~5.6
# same-parcel pairs removed, and on the fixture the same-parcel slice reaches exactly zero. An
# island-wide remedy is therefore bidding for the last ~11 percentage points having already been
# handed 33, at the price of making capability i's positions depend on capabilities 0..i-1 — which
# is what makes every before/after picture on this arc comparable at all.
# SO THE SCOPED RULE IS KEPT DELIBERATELY, and what is floored is the quantity the decision turns
# on: the TOTAL must fall, not merely the same-parcel half. A future change that traded the total
# away to flatter the cross-parcel number would go red here, which is exactly the failure the old
# NOTE could not catch.
CROSS_PARCEL_SEEDS = SEEDS[:6]     # a subset, stated: this rung runs both positioners


def _near_split(island, seed, legacy):
    kw = {"positioner": X.S.LEGACY_AFFINE} if legacy else {}
    its = X.S.scatter_island(island, TOKENS, seed, UAT, 1.0, **kw)[0]
    flat = [(it["g"][0], it["g"][1], it["cap"]) for it in its
            if it["kind"] in ("tuft", "shrub", "wilt")]
    near = cross = 0
    for i, (x, y, ci) in enumerate(flat):
        hit = xhit = False
        for j, (xj, yj, cj) in enumerate(flat):
            if i != j and math.hypot(x - xj, y - yj) < D.CLEARANCE:
                hit = True
                xhit = xhit or cj != ci
        near += hit
        cross += xhit
    return len(flat), near, cross


for name, dirname in ISLANDS.items():
    isl = load(dirname)
    b = [_near_split(isl, s, True) for s in CROSS_PARCEL_SEEDS]
    a = [_near_split(isl, s, False) for s in CROSS_PARCEL_SEEDS]
    bn = statistics.mean(r[1] for r in b)
    an, ac = statistics.mean(r[1] for r in a), statistics.mean(r[2] for r in a)
    bc = statistics.mean(r[2] for r in b)
    check(an < bn, f"[{name}] 11. the cross-parcel rise is a redistribution, not a net loss",
          f"near-pair plants {bn:.1f} -> {an:.1f} in total (must FALL); the cross-parcel slice "
          f"{bc:.1f} -> {ac:.1f} and the same-parcel slice {bn - bc:.1f} -> {an - ac:.1f}, so each "
          f"cross-parcel pair gained costs "
          f"{((bn - bc) - (an - ac)) / max(ac - bc, 1e-9):.1f} same-parcel pairs removed. Scoping "
          f"spacing to a capability is KEPT: the island-wide remedy would make one capability's "
          f"positions depend on its siblings, over {CROSS_PARCEL_SEEDS and len(CROSS_PARCEL_SEEDS)}"
          f" seeds.")

# RUNG 12 — THE AREA CACHE IS KEYED ON `id()`, WHICH IS ONLY UNIQUE AMONG LIVE OBJECTS.
# Found while promoting this positioner from a lane copy to the shipped path, and it is not a
# theoretical hazard: with the pre-2026-08-18 cache shape (area only, no reference retained),
# 689 of 3,008 area lookups across sixteen island loads — 22.9% — would have returned a DEAD
# cell's area, because CPython recycles the address of a freed list. That silently skews the
# area-weighted cell choice in exactly the harnesses that load more than one island, which is
# every multi-island harness on this track including this one. The fix is to store the polygon
# beside its area and check identity on read, which both prevents the recycling and refuses to
# believe it if it happened anyway. This rung drives the real sequence rather than inspecting
# the cache's shape, so a future rewrite that keeps the bug in a different shape still fails.
_a_seen, _a_wrong, _a_checked = {}, 0, 0
for _rep in range(3):
    for _dirname in ISLANDS.values():
        _isl = load(_dirname)
        for _c in _isl["variantB"]["cells"]:
            _p = _c["poly"]
            _truth = abs(sum(_p[i][0] * _p[(i + 1) % len(_p)][1]
                             - _p[(i + 1) % len(_p)][0] * _p[i][1]
                             for i in range(len(_p)))) / 2.0
            _a_checked += 1
            if abs(X.S._area(_p) - _truth) > 1e-6:
                _a_wrong += 1
        del _isl, _c, _p
        gc.collect()
check(_a_wrong == 0, "12. the area cache survives island reloads",
      f"{_a_checked} area lookups across {3 * len(ISLANDS)} island loads, {_a_wrong} wrong. "
      f"The cache is keyed on id(), which CPython recycles: the pre-fix shape got 22.9% of these "
      f"wrong by returning a freed cell's area to the area-weighted draw.")

# RUNG 13 — NOBODY CALLS THE REMOVED PRIVATE SAMPLER.
# `_sample_in_cell` was the affine draw's entry point and it had a caller nobody had listed:
# `compose_grass.carpet_items` filled a fixed quota per cell with it, so the CARPET variant stood on
# the diagonal exactly as the meadow did. Renaming it surfaced that caller as a loud AttributeError
# five minutes into a re-compose, which is the right failure mode and the reason the name was not
# kept as an alias — an alias would have silently fixed this caller while silently mis-serving any
# caller that actually wanted the legacy draw. The public replacement is `scatter.sample_in_cell`.
# Matched WITH the open paren so the prose that discusses the old name by name still passes — and
# the needle is ASSEMBLED rather than written, because a literal here matches this file and the
# rung reports itself. It did, on the first run.
_NEEDLE = "._sample" + "_in_cell("
_removed = []
for root, _dirs, files in os.walk(_RESEARCH):
    for f in files:
        if f.endswith(".py"):
            p = os.path.join(root, f)
            if _NEEDLE in open(p, encoding="utf-8", errors="replace").read():
                _removed.append(os.path.relpath(p, _RESEARCH).replace(os.sep, "/"))
check(not _removed, "13. nobody calls the removed private sampler",
      f"no file under docs/research/** calls scatter{_NEEDLE}; the public single-cell entry "
      f"point is scatter.sample_in_cell" if not _removed else "; ".join(_removed))

# RUNG 14 — THE UAT FLOWERS ARE NOT ON A SPIRAL.
# The meadow's diagonal was the LOUD instance of the affine-CRC32 property; the flowers were the
# quiet one, and this pass originally scoped them out because they already reject against a 15-unit
# spacing. That reasoning was sound and the conclusion was wrong: a spacing sampler rejects on
# DISTANCE BETWEEN chosen points and is structurally blind to a relationship between one point's own
# angle and its own radius. Measured before the fix: the `ang ^ rad` XOR mask is the constant
# 0x7d65435d, the raw draws correlate at +0.4999, and the correlation passes through into DELIVERED
# positions at +0.5073 / +0.5086 with ZERO exhaustion fallbacks. Under ADR-0226 D4 each flower IS a
# UAT criterion, so a criterion's distance from the centre was half-determined by its bearing.
# The floor is on DELIVERED polar coordinates, not on the draw, because the draw is the mechanism
# and the delivered position is the claim a reader would act on.
FLOWER_POLAR_CORR_MAX = 0.15       # measured: +0.507 / +0.509 before, +0.024 / -0.018 after
for name, dirname in ISLANDS.items():
    isl = load(dirname)
    _cx, _cy = isl["islandCentreGround"]
    _ang, _rad = [], []
    for _i in range(60):
        for _it in X.S.scatter_island(isl, TOKENS, f"flower-{_i}", UAT, 1.0)[0]:
            if _it["kind"] == "flower":
                _dx, _dy = _it["g"][0] - _cx, _it["g"][1] - _cy
                _ang.append(math.atan2(_dy, _dx) % math.tau)
                _rad.append(math.hypot(_dx, _dy) / isl["_radius"])
    _c = abs(D.correlation(list(zip(_ang, _rad))))
    check(_c <= FLOWER_POLAR_CORR_MAX, f"[{name}] 14. the UAT flowers are not on a spiral",
          f"|corr(polar angle, radius)| over {len(_ang)} delivered flowers = {_c:.4f} "
          f"(limit {FLOWER_POLAR_CORR_MAX}, null width 1/sqrt(n) = {1/math.sqrt(len(_ang)):.4f}). "
          f"The pre-fix draw scored +0.507; the 15-unit spacing sampler does NOT catch it, because "
          f"it rejects on distance BETWEEN points and cannot see one point's own angle-radius "
          f"relationship.")

_alias_clean = not any(hasattr(X, n) for n in ("LEGACY_AFFINE", "legacy_affine_sample_in_cell"))
check(not _leaks and _alias_clean, "10. no undeclared caller takes the legacy path",
      f"{len(_ALLOWED)} declared callers, each with a stated reason; no other file under "
      f"docs/research/** names LEGACY_AFFINE or legacy_affine_sample_in_cell; the alias module "
      f"re-exports neither name ({_alias_clean})"
      if not _leaks and _alias_clean else "; ".join(_leaks or ["disperse re-exports the legacy name"]))

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
