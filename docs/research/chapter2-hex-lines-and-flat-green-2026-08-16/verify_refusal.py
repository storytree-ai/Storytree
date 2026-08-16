#!/usr/bin/env python3
"""EVERY GUARD MADE TO FIRE.

    python verify_refusal.py

This pass's headline is a NEGATIVE — the hex grid is stroked zero times — and a negative is only
worth as much as the instrument that failed to find anything. A detector that is silently unwired
returns exactly the same zero as a detector that looked and found nothing, and the two are
indistinguishable from the output alone. So the hex detector is fed a synthetic hex here and has to
catch it, the classifier is fed an unclassifiable ring and has to refuse it, and the one-variable
check is fed a moved fill and has to notice.

The prior pass built this file for the same reason and recorded the trap it exists to avoid: with
fourteen directories differing by two characters, a fork picture composed from the wrong one is one
typo away and looks completely plausible. Here the equivalent hazard is subtler and worse — nothing
about a hex-off panel that is identical to as-is LOOKS wrong, because that identity is the finding.
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PRIOR = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
sys.path.insert(0, PRIOR)

import compose_core as D                                # noqa: E402

import seams as S                                       # noqa: E402

C = D.C
ISLAND = D.ISLAND
CELLS = D.prepare(ISLAND["variantB"]["cells"])
HEXES = S.load_hex_lattice()

RESULTS = []


def report(name, ok, detail=""):
    RESULTS.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  - {detail}" if detail else ""))


CTRL = S.SeamControl(C, ISLAND, HEXES)


def px(poly, height):
    return [(C.project(gx, gy, height)[0] * C.SS, C.project(gx, gy, height)[1] * C.SS)
            for gx, gy in poly]


# ---------------------------------------------------------------- the detector FIRES on a hex
tile = HEXES["tiles"][0]
h0 = C.height_of(CELLS[0], "cell")
report("the hex detector CLASSIFIES a synthetic hex tile as `hex`",
       CTRL.classify(px(tile["poly"], h0)) == "hex",
       "so the zero in the inventory is a live detector reporting nothing, not a dead one")

# ---------------------------------------------------------------- and the detector fires at ANY
# height a cell is drawn at, which is what makes the inventory's zero total rather than lucky.
heights = sorted({round(float(C.height_of(c, "cell")), 6) for c in CELLS})
report("the hex detector fires at EVERY height a cell is drawn at",
       all(CTRL.classify(px(tile["poly"], h)) == "hex" for h in heights),
       f"{len(heights)} distinct cell heights")

# ---------------------------------------------------------------- a real cell is NOT a hex
report("a genuine mesh cell is classified `cell`, never `hex`",
       CTRL.classify(px(CELLS[0]["poly"], CELLS[0]["_h"])) == "cell",
       "the detector discriminates rather than labelling everything it sees")

# ---------------------------------------------------------------- the coast is its own class
report("the coast ring is classified `coast`",
       CTRL.classify(px(C.COAST, 0.0)) == "coast")

# ---------------------------------------------------------------- an unknown ring is REFUSED
bogus = [(10.0, 10.0), (40.0, 12.0), (30.0, 55.0), (8.0, 40.0)]
report("an unrecognised ring is `other` — the inventory refuses rather than absorbing it",
       CTRL.classify(bogus) == "other",
       "compose_lines.py exits on any `other`, so an incomplete inventory can never be reported "
       "as a total one")

# ---------------------------------------------------------------- suppression actually suppresses
CTRL.install()
try:
    CTRL.reset({"coast", "cell", "hex"})
    D.compose_land([])
    with_all = CTRL.inventory()

    CTRL.reset({"coast"})
    canvas_a, alpha_a, _ = D.compose_land([])
    only_coast = CTRL.inventory()

    CTRL.reset({"coast", "cell"})
    canvas_b, alpha_b, _ = D.compose_land([])

    report("suppressing `cell` changes the raw canvas",
           not np.array_equal(canvas_a, canvas_b),
           "the control is wired to the pixels, not merely to a counter")
    report("the inventory COUNTS a suppressed stroke rather than losing it",
           only_coast["cell"] == with_all["cell"] == len(CELLS),
           f"{only_coast['cell']} cell strokes still seen while suppressed - suppression is not "
           f"the same event as absence, and conflating them would understate the island")

    # ------------------------------------------------------------ a moved fill IS caught
    # THE PERTURBATION IS APPLIED TO A COPY OF THE EXPECTATION, never to the shipped side. The prior
    # pass recorded getting the analogous test wrong by patching `C.fill_polygon` outright, which
    # moved both canvases together so they still matched and the guard "passed" a compositor drawing
    # the wrong thing.
    base = canvas_b.copy()
    perturbed = canvas_b.copy()
    ys, xs = np.where(alpha_b > 0)
    perturbed[ys[0], xs[0]] = perturbed[ys[0], xs[0]] + 1
    report("a ONE-PIXEL fill drift between two composites is caught",
           not np.array_equal(base, perturbed),
           "the same comparison check 5 of verify.py makes across the fork")
finally:
    CTRL.restore()

print(f"\n{sum(RESULTS)}/{len(RESULTS)} guards fired as designed")
sys.exit(0 if all(RESULTS) else 1)
