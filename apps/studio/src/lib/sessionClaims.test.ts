// @vitest-environment jsdom
//
// Tests for the claim-ledger dock layer (lib/sessionClaims.ts, ADR-0200 D7) — the api module is
// mocked and the poll loop runs on fake timers (the presence.test.tsx pattern), so every
// transition is driven exactly:
//   • no fetch at all while `open` is false
//   • an immediate fetch the instant `open` flips true, then the SAME poll cadence as presence
//   • polling stops the instant `open` flips back to false
//   • null answer (down DB / json store) is a silent absence; a FAILED poll keeps the last-known
//     groups (mirrors usePresence's own contract)
//   • the in-flight guard: a second tick landing mid-request costs no extra fetch

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { ClaimsPayload, SessionClaimGroup } from '../types';

const apiMock = vi.hoisted(() => ({
  claims: vi.fn<() => Promise<ClaimsPayload>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { useSessionClaimGroups } from './sessionClaims';
import { PRESENCE_POLL_MS } from './presence';

const group = (sessionId: string): SessionClaimGroup => ({
  sessionId,
  branch: `claude/${sessionId}`,
  claims: [
    { unitId: 'story-a', grade: 'work', intent: 'real', ageMs: 60_000, claimedAt: '2026-07-16T11:00:00.000Z' },
  ],
});

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
  apiMock.claims.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderClaims = (open: boolean) =>
  renderHook(({ o }: { o: boolean }) => useSessionClaimGroups(o), { initialProps: { o: open } });

describe('useSessionClaimGroups', () => {
  it('fetches nothing while closed, then fetches immediately the instant it opens', async () => {
    apiMock.claims.mockResolvedValue({ sessions: [group('sess-a')] });
    const { result, rerender } = renderClaims(false);
    expect(result.current).toBeNull();
    expect(apiMock.claims).not.toHaveBeenCalled();

    rerender({ o: true });
    await act(async () => {}); // flush the immediate on-open fetch
    expect(apiMock.claims).toHaveBeenCalledTimes(1);
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']);
  });

  it('keeps polling on the presence cadence while open, and stops the moment it closes', async () => {
    apiMock.claims.mockResolvedValue({ sessions: [group('sess-a')] });
    const { rerender } = renderClaims(true);
    await act(async () => {});
    expect(apiMock.claims).toHaveBeenCalledTimes(1);

    await tick(PRESENCE_POLL_MS);
    expect(apiMock.claims).toHaveBeenCalledTimes(2);

    rerender({ o: false }); // dock closed — the poll must stop
    await tick(PRESENCE_POLL_MS * 3);
    expect(apiMock.claims).toHaveBeenCalledTimes(2);
  });

  it('null → null (silent advisory absence); a FAILED poll keeps the last-known groups', async () => {
    apiMock.claims.mockResolvedValue({ sessions: [group('sess-a')] });
    const { result } = renderClaims(true);
    await act(async () => {});
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']);

    apiMock.claims.mockRejectedValue(new Error('fetch failed'));
    await tick(PRESENCE_POLL_MS); // poll fails — the studio server, not the DB
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']); // last-known kept

    apiMock.claims.mockResolvedValue({ sessions: null }); // DB down: advisory absence
    await tick(PRESENCE_POLL_MS);
    expect(result.current).toBeNull();
  });

  it('guards in-flight polls: a second tick landing mid-request costs no extra fetch', async () => {
    apiMock.claims.mockReturnValue(new Promise(() => {})); // hangs — never resolves
    renderClaims(true);
    await act(async () => {});
    await tick(PRESENCE_POLL_MS);
    await tick(PRESENCE_POLL_MS); // second tick lands while the first is in flight
    expect(apiMock.claims).toHaveBeenCalledTimes(1);
  });

  it('re-opening after a close fetches immediately rather than waiting out the interval', async () => {
    apiMock.claims.mockResolvedValue({ sessions: [group('sess-a')] });
    const { rerender } = renderClaims(true);
    await act(async () => {});
    expect(apiMock.claims).toHaveBeenCalledTimes(1);

    rerender({ o: false });
    rerender({ o: true });
    await act(async () => {});
    expect(apiMock.claims).toHaveBeenCalledTimes(2);
  });
});
