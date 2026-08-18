#!/usr/bin/env python3
"""WHERE the component art stands, and HOW MUCH of it — the semantic half of the dressing.

This module is why the pass is not decoration. Under ADR-0226 the island's living surface is a
LANGUAGE, so how much grass a parcel carries and which flower form stands on it are readings of the
work, not art direction:

    grass COUNT      <- the capability's test count          (D2)
    grass COLOUR     <- the capability's status class        (D3, the status wilt)
    flower COUNT     <- one per UAT criterion, exactly 1:1   (D4)
    flower FORM      <- that criterion's verdict             (D4)

Every count rule below is the app's own (`meadowSurface`, `buildUatMarkers`), transcribed with its
numbers rather than re-invented, so a reader comparing this island against the shipped one is
comparing the same rules at a different fidelity — not two different worlds.

DETERMINISM IS A HASH OVER AN ADDRESS, never a draw counter and never Python's salted `hash()`. A
draw counter would make every placement depend on the order the ones before it were made, so adding
a single capability would reshuffle the whole island; a salted hash would break the byte-identity
`verify.py` asserts across runs. This is the same rule the interior fork's compositor follows.

THE POSITIONER WAS BROKEN FROM THE FIRST COMMIT UNTIL 2026-08-18, AND EVERY COMPOSITE THIS ARC
DELIVERED BEFORE THAT DATE CARRIES IT. The defect and its fix are recorded here rather than in a
changelog because the shape of it is reusable, and because `LEGACY_AFFINE` below still reproduces
it on demand:

  * **the two coordinates of a point were drawn INDEPENDENTLY, and CRC32 would not let them be.**
    The old `_sample_in_cell` drew `x` from `det(addr, "x", t)` and `y` from `det(addr, "y", t)` —
    two CRC32s over messages differing in ONE CHARACTER. CRC32 is affine over GF(2), so for two
    equal-length messages `crc32(A) ^ crc32(B)` depends only on `A ^ B` and NOT on the message
    content: here it is the constant `0x01c26a37`, whose top seven bits are zero. Two 32-bit values
    differing by an XOR with such a mask are numerically almost equal, so `u_x` and `u_y` landed
    within 0.01 of each other and the point landed on the cell's bounding-box DIAGONAL.
    `corr(u, v) = +0.9997` against a null of exactly zero, 100% of placements within 2% of the
    diagonal against a 3.96% null. A capability owning a single cell ended with all eighteen of its
    plants on one straight line.
    THE OBVIOUS FIX DOES NOT WORK: moving the axis token to the FRONT of the address leaves the two
    coordinates locked together (`corr = -0.72`), because the affine property does not care WHERE
    the messages differ, only that they differ in a fixed way. What works is drawing both
    coordinates out of ONE hash, avalanche-finalised so no fixed input difference maps to a fixed
    output difference (`_uv`). `verify_refusal.py` P4 runs the wrong fix and requires the floor to
    catch it.

  * **cell choice is weighted by AREA, not uniform over cells.** The old rule picked
    `owned[int(det(...) * len(owned))]`, one vote per cell. On a mesh whose cells are all the same
    size that is harmless, and on the two islands measured it is: fixing it alone moves the rim/core
    density ratio by 2.6%. It is corrected anyway because "one vote per cell" stops being harmless
    the moment cell areas stop being equal, and nothing in the mesh generator promises they stay so.

  * **each point is the BEST OF `CANDIDATES` draws, not the first.** Mitchell's best-candidate blue
    noise: generate several candidate points, keep the one furthest from every plant already
    standing in this parcel. It is the entire fix for clumping. Independent points are exactly the
    Poisson null, so the old nearest-neighbour index sat at 1.0 by construction with the long tail
    of near-touching pairs a Poisson process always has. Best-candidate raises it to ~1.6-1.9 while
    placing the same number of plants in the same parcels.

DETERMINISM, BENT AND NOT BROKEN — stated precisely so a reader can check. Every candidate point is
still a hash over an address — `det(seed, kind, cap, k, "cand", j, ...)` — so no salt and no counter
enters. What IS new is that the CHOICE among candidates reads the points already placed. That
dependency is scoped to ONE capability's own batch: capability `ci`'s addresses contain `ci`, and no
capability reads another's points, so adding, removing or re-ordering capabilities still leaves
every other capability's island-position untouched. That is the property this module's rule exists
to protect, and it survives. The UAT flowers below already did exactly this, rejecting against
`flower_pts` as they accumulate — the meadow now follows the rule the flowers always did.

THE STATED GAP: spacing is enforced WITHIN a capability, never across parcel boundaries. Two plants
one unit apart on opposite sides of a boundary are not prevented, and the count of them got WORSE
rather than better, because pushing plants away from their own parcel's plants pushes them toward
its boundary. Making spacing island-wide would make capability `i`'s positions depend on
capabilities `0..i-1`, which is the determinism property above, so it is a fork for the owner rather
than a change to slip in here. `verify.py` REPORTS the residual as a named regression rather than
flooring it.
"""
import math
import zlib

#: The app's keep-outs, in GROUND units (`scene.ts` MARKER_GROUND_TREE_WELL / MARKER_GROUND_SPACING).
#: Ground distances, never screen `hypot`: measuring isotropically in screen space against
#: foreshortened cells demanded roughly three times the intended ground clearance (ADR-0367 D1).
TREE_WELL = 36.0
FLOWER_SPACING = 15.0
#: Grass gets its own, much smaller well. The app's meadow has no explicit one — its grass is placed
#: per parcel and the tree simply covers it — but a tuft standing where the trunk meets the ground
#: reads as growing THROUGH the trunk once the tree is a sprite composited on top, so the well is
#: the tree's own contact footprint rather than the marker keep-out.
GRASS_WELL = 11.0
#: Flowers avoid the nameplate band in the app (`y < labelY - 14`, a SCREEN-space test because the
#: plate is screen art). There is no nameplate in these composites, so the rule is inapplicable
#: rather than implemented — recorded here so its absence is a stated gap and not an oversight.
NAMEPLATE_BAND = None

#: How many candidate points each placement chooses between. 1 is plain rejection sampling; 6
#: already lifts the nearest-neighbour index past 1.5; the curve is flat past ~16. Ten is the knee.
CANDIDATES = 10

#: The two positioners `scatter_island` can run. `SPREAD` is the one every caller wants and the
#: default. `LEGACY_AFFINE` reproduces the pre-2026-08-18 placement EXACTLY — the affine-CRC32 draw,
#: uniform-over-cells choice and first-hit acceptance that put every plant on its cell's diagonal.
#: It is retained for two reasons and no others: `verify_refusal.py` P1 needs the real defect to
#: prove the dispersion floor is not vacuous, and a later reader regenerating this arc's pre-fix
#: evidence needs to be able to. NO COMPOSITOR MAY PASS IT — `verify.py` asserts that.
SPREAD = "spread"
LEGACY_AFFINE = "legacy-affine"

_M32 = 0xFFFFFFFF


def det(*parts):
    """A deterministic 0..1 from a string address."""
    return (zlib.crc32(":".join(str(p) for p in parts).encode()) & 0xFFFFFFFF) / 0x100000000


def _fmix32(h):
    """Murmur3's 32-bit avalanche finaliser.

    THE ONLY THING THIS ADDS is bit mixing, and that is exactly what CRC32 lacks. CRC32 is a linear
    code: `crc(A) ^ crc(B)` is a function of `A ^ B` alone, so two addresses differing by a fixed
    edit ALWAYS produce outputs differing by a fixed XOR — which is how "x" and "y" ended up drawing
    the same number. An avalanche step is non-linear (two multiplies and three xor-shifts), so a
    one-character address change moves every output bit with probability ~0.5 and no fixed
    relationship survives.

    IT DOES NOT WEAKEN DETERMINISM, which is the property this module guards: it is a pure function
    of the CRC, so the address still fully determines the draw, no salt and no counter is
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
    """`det`'s CRC32 over the same address, recovered as an integer and avalanched."""
    return _fmix32(int(det(*parts) * 0x100000000))


def _u(*parts):
    """One well-mixed 0..1 from an address."""
    return _hash(*parts) / 0x100000000


def _uv(*parts):
    """TWO independent 0..1 values from ONE address, as the high and low halves of one avalanched
    hash. Sixteen bits per coordinate resolves a 25-unit cell to 0.0004 ground units, four orders of
    magnitude finer than the 4-unit clearance anything here cares about.

    Measured over 6000 draws: `corr(u, v) = +0.008`, marginal means 0.4998 / 0.4956 against 0.5,
    marginal sds 0.2882 / 0.2879 against 0.28868, and a 16x16 uniformity chi-square of 240.7 on 255
    degrees of freedom. The scheme it replaces scored `corr = +0.73` on the raw pair and +0.9997 on
    the placements that actually landed.
    """
    h = _hash(*parts)
    return ((h >> 16) & 0xFFFF) / 0x10000, (h & 0xFFFF) / 0x10000


def _point_in_poly(x, y, poly):
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


#: `id()` IS ONLY UNIQUE AMONG LIVE OBJECTS, so the cache stores the polygon BESIDE its area and
#: checks identity on read. Two things follow, and both are the point rather than a side effect:
#: holding the reference makes the id un-recyclable while the entry lives, and the `is` check means
#: a recycled id could not be believed even if one occurred. Without it, loading one island, letting
#: it fall out of scope and loading another — which `verify.py`, `measure.py` and every multi-island
#: harness on this track do — can hand a fresh polygon the address of a dead one and silently return
#: the DEAD cell's area, which the area-weighted draw would then use to pick cells. An island is a
#: few hundred small lists, so the retention is not worth avoiding.
_AREA_CACHE = {}


def _area(poly):
    key = id(poly)
    hit = _AREA_CACHE.get(key)
    if hit is not None and hit[0] is poly:
        return hit[1]
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    a = abs(a) / 2.0
    _AREA_CACHE[key] = (poly, a)
    return a


def _prefix_areas(cells, owned):
    """Cumulative owned-cell areas, for the area-weighted draw."""
    cum, run = [], 0.0
    for i in owned:
        run += _area(cells[i]["poly"])
        cum.append(run)
    return cum, run


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
    inside that cell's polygon. The centroid fallback is kept verbatim from the legacy sampler — it
    is measured at zero on both islands and is retained as a floor, not as a load-bearing path."""
    idx = _pick_by_area(owned, cum, total, _u(*addr, "cand", j, "cell"))
    poly = cells[idx]["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        u, v = _uv(*addr, "cand", j, "uv", t)
        x = min(xs) + u * (max(xs) - min(xs))
        y = min(ys) + v * (max(ys) - min(ys))
        if _point_in_poly(x, y, poly):
            return x, y, idx, False
    return cells[idx]["c"][0], cells[idx]["c"][1], idx, True


def sample_in_cell(cell, addr, tries=12):
    """One point inside a GIVEN cell, drawn correctly — the fixed replacement for the sampler the
    module docstring's first bullet describes.

    This is the single-cell entry point, for callers that already know which cell they are filling
    and therefore need neither the area-weighted cell choice nor the best-candidate spacing:
    `compose_grass.carpet_items` places a fixed quota per cell, so it has no cell to choose and no
    per-capability batch to space against. It still needs both coordinates out of ONE avalanched
    hash, because the diagonal collapse is a property of the DRAW and does not care what is choosing
    the cell — the carpet variant was standing on the diagonal exactly as the meadow was.

    It deliberately does NOT add spacing. The carpet is an option the arc measured and declined on a
    number (897 px of grass tracking no test count against 275 that do); giving it blue noise here
    would be redesigning a declined option under cover of a defect fix.

    Falls back to the centroid when every draw misses — a sliver cell on the relaxed mesh can be
    thin enough that twelve uniform draws all land outside it, and dropping the item there would
    silently under-grass exactly the awkward cells the mesh is full of.
    """
    poly = cell["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        u, v = _uv(addr, "uv", t)
        x = min(xs) + u * (max(xs) - min(xs))
        y = min(ys) + v * (max(ys) - min(ys))
        if _point_in_poly(x, y, poly):
            return x, y, False
    return cell["c"][0], cell["c"][1], True


def legacy_affine_sample_in_cell(cell, addr, tries=12):
    """THE HISTORICAL DEFECT, kept addressable — see the module docstring's first bullet.

    A point inside a cell polygon, by rejection sampling in its bounding box, with `x` and `y` drawn
    from two RAW CRC32s over addresses differing in one character. Because CRC32 is affine those two
    draws agree to within 1%, so this returns a point on the bounding box's diagonal.

    It falls back to the centroid when every draw misses — a sliver cell on the relaxed mesh can be
    thin enough that twelve uniform draws all land outside it, and dropping the item there would
    silently under-grass exactly the awkward cells the mesh is full of.

    DO NOT CALL THIS FROM A COMPOSITOR. It exists so `verify_refusal.py` can prove the dispersion
    floor fires against the real pre-fix state rather than against an invented defect.
    """
    poly = cell["poly"]
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    for t in range(tries):
        x = min(xs) + det(addr, "x", t) * (max(xs) - min(xs))
        y = min(ys) + det(addr, "y", t) * (max(ys) - min(ys))
        if _point_in_poly(x, y, poly):
            return x, y, False
    return cell["c"][0], cell["c"][1], True


def capability_tests(cap_index, status, seed):
    """The test count this capability carries.

    INVENTED FOR THE SPIKE, and flagged as such in the README's gaps: `island.json` describes
    geometry and status, not proof state, and no real story is being read here. The DISTRIBUTION is
    chosen to exercise the vocabulary rather than to flatter it — every branch of the app's own
    count rules (a lush 4-blade tuft, a bare `unknown` parcel, a shrub-eligible parcel, a wilted
    one) is reached by at least one capability on this island, which is what makes the picture a
    test of the language instead of a portrait of its happy path.
    """
    if status == "unknown":
        return int(1 + det(seed, "tests", cap_index) * 2)
    if status == "proposed":
        return int(1 + det(seed, "tests", cap_index) * 3)
    return int(2 + det(seed, "tests", cap_index) * 7)


def counts_for(cap_index, status, seed, density=1.0):
    """The app's own count rules, numbers included — the ADR-0226 D2 semantics in ONE place.

    Returned rather than inlined so a caller measuring what the rules ASKED FOR can ask the rules
    directly, without running a positioner and then trusting that it did not spend any of them.
    """
    tests = capability_tests(cap_index, status, seed)
    grass = round(2 + tests * 1.9)
    if status == "unknown":
        grass = round(grass * 0.6)
    elif status in ("mapped", "proposed"):
        grass = round(grass * 0.85)
    grass = round(grass * density)
    lush = status in ("healthy", "building") and tests >= 6
    shrub_eligible = status in ("healthy", "building")
    shrubs = round((tests / 2.6) * density) if shrub_eligible else 0
    if status == "unhealthy":
        shrubs = round(shrubs * 0.7)
    wilts = max(1, round(tests * 0.4 * density)) if status == "unhealthy" else 0
    return tests, grass, shrubs, wilts, lush


def scatter_island(island, tokens, seed, uat_criteria, density=1.0,
                   candidates=CANDIDATES, positioner=SPREAD):
    """Every decor placement on the island, in one deterministic pass.

    `density` multiplies the MEADOW counts only — never the flowers. The grass rules are a reading of
    a capability's tests, so scaling them asks "how much grass does one test buy at the delivered
    scale", which is an art-direction dial the owner can legitimately turn. The UAT flowers are 1:1
    with the criteria BY DECISION (ADR-0226 D4), so scaling them would not be a denser picture of the
    same story — it would be a picture of a different story, showing criteria that do not exist.
    That asymmetry is the whole reason the dial lives here and not on the whole scatter.

    `positioner` selects SPREAD (the default, and what every compositor must use) or LEGACY_AFFINE
    (the pre-2026-08-18 defect, for the refusal harness only — see the module docstring).

    Returns a list of items shaped for the compositor: the piece to stamp, its GROUND point, the
    world height of the cell it stands on, and the token each of that piece's roles resolves to.
    The status never reaches the renderer — only this mapping — which is how ADR-0367 D5 survives
    for the decor exactly as it does for the land.
    """
    if positioner not in (SPREAD, LEGACY_AFFINE):
        raise ValueError(f"unknown positioner {positioner!r}; use SPREAD or LEGACY_AFFINE")

    cells = island["variantB"]["cells"]
    caps = island["capStatuses"]
    cx, cy = island["islandCentreGround"]

    by_cap = {}
    for i, c in enumerate(cells):
        by_cap.setdefault(c["cap"], []).append(i)

    items = []
    stats = {"tuft": 0, "shrub": 0, "wilt": 0, "flower": 0,
             "perCapability": [], "centroidFallbacks": 0, "wellCulled": 0,
             "positioner": positioner,
             "candidates": candidates if positioner == SPREAD else 1}

    def height_of(cell):
        # mirrors the compositor's per-cell elevation; passed back so a piece stands ON its cell
        return cell["_h"]

    # ------------------------------------------------------------------ the meadow, per capability
    for ci, status in enumerate(caps):
        owned = by_cap.get(ci, [])
        if not owned:
            stats["perCapability"].append({"cap": ci, "status": status, "cells": 0, "tests": 0,
                                           "tufts": 0, "shrubs": 0, "wilts": 0})
            continue
        tests, grass, shrubs, wilts, lush = counts_for(ci, status, seed, density)
        cum, total = _prefix_areas(cells, owned)

        blade_tokens = tokens["blade"][status]
        shrub_tokens = tokens["shrub"][status]
        wilt_tokens = tokens["wilt"]["unhealthy"]

        #: Every plant this capability has already stood up, in GROUND units. The spacing memory —
        #: scoped to the capability, which is the determinism property the module docstring defends.
        standing = []
        placed = {"tuft": 0, "shrub": 0, "wilt": 0}

        def choose(addr):
            """The ground point for one placement, or None if the tree well ate every candidate."""
            if positioner == LEGACY_AFFINE:
                idx = owned[int(det(*addr, "cell") * len(owned)) % len(owned)]
                gx, gy, fell = legacy_affine_sample_in_cell(cells[idx], addr)
                if fell:
                    stats["centroidFallbacks"] += 1
                # the tree's own contact footprint — a tuft here would grow through the trunk
                if math.hypot(gx - cx, gy - cy) < GRASS_WELL:
                    stats["wellCulled"] += 1
                    return None
                return gx, gy, idx

            best = None
            for j in range(candidates):
                x, y, idx, fell = _candidate(cells, owned, cum, total, addr, j)
                # A KEEP-OUT IS A HOLE A SPREADER RACES TOWARDS, and this is the bug that taught it.
                # The tree well is an 11-unit disc at the island centre that no plant may occupy, so
                # it is permanently the emptiest ground in any parcel containing it — and "furthest
                # from every plant already standing" is precisely a rule for finding empty ground.
                # Scored naively, the well ATTRACTED candidates and they were then culled: the
                # delivered meadow fell from 156 to 150 on the real-corpus island (well culls
                # 1 -> 7) while the count rules authored 157 either way. A count that is a reading
                # of the test count cannot be allowed to leak out through a positioner change, so a
                # candidate inside the well is not scored at all.
                if math.hypot(x - cx, y - cy) < GRASS_WELL:
                    continue
                if not standing:
                    best = (float("inf"), x, y, idx, fell)
                    break
                d = min((x - px) ** 2 + (y - py) ** 2 for px, py in standing)
                if best is None or d > best[0]:
                    best = (d, x, y, idx, fell)
            if best is None:
                # every candidate landed in the well — the legacy positioner's drop, reached the
                # same way it reaches it and reported rather than silently absorbed.
                stats["wellCulled"] += 1
                return None
            _d, gx, gy, idx, fell = best
            if fell:
                stats["centroidFallbacks"] += 1
            return gx, gy, idx

        def place(kind, n, piece_for, roles_for):
            for k in range(n):
                addr = (seed, kind, ci, k)
                spot = choose(addr)
                if spot is None:
                    continue
                gx, gy, idx = spot
                standing.append((gx, gy))
                items.append({
                    "kind": kind,
                    "piece": piece_for(addr),
                    "g": [gx, gy],
                    "cell": idx,
                    "cap": ci,
                    "status": status,
                    "h": height_of(cells[idx]),
                    "roles": roles_for(),
                })
                placed[kind] += 1

        def tuft_piece(addr):
            if status == "unknown":
                return "tuft-2"
            if lush and det(*addr, "lush") < 0.55:
                return "tuft-4"
            return "tuft-3a" if det(*addr, "v") < 0.5 else "tuft-3b"

        # An unhealthy capability turns 40% of its ordinary tufts into wilt IN PLACE, on top of its
        # own wilt batch — the app's rule, and the reason a dying parcel reads as thinning rather
        # than as merely recoloured.
        def tuft_or_wilt(addr):
            if status == "unhealthy" and det(*addr, "wiltswap") < 0.40:
                return "wilt-twig" if det(*addr, "wv") < 0.5 else "wilt-stem"
            return tuft_piece(addr)

        place("tuft", grass,
              tuft_or_wilt,
              lambda: {**blade_tokens, **wilt_tokens})
        place("shrub", shrubs,
              lambda a: "shrub-a" if det(*a, "v") < 0.5 else "shrub-b",
              lambda: dict(shrub_tokens))
        place("wilt", wilts,
              lambda a: "wilt-twig" if det(*a, "v") < 0.5 else "wilt-stem",
              lambda: dict(wilt_tokens))

        for k in placed:
            stats[k] += placed[k]
        stats["perCapability"].append({
            "cap": ci, "status": status, "cells": len(owned), "tests": tests,
            "grassRule": f"round(2 + {tests}*1.9)"
                         + ("*0.6 unknown" if status == "unknown" else "")
                         + ("*0.85 mapped/proposed" if status in ("mapped", "proposed") else ""),
            "lush": lush, "tufts": placed["tuft"], "shrubs": placed["shrub"],
            "wilts": placed["wilt"],
        })

    # ------------------------------------------------------------------ the UAT flowers
    # ONE per criterion, exactly 1:1 (ADR-0226 D4) — island-level, not per capability, because the
    # criteria belong to the STORY. The app's rejection sampler is reproduced including its
    # fallback: every criterion always renders, none is ever dropped.
    #
    # THE FLOWERS CARRIED THE SAME DEFECT AS THE MEADOW AND NOBODY HAD LOOKED, fixed 2026-08-18.
    # PR #1388 scoped them out on the reasoning that they already reject against a 15-unit spacing
    # and that moving them would move art the owner had seen. Both halves were true and the
    # conclusion still did not follow: `"ang"` and `"rad"` are EQUAL-LENGTH tokens, so the same
    # affine-CRC32 property binds them exactly as it bound `"x"` and `"y"`. Measured: the
    # `ang ^ rad` XOR mask is the CONSTANT `0x7d65435d` over 400 addresses, and the two draws
    # correlate at **+0.4999** against a null of zero.
    # WHY THE SPACING SAMPLER DID NOT SAVE IT, which is the part worth carrying: it rejects on
    # DISTANCE between chosen points and cannot see a relationship between a point's own angle and
    # its own radius. The correlation passes through untouched into DELIVERED positions — **+0.5073
    # on the real-corpus island and +0.5086 on the fixture, 720 flowers each, with ZERO exhaustion
    # fallbacks** — so a UAT criterion's distance from the island centre was half-determined by its
    # bearing, and the criteria lay on a structured spiral rather than scattering in the annulus.
    # A different mask than the meadow's, and therefore a different SHAPE: `0x01c26a37` has seven
    # leading zeros, which is why x and y came out near-equal and the meadow collapsed onto a
    # diagonal at 0.9997; `0x7d65435d` has its top bit at position 30, which produces a strong
    # linear dependency rather than equality. The lesson is that the diagonal was a SYMPTOM of the
    # affine property and not its definition — searching for the symptom would have missed this.
    flower_pts = []
    stats["flowerFallbacks"] = 0
    for k, crit in enumerate(uat_criteria):
        chosen = None
        for attempt in range(20):
            _ua, _ur = _uv(seed, "flower", crit["id"], "polar", attempt)
            a = _ua * math.tau
            # the app's own annulus: 0.30R..0.80R of the island radius from its centroid
            rad_frac = 0.30 + _ur * 0.50
            r = rad_frac * island["_radius"]
            gx, gy = cx + math.cos(a) * r, cy + math.sin(a) * r
            if math.hypot(gx - cx, gy - cy) <= TREE_WELL:
                continue
            if any(math.hypot(gx - px, gy - py) <= FLOWER_SPACING for px, py in flower_pts):
                continue
            hit = next((i for i, c in enumerate(cells) if _point_in_poly(gx, gy, c["poly"])), None)
            if hit is None:          # the keep-IN: no flower in the water
                continue
            chosen = (gx, gy, hit)
            break
        if chosen is None:
            # the app's exhaustion fallback: snap to the nearest free land-cell centroid, sorted by
            # GROUND distance. A criterion is never dropped — an unrendered criterion would read as
            # a story with fewer criteria than it has.
            stats["flowerFallbacks"] += 1
            cand = sorted(range(len(cells)),
                          key=lambda i: (cells[i]["c"][0] - cx) ** 2 + (cells[i]["c"][1] - cy) ** 2)
            pick = next((i for i in cand
                         if math.hypot(cells[i]["c"][0] - cx, cells[i]["c"][1] - cy) > TREE_WELL
                         and all(math.hypot(cells[i]["c"][0] - px, cells[i]["c"][1] - py)
                                 > FLOWER_SPACING for px, py in flower_pts)), cand[0])
            chosen = (cells[pick]["c"][0], cells[pick]["c"][1], pick)
        gx, gy, hit = chosen
        flower_pts.append((gx, gy))
        state = crit["state"]
        items.append({
            "kind": "flower",
            "piece": f"flower-{state}",
            "g": [gx, gy],
            "cell": hit,
            "cap": cells[hit]["cap"],
            "status": cells[hit]["cap"],
            "verdict": state,
            "criterion": crit["id"],
            "h": height_of(cells[hit]),
            "roles": dict(tokens["flower"][state]),
        })
        stats["flower"] += 1

    assert stats["flower"] == len(uat_criteria), (
        f"the UAT scatter is 1:1 by decision (ADR-0226 D4): {len(uat_criteria)} criteria produced "
        f"{stats['flower']} flowers")
    return items, stats
