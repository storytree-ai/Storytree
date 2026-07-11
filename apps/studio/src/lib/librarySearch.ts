/**
 * librarySearch — the finder's pure ranking heart (ADR-0185 dec 2/3, increment 2 of the
 * library-tech-tree-overlay story).
 *
 * `searchCorpus(query, assets, docs)` ranks the already-loaded corpus client-side: an asset
 * matches on `id` / `title` / `description` / `body` (all four are on the wire, so the match is
 * free); a doc (ADR) matches on `title` / `id` ONLY — `DocMeta` carries no body, and the finder
 * must never fetch a body to search it (that fetch is increment 4's on-demand dive). A strong-
 * field hit (id/title) outranks a weak-field-only hit (description/body); within a rank, input
 * order is preserved. An empty, whitespace, or below-floor (< 2 char) query yields nothing — the
 * whole-corpus empty-state overview is a later increment's job (ADR-0185 dec 4), not this one's.
 */

import type { AssetCategory, DocMeta, GuidanceAsset } from '../types';

/** Which half of the corpus a result came from. */
export type SearchResultSource = 'asset' | 'doc';

/** One ranked finder result — everything a result row needs to render. */
export interface SearchResult {
  id: string;
  title: string;
  /** The asset's own category, or `'adr'` for a doc result. */
  category: AssetCategory;
  source: SearchResultSource;
  /** An ADR's frontmatter status (doc results only, when present on the DocMeta). */
  status?: DocMeta['status'];
}

/** Below this trimmed length a query is too short to search (yields no results). */
const MIN_QUERY_LENGTH = 2;

/** Ranks the loaded corpus against `query`; `[]` for an empty/whitespace/below-floor query. */
export function searchCorpus(
  query: string,
  assets: GuidanceAsset[],
  docs: DocMeta[],
): SearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const q = trimmed.toLowerCase();

  interface Ranked {
    result: SearchResult;
    rank: 0 | 1;
    order: number;
  }

  const ranked: Ranked[] = [];
  let order = 0;

  for (const asset of assets) {
    const strong =
      asset.id.toLowerCase().includes(q) || asset.title.toLowerCase().includes(q);
    const weak =
      !strong &&
      (asset.description.toLowerCase().includes(q) || asset.body.toLowerCase().includes(q));
    if (!strong && !weak) continue;
    ranked.push({
      result: {
        id: asset.id,
        title: asset.title,
        category: asset.category,
        source: 'asset',
      },
      rank: strong ? 0 : 1,
      order: order++,
    });
  }

  for (const doc of docs) {
    const strong = doc.id.toLowerCase().includes(q) || doc.title.toLowerCase().includes(q);
    if (!strong) continue;
    ranked.push({
      result: {
        id: doc.id,
        title: doc.title,
        category: 'adr',
        source: 'doc',
        ...(doc.status !== undefined ? { status: doc.status } : {}),
      },
      rank: 0,
      order: order++,
    });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.map((r) => r.result);
}
