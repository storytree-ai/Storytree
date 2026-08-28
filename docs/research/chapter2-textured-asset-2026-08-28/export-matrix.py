import bpy, sys, os, json
argv = sys.argv[sys.argv.index("--")+1:]
OUTDIR = argv[0]
KEEP = set(argv[1].split(","))

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
def emit(tag, fmt, quality):
    path = os.path.join(OUTDIR, f"pine-{tag}.glb")
    kw = dict(filepath=path, export_format='GLB', export_image_format=fmt,
              export_yup=True, export_apply=True, export_materials='EXPORT',
              use_selection=False, export_cameras=False, export_lights=False,
              export_extras=False, export_animations=False)
    if fmt in ('WEBP','JPEG'):
        kw['export_image_quality'] = quality
    bpy.ops.export_scene.gltf(**kw)
    sizes = {i.name: list(i.size) for i in bpy.data.images if i.name in used}
    runs.append({"tag": tag, "format": fmt, "quality": quality, "bytes": os.path.getsize(path),
                 "path": path, "imageSizes": sizes})
    print(f">>> {tag} {fmt} q{quality} -> {os.path.getsize(path)} bytes", flush=True)

for px in (2048, 1024, 512, 256, 128):
    for img in list(bpy.data.images):
        if img.name not in used: continue
        w, h = img.size
        if w > px or h > px:
            img.scale(min(w, px), min(h, px))
    emit(f"png-{px}", 'AUTO', 100)
    emit(f"webp90-{px}", 'WEBP', 90)
    emit(f"webp75-{px}", 'WEBP', 75)

print("###JSON###")
print(json.dumps({"used": sorted(used), "runs": runs}))
