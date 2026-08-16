#!/usr/bin/env python3
"""MAKE EVERY GUARD FIRE.

    python verify_refusal.py          # ~8 min: four of these drive the real composer

This pass's central claim is a NEGATIVE — *the shadow does not change what any cell says* — and a
negative is worth exactly as much as the instrument that failed to find anything. `verify.py` reports
`0 of 12457`; this file is what makes that zero mean something, by feeding the guard the thing it
exists to catch and requiring it to catch it.

TWO RULES INHERITED FROM THE PRIOR PASS'S OWN MISTAKE, and they are the reason this file is shaped the
way it is. Its first harness copied the composer into a temp directory, which re-rooted the module's
`HERE` so it could no longer resolve the prior passes: all five guards "fired" with `FileNotFoundError`
from an import, having never reached the thing under test, and a `fires()` that accepted ANY exception
reported them green. So here too:

  * the composer runs REAL, in its REAL directory, perturbed through environment overrides — never a
    copy, and every write sent to a scratch directory so a guard that FAILS to fire cannot overwrite
    the delivered pictures with its perturbed ones;
  * a fire counts only when the message carries the refusal it was supposed to raise.

A harness that cannot fail is worth no more than a guard that cannot.
"""
import copy
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HEALTHY = os.path.join(REPO, "docs", "research", "chapter2-healthy-island-2026-08-16")
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")

sys.path.insert(0, HERE)
sys.path.insert(0, HEALTHY)
sys.path.insert(0, GRASS)
import island_pass as P                                     # noqa: E402
import shadow as SH                                         # noqa: E402

_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)

RESULTS = []


def run_composer(env_extra=None, island_doc=None, proof_doc=None, patch=None):
    """Run `compose_shadow.py` REAL, in its real directory, perturbed only through the environment.

    Returns (returncode, combined output). A perturbed island/proof is written to the scratch directory
    and pointed at through `compose_healthy.py`'s own `STORYTREE_HEALTHY_ISLAND` / `_PROOF` overrides,
    which is what lets this file prove that the IMPORTED refusals are live in this pass and not merely
    live in the pass they came from.

    `patch` is a snippet prepended via `-c`, for the guards whose perturbation is a module CONSTANT
    rather than an input file — so no source file moves for those either.
    """
    tmp = tempfile.mkdtemp(prefix="one-surface-shadow-refusal-")
    try:
        env = dict(os.environ, STORYTREE_SHADOW_OUT=tmp, STORYTREE_HEALTHY_OUT=tmp)
        env.update(env_extra or {})
        if island_doc is not None:
            json.dump(island_doc, open(os.path.join(tmp, "island.json"), "w"))
            env["STORYTREE_HEALTHY_ISLAND"] = os.path.join(tmp, "island.json")
        if proof_doc is not None:
            json.dump(proof_doc, open(os.path.join(tmp, "proof.json"), "w"))
            env["STORYTREE_HEALTHY_PROOF"] = os.path.join(tmp, "proof.json")
        # RUN IT WITH `runpy`, NOT `exec`. The first version of this harness `exec`'d the source, which
        # left `__file__` undefined — so the composer died on its own second line with a `NameError`
        # and all five composer guards "did not fire" having never reached the thing under test. That
        # is the prior pass's temp-directory failure wearing different clothes, and it is why `fires()`
        # separates DID NOT FIRE from PROBE BROKE. `run_path` sets `__file__` the way an ordinary
        # invocation does, and the pre-import of `shadow` is what lets a constant be perturbed in
        # memory without any source file moving.
        code = (f"import sys, runpy; sys.path.insert(0, {HERE!r}); import shadow as SH\n"
                + (patch or "")
                + f"\nrunpy.run_path({os.path.join(HERE, 'compose_shadow.py')!r}, "
                  f"run_name='__main__')\n")
        r = subprocess.run([sys.executable, "-c", code], cwd=HERE, env=env,
                           capture_output=True, text=True)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def fires(name, fn, expect="REFUSED"):
    """Require `fn` to refuse, AND to refuse with the message it was supposed to raise."""
    try:
        rc, out = fn()
    except BaseException as exc:                             # noqa: BLE001
        RESULTS.append((name, False))
        print(f"FAIL  {name}\n        PROBE BROKE: {type(exc).__name__}: {exc}", flush=True)
        return False
    msg = " ".join(out.split())
    ok = rc != 0 and expect.lower() in msg.lower()
    RESULTS.append((name, ok))
    where = msg.find(expect)
    print(f"{'PASS' if ok else 'FAIL'}  {name}\n        "
          f"{'fired' if ok else f'DID NOT FIRE (rc={rc}, wanted {expect!r})'}: "
          f"{msg[where:where + 150] if where >= 0 else msg[-150:]}", flush=True)
    return ok


def holds(name, ok, detail=""):
    RESULTS.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)
    return bool(ok)


ISLAND = json.load(open(os.path.join(HEALTHY, "island.json")))
PROOF = json.load(open(os.path.join(HEALTHY, "proof.json")))

# =====================================================================================================
print("\n== 1. the status guard catches a REAL over-strong shadow, on a real composed picture ==")
# =====================================================================================================
# THE ONE THAT MATTERS. The delivered ladder is a measured 0.06 clear of the depth at which a healthy
# fill stops reading `healthy`. Push the floor well past it and the composer must refuse to write a
# picture at all — and the refusal must carry PIXEL EVIDENCE, not merely a threshold complaint, or it
# would be indistinguishable from a guard that only ever checks a constant.
fires("an over-strong gradient is REFUSED, with pixel evidence, and NO picture is written",
      lambda: run_composer({"STORYTREE_SHADOW_FLOOR": "0.55", "STORYTREE_SHADOW_GAIN": "3"}))


def _evidence():
    rc, out = run_composer({"STORYTREE_SHADOW_FLOOR": "0.55", "STORYTREE_SHADOW_GAIN": "3"})
    n = 0
    if "REFUSED" in out:
        tail = out[out.find("REFUSED"):]
        n = int(tail.split("status.")[1].split("of")[0].strip()) if "status." in tail else 0
    return n


_n = _evidence()
holds("the refusal names MORE THAN A HANDFUL of corrupted pixels, so it is not a threshold artefact",
      _n > 100, f"{_n} pure-fill pixels changed what they say")

# =====================================================================================================
print("\n== 2. the ceiling clause is armed on its own ==")
# =====================================================================================================
# The two halves of the refusal must be independently live. Widening the required margin past what any
# ladder could satisfy fires the ceiling clause while the picture itself is perfectly clean, which is
# the only way to know the clause is not merely riding on the pixel evidence above.
fires("a ladder that does not clear the measured ceiling is REFUSED even with a CLEAN surface",
      lambda: run_composer(patch="SH.SHADOW_MARGIN = 0.90\n"))

# =====================================================================================================
print("\n== 3. a light rig that disagrees with the delivered art is refused before a pixel ==")
# =====================================================================================================
# The land pieces' lit/dark wall bands are baked. A cast shadow falling the same way as the lit face is
# worse than no shadow, so the rig is checked against the art it is about to shade rather than trusted.
fires("a rig pointing the WRONG WAY across the land pieces is REFUSED",
      lambda: run_composer(patch="SH.LIGHT_SCREEN_FROM = (0.857, -0.516)\n"))

# =====================================================================================================
print("\n== 4. the IMPORTED refusals are live in this pass, not just in the pass they came from ==")
# =====================================================================================================
# This is the check that makes "no fourth compositor" mean something. Importing `compose_healthy.py`
# is only worth doing if its refusals actually bind here — otherwise the import is decoration and this
# pass could happily shade an island the prior pass would have declined to draw.
def _invented():
    bad = copy.deepcopy(ISLAND)
    bad["capStatuses"][0] = "unhealthy"
    bad["capabilities"][0]["status"] = "unhealthy"
    return run_composer(island_doc=bad)


def _unsigned():
    bad = copy.deepcopy(ISLAND)
    bad["capabilities"][0]["verdictGlyph"] = "-"
    return run_composer(island_doc=bad)


fires("an INVENTED status is still REFUSED through this pass", _invented)
fires("a `healthy` cell with NO signed pass is still REFUSED here (ADR-0040's wall)", _unsigned)

# =====================================================================================================
print("\n== 5. the instruments themselves DISCRIMINATE ==")
# =====================================================================================================
# `verify.py` §3 asserts the ladder clears a measured ceiling and §5 asserts a FLAT island produces no
# shadow. Both are satisfiable by an instrument that always answers the same way, so both are shown
# here to answer DIFFERENTLY when the input differs.
table = SH.reader_status_table(C, faces="top")
top = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][0]), C.FLAT_LEVEL)
depth, read0 = SH.safe_depth(C, top, table)
holds("`safe_depth` finds a depth at which the healthy fill DOES lie — the ceiling is not vacuous",
      read0 == "healthy" and depth < 1.0,
      f"holds `healthy` to {depth}, lies at {round(depth - 0.01, 3)}")

deeper = np.clip(top * (depth - 0.01), 0, 255).astype(np.float32)
holds("and the reader table names what it lies AS, rather than merely refusing",
      str(SH.nearest_status(deeper[None, None, :], table, C.W_LUMA)[0, 0]) != "healthy",
      "#%02x%02x%02x reads %s" % (tuple(int(round(v)) for v in deeper)
                                  + (SH.nearest_status(deeper[None, None, :], table, C.W_LUMA)[0, 0],)))

# The flat-island AO test in verify.py §5 proves the term draws nothing at a flat join. That is only
# informative if the SAME term draws something on the REAL, terraced island — otherwise it would pass
# with the term deleted.
island = json.load(open(os.path.join(HEALTHY, "island.json")))
meta = json.load(open(os.path.join(GRASS, "pieces-land", "render-meta.json")))
C.ISLAND, C.META = island, meta
C.SS = int(meta["supersample"])
C.ELEV = float(island["camera"]["elevationDeg"])
C.SIN, C.COS = float(island["camera"]["groundFlattening"]), float(island["camera"]["uprightForeshortening"])
C.COAST = np.array(island["coastLoopGround"], dtype=np.float64)
C.CAPS = list(island["capStatuses"])
C.CAP_LEVEL = [(i * 2 + 1) % C.N_LEVELS for i in range(len(C.CAPS))]
_gx0, _gx1 = C.COAST[:, 0].min() - C._pad, C.COAST[:, 0].max() + C._pad
_gy0, _gy1 = C.COAST[:, 1].min() - C._pad, C.COAST[:, 1].max() + C._pad
C.CANVAS_W = int(math.ceil(_gx1 - _gx0))
C.CANVAS_H = int(math.ceil((_gy1 - _gy0) * C.SIN + float(meta["cliffDropWorld"]) * C.COS
                           + C._TREE_HEADROOM))
C.ORIGIN = (-_gx0, -_gy0 * C.SIN + C._TREE_HEADROOM)
cells = island["variantB"]["cells"]
field_real, stats_real = SH.build(C, cells)
holds("the SAME terrain+AO term DOES fire on the real terraced island",
      float(field_real.min()) < 1.0,
      f"min multiplier {float(field_real.min()):.4f}, "
      f"{stats_real['landPctDarkened']}% of land px darkened by terrain+AO alone")

# =====================================================================================================
print("\n== 6. the palette closure is LOAD-BEARING, not ceremonial ==")
# =====================================================================================================
REPORT = json.load(open(os.path.join(HERE, "shadow-report.json")))
shipped = REPORT["survivesTheSnap"]["ladderOnShippedPalette"]
closed = REPORT["survivesTheSnap"]["ladderOnClosedPalette"]
holds("on the SHIPPED palette, every shadow rung is quantised away",
      not [k for k in shipped if k.startswith("light-") and k != "light-1"],
      f"rungs surviving: {[k for k in shipped if k.startswith('light-') and k != 'light-1'] or 'NONE'}")
holds("on the CLOSED palette, every rung reaches the delivered raster",
      len([k for k in closed if k.startswith("light-") and k != "light-1"]) == len(SH.SHADOW_LEVELS),
      f"{sorted(k for k in closed if k.startswith('light-') and k != 'light-1')}")

# =====================================================================================================
print("\n== 7. the determinism check would CATCH a one-pixel drift ==")
# =====================================================================================================
# Asserted the way the track asserts everything about determinism: on the DECODED raster, never on a
# file hash. A hash-based version of this check would report drift on every run and catch nothing.
from PIL import Image                                        # noqa: E402

a = np.array(Image.open(os.path.join(HERE, "one-surface-and-shadow.png")).convert("RGB"))
b = a.copy()
ys, xs = np.nonzero(np.any(b != b[0, 0], axis=2))
b[ys[len(ys) // 2], xs[len(xs) // 2]] ^= 1
holds("a ONE-PIXEL drift is caught by the raster comparison", not np.array_equal(a, b),
      f"perturbed 1 px of {a.shape[0] * a.shape[1]}")
holds("...and the SAME comparison passes on the unperturbed raster",
      np.array_equal(a, np.array(Image.open(os.path.join(HERE, "one-surface-and-shadow.png"))
                                 .convert("RGB"))))

ok = sum(1 for _n, v in RESULTS if v)
print(f"\n{ok}/{len(RESULTS)} guards fire")
json.dump({"fired": ok, "total": len(RESULTS),
           "guards": [{"name": n, "ok": v} for n, v in RESULTS]},
          open(os.path.join(HERE, "verify-refusal-report.json"), "w"), indent=1)
sys.exit(0 if ok == len(RESULTS) else 1)
