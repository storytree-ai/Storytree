// usePresence — the live layer of the story world's session wisps (ADR-0033).
//
// The world geometry stays a ONE-SHOT /api/tree fetch (it re-walks stories/ and
// parses every frontmatter file per hit — never poll it). Presence alone polls
// GET /api/presence on the StoreBanner's slow cadence (same DB-connection cost
// envelope, no new cost class), and a slower "now" ticker re-derives each
// session's staleness band client-side between polls — so a wisp visibly ages
// fresh → stale → possibly-dead with zero fetches. The server-sent band stays
// on the wire for compat; the client recomputation overrides it.
//
// Advisory discipline (ADR-0033 "silently absent"): a `sessions: null` answer
// (down DB / json store) empties the layer without an error surface — the
// StoreBanner owns the explanatory UX. A failed POLL (the studio server itself
// not answering) keeps the last-known sessions instead: the banner names that
// problem, and the reband ticker honestly ages the stale wisps meanwhile.

import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyPresence } from '@storytree/core/presence';
import { api } from '../api';
import type { TreeSession } from '../types';

/** Poll cadence — parity with StoreBanner's SLOW_POLL_MS (one shared cost envelope). */
export const PRESENCE_POLL_MS = 30_000;
/** The "now" ticker that re-bands and re-ages wisps between polls. */
export const REBAND_TICK_MS = 60_000;

/**
 * Fired by App when the store banner reports the live store recovered — the
 * hook polls immediately for an instant snap-back instead of waiting out the
 * interval. A window event (not prop drilling) so TreeView never remounts.
 */
export const STORE_RECOVERED_EVENT = 'storytree:store-recovered';

export function notifyStoreRecovered(): void {
  window.dispatchEvent(new Event(STORE_RECOVERED_EVENT));
}

/** Age since lastSeenAt, compact ("12m" / "3h"). Pure — the caller supplies now. */
export function formatAge(lastSeenAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(lastSeenAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

/**
 * Bands the WORLD renders as orbiting wisps (ADR-0041): possibly-dead sessions
 * stop orbiting and park in the session dock/panel lists instead. A session
 * whose worktree is deleted before its SessionEnd hook fires can never be
 * marked done (identity is worktree-derived; the hook is fail-silent by
 * contract), so without this cutoff its wisp would orbit forever. Display-level
 * only — the data and the owner-set thresholds (packages/core presence.ts)
 * are untouched. Consumers drive this from the CLIENT-recomputed band
 * (rebandSessions), so a wisp vanishes the moment the ticker crosses 4 h,
 * not at the next fetch.
 */
export function isOrbitingBand(band: TreeSession['band']): boolean {
  return band !== 'possibly-dead';
}

/** Split sessions into the orbiting (fresh/stale) and parked (possibly-dead) groups. */
export function splitSessions(sessions: TreeSession[]): {
  orbiting: TreeSession[];
  parked: TreeSession[];
} {
  const orbiting: TreeSession[] = [];
  const parked: TreeSession[] = [];
  for (const s of sessions) (isOrbitingBand(s.band) ? orbiting : parked).push(s);
  return { orbiting, parked };
}

/**
 * PURE: re-derive every session's staleness band at `now` (classifyPresence,
 * the ADR-0033 fixed thresholds). Returns the SAME array when nothing changed
 * so memoized consumers don't re-render on every tick.
 */
export function rebandSessions(sessions: TreeSession[], now: Date): TreeSession[] {
  let changed = false;
  const next = sessions.map((s) => {
    const band = classifyPresence(s.lastSeenAt, now);
    if (band === s.band) return s;
    changed = true;
    return { ...s, band };
  });
  return changed ? next : sessions;
}

/**
 * The presence layer: seeded from the one-shot /api/tree payload, then kept
 * near-real-time by the /api/presence poll and aged by the reband ticker.
 *
 * `seed` is TreeView's sessions from the tree payload (undefined until that
 * fetch lands); once the poll has answered, later seed changes are ignored —
 * the poll is the fresher source.
 */
export function usePresence(seed: TreeSession[] | undefined): {
  sessions: TreeSession[];
  now: Date;
} {
  const [raw, setRaw] = useState<TreeSession[]>([]);
  const [now, setNow] = useState(() => new Date());
  const inFlight = useRef(false);
  const polled = useRef(false); // a poll answered — seeds are stale from here on

  useEffect(() => {
    if (seed !== undefined && !polled.current) {
      setRaw(seed);
      setNow(new Date());
    }
  }, [seed]);

  useEffect(() => {
    const poll = async (): Promise<void> => {
      // In-flight guard + visibility gate: a hidden tab spends no DB budget.
      if (inFlight.current || document.visibilityState !== 'visible') return;
      inFlight.current = true;
      try {
        const { sessions } = await api.presence();
        polled.current = true;
        // null → [] : wisps unmount silently (advisory absence, ADR-0033).
        setRaw(sessions ?? []);
        setNow(new Date());
      } catch {
        // The studio server itself didn't answer — keep the last-known layer;
        // the StoreBanner explains, the reband ticker ages it honestly.
      } finally {
        inFlight.current = false;
      }
    };
    const id = window.setInterval(() => void poll(), PRESENCE_POLL_MS);
    // Snap back fast when the tab regains focus or the store recovers, rather
    // than waiting out the interval (the interval alone would self-heal ≤30s).
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), REBAND_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const sessions = useMemo(() => rebandSessions(raw, now), [raw, now]);
  return { sessions, now };
}
