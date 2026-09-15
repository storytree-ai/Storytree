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
  bursts,
  frameCost,
  busyMs,
  cpuSplitIsReportable,
  lateFrameClusters,
  locatorFromSourceMaps,
  moduleOf,
  moduleSplit,
  networkSplit,
  ownUrl,
  rankedStages,
  shareOf,
  sourceLocator,
  stageDelta,
  stageOf,
  stageSplit,
  sumSplits,
  type CpuProfile,
  type LoadStage,
  type ProfileNode,
  type ResourceTiming,
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

/** The store-payload rule the driver hands in: a fetch whose path's first segment is the API's. Read
 *  by segment, as the driver reads it, so no literal in frontend source starts with the API prefix. */
const isStore = (name: string): boolean => new URL(name).pathname.split('/')[1] === 'api';

/** `networkSplit` with that rule. */
const splitNetwork = (entries: readonly ResourceTiming[]) => networkSplit(entries, isStore);

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
    // Equal times keep the declared stage order, so two runs of the same profile rank alike.
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
    // ⚠ THE SEPARATION IS THE WHOLE POINT: the map already paid for the store payload, so a single
    // "network" figure would blame the land view for a wait it did not cause.
    const n = splitNetwork([
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
    // it is why `worstMs` and `late` are reported beside it and why the report must not lead
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

// ---------------------------------------------------------------------------------------------
// THE RULES AND THE BOUNDARIES THE TESTS ABOVE LEFT UNWITNESSED
//
// `check:mutation-diff` reported survivors over this module twice, and reading them was the
// cheapest review it has had: each one named a line whose behaviour nothing here pinned. Where the
// line was an identity no input could separate — a guard, a clamp, a tie-break over rows already in
// order, a rule nothing could reach — it was DELETED rather than tested. The rest are below, and
// they are not padding: a stage rule with no test is a bucket that can be renamed to `""` and nobody
// notices.
// ---------------------------------------------------------------------------------------------

describe('every stage rule is witnessed by its own path', () => {
  it('places each module family the load actually touches', () => {
    // One assertion per RULE, not per family: `scene-build` is reached by three different paths and
    // `kit-decode` by two, and a test hitting only one leaves the others free to be blanked.
    expect(stageOf('http://x/apps/studio/src/lib/sceneAdapter.ts')).toBe('scene-build');
    expect(stageOf('http://x/apps/studio/src/lib/kit-loader.ts')).toBe('kit-decode');
    expect(stageOf('http://x/node_modules/.vite/deps/@react-three_fiber.js')).toBe('three-and-r3f');
    expect(stageOf('http://x/node_modules/.vite/deps/drei/index.js')).toBe('three-and-r3f');
    expect(stageOf('http://x/node_modules/.vite/deps/react-dom_client.js')).toBe('react-and-studio');
    // The last rule: an app file served from its own root, with no `apps/studio` in the url.
    expect(stageOf('http://x/src/main.tsx')).toBe('react-and-studio');
  });

  it('an empty url still comes back unattributed with no guard to say so', () => {
    // No rule matches '' — the behaviour is asserted on the function, rather than defended by a
    // branch nothing could separate from its absence.
    expect(stageOf('')).toBe('unattributed');
  });
});

describe('the boundaries', () => {
  it('the truncation refusal NAMES both counts, so a reader can see which end was lost', () => {
    // A refusal that says only "truncated" cannot be acted on; the two lengths are the diagnosis.
    expect(() => stageSplit({ nodes: [node(1, '')], samples: [1, 1, 1], timeDeltas: [1000] })).toThrow(
      /3 sample\(s\) against 1 time delta\(s\)/,
    );
  });

  it('shareOf answers 0 on an empty split rather than NaN', () => {
    // NaN would print as "NaN%" in every row of the report — a division by a total nobody checked.
    const empty = stageSplit({ nodes: [], samples: [], timeDeltas: [] });
    expect(empty.totalMs).toBe(0);
    expect(shareOf(empty, 'land-stream')).toBe(0);
  });

  it('a frame EXACTLY at the late bar is not late — the bar is exclusive and stays that way', () => {
    // 25.0 ms is one and a half budgets exactly. Late means WORSE than the bar; a `>=` here would
    // start counting the boundary frame and the count would creep on a healthy run.
    expect(frameCost([LATE_FRAME_MS, LATE_FRAME_MS]).late).toBe(0);
    expect(frameCost([LATE_FRAME_MS + 0.1]).late).toBe(1);
  });

  it('the network split adds bytes on every branch — a sign flip is a plausible-looking total', () => {
    // `+=` mutated to `-=` leaves a negative total, which reads as a units bug rather than as the
    // arithmetic fault it is. Each of the three accumulators is asserted, not just the interesting one.
    const n = splitNetwork([
      { name: 'http://x/api/tree', durationMs: 10, transferSizeBytes: 1000 },
      { name: 'http://x/api/assets', durationMs: 20, transferSizeBytes: 3000 },
      { name: 'http://x/src/main.tsx', durationMs: 5, transferSizeBytes: 700 },
      { name: 'http://x/src/other.tsx', durationMs: 5, transferSizeBytes: 300 },
    ]);
    expect(n.storePayloadBytes).toBe(4000);
    expect(n.otherBytes).toBe(1000);
    expect(n.canvasChunkBytes).toBe(0);
  });

  it('recognises the production canvas and kit chunks by the names a build gives them', () => {
    // ⚠ MEASURED: the first production run counted both chunks as "everything else" and reported
    // the land view's own payload as zero, because a built chunk carries its entry module's name.
    const n = splitNetwork([
      { name: 'http://h/assets/ForestWorldCanvas-CLGCjs9e.js', durationMs: 40, transferSizeBytes: 3000 },
      { name: 'http://h/assets/kit-BkNhlUTR.js', durationMs: 20, transferSizeBytes: 1000 },
      { name: 'http://h/assets/index-GWkh9kn4.js', durationMs: 5, transferSizeBytes: 700 },
    ]);
    expect(n.canvasChunkBytes).toBe(4000);
    expect(n.canvasChunkMs).toBe(60);
    expect(n.otherBytes).toBe(700);
  });

  it('a .gltf is recognised by its ENDING, which is the only place an extension can be', () => {
    const n = splitNetwork([{ name: 'http://x/assets/kit.gltf', durationMs: 3, transferSizeBytes: 42 }]);
    expect(n.canvasChunkBytes).toBe(42);
  });

  it('cpuSplitIsReportable withholds a profile that was never busy at all', () => {
    // Nothing ran: there is no split to report, and 0/0 must not become a share.
    const allIdle = stageSplit(profile([{ id: 1, callFrame: { functionName: '(idle)', url: '' } }], [[1, 5000]]));
    expect(busyMs(allIdle)).toBe(0);
    expect(cpuSplitIsReportable(allIdle)).toBe(false);
  });

  it('cpuSplitIsReportable takes EXACTLY a quarter as reportable — the bar is inclusive', () => {
    // A quarter placed is the least this instrument will stand behind. Stated as an equality case
    // so the bar cannot drift to `>` and start withholding a split it was written to accept.
    const quarter = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: 'f', url: 'http://x/packages/forest-world/src/hex.ts' } },
          { id: 2, callFrame: { functionName: 'n', url: 'http://x/assets/minified.js' } },
        ],
        [[1, 1000], [2, 3000]],
      ),
    );
    expect(busyMs(quarter)).toBe(4);
    expect(quarter.byStage.unattributed).toBe(3);
    expect(cpuSplitIsReportable(quarter)).toBe(true);
  });

  it('cpuSplitIsReportable withholds a split that placed a fifth of its busy time — just under the bar', () => {
    // Two of ten busy milliseconds placed is 0.2, under the quarter. A share taken as a PRODUCT rather
    // than a ratio would read 20 and publish the split.
    const fifth = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: 'f', url: 'http://x/packages/forest-world/src/hex.ts' } },
          { id: 2, callFrame: { functionName: 'n', url: 'http://x/assets/minified.js' } },
        ],
        [[1, 2000], [2, 8000]],
      ),
    );
    expect(busyMs(fifth)).toBe(10);
    expect(fifth.byStage.unattributed).toBe(8);
    expect(cpuSplitIsReportable(fifth)).toBe(false);
  });

  it('rankedStages keeps ties in the declared order, because the rows are built in it and the sort is stable', () => {
    const split = stageSplit(
      profile(
        [
          { id: 1, callFrame: { functionName: 'f', url: 'http://x/packages/forest-world/src/hex.ts' } },
          { id: 2, callFrame: { functionName: 'g', url: 'http://x/packages/forest-layout/src/pack.ts' } },
          { id: 3, callFrame: { functionName: 'h', url: 'http://x/node_modules/three/build/three.js' } },
        ],
        [[1, 5000], [2, 5000], [3, 5000]],
      ),
    );
    // All three tie on time, so the whole order is the declared one: scene-build, land-stream,
    // three-and-r3f — exactly their positions in the stage list.
    expect(rankedStages(split).slice(0, 3).map((r) => r.stage)).toEqual([
      'scene-build',
      'land-stream',
      'three-and-r3f',
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// 2026-09-15 — THE WHOLE WAIT, THE PRODUCTION ARM, AND WHICH FILE THE TIME IS IN
//
// The first version of this instrument profiled only up to the first sized canvas, could attribute
// only the dev build, and stopped at a stage. In production 25.9 of 32.5 seconds came after the
// canvas; dev runs a StrictMode component body twice; and one stage spans three capabilities. Each
// function below closes one of those, and each keeps the closure the rest of this file insists on.
// ---------------------------------------------------------------------------------------------

describe('ownUrl', () => {
  it('is the default attribution: a frame is its own url, which is right wherever module paths survive', () => {
    expect(
      ownUrl({ functionName: 'f', url: 'http://x/packages/forest-world/src/hex.ts', lineNumber: 3, columnNumber: 9 }),
    ).toBe('http://x/packages/forest-world/src/hex.ts');
    // And it IS what a split with no locator falls through to: the two agree sample for sample.
    const p = profile([node(1, 'http://x/packages/forest-layout/src/pack.ts'), node(2, '')], [[1, 2000], [2, 1000]]);
    expect(stageSplit(p)).toEqual(stageSplit(p, ownUrl));
  });
});

describe('moduleOf', () => {
  it('names a workspace package file by its repo path, however the server reached it', () => {
    expect(
      moduleOf('http://127.0.0.1:5186/@fs/C:/code/storytree/.claude/worktrees/w/packages/forest-world-r3f/src/cell-ground-geometry.ts?t=1'),
    ).toBe('packages/forest-world-r3f/src/cell-ground-geometry.ts');
    expect(moduleOf('http://x/apps/studio/node_modules/@storytree/forest-world-r3f/src/ForestWorldCanvas.tsx')).toBe(
      'packages/forest-world-r3f/src/ForestWorldCanvas.tsx',
    );
    expect(moduleOf('http://h/packages/forest-layout/src/pack.ts#frag')).toBe('packages/forest-layout/src/pack.ts');
    expect(moduleOf('C:\\code\\x\\packages\\forest-world\\src\\hex.ts')).toBe('packages/forest-world/src/hex.ts');
  });

  it('keeps a dependency under node_modules, past the pnpm store', () => {
    expect(moduleOf('http://h/node_modules/.pnpm/three@0.180.0/node_modules/three/build/three.module.js')).toBe(
      'node_modules/three/build/three.module.js',
    );
    expect(moduleOf('http://h/node_modules/.vite/deps/three.js?v=abc')).toBe('node_modules/.vite/deps/three.js');
  });

  it('names the app files from the path they were served or mapped at', () => {
    expect(moduleOf('http://127.0.0.1:5186/src/components/TreeView.tsx')).toBe('src/components/TreeView.tsx');
    expect(moduleOf('http://h/@fs/C:/x/apps/studio/src/lib/landView.ts')).toBe('apps/studio/src/lib/landView.ts');
    expect(moduleOf('../../src/lib/landView.ts')).toBe('src/lib/landView.ts');
    expect(moduleOf('/@fs/tmp/elsewhere.ts')).toBe('tmp/elsewhere.ts');
    expect(moduleOf('HTTP://apps.example/src/a.ts')).toBe('src/a.ts');
    expect(moduleOf('')).toBe('');
  });
});

describe('sourceLocator', () => {
  // ⚠ EVERY MAPPING STRING BELOW IS HAND-ENCODED FROM THE V3 SPEC — base64 VLQ with the sign in the
  // lowest bit — and NOT produced by an encoder in this file, which would share any mistake with the
  // decoder it was checking.

  it('finds the source a generated column belongs to', () => {
    // "AAAA": column 0, source 0. "KCAA": column +5 ("K" = 10, which halves to 5), source +1.
    const at = sourceLocator({ sources: ['a.ts', 'b.ts'], mappings: 'AAAA,KCAA' });
    expect(at(0, 0)).toBe('a.ts');
    expect(at(0, 4)).toBe('a.ts');
    expect(at(0, 5)).toBe('b.ts');
    expect(at(0, 90000)).toBe('b.ts');
  });

  it('resets the column on every line and carries the source index across lines', () => {
    // Line 1's "AAAA" is column 0 of a NEW line; its source delta of 0 keeps the source line 0 ended on.
    const at = sourceLocator({ sources: ['a.ts', 'b.ts'], mappings: 'AAAA,KCAA;AAAA' });
    expect(at(1, 0)).toBe('b.ts');
  });

  it('decodes a negative delta and a two-digit value', () => {
    // "ADAA": source -1 ("D" = 3, odd, so negative 1). "gBCAA": column +16 — "g" = 32 carries, "B"
    // adds 1 << 5 = 32, which halves to 16 — then source +1.
    const at = sourceLocator({ sources: ['a.ts', 'b.ts'], mappings: 'AAAA,KCAA;ADAA,gBCAA' });
    expect(at(1, 15)).toBe('a.ts');
    expect(at(1, 16)).toBe('b.ts');
  });

  it('answers null wherever the map places nothing', () => {
    // "KAAA": column 5, source 0. "K": column +5 with ONE field, which maps to no source — and with a
    // second source present, so a sourceless segment read as source 1 would name one.
    const at = sourceLocator({ sources: ['a.ts', 'b.ts'], mappings: 'KAAA,K;' });
    expect(at(0, 4)).toBeNull(); // before the first segment
    expect(at(0, 5)).toBe('a.ts');
    expect(at(0, 10)).toBeNull(); // the one-field segment
    expect(at(1, 0)).toBeNull(); // a line the map carries but leaves empty
    expect(at(7, 0)).toBeNull(); // a line it does not carry at all
  });

  it('a null source entry names nothing rather than a string', () => {
    expect(sourceLocator({ sources: [null], mappings: 'AAAA' })(0, 0)).toBeNull();
  });

  it('finds the LAST segment at or before the column on a long line', () => {
    // Eight segments five columns apart, each naming the next source — the scan has to land on the
    // right one from either side, not merely on the first or the last.
    const sources = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
    const at = sourceLocator({ sources, mappings: 'AAAA,KCAA,KCAA,KCAA,KCAA,KCAA,KCAA,KCAA' });
    expect([0, 4, 5, 9, 17, 24, 25, 34, 35, 1000].map((column) => at(0, column))).toEqual([
      's0', 's0', 's1', 's1', 's3', 's4', 's5', 's6', 's7', 's7',
    ]);
  });

  it('REFUSES a corrupt mapping string — a stray character, or a value cut off mid-digit', () => {
    expect(() => sourceLocator({ sources: ['a.ts'], mappings: 'AA!A' })).toThrow(
      /segment "AA!A" is not base64 VLQ at character 2 — refusing to name modules off a corrupt map/,
    );
    // "g" sets the continuation bit and then its segment ends.
    expect(() => sourceLocator({ sources: ['a.ts'], mappings: 'AAAA,g' })).toThrow(
      /segment "g" ends in the middle of a value — refusing to name modules off a corrupt map/,
    );
    // A character outside the alphabet — past the 7-bit range, too — is refused, not read as some digit.
    expect(() => sourceLocator({ sources: ['a.ts'], mappings: 'AAéA' })).toThrow(/segment "AAéA" is not base64 VLQ at character 2/);
  });

  it('an empty segment names nothing, and does not shadow the real one before it', () => {
    // Two stray commas after a real segment: were each recorded as a sourceless segment at the same
    // column, the scan would land on the last of them and answer null for a column the map names.
    expect(sourceLocator({ sources: ['a.ts'], mappings: 'AAAA,,' })(0, 0)).toBe('a.ts');
  });

  it('a sourceless segment still takes its place in the line, so the segments after it keep theirs', () => {
    // "AAAA" names a.ts from column 0; "K" is one field at column 5 and names nothing; "KCAA" names b.ts
    // from column 10. Were the sourceless segment's column kept without its empty source, every source
    // after it would shift one segment early.
    const at = sourceLocator({ sources: ['a.ts', 'b.ts'], mappings: 'AAAA,K,KCAA' });
    expect(at(0, 4)).toBe('a.ts');
    expect(at(0, 5)).toBeNull();
    expect(at(0, 10)).toBe('b.ts');
  });
});

describe('locatorFromSourceMaps', () => {
  const chunk = 'http://h/assets/index-C5.js';
  // "KAAA": column 5 names the studio module; "KCAA": column 10 names the engine module.
  // ⚠ BUILT INSIDE EACH CALL, NEVER AT DESCRIBE SCOPE. Decoding a map while the file is being COLLECTED
  // runs the decoder outside any test, so a mutant that breaks it throws before a test exists to fail —
  // and the mutation rung scored fifteen such mutants as survivors that no test was ever handed.
  const locate: ReturnType<typeof locatorFromSourceMaps> = (frame) =>
    locatorFromSourceMaps(
      new Map([
        [
          chunk,
          sourceLocator({
            sources: ['../../src/lib/landView.ts', '../../packages/forest-world-r3f/src/world-to-3d.ts'],
            mappings: 'KAAA,KCAA',
          }),
        ],
      ]),
    )(frame);

  it('names a production frame through its chunk map, resolved against the chunk url', () => {
    expect(locate({ functionName: 'a', url: chunk, lineNumber: 0, columnNumber: 12 })).toBe(
      'http://h/packages/forest-world-r3f/src/world-to-3d.ts',
    );
    expect(locate({ functionName: 'b', url: chunk, lineNumber: 0, columnNumber: 5 })).toBe('http://h/src/lib/landView.ts');
  });

  it('keeps the frame url wherever the map cannot answer', () => {
    // No map for that chunk; no position at all; half a position; a column before the first segment.
    expect(locate({ functionName: 'c', url: 'http://h/assets/other.js', lineNumber: 0, columnNumber: 12 })).toBe(
      'http://h/assets/other.js',
    );
    expect(locate({ functionName: 'd', url: chunk })).toBe(chunk);
    expect(locate({ functionName: 'e', url: chunk, lineNumber: 0 })).toBe(chunk);
    expect(locate({ functionName: 'f', url: chunk, columnNumber: 12 })).toBe(chunk);
    expect(locate({ functionName: 'g', url: chunk, lineNumber: 0, columnNumber: 2 })).toBe(chunk);
  });

  it('reads a missing half of the position as NO position — never as line or column one', () => {
    // This map answers at line 1 from column 0 and at line 0 from column 1, so a missing line read as
    // 1, or a missing column read as 1, would name a module the frame never gave a position in.
    const lazy = 'http://h/assets/lazy-D1.js';
    const locateLazy = locatorFromSourceMaps(new Map([[lazy, sourceLocator({ sources: ['x.ts'], mappings: 'CAAA;AACA' })]]));
    expect(locateLazy({ functionName: 'h', url: lazy, columnNumber: 0 })).toBe(lazy);
    expect(locateLazy({ functionName: 'i', url: lazy, lineNumber: 0 })).toBe(lazy);
    expect(locateLazy({ functionName: 'j', url: lazy, lineNumber: 1, columnNumber: 0 })).toBe('http://h/assets/x.ts');
    expect(locateLazy({ functionName: 'k', url: lazy, lineNumber: 0, columnNumber: 3 })).toBe('http://h/assets/x.ts');
  });

  it('turns the withheld production table into a reportable one — the same samples, placed', () => {
    const p = profile(
      [
        { id: 1, callFrame: { functionName: 'a', url: chunk, lineNumber: 0, columnNumber: 12 } },
        { id: 2, callFrame: { functionName: 'b', url: chunk, lineNumber: 0, columnNumber: 2 } },
      ],
      [[1, 6000], [2, 2000]],
    );
    const unmapped = stageSplit(p);
    expect(unmapped.byStage.unattributed).toBe(8);
    expect(cpuSplitIsReportable(unmapped)).toBe(false);
    const mapped = stageSplit(p, locate);
    expect(mapped.byStage['land-stream']).toBe(6);
    expect(mapped.byStage.unattributed).toBe(2); // column 2 is before the map's first segment
    expect(cpuSplitIsReportable(mapped)).toBe(true);
  });
});

describe('moduleSplit', () => {
  it('names the FILE the time is in, and the rows plus the rest SUM TO THE TOTAL', () => {
    const m = moduleSplit(
      profile(
        [
          node(1, 'http://x/packages/forest-world-r3f/src/cell-ground-geometry.ts', 'build'),
          node(2, 'http://x/packages/forest-world-r3f/src/world-to-3d.ts'),
          node(3, 'http://x/packages/forest-world-r3f/src/cell-ground-geometry.ts', 'another'),
          node(4, 'http://x/node_modules/.vite/deps/three.js'),
          { id: 5, callFrame: { functionName: '(idle)', url: '' } },
          node(6, ''),
        ],
        [[1, 5000], [3, 3000], [2, 2000], [4, 1000], [5, 4000], [6, 500]],
      ),
      3,
    );
    expect(m.rows).toEqual([
      { module: 'packages/forest-world-r3f/src/cell-ground-geometry.ts', stage: 'land-stream', ms: 8 },
      { module: '(idle)', stage: 'idle', ms: 4 },
      { module: 'packages/forest-world-r3f/src/world-to-3d.ts', stage: 'land-stream', ms: 2 },
    ]);
    expect(m.restModules).toBe(2);
    expect(m.restMs).toBe(1.5);
    expect(m.totalMs).toBe(15.5);
    expect(m.rows.reduce((sum, row) => sum + row.ms, 0) + m.restMs).toBeCloseTo(m.totalMs, 10);
  });

  it('keeps a url the stages cannot place as its own row, and puts nameless and node-less time in ONE row', () => {
    const m = moduleSplit(
      profile(
        [node(1, ''), node(2, 'http://h/assets/index-C5.js'), { id: 3, callFrame: { functionName: '(garbage collector)', url: '' } }],
        [[1, 1000], [99, 2000], [2, 4000], [3, 500]],
      ),
      10,
    );
    expect(m.rows).toEqual([
      { module: 'assets/index-C5.js', stage: 'unattributed', ms: 4 },
      { module: '(unattributed)', stage: 'unattributed', ms: 3 },
      { module: '(garbage collector)', stage: 'gc', ms: 0.5 },
    ]);
    expect(m.restModules).toBe(0);
    expect(m.restMs).toBe(0);
  });

  it('breaks a tie by module name, so two runs of one profile list alike', () => {
    const m = moduleSplit(profile([node(1, 'http://x/packages/b.ts'), node(2, 'http://x/packages/a.ts')], [[1, 1000], [2, 1000]]), 5);
    expect(m.rows.map((row) => row.module)).toEqual(['packages/a.ts', 'packages/b.ts']);
  });

  it('REFUSES a truncated profile, as the stage split does', () => {
    expect(() => moduleSplit({ nodes: [node(1, '')], samples: [1, 1], timeDeltas: [1000] }, 5)).toThrow(/truncated/);
  });
});

describe('sumSplits and stageDelta', () => {
  it('charges the land view only for what it ADDED over the map alone', () => {
    const land = stageSplit(
      profile(
        [node(1, 'http://x/packages/forest-world-r3f/src/world-to-3d.ts'), node(2, 'http://x/src/components/TreeView.tsx')],
        [[1, 9000], [2, 3000]],
      ),
    );
    const control = stageSplit(profile([node(2, 'http://x/src/components/TreeView.tsx')], [[2, 2000]]));
    const rows = stageDelta(land, control);
    expect(rows[0]).toEqual({ stage: 'land-stream', landMs: 9, controlMs: 0, addedMs: 9 });
    expect(rows[1]).toEqual({ stage: 'scene-build', landMs: 3, controlMs: 2, addedMs: 1 });
    expect(rows).toHaveLength(9);
  });

  it('a stage the land arm came in CHEAPER on keeps its negative figure and ranks last', () => {
    const land = stageSplit(profile([node(1, 'http://x/src/components/TreeView.tsx')], [[1, 1000]]));
    const control = stageSplit(profile([node(1, 'http://x/src/components/TreeView.tsx')], [[1, 4000]]));
    expect(stageDelta(land, control).at(-1)).toEqual({ stage: 'scene-build', landMs: 1, controlMs: 4, addedMs: -3 });
  });

  it('ties in the delta keep the declared stage order', () => {
    const empty = stageSplit(profile([], []));
    expect(stageDelta(empty, empty).map((row) => row.stage)).toEqual([
      'store-payload',
      'scene-build',
      'land-stream',
      'three-and-r3f',
      'kit-decode',
      'react-and-studio',
      'idle',
      'gc',
      'unattributed',
    ]);
  });

  it('sums phases stage by stage, and the total with them', () => {
    const a = stageSplit(profile([node(1, 'http://x/packages/forest-layout/src/pack.ts')], [[1, 2000]]));
    const b = stageSplit(
      profile(
        [node(1, 'http://x/packages/forest-layout/src/pack.ts'), { id: 2, callFrame: { functionName: '(idle)', url: '' } }],
        [[1, 1000], [2, 5000]],
      ),
    );
    const sum = sumSplits([a, b]);
    expect(sum.totalMs).toBe(8);
    expect(sum.byStage['scene-build']).toBe(3);
    expect(sum.byStage.idle).toBe(5);
    expect(sumSplits([]).totalMs).toBe(0);
  });
});

describe('bursts', () => {
  const isLand = (stage: LoadStage): boolean => stage === 'land-stream';
  const land = 'http://x/packages/forest-world-r3f/src/world-to-3d.ts';
  const other = 'http://x/src/other.ts';

  it('finds each separate run of land-stream work, and when it started', () => {
    // One-millisecond samples: land 0–3; other work 3–103; land 103–105; 1 ms of other; land to 108.
    const p = profile(
      [node(1, land), node(2, other)],
      [[1, 1000], [1, 1000], [1, 1000], [2, 100000], [1, 1000], [1, 1000], [2, 1000], [1, 1000], [1, 1000]],
    );
    expect(bursts(p, isLand, { mergeGapMs: 50, minMemberMs: 0 })).toEqual([
      { startMs: 0, endMs: 3, memberMs: 3 },
      { startMs: 103, endMs: 108, memberMs: 4 },
    ]);
  });

  it('merges a gap EXACTLY at the bar and splits one just past it', () => {
    const p = profile([node(1, land), node(2, other)], [[1, 1000], [2, 2000], [1, 1000]]);
    expect(bursts(p, isLand, { mergeGapMs: 2, minMemberMs: 0 })).toEqual([{ startMs: 0, endMs: 4, memberMs: 2 }]);
    expect(bursts(p, isLand, { mergeGapMs: 1.5, minMemberMs: 0 })).toEqual([
      { startMs: 0, endMs: 1, memberMs: 1 },
      { startMs: 3, endMs: 4, memberMs: 1 },
    ]);
  });

  it('drops a run under the member-time floor, and keeps one exactly at it', () => {
    const p = profile([node(1, land), node(2, other)], [[1, 1000], [2, 500000], [1, 1000], [1, 1000]]);
    expect(bursts(p, isLand, { mergeGapMs: 10, minMemberMs: 2 })).toEqual([{ startMs: 501, endMs: 503, memberMs: 2 }]);
  });

  it('a sample naming no node is never a member', () => {
    const p = profile([node(1, land)], [[1, 1000], [99, 1000], [1, 1000]]);
    expect(bursts(p, isLand, { mergeGapMs: 0, minMemberMs: 0 })).toEqual([
      { startMs: 0, endMs: 1, memberMs: 1 },
      { startMs: 2, endMs: 3, memberMs: 1 },
    ]);
  });

  it('reads a production frame through the locator it is handed', () => {
    const chunk = 'http://h/assets/index-C5.js';
    const locate = locatorFromSourceMaps(
      new Map([[chunk, sourceLocator({ sources: ['../../packages/forest-world-r3f/src/x.ts'], mappings: 'AAAA' })]]),
    );
    const p = profile([{ id: 1, callFrame: { functionName: 'f', url: chunk, lineNumber: 0, columnNumber: 0 } }], [[1, 3000]]);
    expect(bursts(p, isLand, { mergeGapMs: 0, minMemberMs: 0 })).toEqual([]);
    expect(bursts(p, isLand, { mergeGapMs: 0, minMemberMs: 0 }, locate)).toEqual([{ startMs: 0, endMs: 3, memberMs: 3 }]);
  });

  it('REFUSES a truncated profile', () => {
    expect(() => bursts({ nodes: [], samples: [1], timeDeltas: [] }, isLand, { mergeGapMs: 0, minMemberMs: 0 })).toThrow(
      /truncated/,
    );
  });
});

describe('lateFrameClusters', () => {
  it('groups late frames that arrive together, and says when each group began', () => {
    // t: 16, 32 | 400 runs 32–432 | 30 runs 432–462 (late, touching) | six 16s to 558 | 900 runs 558–1458.
    const deltas = [16, 16, 400, 30, 16, 16, 16, 16, 16, 16, 900];
    expect(lateFrameClusters(deltas, 50)).toEqual([
      { atMs: 32, frames: 2, worstMs: 400, spanMs: 430 },
      { atMs: 558, frames: 1, worstMs: 900, spanMs: 900 },
    ]);
    // The two groups are 96 ms apart: one group once the allowed gap reaches that, two just short of it.
    expect(lateFrameClusters(deltas, 96)).toEqual([{ atMs: 32, frames: 3, worstMs: 900, spanMs: 1426 }]);
    expect(lateFrameClusters(deltas, 95)).toHaveLength(2);
  });

  it('keeps the WORST of a group, whichever order its frames came in', () => {
    expect(lateFrameClusters([900, 30], 0)).toEqual([{ atMs: 0, frames: 2, worstMs: 900, spanMs: 930 }]);
  });

  it('a frame exactly at the late bar starts no group, and an empty run has none', () => {
    expect(lateFrameClusters([LATE_FRAME_MS, LATE_FRAME_MS], 1000)).toEqual([]);
    expect(lateFrameClusters([], 1000)).toEqual([]);
  });
});
