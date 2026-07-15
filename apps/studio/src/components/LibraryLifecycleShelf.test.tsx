// @vitest-environment jsdom
//
// The ONE-SELECTOR-GOVERNS-THE-PANEL rework (ADR-0197, the `library-lifecycle-shelf` capability —
// the sibling `library-lifecycle-wire` owns the pure `lifecycleOf` projection + the plan-`status`
// wire it consumes). This capability's honest proof spans:
//
//   • the reworked pure count heart `buildCategoryShelf` (`../lib/libraryShelf`) — ADDING a
//     per-state `stateCounts` (open/active/archived, via `lifecycleOf` from `@storytree/library`)
//     to each entry alongside the EXISTING total `count`, with the Decisions entry's per-state
//     counts still scoped to `group === 'Decisions'` docs only;
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — ONE three-state `open | active |
//     archived` selector (default `open`, component-local state) that REPLACES the retired
//     Active|All toggle; the selected state governs the shelf (only categories with ≥1 item in
//     the state render, each with a PLAIN per-state count — the "N of M" muted-total split is
//     gone), the scoped browse (uniformly for every kind — the friction/Decisions chips-only
//     exception is gone), and the typed search (assets + Decisions alike); the per-kind state
//     chips retire outright; and empty states render one quiet line.
//
// NOT pinned here (operator-attested, ADR-0197 D1 + ADR-0070): the forest-cozy palette, the
// selector's segmented styling, the empty-state copy's look, and any typography. No visual/
// colour/pixel/animation assertion lives in this file.
//
// FENCE: this file does NOT touch `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx` — the
// surviving `lf-*` / `lcs-*` contracts there stay byte-green (see the node spec's FENCE section);
// the re-tensed blocks were trimmed by the orchestrator before this build (ADR-0197 D5).
//
// No real fetch/docContent/socket/DB/Electron — the finder holds no backend seam of its own.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { buildCategoryShelf } from '../lib/libraryShelf';
import { LibraryFinder } from './LibraryFinder';
import type { GuidanceAsset, DocMeta } from '../types';

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

// ---------- fixture corpus ----------
//
// friction (open/archived, derived from `fields.route` — friction is never `active`): 3 items,
// 1 open, 0 active, 2 archived.
const frictionOpen = asset({
  id: 'friction-open',
  category: 'friction',
  title: 'An unrouted friction item',
});
const frictionRouted = asset({
  id: 'friction-routed',
  category: 'friction',
  title: 'A routed friction item',
  fields: { route: 'story-author' },
});
const frictionArchived = asset({
  id: 'friction-archived',
  category: 'friction',
  title: 'An archived (nothing-routed) friction item',
  fields: { route: 'nothing' },
});
const FRICTION = [frictionOpen, frictionRouted, frictionArchived];

// plan (open/active/archived, projected from the `status` wire mirror): 4 items, one per state
// plus a second archived one — 1 open, 1 active, 2 archived.
const planDraft = asset({
  id: 'plan-draft',
  category: 'plan',
  title: 'A draft plan',
  status: 'draft',
});
const planReady = asset({
  id: 'plan-ready',
  category: 'plan',
  title: 'A ready plan',
  status: 'ready',
});
const planConsumed = asset({
  id: 'plan-consumed',
  category: 'plan',
  title: 'A consumed plan',
  status: 'consumed',
});
const planRetired = asset({
  id: 'plan-retired',
  category: 'plan',
  title: 'A retired plan',
  status: 'retired',
});
const PLAN = [planDraft, planReady, planConsumed, planRetired];

// two evergreen-active (stateless) categories — never `open`, never `archived`.
const patternX = asset({ id: 'pattern-x', category: 'pattern', title: 'Some Pattern' });
const epicMigration = asset({
  id: 'epic-migration',
  category: 'arc',
  title: 'The Great Migration',
});

const ASSETS: GuidanceAsset[] = [...FRICTION, ...PLAN, patternX, epicMigration];

// Decisions (proposed/accepted/superseded -> open/active/archived): 3 in-group docs (one per
// state) + 1 non-Decisions doc that must NOT count toward the Decisions row at all (the 223 -> 191
// count-bug fix, still standing).
const docAccepted = doc({
  id: 'decisions/0001-accepted.md',
  title: 'An accepted decision',
  group: 'Decisions',
  status: 'accepted',
});
const docProposed = doc({
  id: 'decisions/0002-proposed.md',
  title: 'A proposed decision',
  group: 'Decisions',
  status: 'proposed',
});
const docSuperseded = doc({
  id: 'decisions/0003-superseded.md',
  title: 'A superseded decision',
  group: 'Decisions',
  status: 'superseded',
});
const docReference = doc({
  id: 'reference/glossary.md',
  title: 'A non-decision reference doc',
  group: 'Reference',
});
const DOCS: DocMeta[] = [docAccepted, docProposed, docSuperseded, docReference];

afterEach(cleanup);

// ---------- the reworked pure count heart ----------

describe('libraryShelf (per-state count rework)', () => {
  it('lls-shelf-entry-per-state-counts: buildCategoryShelf adds a stateCounts (open/active/archived) alongside the existing total count', () => {
    const shelf = buildCategoryShelf(ASSETS, DOCS);

    const frictionEntry = shelf.find((e) => e.category === 'friction');
    expect(frictionEntry?.count).toBe(3);
    expect(frictionEntry?.stateCounts?.open).toBe(1);
    expect(frictionEntry?.stateCounts?.active).toBe(0);
    expect(frictionEntry?.stateCounts?.archived).toBe(2);

    const planEntry = shelf.find((e) => e.category === 'plan');
    expect(planEntry?.count).toBe(4);
    expect(planEntry?.stateCounts?.open).toBe(1);
    expect(planEntry?.stateCounts?.active).toBe(1);
    expect(planEntry?.stateCounts?.archived).toBe(2);

    // a stateless category: every item is `active`, never open/archived.
    const patternEntry = shelf.find((e) => e.category === 'pattern');
    expect(patternEntry?.count).toBe(1);
    expect(patternEntry?.stateCounts?.open).toBe(0);
    expect(patternEntry?.stateCounts?.active).toBe(1);
    expect(patternEntry?.stateCounts?.archived).toBe(0);
  });

  it('lls-decisions-row-per-state-counts-decisions-group-only: the Decisions entry\'s stateCounts reflect only group === "Decisions" docs, not every loaded doc', () => {
    const shelf = buildCategoryShelf(ASSETS, DOCS);
    const decisionsEntry = shelf.find((e) => e.category === 'adr');
    // 4 docs total in the fixture, but only 3 carry group: 'Decisions' — the bug fix stands.
    expect(decisionsEntry?.count).toBe(3);
    expect(decisionsEntry?.stateCounts?.open).toBe(1);
    expect(decisionsEntry?.stateCounts?.active).toBe(1);
    expect(decisionsEntry?.stateCounts?.archived).toBe(1);
  });
});

// ---------- the component ----------

describe('LibraryFinder — one three-state lifecycle selector governs the whole panel', () => {
  // ── lls-selector-defaults-open-and-hides-empty-categories ───────────────────────
  it('lls-selector-defaults-open-and-hides-empty-categories: the selector defaults to open; only categories with >=1 open item render, each with a plain count', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    expect(screen.getByTestId('library-lifecycle-selector-open').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      screen.getByTestId('library-lifecycle-selector-active').getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByTestId('library-lifecycle-selector-archived').getAttribute('aria-pressed'),
    ).toBe('false');

    // friction, plan, and Decisions each have exactly 1 open item -> all three render, plainly.
    const frictionRow = screen.getByTestId('library-shelf-row-friction');
    expect(frictionRow.textContent).toContain('1');
    expect(frictionRow.textContent).not.toMatch(/of\s*3/);

    const planRow = screen.getByTestId('library-shelf-row-plan');
    expect(planRow.textContent).toContain('1');
    expect(planRow.textContent).not.toMatch(/of\s*4/);

    const decisionsRow = screen.getByTestId('library-shelf-decisions-row');
    expect(decisionsRow.textContent).toContain('1');

    // pattern and arc have ZERO open items (both are evergreen-active) -> no row at all.
    expect(screen.queryByTestId('library-shelf-row-pattern')).toBeNull();
    expect(screen.queryByTestId('library-shelf-row-arc')).toBeNull();

    // the old "N of M" muted-total split is gone.
    expect(screen.queryAllByTestId('library-shelf-row-muted-total')).toHaveLength(0);
    expect(screen.queryAllByTestId('library-shelf-row-primary-count')).toHaveLength(0);
  });

  // ── lls-state-switch-rederives-shelf ─────────────────────────────────────────────
  it('lls-state-switch-rederives-shelf: switching the selector re-derives which categories render and their counts', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    expect(
      screen.getByTestId('library-lifecycle-selector-active').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByTestId('library-lifecycle-selector-open').getAttribute('aria-pressed')).toBe(
      'false',
    );

    // friction has ZERO active items -> hidden now.
    expect(screen.queryByTestId('library-shelf-row-friction')).toBeNull();
    // plan/pattern/arc/Decisions each have exactly 1 active item.
    expect(screen.getByTestId('library-shelf-row-plan').textContent).toContain('1');
    expect(screen.getByTestId('library-shelf-row-pattern').textContent).toContain('1');
    expect(screen.getByTestId('library-shelf-row-arc').textContent).toContain('1');
    expect(screen.getByTestId('library-shelf-decisions-row').textContent).toContain('1');

    fireEvent.click(screen.getByTestId('library-lifecycle-selector-archived'));
    expect(
      screen.getByTestId('library-lifecycle-selector-archived').getAttribute('aria-pressed'),
    ).toBe('true');

    // pattern/arc have ZERO archived items -> hidden.
    expect(screen.queryByTestId('library-shelf-row-pattern')).toBeNull();
    expect(screen.queryByTestId('library-shelf-row-arc')).toBeNull();
    // friction and plan each have 2 archived items, Decisions has 1.
    expect(screen.getByTestId('library-shelf-row-friction').textContent).toContain('2');
    expect(screen.getByTestId('library-shelf-row-plan').textContent).toContain('2');
    expect(screen.getByTestId('library-shelf-decisions-row').textContent).toContain('1');
  });

  // ── lls-selector-filters-scoped-browse ───────────────────────────────────────────
  it('lls-selector-filters-scoped-browse: the selected state filters the scoped browse list uniformly, and a row click still lifts onSelect', () => {
    const onSelect = vi.fn();
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={onSelect} />);

    // scope into plan under the default open state (plan has exactly 1 open item).
    fireEvent.click(screen.getByTestId('library-shelf-row-plan'));
    expect(screen.getByTestId('library-finder-row-plan-draft')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-ready')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-consumed')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-retired')).toBeNull();

    fireEvent.click(screen.getByTestId('library-finder-row-plan-draft'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-draft', title: 'A draft plan', category: 'plan', source: 'asset' }),
    );

    // switching the selector WHILE scoped re-filters the same browse list.
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    expect(screen.getByTestId('library-finder-row-plan-ready')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-draft')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-consumed')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-retired')).toBeNull();

    fireEvent.click(screen.getByTestId('library-lifecycle-selector-archived'));
    expect(screen.getByTestId('library-finder-row-plan-consumed')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-plan-retired')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-draft')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-ready')).toBeNull();
  });

  // ── lls-selector-filters-search ───────────────────────────────────────────────────
  it('lls-selector-filters-search: the selected state filters typed search results, for assets and Decisions alike', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    const input = screen.getByLabelText('Search library');

    // under default open: a "plan" query matches all 4 plans by id, but only the open one shows.
    fireEvent.change(input, { target: { value: 'plan' } });
    expect(screen.getByTestId('library-finder-row-plan-draft')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-ready')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-consumed')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-retired')).toBeNull();
    // the in-state result still renders its title + a kindLabel kind sub-line.
    expect(screen.getByTestId('library-finder-result-kind-plan-draft').textContent).toBe('plan');

    // a "decision" query matches all 3 Decisions docs by title, but only the open (proposed) one shows.
    fireEvent.change(input, { target: { value: 'decision' } });
    expect(screen.getByTestId(`library-finder-row-${docProposed.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`library-finder-row-${docAccepted.id}`)).toBeNull();
    expect(screen.queryByTestId(`library-finder-row-${docSuperseded.id}`)).toBeNull();
    // an in-state ADR result still shows its status.
    expect(screen.getByTestId(`library-finder-result-status-${docProposed.id}`).textContent).toBe(
      'proposed',
    );

    // switching to active surfaces the active items instead — an arc reads "epic", never "arc".
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    fireEvent.change(input, { target: { value: 'migration' } });
    expect(screen.getByTestId('library-finder-row-epic-migration')).toBeTruthy();
    expect(screen.getByTestId('library-finder-result-kind-epic-migration').textContent).toBe(
      'epic',
    );

    fireEvent.change(input, { target: { value: 'plan' } });
    expect(screen.getByTestId('library-finder-row-plan-ready')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-draft')).toBeNull();
  });

  // ── lls-state-chips-retired ───────────────────────────────────────────────────────
  it('lls-state-chips-retired: no per-kind state chips render for any scoped kind — the selector is the only state vocabulary', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    expect(screen.queryAllByTestId(/^library-state-chip-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-state-chips')).toBeNull();

    fireEvent.click(screen.getByTestId('library-scope-chip-remove'));
    fireEvent.click(screen.getByTestId('library-shelf-row-plan'));
    expect(screen.queryAllByTestId(/^library-state-chip-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-state-chips')).toBeNull();
  });

  // ── lls-quiet-empty-states ────────────────────────────────────────────────────────
  it('lls-quiet-empty-states: an all-empty open shelf renders one quiet line and no shelf rows', () => {
    const onlyActiveAssets: GuidanceAsset[] = [
      asset({ id: 'only-active-plan', category: 'plan', title: 'Only An Active Plan', status: 'ready' }),
    ];
    const onlyActiveDocs: DocMeta[] = [
      doc({
        id: 'decisions/0099-only-active.md',
        title: 'Only An Active Decision',
        group: 'Decisions',
        status: 'accepted',
      }),
    ];

    render(<LibraryFinder assets={onlyActiveAssets} docs={onlyActiveDocs} onSelect={vi.fn()} />);

    expect(screen.queryAllByTestId(/^library-shelf-row-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-shelf-decisions-row')).toBeNull();

    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent).toBeTruthy();
    expect((emptyState.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('lls-quiet-empty-states: an empty scoped result names the selected state in one line', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    // scope into friction under open (present), then switch to active — friction has ZERO active items.
    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));

    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent?.toLowerCase()).toContain('active');
  });

  it('lls-quiet-empty-states: an empty search result (a state miss) names the selected state in one line', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    // under default open, "consumed" matches only planConsumed by id/title, which is archived.
    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'consumed' } });

    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent?.toLowerCase()).toContain('open');
  });
});
