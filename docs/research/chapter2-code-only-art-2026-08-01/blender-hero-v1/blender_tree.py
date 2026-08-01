#!/usr/bin/env python3
"""ADR-0280 D2a — the code-generated hero tree, rendered by headless Blender.

Run:  blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 64

Everything structural is computed HERE (ADR-0280 D1: code owns skeleton, camera and
growth). Blender occupies the FINISH slot only. No .blend is a source of truth; this
file is. Output is NOT deliverable until it passes pixelise.py — a raw Blender frame
shipped as-is is the ADR-0145 failure reproduced (ADR-0280 D2a).

This is v2. v1 (../blender-spike/) answered "what can Blender do"; it lost to exp-16 on
four named gaps, and each is addressed here:

  1. THE OPENING — v1 opened on a bare stump because girth was static: the mature
     trunk radius was drawn from frame 0. Girth is now SECONDARY GROWTH, a function of
     each node's age, so a young stem is a young stem. Frame 0 is a two-leaf cotyledon
     seedling on a hypocotyl, as exp-16 opens.
  2. THE BASE — buttress root spurs that climb the bole and descend to the soil, a
     base flare on the lower trunk, and a real cast contact shadow (the second render
     pass; v1's sibling `code-sdf-volume` had the only working ground contact in the
     round-4 pool and this mines it with a production renderer).
  3. LEAF CHARACTER — individual leaf BLADES on young shoots, shed as a shoot
     lignifies, with canopy lobes taking the mass over. v1 was lobes throughout.
  4. CROWN SILHOUETTE — space colonisation into a ROUNDED attractor envelope, instead
     of v1's fixed-angle recursion, which read flat-topped and acacia-like.

Invariants held (ADR-0280 D1):
  · Topology is a strict PREFIX. The skeleton is grown once; every node records its
    birth iteration; a frame at reveal N draws nodes with birth <= N and eases the
    frontier out of zero length. Nothing is frozen to buy per-frame connectedness.
  · Randomness is IDENTITY-KEYED (h01 on a part's address), never a draw counter, so
    adding a branch cannot reshuffle the tree into a different tree.
  · The camera is framed ONCE to the mature extent and is byte-identical every frame.
  · CPU Cycles, fixed seed, fixed samples, pinned Blender 5.2.0 LTS.
"""
import json
import math
import os
import sys

import numpy as np

try:                                  # the skeleton and the retiming are pure numpy, so
    import bpy                        # `python blender_tree.py --no-render` iterates on
    import mathutils                  # structure in a second instead of a Blender launch
except ModuleNotFoundError:
    bpy = mathutils = None

# ---------------------------------------------------------------- args
argv = (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else
        (sys.argv[1:] if not sys.argv[0].lower().endswith("blender.exe") else []))


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


# absolute: Blender resolves a bare relative render path against the (absent) .blend
# file, not the cwd, and silently writes nothing
OUT = os.path.abspath(arg("--out", "raw"))
NFRAMES = int(arg("--frames", "19"))
RES = int(arg("--res", "384"))
SAMPLES = int(arg("--samples", "64"))
SHADOW_SAMPLES = int(arg("--shadow-samples", "24"))
SEED = int(arg("--seed", "20260801"))
ELEV_DEG = 20.0                      # ADR-0280 D1's calibrated projection
CANVAS = 128                         # the delivered pixel canvas
ANCHOR_ROW = 118.0                   # where the trunk's ground contact lands, in canvas px
SKIP_RENDER = "--no-render" in argv  # skeleton/retime only, for fast iteration
VERBOSE = "--verbose" in argv

os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette anchors
# sampled from exp-16's committed 32-colour track palette; the raster back half snaps
# every pixel back onto that palette, so these only need to land in the right family.
BARK_SRGB = (126 / 255, 85 / 255, 53 / 255)
FOLIAGE_SRGB = (121 / 255, 141 / 255, 83 / 255)
BLADE_SRGB = (152 / 255, 174 / 255, 101 / 255)  # young blades read a shade brighter


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


# ---------------------------------------------------------------- deterministic noise
def h01(*key):
    """Identity-keyed hash in [0,1) — keyed on WHAT a part is, never on when it was
    drawn. This is what makes the skeleton stable under extension (ADR-0280 D1).

    The mix has to actually avalanche. A weaker multiply-xor (v1's) leaves keys that
    differ only in their last element related by a fixed mask, so `h01(i,1), h01(i,2),
    h01(i,3)` read as a lattice rather than as three independent numbers — which
    collapsed the attractor cloud into clumps and starved the crown.
    """
    x = SEED & 0xFFFFFFFF
    for k in key:
        x = (x ^ (int(k) & 0xFFFFFFFF)) & 0xFFFFFFFF
        x = (x * 0x9E3779B1) & 0xFFFFFFFF
        x ^= x >> 15
        x = (x * 0x85EBCA6B) & 0xFFFFFFFF
        x ^= x >> 13
    x = (x * 0xC2B2AE35) & 0xFFFFFFFF
    x ^= x >> 16
    return x / 4294967296.0


def hsym(*key):
    return h01(*key) * 2.0 - 1.0


# ---------------------------------------------------------------- skeleton constants
D_STEP = 0.100                 # internode length
D_INFL = 0.75                  # attractor influence radius
D_KILL = 0.200                 # attractor kill radius
MAX_KIDS = 3
N_ATTR = 520
MAX_ITER = 240
TROPISM = np.array([0.0, 0.0, 0.26])

# The crown envelope. ROUNDED by construction — this is gap 4's fix. Proportioned so the
# mature silhouette lands near exp-16's (79 x 111 px of a 128 canvas), because a crown
# that fills the canvas edge to edge reads as a bush rather than as a tree.
CROWN_C = np.array([0.0, 0.0, 1.80])
CROWN_R = np.array([0.84, 0.72, 0.94])
BOLE_CLEAR_Z = 0.76            # no attractors below this: keeps a readable bole
BOLE_CLEAR_R = 0.34            # nor this close to the axis low down
BOLE_MIN_Z = 0.40              # the leader climbs at least this high before it forks
N_LOW = 13                     # a low attractor ring: a few side shoots on the
LOW_R = (0.24, 0.44)           # sapling that survive as the mature tree's low limbs.
LOW_Z = (0.60, 0.98)           # Keep it SPARSE and HIGH: a dense low ring grows a
                               # permanent skirt around the bole and the tree reads
                               # as a hedge rather than as a tree.

# secondary growth (gap 1's fix): girth is a function of AGE, not of position
PIPE_E = 2.15
R_TIP_MIN = 0.0125             # a first-season shoot
R_TIP_MAX = 0.0265             # a lignified twig
TAU_AGE = 26.0                 # iterations to e-fold toward R_TIP_MAX
AGE_TAIL = 8.0                # pure secondary growth after extension stops

# foliage
LEAF_EVERY = 2                 # a blade whorl on every internode: a sapling is LEAFY,
LEAF_LEN = 0.225               # and a bare armature that greens only at the end is the
LEAF_PER = 3                   # "stump" complaint in another costume
AGE_LEAF = 1.5                 # blades reach full size over this many iterations
AGE_SHED_LO = 18.0             # a shoot starts dropping blades here
AGE_SHED_HI = 24.0             # and is bare by here
AGE_LOBE = 4.0
LOBE_CELL = 0.20               # tip-cluster cell size
LOBE_SHELL = 0.28              # lobes only on the crown's outer shell
LOBE_MIN, LOBE_CAP, LOBE_BASE = 0.110, 0.190, 0.098

# base (gap 2's fix)
N_ROOT = 7
FLARE_H = 0.12                 # height over which the bole flares into the roots
FLARE_AMT = 0.85               # peak extra radius at the soil, as a fraction

# the cotyledon pair (gap 1's fix)
COT_LEN = 0.150
COT_FULL_N = 3.0               # fully open this many iterations after the floor
COT_FADE_LO = 8.0              # senescence begins
COT_FADE_HI = 13.5             # absorbed


# ---------------------------------------------------------------- skeleton
class Node:
    __slots__ = ("p", "parent", "birth", "kids")

    def __init__(self, p, parent, birth):
        self.p = p
        self.parent = parent
        self.birth = birth
        self.kids = []


def split_dirs(dirs, cos_cone=0.62):
    """Split a node's influencing directions into one or two groups.

    Without this, a node grows at most one child per iteration in the AVERAGE
    direction, so a leader entering a symmetric crown climbs straight up, eats the
    attractors around the axis and dies — which is exactly what the first attempt did
    (17 nodes). A node whose attractors do not fit in a cone bifurcates instead.
    """
    if len(dirs) < 3:
        return [dirs]
    m = dirs.mean(axis=0)
    nm = np.linalg.norm(m)
    if nm < 1e-9:
        return [dirs]
    if float((dirs @ (m / nm)).min()) > cos_cone:
        return [dirs]                      # a tight cone: one child
    c = dirs - dirs.mean(axis=0)
    vt = np.linalg.svd(c, full_matrices=False)[2]
    s = c @ vt[0]
    a, b = dirs[s >= 0], dirs[s < 0]
    return [dirs] if len(a) == 0 or len(b) == 0 else [a, b]


def build_skeleton():
    """Space colonisation into the rounded crown envelope. Grown ONCE; every node keeps
    the iteration it was born at, which is what makes every frame a strict prefix."""
    # --- attractor cloud, identity-keyed rejection sampling inside a lobed ellipsoid
    attr = []
    i = 0
    while len(attr) < N_ATTR and i < N_ATTR * 80:
        u = np.array([hsym(i, 1), hsym(i, 2), hsym(i, 3)])
        i += 1
        if u @ u > 1.0:
            continue
        th = math.atan2(u[1], u[0])
        # lobe the envelope so the crown is not a billiard ball
        lob = 1.0 + 0.11 * math.cos(3.0 * th + 0.7) + 0.07 * math.cos(5.0 * th - 1.9)
        p = CROWN_C + u * CROWN_R * np.array([lob, lob, 1.0])
        if p[2] < BOLE_CLEAR_Z:
            continue
        if p[2] < CROWN_C[2] - 0.35 * CROWN_R[2] and math.hypot(p[0], p[1]) < BOLE_CLEAR_R:
            continue
        attr.append(p)
    crown = np.array(attr)

    # A second, low ring of attractors off the bole. Without it the sapling is a bare
    # whip for a third of its life and every branch is born in the crown — exp-16's
    # charm at stages 2-3 is precisely that it already has side shoots down low, and
    # they survive into the mature tree as the low limbs it forks from.
    for i in range(N_LOW):
        th = h01(i, 201) * math.tau
        rr = LOW_R[0] + (LOW_R[1] - LOW_R[0]) * h01(i, 203)
        zz = LOW_Z[0] + (LOW_Z[1] - LOW_Z[0]) * h01(i, 205)
        attr.append(np.array([math.cos(th) * rr, math.sin(th) * rr * 0.85, zz]))
    attr = np.array(attr)
    alive = np.ones(len(attr), dtype=bool)

    # --- the bole: a leader climbing until the CROWN is in reach. The low ring is
    # deliberately excluded from this test, or the leader would stop at the first
    # lateral and never make a trunk.
    nodes = [Node(np.array([0.0, 0.0, 0.0]), -1, 0)]
    dirn = np.array([0.0, 0.0, 1.0])
    it = 0
    while it < 60:
        it += 1
        tip = nodes[-1].p
        if tip[2] >= BOLE_MIN_Z and np.linalg.norm(crown - tip, axis=1).min() < D_INFL:
            break
        dirn = dirn + np.array([hsym(it, 41) * 0.075, hsym(it, 43) * 0.055, 0.0])
        dirn = dirn / np.linalg.norm(dirn)
        nodes[-1].kids.append(len(nodes))
        nodes.append(Node(tip + dirn * D_STEP, len(nodes) - 1, it))
    bole_len = len(nodes)

    # --- space colonisation
    pts = np.array([n.p for n in nodes])
    for it in range(it + 1, MAX_ITER):
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        A = attr[idx]
        # Recruit to the nearest node THAT STILL HAS ROOM. Assigning to the nearest node
        # outright and then skipping it when saturated silently drops the attractor, and
        # growth stalls as soon as the tips fill up (the second attempt died at 32 nodes).
        gidx = np.array([i for i, n in enumerate(nodes) if len(n.kids) < MAX_KIDS])
        if len(gidx) == 0:
            break
        dm = np.linalg.norm(A[:, None, :] - pts[gidx][None, :, :], axis=2)
        nearest = dm.argmin(axis=1)
        sel = dm[np.arange(len(A)), nearest] < D_INFL
        if not sel.any():
            break
        recruit = {}
        for a_i, l_i in zip(np.nonzero(sel)[0], nearest[sel]):
            n_i = int(gidx[l_i])
            v = A[a_i] - pts[n_i]
            nv = np.linalg.norm(v)
            if nv < 1e-9:
                continue
            recruit.setdefault(n_i, []).append(v / nv)

        newp = []
        for n_i in sorted(recruit.keys()):
            room = MAX_KIDS - len(nodes[n_i].kids)
            for gi, grp in enumerate(split_dirs(np.array(recruit[n_i]))[:room]):
                v = grp.mean(axis=0) + TROPISM
                par = nodes[n_i].parent
                if par >= 0:                   # never fold back onto the parent
                    pv = nodes[n_i].p - nodes[par].p
                    v = v + 0.42 * pv / (np.linalg.norm(pv) + 1e-9)
                # identity-keyed jitter: the node's own address, not a draw counter
                v = v + np.array([hsym(n_i, 51 + 7 * gi), hsym(n_i, 53 + 7 * gi),
                                  hsym(n_i, 57 + 7 * gi) * 0.6]) * 0.17
                nv = np.linalg.norm(v)
                if nv < 1e-9:
                    continue
                q = nodes[n_i].p + (v / nv) * D_STEP
                nodes[n_i].kids.append(len(nodes))
                nodes.append(Node(q, n_i, it))
                newp.append(q)
        if VERBOSE:
            print(f"  it={it} alive={int(alive.sum())} growable={len(gidx)} "
                  f"recruited={len(recruit)} new={len(newp)} nodes={len(nodes)} "
                  f"dmin={float(dm.min()):.3f}", flush=True)
        if not newp:
            break
        pts = np.array([n.p for n in nodes])
        dk = np.linalg.norm(attr[:, None, :] - np.array(newp)[None, :, :], axis=2).min(axis=1)
        alive &= dk > D_KILL
    print(f"SKEL attractors={len(attr)} consumed={int((~alive).sum())} "
          f"bole={bole_len} nodes={len(nodes)}", flush=True)
    return nodes


NODES = build_skeleton()
NMAX_BIRTH = max(n.birth for n in NODES)
N_FLOOR = 2.0


def cluster_tips(nodes):
    """Fixed spatial clustering of the MATURE skeleton's tips, computed once — so a
    canopy lobe can never appear, merge or split between frames, only grow. Each
    cluster carries the radius covering its own tips: that is what guarantees the crown
    CLOSES as the blades are shed, rather than thinning out."""
    tips = [i for i, n in enumerate(nodes) if not n.kids]
    cells = {}
    for i in tips:
        p = nodes[i].p
        cells.setdefault(tuple((p / LOBE_CELL).astype(int)), []).append(i)
    inner, out = set(), []
    for k in sorted(cells.keys()):
        mem = cells[k]
        P = np.array([nodes[i].p for i in mem])
        c = P.mean(axis=0)
        q = np.linalg.norm((c - CROWN_C) / CROWN_R)
        if q < LOBE_SHELL:
            inner.update(mem)          # shade twigs inside the crown carry blades instead
            continue
        # Nothing hangs under the middle of the crown. That void is what lets you watch
        # the limbs run up into the foliage — without it the canopy reads as a lollipop
        # sitting on a pole, which is what the first probe did.
        if (c[2] < CROWN_C[2] + 0.10 * CROWN_R[2]
                and math.hypot(c[0], c[1]) < 0.42 * CROWN_R[0]):
            inner.update(mem)
            continue
        ext = float(np.linalg.norm(P - c, axis=1).max()) if len(mem) > 1 else 0.0
        out.append((mem, min(LOBE_CAP, max(LOBE_MIN, 0.80 * ext + LOBE_BASE))))
    return out, inner


CLUSTERS, INNER = cluster_tips(NODES)
INNER_MASK = np.zeros(len(NODES), dtype=bool)
for _i in INNER:
    INNER_MASK[_i] = True


def root_spec():
    """Buttress spurs. Each climbs the bole (rise) and descends outward to the soil,
    tapering — the shape that reads as PLANTED rather than as a pole on the ground."""
    out = []
    for i in range(N_ROOT):
        th = (i + 0.5) / N_ROOT * math.tau + hsym(i, 61) * 0.24
        dy = math.sin(th)
        # A root aimed at the viewer projects DOWNWARD off the canvas, so the forward
        # fan is compressed. Do not renormalise: the compression is the point.
        dy = dy * 0.30 if dy < 0 else dy * 0.72
        d = np.array([math.cos(th), dy, 0.0])
        out.append({
            "dir": d / max(np.linalg.norm(d), 1e-9) * (0.55 + 0.45 * abs(math.cos(th))),
            "reach": 0.27 + 0.17 * h01(i, 63),
            "rise": 0.17 + 0.13 * h01(i, 67),
            "thick": 0.62 + 0.42 * h01(i, 71),
            "wob": hsym(i, 73) * 0.05,
        })
    return out


ROOTS = root_spec()


# ---------------------------------------------------------------- per-frame state
def frame_state(N):
    """N = continuous reveal iteration. Everything a frame needs derives from it."""
    n_all = len(NODES)
    alive = np.zeros(n_all, dtype=bool)
    frac = np.ones(n_all)
    age = np.zeros(n_all)
    for i, nd in enumerate(NODES):
        if nd.birth <= math.floor(N):
            alive[i] = True
            age[i] = N - nd.birth
        elif nd.birth <= N + 1.0:
            f = max(0.0, N - (nd.birth - 1.0))    # frontier eases out of ZERO length
            if f > 0.02:
                alive[i] = True
                frac[i] = f

    # pipe model over the LIVE tree, with an age-dependent tip radius. A young stem is
    # a young stem: this is what stops frame 0 reading as a stump.
    r = np.zeros(n_all)
    for i in range(n_all - 1, -1, -1):
        if not alive[i]:
            continue
        r0 = R_TIP_MIN + (R_TIP_MAX - R_TIP_MIN) * (1.0 - math.exp(-age[i] / TAU_AGE))
        s = sum(r[k] ** PIPE_E for k in NODES[i].kids if alive[k])
        r[i] = max(r0, s ** (1.0 / PIPE_E) if s > 0 else 0.0)

    # blades: a shoot flushes leaves in its first season and drops them as it lignifies.
    # Shade twigs inside the crown never get a lobe, so they hold their blades longer.
    ai = np.clip(age / AGE_LEAF, 0.0, 1.0)
    lo = np.where(INNER_MASK, AGE_SHED_LO * 2.1, AGE_SHED_LO)
    hi = np.where(INNER_MASK, AGE_SHED_HI * 2.1, AGE_SHED_HI)
    ao = np.clip((age - lo) / np.maximum(hi - lo, 1e-6), 0.0, 1.0)
    # the first flush is small: at the seedling stage the COTYLEDONS should carry the
    # frame, not a full-size true leaf on a 2 px stem
    flush = min(1.0, 0.45 + 0.55 * max(0.0, (N - N_FLOOR) / 7.0))
    leaf = ai * (1.0 - ao * ao * (3 - 2 * ao)) * alive * flush

    # lobes: monotone mass, so a lobe only ever grows
    lobes = []
    for ci, (cl, rt) in enumerate(CLUSTERS):
        m, w, c = 0.0, 0.0, np.zeros(3)
        for i in cl:
            if not alive[i]:
                continue
            a = min(1.0, age[i] / AGE_LOBE)
            m += a
            c += NODES[i].p * a
            w += a
        if m <= 0.02 or w <= 0:
            continue
        c = c / w
        rv = c - CROWN_C
        nrv = np.linalg.norm(rv)
        if nrv > 1e-9:
            c = c + rv / nrv * (0.20 * rt)     # foliage sits on the OUTSIDE of the volume
        rad = rt * (m / len(cl)) ** 0.42 * (0.82 + 0.30 * h01(ci, 81)) * 1.48
        if rad > 0.012:
            lobes.append((ci, c, rad))

    # the base: flare and buttress grow with the trunk, so a seedling has neither
    t_root = float(np.clip((r[0] - R_TIP_MIN) / (0.175 - R_TIP_MIN), 0.0, 1.0)) ** 0.75
    # cotyledons: open, hold, then senesce as the first true leaves take over
    cot = min(1.0, max(0.0, (N - N_FLOOR) / COT_FULL_N + 0.35))
    fade = np.clip((N - COT_FADE_LO) / (COT_FADE_HI - COT_FADE_LO), 0.0, 1.0)
    cot *= 1.0 - fade * fade * (3 - 2 * fade)
    return {"alive": alive, "frac": frac, "age": age, "r": r,
            "leaf": leaf, "lobes": lobes, "t_root": t_root, "cot": cot, "N": N}


# ---------------------------------------------------------------- camera framing
# Framed ONCE to the mature extent, then held byte-identical on every frame, so the
# tree grows inside a stable frame and its ground contact never drifts.
EL = math.radians(ELEV_DEG)
_UPV = np.array([0.0, math.sin(EL), math.cos(EL)])     # camera up, in world
_MAT = frame_state(NMAX_BIRTH + AGE_TAIL)
_TOP = max((NODES[i].p[2] + _MAT["r"][i]) for i in range(len(NODES)))
for _c in _MAT["lobes"]:
    _TOP = max(_TOP, float(_c[1][2] + _c[2] * 0.95))
_TOP += LEAF_LEN * 0.7          # blades reach past the node they hang on
_HALFW = max(abs(NODES[i].p[0]) for i in range(len(NODES)))
for _c in _MAT["lobes"]:
    _HALFW = max(_HALFW, float(abs(_c[1][0]) + _c[2]))
_HALFW += LEAF_LEN * 0.7

_V = 1.0 - 2.0 * ANCHOR_ROW / CANVAS          # ground row, in NDC (+1 top, -1 bottom)
PAD = 0.06
SPAN = max(2.0 * _TOP * math.cos(EL) / ((1.0 - _V) - PAD), 2.0 * _HALFW / (1.0 - PAD))
TZ = -_V * SPAN / (2.0 * math.cos(EL))         # camera target height


def to_screen(p):
    """World -> canvas pixels, matching the Blender camera exactly. Used by the
    author-time retiming below so pacing is measured, not guessed."""
    sx = p[0]
    sy = (p[1] - 0.0) * math.sin(EL) + (p[2] - TZ) * math.cos(EL)
    return (CANVAS * (0.5 + sx / SPAN), CANVAS * (0.5 - sy / SPAN))


# ---------------------------------------------------------------- pacing (retiming)
def n_of_u(u):
    return N_FLOOR + (0.055 + 0.945 * u ** 1.22) * (NMAX_BIRTH + AGE_TAIL - N_FLOOR)


def cheap_silhouette(st, size=96):
    """An analytic stand-in for the render, used only to MEASURE growth pacing.
    Discs for every live internode and lobe; never shipped."""
    m = np.zeros((size, size), dtype=bool)
    k = size / CANVAS
    yy, xx = np.mgrid[0:size, 0:size]

    def disc(p, rad):
        cx, cy = to_screen(p)
        cx, cy = cx * k, cy * k
        rr = max(0.6, rad / SPAN * CANVAS * k)
        x0, x1 = max(0, int(cx - rr - 1)), min(size, int(cx + rr + 2))
        y0, y1 = max(0, int(cy - rr - 1)), min(size, int(cy + rr + 2))
        if x1 <= x0 or y1 <= y0:
            return
        sub = ((xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2) <= rr * rr
        m[y0:y1, x0:x1] |= sub

    for i, nd in enumerate(NODES):
        if not st["alive"][i] or nd.parent < 0:
            continue
        a, b = NODES[nd.parent].p, NODES[nd.parent].p + (nd.p - NODES[nd.parent].p) * st["frac"][i]
        for t in (0.0, 0.5, 1.0):
            disc(a + (b - a) * t, st["r"][i])
    for _ci, c, rad in st["lobes"]:
        disc(c, rad)
    return m


def retime(fine=110):
    """Place the frames at equal SILHOUETTE-CHANGE arc length rather than equal time.
    ADR-0280 D1: growth pacing is authored, not an accident of the sampling."""
    us = [i / (fine - 1) for i in range(fine)]
    masks = [cheap_silhouette(frame_state(n_of_u(u))) for u in us]
    amax = max(float(m.sum()) for m in masks) or 1.0
    cum = [0.0]
    for i in range(1, fine):
        a, b = masks[i - 1], masks[i]
        union = float((a | b).sum())
        iou = float((a & b).sum()) / union if union > 0 else 1.0
        aa, bb = max(float(a.sum()), 1.0), max(float(b.sum()), 1.0)
        # (1-IoU) is scale-free, so a 20 px seedling would otherwise eat the budget;
        # the log term pays for pure scale change. Weight it LOW: at 1.20 the whip
        # phase (which only scales) took 10 of 19 frames and the crown got 9.
        cum.append(cum[-1] + (1.0 - iou) * (union / amax) ** 0.60
                   + 0.35 * abs(math.log(bb / aa)))
    picks, last = [], -1
    for k in range(NFRAMES):
        j = int(np.searchsorted(np.array(cum), cum[-1] * k / (NFRAMES - 1)))
        j = min(max(j, last + 1), fine - 1)    # strictly increasing: two frames landing
        last = j                               # on one state is a visible dead beat
        picks.append(us[j])
    picks[0], picks[-1] = 0.0, 1.0
    return picks


# ---------------------------------------------------------------- mesh helpers
def unit_sphere(subdiv=2):
    """An octahedron subdivided into a sphere — generated in code so no bpy.ops call is
    needed per lobe (hundreds of ops calls per frame is the slow path)."""
    v = [(0, 0, 1), (1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0), (0, 0, -1)]
    v = [mathutils.Vector(x) for x in v]
    f = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1),
         (5, 2, 1), (5, 3, 2), (5, 4, 3), (5, 1, 4)]
    for _ in range(subdiv):
        mid, nf = {}, []
        for tri in f:
            m = []
            for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
                key = (min(a, b), max(a, b))
                if key not in mid:
                    v.append((v[a] + v[b]).normalized())
                    mid[key] = len(v) - 1
                m.append(mid[key])
            nf += [(tri[0], m[0], m[2]), (m[0], tri[1], m[1]),
                   (m[2], m[1], tri[2]), (m[0], m[1], m[2])]
        f = nf
    return v, f


SPH_V, SPH_F = unit_sphere(2) if mathutils else (None, None)


class MeshBuf:
    def __init__(self):
        self.v, self.f = [], []

    def add(self, verts, faces):
        b = len(self.v)
        self.v += list(verts)
        self.f += [tuple(b + i for i in fc) for fc in faces]

    def sphere(self, c, rad, squash=1.0):
        self.add([mathutils.Vector((c[0] + p.x * rad, c[1] + p.y * rad,
                                    c[2] + p.z * rad * squash)) for p in SPH_V], SPH_F)

    def blob(self, c, rad, key, squash=0.82):
        """A lobe that is not a billiard ball. Per-lobe anisotropy plus a low-frequency
        vertex displacement, both identity-keyed: a pile of perfect spheres is exactly
        the 'grape cluster' read that sank code-your-own-call's canopy."""
        sx = rad * (0.88 + 0.30 * h01(key, 101))
        sy = rad * (0.88 + 0.30 * h01(key, 103))
        sz = rad * squash * (0.90 + 0.26 * h01(key, 107))
        ph = h01(key, 109) * math.tau
        out = []
        for vi, p in enumerate(SPH_V):
            n = 1.0 + 0.16 * math.sin(p.x * 5.3 + ph) * math.cos(p.z * 4.7 - ph)
            out.append(mathutils.Vector((c[0] + p.x * sx * n, c[1] + p.y * sy * n,
                                         c[2] + p.z * sz * n)))
        self.add(out, SPH_F)

    def object(self, name, mat, smooth=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(x) for x in self.v], [], self.f)
        me.validate()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(mat)
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        bpy.context.collection.objects.link(ob)
        return ob


RINGS = 7


def ring(centre, direction, radius, ref):
    """A ring of RINGS verts perpendicular to `direction`, oriented by a transported
    reference so consecutive internodes join without a twist seam."""
    d = mathutils.Vector(direction)
    if d.length < 1e-9:
        d = mathutils.Vector((0, 0, 1))
    d.normalize()
    u = (ref - d * ref.dot(d))
    if u.length < 1e-6:
        u = d.cross(mathutils.Vector((1, 0, 0)))
        if u.length < 1e-6:
            u = d.cross(mathutils.Vector((0, 1, 0)))
    u.normalize()
    w = d.cross(u)
    c = mathutils.Vector(centre)
    return [c + (u * math.cos(t) + w * math.sin(t)) * radius
            for t in (i / RINGS * math.tau for i in range(RINGS))], u


def tube(buf, pts, radii, ref0=None):
    """A swept tube through `pts` with per-point `radii`, parallel-transported."""
    ref = ref0 or mathutils.Vector((1, 0, 0))
    prev = None
    for i, p in enumerate(pts):
        if i == 0:
            d = mathutils.Vector(pts[1]) - mathutils.Vector(pts[0])
        elif i == len(pts) - 1:
            d = mathutils.Vector(pts[-1]) - mathutils.Vector(pts[-2])
        else:
            d = mathutils.Vector(pts[i + 1]) - mathutils.Vector(pts[i - 1])
        rg, ref = ring(p, d, max(radii[i], 1e-4), ref)
        if prev is not None:
            b = len(buf.v)
            buf.add(prev + rg, [(i0, (i0 + 1) % RINGS, RINGS + (i0 + 1) % RINGS, RINGS + i0)
                                for i0 in range(RINGS)])
            del b
        prev = rg


# ---------------------------------------------------------------- geometry emission
def emit_wood(buf, st):
    """Internodes as rings joined parent->child. A shared parent ring at a fork means
    the fork is webbed rather than two cylinders poking through each other."""
    alive, frac, r = st["alive"], st["frac"], st["r"]
    flare_amt = FLARE_AMT * st["t_root"]

    def flare(p, rad):
        return rad * (1.0 + flare_amt * math.exp(-max(p[2], 0.0) / FLARE_H))

    refs = {0: mathutils.Vector((1, 0, 0))}
    rings = {}
    order = [i for i in range(len(NODES)) if alive[i]]
    for i in order:
        nd = NODES[i]
        if nd.parent < 0:
            d = mathutils.Vector((0, 0, 1))
            rg, u = ring(nd.p, d, flare(nd.p, r[i]), refs[0])
            rings[i], refs[i] = rg, u
            continue
        par = NODES[nd.parent]
        b = par.p + (nd.p - par.p) * frac[i]
        d = mathutils.Vector(b - par.p)
        rad = r[i] + (r[nd.parent] - r[i]) * (1.0 - frac[i])
        rg, u = ring(b, d, flare(b, rad), refs.get(nd.parent, mathutils.Vector((1, 0, 0))))
        rings[i], refs[i] = rg, u
        pr = rings.get(nd.parent)
        if pr is None:
            continue
        buf.add(pr + rg, [(k, (k + 1) % RINGS, RINGS + (k + 1) % RINGS, RINGS + k)
                          for k in range(RINGS)])
    # cap the crown tips so twigs are not open pipes
    for i in order:
        if not any(alive[k] for k in NODES[i].kids) and r[i] > 0:
            buf.sphere(NODES[i].p if NODES[i].parent < 0 else
                       NODES[NODES[i].parent].p + (NODES[i].p - NODES[NODES[i].parent].p) * frac[i],
                       r[i] * 0.98)


def emit_roots(buf, st):
    """Buttress spurs: up the bole, then out and down to the soil. Gap 2."""
    t = st["t_root"]
    if t < 0.04:
        return
    base_r = st["r"][0]
    for k, rs in enumerate(ROOTS):
        reach = rs["reach"] * t
        rise = rs["rise"] * min(1.0, t * 1.35)
        if reach < 0.012:
            continue
        d = rs["dir"]
        pts, radii, segs = [], [], 7
        for j in range(segs + 1):
            u = j / segs
            lat = reach * (u ** 0.72)
            hgt = rise * (1.0 - u) ** 1.55
            w = rs["wob"] * math.sin(u * 2.6)
            pts.append(mathutils.Vector((d[0] * lat - d[1] * w, d[1] * lat + d[0] * w,
                                         max(hgt, 0.004))))
            radii.append(max(base_r * rs["thick"] * (0.52 * (1.0 - u) ** 0.85 + 0.045),
                             0.006))
        # The spur starts ON the trunk axis, so its opening ring must stay INSIDE the
        # flared bole — otherwise the open pipe pokes through the silhouette and reads
        # as a black notch cut out of the trunk.
        bole_here = base_r * (1.0 + FLARE_AMT * t * math.exp(-pts[0][2] / FLARE_H))
        radii[0] = min(radii[0], bole_here * 0.72)
        tube(buf, pts, radii)
        buf.sphere(pts[0], radii[0] * 0.98)
        buf.sphere(pts[-1], radii[-1] * 1.05)


def leaf_blade(buf, base, axis, up, length, width, curl,
               ribs=(0.06, 0.46, 0.50, 0.36, 0.0)):
    """One leaf blade: a midrib with five ribs, drooping slightly. Gap 3 — at stages
    2-3 exp-16 draws individual blades and v1 drew lobes, which is much less charming."""
    ax = mathutils.Vector(axis).normalized()
    side = ax.cross(mathutils.Vector(up))
    if side.length < 1e-6:
        side = ax.cross(mathutils.Vector((1, 0, 0)))
    side.normalize()
    nrm = side.cross(ax).normalized()
    ts = (0.0, 0.22, 0.5, 0.78, 1.0)
    hw = ribs
    left, right = [], []
    for t, h in zip(ts, hw):
        mid = mathutils.Vector(base) + ax * (length * t) - nrm * (curl * length * t * t)
        left.append(mid + side * (width * h))
        right.append(mid - side * (width * h))
    b = len(buf.v)
    buf.v += left + right
    n = len(ts)
    buf.f += [(b + i, b + i + 1, b + n + i + 1, b + n + i) for i in range(n - 1)]


def emit_blades(buf, st):
    alive, leaf, r = st["alive"], st["leaf"], st["r"]
    for i, nd in enumerate(NODES):
        if not alive[i] or nd.parent < 0 or leaf[i] < 0.05:
            continue
        if i % LEAF_EVERY != 0:
            continue
        par = NODES[nd.parent].p
        b = par + (nd.p - par) * st["frac"][i]
        ax = mathutils.Vector(nd.p - par)
        if ax.length < 1e-6:
            continue
        ax.normalize()
        L = LEAF_LEN * leaf[i] * (0.76 + 0.48 * h01(i, 91))
        if L < 0.012:
            continue
        # a whorl around the shoot, phase-offset per node so successive whorls do not
        # stack into a single plane
        side0 = ax.cross(mathutils.Vector((0, 0, 1)))
        if side0.length < 1e-6:
            side0 = ax.cross(mathutils.Vector((1, 0, 0)))
        side0.normalize()
        perp = ax.cross(side0).normalized()
        phase = h01(i, 93) * math.tau
        for s in range(LEAF_PER):
            th = phase + s / LEAF_PER * math.tau
            radial = side0 * math.cos(th) + perp * math.sin(th)
            # petiole: mostly outward from the shoot, lifted, with a little forward lean
            outward = (radial * (0.86 + 0.16 * h01(i, 97 + s)) + ax * 0.34
                       + mathutils.Vector((0, 0, 0.30))).normalized()
            base = b - ax * (L * 0.12 * s / max(1, LEAF_PER - 1))
            leaf_blade(buf, base + radial * (r[i] * 0.8), outward,
                       mathutils.Vector((0, 0, 1)), L, L * 0.46, 0.34)


def emit_cotyledons(buf, st):
    """The two-leaf opening. Gap 1: exp-16 opens on a true cotyledon seedling and v1
    opened on a bare stump. The pair is an ORGAN on the base internode, present from
    the first frame and absorbed as the first true leaves flush — it never makes a
    branch appear or disappear, so the skeleton stays a strict prefix."""
    c = st["cot"]
    if c < 0.04 or not st["alive"][0]:
        return
    # sit them at the top of the hypocotyl: the highest live node on the first chain
    i = 0
    while NODES[i].kids and st["alive"][NODES[i].kids[0]] and NODES[i].p[2] < 0.20:
        i = NODES[i].kids[0]
    par = NODES[NODES[i].parent].p if NODES[i].parent >= 0 else NODES[i].p
    top = par + (NODES[i].p - par) * st["frac"][i]
    L = COT_LEN * c
    for s in (-1, 1):
        d = mathutils.Vector((s * 0.96, 0.10 * s, 0.26)).normalized()
        # broad and blunt, not a spike: a cotyledon is a fat oval and a narrow one
        # reads as a cross rather than as a seedling
        leaf_blade(buf, mathutils.Vector(top), d, mathutils.Vector((0, 0, 1)),
                   L, L * 0.92, 0.10, ribs=(0.30, 0.86, 1.00, 0.90, 0.34))


# ---------------------------------------------------------------- scene
def make_materials():
    def mat(name, rgb, rough, sss=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = lin(rgb)
        b.inputs["Roughness"].default_value = rough
        return m

    bark = mat("bark", BARK_SRGB, 0.93)
    fol = mat("foliage", FOLIAGE_SRGB, 0.80)
    blade = mat("blade", BLADE_SRGB, 0.66)
    return bark, fol, blade


def make_world():
    """An empty startup file has NO world, so ambient is pure black and everything
    inside the crown snaps to the darkest palette brown — measured: 1590 of ~5000 mature
    pixels were the single darkest colour. A sky term is what lets the interior read as
    foliage in shade rather than as a hole. `film_transparent` keeps it out of alpha.
    """
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin((0.60, 0.68, 0.74))
    bg.inputs["Strength"].default_value = 0.62
    bpy.context.scene.world = w


def build_scene(st, shadow_pass):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_world()
    bark, fol, blade = make_materials()

    wood = MeshBuf()
    emit_wood(wood, st)
    emit_roots(wood, st)
    objs = [wood.object("wood", bark)]

    if st["lobes"]:
        lb = MeshBuf()
        for _ci, c, rad in st["lobes"]:
            lb.blob(c, rad, _ci)
        objs.append(lb.object("lobes", fol))

    bl = MeshBuf()
    emit_blades(bl, st)
    emit_cotyledons(bl, st)
    if bl.v:
        objs.append(bl.object("blades", blade, smooth=False))

    if shadow_pass:
        # Ground contact. The tree casts but is invisible to camera, so alpha carries
        # the shadow alone and the raster back half can composite it as its own value.
        for ob in objs:
            ob.visible_camera = False
        bpy.ops.mesh.primitive_plane_add(size=SPAN * 3.0, location=(0, 0, 0.0))
        plane = bpy.context.active_object
        plane.is_shadow_catcher = True

    setup_camera_and_light(shadow_pass)


def setup_camera_and_light(shadow_pass=False):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = SPAN
    target = mathutils.Vector((0.0, 0.0, TZ))
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = target + mathutils.Vector((0.0, -14.0 * math.cos(EL), 14.0 * math.sin(EL)))
    cam.rotation_euler = (math.pi / 2 - EL, 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    if shadow_pass:
        # A CONTACT shadow, not a physically-consistent cast from the key. The key sun
        # sits at 48 deg and throws a shadow several tree-lengths long, which walks off
        # the canvas and reads as a smear. forest-world's own tree draws a compact
        # ellipse under the trunk (rx = 0.78R, ry = 0.20R, offset (2,2) — scene.ts), so
        # the shadow pass is calibrated to THAT convention: a near-overhead sun nudged
        # down-right on screen. Same reasoning as the camera — match the app plate.
        sun = bpy.data.lights.new("shadow-sun", type="SUN")
        sun.energy = 2.5
        sun.angle = math.radians(26.0)          # soft edge: a hard contact rim is CG
        so = bpy.data.objects.new("shadow-sun", sun)
        so.rotation_euler = (math.radians(15), 0.0, math.radians(28))
        bpy.context.collection.objects.link(so)
        return

    key = bpy.data.lights.new("key", type="SUN")
    key.energy = 3.4
    key.angle = math.radians(7.0)
    ko = bpy.data.objects.new("key", key)
    ko.rotation_euler = (math.radians(48), 0.0, math.radians(34))
    bpy.context.collection.objects.link(ko)

    fill = bpy.data.lights.new("fill", type="SUN")
    fill.energy = 1.0
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = (math.radians(66), 0.0, math.radians(-118))
    bpy.context.collection.objects.link(fo)


def render(path, samples):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"                 # D2a: CPU only, driver-stable
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.seed = SEED                    # D2a: fixed seed
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"   # palette control is ours, not filmic
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- drive
PICKS = retime()
print("RETIME", [round(p, 4) for p in PICKS], flush=True)
print(f"SKELETON nodes={len(NODES)} iters={NMAX_BIRTH} lobes={len(CLUSTERS)} "
      f"span={SPAN:.4f} tz={TZ:.4f} top={_TOP:.3f} halfw={_HALFW:.3f}", flush=True)

meta = {
    "generator": "blender_tree.py",
    "blender": "5.2.0 LTS",
    "engine": "CYCLES/CPU",
    "seed": SEED,
    "samples": SAMPLES,
    "shadow_samples": SHADOW_SAMPLES,
    "supersample_res": RES,
    "canvas": [CANVAS, CANVAS],
    "camera_elevation_deg": ELEV_DEG,
    "camera": "orthographic; framed ONCE to the mature extent and identical every frame",
    "ortho_scale": round(SPAN, 6),
    "target_z": round(TZ, 6),
    "planned_anchor": [CANVAS / 2.0, ANCHOR_ROW],
    "nodes": len(NODES),
    "iterations": NMAX_BIRTH,
    "lobes": len(CLUSTERS),
    "frames": [],
}

if not SKIP_RENDER:
    os.makedirs(os.path.join(OUT, "shadow"), exist_ok=True)
for i, u in enumerate(PICKS):
    N = n_of_u(u)
    st = frame_state(N)
    meta["frames"].append({
        "i": i, "u": round(u, 6), "N": round(N, 4),
        "live_nodes": int(st["alive"].sum()),
        "lobes": len(st["lobes"]),
        "trunk_r": round(float(st["r"][0]), 5),
        "t_root": round(st["t_root"], 4),
        "cotyledon": round(st["cot"], 4),
    })
    if SKIP_RENDER:
        print(f"PLAN {i:02d} u={u:.4f} N={N:.2f} live={int(st['alive'].sum())} "
              f"lobes={len(st['lobes'])} r0={st['r'][0]:.4f} root={st['t_root']:.2f} "
              f"cot={st['cot']:.2f}", flush=True)
        continue
    build_scene(st, shadow_pass=False)
    render(os.path.join(OUT, f"frame-{i:02d}.png"), SAMPLES)
    build_scene(st, shadow_pass=True)
    render(os.path.join(OUT, "shadow", f"frame-{i:02d}.png"), SHADOW_SAMPLES)
    print(f"FRAME {i} u={u:.4f} N={N:.2f} -> {OUT}/frame-{i:02d}.png", flush=True)

with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE", NFRAMES, "frames at", RES, "px,", SAMPLES, "samples, CPU Cycles", flush=True)
