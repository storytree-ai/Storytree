// spacing — ADR-0521: the packer's three by-eye gaps are a fraction of island size. These pin
// the RULE (one ratio, three readings) and the ladder's shape; whether a rung LOOKS right is the
// owner's, off the rendered sheet, never a test's.
//
// Moved here with the module it tests (`the-packing-moves-to-its-own-package`, ADR-0537 D1) —
// it was `apps/studio/src/lib/islandSpacing.test.ts`, and its assertions are unchanged. Only the
// runner changed: this package tests through `node:test` like its `@storytree/forest-world`
// neighbour, where the studio's suites run under vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ISLAND_SPACING_RATIO,
  ISLAND_SPACING_RUNGS,
  PRE_ADR0521_SPACING,
  SPACING_CONTROL_ARM,
  gapBetween,
  loneSwing,
  spacingArmId,
} from './spacing.js';

test('the gap scales linearly with the ratio and with the MEAN of the two radii', () => {
  assert.equal(gapBetween(100, 100, 0.5), 50);
  assert.equal(gapBetween(80, 120, 0.5), 50);
  assert.equal(gapBetween(100, 100, 0.25), 25);
  assert.equal(gapBetween(100, 100, 0), 0);
});

test('a lone island swings by its own radius PLUS the gap a same-size neighbour would get — no second constant', () => {
  assert.equal(loneSwing(100, 0.5), 100 + gapBetween(100, 100, 0.5));
  assert.equal(loneSwing(77, 0), 77);
});

test('the ladder descends to the hex floor (rung 0), carries the shipped pick, and the pick is a rung', () => {
  for (let i = 1; i < ISLAND_SPACING_RUNGS.length; i += 1) {
    assert.ok((ISLAND_SPACING_RUNGS[i] ?? NaN) < (ISLAND_SPACING_RUNGS[i - 1] ?? NaN));
  }
  assert.equal(ISLAND_SPACING_RUNGS.at(-1), 0);
  assert.ok(ISLAND_SPACING_RUNGS.includes(ISLAND_SPACING_RATIO));
  assert.ok(ISLAND_SPACING_RATIO >= 0);
});

test('the pre-ADR-0521 gaps are typed as history and frozen — the control arm stands on exactly these', () => {
  assert.deepEqual({ ...PRE_ADR0521_SPACING }, { rankGap: 40, islandGap: 60, rankSwing: 140 });
  assert.ok(Object.isFrozen(PRE_ADR0521_SPACING));
});

test('arm ids: the control is literally `today` (the harness page reads the same word off the manifest), then one per rung, distinct', () => {
  assert.equal(SPACING_CONTROL_ARM, 'today');
  const ids = [SPACING_CONTROL_ARM, ...ISLAND_SPACING_RUNGS.map((r) => spacingArmId(r))];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(spacingArmId(0.2), 'spacing-0.2');
});
