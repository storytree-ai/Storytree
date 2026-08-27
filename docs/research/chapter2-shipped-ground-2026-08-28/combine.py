#!/usr/bin/env python3
"""Composite this increment's two sheets from the MEASURED panels.

⚠ IT COMPOSITES THE PANELS `baseline-measure.mjs` WROTE, never a screenshot of the page — the
same rule every sheet on this arc follows, so the picture and the numbers came out of one run.

⚠⚠ THE BEFORE/AFTER SHEET IS DELIBERATELY NOT CROPPED, and that is the opposite of the choice
`chapter2-shipped-baseline-2026-08-28/combine.py` made one day earlier. That sheet cropped its
shipped panel to the drawn content because the content was a readable island lost in an empty
frame. Here the emptiness IS the finding: the BEFORE panel contains one story tree and nothing
else, and cropping to its content would produce a large, clear picture of a cone — which reads
as "here is the tree" rather than "here is an island that is not being drawn". Both panels are
the same canvas at the same size in the same run, and the sheet shows them that way.

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


def load(name):
    p = MEASURE / name
    if not p.exists():
        raise SystemExit(f"REFUSED: {p} is missing — run measure-baseline first")
    return Image.open(p).convert("RGBA")


def scale_to_width(img, w):
    return img.resize((w, max(1, round(img.height * w / img.width))), Image.LANCZOS)


def refuse_if_identical(a, b, what):
    """⚠ THE PREMISE REFUSAL, in the shape this arc settled on (ADR-0462's, via the terrain
    vocabulary sheet). A pair of panels that are meant to DIFFER and are secretly the same scene
    reports "no difference" with the authority of a real measurement. Both sheets here are
    two-arm comparisons, so both are checked before either is written."""
    if list(a.convert("RGB").getdata()) == list(b.convert("RGB").getdata()):
        raise SystemExit(f"REFUSED: the two {what} panels are pixel-identical — the comparison is void")


def stacked(pairs, out_name, width=1600):
    sheet_imgs = []
    for img, title, sub in pairs:
        sheet_imgs.append((scale_to_width(img, width), title, sub))
    w = PAD * 2 + width
    h = PAD + sum(CAPTION_H + i.height + GAP for i, _, _ in sheet_imgs) - GAP + PAD
    sheet = Image.new("RGB", (w, h), PANEL_BG)
    d = ImageDraw.Draw(sheet)
    f_title, f_sub = font(30, bold=True), font(19)
    y = PAD
    for img, title, sub in sheet_imgs:
        d.text((PAD, y), title, font=f_title, fill=INK)
        d.text((PAD, y + 42), sub, font=f_sub, fill=DIM)
        sheet.paste(img, (PAD, y + CAPTION_H), img)
        y += CAPTION_H + img.height + GAP
    out = OUT / out_name
    sheet.save(out)
    print(f"wrote {out}  ({sheet.width}x{sheet.height})")


before, after = load("shipped-before.png"), load("shipped-overview.png")
refuse_if_identical(before, after, "before/after")
stacked(
    [
        (
            before,
            "BEFORE — the mapper has no case for `cell`",
            "164 parcels arrive and are skipped · one story tree · 144 triangles · 2 draw calls",
        ),
        (
            after,
            "AFTER — the parcels are drawn",
            "164 parcels in ONE merged mesh · 1,784 triangles · 3 draw calls · same component, same island, same run",
        ),
    ],
    "before-after-2026-08-28.png",
)

uniform, mixed = load("shipped-uniform.png"), load("shipped-mixed.png")
refuse_if_identical(uniform, mixed, "status-reporting")
stacked(
    [
        (uniform, "ALL HEALTHY — the research surface", "164 parcels, one state · 1,784 triangles · 3 draw calls"),
        (
            mixed,
            "ONE CAPABILITY UNHEALTHY — the same island",
            "152 healthy · 12 unhealthy · 1,784 triangles · 3 draw calls — identical geometry, only the colour differs",
        ),
    ],
    "reports-status-2026-08-28.png",
)
