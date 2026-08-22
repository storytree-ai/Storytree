"""Count the colour content of a render, the same shape as the 2026-08-22 ISLANDERS pass.

Two numbers, because they fail differently:
  - DISTINCT COLOURS carrying area: how many 8-bit RGB values cover at least `--floor`
    pixels. A colour present on three pixels is noise, not content.
  - BINS TO COVER 90%: sort colours by pixel count descending, count how many it takes to
    reach 90% of the opaque pixels. This is the one that was 21x apart (ours 22, theirs 474),
    and it is the number that measures "the palette refuses continuous shading".

Blender is only used here as the image decoder (no Pillow in this environment).

Run:  blender.exe -b -P measure_colour.py -- <img.png> [<img.png> ...] [--floor 40]
"""

import os
import sys
from collections import Counter

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FLOOR = int(argv[argv.index("--floor") + 1]) if "--floor" in argv else 40
paths = [a for a in argv if not a.startswith("--") and a.isascii() and a.lower().endswith(".png")]
# drop the value that follows --floor
if "--floor" in argv:
    fv = argv[argv.index("--floor") + 1]
    paths = [p for p in paths if p != fv]


def measure(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = list(img.pixels)                       # flat RGBA floats, linear scene-referred
    counts = Counter()
    opaque = 0
    for i in range(0, len(px), 4):
        a = px[i + 3]
        if a < 0.5:                             # our islands sit on transparency
            continue
        opaque += 1
        # these PNGs were written with the Standard view transform, so the stored bytes are
        # what a viewer sees; round back to 8-bit to count DELIVERED colours, not floats
        counts[(int(px[i] * 255 + 0.5),
                int(px[i + 1] * 255 + 0.5),
                int(px[i + 2] * 255 + 0.5))] += 1
    bpy.data.images.remove(img)

    if not opaque:
        return None
    ordered = counts.most_common()
    carrying = sum(1 for _, n in ordered if n >= FLOOR)
    run, bins90 = 0, 0
    for _, n in ordered:
        run += n
        bins90 += 1
        if run >= opaque * 0.90:
            break
    return dict(w=w, h=h, opaque=opaque, distinct=len(counts),
                carrying=carrying, bins90=bins90)


print("\n%-34s %7s %9s %10s %9s" % ("image", "opaque", "distinct", "carrying", "bins90%"))
print("-" * 74)
for p in paths:
    if not os.path.exists(p):
        print("%-34s  MISSING" % os.path.basename(p))
        continue
    r = measure(p)
    if r is None:
        print("%-34s  fully transparent" % os.path.basename(p))
        continue
    print("%-34s %7d %9d %10d %9d"
          % (os.path.basename(p)[:34], r["opaque"], r["distinct"], r["carrying"], r["bins90"]))
print("\n(carrying = colours covering >= %d px; bins90%% = colours needed for 90%% of the frame)"
      % FLOOR)
