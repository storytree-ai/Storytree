// useBuildActivity / useClaimActivity — the live layers of the story world's in-flight BUILD wisps
// (ADR-0048), story-CLAIM wisps (ADR-0138 §5), and claim-DEPARTURE wisps (ADR-0200 D7). Siblings to
// usePresence: they read GET /api/activity — which now serves `{ builds, claims, departures }` on ONE
// wire (one shared cost envelope) — and return the raw rows; the world ages/filters them between polls
// with the SAME `now` ticker usePresence publishes, so a wisp vanishes the instant it crosses its
// window — no second ticker, no extra render storm.
//
// Why these are separate signals from presence: a BUILD is the MECHANICAL red-green work the harness
// drives (events.work_event 'building'), keyed by run_id; a CLAIM is "a session is working this story"
// (events.node_claim), keyed by session_id — both are node-anchored work signals, not "who is online".
// A DEPARTURE is a recently-RELEASED claim still inside its fade window (events.claim_event, ADR-0200
// D7 wisp-out legibility) — so a released claim reads as "someone just left" instead of vanishing
// indistinguishably from a lost/stale claim. A claim (or its departure) is NEVER a proof (the §5
// honesty wall): the renderer paints it visibly distinct from a proven-green bloom.
//
// Advisory discipline (mirrors presence): a `null` answer (down DB / json store) empties the layer
// without an error surface; a failed POLL keeps the last-known rows (the ticker ages them meanwhile).
// `claims` and `departures` are folded from the SAME poll response (useClaimActivity below) — never
// two separate fetches for one wire.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BuildActivity, ClaimActivity, DepartedClaim } from '../types';
import { PRESENCE_POLL_MS, STORE_RECOVERED_EVENT } from './presence';

/**
 * The in-flight-build layer: seeded from the one-shot /api/tree payload (so the
 * world paints builds on first load, even on a backgrounded tab whose poll is
 * gated), then kept near-real-time by the GET /api/activity poll on the presence
 * cadence (the world geometry stays a one-shot /api/tree — never polled).
 * Returns the RAW builds; the caller TTL-filters against the shared `now` ticker
 * (isBuildInFlight) so a build ages out between polls without a refetch.
 *
 * `seed` is TreeView's builds from the tree payload (undefined until that fetch
 * lands); once the poll has answered, later seed changes are ignored — the poll
 * is the fresher source (the usePresence seed contract).
 */
export function useBuildActivity(seed: BuildActivity[] | undefined): BuildActivity[] {
  const [raw, setRaw] = useState<BuildActivity[]>([]);
  const inFlight = useRef(false);
  const polled = useRef(false); // a poll answered — seeds are stale from here on

  useEffect(() => {
    if (seed !== undefined && !polled.current) setRaw(seed);
  }, [seed]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      // In-flight guard + visibility gate: a hidden tab spends no DB budget.
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const { builds } = await api.activity();
        polled.current = true;
        // null → [] : the layer unmounts silently (advisory absence, ADR-0048).
        setRaw(builds ?? []);
      } catch {
        // The studio server itself didn't answer — keep the last-known layer.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate first poll — a running build shouldn't wait a cycle
    const id = window.setInterval(() => void poll(), PRESENCE_POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(STORE_RECOVERED_EVENT, onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(STORE_RECOVERED_EVENT, onVisible);
    };
  }, []);

  return raw;
}

/** {@link useClaimActivity}'s return shape: the raw claims AND the raw departures (ADR-0200 D7) — one
 *  shared poll feeds both, so the two layers never drift out of sync with each other's read. */
export interface ClaimActivityState {
  claims: ClaimActivity[];
  departures: DepartedClaim[];
}

/**
 * The in-flight story-CLAIM layer (ADR-0138 §5) PLUS the claim-DEPARTURE layer (ADR-0200 D7) —
 * sibling to {@link useBuildActivity}: same poll cadence, same visibility gate, same `/api/activity`
 * wire, same advisory `null → []` contract. `claims` and `departures` ride the ONE fetch below (never
 * two separate polls for what is one wire) — the wisp-out fix depends on both reading the same
 * snapshot, so a claim never reads as "gone" one tick before its departure appears the next.
 *
 * Only `claims` is SEEDED from the one-shot /api/tree payload (so the world paints claim wisps on
 * first load); `departures` has no such seed contract (a departure is inherently transient — there is
 * nothing to seed before the first poll answers) and starts empty until then. Once the poll answers,
 * later `seed` changes are ignored (the poll is the fresher source — the usePresence contract).
 *
 * Returns the RAW claims/departures; the caller groups each by story and (for claims) folds
 * `intent → colourState` (lib/claimColour.ts). Unlike a build, a claim has no client-side TTL re-age —
 * the server already drops a stale claim (heartbeat past the reclaim window, ADR-0138 §5); a
 * still-claimed story simply keeps orbiting until the next poll reports it gone. A departure ages via
 * its own `ageMs` snapshot (the caller folds that to a fade ratio) rather than a ticker.
 */
export function useClaimActivity(seed: ClaimActivity[] | undefined): ClaimActivityState {
  const [claims, setClaims] = useState<ClaimActivity[]>([]);
  const [departures, setDepartures] = useState<DepartedClaim[]>([]);
  const inFlight = useRef(false);
  const polled = useRef(false); // a poll answered — seeds are stale from here on

  useEffect(() => {
    if (seed !== undefined && !polled.current) setClaims(seed);
  }, [seed]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      // In-flight guard + visibility gate: a hidden tab spends no DB budget.
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const { claims: rawClaims, departures: rawDepartures } = await api.activity();
        polled.current = true;
        // null/undefined → [] : the layer unmounts silently (advisory absence, ADR-0138 §5 / ADR-0200 D7).
        setClaims(rawClaims ?? []);
        setDepartures(rawDepartures ?? []);
      } catch {
        // The studio server itself didn't answer — keep the last-known layers.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate first poll — a live claim shouldn't wait a cycle
    const id = window.setInterval(() => void poll(), PRESENCE_POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(STORE_RECOVERED_EVENT, onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(STORE_RECOVERED_EVENT, onVisible);
    };
  }, []);

  return { claims, departures };
}
