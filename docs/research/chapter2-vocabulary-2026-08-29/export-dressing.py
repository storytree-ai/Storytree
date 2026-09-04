# export-dressing.py — re-export the committed dressing asset for the SETTLED vocabulary.
#
# It is PR #1693's own script with two changes, and both are consequences of the owner's
# 2026-08-29 answer rather than improvements to the export:
#
#   1. The KEEP set is smaller. Rocks and logs are WITHDRAWN (pocketed, not deleted — they come
#      back the moment drift and retired-contract have a signal to carry), and the undergrowth
#      is gone because a capability now grows ONE object whatever its state. Restoring any of
#      them is one edit to the KEEP argument.
#   2. It emits ONE texture rung — the pack's NATIVE 2048-texel maps, untouched.
#      ⚠ OVERTAKEN 2026-09-04 (ADR-0508 D1, owner-directed 2026-09-03): until that landing this
#      emitted a 128-texel rung, chosen in PR #1693 §3a by a pixels-moved measurement taken at
#      the OLD overview zoom — at most 0.06% of the frame moved between 512 and 128 there. The
#      owner put texture resolution outside that rule ("i dont think we should downsample as long
#      as the browser can handle it … we have zoom enabled on our map"), so the map is looked at
#      at 8 px/unit and closer, where a 128-texel needle map on a ~70 px crown is under one texel
#      per delivered pixel. Pass a rung as the OPTIONAL third argument only to reproduce the old
#      export for a comparison arm (the 128 rung reproduces byte-for-byte, sha256 6aaab1fa…).
#      What the browser pays for the native rung is measured on the increment that landed it
#      (`docs/research/chapter2-tree-detail-2026-09-04/`), never argued.
#
# It also PRINTS EVERY KEPT OBJECT'S WORLD-SPACE BOUNDS. The kit models a pine's trunk and its
# needles as separate co-located objects, and PR #1693 found that pairing two that belong to
# different trees renders a perfectly plausible tree — nothing about the picture says so. The
# bounds are what say so, so they are emitted with the asset rather than looked up once.
#
# Run:
#   blender -b "<kit>/Pine_Forest_Kit.blend" -P export-dressing.py -- <outdir> <keep,csv> [<texels>]
#
#   <texels> omitted → the native maps (what ships). A number → that rung, for a comparison arm.

import bpy, sys, os, json

argv = sys.argv[sys.argv.index("--")+1:]
OUTDIR = argv[0]
KEEP = set(argv[1].split(","))
RUNG = int(argv[2]) if len(argv) > 2 else None

missing = KEEP - {o.name for o in bpy.data.objects}
if missing:
    raise SystemExit("MISSING OBJECTS: %s" % sorted(missing))

# World-space bounds BEFORE anything is removed, so a pairing can be checked against the layout
# the kit itself authored.
bounds = {}
for o in bpy.data.objects:
    if o.name not in KEEP or o.type != 'MESH':
        continue
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    if not pts:
        continue
    bounds[o.name] = {
        "min": [min(p[i] for p in pts) for i in range(3)],
        "max": [max(p[i] for p in pts) for i in range(3)],
        "centre": [(min(p[i] for p in pts) + max(p[i] for p in pts)) / 2 for i in range(3)],
    }

for o in list(bpy.data.objects):
    if o.name not in KEEP:
        bpy.data.objects.remove(o, do_unlink=True)

used = set()
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for m in o.data.materials:
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    used.add(n.image.name)

for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

runs = []
def emit(tag, px):
    for img in list(bpy.data.images):
        if img.name not in used: continue
        w, h = img.size
        if px is not None and (w > px or h > px): img.scale(min(w, px), min(h, px))
    path = os.path.join(OUTDIR, f"{tag}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='WEBP',
        export_image_quality=90, export_yup=True, export_apply=True, export_materials='EXPORT',
        use_selection=False, export_cameras=False, export_lights=False, export_extras=False,
        export_animations=False)
    tris = sum(sum(max(0,len(p.vertices)-2) for p in o.data.polygons) for o in bpy.data.objects if o.type=='MESH')
    runs.append({"tag": tag, "px": px, "bytes": os.path.getsize(path),
                 "objects": len([o for o in bpy.data.objects if o.type=='MESH']), "tris": tris,
                 "materials": sorted({m.name for o in bpy.data.objects if o.type=='MESH' for m in o.data.materials if m}),
                 "images": sorted(used),
                 "imageSizes": {i.name: list(i.size) for i in bpy.data.images if i.name in used}})
    print(f">>> {tag} px={px} -> {os.path.getsize(path)}", flush=True)

emit("dressing-webp90-native" if RUNG is None else f"dressing-webp90-{RUNG}", RUNG)

print("###JSON###")
print(json.dumps({"runs": runs, "bounds": bounds}))
