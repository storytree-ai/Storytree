"""Build 170x170 style-reference plates for create_1_direction_object.

S1 = the island body cut out of the real SVG reference plate (palette + camera + outline
     language), background removed, upscaled to fill a 170x170 transparent square.
S2 = the round-1 accepted mature tree pose, resampled to 170x170 transparent.
Nothing here calls a vendor; pure local PIL.
"""
from PIL import Image
import os

SRC = "C:/code/storytree/packages/app-surface/src/assets/chapter2-organic-pose-to-pose"
OUT = os.path.dirname(os.path.abspath(__file__))

BG = (242, 227, 220)


def cut_island(path, thr=34):
    """Keep only the largest connected blob that differs strongly from the map background,
    so the faint hex-grid lines and the trail stub are discarded."""
    # hard crop to the island rect first: the plate also carries the map's hex grid and a
    # trail stub at bottom-left, neither of which belongs in a tree style reference.
    im = Image.open(path).convert("RGBA").crop((22, 20, 134, 158))
    w, h = im.size
    px = im.load()
    mask = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # the island body and its pale rim are the only warm/low-blue pixels; the
            # background hex fills and grid lines all sit at blue >= 205.
            mask[y][x] = b < 205
    # largest 4-connected component
    seen = [[False] * w for _ in range(h)]
    best = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                stack = [(x, y)]
                seen[y][x] = True
                comp = []
                while stack:
                    cx, cy = stack.pop()
                    comp.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                if len(comp) > len(best):
                    best = comp
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for cx, cy in best:
        r, g, b, a = px[cx, cy]
        op[cx, cy] = (r, g, b, 255)
    # fill interior holes conservatively: any bg-ish pixel inside the blob bbox that is
    # surrounded by kept pixels stays kept via a second pass on the original colours
    xs = [p[0] for p in best]
    ys = [p[1] for p in best]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for y in range(y0, y1 + 1):
        row = [x for x in range(x0, x1 + 1) if op[x, y][3] > 0]
        if row:
            for x in range(min(row), max(row) + 1):
                if op[x, y][3] == 0:
                    r, g, b, a = px[x, y]
                    op[x, y] = (r, g, b, 255)
    return out


def bbox_alpha(im, thr=8):
    px = im.load()
    w, h = im.size
    xs0, ys0, xs1, ys1 = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= thr:
                if x < xs0:
                    xs0 = x
                if y < ys0:
                    ys0 = y
                if x > xs1:
                    xs1 = x
                if y > ys1:
                    ys1 = y
    return (xs0, ys0, xs1 + 1, ys1 + 1)


def fit_square(im, size):
    b = bbox_alpha(im)
    c = im.crop(b)
    cw, ch = c.size
    s = min(size / cw, size / ch)
    nw, nh = max(1, int(round(cw * s))), max(1, int(round(ch * s)))
    c = c.resize((nw, nh), Image.NEAREST)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(c, ((size - nw) // 2, (size - nh) // 2))
    return canvas


isl = cut_island(os.path.join(SRC, "svg-island-reference-plate.png"))
print("island bbox", bbox_alpha(isl))
s1 = fit_square(isl, 170)
s1.save(os.path.join(OUT, "style-island-170.png"))

tree = Image.open(os.path.join(SRC, "tree/frame-08.png")).convert("RGBA")
print("tree bbox", bbox_alpha(tree))
s2 = fit_square(tree, 170)
s2.save(os.path.join(OUT, "style-tree-170.png"))

for n in ("style-island-170.png", "style-tree-170.png"):
    p = os.path.join(OUT, n)
    print(n, Image.open(p).size, os.path.getsize(p), "bytes")
