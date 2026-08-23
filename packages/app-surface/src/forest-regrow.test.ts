// forest-regrow — Stage-1 red-green (ADR-0070) of the Act 2 intro's ORDER and CLOCK: the pure
// (story graph, trail edges) → growth schedule, and the pure (plan, progress) → what-exists
// selection the scene walk consumes. The LOOK of the regrow is owner-attested and never asserted
// here.
//
// What is pinned: the order comes from the real DAG (ADR-0282 D3), no island appears before the
// ground it stands on (ADR-0282's invariant, unchanged by ADR-0283), the same graph regrows
// identically every time — and, new in ADR-0283 D1, that growth follows the EDGE: only the roots
// form from nothing, a pathway leaves an island only once that island has settled, and a
// downstream island forms only after a pathway has ARRIVED at it.

import { describe, it, expect } from 'vitest';
import {
  deriveForestRegrowPlan,
  forestRegrowAtProgress,
  FOREST_REGROW_TUNING,
  type ForestRegrowPlan,
  type ForestRegrowStory,
  type ForestRegrowTrailEdge,
} from './forest-regrow.js';

/** A miniature of the real corpus shape: several base nodes, a diamond, and a deep chain. */
const GRAPH: readonly ForestRegrowStory[] = [
  { id: 'proof-protocol', dependsOn: [] },
  { id: 'forest-world', dependsOn: [] },
  { id: 'cli', dependsOn: [] },
  { id: 'storage-protocol', dependsOn: ['proof-protocol'] },
  { id: 'app-surface', dependsOn: ['forest-world'] },
  { id: 'library', dependsOn: ['proof-protocol', 'storage-protocol'] },
  { id: 'notice-board', dependsOn: ['library'] },
  { id: 'studio', dependsOn: ['library', 'forest-world', 'app-surface', 'notice-board'] },
];

/** One routed pathway per `depends_on` above — the network the router managed to draw. */
const EDGES: readonly ForestRegrowTrailEdge[] = [
  { from: 'proof-protocol', to: 'storage-protocol', segments: [{ id: 's1' }, { id: 's2' }] },
  { from: 'forest-world', to: 'app-surface', segments: [{ id: 's3' }] },
  { from: 'proof-protocol', to: 'library', segments: [{ id: 's1' }, { id: 's5' }] },
  { from: 'storage-protocol', to: 'library', segments: [{ id: 's6' }] },
  { from: 'library', to: 'notice-board', segments: [{ id: 's7' }] },
  { from: 'library', to: 'studio', segments: [{ id: 's2' }, { id: 's4' }] },
  { from: 'forest-world', to: 'studio', segments: [{ id: 's8' }] },
  { from: 'app-surface', to: 'studio', segments: [{ id: 's9' }] },
  { from: 'notice-board', to: 'studio', segments: [{ id: 's10' }] },
];

const plan = (): ForestRegrowPlan => deriveForestRegrowPlan(GRAPH, EDGES);

const settleOf = (p: ForestRegrowPlan, id: string): number => p.stepByStory.get(id)!.endMs;
const startOf = (p: ForestRegrowPlan, id: string): number => p.stepByStory.get(id)!.startMs;

describe('deriveForestRegrowPlan', () => {
  it('starts the regrow at the BASE NODES — the stories with no depends_on', () => {
    const p = plan();
    expect([...p.baseStoryIds]).toEqual(['cli', 'forest-world', 'proof-protocol']);
    for (const id of p.baseStoryIds) expect(p.stepByStory.get(id)?.wave).toBe(0);
    // and wave 0 holds nothing else
    for (const step of p.steps) {
      if (step.wave === 0) expect(p.baseStoryIds).toContain(step.storyId);
    }
  });

  it('lets ONLY the base nodes form from nothing (ADR-0283 D1.1)', () => {
    const p = plan();
    for (const step of p.steps) {
      if (p.baseStoryIds.includes(step.storyId)) {
        expect(step.reach, `${step.storyId} is a root`).toBe('base');
      } else {
        expect(step.reach, `${step.storyId} must be REACHED, not spontaneous`).not.toBe('base');
      }
    }
    // every base node is inside the opening scatter; nothing else is
    for (const id of p.baseStoryIds) {
      expect(startOf(p, id)).toBeLessThanOrEqual(p.tuning.baseSpreadMs);
    }
  });

  it('reports wave as LONGEST-path depth — a derived readout, not the schedule', () => {
    const p = plan();
    expect(p.stepByStory.get('proof-protocol')?.wave).toBe(0);
    expect(p.stepByStory.get('storage-protocol')?.wave).toBe(1);
    expect(p.stepByStory.get('library')?.wave).toBe(2);
    expect(p.stepByStory.get('notice-board')?.wave).toBe(3);
    expect(p.stepByStory.get('studio')?.wave).toBe(4);
  });

  // ADR-0285 REVERSES ADR-0282 D3's ordering invariant, which ADR-0283 D1.3 had kept as a clamp:
  // an island no longer waits for EVERY island it stands on. Measured on the real 40-island
  // corpus, that clamp — not the arrival — set the start time for 26 of the 36 reached islands,
  // with islands sitting beside a finished road for up to 6.3 s of a 9.3 s run, because a node's
  // dependencies span DAG depths and waiting for the last of them re-imposes depth as the
  // schedule. What is pinned instead is the CAUSAL invariant, which is the claim the intro
  // actually makes and which is strictly stronger than "in dependency order":
  it('never shows an island before the island that REACHED it has settled', () => {
    const p = plan();
    for (const step of p.steps) {
      if (step.reach !== 'pathway') continue;
      // Some incoming pathway both (a) left an island that had settled, and (b) finished, at or
      // before this island began to form.
      const reaching = p.pathways.filter(
        (w) => w.to === step.storyId && w.endMs <= step.startMs + 1e-9,
      );
      expect(reaching.length, `${step.storyId} formed with no pathway having reached it`).toBeGreaterThan(0);
      for (const w of reaching) {
        expect(
          p.stepByStory.get(w.from)!.endMs,
          `the ${w.from}→${w.to} pathway left before ${w.from} had settled`,
        ).toBeLessThanOrEqual(w.startMs + 1e-9);
      }
    }
  });

  it('forms an island AT the first arrival — no second gate on top of it (ADR-0285)', () => {
    const p = plan();
    for (const step of p.steps) {
      if (step.reach !== 'pathway') continue;
      const arrivals = p.pathways.filter((w) => w.to === step.storyId).map((w) => w.endMs);
      expect(
        step.startMs,
        `${step.storyId} waited past its first arrival — a rank barrier has crept back in`,
      ).toBeCloseTo(Math.min(...arrivals), 9);
    }
    // studio stands on library, forest-world, app-surface and notice-board. Under the old clamp it
    // waited for notice-board, the last of them; now the forest-world road — which left a ROOT —
    // is what puts it on the map, well before its deepest dependency has settled.
    const studio = p.stepByStory.get('studio')!;
    expect(studio.startMs).toBeLessThan(p.stepByStory.get('notice-board')!.endMs);
    expect(studio.startMs).toBeGreaterThan(p.stepByStory.get('forest-world')!.endMs);
  });

  it('grows every pathway OUTWARD from a SETTLED island (ADR-0283 D1.2)', () => {
    const p = plan();
    expect(p.pathways.length).toBe(EDGES.length);
    for (const pathway of p.pathways) {
      expect(
        pathway.startMs,
        `the ${pathway.from}→${pathway.to} pathway leaves before ${pathway.from} has settled`,
      ).toBe(settleOf(p, pathway.from));
      expect(pathway.endMs).toBeGreaterThan(pathway.startMs);
    }
  });

  it('forms a downstream island only after a pathway has ARRIVED at it (ADR-0283 D1.3)', () => {
    const p = plan();
    for (const step of p.steps) {
      if (step.reach !== 'pathway') continue;
      const arrivals = p.pathways
        .filter((pathway) => pathway.to === step.storyId)
        .map((pathway) => pathway.endMs);
      expect(arrivals.length, `${step.storyId} is marked reached but has no pathway`).toBeGreaterThan(0);
      expect(
        Math.min(...arrivals),
        `${step.storyId} starts at ${step.startMs}ms, before any road reached it`,
      ).toBeLessThanOrEqual(step.startMs);
    }
  });

  it('takes the EARLIEST arrival, so the front moves as fast as the graph allows', () => {
    const p = plan();
    // library stands on proof-protocol (a root) and storage-protocol (one hop later). The
    // proof-protocol road arrives first, and under ADR-0285 that is what puts library on the
    // map — it does NOT wait for storage-protocol, which is the whole point: waiting for the
    // deepest dependency is what made the growth read rank by rank.
    const viaRoot = p.pathways.find((w) => w.from === 'proof-protocol' && w.to === 'library')!;
    const viaStorage = p.pathways.find((w) => w.from === 'storage-protocol' && w.to === 'library')!;
    expect(viaRoot.endMs).toBeLessThan(viaStorage.endMs);
    expect(startOf(p, 'library')).toBeCloseTo(viaRoot.endMs, 9);
    expect(startOf(p, 'library')).toBeLessThan(settleOf(p, 'storage-protocol'));
    // …and the storage-protocol road then draws INTO an island that already exists — the
    // ordinary arrival beat, not a road to nowhere.
    expect(viaStorage.startMs).toBeGreaterThan(startOf(p, 'library'));
    // notice-board has exactly one incoming pathway, so its start IS that arrival.
    const arrival = p.pathways.find((w) => w.from === 'library' && w.to === 'notice-board')!;
    expect(startOf(p, 'notice-board')).toBeCloseTo(arrival.endMs, 9);
  });

  it('paces a pathway by the REAL routed length — a long haul takes longer than a spur', () => {
    const short = deriveForestRegrowPlan(
      [
        { id: 'root', dependsOn: [] },
        { id: 'near', dependsOn: ['root'] },
      ],
      [{ from: 'root', to: 'near', segments: [{ id: 'seg' }] }],
      { segmentLengths: new Map([['seg', 200]]) },
    );
    const long = deriveForestRegrowPlan(
      [
        { id: 'root', dependsOn: [] },
        { id: 'near', dependsOn: ['root'] },
      ],
      [{ from: 'root', to: 'near', segments: [{ id: 'seg' }] }],
      { segmentLengths: new Map([['seg', 3200]]) },
    );
    const span = (p: ForestRegrowPlan): number => p.pathways[0]!.endMs - p.pathways[0]!.startMs;
    expect(span(long)).toBeGreaterThan(span(short));
    // …and both stay inside the clamps, so a stub still registers and a haul stays brisk
    for (const p of [short, long]) {
      expect(span(p)).toBeGreaterThanOrEqual(p.tuning.pathwayMinMs);
      expect(span(p)).toBeLessThanOrEqual(p.tuning.pathwayMaxMs);
    }
  });

  it('splits a pathway across its chain in order, so the front sweeps once end to end', () => {
    const p = deriveForestRegrowPlan(
      [
        { id: 'root', dependsOn: [] },
        { id: 'far', dependsOn: ['root'] },
      ],
      [{ from: 'root', to: 'far', segments: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }],
    );
    const a = p.segmentDraws.get('a')!;
    const b = p.segmentDraws.get('b')!;
    const c = p.segmentDraws.get('c')!;
    // contiguous, in chain order, and covering exactly the pathway's window
    expect(a.startMs).toBeCloseTo(p.pathways[0]!.startMs, 9);
    expect(a.endMs).toBeCloseTo(b.startMs, 9);
    expect(b.endMs).toBeCloseTo(c.startMs, 9);
    expect(c.endMs).toBeCloseTo(p.pathways[0]!.endMs, 9);
    // and the island forms when the LAST segment has finished drawing, not before
    expect(startOf(p, 'far')).toBeCloseTo(c.endMs, 9);
  });

  it('grows a segment from its FAR end when the chain walks it against its drawn direction', () => {
    const p = deriveForestRegrowPlan(
      [
        { id: 'root', dependsOn: [] },
        { id: 'far', dependsOn: ['root'] },
      ],
      [{ from: 'root', to: 'far', segments: [{ id: 'fwd' }, { id: 'rev', reversed: true }] }],
    );
    expect(p.segmentDraws.get('fwd')!.fromEnd).toBe(false);
    expect(p.segmentDraws.get('rev')!.fromEnd).toBe(true);
  });

  it('regrows the same graph identically, whatever order the stories arrive in', () => {
    const forward = deriveForestRegrowPlan(GRAPH, EDGES);
    const shuffled = deriveForestRegrowPlan([...GRAPH].reverse(), [...EDGES].reverse());
    const shape = (p: ForestRegrowPlan) => ({
      steps: p.steps,
      base: p.baseStoryIds,
      waves: p.waveCount,
      duration: p.durationMs,
      pathways: [...p.pathways].sort((a, b) => (`${a.from} ${a.to}` < `${b.from} ${b.to}` ? -1 : 1)),
      segments: [...p.segmentDraws].sort(),
    });
    expect(shape(shuffled)).toEqual(shape(forward));
    // and the per-frame selection is a pure function of (plan, progress)
    for (const at of [0, 0.13, 0.5, 0.87, 1]) {
      expect(forestRegrowAtProgress(shuffled, at)).toEqual(forestRegrowAtProgress(forward, at));
    }
  });

  it('lands every island exactly once, in one strictly ordered sequence', () => {
    const p = plan();
    expect(p.steps).toHaveLength(GRAPH.length);
    expect(new Set(p.steps.map((s) => s.storyId)).size).toBe(GRAPH.length);
    p.steps.forEach((step, index) => {
      expect(step.order).toBe(index);
      if (index > 0) expect(p.steps[index - 1]!.startMs).toBeLessThanOrEqual(step.startMs);
    });
  });

  it('outlasts the last island, the last pathway AND the last arrival stage', () => {
    const p = plan();
    const lastIsland = Math.max(...p.steps.map((s) => s.endMs));
    const lastStage = Math.max(...p.steps.map((s) => s.startMs + p.tuning.arrivalHoldMs));
    const lastRoad = Math.max(...[...p.segmentDraws.values()].map((d) => d.endMs));
    expect(p.durationMs).toBe(
      Math.max(lastIsland, lastStage, lastRoad) + p.tuning.settleHoldMs,
    );
  });

  it('reveals a shared segment with the EARLIEST pathway it carries, not the latest', () => {
    const p = plan();
    // s1 sits on proof-protocol→storage-protocol AND proof-protocol→library; s2 on
    // proof-protocol→storage-protocol AND library→studio, which leaves much later.
    const early = p.pathways.find((w) => w.to === 'storage-protocol')!;
    expect(p.segmentDraws.get('s1')!.startMs).toBeCloseTo(early.startMs, 9);
    expect(p.segmentDraws.get('s2')!.endMs).toBeCloseTo(early.endMs, 9);
    expect(p.segmentDraws.get('s2')!.startMs).toBeLessThan(
      p.pathways.find((w) => w.from === 'library' && w.to === 'studio')!.startMs,
    );
  });

  it('gives an island NO pathway can reach an honest late landing, not a stranding', () => {
    // `network.dropped`: the router could not route root→orphan, so nothing ever arrives there.
    const p = deriveForestRegrowPlan(
      [
        { id: 'root', dependsOn: [] },
        { id: 'orphan', dependsOn: ['root'] },
      ],
      [],
    );
    expect([...p.unreachedStoryIds]).toEqual(['orphan']);
    expect(p.stepByStory.get('orphan')!.reach).toBe('unreached');
    // it still lands, still after its ground, and still on the map at the end
    expect(startOf(p, 'orphan')).toBe(settleOf(p, 'root') + p.tuning.unreachedGapMs);
    expect(forestRegrowAtProgress(p, 1).landedStoryIds.size).toBe(2);
  });

  it('lands a dependency CYCLE at the tail rather than losing islands off the map', () => {
    const cyclic = deriveForestRegrowPlan([
      { id: 'root', dependsOn: [] },
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect([...cyclic.cyclicStoryIds]).toEqual(['a', 'b']);
    expect([...cyclic.baseStoryIds]).toEqual(['root']);
    expect(cyclic.steps).toHaveLength(3);
    for (const id of ['a', 'b']) {
      expect(cyclic.stepByStory.get(id)!.reach).toBe('cycle');
      expect(startOf(cyclic, id)).toBeGreaterThanOrEqual(settleOf(cyclic, 'root'));
    }
    expect(forestRegrowAtProgress(cyclic, 1).landedStoryIds.size).toBe(3);
  });

  it('does not strand an island whose depends_on names a story outside the graph', () => {
    const p = deriveForestRegrowPlan([{ id: 'solo', dependsOn: ['a-story-that-is-not-here'] }]);
    expect([...p.baseStoryIds]).toEqual(['solo']);
    expect(p.stepByStory.get('solo')!.reach).toBe('base');
    expect(forestRegrowAtProgress(p, 1).landedStoryIds.size).toBe(1);
  });

  it('does not treat a self-dependency as a cycle that hides an island', () => {
    const p = deriveForestRegrowPlan([{ id: 'loop', dependsOn: ['loop'] }]);
    expect([...p.cyclicStoryIds]).toEqual([]);
    expect([...p.baseStoryIds]).toEqual(['loop']);
  });

  it('invents no island: an edge naming an unknown story is never drawn', () => {
    const p = deriveForestRegrowPlan(GRAPH, [
      ...EDGES,
      { from: 'library', to: 'ghost-story', segments: [{ id: 'ghost-seg' }] },
    ]);
    expect(p.segmentDraws.has('ghost-seg')).toBe(false);
    expect(p.stepByStory.has('ghost-story')).toBe(false);
    expect(p.pathways.some((w) => w.to === 'ghost-story')).toBe(false);
  });

  it('refuses an empty graph rather than yielding an empty regrow', () => {
    expect(() => deriveForestRegrowPlan([])).toThrow(/at least one story/u);
  });

  it('refuses nonsense tuning rather than producing a plan with no duration', () => {
    const tuned = (patch: Partial<typeof FOREST_REGROW_TUNING>): (() => unknown) => () =>
      deriveForestRegrowPlan(GRAPH, EDGES, { tuning: { ...FOREST_REGROW_TUNING, ...patch } });
    expect(tuned({ islandGrowthMs: 0 })).toThrow(/islandGrowthMs/u);
    expect(tuned({ unreachedGapMs: -1 })).toThrow(/unreachedGapMs/u);
    expect(tuned({ pathwaySpeed: 0 })).toThrow(/pathwaySpeed/u);
    expect(tuned({ pathwayMinMs: 5000 })).toThrow(/pathwayMinMs/u);
  });
});

describe('forestRegrowAtProgress', () => {
  it('shows nothing at all at 0 and the whole forest, unhidden, at 1', () => {
    const p = plan();
    const empty = forestRegrowAtProgress(p, 0);
    expect(empty.presentStoryIds.size).toBe(0);
    expect(empty.absentStoryIds.size).toBe(GRAPH.length);
    expect(empty.growing).toHaveLength(0);
    expect(empty.drawingSegments).toHaveLength(0);
    expect(empty.hiddenSegmentIds.size).toBe(p.segmentDraws.size); // no road exists yet

    const grown = forestRegrowAtProgress(p, 1);
    expect(grown.landedStoryIds.size).toBe(GRAPH.length);
    expect(grown.absentStoryIds.size).toBe(0);
    expect(grown.growing, 'nothing is mid-accretion on the settled forest').toHaveLength(0);
    expect(grown.hiddenSegmentIds.size, 'every trail is drawn').toBe(0);
    expect(grown.drawingSegments, 'no road is still mid-draw').toEqual([]);
    expect(grown.arrivalStoryIds, 'nothing is still staging').toEqual([]);
    expect(grown.settled).toBe(true);
  });

  it('reports a local 0..1 progress for each island mid-accretion', () => {
    const p = plan();
    const step = p.stepByStory.get('proof-protocol')!;
    const mid = forestRegrowAtProgress(p, (step.start + step.end) / 2);
    const growth = mid.growing.find((g) => g.storyId === 'proof-protocol');
    expect(growth).toBeDefined();
    expect(growth!.progress).toBeCloseTo(0.5, 9);
    expect(mid.presentStoryIds.has('proof-protocol')).toBe(true);
    expect(mid.landedStoryIds.has('proof-protocol')).toBe(false);
  });

  it('reports a local 0..1 draw for each pathway front, and drops it once drawn', () => {
    const p = plan();
    const draw = p.segmentDraws.get('s3')!;
    const mid = forestRegrowAtProgress(p, (draw.start + draw.end) / 2);
    const front = mid.drawingSegments.find((s) => s.id === 's3');
    expect(front).toBeDefined();
    expect(front!.drawn).toBeCloseTo(0.5, 9);
    expect(front!.fromEnd).toBe(draw.fromEnd);
    expect(mid.hiddenSegmentIds.has('s3'), 'a drawing road is not hidden').toBe(false);

    const after = forestRegrowAtProgress(p, draw.end + 1e-9);
    expect(after.drawingSegments.some((s) => s.id === 's3')).toBe(false);
    expect(after.hiddenSegmentIds.has('s3')).toBe(false);
  });

  it('keeps a road hidden until its pathway starts growing, then never re-hides it', () => {
    const p = plan();
    const draw = p.segmentDraws.get('s3')!;
    // s3 carries forest-world → app-surface; it appears when forest-world SETTLES, which is
    // before app-surface exists at all. That is the point of ADR-0283: the road gets there first.
    expect(draw.startMs).toBeCloseTo(settleOf(p, 'forest-world'), 9);
    expect(draw.startMs).toBeLessThan(startOf(p, 'app-surface'));
    expect(forestRegrowAtProgress(p, draw.start - 1e-6).hiddenSegmentIds.has('s3')).toBe(true);
    expect(forestRegrowAtProgress(p, draw.start + 1e-6).hiddenSegmentIds.has('s3')).toBe(false);

    let drawn = false;
    for (let at = 0; at <= 1.00001; at += 0.005) {
      const hidden = forestRegrowAtProgress(p, at).hiddenSegmentIds.has('s3');
      if (!hidden) drawn = true;
      else expect(drawn, `s3 un-drew at ${at}`).toBe(false);
    }
  });

  it('never draws a road out of an island that has not settled', () => {
    const p = plan();
    for (let at = 0; at <= 1.00001; at += 0.01) {
      const state = forestRegrowAtProgress(p, at);
      const visible = new Set([
        ...state.drawingSegments.map((s) => s.id),
        ...[...p.segmentDraws.keys()].filter((id) => !state.hiddenSegmentIds.has(id)),
      ]);
      for (const id of visible) {
        const source = p.pathways.find((w) =>
          p.segmentDraws.get(id)!.startMs >= w.startMs - 1e-9 &&
          p.segmentDraws.get(id)!.startMs <= w.endMs + 1e-9,
        );
        if (!source) continue;
        expect(
          state.landedStoryIds.has(source.from),
          `${id} is drawn at ${at} but ${source.from} has not settled`,
        ).toBe(true);
      }
    }
  });

  it('holds an island in the ARRIVAL staging from the moment it appears, for the hold window', () => {
    const p = plan();
    const step = p.stepByStory.get('forest-world')!;
    const window = p.tuning.arrivalHoldMs / p.durationMs;
    expect(forestRegrowAtProgress(p, step.start + 1e-6).arrivalStoryIds).toContain('forest-world');
    expect(
      forestRegrowAtProgress(p, step.start + window + 1e-6).arrivalStoryIds,
    ).not.toContain('forest-world');
  });

  it('re-times the arrival staging to finish inside the island growth it now describes', () => {
    // The `.act2-regrowing` staging in index.css compresses the coast/ground/flora beats to land
    // by ~0.74s. The hold has to outlast that (or a class would be pulled mid-stage) without
    // outlasting the island so far that a settled island is still staging when its pathways go.
    expect(FOREST_REGROW_TUNING.arrivalHoldMs).toBeGreaterThanOrEqual(740);
    expect(FOREST_REGROW_TUNING.arrivalHoldMs).toBeLessThan(
      FOREST_REGROW_TUNING.islandGrowthMs + FOREST_REGROW_TUNING.pathwayMinMs,
    );
  });

  it('clamps progress outside [0,1] and NaN rather than throwing mid-animation', () => {
    const p = plan();
    expect(forestRegrowAtProgress(p, -3).progress).toBe(0);
    expect(forestRegrowAtProgress(p, 4).progress).toBe(1);
    expect(forestRegrowAtProgress(p, Number.NaN).progress).toBe(0);
  });
});
