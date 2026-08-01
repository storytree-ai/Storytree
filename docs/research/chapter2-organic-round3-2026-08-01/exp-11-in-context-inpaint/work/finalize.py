"""Build the deliverables: frames/, contact-sheet.png, preview.gif, measurement table."""
import json, os, sys, glob
from PIL import Image, ImageDraw
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
FRAMES = os.path.join(OUT, "frames")
CANVAS = (96, 128)
SOCKET = (47, 100)          # declared root socket in frame coords
PLATE_OFFSET = (52, 50)     # frame origin inside the 156x192 padded plate


def load_track(order):
    ims = []
    for k in order:
        p = os.path.join(HERE, f"cut-{k}.png")
        ims.append((k, Image.open(p).convert("RGBA")))
    return ims


def main(order):
    os.makedirs(FRAMES, exist_ok=True)
    for f in glob.glob(os.path.join(FRAMES, "*.png")):
        os.remove(f)
    track = load_track(order)
    rows = []
    for i, (k, im) in enumerate(track):
        assert im.size == CANVAS, im.size
        p = os.path.join(FRAMES, f"frame-{i:02d}.png")
        im.save(p, optimize=True)
        b = lib.alpha_bounds(im)
        a = lib.root_anchor(im)
        rows.append({
            "frame": f"frame-{i:02d}.png", "stage": f"s{k}",
            "alphaBounds": {"x0": b[0], "y0": b[1], "x1": b[2], "y1": b[3],
                            "w": b[2] - b[0] + 1, "h": b[3] - b[1] + 1},
            "rootAnchor": {"x": a[0], "y": a[1]},
            "anchorDeltaFromSocket": {"dx": a[0] - SOCKET[0], "dy": a[1] - SOCKET[1]},
            "opaquePx": sum(1 for y in range(im.height) for x in range(im.width) if im.load()[x, y][3] > 0),
            "encodedBytes": os.path.getsize(p),
        })
    xs = [r["rootAnchor"]["x"] for r in rows]; ys = [r["rootAnchor"]["y"] for r in rows]
    report = {
        "canvas": {"width": CANVAS[0], "height": CANVAS[1], "format": "transparent PNG RGBA8"},
        "frameCount": len(rows),
        "declaredRootSocket": {"x": SOCKET[0], "y": SOCKET[1]},
        "frameOriginInPlate": {"x": PLATE_OFFSET[0], "y": PLATE_OFFSET[1]},
        "anchorRule": "alpha-weighted x across the bottom three occupied rows; bottom-most occupied y (round-1 rule)",
        "rootDriftPx": {"x": max(xs) - min(xs), "y": max(ys) - min(ys)},
        "normalization": "NONE APPLIED - every frame was generated in the plate's own coordinate frame, so the track is registered by construction",
        "encodedBytes": sum(r["encodedBytes"] for r in rows),
        "decodedRgbaBytes": CANVAS[0] * CANVAS[1] * 4 * len(rows),
        "frames": rows,
    }
    json.dump(report, open(os.path.join(OUT, "registration.json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in report.items() if k != "frames"}, indent=1))
    for r in rows:
        print(r["frame"], r["stage"], r["alphaBounds"], r["rootAnchor"], r["anchorDeltaFromSocket"], r["encodedBytes"])

    # ---- contact sheet: checker cutout over plate composite, 2 rows -------------------
    plate = Image.open(os.path.join(HERE, "plate-pad.png")).convert("RGBA")
    scale = 3
    cols = len(track)
    tw, th = CANVAS[0] * scale, CANVAS[1] * scale
    lab = 13
    sheet = Image.new("RGB", (cols * (tw + 6) + 6, 2 * (th + lab + 6) + 6), (16, 16, 20))
    d = ImageDraw.Draw(sheet)
    for i, (k, im) in enumerate(track):
        ch = lib.checker(*CANVAS); ch.alpha_composite(im)
        comp = plate.copy(); comp.alpha_composite(im, PLATE_OFFSET)
        comp = comp.crop((PLATE_OFFSET[0], PLATE_OFFSET[1],
                          PLATE_OFFSET[0] + CANVAS[0], PLATE_OFFSET[1] + CANVAS[1]))
        x = 6 + i * (tw + 6)
        sheet.paste(ch.convert("RGB").resize((tw, th), Image.NEAREST), (x, 6))
        d.text((x + 2, 6 + th + 1), f"frame-{i:02d} (s{k})  cutout", fill=(200, 200, 210))
        y2 = 6 + th + lab + 6
        sheet.paste(comp.convert("RGB").resize((tw, th), Image.NEAREST), (x, y2))
        d.text((x + 2, y2 + th + 1), f"frame-{i:02d}  in plate", fill=(200, 200, 210))
    sheet.save(os.path.join(OUT, "contact-sheet.png"))
    print("contact-sheet", sheet.size)

    # ---- preview gif: dark field, 3x nearest, hold on the last frame -----------------
    # ONE global palette for the whole GIF: per-frame ADAPTIVE palettes are discarded by the
    # GIF writer (single global colour table), which shreds the colours.
    def write_gif(rgb_frames, path, durations):
        strip = Image.new("RGB", (rgb_frames[0].width * len(rgb_frames), rgb_frames[0].height))
        for i, f in enumerate(rgb_frames):
            strip.paste(f, (i * f.width, 0))
        master = strip.convert("P", palette=Image.ADAPTIVE, colors=255)
        pframes = [f.quantize(palette=master, dither=Image.NONE) for f in rgb_frames]
        pframes[0].save(path, save_all=True, append_images=pframes[1:],
                        duration=durations, loop=0, disposal=1)
        return os.path.getsize(path)

    gscale = 3
    field = Image.new("RGBA", (CANVAS[0] * gscale, CANVAS[1] * gscale), (24, 26, 30, 255))
    rgbs = []
    for _, im in track:
        f = field.copy()
        f.alpha_composite(im.resize((CANVAS[0] * gscale, CANVAS[1] * gscale), Image.NEAREST))
        rgbs.append(f.convert("RGB"))
    durations = [260] * len(rgbs)
    durations[-1] = 1200
    print("preview.gif", write_gif(rgbs, os.path.join(OUT, "preview.gif"), durations), "bytes")

    # ---- second gif: the same track sitting in the real plate ------------------------
    rgbs2 = []
    for _, im in track:
        c = plate.copy(); c.alpha_composite(im, PLATE_OFFSET)
        rgbs2.append(c.convert("RGB").resize((plate.width * 2, plate.height * 2), Image.NEAREST))
    print("preview-in-plate.gif",
          write_gif(rgbs2, os.path.join(OUT, "preview-in-plate.gif"), durations), "bytes")


if __name__ == "__main__":
    order = list(sys.argv[1:])
    main(order)
