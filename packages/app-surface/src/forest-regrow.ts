// forest-regrow — the Act 2 intro's ORDER and CLOCK, derived from the real story graph.
//
// ADR-0283 D1 (amends ADR-0282 D3 in MECHANISM, not in order): growth follows the EDGE.
//
//   1. The BASE NODES — the stories with no `depends_on` — form from nothing, at the start.
//      They are the only islands that ever do.
//   2. When an island has SETTLED, each of its outgoing pathways grows outward from it along
//      the real routed trail geometry, in the direction of the dependent.
//   3. A downstream island forms the MOMENT a pathway arrives at it — the first incoming edge to
//      finish drawing, with nothing else gating it (ADR-0285).
//
// This REPLACES increment 1's wave barrier, where a whole rank of islands began accreting the
// moment the previous rank settled and each island's roads caught up afterwards. That honoured
// dependency order but made the causality invisible: the owner's words were "it looks like lots
// of things are growing out of nothing". Under edge scheduling a node's start time is a pure
// function of its incoming edges' arrivals, so there is no global rank barrier at all — WAVE
// survives only as a derived READOUT (longest-path depth in the DAG) for the control's text.
//
// ADR-0285 removed the LAST piece of rank in that schedule. ADR-0283 D1.3 had kept ADR-0282's
// ordering invariant — "not before EVERY island it stands on has settled" — as a clamp on top of
// the arrival. Measured on the real corpus, that clamp, not the arrival, set the start time for
// 26 of the 36 reached islands, and islands sat with a road already touching them for up to 6.3 s
// of a 9.3 s run: because a node's dependencies span DAG depths, waiting for the LAST of them
// re-imposes depth as the schedule. The invariant that remains is the causal one — a pathway
// leaves only a SETTLED island, so an island never appears before the island that reached it has
// settled, and never appears unreached.
//
// This module is PURE: no React, no clock, no DOM. It answers two questions and nothing else.
//
//   1. `deriveForestRegrowPlan` — when does each island form, when does each pathway leave its
//      island, and when does each of that pathway's segments draw?
//   2. `forestRegrowAtProgress` — at cursor p, which islands are absent / accreting / landed,
//      which trail segments are undrawn / mid-draw (and how far) / drawn.
//
// Timing lives here in MILLISECONDS and is normalized once, so the caller only ever drives a
// single 0→1 cursor (ADR-0282 D6: the app owns the clock, ordering, progress and easing).
//
// The honesty invariant mirrors trailReveal's §5: every id this module names came from the
// supplied graph. It invents no story and no segment, and a story absent from `stories` never
// appears in a plan even if an edge mentions it.

/** The shape `TrailEdgeOut` already has — an ordered segment chain, `from` → `to`. */
export interface ForestRegrowTrailEdge {
  readonly from: string;
  readonly to: string;
  readonly segments: readonly { readonly id: string; readonly reversed?: boolean }[];
}

/** The shape `TreeStory` has, narrowed to what ordering needs. */
export interface ForestRegrowStory {
  readonly id: string;
  readonly dependsOn: readonly string[];
}

export interface ForestRegrowTuning {
  /** How long ONE island takes to accrete from nothing to settled. */
  readonly islandGrowthMs: number;
  /** The window the BASE nodes are spread across, regardless of how many there are — so a
   *  15-root corpus and a 3-root one both read as one scatter, not a queue. */
  readonly baseSpreadMs: number;
  /** The fixed cost of any pathway, so a one-segment stub still registers as travel. */
  readonly pathwayBaseMs: number;
  /** World units the growing pathway front covers per second — a long haul really does take
   *  longer than a short spur (the same rule `laneDrawSeconds` uses for selection lanes). */
  readonly pathwaySpeed: number;
  /** Clamps on a pathway's draw time: a stub still registers, the longest haul stays brisk. */
  readonly pathwayMinMs: number;
  readonly pathwayMaxMs: number;
  /** The length assumed for a segment whose real geometry was not supplied, so a plan derived
   *  without the segment table still paces sensibly instead of collapsing to the floor. */
  readonly pathwayFallbackSegmentLength: number;
  /** The beat before an island NO pathway can reach forms anyway — see `unreachedStoryIds`. */
  readonly unreachedGapMs: number;
  /** How long an island wears the arrival staging classes. Under the regrow those are re-timed
   *  to land inside the island's own accretion window (index.css `.act2-regrowing`), so this is
   *  the class-hold, not a second clock. */
  readonly arrivalHoldMs: number;
  /** The tail the fully grown forest is held on before `settled` reads true. */
  readonly settleHoldMs: number;
}

export const FOREST_REGROW_TUNING: ForestRegrowTuning = {
  islandGrowthMs: 760,
  baseSpreadMs: 1200,
  pathwayBaseMs: 220,
  pathwaySpeed: 3400,
  pathwayMinMs: 340,
  pathwayMaxMs: 1400,
  pathwayFallbackSegmentLength: 900,
  unreachedGapMs: 260,
  arrivalHoldMs: 900,
  settleHoldMs: 900,
};

/** How an island came to exist — the plan's own account of its start time. */
export type ForestRegrowReach =
  /** No `depends_on`: a DAG root, formed from nothing at the start. */
  | 'base'
  /** Reached by an incoming pathway that finished drawing — the ordinary case, and the island's
   *  start time IS that arrival (ADR-0285: nothing else gates it). */
  | 'pathway'
  /** It has dependencies, but the router could route NO edge into it (`network.dropped`), so
   *  no pathway can arrive. It forms a beat after its dependencies settle rather than being
   *  stranded off the map — the ADR-0282 precedent for cyclic stories. */
  | 'unreached'
  /** It sits on a dependency CYCLE, which has no honest "after all its dependencies" position. */
  | 'cycle';

export interface ForestRegrowStep {
  readonly storyId: string;
  /** Longest-path depth from the base nodes. 0 ⇒ a base node (no `depends_on`).
   *  A derived READOUT only (ADR-0283 D1) — nothing here schedules on it. */
  readonly wave: number;
  /** Global landing index — deterministic, by (startMs, id). */
  readonly order: number;
  readonly reach: ForestRegrowReach;
  readonly startMs: number;
  readonly endMs: number;
  /** `startMs` / `endMs` as a fraction of the plan's total duration. */
  readonly start: number;
  readonly end: number;
}

/** One pathway growing outward from a settled island toward its dependent. */
export interface ForestRegrowPathway {
  readonly from: string;
  readonly to: string;
  /** When the pathway leaves `from` — that island's settle. */
  readonly startMs: number;
  /** When its front reaches `to`. */
  readonly endMs: number;
}

/** One trail segment's draw window, and which end it grows from. */
export interface ForestRegrowSegmentDraw {
  readonly id: string;
  /** True ⇒ the mask grows from the segment path's geometric END, because the chain walks it
   *  against its drawn direction. Mirrors `arrivalGrowPlan`'s `fromEnd` exactly. */
  readonly fromEnd: boolean;
  readonly startMs: number;
  readonly endMs: number;
  readonly start: number;
  readonly end: number;
}

export interface ForestRegrowPlan {
  readonly steps: readonly ForestRegrowStep[];
  readonly stepByStory: ReadonlyMap<string, ForestRegrowStep>;
  /** The DAG roots this regrow grows outward from — stories with no resolvable `depends_on`. */
  readonly baseStoryIds: readonly string[];
  /** Stories the topological pass could not place because they sit on a dependency CYCLE.
   *  They land together at the tail rather than being dropped — a cycle has no honest
   *  "after all its dependencies" position, and silently omitting an island would make the
   *  regrow claim a forest smaller than the real one. */
  readonly cyclicStoryIds: readonly string[];
  /** Stories with real dependencies but no ROUTED incoming edge, so no pathway can ever arrive
   *  at them. Surfaced rather than swallowed, so "why did that island appear with no road?"
   *  has an answer that is not a guess. */
  readonly unreachedStoryIds: readonly string[];
  readonly waveCount: number;
  readonly durationMs: number;
  /** Every drawable pathway, sorted by (from, to). */
  readonly pathways: readonly ForestRegrowPathway[];
  /** Segment id → its draw window. A segment carried by several pathways takes the EARLIEST
   *  one: the road exists as soon as the first connection it serves has grown through it. */
  readonly segmentDraws: ReadonlyMap<string, ForestRegrowSegmentDraw>;
  readonly tuning: ForestRegrowTuning;
}

export interface ForestRegrowIslandGrowth {
  readonly storyId: string;
  /** Local 0→1 across this island's own accretion window, for `svgIslandAccretionAtProgress`. */
  readonly progress: number;
}

/** A segment part-way through its draw-on, at this cursor. */
export interface ForestRegrowSegmentGrowth {
  readonly id: string;
  readonly fromEnd: boolean;
  /** Local 0→1 across this segment's own draw window. */
  readonly drawn: number;
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
  /** Segments whose pathway has not started growing through them — not drawn at all. */
  readonly hiddenSegmentIds: ReadonlySet<string>;
  /** Segments mid-draw, with how far the front has travelled. The app writes these straight
   *  onto the per-segment reveal masks, so the draw-on rides the SAME cursor as everything
   *  else and the moment a pathway arrives is a number the schedule knows. */
  readonly drawingSegments: readonly ForestRegrowSegmentGrowth[];
  /** Islands wearing the arrival staging classes right now. */
  readonly arrivalStoryIds: readonly string[];
}

export interface ForestRegrowOptions {
  readonly tuning?: ForestRegrowTuning;
  /** Segment id → its drawn length in world units. Supplied by the caller from the routed
   *  network so a pathway's pace follows the real geometry; absent lengths fall back to
   *  `pathwayFallbackSegmentLength`, which keeps a graph-only plan (and every unit test)
   *  deterministic without a geometry table. */
  readonly segmentLengths?: ReadonlyMap<string, number>;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertTuning(tuning: ForestRegrowTuning): void {
  const spans: readonly (readonly [string, number])[] = [
    ['islandGrowthMs', tuning.islandGrowthMs],
    ['baseSpreadMs', tuning.baseSpreadMs],
    ['pathwayBaseMs', tuning.pathwayBaseMs],
    ['pathwaySpeed', tuning.pathwaySpeed],
    ['pathwayMinMs', tuning.pathwayMinMs],
    ['pathwayMaxMs', tuning.pathwayMaxMs],
    ['pathwayFallbackSegmentLength', tuning.pathwayFallbackSegmentLength],
    ['unreachedGapMs', tuning.unreachedGapMs],
    ['arrivalHoldMs', tuning.arrivalHoldMs],
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
  if (tuning.pathwaySpeed <= 0) {
    throw new Error('Forest regrow tuning "pathwaySpeed" must be positive.');
  }
  if (tuning.pathwayMinMs > tuning.pathwayMaxMs) {
    throw new Error('Forest regrow tuning "pathwayMinMs" must not exceed "pathwayMaxMs".');
  }
}

/**
 * Longest-path depth from the base nodes, by Kahn's algorithm.
 *
 * Longest path, NOT breadth-first distance: with shortest-path depth a story could be reported
 * at the same depth as a transitive dependency. Nothing SCHEDULES on this any more (ADR-0283 D1
 * retired the wave barrier) — it is the control's readout and the Back transport's step size —
 * but a readout that mis-states the graph is still a lie, so the longest path is what it reports.
 */
function waveDepths(
  storyIds: readonly string[],
  dependsOn: ReadonlyMap<string, readonly string[]>,
) {
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

/** Deterministic key for one edge — a graph may hold several edges between the same pair. */
function edgeKey(edge: ForestRegrowTrailEdge): string {
  return `${edge.from}\u0000${edge.to}`;
}

/**
 * One deterministic regrow plan for a real story graph.
 *
 * `stories` supplies the DEPENDENCY structure (the authored `depends_on` DAG, ADR-0282 D3).
 * `edges` supplies the PATHWAYS — which segments join which islands — because the routed
 * network is allowed to drop an edge it could not route, and a dropped ROAD must not silently
 * reorder the FOREST. An island whose every incoming edge was dropped still lands: it just
 * lands as `unreached` rather than being reached by a road that does not exist.
 */
export function deriveForestRegrowPlan(
  stories: readonly ForestRegrowStory[],
  edges: readonly ForestRegrowTrailEdge[] = [],
  options: ForestRegrowOptions = {},
): ForestRegrowPlan {
  const tuning = options.tuning ?? FOREST_REGROW_TUNING;
  assertTuning(tuning);
  const storyIds = [...new Set(stories.map((story) => story.id))].sort();
  if (storyIds.length === 0) {
    throw new Error('Forest regrow needs at least one story to grow.');
  }
  const dependsOn = new Map(stories.map((story) => [story.id, story.dependsOn]));
  const { depth, cyclic } = waveDepths(storyIds, dependsOn);
  const cyclicSet = new Set(cyclic);
  const known = new Set(storyIds);

  // ---- pathway geometry: how long each edge takes to grow, and how that splits per segment ----
  // Sorted so a shared segment's "earliest wins" fold — and therefore the whole plan — is
  // independent of the order the routed network happened to emit its edges in.
  const drawable = edges
    .filter((edge) => known.has(edge.from) && known.has(edge.to))
    .slice()
    .sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0));
  const lengthOf = (id: string): number => {
    const supplied = options.segmentLengths?.get(id);
    return supplied !== undefined && Number.isFinite(supplied) && supplied > 0
      ? supplied
      : tuning.pathwayFallbackSegmentLength;
  };
  const drawMsOf = (edge: ForestRegrowTrailEdge): number => {
    const total = edge.segments.reduce((sum, ref) => sum + lengthOf(ref.id), 0);
    return Math.max(
      tuning.pathwayMinMs,
      Math.min(tuning.pathwayMaxMs, tuning.pathwayBaseMs + (total / tuning.pathwaySpeed) * 1000),
    );
  };
  const drawMsByEdge = new Map<ForestRegrowTrailEdge, number>(
    drawable.map((edge) => [edge, drawMsOf(edge)]),
  );
  /** to → the routed edges arriving at it (the pathways that can announce its ground). */
  const incoming = new Map<string, ForestRegrowTrailEdge[]>();
  for (const edge of drawable) {
    if (edge.from === edge.to) continue; // a self-loop reaches nothing
    const list = incoming.get(edge.to);
    if (list) list.push(edge);
    else incoming.set(edge.to, [edge]);
  }

  // ---- the schedule: a start time is a function of incoming ARRIVALS, never of a rank ----
  const startMs = new Map<string, number>();
  const reachBy = new Map<string, ForestRegrowReach>();
  const settleMs = (id: string): number => (startMs.get(id) ?? 0) + tuning.islandGrowthMs;

  const acyclic = storyIds
    .filter((id) => !cyclicSet.has(id))
    .sort((a, b) => (depth.get(a) ?? 0) - (depth.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
  const baseIds = acyclic.filter((id) => (depth.get(id) ?? 0) === 0);
  const baseSpread = baseIds.length > 1 ? tuning.baseSpreadMs / (baseIds.length - 1) : 0;

  for (const id of acyclic) {
    const deps = [...new Set(dependsOn.get(id) ?? [])].filter(
      (dep) => known.has(dep) && dep !== id,
    );
    if (deps.length === 0) {
      // ADR-0283 D1.1 — the roots, and only the roots, form from nothing.
      startMs.set(id, baseIds.indexOf(id) * baseSpread);
      reachBy.set(id, 'base');
      continue;
    }
    // ADR-0285 (owner-directed 2026-08-02, amends ADR-0283 D1.3 and reverses ADR-0282 D3's
    // ordering invariant): the arrival IS the trigger, with NO second clamp on top of it. The
    // island forms the moment the first pathway completes into it.
    //
    // The clamp that stood here — `max(every dependency's settle, …)` — was the wave barrier in
    // disguise, and it dominated: measured on the real 40-island corpus, 26 of the 36 reached
    // islands took their start time from the CLAMP rather than from any arrival, and islands sat
    // with a road already touching them for up to 6.3 s of a 9.3 s run. Because a node's
    // dependency set spans DAG depths, waiting for the LAST of them re-imposes depth as the
    // schedule, which is exactly the row-by-row read this arc set out to remove.
    //
    // What is given up is the claim that ALL the ground beneath an island is complete before it
    // forms. What is kept is the causal claim, which is the one the intro makes: a pathway only
    // ever leaves a SETTLED island, so an island still never appears before the island that
    // reached it has settled, and still never appears unreached. The later dependencies' roads
    // draw into an island that already exists — the ordinary arrival beat.
    // Only a REAL dependency's pathway announces the island — and because every such `from` sits
    // at a strictly lower depth, it has already been scheduled, so `settleMs` is final here.
    const depSet = new Set(deps);
    const arrivals = (incoming.get(id) ?? [])
      .filter((edge) => depSet.has(edge.from))
      .map((edge) => settleMs(edge.from) + (drawMsByEdge.get(edge) ?? tuning.pathwayMinMs));
    if (arrivals.length === 0) {
      // No routed edge can ever arrive here (every incoming `depends_on` was dropped by the
      // router). Stranding the island off the map would make the regrow claim a smaller forest
      // than the real one, so it forms a beat after its ground settles instead — visibly late,
      // and named in `unreachedStoryIds` rather than passed off as a reached node. This is the
      // one case with no arrival to key on, so it still keys on the dependencies.
      startMs.set(id, Math.max(...deps.map(settleMs)) + tuning.unreachedGapMs);
      reachBy.set(id, 'unreached');
      continue;
    }
    startMs.set(id, Math.min(...arrivals));
    reachBy.set(id, 'pathway');
  }

  // A dependency CYCLE has no honest "after all its dependencies" position and therefore no
  // honest arrival either. Its members land together once everything placeable has settled.
  if (cyclic.length > 0) {
    const after =
      acyclic.length > 0 ? Math.max(...acyclic.map(settleMs)) + tuning.unreachedGapMs : 0;
    const spread = cyclic.length > 1 ? tuning.baseSpreadMs / (cyclic.length - 1) : 0;
    cyclic.forEach((id, index) => {
      startMs.set(id, after + index * spread);
      reachBy.set(id, 'cycle');
    });
  }

  // ---- pathways + their per-segment draw windows, from the settled schedule ----
  const pathways: ForestRegrowPathway[] = [];
  const rawDraws = new Map<string, { fromEnd: boolean; startMs: number; endMs: number }>();
  for (const edge of drawable) {
    const edgeStart = settleMs(edge.from);
    const edgeDraw = drawMsByEdge.get(edge) ?? tuning.pathwayMinMs;
    pathways.push({ from: edge.from, to: edge.to, startMs: edgeStart, endMs: edgeStart + edgeDraw });
    const lengths = edge.segments.map((ref) => lengthOf(ref.id));
    const total = lengths.reduce((sum, len) => sum + len, 0);
    let travelled = 0;
    edge.segments.forEach((ref, index) => {
      const len = lengths[index] ?? 0;
      const from = total > 0 ? travelled / total : 0;
      travelled += len;
      const to = total > 0 ? travelled / total : 1;
      const draw = {
        // The chain is stored `from` → `to` and growth runs the same way (outward from the
        // settled island), so a segment stored against that direction grows from its far end —
        // the same rule `arrivalGrowPlan` applies when it roots at an edge's `from`.
        fromEnd: ref.reversed === true,
        startMs: edgeStart + from * edgeDraw,
        endMs: edgeStart + to * edgeDraw,
      };
      const previous = rawDraws.get(ref.id);
      if (previous === undefined || draw.startMs < previous.startMs) rawDraws.set(ref.id, draw);
    });
  }

  // ---- normalize once, so the caller drives a single 0→1 cursor ----
  // The plan must outlast the last island's accretion, the last pathway's draw AND the last
  // island's arrival staging: whichever finishes last is what "the fully grown forest" means,
  // and reduced motion settles directly on it.
  const lastEventMs = Math.max(
    ...storyIds.map((id) =>
      Math.max(settleMs(id), (startMs.get(id) ?? 0) + tuning.arrivalHoldMs),
    ),
    ...[...rawDraws.values()].map((draw) => draw.endMs),
  );
  const durationMs = lastEventMs + tuning.settleHoldMs;

  const steps: ForestRegrowStep[] = storyIds
    .map((storyId) => {
      const start = startMs.get(storyId) ?? 0;
      return {
        storyId,
        wave: depth.get(storyId) ?? 0,
        order: 0,
        reach: reachBy.get(storyId) ?? 'base',
        startMs: start,
        endMs: start + tuning.islandGrowthMs,
        start: start / durationMs,
        end: (start + tuning.islandGrowthMs) / durationMs,
      };
    })
    .sort((a, b) => a.startMs - b.startMs || (a.storyId < b.storyId ? -1 : 1))
    .map((step, index) => ({ ...step, order: index }));

  const segmentDraws = new Map<string, ForestRegrowSegmentDraw>(
    [...rawDraws.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, draw]) => [
        id,
        {
          id,
          fromEnd: draw.fromEnd,
          startMs: draw.startMs,
          endMs: draw.endMs,
          start: draw.startMs / durationMs,
          end: draw.endMs / durationMs,
        },
      ]),
  );

  return {
    steps,
    stepByStory: new Map(steps.map((step) => [step.storyId, step])),
    baseStoryIds: baseIds,
    cyclicStoryIds: cyclic,
    unreachedStoryIds: storyIds.filter((id) => reachBy.get(id) === 'unreached'),
    waveCount: Math.max(...storyIds.map((id) => depth.get(id) ?? 0)) + 1,
    durationMs,
    pathways,
    segmentDraws,
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
  const arrivalHold = plan.tuning.arrivalHoldMs / plan.durationMs;
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
    // The arrival staging is rooted at the island's own appearance and re-timed under the
    // regrow to land INSIDE its accretion window, so a settled island really is settled when
    // its outgoing pathways leave it.
    if (progress < step.start + arrivalHold) arrivals.push(step.storyId);
  }

  const hiddenSegmentIds = new Set<string>();
  const drawingSegments: ForestRegrowSegmentGrowth[] = [];
  for (const draw of plan.segmentDraws.values()) {
    if (progress <= draw.start) {
      hiddenSegmentIds.add(draw.id);
    } else if (progress < draw.end) {
      drawingSegments.push({
        id: draw.id,
        fromEnd: draw.fromEnd,
        drawn: clamp01((progress - draw.start) / (draw.end - draw.start)),
      });
    }
    // else: fully drawn — no mask, no hide, the road simply paints.
  }

  return {
    progress,
    settled: progress >= 1,
    landedStoryIds: landed,
    growing,
    presentStoryIds: present,
    absentStoryIds: absent,
    hiddenSegmentIds,
    drawingSegments,
    arrivalStoryIds: arrivals,
  };
}
