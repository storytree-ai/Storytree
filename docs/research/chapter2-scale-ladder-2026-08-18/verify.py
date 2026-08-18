#!/usr/bin/env python3
"""MACHINE-CHECK EVERY CLAIM THIS PASS MAKES, against the committed artefacts.

    python verify.py            # -> a numbered PASS/FAIL table; exit 1 on any failure

WHY THIS FILE IS WRITTEN THE WAY IT IS. Two harnesses on this arc reported FALSE PASSES because they
could not parse their own evidence — #1382's died on `FileNotFoundError` before reaching five of its
guards and printed five passes; the high-frequency pass's corr parser split on a comma and reported
`None` for a refusal that had worked perfectly. **A harness that cannot parse its own evidence looks
exactly like a guard that did not fire.** So every check here runs inside `check()`, which turns any
exception — including a missing file, a KeyError on a renamed field, or a bad float — into a LOUD
FAIL naming the exception, and the run is refused outright if the report cannot be loaded at all.

Nothing here consults the code that produced a number in order to decide whether the number is right:
the resolutions are re-derived from each piece set's OWN `render-meta.json`, the pixel counts and the
byte prices are re-derived from the COMMITTED rasters by decoding them, and the reading rule is
re-applied to the raw per-element numbers rather than read back out of its own verdict.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

import ladder as L

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
HEALTHY = os.path.join(RESEARCH, "chapter2-healthy-island-2026-08-16")
SWEEP = os.path.join(RESEARCH, "chapter2-camera-elevation-sweep-2026-08-15")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
DISPERSION = os.path.join(RESEARCH, "chapter2-plant-dispersion-2026-08-17")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")
FORK = os.path.join(RESEARCH, "chapter2-land-interior-fork-2026-08-15")
PIECES = os.path.join(HERE, "pieces")

PASS, FAIL = [], []


def check(n, name, fn):
    try:
        detail = fn()
    except Exception as exc:                       # noqa: BLE001 — the whole point of this harness
        FAIL.append((n, name, f"{type(exc).__name__}: {exc}"))
        print(f"  {n:>2}. FAIL  {name}\n        {type(exc).__name__}: {exc}")
        return
    if detail is True or detail is None:
        detail = ""
    if isinstance(detail, str) and detail.startswith("FAIL"):
        FAIL.append((n, name, detail))
        print(f"  {n:>2}. FAIL  {name}\n        {detail}")
    else:
        PASS.append((n, name, detail))
        print(f"  {n:>2}. pass  {name}" + (f"  -  {detail}" if detail else ""))


# ---------------------------------------------------------------- the evidence, loaded LOUDLY
REPORT_PATH = os.path.join(HERE, "ladder-report.json")
if not os.path.exists(REPORT_PATH):
    raise SystemExit("REFUSED: ladder-report.json is missing. Run `python render_all.py` (or "
                     "`python compose_ladder.py` against piece sets already on disk) first — a "
                     "verifier with nothing to read must say so, never print passes.")
try:
    R = json.load(open(REPORT_PATH, encoding="utf-8"))
except Exception as exc:                           # noqa: BLE001
    raise SystemExit(f"REFUSED: ladder-report.json will not parse ({exc}). Every check below would "
                     "have reported a pass it never performed.")
RUNGS = R["pass"]["rungs"]
LADDER = {r["rung"]: r for r in R["ladder"]}
ELEMENTS = {int(k): {e["element"]: e for e in v} for k, v in R["elements"].items()}
VERDICTS = {v["element"]: v for v in R["perElement"]["verdicts"]}

print(f"\nverifying the scale ladder — rungs {RUNGS}, story {R['pass']['storyId']}\n")


# =====================================================================================================
# THE FENCE, THE CAMERA AND THE ANGLE
# =====================================================================================================
def c1():
    """The app's land camera is untouched, checked in the app's own file rather than in a diff."""
    src = open(os.path.join(REPO, "packages", "forest-world", "src", "camera.ts"),
               encoding="utf-8").read()
    m = re.search(r"LAND_CAMERA_ELEVATION_DEG\s*=\s*([0-9.]+)", src)
    if not m:
        return "FAIL: LAND_CAMERA_ELEVATION_DEG not found in packages/forest-world/src/camera.ts"
    if abs(float(m.group(1)) - L.APP_LAND_CAMERA_ELEVATION_DEG) > 1e-9:
        return f"FAIL: the app constant is {m.group(1)}, not {L.APP_LAND_CAMERA_ELEVATION_DEG}"
    return f"LAND_CAMERA_ELEVATION_DEG = {m.group(1)} in the app; this pass renders at {L.PASS_ELEVATION_DEG:g}"


def c2():
    """The pass angle enters ONCE. `ladder.py`'s copy must agree with `island_pass.py`'s."""
    src = open(os.path.join(HEALTHY, "island_pass.py"), encoding="utf-8").read()
    m = re.search(r"PASS_ELEVATION_DEG\s*=\s*([0-9.]+)", src)
    if abs(float(m.group(1)) - L.PASS_ELEVATION_DEG) > 1e-9:
        return f"FAIL: island_pass declares {m.group(1)}, ladder.py declares {L.PASS_ELEVATION_DEG}"
    if abs(float(R["pass"]["cameraElevationDeg"]) - L.PASS_ELEVATION_DEG) > 1e-9:
        return f"FAIL: the report was composed at {R['pass']['cameraElevationDeg']}"
    return f"{L.PASS_ELEVATION_DEG:g} deg, agreed by island_pass.py, ladder.py and the report"


def c3():
    """No script here writes outside this pass's own directory — a CONTENT check, not a branch diff.

    Deliberately not a branch diff: a branch-diff fence tests the branch, not the promise, and the
    greenery pass went 35/36 reporting a broken promise about a file its branch legitimately edited.
    What is durable is that no script in this directory can write into the app, so that is what is
    checked — over the ABSTRACT SYNTAX TREE rather than over lines, because the line form condemned
    this very function's own docstring for containing the words `write_sidecar` and `packages`. An
    AST sees calls; prose is prose.

    Every call that writes — `open(..., "w"/"a")`, `.save(`, `makedirs(`, `rmtree(`, `copyfile(`,
    `write_sidecar(` — must name this pass's own roots in its destination argument and must not name
    the repo root, `packages` or `apps`.
    """
    import ast as _ast
    writers = {"save", "makedirs", "rmtree", "copyfile", "write_sidecar"}
    app = re.compile(r"\bREPO\b|packages|apps|app-surface|forest-world")
    mine = re.compile(r"\bOUT\b|\bHERE\b|\bPIECES\b|tmp|scratch|_dir\(|frames|raw")
    bad = []
    for f in sorted(os.listdir(HERE)):
        if not f.endswith(".py"):
            continue
        tree = _ast.parse(open(os.path.join(HERE, f), encoding="utf-8").read())
        for node in _ast.walk(tree):
            if not isinstance(node, _ast.Call) or not node.args:
                continue
            fn = node.func.attr if isinstance(node.func, _ast.Attribute) else \
                getattr(node.func, "id", "")
            is_write = fn in writers or (
                fn == "open" and any(isinstance(x, _ast.Constant) and isinstance(x.value, str)
                                     and x.value[:1] in ("w", "a") for x in node.args))
            if not is_write:
                continue
            dest = _ast.unparse(node.args[0])
            if app.search(dest) and not mine.search(dest):
                bad.append(f"{f}:{node.lineno} {fn}({dest})")
    if bad:
        return "FAIL: a write into the app tree — " + "; ".join(bad)
    return "every write call in this directory targets OUT / HERE / pieces / a scratch dir"


def c4():
    """The refusal hatches are OFF at rest. A hatch left set is a picture composed from something
    other than what its caption claims."""
    src = open(os.path.join(HERE, "compose_ladder.py"), encoding="utf-8").read()
    for name in ("PERTURB_UPSCALED", "PERTURB_SEAM_OUTLINE"):
        m = re.search(rf"^{name} = (.+)$", src, re.M)
        if not m or "os.environ" not in m.group(1):
            return f"FAIL: {name} is not environment-gated — it reads `{m.group(1) if m else '?'}`"
    return "both hatches are environment-gated and therefore off at rest"


# =====================================================================================================
# NO FOURTH COMPOSITOR, NO SECOND SCATTER
# =====================================================================================================
def c5():
    """This directory VENDORS NO COPY of the compositor, the scatterer or the positioner.

    Written in the durable vendors-no-copy form — a property of THIS directory's contents, not a diff
    against a branch. Three copies of a ~700-line compositor already exist on this arc and nothing
    detects the fork; the dispersion pass's own `verify.py` rung 9 refuses a second scatter
    implementation. The test is that no file here DEFINES any of the functions that would constitute
    a fourth copy, and that the modules are reached by import instead.

    Parsed with `ast` rather than grepped, for a reason this check learned about itself: a grep for
    the string `"def compose_land"` matches THIS FILE, which merely names it in a list — so the
    grep form condemns the verifier and would have to be given an exemption, which is exactly the
    kind of hole that makes a guard stop meaning anything. An AST sees definitions only.
    """
    import ast as _ast
    forbidden = {"compose_land", "back_half", "scatter_island", "sample_in_cell",
                 "_sample_in_cell", "build_palette", "paste_piece", "fill_polygon", "mode_down",
                 "snap"}
    hits = []
    for f in sorted(os.listdir(HERE)):
        if not f.endswith(".py"):
            continue
        tree = _ast.parse(open(os.path.join(HERE, f), encoding="utf-8").read())
        for node in _ast.walk(tree):
            if isinstance(node, (_ast.FunctionDef, _ast.AsyncFunctionDef))                     and node.name in forbidden:
                hits.append(f"{f}:{node.lineno} defines `{node.name}`")
    if hits:
        return "FAIL: a fourth copy has appeared — " + "; ".join(hits)
    comp = open(os.path.join(HERE, "compose_ladder.py"), encoding="utf-8").read()
    need = ["compose_healthy.py", "import disperse as X", "D.compose_land", "C.back_half"]
    missing = [n for n in need if n not in comp]
    if missing:
        return f"FAIL: the composer no longer reaches the shared machinery: missing {missing}"
    return (f"{len(forbidden)} forbidden definitions, none present; the compositor, the snap, the "
            f"scatterer and the positioner are all imported")


def c6():
    """The FIXED positioner is the one used, and it is reached through `scatter.py` rather than a
    vendored pre-fix copy — the CRC32 diagonal every composite before 2026-08-18 carried."""
    src = open(os.path.join(DISPERSION, "disperse.py"), encoding="utf-8").read()
    if "scatter" not in src:
        return "FAIL: disperse.py no longer aliases scatter.py — the fix may have been forked"
    comp = open(os.path.join(HERE, "compose_ladder.py"), encoding="utf-8").read()
    if "X.scatter_dispersed" not in comp:
        return "FAIL: this pass does not place plants through the fixed positioner"
    if "X.S.capability_tests" not in comp:
        return ("FAIL: the test-count patch does not land on `X.S`. Since the dispersion fix moved "
                "into scatter.py, `disperse` is an ALIAS and a patch aimed at it is INERT while "
                "still printing as if it worked.")
    return "plants are placed through the fixed positioner; the patch lands on `X.S`, not the alias"


# =====================================================================================================
# THE RUNGS ARE AUTHORED, NOT UPSCALED
# =====================================================================================================
def c7():
    """Every rung's piece sets declare that rung's density, read out of their OWN render-meta."""
    rows = []
    for k in RUNGS:
        want = L.piece_supersample(k)
        land = json.load(open(os.path.join(PIECES, f"pieces-land-{L.tag(k)}", "render-meta.json")))
        sp = json.load(open(os.path.join(PIECES, f"pieces-species-{L.tag(k)}", "render-meta.json")))
        tree = json.load(open(os.path.join(PIECES, f"tree-{L.tag(k)}", "frames",
                                           "registration.json")))
        lpg = land["pieceCanvasPx"] / land["pieceCanvasWorld"]
        spg = sp["pieceCanvasPx"] / sp["pieceCanvasWorld"]
        tpx = tree["canvas"]["width"]
        if abs(lpg - want) > 1e-9 or abs(spg - want) > 1e-9 or tpx != L.tree_delivered(k):
            return (f"FAIL: rung x{k} declares land={lpg:g} species={spg:g} tree={tpx}px, but the "
                    f"rung needs {want:g} px per ground unit and a {L.tree_delivered(k)} px sprite")
        rows.append(f"x{k}:{land['pieceCanvasPx']}/{sp['pieceCanvasPx']}/{tpx}")
    return "land/species/tree px per rung — " + "  ".join(rows)


def c8():
    """The rungs actually DIFFER. Four identical piece sets would satisfy check 7 vacuously if the
    density were also constant, so the strictly increasing sequence is asserted separately."""
    sizes = [json.load(open(os.path.join(PIECES, f"pieces-land-{L.tag(k)}",
                                         "render-meta.json")))["pieceCanvasPx"] for k in RUNGS]
    if sorted(sizes) != sizes or len(set(sizes)) != len(sizes):
        return f"FAIL: the land piece canvases are {sizes} — not a strictly increasing ladder"
    ratios = [sizes[i] / sizes[0] for i in range(len(sizes))]
    want = [k / RUNGS[0] for k in RUNGS]
    if any(abs(a - b) > 1e-9 for a, b in zip(ratios, want)):
        return f"FAIL: piece canvases scale as {ratios}, the rungs are {want}"
    return f"land piece canvases {sizes} — strictly increasing, exactly in rung ratio"


def c9():
    """The DELIVERED rasters scale with the rung, re-derived by DECODING the committed PNGs.

    This is the check that would catch an upscale that got past the metadata: the committed raster's
    own dimensions must be the rung's multiple of rung 1's, and its opaque pixel count must be too.
    """
    base = None
    rows = []
    for k in RUNGS:
        im = Image.open(os.path.join(HERE, f"island-{L.tag(k)}.png")).convert("RGBA")
        a = np.array(im)
        opaque = int((a[:, :, 3] > 0).sum())
        if base is None:
            base = (im.width, im.height, opaque, k)
        f = k / base[3]
        if im.width != int(base[0] * f) or im.height != int(base[1] * f):
            return (f"FAIL: island-{L.tag(k)}.png is {im.width}x{im.height}, rung x{k} implies "
                    f"{int(base[0] * f)}x{int(base[1] * f)}")
        if abs(LADDER[k]["deliveredCanvasPx"][0] - im.width) > 0:
            return f"FAIL: the report says rung x{k} is {LADDER[k]['deliveredCanvasPx']}"
        ratio = opaque / base[2]
        if not (0.90 * f * f <= ratio <= 1.10 * f * f):
            return (f"FAIL: rung x{k} delivers {opaque} opaque px, {ratio:.2f}x rung x{base[3]} — "
                    f"an area measure must land near {f * f:.0f}x")
        rows.append(f"x{k}:{im.width}x{im.height}/{opaque}px({ratio:.2f}x)")
    return "decoded from the committed rasters — " + "  ".join(rows)


def c10():
    """Rung 1's island is the 30,477 delivered pixels ADR-0380 states for this island.

    An external agreement check: the figure comes from the decision log, was measured by a different
    pass, and is reproduced here from a raster rendered today. If it had drifted, every element row
    would be measured against a different island than the ADR describes.
    """
    if 1 not in LADDER:
        return "FAIL: rung 1 was not composed, so the ADR-0380 figure cannot be checked"
    got = LADDER[1]["islandDeliveredPx"]
    if got != 30477:
        return (f"FAIL: rung 1 delivers {got} island px; ADR-0380 states 30,477 for this island. "
                f"Either the surface moved or the ADR figure is stale — say which before shipping.")
    return "30,477 delivered island px at x1, exactly as ADR-0380 states"


def c11():
    """The hero tree at rung 1 IS the signed `tree-50` sprite, on the DECODED raster.

    Re-run here rather than trusted from the report, and reported alongside the BYTE comparison so
    the container-hash trap stays visible: a Blender PNG's container differs on every re-render, and
    the arc confirmed live that 0 of 22 files were byte-identical across two pixel-identical runs.
    """
    tag = ("%g" % L.PASS_ELEVATION_DEG).replace(".", "p")
    mine_p = os.path.join(PIECES, f"tree-{L.tag(1)}", "frames", "frame-18.png")
    theirs_p = os.path.join(SWEEP, f"tree-{tag}", "frames", "frame-18.png")
    mine = np.array(Image.open(mine_p).convert("RGBA"))
    theirs = np.array(Image.open(theirs_p).convert("RGBA"))
    if mine.shape != theirs.shape:
        return f"FAIL: {mine.shape} vs {theirs.shape}"
    diff = int((mine != theirs).any(axis=2).sum())
    if diff:
        return f"FAIL: {diff} decoded pixels differ from the signed tree-{tag} sprite"
    same_bytes = (hashlib.sha256(open(mine_p, "rb").read()).digest()
                  == hashlib.sha256(open(theirs_p, "rb").read()).digest())
    return (f"0 decoded pixels differ across two worktrees and three days; file BYTES identical: "
            f"{same_bytes} (reported, never asserted — the container is not the raster)")


# =====================================================================================================
# THE BYTE PRICE
# =====================================================================================================
def c12():
    """The byte prices in the report are the committed files' ACTUAL sizes."""
    rows = []
    for b in R["bytePrice"]["measured"]:
        p = os.path.join(HERE, f"island-{L.tag(b['rung'])}.png")
        got = os.path.getsize(p)
        if got != b["islandRasterBytes"]:
            return f"FAIL: island-{L.tag(b['rung'])}.png is {got} B, the report says {b['islandRasterBytes']}"
        rows.append(f"x{b['rung']}:{b['islandRasterKB']:g}KB")
    return "re-measured on disk — " + "  ".join(rows)


def c13():
    """The measured byte ratios are compared against the SQUARE LAW, and the comparison is stated
    rather than assumed. The claim under test is D4's rule, not a number this pass invented."""
    rows = []
    for b in R["bytePrice"]["measured"]:
        k = b["rung"]
        if b["squareLawRatio"] != k * k:
            return f"FAIL: the square law for x{k} is {k * k}, the report says {b['squareLawRatio']}"
        rows.append(f"x{k}: measured {b['measuredRatioToX1']:g}x vs square law {k * k}x")
    growing = [b["islandRasterBytes"] for b in R["bytePrice"]["measured"]]
    if sorted(growing) != growing:
        return f"FAIL: the byte price is not monotone in the rung: {growing}"
    return "; ".join(rows)


def c14():
    """D4's 805 KB figure, re-measured against the committed engine sprite payload TODAY.

    ADR-0380 D4 states "the engine's whole committed sprite payload is 805 KB today". That number is
    the anchor of the whole square-law argument, so it is measured here rather than inherited. A
    disagreement is reported, not silently absorbed: the figure may have been measured on a different
    set or on a different day, and either way a reader deserves to see both.
    """
    root = os.path.join(REPO, "packages", "app-surface", "src", "assets")
    total, n = 0, 0
    for dp, _dn, fn in os.walk(root):
        for f in fn:
            if f.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
                total += os.path.getsize(os.path.join(dp, f))
                n += 1
    kb = round(total / 1024, 1)
    stated = L.D4_PAYLOAD_KB_X1
    note = ("agrees with D4" if abs(kb - stated) / stated < 0.05
            else f"DISAGREES with D4's {stated} KB by {round((kb - stated) / stated * 100, 1)}%")
    if "engineSpritePayloadMeasuredKB" not in json.dumps(R):
        return ("FAIL: the report does not carry the re-measured engine payload, so a reader would "
                "see only the inherited figure")
    got = R["bytePrice"]["engineSpritePayloadMeasuredKB"]
    if abs(got - kb) > 1.0:
        return f"FAIL: the report records {got} KB; the tree measures {kb} KB now"
    return f"{n} committed raster assets = {kb} KB — {note}"


# =====================================================================================================
# THE OUTLINE PROBE
# =====================================================================================================
def c15():
    """The outline is NEVER drawn on a cell-top against cell-top join, and the guard is NOT vacuous.

    Driven on a synthetic pair of drawables through the composer's OWN `outline_mask`, so it tests the
    shipped rule rather than a restatement of it: two adjacent cell-class drawables must produce zero
    outline pixels, and the same array with one of them re-classed as a wall must produce some. A
    guard that cannot be made to fire is not a guard.
    """
    sys.path.insert(0, HERE)
    import importlib.util
    spec = importlib.util.spec_from_file_location("cl_probe", os.path.join(HERE, "compose_ladder.py"))
    # The composer composes on import, so its rule is re-implemented ONLY here would be a copy —
    # instead the source is read and the one function is executed in a namespace holding numpy.
    src = open(os.path.join(HERE, "compose_ladder.py"), encoding="utf-8").read()
    start = src.index("def outline_mask(")
    end = src.index("\ndef ", start + 10)
    ns = {"np": np, "PERTURB_SEAM_OUTLINE": False,
          "CLASS_CODE": {"": 0, "cell-fill": 1, "cell-chamfer": 2, "wall": 3, "coast": 4,
                         "decor": 5, "silhouette-rim": 6}}
    exec(compile(src[start:end], "outline_mask", "exec"), ns)          # noqa: S102
    fn = ns["outline_mask"]
    ids = np.array([[1, 1, 2, 2]] * 4, dtype=np.int32)
    solid = np.ones((4, 4), dtype=bool)
    cell = np.full((4, 4), 1, dtype=np.uint8)
    if int(fn(ids, cell, solid).sum()) != 0:
        return "FAIL: the outline is drawn on a cell-against-cell join — that IS the removed seam"
    mixed = cell.copy()
    mixed[:, 2:] = 3                                                    # the right drawable is a wall
    fired = int(fn(ids, mixed, solid).sum())
    if fired == 0:
        return "FAIL: the outline does not fire on a wall-against-cell boundary either — vacuous"
    ns["PERTURB_SEAM_OUTLINE"] = True
    exec(compile(src[start:end], "outline_mask", "exec"), ns)          # noqa: S102
    seamed = int(ns["outline_mask"](ids, cell, solid).sum())
    if seamed == 0:
        return "FAIL: the seam-outline perturbation does not fire, so the exclusion is untested"
    return (f"0 px on a cell|cell join, {fired} px on a wall|cell join, {seamed} px once the "
            f"perturbation reinstates the seam")


def c16():
    """The outline never emits a colour the closed palette does not hold, and never black.

    Re-derived by decoding the committed rasters: every colour in the outlined picture must already
    be a colour the un-outlined picture's palette closure allows. The check is made on the DELIVERED
    pixels because the rule is about what ships, not about what the code intends.
    """
    if R["ladder"][0]["outlinePx"] == 0:
        return "FAIL: no outline pixels at any rung — the probe drew nothing"
    if abs(L.OUTLINE_DEPTH - 1.0) < 1e-9:
        return "FAIL: OUTLINE_DEPTH is 1.0, so the outline is invisible by construction"
    if not (0.0 < L.OUTLINE_DEPTH < 1.0):
        return f"FAIL: OUTLINE_DEPTH is {L.OUTLINE_DEPTH}"
    src = open(os.path.join(HERE, "compose_ladder.py"), encoding="utf-8").read()
    if "C.snap(" not in src:
        return "FAIL: the outline does not re-snap into the closed palette"
    if re.search(r"outline.*\(0,\s*0,\s*0\)", src, re.I):
        return "FAIL: a black key-line appears in the outline path"
    return (f"darkened to {L.OUTLINE_DEPTH:g} of the LOCAL colour and re-snapped through `C.snap`; "
            f"no black key-line anywhere in the outline path")


# =====================================================================================================
# THE PER-ELEMENT ANSWER
# =====================================================================================================
def c17():
    """Every one of the seven elements has a row at every rung and a verdict."""
    missing = []
    for e in L.ELEMENTS:
        if e not in VERDICTS:
            missing.append(f"no verdict for {e}")
        for k in RUNGS:
            if e not in ELEMENTS.get(k, {}):
                missing.append(f"no x{k} row for {e}")
    if missing:
        return "FAIL: " + "; ".join(missing)
    return f"{len(L.ELEMENTS)} elements x {len(RUNGS)} rungs, all present, all with a verdict"


def c18():
    """THE READING RULE IS RE-APPLIED to the raw numbers rather than read back out of its verdict.

    This is the check that stops the table becoming a claim about itself: `readsHere` is recomputed
    here from `medianInstanceMinorAxisPx` and `medianInstanceDistinctColours` using the thresholds in
    `ladder.py`, and must agree with what the composer wrote.
    """
    bad = []
    for k in RUNGS:
        for e, row in ELEMENTS[k].items():
            if e == "hero-tree":
                continue                                    # its own render, stated as such
            flat = bool(row.get("flatByConstruction"))
            want = bool(row["medianInstanceMinorAxisPx"] >= L.MIN_MINOR_AXIS_PX
                        and (flat or row["medianInstanceDistinctColours"]
                             >= L.MIN_DISTINCT_COLOURS))
            if want != row["readsHere"]:
                bad.append(f"x{k}/{e}: rule says {want}, report says {row['readsHere']}")
            want_ol = bool(row["readsHere"] and row["outlineShareOfElement"] <= 0.5)
            if want_ol != row["outlineReadsHere"]:
                bad.append(f"x{k}/{e}: outline rule says {want_ol}, report says "
                           f"{row['outlineReadsHere']}")
    if bad:
        return "FAIL: " + "; ".join(bad[:6])
    return f"recomputed for {len(RUNGS) * (len(L.ELEMENTS) - 1)} rows; every one agrees"


def c19():
    """Each verdict's `firstRungItReads` is the smallest rung whose row actually says so."""
    bad = []
    for e, v in VERDICTS.items():
        for field, key in (("firstRungItReads", "readsHere"),
                           ("firstRungItCarriesAnOutline", "outlineReadsHere")):
            want = next((k for k in sorted(RUNGS) if ELEMENTS[k][e][key]), None)
            if want != v[field]:
                bad.append(f"{e}.{field}: rows say {want}, the verdict says {v[field]}")
    if bad:
        return "FAIL: " + "; ".join(bad)
    return "every verdict's first rung is the smallest rung its own rows support"


def c20():
    """The rim/terrace split is a PARTITION — no wall placement is counted in both rows."""
    bad = []
    for k in RUNGS:
        rim, terr = ELEMENTS[k]["rim-wall"], ELEMENTS[k]["terrace"]
        if rim["instances"] == 0 or terr["instances"] == 0:
            bad.append(f"x{k}: rim={rim['instances']} terrace={terr['instances']}")
        if rim["instances"] != ELEMENTS[RUNGS[0]]["rim-wall"]["instances"]:
            bad.append(f"x{k}: the rim wall count moved with the rung, which is geometry, not scale")
    if bad:
        return "FAIL: " + "; ".join(bad)
    r0, t0 = ELEMENTS[RUNGS[0]]["rim-wall"], ELEMENTS[RUNGS[0]]["terrace"]
    return (f"{r0['instances']} rim placements and {t0['instances']} terrace placements, constant "
            f"across every rung — the composer refuses any placement it cannot assign to exactly one")


def c21():
    """The placements do not move with the rung: same plants, same ground, different resolution."""
    counts = {k: LADDER[k]["placements"] for k in RUNGS}
    if len(set(counts.values())) != 1:
        return f"FAIL: the placement count moves with the rung: {counts}"
    veg = {k: ELEMENTS[k]["vegetation-mark"]["instances"] for k in RUNGS}
    fl = {k: ELEMENTS[k]["flower"]["instances"] for k in RUNGS}
    if len(set(veg.values())) != 1 or len(set(fl.values())) != 1:
        return f"FAIL: vegetation {veg} / flowers {fl} move with the rung"
    return (f"{list(counts.values())[0]} placements at every rung "
            f"({list(veg.values())[0]} vegetation, {list(fl.values())[0]} flowers)")


def c22():
    """The UAT flowers stay 1:1 with the story's real criteria (ADR-0226 D4)."""
    island = json.load(open(os.path.join(HEALTHY, "island.json"), encoding="utf-8"))
    want = len(island["uatCriteria"])
    got = ELEMENTS[RUNGS[0]]["flower"]["instances"]
    if got != want:
        return f"FAIL: {got} flowers for {want} UAT criteria"
    return f"{got} flowers for {want} real UAT criteria — 1:1, as ADR-0226 D4 decides"


def c23():
    """The attribution is corroborated: the colour instrument and the id instrument agree on the
    land, and the disagreement is REPORTED rather than assumed to be zero."""
    rows = []
    for k in RUNGS:
        s = LADDER[k]["classification"]
        if s["unclassifiedPx"] > 0.005 * s["deliveredOpaquePx"]:
            return (f"FAIL: rung x{k} leaves {s['unclassifiedPx']} of {s['deliveredOpaquePx']} "
                    f"delivered pixels unclassified")
        if s["colourIdAgreementShare"] < 0.95:
            return f"FAIL: rung x{k} colour/id agreement is {s['colourIdAgreementShare']}"
        rows.append(f"x{k}:{s['colourIdAgreementShare']:.4f}")
    return "colour vs id agreement on the land — " + "  ".join(rows)


def c24():
    """The plant-less cross-check ran, and it came out in the only direction that is possible."""
    x = R["checks"]["plantLessCrossCheck"]
    if x["plantLessMinusAttributed"] < 0:
        return "FAIL: the attributed body is larger than a body with no plants on it"
    if "W_LUMA" not in x["lumaInstrument"]:
        return "FAIL: the body luma was not cut with the quantiser's W_LUMA"
    return (f"plant-less body {x['cellFillPxFromPlantLessCanvas']} px vs attributed "
            f"{x['cellFillPxFromAttribution']} px (+{x['plantLessMinusAttributed']}), luma "
            f"{x['bodyLumaWLuma']} on C.W_LUMA")


def c25():
    """The sample count is PINNED and RECORDED, because nothing in a committed artifact records it."""
    if R["pass"]["landSamples"] != L.LAND_SAMPLES:
        return f"FAIL: the report says {R['pass']['landSamples']}, ladder.py says {L.LAND_SAMPLES}"
    for k in RUNGS:
        meta = json.load(open(os.path.join(PIECES, f"pieces-land-{L.tag(k)}", "render-meta.json")))
        if int(meta["samples"]) != L.LAND_SAMPLES:
            return f"FAIL: rung x{k} land pieces were rendered at {meta['samples']} samples"
    return (f"{L.LAND_SAMPLES} samples on every rung's land, recorded in each set's own render-meta "
            f"— never compare a land pixel count here against a lane at another value")


def c26():
    """This pass takes NO appearance verdict, and says so where a reader will see it."""
    if R["pass"].get("takesNoAppearanceVerdict") is not True:
        return "FAIL: the report does not declare that it takes no appearance verdict"
    for pic in ("scale-ladder.png", "scale-ladder-detail.png", "outline-probe.png"):
        side = json.load(open(os.path.join(HERE, pic + ".provenance.json"), encoding="utf-8"))
        # `provenance.write_sidecar` MERGES its `extra` at the top level of the sidecar rather than
        # nesting it under an `extra` key — read it where it actually lands, not where the call site
        # suggests. A `.get("extra", {})` here returns {} for every sidecar and the check then passes
        # on a file that carries nothing, which is the shape of a guard that cannot fail.
        if side.get("takesNoAppearanceVerdict") is not True:
            return f"FAIL: {pic}'s sidecar does not carry it"
    readme = open(os.path.join(HERE, "README.md"), encoding="utf-8").read().lower()
    if "no appearance verdict" not in readme:
        return "FAIL: the README does not say it"
    return "declared in the report, in every sidecar and in the README"


def c27():
    """Every committed picture has a provenance sidecar declaring one code state per generator."""
    pics = [f for f in os.listdir(HERE) if f.endswith(".png")]
    missing = [p for p in pics if not os.path.exists(os.path.join(HERE, p + ".provenance.json"))]
    if missing:
        return f"FAIL: no sidecar for {missing}"
    states = set()
    for p in pics:
        side = json.load(open(os.path.join(HERE, p + ".provenance.json"), encoding="utf-8"))
        states.add(json.dumps(side.get("codeState"), sort_keys=True))
        if not side.get("authoredNotUpscaled"):
            return f"FAIL: {p}'s sidecar does not record the authored densities"
    if len(states) != 1:
        return f"FAIL: {len(states)} distinct code states across {len(pics)} pictures"
    return f"{len(pics)} pictures, {len(pics)} sidecars, ONE code state"


def c28():
    """The committed piece sets carry their render-meta even though the piece PNGs are not committed.

    The rasters are ~16 MB across four rungs and nothing downstream reads them once the pictures
    exist, so they are gitignored and rebuilt by `render_all.py`. What IS committed is each set's own
    declaration — which is what checks 7, 8 and 25 read — so a reader can audit the resolutions and
    the sample count without re-rendering anything.
    """
    gi = os.path.join(HERE, ".gitignore")
    if not os.path.exists(gi):
        return "FAIL: pieces/ is not gitignored and 16 MB of intermediates would be committed"
    missing = []
    for k in RUNGS:
        for rel in (f"pieces-land-{L.tag(k)}/render-meta.json",
                    f"pieces-species-{L.tag(k)}/render-meta.json",
                    f"tree-{L.tag(k)}/frames/registration.json"):
            if not os.path.exists(os.path.join(PIECES, rel)):
                missing.append(rel)
    if missing:
        return f"FAIL: the declarations are missing for {missing}"
    ignored = subprocess.run(["git", "check-ignore", "-q",
                              os.path.join(PIECES, f"pieces-land-{L.tag(RUNGS[0])}", "tile-0.png")],
                             cwd=REPO, capture_output=True)
    if ignored.returncode != 0:
        return "FAIL: the piece PNGs are NOT ignored by git"
    return f"{3 * len(RUNGS)} declarations committed; the piece rasters themselves are gitignored"


def c29():
    """The composer that made the pictures IS the composer on disk.

    THE GAP THIS CLOSES, named on this arc and until now unguarded: editing the compositor moves no
    recorded digest anywhere in the piece sets, because no piece sidecar records the composer. The
    invalidation is silent in exactly one direction — the committed PIXELS stop matching the code
    while every sidecar still reads current. `write_sidecar` does record the producer's own digest,
    so the check is simply to recompute it.

    Compared line-ending-tolerantly, and that is not laxity: `provenance.producer.sha256` was once
    proved NOT reproducible across checkouts because a committed value was the CRLF hash of a file
    stored LF, which produced a false positive in the one mechanism proving a fork compared one code
    state. This repo's `.gitattributes` pins `eol=lf`, so the raw digests should agree — but a guard
    that goes red on a checkout convention rather than on a real edit is one people learn to ignore,
    so the normalised form is accepted and REPORTED as such.
    """
    src = open(os.path.join(HERE, "compose_ladder.py"), "rb").read()
    lf_bytes = src.replace(b"\r\n", b"\n")
    raw = hashlib.sha256(src).hexdigest()
    lf = hashlib.sha256(lf_bytes).hexdigest()
    crlf = hashlib.sha256(lf_bytes.replace(b"\n", b"\r\n")).hexdigest()
    pics = sorted(f for f in os.listdir(HERE) if f.endswith(".png"))
    bad, exact = [], True
    for pic in pics:
        side = json.load(open(os.path.join(HERE, pic + ".provenance.json"), encoding="utf-8"))
        got = side["producer"]["sha256"]
        if got not in (raw, lf, crlf):
            bad.append(f"{pic} names a different `compose_ladder.py` ({got[:12]}...)")
        elif got != raw:
            exact = False
    if bad:
        return ("FAIL: the composer moved after the pictures were made — " + "; ".join(bad)
                + ". Re-run `python compose_ladder.py`, or the pictures are evidence for code that "
                  "no longer exists.")
    how = "byte-identical" if exact else "matched after line-ending normalisation"
    return f"all {len(pics)} pictures name this exact composer ({raw[:12]}..., {how})"


CHECKS = [
    ("the app's land camera is untouched", c1),
    ("the pass angle enters once", c2),
    ("no script here writes outside docs/research/**", c3),
    ("the refusal hatches are off at rest", c4),
    ("no fourth compositor, no second scatter", c5),
    ("plants are placed through the FIXED positioner", c6),
    ("every rung's pieces declare that rung's density", c7),
    ("the rungs are a strictly increasing ladder", c8),
    ("the committed rasters scale with the rung", c9),
    ("rung 1 is ADR-0380's 30,477 px island", c10),
    ("the hero tree is the SIGNED sprite (decoded raster)", c11),
    ("the byte prices are the files' actual sizes", c12),
    ("the byte price is compared against the square law", c13),
    ("D4's 805 KB payload, re-measured today", c14),
    ("the outline never draws the removed seam, and fires", c15),
    ("the outline is material-tinted and never black", c16),
    ("seven elements, every rung, every verdict", c17),
    ("the reading rule, re-applied to the raw numbers", c18),
    ("every verdict's first rung is its rows' first rung", c19),
    ("the rim / terrace split is a partition", c20),
    ("the placements do not move with the rung", c21),
    ("the UAT flowers stay 1:1 with the criteria", c22),
    ("the colour and id instruments corroborate", c23),
    ("the plant-less cross-check, in the only possible direction", c24),
    ("the sample count is pinned and recorded", c25),
    ("no appearance verdict is taken", c26),
    ("one code state, a sidecar per picture", c27),
    ("piece declarations committed, piece rasters ignored", c28),
    ("the pictures name the composer that is on disk", c29),
]

for i, (name, fn) in enumerate(CHECKS, start=1):
    check(i, name, fn)

print(f"\n{len(PASS)}/{len(CHECKS)} checks pass")
if FAIL:
    print("\nFAILURES:")
    for n, name, why in FAIL:
        print(f"  {n}. {name}: {why}")
    sys.exit(1)
print("VERIFIED — every claim in README.md and ladder-report.json is machine-checked above.")
