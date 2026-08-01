"""View helper: composite RGBA PNGs onto a checkerboard, upscale nearest, tile in a row."""
import sys, os
from PIL import Image

def checker(w, h, s=8, a=(210, 210, 210), b=(150, 150, 150)):
    im = Image.new("RGB", (w, h), a)
    px = im.load()
    for y in range(h):
        for x in range(w):
            if ((x // s) + (y // s)) % 2:
                px[x, y] = b
    return im

def main():
    out = sys.argv[1]
    scale = int(sys.argv[2])
    paths = sys.argv[3:]
    ims = []
    for p in paths:
        im = Image.open(p).convert("RGBA")
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        bg = checker(big.width, big.height, s=8 * scale)
        bg.paste(big, (0, 0), big)
        ims.append(bg)
    W = sum(i.width for i in ims) + 4 * (len(ims) - 1)
    H = max(i.height for i in ims)
    sheet = Image.new("RGB", (W, H), (30, 30, 30))
    x = 0
    for i in ims:
        sheet.paste(i, (x, 0))
        x += i.width + 4
    sheet.save(out)
    print(out, sheet.size)

main()
