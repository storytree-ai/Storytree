"""Assemble the delivered track: normalise, measure, contact-sheet, GIF.

The ladder is AUTHORED mature -> seedling (each rung is the previous rung minus its periphery)
and DELIVERED seedling -> mature, i.e. reversed for playback.
"""
import sys
import json
import os
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from imglib import sheet, save_gif, bottom_anchor, alpha_bounds

ALPHA_T = 8


def normalise(src, dst):
    a = np.array(Image.open(src).convert("RGBA"))
    t = a[:, :, 3] < ALPHA_T
    a[:, :, 3][t] = 0
    a[:, :, :3][t] = 0
    Image.fromarray(a, "RGBA").save(dst, optimize=True)
    return dst


def main(sources, outdir="frames"):
    os.makedirs(outdir, exist_ok=True)
    frames = []
    for i, src in enumerate(sources):
        dst = f"{outdir}/frame-{i:02d}.png"
        normalise(src, dst)
        frames.append(dst)
    rows = []
    for i, f in enumerate(frames):
        size, bb = alpha_bounds(f, ALPHA_T)
        anc = bottom_anchor(f, ALPHA_T, 3)
        a = np.array(Image.open(f).convert("RGBA"))
        rows.append({
            "frame": i,
            "source": sources[i],
            "canvas": list(size),
            "alphaBounds": {"x": bb[0], "y": bb[1], "w": bb[2] - bb[0], "h": bb[3] - bb[1]},
            "opaquePx": int((a[:, :, 3] >= ALPHA_T).sum()),
            "rootAnchor": {"x": anc[0], "y": anc[1]},
            "encodedBytes": os.path.getsize(f),
        })
    ax = [r["rootAnchor"]["x"] for r in rows]
    ay = [r["rootAnchor"]["y"] for r in rows]
    report = {
        "canvas": rows[0]["canvas"],
        "frameCount": len(rows),
        "rootAnchor": {"x": ax[0], "y": ay[0]},
        "rootAnchorDriftPx": {"x": max(ax) - min(ax), "y": max(ay) - min(ay)},
        "encodedBytesTotal": sum(r["encodedBytes"] for r in rows),
        "decodedRgbaBytes": 192 * 192 * 4 * len(rows),
        "frames": rows,
    }
    sheet(frames, 3, scale=2).save("contact-sheet.png")
    hold = [340] * len(frames)
    hold[-1] = 1100
    hold[0] = 700
    gif_bytes = save_gif(frames, "preview.gif", scale=3, durations=hold)
    report["contactSheetBytes"] = os.path.getsize("contact-sheet.png")
    report["previewGifBytes"] = gif_bytes
    with open("registration.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != "frames"}, indent=1))
    for r in rows:
        print(r["frame"], r["alphaBounds"], "anchor", r["rootAnchor"], "px", r["opaquePx"], "bytes", r["encodedBytes"])


if __name__ == "__main__":
    main(sys.argv[1:])
