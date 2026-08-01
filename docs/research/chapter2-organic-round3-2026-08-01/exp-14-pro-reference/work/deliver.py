"""Build contact-sheet.png (checkerboard grid) and preview.gif (nearest-neighbour dark field)."""
import glob
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAMES = sorted(glob.glob(os.path.join(ROOT, 'frames', 'frame-*.png')))


def checker(w, h, cell=8, a=(58, 58, 62), b=(78, 78, 84)):
    im = Image.new('RGB', (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b)
    return im


def contact_sheet(out, cols=3, scale=2, pad=8):
    ims = [Image.open(p).convert('RGBA') for p in FRAMES]
    w, h = ims[0].size
    sw, sh = w * scale, h * scale
    rows = (len(ims) + cols - 1) // cols
    W = cols * sw + (cols + 1) * pad
    H = rows * (sh + 16) + (rows + 1) * pad
    bg = checker(W, H)
    d = ImageDraw.Draw(bg)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c * (sw + pad)
        y = pad + r * (sh + 16 + pad)
        up = im.resize((sw, sh), Image.NEAREST)
        bg.paste(up, (x, y), up)
        # the registered ground line + root anchor, drawn so the eye can check the drift claim
        d.line([(x, y + 188 * scale), (x + sw, y + 188 * scale)], fill=(255, 120, 90), width=1)
        d.line([(x + 96 * scale, y + sh - 10), (x + 96 * scale, y + sh)], fill=(255, 120, 90), width=1)
        d.rectangle([x, y + sh, x + sw, y + sh + 15], fill=(22, 22, 26))
        d.text((x + 4, y + sh + 3), os.path.basename(FRAMES[i]), fill=(235, 235, 235))
    bg.save(out)
    return bg.size


def preview_gif(out, scale=3, hold_ms=420, last_ms=1500):
    field = (26, 28, 32)
    frames, durs = [], []
    for i, p in enumerate(FRAMES):
        im = Image.open(p).convert('RGBA')
        up = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        bg = Image.new('RGBA', up.size, field + (255,))
        bg.alpha_composite(up)
        frames.append(bg.convert('P', palette=Image.ADAPTIVE, colors=255))
        durs.append(last_ms if i == len(FRAMES) - 1 else hold_ms)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=durs, loop=0,
                   optimize=True, disposal=2)
    return os.path.getsize(out)


if __name__ == '__main__':
    print('contact-sheet.png', contact_sheet(os.path.join(ROOT, 'contact-sheet.png')))
    print('preview.gif bytes', preview_gif(os.path.join(ROOT, 'preview.gif')))
