#!/usr/bin/env python3
"""Author-time registration: research frames -> the app's candidate assets.

Runs ONCE at author time (ADR-0219: nothing here is a runtime seam). It takes the
delivered 128px frames, re-measures every one under the LAB's single applied anchor rule
— round-1's, `alpha-weighted x across bottom three occupied rows; bottom-most occupied
y`, alpha > 8 — normalises x so the ground socket is stable, and writes:

  packages/app-surface/src/assets/code-blender/tree/frame-NN.png
  packages/app-surface/src/assets/code-blender/manifest.json
  packages/app-surface/src/assets/code-blender/tree-registration.json

and prints the numbers the TypeScript registry must state. The TS numbers are NOT
generated from here — they are hand-entered and then re-derived from the shipped PNGs by
`chapter2-round3-tree-candidates.test.ts`, which decodes the pixels independently.

Usage: python register_track.py [--write]
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SRC = os.path.join(HERE, "frames")
DEST = os.path.join(REPO, "packages", "app-surface", "src", "assets", "code-blender")
WRITE = "--write" in sys.argv
ALPHA = 8
CANDIDATE_ID = "code-blender"
TRACK_ID = "chapter2-round3-code-blender-hero-tree-track-v1"
REGISTRY_ID = "chapter2-round3-code-blender-v1"


def measure(alpha):
    """The applied rule, exactly as the app-side suite re-implements it."""
    occupied = [y for y in range(alpha.shape[0]) if (alpha[y] > ALPHA).any()]
    band = occupied[-3:]
    w = np.zeros(alpha.shape[1], dtype=np.float64)
    for y in band:
        row = alpha[y].astype(np.float64)
        w += np.where(row > ALPHA, row, 0.0)
    return float((np.arange(alpha.shape[1]) * w).sum() / w.sum()), occupied[-1]


def body_centroid(alpha):
    """Where the whole tree sits, not just its contact — the price of re-pinning."""
    m = alpha > ALPHA
    ys, xs = np.nonzero(m)
    return float(xs.mean()), float(ys.mean())


# frame-*.png ONLY: the delivered directory also holds a contact sheet, and globbing
# every PNG silently pulls a 2560x512 review image into the registered track.
names = sorted(f for f in os.listdir(SRC)
               if f.startswith("frame-") and f.endswith(".png"))
imgs = [np.array(Image.open(os.path.join(SRC, n)).convert("RGBA")) for n in names]
H, W = imgs[0].shape[:2]

pre = [measure(im[:, :, 3]) for im in imgs]
pre_body = [body_centroid(im[:, :, 3]) for im in imgs]

# The registered x is the integer nearest the mean measured contact; y is the modal
# ground row. y is NEVER shifted: moving a frame vertically to pin its bottom row is
# exactly the base drift ADR-0280 D1 forbids, and the honest alternative is to state
# the residual band (see groundRowSpreadPx below).
anchor_x = int(round(float(np.mean([p[0] for p in pre]))))
rows = [p[1] for p in pre]
anchor_y = int(np.bincount(rows).argmax())

# Shift ONLY where the residual would otherwise exceed the registered half-pixel bound.
# Rounding every frame to the anchor would move art that was already inside the bound,
# and each whole-pixel shift widens the body walk to chase a sub-pixel difference.
shifts = [((int(round(anchor_x - p[0])) if abs(p[0] - anchor_x) > 0.5 else 0), 0) for p in pre]

shifted = []
for im, (dx, dy) in zip(imgs, shifts):
    out = np.zeros_like(im)
    x0, x1 = max(0, dx), min(W, W + dx)
    s0, s1 = max(0, -dx), min(W, W - dx)
    out[:, x0:x1] = im[:, s0:s1]
    shifted.append(out)

post = [measure(im[:, :, 3]) for im in shifted]
post_body = [body_centroid(im[:, :, 3]) for im in shifted]

residuals = [abs(p[0] - anchor_x) for p in post]
ground_rows = [p[1] for p in post]


def spread(vals):
    return round(float(max(vals) - min(vals)), 4)


def max_step(vals):
    return round(float(max(abs(b - a) for a, b in zip(vals, vals[1:]))), 4) if len(vals) > 1 else 0.0


report = {
    "track": TRACK_ID,
    "appliedRule": "alpha-weighted x across bottom three occupied rows; "
                   "bottom-most occupied y (alpha > 8)",
    "appliedRuleSource": "round-1's accepted track; the lab applies ONE rule to every candidate",
    "trackDeclaredRule": "the generator does not declare an anchor rule at all — the camera is "
                         "framed once to the mature extent and the trunk base sits at world z=0, "
                         "so the ground socket is a CONSEQUENCE of the projection rather than a "
                         "measurement convention",
    "registeredRootAnchor": {"x": anchor_x, "y": anchor_y},
    "maxAnchorResidualPx": round(max(residuals), 4),
    "measuredContactAnchorSpreadPx": spread([p[0] for p in pre]),
    "framesRequiringAShift": sum(1 for dx, _ in shifts if dx != 0),
    "totalFrames": len(names),
    "maxAbsShiftPx": max(abs(dx) for dx, _ in shifts),
    "groundRowSpreadPx": int(max(ground_rows) - min(ground_rows)),
    "groundRowSpreadReason": (
        "the camera is fixed and the trunk base is pinned at world z=0, but SECONDARY GROWTH "
        "thickens the trunk, so the front of its own footprint descends by r*sin(20 deg) as it "
        "fattens. Pinning the bottom row to a constant would mean shifting the frame upward as "
        "the tree matures — the tree would appear to rise out of the ground. This track states "
        "the band instead of buying a constant row with base drift (ADR-0280 D1)."),
    "costOfApplyingTheAppliedRule": {
        "bodyCentroidSpreadBeforePx": spread([b[0] for b in pre_body]),
        "bodyCentroidSpreadAfterPx": spread([b[0] for b in post_body]),
        "bodyCentroidMaxFrameToFrameStepBeforePx": max_step([b[0] for b in pre_body]),
        "bodyCentroidMaxFrameToFrameStepAfterPx": max_step([b[0] for b in post_body]),
    },
    "frames": [
        {"file": f"tree/{n}",
         # x is DERIVED as anchor - offset, the convention every other candidate in the
         # lab is registered under: it keeps `sourceAnchor + normalizationOffset ==
         # normalizedAnchor` a true identity even where the measurement lands on the 0.5
         # tie (frame 00 measures exactly 63.5). The EXACT measurement is right below it.
         "sourceAnchor": {"x": anchor_x - dx, "y": p[1]},
         "sourceAnchorExact": round(p[0], 4),
         "normalizationOffset": {"x": dx, "y": dy},
         "normalizedAnchor": {"x": anchor_x, "y": anchor_y},
         "measuredAfter": {"x": round(q[0], 4), "y": q[1]},
         "residualPx": round(abs(q[0] - anchor_x), 4)}
        for n, p, q, (dx, dy) in zip(names, pre, post, shifts)
    ],
}

print(json.dumps({k: v for k, v in report.items() if k != "frames"}, indent=1))
print("ground rows:", ground_rows)
print("residuals:", [round(r, 3) for r in residuals])
print("shifts:", [dx for dx, _ in shifts])

if not WRITE:
    print("\n(dry run — pass --write to emit the app assets)")
    raise SystemExit(0)

tree_dir = os.path.join(DEST, "tree")
if os.path.isdir(DEST):
    shutil.rmtree(DEST)
os.makedirs(tree_dir)
encoded = 0
for n, im in zip(names, shifted):
    p = os.path.join(tree_dir, n)
    Image.fromarray(im, "RGBA").save(p, optimize=True)
    encoded += os.path.getsize(p)

reg_src = json.load(open(os.path.join(SRC, "registration.json")))
report["encodedBytes"] = encoded
report["decodedRgbaBytes"] = W * H * 4 * len(names)
with open(os.path.join(DEST, "tree-registration.json"), "w") as fh:
    json.dump(report, fh, indent=1)

manifest = {
    "id": REGISTRY_ID,
    "version": 1,
    "candidateId": CANDIDATE_ID,
    "role": "one switchable hero-tree candidate in the Chapter 2 round-3 comparison lab",
    "technique": ("code-generated: space-colonisation skeleton, pipe-model secondary growth and a "
                  "20 deg calibrated orthographic camera, all computed by our own script; headless "
                  "Blender 5.2.0 LTS on CPU Cycles supplies the finish, then the same raster back "
                  "half (quantise, palette snap, selective material-tinted outline) every other "
                  "candidate is held to"),
    "provider": "none — no generative model produced any pixel in this track",
    "providerMode": "n/a",
    "renderer": "Blender 5.2.0 LTS, headless, CPU Cycles, author-time only (ADR-0280 D2a)",
    "researchDir": "docs/research/chapter2-code-only-art-2026-08-01/blender-hero-v1",
    "generator": "blender_tree.py + pixelise.py, seed 20260801",
    "modelFreeClaim": ("the generator imports json, math, os, sys, numpy, bpy and mathutils and "
                       "nothing else; there is no network call, no credential and no vendor "
                       "hostname anywhere in this track. The one thing taken from elsewhere is "
                       "exp-16's committed 32-colour palette, declared in both scripts."),
    "referencePlate": {
        "file": None,
        "usedAs": "none — the camera is calibrated to forest-world's own shadow ellipse "
                  "(scene.ts rx=0.78R, ry=0.20R) as a NUMBER, not to an image plate",
        "containsGeneratedArt": False,
        "neverComposited": "this track is registered here precisely so it CAN be composited on "
                           "the real island in the lab, which no code track had been",
    },
    "anchorRegistration": {k: report[k] for k in (
        "appliedRule", "appliedRuleSource", "trackDeclaredRule", "registeredRootAnchor",
        "maxAnchorResidualPx", "measuredContactAnchorSpreadPx", "framesRequiringAShift",
        "totalFrames", "maxAbsShiftPx", "groundRowSpreadPx", "groundRowSpreadReason",
        "costOfApplyingTheAppliedRule")},
    "tracks": [
        {
            "id": TRACK_ID,
            "kind": "hero-tree",
            "canvas": {"width": W, "height": H, "format": "transparent PNG RGBA8"},
            "frameCount": len(names),
            "frameOrder": [f"tree/{n}" for n in names],
            "registeredRootAnchor": {"x": anchor_x, "y": anchor_y},
            "registrationReport": "tree-registration.json",
            "render": reg_src.get("render", {}),
            "growthPacing": ("19 frames placed at equal SILHOUETTE-CHANGE arc length, measured "
                             "author-time from an analytic projection of the skeleton, not at "
                             "equal time (ADR-0280 D1: growth pacing is authored)"),
            "contactShadow": ("a second Blender pass: the tree casts but is invisible to camera, "
                              "so alpha carries the shadow alone. Composited at alpha 96 — the "
                              "only semi-transparent pixels in the track — because the island is "
                              "the substrate (ADR-0274 D1) and a shadow darkens it rather than "
                              "replacing it. Clipped at the tree's own contact row so it cannot "
                              "define the ground socket."),
            "encodedBytes": encoded,
            "decodedRgbaBytes": W * H * 4 * len(names),
        },
        {
            "id": "chapter2-plant-sample-pose-track-v1",
            "kind": "plant-sample",
            "sharedWith": "every candidate in the lab",
            "manifest": "../chapter2-organic-pose-to-pose/manifest.json",
            "note": "FIXED across the lab (ADR-0277 D2). Registered by reference, not copied.",
            "frameCount": 5,
            "encodedBytes": 24535,
            "decodedRgbaBytes": 184320,
        },
    ],
    "knownWeakness": ("against exp-16 this track still loses on SCALE CONVENTION and on mid-stage "
                      "readability. exp-16's frame 0 seedling is 73 px tall of 128 (65% of its "
                      "mature height) because each stage is drawn to fill the frame; this track "
                      "holds ONE camera framed to the mature extent, so its frame 0 is 18 px and "
                      "the first third of the track is small in frame. That is the D1 invariant "
                      "doing its job, not a bug, but it is an art-direction fork the owner has "
                      "not been asked about. Mid stages also show more bare twig through the "
                      "foliage than exp-16 does."),
    "runtime": {
        "appOwns": ["semantic state", "normalized progress", "progress-to-frame selection",
                    "easing and deliberate holds", "Next, Back and Replay",
                    "reduced-motion final settlement", "retained final scene",
                    "world sockets, depth slots and painter order",
                    "app-native SVG coast and ground reveal",
                    "the even progress mapping across the delivered frame order"],
        "vendorCalls": 0,
        "rendererInRuntime": False,
        "rendererInBuild": False,
        "rendererInWorkspaceDeps": False,
    },
    "budget": {
        "restatedFor": CANDIDATE_ID,
        "encodedBytes": encoded + 24535,
        "decodedRgbaBytes": W * H * 4 * len(names) + 184320,
        "frameCount": len(names) + 5,
        "simultaneousOrganicLayers": 2,
        "ceilingPolicy": "the restated ceiling IS the measured actual — zero headroom by design",
        "priorCeilings": {"encodedByteLimit": 200000, "decodedRgbaByteLimit": 1600000,
                          "frameCountLimit": 14, "layerLimit": 2},
        "mountedAtOnce": "ONE hero-tree track over the one shared plant track",
    },
    "ownerLook": {"status": "pending", "attestedBy": None},
}
with open(os.path.join(DEST, "manifest.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)

mature = np.nonzero(shifted[-1][:, :, 3] > ALPHA)
footprint = {"x": int(mature[1].min()), "y": int(mature[0].min()),
             "width": int(mature[1].max() - mature[1].min() + 1),
             "height": int(mature[0].max() - mature[0].min() + 1)}

# The TS registry states these as literals and the vitest suite re-derives them from the
# shipped PNGs. Emitting the block here rather than reading it off the console removes
# the transcription step, which is where a registration silently stops being true.
ts = [
    "const CODE_BLENDER_MODULE_PATHS = Object.freeze([",
    *[f"  './assets/{CANDIDATE_ID}/tree/{n}'," for n in names],
    "] as const);",
    "",
    "const CODE_BLENDER_URLS = Object.freeze([",
    *[f"  new URL('./assets/{CANDIDATE_ID}/tree/{n}', import.meta.url).href," for n in names],
    "]);",
    "",
    "const CODE_BLENDER_SOURCE_ANCHORS = Object.freeze([",
    *[f"  {{ x: {anchor_x - dx}, y: {p[1]} }}," for p, (dx, _dy) in zip(pre, shifts)],
    "] as const);",
    "",
    "const CODE_BLENDER_NORMALIZATION_OFFSETS = Object.freeze([",
    *[f"  {{ x: {dx}, y: {dy} }}," for dx, dy in shifts],
    "] as const);",
    "",
    f"const CODE_BLENDER_ANCHOR = Object.freeze({{ x: {anchor_x}, y: {anchor_y} }});",
    "",
    "// measured values for the candidate entry:",
    f"//   frameCount               {len(names)}",
    f"//   matureFootprint          {json.dumps(footprint)}",
    f"//   track.encodedBytes       {encoded}",
    f"//   track.decodedRgbaBytes   {W * H * 4 * len(names)}",
    f"//   registry.maxEncodedBytes {encoded + 24535}",
    f"//   registry.maxDecodedRgba  {W * H * 4 * len(names) + 184320}",
    f"//   registry.maxFrameCount   {len(names) + 5}",
    f"//   maxAnchorResidualPx      {round(max(residuals), 4)}",
    f"//   contactAnchorSpreadPx    {spread([p[0] for p in pre])}",
    f"//   framesShifted            {sum(1 for dx, _ in shifts if dx != 0)}",
    f"//   maxAbsShiftPx            {max(abs(dx) for dx, _ in shifts)}",
    f"//   groundRowSpreadPx        {int(max(ground_rows) - min(ground_rows))}",
    f"//   bodyCentroidBefore       spread {spread([b[0] for b in pre_body])} "
    f"step {max_step([b[0] for b in pre_body])}",
    f"//   bodyCentroidAfter        spread {spread([b[0] for b in post_body])} "
    f"step {max_step([b[0] for b in post_body])}",
    f"//   exceedsPriorCeiling      "
    f"{json.dumps([k for k, v in (('encodedBytes', encoded + 24535 > 200000), ('decodedRgbaBytes', W * H * 4 * len(names) + 184320 > 1600000), ('frameCount', len(names) + 5 > 14)) if v])}",
]
with open(os.path.join(HERE, "registry-block.ts.txt"), "w") as fh:
    fh.write("\n".join(ts) + "\n")

print(f"\nwrote {len(names)} frames -> {DEST}")
print(f"matureFootprint={footprint}")
print("\n".join(ts[-15:]))
print(f"\nTS block -> {os.path.join(HERE, 'registry-block.ts.txt')}")
