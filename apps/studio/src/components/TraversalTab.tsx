// The bottom panel's TRAVERSAL TAB (`traversal-panel-arc`) — the rail and the replay beside it.
//
// This component is where two increments meet, and they are separable on purpose:
//   - `traversal-panel-bottom-tab-host` gave the replay a tab to live in;
//   - `traversal-panel-trace-index-list` decides WHAT the rail offers, and that is the decision with
//     the history: the claim-join is WITHDRAWN (ADR-0354 D2). The rail is now this machine's whole
//     local trace index, newest first — no claim, no story selection, nothing caught in flight.
//
// The join it replaces was not a bug, it was a category error, and the measurement is worth keeping:
// 339 local traces on this machine, exactly ONE reachable through the claim-gated picker, and only
// because the staging session took an `exploring` claim on `studio` to manufacture a row. A claim is
// a LIVE coordination signal; a replay is RETROSPECTIVE. Gating the second on the first means an
// operator may only watch the sessions they happen to catch mid-flight — which is close to none.
//
// THE HONESTY SURVIVES THE WITHDRAWAL, and that is the whole risk of the increment. It lives next
// door in the pure `lib/traversalIndex.ts` and is proved there: pending / failed / empty stay three
// distinct states, an undated trace is offered-and-explained rather than dropped, the searched
// directory travels with the answer, and the hosted studio's empty list is a correct answer rather
// than an error.
//
// THE INDEX IS READ ONCE, LAZILY — on the tab's first activation, never on mount and never polled.
// A trace grows only by capture, so a cadence would buy an operator nothing while adding an
// always-on cost class; and reading it before the operator has ever opened the tab would put a
// 10-second budget on the map's own load for a panel nobody asked for. The read is retried, because
// a single slow answer must not disable the rail permanently (`traversal-panel-index-read`).

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  buildTraversalTraceList,
  traceAgeLabel,
  type TraversalIndexState,
  type TraversalTraceRow,
} from '../lib/traversalIndex';
import { TraversalReplay } from './TraversalReplay';

export interface TraversalTabProps {
  /** True while this tab is the forward one AND the panel is unfolded. Drives the LAZY first read. */
  active: boolean;
  /** Report the selected trace to the host's tab strip — the composition reference names it there. */
  onMeta: (meta: string | null) => void;
  /** The panel is dragged small: the chrome yields and the picture keeps the room (ADR-0354 D4). */
  compact: boolean;
}

export function TraversalTab({ active, onMeta, compact }: TraversalTabProps): React.JSX.Element {
  const [index, setIndex] = useState<TraversalIndexState>({ status: 'pending' });
  const [selected, setSelected] = useState<string | null>(null);
  /** Latched on first activation: once the tab has been opened, the read has happened and the rail
   *  keeps its answer across later folds. Without the latch, `active` going false would re-arm the
   *  effect and re-read the index on every tab switch. */
  const [everActive, setEverActive] = useState(false);

  useEffect(() => {
    if (active) setEverActive(true);
  }, [active]);

  useEffect(() => {
    if (!everActive) return;
    let live = true;
    void (async (): Promise<void> => {
      try {
        const payload = await api.traversalSessions();
        if (live) setIndex({ status: 'read', payload });
      } catch (error) {
        // NOT an empty index: the studio server did not answer, which must never be rendered as
        // "this machine holds no traces" — the two send an operator to different places to look.
        if (live) setIndex({ status: 'failed', message: (error as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [everActive]);

  const list = useMemo(() => buildTraversalTraceList(index), [index]);
  const rows = list.state === 'listed' ? list.rows : [];
  const newest = rows[0];
  const chosen = rows.find((row) => row.sessionId === selected) ?? null;

  // The tab strip's right-hand meta line. Derived from the SELECTED row rather than composed from
  // the replay payload, so it is truthful the instant a selection is made and cannot disagree with
  // the rail about how many events the index counted.
  useEffect(() => {
    onMeta(
      chosen
        ? `${chosen.sessionId} · ${chosen.eventCount} event${chosen.eventCount === 1 ? '' : 's'}`
        : null,
    );
  }, [chosen, onMeta]);

  return (
    <div className="traversal-tab" data-testid="traversal-tab">
      <div className="traversal-tab-rail">
        <div className="traversal-tab-rail-head">
          <b data-testid="traversal-index-count">
            {list.state === 'listed' ? list.heading : railHeading(list.state)}
          </b>
          <span>newest observed first · no claim, no story</span>
        </div>

        {list.state === 'listed' ? (
          <div className="traversal-tab-rows" role="listbox" aria-label="Local trace index">
            {rows.map((row) => (
              <button
                type="button"
                key={row.sessionId}
                role="option"
                aria-selected={row.sessionId === selected}
                aria-current={row.sessionId === selected}
                className="traversal-tab-row"
                onClick={() => setSelected(row.sessionId)}
              >
                <span className="traversal-tab-row-sid">{row.sessionId}</span>
                <span className="traversal-tab-row-count">{row.eventCount}</span>
                <span className="traversal-tab-row-sub">{traceAgeLabel(row, newest)}</span>
              </button>
            ))}
          </div>
        ) : (
          // Pending, failed and empty each render their OWN sentence. A shared "nothing here" would
          // be the exact collapse the pure module exists to prevent.
          <p className="traversal-tab-rail-note" data-testid="traversal-index-note">
            {list.note}
          </p>
        )}
      </div>

      <div className="traversal-tab-plot">
        {chosen ? (
          <TraversalReplay sessionId={chosen.sessionId} />
        ) : (
          <p className="traversal-tab-idle" data-testid="traversal-tab-idle">
            {list.state === 'listed'
              ? 'Pick a trace to replay its context traversal.'
              : 'No trace is selected.'}
          </p>
        )}
      </div>

      {/* The compact state is the host's measurement, applied here as a hook for the picture to read
          once it is redrawn (`traversal-panel-wide-reflow`). Rendered as data rather than acted on,
          so the two increments do not have to land together. */}
      <span hidden data-testid="traversal-tab-compact" data-compact={compact ? 'true' : 'false'} />
    </div>
  );
}

/** The rail's heading while there is no count to state — never a fabricated "0 local traces". */
function railHeading(state: 'pending' | 'failed' | 'empty'): string {
  if (state === 'pending') return 'Local traces';
  if (state === 'failed') return 'Local traces — unread';
  return 'No local traces';
}

export type { TraversalTraceRow };
