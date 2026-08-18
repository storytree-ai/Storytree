#!/usr/bin/env python3
"""THE SMALL-PLANT SET — the two shrub slots authored, the four proven species inherited.

    blender --background --python blender_shrubs.py -- --out pieces-shrubs

The owner, 2026-08-17: *"grass still looks ugly, i think we dont do grass for test complexity, maybe
we just stick to green land. I think Instead we do shubs and other small plants instead. the
pixelated triangles for the long grass looks rather ugly and cheap."* Clarified in the same
conversation: shrub COUNT inherits grass's test-count role, so ADR-0226 D2 is unchanged and only the
SPECIES moves. A re-skin, not a re-decision.

WHAT THIS GENERATOR AUTHORS, AND WHAT IT DELIBERATELY DOES NOT.

`blender_species.py` (`chapter2-high-frequency-options-2026-08-17`) already authored four species to
the delivered box — dome, spire, spreader and a pair built around a topological gap — and they are
measured, palette-free and awaiting the owner's look. THEY ARE NOT RE-AUTHORED HERE. They are
inherited BYTE-FOR-BYTE with each source file's sha256 recorded below, which is the same move
`blender_species.py` itself made when it inherited seven pieces from `pieces-m00-clump`.

`blender_species.py` IS NOT EDITED, and that is a rule rather than a convenience. Its sha256 is
stamped into `pieces-species/render-meta.json` and into five committed provenance sidecars whose
pictures are in front of the owner right now; editing it would invalidate all of them to add species
none of them contain. This is the same reason `blender_species.py` gives for not editing
`blender_grass.py`, applied one generation later. A NEW generator for a NEW piece set is how this
arc adds geometry.

WHAT THE SET WAS MISSING, measured off the committed pieces rather than asserted. The four species
plus the two shrub slots make six delivered plants, but three of those six were the same silhouette
at three sizes: `shrub-a` 12 px in 6x3 at aspect 2.00, `shrub-b` 11 px in 5x3 at aspect 1.67, and the
dome 18 px in 6x4 at aspect 1.50 — three solid convex blobs. Both shrub slots are also LEGACY
geometry: they are the old grass-clump set's shrubs, carried through unchanged, which is exactly the
component the owner's redirect is about.

So this generator authors the two shrub slots, choosing cues the set does not already hold:

    shrub-a   CUSHION   a small, tight, low mound        -- AREA, at the small end of the ladder
    shrub-b   FROND     a fan of sprays with a notch     -- CONCAVITY, a third cue class

and renders one CANDIDATE that is measured and shown but NOT mounted:

    (alt)     TIER      a crown raised clear of the ground on a stem  -- VERTICAL separation

THE THIRD CUE CLASS IS A QUESTION, NOT A CLAIM. The arc has established that only three properties
survive the 3x3 majority downsample at this scale: area, aspect ratio, and topological
disconnection. Concavity has never been tried. The greenery survey's `survival%` instrument says
what to expect — a vote that needs only 5 of 9 CLOSES gaps, so a notch narrower than about two
delivered pixels will fill — and the frond is therefore authored with a notch depth of ~3.2 world
units (~2 delivered px), the same measured discipline the pair's 3.2-unit gap was given. Whether it
survives is measured in `compose_shrubs.py` and reported either way; an honest "concavity does not
survive" is the answer this question is allowed to have.

A SPECIES CARRIES NO MEANING. ADR-0226 D2 gives the signal to the vegetation COUNT, and the
vocabulary has no member for species, so six outlines assert exactly what two did. The slots keep
their names because the scatterer chooses a piece by name and the count rules, the token families,
the status colouring and the placement machinery must all stay untouched — the ONLY thing that
changes is which mesh those names resolve to.

ZERO PALETTE COST IS A CONSTRUCTION, NOT A HOPE. The new pieces declare the SAME roles at the SAME
shade levels as the pieces they replace (`crown` at 1.00 and 0.82, `under` at 1.00, resolved through
the existing `shrub` token family), so `build_palette_dressed`'s closure over (family x level) is
identical. `verify.py` re-derives the delivered palette on both sets and asserts the counts agree.

Blender 5.2.0 LTS, CPU Cycles, fixed seed, adaptive sampling off. The shared helpers below are
duplicated from `blender_species.py` for the reason its own docstring gives: Blender does not
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
RESEARCH = os.path.join(REPO, "docs", "research")
GRASS = os.path.join(RESEARCH, "chapter2-grass-reads-as-signal-2026-08-16")
OPTIONS = os.path.join(RESEARCH, "chapter2-high-frequency-options-2026-08-17")

#: The four proven species come from here, byte-for-byte. So do the wilts and the three UAT flowers,
#: which that set had itself inherited from `pieces-m00-clump` — this set is one more link on the
#: same chain and records every hash it carries.
SOURCE_SET = os.path.join(OPTIONS, arg("--inherit-from", "pieces-species"))

ISLAND_PATH = arg("--island", os.path.join(
    RESEARCH, "chapter2-healthy-island-2026-08-16", "island.json"))
ISLAND = json.load(open(ISLAND_PATH))
OUT = os.path.join(HERE, arg("--out", "pieces-shrubs"))
SAMPLES = int(arg("--samples", "48"))
SEED = int(arg("--seed", "20260818"))
SS = int(arg("--ss", "3"))

#: Every shared constant is READ BACK OUT of the set being inherited from rather than restated. A
#: second copy of the band triples or the token families is a second thing to keep in step, and this
#: set mixes inherited and authored pieces in ONE draw list — they cannot be allowed to disagree.
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
#: IDENTICAL to the roles the legacy shrub pieces declare. This is what makes the palette cost zero
#: by construction rather than by measurement — the closure is over (family x level) and neither
#: moves.
SHRUB_ROLES = {"K0": ("crown", LIT), "K1": ("crown", DARK), "K2": ("under", LIT)}

#: The nine names this set inherits rather than authors: the four proven species, the two wilts and
#: the three UAT flowers.
INHERITED = ["tuft-2", "tuft-3a", "tuft-3b", "tuft-4",
             "wilt-twig", "wilt-stem",
             "flower-proven", "flower-pending", "flower-failing"]

#: Rendered, measured and shown in the species sheet, but NOT in `pieceNames` — so `use_pieces`
#: never mounts it and no composite can contain it. The increment's step 3 says to put a proposed
#: set in FRONT of the owner rather than silently pick one; an unmounted candidate is how a third
#: cue class gets shown without being shipped.
CANDIDATE_ONLY = ["shrub-alt-tier"]


# ---------------------------------------------------------------- shared helpers (duplicated)
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def det(*parts):
    h = hashlib.sha256((":".join(str(p) for p in parts) + f":{SEED}").encode()).digest()
    return int.from_bytes(h[:4], "big") / 0x100000000


def ramp_mat(name, lit_key, dark_key, split=0.52):
    """Two band triples chosen by N-dot-L through a CONSTANT ramp. No AO term, so a piece rendered
    in isolation carries no shading that depends on neighbours it will not have."""
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
    #: per-pixel sample count a function of tile scheduling and therefore of SYSTEM LOAD.
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


# ---------------------------------------------------------------- the small plants
#: THE DELIVERED BOX IS THE DESIGN SURFACE and the arithmetic is stated so a reader can check a
#: dimension rather than trust it. The piece canvas is 28.0 ground units across 84 px at SS=3, so
#: after the downsample ONE GROUND UNIT IS ONE DELIVERED PIXEL of width. A world-VERTICAL unit
#: foreshortens by cos(50 deg) = 0.643 and ground DEPTH by sin(50 deg) = 0.766, so an ellipsoid's
#: delivered half-height is sqrt((ry*0.766)^2 + (rz*0.643)^2) and its centre sits cz*0.643 + cy*0.766
#: above the contact point. Every number below is chosen through those three factors.
SPECIES_SCALE = 1.0


def build_cushion(variant):
    """CUSHION — the small tight mound. Reads as AREA, at the SMALL end of the ladder.

    The set's existing masses are the dome (18 delivered px), the spreader (20) and the two legacy
    shrubs (12 and 11). Nothing solid sits below 11, so the only small mark in the set was the spire
    — which is distinguished by ASPECT, not by size. A cushion at ~4x3 delivering 7-9 px puts a
    genuine size step at the bottom of the ladder, which is what makes area readable as a cue rather
    than as a two-value flag.

    IT IS DELIBERATELY NOT A SMALLER DOME. A single crown lobe rather than the dome's lumpy pair, so
    at 4 px wide it delivers as one clean mound instead of as the dome's outline with pixels missing
    — the failure mode the pair species already paid for once (`###.##`, a dashed line where the cue
    survived and the plant did not).

    ⚠ THE FIRST VERSION OF THIS PIECE FAILED EXACTLY THAT WAY AND THE INSTRUMENT CAUGHT IT. At
    ry 1.05 / rz 0.78 the mound delivered `####` — 4 px in a 4x1 box at 61% survival, i.e. a
    one-pixel-tall dash. Small was being bought out of HEIGHT, which is the axis that cannot afford
    it: the delivered half-height is sqrt((ry*0.766)^2 + (rz*0.643)^2), so a mound needs about 1.25
    world units on both to clear the two solid rows a majority vote will keep. Smallness is bought
    out of WIDTH instead (rx 1.55 against the dome's 1.85+1.55 pair), which costs no structure.
    `survival%` below ~85% is the arc's own tell that the vote is destroying structure rather than
    filling it, and `compose_shrubs.py` asserts it on every mounted piece so this cannot ship.
    """
    crown = ramp_mat("crown", "K0", "K1")
    under = flat_mat("under", "K2")
    s = SPECIES_SCALE * (1.0 + det("cushion", variant, "s") * 0.10)
    lobe("u0", under, 0.0, 0.30 * s, 0.45 * s, 1.85 * s, 1.15 * s, 0.50 * s)
    lobe("c0", crown, -0.15 * s, -0.15 * s, 1.05 * s, 1.55 * s, 1.30 * s, 1.15 * s)


def build_frond(variant):
    """FROND — a fan of sprays with a NOTCHED top. Reads as CONCAVITY, the third cue class.

    THE QUESTION THIS PIECE ASKS. The arc has established that area, aspect and disconnection
    survive the 3x3 majority; concavity has never been tried. The greenery survey's `survival%`
    instrument predicts the failure mode exactly — a vote needing only 5 of 9 CLOSES gaps — so the
    notch is authored at the depth that gives it a chance and no deeper.

    THE NOTCH DEPTH IS MEASURED, NOT EYEBALLED. The outer sprays' crowns sit at z = 3.55 and the
    centre at z = 1.35, a difference of 2.2 world units; through cos(50 deg) that is ~1.4 delivered
    px of top-profile drop, and the outer lobes' own radii carry it past 2 px at the shoulders. Any
    shallower and the majority vote fills it, which is the same arithmetic that set the pair's
    3.2-unit gap.

    The sprays are joined at the base by the under lobe, so this is a CONNECTED mass with a
    concave top — deliberately distinct from the pair, which is two masses with ground between them.
    """
    crown = ramp_mat("crown", "K0", "K1")
    under = flat_mat("under", "K2")
    stem = flat_mat("stem", "K2")
    s = SPECIES_SCALE
    lobe("u0", under, 0.0, 0.30 * s, 0.50 * s, 2.30 * s, 1.10 * s, 0.50 * s)
    #: the two outer sprays — stems at the measured 0.34-unit radius floor, crowns high
    for i, ox in enumerate((-2.45, 2.45)):
        j = det("frond", variant, "s", i)
        tube(f"st{i}", stem, [(ox * 0.25, 0.0, 0.30 * s),
                              (ox * 0.70, 0.0, 1.90 * s),
                              (ox * 0.95, 0.0, 3.10 * s)], 0.40 * s)
        lobe(f"c{i}", crown, ox * s, -0.10 * s, (3.55 + j * 0.25) * s,
             1.25 * s, 0.95 * s, 0.95 * s)
    #: the centre spray, held LOW — this is the notch
    lobe("cm", crown, 0.05 * s, -0.20 * s, 1.35 * s, 1.05 * s, 0.90 * s, 0.80 * s)


def build_tier(variant):
    """TIER — a crown raised CLEAR of the ground on a stem. Reads as VERTICAL separation.

    THE CANDIDATE, and it is rendered to be looked at rather than mounted. Disconnection is the
    strongest cue the arc has found, and the pair spends it on the HORIZONTAL axis; this asks what
    the same cue is worth on the vertical one, where the separation is between the plant and the
    ground it stands on rather than between two halves of the plant.

    WHY IT IS NOT MOUNTED. It is the tallest thing in the set by some margin (crown centre at 3.9
    world units = ~2.5 delivered px above the contact point, against the dome's ~1.4), and "way too
    big" is one of three standing owner rejections this arc has already collected. Whether a plant
    that reads as a small tree belongs in a set of ground cover is an appearance call, and this pass
    has no standing to make it.
    """
    crown = ramp_mat("crown", "K0", "K1")
    stem = flat_mat("stem", "K2")
    s = SPECIES_SCALE
    h = 3.05 * s
    tube("st", stem, [(0.0, 0.0, 0.0), (0.10 * s, 0.0, h * 0.6), (0.18 * s, 0.0, h)], 0.46 * s)
    j = det("tier", variant, "c")
    lobe("c0", crown, 0.10 * s, -0.10 * s, (3.90 + j * 0.2) * s,
         1.95 * s, 1.25 * s, 1.05 * s)
    lobe("c1", crown, -0.95 * s, 0.25 * s, 3.45 * s, 1.15 * s, 0.85 * s, 0.72 * s)


#: The two authored slots, plus the unmounted candidate. `shrub-a` and `shrub-b` keep their names
#: because `scatter.py`'s `place("shrub", ...)` chooses between exactly those two by hash — renaming
#: them would be a change to the placement machinery, which this pass must not make.
AUTHORED = [
    ("shrub-a", "cushion", lambda: build_cushion("a")),
    ("shrub-b", "frond", lambda: build_frond("a")),
    ("shrub-alt-tier", "tier", lambda: build_tier("a")),
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
for name, species, build in AUTHORED:
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

#: MOUNTABLE names only. The candidate is on disk and hashed by the provenance record, but it is not
#: here, so `compose_core.load_decor` never classifies it and no composite can contain it.
PIECE_NAMES = [n for n in rendered if n not in CANDIDATE_ONLY] + INHERITED

meta = {
    "generator": "blender_shrubs.py",
    "grassNormalMix": SRC_META["grassNormalMix"],
    #: DECLARED SO `use_pieces` CAN REFUSE A MISMOUNT. A caller mounting this as "blade", "clump" or
    #: "species" is refused before a pixel is drawn.
    "grassGeometry": "shrubs",
    "grassNormalRule": "off — each species carries its own normals; no shared dome proxy is applied",
    "speciesMap": dict({name: species for name, species, _b in AUTHORED},
                       **{name: SRC_META["speciesMap"][name]
                          for name in INHERITED if name in SRC_META.get("speciesMap", {})}),
    "speciesRule": (
        "A SPECIES CARRIES NO MEANING. ADR-0226 D2 gives the signal to the vegetation COUNT and the "
        "vocabulary has no member for species, so six outlines assert exactly what two did. The six "
        "sit in the slots `scatter.py` already chooses among, so the count rules, the token "
        "families and the placement machinery are untouched."),
    "candidateOnly": CANDIDATE_ONLY,
    "candidateRule": (
        "RENDERED, MEASURED AND SHOWN — NEVER MOUNTED. It is absent from `pieceNames`, so "
        "`compose_core.load_decor` never classifies it and no composite on this pass can contain "
        "it. The increment's step 3 requires putting a proposed set in FRONT of the owner rather "
        "than silently picking one."),
    "inheritedFrom": os.path.relpath(SOURCE_SET, REPO).replace("\\", "/"),
    "inheritedSha256": inherited_hashes,
    "inheritedGenerator": SRC_META["code_state"],
    "notEdited": {
        "blender_species.py": (
            "its sha256 is stamped into pieces-species/render-meta.json and five committed "
            "provenance sidecars whose pictures are in front of the owner; editing it would "
            "invalidate all of them to add species none of them contain"),
        "blender_grass.py": "its sha256 is stamped into fourteen committed piece sets' code state",
    },
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
    "pieceNames": PIECE_NAMES,
    "pieceRoles": dict(
        {name: {k: list(v) for k, v in SHRUB_ROLES.items()} for name, _s, _b in AUTHORED},
        **{name: SRC_META["pieceRoles"][name] for name in INHERITED}),
    "tokenFamilies": TOKEN_FAMILIES,
    "headBillboard": SRC_META["headBillboard"],
    "vocabularySource": SRC_META["vocabularySource"],
}
with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE shrub pieces ->", OUT, flush=True)
