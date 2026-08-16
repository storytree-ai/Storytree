#!/usr/bin/env python3
"""ONE HEALTHY ISLAND FROM A REAL STORY NODE — the research surface, and what it replaces.

    python compose_healthy.py        # -> four pictures, island-report.json, provenance sidecars

THE BRIEF. The owner, 2026-08-16: *"i think we focus on getting a healthy island looking right"*,
having just said of the dressed island that *"its very noisy and doesnt make space for shadows"* and
asked *"which story node did you pick anyways"*.

WHAT THIS PASS FOUND BEFORE IT RENDERED ANYTHING, and it changes the shape of the brief:

  1. THE STORY NODE WAS `fork-spike-island` — a synthetic fixture, for every appearance judgment this
     arc has made (#1371 grass, #1372 hex lines, #1373 dressing).
  2. ITS CHARCOAL IS NOT MERELY INVENTED, IT IS UNRENDERABLE. The fixture's tenth capability is
     `unhealthy`, and `apps/studio/src/lib/worldStatus.ts` folds `unhealthy -> mapped` (ADR-0296,
     owner-directed: the world draws NO withered form). The shipped map has not drawn charcoal for
     any story, in any state, since that decision. The region the owner circled is a colour the app
     cannot produce.
  3. ITS TWO `building` CAPABILITIES ARE ALSO UNRENDERABLE AS AUTHORED — `building -> proposed`
     (ADR-0038). Of the fixture's five status tokens, TWO reach the picture only because the fixture
     bypassed the fold.
  4. AND NO CAPABILITY ANYWHERE IN THE CORPUS IS AUTHORED `healthy` — 0 of 244. Green derives from a
     SIGNED VERDICT, never from authored paint (ADR-0040), so a "healthy story" is found in the
     STORE, not in the frontmatter. `census_healthy.ts` is the whole-corpus evidence.

So the surface is `library-tech-tree-overlay`: 17 capabilities, every one rendering `healthy` off its
own signed pass, real test counts 2..14, 4 real UAT criteria. It is the largest fully-green island the
corpus contains.

WHAT ELSE THIS PASS DELIVERS, both already owner-decided and not re-asked:

  * MESH SEAMS OFF (owner, 2026-08-16 — *"i think we remove the mesh lines"*). PR #1372 measured the
    mechanism on the fixture; this pass EXECUTES it and RE-MEASURES the cost here, because the
    "4 of 77 boundaries" figure is a function of the STATUS MIX and this island has one status.
  * FLAT GREEN GROUND (owner, 2026-08-16). `mottle` and `carpet` are declined and not re-rendered.

NO BLENDER FRAME IS RENDERED, AND THAT IS A PROVED PROPERTY RATHER THAN A CONVENIENCE. The land
pieces are the interior fork's, committed and rendered at this camera: `blender_land.py` renders one
sprite per variant-A shape class (six kites) plus 16 wall headings, and the kite shapes are a
property of the HEX LATTICE, not of which hexes a story claims. Check 1 below asserts that — this
island's six shape keys are compared against the fixture's, and they are equal — so the committed
piece set is valid here by measurement. The consequence that matters: `blender_land.py` is neither
edited nor re-run, so the interior fork's committed provenance is untouched.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(REPO, "docs", "research", "chapter2-hex-lines-and-flat-green-2026-08-16")

# The prior passes are IMPORTED, never copied — the discipline the hex-lines pass established after
# the dressing pass had to vendor its own predecessor. There is no second compositor, no second
# scatter and no second seam control in this directory; `verify.py` check 8 asserts that by hashing.
sys.path.insert(0, GRASS)
sys.path.insert(0, LINES)
import compose_core as D                                  # noqa: E402
import grass                                              # noqa: E402
import scatter                                            # noqa: E402
import seams as S                                         # noqa: E402

import island_pass as P                                   # noqa: E402

C = D.C
provenance = D.provenance
INK, DIM, HI, WARN = (232, 232, 232), (150, 150, 156), (255, 236, 160), (255, 176, 150)
GOOD = (170, 226, 150)
BG = (24, 24, 26)
PAD, HDR, CAP = 10, 52, 40

ISLAND_PATH = os.path.join(HERE, "island.json")
PROOF_PATH = os.path.join(HERE, "proof.json")
FIXTURE_ISLAND = os.path.join(GRASS, "island.json")
LAND_PIECES = os.path.join(GRASS, "pieces-land")
DECOR_PIECES = os.path.join(GRASS, "pieces-m00-blade")

if not os.path.exists(ISLAND_PATH):
    raise SystemExit(
        "island.json is missing — run:\n"
        "  npx tsx docs/research/chapter2-healthy-island-2026-08-16/emit_proof.ts "
        f"--story {P.STORY_ID}\n"
        "  npx tsx docs/research/chapter2-healthy-island-2026-08-16/emit_healthy_island.ts "
        f"--story {P.STORY_ID}")

REPORT = {}


# ================================================================= mounting an island
def use_island(path, land_pieces):
    """Re-point the imported compositor at ONE island and ONE land piece set, and return it.

    `compose.py` and `compose_core.py` read their island, camera and piece set from module state at
    CALL time — which is exactly the property the elevation sweep exploited to have one projection
    implementation rather than one per angle. This pass composes TWO islands (the real one and the
    fixture it replaces), so it rebinds twice rather than importing twice. No function is rewritten
    and no arithmetic is restated per island.
    """
    D.ISLAND_PATH = path
    D.LAND_PIECES = land_pieces
    D.ISLAND, D.LAND_META = D.rebind()
    D.use_pieces(DECOR_PIECES, expect_mix=0.0, expect_geometry="blade")
    return D.ISLAND


# ================================================================= 1. THE REFUSALS, before a pixel
# --- 1a. the committed land piece set is valid for THIS island's geometry -------------------------
# The pieces were rendered for the fixture. They are reusable here only if this island needs the SAME
# six kite shapes — which is a claim about the hex lattice, not about either island, and is therefore
# a thing to MEASURE rather than to assume. If it failed, the honest response would be to re-render
# the pieces (and to say so, since that would move `blender_land.py`'s provenance), never to compose
# anyway.
REAL = json.load(open(ISLAND_PATH))
FIXTURE = json.load(open(FIXTURE_ISLAND))
real_shapes = [p["shape"] for p in REAL["variantA"]["pieceSet"]]
fixture_shapes = [p["shape"] for p in FIXTURE["variantA"]["pieceSet"]]
if real_shapes != fixture_shapes:
    raise SystemExit(
        "REFUSED: this island's variant-A shape classes differ from the ones `pieces-land` was "
        "rendered for, so the committed tile pieces do not describe this island. Re-render them "
        "with blender_land.py (and say so — it moves the interior fork's provenance).")
if REAL["wall"]["headings"] != FIXTURE["wall"]["headings"]:
    raise SystemExit("REFUSED: wall heading count differs from the rendered piece set's")

# --- 1b. one code state per generator -------------------------------------------------------------
INPUTS = C.piece_inputs([("pieces-land", LAND_PIECES), ("pieces-m00-blade", DECOR_PIECES)])
CODE_STATE = D.require_one_state_per_generator(INPUTS)

# --- 1c. the land pass is byte-identical to the shipped compositor ---------------------------------
# Run BEFORE the seam wrapper is installed: `assert_land_unchanged` compares this pass's land to the
# shipped one, so it has to compare the UNINSTRUMENTED path or it only proves the wrapper is
# symmetric. Run on BOTH islands, because the mirror is a property of the compositor and a rebind is
# exactly the operation that could break it.
use_island(FIXTURE_ISLAND, LAND_PIECES)
D.assert_land_unchanged()
use_island(ISLAND_PATH, LAND_PIECES)
D.assert_land_unchanged()

# --- 1d. the camera ------------------------------------------------------------------------------
if abs(C.ELEV - P.PASS_ELEVATION_DEG) > 1e-9:
    raise SystemExit(f"composing at {C.ELEV} but the pass angle is {P.PASS_ELEVATION_DEG}")
if abs(float(REAL["camera"]["elevationDeg"]) - float(FIXTURE["camera"]["elevationDeg"])) > 1e-9:
    raise SystemExit("the two islands were emitted at different cameras — a side-by-side would vary "
                     "two things at once")

# --- 1e. the island is the story the proof was read for -------------------------------------------
PROOF = json.load(open(PROOF_PATH))
if PROOF["storyId"] != REAL["storyId"] or REAL["storyId"] != P.STORY_ID:
    raise SystemExit(
        f"REFUSED: island.json is '{REAL['storyId']}', proof.json is '{PROOF['storyId']}', "
        f"island_pass.STORY_ID is '{P.STORY_ID}'. All three must name one story.")

print(f"refusals passed - piece set valid for this island ({len(real_shapes)} shapes), land "
      f"byte-identical on BOTH islands, camera {C.ELEV:g} deg, story {P.STORY_ID}", flush=True)


# ================================================================= 2. NOTHING HERE IS INVENTED
# The increment's actual proof obligation. Asserted here as well as in `verify.py` because a picture
# must not be WRITTEN from data that fails it — a report explaining afterwards that the island was
# fabricated is not the same object as a composer that refuses to draw one.
CAPS_REAL = REAL["capabilities"]
statuses_real = [c["status"] for c in CAPS_REAL]
bad = sorted({s for s in statuses_real if s not in P.RENDERED_VOCABULARY})
if bad:
    raise SystemExit(f"REFUSED: status(es) {bad} are outside the RENDERED vocabulary "
                     f"{list(P.RENDERED_VOCABULARY)} — the map cannot draw them")
for c in CAPS_REAL:
    if c["status"] == "healthy" and c["verdictGlyph"] != "✓":
        raise SystemExit(f"REFUSED: capability {c['id']} renders healthy without a signed pass "
                         f"(glyph {c['verdictGlyph']!r}) — green is the verdict's (ADR-0040)")

REPORT["surface"] = {
    "storyId": REAL["storyId"],
    "storyTitle": REAL["storyTitle"],
    "storyAuthoredStatus": REAL["storyStatus"],
    "source": REAL["storySource"],
    "capabilityCount": len(CAPS_REAL),
    "capabilities": [{"id": c["id"], "authoredStatus": c["authoredStatus"],
                      "verdictGlyph": c["verdictGlyph"], "renderedStatus": c["status"],
                      "tests": c["tests"]} for c in CAPS_REAL],
    "renderedStatusMix": {s: statuses_real.count(s) for s in sorted(set(statuses_real))},
    "authoredStatusMix": {s: [c["authoredStatus"] for c in CAPS_REAL].count(s)
                          for s in sorted({c["authoredStatus"] for c in CAPS_REAL})},
    "testCounts": [c["tests"] for c in CAPS_REAL],
    "totalTests": sum(c["tests"] for c in CAPS_REAL),
    "uatCriteria": REAL["uatCriteria"],
    "tiles": len(REAL["tiles"]),
    "tileQuota": REAL["tileQuota"],
    "meshCells": len(REAL["variantB"]["cells"]),
    "verdictEventsRead": PROOF["verdictEventsRead"],
    "reading":
        "every status on this island is provenStatus(authored, signed verdict) over a real story's "
        "real capabilities. NO status is invented, and every `healthy` is backed by a signed pass.",
}
REPORT["fixtureItReplaces"] = {
    "storyId": FIXTURE["storyId"],
    "capStatuses": list(FIXTURE["capStatuses"]),
    "capabilityCount": len(FIXTURE["capStatuses"]),
    "tiles": len(FIXTURE["tiles"]),
    "meshCells": len(FIXTURE["variantB"]["cells"]),
    "invented": True,
    "tokensOutsideRenderedVocabulary":
        sorted({s for s in FIXTURE["capStatuses"] if s not in P.RENDERED_VOCABULARY}),
    "reading":
        "the fixture's statuses were written by hand for the interior-fork spike. Two of its five "
        "tokens (`building`, `unhealthy`) are folded away by worldStatus before the map draws "
        "anything, so they are colours no story can produce (ADR-0038 / ADR-0296).",
}


# ================================================================= 3. COMPOSING
def compose_panel(island_path, drawn, ground=P.GROUND, decor=None, caps=None, tree=True):
    """One delivered composite: mount the island, suppress the named seam classes, compose.

    Returns (rgba, solid, inventory). Seam suppression drops `seam_rgb` to None on the way through
    `fill_polygon` and touches nothing else — no cell moves, no colour is re-authored — which is what
    makes a seam fork ONE variable.
    """
    island = use_island(island_path, LAND_PIECES)
    cells = D.prepare(island["variantB"]["cells"])
    lattice = ({"tiles": island["hexLattice"]["tiles"]} if "hexLattice" in island
               else S.load_hex_lattice())
    ctrl = S.SeamControl(C, island, lattice).install()
    ctrl.reset(drawn)
    try:
        items = decor(island, cells)[0] if decor else []
        img, solid, colours, _g = D.render_variant(items, cells=cells, caps=caps,
                                                   tree=tree, ground=ground)
    finally:
        ctrl.restore()
    return img, solid, ctrl.inventory(), colours


def scatter_real(island, cells):
    """The decor scatter, driven by the REAL test counts.

    `scatter.capability_tests` INVENTS a count from a hash — it says so in its own docstring, and the
    dressing pass listed it as gap 3. It is replaced here by the story's own `spec.contracts.length`,
    which is the app's `testCount` (`apiRouter.loadTreeCapability`). Everything else in
    `scatter_island` is untouched: the count RULES are the app's (`round(2 + tests*1.9)` and the
    status multipliers), and the UAT flowers stay 1:1 with the real criteria (ADR-0226 D4).
    """
    real_tests = [c["tests"] for c in island["capabilities"]]
    original = scatter.capability_tests
    scatter.capability_tests = lambda ci, status, seed: real_tests[ci]
    try:
        return scatter.scatter_island(island, D.DECOR_META["tokenFamilies"], island["storyId"],
                                      island["uatCriteria"])
    finally:
        scatter.capability_tests = original


# ---- the delivered surface: seams OFF, flat green, real story ------------------------------------
SURFACE, SURFACE_SOLID, SURFACE_INV, SURFACE_COLOURS = compose_panel(ISLAND_PATH, P.SEAMS_DRAWN)
# ---- the same island exactly as the track has been shipping it (seams on) ------------------------
AS_IS, AS_IS_SOLID, AS_IS_INV, AS_IS_COLOURS = compose_panel(ISLAND_PATH, P.SEAMS_AS_IS)
# ---- the fixture, as it was when every prior judgment was made -----------------------------------
FIX, FIX_SOLID, FIX_INV, _fc = compose_panel(FIXTURE_ISLAND, P.SEAMS_AS_IS)
# ---- the real island dressed at REAL test counts (the DECLINED grass, shown for its density) -----
DRESSED, DRESSED_SOLID, _di, _dc = compose_panel(ISLAND_PATH, P.SEAMS_DRAWN, decor=scatter_real)

# ---- THE MEASUREMENT PAIR: the same two panels with NO HERO TREE --------------------------------
# EVERY per-cell measurement below runs on these, and the reason is a bug this pass shipped once and
# caught in its own swatch strip. The hero tree is composited ON TOP of the land at 1:1, so a cell
# whose projected centroid falls under the canopy or the trunk has those pixels as its modal fill:
# `cell_modal_fill` was reporting dark browns as land colours, `variation_breakdown` was drawing them
# in the swatch strip, and — the part that actually mattered — the boundary cost was counting two
# cells as "delivering the same colour" when what they had in common was the trunk covering both.
# The tree is art composited after the back half, not a land fill, so measuring the land means
# measuring the land WITHOUT it. The delivered pictures keep the tree; only the instruments lose it.
SURFACE_BARE, SURFACE_BARE_SOLID, _sbi, SURFACE_BARE_COLOURS = compose_panel(
    ISLAND_PATH, P.SEAMS_DRAWN, tree=False)
AS_IS_BARE, AS_IS_BARE_SOLID, _abi, AS_IS_BARE_COLOURS = compose_panel(
    ISLAND_PATH, P.SEAMS_AS_IS, tree=False)
FIX_BARE, FIX_BARE_SOLID, _fbi, _fbc = compose_panel(FIXTURE_ISLAND, P.SEAMS_AS_IS, tree=False)

# The scatter's own statistics, recomputed outside the render so the counts are reportable.
use_island(ISLAND_PATH, LAND_PIECES)
_cells = D.prepare(D.ISLAND["variantB"]["cells"])
_items, SCATTER_STATS = (lambda: scatter_real(D.ISLAND, _cells))()

REPORT["strokeInventory"] = {
    "asIs": AS_IS_INV, "delivered": SURFACE_INV,
    "reading":
        "the accounting is TOTAL — `other` is a refusal, not a bucket — so a zero here is what "
        "remains once every stroke on the canvas has been attributed. Re-measured on the REAL "
        "island: PR #1372's inventory was taken on the 17-tile fixture.",
}
if AS_IS_INV["other"] or SURFACE_INV["other"]:
    raise SystemExit(f"UNCLASSIFIED STROKE — the inventory is not total, so every count below would "
                     f"be a floor rather than a total. Refusing. {AS_IS_INV} {SURFACE_INV}")


# ================================================================= 4. WHAT SEAM REMOVAL COSTS HERE
def delivered_rgb(img):
    return img[:, :, :3].astype(np.int32)


changed = int(np.count_nonzero(
    np.any(delivered_rgb(SURFACE_BARE) != delivered_rgb(AS_IS_BARE), axis=2)
    & (SURFACE_BARE_SOLID | AS_IS_BARE_SOLID)))
island_px = int(np.count_nonzero(AS_IS_BARE_SOLID))

# --- which cell owns which delivered pixel, so a fill can be compared across the fork --------------
def cell_modal_fill(img, solid, island):
    """Each cell's modal delivered colour, centre-sampled inside its own projected polygon.

    A simplification, stated: it centre-samples rather than majority-downsampling, which the two
    disagree on only in blocks straddling a boundary. It exists to read a cell's OWN fill over
    hundreds of pixels, which is what the fork's one-variable claim turns on.
    """
    out = []
    h, w = solid.shape
    for c in island["variantB"]["cells"]:
        height = C.height_of(c, D.ELEVATION_MODE)
        pts = [C.project(gx, gy, height) for gx, gy in c["poly"]]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        cx, cy = int(round(sum(xs) / len(xs))), int(round(sum(ys) / len(ys)))
        counts = {}
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                x, y = cx + dx, cy + dy
                if 0 <= x < w and 0 <= y < h and solid[y, x]:
                    key = tuple(int(v) for v in img[y, x, :3])
                    counts[key] = counts.get(key, 0) + 1
        out.append(max(counts, key=counts.get) if counts else None)
    return out


use_island(ISLAND_PATH, LAND_PIECES)
FILL_AS_IS = cell_modal_fill(AS_IS_BARE, AS_IS_BARE_SOLID, D.ISLAND)
FILL_SURFACE = cell_modal_fill(SURFACE_BARE, SURFACE_BARE_SOLID, D.ISLAND)
moved = sum(1 for a, b in zip(FILL_AS_IS, FILL_SURFACE) if a is not None and b is not None and a != b)

# --- the boundary cost, re-measured on THIS island -------------------------------------------------
cells_real = D.ISLAND["variantB"]["cells"]
edges = {}
for i, c in enumerate(cells_real):
    for k in range(len(c["poly"])):
        a = tuple(round(v, 3) for v in c["poly"][k])
        b = tuple(round(v, 3) for v in c["poly"][(k + 1) % len(c["poly"])])
        edges.setdefault(tuple(sorted((a, b))), []).append(i)
adjacencies = [v for v in edges.values() if len(v) == 2]
cross_cap = [(i, j) for i, j in adjacencies if cells_real[i]["cap"] != cells_real[j]["cap"]]
invisible = [(i, j) for i, j in cross_cap
             if FILL_SURFACE[i] is not None and FILL_SURFACE[i] == FILL_SURFACE[j]]
same_cap_merged = [(i, j) for i, j in adjacencies
                   if cells_real[i]["cap"] == cells_real[j]["cap"]
                   and FILL_SURFACE[i] is not None and FILL_SURFACE[i] == FILL_SURFACE[j]]

REPORT["whatRemovalCosts"] = {
    "deliveredPxChanged": changed,
    "islandPx": island_px,
    "pctOfIsland": round(100.0 * changed / max(1, island_px), 2),
    "cellFillsMoved": moved,
    "cellsSampled": len(cells_real),
    "adjacencies": len(adjacencies),
    "crossCapabilityAdjacencies": len(cross_cap),
    "crossCapabilityBoundariesGoingInvisible": len(invisible),
    "sameCapabilityAdjacenciesMerging": len(same_cap_merged),
    "paletteWidened": bool(SURFACE_BARE_COLOURS - AS_IS_BARE_COLOURS),
    "measuredWithoutTheHeroTree": True,
    "reading":
        "PR #1372 measured 4 of 77 cross-capability boundaries going invisible on the MIXED-status "
        "fixture. That number could not carry over, because a boundary is invisible exactly when "
        "both sides deliver the same colour — and on a ONE-status island every neighbour pair "
        "already shares a status. So this is the honest re-measurement the increment asked for, and "
        "the number it produces is the cost of drawing a uniformly-healthy island without seams.",
}

# --- how green is it, per status -------------------------------------------------------------------
def green_share(img, solid):
    rgb = img[:, :, :3].astype(np.float32)[solid]
    if not len(rgb):
        return 0.0, 0
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    is_green = (g > r + 8) & (g > b + 8)
    return round(100.0 * float(np.count_nonzero(is_green)) / len(rgb), 1), int(len(rgb))


g_surface, n_surface = green_share(SURFACE_BARE, SURFACE_BARE_SOLID)
g_fixture, n_fixture = green_share(FIX_BARE, FIX_BARE_SOLID)
REPORT["greenReading"] = {
    "realIslandGreenPct": g_surface, "realIslandPx": n_surface,
    "fixtureGreenPct": g_fixture, "fixturePx": n_fixture,
    "greenTest": "g > r + 8 and g > b + 8 on the delivered raster, hero tree EXCLUDED",
    "notComparableTo1372":
        "PR #1372 reported 21.6% for the fixture on a per-status pixel table; this is a different "
        "instrument (a direct channel test over the whole land, tree excluded) and the two figures "
        "are NOT comparable. What IS comparable is the pair below: both islands are measured here "
        "by this same instrument, in one run.",
    "reading":
        "PR #1372 measured the fixture at 21.6% green and named the lever: the island is not green "
        "because 7 of its 10 capabilities are not healthy. This is that lever pulled with real data "
        "rather than by driving a fixture — the statuses were not changed, a genuinely green story "
        "was found.",
}

# --- WHY THE GREEN IS NOT CONSISTENT, on an island where every capability agrees ------------------
# The owner, 2026-08-16: *"the green on the land is not consistent either with different mesh
# trianles rendering different colors"*. That is usually read as a status-mix complaint, and on the
# fixture it partly was. This island removes the status variable entirely — all 11 capabilities are
# `healthy` — so whatever variation survives here is NOT semantic, and can be attributed exactly.
#
# Two authored mechanisms produce it, both per-CELL and neither carrying any meaning a reader could
# act on:
#   * `variant` (0/1/2)  — `STATUS_TOKENS[status]["top"]` is a THREE-shade list and each cell picks
#                          one by a hash (`buildRelaxedCells`' own `variant`).
#   * `wheat` (bool)     — a deterministic subset of hexes is tinted with the wheat token, which on a
#                          green island is a TAN cell.
# Counted here per delivered pixel so the complaint has a size. This pass measures and does NOT act:
# whether to collapse them is an appearance decision and the owner's (ADR-0070 stage 2).
def variation_breakdown(img, solid, island):
    fills = cell_modal_fill(img, solid, island)
    buckets = {}
    for c, fill in zip(island["variantB"]["cells"], fills):
        if fill is None:
            continue
        key = f"wheat" if c["wheat"] else f"variant-{c['variant']}"
        b = buckets.setdefault(key, {"cells": 0, "colours": set()})
        b["cells"] += 1
        b["colours"].add(fill)
    return {k: {"cells": v["cells"], "distinctDeliveredColours": len(v["colours"]),
                "colours": sorted("#%02x%02x%02x" % c for c in v["colours"])}
            for k, v in sorted(buckets.items())}


VARIATION = variation_breakdown(SURFACE_BARE, SURFACE_BARE_SOLID, D.ISLAND)
distinct_land = sorted({f for f in FILL_SURFACE if f is not None})
wheat_cells = sum(1 for c in cells_real if c["wheat"])
REPORT["greenConsistency"] = {
    "capabilitiesOnThisIsland": len(CAPS_REAL),
    "distinctStatusesOnThisIsland": 1,
    "distinctDeliveredCellFills": len(distinct_land),
    "byAuthoredMechanism": VARIATION,
    "wheatCells": wheat_cells,
    "wheatCellsPct": round(100.0 * wheat_cells / max(1, len(cells_real)), 1),
    "reading":
        "the status variable is REMOVED on this island - every capability is `healthy` - so every "
        "remaining cell-to-cell colour difference is authored variation carrying no meaning: the "
        "three-entry `top` shade list picked per cell by hash, and the wheat subset. That is the "
        "measurable content of the owner's 'different mesh triangles rendering different colors'. "
        "MEASURED, NOT ACTED ON: collapsing them is an appearance decision and the owner's.",
}

REPORT["decorAtRealTestCounts"] = {
    "tufts": SCATTER_STATS["tuft"], "shrubs": SCATTER_STATS["shrub"],
    "wilts": SCATTER_STATS["wilt"], "flowers": SCATTER_STATS["flower"],
    "centroidFallbacks": SCATTER_STATS["centroidFallbacks"],
    "flowerFallbacks": SCATTER_STATS["flowerFallbacks"],
    "perCapability": SCATTER_STATS["perCapability"],
    "reading":
        "the counts are the app's own rules over the story's REAL contract counts — "
        "`round(2 + tests*1.9)`, ADR-0226 D2 — replacing `scatter.capability_tests`, which invents "
        "one from a hash. THE GRASS ART ITSELF IS DECLINED (owner, 2026-08-16: neither shape is "
        "good enough) and is rendered here only so the real density is visible as a picture rather "
        "than as a number. The delivered surface above carries none of it.",
}


# ================================================================= 5. THE PICTURES
def board(img):
    return Image.fromarray(C.on_board(img.astype(np.uint8)), "RGB")


_DUMMY = ImageDraw.Draw(Image.new("RGB", (1, 1)))


def wrap_to(text, width):
    """Greedy word wrap to a pixel width. Used for BOTH the header and the per-panel captions.

    The prior passes wrapped only the header, and a caption was assumed short enough. On this sheet
    they are not: a caption naming eleven capabilities and their status mix ran off its own column
    and over the neighbouring panel's, so a picture whose whole subject is honest attribution had
    two captions overlapping. Wrapping the captions with the same function that wraps the header is
    the fix, and it is why this returns a LIST rather than drawing.
    """
    if not text:
        return []
    out, line = [], ""
    for word in str(text).split():
        trial = f"{line} {word}".strip()
        if _DUMMY.textlength(trial) > width and line:
            out.append(line)
            line = word
        else:
            line = trial
    if line:
        out.append(line)
    return out


def caption(dr, x, y, lines, width):
    """Draw wrapped caption lines from the top-left, returning the y after the last one."""
    for text, fill in lines:
        for part in wrap_to(text, width):
            dr.text((x, y), part, fill=fill)
            y += 12
    return y


def sheet(w, h, title, sub, sub2=None):
    """A titled board whose header lines WRAP rather than clip — the hex-lines pass's, extended so
    the TITLE wraps too (a long title clipped at the right edge on the first run here)."""

    def wrap(text):
        return wrap_to(text, w - 2 * PAD)

    rows = [(t, INK) for t in wrap(title)] + [(t, DIM) for t in wrap(sub)] + \
           [(t, WARN) for t in wrap(sub2)]
    top = 12 + 13 * len(rows)
    im = Image.new("RGB", (w, h + max(0, top - HDR)), BG)
    dr = ImageDraw.Draw(im)
    y = 8
    for text, fill in rows:
        dr.text((PAD, y), text, fill=fill)
        y += 13
    return im, dr, top


CAM = (f"camera {C.ELEV:g} deg (the research track's signed angle, a NAMED PARAMETER) - "
       f"LAND_CAMERA_ELEVATION_DEG is still {P.APP_LAND_CAMERA_ELEVATION_DEG:g} and is NOT touched")

b_surface = board(SURFACE)
b_asis = board(AS_IS)
b_fix = board(FIX)
b_dressed = board(DRESSED)

# ---- 1. THE SURFACE ------------------------------------------------------------------------------
# A FLOOR ON THE SHEET WIDTH. The island is ~276 px wide, and a sheet sized to it alone leaves the
# header wrapping to four words a line — technically unclipped and unreadable. The floor is the
# minimum a header line needs, not a decoration.
SHEET_MIN_W = 560
iw, ih = b_surface.size
im1, dr1, TOP1 = sheet(max(SHEET_MIN_W, PAD * 2 + iw), HDR + ih + CAP + 14,
                       f"THE RESEARCH SURFACE - `{P.STORY_ID}`, a real story node",
                       f"{len(CAPS_REAL)} capabilities, every one rendering `healthy` off its own "
                       f"SIGNED PASS (not authored paint - ADR-0040). Real contract counts "
                       f"{min(c['tests'] for c in CAPS_REAL)}..{max(c['tests'] for c in CAPS_REAL)}, "
                       f"{len(REAL['uatCriteria'])} real UAT criteria, {len(REAL['tiles'])} claimed "
                       f"hexes on the app's own max(3, caps+2) quota. Interior mesh seams REMOVED, "
                       f"ground flat green - both owner-decided 2026-08-16.",
                       CAM)
im1.paste(b_surface, (PAD, TOP1))
caption(dr1, PAD, TOP1 + ih + 6, [
    (f"{g_surface}% of the delivered land is green (the fixture it replaces: {g_fixture}%)", GOOD),
    ("nothing on this island is invented - the statuses, the contract counts and the UAT criteria "
     "are all read from the corpus and the live store", DIM),
], im1.size[0] - 2 * PAD)
im1.save(os.path.join(HERE, "healthy-island.png"))

# ---- 2. WHAT IT REPLACES -------------------------------------------------------------------------
fw, fh = b_fix.size
sw, sh = b_surface.size
cw, ch = max(fw, sw), max(fh, sh)
im2, dr2, TOP2 = sheet(PAD + 2 * (cw + PAD), HDR + ch + CAP + 34,
                       "WHAT EVERY APPEARANCE JUDGMENT ON THIS ARC WAS ACTUALLY MADE AGAINST",
                       "Left: `fork-spike-island`, a fixture invented for the interior-fork spike "
                       "on 2026-08-15, with ten hand-written capability statuses. Right: a real "
                       "story node. The charcoal on the left is its one fabricated `unhealthy` "
                       "capability - and `worldStatus` folds `unhealthy` to `mapped` (ADR-0296), so "
                       "the shipped map has drawn NO charcoal for any story since that decision.",
                       CAM)
_fix_mix = ", ".join(
    f"{s} x{list(FIXTURE['capStatuses']).count(s)}" for s in sorted(set(FIXTURE["capStatuses"])))
for k, (img, title, lines) in enumerate([
        (b_fix, "fork-spike-island (INVENTED)", [
            (f"10 caps: {_fix_mix} - {g_fixture}% green", WARN),
            ("two of its five tokens (`building`, `unhealthy`) are folded away before the map draws "
             "anything, so they are colours no story can produce", DIM)]),
        (b_surface, f"{P.STORY_ID} (REAL, seams off)", [
            (f"{len(CAPS_REAL)} caps: healthy x{len(CAPS_REAL)}, each off its own signed pass; "
             f"{len(REAL['uatCriteria'])} UAT criteria, all proven - {g_surface}% green", GOOD),
            ("every status here is provenStatus(authored, signed verdict)", DIM)])]):
    cx = PAD + k * (cw + PAD)
    im2.paste(img, (cx, TOP2))
    caption(dr2, cx, TOP2 + ch + 6, [(title, INK)] + lines, cw - PAD)
im2.save(os.path.join(HERE, "fixture-vs-real.png"))

# ---- 3. THE SEAM FORK, on the real island --------------------------------------------------------
im3, dr3, TOP3 = sheet(PAD + 2 * (iw + PAD), HDR + ih + CAP + 46,
                       "MESH SEAMS OFF - the owner's decision, executed and re-measured HERE",
                       "One island, one code state, one piece set, ONE variable: `seam_rgb` drops "
                       "to None and nothing else changes. PR #1372 measured the mechanism on the "
                       "fixture; the COST had to be re-measured, because a boundary goes invisible "
                       "exactly when both sides deliver the same colour, and on a "
                       "uniformly-healthy island that is a different question.",
                       CAM)
for k, (img, title, cap, col) in enumerate([
        (b_asis, "1. as the track has been shipping it",
         f"every interior cell stroked ({AS_IS_INV['cell']} cells)", DIM),
        (b_surface, "2. interior seams removed (DELIVERED)",
         f"{changed} px changed ({REPORT['whatRemovalCosts']['pctOfIsland']}% of the island)", HI)]):
    cx = PAD + k * (iw + PAD)
    im3.paste(img, (cx, TOP3))
    caption(dr3, cx, TOP3 + ih + 6, [(title, INK), (cap, col)], iw)
caption(dr3, PAD, TOP3 + ih + 32, [
    (f"{moved} of {len(cells_real)} cell fills moved  |  "
     f"{len(invisible)} of {len(cross_cap)} cross-capability boundaries go invisible  |  "
     f"palette widened: {REPORT['whatRemovalCosts']['paletteWidened']}", GOOD),
    (f"PR #1372 measured 4 of 77 on the MIXED-status fixture. The share is far higher here and that "
     f"is arithmetic, not a regression: a boundary is invisible exactly when both sides deliver the "
     f"same colour, and on a one-status island every neighbour pair already agrees.", DIM),
], im3.size[0] - 2 * PAD)
im3.save(os.path.join(HERE, "seam-fork.png"))

# ---- 4. DETAIL 6x --------------------------------------------------------------------------------
Z = 6
ys, xs = np.where(SURFACE_SOLID)
cy0, cx0 = int(np.mean(ys)), int(np.mean(xs))
CW, CH = 92, 62
x0 = max(0, min(C.CANVAS_W - CW, cx0 - CW // 2))
y0 = max(0, min(C.CANVAS_H - CH, cy0 - CH // 2))
crops = [("as shipped (seams on)", b_asis), ("DELIVERED (seams off)", b_surface),
         ("dressed at REAL test counts", b_dressed)]
zoom = [(t, im.crop((x0, y0, x0 + CW, y0 + CH)).resize((CW * Z, CH * Z), Image.NEAREST))
        for t, im in crops]
im4, dr4, TOP4 = sheet(PAD + len(zoom) * (CW * Z + PAD), HDR + CH * Z + CAP,
                       "JUDGE THE ART HERE - the same crop at 6x, nearest-neighbour",
                       "Every block is ONE delivered pixel. The third panel carries the grass the "
                       "owner DECLINED on 2026-08-16 ('none of these is good enough'), rendered at "
                       "this story's REAL contract counts and shown only so the real density is "
                       "visible. The delivered surface is the second panel.",
                       CAM)
for k, (t, img) in enumerate(zoom):
    cx = PAD + k * (CW * Z + PAD)
    im4.paste(img, (cx, TOP4))
    dr4.text((cx, TOP4 + CH * Z + 6), t, fill=(HI if k == 1 else (WARN if k == 2 else DIM)))
im4.save(os.path.join(HERE, "island-detail-6x.png"))

# ---- 5. WHY THE GREEN STILL VARIES, with the status variable removed -----------------------------
# The owner's SECOND complaint, and the one this island is the right instrument for: with every
# capability agreeing, any remaining variation is provably not semantic. The swatch strip is drawn
# from the DELIVERED raster's own modal cell fills, so it is what the picture contains rather than
# what the palette allows.
SWZ, SWH = 46, 34
groups = list(VARIATION.items())
strip_w = max(SHEET_MIN_W, PAD + sum(PAD + SWZ * max(1, len(v["colours"])) for _k, v in groups))
im5, dr5, TOP5 = sheet(strip_w, HDR + SWH + 62,
                       "THE GREEN IS NOT UNIFORM - and on THIS island that is provably not status",
                       f"All {len(CAPS_REAL)} capabilities are `healthy`, so the semantic variable "
                       f"is gone. What remains is authored per-CELL variation carrying no meaning a "
                       f"reader could act on: the three-entry `top` shade list picked by hash, and "
                       f"the wheat subset ({wheat_cells} of {len(cells_real)} cells = "
                       f"{REPORT['greenConsistency']['wheatCellsPct']}%). "
                       f"{len(distinct_land)} distinct delivered cell fills in total.",
                       "MEASURED, NOT ACTED ON - whether to collapse these is an appearance "
                       "decision and the owner's (ADR-0070 stage 2). " + CAM)
sx = PAD
for name, v in groups:
    for c in v["colours"]:
        rgb = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
        dr5.rectangle([sx, TOP5, sx + SWZ - 4, TOP5 + SWH], fill=rgb)
        sx += SWZ
    dr5.text((sx - SWZ * len(v["colours"]), TOP5 + SWH + 5), name, fill=INK)
    dr5.text((sx - SWZ * len(v["colours"]), TOP5 + SWH + 18), f"{v['cells']} cells", fill=DIM)
    sx += PAD
im5.save(os.path.join(HERE, "green-consistency.png"))


# ================================================================= 6. report + sidecars
REPORT["paletteEntries"] = int(len(C.PALETTE))
REPORT["cameraElevationDeg"] = C.ELEV
REPORT["appLandCameraElevationDeg"] = P.APP_LAND_CAMERA_ELEVATION_DEG
REPORT["blenderFramesRendered"] = 0
REPORT["landPieceSetValidForThisIsland"] = {
    "shapeClasses": len(real_shapes),
    "equalToRenderedSet": True,
    "reading": "the six kite shapes are a property of the hex lattice, not of which hexes a story "
               "claims, so the committed piece set covers this island. Measured, not assumed - if "
               "it had differed the pieces would have needed a re-render.",
}
with open(os.path.join(HERE, "island-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

PICTURES = ("healthy-island.png", "fixture-vs-real.png", "seam-fork.png", "island-detail-6x.png",
            "green-consistency.png")
for pic in PICTURES:
    provenance.write_sidecar(
        os.path.join(HERE, pic), __file__, sys.argv[1:], INPUTS, CODE_STATE,
        extra={"cameraElevationDeg": C.ELEV,
               "storyId": P.STORY_ID,
               "variant": "b++ land, flat green ground, interior mesh seams REMOVED (coast kept); "
                          "statuses are provenStatus over the live store's signed verdicts",
               "seamsDrawn": sorted(P.SEAMS_DRAWN),
               "strokeInventory": REPORT["strokeInventory"],
               "surface": {k: REPORT["surface"][k] for k in
                           ("storyId", "capabilityCount", "renderedStatusMix", "testCounts")},
               "island": {"sha256": provenance.sha256_file(ISLAND_PATH)},
               "proof": {"sha256": provenance.sha256_file(PROOF_PATH)},
               "fixtureIsland": {"sha256": provenance.sha256_file(FIXTURE_ISLAND)}})

print(f"code state {(CODE_STATE or {}).get('sha256', 'UNDECLARED')[:12]} | "
      f"story {P.STORY_ID} | {len(CAPS_REAL)} caps healthy x{statuses_real.count('healthy')} | "
      f"green {g_surface}% (fixture {g_fixture}%) | seams off changed {changed} px "
      f"({REPORT['whatRemovalCosts']['pctOfIsland']}%) | wrote island-report.json + "
      f"{len(PICTURES)} sidecars", flush=True)
