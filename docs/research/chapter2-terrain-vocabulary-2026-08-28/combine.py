#!/usr/bin/env python3
"""Composite the terrain comparison sheets from the MEASURED panels.

⚠ IT COMPOSITES THE PANELS `terrain-measure.mjs` WROTE — canvas buffers with real alpha, never
a screenshot of the page. Two evidence pictures on this arc were once element screenshots with
the page background composited in OPAQUE and every figure derived from them was confounded;
and on this pass a screenshot comparison of the BEFORE pair came back 466 px and 465 px tall,
one row apart from where the elements sat on the page, so a byte-identity check between two
panels that ARE identical could never have passed.

usage:  python3 combine.py <measure-dir> [out-dir]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

MEASURE = Path(sys.argv[1] if len(sys.argv) > 1 else ".terrain-measure")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".")

BG = (43, 49, 56)
INK = (236, 239, 241)
DIM = (143, 160, 170)
GOOD = (183, 224, 138)
PAD = 40
GAP = 26
CAP = 78


def font(size, bold=False):
    for n in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
        "/usr/share/fonts/TTF/DejaVuSans%s.ttf" % ("-Bold" if bold else ""),
    ):
        if Path(n).exists():
            return ImageFont.truetype(n, size)
    return ImageFont.load_default()


def load(name):
    p = MEASURE / f"{name}.png"
    if not p.exists():
        raise SystemExit(f"REFUSED: {p} is missing — run measure-terrain first")
    return Image.open(p).convert("RGBA")


def scaled(name, w):
    im = load(name)
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def sheet(rows, panel_w, out_name, title, subtitle):
    """rows: list of (heading, [(tag, caption, sub)])."""
    imgs = [[(scaled(t, panel_w), c, s) for (t, c, s) in r[1]] for r in rows]
    width = PAD * 2 + max(len(r) for r in imgs) * panel_w + (max(len(r) for r in imgs) - 1) * GAP
    height = PAD + 96
    for r, row in zip(rows, imgs):
        height += 46 + CAP + max(i[0].height for i in row) + GAP * 2
    # ⚠ THE SUBTITLE IS WRAPPED TO THE SHEET WIDTH. Unwrapped it ran off the right edge and
    # the sentence carrying the whole verdict was the part that got cut.
    def wrap(text, f, limit):
        words, lines, cur = text.split(), [], ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if d0.textlength(trial, font=f) <= limit:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    probe = Image.new("RGB", (1, 1))
    d0 = ImageDraw.Draw(probe)
    sub_lines = wrap(subtitle, font(16), width - PAD * 2)
    height += 22 * max(0, len(sub_lines) - 1)
    canvas = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(canvas)
    f_h1, f_h2, f_cap, f_sub = font(34, True), font(21, True), font(19, True), font(16)

    d.text((PAD, PAD), title, font=f_h1, fill=INK)
    for i, line in enumerate(sub_lines):
        d.text((PAD, PAD + 44 + i * 22), line, font=f_sub, fill=DIM)
    y = PAD + 96 + 22 * max(0, len(sub_lines) - 1)

    for (heading, _), row in zip(rows, imgs):
        d.text((PAD, y), heading, font=f_h2, fill=GOOD)
        y += 46
        x = PAD
        for im, cap, sub in row:
            d.text((x, y), cap, font=f_cap, fill=INK)
            d.text((x, y + 26), sub, font=f_sub, fill=DIM)
            canvas.paste(im, (x, y + CAP), im)
            x += panel_w + GAP
        y += CAP + max(i[0].height for i in row) + GAP * 2

    out = OUT / out_name
    canvas.save(out)
    print(f"wrote {out}  ({canvas.width}x{canvas.height})")


# ── SHEET 1: the pair colour cannot separate ────────────────────────────────────────────────
sheet(
    [
        (
            "BEFORE — colour alone. These two panels are BYTE-IDENTICAL over 1,233,579 opaque pixels.",
            [
                ("terrain-proposed-off-8px", "proposed", "#d8c069 · the isotropic grain"),
                ("terrain-building-off-8px", "building", "#d8c069 · the isotropic grain"),
            ],
        ),
        (
            "AFTER — the same two states, the same colour, wearing their terrains.",
            [
                ("terrain-proposed-on-8px", "proposed — fallow", "ploughed and set out, nothing grown in it yet"),
                ("terrain-building-on-8px", "building — wheatfield", "the crop standing while the work is in flight"),
            ],
        ),
    ],
    940,
    "terrain-pair-2026-08-28.png",
    "Two states, one colour, two lands",
    "ADR-0462 gave proposed and building the same yellow, so colour cannot tell them apart at all. "
    "Everything that separates them below is the terrain. Measured 1.43 octaves apart in feature "
    "scale against a same-run bar of 0.88 — SEPARATED, 1.6x. Palette CLOSED on every panel.",
)

# ── SHEET 2: the whole vocabulary ───────────────────────────────────────────────────────────
sheet(
    [
        (
            "Three names he gave, three the build proposed and he accepted — six states, six lands.",
            [
                ("terrain-healthy-on-8px", "healthy — forest", "he named it · closed canopy, undisturbed"),
                ("terrain-mapped-on-8px", "mapped — heath", "he accepted it · walked and marked, not worked"),
                ("terrain-proposed-on-8px", "proposed — fallow", "he accepted it · ploughed, nothing grown yet"),
            ],
        ),
        (
            "",
            [
                ("terrain-building-on-8px", "building — wheatfield", "he named it · the crop standing, work in flight"),
                ("terrain-unhealthy-on-8px", "unhealthy — swamp", "he named it · standing water in broad pools"),
                ("terrain-unknown-on-8px", "unknown — scree", "he accepted it · broken stone, nothing growing"),
            ],
        ),
    ],
    620,
    "terrain-vocabulary-2026-08-28.png",
    "The six states as six terrains",
    "Whole islands at 8 px per ground unit, bare land, one state each. A terrain is a rotation and "
    "a squeeze of the grain octave's sample space — no second noise, no new texture, no new vertex "
    "attribute, no new dependency. Three of the six names are his own; three were proposed here and "
    "he accepted them on 2026-08-28 — the vocabulary is settled in full.",
)
