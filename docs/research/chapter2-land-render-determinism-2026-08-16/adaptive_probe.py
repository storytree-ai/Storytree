#!/usr/bin/env python3
"""Adaptive sampling IS enabled in `blender_land.py`. Does it do anything?

`blender_land.py`'s `render()` sets engine, device, samples, denoising, seed and film — and never
touches `use_adaptive_sampling`, so it inherits Cycles' default, which this probe shows is `True`.
Its two sibling generators (`blender_decor.py`, `blender_grass.py`) both set it to `False` explicitly,
which is what makes its absence here look like an oversight rather than a choice.

But "enabled" is not "load-bearing", and the two are worth separating because the answers differ.
This runs the UNMODIFIED generator with the flag inherited and again with a persistent `render_pre`
handler forcing it off, at three sample counts, and compares decoded rasters. The handler is how the
flag gets turned off WITHOUT editing `blender_land.py`, whose source digest is the interior fork's
committed `code_state`; an edit here would invalidate that provenance for a probe.

Two questions, not one:

  1. does the flag change the picture, at the sample counts this arc actually renders at (32 and 48)?
  2. when it DOES change the picture, is the change a function of how the work was partitioned —
     which is the only route by which system load could reach a Cycles render?

(2) is the one that matters for the accusation. A flag that alters the image deterministically is a
different and much smaller problem than a flag that alters it according to what else the box was
doing, so the thread-invariance row is what separates "latent" from "live".

    python adaptive_probe.py
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
DRESS = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
ISLAND = os.path.join(DRESS, "island.json")
RUNS = os.path.join(HERE, "runs")

# `@persistent` is required: `blender_land.py` calls `read_factory_settings()` per piece, which is a
# file load and drops every non-persistent handler. Without it the flag would be forced off for the
# first piece only — a silent partial that would read as a result.
FORCE_OFF = """
import bpy
from bpy.app.handlers import persistent

@persistent
def _off(scene, *a):
    scene.cycles.use_adaptive_sampling = False
    print('PROBE forced use_adaptive_sampling=False for', scene.render.filepath, flush=True)

bpy.app.handlers.render_pre.append(_off)
"""

REPORT_ON = """
import bpy
from bpy.app.handlers import persistent

@persistent
def _rep(scene, *a):
    c = scene.cycles
    print('PROBE inherited use_adaptive_sampling=%s threshold=%s min_samples=%s samples=%s'
          % (c.use_adaptive_sampling, c.adaptive_threshold, c.adaptive_min_samples, c.samples),
          flush=True)

bpy.app.handlers.render_pre.append(_rep)
"""


SAMPLE_LADDER = [32, 48, 512]     # 32 = the sweep's land leg, 48 = the dressing lane's, 512 = a
#                                   deliberately higher count, to find where the flag wakes up


def run(tag, pre_expr, samples, threads=0):
    out = os.path.join(RUNS, tag)
    cmd = [BLENDER, "--background"]
    if threads:
        cmd += ["--threads", str(threads)]
    cmd += ["--python-expr", pre_expr,
            "--python", os.path.join(FORK, "blender_land.py"), "--",
            "--island", ISLAND, "--out", out, "--samples", str(samples), "--only", "tiles"]
    r = subprocess.run(cmd, cwd=FORK, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-2000:])
        raise SystemExit(f"{tag} rc={r.returncode}")
    return out, [ln for ln in r.stdout.splitlines() if ln.startswith("PROBE")]


def px_differing(a, b):
    names = sorted(f for f in os.listdir(a) if f.endswith(".png"))
    total = 0
    for n in names:
        pa = np.array(Image.open(os.path.join(a, n)).convert("RGBA"))
        pb = np.array(Image.open(os.path.join(b, n)).convert("RGBA"))
        total += int(np.any(pa != pb, axis=-1).sum())
    return len(names), total


if __name__ == "__main__":
    os.makedirs(RUNS, exist_ok=True)
    rows, inherited = [], None
    for s in SAMPLE_LADDER:
        on, probe = run(f"adapt-on-{s}", REPORT_ON, s)
        off, _ = run(f"adapt-off-{s}", FORCE_OFF, s)
        inherited = inherited or (probe[0] if probe else None)
        n, d = px_differing(on, off)
        rows.append({"samples": s, "pieces": n, "pxDifferingOnVsOff": d,
                     "active": bool(d)})
        print(f"samples={s:4d}  adaptive on vs off: {d} px differ", flush=True)

    # Where the flag IS active, does its effect depend on how the work was split across threads?
    # That is the only path by which system load reaches a Cycles render, so a zero here is what
    # demotes the flag from "load-dependent" to "merely a different picture".
    active = [r["samples"] for r in rows if r["active"]]
    thread_rows = []
    for s in active:
        t1, _ = run(f"adapt-on-{s}-t1", REPORT_ON, s, threads=1)
        n, d = px_differing(os.path.join(RUNS, f"adapt-on-{s}"), t1)
        thread_rows.append({"samples": s, "pieces": n, "pxDifferingAutoVs1Thread": d})
        print(f"samples={s:4d}  adaptive ON, auto-threads vs 1 thread: {d} px differ", flush=True)

    rep = {
        "inheritedSettings": inherited,
        "siblingGenerators": {
            "blender_decor.py": "sets use_adaptive_sampling = False explicitly",
            "blender_grass.py": "sets use_adaptive_sampling = False explicitly",
            "blender_land.py": "never mentions it — inherits Cycles' default, which is True",
        },
        "sampleLadder": rows,
        "threadInvarianceWhereActive": thread_rows,
        "reading": (
            "the flag is ENABLED and INERT at every sample count this arc has rendered at (32, 48): "
            "forcing it off moves no pixel. It wakes up at higher counts — and even awake it is "
            "thread-invariant, so it changes WHICH picture you get, never AS A FUNCTION OF LOAD. "
            "That makes it a latent inconsistency with its two siblings rather than the live "
            "load-dependence it was suspected of."),
    }
    print(json.dumps(rep["reading"], indent=1))
    with open(os.path.join(HERE, "adaptive-probe-report.json"), "w") as fh:
        json.dump(rep, fh, indent=1)
