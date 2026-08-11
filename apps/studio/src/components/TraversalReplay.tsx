// The traversal replay MOUNT (`traversal-panel-arc`, increment `traversal-panel-session-picker`).
//
// WHAT THIS IS NOT, stated first because it is the thing a reader will assume: this is not the
// picture. `traversal-panel-spine-render` is the increment that draws the signed visual grammar —
// the compact vertical spine, folded idle, read-strength edges and the one playhead occupancy bar —
// and it is parked and unbuilt. This increment builds the PICKER and the SEAM it mounts into, and
// stops there deliberately rather than sketching a placeholder picture the owner never signed.
//
// So what a selected session renders TODAY is the replay's own HONESTY — the part of the payload
// that is already true and already useful, and that the picture will sit above rather than replace:
// how much was read, whether the trace was partial, and what may be said about occupancy. That is a
// real answer to "is there anything here to look at, and is it whole", which is exactly the question
// an operator asks before spending attention on a replay.
//
// Two absences are rendered as absences and never smoothed:
//   - `partial` (ADR-0241 D5): a trace with unusable lines must never present as complete.
//   - `occupancy`: the series is populated only by the host-transcript adapter, which is NOT ambient
//     (it needs an explicit `storytree traversal ingest <sessionId>`). A never-ingested session has
//     no series, and the route says so in a line written to be rendered VERBATIM. This component
//     renders that line rather than composing its own, so the surface and the CLI cannot disagree.
//     Note that `occupancy.declared` reads false even on a trace that really carries the field — the
//     producing adapter's coverage is genuinely not in the replay composition yet, and both halves
//     of that are printed. Hard-coding either one true is the one thing this must not do.

import { useEffect, useState } from 'react';
import { api } from '../api';
import type { TraversalReplayPayload } from '../types';

type ReplayState =
  | { readonly status: 'reading' }
  | { readonly status: 'read'; readonly replay: TraversalReplayPayload }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Read and mount one session's replay. Re-reads when `sessionId` changes; a read that lands after
 * the operator has moved on is discarded rather than painted over the newer selection.
 */
export function TraversalReplay({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [state, setState] = useState<ReplayState>({ status: 'reading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'reading' });
    void (async (): Promise<void> => {
      try {
        const replay = await api.traversal(sessionId);
        if (live) setState({ status: 'read', replay });
      } catch (error) {
        if (live) setState({ status: 'failed', message: (error as Error).message });
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionId]);

  if (state.status === 'reading') {
    return (
      <div className="traversal-replay" data-testid="traversal-replay" data-replay-state="reading">
        <p className="muted small">reading {sessionId}’s trace…</p>
      </div>
    );
  }

  if (state.status === 'failed') {
    // Never "this session traversed nothing": a read that did not answer is the absence of an
    // observation, not an observation of absence.
    return (
      <div className="traversal-replay" data-testid="traversal-replay" data-replay-state="failed">
        <p className="small traversal-replay-note">could not read this session’s trace — {state.message}</p>
      </div>
    );
  }

  const { replay } = state;
  return (
    <div className="traversal-replay" data-testid="traversal-replay" data-replay-state="read">
      {/* The seam the spine increment fills. It is a NAMED hole rather than a blank one, so an
          operator meeting it knows the picture is unbuilt rather than broken or empty. */}
      <p className="small traversal-replay-pending" data-testid="traversal-spine-pending">
        The traversal picture is not drawn yet — <code>traversal-panel-spine-render</code> is the
        increment that renders it. What this trace already reports:
      </p>
      <ul className="traversal-replay-facts small">
        <li>
          <strong>{replay.events.length}</strong> replayed event{replay.events.length === 1 ? '' : 's'}
          {replay.partial ? (
            <span className="traversal-replay-partial" data-testid="traversal-partial">
              {' '}
              · PARTIAL: {replay.skipped} line{replay.skipped === 1 ? '' : 's'} could not be read
            </span>
          ) : null}
        </li>
        <li className="muted" data-testid="traversal-occupancy-note">
          {/* Rendered VERBATIM — the route composes this line so a UI reader and a terminal reader
              are told the same thing about what the adapters observed. */}
          {replay.occupancy.note}
        </li>
      </ul>
    </div>
  );
}
