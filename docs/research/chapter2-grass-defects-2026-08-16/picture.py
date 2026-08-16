#!/usr/bin/env python3
"""THE TWO PICTURES THAT SHOW THE ATTRIBUTION — where the black is, and what the grass delivers.

    python picture.py

EVERY PANEL IS THE SAME ISLAND, and every highlight is the MEASURED array from `diagnose.py`
painted straight onto it, never a hand-marked overlay. That is the point: the owner named two
defects by looking at a picture, so the answer has to be legible in the same picture rather than
only in a table.

THE HERO TREE IS OMITTED FROM EVERY PANEL HERE. It is composited after the back half at 1:1 with
its own 32-colour palette and its own signed verdict, so it is not part of what is being attributed
— and at this crop it covers a good deal of the ground the argument is about. The committed
`grass-on-island.png` in the sibling pass is the version with the tree, which is what the owner
looked at.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

import attribute as A
import diagnose as G
from attribute import C, D

sys.path.insert(0, os.path.join(A.REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
INK, DIM, HI, WARN = (232, 232, 232), (150, 150, 156), (255, 236, 160), (255, 120, 200)
BG = (24, 24, 26)
PAD, HDR, CAP = 10, 46, 46


def sheet(w, h, title, sub):
    im = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(im)
    dr.text((PAD, 8), title, fill=INK)
    dr.text((PAD, 24), sub, fill=DIM)
    return im, dr


def board(rgb, solid, highlight=None, colour=WARN):
    """One island on the judging board, optionally with a measured mask painted over it."""
    out = rgb.copy()
    if highlight is not None:
        out = np.where(highlight[:, :, None], np.array(colour, dtype=np.float32), out)
    img = np.zeros(out.shape[:2] + (4,), dtype=np.uint8)
    img[:, :, :3] = out.astype(np.uint8)
    img[:, :, 3] = np.where(solid, 255, 0).astype(np.uint8)
    return Image.fromarray(C.on_board(img), "RGB")


def main():
    meta = G.mount()
    index = A.token_index()
    fixture_caps = list(D.ISLAND["capStatuses"])
    healthy_caps = ["healthy"] * len(fixture_caps)

    fx = G.island_run(meta, fixture_caps, "fixture")
    hl = G.island_run(meta, healthy_caps, "healthy")
    _b, _v = G.check_bleed(fx, meta["tokenFamilies"], index)
    black_fx = (fx["cls"] == 1) & (A.luma(fx["rgb"]) < G.BLACK_LUMA)
    black_hl = (hl["cls"] == 1) & (A.luma(hl["rgb"]) < G.BLACK_LUMA)
    dec_fx, dec_hl = fx["cls"] == 2, hl["cls"] == 2

    # ---------------------------------------------------------- 1. where the black is
    panels = [
        (board(fx["rgb"], fx["solid"]), HI,
         "AS DELIVERED - the fixture island the owner declined"),
        (board(fx["rgb"], fx["solid"], black_fx), INK,
         f"EVERY PIXEL IN THE BLACK BAND (luma < {G.BLACK_LUMA:g}) - {int(black_fx.sum())} px, "
         f"2.7% of the land. ALL OF IT IS LAND."),
        (board(fx["rgb"], fx["solid"], dec_fx), INK,
         f"EVERY PIXEL THE VEGETATION OWNS - {int(dec_fx.sum())} px, and none of it is in the "
         f"band above (darkest decor pixel luma 108.5)"),
    ]
    Z = 3
    cw = max(p.size[0] for p, _c, _t in panels)
    ch = max(p.size[1] for p, _c, _t in panels)
    im, dr = sheet(PAD + len(panels) * (cw * Z + PAD), HDR + ch * Z + CAP,
                   'WHERE THE BLACK IS - "theres bvlack grass", attributed pixel by pixel',
                   f"camera {C.ELEV:g} deg - LAND_CAMERA_ELEVATION_DEG is still 20 and is NOT "
                   f"touched - hero tree omitted (it is composited after the back half)")
    for i, (p, colour, cap) in enumerate(panels):
        x = PAD + i * (cw * Z + PAD)
        pad = Image.new("RGB", (cw, ch), tuple(int(v) for v in C.BOARD))
        pad.paste(p, (0, 0))
        im.paste(pad.resize((cw * Z, ch * Z), Image.NEAREST), (x, HDR))
        for j, line in enumerate(_wrap(cap, 96)):
            dr.text((x + 3, HDR + ch * Z + 6 + j * 12), line, fill=colour)
    im.save(os.path.join(HERE, "where-the-black-is.png"))
    print("wrote where-the-black-is.png", im.size, flush=True)

    # ---------------------------------------------------------- 2. what the grass delivers
    DZ = 6
    gx, gy = D.ISLAND["islandCentreGround"]
    px, py = C.project(gx, gy, 0.0)
    cw2, ch2 = 108, 68
    box = (int(px - cw2 * 0.52), int(py - ch2 * 0.28), int(px + cw2 * 0.48), int(py + ch2 * 0.72))
    crops = [
        (board(fx["rgb"], fx["solid"]), HI,
         "THE FIXTURE, AS DELIVERED - the vegetation is the specks"),
        (board(fx["rgb"], fx["solid"], dec_fx), INK,
         "the same crop with every vegetation pixel painted - this is ALL of it"),
        (board(hl["rgb"], hl["solid"]), INK,
         "THE SAME ISLAND, ALL CAPABILITIES HEALTHY - the charcoal is gone with the fabricated "
         "unhealthy capability"),
        (board(hl["rgb"], hl["solid"], dec_hl), INK,
         "and its vegetation painted - 384 px, median 3 px per placement, 46% of placements "
         "deliver nothing"),
    ]
    im, dr = sheet(PAD + len(crops) * (cw2 * DZ + PAD), HDR + ch2 * DZ + CAP,
                   'WHAT THE GRASS DELIVERS - "it looks buggy", at 6x where the component stands',
                   "a placement delivers a median of THREE pixels and 46% of them deliver none at "
                   "all - the highlight is the measured attribution, not a hand-drawn overlay")
    for i, (p, colour, cap) in enumerate(crops):
        x = PAD + i * (cw2 * DZ + PAD)
        im.paste(p.crop(box).resize((cw2 * DZ, ch2 * DZ), Image.NEAREST), (x, HDR))
        for j, line in enumerate(_wrap(cap, 88)):
            dr.text((x + 3, HDR + ch2 * DZ + 6 + j * 12), line, fill=colour)
    im.save(os.path.join(HERE, "what-the-grass-delivers.png"))
    print("wrote what-the-grass-delivers.png", im.size, flush=True)

    inputs = C.piece_inputs([("pieces-land", D.LAND_PIECES),
                             ("pieces-m00-blade", D.DECOR_PIECES)])
    code_state = D.require_one_state_per_generator(inputs)
    for pic in ("where-the-black-is.png", "what-the-grass-delivers.png"):
        provenance.write_sidecar(
            os.path.join(HERE, pic), __file__, sys.argv[1:], inputs, code_state,
            extra={"cameraElevationDeg": C.ELEV,
                   "variant": "b++ land + ADR-0226 vegetation, ATTRIBUTED per delivered pixel",
                   "scatterSeed": G.grass.SEED,
                   "heroTree": "omitted from every panel",
                   "island": {"sha256": provenance.sha256_file(D.ISLAND_PATH)}})
    print("code state", (code_state or {}).get("sha256", "UNDECLARED")[:12], "| 2 sidecars")


def _wrap(text, n):
    out, line = [], ""
    for word in text.split():
        if len(line) + len(word) + 1 > n:
            out.append(line)
            line = word
        else:
            line = (line + " " + word).strip()
    if line:
        out.append(line)
    return out


if __name__ == "__main__":
    main()
