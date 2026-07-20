// stepping-stone.test.ts — the flattest hero's contract: sound, cheap, and deliberately
// LOW. The owner rejected over-rendered baked stones (#832), so this test also pins the
// piece as a handful of nodes — a regression toward a busy faceted slab would fail here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { check } from '../invariants.js';
import { renderDetailed } from '../render-svg.js';
import { findDepthConflicts } from '../draw-order.js';
import { steppingStone, DEFAULTS } from './stepping-stone.js';

test('the stepping stone is physically sound at its defaults', () => {
  assert.deepEqual(check(steppingStone()), []);
  const detail = renderDetailed(steppingStone(), { showGround: false });
  assert.deepEqual(findDepthConflicts(detail.polys), []);
  assert.ok(!/NaN|Infinity/.test(detail.svg), 'no degenerate coordinates');
});

test('the stepping stone stays sound across its parameter space', () => {
  for (const radius of [2, 4.2, 6]) {
    for (const height of [0.8, 1.3, 2.4]) {
      for (const sides of [8, 14, 18]) {
        const v = check(steppingStone({ radius, height, sides }));
        assert.deepEqual(v, [], `unsound at ${JSON.stringify({ radius, height, sides })}: ${JSON.stringify(v)}`);
      }
    }
  }
});

test('the stepping stone stays a handful of nodes — it is the LEAST rendered hero', () => {
  const detail = renderDetailed(steppingStone(), { showGround: false });
  const nodes = (detail.svg.match(/<(polygon|path|ellipse)/g) ?? []).length;
  assert.ok(nodes < 30, `the stepping stone baked to ${nodes} nodes — it should be a flat rounded slab, not a busy solid`);
});

test('the stepping stone is deterministic — same parameters, byte-identical SVG', () => {
  assert.equal(renderDetailed(steppingStone()).svg, renderDetailed(steppingStone()).svg);
});

test('the shipped defaults are the ones under test', () => {
  assert.equal(DEFAULTS.style_theme, 'pathstone');
  assert.ok(DEFAULTS.height <= 1.5, 'the slab is low by default');
});
