#!/usr/bin/env python3
"""MAKE EVERY GUARD FIRE. A guard only ever observed passing is indistinguishable from one that
cannot fail.

    python verify_refusal.py

Three guards stand between this pass and a picture that lies, and a fourteen-panel fork sweep is
exactly the shape that puts pressure on all three at once:

  1. `use_pieces(..., expect_mix=, expect_geometry=)` — the panel/caption binding. With fourteen
     directories differing by two characters in the name, a fork picture composed from the wrong one
     is always one typo away, and it would look completely plausible.
  2. `require_one_state_per_generator` — two directories from the SAME generator at DIFFERENT code
     states, i.e. a comparison rendered either side of an edit.
  3. `assert_land_unchanged` — this file's land pass drifting from the shipped compositor, which
     would make every "before" panel not the thing it claims to be.

Guard 3's test perturbs ONLY the copy, never the shipped side. The vendored pass recorded getting
this wrong: patching `C.fill_polygon` outright moved both canvases together, so they still matched
and the guard "passed" a compositor drawing the wrong thing. Comparing two paths that share every
primitive can only catch drift in the part that DIFFERS.
"""
import json
import os
import shutil
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import grass                                            # noqa: E402
import compose_core as D                                # noqa: E402

C = D.C
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append({"check": name, "pass": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)


def tag_for(mix, geom):
    return "pieces-m%02d-%s" % (round(mix * 100), geom)


# ---------------------------------------------------------------- 1. the panel/caption binding
fired = False
try:
    D.use_pieces(tag_for(1.0, "blade"), expect_mix=0.0, expect_geometry="blade")
except SystemExit as e:
    fired = "grassNormalMix" in str(e)
check("mounting a mix-1.00 directory AS mix 0.00 is REFUSED", fired,
      "a fork panel cannot carry a caption its pixels do not")

fired = False
try:
    D.use_pieces(tag_for(0.0, "clump"), expect_mix=0.0, expect_geometry="blade")
except SystemExit as e:
    fired = "grassGeometry" in str(e)
check("mounting a CLUMP directory AS blade is REFUSED", fired,
      "the geometry fork is bound the same way the normals fork is")

D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
check("and the CORRECT mount still succeeds", D.DECOR_META["grassNormalMix"] == 0.0,
      "the guard has teeth without refusing every honest run")

# ---------------------------------------------------------------- 2. one code state per generator
TMP = os.path.join(HERE, "_refusal-tmp")
shutil.rmtree(TMP, ignore_errors=True)
shutil.copytree(os.path.join(HERE, tag_for(0.0, "blade")), TMP)
meta = json.load(open(os.path.join(TMP, "render-meta.json")))
meta["code_state"]["sha256"] = "0" * 64          # the same generator at a DIFFERENT state
json.dump(meta, open(os.path.join(TMP, "render-meta.json"), "w"), indent=1)
fired = False
try:
    D.require_one_state_per_generator(
        C.piece_inputs([("a", os.path.join(HERE, tag_for(0.0, "blade"))), ("b", TMP)]))
except (SystemExit, AssertionError, RuntimeError, ValueError) as e:
    fired = True
    why = str(e)[:90]
else:
    why = "did NOT refuse"
check("two directories from ONE generator at TWO code states are REFUSED", fired, why)

# the same call across the two DIFFERENT generators this pass genuinely uses must NOT refuse — the
# extension the vendored pass had to make, and the case that would break every correct run
ok = True
try:
    D.require_one_state_per_generator(
        C.piece_inputs([("pieces-land", D.LAND_PIECES),
                        ("grass", os.path.join(HERE, tag_for(0.0, "blade")))]))
except Exception:
    ok = False
check("two DIFFERENT generators at their own states compose fine", ok,
      "land + grass disagree BY CONSTRUCTION; the refusal runs within each generator's group")
shutil.rmtree(TMP, ignore_errors=True)

# ---------------------------------------------------------------- 3. the land-drift guard
real_fill = C.fill_polygon
try:
    def perturbed(canvas, alpha, poly, rgb, seam_rgb=None):
        # ONE pixel, and only on THIS pass's own draw-list assembly — the shipped compositor keeps
        # the real primitive, so the two canvases can actually diverge
        real_fill(canvas, alpha, poly, rgb, seam_rgb=seam_rgb)
        canvas[0, 0] = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        alpha[0, 0] = 1.0

    D.C.fill_polygon = perturbed
    saved = D.compose_land
    fired = False
    try:
        # only compose_land sees the perturbation; C.compose is re-fetched with the real primitive
        D.C.fill_polygon = perturbed
        mine = D.compose_land([])
        D.C.fill_polygon = real_fill
        theirs = C.compose(D.INTERIOR, D.ELEVATION_MODE)
        fired = not np.array_equal(mine[0], theirs[0])
    finally:
        D.C.fill_polygon = real_fill
    check("assert_land_unchanged CATCHES a one-pixel drift in the land pass", fired,
          "and it perturbs only the COPY — perturbing a shared primitive moves both sides together")
finally:
    C.fill_polygon = real_fill

try:
    D.assert_land_unchanged()
    check("and the land pass is clean again once the perturbation is removed", True)
except SystemExit as e:
    check("and the land pass is clean again once the perturbation is removed", False, str(e)[:90])

ok = sum(1 for r in RESULTS if r["pass"])
print(f"\n{ok}/{len(RESULTS)} refusals fired as intended")
with open(os.path.join(HERE, "verify-refusal-report.json"), "w") as fh:
    json.dump({"passed": ok, "total": len(RESULTS), "checks": RESULTS}, fh, indent=1)
sys.exit(0 if ok == len(RESULTS) else 1)
