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
// occupancy bar with the over-threshold portion coloured and NO marker/tick/arc for the threshold
// itself — THREE portions since ADR-0456 D4, because ADR-0411 D3 set a SECOND mark beside the one
// the bar already drew, and the clause applies to two thresholds exactly as it did to one. The pair
// is ~700K soft / 850K hard since ADR-0499 D1 tuned it, and the numbers are never written here: they
// are imported from `@storytree/context-traversal-transcript/marks`, so a future tune moves the
// colours without touching this file; plain node
// marks with no per-node gauge; solid full-payload and grey dotted front-matter edges; a magnifying
// glass for search; branching carried by animation rather than drawn loop-backs; and explicit-only
// forks stating a raw `M of N` and never a percentage.
//
// ⚠ CLAUSE 5 HAS SINCE BEEN NARROWED TWICE MORE, both by ADR-0482 and both owner-directed at the
// LOOK, so this paragraph no longer transcribes it whole. (a) "no depth ever inferred from order,
// time or the node graph" is REVERSED FOR THE DRAWN AXIS (D1): the vertical carries CORPUS distance
// over `dependsOn` — see `traversalKnowledgeAxis.ts`, whose labelling is what preserves the reversed
// clause's intent. (b) The offer FAN is drawn as concentric rings around the mark rather than as rays
// out of it (D4) — see `traversalOfferRings.ts`. Everything else listed above is untouched and still
// binds, the plain-mark / no-per-node-gauge rule most of all: it is the clause the rings sit nearest.
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
  linkageSummary,
  markKnowledgeDepth,
  reportKnowledgeDepth,
  type KnowledgeDepthModel,
  type MarkKnowledgeDepth,
} from '../lib/knowledgeDepth';
import {
  axisCaption,
  axisRowLabel,
  buildKnowledgeAxis,
  knowledgeAxisRow,
  TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH,
  type KnowledgeAxis,
} from '../lib/traversalKnowledgeAxis';
import type { TraversalOffer } from '../lib/traversalOffers';
import {
  FOLLOWED_STROKE_SCALE,
  offerRingGeometry,
  ringHeadroom,
} from '../lib/traversalOfferRings';
import {
  bandGuidance,
  bandOf,
  formatTokens,
  HARD_MARK_TOKENS,
  occupancyAt,
  occupancyFill,
  preferredOccupancy,
  SOFT_MARK_TOKENS,
  type OccupancySeries,
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
  readonly ringHeadroom: number;
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
  transcriptOccupancy = null,
}: {
  replay: TraversalReplayPayload;
  /** The host's own measurement that the panel is dragged small. OR-ed with this component's. */
  compact?: boolean;
  /**
   * This window's occupancy read from its own HOST TRANSCRIPT, supplied by the mount (ADR-0456 D2).
   *
   * PREFERRED over the trace-sourced series the replay carries, and the preference is the whole
   * point of the repoint: occupancy reaches a trace only through an explicit `storytree traversal
   * ingest` (2 of 697 local traces), while the transcripts are ambient (25 of the 30 most recent
   * traces). `null` means the mount has not read it yet — which is NOT an absence, and must never
   * render as "this window was never observed"; the trace-sourced series is what draws until it
   * arrives, and it already knows how to say "none observed".
   */
  transcriptOccupancy?: OccupancySeries | null;
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
  const { scale, marks, edges, depth, offers } = model;

  // ONE bar, two possible sources, and the trace is the FALLBACK rather than the equal (ADR-0456 D2).
  // The rule is a proven function rather than a ternary here, because its interesting case is the
  // one a component would get wrong: when NEITHER source has readings, the transcript still wins,
  // since it is the only one carrying a reason for the absence.
  const occupancy = preferredOccupancy(model.occupancy, transcriptOccupancy);

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

  // ── the drawn vertical (ADR-0482 D1–D3, `traversal-panel-depth-on-the-axis`) ───────────────────
  //
  // THE AXIS IS RESOLVED HERE, ONCE, AND BOTH THE MARKS AND THE EDGES READ THE SAME MAP. Resolving a
  // row twice — once per mark and once per edge end — is how an edge comes to end somewhere its own
  // mark is not: the two calls would have to stay in step through every future change to the join.
  //
  // It cannot be resolved in `buildTraversalSpine` instead, which is where the old `parentVisitId`
  // depth was: that reading came out of the trace alone, and this one needs the CORPUS, which only
  // the mount has. So the model still carries the session depth as telemetry (ADR-0482 D5) and the
  // drawn row is a render-time join, inside ADR-0363 D2's read-only fence like every other use of it.
  const report = useMemo(
    () => (knowledge ? reportKnowledgeDepth(replay.events, knowledge) : null),
    [replay.events, knowledge],
  );
  const axis = useMemo(() => buildKnowledgeAxis(report), [report]);
  const rowByMarkId = useMemo(() => {
    const rows = new Map<string, number>();
    for (const mark of marks) {
      rows.set(
        mark.id,
        knowledgeAxisRow(
          axis,
          // THE MARK'S OWN SURFACE RIDES ALONG (ADR-0511 D4): whether an id the corpus does not hold
          // is a work-hierarchy unit is a fact about the READ, not about the id, so the classifier
          // cannot answer it from `nodeId` alone.
          knowledge ? markKnowledgeDepth(knowledge, mark.nodeId, mark.surfaceId) : null,
        ),
      );
    }
    return rows;
  }, [marks, axis, knowledge]);
  // A mark id the map does not hold cannot arise — the map is built from these same marks — so this
  // is the surface a caller reads, not a fallback with a story. 0 is the spine: the answer for a read
  // with no reading, which is what an unknown id would be.
  const rowOf = (markId: string): number => rowByMarkId.get(markId) ?? 0;

  // THE MARK EACH FAN RINGS (ADR-0482 D4). Keyed on the RECORDED visit id, which the offer carries
  // out of its own `candidate-set:<visitId>` — not on the instant, which agrees for only 1,363 of
  // the 2,106 measured sets and would anchor the other 743 by a nearest-match guess.
  //
  // A search is not a visit and carries no visit id, so it can never be keyed here — which is right:
  // a search prints no offers.
  const markByVisitId = useMemo(() => {
    const byVisit = new Map<string, TraversalMark>();
    for (const mark of marks) {
      if (mark.visitId !== null && !byVisit.has(mark.visitId)) byVisit.set(mark.visitId, mark);
    }
    return byVisit;
  }, [marks]);

  // FAIL CLOSED, AND COUNTED. An offer whose printing visit this trace does not hold is dropped from
  // the drawing rather than centred on the spine: the spine is row 0 and row 0 now means "at the
  // graph's surface" (ADR-0482 D3), so parking it there would state a depth nothing measured. The
  // count is surfaced on the layer so a trace that starts producing them is visible rather than
  // silently thinner — measured today at 0 of 2,106 across every local trace.
  const anchoredOffers = useMemo(() => {
    const anchored: { offer: TraversalOffer; mark: TraversalMark }[] = [];
    let unanchored = 0;
    for (const offer of offers.offers) {
      const mark = offer.printedByVisitId === null ? undefined : markByVisitId.get(offer.printedByVisitId);
      if (mark === undefined) {
        unanchored += 1;
        continue;
      }
      anchored.push({ offer, mark });
    }
    return { anchored, unanchored };
  }, [offers.offers, markByVisitId]);

  const geometry = useMemo(
    () =>
      computeGeometry({
        box,
        totalPx: scale.totalPx,
        // The ANCHORED count, not the recorded one: the headroom exists for rings that draw, and an
        // offer with no resolvable mark draws none.
        hasOffers: anchoredOffers.anchored.length > 0,
        rows: axis.rows,
      }),
    [box, scale.totalPx, anchoredOffers.anchored.length, axis.rows],
  );

  const nothingToDraw = marks.length === 0 && anchoredOffers.anchored.length === 0;
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
          {/* ADR-0482 D2's LABELLING, and it is load-bearing rather than decorative. The vertical
              now reads a corpus distance, which ADR-0354 clause 5 forbade drawing precisely because
              a reader would take it for the session's own descent. The clause is reversed for the
              axis and its intent kept HERE: the picture says what the vertical means, in the same
              line that already states the mark and fold counts, with the full sentence on hover.
              Removing this does not tidy the meta line — it repeals the condition the reversal was
              granted on. */}
          <span
            className="traversal-axis-note small muted"
            data-testid="traversal-depth-axis-note"
            data-axis-measured={axis.measured ? 'true' : 'false'}
            data-axis-rows={axis.rows}
            {...(axis.deepest === null ? {} : { 'data-axis-deepest': axis.deepest })}
            title={axisCaption(axis)}
          >
            {axis.measured ? 'depth ↓ corpus distance' : 'depth ↓ unmeasured'}
          </span>
          <KnowledgeChip replay={replay} knowledge={knowledge} />
          <ProvenanceChip replay={replay} />
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
                <RowLabels geometry={geometry} axis={axis} />
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

                <g
                  className="traversal-offer-layer"
                  data-testid="traversal-offer-layer"
                  data-unanchored={anchoredOffers.unanchored}
                >
                  {anchoredOffers.anchored.map(({ offer, mark }) => (
                    <OfferRings
                      key={offer.candidateSetId}
                      offer={offer}
                      geometry={geometry}
                      row={rowOf(mark.id)}
                      markY={mark.y}
                      // The reveal still rides the OFFER'S OWN instant, which is when the branches
                      // were printed. It is never earlier than the visit's, so a fan cannot appear
                      // around a mark the playhead has not reached.
                      visible={playPos >= offer.y}
                    />
                  ))}
                </g>

                {edges.map((edge) => (
                  <path
                    key={edge.id}
                    className={`traversal-edge strength-${edge.strength}${playPos >= edge.toY ? ' is-visible' : ''}`}
                    data-strength={edge.strength}
                    data-depth-move={depthMove(rowOf(edge.fromId), rowOf(edge.toId))}
                    d={edgePath(geometry, edge, rowOf(edge.fromId), rowOf(edge.toId))}
                  />
                ))}

                {marks.map((mark) => (
                  <Mark
                    key={mark.id}
                    mark={mark}
                    geometry={geometry}
                    row={rowOf(mark.id)}
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
        note={occupancy.note}
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
 * THE LINKAGE FIGURE TRAVELS WITH IT — that is the whole reason the chip is worth its width. `3/52`
 * alone reads as an indictment of the session that was looked at. `3/52 placed` beside
 * `1034/1208 linked` reads as what it is: a fact about how much of the corpus is wired at all.
 *
 * ⚠ WHAT IT MEASURES CHANGED IN ADR-0476, AND THE WORDS CHANGED WITH IT. It used to read
 * `N/M on-chain … K/L anchored`: distance from a WORK ANCHOR, over a denominator that included 1,880
 * record rows. It now reads `N/M placed … K/L linked`: distance from the graph's own SURFACE, over
 * the knowledge tiers only. The words are not decoration — `on-chain` and `anchored` named the old
 * quantity, and leaving them on the new one would have been the most quotable wrong number here.
 *
 * The readings stay APART (`lib/knowledgeDepth.ts`): an artifact NOTHING links to is never rendered
 * as a surface, a cycle is never rendered as a depth, and an UNMEASURED corpus says so rather than
 * reporting nothing placed.
 *
 * ⚠ `placed` READS LOWER SINCE ADR-0511, AND THE MISSING MARKS ARE NOT MISSING. A record row that
 * carried a cite used to count as `placed` (132 rows, 255 marks on this machine's traces), almost
 * all of them at depth 0 — a log row drawn on the axis's surface row. They now count under `record`,
 * which is why the hover enumerates every band: the arithmetic has to be visible, or the drop reads
 * as the corpus having lost edges.
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
  const linkage = linkageSummary(knowledge);
  return (
    <span
      className="traversal-axis-note small muted"
      data-testid="traversal-knowledge-chip"
      data-placed={report.placed}
      data-visited={report.visited}
      data-record={report.record}
      data-work-unit={report.workUnit}
      data-unlinked={report.unlinked}
      data-cyclic={report.cyclic}
      data-absent={report.absent}
      title={`${report.placed} of ${report.visited} things read here are knowledge artifacts in the dependency graph${
        report.placed > 0 ? `, the deepest ${report.maxDepth} hop(s) below a surface` : ''
      }; ${report.record} are record rows — the session log, which has no knowledge depth; ${
        report.workUnit
      } are stories or capabilities, which live in the work hierarchy; ${
        report.unlinked
      } carry no edge either way — unmeasured, NOT at the surface; ${
        report.absent
      } are ids the Library does not hold at all${
        report.cyclic > 0 ? `; ${report.cyclic} sit under a dependency cycle` : ''
      }. ${linkage ?? ''} Nothing enforces this join, so the two graphs can drift — a derived reading, never a guarantee.`}
    >
      knowledge {report.placed}/{report.visited} placed
      {report.placed > 0 ? ` · deepest ${report.maxDepth}` : ''} · {knowledge.verdict.knowledgeLinked}
      /{knowledge.verdict.knowledgeScanned} linked
    </span>
  );
}

/**
 * WHICH RECORDER wrote this trace, as one chip in the picture's own meta line (ADR-0484 D5).
 *
 * IT IS A CHIP, NOT A PARAGRAPH, and that distinction is the whole of how it sits beside ADR-0393
 * D1: the owner deleted every prose block BELOW the picture at the LOOK. This is the same class of
 * object as the mark/fold count and the knowledge chip already in that line — a compact reading in
 * the picture's own chrome, with the full sentence on hover.
 *
 * IT RENDERS ONLY WHEN THERE IS SOMETHING TO QUALIFY: a trace holding nothing harness-derived, and
 * on which somebody HAS run the ingest, grows no chip — there are then no secondary readings to
 * label and no unmeasured absence to warn about. The never-run case DOES render, because that is the
 * absence a reader would otherwise take for a measured zero.
 */
function ProvenanceChip({ replay }: { replay: TraversalReplayPayload }): React.JSX.Element | null {
  const { census, ingestRan, ingestNote, precedence } = replay.provenance;
  const secondary = census.harness + census.unclassified;
  if (secondary === 0 && ingestRan) return null;

  const scopes = census.surfaces
    .filter((surface) => surface.provenance !== 'storytree-own')
    .map((surface) => `${surface.surfaceId} (x${surface.count}) — ${surface.scope}`);

  return (
    <span
      className="traversal-axis-note small muted"
      data-testid="traversal-provenance-chip"
      data-own={census.own}
      data-harness={census.harness}
      data-unclassified={census.unclassified}
      data-ingest-ran={ingestRan ? 'true' : 'false'}
      title={`${census.own} of these observations were recorded by storytree's own CLI as the command ran; ${census.harness} were read back out of the host harness transcript afterwards${
        census.unclassified > 0 ? `; ${census.unclassified} came from a surface nothing here classifies` : ''
      }. ${precedence}. ${scopes.join(' · ')}${scopes.length > 0 ? '. ' : ''}${ingestNote}`}
    >
      {/* The two secondary tiers are NAMED apart, never summed into one word: a reading nobody has
          classified is not the same claim as one we know came from the harness. */}
      {census.harness > 0 || census.unclassified > 0
        ? `${census.own} own` +
          (census.harness > 0 ? ` · ${census.harness} harness-derived` : '') +
          (census.unclassified > 0 ? ` · ${census.unclassified} unclassified` : '')
        : 'harness ingest never run'}
    </span>
  );
}

/**
 * A mark's radius on a row `step` px tall.
 *
 * Lifted out of {@link computeGeometry}'s return literal because the ring headroom now needs it
 * BEFORE the geometry exists — see the two-pass note below. One function, so a mark and the rings
 * around it can never be sized against different numbers.
 */
function markRadiusFor(step: number): number {
  return Math.max(2.4, Math.min(4.2, step * 0.16));
}

function computeGeometry({
  box,
  totalPx,
  hasOffers,
  rows,
}: {
  box: { width: number; height: number };
  totalPx: number;
  hasOffers: boolean;
  /**
   * Rows BELOW the spine, from the knowledge axis — depth rows plus the unmeasured row
   * (`traversalKnowledgeAxis.ts`). Already clamped there, so no second clamp lives here: two clamps
   * at two altitudes is how a picture ends up with rows nothing draws on.
   */
  rows: number;
}): Geometry {
  const available = Math.max(240, box.width);
  const axisBand = box.height < 120 ? 20 : 26;
  const depthRows = rows;

  const height0 = Math.max(56, box.height);
  // 1 spine row + depth rows. The lane rows are GONE (ADR-0393 D2), and the vertical they used to
  // take is the whole point of removing them: on a ten-lane trace they were 10 of 12 rows, so the
  // orchestrator's own walk — the subject of the picture — was squeezed into a sixth of the height.
  const slots = 1 + depthRows;
  const stepFor = (band: number): number =>
    Math.max(11, Math.min(40, (height0 - axisBand - band) / (slots + 0.7)));

  // THE OFFER BAND IS GONE WITH THE RAYS (ADR-0482 D4). It reserved 14–52px above the spine for rays
  // fanning upward; rings sit ON the mark, so what is left to reserve is the radius of one ring set
  // drawn on the surface row, which is the only row with nothing above it. On a full-height panel
  // that hands roughly 30px back to the depth rows ADR-0482 D1 just gave something to say.
  //
  // TWO PASSES, because the ring cap and the row height each depend on the other: the cap is a share
  // of `step`, and `step` is what is left after the headroom. Pass one sizes rows against the
  // no-offer band, pass two re-sizes them against the headroom that cap needs. It is SAFE in one
  // direction only, and that is why it terminates rather than iterating: more headroom means a
  // shorter `body`, so `step` can only shrink, and both `markRadius` and `ringOuterCap` are
  // non-decreasing in `step` — so the pass-two cap is never larger than the headroom pass one
  // reserved for it.
  const NO_OFFER_BAND = 6;
  const step0 = stepFor(NO_OFFER_BAND);
  const headroom = hasOffers ? ringHeadroom(step0, markRadiusFor(step0)) : NO_OFFER_BAND;
  const step = stepFor(headroom);

  const contentHeight = headroom + step * (slots + 0.7) + axisBand;
  const height = contentHeight > height0 ? Math.ceil(contentHeight) : height0;

  const spineY = headroom + step * 0.55;

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
    ringHeadroom: headroom,
    depthRows,
    step,
    spineY,
    sx,
    markRadius: markRadiusFor(step),
    axisY: height - axisBand + 6,
    x: (axisUnits: number) => AXIS_HEAD + axisUnits * sx,
    depthY: (d: number) => spineY + step * Math.min(depthRows, Math.max(0, d)),
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
  axis,
}: {
  geometry: Geometry;
  /**
   * The knowledge axis, so the ROW NAMES come from the same module that decided the row POSITIONS
   * (ADR-0482 D2). The labelling is what preserves the reversed clause's intent — an unlabelled
   * vertical re-creates the claim ADR-0354 clause 5 was written to prevent — so a renderer inventing
   * its own words here would quietly repeal it.
   */
  axis: KnowledgeAxis;
}): React.JSX.Element {
  // THE `offers ↑` ROW IS GONE WITH THE BAND (ADR-0482 D4). It named a band above the spine that
  // rays fanned into; rings sit on the mark, so there is no row of the picture that is "the offers".
  // A gutter label for a row nothing occupies would be the picture describing a shape it stopped
  // drawing — the ADR-0393 defect, in words instead of CSS.
  const rows: { y: number; text: string; strong?: boolean }[] = [];
  rows.push({ y: geometry.spineY, text: axis.measured ? axisRowLabel(axis, 0) : 'spine', strong: true });
  for (let d = 1; d <= geometry.depthRows; d += 1) {
    rows.push({ y: geometry.depthY(d), text: axisRowLabel(axis, d) });
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
/**
 * What an operator reads on hover: identity, the knowledge reading when there is one, and — for any
 * observation that is NOT our own log — WHICH RECORDER wrote it and what that surface can observe
 * (ADR-0484 D5 deliverables 1 and 3).
 *
 * THE TIER CLAUSE IS APPENDED ONLY WHERE A READER CAN GET IT WRONG. Our own log is the default
 * expectation, and stamping "storytree-own" on every circle would bury the marks that are not — the
 * same reason the CLI's provenance block carries a scope line on the harness rows and not on ours.
 *
 * THE TWO UNCLASSIFIED CASES ARE SAID DIFFERENTLY, because they are different facts. An event that
 * recorded NO surface is an old one from before surfaces were stamped: nothing attributes it, and
 * saying so plainly is all that can be said. An event carrying a surface the payload does not
 * classify is an adapter minting a reading nobody has been told how to weigh — a drift, and the one
 * worth shouting about.
 */
function markTitle(mark: TraversalMark, reading: MarkKnowledgeDepth | null): string {
  const base = reading ? `${mark.label} · ${reading.label}` : mark.label;
  if (mark.provenance === 'storytree-own') return base;
  if (mark.provenance === 'unclassified') {
    return mark.surfaceId === null
      ? `${base} · recorder unrecorded — this observation carries no surface, so nothing attributes it to one`
      : `${base} · UNCLASSIFIED RECORDER — surface "${mark.surfaceId}" is in no provenance table, so weigh it as neither tier`;
  }
  const scope = mark.provenanceScope === null ? '' : ` — ${mark.provenanceScope}`;
  return `${base} · HARNESS-DERIVED: a SECONDARY source, read back out of the host harness transcript after the fact rather than recorded by storytree${scope}`;
}

function Mark({
  mark,
  geometry,
  row,
  visible,
  knowledge,
}: {
  mark: TraversalMark;
  geometry: Geometry;
  /**
   * The DRAWN row, resolved once by the mount from the knowledge axis (ADR-0482 D1). Passed in rather
   * than recomputed here so this mark and the edges touching it cannot land on different rows.
   */
  row: number;
  visible: boolean;
  knowledge?: KnowledgeDepthModel;
}): React.JSX.Element {
  const x = geometry.x(mark.y);
  const y = geometry.depthY(row);
  const r = geometry.markRadius;
  // The SAME three arguments the row resolution used — a hover that classified the mark differently
  // from the row it is drawn on would be the two-callers drift `rowByMarkId`'s comment warns about.
  const reading = knowledge ? markKnowledgeDepth(knowledge, mark.nodeId, mark.surfaceId) : null;
  return (
    <g
      className={`traversal-mark strength-${mark.strength}${visible ? ' is-visible' : ''}`}
      data-testid="traversal-mark"
      data-strength={mark.strength}
      // The DRAWN row — corpus distance since ADR-0482 D1.
      data-row={row}
      // The SESSION-traversal depth from `parentVisitId`, kept as telemetry and no longer drawn
      // (ADR-0482 D5, the ADR-0393 precedent). It is a DIFFERENT QUANTITY from `data-row` and the two
      // are never comparable — see `surface-depth.ts`'s header before summing or contrasting them.
      data-depth={mark.depth}
      {...(reading ? { 'data-knowledge-depth': reading.attr } : {})}
      // WHICH RECORDER wrote this observation (ADR-0484 D5). It rides an attribute and the hover
      // rather than the drawn grammar: ADR-0354 clause 5 keeps marks plain, so a second colour or a
      // second shape for the harness tier is exactly what may not be added without an owner LOOK.
      // The attribute is what makes it assertable, and the hover is where an operator reads it.
      data-provenance={mark.provenance}
    >
      <title>{markTitle(mark, reading)}</title>
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
 * The branches a visit PRINTED, drawn as concentric rings AROUND THE MARK THAT PRINTED THEM — the
 * owner's own shape, proposed at the LOOK on 2026-08-30 by analogy with tree rings signalling age,
 * and settled as ADR-0482 D4.
 *
 * WHAT MOVED IS THE SHAPE AND NOTHING ELSE. The fan used to be rays out of the spine into a band
 * above it, which stopped making sense the moment ADR-0482 D1 gave the vertical 16 rows of corpus
 * depth to carry: a band anchored to the spine sat around nothing on any trace where the marks had
 * moved down. Everything else clause 5 says still binds and is unchanged here — the raw `M of N`
 * that never becomes a percentage, explicit-only forks, and marks that stay plain.
 *
 * ⚠ RINGS COUNT BRANCHES, THEY DO NOT GAUGE. See `traversalOfferRings.ts`, which owns the radii and
 * says it at more length: rings around a mark are one step from a dial, and a ring set encoding
 * anything but the offer count would breach a clause nobody reopened.
 *
 * THE CENTRE IS RECORDED, NOT GUESSED. `row` and `x` come from the mark named by the offer's own
 * recorded id (`candidate-set:<visitId>`), resolved by the mount. An offer whose printing visit this
 * trace does not hold is NOT DRAWN — never parked on the spine, which is row 0 and now means "at the
 * graph's surface". Measured across all 759 local traces, that branch is 0 of 2,106.
 *
 * UNOBSERVABLE CANDIDATES ARE STILL NOT DRAWN (ADR-0393 D3). The owner named these specifically at
 * the previous LOOK: they are branches no CLI read could ever have followed — an ADR file pointer —
 * so drawing them said "never available" rather than "declined". Measured on the trace he looked at,
 * 373 branches offered and 261 followable, so 112 of them stood for roads that do not exist.
 *
 * ADR-0312 D6's RAW `M of N` DENOMINATOR IS NOT REPEALED BY EITHER CHANGE: the fan still carries
 * `offered N, observable M of N` on hover and on `data-offered`/`data-observable`, and no percentage
 * or ratio is introduced anywhere. A later change that drops the hover too WOULD repeal it.
 *
 * ONE RING PER DRAWN CANDIDATE IN RECORDED ORDER, innermost first (ADR-0318 D3 — the set is
 * authoritative on which ids were offered and never on their order, so sorting would draw a
 * stable-looking sequence that is not what the agent saw). No top-N and no truncation: a fan quietly
 * showing SOME of the followable branches would be exactly the over-report the denominator exists to
 * prevent. At large N the SPACING gives way, never the count.
 */
function OfferRings({
  offer,
  geometry,
  row,
  markY,
  visible,
}: {
  offer: TraversalOffer;
  geometry: Geometry;
  /** The drawn row of the mark that printed this offer, resolved by the mount from the corpus. */
  row: number;
  /** That mark's own axis position — the rings centre on the MARK, not on the offer's instant. */
  markY: number;
  visible: boolean;
}): React.JSX.Element {
  const cx = geometry.x(markY);
  const cy = geometry.depthY(row);
  // The recorded order is preserved by FILTERING rather than re-indexing: `candidates` keeps its
  // order, the unobservable entries drop out, and the survivors ring outward in the order the agent
  // saw them.
  const drawn = offer.candidates.filter((candidate) => candidate.status !== 'unobservable');
  const rings = offerRingGeometry({
    count: drawn.length,
    markRadius: geometry.markRadius,
    step: geometry.step,
  });
  return (
    <g
      className={`traversal-offer${visible ? ' is-visible' : ''}`}
      data-testid="traversal-offer"
      data-offered={offer.offered}
      data-observable={offer.observable}
      data-followed={offer.followed}
      data-drawn={drawn.length}
      data-row={row}
    >
      {/* The raw denominator survives HERE (ADR-0312 D6) now that the offer note below the picture is
          gone — `offered N, observable M of N`, never a ratio. */}
      <title>{`${offer.surfaceId} · ${offer.denominator}`}</title>
      {drawn.map((candidate, index) => (
        <circle
          key={`${offer.candidateSetId}#${candidate.nodeId}#${index}`}
          className={`traversal-offer-ring status-${candidate.status}`}
          data-testid="traversal-offer-ring"
          data-status={candidate.status}
          cx={cx}
          cy={cy}
          r={rings.radii[index]}
          // FOLLOWED is the state that departs; NOT-FOLLOWED is the plain ring at full weight. That
          // is the ADR-0393 defect's own lesson: nothing is ever followed in practice, so a fan
          // de-emphasising the near-universal state renders as texture rather than as a reading.
          strokeWidth={
            candidate.status === 'followed'
              ? rings.strokeWidth * FOLLOWED_STROKE_SCALE
              : rings.strokeWidth
          }
        />
      ))}
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
/**
 * WHICH RECORDER the occupancy reading came from (ADR-0484 D5), said on the reading itself.
 *
 * One constant, used on both the observed and the unobserved label, so the bar cannot state its tier
 * one way when it has a number and another way when it does not.
 */
const OCCUPANCY_TIER =
  'This reading is HARNESS-DERIVED: it is read out of the host harness’s own transcript, not ' +
  'recorded by storytree.';

function OccupancyTrack({
  observed,
  scaleTokens,
  observationCount,
  note,
}: {
  observed: number | null;
  scaleTokens: number;
  observationCount: number;
  /** The source's own sentence about what it read, or looked for and did not find. May be empty. */
  note: string;
}): React.JSX.Element {
  if (observationCount === 0) {
    // The track keeps its column and goes DASHED rather than disappearing, so the picture's geometry
    // does not change shape depending on whether a window happened to be readable. It draws no fill
    // at all — a flat zero bar would say the window was empty, which is a claim about the session
    // rather than about the observation. The sentence naming the absence no longer renders as PROSE
    // anywhere in the panel (ADR-0393 D1 deleted the notes); it rides the `aria-label` instead, so
    // the reason survives for a reader who asks without returning six paragraphs to the picture.
    return (
      <div className="traversal-occupancy is-unobserved">
        <span className="traversal-occupancy-cap">resident</span>
        <div
          className="traversal-occupancy-track is-unobserved"
          role="img"
          aria-label={
            note === ''
              ? `no context occupancy was observed for this session. ${OCCUPANCY_TIER}`
              : `no context occupancy was observed for this session — ${note}. ${OCCUPANCY_TIER}`
          }
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
  const band = observed === null ? null : bandOf(observed);
  return (
    <div className="traversal-occupancy" data-testid="traversal-occupancy">
      <span className="traversal-occupancy-cap">resident</span>
      <div
        className="traversal-occupancy-track"
        role="img"
        aria-label={
          observed === null
            ? 'no context observation yet at the playhead'
            : // The tier rides the reading itself (ADR-0484 D5 deliverable 1). This bar is the
              // panel's most prominent number and is HARNESS-DERIVED whichever way it was filled —
              // `residentInputTokens` has one producer, the host-transcript adapter, and the
              // window's own transcript the mount prefers (ADR-0456 D2) is the SAME harness file.
              // There is no storytree-recorded occupancy for it to be confused with.
              `${formatTokens(observed)} tokens resident in the session window at the playhead — ${bandGuidance(bandOf(observed))}. ${OCCUPANCY_TIER}`
        }
      >
        {fill !== null && (
          <>
            {/* THREE portions, and the colour is the WHOLE signal for both marks — no marker, tick,
                or arc is drawn at either boundary anywhere (ADR-0393 D1, carried to two marks by
                ADR-0456 D4). Each segment simply starts where the fill splits. */}
            <span
              className="traversal-occupancy-fill is-calm"
              data-testid="traversal-occupancy-calm"
              style={{ height: `${fill.calmFraction * 100}%` }}
            />
            <span
              className="traversal-occupancy-fill is-soft"
              data-testid="traversal-occupancy-soft"
              style={{
                bottom: `${fill.softStartFraction * 100}%`,
                height: `${fill.softFraction * 100}%`,
              }}
            />
            <span
              className="traversal-occupancy-fill is-hard"
              data-testid="traversal-occupancy-hard"
              style={{
                bottom: `${fill.hardStartFraction * 100}%`,
                height: `${fill.hardFraction * 100}%`,
              }}
            />
          </>
        )}
      </div>
      <span
        className={`traversal-occupancy-readout${band === null || band === 'calm' ? '' : ` is-${band}`}`}
        data-testid="traversal-occupancy-readout"
      >
        {observed === null ? '—' : formatTokens(observed)}
        <br />
        <span className="traversal-occupancy-threshold">
          {formatTokens(SOFT_MARK_TOKENS)} · {formatTokens(HARD_MARK_TOKENS)}
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
      {/* ⚠ THE LEGEND AND THE STYLESHEET MUST AGREE, and that is a defect fix rather than tidiness.
          ADR-0393's was exactly this pair disagreeing — the legend said "solid ray not followed" over
          CSS that drew it dashed — and it survived review because nothing is ever followed, so the
          disagreeing state was the only one that ever occurred. `TraversalSpine.test.tsx` reads
          `index.css` and pins these words against the rules that draw them. */}
      <span className="traversal-legend-key">
        <svg width="22" height="16" aria-hidden="true">
          <circle className="traversal-mark-dot" cx={11} cy={8} r={2.4} />
          <circle className="traversal-offer-ring status-not-followed" cx={11} cy={8} r={4.8} />
          <circle className="traversal-offer-ring status-not-followed" cx={11} cy={8} r={7.2} />
        </svg>
        offer rings — one solid ring per branch the read could have taken, innermost offered first
      </span>
      <span className="traversal-legend-key">
        <span className="traversal-legend-bar" aria-hidden="true">
          <span className="traversal-legend-bar-calm" />
          <span className="traversal-legend-bar-soft" />
          <span className="traversal-legend-bar-hard" />
        </span>
        resident context, colouring past {formatTokens(SOFT_MARK_TOKENS)} and{' '}
        {formatTokens(HARD_MARK_TOKENS)}
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
function edgePath(geometry: Geometry, edge: TraversalEdge, fromRow: number, toRow: number): string {
  const x0 = geometry.x(edge.fromY);
  const x1 = geometry.x(edge.toY);
  const y0 = geometry.depthY(fromRow);
  const y1 = geometry.depthY(toRow);
  if (y0 === y1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const bend = Math.min(16, Math.abs(x1 - x0) / 2);
  return `M ${x0} ${y0} L ${Math.max(x0, x1 - bend * 2)} ${y0} C ${x1 - bend} ${y0}, ${x1 - bend} ${y1}, ${x1} ${y1}`;
}

/** Which way this step moved in depth — the "a descent indents, a return comes back" clause. */
function depthMove(fromRow: number, toRow: number): 'descend' | 'return' | 'level' {
  if (toRow > fromRow) return 'descend';
  if (toRow < fromRow) return 'return';
  return 'level';
}

/** The drawing's coordinate constants, exported so a test can assert a row without re-deriving them. */
export const TRAVERSAL_SPINE_GEOMETRY = {
  LABEL_GUTTER,
  AXIS_TAIL,
  MIN_PICTURE_PX,
  RELEASE_COMPACT_PX,
  // The vertical's clamp lives with the axis now (ADR-0482 D1): the rows are corpus distance, so the
  // ceiling is a property of the corpus reading rather than of the session-descent module that used
  // to feed them. `TRAVERSAL_MAX_DRAWN_DEPTH` still exists and still bounds `traversalDepth.ts`'s own
  // reading, which is still computed and no longer drawn.
  MAX_DRAWN_DEPTH: TRAVERSAL_MAX_DRAWN_KNOWLEDGE_DEPTH,
} as const;

/** Exposed for the bounds test, which must hold every drawn coordinate inside the computed viewBox. */
export { computeGeometry as computeTraversalGeometry };
export type { Geometry as TraversalGeometry };
