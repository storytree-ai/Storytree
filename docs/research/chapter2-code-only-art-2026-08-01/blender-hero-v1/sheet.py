#!/usr/bin/env python3
"""Comparison sheet — every cell composited on the island's own green plate.

The previous increment found TWO failures a transparent contact sheet had hidden, so
this tool refuses to draw a cell on transparency: judgement happens on the plate.

  python sheet.py <out.png> <label>=<dir> [<label>=<dir> ...] [--frames 0,4,9,14,18] [--zoom 4]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from measure import PLATE, PLATE_SHADE

argv = sys.argv[1:]
OUT = argv[0]


def opt(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


FRAMES = [int(x) for x in opt("--frames", "0,4,9,14,18").split(",")]
ZOOM = int(opt("--zoom", "4"))
TRACKS = [a.split("=", 1) for a in argv[1:] if "=" in a and not a.startswith("--")]

CELL = 128 * ZOOM
PAD, HDR = 6, 18
W = PAD + len(FRAMES) * (CELL + PAD)
H = HDR + len(TRACKS) * (CELL + PAD + HDR)
sheet = Image.new("RGB", (W, H), (26, 26, 28))
draw = ImageDraw.Draw(sheet)

for r, (label, d) in enumerate(TRACKS):
    y = HDR + r * (CELL + PAD + HDR)
    # basename only: a delivered sheet is an artifact, and an absolute scratchpad path
    # baked into it is noise that outlives the run it came from
    draw.text((PAD, y - 13), f"{label}   ({os.path.basename(os.path.normpath(d))}/)",
              fill=(225, 225, 225))
    for c, f in enumerate(FRAMES):
        p = os.path.join(d, f"frame-{f:02d}.png")
        x = PAD + c * (CELL + PAD)
        if not os.path.exists(p):
            draw.text((x + 4, y + 4), "missing", fill=(200, 90, 90))
            continue
        a = np.array(Image.open(p).convert("RGBA")).astype(np.float32)
        h, w = a.shape[:2]
        plate = np.tile(PLATE, (h, w, 1)).astype(np.float32)
        plate[:, w // 2:, :] = PLATE_SHADE
        al = a[:, :, 3:4] / 255.0
        comp = (a[:, :, :3] * al + plate * (1 - al)).astype(np.uint8)
        im = Image.fromarray(comp, "RGB").resize((CELL, CELL), Image.NEAREST)
        sheet.paste(im, (x, y))
        draw.text((x + 3, y + CELL + 1), f"f{f:02d}", fill=(150, 150, 150))

sheet.save(OUT)
print("wrote", OUT, sheet.size)
