"""Which Sapling preset contains a plausible JUVENILE?

A prefix reveal of a mature skeleton only reads as a young tree if the mature tree has
lateral structure LOW on its trunk. Measure, per preset:

  firstBranchFrac  height of the lowest lateral attachment, as a fraction of apex height
  massBelow50      fraction of all nodes sitting below half the apex height
  trunkSegs        how many bones the trunk itself is cut into

`firstBranchFrac` is the one that decides it: at 0.4 the tree is a bare pole for the
first 40% of its height, and no birth wave can rescue that.
"""
import re
import addon_utils
import bpy
import os

MOD = "bl_ext.blender_org.sapling_tree_gen"
import ast

bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable(MOD, default_set=False, persistent=True)
mod = __import__(MOD, fromlist=["*"])
PDIR = os.path.join(os.path.dirname(mod.__file__), "presets")


print(f"{'preset':<18}{'bones':>6}{'apexZ':>8}{'1stBr':>8}{'below50':>9}"
      f"{'trunkSegs':>10}{'levels':>7}{'baseSize':>9}")
rows = []
for f in sorted(os.listdir(PDIR)):
    if not f.endswith(".py"):
        continue
    name = f[:-3]
    body = "".join(l for l in open(os.path.join(PDIR, f), encoding="utf-8")
                   if not l.lstrip().startswith("#")).strip()
    raw = ast.literal_eval(body)
    kw = dict(raw)
    kw.update(do_update=True, useArm=True, showLeaves=False, seed=1)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable(MOD, default_set=False, persistent=True)
    try:
        while True:
            try:
                bpy.ops.curve.tree_add(**kw); break
            except TypeError as te:
                m = re.search(r'keyword "([^"]+)"', str(te))
                if not m or m.group(1) not in kw: raise
                kw.pop(m.group(1))
    except Exception as e:                      # a preset the operator rejects
        print(f"{name:<18}  FAILED {type(e).__name__}: {str(e)[:60]}")
        continue
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None:
        print(f"{name:<18}  no armature")
        continue
    bones = list(arm.data.bones)
    apex = max(b.tail_local.z for b in bones)
    # a lateral = a bone whose parent has another child before it (i.e. it branches off)
    trunk = [b for b in bones if b.parent is None or len(b.parent.children) == 1]
    laterals = [b for b in bones if b.parent is not None and len(b.parent.children) > 1]
    first = min((b.head_local.z for b in laterals), default=apex)
    below = sum(1 for b in bones if b.tail_local.z < apex * 0.5) / len(bones)
    # the trunk chain: follow the first child from the root
    root = next(b for b in bones if b.parent is None)
    segs, cur = 1, root
    while cur.children:
        cur = max(cur.children, key=lambda c: c.tail_local.z)
        segs += 1
        if segs > 400:
            break
    print(f"{name:<18}{len(bones):>6}{apex:>8.2f}{first / apex:>8.2f}{below:>9.2f}"
          f"{segs:>10}{raw.get('levels', '?'):>7}{raw.get('baseSize', 0):>9.2f}")
    rows.append((name, first / apex))

print()
print("BEST (lowest first branch):",
      ", ".join(f"{n}={v:.2f}" for n, v in sorted(rows, key=lambda r: r[1])[:4]))
