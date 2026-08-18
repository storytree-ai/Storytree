#!/usr/bin/env python3
"""THE FOURTH COMPOSITOR SITE, measured before and after — and made to fire in both directions.

    python dressed_fix.py           # the measurement + dressed-fix-report.json   (~3 min)

WHAT WAS WRONG. PR #1383 diagnosed a painter-order defect and PR #1387 fixed it in `compose_core.py`
together with the `caps` wall authority. Neither fix reached
`chapter2-island-place-dressing-2026-08-16/compose_dressed.py`, which keeps its OWN copy of the
draw-list assembly and does not import `compose_core` at all. So every delivered dressing picture -
`island-dressed.png`, `dressing-layers.png`, `dressing-density.png`, `status-vocabulary.png` and the
detail crop the component art was judged on - was composed with:

  * a placement sorting on its OWN ground y alone, so any placement in the back half of its own cell
    was overpainted by that cell's fill (`C.fill_polygon` is a hard write);
  * `C.boundary_walls` reading the module global `C.CAPS` while the cells read the `caps` ARGUMENT,
    so `status-vocabulary.png` - the sheet that settles what each status LOOKS LIKE - drove five
    panels through `caps=` whose walls all kept the original island's mixed statuses.

THE REPAIR IS AN IMPORT, NOT A FIFTH COPY. `compose_dressed` now calls `compose_core.decor_depth_key`
and `compose_core.walls_under_caps`. Because a callee resolves its globals in the module that DEFINES
it, `compose_core`'s two switches now reach this compositor too - which is the aliasing property that
silently disarmed two monkey-patches on this track in PR #1393, used deliberately instead of walked
into. This file proves that by driving BOTH switches through the dressing compositor and showing the
defect return.

TWO INSTRUMENTS, BOTH CHOSEN TO NEED NO SECOND IMPLEMENTATION OF ANYTHING:

  1. OCCLUSION is measured with an OWNERSHIP STAMP. `paste_decor` is temporarily replaced by one that
     writes a flat per-placement code instead of the piece's shaded tokens, so after the composite the
     supersampled canvas says directly which placement still owns which pixel. A placement owning ZERO
     supersampled pixels was painted and then completely overpainted - which is exactly the defect,
     measured before the downsample so quantisation cannot be confused with occlusion. Nothing else in
     the draw list changes, so the sort under test is the real one.

  2. THE WALLS are measured by BYTE EQUALITY, not by a colour table. Composing `caps=all_healthy` while
     the module global still holds the island's real statuses must produce a raster byte-identical to
     composing it with the global ALSO set to all_healthy. If the argument is authoritative they agree;
     if it is not, they differ by exactly the wall pixels. That avoids restating the order-and-caps
     pass's `unhealthy_colour_sets()` instrument, which would be a second thing that can drift - and it
     is a stronger claim, because it admits no colour the table might have missed.

THE FENCE. Everything written is under `docs/research/**`. `LAND_CAMERA_ELEVATION_DEG` is neither read
nor written; this pass composes at the research track's 50 deg named parameter, inherited from the
island. No Blender render: every piece is a committed PNG.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESEARCH = os.path.join(REPO, "docs", "research")
DRESSING = os.path.join(RESEARCH, "chapter2-island-place-dressing-2026-08-16")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")

# The dressing directory FIRST: it owns `dressing.py` and its own `scatter.py`, and `compose_dressed`
# imports both by bare name. GRASS is reachable because `compose_dressed` appends it itself.
sys.path.insert(0, DRESSING)
sys.path.insert(0, os.path.join(RESEARCH, "chapter2-code-only-art-2026-08-01", "blender-hero-v1"))

import compose_dressed as DR    # noqa: E402  the fourth site, imported rather than reimplemented
import compose_core as CORE     # noqa: E402  the canonical home of both rules
import scatter                  # noqa: E402


def ownership_stamp(canvas, alpha, piece, cx, cy, roles, role_map):
    """`DR.paste_decor`'s blit, writing a FLAT per-placement code instead of shaded tokens.

    Copied from `DR.paste_decor` in exactly one respect - the geometry - and deliberately not in the
    other: the token/level resolution is replaced by one constant, because the question is WHICH
    PLACEMENT owns a pixel and a shaded piece answers it in several colours. The blit arithmetic is
    the same three lines (`x0`/`y0` from the projected centre, clipped to the canvas), so a placement
    stamps exactly the pixels its real paint op would.
    """
    code = roles["__code__"]
    _keys, idx, mask = piece
    h, w = mask.shape
    x0 = int(round(cx * DR.C.SS - w / 2.0))
    y0 = int(round(cy * DR.C.SS - h / 2.0))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(canvas.shape[1], x0 + w), min(canvas.shape[0], y0 + h)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sub_m = mask[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    canvas[sy0:sy1, sx0:sx1] = np.where(sub_m[:, :, None],
                                        np.array(code, dtype=np.float32),
                                        canvas[sy0:sy1, sx0:sx1])
    alpha[sy0:sy1, sx0:sx1] = np.where(sub_m, 1.0, alpha[sy0:sy1, sx0:sx1])


def codes_for(n):
    """`n` colours no land drawable can emit, so ownership is unambiguous.

    Land and decor tokens are all real hex colours in 0..255. These sit at 1000 + i on the RED channel
    of a float32 canvas, which nothing in the pipeline can produce and which `assert_codes_unique`
    checks against the bare canvas rather than assuming.
    """
    return [(1000.0 + i, 0.0, 0.0) for i in range(n)]


def occlusion(items, cells, sorts_after):
    """How many placements own ZERO supersampled pixels once the composite is finished."""
    saved_switch = CORE.DECOR_SORTS_AFTER_ITS_CELL
    saved_paste = DR.paste_decor
    CORE.DECOR_SORTS_AFTER_ITS_CELL = sorts_after
    DR.paste_decor = ownership_stamp
    try:
        codes = codes_for(len(items))
        stamped = [{**it, "roles": {**it["roles"], "__code__": codes[i]}}
                   for i, it in enumerate(items)]
        canvas, _alpha, _h = DR.compose_land(stamped, cells=cells)
        bare, _ba, _bh = DR.compose_land([], cells=cells)
    finally:
        CORE.DECOR_SORTS_AFTER_ITS_CELL = saved_switch
        DR.paste_decor = saved_paste

    # the codes must be unreachable by the land itself, or "owns zero" would be a colour collision
    assert float(bare[:, :, 0].max()) < 1000.0, (
        "REFUSED: the land canvas already reaches the ownership code range, so an ownership read "
        "would be a colour collision rather than a measurement")

    red = canvas[:, :, 0]
    owned = []
    for i in range(len(items)):
        owned.append(int((red == np.float32(1000.0 + i)).sum()))
    zero = [i for i, n in enumerate(owned) if n == 0]
    return {
        "placements": len(items),
        "ownZeroSupersampledPx": len(zero),
        "ownZeroPct": round(100.0 * len(zero) / max(1, len(items)), 1),
        "totalOwnedSupersampledPx": int(sum(owned)),
        "medianOwnedSupersampledPxPerSurvivor":
            int(np.median([n for n in owned if n > 0])) if any(owned) else 0,
    }


def wall_authority(items, cells, authoritative):
    """Does `caps=` reach the walls? Asked by BYTE EQUALITY against the same composite driven twice."""
    saved_switch = CORE.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS
    saved_caps = list(DR.C.CAPS)
    healthy = ["healthy"] * len(DR.C.CAPS)
    CORE.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS = authoritative
    try:
        # (a) the argument alone, module global left at the island's REAL statuses
        arg_only, aa, _h1 = DR.compose_land(items, cells=cells, caps=healthy)
        # (b) ground truth: the global set to all-healthy as well
        DR.C.CAPS = healthy
        both, ab, _h2 = DR.compose_land(items, cells=cells, caps=healthy)
    finally:
        DR.C.CAPS = saved_caps
        CORE.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS = saved_switch

    diff = np.any(arg_only != both, axis=2) & ((aa > 0.5) | (ab > 0.5))
    n_ss = int(diff.sum())
    colours = {}
    if n_ss:
        px = arg_only[diff]
        for c, n in zip(*np.unique(px.astype(np.int64), axis=0, return_counts=True)):
            colours["#%02x%02x%02x" % tuple(int(v) for v in c)] = int(n)

    # THE ARC'S EXISTING NUMBER IS A SUBSET OF THIS ONE, and saying so is the point. PR #1381 counted
    # **936 charcoal `unhealthy` wall px**; that is the share of this disagreement carried by ONE
    # status. Driving an island all-`healthy` through the argument alone leaves EVERY original
    # status' walls standing, so the amber `building`, pale `proposed` and brown `mapped` bands are
    # wrong too and were never counted. Both figures are reported rather than one replacing the
    # other, because the charcoal subtotal is what a reader can compare across passes.
    # `int(v)` and not `round(v)`: the canvas holds floats and the colour keys above were made with
    # `astype(np.int64)`, which TRUNCATES. `C.shade(#37352c, 0.9)` is 49.5 on the red channel, so a
    # rounded key would read #32 where the canvas reads #31 and the subtotal would silently be zero.
    unhealthy_side = {"#%02x%02x%02x" % tuple(int(v) for v in DR.C.shade(
        DR.C.hexrgb(DR.C.STATUS_TOKENS["unhealthy"]["side"]), lv))
        for lv in sorted(set(DR.C.KEY_SHADE.values()) | {DR.C.FLAT_LEVEL, DR.C.SEAM_LEVEL, 1.0})}
    charcoal = sum(n for c, n in colours.items() if c in unhealthy_side)
    return {
        "supersampledPxDisagreeing": n_ss,
        "groundEquivalentPx": round(n_ss / float(DR.C.SS * DR.C.SS), 1),
        "ofWhichUnhealthySideTokenSS": charcoal,
        "ofWhichUnhealthySideTokenGroundEquiv": round(charcoal / float(DR.C.SS * DR.C.SS), 1),
        "distinctWrongWallColours": len(colours),
        "colours": dict(sorted(colours.items(), key=lambda kv: -kv[1])[:12]),
        "identical": n_ss == 0,
    }


def main():
    # THE MIRROR FIRST, because the repair changed the draw-list assembly. `compose_dressed`'s land
    # pass with nothing scattered must still be byte-identical to the shipped `C.compose` - if the
    # import moved a single pixel of BARE land, everything below would be measuring a second change.
    DR.assert_land_unchanged()
    print("assert_land_unchanged: the bare land is byte-identical to the shipped compositor",
          flush=True)

    cells = DR.prepare(DR.ISLAND["variantB"]["cells"])
    items, _stats = scatter.scatter_island(DR.ISLAND, DR.DECOR_META["tokenFamilies"],
                                           DR.dressing.SEED, DR.UAT_CRITERIA)
    print(f"{len(items)} placements on the dressing island", flush=True)

    print("  occlusion, OLD key (the state every committed dressing picture was made in) ...",
          flush=True)
    before = occlusion(items, cells, sorts_after=False)
    print(f"    {before['ownZeroSupersampledPx']} of {before['placements']} own nothing "
          f"({before['ownZeroPct']}%)", flush=True)
    print("  occlusion, SHIPPED key ...", flush=True)
    after = occlusion(items, cells, sorts_after=True)
    print(f"    {after['ownZeroSupersampledPx']} of {after['placements']} own nothing "
          f"({after['ownZeroPct']}%)", flush=True)

    print("  wall authority, defect reintroduced ...", flush=True)
    walls_before = wall_authority(items, cells, authoritative=False)
    print(f"    {walls_before['groundEquivalentPx']} ground-equivalent px disagree", flush=True)
    print("  wall authority, as shipped ...", flush=True)
    walls_after = wall_authority(items, cells, authoritative=True)
    print(f"    {walls_after['groundEquivalentPx']} ground-equivalent px disagree", flush=True)

    report = {
        "mirrorHeld": True,
        "fence": "docs/research/** only; LAND_CAMERA_ELEVATION_DEG neither read nor written",
        "island": "chapter2-island-place-dressing-2026-08-16/island.json",
        "camera": {"elevationDeg": DR.C.ELEV, "supersample": DR.C.SS},
        "theFourthSite": {
            "file": "chapter2-island-place-dressing-2026-08-16/compose_dressed.py",
            "wasBroken": "it kept its own draw list and imported neither rule from compose_core",
            "occlusionWithTheOldKey": before,
            "occlusionAsShipped": after,
            "recoveredPlacements": before["ownZeroSupersampledPx"] - after["ownZeroSupersampledPx"],
            "recoveredSupersampledPx": (after["totalOwnedSupersampledPx"]
                                        - before["totalOwnedSupersampledPx"]),
        },
        "theWalls": {
            "question": "does compose_land(caps=...) reach C.boundary_walls on THIS compositor?",
            "defectReintroduced": walls_before,
            "asShipped": walls_after,
        },
        "singleImplementation": {
            "decorDepthKeyIsCoresOwnFunction":
                DR.CORE.decor_depth_key is CORE.decor_depth_key,
            "wallsUnderCapsIsCoresOwnFunction":
                DR.CORE.walls_under_caps is CORE.walls_under_caps,
            "composeDressedDefinesNoSwitchOfItsOwn":
                not hasattr(DR, "DECOR_SORTS_AFTER_ITS_CELL")
                and not hasattr(DR, "CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS"),
            "why": "a guard reintroducing either defect must set compose_core's switch. If this "
                   "file carried its own copy of the name, a guard could patch the copy, measure "
                   "the unmodified rule, and print CAUGHT - which is exactly how two monkey-patches "
                   "went inert on this track in PR #1393.",
        },
    }
    with open(os.path.join(HERE, "dressed-fix-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    print("\nwrote dressed-fix-report.json")
    return report


if __name__ == "__main__":
    main()
