// @vitest-environment jsdom
//
// The factory-floor health strip's data layer (lib/floorHealth.ts, ADR-0314 D7 / ADR-0316 D5) — the
// api module is mocked and the poll loop runs on fake timers, so every transition is driven exactly.
//
// Two things are worth a red in the wire → band mapping:
//
//   1. THE VOLUME FENCE, on the studio side. `packages/drive/src/factory-health-read.test.ts` holds
//      the reading to carrying no filing / session / report count; this holds the equivalent line
//      one hop later, where the reading becomes something a persistent band renders. The reading
//      legitimately carries `distinctCauses` and `unjoined` — counts over a population — and NEITHER
//      may cross into the band. A strip that shouts a population size is one step from the filing
//      tally that closed `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, whose two
//      closing metrics both counted filings (ADR-0316 D3).
//   2. NO ANSWER IS NEVER A CALM ANSWER. Each of the four wire answers maps to its own band arm, and
//      none of them maps to a reading with zero bottlenecks — which is what "the floor is fine"
//      looks like, and what a missing instrument must never be able to say.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { FloorHealthPayload, FloorHealthReading } from '../types';

const apiMock = vi.hoisted(() => ({
  floorHealth: vi.fn<() => Promise<FloorHealthPayload>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import {
  floorHealthBand,
  useFloorHealth,
  FLOOR_HEALTH_UNREACHABLE,
  FLOOR_POLL_MS,
  FLOOR_RETRY_MS,
} from './floorHealth';

const READING: FloorHealthReading = {
  window: {},
  collapsingRule: 'two live filings are ONE cause when an author joined them',
  attributionRule: 'a reinforcement is attributed to the route standing when it landed',
  loudest: {
    cause: 'a-session-can-drive-a-page-it-cannot-photograph',
    members: ['a-session-can-drive-a-page-it-cannot-photograph', 'a-second-filing', 'a-third-filing'],
    route: 'principle',
    recurrences: 1,
  },
  distinctCauses: 139,
  unjoined: 132,
};

describe('floorHealthBand — the reading becomes a signal', () => {
  it('carries the loudest cause, its recurrence, the window and the collapsing rule', () => {
    const band = floorHealthBand(READING);
    expect(band).toEqual({
      bottlenecks: [
        {
          id: 'a-session-can-drive-a-page-it-cannot-photograph',
          cause: 'a session can drive a page it cannot photograph',
          recurrences: 1,
        },
      ],
      // ADR-0316 D2: the figure never travels without the window it was computed over. Both bounds
      // open means the instrument read all of history, which is a window, not a missing one.
      window: 'all history → now',
      collapsingRule: 'two live filings are ONE cause when an author joined them',
    });
  });

  it('drops distinctCauses, unjoined and members — every one of them is a population count', () => {
    // The band answers "is the floor in trouble", which is a question about ONE cause coming back.
    // `139 distinct causes` and `3 filings, one cause` are both counts over a population, and the
    // second is a filing count wearing a collapse label.
    const band = floorHealthBand(READING);
    expect(Object.keys(band).sort()).toEqual(['bottlenecks', 'collapsingRule', 'window']);
    const serialised = JSON.stringify(band);
    expect(serialised).not.toContain('139');
    expect(serialised).not.toContain('132');
    expect(serialised).not.toContain('members');
    expect(serialised).not.toContain('a-second-filing');
  });

  it('a reading with no loudest cause is a QUIET floor — an empty list, not a zero', () => {
    const { loudest: _loudest, ...quiet } = READING;
    const band = floorHealthBand(quiet);
    expect(band).toMatchObject({ bottlenecks: [] });
  });

  it('names a bounded window when the instrument had one', () => {
    const band = floorHealthBand({
      ...READING,
      window: { from: '2026-08-01T10:10:59.783Z', to: '2026-08-08T10:10:59.783Z' },
    });
    expect(band).toMatchObject({ window: '2026-08-01 → 2026-08-08' });
  });
});

describe('floorHealthBand — no answer is never a calm answer (ADR-0316 D2)', () => {
  it('nothing has answered yet ⇒ pending, not a quiet floor', () => {
    expect(floorHealthBand(undefined)).toEqual({ pending: true });
  });

  it('the read did not answer ⇒ a stated decline', () => {
    // The standing example is the desktop thick client, whose local backend does not serve this
    // route. "No instrument wired" would be a lie (it landed in #1215) and "quiet" a worse one.
    const band = floorHealthBand(FLOOR_HEALTH_UNREACHABLE);
    expect(band).toHaveProperty('declined');
    expect(String((band as { declined: string }).declined)).toMatch(/didn't answer/);
  });

  it('the backend has no document store ⇒ a decline that says so, not an all-clear', () => {
    const band = floorHealthBand(null);
    expect(String((band as { declined: string }).declined)).toMatch(/live store/);
  });

  it('no non-answer ever produces a reading — the four answers stay four different facts', () => {
    for (const state of [undefined, FLOOR_HEALTH_UNREACHABLE, null] as const) {
      expect(floorHealthBand(state)).not.toHaveProperty('bottlenecks');
    }
  });
});

describe('useFloorHealth — drawer-scoped, on its own slow cadence', () => {
  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const renderIt = (open: boolean) =>
    renderHook(({ o }: { o: boolean }) => useFloorHealth(o), { initialProps: { o: open } });

  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.floorHealth.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('fetches nothing while the lens is closed', async () => {
    apiMock.floorHealth.mockResolvedValue({ reading: READING });
    renderIt(false);
    await tick(FLOOR_POLL_MS * 2);
    expect(apiMock.floorHealth).not.toHaveBeenCalled();
  });

  it('fetches immediately on open, then re-polls on the slow cadence', async () => {
    apiMock.floorHealth.mockResolvedValue({ reading: READING });
    const { result } = renderIt(true);
    await tick(0);
    expect(result.current).toEqual(READING);
    expect(apiMock.floorHealth).toHaveBeenCalledTimes(1);

    // Nothing at the shared 30 s cadence — this read scans the whole corpus for a figure that moves
    // on a daily grain, so it deliberately does not ride the world's poll.
    await tick(FLOOR_POLL_MS - 1000);
    expect(apiMock.floorHealth).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(apiMock.floorHealth).toHaveBeenCalledTimes(2);
  });

  it('a failed read with NOTHING known yet says unreachable — never a silent forever-spinner', async () => {
    // The regression `useArcRollups` paid for in #1191: a swallowed failure left the desktop's arc
    // lens on "Reading arcs…" permanently. Here the same swallow would leave the band pending, which
    // reads as "still looking" on a floor nobody is looking at.
    apiMock.floorHealth.mockRejectedValue(new Error('no such route'));
    const { result } = renderIt(true);
    await tick(0);
    expect(result.current).toBe(FLOOR_HEALTH_UNREACHABLE);
  });

  it('retries a failure on the SHORT cadence, so one cold-start blip is not five minutes stale', async () => {
    apiMock.floorHealth.mockRejectedValueOnce(new Error('timed out')).mockResolvedValue({ reading: READING });
    const { result } = renderIt(true);
    await tick(0);
    expect(result.current).toBe(FLOOR_HEALTH_UNREACHABLE);

    await tick(FLOOR_RETRY_MS + 100);
    expect(result.current).toEqual(READING);
  });

  it('a second mount while a read is in flight does NOT fire a second corpus scan', async () => {
    // React StrictMode invokes an effect, tears it down and invokes it again. Measured against the
    // live route, the unguarded version made two concurrent whole-corpus reads that contended: the
    // first landed against a torn-down closure and the second aborted, so the band read "no answer"
    // for a minute over a route that was answering 200s throughout.
    let release: ((p: { reading: FloorHealthReading }) => void) | undefined;
    apiMock.floorHealth.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const { rerender } = renderHook(({ o }: { o: boolean }) => useFloorHealth(o), {
      initialProps: { o: true },
    });
    await tick(0);
    // A re-render that tears the effect down and re-runs it, the StrictMode shape.
    rerender({ o: false });
    rerender({ o: true });
    await tick(0);
    expect(apiMock.floorHealth).toHaveBeenCalledTimes(1);
    release?.({ reading: READING });
  });

  it('absorbs a transient failure once something is known — no flapping to unreachable', async () => {
    apiMock.floorHealth.mockResolvedValueOnce({ reading: READING }).mockRejectedValue(new Error('blip'));
    const { result } = renderIt(true);
    await tick(0);
    await tick(FLOOR_POLL_MS + 100);
    expect(result.current).toEqual(READING);
  });

  it('stops polling the moment the lens closes', async () => {
    apiMock.floorHealth.mockResolvedValue({ reading: READING });
    const { rerender } = renderIt(true);
    await tick(0);
    rerender({ o: false });
    await tick(FLOOR_POLL_MS * 3);
    expect(apiMock.floorHealth).toHaveBeenCalledTimes(1);
  });
});
