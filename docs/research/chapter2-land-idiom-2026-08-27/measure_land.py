"""Measure a land render at the size it is delivered, on the two axes that fail differently.

Run:  blender -b -P measure_land.py -- <img.png> [<img.png> ...] [--floor 40] [--json out.json]
      (ABSOLUTE paths. Blender is only the PNG decoder -- there is no Pillow in this environment.)

WHY THIS EXISTS RATHER THAN `measure_colour.py` ALONE. The 2026-08-22 instrument counts COLOUR:
distinct values, values carrying area, and bins-to-cover-90%, which is the number ADR-0418 D4
turns into an adoption band (ours 9-17, ISLANDERS 474, an unmodified photoreal render ~4,000).
That is the right instrument for "is this in the reference's league" and it is kept here
unchanged. It cannot answer the question this increment actually turns on, which is:

    AT WHICH ZOOM does the ground's detail exist?

A ground can be rich in colours and still be a watercolour wash -- every one of those colours a
slow gradient nothing resolves as structure. And a ground can be sharp at 1948 px and dissolve
into speckle at 487, which is the trade ADR-0415 D1's surviving half forbids: "a richly textured
ground that loses its silhouette at 487 px has traded the wrong way". So this adds two numbers:

  MICRO   mean |delta luma| between neighbouring opaque pixels. Contrast at the pixel scale --
          grain, speckle, painted texture. High MICRO at 487 px is what over-detailing looks
          like; at 1948 px it is what surviving the zoom looks like.
  STRUCT  standard deviation of luma after a 4-px box blur. Contrast at the scale the eye still
          has at overview -- landform, shore, path, the shadow under a stand of trees. This is
          the "contrast beats detail" quantity, and blurring is exactly the operation that
          throws away what a zoomed-out viewer has already thrown away.

  RATIO = MICRO / STRUCT. A land whose richness is all grain has a high ratio; a land whose
  richness is structural has a low one. Neither end is good on its own -- see the README.

  BINS90B is bins-to-90% measured on the BLURRED image: how much of the colour count survives
  when the detail does not. A ground scoring 300 bins that falls to 12 when blurred is scoring
  on noise.

⚠ THE PIXEL READ IS VERIFIED, NOT ASSUMED. `img.pixels` was checked against a hand-decoded PNG
(zlib + the five filter types, no library) on 2026-08-27: mid-tone samples agree byte-for-byte
under BOTH `sRGB` and `Non-Color` colorspace settings, so Blender applies no transform on the
way into `.pixels` and `round(v * 255)` IS the delivered byte. Pixels are bottom-up.
"""

import json
import os
import sys

import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default


FLOOR = int(opt("--floor", "40"))
JSON_OUT = opt("--json")
consumed = set()
for f in ("--floor", "--json"):
    if f in argv:
        consumed.add(argv[argv.index(f) + 1])
paths = [a for a in argv if not a.startswith("--") and a not in consumed
         and a.lower().endswith(".png")]


def box_blur(v, mask, r):
    """Box blur with honest edges: sum the value and the mask over the same window and divide,
    so a pixel near the coast is averaged over the land it actually has rather than over
    transparency."""
    def integral(a):
        s = np.zeros((a.shape[0] + 1, a.shape[1] + 1))
        s[1:, 1:] = a.cumsum(0).cumsum(1)
        return s

    def windowed(a):
        s = integral(a)
        h, w = a.shape
        y0 = np.clip(np.arange(h) - r, 0, h)
        y1 = np.clip(np.arange(h) + r + 1, 0, h)
        x0 = np.clip(np.arange(w) - r, 0, w)
        x1 = np.clip(np.arange(w) + r + 1, 0, w)
        return (s[np.ix_(y1, x1)] - s[np.ix_(y0, x1)]
                - s[np.ix_(y1, x0)] + s[np.ix_(y0, x0)])

    num = windowed(v * mask)
    den = windowed(mask)
    den[den == 0] = 1.0
    return num / den


def measure(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)

    a = px.reshape(h, w, 4)[::-1]                      # Blender stores bottom-up
    rgb = np.rint(a[:, :, :3] * 255.0).astype(np.int16)
    alpha = a[:, :, 3]
    mask = alpha >= 0.5
    opaque = int(mask.sum())
    if opaque == 0:
        return None

    flat = rgb[mask].astype(np.int64)
    keys = flat[:, 0] * 65536 + flat[:, 1] * 256 + flat[:, 2]
    _, counts = np.unique(keys, return_counts=True)
    counts = np.sort(counts)[::-1]
    carrying = int((counts >= FLOOR).sum())
    bins90 = int(np.searchsorted(counts.cumsum(), opaque * 0.90) + 1)

    luma = (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2])
    lm = luma[mask]
    p2, p50, p98 = np.percentile(lm, [2, 50, 98])

    m = mask.astype(np.float64)
    dh = np.abs(luma[:, 1:] - luma[:, :-1])[mask[:, 1:] & mask[:, :-1]]
    dv = np.abs(luma[1:, :] - luma[:-1, :])[mask[1:, :] & mask[:-1, :]]
    micro = float(np.concatenate([dh, dv]).mean())

    blur = box_blur(luma, m, 4)
    struct = float(blur[mask].std())

    brgb = np.stack([box_blur(rgb[:, :, c].astype(np.float64), m, 4) for c in range(3)], axis=2)
    bflat = np.clip(np.rint(brgb[mask]), 0, 255).astype(np.int64)
    bkeys = bflat[:, 0] * 65536 + bflat[:, 1] * 256 + bflat[:, 2]
    _, bcounts = np.unique(bkeys, return_counts=True)
    bcounts = np.sort(bcounts)[::-1]
    bins90b = int(np.searchsorted(bcounts.cumsum(), opaque * 0.90) + 1)

    mx = flat.max(axis=1)
    mn = flat.min(axis=1)
    chroma = mx - mn
    chromatic = float((chroma > 8).mean())

    # hue families: 30-degree bins holding at least 1% of the chromatic pixels
    sel = chroma > 8
    if sel.sum():
        r, g, b = (flat[sel, 0] / 255.0, flat[sel, 1] / 255.0, flat[sel, 2] / 255.0)
        mxf = np.max([r, g, b], axis=0)
        mnf = np.min([r, g, b], axis=0)
        d = np.maximum(mxf - mnf, 1e-9)
        hue = np.where(mxf == r, ((g - b) / d) % 6,
                       np.where(mxf == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
        hb = np.bincount((hue.astype(int) // 30) % 12, minlength=12)
        families = int((hb >= 0.01 * sel.sum()).sum())
    else:
        families = 0

    return dict(file=os.path.basename(path), w=w, h=h, opaque=opaque,
                alphaCover=round(opaque / float(w * h), 4),
                distinct=int(len(counts)), carrying=carrying, bins90=bins90,
                bins90Blur=bins90b,
                lumaP2=round(float(p2), 1), lumaP50=round(float(p50), 1),
                lumaP98=round(float(p98), 1), lumaSpread=round(float(p98 - p2), 1),
                micro=round(micro, 3), struct=round(struct, 3),
                ratio=round(micro / struct, 3) if struct else None,
                chromatic=round(chromatic, 3), hueFamilies=families)


rows = []
print("\n%-30s %8s %8s %7s %8s %7s %7s %6s %7s"
      % ("image", "opaque", "distinct", "bins90", "bins90B", "MICRO", "STRUCT", "RATIO", "spread"))
print("-" * 96)
for p in paths:
    if not os.path.exists(p):
        print("%-30s  MISSING" % os.path.basename(p))
        continue
    r = measure(p)
    if r is None:
        print("%-30s  fully transparent" % os.path.basename(p))
        continue
    rows.append(r)
    print("%-30s %8d %8d %7d %8d %7.2f %7.2f %6.2f %7.1f"
          % (r["file"][:30], r["opaque"], r["distinct"], r["bins90"], r["bins90Blur"],
             r["micro"], r["struct"], r["ratio"], r["lumaSpread"]))

if JSON_OUT:
    with open(JSON_OUT, "w") as fh:
        json.dump(rows, fh, indent=2)
    print("\nwrote %s" % JSON_OUT)
print("\ncarrying = colours over >= %d px  ·  bins90 = colours for 90%% of the opaque frame" % FLOOR)
print("MICRO = mean |d luma| between neighbours  ·  STRUCT = std of luma after a 4 px box blur")
print("RATIO = MICRO / STRUCT -- high is grain, low is structure. Read it WITH the zoom level.")
