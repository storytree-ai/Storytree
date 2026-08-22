// @vitest-environment jsdom
//
// The ONE-SELECTOR-GOVERNS-THE-PANEL rework (ADR-0197, the `library-lifecycle-shelf` capability —
// the sibling `library-lifecycle-wire` owns the pure `lifecycleOf` projection + the increment-`status`
// wire it consumes). This capability's honest proof spans:
//
//   • the reworked pure count heart `buildCategoryShelf` (`../lib/libraryShelf`) — ADDING a
//     per-state `stateCounts` (open/active/archived, via `lifecycleOf` from `@storytree/library`)
//     to each entry alongside the EXISTING total `count`, decisions counted from the `adr`
//     artifacts like every other category (ADR-0403 dec 1);
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — ONE three-state `open | active |
//     archived` selector (default `open`, component-local state) that REPLACES the retired
//     Active|All toggle; the selected state governs the shelf (only categories with ≥1 item in
//     state render, each with a PLAIN per-state count — the "N of M" muted-total split is
//     gone), the scoped browse (uniformly for every kind — the friction/Decisions chips-only
//     exception is gone), and the typed search; the per-kind state chips retire outright; and
//     empty states render one quiet line.
//
// ★ THE DECISIONS FIXTURES ARE `adr` ARTIFACTS NOW (ADR-0403 dec 1). They were `DocMeta`s carrying
// `group: 'Decisions'` and a frontmatter `status` — a shape PR #1546's walker can no longer emit
// and `DocMeta` can no longer express. That is why the old `lls-decisions-row-per-state-counts-
// decisions-group-only` contract retires rather than being repointed: it pinned that a Reference
// doc must not be counted into the Decisions row, and a doc cannot reach that row at all now.
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
import type { GuidanceAsset } from '../types';

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

// increment (open/active/archived, projected from the `status` wire mirror): 4 items — 1 open, 1 active,
// 2 archived. The vocabulary is ADR-0305 D2's four-state increment lifecycle; `ready` also projects
// to `active` and is exercised exhaustively by the library's own `lifecycle` suite, so the middle
// slot here carries `active` — the state whose PROJECTION changed (its predecessor `consumed` was
// archived), which is the behaviour worth pinning on this surface.
const planProposal = asset({
  id: 'increment-proposal',
  category: 'increment',
  title: 'A parked increment',
  status: 'proposal',
});
const planActive = asset({
  id: 'increment-active',
  category: 'increment',
  title: 'An executing increment',
  status: 'active',
});
const planClosedOne = asset({
  id: 'increment-closed-one',
  category: 'increment',
  title: 'A landed increment',
  status: 'closed',
});
const planClosedTwo = asset({
  id: 'increment-closed-two',
  category: 'increment',
  title: 'An abandoned increment',
  status: 'closed',
});
const PLAN = [planProposal, planActive, planClosedOne, planClosedTwo];

// two evergreen-active (stateless) categories — never `open`, never `archived`.
const patternX = asset({ id: 'pattern-x', category: 'pattern', title: 'Some Pattern' });
const epicMigration = asset({
  id: 'epic-migration',
  category: 'arc',
  title: 'The Great Migration',
});


// Decisions (proposed/accepted/superseded -> open/active/archived): 3 `adr` artifacts, one per
// state. They join ASSETS, because that is the one corpus the shelf reads.
const adrAccepted = asset({
  id: 'adr-0001',
  category: 'adr',
  title: 'An accepted decision',
  status: 'accepted',
});
const adrProposed = asset({
  id: 'adr-0002',
  category: 'adr',
  title: 'A proposed decision',
  status: 'proposed',
});
const adrSuperseded = asset({
  id: 'adr-0003',
  category: 'adr',
  title: 'A superseded decision',
  status: 'superseded',
});
const DECISIONS = [adrAccepted, adrProposed, adrSuperseded];

const ASSETS: GuidanceAsset[] = [...FRICTION, ...PLAN, patternX, epicMigration, ...DECISIONS];

afterEach(cleanup);

// ---------- the reworked pure count heart ----------

describe('libraryShelf (per-state count rework)', () => {
  it('lls-shelf-entry-per-state-counts: buildCategoryShelf adds a stateCounts (open/active/archived) alongside the existing total count', () => {
    const shelf = buildCategoryShelf(ASSETS);

    const frictionEntry = shelf.find((e) => e.category === 'friction');
    expect(frictionEntry?.count).toBe(3);
    expect(frictionEntry?.stateCounts?.open).toBe(1);
    expect(frictionEntry?.stateCounts?.active).toBe(0);
    expect(frictionEntry?.stateCounts?.archived).toBe(2);

    const planEntry = shelf.find((e) => e.category === 'increment');
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

  // v2 of `lls-decisions-row-per-state-counts-decisions-group-only` (ADR-0403 dec 1). The old
  // contract fenced a Reference doc out of the Decisions row's counts; a doc cannot reach that row
  // at all now, so the fence it needs is the opposite one — the row counts `adr` ARTIFACTS, and
  // every state of the ADR-0037 lifecycle projects onto the triad.
  it('lls-decisions-row-per-state-counts-decisions-group-only: the Decisions entry counts adr artifacts, projecting proposed/accepted/superseded onto open/active/archived', () => {
    const shelf = buildCategoryShelf(ASSETS);
    const decisionsEntry = shelf.find((e) => e.category === 'adr');
    expect(decisionsEntry?.count).toBe(3);
    expect(decisionsEntry?.stateCounts?.open).toBe(1);
    expect(decisionsEntry?.stateCounts?.active).toBe(1);
    expect(decisionsEntry?.stateCounts?.archived).toBe(1);

    // No decision in the corpus means no Decisions row at all — never a row counted at 0 sitting
    // beside a real one, which is what the docs-sourced entry became after PR #1546.
    const noDecisions = buildCategoryShelf([patternX]);
    expect(noDecisions.find((e) => e.category === 'adr')).toBeUndefined();
  });
});

// ---------- the component ----------

describe('LibraryFinder — one three-state lifecycle selector governs the whole panel', () => {
  // ── lls-selector-defaults-open-and-hides-empty-categories ───────────────────────
  it('lls-selector-defaults-open-and-hides-empty-categories: the selector defaults to open; only categories with >=1 open item render, each with a plain count', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    expect(screen.getByTestId('library-lifecycle-selector-open').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(
      screen.getByTestId('library-lifecycle-selector-active').getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen.getByTestId('library-lifecycle-selector-archived').getAttribute('aria-pressed'),
    ).toBe('false');

    // friction, increment, and Decisions each have exactly 1 open item -> all three render, plainly.
    const frictionRow = screen.getByTestId('library-shelf-row-friction');
    expect(frictionRow.textContent).toContain('1');
    expect(frictionRow.textContent).not.toMatch(/of\s*3/);

    const planRow = screen.getByTestId('library-shelf-row-increment');
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
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    expect(
      screen.getByTestId('library-lifecycle-selector-active').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByTestId('library-lifecycle-selector-open').getAttribute('aria-pressed')).toBe(
      'false',
    );

    // friction has ZERO active items -> hidden now.
    expect(screen.queryByTestId('library-shelf-row-friction')).toBeNull();
    // increment/pattern/arc/Decisions each have exactly 1 active item.
    expect(screen.getByTestId('library-shelf-row-increment').textContent).toContain('1');
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
    // friction and increment each have 2 archived items, Decisions has 1.
    expect(screen.getByTestId('library-shelf-row-friction').textContent).toContain('2');
    expect(screen.getByTestId('library-shelf-row-increment').textContent).toContain('2');
    expect(screen.getByTestId('library-shelf-decisions-row').textContent).toContain('1');
  });

  // ── lls-selector-filters-scoped-browse ───────────────────────────────────────────
  it('lls-selector-filters-scoped-browse: the selected state filters the scoped browse list uniformly, and a row click still lifts onSelect', () => {
    const onSelect = vi.fn();
    render(<LibraryFinder assets={ASSETS} onSelect={onSelect} />);

    // scope into increment under the default open state (it has exactly 1 open item).
    fireEvent.click(screen.getByTestId('library-shelf-row-increment'));
    expect(screen.getByTestId('library-finder-row-increment-proposal')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-increment-active')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-one')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-two')).toBeNull();

    fireEvent.click(screen.getByTestId('library-finder-row-increment-proposal'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'increment-proposal', title: 'A parked increment', category: 'increment', source: 'asset' }),
    );

    // switching the selector WHILE scoped re-filters the same browse list.
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    expect(screen.getByTestId('library-finder-row-increment-active')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-increment-proposal')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-one')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-two')).toBeNull();

    fireEvent.click(screen.getByTestId('library-lifecycle-selector-archived'));
    expect(screen.getByTestId('library-finder-row-increment-closed-one')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-increment-closed-two')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-increment-proposal')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-active')).toBeNull();
  });

  // ── lls-selector-filters-scoped-browse (typing WHILE scoped) ─────────────────────
  //
  // The one path in this panel with its own scope predicate: typing while a scope chip is up runs
  // `searchCorpus` and filters the ranked results down to the scope. That predicate special-cased
  // Decisions to `result.source === 'doc'` — the ONE branch that read the doc corpus rather than
  // the artifact one — so a typed query under the Decisions chip matched documents and never a
  // decision. It survived PR #1546 by being unreached: no contract typed anything while scoped, so
  // a mutation restoring the special case still passed the whole suite. It is reached now.
  it('lls-selector-filters-scoped-browse: typing while scoped to Decisions searches the decisions themselves, not the doc corpus', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    // `accepted` projects to `active`, so switch there before scoping — the shelf only shows a
    // category with ≥1 item in the selected state.
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    fireEvent.click(screen.getByTestId('library-shelf-decisions-row'));
    expect(screen.getByTestId('library-scope-chip').textContent).toContain('Decisions');

    // The accessible name is fixed; the SCOPE shows in the placeholder.
    const input = screen.getByLabelText('Search library');
    expect(input.getAttribute('placeholder')).toContain('Decisions');

    fireEvent.change(input, { target: { value: 'decision' } });

    // The accepted decision is the only in-state Decisions match.
    expect(screen.getByTestId(`library-finder-row-${adrAccepted.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`library-finder-row-${adrProposed.id}`)).toBeNull();
    expect(screen.queryByTestId(`library-finder-row-${adrSuperseded.id}`)).toBeNull();

    // …and the scope still excludes other categories that match the same query.
    fireEvent.change(input, { target: { value: 'increment' } });
    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
  });

  // ── lls-selector-filters-search ───────────────────────────────────────────────────
  it('lls-selector-filters-search: the selected state filters typed search results, for assets and Decisions alike', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    const input = screen.getByLabelText('Search library');

    // under default open: an "increment" query matches all 4 by id, but only the open one shows.
    fireEvent.change(input, { target: { value: 'increment' } });
    expect(screen.getByTestId('library-finder-row-increment-proposal')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-increment-active')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-one')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-increment-closed-two')).toBeNull();
    // the in-state result still renders its title + a kindLabel kind sub-line.
    expect(screen.getByTestId('library-finder-result-kind-increment-proposal').textContent).toBe('increment');

    // a "decision" query matches all 3 decisions by title, but only the open (proposed) one shows.
    fireEvent.change(input, { target: { value: 'decision' } });
    expect(screen.getByTestId(`library-finder-row-${adrProposed.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`library-finder-row-${adrAccepted.id}`)).toBeNull();
    expect(screen.queryByTestId(`library-finder-row-${adrSuperseded.id}`)).toBeNull();
    // an in-state decision result still shows its status, sourced from the artifact.
    expect(screen.getByTestId(`library-finder-result-status-${adrProposed.id}`).textContent).toBe(
      'proposed',
    );

    // switching to active surfaces the active items instead — an arc reads "epic", never "arc".
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));
    fireEvent.change(input, { target: { value: 'migration' } });
    expect(screen.getByTestId('library-finder-row-epic-migration')).toBeTruthy();
    expect(screen.getByTestId('library-finder-result-kind-epic-migration').textContent).toBe(
      'epic',
    );

    fireEvent.change(input, { target: { value: 'increment' } });
    expect(screen.getByTestId('library-finder-row-increment-active')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-increment-proposal')).toBeNull();
  });

  // ── lls-state-chips-retired ───────────────────────────────────────────────────────
  it('lls-state-chips-retired: no per-kind state chips render for any scoped kind — the selector is the only state vocabulary', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    expect(screen.queryAllByTestId(/^library-state-chip-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-state-chips')).toBeNull();

    fireEvent.click(screen.getByTestId('library-scope-chip-remove'));
    fireEvent.click(screen.getByTestId('library-shelf-row-increment'));
    expect(screen.queryAllByTestId(/^library-state-chip-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-state-chips')).toBeNull();
  });

  // ── lls-quiet-empty-states ────────────────────────────────────────────────────────
  it('lls-quiet-empty-states: an all-empty open shelf renders one quiet line and no shelf rows', () => {
    const onlyActiveAssets: GuidanceAsset[] = [
      asset({ id: 'only-active-increment', category: 'increment', title: 'Only An Active Increment', status: 'ready' }),
      asset({ id: 'adr-0099', category: 'adr', title: 'Only An Active Decision', status: 'accepted' }),
    ];

    render(<LibraryFinder assets={onlyActiveAssets} onSelect={vi.fn()} />);

    expect(screen.queryAllByTestId(/^library-shelf-row-/)).toHaveLength(0);
    expect(screen.queryByTestId('library-shelf-decisions-row')).toBeNull();

    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent).toBeTruthy();
    expect((emptyState.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  it('lls-quiet-empty-states: an empty scoped result names the selected state in one line', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    // scope into friction under open (present), then switch to active — friction has ZERO active items.
    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    fireEvent.click(screen.getByTestId('library-lifecycle-selector-active'));

    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent?.toLowerCase()).toContain('active');
  });

  it('lls-quiet-empty-states: an empty search result (a state miss) names the selected state in one line', () => {
    render(<LibraryFinder assets={ASSETS} onSelect={vi.fn()} />);

    // under default open, "consumed" matches only planConsumed by id/title, which is archived.
    fireEvent.change(screen.getByLabelText('Search library'), { target: { value: 'consumed' } });

    expect(screen.queryAllByTestId(/^library-finder-row-/)).toHaveLength(0);
    const emptyState = screen.getByTestId('library-empty-state');
    expect(emptyState.textContent?.toLowerCase()).toContain('open');
  });
});
