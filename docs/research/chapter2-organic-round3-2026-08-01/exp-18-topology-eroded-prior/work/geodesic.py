"""
geodesic.py — the deterministic apical-erosion PRIOR generator (exp-18).

Given a mature tree RGBA plate:
  1. binarise alpha (ALPHA_T)
  2. BRIDGE: dilate by BRIDGE_R (chessboard) so anti-aliased 1px seams and the
     tiny sky gaps between adjacent canopy blobs do not disconnect the graph
  3. seed a multi-source BFS at the ROOT CONTACT band (the lowest ROOT_BAND rows
     of the mask) and propagate 8-connected through the bridged mask -> a
     geodesic distance field D (in BFS steps, chessboard metric along the tree)
  4. a stage keeps the ORIGINAL alpha pixels whose D <= cutoff, i.e. the
     silhouette retreats from the branch TIPS back toward the root along the
     tree's own topology
  5. optional lateral taper: a horizontal-only erosion of radius r_k thins the
     trunk/branches without lifting the bottom contact row

Everything here is pure PIL + pure python, deterministic, no model involved.
"""
import json
import sys
from collections import deque
from PIL import Image

ALPHA_T = 32


def load_mask(path, alpha_t=ALPHA_T):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A").load()
    mask = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if a[x, y] >= alpha_t:
                mask[y * w + x] = 1
    return im, w, h, mask


def dilate(mask, w, h, r):
    """Chessboard dilation by radius r (separable: r passes of 3x3)."""
    cur = mask
    for _ in range(r):
        nxt = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                if cur[y * w + x]:
                    nxt[y * w + x] = 1
                    continue
                hit = 0
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w and cur[yy * w + xx]:
                            hit = 1
                            break
                    if hit:
                        break
                nxt[y * w + x] = hit
        cur = nxt
    return cur


def erode_x(mask, w, h, r):
    """Horizontal-only erosion: keeps a pixel only if all r neighbours each side are set.
    Does NOT move the bottom row, so the root contact y never lifts."""
    if r <= 0:
        return bytearray(mask)
    cur = bytearray(mask)
    for _ in range(r):
        nxt = bytearray(w * h)
        for y in range(h):
            row = y * w
            for x in range(w):
                if not cur[row + x]:
                    continue
                left = cur[row + x - 1] if x > 0 else 0
                right = cur[row + x + 1] if x < w - 1 else 0
                if left and right:
                    nxt[row + x] = 1
        cur = nxt
    return cur


def largest_component(mask, w, h):
    seen = bytearray(w * h)
    best = []
    for s in range(w * h):
        if mask[s] and not seen[s]:
            q = deque([s])
            seen[s] = 1
            comp = []
            while q:
                p = q.popleft()
                comp.append(p)
                y, x = divmod(p, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            n = yy * w + xx
                            if mask[n] and not seen[n]:
                                seen[n] = 1
                                q.append(n)
            if len(comp) > len(best):
                best = comp
    return best


def components(mask, w, h):
    seen = bytearray(w * h)
    out = []
    for s in range(w * h):
        if mask[s] and not seen[s]:
            q = deque([s])
            seen[s] = 1
            n = 0
            while q:
                p = q.popleft()
                n += 1
                y, x = divmod(p, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            m = yy * w + xx
                            if mask[m] and not seen[m]:
                                seen[m] = 1
                                q.append(m)
            out.append(n)
    out.sort(reverse=True)
    return out


def geodesic(mask_bridged, w, h, seeds):
    INF = 1 << 30
    D = [INF] * (w * h)
    q = deque()
    for p in seeds:
        if mask_bridged[p]:
            D[p] = 0
            q.append(p)
    while q:
        p = q.popleft()
        d = D[p] + 1
        y, x = divmod(p, w)
        for dy in (-1, 0, 1):
            yy = y + dy
            if yy < 0 or yy >= h:
                continue
            for dx in (-1, 0, 1):
                xx = x + dx
                if 0 <= xx < w:
                    n = yy * w + xx
                    if mask_bridged[n] and D[n] > d:
                        D[n] = d
                        q.append(n)
    return D


def alpha_bounds(im):
    a = im.getchannel("A")
    return a.getbbox()


def main():
    src = sys.argv[1]
    outdir = sys.argv[2]
    bridge_r = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    root_band = int(sys.argv[4]) if len(sys.argv) > 4 else 4

    im, w, h, mask = load_mask(src)
    print("canvas", w, h, "alpha bbox", alpha_bounds(im))
    print("components (raw alpha):", components(mask, w, h)[:12])

    bridged = dilate(mask, w, h, bridge_r)
    print("components (bridged r=%d):" % bridge_r, components(bridged, w, h)[:12])

    # root contact band = lowest root_band rows that carry any mask pixel
    ys = [y for y in range(h) if any(mask[y * w + x] for x in range(w))]
    ymax = max(ys)
    seeds = [
        y * w + x
        for y in range(ymax - root_band + 1, ymax + 1)
        for x in range(w)
        if mask[y * w + x]
    ]
    print("root band rows", ymax - root_band + 1, "..", ymax, "seed px", len(seeds))

    D = geodesic(bridged, w, h, seeds)
    reach = [D[p] for p in range(w * h) if mask[p] and D[p] < (1 << 30)]
    unreach = sum(1 for p in range(w * h) if mask[p] and D[p] >= (1 << 30))
    print("reachable alpha px", len(reach), "unreachable", unreach,
          "max geodesic", max(reach) if reach else -1)

    json.dump(
        {
            "src": src,
            "canvas": [w, h],
            "bridge_r": bridge_r,
            "root_band": root_band,
            "root_y": ymax,
            "seed_px": len(seeds),
            "reachable": len(reach),
            "unreachable": unreach,
            "max_geodesic": max(reach) if reach else -1,
        },
        open(outdir + "/geodesic-report.json", "w"),
        indent=2,
    )


if __name__ == "__main__":
    main()
