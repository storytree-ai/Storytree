// islandSpacing — ADR-0521: the packer's three by-eye gaps are a fraction of island size. These pin
// the RULE (one ratio, three readings) and the ladder's shape; whether a rung LOOKS right is the
// owner's, off the rendered sheet, never a test's.

import { describe, expect, it } from 'vitest';

import {
  ISLAND_SPACING_RATIO,
  ISLAND_SPACING_RUNGS,
  PRE_ADR0521_SPACING,
  SPACING_CONTROL_ARM,
  gapBetween,
  loneSwing,
  spacingArmId,
} from './islandSpacing.js';

describe('islandSpacing — the gap is a fraction of the islands it separates', () => {
  it('scales linearly with the ratio and with the MEAN of the two radii', () => {
    expect(gapBetween(100, 100, 0.5)).toBe(50);
    expect(gapBetween(80, 120, 0.5)).toBe(50);
    expect(gapBetween(100, 100, 0.25)).toBe(25);
    expect(gapBetween(100, 100, 0)).toBe(0);
  });

  it('a lone island swings by its own radius PLUS the gap a same-size neighbour would get — no second constant', () => {
    expect(loneSwing(100, 0.5)).toBe(100 + gapBetween(100, 100, 0.5));
    expect(loneSwing(77, 0)).toBe(77);
  });

  it('the ladder descends to the hex floor (rung 0), carries the shipped pick, and the pick is a rung', () => {
    for (let i = 1; i < ISLAND_SPACING_RUNGS.length; i += 1) {
      expect(ISLAND_SPACING_RUNGS[i]!).toBeLessThan(ISLAND_SPACING_RUNGS[i - 1]!);
    }
    expect(ISLAND_SPACING_RUNGS.at(-1)).toBe(0);
    expect(ISLAND_SPACING_RUNGS).toContain(ISLAND_SPACING_RATIO);
    expect(ISLAND_SPACING_RATIO).toBeGreaterThanOrEqual(0);
  });

  it('the pre-ADR-0521 gaps are typed as history and frozen — the control arm stands on exactly these', () => {
    expect(PRE_ADR0521_SPACING).toEqual({ rankGap: 40, islandGap: 60, rankSwing: 140 });
    expect(Object.isFrozen(PRE_ADR0521_SPACING)).toBe(true);
  });

  it('arm ids: the control is literally `today` (the harness page reads the same word off the manifest), then one per rung, distinct', () => {
    expect(SPACING_CONTROL_ARM).toBe('today');
    const ids = [SPACING_CONTROL_ARM, ...ISLAND_SPACING_RUNGS.map(spacingArmId)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(spacingArmId(0.2)).toBe('spacing-0.2');
  });
});
