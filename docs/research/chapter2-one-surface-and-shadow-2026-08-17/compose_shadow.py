#!/usr/bin/env python3
"""ONE SURFACE, AND A SHADOW ON IT — the healthy island with the hash-picked colour noise collapsed
and an author-time shadow put in the range that frees up.

    python compose_shadow.py            # -> 5 pictures + shadow-report.json + sidecars

THE OWNER, 2026-08-16, verbatim — and the second half is the half that matters:

    "the green on the land is not consistent either with different mesh trianles rendering different
     colors, and the mess lines as well add to the noise. I think all of this was okay in 2d, but in
     3d its very noisy and DOESNT MAKE SPACE FOR SHADOWS WHICH IS ONE OF THE BIGGER WINS OF GOING 3D."

Two increments, ONE unit, because removing the noise and gaining the shadow are the same move. A
shadow is a low-frequency luminance gradient across a surface; a surface already carrying three
hash-picked colour variants plus a tan wheat subset has no dynamic range left for one to be legible
in. Delivering them separately would have measured neither.

NO FOURTH COMPOSITOR. The track already has three copies of a ~700-line compositor with nothing
watching them (recorded in the healthy-island README). This file adds none: it IMPORTS
`compose_healthy.py` whole — with its output redirected to a scratch directory so the delivered
pictures of that pass are never touched — and gets its refusals, its island mount, its measurement
functions and its sheet layer from there, `compose_core.compose_land` for the land itself and
`compose.back_half` for the palette snap. What is genuinely new is `shadow.py` and the ~20-line
`panel()` below, which exists only because the shadow has to be applied at a point that sits BETWEEN
those two calls and no existing function offers that seam.

THE FENCE. The whole diff is `docs/research/**`. `packages/forest-world/src/substrate.ts:237` is the
DIAGNOSED CAUSE of the colour noise and is deliberately NOT edited — the owner fenced this work out
of the app on 2026-08-16 (*"isolate this away from the main app until we ready"*), so the app-side
implication is written down rather than made. `verify.py` asserts the fence mechanically.
"""
import importlib.util
import json
import math
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HEALTHY = os.path.join(REPO, "docs", "research", "chapter2-healthy-island-2026-08-16")
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(REPO, "docs", "research", "chapter2-hex-lines-and-flat-green-2026-08-16")
SWEEP = os.path.join(REPO, "docs", "research", "chapter2-camera-elevation-sweep-2026-08-15")

sys.path.insert(0, HERE)
sys.path.insert(0, HEALTHY)
sys.path.insert(0, GRASS)
sys.path.insert(0, LINES)
sys.path.insert(0, os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))

import island_pass as P                                    # noqa: E402
import provenance                                          # noqa: E402
import seams as S                                          # noqa: E402
import shadow as SH                                        # noqa: E402

OUT = os.environ.get("STORYTREE_SHADOW_OUT") or HERE

# THE ONE LEVER THE REFUSAL HARNESS PULLS, and it is here for the same reason `compose_healthy.py`
# takes its inputs from the environment. The central guard below is a NEGATIVE — *the shadow does not
# change what any cell says* — and a negative is worth exactly what the instrument that failed to find
# anything is worth. So `verify_refusal.py` drives this module, in this directory, with the floor
# pushed past the measured ceiling, and requires the guard to refuse a REAL composed picture rather
# than a swatch. `STORYTREE_SHADOW_OUT` sends that run's writes to a scratch directory, so a guard
# that fails to fire cannot overwrite the delivered pictures with its perturbed ones.
if os.environ.get("STORYTREE_SHADOW_FLOOR"):
    SH.SHADOW_FLOOR = float(os.environ["STORYTREE_SHADOW_FLOOR"])
    SH.SHADOW_LEVELS = SH.ladder_for(SH.SHADOW_FLOOR)
    g = float(os.environ.get("STORYTREE_SHADOW_GAIN", "1"))
    SH.TERRAIN_CAST, SH.TREE_CAST, SH.JOIN_AO = (SH.TERRAIN_CAST * g, SH.TREE_CAST * g, SH.JOIN_AO * g)
    print(f"OVERRIDE: shadow floor {SH.SHADOW_FLOOR} ladder {SH.SHADOW_LEVELS} gain {g}", flush=True)

#: THE ONE SURFACE. `substrate.ts:237` gives every cell `variant = hash(...) % 3` plus a `wheat`
#: override; `scene.ts:3128` renders it. On this island all eleven capabilities are `healthy`, so that
#: variation is provably not semantic — PR #1382 measured it at SIX distinct delivered cell fills with
#: the status variable entirely removed, 21 of 162 cells (13.0%) TAN on a green island.
#:
#: Collapsing it is one line of DATA, not of code: every cell is drawn at variant 0 with wheat off. No
#: compositor is modified and no token is re-authored, which is what keeps this a one-variable fork.
ONE_SURFACE_VARIANT = 0


# =====================================================================================================
# import the healthy-island pass WHOLE, with its writes sent to scratch
# =====================================================================================================
def _load_healthy():
    """Run `compose_healthy.py` in ITS OWN directory with `STORYTREE_HEALTHY_OUT` pointed at a scratch
    dir — the mechanism its own refusal harness uses.

    Its module-level refusals are this pass's refusals too and are the expensive, load-bearing half:
    the piece set is valid for this island's geometry, one code state per generator, the camera is the
    signed one, island/proof/`island_pass.STORY_ID` name ONE story, no status outside the RENDERED
    vocabulary, every `healthy` backed by a signed pass (ADR-0040), and the land pass byte-identical to
    the shipped compositor on BOTH islands. Importing rather than restating means a shadow can never be
    composed over an island those refusals would have declined to draw.
    """
    tmp = tempfile.mkdtemp(prefix="one-surface-shadow-")
    saved = os.environ.get("STORYTREE_HEALTHY_OUT")
    os.environ["STORYTREE_HEALTHY_OUT"] = tmp
    try:
        spec = importlib.util.spec_from_file_location(
            "compose_healthy_imported", os.path.join(HEALTHY, "compose_healthy.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        if saved is None:
            os.environ.pop("STORYTREE_HEALTHY_OUT", None)
        else:
            os.environ["STORYTREE_HEALTHY_OUT"] = saved
        shutil.rmtree(tmp, ignore_errors=True)


print("mounting the healthy-island pass (its refusals are this pass's refusals) ...", flush=True)
CH = _load_healthy()
D = CH.D
C = CH.C
REPORT = {}

# The hero tree sprite this pass casts from — the SAME frame `compose_core.plant_tree` composites, read
# through the same registration, so the shadow and the tree it belongs to can never disagree.
_TREE_DIR = os.path.join(SWEEP, "tree-%s" % ("%g" % C.ELEV).replace(".", "p"), "frames")
_TREE_REG = json.load(open(os.path.join(_TREE_DIR, "registration.json")))
_TREE_SPRITE = np.array(Image.open(os.path.join(_TREE_DIR, _TREE_REG["frameOrder"][-1]))
                        .convert("RGBA"), dtype=np.float32)


# =====================================================================================================
# the panel driver — the ONLY new composition code, and it exists for one seam
# =====================================================================================================
def panel(one_surface=False, shade=None, palette=None, tree=True):
    """One delivered composite. Mounts the island, suppresses the interior seams (owner-decided), and
    optionally collapses the variant/wheat noise and multiplies a light field into the canvas.

    The three calls are `D.compose_land` (the land), `field * canvas` (this pass) and `C.back_half`
    (the palette snap). `D.render_variant` already chains the first and third, which is why this is a
    near-copy of it — the shadow has to enter BETWEEN them, because a shadow composited after the snap
    is a raw gradient shipped as land, the ADR-0145 failure at island scale.
    """
    island = CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
    cells = D.prepare(island["variantB"]["cells"])
    if one_surface:
        for c in cells:
            c["variant"] = ONE_SURFACE_VARIANT
            c["wheat"] = False
    lattice = ({"tiles": island["hexLattice"]["tiles"]} if "hexLattice" in island
               else S.load_hex_lattice())
    ctrl = S.SeamControl(C, island, lattice).install()
    ctrl.reset(P.SEAMS_DRAWN)
    saved_palette = C.PALETTE
    try:
        if palette is not None:
            C.PALETTE = palette
        canvas, alpha, tree_h = D.compose_land([], cells=cells, ground=P.GROUND)
        if shade is not None:
            canvas = canvas * shade[:, :, None]
        img, solid = C.back_half(canvas, alpha)
        colours = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
        if tree:
            img, _g, _r = D.plant_tree(img, tree_h)
    finally:
        C.PALETTE = saved_palette
        ctrl.restore()
    return img, solid, colours, cells, canvas


# =====================================================================================================
# 1. THE LIGHT RIG, re-measured from the delivered art on every run
# =====================================================================================================
PIECE_LIGHT = SH.measure_light_azimuth_from_pieces(CH.LAND_PIECES)
TREE_LIGHT, TREE_CROWN_PX = SH.measure_light_azimuth_from_tree(
    os.path.join(_TREE_DIR, _TREE_REG["frameOrder"][-1]))
_toward, _falls = SH.light_ground_direction(C.SIN)

if not PIECE_LIGHT["litSideIsScreenLeft"]:
    raise SystemExit(
        "REFUSED: the land pieces' `wall_lit` band is NOT to screen-left of `wall_dark` "
        f"({PIECE_LIGHT['wall_lit']} vs {PIECE_LIGHT['wall_dark']}), so the piece set this pass is "
        "about to shade is lit from the other side than `shadow.LIGHT_SCREEN_FROM` declares. A cast "
        "shadow disagreeing with the faces it falls across is worse than no shadow.")
if TREE_LIGHT[0] > 0 or SH.LIGHT_SCREEN_FROM[0] > 0:
    raise SystemExit(
        f"REFUSED: the hero tree's crown brightens toward {TREE_LIGHT} — not screen-left — while "
        f"LIGHT_SCREEN_FROM is {SH.LIGHT_SCREEN_FROM}. The land and the tree would read as two scenes.")

REPORT["lightRig"] = {
    "authoredKeyRotationDeg": list(SH.KEY_ROT_DEG),
    "keyElevationDeg": SH.KEY_ELEVATION_DEG,
    "treeShadowElevationDeg": SH.TREE_SHADOW_ELEVATION_DEG,
    "lightScreenFrom": list(SH.LIGHT_SCREEN_FROM),
    "lightGroundToward": [round(v, 4) for v in _toward],
    "shadowFallsTowardGround": [round(v, 4) for v in _falls],
    "measuredFromLandPieces": {k: (round(v, 1) if isinstance(v, float) else v)
                               for k, v in PIECE_LIGHT.items()},
    "measuredFromHeroTreeCrown": {"brightensToward": [round(v, 3) for v in TREE_LIGHT],
                                  "crownPx": TREE_CROWN_PX},
    "reading":
        "the rig is READ from the delivered art, not restated: the land pieces put their lit wall "
        "band to screen-LEFT of their dark one, and the hero tree's crown brightens up-left by a "
        "least-squares fit over its own pixels. Two generators, two shading models, one answer. "
        "Both generators already share `KEY_ROT = (48, 0, 34)`, so the land and the tree agreeing is "
        "a property this pass INHERITS and must not break, rather than one it establishes.",
    "honestGap":
        "working that euler by hand gives the opposite sign on screen x. One of the two is wrong "
        "about a convention (Blender's euler order, its sun default axis, or the compositor's "
        "ground-y flip relative to the render camera). The delivered pixels are what the owner "
        "looked at, so they win — and the disagreement is recorded rather than resolved.",
}
print(f"light rig: from screen {SH.LIGHT_SCREEN_FROM} (pieces lit-left={PIECE_LIGHT['litSideIsScreenLeft']}, "
      f"crown brightens {tuple(round(v, 2) for v in TREE_LIGHT)}), key {SH.KEY_ELEVATION_DEG:g} deg, "
      f"canopy {SH.TREE_SHADOW_ELEVATION_DEG:g} deg", flush=True)


# =====================================================================================================
# 2. THE FIELD
# =====================================================================================================
_island = CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
_cells = D.prepare(_island["variantB"]["cells"])
_tree_h = C.centre_height(_cells, D.ELEVATION_MODE)
_tree_ground = tuple(_island["islandCentreGround"])
FIELD, FIELD_STATS = SH.build(C, _cells, tree_ground=_tree_ground, sprite=_TREE_SPRITE,
                              anchor=_TREE_REG["groundSocketAnchor"])
PALETTE_SHIPPED = C.PALETTE
PALETTE_LIT = SH.extended_palette(C.PALETTE)
print(f"shadow field built: {FIELD_STATS['landPctDarkened']}% of land px darkened, "
      f"min multiplier {FIELD_STATS['minMultiplier']:.3f} | palette {len(PALETTE_SHIPPED)} -> "
      f"{len(PALETTE_LIT)} entries", flush=True)


# =====================================================================================================
# 3. THE PANELS — one variable at a time
# =====================================================================================================
# 0. as the track has been shipping it since PR #1382: seams already off, but the hash-picked variant
#    rotation and the wheat subset still in. Taken from the imported pass rather than re-composed, so
#    the baseline IS that pass's delivered surface and not a re-derivation of it.
AS_SHIPPED, AS_SHIPPED_SOLID = CH.SURFACE, CH.SURFACE_SOLID
AS_SHIPPED_BARE, AS_SHIPPED_BARE_SOLID = CH.SURFACE_BARE, CH.SURFACE_BARE_SOLID

print("composing 1/3: one surface, no shadow ...", flush=True)
FLAT, FLAT_SOLID, FLAT_COLOURS, _, _ = panel(one_surface=True)
FLAT_BARE, FLAT_BARE_SOLID, _c, _, FLAT_CANVAS = panel(one_surface=True, tree=False)

print("composing 2/3: one surface + shadow, SHIPPED palette ...", flush=True)
UNCLOSED, UNCLOSED_SOLID, UNCLOSED_COLOURS, _, _ = panel(one_surface=True, shade=FIELD)
UNCLOSED_BARE, UNCLOSED_BARE_SOLID, _c, _, _ = panel(one_surface=True, shade=FIELD, tree=False)

print("composing 3/3: one surface + shadow, palette CLOSED over the light ladder ...", flush=True)
LIT, LIT_SOLID, LIT_COLOURS, LIT_CELLS, _ = panel(one_surface=True, shade=FIELD, palette=PALETTE_LIT)
LIT_BARE, LIT_BARE_SOLID, _c, _, _ = panel(one_surface=True, shade=FIELD, palette=PALETTE_LIT, tree=False)

CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
ISLAND = D.ISLAND
CELLS = ISLAND["variantB"]["cells"]


# =====================================================================================================
# 4. MEASUREMENT — all of it on the TREE-LESS renders
# =====================================================================================================
# THE OCCLUSION TRAP, INHERITED. The healthy-island pass recorded it as one of the four things it got
# wrong first: the hero tree composites ON TOP of the land at 1:1, so a cell whose projected centroid
# falls under the canopy reports TRUNK pixels as its modal land fill. It moved that pass's seam cost
# from 4.87% to 6.21%. Every number below is therefore read off a tree-less composite; only the
# delivered pictures keep the tree.
# THE MASK EVERY ASSERTION RUNS OVER: cell TOP FACES, derived from the cells' own projected polygons
# and never from colour. Walls, the coast, the cell edges and `back_half`'s deliberately
# palette-unrestricted silhouette rim are all outside it — the rim because that function's own
# docstring says a green cell's rim may LEGALLY land on another family's entry, so a tint claim
# asserted over it would fail on the authored rim rule and say nothing about tint.
TOP_FACES = SH.top_face_mask(C, CELLS, erode=1)


def cell_bodies(img, solid):
    """Top faces, minus `back_half`'s silhouette RIM — and the rim is excluded by that function's OWN
    definition of it rather than by an eroding approximation of it.

    The rim is not an oversight to erode away: `back_half` deliberately lets it reach the whole
    palette, darkening from the local colour and re-snapping, so *"a green cell's rim can legally land
    on another family's entry"*. It was worth being exact here — an erosion of the CELL raster alone
    left four island-edge pixels in the mask, every one of them a rim pixel landing at the authored
    0.76 rim shade, and they were the entire residue of the strict status guard.
    """
    pad = np.pad(solid, 1, constant_values=False)
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    return TOP_FACES & solid & nb


def luma(img):
    return (img[:, :, :3].astype(np.float32) * C.W_LUMA).sum(axis=2)


def dynamic_range(img, solid):
    """What a shadow actually buys, as a number. A flat mosaic has a narrow luminance range; a surface
    with light on it has a wide one AND a low-frequency structure to that width.

    Both halves are reported, because the first alone is gameable — three hash-picked colour variants
    also widen a range, and widening it with noise is the thing this pass is removing.
    """
    body = cell_bodies(img, solid)
    L = luma(img)[body]
    if not len(L):
        return {}
    lo, hi = float(np.percentile(L, 2)), float(np.percentile(L, 98))
    return {
        "bodyPx": int(len(L)),
        "lumaMin": round(float(L.min()), 1), "lumaMax": round(float(L.max()), 1),
        "lumaP2": round(lo, 1), "lumaP98": round(hi, 1),
        "lumaRangeP2toP98": round(hi - lo, 1),
        "lumaStdDev": round(float(L.std()), 2),
        "distinctLumaLevels": int(len(np.unique(np.round(L, 1)))),
    }


def cell_fills(img, solid):
    return CH.cell_modal_fill(img, solid, ISLAND)


#: The colours a WALL can deliver. `cell_modal_fill` centre-samples a 5x5 at each cell's projected
#: centroid, and on a terraced island some cells' centroids fall on the wall of the cell in front —
#: so two of the "cell fills" the prior pass counted are side-token pixels, not top faces. Both counts
#: are reported: its number, so the two passes are comparable, and the top-face-only number, which is
#: what "the land reads as one surface" actually means.
SIDE_COLOURS = {tuple(int(round(v * lv)) for v in C.shade(C.hexrgb(tk["side"]), m))
                for tk in C.STATUS_TOKENS.values() for m in set(C.KEY_SHADE.values())
                for lv in (1.0,) + SH.SHADOW_LEVELS}


def fill_summary(fills):
    seen = sorted({f for f in fills if f is not None})
    tops = [c for c in seen if c not in SIDE_COLOURS]
    return {"distinctDeliveredCellFills": len(seen),
            "colours": ["#%02x%02x%02x" % c for c in seen],
            "distinctTopFaceFills": len(tops),
            "topFaceColours": ["#%02x%02x%02x" % c for c in tops]}


F_SHIPPED = cell_fills(AS_SHIPPED_BARE, AS_SHIPPED_BARE_SOLID)
F_FLAT = cell_fills(FLAT_BARE, FLAT_BARE_SOLID)
F_UNCLOSED = cell_fills(UNCLOSED_BARE, UNCLOSED_BARE_SOLID)
F_LIT = cell_fills(LIT_BARE, LIT_BARE_SOLID)

REPORT["oneSurface"] = {
    "mechanism": {
        "file": "packages/forest-world/src/substrate.ts:237",
        "line": "quads.push({ owner, ids, variant: hash(`cell:${key}:${i}`) % 3, wheat: cellWheat })",
        "renderedAt": "packages/forest-world/src/scene.ts:3128",
        "notEdited": True,
    },
    "cells": len(CELLS),
    "wheatCellsBefore": sum(1 for c in CELLS if c["wheat"]),
    "variantCellsBefore": {f"variant-{v}": sum(1 for c in CELLS if not c["wheat"] and c["variant"] == v)
                           for v in (0, 1, 2)},
    "deliveredCellFillsBefore": fill_summary(F_SHIPPED),
    "deliveredCellFillsAfter": fill_summary(F_FLAT),
    "cellFillsMoved": sum(1 for a, b in zip(F_SHIPPED, F_FLAT)
                          if a is not None and b is not None and a != b),
    "reading":
        "the collapse is DATA, not code: every cell is drawn at variant 0 with wheat off, through the "
        "same compositor, the same tokens and the same palette. Nothing about the status fold, the "
        "geometry or the piece set moves — which is what makes the fill count before and after a "
        "reading of the noise rather than of the change.",
}

REPORT["shadow"] = {
    "field": FIELD_STATS,
    "terms": {"terrainCast": SH.TERRAIN_CAST, "canopyCast": SH.TREE_CAST, "joinAO": SH.JOIN_AO,
              "floor": SH.SHADOW_FLOOR, "ladder": list(SH.SHADOW_LEVELS)},
    "treeWorldHeight": round(float(_TREE_REG["groundSocketAnchor"]["y"]) / C.COS, 1),
    "tallestTerraceStep": round(float(max(C.height_of(c, "cell") for c in CELLS)), 1),
    "aoIsStepDrivenNotJoinDriven":
        "AO is driven by the local height EXCESS and is identically zero across a join between two "
        "cells at one height. Applying it at every join would have redrawn, as a shade band, exactly "
        "the interior mesh seam the owner removed nine hours earlier at a cost of 1892 delivered px.",
}

RANGE_SHIPPED = dynamic_range(AS_SHIPPED_BARE, AS_SHIPPED_BARE_SOLID)
RANGE_FLAT = dynamic_range(FLAT_BARE, FLAT_BARE_SOLID)
RANGE_UNCLOSED = dynamic_range(UNCLOSED_BARE, UNCLOSED_BARE_SOLID)
RANGE_LIT = dynamic_range(LIT_BARE, LIT_BARE_SOLID)

changed_px = int(np.count_nonzero(
    np.any(LIT_BARE[:, :, :3].astype(np.int32) != FLAT_BARE[:, :, :3].astype(np.int32), axis=2)
    & (LIT_BARE_SOLID | FLAT_BARE_SOLID)))
island_px = int(np.count_nonzero(FLAT_BARE_SOLID))

REPORT["whatTheShadowBuys"] = {
    "asShipped": RANGE_SHIPPED,
    "oneSurfaceNoShadow": RANGE_FLAT,
    "oneSurfaceShadowShippedPalette": RANGE_UNCLOSED,
    "oneSurfaceShadowClosedPalette": RANGE_LIT,
    "deliveredPxChangedByTheShadow": changed_px,
    "islandPx": island_px,
    "pctOfIslandReached": round(100.0 * changed_px / max(1, island_px), 2),
    "reading":
        "read the two rows together. Collapsing the variants NARROWS the luminance range, because the "
        "range it removes was hash-picked noise. The shadow then re-spends range on a low-frequency "
        "gradient. Whether the second is worth more than the first is exactly the owner's look and "
        "this file has no standing to make it (ADR-0070 stage 2).",
}


# =====================================================================================================
# 5. DOES THE SHADOW SURVIVE THE SNAP — and does it corrupt status on the way
# =====================================================================================================
TABLE = SH.reader_status_table(C, faces="top")
TABLE_ALL = SH.reader_status_table(C, faces="all")
#: The one colour a healthy cell's TOP FILL delivers on the one-surface island, before any shadow.
DELIVERED_TOP = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT]), C.FLAT_LEVEL)

#: PIXELS THAT ARE UNAMBIGUOUSLY A CELL'S TOP FILL — every one of their supersamples is the top fill
#: in the UNSHADOWED canvas, read BEFORE the snap.
#:
#: The geometric top-face mask alone is not enough, and finding out why cost a debug dump rather than
#: a guess. The compositor stamps WALL sprites painter-ordered AFTER the cell behind them, so a wall
#: legitimately covers part of a farther cell's projected top face; and `mode_down` is a MAJORITY vote,
#: so a block holding both faces can tip from one to the other when the shadow moves the vote. Both
#: put pixels in a naive count that never changed what they SAY — they changed which face of the same
#: healthy cell won the block. Requiring the whole block to be the fill BEFORE the shadow removes both,
#: and it is not circular: the baseline is the reference and only the shadowed side is under test.
_want = np.array([int(round(v)) for v in DELIVERED_TOP], dtype=np.int32)
_pure = np.all(np.abs(FLAT_CANVAS.astype(np.int32) - _want) <= 0, axis=2)
PURE_FILL = (_pure.reshape(C.CANVAS_H, C.SS, C.CANVAS_W, C.SS).transpose(0, 2, 1, 3)
             .reshape(C.CANVAS_H, C.CANVAS_W, C.SS * C.SS).all(axis=2))


def status_read(img, solid):
    """What status each delivered cell-body pixel READS as, and the worst case on the island.

    This is the ADR-0367 D5 floor made into an instrument: land cells ARE the capability and their
    FILL carries the status, so a darkening pass is precisely the operation that can make a healthy
    cell read as a different status — art asserting something false. Every capability on this island
    is `healthy`, so any pixel reading as anything else is a defect with no ambiguity about intent.
    """
    body = cell_bodies(img, solid)
    rgb = img[:, :, :3][body]
    if not len(rgb):
        return {"bodyPx": 0, "mix": {}, "nonHealthyPx": 0, "nonHealthyPct": 0.0}
    reads = SH.nearest_status(rgb.astype(np.float32), TABLE, C.W_LUMA)
    names, counts = np.unique(reads, return_counts=True)
    mix = {str(n): int(c) for n, c in zip(names, counts)}
    bad = int(sum(v for k, v in mix.items() if k != "healthy"))
    return {"bodyPx": int(len(rgb)), "mix": mix, "nonHealthyPx": bad,
            "nonHealthyPct": round(100.0 * bad / len(rgb), 3)}


READ_SHIPPED = status_read(AS_SHIPPED_BARE, AS_SHIPPED_BARE_SOLID)
READ_FLAT = status_read(FLAT_BARE, FLAT_BARE_SOLID)
READ_UNCLOSED = status_read(UNCLOSED_BARE, UNCLOSED_BARE_SOLID)
READ_LIT = status_read(LIT_BARE, LIT_BARE_SOLID)


def reads_changed(before, after, solid):
    """THE GUARD, and the reason it is a DELTA rather than an absolute count.

    Asked absolutely — *"does any cell-body pixel read as a non-`healthy` status?"* — the instrument
    condemns the shipped art before the change: `crossReads` below measures 21 of the 78 colours the
    land may already emit reading as a status other than the one that authored them, at full light,
    with no shadow involved. A test that fails on the baseline cannot price the change.

    So the claim this pass is allowed to make is the one it can actually own: THE SHADOW MUST NOT
    CHANGE WHAT ANY PIXEL SAYS. Same island, same mask, same reader table, one variable — a pixel that
    read `healthy` before and reads `unknown` after is the art asserting something false, and it is
    this pass's fault. A pixel that was already misread stays exactly as wrong as it was.
    """
    body = cell_bodies(before, solid)
    b = SH.nearest_status(before[:, :, :3][body].astype(np.float32), TABLE, C.W_LUMA)
    a = SH.nearest_status(after[:, :, :3][body].astype(np.float32), TABLE, C.W_LUMA)
    moved = b != a
    pairs, colours = {}, {}
    rb = before[:, :, :3][body].astype(np.int32)
    ra = after[:, :, :3][body].astype(np.int32)
    for x, y, cb, ca in zip(b[moved], a[moved], rb[moved], ra[moved]):
        pairs[f"{x} -> {y}"] = pairs.get(f"{x} -> {y}", 0) + 1
        k = "#%02x%02x%02x -> #%02x%02x%02x" % (tuple(cb) + tuple(ca))
        colours[k] = colours.get(k, 0) + 1
    # THE CLAIM, NARROWED TO WHAT IT CAN ACTUALLY OWN — and narrowed by the BASELINE, which is what
    # keeps it from being circular: the before-side is the reference and only the after-side is under
    # test.
    #
    # Two mechanisms put pixels in the loose count that are not a fill changing its meaning. First,
    # `mode_down` is a MAJORITY vote over each supersample block, so a block straddling a cell and its
    # neighbour's wall can tip from the top colour to the wall colour when the shadow moves the vote —
    # a change of which SURFACE won the block. Second, the geometric top-face mask is built from the
    # cells' polygons alone, and the compositor also stamps WALL sprites, which are painter-ordered
    # AFTER the cell behind them and so legitimately cover part of a farther cell's projected top face.
    # Both were found by dumping the residue rather than assumed: every one of the loose pixels either
    # starts or ends on a side-token colour.
    #
    # So the strict count is: of the pixels that delivered the healthy top FILL EXACTLY with no shadow,
    # how many changed what they read as once the shadow was applied. That is the failure ADR-0367 D5
    # is about, stated so that it cannot be satisfied by construction.
    is_fill = PURE_FILL[body]
    sel = moved & is_fill
    strict = int(np.count_nonzero(sel))
    spairs = {}
    for cb, ca, x, y in zip(rb[sel], ra[sel], b[sel], a[sel]):
        k = "#%02x%02x%02x (%s) -> #%02x%02x%02x (%s)" % (tuple(cb) + (x,) + tuple(ca) + (y,))
        spairs[k] = spairs.get(k, 0) + 1
    return {"bodyPx": int(body.sum()), "pixelsWhoseStatusReadChanged": int(moved.sum()),
            "pctChanged": round(100.0 * float(moved.sum()) / max(1, int(body.sum())), 3),
            "pureFillPx": int(is_fill.sum()),
            "pureFillPxThatChangedWhatTheySay": strict,
            "pureFillColourPairs": dict(sorted(spairs.items(), key=lambda kv: -kv[1])[:10]),
            "transitions": dict(sorted(pairs.items(), key=lambda kv: -kv[1])),
            "colourPairs": dict(sorted(colours.items(), key=lambda kv: -kv[1])[:12])}


def ladder_survival(img, solid):
    """How many of the authored light levels actually reach the delivered raster.

    Each delivered cell-body colour is matched back against `healthy` top-token x ladder-level, which
    is the closed set the shadow is allowed to emit. A level with zero pixels was authored and then
    quantised away — the increment's *"if shadow does NOT survive quantisation, that finding is worth
    as much as a picture"*.
    """
    body = cell_bodies(img, solid)
    rgb = img[:, :, :3][body].astype(np.int32)
    # ONLY THE FLAT BAND, and the reason is a false positive this instrument had before it was
    # narrowed. Counting the SEAM band too made `0.8667 x 0.90 = 0.780` collide with the palette's
    # authored `chamfer_dark` level, so an entry that is present with NO shadow at all was being
    # reported as a surviving shadow rung — on the SHIPPED palette, where the honest answer is none.
    # With the interior seams off (owner-decided) a cell fill emits exactly one band, so restricting
    # to it is not a simplification; it is the only band a cell fill has.
    base = C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT])
    out, matched = {}, 0
    for lv in (1.0,) + SH.SHADOW_LEVELS:
        want = np.array([int(round(v * lv * C.FLAT_LEVEL)) for v in base], dtype=np.int32)
        n = int(np.count_nonzero(np.all(rgb == want, axis=1)))
        if n:
            out[f"light-{lv:g}"] = n
            matched += n
    # STATED, NOT SWEPT UNDER: the mask is geometric and the downsample is a MAJORITY vote, so a
    # top-face block lying against a cell edge can legitimately deliver its neighbour's or its own
    # wall's colour. Those pixels match no rung of the healthy top ladder and are counted here rather
    # than silently dropped, so the rung figures cannot be read as a share of something they are not.
    out["unmatchedByTheHealthyTopLadder"] = int(len(rgb)) - matched
    return out


REPORT["survivesTheSnap"] = {
    "shippedPaletteEntries": int(len(PALETTE_SHIPPED)),
    "lightClosedPaletteEntries": int(len(PALETTE_LIT)),
    "ladderOnShippedPalette": ladder_survival(UNCLOSED_BARE, UNCLOSED_BARE_SOLID),
    "ladderOnClosedPalette": ladder_survival(LIT_BARE, LIT_BARE_SOLID),
    "deliveredColoursShippedPalette": len(UNCLOSED_COLOURS),
    "deliveredColoursClosedPalette": len(LIT_COLOURS),
    "reading":
        "a closed palette is not a formality the shadow has to satisfy — it is the thing that decides "
        "whether a shadow exists at all. `snap()` clamps every pixel to the nearest entry it HOLDS, "
        "so shading a token the palette only holds at full light quantises the shadow back out. The "
        "closure here is taken against the DELIVERED palette rather than against the token tables, so "
        "it covers the coast sand too — the family `build_palette` records having missed once, at a "
        "cost of 2564 px of an `unknown` rim rendered `healthy` green with nothing failing.",
}

REPORT["statusIsNotCorrupted"] = {
    "asShipped": READ_SHIPPED,
    "oneSurfaceNoShadow": READ_FLAT,
    "oneSurfaceShadowShippedPalette": READ_UNCLOSED,
    "oneSurfaceShadowClosedPalette": READ_LIT,
    "test":
        "every delivered CELL-BODY pixel (silhouette rim and coast excluded) is matched to the nearest "
        "status by its `top` shades and its `side`, in the same luma-weighted space `snap` uses. All "
        "11 capabilities on this island are `healthy`, so any pixel reading as another status is a "
        "false assertion about the work — ADR-0367 D5, meaning outranks appearance.",
    "wheatExcludedFromTheReaderTable":
        "five of the six statuses share the identical wheat hex `#d6b271`, so wheat identifies no "
        "status (PR #1372). Including it would make every status equidistant and the test would "
        "answer nothing. That is a pre-existing defect of the token table, not one a shadow creates.",
}


if os.environ.get("STORYTREE_SHADOW_DEBUG"):
    _body = cell_bodies(FLAT_BARE, FLAT_BARE_SOLID & LIT_BARE_SOLID)
    _b = SH.nearest_status(FLAT_BARE[:, :, :3][_body].astype(np.float32), TABLE, C.W_LUMA)
    _a = SH.nearest_status(LIT_BARE[:, :, :3][_body].astype(np.float32), TABLE, C.W_LUMA)
    _ys, _xs = np.nonzero(_body)
    _sol = FLAT_BARE_SOLID & LIT_BARE_SOLID
    _pad = np.pad(_sol, 1, constant_values=False)
    _nb = _pad[:-2, 1:-1] & _pad[2:, 1:-1] & _pad[1:-1, :-2] & _pad[1:-1, 2:]
    for _i in np.nonzero(_b != _a)[0]:
        _y, _x = int(_ys[_i]), int(_xs[_i])
        print("DEBUG", _y, _x, "before", tuple(FLAT_BARE[_y, _x, :3].astype(int)),
              "after", tuple(LIT_BARE[_y, _x, :3].astype(int)),
              "nb", bool(_nb[_y, _x]), "topface", bool(TOP_FACES[_y, _x]),
              "field", round(float(FIELD[_y * C.SS + 1, _x * C.SS + 1]), 3),
              "solid8", int(_sol[max(0, _y - 1):_y + 2, max(0, _x - 1):_x + 2].sum()), flush=True)

MOVED_UNCLOSED = reads_changed(FLAT_BARE, UNCLOSED_BARE, FLAT_BARE_SOLID & UNCLOSED_BARE_SOLID)
MOVED_LIT = reads_changed(FLAT_BARE, LIT_BARE, FLAT_BARE_SOLID & LIT_BARE_SOLID)
REPORT["statusIsNotCorrupted"]["readChangedByTheShadow"] = {
    "shippedPalette": MOVED_UNCLOSED,
    "closedPalette": MOVED_LIT,
}

# --- WHAT THE TOKEN TABLE ALREADY DOES, BEFORE ANY SHADOW --------------------------------------------
# Reported because it is the reason the guard above is a delta, and because it is a finding in its own
# right that no prior pass on this arc has recorded.
CROSS = {"entries": 0, "crossReading": 0, "examples": []}
_top_levels = sorted({C.FLAT_LEVEL, C.SEAM_LEVEL, C.KEY_SHADE["chamfer_lit"], C.KEY_SHADE["chamfer_dark"]})
_side_levels = sorted(set(C.KEY_SHADE.values()))
for _st, _tk in C.STATUS_TOKENS.items():
    for _kind, _cols, _lvls in (("top", _tk["top"], _top_levels), ("side", [_tk["side"]], _side_levels)):
        for _t in _cols:
            for _m in _lvls:
                _c = C.shade(C.hexrgb(_t), _m)
                _r = str(SH.nearest_status(_c[None, None, :], TABLE_ALL, C.W_LUMA)[0, 0])
                CROSS["entries"] += 1
                if _r != _st:
                    CROSS["crossReading"] += 1
                    CROSS["examples"].append(
                        {"authored": _st, "face": _kind, "shade": _m,
                         "rgb": "#%02x%02x%02x" % tuple(int(round(v)) for v in _c), "readsAs": _r})
CROSS["pct"] = round(100.0 * CROSS["crossReading"] / max(1, CROSS["entries"]), 1)
CROSS["reading"] = (
    "the status-by-colour vocabulary is ALREADY ambiguous with no shadow anywhere near it. Over the "
    "closed set of colours the land may emit, this many read nearest to a status OTHER than the one "
    "that authored them — `healthy`'s dark wall band reads `unhealthy`, and `unknown`'s entire side "
    "family reads `healthy`. This is measured over the `faces=all` table (tops AND sides); the guard "
    "uses the narrower FILL-only table, where the same count is lower but still not zero. It is an "
    "app-side finding, written down and NOT acted on: the fence puts `packages/forest-world` and "
    "`apps/studio/src/index.css` out of scope for this pass.")
REPORT["crossReadsBeforeAnyShadow"] = CROSS


# --- HOW DEEP A SHADOW MAY GO BEFORE IT LIES ---------------------------------------------------------
# The number the ladder is DERIVED from. A guard proved only by passing is proved vacuously, so the
# breaking point is located by sweep rather than asserted to be beyond the ladder.
CEILING, CEIL_READ = SH.safe_depth(C, DELIVERED_TOP, TABLE)
DEPTH_ROWS = []
_m = 1.0
while _m > 0.60:
    _col = np.clip(DELIVERED_TOP * _m, 0, 255).astype(np.float32)
    DEPTH_ROWS.append({"multiplier": round(_m, 3),
                       "rgb": "#%02x%02x%02x" % tuple(int(round(v)) for v in _col),
                       "readsAs": str(SH.nearest_status(_col[None, None, :], TABLE, C.W_LUMA)[0, 0])})
    _m = round(_m - 0.02, 3)
FIRST_BAD = round(CEILING - 0.01, 3)

REPORT["howDeepBeforeItLies"] = {
    "deliveredTopFaceColour": "#%02x%02x%02x" % tuple(int(round(v)) for v in DELIVERED_TOP),
    "readsAsAtFullLight": CEIL_READ,
    "measuredCeiling": CEILING,
    "firstMultiplierReadingAsAnotherStatus": FIRST_BAD,
    "ladderDeepest": min(SH.SHADOW_LEVELS),
    "composedFloor": SH.SHADOW_FLOOR,
    "declaredMargin": SH.SHADOW_MARGIN,
    "actualMargin": round(min(SH.SHADOW_LEVELS) - CEILING, 3),
    "ladderIsWithinTheCeiling": bool(min(SH.SHADOW_LEVELS) >= CEILING + SH.SHADOW_MARGIN),
    "sweep": DEPTH_ROWS,
    # THE CEILING IS PER-STATUS, AND THIS ISLAND ONLY EXERCISES ONE OF THEM. Every capability here is
    # `healthy`, so the bound above is `healthy`'s. A real mixed island puts four tokens on the land at
    # once and the admissible depth is the MINIMUM over the ones present — which is a smaller number,
    # and worth knowing before anyone carries this ladder to a mixed surface.
    "ceilingPerRenderedStatus": {
        st: {"fill": "#%02x%02x%02x" % tuple(
            int(round(v)) for v in C.shade(C.hexrgb(C.STATUS_TOKENS[st]["top"][ONE_SURFACE_VARIANT]),
                                           C.FLAT_LEVEL)),
             "ceiling": SH.safe_depth(C, C.shade(C.hexrgb(C.STATUS_TOKENS[st]["top"][ONE_SURFACE_VARIANT]),
                                                 C.FLAT_LEVEL), TABLE)[0],
             "readsAsAtFullLight": SH.safe_depth(
                 C, C.shade(C.hexrgb(C.STATUS_TOKENS[st]["top"][ONE_SURFACE_VARIANT]), C.FLAT_LEVEL),
                 TABLE)[1]}
        for st in P.RENDERED_VOCABULARY},
    "reading":
        "the ladder is BOUNDED BY MEASUREMENT rather than chosen: the delivered top-face colour is "
        "darkened until the nearest status a reader could take it for stops being its own, and the "
        "deepest rung is kept a declared margin clear of that. `verify.py` re-measures the ceiling "
        "every run and fails if the ladder ever reaches past it, and `verify_refusal.py` drives a "
        "REAL composed picture past it and requires the guard to catch it.",
}
# --- THE GUARD, AS A REFUSAL --------------------------------------------------------------------------
# A REPORT LINE IS NOT A GUARD. `compose_healthy.py` made the same call about its own central claim and
# said why: *"a report explaining afterwards that the island was fabricated is not the same object as a
# composer that declines to draw one."* This pass's central claim is the ADR-0367 D5 floor — meaning
# outranks appearance — so a shadow that changes what a cell SAYS must stop the pictures being written,
# not annotate them.
_fail = MOVED_LIT["pureFillPxThatChangedWhatTheySay"]
if _fail or not REPORT["howDeepBeforeItLies"]["ladderIsWithinTheCeiling"]:
    raise SystemExit(
        f"REFUSED: the shadow corrupts status. {_fail} of {MOVED_LIT['pureFillPx']} pixels that "
        f"delivered the healthy top FILL unshadowed now read as a different status "
        f"{MOVED_LIT['pureFillColourPairs']}; ladder deepest {min(SH.SHADOW_LEVELS)} against a "
        f"measured ceiling of {CEILING} (margin required {SH.SHADOW_MARGIN}). Land cells ARE the "
        f"capability and the FILL carries the status, so this is the art asserting something false "
        f"about the work — ADR-0367 D5. No picture is written.")

print(f"ceiling {CEILING} (reads {CEIL_READ}) | ladder deepest {min(SH.SHADOW_LEVELS)} | "
      f"shadow changed the status read of {MOVED_LIT['pixelsWhoseStatusReadChanged']} of "
      f"{MOVED_LIT['bodyPx']} top-face px | cross-reads before any shadow "
      f"{CROSS['crossReading']}/{CROSS['entries']}", flush=True)


# =====================================================================================================
# 6. THE PICTURES
# =====================================================================================================
PAD, HDR, CAP = CH.PAD, CH.HDR, CH.CAP
INK, DIM, HI, WARN, GOOD = CH.INK, CH.DIM, CH.HI, CH.WARN, CH.GOOD
SHEET_MIN_W = 620
CAM = CH.CAM


def _rungs(key):
    """The ladder rungs that reached the delivered raster, as a caption fragment."""
    d = REPORT["survivesTheSnap"][key]
    got = sorted(k.replace("light-", "") for k in d if k.startswith("light-") and k != "light-1")
    return ("NONE — every shadow level was quantised away" if not got
            else " / ".join(got) + f" ({sum(v for k, v in d.items() if k.startswith('light-') and k != 'light-1')} px)")

b_shipped = CH.board(AS_SHIPPED)
b_flat = CH.board(FLAT)
b_unclosed = CH.board(UNCLOSED)
b_lit = CH.board(LIT)
IW, IH = b_lit.size

# ---- 1. THE DELIVERABLE ------------------------------------------------------------------------------
im1, dr1, T1 = CH.sheet(max(SHEET_MIN_W, PAD * 2 + IW), HDR + IH + CAP + 30,
                        "ONE SURFACE, WITH LIGHT ON IT",
                        f"`{P.STORY_ID}` — 11 capabilities, every one `healthy` off its own SIGNED "
                        f"pass. The hash-picked variant rotation and the wheat subset are collapsed "
                        f"to one material, and an author-time shadow is baked into the range that "
                        f"frees up: cast from the raised terracing at the authored key "
                        f"({SH.KEY_ELEVATION_DEG:g} deg), cast from the hero tree at the tree "
                        f"track's own shadow sun ({SH.TREE_SHADOW_ELEVATION_DEG:g} deg), and contact "
                        f"AO wherever a cell abuts a HIGHER neighbour.",
                        CAM)
im1.paste(b_lit, (PAD, T1))
CH.caption(dr1, PAD, T1 + IH + 6, [
    (f"{REPORT['oneSurface']['deliveredCellFillsBefore']['distinctDeliveredCellFills']} delivered cell "
     f"fills before -> {REPORT['oneSurface']['deliveredCellFillsAfter']['distinctDeliveredCellFills']} "
     f"with the noise collapsed; the shadow then reaches "
     f"{REPORT['whatTheShadowBuys']['pctOfIslandReached']}% of the island", GOOD),
    (f"the shadow changed the status read of {MOVED_LIT['pixelsWhoseStatusReadChanged']} of "
     f"{MOVED_LIT['bodyPx']} top-face pixels — the ADR-0367 D5 floor, measured as a delta against the "
     f"same island unshadowed rather than asserted", DIM),
    ("NOT OWNER-ATTESTED. Whether this reads right is the owner's look and this picture has no "
     "standing to make it.", WARN),
], im1.size[0] - 2 * PAD)
im1.save(os.path.join(OUT, "one-surface-and-shadow.png"))

# ---- 2. THE THREE MOVES, one variable at a time -----------------------------------------------------
im2, dr2, T2 = CH.sheet(PAD + 3 * (IW + PAD), HDR + IH + CAP + 70,
                        "TWO INCREMENTS, ONE MOVE — the noise out, the shadow in",
                        "One island, one code state, one piece set, one camera. Panel 1 is PR #1382's "
                        "delivered surface (interior mesh seams already removed). Panel 2 changes "
                        "DATA only — every cell drawn at variant 0 with wheat off. Panel 3 adds the "
                        "light field, multiplied into the canvas BEFORE the palette snap so the "
                        "shadow is quantised with the land rather than pasted over it.",
                        CAM)
for k, (img, title, cap, col) in enumerate([
        (b_shipped, "1. as shipped (PR #1382)",
         f"{REPORT['oneSurface']['deliveredCellFillsBefore']['distinctDeliveredCellFills']} cell fills; "
         f"{REPORT['oneSurface']['wheatCellsBefore']} of {len(CELLS)} cells TAN", WARN),
        (b_flat, "2. ONE SURFACE (no shadow)",
         f"{REPORT['oneSurface']['deliveredCellFillsAfter']['distinctDeliveredCellFills']} cell fills; "
         f"luma range {RANGE_FLAT.get('lumaRangeP2toP98')} (was {RANGE_SHIPPED.get('lumaRangeP2toP98')})",
         DIM),
        (b_lit, "3. + SHADOW (DELIVERED)",
         f"luma range {RANGE_LIT.get('lumaRangeP2toP98')}; reaches "
         f"{REPORT['whatTheShadowBuys']['pctOfIslandReached']}% of the island", HI)]):
    cx = PAD + k * (IW + PAD)
    im2.paste(img, (cx, T2))
    CH.caption(dr2, cx, T2 + IH + 6, [(title, INK), (cap, col)], IW)
CH.caption(dr2, PAD, T2 + IH + 46, [
    ("Read the luma rows together: collapsing the variants NARROWS the range, because what it removes "
     "was hash-picked noise. The shadow then re-spends range on a low-frequency gradient that carries "
     "form. Whether that trade reads better is the owner's look.", DIM),
], im2.size[0] - 2 * PAD)
im2.save(os.path.join(OUT, "three-moves.png"))

# ---- 3. DETAIL 6x -----------------------------------------------------------------------------------
Z = 6
ys, xs = np.where(LIT_SOLID)
cy0, cx0 = int(np.mean(ys)), int(np.mean(xs))
CW, CH_ = 92, 62
x0 = max(0, min(C.CANVAS_W - CW, cx0 - CW // 2))
y0 = max(0, min(C.CANVAS_H - CH_, cy0 - CH_ // 2))
zoom = [(t, im.crop((x0, y0, x0 + CW, y0 + CH_)).resize((CW * Z, CH_ * Z), Image.NEAREST))
        for t, im in [("as shipped (3 variants + wheat)", b_shipped),
                      ("ONE SURFACE", b_flat),
                      ("+ SHADOW (DELIVERED)", b_lit)]]
im3, dr3, T3 = CH.sheet(PAD + len(zoom) * (CW * Z + PAD), HDR + CH_ * Z + CAP,
                        "JUDGE THE ART HERE — the same crop at 6x, nearest-neighbour",
                        "Every block is ONE delivered pixel. Panel 1's colour differences are a hash; "
                        "panel 3's are a light direction. The wheat cells are the tan ones in panel 1 "
                        "and they carry no status a reader could act on — five of the six statuses "
                        "share the identical wheat hex.",
                        CAM)
for k, (t, img) in enumerate(zoom):
    cx = PAD + k * (CW * Z + PAD)
    im3.paste(img, (cx, T3))
    dr3.text((cx, T3 + CH_ * Z + 6), t, fill=(HI if k == 2 else (WARN if k == 0 else DIM)))
im3.save(os.path.join(OUT, "shadow-detail-6x.png"))

# ---- 4. DOES IT SURVIVE THE SNAP --------------------------------------------------------------------
im4, dr4, T4 = CH.sheet(PAD + 2 * (IW + PAD), HDR + IH + CAP + 118,
                        "A SHADOW ONLY EXISTS IF THE PALETTE HOLDS IT",
                        f"The land's palette is CLOSED — every colour it may emit is an authored token "
                        f"times an authored shade level — and `snap()` clamps everything else to the "
                        f"nearest entry it HOLDS. Same light field on both panels. Left: the shipped "
                        f"{len(PALETTE_SHIPPED)}-entry palette. Right: the same palette closed over "
                        f"the light ladder {list(SH.SHADOW_LEVELS)}, {len(PALETTE_LIT)} entries — a "
                        f"strict SUPERSET, so an unshadowed pixel still snaps to itself.",
                        CAM)
for k, (img, title, cap, col) in enumerate([
        (b_unclosed, f"shipped palette ({len(PALETTE_SHIPPED)} entries)",
         f"light levels surviving: {_rungs('ladderOnShippedPalette')}; "
         f"{MOVED_UNCLOSED['pixelsWhoseStatusReadChanged']} top-face px changed what they SAY", WARN),
        (b_lit, f"closed over the ladder ({len(PALETTE_LIT)} entries)",
         f"light levels surviving: {_rungs('ladderOnClosedPalette')}; "
         f"{MOVED_LIT['pixelsWhoseStatusReadChanged']} top-face px changed what they SAY", HI)]):
    cx = PAD + k * (IW + PAD)
    im4.paste(img, (cx, T4))
    CH.caption(dr4, cx, T4 + IH + 6, [(title, INK), (cap, col)], IW)
CH.caption(dr4, PAD, T4 + IH + 70, [
    ("`build_palette` records what a PARTIAL closure costs: the nearest surviving entry belonged to a "
     "different STATUS FAMILY and an `unknown` island's rim came out `healthy` green over 2564 px "
     "with nothing failing. A snap can only clamp toward what it holds, which is why the closure here "
     "is taken against the delivered palette and so covers the coast sand too.", DIM),
], im4.size[0] - 2 * PAD)
im4.save(os.path.join(OUT, "shadow-survives-the-snap.png"))

# ---- 5. HOW DEEP BEFORE IT LIES ---------------------------------------------------------------------
SWZ, SWH = 52, 40
rows = [r for r in DEPTH_ROWS if r["multiplier"] >= (FIRST_BAD - 0.06 if FIRST_BAD else 0.5)]
rows = rows[::2] if len(rows) > 14 else rows
im5, dr5, T5 = CH.sheet(max(SHEET_MIN_W, PAD * 2 + SWZ * len(rows)), HDR + SWH + 96,
                        "HOW DEEP A SHADOW MAY GO BEFORE IT LIES ABOUT THE WORK",
                        f"Land cells ARE the capability and the FILL carries the status, so a "
                        f"darkening pass is precisely the operation that can make a `healthy` cell "
                        f"read as a different one — ADR-0367 D5, meaning outranks appearance. The "
                        f"delivered top-face colour is darkened step by step and matched to the "
                        f"nearest status a reader could take its FILL for. It holds `healthy` down to "
                        f"{CEILING} and lies at {FIRST_BAD}; the ladder's deepest rung is "
                        f"{min(SH.SHADOW_LEVELS)}, a margin of "
                        f"{REPORT['howDeepBeforeItLies']['actualMargin']} clear of it, and the "
                        f"composed floor is {SH.SHADOW_FLOOR}.",
                        "the guard is made to FIRE past this point in verify_refusal.py, on a real "
                        "composed picture rather than on a swatch. " + CAM)
sx = PAD
for r in rows:
    rgb = tuple(int(r["rgb"][i:i + 2], 16) for i in (1, 3, 5))
    ok = r["readsAs"] == "healthy"
    dr5.rectangle([sx, T5, sx + SWZ - 5, T5 + SWH], fill=rgb)
    dr5.text((sx, T5 + SWH + 5), f"{r['multiplier']:g}", fill=(GOOD if ok else WARN))
    dr5.text((sx, T5 + SWH + 18), r["readsAs"][:9], fill=(DIM if ok else WARN))
    sx += SWZ
CH.caption(dr5, PAD, T5 + SWH + 40, [
    (f"DELIVERED: {MOVED_LIT['pureFillPxThatChangedWhatTheySay']} of {MOVED_LIT['pureFillPx']} "
     f"pixels that delivered the healthy top FILL unshadowed read as a different status once the "
     f"shadow is applied. The guard is a REFUSAL, and verify_refusal.py makes it FIRE on a real "
     f"composed picture naming over a thousand.",
     GOOD if MOVED_LIT["pureFillPxThatChangedWhatTheySay"] == 0 else WARN),
    (f"the same colour vocabulary ALREADY cross-reads without any shadow: {CROSS['crossReading']} of "
     f"{CROSS['entries']} colours the land may emit ({CROSS['pct']}%) read nearest to a status other "
     f"than the one that authored them. That is why the guard above is a DELTA — an instrument that "
     f"condemns the shipped art cannot price a change to it.", DIM),
], im5.size[0] - 2 * PAD)
im5.save(os.path.join(OUT, "confusability-depth.png"))


# =====================================================================================================
# 7. report + sidecars
# =====================================================================================================
REPORT["surface"] = CH.REPORT["surface"]
REPORT["cameraElevationDeg"] = C.ELEV
REPORT["appLandCameraElevationDeg"] = P.APP_LAND_CAMERA_ELEVATION_DEG
REPORT["blenderFramesRendered"] = 0
REPORT["importedNotCopied"] = {
    "compose_healthy.py": "the whole pass, run in its own directory with its writes redirected",
    "compose_core.compose_land": "the land",
    "compose.back_half / snap / STATUS_TOKENS / PALETTE": "the palette back half",
    "seams.SeamControl": "the owner's seam decision",
    "newHere": ["shadow.py", "compose_shadow.panel (~20 lines, for the seam between land and snap)"],
}

with open(os.path.join(OUT, "shadow-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

PICTURES = ("one-surface-and-shadow.png", "three-moves.png", "shadow-detail-6x.png",
            "shadow-survives-the-snap.png", "confusability-depth.png")
for pic in PICTURES:
    provenance.write_sidecar(
        os.path.join(OUT, pic), __file__, sys.argv[1:], CH.INPUTS, CH.CODE_STATE,
        extra={"cameraElevationDeg": C.ELEV,
               "storyId": P.STORY_ID,
               "variant": "b++ land, flat green, interior mesh seams REMOVED, per-cell variant/wheat "
                          "COLLAPSED to one surface, author-time shadow baked before the palette snap",
               "lightRig": REPORT["lightRig"],
               "shadowTerms": REPORT["shadow"]["terms"],
               "paletteEntries": {"shipped": int(len(PALETTE_SHIPPED)),
                                  "lightClosed": int(len(PALETTE_LIT))},
               "statusIsNotCorrupted": {"nonHealthyBodyPx": READ_LIT["nonHealthyPx"],
                                        "bodyPx": READ_LIT["bodyPx"]},
               "island": {"sha256": provenance.sha256_file(CH.ISLAND_PATH)},
               "proof": {"sha256": provenance.sha256_file(CH.PROOF_PATH)}})

print(f"cell fills {REPORT['oneSurface']['deliveredCellFillsBefore']['distinctDeliveredCellFills']} -> "
      f"{REPORT['oneSurface']['deliveredCellFillsAfter']['distinctDeliveredCellFills']} | shadow reaches "
      f"{REPORT['whatTheShadowBuys']['pctOfIslandReached']}% of the island | luma range "
      f"{RANGE_SHIPPED.get('lumaRangeP2toP98')} -> {RANGE_FLAT.get('lumaRangeP2toP98')} -> "
      f"{RANGE_LIT.get('lumaRangeP2toP98')} | non-healthy body px {READ_LIT['nonHealthyPx']} | "
      f"wrote shadow-report.json + {len(PICTURES)} sidecars", flush=True)
