// neighbourHighlight — the pure selection selector behind ADR-0242: given the routed
// trail network and the SELECTED story, which trail segments are on that story's own
// edges, and which islands are its immediate upstream / downstream neighbours.
//
// Why this exists: ADR-0169 deliberately MERGES routes — a reuse discount pulls later
// edges onto existing trails and shared docks fold a fan of approaches into one road —
// which is what makes the map read as a road network and what makes a single story's own
// connections unreadable. The lit lane (the DOM half, in SceneView + index.css) paints a
// narrower stroke on top of the incident segments so the shared trunk keeps a rim of road
// either side of it.
//
// Two properties are load-bearing and are pinned in the test:
//   • A trunk the selection SHARES with a stranger's edge is still lit — the road really
//     is on the selection's route. The honesty comes from the lane being narrower than
//     the road, not from withholding the light.
//   • A segment reachable only through a non-incident edge is NOT lit, and the reading is
//     fenced at ONE hop — this is not the retired transitive ancestor/descendant closure
//     (`trailRevealPlan`), which repainted the world and was pulled for it.
//
// Pure and deterministic (no DOM, no time, no store): the plan is a subset of REAL edges,
// never invented — the ADR-0169 §5 honesty invariant holds by construction.

import type { TrailNetwork } from '@storytree/forest-world';

/** One step of a {@link NeighbourRoute}: a segment, and which way travel runs along it. */
export interface NeighbourRouteStep {
  /** Trail segment id. */
  id: string;
  /** True when travel runs ALONG the segment's drawn path, false when against it. */
  forward: boolean;
}

/**
 * One incident edge as a TRAVERSABLE route rather than a bag of segments.
 *
 * The segment SET (`litSegmentIds`) is enough to paint a lane on, and was all ADR-0242
 * needed. It is NOT enough to lay a lane out or to animate one: a segment is an artefact of
 * the routing merge, invisible to a reader, so anything decided per segment — a lane's
 * offset, which side it rides, when it starts drawing — surfaces as an artefact at a
 * junction. Keeping the ORDER lets a consumer treat an edge as one continuous path from
 * island to island, which is what the lane layout and the one-line draw-on both need.
 *
 * `steps` is in DEPENDENCY order — from the story stood on toward the story standing on it.
 * That is already the order `edge.segments` is stored in (the chain runs `from → to`, and
 * `from` is the dependency), so this costs nothing to preserve.
 */
export interface NeighbourRoute {
  /** `up` — arrives at the selection from a story it stands on. `down` — leaves the
   *  selection for a story that stands on it. */
  dir: 'up' | 'down';
  /** The neighbour island at the far end of this route. */
  other: string;
  /** The chain in dependency order. Never empty. */
  steps: readonly NeighbourRouteStep[];
}

export interface NeighbourHighlightPlan {
  /** The selected story this plan was built for. */
  selectedId: string;
  /** Lit segment ids, sorted — deduped, so a trunk two incident edges share appears once. */
  litSegmentIds: readonly string[];
  /** Membership view of {@link litSegmentIds} for the per-node render lookup. */
  litSegments: ReadonlySet<string>;
  /** Stories the selection STANDS ON (`edge.from` where `edge.to` is the selection), sorted. */
  upstreamIds: readonly string[];
  /** Stories that STAND ON the selection (`edge.to` where `edge.from` is the selection), sorted. */
  downstreamIds: readonly string[];
  upstream: ReadonlySet<string>;
  downstream: ReadonlySet<string>;
  /** The incident edges as ordered, traversable routes — see {@link NeighbourRoute}.
   *  Sorted by direction then neighbour id, so the layout it feeds is deterministic. */
  routes: readonly NeighbourRoute[];
}

const sorted = (ids: Iterable<string>): string[] =>
  [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Build the one-hop highlight plan for the selected island. Returns null only when there
 * is nothing selected (or no network); a selected island with NO incident edges still
 * yields a plan with empty sets, so the surface can light its own shore without a
 * special case.
 *
 * An edge `from → to` means "`to` depends on `from`" (the title TreeView stamps on every
 * routed edge), so `from` is the dependency and `to` the dependent. A self-edge is never
 * a neighbour of itself — `routeTrails` already folds those away, and the guard here
 * keeps the selector honest against any caller that does not.
 */
export function neighbourHighlightPlan(
  network: TrailNetwork | null | undefined,
  selectedId: string | null | undefined,
): NeighbourHighlightPlan | null {
  if (!network || !selectedId) return null;
  const lit = new Set<string>();
  const upstream = new Set<string>();
  const downstream = new Set<string>();
  const routes: NeighbourRoute[] = [];

  for (const edge of network.edges) {
    if (edge.from === edge.to) continue; // nothing distinct to draw, and never its own neighbour
    const isDependency = edge.to === selectedId; // the selection stands on `edge.from`
    const isDependent = edge.from === selectedId; // `edge.to` stands on the selection
    if (!isDependency && !isDependent) continue;
    if (isDependency) upstream.add(edge.from);
    if (isDependent) downstream.add(edge.to);
    for (const ref of edge.segments) lit.add(ref.id);
    // The chain is stored `from → to`, i.e. dependency → dependent, which IS the direction
    // the dependency points — so travel order is the stored order, with no per-edge special
    // case for which side of the edge the selection happens to sit on. `reversed` means the
    // segment's drawn path runs against that traversal, so `forward` is its negation.
    if (edge.segments.length > 0) {
      routes.push({
        dir: isDependency ? 'up' : 'down',
        other: isDependency ? edge.from : edge.to,
        steps: edge.segments.map((ref) => ({ id: ref.id, forward: !ref.reversed })),
      });
    }
  }

  routes.sort((a, b) =>
    a.dir !== b.dir ? (a.dir < b.dir ? -1 : 1) : a.other < b.other ? -1 : a.other > b.other ? 1 : 0,
  );

  const litSegmentIds = sorted(lit);
  const upstreamIds = sorted(upstream);
  const downstreamIds = sorted(downstream);
  return {
    selectedId,
    litSegmentIds,
    litSegments: lit,
    upstreamIds,
    downstreamIds,
    upstream,
    downstream,
    routes,
  };
}
