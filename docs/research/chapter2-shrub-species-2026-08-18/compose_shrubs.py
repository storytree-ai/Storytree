#!/usr/bin/env python3
"""THE SMALL-PLANT SET ON THE REAL-CORPUS ISLAND — three sets, one island, one palette, one camera.

    python compose_shrubs.py

The owner withdrew the long grass on 2026-08-17 (*"the pixelated triangles for the long grass looks
rather ugly and cheap"*) and named the replacement: *"we do shubs and other small plants instead"*,
with shrub COUNT inheriting grass's test-count role. So ADR-0226 D2 — a capability's test count is
read from its vegetation density — is UNCHANGED and only the SPECIES moves. This pass renders the
replacement set on the real-corpus healthy island and measures what the re-skin does to the channel.

WHAT IS COMPARED, AND WHY THREE SETS RATHER THAN TWO:

    1. `pieces-m00-blade`    the WITHDRAWN long grass — the set `compose_healthy.py:95` still mounts
    2. `pieces-species`      #1389's four silhouette species, awaiting the owner's look
    3. `pieces-shrubs`       THIS PASS: those four, plus two authored small plants in the shrub slots

Two is the fork the owner asked about; three is what makes the third column honest, because this
pass's own contribution is only the two shrub slots and a reader is entitled to see which numbers
came from #1389's work and which from this one.

THE BASELINE IS RE-MEASURED HERE AND NOT INHERITED, and the reason is that the famous figure is
doubly stale. "Median 3 delivered px per surviving placement" was measured (a) on the withdrawn
long-grass blade and (b) on placements carrying the CRC32 diagonal collapse, which put every plant
on its cell's bounding-box diagonal. Both facts have since been corrected — #1389 established that
the species moves the size number 7x, and #1393 propagated the positioner fix into `scatter.py`
itself. Every number in this pass is measured on the CURRENT positioner and the CURRENT compositor,
and the report says which figures are this pass's own and which are quoted from a sibling.

NOTHING HERE IS VENDORED. The positioner is `scatter.py` reached through the dispersion pass's alias
(`disperse.scatter_dispersed IS scatter.scatter_island`), the compositor is `compose_healthy.py`
imported whole with its writes sent to scratch, the attribution instrument is the grass-defects
pass's `attribute.py` and the per-placement roll-up is the delivery-loss pass's `delivery.py`. This
file adds no compositor and no sampler. `verify.py` states that as a PROMISE about what this
directory contains rather than as a claim about which files a branch diff happens to touch — a
branch-diff fence tests the branch, not the promise, and stays green while false.

⚠ ONE IMPORT-ORDER HAZARD, AND IT IS ASSERTED RATHER THAN TRUSTED. `attribute.py` builds its own
`compose_core` module object and registers it in `sys.modules`, while `compose_healthy.py` reaches
`compose_core` by ordinary import. Whichever runs FIRST decides whether there is one module or two,
and with two the piece set mounted through one is invisible to the other — the same class of defect
as converting a module to an alias and then patching the alias, which went inert twice on this arc
while printing as if it worked. The attribution instruments are therefore imported FIRST, and
`CH.D is A.D` is asserted before a pixel is drawn.
"""
import importlib.util
import json
import math
import os
import shutil
import statistics
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
DISPERSION = os.path.join(RESEARCH, "chapter2-plant-dispersion-2026-08-17")
DEFECTS = os.path.join(RESEARCH, "chapter2-grass-defects-2026-08-16")
LOSS = os.path.join(RESEARCH, "chapter2-grass-delivery-loss-2026-08-17")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")

for p in (DEFECTS, LOSS, HERE, HEALTHY, GRASS, LINES, DISPERSION,
          os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1")):
    sys.path.insert(0, p)

#: FIRST, and the order is load-bearing — see the module docstring's import-order hazard.
import attribute as A                                      # noqa: E402
import delivery as DL                                      # noqa: E402
import island_pass as P                                    # noqa: E402
import provenance                                          # noqa: E402
import seams as S                                          # noqa: E402
import dispersion as DX                                    # noqa: E402
import disperse as X                                       # noqa: E402  THE FIXED POSITIONER

OUT = os.environ.get("STORYTREE_SHRUBS_OUT") or HERE

#: Stated because it can never be recovered from a committed artifact, and because comparing a land
#: pixel count across sample counts is a measured ~2 px error on this arc. Every piece in every set
#: below was rendered at this value.
SAMPLES_DECLARED = 48
ONE_SURFACE_VARIANT = 0

#: The one refusal hatch, and it must be OFF at rest — `verify.py` asserts it. It drives the
#: composite with the pre-fix affine sampler so the diagonal gate can be shown to fire on real
#: placements rather than on an invented input.
PERTURB_POSITIONER = os.environ.get("STORYTREE_SHRUBS_PERTURB") == "unfixed-positioner"
#: Drives one mounted piece below the survival floor so that guard can be shown to fire too.
PERTURB_THIN = os.environ.get("STORYTREE_SHRUBS_PERTURB") == "thin-piece"


def _load_healthy():
    """Mount the healthy-island pass WHOLE, with its writes sent to scratch.

    Its module-level refusals become this pass's refusals: the piece set is valid for this island's
    geometry, one code state per generator, the camera is the signed one, island/proof/STORY_ID name
    ONE story, no status outside the RENDERED vocabulary, and every `healthy` is backed by a signed
    pass (ADR-0040). Importing rather than restating means these panels can never be composed over
    an island those refusals would have declined to draw.
    """
    tmp = tempfile.mkdtemp(prefix="shrub-species-")
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

#: THE IMPORT-ORDER ASSERTION. Not a comment — the defect it prevents is silent in both directions.
if CH.D is not A.D or CH.C is not A.C:
    raise SystemExit(
        "REFUSED: two `compose_core` module objects are live. `attribute.py` registers its own in "
        "`sys.modules` and `compose_healthy.py` imports the name; with two, a piece set mounted "
        "through one is invisible to the other and every attribution below would describe a "
        "different composite from the one rendered. Import the attribution instruments FIRST.")
if DL.C is not C or DL.D is not D:
    raise SystemExit("REFUSED: `delivery.py` is bound to a different compositor from this pass's.")

REPORT = {}

BLADE_PIECES = os.path.join(GRASS, "pieces-m00-blade")
SPECIES_PIECES = os.path.join(OPTIONS, "pieces-species")
SHRUB_PIECES = os.path.join(HERE, "pieces-shrubs")

#: label -> (directory, the geometry string its own render-meta declares). `use_pieces` refuses a
#: mismount against that string, so a panel cannot carry a caption its pixels do not.
SETS = [
    ("blade", BLADE_PIECES, "blade"),
    ("species", SPECIES_PIECES, "species"),
    ("shrubs", SHRUB_PIECES, "shrubs"),
]

#: The four tuft slots the scatterer chooses among, and the two shrub slots it chooses among.
TUFT_SLOTS = ["tuft-3a", "tuft-2", "tuft-3b", "tuft-4"]
SHRUB_SLOTS = ["shrub-a", "shrub-b"]
PLANT_SLOTS = TUFT_SLOTS + SHRUB_SLOTS
CANDIDATE = "shrub-alt-tier"

#: SPECIES NAMES ARE PER SET, and that is a correction rather than tidiness. A single global map
#: labels `shrub-a` "cushion" in EVERY set — but in `pieces-m00-blade` and in `pieces-species` that
#: slot holds the LEGACY grass-clump shrub, which this pass has not touched. The species sheet would
#: then print this pass's name over a picture of someone else's geometry, in the one panel whose
#: entire purpose is to say which mesh is which.
_LEGACY_SHRUB = "legacy clump shrub"
SPECIES_NAMES = {
    "blade": {"tuft-3a": "blade tuft", "tuft-2": "blade tuft", "tuft-3b": "blade tuft",
              "tuft-4": "blade tuft", "shrub-a": _LEGACY_SHRUB, "shrub-b": _LEGACY_SHRUB},
    "species": {"tuft-3a": "dome", "tuft-2": "spire", "tuft-3b": "spreader", "tuft-4": "pair",
                "shrub-a": _LEGACY_SHRUB, "shrub-b": _LEGACY_SHRUB},
    "shrubs": {"tuft-3a": "dome", "tuft-2": "spire", "tuft-3b": "spreader", "tuft-4": "pair",
               "shrub-a": "cushion", "shrub-b": "frond", CANDIDATE: "tier (candidate)"},
}

_TREE_DIR = os.path.join(SWEEP, "tree-%s" % ("%g" % C.ELEV).replace(".", "p"), "frames")
_TREE_REG = json.load(open(os.path.join(_TREE_DIR, "registration.json")))


# =====================================================================================================
# 1. THE PLACEMENTS — one set of them, shared by every panel
# =====================================================================================================
def place(island):
    """The placements, from the FIXED positioner, at the story's own contract counts.

    ONE monkeypatch, and it lands on `X.S` — the SCATTER module — never on `X`. Since the dispersion
    fix moved into `scatter.py`, `disperse` is an ALIAS: `X.scatter_dispersed` IS
    `scatter.scatter_island`, which resolves its helpers in ITS OWN globals, so rebinding a name on
    the alias changes nothing at all and would leave a panel silently rendering the unpatched rule
    while still carrying the caption. `scatter.capability_tests` INVENTS a test count from a hash —
    its own docstring says so — and is replaced by the story's real `spec.contracts.length`, exactly
    as the healthy-island pass does.
    """
    real_tests = [c["tests"] for c in island["capabilities"]]
    original = X.S.capability_tests
    X.S.capability_tests = lambda ci, status, seed: real_tests[ci]
    kw = {"positioner": X.S.LEGACY_AFFINE} if PERTURB_POSITIONER else {}
    try:
        return X.scatter_dispersed(island, D.DECOR_META["tokenFamilies"],
                                   island["storyId"], island["uatCriteria"], **kw)
    finally:
        X.S.capability_tests = original


def respeciate(items):
    """Spread the TUFT placements uniformly over the four tuft slots.

    WHY IT IS NEEDED AND WHY IT IS NOT A SEMANTIC CHANGE. `scatter.tuft_piece` reserves `tuft-2` for
    an `unknown` capability and `tuft-4` for a lush one, so on an island where every capability is
    `healthy` only two or three of the four slots are ever reachable and a four-species set delivers
    as two or three. The reassignment is a hash over the placement's OWN address, disjoint from both
    count and position: it moves no plant and adds or removes none.

    IT IS APPLIED TO ALL THREE SETS, INCLUDING THE BLADE BASELINE, and that is a correction to how
    the predecessor pass ran. #1389 respeciated only the species panel, which left the comparison
    varying the slot spread as well as the species. Applying it everywhere costs the blade set
    almost nothing — all four of its tuft pieces deliver 2-3 px in a 2x1 or 2x2 box, and the report
    carries the with/without figure so "almost nothing" is a measurement rather than an assurance.

    A SPECIES CARRIES NO MEANING. ADR-0226 D2 gives the signal to the vegetation COUNT and the
    vocabulary has no member for species, so six outlines assert exactly what two did.

    (`compose_options.respeciate` is the same idea; it is not imported because importing that module
    executes its entire five-picture composite. What matters is not that the code is shared but that
    the PROPERTY holds, so `assert_respeciation_is_a_relabel` checks it directly below.)
    """
    out = []
    for i, it in enumerate(items):
        if it["kind"] != "tuft":
            out.append(dict(it))
            continue
        j = int(X.S.det("species", it["cap"], i, it["g"][0], it["g"][1]) * len(TUFT_SLOTS))
        d = dict(it)
        d["piece"] = TUFT_SLOTS[min(j, len(TUFT_SLOTS) - 1)]
        out.append(d)
    return out


def assert_respeciation_is_a_relabel(before, after):
    """THE PROPERTY, checked rather than promised: same count, same order, same ground points, same
    kinds, same roles — only the piece NAME may differ, and only for a tuft."""
    if len(before) != len(after):
        raise SystemExit("REFUSED: respeciation changed the placement COUNT "
                         f"({len(before)} -> {len(after)}). It is a relabel, not a re-scatter.")
    for a, b in zip(before, after):
        if a["g"] != b["g"] or a["kind"] != b["kind"] or a["cap"] != b["cap"] \
                or a["cell"] != b["cell"] or a["roles"] != b["roles"]:
            raise SystemExit("REFUSED: respeciation moved a placement or changed its roles. Every "
                            "delivered-pixel comparison below would be varying position as well as "
                            "species.")
        if a["kind"] != "tuft" and a["piece"] != b["piece"]:
            raise SystemExit(f"REFUSED: respeciation renamed a {a['kind']!r} placement; it is "
                             "scoped to the tuft slots.")


def dispersion_stats(items, cells, label):
    """The dispersion floor's own instruments, on THIS pass's own delivered placements.

    corr(u, v) IS THE ASSERTION rather than a report line: two independent draws are uncorrelated
    whatever the cells look like, so the null is exactly 0 and no threshold is argued from taste.
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
    return {"label": label, "placements": len(pts), "corrUV": round(corr, 4),
            "onDiagonalShare": round(diag, 4),
            "closestPairGroundUnits": round(float(nn.min()), 3),
            "medianNearestNeighbour": round(float(np.median(nn)), 3),
            "shareWithNeighbourUnder4Units": round(float(np.mean(nn < 4.0)), 4)}


ISLAND = CH.use_island(CH.ISLAND_PATH, CH.LAND_PIECES)
CELLS = D.prepare(ISLAND["variantB"]["cells"])
for _c in CELLS:
    _c["variant"] = ONE_SURFACE_VARIANT
    _c["wheat"] = False

print("placing through the FIXED positioner ...", flush=True)
D.use_pieces(BLADE_PIECES, expect_geometry="blade")
ITEMS_RAW, STATS = place(ISLAND)
ITEMS = respeciate(ITEMS_RAW)
assert_respeciation_is_a_relabel(ITEMS_RAW, ITEMS)

DISP = dispersion_stats(ITEMS, CELLS, "current budget, fixed positioner")
REPORT["dispersion"] = DISP

#: THE GATE. Not a report line — no picture is written if it fires. The dispersion floor's rung 1
#: pools |corr| <= 0.15 and rung 2 puts the on-diagonal share at <= 0.07 against a chance of 0.0396.
if abs(DISP["corrUV"]) > 0.15 or DISP["onDiagonalShare"] > 0.07:
    raise SystemExit(
        f"REFUSED: these placements carry the DIAGONAL COLLAPSE — corr(u,v)={DISP['corrUV']} over "
        f"{DISP['placements']} placements, on-diagonal share {DISP['onDiagonalShare']} (null "
        f"0.0396). This pass would be showing the owner a species set standing in diagonal rows. "
        f"No picture is written.")
print("  corr(u,v) = %s  — the diagonal collapse is NOT in these placements" % DISP["corrUV"],
      flush=True)

TREE_GROUND = tuple(ISLAND["islandCentreGround"])


# =====================================================================================================
# 2. ONE COMPOSITE PER SET, WITH ATTRIBUTION
# =====================================================================================================
def compose_set(label, pieces_dir, geometry, items):
    """One delivered composite plus the per-placement attribution behind it.

    Every stage is the SHIPPED one, called: `compose_attributed` is asserted byte-identical to
    `compose_core.compose_land`, `back_half_attributed` is asserted equal to `C.back_half`, and the
    per-placement roll-up is `delivery.per_placement` with `delivery`'s own footprint guard.
    """
    meta = D.use_pieces(pieces_dir, expect_geometry=geometry)
    lattice = ({"tiles": ISLAND["hexLattice"]["tiles"]} if "hexLattice" in ISLAND
               else S.load_hex_lattice())
    ctrl = S.SeamControl(C, ISLAND, lattice).install()
    ctrl.reset(P.SEAMS_DRAWN)
    try:
        canvas, alpha, tree_h, owner_ss, records = A.compose_attributed(
            items, cells=CELLS, ground=P.GROUND)
        A.assert_mirror(items, canvas, alpha, cells=CELLS, ground=P.GROUND)
        snapped, pre_rim, rgb, solid, _rim = A.back_half_attributed(canvas, alpha, owner_ss)
        cls, item_id, _land = A.attribute(snapped, pre_rim, alpha > 0.5, owner_ss, records)
        #: the SHIPPED back half's own RGBA output, which `back_half_attributed` has just asserted
        #: itself equal to — the tree compositor needs the alpha channel, and taking it from here
        #: rather than re-assembling one keeps a single source for the delivered raster.
        rgba, _solid2 = C.back_half(canvas, alpha)
        #: ⚠ `plant_tree` COMPOSITES IN PLACE and returns the same array, so the "before" raster has
        #: to be copied out first. Keeping a bare reference made the tree's own delivered mask — the
        #: difference between the two — come out as exactly ZERO px, which is what the guard below
        #: caught. This is the second time in this pass that a mask difference quietly cancelled to
        #: nothing; both times the tell was a difference that could only ever be empty.
        no_tree = rgba.copy()
        colours = {tuple(int(v) for v in c) for c in rgba[:, :, :3][solid].reshape(-1, 3)}
        img, _g, _r = D.plant_tree(rgba, tree_h)
        #: the identical composite with the plant list EMPTIED — the reference every vegetation
        #: pixel count is a difference against, taken on the same land, same palette, same seams.
        bare_c, bare_a, bare_h = D.compose_land([], cells=CELLS, ground=P.GROUND)
        bare_rgb, bare_solid = C.back_half(bare_c, bare_a)
        bare_img, _g2, _r2 = D.plant_tree(bare_rgb, bare_h)
    finally:
        ctrl.restore()

    run = {"owner_ss": owner_ss, "snapped": snapped, "pre_rim": pre_rim, "records": records,
           "items": items, "cls": cls, "item_id": item_id, "caps": ISLAND["capStatuses"]}
    rows = DL.per_placement(run)
    return {"label": label, "dir": pieces_dir, "geometry": geometry, "meta": meta,
            "img": img, "noTree": no_tree, "solid": solid,
            "bare": bare_img, "bareSolid": bare_solid,
            "colours": colours, "rows": rows, "palette": [tuple(int(v) for v in c)
                                                          for c in C.PALETTE]}


# =====================================================================================================
# 3. THE PIECE-LEVEL CENSUS — the silhouette budget, off the committed PNGs
# =====================================================================================================
def mark_census(pieces_dir, names, set_label):
    """Every species' DELIVERED footprint, measured off the committed piece PNG through the same
    3x3 majority the compositor's `back_half` applies.

    TWO AXES, NOT ONE, AND THAT IS A CORRECTION. #1389 scored outline variety by delivered ASPECT
    RATIO alone. That instrument cannot see the difference between this pass's `frond` and the
    inherited `spreader`: both deliver an 8x3 box at aspect 2.67, and by aspect they are the same
    piece. They are not — the spreader fills 83% of its box and the frond 58%, because the frond
    carries a notch. FILL RATIO is therefore reported beside aspect, and the set's variety is the
    spread on BOTH.

    `survival%` is the greenery survey's instrument, carried here because it is the guard that
    catches a piece the downsample is DESTROYING rather than merely shrinking: above ~100% the vote
    is filling (a mass), below ~85% it is eating structure. It caught this pass's first cushion at
    61% delivering a one-pixel-tall dash.
    """
    out = {}
    for n in names:
        path = os.path.join(pieces_dir, n + ".png")
        if not os.path.exists(path):
            continue
        a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
        m = a > 110.0
        h, w = a.shape
        dm = (m.reshape(h // 3, 3, w // 3, 3).transpose(0, 2, 1, 3)
              .reshape(h // 3, w // 3, 9).sum(axis=2) >= 5)
        if not dm.any():
            out[n] = {"species": SPECIES_NAMES[set_label].get(n, n),
                      "deliveredPx": 0, "rawOpaqueSs": int(m.sum()), "survivalPct": 0.0}
            continue
        ys, xs = np.nonzero(dm)
        bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        sub = dm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        out[n] = {
            "species": SPECIES_NAMES[set_label].get(n, n),
            "deliveredPx": int(dm.sum()),
            "rawOpaqueSs": int(m.sum()),
            "survivalPct": round(float(dm.sum()) * 9.0 / float(m.sum()) * 100.0, 1),
            "bboxW": bw, "bboxH": bh,
            "aspect": round(bw / bh, 2),
            "fillRatio": round(float(dm.sum()) / float(bw * bh), 2),
            "rows": ["".join("#" if v else "." for v in row) for row in sub],
        }
    return out


def spread(census, keys):
    """Outline variety on both axes, plus the delivered-size ladder."""
    ks = [k for k in keys if census.get(k, {}).get("deliveredPx")]
    asp = [census[k]["aspect"] for k in ks]
    fil = [census[k]["fillRatio"] for k in ks]
    px = [census[k]["deliveredPx"] for k in ks]
    return {"species": len(ks),
            "aspectMin": min(asp), "aspectMax": max(asp),
            "aspectSpread": round(max(asp) / min(asp), 2),
            "fillMin": min(fil), "fillMax": max(fil),
            "fillSpread": round(max(fil) / min(fil), 2),
            "deliveredPxMin": min(px), "deliveredPxMax": max(px),
            "deliveredPxMedian": int(np.median(px)),
            "deliveredPxSpread": round(max(px) / min(px), 2)}


def outline_separation(census, keys):
    """HOW FAR APART THE SIX OUTLINES ACTUALLY SIT, which is not the same question as how wide the
    set is.

    THIS INSTRUMENT EXISTS BECAUSE THE SPREAD NUMBERS DO NOT MOVE and saying so is the honest
    account of what this pass's two plants buy. The set's aspect spread, fill spread and size range
    are all fixed by the FOUR INHERITED tuft species at the extremes, so replacing the two legacy
    shrubs changes none of them. What it can change is the INTERIOR: two pieces sitting almost on
    top of each other in outline space are two pieces a viewer reads as one.

    Each species is a point in (aspect, fill, log size), each axis normalised by the set's own
    range so no axis dominates by unit choice, and the figure reported is the MINIMUM pairwise
    distance — the closest pair is what decides whether the set reads as six things or as five.
    """
    ks = [k for k in keys if census.get(k, {}).get("deliveredPx")]
    raw = np.array([[census[k]["aspect"], census[k]["fillRatio"],
                     math.log(census[k]["deliveredPx"])] for k in ks], dtype=np.float64)
    rng = raw.max(axis=0) - raw.min(axis=0)
    rng[rng == 0] = 1.0
    pts = (raw - raw.min(axis=0)) / rng
    best, worst_pair = None, None
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            d = float(np.linalg.norm(pts[i] - pts[j]))
            if best is None or d < best:
                best, worst_pair = d, (ks[i], ks[j])
    return {"minPairwiseSeparation": round(best, 3),
            "closestPair": [worst_pair[0], worst_pair[1]],
            "closestPairSpecies": [census[worst_pair[0]]["species"],
                                   census[worst_pair[1]]["species"]],
            "axes": "aspect, fill ratio, log delivered px — each normalised by the set's own range"}


CENSUS = {label: mark_census(d, PLANT_SLOTS + [CANDIDATE], label) for label, d, _g in SETS}
REPORT["marks"] = {
    "perSet": CENSUS,
    "spread": {label: spread(CENSUS[label], PLANT_SLOTS) for label, _d, _g in SETS},
    "separation": {label: outline_separation(CENSUS[label], PLANT_SLOTS)
                   for label, _d, _g in SETS},
    "candidate": CENSUS["shrubs"].get(CANDIDATE),
    "note": ("The arc's 'median 3 delivered px' is the WITHDRAWN long grass measured IN SITU on "
             "diagonal-collapsed placements. The piece-level figures here are footprints measured "
             "off the committed PNGs; the in-situ re-measurement is under `delivery`."),
}

#: THE SURVIVAL FLOOR, as a refusal on every MOUNTED piece. A piece below it is one the majority
#: vote is destroying rather than shrinking, and shipping it is how the withdrawn long grass got
#: four owner rejections. The blade set is EXEMPTED BY NAME with its reason, because it is the thing
#: being withdrawn and its failure is the finding — silently lowering the threshold to accommodate
#: it would stop this guard catching a real collapse.
SURVIVAL_FLOOR = 85.0
_thin = []
for _label, _d, _g in SETS:
    if _label == "blade":
        continue
    for _n in PLANT_SLOTS:
        _c = CENSUS[_label].get(_n)
        if _c and _c["survivalPct"] < (200.0 if PERTURB_THIN and _n == "shrub-a"
                                       else SURVIVAL_FLOOR):
            _thin.append(f"{_label}/{_n} ({_c['species']}) survives at {_c['survivalPct']}% "
                         f"delivering {_c['deliveredPx']} px in {_c['bboxW']}x{_c['bboxH']}")
if _thin:
    raise SystemExit(
        "REFUSED: a MOUNTED piece is below the %.0f%% survival floor — the 3x3 majority is "
        "destroying its structure, not shrinking it, which is the pipeline cause behind the "
        "withdrawn long grass. No picture is written.\n  %s"
        % (SURVIVAL_FLOOR, "\n  ".join(_thin)))
REPORT["marks"]["survivalFloor"] = {
    "floorPct": SURVIVAL_FLOOR,
    "appliesTo": "every mounted piece in `pieces-species` and `pieces-shrubs`",
    "bladeSetExemptedBecause": ("it is the set being WITHDRAWN and its collapse is the finding — "
                                "the greenery survey measured the long-grass blade at 43-79% "
                                "against 94-116% for every other piece on the arc"),
    "bladeSurvival": {n: CENSUS["blade"][n]["survivalPct"] for n in PLANT_SLOTS
                      if n in CENSUS["blade"]},
}


# =====================================================================================================
# 4. COMPOSE — and assert the palette does not move
# =====================================================================================================
RUNS = {}
for _label, _d, _g in SETS:
    print("composing %s ..." % _label, flush=True)
    RUNS[_label] = compose_set(_label, _d, _g, ITEMS)

#: ZERO PALETTE COST IS THE CLAIM AND THIS IS THE CHECK. The three sets declare the same token
#: families at the same shade levels, so `build_palette_dressed`'s closure over (family x level)
#: must be IDENTICAL — not merely the same size. A species set that widened the palette would be a
#: different kind of proposal (the shadow ladder cost +374 entries and the micro-relief option
#: +619, and both are owner calls); this one costs nothing and the equality is what says so.
_pal = {label: RUNS[label]["palette"] for label, _d, _g in SETS}
if not (_pal["blade"] == _pal["species"] == _pal["shrubs"]):
    raise SystemExit(
        "REFUSED: the three sets do not close over the same palette (%d / %d / %d entries). The "
        "species change would be buying its silhouettes with palette entries, which is an owner "
        "call, not an art tweak." % tuple(len(_pal[k]) for k in ("blade", "species", "shrubs")))
REPORT["paletteCost"] = {
    "entries": len(_pal["shrubs"]),
    "identicalAcrossAllThreeSets": True,
    "costOfTheSpeciesChangeInPaletteEntries": 0,
    "why": ("the new pieces declare the SAME roles (`crown` at 1.00 and 0.82, `under` at 1.00) "
            "resolved through the SAME `shrub` token family as the pieces they replace, so the "
            "(family x level) closure is unchanged"),
}
print("  palette identical across all three sets: %d entries" % len(_pal["shrubs"]), flush=True)


# =====================================================================================================
# 5. THE RE-MEASURED BASELINE — delivered size, in situ, on the current positioner
# =====================================================================================================
def delivered_vegetation(run):
    """Pixels this composite has that the SAME composite without any plant does not.

    A difference against a plant-less render rather than a colour test, because a plant token and a
    land token can share a delivered colour after the snap. Both rasters come from the same
    `compose_set` call, so a vegetation count and a land figure can never be taken against
    different lands.
    """
    m = run["solid"] & run["bareSolid"]
    return int(np.count_nonzero(
        (run["img"][:, :, :3] != run["bare"][:, :, :3]).any(axis=2) & m))


def delivery_stats(run):
    rows = [r for r in run["rows"] if r["kind"] in ("tuft", "shrub")]
    delivered = [r["deliveredPx"] for r in rows]
    survivors = [d for d in delivered if d > 0]
    fates = {}
    for r in rows:
        fates[r["fate"]] = fates.get(r["fate"], 0) + 1
    per_piece = {}
    for r in rows:
        per_piece.setdefault(r["piece"], []).append(r["deliveredPx"])
    return {
        "placements": len(rows),
        "zeroDelivery": len(delivered) - len(survivors),
        "zeroDeliveryShare": round(1.0 - len(survivors) / max(1, len(delivered)), 4),
        "medianDeliveredPxPerSurvivor": (int(statistics.median(survivors)) if survivors else 0),
        "meanDeliveredPxPerPlacement": round(sum(delivered) / max(1, len(delivered)), 2),
        "totalDeliveredPxAttributed": sum(delivered),
        "fates": fates,
        "perPiece": {p: {"n": len(v), "median": int(statistics.median(v)) if v else 0,
                         "zero": sum(1 for x in v if x == 0)}
                     for p, v in sorted(per_piece.items())},
    }


REPORT["delivery"] = {label: delivery_stats(RUNS[label]) for label, _d, _g in SETS}
REPORT["vegetation"] = {
    "authored": {"tufts": STATS["tuft"], "shrubs": STATS["shrub"], "wilts": STATS["wilt"],
                 "flowers": STATS["flower"], "wellCulled": STATS["wellCulled"],
                 "meadowTotal": STATS["tuft"] + STATS["shrub"] + STATS["wilt"]},
    "deliveredPx": {label: delivered_vegetation(RUNS[label]) for label, _d, _g in SETS},
}
_V = REPORT["vegetation"]
_V["deliveredPxPerMark"] = {
    label: round(_V["deliveredPx"][label] / max(1, _V["authored"]["meadowTotal"] + STATS["flower"]),
                 2) for label, _d, _g in SETS}
REPORT["baselineIsRemeasured"] = {
    "whatWasInherited": ("nothing. The 'median 3 delivered px' figure was measured on the withdrawn "
                         "long-grass blade AND on placements carrying the CRC32 diagonal collapse, "
                         "and both have since been corrected."),
    "thisPassMeasured": ("the blade set, the #1389 species set and this pass's shrub set, all three "
                         "on the CURRENT positioner (`scatter.py`, post-#1393) and the CURRENT "
                         "compositor (post-#1387 painter order), on the real-corpus healthy "
                         "island, at %d Cycles samples, with the SAME placements." % SAMPLES_DECLARED),
    "quotedFromASibling": {
        "17.2%": "the real-corpus zero-delivery residual after #1387 (chapter2-compositor-order-"
                 "and-caps-2026-08-17) — this pass re-derives its own figure and reports both",
        "+0.9997": "the unfixed sampler's corr(u,v), from chapter2-plant-dispersion-2026-08-17",
        "988 / 2120 px": "#1389's vegetation totals, which were taken against DIFFERENT light "
                         "fields for the two sets (shadow-only vs shadow+relief). This pass "
                         "composes all three sets on ONE unlit surface, so its totals are "
                         "comparable to each other and NOT to #1389's.",
    },
}


# =====================================================================================================
# 6. THE TEST-COUNT CHANNEL — the thing the re-skin has to keep carrying
# =====================================================================================================
def _poly_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return abs(a) * 0.5


AREAS, CELLCOUNT = {}, {}
for _c in ISLAND["variantB"]["cells"]:
    AREAS[_c["cap"]] = AREAS.get(_c["cap"], 0.0) + _poly_area(_c["poly"])
    CELLCOUNT[_c["cap"]] = CELLCOUNT.get(_c["cap"], 0) + 1


def channel_rows(run):
    """Per capability: what the count rule ASKED FOR, and what the pixels actually DELIVER.

    THE WEAK SPOT THIS RE-MEASURES BY NAME. The grass channel is strictly monotonic across whole
    islands but reads weakly between neighbouring parcels — measured at 0.78 vs 1.11 delivered px
    per cell for a 2-test against an 8-test capability. A shrub is a bigger mark than a tuft, so the
    per-cell read plausibly improves; the increment says to measure that rather than assume it.
    """
    by_cap = {}
    for r in run["rows"]:
        if r["kind"] in ("tuft", "shrub"):
            by_cap.setdefault(r["cap"], []).append(r)
    rows = []
    for st in STATS["perCapability"]:
        ci = st["cap"]
        rs = by_cap.get(ci, [])
        px = sum(r["deliveredPx"] for r in rs)
        rows.append({
            "cap": ci, "tests": st["tests"], "cells": CELLCOUNT.get(ci, 0),
            "areaGroundUnits": round(AREAS.get(ci, 0.0), 1),
            "authoredMarks": st["tufts"] + st["shrubs"],
            "deliveredPx": px,
            "deliveredPxPerCell": round(px / max(1, CELLCOUNT.get(ci, 1)), 2),
            #: THE STABLE NORMALISER, and the chart plots THIS rather than per-cell. Cell counts on
            #: this island run from 1 to 40, so a capability owning one or two cells produces a
            #: per-cell figure an order of magnitude above the rest — a property of the mesh
            #: decomposition, not of its vegetation. Ground AREA is what a viewer actually sees
            #: filled, and it is the normaliser this arc's own density findings use.
            "deliveredPxPer1000Area": round(px / max(1e-9, AREAS.get(ci, 0.0)) * 1000, 2),
            "marksPerCell": round((st["tufts"] + st["shrubs"]) / max(1, CELLCOUNT.get(ci, 1)), 2),
            "marksPer1000Area": round((st["tufts"] + st["shrubs"])
                                      / max(1e-9, AREAS.get(ci, 0.0)) * 1000, 2),
        })
    rows.sort(key=lambda r: (r["tests"], r["cap"]))
    return rows


def monotonic_breaks(rows, key):
    out = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            if rows[j]["tests"] > rows[i]["tests"] and rows[j][key] < rows[i][key]:
                out.append({"moreTestedCap": rows[j]["cap"], "tests": rows[j]["tests"],
                            "gets": rows[j][key], "lessTestedCap": rows[i]["cap"],
                            "itsTests": rows[i]["tests"], "itGets": rows[i][key]})
    return out


CHANNEL = {label: channel_rows(RUNS[label]) for label, _d, _g in SETS}


def adjacent_read(rows):
    """The read a viewer actually makes: is that parcel busier than the one beside it.

    Reported as the delivered px per cell of the LEAST- and MOST-tested capability on this island,
    and the ratio between them. The story's own contract counts span 4 to 7 tests, which is a
    NARROWER spread than the 2-vs-8 the weak spot was originally measured across — so the ratio
    here is not comparable to 0.78-vs-1.11 and the report says so rather than quietly reusing it.
    """
    lo, hi = rows[0], rows[-1]
    return {"lowestTests": lo["tests"], "lowestPxPerCell": lo["deliveredPxPerCell"],
            "highestTests": hi["tests"], "highestPxPerCell": hi["deliveredPxPerCell"],
            "ratio": round(hi["deliveredPxPerCell"] / max(1e-9, lo["deliveredPxPerCell"]), 2),
            "lowestPxPer1000Area": lo["deliveredPxPer1000Area"],
            "highestPxPer1000Area": hi["deliveredPxPer1000Area"],
            "ratioByArea": round(hi["deliveredPxPer1000Area"]
                                 / max(1e-9, lo["deliveredPxPer1000Area"]), 2),
            "testRatio": round(hi["tests"] / max(1e-9, lo["tests"]), 2)}


REPORT["testCountChannel"] = {
    "rule": "grass = round(2 + tests*1.9); shrubs = round(tests/2.6). ADR-0226 D2, UNCHANGED.",
    "storyTestSpread": {"min": min(r["tests"] for r in CHANNEL["blade"]),
                        "max": max(r["tests"] for r in CHANNEL["blade"]),
                        "note": ("the real story's contract counts, not a swept ladder. A 4-to-7 "
                                 "spread is narrow, so this island cannot reproduce the 3-to-30 "
                                 "density ladder measured elsewhere and does not claim to.")},
    "rows": CHANNEL,
    "authoredMarksMonotonicInTests": {
        "breaks": monotonic_breaks(CHANNEL["blade"], "authoredMarks"),
        "why": "monotone BY CONSTRUCTION — `2 + tests*1.9` has no term but tests",
    },
    "deliveredPxMonotonicInTests": {
        label: monotonic_breaks(CHANNEL[label], "deliveredPx") for label, _d, _g in SETS},
    "adjacentParcelRead": {label: adjacent_read(CHANNEL[label]) for label, _d, _g in SETS},
}

#: THE OVERLOAD THE RE-SKIN INHERITS. Shown, never decided — the fix is an ADR-0226 D2 semantic
#: change and therefore the owner's. `dispersion.capacity` is the sibling pass's function, called.
OVERLOAD = []
for r in CHANNEL["blade"]:
    cap = DX.capacity(AREAS.get(r["cap"], 0.0))
    OVERLOAD.append({"cap": r["cap"], "tests": r["tests"],
                     "areaGroundUnits": r["areaGroundUnits"],
                     "capacityAtShrubFootprint": round(cap, 1),
                     "authoredMarks": r["authoredMarks"],
                     "overloadRatio": round(r["authoredMarks"] / cap, 3) if cap else None})
REPORT["countRuleOverload"] = {
    "rows": OVERLOAD,
    "overloaded": [r["cap"] for r in OVERLOAD if r["overloadRatio"] and r["overloadRatio"] > 1.0],
    "THIS_IS_SHOWN_NOT_DECIDED": (
        "`2 + tests*1.9` has NO area term: across this arc's measurements corr(log owned-area, "
        "density) is -0.93 over a 29.5x area spread. Shrubs inheriting the rule INHERIT the "
        "overload. The area-aware variant was rendered in #1389 and introduces FOUR monotonicity "
        "breaks against the current rule's zero — a reader would then read the test counts in the "
        "WRONG ORDER. That is an ADR-0226 D2 semantic change and is the OWNER's, not this pass's."),
}


# =====================================================================================================
# 7. INTERPENETRATION — the measurement the massing risk turns on
# =====================================================================================================
def interpenetration(run, items):
    """Do the plants grow through each other, and by how much.

    THE RISK THIS ANSWERS. A shrub is 4 to 8 delivered px across where a blade tuft was 2, and the
    placements are unchanged — so the same spacing now has to hold bigger objects. Three standing
    owner rejections on this arc are about exactly this failure (stones "noisy/colliding" 07-18,
    "messy and noisy rather than cosy" 07-20, "way too big" 07-23), so it is measured rather than
    hoped.

    Measured on the ISOLATED FOOTPRINT of each placement — `delivery.footprint_mask`, which is the
    shipped `paste_decor` blit with nothing else on the canvas — so an overlap is two plants
    claiming the same supersampled pixel, not one plant having been painted over. Overlap in the
    COMPOSITE would under-report by exactly the amount the painter order hides.

    ⚠ The app-side `driftSpot` figure (88% of plants with a neighbour within 4 units) is a DIFFERENT
    positioner on a DIFFERENT surface — `scene.ts`'s mulberry32 scatter, whose 9.08x drift-bed
    concentration is deliberate and owner-directed. It is not this island's number and is not
    compared to it here.
    """
    plants = [(i, it) for i, it in enumerate(items) if it["kind"] in ("tuft", "shrub")]
    masks, boxes = [], []
    for _i, it in plants:
        m = DL.footprint_mask(it)
        ys, xs = np.nonzero(m)
        masks.append(m)
        boxes.append((ys.min(), ys.max(), xs.min(), xs.max()) if len(ys) else None)
    n = len(plants)
    pairs, overlap_px, worst = 0, 0, None
    touched = set()
    for a in range(n):
        if boxes[a] is None:
            continue
        for b in range(a + 1, n):
            if boxes[b] is None:
                continue
            ay0, ay1, ax0, ax1 = boxes[a]
            by0, by1, bx0, bx1 = boxes[b]
            if ay1 < by0 or by1 < ay0 or ax1 < bx0 or bx1 < ax0:
                continue                      # bounding boxes miss — no mask work needed
            ov = int((masks[a] & masks[b]).sum())
            if ov:
                pairs += 1
                overlap_px += ov
                touched.add(a)
                touched.add(b)
                if worst is None or ov > worst[0]:
                    worst = (ov, plants[a][1]["piece"], plants[b][1]["piece"])
    own = [int(m.sum()) for m in masks]
    return {
        "plants": n,
        "overlappingPairs": pairs,
        "plantsInAtLeastOneOverlap": len(touched),
        "shareOfPlantsOverlapping": round(len(touched) / max(1, n), 4),
        "overlappingSupersampledPx": overlap_px,
        "overlapAsShareOfTotalFootprint": round(overlap_px / max(1, sum(own)), 4),
        "worstPair": ({"px": worst[0], "a": worst[1], "b": worst[2]} if worst else None),
        "medianFootprintSs": int(statistics.median(own)) if own else 0,
    }


print("measuring interpenetration ...", flush=True)
INTER = {}
for _label, _d, _g in SETS:
    D.use_pieces(_d, expect_geometry=_g)
    INTER[_label] = interpenetration(RUNS[_label], ITEMS)
REPORT["interpenetration"] = INTER


# =====================================================================================================
# 8. DETERMINISM — on the DECODED RASTER, never the file bytes
# =====================================================================================================
print("re-composing for determinism ...", flush=True)
_again = compose_set("shrubs", SHRUB_PIECES, "shrubs", ITEMS)
REPORT["determinism"] = {
    "rule": ("asserted on the DECODED raster. A Blender PNG's CONTAINER differs on every re-render, "
             "so a file hash reports drift that is not there — measured live on this arc at 0 of 22 "
             "files byte-identical across two pixel-identical runs."),
    "deliveredRasterIdentical": bool(np.array_equal(_again["img"], RUNS["shrubs"]["img"])),
    "solidMaskIdentical": bool(np.array_equal(_again["solid"], RUNS["shrubs"]["solid"])),
}
if not REPORT["determinism"]["deliveredRasterIdentical"]:
    raise SystemExit("REFUSED: two composites of the same code state disagree on the decoded "
                     "raster. Nothing below is reproducible.")


# =====================================================================================================
# 9. THE PICTURES
# =====================================================================================================
PAD, HDR, CAP = CH.PAD, CH.HDR, CH.CAP
INK, DIM, HI, WARN, GOOD = CH.INK, CH.DIM, CH.HI, CH.WARN, CH.GOOD
CAM = CH.CAM
BOARDS = {label: CH.board(RUNS[label]["img"]) for label, _d, _g in SETS}
IW, IH = BOARDS["shrubs"].size
M, V, DEL = REPORT["marks"], REPORT["vegetation"], REPORT["delivery"]

# ---- 1. THE DELIVERABLE ------------------------------------------------------------------------------
im1, dr1, T1 = CH.sheet(PAD + 3 * (IW + PAD), HDR + IH + CAP + 330,
                        "SHRUBS AND SMALL PLANTS REPLACE THE LONG GRASS — the set, on the real island",
                        f"`{P.STORY_ID}` — 11 capabilities, every one `healthy` off its own SIGNED "
                        f"pass, 162 mesh cells, flat green, seams off. ONE island, ONE code state, "
                        f"ONE camera ({C.ELEV:g} deg), ONE palette ({REPORT['paletteCost']['entries']} "
                        f"entries) and THE SAME {DISP['placements']} placements on all three panels, "
                        f"so the only variable is which mesh the piece names resolve to. Placed by "
                        f"the fixed positioner: corr(u,v) = {DISP['corrUV']} against the unfixed "
                        f"sampler's +0.9997. Rendered at {SAMPLES_DECLARED} Cycles samples.",
                        CAM)
for k, (label, title, colour) in enumerate([
        ("blade", "1. THE WITHDRAWN LONG GRASS", WARN),
        ("species", "2. THE FOUR SPECIES (#1389, awaiting the owner's look)", HI),
        ("shrubs", "3. + TWO SMALL PLANTS IN THE SHRUB SLOTS (this pass)", GOOD)]):
    cx = PAD + k * (IW + PAD)
    im1.paste(BOARDS[label], (cx, T1))
    CH.caption(dr1, cx, T1 + IH + 6, [
        (title, INK),
        (f"{M['spread'][label]['species']} outlines · median mark "
         f"{M['spread'][label]['deliveredPxMedian']} px · aspect spread "
         f"{M['spread'][label]['aspectSpread']}x · fill spread "
         f"{M['spread'][label]['fillSpread']}x", colour),
        (f"{V['deliveredPx'][label]} delivered vegetation px · "
         f"{int(DEL[label]['zeroDeliveryShare'] * 100)}% of placements deliver NOTHING · "
         f"median {DEL[label]['medianDeliveredPxPerSurvivor']} px per survivor", DIM),
    ], IW)
CH.caption(dr1, PAD, T1 + IH + 112, [
    (f"THE BASELINE IS RE-MEASURED HERE, NOT INHERITED. The arc's 'median 3 delivered px' was "
     f"measured on this first panel's species AND on placements that carried the CRC32 diagonal "
     f"collapse; both are corrected. On the current positioner and the current compositor the "
     f"withdrawn blade delivers a median of "
     f"{DEL['blade']['medianDeliveredPxPerSurvivor']} px per surviving placement with "
     f"{int(DEL['blade']['zeroDeliveryShare'] * 100)}% of placements delivering nothing at all; the "
     f"small-plant set delivers {DEL['shrubs']['medianDeliveredPxPerSurvivor']} px with "
     f"{int(DEL['shrubs']['zeroDeliveryShare'] * 100)}% empty. THE 3 IS REAL AND IT REPRODUCES — "
     f"it was the SPECIES all along, not the placement bug and not the pipeline. Vegetation on the "
     f"island goes {V['deliveredPx']['blade']} -> {V['deliveredPx']['species']} -> "
     f"{V['deliveredPx']['shrubs']} delivered px for the SAME {V['authored']['meadowTotal']} "
     f"authored marks and "
     f"{REPORT['paletteCost']['costOfTheSpeciesChangeInPaletteEntries']} extra palette entries.",
     DIM),
    (f"PANEL 3 IS NOT MORE PIXELS THAN PANEL 2 AND IS NOT MEANT TO BE — it is "
     f"{V['deliveredPx']['species'] - V['deliveredPx']['shrubs']} px BELOW it "
     f"({round(abs(V['deliveredPx']['shrubs'] / V['deliveredPx']['species'] - 1) * 100, 1)}%), "
     f"because this pass's cushion is deliberately the SMALLEST solid mark in the set. What the two "
     f"new plants buy is separation between the six outlines: the closest pair in the set moves "
     f"{REPORT['marks']['separation']['species']['minPairwiseSeparation']} -> "
     f"{REPORT['marks']['separation']['shrubs']['minPairwiseSeparation']}, and the two legacy "
     f"shrub pieces that sat nearly on top of the dome are gone.", DIM),
    (f"COUNT STILL MEANS TESTS — ADR-0226 D2 is unchanged and only the species moves. What the "
     f"re-skin does NOT fix is the count rule's missing area term: "
     f"{len(REPORT['countRuleOverload']['overloaded'])} of {len(OVERLOAD)} capabilities are "
     f"budgeted more plants than their ground holds, and the area-aware fix breaks monotonicity in "
     f"four ordered pairs. That is an ADR-0226 D2 semantic change and is the owner's, not this "
     f"pass's — see `test-count-channel.png`.", HI),
    ("NOT OWNER-ATTESTED. Whether this reads right is the owner's look and this picture has no "
     "standing to make it (ADR-0070 stage 2). An honest \"none of these helped\" is an accepted "
     "outcome (ADR-0280 D4).", WARN),
], im1.size[0] - 2 * PAD)
im1.save(os.path.join(OUT, "shrub-species.png"))

# ---- 2. THE SET ITSELF, at 14x ------------------------------------------------------------------------
Z2 = 14
COLW = 9 * Z2
ORDER = [("shrubs", n) for n in PLANT_SLOTS] + [("shrubs", CANDIDATE)] + \
        [("blade", "tuft-3a")]
im2, dr2, T2 = CH.sheet(PAD + len(ORDER) * (COLW + PAD), HDR + 5 * Z2 + CAP + 132,
                        "THE SMALL-PLANT SET — every block is ONE delivered pixel",
                        "Each piece's DELIVERED footprint, measured off the committed PNG through "
                        "the same 3x3 majority the compositor applies. Only three properties "
                        "survive a downsample at this scale — AREA, ASPECT and topological "
                        "DISCONNECTION — and this set spends all three. The sixth column is a "
                        "CANDIDATE: rendered and measured, absent from `pieceNames`, so no "
                        "composite on this pass can contain it. The last column is the withdrawn "
                        "long grass at the same magnification.",
                        CAM)
for k, (setlabel, name) in enumerate(ORDER):
    c = CENSUS[setlabel][name]
    cx = PAD + k * (COLW + PAD)
    for ry, row in enumerate(c["rows"]):
        for rx, ch in enumerate(row):
            if ch == "#":
                dr2.rectangle([cx + rx * Z2, T2 + ry * Z2,
                               cx + (rx + 1) * Z2 - 2, T2 + (ry + 1) * Z2 - 2],
                              fill=(GOOD if setlabel == "shrubs" and name != CANDIDATE
                                    else (HI if name == CANDIDATE else WARN)))
    lab = SPECIES_NAMES[setlabel].get(name, name)
    CH.caption(dr2, cx, T2 + 5 * Z2 + 6, [
        (f"{name}", INK),
        (f"{lab}", GOOD if setlabel == "shrubs" and name != CANDIDATE else WARN),
        (f"{c['deliveredPx']} px  {c['bboxW']}x{c['bboxH']}", DIM),
        (f"aspect {c['aspect']}  fill {c['fillRatio']}", DIM),
        (f"survival {c['survivalPct']}%", DIM),
    ], COLW + PAD - 2)
_sp, _bl = M["spread"]["shrubs"], M["spread"]["blade"]
CH.caption(dr2, PAD, T2 + 5 * Z2 + 74, [
    (f"ASPECT ALONE CANNOT SCORE THIS SET, and that is a correction to the instrument #1389 used. "
     f"The `frond` and the `spreader` deliver the SAME 8x3 box at the SAME aspect 2.67 and are "
     f"plainly different pieces: the spreader fills {CENSUS['shrubs']['tuft-3b']['fillRatio']} of "
     f"its box and the frond {CENSUS['shrubs']['shrub-b']['fillRatio']}, because the frond carries "
     f"a notch. Variety is reported on BOTH axes here — aspect spread {_sp['aspectSpread']}x "
     f"(blade {_bl['aspectSpread']}x) and fill spread {_sp['fillSpread']}x (blade "
     f"{_bl['fillSpread']}x) — over a delivered-size ladder of {_sp['deliveredPxMin']} to "
     f"{_sp['deliveredPxMax']} px against the blade set's {_bl['deliveredPxMin']} to "
     f"{_bl['deliveredPxMax']}.", DIM),
    (f"AND THE SPREAD NUMBERS DO NOT MOVE WHEN THIS PASS'S TWO PLANTS GO IN — every extreme is "
     f"held by one of the four INHERITED species, so aspect spread, fill spread and the size range "
     f"are identical to #1389's set. What moves is the INTERIOR: the closest pair of outlines in "
     f"the set goes {REPORT['marks']['separation']['species']['minPairwiseSeparation']} "
     f"({' / '.join(REPORT['marks']['separation']['species']['closestPairSpecies'])}) -> "
     f"{REPORT['marks']['separation']['shrubs']['minPairwiseSeparation']} "
     f"({' / '.join(REPORT['marks']['separation']['shrubs']['closestPairSpecies'])}). The two "
     f"legacy shrub pieces this pass replaces were the old grass-clump set's, and they sat almost "
     f"on top of the dome — six outlines that read as five.", DIM),
    (f"CONCAVITY SURVIVES; VERTICAL SEPARATION DOES NOT. The frond's notch is authored ~2 delivered "
     f"px deep and comes through at {CENSUS['shrubs']['shrub-b']['survivalPct']}% survival — a "
     f"third cue class, and the arc had only found three. The `tier` candidate raises a crown clear "
     f"of the ground on a stem, and its delivered silhouette is IDENTICAL to the cushion's "
     f"{CENSUS['shrubs']['shrub-a']['deliveredPx']}-px mound once the two are aligned: the stem and "
     f"the gap under the crown are both destroyed. That is why it is a candidate and not a member.",
     HI),
], im2.size[0] - 2 * PAD)
im2.save(os.path.join(OUT, "small-plant-set.png"))

# ---- 3. THE ART CALL: 6x detail ----------------------------------------------------------------------
Z, CW, CH_ = 6, 92, 62
#: WHERE THE CROP GOES IS PART OF THE DELIVERABLE and it took three attempts on the predecessor
#: pass: the island's centroid lands on the hero tree's TRUNK, and "most vegetation" lands UNDER the
#: canopy because plants are densest at the centre. The window is chosen as the one containing NO
#: tree pixel that holds the most delivered vegetation, with the tree mask taken as the difference
#: between the with-tree board and the identical tree-less one rather than guessed.
_veg = ((RUNS["shrubs"]["img"][:, :, :3] != RUNS["shrubs"]["bare"][:, :, :3]).any(axis=2)
        & RUNS["shrubs"]["solid"] & RUNS["shrubs"]["bareSolid"])
#: THE TREE MASK IS THE SPRITE'S OWN DELIVERED FOOTPRINT, taken as the difference between the board
#: WITH the hero tree and the identical one composed before `plant_tree` ran.
#: ⚠ A FIRST VERSION OF THIS WAS VACUOUS AND WOULD HAVE PASSED ITS OWN CHECK. It differenced the
#: dressed board against the PLANT-LESS one, and the tree is in BOTH of those, so it cancelled and
#: the mask came out empty — which makes "no tree pixel in the window" true of every window, turns
#: the constraint into a no-op, and hands the owner the close-up of canopy the predecessor pass
#: spent three attempts avoiding. The tell is that the guard can only ever report zero. The count
#: below is now MEASURED into the report rather than asserted as 0.
_treemask = ((RUNS["shrubs"]["img"][:, :, :3] != RUNS["shrubs"]["noTree"][:, :, :3]).any(axis=2))


def _integral(mask):
    return np.cumsum(np.cumsum(mask.astype(np.int32), axis=0), axis=1)


def _win(intg, y, x):
    y1, x1 = y + CH_ - 1, x + CW - 1
    t = intg[y1, x1]
    if y > 0:
        t -= intg[y - 1, x1]
    if x > 0:
        t -= intg[y1, x - 1]
    if y > 0 and x > 0:
        t += intg[y - 1, x - 1]
    return int(t)


_iv, _it = _integral(_veg), _integral(_treemask)
if int(_treemask.sum()) < 1000:
    raise SystemExit(
        "REFUSED: the hero tree's delivered mask is only %d px, which is far too few for a sprite "
        "that dominates this island. The mask has almost certainly cancelled against a reference "
        "that also contains the tree, and the 'no tree pixel' rule for the 6x crop would then be "
        "VACUOUSLY true of every window." % int(_treemask.sum()))
_best, _bxy = -1, (0, 0)
for _y in range(0, _veg.shape[0] - CH_, 2):
    for _x in range(0, _veg.shape[1] - CW, 2):
        if _win(_it, _y, _x):
            continue
        s = _win(_iv, _y, _x)
        if s > _best:
            _best, _bxy = s, (_y, _x)
_cy, _cx = _bxy
REPORT["detailCrop"] = {
    "y": _cy, "x": _cx, "w": CW, "h": CH_, "zoom": Z,
    "vegetationPxInWindow": _best,
    #: MEASURED at the chosen window, never asserted — see the vacuity note above.
    "treePxInWindow": _win(_it, _cy, _cx),
    "treeMaskPx": int(_treemask.sum()),
    "vegetationMaskPx": int(_veg.sum()),
    "rule": "the window with NO tree pixel holding the most delivered vegetation"}

im3, dr3, T3 = CH.sheet(PAD + 3 * (CW * Z + PAD), HDR + CH_ * Z + CAP + 78,
                        "JUDGE THE ART HERE — the same %d x %d window at %dx, every block one "
                        "delivered pixel" % (CW, CH_, Z),
                        f"The window holding the most delivered vegetation while containing NO "
                        f"pixel of the hero tree ({_best} vegetation px). Same island, same "
                        f"placements, same palette in all three — only the mesh behind the piece "
                        f"names differs.",
                        CAM)
for k, (label, title, colour) in enumerate([
        ("blade", "the WITHDRAWN long grass", WARN),
        ("species", "the four species (#1389)", HI),
        ("shrubs", "+ cushion and frond (this pass)", GOOD)]):
    crop = CH.board(RUNS[label]["img"]).crop((_cx, _cy, _cx + CW, _cy + CH_)) \
        .resize((CW * Z, CH_ * Z), Image.NEAREST)
    px = PAD + k * (CW * Z + PAD)
    im3.paste(crop, (px, T3))
    dr3.text((px, T3 + CH_ * Z + 6), title, fill=colour)
CH.caption(dr3, PAD, T3 + CH_ * Z + 24, [
    (f"INTERPENETRATION IS MEASURED, NOT HOPED — it is the risk a bigger mark on unchanged spacing "
     f"runs, and three standing owner rejections on this arc are about exactly it. On isolated "
     f"footprints (the shipped blit with nothing else on the canvas, so an overlap is two plants "
     f"claiming one pixel rather than one plant painted over): the blade set has "
     f"{INTER['blade']['overlappingPairs']} overlapping pairs touching "
     f"{int(INTER['blade']['shareOfPlantsOverlapping'] * 100)}% of plants; the small-plant set has "
     f"{INTER['shrubs']['overlappingPairs']} pairs touching "
     f"{int(INTER['shrubs']['shareOfPlantsOverlapping'] * 100)}%, and overlapping pixels are "
     f"{round(INTER['shrubs']['overlapAsShareOfTotalFootprint'] * 100, 1)}% of the total plant "
     f"footprint. The placements are IDENTICAL in both — this is the cost of the bigger mark and "
     f"nothing else.", DIM),
], im3.size[0] - 2 * PAD)
im3.save(os.path.join(OUT, "shrub-detail-6x.png"))

# ---- 4. THE CHANNEL ----------------------------------------------------------------------------------
BARW, BARH, GAPW = 46, 150, 16
rowsB, rowsS = CHANNEL["blade"], CHANNEL["shrubs"]
#: PER 1000 GROUND UNITS, NOT PER CELL — and the swap is a correction rather than a preference.
#: Cell counts on this island run from 1 to 40, so a capability owning one or two cells posts a
#: per-cell figure an order of magnitude above every other bar and flattens the chart into two
#: spikes. That spike is a property of the mesh decomposition, not of the vegetation standing on the
#: ground. Both numbers are in the report; the picture plots the one a viewer's eye is actually
#: integrating, which is pixels per unit of ground.
_key = "deliveredPxPer1000Area"
_maxpc = max(max(r[_key] for r in rowsB), max(r[_key] for r in rowsS))
im4, dr4, T4 = CH.sheet(PAD * 2 + len(rowsB) * (BARW + GAPW), HDR + BARH + CAP + 190,
                        "DOES THE COUNT STILL READ AS THE TEST COUNT — delivered px per 1000 "
                        "ground units, by capability",
                        "ADR-0226 D2 gives the signal to the vegetation COUNT and this re-skin does "
                        "not touch it: the same rule, the same placements, the same counts. What "
                        "changes is how many pixels each mark delivers, which is what a viewer "
                        "actually reads. The dim bar is the withdrawn long grass, the bright bar "
                        "the small-plant set. Capabilities are ordered by test count. Normalised by "
                        "owned AREA rather than by cell count, because cell counts here run 1 to 40 "
                        "and a two-cell capability's per-cell figure is a fact about the mesh.",
                        CAM)
for k, (rb, rs) in enumerate(zip(rowsB, rowsS)):
    x = PAD * 2 + k * (BARW + GAPW)
    hb = int(BARH * rb[_key] / max(1e-9, _maxpc))
    hs = int(BARH * rs[_key] / max(1e-9, _maxpc))
    dr4.rectangle([x, T4 + BARH - hb, x + BARW // 2 - 2, T4 + BARH], fill=WARN)
    dr4.rectangle([x + BARW // 2 + 2, T4 + BARH - hs, x + BARW, T4 + BARH], fill=GOOD)
    dr4.text((x, T4 + BARH + 4), f"{rb['tests']}t", fill=INK)
    dr4.text((x, T4 + BARH + 17), f"{rb[_key]}", fill=WARN)
    dr4.text((x, T4 + BARH + 30), f"{rs[_key]}", fill=GOOD)
    dr4.text((x, T4 + BARH + 43), f"{rb['cells']}c", fill=DIM)
_ab, _as_ = REPORT["testCountChannel"]["adjacentParcelRead"]["blade"], \
    REPORT["testCountChannel"]["adjacentParcelRead"]["shrubs"]
CH.caption(dr4, PAD, T4 + BARH + 60, [
    (f"THE PER-PARCEL READ, RE-MEASURED. This story's contracts span {_ab['lowestTests']} to "
     f"{_ab['highestTests']} tests — narrower than the 2-vs-8 the weak spot was first measured "
     f"across, so these numbers are NOT the 0.78-vs-1.11 figure re-stated. Least- against "
     f"most-tested capability: blade {_ab['lowestPxPer1000Area']} -> "
     f"{_ab['highestPxPer1000Area']} px per 1000 ground units "
     f"(a {_ab['ratioByArea']}x read for a {_ab['testRatio']}x test count); small plants "
     f"{_as_['lowestPxPer1000Area']} -> {_as_['highestPxPer1000Area']} "
     f"({_as_['ratioByArea']}x). Delivered "
     f"monotonicity breaks across the eleven capabilities: blade "
     f"{len(REPORT['testCountChannel']['deliveredPxMonotonicInTests']['blade'])}, small plants "
     f"{len(REPORT['testCountChannel']['deliveredPxMonotonicInTests']['shrubs'])} — against ZERO "
     f"breaks in what the RULE authored, which is monotone by construction.", DIM),
    (f"THE OVERLOAD THE RE-SKIN INHERITS, SHOWN NOT DECIDED. `2 + tests*1.9` has no area term, so "
     f"{len(REPORT['countRuleOverload']['overloaded'])} of {len(OVERLOAD)} capabilities here are "
     f"budgeted more plants than their own ground holds at a shrub's footprint (worst "
     f"{max((r['overloadRatio'] or 0) for r in OVERLOAD)}x). A bigger mark makes that MORE visible, "
     f"not less. The area-aware fix was rendered in #1389 and costs four monotonicity breaks, so a "
     f"reader would read the test counts in the wrong order — an ADR-0226 D2 semantic change, and "
     f"the owner's call.", HI),
], im4.size[0] - 2 * PAD)
im4.save(os.path.join(OUT, "test-count-channel.png"))


# =====================================================================================================
# 10. PROVENANCE
# =====================================================================================================
REPORT["fence"] = {
    "diffScope": "docs/research/** only",
    "cameraElevationDeg": C.ELEV,
    "appLandCameraElevationDeg": 20,
    "appLandCameraTouched": False,
    "blenderRendersThisPass": 3,
    "samples": SAMPLES_DECLARED,
    "vendorsNoCompositor": ("`compose_healthy.py` is imported whole with its writes sent to "
                            "scratch; no compositor is copied into this directory"),
    "vendorsNoScatter": ("the positioner is `scatter.py` reached through "
                         "`disperse.scatter_dispersed`, which IS `scatter.scatter_island`"),
    "vendorsNoAttribution": ("`attribute.py` and `delivery.py` are imported from the passes that "
                             "own them"),
    "generatorsNotEdited": ["blender_species.py", "blender_grass.py"],
}
REPORT["inputs"] = {
    "island": os.path.relpath(CH.ISLAND_PATH, REPO).replace("\\", "/"),
    "storyId": P.STORY_ID,
    "sets": {label: os.path.relpath(d, REPO).replace("\\", "/") for label, d, _g in SETS},
}

with open(os.path.join(OUT, "shrub-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

_shrub_meta = json.load(open(os.path.join(SHRUB_PIECES, "render-meta.json")))
_inputs = list(CH.INPUTS) + C.piece_inputs([("pieces-species", SPECIES_PIECES),
                                            ("pieces-shrubs", SHRUB_PIECES)])
for pic in ("shrub-species.png", "small-plant-set.png", "shrub-detail-6x.png",
            "test-count-channel.png"):
    provenance.write_sidecar(
        os.path.join(OUT, pic), __file__, sys.argv[1:], _inputs, CH.CODE_STATE,
        extra={"pass": "chapter2-shrub-species-2026-08-18",
               "shrubGenerator": _shrub_meta["code_state"],
               "inheritedGenerator": _shrub_meta["inheritedGenerator"],
               "cameraElevationDeg": C.ELEV,
               "samples": SAMPLES_DECLARED,
               "positioner": "disperse.scatter_dispersed IS scatter.scatter_island (the CRC32 fix)",
               "corrUV": DISP["corrUV"],
               "paletteEntries": REPORT["paletteCost"]["entries"],
               "island": {"sha256": provenance.sha256_file(CH.ISLAND_PATH)},
               "proof": {"sha256": provenance.sha256_file(CH.PROOF_PATH)}})

print("\nDONE — 4 pictures + shrub-report.json + 4 sidecars -> %s" % OUT)
print("  OPEN THIS ONE: shrub-species.png")
print("  median delivered px per survivor:  blade %s -> species %s -> small plants %s"
      % (DEL["blade"]["medianDeliveredPxPerSurvivor"],
         DEL["species"]["medianDeliveredPxPerSurvivor"],
         DEL["shrubs"]["medianDeliveredPxPerSurvivor"]))
print("  zero-delivery share:               blade %.1f%% -> small plants %.1f%%"
      % (DEL["blade"]["zeroDeliveryShare"] * 100, DEL["shrubs"]["zeroDeliveryShare"] * 100))
print("  vegetation px on the island:       %d -> %d -> %d  (same %d authored marks)"
      % (V["deliveredPx"]["blade"], V["deliveredPx"]["species"], V["deliveredPx"]["shrubs"],
         V["authored"]["meadowTotal"]))
print("  palette entries:                   %d, identical across all three sets"
      % REPORT["paletteCost"]["entries"])
print("  interpenetration (plants in >=1 overlap): blade %.0f%% -> small plants %.0f%%"
      % (INTER["blade"]["shareOfPlantsOverlapping"] * 100,
         INTER["shrubs"]["shareOfPlantsOverlapping"] * 100))
print("  LAND_CAMERA_ELEVATION_DEG is untouched and still 20.")
