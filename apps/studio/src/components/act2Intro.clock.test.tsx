// @vitest-environment jsdom
//
// act2Intro — the CLOCK half of the Act 2 player: the speed dial (ADR-0286) and the plan hold that
// lets a run survive the studio's cached-then-confirmed tree payload.
//
// Split from `act2Intro.test.ts` because these need a React renderer and a jsdom window; that file
// stays pure node-env arithmetic. The clock is driven by an INJECTED `Act2IntroClock`, so a run is
// a deterministic sequence of timestamps rather than a wait on real rAF — the same seam the
// player's own `clock` option exists for.

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAct2Intro, type Act2IntroClock } from './act2Intro.js';
import type { ForestRegrowStory, ForestRegrowTrailEdge } from '@storytree/app-surface';

afterEach(cleanup);

const GRAPH: readonly ForestRegrowStory[] = [
  { id: 'a', dependsOn: [] },
  { id: 'b', dependsOn: ['a'] },
  { id: 'c', dependsOn: ['b'] },
];

const EDGES: readonly ForestRegrowTrailEdge[] = [
  { from: 'a', to: 'b', segments: [{ id: 's1' }] },
  { from: 'b', to: 'c', segments: [{ id: 's2' }] },
];

/**
 * A hand-cranked rAF. `advance(ms)` delivers ONE frame that far ahead; `elapse(ms)` delivers as
 * many frames as it takes to cover that span.
 *
 * `elapse` exists because the player clamps a single frame's delta to 500 ms — a backstop against a
 * pathological gap. A test that hands it one enormous frame measures the clamp, not the dial.
 */
const MAX_FRAME_MS = 250;

function manualClock(): {
  clock: Act2IntroClock;
  advance: (ms: number) => void;
  elapse: (ms: number) => void;
} {
  let next: ((t: number) => void) | null = null;
  let now = 0;
  const advance = (ms: number): void => {
    now += ms;
    const cb = next;
    next = null;
    if (cb) act(() => cb(now));
  };
  return {
    clock: {
      requestFrame: (callback) => {
        next = callback;
        return 1;
      },
      cancelFrame: () => {
        next = null;
      },
    },
    advance,
    elapse: (ms: number) => {
      let left = ms;
      while (left > 1e-9) {
        const step = Math.min(left, MAX_FRAME_MS);
        advance(step);
        left -= step;
      }
    },
  };
}

/** Play at `speed` for `elapsedMs` of wall clock and report where the cursor landed. */
function runFor(speed: number | undefined, elapsedMs: number): number {
  const { clock, advance, elapse } = manualClock();
  const { result } = renderHook(() =>
    useAct2Intro({
      enabled: true,
      stories: GRAPH,
      edges: EDGES,
      ...(speed === undefined ? {} : { speed }),
      clock,
    }),
  );
  act(() => result.current.replay());
  // The first frame seeds `previous` (it cannot know an elapsed time yet), so it advances by the
  // 1/60 s the player assumes; every frame after it is real elapsed time.
  advance(0);
  elapse(elapsedMs);
  return result.current.progress;
}

describe('the regrow speed dial (ADR-0286)', () => {
  it('crosses the plan in its own duration at 1x', () => {
    const { clock, advance, elapse } = manualClock();
    const { result } = renderHook(() =>
      useAct2Intro({ enabled: true, stories: GRAPH, edges: EDGES, speed: 1, clock }),
    );
    const durationMs = result.current.plan!.durationMs;
    act(() => result.current.replay());
    advance(0);
    elapse(durationMs / 2);
    // Half the plan's duration ⇒ half way, give or take the seed frame.
    expect(result.current.progress).toBeGreaterThan(0.49);
    expect(result.current.progress).toBeLessThan(0.53);

    elapse(durationMs / 2);
    expect(result.current.progress).toBe(1);
    expect(result.current.playing, 'a finished run stops itself').toBe(false);
  });

  it('stretches the run below 1x and compresses it above — proportionally', () => {
    const span = 900;
    const half = runFor(0.5, span);
    const one = runFor(1, span);
    const two = runFor(2, span);
    // Same elapsed time, so the cursor travels in proportion to the dial. Compared as RATIOS so
    // the assertion says "0.5x is half as far", not "0.5x reached some magic number".
    expect(half / one).toBeCloseTo(0.5, 2);
    expect(two / one).toBeCloseTo(2, 2);
  });

  it('defaults to the plan’s own pace, and refuses a speed that would stall or reverse it', () => {
    const baseline = runFor(1, 900);
    expect(runFor(undefined, 900)).toBeCloseTo(baseline, 6);
    // A URL can carry anything. None of these may leave the cursor stuck or running backwards.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(runFor(bad, 900), `speed ${bad}`).toBeCloseTo(baseline, 6);
    }
  });

  it('scales the CLOCK, not the schedule — every island forms at the same fraction of the run', () => {
    const planAt = (speed: number): readonly (readonly [string, number])[] => {
      const { result } = renderHook(() =>
        useAct2Intro({ enabled: true, stories: GRAPH, edges: EDGES, speed }),
      );
      const steps = result.current.plan!.steps.map((s) => [s.storyId, s.start] as const);
      cleanup();
      return steps;
    };
    // ADR-0285's causal invariant is about WHERE in the run an island forms. A speed that
    // re-derived the plan could move that; a speed that scales elapsed time cannot.
    expect(planAt(0.25)).toEqual(planAt(2));
  });
});

// ── ADR-0286: a pending first arrival opens on NOTHING ──
//
// The caller cannot start a run until the scene exists to regrow it, so without this the render
// that first has a scene COMMITS the whole settled forest — the most expensive paint on the surface
// — one frame before the effect rewinds it. The intro would open with a flash of its own ending.
describe('the cursor a fresh plan opens on', () => {
  it('rests on the settled forest by default', () => {
    const { result } = renderHook(() => useAct2Intro({ enabled: true, stories: GRAPH, edges: EDGES }));
    expect(result.current.progress).toBe(1);
    expect(result.current.regrowing).toBe(false);
    expect(result.current.state!.presentStoryIds.size, 'the whole forest is on the map').toBe(GRAPH.length);
  });

  it('opens on nothing while a start is pending — no frame of the grown forest', () => {
    const { result } = renderHook(() =>
      useAct2Intro({ enabled: true, stories: GRAPH, edges: EDGES, pendingStart: true }),
    );
    expect(result.current.progress).toBe(0);
    expect(result.current.regrowing).toBe(true);
    expect(result.current.state!.presentStoryIds.size, 'nothing is on the map yet').toBe(0);
    expect(result.current.state!.absentStoryIds.size).toBe(GRAPH.length);
  });

  it('opens the FIRST arriving plan on nothing too — the case that actually flashed', () => {
    // The real sequence: the component mounts before the tree does, so the plan is null for a
    // render or two and only then appears. That is the plan whose opening cursor matters.
    const { result, rerender } = renderHook(
      ({ stories }: { stories: readonly ForestRegrowStory[] | null }) =>
        useAct2Intro({ enabled: true, stories, edges: EDGES, pendingStart: true }),
      { initialProps: { stories: null as readonly ForestRegrowStory[] | null } },
    );
    expect(result.current.plan).toBeNull();
    rerender({ stories: GRAPH });
    expect(result.current.plan).not.toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.state!.presentStoryIds.size).toBe(0);
  });
});

describe('the plan survives a re-fetch of the same graph', () => {
  it('keeps the cursor running when an identical story array arrives', () => {
    const { clock, advance, elapse } = manualClock();
    const { result, rerender } = renderHook(
      ({ stories }: { stories: readonly ForestRegrowStory[] }) =>
        useAct2Intro({ enabled: true, stories, edges: EDGES, speed: 1, clock }),
      { initialProps: { stories: GRAPH } },
    );
    const first = result.current.plan;
    act(() => result.current.replay());
    advance(0);
    elapse(result.current.plan!.durationMs / 4);
    const midRun = result.current.progress;
    expect(midRun).toBeGreaterThan(0.2);

    // The `/api/tree` confirm landing: same graph, brand new arrays (ADR-0240's cached-then-
    // confirmed paint). Before ADR-0286 this reset the cursor to 1 and the intro simply stopped.
    rerender({ stories: GRAPH.map((s) => ({ id: s.id, dependsOn: [...s.dependsOn] })) });
    expect(result.current.plan, 'the same plan object, not a rebuild').toBe(first);
    expect(result.current.progress).toBe(midRun);
    expect(result.current.playing).toBe(true);

    elapse(result.current.plan!.durationMs / 4);
    expect(result.current.progress).toBeGreaterThan(midRun);
  });

  it('still invalidates the cursor when the graph really changes', () => {
    const { clock, advance, elapse } = manualClock();
    const { result, rerender } = renderHook(
      ({ stories }: { stories: readonly ForestRegrowStory[] }) =>
        useAct2Intro({ enabled: true, stories, edges: EDGES, speed: 1, clock }),
      { initialProps: { stories: GRAPH } },
    );
    act(() => result.current.replay());
    advance(0);
    elapse(result.current.plan!.durationMs / 4);
    expect(result.current.progress).toBeGreaterThan(0.2);

    // A story really did appear. The cursor now points into a schedule that no longer exists, so
    // it settles rather than carrying on against the wrong plan.
    rerender({ stories: [...GRAPH, { id: 'd', dependsOn: ['c'] }] });
    expect(result.current.progress).toBe(1);
    expect(result.current.playing).toBe(false);
  });
});
