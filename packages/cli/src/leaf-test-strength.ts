/**
 * LEAF-TEST STRENGTH: resolving which tests a leaf actually authored under a signed red→green, and
 * scoring how strong they are (`verdict-accuracy-arc` increment 1).
 *
 * THE QUESTION. When the leaf writes a test and the spine accepts the red→green it produces, is
 * that test actually STRONG — would it catch a fault, or does it merely execute the code? A signed
 * green attests that a test went red and then green over an observed span. It does not attest that
 * the test would have noticed a DIFFERENT wrong answer.
 *
 * THE BULK OF THE WORK IS THE POPULATION, NOT THE MUTATION RUN, and this module is the population
 * half. A verdict row names a `unitId`, a `runId` and a `commitSha`; it does NOT name a file. The
 * ADR-0016 binding anchor (`boundHash`) that would name the proved SPAN is optional on the schema
 * and — measured 2026-09-05 — is carried by ZERO of the 665 stored verdicts, so a reader keying off
 * its presence resolves nothing through it. That is a finding, not a defect in this reader: the
 * count of verdicts dropped for want of one is reported rather than silently absorbed.
 *
 * SO THE RESOLUTION RUNS THROUGH THE SPEC, and its weaker binding is stated rather than hidden. A
 * `--real` build resolves its node's own `proof:` block, whose `real:` arm declares exactly
 * `testFile` (what AUTHOR_TEST may write) and `sourceFile` (what IMPLEMENT may write). Those two
 * paths ARE the leaf's authoring surface for that build — the phase machine's write walls are built
 * from them — so resolving unitId → spec → real arm names the pair the leaf wrote, at FILE grain
 * rather than span grain.
 *
 * WHAT THAT COSTS, NAMED. File grain cannot tell the leaf's own bytes from later edits by other
 * sessions to the same file, and a re-proof of the same unit re-uses the same pair. Both are
 * reported ({@link PairScore.testChangedSinceProof} is filled by the caller from git) rather than
 * assumed away — the reading is about the file the leaf was scoped to author, as it stands now.
 *
 * NOT A GATE RUNG AND NOT A THRESHOLD (the arc's "measure first, decide never"). Nothing here
 * blocks anything, nothing here reads a percentage as a bar, and the caller is a `run` script that
 * prints a report. `check:mutation-diff` answers a DIFFERENT question — what a BRANCH changed —
 * and is untouched.
 */

/**
 * One stored verdict, reduced to what population resolution reads. Field-for-field the queryable
 * spine of `events.verdict` plus the two doc fields that decide inclusion.
 */
export interface StoredVerdict {
  readonly seq: number;
  readonly unitId: string;
  readonly runId: string;
  readonly proofMode: string;
  readonly outcome: string;
  readonly commitSha: string;
  readonly at: string;
  /**
   * ADR-0016's binding anchor, when the producer stamped one. OPTIONAL on the schema, so a reader
   * keys off its PRESENCE and never its absence — an absent hash means "this verdict does not say
   * which bytes it proved", never "the bytes are unchanged".
   */
  readonly boundHash?: string | undefined;
  /** The `kind` of every evidence ref on the verdict, in stored order. */
  readonly evidenceKinds: readonly string[];
}

/** The leaf's authoring surface for one unit, as its spec's `real:` arm declares it. */
export interface LeafPair {
  readonly unitId: string;
  /** Repo-relative test file — the ONLY file AUTHOR_TEST may write. */
  readonly testFile: string;
  /** Repo-relative implementation file named in the leaf brief. */
  readonly sourceFile: string;
  /**
   * Whether the arm declares its own `proofCommand`. TRUE means the spine's green was a WHOLE
   * SUITE, not this one file — so a weak per-file score there is a statement about the authored
   * test alone and not about what the spine actually observed. Reported, never folded into a score.
   */
  readonly suiteOracle: boolean;
  /** `editsExisting` — the leaf edited source that already existed, rather than authoring net-new. */
  readonly editsExisting: boolean;
  /** `refactorForTests` (ADR-0098 R2) — a behaviour-preserving refactor behind a new seam. */
  readonly refactorForTests: boolean;
}

/** What a spec lookup can find for a unit id. Every miss is a NAMED state, never a null. */
export type SpecLookup =
  | { readonly kind: "real"; readonly pair: LeafPair }
  | { readonly kind: "no-real-arm" }
  | { readonly kind: "no-proof-config" }
  | { readonly kind: "spec-missing" };

/**
 * Why a stored verdict is not in the scored population. Every reason is reported with its count,
 * INCLUDING the zeroes — a bucket that is absent from the output and a bucket that is empty are
 * different claims, and only one of them is a measurement.
 */
export type ExclusionReason =
  | "not-a-pass"
  | "no-observed-red"
  | "spec-missing"
  | "no-proof-config"
  | "no-real-arm";

export const EXCLUSION_REASONS: readonly ExclusionReason[] = [
  "not-a-pass",
  "no-observed-red",
  "spec-missing",
  "no-proof-config",
  "no-real-arm",
];

/** How one verdict was accounted for. */
export type VerdictResolution =
  | { readonly kind: "included"; readonly verdict: StoredVerdict; readonly pair: LeafPair }
  | { readonly kind: "excluded"; readonly verdict: StoredVerdict; readonly reason: ExclusionReason };

/** The population reading, with every denominator it needs to be read honestly. */
export interface PopulationReport {
  /** Every verdict offered to the reader. The outermost denominator. */
  readonly verdictsSeen: number;
  /** How many of those carried an ADR-0016 `boundHash`. A finding in its own right. */
  readonly verdictsWithBoundHash: number;
  /** Per-verdict accounting, in the order the verdicts were offered. */
  readonly resolutions: readonly VerdictResolution[];
  /** Counts per exclusion reason — always all five keys, zeroes included. */
  readonly excluded: Readonly<Record<ExclusionReason, number>>;
  /** Verdicts that resolved to a leaf pair. */
  readonly verdictsIncluded: number;
  /**
   * The DEDUPED pairs, one per unit id, ordered by unit id. This is the population that gets
   * mutated: a unit re-proved four times contributes one test file, not four.
   */
  readonly pairs: readonly LeafPair[];
  /** How many verdicts each surviving unit contributed (its re-proof count), keyed by unit id. */
  readonly proofsPerUnit: Readonly<Record<string, number>>;
}

/** Did the spine observe a RED for this verdict — i.e. is it a red→green proof at all? */
export function hasObservedRed(verdict: Pick<StoredVerdict, "evidenceKinds">): boolean {
  return verdict.evidenceKinds.includes("observation:red");
}

/** Does this verdict carry ADR-0016's binding anchor? Keyed off PRESENCE, never absence. */
export function hasBoundHash(verdict: Pick<StoredVerdict, "boundHash">): boolean {
  return verdict.boundHash !== undefined && verdict.boundHash !== "";
}

/**
 * Classify ONE verdict. Order is load-bearing and runs most-fundamental first: a failed verdict says
 * nothing about test strength however well its spec resolves, and a verdict with no observed red is
 * not a leaf red→green at all however green it is.
 */
export function classifyVerdict(
  verdict: StoredVerdict,
  lookup: (unitId: string) => SpecLookup,
): VerdictResolution {
  if (verdict.outcome !== "pass") {
    return { kind: "excluded", verdict, reason: "not-a-pass" };
  }
  if (!hasObservedRed(verdict)) {
    return { kind: "excluded", verdict, reason: "no-observed-red" };
  }
  const found = lookup(verdict.unitId);
  if (found.kind === "real") {
    return { kind: "included", verdict, pair: found.pair };
  }
  return { kind: "excluded", verdict, reason: found.kind };
}

/** Resolve a whole verdict stream into the population that can be mutation-scored. */
export function resolvePopulation(
  verdicts: readonly StoredVerdict[],
  lookup: (unitId: string) => SpecLookup,
): PopulationReport {
  const resolutions = verdicts.map((v) => classifyVerdict(v, lookup));
  const excluded = {
    "not-a-pass": 0,
    "no-observed-red": 0,
    "spec-missing": 0,
    "no-proof-config": 0,
    "no-real-arm": 0,
  } satisfies Record<ExclusionReason, number>;
  const byUnit = new Map<string, LeafPair>();
  const proofs: Record<string, number> = {};
  let included = 0;
  for (const r of resolutions) {
    if (r.kind === "excluded") {
      excluded[r.reason] += 1;
      continue;
    }
    included += 1;
    byUnit.set(r.pair.unitId, r.pair);
    proofs[r.pair.unitId] = (proofs[r.pair.unitId] ?? 0) + 1;
  }
  return {
    verdictsSeen: verdicts.length,
    verdictsWithBoundHash: verdicts.filter(hasBoundHash).length,
    resolutions,
    excluded,
    verdictsIncluded: included,
    pairs: [...byUnit.values()].sort((a, b) => a.unitId.localeCompare(b.unitId)),
    proofsPerUnit: proofs,
  };
}

/**
 * The `real:` arm fields this reader needs, structurally — deliberately NOT `RealProofConfig`
 * itself. Typing the seam structurally is what keeps this module importable by a test that has no
 * orchestrator fixture to hand, and it is the whole reason the disk half can live in the runner.
 */
export interface RealArmView {
  readonly testFile: string;
  readonly sourceFile: string;
  readonly proofCommand?: unknown;
  readonly editsExisting?: boolean | undefined;
  readonly refactorForTests?: boolean | undefined;
}

/**
 * Map one unit's resolved build config onto a {@link SpecLookup}. Pure, so the three failure states
 * are testable without a stories tree: `null` config means the spec carried no `proof:` block and
 * the registry had no entry; a config with no `real` arm is dry-run/live-smoke buildable only, and
 * names no authored file pair.
 */
export function lookupFromResolved(
  unitId: string,
  resolved: { readonly real?: RealArmView | undefined } | null,
  specFound: boolean,
): SpecLookup {
  if (!specFound) return { kind: "spec-missing" };
  if (resolved === null) return { kind: "no-proof-config" };
  const real = resolved.real;
  if (real === undefined) return { kind: "no-real-arm" };
  return {
    kind: "real",
    pair: {
      unitId,
      testFile: real.testFile,
      sourceFile: real.sourceFile,
      suiteOracle: real.proofCommand !== undefined,
      editsExisting: real.editsExisting === true,
      refactorForTests: real.refactorForTests === true,
    },
  };
}

/**
 * The Stryker config for ONE pair — mutate exactly the leaf's source file, run exactly the leaf's
 * test file.
 *
 * ISOLATION IS THE MEASUREMENT, not an optimisation. Running the whole package suite would credit
 * the leaf's test with kills made by every other test in the package, which is the opposite of the
 * question. With one test file in `bun.testFiles`, every `Killed` was killed by the authored test
 * and no `killedBy` attribution is needed to say so.
 *
 * The three settings that are NOT preferences, each carried over from `check:mutation-diff` where
 * they were established beside the failure they prevent:
 *   - `bunArgs: ["--timeout", "300000"]` — the plugin spawns `bun test` itself from the sandbox
 *     root, inheriting no package script, so without this the suite meets bun's 5 s per-test
 *     default instead of the 300 s ceiling every bun package declares, and killed mutants come back
 *     as timeouts.
 *   - `tsconfigFile` pointing at a path that does not exist — typescript@7 exports no compiler API
 *     (ADR-0400 D3), so Stryker's tsconfig preprocessor throws if it finds a real one.
 *   - `coverageAnalysis: "off"` — with ONE test file there is nothing to attribute between, and
 *     perTest coverage would only add a dry-run cost this reading never spends.
 */
export type RunnerChoice =
  | { readonly kind: "bun" }
  /** `configFile` is the repo-relative path of the narrowed vitest config for this pair. */
  | { readonly kind: "vitest"; readonly configFile: string };

/**
 * The narrowed vitest config for one pair — the analogue of the bun runner's `testFiles`.
 *
 * It EXTENDS the project's own config rather than restating it, for the reason
 * `check:mutation-diff` established: `apps/studio`'s config carries a React plugin and setup files
 * its suites need, and a config that restated only `include` would drop them and fail every test
 * for reasons that have nothing to do with the mutant.
 */
export function vitestConfigBody(testFileRelativeToProject: string): string {
  return [
    `// GENERATED by leaf-test-strength.run.ts for one leaf pair — do not commit, do not edit.`,
    `import { fileURLToPath } from 'node:url';`,
    ``,
    `import base from './vitest.config.js';`,
    ``,
    `const root = fileURLToPath(new URL('.', import.meta.url));`,
    ``,
    `if (typeof base === 'function') {`,
    `  throw new Error('leaf-test-strength cannot narrow a function-form vitest config.');`,
    `}`,
    ``,
    `export default {`,
    `  ...base,`,
    `  root,`,
    `  test: { ...(base.test ?? {}), root, include: ${JSON.stringify([testFileRelativeToProject])} },`,
    `};`,
    ``,
  ].join("\n");
}
export function strykerConfigBody(
  pair: Pick<LeafPair, "sourceFile" | "testFile">,
  reportFile: string,
  concurrency: number,
  runner: RunnerChoice,
): string {
  const head =
    runner.kind === "bun"
      ? [
          `  testRunner: "bun",`,
          `  plugins: ["@hughescr/stryker-bun-runner"],`,
          `  bun: {`,
          `    testFiles: ${JSON.stringify([pair.testFile])},`,
          `    bunArgs: ["--timeout", "300000"],`,
          `    timeout: 180000,`,
          `  },`,
        ]
      : [
          `  testRunner: "vitest",`,
          `  plugins: ["@stryker-mutator/vitest-runner"],`,
          // `related: false` is REQUIRED, not a preference: with Stryker's default the runner asks
          // vitest `--related <mutated files>` using repo-root-relative paths while the project's
          // vitest root is the project dir, so vitest matches NOTHING and the dry run aborts with
          // "No tests were found". The narrowing that replaces it is the generated config's own
          // `include`, which is this pair's one test file.
          `  vitest: { configFile: ${JSON.stringify(runner.configFile)}, related: false },`,
        ];
  return [
    `// GENERATED by leaf-test-strength.run.ts for one leaf pair — do not commit, do not edit.`,
    `export default {`,
    ...head,
    `  coverageAnalysis: "off",`,
    `  disableBail: true,`,
    `  mutate: ${JSON.stringify([pair.sourceFile])},`,
    `  reporters: ["json"],`,
    `  jsonReporter: { fileName: ${JSON.stringify(reportFile)} },`,
    `  concurrency: ${concurrency},`,
    `  timeoutFactor: 6,`,
    `  timeoutMS: 120000,`,
    `  tempDirName: ".stryker-tmp",`,
    `  tsconfigFile: "stryker-no-tsconfig.json",`,
    `};`,
    ``,
  ].join("\n");
}

/** The mutation-testing-report-schema v1.0 subset this reader needs. */
export interface MutationReportShape {
  readonly files?: Readonly<
    Record<string, { readonly mutants?: readonly { readonly status?: string }[] } | undefined>
  >;
}

/**
 * Pull every mutant status out of a Stryker JSON report.
 *
 * READS EVERY FILE IN THE REPORT RATHER THAN LOOKING ONE UP BY PATH, deliberately: Stryker keys
 * `files` by whatever path form it resolved, which is not guaranteed to equal the repo-relative
 * string this reader handed it, and a path lookup that misses would return an empty list —
 * indistinguishable from "no mutants", which is the one absence this reading must never fake. The
 * config already restricts `mutate` to exactly one file, so every entry present IS that file's.
 */
export function statusesFromReport(report: MutationReportShape): string[] {
  const out: string[] = [];
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file?.mutants ?? []) {
      out.push(mutant.status ?? "");
    }
  }
  return out;
}

/** Per-status mutant counts for ONE scored pair. */
export interface MutantTally {
  readonly killed: number;
  readonly survived: number;
  readonly timeout: number;
  readonly noCoverage: number;
  /** Statuses that say nothing about the test — compile errors, runtime errors, ignored mutants. */
  readonly excluded: number;
}

/** Tally one pair's mutants by status. Unknown statuses count as `excluded`, never as a pass. */
export function tallyMutants(statuses: readonly string[]): MutantTally {
  let killed = 0;
  let survived = 0;
  let timeout = 0;
  let noCoverage = 0;
  let excluded = 0;
  for (const status of statuses) {
    if (status === "Killed") killed += 1;
    else if (status === "Survived") survived += 1;
    else if (status === "Timeout") timeout += 1;
    else if (status === "NoCoverage") noCoverage += 1;
    else excluded += 1;
  }
  return { killed, survived, timeout, noCoverage, excluded };
}

/**
 * The score for one pair, and the denominator it is a fraction OF.
 *
 * A TIMEOUT IS NOT A KILL HERE, and that is a deliberate departure from Stryker's own headline
 * figure, which credits one. This repo's own rung already refuses that credit — `check:mutation-diff`
 * maps every Timeout to `unproven`, "the suite hung rather than asserting… this cannot be credited
 * to the branch's own tests" — and a reading that silently disagreed with the rung beside it would
 * be the harder number to trust. Timeouts stay VISIBLE in the tally so a reader can recompute the
 * lenient figure if they want it.
 *
 * `undefined` when the denominator is zero: no mutant was generated at all, so there is no score.
 * That is an ABSENCE and it must not arrive at a reader as a 0%.
 */
export interface ScoredTally {
  /** `undefined` when the denominator is zero — an ABSENCE, never a 0%. */
  readonly score: number | undefined;
  readonly denominator: number;
}

export function scorePair(tally: MutantTally): ScoredTally {
  const denominator = tally.killed + tally.survived + tally.timeout + tally.noCoverage;
  if (denominator === 0) return { score: undefined, denominator: 0 };
  return { score: tally.killed / denominator, denominator };
}

/**
 * The same reading over only the mutants the test ACTUALLY EXECUTES — Stryker's "mutation score
 * based on covered code", and the figure that separates a weak test from an absent one.
 *
 * WHY BOTH FIGURES ARE NEEDED, measured 2026-09-05. The pair `arc-explicit-id-fidelity` declares
 * `packages/cli/src/cli.test.ts` against `packages/arc/src/arc.ts` — a test in ANOTHER package that
 * exercises the CLI out of process. Its whole-file score is 0.0% over 2553 mutants, which reads as
 * a catastrophically weak test; the tally says `NoCoverage: 2549`, i.e. the test never reaches 2549
 * of them at all, and of the 4 it does reach it kills none. Those are completely different claims,
 * and only the second is about test STRENGTH — the first is about what the declared pair even
 * exercises. Pooling them into one percentage would let an unreachable file drag a corpus-wide
 * figure down and read as evidence about tests.
 *
 * `undefined` when the test reaches nothing at all: there is no strength reading to give, and a 0%
 * would be the same lie in miniature.
 */
export function coveredScorePair(tally: MutantTally): ScoredTally {
  const denominator = tally.killed + tally.survived + tally.timeout;
  if (denominator === 0) return { score: undefined, denominator: 0 };
  return { score: tally.killed / denominator, denominator };
}

/**
 * What fraction of this file's mutants the test executes at all. `undefined` when no mutant was
 * generated. Low reach is an INSTRUMENT statement (this pair's test does not exercise this source
 * in-process), never a statement about the test's quality — the same distinction
 * `check:mutation-diff` draws when it refuses to score an `unproven` mutant either way.
 */
export function reach(tally: MutantTally): number | undefined {
  const total = tally.killed + tally.survived + tally.timeout + tally.noCoverage;
  if (total === 0) return undefined;
  return (tally.killed + tally.survived + tally.timeout) / total;
}

/** One pair's finished reading. */
export interface PairScore {
  readonly pair: LeafPair;
  readonly tally: MutantTally;
  readonly score: number | undefined;
  readonly denominator: number;
  /**
   * Whether the test file has been touched since the verdict that admitted this pair. `undefined`
   * means the caller could not establish it (no git, an unborn path) — which is a third state and
   * never a synonym for "unchanged".
   */
  readonly testChangedSinceProof: boolean | undefined;
}

/**
 * The aggregate over scored pairs — POOLED, and the mean beside it.
 *
 * Pooling is the honest headline because pairs carry wildly different mutant counts (a 6-mutant
 * helper and a 200-mutant renderer are both one pair), so a mean of per-pair percentages would
 * weight the helper equally with the renderer. Both figures are returned so the difference between
 * them is visible rather than a choice hidden in a headline.
 */
export interface Aggregate {
  readonly pairs: number;
  readonly pairsWithMutants: number;
  readonly totals: MutantTally;
  /** killed / (killed + survived + timeout + noCoverage) — the whole-file figure. */
  readonly pooledScore: number | undefined;
  /** killed / (killed + survived + timeout) — over the mutants the tests actually execute. */
  readonly pooledCoveredScore: number | undefined;
  /** What fraction of all mutants the tests execute. An instrument figure, not a quality one. */
  readonly pooledReach: number | undefined;
  readonly meanOfPairScores: number | undefined;
}

export function aggregate(scored: readonly PairScore[]): Aggregate {
  const totals = scored.reduce<MutantTally>(
    (acc, s) => ({
      killed: acc.killed + s.tally.killed,
      survived: acc.survived + s.tally.survived,
      timeout: acc.timeout + s.tally.timeout,
      noCoverage: acc.noCoverage + s.tally.noCoverage,
      excluded: acc.excluded + s.tally.excluded,
    }),
    { killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 },
  );
  const withScores = scored.filter((s) => s.score !== undefined);
  const pooled = scorePair(totals);
  const mean =
    withScores.length === 0
      ? undefined
      : withScores.reduce((a, s) => a + (s.score ?? 0), 0) / withScores.length;
  return {
    pairs: scored.length,
    pairsWithMutants: withScores.length,
    totals,
    pooledScore: pooled.score,
    pooledCoveredScore: coveredScorePair(totals).score,
    pooledReach: reach(totals),
    meanOfPairScores: mean,
  };
}

/**
 * The reading SPLIT BY AUTHORING SHAPE — and this split is not a nicety, it is what stops the
 * headline being wrong.
 *
 * Mutation is scoped to the whole SOURCE FILE, because without a `boundHash` there is no span to
 * scope to. For a NET-NEW pair that is exactly right: the leaf authored the whole file, so every
 * mutant sits in code its test was meant to cover. For an `editsExisting` pair it is NOT: the leaf
 * added a regression test for one behaviour in a file that already existed, and every mutant in the
 * pre-existing remainder is scored against a test that was never asked to cover it.
 *
 * So the two subsets measure different things, and pooling them yields a number that is neither.
 * The net-new subset is the clean reading of leaf-test strength; the edits-existing subset is a
 * LOWER BOUND on it, and is reported as one.
 */
export interface SplitReading {
  readonly netNew: Aggregate;
  readonly editsExisting: Aggregate;
}

export function splitByAuthoringShape(scored: readonly PairScore[]): SplitReading {
  return {
    netNew: aggregate(scored.filter((s) => !s.pair.editsExisting)),
    editsExisting: aggregate(scored.filter((s) => s.pair.editsExisting)),
  };
}

/** Format a fraction as a percentage, or the explicit absence marker. Never renders undefined as 0. */
export function pct(value: number | undefined): string {
  return value === undefined ? "n/a (no mutants)" : `${(value * 100).toFixed(1)}%`;
}

/**
 * Render the finished reading as markdown — the table that goes into the research doc.
 *
 * IT IS A COMMAND, NOT A HAND-BUILT TABLE, so the doc's numbers are re-derivable from the banked
 * artifact rather than transcribed. A transcribed table is a second source of truth that drifts
 * silently from the first, and the whole point of this increment is a figure a later reader can
 * check.
 */
export function renderReadingMarkdown(
  scored: readonly PairScore[],
  populationSize: number,
  failed: readonly { readonly unitId: string; readonly error: string }[],
): string {
  const agg = aggregate(scored);
  const split = splitByAuthoringShape(scored);
  const row = (label: string, a: Aggregate): string =>
    `| ${label} | ${a.pairs} | ${scorePair(a.totals).denominator} | ${pct(a.pooledScore)} | ` +
    `${pct(a.pooledCoveredScore)} | ${pct(a.pooledReach)} |`;

  const pairRows = [...scored]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .map((s) => {
      const stale =
        s.testChangedSinceProof === undefined ? "?" : s.testChangedSinceProof ? "edited" : "same";
      return (
        `| \`${s.pair.unitId}\` | ${s.pair.editsExisting ? "edits" : "net-new"} | ` +
        `${s.denominator} | ${pct(s.score)} | ${pct(coveredScorePair(s.tally).score)} | ` +
        `${pct(reach(s.tally))} | ${s.tally.killed}/${s.tally.survived}/${s.tally.timeout}/${s.tally.noCoverage} | ${stale} |`
      );
    });

  return [
    `**${scored.length} of ${populationSize} pairs scored** (${failed.length} could not be run — listed below).`,
    ``,
    `| subset | pairs | mutants | score (whole file) | score (covered only) | reach |`,
    `|---|---:|---:|---:|---:|---:|`,
    row("**all scored**", agg),
    row("net-new", split.netNew),
    row("edits-existing *(lower bound)*", split.editsExisting),
    ``,
    `Mean of per-pair whole-file scores: **${pct(agg.meanOfPairScores)}** over ${agg.pairsWithMutants} pair(s) that generated any mutant.`,
    ``,
    `| unit | shape | mutants | score | covered | reach | k/s/t/n | test file since proof |`,
    `|---|---|---:|---:|---:|---:|---|---|`,
    ...pairRows,
    ...(failed.length === 0
      ? []
      : [
          ``,
          `**Could not be run:**`,
          ``,
          ...failed.map((f) => `- \`${f.unitId}\` — ${f.error}`),
        ]),
  ].join("\n");
}

/** Render the population half as text — the denominators, before any mutant is run. */
export function renderPopulation(report: PopulationReport): string {
  const anchorNote =
    report.verdictsWithBoundHash === 0
      ? "   <- ADR-0016's span anchor is stamped on NONE of them; resolution falls back to the spec"
      : "";
  return [
    `verdicts read:             ${report.verdictsSeen}`,
    `  carrying a boundHash:    ${report.verdictsWithBoundHash}${anchorNote}`,
    `  resolved to a leaf pair: ${report.verdictsIncluded}`,
    `  excluded:`,
    ...EXCLUSION_REASONS.map((r) => `    ${r.padEnd(18)} ${report.excluded[r]}`),
    ``,
    `distinct units in the population: ${report.pairs.length}`,
  ].join("\n");
}
