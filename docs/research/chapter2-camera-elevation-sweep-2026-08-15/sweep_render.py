#!/usr/bin/env python3
"""Render ADR-0367 D1's reserved question: WHICH camera elevation should the land declare?

    python sweep_render.py                 # emit + render every angle (the long leg)
    python sweep_render.py --plan-only     # just the retime tables, no pixels

ADR-0367 D1 fixed ONE shared camera and deliberately left its VALUE open: "whether the shared
value stays 20 degrees or moves is an increment's measurement to make, but there is ONE value
and both sides read it." The owner has now looked at the 20-degree land and asked for more of a
bird's eye. This renders the candidates so the pick is made by LOOKING.

WHAT IS SWEPT, AND WHAT DELIBERATELY IS NOT
-------------------------------------------
Swept: the camera, on BOTH sides of the composition at once. Each angle gets its own emitted
island (ground geometry re-projected at that angle), its own Blender land piece set, AND its own
hero-tree render. Both sides move together or the panel would be the mismatch ADR-0367 D1 exists
to end.

NOT swept: the shipped constant. `LAND_CAMERA_ELEVATION_DEG` is untouched — the owner picks the
value, this only produces the evidence.

NOT swept: the tree's art. The camera is a PARAMETER of a 3D generator, not a re-authoring. The
skeleton, girth, crown lobes and cel bands are all camera-independent, so a higher angle is the
same tree correctly seen from higher up. Nothing here re-tunes the crown-normals mix, the canopy
constants or anything else fitted at 20 degrees, and the track's signed ceiling verdict is not
re-opened by moving a camera.

THE GROWTH STAGE IS PINNED STRUCTURALLY, NOT BY ORDINAL
------------------------------------------------------
The camera re-times the track. `retime()` paces frames by silhouette-change arc length off
`cheap_silhouette()`, which rasterises through `to_screen()`, which reads `EL` — so the angle
moves WHICH growth state each frame index lands on. Comparing "frame 18" across angles could
therefore have compared differently grown trees, which is the two-variables failure
`crown-normals-fork.png` shipped with.

It does not here, and the reason is structural rather than lucky: `retime()` ends with
`picks[0], picks[-1] = 0.0, 1.0`, pinning the first and last frames unconditionally. So the
MATURE frame is u = 1.0 — the fully grown skeleton — at every angle, while frames 1..17 move.
This renders the mature frame only, and `--plan-only` records the full per-angle retime table so
the interior shift is measured rather than assumed. `sweep-report.json` carries `u`, the node
budget `N` and the lobe count per angle; identical values across angles are the proof that every
panel holds the same tree.
"""
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))  # docs/research/<dir> -> repo root
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
HERO = os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                    "blender-hero-v1")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
# On Windows `npx` is a .cmd shim and CreateProcess will not find the bare name, so resolve it
# rather than handing subprocess a name only a shell could interpret.
NPX = shutil.which("npx") or shutil.which("npx.cmd") or "npx"

# The candidate set, and why each is in it:
#   20      the CURRENT declared value — the anchor, without which the sweep has no baseline
#   30      the classic isometric drawing angle; the shallowest angle that reads as a citybuilder
#   35.264  TRUE isometric, atan(1/sqrt(2)) — the angle at which the three axes foreshorten equally
#   45      ground and upright foreshorten identically (both 0.707); the natural midpoint
#   60      strongly overhead: ground 0.866, upright 0.500 — the far end before plan view
ANGLES = [
    ("20", 20.0, "current — LAND_CAMERA_ELEVATION_DEG"),
    ("30", 30.0, "classic isometric drawing angle"),
    ("35p26", 35.264, "TRUE isometric — atan(1/sqrt2)"),
    ("45", 45.0, "ground and upright foreshorten equally"),
    ("60", 60.0, "strongly overhead"),
]

# The delivered hero track's own render settings (blender-hero-v1/README.md), so the 20-degree
# panel is comparable to the shipped frames rather than merely similar to them.
TREE_RES, TREE_SAMPLES, TREE_SHADOW_SAMPLES = "384", "72", "32"
LAND_SAMPLES = "32"          # the interior-fork spike's own piece samples
MATURE_FRAME = 18            # NFRAMES - 1: u = 1.0, pinned by retime()

PLAN_ONLY = "--plan-only" in sys.argv


def run(cmd, cwd, log_name):
    """Run one step, tee its output to a log, and fail loudly. A silent Blender is a Blender that
    wrote nothing."""
    log_path = os.path.join(HERE, "logs", log_name)
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    print(f"    $ {' '.join(os.path.basename(c) if os.sep in c else c for c in cmd[:6])} ...",
          flush=True)
    with open(log_path, "w", encoding="utf-8", errors="replace") as fh:
        p = subprocess.run(cmd, cwd=cwd, stdout=fh, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        tail = open(log_path, encoding="utf-8", errors="replace").read()[-3000:]
        raise SystemExit(f"FAILED ({p.returncode}): {log_name}\n{tail}")
    return open(log_path, encoding="utf-8", errors="replace").read()


def plan_row(text, idx):
    """The PLAN line for one frame index: u, node budget, lobe count. The structural fingerprint."""
    for line in text.splitlines():
        if line.startswith(f"PLAN {idx:02d} "):
            f = line.split()
            get = lambda k: next((x.split("=", 1)[1] for x in f if x.startswith(k + "=")), None)
            return {"u": float(get("u")), "N": float(get("N")),
                    "lobes": int(get("lobes").split("(")[0]), "mat": float(get("mat"))}
    return None


def skeleton_row(text):
    """The whole-tree structure, printed once before any frame. Camera-independent by claim; this
    is what makes that claim checkable rather than asserted."""
    for line in text.splitlines():
        if line.startswith("SKELETON "):
            f = line.split()
            get = lambda k: next((x.split("=", 1)[1] for x in f if x.startswith(k + "=")), None)
            return {"nodes": int(get("nodes")), "iters": int(get("iters")),
                    "lobes": int(get("lobes"))}
    return None


report = {"angles": [], "matureFrame": MATURE_FRAME,
          "treeRender": {"res": TREE_RES, "samples": TREE_SAMPLES,
                         "shadowSamples": TREE_SHADOW_SAMPLES},
          "landSamples": LAND_SAMPLES}

for tag, deg, why in ANGLES:
    print(f"\n=== {deg} deg ({tag}) — {why} ===", flush=True)
    row = {"tag": tag, "elevationDeg": deg, "why": why}

    # 1. the island's GROUND geometry, re-projected at this angle. `--elev` overrides only the
    #    camera block; the ground decomposition stays the shipped constant's, so the sweep varies
    #    the camera and nothing else (see emit_island.ts's own note).
    island = os.path.join(HERE, "islands", f"island-{tag}.json")
    os.makedirs(os.path.dirname(island), exist_ok=True)
    if not PLAN_ONLY:
        out = run([NPX, "tsx", os.path.join(FORK, "emit_island.ts"),
                   "--elev", str(deg), "--out", island], REPO, f"emit-{tag}.log")
        row["emit"] = out.strip().splitlines()[-1] if out.strip() else ""

    # 2. the land pieces at this angle — tiles and the 16 heading-indexed rim pieces.
    pieces = os.path.join(HERE, f"pieces-{tag}")
    if not PLAN_ONLY:
        run([BLENDER, "--background", "--python", os.path.join(FORK, "blender_land.py"), "--",
             "--island", island, "--out", pieces, "--samples", LAND_SAMPLES],
            FORK, f"land-{tag}.log")
        meta = json.load(open(os.path.join(pieces, "render-meta.json")))
        row["landCodeState"] = meta["code_state"]["sha256"]
        row["landCameraDeg"] = meta["camera"]["elevationDeg"]

    # 3. the hero tree at this angle. `--no-render` first for the retime table (cheap, and it must
    #    run UNDER Blender: the system numpy grows a DIFFERENT tree than the bundled one).
    plan = run([BLENDER, "--background", "--python", os.path.join(HERO, "blender_tree.py"), "--",
                "--no-render", "--elev", str(deg)], HERO, f"tree-plan-{tag}.log")
    row["skeleton"] = skeleton_row(plan)
    row["mature"] = plan_row(plan, MATURE_FRAME)
    row["retime"] = [plan_row(plan, i) for i in range(19)]

    if not PLAN_ONLY:
        raw = os.path.join(HERE, f"tree-{tag}", "raw")
        delivered = os.path.join(HERE, f"tree-{tag}", "frames")
        run([BLENDER, "--background", "--python", os.path.join(HERO, "blender_tree.py"), "--",
             "--out", raw, "--only", str(MATURE_FRAME), "--elev", str(deg),
             "--res", TREE_RES, "--samples", TREE_SAMPLES,
             "--shadow-samples", TREE_SHADOW_SAMPLES], HERO, f"tree-{tag}.log")
        # the SAME back half every delivered frame in the track went through
        run([sys.executable, os.path.join(HERO, "pixelise.py"), raw, delivered, "128"],
            HERO, f"pixelise-{tag}.log")
        row["deliveredFrame"] = os.path.relpath(
            os.path.join(delivered, f"frame-{MATURE_FRAME:02d}.png"), HERE).replace(os.sep, "/")

    report["angles"].append(row)

name = "sweep-plan-report.json" if PLAN_ONLY else "sweep-report.json"
with open(os.path.join(HERE, name), "w") as fh:
    json.dump(report, fh, indent=1)

# ---- the structural assertion: every panel must hold the SAME tree at the same growth stage ----
mats = {(r["mature"]["u"], r["mature"]["N"], r["mature"]["lobes"]) for r in report["angles"]}
skels = {(r["skeleton"]["nodes"], r["skeleton"]["iters"], r["skeleton"]["lobes"])
         for r in report["angles"]}
print("\n=== structural identity of the mature frame across angles ===", flush=True)
for r in report["angles"]:
    print(f"  {r['elevationDeg']:>7} deg  skeleton={r['skeleton']}  mature={r['mature']}")
if len(mats) != 1 or len(skels) != 1:
    raise SystemExit(
        f"SWEEP VOID: the panels do not hold the same tree.\n"
        f"  mature states: {mats}\n  skeletons: {skels}\n"
        f"A camera sweep whose panels differ structurally measures two variables at once.")
print(f"  PASS  one skeleton {skels.pop()} and one mature state {mats.pop()} at every angle",
      flush=True)
print(f"\nwrote {name}", flush=True)
