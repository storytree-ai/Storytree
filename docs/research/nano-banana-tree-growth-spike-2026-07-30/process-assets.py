"""Deterministic packaging for the Nano Banana tree-growth spike.

The generated JPEG is retained untouched. This script:
1. slices its invisible 3x3 layout into equal cells;
2. removes only corner-connected near-white background;
3. downsamples every cell with one common 96/341-ish scale;
4. measures root drift before correction;
5. applies integer translation so each bottom-root lands at (48, 91);
6. writes transparent frames, sheets, a GIF preview, and geometry evidence.
"""

from __future__ import annotations

from collections import deque
import json
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "nano-banana-original.jpg"
FRAME_SIZE = 96
# Pixel centres 47 and 48 straddle the exact centre of a 96 px frame. Using 47 keeps the widest
# mature crown off the right edge while remaining lower-centre.
TARGET_ROOT_X = 47
TARGET_BOTTOM_Y = 91
BACKGROUND_TOLERANCE = 42


def colour_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))


def remove_connected_background(cell: Image.Image) -> Image.Image:
    rgb = cell.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    corners = [
        pixels[0, 0],
        pixels[width - 1, 0],
        pixels[0, height - 1],
        pixels[width - 1, height - 1],
    ]
    background = tuple(round(sum(c[channel] for c in corners) / 4) for channel in range(3))

    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        index = y * width + x
        if seen[index]:
            return
        if colour_distance(pixels[x, y], background) <= BACKGROUND_TOLERANCE:
            seen[index] = 1
            queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            push(x - 1, y)
        if x + 1 < width:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < height:
            push(x, y + 1)

    rgba = rgb.convert("RGBA")
    out = rgba.load()
    for y in range(height):
        for x in range(width):
            if seen[y * width + x]:
                out[x, y] = (0, 0, 0, 0)
    return rgba


def crisp_downsample(cell: Image.Image) -> Image.Image:
    resized = cell.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.BOX)
    pixels = resized.load()
    for y in range(FRAME_SIZE):
        for x in range(FRAME_SIZE):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 48:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (red, green, blue, 255)
    return resized


def geometry(frame: Image.Image) -> dict[str, object]:
    alpha = frame.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise RuntimeError("frame contains no foreground after background removal")
    min_x, min_y, max_x_exclusive, max_y_exclusive = bounds
    bottom_y = max_y_exclusive - 1
    root_x_values: list[int] = []
    alpha_pixels = alpha.load()
    for y in range(max(min_y, bottom_y - 2), bottom_y + 1):
        for x in range(min_x, max_x_exclusive):
            if alpha_pixels[x, y] > 0:
                root_x_values.append(x)
    root_mean_x = sum(root_x_values) / len(root_x_values)
    return {
        "alphaBounds": [min_x, min_y, max_x_exclusive - 1, max_y_exclusive - 1],
        "bottomY": bottom_y,
        "bottomRootMeanX": round(root_mean_x, 1),
    }


def translate_to_root(frame: Image.Image, metrics: dict[str, object]) -> tuple[Image.Image, int, int]:
    dx = round(TARGET_ROOT_X - float(metrics["bottomRootMeanX"]))
    dy = TARGET_BOTTOM_Y - int(metrics["bottomY"])
    aligned = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    aligned.alpha_composite(frame, (dx, dy))
    return aligned, dx, dy


def make_sheet(frames: list[Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (FRAME_SIZE * 3, FRAME_SIZE * 3), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % 3) * FRAME_SIZE, (index // 3) * FRAME_SIZE))
    sheet.save(path, optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size
    unaligned_frames: list[Image.Image] = []
    aligned_frames: list[Image.Image] = []
    evidence: list[dict[str, object]] = []

    for index in range(9):
        column = index % 3
        row = index // 3
        left = round(column * width / 3)
        right = round((column + 1) * width / 3)
        top = round(row * height / 3)
        bottom = round((row + 1) * height / 3)
        cell = source.crop((left, top, right, bottom))
        transparent = remove_connected_background(cell)
        unaligned = crisp_downsample(transparent)
        before = geometry(unaligned)
        aligned, dx, dy = translate_to_root(unaligned, before)
        after = geometry(aligned)

        unaligned_frames.append(unaligned)
        aligned_frames.append(aligned)
        aligned.save(HERE / f"frame-{index + 1:02d}.png", optimize=True)
        evidence.append(
            {
                "frame": index,
                "sourceCell": [left, top, right, bottom],
                "unaligned": before,
                "integerAlignmentShift": [dx, dy],
                "aligned": after,
            }
        )

    make_sheet(unaligned_frames, HERE / "nano-banana-transparent-unaligned.png")
    make_sheet(aligned_frames, HERE / "tree-growth-spritesheet.png")

    preview_frames: list[Image.Image] = []
    for frame in aligned_frames:
        canvas = Image.new("RGB", (FRAME_SIZE, FRAME_SIZE), "#071a1b")
        canvas.paste(frame, (0, 0), frame)
        preview_frames.append(canvas.resize((FRAME_SIZE * 4, FRAME_SIZE * 4), Image.Resampling.NEAREST))
    preview_frames[0].save(
        HERE / "tree-growth-preview.gif",
        save_all=True,
        append_images=preview_frames[1:],
        duration=[420] * 8 + [1100],
        loop=0,
        optimize=False,
        disposal=2,
    )

    unaligned_x = [float(item["unaligned"]["bottomRootMeanX"]) for item in evidence]
    unaligned_y = [int(item["unaligned"]["bottomY"]) for item in evidence]
    aligned_x = [float(item["aligned"]["bottomRootMeanX"]) for item in evidence]
    aligned_y = [int(item["aligned"]["bottomY"]) for item in evidence]
    report = {
        "source": SOURCE.name,
        "sourceSize": [width, height],
        "layout": "equal 3x3 cells, reading order",
        "frameSize": [FRAME_SIZE, FRAME_SIZE],
        "backgroundRemoval": {
            "method": "corner-connected flood fill",
            "maxChannelTolerance": BACKGROUND_TOLERANCE,
        },
        "alignmentTarget": {
            "bottomRootMeanX": TARGET_ROOT_X,
            "bottomY": TARGET_BOTTOM_Y,
        },
        "summary": {
            "unalignedHorizontalRootRangePx": round(max(unaligned_x) - min(unaligned_x), 1),
            "unalignedVerticalRootRangePx": max(unaligned_y) - min(unaligned_y),
            "alignedHorizontalRootRangePx": round(max(aligned_x) - min(aligned_x), 1),
            "alignedVerticalRootRangePx": max(aligned_y) - min(aligned_y),
        },
        "frames": evidence,
    }
    (HERE / "geometry-evidence.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
