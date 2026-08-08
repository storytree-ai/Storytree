// @vitest-environment jsdom
//
// The arc surface's data layer (lib/arcRollups.ts, ADR-0267 / ADR-0314) — the api module is mocked
// and the poll loop runs on fake timers, so every transition is driven exactly.
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
import type { ArcRollup, ArcsPayload } from '../types';

const apiMock = vi.hoisted(() => ({
  arcs: vi.fn<() => Promise<ArcsPayload>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { useArcRollups, ARCS_UNREACHABLE } from './arcRollups';
import { SLOW_POLL_MS } from './poll';

const arc = (id: string): ArcRollup => ({
  id,
  title: `The ${id}`,
  description: '',
  lifecycle: 'active',
  intent: '',
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

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.arcs.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderArcs = (open: boolean) =>
  renderHook(({ o }: { o: boolean }) => useArcRollups(o), { initialProps: { o: open } });

describe('useArcRollups — drawer-scoped, no new always-on cost class', () => {
  it('fetches nothing while closed, then fetches immediately the instant it opens', async () => {
    apiMock.arcs.mockResolvedValue({ arcs: [arc('a')] });
    const { result, rerender } = renderArcs(false);
    expect(result.current).toBeUndefined();
    expect(apiMock.arcs).not.toHaveBeenCalled();

    rerender({ o: true });
    await act(async () => {}); // flush the immediate on-open fetch
    expect(apiMock.arcs).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });

  it('keeps polling on the shared slow cadence while open, and stops the instant it closes', async () => {
    apiMock.arcs.mockResolvedValue({ arcs: [] });
    const { rerender } = renderArcs(true);
    await act(async () => {});
    expect(apiMock.arcs).toHaveBeenCalledTimes(1);

    await tick(SLOW_POLL_MS);
    expect(apiMock.arcs).toHaveBeenCalledTimes(2);

    rerender({ o: false });
    await tick(SLOW_POLL_MS * 3);
    expect(apiMock.arcs).toHaveBeenCalledTimes(2);
  });
});

describe('useArcRollups — four answers, four different facts', () => {
  it('passes a `null` payload through: the backend answered and has no document store', async () => {
    apiMock.arcs.mockResolvedValue({ arcs: null });
    const { result } = renderArcs(true);
    await act(async () => {});
    // NOT `unreachable` — the read answered, it just had nothing behind it.
    expect(result.current).toBeNull();
  });

  it('distinguishes an empty store from an absent one', async () => {
    apiMock.arcs.mockResolvedValue({ arcs: [] });
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toEqual([]);
  });

  it('reports `unreachable` when the read fails with nothing known yet (the #1191 regression)', async () => {
    // A backend that does not serve `/api/arcs` 404s it and `http()` throws — the shape the desktop
    // local backend had before it mirrored the route. Before this test, the catch swallowed it and
    // the surface rendered "Reading arcs…" forever.
    apiMock.arcs.mockRejectedValue(new Error('404 Not Found'));
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toBe(ARCS_UNREACHABLE);
  });

  it('stays `unreachable` across repeated failures rather than flapping back to loading', async () => {
    apiMock.arcs.mockRejectedValue(new Error('404 Not Found'));
    const { result } = renderArcs(true);
    await act(async () => {});
    await tick(SLOW_POLL_MS * 2);
    expect(result.current).toBe(ARCS_UNREACHABLE);
  });

  it('recovers to the rollups once a later poll answers', async () => {
    apiMock.arcs.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ arcs: [arc('a')] });
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toBe(ARCS_UNREACHABLE);

    await tick(SLOW_POLL_MS);
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });
});

describe('useArcRollups — a transient blip keeps what is already known', () => {
  it('holds the last-known rollups when a later poll fails', async () => {
    apiMock.arcs.mockResolvedValueOnce({ arcs: [arc('a')] }).mockRejectedValue(new Error('blip'));
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(Array.isArray(result.current)).toBe(true);

    await tick(SLOW_POLL_MS);
    // One dropped poll must not flap a populated surface to an error state.
    expect(Array.isArray(result.current) ? result.current.map((a) => a.id) : null).toEqual(['a']);
  });

  it('holds a `null` answer through a later failure too — it is knowledge, not absence of it', async () => {
    apiMock.arcs.mockResolvedValueOnce({ arcs: null }).mockRejectedValue(new Error('blip'));
    const { result } = renderArcs(true);
    await act(async () => {});
    expect(result.current).toBeNull();

    await tick(SLOW_POLL_MS);
    expect(result.current).toBeNull();
  });
});
