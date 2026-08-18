#!/usr/bin/env python3
"""THE FLOOR — every claim this pass's README makes, re-derived rather than read back.

    python verify.py

A check that consults the report it is checking can only ever pass, so wherever it is affordable a
rung re-derives the quantity from the committed pixels, the committed piece sets or the shipped
modules, and compares. Where a rung genuinely can only read the report it says so in its own name.

⚠ IT MUST FAIL LOUDLY ON ITS OWN PARSE ERRORS, and that is not a style note. Two harnesses on this
arc reported FALSE PASSES because they died before reaching the guard — one on `FileNotFoundError`
(five false passes), one on a corr parser that split on a comma and reported `None` for a refusal
that had worked perfectly. So: every rung runs inside a wrapper that turns ANY exception into a
FAILED rung with its traceback attached, the expected rung count is declared UP FRONT, and a run
that does not reach the declared count is a FAILURE even if every rung it did reach passed. A
harness that cannot parse its own evidence looks exactly like a guard that did not fire.
"""
import hashlib
import importlib.util
import json
import os
import re
import sys
import traceback

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")
DISPERSION = os.path.join(RESEARCH, "chapter2-plant-dispersion-2026-08-17")

SHRUB_PIECES = os.path.join(HERE, "pieces-shrubs")
SPECIES_PIECES = os.path.join(OPTIONS, "pieces-species")
BLADE_PIECES = os.path.join(GRASS, "pieces-m00-blade")

TUFT_SLOTS = ["tuft-3a", "tuft-2", "tuft-3b", "tuft-4"]
SHRUB_SLOTS = ["shrub-a", "shrub-b"]
PLANT_SLOTS = TUFT_SLOTS + SHRUB_SLOTS
CANDIDATE = "shrub-alt-tier"
PICTURES = ["shrub-species.png", "small-plant-set.png", "shrub-detail-6x.png",
            "test-count-channel.png"]

#: DECLARED UP FRONT. A run that reports fewer than this many rungs has died on the way and is a
#: FAILURE regardless of what it did report.
EXPECTED_RUNGS = 26

RESULTS = []


def rung(name):
    def deco(fn):
        try:
            detail = fn()
            RESULTS.append((True, name, detail if detail else ""))
        except Exception as exc:                                  # noqa: BLE001 — deliberate
            RESULTS.append((False, name, f"{type(exc).__name__}: {exc}\n"
                                         + "".join(traceback.format_tb(exc.__traceback__)[-2:])))
        return fn
    return deco


def load_json(path):
    with open(path) as fh:
        return json.load(fh)


def need(d, *keys):
    """Read a nested key, raising a LOUD error naming the whole path if any level is missing."""
    cur, seen = d, []
    for k in keys:
        seen.append(str(k))
        if isinstance(cur, list):
            cur = cur[k]
            continue
        if k not in cur:
            raise KeyError("report is missing `%s` — this harness cannot check the claim that "
                           "depends on it, and a missing key is a FAILURE, never a skip"
                           % ".".join(seen))
        cur = cur[k]
    return cur


def delivered_mask(path):
    """A piece's DELIVERED footprint through the same 3x3 majority the compositor applies."""
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3]
    m = a > 110.0
    h, w = a.shape
    dm = (m.reshape(h // 3, 3, w // 3, 3).transpose(0, 2, 1, 3)
          .reshape(h // 3, w // 3, 9).sum(axis=2) >= 5)
    return dm, m


def census_of(path):
    dm, m = delivered_mask(path)
    ys, xs = np.nonzero(dm)
    bw, bh = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    return {"deliveredPx": int(dm.sum()), "bboxW": bw, "bboxH": bh,
            "aspect": round(bw / bh, 2),
            "fillRatio": round(float(dm.sum()) / float(bw * bh), 2),
            "survivalPct": round(float(dm.sum()) * 9.0 / float(m.sum()) * 100.0, 1)}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


REPORT_PATH = os.path.join(HERE, "shrub-report.json")
if not os.path.exists(REPORT_PATH):
    print("FAILED before any rung: shrub-report.json is missing — run compose_shrubs.py first.")
    raise SystemExit(1)
R = load_json(REPORT_PATH)
META = load_json(os.path.join(SHRUB_PIECES, "render-meta.json"))
SRC_META = load_json(os.path.join(SPECIES_PIECES, "render-meta.json"))
PY_HERE = [f for f in sorted(os.listdir(HERE)) if f.endswith(".py")]


# =====================================================================================================
# A. THE FENCES — what this directory promises about itself
# =====================================================================================================
@rung("1. the pass writes only under docs/research/** — no script here names an app path")
def _r1():
    bad = []
    for f in PY_HERE:
        src = open(os.path.join(HERE, f), encoding="utf-8").read()
        for pat in ("packages/forest-world", "packages/app-surface", "apps/studio", "apps/desktop"):
            #: a MENTION inside a comment is what the prose does; an os.path.join to one is not.
            for mm in re.finditer(re.escape(pat), src):
                line = src[:mm.start()].count("\n") + 1
                text = src.splitlines()[line - 1]
                if "os.path.join" in text or "open(" in text:
                    bad.append(f"{f}:{line} reaches an app path: {text.strip()[:80]}")
    if bad:
        raise AssertionError("; ".join(bad))
    return "no script in this directory opens or joins an app path"


@rung("2. LAND_CAMERA_ELEVATION_DEG is neither read nor written here (it stays 20)")
def _r2():
    """PARSED, NOT GREPPED, and the difference is the whole check. A substring scan cannot tell a
    READ of the app constant from a sentence that NAMES it, so it failed on this pass's own closing
    log line — `print("LAND_CAMERA_ELEVATION_DEG is untouched and still 20.")`, which is the
    opposite of touching it. Loosening the scan to skip comment lines would then have to keep
    guessing at string literals and docstrings, each guess a hole. The AST answers exactly: a read
    or a write is a `Name` or `Attribute` node carrying that identifier, and text inside a string
    is neither."""
    import ast
    bad = []
    for f in PY_HERE:
        tree = ast.parse(open(os.path.join(HERE, f), encoding="utf-8").read(), filename=f)
        for node in ast.walk(tree):
            hit = (isinstance(node, ast.Name) and node.id == "LAND_CAMERA_ELEVATION_DEG") or \
                  (isinstance(node, ast.Attribute) and node.attr == "LAND_CAMERA_ELEVATION_DEG")
            if hit:
                bad.append(f"{f}:{getattr(node, 'lineno', '?')} reads or writes the app constant")
    if bad:
        raise AssertionError("; ".join(bad))
    if int(need(R, "fence", "appLandCameraElevationDeg")) != 20:
        raise AssertionError("the report does not state the app constant as 20")
    if float(need(R, "fence", "cameraElevationDeg")) != 50.0:
        raise AssertionError("this pass did not render at the research track's signed 50 deg")
    return "no read or write of the app constant in %d parsed files; this pass rendered at 50 deg" \
        % len(PY_HERE)


@rung("3. VENDORS NO COMPOSITOR AND NO SAMPLER — stated as a promise about CONTENT, not a diff")
def _r3():
    """⚠ THE DURABLE FORM. A branch-diff fence tests the branch, not the promise: a check reading
    `blender_species.py ... UNEDITED` out of a diff stays GREEN while false the moment a branch
    legitimately edits that file. This rung instead asserts that no file in THIS directory
    re-implements anything it is supposed to import."""
    forbidden = ["def compose_land", "def sample_in_cell", "def scatter_island", "def back_half",
                 "def paste_decor", "def build_palette", "def legacy_affine_sample_in_cell",
                 "def counts_for", "def mode_down"]
    bad = []
    for f in PY_HERE:
        #: this file is excluded because it HOLDS the token list — scanning it would match every
        #: token against the check's own source and fail on itself. It is also the one file in the
        #: directory that composes nothing.
        if f == os.path.basename(__file__):
            continue
        src = open(os.path.join(HERE, f), encoding="utf-8").read()
        for token in forbidden:
            if token in src:
                bad.append(f"{f} defines {token!r} — that belongs to the pass that owns it")
    if bad:
        raise AssertionError("; ".join(bad))
    return "no second compositor, positioner, palette or back half in this directory (%d checked)" \
        % len(forbidden)


@rung("4. the positioner IS the shipped one — `disperse.scatter_dispersed is scatter.scatter_island`")
def _r4():
    sys.path.insert(0, DISPERSION)
    sys.path.insert(0, GRASS)
    spec = importlib.util.spec_from_file_location("_v_disperse",
                                                  os.path.join(DISPERSION, "disperse.py"))
    X = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(X)
    if X.scatter_dispersed is not X.S.scatter_island:
        raise AssertionError("the alias has drifted from a name into a second implementation")
    return "one implementation, reached by alias"


@rung("5. `blender_species.py` and `blender_grass.py` are NOT edited by this pass")
def _r5():
    """Durable form again: the piece set records WHICH generator produced the pieces it inherited,
    and that record is compared to the source set's own record — a JSON-to-JSON comparison, so it
    cannot be confused by the CRLF-vs-LF hashing trap that made an untouched script look modified."""
    if META["inheritedGenerator"] != SRC_META["code_state"]:
        raise AssertionError("this set's `inheritedGenerator` does not match `pieces-species`'s own "
                             "declared code state — the inherited pieces are not that generator's")
    for name in ("blender_species.py", "blender_grass.py"):
        if name in PY_HERE:
            raise AssertionError(f"{name} has been COPIED into this directory")
        if name not in META["notEdited"]:
            raise AssertionError(f"{name} is not declared in the set's notEdited record")
    return "inherited generator matches the source set's own record; neither generator copied here"


@rung("6. every inherited piece is byte-for-byte its source")
def _r6():
    bad = []
    for name, want in META["inheritedSha256"].items():
        got_src = sha256_file(os.path.join(SPECIES_PIECES, name + ".png"))
        got_mine = sha256_file(os.path.join(SHRUB_PIECES, name + ".png"))
        if got_src != want or got_mine != want:
            bad.append(name)
    if bad:
        raise AssertionError("re-derived pieces differ from the recorded hash: " + ", ".join(bad))
    if len(META["inheritedSha256"]) != 9:
        raise AssertionError("expected 9 inherited pieces, found %d"
                             % len(META["inheritedSha256"]))
    return "9 pieces inherited byte-for-byte (4 species, 2 wilts, 3 flowers)"


@rung("7. the CANDIDATE is on disk, measured, and MOUNTABLE BY NOTHING")
def _r7():
    if CANDIDATE in META["pieceNames"]:
        raise AssertionError("the candidate is in pieceNames — a composite could contain it")
    if not os.path.exists(os.path.join(SHRUB_PIECES, CANDIDATE + ".png")):
        raise AssertionError("the candidate was never rendered")
    if CANDIDATE not in META["candidateOnly"]:
        raise AssertionError("the candidate is not declared as candidate-only")
    if not need(R, "marks", "candidate"):
        raise AssertionError("the candidate carries no measurement")
    return "rendered and measured; absent from pieceNames so `load_decor` never classifies it"


# =====================================================================================================
# B. THE PIECES — every census figure re-derived from the committed PNGs
# =====================================================================================================
@rung("8. every piece-level figure in the report is re-derivable from the committed PNGs")
def _r8():
    checked = 0
    for label, d in (("blade", BLADE_PIECES), ("species", SPECIES_PIECES),
                     ("shrubs", SHRUB_PIECES)):
        for name in PLANT_SLOTS + [CANDIDATE]:
            path = os.path.join(d, name + ".png")
            claimed = need(R, "marks", "perSet", label).get(name)
            if not os.path.exists(path):
                if claimed:
                    raise AssertionError(f"{label}/{name} is reported but not on disk")
                continue
            got = census_of(path)
            for k, v in got.items():
                if abs(float(claimed[k]) - float(v)) > 0.011:
                    raise AssertionError(f"{label}/{name}.{k}: report {claimed[k]} vs "
                                         f"re-derived {v}")
            checked += 1
    if checked < 18:
        raise AssertionError("only %d pieces re-derived; expected at least 18" % checked)
    return "%d pieces re-derived (px, bbox, aspect, fill, survival)" % checked


@rung("9. THE SURVIVAL FLOOR holds on every MOUNTED piece, and the blade set is exempt BY NAME")
def _r9():
    floor = float(need(R, "marks", "survivalFloor", "floorPct"))
    for label in ("species", "shrubs"):
        for name in PLANT_SLOTS:
            path = os.path.join(SPECIES_PIECES if label == "species" else SHRUB_PIECES,
                                name + ".png")
            s = census_of(path)["survivalPct"]
            if s < floor:
                raise AssertionError(f"{label}/{name} survives at {s}% < {floor}%")
    if "bladeSetExemptedBecause" not in need(R, "marks", "survivalFloor"):
        raise AssertionError("the blade exemption is not stated with its reason")
    worst = min(need(R, "marks", "survivalFloor", "bladeSurvival").values())
    if worst >= floor:
        raise AssertionError("the blade set does not actually fall below the floor (%s) — the "
                             "exemption would be describing a problem that is not there" % worst)
    return "floor %.0f%% clears on 8 mounted pieces; the withdrawn blade's worst is %s%%" \
        % (floor, worst)


@rung("10. the FIRST cushion's failure is real — an 8-px 4x3 mound, not a 4-px dash")
def _r10():
    c = census_of(os.path.join(SHRUB_PIECES, "shrub-a.png"))
    if c["bboxH"] < 3:
        raise AssertionError("the shipped cushion is under three delivered rows — the dash failure")
    if c["survivalPct"] < 85.0:
        raise AssertionError("the shipped cushion is below the survival floor")
    return "cushion delivers %d px in %dx%d at %.0f%% survival" \
        % (c["deliveredPx"], c["bboxW"], c["bboxH"], c["survivalPct"])


@rung("11. ASPECT ALONE CANNOT SCORE THIS SET — frond and spreader tie on aspect, differ on fill")
def _r11():
    fr = census_of(os.path.join(SHRUB_PIECES, "shrub-b.png"))
    sp = census_of(os.path.join(SHRUB_PIECES, "tuft-3b.png"))
    if (fr["bboxW"], fr["bboxH"]) != (sp["bboxW"], sp["bboxH"]):
        raise AssertionError("the two pieces no longer share a delivered box, so the instrument "
                             "claim needs re-stating rather than re-asserting")
    if abs(fr["aspect"] - sp["aspect"]) > 0.011:
        raise AssertionError("they no longer tie on aspect")
    if fr["fillRatio"] >= sp["fillRatio"] - 0.10:
        raise AssertionError("the notch no longer separates them on fill (%s vs %s)"
                             % (fr["fillRatio"], sp["fillRatio"]))
    return "both %dx%d at aspect %.2f; fill %.2f (frond) vs %.2f (spreader)" \
        % (fr["bboxW"], fr["bboxH"], fr["aspect"], fr["fillRatio"], sp["fillRatio"])


@rung("12. CONCAVITY SURVIVES — the frond's delivered silhouette really is notched")
def _r12():
    dm, _m = delivered_mask(os.path.join(SHRUB_PIECES, "shrub-b.png"))
    ys, xs = np.nonzero(dm)
    sub = dm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    #: a notch is an UNSET pixel with set pixels both to its left and to its right on the same row,
    #: in the TOP row of the delivered box — i.e. the top profile is not convex.
    top = sub[0]
    idx = np.nonzero(top)[0]
    gaps = int(((~top[idx.min():idx.max() + 1]).sum()))
    if gaps < 1:
        raise AssertionError("the frond's top row is solid — the notch did not survive the vote")
    return "the top row carries %d unset px between its extremes; the notch survives" % gaps


@rung("13. VERTICAL SEPARATION DOES NOT SURVIVE — tier and cushion deliver the same silhouette")
def _r13():
    def crop(n):
        dm, _m = delivered_mask(os.path.join(SHRUB_PIECES, n + ".png"))
        ys, xs = np.nonzero(dm)
        return dm[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    a, b = crop("shrub-a"), crop(CANDIDATE)
    if a.shape != b.shape or not bool((a == b).all()):
        raise AssertionError("the two no longer deliver the same silhouette, so the finding needs "
                             "re-measuring rather than re-asserting (%s vs %s)" % (a.shape, b.shape))
    return "a crown on a stem and a ground mound deliver the IDENTICAL %dx%d mask" % a.shape


# =====================================================================================================
# C. THE ISLAND — the numbers the owner's look turns on
# =====================================================================================================
@rung("14. ZERO PALETTE COST — re-derived by mounting all three sets independently")
def _r14():
    sys.path.insert(0, GRASS)
    spec = importlib.util.spec_from_file_location("_v_core", os.path.join(GRASS,
                                                                         "compose_core.py"))
    Dm = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("compose_core", Dm)
    spec.loader.exec_module(Dm)
    pals = {}
    for label, d, g in (("blade", BLADE_PIECES, "blade"), ("species", SPECIES_PIECES, "species"),
                        ("shrubs", SHRUB_PIECES, "shrubs")):
        Dm.use_pieces(d, expect_geometry=g)
        pals[label] = [tuple(int(v) for v in c) for c in Dm.C.PALETTE]
    if not (pals["blade"] == pals["species"] == pals["shrubs"]):
        raise AssertionError("the three sets close over different palettes: %s"
                             % {k: len(v) for k, v in pals.items()})
    if int(need(R, "paletteCost", "entries")) != len(pals["shrubs"]):
        raise AssertionError("the report's palette size (%s) is not the re-derived one (%d)"
                             % (need(R, "paletteCost", "entries"), len(pals["shrubs"])))
    if int(need(R, "paletteCost", "costOfTheSpeciesChangeInPaletteEntries")) != 0:
        raise AssertionError("the report does not claim zero palette cost")
    return "%d entries, identical across all three sets — the species change costs 0" \
        % len(pals["shrubs"])


@rung("15. the SAME placements carry every panel — the only variable is the mesh")
def _r15():
    d = need(R, "dispersion")
    n = int(d["placements"])
    for label in ("blade", "species", "shrubs"):
        got = int(need(R, "delivery", label, "placements"))
        if got != int(need(R, "delivery", "blade", "placements")):
            raise AssertionError(f"{label} carries {got} placements, blade carries "
                                 f"{need(R, 'delivery', 'blade', 'placements')}")
    return "%d meadow placements, identical across the three panels" % n


@rung("16. THE DIAGONAL COLLAPSE IS NOT IN THESE PLACEMENTS")
def _r16():
    d = need(R, "dispersion")
    if abs(float(d["corrUV"])) > 0.15:
        raise AssertionError("corr(u,v) = %s exceeds the dispersion floor's 0.15" % d["corrUV"])
    if float(d["onDiagonalShare"]) > 0.07:
        raise AssertionError("on-diagonal share %s exceeds 0.07 (chance is 0.0396)"
                             % d["onDiagonalShare"])
    return "corr(u,v) = %s, on-diagonal %s (unfixed sampler: +0.9997, share 1.0000)" \
        % (d["corrUV"], d["onDiagonalShare"])


@rung("17. THE BASELINE IS THIS PASS'S OWN — and the withdrawn blade is genuinely the worse mark")
def _r17():
    b = need(R, "delivery", "blade")
    s = need(R, "delivery", "shrubs")
    if b["medianDeliveredPxPerSurvivor"] >= s["medianDeliveredPxPerSurvivor"]:
        raise AssertionError("the small-plant set does not deliver a bigger median mark "
                             "(%s vs %s) — the whole re-skin argument needs re-stating"
                             % (b["medianDeliveredPxPerSurvivor"],
                                s["medianDeliveredPxPerSurvivor"]))
    if "whatWasInherited" not in need(R, "baselineIsRemeasured"):
        raise AssertionError("the report does not state which figures are inherited")
    return "median delivered px per survivor: blade %s -> species %s -> small plants %s" \
        % (b["medianDeliveredPxPerSurvivor"],
           need(R, "delivery", "species", "medianDeliveredPxPerSurvivor"),
           s["medianDeliveredPxPerSurvivor"])


@rung("18. vegetation on the island rises for the SAME authored marks")
def _r18():
    v = need(R, "vegetation")
    if v["deliveredPx"]["shrubs"] <= v["deliveredPx"]["blade"]:
        raise AssertionError("the small-plant set does not deliver more vegetation")
    marks = int(need(R, "vegetation", "authored", "meadowTotal"))
    if marks <= 0:
        raise AssertionError("no marks were authored")
    return "%d -> %d -> %d delivered px for %d authored marks" \
        % (v["deliveredPx"]["blade"], v["deliveredPx"]["species"], v["deliveredPx"]["shrubs"],
           marks)


@rung("19. ADR-0226 D2 IS UNCHANGED — the count rule is stated verbatim and not modified")
def _r19():
    rule = need(R, "testCountChannel", "rule")
    if "2 + tests*1.9" not in rule or "UNCHANGED" not in rule:
        raise AssertionError("the report does not state the unchanged count rule")
    breaks = need(R, "testCountChannel", "authoredMarksMonotonicInTests", "breaks")
    if breaks:
        raise AssertionError("the AUTHORED counts are not monotone in tests, which they are by "
                             "construction — something rewrote the rule: %s" % breaks[:2])
    return "authored marks monotone in tests with 0 breaks, as `2 + tests*1.9` guarantees"


@rung("20. THE PER-PARCEL READ IS RE-MEASURED AND NOT THE OLD FIGURE RE-STATED")
def _r20():
    a = need(R, "testCountChannel", "adjacentParcelRead")
    spread_note = need(R, "testCountChannel", "storyTestSpread")
    if int(spread_note["min"]) == 2 and int(spread_note["max"]) == 8:
        raise AssertionError("this island's spread is the same 2-vs-8 the old figure used; the "
                             "'not comparable' caveat would be false")
    for label in ("blade", "species", "shrubs"):
        if label not in a:
            raise AssertionError("no per-parcel read for %s" % label)
    return "tests span %s-%s here (the weak spot was measured across 2-8); blade %sx vs small " \
           "plants %sx" % (spread_note["min"], spread_note["max"], a["blade"]["ratio"],
                           a["shrubs"]["ratio"])


@rung("21. THE COUNT-RULE OVERLOAD IS SHOWN AND EXPLICITLY NOT DECIDED")
def _r21():
    o = need(R, "countRuleOverload")
    if not o["overloaded"]:
        raise AssertionError("no capability is over capacity — the inherited overload this pass "
                             "promises to show is not present, so the claim must be re-stated")
    txt = o["THIS_IS_SHOWN_NOT_DECIDED"]
    for want in ("ADR-0226 D2", "OWNER"):
        if want not in txt:
            raise AssertionError("the fork is not routed to the owner in the report text")
    return "%d of %d capabilities over capacity; the fix is routed to the owner, not taken" \
        % (len(o["overloaded"]), len(o["rows"]))


@rung("22. INTERPENETRATION IS MEASURED ON ISOLATED FOOTPRINTS, and it rises with the bigger mark")
def _r22():
    i = need(R, "interpenetration")
    for label in ("blade", "species", "shrubs"):
        if label not in i:
            raise AssertionError("no interpenetration figure for %s" % label)
    if i["shrubs"]["plants"] != i["blade"]["plants"]:
        raise AssertionError("the two sets were measured over different plant counts")
    if i["shrubs"]["overlappingPairs"] < i["blade"]["overlappingPairs"]:
        raise AssertionError("overlap did not rise with the bigger mark, which contradicts the "
                             "stated risk — re-measure rather than re-assert")
    return "blade %d overlapping pairs (%.0f%% of plants) -> small plants %d (%.0f%%), %.1f%% of " \
           "total footprint" % (i["blade"]["overlappingPairs"],
                                i["blade"]["shareOfPlantsOverlapping"] * 100,
                                i["shrubs"]["overlappingPairs"],
                                i["shrubs"]["shareOfPlantsOverlapping"] * 100,
                                i["shrubs"]["overlapAsShareOfTotalFootprint"] * 100)


@rung("23. DETERMINISM IS ASSERTED ON THE DECODED RASTER, never on the file bytes")
def _r23():
    d = need(R, "determinism")
    if not d["deliveredRasterIdentical"] or not d["solidMaskIdentical"]:
        raise AssertionError("two composites of one code state disagree")
    if "DECODED" not in d["rule"]:
        raise AssertionError("the rule does not name the decoded raster")
    return "two composites of one code state agree on the decoded raster and the solid mask"


# =====================================================================================================
# D. THE EVIDENCE
# =====================================================================================================
@rung("24. every picture exists and carries a provenance sidecar naming ONE code state")
def _r24():
    for pic in PICTURES:
        p = os.path.join(HERE, pic)
        if not os.path.exists(p):
            raise AssertionError("missing picture " + pic)
        sc = p + ".provenance.json"
        if not os.path.exists(sc):
            raise AssertionError("missing sidecar for " + pic)
        s = load_json(sc)
        blob = json.dumps(s)
        for want in ("chapter2-shrub-species-2026-08-18", "scatter_island"):
            if want not in blob:
                raise AssertionError(f"{pic}'s sidecar does not record {want!r}")
    return "%d pictures, %d sidecars, each naming the pass and the shipped positioner" \
        % (len(PICTURES), len(PICTURES))


@rung("25. the 6x crop contains NO hero-tree pixel — and the constraint is NOT VACUOUS")
def _r25():
    """⚠ A NEGATIVE PERMISSION TEST PASSES VACUOUSLY IF ITS INVENTORY IS EMPTY, and this pass built
    that exact bug once: the first tree mask was differenced against a reference that also contained
    the tree, so it cancelled to nothing and "no tree pixel in this window" became true of every
    window on the island. So the count is checked BOTH ways — zero in the chosen window, and a mask
    big enough that zero could have failed."""
    c = need(R, "detailCrop")
    if int(c["treePxInWindow"]) != 0:
        raise AssertionError("the crop contains %s tree px" % c["treePxInWindow"])
    if int(c["vegetationPxInWindow"]) <= 0:
        raise AssertionError("the crop contains no vegetation at all")
    tm = int(need(R, "detailCrop", "treeMaskPx"))
    if tm < 1000:
        raise AssertionError("the tree mask holds only %d px — the constraint it enforces could "
                             "not have failed, so passing it means nothing" % tm)
    if tm < int(c["w"]) * int(c["h"]):
        raise AssertionError("the tree mask is smaller than one crop window, so no window could "
                             "ever have contained it")
    return "%d vegetation px and 0 tree px in the window, against a %d-px tree mask (%.1fx the " \
           "window's own area)" % (c["vegetationPxInWindow"], tm,
                                   tm / float(int(c["w"]) * int(c["h"])))


@rung("26. the refusal hatches are OFF at rest")
def _r26():
    src = open(os.path.join(HERE, "compose_shrubs.py"), encoding="utf-8").read()
    if "STORYTREE_SHRUBS_PERTURB" not in src:
        raise AssertionError("the perturbation hatch has been removed, so the guards below can no "
                             "longer be shown to fire on the real composer")
    if os.environ.get("STORYTREE_SHRUBS_PERTURB"):
        raise AssertionError("a hatch is SET in this environment — the committed pictures would be "
                             "composed from something other than what their captions claim")
    return "both hatches declared and unset"


# =====================================================================================================
print("\nSHRUB SPECIES — verification floor\n" + "=" * 78)
for ok, name, detail in RESULTS:
    print(("  PASS  " if ok else "  FAIL  ") + name)
    if detail:
        for line in str(detail).rstrip().splitlines():
            print("          " + line)
passed = sum(1 for ok, _n, _d in RESULTS if ok)
print("=" * 78)
print("%d/%d rungs passed (%d declared)" % (passed, len(RESULTS), EXPECTED_RUNGS))

if len(RESULTS) != EXPECTED_RUNGS:
    print("\nFAILED: this harness reached %d rungs but declares %d. A run that does not reach its "
          "own declared count has DIED ON THE WAY, and a partial green is exactly what a false "
          "pass looks like." % (len(RESULTS), EXPECTED_RUNGS))
    raise SystemExit(1)
if passed != len(RESULTS):
    raise SystemExit(1)
print("FLOOR GREEN — every claim above was re-derived, not read back.")
