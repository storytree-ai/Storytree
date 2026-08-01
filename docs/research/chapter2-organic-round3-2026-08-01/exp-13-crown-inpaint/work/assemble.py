"""Assemble the shipped track: select -> palette-normalise -> measure -> emit.

Nothing here re-authors art. It selects the model returns that form a monotone
ladder, applies ONE author-time palette normalisation (foliage pixels are snapped
to the mature frame's own green ramp by luminance, so the track does not flicker
hue frame to frame), and measures the result.
"""
import json
import os
import sys
sys.path.insert(0, '.')
from imgtools import Image, alpha_bounds, anchor, sheet, gif, checker
import numpy as np

OUT = '..'
RAW = '../raw'

# The shipped ladder. f4-e1/f5-e1 are real returns but were CUT from the track:
# measured foliage mass 947 / 1513 px sits BELOW frame 3's 2926, so keeping them
# would have shown the canopy shrinking. They stay in raw/ as evidence.
TRACK = [
    ('inp-f0-y1', 'f0'),
    ('inp-f1-y1', 'f1'),
    ('inp-f2-y1', 'f2'),
    ('inp-f3-y1', 'f3'),
    ('inp-f6-e1', 'f4'),
    ('inp-f7-e1', 'f5'),
    ('inp-f8-e1', 'f6'),
]
MATURE = 'inp-f8-e1'
ALPHA_T = 8


def foliage_mask(a):
    return (a[:, :, 3] > 200) & (a[:, :, 1] > a[:, :, 0] + 12) & (a[:, :, 1] > a[:, :, 2] + 12)


def luma(c):
    return 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2]


def build_ramp(path):
    a = np.array(Image.open(path).convert('RGBA'), dtype=int)
    m = foliage_mask(a)
    cols, counts = np.unique(a[m][:, :3], axis=0, return_counts=True)
    keep = cols[counts >= 12]                      # drop stray dither colours
    return keep[np.argsort(luma(keep))]


def despeckle(a):
    """Repair isolated near-white specks: 3 stray (222,212,207) pixels the base pixflux
    return carried, plus 3 pure-white holes the inpaint model punched inside a canopy.
    Deterministic (modal opaque 8-neighbour), so identical inputs stay identical."""
    fixed = 0
    tgt = ((a[:, :, 3] > 8) &
           (a[:, :, :3].min(axis=2) > 180))
    for y, x in zip(*np.nonzero(tgt)):
        nb = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                yy, xx = y + dy, x + dx
                if 0 <= yy < 192 and 0 <= xx < 192 and a[yy, xx, 3] > 8 \
                        and a[yy, xx, :3].min() <= 180:
                    nb.append(tuple(a[yy, xx, :3]))
        if not nb:
            continue
        a[y, x, :3] = max(set(nb), key=nb.count)
        fixed += 1
    return fixed


def normalise(path, ramp):
    im = Image.open(path).convert('RGBA')
    a = np.array(im, dtype=int)
    nfix = despeckle(a)
    m = foliage_mask(a)
    if m.any():
        rl = luma(ramp)
        src = luma(a[m][:, :3])
        idx = np.abs(src[:, None] - rl[None, :]).argmin(axis=1)
        out = a[m]
        out[:, :3] = ramp[idx]
        a[m] = out
    return Image.fromarray(a.astype(np.uint8), 'RGBA'), nfix


if __name__ == '__main__':
    os.makedirs(OUT + '/frames', exist_ok=True)
    ramp = build_ramp('%s/%s-00.png' % (RAW, MATURE))
    print('mature green ramp (%d entries):' % len(ramp), [tuple(c) for c in ramp])

    rows, paths, raws = [], [], []
    for i, (src, _name) in enumerate(TRACK):
        p = '%s/%s-00.png' % (RAW, src)
        raws.append(p)
        im, nfix = normalise(p, ramp)
        dest = '%s/frames/frame-%02d.png' % (OUT, i)
        im.save(dest, optimize=True)
        paths.append(dest)
        b = alpha_bounds(im)
        ax, ay = anchor(im)
        a = np.array(im, dtype=int)
        rows.append({
            'file': 'frame-%02d.png' % i,
            'source': src + '-00.png',
            'alphaBounds': {'x': b[0], 'y': b[1], 'width': b[2], 'height': b[3]},
            'anchor': {'x': round(ax, 4), 'y': ay},
            'foliagePx': int(foliage_mask(a).sum()),
            'encodedBytes': os.path.getsize(dest),
            'specksRepaired': nfix,
        })

    # frozen-region proof: every frame's rows >= 168 (the root plate) against frame 06
    ref = np.array(Image.open(paths[-1]).convert('RGBA'), dtype=int)
    for r, p in zip(rows, paths):
        cur = np.array(Image.open(p).convert('RGBA'), dtype=int)
        r['rootPlateDiffPx'] = int((np.abs(cur[168:192] - ref[168:192]).sum(axis=2) > 0).sum())
        r['trunkBandDiffPx'] = int((np.abs(cur[140:168] - ref[140:168]).sum(axis=2) > 0).sum())

    sheet(paths, 4, scale=2).save(OUT + '/contact-sheet.png')
    gif(paths, OUT + '/preview.gif', scale=3, dur=560)
    sheet(raws, 4, scale=2).save('contact-sheet-unnormalised.png')

    man = {
        'experiment': 'exp-13-crown-inpaint',
        'canvas': {'width': 192, 'height': 192, 'format': 'PNG', 'decoded': 'RGBA8'},
        'frameCount': len(rows),
        'targetAnchor': {'x': 96, 'y': 188},
        'alphaThreshold': ALPHA_T,
        'anchorRule': 'alpha-weighted x across bottom three occupied rows; bottom-most occupied y',
        'authorTimeNormalisation': [
            'integer translate of the single base canvas so its bottom-most row is y=188',
            'foliage palette snap to the mature frame green ramp (luminance-nearest)',
            'deterministic 1px despeckle of near-white pixels (modal opaque 8-neighbour)',
        ],
        'frames': rows,
        'encodedFrameBytes': sum(r['encodedBytes'] for r in rows),
        'decodedRgbaBytes': 192 * 192 * 4 * len(rows),
    }
    json.dump(man, open(OUT + '/track-manifest.json', 'w'), indent=2)
    print(json.dumps(man, indent=1))
