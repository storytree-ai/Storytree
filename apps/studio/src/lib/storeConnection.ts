// storeConnection — the map's database-connection reading (`store-connection-signal`).
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────────────
//
// A red/amber/green light for the LIVE STORE's connection, and nothing else. The owner asked for
// exactly this, twice: first as the original proposal, and again on 2026-08-25 after seeing the
// wider "is what I am seeing current?" signal that shipped in its place — with the cost of
// narrowing stated to him plainly and chosen knowingly.
//
// THE COST, RECORDED HERE SO NOBODY REDISCOVERS IT AS A BUG. This light shows GREEN through the
// 2026-08-25 incident it was born from. That incident was a version skew, not a connection
// failure: the map JOINS signed verdicts (live from the store, always current) against the story
// shape read from `stories/**` on the app's OWN DISK, frozen at the commit the app was built from.
// Verdicts bind to criteria by `criterionId` + `revisionId`, so an app at an older commit reads the
// database PERFECTLY and still paints yellow. The connection was fine the whole time. So this
// instrument does not see that class of fault and is not meant to — the disclosure that does is the
// store banner's "a newer version has landed … the forest may be under-claiming" message, which
// stays. Widening this light back out is a decision, not a fix; take it to the owner.
//
// ── THE THREE STATES ──────────────────────────────────────────────────────────────────────────
//
//   green — connected: the store answered.
//   amber — connecting: a start is in flight and we are waiting on it.
//   red   — not connected: it did not answer.
//
// Each carries its own two-word text, which is the WHOLE message. There is no hover and no click
// panel: a two-word reading that needs explaining is the wrong two words.
//
// ── NO NEW PLUMBING, AND NOTHING TO ADD ───────────────────────────────────────────────────────
//
// The input is the `StorePhase` that `StoreBanner`'s single `/api/health` poller already resolves
// and already lifts to `App` for the load screens. This module is a second READER of that one
// phase, never a second poller. Pure: no React, no `fetch`, no clock.

import type { StorePhase } from '../components/StoreBanner';

/** The three states, as the owner named them. The plain-language word each wears is `word`. */
export type StoreConnectionState = 'green' | 'amber' | 'red';

export interface StoreConnectionReading {
  state: StoreConnectionState;
  /** The two-word reading shown beside the dot. It IS the message — nothing expands it. */
  word: string;
}

/**
 * The reading, or `null` when there is none to give — which renders no chip at all rather than a
 * fourth state. Two phases produce it, and neither is a green:
 *
 *   `unknown` — the first health probe has not answered. Reporting "connected" here would be a
 *   claim made without looking, and reporting "not connected" would flash a fault on every boot.
 *
 *   `json` — the offline JSON store, where there is no database in play at all. The studio already
 *   says so with its own `offline store (json)` badge, and a connection light for a connection that
 *   does not exist could only mislead.
 *
 * `stale-code` is GREEN, and that is the narrowing above in one line: the store answered, so the
 * connection is fine. That the server is running older code is a real problem and a different one,
 * and the banner is what says so.
 */
export function storeConnection(phase: StorePhase): StoreConnectionReading | null {
  switch (phase) {
    case 'unknown':
    case 'json':
      return null;
    case 'healthy':
    case 'stale-code':
      return { state: 'green', word: 'connected' };
    case 'starting':
      return { state: 'amber', word: 'connecting…' };
    case 'stopped':
    case 'unreachable':
    case 'server-lost':
      return { state: 'red', word: 'not connected' };
  }
}
