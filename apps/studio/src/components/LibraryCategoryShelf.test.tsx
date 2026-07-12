// @vitest-environment jsdom
//
// Idle-browse + scoped-search rework of the Library FINDER (ADR-0188 dec 2, the browse-entry half
// of the library-tech-tree-overlay story). This capability's honest proof spans:
//
//   • the PURE grouping/listing heart `buildCategoryShelf` / `listCategoryResults`
//     (`../lib/libraryShelf`, NET-NEW) — group `assets` by `category` into one shelf entry per
//     category PRESENT (with its count), plus a Decisions entry from `docs`; and list ALL of a
//     scoped category's artifacts as finder-parity `SearchResult`s with no query floor;
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — an IDLE state that renders the category
//     shelf (no query, no scope), a category click that turns into a removable scope chip and
//     browses all of that category's artifacts, typing while scoped that filters within the scope
//     (via `searchCorpus`) with a scope-named placeholder, and clearing the chip that returns to
//     the shelf. The `onSelect` lift on a scoped/browse row click is the SAME finder-parity
//     `SearchResult` the inc-2 finder already lifts.
//
// NOT pinned here (operator-attested, ADR-0188 dec 2/7 + ADR-0070): the forest-cozy palette, the
// full-width input styling, shelf row look, category icons, and the scope-chip look. No visual/
// colour/pixel assertion lives in this file.
//
// This file does NOT touch `LibraryFinder.test.tsx` — the signed `lf-*` contracts there stay
// byte-green (they drive the finder with a typed query and no scope, unaffected by this rework).
//
// No real fetch/docContent/socket/DB/Electron — the finder holds no backend seam of its own.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { buildCategoryShelf, listCategoryResults } from '../lib/libraryShelf';
import { LibraryFinder } from './LibraryFinder';
import type { GuidanceAsset, DocMeta } from '../types';

const NOW = '2026-01-01T00:00:00.000Z';

function asset(overrides: Partial<GuidanceAsset> & Pick<GuidanceAsset, 'id' | 'category' | 'title'>): GuidanceAsset {
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

// A shared small fixed corpus:
//   - widgetA / widgetB: two `definition` assets (title carries "Migration" on widgetA only, so a
//     scoped "migration" query can prove cross-category exclusion against arcY below).
//   - patternX:          a single `pattern` asset (a lone-count category row).
//   - arcY:               a single `arc` asset whose title ALSO carries "Migration" — proves the
//                          scoped filter keeps only the scope's own category, not every corpus hit.
//   - `principle` has NO asset at all — proves an absent category gets no shelf row.
//   - doc1 / doc2:        two ADRs (the Decisions pseudo-scope).
const widgetA = asset({ id: 'widget-a', category: 'definition', title: 'Widget Alpha Migration' });
const widgetB = asset({ id: 'widget-b', category: 'definition', title: 'Widget Beta' });
const patternX = asset({ id: 'pattern-x', category: 'pattern', title: 'Some Pattern' });
const arcY = asset({ id: 'arc-y', category: 'arc', title: 'Big Migration Arc' });

const doc1 = doc({ id: 'decisions/0001-a.md', title: 'Decision Alpha', status: 'accepted' });
const doc2 = doc({ id: 'decisions/0002-b.md', title: 'Decision Beta', status: 'proposed' });

const ASSETS = [widgetA, widgetB, patternX, arcY];
const DOCS = [doc1, doc2];

afterEach(cleanup);

// ---------- the pure grouping/listing heart ----------

describe('libraryShelf', () => {
  // ── lcs-shelf-groups-corpus-by-category ─────────────────────────────────────────
  it('lcs-shelf-groups-corpus-by-category: one entry per category PRESENT with its count; an absent category gets no entry; a Decisions entry counts the docs', () => {
    const shelf = buildCategoryShelf(ASSETS, DOCS);

    const definitionEntry = shelf.find((e) => e.category === 'definition');
    expect(definitionEntry?.count).toBe(2);

    const patternEntry = shelf.find((e) => e.category === 'pattern');
    expect(patternEntry?.count).toBe(1);

    const arcEntry = shelf.find((e) => e.category === 'arc');
    expect(arcEntry?.count).toBe(1);

    // `principle` has zero assets in the loaded corpus — no row for it.
    expect(shelf.find((e) => e.category === 'principle')).toBeUndefined();

    const decisionsEntry = shelf.find((e) => e.category === 'adr');
    expect(decisionsEntry?.count).toBe(2);
  });

  it('lcs-shelf-groups-corpus-by-category: listCategoryResults browses ALL of a scoped category with no query floor', () => {
    const definitionResults = listCategoryResults('definition', ASSETS, DOCS);
    expect(definitionResults.map((r) => r.id)).toEqual(['widget-a', 'widget-b']);
    expect(definitionResults.every((r) => r.source === 'asset' && r.category === 'definition')).toBe(true);

    const adrResults = listCategoryResults('adr', ASSETS, DOCS);
    expect(adrResults.map((r) => r.id)).toEqual([doc1.id, doc2.id]);
    expect(adrResults.every((r) => r.source === 'doc' && r.category === 'adr')).toBe(true);
    expect(adrResults.find((r) => r.id === doc1.id)?.status).toBe('accepted');
  });
});

// ---------- the component ----------

describe('LibraryFinder — idle shelf + scoped browse/search', () => {
  // ── lcs-idle-renders-category-shelf ─────────────────────────────────────────────
  it('lcs-idle-renders-category-shelf: with no query and no scope, the finder renders one shelf row per present category (with counts) plus a Decisions row, and no result rows', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    expect(screen.getByTestId('library-shelf-row-definition').textContent).toContain('2');
    expect(screen.getByTestId('library-shelf-row-pattern').textContent).toContain('1');
    expect(screen.getByTestId('library-shelf-row-arc').textContent).toContain('1');
    expect(screen.getByTestId('library-shelf-decisions-row').textContent).toContain('2');

    // no row for an absent category
    expect(screen.queryByTestId('library-shelf-row-principle')).toBeNull();

    // the idle state is a shelf, never a results list
    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
  });

  // ── lcs-category-click-scopes-and-lists-all ─────────────────────────────────────
  it('lcs-category-click-scopes-and-lists-all: clicking a category row scopes to it, browses ALL its artifacts with no typing, and hides the shelf', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-definition'));

    // both definition artifacts are listed with no query typed
    expect(screen.getByTestId('library-finder-row-widget-a')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-widget-b')).toBeTruthy();
    // other categories are excluded from the scoped browse
    expect(screen.queryByTestId('library-finder-row-pattern-x')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-arc-y')).toBeNull();

    // the shelf is gone while scoped
    expect(screen.queryByTestId('library-shelf-row-definition')).toBeNull();
    expect(screen.queryByTestId('library-shelf-row-pattern')).toBeNull();

    // a removable scope chip names the active scope
    const chip = screen.getByTestId('library-scope-chip');
    expect(chip.textContent?.toLowerCase()).toContain('definition');
  });

  it('lcs-category-click-scopes-and-lists-all: clicking the Decisions row scopes to docs only', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-decisions-row'));

    expect(screen.getByTestId(`library-finder-row-${doc1.id}`)).toBeTruthy();
    expect(screen.getByTestId(`library-finder-row-${doc2.id}`)).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-widget-a')).toBeNull();
    expect(screen.getByTestId('library-scope-chip')).toBeTruthy();
  });

  // ── lcs-scoped-typing-filters-within-scope ──────────────────────────────────────
  it('lcs-scoped-typing-filters-within-scope: typing while scoped filters to the scope\'s category only, and the placeholder names the scope', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    const box = screen.getByRole('textbox') as HTMLInputElement;
    const genericPlaceholder = box.getAttribute('placeholder');
    expect(genericPlaceholder?.toLowerCase()).not.toContain('definition');

    fireEvent.click(screen.getByTestId('library-shelf-row-definition'));

    const scopedPlaceholder = box.getAttribute('placeholder');
    expect(scopedPlaceholder?.toLowerCase()).toContain('definition');
    expect(scopedPlaceholder).not.toBe(genericPlaceholder);

    // "migration" matches widgetA (definition) AND arcY (arc) across the whole corpus, but the
    // definition scope must keep only the in-scope hit.
    fireEvent.change(box, { target: { value: 'migration' } });

    expect(screen.getByTestId('library-finder-row-widget-a')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-widget-b')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-arc-y')).toBeNull();
  });

  // ── lcs-clear-chip-returns-to-shelf ──────────────────────────────────────────────
  it('lcs-clear-chip-returns-to-shelf: removing the scope chip (empty query) clears the scope and renders the shelf again', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-definition'));
    expect(screen.getByTestId('library-scope-chip')).toBeTruthy();

    fireEvent.click(screen.getByTestId('library-scope-chip-remove'));

    expect(screen.queryByTestId('library-scope-chip')).toBeNull();
    expect(screen.getByTestId('library-shelf-row-definition').textContent).toContain('2');
    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
  });

  // ── lcs-scoped-row-click-lifts-searchresult ─────────────────────────────────────
  it('lcs-scoped-row-click-lifts-searchresult: clicking a row in the scoped browse list invokes onSelect with the finder-parity SearchResult', () => {
    const onSelect = vi.fn();
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-definition'));
    fireEvent.click(screen.getByTestId('library-finder-row-widget-a'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: widgetA.id,
        title: widgetA.title,
        category: 'definition',
        source: 'asset',
      }),
    );
  });
});
