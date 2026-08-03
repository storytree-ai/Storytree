// vegetation-render — merge every island's growth selection into the ONE flat lookup the scene walk
// reads (ADR-0292 D1/D2), and answer "has the picture moved?" cheaply enough that a settled forest
// pays nothing for this arc existing.
//
// The same split `forest-regrow-render.ts` uses: the expensive half (one scene walk per island) is
// `deriveIslandVegetationPlans`, memoised on the scene; this is the cheap per-frame half, and it only
// touches islands that are actually mid-accretion.

import type { SceneNode } from '@storytree/forest-world';
import type { ForestRegrowState } from './forest-regrow.js';
import {
  islandVegetationAtProgress,
  type IslandVegetationPlan,
  type VegetationRender,
} from './island-vegetation-growth.js';

/**
 * Per-object vegetation growth for the whole map, keyed by scene-node identity.
 *
 * Absent/null on the `SceneCtx` ⇒ every node renders exactly as it did before this arc existed, which
 * is what keeps the website's own mapper (and every non-studio consumer) untouched.
 */
export interface VegetationRenderLayer {
  readonly byNode: ReadonlyMap<SceneNode, VegetationRender>;
}

/**
 * Each story's local vegetation cursor, from a regrow state — or from no regrow at all.
 *
 * `null` (the ordinary map, and every frame after the intro settles) means EVERY island is at 1: the
 * trees are mature, the decor carries no transform, and the layer is a constant that the caller can
 * hold across every frame for free. A regrow supplies the same 0→1 the ground accretion is riding, so
 * the vegetation cannot drift from the island under it.
 */
export function vegetationProgressByStory(
  state: ForestRegrowState | null,
  storyIds: Iterable<string>,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const id of storyIds) out.set(id, 1);
  if (!state) return out;
  for (const id of state.absentStoryIds) if (out.has(id)) out.set(id, 0);
  for (const growth of state.growing) if (out.has(growth.storyId)) out.set(growth.storyId, growth.progress);
  return out;
}

/**
 * Compose the per-frame layer.
 *
 * An island at cursor 1 still contributes its TREE and PLANTS — they are images now, at their mature
 * frame, and that is the settled map's art (ADR-0292 D2), not a leftover animation. It contributes no
 * decor transform and no nameplate offset, because `islandVegetationAtProgress` omits anything already
 * at rest. So the settled forest's DOM differs from the pre-arc one only where an image replaced
 * vector art, and there is nothing left for a frame to advance.
 */
export function vegetationRenderLayer(
  plans: ReadonlyMap<string, IslandVegetationPlan>,
  progressByStory: ReadonlyMap<string, number>,
): VegetationRenderLayer {
  const byNode = new Map<SceneNode, VegetationRender>();
  for (const [storyId, plan] of plans) {
    for (const [node, render] of islandVegetationAtProgress(plan, progressByStory.get(storyId) ?? 1)) {
      byNode.set(node, render);
    }
  }
  return { byNode };
}

/**
 * A signature of everything the layer above DRAWS, so the caller can hand back the PREVIOUS layer
 * object when nothing has moved.
 *
 * This is not an optimisation detail — it is the difference between this arc costing nothing on a
 * settled map and costing a full repaint per frame forever. A forest-map frame's cost is
 * rasterisation and any write inside the SVG invalidates paint for the whole subtree (ADR-0272), so a
 * NEW layer object on an unchanged picture breaks `SceneView`'s memo bail-out and buys a ~150–217 ms
 * repaint for an identical frame.
 *
 * Only the growing islands' cursors are in here (at the precision the renderer actually uses),
 * because a landed island's vegetation is a pure function of the plan, which does not change without
 * a new scene — and a new scene re-derives the plans anyway.
 */
export function vegetationLayerSignature(state: ForestRegrowState | null): string {
  if (!state) return 'settled';
  const growing = state.growing.map((g) => `${g.storyId}:${g.progress.toFixed(4)}`).join(',');
  return `${state.absentStoryIds.size}|${growing}`;
}
