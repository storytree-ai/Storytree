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
// WHAT IS DELIBERATELY NOT DRAWN, counted rather than silently dropped so the panel can say what it is
// holding back and no reader mistakes an absence here for an absence in the trace:
//   • `spawn_handoff` / `result_return` — the linked parent/child lanes, and the per-lane model badge
//     that PR #1272 gave them a field for. That is `traversal-panel-lanes-and-depth`.
//   • `candidate_set` / `followed_edge` — the offer fans, which under ADR-0312 may only be drawn with
//     their raw `M of N` observability denominator. Same next increment.
//   • `parentVisitId` depth indentation. Same next increment. Until then the traversal renders as a
//     SINGLE COLUMN, which the design explicitly requires where parent links are not being resolved —
//     an inferred tree is the one thing the honesty clause forbids.
//   • revisit loop-backs, at any point, by decision (revision clause 4): the animation carries
//     branching, and the link stays answerable by query.

import type { TraversalEventEnvelope, TraversalReplayPayload } from '../types';
import { buildOccupancySeries, type OccupancySeries } from './traversalOccupancy';
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
  /** What an operator hovers to see. Identity only — a node id or a search operation, never content. */
  readonly label: string;
}

export interface TraversalEdge {
  readonly id: string;
  readonly fromY: number;
  readonly toY: number;
  /** The TARGET's read strength: an edge's weight is what the step it led to actually pulled. */
  readonly strength: ReadStrength;
  /** The instant the edge completes, so the playhead reveals it exactly when the target appears. */
  readonly atMs: number;
}

/** Events the spine holds but does not draw, each named by what draws it instead. */
export interface DeferredCounts {
  /** `spawn_handoff` + `result_return` — the lanes. */
  readonly laneEdges: number;
  /** `candidate_set` + `followed_edge` — the offer fans. */
  readonly offers: number;
}

export interface TraversalSpineModel {
  readonly marks: readonly TraversalMark[];
  readonly edges: readonly TraversalEdge[];
  readonly scale: TraversalTimeScale;
  readonly occupancy: OccupancySeries;
  readonly deferred: DeferredCounts;
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
  let laneEdges = 0;
  let offers = 0;

  for (const event of replay.events) {
    const strength = strengthOf(event);
    if (strength === null) {
      if (event.kind === 'spawn_handoff' || event.kind === 'result_return') laneEdges += 1;
      else if (event.kind === 'candidate_set' || event.kind === 'followed_edge') offers += 1;
      continue;
    }
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

  const scale = buildTraversalTimeScale(
    dated.map((item) => item.atMs),
    config,
  );

  const marks: TraversalMark[] = dated.map((item, index) => ({
    id: identityOf(item.event, index),
    atMs: item.atMs,
    strength: item.strength,
    y: yAt(scale, item.atMs),
    label: labelOf(item.event),
  }));

  const edges: TraversalEdge[] = [];
  for (let index = 1; index < marks.length; index += 1) {
    const from = marks[index - 1] as TraversalMark;
    const to = marks[index] as TraversalMark;
    edges.push({ id: `${from.id}->${to.id}`, fromY: from.y, toY: to.y, strength: to.strength, atMs: to.atMs });
  }

  return {
    marks,
    edges,
    scale,
    occupancy: buildOccupancySeries(replay.events, replay.sessionId),
    deferred: { laneEdges, offers },
    undatable,
  };
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

function labelOf(event: TraversalEventEnvelope): string {
  if (event.kind === 'search') return `search · ${event.operation}`;
  if (event.kind === 'full_payload_read') return `${event.nodeId} · full payload`;
  if (event.kind === 'front_matter_read') return `${event.nodeId} · front matter only`;
  return event.kind;
}
