/**
 * libraryShelf — the finder's pure idle-browse heart (ADR-0188 dec 2, the browse-entry half of
 * the library-tech-tree-overlay story, increment `library-category-shelf`).
 *
 * `buildCategoryShelf(assets, docs)` groups the loaded corpus into one shelf entry per
 * `AssetCategory` PRESENT among `assets` (its category + how many), plus a Decisions entry
 * (`category: 'adr'`) counting `docs` — the shelf is DERIVED from the loaded corpus, never a
 * hardcoded kind list (ADR-0188 dec 2). A category absent from `assets` gets no entry.
 *
 * `listCategoryResults(category, assets, docs)` is the companion browse heart: given a scoped
 * category (an `AssetCategory`, or the Decisions/`'adr'` pseudo-scope), it returns ALL of that
 * category's artifacts as finder-parity `SearchResult`s, with no query floor — this is the list
 * the scope chip shows before any typing (`../lib/librarySearch`'s `searchCorpus` floors below
 * a 2-char query; this heart never floors, since browsing an already-chosen scope is not search).
 *
 * Both functions are pure (input -> output, no React, no DOM) so they prove directly.
 */

import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** One category-shelf row: the category and how many corpus artifacts carry it. */
export interface ShelfEntry {
  category: AssetCategory;
  count: number;
}

/**
 * Groups `assets` by `category` into one shelf entry per category PRESENT (with its count),
 * plus a Decisions entry (`category: 'adr'`) counting `docs`.
 */
export function buildCategoryShelf(assets: GuidanceAsset[], docs: DocMeta[]): ShelfEntry[] {
  const counts = new Map<AssetCategory, number>();
  for (const asset of assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
  }

  const entries: ShelfEntry[] = [];
  for (const [category, count] of counts) {
    entries.push({ category, count });
  }
  entries.push({ category: 'adr', count: docs.length });
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
