"""Measured frame-to-frame continuity of the finished track.

Reports, per frame: alpha bounds, root-anchor drift from the registered target, the trunk's
wood-column centre and width 45 / 30 px above the ground line, root-fan spread, foliage px; and per
adjacent pair: silhouette IoU, trunk-centre shift, and the wood-column overlap in the lower
trunk band (the number that says whether the SAME trunk is still standing there).
"""
import glob
import json
import os

import numpy as np
from PIL import Image

TH = 8
GROUND = 188
ANCHOR_X = 96


def load(p):
    return np.array(Image.open(p).convert('RGBA')).astype(int)


def row_span(al, y):
    xs = np.nonzero(al[y, :])[0]
    return (int(xs.min()), int(xs.max()), float(xs.mean())) if len(xs) else None


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    files = sorted(glob.glob(os.path.join(root, 'frames', 'frame-*.png')))
    per, masks = [], []
    for p in files:
        a = load(p)
        al = a[..., 3] > TH
        masks.append(al)
        ys, xs = np.nonzero(al)
        occ = np.nonzero(al.any(axis=1))[0]
        y1 = int(occ.max())
        rows = np.where(a[[y1, y1 - 1, y1 - 2], :, 3] > TH, a[[y1, y1 - 1, y1 - 2], :, 3], 0).astype(float)
        cols = np.arange(al.shape[1])
        ax = int(round(float((rows.sum(axis=0) * cols).sum() / rows.sum())))
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        foliage = int((al & (g >= r) & (g > b + 8)).sum())
        e = {
            'file': os.path.basename(p),
            'bbox': [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
            'width': int(xs.max() - xs.min() + 1), 'height': int(ys.max() - ys.min() + 1),
            'groundRow': y1, 'rootAnchorX': ax,
            'anchorDriftPx': {'x': ax - ANCHOR_X, 'y': y1 - GROUND},
            'foliagePx': foliage, 'alphaPx': int(al.sum()),
        }
        wood = al & (r > g + 10) & (r > b + 25)
        for off, key in ((45, 'trunkAt45'), (30, 'trunkAt30'), (2, 'rootFanAt2')):
            yy = y1 - off
            xs2 = np.nonzero(wood[yy, :])[0] if 0 <= yy < wood.shape[0] else np.array([])
            if len(xs2) == 0:
                e[key] = None
                continue
            # the wood run nearest the root anchor = the trunk column at this height
            runs, start = [], xs2[0]
            for k in range(1, len(xs2)):
                if xs2[k] != xs2[k - 1] + 1:
                    runs.append((start, xs2[k - 1]))
                    start = xs2[k]
            runs.append((start, xs2[-1]))
            x0, x1 = min(runs, key=lambda rr: abs((rr[0] + rr[1]) / 2 - ax))
            e[key] = {'x0': int(x0), 'x1': int(x1), 'centre': round((x0 + x1) / 2, 1),
                      'width': int(x1 - x0 + 1)}
        per.append(e)

    pairs = []
    for i in range(len(masks) - 1):
        a, b = masks[i], masks[i + 1]
        inter = int((a & b).sum())
        union = int((a | b).sum())
        band = slice(GROUND - 34, GROUND - 4)
        ba, bb = a[band, :], b[band, :]
        binter = int((ba & bb).sum())
        bunion = int((ba | bb).sum())
        ca = per[i]['trunkAt45']['centre'] if per[i]['trunkAt45'] else 0
        cb = per[i + 1]['trunkAt45']['centre'] if per[i + 1]['trunkAt45'] else 0
        pairs.append({
            'pair': f"{i:02d}->{i + 1:02d}",
            'silhouetteIoU': round(inter / union, 3),
            'lowerTrunkBandIoU': round(binter / bunion, 3),
            'trunkCentreShiftPx': round(cb - ca, 1),
            'heightDeltaPx': per[i + 1]['height'] - per[i]['height'],
            'widthDeltaPx': per[i + 1]['width'] - per[i]['width'],
            'foliageRatio': round(per[i + 1]['foliagePx'] / max(1, per[i]['foliagePx']), 2),
        })

    out = {'frames': per, 'adjacent': pairs,
           'maxAnchorDriftPx': max(max(abs(f['anchorDriftPx']['x']), abs(f['anchorDriftPx']['y']))
                                   for f in per),
           'maxTrunkCentreShiftPx': max(abs(p['trunkCentreShiftPx']) for p in pairs),
           'minSilhouetteIoU': min(p['silhouetteIoU'] for p in pairs),
           'minLowerTrunkBandIoU': min(p['lowerTrunkBandIoU'] for p in pairs)}
    with open(os.path.join(root, 'continuity.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=2)
    print(f"{'frame':10}{'w':>5}{'h':>5}{'anchorDx':>9}{'anchorDy':>9}{'trunkC@45':>11}"
          f"{'trunkW@45':>11}{'rootFan':>9}{'foliage':>9}")
    for f in per:
        t = f['trunkAt45'] or {'centre': 0, 'width': 0}
        rf = f['rootFanAt2'] or {'width': 0}
        print(f"{f['file'][6:8]:10}{f['width']:5}{f['height']:5}{f['anchorDriftPx']['x']:9}"
              f"{f['anchorDriftPx']['y']:9}{t['centre']:11}{t['width']:11}{rf['width']:9}{f['foliagePx']:9}")
    print()
    print(f"{'pair':10}{'silIoU':>9}{'trunkIoU':>10}{'trunkDx':>9}{'dH':>6}{'dW':>6}{'foliage x':>11}")
    for p in pairs:
        print(f"{p['pair']:10}{p['silhouetteIoU']:9}{p['lowerTrunkBandIoU']:10}"
              f"{p['trunkCentreShiftPx']:9}{p['heightDeltaPx']:6}{p['widthDeltaPx']:6}{p['foliageRatio']:11}")
    print()
    print('maxAnchorDriftPx', out['maxAnchorDriftPx'],
          '| maxTrunkCentreShiftPx', out['maxTrunkCentreShiftPx'],
          '| minSilhouetteIoU', out['minSilhouetteIoU'],
          '| minLowerTrunkBandIoU', out['minLowerTrunkBandIoU'])


if __name__ == '__main__':
    main()
