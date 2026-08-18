#!/usr/bin/env python3
"""THE FOURTH SITE, LOOKED AT — what the dressing pictures were missing, on one island.

    python picture.py               # -> the-fourth-site.png + its provenance sidecar  (~3 min)

A number said the dressing compositor buried 32 of its 120 placements. This renders the same island
twice through the SAME compositor with only `compose_core.DECOR_SORTS_AFTER_ITS_CELL` moved, so the
picture varies exactly one thing, and puts the recovered paint in the third panel rather than asking
a reader to spot the difference between the first two.

THE CROP IS DERIVED, NOT CHOSEN. The high-frequency pass spent three attempts on a crop placement and
landed on deriving it: the window is the one holding the most CHANGED pixels, which is the quantity
this picture is about. The hero tree is not composited at all here — it OCCLUDES cells, and a
per-cell measure with it in frame read a seam cost of 4.87% instead of the true 6.21% on this arc
once already.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
DRESSING = os.path.join(RESEARCH, "chapter2-island-place-dressing-2026-08-16")
HERO = os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1")

sys.path.insert(0, DRESSING)
sys.path.insert(0, HERO)

import compose_dressed as DR    # noqa: E402
import compose_core as CORE     # noqa: E402
import provenance               # noqa: E402
import scatter                  # noqa: E402

BOARD = (24, 24, 26)
RECOVERED = (255, 214, 92)      # a colour the closed land palette cannot emit, so it reads as an
                                # annotation rather than as art


def render(items, cells, sorts_after):
    saved = CORE.DECOR_SORTS_AFTER_ITS_CELL
    CORE.DECOR_SORTS_AFTER_ITS_CELL = sorts_after
    try:
        img, solid, _c, _g = DR.render_variant(items, cells=cells, tree=False)
    finally:
        CORE.DECOR_SORTS_AFTER_ITS_CELL = saved
    return DR.C.on_board(img), solid


def best_window(changed, w, h):
    """The (x, y) whose w x h window holds the most changed pixels — a derived crop, not a guess."""
    cum = np.cumsum(np.cumsum(changed.astype(np.int32), axis=0), axis=1)
    cum = np.pad(cum, ((1, 0), (1, 0)))
    H, W = changed.shape
    best, bx, by = -1, 0, 0
    for y in range(0, H - h, 2):
        for x in range(0, W - w, 2):
            n = int(cum[y + h, x + w] - cum[y, x + w] - cum[y + h, x] + cum[y, x])
            if n > best:
                best, bx, by = n, x, y
    return bx, by, best


def main():
    cells = DR.prepare(DR.ISLAND["variantB"]["cells"])
    items, _s = scatter.scatter_island(DR.ISLAND, DR.DECOR_META["tokenFamilies"],
                                       DR.dressing.SEED, DR.UAT_CRITERIA)
    print(f"{len(items)} placements", flush=True)
    old, _so = render(items, cells, sorts_after=False)
    new, _sn = render(items, cells, sorts_after=True)
    changed = np.any(old != new, axis=2)
    print(f"{int(changed.sum())} delivered px differ between the two rules", flush=True)

    CW, CH = 96, 60
    bx, by, n = best_window(changed, CW, CH)
    print(f"crop at ({bx},{by}) holding {n} of them", flush=True)

    def crop(img):
        return img[by:by + CH, bx:bx + CW]

    diff_panel = crop(new).copy()
    diff_panel[crop(changed)] = RECOVERED

    Z, PAD, HDR, CAP = 6, 12, 52, 40
    panels = [
        (crop(old), "BEFORE - a placement sorts on its OWN ground y",
         "the rule every committed dressing picture was composed with"),
        (crop(new), "AFTER - max(own y, its cell's centroid y)",
         "compose_core's rule, now IMPORTED rather than re-stated"),
        (diff_panel, "WHAT WAS BURIED", "every pixel the old rule painted and then overpainted"),
    ]
    W = PAD + len(panels) * (CW * Z + PAD)
    H = HDR + CH * Z + CAP
    sheet = Image.new("RGB", (W, H), BOARD)
    dr = ImageDraw.Draw(sheet)
    dr.text((PAD, 8), "THE FOURTH COMPOSITOR SITE - the dressing pass never got PR #1387's painter "
                      "order, and nothing detected it", fill=(232, 232, 232))
    dr.text((PAD, 24), f"one island, one piece set, one code state; only "
                       f"compose_core.DECOR_SORTS_AFTER_ITS_CELL moves. camera {DR.C.ELEV:g} deg "
                       f"(named parameter; the app's LAND_CAMERA_ELEVATION_DEG is 20 and is not "
                       f"read). {CW}x{CH} crop at {Z}x, derived as the window holding the most "
                       f"changed pixels", fill=(150, 150, 156))
    dr.text((PAD, 38), "32 of 120 placements owned ZERO supersampled pixels under the old rule; 3 "
                       "do under the shipped one. Decor paint 3 205 -> 5 209 supersampled px.",
            fill=(150, 150, 156))
    for i, (img, title, sub) in enumerate(panels):
        x = PAD + i * (CW * Z + PAD)
        sheet.paste(Image.fromarray(img, "RGB").resize((CW * Z, CH * Z), Image.NEAREST), (x, HDR))
        dr.text((x + 3, HDR + CH * Z + 5), title, fill=(200, 200, 204))
        dr.text((x + 3, HDR + CH * Z + 19), sub, fill=(150, 150, 156))

    out = os.path.join(HERE, "the-fourth-site.png")
    sheet.save(out)
    print("wrote the-fourth-site.png", sheet.size)

    inputs = DR.C.piece_inputs([("pieces-land", DR.LAND_PIECES),
                                ("pieces-decor", DR.DECOR_PIECES)])
    state = DR.require_one_state_per_generator(inputs)
    provenance.write_sidecar(out, __file__, sys.argv, inputs, state, extra={
        "island": "chapter2-island-place-dressing-2026-08-16/island.json",
        "cameraElevationDeg": DR.C.ELEV,
        "onlyVariable": "compose_core.DECOR_SORTS_AFTER_ITS_CELL",
        "changedDeliveredPx": int(changed.sum()),
        "crop": {"x": bx, "y": by, "w": CW, "h": CH, "zoom": Z, "changedInWindow": n,
                 "derivedAs": "the window holding the most changed pixels"},
    })
    print("wrote the-fourth-site.png.provenance.json")


if __name__ == "__main__":
    main()
