#!/usr/bin/env python3
"""Compose the camera-elevation sweep: ONE island, ONE tree, FIVE cameras, side by side.

    python compose_sweep.py        # -> panel-<tag>.png each, + camera-elevation-sweep.png

THE PICTURE THE OWNER PICKS FROM. Each panel is the `b++` land — the interior fork's recommended
option, which the owner settled on 2026-08-15: relaxed mesh kept, flat per-cell fills carrying
status tint, walls and elevation from the heading-indexed rim pieces — with the real hero tree
standing on it, both sides rendered at that panel's own camera.

IT REBINDS THE SHIPPED COMPOSITOR RATHER THAN COPYING IT. `compose.py` from the interior-fork
spike is imported and its module state re-pointed per angle, so there is exactly ONE implementation
of the projection, the piece stamping, the palette and the ADR-0367 D4 back half. A second
compositor is how a sweep quietly starts measuring itself: the interior-fork README records that
`chamfer-fairness.png` varied its rim while claiming to hold everything but the top face constant,
caught only by reading file timestamps. Nothing here can drift from the picture it is compared to,
because it IS that code.

The one thing written locally is the planting of the tree, because `compose.add_tree` reads the
SHIPPED 20-degree sprite from a path inlined in its body and this sweep needs the per-angle render.
The alpha blend is the same arithmetic; what differs is only which frame and which anchor.

WHAT IS HELD CONSTANT, AND HOW IT IS KNOWN RATHER THAN ASSUMED
-------------------------------------------------------------
· The TREE. Same skeleton (352 nodes, 28 iterations, 29 lobes) and same mature growth state
  (u = 1.0, N = 36.0, 19 lobes) at every angle — asserted by `sweep_render.py`, which voids the
  sweep if any panel differs. The camera re-times the INTERIOR frames but `retime()` pins the last
  one unconditionally, so the mature frame is the same tree seen from a different height.
· The GROUND geometry. Every panel re-projects the SAME emitted ground island; `emit_island.ts`
  overrides only the camera block it writes. So the cell decomposition, the coast and the status
  assignment are identical across panels and the only variable is the projection.
· The CODE STATE. All five piece directories are checked to declare one `blender_land.py` digest
  before anything is drawn — load-bearing here rather than ceremonial, because unlike the
  interior fork this composes FIVE separate render directories.
· The BACK HALF. Same quantise / palette snap / majority downsample / selective rim, via the same
  functions, against the same island palette (ADR-0367 D4).

The 20-degree panel is the ANCHOR: its tree frame is pixel-identical to the delivered
`code-blender` frame-18 (verified: 0 differing pixels), so the baseline panel is the shipped art
and not a lookalike.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")

_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)          # loads the fork island/pieces as its own default state
sys.path.insert(0, os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402

SWEEP = json.load(open(os.path.join(HERE, "sweep-report.json")))
MATURE = SWEEP["matureFrame"]


def _arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


# WHICH panels this sheet holds, and where it is written. Default: every angle on record, into
# `camera-elevation-sweep.png` — the original behaviour exactly.
#
# `--panels` exists because the owner's second look is a NARROWER question than the first. The
# five-panel sheet answered "how does elevation trade land against tree across the whole range";
# having seen it, the owner is choosing between two neighbours. Five panels at three zoom is a
# sheet you scan; two or three neighbours at the same zoom is one you can actually compare, and
# the difference between 45 and 50 is small enough that the scanning version would hide it.
#
# The subset is a FRAMING choice and not an evidentiary one: every panel is still composed by the
# same rebound compositor from the same island at its own camera, and the one-code-state refusal
# below is scoped to exactly the panels drawn, so it still has to pass for the sheet to exist.
PANELS = _arg("--panels")
if PANELS:
    want = {s.strip() for s in PANELS.split(",") if s.strip()}
    ROWS = [r for r in SWEEP["angles"] if r["tag"] in want or f"{r['elevationDeg']:g}" in want]
    missing = want - {r["tag"] for r in ROWS} - {f"{r['elevationDeg']:g}" for r in ROWS}
    if missing:
        raise SystemExit(f"--panels: no such angle on record {sorted(missing)}")
else:
    ROWS = list(SWEEP["angles"])

OUT_NAME = _arg("--out", "camera-elevation-sweep.png")
SUBTITLE = _arg("--subtitle")
# b++ — the interior fork's settled option: shipped relaxed mesh, flat per-cell fills, per-cell
# elevation. `interior='flat'` keeps the status tint in SVG-equivalent fills; `elev='cell'` is the
# per-cell elevation that gives the rim pieces something to wall.
INTERIOR, ELEVATION_MODE = "flat", "cell"


def rebind(tag):
    """Re-point the fork compositor's module state at one angle's island and piece set.

    Its functions read these at CALL time, so rebinding is enough — no function is rewritten and
    no arithmetic is restated. The canvas derivation mirrors `compose.py`'s own, reading its
    private padding and tree-headroom constants from the module instead of restating them.
    """
    island = json.load(open(os.path.join(HERE, "islands", f"island-{tag}.json")))
    pieces = os.path.join(HERE, f"pieces-{tag}")
    meta = json.load(open(os.path.join(pieces, "render-meta.json")))

    C.ISLAND, C.PIECES, C.META = island, pieces, meta
    C.SS = int(meta["supersample"])
    C.ELEV = float(island["camera"]["elevationDeg"])
    C.SIN = float(island["camera"]["groundFlattening"])
    C.COS = float(island["camera"]["uprightForeshortening"])
    C.CLIFF = float(meta["cliffDropWorld"])
    C.TILE_DEPTH_WORLD = float(meta["tileDepthWorld"])
    C.COAST = np.array(island["coastLoopGround"], dtype=np.float64)
    C.CAPS = list(island["capStatuses"])
    C.CAP_LEVEL = [(i * 2 + 1) % C.N_LEVELS for i in range(len(C.CAPS))]

    gx0 = C.COAST[:, 0].min() - C._pad
    gx1 = C.COAST[:, 0].max() + C._pad
    gy0 = C.COAST[:, 1].min() - C._pad
    gy1 = C.COAST[:, 1].max() + C._pad
    C.CANVAS_W = int(math.ceil(gx1 - gx0))
    C.CANVAS_H = int(math.ceil((gy1 - gy0) * C.SIN + C.CLIFF * C.COS + C._TREE_HEADROOM))
    C.ORIGIN = (-gx0, -gy0 * C.SIN + C._TREE_HEADROOM)

    C.TILE_PIECES = [C.classify(os.path.join(pieces, f"tile-{i}.png"))
                     for i in range(len(island["variantA"]["pieceSet"]))]
    C.WALL_PIECES = [C.classify(os.path.join(pieces, f"wall-{h}.png"))
                     for h in range(int(island["wall"]["headings"]))]
    C.SHAPE_TO_PIECE = {p["shape"]: i for i, p in enumerate(island["variantA"]["pieceSet"])}
    return island, meta


def plant_tree(img, tag, height):
    """This angle's own hero-tree render, composited AFTER the land's back half at 1:1.

    Deliberately NOT put through the land's palette snap — the sprite carries its own 32-colour
    track palette and a signed owner ceiling verdict, and re-snapping it would re-author art the
    owner has already looked at. Same reasoning, and same blend, as `compose.add_tree`; the
    difference is that the frame and the ground socket come from THIS angle's registration.
    """
    tree_dir = os.path.join(HERE, f"tree-{tag}", "frames")
    reg = json.load(open(os.path.join(tree_dir, "registration.json")))
    frame = np.array(Image.open(os.path.join(tree_dir, f"frame-{MATURE:02d}.png")).convert("RGBA"),
                     dtype=np.float32)
    # the ground socket the back half measured for THIS render — the tree's projected height and so
    # its anchor row both move with the camera, which is exactly why it is read per angle
    anchor = reg["groundSocketAnchor"]
    gx, gy = C.ISLAND["islandCentreGround"]
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
    return img, (px, py), float(reg["camera_elevation_deg"]), int(sub.shape[0])


# ---- the refusal, before any pixel is drawn -------------------------------------------------
# FIVE render directories, so unlike the interior fork this call can actually fire. A sweep whose
# panels came from different generator states would compare the camera AND the renderer.
INPUTS = C.piece_inputs([(f"pieces-{r['tag']}", os.path.join(HERE, f"pieces-{r['tag']}"))
                         for r in ROWS])
CODE_STATE = provenance.require_one_code_state(INPUTS)

panels, report = [], []
for row in ROWS:
    tag, deg = row["tag"], row["elevationDeg"]
    island, meta = rebind(tag)
    assert abs(float(meta["camera"]["elevationDeg"]) - deg) < 1e-9, (
        f"pieces-{tag} were rendered at {meta['camera']['elevationDeg']} deg, not {deg}")

    canvas, alpha, tree_h = C.compose(INTERIOR, ELEVATION_MODE)
    img, solid = C.back_half(canvas, alpha)
    land_colours = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
    land_px = int(solid.sum())
    img, ground, tree_deg, tree_h_px = plant_tree(img, tag, tree_h)
    assert abs(tree_deg - deg) < 1e-9, (
        f"tree-{tag} frames record {tree_deg} deg, not {deg} — the two sides of the composition "
        f"must be rendered at ONE camera (ADR-0367 D1)")

    Image.fromarray(C.on_board(img), "RGB").save(os.path.join(HERE, f"panel-{tag}.png"))
    panels.append({"tag": tag, "deg": deg, "img": C.on_board(img), "ground": ground})
    report.append({
        "tag": tag, "elevationDeg": deg, "why": row["why"],
        "groundFlattening": round(C.SIN, 4), "uprightForeshortening": round(C.COS, 4),
        "canvas": [C.CANVAS_W, C.CANVAS_H],
        "landPx": land_px, "landColours": len(land_colours),
        "meshCells": len(island["variantB"]["cells"]),
        "wallPlacementsDrawn": sum(1 for p in island["wall"]["placements"]
                                   if C.faces_viewer(p["heading"])),
        "treeCameraDeg": tree_deg,
        "treeCanvasRowsUsed": tree_h_px,
        "treeMature": row["mature"], "skeleton": row["skeleton"],
    })
    print(f"panel-{tag}.png  {deg:>7} deg  sin={C.SIN:.3f} cos={C.COS:.3f}  "
          f"{land_px} land px, {len(land_colours)} colours", flush=True)

# ---- the sheet ------------------------------------------------------------------------------
# Panels are different sizes (a higher camera flattens the island's screen height), so they are
# aligned on the TREE'S GROUND POINT rather than on a canvas corner. Aligning on the corner would
# slide the island up the cell as the angle rises and read as a framing change rather than a
# camera one.
ZOOM, PAD, HDR, CAP = 3, 10, 46, 34
cw = max(p["img"].shape[1] for p in panels)
ch = max(p["img"].shape[0] for p in panels)
gx_ref = max(p["ground"][0] for p in panels)
gy_ref = max(p["ground"][1] for p in panels)
cw += int(max(gx_ref - p["ground"][0] for p in panels)) + 2
ch += int(max(gy_ref - p["ground"][1] for p in panels)) + 2

CELL_W, CELL_H = cw * ZOOM, ch * ZOOM
sheet = Image.new("RGB", (PAD + len(panels) * (CELL_W + PAD), HDR + CELL_H + CAP), (24, 24, 26))
dr = ImageDraw.Draw(sheet)
dr.text((PAD, 8), "ADR-0367 D1 — WHICH CAMERA ELEVATION SHOULD THE LAND DECLARE?  "
                  "one island, one tree (mature frame, u=1.0), one code state; "
                  "b++ land = relaxed mesh + flat status-tinted fills + rim-piece walls",
        fill=(232, 232, 232))
dr.text((PAD, 24), SUBTITLE or
        "higher = more bird's eye. ground foreshortens by sin(theta), an upright object's "
        "height by cos(theta). the 20 deg panel is the SHIPPED art (its tree frame is "
        "pixel-identical to the delivered frame-18).", fill=(150, 150, 156))

for i, p in enumerate(panels):
    cell = np.full((ch, cw, 3), C.BOARD, dtype=np.uint8)
    ox = int(round(gx_ref - p["ground"][0]))
    oy = int(round(gy_ref - p["ground"][1]))
    h, w = p["img"].shape[:2]
    cell[oy:oy + h, ox:ox + w] = p["img"]
    x = PAD + i * (CELL_W + PAD)
    sheet.paste(Image.fromarray(cell, "RGB").resize((CELL_W, CELL_H), Image.NEAREST), (x, HDR))
    r = next(q for q in report if q["tag"] == p["tag"])
    label = f"{p['deg']:g}°"
    if p["tag"] == "20":
        label += "  ← CURRENT"
    elif p["tag"] == "35p26":
        label += "  true isometric"
    elif p["tag"] in ("45", "50") and PANELS:
        # only on the narrowed sheet: on the full five-panel sweep these are two candidates among
        # five and calling them out would prejudge the very comparison the sheet exists to enable
        label += "  ← CANDIDATE"
    dr.text((x + 3, HDR + CELL_H + 4), label, fill=(255, 236, 160))
    dr.text((x + 3, HDR + CELL_H + 18),
            f"ground x{r['groundFlattening']:.3f}  upright x{r['uprightForeshortening']:.3f}",
            fill=(168, 168, 174))

SHEET = os.path.join(HERE, OUT_NAME)
sheet.save(SHEET)
print(f"wrote {OUT_NAME}", sheet.size, flush=True)

for p in panels:
    panel_png = os.path.join(HERE, f"panel-{p['tag']}.png")
    # A NARROWED RE-COMPOSE DOES NOT OVERWRITE AN EXISTING PANEL'S RECORD.
    #
    # `INPUTS` is a SHEET-level fact — every piece directory the one-code-state refusal was run
    # across — so a 3-panel run writes a 3-cell record where the original 5-panel run wrote 5. The
    # panel PNG itself is unaffected (re-composing 35.26 and 45 for the 45-vs-50 sheet reproduced
    # both files byte-identically, which is how this was noticed), so the sidecar already on disk
    # still describes the exact bytes it names. Overwriting it would trade a record of the run that
    # established the sweep for a poorer record of a run that changed nothing.
    if PANELS and os.path.exists(provenance.sidecar_path(panel_png)):
        continue
    provenance.write_sidecar(panel_png, __file__, sys.argv[1:],
                             INPUTS, CODE_STATE,
                             extra={"cameraElevationDeg": p["deg"], "variant": "b++",
                                    "island": {"sha256": provenance.sha256_file(
                                        os.path.join(HERE, "islands", f"island-{p['tag']}.json"))}})
provenance.write_sidecar(SHEET, __file__, sys.argv[1:], INPUTS, CODE_STATE,
                         extra={"cells": [p["tag"] for p in panels],
                                "cameraElevationsDeg": [p["deg"] for p in panels],
                                "variant": "b++", "matureFrame": MATURE})

report_name = os.path.splitext(OUT_NAME)[0] + "-report.json" if PANELS \
    else "sweep-compose-report.json"
with open(os.path.join(HERE, report_name), "w") as fh:
    json.dump({"variant": "b++", "matureFrame": MATURE,
               "codeState": (CODE_STATE or {}).get("sha256"),
               "panels": report}, fh, indent=1)
print("code state", (CODE_STATE or {}).get("sha256", "UNDECLARED")[:12], flush=True)
