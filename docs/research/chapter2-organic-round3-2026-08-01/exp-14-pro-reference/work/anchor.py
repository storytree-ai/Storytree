"""Root-anchor measurement + canvas normalization (round-1 rule, ADR-0274 constraint 4).

anchorRule: alpha-weighted x across the bottom three occupied rows; bottom-most occupied y.
"""
import sys

import numpy as np
from PIL import Image

ALPHA_THRESHOLD = 8


def load(path):
    return np.array(Image.open(path).convert('RGBA'))


def bbox(a):
    ys, xs = np.nonzero(a[..., 3] > ALPHA_THRESHOLD)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def root_anchor(a):
    """(x, y) of the root contact under the round-1 rule."""
    al = a[..., 3]
    occ = np.nonzero((al > ALPHA_THRESHOLD).any(axis=1))[0]
    if len(occ) == 0:
        return None
    y = int(occ.max())
    rows = [r for r in (y, y - 1, y - 2) if r >= 0]
    w = al[rows, :].astype(float)
    w = np.where(w > ALPHA_THRESHOLD, w, 0.0)
    cols = np.arange(a.shape[1])
    total = w.sum()
    if total == 0:
        return None
    x = int(round(float((w.sum(axis=0) * cols).sum() / total)))
    return x, y


def normalize(path, out, canvas, anchor):
    """Paste `path` into a canvas x canvas transparent frame so its root anchor lands on `anchor`."""
    a = load(path)
    src = root_anchor(a)
    bb = bbox(a)
    dx, dy = anchor[0] - src[0], anchor[1] - src[1]
    dst = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    dst.paste(Image.fromarray(a), (dx, dy), Image.fromarray(a))
    dst.save(out)
    da = np.array(dst)
    return {
        'src': path, 'out': out,
        'sourceAnchor': {'x': src[0], 'y': src[1]},
        'sourceBBox': bb,
        'offset': {'x': dx, 'y': dy},
        'normalizedAnchor': dict(zip('xy', root_anchor(da))),
        'normalizedBBox': bbox(da),
    }


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'measure':
        for p in sys.argv[2:]:
            a = load(p)
            print(p, 'bbox', bbox(a), 'anchor', root_anchor(a))
    elif cmd == 'norm':
        canvas = int(sys.argv[2])
        ax, ay = int(sys.argv[3]), int(sys.argv[4])
        print(normalize(sys.argv[5], sys.argv[6], canvas, (ax, ay)))
