// Shared slow-poll infrastructure for the studio's advisory live layers (builds / claims /
// comments). Extracted from the retired presence lib when self-reported session presence retired
// (ADR-0200 D7 — the claim ledger is the one coordination + observability machinery): the poll
// cadence, the store-recovered snap-back event, and the "now" ticker outlive the presence render
// they were born in — every remaining live layer (useBuildActivity / useClaimActivity /
// useSessionClaimGroups / the comments feed) rides them.

import { useEffect, useState } from 'react';

/** The one slow poll cadence — parity with StoreBanner's SLOW_POLL_MS (one shared cost envelope). */
export const SLOW_POLL_MS = 30_000;

/** The "now" ticker cadence that ages wisps/blooms between polls — zero fetches. */
export const AGE_TICK_MS = 60_000;

/**
 * Fired by App when the store banner reports the live store recovered — the polling hooks
 * (lib/buildActivity.ts) re-poll immediately for an instant snap-back instead of waiting out the
 * interval. A window event (not prop drilling) so TreeView never remounts.
 */
export const STORE_RECOVERED_EVENT = 'storytree:store-recovered';

export function notifyStoreRecovered(): void {
  window.dispatchEvent(new Event(STORE_RECOVERED_EVENT));
}

/**
 * The shared `now` the world ages against: a Date that re-derives every {@link AGE_TICK_MS}, so a
 * build wisp / verdict bloom / claim age visibly ages between polls with zero fetches. One ticker
 * per consumer tree — the world passes the SAME `now` to every aged layer so nothing jitters out
 * of phase.
 */
export function useNowTick(intervalMs: number = AGE_TICK_MS): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
