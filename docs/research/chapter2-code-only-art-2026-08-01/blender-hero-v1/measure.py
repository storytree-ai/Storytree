#!/usr/bin/env python3
"""Crown-fragmentation measurement + offline island composite.

The spike's whole thesis is a NUMBER, not a look: exp-16 reads confident because its
crown holds TWELVE colours in large flat regions with a bright warm top-highlight over a
fifth of the canopy, while a physically-lit render quantises into two dozen speckled
values. This measures that, on the same crown definition, for any track.

  python measure.py <dir-with-frame-NN.png> [more dirs ...] [--frame 18] [--island]
  python measure.py <delivered-dir> --monotone

`--island` also composites each frame onto the island's own green plate (sampled from the
lab's real render) and re-measures there, because the composite is where the previous
increment found two failures a contact sheet had hidden.

`--monotone` walks the whole delivered track and proves the blade->cloud handoff never
costs the viewer anything: silhouette and foliage area must both be non-decreasing.
Exits non-zero if any frame shrinks, so it can be run as a check rather than read.
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
    -transparent and legitimately re-shapes as the crown widens."""
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
        rows.append((name, int(solid.sum()), int(fol.sum())))
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
