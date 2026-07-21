// forest-hut.test.ts — the forest hut's contract: physically sound across its parameter
// space, ordered without inversion, and byte-deterministic (the prove-it-gate needs it).

import test from 'node:test';
import assert from 'node:assert/strict';

import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { forestHut, DEFAULTS } from './forest-hut.js';

test('the forest hut is physically sound and orders without inversion at its defaults', () => {
  const model = forestHut();
  assert.deepEqual(check(model), []);
  const detail = renderDetailed(model, { showGround: false });
  assert.deepEqual(findDepthConflicts(detail.polys), []);
  assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
});

test('the forest hut stays sound across its parameter space, not just at its defaults', () => {
  for (const width_x of [7, 9, 13]) {
    for (const width_y of [7, 9.5, 13]) {
      for (const wallHeight of [5, 6.5, 8]) {
        for (const roofPitch of [0.7, 1.45, 1.65]) {
          for (const chimneyWidth of [1, 1.5, 2.2]) {
            const v = check(forestHut({ width_x, width_y, wallHeight, roofPitch, chimneyWidth }));
            assert.deepEqual(
              v,
              [],
              `unsound at ${JSON.stringify({ width_x, width_y, wallHeight, roofPitch, chimneyWidth })}: ${JSON.stringify(v)}`,
            );
          }
        }
      }
    }
  }
});

test('the forest hut really has a door on grade and a window above the sill', () => {
  const model = forestHut();
  const door = model.apertures.find((a) => a.kind === 'door');
  const window = model.apertures.find((a) => a.id === 'window');
  assert.ok(door && door.sill === 0, 'the door stands on grade');
  assert.ok(window && window.sill > 0, 'the window sits above the sill line');
  // door on the gable end, window on the long side — distinct facets (the concept's front).
  assert.ok(door && window && door.facet !== window.facet, 'the door and window face different walls');
});

test('the forest hut chimney clears the ridge', () => {
  const model = forestHut();
  const roof = model.parts.find((pt) => pt.id === 'roof');
  const chimney = model.parts.find((pt) => pt.id === 'chimney');
  assert.ok(roof && chimney, 'roof and chimney are both present');
  // the stack must rise ABOVE the ridge, or it is not a chimney the eye reads.
  assert.ok(chimney.topZ > roof.topZ, `chimney tops out at ${chimney.topZ}, not above the ridge ${roof.topZ}`);
});

test('the forest hut is deterministic — same parameters, byte-identical SVG', () => {
  assert.equal(renderDetailed(forestHut()).svg, renderDetailed(forestHut()).svg);
});

test('the shipped defaults are the ones under test', () => {
  assert.equal(DEFAULTS.style_theme, 'foresthut');
});
