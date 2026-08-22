// @vitest-environment jsdom
//
// Behaviour test for the Library node-driven OPEN TRIGGER (ADR-0187 dec 2, increment 6 of the
// library-tech-tree-overlay story). Double-clicking a node on EITHER node surface — the overview
// constellation (`./LibraryOverview`) or the focus subgraph (`./LibraryFocusGraph`) — must fire an
// optional `onOpen(result)` prop with the node's finder-parity `SearchResult` —
// `{ source: 'asset', category }` — the SAME discriminant the existing single-click
// `onSelect`/`onFocus` paths already lift.
//
// A DECISION IS AN ARTIFACT NODE (ADR-0403 dec 1). This file used to pin a second shape,
// `{ source: 'doc', category: 'adr' }`, for a node built from a `docs/decisions/*.md` DocMeta.
// PR #1546 deleted that producer, so the overview's doc fold could only ever have drawn a
// REFERENCE document wearing a decision's label; the decision case is an `adr` ASSET now, which is
// how `/api/assets` really serves it.
//
// This is ADDITIVE to the signed single-click contracts (`lov-*` in LibraryOverview.test.tsx,
// `lfg-*` in LibraryFocusGraph.test.tsx) — this file does not touch or re-assert them, only pins
// the NEW double-click-opens behaviour. No visual/colour/pixel/animation assertion here (the
// surfaces' appearance stays the incs-3/5 operator-attested legs, ADR-0070).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryOverview } from './LibraryOverview';
import { LibraryFocusGraph } from './LibraryFocusGraph';
import type { GuidanceAsset } from '../types';
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

function selectionFor(a: GuidanceAsset): SearchResult {
  return { id: a.id, title: a.title, category: a.category, source: 'asset' };
}

afterEach(cleanup);

describe('LibraryOverview — node double-click opens', () => {
  // ── lot-overview-dblclick-opens ──────────────────────────────────────────────────
  it('lot-overview-dblclick-opens: double-clicking a node invokes onOpen with the finder-parity SearchResult — source "asset" and the artifact\'s own category, a decision included', () => {
    const onOpen = vi.fn();
    const hubAsset = asset({ id: 'trigger-hub-asset', category: 'principle', title: 'Trigger Hub Asset' });
    const hubAdr = asset({
      id: 'adr-9001',
      category: 'adr',
      title: 'Trigger Decision Record',
      status: 'accepted',
    });

    render(
      <LibraryOverview
        assets={[hubAsset, hubAdr]}
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
        source: 'asset',
        status: 'accepted',
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
      // FIXTURE ONLY (ADR-0223): the focus walk moved from `references` to the authored `dependsOn`
      // dependency edge, so a neighbour is now made by standing ON the centre. The graph shape this
      // produces — one downstream neighbour of the centre — is IDENTICAL to what the citation
      // fixture produced, and this contract (double-click a neighbour fires onOpen with its
      // finder-parity SearchResult) is untouched, as is the `lfg-node-<id>` testid it clicks.
      dependsOn: ['asset:trigger-walk-centre'],
    });

    render(
      <LibraryFocusGraph
        assets={[centre, neighbour]}
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
