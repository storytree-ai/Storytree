// forest-regrow-render — turn a `ForestRegrowState` into the render layer the scene walk reads.
//
// Split from `forest-regrow.ts` on purpose: that module is the ORDER and the CLOCK and knows
// nothing about geometry; this one is the bridge to Experiment 6's connected island accretion
// (`svg-island-accretion.ts`) and knows nothing about waves or dependency depth.
//
// The expensive half — deriving one adjacency-wave accretion plan per island — happens ONCE per
// scene (`deriveForestRegrowAccretionPlans`). The per-frame half (`forestRegrowRenderLayer`)
// only re-selects each still-growing island's cell scales and merges them into two flat lookups,
// so the scene walk stays O(1) per node no matter how many islands are in flight.

import type { SceneNode } from '@storytree/forest-world';
import type { ForestRegrowRenderLayer } from './SceneView.js';
import {
  deriveSvgIslandAccretionPlan,
  svgIslandAccretionAtProgress,
  type SvgIslandAccretionCellReveal,
  type SvgIslandAccretionPlan,
  type SvgIslandAccretionPoint,
} from './svg-island-accretion.js';
import type { ForestRegrowState } from './forest-regrow.js';

export interface ForestRegrowAccretionPlans {
  readonly byStory: ReadonlyMap<string, SvgIslandAccretionPlan>;
  /**
   * Stories whose island geometry could not carry a connected accretion — no cells, no coast, or
   * a mesh that is not one shared-edge component. They are NOT dropped from the regrow: they land
   * on the plan's own schedule with their coast and ground simply appearing. Surfaced rather than
   * swallowed so "why did that island pop?" has an answer that is not a guess.
   */
  readonly ungrown: readonly { readonly storyId: string; readonly reason: string }[];
}

/**
 * One accretion plan per island, derived from the SETTLED scene — the same scene the map already
 * draws, so the growth runs over the real island geometry rather than a second copy of it.
 *
 * Deriving a plan walks the whole scene once per story, which is why this is memoised on the scene
 * by the caller and never recomputed per frame.
 */
export function deriveForestRegrowAccretionPlans(
  scene: SceneNode,
  anchors: ReadonlyMap<string, SvgIslandAccretionPoint>,
): ForestRegrowAccretionPlans {
  const byStory = new Map<string, SvgIslandAccretionPlan>();
  const ungrown: { storyId: string; reason: string }[] = [];
  // Sorted so the derivation order — and therefore any reported failure order — is deterministic.
  for (const storyId of [...anchors.keys()].sort()) {
    const anchor = anchors.get(storyId)!;
    try {
      byStory.set(storyId, deriveSvgIslandAccretionPlan(scene, storyId, anchor));
    } catch (error) {
      ungrown.push({
        storyId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { byStory, ungrown };
}

/**
 * A cheap signature of everything the render layer actually DRAWS.
 *
 * Measured 2026-08-02 on the real 40-island corpus: a frame in a wave GAP — nothing accreting,
 * nothing appearing — still cost ~300 ms p50, the same as a frame doing real work, because a new
 * layer object broke `SceneView`'s `React.memo` bail-out and any write inside the SVG invalidates
 * paint for the whole subtree (ADR-0272). Those frames were paying a full repaint to draw an
 * identical picture. Comparing this signature lets the caller hand back the PREVIOUS layer object
 * when the picture has not moved, so the memo holds and the frame costs nothing.
 *
 * The two hidden sets are summarised by SIZE, which is exact here rather than a shortcut: within
 * one plan both sets shrink monotonically as the cursor advances (an island or a road that has
 * appeared never disappears), so for a given plan the size determines the set.
 *
 * Each growing island contributes its local progress at the precision the renderer actually uses
 * (`toFixed(4)`), so two cursors that would paint identical cell scales compare equal.
 */
export function forestRegrowLayerSignature(state: ForestRegrowState): string {
  const growing = state.growing
    .map((g) => `${g.storyId}:${g.progress.toFixed(4)}`)
    .join(',');
  return `${state.absentStoryIds.size}|${state.hiddenSegmentIds.size}|${growing}`;
}

/**
 * Compose the per-frame render layer.
 *
 * An island that is LANDED is left out of the accretion lookups entirely — it is settled geometry
 * and must not carry a clip or a per-cell transform, or the finished forest would keep paying for
 * growth it has already done.
 */
export function forestRegrowRenderLayer(
  state: ForestRegrowState,
  plans: ForestRegrowAccretionPlans,
): ForestRegrowRenderLayer {
  const accretionByStory = new Map<string, ReturnType<typeof svgIslandAccretionAtProgress>>();
  const cellRevealByPath = new Map<string, SvgIslandAccretionCellReveal>();
  for (const growth of state.growing) {
    const plan = plans.byStory.get(growth.storyId);
    if (!plan) continue; // an ungrown island: it appears whole, on schedule
    const accretion = svgIslandAccretionAtProgress(plan, growth.progress);
    accretionByStory.set(growth.storyId, accretion);
    for (const [path, reveal] of accretion.cellByPath) cellRevealByPath.set(path, reveal);
  }
  return {
    hiddenStoryIds: state.absentStoryIds,
    hiddenSegmentIds: state.hiddenSegmentIds,
    accretionByStory,
    cellRevealByPath,
  };
}
