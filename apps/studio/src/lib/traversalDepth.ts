// DEPTH into the Library DAG (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`).
//
// The signed clause, narrowed 2026-07-27 and quoted because the narrowing is the whole rule:
// "Depth into the Library DAG is the axis that moves both ways: a descent indents, a return to a
// shallower node comes back. This requires deterministic `parentVisitId`, and nothing else … Where
// parent links are absent the traversal honestly renders as a single column rather than an inferred
// tree."
//
// So this module resolves depth from exactly one field and refuses every other source. Concretely, the
// three things it will not do, each of which would draw a tree the trace did not record:
//   • it never infers a parent from ORDER — the visit before this one is not its parent;
//   • it never infers a parent from TIME — proximity is not containment (ADR-0235 clause 3);
//   • it never infers a parent from the node GRAPH — that two artifacts cite each other says nothing
//     about whether this session descended one from the other.
//
// A `parentVisitId` naming a visit this trace does not contain resolves to depth 0 and is COUNTED. That
// is the case a tolerant reader hits on a partial trace (ADR-0241 D5) and on a chain whose head was
// captured before the field had a producer: the link is real, its target is simply not here, and
// indenting on it would put a child under a parent nobody can point to.
//
// The whole-trace consequence is the honest default: a trace where nothing carries the field yields
// every depth 0, which is the SINGLE COLUMN the design requires — not a degraded tree.

import type { TraversalEventEnvelope, TraversalVisitEvent } from '../types';

export interface TraversalDepthModel {
  /** Depth per visit id. A visit absent from this map is depth 0 by construction. */
  readonly depthByVisitId: ReadonlyMap<string, number>;
  /** The deepest resolved depth. `0` means SINGLE COLUMN — the design's honest default. */
  readonly maxDepth: number;
  /** Visits that resolved to depth > 0 — the evidence any indentation at all is drawn from. */
  readonly linkedVisits: number;
  /** `parentVisitId`s naming a visit this trace does not contain. Counted, never inferred around. */
  readonly unresolvedParents: number;
  /** Parent chains that closed on themselves. Depth 0 for every member; a cycle is not a descent. */
  readonly cyclicParents: number;
}

/** How deep the picture will indent, however deep the data goes. See `TRAVERSAL_MAX_DRAWN_DEPTH`. */
export const TRAVERSAL_MAX_DRAWN_DEPTH = 4;

export function computeTraversalDepth(events: readonly TraversalEventEnvelope[]): TraversalDepthModel {
  const visitsById = new Map<string, TraversalVisitEvent>();
  for (const event of events) {
    if (event.kind === 'front_matter_read' || event.kind === 'full_payload_read') {
      // First writer wins: a duplicate visit id is a reader-level anomaly the sink already reports as
      // `skipped`, and re-pointing the id at the later event would silently re-parent a subtree.
      if (!visitsById.has(event.visitId)) visitsById.set(event.visitId, event);
    }
  }

  const depthByVisitId = new Map<string, number>();
  let unresolvedParents = 0;
  let cyclicParents = 0;

  // The walk is ITERATIVE and resolves a whole chain at once, rather than recursing and assigning on
  // the way back out. That is not a style choice: a cycle discovered mid-unwind would have every
  // member above it already assigned a depth off the zero the guard returned, so the cycle would end
  // up indented by exactly the distance it was long. Collecting the chain first means a cycle can
  // poison all of its own members before anything is written.
  const depthOf = (startId: string): number => {
    const chain: string[] = [];
    const onChain = new Set<string>();
    let cursor: string = startId;
    // The depth the DEEPEST member of the chain will take. It is 0 when the walk stopped on a root or
    // on a link with nothing to resolve onto, and parentDepth + 1 when it stopped on a known parent.
    let deepest = 0;

    for (;;) {
      const cached = depthByVisitId.get(cursor);
      if (cached !== undefined) {
        deepest = cached + 1;
        break;
      }
      if (onChain.has(cursor)) {
        // Closed on itself. Every member gets depth 0 — a cycle is not a descent, and electing one of
        // them as the root would invent the very containment this refuses to infer.
        for (const member of chain) {
          depthByVisitId.set(member, 0);
          cyclicParents += 1;
        }
        return 0;
      }

      const visit = visitsById.get(cursor);
      if (visit === undefined) break;
      chain.push(cursor);
      onChain.add(cursor);

      const parentId = visit.parentVisitId;
      // A root: nothing to descend from, so this member sits on the spine.
      if (parentId === undefined || parentId === '') break;
      if (!visitsById.has(parentId)) {
        // The link is real and its target is not here. Same answer as a root — never an indentation
        // under a parent nobody can point at.
        unresolvedParents += 1;
        break;
      }
      cursor = parentId;
    }

    // `chain` runs child → … → deepest-resolved. Depths count outward from that end.
    for (let index = 0; index < chain.length; index += 1) {
      const member = chain[index] as string;
      if (depthByVisitId.has(member)) continue;
      depthByVisitId.set(member, deepest + (chain.length - 1 - index));
    }
    return depthByVisitId.get(startId) ?? 0;
  };

  for (const visitId of visitsById.keys()) depthOf(visitId);

  let maxDepth = 0;
  let linkedVisits = 0;
  for (const depth of depthByVisitId.values()) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > 0) linkedVisits += 1;
  }

  return { depthByVisitId, maxDepth, linkedVisits, unresolvedParents, cyclicParents };
}

/**
 * The depth a visit is DRAWN at: its resolved depth, clamped to what the panel's width can hold.
 *
 * Clamping is a display choice and it is stated as one — a deeper descent stacks at the last column
 * rather than running off the block, and the render reports the trace's real `maxDepth` beside the
 * picture so nobody reads the clamp as the data's ceiling.
 */
export function drawnDepth(model: TraversalDepthModel, visitId: string): number {
  return Math.min(TRAVERSAL_MAX_DRAWN_DEPTH, model.depthByVisitId.get(visitId) ?? 0);
}
