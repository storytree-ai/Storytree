// cutout.test.ts — the background cutout is offline-provable on a synthetic PNG: a solid subject block on
// a flat white field is keyed to transparent at the corners, kept opaque on the subject, and trimmed to
// the subject's bounding box (so the manifest can seat the ground pivot and derive an undistorted width).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { cutoutTransparent, downscaleRgba } from './cutout.js';

/** Build a WxH white PNG with a solid opaque block of `color` in [x0,x1)×[y0,y1). */
function whiteWithBlock(
  w: number,
  h: number,
  block: { x0: number; y0: number; x1: number; y1: number; r: number; g: number; b: number },
): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inBlock = x >= block.x0 && x < block.x1 && y >= block.y0 && y < block.y1;
      png.data[i] = inBlock ? block.r : 255;
      png.data[i + 1] = inBlock ? block.g : 255;
      png.data[i + 2] = inBlock ? block.b : 255;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('cutoutTransparent keys the flat white field out, keeps the subject, and trims to its box', () => {
  // a 20x20 white frame with a 6x8 dark-red block from (7,6) to (13,14)
  const buf = whiteWithBlock(20, 20, { x0: 7, y0: 6, x1: 13, y1: 14, r: 150, g: 40, b: 40 });
  const { png, width, height } = cutoutTransparent(buf, { pad: 0 });
  // trimmed to the 6x8 subject box
  assert.equal(width, 6);
  assert.equal(height, 8);
  const out = PNG.sync.read(png);
  assert.equal(out.width, 6);
  assert.equal(out.height, 8);
  // the subject's own pixels stay opaque and coloured
  const centre = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
  assert.equal(out.data[centre + 3], 255, 'subject centre is opaque');
  assert.ok((out.data[centre] ?? 0) > 100, 'subject centre kept its red channel');
});

test('cutoutTransparent throws on an all-white (blank) frame instead of writing an empty sprite', () => {
  const blank = whiteWithBlock(8, 8, { x0: 0, y0: 0, x1: 0, y1: 0, r: 0, g: 0, b: 0 });
  assert.throws(() => cutoutTransparent(blank), /nothing left/);
});

test('cutoutTransparent with maxDim downscales the trimmed sprite, preserving aspect', () => {
  // a 40x20 subject (aspect 2.0) on white → cut, then capped at maxDim 10 → 10x5
  const buf = whiteWithBlock(60, 40, { x0: 10, y0: 10, x1: 50, y1: 30, r: 120, g: 60, b: 30 });
  const { png, width, height } = cutoutTransparent(buf, { pad: 0, maxDim: 10 });
  assert.equal(width, 10);
  assert.equal(height, 5);
  const out = PNG.sync.read(png);
  assert.equal(out.width, 10);
  assert.equal(out.height, 5);
});

test('downscaleRgba keeps opaque interior colour (premultiplied average, no dark fringe)', () => {
  // 4x4 fully-opaque solid orange → downscale to 2x2 stays orange & opaque
  const src = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) {
    src[i * 4] = 200;
    src[i * 4 + 1] = 120;
    src[i * 4 + 2] = 40;
    src[i * 4 + 3] = 255;
  }
  const out = downscaleRgba({ width: 4, height: 4, data: src }, 2);
  assert.equal(out.width, 2);
  assert.equal(out.height, 2);
  assert.equal(out.data[0], 200);
  assert.equal(out.data[1], 120);
  assert.equal(out.data[2], 40);
  assert.equal(out.data[3], 255);
});

test('cutoutTransparent keeps a white patch INSIDE the subject (corner flood fill, not global key)', () => {
  // a dark ring 4..16 with a white hole 8..12 in the middle — the hole is NOT border-connected, so it
  // must stay opaque (a lit window / daisy petal survives).
  const w = 20;
  const h = 20;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inRing = x >= 4 && x < 16 && y >= 4 && y < 16;
      const inHole = x >= 8 && x < 12 && y >= 8 && y < 12;
      const dark = inRing && !inHole;
      png.data[i] = dark ? 60 : 255;
      png.data[i + 1] = dark ? 60 : 255;
      png.data[i + 2] = dark ? 60 : 255;
      png.data[i + 3] = 255;
    }
  }
  const { png: outBuf } = cutoutTransparent(PNG.sync.write(png), { pad: 0 });
  const out = PNG.sync.read(outBuf);
  // interior white hole (now at local ~4,4 of the 12x12 trim) stays opaque
  const hole = (6 * out.width + 6) * 4;
  assert.equal(out.data[hole + 3], 255, 'interior white patch survives (not border-connected)');
});
