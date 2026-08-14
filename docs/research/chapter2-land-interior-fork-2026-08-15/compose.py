#!/usr/bin/env python3
"""Compose ONE island four ways from ONE piece set, and put ADR-0367's interior fork in front of a
reader.

    python compose.py           # -> a.png b.png bplus.png bplusplus.png interior-fork.png

  a     REGULARISED LATTICE. Every interior cell is an extruded block STAMPED from the six-piece tile
        set: chamfered top face, four walls, per-cell height.
  b     THE SHIPPED RELAXED MESH, exactly as the ADR frames option (b): 214 unique cells stay flat
        fills carrying their status tint, Blender contributes the coast rim and nothing inside.
  b+    the same mesh, flat tops, PARCEL-grain elevation.
  b++   the same mesh, flat tops, PER-CELL elevation.

b+ and b++ are not new options. They exist because the fork's framing — "(a) buys thickness, (b)
leaves the interior flat" — turned out to be measurably too coarse, and a spike that reported the
framing back would be worth nothing. The wall pieces are indexed by quantised OUTWARD HEADING, not by
cell shape, so ANY polygon boundary can be walked with them: elevation, walls and cast height are
available to the relaxed mesh without a single cell-shaped piece existing. What a lattice actually
buys, and the only thing it buys, is that a cell's TOP FACE can be rendered art rather than a flat
fill. `a` against `b++` isolates exactly that one variable; `b` is kept because it is the option as
written.

Every cell of the sheet is drawn from one `island.json` and one `pieces/` directory in one run, so the
picture cannot silently compare two variables — the failure `crown-normals-fork.png` shipped with,
where four of its five cells predated a canopy constant and one did not.

THE BACK HALF IS ADR-0367 D4's, against the ISLAND's palette rather than the tree's: every pixel is
mapped to an authored token BEFORE the majority downsample, the downsample takes each block's mode
rather than its mean, and the silhouette gets a rim darkened from its own local colour. A raw Blender
render shipped as land is the ADR-0145 failure at island scale.

THE STATUS TINT IS THE MAPPING, NOT THE RENDER. A rendered piece emits band KEYS; which colour a key
becomes is looked up per cell from that cell's capability status, so one piece serves all five statuses
and ADR-0367 D5 holds by construction. `verify.py` re-derives every variant under a permuted status
assignment and checks the pieces never move.
"""
import json
import math
import os
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
# The derived-evidence provenance producer landed by the hero track (increment
# `committed-derived-evidence-carries-producer`). Adopted rather than reimplemented: this spike's whole
# integrity claim is "one island, one piece set, ONE code state", and that claim is worth more as a
# mechanism the composer enforces than as a sentence in a README.
sys.path.insert(0, os.path.join(HERE, "..", "chapter2-code-only-art-2026-08-01", "blender-hero-v1"))
import provenance  # noqa: E402
ISLAND = json.load(open(os.path.join(HERE, "island.json")))
PIECES = os.path.join(HERE, "pieces")
META = json.load(open(os.path.join(PIECES, "render-meta.json")))

SS = int(META["supersample"])
ELEV = float(ISLAND["camera"]["elevationDeg"])
SIN = float(ISLAND["camera"]["groundFlattening"])
COS = float(ISLAND["camera"]["uprightForeshortening"])
CLIFF = float(META["cliffDropWorld"])
TILE_DEPTH_WORLD = float(META["tileDepthWorld"])

# Elevation, as world HEIGHTS: they foreshorten by cos(theta) where the ground carries sin(theta),
# which is the same split `hex.ts` makes between `HEX_R` and `TILE_DEPTH_WORLD`. The ceiling is set by
# the tile piece's own wall: the largest drop any variant produces (two parcel levels plus a micro
# step) has to be covered, or a raised block shows daylight underneath it.
LEVEL_STEP = 3.0
MICRO_STEP = 1.6
N_LEVELS = 3
assert (N_LEVELS - 1) * LEVEL_STEP + MICRO_STEP <= TILE_DEPTH_WORLD

# ---------------------------------------------------------------- the island's palette
# The authored tokens, read from `apps/studio/src/index.css` — the `.hex-territory.st-<status>` blocks
# (per-status ground redefinitions) plus the base family. ADR-0367 D4 requires the land's render to
# pass through the island's EXISTING palette, so this is a copy of the app's, never a new one.
STATUS_TOKENS = {
    "proposed":  {"top": ["#d8c069", "#ccb258", "#e2cf7e"], "wheat": "#d6b271", "side": "#a8914a"},
    "building":  {"top": ["#dcab52", "#d09a42", "#e6bc68"], "wheat": "#d6b271", "side": "#aa7d33"},
    "healthy":   {"top": ["#8cb85e", "#7dab50", "#9ac570"], "wheat": "#d6b271", "side": "#648244"},
    "mapped":    {"top": ["#b3946a", "#a68557", "#bda278"], "wheat": "#d6b271", "side": "#85683f"},
    "unhealthy": {"top": ["#57544a", "#4a473e", "#635f52"], "wheat": "#6f6852", "side": "#37352c"},
    "unknown":   {"top": ["#a9c87f", "#9fc174", "#b2cf8b"], "wheat": "#d6b271", "side": "#87985f"},
}
COAST_SAND = "#e4d5a8"
COAST_SAND_EDGE = "#cbb884"

# The shade each band key is allowed to become. Three levels on a top face is what buys (a) its
# thickness — and also what multiplies the interior's committed colour count, one of the costs this
# spike is here to price.
KEY_SHADE = {"top": 1.00, "chamfer_lit": 0.90, "chamfer_dark": 0.78,
             "wall_lit": 1.00, "wall_dark": 0.80}
KEY_IS_WALL = {"top": False, "chamfer_lit": False, "chamfer_dark": False,
               "wall_lit": True, "wall_dark": True}
FLAT_LEVEL = 1.00     # a flat interior emits exactly ONE level per cell: that IS "the interior is flat"
SEAM_LEVEL = 0.90     # the app's own cell seam, as a shade band rather than a translucent stroke

BOARD = (43, 49, 56)  # the board the island is judged against; not an authored token


def hexrgb(s):
    return np.array([int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16)], dtype=np.float32)


def shade(rgb, mult):
    return np.clip(rgb * mult, 0, 255)


def build_palette():
    """The closed set of colours the land may emit: every entry is an authored token times an authored
    shade level. The snap is then an identity for a correctly-composed pixel and a hard clamp for
    anything else — what `pixelise.py` calls a colour BUDGET.

    IT HAS TO BE THE FULL CLOSURE OF (token x shade), AND A PARTIAL ONE IS WORSE THAN NO SNAP AT ALL.
    Measured here: the coast piece's chamfer lip is painted with the SIDE token at the chamfer shade,
    a combination the first version of this palette left out. Missing the entry did not produce a
    slightly-wrong colour — the nearest surviving entry belonged to a DIFFERENT STATUS FAMILY, so an
    `unknown` island's rim came out `healthy` green, over 2564 pixels, and nothing failed. A snap can
    only clamp toward what it holds, so an incomplete palette silently reassigns SEMANTIC state.
    `verify.py` check 2(b) is what caught it, which is why it restates the families independently
    instead of calling this function.
    """
    pal = []
    top_levels = sorted({FLAT_LEVEL, SEAM_LEVEL, KEY_SHADE["chamfer_lit"], KEY_SHADE["chamfer_dark"]})
    # a wall piece paints its top AND chamfer keys with the side token, so the side family can receive
    # every shade level the key table defines, not just the two wall ones
    side_levels = sorted(set(KEY_SHADE.values()))
    for st in STATUS_TOKENS.values():
        for t in st["top"] + [st["wheat"]]:
            for m in top_levels:
                pal.append(shade(hexrgb(t), m))
        for m in side_levels:
            pal.append(shade(hexrgb(st["side"]), m))
    for c in (COAST_SAND, COAST_SAND_EDGE):
        pal.append(hexrgb(c))
    return np.array(sorted({tuple(int(round(v)) for v in c) for c in pal}), dtype=np.float32)


PALETTE = build_palette()
W_LUMA = np.array([0.30, 0.59, 0.11], dtype=np.float32)

# ---------------------------------------------------------------- geometry / projection
COAST = np.array(ISLAND["coastLoopGround"], dtype=np.float64)
CAPS = list(ISLAND["capStatuses"])
CAP_LEVEL = [(i * 2 + 1) % N_LEVELS for i in range(len(CAPS))]

_pad = 18.0
# Headroom for the hero tree's crown: the sprite is anchored at its root, so ~120 px of it stands ABOVE
# the ground point it is planted on. Sizing the canvas to the island alone crops the canopy and the
# composite then reads as a bare trunk, which is a picture of nothing.
_TREE_HEADROOM = 122.0
_gx0, _gx1 = COAST[:, 0].min() - _pad, COAST[:, 0].max() + _pad
_gy0, _gy1 = COAST[:, 1].min() - _pad, COAST[:, 1].max() + _pad
CANVAS_W = int(math.ceil(_gx1 - _gx0))
CANVAS_H = int(math.ceil((_gy1 - _gy0) * SIN + CLIFF * COS + _TREE_HEADROOM))
ORIGIN = (-_gx0, -_gy0 * SIN + _TREE_HEADROOM)


def project(gx, gy, height=0.0):
    """Ground point + upright world height -> canvas pixels at the declared camera."""
    return (gx + ORIGIN[0], gy * SIN + ORIGIN[1] - height * COS)


def det_unit(*parts):
    """A deterministic 0..1 from a string address. CRC32 rather than `hash()`, which is salted per
    process — a salted choice here would break the byte-identity `verify.py` asserts."""
    return (zlib.crc32(":".join(str(p) for p in parts).encode()) & 0xFFFFFFFF) / 0x100000000


def height_of(cell, mode):
    parcel = CAP_LEVEL[cell["cap"]] * LEVEL_STEP
    if mode == "none":
        return 0.0
    if mode == "parcel":
        return parcel
    return parcel + (MICRO_STEP if det_unit("micro", cell["c"][0], cell["c"][1]) < 0.5 else 0.0)


# ---------------------------------------------------------------- piece decoding
def classify(path):
    """Decode a rendered piece into (key names, per-pixel key index, coverage). Every pixel takes the
    NEAREST band key, so a Cycles-antialiased boundary lands on one of the two keys it lies between
    instead of inventing a colour — the tactic `pixelise.py` uses for its family test."""
    a = np.array(Image.open(path).convert("RGBA"), dtype=np.float32)
    names = list(META["bandKeys"].keys())
    keys = np.array([META["bandKeys"][n] for n in names], dtype=np.float32)
    d = np.abs(a[:, :, None, :3] - keys[None, None, :, :]).sum(axis=3)
    return names, np.argmin(d, axis=2), a[:, :, 3] > 110.0


TILE_PIECES = [classify(os.path.join(PIECES, f"tile-{i}.png"))
               for i in range(len(ISLAND["variantA"]["pieceSet"]))]
WALL_PIECES = [classify(os.path.join(PIECES, f"wall-{h}.png"))
               for h in range(int(ISLAND["wall"]["headings"]))]
SHAPE_TO_PIECE = {p["shape"]: i for i, p in enumerate(ISLAND["variantA"]["pieceSet"])}


def paste_piece(canvas, alpha, piece, cx, cy, top_rgb, side_rgb):
    """Stamp one rendered piece, mapping each band key to a colour derived from THIS cell's tokens.
    `top_rgb`/`side_rgb` are the only per-cell inputs, which is the whole tint argument: the status
    never reaches the renderer."""
    names, idx, mask = piece
    h, w = mask.shape
    x0 = int(round(cx * SS - w / 2.0))
    y0 = int(round(cy * SS - h / 2.0))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(canvas.shape[1], x0 + w), min(canvas.shape[0], y0 + h)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sub_idx = idx[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    sub_m = mask[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    out = np.zeros(sub_idx.shape + (3,), dtype=np.float32)
    for k, name in enumerate(names):
        col = shade(side_rgb if KEY_IS_WALL[name] else top_rgb, KEY_SHADE[name])
        out = np.where((sub_idx == k)[:, :, None], col, out)
    canvas[sy0:sy1, sx0:sx1] = np.where(sub_m[:, :, None], out, canvas[sy0:sy1, sx0:sx1])
    alpha[sy0:sy1, sx0:sx1] = np.where(sub_m, 1.0, alpha[sy0:sy1, sx0:sx1])


def fill_polygon(canvas, alpha, poly_px, rgb, seam_rgb=None):
    """A flat SVG-equivalent cell: one authored colour, with the app's own cell seam drawn as the mid
    shade band rather than a translucent stroke, so the palette stays closed. Rasterised inside the
    polygon's own bounding box — a full-canvas mask per cell is ~200x the pixels for the same result."""
    xs = [p[0] for p in poly_px]
    ys = [p[1] for p in poly_px]
    m = max(2, int(round(SS)))
    x0, y0 = int(math.floor(min(xs))) - m, int(math.floor(min(ys))) - m
    x1, y1 = int(math.ceil(max(xs))) + m, int(math.ceil(max(ys))) + m
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(canvas.shape[1], x1), min(canvas.shape[0], y1)
    if x1 <= x0 or y1 <= y0:
        return
    w, h = x1 - x0, y1 - y0
    pts = [(float(x) - x0, float(y) - y0) for x, y in poly_px]
    body = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(body)
    d.polygon(pts, fill=255)
    if seam_rgb is not None:
        d.line(pts + [pts[0]], fill=255, width=max(1, int(round(0.7 * SS))))
    bm = np.array(body) > 127
    sub_c = canvas[y0:y1, x0:x1]
    sub_a = alpha[y0:y1, x0:x1]
    sub_c[bm] = rgb
    sub_a[bm] = 1.0
    if seam_rgb is not None:
        seam = Image.new("L", (w, h), 0)
        ImageDraw.Draw(seam).line(pts + [pts[0]], fill=255, width=max(1, int(round(0.7 * SS))))
        sub_c[(np.array(seam) > 127) & bm] = seam_rgb


# ---------------------------------------------------------------- boundary walls
def cell_edges(cells):
    """Every polygon edge of the interior, with the cells touching it. Derived from the emitted cell
    polygons rather than from a second geometry pass, so it cannot disagree with what is drawn."""
    edges = {}
    for ci, c in enumerate(cells):
        poly = c["poly"]
        for i in range(len(poly)):
            a = tuple(round(v, 1) for v in poly[i])
            b = tuple(round(v, 1) for v in poly[(i + 1) % len(poly)])
            edges.setdefault((a, b) if a <= b else (b, a), []).append(ci)
    return edges


def heading_of(outward):
    n = int(ISLAND["wall"]["headings"])
    return int(round((math.atan2(outward[1], outward[0]) / math.tau) * n)) % n


def faces_viewer(h):
    """A sprite may be moved but never turned, so a wall whose outward face points AWAY from the camera
    must not be drawn: pasting it paints a cliff band across land the viewer can see over. Ground +y is
    nearer the viewer, so an outward normal is visible exactly when its y is positive."""
    n = int(ISLAND["wall"]["headings"])
    return math.sin((h / n) * math.tau) > 1e-6


def walk(a, b, outward, step):
    """Walk one boundary edge, emitting a wall placement every `step` ground px at the quantised
    outward heading. The same machinery as the coast walk, which is the point: the piece set is indexed
    by heading, so any boundary at all can use it."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return []
    h = heading_of(outward)
    out, t = [], 0.0
    while t < length:
        out.append(((a[0] + dx / length * t, a[1] + dy / length * t), h))
        t += step
    return out


def boundary_walls(cells, mode):
    """Wall placements wherever a cell stands higher than what is beside it. The wall belongs to the
    HIGHER cell and faces the lower one; a step down to open water is left to the coast rim unless the
    cell is raised above beach level, in which case it needs its own."""
    if mode == "none":
        return []
    heights = [height_of(c, mode) for c in cells]
    out = []
    step = float(ISLAND["wall"]["step"]) * 0.5
    for (a, b), owners in cell_edges(cells).items():
        mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        if len(owners) == 1:
            hi = owners[0]
            if heights[hi] <= 1e-6:
                continue
            cx, cy = cells[hi]["c"]
            d = (mid[0] - cx, mid[1] - cy)
        elif len(owners) == 2 and abs(heights[owners[0]] - heights[owners[1]]) > 1e-6:
            hi, lo = (owners[0], owners[1]) if heights[owners[0]] > heights[owners[1]] else (owners[1], owners[0])
            lx, ly = cells[lo]["c"]
            d = (lx - mid[0], ly - mid[1])
        else:
            continue
        n = math.hypot(*d) or 1.0
        side = STATUS_TOKENS[CAPS[cells[hi]["cap"]]]["side"]
        for pos, h in walk(a, b, (d[0] / n, d[1] / n), step):
            if faces_viewer(h):
                out.append((pos, h, heights[hi], side))
    return out


# ---------------------------------------------------------------- the composite
VARIANTS = [
    ("a", "piece", "cell", "(a) regularised lattice - 6 rendered pieces, top face is RENDERED"),
    ("b", "flat", "none", "(b) shipped mesh, flat - the option as written in ADR-0367"),
    ("bplus", "flat", "parcel", "(b+) shipped mesh, flat tops + PARCEL elevation"),
    ("bplusplus", "flat", "cell", "(b++) shipped mesh, flat tops + PER-CELL elevation"),
]


def centre_height(cells, mode):
    """The height the hero tree is planted at: the height of the cell nearest the island centre. A tree
    left at 0 on a raised parcel sinks into it, which reads as a modelling error rather than a camera
    one."""
    gx, gy = ISLAND["islandCentreGround"]
    near = min(cells, key=lambda c: (c["c"][0] - gx) ** 2 + (c["c"][1] - gy) ** 2)
    return height_of(near, mode)


def compose(interior, elev):
    canvas = np.zeros((CANVAS_H * SS, CANVAS_W * SS, 3), dtype=np.float32)
    alpha = np.zeros((CANVAS_H * SS, CANVAS_W * SS), dtype=np.float32)
    cells = ISLAND["variantA" if interior == "piece" else "variantB"]["cells"]
    story_side = STATUS_TOKENS["healthy"]["side"]   # the island's own folded (story-level) status

    # 1. the beach at height ZERO, filled flat exactly as `.coast-fill` does today and drawn under
    #    everything, so the island reads as one landmass with a shore rim. Drawn at a raised height
    #    instead it shows THROUGH lower parcels as a pale plateau behind the land.
    fill_polygon(canvas, alpha,
                 [(project(gx, gy)[0] * SS, project(gx, gy)[1] * SS) for gx, gy in COAST],
                 hexrgb(COAST_SAND), seam_rgb=hexrgb(COAST_SAND_EDGE))

    # 2. every drawable, painter-ordered by GROUND depth. That single sort is what makes a sprite
    #    composite correct without a depth buffer: a cell in front is drawn later and its top face
    #    covers the wall of the cell behind it, and a boundary wall sorts between the two cells it
    #    separates because its midpoint lies between them.
    draw = []
    for pl in ISLAND["wall"]["placements"]:
        if faces_viewer(pl["heading"]):
            draw.append((pl["c"][1], 0, ("wall", pl["c"], pl["heading"], 0.0, story_side)))
    for pos, h, height, side in boundary_walls(cells, elev):
        draw.append((pos[1], 1, ("wall", pos, h, height, side)))
    for c in cells:
        draw.append((c["c"][1], 2, ("cell", c, height_of(c, elev))))
    draw.sort(key=lambda t: (t[0], t[1]))

    for _, _, item in draw:
        if item[0] == "wall":
            _, pos, h, height, side = item
            px, py = project(pos[0], pos[1], height)
            paste_piece(canvas, alpha, WALL_PIECES[h], px, py, hexrgb(side), hexrgb(side))
            continue
        _, c, height = item
        toks = STATUS_TOKENS[CAPS[c["cap"]]]
        base = hexrgb(toks["wheat"] if c["wheat"] else toks["top"][c["variant"]])
        if interior == "piece":
            px, py = project(c["c"][0], c["c"][1], height)
            paste_piece(canvas, alpha, TILE_PIECES[SHAPE_TO_PIECE[c["shape"]]], px, py,
                        base, hexrgb(toks["side"]))
        else:
            poly = [(project(gx, gy, height)[0] * SS, project(gx, gy, height)[1] * SS)
                    for gx, gy in c["poly"]]
            fill_polygon(canvas, alpha, poly, shade(base, FLAT_LEVEL), seam_rgb=shade(base, SEAM_LEVEL))
    return canvas, alpha, centre_height(cells, elev)


# ---------------------------------------------------------------- the back half (ADR-0367 D4)
def snap(rgb, rows=96):
    """Nearest palette colour in a luma-weighted space, in row bands.

    Banded rather than whole-array on purpose: the full form allocates
    (h x w x palette x 3) float32 — 532 MiB at this canvas and an 86-entry palette — which is fine on
    an idle box and raises `_ArrayMemoryError` when the shared dev box is running concurrent gates.
    The arithmetic is identical, so this changes no delivered pixel."""
    out = np.empty(rgb.shape, dtype=np.float32)
    for y in range(0, rgb.shape[0], rows):
        band = rgb[y:y + rows]
        d = ((band[:, :, None, :] - PALETTE[None, None, :, :]) ** 2 * W_LUMA).sum(axis=3)
        out[y:y + rows] = PALETTE[np.argmin(d, axis=2)]
    return out


def mode_down(rgb, keep):
    """Majority downsample. Never a mean: an average across a band edge is a colour no token
    authorises and it then snaps wherever it lands — measured on the hero track as five emitted
    colours delivering twenty-four."""
    k = SS
    key = (rgb[:, :, 0].astype(np.int64) * 65536 + rgb[:, :, 1].astype(np.int64) * 256
           + rgb[:, :, 2].astype(np.int64))
    key = np.where(keep, key, -1)
    blocks = key.reshape(CANVAS_H, k, CANVAS_W, k).transpose(0, 2, 1, 3).reshape(
        CANVAS_H, CANVAS_W, k * k)
    best = np.full((CANVAS_H, CANVAS_W), -1, dtype=np.int64)
    bestn = np.zeros((CANVAS_H, CANVAS_W), dtype=np.int32)
    for v in (np.unique(key[keep]) if keep.any() else []):
        n = (blocks == v).sum(axis=2).astype(np.int32)
        take = n > bestn
        best = np.where(take, v, best)
        bestn = np.where(take, n, bestn)
    out = np.zeros((CANVAS_H, CANVAS_W, 3), dtype=np.float32)
    out[:, :, 0] = np.where(best >= 0, best >> 16, 0)
    out[:, :, 1] = np.where(best >= 0, (best >> 8) & 255, 0)
    out[:, :, 2] = np.where(best >= 0, best & 255, 0)
    return out, best >= 0


def back_half(canvas, alpha, rim_pass=True):
    """`rim_pass=False` stops before the silhouette rim. The rim is DELIBERATELY allowed to reach the
    whole palette — it darkens from the local colour and re-snaps, so a green cell's rim can legally
    land on another family's entry — which means a tint assertion has to be made on the cell BODIES.
    Asserting it over the rim as well fails on the authored rim rule and says nothing about tint."""
    keep = alpha > 0.5
    snapped = np.where(keep[:, :, None], snap(canvas), 0.0)
    rgb, solid = mode_down(snapped.astype(np.int32), keep)

    # the selective rim: silhouette only, darkened FROM THE LOCAL COLOUR and re-snapped, never a
    # uniform black key-line — which is what makes code art read as clipart
    if rim_pass:
        pad = np.pad(solid, 1, constant_values=False)
        nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        rim = solid & ~nb
        below = np.pad(solid, 1, constant_values=False)[2:, 1:-1]
        depth = np.where(below & rim, 0.60, 0.76)[:, :, None]
        rgb = np.where(rim[:, :, None], snap(np.clip(rgb * depth, 0, 255)), rgb)

    out = np.zeros((CANVAS_H, CANVAS_W, 4), dtype=np.float32)
    out[:, :, :3] = np.where(solid[:, :, None], rgb, 0.0)
    out[:, :, 3] = np.where(solid, 255.0, 0.0)
    return out, solid


def add_tree(img, height):
    """The real hero tree, composited AFTER the land's back half and at its own 1:1 scale. It is a
    shipped sprite with its own palette and its own signed ceiling verdict, so putting it through the
    LAND's palette snap would re-author art the owner has already looked at and signed."""
    tree_dir = os.path.join(HERE, "..", "..", "..", "packages", "app-surface", "src", "assets",
                            "code-blender")
    reg = json.load(open(os.path.join(tree_dir, "tree-registration.json")))
    frame = np.array(Image.open(os.path.join(tree_dir, "tree", "frame-18.png")).convert("RGBA"),
                     dtype=np.float32)
    gx, gy = ISLAND["islandCentreGround"]
    px, py = project(gx, gy, height)
    x0 = int(round(px)) - int(reg["registeredRootAnchor"]["x"])
    y0 = int(round(py)) - int(reg["registeredRootAnchor"]["y"])
    h, w = frame.shape[:2]
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(img.shape[1], x0 + w), min(img.shape[0], y0 + h)
    sub = frame[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    a = sub[:, :, 3:4] / 255.0
    dst = img[sy0:sy1, sx0:sx1]
    dst[:, :, :3] = sub[:, :, :3] * a + dst[:, :, :3] * (1 - a)
    dst[:, :, 3] = np.maximum(dst[:, :, 3], sub[:, :, 3])
    return img


def on_board(img):
    a = img[:, :, 3:4] / 255.0
    board = np.tile(np.array(BOARD, dtype=np.float32), img.shape[:2] + (1,))
    return (img[:, :, :3] * a + board * (1 - a)).astype(np.uint8)


def piece_inputs(dirs):
    """One provenance record per piece directory: what it DECLARES, and a hash per piece it contributes.

    Shaped for `provenance.require_one_code_state`, which keys on `codeState.sha256` and treats an
    undeclared directory as unattributed rather than as a refusal. `provenance.input_records` is not
    reused because it is written for `sheet.py`'s frame-indexed cells, and these inputs are piece
    directories — the same contract, a different unit."""
    recs = []
    for label, d in dirs:
        state, why = provenance.declared_code_state(d)
        rec = {"label": label, "dir": os.path.relpath(d, HERE).replace(os.sep, "/")}
        if state:
            rec["codeState"] = state
        else:
            rec["undeclared"] = why
        rec["pieces"] = [{"file": f, "sha256": provenance.sha256_file(os.path.join(d, f))}
                         for f in sorted(os.listdir(d)) if f.endswith(".png")]
        recs.append(rec)
    return recs


if __name__ == "__main__":
    # THE REFUSAL, BEFORE ANY PIXEL IS DRAWN. Every variant in the fork sheet is composed from this one
    # piece directory, so a disagreement is impossible by construction here — and declaring it anyway
    # is the point: `sweep_chamfer.py` composes THREE render directories, and the same call there is
    # load-bearing rather than ceremonial.
    INPUTS = piece_inputs([("pieces", PIECES)])
    CODE_STATE = provenance.require_one_code_state(INPUTS)

    report = {}
    images = {}
    for name, interior, elev, caption in VARIANTS:
        canvas, alpha, tree_h = compose(interior, elev)
        img, solid = back_half(canvas, alpha)
        colours = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
        images[name] = add_tree(img, tree_h)
        Image.fromarray(on_board(images[name]), "RGB").save(os.path.join(HERE, f"{name}.png"))
        report[name] = {"caption": caption, "interior": interior, "elevation": elev,
                        "landPx": int(solid.sum()), "landColours": len(colours),
                        "cells": len(ISLAND["variantA" if interior == "piece" else "variantB"]["cells"]),
                        "renderedInteriorPieces": len(TILE_PIECES) if interior == "piece" else 0}
        print(f"{name}: {solid.sum()} land px, {len(colours)} land colours -> {name}.png")

    ZOOM = 3
    PADP, HDR = 8, 22
    cw, ch = CANVAS_W * ZOOM, CANVAS_H * ZOOM
    sheet = Image.new("RGB", (PADP + len(VARIANTS) * (cw + PADP), HDR + ch + PADP + 16), (24, 24, 26))
    dr = ImageDraw.Draw(sheet)
    dr.text((PADP, 6), f"ADR-0367 interior fork - ONE island, ONE piece set, ONE code state - "
                       f"camera {ELEV:.0f} deg (LAND_CAMERA_ELEVATION_DEG) - "
                       f"a vs b++ isolates the top face and nothing else", fill=(228, 228, 228))
    for i, (name, _int, _el, caption) in enumerate(VARIANTS):
        x = PADP + i * (cw + PADP)
        sheet.paste(Image.fromarray(on_board(images[name]), "RGB").resize((cw, ch), Image.NEAREST),
                    (x, HDR))
        dr.text((x + 2, HDR + ch + 3), caption, fill=(196, 196, 196))
    sheet_path = os.path.join(HERE, "interior-fork.png")
    sheet.save(sheet_path)
    print("wrote interior-fork.png", sheet.size)

    # The delivered pictures each carry their own producer record: which tool wrote them, that tool's
    # own source digest, the exact argv, the code state every cell was rendered at, and a digest of the
    # artifact itself — so a later reader can tell whether the picture on disk is still the one the
    # record describes, which is the question `framing-fork.png` could not answer.
    for name, _i, _e, _c in VARIANTS:
        provenance.write_sidecar(os.path.join(HERE, f"{name}.png"), __file__, sys.argv[1:],
                                 INPUTS, CODE_STATE,
                                 extra={"variant": report[name],
                                        "cameraElevationDeg": ELEV,
                                        "island": {"sha256": provenance.sha256_file(
                                            os.path.join(HERE, "island.json"))}})
    provenance.write_sidecar(sheet_path, __file__, sys.argv[1:], INPUTS, CODE_STATE,
                             extra={"cells": [n for n, _i, _e, _c in VARIANTS],
                                    "cameraElevationDeg": ELEV,
                                    "island": {"sha256": provenance.sha256_file(
                                        os.path.join(HERE, "island.json"))}})
    print("wrote provenance sidecars for", len(VARIANTS) + 1, "pictures; code state",
          (CODE_STATE or {}).get("sha256", "UNDECLARED")[:12])

    with open(os.path.join(HERE, "compose-report.json"), "w") as fh:
        json.dump({"canvas": [CANVAS_W, CANVAS_H], "supersample": SS,
                   "paletteEntries": int(len(PALETTE)),
                   "levelStepWorld": LEVEL_STEP, "microStepWorld": MICRO_STEP,
                   "cameraElevationDeg": ELEV,
                   "wallPieceSet": {"headings": int(ISLAND["wall"]["headings"]),
                                    "indexedBy": "quantised outward ground heading, never cell shape"},
                   "variants": report}, fh, indent=1)
    print("palette entries:", len(PALETTE))
