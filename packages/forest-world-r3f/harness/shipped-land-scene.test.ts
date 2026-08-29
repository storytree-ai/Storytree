// shipped-land-scene.test.ts — the comparison page's own controls, proved without a GPU.
//
// ⚠⚠ WHY THIS FILE EXISTS AT ALL. Three of the four arms are ONE function called with one input
// changed, which makes them a controlled comparison by construction. The fourth is not:
// `treated` is drawn by the EXPERIMENT's material and `banded` by the SHIPPED one, so "these two
// differ only in the grain" is a claim rather than a property. It is closed here, arithmetically:
// if the two materials' ramps are identical for this island's token, the only thing left that can
// differ is the grain. Without this the reference arm would be an assertion dressed as a picture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { groundRamp } from '../src/banded-ground-material.js';
import { SHADE_LEVELS, toHex, tokenRamp } from '../src/shade-ladder.js';
import {
  GROUND_ROWS,
  GROUND_TOKENS,
  LAND_ARMS,
  LAND_STEPS,
  LAND_ZOOMS,
  groundRowOf,
  shippedParcels,
  soleIslandToken,
} from './shipped-land-scene.js';
import { SHIPPED_GROUND_COLOUR } from './shipped-baseline.js';

test('the ladder is a LADDER — every step changes exactly one rung, in order', () => {
  assert.deepEqual([...LAND_ARMS], ['flat', 'relief', 'banded', 'treated']);
  assert.equal(LAND_STEPS.length, LAND_ARMS.length - 1);
  // Derived rather than written out: an arm inserted in the middle must move the steps with it,
  // or the report would go on describing the old ladder while drawing the new one.
  LAND_STEPS.forEach(([a, b], i) => {
    assert.equal(a, LAND_ARMS[i]);
    assert.equal(b, LAND_ARMS[i + 1]);
  });
  assert.deepEqual([...LAND_ZOOMS], [2, 8], 'the overview and the zoomed read, as everywhere else');
});

test('THE REFERENCE ARM IS HONEST: both materials build the SAME ramp for this island', () => {
  // `banded` selects from `groundRamp(GROUND_TOKENS)`; `treated` selects from the harness
  // material's `tokenRamp(token)`. If those agree, the two arms differ in the grain and in
  // nothing else — which is the whole claim the reference arm makes.
  const token = soleIslandToken(shippedParcels());
  const rows = [...SHIPPED_GROUND_COLOUR.values()];
  const row = rows.indexOf(token);
  assert.ok(row >= 0, `the island token ${token} is not one of the shipped ground tokens`);

  const shipped = groundRamp(rows)
    .slice(row * SHADE_LEVELS.length, (row + 1) * SHADE_LEVELS.length)
    .map(([r, g, b]) => toHex({ r: Math.round(r! * 255), g: Math.round(g! * 255), b: Math.round(b! * 255) }));
  const experiment = tokenRamp(token).map(toHex);
  assert.deepEqual(shipped, experiment);
  // NON-VACUITY: a ramp of one repeated colour would satisfy the equality above and prove nothing
  // about either material. The island's token must actually shade.
  assert.ok(new Set(shipped).size >= 3, `the token ${token} delivers only ${new Set(shipped).size} colours`);
});

test('the island the arms draw is SINGLE-STATUS, which the reference arm requires', () => {
  // ⚠ AND IT IS A REQUIREMENT RATHER THAN A CONVENIENCE. `harness/banded-material.ts` takes ONE
  // token per material, so on a mixed island the reference arm would paint every parcel the same
  // state — a picture that lies about the map's whole job (ADR-0392 D5 / ADR-0398 D7). The
  // builder refuses rather than drawing it; this proves the refusal can fire.
  const cells = shippedParcels();
  assert.ok(cells.length > 100, `the shipped island fixture should be ~164 parcels, got ${cells.length}`);
  assert.doesNotThrow(() => soleIslandToken(cells));
  const mixed = [...cells, { ...cells[0]!, material: 'unhealthy' }];
  assert.throws(() => soleIslandToken(mixed), /single-status island, found 2/);
});

test('every parcel of the fixture resolves to a token the shipped canvas actually holds', () => {
  // The arms are only the product's land while the colours are the product's colours. A parcel
  // whose status fell through to a default nobody authored would be a picture of a map that does
  // not exist.
  for (const cell of shippedParcels()) {
    const status = cell.material ?? 'unknown';
    assert.ok(SHIPPED_GROUND_COLOUR.has(status), `no shipped ground colour for status ${status}`);
  }
});

test('the ramp ROWS and the ramp TOKENS agree, status for status', () => {
  // ⚠ THE WORST FAILURE THIS SURFACE CAN HAVE, asked of the comparison page's own copy of the
  // tables. If the row a parcel is given does not index the token that parcel should wear, every
  // arm below `relief` paints each parcel with a DIFFERENT status's colour — wrong, plausible,
  // and undetectable by eye. `shipped-baseline.test.ts` asks the same question of the shipped
  // canvas; this asks it of the instrument, which is a second, independent copy of the ordering.
  for (const [status, token] of SHIPPED_GROUND_COLOUR) {
    const row = GROUND_ROWS.get(status);
    assert.ok(row !== undefined, `no ramp row for status ${status}`);
    assert.equal(GROUND_TOKENS[row], token, `row ${row} is not ${status}'s token`);
    assert.equal(groundRowOf(status), row);
  }
  assert.equal(GROUND_TOKENS.length, GROUND_ROWS.size, 'one row per status, no gaps');
  // An unrecognised status takes `unknown`'s row — the one state that means "no data". Any other
  // fallback would have the picture assert something about work it could not classify.
  assert.equal(groundRowOf('not-a-status'), GROUND_ROWS.get('unknown'));
  assert.equal(groundRowOf(undefined), GROUND_ROWS.get('unknown'));
  // NON-VACUITY: `unknown` is not row 0, so falling back to it is a real choice rather than the
  // default a zero-filled buffer would give.
  assert.notEqual(GROUND_ROWS.get('unknown'), 0);
});
