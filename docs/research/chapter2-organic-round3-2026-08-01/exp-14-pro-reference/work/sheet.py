"""Contact-sheet builders: candidate quads and the final track sheet."""
import glob
import sys

from PIL import Image, ImageDraw


def checker(w, h, cell=8, a=(64, 64, 68), b=(84, 84, 90)):
    im = Image.new('RGB', (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=b)
    return im


def sheet(paths, out, cols, scale=2, labels=None, pad=6):
    ims = [Image.open(p).convert('RGBA') for p in paths]
    w, h = ims[0].size
    sw, sh = w * scale, h * scale
    rows = (len(ims) + cols - 1) // cols
    W = cols * sw + (cols + 1) * pad
    H = rows * (sh + 14) + (rows + 1) * pad
    bg = checker(W, H)
    d = ImageDraw.Draw(bg)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c * (sw + pad)
        y = pad + r * (sh + 14 + pad)
        up = im.resize((sw, sh), Image.NEAREST)
        bg.paste(up, (x, y), up)
        lab = labels[i] if labels else str(i)
        d.rectangle([x, y + sh, x + sw, y + sh + 13], fill=(24, 24, 28))
        d.text((x + 3, y + sh + 2), lab, fill=(235, 235, 235))
    bg.save(out)
    return bg.size


if __name__ == '__main__':
    out = sys.argv[1]
    cols = int(sys.argv[2])
    scale = int(sys.argv[3])
    paths = []
    for g in sys.argv[4:]:
        paths.extend(sorted(glob.glob(g)))
    print(out, sheet(paths, out, cols, scale, [p.split('/')[-1].split('\\')[-1] for p in paths]))
