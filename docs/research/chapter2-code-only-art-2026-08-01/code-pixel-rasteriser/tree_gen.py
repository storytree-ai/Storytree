#!/usr/bin/env python3
"""
code-pixel-rasteriser -- a deterministic, model-free PIXEL-ART tree growth track.

Round 4 / track B2.  NO generative model of any kind is used.  Every pixel below is
computed by this file.  The only thing taken from elsewhere is a PALETTE: the 17
colours used here are a strict subset of the 32-colour palette that exp-16 shipped
(which was itself tuned against the real SVG island plate).  `verify_palette.py`
proves the subset relation.

Contract (round-4 brief section 4):
  128x128 transparent RGBA8, ground contact anchored at (64, 122), 19 frames 00..18,
  one growth parameter t in [0,1] driving everything, byte-identical on re-run.

Reproduce:
  python tree_gen.py

Design notes (the "why it is not vector clipart" list) are in README.md section 3.
"""

import hashlib
import json
import math
import os
import sys

from PIL import Image

# --------------------------------------------------------------------------------------
# contract constants
# --------------------------------------------------------------------------------------

W = H = 128
ANCHOR_X, ANCHOR_Y = 64, 122          # ground contact
NFRAMES = 19
SEED = 20260801

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES_DIR = os.path.join(HERE, "frames")

# --------------------------------------------------------------------------------------
# palette -- every entry is a colour that exp-16's delivered track already contains.
# Ramps run DARK -> LIGHT.  Provenance for each is in README.md section 2.
# --------------------------------------------------------------------------------------

FOLIAGE = [(94, 110, 65), (101, 118, 65), (121, 141, 83),
           (135, 148, 89), (173, 167, 114)]
#          5e6e41         657641           798d53
#          879459         ada772
# bbb27d is exp-16's rarest colour (59 px in the entire 19-frame track), so it is not a
# band -- it is a specular, spent only where the lobe normal points straight at the light.
FOL_SPEC = (187, 178, 125)

BARK = [(87, 54, 33), (102, 64, 39), (114, 73, 45),
        (125, 82, 49), (133, 97, 58), (151, 113, 74)]
#       573621        664027         72492d
#       7d5231        85613a         97714a

# outline triplets: (soft = top-facing rim, hard = side rim, deep = down-facing rim).
# The three-way split is not a stylistic guess -- it is measured off exp-16.  See README 2.
FOL_OUT = ((92, 90, 46), (86, 73, 39), (84, 68, 42))       # 5c5a2e / 564927 / 54442a
BARK_OUT = ((83, 50, 32), (73, 44, 28), (73, 44, 28))      # 533220 / 492c1c / 492c1c

MAT_EMPTY, MAT_BARK, MAT_FOLIAGE = 0, 1, 2

# One global size dial, tuned so the MATURE bbox lands on exp-16's (95 x 112).
GEOM = 0.815

# Light direction.  Read off exp-16 twice: (a) its rim-luminance-by-outward-normal table
# says the light is above with a slight LEFT bias; (b) its lobe highlight CORES sit near
# the middle of each lobe, not on its upper rim -- which only happens if the light is
# largely frontal.  A grazing light gives the flat, coreless lobes the first attempt had.
_LL = math.sqrt(0.28 ** 2 + 0.55 ** 2 + 0.79 ** 2)
LX, LY, LZ = -0.28 / _LL, -0.55 / _LL, 0.79 / _LL
# The shade curve is tuned so FOLIAGE MEAN LUMINANCE lands on exp-16's measured 119-130,
# not so it "looks lit".  work/tone_check.py reports the number.
AMB, GAIN = 0.060, 0.940
GAMMA_FOL, GAMMA_BARK = 1.15, 1.55


# --------------------------------------------------------------------------------------
# deterministic primitives -- integer hashing only, no float hashing, no library RNG
# --------------------------------------------------------------------------------------

M64 = 0xFFFFFFFFFFFFFFFF


class Rng:
    """splitmix64. Deterministic on every platform and Python build."""

    __slots__ = ("s",)

    def __init__(self, seed):
        self.s = seed & M64

    def u64(self):
        self.s = (self.s + 0x9E3779B97F4A7C15) & M64
        z = self.s
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & M64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & M64
        return (z ^ (z >> 31)) & M64

    def f(self):
        return (self.u64() >> 11) * (1.0 / 9007199254740992.0)

    def r(self, a, b):
        return a + (b - a) * self.f()


def _h2(ix, iy, salt):
    n = (ix * 0x27D4EB2D) & 0xFFFFFFFF
    n = (n ^ (iy * 0x165667B1)) & 0xFFFFFFFF
    n = (n ^ (salt * 0x9E3779B1)) & 0xFFFFFFFF
    n = ((n ^ (n >> 15)) * 0x2C1B3C6D) & 0xFFFFFFFF
    n = ((n ^ (n >> 12)) * 0x297A2D39) & 0xFFFFFFFF
    n = (n ^ (n >> 15)) & 0xFFFFFFFF
    return (n & 0xFFFFFF) / 16777215.0


def vnoise(x, y, salt):
    """Smooth value noise in [0,1] on an integer lattice."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    a = _h2(ix, iy, salt)
    b = _h2(ix + 1, iy, salt)
    c = _h2(ix, iy + 1, salt)
    d = _h2(ix + 1, iy + 1, salt)
    top = a + (b - a) * sx
    bot = c + (d - c) * sx
    return top + (bot - top) * sy


def smoothstep(a, b, x):
    if b <= a:
        return 1.0 if x >= b else 0.0
    u = (x - a) / (b - a)
    if u <= 0.0:
        return 0.0
    if u >= 1.0:
        return 1.0
    return u * u * (3.0 - 2.0 * u)


def clamp(v, a=0.0, b=1.0):
    return a if v < a else (b if v > b else v)


def lramp(a, b, x):
    """LINEAR birth ramp.

    smoothstep was the obvious choice and it is the wrong one here.  Its derivative
    peaks at the middle of its window, and because every element's window straddles
    mid-track, all those peaks land on the same two frames -- measured as a +34% mass
    step at frame 10 with everything else already flat.  A linear ramp has a constant
    derivative, so the contributions superpose into a smooth curve.  The corner at each
    window's ends is a sub-pixel event at this scale; the mid-window pile-up is not.
    """
    if b <= a:
        return 1.0 if x >= b else 0.0
    return clamp((x - a) / (b - a))


# --------------------------------------------------------------------------------------
# skeleton -- built ONCE from the seed.  Topology never changes across the track;
# only each element's realised extent moves with t.  That is what makes the growth
# continuous by construction rather than by luck.
# --------------------------------------------------------------------------------------

DEG = math.pi / 180.0


class Branch:
    __slots__ = ("idx", "parent", "s0", "ang", "length", "curve", "w0", "wtip",
                 "taper", "tb", "tw", "z", "kind", "flare", "seam")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


class Site:
    """A canopy site: born as an ovate leaf, morphs continuously into a crown lobe."""

    __slots__ = ("idx", "branch", "s0", "off", "psi", "r_leaf", "r_lobe",
                 "tb", "tw", "tm0", "tm1", "td", "tdw", "z", "harm", "tone")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def build_skeleton(seed=SEED):
    rng = Rng(seed)
    br, si = [], []

    def add_branch(**kw):
        kw.setdefault("curve", 0.0)
        kw.setdefault("wtip", 0.9)
        kw.setdefault("taper", 1.0)
        kw.setdefault("flare", 0.0)
        kw.setdefault("seam", 0)
        kw["idx"] = len(br)
        br.append(Branch(**kw))
        return kw["idx"]

    def add_site(**kw):
        kw.setdefault("td", 9.0)
        kw.setdefault("tdw", 0.1)
        kw.setdefault("off", 0.0)
        kw["harm"] = tuple((rng.r(0.035, 0.105), rng.r(0, 2 * math.pi)) for _ in range(4))
        kw["tone"] = rng.r(-0.075, 0.075)
        kw["idx"] = len(si)
        si.append(Site(**kw))
        return kw["idx"]

    ALWAYS = dict(tb=-1.0, tw=0.5)   # present at t=0; extent then rides stem/girth scale

    # ---- trunk (the clear bole) ------------------------------------------------------
    trunk = add_branch(parent=-1, s0=0.0, ang=-90 * DEG + rng.r(-0.03, 0.03), length=57.0,
                       curve=rng.r(0.0012, 0.0032), w0=16.4, wtip=1.62, taper=0.55,
                       z=0.0, kind="trunk", flare=6.2, seam=4, **ALWAYS)

    # ---- roots: BUTTRESSES, not surface hairs.  They peel off the bole well ABOVE the
    # ground (s0 up to 0.30 = ~14 px up) and sweep DOWN and OUT to the ground line,
    # curving toward horizontal as they descend.  The first pass grew them sideways out
    # of the base and got a flat smear; exp-16's flare is the tree's best feature and it
    # is entirely a matter of where the roots START.
    #  (s0 along the bole, angle relative to the trunk axis, length, width frac, early?)
    root_specs = [(0.32, -127, 32, 0.62, 1), (0.32, 129, 32, 0.62, 1),
                  (0.19, -141, 28, 0.55, 1), (0.19, 144, 28, 0.55, 1),
                  (0.07, -159, 24, 0.46, 1), (0.07, 161, 24, 0.46, 1),
                  (0.26, -112, 27, 0.42, 0), (0.26, 115, 27, 0.42, 0),
                  (0.13, -150, 20, 0.34, 0), (0.13, 152, 20, 0.34, 0),
                  (0.02, -172, 16, 0.28, 0), (0.02, 174, 16, 0.28, 0)]
    for (s0, a, L, wf, early) in root_specs:
        kw = dict(ALWAYS) if early else dict(tb=0.08, tw=0.66)
        # curve bends the root back toward horizontal as it descends
        cv = (0.017 if a < 0 else -0.017) * rng.r(0.75, 1.25)
        add_branch(parent=trunk, s0=s0, ang=a * DEG, length=L, curve=cv, seam=2,
                   w0=wf, wtip=0.66, taper=0.62, z=-2.4 + rng.r(-0.3, 0.3),
                   kind="root", **kw)

    # ---- the central leader: present from t=0, so the sprout is trunk+leader ---------
    leader = add_branch(parent=trunk, s0=1.0, ang=rng.r(-6, 6) * DEG, length=36.0,
                        curve=rng.r(-0.004, 0.004), w0=0.86, wtip=0.90, taper=0.95, seam=2,
                        z=0.05, kind="branch", **ALWAYS)

    # ---- cotyledons: the two seed leaves. Present at t=0, shed as the whip leafs up ---
    for sgn in (-1, 1):
        add_site(branch=leader, s0=1.0, off=1.8, psi=(-90 + sgn * 70) * DEG,
                 r_leaf=14.8, r_lobe=14.8, tb=-1.0, tw=0.5, tm0=9.0, tm1=9.1,
                 td=0.16, tdw=0.30, z=0.35 * sgn)

    # ---- whip leaves on trunk + leader: unfold along the stem, shed under the crown ---
    whip = [(trunk, 0.52, 1, 0.015), (trunk, 0.66, -1, 0.035), (trunk, 0.79, 1, 0.060),
            (trunk, 0.90, -1, 0.085), (leader, 0.06, 1, 0.110), (leader, 0.26, -1, 0.135),
            (leader, 0.45, 1, 0.160), (leader, 0.63, -1, 0.185), (leader, 0.81, 1, 0.210),
            (leader, 0.97, -1, 0.235)]
    for k, (b, s0, sgn, tb) in enumerate(whip):
        add_site(branch=b, s0=s0, off=4.6,
                 psi=(-90 + sgn * rng.r(54, 84)) * DEG,
                 r_leaf=rng.r(8.2, 10.4), r_lobe=rng.r(8.8, 11.0),
                 tb=tb, tw=0.22, tm0=0.40, tm1=0.74,
                 # shed in left/right PAIRS so the silhouette never goes lopsided
                 td=0.50 + 0.026 * (k // 2), tdw=0.24, z=rng.r(-0.5, 0.5))

    # ---- scaffold: leaders -> branches -> twigs, each carrying a lobe cluster ---------
    # Leaders attach in the TOP quarter of the bole, so the crown sits on a clear trunk
    # the way exp-16's does (its crown bottom is y=72 over a 50 px visible bole).
    # Left/right pairs are born within 0.02 of each other -- an unpaired leader is what
    # made the mid-track silhouette lean, and the anchor metric picked it up as 12 px.
    leader_specs = [(-37, 41.0, 0.770, 0.105, -0.80),
                    (33, 39.5, 0.840, 0.125, 0.85),
                    (-17, 37.0, 0.915, 0.190, -0.30),
                    (20, 34.0, 0.975, 0.210, 0.40)]
    scaffold = []
    for (a, L, s0, tb, z) in leader_specs:
        b = add_branch(parent=trunk, s0=s0, ang=a * DEG + rng.r(-0.05, 0.05), length=L,
                       curve=(-1 if a < 0 else 1) * rng.r(0.009, 0.016),
                       w0=0.74, wtip=0.72, taper=0.95, tb=tb, tw=0.44, z=z, kind="branch", seam=2)
        scaffold.append((b, tb, z))
    for (a, L, s0, tb, z) in [(-23, 26.0, 0.52, 0.160, -0.35), (24, 25.0, 0.80, 0.175, 0.45)]:
        b = add_branch(parent=leader, s0=s0, ang=a * DEG + rng.r(-0.05, 0.05), length=L,
                       curve=(-1 if a < 0 else 1) * rng.r(0.009, 0.017),
                       w0=0.76, wtip=0.72, taper=0.95, tb=tb, tw=0.44, z=z, kind="branch")
        scaffold.append((b, tb, z))

    order2 = []
    for li, (b, tb, z) in enumerate(scaffold):
        # Alternate which SIDE forks first per leader.  When every leader forked left
        # first the whole mid-track crown leaned left and the anchor metric read it as
        # a 6 px drift on a tree whose base had not moved a pixel.
        plan = [(0.48, -1), (0.76, 1), (1.0, 0)] if li % 2 == 0 else \
               [(0.48, 1), (0.76, -1), (1.0, 0)]
        for k, (s0, sgn) in enumerate(plan):
            a = sgn * rng.r(22, 40) * DEG + (0 if sgn else rng.r(-12, 12) * DEG)
            tb2 = tb + 0.075 + 0.040 * k
            c = add_branch(parent=b, s0=s0, ang=a, length=rng.r(12.5, 19.0),
                           curve=rng.r(-0.012, 0.012), w0=0.72, wtip=0.66, taper=1.0,
                           tb=tb2, tw=0.44, z=z + rng.r(-0.28, 0.28), kind="branch")
            order2.append((c, tb2, z + rng.r(-0.25, 0.25)))

    # Crown lobes.  1-2 per order-2 tip -- measured against exp-16, whose mature crown
    # reads as ~20 lobes of r 11-16, not ~50 of r 10; the smaller count is what stops
    # the crown reading as cobblestones.
    #
    # Birth times are then EVENLY SPREAD over t 0.20 -> 0.80 in botanical order (a tip
    # whose branch appeared earlier leafs earlier).  Deriving tb from the parent chain
    # instead bunched every lobe into t 0.27-0.58 and produced a +42% mass step at
    # frame 10 with three dead frames at the end.  An even spread is the whole point of
    # having a continuous growth parameter; not using it was leaving the win on the table.
    pend = []
    for (b, tb, z) in order2:
        n = 2 + (1 if rng.f() < 0.80 else 0)
        for k in range(n):
            pend.append((tb + 0.11 * k, dict(
                branch=b, s0=rng.r(0.66, 1.02), off=rng.r(0.8, 2.8),
                psi=rng.r(-152, -28) * DEG,
                r_leaf=rng.r(4.4, 6.0),
                r_lobe=rng.r(12.4, 17.4) * (1.16 if k == 0 else (0.92 if k == 1 else 0.70)),
                z=z + rng.r(-0.30, 0.30) + 0.22)))
        # one skirt lobe tucked under the branch -- exp-16's crown has these, but its
        # crown floor is flat: they sit UNDER the branch, they do not hang off it.
        if rng.f() < 0.42:
            pend.append((tb + 0.22, dict(
                branch=b, s0=rng.r(0.40, 0.72), off=rng.r(1.0, 2.4),
                psi=rng.r(-244, -206) * DEG,
                r_leaf=rng.r(3.6, 5.2), r_lobe=rng.r(6.4, 9.0),
                z=z + rng.r(-0.35, 0.35) - 0.30)))

    pend.sort(key=lambda p: p[0])
    T0, T1, TW = 0.150, 0.800, 0.74
    for i, (_ord, kw) in enumerate(pend):
        tb = T0 + (T1 - T0) * (i / max(1, len(pend) - 1))
        add_site(tb=tb, tw=TW, tm0=tb + 0.02, tm1=tb + 0.44, **kw)

    return br, si


BRANCHES, SITES = build_skeleton(SEED)


# --------------------------------------------------------------------------------------
# per-frame realisation of the skeleton
# --------------------------------------------------------------------------------------

def stem_scale(t):
    """Global elongation of the whole stem system: sprout -> mature."""
    return GEOM * (0.640 + 0.360 * lramp(0.0, 0.94, t))


def girth_scale(t):
    """Thickening lags elongation, as it does in a real stem."""
    return GEOM * (0.330 + 0.670 * smoothstep(0.0, 1.0, t) ** 0.62)


def realise(t):
    """Return {branch idx: (points, widths)} for this t, plus the site placements."""
    gs = girth_scale(t)
    ss = stem_scale(t)
    out = {}
    order = sorted(range(len(BRANCHES)), key=lambda i: (BRANCHES[i].parent, i))
    for i in order:
        b = BRANCHES[i]
        grow = lramp(b.tb, b.tb + b.tw, t)
        if grow <= 0.0:
            continue
        if b.parent < 0:
            base = (float(ANCHOR_X), float(ANCHOR_Y))
            base_ang = b.ang
            pw = None
        else:
            par = out.get(b.parent)
            if par is None:
                continue
            ppts, pws = par
            n = len(ppts) - 1
            fs = clamp(b.s0) * n
            k = min(int(fs), n - 1)
            fr = fs - k
            base = (ppts[k][0] + (ppts[k + 1][0] - ppts[k][0]) * fr,
                    ppts[k][1] + (ppts[k + 1][1] - ppts[k][1]) * fr)
            base_ang = math.atan2(ppts[k + 1][1] - ppts[k][1], ppts[k + 1][0] - ppts[k][0])
            pw = pws[k] + (pws[k + 1] - pws[k]) * fr

        length = b.length * grow * ss
        if length < 0.55:
            continue
        w0 = (b.w0 * gs) if pw is None else max(0.95, pw * b.w0)
        w0 = max(0.95, w0)
        wt = max(0.95, w0 * b.wtip * 0.42)

        nseg = max(3, min(26, int(length / 2.2) + 2))
        pts, wid = [base], [w0]
        a = base_ang + (b.ang if b.parent >= 0 else 0.0)
        step = length / nseg
        x, y = base
        for k in range(nseg):
            a += b.curve * step
            x += math.cos(a) * step
            y += math.sin(a) * step
            if b.kind == "root":
                y = min(y, ANCHOR_Y + 0.4)
            pts.append((x, y))
            u = (k + 1) / nseg
            wu = wt + (w0 - wt) * ((1.0 - u) ** b.taper)
            if b.flare:
                wu += b.flare * gs * math.exp(-u * 6.5)
            wid.append(max(0.95, wu))
        if b.flare:
            wid[0] = max(wid[0], w0 + b.flare * gs)
        out[i] = (pts, wid)
    return out


def site_state(s, t, real):
    """Return (cx, cy, radius, morph, alive) or None."""
    grow = lramp(s.tb, s.tb + s.tw, t)
    if grow <= 0.0:
        return None
    die = lramp(s.td, s.td + s.tdw, t)
    live = grow * (1.0 - die)
    if live <= 0.02:
        return None
    par = real.get(s.branch)
    if par is None:
        return None
    pts, _ = par
    n = len(pts) - 1
    fs = clamp(s.s0) * n
    k = min(int(fs), n - 1)
    fr = fs - k
    bx = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * fr
    by = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * fr
    m = smoothstep(s.tm0, s.tm1, t)
    # radius rides sqrt(live), NOT live: a lobe's contribution to the silhouette is its
    # AREA, so a linear radius ramp makes mass grow quadratically and the whole crown
    # arrives in a rush (measured: +47% at frame 9).  sqrt makes area linear in the ramp.
    rs = math.sqrt(live)
    r = (s.r_leaf + (s.r_lobe - s.r_leaf) * m) * rs * GEOM
    off = s.off * rs * GEOM
    cx = bx + math.cos(s.psi) * (off + r * (0.52 * (1.0 - m)))
    cy = by + math.sin(s.psi) * (off + r * (0.52 * (1.0 - m)))
    return cx, cy, r, m, live


# --------------------------------------------------------------------------------------
# the rasteriser -- pixel centres only, no supersampling, no antialiasing.
# --------------------------------------------------------------------------------------

def site_profile(s, th, m):
    """Radius multiplier at angle th: continuous blend of an ovate leaf and a lumpy lobe."""
    # leaf: ellipse (a:b = 2.55) skewed forward into a teardrop along psi
    u = th - s.psi
    ca, sa = math.cos(u), math.sin(u)
    a, b = 1.0, 0.395
    ell = a * b / math.sqrt((b * ca) ** 2 + (a * sa) ** 2)
    leaf = ell * (1.0 + 0.26 * ca)
    # lobe: a circle roughened by four seeded harmonics -> lumpy, never a vector disc
    lobe = 1.0
    for k, (amp, ph) in enumerate(s.harm):
        lobe += amp * math.cos((k + 2) * th + ph)
    return leaf + (lobe - leaf) * m


def render(t, seed=SEED):
    real = realise(t)

    mat = bytearray(W * H)
    shd = [0.0] * (W * H)
    eid = [-1] * (W * H)
    por = [-1] * (W * H)
    vein = [0.0] * (W * H)
    spc = bytearray(W * H)
    thin = bytearray(W * H)

    # ---- depth-sorted paint list ----------------------------------------------------
    jobs = []
    for i, b in enumerate(BRANCHES):
        if i in real:
            jobs.append((b.z, "b", i))
    live_sites = []
    for s in SITES:
        st = site_state(s, t, real)
        if st is not None:
            live_sites.append((s, st))
            jobs.append((s.z, "s", s.idx))
    jobs.sort(key=lambda j: j[0])
    site_by_idx = {s.idx: (s, st) for s, st in live_sites}

    for po, (_z, kind, idx) in enumerate(jobs):
        eslot = (1000 + idx) if kind == "s" else idx

        if kind == "b":
            b = BRANCHES[idx]
            pts, wid = real[idx]
            for k in range(len(pts) - 1):
                x0, y0 = pts[k]
                x1, y1 = pts[k + 1]
                w0, w1 = wid[k], wid[k + 1]
                hw = max(w0, w1) * 0.5
                dx, dy = x1 - x0, y1 - y0
                seg2 = dx * dx + dy * dy
                if seg2 < 1e-9:
                    seg2 = 1e-9
                sl = math.sqrt(seg2)
                px_, py_ = -dy / sl, dx / sl
                xa = max(0, int(math.floor(min(x0, x1) - hw - 1)))
                xb = min(W - 1, int(math.ceil(max(x0, x1) + hw + 1)))
                ya = max(0, int(math.floor(min(y0, y1) - hw - 1)))
                # HARD ground clip: the contract anchors ground contact at y=122, so no
                # pixel may sit below it.  Root flare and buttress are clipped, not offset.
                yb = min(ANCHOR_Y, int(math.ceil(max(y0, y1) + hw + 1)))
                for yy in range(ya, yb + 1):
                    cy = yy + 0.5
                    row = yy * W
                    for xx in range(xa, xb + 1):
                        cx = xx + 0.5
                        u = ((cx - x0) * dx + (cy - y0) * dy) / seg2
                        u = clamp(u)
                        qx = x0 + dx * u
                        qy = y0 + dy * u
                        ddx, ddy = cx - qx, cy - qy
                        dist = math.hypot(ddx, ddy)
                        halfw = (w0 + (w1 - w0) * u) * 0.5
                        if dist > max(halfw, 0.52):
                            continue
                        if halfw < 1.15:
                            sh = 0.30
                        else:
                            dn = clamp((ddx * px_ + ddy * py_) / halfw, -1.0, 1.0)
                            nz = math.sqrt(max(0.0, 1.0 - dn * dn))
                            lam = px_ * dn * LX + py_ * dn * LY + nz * LZ
                            sh = AMB + GAIN * (max(0.0, lam) ** GAMMA_BARK)
                            # bark streaks: quantised bands running ALONG the branch,
                            # not a smooth cylinder ramp.  This is the single biggest
                            # difference between "pixel bark" and "vector cylinder".
                            band = math.floor((dn * 0.5 + 0.5) * 5.0)
                            sh += (_h2(int(band), idx * 7 + 3, 991) - 0.5) * 0.15
                            sh += (vnoise(qx * 0.50, qy * 0.26, idx * 13 + 5) - 0.5) * 0.14
                        if b.seam and halfw > 1.9:
                            # BUTTRESS FLUTING.  exp-16's trunk is not a cylinder: it is
                            # a bundle of vertical ridges with dark grooves between them,
                            # running the FULL height and continuing into the root legs.
                            # Modelled as a periodic term across the branch's width, so
                            # the ridges follow the taper and the curve for free.
                            fade = 0.42 + 0.58 * math.exp(-max(0.0, ANCHOR_Y - qy) / 34.0)
                            u = dn * 0.5 + 0.5
                            u += 0.085 * math.sin(2.0 * math.pi * u + 1.9)
                            g = math.cos(2.0 * math.pi * b.seam * u + 0.55)
                            sh += 0.300 * fade * (g - 0.90 * max(0.0, -g))
                        if b.kind == "root":
                            sh -= 0.04
                        mat[row + xx] = MAT_BARK
                        shd[row + xx] = sh
                        eid[row + xx] = eslot
                        por[row + xx] = po
                        vein[row + xx] = 0.0
                        spc[row + xx] = 0
                        thin[row + xx] = 1 if halfw < 1.7 else 0
        else:
            s, (cx, cy, r, m, live) = site_by_idx[idx]
            if r < 0.55:
                continue
            rmax = r * 1.45
            xa = max(0, int(math.floor(cx - rmax)))
            xb = min(W - 1, int(math.ceil(cx + rmax)))
            ya = max(0, int(math.floor(cy - rmax)))
            yb = min(ANCHOR_Y, int(math.ceil(cy + rmax)))
            for yy in range(ya, yb + 1):
                py = yy + 0.5 - cy
                row = yy * W
                for xx in range(xa, xb + 1):
                    px = xx + 0.5 - cx
                    rr = math.hypot(px, py)
                    if rr > rmax:
                        continue
                    th = math.atan2(py, px)
                    R = r * site_profile(s, th, m)
                    if R <= 0.35 or rr > max(R, 0.5):
                        continue
                    q = clamp(rr / R if R > 0 else 0.0, 0.0, 1.0)
                    nz = math.sqrt(max(0.0, 1.0 - q * q))
                    nx = q * math.cos(th)
                    ny = q * math.sin(th)
                    lam = nx * LX + ny * LY + nz * LZ
                    sh = AMB + GAIN * (max(0.0, lam) ** GAMMA_FOL)
                    sh += s.tone
                    spec = 1 if (lam > 0.982 and q < 0.78) else 0
                    sh += (vnoise((xx + cx) * 0.42, (yy + cy) * 0.42, s.idx * 17 + 71) - 0.5) * 0.115
                    sh += (vnoise(xx * 1.25, yy * 1.25, s.idx * 29 + 13) - 0.5) * 0.055
                    v = 0.0
                    if m < 0.62:
                        # leaf midrib: a pale vein along the long axis, fading as the
                        # leaf rounds into a lobe
                        ax, ay = math.cos(s.psi), math.sin(s.psi)
                        perp = abs(px * (-ay) + py * ax)
                        along = px * ax + py * ay
                        if along > -R * 0.55:
                            v = (1.0 - m / 0.62) * max(0.0, 1.0 - perp / 1.25) * 0.24
                    mat[row + xx] = MAT_FOLIAGE
                    shd[row + xx] = sh
                    eid[row + xx] = eslot
                    por[row + xx] = po
                    vein[row + xx] = v
                    spc[row + xx] = spec
                    thin[row + xx] = 0

    # ---- occlusion / contact darkening ----------------------------------------------
    # Where an element in FRONT abuts one behind, the one behind takes a dark crescent.
    # This is what turns a pile of discs into readable overlapping lobes.
    R1 = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1))
    R2 = ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -1), (2, -1), (-2, 1), (2, 1),
          (-1, -2), (1, -2), (-1, 2), (1, 2))
    occ = [0.0] * (W * H)
    for yy in range(H):
        row = yy * W
        for xx in range(W):
            p = row + xx
            if not mat[p]:
                continue
            o, e = por[p], eid[p]
            # Bark abutting bark gets a much lighter contact than foliage abutting
            # foliage.  At full strength a buttress crossing the bole painted a 3 px
            # dark BELT right across the trunk; exp-16's root ridges are 1 px grooves.
            bark = mat[p] == MAT_BARK
            best = 0.0
            for dx, dy in R1:
                nx2, ny2 = xx + dx, yy + dy
                if 0 <= nx2 < W and 0 <= ny2 < H:
                    q = ny2 * W + nx2
                    if mat[q] and eid[q] != e and por[q] > o:
                        best = max(best, 0.42 if (bark and mat[q] == MAT_BARK) else 1.0)
            if best < 1.0 and not bark:
                for dx, dy in R2:
                    nx2, ny2 = xx + dx, yy + dy
                    if 0 <= nx2 < W and 0 <= ny2 < H:
                        q = ny2 * W + nx2
                        if mat[q] and eid[q] != e and por[q] > o:
                            best = max(best, 0.32)
            occ[p] = best

    # crown-wide vertical value ramp (measured on exp-16: ~-20 luma crown top -> bottom)
    fys = [yy for yy in range(H) for xx in range(W) if mat[yy * W + xx] == MAT_FOLIAGE]
    if fys:
        ftop, fbot = min(fys), max(fys)
    else:
        ftop, fbot = 0, 1
    fspan = max(1.0, float(fbot - ftop))

    for yy in range(H):
        row = yy * W
        for xx in range(W):
            p = row + xx
            if not mat[p]:
                continue
            sh = shd[p] - occ[p] * 0.50 + vein[p]
            if mat[p] == MAT_FOLIAGE:
                # crown-wide ramp, signed about the crown midline
                sh += 0.055 * (1.0 - 2.0 * ((yy - ftop) / fspan))
            # ground contact darkening -- the one cue round 3 found EVERY track missing
            if yy > ANCHOR_Y - 5:
                sh -= 0.26 * ((yy - (ANCHOR_Y - 5)) / 5.0)
            shd[p] = sh

    # ---- quantise + selective outline ------------------------------------------------
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = out.load()
    nf, nb = len(FOLIAGE), len(BARK)
    for yy in range(H):
        row = yy * W
        for xx in range(W):
            p = row + xx
            if not mat[p]:
                continue
            # silhouette rim?  outward normal from the transparent 4-neighbours
            ex = ey = 0
            n_up = n_dn = 0
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                nx2, ny2 = xx + dx, yy + dy
                if not (0 <= nx2 < W and 0 <= ny2 < H) or not mat[ny2 * W + nx2]:
                    ex += dx
                    ey += dy
                    if dy < 0:
                        n_up = 1
                    if dy > 0:
                        n_dn = 1
            outset = FOL_OUT if mat[p] == MAT_FOLIAGE else BARK_OUT
            # A twig 1-2 px wide is ALL rim.  Outlining it paints the whole twig near
            # black; exp-16's twigs read as mid brown.  So thin bark is exempt from the
            # silhouette rule and keeps its band colour.
            if (ex or ey) and not thin[p]:
                if n_up and not n_dn and ex == 0:
                    c = outset[0]          # top-facing -> soft outline
                elif n_dn and abs(ey) >= abs(ex):
                    c = outset[2]          # down-facing -> deepest
                else:
                    c = outset[1]          # side / diagonal -> hard
                px[xx, yy] = (c[0], c[1], c[2], 255)
                continue
            sh = shd[p]
            if sh < -0.200:
                c = outset[1]          # occluded hard -> the internal separation line
            elif sh < -0.060:
                c = outset[0]          # occluded soft -> the broken half of that line
            elif spc[p] and sh > 0.90:
                c = FOL_SPEC           # rare specular
            else:
                ramp = FOLIAGE if mat[p] == MAT_FOLIAGE else BARK
                n = nf if mat[p] == MAT_FOLIAGE else nb
                lvl = clamp(sh) * (n - 1)
                c = ramp[int(lvl + 0.5)]
            px[xx, yy] = (c[0], c[1], c[2], 255)

    # ---- hygiene: keep the body 8-connected (a property of the pipeline, not of luck)
    out = prune_strays(out)
    return out


def prune_strays(im):
    """Delete every 8-connected component that does not contain the bottom-most pixel."""
    px = im.load()
    lab = [-1] * (W * H)
    comps = []
    for yy in range(H):
        for xx in range(W):
            p = yy * W + xx
            if px[xx, yy][3] < 8 or lab[p] >= 0:
                continue
            cid = len(comps)
            stack = [p]
            lab[p] = cid
            cells = []
            while stack:
                q = stack.pop()
                cells.append(q)
                qy, qx = divmod(q, W)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ax, ay = qx + dx, qy + dy
                        if 0 <= ax < W and 0 <= ay < H:
                            r = ay * W + ax
                            if lab[r] < 0 and px[ax, ay][3] >= 8:
                                lab[r] = cid
                                stack.append(r)
            comps.append(cells)
    if len(comps) <= 1:
        return im
    keep = max(range(len(comps)), key=lambda i: max(c // W for c in comps[i]))
    for i, cells in enumerate(comps):
        if i == keep:
            continue
        for q in cells:
            qy, qx = divmod(q, W)
            px[qx, qy] = (0, 0, 0, 0)
    return im


# --------------------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------------------

def frame_t(i):
    """t mapping: linear in frame index.  19 frames -> t = i/18."""
    return i / (NFRAMES - 1)


def main(outdir=FRAMES_DIR):
    os.makedirs(outdir, exist_ok=True)
    digests = []
    for i in range(NFRAMES):
        im = render(frame_t(i))
        path = os.path.join(outdir, f"frame-{i:02d}.png")
        im.save(path, optimize=True)
        with open(path, "rb") as fh:
            digests.append(hashlib.sha256(fh.read()).hexdigest())
        print(f"frame-{i:02d}.png  t={frame_t(i):.4f}  sha256={digests[-1][:16]}")
    meta = {
        "canvas": [W, H],
        "anchor": [ANCHOR_X, ANCHOR_Y],
        "frames": NFRAMES,
        "seed": SEED,
        "t_mapping": "t = i / 18",
        "sha256": digests,
        "track_sha256": hashlib.sha256("".join(digests).encode()).hexdigest(),
    }
    with open(os.path.join(outdir, "registration.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    print("TRACK", meta["track_sha256"])
    return meta


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else FRAMES_DIR)
