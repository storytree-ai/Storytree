// The traversal replay MOUNT (`traversal-panel-arc`) — the picker's seam, now FILLED.
//
// `traversal-panel-session-picker` built this as a named hole: it fetched the replay, rendered the
// payload's own honesty, and said in as many words which increment would draw the picture. This is that
// increment (`traversal-panel-spine-render`), so the placeholder is gone and `TraversalSpine` sits in
// its place — the compact vertical spine, explicitly folded idle, read-strength edges, the search glyph,
// the one playhead occupancy bar and the transport.
//
// THE HONESTY FACTS STAYED, below the picture rather than instead of it, and that was the point of
// putting them there first: how much was read, whether the trace was PARTIAL, and what may be said
// about occupancy are what an operator checks before trusting a replay they are looking at. A picture
// that replaced them would be a prettier surface making a weaker claim.
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
import { TraversalSpine } from './TraversalSpine';

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
      {/* The picture. It goes FIRST because the design's second acceptance clause is that the
          traversal — not the bar, not a metric, not a line of prose — dominates the first glance. */}
      <TraversalSpine replay={replay} />

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
