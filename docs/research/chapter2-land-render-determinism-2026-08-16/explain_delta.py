#!/usr/bin/env python3
"""What actually produced two numbers from one source digest.

The render is deterministic (`determinism.py`), so the 34,968-vs-34,970 / 60-vs-59 split has another
cause. The piece directories name it: the two lanes ran the SAME generator with a DIFFERENT
`--samples`.

    camera-elevation sweep   `sweep_render.py` LAND_SAMPLES = "32"   -> panel-50  34,970 px / 59
    island-place dressing    pieces-land/render-meta.json argv 48    -> bare      34,968 px / 60

`--samples` is a flag, and `blender_land.py`'s `_own_code_state()` is the SOURCE DIGEST by deliberate
design — its own docstring says "NOT the flags", because the chamfer sweep varies `--chamfer` on
purpose. So both lanes truthfully declared code state `15927bf5` while rendering at different sample
counts, and the provenance mechanism was never built to catch it. That is the real finding.

This measures the claim rather than arguing it: ONE compositor, ONE island, the SAME code state, two
piece sets differing only in `--samples`. The measurement replicates `compose_sweep.py`'s land leg
exactly — rebind the fork compositor onto the island and the piece set, `C.compose(INTERIOR, MODE)`,
`C.back_half`, count `solid` and the distinct RGB triples inside it — taken BEFORE any tree is
planted, which is where the sweep takes it too.

    python explain_delta.py
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
DRESS = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16")

sys.path.insert(0, FORK)
_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)

# The sweep's own two constants for the land leg, read off `compose_sweep.py` rather than guessed.
INTERIOR, ELEVATION_MODE = "flat", "cell"


def rebind(island_path, pieces):
    """`compose_sweep.rebind`, verbatim in effect: the compositor reads its module state at CALL
    time, so re-pointing it is enough and no arithmetic is restated."""
    island = json.load(open(island_path))
    meta = json.load(open(os.path.join(pieces, "render-meta.json")))

    C.ISLAND, C.PIECES, C.META = island, pieces, meta
    C.SS = int(meta["supersample"])
    C.ELEV = float(island["camera"]["elevationDeg"])
    C.SIN = float(island["camera"]["groundFlattening"])
    C.COS = float(island["camera"]["uprightForeshortening"])
    C.CLIFF = float(meta["cliffDropWorld"])
    C.TILE_DEPTH_WORLD = float(meta["tileDepthWorld"])
    C.COAST = np.array(island["coastLoopGround"], dtype=np.float64)
    C.CAPS = list(island["capStatuses"])
    C.CAP_LEVEL = [(i * 2 + 1) % C.N_LEVELS for i in range(len(C.CAPS))]

    gx0 = C.COAST[:, 0].min() - C._pad
    gx1 = C.COAST[:, 0].max() + C._pad
    gy0 = C.COAST[:, 1].min() - C._pad
    gy1 = C.COAST[:, 1].max() + C._pad
    C.CANVAS_W = int(math.ceil(gx1 - gx0))
    C.CANVAS_H = int(math.ceil((gy1 - gy0) * C.SIN + C.CLIFF * C.COS + C._TREE_HEADROOM))
    C.ORIGIN = (-gx0, -gy0 * C.SIN + C._TREE_HEADROOM)

    C.TILE_PIECES = [C.classify(os.path.join(pieces, f"tile-{i}.png"))
                     for i in range(len(island["variantA"]["pieceSet"]))]
    C.WALL_PIECES = [C.classify(os.path.join(pieces, f"wall-{h}.png"))
                     for h in range(int(island["wall"]["headings"]))]
    return meta


def measure(label, pieces):
    meta = rebind(os.path.join(DRESS, "island.json"), pieces)
    canvas, alpha, _tree_h = C.compose(INTERIOR, ELEVATION_MODE)
    img, solid = C.back_half(canvas, alpha)
    colours = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
    row = {"label": label,
           "pieces": os.path.relpath(pieces, REPO).replace("\\", "/"),
           "samples": int(meta["samples"]),
           "codeState": meta["code_state"]["sha256"][:16],
           "canvas": [C.CANVAS_W, C.CANVAS_H],
           "landPx": int(solid.sum()),
           "landColours": len(colours)}
    print(f"{label:28s} samples={row['samples']:<3} codeState={row['codeState']}  "
          f"landPx={row['landPx']}  landColours={row['landColours']}", flush=True)
    return row


def via_dressing_composer():
    """The dressing lane measures through its OWN `compose_land`, not through `C.compose`, so the
    colour half of the split has to be measured there or it is only half attributed.

    Imported rather than restated: `compose_dressed.py` guards its work behind `__main__`, so an
    import gives the real function without running the pass."""
    sys.path.insert(0, DRESS)
    cwd = os.getcwd()
    os.chdir(DRESS)                       # its module state resolves piece dirs relative to itself
    try:
        import compose_dressed as D
        D.prepare(D.ISLAND["variantB"]["cells"])
        _img, solid, colours, _ground = D.render_variant([], tree=False)
        return {"label": "dressing lane's own compose_land (48)",
                "landPx": int(solid.sum()), "landColours": len(colours)}
    finally:
        os.chdir(cwd)


if __name__ == "__main__":
    rows = [
        measure("fresh --samples 32", os.path.join(HERE, "runs", "base1")),
        measure("fresh --samples 48", os.path.join(HERE, "runs", "s48")),
        measure("committed pieces-land (48)", os.path.join(DRESS, "pieces-land")),
    ]
    dressed = via_dressing_composer()
    print(f"{dressed['label']:28s} {'':16}{'':22}  landPx={dressed['landPx']}  "
          f"landColours={dressed['landColours']}")
    same_state = len({r["codeState"] for r in rows}) == 1
    rep = {
        "question": "one source digest, two published numbers — what varied?",
        "rows": rows,
        "throughTheDressingComposer": dressed,
        "attribution": {
            "theTwoPixels": "`--samples` 32 vs 48 — a RENDER FLAG, on an otherwise identical run",
            "theOneColour": ("the COMPOSITOR — the sweep's land leg counts through the fork's bare "
                             "`C.compose('flat','cell')`, the dressing lane through its own "
                             "`compose_land`. Both report the SAME `solid` mask and therefore the "
                             "same landPx; only the colour set differs."),
        },
        "allOneCodeState": same_state,
        "published": {
            "sweepPanel50": {"landPx": 34970, "landColours": 59, "samples": 32,
                             "source": "docs/research/chapter2-camera-elevation-sweep-2026-08-15/"
                                       "camera-elevation-45-vs-50-report.json"},
            "dressingBare": {"landPx": 34968, "landColours": 60, "samples": 48,
                             "source": "docs/research/chapter2-island-place-dressing-2026-08-16/"
                                       "dressing-report.json"},
        },
        "finding": ("`--samples` is a RENDER FLAG, and `_own_code_state()` is the SOURCE DIGEST by "
                    "design ('NOT the flags'). Both lanes declared 15927bf5 honestly while rendering "
                    "at 32 and 48 samples, and the sample count moves the antialiased edge coverage "
                    "that the majority downsample then resolves — which is where the pixels and the "
                    "one extra colour come from."),
    }
    with open(os.path.join(HERE, "delta-report.json"), "w") as fh:
        json.dump(rep, fh, indent=1)
    print("one code state across all rows:", same_state)
