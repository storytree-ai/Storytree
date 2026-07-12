/**
 * selectionDetail — the pure detail-lookup heart of the pinned Library SELECTION CARD
 * (`library-selection-card` capability, ADR-0188 dec 3).
 *
 * A `SearchResult` (`../lib/librarySearch`) carries only `{ id, title, category, source, status? }`
 * — no description, no load-bearing flag. The selection card needs both, so this helper resolves
 * them from the already-loaded corpus (`assets` / `docs`) by id. TOLERANT by construction: an id
 * absent from the corpus (a stale pick, a corpus that reloaded) resolves to `undefined` fields
 * rather than throwing — the inc-3 real-data crash-class guard. Pure input → output, no React, no
 * DOM, so it proves directly in a plain unit test.
 */

import type { DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** The extra detail a `SearchResult` can't carry, resolved from the loaded corpus by id. */
export interface SelectionDetail {
  /** The matching `GuidanceAsset.description` (asset selections only); `undefined` if none matches. */
  description?: string;
  /** The matching `DocMeta.status` (ADR selections only); `undefined` if none matches. */
  status?: DocMeta['status'];
  /** The matching `DocMeta.loadBearing` (ADR selections only); `undefined` if none matches. */
  loadBearing?: boolean;
}

/**
 * Resolve `selection`'s extra display detail from the loaded corpus. An asset selection
 * (`source: 'asset'`) is looked up in `assets` by id; an ADR selection (`source: 'doc'`) is looked
 * up in `docs` by id. A stale id absent from the relevant corpus yields `{}` — every field
 * `undefined` — never a throw.
 */
export function resolveSelectionDetail(
  selection: SearchResult,
  assets: GuidanceAsset[],
  docs: DocMeta[],
): SelectionDetail {
  if (selection.source === 'asset') {
    const match = assets.find((a) => a.id === selection.id);
    return match ? { description: match.description } : {};
  }
  const match = docs.find((d) => d.id === selection.id);
  if (!match) return {};
  const detail: SelectionDetail = { status: match.status };
  if (match.loadBearing !== undefined) {
    detail.loadBearing = match.loadBearing;
  }
  return detail;
}
