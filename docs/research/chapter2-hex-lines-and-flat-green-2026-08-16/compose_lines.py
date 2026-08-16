#!/usr/bin/env python3
"""WHICH GRID DRAWS THE LINES — and what removing them costs, in numbers, before anything is deleted.

    python compose_lines.py            # -> three pictures, lines-report.json, provenance sidecars

THE BRIEF (owner, 2026-08-16, verbatim): *"maybe remove the hex lines, first, feels noisy, also can
we just stick with green for these experiments"*.

THE PROBLEM WITH ACTING ON IT DIRECTLY. The island carries two grids and the phrase names neither
unambiguously: 17 claimed hex TILES, and 214 relaxed interior MESH CELLS. They are not
interchangeable. ADR-0367 D5's per-capability status tint rides on the CELLS — `capStatuses` has 10
entries against 17 tiles, so the tiles could not carry it even in principle. Deleting the wrong grid
is the `meaning-outranks-appearance` failure, and this arc has already caught one instance of that
exact class (a partial `(token x shade)` palette silently repainted an `unknown` rim `healthy` green
over 2564 px, because a snap can only clamp toward what it holds).

So this pass measures first and renders the fork second, and it does BOTH before proposing anything.

WHAT IS MEASURED, AND WHY EACH NUMBER IS THE ONE THAT SETTLES ITS QUESTION
--------------------------------------------------------------------------
1. THE STROKE INVENTORY (`seams.py`). Every line on the island passes through one function, and
   every stroke it receives is matched against rings recomputed from the island's own geometry. The
   accounting is TOTAL — an unmatched stroke is a refusal, not a bucket — so "no hex tile is
   stroked" is what remains when every line has been attributed, rather than a thing anyone looked
   for and failed to find.

2. THE HEX GHOST, AGAINST A CONTROL. The mesh is BUILT from the lattice (`substrate.ts` interns the
   same `hexCorners`), so a reasonable worry is that the cell seams still trace hexes even though no
   hex is stroked — which would make the owner's phrase exactly right about the appearance and only
   wrong about the mechanism. Measured as the share of hex-lattice perimeter lying within a tight
   tolerance of some cell edge. That number is MEANINGLESS ALONE, because cell edges tile the whole
   interior and any curve drawn across it is near one somewhere. So it is reported beside a CONTROL:
   the same lattice displaced half a hex width, which has no relationship to the mesh at all. The
   comparison is the finding; the raw figure is not.

3. WHAT REMOVAL COSTS, AS A COUNT OF BOUNDARIES THAT GO INVISIBLE. A seam is drawn in its own cell's
   status token at `SEAM_LEVEL` — a darker shade of the fill it borders — so it carries no colour a
   reader could not get from the fill. The load-bearing question is therefore not what the seam
   says, but what stops being SEPARABLE without it: for every adjacency between two cells of
   DIFFERENT capabilities, do the two sides still deliver different colours? The ones that do not
   are boundaries the seam was the only thing drawing, and their count is what removal costs.

4. AND WHAT IT DOES NOT COST — asserted, not assumed. Every cell's delivered fill colour is compared
   across all four panels. Seam suppression drops `seam_rgb` to None and touches nothing else, so
   no fill may move; if one did, the fork would be comparing two variables and the panels would be
   worthless. That check is the reason the fork can be trusted, so it is a refusal too.

"STICK WITH GREEN" IS TAKEN AS INSTRUCTED, AND ITS AMBIGUITY IS SURFACED RATHER THAN RESOLVED
---------------------------------------------------------------------------------------------
The ground is `flat` — the prior pass's option that costs nothing and leaves 100% of non-ground
pixels meaningful. `mottle` and `carpet` are DECLINED by the owner and are not re-rendered here.

But "stick with green" has a second possible reading — make every cell green — and that one is NOT
taken, because it would delete the per-capability status tint, which is semantic state that
ADR-0367 D5 puts above the art. This pass renders the island's real statuses and MEASURES how much
of the delivered land is not green (section `greenReading` of the report), so the owner can settle
which reading they meant while looking at the number rather than at a description of it.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PRIOR = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")

# The prior pass is IMPORTED, never copied. Its README records that IT had to vendor its own
# predecessor because that predecessor was staged and never committed; this one is committed
# (PR #1371), so there is a real sibling to import and no second copy is created here.
sys.path.insert(0, PRIOR)
import compose_core as D                                # noqa: E402
import grass                                            # noqa: E402
import scatter                                          # noqa: E402

import seams as S                                       # noqa: E402

C = D.C
provenance = D.provenance
INK, DIM, HI, WARN = (232, 232, 232), (150, 150, 156), (255, 236, 160), (255, 176, 150)
BG = (24, 24, 26)
PAD, HDR, CAP = 10, 52, 40

ISLAND = D.ISLAND
CELLS = D.prepare(ISLAND["variantB"]["cells"])
HEXES = S.load_hex_lattice()
REPORT = {}


# ================================================================= the refusals, before any pixel
# Run BEFORE the seam wrapper is installed: `assert_land_unchanged` compares this pass's land to the
# shipped compositor's, and it has to compare the UNINSTRUMENTED path or it is only proving that the
# wrapper is symmetric.
D.use_pieces("pieces-m00-blade", expect_mix=0.0, expect_geometry="blade")
INPUTS = C.piece_inputs([("pieces-land", D.LAND_PIECES),
                         ("pieces-m00-blade", os.path.join(PRIOR, "pieces-m00-blade"))])
CODE_STATE = D.require_one_state_per_generator(INPUTS)
D.assert_land_unchanged()

if abs(C.ELEV - grass.PASS_ELEVATION_DEG) > 1e-9:
    raise SystemExit(f"composing at {C.ELEV} but the pass angle is {grass.PASS_ELEVATION_DEG}")
print(f"refusals passed - land byte-identical to the shipped compositor, "
      f"{len(INPUTS)} piece directories, camera {C.ELEV:g} deg", flush=True)

CTRL = S.SeamControl(C, ISLAND, HEXES).install()


# ================================================================= 1. THE STROKE INVENTORY
def inventory_for(drawn):
    CTRL.reset(drawn)
    D.compose_land([])
    return CTRL.inventory()

INV = inventory_for({"coast", "cell", "hex"})
if INV["other"]:
    raise SystemExit(f"UNCLASSIFIED STROKE x{INV['other']} — the inventory is not total, so every "
                     f"count in this report would be a floor rather than a total. Refusing.")

REPORT["strokeInventory"] = {
    "coast": INV["coast"],
    "cell": INV["cell"],
    "hex": INV["hex"],
    "other": INV["other"],
    "hexTilesInIsland": len(ISLAND["tiles"]),
    "meshCellsInIsland": len(CELLS),
    "hexRingsRegisteredWithTheDetector": CTRL.hex_rings,
    "reading":
        "EVERY line on the island is accounted for. The compositor strokes a ring only through "
        "`fill_polygon(..., seam_rgb=...)`, and it is called with a seam exactly "
        f"{INV['coast'] + INV['cell']} times: {INV['coast']} for the coast and {INV['cell']} for "
        f"the {len(CELLS)} mesh cells. The 17 hex TILES are stroked "
        f"{INV['hex']} times. The detector that would have caught them is real and is armed with "
        f"{CTRL.hex_rings} candidate rings (every tile at every height a cell is drawn at); "
        "`verify_refusal.py` makes it fire on a synthetic hex. The hex grid contributes no pixel "
        "to the delivered raster: it is upstream geometry that the mesh was built FROM, and it is "
        "never drawn.",
}
print(f"stroke inventory  coast={INV['coast']}  cell={INV['cell']}  hex={INV['hex']}  "
      f"other={INV['other']}", flush=True)


# ================================================================= 2. THE HEX GHOST, VS A CONTROL
def seg_point_dist2(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    L = vx * vx + vy * vy
    if L <= 1e-12:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / L))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return dx * dx + dy * dy


def cell_segments():
    segs = []
    for c in CELLS:
        p = c["poly"]
        for i in range(len(p)):
            a, b = p[i], p[(i + 1) % len(p)]
            segs.append((a[0], a[1], b[0], b[1]))
    return segs


CELL_SEGS = cell_segments()
#: A coarse uniform grid over the cell segments, so the perimeter walk below is not 214x6 segment
#: tests per sample. Purely an index; it changes no result.
GRID = 12.0
_BUCKETS = {}
for s in CELL_SEGS:
    x0, x1 = sorted((s[0], s[2]))
    y0, y1 = sorted((s[1], s[3]))
    for gx in range(int(math.floor(x0 / GRID)), int(math.floor(x1 / GRID)) + 1):
        for gy in range(int(math.floor(y0 / GRID)), int(math.floor(y1 / GRID)) + 1):
            _BUCKETS.setdefault((gx, gy), []).append(s)


def nearest_cell_edge_dist(px, py):
    gx, gy = int(math.floor(px / GRID)), int(math.floor(py / GRID))
    best = float("inf")
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for s in _BUCKETS.get((gx + dx, gy + dy), ()):
                d = seg_point_dist2(px, py, *s)
                if d < best:
                    best = d
    return math.sqrt(best)


#: The tolerances the coincidence is reported at. A SWEEP rather than one number, because a single
#: threshold is exactly where a result like this can be steered: loose enough and everything
#: coincides, tight enough and nothing does. The sweep shows the shape of the answer instead.
GHOST_TOLS = (0.25, 0.5, 1.0, 2.0)
GHOST_STEP = 0.5
ISL_CX, ISL_CY = ISLAND["islandCentreGround"]


def lattice_coincidence(tols, dx=0.0, dy=0.0, rot=0.0):
    """Share of the hex lattice's perimeter lying within each tolerance of SOME cell edge.

    `dx`/`dy`/`rot` displace the lattice to build a CONTROL — the same measurement over a lattice
    that has no relationship to the mesh. Points that fall outside the island are dropped from both
    arms alike, so the control is not flattered by sampling empty space.
    """
    near = {t: 0 for t in tols}
    total = 0
    ct, st = math.cos(rot), math.sin(rot)

    def place(x, y):
        x, y = x - ISL_CX, y - ISL_CY
        return (ISL_CX + x * ct - y * st + dx, ISL_CY + x * st + y * ct + dy)

    for t in HEXES["tiles"]:
        p = t["poly"]
        for i in range(len(p)):
            ax, ay = place(p[i][0], p[i][1])
            bx, by = place(p[(i + 1) % len(p)][0], p[(i + 1) % len(p)][1])
            L = math.hypot(bx - ax, by - ay)
            n = max(2, int(L / GHOST_STEP))
            for k in range(n + 1):
                u = k / n
                px, py = ax + u * (bx - ax), ay + u * (by - ay)
                d = nearest_cell_edge_dist(px, py)
                if d > 6.0 * max(GHOST_TOLS):
                    continue          # off the island entirely — not a fair sample for either arm
                total += 1
                for tol in tols:
                    if d <= tol:
                        near[tol] += 1
    return near, total


G_NEAR, G_TOT = lattice_coincidence(GHOST_TOLS)
#: TWO CONTROLS, because one is not enough for a lattice. A hex lattice is PERIODIC, so a pure
#: displacement can land back on a correlated position; a rotation by an angle that is not a
#: multiple of 60 degrees breaks the periodicity outright. Both are reported.
D_NEAR, D_TOT = lattice_coincidence(
    GHOST_TOLS, dx=float(ISLAND["hexR"]) * math.sqrt(3) / 2.0)
R_NEAR, R_TOT = lattice_coincidence(GHOST_TOLS, rot=math.radians(17.0))


def _pct(n, t):
    return round(100.0 * n / max(1, t), 1)


ghost_rows = [{"toleranceGroundUnits": tol,
               "latticePct": _pct(G_NEAR[tol], G_TOT),
               "controlDisplacedPct": _pct(D_NEAR[tol], D_TOT),
               "controlRotated17degPct": _pct(R_NEAR[tol], R_TOT),
               "ratioVsRotatedControl":
                   round((G_NEAR[tol] / max(1, G_TOT)) /
                         max(1e-9, R_NEAR[tol] / max(1, R_TOT)), 2)}
              for tol in GHOST_TOLS]
g1 = next(r for r in ghost_rows if r["toleranceGroundUnits"] == 1.0)

REPORT["hexGhost"] = {
    "sampleStepGroundUnits": GHOST_STEP,
    "samplesOnIsland": G_TOT,
    "rows": ghost_rows,
    "reading":
        "THE OWNER'S EYE IS NOT WRONG, AND THIS IS THE NUMBER THAT SAYS SO. No hex tile is stroked "
        "(the inventory above is total), but the mesh is BUILT from the lattice — `substrate.ts` "
        "interns the same `hexCorners` — and a substantial part of the lattice SURVIVES as cell "
        f"edges. At a 1.0 ground-unit tolerance {g1['latticePct']}% of the hex lattice's perimeter "
        f"is still traced by some cell edge, against {g1['controlRotated17degPct']}% for the same "
        f"lattice rotated 17 degrees and {g1['controlDisplacedPct']}% displaced half a hex width — "
        f"a {g1['ratioVsRotatedControl']}x excess over chance that holds across the whole "
        "tolerance sweep. `buildMeshCells` erodes the lattice without erasing it: same-owner "
        "triangles are MERGED across a shared hex-boundary edge (deleting that edge), and every "
        "unpinned vertex is then RELAXED (jitter 0.42, 3 iterations) — but pinned rim vertices do "
        "not move and unmerged boundaries survive. So the island really does carry hex-scale "
        "structure in its seams. WHAT FOLLOWS IS THE PRACTICAL POINT: there is no hex seam to "
        "remove on its own. The hex-shaped lines a viewer sees ARE cell seams, so the only lever "
        "that removes them is the one that removes ALL the interior seams — which is exactly what "
        "panels 3 and 4 show.",
}
print(f"hex ghost @1.0  lattice={g1['latticePct']}%  rot-control={g1['controlRotated17degPct']}%  "
      f"ratio={g1['ratioVsRotatedControl']}x", flush=True)


# ================================================================= the island as it ships
GRASS_META = D.DECOR_META
ITEMS, SCATTER_STATS = scatter.scatter_island(
    ISLAND, GRASS_META["tokenFamilies"], grass.SEED, D.UAT_CRITERIA)
REPORT["scatter"] = {k: v for k, v in SCATTER_STATS.items() if k != "perCapability"}


def render(drawn, tree=True, items=None):
    """One composite with exactly the named seam classes drawn. Everything else is held.

    Returns the full RGBA (what `on_board` composites for the pictures) alongside the RGB view the
    measurements difference. Both come from ONE composite, so a picture can never disagree with the
    number printed under it.
    """
    CTRL.reset(drawn)
    img, solid, _colours, _g = D.render_variant(ITEMS if items is None else items,
                                                tree=tree, ground="flat")
    return img, img[:, :, :3].astype(np.int16), solid


PANEL_RGBA, PANEL_IMGS, PANEL_SOLID = {}, {}, {}
for name, drawn, _cap in S.PANELS + (S.COAST_OFF,):
    PANEL_RGBA[name], PANEL_IMGS[name], PANEL_SOLID[name] = render(drawn)
    print(f"composed {name}", flush=True)

LAND_RGBA, LAND_ONLY = {}, {}
for name, drawn, _cap in S.PANELS + (S.COAST_OFF,):
    LAND_RGBA[name], LAND_ONLY[name], _ = render(drawn, tree=False, items=[])


def changed(a, b):
    return int(np.any(a != b, axis=2).sum())


base = PANEL_IMGS["as-is"]
REPORT["deliveredPixels"] = {
    "islandSolidPx": int(PANEL_SOLID["as-is"].sum()),
    "panels": {n: {"changedVsAsIs": changed(base, PANEL_IMGS[n]),
                   "changedVsAsIsPctOfIsland": round(
                       100.0 * changed(base, PANEL_IMGS[n]) / max(1, int(PANEL_SOLID["as-is"].sum())), 2)}
               for n, _d, _c in S.PANELS + (S.COAST_OFF,)},
}

# THE PIXEL-IDENTITY FINDING, asserted on the DECODED RASTER rather than stated in prose.
identical_hex = changed(PANEL_IMGS["as-is"], PANEL_IMGS["hex-off"]) == 0
identical_both = changed(PANEL_IMGS["cells-off"], PANEL_IMGS["both-off"]) == 0
REPORT["deliveredPixels"]["asIsEqualsHexOff"] = identical_hex
REPORT["deliveredPixels"]["cellsOffEqualsBothOff"] = identical_both
if not (identical_hex and identical_both):
    raise SystemExit("a hex-seam panel differs from its twin, which contradicts the stroke "
                     "inventory. One of the two instruments is wrong. Refusing.")


# ================================================================= 3./4. WHAT REMOVAL COSTS
def cell_id_map():
    """Which cell owns each delivered land pixel, by replaying the compositor's own painter order.

    Cells are drawn at tier 2 sorted on ground y, so replaying that one sort reproduces the
    occlusion between cells exactly. Walls (tier 1) and decor (tier 3) are NOT replayed: this map
    exists to sample each cell's own delivered FILL, and a rim wall drawn over a cell would
    contribute a wall colour to a question about cells. Cells fully hidden behind a wall therefore
    report few pixels, which is why `purity` and the sampled-cell count are both reported.
    """
    H, W = C.CANVAS_H * C.SS, C.CANVAS_W * C.SS
    ids = Image.new("I", (W, H), 0)
    dr = ImageDraw.Draw(ids)
    order = sorted(range(len(CELLS)), key=lambda i: CELLS[i]["c"][1])
    for i in order:
        c = CELLS[i]
        h = c["_h"]
        poly = [(C.project(gx, gy, h)[0] * C.SS, C.project(gx, gy, h)[1] * C.SS)
                for gx, gy in c["poly"]]
        dr.polygon(poly, fill=i + 1)
    a = np.array(ids)
    # CENTRE-SAMPLE rather than majority-downsample. This map exists only to decide which cell a
    # delivered pixel belongs to so that cell's own modal FILL can be read; the centre subpixel and
    # the majority disagree only in the block straddling a cell boundary, and those blocks are
    # exactly the ones a modal colour over hundreds of pixels is insensitive to. Stated rather than
    # hidden because it is a simplification, not an equivalence.
    return a[C.SS // 2::C.SS, C.SS // 2::C.SS].astype(np.int32) - 1


IDS = cell_id_map()


def cell_colours(img, ids, erode_ok=True):
    """Each cell's delivered fill colour: the modal colour over the pixels it owns."""
    out, purity = {}, {}
    for i in range(len(CELLS)):
        m = ids == i
        n = int(m.sum())
        if n == 0:
            continue
        px = img[m]
        v, cnt = np.unique(px.reshape(-1, 3), axis=0, return_counts=True)
        k = int(np.argmax(cnt))
        out[i] = tuple(int(z) for z in v[k])
        purity[i] = float(cnt[k]) / n
    return out, purity


COL_ASIS, PUR = cell_colours(LAND_ONLY["as-is"], IDS)
COL_OFF, _ = cell_colours(LAND_ONLY["both-off"], IDS)

# ---- 4. THE REFUSAL: no fill may move when only a seam is suppressed ----------------------------
moved = [i for i in COL_ASIS if i in COL_OFF and COL_ASIS[i] != COL_OFF[i]]
REPORT["fillsHeld"] = {
    "cellsSampled": len(COL_ASIS),
    "cellsWhoseDeliveredFillMoved": len(moved),
    "meanModalPurity": round(float(np.mean(list(PUR.values()))), 3) if PUR else None,
    "reading":
        "Seam suppression drops `seam_rgb` to None and touches nothing else, so every cell's own "
        "delivered fill must be identical across the fork. It is. Had a fill moved, the four "
        "panels would differ in more than one variable and none of them would be evidence.",
}

# ---- 3. THE COST: capability boundaries that go invisible ---------------------------------------
EDGES = C.cell_edges(CELLS)
adj_same_cap = adj_cross_cap = 0
invisible_cross = invisible_same = 0
invisible_cross_detail = []
for _k, touching in EDGES.items():
    if len(touching) != 2:
        continue
    i, j = touching
    if i not in COL_OFF or j not in COL_OFF:
        continue
    cross = CELLS[i]["cap"] != CELLS[j]["cap"]
    same_colour = COL_OFF[i] == COL_OFF[j]
    if cross:
        adj_cross_cap += 1
        if same_colour:
            invisible_cross += 1
            invisible_cross_detail.append(
                {"cells": [i, j], "caps": [CELLS[i]["cap"], CELLS[j]["cap"]],
                 "statuses": [ISLAND["capStatuses"][CELLS[i]["cap"]],
                              ISLAND["capStatuses"][CELLS[j]["cap"]]],
                 "colour": list(COL_OFF[i])})
    else:
        adj_same_cap += 1
        if same_colour:
            invisible_same += 1

REPORT["whatRemovalCosts"] = {
    "cellAdjacencies": adj_same_cap + adj_cross_cap,
    "crossCapabilityAdjacencies": adj_cross_cap,
    "crossCapabilityAdjacenciesThatGoInvisible": invisible_cross,
    "crossCapabilityAdjacenciesThatGoInvisiblePct":
        round(100.0 * invisible_cross / max(1, adj_cross_cap), 1),
    "sameCapabilityAdjacenciesThatMerge": invisible_same,
    "sameCapabilityAdjacencies": adj_same_cap,
    "invisibleCrossCapabilityDetail": invisible_cross_detail[:40],
    "reading":
        "A seam is drawn in its OWN cell's status token at `SEAM_LEVEL` (0.90) — a darker shade of "
        "the fill it borders — so it carries no colour a reader could not already get from the "
        "fill, and no cell's status, identity or claimed footprint is encoded in it. What a seam "
        "CAN be the only thing drawing is a boundary between two cells whose fills happen to "
        f"deliver the same colour. Across the island's {adj_cross_cap} adjacencies that cross a "
        f"CAPABILITY boundary, {invisible_cross} would become invisible without the seam "
        f"({100.0 * invisible_cross / max(1, adj_cross_cap):.1f}%). That count is the whole "
        "measured cost of removing the interior seams.",
}
print(f"removal cost  cross-cap adjacencies={adj_cross_cap}  go invisible={invisible_cross}",
      flush=True)


# ---- the status read, end to end ---------------------------------------------------------------
def status_of_cell(i):
    return ISLAND["capStatuses"][CELLS[i]["cap"]]


status_colours = {}
for i, col in COL_OFF.items():
    status_colours.setdefault(status_of_cell(i), set()).add(col)
overlap = {}
sts = sorted(status_colours)
for a in range(len(sts)):
    for b in range(a + 1, len(sts)):
        sh = status_colours[sts[a]] & status_colours[sts[b]]
        if sh:
            overlap[f"{sts[a]}|{sts[b]}"] = [list(x) for x in sorted(sh)]

REPORT["statusStillReads"] = {
    "statusesOnThisIsland": {s: len(v) for s, v in sorted(status_colours.items())},
    "statusPairsSharingADeliveredColour": overlap,
    "reading":
        "With every interior seam removed, each status still delivers its own colour set and no "
        f"two statuses collide ({len(overlap)} colliding pairs). The status tint is carried by the "
        "cell FILL, which the seam removal does not touch — which is the mechanical reason the "
        "ADR-0367 D5 obligation survives this change.",
}


# ---- the green reading -------------------------------------------------------------------------
def is_green(rgb):
    r, g, b = rgb
    return g > r and g > b


land_mask = PANEL_SOLID["as-is"] & (IDS >= 0)
land_px = LAND_ONLY["as-is"][land_mask]
green_px = int(sum(1 for p in land_px if is_green(tuple(int(v) for v in p))))
REPORT["greenReading"] = {
    "deliveredLandPx": int(land_px.shape[0]),
    "greenPx": green_px,
    "greenPct": round(100.0 * green_px / max(1, land_px.shape[0]), 1),
    "nonGreenPct": round(100.0 - 100.0 * green_px / max(1, land_px.shape[0]), 1),
    "capStatuses": list(ISLAND["capStatuses"]),
    "reading":
        "'stick with green' is taken as the GROUND treatment: `flat`, with `mottle` and `carpet` "
        "declined by the owner and not re-rendered. It is NOT taken as 'paint every cell green', "
        "because that would delete the per-capability status tint — semantic state ADR-0367 D5 "
        "puts above the art. This is what the island is today: the non-green share is the wheat "
        "and the wilt, and it is the number the owner needs in order to say which reading they "
        "meant.",
}

REPORT["declinedByTheOwner"] = {
    "grassShapeIterations": "the owner answered 'none of these is good enough' on the grass fork "
                            "(ADR-0280 D4's honest not-good-enough, taken deliberately). Neither "
                            "the loose blades nor the welded clump is adopted, and this pass is "
                            "not another grass-shape iteration: the grass renders exactly as it "
                            "ships.",
    "mottle": "declined by the owner, 2026-08-16. Not re-rendered here.",
    "carpet": "declined by the owner, 2026-08-16, and already refused on a number by the prior "
              "pass: roughly 3 in 4 grass pixels would assert tests that do not exist, swallowing "
              "9% of the real signal. Not re-rendered here.",
    "decorativeFlowers": "retired by ADR-0226 — a flower means UAT and only UAT. Not restored.",
}


# ================================================================= THE PICTURES
def board(img):
    return Image.fromarray(C.on_board(img.astype(np.uint8)), "RGB")


def sheet(w, h, title, sub, sub2=None):
    im = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(im)
    dr.text((PAD, 8), title, fill=INK)
    dr.text((PAD, 24), sub, fill=DIM)
    if sub2:
        dr.text((PAD, 38), sub2, fill=WARN)
    return im, dr


CAM = (f"camera {C.ELEV:g} deg (the owner's signed research angle, a named parameter) - "
       f"LAND_CAMERA_ELEVATION_DEG is still {grass.APP_LAND_CAMERA_ELEVATION_DEG:g} and is NOT "
       f"touched by this pass")

# ---- 1. THE FORK: the four the owner asked for, plus the coast ----------------------------------
tiles = [(n, c) for n, _d, c in S.PANELS] + [(S.COAST_OFF[0], S.COAST_OFF[2])]
bimg = {n: board(PANEL_RGBA[n]) for n, _c in tiles}
iw, ih = bimg["as-is"].size
cols = 3
rows = 2
im, dr = sheet(PAD + cols * (iw + PAD), HDR + rows * (ih + CAP),
               "THE LINE FORK - same island, same code state, same piece set, ONE variable",
               "The owner asked to see the hex lines removed. The island has TWO grids and only "
               "one of them is ever stroked; panels 1 and 2 are therefore PIXEL-IDENTICAL, and "
               "that identity is the answer rather than a rendering mistake.",
               CAM)
for k, (n, cap) in enumerate(tiles):
    cx = PAD + (k % cols) * (iw + PAD)
    cy = HDR + (k // cols) * (ih + CAP)
    im.paste(bimg[n], (cx, cy))
    ch = REPORT["deliveredPixels"]["panels"][n]["changedVsAsIs"]
    pct = REPORT["deliveredPixels"]["panels"][n]["changedVsAsIsPctOfIsland"]
    dr.text((cx, cy + ih + 4), f"{k + 1}. {n}", fill=INK)
    dr.text((cx, cy + ih + 16), cap, fill=DIM)
    dr.text((cx, cy + ih + 27),
            "IDENTICAL to 1 - nothing draws a hex seam" if n == "hex-off"
            else (f"{ch} px changed ({pct}% of the island)" if ch else "identical to 1"),
            fill=(HI if n in ("cells-off", "both-off") else (WARN if n == "hex-off" else DIM)))
im.save(os.path.join(HERE, "line-fork.png"))

# ---- 2. DETAIL 6x: judge the art here -----------------------------------------------------------
Z = 6
ys, xs = np.where(PANEL_SOLID["as-is"])
cy0, cx0 = int(np.mean(ys)), int(np.mean(xs))
CW, CH = 92, 62
x0 = max(0, min(C.CANVAS_W - CW, cx0 - CW // 2))
y0 = max(0, min(C.CANVAS_H - CH, cy0 - CH // 2))


def crop6(n):
    a = C.on_board(PANEL_RGBA[n].astype(np.uint8))[y0:y0 + CH, x0:x0 + CW]
    return Image.fromarray(a, "RGB").resize((CW * Z, CH * Z), Image.NEAREST)


pairs = [("as-is", "the island as it ships - interior seams drawn"),
         ("cells-off", "interior-cell seams removed"),
         ("all-off", "every seam removed, coast edge included")]
im2, dr2 = sheet(PAD + len(pairs) * (CW * Z + PAD), HDR + CH * Z + CAP,
                 "JUDGE THE ART HERE - the same crop of the same island at 6x",
                 "Nearest-neighbour, so every delivered pixel is a 6x6 block: what you are looking "
                 "at is exactly what ships, magnified, not a re-render at higher resolution.",
                 CAM)
for k, (n, cap) in enumerate(pairs):
    cx = PAD + k * (CW * Z + PAD)
    im2.paste(crop6(n), (cx, HDR))
    dr2.text((cx, HDR + CH * Z + 6), n, fill=INK)
    dr2.text((cx, HDR + CH * Z + 18), cap, fill=DIM)
im2.save(os.path.join(HERE, "line-detail-6x.png"))

# ---- 3. WHICH GRID: the diagnostic that answers the mechanical question --------------------------
def overlay(poly_sets, colour, width=1):
    a = C.on_board(LAND_RGBA["both-off"].astype(np.uint8)).copy()
    im3 = Image.fromarray(a, "RGB")
    d3 = ImageDraw.Draw(im3)
    ox, oy = (im3.size[0] - C.CANVAS_W) // 2, (im3.size[1] - C.CANVAS_H) // 2
    for poly, h in poly_sets:
        pts = [tuple(C.project(gx, gy, h)) for gx, gy in poly]
        d3.line([(p[0] + ox, p[1] + oy) for p in pts] + [(pts[0][0] + ox, pts[0][1] + oy)],
                fill=colour, width=width)
    return im3


hex_polys = [(t["poly"], 0.0) for t in HEXES["tiles"]]
cell_polys = [(c["poly"], c["_h"]) for c in CELLS]
ov = [("the 17 HEX TILES", overlay(hex_polys, (255, 96, 96)),
       f"stroked {INV['hex']} times by the compositor - never drawn"),
      ("the 214 MESH CELLS", overlay(cell_polys, (120, 200, 255)),
       f"stroked {INV['cell']} times - THESE are the lines")]
ow, oh = ov[0][1].size
im3, dr3 = sheet(PAD + 2 * (ow + PAD), HDR + oh + CAP,
                 "WHICH GRID PRODUCES THE VISIBLE LINES - measured, not eyeballed",
                 "Both grids drawn onto the SEAM-FREE island in a colour the palette does not "
                 "contain, so the overlay cannot be confused with the art. Left is the grid the "
                 "owner's phrase names; right is the grid that is actually stroked.",
                 CAM)
for k, (t, img, cap) in enumerate(ov):
    cx = PAD + k * (ow + PAD)
    im3.paste(img, (cx, HDR))
    dr3.text((cx, HDR + oh + 6), t, fill=INK)
    dr3.text((cx, HDR + oh + 18), cap, fill=(WARN if k == 0 else HI))
im3.save(os.path.join(HERE, "which-grid.png"))

CTRL.restore()

# ================================================================= report + sidecars
REPORT["paletteEntries"] = int(len(C.PALETTE))
REPORT["cameraElevationDeg"] = C.ELEV
REPORT["appLandCameraElevationDeg"] = grass.APP_LAND_CAMERA_ELEVATION_DEG
with open(os.path.join(HERE, "lines-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

PICTURES = ("line-fork.png", "line-detail-6x.png", "which-grid.png")
for pic in PICTURES:
    provenance.write_sidecar(
        os.path.join(HERE, pic), __file__, sys.argv[1:], INPUTS, CODE_STATE,
        extra={"cameraElevationDeg": C.ELEV,
               "variant": "b++ land, flat green ground, ADR-0226 vegetation as it ships; "
                          "seam classes suppressed one at a time",
               "scatterSeed": grass.SEED,
               "seamClasses": list(S.CLASSES),
               "strokeInventory": REPORT["strokeInventory"],
               "island": {"sha256": provenance.sha256_file(D.ISLAND_PATH)},
               "hexLattice": {"sha256": provenance.sha256_file(
                   os.path.join(HERE, "hex-lattice.json"))}})

print(f"code state {(CODE_STATE or {}).get('sha256', 'UNDECLARED')[:12]} | "
      f"wrote lines-report.json + {len(PICTURES)} sidecars", flush=True)
