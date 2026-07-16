// useSessionClaimGroups — the studio session dock's claims-grouped-by-session layer (ADR-0200 D7,
// noticeboard-claim-ledger-arc inc 3 unit 4). Sibling to usePresence/useBuildActivity/useClaimActivity,
// but deliberately NOT a global always-on poll: the ledger view is dock-scoped (rendered only while an
// operator has the session dock open), so this hook fetches GET /api/claims once when `open` flips
// true and then keeps polling on the SAME slow cadence as presence for as long as the dock stays open
// — no new background cost class when the dock is closed.
//
// Advisory discipline (mirrors presence/activity): `sessions: null` (down DB / json store) is a
// silent absence, never an error surface — the dock degrades to the presence-only view. A failed
// poll (the studio server itself not answering) keeps the last-known groups.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { SessionClaimGroup } from '../types';
import { PRESENCE_POLL_MS } from './presence';

/**
 * Fetch + poll the claim-ledger dock view while `open` is true. Returns `null` before the first
 * answer lands (or when the store answered `null`); `[]` once the store answers with no live
 * claims. Stops polling the instant `open` flips false — reopening re-fetches immediately rather
 * than waiting out the interval.
 */
export function useSessionClaimGroups(open: boolean): SessionClaimGroup[] | null {
  const [groups, setGroups] = useState<SessionClaimGroup[] | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    const poll = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { sessions } = await api.claims();
        setGroups(sessions);
      } catch {
        // The studio server itself didn't answer — keep the last-known groups.
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate fetch on open — don't wait out the interval
    const id = window.setInterval(() => void poll(), PRESENCE_POLL_MS);
    return () => window.clearInterval(id);
  }, [open]);

  return groups;
}
