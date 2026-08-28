import bpy, sys, os, json
argv = sys.argv[sys.argv.index("--")+1:]
OUTDIR = argv[0]
KEEP = set(argv[1].split(","))

missing = KEEP - {o.name for o in bpy.data.objects}
if missing:
    raise SystemExit("MISSING OBJECTS: %s" % sorted(missing))

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
        if w > px or h > px: img.scale(min(w, px), min(h, px))
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

for px in (512, 256, 128):
    emit(f"dressing-webp90-{px}", px)

print("###JSON###")
print(json.dumps(runs))
