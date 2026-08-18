#!/usr/bin/env python3
"""THE GUARDS, PROVED BY MAKING THEM FIRE. `python verify_refusal.py` (~15 s, no Blender).

A guard proved only by passing is proved vacuously. Every probe below drives the REAL function in its
real directory, with something genuinely broken, and requires the refusal to arrive AND to name what
is wrong — the shape PR #1385 established when its harness drove the real composer past the ceiling
and required a refusal naming 1 332 pixels.

`fires()` distinguishes THE GUARD DID NOT FIRE from THE PROBE BROKE, which is the correction that
made #1385's harness trustworthy after its first version reported five "did not fire" results having
never reached the code under test. The two can never look alike here.

⚠ THE MONKEY-PATCH RULE, learned expensively on this arc: patch the CANONICAL module, never an alias.
`palette_read.C` IS the `compose` module object every function resolves `STATUS_TOKENS` through, so
patching its attribute reaches every reader. Patching a local copy would leave the probes measuring
the unmodified table while printing CAUGHT.
"""
import contextlib
import copy
import json
import os
import runpy
import shutil
import sys
import tempfile
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import palette_read as PR  # noqa: E402

# `measure_palette` does its work at module level, so importing it RUNS it. Both of the things that
# would make that destructive are taken away first: `--no-island` skips the ~3.5 min compositor mount,
# and `STORYTREE_FOREIGN_OUT` sends every write to scratch so the delivered pictures cannot be touched
# by a harness. Restored immediately afterwards, so the probes below run against the real environment.
_SCRATCH = tempfile.mkdtemp(prefix="foreign-refusal-import-")
_ARGV, _OUT = sys.argv[:], os.environ.get("STORYTREE_FOREIGN_OUT")
sys.argv = [os.path.join(HERE, "measure_palette.py"), "--no-island"]
os.environ["STORYTREE_FOREIGN_OUT"] = _SCRATCH
try:
    import measure_palette as MP  # noqa: E402
finally:
    sys.argv = _ARGV
    if _OUT is None:
        os.environ.pop("STORYTREE_FOREIGN_OUT", None)
    else:
        os.environ["STORYTREE_FOREIGN_OUT"] = _OUT
    shutil.rmtree(_SCRATCH, ignore_errors=True)

RESULTS = []


def _empty_census():
    """A census that PARSES but says nothing — the shape a harness must refuse rather than report."""
    path = os.path.join(tempfile.mkdtemp(prefix="foreign-census-"), "census.json")
    with open(path, "w") as fh:
        json.dump({"readAt": "probe", "totals": {"capabilities": 0},
                   "rows": [{"story": "x", "rendersOnMap": False, "renderedMix": {}}]}, fh)
    return path


def fires(name, fn, must_say=()):
    """Run a probe that MUST raise. Three outcomes, and only one of them is a pass.

    * the guard raised and its message names everything in `must_say`  -> PASS
    * the guard did not raise                                          -> FAIL "did not fire"
    * the probe itself broke before reaching the guard                 -> FAIL "probe broke", + trace
    """
    try:
        fn()
    except (MP.Inadmissible, SystemExit) as exc:
        msg = str(exc)
        missing = [s for s in must_say if s not in msg]
        ok = not missing
        RESULTS.append((ok, name, ("names all of %s" % list(must_say)) if ok
                        else "fired but did not name %s — msg: %s" % (missing, msg[:160])))
        return
    except Exception:                                        # noqa: BLE001
        RESULTS.append((False, name, "PROBE BROKE before reaching the guard:\n%s"
                        % traceback.format_exc().rstrip()))
        return
    RESULTS.append((False, name, "DID NOT FIRE — the guard accepted what it must refuse"))


def holds(name, fn, detail=""):
    """A probe that must NOT raise — the other half, without which every guard could be `raise`."""
    try:
        fn()
    except Exception as exc:                                 # noqa: BLE001
        RESULTS.append((False, name, "refused something it must accept: %r" % (exc,)))
        return
    RESULTS.append((True, name, detail))


@contextlib.contextmanager
def tokens(**overrides):
    """Swap entries in the CANONICAL token table for the duration of the probe, then restore."""
    original = PR.C.STATUS_TOKENS
    patched = copy.deepcopy(original)
    for st, spec in overrides.items():
        patched[st].update(spec)
    PR.C.STATUS_TOKENS = patched
    try:
        yield
    finally:
        PR.C.STATUS_TOKENS = original


# --- 1. the finding itself: the gate refuses the SHIPPED table ---------------------------------------
fires("P1  the gate REFUSES the shipped table, naming both statuses, both colours and the bar",
      lambda: MP.gate(PR.RENDERED, 3, "top", what="a 3-variant island"),
      must_say=("healthy", "unknown", "#789a57", "#7c975a", "13.98"))

# The refusal is not a canned string: the dE it prints is recomputed here from the tokens.
_g = PR.matched_gap(PR.RENDERED, 3, "top")
fires("P1b the dE the refusal prints is the one an INDEPENDENT recomputation gets",
      lambda: MP.gate(PR.RENDERED, 3, "top"),
      must_say=("%.2f" % _g["dE"],))

# --- 2. it is not refusing everything ----------------------------------------------------------------
holds("P2  the gate ADMITS the collapsed table — so P1 is a verdict, not a `raise`",
      lambda: MP.gate(PR.RENDERED, 1, "top"),
      "gap %.2f dE vs bar %.2f" % (PR.matched_gap(PR.RENDERED, 1, "top")["dE"],
                                   PR.shallowest_shade_rung(PR.RENDERED)["dE"]))

# --- 3. it is not hard-coded to one pair -------------------------------------------------------------
# Move `proposed`'s fill onto `mapped`'s. A guard that only knows about healthy/unknown passes this.
with tokens(proposed={"top": ["#b3946a", "#a98b60", "#bda278"]}):
    fires("P3  a DIFFERENT pair made to collide is refused too — the gate is not keyed on one pair",
          lambda: MP.gate(PR.RENDERED, 3, "top"),
          must_say=("mapped", "proposed"))

# --- 4. it can pass a table that is genuinely separated ----------------------------------------------
# Push `unknown` off the green ramp entirely (a slate, which is what the app's own `--st-unknown`
# text-grade token already is). NOT a proposal — a control, so a PASS is reachable at 3 variants.
with tokens(unknown={"top": ["#8f9aa6", "#848f9c", "#9aa5b1"], "side": "#6b7480"}):
    holds("P4  with `unknown` off the green ramp the SHIPPED 3-variant table passes — a fix exists",
          lambda: MP.gate(PR.RENDERED, 3, "top"),
          "gap %.2f dE" % PR.matched_gap(PR.RENDERED, 3, "top")["dE"])

# --- 5. instrument integrity: the driver refuses to REPORT if it stops reproducing #1385 -------------
def _driver_with_moved_tokens():
    out = tempfile.mkdtemp(prefix="foreign-refusal-")
    argv, env_out = sys.argv[:], os.environ.get("STORYTREE_FOREIGN_OUT")
    sys.argv = [os.path.join(HERE, "measure_palette.py"), "--no-island"]
    os.environ["STORYTREE_FOREIGN_OUT"] = out
    try:
        with tokens(healthy={"top": ["#8cb85e", "#7dab50", "#3a5a20"]}):
            runpy.run_path(os.path.join(HERE, "measure_palette.py"), run_name="__probe__")
    finally:
        sys.argv = argv
        if env_out is None:
            os.environ.pop("STORYTREE_FOREIGN_OUT", None)
        else:
            os.environ["STORYTREE_FOREIGN_OUT"] = env_out
        left = sorted(os.listdir(out))
        shutil.rmtree(out, ignore_errors=True)
        if left:
            raise AssertionError("the driver wrote %s before refusing" % left)


fires("P5  a moved token table makes the driver REFUSE TO REPORT rather than publish a new number",
      _driver_with_moved_tokens,
      must_say=("did not reproduce",))

# --- 6. the bar cannot be asked for in its vacuous form ----------------------------------------------
fires("P6  the bar REFUSES to be taken from the degenerate SIDE ladder",
      lambda: PR.shallowest_shade_rung(PR.RENDERED, faces="all"),
      must_say=("FILL ladder",))

# --- 7. an empty measurement refuses rather than reporting a zero ------------------------------------
fires("P7  a census with no map-rendering stories REFUSES rather than reporting 0 exposure",
      lambda: PR.corpus_exposure(_empty_census()),
      must_say=("no map-rendering stories",))

fires("P8  a one-status configuration REFUSES rather than returning `no gap`",
      lambda: PR.matched_gap(("healthy",), 3, "top"),
      must_say=("nothing was measured",))

fires("P9  a missing sibling module REFUSES with the path, rather than importing something else",
      lambda: PR._load("nope", os.path.join(HERE, "no-such-module.py")),
      must_say=("no such file",))

fires("P10 a caption colour that is not a colour REFUSES rather than drawing a different one",
      lambda: MP.unhex("healthy-green"),
      must_say=("not a hex colour",))

# --- 8. the ceiling is not vacuous -------------------------------------------------------------------
_depth, _read = PR.SH.safe_depth(PR.C, PR.C.hexrgb(PR.C.STATUS_TOKENS["unknown"]["top"][0]),
                                 PR.reader_table(PR.RENDERED, "top", 3))


def _ceiling_is_measured():
    if _depth <= 0.31:
        raise AssertionError("the ceiling search reached its own floor (%.2f) — it never found a "
                             "depth at which the read changes, so the number is not a measurement"
                             % _depth)


holds("P11 `safe_depth` FINDS a depth at which `unknown` stops reading as itself — the ceiling is "
      "measured, not a floor the search never left",
      _ceiling_is_measured,
      "unknown holds to %.2f, reads `%s` at full light" % (_depth, _read))

ok = sum(1 for r in RESULTS if r[0])
for good, name, detail in RESULTS:
    print("%s  %s%s" % ("PASS " if good else "FAIL ", name, ("\n        %s" % detail) if detail else ""))
print("\n%d/%d guards proved" % (ok, len(RESULTS)))
json.dump({"guards": [{"ok": g, "name": n, "detail": d} for g, n, d in RESULTS],
           "passed": ok, "of": len(RESULTS)},
          open(os.path.join(HERE, "verify-refusal-report.json"), "w"), indent=1)
if ok != len(RESULTS):
    sys.exit(1)
