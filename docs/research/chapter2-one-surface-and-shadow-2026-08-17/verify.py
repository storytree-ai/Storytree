#!/usr/bin/env python3
"""EVERY CLAIM THIS PASS MAKES, CHECKED — including the ones it would be most convenient to assume.

    python verify.py            # all checks
    python verify.py --fast     # skip the determinism re-compose (~3 min)

The checks are grouped by what they defend. The two that matter most are the ones nothing else on the
track would catch: the LADDER CEILING (§3), because a shadow depth that drifts past it makes the art
assert a status the work does not have, and the AO STEP TEST (§5), because an ambient-occlusion term
that fires at a FLAT join redraws — as a shade band — exactly the interior mesh seam the owner had
removed the day before.
"""
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
HEALTHY = os.path.join(REPO, "docs", "research", "chapter2-healthy-island-2026-08-16")
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
SWEEP = os.path.join(REPO, "docs", "research", "chapter2-camera-elevation-sweep-2026-08-15")
FAST = "--fast" in sys.argv

sys.path.insert(0, HERE)
sys.path.insert(0, HEALTHY)
sys.path.insert(0, GRASS)

import importlib.util                                       # noqa: E402
import island_pass as P                                     # noqa: E402
import shadow as SH                                         # noqa: E402

_spec = importlib.util.spec_from_file_location("fork_compose", os.path.join(FORK, "compose.py"))
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)

REPORT = json.load(open(os.path.join(HERE, "shadow-report.json")))
RESULTS = []


def holds(name, ok, detail=""):
    RESULTS.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)
    return bool(ok)


def git(*args):
    return subprocess.run(["git", "-C", REPO] + list(args), capture_output=True, text=True).stdout


# =====================================================================================================
print("\n== 1. the fence ==")
# =====================================================================================================
changed = [ln for ln in git("diff", "--name-only", "HEAD").splitlines() if ln.strip()]
untracked = [ln for ln in git("ls-files", "--others", "--exclude-standard").splitlines() if ln.strip()]
staged = [ln for ln in git("diff", "--name-only", "--cached").splitlines() if ln.strip()]
outside = sorted({f for f in changed + untracked + staged if not f.startswith("docs/research/")})
holds("every changed / untracked file is under docs/research/", not outside,
      f"outside: {outside}" if outside else f"{len(set(changed + untracked + staged))} file(s), all inside")

cam = open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts")).read()
holds("LAND_CAMERA_ELEVATION_DEG is still 20 and was not touched",
      "LAND_CAMERA_ELEVATION_DEG = 20" in cam.replace("export const ", ""),
      f"the research track authors at {P.PASS_ELEVATION_DEG:g} deg as a NAMED PARAMETER")

# THE DIAGNOSED CAUSE IS READ AND NOT EDITED. This pass names `substrate.ts:237` as the mechanism
# behind the owner's "different mesh triangles rendering different colors" and then does not touch it,
# because the owner fenced this work out of the app. Asserting the line is still there is what keeps
# the finding attached to a real line of code AND proves the fence held.
sub = open(os.path.join(REPO, "packages", "forest-world", "src", "substrate.ts")).read()
holds("substrate.ts still carries the diagnosed line, unedited",
      "variant: hash(" in sub and "wheat: cellWheat" in sub
      and "packages/forest-world/src/substrate.ts" not in " ".join(changed + staged),
      "the cause is named, not fixed — the app fix is a finding, not this pass's diff")

# =====================================================================================================
print("\n== 2. the light rig is READ from the delivered art, by two independent instruments ==")
# =====================================================================================================
pieces = SH.measure_light_azimuth_from_pieces(os.path.join(GRASS, "pieces-land"))
holds("the land pieces' LIT wall band sits to screen-LEFT of their DARK one",
      pieces["litSideIsScreenLeft"],
      f"wall_lit cx={pieces['wall_lit']:.1f} < wall_dark cx={pieces['wall_dark']:.1f} "
      f"(silhouette {pieces['silhouette']:.1f})")

tree_dir = os.path.join(SWEEP, "tree-%s" % ("%g" % P.PASS_ELEVATION_DEG).replace(".", "p"), "frames")
reg = json.load(open(os.path.join(tree_dir, "registration.json")))
crown, npx = SH.measure_light_azimuth_from_tree(os.path.join(tree_dir, reg["frameOrder"][-1]))
holds("the hero tree's crown brightens UP-LEFT, independently of the pieces",
      crown[0] < 0 and crown[1] < 0, f"gradient {tuple(round(v, 3) for v in crown)} over {npx} crown px")
holds("the declared LIGHT_SCREEN_FROM agrees with both instruments",
      SH.LIGHT_SCREEN_FROM[0] < 0 and SH.LIGHT_SCREEN_FROM[1] < 0
      and abs(SH.LIGHT_SCREEN_FROM[0] - crown[0]) < 0.05
      and abs(SH.LIGHT_SCREEN_FROM[1] - crown[1]) < 0.05,
      f"declared {SH.LIGHT_SCREEN_FROM} vs measured {tuple(round(v, 3) for v in crown)}")

# THE LAND AND THE TREE SHARE ONE KEY AT THE GENERATOR — re-read from both files rather than restated,
# because the increment's *"the land must agree with it or the two will read as separate scenes"* is a
# property this pass INHERITS, and a property inherited silently is one that can be lost silently.
land_src = open(os.path.join(FORK, "blender_land.py")).read()
tree_src = open(os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                             "blender-hero-v1", "blender_tree.py")).read()
key = "math.radians(48), 0.0, math.radians(34)"
holds("blender_land.py and blender_tree.py declare the SAME key sun",
      key in land_src and key in tree_src, f"({key})")
holds("KEY_ELEVATION_DEG is derived from that euler, not asserted",
      abs(SH.KEY_ELEVATION_DEG - (90.0 - SH.KEY_ROT_DEG[0])) < 1e-9, f"{SH.KEY_ELEVATION_DEG:g} deg")

# =====================================================================================================
print("\n== 3. the ladder is BOUNDED BY MEASUREMENT, not chosen ==")
# =====================================================================================================
table = SH.reader_status_table(C, faces="top")
delivered_top = C.shade(C.hexrgb(C.STATUS_TOKENS["healthy"]["top"][0]), C.FLAT_LEVEL)
ceiling, read0 = SH.safe_depth(C, delivered_top, table)
holds("the delivered top fill reads `healthy` at full light", read0 == "healthy",
      "#%02x%02x%02x" % tuple(int(round(v)) for v in delivered_top))
holds("the ceiling is RE-MEASURED here and agrees with the report",
      abs(ceiling - REPORT["howDeepBeforeItLies"]["measuredCeiling"]) < 1e-9, f"ceiling {ceiling}")
holds("the deepest rung is clear of the ceiling by the declared margin",
      min(SH.SHADOW_LEVELS) >= ceiling + SH.SHADOW_MARGIN,
      f"deepest {min(SH.SHADOW_LEVELS)} >= {ceiling} + {SH.SHADOW_MARGIN}")
holds("the ladder is DERIVED from the floor, not declared beside it",
      SH.SHADOW_LEVELS == SH.ladder_for(SH.SHADOW_FLOOR), f"{SH.SHADOW_LEVELS}")
holds("the floor sits below the deepest rung, so that rung is reachable",
      SH.SHADOW_FLOOR < min(SH.SHADOW_LEVELS), f"floor {SH.SHADOW_FLOOR}")

# EVERY RUNG IS REACHED BY A TERM, AND THE REPORT SAYS SO FROM THE DELIVERED RASTER. A rung no term can
# reach is a colour in the palette and nothing on the island.
bounds = [(SH.SHADOW_LEVELS[i] + SH.SHADOW_LEVELS[i - 1]) / 2 if i else (1.0 + SH.SHADOW_LEVELS[0]) / 2
          for i in range(len(SH.SHADOW_LEVELS))]
rungs_hit = {i for i, term in enumerate([SH.JOIN_AO, SH.TERRAIN_CAST, SH.TREE_CAST])
             for i2, b in enumerate(bounds) if 1.0 - term < b and (i2 == len(bounds) - 1
                                                                   or 1.0 - term >= bounds[i2 + 1])
             for i in [i2]}
holds("each of the three terms alone lands on a DISTINCT rung", len(rungs_hit) == 3,
      f"AO {SH.JOIN_AO} / terrain {SH.TERRAIN_CAST} / canopy {SH.TREE_CAST} -> rungs {sorted(rungs_hit)}")
delivered_rungs = {k for k in REPORT["survivesTheSnap"]["ladderOnClosedPalette"]
                   if k.startswith("light-") and k != "light-1"}
holds("every rung actually REACHED the delivered raster",
      len(delivered_rungs) == len(SH.SHADOW_LEVELS), f"{sorted(delivered_rungs)}")

# =====================================================================================================
print("\n== 4. the palette closure ==")
# =====================================================================================================
base = C.PALETTE
ext = SH.extended_palette(base)
base_set = {tuple(int(round(v)) for v in c) for c in base}
ext_set = {tuple(int(v) for v in c) for c in ext}
holds("the light-closed palette is a STRICT SUPERSET of the shipped one",
      base_set <= ext_set and len(ext_set) > len(base_set), f"{len(base_set)} -> {len(ext_set)}")

# THE SUPERSET PROPERTY IS ONLY USEFUL IF IT IS ALSO AN IDENTITY. If a widened palette moved an
# UNSHADOWED pixel, the fork's "one variable" claim would be false — the shadow panel would differ
# from the flat one by the palette as well as by the light.
saved = C.PALETTE
try:
    C.PALETTE = ext
    probe = np.array([list(c) for c in sorted(base_set)], dtype=np.float32)[None, :, :]
    holds("every shipped-palette colour still snaps to ITSELF under the closure",
          np.array_equal(C.snap(probe), probe), f"{len(base_set)} entries, identity")
finally:
    C.PALETTE = saved

# The coast is the family `build_palette` records having missed once, at a cost of 2564 px of an
# `unknown` rim rendered `healthy` green with nothing failing. Closing over the DELIVERED palette
# rather than over the status tables is what covers it — asserted, not assumed.
for name, tok in (("coast sand", C.COAST_SAND), ("coast sand edge", C.COAST_SAND_EDGE)):
    want = {tuple(int(round(v * lv)) for v in C.hexrgb(tok)) for lv in SH.SHADOW_LEVELS}
    holds(f"the closure covers the {name} at every light level", want <= ext_set)

# =====================================================================================================
print("\n== 5. the AO term does NOT redraw the mesh seam ==")
# =====================================================================================================
# THE CLAIM WORTH CHECKING MECHANICALLY. The owner removed the interior mesh seams on 2026-08-16 at a
# measured cost of 1892 delivered px. An ambient-occlusion term applied at every cell-to-cell join
# would put them straight back as a shade band. So the field is built over a FLATTENED copy of this
# island — every cell at one height, every join a flat join — and required to be identically 1.0
# wherever the canopy does not reach.
island = json.load(open(os.path.join(HEALTHY, "island.json")))
D_meta = json.load(open(os.path.join(GRASS, "pieces-land", "render-meta.json")))
C.ISLAND, C.PIECES, C.META = island, os.path.join(GRASS, "pieces-land"), D_meta
C.SS = int(D_meta["supersample"])
C.ELEV = float(island["camera"]["elevationDeg"])
C.SIN, C.COS = float(island["camera"]["groundFlattening"]), float(island["camera"]["uprightForeshortening"])
C.COAST = np.array(island["coastLoopGround"], dtype=np.float64)
C.CAPS = list(island["capStatuses"])
C.CAP_LEVEL = [0] * len(C.CAPS)          # <- FLAT: every capability on one parcel level
_gx0, _gx1 = C.COAST[:, 0].min() - C._pad, C.COAST[:, 0].max() + C._pad
_gy0, _gy1 = C.COAST[:, 1].min() - C._pad, C.COAST[:, 1].max() + C._pad
C.CANVAS_W = int(math.ceil(_gx1 - _gx0))
C.CANVAS_H = int(math.ceil((_gy1 - _gy0) * C.SIN + float(D_meta["cliffDropWorld"]) * C.COS
                           + C._TREE_HEADROOM))
C.ORIGIN = (-_gx0, -_gy0 * C.SIN + C._TREE_HEADROOM)
flat_cells = [dict(c) for c in island["variantB"]["cells"]]
_height_of = C.height_of
C.height_of = lambda cell, mode: 0.0                          # every cell at ONE height
try:
    field_flat, stats_flat = SH.build(C, flat_cells)          # no tree: terrain + AO only
finally:
    C.height_of = _height_of
holds("with every cell at ONE height, the terrain+AO field is identically full light",
      float(field_flat.min()) == 1.0,
      f"min multiplier {float(field_flat.min()):.4f} over {stats_flat['landPixels']} land px — "
      f"AO is driven by height EXCESS, so a flat join draws nothing")

# =====================================================================================================
print("\n== 6. no fourth compositor ==")
# =====================================================================================================
src = open(os.path.join(HERE, "compose_shadow.py")).read()
holds("this pass IMPORTS the healthy-island pass rather than copying it",
      "compose_healthy.py" in src and "spec_from_file_location" in src)
for fn in ("compose_land", "back_half", "snap", "plant_tree", "STATUS_TOKENS"):
    holds(f"`{fn}` is called, never restated here",
          f"def {fn}(" not in src and f"def {fn}(" not in open(os.path.join(HERE, "shadow.py")).read())
holds("the only new composition code is shadow.py plus one panel driver",
      src.count("\ndef ") <= 12, f"{src.count(chr(10) + 'def ')} module-level functions")

# =====================================================================================================
print("\n== 7. the delivered pictures ==")
# =====================================================================================================
PICTURES = ("one-surface-and-shadow.png", "three-moves.png", "shadow-detail-6x.png",
            "shadow-survives-the-snap.png", "confusability-depth.png")
states = set()
for pic in PICTURES:
    side = json.load(open(os.path.join(HERE, pic + ".provenance.json")))
    states.add(json.dumps(side.get("codeState"), sort_keys=True))
    holds(f"{pic} has a sidecar declaring the camera and the rig",
          abs(float(side["cameraElevationDeg"]) - P.PASS_ELEVATION_DEG) < 1e-9
          and "lightRig" in side and "shadowTerms" in side)
holds("all five pictures come from ONE code state", len(states) == 1)
holds("the report records ZERO Blender frames rendered", REPORT["blenderFramesRendered"] == 0,
      "the committed piece set covers this island's six kite shapes")
holds("the delivered surface reads as ONE top-face fill",
      REPORT["oneSurface"]["deliveredCellFillsAfter"]["distinctTopFaceFills"] == 1,
      f"{REPORT['oneSurface']['deliveredCellFillsBefore']['distinctTopFaceFills']} -> "
      f"{REPORT['oneSurface']['deliveredCellFillsAfter']['distinctTopFaceFills']} top-face fills")
moved = REPORT["statusIsNotCorrupted"]["readChangedByTheShadow"]["closedPalette"]
holds("no unambiguous healthy FILL pixel changed what it says",
      moved["pureFillPxThatChangedWhatTheySay"] == 0,
      f"0 of {moved['pureFillPx']} pure-fill px (loose count {moved['pixelsWhoseStatusReadChanged']}, "
      f"every one of them a cell/wall majority-vote flip)")

# =====================================================================================================
print("\n== 8. determinism, on the DECODED raster ==")
# =====================================================================================================
# NEVER A FILE HASH — the house rule, and it is not pedantry: across two pixel-identical runs on this
# track, 0 of 22 files had identical bytes, because Blender and Pillow both stamp their own PNG
# container. A file hash reports 100% false drift.
if FAST:
    print("SKIP  determinism (--fast)")
else:
    tmp = tempfile.mkdtemp(prefix="one-surface-shadow-verify-")
    try:
        env = dict(os.environ, STORYTREE_SHADOW_OUT=tmp)
        r = subprocess.run([sys.executable, os.path.join(HERE, "compose_shadow.py")],
                           cwd=HERE, env=env, capture_output=True, text=True)
        holds("re-composing succeeds", r.returncode == 0, (r.stderr or "")[-200:])
        for pic in PICTURES:
            a = np.array(Image.open(os.path.join(HERE, pic)).convert("RGB"))
            b = np.array(Image.open(os.path.join(tmp, pic)).convert("RGB"))
            holds(f"{pic} re-composes PIXEL-IDENTICALLY", a.shape == b.shape and np.array_equal(a, b))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

ok = sum(1 for _n, v in RESULTS if v)
print(f"\n{ok}/{len(RESULTS)} checks pass")
json.dump({"passed": ok, "total": len(RESULTS),
           "checks": [{"name": n, "ok": v} for n, v in RESULTS]},
          open(os.path.join(HERE, "verify-report.json"), "w"), indent=1)
sys.exit(0 if ok == len(RESULTS) else 1)
