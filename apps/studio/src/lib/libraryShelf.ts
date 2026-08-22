/**
 * libraryShelf — the finder's pure idle-browse heart (ADR-0188 dec 2, reworked by ADR-0197's
 * `library-lifecycle-shelf` capability into the ONE-SELECTOR-GOVERNS-THE-PANEL shelf).
 *
 * `buildCategoryShelf(assets)` groups the loaded corpus into one shelf entry per `AssetCategory`
 * PRESENT among `assets` — its TOTAL `count` plus a `stateCounts` map of how many project (via
 * `lifecycleOf` from `@storytree/library` — ADR-0196 D4, the single home of the lifecycle mapping)
 * to each of `open`/`active`/`archived`. The shelf is DERIVED from the loaded corpus, never a
 * hardcoded kind list (ADR-0188 dec 2). A category absent from `assets` gets no entry.
 *
 * `listCategoryResults(category, assets)` is the companion browse heart: given a scoped category,
 * it returns ALL of that category's artifacts as finder-parity `SearchResult`s, with no query floor
 * — this is the list the scope chip shows before any typing (`../lib/librarySearch`'s
 * `searchCorpus` floors below a 2-char query; this heart never floors, since browsing an
 * already-chosen scope is not search).
 *
 * `listScopedBrowseResults(category, assets, state)` filters `listCategoryResults` to the selected
 * lifecycle state — uniformly for every kind (ADR-0197 D2/D3 retires the old Active|All toggle +
 * per-kind state-chip filters). `filterResultsByState(results, assets, state)` applies the same
 * selected-state filter to already-ranked `searchCorpus` results.
 *
 * ★ `'adr'` IS AN ORDINARY ASSET CATEGORY HERE, NOT A DOC PSEUDO-SCOPE (ADR-0403 dec 1). Every
 * function above carried a special `'adr'` arm that counted, listed and state-filtered `docs`
 * instead of `assets`, because the decision log used to be the `docs/decisions/` subtree. PR #1546
 * deleted that subtree, so those arms went silently hollow rather than red: `buildCategoryShelf`
 * pushed a SECOND `category: 'adr'` entry counted at 0 beside the real one the assets loop had
 * already produced from the store rows, and `listCategoryResults('adr', …)` answered the Decisions
 * scope with the 113 surviving REFERENCE docs relabelled as decisions. Decisions arrive through
 * `assets` like every other kind now, and there is no `docs` parameter left to re-introduce the
 * split.
 *
 * All functions are pure (input -> output, no React, no DOM) so they prove directly.
 */

import { lifecycleOf, type Lifecycle } from '@storytree/library';
import type { AssetCategory, GuidanceAsset } from '../types';
import { assetResult, type SearchResult } from './librarySearch';

/** The universal lifecycle triad's per-state counts (ADR-0196 D1 / ADR-0197 D2). */
export type LifecycleCounts = Record<Lifecycle, number>;

function emptyLifecycleCounts() {
  return { open: 0, active: 0, archived: 0 } satisfies LifecycleCounts;
}

/** One category-shelf row: the category, its TOTAL corpus count, and its per-state counts. */
export interface ShelfEntry {
  category: AssetCategory;
  count: number;
  /** How many of this category's items project (via `lifecycleOf`) to each state. */
  stateCounts: LifecycleCounts;
}

/**
 * The lifecycle state one asset projects onto — the ONE call site for `lifecycleOf` over an asset,
 * so the shelf's counts and the browse list's filter can never classify the same row differently.
 */
function lifecycleOfAsset(asset: GuidanceAsset): Lifecycle {
  return lifecycleOf(asset.category, {
    route: asset.fields?.route,
    status: asset.status,
    lifecycle: asset.lifecycle,
  });
}

/**
 * Groups `assets` by `category` into one shelf entry per category PRESENT (its total + per-state
 * counts). Decisions are the `adr` category like any other (ADR-0403 dec 1) — no extra entry.
 */
export function buildCategoryShelf(assets: GuidanceAsset[]): ShelfEntry[] {
  const counts = new Map<AssetCategory, number>();
  const stateCounts = new Map<AssetCategory, LifecycleCounts>();
  for (const asset of assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
    const entryCounts = stateCounts.get(asset.category) ?? emptyLifecycleCounts();
    entryCounts[lifecycleOfAsset(asset)] += 1;
    stateCounts.set(asset.category, entryCounts);
  }

  const entries: ShelfEntry[] = [];
  for (const [category, count] of counts) {
    entries.push({ category, count, stateCounts: stateCounts.get(category) ?? emptyLifecycleCounts() });
  }
  return entries;
}

/**
 * Lists ALL of a scoped category's artifacts as finder-parity `SearchResult`s, with no query
 * floor. Input order is preserved.
 */
export function listCategoryResults(
  category: AssetCategory,
  assets: GuidanceAsset[],
): SearchResult[] {
  return assets.filter((asset) => asset.category === category).map(assetResult);
}

/**
 * The scoped browse list (no query floor), filtered to the selected lifecycle `state` — uniformly
 * for every kind, via `lifecycleOf` (ADR-0197 D2/D3 retires the old Active|All toggle + per-kind
 * state-chip filters).
 */
export function listScopedBrowseResults(
  category: AssetCategory,
  assets: GuidanceAsset[],
  state: Lifecycle,
): SearchResult[] {
  return assets
    .filter((asset) => asset.category === category && lifecycleOfAsset(asset) === state)
    .map(assetResult);
}

/**
 * Filters already-ranked `searchCorpus` results to the selected lifecycle `state` (ADR-0197 D2). A
 * result whose backing asset can no longer be found (should not happen given `results` was derived
 * from the same `assets`) is dropped rather than shown un-classified.
 */
export function filterResultsByState(
  results: SearchResult[],
  assets: GuidanceAsset[],
  state: Lifecycle,
): SearchResult[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset] as const));
  return results.filter((result) => {
    const asset = assetById.get(result.id);
    return asset !== undefined && lifecycleOfAsset(asset) === state;
  });
}
