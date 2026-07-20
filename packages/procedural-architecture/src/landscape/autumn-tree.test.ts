// autumn-tree.test.ts — the canopy's contract. Two things matter beyond soundness: the
// node cost stays bounded (a canopy of deeply-overlapping blobs explodes station-3 splits —
// an early cut baked to 2,591 nodes), and the crown is a cluster attached to a wide core so
// no piece floats off the narrow trunk.

import test from 'node:test';
import assert from 'node:assert/strict';

import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { autumnTree, expectedTreePartCount, DEFAULTS } from './autumn-tree.js';

test('the autumn tree is physically sound and orders without inversion at its defaults', () => {
  const model = autumnTree();
  assert.deepEqual(check(model), []);
  const detail = renderDetailed(model, { showGround: false });
  assert.deepEqual(findDepthConflicts(detail.polys), []);
  assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
});

test('the tree stays sound across its parameter space', () => {
  for (const trunkHeight of [6, 9, 13]) {
    for (const trunkRadius of [2.4, 3.6, 4.8]) {
      for (const crownRadius of [6, 8.5, 11]) {
        const v = check(autumnTree({ trunkHeight, trunkRadius, crownRadius }));
        assert.deepEqual(v, [], `unsound at ${JSON.stringify({ trunkHeight, trunkRadius, crownRadius })}: ${JSON.stringify(v)}`);
      }
    }
  }
});

test('the canopy is a trunk + a core + its bumps', () => {
  assert.equal(autumnTree().parts.length, expectedTreePartCount());
});

test('the tree stays cheap — the split explosion does not come back', () => {
  // The regression this guards: a canopy of deeply-interpenetrating domes multiplies
  // station-3 splits without bound. The current shallow-bump design bakes to ~482 nodes;
  // the ceiling here is generous but far below the 2,591-node cut it replaced.
  const detail = renderDetailed(autumnTree(), { showGround: false });
  const nodes = (detail.svg.match(/<(polygon|path|ellipse)/g) ?? []).length;
  assert.ok(nodes < 900, `the tree baked to ${nodes} nodes — the canopy is interpenetrating too deeply again`);
});

test('the tree is deterministic — same parameters, byte-identical SVG', () => {
  assert.equal(renderDetailed(autumnTree()).svg, renderDetailed(autumnTree()).svg);
});

test('the shipped defaults are the ones under test', () => {
  assert.equal(DEFAULTS.style_theme, 'autumn');
});
