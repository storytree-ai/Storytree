#!/usr/bin/env python3
"""ATTRIBUTION: which delivered pixel came from which drawable, and what happened to it on the way.

THE INSTRUMENT THE PRIOR PASSES DID NOT HAVE. Every number on this track so far has been a COUNT of
delivered pixels — 7 px a tuft, 301 px of decor, 34 968 px of land. A count cannot answer either of
the owner's two named defects, because both are questions about a pixel's IDENTITY: *is this black
pixel grass or is it the land showing between the grass*, and *does this grass pixel carry a colour
its own capability authorised*. So this file adds one thing: a parallel canvas that records, for
every supersampled pixel, WHICH DRAWABLE PAINTED IT — and carries that attribution through the
majority downsample and the rim pass to the delivered raster.

    THE METHOD TRAP THIS EXISTS TO AVOID, recorded because a prior session fell into it: a
    bare-vs-dressed DIFF does not identify a land colour. It isolates only the DECOR, because the
    cell fill underneath is identical in both and cancels out — and the dark sheet BACKDROP then
    makes "there is no black grass, it is just the board" look like a finding. Attribution is the
    fix: the land is not subtracted, it is LABELLED.

HOW THE LABELLING IS EXACT RATHER THAN INFERRED. Every paint op in the compositor is a HARD write —
`fill_polygon` does `sub_c[bm] = rgb`, `paste_piece` and `paste_decor` do `np.where(mask, out, dst)`.
None of them blends. So running the identical op a second time onto an owner canvas, with an integer
id encoded as a colour, marks exactly the pixels the real op wrote, in the same painter order, with
later drawables overwriting earlier ones exactly as they do on the real canvas.

AND IT IS A MIRROR, CHECKED RATHER THAN TRUSTED. `compose_attributed` re-states the draw list, which
is the one thing a wrapper cannot avoid restating. So every run asserts its own canvas and alpha are
BYTE-IDENTICAL to `compose_core.compose_land`'s for the same inputs, before any attribution is read.
That is the same mechanism `assert_land_unchanged` uses one level down, for the same reason: a second
copy of a draw list is a second thing that can drift.
"""
import importlib.util
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")

sys.path.insert(0, GRASS)
import grass  # noqa: E402
import scatter  # noqa: E402

_spec = importlib.util.spec_from_file_location("compose_core", os.path.join(GRASS,
                                                                           "compose_core.py"))
D = importlib.util.module_from_spec(_spec)
sys.modules["compose_core"] = D
_spec.loader.exec_module(D)
C = D.C

# ---------------------------------------------------------------- owner classes
COAST, WALL, CELL, DECOR = 1, 2, 3, 4
CLASS_NAME = {0: "none", COAST: "coast", WALL: "wall", CELL: "cell", DECOR: "decor"}


def _idcol(n):
    """An integer id as an exact float32 RGB triple. Every paint op writes it unblended, and
    24 bits is exact in float32, so the decode is lossless."""
    return np.array([(n >> 16) & 255, (n >> 8) & 255, n & 255], dtype=np.float32)


def _decode(owner_rgb):
    o = owner_rgb.astype(np.int64)
    return (o[:, :, 0] << 16) | (o[:, :, 1] << 8) | o[:, :, 2]


def _stamp(own_c, own_a, mask, cx, cy, idcol):
    """Mark a piece's footprint on the owner canvas WITHOUT going through `paste_piece`.

    THE BUG THIS EXISTS BECAUSE OF, recorded because it produced a completely plausible false
    finding before it was caught: the first version of this file marked walls by calling the shipped
    `paste_piece` with the id encoded as its `top_rgb`/`side_rgb`. But `paste_piece` SHADES its
    colour argument per band key (`KEY_SHADE`: 1.00 / 0.90 / 0.80 / 0.78) — so a wall stamped as
    id 42 came back as id 37, and every chamfered and wall-lit pixel on the island decoded to some
    OTHER record, most of them decor. The instrument then reported that 71% of grass pixels were
    delivering `land:*:side@0.9` — a textbook-shaped semantic bleed that did not exist. The tell was
    that every "bleed" colour was a SIDE token at exactly a `KEY_SHADE` level.

    The blit geometry below is `paste_piece`'s, restated; `assert_attribution_consistent` is what
    holds it honest, by checking every owned pixel against the colours its owner could have painted.
    """
    h, w = mask.shape
    x0 = int(round(cx * C.SS - w / 2.0))
    y0 = int(round(cy * C.SS - h / 2.0))
    sx0, sy0 = max(0, x0), max(0, y0)
    sx1, sy1 = min(own_c.shape[1], x0 + w), min(own_c.shape[0], y0 + h)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    sub_m = mask[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
    own_c[sy0:sy1, sx0:sx1] = np.where(sub_m[:, :, None], idcol, own_c[sy0:sy1, sx0:sx1])
    own_a[sy0:sy1, sx0:sx1] = np.where(sub_m, 1.0, own_a[sy0:sy1, sx0:sx1])


def compose_attributed(decor_items, cells=None, caps=None, ground="flat"):
    """`compose_core.compose_land`, painted twice: once for real and once in id colours.

    Returns (canvas, alpha, tree_h, owner_id, records). `owner_id` is a supersampled int array of
    ids into `records`; record 0 is "nothing was painted here".
    """
    cells = D.ISLAND["variantB"]["cells"] if cells is None else cells
    caps = C.CAPS if caps is None else caps
    shape = (C.CANVAS_H * C.SS, C.CANVAS_W * C.SS)
    canvas = np.zeros(shape + (3,), dtype=np.float32)
    alpha = np.zeros(shape, dtype=np.float32)
    own_c = np.zeros(shape + (3,), dtype=np.float32)
    own_a = np.zeros(shape, dtype=np.float32)
    records = [{"cls": 0, "what": "unpainted"}]
    story_side = C.STATUS_TOKENS["healthy"]["side"]

    def rec(entry):
        records.append(entry)
        return _idcol(len(records) - 1)

    coast_poly = [(C.project(gx, gy)[0] * C.SS, C.project(gx, gy)[1] * C.SS) for gx, gy in C.COAST]
    C.fill_polygon(canvas, alpha, coast_poly, C.hexrgb(C.COAST_SAND),
                   seam_rgb=C.hexrgb(C.COAST_SAND_EDGE))
    cid = rec({"cls": COAST, "what": "coast sand"})
    C.fill_polygon(own_c, own_a, coast_poly, cid, seam_rgb=cid)

    draw = []
    for pl in D.ISLAND["wall"]["placements"]:
        if C.faces_viewer(pl["heading"]):
            draw.append((pl["c"][1], 0, ("wall", pl["c"], pl["heading"], 0.0, story_side)))
    # the two rules below are `compose_core`'s and are CALLED, not restated: the wall query reads the
    # `caps` ARGUMENT (rebound for its duration, restored in a `finally`) and the decor depth key is
    # `D.decor_depth_key`. `assert_mirror` compares this canvas to `compose_land`'s byte for byte, so
    # a copy of either rule here would be a second implementation this instrument could drift on.
    saved_caps = C.CAPS
    if D.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS:
        C.CAPS = list(caps)
    try:
        walls = C.boundary_walls(cells, D.ELEVATION_MODE)
    finally:
        C.CAPS = saved_caps
    for pos, h, height, side in walls:
        draw.append((pos[1], 1, ("wall", pos, h, height, side)))
    for c in cells:
        draw.append((c["c"][1], 2, ("cell", c, C.height_of(c, D.ELEVATION_MODE))))
    for i, d in enumerate(decor_items):
        draw.append((D.decor_depth_key(d, cells), 3, ("decor", d, i)))
    draw.sort(key=lambda t: (t[0], t[1]))

    for _, _, item in draw:
        if item[0] == "wall":
            _, pos, h, height, side = item
            px, py = C.project(pos[0], pos[1], height)
            C.paste_piece(canvas, alpha, C.WALL_PIECES[h], px, py, C.hexrgb(side), C.hexrgb(side))
            wid = rec({"cls": WALL, "what": f"wall h={h}", "side": side})
            _stamp(own_c, own_a, C.WALL_PIECES[h][2], px, py, wid)
        elif item[0] == "cell":
            _, c, height = item
            toks = C.STATUS_TOKENS[caps[c["cap"]]]
            base = C.hexrgb(toks["wheat"] if c["wheat"] else toks["top"][c["variant"]])
            poly = [(C.project(gx, gy, height)[0] * C.SS, C.project(gx, gy, height)[1] * C.SS)
                    for gx, gy in c["poly"]]
            C.fill_polygon(canvas, alpha, poly, C.shade(base, C.FLAT_LEVEL),
                           seam_rgb=C.shade(base, C.SEAM_LEVEL))
            lid = rec({"cls": CELL, "what": f"cell cap={c['cap']}", "cap": c["cap"],
                       "status": caps[c["cap"]], "wheat": bool(c["wheat"])})
            C.fill_polygon(own_c, own_a, poly, lid, seam_rgb=lid)
            if ground == "mottle":
                sub = D.mottle_patch(c, tuple(c["c"]))
                if len(sub) >= 3:
                    mp = [(C.project(gx, gy, height)[0] * C.SS,
                           C.project(gx, gy, height)[1] * C.SS) for gx, gy in sub]
                    C.fill_polygon(canvas, alpha, mp, C.shade(base, C.SEAM_LEVEL))
                    C.fill_polygon(own_c, own_a, mp, lid)
        else:
            d, i = item[1], item[2]
            px, py = C.project(d["g"][0], d["g"][1], d["h"])
            roles = D.DECOR_META["pieceRoles"][d["piece"]]
            D.paste_decor(canvas, alpha, D.DECOR_PIECE_SET[d["piece"]], px, py, d["roles"], roles)
            did = rec({"cls": DECOR, "what": d["piece"], "item": i, "kind": d["kind"],
                       "piece": d["piece"], "cell": d["cell"], "cap": d["cap"],
                       "status": d.get("status"), "verdict": d.get("verdict"),
                       "roles": dict(d["roles"])})
            # THE OWNER PAINT REUSES THE SHIPPED BLIT rather than copying it: every one of this
            # piece's roles is bound to the id colour at level 1.00, so `paste_decor` stamps the
            # id through its own mask, in its own painter position. There is no second blit to
            # drift.
            idhex = "#%02x%02x%02x" % tuple(int(v) for v in did)
            D.paste_decor(own_c, own_a, D.DECOR_PIECE_SET[d["piece"]], px, py,
                          {r: idhex for r in {v[0] for v in roles.values()}},
                          {k: (v[0], 1.0) for k, v in roles.items()})

    if not np.array_equal(own_a > 0.5, alpha > 0.5):
        raise SystemExit("REFUSED: the owner canvas covers a different region from the real one — "
                         "some drawable was marked with a footprint it does not have.")
    return canvas, alpha, C.centre_height(cells, D.ELEVATION_MODE), _decode(own_c), records


def authored_colours(record):
    """Every colour ONE record's own paint op could have written, as exact integer triples.

    This is the ground truth the attribution is checked against — derived from what each drawable
    was HANDED, never from what turned up on the canvas.
    """
    out = set()

    def put(rgb):
        out.add(tuple(int(round(v)) for v in np.asarray(rgb, dtype=np.float64)))

    if record["cls"] == COAST:
        put(C.hexrgb(C.COAST_SAND))
        put(C.hexrgb(C.COAST_SAND_EDGE))
    elif record["cls"] == WALL:
        for m in C.KEY_SHADE.values():
            put(C.shade(C.hexrgb(record["side"]), m))
    elif record["cls"] == CELL:
        toks = C.STATUS_TOKENS[record["status"]]
        for t in ([toks["wheat"]] if record["wheat"] else toks["top"]):
            put(C.shade(C.hexrgb(t), C.FLAT_LEVEL))
            put(C.shade(C.hexrgb(t), C.SEAM_LEVEL))
    else:
        for _key, (role, level) in D.DECOR_META["pieceRoles"][record["piece"]].items():
            if role in record["roles"]:
                put(C.shade(C.hexrgb(record["roles"][role]), float(level)))
    return out


def assert_attribution_consistent(canvas, alpha, owner_ss, records):
    """THE GUARD THAT MAKES THE INSTRUMENT SELF-CHECKING, and the one the false finding needed.

    For every supersampled pixel: the colour on the REAL canvas must be one the record the OWNER
    canvas names could actually have painted. An owner map that is even slightly wrong — a shaded
    id, an off-by-one blit, a painter-order divergence — puts a colour under a record that never
    emits it, and this fails immediately and names both.

    Note it is checked on the RAW canvas, before the palette snap: after the snap two drawables can
    legitimately share a colour, and the check would go quiet exactly where the diagnosis is
    interesting.
    """
    keep = alpha > 0.5
    ids = np.unique(owner_ss[keep])
    bad = []
    for rid in ids:
        r = records[int(rid)]
        if r["cls"] == 0:
            bad.append("an UNPAINTED id owns solid pixels")
            continue
        ok = authored_colours(r)
        m = keep & (owner_ss == rid)
        seen = {tuple(int(round(v)) for v in c) for c in np.unique(
            canvas[m].reshape(-1, 3), axis=0)}
        stray = seen - ok
        if stray:
            bad.append(f"record {rid} ({r['what']}) owns pixels coloured {sorted(stray)[:3]} "
                       f"which it cannot paint (it paints {sorted(ok)[:3]})")
    if bad:
        raise SystemExit("REFUSED: the attribution is inconsistent with the canvas — every number "
                         "below would be about the wrong drawable.\n  " + "\n  ".join(bad[:6]))


def assert_mirror(decor_items, canvas, alpha, **kw):
    """The attributed compositor must be the SAME compositor. Byte-identical canvas and alpha, on
    the raw supersampled buffers — i.e. before the palette snap could clamp a difference away."""
    theirs_c, theirs_a, _h = D.compose_land(decor_items, **kw)
    if not (np.array_equal(canvas, theirs_c) and np.array_equal(alpha, theirs_a)):
        raise SystemExit(
            "REFUSED: attribute.compose_attributed has drifted from compose_core.compose_land "
            f"(canvas equal={np.array_equal(canvas, theirs_c)} "
            f"alpha equal={np.array_equal(alpha, theirs_a)}). Every attribution below would be "
            "about a picture that is not the delivered one, so nothing is measured.")


# ---------------------------------------------------------------- the back half, opened up
def back_half_attributed(canvas, alpha, owner_ss):
    """`C.back_half`, re-stated so its two stages can be READ instead of only their output.

    The stages matter to the diagnosis and the shipped function returns only the last of them:

      * `snapped`  — every supersampled pixel clamped to the closed palette.
      * `pre_rim`  — the majority downsample. THE DELIVERED PIXEL BEFORE THE RIM TOUCHES IT.
      * `rgb`      — after the selective rim, which re-darkens silhouette pixels and RE-SNAPS them
                     against the WHOLE palette. `compose.py`'s own docstring says this is deliberate
                     and that "a green cell's rim can legally land on another family's entry".

    Asserted equal to `C.back_half`'s output on every call, so this is a window onto the shipped
    pipeline rather than a second one.
    """
    keep = alpha > 0.5
    snapped = np.where(keep[:, :, None], C.snap(canvas), 0.0).astype(np.int32)
    pre_rim, solid = C.mode_down(snapped, keep)

    pad = np.pad(solid, 1, constant_values=False)
    nb = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    rim = solid & ~nb
    below = np.pad(solid, 1, constant_values=False)[2:, 1:-1]
    depth = np.where(below & rim, 0.60, 0.76)[:, :, None]
    rgb = np.where(rim[:, :, None], C.snap(np.clip(pre_rim * depth, 0, 255)), pre_rim)

    theirs, theirs_solid = C.back_half(canvas, alpha)
    assert np.array_equal(rgb * solid[:, :, None], theirs[:, :, :3]), (
        "back_half_attributed has drifted from the shipped C.back_half")
    assert np.array_equal(solid, theirs_solid)
    return snapped, pre_rim, rgb, solid, rim


def attribute(snapped_ss, winner_rgb, keep_ss, owner_ss, records):
    """Carry the supersampled ownership through the majority downsample.

    A delivered pixel's colour is the MODE of its SS x SS block. So its owner is whichever drawable
    painted the supersampled pixels that carry the winning colour — not whichever painted the most
    pixels, and not whichever is on top. Where both a land drawable and a decor drawable emitted the
    winning colour in one block the attribution is genuinely AMBIGUOUS, and that is reported as its
    own class rather than resolved by a tiebreak nobody could justify.
    """
    k = C.SS
    h, w = C.CANVAS_H, C.CANVAS_W
    key = (snapped_ss[:, :, 0].astype(np.int64) * 65536
           + snapped_ss[:, :, 1].astype(np.int64) * 256 + snapped_ss[:, :, 2].astype(np.int64))
    key = np.where(keep_ss, key, -1)
    blocks = key.reshape(h, k, w, k).transpose(0, 2, 1, 3).reshape(h, w, k * k)
    own_b = owner_ss.reshape(h, k, w, k).transpose(0, 2, 1, 3).reshape(h, w, k * k)

    cls_lut = np.zeros(len(records), dtype=np.int16)
    for i, r in enumerate(records):
        cls_lut[i] = r["cls"]
    cls_b = cls_lut[own_b]

    wkey = (winner_rgb[:, :, 0].astype(np.int64) * 65536
            + winner_rgb[:, :, 1].astype(np.int64) * 256 + winner_rgb[:, :, 2].astype(np.int64))
    match = blocks == wkey[:, :, None]
    is_decor = match & (cls_b == DECOR)
    is_land = match & (cls_b > 0) & (cls_b != DECOR)

    dec_any, land_any = is_decor.any(axis=2), is_land.any(axis=2)
    cls = np.zeros((h, w), dtype=np.int16)
    cls[land_any & ~dec_any] = 1          # land only
    cls[dec_any & ~land_any] = 2          # decor only
    cls[dec_any & land_any] = 3           # ambiguous

    first = np.argmax(is_decor, axis=2)
    item = np.take_along_axis(own_b, first[:, :, None], axis=2)[:, :, 0]
    item = np.where(dec_any, item, 0)
    firstl = np.argmax(is_land, axis=2)
    land_item = np.take_along_axis(own_b, firstl[:, :, None], axis=2)[:, :, 0]
    land_item = np.where(land_any, land_item, 0)
    return cls, item, land_item


def luma(rgb):
    return (rgb.astype(np.float64) * np.array([0.2126, 0.7152, 0.0722])).sum(axis=-1)


def token_index():
    """Every colour the whole composite is ALLOWED to emit, labelled with what authored it.

    Built independently of `build_palette_dressed` — from the token tables directly — because a
    check that asks the palette what the palette allows can only ever pass. That is the interior
    fork's own lesson, applied to the reverse direction: there the palette was too small, here the
    question is which entry a pixel actually landed on.
    """
    idx = {}

    def put(rgb, label):
        t = tuple(int(round(v)) for v in rgb)
        idx.setdefault(t, []).append(label)

    top_levels = sorted({C.FLAT_LEVEL, C.SEAM_LEVEL, C.KEY_SHADE["chamfer_lit"],
                         C.KEY_SHADE["chamfer_dark"]})
    side_levels = sorted(set(C.KEY_SHADE.values()))
    for st, toks in C.STATUS_TOKENS.items():
        for t in toks["top"] + [toks["wheat"]]:
            for m in top_levels:
                put(C.shade(C.hexrgb(t), m), f"land:{st}:top@{m}")
        for m in side_levels:
            put(C.shade(C.hexrgb(toks["side"]), m), f"land:{st}:side@{m}")
    for c, n in ((C.COAST_SAND, "coast:sand"), (C.COAST_SAND_EDGE, "coast:sandEdge")):
        put(C.hexrgb(c), n)
    levels = sorted({float(lv) for roles in D.DECOR_META["pieceRoles"].values()
                     for _r, lv in roles.values()})
    for fam, variants in D.DECOR_META["tokenFamilies"].items():
        for variant, toks in variants.items():
            for role, tok in toks.items():
                for m in levels:
                    put(C.shade(C.hexrgb(tok), m), f"decor:{fam}:{variant}:{role}@{m}")
    return idx


def authorised_for(record, tokens):
    """The colours ONE decor placement may legally deliver: its own piece's roles, at its own
    piece's authored shade levels, resolved through the token family its CELL's capability status
    selects. Deliberately derived from the status rather than from the item's own `roles` dict, so
    that repainting an item with a foreign family's tokens is something this can CATCH."""
    piece_roles = D.DECOR_META["pieceRoles"][record["piece"]]
    if record["kind"] == "flower":
        fam = tokens["flower"][record["verdict"]]
    elif record["kind"] == "wilt":
        fam = tokens["wilt"]["unhealthy"]
    elif record["kind"] == "shrub":
        fam = tokens["shrub"][record["status"]]
    else:
        fam = tokens["blade"][record["status"]]
    out = set()
    for _key, (role, level) in piece_roles.items():
        if role in fam:
            out.add(tuple(int(round(v)) for v in C.shade(C.hexrgb(fam[role]), float(level))))
    return out
