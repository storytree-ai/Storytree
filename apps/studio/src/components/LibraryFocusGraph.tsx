/**
 * LibraryFocusGraph — the Library focus DAG canvas, centred on the finder's lifted selection
 * (ADR-0188 dec 5, the library-dag-canvas capability — the brownfield rework of the inc-3 focus
 * subgraph, ADR-0185 dec 3, into a true layered reference DAG).
 *
 * Renders the dagre rankdir-LR `buildFocusGraph` (`../lib/focusGraph`) computes over the
 * already-loaded `assets`/`docs`, walked BOTH ways to ONE level only (ADR-0193 dec 3): upstream
 * ("stands on") to the left of the centre, downstream ("stood on by") to the right — as an SVG
 * canvas of positioned nodes with DRAWN edges between rank-adjacent nodes, fit inside a bounded
 * `viewBox` computed from the laid-out bbox. Per-branch breadth is tamed by an in-place ⊕
 * expander (the global depth stepper and the +N-more cluster chip retire with this rework).
 *
 * Each node is a two-line plaque — the title, and a muted kind line routed through `kindLabel`
 * (never a hand-rolled category → label map, ADR-0183 D1). Colour is reserved for STATE, never
 * kind: the centre + its traversed neighbours carry a `data-chain` marker, and `plan`-kind
 * (ephemeral) neighbours carry a `data-ephemeral` marker — this component asserts only the
 * markers, never a colour/stroke value (the visual treatment is operator-attested, ADR-0070).
 *
 * Selection is LIFTED, not owned: `selection` (the finder's picked result) drives the centre, and
 * clicking a neighbour re-centres by invoking `onFocus` with that neighbour's result — revealing
 * ITS one-level neighbourhood. There is NO ← Back button, NO breadcrumb trail, and NO pan/zoom
 * controls (ADR-0193 dec 3) — search-first plus click-through re-centre is the whole navigation.
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
  edgePath,
  fitViewBox,
  focusSwimlanes,
  FOCUS_NODE_HEIGHT,
  FOCUS_NODE_WIDTH,
  wrapTitle,
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
  /** Invoked with a neighbour's result when the user click-through re-centres onto it. */
  onFocus: (result: SearchResult) => void;
  /** Invoked with a double-clicked node's finder-parity result — additive to `onFocus`. */
  onOpen?: (result: SearchResult) => void;
}

function toSearchResult(node: FocusNode): SearchResult {
  return { id: node.id, title: node.title, category: node.category, source: node.source };
}

const EMPTY_BBOX = { minX: 0, minY: 0, width: 0, height: 0 };

/** The Library focus DAG canvas: a dagre-laid-out, one-level-each-way neighbourhood over `references[]`. */
export function LibraryFocusGraph({
  assets,
  docs,
  selection,
  onFocus,
  onOpen,
}: LibraryFocusGraphProps): React.JSX.Element {
  const arcDisplay = useArcDisplay();
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
    onFocus(toSearchResult(node));
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
    const titleLines = wrapTitle(node.title);
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
        {/* full, untruncated title on hover — keeps the 2-line clamp lossless */}
        <title>{node.title}</title>
        <rect className="ldag-node-rect" width={FOCUS_NODE_WIDTH} height={FOCUS_NODE_HEIGHT} rx={8} />
        <text className="ldag-node-title" x={12} y={24}>
          {titleLines.map((line, i) => (
            <tspan key={i} x={12} dy={i === 0 ? 0 : 16}>
              {line}
            </tspan>
          ))}
        </text>
        <text
          className="ldag-node-kind"
          data-testid={`lfg-node-kind-${node.id}`}
          x={12}
          y={FOCUS_NODE_HEIGHT - 12}
        >
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

  // Cap the zoom: never scale a small graph (or a lone node) up past a natural size — pad the
  // viewBox out to the minimum window instead, so the on-screen node size stays consistent.
  const view = fitViewBox(graph.bbox);
  const viewBox = `${view.minX} ${view.minY} ${view.width} ${view.height}`;
  const lanes = focusSwimlanes(graph.nodes, view);
  const centreNode = graph.nodes.find((n) => n.side === 'centre');

  return (
    <div className="library-focus-graph-shell">
      {(lanes.left || lanes.right) && (
        <div className="ldag-lane-legend" data-testid="ldag-lane-legend">
          <span>{lanes.left ? 'Stands on' : ''}</span>
          <span>{lanes.right ? 'Stood on by' : ''}</span>
        </div>
      )}
      <svg
        className="library-focus-graph"
        data-testid="library-focus-graph"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* directional chevron — userSpaceOnUse so it scales with the viewBox, not stroke-width */}
          <marker
            id="lfg-arrow"
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={16}
            markerHeight={16}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path className="ldag-arrowhead" d="M0,0 L10,5 L0,10 L2.5,5 Z" />
          </marker>
        </defs>
        {/* swimlane grounds (back): faint stands-on / stood-on-by bands framing the centre */}
        {lanes.left && (
          <rect
            className="ldag-swimlane ldag-swimlane-left"
            data-testid="ldag-swimlane-left"
            x={lanes.left.x}
            y={view.minY}
            width={lanes.left.width}
            height={view.height}
          />
        )}
        {lanes.right && (
          <rect
            className="ldag-swimlane ldag-swimlane-right"
            data-testid="ldag-swimlane-right"
            x={lanes.right.x}
            y={view.minY}
            width={lanes.right.width}
            height={view.height}
          />
        )}
        {/* centre halo — a soft moss glow so the focused node reads even amid its neighbours */}
        {centreNode && (
          <rect
            className="ldag-node-halo"
            x={centreNode.x - FOCUS_NODE_WIDTH / 2 - 6}
            y={centreNode.y - FOCUS_NODE_HEIGHT / 2 - 6}
            width={FOCUS_NODE_WIDTH + 12}
            height={FOCUS_NODE_HEIGHT + 12}
            rx={12}
          />
        )}
        {graph.edges.map((edge) => {
          const fromNode = graph.nodes.find((n) => n.id === edge.from);
          const toNode = graph.nodes.find((n) => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              className="ldag-edge"
              data-testid={`ldag-edge-${edge.from}-${edge.to}`}
              d={edgePath(fromNode, toNode)}
              markerEnd="url(#lfg-arrow)"
            />
          );
        })}
        {graph.nodes.map(renderNode)}
      </svg>
    </div>
  );
}
