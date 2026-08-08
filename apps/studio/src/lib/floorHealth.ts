// useFloorHealth — the factory-floor health strip's data layer (ADR-0314 D7, instrument ADR-0316).
//
// Sibling of `useArcRollups`, and deliberately shaped the same way: drawer-scoped (fetched only
// while the arcs lens is open) with FOUR answers, every one of them a different fact.
//
//   `undefined`      nothing has answered yet — genuinely still reading.
//   `'unreachable'`  the read did not answer at all: no such route here, or the request failed.
//   `null`           the backend answered and has NO document store (the offline json backend).
//   a reading        the instrument answered.
//
// The third and fourth are the distinction the server's own handler insists on. The first two are
// the distinction `useArcRollups` got wrong on its first landing (#1191) and paid for: the desktop's
// local backend does not serve this route, so what reaches this hook there is `'unreachable'`, and
// it must NOT read as "no instrument wired" (a lie — the instrument landed in #1215) or as "the floor
// is quiet" (a worse lie — a missing instrument presented as all-clear is the exact failure this band
// exists to avoid). {@link floorHealthBand} maps each answer to its own honest band state.
//
// A TRANSIENT failure is absorbed the same way arcs absorbs one: once anything has answered, a later
// error keeps the last-known value rather than flapping the band to unreachable on a dropped poll.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { FloorHealthReading } from '../types';
import type { FloorHealthBand } from '../components/FloorHealthStrip';

/** The read did not answer — no such route on this backend, or the request failed outright. */
export const FLOOR_HEALTH_UNREACHABLE = 'unreachable';

/**
 * `undefined` before anything answers · `'unreachable'` when the read did not answer · `null` when
 * the backend has no document store · the reading.
 */
export type FloorHealthState =
  | FloorHealthReading
  | null
  | typeof FLOOR_HEALTH_UNREACHABLE
  | undefined;

/**
 * Its OWN cadence, ten times slower than the shared `SLOW_POLL_MS`, and that is a cost decision
 * rather than a preference. Every read of this route scans the whole friction tier and the whole
 * library event log — the `Store` seam filters events by id only — to produce a figure that moves on
 * a DAILY grain: a route lands, or a filing is reinforced. Re-scanning the corpus every 30s for a
 * number that cannot have changed would buy nothing and cost the shared store real work per open
 * client. Five minutes keeps a long-open drawer honest without that.
 */
export const FLOOR_POLL_MS = 5 * 60_000;

/**
 * A FAILED read comes back on the ordinary slow cadence, not the five-minute one, and the reason is
 * measured rather than defensive: the route's first call in a dev server's life pays for a cold
 * dynamic import of `@storytree/drive` on top of a ~4 s corpus scan, which can outrun the client's
 * abort. On the long cadence a single cold-start blip would leave the band reading "no answer" for
 * five minutes — an honest state, but a stale one, and the band is the one surface that must not be
 * left saying less than it could. Retrying a request that already failed costs nothing.
 *
 * Declared here rather than borrowed from `lib/poll.ts`'s `SLOW_POLL_MS`, which it happens to equal.
 * This layer deliberately does NOT ride the world's shared cadence — that is the whole point of
 * {@link FLOOR_POLL_MS} — so importing the shared constant would assert a coupling that is not
 * there, and it broke three TreeView suites that partially mock `../lib/poll`.
 */
export const FLOOR_RETRY_MS = 30_000;

/**
 * Fetch + poll the floor-health reading while `open` is true. Stops the instant `open` flips false;
 * reopening re-fetches immediately rather than waiting out the interval.
 *
 * TICKS AT THE RETRY CADENCE AND SKIPS WHILE THE READING IS FRESH, rather than running a single long
 * interval, so a failed read comes back in {@link FLOOR_RETRY_MS} while a successful one is left
 * alone for {@link FLOOR_POLL_MS}. Two delays, one timer.
 *
 * THE `inFlight` REF IS LOAD-BEARING, not defensive tidiness — `useArcRollups` next door carries it
 * for the same reason and it is easy to drop as redundant. React StrictMode invokes an effect,
 * tears it down and invokes it again on mount; without the shared ref that is TWO concurrent reads
 * of the whole corpus, and measured here it was worse than wasteful: the pair contended, the first
 * response landed against a torn-down closure and the second aborted, so the band read "no answer"
 * for a minute over a route that was answering 200s the whole time.
 */
export function useFloorHealth(open: boolean): FloorHealthState {
  const [state, setState] = useState<FloorHealthState>(undefined);
  const inFlight = useRef(false);
  const freshUntil = useRef(0);

  useEffect(() => {
    if (!open) return;
    const poll = async (): Promise<void> => {
      if (inFlight.current || Date.now() < freshUntil.current) return;
      inFlight.current = true;
      try {
        const payload = await api.floorHealth();
        freshUntil.current = Date.now() + FLOOR_POLL_MS;
        setState(payload.reading);
      } catch {
        // Nothing has answered yet ⇒ say so. Something has ⇒ this is a blip; keep what we know.
        // `freshUntil` is deliberately NOT advanced: the next tick retries.
        setState((known) => (known === undefined ? FLOOR_HEALTH_UNREACHABLE : known));
      } finally {
        inFlight.current = false;
      }
    };
    void poll(); // immediate fetch on open — don't wait out the interval
    const id = window.setInterval(() => void poll(), FLOOR_RETRY_MS);
    return () => window.clearInterval(id);
  }, [open]);

  return state;
}

/** Human-readable window text. Both bounds open ⇒ the instrument read all of history. */
function windowText(window: { from?: string; to?: string }): string {
  const trim = (iso: string): string => (iso.length > 10 ? iso.slice(0, 10) : iso);
  const from = window.from === undefined ? 'all history' : trim(window.from);
  const to = window.to === undefined ? 'now' : trim(window.to);
  return `${from} → ${to}`;
}

/**
 * The cause in the owner's language. The instrument's key is a Library artifact id (the
 * lowest-sorting member of the collapsed cause), which is a slug — de-slugged here rather than in the
 * instrument, because how a figure READS is the band's business and what it MEASURES is not
 * (ADR-0316 D4). The id itself survives on `id`, which is what the band deep-links.
 */
function causeText(key: string): string {
  return key.replace(/-/g, ' ');
}

/**
 * Map one wire answer to the band's input.
 *
 * WHAT THIS DELIBERATELY DROPS is the half worth reviewing. The reading carries `distinctCauses` and
 * `unjoined` — a ceiling on how many live causes exist and how far the collapsing rule reached — and
 * NEITHER crosses into the band. They are counts over a population, and a persistent strip that
 * shouts a population size is one step from the filing tally that closed
 * `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`. The band answers "is the floor in
 * trouble", which is a question about ONE cause coming back, not about how many exist. `members` is
 * dropped for the same reason: "3 filings, one cause" is a filing count wearing a collapse label.
 * `FloorHealthSignal` has nowhere to put any of them, and that is the structural half of the fence.
 */
export function floorHealthBand(state: FloorHealthState): FloorHealthBand {
  if (state === undefined) return { pending: true };
  if (state === FLOOR_HEALTH_UNREACHABLE) {
    return { declined: "the floor-health read didn't answer here" };
  }
  if (state === null) {
    return { declined: 'needs the live store — this backend has none' };
  }
  return {
    bottlenecks:
      state.loudest === undefined
        ? []
        : [
            {
              id: state.loudest.cause,
              cause: causeText(state.loudest.cause),
              recurrences: state.loudest.recurrences,
            },
          ],
    window: windowText(state.window),
    collapsingRule: state.collapsingRule,
  };
}
