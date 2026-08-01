"""Assemble a chosen ladder into the normalized 192x192 track + registration report.

usage: python work/build_track.py <ladder.txt>
  ladder.txt: one raw/<file>.png per line, frame 00..NN in order.
Author-time steps, in order, per frame:
  1. drop alpha-connected components smaller than SPECK_PX (stray specks only; reported)
  2. measure the root anchor (alpha-weighted x over the bottom three occupied rows, bottom-most y)
  3. paste into a 192x192 transparent canvas so that anchor lands on (96, 188)
No scaling, no recolour, no redraw.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

CANVAS = 192
ANCHOR = (96, 188)
TH = 8
SPECK_PX = 24


def comps(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and lab[sy, sx] == 0:
                n += 1
                q = deque([(sy, sx)])
                lab[sy, sx] = n
                while q:
                    y, x = q.popleft()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and lab[ny, nx] == 0:
                                lab[ny, nx] = n
                                q.append((ny, nx))
    return lab, n


def despeckle(a):
    lab, n = comps(a[..., 3] > TH)
    removed = []
    keep = np.zeros(lab.shape, bool)
    for i in range(1, n + 1):
        m = lab == i
        s = int(m.sum())
        if s >= SPECK_PX:
            keep |= m
        else:
            removed.append(s)
    out = a.copy()
    out[..., 3] = np.where(keep, a[..., 3], 0)
    return out, removed


def anchor_of(a):
    al = a[..., 3]
    occ = np.nonzero((al > TH).any(axis=1))[0]
    y = int(occ.max())
    rows = [r for r in (y, y - 1, y - 2) if r >= 0]
    w = np.where(al[rows, :] > TH, al[rows, :], 0).astype(float)
    cols = np.arange(a.shape[1])
    return int(round(float((w.sum(axis=0) * cols).sum() / w.sum()))), y


def bbox(a):
    ys, xs = np.nonzero(a[..., 3] > TH)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main(ladder_file):
    root = os.path.dirname(os.path.dirname(os.path.abspath(ladder_file)))
    src = [l.strip() for l in open(ladder_file, encoding='utf-8') if l.strip() and not l.startswith('#')]
    os.makedirs(os.path.join(root, 'frames'), exist_ok=True)
    report = {'canvas': {'width': CANVAS, 'height': CANVAS, 'format': 'PNG', 'decoded': 'RGBA8'},
              'frameCount': len(src), 'targetAnchor': {'x': ANCHOR[0], 'y': ANCHOR[1]},
              'alphaThreshold': TH,
              'anchorRule': 'alpha-weighted x across bottom three occupied rows; bottom-most occupied y',
              'speckleFloorPx': SPECK_PX, 'frames': []}
    for i, s in enumerate(src):
        a = np.array(Image.open(os.path.join(root, s)).convert('RGBA'))
        a, removed = despeckle(a)
        ax, ay = anchor_of(a)
        sb = bbox(a)
        dx, dy = ANCHOR[0] - ax, ANCHOR[1] - ay
        dst = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        im = Image.fromarray(a)
        dst.paste(im, (dx, dy), im)
        out = os.path.join(root, 'frames', f'frame-{i:02d}.png')
        dst.save(out, optimize=True)
        da = np.array(dst)
        nx, ny = anchor_of(da)
        nb = bbox(da)
        report['frames'].append({
            'file': f'frame-{i:02d}.png', 'source': s,
            'sourceAnchor': {'x': ax, 'y': ay},
            'sourceFootprint': {'x': sb[0], 'y': sb[1], 'width': sb[2] - sb[0], 'height': sb[3] - sb[1]},
            'normalizationOffset': {'x': dx, 'y': dy},
            'normalizedAnchor': {'x': nx, 'y': ny},
            'normalizedFootprint': {'x': nb[0], 'y': nb[1], 'width': nb[2] - nb[0], 'height': nb[3] - nb[1]},
            'anchorDriftPx': {'x': nx - ANCHOR[0], 'y': ny - ANCHOR[1]},
            'specklesRemovedPx': removed,
            'encodedBytes': os.path.getsize(out),
        })
    report['encodedFrameBytes'] = sum(f['encodedBytes'] for f in report['frames'])
    report['decodedRgbaBytes'] = CANVAS * CANVAS * 4 * len(src)
    report['maxAnchorDriftPx'] = max(
        max(abs(f['anchorDriftPx']['x']), abs(f['anchorDriftPx']['y'])) for f in report['frames'])
    with open(os.path.join(root, 'tree-registration.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)
    for f in report['frames']:
        print(f"{f['file']} <- {f['source']}  anchor{f['normalizedAnchor']} drift{f['anchorDriftPx']} "
              f"bbox {f['normalizedFootprint']} specks{f['specklesRemovedPx']} {f['encodedBytes']}B")
    print('maxAnchorDriftPx', report['maxAnchorDriftPx'], 'encodedFrameBytes', report['encodedFrameBytes'])


if __name__ == '__main__':
    main(sys.argv[1])
