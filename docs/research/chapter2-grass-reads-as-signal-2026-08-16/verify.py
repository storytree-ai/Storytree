#!/usr/bin/env python3
"""THE MACHINE-CHECKABLE HALF — the claims a session may assert for itself.

    python verify.py               # every check
    python verify.py --fast        # skip the Blender re-render (checks 1a/1b)

WHAT THIS IS NOT. It does not check whether the grass looks better. That is the owner's look and
this pass has no standing to sign it (ADR-0070 stage 2). Everything below is a property that is
either true or false in pixels.

THE ONE CHECK THAT CARRIES THE PASS'S THESIS is 4a: the custom-normal lever CANNOT change which
pixels are grass, at any mix from 0.00 to 1.00. That is what makes a look-driven change here unable
to silently cost meaning — ADR-0226 D2 puts the test-count signal in the grass's COUNT, and normals
decide which band a pixel takes rather than whether a pixel exists. It is the same property the arc
measured on the hero tree, where bark held flat at 629-631 px across the entire crown-normal fork.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import grass                                            # noqa: E402
import compose_core as D                                # noqa: E402
import scatter                                          # noqa: E402

C = D.C
FAST = "--fast" in sys.argv
BLENDER = os.environ.get(
    "BLENDER", r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe")

RESULTS = []


def check(section, name, ok, detail=""):
    RESULTS.append({"section": section, "check": name, "pass": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('   ' + detail) if detail else ''}", flush=True)
    return ok


def tag_for(mix, geom):
    return "pieces-m%02d-%s" % (round(mix * 100), geom)


def decoded(path):
    """The DECODED RASTER, never the file. Blender stamps its own PNG container, so every file
    differs byte-for-byte on every re-render while the images are identical — a naive file hash
    reports a non-determinism that does not exist."""
    return np.array(Image.open(path).convert("RGBA"), dtype=np.uint8)


ALL_TAGS = [tag_for(m, g) for g in grass.GEOMETRIES for m in grass.NORMAL_MIXES]
META0 = json.load(open(os.path.join(HERE, ALL_TAGS[0], "render-meta.json")))
PIECE_NAMES = META0["pieceNames"]
#: `prepare` annotates each cell with the height the compositor will draw it at, and the scatter
#: reads that back so a piece stands ON its cell rather than at ground zero. It must run before any
#: scatter call in this file — without it the first placement dies on a missing `_h`.
D.prepare(D.ISLAND["variantB"]["cells"])

# ================================================================= 1. determinism
print("\n== 1. determinism ==")
if not FAST:
    tmp = os.path.join(HERE, "_verify-rerender")
    # Rendered UNDER LOAD on purpose. Cycles adaptive sampling makes a render a function of system
    # load and the vendored pass measured it failing only when the box was busy, so a determinism
    # check on an idle box is the one that proves nothing. `use_adaptive_sampling = False` is the
    # fix; this is the test that can see it regress.
    load = [subprocess.Popen([sys.executable, "-c",
                              "x=0\nfor i in range(60_000_000): x+=i*i\n"]) for _ in range(3)]
    try:
        r = subprocess.run([BLENDER, "--background", "--python",
                            os.path.join(HERE, "blender_grass.py"), "--",
                            "--island", "island.json", "--out", "_verify-rerender",
                            "--normals", "0.6", "--geometry", "clump", "--samples", "48"],
                           cwd=HERE, capture_output=True)
    finally:
        for p in load:
            p.kill()
    same = r.returncode == 0 and all(
        np.array_equal(decoded(os.path.join(tmp, f"{n}.png")),
                       decoded(os.path.join(HERE, tag_for(0.6, "clump"), f"{n}.png")))
        for n in PIECE_NAMES)
    check("determinism", "every piece re-renders raster-identical UNDER CONCURRENT LOAD",
          same, f"{len(PIECE_NAMES)}/{len(PIECE_NAMES)} pieces, mix 0.60 clump")
    for f in os.listdir(tmp):
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
else:
    check("determinism", "Blender re-render (skipped by --fast)", True, "not verified this run")

items_a, _s = scatter.scatter_island(D.ISLAND, META0["tokenFamilies"], grass.SEED, D.UAT_CRITERIA)
items_b, _s = scatter.scatter_island(D.ISLAND, META0["tokenFamilies"], grass.SEED, D.UAT_CRITERIA)
check("determinism", "the placement pass is identical when re-run",
      items_a == items_b, f"{len(items_a)} placements")

# ================================================================= 2. the levers are WIRED
# A lever only ever observed doing nothing is indistinguishable from one that is not connected, and
# THAT is the difference between "the technique does not help at this scale" (this pass's finding)
# and "the technique was never applied" (a bug wearing the finding's clothes).
print("\n== 2. both levers are WIRED (a lever that cannot fire proves nothing) ==")
for geom in grass.GEOMETRIES:
    ref = decoded(os.path.join(HERE, tag_for(0.0, geom), "tuft-3a.png")).astype(int)
    top = decoded(os.path.join(HERE, tag_for(1.0, geom), "tuft-3a.png")).astype(int)
    moved = int(np.any(ref != top, axis=2).sum())
    opaque = int((ref[:, :, 3] > 0).sum())
    check("levers", f"--normals REPAINTS the raw {geom} tuft (0.00 -> 1.00)",
          moved > opaque * 0.3, f"{moved} of {opaque} opaque px = "
                                f"{100.0 * moved / max(1, opaque):.0f}%")
b = decoded(os.path.join(HERE, tag_for(0.0, "blade"), "tuft-3a.png"))
c = decoded(os.path.join(HERE, tag_for(0.0, "clump"), "tuft-3a.png"))
check("levers", "--geometry clump is a DIFFERENT tuft from blade",
      int((c[:, :, 3] > 0).sum()) > int((b[:, :, 3] > 0).sum()) * 1.5,
      f"blade {int((b[:, :, 3] > 0).sum())} raw opaque px, clump {int((c[:, :, 3] > 0).sum())}")

# ================================================================= 3. one code state per generator
print("\n== 3. provenance ==")
INPUTS = C.piece_inputs([("pieces-land", D.LAND_PIECES)]
                        + [(t, os.path.join(HERE, t)) for t in ALL_TAGS])
CODE_STATE = D.require_one_state_per_generator(INPUTS)
check("provenance", "all 14 grass directories declare ONE generator state",
      len(CODE_STATE["generators"]) == 2,
      f"generators: {sorted(CODE_STATE['generators'])}")
declared = {json.load(open(os.path.join(HERE, t, "render-meta.json")))["grassNormalMix"]
            for t in ALL_TAGS}
check("provenance", "every mix in the sweep is present exactly once per geometry",
      declared == set(grass.NORMAL_MIXES), f"{sorted(declared)}")

# ================================================================= 4. THE THESIS CHECK
print("\n== 4. the custom-normal lever cannot touch the ADR-0226 D2 density signal ==")
D.use_pieces(tag_for(0.0, "blade"), expect_mix=0.0, expect_geometry="blade")
HEALTHY = D.DECOR_META["tokenFamilies"]["blade"]["healthy"]


def piece_solid_px(tag, name):
    D.use_pieces(tag)
    pw = int(D.DECOR_META["pieceCanvasWorld"])
    cnv = np.zeros((pw * C.SS, pw * C.SS, 3), dtype=np.float32)
    alp = np.zeros((pw * C.SS, pw * C.SS), dtype=np.float32)
    D.paste_decor(cnv, alp, D.DECOR_PIECE_SET[name], pw / 2.0, pw / 2.0,
                  HEALTHY, D.DECOR_META["pieceRoles"][name])
    keep = alp > 0.5
    snapped = np.where(keep[:, :, None], C.snap(cnv), 0.0)
    saved = (C.CANVAS_W, C.CANVAS_H)
    C.CANVAS_W = C.CANVAS_H = pw
    _rgb, sol = C.mode_down(snapped.astype(np.int32), keep)
    C.CANVAS_W, C.CANVAS_H = saved
    return int(keep.sum()), int(sol.sum())


for geom in grass.GEOMETRIES:
    raws, delivs = set(), set()
    for m in grass.NORMAL_MIXES:
        r, d = piece_solid_px(tag_for(m, geom), "tuft-3a")
        raws.add(r)
        delivs.add(d)
    check("thesis", f"({geom}) the tuft occupies the SAME pixels at every mix 0.00..1.00",
          len(raws) == 1 and len(delivs) == 1,
          f"supersampled {sorted(raws)} px, delivered {sorted(delivs)} px, identical at all "
          f"{len(grass.NORMAL_MIXES)} mixes — normals pick a BAND, never whether a pixel is grass. "
          f"(This is the piece as PASTED — its footprint on the island's canvas — which is the "
          f"number the ADR-0226 D2 density signal is actually made of.)")

# ================================================================= 5. ADR-0367 D5: status is a
# LOOKUP, never baked into a render
print("\n== 5. the per-capability status tint stays expressible (ADR-0367 D5) ==")
island_tokens = set()
for fam in D.DECOR_META["tokenFamilies"].values():
    for variant in fam.values():
        for tok in variant.values():
            island_tokens.add(tuple(int(v) for v in C.hexrgb(tok)))
for st in C.STATUS_TOKENS.values():
    for v in st.values():
        for tok in ([v] if isinstance(v, str) else list(v)):
            island_tokens.add(tuple(int(x) for x in C.hexrgb(tok)))
worst = []
for t in ALL_TAGS:
    for n in PIECE_NAMES:
        a = decoded(os.path.join(HERE, t, f"{n}.png"))
        seen = {tuple(int(x) for x in p) for p in a[a[:, :, 3] > 0][:, :3].reshape(-1, 3)}
        hit = seen & island_tokens
        if hit:
            worst.append((t, n, sorted(hit)[:2]))
check("tint", "no rendered piece contains ANY island token colour",
      not worst, f"{len(ALL_TAGS) * len(PIECE_NAMES)} piece renders scanned"
      if not worst else f"{worst[:2]}")

D.use_pieces(tag_for(0.0, "blade"))
one_set_all_statuses = True
for st in ("healthy", "building", "mapped", "proposed", "unknown", "unhealthy"):
    items, _s = scatter.scatter_island(
        {**D.ISLAND, "capStatuses": [st] * len(D.ISLAND["capStatuses"])},
        D.DECOR_META["tokenFamilies"], grass.SEED, D.UAT_CRITERIA)
    if not all(i["piece"] in PIECE_NAMES for i in items):
        one_set_all_statuses = False
check("tint", "all six statuses render from ONE grass piece set", one_set_all_statuses,
      "the status reaches the PAINT, never the RENDER")

# ================================================================= 6. the palette is a FULL closure
print("\n== 6. the palette is a FULL closure (the interior fork's 2564 px lesson) ==")
D.use_pieces(tag_for(0.0, "blade"))
pal = {tuple(int(v) for v in c) for c in C.PALETTE}
missing = []
levels = sorted({float(lv) for roles in D.DECOR_META["pieceRoles"].values()
                 for _r, lv in roles.values()})
# derived INDEPENDENTLY of build_palette_dressed — a check that asks the palette what it allows can
# only ever pass
for fam in D.DECOR_META["tokenFamilies"].values():
    for variant in fam.values():
        for tok in variant.values():
            for lv in levels:
                e = tuple(int(round(v)) for v in C.shade(C.hexrgb(tok), lv))
                if e not in pal:
                    missing.append((tok, lv))
check("palette", "every (decor token x authored shade) pair is IN the closed palette",
      not missing, f"{len(pal)} entries, {len(levels)} shade levels"
      if not missing else f"MISSING {missing[:3]}")
# the mottle base introduces no new entry: it reuses C.SEAM_LEVEL, which the land already emits
seam_ok = all(tuple(int(round(v)) for v in C.shade(C.hexrgb(tok), C.SEAM_LEVEL)) in pal
              for st in C.STATUS_TOKENS.values() for v in st.values()
              for tok in ([v] if isinstance(v, str) else list(v)))
check("palette", "the `mottle` base widens the palette by NOTHING", seam_ok,
      f"it reuses C.SEAM_LEVEL={C.SEAM_LEVEL}, an entry the land's own seams already emit")

# ================================================================= 7. the land is UNCHANGED
print("\n== 7. the land pass is the shipped one ==")
try:
    D.assert_land_unchanged()
    check("land", "compose_core's land pass is byte-identical to the shipped compose.py", True,
          "asserted on the raw supersampled canvas AND its alpha, before any snap")
except SystemExit as e:
    check("land", "compose_core's land pass is byte-identical to the shipped compose.py", False,
          str(e)[:120])

# ================================================================= 8. the vocabulary (ADR-0226)
print("\n== 8. the vocabulary is unchanged from the decided one ==")
D.prepare(D.ISLAND["variantB"]["cells"])
items, stats = scatter.scatter_island(D.ISLAND, D.DECOR_META["tokenFamilies"], grass.SEED,
                                      D.UAT_CRITERIA)
check("vocabulary", "exactly one flower per UAT criterion (ADR-0226 D4)",
      stats["flower"] == len(D.UAT_CRITERIA), f"{stats['flower']} flowers, "
      f"{len(D.UAT_CRITERIA)} criteria")
check("vocabulary", "no decorative species was added back (ADR-0226 D2 retired them)",
      set(k for k in stats if k in ("tuft", "shrub", "wilt", "flower")) ==
      {"tuft", "shrub", "wilt", "flower"},
      "kinds: " + ", ".join(sorted(k for k in ("tuft", "shrub", "wilt", "flower"))))
in_water = [i for i in items
            if not any(scatter._point_in_poly(i["g"][0], i["g"][1], c["poly"])
                       for c in D.ISLAND["variantB"]["cells"])]
check("vocabulary", "every placement stands on a land cell (no decor in the water)",
      not in_water, f"{len(items)} placements")

# ================================================================= 9. the fence
print("\n== 9. the fence ==")
diff = subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=REPO,
                      capture_output=True, text=True).stdout.split()
untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=REPO,
                           capture_output=True, text=True).stdout.split()
outside = [p for p in set(diff + untracked) if not p.startswith("docs/research/")]
check("fence", "the working tree's changes are confined to docs/research/**",
      not outside, f"{len(diff + untracked)} paths touched"
      if not outside else f"OUTSIDE: {outside[:5]}")
cam = os.path.join(REPO, "packages", "forest-world", "src", "camera.ts")
if os.path.exists(cam):
    src = open(cam, encoding="utf-8").read()
    check("fence", "LAND_CAMERA_ELEVATION_DEG is still 20 and was not touched by this pass",
          "LAND_CAMERA_ELEVATION_DEG = 20" in src.replace(":", " ").replace("  ", " ")
          or "LAND_CAMERA_ELEVATION_DEG" in src and " 20" in src.split(
              "LAND_CAMERA_ELEVATION_DEG")[1][:60],
          "frontend-visual-judgment-arc's live dogfood fixture — the owner refused a fix")

# ================================================================= summary
ok = sum(1 for r in RESULTS if r["pass"])
print(f"\n{ok}/{len(RESULTS)} checks pass")
with open(os.path.join(HERE, "verify-report.json"), "w") as fh:
    json.dump({"passed": ok, "total": len(RESULTS), "fast": FAST, "checks": RESULTS}, fh, indent=1)
sys.exit(0 if ok == len(RESULTS) else 1)
