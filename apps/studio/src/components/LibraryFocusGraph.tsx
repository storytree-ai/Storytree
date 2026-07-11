/**
 * LibraryFocusGraph — the focus subgraph over the corpus references, centred on the finder's
 * lifted selection (ADR-0185 dec 3, increment 3 of the library-tech-tree-overlay story).
 *
 * Renders the dagre rankdir-LR neighbourhood `buildFocusGraph` (`../lib/focusGraph`) computes
 * over the already-loaded `assets`/`docs`: upstream ("stands on") to the left of the centre,
 * downstream ("stood on by") to the right. Each node is a two-line plaque — the title, and a
 * muted kind line routed through `kindLabel` (never a hand-rolled category → label map, ADR-0183
 * D1). Colour is reserved for STATE, never kind: the centre + its traversed neighbours carry a
 * `data-chain` marker, and `plan`-kind (ephemeral) neighbours carry a `data-ephemeral` marker —
 * this component asserts only the markers, never a colour/stroke value (the visual treatment is
 * the story's operator-attested UAT leg, ADR-0070).
 *
 * A hub can fan out past what's usable on first click (trap f), so a depth-1-default limiter
 * ships with this increment: a depth stepper, and a per-side `+N more` cluster chip that
 * collapses overflow neighbours past the fan cap (click to expand in place).
 *
 * Selection is LIFTED, not owned: `selection` (the finder's picked result) drives the centre, and
 * clicking a neighbour re-centres by invoking `onFocus` with that neighbour's result — the
 * subgraph pushes its own breadcrumb (with a back control) so the walk can be retraced, but the
 * actual re-centring lives with whoever holds `selection` (mirrors how `LibraryFinder` lifts
 * `onSelect` without owning where it goes).
 *
 * No fetch beyond the loaded corpus — no `docContent`, no socket, no DB; only `assets`/`docs`/
 * `selection` (all already in `useAppData()`), as props.
 */

import { useMemo, useState } from 'react';
import { buildFocusGraph, type FocusNode, type FocusNodeSide } from '../lib/focusGraph';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import type { SearchResult } from '../lib/librarySearch';
import type { DocMeta, GuidanceAsset } from '../types';

export interface LibraryFocusGraphProps {
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** The finder's lifted selection — the subgraph's centre. `null` renders nothing. */
  selection: SearchResult | null;
  /** Invoked with a neighbour's result when the user graph-walks onto it (or steps back). */
  onFocus: (result: SearchResult) => void;
}

const DEFAULT_DEPTH = 1;
const MIN_DEPTH = 1;
const MAX_DEPTH = 5;

/** Per-side fan cap: a hub past this many neighbours collapses the rest into a cluster chip. */
const FAN_CAP = 6;

function toSearchResult(node: FocusNode): SearchResult {
  return { id: node.id, title: node.title, category: node.category, source: node.source };
}

function splitFan(nodes: FocusNode[], expanded: boolean): { visible: FocusNode[]; overflow: number } {
  if (expanded || nodes.length <= FAN_CAP) return { visible: nodes, overflow: 0 };
  return { visible: nodes.slice(0, FAN_CAP), overflow: nodes.length - FAN_CAP };
}

/** The Library focus subgraph: a dagre-laid-out neighbourhood over `references[]`. */
export function LibraryFocusGraph({
  assets,
  docs,
  selection,
  onFocus,
}: LibraryFocusGraphProps): React.JSX.Element {
  const arcDisplay = useArcDisplay();
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [history, setHistory] = useState<SearchResult[]>([]);
  const [expandedSides, setExpandedSides] = useState<ReadonlySet<FocusNodeSide>>(() => new Set());

  const graph = useMemo(
    () =>
      selection
        ? buildFocusGraph({ centre: selection, assets, docs, depth })
        : { nodes: [], edges: [] },
    [selection, assets, docs, depth],
  );

  if (!selection) {
    return <div className="library-focus-graph" data-testid="library-focus-graph" />;
  }

  const centreNode = graph.nodes.find((n) => n.side === 'centre');
  const upstream = splitFan(
    graph.nodes.filter((n) => n.side === 'upstream'),
    expandedSides.has('upstream'),
  );
  const downstream = splitFan(
    graph.nodes.filter((n) => n.side === 'downstream'),
    expandedSides.has('downstream'),
  );

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

  function expandSide(side: FocusNodeSide): void {
    setExpandedSides((prev) => {
      const next = new Set(prev);
      next.add(side);
      return next;
    });
  }

  function renderNode(node: FocusNode): React.JSX.Element {
    return (
      <div
        key={node.id}
        className="lfg-node"
        data-testid={`lfg-node-${node.id}`}
        data-side={node.side}
        data-chain={node.onChain ? 'true' : undefined}
        data-ephemeral={node.ephemeral ? 'true' : undefined}
        onClick={() => handleNodeClick(node)}
      >
        <div className="lfg-node-title">{node.title}</div>
        <div className="lfg-node-kind" data-testid={`lfg-node-kind-${node.id}`}>
          {kindLabel(node.category, arcDisplay)}
        </div>
      </div>
    );
  }

  function renderCluster(side: 'upstream' | 'downstream', overflow: number): React.JSX.Element | null {
    if (overflow <= 0) return null;
    return (
      <button
        type="button"
        className="lfg-cluster-chip"
        data-testid={`lfg-cluster-chip-${side}`}
        onClick={() => expandSide(side)}
      >
        {`+${overflow} more`}
      </button>
    );
  }

  return (
    <div className="library-focus-graph" data-testid="library-focus-graph">
      {history.length > 0 && (
        <div className="lfg-breadcrumb" data-testid="lfg-breadcrumb">
          {history.map((entry) => (
            <span key={entry.id} className="lfg-breadcrumb-entry">
              {entry.title}
            </span>
          ))}
          <button type="button" data-testid="lfg-breadcrumb-back" onClick={handleBack}>
            Back
          </button>
        </div>
      )}

      <div className="lfg-depth-stepper">
        <button
          type="button"
          data-testid="lfg-depth-decrease"
          onClick={() => setDepth((d) => Math.max(MIN_DEPTH, d - 1))}
        >
          −
        </button>
        <span data-testid="lfg-depth-value">{depth}</span>
        <button
          type="button"
          data-testid="lfg-depth-increase"
          onClick={() => setDepth((d) => Math.min(MAX_DEPTH, d + 1))}
        >
          +
        </button>
      </div>

      <div className="lfg-column lfg-column-upstream">
        {upstream.visible.map(renderNode)}
        {renderCluster('upstream', upstream.overflow)}
      </div>

      <div className="lfg-column lfg-column-centre">{centreNode && renderNode(centreNode)}</div>

      <div className="lfg-column lfg-column-downstream">
        {downstream.visible.map(renderNode)}
        {renderCluster('downstream', downstream.overflow)}
      </div>
    </div>
  );
}
