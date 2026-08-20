// useArcRollups — the arc surface's data layer (ADR-0267 / ADR-0314). Sibling of
// `useSessionClaimGroups`, and deliberately NOT a global always-on poll: the arcs lens is
// drawer-scoped (rendered only while the drawer is open on the arcs lens), so this fetches
// GET /api/arcs once when `open` flips true and then re-polls on the SAME shared slow cadence
// (lib/poll.ts) for as long as it stays open — no new background cost class when it is closed.
//
// FOUR ANSWERS, AND EVERY ONE OF THEM IS A DIFFERENT FACT:
//
//   `undefined`      nothing has answered yet — genuinely still loading.
//   `'unreachable'`  the read did not answer at all: no such route here, or the request failed.
//   `null`           the backend answered and has NO document store (the offline json backend).
//   `ArcRollup[]`    the store answered.
//
// The third and fourth are the distinction the server's own handler insists on — "the store isn't
// here" and "there are no arcs" are different facts, and a surface built to restore context must
// not blur them into a confident empty state. The FIRST TWO are the distinction this hook got wrong
// on its first landing (#1191), and the cost was measured rather than theorised: the desktop app
// loads the compiled studio bundle against its own local backend (`apps/desktop/src/backend/
// local-backend.ts`), and that backend did not mirror `/api/arcs` — it 404'd it. The catch below
// swallowed that and left the state at `undefined` forever, so the desktop arc lens sat on
// "Reading arcs…" permanently — a spinner that will never resolve, which is a worse lie than an
// empty list because it tells the owner to wait.
//
// THE DESKTOP MIRRORS THE ROUTE NOW (its `docStore` seam + `/api/arcs` pair, held to the studio's
// payload by the `MIRRORS` row in packages/cli/src/mirror-conformance.ts), so the thick client
// reaches the third and fourth answers like the studio does. `'unreachable'` did NOT become
// unreachable code: a request can still fail, and a desktop build older than that mirror still
// 404s. The state earned its keep on a case that has been fixed and remains the honest answer for
// the cases that have not.
//
// A TRANSIENT failure is still absorbed: once anything has answered, a later error keeps the
// last-known value rather than flapping the surface to unreachable on one dropped poll. Only a
// failure with nothing yet known is reported, because that is the one a reader cannot wait out.
//
// `unreachable` IS NOW EXPENSIVE TO REACH, which is the point: `api.arcs()` retries three times on a
// 30 s budget (see its comment for the measurement), so reaching the catch below means every attempt
// lost — not that one fetch was slow. Before that it took a single clipped read: a 12.56 s answer
// against a 10 s abort put the lens on "the arc read didn't answer" while the store was healthy, and
// left it there until a later 30 s poll happened to land. Throughout the retry this state stays
// `undefined`, which is what ArcSurface renders as a spinner + "Reading arcs…" — the honest reading
// of a read still in flight, and the reason that spinner cannot hang: the retry is finite.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ArcRollup } from '../types';
import { SLOW_POLL_MS } from './poll';

/** The read did not answer — no such route on this backend, or the request failed outright. */
export const ARCS_UNREACHABLE = 'unreachable';

/**
 * `undefined` before anything answers · `'unreachable'` when the read did not answer · `null` when
 * the backend has no document store · the rollups.
 */
export type ArcRollupsState = ArcRollup[] | null | typeof ARCS_UNREACHABLE | undefined;

/**
 * Fetch + poll the arc rollups while `open` is true. Stops polling the instant `open` flips false;
 * reopening re-fetches immediately rather than waiting out the interval.
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
        // Nothing has answered yet ⇒ say so. Something has ⇒ this is a blip; keep what we know.
        setArcs((known) => (known === undefined ? ARCS_UNREACHABLE : known));
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
