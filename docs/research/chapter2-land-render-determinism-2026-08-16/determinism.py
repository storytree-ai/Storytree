#!/usr/bin/env python3
"""Is `blender_land.py`'s render deterministic, or is it a function of system load?

The question this settles is not academic. Every px count and colour count this arc has published
about the land was measured off a Blender render; if that render is load-dependent, those numbers
measure the box at render time rather than the art, and several owner-facing calls were made on them.

METHOD, and each clause is there because the obvious version of it gives a wrong answer:

  · Compare DECODED RASTERS, never file hashes. Blender stamps its own metadata into a PNG container,
    so two byte-identical images hash differently and a naive hash reports drift that is not there.
    The sweep lane's own .gitignore already records this trap.
  · Render under REAL CONCURRENT LOAD. The hypothesis IS load, so an idle-box comparison is the one
    check that cannot fail. This box carries three sibling lanes at ~99% CPU while this runs, and one
    row adds deliberate spinners on top.
  · Vary the THREAD COUNT as well. Load reaches Cycles by changing how work is partitioned across
    threads and how many samples a scheduling batch takes; `--threads` moves that variable directly
    and deterministically, so a thread-invariance result is evidence load-invariance is not luck.
    It also costs the box nothing, which matters with siblings running.

Run (system Python — PIL + numpy, the same pair `verify.py` uses):

    python determinism.py
"""
import json
import os
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
DRESS = os.path.join(REPO, "docs", "research", "chapter2-island-place-dressing-2026-08-16")
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"

# The 50-degree island, byte-identical to the one the dressing/grass lanes measured 34,968 px on, and
# geometrically identical to the interior fork's (only the `camera` block differs). Using the disputed
# angle's own input is what makes a null result mean something about the disputed numbers.
ISLAND = os.path.join(DRESS, "island.json")
SAMPLES = "32"          # what BOTH the committed piece set and the sweep's land leg used
RUNS = os.path.join(HERE, "runs")

# `--threads 0` is Blender's "autodetect", i.e. what an unflagged run does.
MATRIX = [
    ("base1", 0, 0),
    ("base2", 0, 0),      # a bare repeat: the cheapest possible falsifier
    ("t1", 1, 0),
    ("t2", 2, 0),
    ("t7", 7, 0),
    ("load", 0, 6),       # + deliberate spinners, on top of the sibling lanes already running
]

SPINNER = (
    "import time\n"
    "t = time.time() + %d\n"
    "x = 0.0\n"
    "while time.time() < t:\n"
    "    x += 1.000001 ** 1.5\n"
)


def cpu_percent():
    """One instantaneous whole-box CPU load reading, via the same WMI counter the ops notes use."""
    out = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage "
         "-Average).Average"],
        capture_output=True, text=True)
    try:
        return int(out.stdout.strip())
    except ValueError:
        return -1


def render(tag, threads, spinners, samples=SAMPLES):
    out = os.path.join(RUNS, tag)
    cmd = [BLENDER, "--background"]
    if threads:
        cmd += ["--threads", str(threads)]
    cmd += ["--python", os.path.join(FORK, "blender_land.py"), "--",
            "--island", ISLAND, "--out", out, "--samples", str(samples)]

    procs = [subprocess.Popen([sys.executable, "-c", SPINNER % 120],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
             for _ in range(spinners)]
    if procs:
        time.sleep(3)            # let the spinners actually take the cores before the render starts
    before = cpu_percent()
    t0 = time.time()
    r = subprocess.run(cmd, cwd=FORK, capture_output=True, text=True)
    during = cpu_percent()       # sampled at the end of the render, while it is still the load
    dt = time.time() - t0
    for p in procs:
        p.kill()
    if r.returncode != 0:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
        raise SystemExit(f"render {tag} failed rc={r.returncode}")
    return {"tag": tag, "threads": threads or "auto", "spinners": spinners,
            "seconds": round(dt, 2), "cpuPctBefore": before, "cpuPctDuringTail": during}


def raster(path):
    return np.array(Image.open(path).convert("RGBA"))


def compare(a_dir, b_dir):
    """Per-piece exact raster comparison. Returns (pieces, differing pieces, worst pixel delta)."""
    names = sorted(f for f in os.listdir(a_dir) if f.endswith(".png"))
    diffs = []
    for n in names:
        pa, pb = raster(os.path.join(a_dir, n)), raster(os.path.join(b_dir, n))
        if pa.shape != pb.shape:
            diffs.append({"piece": n, "shapeMismatch": [list(pa.shape), list(pb.shape)]})
            continue
        ne = np.any(pa != pb, axis=-1)
        if ne.any():
            d = np.abs(pa.astype(np.int16) - pb.astype(np.int16))
            diffs.append({"piece": n, "pxDiffering": int(ne.sum()),
                          "pxTotal": int(ne.size),
                          "maxChannelDelta": int(d.max())})
    return len(names), diffs


def container_hashes(d):
    import hashlib
    return {f: hashlib.sha256(open(os.path.join(d, f), "rb").read()).hexdigest()[:16]
            for f in sorted(os.listdir(d)) if f.endswith(".png")}


if __name__ == "__main__":
    os.makedirs(RUNS, exist_ok=True)
    report = {"question": "is blender_land.py's render deterministic, or load-dependent?",
              "island": os.path.relpath(ISLAND, REPO).replace("\\", "/"),
              "samples": int(SAMPLES), "runs": [], "comparisons": []}

    for tag, threads, spinners in MATRIX:
        info = render(tag, threads, spinners)
        print(f"rendered {tag:6s} threads={info['threads']:<4} spinners={spinners} "
              f"{info['seconds']:6.2f}s  cpu {info['cpuPctBefore']}% -> "
              f"{info['cpuPctDuringTail']}%", flush=True)
        report["runs"].append(info)

    base = os.path.join(RUNS, "base1")
    for tag, _, _ in MATRIX[1:]:
        n, diffs = compare(base, os.path.join(RUNS, tag))
        report["comparisons"].append({"a": "base1", "b": tag, "pieces": n,
                                      "piecesDiffering": len(diffs), "detail": diffs})
        print(f"base1 vs {tag:6s}  {n} pieces  differing: {len(diffs)}", flush=True)

    # THE STRONGEST ROW, and the only one this session did not manufacture the other half of: the
    # dressing lane committed its `pieces-land` from a DIFFERENT worktree, in a different session, on
    # a different day, under whatever that box was doing at the time — at `--samples 48`. Rendering
    # 48 here and comparing decoded rasters tests determinism across everything a same-session matrix
    # holds fixed by construction. It also fixes the sample count, which is what the rest of this
    # pass turns out to be about.
    render("s48", 0, 0, samples=48)
    n, diffs = compare(os.path.join(RUNS, "s48"), os.path.join(DRESS, "pieces-land"))
    report["crossSession"] = {
        "a": "fresh --samples 48 (this session, this worktree, under sibling load)",
        "b": "docs/research/chapter2-island-place-dressing-2026-08-16/pieces-land (committed by "
             "another session from worktree agent-a1d851b5b498c6145)",
        "pieces": n, "piecesDiffering": len(diffs), "detail": diffs,
    }
    print(f"cross-session fresh-48 vs committed pieces-land: {n} pieces, "
          f"differing: {len(diffs)}", flush=True)

    # The trap, made visible rather than asserted: identical rasters, different file bytes.
    h1, h2 = container_hashes(base), container_hashes(os.path.join(RUNS, "base2"))
    same_bytes = [f for f in h1 if h1[f] == h2.get(f)]
    report["containerHashTrap"] = {
        "piecesWithIdenticalFileBytes": len(same_bytes),
        "pieces": len(h1),
        "reading": "a file-hash comparison of two runs whose DECODED RASTERS are identical",
    }
    print(f"file-byte-identical pieces base1 vs base2: {len(same_bytes)}/{len(h1)}")

    clean = (not any(c["piecesDiffering"] for c in report["comparisons"])
             and not report["crossSession"]["piecesDiffering"])
    report["verdict"] = ("DETERMINISTIC — every run's decoded raster is identical, across thread "
                         "counts, under deliberate load, and against another session's committed "
                         "pieces" if clean else "NON-DETERMINISTIC — see comparisons")
    with open(os.path.join(HERE, "determinism-report.json"), "w") as fh:
        json.dump(report, fh, indent=1)
    print(report["verdict"])
