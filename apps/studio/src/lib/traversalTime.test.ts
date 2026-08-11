// Red-green on the traversal axis (`traversal-panel-arc`, increment `traversal-panel-spine-render`).
//
// These pin the two rules the signed design states about time, both of which are geometry and neither
// of which an eyeball can check: a confirmed idle span FOLDS to a bounded stub (never removed, never
// stretched), and an active span takes room in proportion to how much HAPPENED in it rather than to how
// long it lasted. Nothing here asserts appearance — the owner's LOOK is `traversal-panel-attestation`.

import { describe, it, expect } from 'vitest';
import {
  buildTraversalTimeScale,
  formatClock,
  formatDuration,
  timeAt,
  TRAVERSAL_TIME_DEFAULTS,
  yAt,
} from './traversalTime';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.parse('2026-08-11T08:00:00.000Z');

/** `count` instants spaced `stepMs` apart from `fromMs` — one burst of activity. */
function burst(fromMs: number, count: number, stepMs = 20_000): number[] {
  return Array.from({ length: count }, (_unused, index) => fromMs + index * stepMs);
}

describe('idle spans fold to a bounded stub', () => {
  it('gives a 3h18m gap and a 31m gap the SAME pixels — a fold is never stretched', () => {
    // Two idle spans an order of magnitude apart, each between bursts of equal density.
    const times = [
      ...burst(T0, 5),
      ...burst(T0 + 31 * MIN, 5),
      ...burst(T0 + 31 * MIN + 3 * HOUR + 18 * MIN, 5),
    ];
    const scale = buildTraversalTimeScale(times);

    expect(scale.folds).toHaveLength(2);
    const heights = scale.folds.map((fold) => fold.yEnd - fold.yStart);
    expect(heights).toEqual([TRAVERSAL_TIME_DEFAULTS.foldPx, TRAVERSAL_TIME_DEFAULTS.foldPx]);
    // The durations they stand for differ by more than 6x — the stubs do not.
    const durations = scale.folds.map((fold) => fold.durationMs);
    expect((durations[1] as number) / (durations[0] as number)).toBeGreaterThan(6);
  });

  it('never REMOVES a fold — the stub is strictly positive and carries its real duration', () => {
    const times = [...burst(T0, 3), ...burst(T0 + 6 * HOUR, 3)];
    const scale = buildTraversalTimeScale(times);

    expect(scale.folds).toHaveLength(1);
    const fold = scale.folds[0]!;
    expect(fold.yEnd).toBeGreaterThan(fold.yStart);
    // The gap runs from the last instant of burst one to the first of burst two.
    expect(fold.durationMs).toBe(6 * HOUR - 2 * 20_000);
    expect(fold.label).toBe('5h59');
  });

  it('does NOT fold a gap below the idle threshold — it stays inside the active run', () => {
    const times = [...burst(T0, 3), ...burst(T0 + 4 * MIN, 3)];
    const scale = buildTraversalTimeScale(times);

    expect(scale.folds).toHaveLength(0);
    expect(scale.segments.every((segment) => segment.kind === 'active')).toBe(true);
    expect(scale.segments).toHaveLength(1);
  });
});

describe('active spans are weighted by density, not by wall clock', () => {
  it('keeps an eight-hour trace legible when the work is bunched into the first twenty minutes', () => {
    // 40 events in 20 minutes, then a 7h40m silence, then 3 events. A minutes-to-pixels axis would give
    // the busy stretch ~4% of the height; the design requires the opposite.
    const times = [...burst(T0, 40, 30_000), ...burst(T0 + 8 * HOUR, 3)];
    const scale = buildTraversalTimeScale(times);

    const active = scale.segments.filter((segment) => segment.kind === 'active');
    expect(active).toHaveLength(2);
    const busyPx = active[0]!.yEnd - active[0]!.yStart;
    const quietPx = active[1]!.yEnd - active[1]!.yStart;

    expect(busyPx / (busyPx + quietPx)).toBeGreaterThan(0.8);
    // …and the quiet run is still THERE. Density weighting compresses; it never deletes.
    expect(quietPx).toBeGreaterThanOrEqual(TRAVERSAL_TIME_DEFAULTS.minActiveRunPx);
  });

  it('bounds the total height so a 200-event trace stays a panel', () => {
    const scale = buildTraversalTimeScale(burst(T0, 200, 10_000));
    expect(scale.totalPx).toBeLessThanOrEqual(TRAVERSAL_TIME_DEFAULTS.maxActivePx);
  });

  it('gives a single-event run its legibility floor rather than zero height', () => {
    const scale = buildTraversalTimeScale([T0]);
    expect(scale.totalPx).toBe(TRAVERSAL_TIME_DEFAULTS.minActiveRunPx);
  });
});

describe('the axis maps time to pixels and back', () => {
  const times = [...burst(T0, 6), ...burst(T0 + 2 * HOUR, 6)];
  const scale = buildTraversalTimeScale(times);

  it('never runs backwards', () => {
    let previous = -1;
    for (let step = 0; step <= 100; step += 1) {
      const y = yAt(scale, scale.startMs + ((scale.endMs - scale.startMs) * step) / 100);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });

  it('pins both ends and clamps outside them', () => {
    expect(yAt(scale, scale.startMs)).toBe(0);
    expect(yAt(scale, scale.endMs)).toBe(scale.totalPx);
    expect(yAt(scale, scale.startMs - HOUR)).toBe(0);
    expect(yAt(scale, scale.endMs + HOUR)).toBe(scale.totalPx);
  });

  it('inverts: scrubbing to a pixel row lands back on the instant it stands for', () => {
    for (const time of times) {
      expect(timeAt(scale, yAt(scale, time))).toBeCloseTo(time, -1);
    }
  });

  it('answers an empty trace with an empty scale rather than a divide-by-zero', () => {
    const empty = buildTraversalTimeScale([]);
    expect(empty.totalPx).toBe(0);
    expect(empty.segments).toHaveLength(0);
    expect(yAt(empty, T0)).toBe(0);
    expect(timeAt(empty, 10)).toBe(0);
  });
});

describe('durations read the way the fold labels them', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatDuration(48_000)).toBe('48s');
    expect(formatDuration(31 * MIN)).toBe('31m');
    expect(formatDuration(3 * HOUR + 18 * MIN)).toBe('3h18');
    expect(formatDuration(52 * HOUR)).toBe('2d 4h');
  });

  it('formats the transport clock', () => {
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock(3 * HOUR + 7 * MIN + 9000)).toBe('3:07:09');
    expect(formatClock(30 * HOUR)).toBe('1d 6:00');
  });
});
