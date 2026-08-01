#!/usr/bin/env python3
"""Measure a 128x128 19-frame track against the round-4 honesty bar.

  python measure.py <frames-dir> [--json out.json]

Reports per frame: alpha bounds/bbox, anchor + drift (exp-16's own anchor rule),
mass step, 8-connected body count, distinct colours, bytes; and per adjacent pair:
silhouette IoU.  Also totals and the determinism hash of the directory.
"""
import glob
import hashlib
import json
import os
import sys
from collections import Counter

from PIL import Image

W = H = 128
AX, AY = 64, 122
ATH = 8


def load(p):
    im = Image.open(p).convert("RGBA")
    px = im.load()
    mask = [[px[x, y][3] >= ATH for x in range(im.width)] for y in range(im.height)]
    return im, px, mask


def bodies(mask, w, h):
    lab = [[-1] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or lab[y][x] >= 0:
                continue
            cid = len(comps)
            st = [(x, y)]
            lab[y][x] = cid
            n = 0
            while st:
                cx, cy = st.pop()
                n += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ax, ay = cx + dx, cy + dy
                        if 0 <= ax < w and 0 <= ay < h and mask[ay][ax] and lab[ay][ax] < 0:
                            lab[ay][ax] = cid
                            st.append((ax, ay))
            comps.append(n)
    return comps


def anchor(mask, w, h):
    """exp-16's rule: groundY = bottom-most opaque row; trunkX = alpha-weighted x over
    the 10-row band 32..22 px above it."""
    gy = max(y for y in range(h) if any(mask[y]))
    lo, hi = gy - 32, gy - 22
    xs, n = 0.0, 0
    for y in range(max(0, lo), min(h, hi + 1)):
        for x in range(w):
            if mask[y][x]:
                xs += x
                n += 1
    return (xs / n if n else float(AX)), gy


def iou(m1, m2, w, h):
    inter = un = 0
    for y in range(h):
        r1, r2 = m1[y], m2[y]
        for x in range(w):
            a, b = r1[x], r2[x]
            if a or b:
                un += 1
                if a and b:
                    inter += 1
    return inter / un if un else 1.0


def main(d, jout=None):
    paths = sorted(glob.glob(os.path.join(d, "frame-*.png")))
    rows, masks, allc = [], [], Counter()
    tot_bytes = 0
    for p in paths:
        im, px, mask = load(p)
        w, h = im.size
        masks.append(mask)
        xs = [x for y in range(h) for x in range(w) if mask[y][x]]
        ys = [y for y in range(h) for x in range(w) if mask[y][x]]
        c = Counter(px[x, y][:3] for y in range(h) for x in range(w) if mask[y][x])
        allc.update(c)
        ax, gy = anchor(mask, w, h)
        b = os.path.getsize(p)
        tot_bytes += b
        rows.append({
            "file": os.path.basename(p), "size": [w, h],
            "bbox": [min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1],
            "alpha": len(xs), "anchor": [round(ax, 2), gy],
            "drift": [round(ax - AX, 2), gy - AY],
            "bodies": len(bodies(mask, w, h)), "distinct": len(c), "bytes": b,
            "alpha_levels": len(set(px[x, y][3] for y in range(h) for x in range(w)
                                    if px[x, y][3] > 0)),
        })
    for i, r in enumerate(rows):
        r["step_pct"] = None if i == 0 else round(
            100.0 * (r["alpha"] - rows[i - 1]["alpha"]) / rows[i - 1]["alpha"], 1)
        r["iou_prev"] = None if i == 0 else round(iou(masks[i - 1], masks[i], W, H), 3)

    sh = hashlib.sha256()
    for p in paths:
        sh.update(open(p, "rb").read())

    ious = [r["iou_prev"] for r in rows if r["iou_prev"] is not None]
    steps = [r["step_pct"] for r in rows if r["step_pct"] is not None]
    summ = {
        "frames": len(rows),
        "track_sha256": sh.hexdigest(),
        "distinct_colours_track": len(allc),
        "max_distinct_frame": max(r["distinct"] for r in rows),
        "total_bytes": tot_bytes,
        "mean_bytes": round(tot_bytes / len(rows), 1),
        "max_abs_drift_x": max(abs(r["drift"][0]) for r in rows),
        "max_abs_drift_y": max(abs(r["drift"][1]) for r in rows),
        "iou_min": min(ious), "iou_mean": round(sum(ious) / len(ious), 3),
        "step_max_pct": max(steps), "step_min_pct": min(steps),
        "bodies_max": max(r["bodies"] for r in rows),
        "alpha_levels_max": max(r["alpha_levels"] for r in rows),
        "alpha_first": rows[0]["alpha"], "alpha_last": rows[-1]["alpha"],
    }
    print(json.dumps(summ, indent=1))
    print()
    hdr = f'{"#":>2} {"bbox":>18} {"anchor":>14} {"drift":>12} {"alpha":>6} {"step%":>7} {"IoU":>6} {"bod":>4} {"col":>4} {"bytes":>6}'
    print(hdr)
    for i, r in enumerate(rows):
        print(f'{i:>2} {str(r["bbox"]):>18} {str(r["anchor"]):>14} {str(r["drift"]):>12} '
              f'{r["alpha"]:>6} {str(r["step_pct"]):>7} {str(r["iou_prev"]):>6} '
              f'{r["bodies"]:>4} {r["distinct"]:>4} {r["bytes"]:>6}')
    if jout:
        json.dump({"summary": summ, "frames": rows,
                   "palette": sorted([list(k), v] for k, v in allc.items())},
                  open(jout, "w"), indent=1)
    return summ


if __name__ == "__main__":
    d = sys.argv[1]
    j = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None
    main(d, j)
