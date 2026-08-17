#!/usr/bin/env python3
"""HIGH FREQUENCY WITHOUT LOOKING OFF — the two options the owner asked to see, rendered.

    python compose_options.py            # -> 4 pictures + options-report.json + sidecars  (~6 min)

THE OWNER, 2026-08-17, verbatim:

    "This many shubs looks rather ugly, feels like there must be a way to do something nicer in
     blender that has high frequency without looking off. can you recommend some options"

and, on the shortlist: *"sure, show me what this looks like"*.

THIS IS A LOOK, NOT A DECISION. Nothing here is owner-attested and this file has no standing to sign
an appearance verdict (ADR-0070 stage 2). ADR-0280 D4 makes an honest "this did not help" an accepted
outcome, so where an option does not pay its way that is stated with the number rather than dressed.

THE TWO OPTIONS, AND WHY THEY ARE THE TWO:

  1. GROUND MICRO-RELIEF (`relief.py`) — frequency carried by the LIGHT. Costs zero plant count, so
     it asserts nothing about test counts. Geometry, never pigment: the owner rejected three
     hash-picked greens plus a tan wheat subset as noise nine hours before asking this question.
  2. SILHOUETTE VARIETY (`pieces-species/`, `blender_species.py`) — four species with genuinely
     different outlines instead of many identical marks. Frequency from variety, not from count.

Everything in the whole normal-mapping / shader-detail class is already measured OUT on this arc: it
acts above the quantisation threshold and is discarded before delivery. It is not re-triaged here.

THE DIAGONAL COLLAPSE, AND WHY THIS PASS WOULD BE WORTHLESS WITHOUT THE FIX. Every composite this arc
has delivered placed its plants with `scatter._sample_in_cell`, which drew x and y from two CRC32s
over messages differing in one character. CRC32 is affine over GF(2), so the two draws agreed to
within 1% and EVERY plant stood on its cell's bounding-box diagonal — corr(u, v) = +0.9997 against a
null of exactly 0. A silhouette-variety sheet composed through that would show four species standing
in diagonal rows and would answer a question nobody asked.

    THIS PASS IMPORTS THE FIXED POSITIONER (`chapter2-plant-dispersion-2026-08-17/disperse.py`)
    RATHER THAN VENDORING IT, and asserts corr(u, v) on its OWN delivered placements before any
    picture is written. `scatter.py` itself is NOT edited — propagating the fix to it and re-rendering
    the affected evidence is the parked `crc32-dispersion-fix-propagated-and-evidence-rerendered`.

NO FOURTH COMPOSITOR. The track has three copies of a ~700-line compositor and nothing detects the
fork. This file adds none: it IMPORTS `compose_healthy.py` whole with its writes sent to scratch (so
its refusals are this pass's refusals), gets the land from `compose_core.compose_land`, the palette
snap from `compose.back_half`, the shadow field from `chapter2-one-surface-and-shadow-2026-08-17`,
and the placements from `disperse`. What is new is `relief.py`, `blender_species.py`, and the
`panel()` below — which exists for the one seam nothing else offers: a light field has to multiply
the canvas BETWEEN `compose_land` and `back_half`, because a field applied after the snap is a raw
gradient shipped as land (the ADR-0145 failure at island scale).

THE FENCE. The whole diff is `docs/research/**`. `LAND_CAMERA_ELEVATION_DEG` is 20 and is neither
read nor written; this pass renders at 50 degrees as a NAMED PARAMETER inherited from the island
(owner look verdict, 2026-08-16). App-side findings are written down with a file and a line.
"""
import importlib.util
import json
import math
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(RESEARCH, "chapter2-hex-lines-and-flat-green-2026-08-16")
SWEEP = os.path.join(RESEARCH, "chapter2-camera-elevation-sweep-2026-08-15")
SHADOWPASS = os.path.join(RESEARCH, "chapter2-one-surface-and-shadow-2026-08-17")
DISPERSION = os.path.join(RESEARCH, "chapter2-plant-dispersion-2026-08-17")

sys.path.insert(0, HERE)
sys.path.insert(0, HEALTHY)
sys.path.insert(0, GRASS)
sys.path.insert(0, LINES)
sys.path.insert(0, SHADOWPASS)
sys.path.insert(0, DISPERSION)
sys.path.insert(0, os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1"))

import island_pass as P                                    # noqa: E402
import provenance                                          # noqa: E402
import seams as S                                          # noqa: E402
import shadow as SH                                        # noqa: E402
import dispersion as DX                                    # noqa: E402
import disperse as X                                       # noqa: E402  THE FIXED POSITIONER
import relief as RL                                        # noqa: E402

OUT = os.environ.get("STORYTREE_OPTIONS_OUT") or HERE

#: The sample count is NOT in the piece sets' provenance chain in a way a reader can compare across
#: lanes, so it is stated here and every pixel count in this pass is at THIS value. Never compare a
#: land pixel count across sample counts: the arc measured that alone moving land px by ~2.
SAMPLES_DECLARED = 48

#: The one-surface collapse, inherited from the shadow pass rather than re-decided: every cell drawn
#: at variant 0 with wheat off. Flat green is the surface the owner cleared and every panel here
#: stands on it.
ONE_SURFACE_VARIANT = 0

#: The relief band shown as the DELIVERED option. `coarse` is rendered beside it as a fork.
RELIEF_BAND = "fine"

# -----------------------------------------------------------------------------------------------------
# REFUSAL-HARNESS HATCHES — the pattern `compose_core.DECOR_SORTS_AFTER_ITS_CELL` established.
#
# They exist so `verify_refusal.py` can drive THIS composer, in this directory, rather than a copy of
# it — the only way a guard can be shown to fire on the thing that actually ships. The shadow pass's
# own harness failed here first and it is worth restating: it `exec`'d the composer's source, which
# left `__file__` undefined, so the composer died on its own second line and every guard reported
# "did not fire" having never reached the thing under test.
#
# ALL THREE MUST BE OFF AT REST and `verify.py` asserts it. A hatch left set is a picture composed
# from something other than what its caption claims.
# -----------------------------------------------------------------------------------------------------
PERTURB_POSITIONER = os.environ.get("STORYTREE_OPTIONS_PERTURB") == "unfixed-positioner"
PERTURB_UNCLAMPED = os.environ.get("STORYTREE_OPTIONS_PERTURB") == "unclamped-product"
#: Drives the combined field PAST the re-measured confusability ceiling, so the ADR-0367 D5 guard can
#: be shown to fire on a real composite. The shadow pass's own harness does the same thing by pushing
#: its floor past the ceiling; this is that move, expressed as a multiplier so it reaches every rung.
PERTURB_OVERDEEP = os.environ.get("STORYTREE_OPTIONS_PERTURB") == "overdeep-light"
#: Skips the forks that no guard depends on, so a refusal harness pays for four composites and not
#: eleven. Never set for a delivered run — the pictures it skips are three of the five.
PERTURB_FAST = os.environ.get("STORYTREE_OPTIONS_PERTURB_FAST") == "1"


# =====================================================================================================
# mount the healthy-island pass WHOLE, with its writes sent to scratch
# =====================================================================================================
def _load_healthy():
    """Its module-level refusals are this pass's refusals: the piece set is valid for this island's
    geometry, one code state per generator, the camera is the signed one, island/proof/STORY_ID name
    ONE story, no status outside the RENDERED vocabulary, and every `healthy` is backed by a signed
    pass (ADR-0040). Importing rather than restating means these options can never be composed over
    an island those refusals would have declined to draw."""
    tmp = tempfile.mkdtemp(prefix="high-frequency-options-")
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

BLADE_PIECES = os.path.join(GRASS, "pieces-m00-blade")
SPECIES_PIECES = os.path.join(HERE, "pieces-species")

_TREE_DIR = os.path.join(SWEEP, "tree-%s" % ("%g" % C.ELEV).replace(".", "p"), "frames")
_TREE_REG = json.load(open(os.path.join(_TREE_DIR, "registration.json")))
_TREE_SPRITE = np.array(Image.open(os.path.join(_TREE_DIR, _TREE_REG["frameOrder"][-1]))
                        .convert("RGBA"), dtype=np.float32)


# =====================================================================================================
# 1. THE PLACEMENTS — through the FIXED positioner, at the story's REAL test counts
# =====================================================================================================
#: The four species, in the four `tuft-*` slots the scatterer already chooses among.
SPECIES_SLOTS = ["tuft-3a", "tuft-2", "tuft-3b", "tuft-4"]
SPECIES_NAMES = {"tuft-3a": "dome", "tuft-2": "spire", "tuft-3b": "spreader", "tuft-4": "pair"}


def _poly_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return abs(a) * 0.5


def owned_areas(island):
    """Each capability's owned ground area, summed from the cells' OWN emitted polygons."""
    areas = {}
    for c in island["variantB"]["cells"]:
        areas[c["cap"]] = areas.get(c["cap"], 0.0) + _poly_area(c["poly"])
    return areas


def place(island, area_aware=False):
    """The placements, from the FIXED positioner, at the story's own contract counts.

    Two monkeypatches, both of them the pattern `compose_healthy.scatter_real` already established
    (`compose_healthy.py:266-267`), and both restored in a `finally`:

      * `scatter.capability_tests` INVENTS a test count from a hash — its own docstring says so. It
        is replaced by the story's real `spec.contracts.length`, exactly as the healthy-island pass
        does, so the counts on these pictures are the story's and not a spike's.
      * `disperse._counts` is wrapped ONLY for the area-aware fork panel. The count RULE is not
        rewritten and not copied: the wrapper calls the real one and then scales its result. There is
        still exactly one implementation of `2 + tests*1.9` on this track.
    """
    real_tests = [c["tests"] for c in island["capabilities"]]
    original_tests = X.S.capability_tests
    original_counts = X._counts
    areas = owned_areas(island)

    def area_aware_counts(ci, status, seed, density):
        tests, grass, shrubs, wilts, lush = original_counts(ci, status, seed, density)
        cap = DX.capacity(areas.get(ci, 0.0))
        want = grass + shrubs
        if want > cap and want > 0:
            k = cap / want
            grass = int(math.floor(grass * k))
            shrubs = int(math.floor(shrubs * k))
        return tests, grass, shrubs, wilts, lush

    X.S.capability_tests = lambda ci, status, seed: real_tests[ci]
    if area_aware:
        X._counts = area_aware_counts
    #: THE HATCH: the affine-CRC32 sampler this pass exists to avoid, reachable only by the refusal
    #: harness, so the corr gate below can be shown to fire on real placements.
    positioner = X.S.scatter_island if PERTURB_POSITIONER else X.scatter_dispersed
    try:
        return positioner(island, D.DECOR_META["tokenFamilies"],
                          island["storyId"], island["uatCriteria"])
    finally:
        X.S.capability_tests = original_tests
        X._counts = original_counts


def respeciate(items):
    """Spread the tuft placements uniformly over the FOUR species slots.

    WHY THIS IS NEEDED AT ALL, and why it is not a semantic change. `scatter.tuft_piece` reserves
    `tuft-2` for an `unknown` capability and `tuft-4` for a lush one, so on an island where every
    capability is `healthy` only two or three of the four slots are ever reachable — a four-species
    set would deliver as two. The reassignment is a hash over the placement's OWN address and is
    disjoint from both count and position: it moves no plant and adds or removes none.

    A SPECIES CARRIES NO MEANING. ADR-0226 D2 gives the signal to the vegetation COUNT and the
    vocabulary has no member for species, so four outlines assert exactly what two did. Making
    species mean something would be inventing a channel under cover of an art change, and it is
    precisely what this pass must not do.
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


def dispersion_stats(items, cells, label):
    """The dispersion floor's own instruments, run on THIS pass's own delivered placements.

    corr(u, v) IS THE ASSERTION, not a report line. Two independent draws are uncorrelated whatever
    the cells look like, so the null is exactly 0 and no threshold has to be argued from taste. The
    unfixed sampler scores +0.9997 here.
    """
    pts = [(it["g"][0], it["g"][1], it["cell"]) for it in items if it["kind"] != "flower"]
    uv = DX.axis_uv(pts, cells)
    u = np.array([a for a, _b in uv], dtype=np.float64)
    v = np.array([b for _a, b in uv], dtype=np.float64)
    corr = float(np.corrcoef(u, v)[0, 1]) if len(u) > 2 else 0.0
    diag = float(np.mean(np.abs(u - v) < 0.02))
    xy = np.array([[p[0], p[1]] for p in pts], dtype=np.float64)
    d2 = ((xy[:, None, :] - xy[None, :, :]) ** 2).sum(axis=2)
    np.fill_diagonal(d2, np.inf)
    nn = np.sqrt(d2.min(axis=1))
    return {
        "label": label,
        "placements": len(pts),
        "corrUV": round(corr, 4),
        "onDiagonalShare": round(diag, 4),
        "closestPairGroundUnits": round(float(nn.min()), 3),
        "medianNearestNeighbour": round(float(np.median(nn)), 3),
        "shareWithNeighbourUnder4Units": round(float(np.mean(nn < 4.0)), 4),
    }


# =====================================================================================================
# 2. THE PANEL DRIVER — the ONE new composition function, and it exists for one seam
# =====================================================================================================
def panel(items=None, shade=None, palette=None, pieces=BLADE_PIECES, geometry="blade", tree=True):
    """One delivered composite.

    The four calls are `D.compose_land` (the land AND the plants, in one painter order),
    `field * canvas` (this pass), `C.back_half` (the palette snap) and `D.plant_tree`. The light
    field has to enter BETWEEN the first two: applied after the snap it would be a raw gradient
    pasted over land, which is the ADR-0145 failure at island scale.

    Note the plants are inside the multiply, and deliberately: a plant standing in a shadow that does
    not touch it is two scenes in one frame. This is the first pass on the arc where a light field and
    a plant have been in the same composite at all — the shadow pass composed a bare island.
    """
    island = CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
    D.use_pieces(pieces, expect_geometry=geometry)
    cells = D.prepare(island["variantB"]["cells"])
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
        canvas, alpha, tree_h = D.compose_land(items or [], cells=cells, ground=P.GROUND)
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
# 3. THE ISLAND, THE PLACEMENTS AND THE ASSERTION THAT GATES EVERY PICTURE
# =====================================================================================================
_island = CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
_cells = D.prepare(_island["variantB"]["cells"])

print("placing through the FIXED positioner ...", flush=True)
D.use_pieces(BLADE_PIECES, expect_geometry="blade")
ITEMS_BASE, STATS_BASE = place(_island)
ITEMS_AREA, STATS_AREA = place(_island, area_aware=True)
ITEMS_SPECIES = respeciate(ITEMS_BASE)
ITEMS_SPECIES_AREA = respeciate(ITEMS_AREA)

DISP = {
    "currentBudget": dispersion_stats(ITEMS_BASE, _cells, "current budget"),
    "areaAwareBudget": dispersion_stats(ITEMS_AREA, _cells, "area-aware budget"),
}
REPORT["dispersion"] = DISP

#: THE GATE. Not a report line — no picture is written if it fires. The dispersion floor's rung 1
#: pools |corr| <= 0.15 and rung 2 puts the on-diagonal share at <= 0.07 against a chance of 0.0396;
#: both are re-run here on THIS pass's own placements because a floor that ran in another directory
#: proves nothing about the plants in these pictures.
for key, st in DISP.items():
    if abs(st["corrUV"]) > 0.15 or st["onDiagonalShare"] > 0.07:
        raise SystemExit(
            f"REFUSED: the {key} placements carry the DIAGONAL COLLAPSE — corr(u,v)="
            f"{st['corrUV']} over {st['placements']} placements, on-diagonal share "
            f"{st['onDiagonalShare']} (null 0.0396). This pass would be showing the owner four "
            f"species standing in diagonal rows. No picture is written. Check that `disperse.py` "
            f"is the positioner actually in use and that `scatter._sample_in_cell` has not been "
            f"reached instead.")
print("  corr(u,v) = %s / %s  — the diagonal collapse is NOT in these placements"
      % (DISP["currentBudget"]["corrUV"], DISP["areaAwareBudget"]["corrUV"]), flush=True)

_tree_ground = tuple(_island["islandCentreGround"])


# =====================================================================================================
# 4. THE FIELDS — one shadow, two relief bands
# =====================================================================================================
print("building the shadow field (inherited whole) ...", flush=True)
SHADOW_FIELD, SHADOW_STATS = SH.build(C, _cells, tree_ground=_tree_ground, sprite=_TREE_SPRITE,
                                      anchor=_TREE_REG["groundSocketAnchor"])
print("building the relief fields ...", flush=True)
RELIEF = {}
for band in ("coarse", "fine"):
    RELIEF[band] = RL.multiplier(SH, C, _cells, band)
REPORT["relief"] = {b: s for b, (_f, s) in RELIEF.items()}
RELIEF_FIELD = RELIEF[RELIEF_BAND][0]


def combine(shadow_field, relief_field):
    """The two fields, multiplied AND CLAMPED AT THE SHADOW'S OWN FLOOR.

    THE ARITHMETIC REASON, WHICH IS REAL. The two techniques spend ONE luminance budget. The shadow's
    deepest rung is 0.80 against a measured confusability ceiling of 0.74 for the delivered `healthy`
    fill — a margin of 0.06. Relief's own deepest rung is 0.91, safe on its own. But the fields
    MULTIPLY, so a pixel both in the canopy shadow and on a relief facet turned away from the sun
    would land at 0.80 x 0.91 = 0.728, BELOW the ceiling. That bound is a property of the two ladders
    and holds on any island.

    AND THE HONEST QUALIFICATION, WHICH MATTERS MORE. The clamp was introduced because the status
    guard fired — and that firing turned out to be the INSTRUMENT, not the art. With the strict fill
    mask finally correct (see `pure_fill`), the unclamped product corrupts ZERO delivered pixels on
    this island: the relief field's own minimum is 0.958, not 0.91, so no pixel gets anywhere near
    the deepest product. The clamp is therefore a PRECAUTION justified by the ladder arithmetic, NOT
    a fix for a defect anyone has observed. `verify.py` asserts the arithmetic and reports the
    measured breach as zero; if a future island ever makes it non-zero, the clamp starts earning its
    place. It is kept rather than dropped because it is also the physically honest model — ground in
    full shadow receives no direct sun, and relief is a direct-light effect, so there is no detail
    there to reveal.
    """
    if PERTURB_OVERDEEP:
        return np.clip(shadow_field * relief_field * 0.86, 0.55, 1.0).astype(np.float32)
    if PERTURB_UNCLAMPED:
        return (shadow_field * relief_field).astype(np.float32)
    return np.maximum(shadow_field * relief_field, SH.SHADOW_FLOOR).astype(np.float32)


JOINT_FIELD = combine(SHADOW_FIELD, RELIEF_FIELD)


# =====================================================================================================
# 5. THE PALETTE — what each option COSTS, closed over the light levels it needs
# =====================================================================================================
def levels_product(*ladders):
    """Every light level a pixel can end up at, when the fields MULTIPLY.

    A pixel in a shadow AND on a relief facet carries the product of the two multipliers, so the
    closure has to hold the products and not only the two ladders. Closing over the union alone is
    the partial closure `build_palette`'s docstring records the cost of: the nearest surviving entry
    belonged to a DIFFERENT STATUS FAMILY, and an `unknown` island's rim came out `healthy` green
    over 2564 px with nothing failing.
    """
    out = {1.0}
    for lad in ladders:
        out |= {round(a * b, 6) for a in out for b in (1.0,) + tuple(lad)}
    #: Products below the shadow's floor are UNREACHABLE because `combine` clamps there, and a rung
    #: the field can never reach is a colour in the palette and nothing on the island.
    return tuple(sorted({v for v in out if v >= SH.SHADOW_FLOOR} - {1.0}, reverse=True))


SHADOW_LEVELS = SH.SHADOW_LEVELS
RELIEF_LEVELS = SH.ladder_for(RL.RELIEF_FLOOR, RL.RELIEF_STOPS)
JOINT_LEVELS = levels_product(SHADOW_LEVELS, RELIEF_LEVELS)

D.use_pieces(SPECIES_PIECES, expect_geometry="species")
PALETTE_DRESSED = C.PALETTE.copy()
D.use_pieces(BLADE_PIECES, expect_geometry="blade")
PALETTE_DRESSED_BLADE = C.PALETTE.copy()

PALETTE_LAND_ONLY = C.build_palette()
PAL = {
    "shipped_landOnly": PALETTE_LAND_ONLY,
    "shipped_dressed": PALETTE_DRESSED,
    "shadowOnly": SH.extended_palette(PALETTE_DRESSED, SHADOW_LEVELS),
    "reliefOnly": SH.extended_palette(PALETTE_DRESSED, RELIEF_LEVELS),
    "joint": SH.extended_palette(PALETTE_DRESSED, JOINT_LEVELS),
}
REPORT["paletteCost"] = {
    "shippedLandOnlyEntries": len(PALETTE_LAND_ONLY),
    "shippedDressedEntries": len(PALETTE_DRESSED),
    "shadowLadder": list(SHADOW_LEVELS),
    "reliefLadder": list(RELIEF_LEVELS),
    "jointLevels": list(JOINT_LEVELS),
    "entries": {k: int(len(v)) for k, v in PAL.items()},
    "reliefAloneCostsOverShipped": int(len(PAL["reliefOnly"]) - len(PALETTE_DRESSED)),
    "reliefCostsOverShadowOnly": int(len(PAL["joint"]) - len(PAL["shadowOnly"])),
    #: THE SILHOUETTE OPTION'S PALETTE COST, and it is the number that separates the two options.
    #: The four species sit in the existing `tuft-*` slots with the existing `bladeFront`/`bladeBack`
    #: roles at the existing shade levels, so `build_palette_dressed` closes over exactly the same
    #: (family x level) pairs. Asserted by comparing the two closures rather than argued.
    "speciesSetEntries": int(len(PALETTE_DRESSED)),
    "bladeSetEntries": int(len(PALETTE_DRESSED_BLADE)),
    "silhouetteVarietyCostsInPaletteEntries": int(len(PALETTE_DRESSED)
                                                  - len(PALETTE_DRESSED_BLADE)),
    "note": ("The shadow pass's 132 -> 506 figure is the LAND-ONLY palette. Every panel here draws "
             "decor, so its base is the DRESSED palette (land + the four decor token families at "
             "every shade level any piece declares) and the numbers are not comparable to 132 "
             "without that adjustment. Both bases are reported."),
}

PALETTE_MAIN = PAL["joint"]


# =====================================================================================================
# 6. THE PANELS
# =====================================================================================================
print("composing 1/8: baseline — flat green + shadow, the WITHDRAWN blade grass ...", flush=True)
B_BASE, S_BASE, _c, _, _ = panel(ITEMS_BASE, shade=SHADOW_FIELD, palette=PALETTE_MAIN)
B_BASE_BARE, S_BASE_BARE, _c, _, _ = panel(ITEMS_BASE, shade=SHADOW_FIELD, palette=PALETTE_MAIN,
                                        tree=False)

print("composing 2/8: + ground micro-relief ...", flush=True)
B_RELIEF, S_RELIEF, _c, _, _ = panel(ITEMS_BASE, shade=JOINT_FIELD, palette=PALETTE_MAIN)
B_RELIEF_BARE, S_RELIEF_BARE, _c, _, _ = panel(ITEMS_BASE, shade=JOINT_FIELD, palette=PALETTE_MAIN,
                                            tree=False)

print("composing 3/8: + silhouette variety ...", flush=True)
B_SPECIES, S_SPECIES, _c, _, _ = panel(ITEMS_SPECIES, shade=SHADOW_FIELD, palette=PALETTE_MAIN,
                                       pieces=SPECIES_PIECES, geometry="species")
#: The tree-less twin, and it exists for ONE reason: the status guard has to vary the LIGHT and
#: nothing else. Comparing the blade baseline against the species composite would vary the light AND
#: the plant set, and a bigger plant covering ground it did not cover before is vegetation doing its
#: job, not a fill lying — measured, it reported 384 "corrupted" pixels that were nothing of the
#: kind. This panel holds the plants fixed so the delta is the relief field alone.
B_SPECIES_BARE, S_SPECIES_BARE, _c, _, _ = panel(
    ITEMS_SPECIES, shade=SHADOW_FIELD, palette=PALETTE_MAIN,
    pieces=SPECIES_PIECES, geometry="species", tree=False)

print("composing 4/8: BOTH ...", flush=True)
B_BOTH, S_BOTH, _c, _, _ = panel(ITEMS_SPECIES, shade=JOINT_FIELD, palette=PALETTE_MAIN,
                              pieces=SPECIES_PIECES, geometry="species")
B_BOTH_BARE, S_BOTH_BARE, _c, _, _ = panel(ITEMS_SPECIES, shade=JOINT_FIELD, palette=PALETTE_MAIN,
                                        pieces=SPECIES_PIECES, geometry="species", tree=False)

# -----------------------------------------------------------------------------------------------------
# THE MEASUREMENT SET — TREE-LESS **AND PLANT-LESS**, and both halves of that matter.
#
# The tree is composited on top of the land at 1:1, so a per-cell measure that includes it reads
# canopy as ground; it cost a sibling pass a full re-measure (4.87% against a true 6.21%).
#
# THE PLANTS ARE THE SAME TRAP ONE LEVEL DOWN, and this pass is the first on the arc that could hit
# it, because it is the first to put plants and a light field in one composite. A plant STANDS ON a
# cell top face, so its pixels fall inside the eroded top-face mask and enter the body statistics as
# if they were ground. Measured with plants in, the luma range would be a mixture of the ground's
# light field and the vegetation's own token family — and it would not be comparable to the arc's
# 78.9 -> 58.2 -> 61.6 series, every term of which was measured on a bare island.
# -----------------------------------------------------------------------------------------------------
print("composing the plant-less measurement set ...", flush=True)
LAND_SHADOW, LS_SOLID, _c, _, _ = panel([], shade=SHADOW_FIELD, palette=PALETTE_MAIN, tree=False)
LAND_JOINT, LJ_SOLID, _c, _, _ = panel([], shade=JOINT_FIELD, palette=PALETTE_MAIN, tree=False)
#: THE UNSHADED, UNLIT, PLANT-LESS CANVAS — the reference the strict status mask is cut from. It is
#: the supersampled canvas BEFORE the palette snap, which is the only place a pixel can be known to
#: be a cell's top fill and nothing else.
LAND_PLAIN, LP_SOLID, _c, _, PLAIN_CANVAS = panel([], palette=PALETTE_MAIN, tree=False)
#: THE SAME REFERENCE, BUT WITH THE PLANTS STANDING — and this pass needs both, which the shadow pass
#: did not, because it is the first on the arc to put a plant and a light field in one composite.
#: A strict fill mask cut from a PLANT-LESS canvas still contains every pixel a plant will later
#: stand on. The light field multiplies the whole canvas, plants included, so those pixels move — and
#: they move as VEGETATION, which is a different token family and reads as a different status by
#: design. Measured, that reported 99 corrupted "fills" that were all plant pixels. A fill mask has
#: to be cut from the canvas that actually carries the plants it will be used to judge.
_SP_PLAIN, _SP_SOLID, _c, _, SPECIES_PLAIN_CANVAS = panel(
    ITEMS_SPECIES, palette=PALETTE_MAIN, pieces=SPECIES_PIECES, geometry="species", tree=False)

if PERTURB_FAST:
    #: The four forks no guard depends on. Skipped only by the refusal harness, which pays for six
    #: composites instead of fourteen; a delivered run always draws them.
    print("PERTURB_FAST: skipping the four forks (count, two palettes, coarse relief)", flush=True)
    B_AREA, S_AREA = B_BOTH, S_BOTH
    B_RELIEF_SHIPPED, S_RELIEF_SHIPPED = LAND_JOINT, LJ_SOLID
    B_RELIEF_SHADOWPAL, S_RELIEF_SHADOWPAL = LAND_JOINT, LJ_SOLID
    B_COARSE, S_COARSE = LAND_JOINT, LJ_SOLID
else:
    print("composing 5/8: the count fork — area-aware budget ...", flush=True)
    B_AREA, S_AREA, _c, _, _ = panel(ITEMS_SPECIES_AREA, shade=JOINT_FIELD, palette=PALETTE_MAIN,
                                  pieces=SPECIES_PIECES, geometry="species")

    #: The three palette panels are PLANT-LESS on purpose: the question they answer is whether the
    #: GROUND's light levels survive the snap, and a plant is a different token family standing in
    #: front of the thing being measured.
    print("composing 6/8: relief on the SHIPPED palette (does it survive the snap?) ...", flush=True)
    B_RELIEF_SHIPPED, S_RELIEF_SHIPPED, _c, _, _ = panel(
        [], shade=JOINT_FIELD, palette=PALETTE_DRESSED, tree=False)

    print("composing 7/8: relief on the SHADOW-ONLY palette ...", flush=True)
    B_RELIEF_SHADOWPAL, S_RELIEF_SHADOWPAL, _c, _, _ = panel(
        [], shade=JOINT_FIELD, palette=PAL["shadowOnly"], tree=False)

    print("composing 8/8: the relief frequency fork — coarse ...", flush=True)
    B_COARSE, S_COARSE, _c, _, _ = panel(
        [], shade=combine(SHADOW_FIELD, RELIEF["coarse"][0]), palette=PALETTE_MAIN, tree=False)

CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)


# =====================================================================================================
# 7. MEASUREMENT — all of it on the TREE-LESS renders
# =====================================================================================================
# The hero tree is composited on top of the land at 1:1, so a per-cell measure that includes it reads
# canopy as ground. It cost a sibling pass a full re-measure (4.87% against a true 6.21%).
TOP_FACES = SH.top_face_mask(C, _cells, erode=1)


def cell_bodies(img, solid):
    """Top faces, minus `back_half`'s silhouette RIM — the shadow pass's own mask, reproduced because
    the numbers this pass reports have to sit in the SAME series as its 78.9 / 58.2 / 61.6.

    The rim is not an oversight to erode away: `back_half` deliberately lets it reach the whole
    palette, darkening from the local colour and re-snapping, so a green cell's rim can legally land
    on another family's entry.
    """
    pad = np.pad(solid, 1, constant_values=False)
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    return TOP_FACES & solid & nb


def luma(img):
    """`C.W_LUMA`, NOT Rec.709 — the quantiser's own weights.

    This matters more than it looks: `snap` measures "near" in a luma-weighted space using
    `C.W_LUMA` (0.30 / 0.59 / 0.11), and every luma figure this arc has published was taken with
    those weights. A first draft here used Rec.709 and produced numbers that could not be compared
    to 78.9 / 58.2 / 61.6 at all while looking exactly as if they could.
    """
    return (img[:, :, :3].astype(np.float32) * C.W_LUMA).sum(axis=2)


#: PIXELS THAT ARE UNAMBIGUOUSLY A CELL'S TOP FILL — every one of their supersamples is the flat fill
#: on the UNSHADED canvas, read BEFORE the snap. The shadow pass's mask, and this pass had to learn
#: the same lesson the same way: a geometric top-face mask alone reported 51 corrupted pixels, and
#: dumping them showed transitions running in BOTH directions between the fill and a much darker
#: colour at 0.62 of the token — far below any level the clamped field can reach. Those are blocks
#: straddling a cell and the wall stamped in front of it, where `mode_down`'s MAJORITY VOTE tips from
#: one face to the other when the light moves. That changes which surface won the block, not what a
#: fill says. Requiring the whole block to be the fill BEFORE any light is applied removes them, and
#: it is not circular: the reference is the unlit canvas and only the lit side is under test.
_WANT_FILL = np.array(
    [int(round(v)) for v in C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT]),
                                    C.FLAT_LEVEL)], dtype=np.int32)


def pure_fill(canvas, solid):
    """Delivered pixels whose WHOLE supersample block is the flat fill on an unlit canvas.

    Cut per plant set, never once — see the note above the two reference composites. The silhouette
    rim is dropped as well: `back_half` deliberately authorises it to reach the whole palette,
    darkening from the local colour and re-snapping, so a green cell's rim may legally land on
    another family's entry and is not a fill making a claim.
    """
    p = np.all(np.abs(canvas.astype(np.int32) - _WANT_FILL) <= 0, axis=2)
    blocks = (p.reshape(C.CANVAS_H, C.SS, C.CANVAS_W, C.SS).transpose(0, 2, 1, 3)
              .reshape(C.CANVAS_H, C.CANVAS_W, C.SS * C.SS).all(axis=2))
    pad = np.pad(solid, 1, constant_values=False)
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    return blocks & solid & nb


PURE_FILL = pure_fill(PLAIN_CANVAS, LP_SOLID)
PURE_FILL_SPECIES = pure_fill(SPECIES_PLAIN_CANVAS, _SP_SOLID)


def body_stats(img, solid, label):
    """The cell-body statistics the arc has been tracking since the flattening: p2-p98 luma range and
    the count of DISTINCT delivered luminance levels."""
    m = cell_bodies(img, solid)
    lv = luma(img)[m]
    if lv.size == 0:
        return {"label": label, "bodyPx": 0}
    return {
        "label": label,
        "bodyPx": int(m.sum()),
        "lumaP2toP98": round(float(np.percentile(lv, 98) - np.percentile(lv, 2)), 1),
        "lumaMean": round(float(lv.mean()), 1),
        "lumaStd": round(float(lv.std()), 2),
        "distinctLumaLevels": int(len(np.unique(np.round(lv, 3)))),
    }


REPORT["bodies"] = {
    "_measuredOn": ("TREE-LESS AND PLANT-LESS renders. A plant stands ON a cell top face, so its "
                    "pixels fall inside the eroded body mask; measured with plants in, these numbers "
                    "would mix the ground's light field with the vegetation's own token family and "
                    "would not be comparable to the arc's 78.9 / 58.2 / 61.6 series, every term of "
                    "which was measured on a bare island."),
    "baselineShadowOnly": body_stats(LAND_SHADOW, LS_SOLID, "flat green + shadow, bare"),
    "plusRelief": body_stats(LAND_JOINT, LJ_SOLID, "+ micro-relief (%s), bare" % RELIEF_BAND),
    "reliefOnShippedPalette": body_stats(B_RELIEF_SHIPPED, S_RELIEF_SHIPPED,
                                         "relief, SHIPPED palette"),
    "reliefOnShadowOnlyPalette": body_stats(B_RELIEF_SHADOWPAL, S_RELIEF_SHADOWPAL,
                                            "relief, shadow-only palette"),
    "reliefCoarse": body_stats(B_COARSE, S_COARSE, "relief coarse, bare"),
    #: SPECIES CHANGE NO LAND PIXEL, and this is the check rather than the claim: the silhouette
    #: option is entirely a decor change, so the ground's own statistics must be IDENTICAL to the
    #: relief row. If they ever differ, a species has started painting ground.
    "plusBothLandOnly": body_stats(LAND_JOINT, LJ_SOLID, "+ relief + species (land only)"),
    "priorPassFigures": {
        "asShipped3VariantsPlusWheat": 78.9,
        "oneSurfaceNoShadow": 58.2,
        "oneSurfacePlusShadow": 61.6,
        "source": "chapter2-one-surface-and-shadow-2026-08-17/README.md section 3",
    },
}


# ---- does relief SURVIVE the snap, and at what palette size ------------------------------------------
def rung_census(img, solid, palette_levels):
    """How many delivered pixels landed on each authored light level, over the cell bodies.

    A level that reaches ZERO pixels is a colour in the palette and nothing on the island — which is
    exactly what happened to all three shadow rungs on the shipped palette. Counted by matching the
    delivered colour against `flat token x level`, so it is the DELIVERED raster answering and not
    the field.
    """
    base = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT]), C.FLAT_LEVEL)
    m = PURE_FILL & solid
    px = img[:, :, :3][m].astype(np.int32)
    out = {}
    for lv in (1.0,) + tuple(palette_levels):
        want = np.array([int(round(v * lv)) for v in base], dtype=np.int32)
        out["light-%g" % lv] = int(np.count_nonzero((px == want[None, :]).all(axis=1)))
    return out


REPORT["survivesTheSnap"] = {
    "shippedDressedPalette": rung_census(B_RELIEF_SHIPPED, S_RELIEF_SHIPPED, JOINT_LEVELS),
    "shadowOnlyPalette": rung_census(B_RELIEF_SHADOWPAL, S_RELIEF_SHADOWPAL, JOINT_LEVELS),
    "jointPalette": rung_census(B_BOTH_BARE, S_BOTH_BARE, JOINT_LEVELS),
}


# ---- the status guard: does relief make a cell LIE about its capability? ------------------------------
TABLE = SH.reader_status_table(C, faces="top")
DELIVERED_TOP = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][ONE_SURFACE_VARIANT]),
                        C.FLAT_LEVEL)
REPORT["howDeepBeforeItLies"] = dict(
    zip(("safeDepth", "readsAsAtFullLight"), SH.safe_depth(C, DELIVERED_TOP, TABLE)))
REPORT["howDeepBeforeItLies"]["deepestJointLevel"] = float(min(JOINT_LEVELS))
REPORT["howDeepBeforeItLies"]["deepestReliefLevel"] = float(min(RELIEF_LEVELS))


def status_delta(base_img, base_solid, test_img, test_solid, label, fill_mask=None):
    """What the light field changed about what a pixel SAYS — a DELTA, never an absolute.

    Asked absolutely the test condemns the shipped art: 21 of the 78 colours the land may emit
    already read as a status OTHER than the one that authored them, at full light, with no shadow
    near them. A test that fails on the baseline cannot price a change to it.
    """
    m = (PURE_FILL if fill_mask is None else fill_mask) & base_solid & test_solid
    if not m.any():
        return {"label": label, "bodyPx": 0}
    a = SH.nearest_status(base_img[:, :, :3][m].astype(np.float32), TABLE, C.W_LUMA)
    b = SH.nearest_status(test_img[:, :, :3][m].astype(np.float32), TABLE, C.W_LUMA)
    return {"label": label, "bodyPx": int(m.sum()),
            "pixelsWhoseStatusReadChanged": int(np.count_nonzero(a != b))}


REPORT["statusIsNotCorrupted"] = {
    #: On the BARE land, which isolates the light field — the only thing that can move a fill.
    "reliefAloneOnBareLand": status_delta(LAND_SHADOW, LS_SOLID, LAND_JOINT, LJ_SOLID,
                                          "shadow -> shadow + relief, bare"),
    #: And on the composite the owner actually looks at — same island, same species, same placements,
    #: relief the only difference. Varying the plant set here as well would count a bigger plant
    #: covering ground as a corrupted fill, which is exactly what a first version of this line did:
    #: 384 pixels, none of them a lie.
    "asDelivered": status_delta(B_SPECIES_BARE, S_SPECIES_BARE, B_BOTH_BARE, S_BOTH_BARE,
                                "species + shadow -> species + shadow + relief",
                                fill_mask=PURE_FILL_SPECIES),
}

#: THE SHARED LIGHT BUDGET, MEASURED RATHER THAN ARGUED — and the reason `combine` clamps.
#: Composed with the two fields multiplying freely, the deepest joint level is 0.80 x 0.91 = 0.728,
#: which is BELOW the measured 0.74 ceiling for the delivered `healthy` fill. This composite is
#: measured and then thrown away; no picture is written from it. It is what the guard caught.
if PERTURB_FAST:
    _UC_IMG, _UC_SOLID = LAND_JOINT, LJ_SOLID
else:
    print("measuring the UNCLAMPED product (the breach the guard caught) ...", flush=True)
    _UNCLAMPED = (SHADOW_FIELD * RELIEF_FIELD).astype(np.float32)
    _UC_IMG, _UC_SOLID, _c, _, _ = panel([], shade=_UNCLAMPED, palette=PALETTE_MAIN, tree=False)
    CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
REPORT["theSharedLightBudget"] = {
    "shadowDeepestRung": float(min(SHADOW_LEVELS)),
    "reliefDeepestRung": float(min(RELIEF_LEVELS)),
    "unclampedDeepestProduct": round(float(min(SHADOW_LEVELS) * min(RELIEF_LEVELS)), 4),
    "measuredCeilingForHealthyFill": REPORT["howDeepBeforeItLies"]["safeDepth"],
    "clampedDeepest": float(SH.SHADOW_FLOOR),
    "unclampedStatusDelta": status_delta(LAND_SHADOW, LS_SOLID, _UC_IMG, _UC_SOLID,
                                         "shadow -> shadow x relief, UNCLAMPED, bare"),
    "reliefFieldOwnMinimum": None,      # filled below, once the field stats are to hand
    "finding": ("The two techniques spend ONE luminance budget. Each ladder is safe alone and their "
                "PRODUCT is not — 0.80 x 0.91 = 0.728 against a 0.74 ceiling — so the clamp is "
                "justified by arithmetic that holds on any island. But the MEASURED breach on THIS "
                "island is ZERO: the relief field's own minimum is 0.958, so no delivered pixel "
                "approaches the deepest product. The clamp is a precaution, not a fix for an "
                "observed defect, and it is reported that way rather than credited with a save."),
    "howThisWasAlmostGotWrong": (
        "The guard fired four times before it was right, and every one was the INSTRUMENT rather "
        "than the art — 108 px, then 51, then 384, then 99, all of them false. Three distinct "
        "mechanisms, each of which had to be dumped and looked at rather than reasoned about: "
        "(1) a geometric top-face mask counts blocks straddling a cell and the wall stamped in "
        "front of it, where `mode_down`'s MAJORITY VOTE tips when the light moves — the tell was "
        "transitions running in BOTH directions to a colour at 0.62 of the token, far below any "
        "level the field can reach; (2) comparing the blade baseline against the species composite "
        "varies the plant set as well as the light, so a bigger plant covering ground it did not "
        "cover before is counted as a corrupted fill; (3) a strict fill mask cut from a PLANT-LESS "
        "canvas still contains every pixel a plant will later stand on, and the field multiplies "
        "plant pixels too. The shadow pass recorded the first of these and this pass still had to "
        "rediscover the other two, which is the reason they are written down here at all."),
}
REPORT["theSharedLightBudget"]["reliefFieldOwnMinimum"] = REPORT["relief"][RELIEF_BAND][
    "minMultiplier"]

#: THE REFUSAL. A picture is not written if the relief made a cell fill read as another capability's
#: status. ADR-0367 D5 forbids the art asserting something false outright, and a report explaining
#: afterwards that the island lied is not the same object as a composer that declines to draw one.
for key, d in REPORT["statusIsNotCorrupted"].items():
    if d.get("pixelsWhoseStatusReadChanged", 0) > 0:
        raise SystemExit(
            f"REFUSED: {key} changed the status read of {d['pixelsWhoseStatusReadChanged']} of "
            f"{d['bodyPx']} top-face pixels. A `healthy` cell would be reading as another status "
            f"because of a shading pass. No picture is written (ADR-0367 D5).")

if PERTURB_FAST:
    #: The harness's marker for "every guard was REACHED and none of them fired".
    print("PERTURB_FAST: all guards reached, none fired", flush=True)
    raise SystemExit(0)


# ---- the marks: delivered px per mark, and how distinct the outlines actually are ---------------------
def mark_census(pieces_dir, names):
    """Every species' DELIVERED footprint, measured off the committed piece PNG through the same
    3x3 majority the compositor's `back_half` applies. This is the silhouette budget, and it is the
    number the whole option turns on."""
    out = {}
    for n in names:
        a = np.array(Image.open(os.path.join(pieces_dir, n + ".png")).convert("RGBA"))[:, :, 3]
        m = a > 110.0
        h, w = a.shape
        dm = (m.reshape(h // 3, 3, w // 3, 3).transpose(0, 2, 1, 3)
              .reshape(h // 3, w // 3, 9).sum(axis=2) >= 5)
        if not dm.any():
            out[n] = {"deliveredPx": 0}
            continue
        ys, xs = np.nonzero(dm)
        bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        sub = dm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        out[n] = {
            "deliveredPx": int(dm.sum()),
            "bboxW": bw, "bboxH": bh,
            "aspect": round(bw / bh, 2),
            "rows": ["".join("#" if v else "." for v in row) for row in sub],
        }
    return out


CENSUS_BLADE = mark_census(BLADE_PIECES, ["tuft-2", "tuft-3a", "tuft-3b", "tuft-4",
                                          "shrub-a", "shrub-b"])
CENSUS_SPECIES = mark_census(SPECIES_PIECES, SPECIES_SLOTS + ["shrub-a", "shrub-b"])


def outline_spread(census, keys):
    """How different the outlines actually are, as ONE number: the spread of delivered aspect ratio.

    Aspect rather than pixel count because a reader at this scale sees a shape before it sees an
    area, and because two pieces can differ in area while delivering the same box.
    """
    asp = [census[k]["aspect"] for k in keys if census[k].get("deliveredPx")]
    px = [census[k]["deliveredPx"] for k in keys if census[k].get("deliveredPx")]
    return {"aspectMin": min(asp), "aspectMax": max(asp),
            "aspectSpread": round(max(asp) / min(asp), 2),
            "deliveredPxMin": min(px), "deliveredPxMax": max(px),
            "deliveredPxMedian": int(np.median(px))}


REPORT["marks"] = {
    "withdrawnBladeSet": CENSUS_BLADE,
    "speciesSet": CENSUS_SPECIES,
    "bladeTuftOutlineSpread": outline_spread(CENSUS_BLADE, ["tuft-2", "tuft-3a", "tuft-3b",
                                                            "tuft-4"]),
    "speciesOutlineSpread": outline_spread(CENSUS_SPECIES, SPECIES_SLOTS),
    "note": ("The arc's 'median 3 delivered px' figure is the WITHDRAWN long grass "
             "(`pieces-m00-blade`, the set `compose_healthy.py:95` still mounts). It is not the "
             "budget a shrub or a species has."),
}


# ---- what the plants actually delivered on the island -------------------------------------------------
def delivered_vegetation(img, solid, base_img, base_solid):
    """Pixels this composite has that the SAME composite without any plant does not. Measured as a
    difference against a plantless render rather than by colour, because a plant token and a land
    token can share a delivered colour after the snap."""
    m = solid & base_solid
    diff = (img[:, :, :3] != base_img[:, :, :3]).any(axis=2) & m
    return int(np.count_nonzero(diff))


#: The plant-less references are the measurement set composed above — the same two rasters, so a
#: vegetation pixel count and a body luma figure can never be taken against different lands.
REPORT["vegetation"] = {
    "currentBudget": {
        "authoredTufts": STATS_BASE["tuft"], "authoredShrubs": STATS_BASE["shrub"],
        "authoredFlowers": STATS_BASE["flower"], "wellCulled": STATS_BASE["wellCulled"],
        "total": STATS_BASE["tuft"] + STATS_BASE["shrub"] + STATS_BASE["flower"],
    },
    "areaAwareBudget": {
        "authoredTufts": STATS_AREA["tuft"], "authoredShrubs": STATS_AREA["shrub"],
        "authoredFlowers": STATS_AREA["flower"], "wellCulled": STATS_AREA["wellCulled"],
        "total": STATS_AREA["tuft"] + STATS_AREA["shrub"] + STATS_AREA["flower"],
    },
    "deliveredPxBladeSet": delivered_vegetation(B_BASE_BARE, S_BASE_BARE,
                                                LAND_SHADOW, LS_SOLID),
    "deliveredPxSpeciesSet": delivered_vegetation(B_BOTH_BARE, S_BOTH_BARE,
                                                  LAND_JOINT, LJ_SOLID),
}
_v = REPORT["vegetation"]
_v["deliveredPxPerMarkBlade"] = round(_v["deliveredPxBladeSet"] / max(1, _v["currentBudget"]["total"]), 2)
_v["deliveredPxPerMarkSpecies"] = round(_v["deliveredPxSpeciesSet"] / max(1, _v["currentBudget"]["total"]), 2)


# ---- the count fork, per capability -------------------------------------------------------------------
AREAS = owned_areas(_island)
FORK_ROWS = []
for a, b in zip(STATS_BASE["perCapability"], STATS_AREA["perCapability"]):
    area = AREAS.get(a["cap"], 0.0)
    cap = DX.capacity(area)
    FORK_ROWS.append({
        "cap": a["cap"], "tests": a["tests"], "cells": a["cells"],
        "areaGroundUnits": round(area, 1),
        "capacityAtShrubFootprint": round(cap, 1),
        "currentBudget": a["tufts"] + a["shrubs"],
        "areaAwareBudget": b["tufts"] + b["shrubs"],
        "overloadRatio": round((a["tufts"] + a["shrubs"]) / cap, 3) if cap else None,
        "densityCurrent": round((a["tufts"] + a["shrubs"]) / area * 1000, 2) if area else None,
        "densityAreaAware": round((b["tufts"] + b["shrubs"]) / area * 1000, 2) if area else None,
    })
FORK_ROWS.sort(key=lambda r: r["tests"])

#: MONOTONICITY IS THE THING THE FORK COSTS, and the increment asks for it by name. The current rule
#: is monotone in tests BY CONSTRUCTION (`2 + tests*1.9` with no other term), so more tests always
#: means more plants. Capping at capacity breaks that: a heavily-tested capability on a small parcel
#: can end up with FEWER plants than a lightly-tested one on a large parcel, and a reader counting
#: vegetation would then read the test counts in the wrong order. That is an ADR-0226 D2 semantic
#: change and is NOT this pass's to make.
def monotonicity_breaks(rows, key):
    breaks = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if rows[j]["tests"] > rows[i]["tests"] and rows[j][key] < rows[i][key]:
                breaks.append({"moreTestedCap": rows[j]["cap"], "tests": rows[j]["tests"],
                               "gets": rows[j][key], "lessTestedCap": rows[i]["cap"],
                               "itsTests": rows[i]["tests"], "itGets": rows[i][key]})
    return breaks


REPORT["countFork"] = {
    "rule": "grass = round(2 + tests*1.9); shrubs = round(tests/2.6). No area term.",
    "areaAwareVariant": ("the SAME rule, then capped at the parcel's own capacity at a shrub's "
                         "footprint (`dispersion.capacity`). The minimal change derived from the "
                         "measured overload, and nothing more."),
    "rows": FORK_ROWS,
    "totalCurrent": sum(r["currentBudget"] for r in FORK_ROWS),
    "totalAreaAware": sum(r["areaAwareBudget"] for r in FORK_ROWS),
    "overloadedCapabilitiesUnderCurrentRule": [r["cap"] for r in FORK_ROWS
                                               if r["overloadRatio"] and r["overloadRatio"] > 1.0],
    "monotonicityBreaksCurrent": monotonicity_breaks(FORK_ROWS, "currentBudget"),
    "monotonicityBreaksAreaAware": monotonicity_breaks(FORK_ROWS, "areaAwareBudget"),
    "THIS_IS_A_FORK": ("Changing the count rule is an ADR-0226 D2 semantic change and is NOT decided "
                       "here. Both panels are shown; neither is recommended."),
}


# =====================================================================================================
# 8. THE PICTURES
# =====================================================================================================
PAD, HDR, CAP = CH.PAD, CH.HDR, CH.CAP
INK, DIM, HI, WARN, GOOD = CH.INK, CH.DIM, CH.HI, CH.WARN, CH.GOOD
CAM = CH.CAM

b_base = CH.board(B_BASE)
b_relief = CH.board(B_RELIEF)
b_species = CH.board(B_SPECIES)
b_both = CH.board(B_BOTH)
b_area = CH.board(B_AREA)
IW, IH = b_both.size

R = REPORT["bodies"]
V = REPORT["vegetation"]
M = REPORT["marks"]
PC = REPORT["paletteCost"]

# ---- 1. THE DELIVERABLE: the four-panel comparison ---------------------------------------------------
im1, dr1, T1 = CH.sheet(PAD + 4 * (IW + PAD), HDR + IH + CAP + 96,
                        "HIGH FREQUENCY WITHOUT LOOKING OFF — the two options, and the two together",
                        f"`{P.STORY_ID}` — 11 capabilities, every one `healthy` off its own SIGNED "
                        f"pass. One island, one code state, one camera ({C.ELEV:g} deg), one palette "
                        f"({len(PALETTE_MAIN)} entries) on all four panels, so the only variable is "
                        f"the option. Every plant is placed by the FIXED positioner — corr(u,v) = "
                        f"{DISP['currentBudget']['corrUV']} against the unfixed sampler's +0.9997, "
                        f"so no plant here stands on its cell's diagonal. "
                        f"Rendered at {SAMPLES_DECLARED} Cycles samples.",
                        CAM)
for k, (img, title, cap, col) in enumerate([
        (b_base, "1. TODAY (flat green + shadow)",
         f"the WITHDRAWN long grass: {M['bladeTuftOutlineSpread']['deliveredPxMedian']} px median "
         f"per mark, {V['currentBudget']['total']} marks", WARN),
        (b_relief, "2. + GROUND MICRO-RELIEF",
         f"same marks, same count. Frequency in the LIGHT: land luma p2-p98 "
         f"{R['baselineShadowOnly']['lumaP2toP98']} -> {R['plusRelief']['lumaP2toP98']}, but "
         f"distinct levels UNCHANGED at {R['plusRelief']['distinctLumaLevels']} — and it costs "
         f"+{PC['reliefCostsOverShadowOnly']} palette entries", WARN),
        (b_species, "3. + SILHOUETTE VARIETY",
         f"four species, same count, +{PC['silhouetteVarietyCostsInPaletteEntries']} palette "
         f"entries: aspect spread {M['bladeTuftOutlineSpread']['aspectSpread']}x -> "
         f"{M['speciesOutlineSpread']['aspectSpread']}x, median mark "
         f"{M['bladeTuftOutlineSpread']['deliveredPxMedian']} -> "
         f"{M['speciesOutlineSpread']['deliveredPxMedian']} px", GOOD),
        (b_both, "4. BOTH",
         f"land luma p2-p98 {R['plusBothLandOnly']['lumaP2toP98']}; "
         f"{V['deliveredPxSpeciesSet']} vegetation px "
         f"(was {V['deliveredPxBladeSet']})", GOOD)]):
    cx = PAD + k * (IW + PAD)
    im1.paste(img, (cx, T1))
    CH.caption(dr1, cx, T1 + IH + 6, [(title, INK), (cap, col)], IW)
CH.caption(dr1, PAD, T1 + IH + 58, [
    (f"THE TWO OPTIONS ARE NOT PRICED ALIKE, and that is the clearest thing this sheet has to say. "
     f"SILHOUETTE VARIETY is nearly free: the four species reuse the existing token family at the "
     f"existing shade levels, so the palette does not move at all "
     f"({PC['silhouetteVarietyCostsInPaletteEntries']} entries), the plant count does not move, and "
     f"the median delivered mark goes {M['bladeTuftOutlineSpread']['deliveredPxMedian']} -> "
     f"{M['speciesOutlineSpread']['deliveredPxMedian']} px with the outline spread going "
     f"{M['bladeTuftOutlineSpread']['aspectSpread']}x -> "
     f"{M['speciesOutlineSpread']['aspectSpread']}x. MICRO-RELIEF is expensive and small: the "
     f"dressed shipped palette is {PC['shippedDressedEntries']} entries, the shadow already took it "
     f"to {PC['entries']['shadowOnly']}, and relief takes it to {PC['entries']['joint']} — "
     f"+{PC['reliefCostsOverShadowOnly']} more — to buy "
     f"+{round(R['plusRelief']['lumaP2toP98'] - R['baselineShadowOnly']['lumaP2toP98'], 1)} points "
     f"of land luma range and NO additional distinct luminance levels.", DIM),
    ("NOT OWNER-ATTESTED. Whether any of this reads right is the owner's look, and this picture has "
     "no standing to make it. An honest \"none of these helped\" is an accepted outcome (ADR-0280 D4).",
     WARN),
], im1.size[0] - 2 * PAD)
im1.save(os.path.join(OUT, "high-frequency-options.png"))

# ---- 2. JUDGE THE ART HERE: 6x detail ----------------------------------------------------------------
Z = 6
CW, CH_ = 92, 62
#: WHERE THE CROP GOES IS PART OF THE DELIVERABLE, because this is the panel the appearance call gets
#: made on. Centring it on the island's centroid — the obvious choice, and the one a first version
#: made — lands it squarely on the hero tree's trunk and roots, so the owner is handed a close-up of
#: bark to judge ground cover with. It is chosen instead by SLIDING the window to where the
#: VEGETATION is: the plant mask is the difference between the dressed composite and the identical
#: plant-less land, so it is derived from delivered pixels rather than from placement coordinates,
#: and the tree is excluded because the tree is in BOTH rasters and therefore differences nowhere.
#: AND THE TREE HAS TO BE EXCLUDED EXPLICITLY, which a second attempt learned the hard way: plants are
#: DENSEST near the island centre, so "most vegetation" put the window under the canopy and delivered
#: a close-up of the crown. The tree mask is the difference between the with-tree board and the
#: identical tree-less one, so it is the sprite's own delivered footprint rather than a guess at its
#: extent, and the window must contain NONE of it.
_veg = (B_BOTH_BARE[:, :, :3] != LAND_JOINT[:, :, :3]).any(axis=2) & S_BOTH_BARE & LJ_SOLID
_tree = (np.array(B_BOTH)[:, :, :3] != B_BOTH_BARE[:, :, :3]).any(axis=2)


def _integral_of(mask):
    return np.cumsum(np.cumsum(mask.astype(np.int32), axis=0), axis=1)


def _window(intg, y, x):
    y1, x1 = y + CH_ - 1, x + CW - 1
    tot = intg[y1, x1]
    if y > 0:
        tot -= intg[y - 1, x1]
    if x > 0:
        tot -= intg[y1, x - 1]
    if y > 0 and x > 0:
        tot += intg[y - 1, x - 1]
    return int(tot)


_IV, _IT = _integral_of(_veg), _integral_of(_tree)
#: Lexicographic: no tree at all first, then as much vegetation as possible. The fallback keeps this
#: total rather than letting a crop be undefined if the tree ever covers every candidate window.
_best, x0, y0 = (10 ** 9, -1), 0, 0
for _y in range(0, C.CANVAS_H - CH_ + 1, 2):
    for _x in range(0, C.CANVAS_W - CW + 1, 2):
        _score = (_window(_IT, _y, _x), -_window(_IV, _y, _x))
        if _score < _best:
            _best, y0, x0 = _score, _y, _x
REPORT["detailCrop"] = {"x": int(x0), "y": int(y0), "w": CW, "h": CH_,
                        "vegetationPxInCrop": int(-_best[1]), "treePxInCrop": int(_best[0]),
                        "rule": "the window containing NO hero-tree pixel that holds the most "
                                "DELIVERED vegetation — the panel the appearance call is made on has "
                                "to show plants, not bark"}
zoom = [(t, im.crop((x0, y0, x0 + CW, y0 + CH_)).resize((CW * Z, CH_ * Z), Image.NEAREST))
        for t, im in [("1. TODAY", b_base), ("2. + RELIEF", b_relief),
                      ("3. + SPECIES", b_species), ("4. BOTH", b_both)]]
im2, dr2, T2 = CH.sheet(PAD + len(zoom) * (CW * Z + PAD), HDR + CH_ * Z + CAP + 40,
                        "JUDGE THE ART HERE — the same crop at 6x, nearest-neighbour",
                        "Every block is ONE delivered pixel. In panel 2 the ground's variation is a "
                        "LIGHT DIRECTION on perturbed geometry, never a second green — the owner "
                        "rejected hash-picked greens as noise and relief must not rebuild them. In "
                        "panel 3 the four outlines are dome / spire / spreader / pair; the pair's "
                        "GAP is the one cue that is topological rather than metric and so is the one "
                        "that survives any downsample that keeps the mark at all.",
                        CAM)
for k, (t, img) in enumerate(zoom):
    cx = PAD + k * (CW * Z + PAD)
    im2.paste(img, (cx, T2))
    dr2.text((cx, T2 + CH_ * Z + 6), t, fill=(GOOD if k == 3 else (WARN if k == 0 else HI)))
CH.caption(dr2, PAD, T2 + CH_ * Z + 24, [
    (f"delivered px per mark: {V['deliveredPxPerMarkBlade']} on the withdrawn blade set, "
     f"{V['deliveredPxPerMarkSpecies']} on the species set, over the same "
     f"{V['currentBudget']['total']} placements.", DIM),
], im2.size[0] - 2 * PAD)
im2.save(os.path.join(OUT, "high-frequency-detail-6x.png"))

# ---- 3. THE PALETTE QUESTION -------------------------------------------------------------------------
b_ship = CH.board(B_RELIEF_SHIPPED)
b_shad = CH.board(B_RELIEF_SHADOWPAL)
b_joint = CH.board(B_BOTH_BARE)
b_coarse = CH.board(B_COARSE)


def _rungs(key):
    d = REPORT["survivesTheSnap"][key]
    got = sorted(k.replace("light-", "") for k in d
                 if k.startswith("light-") and k != "light-1" and d[k] > 0)
    tot = sum(v for k, v in d.items() if k.startswith("light-") and k != "light-1")
    return "NONE — every relief level quantised away" if not got else f"{len(got)} levels, {tot} px"


im3, dr3, T3 = CH.sheet(PAD + 3 * (IW + PAD), HDR + IH + CAP + 96,
                        "A SHADOW ONLY EXISTS IF THE PALETTE HOLDS IT — and so does relief",
                        "The SAME light field on all three panels; the only difference is how many "
                        "entries the closed palette holds. The land's palette is closed by "
                        "construction — every colour it may emit is an authored token times an "
                        "authored shade — so `snap` clamps anything else to the nearest entry it "
                        "HOLDS. Micro-relief spends the same currency the shadow does, and the "
                        "question the increment asks is whether it is one spend for two payoffs.",
                        CAM)
for k, (img, title, cap, col) in enumerate([
        (b_ship, f"shipped dressed palette ({PC['shippedDressedEntries']})",
         _rungs("shippedDressedPalette"), WARN),
        (b_shad, f"closed over the SHADOW ladder ({PC['entries']['shadowOnly']})",
         _rungs("shadowOnlyPalette"), DIM),
        (b_joint, f"closed over BOTH ({PC['entries']['joint']})",
         _rungs("jointPalette"), GOOD)]):
    cx = PAD + k * (IW + PAD)
    im3.paste(img, (cx, T3))
    CH.caption(dr3, cx, T3 + IH + 6, [(title, INK), (cap, col)], IW)
CH.caption(dr3, PAD, T3 + IH + 46, [
    (f"The relief ladder is {list(RELIEF_LEVELS)} — SHALLOWER and finer than the shadow's "
     f"{list(SHADOW_LEVELS)}, and that is the finding rather than a preference. A shadow is one "
     f"low-frequency gradient and can afford a deep rung; relief is high-frequency and a rung that "
     f"deep delivers as dark speckle, which is the noise the owner rejected wearing luminance "
     f"instead of hue. The two ladders MULTIPLY where they overlap, so the honest closure is over "
     f"the {len(JOINT_LEVELS)} products and not the union of {len(SHADOW_LEVELS)} + "
     f"{len(RELIEF_LEVELS)}.", DIM),
    (f"WHAT A VISIBLE SHADOW IS WORTH IN PALETTE ENTRIES IS AN OWNER DECISION under ADR-0145, and "
     f"so is what relief is worth. This picture prices it; it does not spend it.", WARN),
], im3.size[0] - 2 * PAD)
im3.save(os.path.join(OUT, "relief-survives-the-snap.png"))

# ---- 4. THE COUNT FORK -------------------------------------------------------------------------------
im4, dr4, T4 = CH.sheet(PAD + 2 * (IW + PAD), HDR + IH + CAP + 150,
                        "THE COUNT, AS A FORK — shown, not decided",
                        "`grass = round(2 + tests*1.9)` has NO AREA TERM, so a small parcel gets a "
                        "full-size budget. Correlation of density against log owned-area is -0.93 "
                        "over a 29.5x spread, and conditioning on capability collapses the gradient "
                        "2.28x -> 0.93x, so it lives BETWEEN parcels rather than inside them. Both "
                        "panels are the same island, the same species set and the same light.",
                        CAM)
_ov = REPORT["countFork"]["overloadedCapabilitiesUnderCurrentRule"]
for k, (img, title, cap, col) in enumerate([
        (b_both, f"A. current budget ({REPORT['countFork']['totalCurrent']} marks)",
         (f"capability {_ov[0]} is budgeted "
          f"{[r for r in FORK_ROWS if r['cap'] == _ov[0]][0]['currentBudget']} plants on ground that "
          f"holds {[r for r in FORK_ROWS if r['cap'] == _ov[0]][0]['capacityAtShrubFootprint']:.0f}"
          if _ov else "no capability is over capacity on this island"), WARN),
        (b_area, f"B. area-aware budget ({REPORT['countFork']['totalAreaAware']} marks)",
         f"the same rule capped at each parcel's own capacity", HI)]):
    cx = PAD + k * (IW + PAD)
    im4.paste(img, (cx, T4))
    CH.caption(dr4, cx, T4 + IH + 6, [(title, INK), (cap, col)], IW)
CH.caption(dr4, PAD, T4 + IH + 46, [
    (f"WHAT B COSTS: the current rule is monotone in test count BY CONSTRUCTION — more tests always "
     f"means more plants, which is what makes vegetation READABLE as a test count (ADR-0226 D2). "
     f"Capping at capacity breaks that in "
     f"{len(REPORT['countFork']['monotonicityBreaksAreaAware'])} ordered pairs on this island "
     f"(current rule: {len(REPORT['countFork']['monotonicityBreaksCurrent'])}), i.e. a "
     f"more-tested capability on a small parcel can end up showing FEWER plants than a less-tested "
     f"one on a large parcel. A reader counting vegetation would then read the test counts in the "
     f"wrong order.", DIM),
    ("THIS IS A FORK AND NOT A RECOMMENDATION. Changing the count rule is an ADR-0226 D2 semantic "
     "change and is the owner's, not this pass's. Both are drawn; neither is preferred here.", WARN),
], im4.size[0] - 2 * PAD)
im4.save(os.path.join(OUT, "count-fork.png"))

# ---- 5. THE RELIEF FREQUENCY FORK --------------------------------------------------------------------
zoom2 = [(t, im.crop((x0, y0, x0 + CW, y0 + CH_)).resize((CW * Z, CH_ * Z), Image.NEAREST))
         for t, im in [("no relief", CH.board(LAND_SHADOW)),
                       ("COARSE (14 / 7 units)", b_coarse),
                       ("FINE (7 / 3.5 units) — DELIVERED", b_joint)]]
im5, dr5, T5 = CH.sheet(PAD + len(zoom2) * (CW * Z + PAD), HDR + CH_ * Z + CAP + 40,
                        "HOW HIGH CAN THE FREQUENCY GO — the band, at 6x",
                        "The relief noise is BAND-LIMITED and the band is the whole decision. A "
                        "ground unit is ~1.05 delivered px here, so a wavelength in units is a "
                        "wavelength in pixels. Below the FINE band a half-cycle is under one "
                        "delivered pixel and the field becomes per-pixel noise — which is the thing "
                        "being avoided, so it is the technique's floor rather than a setting to keep "
                        "turning.",
                        CAM)
for k, (t, img) in enumerate(zoom2):
    cx = PAD + k * (CW * Z + PAD)
    im5.paste(img, (cx, T5))
    dr5.text((cx, T5 + CH_ * Z + 6), t, fill=(GOOD if k == 2 else DIM))
CH.caption(dr5, PAD, T5 + CH_ * Z + 24, [
    (f"luma p2-p98 over the cell bodies: no relief {R['baselineShadowOnly']['lumaP2toP98']}, "
     f"coarse {R['reliefCoarse']['lumaP2toP98']}, fine {R['plusRelief']['lumaP2toP98']}. The "
     f"flattening that removed the hash-picked greens took this number 78.9 -> 58.2 and the shadow "
     f"re-spent it to 61.6; what relief adds on top is the range this picture is asking the owner "
     f"to approve.", DIM),
], im5.size[0] - 2 * PAD)
im5.save(os.path.join(OUT, "relief-frequency-fork.png"))


# =====================================================================================================
# 9. PROVENANCE — one code state, sidecar-enforced
# =====================================================================================================
REPORT["fence"] = {
    "diffScope": "docs/research/** only",
    "cameraElevationDeg": C.ELEV,
    "appLandCameraElevationDeg": 20,
    "appLandCameraTouched": False,
    "blenderRendersThisPass": 4,
    "samples": SAMPLES_DECLARED,
    "scatterPyEdited": False,
    "positioner": "chapter2-plant-dispersion-2026-08-17/disperse.py, IMPORTED (not vendored)",
}
REPORT["inputs"] = {
    "island": os.path.relpath(CH.ISLAND_PATH, REPO).replace("\\", "/"),
    "storyId": P.STORY_ID,
    "bladePieces": os.path.relpath(BLADE_PIECES, REPO).replace("\\", "/"),
    "speciesPieces": os.path.relpath(SPECIES_PIECES, REPO).replace("\\", "/"),
}

with open(os.path.join(OUT, "options-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

#: `CH.INPUTS` is a LIST of per-directory records (`compose.piece_inputs`), not a mapping — one
#: record per piece directory, each with its own declared code state and a hash per PNG. The species
#: set is appended through the SAME function rather than hand-shaped, so its record carries the same
#: per-piece hashes every other directory's does.
_species_meta = json.load(open(os.path.join(SPECIES_PIECES, "render-meta.json")))
_inputs = list(CH.INPUTS) + C.piece_inputs([("pieces-species", SPECIES_PIECES)])

for pic in ("high-frequency-options.png", "high-frequency-detail-6x.png",
            "relief-survives-the-snap.png", "count-fork.png", "relief-frequency-fork.png"):
    provenance.write_sidecar(
        os.path.join(OUT, pic), __file__, sys.argv[1:], _inputs, CH.CODE_STATE,
        extra={"pass": "chapter2-high-frequency-options-2026-08-17",
               "speciesGenerator": _species_meta["code_state"],
               "cameraElevationDeg": C.ELEV,
               "samples": SAMPLES_DECLARED,
               "positioner": "disperse.scatter_dispersed (the CRC32 fix), imported",
               "corrUV": DISP["currentBudget"]["corrUV"],
               "paletteEntries": int(len(PALETTE_MAIN)),
               "island": {"sha256": provenance.sha256_file(CH.ISLAND_PATH)},
               "proof": {"sha256": provenance.sha256_file(CH.PROOF_PATH)}})

print("\nDONE — 5 pictures + options-report.json + 5 sidecars -> %s" % OUT)
print("  OPEN THIS ONE: high-frequency-options.png")
print("  luma p2-p98:  %s (today) -> %s (+relief) -> %s (both)"
      % (R["baselineShadowOnly"]["lumaP2toP98"], R["plusRelief"]["lumaP2toP98"],
         R["plusBothLandOnly"]["lumaP2toP98"]))
print("  palette:      %d shipped(dressed) -> %d shadow -> %d joint (+%d for relief)"
      % (PC["shippedDressedEntries"], PC["entries"]["shadowOnly"], PC["entries"]["joint"],
         PC["reliefCostsOverShadowOnly"]))
print("  corr(u,v):    %s   (unfixed sampler: +0.9997)" % DISP["currentBudget"]["corrUV"])
print("  LAND_CAMERA_ELEVATION_DEG is untouched and still 20.")
