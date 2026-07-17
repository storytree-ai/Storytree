/**
 * focusGraph — the pure adjacency + dagre-layout heart of the Library focus DAG canvas (ADR-0188
 * dec 5, the library-dag-canvas capability — the brownfield rework of the inc-3 focus subgraph,
 * ADR-0185 dec 3).
 *
 * `buildFocusGraph({ centre, assets, docs, expanded })` walks `GuidanceAsset.references` BOTH ways
 * over the already-loaded corpus, centred on the finder's lifted selection, to ONE level in each
 * direction only (ADR-0193 dec 3, reversing ADR-0188 dec 5's full transitive walk; no `depth` param
 * — deeper nodes are reached by click-through re-centring, not by this walk):
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

export const FOCUS_NODE_WIDTH = 210;
export const FOCUS_NODE_HEIGHT = 66;

/** Reserved slack added to the RIGHT of the laid-out bbox (downstream side only — `minX` is never
 *  touched) so the rightmost "stood on by" column is never occluded by the pinned selection card;
 *  paired with `preserveAspectRatio="xMinYMid meet"` in the component to anchor the DAG left. */
export const RIGHT_GUTTER = 56;

/** Builds the dagre rankdir-LR one-level-each-way DAG over `references[]`, centred on `centre`. */
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

  // ONE level each way only (ADR-0193 dec 3, reversing ADR-0188 dec 5's full transitive walk):
  // a single hop from the centre in each direction, never a further BFS iteration. Deeper nodes
  // are reached by click-through re-centring, not by this walk.
  expandFrontier([centre.id], referencesOf, 'upstream');
  expandFrontier([centre.id], (id) => downstreamOf.get(id) ?? [], 'downstream');

  const graph = new dagre.graphlib.Graph();
  // Wider ranks so the border-anchored bezier edges + arrowheads have room to read (the vine idiom).
  graph.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 120, marginx: 16, marginy: 16 });
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
    // Reserve a right gutter so the downstream column clears the pinned selection card. Grows
    // width ONLY (minX/minY/height unchanged) — every node CENTRE stays inside the viewBox.
    width: rawMaxX - rawMinX + RIGHT_GUTTER,
    height: rawMaxY - rawMinY,
  };

  const collapsed: FocusCollapsedGroup[] = [...collapsedByParent.entries()].map(
    ([parentId, hiddenIds]) => ({ parentId, hiddenIds }),
  );

  return { nodes, edges, collapsed, bbox };
}

/** The minimum viewBox window (user units) — a zoom CAP. `fitViewBox` never shrinks below this, so
 *  a small graph (or a lone node with no references) renders at a natural, consistent size instead of
 *  being blown up to fill the canvas; only a graph LARGER than this scales down to fit. Chosen to
 *  frame ~5 node-widths across, so a single 210-wide plaque reads as a normal node, never a poster. */
export const MIN_VIEW_WIDTH = 1080;
export const MIN_VIEW_HEIGHT = 620;

/**
 * The fit-to-view rectangle: the laid-out `bbox`, but never smaller than `MIN_VIEW_WIDTH ×
 * MIN_VIEW_HEIGHT` — the shortfall is padded symmetrically around the content's centre. This caps the
 * maximum zoom so the on-screen node size stays consistent across selections (a small graph no longer
 * scales up to fill the viewport); a graph bigger than the minimum is returned unchanged and still
 * fits-to-view. Every node centre stays inside the returned rect (padding only grows it).
 */
export function fitViewBox(
  bbox: FocusBBox,
  minW = MIN_VIEW_WIDTH,
  minH = MIN_VIEW_HEIGHT,
): FocusBBox {
  const width = Math.max(bbox.width, minW);
  const height = Math.max(bbox.height, minH);
  return {
    minX: bbox.minX - (width - bbox.width) / 2,
    minY: bbox.minY - (height - bbox.height) / 2,
    width,
    height,
  };
}

/** How many characters a title line carries before wrapping — ~(FOCUS_NODE_WIDTH − 2×12 pad) at the
 *  12.5px/600 title face (~6.6px/char). One tunable knob; the wrap is a pure char estimate, not DOM
 *  measurement, so it stays test-friendly. */
export const TITLE_CHARS_PER_LINE = 27;
const TITLE_MAX_LINES = 2;

/** Clip `s` to fit `maxChars` INCLUDING a trailing ellipsis, trimming dangling punctuation first. */
function ellipsize(s: string, maxChars: number): string {
  return s.slice(0, Math.max(1, maxChars - 1)).replace(/[\s.,;:—-]+$/, '') + '…';
}

/**
 * Greedy word-wrap `text` into at most `maxLines` lines of ~`maxChars` each, ellipsising the last
 * kept line when content is dropped (or a lone over-long word overruns a line). Keeps the id-forward
 * prefix (e.g. "ADR-0018:") on line 1. Pure — no DOM, safe to unit-test in a node env.
 */
export function wrapTitle(
  text: string,
  maxChars = TITLE_CHARS_PER_LINE,
  maxLines = TITLE_MAX_LINES,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  // 1) greedy-wrap into as many lines as the words need (a lone word wider than a line gets its own).
  const all: string[] = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxChars || cur === '') cur = cand;
    else {
      all.push(cur);
      cur = w;
    }
  }
  if (cur) all.push(cur);

  // 2) clamp to the line budget; ellipsise the last kept line only when something was dropped.
  if (all.length > maxLines) {
    const kept = all.slice(0, maxLines);
    const last = kept[maxLines - 1];
    if (last !== undefined) kept[maxLines - 1] = ellipsize(last, maxChars);
    return kept;
  }
  // within budget: only a lone-word line that itself overflows needs a hard clip.
  return all.map((ln) => (ln.length > maxChars ? ellipsize(ln, maxChars) : ln));
}

/**
 * A border-anchored cubic-bezier path from the RIGHT edge of the (upstream, left) referenced node to
 * the LEFT edge of the (downstream, right) referencer node, with horizontal control handles so the
 * curve leaves/enters level (the arrow tangent stays horizontal) and lives entirely in the rank gap
 * — never tunnelling under a plaque. `from`/`to` are node CENTRES (dagre positions).
 */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x + FOCUS_NODE_WIDTH / 2;
  const y1 = from.y;
  const x2 = to.x - FOCUS_NODE_WIDTH / 2;
  const y2 = to.y;
  const dx = Math.max(28, (x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

/** One faint swimlane band — full-height ground behind a side's column. */
export interface FocusSwimlane {
  x: number;
  width: number;
}

/** The two "stands on" (left) / "stood on by" (right) grounds; a side is `null` when it has no fan. */
export interface FocusSwimlanes {
  left: FocusSwimlane | null;
  right: FocusSwimlane | null;
}

/**
 * The two swimlane grounds framing the centre: the left band spans `[bbox.minX, midpoint(rightmost
 * upstream centre, centre)]`, the right band spans `[midpoint(centre, leftmost downstream centre),
 * bbox.maxX]` — leaving the centre column on neutral ground between them. A side with no neighbours
 * yields `null` (no band drawn). Pure geometry over the laid-out nodes + bbox.
 */
export function focusSwimlanes(nodes: FocusNode[], bbox: FocusBBox): FocusSwimlanes {
  const centre = nodes.find((n) => n.side === 'centre');
  if (!centre) return { left: null, right: null };

  const minX = bbox.minX;
  const maxX = bbox.minX + bbox.width;
  const upstream = nodes.filter((n) => n.side === 'upstream');
  const downstream = nodes.filter((n) => n.side === 'downstream');

  let left: FocusSwimlane | null = null;
  let right: FocusSwimlane | null = null;
  if (upstream.length > 0) {
    const boundary = (Math.max(...upstream.map((n) => n.x)) + centre.x) / 2;
    left = { x: minX, width: boundary - minX };
  }
  if (downstream.length > 0) {
    const boundary = (centre.x + Math.min(...downstream.map((n) => n.x))) / 2;
    right = { x: boundary, width: maxX - boundary };
  }
  return { left, right };
}
