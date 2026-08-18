#!/usr/bin/env python3
"""NO COLOUR THE LAND EMITS READS AS A FOREIGN STATUS — settling PR #1385's absolute condemnation.

    python measure_palette.py               # -> 3 pictures + foreign-status-report.json + sidecars
    python measure_palette.py --no-island   # palette + app only; skips the ~3.5 min compositor mount

THE QUESTION, from the increment `land-palette-emits-no-colour-that-reads-as-a-foreign-status`:
*"21 of the 78 colours the land may already emit read as a status OTHER than the one that authored
them, at full light and before any shadow. Settle whether that is a real misread or an artefact of
the reader, and fix whichever it is."*

THE ANSWER IS THAT THE READER WAS WRONG IN BOTH DIRECTIONS, AND THE DEFECT IS REAL.

  * The count over-reports. It is taken over `faces="all"` — the table PR #1385's own guard
    deliberately does not assert on — and over all six schema statuses, while `worldStatus.ts` folds
    two of them away. Nine of the 21 have a token at one end that the app can never draw. One of the
    two named headline instances, *"`healthy`'s dark WALL band reads `unhealthy`"*, dissolves
    completely: `unhealthy` is not in the rendered vocabulary, so nothing can be mistaken FOR it.

  * And it under-reports, because the whole count is answerable with "you compared a shadowed pixel
    to a lit swatch". Remove that objection — compare two statuses only where the land renders them
    on the SAME FACE under the SAME LIGHT — and the defect does not merely survive, it sharpens onto
    one pair: `healthy` and `unknown`, **3.37 dE apart**, against a palette whose own shade rung is
    **13.98**. Every other rendered pair is 14.19 or better.

  * The shipped app is NOT exempt, and its emitted set is smaller, not safer: four colours per status
    against the research pipeline's thirteen, no shade ladder, no Blender, no quantiser — and the
    same two families sit **4.32 dE** apart inside it.

  * What DOES narrow it, and this pass reports it rather than burying it: no capability in the live
    corpus renders `unknown` today (0 of 244), so no island currently draws the worst pair. It is a
    latent defect one null status away, not an active misdraw — and `unknown` is precisely the
    NULL-STATUS fallback, which is what makes the direction the worst one available.

THE FENCE. `docs/research/**` only. `substrate.ts`, `index.css` and everything under
`packages/forest-world` are READ and never written — the owner isolated this track from the app on
2026-08-16 (*"isolate this away from the main app until we ready"*) and that has not been lifted. The
app-side implication is measured, priced and written down here; it is not made. `verify.py` asserts
the fence mechanically.

NO FOURTH COMPOSITOR, AND NO SECOND PALETTE. Every token, shade level, distance metric and status
vocabulary is imported from the module that owns it (see `palette_read.py`'s header). The island half
mounts `compose_healthy.py` WHOLE with its writes redirected to scratch — the mechanism
`compose_shadow.py` established — so that pass's refusals are this pass's refusals and its delivered
pictures are never touched.
"""
import importlib.util
import itertools
import json
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

import palette_read as PR

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = PR.REPO
HEALTHY = PR.HEALTHY
OUT = os.environ.get("STORYTREE_FOREIGN_OUT", HERE)

C = PR.C
P = PR.P

WITH_ISLAND = "--no-island" not in sys.argv[1:]

REPORT = {
    "question": ("does the land emit a colour that reads as a status other than the one that "
                 "authored it — and is PR #1385's 21-of-78 a real misread or an artefact of the "
                 "reader?"),
    "surface": {"storyId": P.STORY_ID, "cameraElevationDeg": P.PASS_ELEVATION_DEG,
                "appLandCameraElevationDeg": P.APP_LAND_CAMERA_ELEVATION_DEG},
    "blenderFramesRendered": 0,
}


# =====================================================================================================
# 1. REPRODUCE PR #1385, THEN VARY ONE AXIS AT A TIME
# =====================================================================================================
# Each row changes exactly one thing about the reader, so the movement between rows is attributable.
# Row A is the shipped call and must land on 21 of 78 or this pass is measuring something else.
ROWS = [
    ("A shipped reader (6 statuses, tops+sides)",
     dict(statuses=PR.ALL_STATUSES, faces="all", variants=3)),
    ("B fills only (6 statuses, ADR-0367 D5's own table)",
     dict(statuses=PR.ALL_STATUSES, faces="top", variants=3)),
    ("C folded (4 rendered statuses, tops+sides)",
     dict(statuses=PR.RENDERED, faces="all", variants=3, reader_statuses=PR.RENDERED)),
    ("D folded + fills only",
     dict(statuses=PR.RENDERED, faces="top", variants=3, reader_statuses=PR.RENDERED)),
]
REPORT["theReaderVaried"] = {}
for label, kw in ROWS:
    r = PR.cross_reads(**kw)
    REPORT["theReaderVaried"][label] = {k: v for k, v in r.items() if k != "examples"}
    REPORT["theReaderVaried"][label]["examples"] = r["examples"]

_A = REPORT["theReaderVaried"][ROWS[0][0]]
if not (_A["entries"] == 78 and _A["crossReading"] == 21):
    raise SystemExit(
        "measure_palette: row A did not reproduce PR #1385's own count (%d of %d, expected 21 of 78). "
        "Either the token table moved or this instrument is not the one that pass ran; both are "
        "reasons to stop rather than to report a number."
        % (_A["crossReading"], _A["entries"]))

REPORT["howMuchOfTheCountIsUnREACHABLE"] = {
    "shippedRowCrossReads": _A["crossReading"],
    "ofThoseReachableBothEnds": _A["reachableCrossReading"],
    "unreachable": _A["crossReading"] - _A["reachableCrossReading"],
    "fold": ("`worldStatus.ts` folds `unhealthy -> mapped` (ADR-0296) and `building -> proposed` "
             "(ADR-0038), so a cross-read with either token at either end names a colour the app "
             "cannot draw or a status it cannot be mistaken for."),
    "headlineInstanceThatDissolves": (
        "`healthy`'s dark WALL band reads `unhealthy` — the target is not in the rendered "
        "vocabulary, so this instance does not exist on any island the app can draw."),
    "headlineInstanceThatSURVIVES": (
        "`unknown`'s side family reads `healthy` — both ends are reachable, and `unknown` is the "
        "NULL-STATUS fallback, so this is absence of information rendered as proof."),
}

# The symmetric reader — the same objection removed a second, independent way.
REPORT["symmetricReader"] = {
    "foldedFills": PR.nearest_other_status(PR.RENDERED, 3, "top"),
    "foldedAllFaces": PR.nearest_other_status(PR.RENDERED, 3, "all"),
}


# =====================================================================================================
# 2. THE TEST THIS PASS STANDS ON
# =====================================================================================================
REPORT["matchedCondition"] = {
    "shippedFills": PR.admissible(PR.RENDERED, 3, "top"),
    "shippedAllFaces": {"gap": PR.matched_gap(PR.RENDERED, 3, "all")},
    "collapsedFills": PR.admissible(PR.RENDERED, 1, "top"),
    "collapsedAllFaces": {"gap": PR.matched_gap(PR.RENDERED, 1, "all")},
    "perPair": {},
    "rule": ("two statuses must be further apart, where the land renders them alike, than one status "
             "is from itself one shade rung away. Status must outweigh light — ADR-0367 D5 as a "
             "number. The bar is DERIVED from the shade table, not chosen."),
}
for a, b in itertools.combinations(PR.RENDERED, 2):
    for variants, key in ((3, "shipped"), (1, "collapsed")):
        g = PR.matched_gap((a, b), variants, "top")
        REPORT["matchedCondition"]["perPair"].setdefault("%s|%s" % (a, b), {})[key] = g["dE"]

REPORT["theInversion"] = {
    "meaninglessStep": PR.within_matched(PR.RENDERED, 3, "top"),
    "meaningfulGap": PR.matched_gap(PR.RENDERED, 3, "top"),
    "reading": ("the palette draws the distinction that MEANS NOTHING — `substrate.ts:237`'s "
                "hash-picked texture variant, which nothing reads and nothing derives from — louder "
                "than the distinction that carries SEMANTIC STATE. That is the ADR-0367 D5 failure "
                "stated as one comparison, and it needs no reader table at all."),
}
REPORT["sideLadderIsDegenerate"] = {
    "pairs": PR.side_ladder_degenerate(),
    "reading": ("a separate, smaller defect found while deriving the bar: `KEY_SHADE` holds "
                "`chamfer_dark = 0.78` beside `wall_dark = 0.80` and `build_palette` gives the SIDE "
                "family every level, so the side ladder contains pairs ~2.3 dE apart — two palette "
                "entries no reader can separate. Harmless today (same status at both ends) and the "
                "reason the bar above is the FILL ladder."),
}


# =====================================================================================================
# 3. IS THE SHIPPED APP AFFECTED?
# =====================================================================================================
REPORT["theShippedApp"] = {
    "path": "substrate.ts -> scene.ts -> index.css (SVG fill from a CSS variable; NO shade ladder)",
    "researchPath": "emit_island.ts -> blender_land.py -> the closed-palette snap (13 colours/status)",
    "appColoursPerStatus": 4,
    "matchedGapFills": PR.app_matched_gap(PR.RENDERED, "top"),
    "matchedGapAllFaces": PR.app_matched_gap(PR.RENDERED, "all"),
    "bar": PR.shallowest_shade_rung(PR.RENDERED),
    "variantCollisionRate": PR.variant_collision_rate(PR.RENDERED),
    "whereUnknownComesFrom": PR.null_status_is_the_unknown_family(),
    "reading": ("NOT exempt. The app's set is SMALLER than the research pipeline's and the same two "
                "families overlap inside it, at full light, with no shading and no quantiser. "
                "`substrate.ts:237` picks the variant by hash, so which pair gets drawn is a coin "
                "toss the renderer takes per cell."),
}
REPORT["corpusExposure"] = PR.corpus_exposure()
REPORT["corpusExposure"]["reading"] = (
    "the difference between a latent defect and an active misdraw, and it cuts BOTH ways. No "
    "capability in the live corpus renders `unknown` (0 of 244), so no island draws the 3.37 dE pair "
    "today — the worst instance is one null status away, not on screen. But the pair that IS drawn "
    "today and sits closest to the bar, `mapped` beside `proposed` on 2 stories, clears it by 1.5%.")


# =====================================================================================================
# 4. WHAT A FIX COSTS — in the arc's own currency
# =====================================================================================================
REPORT["thePrice"] = {
    "shippedPaletteEntries": PR.palette_entries(PR.ALL_STATUSES, 3),
    "collapsedPaletteEntries": PR.palette_entries(PR.ALL_STATUSES, 1),
    "deliveredShippedPalette": int(len(C.PALETTE)),
    "comparisons": {"shadowLadder": 506, "shadowLadderCost": 506 - 132,
                    "microRelief": 1125, "microReliefCost": 619},
    "reading": ("a RE-ANCHORING costs ZERO entries — the palette's size is |tokens| x |levels| and "
                "changing a token's value changes no count. The collapse this pass measures costs "
                "NEGATIVE entries: it removes two of the three top tokens per status. Every other "
                "move priced on this arc ADDED entries (shadow +374, micro-relief +619); this is the "
                "first that pays for itself, and the owner has already directed the surface it needs "
                "(flat green, one surface, 2026-08-16)."),
}
REPORT["theCeilings"] = {
    "instrument": "shadow.safe_depth, imported — the same function that produced the arc's series",
    "readTheDirection": ("the ceiling is the DEEPEST multiplier at which a fill still reads as "
                         "itself, so a LOWER number is MORE headroom, and a ladder is admissible on a "
                         "mixed island when its deepest rung sits below the MAXIMUM of the ceilings "
                         "present."),
    "asPR1385Measured": {k: v for k, v in PR.ceilings(PR.RENDERED, 3, "top", PR.ALL_STATUSES).items()},
    "folded": {k: v for k, v in PR.ceilings(PR.RENDERED, 3, "top").items()},
    "collapsed": {k: v for k, v in PR.ceilings(PR.RENDERED, 1, "top").items()},
    "deepestAuthoredRung": 0.80,
}
_c = REPORT["theCeilings"]
REPORT["theCeilings"]["reading"] = (
    "THIS CONTRADICTS THE ARC'S OWN EXPECTATION AND THE CONTRADICTION IS THE POINT. The increment "
    "was sequenced ahead of `shadow-ladder-is-admissible-and-affordable` because separating the "
    "cross-reading bands 'may raise the confusability ceilings'. It does not. The binding ceiling is "
    "`unknown`'s and it moves %s -> %s -> %s: the fold does not touch it and the collapse makes it "
    "slightly WORSE, because this instrument rewards a family for owning a darker sibling to fall "
    "back on and the collapse takes those siblings away. The 0.80 ladder stays inadmissible on a "
    "mixed island either way. The reason is structural: the four rendered statuses are ordered along "
    "LUMINANCE and a shadow is a luminance operation, so darkening one walks it toward the next. "
    "Separating them by HUE or CHROMA is what would move these numbers, and that is an owner art "
    "call this pass prices but does not spend."
    % (_c["asPR1385Measured"]["_binding"], _c["folded"]["_binding"], _c["collapsed"]["_binding"]))


# =====================================================================================================
# 5. THE REFUSAL — a gate, not a report line
# =====================================================================================================
class Inadmissible(Exception):
    """Raised when the emitted set puts two statuses closer than the palette's own shade rung."""


def gate(statuses=PR.RENDERED, variants=3, faces="top", what="the land"):
    """REFUSE to draw `what` when a light difference and a status difference are the same size.

    Following PR #1382's call on its own central claim — *"a report explaining afterwards that the
    island was fabricated is not the same object as a composer that declines to draw one"*. This
    fires on the SHIPPED table, which is the whole finding; `verify_refusal.py` drives it both ways.
    """
    v = PR.admissible(statuses, variants, faces)
    if not v["ok"]:
        raise Inadmissible(
            "REFUSED to draw %s: `%s` and `%s` are %.2f dE apart on the same face at the same light "
            "(%s vs %s), against a shade rung of %.2f dE. A reader cannot tell the status apart from "
            "the light. ADR-0367 D5."
            % (what, v["gap"]["a"]["status"], v["gap"]["b"]["status"], v["gap"]["dE"],
               v["gap"]["a"]["rgb"], v["gap"]["b"]["rgb"], v["bar"]["dE"]))
    return v


REPORT["theGate"] = {}
for label, variants in (("shippedTable", 3), ("collapsedTable", 1)):
    try:
        gate(PR.RENDERED, variants, "top", what="a %s-variant island" % variants)
        REPORT["theGate"][label] = {"refused": False}
    except Inadmissible as exc:
        REPORT["theGate"][label] = {"refused": True, "message": str(exc)}


# =====================================================================================================
# 6. THE PICTURES
# =====================================================================================================
BOARD = (43, 49, 56)
INK = (232, 236, 240)
DIM = (150, 160, 172)
BAD = (226, 106, 106)
GOOD = (122, 198, 132)


def _font():
    from PIL import ImageFont
    return ImageFont.load_default()


def _text(dr, xy, s, fill=INK):
    dr.text(xy, s, fill=fill, font=_font())


def unhex(s):
    """`#rrggbb` -> float rgb. One place, because doing it inline is how a picture ends up drawing a
    different colour from the one its own caption names."""
    if not (isinstance(s, str) and len(s) == 7 and s[0] == "#"):
        raise SystemExit("measure_palette.unhex: not a hex colour: %r" % (s,))
    return np.array([int(s[k:k + 2], 16) for k in (1, 3, 5)], dtype=np.float32)


def swatch(dr, x, y, w, h, rgb, label=None, sub=None):
    dr.rectangle([x, y, x + w, y + h], fill=tuple(int(round(float(v))) for v in rgb))
    if label:
        _text(dr, (x, y + h + 3), label, DIM)
    if sub:
        _text(dr, (x, y + h + 14), sub, DIM)


def picture_matched_condition(path):
    """THE DELIVERABLE. Every rendered pair, at the condition where they are closest, side by side —
    shipped against collapsed. Two swatches touching is the whole argument: if you cannot see the
    join, the land cannot tell you the status."""
    pairs = list(itertools.combinations(PR.RENDERED, 2))
    rowh, sw, x0, top = 96, 132, 190, 84
    W, H = x0 + sw * 4 + 150, top + rowh * len(pairs) + 60
    img = Image.new("RGB", (W, H), BOARD)
    dr = ImageDraw.Draw(img)
    _text(dr, (24, 22), "MATCHED CONDITION - the same face, the same light, two different statuses")
    _text(dr, (24, 40), "left: as shipped (3 hash-picked variants per status)      "
                        "right: collapsed to one token per status", DIM)
    bar = PR.shallowest_shade_rung(PR.RENDERED)["dE"]
    _text(dr, (24, 56), "the bar is the palette's own shade rung, %.2f dE - a status must be louder "
                        "than the light" % bar, DIM)
    for i, (a, b) in enumerate(pairs):
        y = top + i * rowh
        _text(dr, (24, y + 26), "%s | %s" % (a, b))
        for j, variants in enumerate((3, 1)):
            g = PR.matched_gap((a, b), variants, "top")
            x = x0 + j * (sw * 2 + 60)
            ra = C.shade(C.hexrgb(C.STATUS_TOKENS[g["a"]["status"]]["top"][g["a"]["token"]]), g["shade"])
            rb = C.shade(C.hexrgb(C.STATUS_TOKENS[g["b"]["status"]]["top"][g["b"]["token"]]), g["shade"])
            swatch(dr, x, y, sw, 46, ra)
            swatch(dr, x + sw, y, sw, 46, rb)
            ok = g["dE"] >= bar
            _text(dr, (x, y + 52), "%.2f dE  @light %.2f   %s" % (g["dE"], g["shade"],
                                                                  "OK" if ok else "TOO CLOSE"),
                  GOOD if ok else BAD)
            _text(dr, (x, y + 66), "%s  %s" % (g["a"]["rgb"], g["b"]["rgb"]), DIM)
    img.save(path)
    return img


def picture_inversion(path):
    """THE ONE-NUMBER STATEMENT. The distinction that means nothing, beside the distinction that
    carries the capability's proof state, at the same scale."""
    W, H = 940, 300
    img = Image.new("RGB", (W, H), BOARD)
    dr = ImageDraw.Draw(img)
    _text(dr, (24, 22), "THE INVERSION - the land draws the meaningless difference louder than the "
                        "meaningful one")
    w = PR.within_matched(PR.RENDERED, 3, "top")
    g = PR.matched_gap(PR.RENDERED, 3, "top")
    rows = [
        ("MEANINGLESS: two texture variants of ONE status", w["dE"],
         unhex(w["a"]), unhex(w["b"]),
         "%s  %s %s at light %.2f  (`substrate.ts:237` picks it by hash — nothing reads it)"
         % (w["status"], w["a"], w["b"], w["shade"]), DIM),
        ("MEANINGFUL: %s beside %s - the capability's proof state"
         % (g["a"]["status"], g["b"]["status"]), g["dE"],
         unhex(g["a"]["rgb"]), unhex(g["b"]["rgb"]),
         "%s  %s at light %.2f  (ADR-0226: the cell IS the capability)"
         % (g["a"]["rgb"], g["b"]["rgb"], g["shade"]), BAD),
    ]
    for i, (title, de, ra, rb, sub, col) in enumerate(rows):
        y = 68 + i * 108
        _text(dr, (24, y), title, col)
        swatch(dr, 24, y + 18, 190, 52, ra)
        swatch(dr, 214, y + 18, 190, 52, rb)
        _text(dr, (424, y + 24), "%.2f dE" % de, col)
        _text(dr, (424, y + 44), sub, DIM)
    _text(dr, (24, H - 34), "%.2f dE of nothing, %.2f dE of everything - a %.1fx inversion"
          % (w["dE"], g["dE"], w["dE"] / g["dE"]), BAD)
    img.save(path)
    return img


PICTURES = ["matched-condition.png", "the-inversion.png"]
picture_matched_condition(os.path.join(OUT, "matched-condition.png"))
picture_inversion(os.path.join(OUT, "the-inversion.png"))


# =====================================================================================================
# 7. THE ISLAND — the arc's own rule: judge on the island, never a contact sheet
# =====================================================================================================
def _load_healthy():
    """Mount `compose_healthy.py` whole, in ITS directory, writes redirected to scratch — the
    mechanism `compose_shadow.py` established. Its module-level refusals become this pass's."""
    tmp = tempfile.mkdtemp(prefix="palette-foreign-")
    saved = os.environ.get("STORYTREE_HEALTHY_OUT")
    os.environ["STORYTREE_HEALTHY_OUT"] = tmp
    cwd = os.getcwd()
    try:
        os.chdir(HEALTHY)
        spec = importlib.util.spec_from_file_location(
            "compose_healthy_imported", os.path.join(HEALTHY, "compose_healthy.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m
    finally:
        os.chdir(cwd)
        if saved is None:
            os.environ.pop("STORYTREE_HEALTHY_OUT", None)
        else:
            os.environ["STORYTREE_HEALTHY_OUT"] = saved
        shutil.rmtree(tmp, ignore_errors=True)


if WITH_ISLAND:
    for p in (PR.FORK, HEALTHY,
              os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16"),
              os.path.join(REPO, "docs", "research", "chapter2-hex-lines-and-flat-green-2026-08-16"),
              os.path.join(REPO, "docs", "research", "chapter2-code-only-art-2026-08-01",
                           "blender-hero-v1")):
        if p not in sys.path:
            sys.path.insert(0, p)
    print("mounting the healthy-island pass (its refusals are this pass's refusals) ...", flush=True)
    CH = _load_healthy()
    import provenance  # noqa: E402  (only reachable once the sibling paths are on sys.path)

    # THE STRICT FILL MASK, and it is not the geometric one. PR #1385's third correction: a geometric
    # top-face mask OVER-reports, because walls are painter-ordered after the cell behind them and
    # `mode_down` is a majority vote. The mask used here is exact instead of geometric — a pixel is a
    # FILL pixel when its delivered colour IS one of the top-face colours the island's own statuses
    # emit. Nothing straddling a boundary and nothing overpainted by a wall can enter it.
    ISLAND_STATUSES = sorted({c["status"] for c in CH.D.ISLAND["capabilities"]})
    if not ISLAND_STATUSES:
        raise SystemExit("measure_palette: the mounted island declares no capability statuses — "
                         "stopping rather than measuring an empty vocabulary")
    fill_colours = {tuple(int(round(float(v))) for v in rgb): (st, idx, m)
                    for st, face, idx, m, rgb in PR.emitted(ISLAND_STATUSES, 3, "top")}

    px = CH.SURFACE_BARE[:, :, :3].astype(np.int32)
    solid = CH.SURFACE_BARE_SOLID
    flat = px[solid]
    keys, inv, counts = np.unique(flat.reshape(-1, 3), axis=0, return_inverse=True, return_counts=True)

    land_px = int(counts.sum())
    fill_px = 0
    foreign = {row: 0 for row, _ in ROWS}
    per_colour = []
    for k, n in zip(keys, counts):
        key = tuple(int(v) for v in k)
        if key not in fill_colours:
            continue
        st, idx, m = fill_colours[key]
        fill_px += int(n)
        rec = {"rgb": PR.hexs(np.array(key, dtype=np.float32)), "authored": st, "token": idx,
               "shade": m, "px": int(n), "readsAs": {}}
        for label, kw in ROWS:
            tbl = PR.reader_table(list(kw.get("reader_statuses") or kw["statuses"]),
                                  kw["faces"], kw["variants"])
            per = {nme: min(PR.dist(np.array(key, dtype=np.float32), e) for e in tbl[nme])
                   for nme in tbl}
            win = min(per, key=lambda nme: per[nme])
            rec["readsAs"][label] = win
            if win != st:
                foreign[label] += int(n)
        per_colour.append(rec)

    if not per_colour:
        raise SystemExit("measure_palette: the delivered raster contained NO exact fill colour. "
                         "That is a broken instrument, not an island with no fills — stopping "
                         "rather than reporting 0%.")

    # THE SAME ISLAND, THE LOOSE MASK — every delivered land pixel whatever surface it came from, so
    # walls, chamfer bands and the coast enter the count. This is the shape of mask PR #1385's
    # `cell_bodies` used for its absolute 13.6%, and its own third correction says why it
    # over-reports: a wall is painter-ordered after the cell behind it and legitimately covers part of
    # that cell's projected top face, and `mode_down` is a majority vote over each supersample block.
    # Reporting both masks side by side is what turns "the reader might be wrong" into a number.
    loose = {row: 0 for row, _ in ROWS}
    for k, n in zip(keys, counts):
        rgb = np.array([int(v) for v in k], dtype=np.float32)
        for label, kw in ROWS:
            tbl = PR.reader_table(list(kw.get("reader_statuses") or kw["statuses"]),
                                  kw["faces"], kw["variants"])
            per = {nme: min(PR.dist(rgb, e) for e in tbl[nme]) for nme in tbl}
            if min(per, key=lambda nme: per[nme]) not in ISLAND_STATUSES:
                loose[label] += int(n)

    REPORT["theIsland"] = {
        "storyId": P.STORY_ID,
        "statusesOnThisIsland": ISLAND_STATUSES,
        "landPx": land_px,
        "fillPx": fill_px,
        "fillPxPctOfLand": round(100.0 * fill_px / max(1, land_px), 1),
        "distinctFillColours": len(per_colour),
        "foreignReadingFillPx": {k: v for k, v in foreign.items()},
        "foreignReadingFillPct": {k: round(100.0 * v / max(1, fill_px), 1) for k, v in foreign.items()},
        "foreignReadingLoosePx": {k: v for k, v in loose.items()},
        "foreignReadingLoosePct": {k: round(100.0 * v / max(1, land_px), 1) for k, v in loose.items()},
        "perColour": per_colour,
        "measuredOn": ("SURFACE_BARE — the delivered island with seams off, NO hero tree and NO "
                       "plants. The tree occludes cells (it cost this track a full re-measure once) "
                       "and body statistics must come from a plant-less canvas."),
        "reading": ("THE DELIVERED RASTER IS CLEAN AND THE SYMPTOM COUNT WAS THE MASK. Under the "
                    "STRICT mask — a pixel whose delivered colour IS one of the top tokens the "
                    "island's own status emits — not one pixel of %d reads as anything but "
                    "`healthy`, under any of the four readers. Under the LOOSE mask, which is the "
                    "shape PR #1385's `cell_bodies` used for its absolute 13.6%%, the same island "
                    "reports a non-zero share, and every pixel of the difference is a wall, a "
                    "chamfer band or the coast — surfaces that are not a status assertion. The "
                    "surfaces differ (this is the as-shipped 3-variant island, that was the "
                    "collapsed one-surface baseline), so this is the same MASK effect rather than a "
                    "reproduction of that exact figure. Note also what this island cannot answer: it "
                    "carries ONE status, and a same-island confusion needs two."
                    % fill_px),
    }

    def picture_island(path):
        """The delivered island with every FILL pixel that reads foreign marked, under the shipped
        reader and under the folded fills-only one."""
        base = CH.SURFACE_BARE[:, :, :3].astype(np.uint8)
        h, w = solid.shape
        panels = []
        for label, _kw in (ROWS[0], ROWS[3]):
            lut = {tuple(int(round(float(x))) for x in
                         np.array([int(r["rgb"][k:k + 2], 16) for k in (1, 3, 5)], dtype=np.float32)):
                   r["readsAs"][label] != r["authored"] for r in per_colour}
            mark = np.zeros((h, w), dtype=bool)
            for key, isbad in lut.items():
                if isbad:
                    mark |= np.all(px == np.array(key, dtype=np.int32), axis=2) & solid
            pan = base.copy()
            pan[mark] = np.array(BAD, dtype=np.uint8)
            panels.append((label, pan, int(mark.sum())))
        pw = panels[0][1].shape[1]
        img = Image.new("RGB", (pw * 2 + 72, panels[0][1].shape[0] + 96), BOARD)
        dr = ImageDraw.Draw(img)
        _text(dr, (24, 20), "THE DELIVERED ISLAND - fill pixels that read as a status other than "
                            "`healthy`, which authored every one of them")
        for i, (label, pan, n) in enumerate(panels):
            x = 24 + i * (pw + 24)
            img.paste(Image.fromarray(pan), (x, 68))
            _text(dr, (x, 44), "%s - %d px (%.1f%% of fills)"
                  % (label, n, 100.0 * n / max(1, fill_px)), BAD if n else GOOD)
        img.save(path)

    picture_island(os.path.join(OUT, "island-read.png"))
    PICTURES.append("island-read.png")
else:
    CH = None
    REPORT["theIsland"] = {"skipped": "--no-island"}


# =====================================================================================================
# 8. WRITE
# =====================================================================================================
with open(os.path.join(OUT, "foreign-status-report.json"), "w") as fh:
    json.dump(REPORT, fh, indent=1)

if CH is not None:
    for pic in PICTURES:
        provenance.write_sidecar(
            os.path.join(OUT, pic), __file__, sys.argv[1:], CH.INPUTS, CH.CODE_STATE,
            extra={"cameraElevationDeg": C.ELEV, "storyId": P.STORY_ID,
                   "variant": "palette measurement only — no land re-composition, 0 Blender frames",
                   "matchedGapShippedFills": REPORT["matchedCondition"]["shippedFills"]["gap"],
                   "bar": REPORT["matchedCondition"]["shippedFills"]["bar"],
                   "island": {"sha256": provenance.sha256_file(CH.ISLAND_PATH)},
                   "proof": {"sha256": provenance.sha256_file(CH.PROOF_PATH)}})

_m = REPORT["matchedCondition"]
print("reader rows: " + " | ".join("%s %d/%d" % (k.split()[0], v["crossReading"], v["entries"])
                                   for k, v in REPORT["theReaderVaried"].items()))
print("matched-condition fills: shipped %.2f dE (bar %.2f) -> collapsed %.2f dE"
      % (_m["shippedFills"]["gap"]["dE"], _m["shippedFills"]["bar"]["dE"],
         _m["collapsedFills"]["gap"]["dE"]))
print("app (no shade ladder): %.2f dE  %s vs %s"
      % (REPORT["theShippedApp"]["matchedGapFills"]["dE"],
         REPORT["theShippedApp"]["matchedGapFills"]["a"]["rgb"],
         REPORT["theShippedApp"]["matchedGapFills"]["b"]["rgb"]))
print("palette entries %d -> %d   binding ceiling %s -> %s"
      % (REPORT["thePrice"]["shippedPaletteEntries"], REPORT["thePrice"]["collapsedPaletteEntries"],
         REPORT["theCeilings"]["asPR1385Measured"]["_binding"],
         REPORT["theCeilings"]["collapsed"]["_binding"]))
print("wrote %s + foreign-status-report.json" % ", ".join(PICTURES))
