"""Derive the transparent tree track from the stage composites.

A pixel belongs to the tree iff
  (a) it differs from the untouched plate crop by more than DIFF_TOL in any channel, AND
  (b) its colour is NOT within PAL_TOL of ANY colour present in the untouched plate crop
      (the plate is tan / sand / pale pink; trunk-brown and canopy-green are not in it), AND
  (c) it is in the connected component that reaches the root socket
      (kills stray specks and re-shaded ground far from the tree).
No feathering: alpha is 0 or 255.
"""
import os, sys, json
from collections import deque
from PIL import Image
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
DIFF_TOL = 12
PAL_TOL = 34


def plate_palette(base):
    px = base.load(); W, H = base.size
    return {px[x, y][:3] for y in range(H) for x in range(W)}


def near_palette(c, pal, tol):
    for p in pal:
        if abs(c[0] - p[0]) <= tol and abs(c[1] - p[1]) <= tol and abs(c[2] - p[2]) <= tol:
            return True
    return False


def extract(comp, base, socket, diff_tol=DIFF_TOL, pal_tol=PAL_TOL, keep_cc=True):
    W, H = base.size
    cp = comp.load(); bp = base.load()
    pal = plate_palette(base)
    cache = {}
    cand = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            c = cp[x, y][:3]; b = bp[x, y][:3]
            if max(abs(c[0] - b[0]), abs(c[1] - b[1]), abs(c[2] - b[2])) <= diff_tol:
                continue
            if c not in cache:
                cache[c] = near_palette(c, pal, pal_tol)
            if cache[c]:
                continue
            cand[y][x] = True
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    op = out.load()
    if not keep_cc:
        for y in range(H):
            for x in range(W):
                if cand[y][x]:
                    op[x, y] = cp[x, y][:3] + (255,)
        return out
    # seed the flood from every candidate pixel within 6px of the socket column,
    # falling back to the lowest candidate pixel if the socket band is empty.
    seeds = [(x, y) for y in range(H) for x in range(W)
             if cand[y][x] and abs(x - socket[0]) <= 6 and y >= socket[1] - 24]
    if not seeds:
        ys = [(y, x) for y in range(H) for x in range(W) if cand[y][x]]
        if not ys:
            return out
        seeds = [(ys[-1][1], ys[-1][0])]
    seen = [[False] * W for _ in range(H)]
    q = deque(seeds)
    for x, y in seeds:
        seen[y][x] = True
    while q:
        x, y = q.popleft()
        op[x, y] = cp[x, y][:3] + (255,)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and cand[ny][nx] and not seen[ny][nx]:
                    seen[ny][nx] = True
                    q.append((nx, ny))
    return out


if __name__ == "__main__":
    base = Image.open(os.path.join(HERE, "base-crop.png")).convert("RGBA")
    socket = (47, 100)
    rows = []
    for k in range(16):
        p = os.path.join(HERE, f"comp-{k:02d}.png")
        if not os.path.exists(p):
            continue
        comp = Image.open(p).convert("RGBA")
        t = extract(comp, base, socket)
        t.save(os.path.join(HERE, f"cut-{k:02d}.png"))
        b = lib.alpha_bounds(t); a = lib.root_anchor(t)
        n = sum(1 for y in range(t.height) for x in range(t.width) if t.load()[x, y][3] > 0)
        rows.append({"k": k, "bbox": b, "anchor": a, "px": n})
        print(k, "bbox", b, "anchor", a, "px", n)
    json.dump(rows, open(os.path.join(HERE, "cut-report.json"), "w"), indent=1)
