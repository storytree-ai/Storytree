/**
 * LibrarySelectionCard — the pinned "what am I looking at" selection card in the Library side
 * panel (`library-selection-card` capability, ADR-0188 dec 3: the structural fix for the
 * attested blank-panel bug).
 *
 * Renders whatever is currently SELECTED — a `SearchResult` from `../lib/librarySearch` — or
 * nothing at all when there is no selection. A `SearchResult` carries only
 * `{ id, title, category, source, status? }`, so the extra detail a card needs (an artifact's
 * description, a decision's load-bearing flag) is looked up from the already-loaded corpus via the
 * pure `../lib/selectionDetail` helper, which is TOLERANT of a stale selection whose id has
 * fallen out of the corpus (the inc-3 real-data crash-class guard) — the card then degrades to
 * the `SearchResult`'s own fields alone.
 *
 * ★ A DECISION IS AN ARTIFACT (ADR-0403 dec 1), so the status chip and the load-bearing badge sit
 * on the ARTIFACT branch. They used to sit on an `else` branch reached only by `source: 'doc'`,
 * back when a decision arrived from the docs walker; PR #1546 deleted that producer, and after the
 * repoint a decision arrives as `source: 'asset'` — so leaving them there would have rendered every
 * decision as a bare kind-and-description card with its status silently dropped.
 *
 * The forest-cozy palette / card layout / badge look is the story's operator-attested UAT leg
 * (ADR-0188 dec 3/7 / ADR-0070) — not asserted here.
 */

import { kindLabel, useArcDisplay } from '../lib/kindDisplay';
import { resolveSelectionDetail } from '../lib/selectionDetail';
import type { SearchResult } from '../lib/librarySearch';
import type { GuidanceAsset } from '../types';

export interface LibrarySelectionCardProps {
  selection: SearchResult | null;
  assets: GuidanceAsset[];
  /** Invoked with the current selection when the Open button fires. */
  onOpen: (result: SearchResult) => void;
}

/** The pinned selection card — null selection renders nothing. */
export function LibrarySelectionCard({
  selection,
  assets,
  onOpen,
}: LibrarySelectionCardProps): React.JSX.Element | null {
  const arcDisplay = useArcDisplay();

  if (selection === null) return null;

  const detail = resolveSelectionDetail(selection, assets);
  // The chip prefers the resolved corpus row over the carried result, so a card opened from a
  // stale pick still shows the CURRENT status rather than the one ranked at search time.
  const status = detail.status ?? selection.status;

  return (
    <div className="library-selection-card" data-testid="library-selection-card">
      <div className="library-selection-title">{selection.title}</div>
      <span className="library-selection-kind" data-testid="library-selection-kind">
        {kindLabel(selection.category, arcDisplay)}
      </span>
      {status !== undefined && (
        <span className="library-selection-status" data-testid="library-selection-status">
          {status}
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
      {detail.description !== undefined && (
        <p className="library-selection-description" data-testid="library-selection-description">
          {detail.description}
        </p>
      )}
      {/* Compact icon button (ADR-0193 dec 5) — the accessible name stays "Open" via aria-label;
          the word-button's real estate was owner-rejected. */}
      <button
        type="button"
        className="library-selection-open"
        aria-label="Open"
        title="Open"
        onClick={() => onOpen(selection)}
      >
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
