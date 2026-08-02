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
import type { RevealSegment, TrailRevealPlan } from './trailReveal.js';

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
 *
 * The ADR-0286 coast set needs no term of its own: it is `absent ∪ growing`, and both halves are
 * already determined here — the absent set by its size (monotone within a plan, as above), the
 * growing set by the ids listed. Two states with the same signature therefore hide the same moat.
 */
export function forestRegrowLayerSignature(state: ForestRegrowState): string {
  const growing = state.growing
    .map((g) => `${g.storyId}:${g.progress.toFixed(4)}`)
    .join(',');
  return `${state.absentStoryIds.size}|${state.hiddenSegmentIds.size}|${growing}`;
}

/**
 * The same stability trick for the PATHWAY half (ADR-0283 D1): a signature of everything the
 * cursor-driven trail masks actually draw. Segments that are fully drawn or not started carry no
 * mask at all, so only the in-flight front is in here — which is also why the plan below stays
 * small however big the forest is.
 */
export function forestRegrowTrailSignature(state: ForestRegrowState): string {
  return state.drawingSegments.map((s) => `${s.id}:${s.drawn.toFixed(4)}`).join(',');
}

/**
 * Turn the regrow's in-flight pathway fronts into the `TrailRevealPlan` the existing per-segment
 * mask hookup already consumes (`SceneView`'s `ctx.reveal` → `mask="url(#trail-m-…)"`).
 *
 * This is a DELIBERATE mechanism change, not a reuse: increment 1 rode `arrivalGrowPlan`'s CSS
 * beat (a per-segment `animation-delay` plus a 0.35 s keyframe), which starts when the mask
 * element mounts and cannot be sampled. ADR-0283 D1 makes the moment a pathway ARRIVES the thing
 * the schedule is built on, so the growth has to be a number the app holds — hence `drawn`, taken
 * straight off the cursor. The DOM shape (a pathLength-normalised mask stroke) is unchanged; only
 * what advances the dash-offset moved from the stylesheet to the plan.
 *
 * `usageById` is the routed network's per-segment usage, used for the mask stroke width exactly
 * as `arrivalGrowPlan` uses it. A segment missing from it falls back to 1.
 */
export function forestRegrowTrailPlan(
  state: ForestRegrowState,
  usageById: ReadonlyMap<string, number>,
): TrailRevealPlan | null {
  if (state.drawingSegments.length === 0) return null;
  const segments: RevealSegment[] = state.drawingSegments
    .map((growth) => ({
      id: growth.id,
      // The cursor owns the timing now, so there is no stagger left to express.
      delayMs: 0,
      drawn: growth.drawn,
      fromEnd: growth.fromEnd,
      dir: 'both' as const,
      revealedUsage: usageById.get(growth.id) ?? 1,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    focusId: 'forest-regrow',
    segments,
    byId: new Map(segments.map((segment) => [segment.id, segment])),
  };
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
  // ADR-0286: the pale coast waits for the SETTLED island, so it is hidden for everything that has
  // not landed — absent islands and accreting ones alike. Built here rather than in the schedule
  // because it is a render-side reveal rule, not a change to when an island forms.
  const hiddenEmptyStoryIds = new Set<string>(state.absentStoryIds);
  for (const growth of state.growing) {
    hiddenEmptyStoryIds.add(growth.storyId);
    const plan = plans.byStory.get(growth.storyId);
    if (!plan) continue; // an ungrown island: it appears whole, on schedule
    const accretion = svgIslandAccretionAtProgress(plan, growth.progress);
    accretionByStory.set(growth.storyId, accretion);
    for (const [path, reveal] of accretion.cellByPath) cellRevealByPath.set(path, reveal);
  }
  return {
    hiddenStoryIds: state.absentStoryIds,
    hiddenEmptyStoryIds,
    hiddenSegmentIds: state.hiddenSegmentIds,
    accretionByStory,
    cellRevealByPath,
  };
}
