/**
 * LibrarySelectionCard — the pinned "what am I looking at" selection card in the Library side
 * panel (`library-selection-card` capability, ADR-0188 dec 3: the structural fix for the
 * attested blank-panel bug).
 *
 * Renders whatever is currently SELECTED — a `SearchResult` from `../lib/librarySearch` — or
 * nothing at all when there is no selection. A `SearchResult` carries only
 * `{ id, title, category, source, status? }`, so the extra detail a card needs (an asset's
 * description, an ADR's load-bearing flag) is looked up from the already-loaded corpus via the
 * pure `../lib/selectionDetail` helper, which is TOLERANT of a stale selection whose id has
 * fallen out of the corpus (the inc-3 real-data crash-class guard) — the card then degrades to
 * the `SearchResult`'s own fields alone.
 *
 * The forest-cozy palette / card layout / badge look is the story's operator-attested UAT leg
 * (ADR-0188 dec 3/7 / ADR-0070) — not asserted here.
 */

import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { resolveSelectionDetail } from '../lib/selectionDetail';
import type { SearchResult } from '../lib/librarySearch';
import type { DocMeta, GuidanceAsset } from '../types';

export interface LibrarySelectionCardProps {
  selection: SearchResult | null;
  assets: GuidanceAsset[];
  docs: DocMeta[];
  /** Invoked with the current selection when the Open button fires. */
  onOpen: (result: SearchResult) => void;
}

/** The pinned selection card — null selection renders nothing. */
export function LibrarySelectionCard({
  selection,
  assets,
  docs,
  onOpen,
}: LibrarySelectionCardProps): React.JSX.Element | null {
  const arcDisplay = useArcDisplay();

  if (selection === null) return null;

  const detail = resolveSelectionDetail(selection, assets, docs);

  return (
    <div className="library-selection-card" data-testid="library-selection-card">
      <div className="library-selection-title">{selection.title}</div>
      {selection.source === 'asset' ? (
        <>
          <span className="library-selection-kind" data-testid="library-selection-kind">
            {kindLabel(selection.category, arcDisplay)}
          </span>
          {detail.description !== undefined && (
            <p
              className="library-selection-description"
              data-testid="library-selection-description"
            >
              {detail.description}
            </p>
          )}
        </>
      ) : (
        <>
          {selection.status !== undefined && (
            <span className="library-selection-status" data-testid="library-selection-status">
              {selection.status}
            </span>
          )}
          {detail.loadBearing === true && (
            <span
              className="library-selection-loadbearing-badge"
              data-testid="library-selection-loadbearing-badge"
            >
              Load-bearing
            </span>
          )}
        </>
      )}
      <button
        type="button"
        className="library-selection-open"
        onClick={() => onOpen(selection)}
      >
        Open
      </button>
    </div>
  );
}
