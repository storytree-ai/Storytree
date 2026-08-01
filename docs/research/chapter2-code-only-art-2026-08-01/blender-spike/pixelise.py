#!/usr/bin/env python3
"""The raster back half — ADR-0280 D2a's load-bearing step.

A raw Blender render shipped as-is IS the ADR-0145 failure reproduced. This takes a
supersampled 3D render down to the island's own pixel-art idiom:

  1. box-downsample to the 128 target (supersampling does the anti-aliasing)
  2. alpha threshold -> a hard pixel-art silhouette, no soft fringe
  3. snap every colour to exp-16's committed 32-colour track palette
  4. selective, material-tinted outline: silhouette rim only, never black, never
     uniform (a uniform black key-line is what makes code art read as clipart)

Usage: python pixelise.py <src-dir> <dst-dir> [target=128]
"""
import json
import os
import sys

import numpy as np
from PIL import Image

SRC, DST = sys.argv[1], sys.argv[2]
TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 128

PALETTE_JSON = ("C:/code/storytree/docs/research/chapter2-code-only-art-2026-08-01/"
                "exp-16-v2/evidence/track-palette-32.json")
PAL = np.array(json.load(open(PALETTE_JSON)), dtype=np.float32)
# drop the neutral grey (128,128,128) — it is a background artefact, not tree colour
PAL = np.array([c for c in PAL if not (c[0] == c[1] == c[2])], dtype=np.float32)

os.makedirs(DST, exist_ok=True)


def snap(rgb):
    """Nearest palette colour in a luma-weighted space (perceptual, not raw RGB)."""
    w = np.array([0.30, 0.59, 0.11], dtype=np.float32)
    d = ((rgb[:, :, None, :] - PAL[None, None, :, :]) ** 2 * w).sum(axis=3)
    return PAL[np.argmin(d, axis=2)]


for name in sorted(f for f in os.listdir(SRC) if f.endswith(".png")):
    im = Image.open(os.path.join(SRC, name)).convert("RGBA")
    if im.size[0] != TARGET:
        im = im.resize((TARGET, TARGET), Image.BOX)   # box = honest area average
    a = np.array(im, dtype=np.float32)
    rgb, alpha = a[:, :, :3], a[:, :, 3]

    # 2. hard silhouette
    mask = alpha > 110.0

    # 3. palette snap (only where the tree is)
    out = np.zeros_like(a)
    snapped = snap(rgb)
    out[:, :, :3] = np.where(mask[:, :, None], snapped, 0.0)
    out[:, :, 3] = np.where(mask, 255.0, 0.0)

    # 4. selective outline — silhouette rim, darkened FROM THE LOCAL COLOUR
    pad = np.pad(mask, 1, constant_values=False)
    nb = (pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    rim = mask & ~nb
    # a down-facing rim goes deeper than a top-facing one (reads as form, not a key-line)
    below = np.pad(mask, 1, constant_values=False)[2:, 1:-1]
    depth = np.where(below & rim, 0.58, 0.74)[:, :, None]
    rim_col = np.clip(out[:, :, :3] * depth, 0, 255)
    rim_col = snap(rim_col)
    out[:, :, :3] = np.where(rim[:, :, None], rim_col, out[:, :, :3])

    Image.fromarray(out.astype(np.uint8), "RGBA").save(os.path.join(DST, name))
    print("pixelised", name)

print("done ->", DST)
