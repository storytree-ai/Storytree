/**
 * libraryShelf — the finder's pure idle-browse heart (ADR-0188 dec 2, reworked by ADR-0197's
 * `library-lifecycle-shelf` capability into the ONE-SELECTOR-GOVERNS-THE-PANEL shelf).
 *
 * `buildCategoryShelf(assets, docs)` groups the loaded corpus into one shelf entry per
 * `AssetCategory` PRESENT among `assets` — its TOTAL `count` plus a `stateCounts` map of how many
 * project (via `lifecycleOf` from `@storytree/library` — ADR-0196 D4, the single home of the
 * lifecycle mapping) to each of `open`/`active`/`archived` — plus a Decisions entry
 * (`category: 'adr'`) whose `count`/`stateCounts` reflect only `docs` with `group === 'Decisions'`
 * (the 223 -> 191 count-bug fix) — the shelf is DERIVED from the loaded corpus, never a hardcoded
 * kind list (ADR-0188 dec 2). A category absent from `assets` gets no entry.
 *
 * `listCategoryResults(category, assets, docs)` is the companion browse heart: given a scoped
 * category (an `AssetCategory`, or the Decisions/`'adr'` pseudo-scope), it returns ALL of that
 * category's artifacts as finder-parity `SearchResult`s, with no query floor — this is the list
 * the scope chip shows before any typing (`../lib/librarySearch`'s `searchCorpus` floors below
 * a 2-char query; this heart never floors, since browsing an already-chosen scope is not search).
 *
 * `listScopedBrowseResults(category, assets, docs, state)` filters `listCategoryResults` to the
 * selected lifecycle state — uniformly for every kind (ADR-0197 D2/D3 retires the old Active|All
 * toggle + per-kind state-chip filters). `filterResultsByState(results, assets, docs, state)`
 * applies the same selected-state filter to already-ranked `searchCorpus` results, for assets and
 * Decisions alike (ADR-0197 D2).
 *
 * All functions are pure (input -> output, no React, no DOM) so they prove directly.
 */

import { lifecycleOf, type Lifecycle } from '@storytree/library';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** The universal lifecycle triad's per-state counts (ADR-0196 D1 / ADR-0197 D2). */
export type LifecycleCounts = Record<Lifecycle, number>;

function emptyLifecycleCounts(): LifecycleCounts {
  return { open: 0, active: 0, archived: 0 };
}

/** One category-shelf row: the category, its TOTAL corpus count, and its per-state counts. */
export interface ShelfEntry {
  category: AssetCategory;
  count: number;
  /** How many of this category's items project (via `lifecycleOf`) to each state. */
  stateCounts: LifecycleCounts;
}

/**
 * Groups `assets` by `category` into one shelf entry per category PRESENT (its total + per-state
 * counts), plus a Decisions entry (`category: 'adr'`) counting only `group === 'Decisions'` docs.
 */
export function buildCategoryShelf(assets: GuidanceAsset[], docs: DocMeta[]): ShelfEntry[] {
  const counts = new Map<AssetCategory, number>();
  const stateCounts = new Map<AssetCategory, LifecycleCounts>();
  for (const asset of assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
    const state = lifecycleOf(asset.category, { route: asset.fields?.route, status: asset.status });
    const entryCounts = stateCounts.get(asset.category) ?? emptyLifecycleCounts();
    entryCounts[state] += 1;
    stateCounts.set(asset.category, entryCounts);
  }

  const entries: ShelfEntry[] = [];
  for (const [category, count] of counts) {
    entries.push({ category, count, stateCounts: stateCounts.get(category) ?? emptyLifecycleCounts() });
  }

  const decisionsDocs = docs.filter((doc) => doc.group === 'Decisions');
  const decisionsStateCounts = emptyLifecycleCounts();
  for (const doc of decisionsDocs) {
    decisionsStateCounts[lifecycleOf('adr', { status: doc.status })] += 1;
  }
  entries.push({ category: 'adr', count: decisionsDocs.length, stateCounts: decisionsStateCounts });
  return entries;
}

/**
 * Lists ALL of a scoped category's artifacts as finder-parity `SearchResult`s, with no query
 * floor. The Decisions/`'adr'` pseudo-scope lists `docs`; every other category filters `assets`.
 * Input order is preserved.
 */
export function listCategoryResults(
  category: AssetCategory,
  assets: GuidanceAsset[],
  docs: DocMeta[],
): SearchResult[] {
  if (category === 'adr') {
    return docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: 'adr',
      source: 'doc',
      ...(doc.status !== undefined ? { status: doc.status } : {}),
    }));
  }

  return assets
    .filter((asset) => asset.category === category)
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      category: asset.category,
      source: 'asset',
    }));
}

/**
 * The scoped browse list (no query floor), filtered to the selected lifecycle `state` — uniformly
 * for every kind, via `lifecycleOf` (ADR-0197 D2/D3 retires the old Active|All toggle + per-kind
 * state-chip filters).
 */
export function listScopedBrowseResults(
  category: AssetCategory,
  assets: GuidanceAsset[],
  docs: DocMeta[],
  state: Lifecycle,
): SearchResult[] {
  if (category === 'adr') {
    const filtered = docs.filter((doc) => lifecycleOf('adr', { status: doc.status }) === state);
    return listCategoryResults('adr', [], filtered);
  }

  const filtered = assets.filter(
    (asset) =>
      asset.category === category &&
      lifecycleOf(category, { route: asset.fields?.route, status: asset.status }) === state,
  );
  return listCategoryResults(category, filtered, []);
}

/**
 * Filters already-ranked `searchCorpus` results to the selected lifecycle `state`, for assets and
 * Decisions alike (ADR-0197 D2). A result whose backing item can no longer be found (should not
 * happen given `results` was derived from the same `assets`/`docs`) is dropped rather than shown
 * un-classified.
 */
export function filterResultsByState(
  results: SearchResult[],
  assets: GuidanceAsset[],
  docs: DocMeta[],
  state: Lifecycle,
): SearchResult[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset] as const));
  const docById = new Map(docs.map((doc) => [doc.id, doc] as const));
  return results.filter((result) => {
    if (result.source === 'doc') {
      const doc = docById.get(result.id);
      return doc !== undefined && lifecycleOf('adr', { status: doc.status }) === state;
    }
    const asset = assetById.get(result.id);
    return (
      asset !== undefined &&
      lifecycleOf(asset.category, { route: asset.fields?.route, status: asset.status }) === state
    );
  });
}
