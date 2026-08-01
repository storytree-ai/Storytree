// forest-regrow — the Act 2 intro's ORDER and CLOCK, derived from the real story graph.
//
// ADR-0282 D3: the regrow walks the real DAG outward from the BASE NODES (the stories with no
// `depends_on`), each island's incident trails drawing on as it lands. The sequence is derived
// from the corpus, never scripted — a different graph regrows differently, and the same graph
// regrows identically every time.
//
// This module is PURE: no React, no clock, no DOM. It answers two questions and nothing else.
//
//   1. `deriveForestRegrowPlan` — in what order, and at what normalized progress, does each
//      island land? Longest-path depth from the base nodes, so an island NEVER accretes before
//      every island it stands on has settled. Deterministic tie-break by id.
//   2. `forestRegrowAtProgress` — at cursor p, which islands are absent / accreting / landed,
//      which trail segments are drawn yet, and which islands' trails are drawing on right now.
//
// Timing lives here in MILLISECONDS and is normalized once, so the caller only ever drives a
// single 0→1 cursor (ADR-0282 D6: the app owns the clock, ordering, progress and easing).
//
// The honesty invariant mirrors trailReveal's §5: every id this module names came from the
// supplied graph. It invents no story and no segment, and a story absent from `stories` never
// appears in a plan even if an edge mentions it.

/** The shape `TrailEdgeOut` already has — an ordered segment chain between two stories. */
export interface ForestRegrowTrailEdge {
  readonly from: string;
  readonly to: string;
  readonly segments: readonly { readonly id: string }[];
}

/** The shape `TreeStory` already has, narrowed to what ordering needs. */
export interface ForestRegrowStory {
  readonly id: string;
  readonly dependsOn: readonly string[];
}

export interface ForestRegrowTuning {
  /** How long ONE island takes to accrete from nothing to settled. */
  readonly islandGrowthMs: number;
  /** The window a single wave's islands are spread across, regardless of how many there are —
   *  so a 20-island wave and a 3-island wave both read as one pulse, not a queue. */
  readonly waveSpreadMs: number;
  /** The beat between one wave settling and the next starting. */
  readonly waveGapMs: number;
  /** How long an island stays in the ARRIVAL set — the window its incident trails are masked
   *  and drawing on. Must outlast the trail draw-on animation (0.35s per segment plus the
   *  `REVEAL_STAGGER_MS` chain stagger) or a mask would be pulled mid-draw and the stroke
   *  would snap to fully painted. */
  readonly trailDrawMs: number;
  /** The tail the fully grown forest is held on before `settled` reads true. */
  readonly settleHoldMs: number;
}

export const FOREST_REGROW_TUNING: ForestRegrowTuning = {
  islandGrowthMs: 760,
  waveSpreadMs: 520,
  waveGapMs: 180,
  trailDrawMs: 2200,
  settleHoldMs: 600,
};

export interface ForestRegrowStep {
  readonly storyId: string;
  /** Longest-path depth from the base nodes. 0 ⇒ a base node (no `depends_on`). */
  readonly wave: number;
  /** Global landing index — deterministic, by (wave, id). */
  readonly order: number;
  readonly startMs: number;
  readonly endMs: number;
  /** `startMs` / `endMs` as a fraction of the plan's total duration. */
  readonly start: number;
  readonly end: number;
}

export interface ForestRegrowPlan {
  readonly steps: readonly ForestRegrowStep[];
  readonly stepByStory: ReadonlyMap<string, ForestRegrowStep>;
  /** The DAG roots this regrow grows outward from — stories with no resolvable `depends_on`. */
  readonly baseStoryIds: readonly string[];
  /** Stories the topological pass could not place because they sit on a dependency CYCLE.
   *  They land together in one final wave rather than being dropped — a cycle has no honest
   *  "after all its dependencies" position, and silently omitting an island would make the
   *  regrow claim a forest smaller than the real one. */
  readonly cyclicStoryIds: readonly string[];
  readonly waveCount: number;
  readonly durationMs: number;
  /** Segment id → the normalized progress at which BOTH its endpoints are first present, i.e.
   *  the moment the segment stops being a road to nowhere and may be drawn. Precomputed here
   *  because presence is monotonic in progress, so this threshold is fixed: the per-frame
   *  selector then costs one numeric compare per segment and allocates nothing extra. */
  readonly segmentRevealAt: ReadonlyMap<string, number>;
  readonly tuning: ForestRegrowTuning;
}

export interface ForestRegrowIslandGrowth {
  readonly storyId: string;
  /** Local 0→1 across this island's own accretion window, for `svgIslandAccretionAtProgress`. */
  readonly progress: number;
}

export interface ForestRegrowState {
  readonly progress: number;
  /** True once every island has settled and the terminal hold has elapsed. */
  readonly settled: boolean;
  /** Islands fully accreted at this cursor. */
  readonly landedStoryIds: ReadonlySet<string>;
  /** Islands mid-accretion, with their own local progress. Ordered by landing order. */
  readonly growing: readonly ForestRegrowIslandGrowth[];
  /** landed ∪ growing — everything on the map at this cursor. */
  readonly presentStoryIds: ReadonlySet<string>;
  /** The complement: nothing of these stories is drawn yet. */
  readonly absentStoryIds: ReadonlySet<string>;
  /** Segments whose two endpoints are not both present yet — not drawn at all. */
  readonly hiddenSegmentIds: ReadonlySet<string>;
  /** Islands whose incident trails are drawing on right now — feeds `arrivalGrowPlan` verbatim. */
  readonly arrivalStoryIds: readonly string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertTuning(tuning: ForestRegrowTuning): void {
  const spans: readonly (readonly [string, number])[] = [
    ['islandGrowthMs', tuning.islandGrowthMs],
    ['waveSpreadMs', tuning.waveSpreadMs],
    ['waveGapMs', tuning.waveGapMs],
    ['trailDrawMs', tuning.trailDrawMs],
    ['settleHoldMs', tuning.settleHoldMs],
  ];
  for (const [name, value] of spans) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Forest regrow tuning "${name}" must be a finite, non-negative duration.`);
    }
  }
  if (tuning.islandGrowthMs <= 0) {
    throw new Error('Forest regrow tuning "islandGrowthMs" must be positive.');
  }
}

/**
 * Longest-path depth from the base nodes, by Kahn's algorithm.
 *
 * Longest path, NOT breadth-first distance: with shortest-path depth a story could be scheduled
 * in the same wave as a transitive dependency and appear before the ground it stands on. The
 * longest path is exactly "every dependency has already been placed".
 */
function waveDepths(
  storyIds: readonly string[],
  dependsOn: ReadonlyMap<string, readonly string[]>,
): { readonly depth: ReadonlyMap<string, number>; readonly cyclic: readonly string[] } {
  const known = new Set(storyIds);
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of storyIds) {
    // Only edges to stories this graph actually holds count — a `depends_on` naming a story
    // outside the supplied set is not a reason to strand an island off the map.
    const deps = [...new Set(dependsOn.get(id) ?? [])].filter((dep) => known.has(dep) && dep !== id);
    remaining.set(id, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep);
      if (list) list.push(id);
      else dependents.set(dep, [id]);
    }
  }

  const depth = new Map<string, number>();
  // Sorted seed + sorted relaxation keep the pass independent of input order.
  let frontier = storyIds.filter((id) => remaining.get(id) === 0).sort();
  for (const id of frontier) depth.set(id, 0);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const dependent of [...(dependents.get(id) ?? [])].sort()) {
        depth.set(dependent, Math.max(depth.get(dependent) ?? 0, (depth.get(id) ?? 0) + 1));
        const left = (remaining.get(dependent) ?? 0) - 1;
        remaining.set(dependent, left);
        if (left === 0) next.push(dependent);
      }
    }
    frontier = next.sort();
  }

  const cyclic = storyIds.filter((id) => !depth.has(id)).sort();
  if (cyclic.length > 0) {
    const last = Math.max(-1, ...[...depth.values()]) + 1;
    for (const id of cyclic) depth.set(id, last);
  }
  return { depth, cyclic };
}

/**
 * One deterministic regrow plan for a real story graph.
 *
 * `stories` supplies the ORDER (the authored `depends_on` DAG, ADR-0282 D3). `edges` supplies
 * only the trail geometry — which segments join which islands — because the routed network is
 * allowed to drop an edge it could not route, and a dropped ROAD must not silently reorder the
 * FOREST.
 */
export function deriveForestRegrowPlan(
  stories: readonly ForestRegrowStory[],
  edges: readonly ForestRegrowTrailEdge[] = [],
  tuning: ForestRegrowTuning = FOREST_REGROW_TUNING,
): ForestRegrowPlan {
  assertTuning(tuning);
  const storyIds = [...new Set(stories.map((story) => story.id))].sort();
  if (storyIds.length === 0) {
    throw new Error('Forest regrow needs at least one story to grow.');
  }
  const dependsOn = new Map(stories.map((story) => [story.id, story.dependsOn]));
  const { depth, cyclic } = waveDepths(storyIds, dependsOn);

  const waveCount = Math.max(...storyIds.map((id) => depth.get(id) ?? 0)) + 1;
  const byWave: string[][] = Array.from({ length: waveCount }, () => []);
  for (const id of storyIds) byWave[depth.get(id) ?? 0]!.push(id);

  // A wave STARTS only once the previous wave has fully settled, so the invariant
  // "no island accretes before everything it stands on has landed" holds by construction
  // rather than by visual luck.
  const wavePitch = tuning.waveSpreadMs + tuning.islandGrowthMs + tuning.waveGapMs;
  const steps: ForestRegrowStep[] = [];
  let order = 0;
  for (let wave = 0; wave < waveCount; wave += 1) {
    const ids = byWave[wave]!;
    const spread = ids.length > 1 ? tuning.waveSpreadMs / (ids.length - 1) : 0;
    ids.forEach((storyId, index) => {
      const startMs = wave * wavePitch + index * spread;
      steps.push({
        storyId,
        wave,
        order: order++,
        startMs,
        endMs: startMs + tuning.islandGrowthMs,
        start: 0,
        end: 0,
      });
    });
  }

  // The plan must outlast BOTH the last island's accretion and the last island's trail draw-on
  // — the arrival window is rooted at `startMs`, not `endMs`, so on a long trail chain it is the
  // ROADS that finish last. Sizing the duration off `endMs` alone left the final island still
  // masked at progress 1, i.e. the "fully grown forest" reduced motion settles on would have had
  // a half-drawn road in it.
  const lastEventMs = Math.max(
    ...steps.map((step) => Math.max(step.endMs, step.startMs + tuning.trailDrawMs)),
  );
  const durationMs = lastEventMs + tuning.settleHoldMs;
  const normalized = steps.map((step) => ({
    ...step,
    start: step.startMs / durationMs,
    end: step.endMs / durationMs,
  }));
  const stepByStory = new Map(normalized.map((step) => [step.storyId, step]));

  // A segment may be drawn once BOTH its endpoints are present. A segment carrying several
  // edges takes the EARLIEST such moment — the road exists as soon as any one of the
  // connections it serves does.
  const segmentRevealAt = new Map<string, number>();
  for (const edge of edges) {
    const from = stepByStory.get(edge.from);
    const to = stepByStory.get(edge.to);
    // An edge naming a story this plan does not hold is not drawable at all — leaving it out
    // of the map means the selector keeps it hidden for the whole regrow.
    if (!from || !to) continue;
    const at = Math.max(from.start, to.start);
    for (const segment of edge.segments) {
      const previous = segmentRevealAt.get(segment.id);
      if (previous === undefined || at < previous) segmentRevealAt.set(segment.id, at);
    }
  }

  return {
    steps: normalized,
    stepByStory,
    baseStoryIds: storyIds.filter((id) => depth.get(id) === 0 && !cyclic.includes(id)),
    cyclicStoryIds: cyclic,
    waveCount,
    durationMs,
    segmentRevealAt,
    tuning,
  };
}

/**
 * Select one immutable regrow state at a normalized cursor. Pure: the same plan and the same
 * progress always yield the same sets, which is what makes the regrow testable as a whole
 * rather than only watchable.
 *
 * Progress 1 explicitly means the FULLY GROWN forest with nothing hidden, nothing masked and no
 * clipping — the state reduced motion settles on directly (ADR-0282 D6).
 */
export function forestRegrowAtProgress(
  plan: ForestRegrowPlan,
  inputProgress: number,
): ForestRegrowState {
  const progress = clamp01(inputProgress);
  const trailDraw = plan.tuning.trailDrawMs / plan.durationMs;
  const landed = new Set<string>();
  const present = new Set<string>();
  const absent = new Set<string>();
  const growing: ForestRegrowIslandGrowth[] = [];
  const arrivals: string[] = [];

  for (const step of plan.steps) {
    if (progress >= step.end) {
      landed.add(step.storyId);
      present.add(step.storyId);
    } else if (progress > step.start) {
      present.add(step.storyId);
      growing.push({
        storyId: step.storyId,
        progress: clamp01((progress - step.start) / (step.end - step.start)),
      });
    } else {
      absent.add(step.storyId);
      continue;
    }
    // The trail beat is rooted at the island's own ARRIVAL — the instant it first appears, which
    // is also the instant any road to an already-present neighbour stops being a road to nowhere.
    // Masking it from that moment is what makes the draw-on and the reveal coincide.
    if (progress < step.start + trailDraw) arrivals.push(step.storyId);
  }

  const hiddenSegmentIds = new Set<string>();
  for (const [segmentId, at] of plan.segmentRevealAt) {
    if (progress <= at) hiddenSegmentIds.add(segmentId);
  }

  return {
    progress,
    settled: progress >= 1,
    landedStoryIds: landed,
    growing,
    presentStoryIds: present,
    absentStoryIds: absent,
    hiddenSegmentIds,
    arrivalStoryIds: arrivals,
  };
}
