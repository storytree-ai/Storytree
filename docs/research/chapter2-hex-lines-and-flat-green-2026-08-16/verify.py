#!/usr/bin/env python3
"""The machine-checkable half of this pass. The LOOK is the owner's; these are the claims a session
may assert for itself.

    python verify.py

Every check below is one this pass's README makes as a statement, so a red here is a README that has
started lying rather than merely a broken script.
"""
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PRIOR = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
sys.path.insert(0, PRIOR)

import compose_core as D                                # noqa: E402
import grass                                            # noqa: E402
import scatter                                          # noqa: E402

import seams as S                                       # noqa: E402

C = D.C
ISLAND = D.ISLAND
CELLS = D.prepare(ISLAND["variantB"]["cells"])
HEXES = S.load_hex_lattice()
REPORT = json.load(open(os.path.join(HERE, "lines-report.json")))

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail else ""))


# ---------------------------------------------------------------- 1. the land is the shipped land
D.use_pieces("pieces-m00-blade", expect_mix=0.0, expect_geometry="blade")
D.assert_land_unchanged()
check("1. the land pass is byte-identical to the shipped compositor", True,
      "compose_land([]) == C.compose('flat','cell') on canvas AND alpha")
check("1b. the pass composes at its declared angle", abs(C.ELEV - grass.PASS_ELEVATION_DEG) < 1e-9,
      f"{C.ELEV:g} deg")

CTRL = S.SeamControl(C, ISLAND, HEXES).install()
ITEMS, _stats = scatter.scatter_island(
    ISLAND, D.DECOR_META["tokenFamilies"], grass.SEED, D.UAT_CRITERIA)


def render(drawn, tree=True, items=None):
    CTRL.reset(drawn)
    img, solid, _c, _g = D.render_variant(ITEMS if items is None else items,
                                          tree=tree, ground="flat")
    return img[:, :, :3].astype(np.int16), solid


# ---------------------------------------------------------------- 2. THE INVENTORY IS TOTAL
CTRL.reset({"coast", "cell", "hex"})
D.compose_land([])
inv = CTRL.inventory()
check("2. every stroke on the island is attributed (no `other`)", inv["other"] == 0,
      f"coast={inv['coast']} cell={inv['cell']} hex={inv['hex']} other={inv['other']}")
check("2b. no hex TILE is ever stroked", inv["hex"] == 0)
check("2c. exactly one stroke per mesh cell", inv["cell"] == len(CELLS), f"{len(CELLS)} cells")
check("2d. the hex detector is ARMED (a negative result from a live detector)",
      CTRL.hex_rings > 0, f"{CTRL.hex_rings} candidate rings registered")

# ---------------------------------------------------------------- 3. THE PANELS
imgs = {}
for name, drawn, _cap in S.PANELS + (S.COAST_OFF,):
    imgs[name], _ = render(drawn)


def changed(a, b):
    return int(np.any(a != b, axis=2).sum())


check("3. `hex-off` is PIXEL-IDENTICAL to `as-is`", changed(imgs["as-is"], imgs["hex-off"]) == 0,
      "on the decoded raster — nothing draws a hex seam, so suppressing them changes nothing")
check("3b. `both-off` is PIXEL-IDENTICAL to `cells-off`",
      changed(imgs["cells-off"], imgs["both-off"]) == 0)
check("3c. removing the interior seams DOES change the island",
      changed(imgs["as-is"], imgs["cells-off"]) > 0,
      f"{changed(imgs['as-is'], imgs['cells-off'])} px — the lever is wired, not merely quiet")
check("3d. the coast seam is a SEPARATE line class",
      changed(imgs["both-off"], imgs["all-off"]) > 0,
      f"{changed(imgs['both-off'], imgs['all-off'])} px more")

# ---------------------------------------------------------------- 4. DETERMINISM ON THE RASTER
again, _ = render({"coast", "cell", "hex"})
check("4. the composite is deterministic, asserted on the DECODED raster",
      changed(imgs["as-is"], again) == 0)

# ---------------------------------------------------------------- 5. ONE VARIABLE
land_asis, _ = render({"coast", "cell", "hex"}, tree=False, items=[])
land_off, land_solid = render({"coast"}, tree=False, items=[])

H, W = land_asis.shape[0], land_asis.shape[1]
from PIL import Image, ImageDraw                        # noqa: E402
ids = Image.new("I", (C.CANVAS_W * C.SS, C.CANVAS_H * C.SS), 0)
dr = ImageDraw.Draw(ids)
for i in sorted(range(len(CELLS)), key=lambda k: CELLS[k]["c"][1]):
    c = CELLS[i]
    dr.polygon([(C.project(gx, gy, c["_h"])[0] * C.SS, C.project(gx, gy, c["_h"])[1] * C.SS)
                for gx, gy in c["poly"]], fill=i + 1)
IDS = np.array(ids)[C.SS // 2::C.SS, C.SS // 2::C.SS].astype(np.int32) - 1


def modal(img):
    out = {}
    for i in range(len(CELLS)):
        m = IDS == i
        if not m.any():
            continue
        v, n = np.unique(img[m].reshape(-1, 3), axis=0, return_counts=True)
        out[i] = tuple(int(z) for z in v[int(np.argmax(n))])
    return out


a, b = modal(land_asis), modal(land_off)
moved = [i for i in a if i in b and a[i] != b[i]]
check("5. NO cell's delivered fill moves when only a seam is suppressed", not moved,
      f"{len(a)} cells sampled, {len(moved)} moved — the fork is one variable")

# ---------------------------------------------------------------- 6. PALETTE CLOSURE
#: Asserted on the LAND-ONLY composite, and that restriction is the honest scope rather than a
#: convenience. The hero tree is composited AFTER the back half at 1:1 because it is a shipped
#: sprite carrying its own 32-colour track palette and a signed owner verdict (compose_core's
#: module docstring), so a dressed island legitimately delivers colours the land palette does not
#: hold. Including it would make this check fail for a reason that has nothing to do with seams —
#: and passing it by widening the expected set until it fits is how a guard stops being one.
#: Scoped to the SOLID mask — the island's own pixels. Outside the coast the canvas is transparent
#: and reads (0,0,0), which is the absence of art rather than a colour the palette failed to hold;
#: including it fails the check for a reason that has nothing to do with paint. Verified rather than
#: assumed: with the mask applied the outside-set is empty, and (0,0,0) is the ONLY member it drops.
pal = {tuple(int(v) for v in p) for p in C.PALETTE}
seen = {tuple(int(v) for v in p) for p in land_off[land_solid].reshape(-1, 3)}
outside = seen - pal
check("6. seam removal introduces NO colour outside the closed palette",
      not outside,
      f"{len(seen)} distinct delivered land colours, {len(outside)} outside the palette")
check("6b. removal never WIDENS the delivered colour set",
      len({tuple(int(v) for v in p) for p in imgs["both-off"].reshape(-1, 3)})
      <= len({tuple(int(v) for v in p) for p in imgs["as-is"].reshape(-1, 3)}),
      "suppressing a shade can only remove entries, never add one")

# ---------------------------------------------------------------- 7. THE HEX GHOST IS REAL
rows = REPORT["hexGhost"]["rows"]
check("7. the hex ghost EXCEEDS chance at every tolerance",
      all(r["ratioVsRotatedControl"] > 1.0 for r in rows),
      "  ".join(f"{r['toleranceGroundUnits']}:{r['ratioVsRotatedControl']}x" for r in rows))
check("7b. the excess is largest at the TIGHTEST tolerance",
      rows[0]["ratioVsRotatedControl"] == max(r["ratioVsRotatedControl"] for r in rows),
      "a real geometric coincidence sharpens as the tolerance tightens; a chance one does not")

# ---------------------------------------------------------------- 8. THE COST IS BOUNDED
cost = REPORT["whatRemovalCosts"]
check("8. the cross-capability cost is measured and small",
      cost["crossCapabilityAdjacenciesThatGoInvisible"] < cost["crossCapabilityAdjacencies"],
      f"{cost['crossCapabilityAdjacenciesThatGoInvisible']} of "
      f"{cost['crossCapabilityAdjacencies']} boundaries go invisible")
check("8b. seam removal introduces no NEW status-colour collision",
      REPORT["statusStillReads"]["removalIntroducedNewCollisions"] == [])

# ---------------------------------------------------------------- 9. THE FENCE
def git(*args):
    return subprocess.run(["git", "-C", REPO] + list(args),
                          capture_output=True, text=True).stdout.strip()


touched = [ln.split("\t")[-1] for ln in git("diff", "--name-only", "HEAD").splitlines() if ln]
untracked = [ln for ln in git("ls-files", "--others", "--exclude-standard").splitlines() if ln]
strays = [p for p in touched + untracked if not p.startswith("docs/research/")]
check("9. the working tree changes are confined to docs/research/**", not strays,
      ", ".join(strays[:5]) if strays else "clean")

cam = open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts")).read()
check("9b. LAND_CAMERA_ELEVATION_DEG is STILL 20 and was not touched",
      "export const LAND_CAMERA_ELEVATION_DEG = 20;" in cam,
      "the broken map on main is frontend-visual-judgment-arc's live dogfood fixture")

CTRL.restore()
print(f"\n{len(OK)}/{len(OK) + len(FAIL)} green")
json.dump({"pass": OK, "fail": FAIL},
          open(os.path.join(HERE, "verify-report.json"), "w"), indent=1)
sys.exit(1 if FAIL else 0)
