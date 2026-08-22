// @vitest-environment jsdom
//
// Behaviour + ranking test for the Library FINDER (ADR-0185 dec 2/3, increment 2 of the
// library-tech-tree-overlay story). This capability's honest proof spans two things:
//
//   • the PURE ranking heart `searchCorpus(query, assets)` (`../lib/librarySearch`) — artifacts
//     match on id/title/description/body (strong-field-first ranking), and an
//     empty/whitespace/too-short query yields nothing;
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — a search box + results list, taking
//     `assets`/`onSelect`/`selectedId` as PROPS (no backend seam), rendering each result as
//     a title over a `kindLabel(category, arcDisplay)` sub-line (an `arc` asset reads "epic", never
//     the raw key "arc" — trap j), showing a decision's status, and lifting the click through
//     `onSelect` while marking the selected row.
//
// ★ DECISIONS ARE ARTIFACTS, AND `docs` IS NOT SEARCHED (ADR-0403 dec 1). The `lf-adrs-*` contracts
// below used to build ADRs as `DocMeta`s with `group: 'Decisions'` and `decisions/NNNN-*.md` ids —
// a shape PR #1546's walker can no longer emit, and one `DocMeta` can no longer express. The finder
// takes no `docs` at all now: `searchCorpus` folded every doc in as `category: 'adr'`, which after
// the deletion meant the REFERENCE documents were the only thing wearing that label. The
// title/id-only rule those contracts pinned was a property of `DocMeta` carrying no body; an `adr`
// artifact DOES carry its body on the wire, so a decision matches on all four fields like any other
// artifact, and the rule retires with its subject.
//
// NOT pinned here (the story's operator-attested UAT leg 2, ADR-0070): the forest-cozy palette, the
// muted sub-line styling, the selected-row highlight colour, and the real mount into
// LibraryDrawer's peek slot. No visual/colour assertion lives in this file.
//
// No real fetch/docContent/socket/DB/Electron — the finder holds no backend seam of its own.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { searchCorpus } from '../lib/librarySearch';
import { LibraryFinder } from './LibraryFinder';
import type { GuidanceAsset } from '../types';

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

// A shared small fixed corpus, per the integration test's own guidance:
//   - gizmoWidget:   an asset whose id/title both carry the term "gizmo" (strong-field hit).
//   - otherThing:    an asset that carries "gizmo" ONLY in its description (weak-field hit).
//   - epicInitiative: an `arc` asset (for the kindLabel sub-line trap), title carries "migration".
//   - gizmoAdr:      a DECISION whose title carries "gizmo" — an `adr` artifact, the shape
//                    `/api/assets` serves since ADR-0403 dec 1.
//   - quietAdr:      a decision that carries "gizmo" nowhere at all, so it must never surface.
const gizmoWidget = asset({
  id: 'gizmo-widget',
  title: 'The Gizmo Widget',
  category: 'definition',
});

const otherThing = asset({
  id: 'other-thing',
  title: 'Other Thing',
  category: 'pattern',
  description: 'this description mentions a gizmo, nothing else does',
});

const epicInitiative = asset({
  id: 'epic-initiative',
  title: 'The Great Migration',
  category: 'arc',
});

const gizmoAdr = asset({
  id: 'adr-0001',
  category: 'adr',
  title: 'Gizmo Decision Record',
  status: 'accepted',
});

const quietAdr = asset({
  id: 'adr-0002',
  category: 'adr',
  title: 'Something Else Entirely',
  description: 'nothing in common',
  body: 'nothing in common',
  status: 'proposed',
});

afterEach(cleanup);

// ---------- the pure ranking heart ----------

describe('searchCorpus', () => {
  // ── lf-search-ranks-asset-matches-across-fields ─────────────────────────────────
  it('lf-search-ranks-asset-matches-across-fields: an id/title hit outranks a description/body-only hit, all four asset fields are match surfaces', () => {
    const results = searchCorpus('gizmo', [gizmoWidget, otherThing]);
    const ids = results.map((r) => r.id);
    expect(ids).toContain('gizmo-widget');
    expect(ids).toContain('other-thing');
    expect(ids.indexOf('gizmo-widget')).toBeLessThan(ids.indexOf('other-thing'));
  });

  it('lf-search-ranks-asset-matches-across-fields: a body-only hit is still found', () => {
    const bodyOnly = asset({
      id: 'body-only-match',
      title: 'Totally Unrelated Title',
      category: 'principle',
      body: 'deep in the body, the word wombat appears exactly once',
    });
    const results = searchCorpus('wombat', [bodyOnly]);
    expect(results.map((r) => r.id)).toContain('body-only-match');
  });

  // ── lf-adrs-matched-on-title-and-id-only (v2: decisions are artifacts) ──────────
  it('lf-adrs-matched-on-title-and-id-only: a decision matching in title surfaces with its status; one matching nowhere does not', () => {
    const results = searchCorpus('gizmo', [gizmoAdr, quietAdr]);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(gizmoAdr.id);
    expect(ids).not.toContain(quietAdr.id);
    expect(results.find((r) => r.id === gizmoAdr.id)?.status).toBe('accepted');
    expect(results.find((r) => r.id === gizmoAdr.id)?.source).toBe('asset');
  });

  it('lf-adrs-matched-on-title-and-id-only: a decision matching only by id also surfaces', () => {
    const idOnlyAdr = asset({
      id: 'adr-9999',
      category: 'adr',
      title: 'A Title With Nothing In Common',
      description: 'nothing in common',
      body: 'nothing in common',
    });
    const results = searchCorpus('9999', [idOnlyAdr]);
    expect(results.map((r) => r.id)).toContain(idOnlyAdr.id);
  });

  // THE FOLD FENCE. `searchCorpus` looped `docs` and pushed every entry as `category: 'adr'`. It
  // takes no `docs` at all now, so a reference document cannot re-enter the Library wearing a
  // decision's label — which is what made the Decisions scope list reference material.
  it('lf-adrs-matched-on-title-and-id-only: only artifacts are ranked, and every result is source "asset"', () => {
    const results = searchCorpus('gizmo', [gizmoWidget, otherThing, gizmoAdr]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === 'asset')).toBe(true);
  });

  // ── lf-short-or-empty-query-yields-no-results ───────────────────────────────────
  it('lf-short-or-empty-query-yields-no-results: empty, whitespace, and a below-floor 1-char query all return nothing', () => {
    const assets = [gizmoWidget, otherThing, gizmoAdr, quietAdr];
    expect(searchCorpus('', assets)).toEqual([]);
    expect(searchCorpus('   ', assets)).toEqual([]);
    expect(searchCorpus('g', assets)).toEqual([]);
  });
});

// ---------- the component ----------

describe('LibraryFinder', () => {
  // ── lf-short-or-empty-query-yields-no-results (component side) ─────────────────
  it('lf-short-or-empty-query-yields-no-results: with no query, the finder renders no result rows', () => {
    render(
      <LibraryFinder assets={[gizmoWidget, otherThing, gizmoAdr]} onSelect={vi.fn()} />,
    );
    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
  });

  // ── RETIRED by ADR-0197 D5 (2026-07-15) ────────────────────────────────────────
  // lf-result-renders-title-and-kind-subline-via-kindLabel, lf-adr-result-shows-status,
  // and lf-click-invokes-onselect-and-marks-selection drove fixtures that project `active`
  // and are hidden under the selector's default `open` state. Their still-true behaviours
  // re-home as lls-selector-filters-search / lls-selector-filters-scoped-browse in
  // LibraryLifecycleShelf.test.tsx (see library-finder.md's reconciliation banner).
});
