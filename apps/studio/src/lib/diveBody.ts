/**
 * diveBody — the dive body's pure routing heart (ADR-0185 dec 3/4, increment 4 of the
 * library-tech-tree-overlay story).
 *
 * `planDive(selection)` maps the finder's centred `SearchResult | null` to a render plan telling
 * the dive body which existing renderer to mount: `AssetView` for an asset, `DocView` for a doc
 * (ADR). It routes on the `SearchResult.source` discriminant (`'asset' | 'doc'`), NEVER on
 * `category` — an ADR result carries `category: 'adr'` but `source: 'doc'`, so a category-based
 * switch would send it down the wrong (asset) path. Pure: no fetch, no DOM, no context.
 */

import type { SearchResult } from './librarySearch';

export type DiveRenderPlan =
  | { kind: 'empty' }
  | { kind: 'asset'; id: string }
  | { kind: 'doc'; id: string };

export function planDive(selection: SearchResult | null): DiveRenderPlan {
  if (!selection) return { kind: 'empty' };
  if (selection.source === 'asset') return { kind: 'asset', id: selection.id };
  return { kind: 'doc', id: selection.id };
}
