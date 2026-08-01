#!/usr/bin/env python3
"""code-your-own-call — a grown-and-quantised tree.

NO generative model. Every pixel below is computed here.

Pipeline, in one line each:

  1. SKELETON  space-colonisation growth (Runions et al. 2007) in 3D, run ONCE from a
               fixed seed; every node records the iteration it was born in, so the tree
               at any age is a strict PREFIX of the mature tree — topology can never
               mutate between frames.
  2. GIRTH     da Vinci / Murray pipe model  r_parent^e = sum(r_child^e)  with an
               age-driven tip radius, so the trunk thickens continuously and correctly.
  3. FOLIAGE   leaf blades keyed to SHOOT AGE (a shoot flushes leaves, then drops them
               as it lignifies), sized allometrically so a seedling's blades are
               proportionally large; the leaf mass they represent is taken over by a
               canopy LOBE whose radius only ever grows.  Leaf -> lobe with no pop.
  4. CAMERA    orthographic, elevation 20 deg above the horizon.  Vertical is barely
               foreshortened (cos 20 = 0.940) but the GROUND PLANE compresses to
               sin 20 = 0.342, so the root fan splays on an ellipse instead of a line.
               The 0.342 is not taste: forest-world's own tree shadow is
               ellipse(rx=0.78R, ry=0.20R) => 0.256, and its signpost shadow is 0.40.
  5. SHADE     implicit-solid depth + normal buffer, one light direction, screen-space
               ambient occlusion, ground-contact darkening on the wood near the soil.
  6. PIXELS    shading quantised into flat bands whose boundaries are perturbed by
               seeded coherent noise and 4x4 ordered dither, then snapped to a palette
               taken VERBATIM from exp-16's own 32 measured colours.  Selective
               material-tinted outlines (never black, never uniform).
  7. RETIME    the 19 delivered frames are not evenly spaced in t.  A 180-sample fine
               pass measures BOTH reported motion metrics -- adjacent silhouette change
               and log mass ratio -- and the 19 frames are placed at equal arc length
               along their sum, which raises the IoU floor and flattens the mass step.
               This is free here and impossible for a generated track.

Reproduce:  python gen.py --out frames        (~40 s, numpy + PIL, nothing else)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import List, Tuple

import numpy as np
from PIL import Image

# --------------------------------------------------------------------------------------
# 0. deterministic PRNG (splitmix64) — no library RNG anywhere in this file
# --------------------------------------------------------------------------------------

M64 = (1 << 64) - 1


class Rng:
    __slots__ = ("s",)

    def __init__(self, seed: int) -> None:
        self.s = seed & M64

    def u64(self) -> int:
        self.s = (self.s + 0x9E3779B97F4A7C15) & M64
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return z ^ (z >> 31)

    def f(self) -> float:
        return (self.u64() >> 11) * (1.0 / (1 << 53))

    def uni(self, a: float, b: float) -> float:
        return a + (b - a) * self.f()

    def sym(self) -> float:
        """Roughly normal, in [-1.5, 1.5]."""
        return (self.f() + self.f() + self.f() - 1.5)


SEED = 20260801
INNER_MASK = np.zeros(1, dtype=bool)   # set once from cluster_tips()
_lr = Rng(20260801 ^ 0xC0FFEE)
LOBE_JIT = [0.80 + 0.42 * _lr.f() for _ in range(64)]

# --------------------------------------------------------------------------------------
# 1. palette — every colour below is an exact RGB triple measured out of
#    exp-16-leader-repair/frames/*.png (work/ref-stats.json).  Nothing is invented.
# --------------------------------------------------------------------------------------


def _h(s: str) -> Tuple[int, int, int]:
    return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))


# dark -> light.  index 0 of each ramp is that material's OUTLINE colour.
WOOD_OUTLINE = _h("#492c1c")
WOOD_BANDS = [_h(c) for c in ("#533220", "#664027", "#72492d", "#85613a", "#916c43", "#986a3c")]

FOLI_OUTLINE = _h("#564927")
FOLI_BANDS = [_h(c) for c in ("#5c5a2e", "#5e6e41", "#657641", "#758650", "#879459", "#ada772")]
FOLI_SPEC = _h("#bbb27d")  # the rare top highlight exp-16 uses on crown tops

# --------------------------------------------------------------------------------------
# 2. camera
# --------------------------------------------------------------------------------------

W = H = 128
ANCHOR = (64.0, 122.0)          # trunk axis crosses the ground plane here
SOIL_ROW = 122                  # nothing is drawn below this: the soil clips the roots
PHI = math.radians(20.0)
CPHI, SPHI = math.cos(PHI), math.sin(PHI)


def cam(p) -> Tuple[float, float, float]:
    """world (X right, Y up, Z toward viewer) -> (screen x, screen y down, depth)."""
    x, y, z = p
    return (x, -y * CPHI + z * SPHI, y * SPHI + z * CPHI)


def cam_v(v) -> Tuple[float, float, float]:
    return cam(v)  # same linear map; camera basis is orthonormal


def to_screen(p) -> Tuple[float, float, float]:
    sx, sy, d = cam(p)
    return (ANCHOR[0] + sx, ANCHOR[1] + sy, d)


# light, in CAMERA space (x right, y DOWN, z toward viewer): upper-left, slightly front
_L = np.array([-0.50, -0.74, 0.45])
LIGHT = _L / np.linalg.norm(_L)

# --------------------------------------------------------------------------------------
# 3. skeleton — space colonisation
# --------------------------------------------------------------------------------------

CROWN_C = (0.0, 77.0, 0.0)
CROWN_R = (46.0, 28.0, 38.0)     # X, Y, Z semi-axes of the attractor envelope
N_ATTR = 900
D_STEP = 4.0                      # internode length
D_INFL = 25.0
D_KILL = 9.6
TROPISM = np.array([0.0, 0.30, 0.0])   # upward bias
MAX_ITER = 200


class Node:
    __slots__ = ("p", "parent", "birth", "kids", "gid", "depth")

    def __init__(self, p, parent, birth):
        self.p = p
        self.parent = parent
        self.birth = birth
        self.kids: List[int] = []
        self.gid = 0
        self.depth = 0


def build_skeleton(seed: int):
    rng = Rng(seed ^ 0xA5A5)

    # --- attractor cloud: jittered rejection sampling inside a lobed ellipsoid --------
    attr = []
    guard = 0
    while len(attr) < N_ATTR and guard < N_ATTR * 60:
        guard += 1
        u = np.array([rng.uni(-1, 1), rng.uni(-1, 1), rng.uni(-1, 1)])
        if u @ u > 1.0:
            continue
        # lobe the envelope so the crown is not a smooth ball
        th = math.atan2(u[2], u[0])
        lob = 1.0 + 0.13 * math.cos(3.0 * th + 0.7) + 0.09 * math.cos(5.0 * th - 1.9)
        p = np.array([CROWN_C[0] + u[0] * CROWN_R[0] * lob,
                      CROWN_C[1] + u[1] * CROWN_R[1],
                      CROWN_C[2] + u[2] * CROWN_R[2] * lob])
        # no attractors low down near the axis: keeps a clean bole
        if p[1] < 50.0 and (p[0] ** 2 + p[2] ** 2) < 11.0 ** 2:
            continue
        if p[1] < 45.0:
            continue
        attr.append(p)
    attr = np.array(attr)
    alive = np.ones(len(attr), dtype=bool)

    # --- the bole: a wobbling leader climbing until the crown is in reach -------------
    nodes: List[Node] = [Node(np.array([0.0, 0.0, 0.0]), -1, 0)]
    dirn = np.array([0.0, 1.0, 0.0])
    it = 0
    while True:
        it += 1
        tip = nodes[-1].p
        d = np.linalg.norm(attr[alive] - tip, axis=1).min()
        if d < D_INFL:
            break
        dirn = dirn + np.array([rng.sym() * 0.085, 0.0, rng.sym() * 0.055])
        dirn = dirn / np.linalg.norm(dirn)
        np_ = tip + dirn * D_STEP
        n = Node(np_, len(nodes) - 1, it)
        nodes[-1].kids.append(len(nodes))
        nodes.append(n)
        if it > 60:
            break

    # --- space colonisation ----------------------------------------------------------
    pts = np.array([n.p for n in nodes])
    for it in range(it + 1, MAX_ITER):
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        A = attr[idx]
        dm = np.linalg.norm(A[:, None, :] - pts[None, :, :], axis=2)
        nearest = dm.argmin(axis=1)
        nd = dm[np.arange(len(A)), nearest]
        sel = nd < D_INFL
        if not sel.any():
            break
        acc = {}
        for a_i, n_i in zip(np.nonzero(sel)[0], nearest[sel]):
            v = A[a_i] - pts[n_i]
            nv = np.linalg.norm(v)
            if nv < 1e-6:
                continue
            acc.setdefault(int(n_i), np.zeros(3))
            acc[int(n_i)] += v / nv

        newp = []
        for n_i in sorted(acc.keys()):
            v = acc[n_i] + TROPISM
            # never fold back onto the parent
            par = nodes[n_i].parent
            if par >= 0:
                pv = nodes[n_i].p - nodes[par].p
                v = v + 0.45 * pv / (np.linalg.norm(pv) + 1e-9)
            v = v + np.array([rng.sym() * 0.16, rng.sym() * 0.10, rng.sym() * 0.16])
            nv = np.linalg.norm(v)
            if nv < 1e-6:
                continue
            q = nodes[n_i].p + (v / nv) * D_STEP
            nn = Node(q, n_i, it)
            nodes[n_i].kids.append(len(nodes))
            nodes.append(nn)
            newp.append(q)
        if not newp:
            break
        pts = np.array([n.p for n in nodes])
        # kill consumed attractors
        NP = np.array(newp)
        dk = np.linalg.norm(attr[:, None, :] - NP[None, :, :], axis=2).min(axis=1)
        alive &= dk > D_KILL

    # depth from root, and a group id per branch chain (for internal contouring)
    gid = 1
    for i, n in enumerate(nodes):
        if n.parent < 0:
            n.depth = 0
            n.gid = 1
        else:
            n.depth = nodes[n.parent].depth + 1
            if len(nodes[n.parent].kids) > 1 and n.parent >= 0 and nodes[n.parent].kids[0] != i:
                gid += 1
                n.gid = gid
            else:
                n.gid = nodes[n.parent].gid
    return nodes


# --------------------------------------------------------------------------------------
# 4. per-frame state:  girth, leaves, lobes  — all continuous functions of N
# --------------------------------------------------------------------------------------

PIPE_E = 2.05
R_TIP_MIN = 0.40
R_TIP_MAX = 1.15
TAU_AGE = 11.0
AGE_SHED_LO = 19.0      # a shoot starts dropping blades at this age
AGE_SHED_HI = 33.0      # and is bare by this one
LEAF_LEN = 13.0
LEAF_EVERY = 4        # a blade pair every Nth internode, not every other one
AGE_LEAF = 3.0
AGE_LOBE = 4.0
LOBE_CAP = 15.0
LOBE_MIN = 7.0
LOBE_BASE = 7.2
LOBE_CELL = 22.0
LOBE_SHELL = 0.46     # lobes only on the crown's outer shell
AGE_TAIL = 16.0         # iterations of pure secondary growth after extension stops


def tip_distance(nodes):
    """Edges from each node to its nearest descendant tip, on the MATURE skeleton.
    Static, so leaf placement cannot pop when a node stops being a tip."""
    td = [10 ** 6] * len(nodes)
    for i in range(len(nodes) - 1, -1, -1):
        if not nodes[i].kids:
            td[i] = 0
        else:
            td[i] = 1 + min(td[k] for k in nodes[i].kids)
    return td


def cluster_tips(nodes):
    """Fixed spatial clustering of the MATURE skeleton's tips.  Computed once, so a
    lobe can never appear, merge or split between frames — only grow.  Each cluster
    also carries the radius that covers its own tips, which is the radius its lobe
    grows to; that is what guarantees the crown is CLOSED once the blades are shed."""
    tips = [i for i, n in enumerate(nodes) if not n.kids]
    cells = {}
    for i in tips:
        p = nodes[i].p
        key = (int(math.floor(p[0] / LOBE_CELL)),
               int(math.floor(p[1] / (LOBE_CELL * 0.82))),
               int(math.floor(p[2] / LOBE_CELL)))
        cells.setdefault(key, []).append(i)
    inner = set()
    out = []
    for k in sorted(cells.keys()):
        mem = cells[k]
        P = np.array([nodes[i].p for i in mem])
        c = P.mean(axis=0)
        q = math.sqrt(((c[0] - CROWN_C[0]) / CROWN_R[0]) ** 2
                      + ((c[1] - CROWN_C[1]) / CROWN_R[1]) ** 2
                      + ((c[2] - CROWN_C[2]) / CROWN_R[2]) ** 2)
        if q < LOBE_SHELL:
            inner.update(mem)
            continue
        # nothing hangs under the middle of the crown: that void is where exp-16 lets
        # you watch the limbs run up into the foliage
        if c[1] < CROWN_C[1] + 0.10 * CROWN_R[1] and                 math.hypot(c[0] - CROWN_C[0], c[2] - CROWN_C[2]) < 0.62 * CROWN_R[0]:
            inner.update(mem)
            continue
        ext = float(np.linalg.norm(P - c, axis=1).max()) if len(mem) > 1 else 0.0
        rt = min(LOBE_CAP, max(LOBE_MIN, 0.80 * ext + LOBE_BASE))
        out.append((mem, rt))
    return out, inner


def frame_state(nodes, clusters, N: float):
    """N = continuous reveal iteration.  Returns per-node radius/age/alive + lobes."""
    n_all = len(nodes)
    alive = np.zeros(n_all, dtype=bool)
    frac = np.ones(n_all)
    age = np.zeros(n_all)
    for i, nd in enumerate(nodes):
        if nd.birth <= math.floor(N):
            alive[i] = True
            age[i] = N - nd.birth
        elif nd.birth <= N + 1.0:
            alive[i] = True
            frac[i] = max(0.0, N - (nd.birth - 1.0))
            age[i] = 0.0
            if frac[i] <= 0.02:
                alive[i] = False
    # pipe model, reverse order (children always have a higher index)
    r = np.zeros(n_all)
    for i in range(n_all - 1, -1, -1):
        if not alive[i]:
            continue
        r0 = R_TIP_MIN + (R_TIP_MAX - R_TIP_MIN) * (1.0 - math.exp(-age[i] / TAU_AGE))
        s = 0.0
        for k in nodes[i].kids:
            if alive[k]:
                s += r[k] ** PIPE_E
        r[i] = max(r0, s ** (1.0 / PIPE_E) if s > 0 else 0.0)

    # Leaf blade scale is a function of SHOOT AGE, not thickness.  A shoot flushes
    # leaves in its first season and drops them as it lignifies, so a seedling is
    # leafy along its whole length while a mature trunk carries none — which is
    # exactly the difference between exp-16's leafy sapling and a bare pole.
    # Shade twigs inside the crown never get a lobe, so they hold their blades longer.
    ai = np.clip(age / AGE_LEAF, 0.0, 1.0)
    lo = np.where(INNER_MASK[:n_all], AGE_SHED_LO * 1.9, AGE_SHED_LO)
    hi = np.where(INNER_MASK[:n_all], AGE_SHED_HI * 1.9, AGE_SHED_HI)
    ao_ = np.clip((age - lo) / np.maximum(hi - lo, 1e-6), 0.0, 1.0)
    lf = ai * (1.0 - ao_ * ao_ * (3 - 2 * ao_))
    lf *= alive

    # lobes: monotone mass, so a lobe only ever grows
    lobes = []
    for ci, (cl, rt) in enumerate(clusters):
        m = 0.0
        cxs = np.zeros(3)
        wsum = 0.0
        for i in cl:
            if not alive[i]:
                continue
            a = min(1.0, age[i] / AGE_LOBE)
            m += a
            cxs += nodes[i].p * a
            wsum += a
        if m <= 0.02 or wsum <= 0:
            continue
        c = cxs / wsum
        # nudge the lobe outward along the crown radius: real foliage sits on the
        # OUTSIDE of the crown volume, which is what leaves the limbs readable inside
        rv = c - np.array(CROWN_C)
        nrv = np.linalg.norm(rv)
        if nrv > 1e-6:
            c = c + rv / nrv * (0.20 * rt)
        rad = rt * (m / len(cl)) ** 0.42 * LOBE_JIT[ci % len(LOBE_JIT)]
        if rad < 1.2:
            continue
        lobes.append((ci, c, rad))
    return alive, frac, age, r, lf, lobes


# --------------------------------------------------------------------------------------
# 5. rasteriser — implicit solids into a depth / normal / material buffer
# --------------------------------------------------------------------------------------

MAT_NONE, MAT_WOOD, MAT_FOLI, MAT_LEAF = 0, 1, 2, 3


class Buf:
    def __init__(self):
        self.z = np.full((H, W), -1e9, np.float32)
        self.mat = np.zeros((H, W), np.uint8)
        self.n = np.zeros((H, W, 3), np.float32)
        self.gid = np.zeros((H, W), np.int32)
        self.wy = np.zeros((H, W), np.float32)   # world height, for ground contact

    def _win(self, x0, y0, x1, y1):
        x0 = max(0, int(math.floor(x0)))
        y0 = max(0, int(math.floor(y0)))
        x1 = min(W, int(math.ceil(x1)) + 1)
        y1 = min(H, int(math.ceil(y1)) + 1)
        return x0, y0, x1, y1

    def _write(self, x0, y0, x1, y1, m, z, nx, ny, nz, mat, gid, wy):
        sub = self.z[y0:y1, x0:x1]
        upd = m & (z > sub)
        if not upd.any():
            return
        sub[upd] = z[upd]
        self.mat[y0:y1, x0:x1][upd] = mat
        self.gid[y0:y1, x0:x1][upd] = gid
        nn = self.n[y0:y1, x0:x1]
        ln = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-9
        nn[..., 0][upd] = (nx / ln)[upd]
        nn[..., 1][upd] = (ny / ln)[upd]
        nn[..., 2][upd] = (nz / ln)[upd]
        w = self.wy[y0:y1, x0:x1]
        if np.isscalar(wy):
            w[upd] = wy
        else:
            w[upd] = wy[upd]

    # ---- capsule (branch / root) -----------------------------------------------------
    def capsule(self, A, B, rA, rB, mat, gid, wyA, wyB):
        ax, ay, az = A
        bx, by, bz = B
        rm = max(rA, rB)
        x0, y0, x1, y1 = self._win(min(ax, bx) - rm, min(ay, by) - rm,
                                   max(ax, bx) + rm, max(ay, by) + rm)
        if x1 <= x0 or y1 <= y0:
            return
        xs = np.arange(x0, x1, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        dx0 = xs - ax
        dy0 = ys - ay
        ex, ey = bx - ax, by - ay
        ll = ex * ex + ey * ey
        t = np.clip((dx0 * ex + dy0 * ey) / ll, 0.0, 1.0) if ll > 1e-9 else np.zeros_like(dx0 + dy0)
        px = ax + t * ex
        py = ay + t * ey
        dx = xs - px
        dy = ys - py
        d2 = dx * dx + dy * dy
        r = rA + (rB - rA) * t
        m = d2 <= r * r
        if not m.any():
            return
        h = np.sqrt(np.maximum(r * r - d2, 0.0))
        z = az + t * (bz - az) + h
        wy = wyA + t * (wyB - wyA)
        self._write(x0, y0, x1, y1, m, z, dx, dy, h, mat, gid, wy)

    # ---- sphere (canopy lobe) --------------------------------------------------------
    def sphere(self, C, r, mat, gid, wy):
        cx, cy, cz = C
        x0, y0, x1, y1 = self._win(cx - r, cy - r, cx + r, cy + r)
        if x1 <= x0 or y1 <= y0:
            return
        xs = np.arange(x0, x1, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        dx = xs - cx
        dy = ys - cy
        d2 = dx * dx + dy * dy
        m = d2 <= r * r
        if not m.any():
            return
        h = np.sqrt(np.maximum(r * r - d2, 0.0))
        self._write(x0, y0, x1, y1, m, cz + h, dx, dy, h, mat, gid, wy)

    # ---- leaf blade ------------------------------------------------------------------
    def blade(self, C, u, a, b, nrm, mat, gid, wy):
        cx, cy, cz = C
        ux, uy = u
        rm = max(a, b) + 1
        x0, y0, x1, y1 = self._win(cx - rm, cy - rm, cx + rm, cy + rm)
        if x1 <= x0 or y1 <= y0:
            return
        xs = np.arange(x0, x1, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1, dtype=np.float32)[:, None]
        dx = xs - cx
        dy = ys - cy
        uu = dx * ux + dy * uy
        vv = -dx * uy + dy * ux
        # a pointed blade: half-width tapers to a tip at uu = +a
        s = np.clip((uu + a) / (2 * a), 0.0, 1.0)
        hw = b * np.sin(np.pi * np.power(s, 0.72)) ** 0.85
        m = (np.abs(vv) <= hw) & (uu >= -a) & (uu <= a)
        if not m.any():
            return
        bulge = 0.55 * np.sqrt(np.maximum(1.0 - (vv / np.maximum(hw, 1e-3)) ** 2, 0.0))
        z = cz + bulge
        # curl the blade around its midrib
        cnx = nrm[0] - 0.55 * (vv / np.maximum(hw, 1e-3)) * (-uy)
        cny = nrm[1] - 0.55 * (vv / np.maximum(hw, 1e-3)) * (ux)
        cnz = np.broadcast_to(np.float32(nrm[2] + 0.25), m.shape).copy()
        self._write(x0, y0, x1, y1, m, z, cnx + 0 * dx, cny + 0 * dx, cnz, mat, gid, wy)


# --------------------------------------------------------------------------------------
# 6. roots — buttress spurs radiating on the ground plane
# --------------------------------------------------------------------------------------

N_ROOT = 11
ROOT_FWD_CAP = 3.0          # world Z toward the viewer; keeps the fan on-canvas


def root_spec(seed: int, nodes):
    rng = Rng(seed ^ 0x5150)
    base_r = 1.0
    out = []
    for i in range(N_ROOT):
        th = (i + 0.5) / N_ROOT * 2 * math.pi + rng.uni(-0.22, 0.22)
        # bias the fan sideways/rearward: forward roots would fall off the canvas
        dz = math.sin(th)
        # the ground-plane ellipse IS the squash — do NOT renormalise, or a root aimed
        # at the viewer becomes unit-length again and walks off the bottom of the canvas
        dz = dz * 0.13 if dz > 0 else dz * 0.55
        d = np.array([math.cos(th), 0.0, dz])
        out.append({
            "dir": d,
            "reach": rng.uni(23.0, 34.0),
            "rise": rng.uni(16.0, 31.0),      # how far the buttress climbs the bole
            "wob": rng.uni(-0.5, 0.5),
            "thick": rng.uni(0.58, 1.02),
            "seed": rng.u64(),
        })
    return out


def emit_roots(buf, roots, N, girth_base, t_root):
    """Each spur is a chain: it starts up the bole (the buttress) and descends outward
    to the soil.  `t_root` in [0,1] scales reach and thickness."""
    for k, rs in enumerate(roots):
        reach = rs["reach"] * t_root
        rise = rs["rise"] * min(1.0, t_root * 1.35)
        if reach < 0.6:
            continue
        d = rs["dir"]
        segs = 7
        prev = None
        for j in range(segs + 1):
            u = j / segs
            # from (0, rise, 0) out to (d*reach, ~0, ...)
            lat = reach * (u ** 0.72)
            hgt = rise * (1.0 - u) ** 1.55
            w = rs["wob"] * math.sin(u * 2.4) * 2.0
            p = np.array([d[0] * lat - d[2] * w * 0.4,
                          hgt,
                          d[2] * lat + d[0] * w * 0.4])
            rr = girth_base * rs["thick"] * (0.46 * (1.0 - u) ** 0.85 + 0.050)
            rr = max(rr, 0.30)
            sp = to_screen(p)
            if prev is not None:
                # a buttress is a PLATE, not a tube: two laterally offset capsules give
                # it width in the ground plane without width in height
                for off in (-0.30, 0.30):
                    o = np.array([-d[2] * off * rr, 0.0, d[0] * off * rr])
                    a0 = to_screen(prev[3] + o)
                    b0 = to_screen(p + o)
                    buf.capsule(a0, b0, prev[1] * 0.86, rr * 0.86, MAT_WOOD, 1,
                                prev[2], p[1])
                buf.capsule(prev[0], sp, prev[1], rr, MAT_WOOD, 1, prev[2], p[1])
            prev = (sp, rr, p[1], p)


# --------------------------------------------------------------------------------------
# 7. emit one frame's geometry
# --------------------------------------------------------------------------------------

PHYLLO = math.radians(137.508)   # the golden angle — real alternate phyllotaxy


def emit(nodes, clusters, roots, N, td=None, silhouette_only=False) -> Buf:
    buf = Buf()
    alive, frac, age, r, lf, lobes = frame_state(nodes, clusters, N)

    girth_base = max(r[0], 0.5)
    leaf_scale = float(np.clip(1.95 - 0.95 * (girth_base / 5.5), 1.0, 1.95))
    # root growth follows trunk girth, which is itself monotone
    t_root = min(1.0, max(0.0, (girth_base - 0.35) / 4.6)) ** 0.85
    if t_root > 0:
        emit_roots(buf, roots, N, girth_base, t_root)

    # branches
    for i, nd in enumerate(nodes):
        if not alive[i] or nd.parent < 0:
            continue
        p = nodes[nd.parent]
        a = p.p
        b = nd.p if frac[i] >= 1.0 else a + (nd.p - a) * frac[i]
        ra = max(r[nd.parent], 0.3)
        rb = max(r[i] * (0.55 + 0.45 * frac[i]), 0.3)
        # the bole narrows into the soil — the buttress roots, not the trunk, carry the
        # flare, which is what stops the base reading as a parsnip
        if a[1] < 13.0:
            ra *= 0.55 + 0.45 * (a[1] / 13.0)
        if b[1] < 13.0:
            rb *= 0.55 + 0.45 * (b[1] / 13.0)
        buf.capsule(to_screen(a), to_screen(b), ra, rb, MAT_WOOD, nd.gid, a[1], b[1])

    # every lobe is welded to a live twig by a peduncle, so "one connected body" is a
    # property of the geometry, not something a post-hoc stray-prune has to rescue
    for ci, c, rad in sorted(lobes, key=lambda L: cam(L[1])[2]):
        best, bd = None, 1e18
        for i in clusters[ci][0]:
            if not alive[i]:
                continue
            dd = float(np.linalg.norm(nodes[i].p - c))
            if dd < bd:
                bd, best = dd, i
        if best is not None and bd > rad * 0.55:
            q = nodes[best].p
            buf.capsule(to_screen(q), to_screen(c), max(r[best], 0.45), 0.55,
                        MAT_WOOD, nodes[best].gid, q[1], c[1])
        sp = to_screen(c)
        buf.sphere(sp, rad, MAT_FOLI, 1000 + ci, c[1])

    # leaf blades
    for i, nd in enumerate(nodes):
        if not alive[i] or lf[i] < 0.12 or nd.parent < 0 or (nd.depth % LEAF_EVERY):
            continue
        L = LEAF_LEN * leaf_scale * (0.30 + 0.70 * lf[i]) * min(1.0, 0.35 + 0.65 * lf[i])
        rr = Rng((SEED ^ 0xBEEF) + i * 2654435761)
        a = nodes[nd.parent].p
        axis = nd.p - a
        na = np.linalg.norm(axis)
        if na < 1e-6:
            continue
        axis = axis / na
        # two blades per node, opposite-ish, rotated by the golden angle up the shoot
        for s in (0, 1):
            ang = PHYLLO * nd.depth + s * math.pi + rr.uni(-0.35, 0.35)
            # a frame around the shoot axis
            up = np.array([0.0, 1.0, 0.0])
            side = np.cross(axis, up)
            if np.linalg.norm(side) < 1e-4:
                side = np.array([1.0, 0.0, 0.0])
            side /= np.linalg.norm(side)
            other = np.cross(side, axis)
            out = math.cos(ang) * side + math.sin(ang) * other
            ldir = out * 1.00 + axis * 0.10 + np.array([0.0, 0.16, 0.0])
            ldir /= np.linalg.norm(ldir)
            stalk = nd.p + ldir * 0.85
            c3 = nd.p + ldir * (L * 0.5 + 0.60)
            buf.capsule(to_screen(nd.p), to_screen(stalk), max(r[i], 0.62), 0.62,
                        MAT_WOOD, nd.gid, nd.p[1], stalk[1])
            sp = to_screen(c3)
            cd = cam_v(ldir)
            u2 = np.array([cd[0], cd[1]])
            nu = np.linalg.norm(u2)
            if nu < 1e-5:
                continue
            u2 /= nu
            nrm = cam_v(np.cross(np.cross(ldir, up), ldir) if abs(ldir[1]) < 0.99 else np.array([0, 0, 1.0]))
            nl = math.sqrt(sum(x * x for x in nrm)) + 1e-9
            nrm = (nrm[0] / nl, nrm[1] / nl, nrm[2] / nl)
            buf.blade(sp, u2, max(0.9, L * 0.5 * (0.62 + 0.38 * nu)), max(1.55, L * 0.30),
                      nrm, MAT_LEAF, 2000 + i * 2 + s, nd.p[1])
    return buf


# --------------------------------------------------------------------------------------
# 8. shading -> pixels
# --------------------------------------------------------------------------------------

def prune_strays(img: np.ndarray) -> int:
    """Keep the largest 8-connected body that touches the contact row; delete the rest."""
    op = img[..., 3] > 8
    if not op.any():
        return 0
    lab = np.zeros((H, W), np.int32)
    cur = 0
    info = []                      # (id, size, touches_contact_row)
    ys, _ = np.nonzero(op)
    seed_y = int(ys.max())
    for sy in range(H):
        for sx in range(W):
            if not op[sy, sx] or lab[sy, sx]:
                continue
            cur += 1
            n = 0
            touch = False
            st = [(sy, sx)]
            lab[sy, sx] = cur
            while st:
                y, x = st.pop()
                n += 1
                if y == seed_y:
                    touch = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and op[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = cur
                            st.append((yy, xx))
            info.append((cur, n, touch))
    if len(info) == 1:
        return 0
    keep = max(info, key=lambda t: (t[2], t[1]))[0]
    bad = op & (lab != keep)
    n = int(bad.sum())
    if n:
        img[..., 3][bad] = 0
        img[..., :3][bad] = 0
    return n


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0


def coherent_noise(seed: int, w: int, h: int, cells: int) -> np.ndarray:
    """Seeded value noise, bilinear-upsampled.  Deterministic, library-RNG free."""
    rng = Rng(seed)
    g = np.array([[rng.f() for _ in range(cells + 1)] for _ in range(cells + 1)], np.float32)
    ys = np.linspace(0, cells, h, endpoint=False, dtype=np.float32)
    xs = np.linspace(0, cells, w, endpoint=False, dtype=np.float32)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    g00 = g[np.ix_(y0, x0)]
    g01 = g[np.ix_(y0, x0 + 1)]
    g10 = g[np.ix_(y0 + 1, x0)]
    g11 = g[np.ix_(y0 + 1, x0 + 1)]
    return (g00 * (1 - fx) * (1 - fy) + g01 * fx * (1 - fy)
            + g10 * (1 - fx) * fy + g11 * fx * fy)


_NOISE_A = None
_NOISE_B = None


def noises():
    global _NOISE_A, _NOISE_B
    if _NOISE_A is None:
        _NOISE_A = coherent_noise(SEED ^ 0x1234, W, H, 26)   # band-edge jitter
        _NOISE_B = coherent_noise(SEED ^ 0x9876, W, H, 9)    # broad tonal variation
    return _NOISE_A, _NOISE_B


def ssao(z: np.ndarray, op: np.ndarray) -> np.ndarray:
    """Screen-space ambient occlusion: how many nearby surfaces sit IN FRONT of me."""
    occ = np.zeros((H, W), np.float32)
    n = 0
    for rad, wgt in ((2, 1.0), (4, 0.85), (7, 0.55)):
        for dy, dx in ((0, rad), (0, -rad), (rad, 0), (-rad, 0),
                       (rad, rad), (rad, -rad), (-rad, rad), (-rad, -rad)):
            s = np.roll(np.roll(z, dy, 0), dx, 1)
            so = np.roll(np.roll(op, dy, 0), dx, 1)
            d = (s - z) / (1.6 + 0.55 * rad)
            occ += wgt * np.clip(d, 0.0, 1.0) * so
            n += wgt
    return np.clip(occ / max(n, 1), 0.0, 1.0)


def shade(buf: Buf) -> np.ndarray:
    buf.mat[SOIL_ROW + 1:, :] = MAT_NONE      # the soil line
    op = buf.mat > 0
    if not op.any():
        return np.zeros((H, W, 4), np.uint8)
    na, nb = noises()

    nrm = buf.n.copy()
    flat = np.array([-0.10, -0.34, 0.935], np.float32)
    fol_m = buf.mat == MAT_FOLI
    blend = 0.56 * nrm + 0.44 * flat
    bl = np.sqrt((blend * blend).sum(axis=2, keepdims=True)) + 1e-9
    blend = blend / bl
    nrm = np.where(fol_m[..., None], blend, nrm)
    lam = (nrm[..., 0] * LIGHT[0] + nrm[..., 1] * LIGHT[1] + nrm[..., 2] * LIGHT[2])
    ao = ssao(buf.z, op.astype(np.float32))

    # foliage: wrapped diffuse so the shadow side keeps its hue; wood: harder falloff
    sh = np.where(buf.mat == MAT_WOOD,
                  np.clip(lam, 0, 1) * 0.66 + 0.44,
                  np.clip(lam * 0.94 + 0.24, 0, 1))
    sh = np.where(buf.mat == MAT_LEAF, np.clip(lam * 0.92 + 0.02, 0, 1), sh)
    sh = sh * (1.0 - np.where(buf.mat == MAT_WOOD, 0.50, 0.62) * ao)

    # broad tonal drift so the crown is not one flat tone
    sh = sh * (0.95 + 0.10 * nb)

    # ground-contact darkening on the wood: soil occludes the root collar
    gz = np.clip(buf.wy / 15.0, 0.0, 1.0)
    gz = gz * gz * (3 - 2 * gz)
    sh = np.where(buf.mat == MAT_WOOD, sh * (0.52 + 0.48 * gz), sh)

    # bark: vertical flutes wrapping the cylinder (u = signed screen offset / radius)
    ang = np.arcsin(np.clip(buf.n[..., 0], -1.0, 1.0))
    bark = 0.5 + 0.5 * np.sin(ang * 6.2 + buf.wy * 0.13 + 7.0 * na)
    bark = bark * bark * (3 - 2 * bark)
    sh = np.where(buf.mat == MAT_WOOD, sh * (0.82 + 0.31 * bark), sh)

    sh = np.clip(sh, 0.0, 1.0)

    # --- band + dither ---------------------------------------------------------------
    bay = np.tile(BAYER4, (H // 4 + 1, W // 4 + 1))[:H, :W]
    jit = (na - 0.5) * 0.78 + (bay - 0.5) * 0.34

    out = np.zeros((H, W, 4), np.uint8)

    for mat, bands, outline, nb_ in ((MAT_WOOD, WOOD_BANDS, WOOD_OUTLINE, len(WOOD_BANDS)),
                                     (MAT_FOLI, FOLI_BANDS, FOLI_OUTLINE, len(FOLI_BANDS)),
                                     (MAT_LEAF, FOLI_BANDS, FOLI_OUTLINE, len(FOLI_BANDS))):
        m = buf.mat == mat
        if not m.any():
            continue
        lvl = np.floor(sh * nb_ + jit).astype(int)
        lvl = np.clip(lvl, 0, nb_ - 1)
        pal = np.array(bands, np.uint8)
        rgb = pal[lvl]
        out[..., :3][m] = rgb[m]
        out[..., 3][m] = 255

    # a rare specular crown top, exactly as exp-16 uses it
    top = (buf.mat == MAT_FOLI) & (sh > 0.94) & (buf.n[..., 1] < -0.42)
    out[..., :3][top] = FOLI_SPEC

    # --- outlines --------------------------------------------------------------------
    pad = np.pad(op, 1)
    silh = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])

    # internal contour: a nearer surface of a DIFFERENT group over a depth step
    contour = np.zeros((H, W), bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        zn = np.roll(np.roll(buf.z, dy, 0), dx, 1)
        gn = np.roll(np.roll(buf.gid, dy, 0), dx, 1)
        on = np.roll(np.roll(op, dy, 0), dx, 1)
        contour |= op & on & (gn != buf.gid) & (buf.z - zn > 2.0) & (buf.n[..., 2] < 0.72)

    ol = silh | contour
    wood_ol = ol & (buf.mat == MAT_WOOD)
    foli_ol = ol & (buf.mat != MAT_WOOD) & op
    out[..., :3][wood_ol] = WOOD_OUTLINE
    out[..., :3][foli_ol] = FOLI_OUTLINE

    # ONE BODY: keep only the 8-connected component that owns the contact row.  The
    # geometry is already welded (every lobe has a peduncle, every blade a petiole);
    # this is the belt-and-braces pass, and it reports what it removed.
    pruned = prune_strays(out)
    return out, pruned


# --------------------------------------------------------------------------------------
# 9. the growth parameter t, and the arc-length retiming
# --------------------------------------------------------------------------------------

N_FRAMES = 19
FINE = 180
N_FLOOR = 6.2


def n_of_u(nodes, u: float) -> float:
    """u in [0,1] -> continuous reveal iteration N.  A slow start (a seedling holds for
    a beat), then a near-linear climb, then a settle as the crown closes."""
    nmax = max(n.birth for n in nodes)
    e = 0.10 + 0.90 * (u ** 1.28)
    return N_FLOOR + e * (nmax + AGE_TAIL - N_FLOOR)


def silhouette(nodes, clusters, roots, N, td) -> np.ndarray:
    m = emit(nodes, clusters, roots, N, td).mat
    m[SOIL_ROW + 1:, :] = MAT_NONE
    return m > 0


def retime(nodes, clusters, roots, td):
    """Place the 19 frames at equal SILHOUETTE-CHANGE arc length, not equal t."""
    us = [i / (FINE - 1) for i in range(FINE)]
    masks = []
    for u in us:
        masks.append(silhouette(nodes, clusters, roots, n_of_u(nodes, u), td))
    amax = max(float(m.sum()) for m in masks)
    cum = [0.0]
    for i in range(1, FINE):
        a, b = masks[i - 1], masks[i]
        inter = float((a & b).sum())
        union = float((a | b).sum())
        iou = inter / union if union > 0 else 1.0
        # (1 - IoU) is the perceptual "how much of the silhouette changed" metric, but it
        # is scale-free, so a 20 px seedling would otherwise eat most of the budget.
        aa = max(float(a.sum()), 1.0)
        bb = max(float(b.sum()), 1.0)
        cum.append(cum[-1] + (1.0 - iou) * (union / amax) ** 0.12
                   + 1.20 * abs(math.log(bb / aa)))
    total = cum[-1]
    picks = []
    for k in range(N_FRAMES):
        target = total * k / (N_FRAMES - 1)
        j = int(np.searchsorted(np.array(cum), target))
        j = min(max(j, 0), FINE - 1)
        picks.append(us[j])
    picks[0], picks[-1] = 0.0, 1.0
    return picks, total


# --------------------------------------------------------------------------------------
# 10. main
# --------------------------------------------------------------------------------------


def main() -> None:
    global SEED
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frames")
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--meta", default=None)
    args = ap.parse_args()

    SEED = args.seed

    nodes = build_skeleton(SEED)
    clusters, inner = cluster_tips(nodes)
    global INNER_MASK
    INNER_MASK = np.zeros(len(nodes), dtype=bool)
    for i in inner:
        INNER_MASK[i] = True
    td = tip_distance(nodes)
    roots = root_spec(SEED, nodes)
    sys.stderr.write(f"skeleton: {len(nodes)} nodes, {max(n.birth for n in nodes)} iterations, "
                     f"{len(clusters)} canopy lobes\n")

    picks, total = retime(nodes, clusters, roots, td)
    sys.stderr.write(f"retime: total silhouette change {total:.2f}; "
                     f"u = {[round(p, 4) for p in picks]}\n")

    os.makedirs(args.out, exist_ok=True)
    total_pruned = 0
    meta = {"canvas": [W, H], "anchor": list(ANCHOR), "seed": SEED,
            "camera_elevation_deg": 20.0,
            "nodes": len(nodes), "lobes": len(clusters),
            "t_map": "frame i uses u=t_i from the arc-length retiming; N(u) = 0.9 + "
                     "(0.10+0.90*u^1.28)*(Nmax+3-0.9); every other quantity derives from N",
            "frames": []}
    for i, u in enumerate(picks):
        N = n_of_u(nodes, u)
        buf = emit(nodes, clusters, roots, N, td)
        img, pruned = shade(buf)
        total_pruned += pruned
        Image.fromarray(img, "RGBA").save(os.path.join(args.out, f"frame-{i:02d}.png"))
        meta["frames"].append({"i": i, "t": round(u, 6), "N": round(N, 4)})
    meta["stray_px_pruned_total"] = total_pruned
    if args.meta:
        with open(args.meta, "w") as f:
            json.dump(meta, f, indent=1)
    else:
        with open(os.path.join(args.out, "registration.json"), "w") as f:
            json.dump(meta, f, indent=1)
    sys.stderr.write(f"wrote {N_FRAMES} frames to {args.out}\n")


if __name__ == "__main__":
    main()
