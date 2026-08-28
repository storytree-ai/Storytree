#!/usr/bin/env python3
"""Composite the THEME comparison sheets from the MEASURED panels.

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

MEASURE = Path(sys.argv[1] if len(sys.argv) > 1 else ".theme-measure")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else ".")

BG = (43, 49, 56)
INK = (236, 239, 241)
DIM = (143, 160, 170)
GOOD = (183, 224, 138)
BAD = (224, 138, 138)
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
        raise SystemExit(f"REFUSED: {p} is missing — run measure-theme first")
    return Image.open(p).convert("RGBA")


def scaled(name, w):
    im = load(name)
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def sheet(rows, panel_w, out_name, title, subtitle):
    """rows: list of (heading, [(tag, caption, sub)]) — a heading starting "!" is drawn as a refusal."""
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
        d.text((PAD, y), heading.lstrip("!"), font=f_h2, fill=BAD if heading.startswith("!") else GOOD)
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



STATES = ["proposed", "building", "healthy", "mapped", "unhealthy", "unknown"]
NAMES = {
    "proposed": "fallow",
    "building": "wheatfield",
    "healthy": "forest",
    "mapped": "heath",
    "unhealthy": "swamp",
    "unknown": "scree",
}


def row(theme, states, sub):
    return [(f"theme-{theme}-{s}-8px", f"{s} — {NAMES[s]}", sub) for s in states]


# ── SHEET 1: the same six states under three themes ─────────────────────────────────────────
# ⚠ ONE ISLAND, ONE RELIEF, ONE LIGHT, ONE CAMERA. The only thing that changes between rows is
# the theme, which is what makes "they look genuinely different and all still report correctly"
# a picture rather than a claim.
sheet(
    [
        ("The shipped land — the reference every theme is read against. Floor: CLEARS, tightest colour pair 1.13x its bar, land pair 3.69x.",
         row("shipped", STATES, "")),
        ("High summer — a colour-only theme, so every difference from the row above is hue. Floor: CLEARS, 1.60x / 3.69x.",
         row("high-summer", STATES, "")),
        ("Cold season — moves BOTH channels: different hues AND coarser, differently-bearing land. Floor: CLEARS, 1.87x / 3.53x.",
         row("cold-season", STATES, "")),
    ],
    460,
    "land-themes-2026-08-28.png",
    "Three themes, one island, one floor",
    "The same six states under three themes at 8 px per ground unit — bare land, the grain's normal "
    "half only, identical fixture and light throughout. A theme resolves the six settled land names "
    "to delivered colour and to the land itself. Every theme here clears ADR-0461 D3's separation "
    "floor: no pair of colours under its own bar, no delivered pixel reading as another colour, and "
    "the two states that share a token still told apart by the land. The bars are read off controls "
    "measured in the same run, never picked.",
)

# ── SHEET 2: the floor can say no ───────────────────────────────────────────────────────────
# ⚠ THIS IS THE SHEET THAT MATTERS. A floor that passes everything it is shown is
# indistinguishable from no floor, and the difference is invisible in a green run.
sheet(
    [
        ("The pair a theme can destroy: one token, two states. Under every theme these two wear the same colour, so only the LAND can tell them apart.",
         [("theme-shipped-proposed-8px", "proposed — fallow", "shipped · ploughed, nothing grown yet"),
          ("theme-shipped-building-8px", "building — wheatfield", "shipped · the crop standing"),
          ("theme-cold-season-proposed-8px", "proposed — fallow", "cold season · a different bearing, coarser"),
          ("theme-cold-season-building-8px", "building — wheatfield", "cold season · still four times finer")]),
        ("!REFUSED — and the two halves refuse for different reasons.",
         [("theme-levelled-fields-proposed-8px", "proposed — fallow", "REFUSED · 0.00 octaves apart"),
          ("theme-levelled-fields-building-8px", "building — wheatfield", "REFUSED · the same land exactly"),
          ("theme-dusk-flats-mapped-8px", "mapped — heath", "REFUSED on COLOUR · 0.09x its bar"),
          ("theme-dusk-flats-unhealthy-8px", "unhealthy — swamp", "REFUSED on COLOUR · reads as the scrub")]),
    ],
    460,
    "land-theme-refusals-2026-08-28.png",
    "The floor can say no — and each refusal breaks one half only",
    "Two themes authored to be refused, drawn so the refusal is a picture rather than a number's "
    "word. 'Levelled fields' wears high summer's palette, which CLEARS the colour half — and gives "
    "fallow the wheatfield's own land, so the geometry half refuses it at 0.00 octaves. 'Dusk flats' "
    "leaves the land alone, which still separates — and pulls the scrub and the standing water "
    "together until the lit ladder slides one onto the other, so the colour half refuses it at 0.09x "
    "its bar with three delivered pixels reading as the wrong colour. They break DIFFERENT halves on "
    "purpose: if both broke the same one, a floor that had silently lost the other would still refuse "
    "both and read as healthy.",
)
