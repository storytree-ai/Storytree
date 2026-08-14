#!/usr/bin/env python3
"""The machine-checkable half of the spike. The LOOK is an owner attestation; these are the two
properties a session may assert for itself, plus the measurement the recommendation rests on.

    python verify.py            # every check; exits non-zero on the first failure
    python verify.py --fast     # skip the two subprocess re-runs (emitter + Blender)

  1. DETERMINISM, at three seams, same seed -> same BYTES:
       geometry   re-run `emit_island.ts` and compare island.json's sha256
       render     re-render the pieces under Blender into a scratch directory and compare each PNG
       composite  run the compositor twice in-process and compare the arrays exactly
     All three matter separately: a deterministic renderer fed a drifting emitter is not a
     reproducible picture, and a deterministic pair composited non-deterministically is not either.

  2. THE STATUS TINT STAYS EXPRESSIBLE (ADR-0367 D5), under BOTH variants and by three independent
     assertions rather than by inspection:
       (a) no rendered piece contains a single island token colour — the pieces carry band KEYS, so
           the status physically cannot have been baked into them;
       (b) driving every cell to each of the five statuses in turn emits exactly that status's own
           token family and nothing else, for the piece-stamped interior as well as the flat one;
       (c) permuting the per-capability status assignment changes the land's colours while leaving
           the piece files untouched.
     (a) is the load-bearing one: it is what makes (b) and (c) consequences rather than coincidences.

  3. WHAT THE RENDERED TOP FACE ACTUALLY BUYS, as a pixel share. This is the number the
     recommendation turns on, so it is measured here rather than asserted in the README.

The Python-side precedent this follows is the hero track's `measure.py`: a script whose printed output
IS the evidence, not a test framework this repo does not have on the Python side.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

import compose as C

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
FAST = "--fast" in sys.argv
fails = []


def check(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{('  ' + detail) if detail else ''}")
    if not ok:
        fails.append(label)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


# ---------------------------------------------------------------- 1. determinism
print("== 1. determinism (same seed -> same bytes) ==")
island_path = os.path.join(HERE, "island.json")
before = sha(island_path)
if FAST:
    print("SKIP  geometry re-run (--fast)")
else:
    r = subprocess.run(["npx", "tsx", "emit_island.ts"], cwd=HERE, capture_output=True, text=True,
                       shell=True)
    check("geometry: emit_island.ts re-run is byte-identical", r.returncode == 0
          and sha(island_path) == before, before[:16])

if FAST:
    print("SKIP  render re-run (--fast)")
else:
    scratch = os.path.join(HERE, "pieces-verify")
    shutil.rmtree(scratch, ignore_errors=True)
    r = subprocess.run([BLENDER, "--background", "--python", "blender_land.py", "--",
                        "--out", "pieces-verify", "--samples", str(C.META["samples"])],
                       cwd=HERE, capture_output=True, text=True)
    # BYTE-IDENTITY IS ASSERTED ON THE DECODED RASTER, NOT THE FILE, and that distinction is measured
    # rather than assumed: a re-render of the same scene at the same seed produces PIXEL-identical
    # output whose PNG container differs every time, because Blender stamps the file. A naive
    # sha256-of-the-file check therefore reports non-determinism that does not exist — it failed all
    # 22 pieces here before this was written down. The container difference is reported alongside so
    # the weaker claim is never mistaken for the stronger one.
    same, differ, container_differs = 0, [], 0
    for f in sorted(os.listdir(os.path.join(HERE, "pieces"))):
        if not f.endswith(".png"):
            continue
        a, b = os.path.join(HERE, "pieces", f), os.path.join(scratch, f)
        if not os.path.exists(b):
            differ.append(f)
            continue
        pa = np.array(Image.open(a).convert("RGBA"))
        pb = np.array(Image.open(b).convert("RGBA"))
        if np.array_equal(pa, pb):
            same += 1
            if sha(a) != sha(b):
                container_differs += 1
        else:
            differ.append(f)
    check("render: every Blender piece re-renders raster-identical", r.returncode == 0 and not differ,
          f"{same} pieces pixel-identical ({container_differs} with a differing PNG container: "
          f"Blender stamps the file, so the claim is on the raster)"
          + (f", differing: {differ}" if differ else ""))
    shutil.rmtree(scratch, ignore_errors=True)

comp = {}
solids = {}
for name, interior, elev, _cap in C.VARIANTS:
    one, solid = C.back_half(*C.compose(interior, elev)[:2])
    two = C.back_half(*C.compose(interior, elev)[:2])[0]
    comp[name] = one
    solids[name] = solid
    check(f"composite: {name} is byte-identical across two runs", np.array_equal(one, two),
          hashlib.sha256(one.astype(np.uint8).tobytes()).hexdigest()[:16])

# ---------------------------------------------------------------- 2. the status tint (ADR-0367 D5)
print()
print("== 2. the per-cell status tint stays expressible (ADR-0367 D5) ==")

TOKEN_RGB = set()
for st in C.STATUS_TOKENS.values():
    for t in st["top"] + [st["wheat"], st["side"]]:
        TOKEN_RGB.add(tuple(int(v) for v in C.hexrgb(t)))

leaked = []
for f in sorted(os.listdir(os.path.join(HERE, "pieces"))):
    if not f.endswith(".png"):
        continue
    a = np.array(Image.open(os.path.join(HERE, "pieces", f)).convert("RGBA"))
    m = a[:, :, 3] > 110
    cols = {tuple(int(v) for v in c) for c in np.unique(a[:, :, :3][m].reshape(-1, 3), axis=0)}
    if cols & TOKEN_RGB:
        leaked.append((f, sorted(cols & TOKEN_RGB)))
check("(a) no rendered piece contains ANY island token colour", not leaked,
      "the pieces carry band keys only, so no status can have been baked in"
      if not leaked else str(leaked))

ORIGINAL_CAPS = list(C.CAPS)
for interior, elev, label in (("piece", "cell", "piece-stamped interior (a)"),
                              ("flat", "cell", "flat interior (b++)")):
    bad = []
    for status, toks in C.STATUS_TOKENS.items():
        C.CAPS = [status] * len(ORIGINAL_CAPS)
        # measured on the cell BODIES: `rim_pass=False` stops before the silhouette rim, which is
        # authored to darken from the local colour and re-snap and may therefore legally reach another
        # family's palette entry. Including it turns an authored rule into a tint failure.
        img, solid = C.back_half(*C.compose(interior, elev)[:2], rim_pass=False)
        got = {tuple(int(v) for v in c) for c in img[:, :, :3][solid].reshape(-1, 3)}
        # The families are restated here rather than read from `compose.build_palette`, deliberately:
        # a check that asks the palette what the palette allows can only ever pass. Restating them is
        # what caught the missing (side x chamfer shade) entry that was silently repainting an
        # `unknown` rim in `healthy` green.
        allowed = set()
        for t in toks["top"] + [toks["wheat"]]:
            for m in (C.FLAT_LEVEL, C.SEAM_LEVEL, C.KEY_SHADE["chamfer_lit"],
                      C.KEY_SHADE["chamfer_dark"]):
                allowed.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(t), m)))
        # the beach and the story-level coast rim are the ISLAND's, not the capability's, so they are
        # legitimately present whatever a cell's status is
        for side in (toks["side"], C.STATUS_TOKENS["healthy"]["side"]):
            for m in set(C.KEY_SHADE.values()):
                allowed.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(side), m)))
        for t in (C.COAST_SAND, C.COAST_SAND_EDGE):
            allowed.add(tuple(int(v) for v in C.hexrgb(t)))
        stray = {c for c in got if c not in allowed}
        if stray:
            bad.append((status, sorted(stray)))
    check(f"(b) all five statuses render from ONE piece set - {label}", not bad, str(bad))
C.CAPS = ORIGINAL_CAPS

piece_sha = {f: sha(os.path.join(HERE, "pieces", f))
             for f in sorted(os.listdir(os.path.join(HERE, "pieces"))) if f.endswith(".png")}
C.CAPS = list(reversed(ORIGINAL_CAPS))
permuted = C.back_half(*C.compose("piece", "cell")[:2])[0]
C.CAPS = ORIGINAL_CAPS
after_sha = {f: sha(os.path.join(HERE, "pieces", f))
             for f in sorted(os.listdir(os.path.join(HERE, "pieces"))) if f.endswith(".png")}
check("(c) permuting the status assignment repaints the land and moves no piece",
      not np.array_equal(permuted, comp["a"]) and piece_sha == after_sha)

# ---------------------------------------------------------------- 3. what the top face buys
print()
print("== 3. what the RENDERED top face actually buys, as a pixel share ==")


def key_shares(interior, elev):
    """The share of DELIVERED land pixels each band key is responsible for.

    Measured on the composite AFTER the majority downsample and against exact integers. Both halves of
    that are load-bearing and the first version of this function got both wrong: it measured the
    full-resolution canvas, whose values are unrounded floats, against rounded targets under a 0.5
    total-channel tolerance — so a legitimately-matching pixel like (126.0, 165.6, 84.6) missed its own
    target (126, 166, 85) by 0.8 and was not counted. It reported the chamfer at 0.8% of the land when
    the true delivered figure is 7.0%, which would have understated the case FOR option (a) by nearly
    an order of magnitude in the direction of this spike's own recommendation. Measuring after the
    downsample is also the honest question: a band that survives at supersampled resolution and loses
    every majority vote at the delivered scale has bought a reader nothing.
    """
    img, solid = C.back_half(*C.compose(interior, elev)[:2], rim_pass=False)
    total = int(solid.sum())
    shares = {}
    for name in C.META["bandKeys"]:
        cols = set()
        for st in C.STATUS_TOKENS.values():
            bases = [st["side"]] if C.KEY_IS_WALL[name] else st["top"] + [st["wheat"]]
            for b in bases:
                cols.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(b), C.KEY_SHADE[name])))
        hit = np.zeros(solid.shape, dtype=bool)
        for c in cols:
            hit |= np.abs(img[:, :, :3] - np.array(c, dtype=np.float32)).sum(axis=2) < 0.5
        shares[name] = int((hit & solid).sum()) / max(1, total)
    return total, shares


tot_a, sh_a = key_shares("piece", "cell")
tot_bpp, sh_bpp = key_shares("flat", "cell")
chamfer = sh_a["chamfer_lit"] + sh_a["chamfer_dark"]
walls_a = sh_a["wall_lit"] + sh_a["wall_dark"]
walls_b = sh_bpp["wall_lit"] + sh_bpp["wall_dark"]
print(f"(a)   chamfer (the ONLY thing a rendered top face adds): {chamfer * 100:.1f}% of land px")
print(f"(a)   walls from the rendered tile piece:                {walls_a * 100:.1f}%")
print(f"(b++) walls from the heading-indexed rim piece set:      {walls_b * 100:.1f}%")


def land_colours(name):
    """Counted over LAND pixels only. Counting the whole frame adds transparent black as a colour and
    shifts every variant by one — harmless in itself, and exactly the sort of off-by-one that makes a
    table disagree with the script that produced it."""
    return len({tuple(int(v) for v in c) for c in comp[name][:, :, :3][solids[name]].reshape(-1, 3)})


print("land colours - " + "  ".join(f"{n}: {land_colours(n)}" for n, _i, _e, _c in C.VARIANTS))

measured = {
    "cameraElevationDeg": C.ELEV,
    "cellsA": len(C.ISLAND["variantA"]["cells"]),
    "distinctShapesA": C.ISLAND["variantA"]["distinctShapes"],
    "cellsB": len(C.ISLAND["variantB"]["cells"]),
    "distinctShapesB": C.ISLAND["variantB"]["distinctShapes"],
    "finerLatticeA": C.ISLAND["variantA"]["finerLattice"],
    "meanCellAreaA": C.ISLAND["variantA"]["meanCellArea"],
    "meanCellAreaB": C.ISLAND["variantB"]["meanCellArea"],
    "renderedInteriorPieces": {"a": len(C.TILE_PIECES), "b": 0, "bplus": 0, "bplusplus": 0},
    "rimPieceSet": int(C.ISLAND["wall"]["headings"]),
    "chamferShareOfLandPxA": round(chamfer, 5),
    "wallShareOfLandPxA": round(walls_a, 5),
    "wallShareOfLandPxBpp": round(walls_b, 5),
    "paletteEntries": int(len(C.PALETTE)),
    "landColours": {k: land_colours(k) for k in comp},
}
with open(os.path.join(HERE, "verify-report.json"), "w") as fh:
    json.dump({"checks": {"failed": fails}, "measured": measured}, fh, indent=1)

print()
if fails:
    print("VERIFY RED:", fails)
    raise SystemExit(1)
print("VERIFY GREEN - determinism at three seams, tint expressible under both interiors")
