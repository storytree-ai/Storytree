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
import {
  anchorSummary,
  markKnowledgeDepth,
  reportKnowledgeDepth,
  type KnowledgeDepthModel,
} from '../lib/knowledgeDepth';
import { TRAVERSAL_MAX_DRAWN_DEPTH } from '../lib/traversalDepth';
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

interface Geometry {
  readonly width: number;
  readonly height: number;
  readonly axisBand: number;
  readonly offerBand: number;
  readonly depthRows: number;
  readonly step: number;
  readonly spineY: number;
  readonly sx: number;
  readonly markRadius: number;
  readonly axisY: number;
  readonly x: (axisUnits: number) => number;
  readonly depthY: (depth: number) => number;
}

export function TraversalSpine({
  replay,
  compact = false,
  knowledge,
}: {
  replay: TraversalReplayPayload;
  /** The host's own measurement that the panel is dragged small. OR-ed with this component's. */
  compact?: boolean;
  /**
   * ADR-0363 D2's READ-ONLY depth-from-work join, supplied by the mount (`TraversalReplay`), which is
   * where the corpus lives. OPTIONAL and absent-by-default: with no corpus to join against, the
   * picture draws exactly what it drew before and says nothing about knowledge depth — an absent
   * model is never rendered as "nothing was deep".
   *
   * NOTE THE TWO DEPTHS ARE DIFFERENT QUANTITIES. The indentation this picture already draws is
   * SESSION-traversal depth from `parentVisitId`. This is KNOWLEDGE depth: how far the artifact that
   * was read sits from the actual work. Two axes, never one number.
   */
  knowledge?: KnowledgeDepthModel;
}): React.JSX.Element {
  const model = useMemo(() => buildTraversalSpine(replay), [replay]);
  const { scale, marks, edges, occupancy, depth, offers } = model;

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
      }),
    [box, scale.totalPx, offers.offers.length, depth.maxDepth],
  );

  const nothingToDraw = marks.length === 0 && offers.offers.length === 0;
  const atMs = timeAt(scale, playPos);
  const observed = occupancyAt(occupancy, atMs);

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
          <KnowledgeChip replay={replay} knowledge={knowledge} />
        </div>

        {nothingToDraw ? (
          <p className="small muted traversal-spine-empty" data-testid="traversal-spine-empty">
            {/* Lanes are no longer drawn (ADR-0393 D2), so a trace holding ONLY spawn events now has
                nothing plottable and must say so with the others rather than render an empty axis. */}
            nothing plottable in this trace — no context visit, search or recorded offer.
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
                <RowLabels geometry={geometry} hasOffers={offers.offers.length > 0} />
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

                {/* NO SUBAGENT LANES (ADR-0393 D2). The parent/child lane rows and their agent-type
                    + model chips are not drawn: this picture is the ORCHESTRATOR'S OWN WALK. The
                    owner's words at the LOOK — "having builder and tester subagents on there isn't
                    valuable, we can think how and if to show these later". Read "later" precisely:
                    the TELEMETRY is untouched. `spawn_handoff` / `result_return` still carry their
                    optional `model` / `runtime` (PR #1272), the replay route still serves them, and
                    `lib/traversalLanes.ts` still folds them — so whoever brings lanes back finds the
                    data waiting rather than a capture to rebuild. Only the drawing stopped. */}

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
                    {...(knowledge ? { knowledge } : {})}
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

        {/* THE FOOT IS THE LEGEND AND NOTHING ELSE (ADR-0393 D1). Six explanatory paragraphs used to
            sit here — occupancy, lanes, session depth, knowledge depth, offers, unplaced events. The
            owner deleted them at the LOOK, asked directly whether to collapse them behind a
            disclosure instead and chose deletion. What they said is still ANSWERABLE, just not by
            this panel: `storytree traversal show <sessionId>` states partial traces, unobserved
            occupancy and the offer denominators, and the per-mark hover carries read strength and
            knowledge depth. Do not restore them here without the owner. */}
        <div className="traversal-plot-foot">
          <Legend />
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
/**
 * The knowledge-depth reading, as a COUNTS CHIP beside the mark and fold counts (ADR-0393 D1).
 *
 * It is here because the paragraph that carried it was deleted with the rest of the prose, and a
 * measure landed the same morning would otherwise have no surface at all but a per-mark hover. It is
 * NOT a restored note: it sits ABOVE the picture, on the line that already states counts, and it
 * states counts.
 *
 * THE ANCHOR FIGURE TRAVELS WITH IT — that is the whole reason the chip is worth its width. `3/52`
 * alone reads as an indictment of the session that was looked at. `3/52 on-chain` beside
 * `44/1620 anchored` reads as what it is: a fact about how little of the corpus names any work.
 *
 * The three readings stay three (`lib/knowledgeDepth.ts`): an artifact NOTHING reaches is never
 * rendered as a deep one, and an UNMEASURED corpus says so rather than reporting nothing reached.
 */
function KnowledgeChip({
  replay,
  knowledge,
}: {
  replay: TraversalReplayPayload;
  knowledge?: KnowledgeDepthModel | undefined;
}): React.JSX.Element | null {
  if (!knowledge) return null;
  if (knowledge.status !== 'measured') {
    return (
      <span className="traversal-axis-note small muted" data-testid="traversal-knowledge-chip">
        knowledge not measured
      </span>
    );
  }
  const report = reportKnowledgeDepth(replay.events, knowledge);
  if (report === null || report.visited === 0) return null;
  const anchors = anchorSummary(knowledge);
  return (
    <span
      className="traversal-axis-note small muted"
      data-testid="traversal-knowledge-chip"
      data-reached={report.reached}
      data-visited={report.visited}
      data-unreachable={report.unreachable}
      data-absent={report.absent}
      title={`${report.reached} of ${report.visited} artifacts read here sit on an authored chain from a work anchor${
        report.reached > 0 ? `, deepest ${report.maxDepth}` : ''
      }; ${report.unreachable} in the corpus with no chain reaching them — unmeasured, NOT deep; ${
        report.absent
      } not Library artifacts. ${anchors ?? ''}. Nothing enforces this join, so the two graphs can drift — a derived reading, never a guarantee.`}
    >
      knowledge {report.reached}/{report.visited} on-chain
      {report.reached > 0 ? ` · deepest ${report.maxDepth}` : ''} · {knowledge.verdict.anchors}/
      {knowledge.verdict.artifactsScanned} anchored
    </span>
  );
}

function computeGeometry({
  box,
  totalPx,
  hasOffers,
  maxDepth,
}: {
  box: { width: number; height: number };
  totalPx: number;
  hasOffers: boolean;
  maxDepth: number;
}): Geometry {
  const available = Math.max(240, box.width);
  const axisBand = box.height < 120 ? 20 : 26;
  const depthRows = Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, maxDepth);

  const height0 = Math.max(56, box.height);
  const offerBand = hasOffers ? Math.min(52, Math.max(14, (height0 - axisBand) * 0.24)) : 6;
  const body = height0 - axisBand - offerBand;
  // 1 spine row + depth rows. The lane rows are GONE (ADR-0393 D2), and the vertical they used to
  // take is the whole point of removing them: on a ten-lane trace they were 10 of 12 rows, so the
  // orchestrator's own walk — the subject of the picture — was squeezed into a sixth of the height.
  const slots = 1 + depthRows;
  const step = Math.max(11, Math.min(40, body / (slots + 0.7)));

  const contentHeight = offerBand + step * (slots + 0.7) + axisBand;
  const height = contentHeight > height0 ? Math.ceil(contentHeight) : height0;

  const spineY = offerBand + step * 0.55;

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
    step,
    spineY,
    sx,
    markRadius: Math.max(2.4, Math.min(4.2, step * 0.16)),
    axisY: height - axisBand + 6,
    x: (axisUnits: number) => AXIS_HEAD + axisUnits * sx,
    depthY: (d: number) => spineY + step * Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, Math.max(0, d)),
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
  hasOffers,
}: {
  geometry: Geometry;
  hasOffers: boolean;
}): React.JSX.Element {
  const rows: { y: number; text: string; strong?: boolean }[] = [];
  if (hasOffers) rows.push({ y: Math.max(9, geometry.offerBand / 2), text: 'offers ↑' });
  rows.push({ y: geometry.spineY, text: 'spine', strong: true });
  for (let d = 1; d <= geometry.depthRows; d += 1) {
    rows.push({ y: geometry.depthY(d), text: `depth ${d}` });
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

/**
 * A plain mark — identity and read strength, and NEVER a per-visit token readout or a gauge ring.
 *
 * KNOWLEDGE DEPTH RIDES THE HOVER LABEL, NOT THE MARK, and that is a grammar constraint rather than a
 * layout preference: ADR-0354 clause 5 keeps marks plain with no per-node gauge, so a drawn depth
 * readout on every circle is exactly what may not be added. The reading is identity metadata — it
 * joins the label an operator already hovers for, and rides `data-knowledge-depth` so it is
 * assertable. The distribution an operator reads is the tab strip's meta chip (ADR-0393 D1 deleted
 * every paragraph that used to sit below the picture).
 */
function Mark({
  mark,
  geometry,
  visible,
  knowledge,
}: {
  mark: TraversalMark;
  geometry: Geometry;
  visible: boolean;
  knowledge?: KnowledgeDepthModel;
}): React.JSX.Element {
  const x = geometry.x(mark.y);
  const y = geometry.depthY(mark.depth);
  const r = geometry.markRadius;
  const reading = knowledge ? markKnowledgeDepth(knowledge, mark.nodeId) : null;
  return (
    <g
      className={`traversal-mark strength-${mark.strength}${visible ? ' is-visible' : ''}`}
      data-testid="traversal-mark"
      data-strength={mark.strength}
      data-depth={mark.depth}
      {...(reading ? { 'data-knowledge-depth': reading.attr } : {})}
    >
      <title>{reading ? `${mark.label} · ${reading.label}` : mark.label}</title>
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
 * The branches a visit PRINTED, fanning UPWARD from the spine now that depth hangs below it.
 *
 * UNOBSERVABLE CANDIDATES ARE NOT DRAWN (ADR-0393 D3). The owner named these specifically at the
 * LOOK, offered against the other dotted element in the picture. They are the branches an agent was
 * shown that no CLI read could ever have followed — an ADR file pointer — so they were drawn as faint
 * dashed rays meaning "never available", never as a declined branch. Measured on the trace the owner
 * looked at: 373 branches offered, 261 followable, so 112 of the rays were dashes for roads that do
 * not exist. Removing them leaves the fan showing only what the agent could actually have taken.
 *
 * ADR-0312 D6's RAW `M of N` DENOMINATOR IS NOT REPEALED BY THIS, and the distinction matters: the
 * fan still carries `offered N, observable M of N` on hover and on `data-offered`/`data-observable`,
 * and no percentage or ratio is introduced anywhere. What narrowed is the DENOMINATOR'S SURFACE, from
 * drawn-plus-stated to stated. A later change that drops the hover too WOULD repeal it.
 *
 * The rest of the rule stands. One ray per drawn candidate in RECORDED ORDER (ADR-0318 D3 — the set
 * is authoritative on which ids were offered and never on their order, so sorting would draw a
 * stable-looking sequence that is not what the agent saw), and no top-N and no truncation among the
 * ones drawn: a fan that quietly showed SOME of the followable branches would be exactly the
 * over-report the denominator exists to prevent.
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
  // The recorded order is preserved by FILTERING rather than re-indexing: `candidates` keeps its
  // order, the unobservable entries drop out, and the survivors fan in the order the agent saw them.
  const drawn = offer.candidates.filter((candidate) => candidate.status !== 'unobservable');
  const count = drawn.length;
  const spread = Math.min(26, 5 + count * 1.6);
  const height = Math.max(10, geometry.offerBand - 12);
  return (
    <g
      className={`traversal-offer${visible ? ' is-visible' : ''}`}
      data-testid="traversal-offer"
      data-offered={offer.offered}
      data-observable={offer.observable}
      data-followed={offer.followed}
      data-drawn={count}
    >
      {/* The raw denominator survives HERE (ADR-0312 D6) now that the offer note below the picture is
          gone — `offered N, observable M of N`, never a ratio. */}
      <title>{`${offer.surfaceId} · ${offer.denominator}`}</title>
      {drawn.map((candidate, index) => {
        const ratio = count === 1 ? 0.5 : index / (count - 1);
        return (
          <line
            key={`${offer.candidateSetId}#${candidate.nodeId}#${index}`}
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
    // rather than about the observation. The sentence naming the absence AND its remedy no longer
    // renders anywhere in the panel (ADR-0393 D1 deleted the notes); the caption below and the
    // `aria-label` are what is left, and `storytree traversal show` states the remedy in full.
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
        offer fan — one solid ray per branch the read could have taken
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

// THE SIX EXPLANATORY NOTES USED TO LIVE HERE (ADR-0393 D1) — the occupancy absence and its remedy,
// the lane-span caveat, the session-depth reading, the knowledge-depth distribution, the offer
// denominator, and the unplaced-events count. The owner deleted them at the LOOK, having been asked
// directly whether to collapse them behind a disclosure instead. They are DELETED rather than hidden
// behind a flag, because a hidden component is a component the next reader restores by accident.
//
// WHAT EACH OF THEM SAID IS STILL ANSWERABLE, and that is what makes the deletion affordable rather
// than a loss of honesty. `storytree traversal show <sessionId>` states the partial-trace count, the
// occupancy absence and its ingest remedy, and the raw `M of N` offer denominators; every fan still
// carries its own denominator on hover; every mark still carries read strength and knowledge depth on
// hover; and the knowledge-depth reading is re-homed as a compact chip in the tab strip's meta line.
//
// THE ONE THING THAT IS GENUINELY GONE FROM THE SURFACE is the at-a-glance PARTIAL warning. A trace
// with unreadable lines now looks like a complete one until an operator asks the CLI. That cost was
// put to the owner in those words and accepted.

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
