#!/usr/bin/env python3
"""What the camera costs the TREE, isolated from the land — and measured, not only looked at.

    python tree_camera_read.py     # -> tree-camera-read.png + the table below

The sweep sheet answers "does the LAND read better higher up", and it plainly does. This answers
the question that trades against it: the hero tree's 19 frames carry a signed owner ceiling verdict
given in the 20-degree projection, and raising the camera looks further DOWN on the tree — more
crown top, less trunk and limb silhouette. That is the actual cost of a bird's-eye land, so it gets
its own picture at 4x with nothing else in the frame.

NOTHING IS RE-TUNED. The crown-normals mix, the canopy constants and the cel bands are all
untouched and camera-independent; every frame here is the same mature tree (u = 1.0, 352 skeleton
nodes, 19 lobes) seen from a different height. The seven accepted gaps in the track README were
measured in the 20-degree projection and will read differently higher up — that is re-MEASUREMENT,
which is what this file is, and not re-authoring.

THE MEASURE IS A STATED PROXY, NOT A PALETTE CLASSIFICATION. Bark is counted as pixels with
R > G + 12 and foliage as G >= R, over opaque non-shadow pixels. The track's own bark/foliage split
lives in `pixelise.py`'s palette families; this is coarser on purpose, because the claim it has to
support is only directional ("how much of the tree reads as woody structure") and a proxy that can
be checked by eye against the picture beside it is worth more here than one that cannot.
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SWEEP = json.load(open(os.path.join(HERE, "sweep-report.json")))
MATURE = SWEEP["matureFrame"]
ZOOM, PAD, HDR, CAP = 4, 10, 40, 62

cells, rows = [], []
for row in SWEEP["angles"]:
    tag, deg = row["tag"], row["elevationDeg"]
    d = os.path.join(HERE, f"tree-{tag}", "frames")
    reg = json.load(open(os.path.join(d, "registration.json")))
    im = np.array(Image.open(os.path.join(d, f"frame-{MATURE:02d}.png")).convert("RGBA"))
    rgb, a = im[:, :, :3].astype(int), im[:, :, 3]

    # the contact shadow is composited at a low alpha; the tree itself is opaque
    tree = a > 200
    ys, xs = np.nonzero(tree)
    bbox_h = int(ys.max() - ys.min() + 1)
    bbox_w = int(xs.max() - xs.min() + 1)
    bark = tree & (rgb[:, :, 0] > rgb[:, :, 1] + 12)
    foliage = tree & (rgb[:, :, 1] >= rgb[:, :, 0])
    # the trunk's own reach: how many rows below the lowest foliage pixel carry bark. This is the
    # "standing on a visible stem" read that a high camera eats first.
    fol_rows = np.nonzero(foliage.any(axis=1))[0]
    bark_rows = np.nonzero(bark.any(axis=1))[0]
    clear_stem = int(bark_rows.max() - fol_rows.max()) if len(fol_rows) and len(bark_rows) else 0

    rows.append({
        "elevationDeg": deg, "bboxHeightPx": bbox_h, "bboxWidthPx": bbox_w,
        "treePx": int(tree.sum()), "barkPx": int(bark.sum()), "foliagePx": int(foliage.sum()),
        "barkShare": round(float(bark.sum()) / max(1, int(tree.sum())), 4),
        "clearStemRowsBelowCanopy": clear_stem,
        "aspect": round(bbox_h / max(1, bbox_w), 3),
        "recordedCameraDeg": float(reg["camera_elevation_deg"]),
    })
    cells.append((tag, deg, im))

BOARD = (43, 49, 56)
h, w = cells[0][2].shape[:2]
CW, CH = w * ZOOM, h * ZOOM
sheet = Image.new("RGB", (PAD + len(cells) * (CW + PAD), HDR + CH + CAP), (24, 24, 26))
dr = ImageDraw.Draw(sheet)
dr.text((PAD, 7), "THE COST SIDE — the SAME mature tree (u=1.0, 352 nodes, 19 lobes) at each "
                  "camera, 4x, nothing re-tuned", fill=(232, 232, 232))
dr.text((PAD, 22), "raising the camera looks further DOWN the tree: crown top grows, trunk and limb "
                   "silhouette shrink. upright height carries cos(theta).", fill=(150, 150, 156))

for i, (tag, deg, im) in enumerate(cells):
    a = im[:, :, 3:4].astype(np.float32) / 255.0
    flat = (im[:, :, :3].astype(np.float32) * a
            + np.array(BOARD, dtype=np.float32) * (1 - a)).astype(np.uint8)
    x = PAD + i * (CW + PAD)
    sheet.paste(Image.fromarray(flat, "RGB").resize((CW, CH), Image.NEAREST), (x, HDR))
    r = rows[i]
    dr.text((x + 3, HDR + CH + 5), f"{deg:g}°" + ("  ← CURRENT (signed)" if tag == "20" else ""),
            fill=(255, 236, 160))
    dr.text((x + 3, HDR + CH + 20), f"height {r['bboxHeightPx']}px  aspect {r['aspect']:.2f}",
            fill=(168, 168, 174))
    dr.text((x + 3, HDR + CH + 34), f"bark {r['barkShare'] * 100:.1f}% of tree px",
            fill=(168, 168, 174))
    dr.text((x + 3, HDR + CH + 48), f"clear stem {r['clearStemRowsBelowCanopy']} rows",
            fill=(168, 168, 174))

out = os.path.join(HERE, "tree-camera-read.png")
sheet.save(out)
with open(os.path.join(HERE, "tree-camera-read.json"), "w") as fh:
    json.dump({"proxyRule": "bark: R > G + 12; foliage: G >= R; over alpha > 200",
               "matureFrame": MATURE, "angles": rows}, fh, indent=1)

print(f"{'deg':>8}  {'height':>6} {'width':>6} {'aspect':>6}  {'bark%':>6}  {'stem':>4}  treePx")
for r in rows:
    print(f"{r['elevationDeg']:>8}  {r['bboxHeightPx']:>6} {r['bboxWidthPx']:>6} "
          f"{r['aspect']:>6.3f}  {r['barkShare'] * 100:>5.1f}%  {r['clearStemRowsBelowCanopy']:>4}  "
          f"{r['treePx']}")
print("wrote tree-camera-read.png", sheet.size)
