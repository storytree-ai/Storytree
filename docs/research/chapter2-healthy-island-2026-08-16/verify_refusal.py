#!/usr/bin/env python3
"""MAKE EVERY GUARD FIRE.

    python verify_refusal.py

A guard only ever observed PASSING is indistinguishable from one that cannot fail, and this pass's
central claim is a NEGATIVE — *nothing on this island is invented*. A negative is worth exactly as
much as the instrument that failed to find anything, so each refusal below is fed the thing it exists
to catch and required to catch it.

The prior passes recorded getting the analogous test wrong by perturbing BOTH sides of a comparison,
so the two moved together and the guard "passed" a compositor drawing the wrong thing. Every
perturbation here is applied to a COPY of the input, never to the shipped module.
"""
import copy
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
LINES = os.path.join(REPO, "docs", "research", "chapter2-hex-lines-and-flat-green-2026-08-16")

sys.path.insert(0, HERE)
sys.path.insert(0, GRASS)
sys.path.insert(0, LINES)
import island_pass as P                                   # noqa: E402
import compose_core as D                                  # noqa: E402
import seams as S                                         # noqa: E402

C = D.C
RESULTS = []


def fires(name, fn, expect="REFUSED"):
    """Require `fn` to raise, AND to raise the refusal it was supposed to raise.

    THE FIRST VERSION OF THIS FUNCTION ACCEPTED ANY EXCEPTION, AND IT REPORTED FIVE FALSE PASSES.
    The probe copied `compose_healthy.py` into a temp directory, which re-rooted its `HERE` so it
    could no longer find the prior passes; every guard "fired" with `FileNotFoundError` from an
    import, having never reached the guard at all. That is the same failure this whole file exists to
    prevent, one level up — a harness that cannot fail is worth no more than a guard that cannot.

    So a fire counts only when the message carries `expect`. Any other exception is a FAIL and prints
    what actually happened, because "the guard did not fire" and "the probe was broken" are different
    problems and must not look alike.
    """
    try:
        fn()
    except BaseException as exc:                           # noqa: BLE001
        msg = " ".join(str(exc).split())
        ok = expect.lower() in msg.lower()
        RESULTS.append((name, ok))
        print(f"{'PASS' if ok else 'FAIL'}  {name}\n        "
              f"{'fired' if ok else f'WRONG EXCEPTION (wanted {expect!r})'}: "
              f"{type(exc).__name__}: {msg[:110]}", flush=True)
        return ok
    RESULTS.append((name, False))
    print(f"FAIL  {name}   DID NOT FIRE", flush=True)
    return False


def holds(name, ok, detail=""):
    RESULTS.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)
    return bool(ok)


ISLAND = json.load(open(os.path.join(HERE, "island.json")))
PROOF = json.load(open(os.path.join(HERE, "proof.json")))
FIXTURE = json.load(open(os.path.join(GRASS, "island.json")))

print("\n== 1. the composer refuses data it must not draw ==")


def _run_composer(island_doc=None, proof_doc=None, story=None):
    """Run the REAL `compose_healthy.py`, in its REAL directory, against perturbed inputs.

    The perturbed island/proof go to a scratch directory and are pointed at through the module's
    `STORYTREE_HEALTHY_ISLAND` / `_PROOF` environment overrides, and `STORYTREE_HEALTHY_OUT` sends
    every write there too. So:

      * the module resolves `HERE`/`REPO` correctly and imports the prior passes as it always does —
        the earlier temp-directory COPY re-rooted those and every guard died on an unrelated
        `FileNotFoundError` before reaching the thing under test;
      * a guard that FAILS to fire writes its perturbed pictures into the scratch directory rather
        than over the delivered ones, which is exactly the run where that would matter most;
      * the committed `island.json` / `proof.json` are never written at all.

    `story` is perturbed by patching `island_pass` IN MEMORY after import, so no source file moves.
    """
    import tempfile
    import shutil
    tmp = tempfile.mkdtemp(prefix="healthy-island-refusal-")
    env_keys = ("STORYTREE_HEALTHY_ISLAND", "STORYTREE_HEALTHY_PROOF", "STORYTREE_HEALTHY_OUT")
    saved_env = {k: os.environ.get(k) for k in env_keys}
    saved_story = P.STORY_ID
    try:
        island_path = os.path.join(tmp, "island.json")
        proof_path = os.path.join(tmp, "proof.json")
        json.dump(island_doc if island_doc is not None else ISLAND, open(island_path, "w"))
        json.dump(proof_doc if proof_doc is not None else PROOF, open(proof_path, "w"))
        os.environ["STORYTREE_HEALTHY_ISLAND"] = island_path
        os.environ["STORYTREE_HEALTHY_PROOF"] = proof_path
        os.environ["STORYTREE_HEALTHY_OUT"] = tmp
        if story is not None:
            P.STORY_ID = story
        sys.modules.pop("compose_healthy_probe", None)
        spec = importlib.util.spec_from_file_location(
            "compose_healthy_probe", os.path.join(HERE, "compose_healthy.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    finally:
        P.STORY_ID = saved_story
        for k, v in saved_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        shutil.rmtree(tmp, ignore_errors=True)


# --- 1a. an INVENTED status ------------------------------------------------------------------------
# The whole increment in one test: paint one capability with the fixture's charcoal and require the
# composer to refuse rather than to draw it and explain afterwards.
def _invented_status():
    bad = copy.deepcopy(ISLAND)
    bad["capStatuses"][0] = "unhealthy"
    bad["capabilities"][0]["status"] = "unhealthy"
    _run_composer(island_doc=bad)


fires("an INVENTED status (`unhealthy`) is REFUSED, not drawn", _invented_status)


# --- 1b. green without a signed pass ----------------------------------------------------------------
def _unsigned_green():
    bad = copy.deepcopy(ISLAND)
    bad["capabilities"][0]["verdictGlyph"] = "-"        # claims healthy with no signed pass
    _run_composer(island_doc=bad)


fires("a `healthy` cell with NO signed pass is REFUSED (ADR-0040's wall)", _unsigned_green)


# --- 1c. a proof read for a DIFFERENT story ---------------------------------------------------------
def _wrong_story_proof():
    bad = copy.deepcopy(PROOF)
    bad["storyId"] = "some-other-story"
    _run_composer(proof_doc=bad)


fires("a proof.json read for ANOTHER story is REFUSED (the caption-vs-pixels failure)",
      _wrong_story_proof)


# --- 1d. the three sources disagreeing about which story this is ------------------------------------
fires("island.json / proof.json / island_pass.STORY_ID must name ONE story",
      lambda: _run_composer(story="library-tech-tree-overlay"))


# --- 1e. a piece set that does not describe this island ---------------------------------------------
def _wrong_piece_set():
    bad = copy.deepcopy(ISLAND)
    bad["variantA"]["pieceSet"][0]["shape"] = "NOT-THE-SHAPE-THE-PIECES-WERE-RENDERED-FOR"
    _run_composer(island_doc=bad)


fires("a land piece set that does not describe this island's geometry is REFUSED", _wrong_piece_set)


print("\n== 2. the seam detector is ARMED, not merely quiet ==")

# The pass reports `hex: 0` — no hex TILE is ever stroked. That is a negative, so the detector that
# found nothing has to be shown finding something. Feed it a synthetic hex ring at every height the
# compositor actually draws a cell at.
D.ISLAND_PATH = os.path.join(HERE, "island.json")
D.LAND_PIECES = os.path.join(GRASS, "pieces-land")
D.ISLAND, D.LAND_META = D.rebind()
CTRL = S.SeamControl(C, D.ISLAND, {"tiles": D.ISLAND["hexLattice"]["tiles"]})

heights = sorted({round(float(C.height_of(c, "cell")), 6) for c in D.ISLAND["variantB"]["cells"]})
holds("the detector carries real candidate hex rings, not an empty table",
      CTRL.hex_rings > 0, f"{CTRL.hex_rings} rings over {len(heights)} distinct cell heights")

fired_at = []
for h in heights:
    tile = D.ISLAND["hexLattice"]["tiles"][0]
    ring = [(C.project(gx, gy, h)[0] * C.SS, C.project(gx, gy, h)[1] * C.SS)
            for gx, gy in tile["poly"]]
    if CTRL.classify(ring) == "hex":
        fired_at.append(h)
holds("it CLASSIFIES a synthetic hex tile as `hex` at EVERY height a cell is drawn at",
      len(fired_at) == len(heights), f"{len(fired_at)}/{len(heights)} heights")

cell = D.ISLAND["variantB"]["cells"][0]
ch = C.height_of(cell, "cell")
cell_ring = [(C.project(gx, gy, ch)[0] * C.SS, C.project(gx, gy, ch)[1] * C.SS)
             for gx, gy in cell["poly"]]
holds("it DISCRIMINATES - a genuine mesh cell classifies `cell`, never `hex`",
      CTRL.classify(cell_ring) == "cell", CTRL.classify(cell_ring))

coast_ring = [(C.project(gx, gy)[0] * C.SS, C.project(gx, gy)[1] * C.SS) for gx, gy in C.COAST]
holds("the coast ring is its own class", CTRL.classify(coast_ring) == "coast")

holds("an unrecognised ring is `other` - which the composer REFUSES rather than bucketing",
      CTRL.classify([(0.0, 0.0), (1.0, 0.0), (0.5, 1.0)]) == "other")


print("\n== 3. the land mirror catches drift ==")

# `assert_land_unchanged` compares this pass's land pass against the SHIPPED compositor's. Perturb
# ONLY the shipped side's output through a wrapper on the copy — never `C.fill_polygon` itself, which
# both paths call and which would move the two canvases together, leaving the guard "passing" a
# compositor drawing the wrong thing (the trap the dressing pass recorded hitting).
_real_compose = C.compose


def _drifted_compose(interior, elev):
    canvas, alpha, h = _real_compose(interior, elev)
    canvas = canvas.copy()
    ys, xs = np.where(alpha > 0)
    canvas[ys[0], xs[0]] = np.array([255.0, 0.0, 255.0], dtype=np.float32)   # ONE pixel
    return canvas, alpha, h


def _one_pixel_drift():
    C.compose = _drifted_compose
    try:
        D.assert_land_unchanged()
    finally:
        C.compose = _real_compose


fires("a ONE-PIXEL drift between this pass's land and the shipped compositor is CAUGHT",
      _one_pixel_drift)
holds("...and the land pass is clean again once the perturbation is removed",
      D.assert_land_unchanged() is not None)


print("\n== 4. the one-code-state refusal still has teeth ==")

# The pass composes from TWO generators (blender_land.py, blender_grass.py) whose digests disagree by
# construction, so the shared refusal is applied PER generator. That widening must not have removed
# the case the guard exists for: two directories from the SAME generator at different states.
def _two_states_one_generator():
    inputs = [
        {"label": "a", "dir": "a", "codeState": {"generator": "blender_land.py", "sha256": "aaa"}},
        {"label": "b", "dir": "b", "codeState": {"generator": "blender_land.py", "sha256": "bbb"}},
    ]
    D.require_one_state_per_generator(inputs)


fires("two directories from ONE generator at DIFFERENT states still refuse", _two_states_one_generator)

ok_two_gens = D.require_one_state_per_generator([
    {"label": "land", "dir": "l", "codeState": {"generator": "blender_land.py", "sha256": "aaa"}},
    {"label": "decor", "dir": "d", "codeState": {"generator": "blender_grass.py", "sha256": "bbb"}},
])
holds("...while two DIFFERENT generators at their own states compose fine",
      ok_two_gens["sha256"] and len(ok_two_gens["generators"]) == 2,
      f"{sorted(ok_two_gens['generators'])}")


# ================================================================= summary
ok = sum(1 for _n, o in RESULTS if o)
print(f"\n{ok}/{len(RESULTS)} guards proved alive")
sys.exit(0 if ok == len(RESULTS) else 1)
