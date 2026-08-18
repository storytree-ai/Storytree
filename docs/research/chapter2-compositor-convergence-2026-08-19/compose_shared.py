#!/usr/bin/env python3
"""The ONE implementation of everything two research compositors used to vendor twice.

    import compose_shared as SH
    SH.paste_decor(C, canvas, alpha, piece, cx, cy, roles, role_map)

THE CONTRACT, and it is the whole reason this module can be shared safely:

    EVERY FUNCTION HERE TAKES ITS PASS STATE AS AN EXPLICIT PARAMETER.
    THIS MODULE HOLDS NO PER-PASS STATE OF ITS OWN — no island, no piece directory, no `C`.

That is not a style preference, it is the fix for a measured hazard. A function that reads `C` (or
`ISLAND`, or `DECOR_PIECES`) out of its own module globals serves the DEFINING module's island to
whoever calls it, silently and at exit 0. PR #1393 measured that property doing real damage: turning
`disperse.py` into an alias of `scatter.py` disarmed two live monkey-patches at once, because the
callee resolved its helpers in the canonical module's globals — and BOTH kept printing as if they
had worked. `verify_refusal._with_candidate` would have measured the unmodified fix while printing
CAUGHT, and `compose_options.place`'s area-aware count fork would have drawn ORDINARY counts under a
fork caption. A convergence that took the obvious route — `from compose_core import paste_decor` —
would have recreated exactly that, and this whole module is arranged so that it cannot.

The precedent this follows is `compose_core.walls_under_caps(C, cells, elevation_mode, caps)`, which
PR #1412 landed for the same reason and for the same two callers. What was true of those two rules
is true of these nine functions; this module is that decision carried to its end.

WHY THE PARAMETERS ARE SHOUTED (`C`, `ISLAND`, `SWEEP`, `DECOR_META`, `ELEVATION_MODE`). They are
named after the module globals they replace, and that is deliberate: it is what let every body below
move BYTE-FOR-BYTE out of the two copies it replaces. Only the `def` line of each function was
rewritten. `verify.py` re-derives that claim from the git history rather than asking anyone to trust
it, so the reviewer's question is "is the signature right?" and never "was the body edited on the
way?". Both `ast.unparse` and `tokenize.untokenize` were tried first and both reformat — untokenize
renders `json.load` as `json .load` and drops continuation-line alignment — on a track where the
prose is the deliverable.

WHAT IS DELIBERATELY NOT HERE.

  * `walls_under_caps` and `decor_depth_key` stay in `compose_core`. They are ALREADY a single
    implementation (PR #1412) and they read module-level switches that `delivery.centroid_key()`
    sets in order to reintroduce the painter-order defect on purpose. Moving them would break that
    coupling, which `chapter2-delivery-residual-2026-08-18/verify.py` asserts by function IDENTITY.
    Converging what is already converged buys nothing and costs a proved rung.
  * `compose_land`, `render_variant` and the mottle helpers stay per-pass. They are the two passes'
    OWN composition and they genuinely differ: the grass pass draws a `ground="mottle"` branch the
    dressing pass has no piece set for. They were never byte-identical (0.707 and 0.771 similar),
    so there is no copy here to remove — only a difference to keep honest.
"""
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# `provenance` is the hero track's, reached exactly the way every other pass reaches it, so there is
# one module object and `require_one_state_per_generator` below composes with the shared helper
# rather than a second copy of it.
sys.path.insert(0, os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402


# ------------------------------------------------------------------ the nine converged functions
# Each body below is byte-identical to the two copies it replaces; only the def line was rewritten.

def rebind(C, ISLAND_PATH, LAND_PIECES):
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


def load_decor(DECOR_PIECES):
    meta = json.load(open(os.path.join(DECOR_PIECES, "render-meta.json")))
    pieces = {}
    for name in meta["pieceNames"]:
        keys = list(meta["pieceRoles"][name].keys())
        pieces[name] = classify_decor(os.path.join(DECOR_PIECES, f"{name}.png"), keys, meta)
    return meta, pieces


def build_palette_dressed(C, DECOR_META):
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


def paste_decor(C, canvas, alpha, piece, cx, cy, roles, role_map):
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


def assert_land_unchanged(C, compose_land, INTERIOR, ELEVATION_MODE):
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


def plant_tree(C, ISLAND, SWEEP, img, height):
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


def prepare(C, ISLAND, ELEVATION_MODE, cells):
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
