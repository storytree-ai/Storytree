// The traversal PICTURE (`traversal-panel-arc`, increment `traversal-panel-spine-render`) — the
// dominant thing in the panel, drawn to the owner-signed grammar in
// `docs/design/context-traversal/README.md` with `session-traversal-playback.html` as the composition
// reference. The owner chose Option A on 2026-08-10, so the grammar is settled and not re-litigated
// here; what this file owns is drawing it from a REAL replay instead of from the mock's literal arrays.
//
// HAND-ROLLED SVG, and that is a decision rather than an omission: `apps/studio` carries no charting or
// animation dependency — no d3, no recharts, no framer-motion — and no existing playback or timeline
// component to pattern-match. A dependency added for one panel is a dependency the whole bundle pays
// for, and the geometry this needs is two linear maps and a path per edge.
//
// THE TRANSPORT SCRUBS IN PIXELS, not in minutes, and the fold is why (see `traversalTime.ts`): a
// playhead moving at constant wall-clock speed would spend most of an eight-hour trace sitting inside a
// fold stub watching nothing. The CLOCK still reads real elapsed time, so no wall-clock fact is hidden —
// only the rate at which the picture is walked, which is the same density weighting the axis already
// applies.
//
// WHAT IS NOT HERE, deliberately, and named so a reader does not read the gap as a bug: subagent lanes,
// the per-lane model badge, `parentVisitId` depth indentation and offer fans are all
// `traversal-panel-lanes-and-depth`. Until then the traversal is a SINGLE COLUMN — which is what the
// design requires wherever parent links are not being resolved, since an inferred tree is the one thing
// its honesty clause forbids. The counts of what is held back are rendered, not swallowed.
//
// NOTHING HERE SELF-SIGNS THE APPEARANCE. The owner's LOOK against the canonical mock is the separate
// parked increment `traversal-panel-attestation`; the tests beside this file assert geometry and
// behaviour only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatTokens,
  occupancyAt,
  occupancyFill,
  OCCUPANCY_THRESHOLD_TOKENS,
} from '../lib/traversalOccupancy';
import { buildTraversalSpine, type TraversalMark } from '../lib/traversalSpine';
import { formatClock, formatDuration, timeAt } from '../lib/traversalTime';
import type { TraversalReplayPayload } from '../types';

/**
 * The drawing's own coordinate width. The SVG scales to the panel through its viewBox, so this is a
 * unit system and not a pixel promise — which is what lets the whole picture survive the panel's
 * `PANEL_MIN=360` and its minimized `min(340px, 66%)` cap without a second layout.
 */
const VIEW_WIDTH = 360;
const AXIS_X = 22;
const SPINE_X = 104;
const MARK_RADIUS = 3.4;
const TOP_PAD = 10;
const BOTTOM_PAD = 10;

/** Playback speed along the axis. 90 units/s walks a full-height trace in about eight seconds. */
const PLAY_UNITS_PER_SECOND = 90;

export function TraversalSpine({ replay }: { replay: TraversalReplayPayload }): React.JSX.Element {
  const model = useMemo(() => buildTraversalSpine(replay), [replay]);
  const { scale, marks, edges, occupancy } = model;

  // The playhead lives in AXIS UNITS, which is also what the scrubber's value is: one source of truth
  // for "where are we", from which both the clock and the occupancy reading are derived.
  //
  // It is MIRRORED IN A REF because the animation frame needs to read it without re-subscribing every
  // frame, and because the alternative — advancing it inside a `setPlayY` updater — puts the end-of-
  // playback stop inside a function React is free to call twice. State updaters stay pure here; the ref
  // is the loop's own cursor and `setPosition` is the only writer of either.
  const [playY, setPlayY] = useState(0);
  const [playing, setPlaying] = useState(false);
  const positionRef = useRef(0);

  const setPosition = useCallback((next: number): void => {
    positionRef.current = next;
    setPlayY(next);
  }, []);

  // A new session resets the transport. A playhead surviving a change of trace would read as a position
  // in the NEW trace that nothing in it put there.
  useEffect(() => {
    setPosition(0);
    setPlaying(false);
  }, [replay.sessionId, setPosition]);

  // The playback loop computes the playhead ABSOLUTELY — from where the run started plus how long it
  // has been running — rather than adding a per-frame delta to the current position. The two look
  // equivalent and are not: an accumulating loop is only correct if EXACTLY ONE of it is running, and
  // React deliberately mounts effects twice in development StrictMode. Two accumulating loops sharing
  // one cursor each add their own delta and the playhead runs at double speed (measured ~3x in the dev
  // server on 2026-08-12, before this was rewritten). Two ABSOLUTE loops compute the same number and
  // write it twice, which is merely wasteful instead of wrong.
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startY = positionRef.current;
    let cancelled = false;
    let handle = 0;
    const step = (now: number): void => {
      if (cancelled) return;
      const next = startY + ((now - startedAt) / 1000) * PLAY_UNITS_PER_SECOND;
      if (next >= scale.totalPx) {
        setPosition(scale.totalPx);
        setPlaying(false);
        return;
      }
      setPosition(next);
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(handle);
    };
  }, [playing, scale.totalPx, setPosition]);

  const togglePlay = useCallback(() => {
    // Pressing play at the very end replays from the top rather than doing nothing.
    if (!playing && positionRef.current >= scale.totalPx) setPosition(0);
    setPlaying(!playing);
  }, [playing, scale.totalPx, setPosition]);

  const nothingToDraw = marks.length === 0;
  const atMs = timeAt(scale, playY);
  const observed = occupancyAt(occupancy, atMs);
  const height = scale.totalPx + TOP_PAD + BOTTOM_PAD;

  return (
    <div className="traversal-spine" data-testid="traversal-spine">
      <div className="traversal-transport">
        <button
          type="button"
          className="traversal-transport-button"
          onClick={togglePlay}
          aria-pressed={playing}
          disabled={nothingToDraw}
          data-testid="traversal-play"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          className="traversal-scrubber"
          aria-label="scrub the traversal playback"
          min={0}
          max={Math.max(1, scale.totalPx)}
          step="any"
          value={playY}
          disabled={nothingToDraw}
          onChange={(event) => {
            setPlaying(false);
            setPosition(Number(event.currentTarget.value));
          }}
          data-testid="traversal-scrubber"
        />
        {/* The clock reads REAL elapsed wall-clock, even though the scrubber walks density-weighted
            pixels — the folding compresses the picture, never the reported duration. */}
        <output className="traversal-clock small" data-testid="traversal-clock">
          {formatClock(atMs - scale.startMs)} / {formatClock(scale.elapsedMs)}
        </output>
      </div>

      <OccupancyBar
        observed={observed?.residentTokens ?? null}
        scaleTokens={occupancy.scaleTokens}
        observationCount={occupancy.observationCount}
      />

      {nothingToDraw ? (
        <p className="small muted traversal-spine-empty" data-testid="traversal-spine-empty">
          nothing plottable in this trace — no context visit or search was recorded
          {model.deferred.laneEdges + model.deferred.offers > 0
            ? ', though it does carry events this increment does not draw yet (see below)'
            : ''}
          .
        </p>
      ) : (
        <svg
          className="traversal-spine-map"
          viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
          role="img"
          aria-label={`Context traversal of ${replay.sessionId}: ${marks.length} steps over ${formatDuration(scale.elapsedMs)}`}
          data-testid="traversal-spine-map"
        >
          {/* The compact vertical spine, and the fold marks that sit on it. */}
          <line
            className="traversal-axis"
            x1={AXIS_X}
            x2={AXIS_X}
            y1={TOP_PAD}
            y2={height - BOTTOM_PAD}
          />
          {scale.folds.map((fold) => {
            const midpoint = TOP_PAD + (fold.yStart + fold.yEnd) / 2;
            return (
              // A fold is DRAWN — two slashes plus the duration it stands for. An idle span is neither
              // removed nor stretched, and a reader can see exactly how much time it hid.
              <g key={`fold-${fold.fromMs}`} className="traversal-fold" data-testid="traversal-fold">
                <path
                  className="traversal-fold-mark"
                  d={`M ${AXIS_X - 5} ${midpoint - 3} L ${AXIS_X + 6} ${midpoint + 1} M ${AXIS_X - 5} ${midpoint + 2} L ${AXIS_X + 6} ${midpoint + 6}`}
                />
                <text className="traversal-fold-label" x={AXIS_X + 10} y={midpoint + 4}>
                  {fold.label}
                </text>
              </g>
            );
          })}

          {edges.map((edge) => (
            // Solid for a full payload read, grey dotted for front matter only. The class is the whole
            // discriminator, and it comes from the event kind.
            <path
              key={edge.id}
              className={`traversal-edge strength-${edge.strength}${playY >= edge.toY ? ' is-visible' : ''}`}
              data-strength={edge.strength}
              d={edgePath(edge.fromY + TOP_PAD, edge.toY + TOP_PAD)}
            />
          ))}

          {marks.map((mark) => (
            <Mark key={mark.id} mark={mark} visible={playY >= mark.y} />
          ))}

          {/* The playhead. */}
          <g className="traversal-playhead" aria-hidden="true">
            <line x1={AXIS_X - 6} x2={VIEW_WIDTH - 8} y1={playY + TOP_PAD} y2={playY + TOP_PAD} />
            <circle cx={AXIS_X} cy={playY + TOP_PAD} r={2.5} />
          </g>
        </svg>
      )}

      <DeferredNote model={model} />
    </div>
  );
}

/**
 * The one playhead occupancy bar.
 *
 * Three states, and they are three because collapsing any two of them would assert something nobody
 * observed: a reading, "nothing observed YET at this playhead" (before the first request), and "this
 * session has no series at all". The last is the ordinary case rather than an edge case — the field is
 * populated only by the host-transcript adapter, which is not ambient, and measured on this machine on
 * 2026-08-11 exactly none of 323 recorded traces carried it until one was ingested on purpose. A flat
 * zero bar would say the window was empty, which is a claim about the session, not about the observation.
 *
 * The absent state names the absence and the REMEDY, and deliberately does not restate what was
 * observed: the route composes that declaration and the mount renders it VERBATIM just below, so that
 * a UI reader and `storytree traversal show` cannot be told different things. Recomputing the counts
 * here would be exactly the second, softer account that rendering verbatim exists to prevent.
 */
function OccupancyBar({
  observed,
  scaleTokens,
  observationCount,
}: {
  observed: number | null;
  scaleTokens: number;
  observationCount: number;
}): React.JSX.Element {
  if (observationCount === 0) {
    return (
      <p className="small muted traversal-occupancy-absent" data-testid="traversal-occupancy-absent">
        no occupancy series to plot — what was observed is stated below. Reading one from this
        machine’s host transcript is <code>storytree traversal ingest {'<sessionId>'}</code>.
      </p>
    );
  }

  const fill = observed === null ? null : occupancyFill(observed, scaleTokens);
  return (
    <div className="traversal-occupancy" data-testid="traversal-occupancy">
      <div
        className="traversal-occupancy-track"
        role="img"
        aria-label={
          observed === null
            ? 'no context observation yet at the playhead'
            : `${formatTokens(observed)} tokens resident in the session window at the playhead`
        }
      >
        {fill !== null && (
          <>
            <span
              className="traversal-occupancy-fill is-safe"
              data-testid="traversal-occupancy-safe"
              style={{ width: `${fill.safeFraction * 100}%` }}
            />
            {/* The red is the WHOLE signal for the threshold — no marker, tick, or arc is drawn for it
                anywhere, and this segment simply starts where the fill splits. */}
            <span
              className="traversal-occupancy-fill is-over"
              data-testid="traversal-occupancy-over"
              style={{ left: `${fill.overStartFraction * 100}%`, width: `${fill.overFraction * 100}%` }}
            />
          </>
        )}
      </div>
      <p className="small muted traversal-occupancy-readout" data-testid="traversal-occupancy-readout">
        <span className={fill !== null && fill.overFraction > 0 ? 'traversal-occupancy-value is-over' : 'traversal-occupancy-value'}>
          {observed === null ? '— resident' : `${formatTokens(observed)} resident`}
        </span>{' '}
        <span>
          {observationCount} observation{observationCount === 1 ? '' : 's'} · red past{' '}
          {formatTokens(OCCUPANCY_THRESHOLD_TOKENS)}
        </span>
      </p>
    </div>
  );
}

/** A plain mark — identity and read strength, and NEVER a per-visit token readout or a gauge ring. */
function Mark({ mark, visible }: { mark: TraversalMark; visible: boolean }): React.JSX.Element {
  const y = mark.y + TOP_PAD;
  return (
    <g
      className={`traversal-mark strength-${mark.strength}${visible ? ' is-visible' : ''}`}
      data-testid="traversal-mark"
      data-strength={mark.strength}
    >
      <title>{mark.label}</title>
      {mark.strength === 'search' ? (
        // The only non-circular mark in the grammar: a small magnifying glass.
        <>
          <circle className="traversal-search-lens" cx={SPINE_X - 0.5} cy={y - 0.5} r={MARK_RADIUS * 0.85} />
          <line
            className="traversal-search-handle"
            x1={SPINE_X + MARK_RADIUS * 0.45}
            y1={y + MARK_RADIUS * 0.45}
            x2={SPINE_X + MARK_RADIUS * 1.5}
            y2={y + MARK_RADIUS * 1.5}
          />
        </>
      ) : (
        <circle className="traversal-mark-dot" cx={SPINE_X} cy={y} r={MARK_RADIUS} />
      )}
    </g>
  );
}

/**
 * What the picture is holding back, and which increment draws it.
 *
 * Rendered rather than swallowed: a trace can be a third lane edges and offers, and a panel that plots
 * only the spine while saying nothing invites the reading that the trace contains only the spine.
 */
function DeferredNote({ model }: { model: ReturnType<typeof buildTraversalSpine> }): React.JSX.Element | null {
  const parts: string[] = [];
  if (model.deferred.laneEdges > 0) {
    parts.push(`${model.deferred.laneEdges} subagent lane event${model.deferred.laneEdges === 1 ? '' : 's'}`);
  }
  if (model.deferred.offers > 0) {
    parts.push(`${model.deferred.offers} offer event${model.deferred.offers === 1 ? '' : 's'}`);
  }
  if (model.undatable > 0) {
    parts.push(`${model.undatable} event${model.undatable === 1 ? '' : 's'} with no readable timestamp`);
  }
  if (parts.length === 0) return null;

  return (
    <p className="small muted traversal-spine-deferred" data-testid="traversal-spine-deferred">
      not drawn here: {parts.join(', ')}. Lanes, depth and offer fans are{' '}
      <code>traversal-panel-lanes-and-depth</code>
      {model.undatable > 0 ? '; an undatable event is left unplaced rather than guessed at' : ''}.
    </p>
  );
}

/** A gentle S-curve between two rows of the spine, matching the reference composition's edge shape. */
function edgePath(fromY: number, toY: number): string {
  const middle = (fromY + toY) / 2;
  return `M ${SPINE_X} ${fromY} C ${SPINE_X} ${middle}, ${SPINE_X} ${middle}, ${SPINE_X} ${toY}`;
}

/** The drawing's coordinate constants, exported so a test can assert a row without re-deriving them. */
export const TRAVERSAL_SPINE_GEOMETRY = { VIEW_WIDTH, AXIS_X, SPINE_X, TOP_PAD, BOTTOM_PAD } as const;
