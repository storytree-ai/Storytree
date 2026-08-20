// The traversal PICTURE (`traversal-panel-arc`), RE-FLOWED to the bottom panel's width
// (increment `traversal-panel-wide-reflow`, ADR-0354 D3/D4).
//
// THE TIME AXIS ROTATED, and that is the one thing the owner was asked to judge before this was
// built: time now runs LEFT → RIGHT, depth indents DOWNWARD, subagent lanes are rows below it, and
// the one playhead occupancy bar became a vertical track at the right. The verdict is in — the panel
// stays at the bottom and the rotation is accepted as proposed, with the loss of resemblance to the
// signed narrow mock knowingly accepted. `docs/design/context-traversal/bottom-panel-traversal-
// composition.html` is authoritative for LAYOUT; `session-traversal-playback.html` remains normative
// for GRAMMAR only.
//
// WHY ROTATE AT ALL, since a 90° reading of "lanes may sit side by side" was the obvious alternative:
// the bottom panel inverts which axis is abundant. Run the SHIPPED axis over the richest bundled
// trace at the old vertical config and it wants 608px of HEIGHT against the ~154px a 320px dock
// actually leaves the picture — four screens of scrolling inside a strip two marks tall. Run the same
// algorithm along the horizontal and the whole 21-hour walk is 620 axis px, which STRETCHES to fill
// the ~1,100px the panel gives it: the entire trace at once, no scrolling in either direction. A
// plain 90° reading would merely have moved the old 360px crowding onto the new scarce vertical.
//
// THE SIGNED GRAMMAR SURVIVES THE RE-FLOW UNCHANGED (ADR-0354 D3 reopened LAYOUT only): one playhead
// occupancy bar with the over-500k portion red and NO marker/tick/arc for the threshold; plain node
// marks with no per-node gauge; solid full-payload and grey dotted front-matter edges; a magnifying
// glass for search; branching carried by animation rather than drawn loop-backs; explicit-only forks
// stating a raw `M of N` and never a percentage; and no depth ever inferred from order, time or the
// node graph.
//
// THE SIX PURE LIBS ARE UNTOUCHED, which is what made this a re-flow rather than a rewrite: they
// assert SEMANTICS, not placement. `traversalTime` is a 1-D density-weighted map from instants onto
// axis units — it never claimed those units were vertical — so rotating the picture is entirely a
// change of which screen axis consumes them. `yAt`/`TraversalMark.y`/`TraversalEdge.fromY` keep
// their names because renaming six modules and 76 passing tests would bury this diff in churn; read
// `y` here as "position along the density axis", which is now an X.
//
// THE CHROME YIELDS, NOT THE PICTURE. Dragged toward the dock's 160px minimum the prose blurb and the
// honest-gap line fold away — both are still reachable below and in the notes — because the arc's
// clause is that the traversal dominates the first glance. This is the bottom panel's analogue of the
// retired `PANEL_MIN=360` rule, asked of height instead of width.
//
// HAND-ROLLED SVG still, and still a decision: `apps/studio` carries no charting or animation
// dependency and none was added for one panel.
//
// NOTHING HERE SELF-SIGNS THE APPEARANCE. The owner's LOOK against the new composition reference is
// `traversal-panel-wide-attestation`; the tests beside this file assert geometry and behaviour only.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TRAVERSAL_MAX_DRAWN_DEPTH } from '../lib/traversalDepth';
import type { TraversalLane } from '../lib/traversalLanes';
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

/** Playback speed along the axis, in axis units per second — unchanged by the rotation. */
const PLAY_UNITS_PER_SECOND = 90;

/** The row-label gutter, in its own SVG beside the plot so the labels never scroll away from it. */
const LABEL_GUTTER = 86;
/** Right-hand pad inside the plot, so the last mark and its chip are never flush to the edge. */
const AXIS_TAIL = 24;
/**
 * Left-hand pad. The first mark sits at axis position 0, and a circle drawn there paints from
 * `-markRadius` — outside the viewBox and clipped at every rendered width. The old vertical
 * composition had `TOP_PAD` doing exactly this job; rotating the axis moved the need to the other
 * edge, and the bounds test catches its absence.
 */
const AXIS_HEAD = 8;
/**
 * Below this measured picture height the chrome folds. Keyed on the MEASURED remainder rather than a
 * dock-height breakpoint, because a narrow viewport wraps the prose and eats the same room a short
 * dock does — a breakpoint cannot know whether that happened.
 */
const MIN_PICTURE_PX = 96;
/** Hysteresis: release compact only with real room to spare, so the two states cannot flap. */
const RELEASE_COMPACT_PX = 132;

/** How many distinct hues the type palette holds before it wraps. Colour identifies TYPE. */
const LANE_HUES = 6;

interface Geometry {
  readonly width: number;
  readonly height: number;
  readonly axisBand: number;
  readonly offerBand: number;
  readonly depthRows: number;
  readonly laneRows: number;
  readonly step: number;
  readonly spineY: number;
  readonly sx: number;
  readonly markRadius: number;
  readonly axisY: number;
  readonly x: (axisUnits: number) => number;
  readonly depthY: (depth: number) => number;
  readonly laneY: (column: number) => number;
}

export function TraversalSpine({
  replay,
  compact = false,
}: {
  replay: TraversalReplayPayload;
  /** The host's own measurement that the panel is dragged small. OR-ed with this component's. */
  compact?: boolean;
}): React.JSX.Element {
  const model = useMemo(() => buildTraversalSpine(replay), [replay]);
  const { scale, marks, edges, occupancy, lanes, depth, offers } = model;

  // The playhead lives in AXIS UNITS — one source of truth for "where are we", from which the clock
  // and the occupancy reading are both derived. Mirrored in a ref so the animation frame reads it
  // without re-subscribing, and so the end-of-playback stop never sits inside a state updater React
  // is free to call twice.
  const [playPos, setPlayPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const positionRef = useRef(0);

  const setPosition = useCallback((next: number): void => {
    positionRef.current = next;
    setPlayPos(next);
  }, []);

  useEffect(() => {
    setPosition(0);
    setPlaying(false);
  }, [replay.sessionId, setPosition]);

  // ABSOLUTE, not accumulating: StrictMode mounts effects twice, and two accumulating loops sharing
  // one cursor each add their own delta and run the playhead at double speed. Two absolute loops
  // compute the same number and write it twice, which is merely wasteful instead of wrong.
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const startPos = positionRef.current;
    let cancelled = false;
    let handle = 0;
    const step = (now: number): void => {
      if (cancelled) return;
      const next = startPos + ((now - startedAt) / 1000) * PLAY_UNITS_PER_SECOND;
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
    if (!playing && positionRef.current >= scale.totalPx) setPosition(0);
    setPlaying(!playing);
  }, [playing, scale.totalPx, setPosition]);

  // ── measurement ────────────────────────────────────────────────────────────────────────────────
  // The picture takes what the chrome leaves, and is sized from the SCROLL CONTAINER's own box, never
  // from the drawing's: measuring the drawing to size the drawing is how a dragged dock overflows
  // instead of re-flowing.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number }>({ width: 900, height: 160 });
  const [selfCompact, setSelfCompact] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = (): void => {
      const width = el.clientWidth || 900;
      const height = el.clientHeight || 160;
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      // Two-pass with hysteresis. The mock re-measures after folding the chrome; the gap between
      // MIN_PICTURE_PX and RELEASE_COMPACT_PX is what stops fold → more room → unfold → less room
      // from oscillating forever on a dock parked exactly at the boundary.
      setSelfCompact((was) => (was ? height < RELEASE_COMPACT_PX : height < MIN_PICTURE_PX));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isCompact = compact || selfCompact;

  const geometry = useMemo(
    () =>
      computeGeometry({
        box,
        totalPx: scale.totalPx,
        hasOffers: offers.offers.length > 0,
        maxDepth: depth.maxDepth,
        laneColumns: lanes.columnCount,
      }),
    [box, scale.totalPx, offers.offers.length, depth.maxDepth, lanes.columnCount],
  );

  const nothingToDraw = marks.length === 0 && lanes.lanes.length === 0 && offers.offers.length === 0;
  const atMs = timeAt(scale, playPos);
  const observed = occupancyAt(occupancy, atMs);
  const hueByType = useMemo(
    () => new Map(lanes.agentTypes.map((type, index) => [type, index % LANE_HUES])),
    [lanes.agentTypes],
  );

  return (
    <div
      className={`traversal-spine${isCompact ? ' is-compact' : ''}`}
      data-testid="traversal-spine"
      data-compact={isCompact ? 'true' : 'false'}
    >
      <div className="traversal-plot-column">
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
            value={playPos}
            disabled={nothingToDraw}
            onChange={(event) => {
              setPlaying(false);
              setPosition(Number(event.currentTarget.value));
            }}
            data-testid="traversal-scrubber"
          />
          {/* The clock reads REAL elapsed wall clock even though the scrubber walks density-weighted
              axis units — the folding compresses the picture, never the reported duration. */}
          <output className="traversal-clock small" data-testid="traversal-clock">
            {formatClock(atMs - scale.startMs)} / {formatClock(scale.elapsedMs)}
          </output>
          <span className="traversal-axis-note small muted" data-testid="traversal-axis-note">
            {marks.length} mark{marks.length === 1 ? '' : 's'} · {scale.folds.length} fold
            {scale.folds.length === 1 ? '' : 's'} · axis {Math.round(scale.totalPx)}px
          </span>
        </div>

        {nothingToDraw ? (
          <p className="small muted traversal-spine-empty" data-testid="traversal-spine-empty">
            nothing plottable in this trace — no context visit, search, subagent lane or recorded offer.
          </p>
        ) : (
          <div className="traversal-plot-body">
            {/* The row gutter is its OWN svg beside the plot, so a horizontally scrolled trace never
                carries its labels off-screen. */}
            <div className="traversal-row-labels">
              <svg
                viewBox={`0 0 ${LABEL_GUTTER} ${geometry.height}`}
                preserveAspectRatio="none"
                role="presentation"
                data-testid="traversal-row-labels"
              >
                <RowLabels geometry={geometry} lanes={lanes.lanes} hasOffers={offers.offers.length > 0} />
              </svg>
            </div>

            <div className="traversal-plot-scroll" ref={scrollRef}>
              <svg
                className="traversal-spine-map"
                viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                width={geometry.width}
                preserveAspectRatio="none"
                style={{ width: `${geometry.width}px`, height: `${geometry.height}px` }}
                role="img"
                aria-label={`Context traversal of ${replay.sessionId}: ${marks.length} steps over ${formatDuration(scale.elapsedMs)}`}
                data-testid="traversal-spine-map"
              >
                <Axis geometry={geometry} scale={scale} />

                {/* Lanes sit UNDER the parent traversal in paint order: a child is a row the parent's
                    own spine runs above, never something drawn over it. */}
                {lanes.lanes.map((lane) => (
                  <Lane
                    key={lane.edgeId}
                    lane={lane}
                    geometry={geometry}
                    playPos={playPos}
                    axisEnd={scale.totalPx}
                    hue={hueByType.get(lane.agentType) ?? 0}
                    compact={isCompact}
                  />
                ))}

                {offers.offers.map((offer) => (
                  <OfferFan
                    key={offer.candidateSetId}
                    offer={offer}
                    geometry={geometry}
                    visible={playPos >= offer.y}
                  />
                ))}

                {edges.map((edge) => (
                  <path
                    key={edge.id}
                    className={`traversal-edge strength-${edge.strength}${playPos >= edge.toY ? ' is-visible' : ''}`}
                    data-strength={edge.strength}
                    data-depth-move={depthMove(edge)}
                    d={edgePath(geometry, edge)}
                  />
                ))}

                {marks.map((mark) => (
                  <Mark
                    key={mark.id}
                    mark={mark}
                    geometry={geometry}
                    visible={playPos >= mark.y}
                  />
                ))}

                <g className="traversal-playhead" aria-hidden="true">
                  <line
                    x1={geometry.x(playPos)}
                    x2={geometry.x(playPos)}
                    y1={2}
                    y2={geometry.height - geometry.axisBand + 2}
                  />
                  <circle cx={geometry.x(playPos)} cy={geometry.spineY} r={2.6} />
                </g>
              </svg>
            </div>
          </div>
        )}

        <div className="traversal-plot-foot">
          <Legend />
          <div className="traversal-gaps">
            <OccupancyNote model={model} />
            <LaneNote model={model} />
            <DepthNote model={model} />
            <OfferNote model={model} />
            <DeferredNote model={model} />
          </div>
        </div>
      </div>

      <OccupancyTrack
        observed={observed?.residentTokens ?? null}
        scaleTokens={occupancy.scaleTokens}
        observationCount={occupancy.observationCount}
      />
    </div>
  );
}

/**
 * Lay the rows out in the room the chrome left.
 *
 * The row template is what makes the picture RE-FLOW into a dragged dock rather than overflow it:
 * the rows the DATA needs decide the step, and when they cannot fit at a legible step the picture
 * keeps its floor and the plot scrolls instead. Squeezing eleven lane rows into 97px would make the
 * picture unreadable in order to preserve a container size nobody promised.
 */
function computeGeometry({
  box,
  totalPx,
  hasOffers,
  maxDepth,
  laneColumns,
}: {
  box: { width: number; height: number };
  totalPx: number;
  hasOffers: boolean;
  maxDepth: number;
  laneColumns: number;
}): Geometry {
  const available = Math.max(240, box.width);
  const axisBand = box.height < 120 ? 20 : 26;
  const depthRows = Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, maxDepth);
  const laneRows = laneColumns;

  const height0 = Math.max(56, box.height);
  const offerBand = hasOffers ? Math.min(52, Math.max(14, (height0 - axisBand) * 0.24)) : 6;
  const body = height0 - axisBand - offerBand;
  // 1 spine row + depth rows + a gutter before the lanes + lane rows.
  const slots = 1 + depthRows + (laneRows > 0 ? laneRows + 0.6 : 0);
  const step = Math.max(11, Math.min(40, body / (slots + 0.7)));

  const contentHeight = offerBand + step * (slots + 0.7) + axisBand;
  const height = contentHeight > height0 ? Math.ceil(contentHeight) : height0;

  const spineY = offerBand + step * 0.55;
  const laneTop = spineY + step * (depthRows + (laneRows > 0 ? 0.9 : 0));

  // "THE AXIS MAY STRETCH" (ADR-0354 D3), and this is where it does. The density-weighted budget is
  // computed in axis units; when a trace's whole walk is SHORTER than the panel is wide, the axis
  // scales UP to fill rather than huddling on the left. Every run and every fold scales by the same
  // factor, so the density weighting and the constant-stub fold rule are untouched — only the ruler
  // changes. A trace longer than the panel is never squeezed to fit: it keeps its units and pans.
  const sx = totalPx > 0 ? Math.max(1, (available - AXIS_HEAD - AXIS_TAIL) / totalPx) : 1;

  return {
    width: AXIS_HEAD + totalPx * sx + AXIS_TAIL,
    height,
    axisBand,
    offerBand,
    depthRows,
    laneRows,
    step,
    spineY,
    sx,
    markRadius: Math.max(2.4, Math.min(4.2, step * 0.16)),
    axisY: height - axisBand + 6,
    x: (axisUnits: number) => AXIS_HEAD + axisUnits * sx,
    depthY: (d: number) => spineY + step * Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, Math.max(0, d)),
    laneY: (column: number) => laneTop + step * (column + 0.5),
  };
}

/** The time baseline, the folded idle spans, and the two end labels. */
function Axis({
  geometry,
  scale,
}: {
  geometry: Geometry;
  scale: ReturnType<typeof buildTraversalSpine>['scale'];
}): React.JSX.Element {
  const yBase = geometry.axisY;
  return (
    <g className="traversal-axis-layer" aria-hidden="true">
      <line className="traversal-time-baseline" x1={0} x2={geometry.width} y1={yBase} y2={yBase} />

      {scale.folds.map((fold) => {
        const x0 = geometry.x(fold.yStart);
        const x1 = geometry.x(fold.yEnd);
        const mid = (x0 + x1) / 2;
        const labelY = geometry.height - geometry.axisBand - 4;
        return (
          // A fold is DRAWN — a band, two slashes, and the duration it stands for, written down the
          // stub now that the stub is vertical. An idle span is neither removed nor stretched, and a
          // 16-hour gap and a 6-minute gap occupy identical pixels.
          <g key={`fold-${fold.fromMs}`} className="traversal-fold" data-testid="traversal-fold">
            <rect
              className="traversal-fold-band"
              x={x0}
              y={2}
              width={Math.max(1, x1 - x0)}
              height={geometry.height - geometry.axisBand}
            />
            <path
              className="traversal-fold-mark"
              d={`M ${mid - 3.4} ${yBase + 5} L ${mid + 1.4} ${yBase - 4} M ${mid + 0.6} ${yBase + 5} L ${mid + 5.4} ${yBase - 4}`}
            />
            <text
              className="traversal-fold-label"
              x={mid + 3}
              y={labelY}
              transform={`rotate(-90 ${mid + 3} ${labelY})`}
            >
              {fold.label}
            </text>
          </g>
        );
      })}

      {scale.segments
        .filter((segment) => segment.kind === 'active')
        .map((segment) => (
          <line
            key={`tick-${segment.fromMs}`}
            className="traversal-time-tick"
            x1={geometry.x(segment.yStart)}
            x2={geometry.x(segment.yStart)}
            y1={yBase}
            y2={yBase + 4}
          />
        ))}

      <text className="traversal-time-label" x={1} y={geometry.height - 3}>
        0:00
      </text>
      <text
        className="traversal-time-label"
        x={geometry.width - 2}
        y={geometry.height - 3}
        textAnchor="end"
      >
        {formatDuration(scale.elapsedMs)}
      </text>
    </g>
  );
}

/** The gutter: what each row IS, so the picture itself needs no in-band prose. */
function RowLabels({
  geometry,
  lanes,
  hasOffers,
}: {
  geometry: Geometry;
  lanes: readonly TraversalLane[];
  hasOffers: boolean;
}): React.JSX.Element {
  const rows: { y: number; text: string; strong?: boolean }[] = [];
  if (hasOffers) rows.push({ y: Math.max(9, geometry.offerBand / 2), text: 'offers ↑' });
  rows.push({ y: geometry.spineY, text: 'spine', strong: true });
  for (let d = 1; d <= geometry.depthRows; d += 1) {
    rows.push({ y: geometry.depthY(d), text: `depth ${d}` });
  }
  for (let column = 0; column < geometry.laneRows; column += 1) {
    const lane = lanes.find((item) => item.column === column);
    rows.push({ y: geometry.laneY(column), text: lane ? lane.agentType : `lane ${column + 1}` });
  }
  rows.push({ y: geometry.height - geometry.axisBand + 15, text: 'time →' });

  return (
    <>
      {rows.map((row) => (
        <text
          key={`${row.text}-${row.y}`}
          className={`traversal-row-label${row.strong ? ' is-strong' : ''}`}
          x={LABEL_GUTTER - 6}
          y={row.y + 3.2}
          textAnchor="end"
        >
          {row.text}
        </text>
      ))}
      <line
        className="traversal-row-rule"
        x1={0}
        x2={LABEL_GUTTER}
        y1={geometry.height - geometry.axisBand + 6}
        y2={geometry.height - geometry.axisBand + 6}
      />
    </>
  );
}

/** A plain mark — identity and read strength, and NEVER a per-visit token readout or a gauge ring. */
function Mark({
  mark,
  geometry,
  visible,
}: {
  mark: TraversalMark;
  geometry: Geometry;
  visible: boolean;
}): React.JSX.Element {
  const x = geometry.x(mark.y);
  const y = geometry.depthY(mark.depth);
  const r = geometry.markRadius;
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
          <circle className="traversal-search-lens" cx={x - 0.4} cy={y - 0.4} r={r * 0.85} />
          <line
            className="traversal-search-handle"
            x1={x + r * 0.45}
            y1={y + r * 0.45}
            x2={x + r * 1.5}
            y2={y + r * 1.5}
          />
        </>
      ) : (
        <circle className="traversal-mark-dot" cx={x} cy={y} r={r} />
      )}
    </g>
  );
}

/**
 * One subagent lane, now a ROW rather than a column.
 *
 * ★ INSTANT IS DECIDED FROM THE TIMESTAMPS, NEVER FROM THE PIXELS, and that distinction is
 * load-bearing rather than pedantic — the composition reference found it before this was built.
 * `library-cli-0c7bf8` holds a lane whose handoff and return are ONE MILLISECOND apart but fall
 * either side of a folded idle span, so the density axis maps them 32px apart. Deciding from the
 * pixel gap would draw that millisecond as a 32px bar: a duration nobody recorded, produced by the
 * FOLD rather than by the trace. All 115 paired lanes on this machine span 0 or 1 ms, so this is the
 * ordinary case and not an edge case.
 */
function Lane({
  lane,
  geometry,
  playPos,
  axisEnd,
  hue,
  compact,
}: {
  lane: TraversalLane;
  geometry: Geometry;
  playPos: number;
  axisEnd: number;
  hue: number;
  compact: boolean;
}): React.JSX.Element {
  const y = geometry.laneY(lane.column);
  const started = playPos >= lane.y0;
  const open = lane.endMs === null;
  const instant = lane.endMs !== null && lane.endMs - lane.startMs <= 1;
  const x0 = geometry.x(lane.y0);
  const x1 = instant ? x0 : geometry.x(open ? axisEnd : lane.y1);
  const height = Math.max(6, geometry.step * 0.5);
  // The band GROWS with the playhead — the design's "two branches advance at the same time only when
  // work genuinely ran in parallel" made visible.
  const grownX = Math.min(geometry.x(playPos), x1);
  const returned = !open && playPos >= lane.y1;

  // The chip carries the MODEL. On a crowded packing the agent TYPE drops — the row gutter already
  // names it — because clause 7 is that every rendered lane names the model it ran on, and the type
  // is redundant with the row label while the model is redundant with nothing.
  const chipText = compact
    ? lane.model ?? 'no model'
    : `${lane.agentType} · ${lane.model ?? 'model not recorded'}`;
  const chipW = chipText.length * 4.6 + 10;
  const rightOf = x0 + Math.max(instant ? 0 : x1 - x0, height / 2) + 6;
  const flip = (instant && !compact) || rightOf + chipW > geometry.width - 4;
  const chipX = flip ? Math.max(2, x0 - height / 2 - 6 - chipW) : rightOf;

  return (
    <g
      className={`traversal-lane hue-${hue}${started ? ' is-visible' : ''}${open ? ' is-open' : ''}`}
      data-testid="traversal-lane"
      data-agent-type={lane.agentType}
      data-model={lane.model ?? 'not-recorded'}
      data-open={open ? 'true' : 'false'}
      data-instant={instant ? 'true' : 'false'}
    >
      <title>{laneLabel(lane, instant)}</title>
      {instant ? (
        // A zero/one-millisecond pair is a POINT, drawn as one. A band here would assert a duration
        // the trace does not record.
        <path
          className="traversal-lane-body"
          d={`M ${x0} ${y - height / 2} L ${x0 + height / 2} ${y} L ${x0} ${y + height / 2} L ${x0 - height / 2} ${y} Z`}
        />
      ) : (
        <rect
          className={`traversal-lane-body${open ? ' traversal-lane-open-cap' : ''}`}
          x={x0 - 1.5}
          y={y - height / 2}
          width={Math.max(0, (started ? grownX : x0) - x0) + 3}
          height={height}
          rx={Math.min(6, height / 2)}
        />
      )}

      <path
        className={`traversal-lane-handoff${started ? ' is-visible' : ''}`}
        data-testid="traversal-lane-handoff"
        d={`M ${x0} ${geometry.spineY} L ${x0} ${y}`}
      />
      {/* Drawn only once the return was RECORDED and reached. An open lane has no return edge at all,
          because closing it would draw a result nobody observed. */}
      {!open && (
        <path
          className={`traversal-lane-return${returned ? ' is-visible' : ''}${lane.ok === false ? ' is-failed' : ''}`}
          data-testid="traversal-lane-return"
          d={`M ${x1} ${y} L ${x1} ${geometry.spineY}`}
        />
      )}

      <g className="traversal-lane-chip" data-testid="traversal-lane-chip">
        <rect className="traversal-lane-chip-bg" x={chipX} y={y - 6} width={chipW} height={12} rx={6} />
        <text
          className={`traversal-lane-chip-text${lane.model === null ? ' is-unrecorded' : ''}`}
          x={chipX + 5}
          y={y + 2.6}
        >
          {chipText}
        </text>
      </g>
    </g>
  );
}

/** The hover identity of a lane — including, in as many words, when its model was never recorded. */
function laneLabel(lane: TraversalLane, instant: boolean): string {
  const model = lane.model ?? 'model not recorded';
  const span =
    lane.endMs === null
      ? 'no result_return recorded — the lane is open'
      : instant
        ? 'observed at one instant'
        : `ran ${formatDuration(lane.endMs - lane.startMs)}${lane.ok === false ? ' · returned not-ok' : ''}`;
  return `${lane.agentType} · ${model} · ${span} · ${lane.childSessionId}`;
}

/**
 * The branches a visit PRINTED, fanning UPWARD from the spine now that depth and lanes hang below it.
 *
 * One ray per recorded candidate, in RECORDED ORDER (ADR-0318 D3 — the set is authoritative on which
 * ids were offered and never on their order, so sorting would draw a stable-looking sequence that is
 * not what the agent saw). Every ray is drawn: no top-N and no truncation, because a fan that quietly
 * showed some of an offer would be exactly the over-report the denominator exists to prevent.
 */
function OfferFan({
  offer,
  geometry,
  visible,
}: {
  offer: TraversalOffer;
  geometry: Geometry;
  visible: boolean;
}): React.JSX.Element {
  const ox = geometry.x(offer.y);
  const count = offer.candidates.length;
  const spread = Math.min(26, 5 + count * 1.6);
  const height = Math.max(10, geometry.offerBand - 12);
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
        const ratio = count === 1 ? 0.5 : index / (count - 1);
        return (
          <line
            key={`${offer.candidateSetId}#${index}`}
            className={`traversal-offer-ray status-${candidate.status}`}
            data-testid="traversal-offer-ray"
            data-status={candidate.status}
            x1={ox}
            y1={geometry.spineY - 2}
            x2={ox + (ratio - 0.5) * spread}
            y2={geometry.spineY - 2 - height}
          />
        );
      })}
    </g>
  );
}

/**
 * The one playhead occupancy bar — a VERTICAL track at the right, so the time axis owns the
 * horizontal and the bar stops competing with the picture for area.
 *
 * Three states, and they are three because collapsing any two would assert something nobody
 * observed: a reading, "nothing observed YET at this playhead", and "this session has no series at
 * all". The last is the ordinary case rather than an edge case — the field is populated only by the
 * host-transcript adapter, which is not ambient. A flat zero bar would say the window was empty,
 * which is a claim about the session, not about the observation.
 */
function OccupancyTrack({
  observed,
  scaleTokens,
  observationCount,
}: {
  observed: number | null;
  scaleTokens: number;
  observationCount: number;
}): React.JSX.Element {
  if (observationCount === 0) {
    // The track keeps its column and goes DASHED rather than disappearing, so the picture's geometry
    // does not change shape depending on whether a session happened to be ingested. It draws no fill
    // at all — a flat zero bar would say the window was empty, which is a claim about the session
    // rather than about the observation. The sentence naming the absence AND its remedy is too long
    // for a 58px column, so it renders with the other honest gaps under the picture; see
    // `OccupancyNote`.
    return (
      <div className="traversal-occupancy is-unobserved">
        <span className="traversal-occupancy-cap">resident</span>
        <div
          className="traversal-occupancy-track is-unobserved"
          role="img"
          aria-label="no context occupancy was observed for this session"
        />
        <span className="traversal-occupancy-readout is-unobserved">
          none
          <br />
          observed
        </span>
      </div>
    );
  }

  const fill = observed === null ? null : occupancyFill(observed, scaleTokens);
  const over = fill !== null && fill.overFraction > 0;
  return (
    <div className="traversal-occupancy" data-testid="traversal-occupancy">
      <span className="traversal-occupancy-cap">resident</span>
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
              style={{ height: `${fill.safeFraction * 100}%` }}
            />
            {/* The red is the WHOLE signal for the threshold — no marker, tick, or arc is drawn for
                it anywhere; this segment simply starts where the fill splits. */}
            <span
              className="traversal-occupancy-fill is-over"
              data-testid="traversal-occupancy-over"
              style={{
                bottom: `${fill.overStartFraction * 100}%`,
                height: `${fill.overFraction * 100}%`,
              }}
            />
          </>
        )}
      </div>
      <span
        className={`traversal-occupancy-readout${over ? ' is-over' : ''}`}
        data-testid="traversal-occupancy-readout"
      >
        {observed === null ? '—' : formatTokens(observed)}
        <br />
        <span className="traversal-occupancy-threshold">
          red past {formatTokens(OCCUPANCY_THRESHOLD_TOKENS)}
        </span>
      </span>
    </div>
  );
}

/** The grammar, said once, where a reader meets the picture. */
function Legend(): React.JSX.Element {
  return (
    <div className="traversal-legend" data-testid="traversal-legend">
      <span className="traversal-legend-key">
        <svg width="24" height="8" aria-hidden="true">
          <line className="traversal-edge strength-full is-visible" x1={1} y1={4} x2={23} y2={4} />
        </svg>
        full payload
      </span>
      <span className="traversal-legend-key">
        <svg width="24" height="8" aria-hidden="true">
          <line
            className="traversal-edge strength-front-matter is-visible"
            x1={1}
            y1={4}
            x2={23}
            y2={4}
          />
        </svg>
        front matter only
      </span>
      <span className="traversal-legend-key">⌕ search</span>
      <span className="traversal-legend-key">
        offer fan — solid ray not followed, faint dashed unobservable
      </span>
      <span className="traversal-legend-key">
        <span className="traversal-legend-bar" aria-hidden="true">
          <span className="traversal-legend-bar-safe" />
          <span className="traversal-legend-bar-over" />
        </span>
        resident context, red past {formatTokens(OCCUPANCY_THRESHOLD_TOKENS)}
      </span>
      <span className="traversal-legend-key">∥ folded idle span</span>
    </div>
  );
}

/**
 * The occupancy absence, named where the 58px track cannot name it — with its REMEDY.
 *
 * This is the ordinary case rather than an edge case: `residentInputTokens` is populated only by the
 * host-transcript adapter, which is NOT ambient (it needs an explicit `storytree traversal ingest`).
 * Saying only "none observed" in the column would leave an operator with no idea the reading is
 * obtainable at all, which is how an honest absence turns into an apparent dead end.
 */
function OccupancyNote({
  model,
}: {
  model: ReturnType<typeof buildTraversalSpine>;
}): React.JSX.Element | null {
  if (model.occupancy.observationCount > 0) return null;
  return (
    <p className="small muted traversal-occupancy-note" data-testid="traversal-occupancy-absent">
      no occupancy series to plot — this session&rsquo;s context window was never observed, which is
      not the same as an empty one. Reading one from this machine&rsquo;s host transcript is{' '}
      <code>storytree traversal ingest {'<sessionId>'}</code>.
    </p>
  );
}

/**
 * Said out loud, because an empty row is the one thing here a reader could take for a claim: a lane
 * is drawn from the PARENT'S handoff/return pair, and the child's own steps live in its own trace
 * file under its own session id.
 */
function LaneNote({ model }: { model: ReturnType<typeof buildTraversalSpine> }): React.JSX.Element | null {
  if (model.lanes.lanes.length === 0) return null;
  return (
    <p className="small muted traversal-lane-note" data-testid="traversal-lane-note">
      a lane is the span the parent observed, drawn from its own <code>spawn_handoff</code> /{' '}
      <code>result_return</code> pair — each child&rsquo;s own steps are in its own trace and are not
      read here.
    </p>
  );
}

/**
 * The trace-level denominator, in ADR-0312 D6's own raw form.
 *
 * NEVER A PERCENTAGE, and the reason is measured rather than stylistic: `doc:` refs are 36.7% of the
 * corpus's references and can never be followed by any read, so a follow RATE over the offered count
 * systematically over-reports how often a session stayed inside the asset graph.
 *
 * IT ALSO NAMES THE PATHWAY, which ADR-0360 D6 requires and the counts alone cannot convey: every
 * recorded surface is a `storytree` CLI surface, because `observeCliInvocation` is an allowlist over
 * argv and no hook observes a file read. An agent that greps to an artifact and opens the file emits
 * nothing at all, so these counts describe ONE pathway.
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
 * Whether depth was drawn, and — when it was not — that this is a SINGLE ROW by evidence.
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
        single row: no visit in this trace carries a <code>parentVisitId</code> resolving onto another
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
 * Counted rather than swallowed: a picture that quietly omits part of a trace invites the reading
 * that the trace contains only what was drawn.
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
    parts.push(
      `${model.depth.cyclicParents} parent chain${model.depth.cyclicParents === 1 ? '' : 's'} closed on itself and ${model.depth.cyclicParents === 1 ? 'was' : 'were'} not indented`,
    );
  }
  if (parts.length === 0) return null;

  return (
    <p className="small muted traversal-spine-deferred" data-testid="traversal-spine-deferred">
      not placed: {parts.join('; ')}.
    </p>
  );
}

/**
 * A step along the axis. A descent or a return is an ELBOW near its target, not a full-width sweep:
 * the control offset is capped, so a long run of flat time stays flat and the depth move stays
 * legible as a move.
 */
function edgePath(geometry: Geometry, edge: TraversalEdge): string {
  const x0 = geometry.x(edge.fromY);
  const x1 = geometry.x(edge.toY);
  const y0 = geometry.depthY(edge.fromDepth);
  const y1 = geometry.depthY(edge.toDepth);
  if (y0 === y1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const bend = Math.min(16, Math.abs(x1 - x0) / 2);
  return `M ${x0} ${y0} L ${Math.max(x0, x1 - bend * 2)} ${y0} C ${x1 - bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
}

/** Which way this step moved in depth — the "a descent indents, a return comes back" clause. */
function depthMove(edge: TraversalEdge): 'descend' | 'return' | 'level' {
  if (edge.toDepth > edge.fromDepth) return 'descend';
  if (edge.toDepth < edge.fromDepth) return 'return';
  return 'level';
}

/** The drawing's coordinate constants, exported so a test can assert a row without re-deriving them. */
export const TRAVERSAL_SPINE_GEOMETRY = {
  LABEL_GUTTER,
  AXIS_TAIL,
  MIN_PICTURE_PX,
  RELEASE_COMPACT_PX,
  MAX_DRAWN_DEPTH: TRAVERSAL_MAX_DRAWN_DEPTH,
} as const;

/** Exposed for the bounds test, which must hold every drawn coordinate inside the computed viewBox. */
export { computeGeometry as computeTraversalGeometry };
export type { Geometry as TraversalGeometry };
