#!/usr/bin/env python3
"""Dress ONE island: the settled `b++` land at the signed camera, with the component art growing on it.

    python compose_dressed.py                 # -> the four delivered pictures + the report

WHAT THIS ADDS TO THE TRACK. The interior fork settled the land's STRUCTURE (relaxed mesh, flat
status-tinted fills, walls and terracing from heading-indexed rim pieces) and the elevation sweep
settled its CAMERA. Both delivered a picture of an island that is still bare terrain — correct
geometry with nothing growing on it. The owner's directive for this pass, verbatim (2026-08-16):
*"this should just be a research pass on a single island, we still dont have flowers etc, isolate
this away from the main app until we ready"*. So this pass builds the missing component art and
asks whether one island can be made to read as a PLACE.

IT RENDERS THE VOCABULARY THE APP ALREADY DECIDED, NOT A NEW ONE (see `dressing.py`). Grass is a
capability's tests; dead grass is the status wilt; a flower is the story's UAT and only UAT, its
FORM reading the verdict. That constraint is the most load-bearing thing about this pass and it is
what stops it being decoration.

TWO COMPOSITORS IS HOW A TRACK QUIETLY STARTS MEASURING ITSELF
--------------------------------------------------------------
The interior-fork README records `chamfer-fairness.png` varying its rim while claiming to hold
everything but the top face constant — caught by reading file timestamps, not by any check. The
elevation sweep's answer was to import that spike's `compose.py` and rebind its module state, so
there was exactly ONE implementation of the projection, the piece stamping, the palette and the
ADR-0367 D4 back half.

This pass does the same and then has to go one step further, because it genuinely adds a new
DRAWABLE CLASS and so cannot leave the draw-list assembly untouched. The mitigation is a mechanism
rather than a promise: `compose_land([])` — this file's own land pass with nothing scattered — is
asserted BYTE-IDENTICAL to `C.compose('flat', 'cell')` on every run, before any decor is drawn
(`assert_land_unchanged`). If the copy ever drifts from the shipped compositor, the pass refuses
instead of shipping a picture whose "before" is not the thing it claims to be.

Everything else is the imported module's, called and never restated: `C.project`, `C.classify`,
`C.paste_piece`, `C.fill_polygon`, `C.height_of`, `C.boundary_walls`, `C.faces_viewer`,
`C.snap`, `C.mode_down`, `C.back_half`, `C.on_board`, `C.STATUS_TOKENS`.

THE DECOR GOES THROUGH THE BACK HALF; THE TREE DOES NOT. Decor is new art this pass authors, so it
is quantised and palette-snapped with the land — a raw Blender render shipped as land is the
ADR-0145 failure at island scale, and decor is no more exempt from it than a wall piece is. The
hero tree is composited AFTER the back half at 1:1, because it is a shipped sprite carrying its own
32-colour track palette and a signed owner ceiling verdict; re-snapping it would re-author art the
owner has already looked at.
"""
import hashlib
import importlib.util
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

import dressing

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
SWEEP = os.path.join(REPO, "docs", "research", "chapter2-camera-elevation-sweep-2026-08-15")

_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
sys.path.insert(0, os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402

import scatter  # noqa: E402

# THE PAINTER-ORDER RULES ARE IMPORTED, NOT RESTATED — and this is the fourth-site repair.
#
# This file kept its OWN copy of the draw-list assembly, so when PR #1387 fixed the depth key and the
# `caps` wall authority in `compose_core.py` neither fix reached here: the dressing pictures went on
# composing with a placement sorting on its own ground point alone — measured on this island, 32 of
# 120 placements (26.7%) owned ZERO supersampled pixels once the composite finished, against 3 (2.5%)
# under the shipped rule — and with `status-vocabulary.png` driving each status through `caps=` while
# its walls kept the ORIGINAL statuses'. Nothing detected it, because nothing on this track compares
# one compositor copy to another. (26.7% is OCCLUSION alone, measured before the downsample; the
# arc's 46% figure is placements delivering zero DELIVERED pixels, which also counts out-voting.)
#
# The repair is an IMPORT rather than a fifth copy of the two rules. `compose_core` is the canonical
# home: `attribute.py` already calls the same two functions rather than restating them, and
# `delivery.centroid_key()` reintroduces the defect by setting `compose_core`'s own switch. Because
# a callee resolves its globals in the module that DEFINES it, that one switch now reaches this
# compositor too — which is the same aliasing property that silently disarmed two monkey-patches on
# this track in PR #1393, used deliberately instead of walked into. `verify.py` asserts the identity
# and drives the switch through THIS file, so the coupling is proved rather than assumed.
#
# GRASS is APPENDED to `sys.path`, never prepended: this directory owns `scatter.py` and `dressing.py`
# and must keep winning those names.
sys.path.append(os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16"))
import compose_core as CORE  # noqa: E402

ISLAND_PATH = os.path.join(HERE, "island.json")
LAND_PIECES = os.path.join(HERE, "pieces-land")
DECOR_PIECES = os.path.join(HERE, "pieces-decor")


# ---------------------------------------------------------------- rebind the shipped compositor
def rebind():
    """Re-point `compose.py`'s module state at THIS pass's island and land piece set.

    Its functions read these at call time, so rebinding is enough — no function is rewritten and no
    arithmetic is restated. The canvas derivation mirrors `compose.py`'s own, reading its private
    padding and tree-headroom constants from the module rather than restating them.
    """
    island = json.load(open(ISLAND_PATH))
    meta = json.load(open(os.path.join(LAND_PIECES, "render-meta.json")))

    C.ISLAND, C.PIECES, C.META = island, LAND_PIECES, meta
    C.SS = int(meta["supersample"])
    C.ELEV = float(island["camera"]["elevationDeg"])
    C.SIN = float(island["camera"]["groundFlattening"])
    C.COS = float(island["camera"]["uprightForeshortening"])
    C.CLIFF = float(meta["cliffDropWorld"])
    C.TILE_DEPTH_WORLD = float(meta["tileDepthWorld"])
    C.COAST = np.array(island["coastLoopGround"], dtype=np.float64)
    C.CAPS = list(island["capStatuses"])
    C.CAP_LEVEL = [(i * 2 + 1) % C.N_LEVELS for i in range(len(C.CAPS))]

    gx0, gx1 = C.COAST[:, 0].min() - C._pad, C.COAST[:, 0].max() + C._pad
    gy0, gy1 = C.COAST[:, 1].min() - C._pad, C.COAST[:, 1].max() + C._pad
    C.CANVAS_W = int(math.ceil(gx1 - gx0))
    C.CANVAS_H = int(math.ceil((gy1 - gy0) * C.SIN + C.CLIFF * C.COS + C._TREE_HEADROOM))
    C.ORIGIN = (-gx0, -gy0 * C.SIN + C._TREE_HEADROOM)

    C.TILE_PIECES = [C.classify(os.path.join(LAND_PIECES, f"tile-{i}.png"))
                     for i in range(len(island["variantA"]["pieceSet"]))]
    C.WALL_PIECES = [C.classify(os.path.join(LAND_PIECES, f"wall-{h}.png"))
                     for h in range(int(island["wall"]["headings"]))]
    C.SHAPE_TO_PIECE = {p["shape"]: i for i, p in enumerate(island["variantA"]["pieceSet"])}
    return island, meta


ISLAND, LAND_META = rebind()
assert abs(float(LAND_META["camera"]["elevationDeg"]) - C.ELEV) < 1e-9, (
    f"pieces-land were rendered at {LAND_META['camera']['elevationDeg']} deg but the island "
    f"declares {C.ELEV} — the land and its pieces must share ONE camera (ADR-0367 D1)")

# The settled interior option, named once: relaxed mesh, flat status-tinted fills, per-cell
# elevation for the rim pieces to wall.
INTERIOR, ELEVATION_MODE = "flat", "cell"


# ---------------------------------------------------------------- the decor piece set
def classify_decor(path, keys, meta):
    """Decode ONE decor piece against ITS OWN declared band subset.

    `C.classify` matches every pixel against one global five-key vocabulary. Decor needs more roles
    than that in total (a flower has stem, leaf, petal and centre), but no single piece needs more
    than five — so each is decoded against the subset it declares. Widening one global list instead
    would push the keys together until an antialiased boundary pixel could classify to a THIRD key
    it lies nowhere near; per-piece subsets keep the separation as good as the land's however many
    roles the whole set accumulates.

    A consequence worth stating, because it is what makes the residual fringe SAFE: every key inside
    one piece resolves to a token from ONE family — one capability's status, or one UAT verdict — so
    a misclassified boundary pixel can only ever land on a neighbouring shade of the right thing. It
    can never do what the interior fork's missing palette entry did, which was to repaint an
    `unknown` rim in another status's green.
    """
    a = np.array(Image.open(path).convert("RGBA"), dtype=np.float32)
    triples = np.array([meta["bandTriples"][k] for k in keys], dtype=np.float32)
    d = np.abs(a[:, :, None, :3] - triples[None, None, :, :]).sum(axis=3)
    return keys, np.argmin(d, axis=2), a[:, :, 3] > 110.0


def load_decor():
    meta = json.load(open(os.path.join(DECOR_PIECES, "render-meta.json")))
    pieces = {}
    for name in meta["pieceNames"]:
        keys = list(meta["pieceRoles"][name].keys())
        pieces[name] = classify_decor(os.path.join(DECOR_PIECES, f"{name}.png"), keys, meta)
    return meta, pieces


DECOR_META, DECOR_PIECE_SET = load_decor()
assert abs(float(DECOR_META["camera"]["elevationDeg"]) - C.ELEV) < 1e-9, (
    f"pieces-decor were rendered at {DECOR_META['camera']['elevationDeg']} deg but the land is at "
    f"{C.ELEV} — everything in one composite must be seen from one camera (ADR-0367 D1)")


# ---------------------------------------------------------------- the palette, RE-CLOSED
def build_palette_dressed():
    """The land's palette PLUS the decor families, as a full (token x shade) closure.

    THIS IS THE FUNCTION MOST LIKELY TO SHIP A SILENT SEMANTIC BUG, and the interior fork already
    paid for the lesson once: the coast piece's chamfer lip was painted with the SIDE token at the
    CHAMFER shade, a combination the first palette omitted, and because a snap can only clamp toward
    what it HOLDS, the nearest surviving entry belonged to a DIFFERENT STATUS FAMILY — an `unknown`
    island's rim came out `healthy` green across 2564 pixels, at exit 0, with nothing to see.

    Adding decor doubles the exposure, because decor introduces token families that did not exist
    when that palette was written (the three UAT verdict families) and applies the existing status
    families at NEW shade levels. So the closure is taken over every (family x level) pair either
    layer can emit, and `verify.py` re-derives the families INDEPENDENTLY rather than asking this
    function what it allows — a check that consults the palette can only ever pass.
    """
    pal = [c for c in C.build_palette()]
    # every shade level ANY piece assigns to ANY role — taken from the pieces' own declarations, so
    # a new piece introducing a new level cannot be missed by this closure
    levels = sorted({float(lv) for roles in DECOR_META["pieceRoles"].values()
                     for _role, lv in roles.values()})
    for family in DECOR_META["tokenFamilies"].values():
        for variant in family.values():
            for tok in variant.values():
                for m in levels:
                    pal.append(C.shade(C.hexrgb(tok), m))
    return np.array(sorted({tuple(int(round(v)) for v in c) for c in pal}), dtype=np.float32)


C.PALETTE = build_palette_dressed()


def paste_decor(canvas, alpha, piece, cx, cy, roles, role_map):
    """Stamp one decor piece, resolving each band key to an AUTHORED token at an authored shade.

    Mirrors `C.paste_piece`'s blit exactly and differs only in the token MAP: the land has two token
    roles per piece (top, side) while decor has up to four (stem, leaf, petal, centre), so the
    shipped two-argument form cannot express it. `verify.py` holds the copy honest by driving a
    two-role decor piece through both functions and asserting the canvases match — a blit copied by
    eye is a blit nobody has checked.
    """
    keys, idx, mask = piece
    h, w = mask.shape
    x0 = int(round(cx * C.SS - w / 2.0))
    y0 = int(round(cy * C.SS - h / 2.0))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(canvas.shape[1], x0 + w), min(canvas.shape[0], y0 + h)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sub_idx = idx[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    sub_m = mask[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    out = np.zeros(sub_idx.shape + (3,), dtype=np.float32)
    for k, key in enumerate(keys):
        role, level = role_map[key]
        out = np.where((sub_idx == k)[:, :, None],
                       C.shade(C.hexrgb(roles[role]), float(level)), out)
    canvas[sy0:sy1, sx0:sx1] = np.where(sub_m[:, :, None], out, canvas[sy0:sy1, sx0:sx1])
    alpha[sy0:sy1, sx0:sx1] = np.where(sub_m, 1.0, alpha[sy0:sy1, sx0:sx1])


# ---------------------------------------------------------------- the land pass
def compose_land(decor_items, cells=None, caps=None):
    """The `b++` land with `decor_items` interleaved into its painter order.

    Mirrors `C.compose('flat', 'cell')`'s draw-list assembly because a new drawable class genuinely
    has to enter that list. `assert_land_unchanged()` holds the mirror honest by running both and
    comparing bytes, so this is a proved copy rather than a trusted one.

    Decor sorts at tier 3 on `CORE.decor_depth_key` — `max(its own ground y, its cell's centroid
    y)` — so it is drawn after the cell it stands on and before anything nearer. That single sort is
    what makes the composite correct without a depth buffer: a tuft on a far cell is covered by a
    nearer raised cell's top face, exactly as the cell behind it is, and is never covered by its own.

    IT USED TO SORT ON ITS OWN GROUND Y ALONE, which is the defect PR #1383 diagnosed and PR #1387
    fixed in `compose_core` — and MISSED here, because this file carries its own draw list. A cell's
    sort key is its CENTROID, so any placement in the back half of its own cell sorted BEFORE that
    cell, and `C.fill_polygon` is a hard write: the cell's own top face erased the thing standing on
    it. Every dressing picture on this track was composed that way until this repair.

    `caps` IS AUTHORITATIVE FOR THE WALLS TOO, via the same imported rule. `status-vocabulary.png`
    is the picture that needed it: it drives every capability to one status through `caps=` alone,
    and the walls were reading the module global, so each of its five panels stood on the ORIGINAL
    island's mixed-status walls while claiming to show one status.
    """
    cells = ISLAND["variantB"]["cells"] if cells is None else cells
    caps = C.CAPS if caps is None else caps
    canvas = np.zeros((C.CANVAS_H * C.SS, C.CANVAS_W * C.SS, 3), dtype=np.float32)
    alpha = np.zeros((C.CANVAS_H * C.SS, C.CANVAS_W * C.SS), dtype=np.float32)
    story_side = C.STATUS_TOKENS["healthy"]["side"]

    C.fill_polygon(canvas, alpha,
                   [(C.project(gx, gy)[0] * C.SS, C.project(gx, gy)[1] * C.SS)
                    for gx, gy in C.COAST],
                   C.hexrgb(C.COAST_SAND), seam_rgb=C.hexrgb(C.COAST_SAND_EDGE))

    draw = []
    for pl in ISLAND["wall"]["placements"]:
        if C.faces_viewer(pl["heading"]):
            draw.append((pl["c"][1], 0, ("wall", pl["c"], pl["heading"], 0.0, story_side)))
    for pos, h, height, side in CORE.walls_under_caps(C, cells, ELEVATION_MODE, caps):
        draw.append((pos[1], 1, ("wall", pos, h, height, side)))
    for c in cells:
        draw.append((c["c"][1], 2, ("cell", c, C.height_of(c, ELEVATION_MODE))))
    for d in decor_items:
        draw.append((CORE.decor_depth_key(d, cells), 3, ("decor", d)))
    draw.sort(key=lambda t: (t[0], t[1]))

    for _, _, item in draw:
        if item[0] == "wall":
            _, pos, h, height, side = item
            px, py = C.project(pos[0], pos[1], height)
            C.paste_piece(canvas, alpha, C.WALL_PIECES[h], px, py,
                          C.hexrgb(side), C.hexrgb(side))
        elif item[0] == "cell":
            _, c, height = item
            toks = C.STATUS_TOKENS[caps[c["cap"]]]
            base = C.hexrgb(toks["wheat"] if c["wheat"] else toks["top"][c["variant"]])
            poly = [(C.project(gx, gy, height)[0] * C.SS, C.project(gx, gy, height)[1] * C.SS)
                    for gx, gy in c["poly"]]
            C.fill_polygon(canvas, alpha, poly, C.shade(base, C.FLAT_LEVEL),
                           seam_rgb=C.shade(base, C.SEAM_LEVEL))
        else:
            d = item[1]
            px, py = C.project(d["g"][0], d["g"][1], d["h"])
            paste_decor(canvas, alpha, DECOR_PIECE_SET[d["piece"]], px, py,
                        d["roles"], DECOR_META["pieceRoles"][d["piece"]])
    return canvas, alpha, C.centre_height(cells, ELEVATION_MODE)


def assert_land_unchanged():
    """THE MIRROR, CHECKED RATHER THAN TRUSTED — and it runs before any picture exists.

    With nothing scattered, this file's land pass must reproduce the shipped compositor's output
    exactly. Asserted on the raw supersampled canvas AND its alpha, i.e. before the palette snap
    could hide a small difference by clamping it away.
    """
    mine_c, mine_a, mine_h = compose_land([])
    theirs_c, theirs_a, theirs_h = C.compose(INTERIOR, ELEVATION_MODE)
    same = (np.array_equal(mine_c, theirs_c) and np.array_equal(mine_a, theirs_a)
            and mine_h == theirs_h)
    if not same:
        raise SystemExit(
            "REFUSED: compose_dressed's land pass has drifted from the shipped compose.py. "
            f"canvas equal={np.array_equal(mine_c, theirs_c)} "
            f"alpha equal={np.array_equal(mine_a, theirs_a)} "
            f"treeHeight {mine_h} vs {theirs_h}. The 'before' picture would not be the thing it "
            "claims to be, so no picture is written.")
    return mine_h


# ---------------------------------------------------------------- the hero tree
def plant_tree(img, height):
    """This pass's angle's hero-tree render, composited AFTER the back half at 1:1.

    The frame is the elevation sweep's committed `tree-50` mature render — the very sprite the owner
    looked at when they picked the angle — rather than a re-render, so the tree in these pictures is
    the tree that verdict was made on. Deliberately NOT put through the land's palette snap.
    """
    tag = ("%g" % C.ELEV).replace(".", "p")
    tree_dir = os.path.join(SWEEP, f"tree-{tag}", "frames")
    reg = json.load(open(os.path.join(tree_dir, "registration.json")))
    assert abs(float(reg["camera_elevation_deg"]) - C.ELEV) < 1e-9, (
        f"tree-{tag} records {reg['camera_elevation_deg']} deg, not {C.ELEV} — the two sides of "
        f"the composition must be rendered at ONE camera (ADR-0367 D1)")
    frame = np.array(Image.open(os.path.join(tree_dir, reg["frameOrder"][-1])).convert("RGBA"),
                     dtype=np.float32)
    anchor = reg["groundSocketAnchor"]
    gx, gy = ISLAND["islandCentreGround"]
    px, py = C.project(gx, gy, height)
    x0, y0 = int(round(px)) - int(round(anchor["x"])), int(round(py)) - int(round(anchor["y"]))
    h, w = frame.shape[:2]
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(img.shape[1], x0 + w), min(img.shape[0], y0 + h)
    sub = frame[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    a = sub[:, :, 3:4] / 255.0
    dst = img[sy0:sy1, sx0:sx1]
    dst[:, :, :3] = sub[:, :, :3] * a + dst[:, :, :3] * (1 - a)
    dst[:, :, 3] = np.maximum(dst[:, :, 3], sub[:, :, 3])
    return img, (px, py), reg


def render_variant(decor_items, cells=None, caps=None, tree=True):
    canvas, alpha, tree_h = compose_land(decor_items, cells=cells, caps=caps)
    img, solid = C.back_half(canvas, alpha)
    colours = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
    ground = None
    if tree:
        img, ground, _reg = plant_tree(img, tree_h)
    return img, solid, colours, ground


# ---------------------------------------------------------------- the story this island tells
#: The UAT criteria this island's story carries. INVENTED for the spike — `island.json` describes
#: geometry and status, not proof state — and the mix is chosen so all THREE verdict forms appear at
#: once, because a picture showing only bloomed daisies would not test whether form reads verdict.
#: A real island takes these from the story's own `uatCriteria`.
UAT_CRITERIA = [
    {"id": "uat-1", "state": "proven"},
    {"id": "uat-2", "state": "proven"},
    {"id": "uat-3", "state": "pending"},
    {"id": "uat-4", "state": "failing"},
    {"id": "uat-5", "state": "proven"},
    {"id": "uat-6", "state": "pending"},
]


def prepare(cells):
    """Annotate the cells with the height the compositor will draw them at, and the island with the
    radius the flower annulus is measured against.

    The height is taken from `C.height_of` rather than recomputed, so a decor item cannot stand at a
    different elevation from the cell under it — which would read as floating grass and is exactly
    the kind of second-copy drift the whole pass is arranged to avoid."""
    for c in cells:
        c["_h"] = C.height_of(c, ELEVATION_MODE)
    cx, cy = ISLAND["islandCentreGround"]
    ISLAND["_radius"] = float(np.mean([math.hypot(p[0] - cx, p[1] - cy) for p in C.COAST]))
    return cells


def require_one_state_per_generator(inputs):
    """The one-code-state refusal, applied PER GENERATOR — and the reason it had to be extended.

    `provenance.require_one_code_state` groups every input directory by declared digest and refuses
    when two disagree. That is exactly right for the shape it was written for, where every cell of a
    fork picture comes from ONE generator at one state. This pass is the first composite built from
    TWO generators: the land pieces declare `blender_land.py`'s digest and the decor pieces declare
    `blender_decor.py`'s. They disagree by construction and always will, so calling the shared helper
    across both refuses every correct run — which it did, on the first attempt here.

    The fix keeps the teeth rather than dropping the guard: the inputs are grouped by the generator
    each one names, and the shared refusal is run WITHIN each group. Two land directories rendered at
    different states still refuse, which is the case the guard exists for; two different generators
    no longer do. Reported back to the track rather than fixed in `provenance.py`, because that
    module is shared by the hero track and this is a NEW usage shape rather than a defect in it.
    """
    by_gen = {}
    for rec in inputs:
        state = rec.get("codeState") or {}
        by_gen.setdefault(state.get("generator", "UNDECLARED"), []).append(rec)
    agreed = {}
    for gen, recs in sorted(by_gen.items()):
        if gen == "UNDECLARED":
            continue
        state = provenance.require_one_code_state(recs)
        if state:
            agreed[gen] = state["sha256"]
    combined = hashlib.sha256(
        "".join(f"{g}:{s}" for g, s in sorted(agreed.items())).encode()).hexdigest()
    return {"generators": agreed, "sha256": combined,
            "rule": "one code state PER GENERATOR; the composite's identity is the digest of the "
                    "whole {generator: state} map, so any generator moving moves it"}


if __name__ == "__main__":
    # ---- the refusals, before any pixel is drawn -------------------------------------------
    # TWO render directories now — land and decor — so the guard has real work, unlike the interior
    # fork where a single directory made the call ceremonial. `verify_refusal.py` makes it FIRE.
    INPUTS = C.piece_inputs([("pieces-land", LAND_PIECES), ("pieces-decor", DECOR_PIECES)])
    CODE_STATE = require_one_state_per_generator(INPUTS)
    assert_land_unchanged()

    cells = prepare(ISLAND["variantB"]["cells"])
    items, stats = scatter.scatter_island(ISLAND, DECOR_META["tokenFamilies"],
                                          dressing.SEED, UAT_CRITERIA)
    meadow = [i for i in items if i["kind"] != "flower"]
    flowers = [i for i in items if i["kind"] == "flower"]
    print(f"scatter: {len(meadow)} meadow + {len(flowers)} UAT flowers = {len(items)} placements")

    # ---- the delivered pictures -------------------------------------------------------------
    LAYERS = [
        ("bare", [], "BARE — the settled b++ land, as the track delivered it"),
        ("meadow", meadow, "+ MEADOW — grass = a capability's tests, dead grass = the status wilt"),
        ("dressed", items, "+ UAT FLOWERS — one per criterion, the verdict read from form"),
    ]
    rendered, report = {}, {}
    for name, decor, caption in LAYERS:
        img, solid, colours, ground = render_variant(decor)
        rendered[name] = (img, ground)
        report[name] = {"caption": caption, "decorPlacements": len(decor),
                        "landPx": int(solid.sum()), "landColours": len(colours)}
        Image.fromarray(C.on_board(img), "RGB").save(os.path.join(HERE, f"island-{name}.png"))
        print(f"island-{name}.png  {int(solid.sum())} land px, {len(colours)} colours, "
              f"{len(decor)} placements")

    def board_of(img):
        return Image.fromarray(C.on_board(img), "RGB")

    # 1. the layer sheet — what each layer buys, one island, one code state
    ZOOM, PAD, HDR, CAP = 3, 10, 44, 30
    cells_img = [rendered[n][0] for n, _d, _c in LAYERS]
    cw = max(i.shape[1] for i in cells_img)
    ch = max(i.shape[0] for i in cells_img)
    sheet = Image.new("RGB", (PAD + len(LAYERS) * (cw * ZOOM + PAD), HDR + ch * ZOOM + CAP),
                      (24, 24, 26))
    dr = ImageDraw.Draw(sheet)
    dr.text((PAD, 8), "DOES ONE ISLAND READ AS A PLACE?  the app's decided vegetation vocabulary "
                      "(ADR-0226 D2/D3/D4), rendered - one island, one piece set, one code state",
            fill=(232, 232, 232))
    dr.text((PAD, 24), f"camera {C.ELEV:g} deg (owner look verdict 2026-08-16) - "
                       f"LAND_CAMERA_ELEVATION_DEG is still {dressing.APP_LAND_CAMERA_ELEVATION_DEG:g} "
                       f"and is NOT touched by this pass", fill=(150, 150, 156))
    for i, (name, _d, caption) in enumerate(LAYERS):
        x = PAD + i * (cw * ZOOM + PAD)
        img = rendered[name][0]
        pad_img = np.full((ch, cw, 3), C.BOARD, dtype=np.uint8)
        pad_img[:img.shape[0], :img.shape[1]] = C.on_board(img)
        sheet.paste(Image.fromarray(pad_img, "RGB").resize((cw * ZOOM, ch * ZOOM), Image.NEAREST),
                    (x, HDR))
        dr.text((x + 3, HDR + ch * ZOOM + 5), caption, fill=(200, 200, 204))
    sheet.save(os.path.join(HERE, "dressing-layers.png"))
    print("wrote dressing-layers.png", sheet.size)

    # 2. the detail crop — at 1:1 a grass tuft is a few pixels, so a sheet the owner can actually
    #    judge the COMPONENT ART on has to be magnified. Cropped around the island centre.
    DZ = 5
    full = board_of(rendered["dressed"][0])
    bare_full = board_of(rendered["bare"][0])
    gx, gy = ISLAND["islandCentreGround"]
    px, py = C.project(gx, gy, 0.0)
    cw2, ch2 = 118, 74
    box = (int(px - cw2 * 0.52), int(py - ch2 * 0.30), int(px + cw2 * 0.48), int(py + ch2 * 0.70))
    det_sheet = Image.new("RGB", (PAD * 2 + 2 * (cw2 * DZ) + PAD, HDR + ch2 * DZ + CAP),
                          (24, 24, 26))
    dd = ImageDraw.Draw(det_sheet)
    dd.text((PAD, 8), "THE COMPONENT ART ON THE ISLAND, 5x - the same crop before and after",
            fill=(232, 232, 232))
    dd.text((PAD, 24), "judge the art HERE, not on the piece sheet: a component is judged where it "
                       "stands, against the land's own palette", fill=(150, 150, 156))
    for i, im in enumerate((bare_full, full)):
        det_sheet.paste(im.crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST),
                        (PAD + i * (cw2 * DZ + PAD), HDR))
    dd.text((PAD + 3, HDR + ch2 * DZ + 5), "BARE", fill=(200, 200, 204))
    dd.text((PAD + cw2 * DZ + PAD + 3, HDR + ch2 * DZ + 5), "DRESSED", fill=(255, 236, 160))
    det_sheet.save(os.path.join(HERE, "island-dressed-detail.png"))
    print("wrote island-dressed-detail.png", det_sheet.size)

    # 3. the component sheet — every piece, painted in a representative token set, ON A BOARD.
    #    Never on transparency: `sheet.py` refuses to draw on it for the reason this sheet obeys —
    #    a component judged against nothing is not judged.
    PZ = 5
    order = DECOR_META["pieceNames"]
    demo_tokens = {}
    for n in order:
        if n.startswith("tuft"):
            demo_tokens[n] = DECOR_META["tokenFamilies"]["blade"][
                "unknown" if n == "tuft-2" else "healthy"]
        elif n.startswith("shrub"):
            demo_tokens[n] = DECOR_META["tokenFamilies"]["shrub"]["healthy"]
        elif n.startswith("wilt"):
            demo_tokens[n] = DECOR_META["tokenFamilies"]["wilt"]["unhealthy"]
        else:
            demo_tokens[n] = DECOR_META["tokenFamilies"]["flower"][n.split("-", 1)[1]]
    pw = int(DECOR_META["pieceCanvasWorld"])
    comp = Image.new("RGB", (PAD + len(order) * (pw * PZ + PAD), HDR + pw * PZ + CAP), (24, 24, 26))
    cd = ImageDraw.Draw(comp)
    cd.text((PAD, 8), "THE COMPONENT ART - 11 pieces, forest-wide by construction (no piece depends "
                      "on an island outline or a cell shape)", fill=(232, 232, 232))
    cd.text((PAD, 24), "each painted in one representative token set; on the island the tokens come "
                       "from the capability's status or the criterion's verdict",
            fill=(150, 150, 156))
    for i, n in enumerate(order):
        cnv = np.zeros((pw * C.SS, pw * C.SS, 3), dtype=np.float32)
        alp = np.zeros((pw * C.SS, pw * C.SS), dtype=np.float32)
        paste_decor(cnv, alp, DECOR_PIECE_SET[n], pw / 2.0, pw / 2.0,
                    demo_tokens[n], DECOR_META["pieceRoles"][n])
        keep = alp > 0.5
        snapped = np.where(keep[:, :, None], C.snap(cnv), 0.0)
        saved_w, saved_h = C.CANVAS_W, C.CANVAS_H
        C.CANVAS_W = C.CANVAS_H = pw
        rgb, sol = C.mode_down(snapped.astype(np.int32), keep)
        C.CANVAS_W, C.CANVAS_H = saved_w, saved_h
        tile = np.where(sol[:, :, None], rgb, np.array(C.BOARD, dtype=np.float32)).astype(np.uint8)
        x = PAD + i * (pw * PZ + PAD)
        comp.paste(Image.fromarray(tile, "RGB").resize((pw * PZ, pw * PZ), Image.NEAREST), (x, HDR))
        cd.text((x + 3, HDR + pw * PZ + 5), n, fill=(200, 200, 204))
    comp.save(os.path.join(HERE, "components.png"))
    print("wrote components.png", comp.size)

    # 4. the vocabulary sheet — the SAME island driven to each status in turn. This is the picture
    #    that shows the dressing is a reading of the work rather than decoration: nothing moves
    #    except which status every capability wears.
    STATUSES = ["healthy", "building", "proposed", "mapped", "unhealthy"]
    vz = 2
    vcells = None
    vpanels = []
    for st in STATUSES:
        caps_all = [st] * len(C.CAPS)
        vitems, _s = scatter.scatter_island(
            {**ISLAND, "capStatuses": caps_all}, DECOR_META["tokenFamilies"],
            dressing.SEED, UAT_CRITERIA)
        img, solid, colours, _g = render_variant(vitems, caps=caps_all)
        vpanels.append((st, C.on_board(img), int(solid.sum()), len(colours), len(vitems)))
    vw = max(p[1].shape[1] for p in vpanels)
    vh = max(p[1].shape[0] for p in vpanels)
    vsheet = Image.new("RGB", (PAD + len(vpanels) * (vw * vz + PAD), HDR + vh * vz + CAP),
                       (24, 24, 26))
    vd = ImageDraw.Draw(vsheet)
    vd.text((PAD, 8), "THE DRESSING IS A READING OF THE WORK, NOT DECORATION - every capability "
                      "driven to ONE status, same island, same piece set", fill=(232, 232, 232))
    vd.text((PAD, 24), "grass count follows the capability's tests, grass colour its status, and an "
                       "unhealthy parcel thins into wilt (ADR-0226 D2/D3)", fill=(150, 150, 156))
    for i, (st, im, lpx, lc, n) in enumerate(vpanels):
        x = PAD + i * (vw * vz + PAD)
        pad_img = np.full((vh, vw, 3), C.BOARD, dtype=np.uint8)
        pad_img[:im.shape[0], :im.shape[1]] = im
        vsheet.paste(Image.fromarray(pad_img, "RGB").resize((vw * vz, vh * vz), Image.NEAREST),
                     (x, HDR))
        vd.text((x + 3, HDR + vh * vz + 5), f"{st}   {n} placements", fill=(200, 200, 204))
    vsheet.save(os.path.join(HERE, "status-vocabulary.png"))
    print("wrote status-vocabulary.png", vsheet.size)

    # 5. THE DENSITY SWEEP — the pass's central measurement, and the question it hands the owner.
    #
    #    Rendered faithfully at the app's authored counts, the meadow barely registers: 111
    #    placements spread over 214 cells, each tuft a handful of delivered pixels. That is not a
    #    defect in the render and it is not something to quietly fix by inflating the art — the
    #    2026-07-23 owner verdict on baked sprite art was that it read "way too big", so a session
    #    that grew the grass until it looked right would be overriding a look the owner already
    #    signed. What CAN legitimately move is how much grass one test buys.
    #
    #    So the density is swept and MEASURED the way the interior fork swept its chamfer: the
    #    honest statistic is the share of DELIVERED land pixels the decor occupies AFTER the majority
    #    downsample, because a component that survives at supersampled resolution and loses every
    #    majority vote at the delivered scale has bought a reader nothing.
    DENSITIES = [1.0, 3.0, 6.0]
    bare_img, bare_solid, _bc, _bg = render_variant([], tree=False)
    dens_panels, dens_rows = [], []
    for d in DENSITIES:
        ditems, dstats = scatter.scatter_island(ISLAND, DECOR_META["tokenFamilies"],
                                                dressing.SEED, UAT_CRITERIA, density=d)
        dimg, dsolid, dcolours, _g = render_variant(ditems, tree=False)
        # a decor pixel is one the dressing CHANGED — measured against the bare render rather than
        # inferred from the placements, so overlap and occlusion are counted the way a reader sees
        # them rather than the way the scatter intended them
        changed = int((np.any(dimg[:, :, :3] != bare_img[:, :, :3], axis=2)
                       & (dsolid | bare_solid)).sum())
        land = int(bare_solid.sum())
        # ALSO measure what the decor covers BEFORE the back half runs, in ground-equivalent pixels.
        # The gap between the two is the majority downsample's threshold: a piece must win more than
        # half of a SS x SS block to survive it at all, so thin art can be fully present at
        # supersampled resolution and still lose every vote. Measuring only the delivered number
        # would report that as "the art is too sparse" when the cause is the back half.
        raw_d, _ra, _rh = compose_land(ditems)
        raw_b, _ba, _bh = compose_land([])
        raw_changed = int(np.any(raw_d != raw_b, axis=2).sum())
        raw_ground_equiv = raw_changed / float(C.SS * C.SS)
        withtree, _s2, _c2, _g2 = render_variant(ditems, tree=True)
        dens_panels.append((d, C.on_board(withtree), len(ditems)))
        dens_rows.append({
            "density": d, "placements": len(ditems),
            "meadowPlacements": len([i for i in ditems if i["kind"] != "flower"]),
            "flowerPlacements": len([i for i in ditems if i["kind"] == "flower"]),
            "decorPx": changed, "landPx": land,
            "decorShareOfLandPct": round(100.0 * changed / max(1, land), 2),
            "decorPxBeforeDownsampleGroundEquiv": round(raw_ground_equiv, 1),
            "survivalOfDownsamplePct": round(100.0 * changed / max(1.0, raw_ground_equiv), 1),
            "landColours": len(dcolours),
        })
        print(f"density x{d:g}: {len(ditems):4d} placements, {changed:6d} decor px "
              f"= {100.0 * changed / max(1, land):5.2f}% of delivered land "
              f"(from {raw_ground_equiv:7.1f} ground-equiv px before the downsample, "
              f"{100.0 * changed / max(1.0, raw_ground_equiv):5.1f}% survived), "
              f"{len(dcolours)} colours")

    dw = max(p[1].shape[1] for p in dens_panels)
    dh = max(p[1].shape[0] for p in dens_panels)
    DZ2 = 3
    dsheet = Image.new("RGB", (PAD + len(dens_panels) * (dw * DZ2 + PAD), HDR + dh * DZ2 + CAP),
                       (24, 24, 26))
    sd = ImageDraw.Draw(dsheet)
    sd.text((PAD, 8), "HOW MUCH GROUND COVER DOES ONE TEST BUY?  the app's authored grass counts, "
                      "then the same rules scaled - one island, one piece set, one code state",
            fill=(232, 232, 232))
    sd.text((PAD, 24), "the UAT flowers do NOT scale: they are 1:1 with the criteria by decision "
                       "(ADR-0226 D4), so only the meadow moves", fill=(150, 150, 156))
    for i, (d, im, n) in enumerate(dens_panels):
        x = PAD + i * (dw * DZ2 + PAD)
        pad_img = np.full((dh, dw, 3), C.BOARD, dtype=np.uint8)
        pad_img[:im.shape[0], :im.shape[1]] = im
        dsheet.paste(Image.fromarray(pad_img, "RGB").resize((dw * DZ2, dh * DZ2), Image.NEAREST),
                     (x, HDR))
        row = dens_rows[i]
        label = f"x{d:g}  {n} placements   {row['decorShareOfLandPct']:.2f}% of land px"
        if d == 1.0:
            label += "   <- THE APP'S AUTHORED DENSITY"
        sd.text((x + 3, HDR + dh * DZ2 + 5), label,
                fill=(255, 236, 160) if d == 1.0 else (200, 200, 204))
    dsheet.save(os.path.join(HERE, "dressing-density.png"))
    print("wrote dressing-density.png", dsheet.size)

    # 6. THE OBVIOUS EXPLANATION FOR THE SUBLINEAR CURVE, TESTED AND REJECTED.
    #
    #    Six times the placements buys under three times the delivered pixels. The natural suspect is
    #    CONTRAST: a tuft is only visible if its blade token survives the palette snap as a DIFFERENT
    #    entry from the cell under it, and both are authored tokens from the same app — on a healthy
    #    parcel a #71a154 blade stands on #7dab50 ground, which are neighbouring mid-greens with a
    #    closed palette running last. If those collapsed, grass would be placed, rendered,
    #    composited and then erased with nothing to see.
    #
    #    THEY DO NOT COLLAPSE — 0 of 12 (status x blade-role) combinations, measured below. The
    #    hypothesis is kept in the report precisely because it was rejected: it is the explanation a
    #    reader will reach for, and "we checked, it is not that" is worth more than silence. The
    #    cause is the majority downsample's threshold, measured in the density sweep above.
    def snap_one(hexstr, level=1.0):
        v = C.shade(C.hexrgb(hexstr), level).reshape(1, 1, 3)
        return tuple(int(x) for x in C.snap(v)[0, 0])

    contrast = []
    for status, blade in DECOR_META["tokenFamilies"]["blade"].items():
        if status not in C.STATUS_TOKENS:
            continue
        ground = C.STATUS_TOKENS[status]
        for role, tok in blade.items():
            snapped_tok = snap_one(tok)
            collides = [g for g in ground["top"] + [ground["wheat"]]
                        if snap_one(g, C.FLAT_LEVEL) == snapped_tok]
            contrast.append({
                "status": status, "role": role, "token": tok,
                "snapsTo": list(snapped_tok),
                "groundTokensItCollapsesInto": collides,
                "invisibleOnThisGround": len(collides) > 0,
            })
    collapsed = [c for c in contrast if c["invisibleOnThisGround"]]
    print(f"contrast: {len(collapsed)} of {len(contrast)} (status x blade-role) combinations "
          f"collapse into a ground token after the snap")

    # ---- the report + the provenance sidecars ----------------------------------------------
    report["bladeGroundContrast"] = {
        "measured": contrast,
        "collapsedCombinations": len(collapsed),
        "totalCombinations": len(contrast),
        "note": "a collapsed combination is grass that is placed and then erased by the palette "
                "snap, because its authored blade token and the authored ground token under it "
                "resolve to the SAME closed-palette entry",
    }
    report["densitySweep"] = dens_rows
    report["scatter"] = stats
    report["pieceSet"] = {"decorPieces": len(order), "landPieces":
                          len(C.TILE_PIECES) + len(C.WALL_PIECES),
                          "indexedBy": "decor by kind x variant; land rim by quantised outward "
                                       "ground heading — neither by cell shape or island outline"}
    report["paletteEntries"] = int(len(C.PALETTE))
    report["cameraElevationDeg"] = C.ELEV
    report["appLandCameraElevationDeg"] = dressing.APP_LAND_CAMERA_ELEVATION_DEG
    report["uatCriteria"] = UAT_CRITERIA
    report["statusVocabulary"] = [{"status": st, "landPx": lpx, "landColours": lc,
                                   "placements": n} for st, _i, lpx, lc, n in vpanels]

    with open(os.path.join(HERE, "dressing-report.json"), "w") as fh:
        json.dump(report, fh, indent=1)

    for pic in ("island-bare.png", "island-meadow.png", "island-dressed.png",
                "dressing-layers.png", "island-dressed-detail.png", "components.png", "dressing-density.png",
                "status-vocabulary.png"):
        provenance.write_sidecar(os.path.join(HERE, pic), __file__, sys.argv[1:],
                                 INPUTS, CODE_STATE,
                                 extra={"cameraElevationDeg": C.ELEV,
                                        "variant": "b++ land + ADR-0226 vegetation vocabulary",
                                        "scatterSeed": dressing.SEED,
                                        "island": {"sha256": provenance.sha256_file(ISLAND_PATH)}})
    print("code state", (CODE_STATE or {}).get("sha256", "UNDECLARED")[:12],
          "| palette entries", len(C.PALETTE))
