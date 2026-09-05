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
//   - `occupancy`: the TRACE's series is populated only by the host-transcript adapter, which is NOT
//     ambient (it needs an explicit `storytree traversal ingest <sessionId>`). A never-ingested
//     session has no series, and the route says so in a line written to be rendered VERBATIM.
//     Note that `occupancy.declared` reads false even on a trace that really carries the field — the
//     producing adapter's coverage is genuinely not in the replay composition yet, and both halves
//     of that are printed. Hard-coding either one true is the one thing this must not do.
//
// ★ AND THAT ABSENCE IS WHY THIS MOUNT NOW MAKES A SECOND READ (ADR-0456 D2). Measured 2026-08-26,
// 2 of 697 local traces carry occupancy at all — so the bar the owner signed has been rendering its
// honest "none observed" for effectively every trace on this machine, including whichever one an
// operator picks. The HOST TRANSCRIPTS are ambient (one per window, written as the window runs) and
// answer for 25 of the 30 most recent traces. `api.contextWindowSeries` reads THIS window's own
// transcript through the same fold `storytree context` reads, and the picture prefers it.
//
// It is a SECOND CALL rather than a widening of `/api/traversal`, and that is deliberate: the replay
// route composes one session's replay out of the sink's own readers and derives nothing, which is
// what keeps this panel and `storytree traversal show` unable to disagree about what a trace
// contains. A transcript is not in the trace. `traversal-panel-arc` names widening the composition
// as its own unit and warns against half-doing it inside a UI increment; ADR-0456 leaves that unit
// where it is. The cost accepted is one picture assembled from two reads.
//
// THE TWO READS ARE INDEPENDENT ON PURPOSE. A failed or slow series read must never take the
// replay's picture down with it — the traversal is the signed subject and the bar is one column of
// it — so the series lands as `null` and the trace-sourced series draws, which already knows how to
// say "none observed". A pending read is likewise NOT an absence.
//
// IT IS ALSO WHERE THE KNOWLEDGE-DEPTH JOIN IS BUILT (ADR-0363 D2, increment
// `standson-depth-from-work-join`): the app-wide corpus meets this component's replay here, and the
// derived model is handed to the picture. A read-only join at render time — nothing is recorded and
// no gate enforces it. See `lib/knowledgeDepth.ts`.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../lib/appData';
import { buildKnowledgeDepth } from '../lib/knowledgeDepth';
import type { ContextCompositionPayload, TraversalReplayPayload } from '../types';
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
  /** `null` while unread OR unreadable — never an empty bar, which would claim an empty window. */
  const [composition, setComposition] = useState<ContextCompositionPayload | null>(null);

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

  // The occupancy read, kept in its own effect so neither read can delay or fail the other. A
  // storytree session id that is a HOST WINDOW id names its own transcript by file name; one that is
  // a legacy worktree SLOT names no single window, and the route answers that as a stated absence
  // rather than a 404 — which the bar renders as "none observed", exactly as it does today.
  useEffect(() => {
    let live = true;
    setComposition(null);
    void (async (): Promise<void> => {
      try {
        const series = await api.contextWindowSeries(sessionId);
        if (live) setComposition(series.composition);
      } catch {
        // Swallowed BY DESIGN, and it is the one place in this component that is right to swallow:
        // the composition bar's absence is a missing bar, not a broken panel. Surfacing a failure
        // here would replace one row of chrome with a failure state for the whole picture, which is
        // the opposite of the arc's clause that the traversal dominates the first glance.
        if (live) setComposition(null);
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
      <TraversalSpine
        replay={replay}
        compact={compact}
        knowledge={knowledge}
        composition={composition}
      />

      {/* THE FACTS LIST IS DELETED (ADR-0393 D1). It stated the replayed-event count, the PARTIAL
          warning, and the occupancy note verbatim from the route. The owner deleted all prose under
          the picture at the LOOK, having been asked whether to collapse it behind a disclosure
          instead. The route still composes those sentences and `storytree traversal show
          <sessionId>` still prints them — the panel stopped repeating them, which is the accepted
          cost: a PARTIAL trace now looks like a complete one until an operator asks the CLI. */}
    </div>
  );
}
