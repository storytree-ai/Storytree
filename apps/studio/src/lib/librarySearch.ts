/**
 * librarySearch — the finder's pure ranking heart (ADR-0185 dec 2/3, increment 2 of the
 * library-tech-tree-overlay story).
 *
 * `searchCorpus(query, assets)` ranks the already-loaded LIBRARY CORPUS client-side: an asset
 * matches on `id` / `title` / `description` / `body` (all four are on the wire, so the match is
 * free). A strong-field hit (id/title) outranks a weak-field-only hit (description/body); within a
 * rank, input order is preserved. An empty, whitespace, or below-floor (< 2 char) query yields
 * nothing — the whole-corpus empty-state overview is a later increment's job (ADR-0185 dec 4), not
 * this one's.
 *
 * ★ IT NO LONGER RANKS `docs`. It used to fold every `/api/docs` entry in as `category: 'adr'`,
 * because until ADR-0403 dec 1 the decision log WAS a docs subtree and the fold was the only way a
 * decision reached the finder. Decisions are ordinary `adr` artifacts now and arrive through
 * `assets` like everything else, so the fold stopped carrying decisions when PR #1546 deleted
 * `docs/decisions/` — and kept labelling the surviving 113 REFERENCE docs (research notes, surveys,
 * infra runbooks) "Decisions", which is the lie rather than a cosmetic one: it is what made the
 * Decisions scope list reference material and no decisions at all.
 *
 * There is no honest label to give them instead. `SearchResult.category` is an `AssetCategory` and
 * a reference document is not an artifact kind; and since ADR-0197 the finder is governed
 * end-to-end by the lifecycle triad, which a doc carrying no status cannot project onto — so a doc
 * result could not survive `filterResultsByState` even if it were ranked. Reference docs keep their
 * own pathways, which is what ADR-0205 named them: an in-corpus cross-link from an artifact's
 * `doc:` reference, and the `#/doc/<id>` deep link.
 */

import type { AdrDocStatus, AssetCategory, GuidanceAsset } from '../types';

/**
 * Which half of the corpus a result came from. `'doc'` is retained for {@link
 * planDive}/`DocView`, which still render a document reached by cross-link or deep link —
 * `searchCorpus` itself no longer mints one (see the module note).
 */
export type SearchResultSource = 'asset' | 'doc';

/** One ranked finder result — everything a result row needs to render. */
export interface SearchResult {
  id: string;
  title: string;
  /** The asset's own category — `'adr'` for a decision, which is an ordinary artifact kind. */
  category: AssetCategory;
  source: SearchResultSource;
  /** A decision's lifecycle status (`adr` results, when the row carries one). */
  status?: AdrDocStatus;
}

/** Below this trimmed length a query is too short to search (yields no results). */
const MIN_QUERY_LENGTH = 2;

/**
 * The finder-parity `SearchResult` for one asset — the SINGLE place an asset is turned into a
 * result, so the status crossing cannot be present on one listing path and missing on another.
 *
 * A decision's `status` rides `GuidanceAsset.status` (ADR-0403 dec 1); it is narrowed here rather
 * than trusted, because the wire field is a bare `string` shared with every other kind's own
 * vocabulary — an `arc`'s or `increment`'s status must never render as a decision chip.
 */
export function assetResult(asset: GuidanceAsset): SearchResult {
  const result: SearchResult = {
    id: asset.id,
    title: asset.title,
    category: asset.category,
    source: 'asset',
  };
  const status = adrStatusOf(asset);
  if (status !== undefined) result.status = status;
  return result;
}

/** An `adr` asset's ADR-0037 status, or `undefined` for any other kind or an unknown value. */
export function adrStatusOf(asset: GuidanceAsset): AdrDocStatus | undefined {
  if (asset.category !== 'adr') return undefined;
  switch (asset.status) {
    case 'proposed':
    case 'accepted':
    case 'superseded':
      return asset.status;
    default:
      return undefined;
  }
}

/** Ranks the loaded corpus against `query`; `[]` for an empty/whitespace/below-floor query. */
export function searchCorpus(query: string, assets: GuidanceAsset[]): SearchResult[] {
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
    ranked.push({ result: assetResult(asset), rank: strong ? 0 : 1, order: order++ });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return ranked.map((r) => r.result);
}
