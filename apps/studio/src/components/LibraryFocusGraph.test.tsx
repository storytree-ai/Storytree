// @vitest-environment jsdom
//
// Behaviour + geometry test for the Library FOCUS SUBGRAPH (ADR-0185 dec 3, increment 3 of the
// library-tech-tree-overlay story). This capability's honest proof spans two things, both pinned in
// this ONE file (ADR-0122 — `storytree coverage` scans only `real.testFile`):
//
//   • the PURE adjacency+layout heart `buildFocusGraph({ centre, assets, docs, depth })`
//     (`../lib/focusGraph`) — builds a dagre rankdir-LR neighbourhood over `GuidanceAsset.references`
//     BOTH ways (upstream = the centre's own references; downstream = the reverse index — every asset
//     whose references points AT the centre), stripping the `asset:`/`doc:` prefix, an ADR centre
//     therefore carrying an EMPTY upstream fan (`DocMeta` has no `references` — trap m);
//   • the `<LibraryFocusGraph>` component (`./LibraryFocusGraph`) — takes `assets`/`docs`/`selection`/
//     `onFocus` as PROPS (no backend seam), renders each node as a two-line plaque (title + a
//     `kindLabel(category, arcDisplay)` kind line — an `arc` node reads "epic", never the raw key —
//     trap j), marks the selected node + its neighbours with a `data-chain` STATE marker and ephemeral
//     `plan`-kind nodes with a `data-ephemeral` marker (asserting the MARKER, never the colour/stroke),
//     ships a depth-1-default stepper with a `+N more` cluster chip for hub overflow (trap f), and
//     graph-walks on a neighbour click — invoking `onFocus` and pushing a breadcrumb with a back control.
//
// NOT pinned here (the story's operator-attested UAT leg 3, ADR-0070): the two-pane forest-cozy layout,
// the plaque styling, the PURPLE selected-chain colour, the DASHED ephemeral stroke, and the fan's
// left→right visual layout. No visual/colour/stroke assertion lives in this file, and this scope does
// NOT touch `TreeView.tsx` / `LibraryDrawer.tsx` (trap k) — the subgraph is proven in isolation.
//
// No real fetch/docContent/socket/DB/Electron — the subgraph reads only the loaded assets/docs
// (`lfg-no-fetch-beyond-loaded` asserts this directly).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { buildFocusGraph } from '../lib/focusGraph';
import { LibraryFocusGraph } from './LibraryFocusGraph';
import type { GuidanceAsset, DocMeta } from '../types';
import type { SearchResult } from '../lib/librarySearch';

const NOW = '2026-01-01T00:00:00.000Z';

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

function doc(overrides: Partial<DocMeta> & Pick<DocMeta, 'id' | 'title'>): DocMeta {
  return {
    group: 'Decisions',
    excerpt: 'unrelated excerpt text',
    ...overrides,
  };
}

function selectionFor(a: GuidanceAsset): SearchResult {
  return { id: a.id, title: a.title, category: a.category, source: 'asset' };
}

afterEach(cleanup);

// ---------- fixtures (kept small + isolated per contract, no cross-test coupling) ----------

/** Contract 1: a small centre + one upstream + one downstream + an unrelated island. */
function buildAdjacencyFixture() {
  const centre = asset({
    id: 'adj-centre',
    title: 'Adjacency Centre',
    category: 'definition',
    references: ['asset:adj-upstream'],
  });
  const upstream = asset({ id: 'adj-upstream', title: 'Adjacency Upstream', category: 'principle' });
  const downstream = asset({
    id: 'adj-downstream',
    title: 'Adjacency Downstream',
    category: 'pattern',
    references: ['asset:adj-centre'],
  });
  const unrelated = asset({ id: 'adj-unrelated', title: 'Adjacency Unrelated', category: 'guardrail' });
  return { centre, upstream, downstream, unrelated, selection: selectionFor(centre) };
}

/** Contract 2: a centre with one upstream + one downstream neighbour, for x-ordering. */
function buildLayoutFixture() {
  const centre = asset({
    id: 'layout-centre',
    title: 'Layout Centre',
    category: 'definition',
    references: ['asset:layout-upstream'],
  });
  const upstream = asset({ id: 'layout-upstream', title: 'Layout Upstream', category: 'principle' });
  const downstream = asset({
    id: 'layout-downstream',
    title: 'Layout Downstream',
    category: 'pattern',
    references: ['asset:layout-centre'],
  });
  return { centre, upstream, downstream, selection: selectionFor(centre) };
}

/** Contract 3: a centre with an `arc` upstream neighbour + a plain downstream neighbour. */
function buildKindFixture() {
  const centre = asset({
    id: 'kind-centre',
    title: 'Kind Centre',
    category: 'definition',
    references: ['asset:kind-arc-upstream'],
  });
  const arcUpstream = asset({ id: 'kind-arc-upstream', title: 'Kind Arc Upstream', category: 'arc' });
  const patternDownstream = asset({
    id: 'kind-pattern-downstream',
    title: 'Kind Pattern Downstream',
    category: 'pattern',
    references: ['asset:kind-centre'],
  });
  return { centre, arcUpstream, patternDownstream, selection: selectionFor(centre) };
}

/** Contracts 4 & 6b: a hub — one centre with many downstream-only neighbours (forces overflow). */
const HUB_SIZE = 12;

function buildHubFixture() {
  const centre = asset({ id: 'hub-centre', title: 'Hub Centre', category: 'definition' });
  const neighbours = Array.from({ length: HUB_SIZE }, (_, i) =>
    asset({
      id: `hub-neighbour-${i + 1}`,
      title: `Hub Neighbour ${i + 1}`,
      category: 'guardrail',
      references: ['asset:hub-centre'],
    }),
  );
  return { centre, neighbours, selection: selectionFor(centre) };
}

/** Contract 5: a centre with an ephemeral `plan` downstream neighbour + a durable one. */
function buildEphemeralFixture() {
  const centre = asset({ id: 'ephemeral-centre', title: 'Ephemeral Centre', category: 'definition' });
  const planNeighbour = asset({
    id: 'ephemeral-plan-neighbour',
    title: 'Ephemeral Plan Neighbour',
    category: 'plan',
    references: ['asset:ephemeral-centre'],
  });
  const durableNeighbour = asset({
    id: 'ephemeral-durable-neighbour',
    title: 'Ephemeral Durable Neighbour',
    category: 'principle',
    references: ['asset:ephemeral-centre'],
  });
  return { centre, planNeighbour, durableNeighbour, selection: selectionFor(centre) };
}

/** Contract 6a: a centre with a depth-1 upstream neighbour whose OWN upstream is depth-2-only. */
function buildDepthFixture() {
  const centre = asset({
    id: 'depth-centre',
    title: 'Depth Centre',
    category: 'definition',
    references: ['asset:depth-near-upstream'],
  });
  const nearUpstream = asset({
    id: 'depth-near-upstream',
    title: 'Depth Near Upstream',
    category: 'principle',
    references: ['asset:depth-far-upstream'],
  });
  const farUpstream = asset({ id: 'depth-far-upstream', title: 'Depth Far Upstream', category: 'pattern' });
  return { centre, nearUpstream, farUpstream, selection: selectionFor(centre) };
}

/** Contracts 7 & 8: a centre with a single downstream neighbour, for the graph-walk + no-fetch checks. */
function buildWalkFixture() {
  const centre = asset({ id: 'walk-centre', title: 'Walk Centre', category: 'definition' });
  const neighbour = asset({
    id: 'walk-neighbour',
    title: 'Walk Neighbour',
    category: 'pattern',
    references: ['asset:walk-centre'],
  });
  return { centre, neighbour, selection: selectionFor(centre) };
}

// ---------- the pure adjacency + layout heart ----------

describe('buildFocusGraph — adjacency', () => {
  it('lfg-adjacency-both-directions-from-references: builds upstream AND downstream from references, prefix-stripped', () => {
    const { centre, upstream, downstream, unrelated, selection } = buildAdjacencyFixture();
    const result = buildFocusGraph({
      centre: selection,
      assets: [centre, upstream, downstream, unrelated],
      docs: [],
      depth: 1,
    });

    const upstreamIds = result.nodes.filter((n) => n.side === 'upstream').map((n) => n.id);
    const downstreamIds = result.nodes.filter((n) => n.side === 'downstream').map((n) => n.id);

    expect(upstreamIds).toEqual([upstream.id]);
    expect(downstreamIds).toEqual([downstream.id]);
    expect(upstreamIds).not.toContain(unrelated.id);
    expect(downstreamIds).not.toContain(unrelated.id);
  });

  it('lfg-adjacency-both-directions-from-references: an ADR centre has an EMPTY upstream fan (DocMeta carries no references)', () => {
    const adrCentreDoc = doc({
      id: 'decisions/0002-adjacency-decision.md',
      title: 'Adjacency Decision',
    });
    const adrReferencer = asset({
      id: 'adj-adr-referencer',
      title: 'Adjacency Adr Referencer',
      category: 'principle',
      references: [`doc:${adrCentreDoc.id}`],
    });
    const adrSelection: SearchResult = {
      id: adrCentreDoc.id,
      title: adrCentreDoc.title,
      category: 'adr',
      source: 'doc',
    };

    const result = buildFocusGraph({
      centre: adrSelection,
      assets: [adrReferencer],
      docs: [adrCentreDoc],
      depth: 1,
    });

    expect(result.nodes.filter((n) => n.side === 'upstream')).toHaveLength(0);
    expect(result.nodes.filter((n) => n.side === 'downstream').map((n) => n.id)).toEqual([
      adrReferencer.id,
    ]);
  });
});

describe('buildFocusGraph — dagre rankdir-LR layout', () => {
  it('lfg-dagre-lr-centres-selected: the selected node centres; upstream ranks left, downstream ranks right', () => {
    const { centre, upstream, downstream, selection } = buildLayoutFixture();
    const result = buildFocusGraph({
      centre: selection,
      assets: [centre, upstream, downstream],
      docs: [],
      depth: 1,
    });

    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    const centreNode = byId.get(centre.id);
    const upstreamNode = byId.get(upstream.id);
    const downstreamNode = byId.get(downstream.id);
    expect(centreNode).toBeTruthy();
    expect(upstreamNode).toBeTruthy();
    expect(downstreamNode).toBeTruthy();

    expect(upstreamNode!.x).toBeLessThan(centreNode!.x);
    expect(centreNode!.x).toBeLessThan(downstreamNode!.x);
  });
});

// ---------- the component ----------

describe('LibraryFocusGraph — kind plaque via kindLabel', () => {
  it('lfg-node-plaque-kind-via-kindLabel: each node renders a title + a kindLabel kind line; an arc node reads "epic", never "arc"', () => {
    const { centre, arcUpstream, patternDownstream, selection } = buildKindFixture();
    render(
      <LibraryFocusGraph
        assets={[centre, arcUpstream, patternDownstream]}
        docs={[]}
        selection={selection}
        onFocus={vi.fn()}
      />,
    );

    const arcNode = screen.getByTestId(`lfg-node-${arcUpstream.id}`);
    expect(within(arcNode).getByText(arcUpstream.title)).toBeTruthy();
    const arcKind = screen.getByTestId(`lfg-node-kind-${arcUpstream.id}`);
    expect(arcKind.textContent).toBe('epic');
    expect(arcKind.textContent).not.toBe('arc');

    const patternNode = screen.getByTestId(`lfg-node-${patternDownstream.id}`);
    expect(within(patternNode).getByText(patternDownstream.title)).toBeTruthy();
    const patternKind = screen.getByTestId(`lfg-node-kind-${patternDownstream.id}`);
    expect(patternKind.textContent).toBe('pattern');

    const centreNode = screen.getByTestId(`lfg-node-${centre.id}`);
    expect(within(centreNode).getByText(centre.title)).toBeTruthy();
    const centreKind = screen.getByTestId(`lfg-node-kind-${centre.id}`);
    expect(centreKind.textContent).toBe('definition');
  });
});

describe('LibraryFocusGraph — selected chain state marker', () => {
  it('lfg-selected-chain-marked-onchain: the centre + its neighbours carry data-chain; the overflow cluster does not', () => {
    const { centre, neighbours, selection } = buildHubFixture();
    render(
      <LibraryFocusGraph assets={[centre, ...neighbours]} docs={[]} selection={selection} onFocus={vi.fn()} />,
    );

    const centreNode = screen.getByTestId(`lfg-node-${centre.id}`);
    expect(centreNode.getAttribute('data-chain')).toBe('true');

    const visibleNeighbours = screen.queryAllByTestId(/^lfg-node-hub-neighbour-/);
    expect(visibleNeighbours.length).toBeGreaterThan(0);
    expect(visibleNeighbours.length).toBeLessThan(HUB_SIZE);
    for (const node of visibleNeighbours) {
      expect(node.getAttribute('data-chain')).toBe('true');
    }

    const cluster = screen.getByTestId('lfg-cluster-chip-downstream');
    expect(cluster.getAttribute('data-chain')).not.toBe('true');
  });
});

describe('LibraryFocusGraph — ephemeral plan-kind marker', () => {
  it('lfg-ephemeral-plan-node-marked-dashed: a plan-kind neighbour carries data-ephemeral; a durable-kind neighbour does not', () => {
    const { centre, planNeighbour, durableNeighbour, selection } = buildEphemeralFixture();
    render(
      <LibraryFocusGraph
        assets={[centre, planNeighbour, durableNeighbour]}
        docs={[]}
        selection={selection}
        onFocus={vi.fn()}
      />,
    );

    const planNode = screen.getByTestId(`lfg-node-${planNeighbour.id}`);
    expect(planNode.getAttribute('data-ephemeral')).toBe('true');

    const durableNode = screen.getByTestId(`lfg-node-${durableNeighbour.id}`);
    expect(durableNode.getAttribute('data-ephemeral')).not.toBe('true');
  });
});

describe('LibraryFocusGraph — depth limiter (default, stepper, cluster)', () => {
  it('lfg-depth-1-default-with-stepper-and-cluster: depth defaults to 1; the stepper widens/narrows the visible fan', () => {
    const { centre, nearUpstream, farUpstream, selection } = buildDepthFixture();
    render(
      <LibraryFocusGraph
        assets={[centre, nearUpstream, farUpstream]}
        docs={[]}
        selection={selection}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lfg-depth-value').textContent).toBe('1');
    expect(screen.getByTestId(`lfg-node-${nearUpstream.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`lfg-node-${farUpstream.id}`)).toBeNull();

    fireEvent.click(screen.getByTestId('lfg-depth-increase'));
    expect(screen.getByTestId('lfg-depth-value').textContent).toBe('2');
    expect(screen.getByTestId(`lfg-node-${farUpstream.id}`)).toBeTruthy();

    fireEvent.click(screen.getByTestId('lfg-depth-decrease'));
    expect(screen.getByTestId('lfg-depth-value').textContent).toBe('1');
    expect(screen.queryByTestId(`lfg-node-${farUpstream.id}`)).toBeNull();
  });

  it('lfg-depth-1-default-with-stepper-and-cluster: a hub past the fan cap collapses its overflow into a +N more cluster chip', () => {
    const { centre, neighbours, selection } = buildHubFixture();
    render(
      <LibraryFocusGraph assets={[centre, ...neighbours]} docs={[]} selection={selection} onFocus={vi.fn()} />,
    );

    const visibleNeighbours = screen.queryAllByTestId(/^lfg-node-hub-neighbour-/);
    const cluster = screen.getByTestId('lfg-cluster-chip-downstream');
    const match = cluster.textContent?.match(/^\+(\d+) more$/);
    expect(match).toBeTruthy();
    const overflow = Number(match?.[1]);
    expect(visibleNeighbours.length + overflow).toBe(HUB_SIZE);
    expect(visibleNeighbours.length).toBeLessThan(HUB_SIZE);
  });
});

describe('LibraryFocusGraph — neighbour-click graph walk + breadcrumb', () => {
  it('lfg-neighbour-click-refocuses-with-breadcrumb: clicking a neighbour invokes onFocus and pushes a breadcrumb; back returns to the prior centre', () => {
    const { centre, neighbour, selection } = buildWalkFixture();
    const onFocus = vi.fn();
    render(
      <LibraryFocusGraph assets={[centre, neighbour]} docs={[]} selection={selection} onFocus={onFocus} />,
    );

    fireEvent.click(screen.getByTestId(`lfg-node-${neighbour.id}`));

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        id: neighbour.id,
        title: neighbour.title,
        category: neighbour.category,
        source: 'asset',
      }),
    );

    const breadcrumb = screen.getByTestId('lfg-breadcrumb');
    expect(within(breadcrumb).getByText(centre.title)).toBeTruthy();

    fireEvent.click(screen.getByTestId('lfg-breadcrumb-back'));
    expect(onFocus).toHaveBeenCalledTimes(2);
    expect(onFocus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: centre.id,
        title: centre.title,
        category: centre.category,
        source: 'asset',
      }),
    );
  });
});

describe('LibraryFocusGraph — no fetch beyond the loaded corpus', () => {
  it('lfg-no-fetch-beyond-loaded: building and rendering the subgraph never calls fetch/docContent/socket', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { centre, neighbour, selection } = buildWalkFixture();
      const pureResult = buildFocusGraph({
        centre: selection,
        assets: [centre, neighbour],
        docs: [],
        depth: 1,
      });
      expect(pureResult.nodes.length).toBeGreaterThan(0);

      const onFocus = vi.fn();
      render(
        <LibraryFocusGraph assets={[centre, neighbour]} docs={[]} selection={selection} onFocus={onFocus} />,
      );
      fireEvent.click(screen.getByTestId('lfg-depth-increase'));
      fireEvent.click(screen.getByTestId(`lfg-node-${neighbour.id}`));

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
