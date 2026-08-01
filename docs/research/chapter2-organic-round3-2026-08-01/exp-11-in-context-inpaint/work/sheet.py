"""Build a labelled 3x contact sheet of raw returns, each shown as (object over checker | composite over plate)."""
import sys, os, glob
from PIL import Image, ImageDraw
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw")


def build(paths, out, plate_path=os.path.join(HERE, "plate-pad.png"), scale=2, cols=4):
    plate = Image.open(plate_path).convert("RGBA")
    tiles = []
    for p in paths:
        im = Image.open(p).convert("RGBA")
        if im.size != plate.size:
            im = im.resize(plate.size, Image.NEAREST)
        obj = lib.checker(im.width, im.height); obj.alpha_composite(im)
        comp = plate.copy(); comp.alpha_composite(im)
        pair = Image.new("RGBA", (im.width * 2 + 4, im.height), (20, 20, 24, 255))
        pair.paste(obj, (0, 0)); pair.paste(comp, (im.width + 4, 0))
        tiles.append((os.path.basename(p), pair))
    tw, th = tiles[0][1].size
    tw *= scale; th *= scale
    rows = (len(tiles) + cols - 1) // cols
    lab = 14
    sheet = Image.new("RGB", (cols * (tw + 6) + 6, rows * (th + lab + 6) + 6), (16, 16, 20))
    d = ImageDraw.Draw(sheet)
    for i, (name, t) in enumerate(tiles):
        r, c = divmod(i, cols)
        x = 6 + c * (tw + 6); y = 6 + r * (th + lab + 6)
        sheet.paste(t.resize((tw, th), Image.NEAREST).convert("RGB"), (x, y))
        d.text((x + 2, y + th + 1), name[:44], fill=(210, 210, 220))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    out = sys.argv[1]
    pats = sys.argv[2:]
    paths = []
    for pat in pats:
        paths += sorted(glob.glob(pat))
    build(paths, out)
