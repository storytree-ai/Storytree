#!/usr/bin/env python3
"""Measure a 19-frame track against the round-4 honesty bar.

Usage:  python measure.py frames [--ref <exp16 frames dir>] [--json out.json]

Reports per frame: alpha bounds (bbox), anchor + drift, alpha px, mass step,
8-connected body count, encoded bytes; and per track: distinct RGB colours
(alpha>=8), distinct RGBA, adjacent-frame silhouette IoU floor, total bytes.

The tree layer is measured separately from any baked cast-shadow layer so the
numbers stay comparable with exp-16 (which has no shadow).  A pixel is 'tree'
when alpha == 255; the shadow is the only partially transparent thing we emit.
"""
from __future__ import annotations
import argparse, collections, glob, json, os, sys
import numpy as np
from PIL import Image

ANCHOR = (64.0, 122.0)


def load(path):
    a = np.array(Image.open(path).convert("RGBA"))
    return a


def tree_mask(a):
    return a[..., 3] == 255


def any_mask(a, thr=8):
    return a[..., 3] >= thr


def anchor_of(mask):
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    gy = int(ys.max())
    band = mask[max(0, gy - 32):max(1, gy - 21), :]
    w = band.sum()
    if w == 0:
        band = mask
        w = band.sum()
    cols = np.arange(mask.shape[1])
    tx = float((band.sum(axis=0) * cols).sum() / max(w, 1))
    return tx, float(gy)


def bodies(mask):
    """count 8-connected components (iterative flood fill)."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    n = 0
    sizes = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not seen[y, x]:
                n += 1
                stack = [(y, x)]
                seen[y, x] = True
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                stack.append((ny, nx))
                sizes.append(cnt)
    return n, sorted(sizes, reverse=True)


def iou(a, b):
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter) / max(1, int(union))


def track(dirpath):
    paths = sorted(glob.glob(os.path.join(dirpath, "frame-*.png")))
    rows, masks = [], []
    rgb_set, rgba_set = set(), set()
    prev = None
    for p in paths:
        a = load(p)
        tm = tree_mask(a)
        am = any_mask(a)
        masks.append(tm)
        anc = anchor_of(tm)
        ys, xs = np.nonzero(tm)
        nb, sz = bodies(tm)
        px = a.reshape(-1, 4)
        vis = px[px[:, 3] >= 8]
        for r, g, b, al in vis:
            rgb_set.add((int(r), int(g), int(b)))
            rgba_set.add((int(r), int(g), int(b), int(al)))
        ysa, xsa = np.nonzero(am)
        n = int(tm.sum())
        rows.append({
            "file": os.path.basename(p),
            "alpha_px": n,
            "step_pct": None if prev is None else round(100.0 * (n - prev) / max(1, prev), 1),
            "bbox": [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)],
            "bbox_incl_shadow": [int(xsa.min()), int(ysa.min()),
                                 int(xsa.max() - xsa.min() + 1), int(ysa.max() - ysa.min() + 1)],
            "anchor": [round(anc[0], 3), anc[1]],
            "drift": [round(anc[0] - ANCHOR[0], 3), round(anc[1] - ANCHOR[1], 3)],
            "bodies": nb,
            "stray_px": int(sum(sz[1:])) if nb > 1 else 0,
            "bytes": os.path.getsize(p),
        })
        prev = n
    ious = [round(iou(masks[i], masks[i + 1]), 4) for i in range(len(masks) - 1)]
    steps = [r["step_pct"] for r in rows if r["step_pct"] is not None]
    summ = {
        "frames": len(rows),
        "distinct_rgb": len(rgb_set),
        "distinct_rgba": len(rgba_set),
        "total_bytes": sum(r["bytes"] for r in rows),
        "mean_bytes": round(sum(r["bytes"] for r in rows) / max(1, len(rows)), 1),
        "max_abs_drift_x": max(abs(r["drift"][0]) for r in rows),
        "max_abs_drift_y": max(abs(r["drift"][1]) for r in rows),
        "iou_adjacent": ious,
        "iou_min": min(ious) if ious else None,
        "iou_mean": round(sum(ious) / len(ious), 4) if ious else None,
        "iou_worst_pair": (int(np.argmin(ious)), int(np.argmin(ious)) + 1) if ious else None,
        "mass_step_max_pct": max(steps) if steps else None,
        "mass_step_min_pct": min(steps) if steps else None,
        "any_negative_step": any(s < 0 for s in steps),
        "max_bodies": max(r["bodies"] for r in rows),
        "total_stray_px": sum(r["stray_px"] for r in rows),
    }
    return rows, summ


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--json", default="")
    ap.add_argument("--md", default="")
    args = ap.parse_args()
    rows, summ = track(args.dir)
    print(json.dumps(summ, indent=1))
    print()
    hdr = "| # | alpha px | step | bbox x,y,w,h | anchor | drift x,y | bodies | bytes |"
    print(hdr); print("|" + "---|" * 8)
    for i, r in enumerate(rows):
        st = "—" if r["step_pct"] is None else f"{r['step_pct']:+.1f}%"
        print(f"| {i} | {r['alpha_px']} | {st} | {','.join(str(v) for v in r['bbox'])} | "
              f"{r['anchor'][0]:.2f}, {r['anchor'][1]:.0f} | "
              f"{r['drift'][0]:+.2f}, {r['drift'][1]:+.0f} | {r['bodies']} | {r['bytes']} |")
    print()
    print("adjacent IoU:", " ".join(f"{v:.3f}" for v in summ["iou_adjacent"]))
    if args.json:
        with open(args.json, "w") as f:
            json.dump({"summary": summ, "frames": rows}, f, indent=1)


if __name__ == "__main__":
    main()
