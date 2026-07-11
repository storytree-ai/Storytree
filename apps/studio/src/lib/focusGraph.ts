/**
 * focusGraph — the pure adjacency + dagre-layout heart of the Library focus subgraph (ADR-0185
 * dec 3, increment 3 of the library-tech-tree-overlay story).
 *
 * `buildFocusGraph({ centre, assets, docs, depth })` walks `GuidanceAsset.references` BOTH ways
 * over the already-loaded corpus, centred on the finder's lifted selection:
 *
 *   - **upstream** ("stands on") of a node = that node's OWN `references` (asset-only — `DocMeta`
 *     carries no `references`, so an ADR centre's upstream fan is always empty, trap m).
 *   - **downstream** ("stood on by") of a node = the reverse index — every asset whose
 *     `references` points AT that node's id.
 *
 * Each reference is a prefixed pointer (`"asset:<id>"` or `"doc:<relpath>"`); the prefix is
 * stripped before resolving the target id. The walk is breadth-first, bounded by `depth` hops in
 * each direction independently, starting fresh from the centre each time (no fetch — reads only
 * the `assets`/`docs` handed in).
 *
 * The included node set is then laid out with `@dagrejs/dagre` (`rankdir: 'LR'`) — an edge is
 * added `(referenced -> referencer)` for every in-scope reference, so the referenced (more
 * upstream) node always ranks left of the referencer, and the centre naturally settles between
 * its upstream fan (left) and its downstream fan (right).
 */

import dagre from '@dagrejs/dagre';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** Which side of the centre a node sits on. */
export type FocusNodeSide = 'centre' | 'upstream' | 'downstream';

/** One laid-out node in the focus subgraph. */
export interface FocusNode {
  id: string;
  title: string;
  category: AssetCategory;
  source: 'asset' | 'doc';
  side: FocusNodeSide;
  /** Whether this node is part of the centre's traversed reference chain (always true for a
   *  node buildFocusGraph returns — a caller-side fan cap may still hide it behind a cluster). */
  onChain: boolean;
  /** `plan`-kind nodes are ephemeral (a disposable, git-anchored choreography). */
  ephemeral: boolean;
  x: number;
  y: number;
}

/** One directed reference edge, already resolved to in-scope node ids. */
export interface FocusEdge {
  from: string;
  to: string;
}

export interface FocusGraphResult {
  nodes: FocusNode[];
  edges: FocusEdge[];
}

export interface BuildFocusGraphArgs {
  centre: SearchResult;
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** Hop count, applied independently to the upstream walk and the downstream walk. */
  depth: number;
}

const REF_PREFIXES = ['asset:', 'doc:'] as const;

/** Strips a `"asset:<id>"` / `"doc:<relpath>"` pointer down to the bare target id. */
function resolveRef(ref: string): string {
  for (const prefix of REF_PREFIXES) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

const FOCUS_NODE_WIDTH = 160;
const FOCUS_NODE_HEIGHT = 54;

/** Builds the dagre rankdir-LR neighbourhood over `references[]`, centred on `centre`. */
export function buildFocusGraph({ centre, assets, docs, depth }: BuildFocusGraphArgs): FocusGraphResult {
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

  const boundedDepth = Math.max(0, depth);

  // Upstream walk: the centre's own references, then their own references, etc.
  let upstreamFrontier = [centre.id];
  for (let hop = 0; hop < boundedDepth && upstreamFrontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of upstreamFrontier) {
      for (const upId of referencesOf(id)) {
        if (includedIds.has(upId)) continue;
        const meta = metaFor(upId);
        if (!meta) continue;
        includedIds.add(upId);
        sideOf.set(upId, 'upstream');
        metaOf.set(upId, meta);
        next.push(upId);
      }
    }
    upstreamFrontier = next;
  }

  // Downstream walk: every asset referencing the centre, then every asset referencing those, etc.
  let downstreamFrontier = [centre.id];
  for (let hop = 0; hop < boundedDepth && downstreamFrontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of downstreamFrontier) {
      for (const downId of downstreamOf.get(id) ?? []) {
        if (includedIds.has(downId)) continue;
        const meta = metaFor(downId);
        if (!meta) continue;
        includedIds.add(downId);
        sideOf.set(downId, 'downstream');
        metaOf.set(downId, meta);
        next.push(downId);
      }
    }
    downstreamFrontier = next;
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

  return { nodes, edges };
}
