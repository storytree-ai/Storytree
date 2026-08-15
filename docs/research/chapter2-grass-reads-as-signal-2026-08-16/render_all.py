#!/usr/bin/env python3
"""Rebuild this whole pass — the land, all fourteen grass configurations, and every picture.

    python render_all.py                 # the authored angle (grass.PASS_ELEVATION_DEG = 50)
    python render_all.py --elev 45       # the same pass at another angle, for the price of a render
    python render_all.py --skip-land     # grass + compose only (the fast inner loop)
    python render_all.py --skip-render   # compose only, against the piece sets already on disk

THIS IS PART OF THE DELIVERABLE, NOT A CONVENIENCE, and the fork sweep is why it matters more here
than it did in the pass this one follows. Fourteen grass configurations composed against one land
is exactly the shape that produces a comparison picture whose panels were rendered either side of an
edit — the silent-drift failure `sheet.py`'s provenance sidecars exist to catch. Driving every
configuration from ONE command, in one run, against ONE land, is the cheap half of preventing it;
`compose_grass.py`'s per-generator code-state refusal is the half with teeth.

The angle enters ONCE (`grass.PASS_ELEVATION_DEG`, overridable here) and flows outward:

    emit_island.ts --elev <deg>   ->  island.json      (the camera block; ground geometry unchanged)
    blender_land.py  --island ...  ->  pieces-land/     (reads the angle back OUT of island.json)
    blender_grass.py --island ...  ->  pieces-<tag>/    (same, once per fork configuration)
    compose_grass.py               ->  the pictures     (same, and asserts they all agree)

WHAT MOVING THE ANGLE HERE DOES NOT DO: it does not touch `LAND_CAMERA_ELEVATION_DEG` in
`packages/forest-world/src/camera.ts`, which is still 20 and is fenced by
`frontend-visual-judgment-arc`'s dogfood fixture. This pass writes under `docs/research/` only.
"""
import os
import subprocess
import sys

import grass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
BLENDER = os.environ.get(
    "BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
#: `npx` is a .cmd shim on Windows and `subprocess.run` will not find it by the bare name — it fails
#: `FileNotFoundError: [WinError 2]`, which names no command and reads like a missing island file.
NPX = "npx.cmd" if os.name == "nt" else "npx"


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


ELEV = float(arg("--elev", grass.PASS_ELEVATION_DEG))
SKIP_LAND = "--skip-land" in sys.argv
SKIP_RENDER = "--skip-render" in sys.argv


def tag_for(mix, geom):
    """The directory name one fork configuration renders into. The mix is in the NAME, so a picture
    composed from the wrong directory is visible in a file listing rather than only in a sidecar."""
    return "pieces-m%02d-%s" % (round(mix * 100), geom)


def run(label, cmd, cwd):
    print(f"\n=== {label} ===\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        raise SystemExit(f"{label} failed with exit code {r.returncode}")


if not SKIP_RENDER:
    # 1. GEOMETRY — the sibling spike's own emitter, invoked rather than copied. It imports the
    #    SHIPPED `buildRelaxedCells` / `smoothCoast`, so there is no second copy of the island, and
    #    `--elev` overrides only the camera block it writes (a camera sweep, not a geometry sweep).
    run("emit island", [NPX, "tsx", os.path.join(FORK, "emit_island.ts"),
                        "--elev", f"{ELEV:g}", "--out", os.path.join(HERE, "island.json")],
        cwd=REPO)

    # 2. LAND PIECES — the sibling spike's own renderer, pointed at this pass's island. ONE land for
    #    every configuration below: the fork must move the grass and nothing else.
    if not SKIP_LAND:
        run("render land pieces",
            [BLENDER, "--background", "--python", os.path.join(FORK, "blender_land.py"), "--",
             "--island", os.path.join(HERE, "island.json"),
             "--out", os.path.join(HERE, "pieces-land"), "--samples", "48"],
            cwd=HERE)

    # 3. THE FORK SWEEP — one piece set per (normal mix x geometry). Eleven pieces in about four
    #    seconds each, so the whole sweep is cheaper than a single land render.
    for geom in grass.GEOMETRIES:
        for mix in grass.NORMAL_MIXES:
            run(f"grass mix={mix:g} geometry={geom}",
                [BLENDER, "--background", "--python", os.path.join(HERE, "blender_grass.py"), "--",
                 "--island", "island.json", "--out", tag_for(mix, geom),
                 "--normals", f"{mix:g}", "--geometry", geom, "--samples", "48"],
                cwd=HERE)

# 4. COMPOSE — the pictures, the report and the provenance sidecars.
run("compose", [sys.executable, os.path.join(HERE, "compose_grass.py")], cwd=HERE)

print(f"\nDONE — the whole pass rebuilt at {ELEV:g} degrees.")
if abs(ELEV - grass.PASS_ELEVATION_DEG) > 1e-9:
    print(f"NOTE: that is NOT the authored angle ({grass.PASS_ELEVATION_DEG:g}, the owner's look "
          f"verdict of 2026-08-16). The committed pictures are the authored one; re-run bare to "
          f"restore them.")
print(f"LAND_CAMERA_ELEVATION_DEG is untouched and still "
      f"{grass.APP_LAND_CAMERA_ELEVATION_DEG:g}.")
