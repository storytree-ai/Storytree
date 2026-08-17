#!/usr/bin/env python3
"""FOUR SPECIES WITH GENUINELY DIFFERENT OUTLINES — silhouette variety instead of quantity.

    blender --background --python blender_species.py -- --island <island.json> --out pieces-species

The owner, 2026-08-17: *"This many shubs looks rather ugly, feels like there must be a way to do
something nicer in blender that has high frequency without looking off."* One of the two answers on
the shortlist was to spend the frequency on VARIETY rather than on COUNT: fewer marks, each of which
is a different object, instead of many marks that are all the same object.

DESIGNED TO THE DELIVERED BOX, NOT TO THE MODELLING VIEWPORT. This is the constraint that decides
every number below, and it was measured first rather than assumed. The committed piece sets deliver,
after the majority downsample:

    pieces-m00-blade   tuft   2-3 px, bbox 2x1     <- the WITHDRAWN long grass; the arc's "3 px median"
    pieces-m00-clump   tuft   7-10 px, bbox 4x3
    pieces-m00-*       shrub  11-12 px, bbox 6x3

So the silhouette budget is a box about SIX BY THREE delivered pixels. Four outlines are authored to
be distinguishable inside that box and nowhere else — the discriminating features are chosen from the
three that survive a 6x3 quantisation, and no others:

    tuft-3a   DOME       wide and low, one solid mass      -- reads as area
    tuft-2    SPIRE      narrow and tall                   -- reads as an aspect ratio
    tuft-3b   SPREADER   very wide and very low            -- reads as the opposite aspect ratio
    tuft-4    PAIR       two masses with ground between    -- reads as DISCONNECTION

DISCONNECTION IS THE STRONGEST CUE AVAILABLE AT THIS SCALE and that is why one species is built
around it. Aspect ratio has about two usable steps in a 6x3 box; a gap is a topological difference
and survives any downsample that keeps the piece at all.

WHY THE NAMES ARE THE OLD NAMES. The scatterer chooses a piece by name (`scatter.py:177-203`), and
the increment's fence is that no semantic vocabulary moves (ADR-0226). Reusing the four `tuft-*`
slots means the count rules, the token family, the status colouring and the placement machinery are
all untouched — the ONLY thing that changes is which mesh those four names resolve to. A species
carries NO meaning: ADR-0226 D2 gives the SIGNAL to the vegetation COUNT, and the vocabulary has no
member for species, so four outlines assert exactly what two did. Anything else would be inventing a
channel under cover of an art change.

THE OTHER SEVEN PIECES ARE INHERITED, NOT RE-RENDERED. `shrub-a/b`, the two wilts and the three
flowers are copied byte-for-byte from `pieces-m00-clump`, with each source file's sha256 recorded in
this set's own `render-meta.json`. Re-deriving them would mean either re-running someone else's
generator (which moves committed provenance across sibling passes — the trap `blender_tree.py`
already cost this arc) or writing a second copy of geometry that is not under test here.

`blender_grass.py` IS NOT EDITED. Its sha256 is stamped into fourteen committed piece sets' code
state; changing it would invalidate all of them to add a species none of them contain. The shared
Blender helpers below are duplicated from it for the reason its own docstring gives: Blender does not
reliably put a `--python` script's directory on `sys.path`.
"""
import hashlib
import json
import math
import os
import shutil
import sys

import bpy       # noqa: E402  (only importable under Blender)

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
SOURCE_SET = os.path.join(GRASS, arg("--inherit-from", "pieces-m00-clump"))

ISLAND_PATH = arg("--island", os.path.join(GRASS, "island.json"))
ISLAND = json.load(open(ISLAND_PATH))
OUT = os.path.join(HERE, arg("--out", "pieces-species"))
SAMPLES = int(arg("--samples", "48"))
SEED = int(arg("--seed", "20260817"))
SS = int(arg("--ss", "3"))

#: EVERY shared constant is READ BACK OUT of the set being inherited from rather than restated here.
#: A second copy of the band triples or the token families is a second thing to keep in step, and the
#: composite mixes pieces from both sets in one draw list — they cannot be allowed to disagree.
SRC_META = json.load(open(os.path.join(SOURCE_SET, "render-meta.json")))
BAND = {k: tuple(v) for k, v in SRC_META["bandTriples"].items()}
TOKEN_FAMILIES = SRC_META["tokenFamilies"]
PIECE_W = float(SRC_META["pieceCanvasWorld"])
RES = int(SRC_META["pieceCanvasPx"])
LIGHT_DIR = tuple(SRC_META["lightDir"])

ELEV_DEG = float(ISLAND["camera"]["elevationDeg"])
EL = math.radians(ELEV_DEG)
KEY_ROT = (math.radians(48), 0.0, math.radians(34))

LIT, DARK = 1.00, 0.82
TUFT_ROLES = {"K0": ("bladeFront", LIT), "K1": ("bladeFront", DARK), "K2": ("bladeBack", LIT)}

#: The seven names this set inherits rather than authors.
INHERITED = ["shrub-a", "shrub-b", "wilt-twig", "wilt-stem",
             "flower-proven", "flower-pending", "flower-failing"]


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


def mesh_object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


def lobe(name, mat, cx, cy, cz, rx, ry, rz):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, location=(cx, cy, cz))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (rx, ry, rz)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tube(name, mat, pts, radius, sides=6):
    """A stem. The radius floor is 0.34 ground units and that is a MEASUREMENT, not a taste: at 0.20
    a stem was six opaque supersampled pixels, i.e. under one delivered pixel, and shipped as a
    stray speck (`blender_grass.py:649-660`)."""
    verts, faces = [], []
    for i, (x, y, z) in enumerate(pts):
        r = radius * (1.0 - 0.45 * (i / max(1, len(pts) - 1)))
        for s in range(sides):
            a = (s / sides) * math.tau
            verts.append((x + r * math.cos(a), y + r * math.sin(a), z))
        if i > 0:
            b0, b1 = (i - 1) * sides, i * sides
            for s in range(sides):
                n = (s + 1) % sides
                faces.append((b0 + s, b0 + n, b1 + n, b1 + s))
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
    #: OFF, and it is a DETERMINISM fix rather than a quality one — adaptive sampling makes the
    #: per-pixel sample count a function of tile scheduling and therefore of SYSTEM LOAD, so a
    #: committed piece set re-renders differently on a busy box (`blender_grass.py:340-355`).
    sc.cycles.use_adaptive_sampling = False
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- the four species
#: Every dimension is in GROUND units and every one is chosen from the delivered box. The island
#: delivers 258 px across ~246 ground units, so a ground unit is ~1.05 delivered px WIDE; a VERTICAL
#: world unit foreshortens by cos(50 deg) = 0.64, so height in delivered px is ~0.64x its world value.
#: Those two factors are why the spire is 7 units tall (-> ~4.5 px) and the spreader 9 wide (-> ~9 px).
SPECIES_SCALE = 1.0


def build_dome(variant):
    """DOME — the round shrub. Wide, low, ONE connected mass. Reads as AREA.

    Deliberately the closest species to the existing `shrub-a`, because the baseline has to be in the
    set: if three novel outlines beat one familiar one, the comparison should contain the familiar
    one rather than assert it from another picture.
    """
    crown = ramp_mat("crown", "K0", "K1")
    under = flat_mat("under", "K2")
    s = SPECIES_SCALE * (1.0 + det("dome", variant, "s") * 0.18)
    lobe("u0", under, 0.0, 0.35 * s, 0.75 * s, 3.0 * s, 1.9 * s, 0.85 * s)
    lobe("c0", crown, -0.9 * s, -0.25 * s, 1.45 * s, 1.85 * s, 1.25 * s, 1.15 * s)
    lobe("c1", crown, 1.05 * s, -0.10 * s, 1.30 * s, 1.55 * s, 1.10 * s, 1.00 * s)


def build_spire(variant):
    """SPIRE — the upright sprig. NARROW and TALL. Reads as an aspect ratio.

    7 world units tall foreshortens to ~4.5 delivered px against a ~2.5-unit (~2.6 px) width, so the
    delivered box is about 3x5 — taller than wide, which no other species in the set is. The stem is
    a tube at the measured 0.34-unit floor; below it a stem is under one delivered pixel.
    """
    crown = ramp_mat("crown", "K0", "K1")
    stem = flat_mat("stem", "K2")
    s = SPECIES_SCALE
    h = 7.0 * s * (0.92 + det("spire", variant, "h") * 0.16)
    tube("st", stem, [(0.0, 0.0, 0.0), (0.15 * s, 0.0, h * 0.55), (0.30 * s, 0.0, h * 0.92)], 0.42 * s)
    # three small lobes stacked UP the stem rather than spread across it — the mass has to stay
    # inside a ~2.5-unit width or the silhouette collapses back onto the dome's
    for i, (fz, r) in enumerate(((0.52, 1.05), (0.74, 0.95), (0.94, 0.70))):
        j = det("spire", variant, "l", i)
        lobe(f"c{i}", crown, 0.15 * s + (j - 0.5) * 0.45 * s, 0.0, h * fz,
             r * s * (0.9 + j * 0.2), r * s * 0.80, r * s * 1.15)


def build_spreader(variant):
    """SPREADER — the low mat. VERY wide, VERY low. The opposite aspect ratio to the spire.

    9 units across and 1.5 tall: ~9 delivered px wide by ~2-3 tall. The depth is held to 4 units
    rather than made circular, because ground depth foreshortens by sin(50 deg) = 0.77 and a circular
    mat would deliver 9x6 — an ellipse, not a mat.
    """
    crown = ramp_mat("crown", "K0", "K1")
    under = flat_mat("under", "K2")
    s = SPECIES_SCALE
    lobe("u0", under, 0.0, 0.30 * s, 0.35 * s, 4.4 * s, 1.7 * s, 0.42 * s)
    for i, ox in enumerate((-2.6, 0.1, 2.5)):
        j = det("spread", variant, "l", i)
        lobe(f"c{i}", crown, ox * s, -0.25 * s, 0.62 * s + j * 0.18 * s,
             1.75 * s, 1.05 * s, 0.52 * s * (0.85 + j * 0.3))


def build_pair(variant):
    """PAIR — two masses with GROUND BETWEEN THEM. Reads as DISCONNECTION.

    The one cue that is topological rather than metric, and therefore the one that survives the
    majority downsample intact. The gap is 3.4 ground units — measured to leave at least one whole
    delivered pixel of ground between the two masses after the 3x3 downsample, which is the point:
    a gap that closes in the snap is a dome with extra polygons.
    """
    crown = ramp_mat("crown", "K0", "K1")
    under = flat_mat("under", "K2")
    s = SPECIES_SCALE
    #: 3.2 units between the two centres against a ~1.1-unit mass radius, so the masses' edges are
    #: ~1 ground unit = ~1 delivered px apart. MEASURED rather than eyeballed: a first pass at
    #: half these heights delivered `###.##`, a 6x1 dashed line — the gap survived but the species
    #: did not, because two masses one pixel tall read as debris rather than as a plant.
    gap = 3.2 * s
    for i, (ox, rs) in enumerate(((-gap / 2, 1.0), (gap / 2, 0.82))):
        j = det("pair", variant, "b", i)
        lobe(f"u{i}", under, ox, 0.30 * s, 0.70 * s,
             1.15 * s * rs, 0.90 * s * rs, 0.80 * s * rs)
        lobe(f"c{i}", crown, ox + (j - 0.5) * 0.25 * s, -0.15 * s, 2.30 * s * rs,
             1.05 * s * rs, 0.85 * s * rs, 1.55 * s * rs * (0.9 + j * 0.2))


#: The four species, in the four `tuft-*` slots the scatterer already knows how to choose.
SPECIES = [
    ("tuft-3a", "dome", lambda: build_dome("a")),
    ("tuft-2", "spire", lambda: build_spire("a")),
    ("tuft-3b", "spreader", lambda: build_spreader("a")),
    ("tuft-4", "pair", lambda: build_pair("a")),
]


def _own_code_state():
    path = os.path.abspath(__file__)
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return {"generator": os.path.basename(path), "sha256": h.hexdigest()}


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return h.hexdigest()


os.makedirs(OUT, exist_ok=True)
rendered = []
for name, species, build in SPECIES:
    new_scene()
    build()
    render(os.path.join(OUT, f"{name}.png"))
    rendered.append(name)
    print(f"{name} rendered as species {species!r}", flush=True)

inherited_hashes = {}
for name in INHERITED:
    src = os.path.join(SOURCE_SET, f"{name}.png")
    shutil.copyfile(src, os.path.join(OUT, f"{name}.png"))
    inherited_hashes[name] = _sha256_file(src)
    print(f"{name} inherited from {os.path.basename(SOURCE_SET)}", flush=True)

meta = {
    "generator": "blender_species.py",
    #: DECLARED SO `use_pieces` CAN REFUSE A MISMOUNT. This is not a grass fork, so the two grass
    #: levers carry the inherited set's values and the geometry string names what this set actually
    #: is — a caller mounting it as "blade" or "clump" is refused before a pixel.
    "grassNormalMix": SRC_META["grassNormalMix"],
    "grassGeometry": "species",
    "grassNormalRule": "off — each species carries its own normals; no shared dome proxy is applied",
    "speciesMap": {name: species for name, species, _b in SPECIES},
    "speciesRule": (
        "A SPECIES CARRIES NO MEANING. ADR-0226 D2 gives the signal to the vegetation COUNT and the "
        "vocabulary has no member for species, so four outlines assert exactly what two did. The "
        "four sit in the existing `tuft-*` slots so the count rules, the token family and the "
        "placement machinery are untouched."),
    "inheritedFrom": os.path.relpath(SOURCE_SET, REPO).replace("\\", "/"),
    "inheritedSha256": inherited_hashes,
    "code_state": _own_code_state(),
    "argv": list(ARGV),
    "blender": bpy.app.version_string,
    "engine": "CYCLES/CPU",
    "seed": SEED,
    "samples": SAMPLES,
    "supersample": SS,
    "pieceCanvasWorld": PIECE_W,
    "pieceCanvasPx": RES,
    "camera": {"elevationDeg": ELEV_DEG,
               "rule": "orthographic; ortho_scale == the piece canvas in ground px, and the piece's "
                       "GROUND CONTACT POINT sits at the canvas centre"},
    "lightDir": list(LIGHT_DIR),
    "lightRuleSource": "inherited verbatim from " + os.path.basename(SOURCE_SET)
                       + " — land, object and ground cover share one key",
    "bandTriples": {k: list(v) for k, v in BAND.items()},
    "pieceNames": rendered + INHERITED,
    "pieceRoles": dict(
        {name: {k: list(v) for k, v in TUFT_ROLES.items()} for name, _s, _b in SPECIES},
        **{name: SRC_META["pieceRoles"][name] for name in INHERITED}),
    "tokenFamilies": TOKEN_FAMILIES,
    "headBillboard": SRC_META["headBillboard"],
    "vocabularySource": SRC_META["vocabularySource"],
}
with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE species pieces ->", OUT, flush=True)
