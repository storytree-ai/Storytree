// @vitest-environment jsdom
//
// Behaviour + ranking test for the Library FINDER (ADR-0185 dec 2/3, increment 2 of the
// library-tech-tree-overlay story). This capability's honest proof spans two things:
//
//   • the PURE ranking heart `searchCorpus(query, assets, docs)` (`../lib/librarySearch`) — assets
//     match on id/title/description/body (strong-field-first ranking), ADRs (docs) match on
//     title/id ONLY, never body/excerpt (trap g — DocMeta carries no body, no fetch), and an
//     empty/whitespace/too-short query yields nothing;
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — a search box + results list, taking
//     `assets`/`docs`/`onSelect`/`selectedId` as PROPS (no backend seam), rendering each result as
//     a title over a `kindLabel(category, arcDisplay)` sub-line (an `arc` asset reads "epic", never
//     the raw key "arc" — trap j), showing an ADR result's status, and lifting the click through
//     `onSelect` while marking the selected row.
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

// A shared small fixed corpus, per the integration test's own guidance:
//   - gizmoWidget:   an asset whose id/title both carry the term "gizmo" (strong-field hit).
//   - otherThing:    an asset that carries "gizmo" ONLY in its description (weak-field hit).
//   - epicInitiative: an `arc` asset (for the kindLabel sub-line trap), title carries "migration".
//   - gizmoAdr:      an ADR whose TITLE carries "gizmo".
//   - quietAdr:      an ADR whose title does NOT carry "gizmo" — only its excerpt does, so it must
//                    never surface for a "gizmo" query (ADRs match title/id only).
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

const gizmoAdr = doc({
  id: 'decisions/0001-gizmo-decision.md',
  title: 'Gizmo Decision Record',
  status: 'accepted',
});

const quietAdr = doc({
  id: 'decisions/0002-other-decision.md',
  title: 'Something Else Entirely',
  excerpt: 'this excerpt mentions a gizmo but the title does not',
  status: 'proposed',
});

afterEach(cleanup);

// ---------- the pure ranking heart ----------

describe('searchCorpus', () => {
  // ── lf-search-ranks-asset-matches-across-fields ─────────────────────────────────
  it('lf-search-ranks-asset-matches-across-fields: an id/title hit outranks a description/body-only hit, all four asset fields are match surfaces', () => {
    const results = searchCorpus('gizmo', [gizmoWidget, otherThing], []);
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
    const results = searchCorpus('wombat', [bodyOnly], []);
    expect(results.map((r) => r.id)).toContain('body-only-match');
  });

  // ── lf-adrs-matched-on-title-and-id-only ────────────────────────────────────────
  it('lf-adrs-matched-on-title-and-id-only: an ADR matching in title surfaces; one matching only in its excerpt does not', () => {
    const results = searchCorpus('gizmo', [], [gizmoAdr, quietAdr]);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(gizmoAdr.id);
    expect(ids).not.toContain(quietAdr.id);
  });

  it('lf-adrs-matched-on-title-and-id-only: an ADR matching only by id also surfaces', () => {
    const idOnlyAdr = doc({
      id: 'decisions/gizmo-slug.md',
      title: 'A Title With Nothing In Common',
    });
    const results = searchCorpus('gizmo', [], [idOnlyAdr]);
    expect(results.map((r) => r.id)).toContain(idOnlyAdr.id);
  });

  // ── lf-short-or-empty-query-yields-no-results ───────────────────────────────────
  it('lf-short-or-empty-query-yields-no-results: empty, whitespace, and a below-floor 1-char query all return nothing', () => {
    const assets = [gizmoWidget, otherThing];
    const docs = [gizmoAdr, quietAdr];
    expect(searchCorpus('', assets, docs)).toEqual([]);
    expect(searchCorpus('   ', assets, docs)).toEqual([]);
    expect(searchCorpus('g', assets, docs)).toEqual([]);
  });
});

// ---------- the component ----------

describe('LibraryFinder', () => {
  // ── lf-short-or-empty-query-yields-no-results (component side) ─────────────────
  it('lf-short-or-empty-query-yields-no-results: with no query, the finder renders no result rows', () => {
    render(
      <LibraryFinder assets={[gizmoWidget, otherThing]} docs={[gizmoAdr]} onSelect={vi.fn()} />,
    );
    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
  });

  // ── lf-result-renders-title-and-kind-subline-via-kindLabel ─────────────────────
  it('lf-result-renders-title-and-kind-subline-via-kindLabel: each result shows its title and a kindLabel sub-line; an arc asset reads "epic", never the raw key', () => {
    render(
      <LibraryFinder
        assets={[gizmoWidget, epicInitiative]}
        docs={[]}
        onSelect={vi.fn()}
      />,
    );

    const box = screen.getByRole('textbox', { name: /search library/i });

    fireEvent.change(box, { target: { value: 'migration' } });
    const arcRow = screen.getByTestId(`library-finder-row-${epicInitiative.id}`);
    expect(within(arcRow).getByText(epicInitiative.title)).toBeTruthy();
    const arcSubline = screen.getByTestId(`library-finder-result-kind-${epicInitiative.id}`);
    expect(arcSubline.textContent).toBe('epic');
    expect(arcSubline.textContent).not.toBe('arc');

    fireEvent.change(box, { target: { value: 'gizmo' } });
    const defRow = screen.getByTestId(`library-finder-row-${gizmoWidget.id}`);
    expect(within(defRow).getByText(gizmoWidget.title)).toBeTruthy();
    const defSubline = screen.getByTestId(`library-finder-result-kind-${gizmoWidget.id}`);
    expect(defSubline.textContent).toBe('definition');
  });

  // ── lf-adr-result-shows-status ──────────────────────────────────────────────────
  it('lf-adr-result-shows-status: an ADR result additionally shows its status; an asset result shows none', () => {
    render(
      <LibraryFinder assets={[gizmoWidget]} docs={[gizmoAdr]} onSelect={vi.fn()} />,
    );
    const box = screen.getByRole('textbox', { name: /search library/i });
    fireEvent.change(box, { target: { value: 'gizmo' } });

    const adrStatus = screen.getByTestId(`library-finder-result-status-${gizmoAdr.id}`);
    expect(adrStatus.textContent).toBe('accepted');

    expect(screen.queryByTestId(`library-finder-result-status-${gizmoWidget.id}`)).toBeNull();
  });

  // ── lf-click-invokes-onselect-and-marks-selection ───────────────────────────────
  it('lf-click-invokes-onselect-and-marks-selection: clicking a result invokes onSelect with that result, and selectedId marks the picked row', () => {
    const onSelect = vi.fn();
    render(
      <LibraryFinder
        assets={[gizmoWidget, otherThing]}
        docs={[]}
        onSelect={onSelect}
      />,
    );
    const box = screen.getByRole('textbox', { name: /search library/i });
    fireEvent.change(box, { target: { value: 'gizmo' } });

    const row = screen.getByTestId(`library-finder-row-${gizmoWidget.id}`);
    fireEvent.click(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: gizmoWidget.id,
        title: gizmoWidget.title,
        category: gizmoWidget.category,
        source: 'asset',
      }),
    );
    cleanup();

    render(
      <LibraryFinder
        assets={[gizmoWidget, otherThing]}
        docs={[]}
        onSelect={onSelect}
        selectedId={gizmoWidget.id}
      />,
    );
    const box2 = screen.getByRole('textbox', { name: /search library/i });
    fireEvent.change(box2, { target: { value: 'gizmo' } });

    const selectedRow = screen.getByTestId(`library-finder-row-${gizmoWidget.id}`);
    expect(selectedRow.getAttribute('aria-current')).toBe('true');
    const otherRow = screen.getByTestId(`library-finder-row-${otherThing.id}`);
    expect(otherRow.getAttribute('aria-current')).not.toBe('true');
  });
});
