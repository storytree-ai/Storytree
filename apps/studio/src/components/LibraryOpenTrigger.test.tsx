// @vitest-environment jsdom
//
// Behaviour test for the Library node-driven OPEN TRIGGER (ADR-0187 dec 2, increment 6 of the
// library-tech-tree-overlay story). Double-clicking a node on EITHER node surface — the overview
// constellation (`./LibraryOverview`) or the focus subgraph (`./LibraryFocusGraph`) — must fire an
// optional `onOpen(result)` prop with the node's finder-parity `SearchResult`: `{ source: 'asset',
// category }` for an artifact node, `{ source: 'doc', category: 'adr' }` for an ADR node — the SAME
// discriminant the existing single-click `onSelect`/`onFocus` paths already lift.
//
// This is ADDITIVE to the signed single-click contracts (`lov-*` in LibraryOverview.test.tsx,
// `lfg-*` in LibraryFocusGraph.test.tsx) — this file does not touch or re-assert them, only pins
// the NEW double-click-opens behaviour. No visual/colour/pixel/animation assertion here (the
// surfaces' appearance stays the incs-3/5 operator-attested legs, ADR-0070).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryOverview } from './LibraryOverview';
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

describe('LibraryOverview — node double-click opens', () => {
  // ── lot-overview-dblclick-opens ──────────────────────────────────────────────────
  it('lot-overview-dblclick-opens: double-clicking a node invokes onOpen with the finder-parity SearchResult — asset source "asset", ADR source "doc" category "adr"', () => {
    const onOpen = vi.fn();
    const hubAsset = asset({ id: 'trigger-hub-asset', category: 'principle', title: 'Trigger Hub Asset' });
    const hubAdr = doc({ id: 'decisions/9001-trigger-decision.md', title: 'Trigger Decision Record' });

    render(
      <LibraryOverview
        assets={[hubAsset]}
        docs={[hubAdr]}
        onSelect={vi.fn()}
        onOpen={onOpen}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId(`library-overview-node-${hubAsset.id}`));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: hubAsset.id,
        title: hubAsset.title,
        category: hubAsset.category,
        source: 'asset',
      }),
    );

    fireEvent.doubleClick(screen.getByTestId(`library-overview-node-${hubAdr.id}`));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: hubAdr.id,
        title: hubAdr.title,
        category: 'adr',
        source: 'doc',
      }),
    );
  });
});

describe('LibraryFocusGraph — node double-click opens', () => {
  // ── lot-subgraph-dblclick-opens ──────────────────────────────────────────────────
  it('lot-subgraph-dblclick-opens: double-clicking a neighbour node invokes onOpen with the finder-parity SearchResult, without requiring a re-focus click', () => {
    const onOpen = vi.fn();
    const centre = asset({ id: 'trigger-walk-centre', title: 'Trigger Walk Centre', category: 'definition' });
    const neighbour = asset({
      id: 'trigger-walk-neighbour',
      title: 'Trigger Walk Neighbour',
      category: 'pattern',
      references: ['asset:trigger-walk-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, neighbour]}
        docs={[]}
        selection={selectionFor(centre)}
        onFocus={vi.fn()}
        onOpen={onOpen}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId(`lfg-node-${neighbour.id}`));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        id: neighbour.id,
        title: neighbour.title,
        category: neighbour.category,
        source: 'asset',
      }),
    );
  });
});
