/**
 * overviewConstellation — the pure heart of the Library OVERVIEW (ADR-0185 dec 4, increment 5 of
 * the library-tech-tree-overlay story): the empty-state, whole-corpus dot field.
 *
 * Five pure functions, none of which fetch (they read only the `assets` handed in):
 *
 *   - `importanceOf(assets)` — the in+out DEGREE of each node over the `references[]` graph.
 *     Degree-only, and it stays that way: the weighted (load-bearing) enrichment this comment once
 *     deferred to "increment 6" was RETIRED before being built (ADR-0188 retires ADR-0187 dec 3's
 *     overview information design; the zoomed-out weighted field is not mounted). The load-bearing
 *     signal did land and is read ELSEWHERE — `GuidanceAsset.loadBearing` feeds the Library
 *     selection card via `resolveSelectionDetail` (`./selectionDetail`), not this module.
 *
 *     ★ THE CONSTELLATION IS ASSETS-ONLY NOW (ADR-0403 dec 1). It drew a node per doc too, as a
 *     SQUARE labelled `category: 'adr'`, because the decision log was the `docs/decisions/`
 *     subtree; PR #1546 deleted that subtree, so those squares became the 113 surviving REFERENCE
 *     documents wearing a decision's shape. Decisions are ordinary `adr` artifacts and were
 *     ALREADY drawn as circles out of `assets` — so the doc fold had stopped adding decisions and
 *     was only adding mislabelled ones. The stale ADR-0251 note that used to sit here is gone with
 *     it: `DocMeta` no longer carries `loadBearing?`/`references?` at all, and an `adr` artifact's
 *     out-degree is now its real reference count like any other node's.
 *   - `sizeTiers(assets)` — buckets importance into exactly 3 monotonic size tiers (0..2).
 *   - `lodBand(zoom)` — maps a zoom level to one of `'far' | 'mid' | 'close'` at settled,
 *     monotonic thresholds (more zoom never reverses to a farther band).
 *   - `constellationLayout(assets, seed)` — a total, deterministic, cycle-tolerant position
 *     for every corpus node, wrapping `stressSeeds` (`./stressLayout`) the same way the map's
 *     stress layout mode does: a per-node dependency RANK (0 = foundation, cycle-tolerant —
 *     terminates on a reference cycle via a visiting-guard rather than looping or throwing) seeds
 *     the soft y-hierarchy anchor, and an edge is added `(referenced -> referencer)` for every
 *     resolvable reference (mirrors `focusGraph.ts`'s dagre convention). The exact rank/position
 *     is NOT a contract — only totality and determinism are.
 *   - `glowIds(query, assets)` — the ids `searchCorpus` (`./librarySearch`) matches for the
 *     live query; the `MIN_QUERY_LENGTH` floor lives in `searchCorpus` itself.
 */

import { searchCorpus } from './librarySearch';
import { stressSeeds, type Pt, type StressEdge, type StressNode } from './stressLayout';
import type { GuidanceAsset } from '../types';

export type { Pt };

/** One of the three geometric levels of detail the dot field renders at. */
export type LodBand = 'far' | 'mid' | 'close';

/** One of the three monotonic size buckets `sizeTiers` assigns. */
export type SizeTier = 0 | 1 | 2;

const REF_PREFIXES = ['asset:', 'doc:'] as const;

/** Strips a `"asset:<id>"` / `"doc:<relpath>"` pointer down to the bare target id. */
function resolveRef(ref: string): string {
  for (const prefix of REF_PREFIXES) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return ref;
}

/**
 * The in+out DEGREE of each corpus node over the `references[]` graph. Every asset id is present in
 * the returned map (totality), including isolated (degree-0) nodes.
 */
export function importanceOf(assets: GuidanceAsset[]): Map<string, number> {
  const importance = new Map<string, number>();
  for (const a of assets) importance.set(a.id, 0);

  for (const a of assets) {
    // Out-degree: the count of this node's own references (regardless of whether the target
    // resolves inside the loaded corpus — an unresolvable pointer still costs the referencer).
    importance.set(a.id, (importance.get(a.id) ?? 0) + a.references.length);
    // In-degree: every resolvable reference bumps its target.
    for (const ref of a.references) {
      const target = resolveRef(ref);
      if (importance.has(target)) {
        importance.set(target, (importance.get(target) ?? 0) + 1);
      }
    }
  }

  return importance;
}

/**
 * Buckets `importanceOf`'s degree score into exactly 3 monotonic size tiers (0 = smallest, 2 =
 * largest): a min-max normalised position split into thirds. A totally flat corpus (every node
 * equally important) lands everyone in the middle tier. Every asset id is present (totality).
 */
export function sizeTiers(assets: GuidanceAsset[]): Map<string, SizeTier> {
  const importance = importanceOf(assets);
  const values = [...importance.values()];
  const tiers = new Map<string, SizeTier>();
  if (values.length === 0) return tiers;

  const min = Math.min(...values);
  const max = Math.max(...values);

  for (const [id, value] of importance) {
    if (max === min) {
      tiers.set(id, 1);
      continue;
    }
    const frac = (value - min) / (max - min);
    const tier: SizeTier = frac >= 2 / 3 ? 2 : frac >= 1 / 3 ? 1 : 0;
    tiers.set(id, tier);
  }

  return tiers;
}

/** Zoom thresholds: below FAR_MAX is 'far', below MID_MAX is 'mid', else 'close'. */
const FAR_MAX = 2;
const MID_MAX = 4;

/** Maps a zoom level to its LOD band. Monotonic: more zoom never reverses to a farther band. */
export function lodBand(zoom: number): LodBand {
  if (zoom < FAR_MAX) return 'far';
  if (zoom < MID_MAX) return 'mid';
  return 'close';
}

const LAYOUT_RADIUS = 40;

/**
 * A pure, deterministic, cycle-tolerant dependency rank per node (0 = foundation): the longest
 * resolvable-reference chain reaching that node, computed via DFS memoisation with a
 * currently-visiting guard so a reference cycle terminates (returns 0 for the back-edge) rather
 * than looping or throwing.
 */
function rankOf(
  ids: string[],
  referencesOf: (id: string) => string[],
  known: Set<string>,
): Map<string, number> {
  const rank = new Map<string, number>();
  const visiting = new Set<string>();

  function computeRank(id: string): number {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard: treat the back-edge as foundation-level
    visiting.add(id);
    let r = 0;
    for (const ref of referencesOf(id)) {
      if (!known.has(ref) || ref === id) continue;
      r = Math.max(r, computeRank(ref) + 1);
    }
    visiting.delete(id);
    rank.set(id, r);
    return r;
  }

  for (const id of ids) computeRank(id);
  return rank;
}

/**
 * Assigns a position to EVERY corpus node, wrapping `stressSeeds`. Totality (every node gets a
 * position) and determinism (same corpus + seed -> identical positions) are the contract; the
 * exact coordinates are not.
 */
export function constellationLayout(
  assets: GuidanceAsset[],
  seed: string,
): Map<string, Pt> {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  function referencesOf(id: string): string[] {
    const asset = assetById.get(id);
    return asset ? asset.references.map(resolveRef) : [];
  }

  const nodeIds = assets.map((a) => a.id).sort();
  const known = new Set(nodeIds);
  const rank = rankOf(nodeIds, referencesOf, known);

  const stressNodes: StressNode[] = nodeIds.map((id) => ({
    id,
    rank: rank.get(id) ?? 0,
    radius: LAYOUT_RADIUS,
  }));

  const edges: StressEdge[] = [];
  for (const id of nodeIds) {
    for (const ref of referencesOf(id)) {
      if (!known.has(ref) || ref === id) continue;
      // The referenced node is upstream of the referencer (mirrors focusGraph's dagre edges).
      edges.push({ from: ref, to: id });
    }
  }

  const seeded = stressSeeds(stressNodes, edges, seed);
  const out = new Map<string, Pt>();
  nodeIds.forEach((id, index) => {
    out.set(id, seeded.get(index) ?? { x: 0, y: 0 });
  });
  return out;
}

/** The ids `searchCorpus` matches for `query` over the loaded corpus (the search-glow set). */
export function glowIds(query: string, assets: GuidanceAsset[]): Set<string> {
  return new Set(searchCorpus(query, assets).map((r) => r.id));
}
