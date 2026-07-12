// @vitest-environment jsdom
//
// Behaviour test for the pinned Library SELECTION CARD (ADR-0188 dec 3, the structural fix for
// the attested blank-panel bug, `library-selection-card` capability of the
// library-tech-tree-overlay story). Its honest proof is the card AS A WHOLE — spanning the null
// gate, the asset branch (title + kindLabel kind + a corpus-looked-up description), the ADR
// branch (title + status + a load-bearing badge), the Open→onOpen wiring, and the tolerant
// stale-selection guard — all pinned in this ONE file (ADR-0122 — `storytree coverage` scans only
// `real.testFile`).
//
//   • lsel-null-renders-nothing                    — a null selection renders nothing.
//   • lsel-asset-shows-title-kind-and-description   — an asset selection renders its title,
//                                                      `kindLabel` kind, and its description
//                                                      looked up from the loaded `assets` corpus
//                                                      (a `SearchResult` carries no description).
//   • lsel-adr-shows-status-and-loadbearing-badge   — an ADR selection renders its title, status,
//                                                      and a load-bearing badge rendered exactly
//                                                      when the matching `DocMeta.loadBearing` is
//                                                      `true` (absent/false → no badge).
//   • lsel-open-button-fires-onopen                 — the "Open" button fires `onOpen(selection)`.
//   • lsel-stale-selection-renders-tolerantly        — a selection whose id is absent from the
//                                                      loaded corpus still renders off the
//                                                      `SearchResult` alone (title + kind), with no
//                                                      description/badge and no crash — the inc-3
//                                                      real-data crash-class guard.
//
// NOT pinned here (operator-attested, ADR-0188 dec 3/7 + ADR-0070): the forest-cozy palette, the
// card container styling, the load-bearing badge look, layout, and Open button styling. No
// visual/colour/pixel/animation assertion lives in this file.
//
// Offline-testable in jsdom (the LibraryFinder.test.tsx / LibraryDrawer.test.tsx discipline): no
// real fetch, no socket, no DB, no Electron, no agent/drive/model import (the
// modelPathBoundary.test.ts wall stays green).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibrarySelectionCard } from './LibrarySelectionCard';
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

afterEach(cleanup);

describe('LibrarySelectionCard', () => {
  // ── lsel-null-renders-nothing ─────────────────────────────────────────────────
  it('lsel-null-renders-nothing: a null selection renders nothing — no card, no Open button', () => {
    const { container } = render(
      <LibrarySelectionCard selection={null} assets={[]} docs={[]} onOpen={vi.fn()} />,
    );

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  // ── lsel-asset-shows-title-kind-and-description ─────────────────────────────────
  it('lsel-asset-shows-title-kind-and-description: an asset selection renders its title, its kindLabel kind, and its description looked up from the loaded corpus', () => {
    const widget = asset({
      id: 'widget-a',
      category: 'principle',
      title: 'Widget Alpha',
      description: 'The alpha widget explains itself carefully.',
    });
    const other = asset({
      id: 'widget-b',
      category: 'pattern',
      title: 'Widget Beta',
      description: 'A different description that must not leak through.',
    });
    const selection: SearchResult = {
      id: widget.id,
      title: widget.title,
      category: widget.category,
      source: 'asset',
    };

    render(
      <LibrarySelectionCard
        selection={selection}
        assets={[other, widget]}
        docs={[]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText(widget.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-kind').textContent).toBe('principle');
    expect(screen.getByTestId('library-selection-description').textContent).toBe(
      widget.description,
    );
  });

  // ── lsel-adr-shows-status-and-loadbearing-badge ───────────────────────────────────
  describe('lsel-adr-shows-status-and-loadbearing-badge', () => {
    it('an ADR selection renders its title, status, and a load-bearing badge when the matching DocMeta.loadBearing is true', () => {
      const decision = doc({
        id: 'decisions/0099-test-decision.md',
        title: 'Test Decision',
        status: 'accepted',
        loadBearing: true,
      });
      const selection: SearchResult = {
        id: decision.id,
        title: decision.title,
        category: 'adr',
        source: 'doc',
        status: decision.status,
      };

      render(
        <LibrarySelectionCard
          selection={selection}
          assets={[]}
          docs={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.getByText(decision.title)).not.toBeNull();
      expect(screen.getByTestId('library-selection-status').textContent).toBe('accepted');
      expect(screen.getByTestId('library-selection-loadbearing-badge')).not.toBeNull();
    });

    it('an ADR selection renders NO load-bearing badge when the matching DocMeta.loadBearing is false', () => {
      const decision = doc({
        id: 'decisions/0100-other-decision.md',
        title: 'Other Decision',
        status: 'proposed',
        loadBearing: false,
      });
      const selection: SearchResult = {
        id: decision.id,
        title: decision.title,
        category: 'adr',
        source: 'doc',
        status: decision.status,
      };

      render(
        <LibrarySelectionCard
          selection={selection}
          assets={[]}
          docs={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.getByTestId('library-selection-status').textContent).toBe('proposed');
      expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
    });

    it('an ADR selection whose matching DocMeta carries no loadBearing field renders no badge', () => {
      const decision = doc({
        id: 'decisions/0101-third-decision.md',
        title: 'Third Decision',
        status: 'accepted',
      });
      const selection: SearchResult = {
        id: decision.id,
        title: decision.title,
        category: 'adr',
        source: 'doc',
        status: decision.status,
      };

      render(
        <LibrarySelectionCard
          selection={selection}
          assets={[]}
          docs={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
    });
  });

  // ── lsel-open-button-fires-onopen ────────────────────────────────────────────────
  it('lsel-open-button-fires-onopen: the "Open"-labelled button fires onOpen with the current selection', () => {
    const widget = asset({ id: 'widget-c', category: 'pattern', title: 'Widget Gamma' });
    const selection: SearchResult = {
      id: widget.id,
      title: widget.title,
      category: widget.category,
      source: 'asset',
    };
    const onOpen = vi.fn();

    render(
      <LibrarySelectionCard selection={selection} assets={[widget]} docs={[]} onOpen={onOpen} />,
    );

    const openButton = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(openButton);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(selection);
  });

  // ── lsel-stale-selection-renders-tolerantly ──────────────────────────────────────
  it('lsel-stale-selection-renders-tolerantly: a stale asset selection whose id is absent from the loaded corpus renders off the SearchResult alone — title + kind, no description, no crash', () => {
    const staleSelection: SearchResult = {
      id: 'ghost-asset-id',
      title: 'Ghost Asset',
      category: 'guardrail',
      source: 'asset',
    };

    expect(() =>
      render(
        <LibrarySelectionCard
          selection={staleSelection}
          assets={[]}
          docs={[]}
          onOpen={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText(staleSelection.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-kind').textContent).toBe('guardrail');
    expect(screen.queryByTestId('library-selection-description')).toBeNull();
  });

  it('lsel-stale-selection-renders-tolerantly: a stale ADR selection whose id is absent from the docs corpus renders off the SearchResult alone (title + its own status), with no load-bearing badge and no crash', () => {
    const staleSelection: SearchResult = {
      id: 'decisions/9999-ghost.md',
      title: 'Ghost Decision',
      category: 'adr',
      source: 'doc',
      status: 'proposed',
    };

    expect(() =>
      render(
        <LibrarySelectionCard
          selection={staleSelection}
          assets={[]}
          docs={[]}
          onOpen={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText(staleSelection.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-status').textContent).toBe('proposed');
    expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
  });
});
