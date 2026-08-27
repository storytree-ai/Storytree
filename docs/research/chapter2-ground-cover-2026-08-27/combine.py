#!/usr/bin/env python3
"""Compose the twelve delivered panels into two comparison sheets a person can read at a glance.

    python combine.py [<source-dir>]      # default: ../../../.cover-measure

⚠ IT COMPOSITES THE MEASURED PNGs, IT DOES NOT SCREENSHOT THE PAGE. Two evidence pictures on this
arc (`island-today.png`, `island-wild.png`) were Playwright ELEMENT screenshots with the harness
page's checkerboard composited in OPAQUE, so an alpha mask never reached the island and every
figure derived from them was confounded. The inputs here are `cover-measure.mjs`'s `getImageData`
captures — the same bytes the numbers were taken from — so the sheets and the table can never
disagree about which island they describe. The flat backdrop below is painted UNDER a real alpha
composite rather than baked into the source.

⚠ NOTHING IS RESAMPLED. Each panel is pasted at its delivered size, so the 8 px sheet is a whole
island at the zoom the owner singled out, and the 2 px sheet is a whole island at the shipped
overview scale. ADR-0392 D1 holds the comparison to whole islands at delivered size — a crop or a
downscale would be a fragment wearing a sheet's clothes.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "..", ".cover-measure")

#: The page's own stage colour, so a sheet reads the way the page reads.
BACKDROP = (33, 38, 44)
INK = (207, 216, 220)
DIM = (141, 154, 164)

COVERS = [
    ("status", "status green", "#8cb85e — the control"),
    ("wheat", "wheat field", "#d6b271 — the app's own override"),
    ("yellowgrass", "yellow grass", "#b0b040 — authored here"),
]
ROWS = [("flat", "no grain"), ("grain", "grain, normal half")]

PAD = 26
LABEL_H = 54


def font(size):
    for name in ("segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def sheet(zoom, out):
    tiles = {}
    for cover, _, _ in COVERS:
        for row, _ in ROWS:
            path = os.path.join(SRC, f"cover-{cover}-{row}-{zoom}px.png")
            if not os.path.exists(path):
                raise SystemExit(f"missing panel: {path} — run `pnpm --filter … measure-cover` first")
            tiles[(cover, row)] = Image.open(path).convert("RGBA")

    # Every panel at one zoom covers the identical mask — `cover-measure.mjs` REFUSES a run where
    # they do not — so one tile's size is every tile's size.
    w, h = tiles[(COVERS[0][0], ROWS[0][0])].size
    for t in tiles.values():
        if t.size != (w, h):
            raise SystemExit(f"panels at {zoom} px differ in size: {t.size} vs {(w, h)}")

    title_f = font(max(15, round(w / 46)))
    note_f = font(max(12, round(w / 62)))
    row_f = font(max(13, round(w / 55)))
    gutter = max(170, round(w / 5))

    sheet_w = gutter + len(COVERS) * (w + PAD) + PAD
    sheet_h = PAD + LABEL_H + len(ROWS) * (h + PAD)
    img = Image.new("RGB", (sheet_w, sheet_h), BACKDROP)
    d = ImageDraw.Draw(img)

    for ci, (cover, label, note) in enumerate(COVERS):
        x = gutter + ci * (w + PAD)
        d.text((x, PAD), label, font=title_f, fill=INK)
        d.text((x, PAD + title_f.size + 6), note, font=note_f, fill=DIM)
        for ri, (row, _) in enumerate(ROWS):
            y = PAD + LABEL_H + ri * (h + PAD)
            img.paste(tiles[(cover, row)], (x, y), tiles[(cover, row)])

    for ri, (_, row_label) in enumerate(ROWS):
        y = PAD + LABEL_H + ri * (h + PAD)
        # Right-aligned into the gutter: a left-aligned label at this width runs under the
        # first island, which reads as a rendering defect rather than as a caption.
        d.text((gutter - PAD, y + h // 2), row_label, font=row_f, fill=DIM, anchor="rm")

    d.text(
        (PAD, sheet_h - PAD + 4),
        f"{zoom} device px per ground unit",
        font=note_f,
        fill=DIM,
        anchor="ls",
    )
    img.save(out, optimize=True)
    print(f"{out}  {img.size[0]}x{img.size[1]}  {os.path.getsize(out) / 1e6:.2f} MB")


for z in (2, 8):
    sheet(z, os.path.join(HERE, f"cover-combined-{z}px.png"))
