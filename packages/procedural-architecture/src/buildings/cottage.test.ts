// cottage.test.ts — the shingled cottage's contract: physically sound across its parameter
// space, ordered without inversion, and byte-deterministic (the prove-it-gate needs it).

import test from 'node:test';
import assert from 'node:assert/strict';

import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { cottage, DEFAULTS } from './cottage.js';

test('the cottage is physically sound and orders without inversion at its defaults', () => {
  const model = cottage();
  assert.deepEqual(check(model), []);
  const detail = renderDetailed(model, { showGround: false });
  assert.deepEqual(findDepthConflicts(detail.polys), []);
  assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
});

test('the cottage stays sound across its parameter space, not just at its defaults', () => {
  for (const width_x of [8, 11, 15]) {
    for (const width_y of [6, 9, 12]) {
      for (const wallHeight of [5, 7, 9]) {
        for (const roofPitch of [0.6, 1.05, 1.5]) {
          const v = check(cottage({ width_x, width_y, wallHeight, roofPitch }));
          assert.deepEqual(v, [], `unsound at ${JSON.stringify({ width_x, width_y, wallHeight, roofPitch })}: ${JSON.stringify(v)}`);
        }
      }
    }
  }
});

test('the cottage really has a door on grade and a window above the sill', () => {
  const model = cottage();
  const door = model.apertures.find((a) => a.kind === 'door');
  const window = model.apertures.find((a) => a.id === 'window');
  assert.ok(door && door.sill === 0, 'the door stands on grade');
  assert.ok(window && window.sill > 0, 'the window sits above the sill line');
});

test('the cottage is deterministic — same parameters, byte-identical SVG', () => {
  assert.equal(renderDetailed(cottage()).svg, renderDetailed(cottage()).svg);
});

test('the shipped defaults are the ones under test', () => {
  assert.equal(DEFAULTS.style_theme, 'cottage');
});
