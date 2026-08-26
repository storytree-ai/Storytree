"""Author the LAND in the textured idiom -- six whole islands, one axis moved at a time.

Run:
  blender -b "<pack>/Pine_Forest_Kit.blend" -P build_land.py -- \
      --land <variant> --out <dir> [--widths 487,1948] [--device auto|gpu|cpu]

WHY THIS SCRIPT EXISTS. `build_island.py` (the 2026-08-22 pine-kit trial) proved the kit and, in
doing so, found the thing nobody was looking at: the kit ships 42 objects that all stand ON land
and NO ground material at all, while land is roughly two thirds of a top-down island frame. The
flat green in the approved render is our own two-octave procedural noise -- our code, not the
kit's, and the weakest thing on screen. This script asks what a good-looking land is, and it asks
it by moving ONE axis at a time so the pictures are a comparison rather than a mood board.

THE VARIANTS, and what each one isolates:

  control     hex prisms          + the trial's two-octave noise   + the kit's cliff on the skirt
  procedural  hex prisms          + a RICH procedural material     + kit cliff        <- material
  textured    hex prisms          + the kit's IMAGE MAPS on land   + kit cliff        <- texture
  relief      grid land, smoothed coast, displaced + the trial's material + kit cliff <- geometry
  combined    relief + attribute-driven material (shore/slope/path) + strata skirt    <- all three
  strata      combined, but the skirt is a PROCEDURAL rock instead of the kit's cliff <- the skirt

Rows 1-4 move exactly one thing each against `control`. Row 5 is the candidate. Row 6 exists only
to answer whether the kit's cliff rock -- one of the better-reading parts of the trial -- is
carrying the coast, or whether anything competent there would do.

WHAT IS HELD FIXED ACROSS ALL SIX, so the comparison means something:
  - camera: orthographic, 50 deg elevation (RENDER_ELEV_DEG, owner-signed 2026-08-16), and the
    ortho scale is PINNED to a canonical box rather than auto-fitted, so relief cannot silently
    re-zoom the picture and make itself look better.
  - light: normalize(-0.45, 0.82, 0.35) from palette-band.ts, three.js (Y up) -> Blender (Z up)
    by (x, y, z) -> (x, -z, y). Cool sky fill so shadows rotate toward blue rather than going
    black -- which is the ISLANDERS finding (a shaded face there ROTATES IN HUE) applied to a
    physical renderer, where it is what a sky does anyway.
  - the scatter: same seed, same counts, same algorithm, from the same kit.
  - delivered sizes: 487 px (overview) and 1948 px (zoomed). Both, always. A land that reads at
    one and not the other has not answered the question (ADR-0415 D1's surviving half).

TRAPS THIS SCRIPT ENCODES -- every one of them cost the arc real time before:
  - THE ISLAND'S BOUNDING BOX LIES. 233.8 x 135.1 units, but the box CORNERS are water: it is a
    hex cluster with shorter outer rows. Everything here is clipped to the coast POLYGON, never
    to the bounds.
  - A GENERATED MESH HAS NO UV LAYER, and an image-texture material on a UV-less mesh samples
    texel (0,0) for every fragment -- the trial's skirt rendered SOLID BLACK, which reads exactly
    like a lighting bug and is neither. Every mesh built here is given UVs by hand.
  - THE KIT'S OBJECTS LIVE IN THE KIT'S COLLECTIONS (Foliage / Pine_Trees / Rocks), not the scene
    root. Hiding the root collection misses every one and they render, lined up, mid-island, as a
    mystery grey blob. Hide each object directly.
  - ONE ASSET IS `Pine-Leaves_02` -- HYPHEN where all three siblings use an underscore. Pairing
    trunks to leaves by naming convention silently drops one of four tree types with no error.
  - PROBING CYCLES DEVICE TYPES raises TypeError for a backend this build does not know, rather
    than returning an empty list; and `get_devices_for_type` returns the CPU ALONGSIDE any GPU,
    so `if devices:` reports a GPU on a CPU-only box. See select_device().
"""

import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

# ---------------------------------------------------------------- args

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default


LAND = arg("--land", "combined")
OUT_DIR = arg("--out", os.path.join(os.path.dirname(os.path.abspath(__file__)), "renders"))
SAMPLES = int(arg("--samples", "128"))
SEED = int(arg("--seed", "7"))
SCATTER = arg("--scatter", "forest")
WIDTHS = [int(w) for w in arg("--widths", "487,1948").split(",")]
BARE = "--bare" in argv                   # land only: the question is about the LAND
DEVICE = arg("--device", "auto").upper()
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------- our constants

RENDER_ELEV_DEG = 50.0                     # IslandView.tsx RENDER_ELEV_DEG (owner-signed)
ASPECT = 233.8 / 135.1                     # the real island's ground footprint
LIGHT_THREE = (-0.45, 0.82, 0.35)          # palette-band.ts LIGHT_DIRECTION (pre-normalise)

HEX_R = 7.0                                # circumradius, pack units (a pine is ~4 tall)
XSTRETCH = ASPECT / 1.42                   # stretch x so the cluster hits the real aspect
SLAB_DEPTH = 3.2                           # how far the land reads as a cut-out slab

GRID = 0.55                                # grid land: one cell ~1.1 delivered px at 487
BEACH = 3.1                                # shore band width, ground units
RELIEF = 4.60                              # peak-to-trough of the landform, ground units

rng = random.Random(SEED)             # the scatter's draw -- shared with the trial
crng = random.Random(SEED + 101)      # the coast's own, so it cannot shift the scatter
nrng = np.random.default_rng(SEED)

# ---------------------------------------------------------------- pack inventory

TREE_PAIRS = [
    ("Pine_Trunk_01", "Pine_Leaves_01"),
    ("Pine_Trunk_02", "Pine-Leaves_02"),     # HYPHEN. See the module docstring.
    ("Pine_Trunk_03", "Pine_Leaves_03"),
    ("Pine_Trunk_04", "Pine_Leaves_04"),
]
DEAD_TREES = ["Pine_Trunk_No_Leaves_01", "Pine_Trunk_No_Leaves_02"]
ROCKS = ["Rock_0%d" % i for i in range(1, 10)]
UNDERGROWTH = [
    "Fern_01", "Fern_02", "Fern_03",
    "Leafy_Bush_01", "Leafy_Bush_02", "Leafy_Bush_03",
    "Leafy_Plant_01", "Leafy_Plant_02",
]
GRASS = ["Grass_01", "Grass_02", "Grass_Clump_01", "Grass_Clump_02", "Grass_Clump_03"]
FLOWERS = ["Red_Flower_01", "Red_Flower_02", "White_Flower_01", "White_Flower_02",
           "Yellow_Flowers_01", "Yellow_Flowers_02", "Yellow_Flowers_03"]
LOGS = ["Log_01", "Log_02"]


def src(name):
    ob = bpy.data.objects.get(name)
    if ob is None:
        raise SystemExit("MISSING ASSET: %r -- the pack layout changed" % name)
    return ob


# ---------------------------------------------------------------- island footprint

def cluster_cells():
    """A hex cluster, like ours: two rings with a few outer cells dropped, so the coast is
    irregular rather than a tidy hexagon. Identical to the trial's, so the footprint is the
    footprint we have been looking at all along."""
    cells = []
    for q in range(-3, 4):
        for r in range(-2, 3):
            dist = (abs(q) + abs(r) + abs(q + r)) / 2
            if dist <= 3:
                cells.append((q, r))
    drop = {(-3, 2), (3, -2), (-3, 0), (3, 0), (0, -2), (2, -2), (-2, 2)}
    return [c for c in cells if c not in drop]


def hex_centre(q, r):
    return HEX_R * 1.5 * q * XSTRETCH, HEX_R * math.sqrt(3) * (r + q / 2.0)


def hex_ring(q, r):
    cx, cy = hex_centre(q, r)
    return [(cx + HEX_R * math.cos(math.radians(60 * i)) * XSTRETCH,
             cy + HEX_R * math.sin(math.radians(60 * i))) for i in range(6)]


# ---------------------------------------------------------------- the coast polygon

def coast_polygon(cells, step=1.05, smooth=3, wobble=2.6):
    """The hex cluster's OUTLINE, Chaikin-smoothed and gently perturbed.

    ⚠ THE COAST IS A MEASURED LEVER, NOT A DISCOVERY. The 2026-08-21 props pass found that a hard
    boundary on a SMOOTHED coast polyline was one of three things carrying nearly all of that
    round's improvement, and it did it WITHOUT moving a cell -- Chaikin was applied to the rim
    line props were built along. This function is that lever applied to the land itself: the cells
    are untouched, their shared outline is what gets smoothed.
    """
    key = lambda p: (round(p[0], 4), round(p[1], 4))
    seen, edges = {}, {}
    for (q, r) in cells:
        ring = hex_ring(q, r)
        for i in range(6):
            a, b = ring[i], ring[(i + 1) % 6]
            ek = tuple(sorted((key(a), key(b))))
            edges[ek] = edges.get(ek, 0) + 1
            seen[key(a)] = a
            seen[key(b)] = b
    boundary = [ek for ek, n in edges.items() if n == 1]

    # Chain UNDIRECTED. A directed walk strands on mixed winding -- the props pass measured that
    # exact failure (29 of 52 segments) and the fix was to stop caring about direction.
    adj = {}
    for a, b in boundary:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    start = min(adj)
    loop, prev, cur = [start], None, start
    while True:
        nxt = [n for n in adj[cur] if n != prev]
        if not nxt:
            break
        prev, cur = cur, nxt[0]
        if cur == start:
            break
        loop.append(cur)
    pts = [seen[k] for k in loop]

    # ⚠ RESAMPLE BEFORE SMOOTHING. Chaikin converges to a quadratic B-spline of its CONTROL
    # polygon, so applied to the raw 30-vertex hex outline it rounds every corner over a radius
    # set by the adjacent edge length -- 7 units here -- and the island comes out as a lobed
    # amoeba with no hex cluster left in it. Measured, first attempt, this pass. Resampling to
    # ~1 unit first means the same three iterations round the vertices over ~2 units and leave
    # the SILHOUETTE alone, which is what the 2026-08-21 lever actually was.
    pts = resample_closed(pts, step)

    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)

    # A few seeded harmonics so the coast has bays and headlands rather than a rounded hexagon.
    # Deterministic -- phases come from a seeded rng of the coast's own, never from a clock.
    phases = [crng.uniform(0, math.tau) for _ in range(4)]
    out = []
    for (x, y) in pts:
        ang = math.atan2(y - cy, (x - cx) / XSTRETCH)
        d = sum(math.sin(k * ang + phases[i]) / (i + 1.0)
                for i, k in enumerate((2, 3, 5, 8)))
        f = 1.0 + wobble * d / 6.0 / HEX_R
        out.append((cx + (x - cx) * f, cy + (y - cy) * f))

    for _ in range(smooth):                                  # Chaikin, closed loop
        nxt = []
        n = len(out)
        for i in range(n):
            ax, ay = out[i]
            bx, by = out[(i + 1) % n]
            nxt.append((ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25))
            nxt.append((ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75))
        out = nxt
    return resample_closed(out, step)


def resample_closed(pts, step):
    """Even-spaced points along a closed polyline. Chaikin is only as local as its control
    spacing, so this is what makes `smooth` a knob on ROUNDNESS rather than on SHAPE."""
    n = len(pts)
    segs = [(pts[i], pts[(i + 1) % n]) for i in range(n)]
    total = sum(math.dist(a, b) for a, b in segs)
    count = max(24, int(round(total / step)))
    out, acc, si, spos = [], 0.0, 0, 0.0
    seg_len = math.dist(*segs[0])
    for k in range(count):
        target = total * k / count
        while acc + (seg_len - spos) < target and si < len(segs) - 1:
            acc += seg_len - spos
            si += 1
            spos = 0.0
            seg_len = math.dist(*segs[si])
        t = (target - acc + spos) / seg_len if seg_len else 0.0
        (ax, ay), (bx, by) = segs[si]
        out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def poly_rows(poly, ys):
    """Scanline crossings: for each y, the sorted x where the closed polygon crosses it.
    O(rows x edges) and exact, which a point-by-point even-odd test over a 130k-vertex grid
    is not affordable enough to be."""
    n = len(poly)
    spans = []
    for y in ys:
        xs = []
        for i in range(n):
            x0, y0 = poly[i]
            x1, y1 = poly[(i + 1) % n]
            if (y0 <= y) != (y1 <= y):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        spans.append(xs)
    return spans


def nearest_on_poly(poly, pts):
    """Project points onto the polygon polyline. Vectorised: the boundary ring is ~1-2k points
    and the polygon ~1-2k segments, so this is a few million ops, not a loop."""
    P = np.asarray(poly, dtype=np.float64)
    A = P
    B = np.roll(P, -1, axis=0)
    AB = B - A
    denom = np.einsum("ij,ij->i", AB, AB)
    denom[denom == 0] = 1e-12
    out = np.empty_like(pts)
    for i, p in enumerate(pts):
        t = np.clip(np.einsum("ij,ij->i", p - A, AB) / denom, 0.0, 1.0)
        proj = A + t[:, None] * AB
        d = np.einsum("ij,ij->i", proj - p, proj - p)
        out[i] = proj[int(np.argmin(d))]
    return out


# ---------------------------------------------------------------- noise + distance fields

def value_noise(shape, cells, octaves, persistence, rng_):
    """Seeded multi-octave value noise on a grid. numpy ships inside Blender (2.3.4 here), so
    this costs nothing worth optimising."""
    h, w = shape
    total = np.zeros(shape)
    amp, norm, c = 1.0, 0.0, cells
    for _ in range(octaves):
        g = rng_.random((c + 2, c + 2))
        ys = np.linspace(0, c, h)
        xs = np.linspace(0, c, w)
        y0 = np.clip(np.floor(ys).astype(int), 0, c)
        x0 = np.clip(np.floor(xs).astype(int), 0, c)
        fy = ys - y0
        fx = xs - x0
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        g00 = g[np.ix_(y0, x0)]
        g01 = g[np.ix_(y0, x0 + 1)]
        g10 = g[np.ix_(y0 + 1, x0)]
        g11 = g[np.ix_(y0 + 1, x0 + 1)]
        top = g00 * (1 - fx) + g01 * fx
        bot = g10 * (1 - fx) + g11 * fx
        total += amp * (top * (1 - fy[:, None]) + bot * fy[:, None])
        norm += amp
        amp *= persistence
        c *= 2
    return total / norm


def distance_field(mask, spacing, iters=48):
    """Chamfer-ish distance (in ground units) from every True cell to the nearest False cell.
    Iterated numpy shifts: ~50 passes over a 130k grid is well under a second, and 48 passes
    reaches ~26 ground units, which is far past anything the shader asks about."""
    INF = 1e9
    d = np.where(mask, INF, 0.0)
    s, dg = 1.0, math.sqrt(2.0)
    for _ in range(iters):
        prev = d
        m = d.copy()
        m[1:, :] = np.minimum(m[1:, :], d[:-1, :] + s)
        m[:-1, :] = np.minimum(m[:-1, :], d[1:, :] + s)
        m[:, 1:] = np.minimum(m[:, 1:], d[:, :-1] + s)
        m[:, :-1] = np.minimum(m[:, :-1], d[:, 1:] + s)
        m[1:, 1:] = np.minimum(m[1:, 1:], d[:-1, :-1] + dg)
        m[:-1, :-1] = np.minimum(m[:-1, :-1], d[1:, 1:] + dg)
        m[1:, :-1] = np.minimum(m[1:, :-1], d[:-1, 1:] + dg)
        m[:-1, 1:] = np.minimum(m[:-1, 1:], d[1:, :-1] + dg)
        d = m
        if np.array_equal(prev, d):
            break
    return np.minimum(d, 1e6) * spacing


# ---------------------------------------------------------------- land: the hex slab (control)

def build_land_hex(cells):
    """The trial's land, unchanged: hexagonal prisms, tops on material 0, skirt on material 1.
    This is the control, so it is a reproduction and not an improvement."""
    bm = bmesh.new()
    tops = {}
    for (q, r) in cells:
        cx, cy = hex_centre(q, r)
        z = rng.uniform(-0.35, 0.35)
        ring = []
        for i in range(6):
            a = math.radians(60 * i)
            ring.append(bm.verts.new((cx + HEX_R * math.cos(a) * XSTRETCH,
                                      cy + HEX_R * math.sin(a), z)))
        bm.faces.new(ring).material_index = 0
        tops[(q, r)] = z
        low = [bm.verts.new((v.co.x, v.co.y, -SLAB_DEPTH)) for v in ring]
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new([ring[i], ring[j], low[j], low[i]]).material_index = 1

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        if f.material_index == 0:
            for loop in f.loops:
                p = loop.vert.co
                loop[uv].uv = (p.x / 6.0, p.y / 6.0)
        else:
            origin = f.loops[0].vert.co
            for loop in f.loops:
                p = loop.vert.co
                loop[uv].uv = (math.hypot(p.x - origin.x, p.y - origin.y) / 6.0, p.z / 6.0)

    me = bpy.data.meshes.new("Island")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Island", me)
    bpy.context.scene.collection.objects.link(ob)

    def ground_z(x, y):
        best, bz = 1e9, 0.0
        for (q, r), z in tops.items():
            cx, cy = hex_centre(q, r)
            d = math.hypot(x - cx, y - cy)
            if d < best:
                best, bz = d, z
        return bz

    def inside(x, y, margin=1.4):
        for (q, r) in cells:
            cx, cy = hex_centre(q, r)
            if math.hypot((x - cx) / XSTRETCH, y - cy) < HEX_R * 0.866 - margin:
                return True
        return False

    return ob, dict(ground_z=ground_z, inside=inside, wear=lambda x, y: 0.0,
                    shore=lambda x, y: 99.0)


# ---------------------------------------------------------------- land: the grid slab

def path_polyline(poly, cells):
    """A worn path: coast -> interior -> coast, through the middle of the island, resampled and
    Chaikin-smoothed with the same lever the coast uses. Deterministic from the seed."""
    P = np.asarray(poly)
    cx, cy = P[:, 0].mean(), P[:, 1].mean()
    # two roughly-opposite landing points on the coast, plus interior control points
    def coast_at(angle):
        ang = np.arctan2(P[:, 1] - cy, (P[:, 0] - cx) / XSTRETCH)
        i = int(np.argmin(np.abs(np.angle(np.exp(1j * (ang - angle))))))
        return P[i]
    a = coast_at(math.radians(-160.0))
    b = coast_at(math.radians(25.0))
    ctrl = [tuple(a),
            (cx - 34.0, cy + 6.5),
            (cx - 10.0, cy - 7.0),
            (cx + 18.0, cy + 4.0),
            tuple(b)]
    pts = ctrl
    for _ in range(4):
        nxt = [pts[0]]
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            nxt.append((ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25))
            nxt.append((ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75))
        nxt.append(pts[-1])
        pts = nxt
    return pts


def build_land_grid(cells, poly, with_path, with_strata):
    """A gridded, displaced land clipped to the smoothed coast polygon.

    The clip is a SCANLINE fill, then the boundary ring is projected onto the polygon, so the
    coast is the smooth polyline exactly rather than a stair-step at grid resolution. At 487 px
    a 0.55-unit grid cell is ~1.1 delivered px, so an unprojected stair-step would be visible
    at the zoomed size and would read as an artefact rather than as a coast.
    """
    xs_all, ys_all = [p[0] for p in poly], [p[1] for p in poly]
    x0, x1 = min(xs_all) - GRID, max(xs_all) + GRID
    y0, y1 = min(ys_all) - GRID, max(ys_all) + GRID
    nx = int(math.ceil((x1 - x0) / GRID)) + 1
    ny = int(math.ceil((y1 - y0) / GRID)) + 1
    gx = x0 + GRID * np.arange(nx)
    gy = y0 + GRID * np.arange(ny)

    spans = poly_rows(poly, gy)
    inside = np.zeros((ny, nx), dtype=bool)
    for j, xs in enumerate(spans):
        for k in range(0, len(xs) - 1, 2):
            inside[j] |= (gx >= xs[k]) & (gx <= xs[k + 1])

    shore = distance_field(inside, GRID)                 # ground units from the coast

    # THE LANDFORM. Broad relief that FALLS TO THE COAST -- an island whose ground is flat right
    # up to a vertical cut has no shore, and a shore is most of what makes a coast read.
    n_broad = value_noise((ny, nx), 3, 4, 0.55, nrng)
    n_mid = value_noise((ny, nx), 9, 3, 0.5, nrng)
    n_fine = value_noise((ny, nx), 22, 3, 0.5, nrng)
    fall = np.clip(shore / BEACH, 0.0, 1.0)
    fall = fall * fall * (3 - 2 * fall)                  # smoothstep
    # Broad landform + a mid octave. ⚠ AMPLITUDE ALONE DOES NOT MAKE RELIEF READ: the first
    # attempt put +/-1.15 units across a 30-unit wavelength, a 4 deg slope, and the island came
    # out looking flat. What the eye reads is the SLOPE, so the mid octave -- shorter wavelength
    # at a third of the amplitude -- is doing more work here than the broad one.
    z = ((n_broad - 0.5) * RELIEF + (n_mid - 0.5) * RELIEF * 0.42) * fall \
        + (n_fine - 0.5) * 0.30 * fall
    z -= 0.62 * (1.0 - fall)                            # the beach dips below the grass line

    wear = np.zeros((ny, nx))
    if with_path:
        path = path_polyline(poly, cells)
        pmask = np.ones((ny, nx), dtype=bool)
        for (px, py) in path:
            i = int(round((px - x0) / GRID))
            j = int(round((py - y0) / GRID))
            if 0 <= i < nx and 0 <= j < ny:
                pmask[j, i] = False
        pdist = distance_field(pmask, GRID, iters=26)
        # ⚠ 5.5 units of falloff delivered an ~11-unit corridor -- 22 px at 487, and it read
        # as a trunk road cutting the island in half. The props pass's "paths need 10-11
        # units, not 7" was measured on a path meant to be WALKED ALONG in a dressed
        # composition; a worn track through open ground wants roughly half that.
        wear = np.clip(1.0 - pdist / 3.0, 0.0, 1.0)
        wear = wear * wear * (3 - 2 * wear)
        z -= 0.30 * wear                                 # a path is worn DOWN, not painted on

    # quads whose four corners are all land
    keep = inside[:-1, :-1] & inside[:-1, 1:] & inside[1:, :-1] & inside[1:, 1:]
    used = np.zeros((ny, nx), dtype=bool)
    used[:-1, :-1] |= keep
    used[:-1, 1:] |= keep
    used[1:, :-1] |= keep
    used[1:, 1:] |= keep

    idx = -np.ones((ny, nx), dtype=np.int64)
    jj, ii = np.nonzero(used)
    idx[jj, ii] = np.arange(len(jj))
    verts = np.stack([gx[ii], gy[jj], z[jj, ii]], axis=1)
    v_shore = shore[jj, ii]
    v_wear = wear[jj, ii]

    qj, qi = np.nonzero(keep)
    faces = np.stack([idx[qj, qi], idx[qj, qi + 1],
                      idx[qj + 1, qi + 1], idx[qj + 1, qi]], axis=1)

    # the boundary ring of the kept quads, in order, then projected onto the polygon
    edge_count = {}
    for f in faces:
        for k in range(4):
            a, b = int(f[k]), int(f[(k + 1) % 4])
            ek = (a, b) if a < b else (b, a)
            edge_count[ek] = edge_count.get(ek, 0) + 1
    ring_edges = [e for e, n in edge_count.items() if n == 1]
    adj = {}
    for a, b in ring_edges:
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    start = min(adj)
    ring, prev, cur = [start], None, start
    while True:
        nxt = [n for n in adj[cur] if n != prev]
        if not nxt:
            break
        prev, cur = cur, nxt[0]
        if cur == start:
            break
        ring.append(cur)

    ring_arr = np.asarray(ring, dtype=np.int64)
    proj = nearest_on_poly(poly, verts[ring_arr, :2])
    verts[ring_arr, 0] = proj[:, 0]
    verts[ring_arr, 1] = proj[:, 1]
    verts[ring_arr, 2] = -0.62                           # the waterline is level, always
    v_shore[ring_arr] = 0.0

    # THE SKIRT. Rows down the outside of the ring. `strata` steps each row in and out so the cut
    # reads as bedding planes rather than as one extruded wall -- the trial's skirt is a single
    # 3.2-unit face and at 1948 px that is a lot of frame doing nothing.
    rows = 6 if with_strata else 1
    tops_z = verts[ring_arr, 2].copy()
    cxm = float(verts[:, 0].mean())
    cym = float(verts[:, 1].mean())
    dx = verts[ring_arr, 0] - cxm
    dy = verts[ring_arr, 1] - cym
    norm = np.hypot(dx / XSTRETCH, dy)
    norm[norm == 0] = 1.0

    extra = []
    for r_i in range(1, rows + 1):
        t = r_i / float(rows)
        zz = tops_z * (1 - t) + (-SLAB_DEPTH) * t
        # a seeded per-row inset, alternating, so the bands catch and lose the light
        inset = ((0.55 if r_i % 2 else -0.12) * (0.6 + 0.8 * ((r_i * 7919) % 13) / 13.0)
                 if with_strata else 0.0)
        extra.append(np.stack([verts[ring_arr, 0] - inset * (dx / norm),
                               verts[ring_arr, 1] - inset * (dy / norm),
                               zz], axis=1))

    skirt_rows = [ring_arr]
    offset = len(verts)
    for e in extra:
        skirt_rows.append(offset + np.arange(len(e)))
        offset += len(e)
    verts = np.concatenate([verts] + extra, axis=0)
    pad = np.zeros(sum(len(e) for e in extra))
    v_shore = np.concatenate([v_shore, pad])
    v_wear = np.concatenate([v_wear, pad])

    skirt_faces = []
    n_ring = len(ring_arr)
    for r_i in range(rows):
        a_row, b_row = skirt_rows[r_i], skirt_rows[r_i + 1]
        for i in range(n_ring):
            j = (i + 1) % n_ring
            skirt_faces.append([int(a_row[i]), int(a_row[j]), int(b_row[j]), int(b_row[i])])

    all_faces = [[int(v) for v in f] for f in faces] + skirt_faces
    mat_idx = np.concatenate([np.zeros(len(faces), dtype=np.int32),
                              np.ones(len(skirt_faces), dtype=np.int32)])

    me = bpy.data.meshes.new("Island")
    me.from_pydata([tuple(v) for v in verts], [], all_faces)
    me.update()
    me.polygons.foreach_set("material_index", mat_idx)
    smooth = np.concatenate([np.ones(len(faces), dtype=bool),
                             np.zeros(len(skirt_faces), dtype=bool)])
    me.polygons.foreach_set("use_smooth", smooth)

    # UVs BY HAND -- see the docstring. Plan projection on top, run-length x height on the skirt.
    uv_layer = me.uv_layers.new(name="UVMap")
    loop_v = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loop_v)
    uv = np.empty((len(me.loops), 2))
    uv[:, 0] = verts[loop_v, 0] / 6.0
    uv[:, 1] = verts[loop_v, 1] / 6.0
    # ⚠ The skirt's U is CUMULATIVE RUN LENGTH along the ring, not the angle to the centre. An
    # angular U is the obvious thing to reach for and it stretches the texture wherever the island
    # is long -- and this island is stretched 1.22x on x by construction (XSTRETCH), so an angular
    # U compresses the rock on the two long sides and spreads it on the two short ones. Run length
    # keeps the tile square all the way round. Every skirt row is a copy of the ring in ring order,
    # so one U per ring position serves all of them.
    ring_xy = verts[ring_arr, :2]
    seg = np.hypot(*(np.roll(ring_xy, -1, axis=0) - ring_xy).T)
    run = np.concatenate([[0.0], np.cumsum(seg)[:-1]])
    u_of_vert = np.zeros(len(verts))
    for row in skirt_rows:
        u_of_vert[row] = run
    first_skirt_loop = 4 * len(faces)
    uv[first_skirt_loop:, 0] = u_of_vert[loop_v[first_skirt_loop:]] / 6.0
    uv[first_skirt_loop:, 1] = verts[loop_v[first_skirt_loop:], 2] / 3.2
    uv_layer.uv.foreach_set("vector", uv.ravel())

    for name, data in (("shore", v_shore), ("wear", v_wear)):
        at = me.attributes.new(name=name, type="FLOAT", domain="POINT")
        at.data.foreach_set("value", data.astype(np.float32))

    ob = bpy.data.objects.new("Island", me)
    bpy.context.scene.collection.objects.link(ob)

    # sampling helpers for the scatter -- bilinear on the same fields the mesh was built from
    def sample(field, x, y):
        fx = np.clip((x - x0) / GRID, 0, nx - 1.001)
        fy = np.clip((y - y0) / GRID, 0, ny - 1.001)
        i, j = int(fx), int(fy)
        tx, ty = fx - i, fy - j
        return float((field[j, i] * (1 - tx) + field[j, i + 1] * tx) * (1 - ty) +
                     (field[j + 1, i] * (1 - tx) + field[j + 1, i + 1] * tx) * ty)

    def inside_fn(x, y, margin=1.4):
        return sample(shore, x, y) > margin

    return ob, dict(ground_z=lambda x, y: sample(z, x, y),
                    inside=inside_fn,
                    wear=lambda x, y: sample(wear, x, y),
                    shore=lambda x, y: sample(shore, x, y))


# ---------------------------------------------------------------- ground materials

def _bsdf(mat):
    return mat.node_tree.nodes["Principled BSDF"]


def _noise(nt, scale, detail, roughness=0.5):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = roughness
    return n


def _ramp(nt, stops):
    r = nt.nodes.new("ShaderNodeValToRGB")
    cr = r.color_ramp
    while len(cr.elements) > 1:
        cr.elements.remove(cr.elements[-1])
    cr.elements[0].position, cr.elements[0].color = stops[0]
    for pos, col in stops[1:]:
        e = cr.elements.new(pos)
        e.color = col
    return r


def mat_control():
    """The trial's ground, reproduced exactly: two noise octaves into a three-stop ramp. This is
    what the owner actually approved, so it is the control and not a straw man."""
    m = bpy.data.materials.new("Land_Control")
    m.use_nodes = True
    nt = m.node_tree
    _bsdf(m).inputs["Roughness"].default_value = 0.90
    coarse = _noise(nt, 2.6, 6.0)
    fine = _noise(nt, 22.0, 3.0)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.34
    nt.links.new(coarse.outputs["Fac"], mix.inputs[2])
    nt.links.new(fine.outputs["Fac"], mix.inputs[3])
    ramp = _ramp(nt, [(0.34, (0.075, 0.190, 0.055, 1.0)),
                      (0.52, (0.150, 0.320, 0.095, 1.0)),
                      (0.68, (0.290, 0.470, 0.150, 1.0))])
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], _bsdf(m).inputs["Base Color"])
    return m


def mat_procedural():
    """The MATERIAL axis, moved on its own: same flat hex geometry, a much richer procedural.

    The one idea worth naming is that the variation is by HUE, not only by value. The ISLANDERS
    pass measured that a shaded face in the reference has ROTATED IN HUE (+22 to +61 deg at
    0.59-0.72x value) rather than merely darkened, and that our `token x level` shader cannot
    rotate at all. A procedural ground CAN: two ramps a long way apart in hue -- a cool
    blue-green and a warm ochre-green -- mixed by a slow Voronoi, so neighbouring patches differ
    in hue and not just in brightness.
    """
    m = bpy.data.materials.new("Land_Procedural")
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.92

    broad = _noise(nt, 1.9, 8.0, 0.62)
    mid = _noise(nt, 6.5, 8.0, 0.55)
    fine = _noise(nt, 26.0, 4.0)

    m1 = nt.nodes.new("ShaderNodeMix")
    m1.data_type = "FLOAT"
    m1.inputs["Factor"].default_value = 0.40
    nt.links.new(broad.outputs["Fac"], m1.inputs[2])
    nt.links.new(mid.outputs["Fac"], m1.inputs[3])
    m2 = nt.nodes.new("ShaderNodeMix")
    m2.data_type = "FLOAT"
    m2.inputs["Factor"].default_value = 0.22
    nt.links.new(m1.outputs[0], m2.inputs[2])
    nt.links.new(fine.outputs["Fac"], m2.inputs[3])

    cool = _ramp(nt, [(0.30, (0.054, 0.130, 0.054, 1.0)),     # cool shadow green
                      (0.50, (0.126, 0.262, 0.088, 1.0)),
                      (0.72, (0.265, 0.428, 0.142, 1.0))])
    warm = _ramp(nt, [(0.30, (0.098, 0.122, 0.042, 1.0)),     # dry ochre-green
                      (0.50, (0.215, 0.252, 0.080, 1.0)),
                      (0.72, (0.368, 0.392, 0.146, 1.0))])
    nt.links.new(m2.outputs[0], cool.inputs["Fac"])
    nt.links.new(m2.outputs[0], warm.inputs["Fac"])

    # ⚠ A Voronoi here delivers visible CELLS, which at island scale read as continents
    # rather than as ground. A slow noise gives the same hue drift with no shape to it.
    hue_drift = _noise(nt, 2.7, 3.0, 0.4)
    patch = _ramp(nt, [(0.38, (0, 0, 0, 1)), (0.62, (1, 1, 1, 1))])
    nt.links.new(hue_drift.outputs["Fac"], patch.inputs["Fac"])

    blend = nt.nodes.new("ShaderNodeMix")
    blend.data_type = "RGBA"
    nt.links.new(patch.outputs["Color"], blend.inputs[0])
    nt.links.new(cool.outputs["Color"], blend.inputs[6])
    nt.links.new(warm.outputs["Color"], blend.inputs[7])
    nt.links.new(blend.outputs[2], b.inputs["Base Color"])

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.24
    nt.links.new(fine.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def _kit_image(name):
    im = bpy.data.images.get(name)
    if im is None:
        raise SystemExit("MISSING KIT MAP: %r" % name)
    return im


def mat_textured():
    """The TEXTURE axis, moved on its own -- and the finding is in what it costs to build.

    ⚠ THE KIT SHIPS NO GROUND TEXTURE. 39 packed 2048x2048 maps and every one of them is bark,
    foliage, rock, log or cliff. So `textured` cannot mean "use the kit's ground map"; there
    isn't one. The nearest thing the kit owns that TILES over a large surface is the cliff, so
    this variant wears Pine_Cliff BaseColor / Normal / Roughness on the land, tinted toward
    green by a noise-masked mix. That is not a cheat -- it is the honest answer to "what does a
    bought pack give the land", which is: an image map of the wrong thing.
    """
    m = bpy.data.materials.new("Land_Textured")
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)

    tc = nt.nodes.new("ShaderNodeTexCoord")
    map_ = nt.nodes.new("ShaderNodeMapping")
    map_.inputs["Scale"].default_value = (2.4, 2.4, 2.4)
    nt.links.new(tc.outputs["UV"], map_.inputs["Vector"])

    base = nt.nodes.new("ShaderNodeTexImage")
    base.image = _kit_image("Pine_Cliff_BaseColor.tga")
    nrm = nt.nodes.new("ShaderNodeTexImage")
    nrm.image = _kit_image("Pine_Cliff_Normal.tga")
    nrm.image.colorspace_settings.name = "Non-Color"
    rgh = nt.nodes.new("ShaderNodeTexImage")
    rgh.image = _kit_image("Pine_Cliff_Roughness.tga")
    rgh.image.colorspace_settings.name = "Non-Color"
    for n in (base, nrm, rgh):
        nt.links.new(map_.outputs["Vector"], n.inputs["Vector"])

    green = _ramp(nt, [(0.32, (0.070, 0.175, 0.062, 1.0)),
                       (0.52, (0.150, 0.310, 0.098, 1.0)),
                       (0.74, (0.285, 0.455, 0.150, 1.0))])
    cover = _noise(nt, 2.4, 6.0)
    nt.links.new(cover.outputs["Fac"], green.inputs["Fac"])

    # where the "grass" thins, the image map shows through as bare ground
    thin = _noise(nt, 3.1, 5.0)
    thin_ramp = _ramp(nt, [(0.40, (0, 0, 0, 1)), (0.60, (1, 1, 1, 1))])
    nt.links.new(thin.outputs["Fac"], thin_ramp.inputs["Fac"])

    mixc = nt.nodes.new("ShaderNodeMix")
    mixc.data_type = "RGBA"
    nt.links.new(thin_ramp.outputs["Color"], mixc.inputs[0])
    nt.links.new(base.outputs["Color"], mixc.inputs[6])
    nt.links.new(green.outputs["Color"], mixc.inputs[7])
    nt.links.new(mixc.outputs[2], b.inputs["Base Color"])

    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.85
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(rgh.outputs["Color"], b.inputs["Roughness"])
    return m


def mat_attribute(grain_on=True):
    """The candidate: a procedural ground that KNOWS WHERE IT IS ON THE ISLAND.

    Everything above shades by noise alone, so every square metre of land is statistically the
    same square metre. This one reads three per-vertex facts the geometry already computed --
    distance to the coast, path wear, and the surface's own slope -- and lets them choose the
    colour. That is the whole idea: shore sand at the waterline, worn dirt along the path, rock
    on anything steep, and the hue-varied grass everywhere else.
    """
    m = bpy.data.materials.new("Land_Attribute")
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.90

    broad = _noise(nt, 1.9, 8.0, 0.62)
    mid = _noise(nt, 6.8, 8.0, 0.55)
    fine = _noise(nt, 28.0, 4.0)
    mA = nt.nodes.new("ShaderNodeMix")
    mA.data_type = "FLOAT"
    mA.inputs["Factor"].default_value = 0.42
    nt.links.new(broad.outputs["Fac"], mA.inputs[2])
    nt.links.new(mid.outputs["Fac"], mA.inputs[3])
    mB = nt.nodes.new("ShaderNodeMix")
    mB.data_type = "FLOAT"
    mB.inputs["Factor"].default_value = 0.20
    nt.links.new(mA.outputs[0], mB.inputs[2])
    nt.links.new(fine.outputs["Fac"], mB.inputs[3])

    cool = _ramp(nt, [(0.28, (0.052, 0.126, 0.052, 1.0)),
                      (0.50, (0.124, 0.258, 0.086, 1.0)),
                      (0.74, (0.268, 0.432, 0.140, 1.0))])
    warm = _ramp(nt, [(0.28, (0.095, 0.118, 0.040, 1.0)),
                      (0.50, (0.210, 0.248, 0.078, 1.0)),
                      (0.74, (0.362, 0.388, 0.144, 1.0))])
    nt.links.new(mB.outputs[0], cool.inputs["Fac"])
    nt.links.new(mB.outputs[0], warm.inputs["Fac"])
    # ⚠ A Voronoi here delivers visible CELLS, which at island scale read as continents
    # rather than as ground. A slow noise gives the same hue drift with no shape to it.
    hue_drift = _noise(nt, 2.7, 3.0, 0.4)
    patch = _ramp(nt, [(0.38, (0, 0, 0, 1)), (0.62, (1, 1, 1, 1))])
    nt.links.new(hue_drift.outputs["Fac"], patch.inputs["Fac"])
    grass = nt.nodes.new("ShaderNodeMix")
    grass.data_type = "RGBA"
    nt.links.new(patch.outputs["Color"], grass.inputs[0])
    nt.links.new(cool.outputs["Color"], grass.inputs[6])
    nt.links.new(warm.outputs["Color"], grass.inputs[7])

    # --- shore: attribute `shore` is ground units from the coast, written by build_land_grid
    a_shore = nt.nodes.new("ShaderNodeAttribute")
    a_shore.attribute_name = "shore"
    shore_edge = _noise(nt, 7.5, 6.0)                   # break the sand line so it is not a ring
    shore_mix = nt.nodes.new("ShaderNodeMath")
    shore_mix.operation = "MULTIPLY_ADD"
    shore_mix.inputs[1].default_value = 1.0
    nt.links.new(a_shore.outputs["Fac"], shore_mix.inputs[0])
    nt.links.new(shore_edge.outputs["Fac"], shore_mix.inputs[2])
    shore_ramp = _ramp(nt, [(0.34, (0, 0, 0, 1)), (0.70, (1, 1, 1, 1))])
    div = nt.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = BEACH + 0.9
    nt.links.new(shore_mix.outputs[0], div.inputs[0])
    nt.links.new(div.outputs[0], shore_ramp.inputs["Fac"])

    sand = _ramp(nt, [(0.35, (0.395, 0.350, 0.252, 1.0)),
                      (0.70, (0.612, 0.556, 0.412, 1.0))])
    nt.links.new(mB.outputs[0], sand.inputs["Fac"])
    shore_blend = nt.nodes.new("ShaderNodeMix")
    shore_blend.data_type = "RGBA"
    nt.links.new(shore_ramp.outputs["Color"], shore_blend.inputs[0])
    nt.links.new(sand.outputs["Color"], shore_blend.inputs[6])
    nt.links.new(grass.outputs[2], shore_blend.inputs[7])

    # --- worn path
    a_wear = nt.nodes.new("ShaderNodeAttribute")
    a_wear.attribute_name = "wear"
    wear_break = nt.nodes.new("ShaderNodeMath")
    wear_break.operation = "MULTIPLY"
    nt.links.new(a_wear.outputs["Fac"], wear_break.inputs[0])
    nt.links.new(_noise(nt, 9.0, 5.0).outputs["Fac"], wear_break.inputs[1])
    wear_ramp = _ramp(nt, [(0.24, (0, 0, 0, 1)), (0.55, (1, 1, 1, 1))])
    nt.links.new(wear_break.outputs[0], wear_ramp.inputs["Fac"])
    dirt = _ramp(nt, [(0.35, (0.165, 0.128, 0.088, 1.0)),
                      (0.70, (0.322, 0.262, 0.182, 1.0))])
    nt.links.new(mB.outputs[0], dirt.inputs["Fac"])
    wear_blend = nt.nodes.new("ShaderNodeMix")
    wear_blend.data_type = "RGBA"
    nt.links.new(wear_ramp.outputs["Color"], wear_blend.inputs[0])
    nt.links.new(shore_blend.outputs[2], wear_blend.inputs[6])
    nt.links.new(dirt.outputs["Color"], wear_blend.inputs[7])

    # --- rock on anything steep: the surface's own normal, not another noise
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs["Vector"])
    slope_ramp = _ramp(nt, [(0.72, (1, 1, 1, 1)), (0.90, (0, 0, 0, 1))])
    nt.links.new(sep.outputs["Z"], slope_ramp.inputs["Fac"])
    rock = _ramp(nt, [(0.35, (0.140, 0.125, 0.105, 1.0)),
                      (0.70, (0.330, 0.300, 0.255, 1.0))])
    nt.links.new(mB.outputs[0], rock.inputs["Fac"])
    rock_blend = nt.nodes.new("ShaderNodeMix")
    rock_blend.data_type = "RGBA"
    nt.links.new(slope_ramp.outputs["Color"], rock_blend.inputs[0])
    nt.links.new(wear_blend.outputs[2], rock_blend.inputs[6])
    nt.links.new(rock.outputs["Color"], rock_blend.inputs[7])
    # --- GRAIN. ⚠ THE FINDING THAT FORCED THIS: at 1948 px the version without it read as a
    # watercolour wash next to props that are crisply painted, because every noise above has a
    # wavelength of whole ground UNITS and the zoomed frame resolves ~20 px per unit. A ground
    # only has detail at a zoom if something in it has structure AT THAT SCALE. This is the
    # cheapest thing that does: one high-frequency octave, at low amplitude so it grains the
    # surface rather than dirtying it.
    micro = _noise(nt, 95.0, 2.0, 0.55)
    grain = nt.nodes.new("ShaderNodeMix")
    grain.data_type = "RGBA"
    grain.inputs[0].default_value = 0.130 if grain_on else 0.0
    nt.links.new(rock_blend.outputs[2], grain.inputs[6])
    grain_col = _ramp(nt, [(0.30, (0.055, 0.062, 0.030, 1.0)),
                           (0.70, (0.560, 0.560, 0.430, 1.0))])
    nt.links.new(micro.outputs["Fac"], grain_col.inputs["Fac"])
    nt.links.new(grain_col.outputs["Color"], grain.inputs[7])
    nt.links.new(grain.outputs[2], b.inputs["Base Color"])

    # --- the kit's cliff NORMAL map as a DETAIL layer: its relief, not its colour. This is the
    # one thing the bought pack genuinely gives the land, and it costs one 2048 map. Tiled at
    # ~2.4 ground units so it lands between the grain and the landform.
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (2.5, 2.5, 2.5)
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])
    detail = nt.nodes.new("ShaderNodeTexImage")
    detail.image = _kit_image("Pine_Cliff_Normal.tga")
    detail.image.colorspace_settings.name = "Non-Color"
    nt.links.new(mp.outputs["Vector"], detail.inputs["Vector"])
    # ⚠ AND ITS LIMIT, measured here: at strength 0.55 the cliff map's own directional rock
    # striation shows through the grass as visible WHORLS, and the tiling with it. It is a rock
    # map; asked to be a ground map it imposes rock on the ground. Held at 0.30 it contributes
    # surface break-up without asserting a material, and the procedural grain does the rest.
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.30 if grain_on else 0.0
    nt.links.new(detail.outputs["Color"], nm.inputs["Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.30 if grain_on else 0.0
    nt.links.new(micro.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(nm.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_kit_cliff():
    """The trial's skirt: the pack's own `Cliff` material, image maps and all."""
    cliff = bpy.data.materials.get("Cliff")
    if cliff is not None:
        return cliff
    m = bpy.data.materials.new("Skirt_Fallback")
    m.use_nodes = True
    _bsdf(m).inputs["Base Color"].default_value = (0.30, 0.26, 0.21, 1.0)
    return m


def mat_strata():
    """A procedural bedded rock for the skirt, so the coast question can be asked without the
    kit: horizontal bands driven by world Z, warped by noise so they are not stripes."""
    m = bpy.data.materials.new("Skirt_Strata")
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.85
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    warp = _noise(nt, 3.4, 6.0)
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MULTIPLY_ADD"
    add.inputs[1].default_value = 1.6
    nt.links.new(sep.outputs["Z"], add.inputs[0])
    nt.links.new(warp.outputs["Fac"], add.inputs[2])
    band = nt.nodes.new("ShaderNodeMath")
    band.operation = "WRAP"
    band.inputs[1].default_value = 1.0
    band.inputs[2].default_value = 0.0
    nt.links.new(add.outputs[0], band.inputs[0])
    ramp = _ramp(nt, [(0.00, (0.155, 0.135, 0.112, 1.0)),
                      (0.34, (0.300, 0.268, 0.222, 1.0)),
                      (0.55, (0.205, 0.180, 0.152, 1.0)),
                      (0.82, (0.375, 0.340, 0.288, 1.0))])
    nt.links.new(band.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    nt.links.new(band.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


# ---------------------------------------------------------------- scatter

def place(source, x, y, z, scale=1.0, rot=None):
    """A LINKED duplicate -- shares mesh data, so 70 trees cost one tree of memory."""
    ob = bpy.data.objects.new(source.name + "_i", source.data)
    ob.location = (x, y, z)
    ob.rotation_euler = rot or (0.0, 0.0, rng.uniform(0, math.tau))
    ob.scale = (scale, scale, scale)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def scatter(field, bounds, kind):
    """Groves with bare ground between them -- the reference's own composition rule, and the
    thing the 2026-08-22 pass found mattered more than any per-plant detail.

    Identical seed, counts and algorithm in every variant. The ONE thing that differs is that on
    a land which HAS a shore and a path, nothing is planted on either: a path with trees growing
    down the middle of it is not a path. That is a consequence of the geometry, not a separate
    art decision, and it is called out in the README rather than buried."""
    counts = {
        "forest": dict(stands=13, per_stand=(4, 8), rocks=16, under=70, grass=120, flower=26, logs=5),
        "sparse": dict(stands=6, per_stand=(2, 4), rocks=22, under=30, grass=70, flower=34, logs=4),
        "rocky": dict(stands=8, per_stand=(3, 6), rocks=38, under=44, grass=90, flower=14, logs=6),
    }[kind]

    x0, x1, y0, y1 = bounds

    def ok(x, y, margin):
        if not field["inside"](x, y, margin):
            return False
        return field["wear"](x, y) < 0.30

    def rand_point(margin=1.4):
        for _ in range(400):
            x = rng.uniform(x0, x1)
            y = rng.uniform(y0, y1)
            if ok(x, y, margin):
                return x, y
        return None

    n_trees = 0
    for _ in range(counts["stands"]):
        c = rand_point(3.0)
        if not c:
            continue
        cx, cy = c
        for _ in range(rng.randint(*counts["per_stand"])):
            for _try in range(30):
                x, y = cx + rng.gauss(0, 3.6), cy + rng.gauss(0, 3.0)
                if ok(x, y, 1.2):
                    break
            else:
                continue
            z, s = field["ground_z"](x, y), rng.uniform(0.70, 1.30)
            if rng.random() < 0.09:
                place(src(rng.choice(DEAD_TREES)), x, y, z, s)
            else:
                trunk, leaves = rng.choice(TREE_PAIRS)
                rot = (0.0, 0.0, rng.uniform(0, math.tau))
                place(src(trunk), x, y, z, s, rot)
                place(src(leaves), x, y, z, s, rot)
            n_trees += 1

    def sprinkle(names, n, lo, hi, margin=1.0):
        for _ in range(n):
            p = rand_point(margin)
            if p:
                place(src(rng.choice(names)), p[0], p[1],
                      field["ground_z"](*p), rng.uniform(lo, hi))

    sprinkle(ROCKS, counts["rocks"], 0.6, 2.0, 1.2)
    sprinkle(UNDERGROWTH, counts["under"], 0.7, 1.35)
    sprinkle(GRASS, counts["grass"], 0.8, 1.7, 0.6)
    sprinkle(FLOWERS, counts["flower"], 0.8, 1.5, 0.8)
    sprinkle(LOGS, counts["logs"], 0.8, 1.2, 1.5)
    return n_trees


# ---------------------------------------------------------------- camera + light

def add_camera():
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"                       # 2.5D isometric: ADR-0380 D6 fence 4 STANDS
    cam = bpy.data.objects.new("Cam", cam_data)
    elev = math.radians(RENDER_ELEV_DEG)
    cam.location = (0.0, -260.0 * math.cos(elev), 260.0 * math.sin(elev))
    cam.rotation_euler = (math.radians(90 - RENDER_ELEV_DEG), 0.0, 0.0)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def frame_canonical(cam, cells, margin=1.04):
    """PIN the framing to a canonical box rather than auto-fitting to what is in the scene.

    The trial auto-fitted to renderable bounds. That is right for one picture and WRONG for a
    comparison: relief adds height, a shore moves the coast in, and either would silently
    re-zoom the island so a variant could look better by being framed tighter. Here every
    variant gets the same ortho scale and the same centre, derived from the hex footprint alone.
    """
    xs, ys = [], []
    for (q, r) in cells:
        for (x, y) in hex_ring(q, r):
            xs.append(x)
            ys.append(y)
    box = [(x, y, z) for x in (min(xs), max(xs)) for y in (min(ys), max(ys))
           for z in (-SLAB_DEPTH, 6.0)]
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    us, vs = [], []
    for p in box:
        q_ = inv @ Vector(p)
        us.append(q_.x)
        vs.append(q_.y)
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    w, h = (u1 - u0) * margin, (v1 - v0) * margin
    cam.data.ortho_scale = w
    cam.location += cam.matrix_world.to_3x3() @ Vector(((u0 + u1) / 2, (v0 + v1) / 2, 0.0))
    return w, h


def add_light():
    # three.js (Y up) -> Blender (Z up):  (x, y, z) -> (x, -z, y)
    lx, ly, lz = LIGHT_THREE
    d = Vector((lx, -lz, ly)).normalized()
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.6
    sun_data.angle = math.radians(3.0)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.location = d * 120
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(sun)

    world = bpy.context.scene.world or bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        # Cool sky fill: shadows rotate toward blue instead of going black. This is the
        # ISLANDERS "a shaded face ROTATES IN HUE" finding, which a physical renderer gets for
        # free from a sky and our token-x-level shader structurally cannot express.
        bg.inputs[0].default_value = (0.44, 0.54, 0.68, 1.0)
        bg.inputs[1].default_value = 0.40


# ---------------------------------------------------------------- render device

# ⚠ `build_island.py` hardcoded `scene.cycles.device = "CPU"` with the comment "no CUDA/OptiX/HIP
# on this box, measured". True of the Snapdragon box it ran on, FALSE on the Linux box with an
# RTX 2060 where OptiX and CUDA both enumerate. Corrected in place there and selectable here.
#
#   - get_devices_for_type() raises TypeError for a backend this build does not know (METAL on
#     Linux) rather than returning []. Wrap PER TYPE or it dies on the first one.
#   - it returns the CPU ALONGSIDE any GPU, so `if devices:` reports a GPU on a CPU-only box.
#     Filter by d.type == backend; that is the only reading that answers the question asked.

GPU_BACKENDS = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def gpus_of(cprefs, backend):
    try:
        devs = cprefs.get_devices_for_type(backend)
    except Exception:
        return []
    return [d for d in devs if getattr(d, "type", None) == backend]


def select_device(scene, want="AUTO"):
    addon = bpy.context.preferences.addons.get("cycles")
    if want == "CPU" or addon is None:
        scene.cycles.device = "CPU"
        return "CPU", "CPU (requested)" if want == "CPU" else "CPU (no cycles preferences)"
    cprefs = addon.preferences
    order = GPU_BACKENDS if want in ("AUTO", "GPU") else (want,)
    for backend in order:
        gpus = gpus_of(cprefs, backend)
        if not gpus:
            continue
        cprefs.compute_device_type = backend
        for d in cprefs.devices:
            d.use = (getattr(d, "type", None) == backend)
        scene.cycles.device = "GPU"
        return "GPU", "%s: %s" % (backend, ", ".join(d.name for d in gpus))
    scene.cycles.device = "CPU"
    return "CPU", "CPU (no GPU backend enumerates a device here)"


# ---------------------------------------------------------------- variants

VARIANTS = {
    #             geometry  ground material   skirt material   path  strata
    "control":   ("hex",  mat_control,     mat_kit_cliff, False, False),
    "procedural": ("hex", mat_procedural,  mat_kit_cliff, False, False),
    "textured":  ("hex",  mat_textured,    mat_kit_cliff, False, False),
    "relief":    ("grid", mat_control,     mat_kit_cliff, False, False),
    "combined":  ("grid", mat_attribute,   mat_kit_cliff, True,  True),
    "strata":    ("grid", mat_attribute,   mat_strata,    True,  True),
    # `structure` is `combined` with the two PIXEL-SCALE layers switched off -- the grain octave
    # and the kit detail normal -- and nothing else changed. It exists to put a NUMBER on what
    # the grain buys at 1948 px and what it costs on ADR-0418 D4's colour-spread band, so the
    # recommendation is a measured trade rather than a preference.
    "structure": ("grid", lambda: mat_attribute(grain_on=False), mat_kit_cliff, True, True),
}


def main():
    import time
    scene = bpy.context.scene
    if LAND not in VARIANTS:
        raise SystemExit("unknown --land %r; known: %s" % (LAND, ", ".join(sorted(VARIANTS))))
    geom, ground_mat, skirt_mat, with_path, with_strata = VARIANTS[LAND]

    # The pack's objects are the LIBRARY, not the scene, and they live in the pack's own
    # collections. Hide each one directly -- hiding the root collection misses every one.
    for ob in list(bpy.data.objects):
        ob.hide_render = True
        ob.hide_viewport = True

    t0 = time.time()
    cells = cluster_cells()
    poly = coast_polygon(cells)
    if geom == "hex":
        island, field = build_land_hex(cells)
        # exactly the trial's sampling box, so `control` reproduces the trial's own draw
        cxs = [hex_centre(q, r)[0] for (q, r) in cells]
        cys = [hex_centre(q, r)[1] for (q, r) in cells]
        bounds = (min(cxs) - HEX_R * XSTRETCH, max(cxs) + HEX_R * XSTRETCH,
                  min(cys) - HEX_R, max(cys) + HEX_R)
    else:
        island, field = build_land_grid(cells, poly, with_path, with_strata)
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        bounds = (min(xs), max(xs), min(ys), max(ys))
    island.hide_render = island.hide_viewport = False
    island.data.materials.append(ground_mat())
    island.data.materials.append(skirt_mat())

    # ⚠ --bare renders the land with NOTHING standing on it. Still a WHOLE island at delivered
    # size (ADR-0392 D1) -- not a crop, not a fragment, not a contact sheet -- and it is the only
    # way to ask "is the LAND good" rather than "is the picture good", which is the question this
    # increment was chartered on. The dressed six stay the primary evidence.
    n_trees = 0 if BARE else scatter(field, bounds, SCATTER)
    cam = add_camera()
    add_light()
    view_w, view_h = frame_canonical(cam, cells)
    t_build = time.time() - t0

    scene.render.engine = "CYCLES"
    dev, dev_desc = select_device(scene, DEVICE)
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True          # our islands composite on a page, not a sky
    # max zlib effort: a denoised path-traced frame compresses badly and these are COMMITTED
    scene.render.image_settings.compression = 100
    scene.view_settings.view_transform = "Standard"

    print("\n=== LAND (%s / %s) ===" % (LAND, SCATTER))
    print("  cells         : %d   coast polygon: %d pts" % (len(cells), len(poly)))
    print("  land verts    : %d  faces: %d" % (len(island.data.vertices),
                                               len(island.data.polygons)))
    print("  view width    : %.1f pack units (PINNED, identical in every variant)" % view_w)
    print("  trees         : %d  (%.1f%% of view width)" % (n_trees, 2.3 / view_w * 100))
    print("  objects drawn : %d" % sum(1 for o in scene.objects
                                       if o.type == "MESH" and not o.hide_render))
    print("  render device : %s -- %s" % (dev, dev_desc))
    print("  build time    : %.2f s" % t_build)

    for px in WIDTHS:
        scene.render.resolution_x = px
        scene.render.resolution_y = max(1, int(round(px * view_h / view_w)))
        out = os.path.join(OUT_DIR, "land-%s%s-%dpx.png"
                           % (LAND, "-bare" if BARE else "", px))
        scene.render.filepath = out
        t1 = time.time()
        bpy.ops.render.render(write_still=True)
        print("  RENDER %s %dx%d  %.2f s  (a tree is %.1f delivered px)"
              % (LAND, scene.render.resolution_x, scene.render.resolution_y,
                 time.time() - t1, 2.3 / view_w * px))


main()
