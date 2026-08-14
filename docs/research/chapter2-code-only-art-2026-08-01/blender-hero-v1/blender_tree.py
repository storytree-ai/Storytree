#!/usr/bin/env python3
"""ADR-0280 D2a — the code-generated hero tree, rendered by headless Blender.

Run:  blender --background --python blender_tree.py -- --out raw --frames 19 --res 384 --samples 64

Everything structural is computed HERE (ADR-0280 D1: code owns skeleton, camera and
growth). Blender occupies the FINISH slot only. No .blend is a source of truth; this
file is. Output is NOT deliverable until it passes pixelise.py — a raw Blender frame
shipped as-is is the ADR-0145 failure reproduced (ADR-0280 D2a).

This is v9. v8 opened the lower crown by shrinking low lobes and paying the lost radius
OUTWARD, moving in-crown bark from 206 to 631 px against exp-16's 670 while holding the
reference's widest band. Its honest cost was the mature foliage floor: 44% -> 48%.

v9 is the minimum repair. Only outer-rim lobes that the low-crown rule already shrank
move DOWN; radius and horizontal position stay fixed, so foliage returns at the floor
without closing the middle back over the limbs. At the delivered `--low-rim-drop 0.50`,
the floor returns to 45%, crown area grows 4123 -> 4200 against 4280, and bark holds at
630 px (15.0%) against 670 (15.7%). Zero reproduces v8 exactly.

v3's colour levers, v4's inverted pear, v5's root flare and mid-stage whip, ADR-0293's
two-phase staging, v7's crown-proxy normals, and v8's low shrink/splay are unchanged.

Invariants held (ADR-0280 D1, reaffirmed by ADR-0289):
  · Topology is a strict PREFIX. The skeleton is grown once; every node records its
    birth iteration; a frame at reveal N draws nodes with birth <= N and eases the
    frontier out of zero length. Nothing is frozen to buy per-frame connectedness.
  · Randomness is IDENTITY-KEYED (h01 on a part's address), never a draw counter, so
    adding a branch cannot reshuffle the tree into a different tree.
  · The camera is framed ONCE to the mature extent and is byte-identical every frame.
  · CPU Cycles, fixed seed, fixed samples, pinned Blender 5.2.0 LTS.
"""
import hashlib
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
# THE SCALE CONVENTION (the open art-direction fork, §6 item 3 of the README).
#   fixed     — ADR-0280 D1 as decided: ONE camera framed to the mature extent, held
#               byte-identical on every frame. Apparent size tracks TRUE size, so the
#               seedling is 13% of the mature height and genuinely small in frame.
#   per-stage — one camera PER FRAME, framed to that frame's own extent, so every stage
#               fills the canvas and growth reads as width/density instead of height.
#               This is the convention exp-16 uses from its frame 03 onward.
#   eased     — per-stage framing with exp-16's own softened OPENING: apparent size is a
#               compressed monotone function of true size, floored at `--open-frac`
#               (0.65, measured off exp-16's frame 00, not chosen here).
# `fixed` is byte-identical to the delivered track — the flag adds a branch, it does not
# move the default. The retiming, the skeleton and every material are shared by all three,
# so the ONLY difference between the variants is the camera.
# WHO GROWS THE SKELETON (the ecosystem question, owner-raised 2026-08-02).
#   space-colonisation — ours, hand-rolled: attractor cloud + iterative growth, and the
#                        birth iteration falls out of the growth loop for free.
#   sapling            — Blender's `Sapling Tree Gen` extension (Weber & Penn 1995),
#                        installed from extensions.blender.org. It generates a MATURE
#                        tree only, so the growth is still ours: we read its armature as
#                        a parent graph and synthesise a birth wave over it (see
#                        build_skeleton_sapling). ADR-0280 D1's "code owns growth, camera
#                        and pacing" is untouched; only "code owns SKELETON" changes.
# Exactly one variable differs between the two, which is the point — the canopy, the pipe
# model, the cel bands, the camera, the pacing and the whole raster back half are shared.
SKELETON = arg("--skeleton", "space-colonisation")
SAP_PRESET = arg("--sap-preset", "quaking_aspen")
if SKELETON not in ("space-colonisation", "sapling"):
    raise SystemExit(f"--skeleton must be space-colonisation|sapling, got {SKELETON!r}")
# Normalisation target for a borrowed skeleton: the space-colonisation tree's mature
# SILHOUETTE top, max(node z + its pipe radius) = 2.82. That is deliberately the outer
# surface rather than the last node CENTRE (2.537) — the two differ by a mature tip
# radius, and the silhouette is what the shared canopy/leaf/flare constants below are
# sized against. Those constants are absolute world numbers, so a borrowed skeleton is
# scaled to hand the shared machinery the same world size. (The camera frames to the
# measured extent either way, so this is about the constants, not about the framing.)
SAP_TARGET_H = 2.82
SAP_SEG = float(arg("--sap-seg", "0.075"))        # uniform resample length, ~ our median
SAP_MAX_BIRTH = float(arg("--sap-max-birth", "27"))   # = the space-colonisation tree's
# How much of the trunk carries NO branches. Sapling's mature presets self-prune hard
# (the aspen's first lateral sits at ~40% of trunk height), and a mature-tree topology
# with a bare lower bole has no plausible JUVENILE inside it — every prefix is a pole.
# Lowering it is the legitimate lever for making the early frames read as a young tree.
SAP_BASE_SIZE = arg("--sap-base-size", "")
# HOW a borrowed mature form is turned into a growth sequence — the whole difficulty of
# the hybrid, and worth two honest attempts rather than one:
#   arc    — birth = arc length from the root. The naive wave, and it is UNFAIR to
#            Sapling: the trunk is the straightest path in the tree, so the apex is
#            reached in far less arc than the outer twigs and the tree hits 59% of its
#            mature height by frame 3, leaving fifteen frames of twig infill.
#   height — birth charges more for climbing than for reaching out, so the leader ascends
#            steadily across the whole track and each lateral fills in shortly after the
#            leader passes its attachment height. That is how a tree actually gains
#            height, and it is the model the space-colonisation loop produces for free.
SAP_BIRTH = arg("--sap-birth", "height")
SAP_W_OUT = float(arg("--sap-w-out", "0.35"))     # cost of horizontal travel, vs 1.0 up
FRAMING = arg("--framing", "fixed")
OPEN_FRAC = float(arg("--open-frac", "0.65"))
EASE_GAMMA = float(arg("--ease-gamma", "0.4"))
if FRAMING not in ("fixed", "per-stage", "eased"):
    raise SystemExit(f"--framing must be fixed|per-stage|eased, got {FRAMING!r}")
# `--only 18,9` renders a SUBSET of the delivered frames. The retiming, the camera and
# the frame indices are unchanged, so a single-frame render is byte-identical to that
# frame of a full run — it is the tight loop for the colour work, not a different tree.
ONLY = ({int(x) for x in arg("--only", "").split(",") if x.strip() != ""}
        if arg("--only", "") else None)

os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette anchors
# The BANDS. exp-16's confidence is not saturation, it is TWELVE colours held in large
# flat regions plus one bright warm top-highlight over a fifth of the canopy; v2 carried
# 24 and no highlight at all. So the band list IS the colour budget, authored here at
# exp-16's own committed palette values rather than discovered by the snap: the material
# emits a palette entry exactly, and `pixelise.py`'s snap becomes a near-identity.
#
# (stop, sRGB) — stop is the shading value at which the band takes over. Positions are
# tuned against the MEASURED coverage of the mature crown, not by eye: the top band is
# placed to land near exp-16's 20-21%.
FOLIAGE_BANDS = [
    (0.00, (92, 90, 46)),        # deep shade      exp-16: 6.8%
    (0.26, (101, 118, 65)),      # shade           exp-16: 21.7%
    (0.61, (121, 141, 83)),      # mid
    (0.72, (135, 148, 89)),      # body            exp-16: 29.0%
    (0.89, (173, 167, 114)),     # warm highlight  exp-16: 20.4%  <- v2 had NO equivalent
]
BARK_BANDS = [
    (0.00, (73, 44, 28)),
    (0.38, (103, 62, 39)),
    (0.60, (125, 94, 55)),
    (0.80, (152, 106, 60)),
]
# The key sits UP-LEFT-AND-FORWARD of the camera, not overhead. The iso-bands of N·L are
# circles perpendicular to L, so a near-vertical key at a 20 deg camera projects them as
# horizontal stripes and every lobe reads as a flat-topped plate; swinging L toward the
# view axis turns them into concentric rings around an upper-left highlight, which is how
# exp-16's lobes read as round. Lever 3 (the top highlight) and lever 2 (the banding) are
# the same mechanism — the band list chooses the colours, this vector places them.
LIGHT_DIR = (-0.435, -0.429, 0.792)
# Foliage occlusion is a CREASE finder, not a global dimmer: short-range and strong, so
# the valley where two clouds meet drops a whole band and reads as the dark seam that
# separates them. Without it the lobes merge into one lumpy mass — exp-16 draws a scallop
# between every pair, and that separation is what makes a canopy read as clusters.
AO_AMOUNT = 0.62
AO_DIST = 0.20
# Bark reaches FURTHER and darker. A cel material is self-lit, so a twig inside the
# canopy would otherwise render at the same brightness as one on the silhouette — and a
# BRIGHT bark band peeking through a gap is the orange speckle that reads as noise.
# exp-16's crown is 29% bark by area and almost none of it is bright: the twigs are
# there, they are simply in deep shade. Long-range occlusion is what puts them there.
AO_AMOUNT_BARK = 0.80
AO_DIST_BARK = 0.80
# LEVER 4, the optional one. A tiled leaf texture at 128 px lands sub-pixel — the whole
# tree is ~86 px wide and a lobe is 12-20 px — so it can only ADD colours, which is the
# exact defect being fixed. The defensible form is a BREAK-UP MASK: noise added to the
# shading value BEFORE the ramp, so it scallops the band boundary (the terminator) into
# something leafy instead of a smooth vector arc, and cannot introduce a colour because
# the ramp still only emits band values. `--breakup <x>` overrides for the experiment.
LEAF_BREAKUP = float(arg("--breakup", "0.10"))
LEAF_BREAKUP_SCALE = 22.0


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
#
# RAISED AND SHORTENED for ADR-0289 D2's second defect, "we losing the overall upside
# down pair shape". The fix came out of a MEASUREMENT rather than out of the phrase.
# Half-width by height decile, mature frame, ours against exp-16's:
#
#     height band     0.17-0.25   0.25-0.33   0.42-0.50   0.58-0.67   0.92-1.00
#     exp-16               9.5         7.5        38.5        47.0        22.0
#     v3                  18.5        20.5        39.5        45.5        14.5
#
# The two crowns agree on where they are WIDEST (0.58-0.67) and on how wide. What exp-16
# has and v3 did not is a WAIST: it narrows to a 7.5 px half-width at a quarter of its
# height and then jumps to 38.5, while v3 ramped smoothly 18.5 -> 20.5 -> 39.5 and read
# as an oval on a short stick. An upside-down pear is a narrow stem carrying a broad
# round top, and the stem is the half of it that was missing.
#
# So the envelope's FLOOR is what moved: z 0.86..2.74 (an ellipsoid as tall as it is
# wide, starting at 29% of tree height) becomes z 1.24..2.76 — the same rounded shape,
# raised onto a bole and squashed vertically so it stays a crown rather than a column.
# The canopy floor below (CANOPY_FLOOR) holds the same line for the FOLIAGE, and the two
# numbers are deliberately the same measurement read twice: where the crown begins.
CROWN_C = np.array([0.0, 0.0, 2.00])
CROWN_R = np.array([0.86, 0.74, 0.76])
BOLE_CLEAR_Z = 1.18            # no attractors below this: keeps a readable bole
BOLE_CLEAR_R = 0.34            # nor this close to the axis low down
BOLE_MIN_Z = 0.40              # the leader climbs at least this high before it forks
N_LOW = 10                     # a low attractor ring: a few side shoots on the sapling
LOW_R = (0.22, 0.40)           # that survive as the mature tree's low limbs. Keep it
LOW_Z = (0.80, 1.15)           # SPARSE and HIGH: a dense low ring grows a permanent
                               # skirt around the bole and the tree reads as a hedge.
                               # It sits just UNDER the crown floor, so at maturity these
                               # limbs are bare wood fanning into the canopy — which is
                               # 29% of exp-16's crown by area — and not a second tier of
                               # foliage hanging beside the trunk.

# A THIRD ring, lower still, and the one that makes the mid frames a WHIP rather than a
# pole with a tuft (README §6 item 2). The gap was diagnosed in the canopy for two
# increments and is not there: the lowest thing a v4 tree could branch to sat at z=0.80,
# the bole runs to 0.90, so every branch in the track was born within a tenth of the
# leader's tip. At frame 6 that is a bare stem carrying one tuft, and no cloud rule can
# put foliage on a stem that has no shoots. exp-16's f04 carries side shoots from a fifth
# of its height, which is what a canopy needs somewhere to sit.
#
# It is the SAME hedge risk the ring above warns about, and the answer is the one v4
# built: the canopy floor strips foliage below 40% of the live top, so these lignify into
# bare stubs on the bole exactly as the leader overtops them. They are kept SHORT because
# the other thing they touch is the WAIST — ADR-0289 D2's second defect. Measured room:
# exp-16's half-width is 9.5 and 7.5 in the two deciles these land in, and v4 came in at
# 5 and 4, so there is about a 4 px budget and MID_R spends 3 of it.
N_MID = 6
MID_R = (0.15, 0.28)
MID_Z = (0.42, 0.86)

# secondary growth (gap 1's fix): girth is a function of AGE, not of position
PIPE_E = 2.15
# A uniform multiplier on the TIP radius, and therefore — the pipe model being
# homogeneous of degree 1 — on every radius in the tree. It exists because the mature
# trunk radius is set by tip radius times a function of TIP COUNT, so a skeleton with a
# different branch density inherits a wrong trunk: small_maple's 7456 bones drove the
# mature trunk to 0.77 on a 2.82-tall tree, a bole 55% as wide as the tree is tall.
# Calibrated ONCE against the space-colonisation trunk after the skeleton is known; stays
# exactly 1.0 for the space-colonisation skeleton, which is what it was tuned on.
R_SCALE = 1.0
SC_TRUNK_R = 0.1159            # the space-colonisation tree's mature trunk radius
R_TIP_MIN = 0.0125             # a first-season shoot
R_TIP_MAX = 0.0265             # a lignified twig
TAU_AGE = 26.0                 # iterations to e-fold toward R_TIP_MAX
AGE_TAIL = 8.0                # pure secondary growth after extension stops

# ---------------------------------------------------------------- foliage
# v2 rendered per-leaf geometry all the way to maturity, and that is the machine that
# manufactured its colour fragmentation: each blade presents its own facing angle, so a
# mature crown carried a CONTINUUM of shading that quantised into speckle — measured at
# 24 distinct crown colours against exp-16's 12. A cloud has one surface and can hold a
# band. v3 kept blades for the frames where ONE LEAF IS A READABLE FRACTION OF THE
# SILHOUETTE and handed the population to clouds at frame 10.
#
# ADR-0289 D1 RETIRED that second mechanism, and the whole seedling apparatus with it:
# the track animates a tree FORMING, not a sapling maturing, so frame 0 need not be a
# botanically plausible cotyledon seedling and the mid frames need not be plausible trees
# of a given age. Deleted here, not kept behind a flag (git is the archive): the leaf
# BLADE geometry and its whorl placement, the age-dependent first flush, the
# blade-to-cloud handoff gate, the two-leaf cotyledon organ and its senescence ramp, and
# the third material they needed. ONE mechanism now carries the canopy from the first
# frame to the last, which is what lever 1 claimed and only half did.
#
# The canopy is carried on the OUTER ORDERS of live shoot and migrates outward as the
# tree grows — which is what a real canopy does, and what lets one mechanism serve a
# sapling apex and a mature crown shell. Cloud SEATS are farthest-point sampled from the
# mature skeleton ONCE and every node is assigned to one, so a cloud can never appear,
# merge or split between frames; only its live membership changes.
# THE TWO PHASES (ADR-0293, owner-directed). Every version through v5 grew wood and leaves
# TOGETHER from the first frame, and the owner's verdict on the v5 track was that "the
# leaves forming while the trunk grows looks really ugly — can we just grow the trunk and
# branches and then put the leaves on". So the canopy no longer rides the whole track: the
# wood extends and branches ALONE, and the leaves flush onto a tree that is already a tree.
#
# This is a STAGING change and nothing else. The skeleton, its birth iterations, the camera
# and the prefix invariant are untouched (ADR-0280 D1); the canopy rules — outer orders,
# the crown floor, the seats — are untouched too. Only WHEN each cloud starts carrying
# weight moves, which is exactly the scalar that was already here.
#
# Keyed on the reveal iteration N rather than on height, because the flush has to be able
# to run PAST the point where the tree stops extending: the skeleton is fully alive at
# NMAX_BIRTH (28) and AGE_TAIL carries 8 more iterations of pure secondary growth, so a
# height-keyed flush would finish before the last third of the track exists.
LEAF_ON = float(arg("--leaf-on", "17"))     # reveal iteration where the first leaves break
LEAF_FULL = float(arg("--leaf-full", "32"))  # ... and where the flush is complete
# Both are flags because WHERE the phase boundary sits is an art-direction choice with a
# rendered answer, not a number to argue about — the same treatment `--framing` gets.
N_CLOUD = 22                   # fewer, larger clouds: the count IS the band budget
# ... but 22 seats sampled from the WHOLE skeleton are 22 seats spent on the mature
# crown, because that is where 340 of the 352 nodes are. The nine nodes alive at frame 4
# fell into TWO of them, so the mid-track tree could only ever be one or two masses on a
# stem — README §6 item 2, and the gap that also blocks the scale-convention fork. A
# track that animates growth has to resolve the juvenile prefix as finely as the crown,
# so a fixed number of seats is sampled from the prefix FIRST and the rest continue as
# before. These are additional seats, not a reallocation: the crown keeps its 22.
N_CLOUD_YOUNG = 7              # seats reserved for the juvenile prefix
YOUNG_PREFIX = 0.34            # ... which is every node born below this fraction of the
                               # mature tree's height
# A cloud's absolute size floors are what a whip cannot afford: CLOUD_BASE and CLOUD_MIN
# are world radii tuned for a mature crown, and on a 0.68-unit seedling one of them is a
# ball a quarter of the tree's height across. Both are scaled by the same maturity scalar
# that eases the shell rules in, so a tuft on a whip is a tuft.
CLOUD_FLOOR_YOUNG = 0.55       # the absolute floors, as a fraction of themselves, at the
                               # seedling. Measured DOWN from 1.0 rather than up: at 0.34
                               # the mid-track tufts fell under a delivered pixel each and
                               # the whip read as bare, which trades one defect for the
                               # opposite one.
CLOUD_ORDERS = 4.6             # a node bears canopy within this many orders of a live tip
CLOUD_ORDERS_YOUNG = 20.0      # ... but a SAPLING has no interior: 20 exceeds the depth of
                               # any young tree here, so while young the rule is OFF rather
                               # than merely loose. Eased between the two by `mat` below.
CLOUD_RISE = 1.5               # iterations for a newly live node to pull its weight. It
                               # was 3.2 while blades covered the young frames; with the
                               # canopy alone, a branching burst puts a whole shell of
                               # nodes one order deeper in a single frame, and a lag longer
                               # than the frame step means the new tips cannot pay for it.
CLOUD_SAT = 3.4                # summed weight at which a cloud reaches its own extent
CLOUD_EXT = 1.34               # radius from the weighted spread of the nodes it covers
CLOUD_BASE = 0.062
CLOUD_MIN, CLOUD_CAP = 0.085, 0.352
CLOUD_SQUASH = 0.93            # a cloud is a ROUNDED mass. v2's 0.82 plus a near-vertical
                               # key made each lobe a flat-topped plate, and a pile of
                               # plates reads as stacked lily pads rather than as canopy
# How far a twig tapers away under its own canopy weight. 0.32 was enough while the leaves
# were always AHEAD of the wood: a cloud was already wider than the twigs it sat on, so the
# taper only had to kill the millimetre of bark poking through a lobe.
#
# ADR-0293 inverts that. In a two-phase track the twigs reach their FULL length in the wood
# phase and the clouds then grow outward from inside them, so through the whole flush every
# outer twig stands proud of the foliage that is arriving on it — measured on the first cut
# as a fringe of bare spikes around the crown from the first leafy frame to about two thirds
# of the way through. There is no length lever: a twig's extent is its skeleton. What there
# is is RADIUS, and a sub-pixel twig is an absent twig at 128 px, which is the same
# mechanism the flecks were killed with. So the taper goes deep enough that a fully leafed
# twig disappears into its own cloud.
#
# It is keyed on `wn`, which is zero for the whole wood phase, so the winter tree is drawn
# at full girth and none of this touches it.
WOOD_HIDE = 0.78               # how far a twig tapers away under its own canopy weight

# THE CANOPY FLOOR — ADR-0289 D2's first named defect, "we seem to be added the greenary
# at the trunk for some reason". The outer-orders rule above is TOPOLOGICAL: it asks how
# many orders a node sits below the deepest live tip, and a short lateral that ENDS low on
# the bole is a live tip, so it scored full canopy weight and grew a cloud beside the
# trunk. Measured on the mature frame: v3's lowest foliage pixel sat at 16% of tree
# height, against exp-16's 44%, and three of its 21 clouds were centred at 30%, 36% and
# 48% — detached bubbles flanking a bare bole, which is exactly the read the owner named.
#
# The floor is the missing GEOMETRIC half of the same question: a node bears canopy only
# if it is in the crown, and the crown is the top of the tree. It is expressed as a
# FRACTION of the live tree's own height rather than as a world z, which is what lets one
# rule serve both ends of the track — a sapling's apex is at 100% of its own height and
# greens, while the same lateral, once the leader has climbed past it, falls below the
# rising floor and lignifies. Losing its leaves as it is overtopped is what a real low
# limb does; `measure.py --monotone` is what proves the viewer never sees the loss.
#
# BOTH shell rules — the floor here and CLOUD_ORDERS above — describe a tree that already
# HAS a crown, and a sapling is all crown. Applied at full strength to a whip they take
# foliage off it faster than it can grow: the outer-orders window becomes a fixed-length
# tuft sliding up an extending leader while the floor climbs underneath it. Measured, the
# first cut LOST canopy at frames 4->5->6 (64 -> 41 -> 23 proxy px) and failed
# `measure.py --monotone` on the delivered pixels.
#
# So one MATURITY scalar — how tall the live tree is against the mature tree — eases both
# rules in together. At the seedling there is no floor and every order is an outer order;
# at maturity both are exactly the shell rules the mature crown needs. This is the same
# move as expressing the floor as a fraction rather than a world z, applied once more.
CANOPY_FLOOR = 0.40            # no canopy weight below this fraction of the live top
CANOPY_FEATHER = 0.13          # ... ramping to full over this much more of it
CANOPY_MATURE_Z = 1.00         # the live top, as a fraction of the MATURE top, at which
                               # both shell rules reach full strength

# THE FLOOR IS A FUNNEL, NOT A PLANE — and this, not the shading, is what "you cannot see
# the limbs running through our canopy" actually was. The gap had been carried since v3 as
# a GREEN FRACTION (ours 71%, exp-16 51%), and that number turns out to conflate two
# independent things: a third of exp-16's "non-green" crown is its own warm highlight
# band, which fails a naive G>R test. Measured by nearest FAMILY instead, the honest
# statement is BARK: 670 px of exp-16's mature crown against 185 of ours, a 3.6x gap.
#
# Blending the canopy normals toward the crown proxy above moves it NOT AT ALL — measured
# across the whole `--crown-normals` fork, bark held at 185-188 px from mix 0.0 to 1.0,
# because normals decide which BAND a canopy pixel takes and never whether a pixel is
# canopy. So the two halves of the old "crown structure" gap have two different causes,
# and this is the geometric one.
#
# CANOPY_FLOOR above is a horizontal PLANE at a fraction of the live top: below it no
# node bears canopy, above it every node does. exp-16's is not a plane. Its trunk forks
# into a candelabra of primary limbs that splay up and OUT, and its canopy sits on the
# ENDS of them, leaving an open cone above the fork through which the limbs read — the
# lower centre of its crown is bare wood and sky. Ours fills that cone, so the same
# limbs exist and are simply behind cloud. That is why lowering WOOD_HIDE never fixed it
# in v3 (the taper only thins a twig, it cannot move a cloud off one) and why v6's
# two-phase staging did not either (at f18 the two tracks are the same tree).
#
# So the floor gains a RADIAL term: it is lifted near the trunk axis and unchanged at the
# rim. Same self-similar form as everything else at this end of the tree — the radius is
# a fraction of the LIVE crown's own half-width, not a world constant, so one rule serves
# a whip and a mature crown. The void it carves is the "crown's central void" v3 claimed
# fell out of the outer-orders weight for free; measured, it does not.
# THE LOWER CROWN IS A SHELL, AND A VOID CARVED INSIDE A SHELL IS INVISIBLE THROUGH IT.
# This is the last of the crown-structure gap and the funnel above does not close it: v7
# delivered 206 px of in-crown bark against exp-16's 670, with the funnel's own response
# measured at ~160 px per unit of lift, so the plane-to-funnel move is spent.
#
# THE MECHANISM, named in v7 §6 and confirmed here by measurement. exp-16 is a DRAWING, so
# its open lower crown is open FROM THE FRONT: its trunk forks into a candelabra of ~5
# primary limbs, its canopy lobes sit on the ENDS of them, and there is sky and bark in the
# gaps between them. Ours is a closed 3D shell of ~20 lobes whose lower ones merge into a
# continuous band, and the limbs run BEHIND it. Everything the funnel does is carve a void
# INSIDE that band, where the viewer cannot see it.
#
# TWO THINGS WERE MEASURED BEFORE ANY OF THIS WAS BUILT, both with `bark_proxy()` on the
# mature frame against the crown mask pinned to the delivered silhouette:
#
#   · THE CEILING IS NOT THE PROBLEM. Remove the lobes entirely and 1292 proxy px of wood
#     stand in that same crown region — against exp-16's 670 rendered, ~585 in proxy units.
#     The limbs we want to see ARE there; they are covered.
#   · THICKENING THE LIMBS BUYS EXACTLY NOTHING. Scaling every crown limb's radius 1.5x,
#     2x, 3x and 4x moved in-crown bark from 186 to 186, 186, 186 and 186 — not
#     approximately, identically — because the wood sits wholly inside the canopy
#     silhouette and a thicker hidden limb is still hidden. "Primary limbs thick enough to
#     stand proud of it", the other half of v7's proposed next lever, is therefore FALSE on
#     this skeleton and is not worth a render. The canopy has to open.
#
# So the canopy opens, by the same one-scalar self-similar form as every other rule at this
# end of the tree: a lobe's radius is scaled by where it sits between the CANOPY FLOOR and
# the LIVE top. At the floor a lobe is at its smallest, at the apex it is untouched, and
# the crown keeps a solid mass on top while gaps open low where the limbs are. It is eased
# in on `mat` like both shell rules, so a whip — every lobe of which is near its own live
# top — is untouched, which is also what keeps `--monotone` honest.
#
# ... AND THE SHRINK ALONE COSTS THE SILHOUETTE, which is why there are two scalars here
# and not one. Rendered at shrink 0.35/0.50/0.75 with no splay, bark went 206 -> 319/386/507
# — but exp-16's widest band is 0.58-0.67 and v7 matched it exactly, while 0.50 and 0.75
# moved OURS to 0.75-0.83 and lifted the foliage floor from exp-16's own 44% to 48-49%.
# The crown's shoulders climbed the tree and the pear turned back into a lollipop, which is
# ADR-0289 D2's second named defect arriving from the other direction.
#
# The reason is a one-line geometric fact: shrinking a lobe in place retreats its OUTER
# edge, and the outer edge is the one the silhouette is made of. exp-16 is wide at those
# heights AND shows bark, because its low canopy sits on the ENDS of splayed limbs — the
# rim is where the foliage is and the middle is where the sky is. So the shrink is paid
# for OUTWARD: a lobe that loses radius is pushed horizontally out by what it lost, and its
# INNER edge retreats instead. At 1.0 the outer surface does not move at all, so the
# half-width profile, the widest band and the camera's mature extent are held by
# construction rather than by tuning. The push is horizontal because the vertical is the
# one direction an upside-down pear cannot afford (ADR-0289 D2), the same reason the
# shell push below clamps its z component to zero.
#
# WHERE 0.90 CAME FROM: the reference, not the largest number in the column — the same rule
# that picked `--crown-normals` 0.22. Rendered at splay 1.0, in-crown bark runs
# 0.75 -> 551 px (13.0% of crown) and 0.90 -> 631 (15.3%) against exp-16's 670 (15.7%),
# while the crown itself closes on the reference from the other side (v7 4689 px, 0.90
# 4123, exp-16 4280). Going to 1.0 OVERSHOOTS the bark and undershoots the crown, which is
# copying a number rather than a structure.
CANOPY_LOW_SHRINK = float(arg("--low-shrink", "0.90"))
                               # how much smaller a lobe sitting AT the canopy floor is
                               # than one at the live top. 0 is the v7 crown.
CANOPY_LOW_SPLAY = float(arg("--low-splay", "1.0"))
                               # ... and how much of the lost radius is paid back as an
                               # outward push. 1.0 holds the outer surface exactly; 0 is
                               # the in-place shrink that costs the widest band.
CANOPY_LOW_RIM_DROP = float(arg("--low-rim-drop", "0.50"))
                               # ... and how much of the lost radius is dropped back at
                               # the outer rim. 0 exactly reproduces v8; 0.50 is v9.
#
# THE ONE COST IS THE FOLIAGE FLOOR, and the obvious repair was tried and is a BAD TRADE,
# recorded so it is not re-tried. Shrinking the lowest lobes lifts the lowest foliage pixel
# with them: exp-16's floor is 44% of tree height, v7 matched it exactly, and this delivers
# 48%. The faithful-looking fix is to fade the shrink toward the RIM, since exp-16's canopy
# is on the ENDS of its limbs — keep the outer lobes full, empty only the middle. Measured
# on the mature frame at shrink 0.90/splay 1.0, a rim fade of 0.5 recovers TWO points of
# floor and costs 169 px of bark, and a fade of 1.0 recovers three and costs 300: about 85
# px of bark per point of floor, against a lever whose whole purpose is bark. Raising the
# shrink to 1.0 to pay for it does not get the bark back (477 against 619). The fade was
# removed rather than left as a knob at zero; four points of floor is what this costs.
CANOPY_CORE_R = 0.46           # radial extent of the lift, as a fraction of the live
                               # crown's own half-width: 1.0 would lift the whole crown
#
# THE LEVER IS ~EXHAUSTED and the flag below exists to prove that rather than to invite a
# re-turn: measured on rendered frames at a fixed mix, lift 0.00 -> 187 px of bark,
# 0.20 -> 207, 0.34 -> 242, about 160 px per unit of lift. Reaching exp-16's 670 would
# need a lift near 3.0 — a floor three tree-heights above the ground. It is the wrong
# knob, not an under-turned one. Those three points are also the CALIBRATION SET for
# `bark_proxy()` below, which is why the constant is reachable from the command line.
CANOPY_CORE_LIFT = float(arg("--core-lift", "0.20"))
                               # ... and how much higher the floor sits on the axis, in
                               # the same units as CANOPY_FLOOR (fraction of live top)

# ------------------------------------------------------- crown proxy normals
# THE CANOPY SHADES AS ONE VOLUME — the first of the three techniques the owner triaged
# into this arc from a Ghibli-style Blender tutorial (the video's Data Transfer +
# Auto Smooth step), and the one aimed at the arc's oldest surviving gap.
#
# THE DEFECT, measured rather than described. `banded()` keys colour on the surface
# normal, and our crown is a pile of ~20 closed ellipsoids, so EVERY lobe presents every
# facing angle and carries its own full light-to-dark ramp. exp-16's crown carries ONE
# gradient across the whole canopy with the lobe boundaries drawn ON it. That single
# difference is also where the warm top highlight went, and the arithmetic says so: the
# highlight is just the top band of N·L, so a pile of blobs scatters it into twenty small
# caps instead of pooling it into one. Ours holds 830 px of (173,167,114) on the mature
# frame against exp-16's 874 — nearly the same ABSOLUTE highlight — spread over a 4706 px
# crown against 4280. The highlight never thinned; the crown grew around it.
#
# THE WIRING IS OURS, NOT THE VIDEO'S, and both halves of that are forced. ADR-0280 D1
# forbids a hand-sculpted proxy mesh, and a Data Transfer modifier would need a
# nearest-surface mapping heuristic we would then have to tune. So the proxy is ANALYTIC
# and generated from the canopy we already author: an ellipsoid fitted to the lobe set
# THIS frame emitted, whose normal is exact everywhere and needs no mapping at all. It
# also tracks the crown through ADR-0293's flush for free, where a fixed proxy sized to
# CROWN_C/CROWN_R would be wrong on every frame but the last.
#
# Verified before it was built, because the whole technique rests on it: Cycles'
# Geometry>Normal — the socket `banded()` already reads — honours custom split normals.
# A sphere with all normals forced to +Z renders as ONE band where the same sphere smooth
# -shaded hits all five. So no shader changes, the band list is untouched, and this is
# not the video's EEVEE-only `Shader to RGB` route by another name.
#
# It is a BLEND, not a replacement: the lobe normals carry the clump silhouettes and the
# proxy carries the volume. At 1.0 the canopy is a bare ellipsoid and the clumps stop
# reading entirely, so the delivered value is picked from rendered frames like every
# other art-direction number here (`--crown-normals`, and 0.0 is exactly v6).
#
# WHERE 0.22 CAME FROM, and it is not "as unified as possible". `measure.py` now reports
# the highlight's connected CAPS, and read against exp-16 rather than against the extreme
# that metric has a peak rather than a slope: exp-16 does NOT pool its highlight into one
# region (12 caps, largest 30% of it) — it carries a few LARGE caps on a shared value
# structure. Measured on the mature frame, every row with the funnel floor below in place
# so the fork moves exactly one variable:
#
# RE-MEASURED ON THE v8 CROWN, because the table below was taken on the v7 geometry and
# the low-crown lever above changed the very lobes these normals are blended against. A
# measurement table that describes a superseded shape is the same silent-staleness trap the
# fork PICTURES have (see the README's §5 note on `frames/contact-sheet.png`), and it is
# worth five one-frame renders to not carry it. All five rows re-rendered in one pass:
#
#     mix   highlight        caps   largest   cap sizes             bark
#     0.00     729 (17.7%)     13       24%   178 141 129  91 77    631   <- v6's shading
#     0.22     759 (18.4%)     13       28%   216 175 125 122 43    631   <- delivered
#     0.32     751 (18.2%)     13       32%   243 182 129 120 33    630
#     0.45     709 (17.2%)      8       38%   266 190 128 105 13    629
#     1.00     476 (11.5%)     13       76%   363  67  25   8  3    629
#     exp-16   874 (20.4%)     12       30%   261 244 198  83 45    670
#
# 0.22 SURVIVES THE RE-MEASUREMENT AND IS NOW THE STRICT OPTIMUM, where on the closed crown
# it was a considered compromise. It is the peak of the highlight column outright (759, over
# 0.32's 751 and 0.45's 709 — on the v7 crown those two were both slightly HIGHER than it),
# and its largest cap at 28% is the nearest to exp-16's 30% of any row. Opening the lower
# crown moved the percolation point too: the caps used to collapse into one blob between
# 0.32 and 0.45, and now hold their structure to 0.45 and only percolate by 1.00. Nothing
# had to be re-tuned — the default is unchanged — but that is now a measured statement about
# the delivered tree rather than one inherited from a tree we no longer ship.
#
# Read the last column too, because it is the honest limit of this technique, and it is the
# claim v8 re-verified rather than assumed: BARK IS 629-631 PX AT EVERY MIX FROM 0 TO 1, as
# it was 206-207 flat on the closed crown. Normals decide which band a canopy pixel takes
# and never whether a pixel is canopy, so nothing here touches how much limb you can see —
# that is the low-crown lever's column, and it is what took bark from 206 to 631.
CROWN_NORMAL_MIX = float(arg("--crown-normals", "0.22"))
if not 0.0 <= CROWN_NORMAL_MIX <= 1.0:
    raise SystemExit(f"--crown-normals must be 0..1, got {CROWN_NORMAL_MIX}")


def crown_proxy(lobes):
    """The smooth crown proxy: an analytic ellipsoid fitted to the live lobe set.

    Centre is mass-weighted (r**3, so a big lobe pulls harder than a tuft). Each
    half-extent is the farthest lobe SURFACE on that axis rather than the farthest
    centre, so the proxy spans the canopy the viewer sees. Pure numpy, so the
    `--no-render` plan can print it without launching a render.
    """
    P = np.array([c for _ci, c, _r in lobes], dtype=np.float64)
    R = np.array([r for _ci, _c, r in lobes], dtype=np.float64)
    w = R ** 3
    ctr = (P * w[:, None]).sum(axis=0) / w.sum()
    ext = (np.abs(P - ctr) + R[:, None]).max(axis=0)
    return ctr, np.maximum(ext, 1e-4)


# ---------------------------------------------------------------- base
# The buttress. v2 gave the tree one (gap 2) and v4 measured what it is worth: exp-16's
# base row spans 46 px at 5% of its height where this track's spanned 14, the largest
# single difference left in the half-width profile. Three separate causes, all fixed here.
#
# 1. THE FLARE NEVER REACHED FULL STRENGTH. `t_root` normalised the live trunk radius
#    against a hard-coded 0.175, and this skeleton's mature trunk is 0.1173 — so the
#    delivered mature frame was drawn at 72% of its own authored flare and no number in
#    the file said so. It is now normalised against the MATURE trunk radius, measured
#    once from the mature frame (`R0_MATURE`) exactly as `R_SCALE` already is, so full
#    growth means full flare by construction rather than by a constant that happens to
#    match a skeleton.
# 2. THE FLARE WAS TOO SHORT to be a buttress. exp-16 is still 37 px wide at 8% of its
#    height; an exp(-z/0.12) decay is 15% of its peak by then, so ours read as a fillet
#    at the soil rather than as ridges climbing the bole.
# 3. THE SPURS WERE TOO SHORT, full stop.
N_ROOT = 9
FLARE_H = 0.22                 # height over which the bole flares into the roots
FLARE_AMT = 0.95               # peak extra radius at the soil, as a fraction

# ROOTS ARRIVE WITH THE TREE, NOT WITH THE TRUNK. Keyed on girth alone the buttress was
# absent for the first third of the track — `t_root` was 0.06 at frame 4 — and exp-16
# carries a root fan 35-45% of its own height wide from frame ZERO. That fan is a large
# part of what makes its mid frames read as a rooted whip rather than as a stick, so the
# spurs' REACH is a FRACTION OF THE LIVE TREE'S OWN HEIGHT and their GIRTH follows the
# trunk they leave. A seedling standing on visible roots is not a botanically plausible
# seedling, and ADR-0289 D1 is what says it does not have to be.
#
# The fraction is the same idea as CANOPY_FLOOR at the other end of the tree, and it was
# reached the same way — by getting it wrong first. Ramping the reach toward the MATURE
# world length made the fan arrive early in absolute units, so a 32 px seedling stood on
# a 28 px span of one-pixel spokes: a rake, not a root. Self-similar, the fan is a fixed
# share of whatever tree is standing there, which is what exp-16 shows at every stage.
R0_MATURE = 0.1173             # recalibrated below, once the mature frame is known


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
    # ... and the mid ring, below the bole break, so the whip has somewhere to put shoots
    for i in range(N_MID):
        th = h01(i, 211) * math.tau
        rr = MID_R[0] + (MID_R[1] - MID_R[0]) * h01(i, 213)
        zz = MID_Z[0] + (MID_Z[1] - MID_Z[0]) * h01(i, 215)
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


def _sapling_preset(name):
    """Read one of Sapling's nine shipped species presets into operator kwargs.

    Sapling's preset files are an SPDX comment header followed by a single dict LITERAL
    of operator properties — not the `op.<prop> = <value>` operator-preset scripts other
    Blender add-ons use. Parsing them for `op.` assignments therefore silently yields an
    EMPTY dict and every preset quietly renders Sapling's DEFAULT tree, which is exactly
    the wrong-but-plausible result this comment exists to stop recurring.

    Unknown props are DROPPED rather than raised on, so a preset carrying keys this
    build's operator no longer declares still loads what it can.
    """
    import ast
    import os as _os
    mod = __import__("bl_ext.blender_org.sapling_tree_gen", fromlist=["*"])
    path = _os.path.join(_os.path.dirname(mod.__file__), "presets", f"{name}.py")
    if not _os.path.isfile(path):
        avail = sorted(f[:-3] for f in _os.listdir(_os.path.dirname(path))
                       if f.endswith(".py"))
        raise SystemExit(f"no Sapling preset {name!r} at {path}; have {avail}")
    body = "".join(l for l in open(path, encoding="utf-8")
                   if not l.lstrip().startswith("#")).strip()
    raw = ast.literal_eval(body)
    if not isinstance(raw, dict) or not raw:
        raise SystemExit(f"Sapling preset {name!r} did not parse to a non-empty dict")
    return raw


def _tree_add(kw):
    """Call Sapling, dropping any property this build's operator does not declare.

    Do NOT try to pre-filter against `bpy.types.CURVE_OT_tree_add.bl_rna.properties` —
    that lists only the 14 GENERIC operator keys (bl_idname, options, ...) and none of
    the add-on's own, so filtering by it silently discards every real property and
    renders Sapling's default tree under every preset name. The failure is invisible:
    you get a tree, it just isn't the one you asked for. Ask the operator instead, by
    calling it and removing whatever it rejects.
    """
    import re
    kw, dropped = dict(kw), []
    while True:
        try:
            bpy.ops.curve.tree_add(**kw)
            if dropped:
                print(f"SAPLING dropped unknown props: {dropped}", flush=True)
            return kw
        except TypeError as exc:
            m = re.search(r'keyword "([^"]+)"', str(exc))
            if not m or m.group(1) not in kw:
                raise
            dropped.append(m.group(1))
            kw.pop(m.group(1))


def build_skeleton_sapling():
    """A Sapling-generated MATURE tree, read back as our own Node graph.

    Sapling answers a different question than we do: it produces one finished tree, not a
    growth sequence. Re-running it with smaller parameters to get younger stages does NOT
    work — the generator reshuffles, so frame k would not be frame k+1 with branches
    removed, and the track would read as a morph. That is exactly the failure ADR-0280
    D1's strict-prefix invariant exists to prevent.

    So the division of labour is: Sapling owns the mature FORM, we own GROWTH. We take
    its armature (which carries an explicit parent hierarchy), rebuild it as our Node
    list, and synthesise a birth wave outward from the root at constant extension rate.
    Because every segment has positive length, birth is strictly increasing along any
    root->tip path, which makes the prefix property hold BY CONSTRUCTION rather than by
    tuning — the same guarantee the space-colonisation loop gives, from a different
    source.
    """
    import addon_utils
    # Order matters: read_factory_settings reloads preferences and takes the add-on with
    # it, so enabling first silently leaves the operator unregistered.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("bl_ext.blender_org.sapling_tree_gen",
                       default_set=False, persistent=True)
    kwargs = _sapling_preset(SAP_PRESET)
    kwargs.update(do_update=True, useArm=True, showLeaves=False, seed=SEED % 1000)
    if SAP_BASE_SIZE != "":
        kwargs["baseSize"] = float(SAP_BASE_SIZE)
    kwargs = _tree_add(kwargs)
    print(f"SAPLING preset={SAP_PRESET} applied={len(kwargs)} props "
          f"baseSize={kwargs.get('baseSize')} levels={kwargs.get('levels')} "
          f"scale={kwargs.get('scale')} branches={kwargs.get('branches')}", flush=True)
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None:
        raise SystemExit("Sapling produced no armature — cannot read a hierarchy")

    # Hierarchy order, so a parent is always emitted before its children. Every consumer
    # downstream (live_depth's single reverse pass, the pipe model) relies on that.
    order, stack = [], [b for b in arm.data.bones if b.parent is None]
    while stack:
        b = stack.pop(0)
        order.append(b)
        stack.extend(b.children)

    def key(v):
        return (round(v.x, 5), round(v.y, 5), round(v.z, 5))

    nodes, at = [], {}
    for b in order:
        hk = key(b.head_local)
        if hk in at:
            par = at[hk]
        elif b.parent is None:
            nodes.append(Node(np.array(b.head_local, dtype=float), -1, 0.0))
            par = at[hk] = len(nodes) - 1
        else:
            # A lateral branch whose head does not coincide with any emitted node: attach
            # it to its bone parent's tail. Sapling occasionally parents a lateral to the
            # NEXT trunk segment, so position is the more reliable join and this is the
            # fallback, not the rule.
            par = at.get(key(b.parent.tail_local))
            if par is None:
                continue
        idx = len(nodes)
        nodes.append(Node(np.array(b.tail_local, dtype=float), par, 0.0))
        nodes[par].kids.append(idx)
        at[key(b.tail_local)] = idx

    # Normalise to our world scale: every canopy/leaf/flare constant is absolute.
    zmax = max(float(n.p[2]) for n in nodes)
    s = SAP_TARGET_H / zmax
    for n in nodes:
        n.p = n.p * s

    # RESAMPLE to a uniform segment length before anything else. Sapling's bone lengths
    # are wildly uneven — the quaking aspen's trunk is 3 bones spanning 13 units while a
    # twig segment is 0.08 — so an arc-length birth wave over the raw bones spends the
    # first third of the track extending a BARE POLE (measured: live=1 for three frames).
    # Uniform segments also give the mesh emitter enough rings along the bole to carry
    # taper and flare, which the 3-bone trunk did not.
    # Resampling is per CHAIN — the maximal single-child run between two junctions — not
    # per edge. Per-edge splitting can only ADD nodes, which is fine for the 158-bone
    # default tree but ruinous for a preset like small_maple (7093 bones, most of them
    # sub-pixel twig segments at a 128 canvas). Walking chains lets one pass both SPLIT a
    # 13-unit trunk bone and MERGE a run of tiny twig bones to the same target length.
    raw = nodes
    nodes = [Node(raw[0].p.copy(), -1, 0.0)]
    remap, junctions = {0: 0}, [0]
    while junctions:
        j0 = junctions.pop()
        for first in raw[j0].kids:
            path, cur = [j0, first], first
            while len(raw[cur].kids) == 1:
                cur = raw[cur].kids[0]
                path.append(cur)
            pts = [raw[k].p for k in path]
            seg = [float(np.linalg.norm(pts[k + 1] - pts[k])) for k in range(len(pts) - 1)]
            total = sum(seg)
            steps = max(1, int(round(total / SAP_SEG)))
            at = remap[j0]
            for j in range(1, steps + 1):
                # walk `target` along the polyline so a merged run keeps the chain's shape
                target, k, run = total * j / steps, 0, 0.0
                while k < len(seg) - 1 and run + seg[k] < target:
                    run += seg[k]
                    k += 1
                t = (target - run) / seg[k] if seg[k] > 1e-12 else 1.0
                nodes.append(Node(pts[k] + (pts[k + 1] - pts[k]) * min(1.0, t), at, 0.0))
                nodes[at].kids.append(len(nodes) - 1)
                at = len(nodes) - 1
            remap[path[-1]] = at
            if raw[path[-1]].kids:
                junctions.append(path[-1])

    # The birth wave: growth propagates outward from the root at constant extension rate,
    # so birth is arc length from the root — one unit per segment, now that segments are
    # uniform. Rescaled so the deepest node is born at the SAME iteration the
    # space-colonisation tree's is, which is what lets every N-keyed gate below (cloud
    # onset, AGE_TAIL, TAU_AGE) carry over unretuned. Positive segment
    # lengths make birth strictly increasing root->tip, so the prefix property holds by
    # construction.
    for i, n in enumerate(nodes):
        if n.parent < 0:
            continue
        d = n.p - nodes[n.parent].p
        if SAP_BIRTH == "arc":
            cost = float(np.linalg.norm(d))
        else:
            # Climbing is the expensive move; reaching out and drooping are cheap. A
            # lateral therefore completes soon after the leader passes its attachment
            # height, instead of racing the leader to the top.
            cost = abs(float(d[2])) + SAP_W_OUT * float(math.hypot(d[0], d[1]))
        n.birth = nodes[n.parent].birth + cost
    deepest = max(n.birth for n in nodes)
    for n in nodes:
        n.birth *= SAP_MAX_BIRTH / deepest

    # kids[0] must be the trunk CONTINUATION, not whichever lateral Sapling emitted first
    # — the root-flare walk follows kids[0] up the bole. Straightest child wins.
    for n in nodes:
        if len(n.kids) > 1:
            d = n.p - (nodes[n.parent].p if n.parent >= 0 else n.p - np.array([0, 0, 1.0]))
            nd = d / (np.linalg.norm(d) or 1.0)
            n.kids.sort(key=lambda k: -float(
                (nodes[k].p - n.p) @ nd / (np.linalg.norm(nodes[k].p - n.p) or 1.0)))

    print(f"SKEL source=sapling preset={SAP_PRESET} bones={len(arm.data.bones)} "
          f"raw_nodes={len(raw)} nodes={len(nodes)} zmax_raw={zmax:.3f} scale={s:.4f} "
          f"seg={SAP_SEG} birth={SAP_BIRTH} maxbirth={max(n.birth for n in nodes):.2f} "
          f"baseSize={kwargs.get('baseSize', 'preset')}", flush=True)
    return nodes


NODES = build_skeleton_sapling() if SKELETON == "sapling" else build_skeleton()
NMAX_BIRTH = max(n.birth for n in NODES)
Z_MATURE = max(float(n.p[2]) for n in NODES)
N_FLOOR = 2.0
print(f"SKEL apex_z={max(float(n.p[2]) for n in NODES):.3f} "
      f"source={SKELETON}", flush=True)


def cloud_seats(nodes):
    """Farthest-point sampling of the MATURE skeleton into N_CLOUD seats, then a fixed
    assignment of EVERY node to its nearest seat. Computed once, so a cloud can never
    appear, merge or split between frames — only its live membership changes.

    Sampling the whole skeleton rather than only the mature tips is what lets ONE
    mechanism serve both ends of the track: a sapling's live apex is owned by some seat
    and gets its cloud there, and the mature crown's shell is owned by the crown seats.

    It is TEMPTING to spend every seat on the mature crown, since the two or three that
    land low are exactly where v3 grew its clouds-beside-the-trunk. Measured, that is the
    wrong repair and it was tried: restricting the seats leaves a sapling — every node of
    which is below the mature crown floor — assigned to a single nearest crown seat, so
    the first NINE frames render one lollipop blob. The low seats are not the defect; the
    canopy WEIGHT rule was, and the canopy floor is where that is fixed. A low seat costs
    nothing once weight is floored, because the nodes it owns score zero at maturity.

    The OPPOSITE move is the one that was missing, and it is v5's. Sampling the whole
    skeleton spends seats where the nodes are, and 97% of them are in the mature crown —
    so the juvenile prefix, which is every frame before about frame 8, got two seats and
    could only render as one or two masses. N_CLOUD_YOUNG seats are therefore sampled
    from the PREFIX first, by the same farthest-point rule at a smaller scale, and the
    crown's own N_CLOUD then continue from there. This is not the trapped move above: it
    ADDS seats low rather than withdrawing them from the crown, and the same canopy floor
    that makes a low seat harmless at maturity makes these harmless too.

    Nothing hangs under the middle of the crown, because an interior node is many orders
    from a live tip and carries no canopy weight — the void that lets you watch the limbs
    run up into the foliage falls out of the outer-orders rule rather than being carved."""
    P = np.array([n.p for n in nodes])
    zmax = float(P[:, 2].max())
    juv = np.nonzero(P[:, 2] <= YOUNG_PREFIX * zmax)[0]
    seats = []
    d = np.full(len(nodes), np.inf)

    def take(i):
        seats.append(int(i))
        np.minimum(d, np.linalg.norm(P - P[int(i)], axis=1), out=d)

    if len(juv):
        take(juv[int(np.argmax(P[juv][:, 2]))])       # the tallest juvenile node
        dj = np.linalg.norm(P[juv] - P[seats[0]], axis=1)
        while len(seats) < min(N_CLOUD_YOUNG, len(juv)):
            nxt = juv[int(np.argmax(dj))]
            take(nxt)
            dj = np.minimum(dj, np.linalg.norm(P[juv] - P[nxt], axis=1))
    else:
        take(int(np.argmax(P[:, 2])))
    # ... then the crown, farthest-point as before. The first pick is the apex, since it
    # is the point farthest from everything already seated.
    while len(seats) < min(N_CLOUD_YOUNG + N_CLOUD, len(nodes)):
        take(int(np.argmax(d)))
    owner = np.argmin(np.linalg.norm(P[:, None, :] - P[seats][None, :, :], axis=2), axis=1)
    return [np.nonzero(owner == k)[0] for k in range(len(seats))]


CLUSTERS = cloud_seats(NODES)


def live_depth(alive):
    """Orders from each live node down to its deepest live descendant; 0 at a live tip.
    A child is always appended after its parent, so one reverse pass is exact."""
    dh = np.zeros(len(NODES))
    for i in range(len(NODES) - 1, -1, -1):
        if not alive[i]:
            continue
        best = -1.0
        for k in NODES[i].kids:
            if alive[k] and dh[k] > best:
                best = dh[k]
        dh[i] = 0.0 if best < 0 else best + 1.0
    return dh


def root_spec():
    """Buttress spurs. Each climbs the bole (rise) and descends outward to the soil,
    tapering — the shape that reads as PLANTED rather than as a pole on the ground.

    `reach` and `rise` are stated as fractions of the MATURE tree's height and scaled by
    the live tree's, per the N_ROOT block. Both are roughly doubled against v4, which is
    the third of the three causes listed there: measured, the widest spur reached 0.32
    world units from the axis (13 delivered px) where exp-16's buttress needs about 0.55.
    The direction magnitude below still shortens the spurs that point across the camera,
    so the range is authored against the widest one."""
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
            "reach": 0.40 + 0.24 * h01(i, 63),
            "rise": 0.28 + 0.18 * h01(i, 67),
            "thick": 0.62 + 0.42 * h01(i, 71),
            "wob": hsym(i, 73) * 0.05,
        })
    return out


ROOTS = root_spec()
# The half-width the buttress adds, per unit of `t_plant`. The camera extent has to know
# about it now that the fan arrives on the seedling: under `fixed` it changes nothing
# (the mature crown is wider), but a per-stage camera framed to a young frame's wood
# would otherwise crop the very organ that frame is being magnified to show.
ROOT_HALFW = max(abs(float(rs["dir"][0])) * rs["reach"] for rs in ROOTS)


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
        r0 = R_SCALE * (R_TIP_MIN + (R_TIP_MAX - R_TIP_MIN)
                        * (1.0 - math.exp(-age[i] / TAU_AGE)))
        s = sum(r[k] ** PIPE_E for k in NODES[i].kids if alive[k])
        r[i] = max(r0, s ** (1.0 / PIPE_E) if s > 0 else 0.0)

    # clouds: the canopy rides the OUTER ORDERS of live shoot and migrates outward with
    # growth. Weight per node falls off with how deep inside the live tree it sits, so an
    # apex bears canopy and a lignified interior does not.
    # Both heights are the EASED ones. A frontier node is alive from `birth <= N+1` but is
    # drawn at a fraction of its length, so reading either end off nd.p lets the floor
    # climb to a height the viewer cannot yet see — the canopy would recede from limbs
    # that have not visibly been overtopped.
    # x and y are eased for the same reason z is: the radial term of the canopy floor
    # below reads them, and an un-eased frontier node would sit at its full reach while
    # being drawn at a fraction of it.
    PF = np.array([nd.p if nd.parent < 0 else
                   NODES[nd.parent].p + (nd.p - NODES[nd.parent].p) * frac[i]
                   for i, nd in enumerate(NODES)])
    XF, YF, zf = PF[:, 0], PF[:, 1], PF[:, 2]
    ztop = float(zf[alive].max()) if alive.any() else 0.0
    grown = min(1.0, ztop / (CANOPY_MATURE_Z * Z_MATURE)) if Z_MATURE > 0 else 1.0
    mat = grown * grown * (3 - 2 * grown)         # 0 at the seedling, 1 at the crown

    dh = live_depth(alive)
    # the FLUSH (ADR-0293): zero until the wood phase is over, then a smooth ramp to full.
    # It multiplies every node's canopy weight, so a cloud's own radius comes up with it
    # (`sat` reads the summed weight) — leaves thicken onto the branches rather than
    # switching on at full size.
    con = np.clip((N - LEAF_ON) / (LEAF_FULL - LEAF_ON), 0.0, 1.0)
    con = con * con * (3 - 2 * con)
    orders = CLOUD_ORDERS_YOUNG + (CLOUD_ORDERS - CLOUD_ORDERS_YOUNG) * mat
    wn = np.clip(1.0 - dh / orders, 0.0, 1.0) * np.clip(age / CLOUD_RISE, 0.0, 1.0)
    # ... and the CANOPY FLOOR, the geometric half of the same question: is this node in
    # the crown at all? Measured against the LIVE tree's own top, so it rises with the
    # tree and one rule serves a sapling apex and a mature crown shell.
    if ztop > 1e-6:
        # ... and it is a FUNNEL: lifted on the trunk axis, unchanged at the rim, so the
        # primary limbs above the fork stand in open air instead of behind cloud. The
        # radius is normalised against the LIVE crown's own half-width — measured off the
        # nodes that currently bear canopy weight rather than off the mature envelope, so
        # a whip's tiny crown gets a whip-sized void rather than the mature one.
        rxy = np.hypot(XF, YF)
        lit = wn > 1e-6
        rtop = float(rxy[lit].max()) if lit.any() else 0.0
        if rtop > 1e-6:
            core = np.clip(1.0 - rxy / (CANOPY_CORE_R * rtop), 0.0, 1.0)
            core = core * core * (3 - 2 * core)
        else:
            core = np.zeros_like(rxy)
        floor = (CANOPY_FLOOR + CANOPY_CORE_LIFT * core) * mat
        wz = np.clip((zf / ztop - floor) / CANOPY_FEATHER, 0.0, 1.0)
        wn = wn * (wz * wz * (3 - 2 * wz))
    wn = wn * alive * con
    lobes = []
    for ci, cl in enumerate(CLUSTERS):
        w = wn[cl]
        tot = float(w.sum())
        if tot <= 0.05:
            continue
        P = np.array([NODES[i].p for i in cl])
        c = (P * w[:, None]).sum(axis=0) / tot
        # weighted spread of what this cloud actually covers, so a cloud never spans a
        # gap between two live regions it happens to own
        spread = math.sqrt(float((w * ((P - c) ** 2).sum(axis=1)).sum() / tot))
        sat = min(1.0, (tot / CLOUD_SAT) ** 0.45)
        # the absolute floors are a mature crown's; on a whip they are the ball. `fk` is
        # the same maturity scalar the shell rules ease in on, so one number describes
        # "how much of a crown is this" everywhere it is asked.
        fk = CLOUD_FLOOR_YOUNG + (1.0 - CLOUD_FLOOR_YOUNG) * mat
        rad = min(CLOUD_CAP, max(CLOUD_MIN * fk,
                                 CLOUD_EXT * spread + CLOUD_BASE * fk)) * sat
        # identity-keyed size variety: a crown of same-sized lumps reads as cauliflower,
        # and exp-16's canopy is conspicuously a few big masses among smaller ones
        rad *= 0.74 + 0.52 * h01(ci, 81)
        # ... and the LOW-CROWN SHRINK: where this lobe sits between the canopy floor and
        # the live top, in the same z/ztop units the floor is already expressed in, so one
        # rule serves a whip and a mature crown. Small at the bottom of the crown, full at
        # the apex — the gaps that open low are what lets the limbs read from the FRONT,
        # which is the only place the viewer is. Eased on `mat` so a sapling, whose every
        # lobe is near its own live top anyway, is left alone.
        lost = 0.0
        if CANOPY_LOW_SHRINK > 0.0 and ztop > 1e-6:
            uz = np.clip((float(c[2]) / ztop - CANOPY_FLOOR) / (1.0 - CANOPY_FLOOR),
                         0.0, 1.0)
            full = rad
            rad *= 1.0 - CANOPY_LOW_SHRINK * mat * (1.0 - uz * uz * (3 - 2 * uz))
            lost = full - rad
        rv = c - CROWN_C
        # ... but NEVER downward. The push exists because foliage sits on the OUTSIDE of
        # the crown volume; applied as a full radial vector it also pushed every cloud
        # below the crown centre DOWN and out, which is the one direction an upside-down
        # pear cannot afford to grow (ADR-0289 D2). Clamping the vertical component to
        # zero keeps the shell on the sides and the top and leaves the underside alone.
        rv = np.array([rv[0], rv[1], max(float(rv[2]), 0.0)])
        nrv = np.linalg.norm(rv)
        if nrv > 1e-9:
            c = c + rv / nrv * (0.22 * rad)
        # ... and the SPLAY: pay the shrink outward, so what retreats is the lobe's inner
        # edge and the crown keeps its rim. Purely horizontal — see CANOPY_LOW_SPLAY.
        if lost > 1e-9 and CANOPY_LOW_SPLAY > 0.0:
            nh = math.hypot(float(rv[0]), float(rv[1]))
            if nh > 1e-6:
                c = c + np.array([rv[0] / nh, rv[1] / nh, 0.0]) * (lost * CANOPY_LOW_SPLAY)
        # RIM DROP: restore some of the low foliage without closing the
        # middle back over the limbs. Only lobes the low-crown rule actually shrank can
        # move, and the smooth radial gate reaches full strength at the live crown rim.
        # Radius and horizontal position are deliberately untouched.
        if lost > 1e-9 and CANOPY_LOW_RIM_DROP > 0.0 and rtop > 1e-6:
            ur = np.clip((math.hypot(float(c[0]), float(c[1])) / rtop - CANOPY_CORE_R) /
                         (1.0 - CANOPY_CORE_R), 0.0, 1.0)
            rim = ur * ur * (3 - 2 * ur)
            c = c + np.array([0.0, 0.0, -lost * CANOPY_LOW_RIM_DROP * rim])
        if rad > 0.012:
            lobes.append((ci, c, rad))

    # the base, as TWO scalars — see the N_ROOT block. GIRTH follows the trunk, against
    # the mature trunk radius rather than a constant, so a mature tree gets the flare the
    # file authors. REACH follows the tree's own height and arrives early, because a
    # visible root fan is most of what makes exp-16's young frames read as planted.
    t_root = float(np.clip((r[0] - R_TIP_MIN) / (R0_MATURE - R_TIP_MIN), 0.0, 1.0)) ** 0.75
    t_plant = float(np.clip(ztop / Z_MATURE, 0.0, 1.0)) if Z_MATURE > 0 else 1.0
    return {"alive": alive, "frac": frac, "age": age, "r": r, "wn": wn,
            "lobes": lobes, "t_root": t_root, "t_plant": t_plant, "mat": mat,
            "con": float(con), "N": N}


# ---------------------------------------------------------------- camera framing
# Framed ONCE to the mature extent, then held byte-identical on every frame, so the
# tree grows inside a stable frame and its ground contact never drifts.
EL = math.radians(ELEV_DEG)
_UPV = np.array([0.0, math.sin(EL), math.cos(EL)])     # camera up, in world
# Calibrate the tip radius against the mature trunk (see R_SCALE). One pass is exact:
# scaling every tip radius by c scales every pipe-model radius by c.
if SKELETON != "space-colonisation":
    _r0 = float(frame_state(NMAX_BIRTH + AGE_TAIL)["r"][0])
    R_SCALE = SC_TRUNK_R / _r0
    print(f"SKEL trunk calibration: raw r0={_r0:.4f} -> R_SCALE={R_SCALE:.5f} "
          f"(target {SC_TRUNK_R})", flush=True)

_MAT = frame_state(NMAX_BIRTH + AGE_TAIL)
# ... and the mature TRUNK radius, which is what the flare is normalised against. Same
# one-pass shape as R_SCALE above: nothing consumed before this point reads `t_root` (the
# retiming proxy draws wood and canopy, never roots), so the mature frame can be measured
# with the placeholder and the placeholder then replaced. v4 left this a hard-coded 0.175
# against a mature trunk of 0.1173 and drew every frame at 72% of its authored flare.
R0_MATURE = float(_MAT["r"][0])
print(f"SKEL mature trunk r0={R0_MATURE:.4f} (flare normalisation)", flush=True)
_MAT = frame_state(NMAX_BIRTH + AGE_TAIL)
_TOP = max((NODES[i].p[2] + _MAT["r"][i]) for i in range(len(NODES)))
for _c in _MAT["lobes"]:
    _TOP = max(_TOP, float(_c[1][2] + _c[2] * 0.95))
_HALFW = max(abs(NODES[i].p[0]) for i in range(len(NODES)))
for _c in _MAT["lobes"]:
    _HALFW = max(_HALFW, float(abs(_c[1][0]) + _c[2]))
_HALFW = max(_HALFW, ROOT_HALFW * _MAT["t_plant"])

_V = 1.0 - 2.0 * ANCHOR_ROW / CANVAS          # ground row, in NDC (+1 top, -1 bottom)
PAD = 0.06


def _span_for(top, halfw):
    """The one framing rule, applied to whatever extent it is handed. Isolated so the
    mature camera and a per-stage camera are provably the SAME rule at two extents —
    the fork is about which extent to feed it, not about two different projections."""
    return max(2.0 * top * math.cos(EL) / ((1.0 - _V) - PAD), 2.0 * halfw / (1.0 - PAD))


SPAN = _span_for(_TOP, _HALFW)
TZ = -_V * SPAN / (2.0 * math.cos(EL))         # camera target height
# The camera the SCENE is built with. `fixed` never moves it off the mature values above;
# the other two conventions rebind it per frame in the drive loop. `to_screen` below
# deliberately keeps reading SPAN/TZ, because the retiming is an author-time measurement
# of GROWTH and must be identical across all three variants — otherwise a scale-convention
# comparison would also be comparing two different pacings.
CAM_SPAN, CAM_TZ = SPAN, TZ


def frame_extent(st):
    """This frame's own extent, by the same construction the mature block uses: live
    nodes at their partially-extended positions, plus their pipe radius, plus the lobes.
    At maturity every node is alive at frac 1, so this returns the mature extent exactly
    — which is why frame 18 is framed identically under all three conventions."""
    top = 0.0
    halfw = 0.0
    for i, nd in enumerate(NODES):
        if not st["alive"][i]:
            continue
        p = (nd.p if nd.parent < 0 else
             NODES[nd.parent].p + (nd.p - NODES[nd.parent].p) * st["frac"][i])
        top = max(top, float(p[2] + st["r"][i]))
        halfw = max(halfw, abs(float(p[0])))
    for _ci, c, rad in st["lobes"]:
        top = max(top, float(c[2] + rad * 0.95))
        halfw = max(halfw, float(abs(c[0]) + rad))
    return top, max(halfw, ROOT_HALFW * st["t_plant"])


def camera_for(st):
    """(span, tz) for one frame under the selected scale convention.

    Rendered tree height is CANVAS * top * cos(EL) / span, so holding `top/span` constant
    holds apparent height constant. `per-stage` does exactly that. `eased` interpolates
    the apparent height between OPEN_FRAC of mature at the seedling and 1.0 at maturity,
    as a compressed function of the TRUE relative size — the tree still visibly grows,
    it just never opens too small to read.
    """
    if FRAMING == "fixed":
        return SPAN, TZ
    top, halfw = frame_extent(st)
    span = _span_for(top, halfw)
    if FRAMING == "eased":
        s = (top - _TOP0) / (_TOP - _TOP0) if _TOP > _TOP0 else 1.0
        f = OPEN_FRAC + (1.0 - OPEN_FRAC) * max(0.0, min(1.0, s)) ** EASE_GAMMA
        # target apparent height = f * mature apparent height
        span = SPAN * (top / _TOP) / f
        span = max(span, _span_for(0.0, halfw))    # never crop this frame's own width
    return span, -_V * span / (2.0 * math.cos(EL))


def to_screen(p):
    """World -> canvas pixels, matching the Blender camera exactly. Used by the
    author-time retiming below so pacing is measured, not guessed."""
    sx = p[0]
    sy = (p[1] - 0.0) * math.sin(EL) + (p[2] - TZ) * math.cos(EL)
    return (CANVAS * (0.5 + sx / SPAN), CANVAS * (0.5 - sy / SPAN))


# ---------------------------------------------------------------- pacing (retiming)
def n_of_u(u):
    return N_FLOOR + (0.055 + 0.945 * u ** 1.22) * (NMAX_BIRTH + AGE_TAIL - N_FLOOR)


# The seedling's extent — the low end of the `eased` convention's compression, so its
# opening frame lands at exactly OPEN_FRAC of the mature apparent height.
_TOP0 = frame_extent(frame_state(n_of_u(0.0)))[0]


def cheap_silhouette(st, size=96, wood=True):
    """An analytic stand-in for the render, used only to MEASURE growth pacing.
    Discs for every live internode and lobe; never shipped.

    `wood=False` rasterises the CANOPY alone, which is the author-time proxy for what
    `measure.py --monotone` will later count in the delivered pixels. That check is the
    one obligation the canopy floor creates — a rising floor takes foliage off a limb the
    leader has overtopped — and finding a violation needed a ten-minute render before this
    existed, so it is worth the twenty lines. It is a PROXY: the real check still runs on
    the shipped frames."""
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

    if wood:
        for i, nd in enumerate(NODES):
            if not st["alive"][i] or nd.parent < 0:
                continue
            a = NODES[nd.parent].p
            b = a + (nd.p - a) * st["frac"][i]
            for t in (0.0, 0.5, 1.0):
                disc(a + (b - a) * t, st["r"][i])
    for _ci, c, rad in st["lobes"]:
        disc(c, rad)
    return m


def bark_proxy(st, size=128):
    """An author-time stand-in for `measure.py`'s BARK IN CROWN — how much limb you can
    see running through the canopy — rasterised at the same 128 px the track ships at.

    It exists because the limb gap is GEOMETRY (v7 §4 proved shading cannot touch it), and
    geometry is decided before a single sample is traced: every candidate for opening the
    lower crown is a change to where the lobes are and how big they are, which this file
    already knows in `frame_state`. A ten-minute render to rank a fork whose answer is in
    the lobe list is the same waste `cheap_silhouette` above already removed for pacing.

    Wood discs with the WOOD_HIDE taper applied (a sub-pixel twig is an absent twig — the
    proxy therefore reproduces the taper's whole point rather than drawing every twig at a
    forced minimum radius the way `cheap_silhouette` does), lobe discs, crown = the top 62%
    of the bbox exactly as `crown_mask()` defines it, bark = wood not covered by canopy.

    IT HAS NO DEPTH, and that is a deliberate simplification with a known sign: a lobe
    BEHIND a limb occludes it here and does not in the render, so the proxy UNDER-reports.
    It is validated against the delivered pixels rather than trusted — see §1 of the v8
    README for the fork it was calibrated on (`--core-lift`, the one fork whose rendered
    answer was already measured). Use it to RANK candidates; the shipped number is always
    `measure.py` on the rendered frames."""
    k = size / CANVAS
    yy, xx = np.mgrid[0:size, 0:size]
    wood = np.zeros((size, size), dtype=bool)
    leaf = np.zeros((size, size), dtype=bool)

    def disc(m, p, rad):
        cx, cy = to_screen(p)
        cx, cy = cx * k, cy * k
        rr = rad / SPAN * CANVAS * k
        x0, x1 = max(0, int(cx - rr - 1)), min(size, int(cx + rr + 2))
        y0, y1 = max(0, int(cy - rr - 1)), min(size, int(cy + rr + 2))
        if x1 <= x0 or y1 <= y0:
            return
        m[y0:y1, x0:x1] |= (((xx[y0:y1, x0:x1] - cx) ** 2
                             + (yy[y0:y1, x0:x1] - cy) ** 2) <= rr * rr)

    r = st["r"] * (1.0 - WOOD_HIDE * st["wn"])
    for i, nd in enumerate(NODES):
        if not st["alive"][i] or nd.parent < 0:
            continue
        a = NODES[nd.parent].p
        b = a + (nd.p - a) * st["frac"][i]
        r1 = r[i] + (r[nd.parent] - r[i]) * (1.0 - st["frac"][i])
        for t in (0.0, 0.25, 0.5, 0.75, 1.0):
            disc(wood, a + (b - a) * t, r[nd.parent] + (r1 - r[nd.parent]) * t)
    for _ci, c, rad in st["lobes"]:
        disc(leaf, c, rad)
    solid = wood | leaf
    ys = np.nonzero(solid.any(axis=1))[0]
    if not len(ys):
        return 0, 0
    top, bot = int(ys.min()), int(ys.max())
    crown = solid.copy()
    crown[top + int(round((bot - top + 1) * 0.62)):, :] = False
    return int((crown & wood & ~leaf).sum()), int(crown.sum())


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

    def blob(self, c, rad, key, squash=CLOUD_SQUASH):
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


def apply_crown_normals(ob, lobes):
    """Pull every canopy vertex's shading normal toward the crown proxy's, so the whole
    canopy shades as one volume. Returns the mix actually applied.

    The base is the mesh's OWN smooth normals, not an analytic ellipsoid normal
    recomputed from the lobe axes. That matters: blob() adds a low-frequency vertex
    displacement, and an analytic base would silently drop its contribution — which would
    change the render at mix=0 and make the whole measurement dirty. Read this way,
    mix=0 is an exact no-op and the flag is a clean one-variable fork.

    Applied to the CANOPY only. The wood keeps its own normals, because limbs reading as
    limbs is the other half of the same gap.
    """
    if CROWN_NORMAL_MIX <= 0.0 or len(lobes) < 2:
        return 0.0                      # one lobe already IS its own volume
    me = ob.data
    nv = len(me.vertices)
    ctr, ext = crown_proxy(lobes)

    co = np.empty(nv * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    base = np.empty(nv * 3, dtype=np.float64)
    me.vertex_normals.foreach_get("vector", base)
    base = base.reshape(-1, 3)

    # the outward normal of sum(((v-ctr)/ext)**2) = 1, which is that surface's gradient
    prox = (co - ctr) / (ext ** 2)
    ln = np.linalg.norm(prox, axis=1, keepdims=True)
    prox = np.divide(prox, ln, out=np.zeros_like(prox), where=ln > 1e-9)

    out = base * (1.0 - CROWN_NORMAL_MIX) + prox * CROWN_NORMAL_MIX
    on = np.linalg.norm(out, axis=1, keepdims=True)
    # a vertex whose two normals oppose blends to nothing — keep its own rather than hand
    # Blender a zero vector it would quietly substitute for
    out = np.where(on > 1e-6, out / np.maximum(on, 1e-12), base)
    me.normals_split_custom_set_from_vertices([mathutils.Vector(v) for v in out])
    return CROWN_NORMAL_MIX


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
    the fork is webbed rather than two cylinders poking through each other.

    A twig UNDER canopy tapers away. Bark and cloud are separate surfaces, so an outer
    twig otherwise pokes a millimetre through the lobe that is meant to be hiding it, and
    at 128 px that reads as a scatter of bright orange flecks across the crown — measured
    at 3.8% of the mature crown, where exp-16's in-crown bark is 29% and almost all of it
    deep shade. Real foliage hides its own twigs, so the taper is keyed on the SAME cloud
    weight that put the lobe there, which makes the two surfaces agree by construction
    rather than by tuning a radius against a radius."""
    alive, frac, r = st["alive"], st["frac"], st["r"]
    r = r * (1.0 - WOOD_HIDE * st["wn"])
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
    """Buttress spurs: up the bole, then out and down to the soil. Gap 2.

    Two scalars, not one (see N_ROOT): `t_plant` sets how far a spur reaches and how high
    it climbs, and arrives with the tree; `t_root` sets girth, and follows the trunk.

    A spur thinner than a delivered PIXEL is not drawn thin — it is drawn absent, and the
    young tree loses the root fan that is most of its character. So the girth carries an
    absolute floor of one canvas pixel, stated in the units the floor is about. It binds
    only while the trunk is a seedling's: at maturity `base_r * thick` is five times it."""
    t = st["t_root"]
    tp = st["t_plant"]
    if tp < 0.02:
        return
    base_r = st["r"][0]
    r_floor = SPAN / CANVAS * 0.5          # one delivered pixel across
    for k, rs in enumerate(ROOTS):
        reach = rs["reach"] * tp
        rise = rs["rise"] * min(1.0, tp * 1.35)
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
            # ... and the spur keeps some girth out to its tip. v4's taper ran to 4.5% of
            # the base, so the outer half of every spur was sub-pixel and the buttress
            # read as a fillet with whiskers rather than as ridges reaching the soil.
            radii.append(max(max(base_r * rs["thick"], r_floor)
                             * (0.50 * (1.0 - u) ** 0.70 + 0.105), 0.006))
        # The spur starts ON the trunk axis, so its opening ring must stay INSIDE the
        # flared bole — otherwise the open pipe pokes through the silhouette and reads
        # as a black notch cut out of the trunk.
        bole_here = base_r * (1.0 + FLARE_AMT * t * math.exp(-pts[0][2] / FLARE_H))
        radii[0] = min(radii[0], bole_here * 0.72)
        tube(buf, pts, radii)
        buf.sphere(pts[0], radii[0] * 0.98)
        buf.sphere(pts[-1], radii[-1] * 1.05)


# ---------------------------------------------------------------- scene
def banded(name, bands, bias=0.0, ao_amt=AO_AMOUNT, ao_dist=AO_DIST,
           breakup=0.0):
    """A CEL material: flat bands keyed on the surface normal, never a smooth diffuse
    response. This is the fix for v2's honest bottom line — "a physically-lit render
    carries a lot of intermediate values, and quantising them is not the same act as an
    artist choosing eight". Here the artist's choice is made up front: the shader can
    only ever emit one of `bands`, so the crown's colour count is AUTHORED rather than
    discovered, and a cloud holds a band the way a painted one does.

        v = clamp(map(N·L, -1..1 -> 0..1) + bias) * (1 - AO_AMOUNT + AO_AMOUNT * AO)
        colour = constant-interpolated ramp over v

    Ambient occlusion is folded in BEFORE the ramp rather than multiplied after, so a
    shaded interior drops a whole band instead of inventing a new value between two.
    Emission with a Standard view transform means the rendered pixel IS the authored
    sRGB triple, which is what makes the palette snap a near-identity.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = LIGHT_DIR
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])

    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.clamp = True
    mr.inputs["From Min"].default_value = -1.0
    mr.inputs["From Max"].default_value = 1.0
    mr.inputs["To Min"].default_value = bias
    mr.inputs["To Max"].default_value = 1.0 + bias
    nt.links.new(dot.outputs["Value"], mr.inputs["Value"])

    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = ao_dist
    aom = nt.nodes.new("ShaderNodeMath")          # ao * AMOUNT + (1 - AMOUNT)
    aom.operation = "MULTIPLY_ADD"
    aom.inputs[1].default_value = ao_amt
    aom.inputs[2].default_value = 1.0 - ao_amt
    nt.links.new(ao.outputs["AO"], aom.inputs[0])

    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(mr.outputs["Result"], mul.inputs[0])
    nt.links.new(aom.outputs["Value"], mul.inputs[1])
    shade_out = mul.outputs["Value"]

    if breakup > 0.0:
        # lever 4: scallop the TERMINATOR, never tint the surface
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = LEAF_BREAKUP_SCALE
        tex.inputs["Detail"].default_value = 2.0
        nz = nt.nodes.new("ShaderNodeMath")       # (noise - 0.5) * breakup
        nz.operation = "MULTIPLY_ADD"
        nz.inputs[1].default_value = breakup
        nz.inputs[2].default_value = -0.5 * breakup
        nt.links.new(tex.outputs["Fac"], nz.inputs[0])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        nt.links.new(mul.outputs["Value"], add.inputs[0])
        nt.links.new(nz.outputs["Value"], add.inputs[1])
        shade_out = add.outputs["Value"]

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp
    el.interpolation = "CONSTANT"
    while len(el.elements) > 1:
        el.elements.remove(el.elements[-1])
    el.elements[0].position = bands[0][0]
    el.elements[0].color = lin(tuple(c / 255 for c in bands[0][1]))
    for pos, rgb in bands[1:]:
        e = el.elements.new(pos)
        e.color = lin(tuple(c / 255 for c in rgb))
    nt.links.new(shade_out, ramp.inputs["Fac"])

    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def make_materials():
    bark = banded("bark", BARK_BANDS, ao_amt=AO_AMOUNT_BARK, ao_dist=AO_DIST_BARK)
    fol = banded("foliage", FOLIAGE_BANDS, breakup=LEAF_BREAKUP)
    return bark, fol


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
    bark, fol = make_materials()

    wood = MeshBuf()
    emit_wood(wood, st)
    emit_roots(wood, st)
    objs = [wood.object("wood", bark)]

    if st["lobes"]:
        lb = MeshBuf()
        for _ci, c, rad in st["lobes"]:
            lb.blob(c, rad, _ci)
        lobe_ob = lb.object("lobes", fol)
        apply_crown_normals(lobe_ob, st["lobes"])
        objs.append(lobe_ob)

    if shadow_pass:
        # Ground contact. The tree casts but is invisible to camera, so alpha carries
        # the shadow alone and the raster back half can composite it as its own value.
        for ob in objs:
            ob.visible_camera = False
        bpy.ops.mesh.primitive_plane_add(size=CAM_SPAN * 3.0, location=(0, 0, 0.0))
        plane = bpy.context.active_object
        plane.is_shadow_catcher = True

    setup_camera_and_light(shadow_pass)


def setup_camera_and_light(shadow_pass=False):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = CAM_SPAN
    target = mathutils.Vector((0.0, 0.0, CAM_TZ))
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
      f"span={SPAN:.4f} tz={TZ:.4f} top={_TOP:.3f} halfw={_HALFW:.3f} "
      f"numpy={np.__version__}", flush=True)

def _own_code_state():
    """THE code state of this render: this file's own source digest.

    Not the flags — a fork sheet varies its flags on purpose. What it must never vary is the code
    underneath, and that is exactly what `crown-normals-fork.png` did: five variant directories, four
    rendered before a canopy constant existed and one after, composed into a picture whose whole
    purpose was to isolate ONE lever. `pixelise.py` propagates this into the delivered directory and
    `sheet.py` refuses to compose cells whose declarations disagree.

    Hashed inline with `hashlib` rather than through `provenance.py`, because Blender does not
    reliably put a `--python` script's own directory on `sys.path`; the sibling module documents the
    contract this must keep.
    """
    try:
        with open(os.path.abspath(__file__), "rb") as fh:
            return {"generator": os.path.basename(__file__),
                    "sha256": hashlib.sha256(fh.read()).hexdigest()}
    except OSError:
        return None


meta = {
    "generator": "blender_tree.py",
    "code_state": _own_code_state(),
    # the exact invocation, so a variant directory's own levers never have to be recalled
    "argv": list(argv),
    "blender": "5.2.0 LTS",
    "engine": "CYCLES/CPU",
    "seed": SEED,
    "samples": SAMPLES,
    "shadow_samples": SHADOW_SAMPLES,
    "supersample_res": RES,
    "canvas": [CANVAS, CANVAS],
    "camera_elevation_deg": ELEV_DEG,
    "skeleton": SKELETON,
    "skeletonSource": (
        f"Blender 'Sapling Tree Gen' extension (Weber & Penn 1995) from "
        f"extensions.blender.org, preset {SAP_PRESET!r}, normalised to apex z="
        f"{SAP_TARGET_H}; GROWTH, girth, canopy, camera, pacing and the raster back half "
        f"remain ours (ADR-0280 D1 minus the skeleton clause)"
        if SKELETON == "sapling" else
        "ours: space colonisation into a rounded attractor envelope, birth iteration "
        "recorded by the growth loop itself (ADR-0280 D1 in full)"),
    "framing": FRAMING,
    "camera": {
        "fixed": "orthographic; framed ONCE to the mature extent and identical every frame",
        "per-stage": "orthographic; framed PER FRAME to that frame's own extent, so every "
                     "stage fills the canvas and growth reads as width and density rather "
                     "than height. The ground row is held at the same NDC position in every "
                     "frame, so the base stays planted in frame while the scale changes",
        "eased": f"orthographic; framed PER FRAME so apparent height is a compressed "
                 f"monotone function of true height, floored at {OPEN_FRAC:g} of the mature "
                 f"apparent height at the seedling (exp-16's measured opening) and reaching "
                 f"1.0 at maturity, gamma {EASE_GAMMA:g}",
    }[FRAMING],
    "ortho_scale": round(SPAN, 6),
    "target_z": round(TZ, 6),
    "planned_anchor": [CANVAS / 2.0, ANCHOR_ROW],
    "nodes": len(NODES),
    "iterations": NMAX_BIRTH,
    "lobes": len(CLUSTERS),
    # The skeleton's float reductions are numpy-version sensitive: 2.4.4 grows 380 nodes
    # over 28 iterations where Blender's bundled 2.3.4 grows 405 over 27. The DELIVERED
    # tree is whatever the pinned Blender's numpy grows, so the version is recorded with
    # the frames rather than assumed — and the structural loop runs under Blender too
    # (`blender --background --python blender_tree.py -- --no-render`), because the plain
    # -Python route iterates a DIFFERENT tree.
    "numpy": np.__version__,
    "shading": "cel bands from the surface normal (emission + constant ramp), not a "
               "smooth diffuse response; the band list IS the crown's colour budget",
    "crown_normal_mix": CROWN_NORMAL_MIX,
    "crownNormals": (
        f"canopy shading normals blended {CROWN_NORMAL_MIX:g} of the way toward an "
        f"ANALYTIC crown proxy — an ellipsoid fitted per frame to that frame's own lobe "
        f"set — so the canopy shades as one volume instead of as a pile of blobs. The "
        f"Ghibli-tutorial Data Transfer step, rewired: no proxy MESH and no "
        f"nearest-surface mapping, because ADR-0280 D1 forbids a sculpted asset. Cycles' "
        f"Geometry>Normal honours custom split normals, so the band list is untouched"
        if CROWN_NORMAL_MIX > 0 else
        "off — canopy lobes keep their own smooth normals (the v6 track)"),
    "leaf_breakup": LEAF_BREAKUP,
    "foliage_bands": [list(c) for _p, c in FOLIAGE_BANDS],
    "bark_bands": [list(c) for _p, c in BARK_BANDS],
    "frames": [],
}

_PREV_AREA = []                  # the previous frame's (silhouette, canopy) proxy areas
if not SKIP_RENDER:
    os.makedirs(os.path.join(OUT, "shadow"), exist_ok=True)
for i, u in enumerate(PICKS):
    N = n_of_u(u)
    st = frame_state(N)
    # Rebind the camera BEFORE the scene is built — the shadow plane is sized off it too.
    # Under `fixed` this is a no-op assignment of the mature values.
    CAM_SPAN, CAM_TZ = camera_for(st)
    _top_i = frame_extent(st)[0]
    meta["frames"].append({
        "i": i, "u": round(u, 6), "N": round(N, 4),
        "live_nodes": int(st["alive"].sum()),
        "lobes": len(st["lobes"]),
        "trunk_r": round(float(st["r"][0]), 5),
        "t_root": round(st["t_root"], 4),
        "t_plant": round(st["t_plant"], 4),
        "canopy_weight": round(float(st["wn"].sum()), 4),
        "ortho_scale": round(CAM_SPAN, 6),
        "target_z": round(CAM_TZ, 6),
        # what the scale convention actually BUYS, in the units the fork is argued in:
        # this frame's apparent height as a fraction of the mature frame's.
        "true_height_frac": round(_top_i / _TOP, 4),
        "apparent_height_frac": round((_top_i / CAM_SPAN) / (_TOP / SPAN), 4),
    })
    if SKIP_RENDER:
        _sil = int(cheap_silhouette(st).sum())
        _can = int(cheap_silhouette(st, wood=False).sum())
        _drop = ("  <-- SHRANK" if _PREV_AREA and
                 (_sil < _PREV_AREA[0] or _can < _PREV_AREA[1]) else "")
        _PREV_AREA[:] = [_sil, _can]
        # `mat` and the juvenile-seat count answer ADR-0293's open question — whether the
        # young-canopy apparatus still has anything to serve once the leaves arrive late.
        # A flush that begins while mat < 1 is still being shaped by the shell easing, and
        # a juvenile seat that owns a live lobe is still earning its place.
        _juv = sum(1 for ci, _c, _r in st["lobes"] if ci < N_CLOUD_YOUNG)
        # the crown proxy the canopy borrows its normals from, so its shape can be read
        # off the plan rather than inferred from a render
        _px = ("-" if len(st["lobes"]) < 2 else
               "x".join(f"{v:.2f}" for v in crown_proxy(st["lobes"])[1]))
        _bark, _crown = bark_proxy(st)
        print(f"PLAN {i:02d} u={u:.4f} N={N:.2f} live={int(st['alive'].sum())} "
              f"lobes={len(st['lobes'])}({_juv}juv) mat={st['mat']:.2f} "
              f"con={st['con']:.2f} proxy={_px} bark={_bark:4d}/{_crown:5d} "
              f"sil={_sil:5d} canopy={_can:5d} "
              f"r0={st['r'][0]:.4f} root={st['t_root']:.2f} plant={st['t_plant']:.2f} "
              f"true={_top_i / _TOP:.3f} apparent="
              f"{(_top_i / CAM_SPAN) / (_TOP / SPAN):.3f}{_drop}", flush=True)
        continue
    if ONLY is not None and i not in ONLY:
        continue
    build_scene(st, shadow_pass=False)
    render(os.path.join(OUT, f"frame-{i:02d}.png"), SAMPLES)
    build_scene(st, shadow_pass=True)
    render(os.path.join(OUT, "shadow", f"frame-{i:02d}.png"), SHADOW_SAMPLES)
    print(f"FRAME {i} u={u:.4f} N={N:.2f} -> {OUT}/frame-{i:02d}.png", flush=True)

with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE", NFRAMES, "frames at", RES, "px,", SAMPLES, "samples, CPU Cycles", flush=True)
