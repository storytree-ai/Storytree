#!/usr/bin/env python3
"""THE LIGHT RIG, THE SHADOW FIELD, AND THE PALETTE THAT HAS TO HOLD IT.

Imported by `compose_shadow.py`, `verify.py` and `verify_refusal.py`, so nothing downstream carries a
second copy of any parameter here — the discipline `island_pass.py` established for the prior pass.

WHY THIS FILE IS SEPARATE FROM THE COMPOSER. Two of the three things below are DECISIONS (the rig and
the ladder) and one is arithmetic (the field). Keeping the decisions in one small readable file is
what lets a later pass change the light without reading a compositor, and is the shape the camera
angle already has (`island_pass.PASS_ELEVATION_DEG`).

THE ONE-SENTENCE ARGUMENT. A shadow is a low-frequency luminance gradient across a surface; a surface
already carrying three hash-picked colour variants plus a tan wheat subset has no dynamic range left
for that gradient to be legible in. Removing the noise and gaining the shadow are the SAME move, which
is why one pass delivers both.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

# =====================================================================================================
# 1. THE LIGHT RIG — READ FROM THE DELIVERED ART, NOT RESTATED AS A PREFERENCE
# =====================================================================================================
#: THE AUTHORED SUN, quoted from its two generators rather than invented here. `blender_land.py:88`
#: and `blender_tree.py:1958` set the SAME key: `rotation_euler = (radians(48), 0, radians(34))`. That
#: the land pieces and the hero tree already share one rig is the property this pass depends on — the
#: increment's *"the land must agree with it or the two will read as separate scenes"* is already true
#: at the generator, and all this pass has to do is not break it.
KEY_ROT_DEG = (48.0, 0.0, 34.0)

#: The sun's ELEVATION above the ground plane, which is the half of the rig the euler gives
#: unambiguously: a Blender SUN points down its own -Z, so tilting it 48 deg off vertical leaves it
#: 42 deg above the horizon. This is the number that sets how LONG a cast shadow is, and it is the
#: authored one.
KEY_ELEVATION_DEG = 90.0 - KEY_ROT_DEG[0]

#: The sun's SCREEN AZIMUTH — where the light comes from, in delivered pixels, x+ right and y+ down.
#: MEASURED FROM THE DELIVERED ART RATHER THAN DERIVED FROM THE EULER, and the two disagree. See
#: `measure_light_azimuth()`: the land pieces put `wall_lit` at cx=81.1 and `wall_dark` at cx=113.0
#: about a silhouette centroid of 95.5 — the LEFT-facing walls are the lit ones — and the hero tree's
#: crown brightens toward (-0.86, -0.52) by a least-squares fit over 4 804 crown pixels, which
#: `blender_tree.py:180` calls in words: *"concentric rings around an upper-left highlight"*.
#:
#: Working the euler by hand gives the opposite sign on x, so ONE of the two is wrong about a
#: convention (Blender's euler order, its sun default axis, or the compositor's ground-y flip relative
#: to the render camera). The delivered pixels are what the owner looked at and signed, so they win,
#: and the disagreement is recorded as an honest gap rather than papered over. `verify.py` re-measures
#: both instruments on every run, so this constant can never drift from the art it describes.
LIGHT_SCREEN_FROM = (-0.857, -0.516)

#: THE TREE'S OWN SHADOW SUN, inherited not invented. `blender_tree.py:1950` casts the hero tree's
#: contact shadow from `rotation_euler = (radians(15), 0, radians(28))` — a NEAR-OVERHEAD sun — and
#: says why in its own comment: *"The key sun sits at 48 deg and throws a shadow several tree-lengths
#: long, which walks off the canvas and reads as a smear."*
#:
#: That constraint is not rhetorical here; it is arithmetic this pass re-derived. The mature tree
#: stands 126 delivered px above its ground socket, which at this camera is 126/cos(50 deg) = 196
#: WORLD units — 26x the island's tallest terrace step. Cast at the key's 42 deg it would reach 218
#: ground units on a 246-unit-wide island, i.e. off the land entirely. So the canopy cast uses the
#: tree track's own shadow-sun elevation. TWO SUNS IS AN AUTHORED INCONSISTENCY AND IT IS THE TREE
#: TRACK'S, adopted here rather than introduced.
TREE_SHADOW_ELEVATION_DEG = 75.0

# =====================================================================================================
# 2. THE LADDER — the shade levels a shadow is allowed to reach
# =====================================================================================================
#: THE SHADOW LADDER. The land's palette is CLOSED (`compose.py:build_palette`) — every colour it may
#: emit is an authored token times an authored shade level — and `snap()` clamps everything else to the
#: nearest entry it holds. So a shadow is not free: it either enters the palette as authored light
#: levels, or it is quantised away into the lit tokens and never reaches the delivered raster.
#:
#: THAT IS A GENUINE QUESTION AND THIS PASS RENDERS BOTH ANSWERS (`shadow-survives-the-snap.png`),
#: because the increment asked for it: *"if shadow does NOT survive quantisation, that finding is
#: worth as much as a picture."*
#:
#: THE DEPTH IS NOT A TASTE CHOICE — IT IS BOUNDED BY THE TOKEN TABLE, AND THE BOUND IS MEASURED.
#: `safe_depth()` darkens the delivered top-face colour until the nearest status a reader could take
#: it for stops being its own. On this island that bound is **0.74**, so the deepest rung here sits
#: `SHADOW_MARGIN` clear of it. `verify.py` re-measures the bound on every run and FAILS if this
#: ladder ever reaches past it, so the constant cannot drift away from the palette that constrains it.
SHADOW_LEVELS = (0.94, 0.87, 0.80)

#: How much clearance the deepest rung keeps from the measured bound. Stated rather than implied,
#: because "it happened to pass" and "it passes with room" are different claims.
SHADOW_MARGIN = 0.05

#: The deepest the composed light multiplier may go before the snap sees it. Set just below the
#: deepest ladder rung so the rung is reachable and nothing darker is ever composed — a value the
#: palette cannot express is a value the snap decides for you.
SHADOW_FLOOR = 0.79

# How much each term darkens at full strength. These are the three shadow OBJECTS the increment names
# — cast from raised terracing, cast from the hero tree, and ambient occlusion in the joins — and they
# are separate parameters because they answer separately to the measurement.
#
# EACH IS SIZED TO LAND ON ITS OWN RUNG. The ladder quantises, so a term whose darkening falls short
# of the next rung boundary is a term that composes and then disappears in the snap: at this ladder
# the boundaries sit at 0.97 / 0.905 / 0.835, and the three terms are set so that each ALONE reaches
# a distinct rung and any two together reach the deepest. That is why they are not round numbers.
TERRAIN_CAST = 0.12      # a cell standing in a raised neighbour's shadow  -> rung 0.87
TREE_CAST = 0.19         # the canopy's own cast, the low-frequency term   -> rung 0.80
JOIN_AO = 0.07           # contact darkening where a cell abuts a HIGHER neighbour -> rung 0.94

#: AO REACHES ONLY WHERE THERE IS A STEP, AND THAT IS A DECISION RATHER THAN A LIMITATION. Ambient
#: occlusion applied at EVERY cell-to-cell join would redraw, as a shade band, exactly the interior
#: mesh seam the owner had removed nine hours earlier (*"i think we remove the mesh lines"*, and
#: 1 892 delivered px were spent removing them). So the AO term is driven by the HEIGHT DIFFERENCE and
#: is identically zero across a join between two cells at the same height. Terracing reads as depth;
#: a flat join stays invisible.
AO_RADIUS = 3.0          # ground units
#: The soft edge on the canopy cast. `blender_tree.py:1948` gives its shadow sun `angle = 26 deg`
#: *"soft edge: a hard contact rim is CG"*; this is that decision carried across as a blur radius.
TREE_PENUMBRA = 5.0      # ground units

#: Ground-space sampling resolution for the height field the marches run over, in samples per ground
#: unit. The island is ~246 units across, so 2/unit is a ~492-wide field — finer than the delivered
#: raster it feeds and cheap enough to march 24 taps over.
GRES = 2.0


# =====================================================================================================
# 3. THE INSTRUMENTS THAT KEEP THE RIG HONEST
# =====================================================================================================
def measure_light_azimuth_from_pieces(pieces_dir):
    """Which way the light comes from, read off the LAND PIECES' own lit/dark wall bands.

    A wall is a vertical face, so which of `wall_lit` / `wall_dark` a pixel takes is decided by the
    sun's AZIMUTH alone. Comparing the two bands' x-centroids against the silhouette's therefore reads
    the azimuth's sign directly off the art the compositor is about to stamp — no euler, no
    convention, no trust.
    """
    meta = json.load(open(os.path.join(pieces_dir, "render-meta.json")))
    names = list(meta["bandKeys"])
    keys = np.array([meta["bandKeys"][n] for n in names], dtype=np.float32)
    a = np.array(Image.open(os.path.join(pieces_dir, "tile-0.png")).convert("RGBA"), dtype=np.float32)
    idx = np.argmin(np.abs(a[:, :, None, :3] - keys[None, None, :, :]).sum(axis=3), axis=2)
    mask = a[:, :, 3] > 110.0
    out = {}
    for k, n in enumerate(names):
        m = (idx == k) & mask
        out[n] = float(np.nonzero(m)[1].mean()) if m.sum() else None
    ys, xs = np.nonzero(mask)
    out["silhouette"] = float(xs.mean())
    lit, dark = out.get("wall_lit"), out.get("wall_dark")
    out["litSideIsScreenLeft"] = bool(lit is not None and dark is not None and lit < dark)
    return out


def measure_light_azimuth_from_tree(frame_path):
    """The same question asked of the HERO TREE, by least-squares gradient over its crown.

    Independent of the piece measurement in every way that matters — a different generator, a
    different mesh, a different shading model (custom crown normals rather than flat faces) — so the
    two agreeing is a cross-check rather than a restatement. Returns the unit screen vector the crown
    BRIGHTENS toward, which is the direction the light comes from.
    """
    a = np.array(Image.open(frame_path).convert("RGBA"), dtype=np.float32)
    rgb, tree = a[:, :, :3], a[:, :, 3] > 110.0
    crown = (rgb[:, :, 1] > rgb[:, :, 0] + 6) & (rgb[:, :, 1] > rgb[:, :, 2] + 6) & tree
    lum = (rgb * np.array([0.30, 0.59, 0.11], dtype=np.float32)).sum(axis=2)
    ys, xs = np.nonzero(crown)
    A = np.stack([xs - xs.mean(), ys - ys.mean(), np.ones_like(xs)], axis=1).astype(np.float64)
    coef, *_ = np.linalg.lstsq(A, lum[crown].astype(np.float64), rcond=None)
    gx, gy = float(coef[0]), float(coef[1])
    n = math.hypot(gx, gy) or 1.0
    return (gx / n, gy / n), int(crown.sum())


def light_ground_direction(sin_flat):
    """The light's GROUND-plane direction, converted from the measured SCREEN azimuth.

    The projection is `px = gx + OX` and `py = gy*SIN + OY - h*COS`, so ground x survives to the screen
    unchanged while ground y is flattened by SIN. Undoing that one factor is the whole conversion, and
    doing it in one named place is what stops a later reader having to rediscover which of the two axes
    the camera squashed. Returns (toward_light, falls_toward), both unit vectors in ground coords.
    """
    sx, sy = LIGHT_SCREEN_FROM
    gx, gy = sx, sy / sin_flat
    n = math.hypot(gx, gy) or 1.0
    toward = (gx / n, gy / n)
    return toward, (-toward[0], -toward[1])


def extended_palette(base_palette, levels=SHADOW_LEVELS):
    """THE PALETTE, CLOSED OVER THE LIGHT LADDER — as a closure over the EXISTING palette, never a
    second copy of the token tables.

    `build_palette`'s own docstring records what a partial closure costs, and it is the most expensive
    lesson on this track: *"the nearest surviving entry belonged to a DIFFERENT STATUS FAMILY, so an
    `unknown` island's rim came out `healthy` green, over 2564 pixels, and nothing failed. A snap can
    only clamp toward what it holds, so an incomplete palette silently reassigns SEMANTIC state."*

    A shadow is exactly the operation that walks a pixel off the palette, so the closure has to cover
    EVERY family the land can emit — including the coast sand, which the status tables do not contain.
    Taking the cross product against the delivered palette rather than against the token tables is what
    guarantees that: whatever `build_palette` decided the land may emit, it may now also emit at each
    authored light level. 1.0 is included, so the result is a strict SUPERSET and an unshadowed
    correctly-composed pixel still snaps to itself.
    """
    out = {tuple(int(round(v)) for v in c) for c in base_palette}
    for lv in levels:
        for c in base_palette:
            out.add(tuple(int(round(v * lv)) for v in c))
    return np.array(sorted(out), dtype=np.float32)


def reader_status_table(C, faces="top"):
    """The colours a READER could take for a status, per status.

    `faces="top"` — THE GUARD'S TABLE, and the narrower one on purpose. ADR-0367 D5's concern is
    stated about the FILL: *"land cells ARE the capability, each cell's FILL carrying its status
    tint"*. A wall is the same cell's side face, not a second assertion, so the question a shadow has
    to answer is whether a darkened cell FILL could be taken for another status's FILL.

    `faces="all"` adds the `side` tokens. Reported, never asserted on — see `crossReads` in the
    report. Measured here: 21 of the 78 colours the land may already emit read as a DIFFERENT status
    than the one that authored them, at FULL LIGHT, with no shadow anywhere near it (`healthy`'s dark
    wall band reads `unhealthy`; `unknown`'s whole side family reads `healthy`). An instrument that
    condemns the shipped art before the change is not an instrument that can price the change.

    WHEAT IS EXCLUDED FROM BOTH and that is not a convenience. Five of the six statuses share the
    IDENTICAL wheat hex `#d6b271` (`compose.py:77`), which PR #1372 recorded: a wheat cell reports no
    status by colour at all. Including it would make every status equidistant from every shadowed
    pixel and the test would answer nothing. It is a pre-existing defect of the token table, not
    something a shadow introduces — and this pass removes wheat from the surface anyway.
    """
    return {st: np.array([C.hexrgb(t) for t in toks["top"]]
                         + ([C.hexrgb(toks["side"])] if faces == "all" else []), dtype=np.float32)
            for st, toks in C.STATUS_TOKENS.items()}


def safe_depth(C, rgb, table, floor=0.30, step=0.01):
    """The deepest light multiplier at which `rgb` still reads as the status it reads at full light.

    This is where the ladder's ceiling comes from, and computing it rather than choosing it is the
    difference between a shadow that is bounded and one that merely happens not to have broken yet.
    Returns (deepest_holding_multiplier, status_at_full_light).
    """
    base = np.clip(np.asarray(rgb, dtype=np.float32), 0, 255)
    read0 = str(nearest_status(base[None, None, :], table, C.W_LUMA)[0, 0])
    m, last = 1.0, 1.0
    while m > floor:
        m = round(m - step, 4)
        if str(nearest_status(np.clip(base * m, 0, 255)[None, None, :], table, C.W_LUMA)[0, 0]) != read0:
            break
        last = m
    return last, read0


def nearest_status(rgb, table, w_luma):
    """Which status a delivered colour reads as: nearest entry in the same luma-weighted space `snap`
    uses, so the test and the quantiser agree about what "near" means.

    `rgb` is (..., 3); returns an array of status names of shape rgb.shape[:-1].
    """
    names = sorted(table)
    stack = np.concatenate([table[n] for n in names], axis=0)
    owner = np.concatenate([[i] * len(table[n]) for i, n in enumerate(names)]).astype(np.int32)
    flat = rgb.reshape(-1, 3).astype(np.float32)
    best = np.empty(len(flat), dtype=np.int32)
    for y in range(0, len(flat), 65536):
        band = flat[y:y + 65536]
        d = ((band[:, None, :] - stack[None, :, :]) ** 2 * w_luma).sum(axis=2)
        best[y:y + 65536] = owner[np.argmin(d, axis=1)]
    return np.array(names, dtype=object)[best].reshape(rgb.shape[:-1])


# =====================================================================================================
# 4. THE FIELD — one light multiplier per supersampled canvas pixel
# =====================================================================================================
def _ground_frame(C, cells):
    """The ground-space raster the marches run over: extent, and a per-sample HEIGHT field.

    Rasterised from the cells' OWN emitted polygons at their OWN `height_of`, so the field the shadow
    is computed from cannot disagree with the geometry the compositor draws — the same argument
    `cell_edges` makes for deriving adjacency from the drawn polygons rather than from a second
    geometry pass.
    """
    pts = np.array([p for c in cells for p in c["poly"]], dtype=np.float64)
    gx0, gy0 = float(pts[:, 0].min()) - 16.0, float(pts[:, 1].min()) - 16.0
    gx1, gy1 = float(pts[:, 0].max()) + 16.0, float(pts[:, 1].max()) + 16.0
    w = int(math.ceil((gx1 - gx0) * GRES))
    h = int(math.ceil((gy1 - gy0) * GRES))
    img = Image.new("F", (w, h), 0.0)
    dr = ImageDraw.Draw(img)
    for c in cells:
        z = C.height_of(c, "cell")
        dr.polygon([((gx - gx0) * GRES, (gy - gy0) * GRES) for gx, gy in c["poly"]], fill=float(z))
    return (gx0, gy0, w, h), np.array(img, dtype=np.float32)


def _sample(field, frame, gx, gy):
    """Nearest-sample a ground field at arbitrary ground coordinates, zero outside."""
    gx0, gy0, w, h = frame
    ix = np.clip(((gx - gx0) * GRES).astype(np.int32), 0, w - 1)
    iy = np.clip(((gy - gy0) * GRES).astype(np.int32), 0, h - 1)
    inside = (gx >= gx0) & (gx <= gx0 + w / GRES) & (gy >= gy0) & (gy <= gy0 + h / GRES)
    return np.where(inside, field[iy, ix], 0.0)


def _blur(a, radius_units):
    """A cheap separable box blur in ground samples — the canopy's penumbra and the AO's falloff."""
    r = max(1, int(round(radius_units * GRES)))
    k = np.ones(2 * r + 1, dtype=np.float32) / (2 * r + 1)
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode="edge")
        out = np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), axis, p)
    return out.astype(np.float32)


def tree_ground_shadow(C, frame, tree_ground, sprite_rgba, anchor):
    """THE CANOPY CAST, projected from the hero tree's OWN delivered silhouette.

    Not a painted ellipse: every opaque sprite pixel is treated as a point of the tree standing in the
    vertical plane through the trunk, its world height read back out of the projection
    (`h = -dy / cos(theta)`, the inverse of `project`'s own height term), and dropped onto the ground
    along the shadow sun. So the shape on the ground is the tree's shape, sheared by the light — which
    is what makes it a shadow of THIS tree rather than a blob under any tree.
    """
    gx0, gy0, w, h = frame
    a = sprite_rgba[:, :, 3] > 110.0
    sy, sx = np.nonzero(a)
    dx = sx.astype(np.float64) - float(anchor["x"])
    dy = sy.astype(np.float64) - float(anchor["y"])
    world_h = np.maximum(0.0, -dy) / C.COS
    reach = world_h / math.tan(math.radians(TREE_SHADOW_ELEVATION_DEG))
    _toward, falls = light_ground_direction(C.SIN)
    gx = tree_ground[0] + dx + falls[0] * reach
    gy = tree_ground[1] + falls[1] * reach
    acc = np.zeros((h, w), dtype=np.float32)
    ix = np.clip(((gx - gx0) * GRES).astype(np.int32), 0, w - 1)
    iy = np.clip(((gy - gy0) * GRES).astype(np.int32), 0, h - 1)
    np.add.at(acc, (iy, ix), 1.0)
    return np.clip(_blur(np.clip(acc, 0.0, 1.0), TREE_PENUMBRA) * 2.2, 0.0, 1.0)


def cell_index_raster(C, cells):
    """Which cell owns each SUPERSAMPLED screen pixel — the cells' own projected top-face polygons,
    stamped in the compositor's own painter order (by ground depth) so a nearer cell covers a farther
    one exactly as the composite does.
    """
    im = Image.new("I", (C.CANVAS_W * C.SS, C.CANVAS_H * C.SS), -1)
    dr = ImageDraw.Draw(im)
    for ci in sorted(range(len(cells)), key=lambda i: cells[i]["c"][1]):
        c = cells[ci]
        z = C.height_of(c, "cell")
        dr.polygon([(C.project(gx, gy, z)[0] * C.SS, C.project(gx, gy, z)[1] * C.SS)
                    for gx, gy in c["poly"]], fill=int(ci))
    return np.array(im, dtype=np.int32)


def top_face_mask(C, cells, erode=1):
    """The DELIVERED-resolution mask of cell TOP FACES, derived from geometry and never from colour.

    This is what the status assertion is measured over, and deriving it geometrically is what stops
    the test being circular: a mask built by asking "which pixels are healthy green?" could not then
    discover that a pixel had stopped being healthy green. A delivered pixel is a top face only when
    its WHOLE supersample block lies inside one eroded cell polygon, so a block straddling a cell
    edge, a wall, the coast or the silhouette rim is excluded rather than attributed.
    """
    idx = cell_index_raster(C, cells)
    inside = idx >= 0
    if erode:
        r = erode * C.SS
        pad = np.pad(inside, r, constant_values=False)
        for dy in (-r, 0, r):
            for dx in (-r, 0, r):
                inside &= pad[r + dy:r + dy + idx.shape[0], r + dx:r + dx + idx.shape[1]]
    blocks = inside.reshape(C.CANVAS_H, C.SS, C.CANVAS_W, C.SS).transpose(0, 2, 1, 3)
    return blocks.reshape(C.CANVAS_H, C.CANVAS_W, C.SS * C.SS).all(axis=2)


def build(C, cells, tree_ground=None, sprite=None, anchor=None,
          terrain=TERRAIN_CAST, tree=TREE_CAST, ao=JOIN_AO, floor=SHADOW_FLOOR):
    """The delivered light multiplier, one value per SUPERSAMPLED canvas pixel.

    Returns `(field, stats)`. The field multiplies the assembled canvas BEFORE `back_half`, so the
    shadow is quantised and palette-snapped with the land exactly as every other authored colour is —
    a shadow composited afterwards would be the ADR-0145 failure wearing a different hat.

    Three terms, each the answer to one clause of the increment:

      * TERRAIN CAST — a standard height-field march along the sun. A pixel is occluded when some
        point between it and the sun stands higher than the sun's own ray at that distance. Real
        geometry, from the b++ elevation field that already exists.
      * CANOPY CAST — `tree_ground_shadow` above.
      * JOIN AO — the local height EXCESS within `AO_RADIUS`, i.e. how much higher the tallest thing
        nearby stands. Identically zero across a join between two cells at one height, which is what
        keeps it from redrawing the mesh seam the owner removed.
    """
    frame, hg = _ground_frame(C, cells)
    gx0, gy0, w, h = frame
    toward, _falls = light_ground_direction(C.SIN)
    tan_el = math.tan(math.radians(KEY_ELEVATION_DEG))

    # --- the ground-space terms -------------------------------------------------------------------
    ys, xs = np.mgrid[0:h, 0:w]
    ggx = gx0 + xs / GRES
    ggy = gy0 + ys / GRES
    occl = np.zeros((h, w), dtype=np.float32)
    step = 0.5
    steps = int(math.ceil((float(hg.max()) / max(tan_el, 1e-6)) / step)) + 1
    for i in range(1, steps + 1):
        s = i * step
        probe = _sample(hg, frame, ggx + toward[0] * s, ggy + toward[1] * s)
        occl = np.maximum(occl, np.clip((probe - (hg + s * tan_el)) / 1.6, 0.0, 1.0))
    occl = _blur(occl, 1.0)

    r = max(1, int(round(AO_RADIUS * GRES)))
    local_max = np.zeros_like(hg)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            local_max = np.maximum(local_max, np.roll(np.roll(hg, dy, axis=0), dx, axis=1))
    ao_field = _blur(np.clip((local_max - hg) / 3.0, 0.0, 1.0), 1.5)

    canopy = np.zeros_like(hg)
    if sprite is not None and tree_ground is not None:
        canopy = tree_ground_shadow(C, frame, tree_ground, sprite, anchor)

    # --- lift to the supersampled SCREEN raster ---------------------------------------------------
    # Every land pixel's ground point is recovered by inverting `project` at the height of the cell
    # that owns it, which is why the cell-index raster exists: without it the inverse is ambiguous,
    # because a raised cell and the ground behind it land on the same screen row.
    idx = cell_index_raster(C, cells)
    heights = np.array([C.height_of(c, "cell") for c in cells], dtype=np.float32)
    hz = np.where(idx >= 0, heights[np.clip(idx, 0, len(cells) - 1)], 0.0)
    py, px = np.mgrid[0:C.CANVAS_H * C.SS, 0:C.CANVAS_W * C.SS]
    gxp = px / C.SS - C.ORIGIN[0]
    gyp = (py / C.SS - C.ORIGIN[1] + hz * C.COS) / C.SIN

    s_occl = _sample(occl, frame, gxp, gyp)
    s_ao = _sample(ao_field, frame, gxp, gyp)
    s_tree = _sample(canopy, frame, gxp, gyp)

    field = 1.0 - (terrain * s_occl + ao * s_ao + tree * s_tree)
    field = np.clip(field, floor, 1.0).astype(np.float32)
    land = idx >= 0
    stats = {
        "terrainOccludedGroundSamples": int(np.count_nonzero(occl > 0.5)),
        "aoGroundSamples": int(np.count_nonzero(ao_field > 0.25)),
        "canopyGroundSamples": int(np.count_nonzero(canopy > 0.25)),
        "landPixels": int(np.count_nonzero(land)),
        "landPixelsDarkened": int(np.count_nonzero(land & (field < 0.999))),
        "minMultiplier": float(field[land].min()) if land.any() else 1.0,
        "meanMultiplier": float(field[land].mean()) if land.any() else 1.0,
    }
    stats["landPctDarkened"] = round(100.0 * stats["landPixelsDarkened"] / max(1, stats["landPixels"]), 1)
    return field, stats
