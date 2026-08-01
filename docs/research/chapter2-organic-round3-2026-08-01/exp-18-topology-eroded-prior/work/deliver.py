"""deliver.py — contact sheet, prior-vs-redraw sheet, anchor-stack proof, preview GIF."""
import glob
import os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = sorted(glob.glob(BASE + "/frames/frame-*.png"))
PR = sorted(glob.glob(BASE + "/silhouettes/prior-*.png"))
ANCHOR = (96, 188)


def checker(w, h, s, a=(206, 206, 206), b=(150, 150, 150)):
    im = Image.new("RGB", (w, h), a)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if ((x // s) + (y // s)) % 2:
                px[x, y] = b
    return im


def sheet(paths, out, cols, scale, title_rows=None):
    ims = [Image.open(p).convert("RGBA") for p in paths]
    cw, ch = ims[0].width * scale, ims[0].height * scale
    rows = (len(ims) + cols - 1) // cols
    pad, lab = 5, 16
    W = cols * cw + (cols + 1) * pad
    H = rows * (ch + lab) + (rows + 1) * pad
    s = Image.new("RGB", (W, H), (22, 22, 26))
    d = ImageDraw.Draw(s)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c * (cw + pad)
        y = pad + r * (ch + lab + pad)
        cell = checker(cw, ch, 8 * scale)
        cell.paste(im.resize((cw, ch), Image.NEAREST), (0, 0), im.resize((cw, ch), Image.NEAREST))
        s.paste(cell, (x, y + lab))
        t = title_rows[i] if title_rows else "frame-%02d" % i
        d.text((x + 2, y + 3), t, fill=(240, 226, 150))
    s.save(out)
    print(out, s.size)


def anchor_stack(out, scale=3):
    """Every frame's alpha silhouette stacked, oldest darkest, with the declared root
    anchor crosshair drawn on top: any anchor drift shows as a smeared base."""
    w, h = Image.open(FR[0]).size
    base = Image.new("RGB", (w * scale, h * scale), (18, 20, 24))
    d = ImageDraw.Draw(base)
    n = len(FR)
    for i, p in enumerate(FR):
        im = Image.open(p).convert("RGBA")
        a = im.getchannel("A")
        v = 40 + int(190 * i / max(1, n - 1))
        tint = Image.new("RGBA", (w, h), (v, int(v * 0.85), 60, 255))
        tint.putalpha(a.point(lambda t: 90 if t >= 32 else 0))
        big = tint.resize((w * scale, h * scale), Image.NEAREST)
        base.paste(big, (0, 0), big)
    ax, ay = ANCHOR[0] * scale, ANCHOR[1] * scale
    d.line([(ax - 30, ay), (ax + 30, ay)], fill=(255, 70, 70), width=2)
    d.line([(ax, ay - 30), (ax, ay + 30)], fill=(255, 70, 70), width=2)
    d.text((6, 6), "9 frames stacked - declared root anchor (96,188) in red", fill=(230, 230, 230))
    base.save(out)
    print(out, base.size)


def gif(out, scale=2):
    frames = []
    hold = {0: 2, 8: 6}
    for i, p in enumerate(FR):
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGB", im.size, (16, 18, 22))
        bg.paste(im, (0, 0), im)
        big = bg.resize((im.width * scale, im.height * scale), Image.NEAREST)
        for _ in range(hold.get(i, 1)):
            frames.append(big.convert("P", palette=Image.ADAPTIVE, colors=128))
    frames[0].save(out, save_all=True, append_images=frames[1:],
                   duration=260, loop=0, optimize=True)
    print(out, os.path.getsize(out), "bytes,", len(frames), "gif frames")


sheet(FR, BASE + "/contact-sheet.png", 3, 2)
inter = []
labels = []
for i in range(len(FR)):
    inter.append(PR[i]); labels.append("prior-%02d (deterministic)" % i)
    inter.append(FR[i]); labels.append("frame-%02d (redrawn)" % i)
sheet(inter, BASE + "/silhouette-vs-redraw.png", 6, 2, labels)
anchor_stack(BASE + "/anchor-stack.png")
gif(BASE + "/preview.gif")
