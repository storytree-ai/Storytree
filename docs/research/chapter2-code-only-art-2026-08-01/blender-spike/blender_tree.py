#!/usr/bin/env python3
"""ADR-0280 D2a spike — a code-generated tree rendered by headless Blender.

Run:  blender --background --python blender_tree.py -- --out <dir> --frames 6

Everything structural is computed HERE (D1: code owns skeleton, camera, growth).
Blender is only the renderer. No .blend is a source of truth; this file is.

Camera: orthographic, 20 deg elevation — ADR-0280 D1's calibrated projection, the
same number code-your-own-call declares in its registration.json.
Render:  CPU Cycles, fixed seed, fixed samples (D2a determinism constraint).
"""
import math
import os
import sys

import bpy
import mathutils

# ---------------------------------------------------------------- args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = arg("--out", "frames")
NFRAMES = int(arg("--frames", "6"))
RES = int(arg("--res", "128"))
SAMPLES = int(arg("--samples", "48"))
SEED = 20260801
ELEV_DEG = 20.0

os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette anchors
# sampled from exp-16's committed 32-colour track palette (linear-ised below)
BARK_SRGB = (114 / 255, 73 / 255, 45 / 255)
FOLIAGE_SRGB = (121 / 255, 141 / 255, 83 / 255)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


# ---------------------------------------------------------------- deterministic noise
def h01(*key):
    """Identity-keyed hash in [0,1) — never a draw counter (round-4's lesson)."""
    x = SEED
    for k in key:
        x = (x * 1000003) ^ (int(k) * 2654435761)
        x &= 0xFFFFFFFF
    return ((x >> 8) & 0xFFFFFF) / float(1 << 24)


# ---------------------------------------------------------------- skeleton
class Seg:
    __slots__ = ("a", "b", "r0", "r1", "depth", "birth", "addr", "is_end")

    def __init__(self, a, b, r0, r1, depth, birth, addr, is_end=False):
        self.a, self.b = a, b
        self.r0, self.r1 = r0, r1
        self.depth, self.birth, self.addr = depth, birth, addr
        self.is_end = is_end          # last sub-step of a branch: where leaves sit


def build_skeleton():
    """One tree, grown once. Each segment records the DEPTH it was born at, so the
    tree at any age is a strict PREFIX of the mature tree — topology cannot mutate."""
    segs, tips = [], []
    max_depth = 6

    def grow(base, direction, length, radius, depth, addr):
        if depth > max_depth or length < 0.035:
            tips.append((base, radius, depth, addr))
            return
        steps = 3
        p = base
        d = mathutils.Vector(direction).normalized()
        for s in range(steps):
            # gentle identity-keyed curl, plus gravitropism on the leader
            curl = (h01(addr, s, 7) - 0.5) * 0.30
            d = (d + mathutils.Vector((curl, curl * 0.6, 0.10 if depth else 0.02))).normalized()
            seg_len = length / steps
            q = p + d * seg_len
            t0 = s / steps
            t1 = (s + 1) / steps
            segs.append(Seg(p.copy(), q.copy(),
                            radius * (1 - 0.35 * t0), radius * (1 - 0.35 * t1),
                            depth, depth, addr, is_end=(s == steps - 1)))
            p = q

        # da Vinci / Murray pipe model: r_parent^e = sum(r_child^e)
        nkids = 3 if depth < 2 else 2
        e = 2.3
        child_r = radius * (1.0 / nkids) ** (1.0 / e)
        for k in range(nkids):
            ang = 0.50 + (h01(addr, k, 11) - 0.5) * 0.45
            # spread children around the parent rather than letting the hash cluster them
            azim = (k / nkids) * math.tau + depth * 1.9 + h01(addr, k, 13) * 0.7
            axis = mathutils.Vector((math.cos(azim), math.sin(azim), 0.0))
            nd = d.copy()
            nd.rotate(mathutils.Quaternion(axis, ang))
            nd = (nd + mathutils.Vector((0, 0, 0.22))).normalized()
            grow(p, nd, length * (0.70 + 0.10 * h01(addr, k, 17)),
                 child_r, depth + 1, addr * 7 + k + 1)

    grow(mathutils.Vector((0, 0, 0)), mathutils.Vector((0, 0, 1)),
         1.00, 0.135, 0, 1)
    return segs, tips


SEGS, TIPS = build_skeleton()
MAXD = max(s.depth for s in SEGS)

# The MATURE extent, computed once. The camera is framed to this and then held
# FIXED for every frame, so the tree grows inside a stable frame and its base stays
# planted — round 3's root-drift complaint, answered by construction.
MATURE_TOP = max(s.b.z for s in SEGS)
MATURE_HALFW = max(max(abs(s.b.x), abs(s.a.x)) for s in SEGS) + 0.45


# ---------------------------------------------------------------- scene
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_materials():
    bark = bpy.data.materials.new("bark")
    bark.use_nodes = True
    bsdf = bark.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = lin(BARK_SRGB)
    bsdf.inputs["Roughness"].default_value = 0.92

    fol = bpy.data.materials.new("foliage")
    fol.use_nodes = True
    b2 = fol.node_tree.nodes["Principled BSDF"]
    b2.inputs["Base Color"].default_value = lin(FOLIAGE_SRGB)
    b2.inputs["Roughness"].default_value = 0.78
    return bark, fol


def add_branches(age, bark):
    """One mesh for all wood at this age. Segments beyond the age are simply absent —
    prefix growth, and the newest order emerges from zero length."""
    verts, faces = [], []
    RINGS = 7
    for s in SEGS:
        if s.depth > age:
            continue
        # the frontier order eases out of zero so nothing pops in
        frac = 1.0 if s.depth < age else max(0.0, min(1.0, age - s.depth + 1.0))
        if frac <= 0.01:
            continue
        a, b = s.a, s.a.lerp(s.b, frac)
        r0, r1 = s.r0, s.r0 + (s.r1 - s.r0) * frac
        d = (b - a)
        if d.length < 1e-6:
            continue
        d.normalize()
        up = mathutils.Vector((0, 0, 1))
        ref = up if abs(d.dot(up)) < 0.95 else mathutils.Vector((1, 0, 0))
        u = d.cross(ref).normalized()
        v = d.cross(u).normalized()
        base = len(verts)
        for i in range(RINGS):
            th = i / RINGS * math.tau
            off = u * math.cos(th) + v * math.sin(th)
            verts.append(a + off * r0)
            verts.append(b + off * r1)
        for i in range(RINGS):
            i0 = base + i * 2
            i1 = base + ((i + 1) % RINGS) * 2
            faces.append((i0, i1, i1 + 1, i0 + 1))

    me = bpy.data.meshes.new("wood")
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new("wood", me)
    ob.data.materials.append(bark)
    bpy.context.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = True
    return ob


def add_canopy(age, fol):
    """Foliage rides the GROWTH FRONTIER, not just the final tips.

    A twig carries leaf mass while it is young; as it lignifies and pushes children,
    that mass is taken over by a larger lobe further out. So the tree is leafy at
    every age instead of being a bare armature that greens only at the end — and
    because lobe radius is monotone in age, no leaf mass ever shrinks.
    """
    obs = []
    verts_seen = {}
    for s in SEGS:
        if s.depth > age or not s.is_end:
            continue                      # leaves sit at BRANCH ends, never mid-shaft —
                                          # otherwise a straight trunk grows a caterpillar
        # is this segment at the leafing frontier for this age?
        band = age - s.depth
        if band > 1.9:
            continue                      # deep inside the tree: fully lignified
        emerge = max(0.0, min(1.0, band + 0.35))
        if emerge <= 0.02:
            continue
        key = (round(s.b.x, 3), round(s.b.y, 3), round(s.b.z, 3))
        if key in verts_seen:
            continue
        verts_seen[key] = True
        # young twigs carry small blades; older frontier carries the big lobes
        maturity = min(1.0, band / 1.9)
        rad = (0.055 + 0.30 * maturity) * (0.66 + 0.55 * h01(s.addr, 23)) * emerge
        if rad < 0.010:
            continue
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rad, location=s.b)
        ob = bpy.context.active_object
        ob.scale = (1.0, 1.0, 0.74)
        ob.data.materials.append(fol)
        for pl in ob.data.polygons:
            pl.use_smooth = True
        obs.append(ob)
    return obs


def setup_camera_and_light():
    """Orthographic at ELEV_DEG above the horizon — the calibrated projection.

    Framed ONCE to the mature extent and identical on every frame: the tree grows
    within a fixed frame instead of the camera chasing it.
    """
    el = math.radians(ELEV_DEG)
    dist = 12.0
    # vertical world extent the frame must hold, with a little headroom and a
    # margin below the contact row so the base never sits on the very edge
    span = max(MATURE_TOP * 1.12, MATURE_HALFW * 2.0)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    # aim at a point that leaves the ground contact just above the bottom edge
    target = mathutils.Vector((0.0, 0.0, span * 0.5 * math.cos(el) - 0.10))
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = target + mathutils.Vector(
        (0.0, -dist * math.cos(el), dist * math.sin(el)))
    cam.rotation_euler = (math.pi / 2 - el, 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    key = bpy.data.lights.new("key", type="SUN")
    key.energy = 3.6
    key.angle = math.radians(9.0)
    ko = bpy.data.objects.new("key", key)
    ko.rotation_euler = (math.radians(52), 0.0, math.radians(38))
    bpy.context.collection.objects.link(ko)

    fill = bpy.data.lights.new("fill", type="SUN")
    fill.energy = 1.1
    fo = bpy.data.objects.new("fill", fill)
    fo.rotation_euler = (math.radians(65), 0.0, math.radians(-115))
    bpy.context.collection.objects.link(fo)


def render(path):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"                 # D2a: CPU only, driver-stable
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.seed = SEED                    # D2a: fixed seed
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True        # transparent PNG, app composites
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"   # no filmic; palette control is ours
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- drive
for i in range(NFRAMES):
    u = i / max(1, NFRAMES - 1)
    age = 0.6 + u * (MAXD - 0.2)
    clear()
    bark, fol = make_materials()
    add_branches(age, bark)
    add_canopy(age, fol)
    setup_camera_and_light()
    out = os.path.join(OUT, f"frame-{i:02d}.png")
    render(out)
    print(f"SPIKE_FRAME {i} age={age:.2f} -> {out}")

print("SPIKE_DONE", NFRAMES, "frames at", RES, "px,", SAMPLES, "samples, CPU Cycles")
