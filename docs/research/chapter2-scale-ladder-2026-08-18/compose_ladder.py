#!/usr/bin/env python3
"""THE SCALE LADDER — one island, one code state, authored at 1x / 2x / 4x / 8x, plus the outline
probe the land has never had, the byte price of each rung, and the per-element answer.

    python compose_ladder.py        # -> the pictures, ladder-report.json, provenance sidecars

THE QUESTION, AND IT IS NOT THE ONE THIS INSTRUMENT WAS ORIGINALLY PROPOSED TO ANSWER. ADR-0380
(2026-08-18) retired ADR-0069's no-GPU constraint and reopened runtime 3D for the land, and in doing
so re-pointed this ladder:

    "The scale ladder already recommended on this arc keeps its value and CHANGES ITS QUESTION: it no
     longer asks whether live rendering is permitted, but WHICH ELEMENTS ACTUALLY NEED IT — if 2x
     sprites read well enough for an element, D4 says that is the cheaper answer and D6 obliges no
     one to spend the GPU."

So a single verdict for "the land" would answer the wrong question. Seven elements are measured
separately — cell fill, rim wall, terrace, coast, vegetation mark, flower, hero tree — and each gets
its own rung and its own recommendation.

THIS TAKES NO APPEARANCE VERDICT. The look call is the owner's (ADR-0070 stage 2) and nothing in this
directory has standing to sign one. What is delivered is the ladder, the numbers, and a per-element
recommendation that is explicitly non-binding.

HOW A RUNG IS AUTHORED RATHER THAN UPSCALED, which is the whole methodological claim.
`ladder.piece_supersample(k)` renders every Blender piece at `3k` pixels per ground unit; the
compositor reads that back out of the piece set's own `render-meta.json` (`C.SS`), so the
supersampled canvas is `3k` px per ground unit too; and the majority downsample then divides by 3
rather than by `3k`, delivering `k` pixels per ground unit. NOTHING is resampled: Cycles saw the
geometry at the rung's density and the vote that produces a delivered pixel is the same 3x3 vote at
every rung. `assert_rung_is_authored()` refuses a composite whose piece sets do not agree with the
rung, which is the exact shape an accidental upscale takes.

NO FOURTH COMPOSITOR. This file adds none. It IMPORTS `compose_healthy.py` whole with its writes sent
to scratch (so its refusals are this pass's refusals), draws through `compose_core.compose_land`,
snaps through `compose.back_half`, places plants through the FIXED positioner
(`chapter2-plant-dispersion-2026-08-17`, imported never vendored), and species through the
high-frequency pass's `pieces-species` recipe. What is genuinely new is the RUNG (a scale swap around
the existing back half), the OUTLINE probe, and the ATTRIBUTION pass below.

THE ATTRIBUTION PASS, and why it is not a second compositor. Every per-element number here needs to
know which drawable owns a delivered pixel. Rather than re-deriving the draw order, this file runs
`compose_land` A SECOND TIME with the three drawing primitives wrapped so each writes a unique ID
COLOUR instead of its authored one — same geometry, same painter order, same functions, one canvas at
a time. Majority-downsampling that id canvas gives an exact owner per delivered pixel. The colour
canvas answers WHAT a pixel is; the id canvas answers WHICH INSTANCE it belongs to; and the two are
cross-checked against each other, with the disagreement reported rather than assumed away.

THE FENCE. The whole diff is `docs/research/**`. `LAND_CAMERA_ELEVATION_DEG` is 20 in
`packages/forest-world/src/camera.ts`, is neither read nor written here, and is NOT moved.
"""
import hashlib
import importlib.util
import json
import math
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

import ladder as L

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(RESEARCH, "chapter2-hex-lines-and-flat-green-2026-08-16")
SWEEP = os.path.join(RESEARCH, "chapter2-camera-elevation-sweep-2026-08-15")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")
DISPERSION = os.path.join(RESEARCH, "chapter2-plant-dispersion-2026-08-17")
HERO = os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1")

for p in (HERE, HEALTHY, GRASS, LINES, OPTIONS, DISPERSION, HERO):
    sys.path.insert(0, p)

import island_pass as P                                    # noqa: E402
import provenance                                          # noqa: E402
import seams as S                                          # noqa: E402
import disperse as X                                       # noqa: E402  THE FIXED POSITIONER

OUT = os.environ.get("STORYTREE_LADDER_OUT") or HERE
PIECES = os.path.join(HERE, "pieces")

# -----------------------------------------------------------------------------------------------------
# REFUSAL-HARNESS HATCHES — the pattern `compose_core.DECOR_SORTS_AFTER_ITS_CELL` established, so
# `verify_refusal.py` can drive THIS composer in THIS directory rather than a copy of it. BOTH MUST BE
# OFF AT REST and `verify.py` asserts it.
# -----------------------------------------------------------------------------------------------------
#: Upscales every rung from the rung-1 piece sets instead of authoring it — the exact defect the
#: increment names ("an upscale measures the upscaler, not the ladder"), so the guard that refuses it
#: can be shown to fire on a real composite rather than on a hand-built array.
PERTURB_UPSCALED = os.environ.get("STORYTREE_LADDER_PERTURB") == "upscaled-rung"
#: Draws the outline on EVERY id boundary, cell-to-cell joins included — which reinstates the interior
#: mesh seam the owner removed on 2026-08-16, wearing a shading model.
PERTURB_SEAM_OUTLINE = os.environ.get("STORYTREE_LADDER_PERTURB") == "seam-outline"
#: Rungs to compose. A refusal harness pays for one rung, not four.
RUNGS = tuple(int(t) for t in os.environ["STORYTREE_LADDER_RUNGS"].split(",")) \
    if os.environ.get("STORYTREE_LADDER_RUNGS") else L.RUNGS


# =====================================================================================================
# mount the healthy-island pass WHOLE, with its writes sent to scratch
# =====================================================================================================
def _load_healthy():
    """Its module-level refusals become this pass's refusals: the committed piece set is valid for
    this island's geometry, one code state per generator, the camera is the signed one,
    island/proof/STORY_ID name ONE story, no status outside the RENDERED vocabulary, and every
    `healthy` is backed by a signed pass (ADR-0040). Importing rather than restating means no rung of
    this ladder can be composed over an island those refusals would have declined to draw."""
    tmp = tempfile.mkdtemp(prefix="scale-ladder-")
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
ISLAND_PATH = CH.ISLAND_PATH
REPORT = {"rungs": {}, "pass": {}}

assert abs(L.PASS_ELEVATION_DEG - P.PASS_ELEVATION_DEG) < 1e-9, (
    f"ladder.py declares {L.PASS_ELEVATION_DEG} deg and island_pass.py declares "
    f"{P.PASS_ELEVATION_DEG}. The angle enters ONCE.")

#: The one-surface collapse, INHERITED from the shadow pass rather than re-decided here: every cell
#: drawn at variant 0 with the tan wheat subset off. It is the flat green the owner cleared on
#: 2026-08-16 ("the green on the land is not consistent either"), and a ladder composed on the
#: three-variant surface would be measuring a texture the track has already withdrawn.
ONE_SURFACE_VARIANT = 0


def land_dir(k):
    return os.path.join(PIECES, f"pieces-land-{L.tag(k)}")


def species_dir(k):
    return os.path.join(PIECES, f"pieces-species-{L.tag(k)}")


def tree_frames(k):
    return os.path.join(PIECES, f"tree-{L.tag(k)}", "frames")


# =====================================================================================================
# 1. THE RUNG — mounting it, and REFUSING one that is not authored at its own density
# =====================================================================================================
def _px_per_ground(meta):
    """A piece set's authored density, read out of its own render-meta rather than out of a flag."""
    return float(meta["pieceCanvasPx"]) / float(meta["pieceCanvasWorld"])


def mount(rung):
    """Point the imported compositor at THIS rung's piece sets, and rebind.

    `compose_core.rebind()` reads `C.SS` straight out of the land set's `render-meta.json`, so
    mounting a rung's pieces is what moves the supersampled canvas to that rung's density — there is
    no scale variable to keep in step by hand. `compose.py`'s functions read module state at call
    time, which is the property the elevation sweep exploited to have one projection implementation
    rather than one per angle, and it is the same property that gives one compositor rather than one
    per rung.
    """
    src = 1 if PERTURB_UPSCALED else rung
    D.ISLAND_PATH = ISLAND_PATH
    D.LAND_PIECES = land_dir(src)
    D.ISLAND, D.LAND_META = D.rebind()
    D.use_pieces(species_dir(src), expect_geometry="species")
    return D.ISLAND


def assert_rung_is_authored(rung):
    """REFUSE a rung whose pieces were not rendered at that rung's density.

    THIS IS THE GUARD THE INCREMENT ASKS FOR, in the durable form. "Author at each rung rather than
    upscaling a 1x raster — an upscale measures the upscaler, not the ladder." An upscale is not a
    visible mistake: rung 8 composed from rung-1 pieces produces a picture of exactly the right size,
    with a caption that is exactly wrong, and every number downstream of it measures a nearest-
    neighbour resampler. So the density is asserted from each set's OWN declaration, three ways —
    land, decor and hero tree — rather than from this file's belief about what it rendered.

    Written as a property of the ARTEFACTS and not as a diff against a branch: a branch-diff fence
    tests the branch, not the promise (the greenery pass went 35/36 reporting exactly that).
    """
    want = float(L.piece_supersample(rung))
    land = _px_per_ground(D.LAND_META)
    decor = _px_per_ground(D.DECOR_META)
    tree = json.load(open(os.path.join(tree_frames(rung), "registration.json")))
    tree_px = int(tree["canvas"]["width"])
    problems = []
    if abs(land - want) > 1e-9:
        problems.append(f"land pieces are {land:g} px per ground unit, rung x{rung} needs {want:g}")
    if abs(decor - want) > 1e-9:
        problems.append(f"decor pieces are {decor:g} px per ground unit, rung x{rung} needs {want:g}")
    if abs(float(C.SS) - want) > 1e-9:
        problems.append(f"the compositor is at SS={C.SS}, rung x{rung} needs {want:g}")
    if tree_px != L.tree_delivered(rung):
        problems.append(f"the hero tree sprite is {tree_px} px, rung x{rung} needs "
                        f"{L.tree_delivered(rung)}")
    if problems:
        raise SystemExit(
            "REFUSED: rung x%d is not AUTHORED at its own density, so this ladder would be measuring "
            "an upscaler.\n  - %s\n  Re-render with `python render_all.py --only %d`."
            % (rung, "\n  - ".join(problems), rung))
    return {"pxPerGroundUnit": want, "landPieces": land, "decorPieces": decor,
            "heroTreeSpritePx": tree_px, "supersample": L.SUPERSAMPLE}


# =====================================================================================================
# 2. THE PLACEMENTS — through the FIXED positioner, at the story's REAL test counts
# =====================================================================================================
SPECIES_SLOTS = ["tuft-3a", "tuft-2", "tuft-3b", "tuft-4"]


def place(island):
    """The placements, from the FIXED positioner, at the story's own contract counts.

    `scatter.capability_tests` INVENTS a count from a hash — its own docstring says so — and is
    replaced by the story's real `spec.contracts.length`, exactly as `compose_healthy.scatter_real`
    does, so the counts on these pictures are the story's. The patch lands on `X.S` (the scatter
    module) and NOT on `X`: since the dispersion fix moved into `scatter.py`, `disperse` is a named
    ALIAS and a patch aimed at the alias is inert while still printing as if it worked.

    THE PLACEMENTS DO NOT MOVE WITH THE RUNG, and that is the point. They are ground-space, so the
    same plant stands on the same square metre of island at every rung and only its delivered
    resolution changes. A ladder whose plants also moved would vary two things at once.
    """
    real_tests = [c["tests"] for c in island["capabilities"]]
    original = X.S.capability_tests
    X.S.capability_tests = lambda ci, status, seed: real_tests[ci]
    try:
        return X.scatter_dispersed(island, D.DECOR_META["tokenFamilies"], island["storyId"],
                                   island["uatCriteria"])
    finally:
        X.S.capability_tests = original


def respeciate(items):
    """Spread the tuft placements over the FOUR species slots, as the high-frequency pass does.

    `scatter.tuft_piece` reserves `tuft-2` for an `unknown` capability and `tuft-4` for a lush one, so
    on an all-`healthy` island a four-species set would deliver as two or three. The reassignment is a
    hash over the placement's OWN address, disjoint from both count and position: it moves no plant
    and adds or removes none. A SPECIES CARRIES NO MEANING — ADR-0226 D2 gives the signal to the
    COUNT — so four outlines assert exactly what two did.
    """
    out = []
    for i, it in enumerate(items):
        if it["kind"] != "tuft":
            out.append(it)
            continue
        j = int(X.S.det("species", it["cap"], i, it["g"][0], it["g"][1]) * len(SPECIES_SLOTS))
        d = dict(it)
        d["piece"] = SPECIES_SLOTS[min(j, len(SPECIES_SLOTS) - 1)]
        out.append(d)
    return out


# =====================================================================================================
# 3. COMPOSING ONE RUNG — the colour pass, the id pass, and the scale swap between them
# =====================================================================================================
def prepared_cells(island):
    cells = D.prepare(island["variantB"]["cells"])
    for c in cells:
        c["variant"] = ONE_SURFACE_VARIANT
        c["wheat"] = False
    return cells


def seam_control(island):
    lattice = ({"tiles": island["hexLattice"]["tiles"]} if "hexLattice" in island
               else S.load_hex_lattice())
    return S.SeamControl(C, island, lattice).install()


def back_half_at_rung(canvas, alpha, rung):
    """The SHIPPED back half, run so that it divides by 3 rather than by 3k.

    THE ONE PIECE OF SCALE ARITHMETIC IN THE PASS, and it is a swap rather than a reimplementation.
    `C.mode_down` reads `SS` and `CANVAS_W/H` from module state: it reshapes the supersampled canvas
    into `(CANVAS_H, SS, CANVAS_W, SS)` blocks and votes within each. At rung k the canvas is
    `(H1*3k, W1*3k)`, so telling the module `SS=3` and `CANVAS=(H1*k, W1*k)` describes exactly the
    same array and votes over exactly the same 3x3 neighbourhoods — one delivered pixel per 3x3, at
    every rung, which is what makes the four rungs ONE pipeline. Nothing else changes: the palette
    snap, the majority vote and the silhouette rim are the shipped ones, unedited.
    """
    want = (C.CANVAS_H * C.SS, C.CANVAS_W * C.SS)
    if canvas.shape[:2] != want:
        raise SystemExit(f"REFUSED: canvas is {canvas.shape[:2]} but the mounted rung implies {want}")
    saved = (C.SS, C.CANVAS_W, C.CANVAS_H)
    C.SS, C.CANVAS_W, C.CANVAS_H = L.SUPERSAMPLE, saved[1] * rung, saved[2] * rung
    try:
        return C.back_half(canvas, alpha)
    finally:
        C.SS, C.CANVAS_W, C.CANVAS_H = saved


def compose_colour(island, cells, items, rung):
    """The delivered land + plants, WITHOUT the hero tree. The tree is pasted afterwards onto a copy,
    so the bare land is available to every instrument for free rather than as a second composite —
    and the arc has paid for that once already: the hero tree OCCLUDES cells, and a per-cell measure
    taken with it in frame read the seam cost 4.87% instead of the true 6.21%."""
    ctrl = seam_control(island)
    ctrl.reset(P.SEAMS_DRAWN)
    try:
        canvas, alpha, tree_h = D.compose_land(items, cells=cells, ground=P.GROUND)
    finally:
        ctrl.restore()
    img, solid = back_half_at_rung(canvas, alpha, rung)
    del canvas, alpha
    return img, solid, tree_h


# ---------------------------------------------------------------- the id pass
def _id_rgb(i):
    return np.array([(i >> 16) & 255, (i >> 8) & 255, i & 255], dtype=np.float32)


def _id_hex(i):
    return "#%02x%02x%02x" % ((i >> 16) & 255, (i >> 8) & 255, i & 255)


class Attribution:
    """Run `compose_land` a SECOND time with the three drawing primitives writing ID COLOURS.

    WHY THIS AND NOT A DIFFERENCE. Every per-element number this pass owes needs to know which
    drawable owns a delivered pixel — which cell, which wall placement, which plant. A
    with-and-without difference answers that only for a layer, and answers it wrongly wherever a
    drawable happens to paint the colour that was already there. Wrapping the primitives instead
    gives an EXACT owner: the same three functions, the same geometry, the same painter order — a
    later drawable overwrites an earlier one in the id canvas exactly as it does in the colour
    canvas — and the id is a value nothing else can collide with.

    It is deliberately a SECOND PASS rather than a mirror inside the first: at rung 8 the
    supersampled canvas is ~52M pixels, and holding a colour canvas and an id canvas at once would
    double the peak. Composed one at a time, the peak is one canvas plus the delivered raster.

    `paste_piece` and `paste_decor` both SHADE the colour they are handed (a band key becomes
    `KEY_SHADE[name]` of the token, a decor role becomes its declared level), which would scale the
    id out of recognition. So for the id pass every shade level is temporarily 1.0 — a change to the
    id canvas alone, made and restored inside this class, and one `verify.py` re-derives by checking
    that every id the canvas carries is one this pass actually issued.
    """

    def __init__(self):
        self.rows = []            # per-id metadata, index i-1
        self.canvas = None
        self.alpha = None
        self._saved = None

    def issue(self, kind, **meta):
        self.rows.append(dict(kind=kind, drawIndex=len(self.rows), **meta))
        return len(self.rows)     # 0 is "nothing drawn here"

    def install(self):
        real_fill, real_piece, real_decor = C.fill_polygon, C.paste_piece, D.paste_decor
        att = self

        def fill(canvas, alpha, poly_px, rgb, seam_rgb=None):
            i = att.issue("polygon")
            real_fill(canvas, alpha, poly_px, _id_rgb(i),
                      None if seam_rgb is None else _id_rgb(i))

        def piece(canvas, alpha, pc, cx, cy, top_rgb, side_rgb):
            i = att.issue("piece", cx=float(cx), cy=float(cy))
            real_piece(canvas, alpha, pc, cx, cy, _id_rgb(i), _id_rgb(i))

        def decor(canvas, alpha, pc, cx, cy, roles, role_map):
            i = att.issue("decor", cx=float(cx), cy=float(cy))
            real_decor(canvas, alpha, pc, cx, cy,
                       {r: _id_hex(i) for r in roles},
                       {k: (role, 1.0) for k, (role, _lv) in role_map.items()})

        self._saved = (real_fill, real_piece, real_decor, dict(C.KEY_SHADE))
        C.fill_polygon, C.paste_piece, D.paste_decor = fill, piece, decor
        for k in C.KEY_SHADE:
            C.KEY_SHADE[k] = 1.0
        return self

    def restore(self):
        real_fill, real_piece, real_decor, key_shade = self._saved
        C.fill_polygon, C.paste_piece, D.paste_decor = real_fill, real_piece, real_decor
        C.KEY_SHADE.clear()
        C.KEY_SHADE.update(key_shade)


def _majority_ids(ids, ss):
    """Majority-downsample an integer id plane by `ss`, matching `C.mode_down`'s vote.

    `C.mode_down` loops over every distinct VALUE, which is right for a few dozen palette colours and
    wrong for a few hundred drawable ids at 52M pixels. The same vote is computed here by sorting each
    block's `ss*ss` values and taking the longest run — one sort instead of one full-array pass per
    id. Ties go to the smaller id, deterministically, exactly as a stable argmax would.
    """
    h, w = ids.shape
    H, W = h // ss, w // ss
    blocks = ids.reshape(H, ss, W, ss).transpose(0, 2, 1, 3).reshape(H, W, ss * ss)
    blocks = np.sort(blocks, axis=2)
    best = np.zeros((H, W), dtype=ids.dtype)
    bestn = np.zeros((H, W), dtype=np.int32)
    run_val = blocks[:, :, 0]
    run_len = np.ones((H, W), dtype=np.int32)
    for j in range(1, ss * ss):
        v = blocks[:, :, j]
        same = v == run_val
        run_len = np.where(same, run_len + 1, 1)
        run_val = v
        take = (run_len > bestn) & (v > 0)
        best = np.where(take, v, best)
        bestn = np.where(take, run_len, bestn)
        if j == 1:
            first = (blocks[:, :, 0] > 0) & (bestn == 0)
            best = np.where(first, blocks[:, :, 0], best)
            bestn = np.where(first, 1, bestn)
    return best


def compose_ids(island, cells, items, rung):
    """The owner of every delivered pixel, at this rung, as an integer id plane + a row per id."""
    att = Attribution().install()
    try:
        ctrl = seam_control(island)
        ctrl.reset(P.SEAMS_DRAWN)
        try:
            canvas, alpha, _h = D.compose_land(items, cells=cells, ground=P.GROUND)
        finally:
            ctrl.restore()
    finally:
        att.restore()
    ids = (canvas[:, :, 0].astype(np.int64) * 65536 + canvas[:, :, 1].astype(np.int64) * 256
           + canvas[:, :, 2].astype(np.int64))
    ids = np.where(alpha > 0.5, ids, 0)
    del canvas, alpha
    down = _majority_ids(ids.astype(np.int32), L.SUPERSAMPLE)
    del ids
    unknown = int(((down > 0) & (down > len(att.rows))).sum())
    if unknown:
        raise SystemExit(f"REFUSED: the id canvas carries {unknown} pixels whose id was never issued "
                         "— the attribution cannot be trusted and no number is written.")
    return down, att.rows


# =====================================================================================================
# 4. CLASSIFYING A DELIVERED PIXEL — what it IS, independently of which instance owns it
# =====================================================================================================
#: THE ELEMENT VOCABULARY, as codes. 0 is "not a delivered pixel"; every other value names one thing
#: a delivered pixel can be. `cell-chamfer` is the bevel that makes an extruded block read as a block
#: and belongs to its cell, so it shares the cell's instance id and is counted with it.
CLASS_NAMES = ["", "cell-fill", "cell-chamfer", "wall", "coast", "decor", "silhouette-rim"]
CLASS_CODE = {n: i for i, n in enumerate(CLASS_NAMES)}


def colour_classes():
    """Every colour the LAND may deliver, mapped to the element it belongs to.

    Derived from `C.STATUS_TOKENS` / `C.KEY_SHADE` / the coast tokens rather than typed out, so a
    palette change cannot leave this table stale while it keeps looking authoritative. `verify.py`
    re-derives it independently: a check that consults the classifier can only ever pass.
    """
    out = {}

    def put(rgb, cls):
        out[tuple(int(round(v)) for v in rgb)] = cls

    top_levels = sorted({C.FLAT_LEVEL, C.SEAM_LEVEL, C.KEY_SHADE["chamfer_lit"],
                         C.KEY_SHADE["chamfer_dark"]})
    for st in C.STATUS_TOKENS.values():
        for t in st["top"] + [st["wheat"]]:
            for m in top_levels:
                put(C.shade(C.hexrgb(t), m), "cell-fill" if m == C.FLAT_LEVEL else "cell-chamfer")
        for m in sorted(set(C.KEY_SHADE.values())):
            put(C.shade(C.hexrgb(st["side"]), m), "wall")
    for t in (C.COAST_SAND, C.COAST_SAND_EDGE):
        put(C.hexrgb(t), "coast")
    return out


def classify_delivered(img, solid, ids, rows, rung):
    """One element name per delivered pixel, from BOTH instruments, with the disagreement reported.

    The COLOUR says what a pixel is (a cell top face, a wall band, coast sand); the ID says which
    drawable put it there (which cell, which wall placement, which plant). They are independent, so
    where they agree the attribution is corroborated and where they do not the pass says so instead
    of picking one silently — the failure mode the arc named as "a harness that cannot parse its own
    evidence looks exactly like a guard that did not fire".

    Decor and the silhouette rim are settled by the id and by geometry respectively, not by colour:
    a decor role can legitimately be painted a colour the land also emits, and the rim is
    DELIBERATELY allowed to reach the whole palette (`C.back_half`'s own docstring), so a
    colour-first reading of either would be wrong by construction.
    """
    table = colour_classes()
    h, w = solid.shape
    # An integer CODE plane rather than an array of strings: at rung 8 the delivered raster is ~6M
    # pixels, and a per-pixel Python object costs an order of magnitude more memory than the canvas
    # it describes. `CLASS_CODE` is the only place a name becomes a number.
    cls = np.zeros((h, w), dtype=np.uint8)
    rgb = img[:, :, :3].astype(np.int32)
    key = rgb[:, :, 0] * 65536 + rgb[:, :, 1] * 256 + rgb[:, :, 2]
    for (r, g, b), name in table.items():
        cls[key == (r * 65536 + g * 256 + b)] = CLASS_CODE[name]

    kinds = np.zeros((h, w), dtype=np.int8)          # 0 unknown, 1 polygon, 2 piece, 3 decor
    for i, row in enumerate(rows, start=1):
        kinds[ids == i] = {"polygon": 1, "piece": 2, "decor": 3}[row["kind"]]

    # the silhouette rim: geometry, exactly as `C.back_half` computes it, never colour
    pad = np.pad(solid, 1, constant_values=False)
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    rim = solid & ~nb

    agree = int(((kinds == 1) & ((cls == CLASS_CODE["cell-fill"])
                                 | (cls == CLASS_CODE["cell-chamfer"])
                                 | (cls == CLASS_CODE["coast"]))).sum())         + int(((kinds == 2) & (cls == CLASS_CODE["wall"])).sum())
    land_px = int(((kinds == 1) | (kinds == 2)).sum())

    cls[kinds == 3] = CLASS_CODE["decor"]
    cls[rim & (cls != CLASS_CODE["decor"])] = CLASS_CODE["silhouette-rim"]
    cls[~solid] = 0
    unclassified = int((solid & (cls == 0)).sum())
    return {
        "class": cls, "rim": rim, "kinds": kinds,
        "stats": {
            "deliveredOpaquePx": int(solid.sum()),
            "unclassifiedPx": unclassified,
            "landPxWhereColourAndIdAgree": agree,
            "landPx": land_px,
            "colourIdAgreementShare": round(agree / land_px, 6) if land_px else 0.0,
        },
    }


# =====================================================================================================
# 5. THE OUTLINE PROBE — the land has never had one
# =====================================================================================================
def outline_mask(ids, cls, solid):
    """Where a selective, material-tinted interior outline would be drawn, and where it would NOT.

    THE RULE, and the one exclusion that makes it selective rather than a mesh grid. An outline pixel
    sits on a boundary between two DIFFERENT drawables, and carries on the one drawn LATER — the one
    in front. A cell top face against ANOTHER CELL's top face is excluded by name: those two faces are
    one continuous surface, and a line between them is the interior mesh seam the owner removed on
    2026-08-16 ("the mess lines as well add to the noise"). The high-frequency pass reached the same
    conclusion from the other direction — a terrace lip at every cell join IS that seam wearing a
    shading model — so reinstating it under the word "outline" would be the same mistake with better
    manners.

    What IS outlined: a plant against the ground it stands on, a wall against a cell top face (a
    genuine height step), and the land against the coast. The island's own outer silhouette already
    carries `C.back_half`'s rim and is left alone.
    """
    h, w = ids.shape
    out = np.zeros((h, w), dtype=bool)
    iscell = (cls == CLASS_CODE["cell-fill"]) | (cls == CLASS_CODE["cell-chamfer"])
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a = ids
        b = np.roll(np.roll(ids, dy, axis=0), dx, axis=1)
        cb = np.roll(np.roll(iscell, dy, axis=0), dx, axis=1)
        edge = solid & (b > 0) & (a != b) & (a > b)          # `a > b` == a drawn later == in front
        if not PERTURB_SEAM_OUTLINE:
            edge &= ~(iscell & cb)                            # the removed seam, excluded by name
        out |= edge
    return out


def apply_outline(img, mask):
    """Darken the LOCAL colour and re-snap it into the closed palette.

    The hero tree's rule, applied to the land: "selective, material-tinted outline: silhouette rim
    only, never black". Never a uniform key-line — a black outline is what makes code art read as
    clipart, and it would also be a colour the closed palette does not hold, so the snap would
    reassign it to whatever it landed nearest (the failure that once repainted 2564 `unknown` rim
    pixels `healthy` green).
    """
    out = img.copy()
    if not mask.any():
        return out
    px = out[:, :, :3][mask]
    out[:, :, :3][mask] = C.snap(np.clip(px[None, :, :] * L.OUTLINE_DEPTH, 0, 255))[0]
    return out


# =====================================================================================================
# 6. THE PER-ELEMENT MEASUREMENTS
# =====================================================================================================
def instance_stats(ids, keep, wanted_ids):
    """Delivered px, bounding box and minor axis per instance, for the instances named.

    Vectorised over the kept pixels rather than looped per instance: at rung 8 a per-instance mask
    over the delivered raster is ~5.7M comparisons and there are ~700 drawables, which is forty
    minutes of nothing. One pass with `np.minimum.at` is the same arithmetic.
    """
    ys, xs = np.nonzero(keep)
    who = ids[ys, xs]
    n = int(max(wanted_ids)) + 1 if len(wanted_ids) else 1
    px = np.bincount(np.clip(who, 0, n - 1), minlength=n)
    x0 = np.full(n, 1 << 30, dtype=np.int64)
    x1 = np.full(n, -(1 << 30), dtype=np.int64)
    y0 = np.full(n, 1 << 30, dtype=np.int64)
    y1 = np.full(n, -(1 << 30), dtype=np.int64)
    sel = who < n
    np.minimum.at(x0, who[sel], xs[sel])
    np.maximum.at(x1, who[sel], xs[sel])
    np.minimum.at(y0, who[sel], ys[sel])
    np.maximum.at(y1, who[sel], ys[sel])
    rows = []
    for i in wanted_ids:
        if px[i] == 0:
            rows.append({"px": 0, "w": 0, "h": 0, "minor": 0})
            continue
        w, h = int(x1[i] - x0[i] + 1), int(y1[i] - y0[i] + 1)
        rows.append({"px": int(px[i]), "w": w, "h": h, "minor": int(min(w, h))})
    return rows


def _median(vals):
    return float(np.median(vals)) if len(vals) else 0.0


def band_width(mask):
    """The median WIDTH of a band-shaped element, in delivered pixels.

    A bounding box is the wrong instrument for the coast: the sand is a RING around the island, so
    its bbox is the whole island and its "minor axis" would read as two hundred pixels while the band
    a viewer actually sees is a handful. The width of a ring is the length of the runs it makes when
    you cross it, so that is what is measured — every maximal horizontal and vertical run of the mask,
    medianed. On a compact element this returns the same order as the bbox minor axis, so the two
    instruments do not disagree about anything except the shape they were chosen for.

    Vectorised, and it has to be: a Python loop over rows and columns is ~12M iterations at rung 8,
    which is minutes of nothing per element. The runs are found by padding each row with a zero at
    both ends and differencing — a +1 opens a run and a -1 closes it, in order, so the two index
    arrays pair up positionally with no per-row bookkeeping.
    """
    lens = []
    for m in (mask, mask.T):
        p = np.zeros((m.shape[0], m.shape[1] + 2), dtype=np.int8)
        p[:, 1:-1] = m
        d = np.diff(p, axis=1)
        starts = np.nonzero(d == 1)[1]
        ends = np.nonzero(d == -1)[1]
        if len(starts):
            lens.append(ends - starts)
    if not lens:
        return 0.0
    return float(np.median(np.concatenate(lens)))


def _colour_keys(img, ys, xs):
    rgb = img[ys, xs, :3].astype(np.int64)
    return rgb[:, 0] * 65536 + rgb[:, 1] * 256 + rgb[:, 2]


def per_instance_colour_counts(ids, keep, img, wanted_ids):
    """How many distinct delivered colours each instance carries — one pass, not one pass per
    instance.

    The (instance, colour) pairs are uniqued once and then counted per instance, so the cost is a
    single sort over the kept pixels rather than a full-array comparison per drawable. At rung 8 the
    looped form is ~1G comparisons for one element row, and there are six of them.
    """
    ys, xs = np.nonzero(keep)
    if len(ys) == 0:
        return []
    who = ids[ys, xs].astype(np.int64)
    ck = _colour_keys(img, ys, xs)
    pairs = np.unique(who * (1 << 25) + ck)
    per = np.bincount((pairs // (1 << 25)).astype(np.int64))
    return [int(per[i]) for i in wanted_ids if i < len(per) and per[i] > 0]


def distinct_colours(img, sel):
    ys, xs = np.nonzero(sel)
    if len(ys) == 0:
        return 0
    return int(len(np.unique(_colour_keys(img, ys, xs))))


def element_row(name, ids, cls_map, img, wanted_ids, class_names, rung, band=False):
    """One element's row at one rung: the numbers, then the READING RULE applied to them.

    The rule is `ladder.READING_RULE`. It is stated in advance, in one place, and applied to all seven
    elements identically. The raw numbers are reported beside the verdict so a reader who disagrees
    with the rule can apply their own without re-rendering anything — which is the difference between
    an instrument and an opinion.

    THE COLOUR CRITERION IS NOT "flat green is a failure". A cell's own class here is its top face
    PLUS its chamfer, and the chamfer is the bevel that makes an extruded block read as a block rather
    than as a flat polygon. So "this element delivers one colour" means its bevel is sub-pixel and it
    is delivering as a flat shape; "two or more" means the block is there. That is a geometry
    question, not a taste one, and it is why the same criterion is meaningful for a plant (silhouette
    versus silhouette-with-an-interior) and for a wall (one band versus a lit and a dark one).
    """
    cls = cls_map["class"]
    keep = np.zeros(cls.shape, dtype=bool)
    for cn in class_names:
        keep |= (cls == CLASS_CODE[cn])
    sel = np.isin(ids, wanted_ids) & keep
    rows = instance_stats(ids, keep, wanted_ids)
    delivered = [r for r in rows if r["px"] > 0]
    counts = per_instance_colour_counts(ids, keep, img, wanted_ids)
    med_px = _median([r["px"] for r in delivered])
    med_minor = band_width(sel) if band else _median([r["minor"] for r in delivered])
    med_colours = _median(counts)
    n_colours = distinct_colours(img, sel)
    return {
        "element": name, "rung": rung,
        "instances": len(wanted_ids),
        "instancesDelivering": len(delivered),
        "zeroDeliveryShare": round(1 - len(delivered) / len(wanted_ids), 4) if wanted_ids else 0.0,
        "deliveredPx": int(sum(r["px"] for r in rows)),
        "medianInstancePx": med_px,
        "medianInstanceMinorAxisPx": med_minor,
        "minorAxisInstrument": "median band run-length" if band else "median bbox minor axis",
        "medianInstanceDistinctColours": med_colours,
        "distinctColoursInClass": n_colours,
        # AN ELEMENT DRAWN AS ONE AUTHORED COLOUR IS FLAT BY CONSTRUCTION, and the colour criterion
        # is then not a bar it fails but a bar that does not apply. The settled `b++` land draws a
        # cell INTERIOR with `fill_polygon` — one flat status-tinted polygon, no bevel, which is what
        # "flat green" means and what the owner cleared on 2026-08-16. No rung can add an interior to
        # a shape that has none by decision, so for such an element the rule reduces to its size and
        # its boundary. Derived from the delivered raster, never declared.
        "flatByConstruction": n_colours <= 1,
        "readsHere": bool(med_minor >= L.MIN_MINOR_AXIS_PX
                          and (n_colours <= 1 or med_colours >= L.MIN_DISTINCT_COLOURS)),
    }


# =====================================================================================================
# 7. THE HERO TREE — pasted at the rung, from the rung's own render
# =====================================================================================================
def plant_tree_at_rung(img, tree_h, rung):
    """Composite the rung's hero-tree sprite AFTER the land's back half, at `rung` : 1.

    `compose_core.plant_tree` pastes the sweep's committed 128 px sprite at 1:1 and has no way to
    express a rung, so the blit is restated here — and held honest rather than trusted: at rung 1 this
    function's output is asserted byte-identical to `D.plant_tree`'s, on the DECODED raster. The
    sprite is deliberately NOT put through the land's palette snap: it is shipped art with its own
    palette and its own signed ceiling verdict, and re-snapping it would re-author something the owner
    has already looked at and signed.
    """
    frames = tree_frames(rung)
    reg = json.load(open(os.path.join(frames, "registration.json")))
    if abs(float(reg["camera_elevation_deg"]) - C.ELEV) > 1e-9:
        raise SystemExit(f"REFUSED: the rung x{rung} tree records {reg['camera_elevation_deg']} deg, "
                         f"not {C.ELEV} — one composite, one camera (ADR-0367 D1)")
    frame = np.array(Image.open(os.path.join(frames, reg["frameOrder"][-1])).convert("RGBA"),
                     dtype=np.float32)
    anchor = reg["groundSocketAnchor"]
    gx, gy = D.ISLAND["islandCentreGround"]
    px, py = C.project(gx, gy, tree_h)
    x0 = int(round(px * rung)) - int(round(anchor["x"]))
    y0 = int(round(py * rung)) - int(round(anchor["y"]))
    h, w = frame.shape[:2]
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(img.shape[1], x0 + w), min(img.shape[0], y0 + h)
    sub = frame[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    a = sub[:, :, 3:4] / 255.0
    dst = img[sy0:sy1, sx0:sx1]
    dst[:, :, :3] = sub[:, :, :3] * a + dst[:, :, :3] * (1 - a)
    dst[:, :, 3] = np.maximum(dst[:, :, 3], sub[:, :, 3])
    return img, frame, reg


# =====================================================================================================
# 8. THE DETERMINISM CHECK, ON THE DECODED RASTER
# =====================================================================================================
def assert_tree_matches_the_signed_render():
    """Rung 1's hero tree must be the SIGNED sprite, pixel for pixel — asserted on DECODED pixels.

    A PNG's CONTAINER differs on every re-render: the arc confirmed live that across two
    pixel-identical Blender runs, 0 of 22 files had identical BYTES. So a file hash reports 100% drift
    with zero present, and the only honest instrument is the decoded raster.

    What this proves is worth stating, because it is stronger than "the renderer is deterministic":
    rung 1 of this ladder was rendered TODAY, in THIS worktree, from `blender_tree.py` at the same
    flags the camera-elevation sweep used on 2026-08-15 in a DIFFERENT worktree — and it must land on
    the committed `tree-50` frame the owner looked at when they signed the angle. If it does not, the
    whole ladder is standing on a tree nobody signed, and every rung above rung 1 would inherit that
    silently.
    """
    mine_path = os.path.join(tree_frames(1), "frame-18.png")
    mine = np.array(Image.open(mine_path).convert("RGBA"))
    tag = ("%g" % C.ELEV).replace(".", "p")
    theirs_path = os.path.join(SWEEP, f"tree-{tag}", "frames", "frame-18.png")
    theirs = np.array(Image.open(theirs_path).convert("RGBA"))
    same_bytes = (hashlib.sha256(open(mine_path, "rb").read()).hexdigest()
                  == hashlib.sha256(open(theirs_path, "rb").read()).hexdigest())
    if mine.shape != theirs.shape or not np.array_equal(mine, theirs):
        diff = int((mine != theirs).any(axis=2).sum()) if mine.shape == theirs.shape else -1
        raise SystemExit(
            f"REFUSED: rung 1's hero tree is not the committed `tree-{tag}` sprite ({diff} pixels "
            "differ). Every rung above it would inherit an unsigned tree, so no picture is written.")
    return {"decodedRasterIdentical": True, "fileBytesIdentical": bool(same_bytes),
            "comparedAgainst": os.path.relpath(theirs_path, REPO).replace(os.sep, "/"),
            "reading": "asserted on the DECODED raster. The byte comparison is reported beside it "
                       "ONLY so the container-hash trap stays visible: a PNG container differs on "
                       "every re-render, so a file hash can report drift that is not there."}


# =====================================================================================================
# 9. DRIVE THE RUNGS
# =====================================================================================================
def save_rgba(path, img):
    """The island's own raster, transparent outside the silhouette — the shape a sprite sheet ships,
    and therefore the shape ADR-0380 D4's byte curve is about."""
    Image.fromarray(img.astype(np.uint8), "RGBA").save(path, optimize=True)
    return os.path.getsize(path)


PANELS, ROWS, ELEMENTS, EXTRA = {}, [], {}, {}
CODE_STATES, INPUTS = {}, []

for rung in RUNGS:
    print(f"\n=== rung x{rung} ===", flush=True)
    island = mount(rung)
    authored = assert_rung_is_authored(rung)
    recs = C.piece_inputs([(f"pieces-land-{L.tag(rung)}", land_dir(rung)),
                           (f"pieces-species-{L.tag(rung)}", species_dir(rung))])
    CODE_STATES[rung] = D.require_one_state_per_generator(recs)
    INPUTS.extend(recs)
    cells = prepared_cells(island)
    items = respeciate(place(island)[0])

    img, solid, tree_h = compose_colour(island, cells, items, rung)
    ids, rows = compose_ids(island, cells, items, rung)
    cls_map = classify_delivered(img, solid, ids, rows, rung)
    cls = cls_map["class"]
    print(f"  delivered {img.shape[1]}x{img.shape[0]} px, {cls_map['stats']['deliveredOpaquePx']} "
          f"opaque, {len(rows)} drawables, colour/id agreement "
          f"{cls_map['stats']['colourIdAgreementShare']:.4f}", flush=True)

    # ---- which ids are which element ------------------------------------------------------------
    # The two wall tiers are told apart by their PROJECTED POSITION, computed from the same two
    # sources `compose_land` draws them from — the island's own rim placements (tier 0) and
    # `C.boundary_walls` (tier 1) — rather than by a guess about draw order. The partition is
    # asserted rather than assumed: every wall id must land in exactly one of the two sets, so a
    # rim/terrace table can never be measuring an overlapping set.
    rim_xy, terr_xy = set(), set()
    for pl in island["wall"]["placements"]:
        if C.faces_viewer(pl["heading"]):
            rim_xy.add(tuple(round(v, 6) for v in C.project(pl["c"][0], pl["c"][1], 0.0)))
    for pos, _h, height, _side in C.boundary_walls(cells, D.ELEVATION_MODE):
        terr_xy.add(tuple(round(v, 6) for v in C.project(pos[0], pos[1], height)))
    rim_ids, terr_ids, wall_orphans = [], [], 0
    for i, row in enumerate(rows, start=1):
        if row["kind"] != "piece":
            continue
        xy = (round(row["cx"], 6), round(row["cy"], 6))
        if xy in rim_xy and xy not in terr_xy:
            rim_ids.append(i)
        elif xy in terr_xy and xy not in rim_xy:
            terr_ids.append(i)
        else:
            wall_orphans += 1
    if wall_orphans:
        raise SystemExit(f"REFUSED: {wall_orphans} wall placements could not be assigned to exactly "
                         "one of rim / terrace, so those two rows of the per-element table would be "
                         "measuring an overlapping set.")

    poly_ids = [i for i, r in enumerate(rows, start=1) if r["kind"] == "polygon"]
    coast_ids, cell_ids = poly_ids[:1], poly_ids[1:]          # the coast is drawn first, once
    decor_ids = [i for i, r in enumerate(rows, start=1) if r["kind"] == "decor"]
    if len(decor_ids) != len(items):
        raise SystemExit(f"REFUSED: {len(decor_ids)} decor drawables for {len(items)} placements")
    if len(cell_ids) != len(cells):
        raise SystemExit(f"REFUSED: {len(cell_ids)} cell polygons for {len(cells)} cells")
    kinds = [it["kind"] for it in items]
    veg_ids = [i for i, k in zip(decor_ids, kinds) if k != "flower"]
    flower_ids = [i for i, k in zip(decor_ids, kinds) if k == "flower"]

    element_ids = {"cell-fill": (cell_ids, ("cell-fill", "cell-chamfer")),
                   "rim-wall": (rim_ids, ("wall",)),
                   "terrace": (terr_ids, ("wall",)),
                   "coast": (coast_ids, ("coast",)),
                   "vegetation-mark": (veg_ids, ("decor",)),
                   "flower": (flower_ids, ("decor",))}
    rows_out = [element_row(name, ids, cls_map, img, wanted, names, rung, band=(name == "coast"))
                for name, (wanted, names) in element_ids.items()]

    # ---- the outline probe ------------------------------------------------------------------------
    om = outline_mask(ids, cls, solid)
    for r in rows_out:
        wanted, names = element_ids[r["element"]]
        keep = np.zeros(solid.shape, dtype=bool)
        for cn in names:
            keep |= (cls == CLASS_CODE[cn])
        sel = np.isin(ids, wanted) & keep
        n = int(sel.sum())
        ol = int((sel & om).sum())
        r["outlinePx"] = ol
        r["outlineShareOfElement"] = round(ol / n, 4) if n else 0.0
        # AN ELEMENT CARRIES ITS OUTLINE when the outline does not consume it. Below ~3 delivered px
        # across, every pixel of a mark is on its own boundary, so "outline it" and "recolour it" are
        # the same operation and the probe cannot read as an outline at all.
        r["outlineReadsHere"] = bool(r["readsHere"] and r["outlineShareOfElement"] <= 0.5)

    # ---- the hero tree ----------------------------------------------------------------------------
    full, tree_sprite, tree_reg = plant_tree_at_rung(img.copy(), tree_h, rung)
    tree_mask = ((np.abs(full[:, :, :3] - img[:, :, :3]).sum(axis=2) > 0)
                 | (full[:, :, 3] > img[:, :, 3]))
    tree_alpha = tree_sprite[:, :, 3] > 110
    tys, txs = np.nonzero(tree_alpha)
    tree_colours = distinct_colours(tree_sprite, tree_alpha)
    rows_out.append({
        "element": "hero-tree", "rung": rung, "instances": 1, "instancesDelivering": 1,
        "zeroDeliveryShare": 0.0, "deliveredPx": int(tree_mask.sum()),
        "medianInstancePx": float(int(tree_mask.sum())),
        "medianInstanceMinorAxisPx": float(min(int(txs.max() - txs.min() + 1),
                                               int(tys.max() - tys.min() + 1))),
        "minorAxisInstrument": "sprite alpha bounding box",
        "medianInstanceDistinctColours": float(tree_colours),
        "distinctColoursInClass": tree_colours,
        "readsHere": True, "outlinePx": 0, "outlineShareOfElement": 0.0, "outlineReadsHere": True,
        "note": "the hero tree is a SHIPPED sprite with its own palette and its own SIGNED ceiling "
                "verdict (2026-08-14), already carrying its own selective material-tinted outline. "
                "It is composited after the land's back half and is deliberately not put through "
                "the land's snap, so this row describes its own render rather than this pipeline.",
    })
    full_outlined, _s, _r = plant_tree_at_rung(apply_outline(img, om), tree_h, rung)

    # ---- the delivered raster, and its committed byte price ---------------------------------------
    size = save_rgba(os.path.join(OUT, f"island-{L.tag(rung)}.png"), full)
    PANELS[rung] = {"full": full, "outlined": full_outlined, "plain": img, "outline": om,
                    "solid": solid, "ids": ids, "cls": cls, "tree": tree_mask}
    ROWS.append({
        "rung": rung, "authored": authored,
        "deliveredCanvasPx": [int(img.shape[1]), int(img.shape[0])],
        "islandDeliveredPx": cls_map["stats"]["deliveredOpaquePx"],
        "classification": cls_map["stats"],
        "drawables": len(rows), "placements": len(items),
        "outlinePx": int(om.sum()),
        "outlineShareOfIsland": round(float(om.sum())
                                      / max(1, cls_map["stats"]["deliveredOpaquePx"]), 4),
        "committedPngBytes": size,
        "codeState": CODE_STATES[rung]["sha256"],
    })
    ELEMENTS[rung] = rows_out
    for r in rows_out:
        print(f"    {r['element']:<16} px={r['deliveredPx']:>8}  median={r['medianInstancePx']:>8.1f}"
              f"  minor={r['medianInstanceMinorAxisPx']:>5.1f}  colours="
              f"{r['medianInstanceDistinctColours']:>4.1f}  reads={str(r['readsHere']):<5}"
              f"  +outline={r['outlineReadsHere']}", flush=True)

REPORT["ladder"] = ROWS
REPORT["elements"] = {str(k): v for k, v in ELEMENTS.items()}

# =====================================================================================================
# 10. THE PLANT-LESS CROSS-CHECK, AND THE DETERMINISM CHECK
# =====================================================================================================
# THE TRAP, quoted from the arc rather than re-derived: "Body statistics must be cut from a PLANT-LESS
# canvas, per plant set, using the quantiser's C.W_LUMA (never Rec.709)". A strict fill mask cut from a
# canvas that HAS plants still contains every pixel a plant stands on, which inflates the body.
#
# The attribution pass answers that exactly rather than approximately — a body pixel is one whose OWNER
# is a cell, and a plant's pixels are owned by the plant — so a plant-less canvas is not needed for the
# numbers to be right. One is composed anyway, at the lowest rung, as a CHECK ON THE ATTRIBUTION: the
# plant-less body must come out LARGER by exactly the footprint the plants later cover, and if the two
# instruments disagree in the other direction the attribution is wrong.
_r1 = RUNGS[0]
mount(_r1)
_cells = prepared_cells(D.ISLAND)
_bare, _bare_solid, _th = compose_colour(D.ISLAND, _cells, [], _r1)
_p = PANELS[_r1]
_flat = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT]),
                C.FLAT_LEVEL).astype(np.int32)
_body_bare = (_bare[:, :, :3].astype(np.int32) == _flat).all(axis=2) & _bare_solid
_body_by_id = (_p["cls"] == CLASS_CODE["cell-fill"])
_luma = float((C.W_LUMA * _bare[:, :, :3][_body_bare]).sum() / max(1, int(_body_bare.sum())))
EXTRA["plantLessCrossCheck"] = {
    "rung": _r1,
    "cellFillPxFromAttribution": int(_body_by_id.sum()),
    "cellFillPxFromPlantLessCanvas": int(_body_bare.sum()),
    "plantLessMinusAttributed": int(_body_bare.sum()) - int(_body_by_id.sum()),
    "bodyLumaWLuma": round(_luma, 3),
    "lumaInstrument": "C.W_LUMA (the quantiser's), NOT Rec.709 — a Rec.709 number cannot be compared "
                      "to this arc's 78.9 / 58.2 / 61.6 series while looking exactly as if it can",
    "reading": "the plant-less canvas is the LARGER of the two by the footprint the plants later "
               "stand on, which is the inflation the trap names. The attribution pass is the tighter "
               "instrument and is what every per-element number in this pass uses.",
}
if EXTRA["plantLessCrossCheck"]["plantLessMinusAttributed"] < 0:
    raise SystemExit(
        "REFUSED: the ATTRIBUTED cell body is larger than the body of a canvas with no plants on it "
        "at all. That is impossible if the attribution is right, so no number here can be trusted.")
del _bare, _bare_solid
EXTRA["heroTreeDeterminism"] = assert_tree_matches_the_signed_render()

# =====================================================================================================
# 11. THE BYTE PRICE, against ADR-0380 D4's stated curve
# =====================================================================================================
_base = next((r["committedPngBytes"] for r in ROWS if r["rung"] == 1), ROWS[0]["committedPngBytes"])
BYTES = []
for r in ROWS:
    k = r["rung"]
    BYTES.append({
        "rung": k,
        "islandRasterBytes": r["committedPngBytes"],
        "islandRasterKB": round(r["committedPngBytes"] / 1024, 1),
        "measuredRatioToX1": round(r["committedPngBytes"] / _base, 2),
        "squareLawRatio": k * k,
        "d4StatedWholePayload": L.D4_CURVE_STATED.get(k),
        "wholePayloadProjectedKB": round(L.D4_PAYLOAD_KB_X1 * (r["committedPngBytes"] / _base), 1),
        "wholePayloadIfSquareLawKB": L.D4_PAYLOAD_KB_X1 * k * k,
    })
# D4's ANCHOR, RE-MEASURED RATHER THAN INHERITED. "The engine's whole committed sprite payload is
# 805 KB today" is the number the whole square-law argument is hung on, so it is measured here against
# the tree it names. A disagreement is REPORTED, never absorbed: the figure may have been taken over a
# different set or on a different day, and a reader is owed both numbers rather than the tidier one.
_payload_root = os.path.join(REPO, "packages", "app-surface", "src", "assets")
_payload_bytes, _payload_files = 0, 0
for _dp, _dn, _fn in os.walk(_payload_root):
    for _f in _fn:
        if _f.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
            _payload_bytes += os.path.getsize(os.path.join(_dp, _f))
            _payload_files += 1
_payload_kb = round(_payload_bytes / 1024, 1)

REPORT["bytePrice"] = {
    "measured": BYTES,
    "engineSpritePayloadMeasuredKB": _payload_kb,
    "engineSpritePayloadFiles": _payload_files,
    "engineSpritePayloadRoot": "packages/app-surface/src/assets",
    "d4StatedPayloadKB": L.D4_PAYLOAD_KB_X1,
    "d4PayloadDeltaPct": round((_payload_kb - L.D4_PAYLOAD_KB_X1) / L.D4_PAYLOAD_KB_X1 * 100, 1),
    "d4Rule": L.D4_RULE,
    "d4PayloadKbAtX1": L.D4_PAYLOAD_KB_X1,
    "islandShareOfPayloadAtX1": round(_base / (L.D4_PAYLOAD_KB_X1 * 1024), 4),
    "reading":
        "this measures ONE island's delivered raster, which is a strict SUBSET of the engine's whole "
        "committed sprite payload, so the two are compared on their RATIOS — which is what D4's "
        "square law actually predicts — and never by pretending one island's PNG is the whole "
        "budget. Where the measured ratio falls below the square law the reason is the encoder, not "
        "the geometry: this is a closed-palette image, and PNG's entropy coding gets cheaper per "
        "pixel as the pixels get more locally uniform, which is exactly what raising the rung does "
        "to a flat-tinted land. The square law remains the right planning figure for an UNCOMPRESSED "
        "budget and for art with more local variety than this island has.",
}

# =====================================================================================================
# 12. THE PER-ELEMENT ANSWER — the point of the pass
# =====================================================================================================
#: WHY AN ELEMENT LANDS ON THE LIVE PATH. ADR-0380 D4 says raster costs bytes that scale with the
#: SQUARE, and D6 says geometry and shaders do not scale with resolution at all — but D6 "obliges no
#: one to spend the GPU". So the recommendation is mechanical rather than a preference: an element
#: that already reads on the sprite path at a rung the byte budget can afford is a SPRITE element, and
#: only an element that needs a rung the budget cannot reach is a LIVE candidate. The affordable
#: ceiling is D4's own sentence — "density on the sprite path is affordable for about one more
#: doubling and not much beyond" — i.e. rung 2, with rung 4 named there as the ~13 MB edge.
AFFORDABLE_RUNG = 2
EDGE_RUNG = 4


def first_rung(element, field):
    for r in sorted(ELEMENTS):
        row = next(x for x in ELEMENTS[r] if x["element"] == element)
        if row[field]:
            return r
    return None


VERDICTS = []
for element in L.ELEMENTS:
    reads = first_rung(element, "readsHere")
    with_outline = first_rung(element, "outlineReadsHere")
    need = with_outline if with_outline is not None else 99
    flat = all(next(x for x in ELEMENTS[r] if x["element"] == element).get("flatByConstruction")
               for r in ELEMENTS)
    if flat:
        # THE SHARPEST ROW IN THE TABLE, and it is not a size argument at all. An element whose
        # interior is ONE authored colour at every rung gains nothing from a rung except bytes and a
        # crisper boundary: its interior is resolution-INDEPENDENT. That is precisely what a vector
        # or a live path draws for free — and ADR-0380's own Context records that the shipped map
        # ALREADY draws ground / parcel / territory / tile as SVG, substituting a raster only where a
        # sprite sheet covers a node key. So for this element the sprite path is not merely the more
        # expensive answer, it is the one that buys nothing.
        path = L.PATH_LIVE
        why = (f"FLAT BY CONSTRUCTION — it delivers exactly ONE authored colour at every rung, so no "
               f"rung adds interior detail to it; all a rung buys is its boundary, at the square law. "
               f"Its interior is resolution-independent, which is what a vector or live path draws "
               f"for free. Note the shipped map already renders this element as SVG (ADR-0380 "
               f"Context), so this is less a change of path than a reason not to move it onto raster.")
    elif reads is not None and reads <= AFFORDABLE_RUNG and need <= AFFORDABLE_RUNG:
        path = L.PATH_SPRITE
        why = (f"reads at x{reads} and carries an outline at x{with_outline}, both inside the "
               f"~one-more-doubling the sprite path affords (D4). D6 obliges no one to spend the GPU, "
               f"so bytes are the cheaper answer here.")
    elif reads is not None and need <= EDGE_RUNG:
        path = L.PATH_SPRITE
        why = (f"reads at x{reads} and carries an outline at x{with_outline} — inside the sprite path "
               f"but at its ~13 MB edge, so it is affordable only if it is among the few elements "
               f"paying for x{with_outline}.")
    else:
        path = L.PATH_LIVE
        why = (f"reads at {('x%d' % reads) if reads else 'no measured rung'} and carries an outline "
               f"at {('x%d' % with_outline) if with_outline else 'no measured rung'} — past what "
               f"raster bytes buy under the square law, which is exactly the case D6 reopened the "
               f"live path for.")
    VERDICTS.append({
        "element": element,
        "firstRungItReads": reads,
        "firstRungItCarriesAnOutline": with_outline,
        "recommendedPath": path,
        "why": why,
        "byRung": {f"x{r}": {k: next(x for x in ELEMENTS[r] if x["element"] == element)[k]
                             for k in ("deliveredPx", "medianInstancePx",
                                       "medianInstanceMinorAxisPx",
                                       "medianInstanceDistinctColours", "zeroDeliveryShare",
                                       "outlineShareOfElement", "readsHere", "outlineReadsHere")}
                   for r in sorted(ELEMENTS)},
    })
REPORT["perElement"] = {
    "rule": L.READING_RULE,
    "outlineRule": "an element CARRIES an outline when the outline does not consume it — at most "
                   "half its delivered pixels lie on its own boundary. Below ~3 px across, every "
                   "pixel of a mark is on its boundary and outlining it is recolouring it.",
    "affordableRung": AFFORDABLE_RUNG, "edgeRung": EDGE_RUNG,
    "thisIsNonBinding": "a RECOMMENDATION. The appearance call is the owner's (ADR-0070 stage 2) and "
                        "nothing in this directory has standing to sign one.",
    "verdicts": VERDICTS,
}

# =====================================================================================================
# 13. THE PICTURES
# =====================================================================================================
INK, DIM, HI, GOOD = CH.INK, CH.DIM, CH.HI, CH.GOOD
PAD = CH.PAD


def board(img):
    return Image.fromarray(C.on_board(img.astype(np.uint8)), "RGB")


def pick_detail_window(rung, w1=64, h1=48):
    """The ground window every rung's detail crop is taken from — chosen ONCE, at the lowest rung.

    THE CROP'S PLACEMENT IS PART OF THE DELIVERABLE, and the high-frequency pass paid for that lesson
    in three attempts: a centroid crop landed on the hero tree's TRUNK (an appearance call made on
    bark), and a most-vegetation crop landed UNDER THE CANOPY (plants are densest at the island
    centre). The window taken here is the one with NO TREE PIXEL AT ALL that holds the most
    vegetation, with the tree mask taken from a with-tree / tree-less DIFFERENCE rather than guessed.
    It is chosen once and scaled by the rung, so every panel shows the SAME square metres of island.
    """
    p = PANELS[rung]
    veg = (p["cls"] == CLASS_CODE["decor"])
    H, W = veg.shape
    w1, h1 = min(w1, W // 2), min(h1, H // 2)
    ii = np.cumsum(np.cumsum(veg.astype(np.int32), axis=0), axis=1)
    tt = np.cumsum(np.cumsum(p["tree"].astype(np.int32), axis=0), axis=1)

    def box(s, y, x, h, w):
        a = s[y + h - 1, x + w - 1]
        b = s[y - 1, x + w - 1] if y else 0
        c = s[y + h - 1, x - 1] if x else 0
        d = s[y - 1, x - 1] if (y and x) else 0
        return int(a - b - c + d)

    best, bxy = -1, (0, 0)
    for y in range(0, H - h1, 2):
        for x in range(0, W - w1, 2):
            if box(tt, y, x, h1, w1):
                continue
            n = box(ii, y, x, h1, w1)
            if n > best:
                best, bxy = n, (x, y)
    if best < 0:
        raise SystemExit("REFUSED: no tree-free window exists, so a detail crop would be an "
                         "appearance call made on bark.")
    return {"x": int(bxy[0]), "y": int(bxy[1]), "w": int(w1), "h": int(h1),
            "vegetationPxAtLowestRung": int(best), "treePxInWindow": 0,
            "rule": "the window with NO hero-tree pixel that holds the most vegetation; the tree "
                    "mask is a with-tree / tree-less DIFFERENCE, not a guess"}


def crop_at(rung, win, source="full"):
    p = PANELS[rung][source]
    lo = min(PANELS)
    f = rung // lo
    x, y, w, h = win["x"] * f, win["y"] * f, win["w"] * f, win["h"] * f
    return board(p[y:y + h, x:x + w])


def nearest(im, factor):
    return im.resize((im.width * factor, im.height * factor), Image.NEAREST) if factor > 1 else im


LADDER_RUNGS = sorted(PANELS)
TOP = max(LADDER_RUNGS)
LOW = min(LADDER_RUNGS)
WIN = pick_detail_window(LOW)
REPORT["detailWindow"] = WIN
CAM = (f"camera {C.ELEV:g} deg (the research track's signed angle, a NAMED PARAMETER) - "
       f"LAND_CAMERA_ELEVATION_DEG is still {P.APP_LAND_CAMERA_ELEVATION_DEG:g} and is NOT touched")
gap = 14


def _byte_lines(k):
    """Two SHORT caption lines rather than one long one. The columns here are as narrow as the
    panel above them (282 px at x1), so a single sentence wraps to four lines and runs off the
    bottom of the sheet — which is exactly what the first render of this picture did."""
    row = next(b for b in BYTES if b["rung"] == k)
    return [f"raster {row['islandRasterKB']:g} KB  =  {row['measuredRatioToX1']:g}x of x1",
            f"square law predicts {row['squareLawRatio']}x"]


# ---- 1. THE LADDER, at native size --------------------------------------------------------------
tiles = [board(PANELS[k]["full"]) for k in LADDER_RUNGS]
w = PAD * 2 + sum(t.width for t in tiles) + gap * (len(tiles) - 1)
h = max(t.height for t in tiles)
im, dr, top = CH.sheet(w, h + 116,
                       "THE SCALE LADDER - one island, one code state, AUTHORED at x1 / x2 / x4 / x8",
                       f"the real-corpus healthy island (`{P.STORY_ID}`) at 1, 2, 4 and 8 delivered "
                       f"pixels per ground unit. Every panel is a fresh Blender render at that "
                       f"density - nothing here is upscaled, and `assert_rung_is_authored` refuses a "
                       f"composite whose piece sets disagree with the rung it is captioned as. {CAM}",
                       "NO APPEARANCE VERDICT IS TAKEN HERE. The look call is the owner's "
                       "(ADR-0070 stage 2); this pass delivers the ladder, the numbers and a "
                       "non-binding per-element recommendation.")
x = PAD
for k, t in zip(LADDER_RUNGS, tiles):
    # BOTTOM-ALIGNED, so every panel sits directly above its own caption. Top-aligning them puts the
    # x1 island two thousand pixels from the numbers that describe it.
    im.paste(t, (x, top + h - t.height))
    row = next(r for r in ROWS if r["rung"] == k)
    CH.caption(dr, x, top + h + 8,
               [(f"x{k}  -  {t.width}x{t.height} px", HI),
                (f"{row['islandDeliveredPx']} delivered island px", INK)]
               + [(ln, DIM) for ln in _byte_lines(k)], max(200, t.width + gap - 4))
    x += t.width + gap
im.save(os.path.join(OUT, "scale-ladder.png"))

# ---- 2. THE DETAIL LADDER, every rung shown at ONE display size ----------------------------------
crops = [nearest(crop_at(k, WIN), TOP // k) for k in LADDER_RUNGS]
w = PAD * 2 + sum(c.width for c in crops) + gap * (len(crops) - 1)
im, dr, top = CH.sheet(w, max(c.height for c in crops) + 112,
                       "WHAT EACH RUNG BUYS - the same square metres of island, at one display size",
                       f"the SAME ground window at every rung ({WIN['w']}x{WIN['h']} delivered px at "
                       f"x{LOW}), each nearest-upscaled to a common size so the panels differ only in "
                       f"what was AUTHORED. The window is the one with no hero-tree pixel that holds "
                       f"the most vegetation - the tree mask is a with-tree / tree-less difference, "
                       f"not a guess.",
                       "A blockier panel is not a worse render: it is fewer authored pixels, "
                       "magnified by the same integer factor as its neighbours.")
x = PAD
for k, c in zip(LADDER_RUNGS, crops):
    im.paste(c, (x, top))
    veg = next(e for e in ELEMENTS[k] if e["element"] == "vegetation-mark")
    cell = next(e for e in ELEMENTS[k] if e["element"] == "cell-fill")
    bevel = ("bevel delivered" if cell["medianInstanceDistinctColours"] >= 2
             else "flat - the bevel is still sub-pixel")
    CH.caption(dr, x, top + c.height + 6,
               [(f"x{k}  (shown at {TOP // k}x)", HI),
                (f"vegetation mark: {veg['medianInstancePx']:g} px, "
                 f"{veg['medianInstanceMinorAxisPx']:g} px across, "
                 f"{veg['medianInstanceDistinctColours']:g} colours", INK),
                (f"cell: {cell['medianInstancePx']:g} px, "
                 f"{cell['medianInstanceDistinctColours']:g} colours ({bevel})", DIM)],
               max(230, c.width + gap - 4))
    x += c.width + gap
im.save(os.path.join(OUT, "scale-ladder-detail.png"))

# ---- 3. THE OUTLINE PROBE, on and off, at every rung ---------------------------------------------
off = [nearest(crop_at(k, WIN, "full"), TOP // k) for k in LADDER_RUNGS]
on = [nearest(crop_at(k, WIN, "outlined"), TOP // k) for k in LADDER_RUNGS]
w = PAD * 2 + sum(c.width for c in off) + gap * (len(off) - 1)
ch = off[0].height
_carries = [v["firstRungItCarriesAnOutline"] for v in VERDICTS
            if v["element"] in ("cell-fill", "rim-wall", "terrace", "vegetation-mark", "flower")
            and v["firstRungItCarriesAnOutline"]]
first_ol = min(_carries) if _carries else None
im, dr, top = CH.sheet(w, ch * 2 + 150,
                       "THE OUTLINE PROBE - the land has never had one, and this is what it costs",
                       f"TOP ROW as composed today; BOTTOM ROW with a selective interior outline - "
                       f"{L.OUTLINE_RULE}. It is drawn only where one drawable stands in FRONT of "
                       f"another (a plant over its ground, a wall against a cell top face, the land "
                       f"against the coast) and NEVER on a cell-top-against-cell-top join: that "
                       f"boundary IS the interior mesh seam the owner removed on 2026-08-16, and an "
                       f"outline there would be that seam wearing a shading model.",
                       f"The earliest rung at which a land element still has an interior left after "
                       f"being outlined is x{first_ol if first_ol else '-'}. Below it the probe does "
                       f"not read as an outline - it recolours the whole mark.")
x = PAD
for k, a, b in zip(LADDER_RUNGS, off, on):
    im.paste(a, (x, top))
    im.paste(b, (x, top + ch + 22))
    row = next(r for r in ROWS if r["rung"] == k)
    veg = next(e for e in ELEMENTS[k] if e["element"] == "vegetation-mark")
    cell = next(e for e in ELEMENTS[k] if e["element"] == "cell-fill")
    dr.text((x, top + ch + 6), f"x{k}   outline OFF above / ON below", fill=HI)
    CH.caption(dr, x, top + ch * 2 + 28,
               [(f"outline = {row['outlinePx']} px, "
                 f"{row['outlineShareOfIsland'] * 100:.1f}% of the island", INK),
                (f"of a vegetation mark: {veg['outlineShareOfElement'] * 100:.0f}% "
                 f"({'carries it' if veg['outlineReadsHere'] else 'consumes the mark'})",
                 GOOD if veg["outlineReadsHere"] else DIM),
                (f"of a cell: {cell['outlineShareOfElement'] * 100:.0f}% "
                 f"({'carries it' if cell['outlineReadsHere'] else 'consumes the cell'})",
                 GOOD if cell["outlineReadsHere"] else DIM)],
               max(250, a.width + gap - 4))
    x += a.width + gap
im.save(os.path.join(OUT, "outline-probe.png"))

# =====================================================================================================
# 14. THE REPORT AND THE SIDECARS
# =====================================================================================================
REPORT["pass"] = {
    "question": "which land elements actually need a live renderer (ADR-0380 D6) and which read well "
                "enough on the sprite path (D4)",
    "storyId": P.STORY_ID,
    "cameraElevationDeg": C.ELEV,
    "appLandCameraElevationDeg": P.APP_LAND_CAMERA_ELEVATION_DEG,
    "rungs": list(LADDER_RUNGS),
    "supersample": L.SUPERSAMPLE,
    "landSamples": L.LAND_SAMPLES,
    "speciesSamples": L.SPECIES_SAMPLES,
    "sampleCountRule": "PINNED and stated. The arc measured that the sample count alone moves the "
                       "delivered land pixel count by ~2 px and that nothing in a committed artifact "
                       "records it (PR #1379). Never compare a land pixel count here against one "
                       "from a lane at another value.",
    "oneSurfaceVariant": ONE_SURFACE_VARIANT,
    "seamsDrawn": sorted(P.SEAMS_DRAWN),
    "ground": P.GROUND,
    "vegetation": "the four-species silhouette set of the high-frequency pass, RE-RENDERED at every "
                  "rung. The withdrawn long-grass blade is not measured: the owner rejected it twice "
                  "and it is the one piece on this arc that loses to the majority downsample.",
    "takesNoAppearanceVerdict": True,
    "fence": "docs/research/** only. No packages/forest-world/src, no apps/**, no app-surface, no "
             "web gitlink bump.",
}
REPORT["checks"] = EXTRA
with open(os.path.join(OUT, "ladder-report.json"), "w", encoding="utf-8") as f:
    json.dump(REPORT, f, indent=2)

COMBINED = hashlib.sha256(
    "".join(f"x{k}:{CODE_STATES[k]['sha256']}" for k in sorted(CODE_STATES)).encode()).hexdigest()
for pic in (["scale-ladder.png", "scale-ladder-detail.png", "outline-probe.png"]
            + [f"island-{L.tag(k)}.png" for k in LADDER_RUNGS]):
    provenance.write_sidecar(
        os.path.join(OUT, pic), __file__, sys.argv[1:], INPUTS,
        {"generator": "compose_ladder.py (one code state per generator, per rung)",
         "sha256": COMBINED},
        extra={"cameraElevationDeg": C.ELEV, "storyId": P.STORY_ID,
               "rungs": list(LADDER_RUNGS), "supersample": L.SUPERSAMPLE,
               "landSamples": L.LAND_SAMPLES,
               "authoredNotUpscaled": {f"x{r['rung']}": r["authored"] for r in ROWS},
               "bytePrice": BYTES,
               "perElement": [{k: v[k] for k in ("element", "firstRungItReads",
                                                 "firstRungItCarriesAnOutline", "recommendedPath")}
                              for v in VERDICTS],
               "takesNoAppearanceVerdict": True})

print("\n--- BYTE PRICE -------------------------------------------------------------")
for b in BYTES:
    print(f"  x{b['rung']}: {b['islandRasterKB']:>9} KB   measured {b['measuredRatioToX1']:>6}x   "
          f"square law {b['squareLawRatio']:>2}x   D4 whole payload {b['d4StatedWholePayload']}")
print("\n--- PER-ELEMENT ANSWER -----------------------------------------------------")
for v in VERDICTS:
    print(f"  {v['element']:<16} reads x{v['firstRungItReads']}   outline "
          f"x{v['firstRungItCarriesAnOutline']}   -> {v['recommendedPath'].upper()}")
print(f"\nwrote scale-ladder.png, scale-ladder-detail.png, outline-probe.png, "
      f"{len(LADDER_RUNGS)} island rasters, ladder-report.json and "
      f"{3 + len(LADDER_RUNGS)} sidecars to {OUT}")
