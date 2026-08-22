// @vitest-environment jsdom
//
// Tests for the claim-ledger dock layer (lib/sessionClaims.ts, ADR-0200 D7) — the TRANSPORT is
// doubled (src/test/httpDouble.ts) and the poll loop runs on fake timers, so every transition is
// driven exactly:
//   • no fetch at all while `open` is false
//   • an immediate fetch the instant `open` flips true, then the shared slow poll cadence
//   • polling stops the instant `open` flips back to false
//   • null answer (down DB / json store) is a silent absence; a FAILED poll keeps the last-known
//     groups (mirrors the activity hooks' own contract)
//   • the in-flight guard: a second tick landing mid-request costs no extra fetch
//
// The `../api` module is NOT replaced (anti-slop-adoption-arc inc-06, `no-module-mocking`): the real
// `api.claims()` runs, so the route it calls and the failure branch it takes are under test here
// rather than assumed. The double fails closed, so a hook that started fetching something else goes
// red instead of quietly passing.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { ClaimsPayload, SessionClaimGroup } from '../types';
import { HttpDouble, errorReply, installHttpDouble } from '../test/httpDouble';

import { useSessionClaimGroups } from './sessionClaims';
import { SLOW_POLL_MS } from './poll';

const CLAIMS = '/api/claims';

let http: HttpDouble;

const group = (sessionId: string): SessionClaimGroup => ({
  sessionId,
  branch: `claude/${sessionId}`,
  claims: [
    { unitId: 'story-a', grade: 'work', intent: 'real', ageMs: 60_000, claimedAt: '2026-07-16T11:00:00.000Z' },
  ],
});

/** Declare what `GET /api/claims` answers from here on — later declarations win. */
const answerClaims = (payload: ClaimsPayload): void => {
  http.get(CLAIMS, () => payload);
};

const calls = (): number => http.countTo(CLAIMS);

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'));
  http = installHttpDouble();
});

afterEach(() => {
  cleanup();
  http.uninstall();
  vi.useRealTimers();
});

const renderClaims = (open: boolean) =>
  renderHook(({ o }: { o: boolean }) => useSessionClaimGroups(o), { initialProps: { o: open } });

describe('useSessionClaimGroups', () => {
  it('fetches nothing while closed, then fetches immediately the instant it opens', async () => {
    answerClaims({ sessions: [group('sess-a')] });
    const { result, rerender } = renderClaims(false);
    expect(result.current).toBeNull();
    expect(calls()).toBe(0);

    rerender({ o: true });
    await act(async () => {}); // flush the immediate on-open fetch
    expect(calls()).toBe(1);
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']);
  });

  it('keeps polling on the shared slow cadence while open, and stops the moment it closes', async () => {
    answerClaims({ sessions: [group('sess-a')] });
    const { rerender } = renderClaims(true);
    await act(async () => {});
    expect(calls()).toBe(1);

    await tick(SLOW_POLL_MS);
    expect(calls()).toBe(2);

    rerender({ o: false }); // dock closed — the poll must stop
    await tick(SLOW_POLL_MS * 3);
    expect(calls()).toBe(2);
  });

  it('null → null (silent advisory absence); a FAILED poll keeps the last-known groups', async () => {
    answerClaims({ sessions: [group('sess-a')] });
    const { result } = renderClaims(true);
    await act(async () => {});
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']);

    // A real non-OK answer, unwrapped by the real `http()` error branch — the studio server, not the DB.
    http.get(CLAIMS, () => errorReply('fetch failed', 500));
    await tick(SLOW_POLL_MS);
    expect(result.current?.map((g) => g.sessionId)).toEqual(['sess-a']); // last-known kept

    answerClaims({ sessions: null }); // DB down: advisory absence
    await tick(SLOW_POLL_MS);
    expect(result.current).toBeNull();
  });

  it('guards in-flight polls: a second tick landing mid-request costs no extra fetch', async () => {
    // Never settles — and deliberately ignores the abort signal, so the hook's own in-flight guard
    // is what is under test rather than the client's timeout backstop.
    http.get(CLAIMS, () => new Promise<Response>(() => {}));
    renderClaims(true);
    await act(async () => {});
    await tick(SLOW_POLL_MS);
    await tick(SLOW_POLL_MS); // second tick lands while the first is in flight
    expect(calls()).toBe(1);
  });

  it('re-opening after a close fetches immediately rather than waiting out the interval', async () => {
    answerClaims({ sessions: [group('sess-a')] });
    const { rerender } = renderClaims(true);
    await act(async () => {});
    expect(calls()).toBe(1);

    rerender({ o: false });
    rerender({ o: true });
    await act(async () => {});
    expect(calls()).toBe(2);
  });
});
