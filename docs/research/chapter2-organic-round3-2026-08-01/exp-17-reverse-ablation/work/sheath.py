"""Crown-sheath ablation.

Two growth axes, both pure removal from the mature pose:
  * the WOOD extends outward from the collar   -> keep_wood_k = wood & (age <= r_k)
  * the FOLIAGE thickens outward from whatever wood is currently there
                                               -> keep_leaf_k = leaf & (crownDepth_k <= rho_k)
crownDepth_k is a geodesic distance measured THROUGH the crown from the retained branches, so
the leaf front is always a rounded, lobed envelope hugging the armature. It can never detach
(distance is only defined where the crown is connected to retained wood) and it can never cut
the crown with a horizontal guillotine (the front is not a level set of height).
"""
import sys
import heapq
import numpy as np

sys.path.insert(0, "work")
from ablate import dilate, BIG

ORTH, DIAG = 3, 4
NB = [(-1, -1, DIAG), (-1, 0, ORTH), (-1, 1, DIAG), (0, -1, ORTH),
      (0, 1, ORTH), (1, -1, DIAG), (1, 0, ORTH), (1, 1, DIAG)]


def dijkstra(domain, seed, cap=None):
    """Chamfer-3-4 geodesic distance inside `domain` from `seed` (bool arrays). O(n log n)."""
    h, w = domain.shape
    d = np.full((h, w), BIG, np.int32)
    heap = []
    for y, x in zip(*np.where(seed & domain)):
        d[y, x] = 0
        heap.append((0, int(y), int(x)))
    heapq.heapify(heap)
    while heap:
        dv, y, x = heapq.heappop(heap)
        if dv > d[y, x]:
            continue
        if cap is not None and dv > cap:
            continue
        for dy, dx, c in NB:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and domain[ny, nx]:
                nd = dv + c
                if nd < d[ny, nx]:
                    d[ny, nx] = nd
                    heapq.heappush(heap, (nd, ny, nx))
    return d


def stage(wood, leaf, age, r, rho, bridge=1):
    """One rung of the ladder. r/rho are in pixels; None means 'everything'."""
    kw = wood.copy() if r is None else (wood & (age <= r * 3))
    if not kw.any():
        return kw
    body = leaf | kw
    bodyb = dilate(body, bridge) & (leaf | wood)
    cd = dijkstra(bodyb, dilate(kw, bridge) & bodyb)
    kl = leaf & (cd <= (BIG if rho is None else rho * 3))
    return kw | kl
