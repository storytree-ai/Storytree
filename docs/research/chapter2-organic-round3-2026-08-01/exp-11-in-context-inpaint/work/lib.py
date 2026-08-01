"""Shared helpers for exp-11 in-context inpaint."""
import base64, io, json, os, math
from PIL import Image, ImageDraw

ROOT = r"C:\code\storytree\docs\research\chapter2-organic-round3-2026-08-01\exp-11-in-context-inpaint"
PLATE = r"C:\code\storytree\packages\app-surface\src\assets\chapter2-organic-pose-to-pose\svg-island-reference-plate.png"

def plate():
    return Image.open(PLATE).convert("RGBA")

def b64_png(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")

def bg_arg(im):
    """background_image expects a JSON *string* holding {"type":"base64","base64":...}."""
    return json.dumps({"type": "base64", "base64": b64_png(im)})

def mask_arg(mask):
    return json.dumps({"type": "mask", "mask_image": b64_png(mask)})

def island_mask(im=None, thresh=8):
    """Tan plateau pixels (island body), as a bool grid."""
    im = im or plate()
    px = im.load()
    W, H = im.size
    g = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            r, gg, b, a = px[x, y]
            if a < thresh:
                continue
            # background is pale pink ~ (242,227,220); island tan is darker + warmer
            if r > 225 and gg > 205 and b > 200:
                continue
            # hex grid strokes are light grey-pink; island is saturated tan
            if r - b > 25 and r < 235:
                g[y][x] = True
    return g

def alpha_bounds(im, thresh=8):
    px = im.load(); W, H = im.size
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for y in range(H):
        for x in range(W):
            if px[x, y][3] >= thresh:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        return None
    return (x0, y0, x1, y1)

def root_anchor(im, thresh=8):
    """alpha-weighted x across the bottom three occupied rows; bottom-most occupied y
    (same rule as round-1 tree-registration.json)."""
    px = im.load(); W, H = im.size
    rows = [y for y in range(H) if any(px[x, y][3] >= thresh for x in range(W))]
    if not rows:
        return None
    ymax = rows[-1]
    wsum = 0.0; num = 0.0
    for y in (ymax, ymax - 1, ymax - 2):
        if y < 0: continue
        for x in range(W):
            a = px[x, y][3]
            if a >= thresh:
                wsum += a; num += a * x
    return (round(num / wsum), ymax)

def checker(w, h, cell=8, a=(58, 58, 66), b=(44, 44, 50)):
    im = Image.new("RGBA", (w, h), a + (255,))
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if ((x // cell) + (y // cell)) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b + (255,))
    return im

def diff_extract(composite, base, tol=10):
    """Keep pixels of `composite` that differ from `base` beyond `tol` in any channel."""
    cw, ch = composite.size
    assert base.size == (cw, ch), (composite.size, base.size)
    cp = composite.load(); bp = base.load()
    out = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    op = out.load()
    n = 0
    for y in range(ch):
        for x in range(cw):
            c = cp[x, y]; b = bp[x, y]
            if max(abs(c[0] - b[0]), abs(c[1] - b[1]), abs(c[2] - b[2])) > tol or abs(c[3] - b[3]) > tol:
                op[x, y] = (c[0], c[1], c[2], 255)
                n += 1
    return out, n
