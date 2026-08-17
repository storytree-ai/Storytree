#!/usr/bin/env python3
"""STAGE 1 — WHAT EACH BLENDER GREENERY TECHNIQUE ACTUALLY DELIVERS AT 28 PIXELS.

    blender --background --python blender_greenery.py -- --out pieces-greenery

The owner, 2026-08-17, having been told we build every blade as an explicit hand-written mesh and use
no particle system anywhere: *"i think we need to try other options for long grass (or other greenery
that gives our green land textures) these pixel triangles dont really look nice, there are lots of
blender techniques for doing grass its probably worth a small research pass"*.

WHAT THIS PASS IS AND IS NOT. It renders candidate TECHNIQUES as single pieces and measures what each
one DELIVERS after the palette snap and the 3x3 majority downsample. It does not compose an island,
does not decide which technique ships, and carries no appearance verdict — ADR-0070 stage 2 reserves
that for the owner and ADR-0280 D4 makes an honest "none of these helped" an accepted outcome.

THE MEASUREMENT THAT DECIDES EVERYTHING, AND IT IS THE PIECE CANVAS ITSELF. The committed piece
protocol is 28.0 ground units across rendered at 84 px, downsampled 3x. So:

    ONE GROUND UNIT IS ONE DELIVERED PIXEL, and the whole piece canvas is 28 delivered px.

Every existing mark lives in a box of about 6x3 delivered px. That is the budget a technique has to
work inside, and it is why the sweep below varies STRAND THICKNESS in ground units rather than in the
units a Blender tutorial would use: Blender's default hair radius_scale of 0.01 is 0.03 supersampled
px — a thirtieth of one rendered pixel, and about a three-hundredth of a delivered one. A technique
authored at tutorial scale does not deliver a thin blade here; it delivers NOTHING, and that is a
statement about the pipeline rather than about the technique.

WHY THE ALPHA CARD IS IN THE SET AS A CONTROL RATHER THAN AS A CANDIDATE. It is a quad carrying a
silhouette authored AT the delivered resolution and upscaled by exactly the supersample factor, so
every authored pixel lands on exactly one delivered pixel. It cannot lose anything to the downsample
by construction, which makes it the CEILING every 3D technique in this set is trying to reach. If a
3D technique cannot approach it, the honest reading is not that the technique was tuned badly.

PIECES RENDER IN KEY COLOURS, NOT IN FINAL COLOURS. K0/K1/K2 are pure primaries the compositor
substitutes per capability status (`pieceRoles`), which is what lets one piece serve every status.
The measurement here is on ALPHA alone, so it is independent of that substitution.

`blender_grass.py` AND `blender_species.py` ARE NOT EDITED. Their sha256s are stamped into committed
piece sets' code state; changing either would invalidate sets that contain none of this. The shared
helpers below are duplicated from `blender_species.py` for the reason its own docstring gives —
Blender does not reliably put a `--python` script's directory on `sys.path`.
"""
import hashlib
import json
import math
import os
import sys

import bpy       # noqa: E402  (only importable under Blender)
import numpy as np

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
SOURCE_SET = os.path.join(GRASS, arg("--inherit-from", "pieces-m00-clump"))
ISLAND_PATH = arg("--island", os.path.join(
    REPO, "docs", "research", "chapter2-healthy-island-2026-08-16", "island.json"))
OUT = os.path.join(HERE, arg("--out", "pieces-greenery"))
SAMPLES = int(arg("--samples", "48"))
SEED = int(arg("--seed", "20260817"))

#: EVERY shared constant is read back OUT of the set being compared against rather than restated. A
#: second copy of the band triples or the canvas size is a second thing to keep in step, and the
#: whole point of this pass is that its numbers are comparable to that set's.
SRC_META = json.load(open(os.path.join(SOURCE_SET, "render-meta.json")))
BAND = {k: tuple(v) for k, v in SRC_META["bandTriples"].items()}
TOKEN_FAMILIES = SRC_META["tokenFamilies"]
PIECE_W = float(SRC_META["pieceCanvasWorld"])          # 28.0 ground units
RES = int(SRC_META["pieceCanvasPx"])                   # 84 px
SS = int(SRC_META["supersample"])                      # 3
LIGHT_DIR = tuple(SRC_META["lightDir"])

#: THE CONVERSION THE WHOLE PASS TURNS ON. Named rather than inlined because every dimension below is
#: chosen from it, and because getting it wrong is how a technique gets blamed for the pipeline.
PX_PER_UNIT_SS = RES / PIECE_W                         # 3.0 supersampled px per ground unit
UNITS_PER_DELIVERED_PX = PIECE_W / (RES / SS)          # 1.0 ground unit per delivered px

ISLAND = json.load(open(ISLAND_PATH))
ELEV_DEG = float(ISLAND["camera"]["elevationDeg"])
EL = math.radians(ELEV_DEG)
KEY_ROT = (math.radians(48), 0.0, math.radians(34))

LIT, DARK = 1.00, 0.82
#: Identical to every tuft in the compared set, so a candidate cannot look different merely by
#: claiming a different role map.
TUFT_ROLES = {"K0": ("bladeFront", LIT), "K1": ("bladeFront", DARK), "K2": ("bladeBack", LIT)}


# ---------------------------------------------------------------- shared helpers (duplicated)
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def det(*parts):
    h = hashlib.sha256((":".join(str(p) for p in parts) + f":{SEED}").encode()).digest()
    return int.from_bytes(h[:4], "big") / 0x100000000


def ramp_mat(name, lit_key, dark_key, split=0.52):
    """Two band triples chosen by N-dot-L through a CONSTANT ramp. No AO term, so a piece rendered in
    isolation carries no shading that depends on neighbours it will not have."""
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
    el.elements[0].position = 0.0
    el.elements[0].color = lin(tuple(c / 255 for c in BAND[dark_key]))
    e = el.elements.new(split)
    e.color = lin(tuple(c / 255 for c in BAND[lit_key]))
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def flat_mat(name, key):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin(tuple(c / 255 for c in BAND[key]))
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def invisible_mat(name="invisible"):
    """A pure Transparent BSDF. `ParticleSettings.use_render_emitter` DOES NOT EXIST in Blender 5.2,
    so an emitter cannot be hidden through the particle settings the way every tutorial written
    against 2.7x says. Giving the emitter surface a transparent material is the equivalent that
    survives the version change: under `film_transparent` it contributes no alpha, so it cannot
    enter the delivered footprint — which is asserted rather than assumed (`verify.py` checks the
    emitter disc's own silhouette is absent from the hair pieces)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tr.outputs["BSDF"], out.inputs["Surface"])
    return m


def mesh_object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


def disc_mesh(name, mat, radius, z=0.0, seg=24, dome=0.0):
    """The emitter. A shallow dome rather than a flat disc when `dome` > 0, because hair grows along
    the surface normal and a flat disc grows every strand straight up in parallel — which is not a
    tuft, it is a comb, and it would test the wrong thing."""
    verts = [(0.0, 0.0, z + dome)]
    faces = []
    for s in range(seg):
        a = (s / seg) * math.tau
        verts.append((radius * math.cos(a), radius * math.sin(a), z))
    for s in range(seg):
        faces.append((0, 1 + s, 1 + (s + 1) % seg))
    return mesh_object(name, verts, faces, mat)


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    w = bpy.data.worlds.new("sky")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = lin((0.60, 0.68, 0.74))
    bg.inputs["Strength"].default_value = 0.62
    bpy.context.scene.world = w
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = PIECE_W
    cam = bpy.data.objects.new("cam", cam_data)
    cam.location = (0.0, -400.0 * math.cos(EL), 400.0 * math.sin(EL))
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
    sc.cycles.device = "CPU"                     # ADR-0280 D2a: CPU only
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.seed = SEED
    #: OFF for DETERMINISM, not quality: adaptive sampling makes the per-pixel sample count a
    #: function of tile scheduling and therefore of system load.
    sc.cycles.use_adaptive_sampling = False
    #: Hair is rendered as curves, so the curve shape is part of this pass's code state and is
    #: recorded. `ribbon` is the cheaper flat shape; `thick` gives a round strand. Fixed rather
    #: than swept, because the sweep that matters here is THICKNESS in ground units.
    if hasattr(sc, "cycles_curves"):
        sc.cycles_curves.shape = "THICK"
        sc.cycles_curves.subdivisions = 2
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- candidate 1: HAIR PARTICLES
#: WHAT WAS ACTUALLY SET ON THE PARTICLE SYSTEM, recorded per piece. Blender's particle API has moved
#: twice in the versions the tutorials cover (`use_render_emitter` and `child_nbr` are both GONE in
#: 5.2), so a claim that a lever was applied is worth nothing unless the applied value is read back
#: out of the datablock. Every hair piece's meta carries this read-back.
HAIR_APPLIED = {}


def build_hair(name, *, count, thickness_units, length_units, clump=0.0, children=0,
               roughness=0.0, brownian=0.0, radius_top=0.0, dome=1.1, emitter_r=3.0):
    """Blender's own hair particle system — the technique the owner asked about.

    THICKNESS IS THE WHOLE EXPERIMENT and it is expressed in GROUND UNITS, which is one delivered
    pixel each. Blender's `radius_scale` is a world-space radius, so a strand of `t` units ACROSS
    needs `radius_scale = t / 2`. The default 0.01 would be 1/150th of a delivered pixel.
    """
    crown = ramp_mat(f"{name}-crown", "K0", "K1")
    em = disc_mesh(f"{name}-emit", invisible_mat(f"{name}-inv"), emitter_r, dome=dome)
    em.data.materials.append(crown)          # slot 1 — the hair's material

    em.modifiers.new(f"{name}-ps", type="PARTICLE_SYSTEM")
    psys = em.particle_systems[-1]
    psys.seed = SEED % 100000
    s = psys.settings
    s.type = "HAIR"
    s.count = count
    s.hair_length = length_units
    s.hair_step = 5
    s.render_type = "PATH"
    s.use_advanced_hair = True
    #: 1-BASED slot index (slot 0 is the transparent emitter surface).
    s.material = 2
    s.root_radius = 1.0
    s.tip_radius = radius_top
    s.radius_scale = thickness_units / 2.0
    s.use_close_tip = True
    if children > 0:
        s.child_type = "INTERPOLATED"
        s.rendered_child_count = children
        s.child_length = 1.0
        s.clump_factor = clump
        s.roughness_1 = roughness
        s.roughness_1_size = 1.0
        s.roughness_endpoint = roughness
    s.brownian_factor = brownian

    #: READ BACK OUT of the datablock — never the values passed in.
    HAIR_APPLIED[name] = {
        k: (round(float(getattr(s, k)), 6) if isinstance(getattr(s, k), float) else getattr(s, k))
        for k in ("type", "count", "hair_length", "hair_step", "render_type", "child_type",
                  "rendered_child_count", "clump_factor", "roughness_1", "roughness_endpoint",
                  "root_radius", "tip_radius", "radius_scale", "brownian_factor",
                  "use_advanced_hair", "material")
        if hasattr(s, k)
    }
    HAIR_APPLIED[name]["strandWidthGroundUnits"] = round(s.radius_scale * 2.0, 4)
    HAIR_APPLIED[name]["strandWidthDeliveredPx"] = round(
        s.radius_scale * 2.0 / UNITS_PER_DELIVERED_PX, 4)
    HAIR_APPLIED[name]["strandWidthSupersampledPx"] = round(
        s.radius_scale * 2.0 * PX_PER_UNIT_SS, 4)
    HAIR_APPLIED[name]["seed"] = psys.seed
    HAIR_APPLIED[name]["emitterMaterialSlot0"] = "transparent BSDF (use_render_emitter is GONE in 5.2)"
    return em


# ---------------------------------------------------------------- candidate 2: GEOMETRY NODES
GEONODE_APPLIED = {}


def build_geonodes(name, *, count, blade_w_units, blade_h_units, mound_r=3.0, dome=1.1):
    """Geometry Nodes distributing small blade instances over the same dome.

    Distinct from our own Python scatter in exactly one way that matters: density and orientation
    come from a surface field rather than from a hash, so the marks land on the surface normal. The
    MARKS ARE STILL DISCRETE MESHES, so the silhouette finding predicts the outcome — a disagreement
    would be the informative result.
    """
    crown = ramp_mat(f"{name}-crown", "K0", "K1")
    blade = mesh_object(
        f"{name}-blade",
        [(-blade_w_units / 2, 0, 0), (blade_w_units / 2, 0, 0),
         (blade_w_units / 4, 0, blade_h_units), (-blade_w_units / 4, 0, blade_h_units)],
        [(0, 1, 2, 3)], crown)
    blade.hide_render = True                 # instanced, never drawn on its own

    surf = disc_mesh(f"{name}-surf", invisible_mat(f"{name}-inv"), mound_r, dome=dome)
    ng = bpy.data.node_groups.new(f"{name}-scatter", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gin = ng.nodes.new("NodeGroupInput")
    gout = ng.nodes.new("NodeGroupOutput")
    dist = ng.nodes.new("GeometryNodeDistributePointsOnFaces")
    dist.distribute_method = "RANDOM"
    dist.inputs["Density"].default_value = count / (math.pi * mound_r ** 2)
    dist.inputs["Seed"].default_value = SEED % 10000
    obj_info = ng.nodes.new("GeometryNodeObjectInfo")
    obj_info.inputs["Object"].default_value = blade
    inst = ng.nodes.new("GeometryNodeInstanceOnPoints")
    real = ng.nodes.new("GeometryNodeRealizeInstances")
    ng.links.new(gin.outputs[0], dist.inputs["Mesh"])
    ng.links.new(dist.outputs["Points"], inst.inputs["Points"])
    ng.links.new(obj_info.outputs["Geometry"], inst.inputs["Instance"])
    #: Align to the surface normal, which is the whole reason to use a field rather than a hash.
    if "Rotation" in inst.inputs and "Rotation" in dist.outputs:
        ng.links.new(dist.outputs["Rotation"], inst.inputs["Rotation"])
    ng.links.new(inst.outputs["Instances"], real.inputs["Geometry"])
    ng.links.new(real.outputs["Geometry"], gout.inputs[0])
    md = surf.modifiers.new(f"{name}-gn", type="NODES")
    md.node_group = ng

    GEONODE_APPLIED[name] = {
        "density": round(dist.inputs["Density"].default_value, 5),
        "requestedCount": count,
        "bladeWidthGroundUnits": blade_w_units,
        "bladeHeightGroundUnits": blade_h_units,
        "bladeWidthDeliveredPx": round(blade_w_units / UNITS_PER_DELIVERED_PX, 3),
        "alignedToSurfaceNormal": "Rotation" in inst.inputs and "Rotation" in dist.outputs,
        "seed": SEED % 10000,
    }
    return surf


# ---------------------------------------------------------------- the CONTROL: an alpha card
CARD_APPLIED = {}


def authored_silhouette(w=7, h=4):
    """The CEILING. A silhouette authored AT the delivered resolution, so the downsample cannot take
    anything: each authored pixel is upscaled by exactly SS and lands on exactly one delivered pixel.

    Deliberately NOT a prettier shape than the shipped species — it is the same dome-ish outline the
    `dome` species already delivers. The point of the control is to isolate the PIPELINE LOSS, so it
    must not also change the art, or the comparison measures two things at once.
    """
    a = np.zeros((h, w), dtype=bool)
    a[0, 2:5] = True
    a[1, 1:6] = True
    a[2, 0:7] = True
    a[3, 1:6] = True
    return a


def build_card(name):
    """A camera-facing quad carrying that silhouette as an image alpha.

    THIS IS A CONTROL AND IT IS BARELY A BLENDER TECHNIQUE — the geometry is one quad and every
    decision lives in a hand-authored bitmap. That is exactly why it belongs in the set: it bounds
    what any technique in this pipeline can deliver, and if the 3D candidates fall far short of it
    the finding is about the pipeline rather than about how well each candidate was tuned.
    """
    sil = authored_silhouette()
    h, w = sil.shape
    up = np.repeat(np.repeat(sil, SS, axis=0), SS, axis=1)
    rgba = np.zeros((up.shape[0], up.shape[1], 4), dtype=np.float32)
    #: The two key colours the ramp material would have produced: lit crown over a darker lower band.
    k0 = np.array(lin(tuple(c / 255 for c in BAND["K0"])), dtype=np.float32)
    k1 = np.array(lin(tuple(c / 255 for c in BAND["K1"])), dtype=np.float32)
    top = up.copy()
    top[up.shape[0] // 2:, :] = False
    rgba[..., :3] = np.where(top[..., None], k0[:3], k1[:3])
    rgba[..., 3] = up.astype(np.float32)

    img = bpy.data.images.new(f"{name}-tex", width=up.shape[1], height=up.shape[0], alpha=True)
    #: Blender's pixel buffer is BOTTOM-UP; the authored array is top-down.
    img.pixels = rgba[::-1].reshape(-1).tolist()

    m = bpy.data.materials.new(f"{name}-mat")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    #: CLOSEST, never Linear — a filtered lookup would blur the authored pixel edges back into the
    #: soft mass this control exists to avoid.
    tex.interpolation = "Closest"
    tex.extension = "CLIP"
    em = nt.nodes.new("ShaderNodeEmission")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(tex.outputs["Alpha"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    #: Sized so the authored pixel grid maps 1:1 onto the delivered pixel grid, and BILLBOARDED to
    #: the camera so the mapping is not foreshortened away.
    cw = w * UNITS_PER_DELIVERED_PX
    ch = h * UNITS_PER_DELIVERED_PX
    quad = mesh_object(name, [(-cw / 2, 0, 0), (cw / 2, 0, 0), (cw / 2, 0, ch), (-cw / 2, 0, ch)],
                       [(0, 1, 2, 3)], m)
    quad.rotation_euler = (EL - math.pi / 2, 0.0, 0.0)
    quad.location = (0.0, 0.0, 0.0)
    me = quad.data
    me.uv_layers.new(name="UVMap")
    for i, uv in enumerate([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]):
        me.uv_layers[0].data[i].uv = uv

    CARD_APPLIED[name] = {
        "authoredDeliveredPx": int(sil.sum()),
        "authoredBox": [w, h],
        "textureSizePx": [int(up.shape[1]), int(up.shape[0])],
        "upscale": SS,
        "interpolation": tex.interpolation,
        "billboardedToCamera": True,
        "rule": ("authored AT delivered resolution and upscaled by exactly the supersample factor, "
                 "so the majority downsample is an identity on it by construction"),
    }
    return quad


# ---------------------------------------------------------------- the candidate set
#: A THICKNESS SWEEP, not a single hair attempt. The prediction under test is that fine strands
#: collapse; a single fine render would confirm it without bounding it, so the sweep spans a strand
#: that is a third of a delivered pixel up to one that is a whole delivered pixel and beyond.
CANDIDATES = [
    #: THE CONTROL THAT MAKES EVERY HAIR NUMBER READABLE. `use_render_emitter` is gone in 5.2, so the
    #: emitter is hidden by giving its surface a Transparent BSDF — an approach that would fail
    #: SILENTLY and generously, adding a ~6x2 delivered-px disc to every hair piece and inflating
    #: exactly the statistic this pass reports. This piece is that disc with no particle system on
    #: it: `verify.py` REFUSES the whole set unless it delivers ZERO.
    ("control-emitter-only", lambda: disc_mesh(
        "control-emitter-only", invisible_mat("control-inv"), 3.0, dome=1.1)),
    # -- hair, swept on the one axis that decides whether a strand survives at all
    ("hair-tutorial", lambda: build_hair(
        "hair-tutorial", count=140, thickness_units=0.02, length_units=4.5)),
    ("hair-fine", lambda: build_hair(
        "hair-fine", count=140, thickness_units=0.33, length_units=4.5)),
    ("hair-1px", lambda: build_hair(
        "hair-1px", count=90, thickness_units=1.0, length_units=4.5)),
    ("hair-2px", lambda: build_hair(
        "hair-2px", count=60, thickness_units=2.0, length_units=4.5)),
    # -- hair with the levers a grass tutorial actually reaches for
    ("hair-clumped", lambda: build_hair(
        "hair-clumped", count=24, thickness_units=1.0, length_units=5.0,
        clump=0.55, children=180, roughness=0.18, brownian=0.02)),
    #: FOOTPRINT-MATCHED, and it closes a confound that would otherwise have let this pass claim hair
    #: "delivers more". The hair candidates above stand on a 3.0-unit emitter under 4.5 units of hair
    #: — a ~6x5.5-unit object against the species dome's ~6x2.5. A bigger object delivering more
    #: pixels is arithmetic, not a technique win, so this one is sized to the dome's own delivered box.
    ("hair-domesized", lambda: build_hair(
        "hair-domesized", count=90, thickness_units=1.0, length_units=2.0,
        emitter_r=2.2, dome=0.7)),
    #: THE STRUCTURAL QUESTION, asked at the most favourable setting available: can a strand GAP ever
    #: survive the majority vote? Twelve thick strands with deliberate space between them. If this
    #: delivers a solid blob too, then hair cannot express blades at 28 px at ANY count — which is a
    #: statement about the pipeline and closes the technique class properly rather than by prediction.
    ("hair-sparse", lambda: build_hair(
        "hair-sparse", count=12, thickness_units=1.5, length_units=4.5, dome=1.4)),
    # -- geometry nodes, instancing a blade small enough to be a blade
    ("geonodes-fine", lambda: build_geonodes(
        "geonodes-fine", count=90, blade_w_units=0.4, blade_h_units=4.5)),
    ("geonodes-1px", lambda: build_geonodes(
        "geonodes-1px", count=55, blade_w_units=1.0, blade_h_units=4.5)),
    # -- the control / ceiling
    ("card-authored", lambda: build_card("card-authored")),
]


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


def _own_code_state():
    path = os.path.abspath(__file__)
    return {"generator": os.path.basename(path), "sha256": _sha256_file(path)}


os.makedirs(OUT, exist_ok=True)
rendered = []
for name, build in CANDIDATES:
    new_scene()
    build()
    render(os.path.join(OUT, f"{name}.png"))
    rendered.append(name)
    print(f"rendered {name}", flush=True)

meta = {
    "generator": "blender_greenery.py",
    "purpose": ("STAGE 1 of the greenery technique survey — what each Blender greenery technique "
                "DELIVERS after the palette snap and 3x3 majority downsample. No island, no "
                "appearance verdict (ADR-0070 stage 2)."),
    "pieceCanvasWorld": PIECE_W,
    "pieceCanvasPx": RES,
    "supersample": SS,
    "groundUnitsPerDeliveredPx": UNITS_PER_DELIVERED_PX,
    "supersampledPxPerGroundUnit": PX_PER_UNIT_SS,
    "deliveredCanvasPx": RES // SS,
    "camera": {"elevationDeg": ELEV_DEG,
               "rule": "orthographic; ortho_scale == the piece canvas in ground units, and the "
                       "piece's GROUND CONTACT POINT sits at the canvas centre",
               "source": os.path.relpath(ISLAND_PATH, REPO).replace("\\", "/")},
    "code_state": _own_code_state(),
    "argv": list(ARGV),
    "blender": bpy.app.version_string,
    "engine": "CYCLES/CPU",
    "curveShape": "THICK",
    "seed": SEED,
    "samples": SAMPLES,
    "lightDir": list(LIGHT_DIR),
    "bandTriples": {k: list(v) for k, v in BAND.items()},
    "tokenFamilies": TOKEN_FAMILIES,
    "pieceNames": rendered,
    "pieceRoles": {n: {k: list(v) for k, v in TUFT_ROLES.items()} for n in rendered},
    "hairApplied": HAIR_APPLIED,
    "geonodeApplied": GEONODE_APPLIED,
    "cardApplied": CARD_APPLIED,
    "comparedAgainst": os.path.relpath(SOURCE_SET, REPO).replace("\\", "/"),
    "notASpeciesSet": ("These pieces are MEASUREMENT SUBJECTS, not a mountable piece set. They are "
                       "not named for any `tuft-*` slot and no compositor mounts them; naming them "
                       "for slots would invite exactly the silent mismount `use_pieces` refuses."),
    "vocabularySource": SRC_META["vocabularySource"],
}
with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE greenery candidates ->", OUT, flush=True)
