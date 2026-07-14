/**
 * libraryShelf — the finder's pure idle-browse heart (ADR-0188 dec 2, reworked by ADR-0196 D3's
 * `library-lifecycle-shelf` capability into a lifecycle-aware shelf).
 *
 * `buildCategoryShelf(assets, docs)` groups the loaded corpus into one shelf entry per
 * `AssetCategory` PRESENT among `assets` (its TOTAL `count` + its `liveCount` of `open`/`active`
 * items, via `lifecycleOf` from `@storytree/library` — ADR-0196 D4, the single home of the
 * lifecycle mapping), plus a Decisions entry (`category: 'adr'`) counting only `docs` with
 * `group === 'Decisions'` (the 223 -> 191 count-bug fix) — the shelf is DERIVED from the loaded
 * corpus, never a hardcoded kind list (ADR-0188 dec 2). A category absent from `assets` gets no
 * entry.
 *
 * `listCategoryResults(category, assets, docs)` is the companion browse heart: given a scoped
 * category (an `AssetCategory`, or the Decisions/`'adr'` pseudo-scope), it returns ALL of that
 * category's artifacts as finder-parity `SearchResult`s, with no query floor — this is the list
 * the scope chip shows before any typing (`../lib/librarySearch`'s `searchCorpus` floors below
 * a 2-char query; this heart never floors, since browsing an already-chosen scope is not search).
 *
 * `listScopedBrowseResults(category, assets, docs, mode, selectedState)` layers the Active|All
 * toggle + per-kind state-chip filters over `listCategoryResults` for the scoped browse list.
 *
 * All functions are pure (input -> output, no React, no DOM) so they prove directly.
 */

import { lifecycleOf } from '@storytree/library';
import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';
import type { SearchResult } from './librarySearch';

/** One category-shelf row: the category, its TOTAL corpus count, and its live (`open`+`active`) count. */
export interface ShelfEntry {
  category: AssetCategory;
  count: number;
  /** How many of this category's items project (via `lifecycleOf`) to `open` or `active`. */
  liveCount: number;
}

function isLive(state: ReturnType<typeof lifecycleOf>): boolean {
  return state === 'open' || state === 'active';
}

/**
 * Groups `assets` by `category` into one shelf entry per category PRESENT (its total + live
 * count), plus a Decisions entry (`category: 'adr'`) counting only `group === 'Decisions'` docs.
 */
export function buildCategoryShelf(assets: GuidanceAsset[], docs: DocMeta[]): ShelfEntry[] {
  const counts = new Map<AssetCategory, number>();
  const liveCounts = new Map<AssetCategory, number>();
  for (const asset of assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
    const state = lifecycleOf(asset.category, { route: asset.fields?.route, status: asset.status });
    if (isLive(state)) {
      liveCounts.set(asset.category, (liveCounts.get(asset.category) ?? 0) + 1);
    }
  }

  const entries: ShelfEntry[] = [];
  for (const [category, count] of counts) {
    entries.push({ category, count, liveCount: liveCounts.get(category) ?? 0 });
  }

  const decisionsDocs = docs.filter((doc) => doc.group === 'Decisions');
  const decisionsLive = decisionsDocs.filter((doc) => isLive(lifecycleOf('adr', { status: doc.status })))
    .length;
  entries.push({ category: 'adr', count: decisionsDocs.length, liveCount: decisionsLive });
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
 * The per-kind stored-state chip vocabulary for a scoped category (ADR-0196 D3 Consequences —
 * kind-local detail, "where it went", not the collapsed universal triad). `undefined` = stateless
 * (no chips render for this category).
 */
export function stateVocabularyFor(category: AssetCategory): string[] | undefined {
  switch (category) {
    case 'friction':
      return ['open', 'routed', 'archived'];
    case 'adr':
      return ['proposed', 'accepted', 'superseded'];
    case 'plan':
      return ['open', 'active', 'archived'];
    default:
      return undefined;
  }
}

/** A friction/plan asset's OWN-vocabulary state label; `undefined` for a stateless category. */
export function ownStateOfAsset(asset: GuidanceAsset): string | undefined {
  switch (asset.category) {
    case 'friction': {
      const route = asset.fields?.route;
      if (!route) return 'open';
      if (route === 'nothing') return 'archived';
      return 'routed';
    }
    case 'plan':
      // Plan's stored five-state enum has no shorter kind-local spelling — the projected
      // triad IS its display detail (ADR-0196 D3).
      return lifecycleOf('plan', { status: asset.status });
    default:
      return undefined;
  }
}

/** A Decisions doc's OWN-vocabulary state label — its ADR frontmatter status. */
export function ownStateOfDoc(doc: DocMeta): string | undefined {
  return doc.status;
}

/**
 * Whether the Active|All toggle auto-filters a scoped category's browse list. Categories whose
 * OWN stored vocabulary is richer than the universal triad (friction's open/routed/archived,
 * Decisions' proposed/accepted/superseded) keep that richer vocabulary as the sole browse filter
 * via chip selection; a category whose own vocabulary already IS the triad (plan) — or a stateless
 * category, where every item is live and the toggle is a no-op — is filtered by the toggle too.
 */
function toggleFiltersScopedBrowse(category: AssetCategory): boolean {
  return category !== 'friction' && category !== 'adr';
}

/**
 * The scoped browse list (no query floor), filtered by an optional selected state chip
 * (`selectedState`, an `ownStateOf*` label) and, for categories {@link toggleFiltersScopedBrowse}
 * governs, by Active-mode liveness (`lifecycleOf` `open`/`active`).
 */
export function listScopedBrowseResults(
  category: AssetCategory,
  assets: GuidanceAsset[],
  docs: DocMeta[],
  mode: 'active' | 'all',
  selectedState: string | null,
): SearchResult[] {
  if (category === 'adr') {
    const filtered = docs.filter((doc) => {
      if (selectedState !== null && ownStateOfDoc(doc) !== selectedState) return false;
      return true;
    });
    return listCategoryResults('adr', [], filtered);
  }

  const filtered = assets.filter((asset) => {
    if (asset.category !== category) return false;
    if (selectedState !== null && ownStateOfAsset(asset) !== selectedState) return false;
    if (mode === 'active' && toggleFiltersScopedBrowse(category)) {
      const state = lifecycleOf(category, { route: asset.fields?.route, status: asset.status });
      if (!isLive(state)) return false;
    }
    return true;
  });
  return listCategoryResults(category, filtered, []);
}
