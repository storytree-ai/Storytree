// cliff-readability.test.ts — the apparent-height instrument, held under node with frames whose
// answers are known by construction before any is computed.
//
// ⚠ THE FIXTURES ARE HOSTILE ON PURPOSE. A cliff that is all readable and a cliff that is all sunk
// would each pass an instrument that counted the wrong thing; the frames below mix readable and
// sunk pixels in ONE column, put different band heights in different columns so the median is not
// the mean, and leave columns untouched so the width is counted off the cliff and not the frame.

import test from 'node:test';
import assert from 'node:assert/strict';

import { cliffReadability, lowerMedian, seaMove } from './cliff-readability.js';
import { VISIBLE_DELTA } from './visible-delta.js';
import type { Rgb255 } from '../src/shade-ladder.js';

const SEA: Rgb255 = { r: 16, g: 20, b: 24 };
const W = 5;
const H = 10;

/** A frame painted entirely with the sea. */
function seaFrame(): Uint8ClampedArray {
  const f = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p += 1) {
    f[p * 4] = SEA.r;
    f[p * 4 + 1] = SEA.g;
    f[p * 4 + 2] = SEA.b;
    f[p * 4 + 3] = 255;
  }
  return f;
}

/** Paint one pixel a stated luma-neutral distance above the sea on every channel. */
function paint(f: Uint8ClampedArray, x: number, y: number, aboveSea: number): void {
  const i = (y * W + x) * 4;
  f[i] = SEA.r + aboveSea;
  f[i + 1] = SEA.g + aboveSea;
  f[i + 2] = SEA.b + aboveSea;
}

test('lowerMedian: the lower middle of an even list, the middle of an odd one, 0 for none', () => {
  assert.equal(lowerMedian([]), 0);
  assert.equal(lowerMedian([7]), 7);
  assert.equal(lowerMedian([6, 4]), 4);
  assert.equal(lowerMedian([9, 1, 5]), 5);
  assert.equal(lowerMedian([1, 2, 3, 4]), 2);
});

test('seaMove is the LARGEST single-channel distance, not the luma and not the sum', () => {
  const f = new Uint8ClampedArray([16, 20, 24 + 9, 255]);
  assert.equal(seaMove(f, 0, SEA), 9);
  const g = new Uint8ClampedArray([16 + 3, 20 + 30, 24, 255]);
  assert.equal(seaMove(g, 0, SEA), 30);
  // and it is a distance, so a channel BELOW the sea counts by its magnitude — the frame is
  // clamped, so the darkest a channel can sit is 0
  const d = new Uint8ClampedArray([0, 20, 24, 255]);
  assert.equal(seaMove(d, 0, SEA), 16);
});

test('an arm identical to its control has no cliff, and the fraction is 0 rather than NaN', () => {
  const r = cliffReadability(seaFrame(), seaFrame(), W, SEA);
  assert.deepEqual(r, {
    cliffPixels: 0,
    readablePixels: 0,
    readableFraction: 0,
    columns: 0,
    medianBand: 0,
    medianReadable: 0,
  });
});

test('⚠⚠ THE SUNK SHAPE: a cliff whose every pixel sits within the bar of the sea is a cliff with NO apparent height', () => {
  // exactly what PR #1792 delivered at the ladder floor: a 6-px band moved 7/255 from the water
  const control = seaFrame();
  const arm = seaFrame();
  for (let y = 2; y < 8; y += 1) paint(arm, 2, y, 7);
  const r = cliffReadability(arm, control, W, SEA);
  assert.equal(r.cliffPixels, 6, 'the band is still a band — it differs from the control');
  assert.equal(r.readablePixels, 0);
  assert.equal(r.readableFraction, 0);
  assert.equal(r.columns, 1);
  assert.equal(r.medianBand, 6);
  assert.equal(r.medianReadable, 0, 'six pixels the sea swallows are zero pixels of cliff');
});

test('a column mixing readable and sunk pixels counts each on its own side of the bar', () => {
  const control = seaFrame();
  const arm = seaFrame();
  // column 1: three readable (30 above), then three sunk (5 above) — the two-token-deep shape
  for (let y = 0; y < 3; y += 1) paint(arm, 1, y, 30);
  for (let y = 3; y < 6; y += 1) paint(arm, 1, y, 5);
  const r = cliffReadability(arm, control, W, SEA);
  assert.equal(r.cliffPixels, 6);
  assert.equal(r.readablePixels, 3);
  assert.equal(r.readableFraction, 0.5);
  assert.equal(r.medianBand, 6);
  assert.equal(r.medianReadable, 3, 'the apparent height is the readable count, not the band');
});

test('the medians are taken over CLIFF columns only, and are lower medians', () => {
  const control = seaFrame();
  const arm = seaFrame();
  // column 1: 6 band / 3 readable; column 3: 4 band / 4 readable; columns 0, 2, 4 untouched
  for (let y = 0; y < 3; y += 1) paint(arm, 1, y, 30);
  for (let y = 3; y < 6; y += 1) paint(arm, 1, y, 5);
  for (let y = 0; y < 4; y += 1) paint(arm, 3, y, 40);
  const r = cliffReadability(arm, control, W, SEA);
  assert.equal(r.columns, 2, 'three untouched columns must not widen the cliff');
  assert.equal(r.cliffPixels, 10);
  assert.equal(r.readablePixels, 7);
  assert.equal(r.readableFraction, 0.7);
  assert.equal(r.medianBand, 4, 'lower median of [6, 4]');
  assert.equal(r.medianReadable, 3, 'lower median of [3, 4]');
});

test('⚠ THE BAR IS EXCLUSIVE — a move OF the bar is not readable, a move of one more is', () => {
  const control = seaFrame();
  const arm = seaFrame();
  paint(arm, 0, 0, VISIBLE_DELTA);
  paint(arm, 0, 1, VISIBLE_DELTA + 1);
  const r = cliffReadability(arm, control, W, SEA);
  assert.equal(r.cliffPixels, 2);
  assert.equal(r.readablePixels, 1);
  // and the bar is a parameter, so a page can ask a stricter question of the same frames
  assert.equal(cliffReadability(arm, control, W, SEA, VISIBLE_DELTA + 1).readablePixels, 0);
  assert.equal(cliffReadability(arm, control, W, SEA, VISIBLE_DELTA - 1).readablePixels, 2);
});

test('a pixel that moved on a channel the sea test ignores is still CLIFF: touched is against the control, readable is against the sea', () => {
  const control = seaFrame();
  const arm = seaFrame();
  // one pixel differs from the control by a single unit on blue only — cliff, not readable
  const i = (4 * W + 4) * 4;
  arm[i + 2] = SEA.b + 1;
  const r = cliffReadability(arm, control, W, SEA);
  assert.equal(r.cliffPixels, 1);
  assert.equal(r.readablePixels, 0);
  assert.equal(r.columns, 1);
});

test('the instrument refuses frames that disagree about their size, or a width the buffer does not divide into', () => {
  const control = seaFrame();
  // ⚠ ONE ROW SHORT, not four bytes short: a buffer that is a whole number of rows can only be
  // refused by the size check, so this line holds THAT refusal and not the width one behind it.
  // Seeded by hand: with the size refusal deleted, a four-bytes-short buffer was still refused —
  // by the width check, whose message also says "bytes" — and the seed survived.
  const oneRowShort = new Uint8ClampedArray(W * (H - 1) * 4);
  assert.throws(() => cliffReadability(oneRowShort, control, W, SEA), /its control/);
  assert.throws(() => cliffReadability(seaFrame(), control, 3, SEA), /whole number of rows/);
  assert.throws(() => cliffReadability(seaFrame(), control, 0, SEA), /whole number of rows/);
});
