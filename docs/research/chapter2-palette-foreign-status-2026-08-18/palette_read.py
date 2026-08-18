#!/usr/bin/env python3
"""DOES THE LAND EMIT A COLOUR THAT READS AS A STATUS OTHER THAN THE ONE THAT AUTHORED IT?

The instrument only. `measure_palette.py` drives it; `verify.py` / `verify_refusal.py` hold it to
account. NOTHING here restates a token table, a shade level, a status vocabulary or a distance
metric: every one of those is imported from the module that already owns it, because a second copy
of the palette is precisely the defect this pass exists to measure.

    tokens / shade levels / W_LUMA  <- chapter2-land-interior-fork-2026-08-15/compose.py
    the RENDERED vocabulary         <- chapter2-healthy-island-2026-08-16/island_pass.py
    safe_depth (the ceiling)        <- chapter2-one-surface-and-shadow-2026-08-17/shadow.py

WHY THIS PASS EXISTS. PR #1385 built a semantic-confusability guard for a shadow and found, on the
way, that the ABSOLUTE form of it condemns the shipped art before any shadow is applied: *"21 of the
78 colours the land may already emit read as a status OTHER than the one that authored them, at full
light"*. It correctly narrowed its own guard to a DELTA (the shadow must not CHANGE what a pixel
says, delivered 0 of 12 457) and left the absolute finding standing, unadjudicated. The increment
`land-palette-emits-no-colour-that-reads-as-a-foreign-status` asks the question that leaves open:
**is that a real misread, or an artefact of the reader?**

THE ANSWER IS BOTH, AND THE TWO HALVES POINT OPPOSITE WAYS — which is why the instrument below is
four readers rather than one.

  * The 21/78 OVER-counts. It is measured over `faces="all"`, the table PR #1385's own guard
    deliberately does not assert on, and over all SIX schema statuses — but `worldStatus.ts` folds
    `unhealthy -> mapped` (ADR-0296) and `building -> proposed` (ADR-0038), so a third of the count
    involves a token that cannot be rendered at either end. Both of its named headline instances are
    affected: *"`healthy`'s dark WALL band reads `unhealthy`"* names an UNREACHABLE target and
    dissolves entirely; *"`unknown`'s whole SIDE family reads `healthy`"* survives.

  * And it UNDER-counts, because it never asked the question at MATCHED CONDITION. Its reader
    classifies a SHADED colour against a table of UNSHADED tokens, so a critic can always answer
    "you compared a shadowed pixel to a lit swatch". Take that objection away completely — compare
    two statuses only where they are rendered on the SAME FACE under the SAME LIGHT, which is what a
    viewer sees on one island — and the defect does not go away. It gets sharper and it names one
    pair.

`matched_gap` below is that test, and it is the one this pass stands on. It has no reader table, no
asymmetry and no threshold; it is a distance between two colours the land actually draws side by
side.
"""
import importlib.util
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
FORK = os.path.join(REPO, "docs", "research", "chapter2-land-interior-fork-2026-08-15")
HEALTHY = os.path.join(REPO, "docs", "research", "chapter2-healthy-island-2026-08-16")
SHADOW = os.path.join(REPO, "docs", "research", "chapter2-one-surface-and-shadow-2026-08-17")


def _load(name, path):
    """Import a sibling pass's module by PATH, loudly.

    `verify.py` on this track has twice reported a false pass because a harness died before reaching
    the thing under test (#1382's five `FileNotFoundError`s; #1385's `exec`'d composer with `__file__`
    undefined). A missing sibling is a hard stop here, with the path in the message, so that failure
    can never present as a measurement.
    """
    if not os.path.isfile(path):
        raise SystemExit("palette_read: cannot import %s — no such file: %s" % (name, path))
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise SystemExit("palette_read: no import spec for %s at %s" % (name, path))
    mod = importlib.util.module_from_spec(spec)
    cwd = os.getcwd()
    try:
        os.chdir(os.path.dirname(path))
        spec.loader.exec_module(mod)
    finally:
        os.chdir(cwd)
    return mod


C = _load("palette_read_compose", os.path.join(FORK, "compose.py"))
P = _load("palette_read_island_pass", os.path.join(HEALTHY, "island_pass.py"))
SH = _load("palette_read_shadow", os.path.join(SHADOW, "shadow.py"))

#: The four statuses the shipped map can actually draw. IMPORTED, never restated — `island_pass.py`
#: owns it and the healthy-island pass's own `verify.py` re-derives it from `worldStatus.ts`.
RENDERED = tuple(P.RENDERED_VOCABULARY)
#: All six schema statuses, as the token table declares them.
ALL_STATUSES = tuple(C.STATUS_TOKENS)

#: The shade levels a TOP face and a SIDE face may be painted at — read out of `compose.build_palette`'s
#: own arithmetic rather than re-listed, so a change to `KEY_SHADE` reaches this instrument.
TOP_LEVELS = tuple(sorted({C.FLAT_LEVEL, C.SEAM_LEVEL,
                           C.KEY_SHADE["chamfer_lit"], C.KEY_SHADE["chamfer_dark"]}))
SIDE_LEVELS = tuple(sorted(set(C.KEY_SHADE.values())))

#: How many top tokens a status emits as shipped. `substrate.ts:237` picks one of three per cell by
#: hash, so all three are live on any island with enough cells.
SHIPPED_VARIANTS = 3


def hexs(rgb):
    return "#%02x%02x%02x" % tuple(int(round(float(v))) for v in rgb)


def dist(a, b):
    """Distance in the SAME luma-weighted space `compose.snap` quantises in, so this instrument and
    the quantiser can never disagree about what "near" means. `C.W_LUMA`, never Rec.709 — the arc's
    78.9 / 58.2 / 61.6 luma series is in this space and a Rec.709 number would look comparable to it
    while not being."""
    d = np.asarray(a, dtype=np.float32) - np.asarray(b, dtype=np.float32)
    return float(np.sqrt(float(((d ** 2) * C.W_LUMA).sum())))


def emitted(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="all"):
    """The closed set of colours the land may emit, as (status, face, token_index, shade, rgb).

    Enumerated exactly as `compose.build_palette` closes it — every authored token times every
    authored shade level for its face — minus WHEAT, and minus the coast.

    WHEAT IS EXCLUDED AND THAT IS NOT A CONVENIENCE. Five of the six statuses share the IDENTICAL
    wheat hex `#d6b271` (`compose.py:77`), recorded by PR #1372: a wheat cell reports no status by
    colour AT ALL. It is not a confusable colour, it is an absent assertion — a different defect,
    already surfaced by PR #1385 §7 as a story-author question, and including it here would make
    every status equidistant from every wheat pixel and drown the measurement this pass is for.
    The COAST is excluded because sand is not a status assertion; it belongs to no capability.
    """
    out = []
    for st in statuses:
        tok = C.STATUS_TOKENS[st]
        for i, t in enumerate(tok["top"][:variants]):
            for m in TOP_LEVELS:
                out.append((st, "top", i, m, C.shade(C.hexrgb(t), m)))
        if faces == "all":
            for m in SIDE_LEVELS:
                out.append((st, "side", 0, m, C.shade(C.hexrgb(tok["side"]), m)))
    return out


# =====================================================================================================
# 1. THE TEST THIS PASS STANDS ON — matched condition
# =====================================================================================================
def matched_gap(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="top"):
    """THE DECISIVE TEST: the closest two colours that DIFFERENT statuses emit on the SAME face under
    the SAME light, and the witness pair.

    Every objection available to the asymmetric reader is unavailable here. There is no reader table,
    so nothing can be wrong with it. There is no shaded-versus-unshaded comparison, so "you darkened
    one side" cannot be said. There is no threshold inside the measurement. It is the distance
    between two pixels a viewer can see beside each other on one island, at one moment, under one
    light — which is the only situation in which a status tint has to do its job.

    `faces="top"` by default because ADR-0367 D5 is stated about the FILL — *"land cells ARE the
    capability, each cell's FILL carrying its status tint"* — and because PR #1385's second correction
    was exactly this: a wall is the same cell's side face, not a second assertion. `faces="all"` is
    reported beside it and asserted on separately.
    """
    E = emitted(statuses, variants, faces)
    best = None
    for a, b in itertools.combinations(E, 2):
        if a[0] == b[0] or a[1] != b[1] or a[3] != b[3]:
            continue                      # different status, SAME face, SAME shade — or not compared
        d = dist(a[4], b[4])
        if best is None or d < best[0]:
            best = (d, a, b)
    if best is None:
        raise SystemExit("palette_read.matched_gap: no cross-status matched pair exists — "
                         "the configuration has fewer than two statuses, so nothing was measured")
    d, a, b = best
    return {"dE": round(d, 2),
            "face": a[1], "shade": a[3],
            "a": {"status": a[0], "token": a[2], "rgb": hexs(a[4])},
            "b": {"status": b[0], "token": b[2], "rgb": hexs(b[4])}}


def within_matched(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="top"):
    """The closest two colours ONE status emits on the same face under the same light — the distance
    the design has already declared MEANINGLESS.

    `substrate.ts:237` picks a cell's variant by `hash(...) % 3`; nothing reads it, nothing derives
    from it, it exists for 2D texture variety. So this number is the size of a difference a viewer is
    meant to ignore. Returns None when a status emits one colour per condition (the collapsed
    configuration), because then there is no such difference to ignore.
    """
    E = emitted(statuses, variants, faces)
    best = None
    for a, b in itertools.combinations(E, 2):
        if a[0] != b[0] or a[1] != b[1] or a[3] != b[3]:
            continue
        d = dist(a[4], b[4])
        if best is None or d < best[0]:
            best = (d, a, b)
    if best is None:
        return None
    d, a, b = best
    return {"dE": round(d, 2), "status": a[0], "face": a[1], "shade": a[3],
            "a": hexs(a[4]), "b": hexs(b[4])}


def shallowest_shade_rung(statuses=RENDERED, faces=None):
    """THE BAR, and it is DERIVED from the table rather than chosen.

    The smallest luminance step the land itself authors as *"the same status, different light"* — one
    adjacent pair of shade rungs on one FILL token. Any smaller step is, by the palette's own
    construction, not a status change.

    So the admissibility rule reads in one sentence: **two statuses must be further apart, where they
    are rendered alike, than one status is from itself one shade rung away.** Status must outweigh
    light. That is ADR-0367 D5 — *"a cell's capability status tint is SEMANTIC STATE and outranks the
    art"* — as a number, and it is the same sentence the shadow-ladder increment has to satisfy, which
    is why the bar is derived here rather than invented there.

    THE BAR IS ALWAYS THE FILL LADDER, and `faces` is accepted only so a caller cannot silently ask
    for the other one. Taking it from the SIDE ladder would make the rule vacuous, for a reason that
    is itself a finding — see `side_ladder_degenerate()`.
    """
    if faces not in (None, "top"):
        raise SystemExit("palette_read.shallowest_shade_rung: the bar is the FILL ladder by "
                         "construction; %r was asked for. See side_ladder_degenerate()." % (faces,))
    best = None
    for st in statuses:
        for t in C.STATUS_TOKENS[st]["top"]:
            rgb = C.hexrgb(t)
            for lo, hi in zip(TOP_LEVELS, TOP_LEVELS[1:]):
                d = dist(C.shade(rgb, lo), C.shade(rgb, hi))
                if best is None or d < best[0]:
                    best = (d, st, t, lo, hi)
    d, st, t, lo, hi = best
    return {"dE": round(d, 2), "status": st, "token": t, "from": hi, "to": lo}


def side_ladder_degenerate(statuses=RENDERED):
    """A SEPARATE, smaller defect found while deriving the bar, reported so it is not mistaken for a
    tuning choice: the SIDE family receives two shade levels 0.02 apart.

    `compose.build_palette` gives the side token every level in `KEY_SHADE`, and that dict holds
    `chamfer_dark = 0.78` alongside `wall_dark = 0.80` — two different BAND KEYS which happen to land
    on the same family. The result is a within-status pair about 2.2 dE apart: two palette entries no
    reader can tell apart, occupying two slots, and low enough to make any bar derived from the side
    ladder meaningless. It costs correctness nothing today (both are the same status) and it is why
    the bar above is the fill ladder.
    """
    out = []
    for st in statuses:
        rgb = C.hexrgb(C.STATUS_TOKENS[st]["side"])
        for lo, hi in itertools.combinations(SIDE_LEVELS, 2):
            d = dist(C.shade(rgb, lo), C.shade(rgb, hi))
            if d < 3.0:
                out.append({"status": st, "levels": [lo, hi], "dE": round(d, 2),
                            "a": hexs(C.shade(rgb, lo)), "b": hexs(C.shade(rgb, hi))})
    return out


def admissible(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="top"):
    """The REFUSAL, as a verdict object. `ok` False means the emitted set contains two statuses closer
    than the palette's own shade rung, i.e. a light difference and a status difference are the same
    size and a reader cannot tell them apart.

    This is a gate, not a report line: `measure_palette.py` declines to write the composed land
    picture when it fires, following PR #1382's call — *"a report explaining afterwards that the
    island was fabricated is not the same object as a composer that declines to draw one."*
    """
    gap = matched_gap(statuses, variants, faces)
    bar = shallowest_shade_rung(statuses, faces)
    within = within_matched(statuses, variants, faces)
    return {"ok": gap["dE"] >= bar["dE"],
            "gap": gap, "bar": bar, "withinStatus": within,
            "ratio": round(gap["dE"] / bar["dE"], 3) if bar["dE"] else None,
            "inverted": bool(within and gap["dE"] < within["dE"])}


# =====================================================================================================
# 2. THE READER PR #1385 USED — reproduced exactly, then varied one axis at a time
# =====================================================================================================
def reader_table(statuses, faces, variants=SHIPPED_VARIANTS):
    """`shadow.reader_status_table` with two axes opened up: WHICH statuses a reader knows, and how
    many top variants each of them has. The shipped call is `(ALL_STATUSES, faces, 3)`."""
    return {st: np.array([C.hexrgb(t) for t in C.STATUS_TOKENS[st]["top"][:variants]]
                         + ([C.hexrgb(C.STATUS_TOKENS[st]["side"])] if faces == "all" else []),
                         dtype=np.float32)
            for st in statuses}


def cross_reads(statuses=ALL_STATUSES, faces="all", variants=SHIPPED_VARIANTS,
                reader_statuses=None, reader_variants=None):
    """PR #1385's own count, re-derived: how many of the colours the land may emit read NEAREST to a
    status other than the one that authored them.

    Called with the defaults this reproduces `crossReadsBeforeAnyShadow` exactly — 21 of 78 — which is
    the point: the reader is not replaced, it is re-run with its knowledge restricted to what the app
    can render, so the two numbers are comparable.

    `margin` is the discriminator this pass adds, and it is what settles artefact-versus-real for each
    individual entry: a nearest-neighbour classifier over a sparse table always returns SOMETHING, so
    a cross-read at a 0.6% margin is a tie between two distant swatches and a cross-read at an 82%
    margin is the colour sitting inside another family's neighbourhood.
    """
    rs = list(reader_statuses if reader_statuses is not None else statuses)
    rv = variants if reader_variants is None else reader_variants
    table = reader_table(rs, faces, rv)
    names = sorted(table)
    out = {"entries": 0, "crossReading": 0, "examples": []}
    for st, face, idx, m, rgb in emitted(statuses, variants, faces):
        per = {n: min(dist(rgb, e) for e in table[n]) for n in names}
        win = min(per, key=lambda n: per[n])
        out["entries"] += 1
        if win != st:
            own = per.get(st)
            out["crossReading"] += 1
            out["examples"].append({
                "authored": st, "face": face, "token": idx, "shade": m, "rgb": hexs(rgb),
                "readsAs": win,
                "dEwin": round(per[win], 1),
                "dEown": (round(own, 1) if own is not None else None),
                "marginPct": (round(100.0 * (own - per[win]) / own, 1)
                              if own not in (None, 0) else None),
                # a cross-read that cannot occur because one END of it is a token the app never draws
                "reachable": bool(st in RENDERED and win in RENDERED),
            })
    out["pct"] = round(100.0 * out["crossReading"] / max(1, out["entries"]), 1)
    out["reachableCrossReading"] = sum(1 for e in out["examples"] if e["reachable"])
    return out


def nearest_other_status(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="top"):
    """The SYMMETRIC reader — the shaded-versus-unshaded objection removed a second, independent way.

    Every emitted colour is classified against every OTHER emitted colour, each labelled by the status
    that authored it. A colour "cross-reads" when the nearest colour the land draws anywhere is one
    another status drew. This asks less than `matched_gap` (it will pair a shadowed pixel with a lit
    one) and more than `cross_reads` (the reader now knows the whole delivered vocabulary, not just
    the lit swatches), so agreement between the three is what makes the verdict robust.
    """
    E = emitted(statuses, variants, faces)
    bad = []
    for i, (st, f, idx, m, rgb) in enumerate(E):
        best, own = None, None
        for j, (st2, f2, idx2, m2, rgb2) in enumerate(E):
            if i == j:
                continue
            d = dist(rgb, rgb2)
            if st2 == st and (own is None or d < own):
                own = d
            if best is None or d < best[0]:
                best = (d, st2, f2, m2, rgb2)
        if best[1] != st:
            bad.append({"authored": st, "face": f, "token": idx, "shade": m, "rgb": hexs(rgb),
                        "nearest": best[1], "nearestFace": best[2], "nearestShade": best[3],
                        "nearestRgb": hexs(best[4]),
                        "dEwin": round(best[0], 1),
                        "dEown": (round(own, 1) if own is not None else None)})
    return {"entries": len(E), "crossReading": len(bad), "examples": bad,
            "pct": round(100.0 * len(bad) / max(1, len(E)), 1)}


# =====================================================================================================
# 3. THE SHADOW CEILING — the number the NEXT increment needs
# =====================================================================================================
def ceilings(statuses=RENDERED, variants=SHIPPED_VARIANTS, faces="top", reader_statuses=None):
    """The per-status confusability ceiling, through `shadow.safe_depth` — the arc's OWN instrument,
    imported rather than reimplemented so this row is comparable to the 0.74 / 0.76 / 0.88 / 0.91
    series PR #1385 recorded.

    Read the direction correctly, because it is counter-intuitive and easy to invert: the ceiling is
    the DEEPEST multiplier at which a status's fill still reads as itself, so a LOWER number is MORE
    headroom. A ladder is admissible on a mixed island when its deepest rung sits BELOW the MAXIMUM of
    the ceilings present, not the minimum.
    """
    table = reader_table(reader_statuses or statuses, faces, variants)
    out = {}
    for st in statuses:
        fill = C.hexrgb(C.STATUS_TOKENS[st]["top"][0])
        depth, read0 = SH.safe_depth(C, fill, table)
        out[st] = {"fill": hexs(fill), "ceiling": round(float(depth), 2), "readsAsAtFullLight": read0}
    out["_binding"] = max(v["ceiling"] for k, v in out.items() if not k.startswith("_"))
    return out


def palette_entries(statuses=ALL_STATUSES, variants=SHIPPED_VARIANTS):
    """`compose.build_palette` re-run at a given variant count — THE PRICE, in the arc's own currency.

    Every other move this track has priced ADDED entries (the shadow ladder +374 over the shipped 132,
    micro-relief +619). This function exists so the answer to *"what does this fix cost"* is a measured
    number in the same unit rather than a reassurance.
    """
    pal = set()
    for st in statuses:
        tok = C.STATUS_TOKENS[st]
        for t in list(tok["top"][:variants]) + [tok["wheat"]]:
            for m in TOP_LEVELS:
                pal.add(tuple(int(round(float(v))) for v in C.shade(C.hexrgb(t), m)))
        for m in SIDE_LEVELS:
            pal.add(tuple(int(round(float(v))) for v in C.shade(C.hexrgb(tok["side"]), m)))
    for c in (C.COAST_SAND, C.COAST_SAND_EDGE):
        pal.add(tuple(int(round(float(v))) for v in C.hexrgb(c)))
    return len(pal)


# =====================================================================================================
# 4. THE SHIPPED APP — a different emitted set, measured rather than assumed exempt
# =====================================================================================================
#: Where the app's ground colours actually live, named so `verify.py` can re-read them rather than
#: trust this module.
APP_CSS = os.path.join(REPO, "apps", "studio", "src", "index.css")
APP_SUBSTRATE = os.path.join(REPO, "packages", "forest-world", "src", "substrate.ts")


def app_emitted(statuses=RENDERED):
    """What the SHIPPED app may emit for a land cell — and it is NOT the research pipeline's set.

    The research path is `emit_island.ts -> blender_land.py -> the closed-palette snap`, and every
    colour in it is a token times one of the `KEY_SHADE` band levels, because the pieces are rendered
    3D faces. The app path is `substrate.ts -> scene.ts -> index.css`: an SVG fill taking a CSS
    variable, with NO shade ladder at all — `--hex-top-0/1/2` and `--hex-side` per status, redefined
    inside the `.hex-territory.st-<status>` blocks, colour-is-class (ADR-0093 §4).

    So the app emits FOUR colours per status where the research pipeline emits THIRTEEN. The increment
    required this comparison explicitly — *"do not assume the app is exempt just because the grass
    defect was research-only"* — and the answer is that it is not exempt: the same two families
    overlap inside the SMALLER set, at full light, with no shading, no Blender and no quantiser
    anywhere near it.
    """
    out = []
    for st in statuses:
        tok = C.STATUS_TOKENS[st]
        for i, t in enumerate(tok["top"]):
            out.append((st, "top", i, 1.0, C.hexrgb(t)))
        out.append((st, "side", 0, 1.0, C.hexrgb(tok["side"])))
    return out


def app_matched_gap(statuses=RENDERED, faces="top"):
    """`matched_gap` over the app's own emitted set. There is one light condition, so "matched"
    reduces to "same face" — which is the point: the app has no light axis to hide behind."""
    E = [e for e in app_emitted(statuses) if faces == "all" or e[1] == "top"]
    best = None
    for a, b in itertools.combinations(E, 2):
        if a[0] == b[0] or a[1] != b[1]:
            continue
        d = dist(a[4], b[4])
        if best is None or d < best[0]:
            best = (d, a, b)
    d, a, b = best
    return {"dE": round(d, 2), "face": a[1],
            "a": {"status": a[0], "token": a[2], "rgb": hexs(a[4])},
            "b": {"status": b[0], "token": b[2], "rgb": hexs(b[4])}}


def variant_collision_rate(statuses=RENDERED, bar=None):
    """How often the app actually DRAWS a colliding pair, given that the variant is a hash.

    `substrate.ts:237` picks one of three top tokens per cell — `variant: hash(...) % 3` — uniformly,
    and independently of the cell's status. So for two adjacent cells owned by different statuses, the
    chance the pair drawn is a colliding one is the number of colliding (variant, variant)
    combinations over nine.
    """
    bar = shallowest_shade_rung(statuses)["dE"] if bar is None else bar
    out = {}
    for a, b in itertools.combinations(statuses, 2):
        hits = [(i, j) for i in range(3) for j in range(3)
                if dist(C.hexrgb(C.STATUS_TOKENS[a]["top"][i]),
                        C.hexrgb(C.STATUS_TOKENS[b]["top"][j])) < bar]
        out["%s|%s" % (a, b)] = {"collidingVariantPairs": len(hits), "of": 9,
                                 "rate": round(len(hits) / 9.0, 3), "pairs": hits}
    return out


def null_status_is_the_unknown_family():
    """WHERE `unknown` COMES FROM, read out of the app rather than asserted — and it is NOT a status.

    `packages/library/src/schema.ts` enumerates six statuses and `unknown` is not among them; neither
    is it in `apps/studio/src/types.ts`'s `WorkStatus`. What `TreeView.tsx` does is stamp
    `st-${cap.status ?? 'unknown'}`, so `unknown` is the NULL-STATUS FALLBACK class — and `index.css`
    defines `.hex-territory.st-<status>` blocks for proposed / building / healthy / mapped /
    unhealthy and NONE for unknown, saying so in its own comment: *"`unknown` alone keeps the base
    family"*.

    That is what makes the direction of this collision the worst one available, and it CONFIRMS the
    increment's phrasing rather than softening it. A cell wearing the base family is a unit whose
    status is not known; a cell wearing `healthy` green is one carrying a SIGNED PASS, which ADR-0040
    makes the only source of green there is. Absence of information rendered as proof is the exact
    failure ADR-0040 exists to prevent, reached through the palette instead of through the fold.
    """
    import re
    css = open(APP_CSS, encoding="utf-8").read()
    blocks = sorted(set(re.findall(r"\.hex-territory\.st-([a-z]+)\s*\{", css)))
    schema = open(os.path.join(REPO, "packages", "library", "src", "schema.ts"), encoding="utf-8").read()
    enum = re.search(r"export const Status = z\.enum\(\[(.*?)\]\)", schema, re.S)
    schema_statuses = sorted(re.findall(r'"([a-z]+)"', enum.group(1))) if enum else []
    return {"schemaStatuses": schema_statuses,
            "unknownIsASchemaStatus": "unknown" in schema_statuses,
            "cssTerritoryBlocks": blocks,
            "unknownHasItsOwnBlock": "unknown" in blocks,
            "baseFamily": {"top": [hexs(C.hexrgb(t)) for t in C.STATUS_TOKENS["unknown"]["top"]],
                           "side": hexs(C.hexrgb(C.STATUS_TOKENS["unknown"]["side"]))},
            "reading": ("`unknown` is the null-status fallback class, not a schema status; it has no "
                        "`.hex-territory` block and so inherits `:root`'s base grass family. A cell "
                        "wearing it asserts NOTHING about a capability, and it is the family that "
                        "collides with `healthy`, which asserts a signed pass (ADR-0040).")}


def corpus_exposure(census_path=None):
    """WHO ACTUALLY DRAWS THE COLLIDING PAIR TODAY — the difference between a latent defect and an
    active misdraw, and the reason this pass does not report the palette count as a delivered harm.

    Read from the healthy-island pass's committed whole-corpus census (46 stories / 244 capabilities,
    folded through the app's own `provenStatus`), so it is the real corpus rather than a fixture.
    `renderedMix` per story is the set of statuses one island draws, and two statuses can only be
    confused with each other if some island draws both.
    """
    import json as _json
    path = census_path or os.path.join(HEALTHY, "census.json")
    if not os.path.isfile(path):
        raise SystemExit("palette_read.corpus_exposure: no census at %s" % path)
    census = _json.load(open(path, encoding="utf-8"))
    rows = [r for r in census["rows"] if r.get("rendersOnMap")]
    if not rows:
        raise SystemExit("palette_read.corpus_exposure: census has no map-rendering stories — "
                         "the file parsed but says nothing, which is not a measurement")
    pairs, presence = {}, {}
    for r in rows:
        present = sorted(k for k in r["renderedMix"] if r["renderedMix"][k])
        for k in present:
            presence[k] = presence.get(k, 0) + 1
        for a, b in itertools.combinations(present, 2):
            pairs.setdefault("%s|%s" % (a, b), []).append(r["story"])
    return {"censusReadAt": census.get("readAt"),
            "storiesRenderingOnMap": len(rows),
            "capabilities": census["totals"]["capabilities"],
            "statusPresentOnNStories": presence,
            "coDrawnPairs": {k: len(v) for k, v in sorted(pairs.items())},
            "coDrawnPairStories": {k: sorted(v) for k, v in sorted(pairs.items())}}
