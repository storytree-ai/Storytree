// useBuildActivity — the live layer of the story world's in-flight BUILD wisps
// (ADR-0048). Sibling to usePresence: it polls GET /api/activity on the same
// slow cadence (one shared cost envelope) and returns the raw builds; the world
// ages them between polls with the SAME `now` ticker usePresence already
// publishes (isBuildInFlight), so a build's wisp vanishes the instant it crosses
// the TTL — no second ticker, no extra render storm.
//
// Why a separate signal from presence: a build is the MECHANICAL red-green work
// the harness drives (events.work_event 'building'), keyed by run_id with its
// own identity — not "who is online". It is bounded and self-terminating, so the
// wisp is self-cleaning by construction (the false-positive cure, ADR-0048).
//
// Advisory discipline (mirrors presence): a `builds: null` answer (down DB / json
// store) empties the layer without an error surface; a failed POLL keeps the
// last-known builds (the reband ticker ages them honestly meanwhile).

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BuildActivity } from '../types';
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
