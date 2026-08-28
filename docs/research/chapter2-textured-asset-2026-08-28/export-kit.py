import bpy, sys, os, json
argv = sys.argv[sys.argv.index("--")+1:]
OUTDIR = argv[0]
runs = []

def used_images():
    u = set()
    for o in bpy.data.objects:
        if o.type != 'MESH': continue
        for m in o.data.materials:
            if m and m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image: u.add(n.image.name)
    return u

def emit(tag, px):
    for img in list(bpy.data.images):
        w, h = img.size
        if w > px or h > px: img.scale(min(w, px), min(h, px))
    path = os.path.join(OUTDIR, f"{tag}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='WEBP',
        export_image_quality=90, export_yup=True, export_apply=True, export_materials='EXPORT',
        use_selection=False, export_cameras=False, export_lights=False, export_extras=False,
        export_animations=False)
    n_objs = len([o for o in bpy.data.objects if o.type=='MESH'])
    tris = 0
    for o in bpy.data.objects:
        if o.type=='MESH': tris += sum(max(0,len(p.vertices)-2) for p in o.data.polygons)
    runs.append({"tag": tag, "px": px, "bytes": os.path.getsize(path), "objects": n_objs,
                 "tris": tris, "materials": len({m.name for o in bpy.data.objects if o.type=='MESH' for m in o.data.materials if m}),
                 "images": len(used_images())})
    print(f">>> {tag} px={px} objs={n_objs} tris={tris} -> {os.path.getsize(path)}", flush=True)

for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

emit("kit-all-webp90-512", 512)
emit("kit-all-webp90-256", 256)

# now cut down to Pine_Trees only, and re-export at 512 from the already-256 images?  No:
# sizes are destructive, so the trees arm is reported at 256 only.
for o in list(bpy.data.objects):
    if 'Pine_Trees' not in [c.name for c in o.users_collection]:
        bpy.data.objects.remove(o, do_unlink=True)
for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
emit("kit-trees-webp90-256", 256)

print("###JSON###")
print(json.dumps(runs))
