#!/usr/bin/env python3
"""THE TWO NAMED DEFECTS, ISOLATED WITH NUMBERS — "black grass" and "colours bleeding through".

    python diagnose.py            # the measurement + diagnose-report.json
    python diagnose.py --fire      # make every check FAIL on purpose

THE BRIEF. The owner declined the grass a second time on 2026-08-16 and named defects rather than
giving a general verdict: *"your grown triangle grass doesnt look good enough yet, it looks buggy,
and theres bvlack grass and ther colors bleeding through"*. Two of those three are claims about
CORRECTNESS, not about taste, and this pass treats them that way until a measurement says otherwise.

WHAT COUNTS AS AN ANSWER. For each defect, one of three verdicts, each carried by a pixel count:

  * a BUG          — the pipeline delivers a pixel no authored token asked for.
  * a FIXTURE      — the pixel is authorised, but only because the synthetic island carries an
    ARTEFACT       invented status. It would not appear on a real, healthy island.
  * a TASTE        — the pixel is exactly what the vocabulary asked for and the owner does not like
    JUDGMENT       it. That is the owner's look to make and this file has no standing to make it.

THE ONE MEASUREMENT BOTH DEFECTS NEEDED AND NOBODY HAD: attribution. See `attribute.py` — every
delivered pixel is labelled with the drawable that painted it, carried through the majority
downsample. Without it "is that black pixel grass?" is not an answerable question, and the recorded
way to get it wrong is a bare-vs-dressed diff, which cancels the land out and then blames the board.
"""
import argparse
import json
import math
import os
import sys

import numpy as np

import attribute as A
from attribute import C, D

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, A.GRASS)
import grass  # noqa: E402
import scatter  # noqa: E402

#: The luma floor the increment asks for, on the 0..255 Rec.709 scale. Set at the darkest colour any
#: GRASS token can legally deliver minus nothing: `bladeBack` for `healthy` is #436b32 -> luma 92.7,
#: and the darkest blade token of any status is #87693b -> luma 108.9. So a floor of 90 is the
#: assertion "no delivered grass pixel is darker than the darkest thing grass is made of".
GRASS_LUMA_FLOOR = 90.0

#: What the owner would plausibly call BLACK. Chosen from the land side rather than the grass side:
#: `unhealthy`'s side token #37352c delivers luma 52.6 and its darkest top #4a473e delivers 55.6,
#: so anything at or below 60 is in the charcoal band and nothing lighter is.
BLACK_LUMA = 60.0


def mount():
    """The SHIPPED grass — `--geometry blade` at `--normals 0.00`, i.e. the exact piece set the
    owner was looking at when they declined it. Not the clump, which the owner declined on the fork,
    and not a normals mix, which the prior pass measured as delivering an identical raster."""
    D.use_pieces(os.path.join(A.GRASS, "pieces-m00-blade"), expect_mix=0.0,
                 expect_geometry="blade")
    return D.DECOR_META


def island_run(meta, caps, label, perturb=None):
    """Compose ONE island and return everything the checks need, attributed."""
    cells = D.prepare(D.ISLAND["variantB"]["cells"])
    saved = list(D.ISLAND["capStatuses"])
    D.ISLAND["capStatuses"] = list(caps)
    try:
        items, stats = scatter.scatter_island(D.ISLAND, meta["tokenFamilies"], grass.SEED,
                                              D.UAT_CRITERIA)
    finally:
        D.ISLAND["capStatuses"] = saved
    if perturb is not None:
        items = perturb(items)

    # THE `caps` ARGUMENT ALONE DOES NOT RECOLOUR AN ISLAND, and finding that out is itself a
    # result. `compose_land(caps=...)` re-tints the CELLS, but `C.boundary_walls` reads the module
    # global `C.CAPS` for its wall side token — so a "drive the island to one status" run composed
    # through the argument alone delivers recoloured cell tops standing on the ORIGINAL statuses'
    # walls. Measured here: it leaves 936 charcoal `unhealthy` side pixels on an all-`healthy`
    # island, which is exactly the shape of the defect this pass is trying to attribute. Both are
    # rebound together below so "healthy" means healthy everywhere.
    saved_caps = list(C.CAPS)
    C.CAPS = list(caps)
    try:
        canvas, alpha, _h, owner_ss, records = A.compose_attributed(items, cells=cells,
                                                                    caps=list(caps))
        A.assert_mirror(items, canvas, alpha, cells=cells, caps=list(caps))
    finally:
        C.CAPS = saved_caps
    A.assert_attribution_consistent(canvas, alpha, owner_ss, records)
    snapped, pre_rim, rgb, solid, rim = A.back_half_attributed(canvas, alpha, owner_ss)
    cls, item_id, land_id = A.attribute(snapped, pre_rim, alpha > 0.5, owner_ss, records)
    # the rim re-snaps a delivered pixel AFTER the downsample, so ownership is established on the
    # PRE-RIM colour (the one the block actually voted for) and the rim is tracked as a separate
    # event that happened to an already-attributed pixel
    return {"label": label, "items": items, "stats": stats, "records": records,
            "pre_rim": pre_rim, "rgb": rgb, "solid": solid, "rim": rim,
            "cls": cls, "item_id": item_id, "item_id_land": land_id, "caps": list(caps)}


# ---------------------------------------------------------------- the checks
def check_bleed(run, tokens, index):
    """DEFECT 2 — "colours bleeding through".

    THE FAULT CLASS THIS IS SHAPED AGAINST is the one this arc already caught once: a palette that
    does not hold a (token x shade) pair cannot clamp toward it, so it clamps toward the nearest
    entry it DOES hold — which belonged to another status family, and repainted an `unknown` rim
    `healthy` green over 2 564 pixels at exit 0. The reusable shape is to assert a rendered thing
    carries only colours ITS OWN semantic state authorises.

    Applied here per placement: a tuft standing on capability 7's cell may deliver only the blade
    tokens capability 7's STATUS selects, at the shade levels its own piece declares. Anything else
    is a pixel asserting a state the meaning layer did not authorise (ADR-0367 D5).
    """
    dec = run["cls"] == 2
    viol = np.zeros(dec.shape, dtype=bool)
    by_label, by_item = {}, {}
    ids = np.unique(run["item_id"][dec])
    for rid in ids:
        if rid == 0:
            continue
        record = run["records"][int(rid)]
        ok = A.authorised_for(record, tokens)
        m = dec & (run["item_id"] == rid)
        cols = run["pre_rim"][m].astype(np.int64)
        bad = np.array([tuple(c) not in ok for c in cols])
        if bad.any():
            viol[m] = bad
            for c in cols[bad]:
                t = tuple(int(v) for v in c)
                lab = index.get(t, ["UNAUTHORISED-BY-ANY-TOKEN"])[0]
                by_label[lab] = by_label.get(lab, 0) + 1
            by_item[record["piece"]] = by_item.get(record["piece"], 0) + int(bad.sum())
    return {"decorPx": int(dec.sum()), "bleedPx": int(viol.sum()),
            "bleedPxOnTheSilhouetteRim": int((viol & run["rim"]).sum()),
            "bleedPxInTheBody": int((viol & ~run["rim"]).sum()),
            "byWhatItActuallyIs": dict(sorted(by_label.items(), key=lambda kv: -kv[1])),
            "byPiece": by_item}, viol


def check_black(run, index):
    """DEFECT 1 — "black grass".

    Two questions that a picture cannot separate and attribution can:
      (a) is any DECOR pixel below the grass luma floor — i.e. is the grass itself coming out dark;
      (b) how much of the island is charcoal LAND that a viewer would read as black ground cover.
    The second is the leading hypothesis and it is not a bug if the status is real.
    """
    dec, land = run["cls"] == 2, run["cls"] == 1
    lum = A.luma(run["rgb"])
    lum_pre = A.luma(run["pre_rim"])
    dark_dec = dec & (lum < GRASS_LUMA_FLOOR)
    black_dec = dec & (lum < BLACK_LUMA)
    black_land = land & (lum < BLACK_LUMA)

    def top(mask, n=8):
        out = {}
        for c in run["rgb"][mask].astype(np.int64):
            t = tuple(int(v) for v in c)
            out[t] = out.get(t, 0) + 1
        return [{"rgb": list(k), "luma": round(float(A.luma(np.array(k))), 1),
                 "is": index.get(k, ["UNAUTHORISED-BY-ANY-TOKEN"])[0], "px": v}
                for k, v in sorted(out.items(), key=lambda kv: -kv[1])[:n]]

    return {
        "decorPx": int(dec.sum()), "landPx": int(land.sum()),
        "decorBelowGrassLumaFloor": int(dark_dec.sum()),
        "decorBelowGrassLumaFloorPreRim": int((dec & (lum_pre < GRASS_LUMA_FLOOR)).sum()),
        "decorInTheBlackBand": int(black_dec.sum()),
        "landInTheBlackBand": int(black_land.sum()),
        "landInTheBlackBandPctOfLand": round(100.0 * black_land.sum() / max(1, land.sum()), 2),
        "landInTheBlackBandOnTheSilhouetteRim": int((black_land & run["rim"]).sum()),
        "landInTheBlackBandInTheBody": int((black_land & ~run["rim"]).sum()),
        "minDecorLuma": round(float(lum[dec].min()), 1) if dec.any() else None,
        "darkestDecorColours": top(dark_dec) if dark_dec.any() else [],
        "darkestLandColours": top(black_land) if black_land.any() else [],
    }, dark_dec, black_land


def check_rim(run, tokens, viol):
    """HOW MUCH OF THE DAMAGE IS THE RIM PASS — the mechanism, isolated.

    `compose.py`'s `back_half` darkens every SILHOUETTE pixel by 0.60/0.76 and RE-SNAPS it against
    the whole palette, and its own docstring states the consequence plainly: "a green cell's rim can
    legally land on another family's entry". At island scale that is a thin outline on a large body.
    At SEVEN DELIVERED PIXELS a tuft has almost no interior, so the question is what share of the
    grass is rim — and therefore what share of it is being recoloured by a rule written for an
    island's outline.
    """
    dec = run["cls"] == 2
    rim = run["rim"]
    moved = dec & rim & np.any(run["rgb"] != run["pre_rim"], axis=2)
    changed_family = 0
    for rid in np.unique(run["item_id"][moved]) if moved.any() else []:
        if rid == 0:
            continue
        ok = A.authorised_for(run["records"][int(rid)], tokens)
        m = moved & (run["item_id"] == rid)
        changed_family += int(sum(tuple(int(v) for v in c) not in ok
                                  for c in run["rgb"][m].astype(np.int64)))
    return {"decorPx": int(dec.sum()), "decorOnSilhouette": int((dec & rim).sum()),
            "decorRecolouredByRim": int(moved.sum()),
            "decorRecolouredOutOfItsOwnFamily": changed_family,
            "bleedPxThatAreRim": int((viol & rim).sum())}


def check_reverse(run, tokens, index):
    """THE OTHER DIRECTION — land pixels wearing a GRASS colour.

    "Bleeding through" is symmetric and the owner did not say which way. A land pixel carrying a
    blade token is the land asserting vegetation, which is the same ADR-0367 D5 failure pointed the
    other way, and it is exactly what the majority downsample would produce if a block of mostly
    grass lost its vote to the ground.
    """
    land = run["cls"] == 1
    grass_cols = set()
    levels = sorted({float(lv) for r in D.DECOR_META["pieceRoles"].values() for _k, lv in r.values()})
    for fam in ("blade", "shrub", "wilt"):
        for variant in tokens[fam].values():
            for tok in variant.values():
                for m in levels:
                    grass_cols.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(tok), m)))
    cols = run["pre_rim"][land].astype(np.int64)
    hit = {}
    for c in cols:
        t = tuple(int(v) for v in c)
        if t in grass_cols:
            hit[index.get(t, ["?"])[0]] = hit.get(index.get(t, ["?"])[0], 0) + 1
    return {"landPx": int(land.sum()), "landPxWearingADecorTokenColour": int(sum(hit.values())),
            "byToken": dict(sorted(hit.items(), key=lambda kv: -kv[1])[:8])}


def check_charcoal(run):
    """THE WHOLE CHARCOAL REGION, not just the part below the black threshold.

    `check_black`'s luma floor catches the `unhealthy` VERTICAL faces (side token #37352c, delivered
    at luma 41-53) and correctly excludes its top faces (#57544a, luma 84.4). A viewer does not make
    that distinction: they see one dark mass. So this counts every delivered pixel owned by a
    drawable whose status is `unhealthy` — the actual size of the thing in the picture — and it is
    the number the fixture question turns on, because the island's single `unhealthy` capability is
    FABRICATED.
    """
    dark_lut = np.array([1 if (r["cls"] in (A.CELL, A.WALL)
                               and (r.get("status") == "unhealthy"
                                    or r.get("side") == C.STATUS_TOKENS["unhealthy"]["side"]))
                         else 0 for r in run["records"]], dtype=np.int8)
    land = run["cls"] == 1
    mass = land & (dark_lut[run["item_id_land"]] == 1)
    return {"deliveredPx": int(run["solid"].sum()), "charcoalRegionPx": int(mass.sum()),
            "pctOfDelivered": round(100.0 * mass.sum() / max(1, int(run["solid"].sum())), 1),
            "meanLuma": round(float(A.luma(run["rgb"])[mass].mean()), 1) if mass.any() else None}


def check_overhang(run, bare):
    """THE SECOND READING OF "bleeding through", and the one the palette check cannot see.

    A decor placement is scattered inside ONE cell, but it is a 3D object seen from 50 degrees: it
    stands up out of its cell and its upper pixels land wherever the projection puts them. If they
    land on a NEIGHBOURING cell belonging to a different capability, the picture shows one
    capability's vegetation growing on another's ground — colour from over there, appearing over
    here. Nothing in the palette is violated and every pixel is authorised; the assertion is still
    false.

    Measured against a BARE composite of the same island, attributed the same way, so "the cell
    underneath" is the cell the compositor itself drew rather than a re-derived point-in-polygon
    guess.
    """
    dec = run["cls"] == 2
    under_cap = np.full(dec.shape, -1, dtype=np.int64)
    cap_lut = np.array([r.get("cap", -1) if r["cls"] == A.CELL else -1
                        for r in bare["records"]], dtype=np.int64)
    under_cap = np.where(bare["cls"] == 1, cap_lut[bare["item_id_land"]], -1)
    own_cap = np.full(dec.shape, -1, dtype=np.int64)
    dcap_lut = np.array([r.get("cap", -1) if r["cls"] == A.DECOR else -1
                         for r in run["records"]], dtype=np.int64)
    own_cap = np.where(dec, dcap_lut[run["item_id"]], -1)
    known = dec & (under_cap >= 0)
    off = known & (own_cap != under_cap)
    return {"decorPx": int(dec.sum()), "decorPxOverAKnownCell": int(known.sum()),
            "decorPxStandingOnANOTHERCapabilitysCell": int(off.sum()),
            "pctOfDecor": round(100.0 * off.sum() / max(1, dec.sum()), 1),
            "decorPxOverWaterOrCoastSand": int((dec & (bare["cls"] != 1)).sum())}


def check_contrast(run, bare, index):
    """THE READING OF "bleeding through" THAT THE PICTURE ACTUALLY SUPPORTS, and the one no palette
    check can reach, because nothing here is unauthorised.

    ADR-0226 puts a capability's TESTS in the grass and its PROOF STATE in the grass's health. The
    land's own status tint is a separate token family with no relationship to it. The consequence
    shows up on the island rather than in either table: `building` land is ORANGE (#dcab52) and
    `building` grass is GREEN (#71a154 — the same token `healthy` uses, because a building
    capability's vegetation is alive), so every tuft on a building parcel is a hard green speck on
    an orange field. `proposed` and `mapped` land are wheat and tan while their blades are grey-green.

    A viewer with no access to the token tables sees a colour from one family sitting on top of
    another, in specks, and the phrase for that is "colours bleeding through". So this reports the
    hue distance between each delivered decor pixel and the ground it stands on, plus the full
    cross-tab of which vegetation family lands on which status's ground.
    """
    dec = run["cls"] == 2
    cap_lut = np.array([r.get("cap", -1) if r["cls"] == A.CELL else -1
                        for r in bare["records"]], dtype=np.int64)
    under_cap = np.where(bare["cls"] == 1, cap_lut[bare["item_id_land"]], -1)
    caps = run["caps"]

    def hue(rgb):
        r, g, b = (rgb[..., i].astype(np.float64) / 255.0 for i in range(3))
        mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
        d = np.where(mx - mn == 0, 1e-9, mx - mn)
        h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2,
                                                          (r - g) / d + 4)) * 60.0
        return h

    hd = np.abs(hue(run["pre_rim"]) - hue(bare["pre_rim"]))
    hd = np.minimum(hd, 360.0 - hd)
    known = dec & (under_cap >= 0)
    cross = {}
    for c in np.unique(under_cap[known]):
        m = known & (under_cap == c)
        st = caps[int(c)]
        for col in run["pre_rim"][m].astype(np.int64):
            lab = index.get(tuple(int(v) for v in col), ["?"])[0].split(":")
            fam = f"{lab[1]}:{lab[2]}" if len(lab) > 2 else lab[0]
            k = f"{fam} ON {st} ground"
            cross[k] = cross.get(k, 0) + 1
    vals = hd[known]
    return {"decorPxOverAKnownCell": int(known.sum()),
            "medianHueDegreesFromTheGroundBeneath": round(float(np.median(vals)), 1) if vals.size
            else None,
            "pxMoreThan40DegreesFromTheirGround": int((vals > 40).sum()),
            "pctMoreThan40Degrees": round(100.0 * (vals > 40).sum() / max(1, vals.size), 1),
            "crossTab": dict(sorted(cross.items(), key=lambda kv: -kv[1]))}


def check_palette_spread(run, index):
    """WHICH TOKEN FAMILY EVERY DELIVERED DECOR PIXEL BELONGS TO.

    The third reading of "bleeding through": not a wrong colour, but a lot of RIGHT colours. Four of
    the fixture's ten capabilities carry statuses whose blade tokens are GREY (`mapped`, `proposed`:
    #9fa88f; `unknown`: #b0afa2) and one carries the STRAW dead-grass tokens (`unhealthy`: #ab8c54).
    Grass that is grey and grass that is brown, scattered among green grass, is what ADR-0226 D3
    asks for — and it is also what a viewer would describe as discoloured patches.

    The question this answers is therefore not "is it authorised" but "how much of it is the
    FIXTURE'S INVENTED STATUSES", which is the number that survives or does not survive the real
    corpus island replacing the synthetic one.
    """
    dec = run["cls"] == 2
    out = {}
    for c in run["pre_rim"][dec].astype(np.int64):
        t = tuple(int(v) for v in c)
        lab = index.get(t, ["UNAUTHORISED"])[0]
        parts = lab.split(":")
        fam = f"{parts[1]}:{parts[2]}" if len(parts) > 2 else lab
        out[fam] = out.get(fam, 0) + 1
    green = sum(v for k, v in out.items()
                if k.split(":")[-1] in ("healthy", "building", "proven", "pending", "failing"))
    return {"decorPx": int(dec.sum()), "byTokenFamily": dict(sorted(out.items(),
                                                                   key=lambda kv: -kv[1])),
            "pxWhoseFamilyIsAnINVENTEDNonGreenStatus": int(dec.sum()) - green,
            "pctNonGreen": round(100.0 * (int(dec.sum()) - green) / max(1, int(dec.sum())), 1)}


def check_components(run):
    """DEFECT 3 — "it looks buggy", answered with the only thing that can answer it: how big is the
    thing a tuft actually delivers, and is it connected.

    A plant that arrives as two or three pixels which are not even touching each other is not a
    small plant, it is speckle — and speckle scattered over a flat ground is what a rendering fault
    looks like. This counts, per PLACEMENT, how many delivered pixels survived and how many separate
    islands of pixels they form. 8-connectivity, so a diagonal still counts as attached.
    """
    dec = run["cls"] == 2
    per_item, comps = {}, []
    ids, counts = np.unique(run["item_id"][dec], return_counts=True)
    for rid, n in zip(ids, counts):
        if rid == 0:
            continue
        per_item[int(rid)] = int(n)
        m = dec & (run["item_id"] == rid)
        comps.append(_components(m))
    sizes = sorted(per_item.values())
    placed = len(run["items"])
    delivered = len(per_item)
    hist = {}
    for s in sizes:
        hist[str(s)] = hist.get(str(s), 0) + 1
    return {"placements": placed, "placementsDeliveringAtLeastOnePixel": delivered,
            "placementsDeliveringNOTHING": placed - delivered,
            "medianPxPerPlacement": int(np.median(sizes)) if sizes else 0,
            "pxPerPlacementHistogram": dict(sorted(hist.items(), key=lambda kv: int(kv[0]))),
            "placementsArrivingAsMoreThanOneDisconnectedBlob":
                int(sum(1 for c in comps if c > 1)),
            "totalDisconnectedBlobs": int(sum(comps)),
            "placementsDeliveringOneOrTwoPx": int(sum(1 for s in sizes if s <= 2))}


def _components(mask):
    """8-connected component count, iterative flood fill — no scipy on this box."""
    seen = np.zeros(mask.shape, dtype=bool)
    ys, xs = np.nonzero(mask)
    n = 0
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if (0 <= yy < mask.shape[0] and 0 <= xx < mask.shape[1]
                            and mask[yy, xx] and not seen[yy, xx]):
                        seen[yy, xx] = True
                        stack.append((yy, xx))
    return n


def check_ambiguous(run):
    """The honest residue: delivered pixels where land AND decor both emitted the winning colour.
    Reported rather than resolved — a tiebreak here would be an invention, and the number is the
    bound on how much of every other count could be misattributed."""
    return {"ambiguousPx": int((run["cls"] == 3).sum()),
            "unattributedSolidPx": int((run["solid"] & (run["cls"] == 0)).sum())}


# ---------------------------------------------------------------- perturbations (make it FIRE)
def fire_foreign_family(items):
    """Repaint ONE healthy tuft with the `unhealthy` blade tokens. Its cell's capability is still
    healthy, so `check_bleed` must name it — this is the "art asserts a state the meaning layer did
    not authorise" failure, injected."""
    out = [dict(i) for i in items]
    fam = D.DECOR_META["tokenFamilies"]["blade"]["unhealthy"]
    for i in out:
        if i["kind"] == "tuft" and i["status"] == "healthy":
            i["roles"] = dict(fam)
            return out
    raise SystemExit("no healthy tuft to perturb")


def fire_black(items):
    """Repaint ONE tuft near-black. `check_black` must see a decor pixel below the grass luma
    floor — the assertion the increment asks for, made to fail."""
    out = [dict(i) for i in items]
    for i in out:
        if i["kind"] == "tuft":
            i["roles"] = {k: "#050505" for k in i["roles"]}
            return out
    raise SystemExit("no tuft to perturb")


def fire_partial_palette():
    """Rebuild the closed palette WITHOUT the decor families — the interior fork's own bug, injected
    at the level it actually occurred. A snap can only clamp toward what it holds, so every grass
    pixel must be re-assigned to a land entry and both checks must fire at once."""
    C.PALETTE = C.build_palette()


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fire", action="store_true", help="make every check fail on purpose")
    args = ap.parse_args()

    meta = mount()
    tokens = meta["tokenFamilies"]
    index = A.token_index()
    fixture_caps = list(D.ISLAND["capStatuses"])
    healthy_caps = ["healthy"] * len(fixture_caps)

    report = {"pieceSet": "pieces-m00-blade (the declined grass: blade geometry, normals 0.00)",
              "camera": {"elevationDeg": C.ELEV, "note": "the research track's authoring angle; "
                         "the app constant LAND_CAMERA_ELEVATION_DEG is 20 and is NOT touched"},
              "lumaFloors": {"grass": GRASS_LUMA_FLOOR, "black": BLACK_LUMA},
              "islands": {}}

    for label, caps in (("fixture", fixture_caps), ("healthy", healthy_caps)):
        run = island_run(meta, caps, label)
        bare = island_run(meta, caps, label + "-bare", perturb=lambda _i: [])
        bleed, viol = check_bleed(run, tokens, index)
        black, _dark, _bl = check_black(run, index)
        report["islands"][label] = {
            "capStatuses": caps,
            "deliveredSolidPx": int(run["solid"].sum()),
            "bleed": bleed,
            "black": black,
            "charcoal": check_charcoal(run),
            "rim": check_rim(run, tokens, viol),
            "reverse": check_reverse(run, tokens, index),
            "overhang": check_overhang(run, bare),
            "contrast": check_contrast(run, bare, index),
            "spread": check_palette_spread(run, index),
            "buggy": check_components(run),
            "attribution": check_ambiguous(run),
            "placements": {k: v for k, v in run["stats"].items() if isinstance(v, int)},
        }
        print(f"[{label}] solid={run['solid'].sum()} decor={bleed['decorPx']} "
              f"bleed={bleed['bleedPx']} darkDecor={black['decorBelowGrassLumaFloor']} "
              f"blackLand={black['landInTheBlackBand']}")

    if args.fire:
        report["refusals"] = fire(meta, tokens, index, fixture_caps)

    out = os.path.join(HERE, "diagnose-report.json")
    json.dump(report, open(out, "w"), indent=1)
    print("wrote", out)
    return report


def fire(meta, tokens, index, caps):
    """EVERY CHECK, MADE TO FAIL. A check only ever observed passing is indistinguishable from one
    that cannot fail, and both of this pass's headline findings are NEGATIVE results — which is
    precisely the shape that needs its instrument proved."""
    rows = []

    run = island_run(meta, ["healthy"] * len(caps), "fire-foreign", perturb=fire_foreign_family)
    b, _v = check_bleed(run, tokens, index)
    rows.append({"guard": "check_bleed catches a tuft repainted with a FOREIGN status family",
                 "fired": b["bleedPx"] > 0, "bleedPx": b["bleedPx"],
                 "seenAs": list(b["byWhatItActuallyIs"])[:3]})

    run = island_run(meta, ["healthy"] * len(caps), "fire-black", perturb=fire_black)
    k, _d, _l = check_black(run, index)
    rows.append({"guard": "check_black catches a tuft painted near-black",
                 "fired": k["decorBelowGrassLumaFloor"] > 0,
                 "decorBelowGrassLumaFloor": k["decorBelowGrassLumaFloor"],
                 "minDecorLuma": k["minDecorLuma"]})

    saved = C.PALETTE
    fire_partial_palette()
    try:
        run = island_run(meta, ["healthy"] * len(caps), "fire-palette")
        b, _v = check_bleed(run, tokens, index)
        k, _d, _l = check_black(run, index)
        rows.append({"guard": "a PARTIAL palette (decor families omitted) reassigns semantic state",
                     "fired": b["bleedPx"] > 0, "bleedPx": b["bleedPx"],
                     "decorBelowGrassLumaFloor": k["decorBelowGrassLumaFloor"],
                     "seenAs": list(b["byWhatItActuallyIs"])[:5]})
    finally:
        C.PALETTE = saved

    run = island_run(meta, ["healthy"] * len(caps), "fire-control")
    b, _v = check_bleed(run, tokens, index)
    rows.append({"guard": "and the UNPERTURBED healthy island still passes (the control)",
                 "fired": b["bleedPx"] > 0, "bleedPx": b["bleedPx"]})

    for r in rows:
        print(("FIRED " if r["fired"] else "clean ") + r["guard"])
    return rows


if __name__ == "__main__":
    main()
