"""Shared PIL helpers for exp-17 reverse ablation: checkerboards, sheets, GIFs, measurements."""
from PIL import Image
from pathlib import Path


def checker(w, h, cell=8, a=(190, 190, 190), b=(230, 230, 230)):
    im = Image.new("RGB", (w, h), a)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if ((x // cell) + (y // cell)) % 2:
                px[x, y] = b
    return im


def on_checker(img, cell=8, scale=1):
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    bg = checker(img.width, img.height, cell * scale)
    bg.paste(img, (0, 0), img)
    return bg


def on_dark(img, scale=1, colour=(24, 28, 26)):
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    bg = Image.new("RGB", (img.width, img.height), colour)
    bg.paste(img, (0, 0), img)
    return bg


def sheet(paths, cols, scale=1, cell=8, pad=4, label=False):
    imgs = [Image.open(p).convert("RGBA") for p in paths]
    w = max(i.width for i in imgs) * scale
    h = max(i.height for i in imgs) * scale
    rows = (len(imgs) + cols - 1) // cols
    out = Image.new("RGB", (cols * w + (cols + 1) * pad, rows * h + (rows + 1) * pad), (40, 40, 44))
    for n, im in enumerate(imgs):
        r, c = divmod(n, cols)
        out.paste(on_checker(im, cell, scale), (pad + c * (w + pad), pad + r * (h + pad)))
    return out


def alpha_bounds(path, thresh=8):
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A")
    bb = a.point(lambda v: 255 if v >= thresh else 0).getbbox()
    return im.size, bb


def opaque_count(path, thresh=8):
    im = Image.open(path).convert("RGBA")
    return sum(1 for v in im.getchannel("A").getdata() if v >= thresh)


def bottom_anchor(path, thresh=8, rows=3):
    """alpha-weighted x across the bottom `rows` occupied rows; bottom-most occupied y."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = list(im.getchannel("A").getdata())
    occupied = [y for y in range(h) if any(a[y * w + x] >= thresh for x in range(w))]
    if not occupied:
        return None
    ymax = occupied[-1]
    ys = [y for y in occupied if y > ymax - rows]
    num = den = 0
    for y in ys:
        for x in range(w):
            v = a[y * w + x]
            if v >= thresh:
                num += x * v
                den += v
    return (round(num / den), ymax)


def save_gif(paths, dest, scale=3, durations=None, bg=(24, 28, 26), loop=0):
    frames = [on_dark(Image.open(p).convert("RGBA"), scale, bg) for p in paths]
    frames = [f.convert("P", palette=Image.ADAPTIVE, colors=255) for f in frames]
    frames[0].save(
        dest,
        save_all=True,
        append_images=frames[1:],
        duration=durations or 220,
        loop=loop,
        optimize=True,
        disposal=2,
    )
    return Path(dest).stat().st_size
