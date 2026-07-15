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

// RETIRED by ADR-0197 D5 (2026-07-15): the entire LibraryFinder idle-shelf/scoped-browse
// describe block (lcs-idle-renders-category-shelf, both lcs-category-click-scopes-and-lists-all
// cases, lcs-scoped-typing-filters-within-scope, lcs-clear-chip-returns-to-shelf,
// lcs-scoped-row-click-lifts-searchresult) drove the unfiltered shelf/browse the three-state
// selector replaces; its durable-kind fixtures are hidden under the default open state.
// Still-true behaviours re-home into the lls-* v2 contracts in LibraryLifecycleShelf.test.tsx
// (see library-category-shelf.md reconciliation banner).
