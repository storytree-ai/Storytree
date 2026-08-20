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
//   `ArcRollupSummary[]`  the store answered — the LANE projection, not the whole rollup (see the
//                    list/detail note below `useArcRollups`, and `ArcRollupSummary` in ../types).
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
import type { ArcRollup, ArcRollupSummary } from '../types';
import { SLOW_POLL_MS } from './poll';

/** The read did not answer — no such route on this backend, or the request failed outright. */
export const ARCS_UNREACHABLE = 'unreachable';

/**
 * `undefined` before anything answers · `'unreachable'` when the read did not answer · `null` when
 * the backend has no document store · the rollups.
 */
export type ArcRollupsState = ArcRollupSummary[] | null | typeof ARCS_UNREACHABLE | undefined;

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

// ---------- the OTHER half: one arc's WHOLE rollup, for the briefing panel ----------
//
// THE LIST/DETAIL SPLIT, AND WHY IT IS TWO READS AND NOT ONE. `GET /api/arcs` used to ship every
// arc's whole rollup, and the briefing panel simply read the selected lane's copy — no second
// fetch, no loading state, instant switching. What that cost was measured against the live store
// on 2026-08-20: 1,364,425 bytes over 76 arcs, re-polled every 30 s while the lens is open. Nearly
// all of it was narrative prose the LANES never draw — an arc's `intent` and `endState`, every
// increment's `objective` and outcome note — and the panel renders that prose for exactly ONE arc.
//
// So the list narrowed to `ArcRollupSummary` (226,836 bytes over the same 76 arcs) and the panel
// reads the arc it is open on through `GET /api/arcs/<id>`, which has served the whole rollup since
// #1195. The panel pays a fetch per SELECTION (5-90 KB) instead of the strip paying for every arc's
// prose on every poll.
//
// IT DOES NOT POLL, and that is a decision rather than an omission. The list poll is what keeps the
// lanes live; the panel re-reads when the SELECTION changes. Polling the detail too would put a
// second 30 s timer on the same drawer for content that changes when an agent lands work, not
// second to second — and an arc whose briefing silently re-rendered underneath a reader mid-sentence
// is a worse surface than one that shows what it read when they opened it.

/** The per-arc read did not answer — the request failed, the route is absent, or the id is gone. */
export const ARC_DETAIL_UNREACHABLE = 'unreachable';

/**
 * `null` when no lane is selected · `undefined` while the read is in flight ·
 * `'unreachable'` when it did not answer · the rollup.
 */
export type ArcRollupState = ArcRollup | typeof ARC_DETAIL_UNREACHABLE | undefined | null;

/**
 * Fetch ONE arc's whole rollup through `read`, re-reading whenever `id` changes. `null` in, `null`
 * out — no selection is not a failed read and must not render as one.
 *
 * THE READER IS INJECTED, not reached for. `ArcSurface` is prop-driven and holds no backend seam of
 * its own (the same posture that lets it prove standalone, and that `arcs`/`claims`/`onOpen` already
 * follow); the composition root hands it `api.arc`. `read` is expected to be stable — it is a module
 * function at the one production call site — and is deliberately NOT in the dependency list, so a
 * caller passing an inline lambda re-reads on `id` alone rather than on every render.
 *
 * THE STALE-ANSWER GUARD IS LOAD-BEARING, not defensive tidiness. Selections change faster than a
 * 30 s-budgeted fetch resolves — a reader arrowing down the lane list can have three reads in
 * flight — and without the generation check the SLOWEST would win and pin the panel to an arc the
 * reader has already left. It is checked on the success path AND the failure path, because a stale
 * REJECTION would flip a perfectly good briefing to "didn't answer" just as loudly.
 *
 * Unlike its list sibling this keeps NO last-known value across a change of id: two different arcs'
 * briefings are not two readings of one thing, and showing arc A's questions under arc B's title
 * while B loads would be the confidently-wrong state the whole surface is built to avoid.
 */
export function useArcRollup(
  id: string | null,
  read: (id: string) => Promise<ArcRollup>,
): ArcRollupState {
  const [state, setState] = useState<ArcRollupState>(id === null ? null : undefined);
  // Bumped per requested id, so an answer that arrives after the selection moved is discarded.
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    const mine = generation.current;
    if (id === null) {
      setState(null);
      return;
    }
    setState(undefined);
    void (async () => {
      try {
        const rollup = await read(id);
        if (generation.current === mine) setState(rollup);
      } catch {
        if (generation.current === mine) setState(ARC_DETAIL_UNREACHABLE);
      }
    })();
    // `read` is intentionally omitted — see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return state;
}
