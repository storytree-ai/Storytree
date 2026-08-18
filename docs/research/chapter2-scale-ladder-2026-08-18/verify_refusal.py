#!/usr/bin/env python3
"""MAKE THIS PASS'S TWO GUARDS FIRE, on the real composer, in this directory.

    python verify_refusal.py        # -> a PASS/FAIL table; exit 1 if a guard did not fire

A GUARD THAT CANNOT BE MADE TO FIRE IS NOT A GUARD. `verify.py` shows that the delivered run is
clean; this file shows that a clean run means something, by reintroducing the exact defect each guard
exists to catch and requiring the guard to catch it.

It drives `compose_ladder.py` ITSELF — the file that produced the committed pictures — through
environment hatches, with its output sent to a scratch directory it throws away. It does NOT copy the
composer: a copy re-roots `HERE`, so the copy dies on an unrelated `FileNotFoundError` before it ever
reaches the guard, and the harness then reports a pass it never performed. That is exactly how five
false passes were produced on this arc in #1382, and it is why the hatches live in the real file.

THE TWO PROBES

  P1  UPSCALED RUNG — compose rung 2 from the rung-1 piece sets. This is the increment's own named
      failure ("an upscale measures the upscaler, not the ladder") and it is INVISIBLE without a
      guard: the picture comes out exactly the right size with a caption that is exactly wrong.
      `assert_rung_is_authored` must refuse before a pixel is written.

  P2  SEAM OUTLINE — draw the outline on EVERY drawable boundary, cell-to-cell joins included. That
      reinstates the interior mesh seam the owner removed on 2026-08-16, wearing a shading model.
      This one is not a refusal but a MEASUREMENT: the perturbed run must deliver strictly more
      outline pixels than the delivered run at the same rung, which is what proves the exclusion in
      `outline_mask` is load-bearing rather than decorative.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = []


def drive(label, rungs, perturb):
    tmp = tempfile.mkdtemp(prefix="scale-ladder-refusal-")
    env = dict(os.environ)
    env["STORYTREE_LADDER_OUT"] = tmp
    env["STORYTREE_LADDER_RUNGS"] = rungs
    env["STORYTREE_LADDER_PERTURB"] = perturb
    print(f"\n=== {label} (rungs {rungs}, perturb {perturb}) ===", flush=True)
    r = subprocess.run([sys.executable, os.path.join(HERE, "compose_ladder.py")],
                       cwd=HERE, env=env, capture_output=True, text=True)
    report = None
    path = os.path.join(tmp, "ladder-report.json")
    if os.path.exists(path):
        try:
            report = json.load(open(path, encoding="utf-8"))
        except Exception as exc:                       # noqa: BLE001
            print(f"  (the perturbed run wrote a report that will not parse: {exc})")
    shutil.rmtree(tmp, ignore_errors=True)
    return r, report


def ok(n, name, passed, detail):
    ROWS.append((n, name, passed, detail))
    print(f"  {n}. {'pass' if passed else 'FAIL'}  {name}\n      {detail}")


# ---------------------------------------------------------------- P1: the upscaled rung
r, _rep = drive("P1 upscaled rung", "2", "upscaled-rung")
out = (r.stdout or "") + (r.stderr or "")
fired = r.returncode != 0 and "not AUTHORED at its own density" in out
line = next((ln.strip() for ln in out.splitlines() if "px per ground unit" in ln), "")
ok(1, "an upscaled rung is REFUSED before any pixel is written", fired,
   (f"exit {r.returncode}; the guard named it: {line}" if fired else
    f"exit {r.returncode} and no refusal in the output — an upscale would have shipped as a ladder. "
    f"tail: {out.strip()[-300:]}"))

# ---------------------------------------------------------------- P2: the reinstated seam
delivered = json.load(open(os.path.join(HERE, "ladder-report.json"), encoding="utf-8"))
base = next(x["outlinePx"] for x in delivered["ladder"] if x["rung"] == 1)
r2, rep2 = drive("P2 seam outline", "1", "seam-outline")
if rep2 is None:
    ok(2, "the cell-to-cell exclusion is load-bearing", False,
       f"the perturbed run produced no report (exit {r2.returncode}); the probe measured nothing. "
       f"tail: {((r2.stdout or '') + (r2.stderr or '')).strip()[-300:]}")
else:
    got = next(x["outlinePx"] for x in rep2["ladder"] if x["rung"] == 1)
    ok(2, "the cell-to-cell exclusion is load-bearing", got > base,
       f"delivered outline {base} px vs {got} px once cell-to-cell joins are outlined too "
       f"(+{got - base} px, {round((got - base) / max(1, base) * 100, 1)}%) — those extra pixels ARE "
       f"the interior mesh seam the owner removed, which is what the exclusion keeps out")

print(f"\n{sum(1 for _n, _t, p, _d in ROWS if p)}/{len(ROWS)} probes fired")
with open(os.path.join(HERE, "verify-refusal-report.json"), "w", encoding="utf-8") as f:
    json.dump({"probes": [{"n": n, "name": t, "fired": p, "detail": d} for n, t, p, d in ROWS],
               "rule": "a guard that cannot be made to fire is not a guard; both probes drive the "
                       "REAL composer in this directory through its own hatches, never a copy"},
              f, indent=2)
if any(not p for _n, _t, p, _d in ROWS):
    sys.exit(1)
