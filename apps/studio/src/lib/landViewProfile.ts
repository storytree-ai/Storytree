// landViewProfile.ts — WHERE THE LAND VIEW'S TIME GOES, as arithmetic a test can drive.
//
// The owner opened `?landView=1`, signed the look, and reported two separate things in one
// sentence: it *"takes a while to load"* and it is *"a little laggy"* once up. He also offered a
// cause and MARKED IT AS ONE — *"prob because we rendering the whole 3d map at once rather then
// incrementally growing it"*. The increment `the-land-view-loads-and-runs-fast-enough` says to
// measure before curing, because a cure aimed at the wrong cause costs a session and leaves the lag.
//
// ⚠⚠ THE HONESTY PROPERTY THIS MODULE EXISTS FOR: A SPLIT MUST ACCOUNT FOR ALL OF THE TIME.
// A profile attributed by module path will always meet frames it cannot place — the browser's own
// internals, the GC, an inlined frame with no url. The tempting move is to divide the time it COULD
// place and report percentages of that, which reads as a complete answer and is a different
// question. Every total here therefore carries an explicit `unattributed` bucket, `stageSplit`
// REFUSES to return a split whose buckets do not sum to the sampled total, and the report prints
// the unattributed share beside the rest. A split that cannot say what it missed is the shape of
// the instrument defect that cost this arc three corrections to the owner (ADR-0553).
//
// ⚠ IT ATTRIBUTES BY THE OWNING MODULE, NEVER BY FUNCTION NAME. Names are minified, shared
// (`map`, `forEach`), and re-used across packages; a module path is what actually says whose code
// ran. In vite dev — which is what the owner ran, and therefore what this measures — those paths
// are the real source paths, which is why dev is the honest arm here rather than a convenience.
//
// Pure: no DOM, no CDP, no `node:`. The driver (`scripts/measure-land-view.mjs`) collects; this
// decides. Same seam as `cameraRasterisationProbe.ts` beside it.

/** One node of a V8 CPU profile, as `Profiler.stop` returns it. */
export interface ProfileNode {
  readonly id: number;
  readonly callFrame: { readonly functionName: string; readonly url: string };
  readonly children?: readonly number[];
}

/** A V8 CPU profile, narrowed to the fields a self-time attribution needs. */
export interface CpuProfile {
  readonly nodes: readonly ProfileNode[];
  /** Node id per sample. */
  readonly samples: readonly number[];
  /** Microseconds since the previous sample; `samples[i]` is charged `timeDeltas[i]`. */
  readonly timeDeltas: readonly number[];
}

/**
 * THE STAGES THE INCREMENT ASKS FOR, in the order the load actually walks them.
 *
 * ⚠ `unattributed` IS A STAGE, not an error. See the honesty note above.
 */
export type LoadStage =
  | 'store-payload'
  | 'scene-build'
  | 'land-stream'
  | 'three-and-r3f'
  | 'kit-decode'
  | 'react-and-studio'
  | 'idle'
  | 'gc'
  | 'unattributed';

/** One stage's rule: the stage it names, and the module paths that belong to it. Ordered — the
 *  FIRST matching rule wins, so a narrower path is declared before the package that contains it. */
interface StageRule {
  readonly stage: LoadStage;
  readonly test: (url: string) => boolean;
}

const has = (needle: string) => (url: string): boolean => url.includes(needle);

/**
 * ⚠ ORDER IS SIGNIFICANT AND THE FIRST TWO RULES PROVE IT. `apps/studio/src/lib/landView.ts` and
 * `forest-world-r3f` both sit under a path containing `studio` in a dev URL, and the land stream is
 * the thing this measurement is trying to separate FROM the studio's own work — so the engine
 * packages are matched first and the studio catch-all last. Reversing these two would attribute the
 * engine's whole cost to the studio and answer the owner's question backwards.
 */
const STAGE_RULES: readonly StageRule[] = [
  // The land stream: the studio's own conversion module, then every engine package it calls into.
  { stage: 'land-stream', test: has('/lib/landView.ts') },
  { stage: 'land-stream', test: has('forest-world-r3f') },
  { stage: 'land-stream', test: has('forest-world') },
  // The 2D layout the SVG map and the land view SHARE — the scene graph both are built from.
  { stage: 'scene-build', test: has('forest-layout') },
  { stage: 'scene-build', test: has('/components/TreeView') },
  { stage: 'scene-build', test: has('/lib/sceneAdapter') },
  // The rendering stack the canvas chunk pulls in.
  { stage: 'kit-decode', test: has('GLTFLoader') },
  { stage: 'kit-decode', test: has('/kit-') },
  { stage: 'three-and-r3f', test: has('three') },
  { stage: 'three-and-r3f', test: has('@react-three') },
  { stage: 'three-and-r3f', test: has('/drei') },
  // Everything else the studio itself runs.
  { stage: 'react-and-studio', test: has('/react') },
  { stage: 'react-and-studio', test: has('apps/studio') },
  { stage: 'react-and-studio', test: has('/src/') },
];

/**
 * Which stage a profile frame's module belongs to.
 *
 * ⚠ AN EMPTY URL IS `unattributed` AND ALWAYS WILL BE. V8 gives no url to `(program)`, `(idle)`,
 * `(garbage collector)` or a native frame, and inventing a home for them would put the browser's
 * own time inside one of our packages' figures.
 */
export function stageOf(url: string): LoadStage {
  // ⚠ THE `url === ''` EARLY RETURN THAT STOOD HERE IS GONE, AND IT WAS DOING NOTHING. No rule
  // below matches the empty string, so an empty url already fell through to `unattributed` by the
  // ordinary path — the mutation rung reported both of its mutants as survivors, which is what a
  // guard wearing a correctness guard's clothes over an identity looks like. Deleted rather than
  // annotated, the playbook's own preference. The BEHAVIOUR it described is still asserted below.
  for (const rule of STAGE_RULES) {
    if (rule.test(url)) return rule.stage;
  }
  return 'unattributed';
}

/** Milliseconds of self time per stage, plus the total the split must sum to. */
export interface StageSplit {
  readonly totalMs: number;
  readonly byStage: Readonly<Record<LoadStage, number>>;
}

const ZERO = {
  'store-payload': 0,
  'scene-build': 0,
  'land-stream': 0,
  'three-and-r3f': 0,
  'kit-decode': 0,
  'react-and-studio': 0,
  idle: 0,
  gc: 0,
  unattributed: 0,
} satisfies Record<LoadStage, number>;

/**
 * ⚠⚠ WAITING IS NOT UNPLACEABLE, AND CONFLATING THEM RUINS THE ANSWER. V8's synthetic frames all
 * arrive with an EMPTY url, so a url-only attribution drops `(idle)` — a page doing nothing while
 * the network works — into the same bucket as a frame it genuinely could not place. Measured on the
 * first run of this instrument that bucket was 43.8% of the sampled time, which reads as "the
 * attribution failed" and was mostly "the page was waiting". They are opposite findings: one says
 * fix the instrument, the other says fix the network.
 *
 * Their names are V8's own and are stable across versions; anything else nameless stays
 * `unattributed`, which is the bucket that must never quietly absorb a real answer.
 */
function syntheticStage(functionName: string): LoadStage | null {
  if (functionName === '(idle)') return 'idle';
  if (functionName === '(garbage collector)') return 'gc';
  return null;
}

/**
 * SELF TIME PER STAGE over a V8 CPU profile.
 *
 * ⚠ SELF TIME, NOT TOTAL TIME, and the difference decides whether the answer is usable. A sample
 * charges the frame it was TAKEN IN, so a stage's figure is the time its own code was executing —
 * which is what "where does the time go" means. Total (inclusive) time would charge React for
 * everything React called, and every stage would read as "React".
 *
 * ⚠ IT REFUSES A MALFORMED PROFILE rather than reporting a plausible number over half of one.
 * `samples` and `timeDeltas` are parallel arrays by construction; a run that lost the end of one
 * would otherwise silently report the prefix as the whole.
 */
export function stageSplit(profile: CpuProfile): StageSplit {
  if (profile.samples.length !== profile.timeDeltas.length) {
    throw new Error(
      `landViewProfile: ${profile.samples.length} sample(s) against ${profile.timeDeltas.length} ` +
        'time delta(s) — the profile is truncated and any split over it would report a prefix as the whole',
    );
  }
  const stageById = new Map<number, LoadStage>();
  for (const node of profile.nodes) {
    // ⚠ THE SYNTHETIC NAME IS CONSULTED ONLY WHEN THE URL PLACES NOTHING, so this is strictly a
    // refinement of `unattributed` and can never override a real module's attribution. Written as
    // a guard rather than as `syntheticStage(...) ?? stageOf(...)`, which reads the same and is
    // not: that form lets a frame NAMED `(idle)` inside a real module take the whole module's time
    // out of its package's figure, and the module's own test is what caught it.
    const byUrl = stageOf(node.callFrame.url);
    stageById.set(node.id, byUrl === 'unattributed' ? syntheticStage(node.callFrame.functionName) ?? byUrl : byUrl);
  }
  const byStage = { ...ZERO };
  let totalMs = 0;
  for (const [i, id] of profile.samples.entries()) {
    // Microseconds in, milliseconds out — the unit every other timing in the report is in.
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    totalMs += ms;
    // ⚠ A SAMPLE NAMING A NODE THE PROFILE DOES NOT CARRY IS `unattributed`, not dropped. Dropping
    // it would shrink the total and inflate every share taken against it.
    byStage[stageById.get(id) ?? 'unattributed'] += ms;
  }
  return { totalMs, byStage };
}

/** ⚠ IMPORTED RATHER THAN SPELLED. `check:desktop-route-coverage` derives the called-route set from
 *  `api.ts` alone, so an `/api/…` literal anywhere else in frontend source blinds that derivation —
 *  it reds, correctly, rather than reporting a perfect sweep it could not see. */
import { API_PATH_PREFIX } from '../api.js';

/** One network fetch, as `performance.getEntriesByType('resource')` reports it. */
export interface ResourceTiming {
  readonly name: string;
  readonly durationMs: number;
  readonly transferSizeBytes: number;
}

/** What the network cost, split the way the load actually experiences it. */
export interface NetworkSplit {
  readonly storePayloadMs: number;
  readonly storePayloadBytes: number;
  readonly canvasChunkMs: number;
  readonly canvasChunkBytes: number;
  readonly otherMs: number;
  readonly otherBytes: number;
}

/**
 * THE NETWORK HALF — the tree payload the map is built from, against the canvas chunk the land view
 * alone pulls.
 *
 * ⚠ THE TWO ARE SEPARATED BECAUSE ONLY ONE OF THEM IS THE LAND VIEW'S FAULT. The store payload is
 * paid by the ordinary map too; the canvas chunk and the kit are paid only by someone who typed the
 * flag. A single "network" figure would let the land view be blamed for a wait the map already had.
 *
 * ⚠ `durationMs` is WALL CLOCK PER REQUEST AND THEY OVERLAP — the browser fetches in parallel, so
 * these sum to more than the load took. They are reported as what each cost, never as a timeline.
 */
export function networkSplit(entries: readonly ResourceTiming[]): NetworkSplit {
  let storePayloadMs = 0;
  let storePayloadBytes = 0;
  let canvasChunkMs = 0;
  let canvasChunkBytes = 0;
  let otherMs = 0;
  let otherBytes = 0;
  for (const e of entries) {
    if (e.name.includes(API_PATH_PREFIX)) {
      storePayloadMs += e.durationMs;
      storePayloadBytes += e.transferSizeBytes;
    } else if (isCanvasPayload(e.name)) {
      canvasChunkMs += e.durationMs;
      canvasChunkBytes += e.transferSizeBytes;
    } else {
      otherMs += e.durationMs;
      otherBytes += e.transferSizeBytes;
    }
  }
  return { storePayloadMs, storePayloadBytes, canvasChunkMs, canvasChunkBytes, otherMs, otherBytes };
}

/** What only a land-view viewer pays for: the 3D stack and the bought kit's assets. */
function isCanvasPayload(name: string): boolean {
  return (
    name.includes('three') ||
    name.includes('@react-three') ||
    name.includes('drei') ||
    name.includes('forest-world-r3f') ||
    name.endsWith('.glb') ||
    name.endsWith('.gltf')
  );
}

/** What a run of animation frames cost, in the terms "laggy" actually means. */
export interface FrameCost {
  readonly frames: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
  /** Frames a viewer can FEEL — see {@link LATE_FRAME_MS} for why this is not "over 16.667". */
  readonly late: number;
}

/** A 60 Hz frame's budget in milliseconds. Named rather than inlined: the figures below are counts
 *  against this bar, and a bar nobody can find is a bar nobody can argue with. */
export const FRAME_BUDGET_MS = 1000 / 60;

/**
 * WHEN A FRAME IS ACTUALLY LATE — and it is NOT "longer than one budget".
 *
 * ⚠⚠ MEASURED, AND IT MADE AN EARLIER RUN OF THIS INSTRUMENT UNREADABLE. `requestAnimationFrame`
 * reports a healthy 60 Hz frame as **16.7 ms**, which is a hair over the 16.667 budget, so a strict
 * `> FRAME_BUDGET_MS` count called 216 of 360 perfectly on-time frames late — on a page whose median
 * and p95 were both at budget. A count that fires on a healthy run cannot distinguish a laggy one.
 *
 * One and a half budgets is the bar: a frame that late has missed its vsync and the next one, which
 * is the smallest thing a viewer can see.
 */
export const LATE_FRAME_MS = 1.5 * FRAME_BUDGET_MS;

/**
 * FRAME COST FROM raf DELTAS.
 *
 * ⚠ THE MEDIAN AND THE P95 ARE BOTH REPORTED BECAUSE LAG IS A TAIL, NOT A MEAN. A view that draws
 * 58 frames in 16 ms and two in 400 ms has an excellent average and is what a person calls laggy.
 * A mean is deliberately not offered — it is the statistic that hides exactly this.
 *
 * ⚠ IT REFUSES AN EMPTY RUN. Zero frames is not "a perfect frame cost"; it is a measurement that
 * did not happen, and the difference is invisible once it is a number in a table.
 */
export function frameCost(deltasMs: readonly number[]): FrameCost {
  if (deltasMs.length === 0) {
    throw new Error('landViewProfile: no animation frames were observed — the run measured nothing');
  }
  const sorted = [...deltasMs].sort((a, b) => a - b);
  return {
    frames: sorted.length,
    medianMs: quantile(sorted, 0.5),
    p95Ms: quantile(sorted, 0.95),
    worstMs: sorted[sorted.length - 1] ?? 0,
    late: sorted.filter((d) => d > LATE_FRAME_MS).length,
  };
}

/** The value at `q` of an already-sorted list, by nearest rank — no interpolation, so every figure
 *  reported IS a frame that actually happened rather than an average of two that did. */
function quantile(sorted: readonly number[], q: number): number {
  // ⚠ NO CLAMP, AND ITS ABSENCE IS ARITHMETIC RATHER THAN OPTIMISM. For 0 < q <= 1 and a non-empty
  // list, `ceil(q * n) - 1` lies in `[0, n - 1]` by construction — `ceil(q * n) >= 1` gives the
  // lower end and `ceil(q * n) <= n` the upper — so a `min`/`max` pair around it can never change
  // an answer. Both were here, and the mutation rung reported both as survivors: no input
  // separates them from their absence. `frameCost` refuses the empty list before this is reached.
  return sorted[Math.ceil(q * sorted.length) - 1] ?? 0;
}

/** A stage's share of the sampled total, as a percentage. Shares are taken against the WHOLE,
 *  `unattributed` included — see this module's opening note. */
export function shareOf(split: StageSplit, stage: LoadStage): number {
  if (split.totalMs === 0) return 0;
  return ((split.byStage[stage] ?? 0) / split.totalMs) * 100;
}

/**
 * CAN THIS PROFILE'S CPU SPLIT BE REPORTED AT ALL?
 *
 * ⚠⚠ MEASURED, AND IT IS THE REASON THIS FUNCTION EXISTS. Run against a PRODUCTION build the
 * attribution placed **0.0 ms in every real stage** — minified chunk names carry no package path,
 * so every busy sample fell into `unattributed`. The split was not wrong; it was VACUOUS, and it
 * printed a tidy table of zeroes that reads exactly like "no stage costs anything".
 *
 * So a caller asks first. A split that placed almost none of its busy time is withheld with the
 * reason rather than published — the dev arm is where the CPU question can be answered, and the
 * production arm answers the LOAD and FRAME questions instead.
 */
export function cpuSplitIsReportable(split: StageSplit): boolean {
  const busy = busyMs(split);
  if (busy <= 0) return false;
  return (busy - split.byStage.unattributed) / busy >= 0.25;
}

/** The sampled time with WAITING taken out — the denominator "which stage dominates the COMPUTE"
 *  actually wants, offered beside the whole rather than instead of it. Reported, never substituted:
 *  the load's wall clock is the whole, and a share against `busyMs` answers a different question
 *  from a share against `totalMs`. Both appear in the report, each labelled. */
export function busyMs(split: StageSplit): number {
  return split.totalMs - split.byStage.idle;
}

/** The stages, largest first — the answer to "which of these dominates". Ties break by the declared
 *  stage order so the ranking is deterministic across runs. */
export function rankedStages(split: StageSplit): readonly { stage: LoadStage; ms: number; share: number }[] {
  const order = Object.keys(ZERO) as LoadStage[];
  return order
    .map((stage) => ({ stage, ms: split.byStage[stage], share: shareOf(split, stage) }))
    .sort((a, b) => b.ms - a.ms || order.indexOf(a.stage) - order.indexOf(b.stage));
}
