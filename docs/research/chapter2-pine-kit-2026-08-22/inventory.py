"""Inventory the Pine Forest Kit .blend: objects, polycounts, dimensions, materials, textures.

Run headless:  blender.exe -b <file.blend> -P inventory.py
Output is plain ASCII to stdout, JSON summary written beside the script.
"""

import json
import os
import sys

import bpy

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventory.json")


def tri_count(ob):
    """Evaluated triangle count (after modifiers), best effort."""
    try:
        me = ob.data
        return sum(max(len(p.vertices) - 2, 0) for p in me.polygons)
    except Exception:
        return -1


def main():
    scene = bpy.context.scene
    print("=" * 70)
    print("SCENE: %s   engine=%s" % (scene.name, scene.render.engine))
    print("resolution: %dx%d  samples-cycles=%s"
          % (scene.render.resolution_x, scene.render.resolution_y,
             getattr(scene.cycles, "samples", "n/a") if hasattr(scene, "cycles") else "n/a"))
    print("=" * 70)

    # --- Cycles compute devices actually available on this box ---
    print("\n--- CYCLES DEVICES ---")
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for dev_type in ("CUDA", "OPTIX", "HIP", "ONEAPI", "METAL"):
            try:
                prefs.compute_device_type = dev_type
                prefs.get_devices()
                names = [d.name for d in prefs.devices if d.type == dev_type]
                print("  %-8s : %s" % (dev_type, names if names else "none"))
            except Exception as exc:
                print("  %-8s : unsupported (%s)" % (dev_type, type(exc).__name__))
        prefs.compute_device_type = "NONE"
        prefs.get_devices()
        cpus = [d.name for d in prefs.devices if d.type == "CPU"]
        print("  CPU      : %s" % cpus)
    except Exception as exc:
        print("  cycles prefs unavailable: %r" % (exc,))

    # --- Collections ---
    print("\n--- COLLECTIONS ---")
    for coll in bpy.data.collections:
        direct = [o.name for o in coll.objects]
        print("  %-40s objects=%3d  children=%d"
              % (coll.name, len(direct), len(coll.children)))

    # --- Mesh objects ---
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print("\n--- MESH OBJECTS (%d) ---" % len(meshes))
    print("  %-44s %8s %26s" % ("name", "tris", "dims x,y,z (blender units)"))
    records = []
    for ob in sorted(meshes, key=lambda o: o.name.lower()):
        t = tri_count(ob)
        d = ob.dimensions
        mats = [m.name for m in ob.data.materials if m]
        print("  %-44s %8d   %7.2f %7.2f %7.2f"
              % (ob.name[:44], t, d.x, d.y, d.z))
        records.append({
            "name": ob.name,
            "tris": t,
            "dims": [round(d.x, 3), round(d.y, 3), round(d.z, 3)],
            "materials": mats,
            "collections": [c.name for c in ob.users_collection],
        })

    total_tris = sum(r["tris"] for r in records if r["tris"] > 0)
    print("\n  TOTAL TRIS (all objects, unmodified): %d" % total_tris)

    # --- Materials + images ---
    print("\n--- MATERIALS (%d) ---" % len(bpy.data.materials))
    for m in sorted(bpy.data.materials, key=lambda x: x.name.lower()):
        imgs = []
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    imgs.append("%s(%dx%d)" % (n.image.name, n.image.size[0], n.image.size[1]))
        print("  %-38s users=%d  images=%s" % (m.name[:38], m.users, imgs if imgs else "-"))

    print("\n--- IMAGES (%d) ---" % len(bpy.data.images))
    packed = 0
    for im in bpy.data.images:
        is_packed = im.packed_file is not None
        if is_packed:
            packed += 1
        print("  %-46s %5dx%-5d packed=%s" % (im.name[:46], im.size[0], im.size[1], is_packed))
    print("\n  packed images: %d / %d" % (packed, len(bpy.data.images)))

    # --- Other object types ---
    others = {}
    for o in bpy.data.objects:
        if o.type != "MESH":
            others.setdefault(o.type, []).append(o.name)
    if others:
        print("\n--- NON-MESH OBJECTS ---")
        for k, v in others.items():
            print("  %-12s %d  %s" % (k, len(v), v[:6]))

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "engine": scene.render.engine,
            "objects": records,
            "total_tris": total_tris,
            "materials": [m.name for m in bpy.data.materials],
            "images": [{"name": i.name, "w": i.size[0], "h": i.size[1],
                        "packed": i.packed_file is not None} for i in bpy.data.images],
            "collections": [{"name": c.name, "objects": [o.name for o in c.objects]}
                            for c in bpy.data.collections],
        }, fh, indent=2)
    print("\nwrote %s" % OUT)


main()
