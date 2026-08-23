import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEEP_BAND_EDGE,
  REGION_WAVELENGTHS,
  bandCoverage,
  regionField,
  variantAt,
  variantSeamFraction,
} from './ground-variation.js';
import { groundCellsFrom } from './island-descriptors.js';
import { islandScene } from './island-fixture.js';
import { STATUS_TOKENS } from './palette-band.js';

const cells = groundCellsFrom(islandScene({}));

/** The independent-uniform expectation for the PER-CELL hash form the owner removed: three
 *  variants drawn independently per cell, so a shared boundary shows a jump with probability
 *  2/3. It is the number the regional form has to beat to be a different thing rather than a
 *  nicer word for the same thing. */
const HASH_SEAM_RATE = 2 / 3;

test('the fixture island is the one these numbers were measured on', () => {
  assert.equal(cells.length, 164);
});

test('the region field is smooth and long-wavelength — not per-cell noise', () => {
  // A field that changes materially over one cell pitch IS per-cell noise however it is
  // computed. The island's mean cell pitch is about 16.5 ground units; sampling a tenth of
  // the shorter wavelength must move the field only a little.
  const step = Math.min(...REGION_WAVELENGTHS) / 10;
  let worst = 0;
  for (let x = -120; x <= 120; x += 7) {
    for (let z = -70; z <= 70; z += 7) {
      worst = Math.max(worst, Math.abs(regionField(x + step, z) - regionField(x, z)));
    }
  }
  assert.ok(worst < 0.4, `field moved ${worst.toFixed(3)} over a tenth-wavelength step`);
});

test('the field stays in range, so the band edges mean what they say', () => {
  for (let x = -300; x <= 300; x += 3.5) {
    for (let z = -300; z <= 300; z += 3.5) {
      const v = regionField(x, z);
      assert.ok(v >= -1 && v <= 1, `field out of range at ${x},${z}: ${v}`);
    }
  }
});

test('REGIONAL IS NOT PER-CELL HASH, and this is the measurement that says so', () => {
  const { seams, boundaries, fraction } = variantSeamFraction(cells, 3);
  assert.ok(boundaries > 100, `only ${boundaries} shared boundaries — too few to conclude from`);
  // The claim in the module header and in the research write-up. If a later change to the
  // wavelengths pushes this back toward the hash rate, the distinction has stopped carrying
  // and the lever should be reported as failing rather than renamed.
  assert.ok(
    fraction < HASH_SEAM_RATE * 0.65,
    `seam rate ${(100 * fraction).toFixed(1)}% (${seams}/${boundaries}) is not clearly below the ` +
      `hash form's ${(100 * HASH_SEAM_RATE).toFixed(1)}%`,
  );
});

test('the base token keeps the plurality — this is variation, not a recolouring', () => {
  const cov = bandCoverage(cells, 3);
  assert.equal(cov.length, 3);
  assert.ok(cov[0]! > cov[1]! && cov[0]! > cov[2]!, `base token is not the plurality: ${cov}`);
  assert.ok(Math.abs(cov.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('the DEEP band stays a minority — the one token that could recolour the island', () => {
  const cov = bandCoverage(cells, 4);
  assert.equal(cov.length, 4);
  assert.ok(cov[3]! > 0.1, `deep band at ${(100 * cov[3]!).toFixed(1)}% is too small to read`);
  assert.ok(cov[3]! < 0.3, `deep band at ${(100 * cov[3]!).toFixed(1)}% is no longer a minority`);
  assert.ok(cov[0]! > cov[3]!, 'the deep token must not outrank the base token');
});

test('three bands never reach the deep token, so a permitted island cannot deliver it', () => {
  // The gate that keeps the open-question-bound token out of every direction but the one that
  // exists to price it. A three-band call must be incapable of returning index 3.
  for (let x = -200; x <= 200; x += 2.5) {
    for (let z = -200; z <= 200; z += 2.5) {
      assert.notEqual(variantAt(x, z, 3), 3);
    }
  }
});

test('four bands only ever deepen — the deep token replaces the DARK band, never the light one', () => {
  for (let x = -200; x <= 200; x += 2.5) {
    for (let z = -200; z <= 200; z += 2.5) {
      const three = variantAt(x, z, 3);
      const four = variantAt(x, z, 4);
      if (four === 3) {
        assert.equal(three, 1, 'the deep band must come out of the darker variant, not the base');
      } else {
        assert.equal(four, three, 'four-band banding must agree with three outside the deep band');
      }
    }
  }
});

test('every band maps to a token the closed palette already holds', () => {
  // The palette claim, asserted rather than described: this lever selects among authored
  // entries and does not widen the fence.
  const fam = STATUS_TOKENS.get('healthy')!;
  const byIndex = [fam.top[0]!, fam.top[1]!, fam.top[2]!, fam.side];
  for (const t of byIndex) assert.match(t, /^#[0-9a-f]{6}$/);
  assert.equal(new Set(byIndex).size, 4, 'the four ground tokens must be distinct to be a variation');
});

test('the deep edge sits inside the darker band, or the four-band form is a no-op', () => {
  assert.ok(DEEP_BAND_EDGE < -0.28, 'the deep edge must be below the dark band edge');
  assert.ok(DEEP_BAND_EDGE > -1, 'a deep edge at or below the field floor would select nothing');
});
