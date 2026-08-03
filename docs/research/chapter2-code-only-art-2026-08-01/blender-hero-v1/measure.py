#!/usr/bin/env python3
"""Crown-fragmentation measurement + offline island composite.

The spike's whole thesis is a NUMBER, not a look: exp-16 reads confident because its
crown holds TWELVE colours in large flat regions with a bright warm top-highlight over a
fifth of the canopy, while a physically-lit render quantises into two dozen speckled
values. This measures that, on the same crown definition, for any track.

  python measure.py <dir-with-frame-NN.png> [more dirs ...] [--frame 18] [--island]
  python measure.py <dir> [more dirs ...] --shape [--frame 18]
  python measure.py <delivered-dir> --monotone

`--island` also composites each frame onto the island's own green plate (sampled from the
lab's real render) and re-measures there, because the composite is where the previous
increment found two failures a contact sheet had hidden.

`--shape` measures the SILHOUETTE instead of the colour: half-width by height decile, and
the height of the lowest foliage pixel. It is the instrument that named ADR-0289 D2's two
defects as numbers rather than as adjectives — see `shape()` below.

`--monotone` walks the whole delivered track and proves that a canopy which MOVES never
costs the viewer anything: silhouette and foliage area must both be non-decreasing. It
was written for v3's blade->cloud handoff; v4 deleted the blades but inherited the same
obligation from the canopy floor, which rises with the tree and takes the foliage off a
low limb as the leader overtops it. Exits non-zero if any frame shrinks, so it can be run
as a check rather than read.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
W = np.array([0.30, 0.59, 0.11], dtype=np.float32)

# The island's green plate under the tree, sampled from the lab's own composite
# (on-island.png, the crown band of a candidate cell). The composite judgement is made
# against THIS, never against transparency.
PLATE = np.array([124, 191, 106], dtype=np.float32)
PLATE_SHADE = np.array([106, 173, 92], dtype=np.float32)


def crown_mask(rgba):
    """The crown = opaque pixels above the trunk band. Defined identically for every
    track so the counts are comparable: the top 62% of the tree's own bbox height.
    (The trunk/root mass lives in the bottom third; including it would let a track with
    more visible bark look 'less fragmented'.)"""
    a = rgba[:, :, 3]
    solid = a > 200
    ys = np.nonzero(solid.any(axis=1))[0]
    if len(ys) == 0:
        return solid & False
    top, bot = int(ys.min()), int(ys.max())
    cut = top + int(round((bot - top + 1) * 0.62))
    m = solid.copy()
    m[cut:, :] = False
    return m


def measure(rgba, mask, label):
    rgb = rgba[:, :, :3].astype(np.int32)
    px = rgb[mask]
    n = len(px)
    if n == 0:
        return None
    keys = px[:, 0] * 65536 + px[:, 1] * 256 + px[:, 2]
    uniq, counts = np.unique(keys, return_counts=True)
    order = np.argsort(-counts)
    cols = [((int(k) >> 16, (int(k) >> 8) & 255, int(k) & 255), int(c))
            for k, c in zip(uniq[order], counts[order])]
    green = int(((px[:, 1] > px[:, 0]) & (px[:, 1] > px[:, 2])).sum())
    lum = (px.astype(np.float32) * W).sum(axis=1)
    # the brightest BAND: the single most-used colour among the top-quartile-luma pixels
    thr = np.percentile(lum, 75)
    bright = px[lum >= thr]
    bk = bright[:, 0] * 65536 + bright[:, 1] * 256 + bright[:, 2]
    bu, bc = np.unique(bk, return_counts=True)
    bi = int(np.argmax(bc))
    bkey = int(bu[bi])
    bcol = (bkey >> 16, (bkey >> 8) & 255, bkey & 255)
    bshare = int(counts[np.nonzero(uniq == bkey)[0][0]]) if bkey in uniq else int(bc[bi])
    return {
        "label": label, "px": n, "colours": len(uniq),
        "green_frac": green / n,
        "top": cols[:6],
        "bright": (bcol, bshare, bshare / n),
        "mean_lum": float(lum.mean()),
        "cover4": sum(c for _, c in cols[:4]) / n,
    }


def show(m):
    if m is None:
        print("  (empty)")
        return
    top = "  ".join(f"{c}×{k}" for c, k in m["top"][:4])
    print(f"  {m['label']:<28} px={m['px']:<5} colours={m['colours']:<3} "
          f"green={m['green_frac']*100:.0f}%  top4cover={m['cover4']*100:.0f}%  "
          f"lum={m['mean_lum']:.0f}")
    print(f"      brightest band {m['bright'][0]} = {m['bright'][1]}px "
          f"({m['bright'][2]*100:.0f}% of crown)")
    print(f"      top4: {top}")


FOLIAGE_BANDS = np.array([[92, 90, 46], [101, 118, 65], [121, 141, 83],
                          [135, 148, 89], [173, 167, 114]], dtype=np.int32)
FLOOR_MIN_PX = 3       # foliage pixels a row needs before it counts as canopy
FOLIAGE_NOISE_PX = 6   # ... and pixels a WHOLE FRAME needs before its canopy is real
                       # (see monotone(); a leafless frame's shaded bark can land on a
                       # foliage band, and 6 is well under the 29 the first leafy frame
                       # of the delivered track carries)


def foliage_mask(rgba):
    """Foliage by NEAREST FAMILY, never by an absolute threshold — the same rule the
    raster back half uses to classify a band-edge fringe (see pixelise.py)."""
    solid = rgba[:, :, 3] > 200
    rgb = rgba[:, :, :3].astype(np.int32)
    d = np.stack([np.abs(rgb - c).sum(axis=2) for c in FOLIAGE_BANDS]).min(axis=0)
    return solid & (d < 40)


def shape(rgba, label, nb=12):
    """Half-width by height decile, plus the FOLIAGE FLOOR — the lowest foliage pixel as
    a fraction of tree height.

    ADR-0289 D2 names two silhouette defects in words, and words are what the previous
    increments argued in. These two numbers say the same things and can be checked:

      · "foliage is attaching at the trunk" IS the foliage floor. exp-16's mature frame
        carries no foliage below 44% of its height; v3's lowest foliage pixel sat at 16%.
      · "we losing the overall upside down pair shape" IS the WAIST in the profile.
        exp-16 narrows to a 7.5 px half-width at a quarter of its height and then jumps
        to 38.5 by half; v3 ramped 18.5 -> 20.5 -> 39.5 and had no waist at all. Both
        crowns already agreed on where they are widest, which is why the phrase is about
        the bottom of the tree and not about the top.
    """
    solid = rgba[:, :, 3] > 200
    ys = np.nonzero(solid.any(axis=1))[0]
    if len(ys) == 0:
        print(f"  {label}: (empty)")
        return None
    top, bot = int(ys.min()), int(ys.max())
    h = bot - top + 1
    fol = foliage_mask(rgba)
    prof = []
    for b in range(nb):
        y1 = bot - int(round(h * b / nb))
        y0 = bot - int(round(h * (b + 1) / nb)) + 1
        xs = np.nonzero(solid[y0:y1 + 1].any(axis=0))[0]
        prof.append((xs.max() - xs.min() + 1) / 2 if len(xs) else 0.0)
    # ... where the canopy BEGINS, which is not the same as its single lowest pixel. A
    # row needs FLOOR_MIN_PX of foliage to count: measured, frame 14 of the v4 track
    # reported an 18% floor on the strength of ONE pixel while its actual canopy bottomed
    # at 40%, and a metric a stray pixel can move is a metric that sends the next
    # iteration after the wrong thing.
    rows = fol.sum(axis=1)
    fy = np.nonzero(rows >= FLOOR_MIN_PX)[0]
    floor = (bot - fy.max()) / h if len(fy) else 1.0
    wide = int(np.argmax(prof))
    print(f"  {label:<22} h={h:<4} widest={wide/nb:.2f}-{(wide+1)/nb:.2f}  "
          f"foliage floor={floor*100:.0f}%")
    print("     " + "  ".join(f"{p:.0f}" for p in prof))
    return {"height": h, "halfWidthByDecile": [round(p, 1) for p in prof],
            "widestBand": [round(wide / nb, 2), round((wide + 1) / nb, 2)],
            "foliageFloorFrac": round(float(floor), 3)}


def composite(rgba):
    """Lay the frame on the island's green plate, exactly as the app does: the tree is
    opaque, the contact shadow is semi-transparent and DARKENS the plate."""
    h, w = rgba.shape[:2]
    plate = np.tile(PLATE, (h, w, 1)).astype(np.float32)
    # a two-tone plate, matching the island's shaded facet band
    plate[:, w // 2:, :] = PLATE_SHADE
    a = (rgba[:, :, 3:4].astype(np.float32)) / 255.0
    out = rgba[:, :, :3].astype(np.float32) * a + plate * (1 - a)
    return np.dstack([out, np.full((h, w, 1), 255.0)]).astype(np.uint8)


def monotone(d):
    """PROVE the handoff, don't assert it. Moving the canopy from per-leaf blades to
    clouds means one population shrinks while another grows, and the only claim that
    matters is that the thing you can SEE never does. So measure both silhouettes across
    the whole track: total alpha and foliage-coloured alpha must be non-decreasing.

    A tolerance is allowed on the total only for the contact shadow, which is semi
    -transparent and legitimately re-shapes as the crown widens.

    FOLIAGE_NOISE_PX exists because ADR-0293 made "this frame has no canopy at all" a
    legitimate state, and the classifier cannot tell a leafless frame from a leafy one.
    Measured on the first two-phase track: frame 00 is a 30-pixel hairline whose canopy is
    provably empty (`con` is 0 there — no cloud is emitted), yet THREE of its trunk pixels
    quantise onto the darkest foliage band (92,90,46) exactly. Frame 01 has none, so the
    series read 3 -> 0 and the check called a leafless frame a foliage regression. Below
    the floor the count is noise about which band a handful of shaded bark pixels landed
    on, not a measurement of canopy. This is the same lesson `shape()`'s FLOOR_MIN_PX
    already learned — a metric a single pixel can move sends the next iteration after the
    wrong thing — and it does NOT loosen the real obligation: once a canopy exists at all
    it is dozens of pixels and every later frame is compared exactly as before."""
    reg = json.load(open(os.path.join(d, "registration.json")))
    bands = np.array(reg["palette"]["foliageBands"], dtype=np.int32)
    rows = []
    for name in reg["frameOrder"]:
        a = np.array(Image.open(os.path.join(d, name)).convert("RGBA"))
        solid = a[:, :, 3] > 200
        rgb = a[:, :, :3].astype(np.int32)
        fol = np.zeros(solid.shape, dtype=bool)
        for c in bands:
            fol |= (np.abs(rgb - c).sum(axis=2) < 1) & solid
        n_fol = int(fol.sum())
        rows.append((name, int(solid.sum()), n_fol if n_fol >= FOLIAGE_NOISE_PX else 0))
    print(f"{'frame':<14}{'silhouette':>12}{'foliage':>10}   monotone?")
    bad = 0
    for i, (n, s, f) in enumerate(rows):
        flag = ""
        if i:
            ds, df = s - rows[i - 1][1], f - rows[i - 1][2]
            if ds < 0 or df < 0:
                flag = f"  <-- SHRANK  d(sil)={ds} d(fol)={df}"
                bad += 1
        print(f"{n:<14}{s:>12}{f:>10}{flag}")
    print(f"\n{'MONOTONE — no frame loses silhouette or foliage' if not bad else f'{bad} FRAME(S) SHRANK'}")
    return bad


def main():
    argv = sys.argv[1:]
    frame = 18
    island = "--island" in argv
    if "--monotone" in argv:
        rc = 0
        for d in [a for a in argv if not a.startswith("--")]:
            print(f"=== {d}")
            rc += monotone(d)
        sys.exit(1 if rc else 0)
    if "--frame" in argv:
        frame = int(argv[argv.index("--frame") + 1])
    dirs = [a for a in argv if not a.startswith("--") and not a.isdigit()]
    if "--shape" in argv:
        print(f"=== frame {frame:02d} silhouette: half-width by height decile, "
              f"base -> apex ===")
        for d in dirs:
            p = os.path.join(d, f"frame-{frame:02d}.png")
            if not os.path.exists(p):
                print(f"  MISSING {p}")
                continue
            shape(np.array(Image.open(p).convert("RGBA")),
                  os.path.basename(os.path.normpath(d)))
        return
    print(f"=== frame {frame:02d} crown (top 62% of bbox, alpha>200) ===")
    for d in dirs:
        p = os.path.join(d, f"frame-{frame:02d}.png")
        if not os.path.exists(p):
            print(f"  MISSING {p}")
            continue
        rgba = np.array(Image.open(p).convert("RGBA"))
        m = crown_mask(rgba)
        show(measure(rgba, m, os.path.basename(os.path.normpath(d))))
        if island:
            comp = composite(rgba)
            show(measure(comp, m, "  ^ on island plate"))


if __name__ == "__main__":
    main()
