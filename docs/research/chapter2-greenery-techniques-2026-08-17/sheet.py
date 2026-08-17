#!/usr/bin/env python3
"""THE COMPARISON SHEET — every candidate's DELIVERED mark, at 14x, beside the two baselines.

    python sheet.py

Drawn at the delivered resolution and upscaled by nearest neighbour, so every block on the sheet is
one pixel the island would actually receive. That is the whole point: at 84 px every candidate here
looks like grass, and the sheet exists to show what is left at 28.

DRAWN ON AN OPAQUE BACKDROP, never on transparency — the arc's `sheet.py` refuses to draw on
transparency because a judgment made against a checkerboard is a judgment about the checkerboard.

REAL COLOURS, NOT KEY COLOURS. The pieces render in K0/K1/K2 primaries which the compositor
substitutes per capability status. The sheet performs that substitution with the `healthy` blade
tokens so the marks appear as they would on a healthy island — and it does it through the SAME
`pieceRoles` map the compositor reads, rather than by picking two greens that look right.
"""
import hashlib
import json
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
GRASS = os.path.join(REPO, "docs", "research", "chapter2-grass-reads-as-signal-2026-08-16")
SPECIES_DIR = os.path.join(REPO, "docs", "research",
                           "chapter2-high-frequency-options-2026-08-17", "pieces-species")
MINE = os.path.join(HERE, "pieces-greenery")

META = json.load(open(os.path.join(MINE, "render-meta.json")))
REPORT = json.load(open(os.path.join(HERE, "greenery-report.json")))
SS = int(META["supersample"])
#: 14x, not 6x. The marks are 2-9 delivered px across, so a small zoom puts the appearance call on a
#: shape a few dozen screen pixels wide and the panels read as mostly empty. The zoom is the sheet's
#: own legibility, not a property of the art.
ZOOM = 14
BAND = {k: tuple(v) for k, v in META["bandTriples"].items()}
FAM = META["tokenFamilies"]
ROLES = {k: tuple(v) for k, v in META["pieceRoles"][META["pieceNames"][1]].items()}

BG = (30, 34, 40)
PANEL = (44, 49, 56)
INK = (226, 230, 236)
DIM = (150, 158, 168)
WARN = (232, 168, 96)
GOOD = (150, 205, 130)


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def real_colour(key):
    """K-key -> the delivered colour on a HEALTHY island, through the piece's own role map."""
    role, shade = ROLES[key]
    base = hex_rgb(FAM["blade"]["healthy"][role])
    return tuple(int(round(c * shade)) for c in base)


KEYMAP = {BAND[k]: real_colour(k) for k in ROLES}


def delivered_raster(path):
    """The piece as the island would receive it: majority alpha vote, then the MODAL key colour among
    that block's opaque pixels, then the token substitution. One function so the sheet cannot show a
    different mark than `measure.py` counted."""
    im = np.array(Image.open(path).convert("RGBA"))
    a, rgb = im[:, :, 3], im[:, :, :3]
    h, w = a.shape
    dh, dw = h // SS, w // SS
    op = a > 110.0
    blocks = op.reshape(dh, SS, dw, SS).transpose(0, 2, 1, 3).reshape(dh, dw, SS * SS)
    solid = blocks.sum(axis=2) >= 5
    cols = rgb.reshape(dh, SS, dw, SS, 3).transpose(0, 2, 1, 3, 4).reshape(dh, dw, SS * SS, 3)
    out = np.zeros((dh, dw, 4), dtype=np.uint8)
    keys = list(KEYMAP.keys())
    for y in range(dh):
        for x in range(dw):
            if not solid[y, x]:
                continue
            opaque = blocks[y, x]
            if not opaque.any():
                continue
            #: Nearest KEY for each opaque sample, then a vote — Cycles antialiases the key
            #: primaries at strand edges, so an exact-match lookup would drop every edge sample.
            samp = cols[y, x][opaque]
            d = np.stack([((samp.astype(np.int32) - np.array(k)) ** 2).sum(axis=1) for k in keys])
            votes = np.argmin(d, axis=0)
            win = keys[int(np.bincount(votes, minlength=len(keys)).argmax())]
            out[y, x, :3] = KEYMAP[win]
            out[y, x, 3] = 255
    return out


def crop_to_mark(r, pad=1):
    ys, xs = np.nonzero(r[:, :, 3])
    if not len(ys):
        return np.zeros((3, 3, 4), dtype=np.uint8)
    y0, y1 = max(0, ys.min() - pad), min(r.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(r.shape[1], xs.max() + 1 + pad)
    return r[y0:y1, x0:x1]


#: WHAT GOES ON THE SHEET, and the order is the ARGUMENT: the three hair regimes first (invisible,
#: blob, debris), then the two other techniques, then the control, then the baselines it is all
#: measured against.
CELLS = [
    ("hair-tutorial", MINE, "1. HAIR at tutorial scale",
     "strand 0.02 units = 1/150 of a delivered px", WARN),
    ("hair-clumped", MINE, "2. HAIR dense + clumped",
     "the tutorial grass look: strands + children", WARN),
    ("hair-sparse", MINE, "3. HAIR sparse, thick",
     "the only setting where gaps survive", WARN),
    ("hair-domesized", MINE, "4. HAIR, footprint-matched",
     "sized to the species dome's own box", WARN),
    ("geonodes-1px", MINE, "5. GEOMETRY NODES scatter",
     "blade instances on a surface field", WARN),
    ("card-authored", MINE, "6. CONTROL: authored bitmap",
     "authored AT delivered resolution", DIM),
    ("tuft-3a", os.path.join(GRASS, "pieces-m00-blade"), "7. the WITHDRAWN long grass",
     "what the owner rejected 3x", WARN),
    ("tuft-3a", SPECIES_DIR, "8. the SPECIES dome (#1389)",
     "hand-modelled lobes, shipped candidate", GOOD),
    ("shrub-a", SPECIES_DIR, "9. the SHRUB (already shipped)",
     "the existing bigger mark", GOOD),
]

MARKS = []
for name, d, title, sub, col in CELLS:
    r = delivered_raster(os.path.join(d, name + ".png"))
    MARKS.append((name, d, title, sub, col, crop_to_mark(r), int(np.count_nonzero(r[:, :, 3]))))

CW, CH = 236, 250
COLS = 5
ROWS = (len(MARKS) + COLS - 1) // COLS
HEAD, FOOT = 104, 138
W = COLS * CW + 24
H = HEAD + ROWS * CH + FOOT

img = Image.new("RGB", (W, H), BG)
dr = ImageDraw.Draw(img)


def text(xy, s, fill=INK):
    dr.text(xy, s, fill=fill)


text((12, 10), "GREENERY TECHNIQUES AT THE DELIVERED PIXEL - stage 1, pieces only, no island")
text((12, 26), "Every block is ONE pixel the island would receive. At 84 px all of these look like "
               "grass; this is what is left at 28.", DIM)
text((12, 42), "ONE GROUND UNIT = ONE DELIVERED PIXEL. Blender's default hair radius_scale of 0.01 "
               "is 1/150th of a delivered pixel wide.", DIM)
text((12, 58), "SURVIVAL = delivered px as a share of raw opaque blocks. Over 100% means the "
               "majority vote is FILLING gaps - the signature of a mass, not a strand.", DIM)
text((12, 74), f"camera {META['camera']['elevationDeg']:.0f} deg (research track's named parameter) "
               f"- LAND_CAMERA_ELEVATION_DEG is still 20 and is NOT touched", WARN)
text((12, 90), "NOT OWNER-ATTESTED. This sheet has no standing to make an appearance verdict "
               "(ADR-0070 stage 2); an honest 'none of these helped' is accepted (ADR-0280 D4).", DIM)

for i, (name, d, title, sub, col, mark, px) in enumerate(MARKS):
    cx = 12 + (i % COLS) * CW
    cy = HEAD + (i // COLS) * CH
    dr.rectangle([cx, cy, cx + CW - 12, cy + CH - 14], fill=PANEL)
    text((cx + 8, cy + 8), title, col)
    text((cx + 8, cy + 24), sub, DIM)

    mh, mw = mark.shape[:2]
    up = np.repeat(np.repeat(mark, ZOOM, axis=0), ZOOM, axis=1)
    tile = Image.fromarray(up, "RGBA")
    #: The mark is pasted onto the PANEL, so a transparent delivered pixel reads as the panel rather
    #: than as a hole punched to the page background.
    box_x = cx + (CW - 12 - mw * ZOOM) // 2
    #: Centred in the space between the caption and the statistics block, so a tall mark and a flat
    #: one sit on the same optical baseline and their HEIGHTS stay comparable by eye.
    box_y = cy + 46 + max(0, ((CH - 14 - 46 - 80) - mh * ZOOM) // 2)
    img.paste(tile.convert("RGB"), (box_x, box_y), tile.split()[3])

    c = REPORT["candidates"].get(name) if d == MINE else None
    if c is None:
        src = ("pieces-m00-blade (the WITHDRAWN long grass)" if "m00-blade" in d
               else "pieces-species (PR #1389)")
        c = REPORT["baselines"][src][name]
    y = cy + CH - 74
    text((cx + 8, y), f"delivered {c['deliveredPx']} px   box {c['bboxW']}x{c['bboxH']}")
    text((cx + 8, y + 15), f"raw {c['rawOpaquePx']} px   survival {c['survivalPctOfBlocks']:.0f}%",
         DIM)
    if c["deliveredPx"] == 0:
        text((cx + 8, y + 30), "DELIVERS NOTHING AT ALL", WARN)
    elif c["survivalPctOfBlocks"] < 85:
        text((cx + 8, y + 30), "the vote DESTROYS its structure", WARN)
    else:
        text((cx + 8, y + 30), "the vote FILLS it into a mass", DIM)

fy = HEAD + ROWS * CH + 4
text((12, fy), "WHAT STAGE 1 MEASURED")
text((12, fy + 18),
     "HAIR HAS THREE REGIMES AND NONE OF THEM IS GRASS. At tutorial scale it delivers ZERO RAW "
     "PIXELS - the strand is thinner than the render's own pixel grid.", DIM)
text((12, fy + 33),
     "Thick and dense enough to see, it delivers a near-solid blob (survival ~100%: the vote closes "
     "every gap). Sparse enough for gaps to survive, it delivers DEBRIS", DIM)
text((12, fy + 48),
     "- scattered single pixels and an empty row, which is the same failure the owner already "
     "rejected in the long grass.", DIM)
text((12, fy + 66),
     "AT MATCHED FOOTPRINT HAIR LOSES TO THE HAND-MODELLED DOME: 15 px with a hole in it against "
     "18 px solid. The earlier 'hair delivers more' reading was SIZE, not technique.", DIM)
text((12, fy + 84),
     "AND THE WITHDRAWN LONG GRASS IS THE ONLY THING IN THE SET THAT LOSES TO THE DOWNSAMPLE - "
     "blade tufts survive at 43-79%, everything else at 94-116%.", DIM)
text((12, fy + 99),
     "That is the owner's 'looks buggy / ugly and cheap' with a precise pipeline cause: it is the "
     "one piece whose structure is finer than the majority vote.", DIM)
text((12, fy + 117),
     "Geometry nodes land in the same blob regime (survival 104-108%). The control shows even an "
     "authored bitmap is not a perfect identity: 20 authored -> 24 delivered, because the", DIM)
text((12, fy + 132),
     "billboard is not snapped to the delivered grid - so the ceiling drawn here is slightly "
     "generous to itself.", DIM)

out = os.path.join(HERE, "greenery-techniques.png")
img.save(out)


def _sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


#: THE SIDECAR (#1350's mechanism). A fork picture rendered either side of an edit silently compares
#: two variables, so the code state that DREW this picture is recorded beside it. All three scripts,
#: because a sheet is a function of the renderer, the measurer and the drawer together — and
#: `verify.py` re-hashes them and fails if any moved after the picture was written.
prov = {
    "picture": os.path.basename(out),
    "size": list(img.size),
    "zoom": ZOOM,
    "deliveredResolution": True,
    "codeStates": {n: _sha256(os.path.join(HERE, n))
                   for n in ("blender_greenery.py", "measure.py", "sheet.py")},
    "renderMeta": {"blender": META["blender"], "samples": META["samples"], "seed": META["seed"],
                   "engine": META["engine"], "curveShape": META["curveShape"],
                   "cameraElevationDeg": META["camera"]["elevationDeg"]},
    "pieceSets": {
        "candidates": os.path.relpath(MINE, REPO).replace("\\", "/"),
        "baselineBlade": "docs/research/chapter2-grass-reads-as-signal-2026-08-16/pieces-m00-blade",
        "baselineSpecies": ("docs/research/chapter2-high-frequency-options-2026-08-17/"
                            "pieces-species"),
    },
    "rule": ("delivered resolution, nearest-neighbour upscale, opaque backdrop, real `healthy` blade "
             "tokens substituted through the piece's own pieceRoles map"),
    "notOwnerAttested": ("ADR-0070 stage 2 — this sheet carries no appearance verdict; ADR-0280 D4 "
                         "makes an honest 'none of these helped' an accepted outcome"),
}
with open(out + ".provenance.json", "w") as fh:
    json.dump(prov, fh, indent=1)
print("wrote", out, img.size, "+ provenance sidecar")
