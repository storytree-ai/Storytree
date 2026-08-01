// forest-regrow — Stage-1 red-green (ADR-0070) of the Act 2 intro's ORDER and CLOCK: the pure
// (story graph, trail edges) → landing-schedule plan, and the pure (plan, progress) → what-exists
// selection the scene walk consumes. The LOOK of the regrow is owner-attested and never asserted
// here; what is pinned is that the order comes from the real DAG, that no island appears before
// the ground it stands on, and that the same graph regrows identically every time (ADR-0282 D3).

import { describe, it, expect } from 'vitest';
import {
  deriveForestRegrowPlan,
  forestRegrowAtProgress,
  FOREST_REGROW_TUNING,
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

const EDGES: readonly ForestRegrowTrailEdge[] = [
  { from: 'proof-protocol', to: 'storage-protocol', segments: [{ id: 's1' }, { id: 's2' }] },
  { from: 'forest-world', to: 'app-surface', segments: [{ id: 's3' }] },
  { from: 'library', to: 'studio', segments: [{ id: 's2' }, { id: 's4' }] },
];

const plan = (): ReturnType<typeof deriveForestRegrowPlan> =>
  deriveForestRegrowPlan(GRAPH, EDGES);

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

  it('depths waves by LONGEST path, so a story never shares a wave with its dependency', () => {
    const p = plan();
    expect(p.stepByStory.get('proof-protocol')?.wave).toBe(0);
    expect(p.stepByStory.get('storage-protocol')?.wave).toBe(1);
    expect(p.stepByStory.get('library')?.wave).toBe(2);
    expect(p.stepByStory.get('notice-board')?.wave).toBe(3);
    expect(p.stepByStory.get('studio')?.wave).toBe(4);
  });

  it('never starts an island accreting before every island it stands on has SETTLED', () => {
    const p = plan();
    for (const story of GRAPH) {
      const step = p.stepByStory.get(story.id)!;
      for (const dep of story.dependsOn) {
        const on = p.stepByStory.get(dep)!;
        expect(
          on.endMs,
          `${story.id} starts at ${step.startMs}ms but stands on ${dep}, settled at ${on.endMs}ms`,
        ).toBeLessThanOrEqual(step.startMs);
      }
    }
  });

  it('regrows the same graph identically, whatever order the stories arrive in', () => {
    const forward = deriveForestRegrowPlan(GRAPH, EDGES);
    const shuffled = deriveForestRegrowPlan([...GRAPH].reverse(), [...EDGES].reverse());
    const shape = (p: ReturnType<typeof deriveForestRegrowPlan>): unknown => ({
      steps: p.steps,
      base: p.baseStoryIds,
      waves: p.waveCount,
      duration: p.durationMs,
      segments: [...p.segmentRevealAt].sort(),
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
    // The plan ends after the LAST event, which on a deep graph is the final island's trail
    // draw-on rather than its own accretion.
    const last = p.steps[p.steps.length - 1]!;
    expect(
      Math.max(last.endMs, last.startMs + p.tuning.trailDrawMs) + p.tuning.settleHoldMs,
    ).toBe(p.durationMs);
  });

  it('reveals a shared segment with the EARLIEST connection it carries, not the latest', () => {
    const p = plan();
    // s2 sits on both proof-protocol→storage-protocol and library→studio.
    expect(p.segmentRevealAt.get('s2')).toBe(
      Math.max(
        p.stepByStory.get('proof-protocol')!.start,
        p.stepByStory.get('storage-protocol')!.start,
      ),
    );
  });

  it('lands a dependency CYCLE in a final wave rather than losing islands off the map', () => {
    const cyclic = deriveForestRegrowPlan([
      { id: 'root', dependsOn: [] },
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]);
    expect([...cyclic.cyclicStoryIds]).toEqual(['a', 'b']);
    expect([...cyclic.baseStoryIds]).toEqual(['root']);
    expect(cyclic.steps).toHaveLength(3);
    expect(forestRegrowAtProgress(cyclic, 1).landedStoryIds.size).toBe(3);
  });

  it('does not strand an island whose depends_on names a story outside the graph', () => {
    const p = deriveForestRegrowPlan([{ id: 'solo', dependsOn: ['a-story-that-is-not-here'] }]);
    expect([...p.baseStoryIds]).toEqual(['solo']);
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
    expect(p.segmentRevealAt.has('ghost-seg')).toBe(false);
    expect(p.stepByStory.has('ghost-story')).toBe(false);
  });

  it('refuses an empty graph rather than yielding an empty regrow', () => {
    expect(() => deriveForestRegrowPlan([])).toThrow(/at least one story/u);
  });

  it('refuses nonsense tuning rather than producing a plan with no duration', () => {
    expect(() =>
      deriveForestRegrowPlan(GRAPH, EDGES, { ...FOREST_REGROW_TUNING, islandGrowthMs: 0 }),
    ).toThrow(/islandGrowthMs/u);
    expect(() =>
      deriveForestRegrowPlan(GRAPH, EDGES, { ...FOREST_REGROW_TUNING, waveGapMs: -1 }),
    ).toThrow(/waveGapMs/u);
  });
});

describe('forestRegrowAtProgress', () => {
  it('shows nothing at all at 0 and the whole forest, unhidden, at 1', () => {
    const p = plan();
    const empty = forestRegrowAtProgress(p, 0);
    expect(empty.presentStoryIds.size).toBe(0);
    expect(empty.absentStoryIds.size).toBe(GRAPH.length);
    expect(empty.growing).toHaveLength(0);
    expect(empty.hiddenSegmentIds.size).toBe(4); // every routed segment is a road to nowhere

    const grown = forestRegrowAtProgress(p, 1);
    expect(grown.landedStoryIds.size).toBe(GRAPH.length);
    expect(grown.absentStoryIds.size).toBe(0);
    expect(grown.growing, 'nothing is mid-accretion on the settled forest').toHaveLength(0);
    expect(grown.hiddenSegmentIds.size, 'every trail is drawn').toBe(0);
    expect(grown.arrivalStoryIds, 'nothing is still drawing on').toEqual([]);
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

  it('keeps a trail hidden until BOTH endpoints are present, then never re-hides it', () => {
    const p = plan();
    const appSurface = p.stepByStory.get('app-surface')!;
    const forestWorld = p.stepByStory.get('forest-world')!;
    // s3 joins forest-world (wave 0) to app-surface (wave 1) — the later endpoint gates it.
    expect(p.segmentRevealAt.get('s3')).toBe(Math.max(forestWorld.start, appSurface.start));
    expect(forestRegrowAtProgress(p, appSurface.start - 1e-6).hiddenSegmentIds.has('s3')).toBe(true);
    expect(forestRegrowAtProgress(p, appSurface.start + 1e-6).hiddenSegmentIds.has('s3')).toBe(false);

    let drawn = false;
    for (let at = 0; at <= 1.00001; at += 0.01) {
      const hidden = forestRegrowAtProgress(p, at).hiddenSegmentIds.has('s3');
      if (!hidden) drawn = true;
      else expect(drawn, `s3 un-drew at ${at}`).toBe(false);
    }
  });

  it('holds an island in the ARRIVAL set from the moment it appears, for the draw window', () => {
    const p = plan();
    const step = p.stepByStory.get('forest-world')!;
    const window = p.tuning.trailDrawMs / p.durationMs;
    expect(forestRegrowAtProgress(p, step.start + 1e-6).arrivalStoryIds).toContain('forest-world');
    expect(
      forestRegrowAtProgress(p, step.start + window + 1e-6).arrivalStoryIds,
    ).not.toContain('forest-world');
  });

  it('outlasts the trail draw-on, so no mask is ever pulled mid-stroke', () => {
    // The CSS beat is 350ms per chain position (`REVEAL_STAGGER_MS`) plus a 0.35s stroke
    // animation; a six-segment chain is the realistic worst case on this corpus.
    expect(FOREST_REGROW_TUNING.trailDrawMs).toBeGreaterThanOrEqual(6 * 350);
  });

  it('clamps progress outside [0,1] and NaN rather than throwing mid-animation', () => {
    const p = plan();
    expect(forestRegrowAtProgress(p, -3).progress).toBe(0);
    expect(forestRegrowAtProgress(p, 4).progress).toBe(1);
    expect(forestRegrowAtProgress(p, Number.NaN).progress).toBe(0);
  });
});
