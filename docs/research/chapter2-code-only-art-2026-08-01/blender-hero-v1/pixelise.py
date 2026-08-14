#!/usr/bin/env python3
"""The raster back half — ADR-0280 D2a's load-bearing step.

A raw Blender render shipped as-is IS the ADR-0145 failure reproduced. This takes the
supersampled 3D render down to the island's own pixel-art idiom, and writes the track's
`registration.json` from what it MEASURES rather than from what the generator intended.

  1. snap to exp-16's committed 32-colour track palette AT FULL RESOLUTION, then
     MODE-downsample to the 128 canvas -- each output pixel takes the majority palette
     colour of its 3x3 block rather than their average
  2. composite the contact-shadow pass UNDER the tree as its own palette value
  3. alpha threshold -> a hard pixel-art silhouette, no soft fringe
  4. selective, material-tinted outline: silhouette rim only, never black, never
     uniform (a uniform black key-line is what makes code art read as clipart)
  5. measure the ground anchor per frame with exp-16's own anchor rule, and record
     canvas / frame order / camera elevation in registration.json

Step 1's ORDER is load-bearing and was the wrong way round in v2. Box-downsampling
first averages across every band edge in the frame, and each of those averages then
snaps to whatever palette entry happens to be nearest -- so a shader emitting five flat
colours still delivers a crown of two dozen. Snapping first and taking the majority
second means a band edge stays an edge: measured on the mature frame, the same render
lands 24 crown colours through box-then-snap and 12 through snap-then-mode.

Usage: python pixelise.py <raw-dir> <dst-dir> [target=128]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

from provenance import producer_record

SRC = sys.argv[1]
DST = sys.argv[2]
TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 128
HERE = os.path.dirname(os.path.abspath(__file__))

PALETTE_JSON = os.path.join(HERE, "..", "exp-16-v2", "evidence", "track-palette-32.json")
PAL_ALL = np.array(json.load(open(PALETTE_JSON)), dtype=np.float32)
# drop the neutral greys: they are background artefacts of the source sheet, not tree
# colour, and letting the snap reach them turns shaded bark grey
PAL = np.array([c for c in PAL_ALL if not (c[0] == c[1] == c[2])], dtype=np.float32)
# the darkest palette entry is the ground-contact value; the shadow never invents a colour
SHADOW_COL = PAL[np.argmin(PAL.sum(axis=1))]
SHADOW_ALPHA = 96.0
# v2 pushed chroma 1.45x and value 1.16x about a pivot, because a physically-lit CPU
# render lands mid-value and low-chroma and washed out on the island's saturated plate.
# The cel bands are now AUTHORED at exp-16's own palette values and emitted exactly
# (emission shader + Standard view transform), so there is nothing left to correct --
# a push here would only walk an already-correct colour off its own palette entry.
CHROMA = 1.0
CONTRAST = 1.0
PIVOT = 116.0
# The palette splits cleanly into a bark family and a foliage family. Snapping across the
# whole 31 lets a DEEPLY SHADED GREEN land on a brown, which is why the first composited
# pass read as a brown thicket with green flecks: the crown interior is the shadiest part
# of the tree, so the error concentrates exactly where the foliage should be.
GREENS = np.array([c for c in PAL if c[1] > c[0]], dtype=np.float32)
BROWNS = np.array([c for c in PAL if c[1] <= c[0]], dtype=np.float32)

os.makedirs(DST, exist_ok=True)
W = np.array([0.30, 0.59, 0.11], dtype=np.float32)


def snap_to(rgb, pal):
    """Nearest palette colour in a luma-weighted space (perceptual, not raw RGB)."""
    d = ((rgb[:, :, None, :] - pal[None, None, :, :]) ** 2 * W).sum(axis=3)
    return pal[np.argmin(d, axis=2)]


def snap(rgb, foliage=None):
    """Family-aware snap. `foliage` is classified on the RAW render, so shading can never
    change a leaf's family.

    When the render declares the cel bands it emitted, each family snaps to ITS OWN BAND
    LIST rather than to the whole 31-colour palette. That makes the snap an identity for
    a correctly-emitted pixel and a hard clamp for anything else -- so the crown's colour
    count is bounded by the authored band count instead of being whatever the nearest
    -neighbour search happens to reach. The rim keeps a reserved darker entry per family
    (below), because a rim clamped to the darkest BODY band stops reading as a rim.
    """
    if foliage is None:
        return snap_to(rgb, PAL)
    return np.where(foliage[:, :, None], snap_to(rgb, FOL_PAL), snap_to(rgb, BARK_PAL))


def box(im):
    return im if im.size[0] == TARGET else im.resize((TARGET, TARGET), Image.BOX)


def mode_down(rgb, keep):
    """Majority downsample: each output pixel takes the most common palette colour among
    the `keep` sub-pixels of its block. Never averages, so a band edge survives as an
    edge instead of becoming a new colour that then snaps somewhere else entirely."""
    src = rgb.shape[0]
    if src == TARGET:
        return rgb.astype(np.float32)
    k = src // TARGET
    key = (rgb[:, :, 0].astype(np.int64) * 65536
           + rgb[:, :, 1].astype(np.int64) * 256 + rgb[:, :, 2].astype(np.int64))
    key = np.where(keep, key, -1)
    blocks = key.reshape(TARGET, k, TARGET, k).transpose(0, 2, 1, 3).reshape(
        TARGET, TARGET, k * k)
    vals = np.unique(key[keep]) if keep.any() else np.array([], dtype=np.int64)
    best = np.zeros((TARGET, TARGET), dtype=np.int64) - 1
    bestn = np.zeros((TARGET, TARGET), dtype=np.int32)
    for v in vals:
        n = (blocks == v).sum(axis=2).astype(np.int32)
        take = n > bestn
        best = np.where(take, v, best)
        bestn = np.where(take, n, bestn)
    out = np.zeros((TARGET, TARGET, 3), dtype=np.float32)
    out[:, :, 0] = np.where(best >= 0, best >> 16, 0)
    out[:, :, 1] = np.where(best >= 0, (best >> 8) & 255, 0)
    out[:, :, 2] = np.where(best >= 0, best & 255, 0)
    return out


def anchor_of(mask, alpha=None):
    """The lab's one applied rule (round-1's): alpha-weighted x across the bottom three
    OCCUPIED rows, bottom-most occupied row as groundY. Measured, never asserted.

    `alpha` weights the average when supplied, which is what the app-side suite does;
    the boolean form is the same rule with every occupied pixel weighted equally.
    """
    occupied = np.nonzero(mask.any(axis=1))[0]
    if len(occupied) == 0:
        return None, None
    ground = int(occupied.max())
    band_rows = occupied[-3:]
    w = np.zeros(TARGET, dtype=np.float64)
    for y in band_rows:
        row = mask[y]
        w += np.where(row, alpha[y] if alpha is not None else 1.0, 0.0)
    if w.sum() <= 0:
        return None, ground
    return float((np.arange(TARGET) * w).sum() / w.sum()), ground


names = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
shadow_dir = os.path.join(SRC, "shadow")
have_shadow = os.path.isdir(shadow_dir)
meta_path = os.path.join(SRC, "render-meta.json")
render_meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
# The cel bands the render declares it emitted. Foliage is classified by MEMBERSHIP of
# this list rather than by a g>r hue test, because the warm top-highlight band is not
# green (exp-16's own highlight is a khaki at (173,167,114)) and a hue test would file
# it with the bark.
FOLIAGE_BANDS = np.array(render_meta.get("foliage_bands", []), dtype=np.float32)
BARK_BANDS = np.array(render_meta.get("bark_bands", []), dtype=np.float32)


def _rim_reserve(bands, family):
    """One palette entry darker than the darkest band, reserved for the silhouette rim.
    Without it the rim clamps onto the darkest BODY band and the tree loses its edge --
    the band list is a colour BUDGET, and the rim is one of the things it must pay for."""
    if not len(bands):
        return family
    lo = float((bands * W).sum(axis=1).min())
    cand = [c for c in family if float((c * W).sum()) < lo - 4.0]
    if not cand:
        return np.array(list(bands), dtype=np.float32)
    dark = min(cand, key=lambda c: abs(float((c * W).sum()) - (lo - 26.0)))
    return np.array(list(bands) + [dark], dtype=np.float32)


FOL_PAL = _rim_reserve(FOLIAGE_BANDS, GREENS) if len(FOLIAGE_BANDS) else GREENS
BARK_PAL = _rim_reserve(BARK_BANDS, BROWNS) if len(BARK_BANDS) else BROWNS

frames = []
for name in names:
    full = np.array(Image.open(os.path.join(SRC, name)).convert("RGBA"), dtype=np.float32)
    # --- 1. snap at FULL resolution, then take the block MAJORITY ------------------
    # Order matters: downsampling first averages across every band edge and the averages
    # then snap wherever they land, which is how five emitted colours became 24.
    fr, fa = full[:, :, :3], full[:, :, 3]
    fkeep = fa > 110.0
    # Family classification is on the RAW render, so shading can never move a leaf into
    # the bark family. The warm top-highlight is deliberately NOT green (exp-16's own
    # highlight is a khaki at (173,167,114)), so a g>r hue test would file it with the
    # bark; when the render declares its bands, the test is which family a pixel is
    # NEARER to. That distinction is not academic: Cycles anti-aliases its own band
    # edges, so the raw frame carries a fringe of intermediate values at every boundary.
    # Under an absolute membership threshold those fringes fell outside the foliage list
    # and snapped to the nearest BROWN — which is what put a scatter of bright orange
    # flecks across the crown, 3.8% of it, that read as noise and had nothing to do with
    # the twigs they were blamed on. A nearest-family test has no threshold to miss.
    if FOLIAGE_BANDS.size and BARK_BANDS.size:
        df = np.abs(fr[:, :, None, :] - FOLIAGE_BANDS[None, None, :, :]).sum(axis=3)
        db = np.abs(fr[:, :, None, :] - BARK_BANDS[None, None, :, :]).sum(axis=3)
        ffol = df.min(axis=2) <= db.min(axis=2)
    else:
        ffol = (fr[:, :, 1] - fr[:, :, 0]) > 1.0
    if CHROMA != 1.0 or CONTRAST != 1.0:
        flum = (fr * W).sum(axis=2, keepdims=True)
        fr = np.clip(flum + (fr - flum) * CHROMA, 0, 255)
        fr = np.clip(PIVOT + (fr - PIVOT) * CONTRAST, 0, 255)
    fsnap = np.where(fkeep[:, :, None], snap(fr, ffol), 0.0)

    a = np.array(box(Image.fromarray(full.astype(np.uint8), "RGBA")), dtype=np.float32)
    alpha = a[:, :, 3]
    tree = alpha > 110.0
    rgb = mode_down(fsnap.astype(np.int32), fkeep)
    foliage = mode_down(np.repeat(ffol[:, :, None], 3, axis=2).astype(np.int32) * 255,
                        fkeep)[:, :, 0] > 127

    out = np.zeros_like(a)
    out[:, :, :3] = np.where(tree[:, :, None], rgb, 0.0)
    out[:, :, 3] = np.where(tree, 255.0, 0.0)

    # --- 2. the contact shadow, UNDER the tree, as one flat palette value ----------
    shadow = np.zeros(tree.shape, dtype=bool)
    sp = os.path.join(shadow_dir, name)
    if have_shadow and os.path.exists(sp):
        sa = np.array(box(Image.open(sp).convert("RGBA")), dtype=np.float32)
        # the shadow pass renders the catcher plane only: alpha IS the occlusion
        # only the DENSE core of the occlusion: the soft outer penumbra spreads wider
        # than the crown and reads as a mud puddle painted on the island
        shadow = (sa[:, :, 3] > 190.0) & ~tree
        # Never let the shadow descend past the tree's OWN contact row. The lab's anchor
        # rule reads the bottom-most occupied row of the whole frame, so an unclipped
        # shadow would define the ground socket and drag it around as the crown widens.
        # Cropping the near edge costs nothing visually — that strip sits under the
        # trunk — and it keeps the socket pinned to the thing that is actually planted.
        rows = np.nonzero(tree.any(axis=1))[0]
        if len(rows):
            shadow[int(rows.max()) + 1:, :] = False
        out[:, :, :3] = np.where(shadow[:, :, None], SHADOW_COL, out[:, :, :3])
        # SEMI-transparent, unlike every other pixel in the frame: the island is the
        # substrate (ADR-0274 D1) and a shadow DARKENS it rather than replacing it
        out[:, :, 3] = np.where(shadow, SHADOW_ALPHA, out[:, :, 3])

    # --- 4b. the CREASE keyline between overlapping clouds -------------------------
    # exp-16 separates its lobes with a drawn dark scallop; a shading valley alone does
    # not read at 128 px, and without separation the canopy is one lumpy mass rather
    # than a cluster of clouds. The cue is available without a second render pass: bands
    # are ordered, so a jump of two or more bands between neighbouring pixels is a FORM
    # boundary (one cloud in front of another), where a jump of one is just shading.
    # Deepening the darker side of such a step draws the scallop exactly where the
    # geometry already put it.
    if len(FOL_PAL) >= 3:
        order = np.argsort((FOL_PAL * W).sum(axis=1))
        ranked = FOL_PAL[order]
        idx = np.full(tree.shape, -1, dtype=np.int32)
        for bi, col in enumerate(ranked):
            hit = (np.abs(out[:, :, :3] - col).sum(axis=2) < 1.0) & foliage & tree
            idx = np.where(hit, bi, idx)
        crease = np.zeros(tree.shape, dtype=bool)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb_i = np.roll(np.roll(idx, dy, axis=0), dx, axis=1)
            crease |= (idx >= 0) & (nb_i >= 0) & (nb_i - idx >= 2)
        crease &= idx <= 2                    # only deepen the valley, never the highlight
        out[:, :, :3] = np.where(crease[:, :, None], ranked[0], out[:, :, :3])

    solid = tree | shadow

    # --- 5. selective outline — silhouette rim, darkened FROM THE LOCAL COLOUR -----
    pad = np.pad(tree, 1, constant_values=False)
    nb = (pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    rim = tree & ~nb
    below = np.pad(tree, 1, constant_values=False)[2:, 1:-1]
    # a down-facing rim goes deeper than a top-facing one (reads as form, not a key-line)
    depth = np.where(below & rim, 0.58, 0.74)[:, :, None]
    rim_col = snap(np.clip(out[:, :, :3] * depth, 0, 255), foliage)
    out[:, :, :3] = np.where(rim[:, :, None], rim_col, out[:, :, :3])

    Image.fromarray(out.astype(np.uint8), "RGBA").save(os.path.join(DST, name))

    # Measured under the LAB's applied rule (alpha > 8 over the composited frame), not
    # under a rule of this track's own choosing — that is the number the app-side suite
    # re-derives from the shipped PNG.
    ax, gy = anchor_of(out[:, :, 3] > 8.0, out[:, :, 3])
    ys, xs = np.nonzero(solid)
    frames.append({
        "file": name,
        "sourceAnchor": [round(ax, 2) if ax is not None else None, gy],
        "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
        "alphaPx": int(solid.sum()),
        "treePx": int(tree.sum()),
        "shadowPx": int(shadow.sum()),
    })
    print("pixelised", name, "anchor", frames[-1]["sourceAnchor"])

anchors = [f["sourceAnchor"] for f in frames if f["sourceAnchor"][0] is not None]
reg = {
    "track": "blender-hero-v1",
    "provenance": "code-generated (ADR-0280 D1); headless Blender finish (D2a); model-free",
    # PROPAGATED, not re-derived: the delivered directory is what `sheet.py` composes from, so the
    # render's own code state has to travel with the frames or a composer has nothing to compare.
    # Absent when the raw directory predates the field, which is UNDECLARED and never a refusal.
    "codeState": render_meta.get("code_state"),
    "producer": producer_record(__file__),
    "producerArgv": sys.argv[1:],
    "canvas": {"width": TARGET, "height": TARGET, "format": "PNG", "decoded": "RGBA8"},
    "frameCount": len(frames),
    "frameOrder": [f["file"] for f in frames],
    "groundSocketAnchor": {
        "x": round(float(np.mean([a[0] for a in anchors])), 2) if anchors else None,
        "y": int(np.max([a[1] for a in anchors])) if anchors else None,
    },
    "anchorRule": ("alpha-weighted x across the bottom three occupied TREE rows; "
                   "groundY = bottom-most occupied tree row (the contact shadow is "
                   "excluded from the anchor so it cannot drag the socket down)"),
    "camera_elevation_deg": render_meta.get("camera_elevation_deg"),
    "cameraRule": ("orthographic, framed ONCE to the mature extent and byte-identical "
                   "on every frame; the tree grows inside a fixed frame"),
    "alphaThreshold": 110,
    "palette": {"source": "exp-16 committed 32-colour track palette",
                "usable": int(len(PAL)),
                "method": ("nearest in luma-weighted RGB, within the emitted BAND list per "
                           "family when the render declares one — so the crown's colour "
                           "count is the authored band count, not whatever the search reaches"),
                "foliageBands": [[int(v) for v in c] for c in FOL_PAL],
                "barkBands": [[int(v) for v in c] for c in BARK_PAL]},
    "render": {k: render_meta.get(k) for k in
               ("blender", "engine", "seed", "samples", "shadow_samples",
                "supersample_res", "ortho_scale", "nodes", "iterations", "lobes")},
    "growth": render_meta.get("frames", []),
    "frames": frames,
}
with open(os.path.join(DST, "registration.json"), "w") as fh:
    json.dump(reg, fh, indent=1)

drift = [abs(a[0] - reg["groundSocketAnchor"]["x"]) for a in anchors] or [0.0]
print(f"done -> {DST}  frames={len(frames)}  anchor={reg['groundSocketAnchor']}  "
      f"max|driftX|={max(drift):.2f}px")
