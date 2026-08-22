"""Build one storytree island out of the Stylized Pine Forest Nature Kit and render it
at OUR camera and OUR light, so the picture is a comparison rather than a mood board.

Run:
  blender.exe -b "<pack>/Pine_Forest_Kit.blend" -P build_island.py -- --out <dir>

WHAT IS COPIED FROM US, AND WHY EACH ONE:
  - camera elevation 50 deg, ORTHOGRAPHIC. The owner signed that angle on 2026-08-16
    ("50 degrees looks good, i think we go with this"); it is `RENDER_ELEV_DEG` in
    IslandView.tsx. An arbitrary camera would make the comparison meaningless.
  - light direction normalize(-0.45, 0.82, 0.35), from `LIGHT_DIRECTION` in palette-band.ts,
    converted from three.js (Y up) to Blender (Z up) by (x, y, z) -> (x, -z, y).
  - island aspect 233.8 x 135.1 ground units = 1.73, and a tree ~3% of island width, which
    is the ratio the 2026-08-22 measurement says we are held at by the object floor.
  - delivered size 487 px wide, which is what `island-wild.png` actually is.

WHAT IS DELIBERATELY NOT COPIED: the closed palette and the four-rung ladder. That is the
whole point of the exercise -- this is the target, not the shippable.
"""

import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector

# ---------------------------------------------------------------- args

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(flag, default):
    return argv[argv.index(flag) + 1] if flag in argv else default


OUT_DIR = arg("--out", os.path.join(os.path.dirname(os.path.abspath(__file__)), "renders"))
SAMPLES = int(arg("--samples", "128"))
SEED = int(arg("--seed", "7"))
SCATTER = arg("--scatter", "forest")                    # forest | sparse | rocky
WIDTHS = [int(w) for w in arg("--widths", "487,1948").split(",")]
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------- our constants

RENDER_ELEV_DEG = 50.0                     # IslandView.tsx RENDER_ELEV_DEG (owner-signed)
ASPECT = 233.8 / 135.1                     # the real island's ground footprint
LIGHT_THREE = (-0.45, 0.82, 0.35)          # palette-band.ts LIGHT_DIRECTION (pre-normalise)

HEX_R = 7.0                                # circumradius, pack units (a pine is ~4 tall)
XSTRETCH = ASPECT / 1.42                   # stretch x so the cluster hits the real aspect
SLAB_DEPTH = 3.2                           # how far the land reads as a cut-out slab

rng = random.Random(SEED)

# ---------------------------------------------------------------- pack inventory

# Trunk <-> leaves pair up by index. NOTE the pack ships one name with a hyphen instead of
# an underscore ("Pine-Leaves_02"); matching on a naming convention would silently drop it.
TREE_PAIRS = [
    ("Pine_Trunk_01", "Pine_Leaves_01"),
    ("Pine_Trunk_02", "Pine-Leaves_02"),
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


# ---------------------------------------------------------------- island shape

def cluster_cells():
    """A hex cluster, like ours: two rings with a few outer cells dropped, so the coast is
    irregular rather than a tidy hexagon."""
    cells = []
    for q in range(-3, 4):
        for r in range(-2, 3):
            dist = (abs(q) + abs(r) + abs(q + r)) / 2       # axial ring distance
            if dist <= 3:
                cells.append((q, r))
    drop = {(-3, 2), (3, -2), (-3, 0), (3, 0), (0, -2), (2, -2), (-2, 2)}
    return [c for c in cells if c not in drop]


def hex_centre(q, r):
    """Flat-top axial -> world, stretched on x to hit the island's real aspect."""
    return HEX_R * 1.5 * q * XSTRETCH, HEX_R * math.sqrt(3) * (r + q / 2.0)


def build_land(cells):
    """One mesh: hexagonal prisms, top faces on material 0, skirt on material 1."""
    bm = bmesh.new()
    tops = {}
    for (q, r) in cells:
        cx, cy = hex_centre(q, r)
        z = rng.uniform(-0.35, 0.35)                        # gentle relief, seeded
        ring = []
        for i in range(6):
            a = math.radians(60 * i)
            ring.append(bm.verts.new((cx + HEX_R * math.cos(a) * XSTRETCH,
                                      cy + HEX_R * math.sin(a),
                                      z)))
        bm.faces.new(ring).material_index = 0
        tops[(q, r)] = z
        low = [bm.verts.new((v.co.x, v.co.y, -SLAB_DEPTH)) for v in ring]
        for i in range(6):
            j = (i + 1) % 6
            bm.faces.new([ring[i], ring[j], low[j], low[i]]).material_index = 1

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    # UVs, BY HAND. A generated mesh has no UV layer, and an image-texture material on a
    # mesh with no UVs samples texel (0,0) for every fragment -- which is why the skirt
    # rendered solid black rather than as rock. It reads as a lighting bug and is not one.
    uv = bm.loops.layers.uv.new("UVMap")
    UV_SCALE = 6.0
    for f in bm.faces:
        if f.material_index == 0:                           # top: plan projection
            for loop in f.loops:
                p = loop.vert.co
                loop[uv].uv = (p.x / UV_SCALE, p.y / UV_SCALE)
        else:                                               # skirt: run length x height
            origin = f.loops[0].vert.co
            for loop in f.loops:
                p = loop.vert.co
                run = math.hypot(p.x - origin.x, p.y - origin.y)
                loop[uv].uv = (run / UV_SCALE, p.z / UV_SCALE)

    me = bpy.data.meshes.new("Island")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Island", me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, tops


def land_materials(ob):
    """Top = a PROCEDURAL grass (the pack ships no ground texture at all -- worth noticing,
    since the ground is most of the frame); skirt = the pack's own cliff rock."""
    grass = bpy.data.materials.new("Island_Grass")
    grass.use_nodes = True
    nt = grass.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.90

    # Two noise octaves into a colour ramp: broad patches plus a fine break-up. This is
    # CONTINUOUS shading -- exactly what the banded palette forbids -- so it is the honest
    # thing to show, not a cheat.
    coarse = nt.nodes.new("ShaderNodeTexNoise")
    coarse.inputs["Scale"].default_value = 2.6
    coarse.inputs["Detail"].default_value = 6.0
    fine = nt.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 22.0
    fine.inputs["Detail"].default_value = 3.0
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.34
    nt.links.new(coarse.outputs["Fac"], mix.inputs[2])
    nt.links.new(fine.outputs["Fac"], mix.inputs[3])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.34
    ramp.color_ramp.elements[0].color = (0.075, 0.190, 0.055, 1.0)   # shadowed grass
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (0.290, 0.470, 0.150, 1.0)   # sunlit grass
    mid = ramp.color_ramp.elements.new(0.52)
    mid.color = (0.150, 0.320, 0.095, 1.0)
    nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    ob.data.materials.append(grass)

    cliff = bpy.data.materials.get("Cliff")
    if cliff is None:
        cliff = bpy.data.materials.new("Island_Rock")
        cliff.use_nodes = True
        cliff.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = \
            (0.30, 0.26, 0.21, 1.0)
    ob.data.materials.append(cliff)


# ---------------------------------------------------------------- scattering

def inside(cells, x, y, margin=1.4):
    """Is a point on the land? Distance to the nearest cell centre, in un-stretched space."""
    for (q, r) in cells:
        cx, cy = hex_centre(q, r)
        if math.hypot((x - cx) / XSTRETCH, y - cy) < HEX_R * 0.866 - margin:
            return True
    return False


def place(source, x, y, z, scale=1.0, rot=None):
    """A LINKED duplicate -- shares mesh data, so 60 trees cost one tree of memory."""
    ob = bpy.data.objects.new(source.name + "_i", source.data)
    ob.location = (x, y, z)
    ob.rotation_euler = rot or (0.0, 0.0, rng.uniform(0, math.tau))
    ob.scale = (scale, scale, scale)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ground_z(tops, x, y):
    """The z of the nearest hex top, so props sit ON the land rather than through it."""
    best, bz = 1e9, 0.0
    for (q, r), z in tops.items():
        cx, cy = hex_centre(q, r)
        d = math.hypot(x - cx, y - cy)
        if d < best:
            best, bz = d, z
    return bz


def scatter(cells, tops, kind):
    """Groves with bare ground between them -- the reference's own composition rule, and the
    thing our 2026-08-22 pass found mattered more than any per-plant detail."""
    counts = {
        "forest": dict(stands=13, per_stand=(4, 8), rocks=16, under=70, grass=120, flower=26, logs=5),
        "sparse": dict(stands=6,  per_stand=(2, 4), rocks=22, under=30, grass=70,  flower=34, logs=4),
        "rocky":  dict(stands=8,  per_stand=(3, 6), rocks=38, under=44, grass=90,  flower=14, logs=6),
    }[kind]

    xs = [hex_centre(q, r)[0] for (q, r) in cells]
    ys = [hex_centre(q, r)[1] for (q, r) in cells]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    def rand_point(margin=1.4):
        for _ in range(400):
            x = rng.uniform(x0 - HEX_R * XSTRETCH, x1 + HEX_R * XSTRETCH)
            y = rng.uniform(y0 - HEX_R, y1 + HEX_R)
            if inside(cells, x, y, margin):
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
                if inside(cells, x, y, 1.2):
                    break
            else:
                continue
            z, s = ground_z(tops, x, y), rng.uniform(0.70, 1.30)
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
                      ground_z(tops, *p), rng.uniform(lo, hi))

    sprinkle(ROCKS, counts["rocks"], 0.6, 2.0, 1.2)
    sprinkle(UNDERGROWTH, counts["under"], 0.7, 1.35)
    sprinkle(GRASS, counts["grass"], 0.8, 1.7, 0.6)
    sprinkle(FLOWERS, counts["flower"], 0.8, 1.5, 0.8)
    sprinkle(LOGS, counts["logs"], 0.8, 1.2, 1.5)
    return n_trees


# ---------------------------------------------------------------- camera + light

def add_camera():
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"                       # 2.5D isometric: ADR-0380 D6 fence 4
    cam = bpy.data.objects.new("Cam", cam_data)
    elev = math.radians(RENDER_ELEV_DEG)
    cam.location = (0.0, -260.0 * math.cos(elev), 260.0 * math.sin(elev))
    cam.rotation_euler = (math.radians(90 - RENDER_ELEV_DEG), 0.0, 0.0)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def frame_scene(cam, margin=1.04):
    """Fit the ortho camera to what is ACTUALLY renderable, in camera space -- rather than
    guessing a vertical crop from the ground footprint and leaving dead bands top and bottom."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    us, vs = [], []
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH" or ob.hide_render:
            continue
        for corner in ob.bound_box:
            p = inv @ (ob.matrix_world @ Vector(corner))
            us.append(p.x)
            vs.append(p.y)
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    w, h = (u1 - u0) * margin, (v1 - v0) * margin
    cam.data.ortho_scale = w
    # recentre on the content, in the camera's own plane
    cam.location += cam.matrix_world.to_3x3() @ Vector(((u0 + u1) / 2, (v0 + v1) / 2, 0.0))
    return w, h


def add_light():
    # three.js (Y up) -> Blender (Z up):  (x, y, z) -> (x, -z, y)
    lx, ly, lz = LIGHT_THREE
    d = Vector((lx, -lz, ly)).normalized()
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 3.6
    sun_data.angle = math.radians(3.0)            # a touch of softness on the shadow edge
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.location = d * 120
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(sun)

    world = bpy.context.scene.world or bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:                                        # cool sky fill, so shadows are not black
        bg.inputs[0].default_value = (0.44, 0.54, 0.68, 1.0)
        bg.inputs[1].default_value = 0.40


# ---------------------------------------------------------------- main

def main():
    scene = bpy.context.scene

    # The pack's own objects are the LIBRARY, not the scene. They live in the pack's
    # collections (Foliage / Pine_Trees / Rocks), NOT in the scene root -- so hiding the root
    # collection misses every one of them and they render, lined up, in the middle of the
    # island. Hide each object directly; the linked duplicates we make are separate objects
    # and are unaffected.
    for ob in list(bpy.data.objects):
        ob.hide_render = True
        ob.hide_viewport = True

    cells = cluster_cells()
    island, tops = build_land(cells)
    island.hide_render = island.hide_viewport = False
    land_materials(island)

    n_trees = scatter(cells, tops, SCATTER)
    cam = add_camera()
    add_light()
    view_w, view_h = frame_scene(cam)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"                   # no CUDA/OptiX/HIP on this box, measured
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True          # our islands composite on a page, not a sky
    scene.view_settings.view_transform = "Standard"

    print("\n=== ISLAND (%s) ===" % SCATTER)
    print("  cells         : %d" % len(cells))
    print("  view width    : %.1f pack units" % view_w)
    print("  trees         : %d  (%.1f%% of view width)" % (n_trees, 2.3 / view_w * 100))
    print("  objects drawn : %d" % sum(1 for o in scene.objects
                                       if o.type == "MESH" and not o.hide_render))

    for px in WIDTHS:
        scene.render.resolution_x = px
        scene.render.resolution_y = max(1, int(round(px * view_h / view_w)))
        out = os.path.join(OUT_DIR, "island-%s-%dpx.png" % (SCATTER, px))
        scene.render.filepath = out
        print("  -> %dx%d  (a tree is %.1f delivered px)"
              % (scene.render.resolution_x, scene.render.resolution_y, 2.3 / view_w * px))
        bpy.ops.render.render(write_still=True)


main()
