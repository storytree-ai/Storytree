// @vitest-environment jsdom
//
// Tests for the presence layer (lib/presence.ts) — the api module is mocked and
// the poll/ticker loops run on fake timers (the StoreBanner.test.tsx pattern),
// so every transition is driven exactly:
//   • seed from the one-shot /api/tree payload, then the 30s /api/presence poll
//   • null → [] (wisps unmount silently); a FAILED poll keeps the last-known layer
//   • the in-flight guard and the visibility gate (a hidden tab spends no DB budget)
//   • client-side re-banding: a wisp ages fresh → stale on the ticker with ZERO
//     fetches, and the client recomputation overrides the server-sent band
//   • the store-recovered event polls immediately (the Start DB snap-back)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { PresencePayload, TreeSession } from '../types';

const apiMock = vi.hoisted(() => ({
  presence: vi.fn<() => Promise<PresencePayload>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import {
  usePresence,
  rebandSessions,
  formatAge,
  isOrbitingBand,
  splitSessions,
  notifyStoreRecovered,
  PRESENCE_POLL_MS,
  REBAND_TICK_MS,
} from './presence';

const BASE = new Date('2026-06-13T12:00:00.000Z');

/** A session last seen `minutesAgo` before BASE, with the SERVER-sent band. */
function session(
  id: string,
  minutesAgo: number,
  band: TreeSession['band'] = 'fresh',
): TreeSession {
  return {
    sessionId: id,
    branch: `claude/${id}`,
    workingOn: `working on ${id}`,
    nodes: [],
    band,
    lastSeenAt: new Date(BASE.getTime() - minutesAgo * 60_000).toISOString(),
  };
}

const flush = () => act(async () => {});
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  apiMock.presence.mockReset();
});

afterEach(() => {
  cleanup(); // unmounts hooks — their window/document listeners must not leak across tests
  vi.useRealTimers();
});

const renderPresence = (seed?: TreeSession[]) =>
  renderHook(({ s }: { s: TreeSession[] | undefined }) => usePresence(s), {
    initialProps: { s: seed },
  });

describe('rebandSessions', () => {
  it('re-derives bands from lastSeenAt and returns the SAME array when nothing changed', () => {
    const fresh = [session('a', 5)];
    expect(rebandSessions(fresh, BASE)).toBe(fresh); // identity — no spurious re-renders
    const aged = rebandSessions([session('a', 61), session('b', 241, 'fresh')], BASE);
    expect(aged.map((s) => s.band)).toEqual(['stale', 'possibly-dead']);
  });
});

describe('splitSessions', () => {
  it('parks possibly-dead sessions; fresh and stale keep orbiting (ADR-0041)', () => {
    const [fresh, stale, dead] = [session('f', 5), session('s', 90), session('d', 300)];
    const { orbiting, parked } = splitSessions(rebandSessions([fresh, stale, dead], BASE));
    expect(orbiting.map((s) => s.sessionId)).toEqual(['f', 's']);
    expect(parked.map((s) => s.sessionId)).toEqual(['d']);
    expect(isOrbitingBand('stale')).toBe(true);
    expect(isOrbitingBand('possibly-dead')).toBe(false);
  });
});

describe('formatAge', () => {
  it('formats compact ages from a supplied now', () => {
    expect(formatAge(session('a', 12).lastSeenAt, BASE)).toBe('12m');
    expect(formatAge(session('a', 150).lastSeenAt, BASE)).toBe('2h');
  });
});

describe('usePresence', () => {
  it('seeds from the tree payload, then the poll replaces the layer', async () => {
    apiMock.presence.mockResolvedValue({ sessions: [session('polled', 1)] });
    const { result, rerender } = renderPresence();
    expect(result.current.sessions).toEqual([]);

    rerender({ s: [session('seeded', 2)] }); // the one-shot /api/tree landed
    expect(result.current.sessions.map((s) => s.sessionId)).toEqual(['seeded']);
    expect(apiMock.presence).not.toHaveBeenCalled(); // seed costs no fetch

    await tick(PRESENCE_POLL_MS);
    expect(apiMock.presence).toHaveBeenCalledTimes(1);
    expect(result.current.sessions.map((s) => s.sessionId)).toEqual(['polled']);
  });

  it('null → [] (silent unmount); a FAILED poll keeps the last-known layer instead', async () => {
    apiMock.presence.mockRejectedValue(new Error('fetch failed'));
    const { result, rerender } = renderPresence();
    rerender({ s: [session('zombie', 3)] });

    await tick(PRESENCE_POLL_MS); // poll fails — the studio server, not the DB
    expect(result.current.sessions.map((s) => s.sessionId)).toEqual(['zombie']);

    apiMock.presence.mockResolvedValue({ sessions: null }); // DB down: advisory absence
    await tick(PRESENCE_POLL_MS);
    expect(result.current.sessions).toEqual([]);
  });

  it('guards in-flight polls and gates on document visibility', async () => {
    apiMock.presence.mockReturnValue(new Promise(() => {})); // hangs — never resolves
    renderPresence();
    await tick(PRESENCE_POLL_MS);
    await tick(PRESENCE_POLL_MS); // second tick lands while the first is in flight
    expect(apiMock.presence).toHaveBeenCalledTimes(1);
  });

  it('does not poll while the tab is hidden', async () => {
    apiMock.presence.mockResolvedValue({ sessions: [] });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      renderPresence();
      await tick(PRESENCE_POLL_MS * 3);
      expect(apiMock.presence).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    }
  });

  it('ages a wisp fresh → stale on the ticker with ZERO fetches', async () => {
    apiMock.presence.mockRejectedValue(new Error('offline')); // polls contribute nothing
    const { result, rerender } = renderPresence();
    rerender({ s: [session('ager', 59)] }); // one minute shy of the stale threshold
    expect(result.current.sessions[0]?.band).toBe('fresh');

    await tick(REBAND_TICK_MS * 2); // now 61m old — no successful fetch involved
    expect(apiMock.presence).toHaveBeenCalled(); // polls fired…
    expect(result.current.sessions[0]?.band).toBe('stale'); // …but the TICKER aged it
    expect(result.current.now.getTime()).toBeGreaterThan(BASE.getTime());
  });

  it('a wisp crossing possibly-dead on a reband tick leaves the orbiting set with ZERO fetches', async () => {
    // The permanent-zombie shape (ADR-0041): a worktree deleted before SessionEnd
    // leaves a status=active row forever — the WORLD must drop its wisp from the
    // client-recomputed band the moment it crosses 4 h, not at the next fetch.
    apiMock.presence.mockRejectedValue(new Error('offline')); // polls contribute nothing
    const { result, rerender } = renderPresence();
    rerender({ s: [session('zombie', 239, 'stale')] }); // one minute shy of possibly-dead
    expect(splitSessions(result.current.sessions).orbiting.map((s) => s.sessionId)).toEqual([
      'zombie',
    ]);

    await tick(REBAND_TICK_MS * 2); // now 241m old — the TICKER crossed the threshold
    expect(result.current.sessions[0]?.band).toBe('possibly-dead');
    expect(splitSessions(result.current.sessions).orbiting).toEqual([]); // wisp unmounts
    expect(splitSessions(result.current.sessions).parked.map((s) => s.sessionId)).toEqual([
      'zombie', // still listed in the dock — parked, not erased
    ]);
  });

  it('client re-banding overrides a stale server-sent band', async () => {
    // The server said fresh, but lastSeenAt is 5h old (e.g. a long-cached answer).
    apiMock.presence.mockResolvedValue({ sessions: [session('liar', 300, 'fresh')] });
    const { result } = renderPresence();
    await tick(PRESENCE_POLL_MS);
    expect(result.current.sessions[0]?.band).toBe('possibly-dead');
  });

  it('polls immediately on the store-recovered event (Start DB snap-back)', async () => {
    apiMock.presence.mockResolvedValue({ sessions: [session('back', 1)] });
    const { result } = renderPresence();
    expect(apiMock.presence).not.toHaveBeenCalled();
    act(() => notifyStoreRecovered());
    await flush();
    expect(apiMock.presence).toHaveBeenCalledTimes(1);
    expect(result.current.sessions.map((s) => s.sessionId)).toEqual(['back']);
  });
});
