#!/usr/bin/env python3
"""WHAT EACH CANDIDATE DELIVERS — measured through the committed instrument, not a new one.

    python measure.py

`mark_census` below is `compose_options.py:804-827` VERBATIM in its predicate: alpha > 110 at
supersampled resolution, then a 3x3 block whose opaque count is >= 5 delivers one pixel. That is the
majority the compositor's `back_half` applies. Copying the predicate rather than importing it is
deliberate and narrow — `compose_options.py` executes a 30-minute island compose at import time — and
`verify.py` asserts the two agree by re-deriving the committed set's OWN published numbers with this
copy. If that assertion fails, this file is wrong and not the other one.

THE NUMBER THIS PASS EXISTS FOR is the pair (raw opaque px, delivered px). Every technique in the
survey can be made to look like grass at 84 px; the question is what survives to 28.
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
SPECIES = os.path.join(REPO, "docs", "research",
                       "chapter2-high-frequency-options-2026-08-17", "pieces-species")
MINE = os.path.join(HERE, "pieces-greenery")

META = json.load(open(os.path.join(MINE, "render-meta.json")))
SS = int(META["supersample"])


def census_one(path):
    """One piece's raw and delivered footprint. The 3x3 majority is the committed predicate."""
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    m = a > 110.0
    h, w = a.shape
    dm = (m.reshape(h // SS, SS, w // SS, SS).transpose(0, 2, 1, 3)
          .reshape(h // SS, w // SS, SS * SS).sum(axis=2) >= 5)
    out = {"rawOpaquePx": int(m.sum()), "deliveredPx": int(dm.sum())}
    #: SURVIVAL is the ratio that makes techniques comparable across wildly different raw counts —
    #: a technique that paints 3000 supersampled pixels and delivers 4 has not been tuned badly, it
    #: has been measured out. Expressed per BLOCK (each delivered px is SS*SS raw px).
    out["survivalPctOfBlocks"] = (round(100.0 * out["deliveredPx"] / (out["rawOpaquePx"] / (SS * SS)), 1)
                                  if out["rawOpaquePx"] else 0.0)
    if not dm.any():
        out.update({"bboxW": 0, "bboxH": 0, "aspect": 0.0, "rows": []})
        return out
    ys, xs = np.nonzero(dm)
    bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    sub = dm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out.update({
        "bboxW": bw, "bboxH": bh, "aspect": round(bw / bh, 2),
        "rows": ["".join("#" if v else "." for v in row) for row in sub],
    })
    return out


def census_set(d, names):
    return {n: census_one(os.path.join(d, n + ".png"))
            for n in names if os.path.exists(os.path.join(d, n + ".png"))}


CANDIDATES = census_set(MINE, META["pieceNames"])
#: THE BASELINES ARE THE COMMITTED SETS, read off disk rather than quoted from a README, so a number
#: that has drifted since it was written up shows as a disagreement instead of being inherited.
BASE_BLADE = census_set(os.path.join(GRASS, "pieces-m00-blade"),
                        ["tuft-2", "tuft-3a", "tuft-3b", "tuft-4", "shrub-a"])
BASE_CLUMP = census_set(os.path.join(GRASS, "pieces-m00-clump"),
                        ["tuft-2", "tuft-3a", "tuft-3b", "tuft-4", "shrub-a"])
BASE_SPECIES = census_set(SPECIES, ["tuft-2", "tuft-3a", "tuft-3b", "tuft-4", "shrub-a"])

REPORT = {
    "what": ("Stage 1 of the greenery technique survey: what each Blender greenery technique "
             "DELIVERS after the palette snap and the 3x3 majority downsample."),
    "pipelineFacts": {
        "pieceCanvasWorld": META["pieceCanvasWorld"],
        "pieceCanvasPx": META["pieceCanvasPx"],
        "supersample": SS,
        "deliveredCanvasPx": META["deliveredCanvasPx"],
        "groundUnitsPerDeliveredPx": META["groundUnitsPerDeliveredPx"],
        "note": ("ONE GROUND UNIT IS ONE DELIVERED PIXEL. Blender's default hair radius_scale of "
                 "0.01 is therefore 1/150th of a delivered pixel wide."),
    },
    "candidates": CANDIDATES,
    "baselines": {"pieces-m00-blade (the WITHDRAWN long grass)": BASE_BLADE,
                  "pieces-m00-clump": BASE_CLUMP,
                  "pieces-species (PR #1389)": BASE_SPECIES},
    "hairApplied": META["hairApplied"],
    "geonodeApplied": META["geonodeApplied"],
    "cardApplied": META["cardApplied"],
    "codeState": META["code_state"],
    "samples": META["samples"],
    "seed": META["seed"],
    "blender": META["blender"],
}

#: THE REFUSAL. If the transparent-emitter approach did not work, every hair figure above silently
#: contains a ~6x2 delivered-px disc and the whole pass is wrong in the generous direction.
ctl = CANDIDATES.get("control-emitter-only")
if ctl is None:
    raise SystemExit("REFUSED: no control-emitter-only piece — the hair numbers are unreadable.")
if ctl["deliveredPx"] != 0:
    raise SystemExit(
        f"REFUSED: the emitter-only control delivered {ctl['deliveredPx']} px (raw "
        f"{ctl['rawOpaquePx']}). `use_render_emitter` is gone in Blender 5.2 and the Transparent "
        f"BSDF substitute did NOT hide the emitter, so every hair piece's delivered footprint "
        f"includes its emitter disc. No report is written.")
REPORT["emitterControl"] = {
    "deliveredPx": 0, "rawOpaquePx": ctl["rawOpaquePx"],
    "meaning": ("the Transparent BSDF substitute for the removed `use_render_emitter` works: the "
                "emitter contributes nothing to any hair piece's delivered footprint"),
}

with open(os.path.join(HERE, "greenery-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)


def table(title, rows):
    print(f"\n{title}")
    print(f"  {'piece':22} {'raw':>6} {'delivered':>10} {'survival':>9}  {'box':>7} {'aspect':>6}")
    for n, c in rows:
        box = f"{c['bboxW']}x{c['bboxH']}" if c["deliveredPx"] else "-"
        print(f"  {n:22} {c['rawOpaquePx']:6} {c['deliveredPx']:10} "
              f"{c['survivalPctOfBlocks']:8.1f}% {box:>7} {c['aspect']:6.2f}")


table("CANDIDATES", list(CANDIDATES.items()))
table("BASELINE pieces-m00-blade (the WITHDRAWN long grass)", list(BASE_BLADE.items()))
table("BASELINE pieces-species (PR #1389)", list(BASE_SPECIES.items()))

print("\nDELIVERED SHAPES")
for n, c in CANDIDATES.items():
    if c["deliveredPx"]:
        print(f"  {n}  ({c['deliveredPx']} px)")
        for r in c["rows"]:
            print(f"      {r}")
    else:
        print(f"  {n}  DELIVERS NOTHING (raw {c['rawOpaquePx']} px)")
print("\nwrote greenery-report.json")
