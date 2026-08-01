from PIL import Image, ImageDraw

ROOT_X, ROOT_Y = 99, 150
BOTTOM_Y = 158


def ellipse_mask(size, rx, top, cx=ROOT_X, bottom=BOTTOM_Y, freeze=None, freeze_y=None):
    """WHITE = generate, BLACK = keep. Ellipse anchored at a fixed bottom, growing up/out."""
    W, H = size
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, top, cx + rx, bottom], fill=255)
    if freeze is not None:
        fp = freeze.load(); mp = m.load()
        y0 = 0 if freeze_y is None else freeze_y
        for y in range(y0, H):
            for x in range(W):
                if fp[x, y][3] > 8:
                    mp[x, y] = 0
    return m
