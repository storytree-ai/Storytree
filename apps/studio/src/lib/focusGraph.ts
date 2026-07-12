/**
 * focusGraph — the pure adjacency + dagre-layout heart of the Library focus DAG canvas (ADR-0188
 * dec 5, the library-dag-canvas capability — the brownfield rework of the inc-3 focus subgraph,
 * ADR-0185 dec 3).
 *
 * `buildFocusGraph({ centre, assets, docs, expanded })` walks `GuidanceAsset.references` BOTH ways
 * over the already-loaded corpus, centred on the finder's lifted selection, to FULL transitive
 * depth (no depth cap/param):
 *
 *   - **upstream** ("stands on") of a node = that node's OWN `references` (asset-only — `DocMeta`
 *     carries no `references`, so an ADR centre's upstream fan is always empty, trap m).
 *   - **downstream** ("stood on by") of a node = the reverse index — every asset whose
 *     `references` points AT that node's id.
 *
 * Each reference is a prefixed pointer (`"asset:<id>"` or `"doc:<relpath>"`); the prefix is
 * stripped before resolving the target id. The walk is breadth-first, unbounded in depth, starting
 * fresh from the centre each time (no fetch — reads only the `assets`/`docs` handed in).
 *
 * Breadth is tamed PER BRANCH instead: a parent whose visible next-hop neighbours (in either
 * direction) exceed `FAN_CAP` collapses the overflow — the collapsed ids are recorded per parent
 * in `collapsed`, and the optional `expanded` set of parent ids reveals a parent's full fan. This
 * keeps the walk itself pure (no `useState`/DOM) while letting the component re-layout in place as
 * branches expand.
 *
 * The included node set is then laid out with `@dagrejs/dagre` (`rankdir: 'LR'`) — an edge is
 * added `(referenced -> referencer)` for every in-scope reference, so the referenced (more
 * upstream) node always ranks left of the referencer, and the centre naturally settles between its
 * upstream fan (left) and its downstream fan (right). The laid-out node bbox is returned alongside
 * the nodes/edges so the component can compute a fit-to-view `viewBox`.
 */

import dagre from '@dagrejs/dagre';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** Which side of the centre a node sits on. */
export type FocusNodeSide = 'centre' | 'upstream' | 'downstream';

/** One laid-out node in the focus DAG. */
export interface FocusNode {
  id: string;
  title: string;
  category: AssetCategory;
  source: 'asset' | 'doc';
  side: FocusNodeSide;
  /** Whether this node is part of the centre's traversed reference chain (always true for a
   *  node buildFocusGraph returns — a collapsed branch hides a node behind `collapsed` instead). */
  onChain: boolean;
  /** `plan`-kind nodes are ephemeral (a disposable, git-anchored choreography). */
  ephemeral: boolean;
  x: number;
  y: number;
}

/** One directed reference edge, already resolved to in-scope (visible) node ids. */
export interface FocusEdge {
  from: string;
  to: string;
}

/** A parent node whose next-hop fan overflowed `FAN_CAP` and was collapsed. */
export interface FocusCollapsedGroup {
  parentId: string;
  hiddenIds: string[];
}

/** The laid-out node bbox (dagre positions are node CENTRES — the bbox extends by half a node). */
export interface FocusBBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface FocusGraphResult {
  nodes: FocusNode[];
  edges: FocusEdge[];
  collapsed: FocusCollapsedGroup[];
  bbox: FocusBBox;
}

export interface BuildFocusGraphArgs {
  centre: SearchResult;
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** Parent node ids whose collapsed fan is fully revealed. Default: none collapsed-revealed. */
  expanded?: ReadonlySet<string>;
}

const REF_PREFIXES = ['asset:', 'doc:'] as const;

/** Strips a `"asset:<id>"` / `"doc:<relpath>"` pointer down to the bare target id. */
function resolveRef(ref: string): string {
  for (const prefix of REF_PREFIXES) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

/** Per-branch fan cap: a parent past this many next-hop neighbours collapses the overflow. */
export const FAN_CAP = 6;

export const FOCUS_NODE_WIDTH = 160;
export const FOCUS_NODE_HEIGHT = 54;

/** Builds the dagre rankdir-LR full-depth DAG over `references[]`, centred on `centre`. */
export function buildFocusGraph({
  centre,
  assets,
  docs,
  expanded = new Set<string>(),
}: BuildFocusGraphArgs): FocusGraphResult {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const docById = new Map(docs.map((d) => [d.id, d]));

  function referencesOf(id: string): string[] {
    const asset = assetById.get(id);
    return asset ? asset.references.map(resolveRef) : [];
  }

  // Reverse index: target id -> the asset ids whose references point at it.
  const downstreamOf = new Map<string, string[]>();
  for (const a of assets) {
    for (const ref of a.references) {
      const target = resolveRef(ref);
      const existing = downstreamOf.get(target);
      if (existing) existing.push(a.id);
      else downstreamOf.set(target, [a.id]);
    }
  }

  interface Meta {
    title: string;
    category: AssetCategory;
    source: 'asset' | 'doc';
  }

  function metaFor(id: string): Meta | undefined {
    const asset = assetById.get(id);
    if (asset) return { title: asset.title, category: asset.category, source: 'asset' };
    const doc = docById.get(id);
    if (doc) return { title: doc.title, category: 'adr', source: 'doc' };
    return undefined;
  }

  const centreMeta: Meta = { title: centre.title, category: centre.category, source: centre.source };
  const includedIds = new Set<string>([centre.id]);
  const sideOf = new Map<string, FocusNodeSide>([[centre.id, 'centre']]);
  const metaOf = new Map<string, Meta>([[centre.id, centreMeta]]);
  const collapsedByParent = new Map<string, string[]>();

  /** Expands one BFS hop from `frontier` via `neighboursOf`, capping each parent's fan. */
  function expandFrontier(
    frontier: string[],
    neighboursOf: (id: string) => string[],
    side: FocusNodeSide,
  ): string[] {
    const next: string[] = [];
    for (const parentId of frontier) {
      const seen = new Set<string>();
      const candidates: string[] = [];
      for (const id of neighboursOf(parentId)) {
        if (seen.has(id) || includedIds.has(id) || !metaFor(id)) continue;
        seen.add(id);
        candidates.push(id);
      }
      const isExpanded = expanded.has(parentId);
      const overflow = !isExpanded && candidates.length > FAN_CAP;
      const visible = overflow ? candidates.slice(0, FAN_CAP) : candidates;
      const hidden = overflow ? candidates.slice(FAN_CAP) : [];

      if (hidden.length > 0) {
        const existing = collapsedByParent.get(parentId) ?? [];
        collapsedByParent.set(parentId, [...existing, ...hidden]);
      }

      for (const id of visible) {
        includedIds.add(id);
        sideOf.set(id, side);
        const meta = metaFor(id);
        if (meta) metaOf.set(id, meta);
        next.push(id);
      }
    }
    return next;
  }

  let upstreamFrontier = [centre.id];
  while (upstreamFrontier.length > 0) {
    upstreamFrontier = expandFrontier(upstreamFrontier, referencesOf, 'upstream');
  }

  let downstreamFrontier = [centre.id];
  while (downstreamFrontier.length > 0) {
    downstreamFrontier = expandFrontier(
      downstreamFrontier,
      (id) => downstreamOf.get(id) ?? [],
      'downstream',
    );
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 60, marginx: 8, marginy: 8 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of includedIds) {
    graph.setNode(id, { width: FOCUS_NODE_WIDTH, height: FOCUS_NODE_HEIGHT });
  }

  const edges: FocusEdge[] = [];
  for (const id of includedIds) {
    for (const ref of referencesOf(id)) {
      if (!includedIds.has(ref) || ref === id) continue;
      // The referenced node ranks left of the referencer (upstream sits left, downstream right).
      graph.setEdge(ref, id);
      edges.push({ from: ref, to: id });
    }
  }

  dagre.layout(graph);

  const nodes: FocusNode[] = [...includedIds].map((id) => {
    const meta = metaOf.get(id) ?? centreMeta;
    const pos = graph.node(id) as { x?: number; y?: number } | undefined;
    return {
      id,
      title: meta.title,
      category: meta.category,
      source: meta.source,
      side: sideOf.get(id) ?? 'centre',
      onChain: true,
      ephemeral: meta.category === 'plan',
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
    };
  });

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const rawMinX = Math.min(...xs) - FOCUS_NODE_WIDTH / 2;
  const rawMaxX = Math.max(...xs) + FOCUS_NODE_WIDTH / 2;
  const rawMinY = Math.min(...ys) - FOCUS_NODE_HEIGHT / 2;
  const rawMaxY = Math.max(...ys) + FOCUS_NODE_HEIGHT / 2;
  const bbox: FocusBBox = {
    minX: rawMinX,
    minY: rawMinY,
    width: rawMaxX - rawMinX,
    height: rawMaxY - rawMinY,
  };

  const collapsed: FocusCollapsedGroup[] = [...collapsedByParent.entries()].map(
    ([parentId, hiddenIds]) => ({ parentId, hiddenIds }),
  );

  return { nodes, edges, collapsed, bbox };
}
