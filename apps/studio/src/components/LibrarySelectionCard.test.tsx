// @vitest-environment jsdom
//
// Behaviour test for the pinned Library SELECTION CARD (ADR-0188 dec 3, the structural fix for
// the attested blank-panel bug, `library-selection-card` capability of the
// library-tech-tree-overlay story). Its honest proof is the card AS A WHOLE — spanning the null
// gate, the artifact branch (title + kindLabel kind + a corpus-looked-up description), the
// DECISION case (its status + a load-bearing badge), the Open→onOpen wiring, and the tolerant
// stale-selection guard — all pinned in this ONE file (ADR-0122 — `storytree coverage` scans only
// `real.testFile`).
//
// ★ A DECISION IS AN ARTIFACT, AND ITS LOAD-BEARING TAG COMES OFF THE ARTIFACT (ADR-0403 dec 1).
// The `lsel-adr-*` contracts below built their decision as a `DocMeta` with `group: 'Decisions'`
// and a `loadBearing` frontmatter fold, and drove the card with `source: 'doc'`. PR #1546 deleted
// that producer, which left the badge with NO source at all — an always-`undefined` lookup
// rendering an always-absent badge, green in this file only because the fixture supplied the
// deleted shape itself. The tag rides `GuidanceAsset.loadBearing` now, crossed from the store row
// by `renderStoredDoc`, and the card reads it on the artifact branch where a decision now lands.
//
//   • lsel-null-renders-nothing                    — a null selection renders nothing.
//   • lsel-asset-shows-title-kind-and-description   — an asset selection renders its title,
//                                                      `kindLabel` kind, and its description
//                                                      looked up from the loaded `assets` corpus
//                                                      (a `SearchResult` carries no description).
//   • lsel-adr-shows-status-and-loadbearing-badge   — a decision selection renders its title,
//                                                      status, and a load-bearing badge rendered
//                                                      exactly when the matching
//                                                      `GuidanceAsset.loadBearing` is `true`
//                                                      (absent/false → no badge).
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

afterEach(cleanup);

describe('LibrarySelectionCard', () => {
  // ── lsel-null-renders-nothing ─────────────────────────────────────────────────
  it('lsel-null-renders-nothing: a null selection renders nothing — no card, no Open button', () => {
    const { container } = render(
      <LibrarySelectionCard selection={null} assets={[]} onOpen={vi.fn()} />,
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
      <LibrarySelectionCard selection={selection} assets={[other, widget]} onOpen={vi.fn()} />,
    );

    expect(screen.getByText(widget.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-kind').textContent).toBe('principle');
    expect(screen.getByTestId('library-selection-description').textContent).toBe(
      widget.description,
    );
  });

  // ── lsel-adr-shows-status-and-loadbearing-badge ───────────────────────────────────
  describe('lsel-adr-shows-status-and-loadbearing-badge', () => {
    function decisionSelection(a: GuidanceAsset): SearchResult {
      return { id: a.id, title: a.title, category: 'adr', source: 'asset' };
    }

    it('a decision selection renders its title, status, and a load-bearing badge when the matching GuidanceAsset.loadBearing is true', () => {
      const decision = asset({
        id: 'adr-0099',
        category: 'adr',
        title: 'Test Decision',
        status: 'accepted',
        loadBearing: true,
      });

      render(
        <LibrarySelectionCard
          selection={decisionSelection(decision)}
          assets={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.getByText(decision.title)).not.toBeNull();
      expect(screen.getByTestId('library-selection-status').textContent).toBe('accepted');
      expect(screen.getByTestId('library-selection-loadbearing-badge')).not.toBeNull();
    });

    it('a decision selection renders NO load-bearing badge when the matching GuidanceAsset.loadBearing is false', () => {
      const decision = asset({
        id: 'adr-0100',
        category: 'adr',
        title: 'Other Decision',
        status: 'proposed',
        loadBearing: false,
      });

      render(
        <LibrarySelectionCard
          selection={decisionSelection(decision)}
          assets={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.getByTestId('library-selection-status').textContent).toBe('proposed');
      expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
    });

    it('a decision selection whose matching artifact carries no loadBearing field renders no badge', () => {
      const decision = asset({
        id: 'adr-0101',
        category: 'adr',
        title: 'Third Decision',
        status: 'accepted',
      });

      render(
        <LibrarySelectionCard
          selection={decisionSelection(decision)}
          assets={[decision]}
          onOpen={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
    });

    // THE BADGE FENCE. The badge's producer was deleted in PR #1546 and nothing went red, because
    // the fixture built the deleted shape. Pin the direction: the tag must come off the ARTIFACT.
    it('sources the load-bearing badge from the artifact — a decision selection carrying nothing but its id resolves the tag from the corpus', () => {
      const decision = asset({
        id: 'adr-0102',
        category: 'adr',
        title: 'Load Bearing Decision',
        status: 'accepted',
        loadBearing: true,
      });

      render(
        <LibrarySelectionCard
          selection={{ id: decision.id, title: decision.title, category: 'adr', source: 'asset' }}
          assets={[decision]}
          onOpen={vi.fn()}
        />,
      );

      // Neither the status nor the badge was carried on the selection — both came from the row.
      expect(screen.getByTestId('library-selection-status').textContent).toBe('accepted');
      expect(screen.getByTestId('library-selection-loadbearing-badge')).not.toBeNull();
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

    render(<LibrarySelectionCard selection={selection} assets={[widget]} onOpen={onOpen} />);

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
      render(<LibrarySelectionCard selection={staleSelection} assets={[]} onOpen={vi.fn()} />),
    ).not.toThrow();

    expect(screen.getByText(staleSelection.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-kind').textContent).toBe('guardrail');
    expect(screen.queryByTestId('library-selection-description')).toBeNull();
  });

  it('lsel-stale-selection-renders-tolerantly: a stale decision selection whose id is absent from the corpus renders off the SearchResult alone (title + its own status), with no load-bearing badge and no crash', () => {
    const staleSelection: SearchResult = {
      id: 'adr-9999',
      title: 'Ghost Decision',
      category: 'adr',
      source: 'asset',
      status: 'proposed',
    };

    expect(() =>
      render(<LibrarySelectionCard selection={staleSelection} assets={[]} onOpen={vi.fn()} />),
    ).not.toThrow();

    expect(screen.getByText(staleSelection.title)).not.toBeNull();
    expect(screen.getByTestId('library-selection-status').textContent).toBe('proposed');
    expect(screen.queryByTestId('library-selection-loadbearing-badge')).toBeNull();
  });
});
