// blob-slice.test.ts — the content-aware slicer is offline-provable on synthetic canvases: it finds each
// coloured block as a blob, returns them in reading order, merges near fragments, drops speckle, and crops
// one blob to a trimmed transparent PNG.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import type { RgbaImage } from './cutout.js';
import { detectBlobs, backgroundMask, sortReadingOrder, cropBlob, type Blob } from './blob-slice.js';

/** A white opaque canvas. */
function whiteCanvas(w: number, h: number): RgbaImage {
  const data = new Uint8Array(w * h * 4).fill(255);
  return { width: w, height: h, data };
}
/** Paint an inclusive [x0,x1]×[y0,y1] block of `color` into a canvas. */
function block(
  img: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = color[0];
      img.data[o + 1] = color[1];
      img.data[o + 2] = color[2];
      img.data[o + 3] = 255;
    }
  }
}
const RED: [number, number, number] = [190, 60, 60];
const GRN: [number, number, number] = [60, 150, 90];

test('detectBlobs finds four blocks and returns them in reading order (row-major)', () => {
  const img = whiteCanvas(100, 100);
  block(img, 10, 10, 29, 29, RED); // A top-left
  block(img, 60, 12, 79, 31, GRN); // B top-right (slight y jitter)
  block(img, 12, 60, 31, 79, GRN); // C bottom-left
  block(img, 58, 62, 77, 81, RED); // D bottom-right
  const blobs = detectBlobs(img);
  assert.equal(blobs.length, 4);
  // reading order: A, B, C, D by (row, then x)
  const cx = blobs.map((b) => Math.round(b.centroidX));
  const cy = blobs.map((b) => Math.round(b.centroidY));
  assert.ok(cy[0]! < 40 && cy[1]! < 40, 'first two are the top row');
  assert.ok(cy[2]! > 40 && cy[3]! > 40, 'last two are the bottom row');
  assert.ok(cx[0]! < cx[1]!, 'top row left-to-right');
  assert.ok(cx[2]! < cx[3]!, 'bottom row left-to-right');
});

test('detectBlobs merges near fragments (stem + head) but keeps distinct objects apart', () => {
  // head block y[10,23], stem block y[27,44] at overlapping x → vertical gap ≈ 4px
  const mk = () => {
    const img = whiteCanvas(80, 60);
    block(img, 40, 10, 59, 23, GRN); // head
    block(img, 48, 27, 51, 44, GRN); // stem below it
    block(img, 5, 10, 20, 40, RED); // a clearly separate object, far to the left
    return img;
  };
  // minArea kept low so the thin stem survives on its own when NOT merged.
  const wide = detectBlobs(mk(), { mergeGap: 6, minArea: 20 });
  assert.equal(wide.length, 2, 'head+stem merged into one, plus the separate object');
  const tight = detectBlobs(mk(), { mergeGap: 2, minArea: 20 });
  assert.equal(tight.length, 3, 'gap too big to merge → head, stem and the separate object stay apart');
  // the merged blob spans both head and stem vertically
  const merged = wide.find((b) => b.minX >= 40)!;
  assert.ok(merged.minY <= 10 && merged.maxY >= 44, 'merged blob box spans head through stem');
});

test('detectBlobs drops speckle below minArea', () => {
  const img = whiteCanvas(60, 60);
  block(img, 10, 10, 34, 34, RED); // a real object (25×25 = 625 px)
  block(img, 50, 50, 51, 51, GRN); // 2×2 speckle
  const blobs = detectBlobs(img, { minArea: 200 });
  assert.equal(blobs.length, 1, 'only the real object survives');
  assert.ok(blobs[0]!.area > 500);
});

test('backgroundMask flood-fills the border field but keeps an interior hole as foreground', () => {
  const img = whiteCanvas(20, 20);
  // a dark ring with a white hole in the middle (the hole is not border-connected)
  block(img, 4, 4, 15, 15, [50, 50, 50]);
  block(img, 8, 8, 11, 11, [255, 255, 255]); // interior white hole
  const bg = backgroundMask(img, 42);
  assert.equal(bg[0], 1, 'corner is background');
  assert.equal(bg[10 * 20 + 10], 0, 'interior white hole is NOT background (kept as foreground)');
});

test('sortReadingOrder groups jittered rows and orders left-to-right', () => {
  const b = (cx: number, cy: number): Blob => ({
    minX: cx - 5,
    minY: cy - 5,
    maxX: cx + 5,
    maxY: cy + 5,
    area: 100,
    centroidX: cx,
    centroidY: cy,
  });
  // scrambled input; expected order by row then x: (10,10),(40,12),(12,50),(45,48)
  const sorted = sortReadingOrder([b(45, 48), b(10, 10), b(40, 12), b(12, 50)]);
  assert.deepEqual(
    sorted.map((s) => [s.centroidX, s.centroidY]),
    [
      [10, 10],
      [40, 12],
      [12, 50],
      [45, 48],
    ],
  );
});

test('cropBlob trims one detected blob to a transparent PNG of the block size', () => {
  const img = whiteCanvas(80, 80);
  block(img, 20, 24, 39, 47, RED); // a 20×24 block
  const [blob] = detectBlobs(img);
  const cut = cropBlob(img, blob!, { pad: 0, cropPad: 8 });
  assert.equal(cut.width, 20, 'trimmed to the block width');
  assert.equal(cut.height, 24, 'trimmed to the block height');
  const out = PNG.sync.read(cut.png);
  const centre = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
  assert.equal(out.data[centre + 3], 255, 'subject centre opaque');
  assert.ok((out.data[centre] ?? 0) > 120, 'subject centre kept its red channel');
});
