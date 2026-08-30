// map-texels.test.ts — the base-colour mean a tint is rotated from, proved without a browser.
//
// ⚠⚠ WHY THE ARITHMETIC IS A SEPARATE FUNCTION. Reading a texture's texels needs a 2D canvas and
// therefore a browser; the arithmetic over them does not, and it is where every claim lives. Left
// inside the canvas read, this module was 65 mutants nothing could reach and `check:mutation-diff`
// said so. The remedy was not a better browser fixture — the subject of the assertions was never
// the canvas.

import assert from 'node:assert/strict';
import test from 'node:test';

import { texelMeans } from './map-texels.js';
import { OPAQUE_TEXEL_CUT, srgbToLinearUnit } from './texture-convention.js';

/** RGBA bytes for a run of texels. */
function rgba(...texels: readonly (readonly [number, number, number, number])[]): Uint8ClampedArray {
  return Uint8ClampedArray.from(texels.flat());
}

test('the raw mean is the mean of the solid texels, per channel', () => {
  // ⚠ THREE CHANNELS WITH THREE DIFFERENT ANSWERS. A fixture whose channels agreed would pass for
  // an implementation that computed one of them and copied it into the other two.
  const means = texelMeans(rgba([10, 40, 90, 255], [30, 80, 150, 255]));
  assert.equal(means.raw.r, 20);
  assert.equal(means.raw.g, 60);
  assert.equal(means.raw.b, 120);
  assert.equal(means.opaque, 2);
});

test('⚠ the linear mean is mean(srgb_to_linear(texel)), NOT srgb_to_linear(mean(texel))', () => {
  // ⚠⚠ THE CURVE IS CONVEX, so those two differ — and predicting with the wrong one leaves a
  // systematic error that a tolerance then has to absorb. A tolerance absorbing a modelling error
  // has stopped discriminating. Both are computed here so the assertion is that the RIGHT one was
  // taken, rather than that some plausible number came out.
  const lo = 10;
  const hi = 240;
  const means = texelMeans(rgba([lo, lo, lo, 255], [hi, hi, hi, 255]));
  const perTexel = (srgbToLinearUnit(lo / 255) * 255 + srgbToLinearUnit(hi / 255) * 255) / 2;
  const ofTheMean = srgbToLinearUnit((lo + hi) / 2 / 255) * 255;
  assert.ok(Math.abs(means.linear.r - perTexel) < 1e-9, 'the linear mean is not per-texel');
  assert.ok(Math.abs(perTexel - ofTheMean) > 1, 'the fixture does not separate the two readings');
});

test('⚠ ONLY FULLY OPAQUE TEXELS COUNT, and the cut is exactly where it is declared', () => {
  // ⚠⚠ TWO THINGS BREAK ON A CUT-OUT MAP, and the first produced a wrong answer before this
  // existed. `getImageData` un-premultiplies, so an alpha-0 texel comes back BLACK whatever colour
  // the GPU samples there; and a partly transparent texel is blended against whatever is behind
  // it, so its delivered colour is not its own. Cutting at fully-opaque removes both, and makes
  // the source mean and the delivered mean means of the SAME set.
  const means = texelMeans(
    rgba(
      [200, 200, 200, 255],
      [0, 0, 0, 0], // the un-premultiplied black that dragged a mean to rgb(30,38,29)
      [0, 0, 0, OPAQUE_TEXEL_CUT - 1],
      [200, 200, 200, OPAQUE_TEXEL_CUT],
    ),
  );
  assert.equal(means.opaque, 2, 'a texel below the cut was counted');
  assert.equal(means.raw.r, 200, 'a transparent texel reached the mean');
});

test('a map with no solid texels at all is refused, not averaged over zero', () => {
  // Dividing by zero here answers `NaN` for every channel, and a `NaN` gain paints a crown black
  // in a way that looks like an art direction.
  assert.throws(() => texelMeans(rgba([9, 9, 9, 0])), /no solid texels/);
  assert.throws(() => texelMeans(new Uint8ClampedArray(0)), /no solid texels/);
});

test('the alpha channel is read at offset 3 — the stride is not off by one', () => {
  // ⚠ An implementation reading alpha at +2 (or colour at +1) passes every test whose fixture is
  // grey or whose alphas are all 255. This one is neither: the texel that must be DROPPED has a
  // distinctive blue, so if the stride slipped the mean would carry it.
  const means = texelMeans(rgba([10, 20, 30, 255], [0, 0, 255, 0]));
  assert.deepEqual(means.raw, { r: 10, g: 20, b: 30 });
  assert.equal(means.opaque, 1);
});

test('a single opaque texel is its own mean, in both readings', () => {
  const means = texelMeans(rgba([70, 90, 69, 255]));
  assert.deepEqual(means.raw, { r: 70, g: 90, b: 69 });
  assert.ok(Math.abs(means.linear.r - srgbToLinearUnit(70 / 255) * 255) < 1e-9);
  assert.ok(Math.abs(means.linear.g - srgbToLinearUnit(90 / 255) * 255) < 1e-9);
  assert.ok(Math.abs(means.linear.b - srgbToLinearUnit(69 / 255) * 255) < 1e-9);
});

test('the linear reading is DARKER than the raw one — the curve runs the right way', () => {
  // NON-VACUITY on the transfer function itself. `srgb_to_linear` of a mid grey is well below it;
  // an implementation that applied the INVERSE curve would still produce two different numbers and
  // satisfy every equality above, because those compare against the same function.
  const means = texelMeans(rgba([128, 128, 128, 255]));
  assert.ok(means.linear.r < means.raw.r * 0.6, `linear ${means.linear.r} vs raw ${means.raw.r}`);
});

test('every texel is visited — the stride does not skip or double-count', () => {
  // A stride bug that read every EIGHTH byte would halve the count and change the mean; one that
  // read every byte would quadruple it. The count is asserted alongside the mean so both
  // directions are closed.
  const many = Array.from({ length: 16 }, (_, i) => [i * 4, 0, 0, 255] as const);
  const means = texelMeans(rgba(...many));
  assert.equal(means.opaque, 16);
  assert.equal(means.raw.r, (0 + 15) * 4 / 2);
});
