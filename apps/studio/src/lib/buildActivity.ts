// useBuildActivity / useClaimActivity — the live layers of the story world's in-flight BUILD wisps
// (ADR-0048) and story-CLAIM wisps (ADR-0138 §5). Siblings to usePresence: they read GET /api/activity
// — which now serves `{ builds, claims }` on ONE wire (one shared cost envelope) — and return the raw
// rows; the world ages/filters them between polls with the SAME `now` ticker usePresence publishes,
// so a wisp vanishes the instant it crosses its window — no second ticker, no extra render storm.
//
// Why these are separate signals from presence: a BUILD is the MECHANICAL red-green work the harness
// drives (events.work_event 'building'), keyed by run_id; a CLAIM is "a session is working this story"
// (events.node_claim), keyed by session_id — both are node-anchored work signals, not "who is online".
// A claim is NEVER a proof (the §5 honesty wall): the renderer paints it visibly distinct from a
// proven-green bloom.
//
// Advisory discipline (mirrors presence): a `null` answer (down DB / json store) empties the layer
// without an error surface; a failed POLL keeps the last-known rows (the ticker ages them meanwhile).

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BuildActivity, ClaimActivity } from '../types';
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

/**
 * The in-flight story-CLAIM layer (ADR-0138 §5) — sibling to {@link useBuildActivity}: same poll
 * cadence, same visibility gate, same `/api/activity` wire (it reads `claims` off the SAME payload),
 * same advisory `null → []` contract. Seeded from the one-shot /api/tree payload (so the world paints
 * claim wisps on first load), then kept near-real-time by the GET /api/activity poll; once the poll
 * answers, later seed changes are ignored (the poll is the fresher source — the usePresence contract).
 *
 * Returns the RAW claims; the caller groups them by story and folds `intent → colourState`
 * (lib/claimColour.ts). Unlike a build, a claim has no client-side TTL re-age — the server already
 * drops a stale claim (heartbeat past the reclaim window, ADR-0138 §5); a still-claimed story simply
 * keeps orbiting until the next poll reports it gone.
 */
export function useClaimActivity(seed: ClaimActivity[] | undefined): ClaimActivity[] {
  const [raw, setRaw] = useState<ClaimActivity[]>([]);
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
        const { claims } = await api.activity();
        polled.current = true;
        // null/undefined → [] : the layer unmounts silently (advisory absence, ADR-0138 §5).
        setRaw(claims ?? []);
      } catch {
        // The studio server itself didn't answer — keep the last-known layer.
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

  return raw;
}
