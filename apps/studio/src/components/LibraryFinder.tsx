/**
 * LibraryFinder — the search surface over the loaded corpus (ADR-0185 dec 2/3, increment 2 of
 * the library-tech-tree-overlay story).
 *
 * A single search box narrows the corpus (via `searchCorpus`, `../lib/librarySearch`) into a
 * ranked, flat results list — no kind-filter chips, no facet controls (search-only, dec 2). Each
 * result renders its title over a muted kind sub-line routed through `kindLabel` (never a
 * hand-rolled category → label map, ADR-0183 D1), an ADR result additionally shows its status,
 * and clicking a result lifts the pick through `onSelect` — the finder holds no selection state
 * of its own; `selectedId` (a prop) drives which row reads as currently selected.
 *
 * The forest-cozy palette / muted styling / selected-row highlight are the story's
 * operator-attested UAT leg (ADR-0185 dec 5 / ADR-0070) — not asserted here.
 */

import { useMemo, useState } from 'react';
import { searchCorpus, type SearchResult } from '../lib/librarySearch';
import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import type { DocMeta, GuidanceAsset } from '../types';

export interface LibraryFinderProps {
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** Invoked with the picked result — the finder lifts selection, it never owns where it goes. */
  onSelect: (result: SearchResult) => void;
  /** The currently-selected result id (owned by the caller); marks that row `aria-current`. */
  selectedId?: string;
}

/** The search box + ranked results list over the loaded corpus. */
export function LibraryFinder({ assets, docs, onSelect, selectedId }: LibraryFinderProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const arcDisplay = useArcDisplay();

  const results = useMemo(() => searchCorpus(query, assets, docs), [query, assets, docs]);

  return (
    <div className="library-finder" data-testid="library-finder">
      <input
        type="text"
        className="library-finder-input"
        aria-label="Search library"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
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
    </div>
  );
}
