#!/usr/bin/env python3
"""THE ONE PLACE THIS PASS DECLARES ITS RUNGS, ITS CAMERA AND ITS THRESHOLDS.

Imported by `render_all.py`, `compose_ladder.py` and `verify.py`, so nothing downstream carries a
second copy of a rung, a sample count or a reading rule — the discipline `island_pass.py` and
`grass.py` established, inherited rather than restated.

WHAT THIS PASS IS FOR. ADR-0380 (accepted 2026-08-18, owner-directed) retires ADR-0069's no-GPU
constraint, names the reference machine as the acceptance FLOOR (D2), records wire delivery as a
standing constraint that binds RASTER specifically (D4), and reopens runtime 3D for the land and its
vegetation (D6). It closes by naming this instrument and CHANGING ITS QUESTION:

    "The scale ladder already recommended on this arc keeps its value and CHANGES ITS QUESTION: it
     no longer asks whether live rendering is permitted, but WHICH ELEMENTS ACTUALLY NEED IT — if 2x
     sprites read well enough for an element, D4 says that is the cheaper answer and D6 obliges no
     one to spend the GPU."

So the deliverable is a ladder plus a PER-ELEMENT recommendation. It takes NO appearance verdict:
that is the owner's (ADR-0070 stage 2), and nothing in this directory has standing to sign one.
"""

# --------------------------------------------------------------------------- the rungs
#: The four rungs, as linear multipliers of the shipped sprite convention. Rung 1 IS the shipped
#: convention: ADR-0380 states it as "a 1-ground-unit-to-1-delivered-pixel sprite convention that
#: puts the sprite exactly on the vector plate at default zoom". Rung k therefore means k delivered
#: pixels per ground unit, everywhere, for every element at once.
RUNGS = (1, 2, 4, 8)

#: The supersample the majority downsample votes over, per delivered pixel, at EVERY rung. It is the
#: shipped value and it does NOT scale with the rung: the vote is per delivered pixel, so holding it
#: fixed is what makes the four rungs one pipeline rather than four. A rung is authored by rendering
#: the Blender pieces at `SUPERSAMPLE * rung` and downsampling by `SUPERSAMPLE`.
SUPERSAMPLE = 3

#: Pinned and stated, because the arc measured that the sample count alone moves the delivered land
#: pixel count by ~2 px and NOTHING in a committed artifact records it (PR #1379). Never compare a
#: land pixel count in this pass against one from a lane at a different value. 48 is the value the
#: research surface's own `pieces-land` was rendered at.
LAND_SAMPLES = 48
SPECIES_SAMPLES = 48
TREE_SAMPLES = 72
TREE_SHADOW_SAMPLES = 32

#: The hero tree's own render, at rung 1. `blender_tree.py --res 384` then `pixelise.py ... 128`, so
#: the delivered sprite is 128 px and the supersample is exactly 3 — the same 3 the land uses.
TREE_RES_X1 = 384
TREE_DELIVERED_X1 = 128
#: NFRAMES - 1: u = 1.0, pinned unconditionally by `retime()`, so the mature frame is the one frame
#: a camera or a resolution change cannot re-time out from under a comparison.
MATURE_FRAME = 18

# --------------------------------------------------------------------------- the camera
#: Owner look verdict, 2026-08-16 ("50 degrees looks good, i think we go with this"), for the
#: RESEARCH TRACK's authoring angle and nothing more. Inherited from `island_pass.PASS_ELEVATION_DEG`
#: at run time — this line is the reader's copy and `verify.py` asserts the two agree.
PASS_ELEVATION_DEG = 50.0
#: The shipped constant. NOT read, NOT written, and NOT moved by this pass.
APP_LAND_CAMERA_ELEVATION_DEG = 20.0

# --------------------------------------------------------------------------- ADR-0380 D4's curve
#: The committed sprite payload today, and the curve D4 states for it. Quoted here so the byte price
#: this pass measures is compared against a number the decision log actually carries rather than
#: against one this pass invented. D4, verbatim: "The engine's whole committed sprite payload is
#: 805 KB today; roughly 3 MB at 2x, 13 MB at 4x, 50 MB at 8x."
D4_PAYLOAD_KB_X1 = 805
D4_CURVE_STATED = {1: "805 KB", 2: "~3 MB", 4: "~13 MB", 8: "~50 MB"}
#: D4's curve is the SQUARE law applied to the whole payload. This pass measures ONE island's raster,
#: which is a strict subset of that payload, so the two are compared on their RATIOS (which the
#: square law predicts exactly) and on the island's share of the payload — never by pretending one
#: island's PNG is the whole engine's sprite budget.
D4_RULE = "raster bytes scale with the SQUARE of linear resolution"

# --------------------------------------------------------------------------- the outline probe
#: The hero tree's outline rule, quoted from its own registration and README, and the rule this
#: pass's LAND outline is built to satisfy: "selective, material-tinted outline: silhouette rim
#: only, never black".
OUTLINE_RULE = ("selective, material-tinted, silhouette rim only, never black — the local colour "
                "darkened and re-snapped into the closed palette, never a uniform key-line")
#: The multiplier the outline darkens the LOCAL colour by before re-snapping. It is the same shape as
#: `C.back_half`'s existing island-silhouette rim (0.60 below a filled neighbour, 0.76 otherwise);
#: this pass uses one value for the interior outline because an interior boundary has a filled
#: neighbour on BOTH sides by construction, so the two-case split has nothing to distinguish.
OUTLINE_DEPTH = 0.72
#: WHICH BOUNDARIES THE OUTLINE IS DRAWN ON, and the one it is deliberately NOT drawn on.
#:
#: The owner REMOVED the interior mesh seams on 2026-08-16 ("the mess lines as well add to the
#: noise"), and the high-frequency pass established that a lip at every cell join IS that seam
#: wearing a shading model. So a cell-top against a cell-top at the SAME height is never outlined:
#: those two faces are one continuous surface and a line between them is the removed seam.
#: What IS outlined is a genuine occlusion boundary — a place where one drawable stands in front of
#: another rather than continuing it.
OUTLINE_CLASSES = ("plant-against-ground", "wall-against-cell-top", "land-against-coast",
                   "coast-against-transparency")
OUTLINE_NOT_DRAWN_ON = "cell-top against cell-top (that boundary IS the seam the owner removed)"

# --------------------------------------------------------------------------- the reading rule
#: THE RULE THAT ANSWERS "AT WHICH RUNG DOES THIS ELEMENT START READING", stated ONCE, applied
#: mechanically to all seven elements, and deliberately NOT an appearance judgment.
#:
#: An element READS at the smallest rung where all three hold of its MEDIAN instance:
#:
#:   1. its minor axis is at least MIN_MINOR_AXIS_PX delivered pixels. Justified by the pipeline, not
#:      by taste: the delivered raster is a 3x3 MAJORITY vote, which needs 5 of 9 to carry a value,
#:      so a feature thinner than 3 delivered px is not guaranteed to survive its own downsample.
#:      The arc measured exactly this as `survival%` in the greenery survey — everything that is a
#:      MASS sits at 94-116%, and only structure finer than the vote falls below.
#:   2. it delivers at least MIN_DISTINCT_COLOURS distinct colours. One colour is a silhouette with
#:      no interior: the arc's normals sweep found a tuft's lit band was already ONE cap at every
#:      setting, which is why no shading lever could act on it.
#:   3. it can carry an outline: minor axis >= 3, i.e. one outline pixel, at least one interior
#:      pixel, and one outline pixel. This is the same number as (1) and is stated separately because
#:      it is a different claim — (1) is about surviving the vote, (3) is about having room for the
#:      probe in OUTLINE_CLASSES.
#:
#: A rule stated in advance and applied to every element is what makes the per-element answer a
#: measurement. The numbers are reported alongside so a reader who disagrees with the rule can apply
#: their own without re-rendering anything.
MIN_MINOR_AXIS_PX = 3
MIN_DISTINCT_COLOURS = 2
READING_RULE = (
    "an element READS at the smallest rung where its MEDIAN instance has minor axis >= "
    f"{MIN_MINOR_AXIS_PX} delivered px (the 3x3 majority vote needs 5 of 9, so finer structure is "
    f"not guaranteed to survive it) AND delivers >= {MIN_DISTINCT_COLOURS} distinct colours (one "
    "colour is a silhouette with no interior) AND therefore has room for the outline probe")

# --------------------------------------------------------------------------- the elements
#: The seven land elements the per-element answer is owed for, named by ADR-0380's own framing of the
#: question. A single verdict for "the land" would answer the wrong question.
ELEMENTS = ("cell-fill", "rim-wall", "terrace", "coast", "vegetation-mark", "flower", "hero-tree")

#: The two paths a per-element recommendation can land on, and what each costs.
PATH_SPRITE = "sprite"   # ADR-0380 D4 says spend BYTES: raster, square-law, ~13 MB at 4x
PATH_LIVE = "live"       # ADR-0380 D6 says spend GPU: geometry+shaders, flat in resolution


def piece_supersample(rung):
    """The `--ss` a Blender piece renderer is driven at for `rung`.

    ONE ground unit must land on `rung` delivered pixels, and the delivered raster is the
    supersampled canvas mode-downsampled by SUPERSAMPLE. So the pieces are rendered at
    `SUPERSAMPLE * rung` pixels per ground unit and nothing else in the pipeline changes — which is
    what makes "authored at each rung" true rather than "upscaled from rung 1".
    """
    return SUPERSAMPLE * rung


def tree_res(rung):
    """The hero tree's supersampled render resolution at `rung`."""
    return TREE_RES_X1 * rung


def tree_delivered(rung):
    """The hero tree's delivered sprite size at `rung`."""
    return TREE_DELIVERED_X1 * rung


def tag(rung):
    return "x%d" % rung
