// Red-green on the ONE playhead occupancy bar (`traversal-panel-arc`, increment
// `traversal-panel-spine-render`).
//
// Four rules, each of which fails silently and plausibly if it is wrong — which is exactly why they are
// asserted here rather than looked at:
//
//   1. the plotted quantity is `residentInputTokens` and never the monotonic billing total, so a
//      RECEDING series must render a FALLING bar (the signed reference trace recedes twice; ADR-0248);
//   2. occupancy is HELD at the last observation at-or-before the playhead, never interpolated;
//   3. the fill splits at EXACTLY 500k, with only the over-portion red;
//   4. a child's window is never summed into the parent's figure.
//
// Plus the absence rule: an un-ingested session has no series, and that is `observationCount: 0` — the
// surface says so rather than drawing a flat zero.

import { describe, it, expect } from 'vitest';
import type { TraversalEventEnvelope } from '../types';
import {
  buildOccupancySeries,
  formatTokens,
  occupancyAt,
  occupancyFill,
  OCCUPANCY_THRESHOLD_TOKENS,
} from './traversalOccupancy';

const SESSION = 'kind-hamilton-e938be';
const T0 = Date.parse('2026-08-11T08:00:00.000Z');
const MIN = 60_000;

function modelContext(
  over: {
    atMs: number;
    resident?: number;
    cumulative?: number;
    added?: number;
    sessionId?: string;
  },
): TraversalEventEnvelope {
  const event = {
    kind: 'model_context' as const,
    eventId: `occupancy:${over.atMs}`,
    sessionId: over.sessionId ?? SESSION,
    at: new Date(over.atMs).toISOString(),
    cumulativeInputTokens: over.cumulative ?? 5_000_000,
    addedInputTokens: over.added ?? 5_000_000,
  };
  return over.resident === undefined ? event : { ...event, residentInputTokens: over.resident };
}

describe('the quantity is the resident figure, and it can fall', () => {
  it('renders a FALLING bar for the reference trace’s receding series', () => {
    // The two recessions the signed design cites as its evidence, in tokens.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 240_900 }),
        modelContext({ atMs: T0 + MIN, resident: 228_100 }),
        modelContext({ atMs: T0 + 2 * MIN, resident: 239_800 }),
        modelContext({ atMs: T0 + 3 * MIN, resident: 229_600 }),
      ],
      SESSION,
    );

    const fills = series.observations.map(
      (observation) => occupancyFill(observation.residentTokens, series.scaleTokens).safeFraction,
    );
    expect(fills[1]).toBeLessThan(fills[0] as number);
    expect(fills[3]).toBeLessThan(fills[2] as number);
  });

  it('ignores the monotonic billing total and the dead `addedInputTokens` duplicate', () => {
    // Both billing fields are enormous and both are RISING; the resident figure is absent. Reading
    // either one would draw a bar; the honest answer is that nothing was observed.
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, cumulative: 1_200_000, added: 1_200_000 }),
        modelContext({ atMs: T0 + MIN, cumulative: 2_400_000, added: 2_400_000 }),
      ],
      SESSION,
    );

    expect(series.modelContextCount).toBe(2);
    expect(series.observationCount).toBe(0);
    expect(series.observations).toEqual([]);
    expect(series.maxResidentTokens).toBe(0);
  });

  it('reports an un-ingested session as unobserved rather than as an empty window', () => {
    const series = buildOccupancySeries([], SESSION);
    expect(series.observationCount).toBe(0);
    expect(occupancyAt(series, T0)).toBeNull();
  });
});

describe('occupancy is held at the playhead, never interpolated', () => {
  const series = buildOccupancySeries(
    [
      modelContext({ atMs: T0, resident: 100_000 }),
      modelContext({ atMs: T0 + 100 * MIN, resident: 200_000 }),
    ],
    SESSION,
  );

  it('holds the last observation through the gap', () => {
    // Halfway between the two: an interpolating bar would read 150k. The window's occupancy between
    // requests is simply the last thing observed.
    expect(occupancyAt(series, T0 + 50 * MIN)?.residentTokens).toBe(100_000);
    expect(occupancyAt(series, T0 + 99 * MIN)?.residentTokens).toBe(100_000);
    expect(occupancyAt(series, T0 + 100 * MIN)?.residentTokens).toBe(200_000);
  });

  it('answers null BEFORE the first observation — unobserved is not zero', () => {
    expect(occupancyAt(series, T0 - MIN)).toBeNull();
  });

  it('holds the final observation past the end of the series', () => {
    expect(occupancyAt(series, T0 + 10_000 * MIN)?.residentTokens).toBe(200_000);
  });
});

describe('the fill splits at exactly 500k, and only the excess is red', () => {
  const SCALE = 1_000_000;

  it('has NO red at exactly the threshold', () => {
    const fill = occupancyFill(OCCUPANCY_THRESHOLD_TOKENS, SCALE);
    expect(fill.overFraction).toBe(0);
    expect(fill.safeFraction).toBe(0.5);
  });

  it('reddens only the portion past the threshold', () => {
    const fill = occupancyFill(600_000, SCALE);
    expect(fill.safeFraction).toBe(0.5);
    expect(fill.overFraction).toBeCloseTo(0.1, 10);
    expect(fill.overStartFraction).toBe(0.5);
  });

  it('leaves a reading under the threshold entirely safe', () => {
    const fill = occupancyFill(240_900, SCALE);
    expect(fill.overFraction).toBe(0);
    expect(fill.safeFraction).toBeCloseTo(0.2409, 10);
  });

  it('grows the track ceiling rather than clipping a series that runs past the base scale', () => {
    const series = buildOccupancySeries([modelContext({ atMs: T0, resident: 1_300_000 })], SESSION);
    expect(series.scaleTokens).toBeGreaterThanOrEqual(1_300_000);

    const fill = occupancyFill(1_300_000, series.scaleTokens);
    // The whole reading is represented — nothing is clipped off the end of the track…
    expect(fill.safeFraction + fill.overFraction).toBeCloseTo(1_300_000 / series.scaleTokens, 10);
    // …and the ceiling keeps headroom above the peak, so a bar at its maximum is not a full bar.
    expect(fill.safeFraction + fill.overFraction).toBeLessThan(1);
    expect(fill.overFraction).toBeGreaterThan(0);
  });
});

describe('child windows are never summed into the parent figure', () => {
  it('excludes an observation belonging to another session’s window, and counts the exclusion', () => {
    const series = buildOccupancySeries(
      [
        modelContext({ atMs: T0, resident: 100_000 }),
        modelContext({ atMs: T0 + MIN, resident: 90_000, sessionId: 'some-child-agent' }),
      ],
      SESSION,
    );

    expect(series.observationCount).toBe(1);
    expect(series.foreignWindowCount).toBe(1);
    // 190_000 would be the merged figure the design's anti-goals forbid.
    expect(occupancyAt(series, T0 + 2 * MIN)?.residentTokens).toBe(100_000);
  });
});

describe('the readout', () => {
  it('formats thousands and millions', () => {
    expect(formatTokens(240_900)).toBe('240.9k');
    expect(formatTokens(1_300_000)).toBe('1.30M');
  });
});
