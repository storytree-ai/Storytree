#!/usr/bin/env python3
"""Make the one-code-state refusal FIRE. A guard only ever observed passing is indistinguishable
from one that cannot fail.

    python verify_refusal.py

TWO refusals are exercised, because this pass added a second one and the new one is the more
dangerous of the pair.

  1. THE CODE-STATE REFUSAL, per generator. A tampered copy of `pieces-land` declares a different
     `blender_land.py` digest from the real one, and the composer must refuse before drawing.

  2. THE LAND-DRIFT REFUSAL. `compose_dressed.compose_land([])` is asserted byte-identical to the
     shipped `compose.py` on every run. That assertion is what licenses this pass to keep its own
     draw-list assembly at all, so it has to be shown capable of failing: the shipped compositor is
     perturbed in a way that changes one pixel, and `assert_land_unchanged` must catch it.

Neither tampering touches a committed artifact — (1) works on a copied directory under a temp name,
and (2) restores the function it patched.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import compose_dressed as D  # noqa: E402

C = D.C
failures = []


def expect(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail else ""))
    if not ok:
        failures.append(name)


# ---------------------------------------------------------------- 1. the code-state refusal
TAMPERED = os.path.join(HERE, ".verify-tampered-land")
shutil.rmtree(TAMPERED, ignore_errors=True)
shutil.copytree(D.LAND_PIECES, TAMPERED)
meta_path = os.path.join(TAMPERED, "render-meta.json")
meta = json.load(open(meta_path))
real_sha = meta["code_state"]["sha256"]
meta["code_state"]["sha256"] = "deadbeef" + real_sha[8:]
json.dump(meta, open(meta_path, "w"), indent=1)

try:
    inputs = C.piece_inputs([("pieces-land", D.LAND_PIECES),
                             ("pieces-land-TAMPERED", TAMPERED),
                             ("pieces-decor", D.DECOR_PIECES)])
    D.require_one_state_per_generator(inputs)
    expect("the composer REFUSES two land directories at different code states", False,
           "it composed anyway")
except SystemExit as exc:
    msg = str(exc)
    expect("the composer REFUSES two land directories at different code states",
           "REFUSED: cells were not rendered at the same code state" in msg
           and "pieces-land-TAMPERED" in msg,
           msg.splitlines()[0] if msg else "")
finally:
    shutil.rmtree(TAMPERED, ignore_errors=True)

# and the complement: the SAME two generators disagreeing with each other must NOT refuse, which is
# the case that made the shared helper unusable here in the first place
try:
    inputs_ok = C.piece_inputs([("pieces-land", D.LAND_PIECES), ("pieces-decor", D.DECOR_PIECES)])
    state = D.require_one_state_per_generator(inputs_ok)
    expect("two DIFFERENT generators at their own states compose fine",
           len(state["generators"]) == 2,
           " + ".join(f"{g}@{s[:8]}" for g, s in sorted(state["generators"].items())))
except SystemExit as exc:
    expect("two DIFFERENT generators at their own states compose fine", False, str(exc))


# ---------------------------------------------------------------- 2. the land-drift refusal
#
# THE FIRST VERSION OF THIS TEST DID NOT FIRE, AND WHY IT DID NOT IS THE USEFUL PART. Patching
# `C.fill_polygon` outright perturbs BOTH sides of the comparison — `compose_dressed`'s land pass and
# the shipped `C.compose` both call it — so the two canvases moved together and still matched. The
# guard passed a compositor that was drawing the wrong thing.
#
# That is not a hole in the guard; it is its actual SCOPE, made visible. `assert_land_unchanged`
# compares two paths that share every primitive, so the only thing it can catch is drift in the part
# that differs: this pass's own draw-list assembly. The shared primitives cannot drift, because they
# are literally the same function object. So the falsification has to perturb ONE side, which is
# exactly what a hand-copied assembly going wrong would look like.
state = {"on": True}
original = C.fill_polygon
original_compose = C.compose


def perturbed(canvas, alpha, poly_px, rgb, seam_rgb=None):
    # shift every cell fill by a single supersampled pixel — the smallest change that is still a
    # change, and exactly the kind of drift a hand-copied draw list would introduce
    if state["on"]:
        poly_px = [(x + 1.0, y) for x, y in poly_px]
    return original(canvas, alpha, poly_px, rgb, seam_rgb)


def clean_compose(*a, **k):
    """The SHIPPED compositor, held clean while this pass's copy is perturbed."""
    state["on"] = False
    try:
        return original_compose(*a, **k)
    finally:
        state["on"] = True


C.fill_polygon = perturbed
C.compose = clean_compose
try:
    D.assert_land_unchanged()
    expect("assert_land_unchanged CATCHES a one-pixel drift in the land pass", False,
           "it passed a perturbed compositor")
except SystemExit as exc:
    expect("assert_land_unchanged CATCHES a one-pixel drift in the land pass",
           "REFUSED" in str(exc) and "drifted from the shipped compose.py" in str(exc),
           str(exc).splitlines()[0])
finally:
    C.fill_polygon = original
    C.compose = original_compose

# restored, and shown to be restored — a test that leaves the module patched would make every later
# check in the same process meaningless
try:
    D.assert_land_unchanged()
    expect("and the land pass is clean again once the perturbation is removed", True)
except SystemExit as exc:
    expect("and the land pass is clean again once the perturbation is removed", False, str(exc))

print()
if failures:
    raise SystemExit(f"RED — {len(failures)} refusal(s) did not behave: {failures}")
print("ALL GREEN — every guard fired on demand and passed when it should")
