#!/usr/bin/env python3
"""THE PICTURE — where the plants actually stand, before and after.

    python picture.py            # ~20 s -> plants-dispersed.png

THIS IS A PLACEMENT DIAGRAM, NOT A RENDER, and the distinction is load-bearing rather than modest.
It stamps no Blender-rendered piece, decodes no band keys, maps no tokens and snaps to no palette;
it draws the coast, the cell boundaries and a glyph per plant. Three copies of a ~700-line
compositor already exist on this track and nothing detects the fork — this is deliberately not a
fourth, and it must never grow into one. What it can honestly show is DISPERSION, which is a
property of the ground points and survives every downstream stage; what it cannot show is
delivery, occlusion, colour or size, all of which belong to the compositor.

The camera is the research track's 50 degrees, applied as the same `y * sin(50)` the compositor
uses, so the foreshortening a reader judges spacing under is the one the composites have.
`LAND_CAMERA_ELEVATION_DEG` in the app stays 20 and is not touched by this pass.

The hero tree is NOT drawn. It occludes cells in the real composite, and a diagram that hid a
third of its own evidence behind a canopy would be worse than one that states the omission: the
11-unit keep-out it stands in is drawn as a ring instead, because that IS part of the placement
rule.
"""
import collections
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import dispersion as D          # noqa: E402
import disperse as X            # noqa: E402

S = X.S
ELEVATION_DEG = 50.0
SIN = math.sin(math.radians(ELEVATION_DEG))
SS = 3                                   # supersample, downsampled at the end

INK = (232, 236, 240)
DIM = (128, 138, 150)
BG = (26, 32, 40)
PANEL = (33, 40, 50)
LAND = (108, 132, 86)
LAND_EDGE = (150, 170, 120)
SAND = (206, 196, 160)
CELL = (92, 114, 74)
BAD = (226, 122, 96)
GOOD = (126, 200, 140)
PLANT_D = (48, 92, 58)
PLANT_L = (122, 176, 108)

ISLAND = json.load(open(os.path.join(
    REPO, "docs", "research", "chapter2-healthy-island-2026-08-16", "island.json")))
CELLS = ISLAND["variantB"]["cells"]
COAST = ISLAND["coastLoopGround"]
CX, CY = ISLAND["islandCentreGround"]
for c in CELLS:
    c["_h"] = 0.0
ISLAND["_radius"] = sum(math.hypot(p[0] - CX, p[1] - CY) for p in COAST) / len(COAST)
SEED = ISLAND["seed"]
UAT = [{"id": f"uat-{i}", "state": s} for i, s in
       enumerate(["proven", "proven", "pending", "failing", "proven", "pending"])]


class _T(dict):
    def __missing__(self, k):
        return {}


TOKENS = {"blade": _T(), "shrub": _T(), "wilt": _T(), "flower": _T()}

# The BEFORE panel is the legacy branch by name — `scatter_island`'s default has been the fix
# since 2026-08-18, so a bare call would draw two identical panels captioned as a comparison.
before = [it for it in S.scatter_island(ISLAND, TOKENS, SEED, UAT, 1.0,
                                        positioner=S.LEGACY_AFFINE)[0]
          if it["kind"] != "flower"]
after = [it for it in X.scatter_dispersed(ISLAND, TOKENS, SEED, UAT, 1.0)[0] if it["kind"] != "flower"]


def try_font(size, bold=False):
    for n in (("seguisb.ttf", "segoeui.ttf") if bold else ("segoeui.ttf",)) + ("arial.ttf",):
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


F_TITLE = try_font(15 * SS, True)
F_HEAD = try_font(12 * SS, True)
F_BODY = try_font(10 * SS)
F_SMALL = try_font(9 * SS)


class View:
    """Ground -> panel pixels at the declared camera, fitted to a box."""

    def __init__(self, box, pts, pad=14):
        self.x0, self.y0, self.w, self.h = box
        px = [p[0] for p in pts]
        py = [p[1] * SIN for p in pts]
        gw = max(px) - min(px)
        gh = max(py) - min(py)
        self.k = min((self.w - 2 * pad * SS) / gw, (self.h - 2 * pad * SS) / gh)
        self.ox = self.x0 + (self.w - gw * self.k) / 2 - min(px) * self.k
        self.oy = self.y0 + (self.h - gh * self.k) / 2 - min(py) * self.k

    def __call__(self, gx, gy):
        return self.ox + gx * self.k, self.oy + gy * SIN * self.k


def shrub(dr, x, y, k):
    """The app's own shrub silhouette (`scene.ts` ~1812): three dark under-lobes, two light crown
    lobes. Drawn at the true ground footprint so overlaps in the picture are overlaps in fact."""
    for lx, ly, lr in ((-2.3, 0.9, 1.9), (2.1, 1.1, 2.0), (0.2, -0.6, 2.5)):
        dr.ellipse([x + (lx - lr) * k, y + (ly - lr * 0.78) * k * SIN,
                    x + (lx + lr) * k, y + (ly + lr * 0.78) * k * SIN], fill=PLANT_D)
    for lx, ly, rx, ry in ((-1.3, -1.2, 1.9, 1.35), (0.9, -0.9, 1.3, 0.95)):
        dr.ellipse([x + (lx - rx) * k, y + (ly - ry) * k * SIN,
                    x + (lx + rx) * k, y + (ly + ry) * k * SIN], fill=PLANT_L)


def draw_island(dr, view, items, cells=True, glyph=True):
    dr.polygon([view(*p) for p in COAST], fill=SAND, outline=None)
    inner = [(CX + (p[0] - CX) * 0.955, CY + (p[1] - CY) * 0.955) for p in COAST]
    dr.polygon([view(*p) for p in inner], fill=LAND, outline=LAND_EDGE, width=max(1, SS // 2))
    if cells:
        for c in CELLS:
            dr.polygon([view(*p) for p in c["poly"]], outline=CELL, width=max(1, SS // 3))
    # the tree well - a placement rule, drawn because the hero tree that occupies it is not
    r = S.GRASS_WELL
    a, b = view(CX - r, CY - r), view(CX + r, CY + r)
    dr.ellipse([a[0], a[1], b[0], b[1]], outline=(150, 130, 105), width=max(1, SS // 2))
    for it in sorted(items, key=lambda i: i["g"][1]):
        x, y = view(*it["g"])
        if glyph:
            shrub(dr, x, y, view.k)
        else:
            dr.ellipse([x - 1.6 * SS, y - 1.6 * SS, x + 1.6 * SS, y + 1.6 * SS], fill=PLANT_L)


# --------------------------------------------------------------------------- layout
W, H = 1580, 1100
img = Image.new("RGB", (W * SS, H * SS), BG)
dr = ImageDraw.Draw(img)

dr.text((22 * SS, 16 * SS),
        "WHERE THE PLANTS STAND — the same count rules, the same 11 parcels, positioned two ways",
        font=F_TITLE, fill=INK)
dr.text((22 * SS, 38 * SS),
        f"island `context-traversal-capture` (162 mesh cells, 11 capabilities, all healthy) · "
        f"camera 50° · placement diagram, not a Cycles render · "
        f"{len(before)} plants before, {len(after)} after — the count rules asked for "
        f"{len(after)} both times and the old sampler dropped one into the tree well",
        font=F_SMALL, fill=DIM)

PW, PH = 700, 560
TOP = 66
for col, (label, items, tone) in enumerate((
        ("BEFORE — every plant on its cell's diagonal", before, BAD),
        ("AFTER — the two coordinates drawn independently, then spread", after, GOOD))):
    bx = (22 + col * (PW + 18)) * SS
    dr.rectangle([bx, TOP * SS, bx + PW * SS, (TOP + PH) * SS], fill=PANEL)
    dr.text((bx + 12 * SS, (TOP + 8) * SS), label, font=F_HEAD, fill=tone)
    v = View((bx, (TOP + 30) * SS, PW * SS, (PH - 40) * SS), COAST)
    draw_island(dr, v, items)

# ---- the zoom: capabilities 3 and 5, where the collapse is unmistakable
ZY = TOP + PH + 16
ZH = 300
ZW = 400
zoom_ids = [i for i, c in enumerate(CELLS) if c["cap"] in (3, 5)]
zoom_pts = [p for i in zoom_ids for p in CELLS[i]["poly"]]
for col, (label, items, tone) in enumerate((
        ("BEFORE", before, BAD), ("AFTER", after, GOOD))):
    bx = (22 + col * (ZW + 18)) * SS
    dr.rectangle([bx, ZY * SS, bx + ZW * SS, (ZY + ZH) * SS], fill=PANEL)
    dr.text((bx + 12 * SS, (ZY + 8) * SS),
            f"{label} — capabilities 3 and 5, magnified", font=F_HEAD, fill=tone)
    v = View((bx, (ZY + 28) * SS, ZW * SS, (ZH - 38) * SS), zoom_pts)
    for i in zoom_ids:
        dr.polygon([v(*p) for p in CELLS[i]["poly"]], fill=LAND, outline=LAND_EDGE,
                   width=max(1, SS // 2))
    for it in sorted((i for i in items if i["cap"] in (3, 5)), key=lambda i: i["g"][1]):
        shrub(dr, *v(*it["g"]), v.k)

# ---- the density chart
CX0 = (22 + 2 * (ZW + 18)) * SS
CW = W - 22 - 2 * (ZW + 18) - 22
dr.rectangle([CX0, ZY * SS, CX0 + CW * SS, (ZY + ZH) * SS], fill=PANEL)
dr.text((CX0 + 12 * SS, (ZY + 8) * SS), "PLANTS PER UNIT GROUND, BY DISTANCE FROM THE COAST",
        font=F_HEAD, fill=INK)
dr.text((CX0 + 12 * SS, (ZY + 26) * SS),
        "the fix barely moves it — this gradient is the COUNT rule, not the positioner",
        font=F_SMALL, fill=DIM)

# Averaged over 40 seeds, not taken from the delivered one: the innermost bin holds 11 cells, so a
# single draw of it swings by a third and would make the two bars say whatever the seed felt like.
CHART_SEEDS = [f"probe-{i}" for i in range(40)]
areas = [D.polygon_area(c["poly"]) for c in CELLS]
cdist = [D.coast_distance(c["c"][0], c["c"][1], COAST) for c in CELLS]
BINS = [0, 12, 20, 28, 36, 100]


def _bin(d):
    for b in range(5):
        if BINS[b] <= d < BINS[b + 1]:
            return b
    return 4


abin = [0.0] * 5
for i in range(len(CELLS)):
    abin[_bin(cdist[i])] += areas[i]
series = []
for fn in (lambda s: S.scatter_island(ISLAND, TOKENS, s, UAT, 1.0,
                                      positioner=S.LEGACY_AFFINE)[0],
           lambda s: X.scatter_dispersed(ISLAND, TOKENS, s, UAT, 1.0)[0]):
    cb = [0] * 5
    for s in CHART_SEEDS:
        for it in fn(s):
            if it["kind"] != "flower":
                # binned by the placement's CELL, matching the per-cell denominator - see
                # `dispersion.measure` on why mixing the two framings invents a gradient
                cb[_bin(cdist[it["cell"]])] += 1
    series.append([cb[b] / abin[b] * 1000 / len(CHART_SEEDS) if abin[b] else 0 for b in range(5)])
peak = max(max(s) for s in series) * 1.15
gx0, gy0 = CX0 + 46 * SS, (ZY + 52) * SS
gw, gh = CW * SS - 66 * SS, (ZH - 96) * SS
dr.line([gx0, gy0, gx0, gy0 + gh], fill=DIM, width=max(1, SS // 2))
dr.line([gx0, gy0 + gh, gx0 + gw, gy0 + gh], fill=DIM, width=max(1, SS // 2))
bw = gw / 5
for b in range(5):
    for k, (s, tone) in enumerate(zip(series, (BAD, GOOD))):
        h = s[b] / peak * gh
        x = gx0 + b * bw + (6 + k * 15) * SS
        dr.rectangle([x, gy0 + gh - h, x + 13 * SS, gy0 + gh], fill=tone)
    lab = f"{BINS[b]}–{BINS[b+1] if b < 4 else '+'}"
    dr.text((gx0 + b * bw + 8 * SS, gy0 + gh + 5 * SS), lab, font=F_SMALL, fill=DIM)
dr.text((CX0 + 12 * SS, gy0 - 2 * SS), f"{peak:.0f}", font=F_SMALL, fill=DIM)
dr.text((CX0 + 12 * SS, gy0 + gh - 8 * SS), "0", font=F_SMALL, fill=DIM)
dr.text((gx0, gy0 + gh + 22 * SS), "ground units from the coast  →  interior",
        font=F_SMALL, fill=DIM)
dr.text((gx0, gy0 + gh + 38 * SS),
        f"rim / core = {series[0][0]/series[0][4]:.2f}× before, "
        f"{series[1][0]/series[1][4]:.2f}× after   (40 seeds)", font=F_BODY, fill=INK)

# ---- the caption strip
CY0 = ZY + ZH + 14
dr.rectangle([22 * SS, CY0 * SS, (W - 22) * SS, (CY0 + 128) * SS], fill=PANEL)
lines = [
    ("THE CLUMPING WAS A HASH BUG.", INK,
     "The sampler drew a plant's x from crc32(address+\"x\") and its y from crc32(address+\"y\"). "
     "CRC32 is linear, so two messages differing in one character always produce outputs differing "
     "by a FIXED value — here 0x01c26a37, whose top seven bits are zero."),
    ("So every plant landed on its cell's diagonal:", DIM,
     "the two coordinates agreed to within 1% on 83% of draws. Correlation +0.9997 where "
     "independent draws give 0.0000; 100% of plants within 2% of the diagonal against a 3.96% "
     "null. Capability 5 owns one cell — all eighteen of its plants stood on a single line."),
    ("THE EDGE DENSITY IS SOMETHING ELSE, and it is not a placement bug.", INK,
     "A parcel's plant count reads its capability's test count and ignores how much land it owns, "
     "so a small parcel is dense; small parcels sit near the coast (correlation between a "
     "capability's area and its distance from the shore, +0.62)."),
    ("The measurement that separates them:", DIM,
     "conditioning the gradient on capability collapses it from 2.28× to 0.93×, so it lives "
     "BETWEEN parcels and not inside them — and the fix leaves it at 3.03×→3.17×, because it "
     "changes no count. Whether a shrub budget should read land as well as tests is the owner's."),
    ("WHAT IS STILL DENSE, honestly:", INK,
     "capability 5 is budgeted 18 plants on 198 units of ground — 1.26× what that much land holds "
     "at a shrub's own footprint. No positioner can fix an over-planted parcel, and the clump at "
     "the lower right of the AFTER island is exactly that, reported rather than smoothed away."),
]
for i, (head, tone, body) in enumerate(lines):
    y = (CY0 + 10 + i * 22) * SS
    dr.text((34 * SS, y), head, font=F_HEAD, fill=tone)
    w = dr.textlength(head, font=F_HEAD)
    dr.text((34 * SS + w + 8 * SS, y + 1 * SS), body, font=F_SMALL, fill=DIM)

img = img.resize((W, H), Image.LANCZOS)
out = os.path.join(HERE, "plants-dispersed.png")
img.save(out)
print("wrote", out, img.size)


# --------------------------------------------------------------------------- provenance
def _sha(path):
    """SHA-256 of the file with line endings NORMALISED to LF.

    The track's existing sidecars hash raw bytes, and on this Windows checkout that makes
    `producer.sha256` unreproducible: a committed value is the CRLF hash of a file git stores as LF,
    so re-running an untouched script rewrites its own sidecar and dirties the tree for nothing.
    Normalising first makes the digest a property of the SOURCE rather than of the checkout's
    autocrlf setting. Recorded here rather than changed in the shared helper, because that helper is
    used by the hero track and this is one lane's opinion, not a defect in it.
    """
    import hashlib
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read().replace(b"\r\n", b"\n")).hexdigest()


prov = {
    "schema": "storytree/derived-evidence-provenance/1",
    "artifact": "plants-dispersed.png",
    "kind": "placement diagram - NOT a composite. No rendered piece is stamped, no band key is "
            "decoded, no token is mapped and no palette snap is applied, so this artifact makes no "
            "claim about delivery, colour or size - only about where the ground points are.",
    "producer": {"tool": "picture.py", "sha256": _sha(os.path.abspath(__file__)),
                 "digestNote": "line endings normalised to LF before hashing"},
    "command": {"tool": "picture.py", "argv": []},
    "camera": {"elevationDeg": ELEVATION_DEG,
               "note": "the research track's named parameter; the app's "
                       "LAND_CAMERA_ELEVATION_DEG stays 20 and is not touched by this pass"},
    "supersample": SS,
    "blenderRenders": 0,
    "renderedPiecesConsumed": 0,
    "inputs": [
        {"label": "island", "file": "../chapter2-healthy-island-2026-08-16/island.json",
         "sha256": _sha(os.path.join(REPO, "docs", "research",
                                     "chapter2-healthy-island-2026-08-16", "island.json"))},
        {"label": "count rules + original positioner",
         "file": "../chapter2-grass-reads-as-signal-2026-08-16/scatter.py",
         "sha256": _sha(X.SCATTER_PATH)},
        {"label": "fixed positioner", "file": "disperse.py",
         "sha256": _sha(os.path.join(HERE, "disperse.py"))},
        {"label": "instrument", "file": "dispersion.py",
         "sha256": _sha(os.path.join(HERE, "dispersion.py"))},
    ],
    "seed": SEED,
    "chartSeeds": len(CHART_SEEDS),
    "placements": {"before": len(before), "after": len(after)},
}
pout = out + ".provenance.json"
with open(pout, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(prov, fh, indent=2)
    fh.write("\n")
print("wrote", pout)
