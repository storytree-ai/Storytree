#!/usr/bin/env python3
"""THE COMPONENT ART, WITH THE GRASS PUT UNDER A LEVER: the app's decided vegetation vocabulary,
grown in 3D at the declared camera, with the tuft's SHADING NORMALS and its GEOMETRY as forks.

    blender --background --python blender_grass.py -- --island island.json --out pieces-m00 \
        --normals 0.0 --geometry blade

VENDORED, NOT IMPORTED. This file began as `blender_decor.py` from the island-place-dressing pass of
the same date. That pass was staged and never committed, so there is no committed sibling to import
the way `compose_dressed.py` imports the interior fork's `compose.py` — vendoring is what the track's
own no-second-copy rule leaves available when the first copy is not on `main`. The two files differ
in exactly three places, all in the grass, and every one is named in the README.

WHAT THIS PASS ADDS, AND THE VERDICT THAT FORCED IT
---------------------------------------------------
The owner looked at that pass and said the grass "looks rather ugly". The arc's own technique triage
(recorded on `chapter2-code-generated-organic-art-arc`) names the mechanism aimed at exactly this
symptom, and records that we have already built it ONCE, for the crown:

    TRIAGE ITEM 1 — shared custom vertex normals transferred from a SMOOTH ANALYTIC PROXY (the
    video's Data Transfer + Auto Smooth step). Shipped in the hero tree at v7 / PR #1108, mix 0.22,
    a measured STRICT optimum FOR THE CROWN. The stated defect it fixed is our symptom verbatim:
    "our crown is a pile of ~20 closed ellipsoids, so EVERY lobe presents every facing angle and
    carries its own full light-to-dark ramp".

READ THAT SENTENCE WITH "BLADE" FOR "LOBE" AND IT DESCRIBES THIS TUFT EXACTLY. `build_tuft` emits
N independent twisting ribbons, each its own object, each sweeping N-dot-L across a three-band ramp.
At 26-42 delivered pixels per tuft that is not shading, it is confetti — and the grass never got the
treatment the crown did. That is the hypothesis this file exists to test.

    THE MIX IS RE-MEASURED FOR GRASS, NOT INHERITED. 0.22 is the crown's optimum, established
    against exp-16's highlight-cap structure on a 4200 px crown. A 30 px tuft is a different
    instrument at a different scale and owes its own sweep. `--normals 0.0` is byte-identical to the
    vendored pass, so the fork moves exactly one variable.

The proxy is ANALYTIC and generated from the tuft this frame emitted — a DOME fitted to the blade
set's own envelope — so ADR-0280 D1 holds: no sculpted asset, no `.blend`, and no Data-Transfer
nearest-surface heuristic to tune. It is shared across ALL the tuft's blades, which is the entire
point: normals that stop at one blade's boundary cannot make a clump shade as one mass.

`--geometry clump` is the second lever, and it is the one the arc's strategic takeaway points at
("sparse clump meshes rather than individual blades"). It welds the blades into ONE mesh standing on
a low base mound, so the clump has a mass silhouette and one continuous normal field rather than N
disjoint ones.

WHAT IS DELIBERATELY NOT HERE, so a reader does not go looking: no wind, no animation, no LOD, no
instancing tier, no frustum culling. Those are runtime-GPU concerns protecting a real-time renderer
we do not have (ADR-0367 D3), and an animated asset would be an asset-owned clock, which is
forbidden outright. At author time polycount costs render MINUTES, not frame rate, and what ships is
the sprite.

WHAT IS RENDERED, AND WHY IT IS THIS AND NOT SOMETHING PRETTIER
--------------------------------------------------------------
The owner's directive for this pass is that the island "still dont have flowers etc". The obvious
reading — scatter some nice flowers around — is WRONG here, and the corpus says so in three places:

  · ADR-0226 D2/D4 (accepted 2026-07-21) fixed a single vegetation language: grass = a capability's
    TESTS, dead grass = the status wilt, and **a flower means UAT and only UAT**, its FORM reading
    the verdict. The decorative wildflower / anemone / heather-bell accents were RETIRED to get
    there.
  · Standing stones were rejected TWICE — as "noisy/colliding" (#832, 2026-07-18) and then as
    "messy and noisy rather than cosy" (owner, 2026-07-20).
  · The proven bloom's glow is "low opacity, calm (no sparks: the owner's noise complaint)".

So the missing art is not new species. It is that the DECIDED vocabulary has never been rendered as
anything but flat SVG strokes. This file renders exactly that vocabulary and adds no member to it.

THE REJECTION THIS PASS IS MOST EXPOSED TO, ADDRESSED IN THE GEOMETRY RATHER THAN IN PROSE
------------------------------------------------------------------------------------------
On 2026-07-22 the owner looked at a BAKED 3D flower (`uat-flower.ts`, inc 14, PR #862) and rejected
it: "over-complicated", with a "horizontal head" that "looks odd". It was parked and the simpler
FLAT flower kept. This pass renders baked flowers, so that verdict is aimed directly at it.

The diagnosis that matters is the horizontal head. A flat SVG flower draws its head face-on in
SCREEN space, so the reader always sees a daisy. Model the same flower in 3D with its head in the
GROUND plane and the camera sees an ellipse edge-on — the head stops reading as a face and starts
reading as a lid, which is what "looks odd" describes. So:

    THE FLOWER HEAD IS BUILT CAMERA-FACING (billboarded to the declared camera), while the stem and
    leaves keep real 3D form.

`head_rotation()` derives the tilt from the island's own camera rather than hard-coding it, so the
head stays face-on at whatever angle the pass is authored at. This is a hypothesis about WHY the
baked flower failed, offered for the owner's look — not a claim that it is fixed.

WHAT THE RENDER EMITS IS BAND KEYS, NEVER COLOUR — and each piece declares its OWN key subset.
`blender_land.py` classifies every piece against one five-key vocabulary; decor needs more roles
than that (a flower has stem, leaf, petal and centre), and widening one global key list would push
the keys closer together until a Cycles-antialiased boundary pixel could classify to a THIRD key it
lies nowhere near. Instead each piece declares which of six widely separated triples it uses and is
decoded against that subset only, so separation stays as good as the land's however many roles the
whole set accumulates.

Colour is looked up at paint time from AUTHORED tokens (`apps/studio/src/index.css`) — a tuft's
blade token is its capability's status class, a flower's petal token is its UAT verdict. The status
therefore never reaches the renderer, exactly as ADR-0367 D5 requires of the land.

The shared Blender helpers below are duplicated from `blender_land.py` rather than imported: Blender
does not reliably put a `--python` script's own directory on `sys.path`, which is the same reason
`blender_tree.py` inlines its own provenance digest.
"""
import hashlib
import json
import math
import os
import sys

import bpy  # noqa: E402  (only importable under Blender)
import mathutils  # noqa: E402
import numpy as np  # noqa: E402  (Blender's BUNDLED numpy — see the README's trap 1)

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


HERE = os.path.dirname(os.path.abspath(__file__))
ISLAND_PATH = os.path.join(HERE, arg("--island", "island.json"))
ISLAND = json.load(open(ISLAND_PATH))
OUT = os.path.join(HERE, arg("--out", "pieces-decor"))
SAMPLES = int(arg("--samples", "48"))
SEED = int(arg("--seed", "20260816"))
SS = int(arg("--ss", "3"))

# ------------------------------------------------------- the two grass levers
#: HOW FAR EACH BLADE'S SHADING NORMAL IS PULLED TOWARD THE TUFT'S SHARED DOME PROXY. 0.0 is exactly
#: the vendored pass — an exact no-op, which is what makes this a clean one-variable fork — and 1.0
#: is a bare dome on which the individual blades stop reading at all.
#:
#: DO NOT INHERIT THE CROWN'S 0.22. It is a strict optimum for a 4200 px crown measured against
#: exp-16's highlight-cap structure; a tuft is 26-42 px and is a different instrument entirely.
#: `grass-report.json`'s `normalSweep` is this pass's own measurement.
GRASS_NORMAL_MIX = float(arg("--normals", "0.0"))
if not 0.0 <= GRASS_NORMAL_MIX <= 1.0:
    raise SystemExit(f"--normals must be 0..1, got {GRASS_NORMAL_MIX}")

#: `blade`  — N independent twisting ribbons, one object each. The vendored pass's tuft.
#: `clump`  — the SAME N ribbons welded into ONE mesh standing on a low base mound, so the tuft has
#:            a mass silhouette and one continuous normal field. The arc's strategic takeaway
#:            ("sparse clump meshes rather than individual blades") made geometry.
GRASS_GEOMETRY = arg("--geometry", "blade")
if GRASS_GEOMETRY not in ("blade", "clump"):
    raise SystemExit(f"--geometry must be blade|clump, got {GRASS_GEOMETRY!r}")

#: The camera is read from the island, never restated — this file declares no angle (ADR-0367 D1).
ELEV_DEG = float(ISLAND["camera"]["elevationDeg"])
EL = math.radians(ELEV_DEG)

#: One square canvas in GROUND px for every decor piece, with the piece's GROUND CONTACT POINT at
#: the canvas centre. That keeps the compositor's paste rule identical to the land's — a piece's
#: centre lands on its placement's projected point — while letting decor grow UP out of it. 28 px
#: covers the tallest member (a ~16-unit flower foreshortens to ~10 px at this camera) with margin.
PIECE_W = 28.0
RES = int(PIECE_W * SS)

#: The hero tree's own key direction, reused verbatim — the third consumer of it, after the land.
#: Land, object and now ground cover must share one light as much as one camera.
LIGHT_DIR = (-0.435, -0.429, 0.792)
KEY_ROT = (math.radians(48), 0.0, math.radians(34))

# ---------------------------------------------------------------- band keys
#: Six widely separated triples. A piece uses a SUBSET (at most five) and is decoded against that
#: subset, so the nearest-key classification stays as well separated as the land's five.
BAND = {
    "K0": (255, 0, 0),
    "K1": (0, 255, 0),
    "K2": (0, 0, 255),
    "K3": (255, 255, 0),
    "K4": (0, 255, 255),
    "K5": (255, 0, 255),
}

#: What each band triple MEANS in each piece: a (token role, shade level) pair. The role is looked
#: up per placement from authored tokens; the shade is an authored level, matching the land's
#: two-level wall convention (1.00 lit / 0.82 turned away) so the closed palette does not widen.
LIT, DARK = 1.00, 0.82

TUFT_ROLES = {"K0": ("bladeFront", LIT), "K1": ("bladeFront", DARK), "K2": ("bladeBack", LIT)}
SHRUB_ROLES = {"K0": ("crown", LIT), "K1": ("crown", DARK), "K2": ("under", LIT)}
WILT_ROLES = {"K0": ("stem", LIT), "K1": ("stem", DARK), "K3": ("fleck", LIT)}
BLOOM_ROLES = {"K0": ("petal", LIT), "K1": ("petal", DARK), "K2": ("centre", LIT),
               "K3": ("stem", LIT), "K4": ("leaf", LIT)}
BUD_ROLES = {"K0": ("bud", LIT), "K1": ("bud", DARK), "K3": ("stem", LIT), "K4": ("leaf", LIT)}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(rgb):
    return tuple(srgb_to_linear(c) for c in rgb) + (1.0,)


def det(*parts):
    """A deterministic 0..1 from an address. CRC32-equivalent via sha256, never Python's `hash()`,
    which is salted per process — a salted choice would break the byte-identity `verify.py`
    asserts."""
    h = hashlib.sha256((":".join(str(p) for p in parts) + f":{SEED}").encode()).digest()
    return int.from_bytes(h[:4], "big") / 0x100000000


def flat_mat(name, key):
    """A material emitting ONE band triple, unshaded."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin(tuple(c / 255 for c in BAND[key]))
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def bands_mat(name, bands):
    """N band triples chosen by N·L through a CONSTANT ramp — `bands` is [(position, key), ...]
    ascending. The same construction `blender_land.py` uses for its chamfer and wall bands, and for
    the same reason: no AO term, so a piece rendered in isolation cannot carry shading that depends
    on neighbours it will not have."""
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
    el.elements[0].color = lin(tuple(c / 255 for c in BAND[bands[0][1]]))
    for pos, key in bands[1:]:
        e = el.elements.new(pos)
        e.color = lin(tuple(c / 255 for c in BAND[key]))
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])

    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def ramp_mat(name, lit_key, dark_key, split=0.52):
    """Two band triples chosen by N·L through a CONSTANT ramp — the same construction
    `blender_land.py` uses for its chamfer and wall bands, and for the same reason: no AO term, so a
    piece rendered in isolation cannot carry shading that depends on neighbours it will not have."""
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


def mesh_object(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    return ob


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
    sc.cycles.device = "CPU"                       # ADR-0280 D2a: CPU only
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.seed = SEED
    # ADAPTIVE SAMPLING OFF, AND THIS IS A DETERMINISM FIX RATHER THAN A QUALITY ONE.
    #
    # Measured: with it on, `verify.py` found 2 of 11 pieces re-rendering with differing pixels —
    # and only when the re-render ran while the box was busy with another compose. These shaders are
    # FLAT EMISSION, so there is no sampling noise to converge and no quality argument either way;
    # what adaptive sampling adds is a per-pixel sample count decided from a running noise estimate,
    # which is sensitive to tile scheduling and therefore to how many threads the machine could
    # spare. That makes the render a function of SYSTEM LOAD, which is exactly the property a
    # committed piece set must not have.
    #
    # It failed in the direction that hides: a determinism check run on an idle box passes, and the
    # pieces drift only when someone happens to be running something else. Fixed at the source
    # rather than by re-running until green.
    sc.cycles.use_adaptive_sampling = False
    sc.render.resolution_x = RES
    sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"   # the palette is ours, not filmic's
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- geometry helpers
def head_rotation():
    """The tilt that makes a flat head face the CAMERA rather than lie in the ground plane.

    A disc built in the XY plane has normal +Z. Rotating about X by `a` sends that normal to
    (0, -sin a, cos a); the camera looks along (0, cos EL, -sin EL), so a head faces it when its
    normal is (0, -cos EL, sin EL), i.e. `a = 90 deg - EL`. Derived from the island's own camera, so
    the head stays face-on at whatever angle this pass is authored at.
    """
    return math.pi / 2 - EL


def disc(cx, cy, cz, rx, ry, rot_z, rot_x, seg=14):
    """A flat ellipse in its own plane, rotated first about Z (its own long axis direction) and then
    about X (the camera billboard tilt), then translated. Returned as (verts, face)."""
    verts = []
    ca, sa = math.cos(rot_z), math.sin(rot_z)
    cb, sb = math.cos(rot_x), math.sin(rot_x)
    for i in range(seg):
        t = (i / seg) * math.tau
        x, y = rx * math.cos(t), ry * math.sin(t)
        x2, y2 = x * ca - y * sa, x * sa + y * ca
        # rotate about X: (x, y, 0) -> (x, y cos b, y sin b)
        verts.append((cx + x2, cy + y2 * cb, cz + y2 * sb))
    return verts, tuple(range(seg))


def add_disc(name, mat, *a, **k):
    v, f = disc(*a, **k)
    return mesh_object(name, v, [f], mat)


def blade_geometry(base_x, base_y, height, width, lean_x, lean_y, curve, twist, segs=7):
    """One tapered grass blade: a TWISTING ribbon that narrows to a tip, leaning and curving.

    Returned as verts/faces rather than as an object — that is the only change from the vendored
    pass's `blade()` — so `--geometry clump` can WELD several into one mesh instead of linking one
    object per blade. The arithmetic below is untouched.

    WHY ONE TWISTED RIBBON AND NOT THE APP'S TWO STACKED PATHS — measured, not preferred. The app
    draws a blade as a wide dark BACK path with a narrower light FRONT path laid over it, which is a
    2D fake of a blade whose face catches the light while its edge turns away. Modelling that
    literally in 3D put two polygons carrying DIFFERENT band keys within a pixel of each other: at
    the app's authored widths (1.5 and 0.56 ground units) the front strip is under two supersampled
    pixels wide, so Cycles blended the two keys and the blade came out MAGENTA — a colour lying
    exactly equidistant between the red and blue keys, which the nearest-key classifier then
    resolves by argmin tie-break rather than by what the surface is. Most of the blade, not a fringe.

    The ribbon carries the same read with no overlapping geometry: it twists about its own axis, so
    N·L sweeps across it and a THREE-band ramp delivers front-lit, front-shaded and back tokens from
    ONE surface. The only blended pixels left are at the silhouette, where the neighbour is
    transparency rather than another key.

    A quadratic lean (the tip travels further than the middle) is what makes a blade read as bending
    under its own weight rather than as a straight spike; the width axis rotates along the blade,
    and that twist is what gives one surface enough normal variation to band.
    """
    verts, faces = [], []
    for i in range(segs + 1):
        t = i / segs
        w = width * (1.0 - t) ** 1.3
        x = base_x + lean_x * t * t + curve * math.sin(t * math.pi) * 0.4
        y = base_y + lean_y * t * t
        z = height * t
        psi = twist * t
        ux, uy = math.cos(psi), math.sin(psi) * 0.75
        verts += [(x - ux * w / 2, y - uy * w / 2, z), (x + ux * w / 2, y + uy * w / 2, z)]
        if i > 0:
            b = (i - 1) * 2
            faces.append((b, b + 1, b + 3, b + 2))
    return verts, faces


def mound_geometry(radius, height, seg=12, rings=3):
    """The clump's BASE MOUND — a low half-ellipsoid the blades stand out of.

    This is the half of `--geometry clump` that is not just welding. A tuft of bare ribbons has no
    body: between the blades the reader sees ground, so at delivered scale the tuft is a scatter of
    2-3 px slivers rather than an object. The mound gives the clump a silhouette to be shaded across
    — which is also what makes the shared dome normals have something continuous to act on.

    It carries NO new token: it is shaded by the same three-band blade material, so a clump is still
    ONE token family (the piece-level property that keeps a misclassified fringe pixel on a
    neighbouring shade of the RIGHT capability's status rather than on another status entirely).
    """
    verts = [(0.0, 0.0, height)]
    for r in range(1, rings + 1):
        phi = (r / rings) * (math.pi / 2)
        rr, zz = radius * math.sin(phi), height * math.cos(phi)
        for s in range(seg):
            a = (s / seg) * math.tau
            verts.append((rr * math.cos(a), rr * math.sin(a) * 0.72, zz))
    faces = []
    for s in range(seg):
        faces.append((0, 1 + s, 1 + (s + 1) % seg))
    for r in range(rings - 1):
        b0, b1 = 1 + r * seg, 1 + (r + 1) * seg
        for s in range(seg):
            n = (s + 1) % seg
            faces.append((b0 + s, b1 + s, b1 + n, b0 + n))
    return verts, faces


def tuft_proxy(verts):
    """THE SHARED ANALYTIC DOME — triage item 1's proxy, one scale down from the crown's ellipsoid.

    Fitted to the blade set THIS tuft emitted, so it tracks a 2-blade `unknown` tuft and a 4-blade
    lush one without either being tuned. ADR-0280 D1 forbids a sculpted proxy mesh and a Data
    Transfer modifier would need a nearest-surface mapping heuristic; an analytic surface has an
    exact normal everywhere and needs neither.

    A DOME rather than a full ellipsoid because grass grows OUT OF the ground: the centre sits at
    the tuft's ground contact, so the proxy normal points up at the crown of the tuft and outward at
    its skirt, which is the "flat-or-dome normal" step the technique reference describes.
    """
    a = np.asarray(verts, dtype=np.float64)
    cx, cy = float(a[:, 0].mean()), float(a[:, 1].mean())
    cz = float(a[:, 2].min())
    ex = max(float(np.abs(a[:, 0] - cx).max()), 1e-3)
    ey = max(float(np.abs(a[:, 1] - cy).max()), 1e-3)
    ez = max(float((a[:, 2] - cz).max()), 1e-3)
    return np.array([cx, cy, cz]), np.array([ex, ey, ez])


def apply_shared_normals(objects, ctr, ext, mix):
    """Blend every vertex's shading normal toward the SHARED dome proxy's, across ALL the objects
    given. Returns the mix actually applied.

    SHARED IS THE LOAD-BEARING WORD. Applying a per-blade proxy would leave each blade shading as
    its own little volume, which is the defect, not the fix. One proxy for the whole tuft is what
    makes a clump read as one mass.

    The base is each mesh's OWN normals rather than a recomputed analytic surface, so `mix=0.0` is
    an exact no-op and the fork moves one variable. Verified for the crown before it was built and
    unchanged here: Cycles' `Geometry > Normal` — the socket `bands_mat` already reads — honours
    custom split normals, so the band list is untouched and this is not the EEVEE-only
    `Shader to RGB` route under another name.
    """
    if mix <= 0.0:
        return 0.0
    for ob in objects:
        me = ob.data
        nv = len(me.vertices)
        if nv == 0:
            continue
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

        out = base * (1.0 - mix) + prox * mix
        on = np.linalg.norm(out, axis=1, keepdims=True)
        # a vertex whose two normals oppose blends to nothing — keep its own rather than hand
        # Blender a zero vector it would quietly substitute for
        out = np.where(on > 1e-6, out / np.maximum(on, 1e-12), base)
        me.normals_split_custom_set_from_vertices([mathutils.Vector(v) for v in out])
    return mix


def lobe(name, mat, cx, cy, cz, rx, ry, rz):
    """A foliage lobe — a scaled UV sphere. `parcel-shrub` draws its dome as overlapping ellipses,
    so the 3D form is the same construction with real normals doing the shading."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, location=(cx, cy, cz))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (rx, ry, rz)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tube(name, mat, pts, radius, sides=6):
    """A stem: a low-poly tube swept along a polyline. Six sides is enough at the delivered scale —
    a stem is one to two pixels wide after the majority downsample."""
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


def stem_curve(height, lean, bow, segs=6):
    """The flower stalk. `tallFlowerMarks` draws a cubic Bezier that curves UP for a living flower
    and bows OVER for a failing one; `bow` carries that sign."""
    pts = []
    for i in range(segs + 1):
        t = i / segs
        x = lean * t * t
        y = 0.0
        z = height * t - bow * t * t
        pts.append((x, y, z))
    return pts


# ---------------------------------------------------------------- the pieces
def build_tuft(variant, blades, tall):
    """Grass — a capability's TESTS (ADR-0226 D2). `blades` reproduces the app's own count rule:
    2 for an `unknown` capability, 3 ordinarily, 4 for a lush one.

    `variant` enters every deterministic address, so two variants sharing a blade count and a height
    base still render as different tufts. Without it `tuft-3a` and `tuft-3b` would be byte-identical
    files — a piece set that looks like four variants and delivers three.

    THE TWO LEVERS THIS PASS ADDS BOTH LAND HERE, and nowhere else in the piece set. The blade
    ARITHMETIC below is untouched from the vendored pass — same angles, same heights, same widths,
    same twist, same deterministic addresses — so `--normals 0.0 --geometry blade` reproduces it
    exactly, and any difference a picture shows is the lever rather than a drift.
    """
    # ONE material, three bands: turned away -> the back token, mid -> the front token shaded,
    # turned toward the key -> the front token lit.
    blade_m = bands_mat("blade", [(0.0, "K2"), (0.40, "K1"), (0.60, "K0")])

    strands = []
    for i in range(blades):
        a = det("tuft", variant, "ang", i) * math.tau
        # the app's own height rule: `h = (unknown ? 2.6 : 3.4) + rand()*2.4`
        h = tall + det("tuft", variant, "h", i) * 2.4
        lx = math.cos(a) * h * 0.34
        ly = math.sin(a) * h * 0.20
        bx = math.cos(a) * 0.5
        by = math.sin(a) * 0.35
        cur = (det("tuft", variant, "c", i) - 0.5) * h * 0.25
        # The blade's WIDTH is the app's own back-path width (1.5 ground units) — the body of the
        # blade — with the lighter front path now delivered by shading rather than by a second
        # polygon. Deliberately NOT widened beyond it: the 2026-07-23 owner verdict on baked sprite
        # art was that it read "way too big", and the rule drawn from it is that a rendered
        # component derives its size from the vector body it replaces. Whether this reads at the
        # delivered scale is a MEASUREMENT this pass owes, never a licence to inflate the art.
        tw = math.radians(55 + det("tuft", variant, "tw", i) * 70)
        strands.append(blade_geometry(bx, by, h, 1.5, lx, ly, cur, tw))

    if GRASS_GEOMETRY == "clump":
        # WELD: one mesh, so the tuft has one continuous normal field rather than N disjoint ones —
        # plus a low base mound sized from the blades' OWN spread and height, never from a constant.
        spread = max(max(abs(v[0]) for v in vs) for vs, _f in strands)
        tallest = max(max(v[2] for v in vs) for vs, _f in strands)
        verts, faces = list(mound_geometry(spread * 0.92 + 0.55, tallest * 0.20))
        for vs, fs in strands:
            b = len(verts)
            verts += list(vs)
            faces += [tuple(i + b for i in f) for f in fs]
        objs = [mesh_object("clump", verts, faces, blade_m)]
    else:
        # the vendored pass's tuft: one object per ribbon, each with its own normal field
        objs = [mesh_object(f"blade{i}", vs, fs, blade_m) for i, (vs, fs) in enumerate(strands)]

    ctr, ext = tuft_proxy([v for ob in objs for v in (tuple(x.co) for x in ob.data.vertices)])
    apply_shared_normals(objs, ctr, ext, GRASS_NORMAL_MIX)


def build_shrub(variant):
    """`parcel-shrub` — three dark under-lobes carrying two lighter crown lobes, the app's own
    construction with real normals instead of stacked ellipses."""
    under = flat_mat("under", "K2")
    crown = ramp_mat("crown", "K0", "K1")
    s = 1.0 + det("shrub", variant, "s") * 0.35
    for i, (ox, oy, r) in enumerate(((-2.3, 0.9, 1.9), (2.1, 1.1, 2.0), (0.2, -0.6, 2.5))):
        lobe(f"u{i}", under, ox * s * 0.6, oy * s * 0.5, r * s * 0.55,
             r * s * 0.62, r * s * 0.45, r * s * 0.55)
    for i, (ox, r) in enumerate(((-0.8, 1.9), (0.9, 1.3))):
        j = det("shrub", variant, "c", i)
        lobe(f"c{i}", crown, ox * s * 0.6, -0.3 * s, (r + 1.4) * s * 0.66,
             r * s * 0.66, r * s * 0.5, r * s * 0.6 * (0.85 + j * 0.3))


def build_wilt(variant):
    """The status wilt — dead grass for an unhealthy capability (ADR-0226 D3). The app draws two
    sub-forms; both are here, chosen by variant: a fallen twig, and a drooping stem."""
    stem = ramp_mat("stem", "K0", "K1")
    fleck = flat_mat("fleck", "K3")
    # The tube radii are set at 0.34 rather than the 0.20 a first pass used. That was not an art
    # choice being softened: at 0.20 ground units a wilt was SIX opaque supersampled pixels, i.e.
    # under one delivered pixel, so the piece was below the resolution of the render that produced
    # it and would have shipped as a stray speck. 0.34 matches the flower stem, which is the
    # thinnest member that demonstrably survives the majority downsample.
    if variant == "twig":
        pts = [(-1.9, 0.2, 0.18), (-0.5, -0.1, 0.62), (0.7, 0.15, 0.34), (2.0, -0.05, 0.8)]
        tube("twig", stem, pts, 0.34)
        lobe("fleck", fleck, 2.0, -0.05, 0.86, 0.46, 0.38, 0.40)
    else:
        h = 3.6
        pts = stem_curve(h, 0.9, h * 0.55)
        tube("stem", stem, pts, 0.34)
        tip = pts[-1]
        lobe("f0", fleck, tip[0], tip[1], tip[2], 0.52, 0.42, 0.42)
        lobe("f1", fleck, tip[0] - 0.9, tip[1] + 0.1, tip[2] * 0.72, 0.34, 0.28, 0.28)


def build_flower(state):
    """ONE UAT criterion, its FORM reading the verdict (ADR-0226 D4) — bloomed = proven, closed bud
    = pending, drooping = failing. The petal counts, the failing arc and the proportions are the
    app's own (`tallFlowerMarks`, small branch), so this is the SAME flower with real form rather
    than a different flower.

    THE HEAD IS CAMERA-FACING. See the module docstring: a head left in the ground plane is the
    "horizontal head" the owner rejected on the baked flower in 2026-07-22.

    The proven bloom's soft glow is DELIBERATELY ABSENT — see the README's honest gaps. Two
    low-opacity discs cannot survive a closed-palette snap and a majority downsample as anything but
    a hard ring, which is the "sparks" read the owner has already refused. It belongs to the app's
    SVG layer, exactly as the interior fork concluded about the interior lighting plate.
    """
    stem_m = flat_mat("stem", "K3")
    leaf_m = flat_mat("leaf", "K4")
    tilt = head_rotation()

    height = 13.0 + det("flower", state, "h") * 3.0        # the app's small branch: 12 + j*4
    lean = (det("flower", state, "lean") - 0.5) * 3.0      # the app's small branch: +-3
    failing = state == "failing"
    bow = height * 0.34 if failing else -height * 0.06

    pts = stem_curve(height, lean, bow)
    tube("stem", stem_m, pts, 0.30)

    # two leaves at stem fractions 0.34 and 0.6, alternating sides — the app's own placement
    for i, t in enumerate((0.34, 0.6)):
        side = 1 if i % 2 == 0 else -1
        k = int(t * (len(pts) - 1))
        bx, by, bz = pts[k]
        add_disc(f"leaf{i}", leaf_m, bx + side * 1.15, by, bz, 1.7, 0.8,
                 math.radians(side * 34), tilt)

    hx, hy, hz = pts[-1]
    if failing:
        # the app shifts a failing head sideways and DOWN — a sunken, bowed-over head
        hx += (1 if det("flower", state, "nod") < 0.5 else -1) * 2.6
        hz -= 2.8

    if state == "pending":
        # a closed teardrop bud: no petals, no centre, no glow
        bud = ramp_mat("bud", "K0", "K1")
        lobe("bud", bud, hx, hy, hz + 1.2, 0.95, 0.85, 1.9)
        add_disc("budtip", bud, hx, hy, hz + 2.9, 0.42, 0.9, 0.0, tilt)
        return

    petal_m = ramp_mat("petal", "K0", "K1", split=0.46)
    centre_m = flat_mat("centre", "K2")
    if failing:
        n = 5
        # petals droop into the app's 112..248 degree arc rather than radiating full circle
        angles = [math.radians(112 + (248 - 112) * (i / (n - 1))) for i in range(n)]
        prx, pry = 0.78, 2.3
        crad = 1.15
    else:
        n = 6 + (1 if det("flower", state, "petals") < 0.5 else 0)
        angles = [(i / n) * math.tau for i in range(n)]
        prx, pry = 0.85, 2.6
        crad = 1.35

    for i, a in enumerate(angles):
        j = det("flower", state, "pj", i)
        ln = pry + (j - 0.5) * 0.5
        # Each petal is ROOTED AT THE HEAD CENTRE and extends outward only: the ellipse sits at half
        # its own length along the angle with a matching semi-axis, so the head's radius is `ln` —
        # the app's own 2.6, i.e. a 5.2-unit head — rather than the 8.4 an ellipse CENTRED on the
        # head would give. Two things turn on getting this directional: the head reads at the size
        # the app authored, and a `failing` flower's petals hang into their arc instead of forming a
        # full disc that would erase the droop the verdict is read from.
        ox = math.cos(a) * ln * 0.5
        oy = math.sin(a) * ln * 0.5
        # `disc` builds its long axis along local +y, which rotating by `rot_z` sends to
        # (-sin, cos); pointing it along `a` therefore needs `a - 90 deg`. With `a + 90 deg` every
        # petal points 180 degrees the wrong way — invisible on a symmetric daisy, and it silently
        # flips the failing flower's droop UPWARD, which is the one thing its form has to say.
        add_disc(f"petal{i}", petal_m, hx + ox, hy + oy * math.cos(tilt),
                 hz + oy * math.sin(tilt), prx, ln * 0.5, a - math.pi / 2, tilt)
    add_disc("centre", centre_m, hx, hy - 0.02 * math.cos(tilt), hz + 0.02 * math.sin(tilt) + 0.01,
             crad, crad, 0.0, tilt)


#: The delivered set: kind -> (builder, role map). Eleven pieces, all forest-wide by construction —
#: none of them depends on an island's outline or on any cell's shape, which is the same property
#: that makes the rim pieces reusable across every island.
PIECES = [
    # the app authors exactly TWO blade-height bases — 2.6 for an `unknown` capability and 3.4
    # otherwise — so the variants differ in blade COUNT and in their own deterministic jitter, never
    # by inventing a third height the vocabulary does not have
    ("tuft-2",       lambda: build_tuft("2", 2, 2.6), TUFT_ROLES),
    ("tuft-3a",      lambda: build_tuft("3a", 3, 3.4), TUFT_ROLES),
    ("tuft-3b",      lambda: build_tuft("3b", 3, 3.4), TUFT_ROLES),
    ("tuft-4",       lambda: build_tuft("4", 4, 3.4), TUFT_ROLES),
    ("shrub-a",      lambda: build_shrub("a"), SHRUB_ROLES),
    ("shrub-b",      lambda: build_shrub("b"), SHRUB_ROLES),
    ("wilt-twig",    lambda: build_wilt("twig"), WILT_ROLES),
    ("wilt-stem",    lambda: build_wilt("stem"), WILT_ROLES),
    ("flower-proven",  lambda: build_flower("proven"), BLOOM_ROLES),
    ("flower-pending", lambda: build_flower("pending"), BUD_ROLES),
    ("flower-failing", lambda: build_flower("failing"), BLOOM_ROLES),
]

# ---------------------------------------------------------------- the authored tokens
#: EVERY token a decor role may resolve to, copied from `apps/studio/src/index.css` — the meadow
#: theme's `.parcel-flora.theme-meadow.st-<status>` blocks and the root `--flower-*` family. These
#: are the app's authored colours, not new ones: ADR-0367 D4 requires the render to pass through the
#: island's EXISTING palette, and the interior fork measured what an incomplete closure costs (an
#: `unknown` rim silently repainted `healthy` green across 2564 px, at exit 0).
#:
#: Written into `render-meta.json` so the compositor closes its palette over exactly this set rather
#: than over a second copy that could drift from it.
TOKEN_FAMILIES = {
    # grass blades, by status class
    "blade": {
        "healthy":   {"bladeFront": "#71a154", "bladeBack": "#436b32"},
        "building":  {"bladeFront": "#71a154", "bladeBack": "#436b32"},
        "mapped":    {"bladeFront": "#9fa88f", "bladeBack": "#7d886c"},
        "proposed":  {"bladeFront": "#9fa88f", "bladeBack": "#7d886c"},
        "unknown":   {"bladeFront": "#b0afa2", "bladeBack": "#8f8e7c"},
        "unhealthy": {"bladeFront": "#ab8c54", "bladeBack": "#87693b"},
    },
    "shrub": {
        "healthy":   {"crown": "#89b56b", "under": "#4f7a3e"},
        "building":  {"crown": "#eccb6d", "under": "#cc9f3c"},
        "mapped":    {"crown": "#89b56b", "under": "#4f7a3e"},
        "proposed":  {"crown": "#89b56b", "under": "#4f7a3e"},
        "unknown":   {"crown": "#89b56b", "under": "#4f7a3e"},
        "unhealthy": {"crown": "#a08355", "under": "#7a5f3a"},
    },
    "wilt": {
        "unhealthy": {"stem": "#7c5b40", "fleck": "#9f2d22"},
    },
    # the UAT flower — one value set, no per-status redefinition: the verdict is carried by FORM and
    # by which family renders, never by recolouring the same form (ADR-0226 D4)
    "flower": {
        "proven":  {"stem": "#6f9257", "leaf": "#7ea363", "petal": "#fbf3e0", "centre": "#eab94e"},
        "pending": {"stem": "#6f9257", "leaf": "#7ea363", "bud": "#7f9d5c"},
        "failing": {"stem": "#6f9257", "leaf": "#7ea363", "petal": "#b9b3a7", "centre": "#8f8672"},
    },
}


def _own_code_state():
    """THE code state of this render: this file's own source digest, per the convention landed by
    `provenance.py`. The compositor reads it back and refuses to draw pieces whose declarations
    disagree."""
    path = os.path.abspath(__file__)
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 16), b""):
            h.update(block)
    return {"generator": os.path.basename(path), "sha256": h.hexdigest()}


os.makedirs(OUT, exist_ok=True)
ONLY = arg("--only", "all")
names = []
for name, build, roles in PIECES:
    if ONLY != "all" and name not in ONLY.split(","):
        continue
    new_scene()
    build()
    render(os.path.join(OUT, f"{name}.png"))
    names.append(name)
    print(f"{name} rendered  roles={sorted({r for r, _s in roles.values()})}", flush=True)

meta = {
    "generator": "blender_grass.py",
    # THE TWO LEVERS, written down so a picture can never be composed from two configurations
    # without the composer being able to see it. `compose_grass.py` asserts the tag it was asked for
    # matches what the directory declares — the ADR-0367 D1 mismatch, caught mechanically.
    "grassNormalMix": GRASS_NORMAL_MIX,
    "grassGeometry": GRASS_GEOMETRY,
    "grassNormalRule": (
        f"blade shading normals blended {GRASS_NORMAL_MIX:g} of the way toward a SHARED analytic "
        f"dome fitted to this tuft's own blade envelope (centre at its ground contact). "
        f"0.0 is an exact no-op. NOT inherited from the crown's 0.22 — a 4200 px crown and a 30 px "
        f"tuft are different instruments; see grass-report.json normalSweep."
        if GRASS_NORMAL_MIX > 0 else
        "off — every blade keeps its own normals; this is exactly the vendored pass's tuft"),
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
                       "GROUND CONTACT POINT sits at the canvas centre, so a decor piece pastes at "
                       "its placement's projected point by the SAME rule as a land piece"},
    "lightDir": list(LIGHT_DIR),
    "lightRuleSource": "the hero tree's own key direction — land, object and ground cover share one",
    "bandTriples": BAND,
    "pieceNames": names,
    # each piece declares the SUBSET of triples it emits and what each one means
    "pieceRoles": {name: {k: list(v) for k, v in roles.items()}
                   for name, _b, roles in PIECES if name in names},
    "tokenFamilies": TOKEN_FAMILIES,
    "headBillboard": {
        "rotationRad": head_rotation(),
        "why": "a flower head left in the ground plane reads as a lid, not a face — the 'horizontal "
               "head' the owner rejected on the baked uat-flower asset (2026-07-22). Derived from "
               "the island's camera so it stays face-on at any authored angle.",
    },
    "vocabularySource": "ADR-0226 D2/D3/D4 — grass = a capability's tests, dead grass = the status "
                        "wilt, a flower = the story's UAT and only UAT with the verdict read from "
                        "form. No member is added to that vocabulary by this render.",
}
with open(os.path.join(OUT, "render-meta.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("DONE decor pieces ->", OUT, flush=True)
