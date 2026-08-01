#!/usr/bin/env python3
"""
code-sdf-volume — a 19-frame growth track for a 2.5D pixel-art tree, computed
entirely from code.  No generative model, no vendor call, no image input.

Technique
---------
The tree is a *3D signed-distance field*: tapered round-cones for the trunk,
limbs, twigs and roots, plus oblate ellipsoid metaballs for the canopy lobes.
Cones are exp-smooth-unioned tightly (crisp joins with real fillets at every
fork); lobes are exp-smooth-unioned loosely (they merge into a crown but stay
readable); the two families are blended with a middle k, and the union is
intersected with the half-space y >= 0 so the roots are genuinely cut off by
the ground.

The field is sphere-traced from an orthographic camera pitched 14 degrees down.
Every hit gets a real surface normal (4-tap tetrahedron gradient), Lambert
shading from one light direction, SDF ambient occlusion (which darkens exactly
where two masses meet), a soft shadow ray toward the light (so the crown casts
onto its own trunk), a ground-proximity occlusion term, and a warm bounce from
the ground plane.  The continuous luminance is then *banded* onto a palette
sampled from exp-16's own 32 colours, and a selective dark outline is applied
only where the silhouette meets background or where a depth discontinuity says
one mass is in front of another.  A real cast shadow on the ground plane is
rendered as a separate layer.

Growth
------
`t` in [0,1] is the only growth parameter.  It is remapped through a calibrated
developmental clock `a(t)` chosen at runtime so that the rendered alpha mass is
*geometric* in t (constant relative growth per frame).  Every branch and lobe is
born with zero size and grows continuously, so no element can ever pop in.

Determinism
-----------
One seed drives one numpy Generator, used only while authoring the skeleton.
Nothing else consumes randomness.  Two runs are byte-identical.

Reproduce:
    python gen_tree.py --out frames
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time

import numpy as np
from PIL import Image

# --------------------------------------------------------------------------
# palette — sampled from exp-16-leader-repair/frames/*.png (read-only reference)
# --------------------------------------------------------------------------
BARK = [
    (73, 44, 28), (87, 54, 33), (103, 62, 39), (114, 73, 45),
    (125, 82, 49), (133, 97, 58), (145, 108, 67), (152, 106, 60),
]
FOLIAGE = [
    (86, 73, 39), (92, 90, 46), (101, 118, 65), (117, 134, 80),
    (121, 141, 83), (135, 148, 89), (164, 162, 108), (173, 167, 114),
]
SHADOW_RGB = (110, 88, 58)          # island tan, darkened; alpha-banded

CANVAS = 128
ANCHOR = (64.0, 122.0)
PITCH_DEG = 14.0
LIGHT = np.array([-0.44, 0.83, 0.34])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def norm(v):
    return v / (np.linalg.norm(v) + 1e-12)


def rot_axis(v, axis, ang):
    axis = norm(np.asarray(axis, dtype=np.float64))
    c, s = math.cos(ang), math.sin(ang)
    return v * c + np.cross(axis, v) * s + axis * np.dot(axis, v) * (1 - c)


# --------------------------------------------------------------------------
# skeleton  (authored once, at maturity; `a` scales it back down)
# --------------------------------------------------------------------------

class Branch:
    __slots__ = ("parent", "attach_s", "dir0", "L", "r0", "r1", "depth",
                 "birth", "span", "curl", "target", "nseg", "lmin", "lobe_k")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


class Ball:
    __slots__ = ("branch", "s", "rad", "birth", "span", "off", "fade", "M")

    def __init__(self, **kw):
        for k in self.__slots__:
            setattr(self, k, kw.get(k))


SPECIES = dict(
    trunk_L=44.0, trunk_r0=9.0, trunk_r1=4.8, trunk_birth=-0.85, trunk_span=1.85,
    trunk_lmin=0.30,
    n_roots=9, root_L=30.0, root_r0=4.6, root_up=0.42, root_dive=-0.50,
    root_attach=(1.5, 7.0), root_z=0.55, root_lmin=0.20, root_curl=0.048,
    n_flute=5,
    limb_L=34.0, limb_r0=4.3, sec_L=16.0, ter_L=9.0,
    n_sec=3, n_ter=3, ball_ter=10.6, ball_sec=9.0,
    leaf_r=(9.2, 2.5, 4.7), n_leaf1=3, n_leaf2=2,
    env_r=(35.0, 18.0, 27.0), env_off=(-1.0, 20.0), env_birth=0.56,
    cot_r=(10.5, 2.4, 6.4), cot_s=25.0, cot_sep=6.6,
)


def build_skeleton(seed: int, S=None):
    """Author the mature tree.  Randomness is consumed here and nowhere else."""
    S = dict(SPECIES, **(S or {}))
    rng = np.random.default_rng(seed)
    branches: list[Branch] = []
    balls: list[Ball] = []

    def add(**kw):
        branches.append(Branch(**kw))
        return len(branches) - 1

    # --- trunk -------------------------------------------------------------
    trunk = add(parent=-1, attach_s=0.0,
                dir0=norm(np.array([0.05, 1.0, 0.02])),
                L=S["trunk_L"], r0=S["trunk_r0"], r1=S["trunk_r1"], depth=0,
                birth=S["trunk_birth"], span=S["trunk_span"], curl=0.022,
                target=np.array([-0.12, 1.0, 0.0]), nseg=4,
                lmin=S["trunk_lmin"])

    # --- roots: they arch OUT of the trunk as buttresses, then dive into the
    #     ground plane, which the y>=0 half-space cuts.  That cut is what makes
    #     the tree read as planted rather than pasted on.
    n_roots = S["n_roots"]
    for i in range(n_roots):
        az = (i / n_roots) * 2 * math.pi + float(rng.uniform(-0.18, 0.18))
        # pull each root toward the screen-lateral axis so the flare reads
        # WIDE from this camera instead of foreshortening into the trunk
        lat = math.cos(az)
        d = norm(np.array([math.copysign(1.0, lat) * (0.45 + 0.55 * abs(lat)),
                           S["root_up"], math.sin(az) * S["root_z"]]))
        ln = S["root_L"] * float(rng.uniform(0.80, 1.20))
        a0, a1 = S["root_attach"]
        add(parent=trunk, attach_s=float(rng.uniform(a0, a1)),
            dir0=d, L=ln, r0=S["root_r0"] * float(rng.uniform(0.80, 1.20)),
            r1=0.45, depth=-1, birth=-0.35, span=1.35, curl=S["root_curl"],
            target=np.array([d[0] * 1.6, S["root_dive"], d[2] * 1.6]), nseg=3,
            lmin=S["root_lmin"])

    # --- trunk flutes: shallow ridges welded onto the trunk by the smooth
    #     union.  This is what turns one tapering cone into the merged
    #     multi-stem trunk the reference art has.
    for i in range(S["n_flute"]):
        az = (i / S["n_flute"]) * 2 * math.pi + 0.4
        off = norm(np.array([math.cos(az), 0.0, math.sin(az) * 0.7]))
        d = norm(np.array([0.05, 1.0, 0.02]) + off * 0.055)
        add(parent=trunk, attach_s=float(rng.uniform(0.5, 2.0)), dir0=d,
            L=S["trunk_L"] * float(rng.uniform(0.55, 0.80)),
            r0=S["trunk_r0"] * 0.42, r1=S["trunk_r0"] * 0.13, depth=0,
            birth=-0.55, span=1.55, curl=0.02,
            target=np.array([off[0] * 0.10, 1.0, off[2] * 0.10]), nseg=3,
            lmin=0.28)

    # --- primary limbs -----------------------------------------------------
    # azimuths on the golden angle so the crown balances instead of clumping
    # to one side; lobe_k makes the upper limbs carry the big dome masses and
    # the low side limbs the small perimeter ones.
    prim_specs = [
        # (attach frac, azimuth, elevation, length k, r0 k, birth, lobe k)
        (0.50, 0.00, 0.20, 1.20, 0.86, 0.085, 0.90),
        (0.62, 2.40, 0.24, 1.24, 0.92, 0.125, 0.94),
        (0.74, 4.80, 0.30, 1.16, 0.90, 0.150, 0.92),
        (0.88, 1.20, 0.50, 1.20, 1.12, 0.050, 1.12),
        (0.90, 3.60, 0.46, 1.14, 1.04, 0.170, 1.06),
        (1.00, 6.00, 0.74, 0.96, 1.02, 0.020, 1.10),
    ]
    limbs = []
    for (sf, az, el, lk, rk, b, lobek) in prim_specs:
        az += float(rng.uniform(-0.16, 0.16))
        el += float(rng.uniform(-0.07, 0.07))
        d = norm(np.array([math.cos(az) * math.cos(el),
                           math.sin(el),
                           math.sin(az) * math.cos(el) * 0.66]))
        i = add(parent=trunk, attach_s=S["trunk_L"] * sf, dir0=d,
                L=S["limb_L"] * lk * float(rng.uniform(0.94, 1.06)),
                r0=S["limb_r0"] * rk, r1=S["limb_r0"] * rk * 0.56, depth=1,
                birth=b, span=0.60, curl=0.042, lobe_k=lobek,
                target=np.array([d[0] * 0.70, 1.0, d[2] * 0.70]), nseg=3)
        limbs.append(i)

    # --- secondaries and tertiaries ---------------------------------------
    def children_of(pi, depth, count, base_birth):
        out = []
        pb = branches[pi]
        for j in range(count):
            frac = 0.46 + 0.48 * (j / max(1, count - 1)) if count > 1 else 0.72
            s = pb.L * frac
            spread = 0.72 if depth == 2 else 0.66
            side = 1.0 if (j % 2 == 0) else -1.0
            ax = norm(np.cross(pb.dir0, np.array([0.0, 1.0, 0.0])) +
                      np.array([0.0, 0.12, 0.0]))
            d = rot_axis(pb.dir0, ax, side * spread * float(rng.uniform(0.75, 1.2)))
            d = rot_axis(d, np.array([0.0, 1.0, 0.0]),
                         float(rng.uniform(-0.55, 0.55)))
            d = norm(d + np.array([0.0, 0.34, 0.0]))
            ln = (S["sec_L"] if depth == 2 else S["ter_L"]) * float(rng.uniform(0.82, 1.18))
            r0 = pb.r1 * float(rng.uniform(0.72, 0.88))
            i = add(parent=pi, attach_s=s, dir0=d, L=ln, r0=r0, r1=r0 * 0.55,
                    depth=depth, lobe_k=pb.lobe_k,
                    birth=base_birth + 0.055 * j + float(rng.uniform(-0.02, 0.02)),
                    span=0.52, curl=0.05,
                    target=np.array([d[0] * 0.5, 1.0, d[2] * 0.5]),
                    nseg=2 if depth == 2 else 1)
            out.append(i)
        return out

    secs = []
    for li in limbs:
        secs += children_of(li, 2, S["n_sec"], branches[li].birth + 0.20)
    ters = []
    for si in secs:
        ters += children_of(si, 3, S["n_ter"], branches[si].birth + 0.19)

    # --- canopy lobes ------------------------------------------------------
    # two cotyledon leaves so frame 00 is a seed-leaf sprout, not a miniature
    # tree.  They wither over a=0.30..0.62 the way real seed leaves do; the
    # juvenile leaves below have taken over by then, so total mass still rises.
    cx, cy, cz = S["cot_r"]
    for k, side in enumerate((-1.0, 1.0)):
        ax = norm(np.array([side * math.cos(0.62), math.sin(0.62), 0.22 * side]))
        balls.append(Ball(branch=trunk, s=S["cot_s"], rad=np.array([cx, cy, cz]),
                          birth=-0.72, span=1.00, fade=(0.34, 0.66),
                          M=basis_from(ax),
                          off=ax * S["cot_sep"] + np.array([0.0, 0.6 + 0.6 * k, 0.0])))

    # juvenile leaves: real oriented BLADES — long along the leaf, thin through
    # it — scattered along the limbs and secondaries and born early.  They are
    # what makes the middle of the track read as a leafy whip instead of a bare
    # stick; at maturity they sit harmlessly inside the crown.
    lx, ly, lz = S["leaf_r"]
    for i in limbs + secs:
        b = branches[i]
        nj = S["n_leaf1"] if b.depth == 1 else S["n_leaf2"]
        for j in range(nj):
            fr = 0.22 + 0.62 * (j / max(1, nj - 1))
            side = 1.0 if (j % 2 == 0) else -1.0
            axr = norm(np.cross(b.dir0, np.array([0.0, 1.0, 0.0])) + 1e-6)
            ax = rot_axis(b.dir0, axr, side * float(rng.uniform(0.75, 1.25)))
            ax = norm(ax + np.array([0.0, 0.72, 0.0]))
            kk = float(rng.uniform(0.78, 1.24))
            balls.append(Ball(branch=i, s=b.L * fr,
                              rad=np.array([lx * kk, ly, lz * kk]),
                              M=basis_from(ax),
                              birth=b.birth + 0.02 + 0.028 * j, span=0.40,
                              off=ax * lx * kk * 0.62 + np.array([0.0, 0.5, 0.0])))

    # --- crown envelope ----------------------------------------------------
    # One big oblate mass at the crown centre, smooth-unioned with the lobes at
    # the same small k.  It supplies the DOME the reference art has, while the
    # individual lobes still bump out through its surface — so the silhouette
    # reads as one crown made of clusters rather than a heap of separate balls.
    ex, ey, ez = S["env_r"]
    balls.append(Ball(branch=trunk, s=S["trunk_L"] * 0.97,
                      rad=np.array([ex, ey, ez]),
                      birth=S["env_birth"], span=0.60, fade=None,
                      off=np.array([S["env_off"][0], S["env_off"][1], 0.0])))

    for i in ters:
        b = branches[i]
        rr = S["ball_ter"] * b.lobe_k * float(rng.uniform(0.82, 1.18))
        balls.append(Ball(branch=i, s=b.L * 0.92,
                          rad=np.array([rr, rr * 0.78, rr * 0.92]),
                          birth=b.birth + 0.055, span=0.60,
                          off=np.array([0.0, 1.2, 0.0])))
    for i in secs:
        b = branches[i]
        rr = S["ball_sec"] * b.lobe_k * float(rng.uniform(0.80, 1.20))
        balls.append(Ball(branch=i, s=b.L * 0.60,
                          rad=np.array([rr, rr * 0.76, rr * 0.92]),
                          birth=b.birth + 0.16, span=0.62,
                          off=np.array([0.0, 2.0, 0.0])))
    return branches, balls


# --------------------------------------------------------------------------
# evaluate the skeleton at developmental clock `a` -> primitive arrays
# --------------------------------------------------------------------------

def eval_tree(branches, balls, a: float):
    polys: dict[int, tuple] = {}
    cA, cB, cR0, cR1 = [], [], [], []

    for i, br in enumerate(branches):
        g = float(smooth01((a - br.birth) / br.span))
        if g <= 1e-4:
            continue
        if br.parent >= 0 and br.parent not in polys:
            continue
        age = min(max((a - br.birth) / max(1e-6, (1.15 - br.birth)), 0.0), 1.0)
        # secondary thickening: a branch keeps fattening long after it stops
        # extending, which is what stops the seedling looking like a small tree
        rs = (0.06 + 0.94 * age ** 1.45) * float(smooth01(g / 0.16))
        lm = br.lmin or 0.0
        L = br.L * (lm + (1.0 - lm) * g)
        if L < 0.35:
            continue

        if br.parent < 0:
            base = np.zeros(3)
        else:
            base = sample_poly(polys[br.parent], br.attach_s)

        n = br.nseg
        step = L / n
        d = br.dir0.copy()
        tgt = norm(br.target)
        pts = [base]
        for _ in range(n):
            d = norm(d + (tgt - d) * br.curl * step)
            pts.append(pts[-1] + d * step)
        r0 = br.r0 * rs
        r1 = max(br.r1 * rs, 0.14)
        for k in range(n):
            f0, f1 = k / n, (k + 1) / n
            cA.append(pts[k]); cB.append(pts[k + 1])
            cR0.append(r0 + (r1 - r0) * f0)
            cR1.append(r0 + (r1 - r0) * f1)
        polys[i] = (np.array(pts), L)

    bC, bR, bM = [], [], []
    for bl in balls:
        g = float(smooth01((a - bl.birth) / bl.span))
        if g <= 1e-4 or bl.branch not in polys:
            continue
        age = min(max((a - bl.birth) / max(1e-6, (1.15 - bl.birth)), 0.0), 1.0)
        rs = (0.30 + 0.70 * age ** 0.90) * float(smooth01(g / 0.18))
        if bl.fade:                      # cotyledons wither; the crown covers it
            f0, f1 = bl.fade
            rs *= 1.0 - float(smooth01((a - f0) / (f1 - f0)))
        c = sample_poly(polys[bl.branch], bl.s) + bl.off * rs
        r = bl.rad * rs
        if r.min() < 0.5:
            continue
        bC.append(c); bR.append(r)
        bM.append(bl.M if bl.M is not None else np.eye(3))

    return (np.array(cA), np.array(cB), np.array(cR0), np.array(cR1),
            np.array(bC) if bC else np.zeros((0, 3)),
            np.array(bR) if bR else np.zeros((0, 3)),
            np.array(bM) if bM else np.zeros((0, 3, 3)))


def sample_poly(poly, s):
    pts, L = poly
    s = min(max(s, 0.0), L * 0.985)
    acc = 0.0
    for k in range(len(pts) - 1):
        seg = float(np.linalg.norm(pts[k + 1] - pts[k]))
        if acc + seg >= s or k == len(pts) - 2:
            f = 0.0 if seg <= 1e-9 else (s - acc) / seg
            f = min(max(f, 0.0), 1.0)
            return pts[k] + (pts[k + 1] - pts[k]) * f
        acc += seg
    return pts[-1]


# --------------------------------------------------------------------------
# the signed distance field
# --------------------------------------------------------------------------

K_CONE = 0.85
K_BALL = 2.6
K_MIX = 1.05


def sd_round_cone(P, A, B, R0, R1):
    """P (N,1,3), A/B (1,M,3), R0/R1 (1,M) -> (N,M).  iq's exact round cone."""
    ba = B - A                                  # (1,M,3)
    l2 = np.sum(ba * ba, axis=-1)               # (1,M)
    rr = R0 - R1
    a2 = l2 - rr * rr
    il2 = 1.0 / np.maximum(l2, 1e-9)
    pa = P - A                                  # (N,M,3)
    y = np.sum(pa * ba, axis=-1)                # (N,M)
    z = y - l2
    w = pa * l2[..., None] - ba * y[..., None]
    x2 = np.sum(w * w, axis=-1)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = (np.sqrt(np.maximum(x2 * a2 * il2, 0.0)) + y * rr) * il2 - R0
    m1 = np.sign(z) * a2 * z2 > k
    m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
    out = np.where(m1, np.sqrt(np.maximum(x2 + z2, 0.0)) * il2 - R1, out)
    out = np.where(m2, np.sqrt(np.maximum(x2 + y2, 0.0)) * il2 - R0, out)
    return out


def sd_ellipsoid(P, C, R, M=None):
    """P (N,1,3), C (1,K,3), R (1,K,3), M (K,3,3) rows = local axes.
    With M this is an ORIENTED ellipsoid, which is what turns a blob into a
    leaf blade: long along the leaf, thin through it, medium across."""
    d = P - C
    if M is not None:
        d = np.einsum("nkj,kij->nki", d, M)
    q = d / R
    k0 = np.sqrt(np.sum(q * q, axis=-1))
    q2 = d / (R * R)
    k1 = np.sqrt(np.sum(q2 * q2, axis=-1))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)


LEAF_FACE = (0.0, 0.30, 0.95)   # blade thin-axis -> toward the camera


def basis_from(axis, up_hint=LEAF_FACE):
    """Orthonormal rows: [long, thick(normal), wide]."""
    a = norm(np.asarray(axis, dtype=np.float64))
    n = np.asarray(up_hint, dtype=np.float64) - a * np.dot(a, up_hint)
    if np.linalg.norm(n) < 1e-6:
        n = np.array([0.0, 0.0, 1.0]) - a * a[2]
    n = norm(n)
    w = np.cross(a, n)
    return np.stack([a, n, w])


def smin2(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1.0 - h) + a * h - k * h * (1.0 - h), h


def smin_fold(D, k):
    """Polynomial smooth-min over the last axis.

    Sorted first, then folded from the nearest outward.  Two properties matter:
    the quadratic smin has COMPACT SUPPORT (anything further than k away
    contributes exactly nothing), and sorting makes the fold order canonical.
    Together they make the result independent of how many primitives were
    handed in — which is what lets the tile culler drop far primitives without
    leaving a seam.  (An exp smooth-min would fail both: it under-estimates by
    k*ln(count), so the crown inflates as lobes are added.)"""
    if D.shape[-1] == 1:
        return D[..., 0]
    Ds = np.sort(D, axis=-1)
    r = Ds[..., 0].copy()
    for i in range(1, Ds.shape[-1]):
        b = Ds[..., i]
        if not (b < r + k).any():
            break
        r, _ = smin2(r, b, k)
    return r


def scene(P, prims, want_mat=False):
    """P (N,3) -> d (N,)  [, mat (N,) 0=bark 1=foliage]"""
    cA, cB, cR0, cR1, bC, bR, bM = prims
    Pn = P[:, None, :]
    if len(cA):
        dcone = smin_fold(sd_round_cone(Pn, cA[None], cB[None],
                                        cR0[None], cR1[None]), K_CONE)
    else:
        dcone = np.full(P.shape[0], 1e6)
    if len(bC):
        dball = smin_fold(sd_ellipsoid(Pn, bC[None], bR[None], bM), K_BALL)
    else:
        dball = np.full(P.shape[0], 1e6)

    d, h = smin2(dcone, dball, K_MIX)
    d = np.maximum(d, -P[:, 1])                 # cut by the ground plane y>=0
    if want_mat:
        return d, (1.0 - h)
    return d


# --------------------------------------------------------------------------
# camera + marching
# --------------------------------------------------------------------------

def camera(pitch_deg=PITCH_DEG):
    p = math.radians(pitch_deg)
    fwd = np.array([0.0, -math.sin(p), -math.cos(p)])
    right = np.array([1.0, 0.0, 0.0])
    up = np.array([0.0, math.cos(p), -math.sin(p)])
    return fwd, right, up


def make_rays(ss, shift=(0.0, 0.0), pitch_deg=PITCH_DEG):
    fwd, right, up = camera(pitch_deg)
    n = CANVAS * ss
    idx = (np.arange(n) + 0.5) / ss
    cx = idx[None, :] - shift[0]
    cy = idx[:, None] - shift[1]
    X = (cx - ANCHOR[0]) * np.ones((n, 1))
    Y = (ANCHOR[1] - cy) * np.ones((1, n))
    O = (right[None, None, :] * X[..., None] +
         up[None, None, :] * Y[..., None] - fwd[None, None, :] * 260.0)
    return O.reshape(-1, 3), fwd


def bounding_sphere(prims):
    cA, cB, cR0, cR1, bC, bR, bM = prims
    pts, rad = [], []
    if len(cA):
        pts.append(cA); rad.append(cR0)
        pts.append(cB); rad.append(cR1)
    if len(bC):
        pts.append(bC); rad.append(bR.max(axis=1))
    P = np.concatenate(pts); R = np.concatenate(rad)
    c = P.mean(axis=0)
    r = float(np.max(np.linalg.norm(P - c, axis=1) + R)) + 1.5
    return c, r


# --- screen-space tile culling ------------------------------------------
# Orthographic camera => the perpendicular distance between a ray and a point
# is exactly their distance in screen space.  So a primitive can only be hit
# by rays inside a screen disc, and a tile can drop every primitive whose disc
# misses it.  This is what makes ~200 primitives affordable in numpy.
CULL_MARGIN = 8.0


def to_screen(P, shift=(0.0, 0.0)):
    _, right, up = camera()
    sx = ANCHOR[0] + P @ right + shift[0]
    sy = ANCHOR[1] - P @ up + shift[1]
    return sx, sy


def prim_discs(prims, shift=(0.0, 0.0)):
    cA, cB, cR0, cR1, bC, bR, bM = prims
    out = []
    if len(cA):
        ax, ay = to_screen(cA, shift)
        bx, by = to_screen(cB, shift)
        cx = 0.5 * (ax + bx); cy = 0.5 * (ay + by)
        half = 0.5 * np.hypot(bx - ax, by - ay)
        out.append((cx, cy, half + np.maximum(cR0, cR1)))
    if len(bC):
        bx, by = to_screen(bC, shift)
        out.append((bx, by, bR.max(axis=1)))
    return out


def cull(prims, cx, cy, half, shift=(0.0, 0.0)):
    """Keep only the primitives whose screen disc reaches this tile."""
    cA, cB, cR0, cR1, bC, bR, bM = prims
    discs = prim_discs(prims, shift)
    keep = []
    i = 0
    if len(cA):
        sx, sy, sr = discs[i]; i += 1
        d = np.hypot(sx - cx, sy - cy)
        mc = d < (sr + half * 1.4143 + CULL_MARGIN)
    else:
        mc = np.zeros(0, dtype=bool)
    if len(bC):
        sx, sy, sr = discs[i]
        d = np.hypot(sx - cx, sy - cy)
        mb = d < (sr + half * 1.4143 + CULL_MARGIN)
    else:
        mb = np.zeros(0, dtype=bool)
    return ((cA[mc], cB[mc], cR0[mc], cR1[mc], bC[mb], bR[mb], bM[mb]),
            int(mc.sum()) + int(mb.sum()))


def march(O, D, prims, cent, rad, maxsteps=110, eps=0.012):
    """returns t (N,), hit (N,) bool."""
    N = O.shape[0]
    oc = O - cent
    b = oc @ D
    c = np.sum(oc * oc, axis=1) - rad * rad
    disc = b * b - c
    live = disc > 0.0
    t = np.zeros(N)
    hit = np.zeros(N, dtype=bool)
    if not live.any():
        return t, hit
    sd = np.sqrt(np.maximum(disc, 0.0))
    t0 = np.maximum(-b - sd, 0.0)
    t1 = -b + sd
    idx = np.nonzero(live)[0]
    tt = t0[idx].copy()
    tmax = t1[idx]
    Oi = O[idx]
    for _ in range(maxsteps):
        if idx.size == 0:
            break
        P = Oi + D[None, :] * tt[:, None]
        d = scene(P, prims)
        got = d < eps
        gone = tt > tmax
        t[idx[got]] = tt[got]
        hit[idx[got]] = True
        keep = ~(got | gone)
        if not keep.any():
            break
        idx = idx[keep]; tt = tt[keep] + np.maximum(d[keep], 0.006) * 0.82
        tmax = tmax[keep]; Oi = Oi[keep]
    return t, hit


def normals(P, prims, h=0.32):
    e = np.array([[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]], dtype=np.float64)
    n = np.zeros_like(P)
    for k in range(4):
        n += e[k] * scene(P + e[k] * h, prims)[:, None]
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)


def ao_term(P, N, prims, scale=5.2):
    occ = np.zeros(P.shape[0]); sca = 1.0
    for i in range(1, 6):
        hh = 0.05 + scale * (i * i) / 25.0 * 0.55
        d = scene(P + N * hh, prims)
        occ += (hh - d) * sca
        sca *= 0.70
    return np.clip(1.0 - 1.70 * occ, 0.0, 1.0)


def soft_shadow(P, prims, L, k=7.0, steps=26, tmax=64.0):
    res = np.ones(P.shape[0])
    tt = np.full(P.shape[0], 0.75)
    idx = np.arange(P.shape[0])
    Pi = P.copy()
    for _ in range(steps):
        if idx.size == 0:
            break
        d = scene(Pi + L[None, :] * tt[:, None], prims)
        res[idx] = np.minimum(res[idx], np.clip(k * d / np.maximum(tt, 1e-3), 0.0, 1.0))
        tt = tt + np.clip(d, 0.35, 4.0)
        keep = (res[idx] > 0.02) & (tt < tmax)
        idx = idx[keep]; tt = tt[keep]; Pi = Pi[keep]
    return np.clip(res, 0.0, 1.0)


# --------------------------------------------------------------------------
# render one frame
# --------------------------------------------------------------------------

TILE = 16          # canvas px per tile


def _tiles(ss):
    for ty in range(0, CANVAS, TILE):
        for tx in range(0, CANVAS, TILE):
            yield tx, ty


def render_alpha_only(prims, ss=1, shift=(0.0, 0.0)):
    """Silhouette only — used by the growth calibration and the anchor pre-pass."""
    O, D = make_rays(ss, shift)
    n = CANVAS * ss
    O = O.reshape(n, n, 3)
    hit = np.zeros((n, n), dtype=bool)
    cent, rad = bounding_sphere(prims)
    for tx, ty in _tiles(ss):
        sub, cnt = cull(prims, tx + TILE / 2, ty + TILE / 2, TILE / 2, shift)
        if cnt == 0:
            continue
        Oc = O[ty * ss:(ty + TILE) * ss, tx * ss:(tx + TILE) * ss].reshape(-1, 3)
        _, h = march(Oc, D, sub, cent, rad, maxsteps=80, eps=0.05)
        hit[ty * ss:(ty + TILE) * ss, tx * ss:(tx + TILE) * ss] = h.reshape(TILE * ss, TILE * ss)
    return hit


GROUND_AO = 0.42          # how much the ground plane darkens what sits on it
GROUND_H = 11.0           # over how many world units that darkening falls off
GRAIN_BARK = 0.165        # vertical bark fluting amplitude
GRAIN_LEAF = 0.085        # foliage mottle amplitude
GRAIN_LOBE = 0.055        # per-lobe tone variation


def surface_grain(P, N, m, prims):
    """Deterministic surface *material* — the one thing a clean SDF render has
    none of, and the single biggest reason procedural art reads as plastic.

    Bark gets vertical fluting keyed to the azimuth of its own surface normal,
    so the grooves wrap any branch correctly.  Foliage gets a mottle plus a
    per-lobe tone offset, so neighbouring lobes are not the same flat green.
    All three are closed-form functions of position — no texture, no noise
    table, no randomness at render time."""
    ang = np.arctan2(N[:, 2], N[:, 0])
    flute = (np.sin(ang * 6.0 + P[:, 1] * 0.10) * 0.7 +
             np.sin(ang * 13.0 - P[:, 1] * 0.05) * 0.3)
    bark = 1.0 + GRAIN_BARK * flute

    mott = (np.sin(P[:, 0] * 0.92) * np.sin(P[:, 1] * 1.07 + 1.3) *
            np.sin(P[:, 2] * 0.85 + 2.1))
    leaf = 1.0 + GRAIN_LEAF * mott
    _, _, _, _, bC, bR, bM = prims
    if len(bC):
        dd = sd_ellipsoid(P[:, None, :], bC[None], bR[None], bM)
        li = np.argmin(dd, axis=1)
        # a fixed integer hash -> a stable per-lobe tone, no PRNG at render time
        hsh = ((li * 2654435761) % 4294967296) // 65536
        leaf = leaf * (1.0 + GRAIN_LOBE * ((hsh % 7) - 3.0) / 3.0)
    return np.where(m > 0.5, leaf, bark)


def shadow_proxy(prims, rmin=1.15):
    """A cheap stand-in scene for shadow rays: fat cones + every lobe.
    Hair-thin twigs cast no readable shadow, so dropping them is free."""
    cA, cB, cR0, cR1, bC, bR, bM = prims
    m = np.maximum(cR0, cR1) >= rmin if len(cA) else np.zeros(0, dtype=bool)
    return (cA[m], cB[m], cR0[m], cR1[m], bC, bR, bM)


def render_frame(prims, ss=2, shift=(0.0, 0.0), shadow=True):
    O, D = make_rays(ss, shift)
    n = CANVAS * ss
    O = O.reshape(n, n, 3)
    lum = np.zeros((n, n)); mat = np.zeros((n, n)); dep = np.zeros((n, n))
    hit = np.zeros((n, n), dtype=bool)
    cent, rad = bounding_sphere(prims)
    proxy = shadow_proxy(prims)

    for tx, ty in _tiles(ss):
        sub, cnt = cull(prims, tx + TILE / 2, ty + TILE / 2, TILE / 2, shift)
        sl = (slice(ty * ss, (ty + TILE) * ss), slice(tx * ss, (tx + TILE) * ss))
        if cnt == 0:
            continue
        Oc = O[sl].reshape(-1, 3)
        t, h = march(Oc, D, sub, cent, rad)
        lt = np.zeros(Oc.shape[0]); mt = np.zeros(Oc.shape[0]); dt = np.zeros(Oc.shape[0])
        if h.any():
            P = Oc[h] + D[None, :] * t[h][:, None]
            Nn = normals(P, sub)
            _, m = scene(P, sub, want_mat=True)
            ao = ao_term(P, Nn, sub)
            sh = soft_shadow(P + Nn * 0.45, proxy, LIGHT)

            sky = 0.5 + 0.5 * Nn[:, 1]
            diff = np.maximum(Nn @ LIGHT, 0.0)
            bounce = np.maximum(-Nn[:, 1], 0.0) * 0.22
            # ground-contact darkening: the ground plane occludes the lower
            # hemisphere, so the root flare and trunk foot go dark.  Every
            # generated track in round 3 was missing this cue.
            g = 1.0 - GROUND_AO * (1.0 - smooth01(P[:, 1] / GROUND_H))
            v = (0.62 * sky * ao + 0.58 * diff * (0.32 + 0.68 * sh) +
                 bounce * ao) * (0.36 + 0.64 * ao) * g
            v = v * surface_grain(P, Nn, m, sub)
            lt[h] = v; mt[h] = m; dt[h] = t[h]
        k = TILE * ss
        hit[sl] = h.reshape(k, k); lum[sl] = lt.reshape(k, k)
        mat[sl] = mt.reshape(k, k); dep[sl] = dt.reshape(k, k)

    def down(x, mask=None):
        x4 = x.reshape(CANVAS, ss, CANVAS, ss)
        if mask is None:
            return x4.mean(axis=(1, 3))
        m4 = mask.reshape(CANVAS, ss, CANVAS, ss)
        c = m4.sum(axis=(1, 3))
        return np.where(c > 0, (x4 * m4).sum(axis=(1, 3)) / np.maximum(c, 1), 0.0)

    cov = hit.astype(np.float64).reshape(CANVAS, ss, CANVAS, ss).mean(axis=(1, 3))
    A = cov >= 0.5
    Sm = ground_shadow(prims, proxy, shift) if shadow else np.zeros((CANVAS, CANVAS))
    return A, down(lum, hit), down(mat, hit), down(dep, hit), Sm, cov


def ground_shadow(prims, proxy, shift=(0.0, 0.0), radius=27.0):
    """A real cast shadow: intersect each background ray with the ground plane
    y=0 and march a soft shadow ray from that point toward the light.
    Rendered at 1 sample/px — a penumbra needs no supersampling."""
    O, D = make_rays(1, shift)
    tg = -O[:, 1] / D[1]
    Pg = O + D[None, :] * tg[:, None]
    rr = np.hypot(Pg[:, 0], Pg[:, 2])
    ok = (tg > 0) & (rr < radius)
    out = np.zeros(O.shape[0])
    if ok.any():
        sv = soft_shadow(Pg[ok] + np.array([0.0, 0.30, 0.0]), proxy, LIGHT,
                         k=4.2, steps=22, tmax=110.0)
        fall = np.clip(1.0 - (rr[ok] / radius) ** 1.5, 0.0, 1.0) ** 1.3
        out[ok] = (1.0 - sv) * fall
    return out.reshape(CANVAS, CANVAS)


# --------------------------------------------------------------------------
# palette / banding / outline  -> the pixel-art pass
# --------------------------------------------------------------------------

TONE = dict(lo=0.03, hi=0.95, gam=1.00,
            fol_gain=1.06, fol_lift=0.15, bark_gain=0.94, bark_lift=0.12,
            crease_dz=4.5, crease_drop=2, shadow_gain=0.62, shadow_levels=4)


def shade_to_rgba(A, Lm, Mm, Dm, Sm, with_shadow=True, T=None):
    T = dict(TONE, **(T or {}))
    NB = 8
    # a background pixel ringed by opaque neighbours is a one-pixel pinhole
    # between two lobes; fill it as a deep crease rather than ship speckle
    p = np.zeros((CANVAS + 2, CANVAS + 2), dtype=bool)
    p[1:-1, 1:-1] = A
    ring = (p[0:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, 0:-2] & p[1:-1, 2:])
    fill = (~A) & ring
    if fill.any():
        A = A | fill
        Lm = np.where(fill, 0.0, Lm)
        Mm = np.where(fill, np.roll(Mm, 1, axis=0), Mm)
        Dm = np.where(fill, np.roll(Dm, 1, axis=0), Dm)

    x = np.clip((Lm - T["lo"]) / (T["hi"] - T["lo"]), 0.0, 1.0) ** T["gam"]
    foliage = Mm > 0.5
    x = np.where(foliage, x * T["fol_gain"] + T["fol_lift"],
                 x * T["bark_gain"] + T["bark_lift"])
    idx = np.clip((np.clip(x, 0, 0.9999) * NB).astype(np.int32), 0, NB - 1)

    # --- selective outline ------------------------------------------------
    pad = np.zeros((CANVAS + 2, CANVAS + 2), dtype=bool)
    pad[1:-1, 1:-1] = A
    edge = A & ~(pad[0:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, 0:-2] & pad[1:-1, 2:])
    idx = np.where(edge, 0, idx)

    # --- interior depth-discontinuity crease ------------------------------
    dp = np.full((CANVAS + 2, CANVAS + 2), -1e9)
    dp[1:-1, 1:-1] = np.where(A, Dm, -1e9)
    behind = np.zeros_like(A)
    for (dy, dx) in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nb = dp[1 + dy:CANVAS + 1 + dy, 1 + dx:CANVAS + 1 + dx]
        behind |= A & (nb > -1e8) & ((np.where(A, Dm, 0) - nb) > T["crease_dz"])
    idx = np.where(behind & ~edge, np.maximum(idx - T["crease_drop"], 0), idx)

    rgb = np.zeros((CANVAS, CANVAS, 3), dtype=np.uint8)
    pb = np.array(BARK, dtype=np.uint8)
    pf = np.array(FOLIAGE, dtype=np.uint8)
    rgb[~foliage] = pb[idx[~foliage]]
    rgb[foliage] = pf[idx[foliage]]
    rgb[edge] = pb[0]          # one warm-dark outline colour for the whole body

    out = np.zeros((CANVAS, CANVAS, 4), dtype=np.uint8)
    out[..., :3] = rgb
    out[..., 3] = np.where(A, 255, 0)

    if with_shadow:
        nl = T["shadow_levels"]
        sa = np.clip(Sm, 0.0, 1.0) * T["shadow_gain"]
        lv = np.clip((sa * nl + 0.5).astype(np.int32), 0, nl)   # banded alpha
        av = (lv * (int(255 * T["shadow_gain"]) // nl)).astype(np.uint8)
        put = (~A) & (av > 0)
        out[put, 0] = SHADOW_RGB[0]
        out[put, 1] = SHADOW_RGB[1]
        out[put, 2] = SHADOW_RGB[2]
        out[put, 3] = av[put]
    return out


# --------------------------------------------------------------------------
# anchoring  (exp-16's rule, so the numbers are comparable)
# --------------------------------------------------------------------------

def measure_anchor(mask):
    ys, xs = np.nonzero(mask)
    if ys.size == 0:
        return None
    gy = int(ys.max())
    band = mask[max(0, gy - 32):max(1, gy - 21), :]
    w = band.sum()
    if w == 0:
        band = mask; w = band.sum()
    cols = np.arange(CANVAS)
    tx = float((band.sum(axis=0) * cols).sum() / max(w, 1))
    return tx, float(gy)


# --------------------------------------------------------------------------
# developmental clock calibration:  make alpha mass geometric in t
# --------------------------------------------------------------------------

def calibrate(branches, balls, nframes, a_lo, a_hi, probes=26, verbose=True):
    xs = np.linspace(a_lo, a_hi, probes)
    ms = []
    for a in xs:
        prims = eval_tree(branches, balls, float(a))
        m = render_alpha_only(prims, ss=1).sum()
        ms.append(float(m))
    ms = np.array(ms)
    ms = np.maximum.accumulate(ms)            # enforce monotone
    m0, m1 = ms[0], ms[-1]
    tgt = m0 * (m1 / m0) ** np.linspace(0, 1, nframes)
    a_of_t = np.interp(tgt, ms, xs)
    if verbose:
        print("  calibration mass probe:", [int(v) for v in ms], flush=True)
        print("  target mass          :", [int(v) for v in tgt])
    return a_of_t, ms, xs, tgt


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frames")
    ap.add_argument("--frames", type=int, default=19)
    ap.add_argument("--seed", type=int, default=20260801)
    ap.add_argument("--ss", type=int, default=2)
    ap.add_argument("--a-lo", type=float, default=0.0)
    ap.add_argument("--a-hi", type=float, default=1.0)
    ap.add_argument("--no-shadow", action="store_true")
    ap.add_argument("--only", type=str, default="")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    branches, balls = build_skeleton(args.seed)
    print(f"skeleton: {len(branches)} branches, {len(balls)} lobes  seed={args.seed}", flush=True)

    t0 = time.time()
    a_of_t, ms, xs, tgt = calibrate(branches, balls, args.frames,
                                    args.a_lo, args.a_hi)
    print(f"  calibrated in {time.time()-t0:.1f}s", flush=True)

    want = None
    if args.only:
        want = set(int(v) for v in args.only.split(","))

    meta = {"canvas": CANVAS, "anchor": list(ANCHOR), "seed": args.seed,
            "pitch_deg": PITCH_DEG, "ss": args.ss,
            "light": [round(float(v), 4) for v in LIGHT],
            "a_of_t": [round(float(v), 6) for v in a_of_t],
            "frames": []}

    for i in range(args.frames):
        if want is not None and i not in want:
            continue
        t = i / (args.frames - 1)
        a = float(a_of_t[i])
        prims = eval_tree(branches, balls, a)
        # cheap silhouette pre-pass to find the ancher correction
        pre = render_alpha_only(prims, ss=1)
        am = measure_anchor(pre)
        shift = (0.0, 0.0)
        if am:
            shift = (am[0] - ANCHOR[0], am[1] - ANCHOR[1])
        A, Lm, Mm, Dm, Sm, cov = render_frame(prims, ss=args.ss, shift=shift,
                                              shadow=not args.no_shadow)
        # residual integer correction
        am2 = measure_anchor(A)
        if am2:
            dx = int(round(ANCHOR[0] - am2[0])); dy = int(round(ANCHOR[1] - am2[1]))
            if dx or dy:
                A = np.roll(np.roll(A, dy, axis=0), dx, axis=1)
                Lm = np.roll(np.roll(Lm, dy, axis=0), dx, axis=1)
                Mm = np.roll(np.roll(Mm, dy, axis=0), dx, axis=1)
                Dm = np.roll(np.roll(Dm, dy, axis=0), dx, axis=1)
                Sm = np.roll(np.roll(Sm, dy, axis=0), dx, axis=1)
        rgba = shade_to_rgba(A, Lm, Mm, Dm, Sm, with_shadow=not args.no_shadow)
        p = os.path.join(args.out, f"frame-{i:02d}.png")
        Image.fromarray(rgba, "RGBA").save(p, optimize=True)
        anc = measure_anchor(A)
        ys, xs_ = np.nonzero(A)
        meta["frames"].append({
            "i": i, "t": round(t, 6), "a": round(a, 6),
            "alpha_px": int(A.sum()),
            "bbox": [int(xs_.min()), int(ys.min()),
                     int(xs_.max() - xs_.min() + 1), int(ys.max() - ys.min() + 1)],
            "anchor": [round(anc[0], 3), anc[1]],
            "bytes": os.path.getsize(p),
        })
        print(f"  frame {i:02d} t={t:.3f} a={a:.4f} alpha={int(A.sum())} "
              f"anchor=({anc[0]:.2f},{anc[1]:.0f}) {time.time()-t0:.0f}s", flush=True)

    with open(os.path.join(args.out, "registration.json"), "w") as f:
        json.dump(meta, f, indent=1)
    print(f"done in {time.time()-t0:.1f}s -> {args.out}")


if __name__ == "__main__":
    main()
