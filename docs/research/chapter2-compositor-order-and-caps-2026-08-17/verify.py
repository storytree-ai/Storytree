#!/usr/bin/env python3
"""THE TWO COMPOSITOR DEFECTS, FIXED AND HELD — painter order and `caps` authority, in one pass.

    python verify.py               # every check + order-and-caps-report.json   (~6 min)

WHAT LANDED, AND WHY THE TWO ARE ONE UNIT. Both defects live in
`chapter2-grass-reads-as-signal-2026-08-16/compose_core.py`, both were diagnosed-and-not-fixed by an
earlier pass precisely because editing that file invalidates committed provenance across the whole
track, and both therefore cost that re-render exactly once if taken together and twice if taken
apart.

    1. PAINTER ORDER (PR #1383's diagnosis, applied here, not re-derived). The draw list sorts on
       `(y, class)`. A CELL's key is its centroid; a PLACEMENT's key was its own ground point. Every
       placement in the back half of its own cell therefore sorted BEFORE that cell, and
       `fill_polygon` is a hard write — the cell's top face erased the thing standing on it. The key
       is now `max(own ground y, the cell's centroid y)`.

    2. `caps` AUTHORITY (PR #1381's incidental finding, applied here). `compose_land(caps=...)`
       recoloured the CELLS from its argument while `C.boundary_walls` read the module global
       `C.CAPS`, so an island driven all-`healthy` through the argument alone kept its ORIGINAL
       statuses' walls. A function that honours half the parameter it is handed is a false-pass
       generator: the caller believes it varied one variable and it varied part of one.

WHAT THIS FILE ADDS THAT PR #1383 COULD NOT. #1383 measured the repair as a DATA transform on the
item list, because it was forbidden from editing the compositor. Three things follow from the repair
actually landing, and this file is where each is established:

  * the fixture numbers are now produced BY THE COMPOSITOR rather than by a stand-in for it;
  * the REAL-CORPUS island (PR #1382's `context-traversal-capture` geometry) is measured ON ITS OWN
    GEOMETRY for the first time — it delegates to this compositor and inherited the defect silently,
    and no number for it existed before this file;
  * the `caps` fix is asserted where it is visible, on the delivered raster, in both directions.

TWO SWITCHES, NO FOURTH COMPOSITOR. Each defect can be reintroduced for the duration of one
composite (`compose_core.DECOR_SORTS_AFTER_ITS_CELL`, `compose_core.CAPS_ARGUMENT_IS_AUTHORITATIVE_
FOR_WALLS`). That is deliberate and it is the cheapest honest option available: a guard that cannot
reintroduce the defect it guards against reports zero for free, and the alternative — a fourth copy
of a ~700-line compositor carrying the old rules — is the exact thing this track has been told not
to create. Both switches are set inside a `try/finally` and asserted back to `True` at the end of
this run.

SCALE, AND THE ONE COMPARISON THAT IS NOT ALLOWED. Every number here belongs to a delivered raster
at supersample 3, 1 ground unit = 1 delivered px, camera 50 deg (the research track's named
parameter; the app's `LAND_CAMERA_ELEVATION_DEG` is 20 and is neither read nor touched). NO Blender
render runs in this pass — every piece is a committed PNG — so the sample-count caveat that governs
cross-pass pixel comparisons does not arise here, and no number below is compared against one from a
pass that rendered its own pieces.
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
DEFECTS = os.path.join(RESEARCH, "chapter2-grass-defects-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
LOSS = os.path.join(RESEARCH, "chapter2-grass-delivery-loss-2026-08-17")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")

sys.path.insert(0, LOSS)
sys.path.insert(0, DEFECTS)
sys.path.insert(0, GRASS)

import delivery as L                        # noqa: E402  the instrument, imported and not forked
from delivery import C, D, diagnose as G    # noqa: E402
import scatter                              # noqa: E402

REPORT = {}
CHECKS = []


def check(ok, name, detail=""):
    CHECKS.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail else ""), flush=True)
    return bool(ok)


# ================================================================= mounting
def mount_fixture():
    """The spike fixture the whole arc has judged appearance on, via the instrument's own mount.

    It restores the ISLAND as well as the pieces, because `mount_real` below rebinds `D.ISLAND_PATH`
    and a stale rebind is silent: the two islands carry a different number of capabilities, so the
    first thing that reads `caps[cell["cap"]]` on the wrong pair raises deep inside the shipped
    compositor rather than saying which mount was wrong.
    """
    D.ISLAND_PATH = FIXTURE_ISLAND_PATH
    D.ISLAND, D.LAND_META = D.rebind()
    meta = G.mount()
    D.UAT_CRITERIA = FIXTURE_UAT
    scatter.capability_tests = ORIGINAL_TESTS
    return meta


def mount_real():
    """PR #1382's REAL story island — `context-traversal-capture` — on ITS OWN geometry.

    Three rebinds and no restated arithmetic, which is the same move `compose_healthy.use_island`
    makes: `compose_core` reads its island, camera and piece set from module state at CALL time.

    TWO THINGS ARE BOUND TO THE REAL STORY AND NOT TO THE FIXTURE, because otherwise this would be
    the fixture's decor standing on the real island's cells and the measurement would be about
    neither: `scatter.capability_tests` INVENTS a test count from a hash (it says so itself), so it
    is replaced by the story's own contract counts exactly as `compose_healthy.scatter_real` does;
    and the UAT criteria are the story's real ones, so the flowers are 1:1 with real criteria
    (ADR-0226 D4) rather than with six invented ones.

    The scatter SEED stays `grass.SEED` — the instrument's — because the seed decides WHERE inside a
    cell a placement lands, and holding it fixed is what makes the two geometries comparable at all.
    """
    D.ISLAND_PATH = os.path.join(HEALTHY, "island.json")
    D.ISLAND, D.LAND_META = D.rebind()
    meta = D.use_pieces(os.path.join(GRASS, "pieces-m00-blade"), expect_mix=0.0,
                        expect_geometry="blade")
    real = D.ISLAND
    D.UAT_CRITERIA = real["uatCriteria"]
    tests = [c["tests"] for c in real["capabilities"]]
    scatter.capability_tests = lambda ci, status, seed: tests[ci]
    return meta, real


ORIGINAL_TESTS = scatter.capability_tests
FIXTURE_UAT = list(D.UAT_CRITERIA)
FIXTURE_ISLAND_PATH = D.ISLAND_PATH


# ================================================================= the delivery measurement
def delivery_rates(meta, caps, label):
    """Zero-delivery rate with the OLD key and with the SHIPPED key, on whatever island is mounted.

    `TRULYdeliveringNothing` subtracts the co-credited class — a placement whose pixels ARE on the
    island but were credited to a colour-identical neighbour by the attribution's own tiebreak.
    Reporting that as loss would overstate the defect, so both figures are carried.
    """
    with L.centroid_key():
        before_run = L.run_captured(meta, caps, label + "-oldKey")
        before = L.per_placement(before_run)
    after_run = L.run_captured(meta, caps, label)
    after = L.per_placement(after_run)

    def own_cell_occlusions(run, rows):
        prof = L.occluder_profile(run, rows)
        return int(prof["whatOwnsAnOccludedPlacementsFootprint"]["ownCellsFill"]), prof

    def one(rows, run):
        n = len(rows)
        zero = [r for r in rows if r["deliveredPx"] == 0]
        true_zero = [r for r in zero if r["fate"] != L.CO_CREDITED]
        occ, prof = own_cell_occlusions(run, rows)
        return {
            "placements": n,
            "deliveringNothing": len(zero),
            "deliveringNothingPct": round(100.0 * len(zero) / n, 1),
            "TRULYdeliveringNothing": len(true_zero),
            "TRULYdeliveringNothingPct": round(100.0 * len(true_zero) / n, 1),
            "occludedByAnything": sum(1 for r in rows if r["fate"] == L.OCCLUDED),
            "occludedByItsOWNCell": occ,
            "vegetationPxDelivered": int((run["cls"] == 2).sum()),
            "deliveredIslandPx": int(run["solid"].sum()),
            "medianPxPerSurvivor": int(np.median([r["deliveredPx"] for r in rows
                                                  if r["deliveredPx"] > 0])),
            "aboveVsBelowTheCentroid": prof["paintedBeforeItsOwnCell"],
        }

    return {"withTheOldKey": one(before, before_run), "asShipped": one(after, after_run)}, after_run


# ================================================================= the caps measurement
def unhealthy_colour_sets():
    """Every delivered colour an `unhealthy` token can produce, split by WHICH SURFACE emits it.

    The split is the point. A `side` token is only ever painted by a wall piece; `top` and `wheat`
    are only ever painted by a cell fill. So a count over the side set alone is a count of WALL
    pixels, which is exactly the quantity the `caps` defect was invisible in.
    """
    levels = sorted({1.00, C.FLAT_LEVEL, C.SEAM_LEVEL, *C.KEY_SHADE.values(),
                     *{float(lv) for roles in D.DECOR_META["pieceRoles"].values()
                       for _role, lv in roles.values()}})
    t = C.STATUS_TOKENS["unhealthy"]
    def shades(toks):
        return {tuple(int(round(v)) for v in C.shade(C.hexrgb(x), lv))
                for x in toks for lv in levels}
    walls = shades([t["side"]])
    cells = shades([t["wheat"], *t["top"]])
    return walls, cells, levels


def count_colours(rgb, solid, colours):
    m = np.zeros(rgb.shape[:2], bool)
    for c in colours:
        m |= (rgb[:, :, 0] == c[0]) & (rgb[:, :, 1] == c[1]) & (rgb[:, :, 2] == c[2])
    return int((m & solid).sum())


def unhealthy_px(caps, authoritative=True, rim=False):
    """Unhealthy wall px and cell px on one composite, driven through `caps=` ALONE.

    `rim_pass=False` by default, and that is the compositor's OWN rule rather than a convenience:
    `C.back_half` documents the silhouette rim as DELIBERATELY allowed to reach the whole palette
    (it darkens from the local colour and re-snaps), so *"a tint assertion has to be made on the cell
    BODIES"*. The rim is measured separately below rather than dropped silently.
    """
    saved = D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS
    D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS = authoritative
    try:
        canvas, alpha, _h = D.compose_land([], caps=list(caps))
    finally:
        D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS = saved
    img, solid = C.back_half(canvas, alpha, rim_pass=rim)
    rgb = img[:, :, :3].astype(int)
    return (count_colours(rgb, solid, WALL_COLOURS), count_colours(rgb, solid, CELL_COLOURS),
            int(solid.sum()))


# ================================================================= 0. the fence, before anything
FENCE = subprocess.run(["git", "-C", REPO, "status", "--porcelain"],
                       capture_output=True, text=True).stdout.splitlines()
TOUCHED = sorted({ln[3:].strip().strip('"') for ln in FENCE if ln.strip()})
OUTSIDE = [p for p in TOUCHED if not p.startswith("docs/research/")]
print("== 0. the owner's fence ==")
check(not OUTSIDE, "every change in the working tree is under docs/research/**",
      f"{len(TOUCHED)} paths touched" if not OUTSIDE else f"OUTSIDE: {OUTSIDE}")

CAM = os.path.join(REPO, "packages", "forest-world", "src")
elev = subprocess.run(["git", "-C", REPO, "grep", "-h", "LAND_CAMERA_ELEVATION_DEG ="],
                      capture_output=True, text=True).stdout
check("= 20" in elev, "LAND_CAMERA_ELEVATION_DEG is still 20 and was not touched",
      elev.strip().splitlines()[0].strip() if elev.strip() else "not found")

REPORT["fence"] = {"pathsTouchedCount": len(TOUCHED), "outsideDocsResearch": OUTSIDE,
                   "researchDirsTouched": sorted({"/".join(p.split("/")[:3]) for p in TOUCHED
                                                  if p.startswith("docs/research/")}),
                   "landCameraElevationDeg": elev.strip()}

# ================================================================= 1. the shipped app is CLEAN
# The research raster is a painter's-algorithm composite with no depth buffer, which is the entire
# reason a sort key can lose a drawable. Neither shipped surface is that, and both answers are
# CHECKED here rather than asserted, because "the app has this bug too" is the claim that would turn
# a research fix into an app emergency.
print("\n== 1. what the SHIPPED surfaces do (this is a research-raster defect only) ==")
ORDER = subprocess.run(["git", "-C", REPO, "grep", "-n", "'flora-layer'", "--",
                        "packages/forest-world/src/scene.test.ts"],
                       capture_output=True, text=True).stdout
layer_line = next((ln for ln in ORDER.splitlines() if "ground-mesh" in ln), "")
check("ground-mesh" in layer_line and layer_line.index("ground-mesh") < layer_line.index(
          "flora-layer"),
      "the SVG scene paints ground-mesh BEFORE flora-layer, and a test holds the order",
      layer_line.split(":", 2)[-1].strip()[:110])

R3F = os.path.join(REPO, "packages", "forest-world-r3f", "src")
r3f_src = "".join(open(os.path.join(R3F, f), encoding="utf-8").read()
                  for f in sorted(os.listdir(R3F)) if f.endswith((".ts", ".tsx"))
                  and not f.endswith(".test.ts"))
check("<Canvas" in r3f_src and not any(k in r3f_src for k in ("renderOrder", "depthWrite",
                                                              "depthTest", "sortObjects")),
      "forest-world-r3f is a DEPTH-BUFFERED r3f scene with no manual draw order",
      "an r3f <Canvas> resolves occlusion per-fragment by z; no renderOrder / depthWrite / "
      "depthTest / sortObjects appears, so there is no draw-list sort to get wrong")

REPORT["shippedSurfaces"] = {
    "svg": {"file": "packages/forest-world/src/scene.ts",
            "layerOrderIsTestEnforced": "packages/forest-world/src/scene.test.ts",
            "verdict": "CLEAN — ground-mesh is a whole layer painted before flora-layer, so no "
                       "flora drawable can sort ahead of the ground it stands on"},
    "r3f": {"package": "packages/forest-world-r3f",
            "verdict": "CANNOT HAVE THE DEFECT BY CONSTRUCTION — a react-three-fiber <Canvas> is a "
                       "depth-buffered 3D scene, so occlusion is decided per fragment by z rather "
                       "than by a painter's draw list. It also carries no flora layer yet (the "
                       "package is the placeholder-mesh spike). This closes PR #1383's open "
                       "caveat, which covered the SVG path alone."},
    "reading": "the 46% loss is a defect of the RESEARCH RASTER. Nothing in packages/** or apps/** "
               "needs this fix today. The rule to carry if the raster pipeline is ever promoted: a "
               "drawable that STANDS ON a surface sorts after that surface, never on its own ground "
               "point alone.",
}

# ================================================================= 2. the fixture geometry
print("\n== 2. delivery on the FIXTURE geometry (the island every prior judgment was made on) ==")
META = mount_fixture()
FIXTURE_CAPS = list(D.ISLAND["capStatuses"])
HEALTHY_CAPS = ["healthy"] * len(FIXTURE_CAPS)
WALL_COLOURS, CELL_COLOURS, LEVELS = unhealthy_colour_sets()
check(not (WALL_COLOURS & CELL_COLOURS),
      "the wall token and the cell tokens of `unhealthy` share NO delivered colour",
      f"{len(WALL_COLOURS)} wall / {len(CELL_COLOURS)} cell entries over levels "
      f"{[round(l, 2) for l in LEVELS]} — so a wall count is a count of walls")

fixture_rates, _fr = delivery_rates(META, FIXTURE_CAPS, "fixture")
healthy_rates, _hr = delivery_rates(META, HEALTHY_CAPS, "fixtureDrivenHealthy")
for label, rates in (("fixture", fixture_rates), ("fixture driven all-healthy", healthy_rates)):
    b, a = rates["withTheOldKey"], rates["asShipped"]
    check(a["deliveringNothingPct"] <= 10.0,
          f"[{label}] at most 10% of placements deliver zero",
          f"{b['deliveringNothingPct']}% -> {a['deliveringNothingPct']}% "
          f"({b['deliveringNothing']} -> {a['deliveringNothing']} of {a['placements']})")
    check(a["occludedByItsOWNCell"] <= 8,
          f"[{label}] at most 8 placements are occluded by the fill of their OWN cell",
          f"{b['occludedByItsOWNCell']} -> {a['occludedByItsOWNCell']}")
    check(a["vegetationPxDelivered"] > b["vegetationPxDelivered"],
          f"[{label}] the vegetation that was always being painted now reaches the raster",
          f"{b['vegetationPxDelivered']} -> {a['vegetationPxDelivered']} px")
    check(a["deliveredIslandPx"] == b["deliveredIslandPx"],
          f"[{label}] the island's delivered area is BYTE-STABLE — a reorder, not a resize",
          f"{a['deliveredIslandPx']} px both ways")
    check(a["medianPxPerSurvivor"] == b["medianPxPerSurvivor"],
          f"[{label}] the SIZE finding is untouched: the median surviving placement is unchanged",
          f"{b['medianPxPerSurvivor']} -> {a['medianPxPerSurvivor']} px per survivor — fixing the "
          f"order does not make a tuft bigger, and that question stays open")

# the signed prediction that made the attribution trustworthy, restated from the shipped code
above = fixture_rates["withTheOldKey"]["aboveVsBelowTheCentroid"]
check(above["aboveTheCellCentroid_paintedFIRST_soTheCellFillErasesIt"]["pct"]
      > 5 * above["belowTheCellCentroid_paintedAFTERTheCell"]["pct"],
      "the diagnosis' SIGNED prediction still holds with the old key reinstated",
      f"above the centroid {above['aboveTheCellCentroid_paintedFIRST_soTheCellFillErasesIt']['pct']}%"
      f" deliver nothing, below it "
      f"{above['belowTheCellCentroid_paintedAFTERTheCell']['pct']}%")

REPORT["fixtureGeometry"] = {"asAuthored": fixture_rates, "drivenAllHealthy": healthy_rates,
                             "island": "chapter2-grass-reads-as-signal-2026-08-16/island.json",
                             "storyId": D.ISLAND.get("storyId")}

# ================================================================= 3. the caps argument
print("\n== 3. `caps=` is authoritative for the WALLS, not only the cells ==")
before_w, before_c, _n = unhealthy_px(HEALTHY_CAPS, authoritative=False)
after_w, after_c, body_px = unhealthy_px(HEALTHY_CAPS, authoritative=True)
check(after_w == 0 and after_c == 0,
      "an all-healthy island composed through `caps=` ALONE carries ZERO unhealthy px",
      f"walls {before_w} -> {after_w} px, cells {before_c} -> {after_c} px, over {body_px} body px")
check(before_w > 0,
      "and the check is not vacuous: with the argument non-authoritative the walls carry it",
      f"{before_w} charcoal `unhealthy` wall px survive on an island with no unhealthy capability")

# MAKE IT FIRE IN THE OTHER DIRECTION: a genuinely unhealthy capability MUST reach the walls.
one_bad = list(HEALTHY_CAPS)
bad_idx = next(i for i, c in enumerate(FIXTURE_CAPS) if c == "unhealthy")
one_bad[bad_idx] = "unhealthy"
fire_w, fire_c, _n2 = unhealthy_px(one_bad, authoritative=True)
check(fire_w > 0 and fire_c > 0,
      "and it FIRES: one genuinely unhealthy capability DOES reach the walls",
      f"cap {bad_idx} unhealthy -> {fire_w} wall px + {fire_c} cell px. A check that can only ever "
      f"report zero is not a check")

# the rim, measured rather than waved away
rim_w, rim_c, _n3 = unhealthy_px(HEALTHY_CAPS, authoritative=True, rim=True)
check(True, "the silhouette rim is reported, not hidden",
      f"{rim_w + rim_c} px on the outline snap to an `unhealthy` entry on an all-healthy island. "
      f"C.back_half authorises this explicitly (the rim darkens from the local colour and "
      f"re-snaps, so it may legally reach another family's entry) — which is why the assertion "
      f"above is made on the island BODY. It is an outline artefact of the closed-palette snap "
      f"against the dark board, carried by no capability, and it is NOT the walls defect")

REPORT["capsAuthority"] = {
    "allHealthyThroughTheArgumentAlone": {
        "nonAuthoritative": {"wallPx": before_w, "cellPx": before_c},
        "authoritative": {"wallPx": after_w, "cellPx": after_c},
        "islandBodyPx": body_px,
    },
    "madeToFire": {"capabilityDrivenUnhealthy": bad_idx, "wallPx": fire_w, "cellPx": fire_c},
    "silhouetteRim": {"unhealthyEntriesOnTheOutline": rim_w + rim_c,
                      "authorisedBy": "C.back_half's own rim rule"},
    "restatedHealthRead": {
        "committedBefore": {"changedDeliveredPx": 21066, "sharePctOfLand": 60.2,
                            "source": "chapter2-grass-reads-as-signal-2026-08-16/grass-report.json "
                                      "at PR #1381, a CELLS-ONLY recolour"},
        "note": "re-rendered in this pass; see grass-report.json signalLegibility.healthRead for "
                "the corrected figure, which is an INCREASE because driving the island to a status "
                "now moves its walls too",
    },
}

# ================================================================= 4. the REAL-CORPUS island
print("\n== 4. delivery on the REAL-CORPUS island — never measured on its own geometry before ==")
REAL_META, REAL = mount_real()
real_caps = list(REAL["capStatuses"])
real_rates, _rr = delivery_rates(REAL_META, real_caps, "realCorpus")
b, a = real_rates["withTheOldKey"], real_rates["asShipped"]
check(a["deliveringNothingPct"] < b["deliveringNothingPct"] / 2.0,
      "[real corpus] the real island inherited the defect and the fix recovers it too",
      f"{b['deliveringNothingPct']}% -> {a['deliveringNothingPct']}% "
      f"({b['deliveringNothing']} -> {a['deliveringNothing']} of {a['placements']} placements)")
check(a["deliveredIslandPx"] == b["deliveredIslandPx"],
      "[real corpus] its delivered area is byte-stable across the change",
      f"{a['deliveredIslandPx']} px both ways")
check(a["vegetationPxDelivered"] > b["vegetationPxDelivered"],
      "[real corpus] vegetation delivered",
      f"{b['vegetationPxDelivered']} -> {a['vegetationPxDelivered']} px")
REPORT["realCorpusIsland"] = {
    "island": "chapter2-healthy-island-2026-08-16/island.json",
    "storyId": REAL.get("storyId"),
    "capabilities": len(real_caps),
    "uatCriteria": len(REAL["uatCriteria"]),
    "testCountsAreTheStorysOwn": True,
    "rates": real_rates,
    "reading": "this geometry delegates to the same compositor and inherited the same loss. It had "
               "never been measured on its own geometry — PR #1383's 'healthy' row is the FIXTURE "
               "driven all-healthy, which is a different island.",
}

# ================================================================= 5. the guards still fire
print("\n== 5. PR #1383's refusals, still armed and still firing ==")
mount_fixture()
FIRED = L.fire(META, FIXTURE_CAPS)
for g in FIRED:
    check(g.get("fired"), f"[inherited] {g['guard']}",
          ", ".join(f"{k}={v}" for k, v in g.items() if k not in ("guard", "fired")))

# assert_projection_unchanged is the guard that makes the repair a REORDERING and not a move. The
# repair now lives in the compositor, so the guard is kept armed by running the OLD data-transform
# route against the shipped one and refusing unless the delivered rasters are byte-identical.
shipped = L.run_captured(META, FIXTURE_CAPS, "cross-check-shipped")
try:
    cross = L.assert_data_route_agrees(META, FIXTURE_CAPS, shipped)
    check(cross["identicalRaster"],
          "assert_projection_unchanged is still armed: the data route and the compositor agree",
          "identical delivered raster, and every placement's INTEGER blit origin is unchanged "
          "(the guard is held to the integer origin, not to float bit-identity — the first version "
          "fired on 1e-13 of float reassociation)")
except SystemExit as e:
    check(False, "assert_projection_unchanged is still armed", str(e).splitlines()[0])

# the new refusal this pass adds: a depth key read off the wrong cell list
try:
    D.decor_depth_key({"cell": 10 ** 6, "g": [0.0, 0.0]}, D.ISLAND["variantB"]["cells"])
    check(False, "a placement naming a cell this composite was not handed is REFUSED")
except SystemExit as e:
    check(True, "a placement naming a cell this composite was not handed is REFUSED",
          str(e).splitlines()[0][:120])

REPORT["refusals"] = FIRED

# ================================================================= 6. determinism + switches home
print("\n== 6. determinism, and both switches left where they belong ==")
r1 = L.run_captured(META, FIXTURE_CAPS, "determinism-1")
r2 = L.run_captured(META, FIXTURE_CAPS, "determinism-2")
check(np.array_equal(r1["rgb"], r2["rgb"]) and np.array_equal(r1["solid"], r2["solid"]),
      "re-composing reproduces the DECODED raster exactly",
      "compared as decoded arrays, never as file bytes — two pixel-identical runs of this track "
      "have already been shown to differ in every PNG's bytes")
check(D.DECOR_SORTS_AFTER_ITS_CELL is True and D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS is True,
      "both defect switches are back to their shipped value",
      f"DECOR_SORTS_AFTER_ITS_CELL={D.DECOR_SORTS_AFTER_ITS_CELL}, "
      f"CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS={D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS}")

# ================================================================= the report
REPORT["checks"] = CHECKS
REPORT["scale"] = {
    "deliveredCanvasPx": [C.CANVAS_W, C.CANVAS_H],
    "supersample": C.SS,
    "groundUnitsPerDeliveredPx": 1.0,
    "cameraElevationDeg": C.ELEV,
    "blenderRendersThisPass": 0,
    "note": "no piece is re-rendered here, so no number in this file depends on a sample count and "
            "none is compared across passes that rendered their own pieces. The app constant "
            "LAND_CAMERA_ELEVATION_DEG is 20 and is neither read nor touched.",
}
REPORT["guardWiring"] = {
    "wired": False,
    "statedPlainly": "The regression guard is THIS FILE, and it is NOT wired to a `check:*` gate "
                     "rung. Two reasons, both structural rather than an omission. (1) Wiring it "
                     "means editing `package.json` and `packages/cli/src/gate-order.ts`, which is "
                     "outside `docs/research/**` and therefore outside the owner's 2026-08-16 fence "
                     "for this track. (2) It costs ~6 min of numpy compositing and needs a Python "
                     "toolchain the gate does not otherwise require, and because `docs/**` is a "
                     "root path in the affected-scope classifier every branch would pay it. What "
                     "would wire it, when the track comes out from behind the fence: a "
                     "`check:research-compositor` script running `verify.py` and asserting its "
                     "exit code, added to the gate plan.",
    "assertionItWouldCarry": "on the shipped piece set at most 10% of placements may deliver zero "
                             "px and at most 8 may be occluded by the fill of their own cell; and "
                             "an all-healthy island composed through `caps=` alone carries zero "
                             "`unhealthy` px in its body.",
}

n_pass = sum(1 for c in CHECKS if c["pass"])
REPORT["result"] = {"checks": len(CHECKS), "passed": n_pass, "green": n_pass == len(CHECKS)}
out = os.path.join(HERE, "order-and-caps-report.json")
json.dump(REPORT, open(out, "w"), indent=1)
print(f"\n{n_pass}/{len(CHECKS)} checks green — wrote {os.path.basename(out)}")
sys.exit(0 if n_pass == len(CHECKS) else 1)
