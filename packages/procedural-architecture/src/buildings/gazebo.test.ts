// gazebo.test.ts — the open pavilion's contract. The interesting invariant is the top
// plate: a roof rests on four posts through a plate that is ATTACHED to one of them, and the
// checker must be satisfied that the whole assembly is carried to ground without floating.

import test from 'node:test';
import assert from 'node:assert/strict';

import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { gazebo, DEFAULTS } from './gazebo.js';

test('the gazebo is physically sound and orders without inversion at its defaults', () => {
  const model = gazebo();
  assert.deepEqual(check(model), []);
  const detail = renderDetailed(model, { showGround: false });
  assert.deepEqual(findDepthConflicts(detail.polys), []);
  assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
});

test('the gazebo stays sound across its parameter space', () => {
  for (const width of [6, 8, 11]) {
    for (const postHeight of [4, 6, 8]) {
      for (const roofPitch of [0.4, 0.62, 1.0]) {
        for (const eaveOverhang of [0.6, 1.2, 2.0]) {
          const v = check(gazebo({ width, postHeight, roofPitch, eaveOverhang }));
          assert.deepEqual(v, [], `unsound at ${JSON.stringify({ width, postHeight, roofPitch, eaveOverhang })}: ${JSON.stringify(v)}`);
        }
      }
    }
  }
});

test('every part of the gazebo is carried to ground — nothing floats', () => {
  const model = gazebo();
  const byId = new Map(model.parts.map((p) => [p.id, p]));
  // the plate is fixed to a post and sits exactly at its top
  const plate = byId.get('plate');
  const post0 = byId.get('post-0');
  assert.ok(plate && post0, 'plate and a post exist');
  assert.equal(plate.relation, 'attached');
  assert.equal(plate.parentId, 'post-0');
  assert.ok(Math.abs(plate.baseZ - post0.topZ) < 1e-6, 'the plate caps the posts');
  // the roof stands on the plate
  const roof = byId.get('roof');
  assert.ok(roof && roof.relation === 'on' && roof.parentId === 'plate');
});

test('the gazebo is deterministic — same parameters, byte-identical SVG', () => {
  assert.equal(renderDetailed(gazebo()).svg, renderDetailed(gazebo()).svg);
});

test('the shipped defaults are the ones under test', () => {
  assert.equal(DEFAULTS.style_theme, 'gazebo');
});
