"""Shared measurement + normalization helpers. Pure local PIL; no vendor calls."""
from PIL import Image

CANVAS = 192
ANCHOR = (96, 188)
ALPHA_THR = 8


def load(p):
    return Image.open(p).convert("RGBA")


def alpha_bbox(im, thr=ALPHA_THR):
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= thr:
                x0 = min(x0, x)
                y0 = min(y0, y)
                x1 = max(x1, x)
                y1 = max(y1, y)
    if x1 < 0:
        return None
    return (x0, y0, x1 + 1, y1 + 1)


def root_anchor(im, thr=ALPHA_THR):
    """Round-1's rule: alpha-weighted x across the bottom three occupied rows,
    bottom-most occupied y."""
    px = im.load()
    w, h = im.size
    rows = [y for y in range(h) if any(px[x, y][3] >= thr for x in range(w))]
    if not rows:
        return None
    ymax = rows[-1]
    band = [y for y in rows if y > ymax - 3]
    num = den = 0.0
    for y in band:
        for x in range(w):
            a = px[x, y][3]
            if a >= thr:
                num += x * a
                den += a
    return (int(round(num / den)), ymax)


def place(im, scale=1.0, canvas=CANVAS, anchor=ANCHOR):
    """Crop to content, optionally scale (NEAREST), then paste so that the content's
    root anchor lands exactly on `anchor` in a transparent `canvas` square."""
    b = alpha_bbox(im)
    c = im.crop(b)
    if scale != 1.0:
        nw = max(1, int(round(c.size[0] * scale)))
        nh = max(1, int(round(c.size[1] * scale)))
        c = c.resize((nw, nh), Image.NEAREST)
    a = root_anchor(c)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(c, (anchor[0] - a[0], anchor[1] - a[1]))
    return out
