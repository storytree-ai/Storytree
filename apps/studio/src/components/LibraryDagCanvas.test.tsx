// @vitest-environment jsdom
//
// LibraryDagCanvas — the brownfield rework of the focus subgraph into a true layered reference DAG
// (ADR-0188 dec 5, the library-dag-canvas capability). Replaces the retired
// `LibraryFocusGraph.test.tsx` (`lfg-*`): the still-true inc-3 behaviours (both-ways adjacency, the
// dagre rankdir-LR ranks, the kindLabel plaque, the selected-chain/ephemeral markers, the
// neighbour-click re-focus, no-fetch) re-home here as `ldag-*`, alongside the net-new dec-5 geometry
// — the `depth` param's retirement in favour of full transitive depth, drawn SVG edges, a
// fit-to-view viewBox, per-branch ⊕ expanders, and the Back-leading/no-stepper/no-header layout.
//
// Source files stay named `LibraryFocusGraph.tsx` / `focusGraph.ts` (a rework, not a rename) — this
// file keeps the `lfg-node-<id>` / `onDoubleClick` compat the signed `LibraryOpenTrigger.test.tsx`
// (`lot-*`) depends on; it is untouched here. No visual/colour/pixel assertion (ADR-0070) — only the
// adjacency, the edge list, the ranks, the drawn edge elements, the viewBox containment, the plaque
// text, the state markers, the expander behaviour, the Back-led breadcrumb, and the neighbour-walk.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryFocusGraph } from './LibraryFocusGraph';
import { buildFocusGraph } from '../lib/focusGraph';
import type { GuidanceAsset, DocMeta } from '../types';
import type { SearchResult } from '../lib/librarySearch';

const NOW = '2026-01-01T00:00:00.000Z';

/** The component's fixed per-branch fan cap (unexported — mirrored here as a test constant). */
const FAN_CAP = 6;

function asset(
  overrides: Partial<GuidanceAsset> & Pick<GuidanceAsset, 'id' | 'category' | 'title'>,
): GuidanceAsset {
  return {
    description: 'unrelated description text',
    body: 'unrelated body text',
    references: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function selectionFor(a: GuidanceAsset): SearchResult {
  return { id: a.id, title: a.title, category: a.category, source: 'asset' };
}

afterEach(cleanup);

describe('buildFocusGraph — full transitive depth, both ways, over references[]', () => {
  // ── ldag-adjacency-both-ways-full-depth ──────────────────────────────────────────
  it('ldag-adjacency-both-ways-full-depth: walks references[] both ways to FULL transitive depth (no depth cap/param)', () => {
    const a = asset({ id: 'chain-a', category: 'definition', title: 'Chain A' });
    const b = asset({ id: 'chain-b', category: 'pattern', title: 'Chain B', references: ['asset:chain-a'] });
    const centre = asset({
      id: 'chain-centre',
      category: 'principle',
      title: 'Chain Centre',
      references: ['asset:chain-b'],
    });
    const d = asset({
      id: 'chain-d',
      category: 'pattern',
      title: 'Chain D',
      references: ['asset:chain-centre'],
    });
    const e = asset({ id: 'chain-e', category: 'definition', title: 'Chain E', references: ['asset:chain-d'] });

    // NOTE: no `depth` argument — full transitive depth is now unconditional.
    const graph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [a, b, centre, d, e],
      docs: [],
    } as Parameters<typeof buildFocusGraph>[0]);

    expect(graph.nodes.map((n) => n.id).sort()).toEqual(
      ['chain-a', 'chain-b', 'chain-centre', 'chain-d', 'chain-e'].sort(),
    );
  });

  // ── ldag-edge-list-over-references ───────────────────────────────────────────────
  it('ldag-edge-list-over-references: returns one {from,to} edge (referenced -> referencer) per in-scope reference', () => {
    const a = asset({ id: 'edgelist-a', category: 'definition', title: 'Edgelist A' });
    const b = asset({
      id: 'edgelist-b',
      category: 'pattern',
      title: 'Edgelist B',
      references: ['asset:edgelist-a'],
    });
    const centre = asset({
      id: 'edgelist-centre',
      category: 'principle',
      title: 'Edgelist Centre',
      references: ['asset:edgelist-b'],
    });
    const d = asset({
      id: 'edgelist-d',
      category: 'pattern',
      title: 'Edgelist D',
      references: ['asset:edgelist-centre'],
    });

    const graph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [a, b, centre, d],
      docs: [],
    } as Parameters<typeof buildFocusGraph>[0]);

    expect(graph.edges).toHaveLength(3);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: 'edgelist-a', to: 'edgelist-b' },
        { from: 'edgelist-b', to: 'edgelist-centre' },
        { from: 'edgelist-centre', to: 'edgelist-d' },
      ]),
    );
  });

  // ── ldag-layered-ranks-upstream-left-downstream-right ────────────────────────────
  it('ldag-layered-ranks-upstream-left-downstream-right: upstream nodes rank strictly left of centre, downstream strictly right', () => {
    const a = asset({ id: 'rank-a', category: 'definition', title: 'Rank A' });
    const b = asset({ id: 'rank-b', category: 'pattern', title: 'Rank B', references: ['asset:rank-a'] });
    const centre = asset({
      id: 'rank-centre',
      category: 'principle',
      title: 'Rank Centre',
      references: ['asset:rank-b'],
    });
    const d = asset({
      id: 'rank-d',
      category: 'pattern',
      title: 'Rank D',
      references: ['asset:rank-centre'],
    });
    const e = asset({ id: 'rank-e', category: 'definition', title: 'Rank E', references: ['asset:rank-d'] });

    const graph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [a, b, centre, d, e],
      docs: [],
    } as Parameters<typeof buildFocusGraph>[0]);

    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const nodeA = byId.get('rank-a');
    const nodeB = byId.get('rank-b');
    const nodeCentre = byId.get('rank-centre');
    const nodeD = byId.get('rank-d');
    const nodeE = byId.get('rank-e');

    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();
    expect(nodeCentre).toBeDefined();
    expect(nodeD).toBeDefined();
    expect(nodeE).toBeDefined();

    expect(nodeA!.x).toBeLessThan(nodeB!.x);
    expect(nodeB!.x).toBeLessThan(nodeCentre!.x);
    expect(nodeCentre!.x).toBeLessThan(nodeD!.x);
    expect(nodeD!.x).toBeLessThan(nodeE!.x);
  });

  // ── ldag-per-branch-fan-cap-collapses-overflow ───────────────────────────────────
  it('ldag-per-branch-fan-cap-collapses-overflow: a branch past the fan cap collapses, exposing which neighbours + a count; an expanded id reveals all', () => {
    const fillers = Array.from({ length: 9 }, (_, i) =>
      asset({ id: `fancap-filler-${i + 1}`, category: 'pattern', title: `Fancap Filler ${i + 1}` }),
    );
    const centre = asset({
      id: 'fancap-centre',
      category: 'principle',
      title: 'Fancap Centre',
      references: fillers.map((f) => `asset:${f.id}`),
    });

    const collapsedGraph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [centre, ...fillers],
      docs: [],
    } as Parameters<typeof buildFocusGraph>[0]);

    const visibleUpstream = collapsedGraph.nodes.filter((n) => n.side === 'upstream');
    expect(visibleUpstream).toHaveLength(FAN_CAP);

    const collapsedGroups =
      (collapsedGraph as { collapsed?: { parentId: string; hiddenIds: string[] }[] }).collapsed ?? [];
    const centreGroup = collapsedGroups.find((g) => g.parentId === centre.id);
    expect(centreGroup).toBeDefined();
    expect(centreGroup!.hiddenIds).toHaveLength(fillers.length - FAN_CAP);

    const expandedGraph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [centre, ...fillers],
      docs: [],
      expanded: new Set([centre.id]),
    } as Parameters<typeof buildFocusGraph>[0]);

    expect(expandedGraph.nodes.filter((n) => n.side === 'upstream')).toHaveLength(fillers.length);
  });
});

describe('LibraryFocusGraph — SVG DAG canvas', () => {
  // ── ldag-edges-drawn-between-nodes ───────────────────────────────────────────────
  it('ldag-edges-drawn-between-nodes: renders a drawn SVG edge element between every rank-adjacent referenced/referencer pair', () => {
    const a = asset({ id: 'edge-a', category: 'definition', title: 'Edge A' });
    const b = asset({ id: 'edge-b', category: 'pattern', title: 'Edge B', references: ['asset:edge-a'] });
    const centre = asset({
      id: 'edge-centre',
      category: 'principle',
      title: 'Edge Centre',
      references: ['asset:edge-b'],
    });
    const d = asset({
      id: 'edge-d',
      category: 'pattern',
      title: 'Edge D',
      references: ['asset:edge-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[a, b, centre, d]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ldag-edge-edge-a-edge-b')).toBeTruthy();
    expect(screen.getByTestId('ldag-edge-edge-b-edge-centre')).toBeTruthy();
    expect(screen.getByTestId('ldag-edge-edge-centre-edge-d')).toBeTruthy();
  });

  // ── ldag-viewbox-contains-all-nodes ──────────────────────────────────────────────
  it('ldag-viewbox-contains-all-nodes: the SVG canvas exposes a machine-parseable viewBox bounding every laid-out node', () => {
    const upstreamNode = asset({ id: 'viewbox-upstream', category: 'pattern', title: 'Viewbox Upstream' });
    const downstreamNode = asset({
      id: 'viewbox-downstream',
      category: 'pattern',
      title: 'Viewbox Downstream',
      references: ['asset:viewbox-centre'],
    });
    const centre = asset({
      id: 'viewbox-centre',
      category: 'definition',
      title: 'Viewbox Centre',
      references: ['asset:viewbox-upstream'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, upstreamNode, downstreamNode]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    const canvas = screen.getByTestId('library-focus-graph');
    expect(canvas.tagName.toLowerCase()).toBe('svg');

    const viewBoxAttr = canvas.getAttribute('viewBox');
    expect(viewBoxAttr).toBeTruthy();

    const parts = (viewBoxAttr ?? '').trim().split(/\s+/).map(Number);
    const [minX, minY, width, height] = parts;
    expect(parts).toHaveLength(4);

    const expectedGraph = buildFocusGraph({
      centre: selectionFor(centre),
      assets: [centre, upstreamNode, downstreamNode],
      docs: [],
    } as Parameters<typeof buildFocusGraph>[0]);

    for (const node of expectedGraph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(minX!);
      expect(node.x).toBeLessThanOrEqual(minX! + width!);
      expect(node.y).toBeGreaterThanOrEqual(minY!);
      expect(node.y).toBeLessThanOrEqual(minY! + height!);
    }
  });

  // ── ldag-node-plaque-kind-via-kindLabel ──────────────────────────────────────────
  it('ldag-node-plaque-kind-via-kindLabel: the kind line reads kindLabel(category, arcDisplay) — an arc node reads "epic", never the raw key', () => {
    const centre = asset({ id: 'kind-centre', category: 'definition', title: 'Kind Centre' });
    const arcNeighbour = asset({
      id: 'kind-arc-neighbour',
      category: 'arc',
      title: 'Kind Arc Neighbour',
      references: ['asset:kind-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, arcNeighbour]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lfg-node-kind-kind-arc-neighbour').textContent).toBe('epic');
  });

  // ── ldag-selected-chain-and-ephemeral-markers ────────────────────────────────────
  it('ldag-selected-chain-and-ephemeral-markers: the traversed chain carries data-chain; plan-kind neighbours carry data-ephemeral', () => {
    const centre = asset({ id: 'marker-centre', category: 'definition', title: 'Marker Centre' });
    const planNode = asset({
      id: 'marker-plan',
      category: 'plan',
      title: 'Marker Plan',
      references: ['asset:marker-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, planNode]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    const planEl = screen.getByTestId('lfg-node-marker-plan');
    expect(planEl.getAttribute('data-chain')).toBe('true');
    expect(planEl.getAttribute('data-ephemeral')).toBe('true');
    expect(screen.getByTestId(`lfg-node-${centre.id}`).getAttribute('data-ephemeral')).toBeNull();
  });

  // ── ldag-per-node-expander-expands-in-place ──────────────────────────────────────
  it('ldag-per-node-expander-expands-in-place: a per-node ⊕ expander reveals a collapsed branch\'s overflow in place', () => {
    const fillers = Array.from({ length: 9 }, (_, i) =>
      asset({ id: `expander-filler-${i + 1}`, category: 'pattern', title: `Expander Filler ${i + 1}` }),
    );
    const centre = asset({
      id: 'expander-centre',
      category: 'principle',
      title: 'Expander Centre',
      references: fillers.map((f) => `asset:${f.id}`),
    });

    render(
      <LibraryFocusGraph
        assets={[centre, ...fillers]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    const visibleBefore = fillers.filter((f) => screen.queryByTestId(`lfg-node-${f.id}`) !== null);
    expect(visibleBefore).toHaveLength(FAN_CAP);

    const expander = screen.getByTestId(`ldag-expander-${centre.id}`);
    fireEvent.click(expander);

    for (const f of fillers) {
      expect(screen.getByTestId(`lfg-node-${f.id}`)).toBeTruthy();
    }
  });

  // ── ldag-back-leads-breadcrumb-no-stepper-no-header ──────────────────────────────
  it('ldag-back-leads-breadcrumb-no-stepper-no-header: Back leads the breadcrumb; the global depth stepper is retired', () => {
    const centre = asset({ id: 'nav-centre', category: 'principle', title: 'Nav Centre' });
    const neighbour = asset({
      id: 'nav-neighbour',
      category: 'pattern',
      title: 'Nav Neighbour',
      references: ['asset:nav-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, neighbour]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('lfg-depth-value')).toBeNull();
    expect(screen.queryByTestId('lfg-depth-increase')).toBeNull();
    expect(screen.queryByTestId('lfg-depth-decrease')).toBeNull();

    fireEvent.click(screen.getByTestId(`lfg-node-${neighbour.id}`));

    const breadcrumb = screen.getByTestId('lfg-breadcrumb');
    expect(breadcrumb.firstElementChild?.getAttribute('data-testid')).toBe('lfg-breadcrumb-back');
  });

  // ── ldag-neighbour-click-refocuses ───────────────────────────────────────────────
  it('ldag-neighbour-click-refocuses: a single click on a neighbour invokes onFocus with its finder-parity SearchResult', () => {
    const onFocus = vi.fn();
    const centre = asset({ id: 'focus-centre', category: 'definition', title: 'Focus Centre' });
    const neighbour = asset({
      id: 'focus-neighbour',
      category: 'pattern',
      title: 'Focus Neighbour',
      references: ['asset:focus-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, neighbour]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={onFocus}
      />,
    );

    fireEvent.click(screen.getByTestId(`lfg-node-${neighbour.id}`));

    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: neighbour.id,
        title: neighbour.title,
        category: neighbour.category,
        source: 'asset',
      }),
    );
  });

  // ── ldag-no-fetch-beyond-loaded ───────────────────────────────────────────────────
  it('ldag-no-fetch-beyond-loaded: rendering and interacting never calls fetch — only the already-loaded corpus is read', () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    try {
      const centre = asset({ id: 'nofetch-centre', category: 'definition', title: 'Nofetch Centre' });
      const neighbour = asset({
        id: 'nofetch-neighbour',
        category: 'pattern',
        title: 'Nofetch Neighbour',
        references: ['asset:nofetch-centre'],
      });

      render(
        <LibraryFocusGraph
          assets={[centre, neighbour]}
          docs={[]}
          selection={selectionFor(centre)}
          onFocus={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId(`lfg-node-${neighbour.id}`));

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
