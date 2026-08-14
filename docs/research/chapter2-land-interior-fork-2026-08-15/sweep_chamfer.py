#!/usr/bin/env python3
"""Give option (a) its best shot, and measure whether it takes it.

The recommendation below turns on one number: how much of the delivered land a RENDERED top face is
actually responsible for. At the authored chamfer that number is small, and a small number is exactly
the kind of result that deserves the suspicion of having been under-built rather than measured. So the
chamfer is swept WIDE — the widest value here consumes a fifth of a cell's radius — and the share is
measured at the piece's own resolution and again after the delivered downsample.

    blender --background --python blender_land.py -- --out sweep-a --only tiles --chamfer 3.4
    blender --background --python blender_land.py -- --out sweep-b --only tiles --chamfer 5.5
    python sweep_chamfer.py
"""
import os
import sys

import numpy as np
from PIL import Image

import compose as C
import provenance  # noqa: E402  (compose.py puts the hero track on sys.path)

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = list(C.META["bandKeys"].keys())
KEYS = np.array([C.META["bandKeys"][n] for n in NAMES], dtype=np.float32)
CH = [NAMES.index("chamfer_lit"), NAMES.index("chamfer_dark")]


def piece_share(d):
    tot = cham = 0
    for i in range(len(C.ISLAND["variantA"]["pieceSet"])):
        a = np.array(Image.open(os.path.join(HERE, d, f"tile-{i}.png")).convert("RGBA"),
                     dtype=np.float32)
        m = a[:, :, 3] > 110
        idx = np.argmin(np.abs(a[:, :, None, :3] - KEYS[None, None, :, :]).sum(axis=3), axis=2)
        tot += int(m.sum())
        cham += int(np.isin(idx, CH)[m].sum())
    return cham / max(1, tot)


def delivered_share(d):
    """The same measurement after the whole composite and its majority downsample — what a reader
    actually sees. A band that survives at the piece's own supersampled resolution and loses every
    majority vote at the delivered scale has bought nothing."""
    saved = C.TILE_PIECES
    C.TILE_PIECES = [C.classify(os.path.join(HERE, d, f"tile-{i}.png"))
                     for i in range(len(C.ISLAND["variantA"]["pieceSet"]))]
    canvas, alpha, tree_h = C.compose("piece", "cell")
    # MEASURED without the rim pass, SAVED with it. The rim darkens from the local colour and re-snaps,
    # so counting chamfer colours across it would attribute rim pixels to the chamfer; but the picture
    # this writes sits beside `bplusplus.png` in the fairness sheet, and that one HAS its rim. Saving
    # the measurement image would have put a second variable into the very sheet whose job is to hold
    # everything but the top face constant — the `crown-normals-fork.png` failure, reproduced inside
    # the tool built to avoid it.
    img, solid = C.back_half(canvas, alpha, rim_pass=False)
    cols = set()
    for st in C.STATUS_TOKENS.values():
        for t in st["top"] + [st["wheat"]]:
            for k in ("chamfer_lit", "chamfer_dark"):
                cols.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(t), C.KEY_SHADE[k])))
    hit = np.zeros(solid.shape, dtype=bool)
    for c in cols:
        hit |= np.abs(img[:, :, :3] - np.array(c, dtype=np.float32)).sum(axis=2) < 0.5
    out = int((hit & solid).sum()) / max(1, int(solid.sum()))
    delivered = C.back_half(canvas, alpha)[0]
    Image.fromarray(C.on_board(C.add_tree(delivered, tree_h)), "RGB").save(
        os.path.join(HERE, f"a-{os.path.basename(d)}.png"))
    C.TILE_PIECES = saved
    return out


# THE REFUSAL RUNS FIRST, BEFORE ANY PIXEL IS MEASURED OR DRAWN, and that ordering is the whole point.
# This sheet composes THREE separate render directories, so it is exactly the shape that produced
# `crown-normals-fork.png`. The chamfer differs between them ON PURPOSE and lives in each directory's
# `argv`; the code state must be identical, and if a re-render of one width ever lands from a different
# `blender_land.py`, this exits instead of drawing.
#
# It was wired at the BOTTOM first, next to the sidecar it feeds, and a deliberate mutation test showed
# the picture being written and THEN refused — a mixed-state artifact on disk, missing only its
# provenance record. A guard that fires after the damage is a log line, not a refusal.
INPUT_DIRS = [("chamfer 1.7", os.path.join(HERE, "pieces")),
              ("chamfer 3.4", os.path.join(HERE, "sweep-a")),
              ("chamfer 5.5", os.path.join(HERE, "sweep-b"))]
INPUTS = C.piece_inputs([(label, d) for label, d in INPUT_DIRS if os.path.isdir(d)])
CODE_STATE = provenance.require_one_code_state(INPUTS)

print("chamfer inset (ground px) | share of PIECE px | share of DELIVERED land px")
for label, d in (("1.7  (authored)", "pieces"), ("3.4", "sweep-a"), ("5.5", "sweep-b")):
    if not os.path.isdir(os.path.join(HERE, d)):
        print(f"{label:>16} | (not rendered)")
        continue
    print(f"{label:>16} | {piece_share(d) * 100:16.1f}% | {delivered_share(d) * 100:20.1f}%")

# THE FAIRNESS PICTURE. The recommendation runs against option (a), so (a) is shown at the widest
# chamfer measured — the value where its rendered top face is most visible — beside the flat interior
# it is being compared with. Judging (a) only at the authored width would be judging it at the setting
# where its single advantage is faintest.
from PIL import ImageDraw  # noqa: E402  (local to the sheet, not the measurement)

CELLS = [("a-pieces.png", "(a) rendered top face, chamfer 1.7"),
         ("a-sweep-b.png", "(a) rendered top face, chamfer 5.5 - (a)'s best shot"),
         ("bplusplus.png", "(b++) FLAT top face, per-cell elevation")]
ZOOM = 4
imgs = [(Image.open(os.path.join(HERE, f)).convert("RGB"), cap) for f, cap in CELLS
        if os.path.exists(os.path.join(HERE, f))]
if imgs:
    # crop to the island: the tree headroom is identical in every cell and only shrinks the land
    w, h = imgs[0][0].size
    box = (0, int(h * 0.42), w, h)
    cw, ch = (box[2] - box[0]) * ZOOM, (box[3] - box[1]) * ZOOM
    sheet = Image.new("RGB", (8 + len(imgs) * (cw + 8), 22 + ch + 20), (24, 24, 26))
    dr = ImageDraw.Draw(sheet)
    dr.text((8, 6), "chamfer fairness - does a RENDERED top face read at the delivered scale? "
                    "(land only; identical elevation field in all three)", fill=(228, 228, 228))
    for i, (im, cap) in enumerate(imgs):
        x = 8 + i * (cw + 8)
        sheet.paste(im.crop(box).resize((cw, ch), Image.NEAREST), (x, 22))
        dr.text((x + 2, 22 + ch + 3), cap, fill=(196, 196, 196))
    out = os.path.join(HERE, "chamfer-fairness.png")
    sheet.save(out)
    print("wrote chamfer-fairness.png", sheet.size)

    provenance.write_sidecar(out, __file__, sys.argv[1:], INPUTS, CODE_STATE,
                             extra={"lever": "--chamfer (ground px inset of the flat top face)",
                                    "cells": [cap for _f, cap in CELLS],
                                    "cameraElevationDeg": C.ELEV})
    print("code state agreed across all three widths:",
          (CODE_STATE or {}).get("sha256", "UNDECLARED")[:12])
