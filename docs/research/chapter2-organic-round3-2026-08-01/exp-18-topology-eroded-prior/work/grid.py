"""Grid contact-sheet: RGBA frames on a checkerboard, nearest upscale, N columns."""
import sys
from PIL import Image, ImageDraw


def checker(w, h, s, a=(205, 205, 205), b=(148, 148, 148)):
    im = Image.new("RGB", (w, h), a)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if ((x // s) + (y // s)) % 2:
                px[x, y] = b
    return im


def main():
    out = sys.argv[1]
    cols = int(sys.argv[2])
    scale = int(sys.argv[3])
    label = sys.argv[4] == "1"
    paths = sys.argv[5:]
    ims = [Image.open(p).convert("RGBA") for p in paths]
    cw, ch = ims[0].width * scale, ims[0].height * scale
    rows = (len(ims) + cols - 1) // cols
    pad = 4
    W = cols * cw + (cols + 1) * pad
    H = rows * ch + (rows + 1) * pad
    sheet = Image.new("RGB", (W, H), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x = pad + c * (cw + pad)
        y = pad + r * (ch + pad)
        big = im.resize((cw, ch), Image.NEAREST)
        cell = checker(cw, ch, 8 * scale)
        cell.paste(big, (0, 0), big)
        sheet.paste(cell, (x, y))
        if label:
            d.rectangle([x, y, x + 34, y + 14], fill=(20, 20, 20))
            d.text((x + 4, y + 3), "%02d" % i, fill=(255, 230, 120))
    sheet.save(out)
    print(out, sheet.size)


main()
