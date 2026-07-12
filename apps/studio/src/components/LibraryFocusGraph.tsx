/**
 * LibraryFocusGraph — the Library focus DAG canvas, centred on the finder's lifted selection
 * (ADR-0188 dec 5, the library-dag-canvas capability — the brownfield rework of the inc-3 focus
 * subgraph, ADR-0185 dec 3, into a true layered reference DAG).
 *
 * Renders the dagre rankdir-LR `buildFocusGraph` (`../lib/focusGraph`) computes over the
 * already-loaded `assets`/`docs`, walked BOTH ways to FULL transitive depth: upstream ("stands
 * on") to the left of the centre, downstream ("stood on by") to the right — as an SVG canvas of
 * positioned nodes with DRAWN edges between rank-adjacent nodes, fit inside a bounded `viewBox`
 * computed from the laid-out bbox. Per-branch breadth is tamed by an in-place ⊕ expander (the
 * global depth stepper and the +N-more cluster chip retire with this rework).
 *
 * Each node is a two-line plaque — the title, and a muted kind line routed through `kindLabel`
 * (never a hand-rolled category → label map, ADR-0183 D1). Colour is reserved for STATE, never
 * kind: the centre + its traversed neighbours carry a `data-chain` marker, and `plan`-kind
 * (ephemeral) neighbours carry a `data-ephemeral` marker — this component asserts only the
 * markers, never a colour/stroke value (the visual treatment is operator-attested, ADR-0070).
 *
 * Selection is LIFTED, not owned: `selection` (the finder's picked result) drives the centre, and
 * clicking a neighbour re-centres by invoking `onFocus` with that neighbour's result — the canvas
 * pushes its own breadcrumb (← Back leading it) so the walk can be retraced, but the actual
 * re-centring lives with whoever holds `selection`.
 *
 * HARD COMPAT: every node keeps the `lfg-node-<id>` testid and the `onDoubleClick` → `onOpen`
 * trigger the signed `LibraryOpenTrigger.test.tsx` (`lot-*`) depends on — untouched here.
 *
 * No fetch beyond the loaded corpus — no `docContent`, no socket, no DB; only `assets`/`docs`/
 * `selection` (all already in `useAppData()`), as props.
 */

import { useMemo, useState } from 'react';
import {
  buildFocusGraph,
  FOCUS_NODE_HEIGHT,
  FOCUS_NODE_WIDTH,
  type FocusCollapsedGroup,
  type FocusNode,
} from '../lib/focusGraph';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import type { SearchResult } from '../lib/librarySearch';
import type { DocMeta, GuidanceAsset } from '../types';

export interface LibraryFocusGraphProps {
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** The finder's lifted selection — the canvas's centre. `null` renders nothing. */
  selection: SearchResult | null;
  /** Invoked with a neighbour's result when the user graph-walks onto it (or steps back). */
  onFocus: (result: SearchResult) => void;
  /** Invoked with a double-clicked node's finder-parity result — additive to `onFocus`. */
  onOpen?: (result: SearchResult) => void;
}

function toSearchResult(node: FocusNode): SearchResult {
  return { id: node.id, title: node.title, category: node.category, source: node.source };
}

const EMPTY_BBOX = { minX: 0, minY: 0, width: 0, height: 0 };

/** The Library focus DAG canvas: a dagre-laid-out, full-depth neighbourhood over `references[]`. */
export function LibraryFocusGraph({
  assets,
  docs,
  selection,
  onFocus,
  onOpen,
}: LibraryFocusGraphProps): React.JSX.Element {
  const arcDisplay = useArcDisplay();
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

  const graph = useMemo(
    () =>
      selection
        ? buildFocusGraph({ centre: selection, assets, docs, expanded: expandedIds })
        : { nodes: [], edges: [], collapsed: [] as FocusCollapsedGroup[], bbox: EMPTY_BBOX },
    [selection, assets, docs, expandedIds],
  );

  if (!selection) {
    return <svg className="library-focus-graph" data-testid="library-focus-graph" />;
  }

  const collapsedByParent = new Map(graph.collapsed.map((g) => [g.parentId, g]));

  function handleNodeClick(node: FocusNode): void {
    if (node.side === 'centre') return;
    setHistory((prev) => (selection ? [...prev, selection] : prev));
    onFocus(toSearchResult(node));
  }

  function handleBack(): void {
    setHistory((prev) => {
      const prior = prev.at(-1);
      if (!prior) return prev;
      onFocus(prior);
      return prev.slice(0, -1);
    });
  }

  function expandNode(nodeId: string): void {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }

  function renderNode(node: FocusNode): React.JSX.Element {
    const collapsedGroup = collapsedByParent.get(node.id);
    const left = node.x - FOCUS_NODE_WIDTH / 2;
    const top = node.y - FOCUS_NODE_HEIGHT / 2;
    return (
      <g
        key={node.id}
        className="ldag-node"
        data-testid={`lfg-node-${node.id}`}
        data-side={node.side}
        data-chain={node.onChain ? 'true' : undefined}
        data-ephemeral={node.ephemeral ? 'true' : undefined}
        transform={`translate(${left}, ${top})`}
        onClick={() => handleNodeClick(node)}
        onDoubleClick={() => onOpen?.(toSearchResult(node))}
      >
        <rect className="ldag-node-rect" width={FOCUS_NODE_WIDTH} height={FOCUS_NODE_HEIGHT} rx={6} />
        <text className="ldag-node-title" x={10} y={22}>
          {node.title}
        </text>
        <text className="ldag-node-kind" data-testid={`lfg-node-kind-${node.id}`} x={10} y={40}>
          {kindLabel(node.category, arcDisplay)}
        </text>
        {collapsedGroup && renderExpander(node, collapsedGroup)}
      </g>
    );
  }

  function renderExpander(node: FocusNode, group: FocusCollapsedGroup): React.JSX.Element {
    return (
      <g
        className="ldag-expander"
        data-testid={`ldag-expander-${node.id}`}
        transform={`translate(${FOCUS_NODE_WIDTH}, 0)`}
        onClick={(event) => {
          event.stopPropagation();
          expandNode(node.id);
        }}
      >
        <circle className="ldag-expander-circle" r={9} />
        <text className="ldag-expander-label" textAnchor="middle" y={4}>
          {`+${group.hiddenIds.length}`}
        </text>
      </g>
    );
  }

  const viewBox = `${graph.bbox.minX} ${graph.bbox.minY} ${graph.bbox.width} ${graph.bbox.height}`;

  return (
    <div className="library-focus-graph-shell">
      <div className="lfg-breadcrumb" data-testid="lfg-breadcrumb">
        <button type="button" data-testid="lfg-breadcrumb-back" onClick={handleBack} disabled={history.length === 0}>
          ← Back
        </button>
        {history.map((entry) => (
          <span key={entry.id} className="lfg-breadcrumb-entry">
            {entry.title}
          </span>
        ))}
      </div>

      <svg
        className="library-focus-graph"
        data-testid="library-focus-graph"
        viewBox={viewBox}
      >
        {graph.edges.map((edge) => {
          const fromNode = graph.nodes.find((n) => n.id === edge.from);
          const toNode = graph.nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              className="ldag-edge"
              data-testid={`ldag-edge-${edge.from}-${edge.to}`}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
            />
          );
        })}
        {graph.nodes.map(renderNode)}
      </svg>
    </div>
  );
}
