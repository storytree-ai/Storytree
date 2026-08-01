"""Final measurement pass over the delivered frames.

Reports, per rung: opaque pixels; how many came from the mature pose unchanged (ABLATED) vs from
the model (GENERATED, rungs 0-2 only); how many of the ablated ones differ in RGB from the mature
pose at the same coordinate (must be 0); pixels lost to the next rung (monotonicity); the
alpha-weighted bottom root anchor; encoded bytes.
"""
import sys
import glob
import json
import os
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from imglib import bottom_anchor

T = 8
MATURE = "raw/mature-b-d6aec8de-0941-4ec5-9789-af54e22aa0db-00.png"
mat = np.array(Image.open(MATURE).convert("RGBA"))
mm = mat[:, :, 3] >= T

frames = sorted(glob.glob("frames/frame-*.png"))
abl = [np.array(Image.open(f"work/ablated/ablated-{i:02d}.png").convert("RGBA"))[:, :, 3] >= T
       for i in range(len(frames))]

rows = []
prev = None
for i, f in enumerate(frames):
    a = np.array(Image.open(f).convert("RGBA"))
    k = a[:, :, 3] >= T
    ablated = k & abl[i]
    generated = k & ~abl[i]
    same = ablated & mm
    diff = int((a[:, :, :3][same] != mat[:, :, :3][same]).any(axis=1).sum())
    lost = int((prev & ~k).sum()) if prev is not None else 0
    ys, xs = np.where(k)
    anc = bottom_anchor(f, T, 3)
    rows.append({
        "frame": i,
        "opaque": int(k.sum()),
        "ablatedPx": int(ablated.sum()),
        "generatedPx": int(generated.sum()),
        "ablatedPxDifferingFromMature": diff,
        "lostFromPrevious": lost,
        "lostPctOfPrevious": round(100 * lost / prev.sum(), 1) if prev is not None else 0.0,
        "alphaBounds": {"x": int(xs.min()), "y": int(ys.min()),
                        "w": int(xs.max() - xs.min() + 1), "h": int(ys.max() - ys.min() + 1)},
        "rootAnchor": {"x": anc[0], "y": anc[1]},
        "encodedBytes": os.path.getsize(f),
    })
    prev = k

tot = sum(r["opaque"] for r in rows)
gen = sum(r["generatedPx"] for r in rows)
summary = {
    "canvas": "192x192 RGBA8, fixed",
    "frameCount": len(rows),
    "rootAnchor": rows[0]["rootAnchor"],
    "rootAnchorDriftPx": {
        "x": max(r["rootAnchor"]["x"] for r in rows) - min(r["rootAnchor"]["x"] for r in rows),
        "y": max(r["rootAnchor"]["y"] for r in rows) - min(r["rootAnchor"]["y"] for r in rows),
    },
    "opaquePxTotal": tot,
    "ablatedPxTotal": tot - gen,
    "ablatedPctOfTrack": round(100 * (tot - gen) / tot, 1),
    "generatedPxTotal": gen,
    "generatedPctOfTrack": round(100 * gen / tot, 1),
    "ablatedPxDifferingFromMature": sum(r["ablatedPxDifferingFromMature"] for r in rows),
    "pixelsLostBetweenConsecutiveFrames": sum(r["lostFromPrevious"] for r in rows),
    "encodedBytesTotal": sum(r["encodedBytes"] for r in rows),
    "decodedRgbaBytes": 192 * 192 * 4 * len(rows),
    "contactSheetBytes": os.path.getsize("contact-sheet.png"),
    "previewGifBytes": os.path.getsize("preview.gif"),
}
report = {"summary": summary, "frames": rows}
with open("registration.json", "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=1)
print(json.dumps(summary, indent=1))
print()
hdr = f'{"f":>2} {"opaque":>7} {"ablated":>8} {"gen":>5} {"differ":>7} {"lost":>6} {"lost%":>6}  {"bounds x,y,w,h":<20} {"anchor":>10} {"bytes":>6}'
print(hdr)
for r in rows:
    b = r["alphaBounds"]
    print(f'{r["frame"]:>2} {r["opaque"]:>7} {r["ablatedPx"]:>8} {r["generatedPx"]:>5} '
          f'{r["ablatedPxDifferingFromMature"]:>7} {r["lostFromPrevious"]:>6} {r["lostPctOfPrevious"]:>6} '
          f'  {b["x"]},{b["y"]},{b["w"]},{b["h"]:<12} {r["rootAnchor"]["x"]},{r["rootAnchor"]["y"]:>6} {r["encodedBytes"]:>6}')
