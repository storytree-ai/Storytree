#!/usr/bin/env python3
"""The ADDRESSABLE SET both variants of ADR-0367's interior fork compose from — one run, one state.

ADR-0367 D2 forbids a baked island: what a render may deliver is PIECES the app composes per cell and
per coast segment, because Context FACT 2 makes anything coarser structurally impossible. So this
renders pieces, never a scene:

  · `tile-<n>.png`  — variant (a)'s SIX lattice kites, each a real extruded block: chamfered top,
                      four walls dropping a world depth. Six pieces cover the whole interior because
                      the regularised lattice repeats (`island.json`.variantA.pieceSet).
  · `wall-<h>.png`  — the coast cliff at SIXTEEN quantised outward headings. Shape-independent by
                      construction, so BOTH variants get the identical rim and the fork picture varies
                      exactly one thing: the interior.

Variant (b) needs no interior piece at all — that IS variant (b) — so the two variants come out of one
invocation of one file, which is what the hero track's `crown-normals-fork.png` failed to do when four
of its five cells were rendered before a constant existed and one after.

WHAT THE RENDER EMITS IS BAND KEYS, NOT COLOUR. Every face emits one of five flat, widely separated
key triples standing for (flat top / lit chamfer / shaded chamfer / lit wall / shaded wall). The
compositor maps a key to an actual island token at paint time, so the per-cell STATUS TINT is a
property of the mapping rather than of the render — which is how ADR-0367 D5 survives by construction
instead of by promise. Emission + a Standard view transform means the rendered pixel IS the key.

The camera is whatever `island.json` says it is, which is whatever `LAND_CAMERA_ELEVATION_DEG` says it
is (ADR-0367 D1). This file declares no angle.

Run (Blender's own bundled Python — `bpy` from PyPI has no wheel for the installed Python, and the
plain-Python route grows different numbers under a different numpy):

    blender --background --python blender_land.py -- --out pieces --samples 48
    blender --background --python blender_land.py -- --out pieces --only tiles     # the fast loop
"""
import hashlib
import json
import math
import os
import sys

import bpy  # noqa: E402  (only importable under Blender)
import mathutils  # noqa: E402

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


HERE = os.path.dirname(os.path.abspath(__file__))
ISLAND = json.load(open(os.path.join(HERE, "island.json")))

OUT = os.path.join(HERE, arg("--out", "pieces"))
SAMPLES = int(arg("--samples", "48"))
SEED = int(arg("--seed", "20260815"))
SS = int(arg("--ss", "3"))                 # supersample factor; the back half mode-downsamples by it
ONLY = arg("--only", "all")                # all | tiles | walls

ELEV_DEG = float(ISLAND["camera"]["elevationDeg"])
EL = math.radians(ELEV_DEG)
DEPTH = float(ISLAND["tileDepthWorld"])    # TILE_DEPTH_WORLD — a world HEIGHT, not a screen offset

# One square canvas for every piece, in APP PIXELS of ground/world measure. A kite spans a hex radius
# across and its walls a further DEPTH down; the coast cliff is smaller. Sharing one canvas keeps the
# compositor's paste rule to a single line: the piece's centre is the placement's projected centre.
PIECE_W = 64.0
RES = int(PIECE_W * SS)

# The chamfer that makes an extruded block read as a block rather than as a flat polygon. It is not
# decoration: with every cell at the same height an unchamfered lattice shows NO interior edge at all,
# because a neighbour at equal height hides the wall behind it. The bevel is what carries (a)'s
# "genuine thickness on every cell" into the interior instead of only around the rim.
CHAMFER_W = float(arg("--chamfer", "1.7"))       # ground inset of the flat top face
CHAMFER_DROP = float(arg("--chamfer-drop", "1.0"))  # world height the chamfer falls over that inset

CLIFF = DEPTH + 3.0  # the coast wall's drop, below the land plane
WALL_OVERLAP = 1.18  # tangential overlap between neighbouring cliff pieces, so the rim has no gaps

# The hero tree's own key direction, reused verbatim: the land and the object standing on it must be
# lit by one light as much as they must be seen through one camera (ADR-0367 D1's reasoning applied to
# the other half of the composite). Divergent light is the same class of mismatch as divergent angle.
LIGHT_DIR = (-0.435, -0.429, 0.792)
KEY_ROT = (math.radians(48), 0.0, math.radians(34))

# ---------------------------------------------------------------- band keys
# Widely separated so a Cycles-antialiased boundary pixel that lands between two keys still classifies
# to one of the two it lies between. The fringe is one pixel at SS=3 and the majority downsample in
# the back half discards it — the same tactic `pixelise.py` uses for its family test.
KEYS = {
    "top": (255, 0, 0),          # the flat top face — the cell's own colour, unshaded
    "chamfer_lit": (0, 255, 0),  # bevel turned toward the key
    "chamfer_dark": (0, 0, 255), # bevel turned away
    "wall_lit": (255, 255, 0),
    "wall_dark": (0, 255, 255),
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def keyed(name, bands):
    """A material that emits one of `bands` — [(position, key-name), ...] ascending — chosen by N·L
    through a CONSTANT ramp. No AO term: an isolated piece has nothing to occlude it, so an AO-driven
    band would read differently in the piece than in the composed island, which is exactly the kind of
    silent second variable this spike must not introduce.
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
    mr.inputs["To Min"].default_value = 0.0
    mr.inputs["To Max"].default_value = 1.0
    nt.links.new(dot.outputs["Value"], mr.inputs["Value"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp
    el.interpolation = "CONSTANT"
    while len(el.elements) > 1:
        el.elements.remove(el.elements[-1])
    el.elements[0].position = bands[0][0]
    el.elements[0].color = lin(tuple(c / 255 for c in KEYS[bands[0][1]]))
    for pos, key in bands[1:]:
        e = el.elements.new(pos)
        e.color = lin(tuple(c / 255 for c in KEYS[key]))
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])

    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def mesh_object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


def world(gx, gy, z):
    """GROUND (app) coordinates -> Blender world. The app's ground y runs INTO the screen, and the
    camera looks along +Y, so the sign flips: a point further from the viewer has a larger app y and a
    more positive world y. Getting this backwards mirrors every piece and nothing else complains."""
    return (gx, -gy, z)


def make_world():
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin((0.60, 0.68, 0.74))
    bg.inputs["Strength"].default_value = 0.62
    bpy.context.scene.world = w


def setup_camera_and_light():
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = PIECE_W
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = mathutils.Vector((0.0, -400.0 * math.cos(EL), 400.0 * math.sin(EL)))
    cam.rotation_euler = (math.pi / 2 - EL, 0.0, 0.0)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    key = bpy.data.lights.new("key", type="SUN")
    key.energy = 3.4
    key.angle = math.radians(7.0)
    ko = bpy.data.objects.new("key", key)
    ko.rotation_euler = KEY_ROT
    bpy.context.collection.objects.link(ko)


def render(path):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"                       # ADR-0280 D2a: CPU only
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False                # flat emission needs none, and it is not free
    sc.cycles.seed = SEED
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"   # the palette is ours, not filmic's
    bpy.ops.render.render(write_still=True)


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_world()
    setup_camera_and_light()


def inset_polygon(poly, d):
    """Shrink a convex ground polygon toward its centroid by roughly `d`. A centroid scale rather than
    a true offset: the kites are small and near-convex, so the difference is under a tenth of a pixel
    and a real offset would need its own degenerate-case handling for no visible gain."""
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, y in poly:
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy) or 1.0
        s = max(0.05, (r - d) / r)
        out.append((cx + dx * s, cy + dy * s))
    return out


def build_block(poly):
    """One extruded lattice cell: flat top, chamfer ring, four walls to -DEPTH.

    Three objects because they carry three materials, and the material IS the band vocabulary — the
    compositor has to be able to tell a top pixel from a wall pixel without a second render pass.
    """
    n = len(poly)
    top_in = inset_polygon(poly, CHAMFER_W)

    flat = [world(x, y, 0.0) for x, y in top_in]
    mesh_object("top", flat, [tuple(range(n))], MAT_TOP)

    rim_v, rim_f = [], []
    for i in range(n):
        a_in, b_in = top_in[i], top_in[(i + 1) % n]
        a_out, b_out = poly[i], poly[(i + 1) % n]
        base = len(rim_v)
        rim_v += [world(a_in[0], a_in[1], 0.0), world(b_in[0], b_in[1], 0.0),
                  world(b_out[0], b_out[1], -CHAMFER_DROP), world(a_out[0], a_out[1], -CHAMFER_DROP)]
        rim_f.append((base, base + 1, base + 2, base + 3))
    mesh_object("chamfer", rim_v, rim_f, MAT_CHAMFER)

    wall_v, wall_f = [], []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        base = len(wall_v)
        wall_v += [world(a[0], a[1], -CHAMFER_DROP), world(b[0], b[1], -CHAMFER_DROP),
                   world(b[0], b[1], -DEPTH), world(a[0], a[1], -DEPTH)]
        wall_f.append((base, base + 1, base + 2, base + 3))
    mesh_object("walls", wall_v, wall_f, MAT_WALL)


def build_cliff(heading_idx, headings):
    """The coast wall at one quantised OUTWARD heading: a cliff face dropping from the land plane,
    plus a narrow lip at the top so the rim is not a paper edge. Independent of any cell's shape,
    which is the whole reason option (b) can render it at all."""
    ang = (heading_idx / headings) * math.tau
    nx, ny = math.cos(ang), math.sin(ang)
    tx, ty = -ny, nx                                   # the tangent the piece runs along
    half = (ISLAND["wall"]["step"] * WALL_OVERLAP) / 2.0

    a = (tx * -half, ty * -half)
    b = (tx * half, ty * half)
    lip = 1.4
    a_out = (a[0] + nx * lip, a[1] + ny * lip)
    b_out = (b[0] + nx * lip, b[1] + ny * lip)

    mesh_object(
        "lip",
        [world(a[0], a[1], 0.0), world(b[0], b[1], 0.0),
         world(b_out[0], b_out[1], -0.9), world(a_out[0], a_out[1], -0.9)],
        [(0, 1, 2, 3)],
        MAT_CHAMFER,
    )
    mesh_object(
        "cliff",
        [world(a_out[0], a_out[1], -0.9), world(b_out[0], b_out[1], -0.9),
         world(b_out[0], b_out[1], -CLIFF), world(a_out[0], a_out[1], -CLIFF)],
        [(0, 1, 2, 3)],
        MAT_WALL,
    )


os.makedirs(OUT, exist_ok=True)
MAT_TOP = MAT_CHAMFER = MAT_WALL = None

pieces = ISLAND["variantA"]["pieceSet"]
headings = int(ISLAND["wall"]["headings"])

if ONLY in ("all", "tiles"):
    for i, pc in enumerate(pieces):
        new_scene()
        MAT_TOP = keyed("top", [(0.0, "top")])
        MAT_CHAMFER = keyed("chamfer", [(0.0, "chamfer_dark"), (0.52, "chamfer_lit")])
        MAT_WALL = keyed("wall", [(0.0, "wall_dark"), (0.50, "wall_lit")])
        build_block([tuple(p) for p in pc["poly"]])
        render(os.path.join(OUT, f"tile-{i}.png"))
        print(f"tile-{i} rendered  shapeClass={pc['shape'][:28]}...  covers {pc['count']} cells",
              flush=True)

if ONLY in ("all", "walls"):
    for h in range(headings):
        new_scene()
        MAT_TOP = keyed("top", [(0.0, "top")])
        MAT_CHAMFER = keyed("chamfer", [(0.0, "chamfer_dark"), (0.52, "chamfer_lit")])
        MAT_WALL = keyed("wall", [(0.0, "wall_dark"), (0.50, "wall_lit")])
        build_cliff(h, headings)
        render(os.path.join(OUT, f"wall-{h}.png"))
        print(f"wall-{h} rendered  outward heading {(h / headings) * 360:.1f} deg", flush=True)

def _own_code_state():
    """THE code state of this render: this file's own source digest.

    The convention landed by `provenance.py` (increment `committed-derived-evidence-carries-producer`),
    adopted here rather than reinvented. NOT the flags — the chamfer sweep varies `--chamfer` on
    purpose, and a fork picture is *supposed* to vary its flags; what it must never vary is the code
    underneath. `compose.py` and `sweep_chamfer.py` read this back and refuse to compose cells whose
    declarations disagree, which is what turns this spike's "ONE code state" claim from an argument
    into a mechanism.

    Hashed inline with `hashlib` rather than by importing the sibling module, because Blender does not
    reliably put a `--python` script's own directory on `sys.path` — the same reason `blender_tree.py`
    computes it inline.
    """
    path = os.path.abspath(__file__)
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return {"generator": os.path.basename(path), "sha256": h.hexdigest()}


meta = {
    "generator": "blender_land.py",
    "code_state": _own_code_state(),
    # the exact invocation, so a piece directory's own levers never have to be recalled
    "argv": list(ARGV),
    "blender": bpy.app.version_string,
    "engine": "CYCLES/CPU",
    "seed": SEED,
    "samples": SAMPLES,
    "supersample": SS,
    "pieceCanvasWorld": PIECE_W,
    "pieceCanvasPx": RES,
    "camera": {"elevationDeg": ELEV_DEG,
               "rule": "orthographic; ortho_scale == the piece canvas in app px, so one world unit is "
                       "exactly SS pixels and a piece pastes at its placement's projected centre"},
    "tileDepthWorld": DEPTH,
    "chamfer": {"insetGround": CHAMFER_W, "dropWorld": CHAMFER_DROP},
    "cliffDropWorld": CLIFF,
    "lightDir": list(LIGHT_DIR),
    "lightRuleSource": "the hero tree's own key direction, reused so land and object share one light",
    "bandKeys": KEYS,
    "tilePieces": len(pieces) if ONLY in ("all", "tiles") else 0,
    "wallPieces": headings if ONLY in ("all", "walls") else 0,
    "variantBInteriorPieces": 0,
    "variantBNote": "variant (b) renders NO interior piece — the flat per-cell fills stay SVG and "
                    "keep their status tint. Both variants share the wall pieces above verbatim, so "
                    "the fork picture varies the interior and nothing else.",
}
with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE pieces ->", OUT, flush=True)
