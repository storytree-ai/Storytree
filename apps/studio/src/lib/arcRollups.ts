// useArcRollups — the arc surface's data layer (ADR-0267 / ADR-0314). Sibling of
// `useSessionClaimGroups`, and deliberately NOT a global always-on poll: the arcs lens is
// drawer-scoped (rendered only while the drawer is open on the arcs lens), so this fetches
// GET /api/arcs once when `open` flips true and then re-polls on the SAME shared slow cadence
// (lib/poll.ts) for as long as it stays open — no new background cost class when it is closed.
//
// THREE ANSWERS, NOT TWO, and the third is the point. `undefined` = nothing has answered yet;
// `null` = the backend answered but has no document store (the offline json backend, or a desktop
// backend that does not mirror this route); an array = the store answered. A surface built to
// restore context must not render "no arcs" over any of the other two — `arcs: null` and `arcs: []`
// are different facts (the server's own handler is explicit about this), and "still loading" is a
// third. Collapsing them is how a surface tells a confident lie about an empty portfolio.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ArcRollup } from '../types';
import { SLOW_POLL_MS } from './poll';

/** `undefined` before the first answer · `null` when the backend has no store · the rollups. */
export type ArcRollupsState = ArcRollup[] | null | undefined;

/**
 * Fetch + poll the arc rollups while `open` is true. Stops polling the instant `open` flips false;
 * reopening re-fetches immediately rather than waiting out the interval. A failed request (the
 * studio server itself not answering, or a backend that 404s this route) keeps the last-known
 * value — advisory like every other poll here, never an error surface.
 */
export function useArcRollups(open: boolean): ArcRollupsState {
  const [arcs, setArcs] = useState<ArcRollupsState>(undefined);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    const poll = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const payload = await api.arcs();
        setArcs(payload.arcs);
      } catch {
        // The studio server itself didn't answer — keep the last-known value.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate fetch on open — don't wait out the interval
    const id = window.setInterval(() => void poll(), SLOW_POLL_MS);
    return () => window.clearInterval(id);
  }, [open]);

  return arcs;
}
