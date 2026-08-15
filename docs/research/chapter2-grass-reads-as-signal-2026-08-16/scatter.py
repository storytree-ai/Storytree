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

DETERMINISM IS CRC32 OVER AN ADDRESS, never a draw counter and never Python's salted `hash()`. A
draw counter would make every placement depend on the order the ones before it were made, so adding
a single capability would reshuffle the whole island; a salted hash would break the byte-identity
`verify.py` asserts across runs. This is the same rule the interior fork's compositor follows.
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


def det(*parts):
    """A deterministic 0..1 from a string address."""
    return (zlib.crc32(":".join(str(p) for p in parts).encode()) & 0xFFFFFFFF) / 0x100000000


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


def _sample_in_cell(cell, addr, tries=12):
    """A point inside a cell polygon, by rejection sampling in its bounding box.

    Falls back to the centroid when every draw misses — a sliver cell on the relaxed mesh can be
    thin enough that twelve uniform draws all land outside it, and dropping the item there would
    silently under-grass exactly the awkward cells the mesh is full of.
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


def scatter_island(island, tokens, seed, uat_criteria, density=1.0):
    """Every decor placement on the island, in one deterministic pass.

    `density` multiplies the MEADOW counts only — never the flowers. The grass rules are a reading of
    a capability's tests, so scaling them asks "how much grass does one test buy at the delivered
    scale", which is an art-direction dial the owner can legitimately turn. The UAT flowers are 1:1
    with the criteria BY DECISION (ADR-0226 D4), so scaling them would not be a denser picture of the
    same story — it would be a picture of a different story, showing criteria that do not exist.
    That asymmetry is the whole reason the dial lives here and not on the whole scatter.

    Returns a list of items shaped for the compositor: the piece to stamp, its GROUND point, the
    world height of the cell it stands on, and the token each of that piece's roles resolves to.
    The status never reaches the renderer — only this mapping — which is how ADR-0367 D5 survives
    for the decor exactly as it does for the land.
    """
    cells = island["variantB"]["cells"]
    caps = island["capStatuses"]
    cx, cy = island["islandCentreGround"]

    by_cap = {}
    for i, c in enumerate(cells):
        by_cap.setdefault(c["cap"], []).append(i)

    items = []
    stats = {"tuft": 0, "shrub": 0, "wilt": 0, "flower": 0,
             "perCapability": [], "centroidFallbacks": 0}

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
        tests = capability_tests(ci, status, seed)

        # the app's own count rules, numbers included
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

        blade_tokens = tokens["blade"][status]
        shrub_tokens = tokens["shrub"][status]
        wilt_tokens = tokens["wilt"]["unhealthy"]

        placed = {"tuft": 0, "shrub": 0, "wilt": 0}

        def place(kind, n, piece_for, roles_for):
            for k in range(n):
                addr = (seed, kind, ci, k)
                idx = owned[int(det(*addr, "cell") * len(owned)) % len(owned)]
                cell = cells[idx]
                gx, gy, fell_back = _sample_in_cell(cell, addr)
                if fell_back:
                    stats["centroidFallbacks"] += 1
                # the tree's own contact footprint — a tuft here would grow through the trunk
                if math.hypot(gx - cx, gy - cy) < GRASS_WELL:
                    continue
                items.append({
                    "kind": kind,
                    "piece": piece_for(addr),
                    "g": [gx, gy],
                    "cell": idx,
                    "cap": ci,
                    "status": status,
                    "h": height_of(cell),
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

        def tuft_roles(addr=None):
            return dict(blade_tokens)

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
    flower_pts = []
    stats["flowerFallbacks"] = 0
    for k, crit in enumerate(uat_criteria):
        chosen = None
        for attempt in range(20):
            a = det(seed, "flower", crit["id"], "ang", attempt) * math.tau
            # the app's own annulus: 0.30R..0.80R of the island radius from its centroid
            rad_frac = 0.30 + det(seed, "flower", crit["id"], "rad", attempt) * 0.50
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
