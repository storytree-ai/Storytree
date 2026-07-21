// useBuildActivity / useClaimActivity — the live layers of the story world's in-flight BUILD wisps
// (ADR-0048), story-CLAIM wisps (ADR-0138 §5), and claim-DEPARTURE wisps (ADR-0200 D7). They read
// GET /api/activity — which serves `{ builds, claims, departures }` on ONE wire (one shared cost
// envelope) — and return the raw rows; the world ages/filters them between polls with the shared
// `now` ticker (lib/poll.ts), so a wisp vanishes the instant it crosses its window — no second
// ticker, no extra render storm.
//
// A BUILD is the MECHANICAL red-green work the harness drives (events.work_event 'building'),
// keyed by run_id; a CLAIM is "a session is working this story" (events.node_claim), keyed by
// session_id — both are node-anchored work signals; the claim ledger is the ONE coordination +
// observability machinery since self-reported presence retired (ADR-0200 D7).
// A DEPARTURE is a recently-RELEASED claim still inside its fade window (events.claim_event, ADR-0200
// D7 wisp-out legibility) — so a released claim reads as "someone just left" instead of vanishing
// indistinguishably from a lost/stale claim. A claim (or its departure) is NEVER a proof (the §5
// honesty wall): the renderer paints it visibly distinct from a proven-green bloom.
//
// Advisory discipline: a `null` answer (down DB / json store) empties the layer
// without an error surface; a failed POLL keeps the last-known rows (the ticker ages them meanwhile).
// `claims` and `departures` are folded from the SAME poll response (useClaimActivity below) — never
// two separate fetches for one wire.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BuildActivity, ClaimActivity, DepartedClaim } from '../types';
import { SLOW_POLL_MS, STORE_RECOVERED_EVENT } from './poll';

/**
 * True when two activity payloads are field-for-field identical, so the hook can KEEP its previous
 * array identity across a byte-identical poll instead of handing every downstream memo (…ByStory → the
 * scene) a fresh reference that forces a needless O(nodes) scene rebuild ~2×/min while idle (the
 * studio-map idle-rebuild, ADR-0069 / memory `studio-map-svg-scaling-wall`). Every field on these
 * wires is a primitive (see `BuildActivity`/`ClaimActivity`/`DepartedClaim` in types.ts), so a
 * per-key shallow compare is EXACT — no false "unchanged", so it can never suppress a real update.
 * (A `DepartedClaim`'s `ageMs` grows every read, so a live departure never matches — it correctly
 * keeps rebuilding as it fades; only steady claims / in-flight builds / empty payloads match.)
 */
export function sameRows<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! as Record<string, unknown>;
    const y = b[i]! as Record<string, unknown>;
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    for (const k of keys) {
      if (x[k] !== y[k]) return false;
    }
  }
  return true;
}

/**
 * The in-flight-build layer: seeded from the one-shot /api/tree payload (so the
 * world paints builds on first load, even on a backgrounded tab whose poll is
 * gated), then kept near-real-time by the GET /api/activity poll on the shared slow
 * cadence (the world geometry stays a one-shot /api/tree — never polled).
 * Returns the RAW builds; the caller TTL-filters against the shared `now` ticker
 * (isBuildInFlight) so a build ages out between polls without a refetch.
 *
 * `seed` is TreeView's builds from the tree payload (undefined until that fetch
 * lands); once the poll has answered, later seed changes are ignored — the poll
 * is the fresher source (the shared seed-then-poll contract).
 */
export function useBuildActivity(seed: BuildActivity[] | undefined): BuildActivity[] {
  const [raw, setRaw] = useState<BuildActivity[]>([]);
  const inFlight = useRef(false);
  const polled = useRef(false); // a poll answered — seeds are stale from here on

  useEffect(() => {
    if (seed !== undefined && !polled.current) setRaw((prev) => (sameRows(prev, seed) ? prev : seed));
  }, [seed]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      // In-flight guard + visibility gate: a hidden tab spends no DB budget.
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const { builds } = await api.activity();
        polled.current = true;
        // null → [] : the layer unmounts silently (advisory absence, ADR-0048). Preserve the previous
        // array identity on a byte-identical payload (sameRows) so an idle poll doesn't rebuild the scene.
        const next = builds ?? [];
        setRaw((prev) => (sameRows(prev, next) ? prev : next));
      } catch {
        // The studio server itself didn't answer — keep the last-known layer.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate first poll — a running build shouldn't wait a cycle
    const id = window.setInterval(() => void poll(), SLOW_POLL_MS);
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
 * later `seed` changes are ignored (the poll is the fresher source — the shared seed-then-poll contract).
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
    if (seed !== undefined && !polled.current)
      setClaims((prev) => (sameRows(prev, seed) ? prev : seed));
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
        // Preserve identity on a byte-identical payload (sameRows) so a steady claim set doesn't rebuild
        // the scene each poll; a departure's growing `ageMs` correctly never matches, so it keeps fading.
        const nextClaims = rawClaims ?? [];
        const nextDepartures = rawDepartures ?? [];
        setClaims((prev) => (sameRows(prev, nextClaims) ? prev : nextClaims));
        setDepartures((prev) => (sameRows(prev, nextDepartures) ? prev : nextDepartures));
      } catch {
        // The studio server itself didn't answer — keep the last-known layers.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate first poll — a live claim shouldn't wait a cycle
    const id = window.setInterval(() => void poll(), SLOW_POLL_MS);
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
