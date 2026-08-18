#!/usr/bin/env python3
"""THE PICTURES AND THE NUMBERS: does the decided vegetation vocabulary read as SIGNAL at the
delivered scale, and what makes it so.

    python compose_grass.py            # -> six pictures, grass-report.json, provenance sidecars

The owner looked at the island-place-dressing pass and said the grass "looks rather ugly". This file
composes the fork sweep `blender_grass.py` renders and measures four things:

  1. THE NORMALS FORK — the arc's triage item 1, re-measured for grass instead of inheriting the
     crown's 0.22. `normalSweep`.
  2. THE GEOMETRY FORK — a welded clump on a base mound against N loose ribbons. `geometrySweep`.
  3. THE BASE FORK — the owner's own "maybe even just a flat green", against a mottled ground and
     against grass used AS the ground treatment. `baseFork`.
  4. SIGNAL LEGIBILITY — and this is the one that can FAIL the other three. `signalLegibility`.

WHY 4 OUTRANKS 1-3, stated here because it is the pass's whole thesis. ADR-0226 makes the grass a
READING OF THE WORK: its count is a capability's test count (D2) and its health is that capability's
proof state (D3). A treatment that makes the grass prettier while making 3 tests indistinguishable
from 30 has not improved the art, it has broken the instrument — ADR-0367 D5 and the
`meaning-outranks-appearance` principle both put the signal above the appearance. So every
prettification below is measured against the signal it is supposed to be carrying, and the answer is
a number rather than an impression.

EVERY COUNT IS TAKEN ON THE DELIVERED PIXEL AND ALSO ON THE RAW ONE, and the pass turns on the gap
between them. Art that survives at supersampled resolution and loses every majority vote at the
delivered scale has bought a reader nothing — and measuring only one of the two is how a treatment
gets adopted on the strength of a difference no viewer will ever see.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import grass                                            # noqa: E402
import compose_core as D                                # noqa: E402
import scatter                                          # noqa: E402

C = D.C
provenance = D.provenance
INK, DIM, HI = (232, 232, 232), (150, 150, 156), (255, 236, 160)
BG = (24, 24, 26)


def tag_for(mix, geom):
    return "pieces-m%02d-%s" % (round(mix * 100), geom)


# ---------------------------------------------------------------- delivered-pixel instruments
def delivered(decor_items, ground="flat", caps=None, tree=False):
    """One composite, taken to the DELIVERED raster. Returns (rgb int16, solid mask)."""
    img, solid, _colours, _g = D.render_variant(decor_items, caps=caps, tree=tree, ground=ground)
    return img[:, :, :3].astype(np.int16), solid


def changed_px(a, b):
    """How many DELIVERED pixels differ between two composites.

    This is the pass's unit of "how much did that art actually buy a reader". Deliberately a
    difference against a baseline rather than a count of decor-coloured pixels: a tuft standing on
    ground that snaps to the same palette entry has changed nothing a reader can see, and a count of
    where-the-tuft-is would score it anyway.
    """
    return int((np.any(a != b, axis=2)).sum())


def components(mask):
    """Connected components of a boolean mask (4-connectivity), largest first.

    The crown's own instrument, one scale down: a highlight scattered into many small caps reads as
    speckle, the same value structure pooled into a few large ones reads as a form. Written out here
    rather than pulled from scipy because this pass adds no dependency the track does not have.
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            n, stack = 0, [(y, x)]
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            sizes.append(n)
    return sorted(sizes, reverse=True)


def piece_delivered(name, tokens):
    """ONE piece, taken through the same back half it meets on the island, in isolation.

    The island composite is where the art is JUDGED — a component judged against nothing is not
    judged. This is the diagnostic instrument underneath that judgement: what the tuft itself is
    doing, in pixels, without the ground's own colours in the count.
    """
    pw = int(D.DECOR_META["pieceCanvasWorld"])
    cnv = np.zeros((pw * C.SS, pw * C.SS, 3), dtype=np.float32)
    alp = np.zeros((pw * C.SS, pw * C.SS), dtype=np.float32)
    D.paste_decor(cnv, alp, D.DECOR_PIECE_SET[name], pw / 2.0, pw / 2.0,
                  tokens, D.DECOR_META["pieceRoles"][name])
    keep = alp > 0.5
    snapped = np.where(keep[:, :, None], C.snap(cnv), 0.0)
    saved = (C.CANVAS_W, C.CANVAS_H)
    C.CANVAS_W = C.CANVAS_H = pw
    rgb, sol = C.mode_down(snapped.astype(np.int32), keep)
    C.CANVAS_W, C.CANVAS_H = saved
    return rgb.astype(np.int16), sol, np.where(keep[:, :, None], C.snap(cnv), 0.0).astype(np.int16)


def raw_opaque(dirname, name):
    """The RAW Blender render's opaque pixels — the supersampled truth, before the back half."""
    a = np.array(Image.open(os.path.join(HERE, dirname, f"{name}.png")).convert("RGBA")).astype(int)
    return a, a[:, :, 3] > 0


def tuft_instrument(name, tokens):
    """The confetti instrument, on one tuft at delivered scale.

    `deliveredColours` — how many palette entries the tuft occupies. 1 is a flat blob with no form
        left; 3 on a sliver a few pixels wide is confetti.
    `litCaps` / `largestLitCapShare` — the lit band's connected components. A lit band broken into
        four 2 px caps is speckle; the same pixel budget pooled into one cap is a lit face.
    """
    rgb, sol, _ss = piece_delivered(name, tokens)
    px = int(sol.sum())
    if px == 0:
        return {"deliveredPx": 0}
    uniq = np.unique(rgb[sol].reshape(-1, 3), axis=0)
    lit_rgb = np.array(C.shade(C.hexrgb(tokens["bladeFront"]), 1.00), dtype=np.float32)
    lit_snapped = C.snap(lit_rgb.reshape(1, 1, 3))[0, 0].astype(np.int16)
    lit_mask = np.all(rgb == lit_snapped, axis=2) & sol
    caps = components(lit_mask)
    return {
        "deliveredPx": px,
        "deliveredColours": int(len(uniq)),
        "litPx": int(lit_mask.sum()),
        "litCaps": len(caps),
        "largestLitCapShareOfLitPct": round(100.0 * caps[0] / max(1, int(lit_mask.sum())), 1)
        if caps else 0.0,
    }


# ---------------------------------------------------------------- the island's own story
UAT_CRITERIA = D.UAT_CRITERIA
CELLS = D.prepare(D.ISLAND["variantB"]["cells"])
ISLAND = D.ISLAND


def carpet_items(meta, per_cell=grass.CARPET_PER_CELL):
    """THE `carpet` BASE — grass used as the GROUND TREATMENT rather than as a signal.

    A fixed quota per cell, independent of any capability's test count. Tinted by the cell's own
    status, so this is the most FAVOURABLE version of the option rather than a straw man: a carpet
    that ignored status would be easier to refuse and would prove less.

    Placements are drawn from the same deterministic address space as the signal scatter but under a
    different prefix, so a carpet tuft and a signal tuft never coincide by construction.
    """
    items = []
    cx, cy = ISLAND["islandCentreGround"]
    for i, cell in enumerate(CELLS):
        status = ISLAND["capStatuses"][cell["cap"]]
        toks = meta["tokenFamilies"]["blade"][status]
        for k in range(per_cell):
            addr = ("carpet", i, k)
            # The FIXED single-cell sampler (2026-08-18). This line used to call the affine-CRC32
            # `_sample_in_cell`, so the carpet's tufts stood on their cell's bounding-box diagonal
            # exactly as the meadow's did — the collapse is a property of the DRAW and does not care
            # that the cell here is given rather than chosen.
            gx, gy, _fb = scatter.sample_in_cell(cell, addr)
            if math.hypot(gx - cx, gy - cy) < scatter.GRASS_WELL:
                continue
            items.append({"kind": "carpet",
                          "piece": "tuft-3a" if scatter.det(*addr, "v") < 0.5 else "tuft-3b",
                          "g": [gx, gy], "cell": i, "cap": cell["cap"], "status": status,
                          "h": cell["_h"], "roles": dict(toks)})
    return items


def scatter_at(meta, force_tests=None, force_status=None):
    """The delivered scatter, optionally with every capability driven to ONE test count or ONE
    status. That override is how the signal-legibility ladder is built: it holds the island, the
    piece set and the code state fixed and moves only the thing the vocabulary is supposed to be
    reading."""
    if force_status is not None:
        saved = list(ISLAND["capStatuses"])
        ISLAND["capStatuses"] = [force_status] * len(saved)
    if force_tests is not None:
        real = scatter.capability_tests
        scatter.capability_tests = lambda ci, st, sd: force_tests
    try:
        return scatter.scatter_island(ISLAND, meta["tokenFamilies"], grass.SEED, UAT_CRITERIA)
    finally:
        if force_tests is not None:
            scatter.capability_tests = real
        if force_status is not None:
            ISLAND["capStatuses"] = saved


# ================================================================= the refusals, before any pixel
D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
INPUTS = C.piece_inputs([("pieces-land", D.LAND_PIECES)]
                        + [(tag_for(m, g), os.path.join(HERE, tag_for(m, g)))
                           for g in grass.GEOMETRIES for m in grass.NORMAL_MIXES])
CODE_STATE = D.require_one_state_per_generator(INPUTS)
D.assert_land_unchanged()
print(f"refusals passed — {len(INPUTS)} piece directories, "
      f"{len(CODE_STATE['generators'])} generators at one state each", flush=True)

REPORT = {
    "question": "does ADR-0226's DECIDED vegetation vocabulary read as SIGNAL rather than noise at "
                "delivered pixel scale, and what makes it so",
    "occasion": "the owner looked at the island-place-dressing pass and said the grass 'looks "
                "rather ugly', and proposed a basic/flat base with the grass left to carry test "
                "density. The SECOND half of that is already DECIDED — ADR-0226 D2/D3/D4 — so this "
                "pass re-decides nothing and measures the LOOK plus the BASE.",
    "camera": {"elevationDeg": C.ELEV,
               "appLandCameraElevationDeg": grass.APP_LAND_CAMERA_ELEVATION_DEG,
               "note": "the app-side constant is NOT touched by this pass"},
    "codeState": CODE_STATE,
}

HEALTHY_BLADE = D.DECOR_META["tokenFamilies"]["blade"]["healthy"]
DEAD_BLADE = D.DECOR_META["tokenFamilies"]["blade"]["unhealthy"]
BASE_ITEMS, BASE_STATS = scatter_at(D.DECOR_META)
BARE, BARE_SOLID = delivered([])
LAND_PX = int(BARE_SOLID.sum())
REPORT["landPx"] = LAND_PX

# ================================================================= 1. the two forks, swept
ISLANDS = {}
sweep = []
for geom in grass.GEOMETRIES:
    for mix in grass.NORMAL_MIXES:
        tag = tag_for(mix, geom)
        D.use_pieces(tag, expect_mix=mix, expect_geometry=geom)
        row = {"normalMix": mix, "geometry": geom}
        row.update(tuft_instrument("tuft-3a", HEALTHY_BLADE))

        # THE GAP THE PASS TURNS ON: what the lever does BEFORE the back half, against what
        # survives it. Measured on the raw Blender render, against the same geometry at mix 0.
        cur, cur_op = raw_opaque(tag, "tuft-3a")
        ref, _ref_op = raw_opaque(tag_for(0.0, geom), "tuft-3a")
        row["rawOpaquePx"] = int(cur_op.sum())
        row["rawPxRepaintedVsMix0"] = int(np.any(cur != ref, axis=2).sum())
        row["rawRepaintedPct"] = round(100.0 * row["rawPxRepaintedVsMix0"]
                                       / max(1, row["rawOpaquePx"]), 1)

        isl, _s = delivered(BASE_ITEMS)
        ISLANDS[(mix, geom)] = isl
        row["islandDecorPx"] = changed_px(isl, BARE)
        row["islandDecorSharePct"] = round(100.0 * row["islandDecorPx"] / LAND_PX, 2)
        sweep.append(row)
        print(f"  mix {mix:.2f} {geom:<5} raw {row['rawOpaquePx']:>3} px "
              f"({row['rawRepaintedPct']:>5.1f}% repainted) -> delivered {row['deliveredPx']:>3} px, "
              f"{row['deliveredColours']} colours, lit {row['litPx']:>2} px in {row['litCaps']} cap "
              f"| island decor {row['islandDecorPx']} px", flush=True)

REPORT["normalSweep"] = [r for r in sweep if r["geometry"] == "blade"]
REPORT["geometrySweep"] = [r for r in sweep if r["geometry"] == "clump"]


def spread(rows, key):
    v = [r[key] for r in rows]
    return {"min": min(v), "max": max(v), "spreadPct": round(100.0 * (max(v) - min(v))
                                                             / max(1, min(v)), 1)}


REPORT["normalsVerdict"] = {
    "wired": all(r["rawRepaintedPct"] > 50 for r in REPORT["normalSweep"] if r["normalMix"] >= 0.45),
    "rawEffect": "the lever repaints "
                 f"{REPORT['normalSweep'][-1]['rawRepaintedPct']:.0f}% of the blade tuft's raw "
                 f"pixels at mix 1.0 — it is wired, and it is doing exactly what it did for the "
                 f"crown",
    "deliveredEffect": {
        "tuftDeliveredPx": spread(REPORT["normalSweep"], "deliveredPx"),
        "tuftDeliveredColours": spread(REPORT["normalSweep"], "deliveredColours"),
        "litCaps": spread(REPORT["normalSweep"], "litCaps"),
        "islandDecorPx": spread(REPORT["normalSweep"], "islandDecorPx"),
    },
    "theScaleProblem": {
        "crownRawPx": 4200,
        "crownMixAdopted": 0.22,
        "tuftRawOpaquePx": REPORT["normalSweep"][0]["rawOpaquePx"],
        "tuftDeliveredPx": REPORT["normalSweep"][0]["deliveredPx"],
        "reading": "the crown carried ~4200 delivered pixels and its highlight fragmented into "
                   "11-13 connected caps, which is a shading structure large enough to have a "
                   "shape and therefore large enough to unify. A tuft is a few dozen SUPERSAMPLED "
                   "pixels and single digits DELIVERED, and its lit band is already ONE connected "
                   "cap at every mix from 0.00 to 1.00. There is no fragmentation for the "
                   "technique to remove.",
    },
    "conclusion": "MEASURED AND REFUSED FOR GRASS, on numbers rather than on a look. The mechanism "
                  "transfers and is correctly wired — it is the same code path that closed the "
                  "crown's gap — but the majority downsample destroys the whole of its effect, "
                  "because a tuft has no shading structure at delivered scale to unify. This is "
                  "NOT a claim that the grass looks fine; it is a claim that custom normals are "
                  "not what is wrong with it.",
}

# ---- the pick, made by a STATED MECHANICAL RULE and not by taste -------------------------------
def pick_mix(rows):
    """THE RULE, written down so the choice is auditable and so a later session can disagree with
    the RULE rather than with a preference: maximise the largest connected LIT cap as a share of
    the lit band, subject to the tuft still carrying at least two delivered colours (one colour is
    a flat blob with no light and shade left), ties to the LOWER mix.

    On this pass's numbers the rule returns 0.00 for both geometries, and it returns it because
    every row is already a single lit cap at 100%. That is the rule reporting that the instrument
    is DEGENERATE at this scale, not the rule preferring the baseline.

    WHETHER ANY OF THIS LOOKS BETTER IS THE OWNER'S LOOK AND THIS RULE DOES NOT CLAIM IT.
    """
    ok = [r for r in rows if r["deliveredColours"] >= 2]
    return max(ok or rows, key=lambda r: (r["largestLitCapShareOfLitPct"], -r["normalMix"]))


PICK_BLADE, PICK_CLUMP = pick_mix(REPORT["normalSweep"]), pick_mix(REPORT["geometrySweep"])
REPORT["pick"] = {
    "rule": "maximise the largest connected LIT cap as a share of the lit band, subject to >= 2 "
            "delivered colours; ties to the lower mix",
    "blade": PICK_BLADE["normalMix"], "clump": PICK_CLUMP["normalMix"],
    "degenerate": all(r["litCaps"] == 1 for r in sweep),
    "crownMixNotInherited": {
        "crown": 0.22,
        "why": "0.22 is a strict optimum for a 4200 px crown picked against exp-16's highlight-cap "
               "structure. The mechanism transfers; the number is its own measurement, and this "
               "pass's measurement is that no number in 0..1 changes the delivered tuft.",
    },
    "notOwnerAttested": "this rule picks a MEASUREMENT. Whether the grass stops reading as ugly is "
                        "the owner's look and this pass has no standing to sign it.",
}
print(f"pick: blade {PICK_BLADE['normalMix']}, clump {PICK_CLUMP['normalMix']} "
      f"(instrument degenerate: {REPORT['pick']['degenerate']})", flush=True)

# ---- what the GEOMETRY fork buys, which is the fork that actually moves ------------------------
gb, gc = REPORT["normalSweep"][0], REPORT["geometrySweep"][0]
REPORT["geometryVerdict"] = {
    "atMix0": {"blade": {"rawOpaquePx": gb["rawOpaquePx"], "deliveredPx": gb["deliveredPx"],
                         "islandDecorPx": gb["islandDecorPx"],
                         "islandDecorSharePct": gb["islandDecorSharePct"]},
               "clump": {"rawOpaquePx": gc["rawOpaquePx"], "deliveredPx": gc["deliveredPx"],
                         "islandDecorPx": gc["islandDecorPx"],
                         "islandDecorSharePct": gc["islandDecorSharePct"]}},
    "deliveredPxRatio": round(gc["deliveredPx"] / max(1, gb["deliveredPx"]), 2),
    "islandDecorPxRatio": round(gc["islandDecorPx"] / max(1, gb["islandDecorPx"]), 2),
    "reading": "the geometry fork is the one that MOVES the delivered picture, and it moves it by "
               "giving the tuft a BODY rather than by shading it better — the base mound and the "
               "weld are silhouette, and silhouette is the only thing that survives a majority "
               "downsample at this size. This is the arc's own strategic takeaway ('sparse clump "
               "meshes rather than individual blades') arriving as a measurement.",
    "theCostToWeigh": "a clump is a bigger object, and the 2026-07-23 owner verdict on baked "
                      "sprite art was that it read 'way too big'. Bigger delivered pixels is "
                      "exactly what that verdict refused, so this is a FORK for the owner's look "
                      "and not a recommendation.",
}

# ================================================================= 2. SIGNAL LEGIBILITY
D.use_pieces(tag_for(PICK_BLADE["normalMix"], "blade"),
             expect_mix=PICK_BLADE["normalMix"], expect_geometry="blade")
PICK_META = D.DECOR_META

LADDERS = {}
for geom in grass.GEOMETRIES:
    D.use_pieces(tag_for(0.0, geom), expect_mix=0.0, expect_geometry=geom)
    rows = []
    for t in grass.TEST_COUNTS:
        items, _st = scatter_at(D.DECOR_META, force_tests=t)
        isl, _s = delivered(items)
        px = changed_px(isl, BARE)
        rows.append({"tests": t, "appGrassRule": f"round(2 + {t}*1.9) = {round(2 + t * 1.9)}",
                     "placements": len([i for i in items if i["kind"] != "flower"]),
                     "deliveredDecorPx": px,
                     "shareOfLandPct": round(100.0 * px / LAND_PX, 2)})
        if geom == "blade" and t in (1, 3, 8, 30):
            LADDERS[t] = isl
        print(f"  {geom:<5} tests={t:<3} {rows[-1]['placements']:>4} placements "
              f"{px:>5} delivered px  {rows[-1]['shareOfLandPct']:.2f}%", flush=True)
    LADDERS[geom] = rows

blade_rows = LADDERS["blade"]
mono = all(b["deliveredDecorPx"] > a["deliveredDecorPx"]
           for a, b in zip(blade_rows, blade_rows[1:]))
lo = next(r for r in blade_rows if r["tests"] == 3)
hi = next(r for r in blade_rows if r["tests"] == 30)
REPORT["signalLegibility"] = {
    "whyThisOutranksTheLook": "ADR-0226 D2 makes grass COUNT a capability's test count and D3 makes "
                              "grass HEALTH its proof state. A prettier grass that no longer "
                              "distinguishes 3 tests from 30 has broken the instrument, and "
                              "ADR-0367 D5 plus the meaning-outranks-appearance principle both put "
                              "the signal above the appearance.",
    "testCountLadder": {"blade": blade_rows, "clump": LADDERS["clump"]},
    "strictlyMonotonicInDeliveredPx": {"blade": mono,
                                       "clump": all(b["deliveredDecorPx"] > a["deliveredDecorPx"]
                                                    for a, b in zip(LADDERS["clump"],
                                                                    LADDERS["clump"][1:]))},
    "threeVsThirty": {
        "blade": {"deliveredPx": [lo["deliveredDecorPx"], hi["deliveredDecorPx"]],
                  "ratio": round(hi["deliveredDecorPx"] / max(1, lo["deliveredDecorPx"]), 2),
                  "sharePct": [lo["shareOfLandPct"], hi["shareOfLandPct"]]},
    },
    "normalsAreSignalSafe": {
        "islandDecorPxByMix": {f"{r['normalMix']:g}": r["islandDecorPx"]
                               for r in REPORT["normalSweep"]},
        "spreadPct": spread(REPORT["normalSweep"], "islandDecorPx")["spreadPct"],
        "why": "normals decide which BAND a pixel takes and never whether a pixel is grass — the "
               "same property the arc measured on the hero tree, where bark held flat at 629-631 "
               "px across the entire 0..1 crown-normal fork. So however much of this treatment is "
               "applied, the density signal is safe BY CONSTRUCTION. That is the cheapest good "
               "news in the pass, and it is the reason a look-driven change here cannot silently "
               "cost meaning.",
    },
}

# ---- the health read (ADR-0226 D3) --------------------------------------------------------------
D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
HEALTH_IMG = {}
health = {}
for st in grass.HEALTH_PAIR:
    items, _st = scatter_at(D.DECOR_META, force_status=st)
    isl, sol = delivered(items, caps=[st] * len(ISLAND["capStatuses"]))
    HEALTH_IMG[st] = isl
    health[st] = {"placements": len([i for i in items if i["kind"] != "flower"]),
                  "landColours": len({tuple(int(v) for v in c) for c in isl[sol].reshape(-1, 3)})}

snap_h = C.snap(np.array(C.shade(C.hexrgb(HEALTHY_BLADE["bladeFront"]), 1.0),
                         dtype=np.float32).reshape(1, 1, 3))[0, 0].astype(np.int16)
snap_u = C.snap(np.array(C.shade(C.hexrgb(DEAD_BLADE["bladeFront"]), 1.0),
                         dtype=np.float32).reshape(1, 1, 3))[0, 0].astype(np.int16)
hchanged = changed_px(HEALTH_IMG["healthy"], HEALTH_IMG["unhealthy"])
REPORT["signalLegibility"]["healthRead"] = {
    "changedDeliveredPx": hchanged,
    "changedSharePctOfLand": round(100.0 * hchanged / LAND_PX, 1),
    "bladeTokenAfterSnap": {"healthy": [int(v) for v in snap_h],
                            "unhealthy": [int(v) for v in snap_u]},
    "bladeTokenRgbDistance": round(float(np.linalg.norm((snap_h - snap_u).astype(float))), 1),
    "collapsedToSameEntry": bool(np.array_equal(snap_h, snap_u)),
    "perStatus": health,
    "note": "the whole island is driven to one status in turn, so nothing moves except what the "
            "land is SAYING. This read is carried mostly by the GROUND tint rather than by the "
            "grass, which is the same finding the base fork reaches from the other direction: at "
            "1-2% ground cover the grass cannot be the thing that changes an island's colour.",
}

# ---- can two capabilities be told apart ON ONE ISLAND ------------------------------------------
by_cap = {r["cap"]: r for r in BASE_STATS["perCapability"]}
ordered = sorted(by_cap.values(), key=lambda r: r["tests"])
probe = [ordered[0], ordered[-1]] + [r for r in ordered if r["status"] == "unhealthy"][:1]
percap = []
for rec in probe:
    only = [i for i in BASE_ITEMS if i.get("cap") == rec["cap"] and i["kind"] != "flower"]
    isl, _s = delivered(only)
    px = changed_px(isl, BARE)
    percap.append({"cap": rec["cap"], "status": rec["status"], "tests": rec["tests"],
                   "cells": rec["cells"], "placements": len(only), "deliveredDecorPx": px,
                   "pxPerCell": round(px / max(1, rec["cells"]), 2)})
REPORT["signalLegibility"]["perCapabilityOnTheDeliveredIsland"] = {
    "probed": percap,
    "note": "3 of the island's 10 capabilities — fewest tests, most tests, and the unhealthy one — "
            "because each row costs a full composite. `pxPerCell` is the read a viewer actually "
            "makes: how much grass per unit of ground this capability's parcel carries.",
}

# ================================================================= 3. THE BASE FORK
D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
CARPET = carpet_items(D.DECOR_META)
BASES = {}
base_rows = []
for base in grass.BASES:
    extra = CARPET if base == "carpet" else []
    isl, _s = delivered(BASE_ITEMS + extra, ground=("mottle" if base == "mottle" else "flat"))
    ground_only, _s2 = delivered(extra, ground=("mottle" if base == "mottle" else "flat"))
    BASES[base] = isl
    signal_px = changed_px(isl, ground_only)
    base_px = changed_px(ground_only, BARE)
    base_rows.append({
        "base": base,
        "description": {"flat": "the settled b++ ground exactly as delivered — one flat "
                                "status-tinted fill per cell. The owner's 'maybe even just a flat "
                                "green'.",
                        "mottle": "the same ground carrying a deterministic two-shade split per "
                                  "cell, drawn from (token x shade) pairs the closed palette "
                                  "already holds. Ground interest that claims nothing about the "
                                  "work.",
                        "carpet": "grass used AS the ground treatment: a fixed per-cell quota that "
                                  "does NOT scale with test count, under the signal tufts."}[base],
        "groundTreatmentDeliveredPx": base_px,
        "groundTreatmentSharePct": round(100.0 * base_px / LAND_PX, 2),
        "signalDeliveredPx": signal_px,
        "signalSharePct": round(100.0 * signal_px / LAND_PX, 2),
        "signalFractionOfNonFlatPct": round(100.0 * signal_px / max(1, signal_px + base_px), 1),
    })
    print(f"  base {base:<7} ground {base_px:>5} px  signal {signal_px:>5} px  "
          f"signal is {base_rows[-1]['signalFractionOfNonFlatPct']:.0f}% of what is not flat ground",
          flush=True)

REPORT["baseFork"] = {
    "rows": base_rows,
    "whyCarpetIsRenderedRatherThanArguedAway":
        "the technique reference's one transferable strategic takeaway is 'rely ~80% on the terrain "
        "treatment, sparse clump meshes rather than individual blades', and the obvious way to "
        "spend that here is a carpet of grass. Under ADR-0226 grass MEANS a capability's tests, so "
        "a carpet that tracks no test count is art asserting something the meaning layer does not "
        "authorise — ADR-0367 D5's failure. `signalFractionOfNonFlatPct` is what that costs as a "
        "number: it is the share of the island's non-flat-ground pixels that still SAY anything.",
    "whatTheConstraintDoesToTheTakeaway":
        "the takeaway is STRONGER for us than for the game it comes from, and in the opposite "
        "direction to the obvious reading. Delivered land is quantised at small pixel scale, so "
        "detail below the quantisation threshold does not become subtle — it becomes noise. That "
        "argues for the terrain carrying the look, which is the takeaway; it argues AGAINST the "
        "terrain carrying it as GRASS, which is the naive implementation.",
}

# ================================================================= 4. THE PICTURES
PAD, HDR, CAP = 10, 46, 34


def board(img):
    return Image.fromarray(C.on_board(img.astype(np.uint8)), "RGB")


def with_tree(items, ground="flat", caps=None):
    img, _sol, _c, _g = D.render_variant(items, tree=True, ground=ground, caps=caps)
    return Image.fromarray(C.on_board(img), "RGB")


def sheet(w, h, title, sub):
    im = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(im)
    dr.text((PAD, 8), title, fill=INK)
    dr.text((PAD, 24), sub, fill=DIM)
    return im, dr


CAM = (f"camera {C.ELEV:g} deg (owner look verdict 2026-08-16) - LAND_CAMERA_ELEVATION_DEG is "
       f"still {grass.APP_LAND_CAMERA_ELEVATION_DEG:g} and is NOT touched by this pass")

# ---- 1. the normals sweep: raw against delivered -----------------------------------------------
Z = 7
pw = int(D.DECOR_META["pieceCanvasWorld"])
cols = len(grass.NORMAL_MIXES)
cellw = pw * Z
im, dr = sheet(PAD + cols * (cellw + PAD), HDR + 2 * (cellw + CAP) + 14,
               "THE NORMALS FORK, RAW vs DELIVERED - one grass tuft (tuft-3a, healthy), "
               "custom-normal mix 0.00 -> 1.00",
               "TOP: the Blender render, supersampled.  BOTTOM: the same tuft after the closed-"
               "palette snap and the majority downsample - what actually ships.")
for i, mix in enumerate(grass.NORMAL_MIXES):
    tag = tag_for(mix, "blade")
    D.use_pieces(tag, expect_mix=mix, expect_geometry="blade")
    rgb, sol, ss = piece_delivered("tuft-3a", HEALTHY_BLADE)
    raw = np.array(Image.open(os.path.join(HERE, tag, "tuft-3a.png")).convert("RGBA"))
    x = PAD + i * (cellw + PAD)
    top = Image.new("RGB", (raw.shape[1], raw.shape[0]), tuple(int(v) for v in C.BOARD))
    top.paste(Image.fromarray(raw[:, :, :3], "RGB"), (0, 0), Image.fromarray(raw[:, :, 3], "L"))
    im.paste(top.resize((cellw, cellw), Image.NEAREST), (x, HDR))
    low = np.full((pw, pw, 3), C.BOARD, dtype=np.uint8)
    low[sol] = rgb[sol].astype(np.uint8)
    im.paste(Image.fromarray(low, "RGB").resize((cellw, cellw), Image.NEAREST),
             (x, HDR + cellw + CAP))
    row = next(r for r in REPORT["normalSweep"] if r["normalMix"] == mix)
    dr.text((x + 3, HDR + cellw + 6), f"mix {mix:.2f}", fill=HI if mix == 0 else INK)
    dr.text((x + 3, HDR + cellw + 19), f"{row['rawRepaintedPct']:.0f}% raw px repainted", fill=DIM)
    dr.text((x + 3, HDR + 2 * cellw + CAP + 6),
            f"{row['deliveredPx']} px, {row['deliveredColours']} colours", fill=INK)
    dr.text((x + 3, HDR + 2 * cellw + CAP + 19),
            f"lit {row['litPx']} px in {row['litCaps']} cap", fill=DIM)
im.save(os.path.join(HERE, "grass-normals-sweep.png"))
print("wrote grass-normals-sweep.png", im.size, flush=True)

# ---- 2. the geometry fork ----------------------------------------------------------------------
im, dr = sheet(PAD + 2 * (cellw + PAD), HDR + 2 * (cellw + CAP) + 14,
               "THE GEOMETRY FORK - N loose ribbons against ONE welded clump on a base mound",
               "same blade arithmetic, same tokens, same code state, normals OFF in both. "
               "TOP raw, BOTTOM delivered.")
for i, geom in enumerate(grass.GEOMETRIES):
    tag = tag_for(0.0, geom)
    D.use_pieces(tag, expect_mix=0.0, expect_geometry=geom)
    rgb, sol, _ss = piece_delivered("tuft-3a", HEALTHY_BLADE)
    raw = np.array(Image.open(os.path.join(HERE, tag, "tuft-3a.png")).convert("RGBA"))
    x = PAD + i * (cellw + PAD)
    top = Image.new("RGB", (raw.shape[1], raw.shape[0]), tuple(int(v) for v in C.BOARD))
    top.paste(Image.fromarray(raw[:, :, :3], "RGB"), (0, 0), Image.fromarray(raw[:, :, 3], "L"))
    im.paste(top.resize((cellw, cellw), Image.NEAREST), (x, HDR))
    low = np.full((pw, pw, 3), C.BOARD, dtype=np.uint8)
    low[sol] = rgb[sol].astype(np.uint8)
    im.paste(Image.fromarray(low, "RGB").resize((cellw, cellw), Image.NEAREST),
             (x, HDR + cellw + CAP))
    row = next(r for r in sweep if r["normalMix"] == 0.0 and r["geometry"] == geom)
    dr.text((x + 3, HDR + cellw + 6), geom.upper(), fill=HI)
    dr.text((x + 3, HDR + cellw + 19), f"{row['rawOpaquePx']} raw opaque px", fill=DIM)
    dr.text((x + 3, HDR + 2 * cellw + CAP + 6),
            f"{row['deliveredPx']} delivered px", fill=INK)
    dr.text((x + 3, HDR + 2 * cellw + CAP + 19),
            f"island decor {row['islandDecorPx']} px = {row['islandDecorSharePct']}% of land",
            fill=DIM)
im.save(os.path.join(HERE, "grass-geometry-fork.png"))
print("wrote grass-geometry-fork.png", im.size, flush=True)

# ---- 3+4. the island, and the same crop at 5x --------------------------------------------------
PANELS = [
    (tag_for(0.0, "blade"), 0.0, "blade",
     "TODAY - loose ribbons, normals off (the pass the owner called ugly)"),
    (tag_for(1.0, "blade"), 1.0, "blade",
     "NORMALS AT FULL - mix 1.00, the most this technique can do"),
    (tag_for(0.0, "clump"), 0.0, "clump",
     "CLUMP - welded, on a base mound, normals off"),
]
imgs = []
for tag, mix, geom, _cap in PANELS:
    D.use_pieces(tag, expect_mix=mix, expect_geometry=geom)
    imgs.append(with_tree(BASE_ITEMS))

Z1 = 3
cw = max(i.size[0] for i in imgs)
ch = max(i.size[1] for i in imgs)
im, dr = sheet(PAD + len(imgs) * (cw * Z1 + PAD), HDR + ch * Z1 + CAP,
               "THE GRASS ON THE ISLAND - one island, one land, one code state, three grass "
               "treatments", CAM)
for i, (img, (_t, _m, _g, cap)) in enumerate(zip(imgs, PANELS)):
    x = PAD + i * (cw * Z1 + PAD)
    pad_img = Image.new("RGB", (cw, ch), tuple(int(v) for v in C.BOARD))
    pad_img.paste(img, (0, 0))
    im.paste(pad_img.resize((cw * Z1, ch * Z1), Image.NEAREST), (x, HDR))
    dr.text((x + 3, HDR + ch * Z1 + 6), cap, fill=HI if i == 0 else INK)
im.save(os.path.join(HERE, "grass-on-island.png"))
print("wrote grass-on-island.png", im.size, flush=True)

DZ = 6
gx, gy = ISLAND["islandCentreGround"]
px, py = C.project(gx, gy, 0.0)
cw2, ch2 = 108, 68
box = (int(px - cw2 * 0.52), int(py - ch2 * 0.28), int(px + cw2 * 0.48), int(py + ch2 * 0.72))
im, dr = sheet(PAD + len(imgs) * (cw2 * DZ + PAD), HDR + ch2 * DZ + CAP,
               "JUDGE THE ART HERE - the same crop of the same island at 6x",
               "a tuft is single-digit delivered pixels, so the component is judged where it "
               "stands, against the land's own palette - never on a piece sheet")
for i, (img, (_t, _m, _g, cap)) in enumerate(zip(imgs, PANELS)):
    im.paste(img.crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST),
             (PAD + i * (cw2 * DZ + PAD), HDR))
    dr.text((PAD + i * (cw2 * DZ + PAD) + 3, HDR + ch2 * DZ + 6), cap, fill=HI if i == 0 else INK)
im.save(os.path.join(HERE, "grass-detail-6x.png"))
print("wrote grass-detail-6x.png", im.size, flush=True)

# ---- 5. the base fork --------------------------------------------------------------------------
D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
bimgs = []
for base in grass.BASES:
    extra = CARPET if base == "carpet" else []
    bimgs.append(with_tree(BASE_ITEMS + extra, ground=("mottle" if base == "mottle" else "flat")))
im, dr = sheet(PAD + len(bimgs) * (cw2 * DZ + PAD), HDR + ch2 * DZ + CAP + 16,
               "THE BASE TREATMENT FORK - how much of the look should the GROUND carry? (6x crop)",
               "the owner's 'maybe even just a flat green', against ground interest that claims "
               "nothing, against grass used as the ground itself")
for i, (img, base) in enumerate(zip(bimgs, grass.BASES)):
    x = PAD + i * (cw2 * DZ + PAD)
    im.paste(img.crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST), (x, HDR))
    row = base_rows[i]
    dr.text((x + 3, HDR + ch2 * DZ + 6), base.upper(), fill=HI if base == "flat" else INK)
    dr.text((x + 3, HDR + ch2 * DZ + 20),
            f"ground treatment {row['groundTreatmentDeliveredPx']} px "
            f"({row['groundTreatmentSharePct']}% of land)", fill=DIM)
    dr.text((x + 3, HDR + ch2 * DZ + 33),
            f"the signal is {row['signalFractionOfNonFlatPct']:.0f}% of what is not flat ground",
            fill=DIM if base != "carpet" else (232, 150, 150))
im.save(os.path.join(HERE, "base-treatment-fork.png"))
print("wrote base-treatment-fork.png", im.size, flush=True)

# ---- 6. signal legibility ----------------------------------------------------------------------
LAD_T = (1, 3, 8, 30)
lad_imgs = []
for t in LAD_T:
    items, _st = scatter_at(D.DECOR_META, force_tests=t)
    lad_imgs.append(with_tree(items))
hl_imgs = []
for st in grass.HEALTH_PAIR:
    items, _st = scatter_at(D.DECOR_META, force_status=st)
    hl_imgs.append(with_tree(items, caps=[st] * len(ISLAND["capStatuses"])))

ROWH = ch2 * DZ + CAP + 16
im, dr = sheet(PAD + 4 * (cw2 * DZ + PAD), HDR + 2 * ROWH + 10,
               "DOES THE SIGNAL STILL READ? - the measurement that outranks the look "
               "(ADR-0226 D2 tests, D3 health)",
               "a prettier grass that no longer distinguishes 3 tests from 30 has broken the "
               "instrument, not improved the art")
for i, t in enumerate(LAD_T):
    x = PAD + i * (cw2 * DZ + PAD)
    im.paste(lad_imgs[i].crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST), (x, HDR))
    row = next(r for r in blade_rows if r["tests"] == t)
    dr.text((x + 3, HDR + ch2 * DZ + 6), f"{t} TESTS per capability", fill=INK)
    dr.text((x + 3, HDR + ch2 * DZ + 20), f"{row['placements']} placements", fill=DIM)
    dr.text((x + 3, HDR + ch2 * DZ + 33),
            f"{row['deliveredDecorPx']} delivered px = {row['shareOfLandPct']}% of land", fill=DIM)
for i, st in enumerate(grass.HEALTH_PAIR):
    x = PAD + i * (cw2 * DZ + PAD)
    y = HDR + ROWH
    im.paste(hl_imgs[i].crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST), (x, y))
    dr.text((x + 3, y + ch2 * DZ + 6), st.upper(), fill=INK)
    dr.text((x + 3, y + ch2 * DZ + 20),
            f"{health[st]['placements']} placements, {health[st]['landColours']} land colours",
            fill=DIM)
dr.text((PAD + 2 * (cw2 * DZ + PAD), HDR + ROWH + 10),
        f"HEALTH (D3): {REPORT['signalLegibility']['healthRead']['changedDeliveredPx']} delivered "
        f"px differ = "
        f"{REPORT['signalLegibility']['healthRead']['changedSharePctOfLand']}% of the island;",
        fill=INK)
dr.text((PAD + 2 * (cw2 * DZ + PAD), HDR + ROWH + 26),
        f"blade tokens stay {REPORT['signalLegibility']['healthRead']['bladeTokenRgbDistance']:.0f} "
        f"apart in RGB after the snap (collapsed: "
        f"{REPORT['signalLegibility']['healthRead']['collapsedToSameEntry']})", fill=DIM)
dr.text((PAD + 2 * (cw2 * DZ + PAD), HDR + ROWH + 46),
        f"DENSITY (D2): 3 tests -> {lo['deliveredDecorPx']} px, 30 tests -> "
        f"{hi['deliveredDecorPx']} px", fill=INK)
dr.text((PAD + 2 * (cw2 * DZ + PAD), HDR + ROWH + 62),
        f"strictly monotonic across {len(grass.TEST_COUNTS)} counts: {mono}; "
        f"3->30 is {REPORT['signalLegibility']['threeVsThirty']['blade']['ratio']}x", fill=DIM)
im.save(os.path.join(HERE, "signal-legibility.png"))
print("wrote signal-legibility.png", im.size, flush=True)

# ================================================================= the report and the sidecars
REPORT["paletteEntries"] = int(len(C.PALETTE))
REPORT["uatCriteria"] = UAT_CRITERIA
REPORT["deliveredIslandScatter"] = {k: v for k, v in BASE_STATS.items() if k != "perCapability"}
REPORT["deliveredIslandPerCapability"] = BASE_STATS["perCapability"]
with open(os.path.join(HERE, "grass-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

PICTURES = ("grass-normals-sweep.png", "grass-geometry-fork.png", "grass-on-island.png",
            "grass-detail-6x.png", "base-treatment-fork.png", "signal-legibility.png")
for pic in PICTURES:
    provenance.write_sidecar(
        os.path.join(HERE, pic), __file__, sys.argv[1:], INPUTS, CODE_STATE,
        extra={"cameraElevationDeg": C.ELEV,
               "variant": "b++ land + ADR-0226 vegetation vocabulary, grass forks swept",
               "scatterSeed": grass.SEED,
               "normalMixes": list(grass.NORMAL_MIXES),
               "geometries": list(grass.GEOMETRIES),
               "island": {"sha256": provenance.sha256_file(D.ISLAND_PATH)}})
print("code state", (CODE_STATE or {}).get("sha256", "UNDECLARED")[:12],
      "| palette entries", len(C.PALETTE), "| wrote grass-report.json + 6 sidecars", flush=True)
