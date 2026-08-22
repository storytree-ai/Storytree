// The arc read's RETRY is wired, bounded, and reaches failure only when every attempt lost.
//
// Why this file exists at all, when `retryRead` already has its own suite: that suite proves the
// helper, not that `api.arcs` USES it. The wiring is one expression, and deleting it would restore
// the exact defect this was landed to fix while every other studio test stayed green — the helper's
// own tests do not fail when nothing calls it (`check:verification-decay`'s unproven-seam shape).
//
// THE DEFECT, measured against the running desktop backend on 2026-08-20: `/api/arcs` is the app's
// heaviest read (a 76-arc join across the store, `docs/decisions` and `stories/`, ~1.2 MB) and ran
// ~0.4-2.2 s warm, but one sample answered in 12.56 s. The old 10 s abort clipped that, and a single
// clipped read put the lens on "Arcs aren't available here — the arc read didn't answer" while the
// store was healthy and every layer beneath it green, holding that stated absence until a later 30 s
// poll happened to land. The budget is now 30 s (its sibling `floorHealth`'s number, settled after
// the same failure) and the read retries (its sibling `traversalSessions`'s answer to the same
// "losing the race once is terminal" defect).
//
// The BOUND is as load-bearing as the retry: ArcSurface renders a spinner for as long as this is in
// flight, so an unbounded retry would trade a false "unavailable" for a spinner that never resolves
// — which #1191 established is the worse lie of the two.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const PAYLOAD = { arcs: [{ id: 'an-arc' }] };

/** A `fetch` stand-in whose Nth call behaves per `outcomes[N]` — 'fail' rejects, 'ok' answers. */
function stubFetch(outcomes: readonly ('fail' | 'ok')[]) {
  let calls = 0;
  vi.stubGlobal('fetch', (_url: string, _init?: RequestInit) => {
    const outcome = outcomes[calls] ?? 'fail';
    calls += 1;
    if (outcome === 'fail') {
      // The real clipped read rejects with a TimeoutError from the AbortSignal, not a non-2xx.
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      return Promise.reject(error);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify(PAYLOAD)),
    });
  });
  return { calls: () => calls };
}

describe('api.arcs — one lost race is no longer terminal', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers with the rollups when the FIRST attempt is clipped and a later one lands', async () => {
    // The measured failure exactly: attempt one times out, the read is still perfectly answerable.
    // Before the retry this rejected, and the lens rendered a stated absence over a healthy store.
    const stub = stubFetch(['fail', 'ok']);

    await expect(api.arcs()).resolves.toEqual(PAYLOAD);
    expect(stub.calls()).toBe(2);
  });

  it('survives TWO clipped attempts — the tail is a spike, not a budget to give up inside', async () => {
    const stub = stubFetch(['fail', 'fail', 'ok']);

    await expect(api.arcs()).resolves.toEqual(PAYLOAD);
    expect(stub.calls()).toBe(3);
  });

  it('gives up after a BOUNDED number of attempts rather than retrying forever', async () => {
    // The bound is what lets ArcSurface show a spinner for this whole window honestly: the state
    // always resolves to arcs or to the unreachable note. An unbounded retry would hang it instead.
    const stub = stubFetch(['fail', 'fail', 'fail', 'ok']);

    await expect(api.arcs()).rejects.toThrow();
    expect(stub.calls()).toBe(3);
  });

  it('does not retry a read that ANSWERED — a successful first attempt is fetched once', async () => {
    // Retrying a healthy read would triple the cost of the app's largest payload for nothing.
    const stub = stubFetch(['ok', 'ok', 'ok']);

    await expect(api.arcs()).resolves.toEqual(PAYLOAD);
    expect(stub.calls()).toBe(1);
  });
});
