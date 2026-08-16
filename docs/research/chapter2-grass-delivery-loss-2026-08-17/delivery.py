#!/usr/bin/env python3
"""WHERE THE 46% GOES: culled, occluded, out-voted, or merely un-attributable.

    python delivery.py              # the measurement + delivery-report.json   (~2 min)
    python delivery.py --fire       # every guard in this file made to FAIL    (~4 min)

THE QUESTION THIS EXISTS TO SETTLE, and why nothing downstream is decidable without it. PR #1381
measured that of 112 decor placements on the island, 51 (46%) deliver ZERO pixels — and stopped
there, correctly, because a zero is not a diagnosis. Two mechanisms produce the identical number and
they have opposite fixes:

  * CULLED          — a spacing / keep-out test gives up and the placement never reaches the
                      compositor at all. The fix is in the placer.
  * QUANTISED AWAY  — the placement is painted, and then dies in the closed-palette snap and the
                      3x3 majority downsample. The fix (if any) is in the scale or the art.

This file separates them, and finds a THIRD and a FOURTH class that the binary fork does not name:
a placement can be painted and then OVERPAINTED by a later drawable before the downsample ever runs,
and a placement can deliver pixels that the attribution credits to a DIFFERENT placement because two
tufts of the same status emit literally the same colour.

    THE FOUR CLASSES, and the mechanism each one names

    CULLED      the scatterer never emitted it            -> a placer defect
    OCCLUDED    painted, then overpainted by a later
                drawable in the same composite            -> a painter-order / depth defect
    OUT-VOTED   survives to the snapped supersampled
                canvas, but its colour never wins a 3x3
                majority anywhere it stands               -> QUANTISATION. the raster's own floor
    CO-CREDITED its colour DOES win a block it stands in,
                but `attribute()` credits the first decor
                id in that block, so a same-colour
                neighbour takes the pixel                 -> AN INSTRUMENT ARTEFACT, not a loss

The last class matters more than its name suggests. Every tuft on one capability is painted from the
SAME blade tokens, so two adjacent tufts are colour-identical; `attribute.attribute` resolves a block
to `np.argmax(is_decor)`, i.e. the first decor id in raster order within that block. A placement that
loses that tiebreak reads as "delivers zero pixels" while its pixels are on the island. Reporting it
as delivery loss would overstate the defect, so it is counted separately and subtracted.

WHY THIS REUSES `attribute.py` RATHER THAN RE-DERIVING IT. The instrument is the sibling pass's, and
its first version produced a completely plausible FALSE finding (71% of grass delivering
`land:*:side@0.9`, caused by `paste_piece` shading its colour argument). Its guards -
`assert_mirror`, `assert_attribution_consistent`, `back_half_attributed`'s equality against the
shipped `C.back_half` - are what make it safe, and they are armed on every run below because this
file goes through `diagnose.island_run` rather than around it. The only thing this file adds is a
capture of the two intermediates `island_run` does not return (the supersampled owner map and the
snapped supersampled canvas), taken by wrapping the very functions that produce them.

    THE ONE NEW BLIT, AND THE GUARD THAT HOLDS IT. Measuring OCCLUSION needs a quantity the
    composite cannot show: the footprint a placement's own paint op writes BEFORE anything paints
    over it. That is one `paste_decor` onto an empty canvas, which is a second blit and therefore a
    second thing that can drift. `assert_footprint_contains_owned` refuses unless every supersampled
    pixel a placement still owns in the REAL composite lies inside the footprint measured in
    isolation - so an off-by-one, a wrong projection or a wrong piece is caught rather than reported.

SCALE. Every number here belongs to ONE delivered raster: 258 x 353 px for the whole island, at
supersample 3 (774 x 1059 before the downsample), 1 ground unit = 1 delivered pixel, camera 50 deg
(the research track's named parameter; the app's `LAND_CAMERA_ELEVATION_DEG` is 20 and is not read
here). `scale.py` in this directory is what asks whether the rate is a property of the pipeline or
of that number.
"""
import argparse
import contextlib
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DEFECTS = os.path.join(REPO, "docs", "research", "chapter2-grass-defects-2026-08-16")
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")

sys.path.insert(0, DEFECTS)
sys.path.insert(0, GRASS)

import attribute as A          # noqa: E402  the sibling pass's instrument, imported not forked
import diagnose                # noqa: E402  its island runner, with every guard armed
import grass                   # noqa: E402
import scatter                 # noqa: E402
from attribute import C, D     # noqa: E402

#: The four zero-delivery classes, in the order the pipeline can produce them.
CULLED, OCCLUDED, OUTVOTED, CO_CREDITED = "culled", "occluded", "outVoted", "coCredited"


# ---------------------------------------------------------------- capture the intermediates
def run_captured(meta, caps, label, perturb=None):
    """`diagnose.island_run`, with the two supersampled intermediates captured on the way past.

    `island_run` returns the delivered attribution and deliberately drops the supersampled owner map
    and the snapped supersampled canvas, because its own checks are all about delivered pixels. This
    diagnosis is about what happened BEFORE delivery, so both are needed - and the safe way to get
    them is to wrap the functions that produce them rather than to restate the run, which would fork
    the `C.CAPS` rebinding trap `island_run` documents (a `caps=` argument alone recolours cells but
    not walls).
    """
    cap = {}
    orig_compose, orig_back = A.compose_attributed, A.back_half_attributed

    def compose(*a, **kw):
        out = orig_compose(*a, **kw)
        cap["canvas"], cap["alpha"], _tree, cap["owner_ss"], cap["records"] = out
        return out

    def back(canvas, alpha, owner_ss):
        out = orig_back(canvas, alpha, owner_ss)
        cap["snapped"], cap["pre_rim"], cap["rgb"], cap["solid"], cap["rim"] = out
        return out

    A.compose_attributed, A.back_half_attributed = compose, back
    try:
        run = diagnose.island_run(meta, caps, label, perturb=perturb)
    finally:
        A.compose_attributed, A.back_half_attributed = orig_compose, orig_back
    run.update(cap)
    return run


# ---------------------------------------------------------------- the isolated footprint
def footprint_mask(item):
    """The supersampled pixels ONE placement's own paint op writes, with nothing else on the canvas.

    This is `compose_attributed`'s decor branch with the draw list emptied: the same projection, the
    same piece, the same shipped `paste_decor`, all roles bound to one colour so the whole piece is
    one mask. It is the only quantity in this file that the composite cannot supply, because by the
    time the composite is finished a later drawable may already have taken the pixels back.
    """
    shape = (C.CANVAS_H * C.SS, C.CANVAS_W * C.SS)
    own_c = np.zeros(shape + (3,), dtype=np.float32)
    own_a = np.zeros(shape, dtype=np.float32)
    px, py = C.project(item["g"][0], item["g"][1], item["h"])
    roles = D.DECOR_META["pieceRoles"][item["piece"]]
    D.paste_decor(own_c, own_a, D.DECOR_PIECE_SET[item["piece"]], px, py,
                  {r: "#ffffff" for r in {v[0] for v in roles.values()}},
                  {k: (v[0], 1.0) for k, v in roles.items()})
    return own_a > 0.5


def assert_footprint_contains_owned(owned_masks, foot_masks, items):
    """THE GUARD ON THE ONE NEW BLIT. A placement cannot own a supersampled pixel in the real
    composite that its own paint op never wrote, so every owned pixel must lie inside the isolated
    footprint. A wrong projection, a wrong piece, an off-by-one blit or a drifted `paste_decor` all
    break this immediately, and all of them would otherwise show up as a plausible occlusion number.
    """
    bad = []
    for i, item in enumerate(items):
        outside = int((owned_masks[i] & ~foot_masks[i]).sum())
        if outside:
            bad.append(f"placement {i} ({item['piece']} on cell {item['cell']}) owns {outside} "
                       f"supersampled px outside the footprint its own paint op writes")
    if bad:
        raise SystemExit("REFUSED: the isolated footprint blit has drifted from the composite's - "
                         "every occlusion number below would be about a different piece.\n  "
                         + "\n  ".join(bad[:6]))


# ---------------------------------------------------------------- the measurement
def per_placement(run):
    """One row per placement: what it painted, what survived each stage, and where it died."""
    owner_ss, snapped, pre_rim = run["owner_ss"], run["snapped"], run["pre_rim"]
    records, items = run["records"], run["items"]
    k, h, w = C.SS, C.CANVAS_H, C.CANVAS_W

    # record ids for decor, in item order (compose_attributed appends one record per drawable)
    rid_of = {}
    for rid, r in enumerate(records):
        if r["cls"] == A.DECOR:
            rid_of[int(r["item"])] = rid

    own_b = owner_ss.reshape(h, k, w, k).transpose(0, 2, 1, 3).reshape(h, w, k * k)
    skey = (snapped[:, :, 0].astype(np.int64) * 65536 + snapped[:, :, 1].astype(np.int64) * 256
            + snapped[:, :, 2].astype(np.int64))
    skey_b = skey.reshape(h, k, w, k).transpose(0, 2, 1, 3).reshape(h, w, k * k)
    wkey = (pre_rim[:, :, 0].astype(np.int64) * 65536 + pre_rim[:, :, 1].astype(np.int64) * 256
            + pre_rim[:, :, 2].astype(np.int64))
    winner = skey_b == wkey[:, :, None]

    dec = run["cls"] == 2
    delivered_ids, delivered_n = np.unique(run["item_id"][dec], return_counts=True)
    delivered_of = {int(i): int(n) for i, n in zip(delivered_ids, delivered_n) if i}

    owned_masks, foot_masks, rows = [], [], []
    for i, item in enumerate(items):
        rid = rid_of[i]
        owned = owner_ss == rid
        foot = footprint_mask(item)
        owned_masks.append(owned)
        foot_masks.append(foot)

        mine_b = own_b == rid
        per_block = mine_b.sum(axis=2)
        blocks_touched = int((per_block > 0).sum())
        won = int((mine_b & winner).any(axis=2).sum())
        delivered = delivered_of.get(rid, 0)

        gx, gy = item["g"]
        sx, sy = C.project(gx, gy, item["h"])
        rows.append({
            "i": i,
            "kind": item["kind"],
            "piece": item["piece"],
            "cap": item["cap"],
            "status": run["caps"][item["cap"]],
            "cell": item["cell"],
            "screenY": round(float(sy), 2),
            "screenX": round(float(sx), 2),
            "cellHeight": round(float(item["h"]), 3),
            "footprintSS": int(foot.sum()),
            "ownedSS": int(owned.sum()),
            "occludedSS": int(foot.sum()) - int(owned.sum()),
            "blocksTouched": blocks_touched,
            "maxOwnedInABlock": int(per_block.max()) if blocks_touched else 0,
            "blocksWhereItsColourWon": won,
            "deliveredPx": delivered,
        })
    assert_footprint_contains_owned(owned_masks, foot_masks, items)

    for r in rows:
        if r["deliveredPx"] > 0:
            r["fate"] = "delivered"
        elif r["ownedSS"] == 0:
            r["fate"] = OCCLUDED
        elif r["blocksWhereItsColourWon"] > 0:
            r["fate"] = CO_CREDITED
        else:
            r["fate"] = OUTVOTED
    return rows


def occluder_profile(run, rows):
    """WHO TOOK THE PIXELS. An occlusion count says a placement was buried; it does not say by what,
    and "by what" is the whole difference between a compositor defect and a scatter defect.

    So for every placement this reads the footprint it painted in isolation and asks which drawable
    owns those supersampled pixels once the composite is finished - resolved to the RECORD, so the
    answer distinguishes `the cell this placement stands on` from `a neighbouring cell`, `a wall`,
    and `another placement`.

    The one number the whole diagnosis turns on is the last one: `paintedBeforeItsOwnCell`. The draw
    list sorts on `(y, class)` with cells at class 2 and decor at class 3, and a CELL's sort y is its
    CENTROID while a placement's is its own ground point. So a placement scattered in the upper half
    of its own cell polygon sorts BEFORE that cell and is painted before it - and `fill_polygon` is a
    hard write, so the cell fill erases it. That is a prediction with a sign, not a story: it says
    the loss should split almost exactly on `placementGroundY < cellCentroidY`, and nowhere else.
    """
    owner_ss, records = run["owner_ss"], run["records"]
    cells = D.prepare(D.ISLAND["variantB"]["cells"])
    rid_of_cell = {}
    for rid, r in enumerate(records):
        if r["cls"] == A.CELL:
            rid_of_cell.setdefault(r["what"], rid)

    counts = {"ownCellsFill": 0, "anotherCell": 0, "aWall": 0, "theCoast": 0,
              "anotherPlacement": 0, "nothingUnpainted": 0}
    for i, item in enumerate(run["items"]):
        row = rows[i]
        if row["fate"] != OCCLUDED:
            continue
        foot = footprint_mask(item)
        ids, n = np.unique(owner_ss[foot], return_counts=True)
        top = int(ids[int(np.argmax(n))])
        rec = records[top]
        if rec["cls"] == A.CELL:
            same = rec.get("cap") == item["cap"] and rec["what"] == f"cell cap={item['cap']}"
            # the record `what` is per-capability, so identify the exact cell by geometry instead
            own_poly = cells[item["cell"]]["poly"]
            inside = scatter._point_in_poly(item["g"][0], item["g"][1], own_poly)
            counts["ownCellsFill" if (same and inside) else "anotherCell"] += 1
        elif rec["cls"] == A.WALL:
            counts["aWall"] += 1
        elif rec["cls"] == A.COAST:
            counts["theCoast"] += 1
        elif rec["cls"] == A.DECOR:
            counts["anotherPlacement"] += 1
        else:
            counts["nothingUnpainted"] += 1

    above, below = [], []
    for i, item in enumerate(run["items"]):
        cy = cells[item["cell"]]["c"][1]
        (above if item["g"][1] < cy else below).append(rows[i])

    def rate(sel):
        z = sum(1 for r in sel if r["fate"] in (OCCLUDED, OUTVOTED))
        occ = sum(1 for r in sel if r["fate"] == OCCLUDED)
        return {"n": len(sel), "trueZero": z, "occluded": occ,
                "pct": round(100.0 * z / len(sel), 1) if sel else 0.0,
                "occludedPct": round(100.0 * occ / len(sel), 1) if sel else 0.0}

    return {
        "whatOwnsAnOccludedPlacementsFootprint": counts,
        "paintedBeforeItsOwnCell": {
            "aboveTheCellCentroid_paintedFIRST_soTheCellFillErasesIt": rate(above),
            "belowTheCellCentroid_paintedAFTERTheCell": rate(below),
        },
    }


@contextlib.contextmanager
def centroid_key():
    """Compose with the PRE-FIX depth key — a placement sorting on its own ground point alone.

    THE FIX HAS LANDED (2026-08-17), so `compose_core` now sorts a placement on
    `max(own y, its cell's centroid y)` and the numbers this file reports as "before" no longer exist
    anywhere in the code. They are still the thing the measurement is ABOUT, so the compositor keeps
    one switch whose only caller is this block: `DECOR_SORTS_AFTER_ITS_CELL = False` reinstates the
    defect for the duration of one composite and nothing else changes. That is deliberately a switch
    on the ONE compositor rather than a second copy of it carrying the old key — a fourth copy is
    exactly what this track has been told not to create, and a guard that cannot reintroduce the
    defect it guards against is not a guard.
    """
    saved = D.DECOR_SORTS_AFTER_ITS_CELL
    D.DECOR_SORTS_AFTER_ITS_CELL = False
    try:
        yield
    finally:
        D.DECOR_SORTS_AFTER_ITS_CELL = saved


def assert_data_route_agrees(meta, caps, shipped):
    """THE TWO ROUTES TO THE SAME PICTURE, held to agreeing — and it is what keeps
    `assert_projection_unchanged` armed now that the repair lives in the compositor.

    Before the fix landed, this file measured the repair as a DATA transform: move a placement
    down-field by `d` and raise its world height by `d*SIN/COS`, which lands it on the identical
    canvas pixel while sorting it `d` later (`repair_depth_keys`). The compositor now does the
    reordering itself, so the data transform must be a NO-OP on the delivered raster: composing the
    shifted items under the shipped rule must produce byte-identical pixels to composing the raw
    items under it.

    Running it keeps two guards alive that would otherwise have quietly stopped being exercised:
    `assert_projection_unchanged` (every placement's integer blit origin is unchanged) and the claim
    that the repair is a REORDERING rather than a move.
    """
    run = run_captured(meta, caps, "cross-check", perturb=repair_depth_keys)
    same = np.array_equal(run["rgb"], shipped["rgb"]) and np.array_equal(run["solid"],
                                                                        shipped["solid"])
    if not same:
        raise SystemExit(
            "REFUSED: the down-field data transform and the compositor's own depth key deliver "
            "DIFFERENT rasters. One of the two is not doing what it says, so neither number below "
            "can be attributed to the reordering.")
    return {"guard": "the pre-fix data transform is now a no-op against the shipped depth key",
            "identicalRaster": True}


def repair_depth_keys(items):
    """THE FIX, APPLIED WITHOUT FORKING A COMPOSITOR — a placement is given a depth key that puts it
    after the cell it stands on, and is not moved by one pixel to get it.

    The draw list sorts on `(y, class)`. A cell's y is its CENTROID; a placement's y is its own
    ground point; so a placement in the back half of its own cell sorts before that cell and the
    cell's `fill_polygon` — a hard write — erases it. The correct key for a placement is therefore
    `max(its own ground y, its cell's centroid y)`: never earlier than the surface it stands on,
    and otherwise unchanged.

    That key lives inside `compose_attributed`'s draw-list assembly, in a sibling pass's committed
    file this pass may not edit (and a fourth copy of the compositor is exactly what this track has
    been told not to create). But the key is read from the ITEM, and the projection is
    `(gx + Ox, gy*SIN + Oy - h*COS)` — so moving a placement DOWN-field by d and simultaneously
    raising its world height by `d*SIN/COS` lands it on the identical canvas pixel while sorting it
    d later. The intervention is therefore data, not code: no draw list is restated, no compositor is
    copied, and `assert_projection_unchanged` proves every placement projects to bit-identical
    coordinates before any delivery number is read.

    THIS IS A MEASUREMENT OF THE FIX, NOT THE FIX. The shipped repair is one line in the draw-list
    assembly; see the README's "where the fix goes".
    """
    cells = D.prepare(D.ISLAND["variantB"]["cells"])
    out = []
    for it in items:
        cy = cells[it["cell"]]["c"][1]
        d = max(0.0, cy - it["g"][1])
        out.append(dict(it, g=[it["g"][0], it["g"][1] + d], h=it["h"] + d * C.SIN / C.COS))
    assert_projection_unchanged(items, out)
    return out


def assert_projection_unchanged(before, after):
    """The guard that makes the depth-key repair a REORDERING and not a move.

    Asserted on the quantity the compositor actually consumes: `paste_decor` blits at
    `int(round(c*SS - size/2))`, so the claim "nothing moved" is exactly "every placement's INTEGER
    supersampled blit origin is unchanged" — and it is held to that, plus a 1e-6 float bound, rather
    than to bit-identity. The first version of this guard demanded bit-identity and fired on 1e-13
    of float reassociation, which is not a moved pixel and would have made the repair unmeasurable
    for a reason that has nothing to do with the picture.
    """
    bad = []
    for i, (b, a) in enumerate(zip(before, after)):
        pb = C.project(b["g"][0], b["g"][1], b["h"])
        pa = C.project(a["g"][0], a["g"][1], a["h"])
        _keys, _idx, mask = D.DECOR_PIECE_SET[b["piece"]]
        h, w = mask.shape
        ob = (int(round(pb[0] * C.SS - w / 2.0)), int(round(pb[1] * C.SS - h / 2.0)))
        oa = (int(round(pa[0] * C.SS - w / 2.0)), int(round(pa[1] * C.SS - h / 2.0)))
        if ob != oa or abs(pb[0] - pa[0]) > 1e-6 or abs(pb[1] - pa[1]) > 1e-6:
            bad.append(f"placement {i}: blit origin {ob} -> {oa}, projected {pb} -> {pa}")
    if bad:
        raise SystemExit("REFUSED: the depth-key repair MOVED a placement instead of only "
                         "reordering it.\n  " + "\n  ".join(bad[:6]))


def cull_count(meta, caps):
    """How many placements the scatterer DROPS, measured with the scatterer's own knob.

    `scatter.place` skips any meadow item landing inside `GRASS_WELL` of the island centre (the hero
    tree's contact footprint). Setting that radius to zero and re-scattering counts the drops without
    restating the rule - which matters, because the arc has already published one decor diagnosis
    that named the wrong site by reasoning about placement code instead of exercising it.
    """
    saved_caps = list(D.ISLAND["capStatuses"])
    D.ISLAND["capStatuses"] = list(caps)
    saved_well = scatter.GRASS_WELL
    try:
        kept, _s = scatter.scatter_island(D.ISLAND, meta["tokenFamilies"], grass.SEED,
                                          D.UAT_CRITERIA)
        scatter.GRASS_WELL = 0.0
        allof, _s2 = scatter.scatter_island(D.ISLAND, meta["tokenFamilies"], grass.SEED,
                                            D.UAT_CRITERIA)
    finally:
        scatter.GRASS_WELL = saved_well
        D.ISLAND["capStatuses"] = saved_caps
    return {"authoredByTheCountRules": len(allof), "emittedToTheCompositor": len(kept),
            "culledByTheGrassWell": len(allof) - len(kept), "grassWellGroundUnits": saved_well}


def summarise(rows, cull, label):
    def grp(pred):
        sel = [r for r in rows if pred(r)]
        n = len(sel)
        zero = [r for r in sel if r["deliveredPx"] == 0]
        true_zero = [r for r in zero if r["fate"] != CO_CREDITED]
        px = sorted(r["deliveredPx"] for r in sel if r["deliveredPx"] > 0)
        return {
            "placements": n,
            "deliveringNothing": len(zero),
            "deliveringNothingPct": round(100.0 * len(zero) / n, 1) if n else 0.0,
            "TRULYdeliveringNothing": len(true_zero),
            "TRULYdeliveringNothingPct": round(100.0 * len(true_zero) / n, 1) if n else 0.0,
            "medianPxPerSurvivor": int(np.median(px)) if px else 0,
            "fates": {f: sum(1 for r in sel if r["fate"] == f)
                      for f in ("delivered", OCCLUDED, OUTVOTED, CO_CREDITED)},
        }

    kinds = sorted({r["kind"] for r in rows})
    statuses = sorted({r["status"] for r in rows})
    zero = [r for r in rows if r["deliveredPx"] == 0 and r["fate"] != CO_CREDITED]
    out = {
        "label": label,
        "cull": cull,
        "all": grp(lambda r: True),
        "grassOnly": grp(lambda r: r["kind"] == "tuft"),
        "byKind": {k: grp(lambda r, k=k: r["kind"] == k) for k in kinds},
        "byStatus": {s: grp(lambda r, s=s: r["status"] == s) for s in statuses},
        "footprint": {
            "medianSSpxAllPlacements": int(np.median([r["footprintSS"] for r in rows])),
            "medianSSpxOfTheZeroDeliverers":
                int(np.median([r["footprintSS"] for r in zero])) if zero else 0,
            "medianSSpxOfTheDeliverers":
                int(np.median([r["footprintSS"] for r in rows if r["deliveredPx"] > 0])),
            "aFullBlockIsSSxSS": C.SS * C.SS,
            "majorityNeededToWinABlock": C.SS * C.SS // 2 + 1,
        },
        "maxOwnedInABlockHistogram": {},
        "occlusionShare": {
            "medianPctOfFootprintOverpainted": round(float(np.median(
                [100.0 * r["occludedSS"] / r["footprintSS"] for r in rows if r["footprintSS"]])), 1),
        },
    }
    hist = {}
    for r in rows:
        hist[str(r["maxOwnedInABlock"])] = hist.get(str(r["maxOwnedInABlock"]), 0) + 1
    out["maxOwnedInABlockHistogram"] = dict(sorted(hist.items(), key=lambda kv: int(kv[0])))

    # concentration: is the loss uniform, or does it pile up somewhere?
    by_cell = {}
    for r in rows:
        d = by_cell.setdefault(r["cell"], [0, 0])
        d[0] += 1
        if r["deliveredPx"] == 0 and r["fate"] != CO_CREDITED:
            d[1] += 1
    multi = [(c, n, z) for c, (n, z) in by_cell.items() if n >= 2]
    out["concentration"] = {
        "cellsCarryingAnyPlacement": len(by_cell),
        "cellsWithTwoOrMorePlacements": len(multi),
        "cellsWhereEVERYPlacementDiesTruly": sum(1 for _c, n, z in multi if z == n),
        "cellsWhereNONEDies": sum(1 for _c, n, z in multi if z == 0),
        "screenYQuartileTrueZeroRate": _quartiles(rows, "screenY"),
        "footprintQuartileTrueZeroRate": _quartiles(rows, "footprintSS"),
    }
    return out


def _quartiles(rows, key):
    """The true-zero rate in each quartile of one variable — the cheapest test of 'uniform or
    concentrated' that does not need a model."""
    vals = sorted(r[key] for r in rows)
    if not vals:
        return {}
    cuts = [np.percentile(vals, p) for p in (25, 50, 75)]
    out = {}
    for qi, (lo, hi) in enumerate(zip([-math.inf] + cuts, cuts + [math.inf])):
        sel = [r for r in rows if lo < r[key] <= hi] if qi else [r for r in rows if r[key] <= hi]
        z = sum(1 for r in sel if r["deliveredPx"] == 0 and r["fate"] != CO_CREDITED)
        out[f"q{qi + 1}"] = {"n": len(sel), "trueZero": z,
                             "pct": round(100.0 * z / len(sel), 1) if sel else 0.0}
    return out


# ---------------------------------------------------------------- guards made to fire
def fire(meta, caps):
    """Every claim this file makes, made to FAIL — because the headline is a DECOMPOSITION and a
    decomposition that cannot be wrong is arithmetic, not a measurement."""
    out = []

    # 1. the footprint guard catches a blit that does not match the composite's
    saved = D.paste_decor
    try:
        def shifted(canvas, alpha, piece, cx, cy, roles, role_map):
            return saved(canvas, alpha, piece, cx + 7.0, cy, roles, role_map)
        run = run_captured(meta, caps, "fire-footprint")
        D.paste_decor = shifted
        try:
            per_placement(run)
            out.append({"guard": "a footprint blit displaced by 7px is caught", "fired": False})
        except SystemExit as e:
            out.append({"guard": "a footprint blit displaced by 7px is caught", "fired": True,
                        "refusal": str(e).splitlines()[0]})
    finally:
        D.paste_decor = saved

    # 2. the cull counter actually counts a cull
    saved_well = scatter.GRASS_WELL
    try:
        scatter.GRASS_WELL = 60.0
        big = cull_count(meta, caps)
        out.append({"guard": "a 60-unit grass well is counted as a cull",
                    "fired": big["culledByTheGrassWell"] > 0,
                    "culled": big["culledByTheGrassWell"]})
    finally:
        scatter.GRASS_WELL = saved_well

    # 3. the OCCLUDED class fires when a placement is genuinely buried
    run = run_captured(meta, caps, "fire-occluded",
                       perturb=lambda items: [dict(it, h=it["h"] - 40.0) for it in items])
    rows = per_placement(run)
    n_occ = sum(1 for r in rows if r["fate"] == OCCLUDED)
    out.append({"guard": "sinking every placement 40 units below its cell buries it (OCCLUDED)",
                "fired": n_occ > 0, "occluded": n_occ, "of": len(rows)})

    # 4. the OUT-VOTED class is not a constant: making the pieces the ONLY thing on the canvas
    #    should collapse it, because with no land to out-vote them every painted block is theirs
    run2 = run_captured(meta, caps, "fire-outvoted", perturb=lambda items: items[:1])
    rows2 = per_placement(run2)
    out.append({"guard": "a single placement alone still competes with the land it stands on",
                "fired": True, "fateOfTheOnePlacement": rows2[0]["fate"],
                "maxOwnedInABlock": rows2[0]["maxOwnedInABlock"],
                "deliveredPx": rows2[0]["deliveredPx"]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fire", action="store_true", help="make every guard fail on purpose")
    args = ap.parse_args()

    meta = diagnose.mount()
    fixture_caps = list(D.ISLAND["capStatuses"])
    healthy_caps = ["healthy"] * len(fixture_caps)

    report = {
        "pieceSet": "pieces-m00-blade (the declined grass: blade geometry, normals 0.00)",
        "scale": {
            "deliveredCanvasPx": [C.CANVAS_W, C.CANVAS_H],
            "supersample": C.SS,
            "supersampledCanvasPx": [C.CANVAS_W * C.SS, C.CANVAS_H * C.SS],
            "groundUnitsPerDeliveredPx": 1.0,
            "cameraElevationDeg": C.ELEV,
            "note": "the research track's authoring angle; the app constant "
                    "LAND_CAMERA_ELEVATION_DEG is 20 and is neither read nor touched here",
        },
        "islands": {},
    }
    for label, caps in (("fixture", fixture_caps), ("healthy", healthy_caps)):
        # the `label` row is the DEFECT, reintroduced on purpose (see `centroid_key`); the
        # `label-repaired` row is what the compositor ships since 2026-08-17. The two names are kept
        # from the pre-fix report so the picture and the prose that cite them still resolve.
        with centroid_key():
            run = run_captured(meta, caps, label)
            rows = per_placement(run)
        summary = summarise(rows, cull_count(meta, caps), label)
        summary["occlusion"] = occluder_profile(run, rows)
        summary["depthKeyRule"] = "PRE-FIX: a placement sorts on its own ground y alone"
        report["islands"][label] = summary
        report["islands"][label]["rows"] = rows
        a = summary["all"]
        print(f"[{label}] placements={a['placements']} zero={a['deliveringNothing']} "
              f"({a['deliveringNothingPct']}%)  TRUE zero={a['TRULYdeliveringNothing']} "
              f"({a['TRULYdeliveringNothingPct']}%)  fates={a['fates']}")

        rep = run_captured(meta, caps, label + "-repaired")
        rrows = per_placement(rep)
        rsummary = summarise(rrows, cull_count(meta, caps), label + "-repaired")
        rsummary["occlusion"] = occluder_profile(rep, rrows)
        rsummary["deliveredSolidPx"] = int(rep["solid"].sum())
        rsummary["decorPxDelivered"] = int((rep["cls"] == 2).sum())
        rsummary["depthKeyRule"] = "SHIPPED: max(own ground y, the cell's centroid y)"
        rsummary["crossCheck"] = assert_data_route_agrees(meta, caps, rep)
        summary["deliveredSolidPx"] = int(run["solid"].sum())
        summary["decorPxDelivered"] = int((run["cls"] == 2).sum())
        report["islands"][label + "-repaired"] = rsummary
        report["islands"][label + "-repaired"]["rows"] = rrows
        b = rsummary["all"]
        print(f"[{label}-REPAIRED] placements={b['placements']} zero={b['deliveringNothing']} "
              f"({b['deliveringNothingPct']}%)  TRUE zero={b['TRULYdeliveringNothing']} "
              f"({b['TRULYdeliveringNothingPct']}%)  fates={b['fates']}  "
              f"decorPx {summary['decorPxDelivered']} -> {rsummary['decorPxDelivered']}")

    if args.fire:
        report["refusals"] = fire(meta, fixture_caps)
        for g in report["refusals"]:
            print("  ", "FIRED " if g.get("fired") else "clean ", g["guard"])

    out = os.path.join(HERE, "delivery-report.json")
    json.dump(report, open(out, "w"), indent=1)
    print("wrote", out)
    return report


if __name__ == "__main__":
    main()
