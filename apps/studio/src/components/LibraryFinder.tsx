/**
 * LibraryFinder — the idle-browse + scoped-search surface over the loaded corpus (ADR-0185 dec
 * 2/3 increment 2, reworked by ADR-0188 dec 2 increment `library-category-shelf`, and again by
 * ADR-0196 D3's `library-lifecycle-shelf` capability into a lifecycle-aware shelf).
 *
 * IDLE (no query, no scope): renders a CATEGORY SHELF — one row per category present in the
 * loaded corpus plus a Decisions row (`../lib/libraryShelf`'s `buildCategoryShelf`). An Active|All
 * lifecycle toggle (default Active) drives each row's presentation: Active shows the row's LIVE
 * (`open`+`active`, via `lifecycleOf`) count, with the muted TOTAL beside it when it differs; All
 * shows the plain total. Clicking a shelf row turns it into a removable SCOPE CHIP and browses ALL
 * of that category's artifacts with no query floor (`listScopedBrowseResults`) — browse, not
 * search. Scoped into a STATEFUL category (one `../lib/libraryShelf`'s `stateVocabularyFor`
 * returns a vocabulary for), per-kind STATE CHIPS render above the browse list using that kind's
 * OWN stored vocabulary; clicking one filters the browse list to that state. The Active|All toggle
 * also filters the scoped browse list (governed categories only — see `listScopedBrowseResults`).
 * Typing while scoped runs `searchCorpus` filtered to the scope's category, and the input
 * placeholder names the active scope. Clearing the chip (with an empty query) clears the scope and
 * the shelf renders again.
 *
 * With a typed query and NO scope the finder behaves exactly as increment 2 left it: a flat,
 * ranked results list via `searchCorpus` — no kind-filter chips, no facet controls. Each result
 * renders its title over a muted kind sub-line routed through `kindLabel` (never a hand-rolled
 * category → label map, ADR-0183 D1), an ADR result additionally shows its status, and clicking a
 * result lifts the pick through `onSelect` — the finder holds no cross-render selection state of
 * its own; `selectedId` (a prop) drives which row reads as currently selected.
 *
 * The forest-cozy palette / muted styling / toggle & chip look are the story's operator-attested
 * UAT leg (ADR-0188 dec 2/7 / ADR-0196 D3 / ADR-0070) — not asserted here.
 */

import { useMemo, useState } from 'react';
import { searchCorpus, type SearchResult } from '../lib/librarySearch';
import { buildCategoryShelf, listScopedBrowseResults, stateVocabularyFor } from '../lib/libraryShelf';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';

/** The Active|All lifecycle toggle's two positions (ADR-0196 D3; default Active). */
type LifecycleMode = 'active' | 'all';

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
  const [mode, setMode] = useState<LifecycleMode>('active');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const arcDisplay = useArcDisplay();

  const trimmedQuery = query.trim();
  const shelf = useMemo(() => buildCategoryShelf(assets, docs), [assets, docs]);

  const enterScope = (next: AssetCategory) => {
    setScope(next);
    setSelectedState(null);
  };
  const clearScope = () => {
    setScope(null);
    setSelectedState(null);
  };

  const stateChips = scope === null ? undefined : stateVocabularyFor(scope);

  const results = useMemo(() => {
    if (scope !== null) {
      if (trimmedQuery === '') {
        return listScopedBrowseResults(scope, assets, docs, mode, selectedState);
      }
      return searchCorpus(query, assets, docs).filter((result) =>
        scope === 'adr' ? result.source === 'doc' : result.source === 'asset' && result.category === scope,
      );
    }
    return searchCorpus(query, assets, docs);
  }, [scope, query, trimmedQuery, assets, docs, mode, selectedState]);

  const showShelf = scope === null && trimmedQuery === '';
  const placeholder = scope === null ? 'Search library…' : `Search ${scopeDisplayName(scope, arcDisplay)}…`;

  return (
    <div className="library-finder" data-testid="library-finder">
      <div className="library-lifecycle-toggle" data-testid="library-lifecycle-toggle">
        <button
          type="button"
          className="library-lifecycle-toggle-active"
          data-testid="library-lifecycle-toggle-active"
          aria-pressed={mode === 'active' ? 'true' : 'false'}
          onClick={() => setMode('active')}
        >
          Active
        </button>
        <button
          type="button"
          className="library-lifecycle-toggle-all"
          data-testid="library-lifecycle-toggle-all"
          aria-pressed={mode === 'all' ? 'true' : 'false'}
          onClick={() => setMode('all')}
        >
          All
        </button>
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
      {scope !== null && stateChips !== undefined && (
        <div className="library-state-chips" data-testid="library-state-chips">
          {stateChips.map((state) => (
            <button
              key={state}
              type="button"
              className="library-state-chip"
              data-testid={`library-state-chip-${state}`}
              aria-pressed={selectedState === state ? 'true' : 'false'}
              onClick={() => setSelectedState((current) => (current === state ? null : state))}
            >
              {state}
            </button>
          ))}
        </div>
      )}
      {showShelf ? (
        <ul className="library-shelf" data-testid="library-shelf">
          {shelf.map((entry) => {
            const testId =
              entry.category === 'adr' ? 'library-shelf-decisions-row' : `library-shelf-row-${entry.category}`;
            const primaryCount = mode === 'active' ? entry.liveCount : entry.count;
            const showMutedTotal = mode === 'active' && entry.liveCount !== entry.count;
            return (
              <li
                key={entry.category}
                className="library-shelf-row"
                data-testid={testId}
                onClick={() => enterScope(entry.category)}
              >
                <span className="library-shelf-row-label">{scopeDisplayName(entry.category, arcDisplay)}</span>
                <span className="library-shelf-row-count">
                  <span data-testid="library-shelf-row-primary-count">{primaryCount}</span>
                  {showMutedTotal && (
                    <span className="library-shelf-row-muted-total" data-testid="library-shelf-row-muted-total">
                      {` of ${entry.count}`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
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
