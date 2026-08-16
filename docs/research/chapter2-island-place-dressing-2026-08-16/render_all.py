#!/usr/bin/env python3
"""Rebuild this whole pass, at any camera angle, in one command.

    python render_all.py                 # the authored angle (dressing.PASS_ELEVATION_DEG = 50)
    python render_all.py --elev 45       # the same pass at another angle, for the price of a render
    python render_all.py --skip-land     # decor + compose only (the fast inner loop, ~40 s)

THIS SCRIPT IS PART OF THE DELIVERABLE, NOT A CONVENIENCE. The reason the owner can pick a camera
angle by looking rather than by argument is that this track prices angles as RENDERS. That property
is worth exactly as much as the tooling that preserves it: the moment 50 is a literal sitting in four
scripts, the next angle question costs an edit-and-hope instead of a command.

So the angle enters ONCE — `dressing.PASS_ELEVATION_DEG`, overridable here — and flows outward:

    emit_island.ts --elev <deg>   ->  island.json    (the camera block; ground geometry unchanged)
    blender_land.py  --island ...  ->  pieces-land/  (reads the angle back OUT of island.json)
    blender_decor.py --island ...  ->  pieces-decor/ (same)
    compose_dressed.py             ->  the pictures  (same, and asserts all three agree)

No file downstream of `island.json` declares an angle of its own, and every one of them asserts that
the angle it was handed matches the one its inputs were rendered at — the ADR-0367 D1 mismatch,
caught mechanically rather than by inspection.

WHAT MOVING THE ANGLE HERE DOES **NOT** DO. It does not touch `LAND_CAMERA_ELEVATION_DEG` in
`packages/forest-world/src/camera.ts`, which is still 20 and is fenced by
`frontend-visual-judgment-arc`'s dogfood fixture. This pass writes under `docs/research/` only.
"""
import os
import subprocess
import sys

import dressing

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
BLENDER = os.environ.get(
    "BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


ELEV = float(arg("--elev", dressing.PASS_ELEVATION_DEG))
SKIP_LAND = "--skip-land" in sys.argv


def run(label, cmd, cwd):
    print(f"\n=== {label} ===\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        raise SystemExit(f"{label} failed with exit code {r.returncode}")


# 1. GEOMETRY — the sibling spike's own emitter, invoked rather than copied. It imports the SHIPPED
#    `buildRelaxedCells` / `smoothCoast`, so there is no second copy of the island to drift, and
#    `--elev` overrides only the camera block it writes (a camera sweep, not a geometry sweep).
run("emit island", ["npx", "tsx", os.path.join(FORK, "emit_island.ts"),
                    "--elev", f"{ELEV:g}", "--out", os.path.join(HERE, "island.json")],
    cwd=REPO)

# 2. LAND PIECES — the sibling spike's own renderer, pointed at this pass's island.
if not SKIP_LAND:
    run("render land pieces",
        [BLENDER, "--background", "--python", os.path.join(FORK, "blender_land.py"), "--",
         "--island", os.path.join(HERE, "island.json"),
         "--out", os.path.join(HERE, "pieces-land"), "--samples", "48"],
        cwd=HERE)

# 3. DECOR PIECES — this pass's own contribution: the component art.
run("render decor pieces",
    [BLENDER, "--background", "--python", os.path.join(HERE, "blender_decor.py"), "--",
     "--island", "island.json", "--out", "pieces-decor", "--samples", "48"],
    cwd=HERE)

# 4. COMPOSE — the pictures, the report and the provenance sidecars.
run("compose", [sys.executable, os.path.join(HERE, "compose_dressed.py")], cwd=HERE)

print(f"\nDONE — the whole pass rebuilt at {ELEV:g} degrees.")
if abs(ELEV - dressing.PASS_ELEVATION_DEG) > 1e-9:
    print(f"NOTE: that is NOT the authored angle ({dressing.PASS_ELEVATION_DEG:g}, the owner's look "
          f"verdict of 2026-08-16). The committed pictures are the authored one; re-run bare to "
          f"restore them.")
print(f"LAND_CAMERA_ELEVATION_DEG is untouched and still "
      f"{dressing.APP_LAND_CAMERA_ELEVATION_DEG:g}.")
