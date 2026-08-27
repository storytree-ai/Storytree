// pixel-metrics.test.ts — the instrument, against hand-computed cases.
//
// WHY HAND-COMPUTED AND NOT SNAPSHOT. This module's only value is that its numbers can be read
// against `measure_land.py`'s committed table. A snapshot test would pin whatever this
// implementation happens to do, including a mistake, and would go green for exactly as long as
// the mistake was stable — the "an expectation derived from its subject cannot fail" shape. So
// every case below is small enough that the expected value is arithmetic a reader can check.

import assert from 'node:assert/strict';
import test from 'node:test';

import { STRUCT_BLUR_RADIUS, luma, maskedBoxBlur, measurePixels } from './pixel-metrics.js';

/** Build an RGBA buffer from `[r,g,b,a]` rows, left-to-right then top-to-bottom. */
function buffer(px: readonly (readonly [number, number, number, number])[]): Uint8Array {
  const out = new Uint8Array(px.length * 4);
  px.forEach((p, i) => out.set(p, i * 4));
  return out;
}

const OPAQUE = 255;
const CLEAR = 0;

test('luma is Rec.709 on BYTES', () => {
  // ⚠ NOT `equal(..., 255)`: the three Rec.709 weights do not sum to exactly 1 in binary
  // floating point, so white is 254.99999999999997. Rounding inside `luma` to make that
  // assertion pass would quantise every delta MICRO averages.
  assert.ok(Math.abs(luma(255, 255, 255) - 255) < 1e-9);
  assert.equal(luma(0, 0, 0), 0);
  // The three primaries carry the Rec.709 weights, which is what distinguishes this from a
  // plain channel mean (which would give 85 for each).
  assert.ok(Math.abs(luma(255, 0, 0) - 0.2126 * 255) < 1e-9);
  assert.ok(Math.abs(luma(0, 255, 0) - 0.7152 * 255) < 1e-9);
  assert.ok(Math.abs(luma(0, 0, 255) - 0.0722 * 255) < 1e-9);
});

test('MICRO is the mean |delta luma| over opaque neighbour pairs', () => {
  // Two opaque pixels, black and white, one horizontal pair: the mean is the one delta.
  const m = measurePixels(
    buffer([
      [0, 0, 0, OPAQUE],
      [255, 255, 255, OPAQUE],
    ]),
    2,
    1,
  );
  assert.ok(m);
  assert.ok(Math.abs(m.micro - 255) < 1e-9);
  assert.equal(m.opaque, 2);
});

test('MICRO pools the two axes into ONE mean rather than averaging the axis means', () => {
  // A 2x2 with one horizontal delta of 255 and the rest equal. Pairs: 2 horizontal
  // (255 and 0) and 2 vertical (0 and 255) -> 4 pairs, sum 510, mean 127.5.
  const m = measurePixels(
    buffer([
      [0, 0, 0, OPAQUE],
      [255, 255, 255, OPAQUE],
      [0, 0, 0, OPAQUE],
      [0, 0, 0, OPAQUE],
    ]),
    2,
    2,
  );
  assert.ok(m);
  assert.ok(Math.abs(m.micro - 127.5) < 1e-9);
});

test('a pair with a transparent end is not a pair', () => {
  // Three pixels, the middle one transparent: both candidate pairs are broken, so there are no
  // pairs at all. Counting them would let the coast contribute a fabricated delta.
  const m = measurePixels(
    buffer([
      [0, 0, 0, OPAQUE],
      [255, 255, 255, CLEAR],
      [255, 255, 255, OPAQUE],
    ]),
    3,
    1,
  );
  assert.ok(m);
  assert.equal(m.micro, 0);
  assert.equal(m.opaque, 2);
});

test('a frame with nothing opaque measures NOTHING, not zero', () => {
  // The vacuous-green guard. A blank capture returning a full set of zeros would read as a
  // legitimate low-contrast measurement, which is how a broken run gets published as evidence.
  assert.equal(measurePixels(buffer([[9, 9, 9, CLEAR]]), 1, 1), null);
});

test('a short buffer throws rather than measuring whatever it can reach', () => {
  assert.throws(() => measurePixels(new Uint8Array(4), 4, 4), /need 64/);
});

test('the box blur has HONEST EDGES — it normalises by the mask, not by the window', () => {
  // THE PROPERTY THAT SEPARATES THIS FROM A NAIVE BLUR, and it is worth a test of its own
  // because getting it wrong drags every coastal pixel toward black and inflates STRUCT while
  // looking like genuine coastal contrast.
  const w = 9;
  const h = 9;
  const values = new Float64Array(w * h).fill(100);
  const mask = new Uint8Array(w * h).fill(1);
  const blurred = maskedBoxBlur(values, mask, w, h, STRUCT_BLUR_RADIUS);
  for (let i = 0; i < w * h; i++) {
    assert.ok(
      Math.abs(blurred[i]! - 100) < 1e-9,
      `corner/edge pixel ${i} blurred to ${blurred[i]} — a zero-padded blur, not a masked one`,
    );
  }
});

test('the box blur ignores masked-out values entirely', () => {
  // A row of 100s beside a row of transparent 0s: the blur must report 100, not the mean of
  // the two, because the transparent pixels are not land.
  const w = 3;
  const h = 2;
  const values = new Float64Array([100, 100, 100, 0, 0, 0]);
  const mask = new Uint8Array([1, 1, 1, 0, 0, 0]);
  const blurred = maskedBoxBlur(values, mask, w, h, 1);
  for (let x = 0; x < w; x++) assert.ok(Math.abs(blurred[x]! - 100) < 1e-9);
});

test('a flat frame has zero contrast at both scales', () => {
  const px = Array.from({ length: 16 }, () => [40, 80, 120, OPAQUE] as const);
  const m = measurePixels(buffer(px), 4, 4);
  assert.ok(m);
  assert.equal(m.micro, 0);
  assert.ok(m.struct < 1e-9);
  assert.equal(m.distinct, 1);
  assert.equal(m.bins90, 1);
});

test('BINS90 counts the colours needed to cover 90% of the opaque frame', () => {
  // Nine pixels of one colour and one of another: the first colour alone covers 90%, so the
  // answer is 1. The off-by-one this pins is `+1` on the cumulative search.
  const px = [
    ...Array.from({ length: 9 }, () => [10, 10, 10, OPAQUE] as const),
    [200, 200, 200, OPAQUE] as const,
  ];
  const m = measurePixels(buffer(px), 10, 1);
  assert.ok(m);
  assert.equal(m.distinct, 2);
  assert.equal(m.bins90, 1);
});

test('BINS90 needs both colours when neither reaches 90%', () => {
  const px = [
    ...Array.from({ length: 5 }, () => [10, 10, 10, OPAQUE] as const),
    ...Array.from({ length: 5 }, () => [200, 200, 200, OPAQUE] as const),
  ];
  const m = measurePixels(buffer(px), 10, 1);
  assert.ok(m);
  assert.equal(m.bins90, 2);
});

test('grain-shaped detail raises MICRO while a smooth gradient does not', () => {
  // The discriminating case for the whole instrument: two frames with the SAME luma range and
  // the same mean, differing only in the SCALE at which they vary. If MICRO cannot separate
  // these it is measuring range rather than pixel-scale contrast and every number this
  // increment reports would be meaningless.
  const w = 64;
  const h = 64;
  const ramp: (readonly [number, number, number, number])[] = [];
  const check: (readonly [number, number, number, number])[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      ramp.push([v, v, v, OPAQUE]);
      const c = (x + y) % 2 === 0 ? 0 : 255;
      check.push([c, c, c, OPAQUE]);
    }
  }
  const gradient = measurePixels(buffer(ramp), w, h);
  const stipple = measurePixels(buffer(check), w, h);
  assert.ok(gradient && stipple);
  assert.ok(
    stipple.micro > gradient.micro * 20,
    `stipple MICRO ${stipple.micro.toFixed(2)} vs gradient ${gradient.micro.toFixed(2)}`,
  );
  // ...and STRUCT goes the other way: the checkerboard vanishes under a 9x9 blur, the ramp
  // survives it. That is exactly the "contrast beats detail" quantity.
  assert.ok(
    gradient.struct > stipple.struct * 20,
    `gradient STRUCT ${gradient.struct.toFixed(2)} vs stipple ${stipple.struct.toFixed(2)}`,
  );
});
