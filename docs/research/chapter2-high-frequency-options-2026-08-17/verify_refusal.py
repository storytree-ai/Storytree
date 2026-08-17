#!/usr/bin/env python3
"""MAKE EVERY GUARD FIRE — proof that the floor in `verify.py` is not vacuous.

    python verify_refusal.py            # ~8 min

Each probe drives THE REAL COMPOSER, in its real directory, through the hatches
`compose_options.py` declares for exactly this purpose. Driving a copy would prove something about
the copy.

THE TRAP THIS HARNESS IS BUILT AROUND, recorded because two passes on this arc have now hit it: the
shadow pass's first harness `exec`'d the composer's source, which left `__file__` undefined, so the
composer died on its own second line and every guard reported "did not fire" having never reached
the thing under test. A subprocess with a real `__file__` fixes it, and `fires()` distinguishes
DID NOT FIRE from PROBE BROKE so the two can never look alike again.
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")

PASSES, FAILS, RESULTS = [], [], {}


def ok(name, cond, detail=""):
    (PASSES if cond else FAILS).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + detail) if detail else ""),
          flush=True)


def drive(perturb, label, fast=True):
    """Run the real composer with one hatch set, into a scratch output dir.

    Returns (returncode, combined output, files written). The output dir is SCRATCH, so a probe can
    never touch the delivered pictures — and "how many files did it write" is itself an assertion:
    a guard that reports a problem and then draws the picture anyway is not a guard.
    """
    tmp = tempfile.mkdtemp(prefix="hf-refusal-")
    env = dict(os.environ, STORYTREE_OPTIONS_OUT=tmp)
    if perturb:
        env["STORYTREE_OPTIONS_PERTURB"] = perturb
    if fast:
        env["STORYTREE_OPTIONS_PERTURB_FAST"] = "1"
    print("\n--- driving the real composer: %s ---" % label, flush=True)
    r = subprocess.run([sys.executable, os.path.join(HERE, "compose_options.py")],
                       cwd=HERE, env=env, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    written = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    return r.returncode, out, written, tmp


def fires(out, code, needle):
    """DID IT FIRE, or did the probe BREAK? A traceback that is not the refusal is a broken probe and
    must never be scored as a guard doing its job."""
    if needle in out:
        return "FIRED"
    if "Traceback" in out and "REFUSED" not in out:
        return "PROBE BROKE"
    return "DID NOT FIRE (exit %s)" % code


# =====================================================================================================
print("== 1. the CONTROL — unperturbed, every guard reached and none fires ==")
# =====================================================================================================
code, out, written, _t = drive(None, "control (no hatch)")
ok("the control reaches every guard and none of them fires",
   code == 0 and "all guards reached, none fired" in out,
   fires(out, code, "all guards reached, none fired"))
RESULTS["control"] = {"exit": code, "reachedAllGuards":
                      "all guards reached, none fired" in out}


# =====================================================================================================
print("\n== 2. THE DIAGONAL COLLAPSE — the unfixed sampler is REFUSED before a pixel ==")
# =====================================================================================================
code, out, written, _t = drive("unfixed-positioner", "the affine-CRC32 sampler")
st = fires(out, code, "carry the DIAGONAL COLLAPSE")
ok("the unfixed positioner is REFUSED", st == "FIRED", st)
ok("the refusal names the correlation it measured", "corr(u,v)=" in out.replace(" ", ""),
   [ln.strip() for ln in out.splitlines() if "DIAGONAL COLLAPSE" in ln][:1])
ok("NO picture is written when it fires", not written, "wrote %s" % (written or "nothing"))
#: NOT A THRESHOLD ARTEFACT: the value it refuses on has to be nowhere near the floor, or the guard
#: would only be catching noise. The floor is 0.15 and the null is exactly 0.
_corr = None
for ln in out.splitlines():
    if "corr(u,v)=" in ln.replace(" ", ""):
        try:
            _corr = float(ln.replace(" ", "").split("corr(u,v)=")[1].split(",")[0])
        except (ValueError, IndexError):
            pass
ok("it refuses on a correlation far above the floor, not at it",
   _corr is not None and abs(_corr) > 0.9, "corr=%s against a floor of 0.15 and a null of 0" % _corr)
RESULTS["unfixedPositioner"] = {"exit": code, "corr": _corr, "picturesWritten": len(written)}


# =====================================================================================================
print("\n== 3. THE STATUS GUARD — a light field driven past the ceiling is REFUSED ==")
# =====================================================================================================
code, out, written, _t = drive("overdeep-light", "the combined field pushed past the ceiling")
st = fires(out, code, "changed the status read of")
ok("a field driven past the re-measured ceiling is REFUSED", st == "FIRED", st)
_px = None
for ln in out.splitlines():
    if "changed the status read of" in ln:
        try:
            _px = int(ln.split("changed the status read of")[1].split()[0])
        except (ValueError, IndexError):
            pass
#: MORE THAN A HANDFUL, so a threshold-only guard could not pass this — the shadow pass required the
#: same of its own harness and got 1332 pixels.
ok("the refusal names a substantial pixel count, not a rounding artefact",
   _px is not None and _px >= 20, "%s top-face pixels changed what they SAY" % _px)
ok("NO picture is written when it fires", not written, "wrote %s" % (written or "nothing"))
RESULTS["overdeepLight"] = {"exit": code, "corruptedPx": _px, "picturesWritten": len(written)}

# -----------------------------------------------------------------------------------------------------
print("\n-- 3b. and the UNCLAMPED product, which does NOT fire — recorded, not hidden --")
# -----------------------------------------------------------------------------------------------------
#: THE CLAMP IN `combine` IS A PRECAUTION AND THIS IS THE PROBE THAT SAYS SO. The arithmetic bound is
#: real (0.80 x 0.91 = 0.728 against a 0.74 ceiling) but no delivered pixel on this island reaches
#: it, because the relief field's own minimum is 0.958. Running the probe and reporting that it
#: passes is the difference between a precaution and a save that never happened — and an earlier
#: draft of this pass did claim the save, on 108 pixels that turned out to be an instrument artefact.
code, out, written, _t = drive("unclamped-product", "shadow x relief with no clamp")
ok("the unclamped product does NOT corrupt a single delivered fill on this island",
   code == 0 and "all guards reached, none fired" in out,
   fires(out, code, "all guards reached, none fired"))
RESULTS["unclampedProduct"] = {"exit": code, "refused": "REFUSED" in out,
                               "note": "the clamp is a precaution justified by ladder arithmetic, "
                                       "not by an observed defect"}


# =====================================================================================================
print("\n== 4. THE PALETTE — relief on the shipped palette DELIVERS NOTHING ==")
# =====================================================================================================
#: Read off the DELIVERED run rather than re-composed: the pass already draws this panel, and the
#: claim is about its pixels. A palette closure that were merely decorative would show the same rung
#: counts on both palettes.
REPORT = json.load(open(os.path.join(HERE, "options-report.json")))
snap = REPORT["survivesTheSnap"]


def reached(d):
    return {k: v for k, v in d.items() if k != "light-1" and v > 0}


ship, joint = reached(snap["shippedDressedPalette"]), reached(snap["jointPalette"])
ok("on the SHIPPED palette, no relief level reaches the raster at all", not ship,
   "levels delivered: %s" % (sorted(ship) or "NONE"))
ok("on the JOINT palette, relief levels DO reach the raster", bool(joint),
   "%d levels, %d px" % (len(joint), sum(joint.values())))
ok("the palette closure is therefore load-bearing, not decorative",
   len(joint) > len(ship))
RESULTS["paletteClosure"] = {"shippedLevelsReached": len(ship), "jointLevelsReached": len(joint)}


# =====================================================================================================
print("\n== 5. THE SPECIES — the outline spread is real, and the blade set does NOT have it ==")
# =====================================================================================================
#: The comparison this pass's whole silhouette option rests on. If the withdrawn set already carried
#: four distinguishable outlines, authoring four would be spending a render on nothing.
M = REPORT["marks"]
ok("the WITHDRAWN blade set's four tufts are near-identical in outline",
   M["bladeTuftOutlineSpread"]["aspectSpread"] < 2.5,
   "aspect spread %.2fx over %d-%d delivered px"
   % (M["bladeTuftOutlineSpread"]["aspectSpread"],
      M["bladeTuftOutlineSpread"]["deliveredPxMin"], M["bladeTuftOutlineSpread"]["deliveredPxMax"]))
ok("the species set's four outlines are genuinely spread",
   M["speciesOutlineSpread"]["aspectSpread"] >= 3.0,
   "aspect spread %.2fx over %d-%d delivered px"
   % (M["speciesOutlineSpread"]["aspectSpread"],
      M["speciesOutlineSpread"]["deliveredPxMin"], M["speciesOutlineSpread"]["deliveredPxMax"]))
ok("the species set beats the blade set on outline spread by a clear margin",
   M["speciesOutlineSpread"]["aspectSpread"] >= 2 * M["bladeTuftOutlineSpread"]["aspectSpread"])
RESULTS["outlineSpread"] = {"blade": M["bladeTuftOutlineSpread"]["aspectSpread"],
                            "species": M["speciesOutlineSpread"]["aspectSpread"]}


# =====================================================================================================
print("\n== 6. RELIEF IS NOT A NO-OP, and it is not a second green ==")
# =====================================================================================================
B = REPORT["bodies"]
ok("relief raises the distinct delivered luminance level count",
   B["plusRelief"]["distinctLumaLevels"] > B["baselineShadowOnly"]["distinctLumaLevels"],
   "%d -> %d" % (B["baselineShadowOnly"]["distinctLumaLevels"],
                 B["plusRelief"]["distinctLumaLevels"]))
ok("relief moves the p2-p98 luma range measurably",
   abs(B["plusRelief"]["lumaP2toP98"] - B["baselineShadowOnly"]["lumaP2toP98"]) >= 1.0,
   "%.1f -> %.1f (the flattening took it 78.9 -> 58.2; the shadow re-spent it to 61.6)"
   % (B["baselineShadowOnly"]["lumaP2toP98"], B["plusRelief"]["lumaP2toP98"]))

#: THE HATCHES ARE OFF AT REST. A hatch left set is a delivered picture composed from something other
#: than what its caption claims — the failure `use_pieces` exists to catch, one level up.
src = open(os.path.join(HERE, "compose_options.py")).read()
ok("every refusal hatch defaults OFF and is reachable only from the environment",
   src.count('os.environ.get("STORYTREE_OPTIONS_PERTURB') == 4
   and "PERTURB_POSITIONER = os.environ" in src)
ok("no hatch is set in the delivered report",
   REPORT["fence"]["positioner"].startswith("chapter2-plant-dispersion"))


with open(os.path.join(HERE, "verify-refusal-report.json"), "w") as fh:
    json.dump(RESULTS, fh, indent=1)

print("\n%d/%d" % (len(PASSES), len(PASSES) + len(FAILS)))
if FAILS:
    print("FAILED:")
    for f in FAILS:
        print("  - " + f)
    raise SystemExit(1)
print("GREEN — every guard fires on a real drive of the real composer")
