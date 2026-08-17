#!/usr/bin/env python3
"""THE FLOOR — every claim this pass makes, re-derived, plus the fence it promised to stay inside.

    python verify.py

Two of these checks matter more than the rest and both are built to FIRE rather than to pass:

  * THE INSTRUMENT IS THE COMMITTED ONE. `measure.py` copies `compose_options.py`'s delivery
    predicate rather than importing it (importing runs a 30-minute island compose). A copy that had
    drifted would silently re-scale every number in this pass, so the copy is held to PR #1389's OWN
    PUBLISHED FIGURES for the species set: same pieces, same predicate, same answers or this pass is
    wrong.
  * THE EMITTER CONTROL CAN ACTUALLY REFUSE. `use_render_emitter` is gone in Blender 5.2 and the
    Transparent BSDF substitute would fail generously — adding a disc to every hair piece. The
    control proves it worked; this file proves the control would have CAUGHT it, by running the
    refusal against a piece that does contain a disc.
"""
import hashlib
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
HIFREQ = os.path.join(REPO, "docs", "research", "chapter2-high-frequency-options-2026-08-17")
MINE = os.path.join(HERE, "pieces-greenery")

REPORT = json.load(open(os.path.join(HERE, "greenery-report.json")))
META = json.load(open(os.path.join(MINE, "render-meta.json")))
SS = int(META["supersample"])

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(f"{name}: {detail}" if detail else name)
    print(("  ok   " if cond else "  FAIL ") + name + (f"  [{detail}]" if detail else ""))


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def delivered_census(path):
    """The predicate under test — byte-identical in behaviour to `measure.py`'s."""
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    m = a > 110.0
    h, w = a.shape
    dm = (m.reshape(h // SS, SS, w // SS, SS).transpose(0, 2, 1, 3)
          .reshape(h // SS, w // SS, SS * SS).sum(axis=2) >= 5)
    if not dm.any():
        return {"deliveredPx": 0}
    ys, xs = np.nonzero(dm)
    bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return {"deliveredPx": int(dm.sum()), "bboxW": bw, "bboxH": bh, "aspect": round(bw / bh, 2)}


print("\n-- 1. THE INSTRUMENT IS THE COMMITTED ONE -----------------------------------------")
#: PR #1389 published `marks.speciesSet` for the four species. Re-derive them here. If this pass's
#: copy of the predicate has drifted, these disagree and every candidate number above is unmoored.
pub = json.load(open(os.path.join(HIFREQ, "options-report.json")))["marks"]["speciesSet"]
agree = 0
for name, want in pub.items():
    p = os.path.join(HIFREQ, "pieces-species", name + ".png")
    if not os.path.exists(p) or "deliveredPx" not in want:
        continue
    got = delivered_census(p)
    same = (got["deliveredPx"] == want["deliveredPx"]
            and got.get("bboxW") == want.get("bboxW")
            and got.get("bboxH") == want.get("bboxH"))
    check(f"predicate reproduces #1389's published {name}", same,
          f"published {want['deliveredPx']}px {want.get('bboxW')}x{want.get('bboxH')} / "
          f"got {got['deliveredPx']}px {got.get('bboxW')}x{got.get('bboxH')}")
    agree += 1 if same else 0
check("at least four published pieces were re-derived", agree >= 4, f"{agree} agreed")

print("\n-- 2. THE EMITTER CONTROL, AND THAT IT WOULD HAVE CAUGHT A FAILURE ----------------")
ctl = REPORT["candidates"]["control-emitter-only"]
check("the emitter-only control delivers ZERO", ctl["deliveredPx"] == 0,
      f"delivered {ctl['deliveredPx']}, raw {ctl['rawOpaquePx']}")
check("the control is not vacuous — it renders nothing at all, so the transparent BSDF is total",
      ctl["rawOpaquePx"] == 0, f"raw {ctl['rawOpaquePx']} px")
#: MAKE THE REFUSAL FIRE. A disc rendered with a VISIBLE material stands in for the failure mode: if
#: the transparent substitute had not worked, this is what every hair piece would have contained. The
#: guard must reject it.
probe = os.path.join(HERE, "pieces-greenery", "_refusal_probe.png")
opaque_disc = np.zeros((META["pieceCanvasPx"], META["pieceCanvasPx"], 4), dtype=np.uint8)
yy, xx = np.mgrid[0:META["pieceCanvasPx"], 0:META["pieceCanvasPx"]]
c = META["pieceCanvasPx"] / 2
disc = ((xx - c) ** 2 / (9.0 ** 2) + (yy - c) ** 2 / (4.0 ** 2)) <= 1.0
opaque_disc[disc] = (120, 160, 110, 255)
Image.fromarray(opaque_disc, "RGBA").save(probe)
probe_census = delivered_census(probe)
check("the refusal FIRES on a visible emitter disc", probe_census["deliveredPx"] > 0,
      f"a disc would have added {probe_census['deliveredPx']} delivered px — the guard rejects it")
os.remove(probe)

print("\n-- 3. THE FENCE: docs/research/** ONLY --------------------------------------------")
base = subprocess.run(["git", "merge-base", "origin/main", "HEAD"], cwd=REPO,
                      capture_output=True, text=True).stdout.strip()
diff = subprocess.run(["git", "diff", "--name-only", base], cwd=REPO,
                      capture_output=True, text=True).stdout.split()
untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=REPO,
                           capture_output=True, text=True).stdout.split()
touched = sorted(set(diff + untracked))
outside = [p for p in touched if not p.startswith("docs/research/")]
check("no file outside docs/research/** is touched", not outside, ", ".join(outside[:6]) or "clean")
check("the diff is not empty (the fence check is not vacuous)", len(touched) > 0,
      f"{len(touched)} files")

print("\n-- 4. THE THREE FILES THIS PASS PROMISED NOT TO EDIT ------------------------------")
for rel in ("docs/research/chapter2-grass-reads-as-signal-2026-08-16/blender_grass.py",
            "docs/research/chapter2-high-frequency-options-2026-08-17/blender_species.py",
            "docs/research/chapter2-grass-reads-as-signal-2026-08-16/scatter.py"):
    p = os.path.join(REPO, rel)
    if not os.path.exists(p):
        check(f"{os.path.basename(rel)} exists to be checked", False, rel)
        continue
    changed = subprocess.run(["git", "diff", "--name-only", base, "--", rel], cwd=REPO,
                             capture_output=True, text=True).stdout.strip()
    check(f"{os.path.basename(rel)} is untouched", changed == "", changed or "unchanged")

print("\n-- 5. THE APP CAMERA IS NOT MOVED -------------------------------------------------")
cam = open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts")).read()
check("LAND_CAMERA_ELEVATION_DEG is still 20",
      "LAND_CAMERA_ELEVATION_DEG = 20" in cam.replace(":", "").replace("number", ""),
      "20" if "20" in cam else "NOT 20")
check("this pass authored at the research track's 50 deg",
      abs(float(META["camera"]["elevationDeg"]) - 50.0) < 1e-9,
      f"{META['camera']['elevationDeg']} deg")

print("\n-- 6. THE PIPELINE ARITHMETIC THE WHOLE PASS RESTS ON -----------------------------")
check("one ground unit is one delivered pixel",
      abs(float(META["groundUnitsPerDeliveredPx"]) - 1.0) < 1e-9,
      str(META["groundUnitsPerDeliveredPx"]))
check("the delivered canvas is 28 px", int(META["deliveredCanvasPx"]) == 28,
      str(META["deliveredCanvasPx"]))
tut = META["hairApplied"]["hair-tutorial"]
check("the tutorial-scale strand really is sub-pixel at RENDER resolution",
      tut["strandWidthSupersampledPx"] < 1.0,
      f"{tut['strandWidthSupersampledPx']} supersampled px wide")
check("...and that is why it delivers nothing", REPORT["candidates"]["hair-tutorial"]["rawOpaquePx"] == 0,
      "zero RAW opaque px, before any downsample")

print("\n-- 7. THE FINDINGS, RE-DERIVED FROM THE REPORT ------------------------------------")
cand = REPORT["candidates"]
blade = REPORT["baselines"]["pieces-m00-blade (the WITHDRAWN long grass)"]
species = REPORT["baselines"]["pieces-species (PR #1389)"]
#: The headline: the withdrawn grass is the ONLY thing in the set the vote destroys.
blade_tufts = [v["survivalPctOfBlocks"] for k, v in blade.items() if k.startswith("tuft")]
#: `hair-sparse` IS EXCLUDED BY NAME, and the exclusion is the point rather than a loosened guard: it
#: was authored expressly to find out whether a strand gap can ever survive the vote, so it is the one
#: candidate whose LOSING is its result. An earlier draft of this check asserted over the whole set,
#: failed on that piece, and was wrong in its wording rather than in its data — recorded because the
#: tempting repair is to drop the threshold, which would also stop the check catching a real collapse.
DELIBERATELY_SPARSE = {"hair-sparse"}
others = [v["survivalPctOfBlocks"] for k, v in list(cand.items()) + list(species.items())
          if v["deliveredPx"] > 0 and k not in DELIBERATELY_SPARSE]
check("every withdrawn blade tuft loses to the downsample (<85%)", max(blade_tufts) < 85,
      f"max {max(blade_tufts)}%")
check("no mark INTENDED as a mark loses (>=94%), the sparse probe excluded by name",
      min(others) >= 94, f"min {min(others)}%")
check("the exclusion is not hiding a second loser",
      sum(1 for k, v in list(cand.items()) + list(species.items())
          if v["deliveredPx"] > 0 and v["survivalPctOfBlocks"] < 94) == 1,
      "exactly one sub-94% piece in the set, and it is the sparse probe")
#: The confound this pass closed.
check("at matched footprint hair delivers LESS than the hand-modelled dome",
      cand["hair-domesized"]["deliveredPx"] < species["tuft-3a"]["deliveredPx"],
      f"hair {cand['hair-domesized']['deliveredPx']} px vs dome "
      f"{species['tuft-3a']['deliveredPx']} px")
check("the footprint really is matched (within one delivered px on each axis)",
      abs(cand["hair-domesized"]["bboxW"] - species["tuft-3a"]["bboxW"]) <= 1
      and abs(cand["hair-domesized"]["bboxH"] - species["tuft-3a"]["bboxH"]) <= 1,
      f"hair {cand['hair-domesized']['bboxW']}x{cand['hair-domesized']['bboxH']} vs dome "
      f"{species['tuft-3a']['bboxW']}x{species['tuft-3a']['bboxH']}")
#: The three regimes.
check("dense hair is a MASS: the vote fills it (>=100%)",
      cand["hair-clumped"]["survivalPctOfBlocks"] >= 100,
      f"{cand['hair-clumped']['survivalPctOfBlocks']}%")
check("sparse hair is DEBRIS: the vote destroys it (<85%)",
      cand["hair-sparse"]["survivalPctOfBlocks"] < 85,
      f"{cand['hair-sparse']['survivalPctOfBlocks']}%")
check("geometry nodes land in the same mass regime",
      cand["geonodes-1px"]["survivalPctOfBlocks"] >= 100,
      f"{cand['geonodes-1px']['survivalPctOfBlocks']}%")
#: The control's own honesty: it is NOT a perfect identity, and the README says so.
card = REPORT["cardApplied"]["card-authored"]
check("the control is stated as generous to itself, not as an identity",
      cand["card-authored"]["deliveredPx"] > card["authoredDeliveredPx"],
      f"authored {card['authoredDeliveredPx']} px -> delivered "
      f"{cand['card-authored']['deliveredPx']} px (billboard not grid-snapped)")

print("\n-- 8. EVIDENCE HYGIENE -----------------------------------------------------------")
sheet = os.path.join(HERE, "greenery-techniques.png")
check("the sheet exists", os.path.exists(sheet))
im = Image.open(sheet)
check("the sheet is OPAQUE, never drawn on transparency", im.mode == "RGB", im.mode)
sc = os.path.join(HERE, "greenery-techniques.png.provenance.json")
check("the sheet carries a provenance sidecar", os.path.exists(sc))
if os.path.exists(sc):
    prov = json.load(open(sc))
    states = {v for v in prov["codeStates"].values()}
    check("one code state per script, all recorded", len(prov["codeStates"]) == 3,
          ",".join(sorted(prov["codeStates"])))
    live = {os.path.basename(p): sha256_file(os.path.join(HERE, os.path.basename(p)))
            for p in prov["codeStates"]}
    drift = [k for k in prov["codeStates"] if prov["codeStates"][k] != live.get(k)]
    #: ⚠ NOT a CRLF trap: these are read and hashed from the SAME checkout that wrote them. The
    #: sibling pass's `producer.sha256` mismatch came from comparing a committed CRLF hash against an
    #: LF-stored file across checkouts, which this never does.
    check("no script has changed since the sheet was drawn", not drift, ",".join(drift) or "clean")
check("the report records the sample count", int(REPORT["samples"]) == 48, str(REPORT["samples"]))

print(f"\n{len(OK)}/{len(OK) + len(FAIL)} checks passed")
if FAIL:
    print("\nFAILED:")
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("verify.py GREEN")
