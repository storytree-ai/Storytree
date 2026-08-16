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

import grass as dressing

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

ISLAND_PATH = os.path.join(HERE, "island.json")
LAND_PIECES = os.path.join(HERE, "pieces-land")
#: WHICH FORK CONFIGURATION IS MOUNTED. Rebound by `use_pieces()`; every configuration in the sweep
#: is composed against the SAME land, which is the property that makes the fork pictures honest.
DECOR_PIECES = None


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


DECOR_META, DECOR_PIECE_SET = None, None


def use_pieces(dirname, expect_mix=None, expect_geometry=None):
    """MOUNT one fork configuration's piece set, and REFUSE if it is not the one asked for.

    THE FAILURE THIS EXISTS FOR is the one `sheet.py`'s provenance sidecars were built against, in
    its cheapest and most likely form: a fork picture whose panels were composed from directories
    that do not hold what their captions say. A sweep of fourteen configurations makes that a
    one-character mistake away at all times, so the caller passes what it BELIEVES it is mounting
    and the directory's own `render-meta.json` is asked to agree. A caption is then a claim the
    render made about itself rather than one the composer wrote next to a picture.

    Rebinding is enough because every function below reads this module's state at call time — no
    function is rewritten and no arithmetic is restated per configuration.
    """
    global DECOR_PIECES, DECOR_META, DECOR_PIECE_SET
    DECOR_PIECES = dirname if os.path.isabs(dirname) else os.path.join(HERE, dirname)
    DECOR_META, DECOR_PIECE_SET = load_decor()
    assert abs(float(DECOR_META["camera"]["elevationDeg"]) - C.ELEV) < 1e-9, (
        f"{dirname} was rendered at {DECOR_META['camera']['elevationDeg']} deg but the land is at "
        f"{C.ELEV} — everything in one composite must be seen from one camera (ADR-0367 D1)")
    if expect_mix is not None and abs(float(DECOR_META["grassNormalMix"]) - expect_mix) > 1e-9:
        raise SystemExit(
            f"REFUSED: {dirname} declares grassNormalMix={DECOR_META['grassNormalMix']} but was "
            f"mounted as {expect_mix}. A fork panel would carry a caption its pixels do not.")
    if expect_geometry is not None and DECOR_META["grassGeometry"] != expect_geometry:
        raise SystemExit(
            f"REFUSED: {dirname} declares grassGeometry={DECOR_META['grassGeometry']!r} but was "
            f"mounted as {expect_geometry!r}. A fork panel would carry a caption its pixels do not.")
    C.PALETTE = build_palette_dressed()
    return DECOR_META


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


# ---------------------------------------------------------------- the base treatment
def _clip_half_plane(poly, nx, ny, d):
    """Sutherland-Hodgman against the half-plane `nx*x + ny*y <= d`. Returns the kept polygon."""
    out = []
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        da = nx * ax + ny * ay - d
        db = nx * bx + ny * by - d
        if da <= 0:
            out.append((ax, ay))
        if (da <= 0) != (db <= 0):
            t = da / (da - db)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def mottle_patch(cell, index):
    """THE `mottle` BASE — a low-frequency two-shade variation on the ground itself.

    THE POINT IS WHAT IT IS *NOT*. The technique reference's one transferable strategic takeaway is
    "rely ~80% on the terrain treatment", and the obvious way to spend that here is a carpet of
    grass. Under ADR-0226 grass MEANS a capability's tests, so a carpet of it that tracks no test
    count is art asserting something the meaning layer does not authorise — ADR-0367 D5's failure,
    and the `carpet` base exists to price exactly that rather than to be recommended.

    A mottle buys ground interest with no such claim: it is the SAME cell, the SAME status token, at
    a shade level the closed palette already holds (`C.SEAM_LEVEL`, which the land's own seams use),
    so it widens no palette and introduces no second thing that means "tests".

    The split is a deterministic half-plane through the cell rather than a texture, because at the
    delivered scale a cell is a few dozen pixels: anything finer than a half is below the
    quantisation threshold and becomes the very noise the pass is trying to remove.
    """
    poly = cell["poly"]
    a = scatter.det("mottle", index, "ang") * math.tau
    nx, ny = math.cos(a), math.sin(a)
    proj = [nx * x + ny * y for x, y in poly]
    lo, hi = min(proj), max(proj)
    # the cut sits between 35% and 65% across, so neither side ever vanishes
    d = lo + (hi - lo) * (0.35 + scatter.det("mottle", index, "cut") * 0.30)
    return _clip_half_plane(poly, nx, ny, d)


# ---------------------------------------------------------------- the land pass
def compose_land(decor_items, cells=None, caps=None, ground="flat"):
    """The `b++` land with `decor_items` interleaved into its painter order.

    Mirrors `C.compose('flat', 'cell')`'s draw-list assembly because a new drawable class genuinely
    has to enter that list. `assert_land_unchanged()` holds the mirror honest by running both and
    comparing bytes, so this is a proved copy rather than a trusted one.

    Decor sorts at tier 3 on its OWN ground y — after the cell it stands on (tier 2) and before
    anything nearer. That single sort is what makes the composite correct without a depth buffer:
    a tuft on a far cell is covered by a nearer raised cell's top face, exactly as the cell behind
    it is.
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
    for pos, h, height, side in C.boundary_walls(cells, ELEVATION_MODE):
        draw.append((pos[1], 1, ("wall", pos, h, height, side)))
    for c in cells:
        draw.append((c["c"][1], 2, ("cell", c, C.height_of(c, ELEVATION_MODE))))
    for d in decor_items:
        draw.append((d["g"][1], 3, ("decor", d)))
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
            if ground == "mottle":
                # the SAME cell, the SAME status token, at a shade the closed palette already
                # holds — ground interest that claims nothing about the work (see `mottle_patch`)
                sub = mottle_patch(c, tuple(c["c"]))
                if len(sub) >= 3:
                    C.fill_polygon(canvas, alpha,
                                   [(C.project(gx, gy, height)[0] * C.SS,
                                     C.project(gx, gy, height)[1] * C.SS) for gx, gy in sub],
                                   C.shade(base, C.SEAM_LEVEL))
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


def render_variant(decor_items, cells=None, caps=None, tree=True, ground="flat"):
    canvas, alpha, tree_h = compose_land(decor_items, cells=cells, caps=caps, ground=ground)
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


