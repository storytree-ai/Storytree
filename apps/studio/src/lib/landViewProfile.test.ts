// landViewProfile.test.ts — the split has to be able to say what it MISSED.
//
// ⚠ THE ONE FAILURE THIS FILE EXISTS TO PREVENT is not a wrong number, it is a COMPLETE-LOOKING
// one. An attribution that quietly drops the frames it cannot place reports shares of the time it
// understood and calls them shares of the load — which is exactly the shape of the instrument
// defect that made ADR-0549's headline wrong and cost this arc three corrections to the owner. So
// every assertion below is about totals and residue as much as about the buckets.

import { describe, it, expect } from 'vitest';

import {
  FRAME_BUDGET_MS,
  LATE_FRAME_MS,
  frameCost,
  busyMs,
  cpuSplitIsReportable,
  networkSplit,
  rankedStages,
  shareOf,
  stageOf,
  stageSplit,
  type CpuProfile,
  type ProfileNode,
} from './landViewProfile.js';

/** A profile node at a given module url — the only field attribution reads. */
const node = (id: number, url: string, functionName = 'fn'): ProfileNode => ({
  id,
  callFrame: { functionName, url },
});

/** A profile whose samples are given as `[nodeId, microseconds]` pairs. */
const profile = (nodes: readonly ProfileNode[], samples: readonly (readonly [number, number])[]): CpuProfile => ({
  nodes,
  samples: samples.map(([id]) => id),
  timeDeltas: samples.map(([, us]) => us),
});

describe('stageOf', () => {
  it('sends the engine packages to the land stream and the studio catch-all LAST', () => {
    // ⚠ THIS IS THE ORDERING THE RULE TABLE'S COMMENT CLAIMS, asserted rather than trusted: both
    // urls contain "studio", and the whole question the measurement answers is which of the two
    // owns the time. Swap the rules and this test is the only thing that notices.
    expect(stageOf('http://x/apps/studio/node_modules/@storytree/forest-world-r3f/src/ForestWorldCanvas.tsx')).toBe('land-stream');
    expect(stageOf('http://x/apps/studio/src/lib/landView.ts')).toBe('land-stream');
    expect(stageOf('http://x/apps/studio/src/lib/somethingElse.ts')).toBe('react-and-studio');
  });

  it('separates the shared 2D layout from the 3D land — they are different questions', () => {
    expect(stageOf('http://x/packages/forest-layout/src/pack.ts')).toBe('scene-build');
    expect(stageOf('http://x/apps/studio/src/components/TreeView.tsx')).toBe('scene-build');
    expect(stageOf('http://x/node_modules/.vite/deps/three.js')).toBe('three-and-r3f');
    expect(stageOf('http://x/node_modules/three/examples/jsm/loaders/GLTFLoader.js')).toBe('kit-decode');
  });

  it('separates WAITING from UNPLACEABLE — they are opposite findings', () => {
    // ⚠ MEASURED: on this instrument's first run the url-only bucket was 43.8% of the sampled
    // time, which reads as "the attribution failed" and was mostly "the page was waiting on the
    // network". One says fix the instrument; the other says fix the load. They must not share a row.
    const split = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: '(idle)', url: '' } },
          { id: 2, callFrame: { functionName: '(garbage collector)', url: '' } },
          { id: 3, callFrame: { functionName: 'someNative', url: '' } },
        ],
        [[1, 9000], [2, 2000], [3, 1000]],
      ),
    );
    expect(split.byStage.idle).toBe(9);
    expect(split.byStage.gc).toBe(2);
    expect(split.byStage.unattributed).toBe(1);
    // And the compute denominator drops the waiting, without changing the whole.
    expect(busyMs(split)).toBe(3);
    expect(split.totalMs).toBe(12);
  });

  it('a synthetic NAME never overrides a real module`s attribution', () => {
    // The refinement is scoped to frames that have no url; a named frame in a real module keeps it.
    const split = stageSplit(
      profile([{ id: 1, callFrame: { functionName: '(idle)', url: 'http://x/packages/forest-world/src/hex.ts' } }], [[1, 5000]]),
    );
    expect(split.byStage['land-stream']).toBe(5);
    expect(split.byStage.idle).toBe(0);
  });

  it('gives V8`s own frames NO home, which is the point', () => {
    // `(program)`, `(idle)`, `(garbage collector)` and native frames all arrive with an empty url.
    // Inventing a bucket for them would put the browser's time inside one of our packages.
    expect(stageOf('')).toBe('unattributed');
    expect(stageOf('extensions::something')).toBe('unattributed');
  });
});

describe('stageSplit', () => {
  it('charges self time to the node the sample was taken in, and the buckets SUM TO THE TOTAL', () => {
    const split = stageSplit(
      profile(
        [node(1, 'http://x/packages/forest-world-r3f/src/cell-ground-geometry.ts'), node(2, 'http://x/node_modules/.vite/deps/three.js'), node(3, '')],
        [
          [1, 4000],
          [1, 6000],
          [2, 2000],
          [3, 8000],
        ],
      ),
    );
    expect(split.totalMs).toBe(20);
    expect(split.byStage['land-stream']).toBe(10);
    expect(split.byStage['three-and-r3f']).toBe(2);
    expect(split.byStage.unattributed).toBe(8);
    // ⚠ THE CLOSURE, asserted as arithmetic rather than as three separate numbers: the split is
    // only an answer if nothing fell out of it.
    const summed = Object.values(split.byStage).reduce((a, b) => a + b, 0);
    expect(summed).toBeCloseTo(split.totalMs, 10);
  });

  it('a sample naming a node the profile does not carry is UNATTRIBUTED, never dropped', () => {
    // Dropping it would shrink the total and silently inflate every share taken against it — the
    // complete-looking answer this file exists to prevent.
    const split = stageSplit(profile([node(1, 'http://x/packages/forest-world/src/hex.ts')], [[1, 1000], [99, 3000]]));
    expect(split.totalMs).toBe(4);
    expect(split.byStage.unattributed).toBe(3);
    expect(Object.values(split.byStage).reduce((a, b) => a + b, 0)).toBeCloseTo(4, 10);
  });

  it('REFUSES a truncated profile rather than reporting its prefix as the whole', () => {
    const truncated: CpuProfile = { nodes: [node(1, '')], samples: [1, 1, 1], timeDeltas: [1000] };
    expect(() => stageSplit(truncated)).toThrow(/truncated/);
  });

  it('shares are taken against the WHOLE, unattributed included', () => {
    const split = stageSplit(profile([node(1, 'http://x/packages/forest-layout/src/pack.ts'), node(2, '')], [[1, 1000], [2, 3000]]));
    // 1 ms of 4 is 25% — NOT 100% of the 1 ms the attribution happened to understand.
    expect(shareOf(split, 'scene-build')).toBeCloseTo(25, 10);
    expect(shareOf(split, 'unattributed')).toBeCloseTo(75, 10);
  });

  it('rankedStages answers "which dominates" and is deterministic on a tie', () => {
    const split = stageSplit(
      profile(
        [node(1, 'http://x/packages/forest-layout/src/pack.ts'), node(2, 'http://x/packages/forest-world/src/hex.ts')],
        [[1, 5000], [2, 5000]],
      ),
    );
    const ranked = rankedStages(split);
    expect(ranked[0]?.ms).toBe(5);
    // Equal times break by the declared stage order, so two runs of the same profile rank alike.
    expect(ranked.slice(0, 2).map((r) => r.stage)).toEqual(['scene-build', 'land-stream']);
    expect(ranked).toHaveLength(9);
  });
});

describe('cpuSplitIsReportable', () => {
  it('withholds a split that placed almost nothing — the production arm`s table of zeroes', () => {
    // ⚠ MEASURED against a real production build: minified chunk names carry no package path, so
    // every busy sample landed in `unattributed` and the report printed 0.0 ms for every stage. A
    // vacuous split reads exactly like "no stage costs anything", which is the most misleading
    // thing this instrument could say.
    const vacuous = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: '(idle)', url: '' } },
          { id: 2, callFrame: { functionName: 'n', url: 'http://x/assets/index-C58393U_.js' } },
        ],
        [[1, 4000], [2, 3000]],
      ),
    );
    expect(vacuous.byStage['land-stream']).toBe(0);
    expect(cpuSplitIsReportable(vacuous)).toBe(false);
  });

  it('reports a split that placed most of its BUSY time, waiting notwithstanding', () => {
    // Idle is excluded from the denominator on purpose: a page that spent most of its wall clock
    // waiting still has a perfectly reportable split of the time it was actually working.
    const good = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: '(idle)', url: '' } },
          { id: 2, callFrame: { functionName: 'f', url: 'http://x/packages/forest-world-r3f/src/x.ts' } },
        ],
        [[1, 9000], [2, 3000]],
      ),
    );
    expect(cpuSplitIsReportable(good)).toBe(true);
  });
});

describe('networkSplit', () => {
  it('keeps the store payload apart from what only a land-view viewer pays for', () => {
    // ⚠ THE SEPARATION IS THE WHOLE POINT: the map already paid for /api/, so a single "network"
    // figure would blame the land view for a wait it did not cause.
    const n = networkSplit([
      { name: 'http://x/api/tree', durationMs: 900, transferSizeBytes: 400_000 },
      { name: 'http://x/node_modules/.vite/deps/three.js', durationMs: 300, transferSizeBytes: 1_200_000 },
      { name: 'http://x/assets/kit.glb', durationMs: 700, transferSizeBytes: 1_700_000 },
      { name: 'http://x/src/main.tsx', durationMs: 20, transferSizeBytes: 5_000 },
    ]);
    expect(n.storePayloadMs).toBe(900);
    expect(n.canvasChunkMs).toBe(1000);
    expect(n.canvasChunkBytes).toBe(2_900_000);
    expect(n.otherMs).toBe(20);
  });
});

describe('frameCost', () => {
  it('reports the TAIL as well as the middle — lag is a tail', () => {
    // 58 good frames and two terrible ones: an excellent mean, and what a person calls laggy.
    const deltas = [...Array.from({ length: 58 }, () => 16), 400, 380];
    const c = frameCost(deltas);
    expect(c.frames).toBe(60);
    expect(c.medianMs).toBe(16);
    expect(c.worstMs).toBe(400);
    expect(c.late).toBe(2);
    // ⚠⚠ AND HERE IS THE LIMIT OF p95 ITSELF, asserted rather than assumed: two bad frames in
    // sixty is 3.3% of the run, which is INSIDE the 95th percentile, so p95 reports a perfectly
    // smooth 16 ms over a run a person would call janky. That is not a defect in the statistic —
    // it is why `worstMs` and `overBudget` are reported beside it and why the report must not lead
    // with a percentile. A run whose stalls are rarer than 1 in 20 is invisible to p95 by
    // construction.
    expect(c.p95Ms).toBe(16);
    expect(c.worstMs).toBeGreaterThan(FRAME_BUDGET_MS);
  });

  it('p95 needs FOUR bad frames in sixty to see them, not three — the exact boundary', () => {
    // ⚠ THE ARITHMETIC, because "5%" is the intuition and it is off by one here: nearest rank puts
    // p95 of sixty samples at item 57 (index 56), and a sorted run's bad frames occupy the END. So
    // three stalls sit at indices 57-59 and p95 never reaches them; four start at index 56 and it
    // does. Worth pinning: it is the difference between a report saying "smooth" and saying "janky"
    // about the same run, decided by one frame.
    const three = [...Array.from({ length: 57 }, () => 16), 360, 380, 400];
    expect(frameCost(three).p95Ms).toBe(16);
    const four = [...Array.from({ length: 56 }, () => 16), 340, 360, 380, 400];
    expect(frameCost(four).p95Ms).toBeGreaterThan(FRAME_BUDGET_MS);
  });

  it('every reported quantile IS a frame that happened — no interpolation', () => {
    const c = frameCost([10, 20, 30, 40]);
    expect([10, 20, 30, 40]).toContain(c.medianMs);
    expect([10, 20, 30, 40]).toContain(c.p95Ms);
  });

  it('does NOT call a healthy 60 Hz run late — the bar that made an earlier run unreadable', () => {
    // ⚠ MEASURED: rAF reports an on-time 60 Hz frame as 16.7 ms, a hair over the 16.667 budget. A
    // strict `> budget` count called 216 of 360 on-time frames late, on a page whose median AND
    // p95 were both at budget — a count that fires on a healthy run cannot report an unhealthy one.
    const healthy = Array.from({ length: 360 }, () => 16.7);
    expect(frameCost(healthy).late).toBe(0);
    expect(16.7).toBeGreaterThan(FRAME_BUDGET_MS);
    expect(16.7).toBeLessThan(LATE_FRAME_MS);
  });

  it('REFUSES an empty run instead of calling it a perfect frame cost', () => {
    expect(() => frameCost([])).toThrow(/measured nothing/);
  });
});
