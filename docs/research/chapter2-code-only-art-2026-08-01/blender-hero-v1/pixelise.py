#!/usr/bin/env python3
"""The raster back half — ADR-0280 D2a's load-bearing step.

A raw Blender render shipped as-is IS the ADR-0145 failure reproduced. This takes the
supersampled 3D render down to the island's own pixel-art idiom, and writes the track's
`registration.json` from what it MEASURES rather than from what the generator intended.

  1. box-downsample to the 128 canvas (supersampling does the anti-aliasing)
  2. composite the contact-shadow pass UNDER the tree as its own palette value
  3. alpha threshold -> a hard pixel-art silhouette, no soft fringe
  4. snap every colour to exp-16's committed 32-colour track palette
  5. selective, material-tinted outline: silhouette rim only, never black, never
     uniform (a uniform black key-line is what makes code art read as clipart)
  6. measure the ground anchor per frame with exp-16's own anchor rule, and record
     canvas / frame order / camera elevation in registration.json

Usage: python pixelise.py <raw-dir> <dst-dir> [target=128]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

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
CHROMA = 1.45        # chroma multiply about the luma axis, before the palette snap
CONTRAST = 1.16      # value spread about PIVOT, so shade and light land on different entries
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
    """Family-aware snap. `foliage` is classified on the RAW render, where a green base
    colour keeps g > r at every light level, so shading can never change a leaf's family."""
    if foliage is None:
        return snap_to(rgb, PAL)
    return np.where(foliage[:, :, None], snap_to(rgb, GREENS), snap_to(rgb, BROWNS))


def box(im):
    return im if im.size[0] == TARGET else im.resize((TARGET, TARGET), Image.BOX)


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

frames = []
for name in names:
    a = np.array(box(Image.open(os.path.join(SRC, name)).convert("RGBA")), dtype=np.float32)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    tree = alpha > 110.0

    # --- 3b. push chroma and value range BEFORE the snap ---------------------------
    # A physically-lit CPU render lands mid-value and low-chroma. Snapped straight, the
    # track looks fine in isolation and then WASHES OUT the moment it is composited on
    # the island's saturated green plate — which is the failure mode the round-3 tracks
    # were caught by, so it is corrected here rather than discovered again.
    foliage = (rgb[:, :, 1] - rgb[:, :, 0]) > 1.0
    lum = (rgb * W).sum(axis=2, keepdims=True)
    rgb = np.clip(lum + (rgb - lum) * CHROMA, 0, 255)
    rgb = np.clip(PIVOT + (rgb - PIVOT) * CONTRAST, 0, 255)

    out = np.zeros_like(a)
    out[:, :, :3] = np.where(tree[:, :, None], snap(rgb, foliage), 0.0)
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
                "usable": int(len(PAL)), "method": "nearest in luma-weighted RGB"},
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
