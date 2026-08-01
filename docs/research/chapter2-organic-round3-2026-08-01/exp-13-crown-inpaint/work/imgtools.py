"""Shared PIL helpers for exp-13-crown-inpaint. Author-time only; no vendor call here."""
from PIL import Image
import os

ALPHA_T = 8


def checker(w, h, cell=8, a=(200, 200, 200, 255), b=(160, 160, 160, 255)):
    img = Image.new("RGBA", (w, h), a)
    px = img.load()
    for y in range(h):
        for x in range(w):
            if ((x // cell) + (y // cell)) % 2:
                px[x, y] = b
    return img


def alpha_bounds(img, t=ALPHA_T):
    """(x0, y0, w, h) of pixels with alpha > t, or None."""
    a = img.convert("RGBA").getchannel("A")
    bb = a.point(lambda v: 255 if v > t else 0).getbbox()
    if bb is None:
        return None
    return (bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1])


def anchor(img, t=ALPHA_T):
    """Round-1 anchorRule: alpha-weighted x across the bottom three occupied rows;
    bottom-most occupied y."""
    img = img.convert("RGBA")
    w, h = img.size
    a = img.getchannel("A").load()
    rows = [y for y in range(h) if any(a[x, y] > t for x in range(w))]
    if not rows:
        return None
    bottom = rows[-1]
    use = [y for y in rows[-3:]]
    num = den = 0.0
    for y in use:
        for x in range(w):
            v = a[x, y]
            if v > t:
                num += x * v
                den += v
    return (num / den, float(bottom))


def sheet(paths, cols, scale=2, pad=6, label=True, bg=None):
    ims = [Image.open(p).convert("RGBA") for p in paths]
    tw = max(i.width for i in ims) * scale
    th = max(i.height for i in ims) * scale
    rows = (len(ims) + cols - 1) // cols
    W = cols * tw + (cols + 1) * pad
    H = rows * th + (rows + 1) * pad
    out = checker(W, H) if bg is None else Image.new("RGBA", (W, H), bg)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        out.alpha_composite(big, (pad + c * (tw + pad), pad + r * (th + pad)))
    return out


def gif(paths, dest, scale=3, dur=520, bg=(24, 26, 30)):
    frames = []
    for p in paths:
        im = Image.open(p).convert("RGBA")
        canvas = Image.new("RGBA", im.size, bg + (255,))
        canvas.alpha_composite(im)
        canvas = canvas.resize((im.width * scale, im.height * scale), Image.NEAREST)
        frames.append(canvas.convert("P", palette=Image.ADAPTIVE, colors=255))
    frames[0].save(dest, save_all=True, append_images=frames[1:], duration=dur, loop=0,
                   optimize=False, disposal=2)
