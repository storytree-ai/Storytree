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
// WIDENED BY `traversal-panel-lanes-and-depth`: subagent lanes, the per-lane badge naming agent type
// AND recorded model, `parentVisitId` depth indentation, and explicit-only offer fans now draw here.
// Their rules live in the three lib modules beside `traversalSpine.ts` so each is provable on its own;
// what this file owns is placing them in 360 units of width. Three of those rules are visible in the
// composition rather than only in the data, and each is a refusal:
//
//   • DEPTH INDENTS ONLY WHERE PARENT LINKS EXIST. A trace whose visits carry no resolvable
//     `parentVisitId` renders as a SINGLE COLUMN, and the panel SAYS it is one. An inferred tree is the
//     single thing the design's honesty clause forbids, and "it looked flat" is not a bug report.
//   • A LANE WHOSE MODEL WAS NOT RECORDED SAYS SO. There is no default, no fallback to the session's
//     own model, and no inference from `runtime` — an unrecorded model renders as "model not recorded".
//   • AN OFFER FAN CARRIES ITS RAW DENOMINATOR (ADR-0312 D6) and never a percentage, and the fan is
//     never sorted (ADR-0318 D3). The fork picture is expected to be nearly EMPTY — 1,356 recorded
//     offers against 3 follows on this machine — and drawing a sparse signal honestly is the job.
//
// WHAT IS STILL NOT HERE: revisit loop-backs, by decision (revision clause 4) — the animation carries
// branching, and the link stays answerable by query.
//
// NOTHING HERE SELF-SIGNS THE APPEARANCE. The owner's LOOK against the canonical mock is the separate
// parked increment `traversal-panel-attestation`; the tests beside this file assert geometry and
// behaviour only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRAVERSAL_MAX_DRAWN_DEPTH } from '../lib/traversalDepth';
import type { TraversalLane, TraversalLaneModel } from '../lib/traversalLanes';
import type { TraversalOffer } from '../lib/traversalOffers';
import {
  formatTokens,
  occupancyAt,
  occupancyFill,
  OCCUPANCY_THRESHOLD_TOKENS,
} from '../lib/traversalOccupancy';
import { buildTraversalSpine, type TraversalEdge, type TraversalMark } from '../lib/traversalSpine';
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

/**
 * The width budget, and every number in it is chosen so that NOTHING can paint past `VIEW_WIDTH`.
 *
 * That matters more than it looks: the panel's floor is `PANEL_MIN=360` and its minimized cap is
 * `min(340px, 66%)`, and the SVG scales to whatever it is given through its viewBox — so a coordinate
 * inside the box is inside the block at every width, and one outside it is clipped at every width. The
 * geometry test beside this file walks every drawn coordinate and holds it to `[0, VIEW_WIDTH]`, which
 * is why these are constants rather than inline literals.
 *
 *   spine 104 → depth columns to 104 + 4·13 = 156 → offer fan reaches 104 + 26 = 130
 *   lanes 196 … 340 (the step COMPRESSES with the column count; the last column is pinned at 340)
 *   340 + the lane icon's 5.5 radius = 345.5, inside 360.
 */
const DEPTH_STEP = 13;
const LANE_X_FIRST = 196;
const LANE_X_LAST = 340;
const LANE_STEP_MAX = 36;
const LANE_HALF_WIDTH_MAX = 8;
const LANE_ICON_RADIUS = 5.5;
/** A band for a lane whose handoff and return share one instant — visible, and labelled as instant. */
const LANE_MIN_BAND = 3;
const FAN_RADIUS = 26;
/** How many distinct hues the type palette holds before it wraps. Colour identifies TYPE, not instance. */
const LANE_HUES = 6;

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

  const { lanes, depth, offers } = model;
  // Nothing to draw is nothing DRAWABLE — a trace of pure lane events has no marks and is still a
  // picture. Deciding this on `marks` alone would blank a real traversal.
  const nothingToDraw = marks.length === 0 && lanes.lanes.length === 0 && offers.offers.length === 0;
  const atMs = timeAt(scale, playY);
  const observed = occupancyAt(occupancy, atMs);
  const height = scale.totalPx + TOP_PAD + BOTTOM_PAD;
  const laneLayout = useMemo(() => layoutLanes(lanes), [lanes]);

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
          nothing plottable in this trace — no context visit, search, subagent lane or recorded offer.
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

          {/* The lanes sit UNDER the parent traversal in paint order: a child is a band the parent's
              own spine runs beside, never something drawn over it. */}
          {laneLayout.lanes.map((placed) => (
            <Lane key={placed.lane.edgeId} placed={placed} playY={playY} axisEndY={scale.totalPx} />
          ))}

          {offers.offers.map((offer) => (
            <OfferFan key={offer.candidateSetId} offer={offer} visible={playY >= offer.y} />
          ))}

          {edges.map((edge) => (
            // Solid for a full payload read, grey dotted for front matter only. The class is the whole
            // discriminator, and it comes from the event kind.
            <path
              key={edge.id}
              className={`traversal-edge strength-${edge.strength}${playY >= edge.toY ? ' is-visible' : ''}`}
              data-strength={edge.strength}
              data-depth-move={depthMove(edge)}
              d={edgePath(edge.fromY + TOP_PAD, edge.toY + TOP_PAD, depthX(edge.fromDepth), depthX(edge.toDepth))}
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

      <LaneBadges placed={laneLayout.lanes} />
      <DepthNote model={model} />
      <OfferNote model={model} />
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
  const x = depthX(mark.depth);
  return (
    <g
      className={`traversal-mark strength-${mark.strength}${visible ? ' is-visible' : ''}`}
      data-testid="traversal-mark"
      data-strength={mark.strength}
      data-depth={mark.depth}
    >
      <title>{mark.label}</title>
      {mark.strength === 'search' ? (
        // The only non-circular mark in the grammar: a small magnifying glass.
        <>
          <circle className="traversal-search-lens" cx={x - 0.5} cy={y - 0.5} r={MARK_RADIUS * 0.85} />
          <line
            className="traversal-search-handle"
            x1={x + MARK_RADIUS * 0.45}
            y1={y + MARK_RADIUS * 0.45}
            x2={x + MARK_RADIUS * 1.5}
            y2={y + MARK_RADIUS * 1.5}
          />
        </>
      ) : (
        <circle className="traversal-mark-dot" cx={x} cy={y} r={MARK_RADIUS} />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Subagent lanes
// ---------------------------------------------------------------------------

interface PlacedLane {
  readonly lane: TraversalLane;
  readonly x: number;
  readonly halfWidth: number;
  /** Which hue of the type palette. Keyed by agent TYPE, so every lane of a type shares it. */
  readonly hue: number;
}

/**
 * Put the packed columns on the x axis.
 *
 * The step COMPRESSES rather than the columns clamping: with many concurrent children the lanes get
 * narrower and stay distinct, where clamping would stack two genuinely-concurrent lanes into one
 * column and silently unsay the concurrency the packing measured. The last column is pinned at
 * `LANE_X_LAST`, so the rightmost band edge is a constant no matter how many lanes there are.
 */
function layoutLanes(model: TraversalLaneModel): { lanes: readonly PlacedLane[]; step: number } {
  if (model.lanes.length === 0) return { lanes: [], step: 0 };
  const gaps = Math.max(1, model.columnCount - 1);
  const step = Math.min(LANE_STEP_MAX, (LANE_X_LAST - LANE_X_FIRST) / gaps);
  const halfWidth = Math.max(2.5, Math.min(LANE_HALF_WIDTH_MAX, step / 2 - 1));
  const hueByType = new Map(model.agentTypes.map((type, index) => [type, index % LANE_HUES]));
  return {
    step,
    lanes: model.lanes.map((lane) => ({
      lane,
      x: LANE_X_FIRST + lane.column * step,
      halfWidth,
      hue: hueByType.get(lane.agentType) ?? 0,
    })),
  };
}

/**
 * One subagent lane: the handoff edge out of the parent spine, the band the child ran in, its type
 * icon, and the return edge back. The band GROWS with the playhead, which is the design's "two branches
 * advance at the same time only when work genuinely ran in parallel" made visible — two bands grow
 * together exactly when the trace recorded them overlapping.
 */
function Lane({
  placed,
  playY,
  axisEndY,
}: {
  placed: PlacedLane;
  playY: number;
  axisEndY: number;
}): React.JSX.Element {
  const { lane, x, halfWidth, hue } = placed;
  const started = playY >= lane.y0;
  const top = lane.y0 + TOP_PAD;
  const bottom = (lane.endMs === null ? axisEndY : lane.y1) + TOP_PAD;
  // An instantaneous pair — the ordinary shape of a `--real` build leaf, whose handoff and return are
  // both recorded at one instant — still gets a visible band. The label carries the real duration, so
  // the minimum height is a legibility floor and never a claim about elapsed time.
  const grown = Math.max(LANE_MIN_BAND, Math.min(playY + TOP_PAD, bottom) - top);
  const returned = lane.endMs !== null && playY >= lane.y1;
  const iconY = Math.max(TOP_PAD + LANE_ICON_RADIUS, top - 9);

  return (
    <g
      className={`traversal-lane hue-${hue}${started ? ' is-visible' : ''}${lane.endMs === null ? ' is-open' : ''}`}
      data-testid="traversal-lane"
      data-agent-type={lane.agentType}
      data-model={lane.model ?? 'not-recorded'}
      data-open={lane.endMs === null ? 'true' : 'false'}
    >
      <title>{laneLabel(lane)}</title>
      <rect
        className="traversal-lane-band"
        x={x - halfWidth}
        y={top}
        width={halfWidth * 2}
        height={started ? grown : 0}
        rx={halfWidth}
      />
      <g className="traversal-lane-icon" aria-hidden="true">
        <circle className="traversal-lane-icon-disc" cx={x} cy={iconY} r={LANE_ICON_RADIUS} />
        <path className="traversal-lane-icon-mark" d={agentTypeGlyph(lane.agentType, x, iconY)} />
      </g>
      <path
        className={`traversal-lane-handoff${started ? ' is-visible' : ''}`}
        data-testid="traversal-lane-handoff"
        d={edgePath(top, top, SPINE_X, x)}
      />
      {/* Drawn only once the return was RECORDED and reached. An open lane has no return edge at all,
          because closing it would draw a result nobody observed. */}
      {lane.endMs !== null && (
        <path
          className={`traversal-lane-return${returned ? ' is-visible' : ''}${lane.ok === false ? ' is-failed' : ''}`}
          data-testid="traversal-lane-return"
          d={edgePath(lane.y1 + TOP_PAD, lane.y1 + TOP_PAD, x, SPINE_X)}
        />
      )}
    </g>
  );
}

/** The hover identity of a lane — including, in as many words, when its model was never recorded. */
function laneLabel(lane: TraversalLane): string {
  const model = lane.model ?? 'model not recorded';
  const span =
    lane.endMs === null
      ? 'no result_return recorded — the lane is open'
      : `ran ${formatDuration(lane.endMs - lane.startMs)}${lane.ok === false ? ' · returned not-ok' : ''}`;
  return `${lane.agentType} · ${model} · ${span} · ${lane.childSessionId}`;
}

/**
 * The three compact type glyphs of the composition reference (`createLaneIcon` in
 * `session-traversal-playback.html`): a tick for Explore, a book for librarian-curator, a box for
 * everything else. They identify a stable TYPE and never an instance — and the default is a real
 * default rather than a guess, since the type itself is always recorded.
 */
function agentTypeGlyph(agentType: string, x: number, y: number): string {
  if (agentType === 'Explore' || agentType === 'explorer') {
    return `M ${x - 2.8} ${y + 2.8} L ${x + 2.8} ${y - 2.8} M ${x + 1.2} ${y - 1.2} L ${x - 0.4} ${y + 0.4}`;
  }
  if (agentType === 'librarian-curator') {
    return (
      `M ${x} ${y - 2.5} C ${x - 1.5} ${y - 3.2}, ${x - 3.2} ${y - 2.7}, ${x - 3.2} ${y - 1} ` +
      `L ${x - 3.2} ${y + 2.4} C ${x - 1.7} ${y + 1.7}, ${x - 0.7} ${y + 2}, ${x} ${y + 2.7} ` +
      `M ${x} ${y - 2.5} C ${x + 1.5} ${y - 3.2}, ${x + 3.2} ${y - 2.7}, ${x + 3.2} ${y - 1} ` +
      `L ${x + 3.2} ${y + 2.4} C ${x + 1.7} ${y + 1.7}, ${x + 0.7} ${y + 2}, ${x} ${y + 2.7}`
    );
  }
  return `M ${x - 3} ${y - 2} L ${x + 3} ${y - 2} L ${x + 3} ${y + 2.5} L ${x - 3} ${y + 2.5} Z`;
}

/**
 * The per-lane badge: agent type AND the model it ran on.
 *
 * This is the arc's own addition to the signed grammar and the reason it carried a telemetry increment
 * — storytree is multi-provider (ADR-0030 / ADR-0232), so a lane coloured "Explore" that cannot say
 * whether it ran on opus or `gpt-5.6-terra` is a lane making a weaker claim than it looks. The badge
 * therefore renders the RECORDED field and, where it is absent, the absence itself: never the session's
 * own model, never one inferred from `runtime`, never a default.
 *
 * It sits BELOW the picture rather than inside it because it is text, and the design's own sparseness
 * clause puts detailed words out of the overview. Wrapping chips also survive 340px, where in-SVG
 * labels at this width could not.
 */
function LaneBadges({ placed }: { placed: readonly PlacedLane[] }): React.JSX.Element | null {
  if (placed.length === 0) return null;
  return (
    <>
      <ul className="traversal-lane-badges" data-testid="traversal-lane-badges">
        {placed.map(({ lane, hue }) => (
          <li key={lane.edgeId} className={`traversal-lane-badge hue-${hue}`} data-testid="traversal-lane-badge">
            <span className="traversal-lane-swatch" aria-hidden="true" />
            <span className="traversal-lane-type">{lane.agentType}</span>
            <span
              className={lane.model === null ? 'traversal-lane-model is-unrecorded' : 'traversal-lane-model'}
            >
              {lane.model ?? 'model not recorded'}
            </span>
            <span className="traversal-lane-span">
              {lane.endMs === null ? 'open' : formatDuration(lane.endMs - lane.startMs)}
            </span>
          </li>
        ))}
      </ul>
      {/* Said out loud, because an empty band is the one thing here a reader could take for a claim:
          a lane is drawn from the PARENT'S handoff/return pair, and the child's own steps live in its
          own trace file under its own session id. The band is the interval the parent observed, not a
          child that did nothing. */}
      <p className="small muted traversal-lane-note" data-testid="traversal-lane-note">
        a lane is the span the parent observed, drawn from its own <code>spawn_handoff</code> /{' '}
        <code>result_return</code> pair — each child&rsquo;s own steps are in its own trace and are not
        read here.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Offer fans
// ---------------------------------------------------------------------------

/**
 * The branches a visit PRINTED. One ray per recorded candidate, in RECORDED ORDER (ADR-0318 D3 — the
 * set is authoritative on which ids were offered and never on their order, so sorting would draw a
 * stable-looking sequence that is not what the agent saw).
 *
 * Every ray is drawn: there is no top-N and no truncation, because a fan that quietly showed some of
 * an offer would be exactly the over-report the denominator exists to prevent. Many candidates simply
 * crowd the same arc, and the raw counts are stated in the note below the picture.
 */
function OfferFan({ offer, visible }: { offer: TraversalOffer; visible: boolean }): React.JSX.Element {
  const y = offer.y + TOP_PAD;
  const count = offer.candidates.length;
  return (
    <g
      className={`traversal-offer${visible ? ' is-visible' : ''}`}
      data-testid="traversal-offer"
      data-offered={offer.offered}
      data-observable={offer.observable}
      data-followed={offer.followed}
    >
      <title>{`${offer.surfaceId} · ${offer.denominator}`}</title>
      {offer.candidates.map((candidate, index) => {
        // Spread over a fixed arc either side of horizontal, so the fan's reach is bounded by
        // FAN_RADIUS whatever the count.
        const fraction = count === 1 ? 0.5 : index / (count - 1);
        const angle = (-0.55 + 1.1 * fraction) * Math.PI * 0.5;
        return (
          <line
            key={`${offer.candidateSetId}#${index}`}
            className={`traversal-offer-ray status-${candidate.status}`}
            data-testid="traversal-offer-ray"
            data-status={candidate.status}
            x1={SPINE_X}
            y1={y}
            x2={SPINE_X + Math.cos(angle) * FAN_RADIUS}
            y2={y + Math.sin(angle) * FAN_RADIUS}
          />
        );
      })}
    </g>
  );
}

/**
 * The trace-level denominator, in ADR-0312 D6's own raw form.
 *
 * NEVER A PERCENTAGE, and the reason is measured rather than stylistic: `doc:` refs are 36.7% of the
 * corpus's references and can never be followed by any read, so a follow RATE over the offered count
 * systematically over-reports how often a session stayed inside the asset graph. The observable count
 * travels with the offered one, and a nearly-zero follow count is the honest reading of a sparse
 * signal (1,356 recorded offers against 3 follows on this machine) rather than a renderer fault.
 *
 * IT ALSO NAMES THE PATHWAY, which ADR-0360 D6 requires and the counts alone cannot convey. Every
 * recorded surface is a `storytree` CLI surface — measured 2026-08-13, all 7,212 events on this
 * machine carry one of four (`library-artifact`, `agents`, `tree`, `library-dashboard`) — because
 * `observeCliInvocation` is an allowlist over argv and no hook observes a file read. An agent that
 * greps to an artifact and opens the file emits nothing at all. So these counts describe ONE pathway,
 * and a reader who takes them for all of a session's navigation over-reads them exactly as a
 * percentage would.
 */
function OfferNote({ model }: { model: ReturnType<typeof buildTraversalSpine> }): React.JSX.Element | null {
  const { offers } = model;
  if (offers.offers.length === 0 && offers.unplaced === 0) return null;
  return (
    <p className="small muted traversal-offer-note" data-testid="traversal-offer-note">
      {offers.offers.length} offer set{offers.offers.length === 1 ? '' : 's'} drawn — offered{' '}
      {offers.totalOffered}, observable {offers.totalObservable} of {offers.totalOffered}, followed{' '}
      {offers.totalFollowed} of {offers.totalObservable} observable. An unobservable branch is one no
      read could ever follow, never a declined one
      {offers.unplaced > 0
        ? `; ${offers.unplaced} offer set${offers.unplaced === 1 ? '' : 's'} carried no readable instant and ${offers.unplaced === 1 ? 'is' : 'are'} not placed`
        : ''}
      . Offers are recorded only where a storytree read renders them — file reads are not observed —
      so these counts cover one pathway, not all of this session&rsquo;s navigation.
    </p>
  );
}

/**
 * Whether depth was drawn, and — when it was not — that this is a SINGLE COLUMN by evidence.
 *
 * Rendered on purpose, because the flat case is the one a reader is most likely to misread as a bug.
 * The design's honesty clause makes it the correct picture wherever parent links are absent, and a
 * panel that just looked flat without saying why invites someone to "fix" it by inferring a tree.
 */
function DepthNote({ model }: { model: ReturnType<typeof buildTraversalSpine> }): React.JSX.Element | null {
  const { depth, marks } = model;
  if (marks.length === 0) return null;
  if (depth.maxDepth === 0) {
    return (
      <p className="small muted traversal-depth-note" data-testid="traversal-depth-note">
        single column: no visit in this trace carries a <code>parentVisitId</code> resolving onto another
        recorded visit, so there is no depth to draw
        {depth.unresolvedParents > 0
          ? ` (${depth.unresolvedParents} parent link${depth.unresolvedParents === 1 ? '' : 's'} named a visit this trace does not contain)`
          : ''}
        . Depth is never inferred from order, time or the node graph.
      </p>
    );
  }
  return (
    <p className="small muted traversal-depth-note" data-testid="traversal-depth-note">
      {depth.linkedVisits} visit{depth.linkedVisits === 1 ? '' : 's'} indented from a recorded{' '}
      <code>parentVisitId</code>, {depth.maxDepth} level{depth.maxDepth === 1 ? '' : 's'} deep
      {depth.maxDepth > TRAVERSAL_MAX_DRAWN_DEPTH ? ` (drawn to ${TRAVERSAL_MAX_DRAWN_DEPTH})` : ''}
      {depth.unresolvedParents > 0
        ? `; ${depth.unresolvedParents} link${depth.unresolvedParents === 1 ? '' : 's'} named a visit this trace does not contain and ${depth.unresolvedParents === 1 ? 'was' : 'were'} not indented`
        : ''}
      .
    </p>
  );
}

/**
 * The honest gaps left over — what the picture could NOT place, rather than what it declines to draw.
 *
 * The previous increment's version of this note named the events it deferred to this one. Those are
 * drawn now, so what remains is the residue no renderer can resolve: an event with no readable
 * timestamp, a return with no handoff, an offer with no instant. Counted rather than swallowed, on the
 * same principle — a picture that quietly omits part of a trace invites the reading that the trace
 * contains only what was drawn.
 */
function DeferredNote({ model }: { model: ReturnType<typeof buildTraversalSpine> }): React.JSX.Element | null {
  const parts: string[] = [];
  if (model.undatable > 0) {
    parts.push(`${model.undatable} event${model.undatable === 1 ? '' : 's'} with no readable timestamp`);
  }
  if (model.lanes.undatable > 0) {
    parts.push(`${model.lanes.undatable} lane event${model.lanes.undatable === 1 ? '' : 's'} with no readable timestamp`);
  }
  if (model.lanes.unpairedReturns > 0) {
    parts.push(
      `${model.lanes.unpairedReturns} result_return${model.lanes.unpairedReturns === 1 ? '' : 's'} naming an edge no handoff in this trace opened`,
    );
  }
  if (model.lanes.openLanes > 0) {
    parts.push(
      `${model.lanes.openLanes} lane${model.lanes.openLanes === 1 ? '' : 's'} left open — no result_return was recorded, so ${model.lanes.openLanes === 1 ? 'it runs' : 'they run'} to the end of the axis rather than closing at a guess`,
    );
  }
  if (model.depth.cyclicParents > 0) {
    parts.push(`${model.depth.cyclicParents} parent chain${model.depth.cyclicParents === 1 ? '' : 's'} closed on itself and ${model.depth.cyclicParents === 1 ? 'was' : 'were'} not indented`);
  }
  if (parts.length === 0) return null;

  return (
    <p className="small muted traversal-spine-deferred" data-testid="traversal-spine-deferred">
      not placed: {parts.join('; ')}.
    </p>
  );
}

/**
 * A gentle S-curve between two points, matching the reference composition's `makeLine` exactly. It now
 * takes both x's rather than assuming the spine: the same curve draws a step down the spine, a descent
 * into an indented column, a return to a shallower one, and a handoff out to a lane.
 */
function edgePath(fromY: number, toY: number, fromX: number = SPINE_X, toX: number = fromX): string {
  const middle = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${middle}, ${toX} ${middle}, ${toX} ${toY}`;
}

/** Where a depth column sits. Depth 0 IS the spine, so a link-less trace draws exactly what it did before. */
function depthX(depth: number): number {
  return SPINE_X + Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, Math.max(0, depth)) * DEPTH_STEP;
}

/** Which way this step moved in depth — the "a descent indents, a return comes back" clause, assertable. */
function depthMove(edge: TraversalEdge): 'descend' | 'return' | 'level' {
  if (edge.toDepth > edge.fromDepth) return 'descend';
  if (edge.toDepth < edge.fromDepth) return 'return';
  return 'level';
}

/** The drawing's coordinate constants, exported so a test can assert a row without re-deriving them. */
export const TRAVERSAL_SPINE_GEOMETRY = {
  VIEW_WIDTH,
  AXIS_X,
  SPINE_X,
  TOP_PAD,
  BOTTOM_PAD,
  DEPTH_STEP,
  LANE_X_FIRST,
  LANE_X_LAST,
  LANE_ICON_RADIUS,
  FAN_RADIUS,
} as const;
