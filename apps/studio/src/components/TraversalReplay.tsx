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
//
// IT IS ALSO WHERE THE KNOWLEDGE-DEPTH JOIN IS BUILT (ADR-0363 D2, increment
// `standson-depth-from-work-join`): the app-wide corpus meets this component's replay here, and the
// derived model is handed to the picture. A read-only join at render time — nothing is recorded and
// no gate enforces it. See `lib/knowledgeDepth.ts`.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { buildKnowledgeDepth } from '../lib/knowledgeDepth';
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
export function TraversalReplay({
  sessionId,
  compact = false,
}: {
  sessionId: string;
  /** The panel is dragged small — forwarded to the picture, which folds chrome rather than shrink. */
  compact?: boolean;
}): React.JSX.Element {
  const [state, setState] = useState<ReplayState>({ status: 'reading' });

  // ADR-0363 D2's read-only depth-from-work join, built HERE because this is where both halves meet:
  // the app already holds the whole corpus (`/api/assets`, one fetch for the whole studio), and this
  // component holds the replay. No new route, no second budget on `api.ts`, and no corpus read on the
  // map's own load path — the tab is lazy, so this runs only once an operator has opened a trace.
  //
  // `assetsStatus` is passed through rather than inferred from `assets.length`: an in-flight fetch and
  // a genuinely empty corpus are different facts, and judging the first would render a confident
  // verdict about a corpus that was never read (ADR-0240 decision 3).
  const { assets, assetsStatus, assetsError } = useAppData();
  const knowledge = useMemo(
    () => buildKnowledgeDepth({ assets, assetsStatus, assetsError }),
    [assets, assetsStatus, assetsError],
  );

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
      <TraversalSpine replay={replay} compact={compact} knowledge={knowledge} />

      {/* THE FACTS LIST IS DELETED (ADR-0393 D1). It stated the replayed-event count, the PARTIAL
          warning, and the occupancy note verbatim from the route. The owner deleted all prose under
          the picture at the LOOK, having been asked whether to collapse it behind a disclosure
          instead. The route still composes those sentences and `storytree traversal show
          <sessionId>` still prints them — the panel stopped repeating them, which is the accepted
          cost: a PARTIAL trace now looks like a complete one until an operator asks the CLI. */}
    </div>
  );
}
