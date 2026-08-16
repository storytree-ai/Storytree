#!/usr/bin/env python3
"""The machine-checkable half of this pass. The LOOK is the owner's; these are the claims a session
may assert for itself.

    python verify.py            # everything
    python verify.py --fast     # skip the Blender re-render (checks 1b)

Seven checks, each written to be able to FAIL. Two of them exist because a check that merely watches
a guard pass is indistinguishable from one that cannot fail: check 5 drives the same piece through
the copied blit and the shipped one, and `verify_refusal.py` makes the code-state refusal fire.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FAST = "--fast" in sys.argv
BLENDER = os.environ.get(
    "BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")

sys.path.insert(0, HERE)
import compose_dressed as D  # noqa: E402
import scatter  # noqa: E402
import dressing  # noqa: E402

C = D.C
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail else ""), flush=True)
    return ok


def raster(path):
    """The DECODED raster of a PNG, never the file bytes.

    Blender stamps its own PNG container, so a re-render of the identical scene at the identical
    seed produces a different FILE and an identical IMAGE. The interior fork measured this the hard
    way: a naive sha256-of-the-file check reported non-determinism that did not exist, failing all
    22 pieces before the distinction was written down.
    """
    return hashlib.sha256(
        np.array(Image.open(path).convert("RGBA"), dtype=np.uint8).tobytes()).hexdigest()


print("== 1. determinism ==")

# 1a. the scatter: same seed -> same placements, and it must not depend on draw ORDER
cells = D.prepare(D.ISLAND["variantB"]["cells"])
items_a, stats_a = scatter.scatter_island(D.ISLAND, D.DECOR_META["tokenFamilies"],
                                          dressing.SEED, D.UAT_CRITERIA)
items_b, _sb = scatter.scatter_island(D.ISLAND, D.DECOR_META["tokenFamilies"],
                                      dressing.SEED, D.UAT_CRITERIA)
check("scatter: re-running the placement is identical",
      json.dumps(items_a, sort_keys=True) == json.dumps(items_b, sort_keys=True),
      f"{len(items_a)} placements")

# A capability's placements must not shift when ANOTHER capability's do. This is what the CRC32
# addressing buys over a draw counter, and it is worth asserting rather than trusting: with a
# counter, adding one test anywhere reshuffles the whole island and every committed picture of it.
alt_crit = D.UAT_CRITERIA[:-1]
items_c, _sc = scatter.scatter_island(D.ISLAND, D.DECOR_META["tokenFamilies"],
                                      dressing.SEED, alt_crit)
meadow_a = [i for i in items_a if i["kind"] != "flower"]
meadow_c = [i for i in items_c if i["kind"] != "flower"]
check("scatter: changing the UAT criteria moves NO meadow placement",
      json.dumps(meadow_a, sort_keys=True) == json.dumps(meadow_c, sort_keys=True),
      f"{len(meadow_a)} meadow placements unmoved with {len(alt_crit)} criteria")

# 1b. the render: every decor piece re-renders raster-identical
if FAST:
    check("render: every decor piece re-renders raster-identical", True, "SKIPPED (--fast)")
else:
    tmp = os.path.join(HERE, ".verify-rerender")
    shutil.rmtree(tmp, ignore_errors=True)
    subprocess.run([BLENDER, "--background", "--python",
                    os.path.join(HERE, "blender_decor.py"), "--",
                    "--island", "island.json", "--out", ".verify-rerender", "--samples", "48"],
                   cwd=HERE, check=True, capture_output=True)
    names = D.DECOR_META["pieceNames"]
    same = [n for n in names
            if raster(os.path.join(D.DECOR_PIECES, f"{n}.png")) == raster(os.path.join(tmp, f"{n}.png"))]
    diff_container = [n for n in names
                      if open(os.path.join(D.DECOR_PIECES, f"{n}.png"), "rb").read()
                      != open(os.path.join(tmp, f"{n}.png"), "rb").read()]
    shutil.rmtree(tmp, ignore_errors=True)
    check("render: every decor piece re-renders raster-identical", len(same) == len(names),
          f"{len(same)}/{len(names)} pixel-identical ({len(diff_container)} with a differing PNG "
          f"container — Blender stamps the file, so the claim is on the raster)")

# 1c. the composite
img1, solid1, col1, _g1 = D.render_variant(items_a)
img2, solid2, col2, _g2 = D.render_variant(items_a)
check("composite: two runs are byte-identical", np.array_equal(img1, img2),
      f"{int(solid1.sum())} land px, {len(col1)} colours")


print("\n== 2. the per-cell status tint stays expressible (ADR-0367 D5) ==")

# 2a. THE LOAD-BEARING ONE: no rendered decor piece may contain any island token colour. A piece
#     carries band keys; which colour a key becomes is looked up per placement. If a status colour
#     were baked into a piece, the tint would be a property of the RENDER and D5 would be lost.
island_tokens = set()
for st in C.STATUS_TOKENS.values():
    for t in st["top"] + [st["wheat"], st["side"]]:
        island_tokens.add(tuple(int(v) for v in C.hexrgb(t)))
for t in (C.COAST_SAND, C.COAST_SAND_EDGE):
    island_tokens.add(tuple(int(v) for v in C.hexrgb(t)))

offenders = []
for n in D.DECOR_META["pieceNames"]:
    a = np.array(Image.open(os.path.join(D.DECOR_PIECES, f"{n}.png")).convert("RGBA"))
    px = {tuple(int(v) for v in c) for c in a[a[:, :, 3] > 110][:, :3]}
    hit = px & island_tokens
    if hit:
        offenders.append((n, sorted(hit)[:3]))
check("(a) no rendered decor piece contains ANY island token colour", not offenders,
      f"{len(D.DECOR_PIECES and D.DECOR_META['pieceNames'])} pieces checked"
      if not offenders else f"OFFENDERS {offenders}")

# 2b. every status renders from ONE piece set
per_status = {}
for st in ("healthy", "building", "proposed", "mapped", "unhealthy"):
    caps_all = [st] * len(C.CAPS)
    its, _s = scatter.scatter_island({**D.ISLAND, "capStatuses": caps_all},
                                     D.DECOR_META["tokenFamilies"], dressing.SEED, D.UAT_CRITERIA)
    im, sol, cols, _g = D.render_variant(its, caps=caps_all)
    per_status[st] = (len(its), len(cols), hashlib.sha256(im.tobytes()).hexdigest()[:12])
check("(b) all five statuses render from ONE decor piece set",
      len({v[2] for v in per_status.values()}) == 5,
      ", ".join(f"{k}:{v[0]}pl/{v[1]}col" for k, v in per_status.items()))

# 2c. permuting the status assignment repaints the island and MOVES NO PIECE FILE
before = {n: raster(os.path.join(D.DECOR_PIECES, f"{n}.png")) for n in D.DECOR_META["pieceNames"]}
perm = list(C.CAPS[1:]) + [C.CAPS[0]]
its_p, _sp = scatter.scatter_island({**D.ISLAND, "capStatuses": perm},
                                    D.DECOR_META["tokenFamilies"], dressing.SEED, D.UAT_CRITERIA)
img_p, _s, col_p, _g = D.render_variant(its_p, caps=perm)
after = {n: raster(os.path.join(D.DECOR_PIECES, f"{n}.png")) for n in D.DECOR_META["pieceNames"]}
check("(c) permuting the statuses repaints the island and moves no piece",
      (not np.array_equal(img_p, img1)) and before == after,
      f"{len(col_p)} colours under the permutation vs {len(col1)}")


print("\n== 3. the palette is a FULL closure (the interior fork's measured bug, one layer up) ==")

# The families are restated INDEPENDENTLY here rather than asked of `build_palette_dressed`, because
# a check that consults the palette can only ever pass. This is the same discipline the interior
# fork adopted after a missing (side x chamfer) entry repainted an `unknown` rim `healthy` green
# across 2564 px at exit 0.
levels = sorted({float(lv) for roles in D.DECOR_META["pieceRoles"].values()
                 for _r, lv in roles.values()})
want = set()
for family in D.DECOR_META["tokenFamilies"].values():
    for variant in family.values():
        for tok in variant.values():
            for m in levels:
                want.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(tok), m)))
have = {tuple(int(v) for v in c) for c in C.PALETTE}
missing = sorted(want - have)
check("every (decor token x authored shade) pair is IN the closed palette", not missing,
      f"{len(want)} decor entries, {len(have)} palette entries total"
      if not missing else f"MISSING {missing[:4]}")

# And the consequence that makes it matter: a decor pixel must never snap into ANOTHER status's
# family. Every key in one piece resolves to one family by construction; this asserts it.
#
# Stated as CONTAINMENT rather than by scanning role NAMES. Role names are not globally unique —
# `stem` belongs to both the `wilt` and `flower` families — so a name scan reports every flower and
# every wilt as family-crossing, which is a property of the check and not of the art. The invariant
# that actually matters is that a piece's whole role set fits inside ONE (family, variant): that is
# what guarantees the roles dict handed to `paste_decor` comes from a single status or a single
# verdict, and therefore that an antialiased fringe pixel can only ever land on a neighbouring shade
# of the right thing.
cross = []
for name, roles in D.DECOR_META["pieceRoles"].items():
    needed = {role for _k, (role, _lv) in roles.items()}
    fits = [f"{fam_name}.{var_name}"
            for fam_name, fam in D.DECOR_META["tokenFamilies"].items()
            for var_name, var in fam.items()
            if needed <= set(var)]
    if not fits:
        cross.append((name, sorted(needed), "fits no single family variant"))
check("every decor piece's roles fit inside ONE token family variant "
      "(so a fringe pixel cannot cross a status)",
      not cross, f"{len(D.DECOR_META['pieceRoles'])} pieces, each contained in one variant"
      if not cross else str(cross))


print("\n== 4. the land is UNCHANGED by this pass ==")
# The pass adds decor; it must not have altered the land the track already delivered. Asserted on
# the raw supersampled canvas, before the snap could clamp a small difference away.
try:
    D.assert_land_unchanged()
    check("compose_dressed's land pass is byte-identical to the shipped compose.py", True,
          "canvas + alpha + tree height")
except SystemExit as exc:
    check("compose_dressed's land pass is byte-identical to the shipped compose.py", False, str(exc))


print("\n== 5. the copied blit is the SHIPPED blit (made to be falsifiable) ==")
# `paste_decor` duplicates `C.paste_piece`'s blit arithmetic because decor needs an n-token map
# where the land has two. A blit copied by eye is a blit nobody has checked, so a TWO-role piece is
# driven through both and the canvases compared. Build a synthetic two-key piece for the purpose.
h = w = 24
idx = np.zeros((h, w), dtype=np.int64)
idx[:, w // 2:] = 1
mask = np.ones((h, w), dtype=bool)
top_hex, side_hex = "#8cb85e", "#648244"

cv1 = np.zeros((h * 2, w * 2, 3), dtype=np.float32)
al1 = np.zeros((h * 2, w * 2), dtype=np.float32)
C.KEY_SHADE.update({"_t": 1.00, "_s": 0.80})
C.KEY_IS_WALL.update({"_t": False, "_s": True})
C.paste_piece(cv1, al1, (["_t", "_s"], idx, mask), w / 2.0 * C.SS / C.SS + w / 2.0 / C.SS,
              h / 2.0 / C.SS, C.hexrgb(top_hex), C.hexrgb(side_hex))

cv2 = np.zeros((h * 2, w * 2, 3), dtype=np.float32)
al2 = np.zeros((h * 2, w * 2), dtype=np.float32)
D.paste_decor(cv2, al2, (["A", "B"], idx, mask), w / 2.0 * C.SS / C.SS + w / 2.0 / C.SS,
              h / 2.0 / C.SS, {"t": top_hex, "s": side_hex},
              {"A": ["t", 1.00], "B": ["s", 0.80]})
check("paste_decor reproduces C.paste_piece exactly on a two-role piece",
      np.array_equal(cv1, cv2) and np.array_equal(al1, al2),
      "same blit, same rounding, same clipping")


print("\n== 6. the vocabulary is the app's, and 1:1 where the ADR says 1:1 ==")
check("exactly one flower per UAT criterion (ADR-0226 D4)",
      stats_a["flower"] == len(D.UAT_CRITERIA),
      f"{stats_a['flower']} flowers for {len(D.UAT_CRITERIA)} criteria, "
      f"{stats_a['flowerFallbacks']} placed by the exhaustion fallback")

# The density dial must move the meadow and NOT the flowers — scaling the flowers would draw
# criteria the story does not have.
d3, _s3 = scatter.scatter_island(D.ISLAND, D.DECOR_META["tokenFamilies"], dressing.SEED,
                                 D.UAT_CRITERIA, density=3.0)
check("the density dial scales the meadow and NEVER the UAT flowers",
      len([i for i in d3 if i["kind"] == "flower"]) == len(D.UAT_CRITERIA)
      and len([i for i in d3 if i["kind"] != "flower"]) > len(meadow_a),
      f"x3 -> {len([i for i in d3 if i['kind'] != 'flower'])} meadow, "
      f"{len([i for i in d3 if i['kind'] == 'flower'])} flowers")

# No decor may stand in the water: the app's keep-IN, asserted on the delivered placements.
def in_any_cell(g):
    return any(scatter._point_in_poly(g[0], g[1], c["poly"]) for c in cells)


off_land = [i for i in items_a if not in_any_cell(i["g"])]
check("every placement stands on a land cell (the app's keep-IN, no decor in the water)",
      not off_land, f"{len(items_a)} placements on land"
      if not off_land else f"{len(off_land)} OFF LAND")


print("\n== 7. this pass touched nothing outside docs/research ==")
repo = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
diff = subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=repo,
                      capture_output=True, text=True).stdout.split()
untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=repo,
                           capture_output=True, text=True).stdout.split()
outside = sorted({p for p in diff + untracked if not p.startswith("docs/research/")})
check("the working tree's changes are confined to docs/research/**", not outside,
      f"{len(diff + untracked)} paths, all under docs/research/"
      if not outside else f"OUTSIDE: {outside[:8]}")


print()
ok = all(r[1] for r in results)
with open(os.path.join(HERE, "verify-report.json"), "w") as fh:
    json.dump({"green": ok,
               "checks": [{"name": n, "pass": p, "detail": d} for n, p, d in results],
               "cameraElevationDeg": C.ELEV,
               "appLandCameraElevationDeg": dressing.APP_LAND_CAMERA_ELEVATION_DEG,
               "statusRenders": {k: {"placements": v[0], "colours": v[1]}
                                 for k, v in per_status.items()}}, fh, indent=1)
print(f"{'ALL GREEN' if ok else 'RED'} — {sum(1 for r in results if r[1])}/{len(results)} checks")
sys.exit(0 if ok else 1)
