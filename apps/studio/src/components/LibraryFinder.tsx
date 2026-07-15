/**
 * LibraryFinder — the idle-browse + scoped-search surface over the loaded corpus (ADR-0185 dec
 * 2/3 increment 2, reworked by ADR-0188 dec 2 increment `library-category-shelf`, and again by
 * ADR-0197's `library-lifecycle-shelf` capability into the ONE-SELECTOR-GOVERNS-THE-PANEL model).
 *
 * The panel carries exactly ONE lifecycle control: a three-state `open | active | archived`
 * selector, default `open` (component-local state) — it REPLACES the old Active|All toggle and
 * the per-kind state chips outright (ADR-0197 D3: one control, one vocabulary). The selected state
 * governs everything the panel shows:
 *
 * - SHELF (idle: no query, no scope) — one row per category (`../lib/libraryShelf`'s
 *   `buildCategoryShelf`) with >=1 item projecting (via `lifecycleOf`) to the selected state; a
 *   category with zero items in the state renders no row at all. Each row shows a PLAIN per-state
 *   count (the old "N of M" muted-total split is gone).
 * - SCOPED BROWSE — clicking a shelf row turns it into a removable SCOPE CHIP and browses that
 *   category's items filtered to the selected state (`listScopedBrowseResults`), uniformly for
 *   every kind (the old friction/Decisions chips-only exception is gone).
 * - SEARCH — a typed query with no scope runs `searchCorpus`, filtered to the selected state
 *   (`filterResultsByState`) before rendering, for assets and Decisions alike.
 *
 * Each result still renders its title over a muted kind sub-line routed through `kindLabel`
 * (never a hand-rolled category -> label map, ADR-0183 D1), an ADR result additionally shows its
 * status, and clicking a result lifts the pick through `onSelect` — the finder holds no
 * cross-render selection state of its own; `selectedId` (a prop) drives which row reads as
 * currently selected. An all-empty shelf / an empty scoped or search result renders one quiet line
 * naming the selected state (ADR-0197 D4) instead of an empty list.
 *
 * The forest-cozy palette / selector & chip styling / empty-state copy's look are the story's
 * operator-attested UAT leg (ADR-0197 D1 / ADR-0070) — not asserted here.
 */

import { useMemo, useState } from 'react';
import type { Lifecycle } from '@storytree/library';
import { searchCorpus, type SearchResult } from '../lib/librarySearch';
import { buildCategoryShelf, filterResultsByState, listScopedBrowseResults } from '../lib/libraryShelf';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';

/** The three-state lifecycle selector's positions (ADR-0197 D2/D3; default `open`). */
const LIFECYCLE_STATES: readonly Lifecycle[] = ['open', 'active', 'archived'];

export interface LibraryFinderProps {
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** Invoked with the picked result — the finder lifts selection, it never owns where it goes. */
  onSelect: (result: SearchResult) => void;
  /** The currently-selected result id (owned by the caller); marks that row `aria-current`. */
  selectedId?: string;
}

/** The scope-name shown in the chip / the search placeholder — Decisions for the adr pseudo-scope. */
function scopeDisplayName(category: AssetCategory, arcDisplay: ReturnType<typeof useArcDisplay>): string {
  return category === 'adr' ? 'Decisions' : kindLabel(category, arcDisplay);
}

/** The idle category shelf + the scoped browse/search results over the loaded corpus. */
export function LibraryFinder({ assets, docs, onSelect, selectedId }: LibraryFinderProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AssetCategory | null>(null);
  const [lifecycleState, setLifecycleState] = useState<Lifecycle>('open');
  const arcDisplay = useArcDisplay();

  const trimmedQuery = query.trim();
  const shelf = useMemo(() => buildCategoryShelf(assets, docs), [assets, docs]);
  const visibleShelf = useMemo(
    () => shelf.filter((entry) => entry.stateCounts[lifecycleState] > 0),
    [shelf, lifecycleState],
  );

  const enterScope = (next: AssetCategory) => {
    setScope(next);
  };
  const clearScope = () => {
    setScope(null);
  };

  const results = useMemo(() => {
    if (scope !== null) {
      if (trimmedQuery === '') {
        return listScopedBrowseResults(scope, assets, docs, lifecycleState);
      }
      const scoped = searchCorpus(query, assets, docs).filter((result) =>
        scope === 'adr' ? result.source === 'doc' : result.source === 'asset' && result.category === scope,
      );
      return filterResultsByState(scoped, assets, docs, lifecycleState);
    }
    return filterResultsByState(searchCorpus(query, assets, docs), assets, docs, lifecycleState);
  }, [scope, query, trimmedQuery, assets, docs, lifecycleState]);

  const showShelf = scope === null && trimmedQuery === '';
  const placeholder = scope === null ? 'Search library…' : `Search ${scopeDisplayName(scope, arcDisplay)}…`;

  return (
    <div className="library-finder" data-testid="library-finder">
      <div className="library-lifecycle-selector" data-testid="library-lifecycle-selector">
        {LIFECYCLE_STATES.map((state) => (
          <button
            key={state}
            type="button"
            className="library-lifecycle-selector-button"
            data-testid={`library-lifecycle-selector-${state}`}
            aria-pressed={lifecycleState === state ? 'true' : 'false'}
            onClick={() => setLifecycleState(state)}
          >
            {state}
          </button>
        ))}
      </div>
      <input
        type="text"
        className="library-finder-input"
        aria-label="Search library"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {scope !== null && (
        <div className="library-scope-chip" data-testid="library-scope-chip">
          <span className="library-scope-chip-label">{scopeDisplayName(scope, arcDisplay)}</span>
          <button
            type="button"
            className="library-scope-chip-remove"
            data-testid="library-scope-chip-remove"
            aria-label="Clear scope"
            onClick={clearScope}
          >
            ×
          </button>
        </div>
      )}
      {showShelf ? (
        visibleShelf.length === 0 ? (
          <p className="library-empty-state" data-testid="library-empty-state">
            {`Nothing needs attention in ${lifecycleState} right now.`}
          </p>
        ) : (
          <ul className="library-shelf" data-testid="library-shelf">
            {visibleShelf.map((entry) => {
              const testId =
                entry.category === 'adr' ? 'library-shelf-decisions-row' : `library-shelf-row-${entry.category}`;
              return (
                <li
                  key={entry.category}
                  className="library-shelf-row"
                  data-testid={testId}
                  onClick={() => enterScope(entry.category)}
                >
                  <span className="library-shelf-row-label">{scopeDisplayName(entry.category, arcDisplay)}</span>
                  <span className="library-shelf-row-count">{entry.stateCounts[lifecycleState]}</span>
                </li>
              );
            })}
          </ul>
        )
      ) : results.length === 0 ? (
        <p className="library-empty-state" data-testid="library-empty-state">
          {`No ${lifecycleState} matches — switch state to see more.`}
        </p>
      ) : (
        <ul className="library-finder-results" data-testid="library-finder-results">
          {results.map((result) => {
            const selected = selectedId === result.id;
            return (
              <li
                key={result.id}
                className="library-finder-row"
                data-testid={`library-finder-row-${result.id}`}
                aria-current={selected ? 'true' : undefined}
                data-selected={selected ? 'true' : undefined}
                onClick={() => onSelect(result)}
              >
                <span className="library-finder-result-title">{result.title}</span>
                <span
                  className="library-finder-result-kind"
                  data-testid={`library-finder-result-kind-${result.id}`}
                >
                  {kindLabel(result.category, arcDisplay)}
                </span>
                {result.status !== undefined && (
                  <span
                    className="library-finder-result-status"
                    data-testid={`library-finder-result-status-${result.id}`}
                  >
                    {result.status}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
