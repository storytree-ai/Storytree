// @vitest-environment jsdom
//
// The lifecycle-aware finder shelf (ADR-0196 D3, the DRAW half of the library-lifecycle-shelf
// capability — the sibling `library-lifecycle-wire` owns the pure `lifecycleOf` projection + the
// plan-`status` wire it consumes). This capability's honest proof spans:
//
//   • the reworked pure count heart `buildCategoryShelf` (`../lib/libraryShelf`) — ADDING a
//     `liveCount` per entry (via `lifecycleOf` from `@storytree/library`) alongside the EXISTING
//     `count` total, and fixing the Decisions entry to count only `group === 'Decisions'` docs;
//   • the `<LibraryFinder>` component (`./LibraryFinder`) — a new Active | All lifecycle toggle
//     (default Active), the row live/total presentation it drives, per-kind state chips rendered
//     from each stateful kind's OWN stored vocabulary when scoped, and the chip-click / Active-
//     toggle filters over the scoped browse list.
//
// NOT pinned here (operator-attested, ADR-0196 D3 + ADR-0070): the forest-cozy palette, the toggle
// styling, the state-chip look, and the muted-total typography. No visual/colour/pixel assertion
// lives in this file.
//
// FENCE: this file does NOT touch `LibraryFinder.test.tsx` / `LibraryCategoryShelf.test.tsx` — the
// signed `lf-*` / `lcs-*` contracts there stay byte-green (see the node spec's FENCE section).
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
// friction (open/routed/archived, derived from `fields.route`): 3 items, only 1 live (open).
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

// plan (open/active/archived, projected from the `status` wire mirror): 4 items, 2 live.
const planDraft = asset({
  id: 'plan-draft',
  category: 'plan',
  title: 'A draft plan',
  status: 'draft',
} as GuidanceAsset);
const planReady = asset({
  id: 'plan-ready',
  category: 'plan',
  title: 'A ready plan',
  status: 'ready',
} as GuidanceAsset);
const planConsumed = asset({
  id: 'plan-consumed',
  category: 'plan',
  title: 'A consumed plan',
  status: 'consumed',
} as GuidanceAsset);
const planRetired = asset({
  id: 'plan-retired',
  category: 'plan',
  title: 'A retired plan',
  status: 'retired',
} as GuidanceAsset);
const PLAN = [planDraft, planReady, planConsumed, planRetired];

// a stateless category — evergreen-active, never renders state chips.
const patternX = asset({ id: 'pattern-x', category: 'pattern', title: 'Some Pattern' });

const ASSETS: GuidanceAsset[] = [...FRICTION, ...PLAN, patternX];

// Decisions (proposed/accepted/superseded): 3 in-group docs (2 live) + 1 non-Decisions doc that
// must NOT count toward the Decisions row at all (the 223 -> 191 count-bug fix).
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

describe('libraryShelf (lifecycle-aware rework)', () => {
  it('lls-toggle-defaults-active-and-counts-live: buildCategoryShelf adds a liveCount (via lifecycleOf) alongside the existing total count', () => {
    const shelf = buildCategoryShelf(ASSETS, DOCS);

    const frictionEntry = shelf.find((e) => e.category === 'friction');
    expect(frictionEntry?.count).toBe(3);
    expect(frictionEntry?.liveCount).toBe(1);

    const planEntry = shelf.find((e) => e.category === 'plan');
    expect(planEntry?.count).toBe(4);
    expect(planEntry?.liveCount).toBe(2);

    // an evergreen-active stateless category: live === total
    const patternEntry = shelf.find((e) => e.category === 'pattern');
    expect(patternEntry?.count).toBe(1);
    expect(patternEntry?.liveCount).toBe(1);
  });

  it('lls-decisions-row-counts-decisions-group-only: the Decisions entry counts (and live-counts) only group === "Decisions" docs, not every doc', () => {
    const shelf = buildCategoryShelf(ASSETS, DOCS);
    const decisionsEntry = shelf.find((e) => e.category === 'adr');
    // 4 docs total in the fixture, but only 3 carry group: 'Decisions' — the bug fix.
    expect(decisionsEntry?.count).toBe(3);
    expect(decisionsEntry?.liveCount).toBe(2);
  });
});

// ---------- the component ----------

describe('LibraryFinder — lifecycle toggle + live counts + state chips', () => {
  // ── lls-toggle-defaults-active-and-counts-live ──────────────────────────────────
  it('lls-toggle-defaults-active-and-counts-live: the toggle defaults to Active, and a row with a live/total mismatch shows both, muted', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    expect(screen.getByTestId('library-lifecycle-toggle-active').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('library-lifecycle-toggle-all').getAttribute('aria-pressed')).toBe(
      'false',
    );

    const frictionRow = screen.getByTestId('library-shelf-row-friction');
    expect(within(frictionRow).getByTestId('library-shelf-row-primary-count').textContent).toBe(
      '1',
    );
    expect(within(frictionRow).getByTestId('library-shelf-row-muted-total').textContent).toContain(
      '3',
    );

    // a row whose live count equals its total shows no muted total.
    const patternRow = screen.getByTestId('library-shelf-row-pattern');
    expect(within(patternRow).getByTestId('library-shelf-row-primary-count').textContent).toBe('1');
    expect(within(patternRow).queryByTestId('library-shelf-row-muted-total')).toBeNull();
  });

  // ── lls-all-mode-shows-totals ────────────────────────────────────────────────────
  it('lls-all-mode-shows-totals: switching to All shows plain totals, with no muted secondary count', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-lifecycle-toggle-all'));

    expect(screen.getByTestId('library-lifecycle-toggle-all').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('library-lifecycle-toggle-active').getAttribute('aria-pressed')).toBe(
      'false',
    );

    const frictionRow = screen.getByTestId('library-shelf-row-friction');
    expect(within(frictionRow).getByTestId('library-shelf-row-primary-count').textContent).toBe(
      '3',
    );
    expect(within(frictionRow).queryByTestId('library-shelf-row-muted-total')).toBeNull();

    const planRow = screen.getByTestId('library-shelf-row-plan');
    expect(within(planRow).getByTestId('library-shelf-row-primary-count').textContent).toBe('4');
    expect(within(planRow).queryByTestId('library-shelf-row-muted-total')).toBeNull();
  });

  // ── lls-decisions-row-counts-decisions-group-only (component side) ──────────────
  it('lls-decisions-row-counts-decisions-group-only: the Decisions shelf row reflects the group-filtered count, not every loaded doc', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-lifecycle-toggle-all'));

    const decisionsRow = screen.getByTestId('library-shelf-decisions-row');
    expect(within(decisionsRow).getByTestId('library-shelf-row-primary-count').textContent).toBe(
      '3',
    );
  });

  // ── lls-scoped-state-chips-use-kind-vocabulary ───────────────────────────────────
  it('lls-scoped-state-chips-use-kind-vocabulary: scoped into a stateful kind, chips render that kind\'s OWN vocabulary; a stateless kind gets none', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    expect(screen.getByTestId('library-state-chip-open')).toBeTruthy();
    expect(screen.getByTestId('library-state-chip-routed')).toBeTruthy();
    expect(screen.getByTestId('library-state-chip-archived')).toBeTruthy();

    fireEvent.click(screen.getByTestId('library-scope-chip-remove'));
    fireEvent.click(screen.getByTestId('library-shelf-decisions-row'));
    expect(screen.getByTestId('library-state-chip-proposed')).toBeTruthy();
    expect(screen.getByTestId('library-state-chip-accepted')).toBeTruthy();
    expect(screen.getByTestId('library-state-chip-superseded')).toBeTruthy();
    // the decisions vocabulary is its own — never the friction one leaking through.
    expect(screen.queryByTestId('library-state-chip-routed')).toBeNull();

    fireEvent.click(screen.getByTestId('library-scope-chip-remove'));
    fireEvent.click(screen.getByTestId('library-shelf-row-pattern'));
    expect(screen.queryAllByTestId(/^library-state-chip-/)).toHaveLength(0);
  });

  // ── lls-chip-click-filters-scoped-list ───────────────────────────────────────────
  it('lls-chip-click-filters-scoped-list: clicking a state chip filters the scoped browse list to that state only', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-friction'));
    // before any chip click, all three friction items are browsable.
    expect(screen.getByTestId('library-finder-row-friction-open')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-friction-routed')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-friction-archived')).toBeTruthy();

    fireEvent.click(screen.getByTestId('library-state-chip-routed'));

    expect(screen.getByTestId('library-finder-row-friction-routed')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-friction-open')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-friction-archived')).toBeNull();
  });

  // ── lls-active-toggle-filters-scoped-browse ──────────────────────────────────────
  it('lls-active-toggle-filters-scoped-browse: in Active mode the scoped browse list shows only live (open+active) items; All shows every item in scope', () => {
    render(<LibraryFinder assets={ASSETS} docs={DOCS} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId('library-shelf-row-plan'));

    // default Active mode: only the live (draft/open, ready/active) plans browse.
    expect(screen.getByTestId('library-finder-row-plan-draft')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-plan-ready')).toBeTruthy();
    expect(screen.queryByTestId('library-finder-row-plan-consumed')).toBeNull();
    expect(screen.queryByTestId('library-finder-row-plan-retired')).toBeNull();

    fireEvent.click(screen.getByTestId('library-lifecycle-toggle-all'));

    expect(screen.getByTestId('library-finder-row-plan-draft')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-plan-ready')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-plan-consumed')).toBeTruthy();
    expect(screen.getByTestId('library-finder-row-plan-retired')).toBeTruthy();
  });
});
