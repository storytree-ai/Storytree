#!/usr/bin/env python3
"""THE PICTURE OF THE DEFECT AND OF THE REPAIR — the same island, the same crop, one line apart.

    python picture.py

Every highlight is the MEASURED attribution array painted straight onto the delivered raster, not a
hand-marked overlay — the same discipline the sibling pass's `picture.py` uses, and for the same
reason: the owner named the defect by looking at a picture, so the answer has to be legible in one.

THE TWO RIGHT-HAND PANELS ARE NOT NEW ART. Nothing is re-rendered, re-scaled, re-coloured or moved;
only the depth key each placement sorts on differs. So the extra vegetation on the right is
vegetation that was ALWAYS being painted and was being overpainted by the cell it stands on, one
drawable later in the same list.

WHICH SIDE IS THE SHIPPED ONE FLIPPED ON 2026-08-17. The repair landed in `compose_core`, so the
RIGHT panels are now what the compositor produces and the LEFT ones are the defect deliberately
reintroduced for the duration of one composite (`delivery.centroid_key`). `assert_data_route_agrees`
re-runs the old data-transform route against the shipped one and refuses unless they deliver
byte-identical rasters, which is what keeps `assert_projection_unchanged` — the guard that makes
this a REORDERING and not a move — armed after the repair moved into the compositor.

The hero tree is omitted from every panel, as in the sibling pass: it is composited after the back
half at 1:1 with its own palette and its own signed verdict, so it is not part of what is attributed.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import delivery as L  # noqa: E402
from delivery import A, C, D, diagnose as G  # noqa: E402

sys.path.insert(0, os.path.join(A.REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                                "blender-hero-v1"))
import provenance  # noqa: E402

INK, DIM, HI, WARN = (232, 232, 232), (150, 150, 156), (255, 236, 160), (255, 120, 200)
GOOD = (140, 255, 190)
BG = (24, 24, 26)
PAD, HDR, CAP = 10, 46, 58


def sheet(w, h, title, sub):
    im = Image.new("RGB", (w, h), BG)
    dr = ImageDraw.Draw(im)
    dr.text((PAD, 8), title, fill=INK)
    dr.text((PAD, 24), sub, fill=DIM)
    return im, dr


def board(rgb, solid, highlight=None, colour=WARN):
    out = rgb.copy()
    if highlight is not None:
        out = np.where(highlight[:, :, None], np.array(colour, dtype=np.float32), out)
    img = np.zeros(out.shape[:2] + (4,), dtype=np.uint8)
    img[:, :, :3] = out.astype(np.uint8)
    img[:, :, 3] = np.where(solid, 255, 0).astype(np.uint8)
    return Image.fromarray(C.on_board(img), "RGB")


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


def main():
    meta = G.mount()
    caps = list(D.ISLAND["capStatuses"])
    with L.centroid_key():          # the pre-2026-08-17 key, reintroduced for the left panels only
        before = L.run_captured(meta, caps, "fixture")
    after = L.run_captured(meta, caps, "fixture-repaired")
    L.per_placement(after)          # arms the footprint guard
    L.assert_data_route_agrees(meta, caps, after)   # arms assert_projection_unchanged
    db, da = before["cls"] == 2, after["cls"] == 2
    nb, na = int(db.sum()), int(da.sum())

    DZ = 6
    gx, gy = D.ISLAND["islandCentreGround"]
    px, py = C.project(gx, gy, 0.0)
    cw, ch = 108, 68
    box = (int(px - cw * 0.52), int(py - ch * 0.28), int(px + cw * 0.48), int(py + ch * 0.72))
    panels = [
        (board(before["rgb"], before["solid"]), HI,
         "THE OLD KEY - the picture the owner declined, and what the compositor produced until "
         "2026-08-17. 51 of 112 placements are not in it."),
        (board(before["rgb"], before["solid"], db), INK,
         f"the same crop with every vegetation pixel painted - {nb} px, ALL of it"),
        (board(after["rgb"], after["solid"]), GOOD,
         "AS SHIPPED SINCE 2026-08-17 - one sort key, nothing moved, nothing re-rendered, nothing "
         "re-coloured. 104 of 112 placements now deliver."),
        (board(after["rgb"], after["solid"], da), GOOD,
         f"and its vegetation painted - {na} px, +{na - nb} ({round(100.0 * (na - nb) / nb)}%). "
         f"Every one of those was already being painted and was erased by its own cell."),
    ]
    im, dr = sheet(PAD + len(panels) * (cw * DZ + PAD), HDR + ch * DZ + CAP,
                   "WHERE THE 46% WENT - it was painted, then its own cell painted over it",
                   f"6x on the same crop - camera {C.ELEV:g} deg (LAND_CAMERA_ELEVATION_DEG is "
                   f"still 20 and is not touched) - delivered raster {C.CANVAS_W}x{C.CANVAS_H} at "
                   f"supersample {C.SS} - hero tree omitted")
    for i, (p, colour, cap) in enumerate(panels):
        x = PAD + i * (cw * DZ + PAD)
        im.paste(p.crop(box).resize((cw * DZ, ch * DZ), Image.NEAREST), (x, HDR))
        for j, line in enumerate(_wrap(cap, 88)):
            dr.text((x + 3, HDR + ch * DZ + 6 + j * 12), line, fill=colour)
    out = os.path.join(HERE, "where-the-46-percent-went.png")
    im.save(out)
    print("wrote", os.path.basename(out), im.size, flush=True)

    inputs = C.piece_inputs([("pieces-land", D.LAND_PIECES),
                             ("pieces-m00-blade", D.DECOR_PIECES)])
    code_state = D.require_one_state_per_generator(inputs)
    provenance.write_sidecar(
        out, __file__, sys.argv[1:], inputs, code_state,
        extra={"cameraElevationDeg": C.ELEV,
               "variant": "b++ land + ADR-0226 vegetation, ATTRIBUTED, before/after the depth-key "
                          "repair",
               "deliveredCanvasPx": [C.CANVAS_W, C.CANVAS_H],
               "supersample": C.SS,
               "scatterSeed": G.grass.SEED,
               "blenderRendersThisPass": 0,
               "heroTree": "omitted from every panel",
               "decorPxBefore": nb, "decorPxAfter": na,
               "island": {"sha256": provenance.sha256_file(D.ISLAND_PATH)}})
    print("code state", (code_state or {}).get("sha256", "UNDECLARED")[:12], "| 1 sidecar")


if __name__ == "__main__":
    main()
