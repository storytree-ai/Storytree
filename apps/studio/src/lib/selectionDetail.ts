/**
 * selectionDetail — the pure detail-lookup heart of the pinned Library SELECTION CARD
 * (`library-selection-card` capability, ADR-0188 dec 3).
 *
 * A `SearchResult` (`../lib/librarySearch`) carries only `{ id, title, category, source, status? }`
 * — no description, no load-bearing flag. The selection card needs both, so this helper resolves
 * them from the already-loaded corpus (`assets`) by id. TOLERANT by construction: an id absent from
 * the corpus (a stale pick, a corpus that reloaded) resolves to `undefined` fields rather than
 * throwing — the inc-3 real-data crash-class guard. Pure input → output, no React, no DOM, so it
 * proves directly in a plain unit test.
 *
 * ★ THE LOAD-BEARING FLAG COMES FROM THE ASSET NOW (ADR-0403 dec 1). It was read off
 * `DocMeta.loadBearing`, folded in by the docs file-walker from `docs/decisions/*.md` frontmatter;
 * PR #1546 deleted that half of the walker, which left the badge with no producer at all — an
 * always-`undefined` lookup rendering an always-absent badge, green in every test because the
 * fixtures hand-built the deleted shape. Decisions are `adr` artifacts, so both the status and the
 * tag ride `GuidanceAsset` (`status` / `loadBearing`) and are resolved from `assets` here.
 */

import type { AdrDocStatus, GuidanceAsset } from '../types';
import { adrStatusOf } from './librarySearch';
import type { SearchResult } from './librarySearch';

/** The extra detail a `SearchResult` can't carry, resolved from the loaded corpus by id. */
export interface SelectionDetail {
  /** The matching `GuidanceAsset.description`; `undefined` if no asset matches. */
  description?: string;
  /** The matching decision's lifecycle status (`adr` selections only); `undefined` otherwise. */
  status?: AdrDocStatus;
  /** The matching decision's ADR-0086 load-bearing tag; `undefined` unless the tag is `true`. */
  loadBearing?: boolean;
}

/**
 * Resolve `selection`'s extra display detail from the loaded corpus, looked up in `assets` by id.
 * A stale id absent from the corpus yields `{}` — every field `undefined` — never a throw.
 */
export function resolveSelectionDetail(
  selection: SearchResult,
  assets: GuidanceAsset[],
): SelectionDetail {
  const match = assets.find((a) => a.id === selection.id);
  if (!match) return {};
  const detail: SelectionDetail = { description: match.description };
  const status = adrStatusOf(match);
  if (status !== undefined) detail.status = status;
  if (match.loadBearing === true) detail.loadBearing = true;
  return detail;
}
