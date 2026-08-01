"""contact-sheet.png (checkerboard grid, 4x4, 2x nearest) and preview.gif (dark field, 3x)."""
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FR = os.path.join(HERE, "..", "frames")
OUTD = os.path.join(HERE, "..")

files = sorted(glob.glob(os.path.join(FR, "frame-*.png")))
ims = [Image.open(f).convert("RGBA") for f in files]
n = len(ims)
cols = 4
rows = (n + cols - 1) // cols
cw, ch = ims[0].size

sheet = Image.new("RGBA", (cols * cw, rows * ch), (255, 255, 255, 255))
p = sheet.load()
for y in range(rows * ch):
    for x in range(cols * cw):
        p[x, y] = (188, 188, 188, 255) if ((x // 8) + (y // 8)) % 2 else (243, 243, 243, 255)
for k, im in enumerate(ims):
    sheet.alpha_composite(im, ((k % cols) * cw, (k // cols) * ch))
sheet = sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST)
sheet.save(os.path.join(OUTD, "contact-sheet.png"), optimize=True)
print("contact-sheet.png", sheet.size, os.path.getsize(os.path.join(OUTD, "contact-sheet.png")))

SCALE = 3
BG = (26, 30, 26)
gif = []
for im in ims:
    f = Image.new("RGBA", im.size, BG + (255,))
    f.alpha_composite(im)
    gif.append(f.resize((im.size[0] * SCALE, im.size[1] * SCALE), Image.NEAREST).convert("P", palette=Image.ADAPTIVE, colors=128))
# hold the settled final pose
durations = [140] * (len(gif) - 1) + [1400]
gif[0].save(
    os.path.join(OUTD, "preview.gif"),
    save_all=True,
    append_images=gif[1:],
    duration=durations,
    loop=0,
    disposal=2,
)
print("preview.gif", os.path.getsize(os.path.join(OUTD, "preview.gif")))
