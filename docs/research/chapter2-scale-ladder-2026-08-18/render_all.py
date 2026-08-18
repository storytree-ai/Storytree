#!/usr/bin/env python3
"""AUTHOR THE FOUR RUNGS — every piece set and the hero tree, once per rung, from ONE code state.

    python render_all.py                 # all four rungs, then compose   (~35 min)
    python render_all.py --only 1,2      # a subset of rungs
    python render_all.py --skip-render   # compose only, against the piece sets already on disk

THIS IS PART OF THE DELIVERABLE, NOT A CONVENIENCE, and on a SCALE ladder it matters more than on any
prior fork this arc has run. The increment's own words: "Author at each rung rather than upscaling a
1x raster — an upscale measures the upscaler, not the ladder." An upscaled rung is exactly what you
get if any one of the four generators is left at its rung-1 resolution while the others move, and it
would be invisible in the picture: a nearest-neighbour tree on a crisp 8x island reads as "the tree
does not scale", which is a claim about this driver rather than about the tree.

So EVERY generator moves together, driven from here, in one run:

    blender_grass.py   --ss 3k          ->  pieces-decor-xk/   (shrubs, wilts, the three flowers)
    blender_species.py --inherit-from ^ ->  pieces-species-xk/ (the four tuft species + those seven)
    blender_land.py    --ss 3k          ->  pieces-land-xk/    (6 tile kites, 16 wall headings)
    blender_tree.py    --res 384k       ->  tree-xk/raw        (the hero sprite, supersampled)
    pixelise.py ... 128k                ->  tree-xk/frames     (its own committed back half)

NOTHING IS UPSCALED ANYWHERE IN THIS FILE. `ladder.piece_supersample(k)` is the only place a rung
becomes a resolution, and `verify.py` re-derives every declared resolution from the piece sets' own
`render-meta.json` rather than from this file, so a rung silently rendered at the wrong size fails
the pass instead of shipping as a ladder.

THE FENCE. The whole diff is `docs/research/**`. `LAND_CAMERA_ELEVATION_DEG` is 20 in
`packages/forest-world/src/camera.ts`, is neither read nor written here, and is NOT moved: this pass
renders at 50 degrees as a NAMED PARAMETER inherited from the island (owner look verdict 2026-08-16).
"""
import json
import os
import shutil
import subprocess
import sys

import ladder as L

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
FORK = os.path.join(RESEARCH, "chapter2-land-interior-fork-2026-08-15")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")
HERO = os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1")

BLENDER = os.environ.get(
    "BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")
#: The research surface. NOT re-emitted here: the island is the committed real-corpus healthy island
#: of PR #1382 and a ladder that re-emitted its geometry would vary the subject as well as the scale.
ISLAND = os.path.join(HEALTHY, "island.json")
PIECES = os.path.join(HERE, "pieces")


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


ONLY = arg("--only")
RUNGS = ([int(t) for t in ONLY.split(",")] if ONLY else list(L.RUNGS))
SKIP_RENDER = "--skip-render" in sys.argv
SKIP_TREE = "--skip-tree" in sys.argv
#: Render only. Used while the composer is still being written, and by nothing else.
SKIP_COMPOSE = "--skip-compose" in sys.argv


def land_dir(k):
    return os.path.join(PIECES, f"pieces-land-{L.tag(k)}")


def decor_dir(k):
    return os.path.join(PIECES, f"pieces-decor-{L.tag(k)}")


def species_dir(k):
    return os.path.join(PIECES, f"pieces-species-{L.tag(k)}")


def tree_dir(k):
    return os.path.join(PIECES, f"tree-{L.tag(k)}")


def run(label, cmd, cwd):
    print(f"\n=== {label} ===\n$ {' '.join(str(c) for c in cmd)}", flush=True)
    r = subprocess.run(cmd, cwd=cwd)
    if r.returncode != 0:
        raise SystemExit(f"{label} failed with exit code {r.returncode}")


def render_rung(k):
    ss = L.piece_supersample(k)
    os.makedirs(PIECES, exist_ok=True)

    # 1. DECOR — the shrubs, the wilts and the three UAT flower forms, at this rung's density.
    #    `blender_species.py` INHERITS these seven rather than authoring them, so they have to exist
    #    at the rung before the species set is built or the flowers would silently stay at rung 1.
    run(f"decor pieces x{k} (ss={ss})",
        [BLENDER, "--background", "--python", os.path.join(GRASS, "blender_grass.py"), "--",
         "--island", ISLAND, "--out", decor_dir(k), "--normals", "0", "--geometry", "clump",
         "--samples", str(L.SPECIES_SAMPLES), "--ss", str(ss)], cwd=GRASS)

    # 2. SPECIES — the four silhouette-variety tufts, inheriting the seven above. It reads its
    #    canvas resolution back OUT of the set it inherits from, so it follows the rung without a
    #    flag of its own — which is the property that makes a mixed-resolution set impossible here.
    run(f"species pieces x{k}",
        [BLENDER, "--background", "--python", os.path.join(OPTIONS, "blender_species.py"), "--",
         "--island", ISLAND, "--inherit-from", decor_dir(k), "--out", species_dir(k),
         "--samples", str(L.SPECIES_SAMPLES)], cwd=OPTIONS)

    # 3. LAND — six tile kites and sixteen wall headings, at this rung's density.
    run(f"land pieces x{k} (ss={ss})",
        [BLENDER, "--background", "--python", os.path.join(FORK, "blender_land.py"), "--",
         "--island", ISLAND, "--out", land_dir(k), "--samples", str(L.LAND_SAMPLES),
         "--ss", str(ss)], cwd=FORK)

    # 4. THE HERO TREE — the mature frame only, at this rung's supersampled resolution, through the
    #    SAME `pixelise.py` back half every delivered frame on the hero track went through.
    if not SKIP_TREE:
        raw = os.path.join(tree_dir(k), "raw")
        frames = os.path.join(tree_dir(k), "frames")
        run(f"hero tree x{k} (res={L.tree_res(k)})",
            [BLENDER, "--background", "--python", os.path.join(HERO, "blender_tree.py"), "--",
             "--out", raw, "--only", str(L.MATURE_FRAME), "--elev", f"{L.PASS_ELEVATION_DEG:g}",
             "--res", str(L.tree_res(k)), "--samples", str(L.TREE_SAMPLES),
             "--shadow-samples", str(L.TREE_SHADOW_SAMPLES)], cwd=HERO)
        run(f"pixelise tree x{k} -> {L.tree_delivered(k)} px",
            [sys.executable, os.path.join(HERO, "pixelise.py"), raw, frames,
             str(L.tree_delivered(k))], cwd=HERO)
        # The raw supersampled frames are an intermediate an order of magnitude larger than the
        # delivered sprite and nothing downstream reads them. Dropped rather than committed.
        shutil.rmtree(raw, ignore_errors=True)


if not SKIP_RENDER:
    for k in RUNGS:
        print(f"\n############ RUNG x{k} ############", flush=True)
        render_rung(k)

    print("\n--- authored resolutions, read back OUT of each set's own render-meta.json ---")
    for k in RUNGS:
        row = {}
        for name, d in (("land", land_dir(k)), ("species", species_dir(k))):
            p = os.path.join(d, "render-meta.json")
            if os.path.exists(p):
                m = json.load(open(p))
                row[name] = m.get("pieceCanvasPx")
        t = os.path.join(tree_dir(k), "frames", "registration.json")
        if os.path.exists(t):
            row["tree"] = json.load(open(t))["canvas"]["width"]
        print(f"  x{k}: {row}")

if not SKIP_COMPOSE:
    run("compose", [sys.executable, os.path.join(HERE, "compose_ladder.py")], cwd=HERE)
print(f"\nDONE — rungs {RUNGS} authored at {L.PASS_ELEVATION_DEG:g} degrees. "
      f"LAND_CAMERA_ELEVATION_DEG is untouched and still "
      f"{L.APP_LAND_CAMERA_ELEVATION_DEG:g}.")
