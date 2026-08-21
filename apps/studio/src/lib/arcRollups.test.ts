// @vitest-environment jsdom
//
// The arc surface's data layer (lib/arcRollups.ts, ADR-0267 / ADR-0314) — the TRANSPORT is doubled
// (src/test/httpDouble.ts) and the poll loop runs on fake timers, so every transition is driven
// exactly. The `../api` module is NOT replaced (anti-slop-adoption-arc inc-06, `no-module-mocking`).
//
// THAT CHANGE HAS TEETH HERE, and it is worth stating because it surfaced a client this suite had
// never actually run. `api.arcs()` wraps its fetch in `retryRead` — THREE attempts with a 500 ms /
// 1000 ms backoff (api.ts, added after a 12.56 s tail clipped the 10 s budget). Under module
// mocking a "failed read" was one instantly-rejected promise, so every failure case below described
// a client that does not exist: the real one issues three requests and takes ~1.5 s of timer before
// the hook ever sees a rejection. The failing cases now advance past that backoff and assert the
// THREE requests, so the retry is under test instead of being mocked away.
//
// THE LOAD-BEARING CASE IS THE FAILED READ WITH NOTHING KNOWN YET, and it is a REGRESSION test: the
// hook's first landing (#1191) swallowed that failure and left the state at `undefined` forever, so
// the desktop app — which loads the compiled studio bundle against its own local backend, and that
// backend did not then mirror `/api/arcs` — sat on "Reading arcs…" permanently. A spinner that will
// never resolve is a worse lie than an empty list: it tells the owner to wait for something that is
// not coming. The desktop mirrors the route now, which removes that ONE cause and none of the
// others: a request can still fail, and a build older than the mirror still 404s.
//
// The four answers this hook distinguishes, each a different fact:
//   `undefined`     nothing has answered yet
//   `'unreachable'` the read did not answer at all (no route here, or the request failed)
//   `null`          the backend answered and has no document store
//   the rollups     the store answered

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { ArcRollup, ArcRollupSummary, ArcsPayload } from '../types';
import { HttpDouble, errorReply, installHttpDouble } from '../test/httpDouble';

import {
  useArcRollup,
  useArcRollups,
  ARC_DETAIL_UNREACHABLE,
  ARCS_UNREACHABLE,
} from './arcRollups';
import { SLOW_POLL_MS } from './poll';

/** One LANE ROW as `GET /api/arcs` now serves it — the narrowed projection, not the whole rollup. */
const arc = (id: string): ArcRollupSummary => ({
  id,
  title: `The ${id}`,
  lifecycle: 'active',
  waiting: false,
  openQuestions: 0,
  increments: [],
});

/** One WHOLE rollup as `GET /api/arcs/<id>` serves it — the briefing panel's half of the split. */
const arcRollup = (id: string): ArcRollup => ({
  id,
  title: `The ${id}`,
  description: '',
  lifecycle: 'active',
  intent: `intent of ${id}`,
  endState: '',
  increments: [],
  adrs: [],
  stories: [],
  // ADR-0306 D4's store-resident story path, separate from the disk-scanned `stories` above.
  citedStories: [],
  questions: [],
  waiting: false,
});

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const ARCS = '/api/arcs';
let http: HttpDouble;

/** Declare what `GET /api/arcs` answers from here on — later declarations win. */
const answerArcs = (payload: ArcsPayload): void => {
  http.get(ARCS, () => payload);
};
/** Make `GET /api/arcs` fail — the desktop-backend-without-the-route shape. */
const failArcs = (message = '404 Not Found', status = 404): void => {
  http.get(ARCS, () => errorReply(message, status));
};
const reads = (): number => http.countTo(ARCS);

/**
 * Let `api.arcs()`'s real `retryRead` run to exhaustion: three attempts at a 500 ms / 1000 ms
 * backoff. A test that only flushed microtasks would leave the hook waiting inside the FIRST
 * backoff and never observe the failure at all.
 */
const drainRetries = () => tick(2_000);

/** Attempts the client makes per FAILED poll — three, per `api.arcs`'s retryRead options. */
const ATTEMPTS_PER_FAILED_POLL = 3;

beforeEach(() => {
  vi.useFakeTimers();
  http = installHttpDouble();
});

afterEach(() => {
  cleanup();
  http.uninstall();
  vi.useRealTimers();
});

const renderArcs = (open: boolean) =>
  renderHook(({ o }: { o: boolean }) => useArcRollups(o), { initialProps: { o: open } });

describe('useArcRollups — drawer-scoped, no new always-on cost class', () => {
  it('fetches nothing while closed, then fetches immediately the instant it opens', async () => {
    answerArcs({ arcs: [arc('a')] });
    const { result, rerender } = renderArcs(false);
    expect(result.current).toBeUndefined();
    expect(reads()).toBe(0);

    rerender({ o: true });
    await act(async () => {}); // flush the immediate on-open fetch
    expect(reads()).toBe(1);
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });

  it('keeps polling on the shared slow cadence while open, and stops the instant it closes', async () => {
    answerArcs({ arcs: [] });
    const { rerender } = renderArcs(true);
    await act(async () => {});
    expect(reads()).toBe(1);

    await tick(SLOW_POLL_MS);
    expect(reads()).toBe(2);

    rerender({ o: false });
    await tick(SLOW_POLL_MS * 3);
    expect(reads()).toBe(2);
  });

  it('a SUCCEEDING poll costs exactly one request — the retry does not fire on a good read', async () => {
    // The control for the retry assertions below: three requests must mean a failure, not a
    // client that always triples its reads.
    answerArcs({ arcs: [arc('a')] });
    renderArcs(true);
    await act(async () => {});
    expect(reads()).toBe(1);
  });
});

describe('useArcRollups — four answers, four different facts', () => {
  it('passes a `null` payload through: the backend answered and has no document store', async () => {
    answerArcs({ arcs: null });
    const { result } = renderArcs(true);
    await act(async () => {});
    // NOT `unreachable` — the read answered, it just had nothing behind it.
    expect(result.current).toBeNull();
  });

  it('distinguishes an empty store from an absent one', async () => {
    answerArcs({ arcs: [] });
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toEqual([]);
  });

  it('reports `unreachable` when the read fails with nothing known yet (the #1191 regression)', async () => {
    // A backend that does not serve `/api/arcs` 404s it and `http()` throws — the shape the desktop
    // local backend had before it mirrored the route. Before this test, the catch swallowed it and
    // the surface rendered "Reading arcs…" forever.
    failArcs();
    const { result } = renderArcs(true);
    await drainRetries();
    expect(result.current).toBe(ARCS_UNREACHABLE);
    // And it got there the long way round: the real client exhausted its retry budget first.
    expect(reads()).toBe(ATTEMPTS_PER_FAILED_POLL);
  });

  it('exhausts the retry budget before declaring unreachable — one lost race is not terminal', async () => {
    // The property `retryRead` exists for, and one no module mock could observe: the FIRST attempt
    // failing does not reach the hook at all if a later attempt lands.
    let attempt = 0;
    http.get(ARCS, () => ((attempt += 1) < 3 ? errorReply('spike', 504) : { arcs: [arc('a')] }));
    const { result } = renderArcs(true);
    await drainRetries();
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
    expect(reads()).toBe(3);
  });

  it('stays `unreachable` across repeated failures rather than flapping back to loading', async () => {
    failArcs();
    const { result } = renderArcs(true);
    await drainRetries();
    await tick(SLOW_POLL_MS * 2);
    expect(result.current).toBe(ARCS_UNREACHABLE);
  });

  it('recovers to the rollups once a later poll answers', async () => {
    // The whole FIRST poll fails — all three of its attempts — then the route comes back.
    failArcs();
    const { result } = renderArcs(true);
    await drainRetries();
    expect(result.current).toBe(ARCS_UNREACHABLE);

    answerArcs({ arcs: [arc('a')] });
    await tick(SLOW_POLL_MS);
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });
});

describe('useArcRollups — a transient blip keeps what is already known', () => {
  it('holds the last-known rollups when a later poll fails', async () => {
    answerArcs({ arcs: [arc('a')] });
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(Array.isArray(result.current)).toBe(true);

    failArcs('blip', 500);
    await tick(SLOW_POLL_MS);
    await drainRetries();
    // One dropped poll must not flap a populated surface to an error state.
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });

  it('holds a `null` answer through a later failure too — it is knowledge, not absence of it', async () => {
    answerArcs({ arcs: null });
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toBeNull();

    failArcs('blip', 500);
    await tick(SLOW_POLL_MS);
    await drainRetries();
    expect(result.current).toBeNull();
  });
});

// ---------- useArcRollup — the briefing panel's per-selection read ----------
//
// THE SPLIT THIS PROVES. `GET /api/arcs` carries what a LANE draws; the panel reads the WHOLE
// rollup for the arc it is open on off `GET /api/arcs/<id>`. Measured against the live store on
// 2026-08-20, shipping every arc's prose on the list was 1,364,425 bytes over 76 arcs against
// 226,836 for the lane rows — on a read that re-polls every 30 s. What that trade costs is this
// hook, and the cases below are the ones it would be easy to get wrong.

describe('useArcRollup — one arc, re-read per selection', () => {
  it('reads nothing with no selection, and `null` in is `null` out', async () => {
    const read = vi.fn<(id: string) => Promise<ArcRollup>>();
    const { result } = renderHook(({ id }: { id: string | null }) => useArcRollup(id, read), {
      initialProps: { id: null },
    });
    await act(async () => {});
    // NOT `undefined` and NOT unreachable: "no lane is selected" is a third fact, and the panel
    // renders it as "pick an arc" rather than as a spinner or as a failure.
    expect(result.current).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the selected arc, and re-reads when the selection moves', async () => {
    const read = vi.fn(async (id: string) => arcRollup(id));
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useArcRollup(id, read),
      { initialProps: { id: 'first-arc' as string | null } },
    );
    await act(async () => {});
    expect(result.current).toMatchObject({ id: 'first-arc' });

    rerender({ id: 'second-arc' });
    await act(async () => {});
    expect(result.current).toMatchObject({ id: 'second-arc' });
    expect(read.mock.calls.map(([id]) => id)).toEqual(['first-arc', 'second-arc']);
  });

  it('THE STALE-ANSWER GUARD: a slow read for an abandoned selection never lands', async () => {
    // Selections move faster than a 30 s-budgeted fetch resolves — a reader arrowing down the lane
    // list can have several in flight. Without the guard the SLOWEST wins and pins the panel to an
    // arc the reader has already left, which is the confidently-wrong state this surface exists to
    // avoid: one arc's title over another arc's questions.
    const gates = new Map<string, (rollup: ArcRollup) => void>();
    const read = (id: string): Promise<ArcRollup> =>
      new Promise((resolve) => gates.set(id, resolve));

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useArcRollup(id, read),
      { initialProps: { id: 'slow-arc' as string | null } },
    );
    rerender({ id: 'quick-arc' });
    await act(async () => {});

    // The SECOND selection answers first and is shown.
    await act(async () => {
      gates.get('quick-arc')?.(arcRollup('quick-arc'));
    });
    expect(result.current).toMatchObject({ id: 'quick-arc' });

    // The FIRST answers late. It must be dropped, not rendered under the current title.
    await act(async () => {
      gates.get('slow-arc')?.(arcRollup('slow-arc'));
    });
    expect(result.current).toMatchObject({ id: 'quick-arc' });
  });

  it('a stale FAILURE is dropped too — it would flip a good briefing to "did not answer"', async () => {
    const rejects = new Map<string, (err: Error) => void>();
    const read = (id: string): Promise<ArcRollup> =>
      id === 'doomed-arc'
        ? new Promise((_resolve, reject) => rejects.set(id, reject))
        : Promise.resolve(arcRollup(id));

    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useArcRollup(id, read),
      { initialProps: { id: 'doomed-arc' as string | null } },
    );
    rerender({ id: 'good-arc' });
    await act(async () => {});
    expect(result.current).toMatchObject({ id: 'good-arc' });

    await act(async () => {
      rejects.get('doomed-arc')?.(new Error('too late'));
    });
    expect(result.current).toMatchObject({ id: 'good-arc' });
  });

  it('reports a read that did not answer, rather than an empty briefing', async () => {
    // A 404 is a real answer here (the list re-polls, so an arc can close between a poll and a
    // click) and so is a dead route. Either way the panel holds no rollup, and saying so beats
    // rendering a briefing that looks complete because every list in it is empty.
    const read = vi.fn<(id: string) => Promise<ArcRollup>>().mockRejectedValue(new Error('404'));
    const { result } = renderHook(({ id }: { id: string | null }) => useArcRollup(id, read), {
      initialProps: { id: 'gone-arc' as string | null },
    });
    await act(async () => {});
    expect(result.current).toBe(ARC_DETAIL_UNREACHABLE);
  });

  it('drops back to reading when the selection moves off a failed arc — no stuck error', async () => {
    const read = vi.fn(async (id: string) => {
      if (id === 'gone-arc') throw new Error('404');
      return arcRollup(id);
    });
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useArcRollup(id, read),
      { initialProps: { id: 'gone-arc' as string | null } },
    );
    await act(async () => {});
    expect(result.current).toBe(ARC_DETAIL_UNREACHABLE);

    rerender({ id: 'live-arc' });
    await act(async () => {});
    expect(result.current).toMatchObject({ id: 'live-arc' });
  });
});
