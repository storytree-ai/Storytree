// The plottable spine (`traversal-panel-arc`, increment `traversal-panel-spine-render`): one replay
// payload folded into marks, edges, an axis and an occupancy series — everything the SVG needs, and
// nothing about how it looks.
//
// WHAT IS DRAWN, and it is exactly the signed grammar's spine clauses:
//   • a context visit is a PLAIN MARK — identity, read strength, no per-visit token readout and no
//     per-node gauge (the 2026-07-27 revision retired both);
//   • a search is the only non-circular mark;
//   • the edge INTO a visit carries that visit's read strength — solid for `full_payload_read`, grey
//     dotted for `front_matter_read`. The discriminator is the event `kind` itself and nothing else.
//
// WIDENED BY `traversal-panel-lanes-and-depth`, which is what the previous increment named as the one
// that would draw the rest. Three things it counted as deferred are now DRAWN, each in its own module
// so its honesty rule is provable on its own:
//   • `spawn_handoff` / `result_return` — the linked parent/child lanes and the per-lane model badge
//     PR #1272 gave them a field for (`traversalLanes.ts`);
//   • `parentVisitId` depth indentation, which still renders a SINGLE COLUMN wherever parent links are
//     absent, because an inferred tree is the one thing the honesty clause forbids (`traversalDepth.ts`);
//   • `candidate_set` / `followed_edge` — the offer fans, carrying ADR-0312 D6's raw `M of N`
//     observability denominator and never a percentage (`traversalOffers.ts`).
//
// WHAT IS STILL DELIBERATELY NOT DRAWN:
//   • revisit loop-backs, at any point, by decision (revision clause 4): the animation carries
//     branching, and the link stays answerable by query.
//
// THE AXIS NOW COVERS EVERYTHING DRAWN. It used to be built from the plotted marks alone, which was
// exact while the marks were the whole picture; a lane or a fan whose instant fell outside that span
// would CLAMP to the first or last row and sit there looking like an observation at that time. So the
// scale is built from every instant the picture places — marks, lane ends, and offer points — while the
// marks themselves remain exactly what they were.

import type { TraversalEventEnvelope, TraversalReplayPayload } from '../types';
import { computeTraversalDepth, drawnDepth, type TraversalDepthModel } from './traversalDepth';
import { buildTraversalLanes, laneInstants, type TraversalLaneModel } from './traversalLanes';
import { buildOccupancySeries, type OccupancySeries } from './traversalOccupancy';
import { buildTraversalOffers, offerInstants, type TraversalOfferModel } from './traversalOffers';
import {
  buildTraversalTimeScale,
  TRAVERSAL_TIME_DEFAULTS,
  yAt,
  type TraversalTimeConfig,
  type TraversalTimeScale,
} from './traversalTime';

/** How a visit was read — and therefore how the edge into it is drawn. */
export type ReadStrength = 'full' | 'front-matter' | 'search';

export interface TraversalMark {
  readonly id: string;
  readonly atMs: number;
  readonly strength: ReadStrength;
  /** Its y on the axis, resolved once at build time so the render and the transport cannot disagree. */
  readonly y: number;
  /**
   * How far this visit is INDENTED, in depth steps rather than in pixels: `0` for the spine column.
   * Non-zero only where `parentVisitId` resolved onto a visit this same trace recorded.
   */
  readonly depth: number;
  /** What an operator hovers to see. Identity only — a node id or a search operation, never content. */
  readonly label: string;
  /**
   * The artifact this visit read, or `null` for a search (which reads no single node).
   *
   * Carried as its own field rather than parsed back out of {@link TraversalMark.label}: the
   * knowledge-depth join (`lib/knowledgeDepth.ts`) keys on it, and recovering an id from prose that
   * exists to be read by a human is how a renderer starts depending on the wording of a label.
   */
  readonly nodeId: string | null;
}

export interface TraversalEdge {
  readonly id: string;
  readonly fromY: number;
  readonly toY: number;
  /** The source and target indentation, so a descent and a return are drawn as the moves they were. */
  readonly fromDepth: number;
  readonly toDepth: number;
  /** The TARGET's read strength: an edge's weight is what the step it led to actually pulled. */
  readonly strength: ReadStrength;
  /** The instant the edge completes, so the playhead reveals it exactly when the target appears. */
  readonly atMs: number;
}

export interface TraversalSpineModel {
  readonly marks: readonly TraversalMark[];
  readonly edges: readonly TraversalEdge[];
  readonly scale: TraversalTimeScale;
  readonly occupancy: OccupancySeries;
  readonly lanes: TraversalLaneModel;
  readonly depth: TraversalDepthModel;
  readonly offers: TraversalOfferModel;
  /**
   * Plottable events whose `at` could not be read as an instant. Counted, never placed: a mark at a
   * guessed time is a claim about ordering the trace did not make.
   */
  readonly undatable: number;
}

export function buildTraversalSpine(
  replay: TraversalReplayPayload,
  config: TraversalTimeConfig = TRAVERSAL_TIME_DEFAULTS,
): TraversalSpineModel {
  const dated: { event: TraversalEventEnvelope; atMs: number; strength: ReadStrength }[] = [];
  let undatable = 0;

  for (const event of replay.events) {
    const strength = strengthOf(event);
    if (strength === null) continue;
    const atMs = Date.parse(event.at);
    if (Number.isNaN(atMs)) {
      undatable += 1;
      continue;
    }
    dated.push({ event, atMs, strength });
  }

  // Chronological, and stably so: two events inside the same millisecond keep the order the trace
  // recorded them in, which is the only ordering evidence there is at that resolution.
  dated.sort((a, b) => a.atMs - b.atMs);

  // The axis spans EVERY instant the picture places, not only the marks — see the header. The density
  // weighting counts them too, which is right: a burst of subagent spawns is activity, and a run that
  // holds one is not the same as an idle span.
  const scale = buildTraversalTimeScale(
    [...dated.map((item) => item.atMs), ...laneInstants(replay.events), ...offerInstants(replay.events)],
    config,
  );

  const depth = computeTraversalDepth(replay.events);

  const marks: TraversalMark[] = dated.map((item, index) => ({
    id: identityOf(item.event, index),
    atMs: item.atMs,
    strength: item.strength,
    y: yAt(scale, item.atMs),
    depth: visitDepth(depth, item.event),
    label: labelOf(item.event),
    nodeId: nodeIdOf(item.event),
  }));

  const edges: TraversalEdge[] = [];
  for (let index = 1; index < marks.length; index += 1) {
    const from = marks[index - 1] as TraversalMark;
    const to = marks[index] as TraversalMark;
    edges.push({
      id: `${from.id}->${to.id}`,
      fromY: from.y,
      toY: to.y,
      fromDepth: from.depth,
      toDepth: to.depth,
      strength: to.strength,
      atMs: to.atMs,
    });
  }

  return {
    marks,
    edges,
    scale,
    occupancy: buildOccupancySeries(replay.events, replay.sessionId),
    lanes: buildTraversalLanes(replay.events, scale),
    depth,
    offers: buildTraversalOffers(replay.events, replay.decisionPoints, scale),
    undatable,
  };
}

/** A search has no visit identity and therefore no parent link — it sits on the spine, at depth 0. */
function visitDepth(depth: TraversalDepthModel, event: TraversalEventEnvelope): number {
  if (event.kind !== 'front_matter_read' && event.kind !== 'full_payload_read') return 0;
  return drawnDepth(depth, event.visitId);
}

/** `null` for an event this increment does not plot as a mark. */
function strengthOf(event: TraversalEventEnvelope): ReadStrength | null {
  switch (event.kind) {
    case 'full_payload_read':
      return 'full';
    case 'front_matter_read':
      return 'front-matter';
    case 'search':
      return 'search';
    default:
      return null;
  }
}

function identityOf(event: TraversalEventEnvelope, index: number): string {
  if (event.kind === 'search') return `${event.searchId}#${index}`;
  if (event.kind === 'full_payload_read' || event.kind === 'front_matter_read') {
    return `${event.visitId}#${index}`;
  }
  return `${event.eventId}#${index}`;
}

/** The artifact a visit read. `null` for a search — it reads no single node, so it has no depth. */
function nodeIdOf(event: TraversalEventEnvelope): string | null {
  if (event.kind === 'full_payload_read' || event.kind === 'front_matter_read') return event.nodeId;
  return null;
}

function labelOf(event: TraversalEventEnvelope): string {
  if (event.kind === 'search') return `search · ${event.operation}`;
  if (event.kind === 'full_payload_read') return `${event.nodeId} · full payload`;
  if (event.kind === 'front_matter_read') return `${event.nodeId} · front matter only`;
  return event.kind;
}
