#!/usr/bin/env python3
"""Composite the baseline comparison sheet from the MEASURED panels.

⚠ IT COMPOSITES THE PANELS `baseline-measure.mjs` WROTE, never a screenshot of the page —
the same rule every sheet on this arc follows, so the picture and the numbers came out of
one run.

⚠ THE SHIPPED PANEL IS CROPPED AND THE CROP IS PART OF THE FINDING, not a tidy-up.
`ForestWorldCanvas.frameWorld` backs the camera off `max(260, spread * 2.6)` units, so a
13-hex island — every island the product actually draws is around this size — occupies a
small fraction of a frame that is otherwise empty. Uncropped, the two panels cannot be put
side by side at a readable size at all. The crop is to the drawn content's bounding box
plus a margin, it is stated in the caption, and the uncropped frame is committed beside the
sheet so nobody has to take this on trust.

usage:  python3 combine.py <measure-dir> [out-dir]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MEASURE = Path(sys.argv[1] if len(sys.argv) > 1 else ".baseline-measure")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".")

PANEL_BG = (43, 49, 56)
INK = (236, 239, 241)
DIM = (143, 160, 170)
GAP = 40
PAD = 44
CAPTION_H = 96


def font(size, bold=False):
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
        "/usr/share/fonts/TTF/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
    ):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def content_bbox(img, margin=28, border=10):
    """The drawn content's bounds.

    ⚠ TWO THINGS BIT THIS AND BOTH ARE WORTH KNOWING. (1) Sample the CANVAS, never its padded
    wrapper: the wrapper's checkerboard border becomes the apparent background and nothing
    crops. (2) Even on the canvas a thin strip of the PAGE background survives at the frame
    edge, and a bbox that counts it expands to the whole frame — a crop that silently does
    nothing, which looks exactly like a correct crop of a mostly-empty picture. So the outer
    `border` pixels are ignored and the background is read from inside them.

    Returns None when nothing was drawn, which is a live possibility for this canvas and must
    not be quietly treated as a full-frame crop."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    bg = px[w // 2, border + 2]
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(border, h - border, 2):
        for x in range(border, w - border, 2):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 24:
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    if maxx < 0:
        return None
    return (
        max(0, minx - margin),
        max(0, miny - margin),
        min(w, maxx + margin),
        min(h, maxy + margin),
    )


def load(name):
    p = MEASURE / name
    if not p.exists():
        raise SystemExit(f"REFUSED: {p} is missing — run measure-baseline first")
    return Image.open(p).convert("RGBA")


def scale_to_width(img, w):
    return img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)


def build(top_name, bottom_name, top_title, top_sub, bottom_title, bottom_sub, out_name, crop_top=True):
    """STACKED, not side by side, and the reason is in the pictures. Cropped to its content the
    shipped panel is a wide, shallow strip of coins; the harness island is nearly square. Set
    side by side at a common HEIGHT the shipped strip becomes five thousand pixels wide and the
    sheet is unreadable. A common WIDTH, stacked, puts the two islands at the same scale, which
    is the only arrangement in which the comparison is a comparison."""
    top = load(top_name)
    if crop_top:
        box = content_bbox(top)
        if box is None:
            raise SystemExit(f"REFUSED: {top_name} appears to have drawn nothing at all")
        top = top.crop(box)
    bottom = load(bottom_name)

    width = 1900
    top = scale_to_width(top, width)
    bottom = scale_to_width(bottom, width)

    w = PAD * 2 + width
    h = PAD + CAPTION_H + top.height + GAP + CAPTION_H + bottom.height + PAD
    sheet = Image.new("RGB", (w, h), PANEL_BG)
    d = ImageDraw.Draw(sheet)

    f_title, f_sub = font(30, bold=True), font(19)
    y = PAD
    for img, title, sub in ((top, top_title, top_sub), (bottom, bottom_title, bottom_sub)):
        d.text((PAD, y), title, font=f_title, fill=INK)
        d.text((PAD, y + 42), sub, font=f_sub, fill=DIM)
        sheet.paste(img, (PAD, y + CAPTION_H), img)
        y += CAPTION_H + img.height + GAP

    out = OUT / out_name
    sheet.save(out)
    print(f"wrote {out}  ({sheet.width}x{sheet.height})")


build(
    "shipped-classic.png",
    "harness-classic-compare.png",
    "WHAT SHIPS TODAY",
    "src/ForestWorldCanvas.tsx — 13 flat hex prisms, 456 triangles, 3 draw calls  (cropped: see the note)",
    "WHERE THIS ARC IS GOING",
    "harness/ — per-cell mesh, relief, banded shader, dressing, at 8 px / ground unit",
    "shipped-vs-harness-2026-08-28.png",
)
