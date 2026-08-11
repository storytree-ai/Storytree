// The subagent LANES (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`).
//
// The signed design: "Parent and subagents occupy linked lanes. A child receives a payload from the
// parent, runs an independent context window and inner loop, then returns a result to the parent" —
// and, from the branching clause, "two branches advance at the same time only when work genuinely ran
// in parallel, which in practice means spawned subagents".
//
// WHAT A LANE IS DRAWN FROM, and it is one decision worth stating plainly: the parent's own
// `spawn_handoff` / `result_return` PAIR, and nothing else. The child's steps live in a DIFFERENT trace
// file — `childSessionId` is its own session id under `~/.storytree/traces`, and this replay payload is
// single-session. So the band spans the interval the parent observed the child to be running, and the
// lane deliberately carries NO child marks: reaching for the child's file would be a second read whose
// absence (a child that never wrote a trace, an `--real` leaf whose slice was never captured) would
// have to render as its own gap. The parent's observation is complete on its own terms; an interior
// drawn from a file that may not exist would not be. The lane says so on its own label.
//
// THE PAIRING IS `edgeId`, never proximity (ADR-0235 clause 3 in spirit): a handoff and a return are
// the same lane because they carry the same edge id. Two honest gaps follow and are both COUNTED:
//   • a handoff with no return — the lane is OPEN, drawn to the end of the axis, never closed at a
//     guessed instant. That is a subagent still running when the trace ended, or one whose return was
//     never recorded, and the two are not distinguishable from here;
//   • a return with no handoff — nothing to draw a band from (no start), so it is reported rather than
//     silently dropped.
//
// CONCURRENCY IS MEASURED, NOT ASSUMED. Lanes are packed into columns by interval overlap, so two
// children that genuinely overlapped get two columns and two that ran back-to-back SHARE one. A picture
// that gave every child its own column would claim parallelism the trace never recorded.

import type { TraversalEventEnvelope, TraversalSpawnHandoffEvent } from '../types';
import { yAt, type TraversalTimeScale } from './traversalTime';

export interface TraversalLane {
  /** The pairing key. Also the lane's identity in the render. */
  readonly edgeId: string;
  readonly childSessionId: string;
  /** A stable agent TYPE — what colour and icon identify. Never an individual instance. */
  readonly agentType: string;
  /** The model this lane ran on. `null` is UNRECORDED and must render as such — never a default. */
  readonly model: string | null;
  readonly runtime: string | null;
  readonly startMs: number;
  /** `null` when no `result_return` carried this edge id: the lane is open, not closed at a guess. */
  readonly endMs: number | null;
  /** `null` on an open lane — an unreturned child has no verdict, which is not the same as a failure. */
  readonly ok: boolean | null;
  readonly payloadTokenCount: number | null;
  readonly resultTokenCount: number | null;
  /** The column this lane was packed into. Two lanes share one only if they never overlapped. */
  readonly column: number;
  readonly y0: number;
  readonly y1: number;
}

export interface TraversalLaneModel {
  readonly lanes: readonly TraversalLane[];
  /** How many columns the packing needed — the render's own width budget reads this. */
  readonly columnCount: number;
  /** `result_return`s naming an edge no handoff in this trace opened. Reported, never dropped. */
  readonly unpairedReturns: number;
  /** Handoffs whose `at` could not be read as an instant: a band at a guessed row is a fiction. */
  readonly undatable: number;
  /** Lanes with no recorded return — the count behind the OPEN bands. */
  readonly openLanes: number;
  /** Distinct agent types present, sorted — the colour assignment's stable domain. */
  readonly agentTypes: readonly string[];
}

const EMPTY: TraversalLaneModel = {
  lanes: [],
  columnCount: 0,
  unpairedReturns: 0,
  undatable: 0,
  openLanes: 0,
  agentTypes: [],
};

/** Every instant a lane is drawn at, so the axis can be built to COVER what the picture will show. */
export function laneInstants(events: readonly TraversalEventEnvelope[]): number[] {
  const out: number[] = [];
  for (const event of events) {
    if (event.kind !== 'spawn_handoff' && event.kind !== 'result_return') continue;
    const atMs = Date.parse(event.at);
    if (!Number.isNaN(atMs)) out.push(atMs);
  }
  return out;
}

export function buildTraversalLanes(
  events: readonly TraversalEventEnvelope[],
  scale: TraversalTimeScale,
): TraversalLaneModel {
  const handoffs: { event: TraversalSpawnHandoffEvent; atMs: number }[] = [];
  const returnsByEdge = new Map<string, { atMs: number; ok: boolean; resultTokenCount: number | null }>();
  let undatable = 0;
  let unpairedReturns = 0;

  for (const event of events) {
    if (event.kind === 'spawn_handoff') {
      const atMs = Date.parse(event.at);
      if (Number.isNaN(atMs)) {
        undatable += 1;
        continue;
      }
      handoffs.push({ event, atMs });
    } else if (event.kind === 'result_return') {
      const atMs = Date.parse(event.at);
      if (Number.isNaN(atMs)) {
        undatable += 1;
        continue;
      }
      // First return wins. A second one naming the same edge is not a second lane, and choosing the
      // later of two would silently stretch the band past the first observed close.
      if (!returnsByEdge.has(event.edgeId)) {
        returnsByEdge.set(event.edgeId, {
          atMs,
          ok: event.ok,
          resultTokenCount: event.resultTokenCount ?? null,
        });
      }
    }
  }

  if (handoffs.length === 0) {
    // Every return is unpaired when nothing opened a lane — reported, so a trace holding only returns
    // does not read as a trace holding no lane events at all.
    return { ...EMPTY, unpairedReturns: returnsByEdge.size, undatable };
  }

  const openedEdges = new Set(handoffs.map((item) => item.event.edgeId));
  for (const edgeId of returnsByEdge.keys()) {
    if (!openedEdges.has(edgeId)) unpairedReturns += 1;
  }

  handoffs.sort((a, b) => a.atMs - b.atMs);

  // Column packing. Each column holds lanes that never overlapped each other, so a column is a
  // sequential track and two columns are a genuine claim of concurrency.
  const columns: { startMs: number; endMs: number }[][] = [];
  const lanes: TraversalLane[] = [];
  let openLanes = 0;

  for (const { event, atMs } of handoffs) {
    const closed = returnsByEdge.get(event.edgeId);
    const endMs = closed?.atMs ?? null;
    if (endMs === null) openLanes += 1;
    // An open lane runs to the end of the axis. `scale.endMs` is the last thing the trace recorded at
    // all, which is exactly as far as the observation goes — never further.
    const span = { startMs: atMs, endMs: Math.max(atMs, endMs ?? scale.endMs) };

    let column = columns.findIndex((held) => held.every((other) => !concurrent(span, other)));
    if (column === -1) {
      column = columns.length;
      columns.push([]);
    }
    (columns[column] as { startMs: number; endMs: number }[]).push(span);

    lanes.push({
      edgeId: event.edgeId,
      childSessionId: event.childSessionId,
      agentType: event.agentType,
      model: event.model ?? null,
      runtime: event.runtime ?? null,
      startMs: atMs,
      endMs,
      ok: closed?.ok ?? null,
      payloadTokenCount: event.payloadTokenCount ?? null,
      resultTokenCount: closed?.resultTokenCount ?? null,
      column,
      y0: yAt(scale, span.startMs),
      y1: yAt(scale, span.endMs),
    });
  }

  return {
    lanes,
    columnCount: columns.length,
    unpairedReturns,
    undatable,
    openLanes,
    agentTypes: [...new Set(lanes.map((lane) => lane.agentType))].sort(),
  };
}

/**
 * Did these two lanes genuinely run at the same time?
 *
 * Closed intervals overlap, with ONE carve-out: a lane that ends exactly as the next begins, both
 * having real duration, is a sequential handoff and not concurrency. Without the carve-out every
 * back-to-back pair would claim parallelism; without the closed-interval rule two subagents spawned
 * inside the SAME MILLISECOND — which is the ordinary shape of a `--real` build leaf pair, both
 * recorded retrospectively at one instant — would collapse into one column and read as sequential.
 */
function concurrent(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  if (a.endMs <= b.startMs && a.endMs > a.startMs) return false;
  if (b.endMs <= a.startMs && b.endMs > b.startMs) return false;
  return true;
}
