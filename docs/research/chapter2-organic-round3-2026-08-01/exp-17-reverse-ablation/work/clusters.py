"""Segment the crown into its drawn leaf clusters, using the artist's own dark rim colours
as separators. A cluster is the unit of growth: a tree adds a whole tuft, not a shell of pixels.
"""
import numpy as np
from collections import deque

NB8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def components(mask, min_size=1):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or lab[sy, sx]:
                continue
            n += 1
            q = deque([(sy, sx)])
            lab[sy, sx] = n
            px = []
            while q:
                y, x = q.popleft()
                px.append((y, x))
                for dy, dx in NB8:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
            if len(px) < min_size:
                for y, x in px:
                    lab[y, x] = 0
                n -= 1
                # relabel: simply mark 0; ids stay sparse but we renumber at the end
    ids = [i for i in np.unique(lab) if i]
    remap = {v: k + 1 for k, v in enumerate(ids)}
    out = np.zeros_like(lab)
    for v, k in remap.items():
        out[lab == v] = k
    return out, len(ids)


def grow_labels(lab, domain):
    """Multi-source BFS: every unlabelled pixel of `domain` joins its nearest label."""
    h, w = lab.shape
    out = lab.copy()
    q = deque()
    for y, x in zip(*np.where(out > 0)):
        q.append((int(y), int(x)))
    while q:
        y, x = q.popleft()
        v = out[y, x]
        for dy, dx in NB8:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and domain[ny, nx] and out[ny, nx] == 0:
                out[ny, nx] = v
                q.append((ny, nx))
    return out
