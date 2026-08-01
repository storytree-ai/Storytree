"""Metrics for a 19-frame track, to the round-4 honesty bar.

  per-frame: bbox, alpha px, mass step, anchor (exp-16's rule), drift, bodies, bytes
  adjacent : silhouette IoU
  track    : distinct colour count, total bytes
"""
import sys, os, glob, json
from collections import Counter
from PIL import Image

ANCHOR = (64.0, 122.0)


def load(p):
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    px = im.load()
    return im, w, h, px


def alpha_mask(px, w, h, thr=8):
    return [[px[x, y][3] > thr for x in range(w)] for y in range(h)]


def bbox(m, w, h):
    xs = [x for y in range(h) for x in range(w) if m[y][x]]
    ys = [y for y in range(h) for x in range(w) if m[y][x]]
    if not xs:
        return None
    return min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1


def anchor_of(px, m, w, h):
    """exp-16's rule: groundY = bottom-most opaque row; trunkX = alpha-weighted x
    over the 10-row band 32..22 px above it."""
    gy = None
    for y in range(h - 1, -1, -1):
        if any(m[y]):
            gy = y
            break
    if gy is None:
        return None, None
    lo, hi = max(0, gy - 32), max(0, gy - 22)
    num = den = 0.0
    for y in range(lo, hi + 1):
        for x in range(w):
            if m[y][x]:
                a = px[x, y][3]
                num += a * x
                den += a
    if den == 0:
        # young frame too short for the band: fall back to the whole body
        for y in range(h):
            for x in range(w):
                if m[y][x]:
                    a = px[x, y][3]
                    num += a * x
                    den += a
    return (num / den if den else None), gy


def bodies(m, w, h):
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if m[y][x] and not seen[y][x]:
                st = [(y, x)]
                seen[y][x] = True
                n = 0
                while st:
                    cy, cx = st.pop()
                    n += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and m[ny][nx] and not seen[ny][nx]:
                                seen[ny][nx] = True
                                st.append((ny, nx))
                comps.append(n)
    return sorted(comps, reverse=True)


def iou(a, b, w, h):
    inter = union = 0
    for y in range(h):
        ra, rb = a[y], b[y]
        for x in range(w):
            pa, pb = ra[x], rb[x]
            if pa or pb:
                union += 1
                if pa and pb:
                    inter += 1
    return inter / union if union else 1.0


def run(pattern, label, quiet=False):
    paths = sorted(glob.glob(pattern))
    rows, masks, colours = [], [], Counter()
    total_bytes = 0
    for p in paths:
        im, w, h, px = load(p)
        m = alpha_mask(px, w, h)
        masks.append(m)
        bb = bbox(m, w, h)
        ax, gy = anchor_of(px, m, w, h)
        comps = bodies(m, w, h)
        a = sum(1 for y in range(h) for x in range(w) if m[y][x])
        nb = os.path.getsize(p)
        total_bytes += nb
        for y in range(h):
            for x in range(w):
                if m[y][x]:
                    colours[px[x, y][:3]] += 1
        rows.append(dict(f=os.path.basename(p), bbox=bb, alpha=a,
                         anchor_x=None if ax is None else round(ax, 2),
                         ground_y=gy,
                         dx=None if ax is None else round(ax - ANCHOR[0], 2),
                         dy=None if gy is None else gy - int(ANCHOR[1]),
                         bodies=len(comps), largest=comps[0] if comps else 0,
                         stray=sum(comps[1:]) if len(comps) > 1 else 0,
                         bytes=nb))
    for i, r in enumerate(rows):
        r["step"] = None if i == 0 else round(100.0 * (r["alpha"] - rows[i-1]["alpha"]) / max(1, rows[i-1]["alpha"]), 1)
        r["iou_prev"] = None if i == 0 else round(iou(masks[i-1], masks[i], w, h), 4)

    if not quiet:
        print(f"\n### {label}  ({len(rows)} frames)")
        print("| # | bbox x,y,w,h | alpha | step% | IoU(prev) | anchor x | ground y | drift x,y | bodies | stray | bytes |")
        print("|---|---|---|---|---|---|---|---|---|---|---|")
        for i, r in enumerate(rows):
            bb = r["bbox"]
            print(f"| {i:02d} | {bb[0]},{bb[1]},{bb[2]},{bb[3]} | {r['alpha']} | "
                  f"{'' if r['step'] is None else f'{r[chr(115)+chr(116)+chr(101)+chr(112)]:+.1f}'} | "
                  f"{'' if r['iou_prev'] is None else r['iou_prev']} | {r['anchor_x']} | {r['ground_y']} | "
                  f"{r['dx']}, {r['dy']} | {r['bodies']} | {r['stray']} | {r['bytes']} |")
    steps = [r["step"] for r in rows if r["step"] is not None]
    ious = [r["iou_prev"] for r in rows if r["iou_prev"] is not None]
    dxs = [abs(r["dx"]) for r in rows if r["dx"] is not None]
    dys = [abs(r["dy"]) for r in rows if r["dy"] is not None]
    summ = dict(frames=len(rows), colours=len(colours), bytes=total_bytes,
                worst_step=max(steps) if steps else 0,
                min_step=min(steps) if steps else 0,
                iou_min=min(ious) if ious else 1, iou_mean=round(sum(ious)/len(ious), 4) if ious else 1,
                max_dx=max(dxs) if dxs else 0, max_dy=max(dys) if dys else 0,
                max_bodies=max(r["bodies"] for r in rows),
                strays=sum(r["stray"] for r in rows))
    print(f"\n{label} SUMMARY: {json.dumps(summ)}")
    return rows, summ, colours


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "track")
