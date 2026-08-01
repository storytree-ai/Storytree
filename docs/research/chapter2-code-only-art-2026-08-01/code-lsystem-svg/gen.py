#!/usr/bin/env python3
"""code-lsystem-svg -- a seeded parametric L-system tree, emitted as SVG paths and
rasterised by our own scanline renderer.  No generative model, no vendor call, no
external renderer: every pixel below is computed here.

Reproduce:  python gen.py --all

Contract (round-4 brief section 4):
  * 128x128 RGBA8, ground contact anchored at (64, 122)
  * 19 frames, indices 00..18
  * one growth parameter t in [0,1] drives every frame
  * deterministic from SEED; byte-identical on re-run

Design notes live in README.md.  The two load-bearing ideas:

  1. CONTINUOUS TOPOLOGY.  Branch order n is not "present or absent"; it carries a
     maturity  m_n = clamp(D(t) - n, 0, 1)  which multiplies its length.  A new
     branch order therefore emerges from zero length rather than popping in.  This
     is the thing an L-system is genuinely best at and it is why the adjacent-frame
     IoU floor here is high.

  2. IDENTITY-KEYED NOISE.  Every random-looking quantity is a pure hash of
     (SEED, the branch's address in the tree), never of a draw counter.  If the
     jitter came from a sequential PRNG the whole tree would reshuffle the instant
     t added one branch.  Keying on identity is what makes the tree the *same tree*
     at every t.
"""

import argparse, json, math, os, sys, hashlib
from array import array

BASE = os.path.dirname(os.path.abspath(__file__))
SEED = 0x51075EED                            # 1359085805 -- the one fixed seed
W = H = 128
ANCHOR = (64.0, 122.0)                       # ground contact, per the shared contract
NFRAMES = 19
SS = 4                                       # supersample factor for the rasteriser
ALPHA_CUT = 0.42                             # hard-edge threshold after downsample

# ---------------------------------------------------------------------------
# 1. Palette -- every entry lifted verbatim from exp-16's own 32-colour track
#    (work/sample_palette.py prints the source ranking).  Nothing invented.
# ---------------------------------------------------------------------------
PAL = {
    # canopy, light -> dark
    "canopy_hi":   (173, 167, 114),   # #ada772  exp-16 crown top highlight
    "canopy_lit":  (135, 148,  89),   # #879459  exp-16 dominant canopy colour
    "canopy_mid":  (121, 141,  83),   # #798d53
    "canopy_sha":  (101, 118,  65),   # #657641
    "canopy_deep": ( 92,  90,  46),   # #5c5a2e  crown underside
    "canopy_out":  ( 86,  73,  39),   # #564927  foliage outline (dark olive-brown)
    # young leaves
    "leaf_lit":    (135, 148,  89),   # #879459
    "leaf_mid":    (117, 134,  80),   # #758650
    "leaf_sha":    ( 99, 119,  67),   # #637743
    # bark
    "bark_hi":     (152, 106,  60),   # #986a3c
    "bark_lit":    (133,  97,  58),   # #85613a
    "bark_mid":    (125,  82,  49),   # #7d5231
    "bark_sha":    (114,  73,  45),   # #72492d
    "bark_deep":   ( 87,  54,  33),   # #573621
    "bark_out":    ( 73,  44,  28),   # #492c1c  woody outline
    # roots
    "root_lit":    (145, 108,  67),   # #916c43
    "root_mid":    (125,  94,  55),   # #7d5e37
    "root_sha":    (102,  64,  39),   # #664027
}
PAL_LIST = sorted(set(PAL.values()))

# ---------------------------------------------------------------------------
# 2. Identity-keyed hash noise (pure integer arithmetic -- platform independent)
# ---------------------------------------------------------------------------
M64 = (1 << 64) - 1


def _mix(x):
    x &= M64
    x ^= x >> 30
    x = (x * 0xBF58476D1CE4E5B9) & M64
    x ^= x >> 27
    x = (x * 0x94D049BB133111EB) & M64
    x ^= x >> 31
    return x


def hrand(path, salt=0):
    """Uniform [0,1) keyed by SEED + a branch address + a salt.  Order-free."""
    h = _mix(SEED ^ 0x9E3779B97F4A7C15)
    for v in path:
        h = _mix(h ^ ((int(v) + 0x9E3779B97F4A7C15) & M64))
    h = _mix(h ^ ((int(salt) * 0x100000001B3) & M64))
    return (h >> 11) / float(1 << 53)


def hsym(path, salt=0):
    """Symmetric jitter in [-1,1)."""
    return hrand(path, salt) * 2.0 - 1.0


# ---------------------------------------------------------------------------
# 3. Small maths helpers
# ---------------------------------------------------------------------------
def clamp(v, a=0.0, b=1.0):
    return a if v < a else (b if v > b else v)


def smoothstep(a, b, x):
    if b == a:
        return 0.0 if x < a else 1.0
    u = clamp((x - a) / (b - a))
    return u * u * (3.0 - 2.0 * u)


def lerp(a, b, u):
    return a + (b - a) * u


# ---------------------------------------------------------------------------
# 3b. The growth easing  tau = E(t)
#
# The 19 frames sample t UNIFORMLY (t_i = i/18).  Geometry does not grow
# uniformly in t -- an L-system's mass is roughly exponential in its depth
# budget, and a seedling has a long stretch where little changes.  E(t) is an
# ordinary animation easing curve that re-paces frame time into growth time so
# that each frame advances the silhouette by the SAME amount.  The 19 knots were
# fitted once by work/fit_ease.py (equal arc length in a blend of Jaccard
# distance and log-mass change, over a 61-sample dense grid) and hardcoded here.
#
# It is a monotone piecewise cubic, so it is defined and smooth at EVERY t, not
# just at the 19 sampled ones -- arbitrary in-betweens remain free.
# ---------------------------------------------------------------------------
EASE_X = [0.0, 0.055556, 0.111111, 0.166667, 0.222222, 0.277778, 0.333333,
          0.388889, 0.444444, 0.500000, 0.555556, 0.611111, 0.666667, 0.722222,
          0.777778, 0.833333, 0.888889, 0.944444, 1.0]
EASE_Y = [0.0, 0.030785, 0.118237, 0.150603, 0.173351, 0.199068, 0.233292,
          0.275521, 0.341537, 0.409060, 0.479381, 0.526559, 0.593318, 0.644082,
          0.696215, 0.746928, 0.808836, 0.871648, 1.0]


def _pchip_slopes(xs, ys):
    """Fritsch-Carlson monotone cubic slopes -- guarantees E is non-decreasing,
    so the tree can never shrink between frames because of the easing."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    return m


_EASE_M = _pchip_slopes(EASE_X, EASE_Y)


def ease(t):
    t = clamp(t)
    xs, ys, m = EASE_X, EASE_Y, _EASE_M
    n = len(xs)
    for i in range(n - 1):
        if t <= xs[i + 1] or i == n - 2:
            h = xs[i + 1] - xs[i]
            s = (t - xs[i]) / h
            s2, s3 = s * s, s * s * s
            return ((2 * s3 - 3 * s2 + 1) * ys[i]
                    + (s3 - 2 * s2 + s) * h * m[i]
                    + (-2 * s3 + 3 * s2) * ys[i + 1]
                    + (s3 - s2) * h * m[i + 1])
    return ys[-1]


# ---------------------------------------------------------------------------
# 4. The L-system
#
#    Alphabet (parametric, bracketed):
#       A(n, addr)      apex of branch order n at tree address addr
#       F(pts, w0, w1)  a drawn tapered segment
#       V(addr)         root apex
#       L(addr, ...)    a leaf
#       K(addr, ...)    a canopy lobe (bud)
#       [ ]             push / pop turtle state
#
#    Production (applied while order maturity m_n > 0):
#       A(n,addr) ->  F(seg)  [ L.. ]  [ +th A(n+1, addr+(0,)) ]
#                                      [ -th A(n+1, addr+(1,)) ]
#                                      { [ +th' A(n+1, addr+(2,)) ] if n==0 }
#                             K(addr)
#
#    D(t) is the continuous depth budget.  m_n = clamp(D - n, 0, 1) multiplies
#    segment length, so an order sprouts from zero rather than appearing.
# ---------------------------------------------------------------------------

# --- growth schedule: t -> geometry.  Tuned so alpha mass grows near-geometrically.
def schedule(t):
    """Everything the tree needs to know about its own age, from one t.

    Fitted against exp-16's own measured profile (work/measure.py on its frames):
    height rises fast to ~110 px by t~0.17 then plateaus, width goes 46 -> 95,
    mass goes 858 -> 5046.  So the clear trunk length is near-constant and almost
    all later growth is added branch ORDERS, thickening and canopy -- which is
    exactly what an L-system's depth budget expresses.
    """
    # Starting the depth budget BELOW 1 matters: at t=0 the trunk itself is only
    # 80% extended, so the seedling still has somewhere to grow and the mass curve
    # stays monotone through the cotyledon stage.
    D = 0.92 + 4.62 * t                       # orders 0..4 (order 4 90% grown at t=1)
    return {
        "t": t,
        "D": D,
        # trunk: shoots up early (exp-16 reaches full height by t~0.17), then only
        # thickens.  All later height comes from added branch orders.
        "trunk_len": 26.0 + 11.0 * smoothstep(0.0, 0.42, t) - 2.0 * t,
        "trunk_w": 1.70 + 10.4 * (t ** 1.35),
        "len_ratio": 0.70,
        "w_ratio": 0.76 - 0.18 * t,
        "spread0": 24.0,                      # degrees, trunk -> leaders
        "spreadN": 26.0,                      # degrees, leader -> twig
        "tropism": 0.30,                      # pull of each new heading toward up
        # roots: a buttress fan specified by where its TIPS land, not by angle and
        # length -- that is what makes it splay across the ground rather than dig.
        "root_n": 3 + int(2.4 * smoothstep(0.0, 0.72, t)),
        "root_span": 7.0 + 25.0 * (t ** 0.95),      # half-width of the root fan
        "root_rise": 3.0 + 14.0 * (t ** 1.05),      # how far up the trunk they start
        "root_w": 1.3 + 4.3 * (t ** 1.10),
        "buttress": smoothstep(0.30, 0.85, t),      # front ridges up the trunk face
        "flare": 0.58,
        # foliage: fat cotyledons at the start, narrow leaflets once branching
        "leaf_base": 9.2,                    # ordinary leaf, same at every order
        "leaf_cot": 23.0,                     # the cotyledon pair only (order 0)
        "leaf_wr": 0.70 - 0.36 * smoothstep(0.0, 0.30, t),
        # Three separate fade windows, because the three kinds of foliage have
        # genuinely different lifetimes.  "outer" is how many branch orders deep
        # inside the crown a unit sits; each holds full size until `hold` and is
        # gone by `end`.
        "cot_hold": 1.30, "cot_end": 3.10,    # cotyledons: shed early
        "leaf_hold": 1.35, "leaf_end": 4.10,  # leaves: shed from the interior
        "lobe_hold": 1.40, "lobe_end": 6.40,  # lobes: persist and fill the crown
        "lobe_r": 4.2 + 3.7 * smoothstep(0.10, 1.0, t),
        "lobe_gate": smoothstep(0.08, 0.92, t),
        "droop": 0.34 * smoothstep(0.35, 1.0, t),
    }


class Shape:
    """One SVG-able primitive: a closed polygon plus its paint role."""
    __slots__ = ("poly", "role", "depth")

    def __init__(self, poly, role, depth=0.0):
        self.poly = poly
        self.role = role
        self.depth = depth


def circle_poly(cx, cy, r, n=None):
    if n is None:
        n = max(10, min(48, int(6 + r * 3.2)))
    return [(cx + r * math.cos(2 * math.pi * i / n),
             cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def blob_poly(cx, cy, r, addr, wob=0.13, n=34):
    """A canopy lobe: a circle deformed by three identity-keyed harmonics, so no
    two lobes are the same shape but each lobe is the same shape at every t."""
    a1, a2, a3 = hrand(addr, 71), hrand(addr, 72), hrand(addr, 73)
    k1, k2 = 3 + int(hrand(addr, 74) * 2), 5 + int(hrand(addr, 75) * 3)
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n
        rr = r * (1.0 + wob * (0.55 * math.sin(k1 * th + a1 * 6.283)
                               + 0.30 * math.sin(k2 * th + a2 * 6.283)
                               + 0.15 * math.sin(2 * th + a3 * 6.283)))
        pts.append((cx + rr * math.cos(th), cy + rr * math.sin(th)))
    return pts


def taper_poly(pts, widths, cap_tip=True):
    """Stroke geometry for a tapered polyline -- the outline SVG would produce for
    stroke-linejoin:round with a varying stroke-width."""
    n = len(pts)
    left, right = [], []
    for i in range(n):
        if i == 0:
            tx, ty = pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]
        elif i == n - 1:
            tx, ty = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        else:
            tx, ty = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / L, tx / L
        hw = widths[i] * 0.5
        left.append((pts[i][0] + nx * hw, pts[i][1] + ny * hw))
        right.append((pts[i][0] - nx * hw, pts[i][1] - ny * hw))
    if cap_tip:
        # round cap: a short arc around the last point
        px, py = pts[-1]
        tx, ty = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]
        L = math.hypot(tx, ty) or 1.0
        ang = math.atan2(ty, tx)
        hw = widths[-1] * 0.5
        cap = [(px + hw * math.cos(ang - math.pi / 2 + math.pi * k / 8),
                py + hw * math.sin(ang - math.pi / 2 + math.pi * k / 8))
               for k in range(1, 8)]
    else:
        cap = []
    return left + cap + right[::-1]


def leaf_poly(bx, by, ang, length, width):
    """A pointed oval leaf, base at (bx,by), tip at distance `length` along ang."""
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    N = 11
    for i in range(N + 1):          # one side
        u = i / N
        # half-width profile: 0 at base, peak near 0.42, 0 at tip
        hw = width * 0.5 * math.sin(math.pi * (u ** 0.78)) ** 0.9
        px, py = u * length, hw
        pts.append((bx + px * ca - py * sa, by + px * sa + py * ca))
    for i in range(N, -1, -1):      # the other
        u = i / N
        hw = -width * 0.5 * math.sin(math.pi * (u ** 0.78)) ** 0.9
        px, py = u * length, hw
        pts.append((bx + px * ca - py * sa, by + px * sa + py * ca))
    return pts


def arc_points(x, y, ang, length, curve, n=9):
    """Sample a constant-curvature arc: heading rotates by `curve` over the run."""
    pts, ws = [(x, y)], []
    step = length / n
    a = ang
    for i in range(n):
        a += curve / n
        x += step * math.cos(a)
        y += step * math.sin(a)
        pts.append((x, y))
    return pts, a


# --- the rewriting pass ------------------------------------------------------
def grow(P):
    """Interpret the L-system for one t.  Returns (woody, foliage) shape lists."""
    woody, foliage = [], []
    D = P["D"]
    ax, ay = ANCHOR
    GROUND = ay + 0.90        # the polygon ground line: puts the bottom-most opaque
                              # row at exactly y=122 in every frame, by construction.

    # ---- roots: V(addr).  Each root is a quadratic Bezier from a point up the
    #      trunk to a TIP ON THE GROUND LINE, with its control point at ground
    #      level so it arrives flat -- a buttress splaying across the ground,
    #      not a taproot digging into it.
    nroot = P["root_n"]
    nrank0 = max(1, (nroot + 1) // 2)
    for i in range(nroot):
        addr = (900, i)
        side = -1 if (i % 2 == 0) else 1          # alternate left / right
        rank = i // 2
        nrank = nrank0
        span = P["root_span"] * (0.52 + 0.48 * (rank + 1) / nrank) * (0.86 + 0.24 * hrand(addr, 4))
        rise = P["root_rise"] * (0.55 + 0.60 * hrand(addr, 7)) * (1.0 - 0.20 * rank)
        # origins are SPREAD across the trunk face and the control point sits
        # high, so each root leaves the trunk on its own line and background
        # opens up between them.  Sharing one origin is what turns a root fan
        # into a solid dark skirt.
        x0 = ax + side * P["trunk_w"] * (0.10 + 0.34 * rank / max(1, nrank0))
        y0 = GROUND - rise
        x2, y2 = ax + side * span, GROUND - 4.2 * hrand(addr, 8) * (rank / max(1, nrank))
        cx = ax + side * span * (0.44 + 0.22 * hrand(addr, 9))
        cy = GROUND - rise * (0.14 + 0.20 * hrand(addr, 10))
        pts = []
        NB = 9
        for k in range(NB + 1):
            u = k / NB
            iu = 1 - u
            pts.append((iu * iu * x0 + 2 * iu * u * cx + u * u * x2,
                        iu * iu * y0 + 2 * iu * u * cy + u * u * y2))
        w0 = P["root_w"] * (0.85 + 0.3 * hrand(addr, 6))
        ws = [w0 * (1.0 - 0.88 * (k / NB) ** 0.62) + 0.66 for k in range(NB + 1)]
        role = "root_sha" if side < 0 else "root_mid"
        woody.append(Shape(taper_poly(pts, ws), role, depth=-1.0 - rank * 0.01))

    # ---- front buttress ridges: short wedges up the trunk face, drawn OVER the
    #      trunk (depth 5) so the base reads as ridged instead of as a cylinder.
    nb = 3 if P["buttress"] > 0.05 else 0
    for i in range(nb):
        addr = (901, i)
        side = (-1, 0, 1)[i]
        h = P["root_rise"] * (0.62 + 0.40 * hrand(addr, 2)) * P["buttress"]
        base = ax + side * P["trunk_w"] * 0.34
        pts = [(base + side * P["trunk_w"] * 0.10, GROUND),
               (base + side * P["trunk_w"] * 0.05, GROUND - h * 0.5),
               (ax + side * P["trunk_w"] * 0.12, GROUND - h)]
        ws = [P["root_w"] * 0.95, P["root_w"] * 0.62, 0.75]
        if h > 3.0:
            woody.append(Shape(taper_poly(pts, ws),
                               "bark_lit" if side <= 0 else "bark_sha", depth=5.0 + i))

    # ---- shoot: A(0, ()) ----------------------------------------------------
    out_segs = []            # (pts, widths, order, addr) for painting
    apices = []              # (x, y, ang, order, addr, vigour)

    def emit(n, addr, x, y, ang, vig):
        # Per-branch emergence offset.  Without it a whole branch ORDER appears in
        # one step and the crown mass jumps; with it, the ~17 twigs of order 4
        # emerge spread over ~0.9 of the depth budget (about four frames), which
        # is what keeps the worst mass step small.  Keyed on identity, so a given
        # twig always emerges at the same t.
        off = 0.0 if n == 0 else (0.55 if n == 1 else 0.90) * hrand(addr, 17)
        m = clamp(D - n - off)
        if m <= 0.0:
            return
        base_len = P["trunk_len"] * (P["len_ratio"] ** n)
        ln = base_len * m * (0.86 + 0.28 * hrand(addr, 11)) * vig
        if ln < 0.35:
            return
        w0 = P["trunk_w"] * (P["w_ratio"] ** n) * (0.9 + 0.2 * hrand(addr, 12))
        w1 = w0 * P["w_ratio"] ** 0.9
        w0 = max(w0, 1.05)
        w1 = max(w1, 0.95)
        # curvature: gentle S on the trunk, more on twigs; droop grows with age
        curve = (0.20 * hsym(addr, 13) + P["droop"] * math.sin(ang) * 0.0
                 + (0.34 * hsym(addr, 14) if n > 0 else 0.10 * hsym(addr, 15)))
        curve += P["droop"] * 0.55 * math.cos(ang) * (1 if n > 1 else 0)
        pts, endang = arc_points(x, y, ang, ln, curve, n=(10 if n == 0 else 6))
        nseg = len(pts)
        if n == 0:
            # The trunk gets an S-bend rather than a C-bend: a perpendicular
            # sine offset that returns to zero at both ends.  The base AND the
            # first fork therefore stay on x = 64 at every t, which is why the
            # anchor does not wander as the trunk thickens.
            amp = 1.15 * hsym(addr, 16) * smoothstep(0.0, 0.35, P["t"])
            pts = [(px + amp * math.sin(math.pi * (k / (nseg - 1))) *
                    (1.0 if k else 0.0), py) for k, (px, py) in enumerate(pts)]
            pts[-1] = (x, pts[-1][1])
        # trunk carries a root flare: widen the bottom fifth
        ws = []
        for k in range(nseg):
            u = k / (nseg - 1)
            w = lerp(w0, w1, u ** 0.85)
            if n == 0:
                # root buttress: the trunk flares into the ground over its lower third
                flare = max(0.0, (0.34 - u) / 0.34)
                w += w0 * P["flare"] * (flare ** 2.4)
            ws.append(w)
        out_segs.append((pts, ws, n, addr))

        ex, ey = pts[-1]
        # --- terminal leaf pair, attached below the apex so the shoot stays clear
        outer0 = D - n - off
        _h, _e = ((P["cot_hold"], P["cot_end"]) if n == 0
                  else (P["leaf_hold"], P["leaf_end"]))
        wt = clamp((_e - outer0) / (_e - _h)) * m
        if wt > 0.02:
            onset_t = 0.45 * hrand(addr, 80)
            la_t = clamp((P["lobe_gate"] - onset_t) / max(1e-6, 1.0 - onset_t))
            lb = P["leaf_cot"] if n == 0 else P["leaf_base"]
            ll = lb * wt * (0.85 + 0.3 * hrand(addr, 82)) * (1.0 - 0.55 * la_t)
            ai = int(0.82 * (nseg - 1))
            axp, ayp = pts[ai]
            aang = -math.pi / 2 if n == 0 else (
                math.atan2(pts[ai + 1][1] - pts[ai - 1][1],
                           pts[ai + 1][0] - pts[ai - 1][0])
                if 0 < ai < nseg - 1 else endang)
            if ll > 1.2:
                for sgn in (-1, 1):
                    lang = aang + sgn * math.radians(38 + 18 * hsym(addr, 83))
                    foliage.append(Shape(
                        leaf_poly(axp, ayp, lang, ll, ll * P["leaf_wr"]),
                        "leaf", depth=-1000.0 + ayp))
        # leaflets along the outer part of this segment
        outer = D - n - off
        onset_s = 0.45 * hrand(addr, 80)
        la_s = clamp((P["lobe_gate"] - onset_s) / max(1e-6, 1.0 - onset_s))
        leafamt = (clamp((P["leaf_end"] - outer) / (P["leaf_end"] - P["leaf_hold"]))
                   * m * (1.0 - 0.80 * la_s))
        if n == 0:
            # Leaves only run up the TRUNK once the seedling is past its cotyledon
            # stage; without this gate the first frame is a bush, not a sprout.
            leafamt *= smoothstep(1.05, 2.05, D)
        if leafamt > 0.02:
            nl = 4 if n == 0 else (3 if n == 1 else (2 if n <= 3 else 1))
            for j in range(nl):
                la = (((0.50 + 0.16 * j) if n == 0 else (0.25 + 0.28 * j))
                      + 0.08 * hsym(addr, 20 + j))
                idx = int(la * (nseg - 1))
                lx, ly = pts[idx]
                sgn = 1 if ((j + addr[-1] if addr else j) % 2 == 0) else -1
                lang = endang + sgn * math.radians(52 + 22 * hsym(addr, 30 + j))
                lbase = P["leaf_cot"] if n == 0 else P["leaf_base"]
                llen = lbase * (0.84 + 0.22 * hrand(addr, 40 + j)) * leafamt
                if llen > 1.2:
                    foliage.append(Shape(
                        leaf_poly(lx, ly, lang, llen, llen * P["leaf_wr"]),
                        "leaf", depth=-1000.0 + ly))

        # children -- 3 leaders off the trunk, 2 thereafter, occasionally 1 so the
        # tip count stays low enough that the crown reads as lobes, not noise
        kids = 3 if n == 0 else 2
        if n >= 2 and hrand(addr, 50) < 0.26:
            kids = 1
        for c in range(kids):
            caddr = addr + (c,)
            if kids == 3:
                base = (-1.0, 0.10, 1.0)[c]
            elif kids == 2:
                base = (-1.0, 1.0)[c]
            else:
                base = 0.45 * hsym(caddr, 59)
            spread = math.radians((P["spread0"] if n == 0 else P["spreadN"])
                                  + 14 * hsym(caddr, 60))
            na = endang + base * spread
            # phototropism: pull the heading back toward vertical, more with depth
            up = -math.pi / 2
            trop = P["tropism"] + 0.055 * n
            dv = math.atan2(math.sin(up - na), math.cos(up - na))
            na += dv * trop
            vv = vig * (0.94 + 0.14 * hrand(caddr, 61))
            emit(n + 1, caddr, ex, ey, na, vv)

        # this apex's own foliage unit
        apices.append((ex, ey, endang, n, addr, m, outer + off))

    emit(0, (0,), ax, GROUND, -math.pi / 2, 1.0)

    # ---- paint the woody structure, back to front (deep orders behind)
    for pts, ws, n, addr in out_segs:
        role = ("bark_mid" if n == 0 else
                "bark_sha" if n == 1 else
                "bark_sha" if n == 2 else "bark_deep")
        woody.append(Shape(taper_poly(pts, ws), role, depth=n))

    # ---- terminal foliage: leaves and lobes at apices ------------------------
    for (ex, ey, ang, n, addr, m, outer) in apices:
        # foliage lives on the outer ~2 orders and fades inward as new orders
        # emerge, so the crown clears its own interior continuously.  Scaling by
        # the apex's own maturity m means a just-emerged twig buds rather than pops.
        w = clamp((P["lobe_end"] - outer) / (P["lobe_end"] - P["lobe_hold"])) * m
        if w <= 0.02:
            continue
        # per-apex lobe onset, keyed on identity -> lobes arrive one at a time
        onset = 0.45 * hrand(addr, 80)
        la = clamp((P["lobe_gate"] - onset) / max(1e-6, 1.0 - onset))
        r = P["lobe_r"] * la * smoothstep(0.0, 1.0, w) * (0.68 + 0.52 * hrand(addr, 81))
        # Canopy lobes belong on order 2+.  A lobe on the trunk or on a leader
        # renders as a green blob stuck to the bark, which is exactly the
        # "pasted-on crown" fault this arc keeps rejecting.
        if r > 2.2 and w > 0.16 and n >= 2:
            cx = ex + r * 0.10 * hsym(addr, 84) + r * 0.55 * math.cos(ang)
            cy = ey + r * 0.10 * hsym(addr, 85) + r * 0.55 * math.sin(ang)
            foliage.append(Shape(blob_poly(cx, cy, r, addr), "lobe",
                                 depth=cy))
    return woody, foliage, out_segs, apices


# ---------------------------------------------------------------------------
# 5. Rasteriser -- our own scanline polygon fill with SS x SS supersampling.
# ---------------------------------------------------------------------------
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        n = w * h
        self.r = array("f", bytes(4 * n))
        self.g = array("f", bytes(4 * n))
        self.b = array("f", bytes(4 * n))
        self.a = array("f", bytes(4 * n))

    def fill_poly(self, poly, rgb, alpha=1.0):
        """src-over a closed polygon.  Non-zero winding via signed crossings,
        with analytic horizontal coverage at the span ends."""
        w, h = self.w, self.h
        n = len(poly)
        ys = [p[1] for p in poly]
        y0 = max(0, int(math.floor(min(ys))))
        y1 = min(h - 1, int(math.ceil(max(ys))))
        if y1 < y0:
            return
        cr, cg, cb = rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0
        R, G, B, A = self.r, self.g, self.b, self.a
        for y in range(y0, y1 + 1):
            sy = y + 0.5
            xs = []
            for i in range(n):
                ax_, ay_ = poly[i]
                bx_, by_ = poly[(i + 1) % n]
                if ay_ == by_:
                    continue
                if (ay_ <= sy < by_) or (by_ <= sy < ay_):
                    tt = (sy - ay_) / (by_ - ay_)
                    xs.append((ax_ + tt * (bx_ - ax_), 1 if by_ > ay_ else -1))
            if not xs:
                continue
            xs.sort()
            wind = 0
            row = y * w
            i = 0
            while i < len(xs):
                x_, d_ = xs[i]
                prev = wind
                wind += d_
                if prev == 0 and wind != 0:
                    start = x_
                elif prev != 0 and wind == 0:
                    end = x_
                    # fill [start, end) with analytic edge coverage
                    if end > start:
                        px0 = int(math.floor(start))
                        px1 = int(math.ceil(end)) - 1
                        if px1 >= 0 and px0 <= w - 1:
                            for px in range(max(0, px0), min(w - 1, px1) + 1):
                                cov = min(end, px + 1.0) - max(start, float(px))
                                if cov <= 0:
                                    continue
                                aa = cov * alpha
                                if aa <= 0:
                                    continue
                                if aa > 1.0:
                                    aa = 1.0
                                k = row + px
                                ia = 1.0 - aa
                                R[k] = cr * aa + R[k] * ia
                                G[k] = cg * aa + G[k] * ia
                                B[k] = cb * aa + B[k] * ia
                                A[k] = aa + A[k] * ia
                i += 1

    def downsample(self, factor):
        w, h = self.w // factor, self.h // factor
        out = bytearray(w * h * 4)
        inv = 1.0 / (factor * factor)
        R, G, B, A = self.r, self.g, self.b, self.a
        for y in range(h):
            for x in range(w):
                sr = sg = sb = sa = 0.0
                for dy in range(factor):
                    row = (y * factor + dy) * self.w + x * factor
                    for dx in range(factor):
                        k = row + dx
                        sr += R[k]; sg += G[k]; sb += B[k]; sa += A[k]
                sr *= inv; sg *= inv; sb *= inv; sa *= inv
                o = (y * w + x) * 4
                if sa > 1e-6:
                    out[o] = min(255, max(0, int(sr / sa * 255 + 0.5)))
                    out[o + 1] = min(255, max(0, int(sg / sa * 255 + 0.5)))
                    out[o + 2] = min(255, max(0, int(sb / sa * 255 + 0.5)))
                out[o + 3] = min(255, max(0, int(sa * 255 + 0.5)))
        return w, h, out


# ---------------------------------------------------------------------------
# 6. Painting: role -> concrete fills, with one light direction and a dark
#    outline drawn as an inflated copy underneath (SVG paint-order: stroke fill).
# ---------------------------------------------------------------------------
LIGHT = (-0.55, -0.84)      # from upper-left, as in exp-16's crown highlights


def inflate(poly, s):
    """Offset a closed polygon outward by s px along the centroid normal.  For the
    convex-ish shapes used here this is what stroking with width 2s produces."""
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    n = len(poly)
    for i in range(n):
        px, py = poly[i]
        qx, qy = poly[(i + 1) % n]
        ox, oy = poly[(i - 1) % n]
        # outward normal from the two adjacent edge normals
        e1x, e1y = px - ox, py - oy
        e2x, e2y = qx - px, qy - py
        l1 = math.hypot(e1x, e1y) or 1.0
        l2 = math.hypot(e2x, e2y) or 1.0
        nx = (-e1y / l1) + (-e2y / l2)
        ny = (e1x / l1) + (e2x / l2)
        ln = math.hypot(nx, ny)
        if ln < 1e-6:
            nx, ny = px - cx, py - cy
            ln = math.hypot(nx, ny) or 1.0
        nx /= ln; ny /= ln
        # make sure it points away from the centroid
        if (nx * (px - cx) + ny * (py - cy)) < 0:
            nx, ny = -nx, -ny
        out.append((px + nx * s, py + ny * s))
    return out


def scale_poly(poly, k, cx=None, cy=None, dx=0.0, dy=0.0):
    if cx is None:
        cx = sum(p[0] for p in poly) / len(poly)
        cy = sum(p[1] for p in poly) / len(poly)
    return [(cx + (p[0] - cx) * k + dx, cy + (p[1] - cy) * k + dy) for p in poly]


def render(t, want_svg=False, raw=False):
    # t is FRAME time; tau is GROWTH time.  One parameter still drives everything.
    tau = t if raw else ease(t)
    P = schedule(tau)
    woody, foliage, segs, apices = grow(P)
    S = SS
    cv = Canvas(W * S, H * S)
    svg = []

    # The ground plane, as an SVG clipPath would express it: nothing the tree draws
    # may cross y = 122.9, so the bottom-most opaque row is 122 in EVERY frame and
    # vertical root drift is 0 by construction rather than by measurement.
    GCLIP = ANCHOR[1] + 0.90

    def clipg(poly):
        return [(x, y if y < GCLIP else GCLIP) for (x, y) in poly]

    def sp(poly):
        return [(x * S, y * S) for (x, y) in poly]

    def paint(poly, key):
        poly = clipg(poly)
        cv.fill_poly(sp(poly), PAL[key])
        if want_svg:
            d = "M " + " L ".join(f"{x:.2f},{y:.2f}" for x, y in poly) + " Z"
            c = PAL[key]
            svg.append(f'<path d="{d}" fill="#{c[0]:02x}{c[1]:02x}{c[2]:02x}"/>')

    OUT_W = 0.95      # outline half-width in canvas px

    # ---- layer 1: the woody group.  All inflated silhouettes first (one shared
    #      outline round the union), then the fills.  = SVG paint-order on a <g>.
    body = sorted([s for s in woody if s.depth < 5.0], key=lambda s: s.depth)
    front = sorted([s for s in woody if s.depth >= 5.0], key=lambda s: s.depth)
    for s in body:
        paint(inflate(s.poly, OUT_W), "bark_out")
    for s in body:
        paint(s.poly, s.role)

    # ---- trunk / branch facet shading: a lit ribbon toward the light
    for pts, ws, n, addr in segs:
        if ws[0] < 2.6:
            continue
        off = 0.26
        lp = [(x + LIGHT[0] * ws[min(i, len(ws) - 1)] * off,
               y + LIGHT[1] * ws[min(i, len(ws) - 1)] * off * 0.35)
              for i, (x, y) in enumerate(pts)]
        lw = [max(0.9, w * 0.40) for w in ws]
        key = "bark_hi" if n == 0 else "bark_lit"
        paint(taper_poly(lp, lw), key)

    # ---- bark grain: two thin shadow-side striations up the trunk, which is what
    #      stops a wide trunk from reading as a smooth plastic cylinder
    for pts, ws, n, addr in segs:
        if n != 0 or ws[0] < 7.0:
            continue
        for j, frac in enumerate((0.20, 0.40)):
            gp, gw = [], []
            for i, (x, y) in enumerate(pts):
                if i / (len(pts) - 1) > 0.72:
                    break
                w_i = ws[i]
                gp.append((x + frac * w_i * (0.9 + 0.25 * hsym(addr, 90 + j)), y))
                gw.append(max(0.7, w_i * 0.11))
            if len(gp) > 2:
                paint(taper_poly(gp, gw), "bark_deep")

    # ---- front buttress ridges, individually outlined so they read as ridges
    for s in front:
        paint(inflate(s.poly, OUT_W * 0.9), "bark_out")
        paint(s.poly, s.role)

    # ---- layer 2: foliage, back to front.  Each unit gets its own outline so
    #      the crown reads as lobes rather than one mass.
    fol = sorted(foliage, key=lambda s: s.depth)
    _cys = [sum(p[1] for p in s.poly) / len(s.poly) for s in fol] or [0.0]
    cy0, cy1 = min(_cys), max(_cys)
    for s in fol:
        if s.role == "leaf":
            paint(inflate(s.poly, OUT_W * 0.85), "canopy_out")
            cy = sum(p[1] for p in s.poly) / len(s.poly)
            cx = sum(p[0] for p in s.poly) / len(s.poly)
            key = "leaf_sha" if (cy1 - cy) < 0.30 * max(9.0, cy1 - cy0) else "leaf_mid"
            paint(s.poly, key)
            rr = max(math.hypot(p[0] - cx, p[1] - cy) for p in s.poly)
            if rr > 2.2:
                paint(scale_poly(s.poly, 0.74, cx, cy,
                                 LIGHT[0] * rr * 0.22, LIGHT[1] * rr * 0.22),
                      "leaf_lit" if (cy1 - cy) > 0.30 * max(9.0, cy1 - cy0) else "leaf_mid")
        else:
            paint(inflate(s.poly, OUT_W), "canopy_out")
            cx = sum(p[0] for p in s.poly) / len(s.poly)
            cy = sum(p[1] for p in s.poly) / len(s.poly)
            r = max(math.hypot(p[0] - cx, p[1] - cy) for p in s.poly)
            # Value by height WITHIN THE CROWN'S OWN EXTENT, not by absolute y.
            # Keying it to absolute y made every young crown dark, because a young
            # crown simply sits low on the canvas.  exp-16's pale #ada772 tops are
            # its single most recognisable canopy cue and they are present at every
            # stage of its track.
            hi = clamp((cy1 - cy) / max(9.0, cy1 - cy0))
            base = "canopy_mid" if hi > 0.42 else ("canopy_sha" if hi > 0.14 else "canopy_deep")
            paint(s.poly, base)
            # one flat lit facet toward the light, in the island's facet idiom
            paint(scale_poly(s.poly, 0.70, cx, cy,
                             LIGHT[0] * r * 0.24, LIGHT[1] * r * 0.24),
                  "canopy_lit" if hi > 0.22 else "canopy_mid")
            if hi > 0.46:
                paint(scale_poly(s.poly, 0.42, cx, cy,
                                 LIGHT[0] * r * 0.40, LIGHT[1] * r * 0.40),
                      "canopy_hi")

    w, h, buf = cv.downsample(S)
    P["tau"] = tau
    return buf, svg, P


# ---------------------------------------------------------------------------
# 7. Palette snap + hard alpha edge (what an actual sprite pipeline ships)
# ---------------------------------------------------------------------------
_SNAP = {}


def snap(rgb):
    v = _SNAP.get(rgb)
    if v is None:
        r, g, b = rgb
        best, bd = PAL_LIST[0], 1e18
        for c in PAL_LIST:
            dr, dg, db = r - c[0], g - c[1], b - c[2]
            d = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db
            if d < bd:
                bd, best = d, c
        v = best
        _SNAP[rgb] = v
    return v


def finish(buf, quantise=True):
    out = bytearray(len(buf))
    for i in range(0, len(buf), 4):
        a = buf[i + 3]
        if not quantise:
            out[i:i + 4] = buf[i:i + 4]
            continue
        if a < ALPHA_CUT * 255:
            continue                                   # fully transparent
        c = snap((buf[i], buf[i + 1], buf[i + 2]))
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255
    return bytes(out)


def fill_pinholes(buf, w, h):
    """Fill transparent pixels that are ENCLOSED by the body.

    Overlapping anti-aliased polygons occasionally leave a one-pixel hole where
    three edges meet and none of them individually reaches the 0.42 alpha cut.
    A hole like that shows the background straight through the trunk once the
    sprite is on the island.  Flood the true background in from the border; any
    transparent pixel it cannot reach is interior, and takes the most common
    colour among its opaque 4-neighbours."""
    op = [buf[i * 4 + 3] > 0 for i in range(w * h)]
    outside = bytearray(w * h)
    stack = []
    for x in range(w):
        for y in (0, h - 1):
            k = y * w + x
            if not op[k] and not outside[k]:
                outside[k] = 1
                stack.append(k)
    for y in range(h):
        for x in (0, w - 1):
            k = y * w + x
            if not op[k] and not outside[k]:
                outside[k] = 1
                stack.append(k)
    while stack:
        k = stack.pop()
        y, x = divmod(k, w)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                nk = ny * w + nx
                if not op[nk] and not outside[nk]:
                    outside[nk] = 1
                    stack.append(nk)
    out = bytearray(buf)
    filled = 0
    for k in range(w * h):
        if not op[k] and not outside[k]:
            y, x = divmod(k, w)
            votes = {}
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    nk = ny * w + nx
                    if op[nk]:
                        c = (out[nk * 4], out[nk * 4 + 1], out[nk * 4 + 2])
                        votes[c] = votes.get(c, 0) + 1
            if votes:
                c = max(votes.items(), key=lambda kv: (kv[1], kv[0]))[0]
                out[k * 4:k * 4 + 4] = bytes((c[0], c[1], c[2], 255))
                filled += 1
    return bytes(out), filled


def largest_body_only(buf, w, h):
    """Keep only the 8-connected component containing the bottom-most pixel.
    A structural guarantee, exactly as exp-16 does it -- here it should never fire."""
    op = [buf[i * 4 + 3] > 0 for i in range(w * h)]
    seed = None
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if op[y * w + x]:
                seed = y * w + x
                break
        if seed is not None:
            break
    if seed is None:
        return buf, 0
    keep = bytearray(w * h)
    stack = [seed]
    keep[seed] = 1
    while stack:
        k = stack.pop()
        y, x = divmod(k, w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    nk = ny * w + nx
                    if op[nk] and not keep[nk]:
                        keep[nk] = 1
                        stack.append(nk)
    removed = 0
    out = bytearray(buf)
    for k in range(w * h):
        if op[k] and not keep[k]:
            out[k * 4:k * 4 + 4] = b"\x00\x00\x00\x00"
            removed += 1
    return bytes(out), removed


# ---------------------------------------------------------------------------
# 8. Main
# ---------------------------------------------------------------------------
def write_png(path, w, h, buf):
    from PIL import Image
    Image.frombytes("RGBA", (w, h), bytes(buf)).save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default=os.path.join(BASE, "frames"))
    ap.add_argument("--raw", default=None, help="also write the un-quantised AA render here")
    ap.add_argument("--svgdir", default=os.path.join(BASE, "svg"))
    ap.add_argument("--frames", default=None, help="comma list, default all 19")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    os.makedirs(args.svgdir, exist_ok=True)
    if args.raw:
        os.makedirs(args.raw, exist_ok=True)

    idxs = ([int(v) for v in args.frames.split(",")] if args.frames
            else list(range(NFRAMES)))
    reg = {"canvas": [W, H], "anchor": list(ANCHOR), "seed": SEED,
           "frames": []}
    for i in idxs:
        t = i / (NFRAMES - 1)
        buf, svg, P = render(t, want_svg=True)
        final = finish(buf, quantise=True)
        final, removed = largest_body_only(bytearray(final), W, H)
        final, holes = fill_pinholes(bytearray(final), W, H)
        write_png(os.path.join(args.out, f"frame-{i:02d}.png"), W, H, final)
        if args.raw:
            write_png(os.path.join(args.raw, f"frame-{i:02d}.png"), W, H,
                      finish(buf, quantise=False))
        with open(os.path.join(args.svgdir, f"frame-{i:02d}.svg"), "w") as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" '
                    f'height="{H}" viewBox="0 0 {W} {H}" '
                    f'shape-rendering="geometricPrecision">\n')
            f.write("\n".join(svg))
            f.write("\n</svg>\n")
        alpha = sum(1 for k in range(W * H) if final[k * 4 + 3] > 0)
        reg["frames"].append({"i": i, "t": round(t, 6), "alpha": alpha,
                              "strays_pruned": removed, "pinholes_filled": holes,
                              "D": round(P["D"], 4), "trunk_len": round(P["trunk_len"], 3)})
        print(f"frame-{i:02d}  t={t:.4f}  D={P['D']:.2f}  alpha={alpha:5d}  "
              f"paths={len(svg):4d}  strays={removed}  pinholes={holes}")
    with open(os.path.join(args.out, "registration.json"), "w") as f:
        json.dump(reg, f, indent=1)


if __name__ == "__main__":
    main()
