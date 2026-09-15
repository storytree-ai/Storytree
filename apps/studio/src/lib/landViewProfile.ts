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
// ran. In vite dev those paths are the real source paths. A PRODUCTION build's chunks carry none,
// so that arm is attributed through its own source maps ({@link sourceLocator},
// {@link locatorFromSourceMaps}) rather than withheld.
//
// ⚠⚠ CORRECTED 2026-09-15: DEV IS NOT THE HONEST CPU ARM, though the first version of this module
// said it was. Its figures are inflated twice over — vite serves hundreds of unbundled modules, and
// the studio renders under React StrictMode, which runs a component body twice per render in
// development while `LandView` computes its land stream in its body. Dev stays measured because it
// is what the owner ran; the CPU split is read off the production arm, through its maps.
//
// ⚠ NO HAND-WRITTEN LOOP COUNTER AND NO RECURSION, ANYWHERE BELOW. The mutation rung measured both on
// this module's first version: a mutant that stops a `while` index or a recursive walk from making
// progress HANGS rather than failing (the engine it runs under eliminates tail calls, so a runaway
// recursion never overflows), and a hang is scored unproven, not killed. Every walk is a built-in
// iteration over a finite collection, which always ends.
//
// Pure: no DOM, no CDP, no `node:`. The driver (`scripts/measure-land-view.mjs`) collects; this
// decides. Same seam as `cameraRasterisationProbe.ts` beside it.

/**
 * A profile node's call frame, narrowed to what attribution reads. `lineNumber` and `columnNumber`
 * are V8's 0-based position of the FUNCTION's start: enough to name its module through a source
 * map, which is the only thing they are used for here.
 */
export interface CallFrame {
  readonly functionName: string;
  readonly url: string;
  readonly lineNumber?: number;
  readonly columnNumber?: number;
}

/** One node of a V8 CPU profile, as `Profiler.stop` returns it. */
export interface ProfileNode {
  readonly id: number;
  readonly callFrame: CallFrame;
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
  // ⚠ ONE rule for the whole three.js family. `@react-three` contains `three`, so a separate rule for
  // it after this one could never be reached — the mutation rung found it exactly that way.
  { stage: 'three-and-r3f', test: has('three') },
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
 * own time inside one of our packages' figures. No rule matches the empty string, so no guard for it
 * is needed — the one that stood here was an identity the mutation rung could not separate from its
 * absence.
 */
export function stageOf(url: string): LoadStage {
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

/** The stages in their declared order. Every ranking below builds its rows in this order, and
 *  `Array.prototype.sort` is stable, so equal rows keep it without a tie-break. */
const STAGE_ORDER = Object.keys(ZERO) as LoadStage[];

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

/** Maps a call frame to the module url attribution reads. */
export type Locate = (frame: CallFrame) => string;

/**
 * The default {@link Locate}: a frame's own url, which is right wherever module paths survive (vite
 * dev). A production build is handed a source-map-backed one instead, {@link locatorFromSourceMaps}.
 * Exported so the default every split falls through to is tested by name, not only through fakes.
 */
export const ownUrl: Locate = (frame) => frame.url;

/** The row a frame is charged to: its module's readable path and its stage. */
interface FrameKey {
  readonly module: string;
  readonly stage: LoadStage;
}

/** Where every frame with no url, no synthetic name and no node lands — one row, never dropped. */
const UNPLACED: FrameKey = { module: '(unattributed)', stage: 'unattributed' };

/**
 * THE ONE ATTRIBUTION every split below shares, so the stage table, the module table and the run
 * timeline can never disagree about which stage a frame is in.
 *
 * ⚠ THE SYNTHETIC NAME IS CONSULTED ONLY WHEN THE URL PLACES NOTHING, so it is strictly a refinement
 * of `unattributed` and can never override a real module's attribution. Written as a guard rather
 * than as `syntheticStage(...) ?? stageOf(...)`, which reads the same and is not: that form lets a
 * frame NAMED `(idle)` inside a real module take the whole module's time out of its package's
 * figure, and the module's own test is what caught it.
 */
function frameKey(frame: CallFrame, locate: Locate): FrameKey {
  const url = locate(frame);
  const stage = stageOf(url);
  if (stage !== 'unattributed') return { module: moduleOf(url), stage };
  const synthetic = syntheticStage(frame.functionName);
  if (synthetic !== null) return { module: frame.functionName, stage: synthetic };
  return url === '' ? UNPLACED : { module: moduleOf(url), stage };
}

/**
 * ⚠ A MALFORMED PROFILE IS REFUSED rather than reported. `samples` and `timeDeltas` are parallel
 * arrays by construction; a run that lost the end of one would otherwise silently report the prefix
 * as the whole.
 */
function refuseTruncated(profile: CpuProfile): void {
  if (profile.samples.length !== profile.timeDeltas.length) {
    throw new Error(
      `landViewProfile: ${profile.samples.length} sample(s) against ${profile.timeDeltas.length} ` +
        'time delta(s) — the profile is truncated and any split over it would report a prefix as the whole',
    );
  }
}

/** Each node's attribution, resolved once per profile. */
function keysOf(profile: CpuProfile, locate: Locate): Map<number, FrameKey> {
  const keys = new Map<number, FrameKey>();
  for (const node of profile.nodes) keys.set(node.id, frameKey(node.callFrame, locate));
  return keys;
}

/**
 * SELF TIME PER STAGE over a V8 CPU profile.
 *
 * ⚠ SELF TIME, NOT TOTAL TIME, and the difference decides whether the answer is usable. A sample
 * charges the frame it was TAKEN IN, so a stage's figure is the time its own code was executing —
 * which is what "where does the time go" means. Total (inclusive) time would charge React for
 * everything React called, and every stage would read as "React".
 */
export function stageSplit(profile: CpuProfile, locate: Locate = ownUrl): StageSplit {
  refuseTruncated(profile);
  const keys = keysOf(profile, locate);
  const byStage = { ...ZERO };
  let totalMs = 0;
  for (const [i, id] of profile.samples.entries()) {
    // Microseconds in, milliseconds out — the unit every other timing in the report is in.
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    totalMs += ms;
    // ⚠ A SAMPLE NAMING A NODE THE PROFILE DOES NOT CARRY IS `unattributed`, not dropped. Dropping
    // it would shrink the total and inflate every share taken against it.
    byStage[(keys.get(id) ?? UNPLACED).stage] += ms;
  }
  return { totalMs, byStage };
}

/** Several phases' splits as one — stage by stage, and the total with them. */
export function sumSplits(splits: readonly StageSplit[]): StageSplit {
  const byStage = { ...ZERO };
  let totalMs = 0;
  for (const split of splits) {
    totalMs += split.totalMs;
    for (const stage of STAGE_ORDER) byStage[stage] += split.byStage[stage];
  }
  return { totalMs, byStage };
}

/** One stage of what the land view ADDED over the map alone. */
export interface StageDeltaRow {
  readonly stage: LoadStage;
  readonly landMs: number;
  readonly controlMs: number;
  readonly addedMs: number;
}

/**
 * WHAT THE LAND VIEW ADDED, stage by stage, over the same route with the flag off.
 *
 * ⚠ A NEGATIVE ROW IS KEPT NEGATIVE, never clamped to zero. Two page loads are two runs, and a stage
 * that came in cheaper on the land arm is noise or a real saving — either way a clamp would hide it
 * and make every other row look more certain than the pair of runs can make it.
 */
export function stageDelta(land: StageSplit, control: StageSplit): readonly StageDeltaRow[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    landMs: land.byStage[stage],
    controlMs: control.byStage[stage],
    addedMs: land.byStage[stage] - control.byStage[stage],
  })).sort((a, b) => b.addedMs - a.addedMs);
}

/**
 * A MODULE URL AS A PATH A READER CAN FIND IN THE REPO, whichever way the server reached it.
 *
 * A dev server hands out `/@fs/<absolute path>`, app-relative `/src/…` and `/node_modules/.vite/deps/…`;
 * a production source map hands out `../../packages/…` relative to its chunk. The capability that
 * owns a file is looked up by its repo path, so every form is folded to one: a workspace package by
 * `packages/<name>/…` (its symlink under `node_modules/@storytree/` included), a dependency by
 * `node_modules/<name>/…` past pnpm's store, and anything else by its path with the server's prefix
 * taken off.
 */
export function moduleOf(url: string): string {
  // ⚠ STRING OPERATIONS AND `!== -1`, NOT ANCHORED REGEXES AND `>= 0`. Both of those spellings carry
  // mutants no input can tell apart — an anchor dropped from a pattern that only ever matches at the
  // start, a `>= 0` whose zero case the fallback already answers identically — and a mutant nothing
  // can kill is a permanent red on the mutation rung, not a gap a test can close.
  const path = (URL.canParse(url) ? new URL(url).pathname : url).replaceAll('\\', '/');
  const underModules = path.lastIndexOf('node_modules/');
  if (underModules !== -1) {
    const rest = path.slice(underModules + 'node_modules/'.length);
    return rest.startsWith('@storytree/') ? `packages/${rest.slice('@storytree/'.length)}` : `node_modules/${rest}`;
  }
  const workspace = Math.max(path.lastIndexOf('packages/'), path.lastIndexOf('apps/'));
  return workspace === -1 ? servedPath(path) : path.slice(workspace);
}

/** A path with no workspace anchor, with what a server or a map puts in front of it taken off — `../`
 *  hops, leading slashes, and vite's `/@fs/` prefix. By path segment rather than by a loop or a
 *  recursion: see this module's opening note on why neither may appear here. */
function servedPath(path: string): string {
  const parts = path.split('/');
  const rest = parts.slice(parts.findIndex((part) => part !== '' && part !== '..'));
  return (rest[0] === '@fs' ? rest.slice(1) : rest).join('/');
}

/** One file's self time. */
export interface ModuleRow {
  readonly module: string;
  readonly stage: LoadStage;
  readonly ms: number;
}

/** The files the time is in, largest first, with what the table did not list summed beside it. */
export interface ModuleSplit {
  readonly totalMs: number;
  readonly rows: readonly ModuleRow[];
  readonly restMs: number;
  readonly restModules: number;
}

/**
 * SELF TIME PER FILE — the table that names a capability lane.
 *
 * ⚠ A STAGE IS TOO COARSE TO CHOOSE A CURE BY. `land-stream` spans the scene model, the delivery
 * canvas and the land surface — three capabilities with three owners — so the successor increment
 * cannot claim "the land stream"; it has to claim the files. This is that list.
 *
 * ⚠ THE ROWS PLUS THE REST SUM TO THE TOTAL, the same closure `stageSplit` keeps: a top-N table that
 * quietly drops its tail would read as the whole.
 */
export function moduleSplit(profile: CpuProfile, limit: number, locate: Locate = ownUrl): ModuleSplit {
  refuseTruncated(profile);
  const keys = keysOf(profile, locate);
  const byModule = new Map<string, { module: string; stage: LoadStage; ms: number }>();
  let totalMs = 0;
  for (const [i, id] of profile.samples.entries()) {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    totalMs += ms;
    const key = keys.get(id) ?? UNPLACED;
    const row = byModule.get(key.module);
    if (row === undefined) byModule.set(key.module, { module: key.module, stage: key.stage, ms });
    else row.ms += ms;
  }
  // The rows arrive in the order the samples first named each file, so here a tie-break is needed.
  const ranked = [...byModule.values()].sort((a, b) => b.ms - a.ms || a.module.localeCompare(b.module));
  const rest = ranked.slice(limit);
  return {
    totalMs,
    rows: ranked.slice(0, limit),
    restMs: rest.reduce((sum, row) => sum + row.ms, 0),
    restModules: rest.length,
  };
}

/** A source map, narrowed to what naming a frame's module needs. Vite emits no `sourceRoot`. */
export interface SourceMapV3 {
  readonly sources: readonly (string | null)[];
  readonly mappings: string;
}

/** Which source a generated position belongs to, or `null` where the map places nothing. Both
 *  coordinates 0-based, as V8 reports them. */
export type SourceLocator = (line: number, column: number) => string | null;

/** The segments of one generated line: each one's start column and source index (-1: no source). */
interface MappedLine {
  readonly columns: readonly number[];
  readonly sources: readonly number[];
}

/**
 * A SOURCE MAP'S `mappings`, decoded to answer one question: which source does this column belong to.
 *
 * Hand-rolled rather than imported: the studio resolves no source-map library, and the question is
 * the smallest one the v3 format answers. Lines are separated by `;` and segments by `,`; each segment
 * is base64 VLQ with the sign in the lowest bit; the generated column resets on every line while the
 * source index carries across lines; a segment of one field maps to no source.
 *
 * ⚠ A CORRUPT STRING IS REFUSED rather than decoded into plausible columns — a locator that silently
 * mis-names files would put the land stream's time in somebody else's package, which is the failure
 * this whole module is built against.
 *
 * ⚠ THE COLUMN IS FOUND BY A SCAN, NOT A SEARCH, because a hand-written search is a loop whose mutants
 * hang (this module's opening note). A production chunk's line can hold a hundred thousand segments,
 * so the driver memoises what it asks; a test's lines hold a handful.
 */
export function sourceLocator(map: SourceMapV3): SourceLocator {
  // Built per map rather than at module load: a table built once at import is a mutant the rung's
  // runner cannot reach, and it reported both halves of the old one as survivors.
  const digits = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((char, value) => [char, value]));
  let source = 0;
  const lines: readonly MappedLine[] = map.mappings.split(';').map((text) => {
    const columns: number[] = [];
    const sources: number[] = [];
    let column = 0;
    for (const segment of text.split(',')) {
      const fields = vlqFields(segment, digits);
      if (fields.length === 0) continue;
      column += fields[0] ?? 0;
      columns.push(column);
      if (fields.length >= 4) {
        source += fields[1] ?? 0;
        sources.push(source);
      } else {
        sources.push(-1);
      }
    }
    return { columns, sources };
  });
  return (line, at) => {
    const segments = lines[line];
    if (segments === undefined) return null;
    // -1 (no segment at or before the column, or a segment with no source) indexes nothing, so it
    // reads as null without a branch of its own.
    const index = segments.sources[segments.columns.findLastIndex((column) => column <= at)] ?? -1;
    return map.sources[index] ?? null;
  };
}

/** One segment's fields: base64 VLQ, five value bits per digit, the sixth bit a continuation, the sign
 *  in the lowest bit of the assembled value. Refuses a character outside the alphabet, and a value
 *  whose last digit still asked for another. */
function vlqFields(segment: string, digits: ReadonlyMap<string, number>): number[] {
  const fields: number[] = [];
  let value = 0;
  let shift = 0;
  for (const [at, char] of [...segment].entries()) {
    const digit = digits.get(char) ?? -1;
    if (digit < 0) {
      throw new Error(
        `landViewProfile: a source map segment "${segment}" is not base64 VLQ at character ${at} — refusing to name modules off a corrupt map`,
      );
    }
    value += (digit % 32) * 2 ** shift;
    if (digit < 32) {
      fields.push(value % 2 === 1 ? -(value - 1) / 2 : value / 2);
      value = 0;
      shift = 0;
    } else {
      shift += 5;
    }
  }
  if (shift !== 0) {
    throw new Error(
      `landViewProfile: a source map segment "${segment}" ends in the middle of a value — refusing to name modules off a corrupt map`,
    );
  }
  return fields;
}

/**
 * A {@link Locate} that names a production frame's module through its chunk's source map.
 *
 * A source is resolved against the chunk's own url — maps sit beside their chunks, so the two share
 * a base — and wherever the map cannot answer (no map for that chunk, no position on the frame, a
 * column before the first segment) the frame keeps its own url, which the stage rules then treat
 * exactly as they would have without a map.
 */
export function locatorFromSourceMaps(maps: ReadonlyMap<string, SourceLocator>): Locate {
  return (frame) => {
    const locate = maps.get(frame.url);
    // ⚠ NO GUARD FOR A MISSING POSITION. -1 names no line and no column, so the locator answers null by
    // its own arithmetic — and a guard in front of it would be a branch no input can separate from its
    // absence, which the mutation rung reports as a survivor for ever.
    const source = locate === undefined ? null : locate(frame.lineNumber ?? -1, frame.columnNumber ?? -1);
    return source === null ? frame.url : new URL(source, frame.url).href;
  };
}

/** One contiguous run of a stage's work on the profile's clock. */
export interface Burst {
  readonly startMs: number;
  readonly endMs: number;
  /** The member stage's own self time inside the run — never the run's wall span. */
  readonly memberMs: number;
}

/** How runs are told apart. */
export interface BurstOptions {
  /** Two member samples this close (ms) are one run. */
  readonly mergeGapMs: number;
  /** A run with less member time than this (ms) is dropped: a stray sample is not a rebuild. */
  readonly minMemberMs: number;
}

/**
 * WHEN THE WORK HAPPENED, not only how much of it there was.
 *
 * ⚠⚠ THE QUESTION A TOTAL CANNOT ANSWER. Seven seconds of land-stream time is one slow build or
 * seven fast ones, and those have opposite cures — the first wants the build made cheaper, the
 * second wants it to stop happening. The run timeline is what showed the land view rebuilding its
 * whole ground on every studio re-render (2026-09-15).
 *
 * Times are milliseconds from the profile's own start. A sample is charged the interval that ENDS
 * at it, as `stageSplit` charges it.
 */
export function bursts(
  profile: CpuProfile,
  member: (stage: LoadStage) => boolean,
  options: BurstOptions,
  locate: Locate = ownUrl,
): readonly Burst[] {
  refuseTruncated(profile);
  const keys = keysOf(profile, locate);
  const runs: { startMs: number; endMs: number; memberMs: number }[] = [];
  let t = 0;
  for (const [i, id] of profile.samples.entries()) {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000;
    t += ms;
    if (!member((keys.get(id) ?? UNPLACED).stage)) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && t - ms - last.endMs <= options.mergeGapMs) {
      last.endMs = t;
      last.memberMs += ms;
    } else {
      runs.push({ startMs: t - ms, endMs: t, memberMs: ms });
    }
  }
  // ⚠ WRITTEN AS "NOT UNDER THE FLOOR" rather than "at or over it". The two agree on every real run,
  // and differ on an entry with no member time at all — which `>=` would quietly drop and this keeps
  // where a test can see it, so nothing can hide in the list's starting contents.
  return runs.filter((run) => !(run.memberMs < options.minMemberMs));
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

/** A group of late frames that arrived together. */
export interface LateCluster {
  /** When the first late frame of the group began, ms from the first frame of the window. */
  readonly atMs: number;
  readonly frames: number;
  readonly worstMs: number;
  /** From the first late frame's start to the last one's end. */
  readonly spanMs: number;
}

/**
 * WHEN THE LATE FRAMES CAME, grouped.
 *
 * ⚠ A LATE COUNT CANNOT SAY WHETHER LAG IS A CONSTANT DRAG OR A PERIODIC STALL, and those point at
 * different causes: the first is the steady frame, the second is something that recurs — a poll, a
 * clock tick, a rebuild. Nine late frames spread evenly and nine arriving together every thirty
 * seconds read identically as `late: 9`; this is what tells them apart.
 */
export function lateFrameClusters(deltasMs: readonly number[], gapMs: number): readonly LateCluster[] {
  const clusters: { atMs: number; endMs: number; frames: number; worstMs: number }[] = [];
  let t = 0;
  for (const delta of deltasMs) {
    const start = t;
    t += delta;
    if (delta <= LATE_FRAME_MS) continue;
    const last = clusters[clusters.length - 1];
    if (last !== undefined && start - last.endMs <= gapMs) {
      last.frames += 1;
      last.worstMs = Math.max(last.worstMs, delta);
      last.endMs = t;
    } else {
      clusters.push({ atMs: start, endMs: t, frames: 1, worstMs: delta });
    }
  }
  return clusters.map(({ atMs, endMs, frames, worstMs }) => ({ atMs, frames, worstMs, spanMs: endMs - atMs }));
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
 * reason rather than published. Handed the build's own source maps
 * ({@link locatorFromSourceMaps}), the same production samples place, and the split is reportable.
 */
export function cpuSplitIsReportable(split: StageSplit): boolean {
  // No guard for a split that was never busy: its share is 0/0, which is NaN, and NaN compares false
  // — the same answer a guard gives, which is why the rung reported the guard that stood here.
  const busy = busyMs(split);
  return (busy - split.byStage.unattributed) / busy >= 0.25;
}

/** The sampled time with WAITING taken out — the denominator "which stage dominates the COMPUTE"
 *  actually wants, offered beside the whole rather than instead of it. Reported, never substituted:
 *  the load's wall clock is the whole, and a share against `busyMs` answers a different question
 *  from a share against `totalMs`. Both appear in the report, each labelled. */
export function busyMs(split: StageSplit): number {
  return split.totalMs - split.byStage.idle;
}

/** The stages, largest first — the answer to "which of these dominates". The rows are built in the
 *  declared stage order and the sort is stable, so ties keep that order across runs. */
export function rankedStages(split: StageSplit): readonly { stage: LoadStage; ms: number; share: number }[] {
  return STAGE_ORDER.map((stage) => ({ stage, ms: split.byStage[stage], share: shareOf(split, stage) })).sort(
    (a, b) => b.ms - a.ms,
  );
}

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
 * ⚠ WHICH FETCHES ARE THE STORE PAYLOAD IS A PARAMETER, NOT A PATH WRITTEN HERE.
 * `check:desktop-route-coverage` derives the studio's called routes from its one API client, and it
 * refuses a path literal starting with the API prefix anywhere else in the frontend trees — and a bare
 * prefix inside the client too — because either would blind that derivation. The driver, which is not
 * frontend source, supplies the rule.
 *
 * ⚠ `durationMs` is WALL CLOCK PER REQUEST AND THEY OVERLAP — the browser fetches in parallel, so
 * these sum to more than the load took. They are reported as what each cost, never as a timeline.
 */
export function networkSplit(
  entries: readonly ResourceTiming[],
  isStorePayload: (name: string) => boolean,
): NetworkSplit {
  let storePayloadMs = 0;
  let storePayloadBytes = 0;
  let canvasChunkMs = 0;
  let canvasChunkBytes = 0;
  let otherMs = 0;
  let otherBytes = 0;
  for (const e of entries) {
    if (isStorePayload(e.name)) {
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

/** What only a land-view viewer pays for: the 3D stack and the bought kit's assets.
 *
 *  ⚠ A BUILT CHUNK IS NAMED FOR ITS ENTRY MODULE, NOT ITS PACKAGE. The first production run on the RTX
 *  box counted the lazy canvas chunk (`ForestWorldCanvas-<hash>.js`, 3.48 MB) and the kit chunk
 *  (`kit-<hash>.js`, 1.11 MB) as "everything else" and reported the land view's own payload as zero. */
function isCanvasPayload(name: string): boolean {
  return (
    name.includes('/ForestWorldCanvas-') ||
    name.includes('/kit-') ||
    name.includes('three') ||
    name.includes('@react-three') ||
    name.includes('drei') ||
    name.includes('forest-world-r3f') ||
    name.endsWith('.glb') ||
    name.endsWith('.gltf')
  );
}
