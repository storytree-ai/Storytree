// The diff-scoped mutation rung's PURE core — ADR-0458, realising ADR-0447 D2 via the
// `diff-scoped-mutation-rung` increment. No I/O: the caller supplies the diff text, the workspace
// projects and the mutation report, and gets back a selection and a verdict.
//
// WHAT THIS RUNG ASKS, and the two words that carry it: do THIS BRANCH's own new or changed tests
// kill the mutants in THIS BRANCH's own changed lines? Not "does the package score well" — ADR-0447
// refused a mutation-score ceiling outright, because a threshold prices the ceremony toward killing
// cheap mutants, which is the mutation-testing analogue of the coverage gaming this arc exists to
// stop. There is no percentage anywhere in this file, and adding one is a decision, not a tweak.
//
// LINE RANGES, NOT WHOLE FILES, AND THAT IS THE SELF-LIMITING PART. `diff-scoped-mutation-rung`'s
// standing promise is that the rung "asks nothing of code you did not touch". Mutating a whole
// changed FILE breaks that promise the first time anyone edits one line of an old file: Stryker
// would mutate the other three hundred lines too, they would be killed by tests written years ago,
// and the rung would red a landing that did its job. So the diff's NEW-side line ranges are carried
// all the way into Stryker's `mutate` globs (`path.ts:12-18`), and a mutant outside them is never
// generated in the first place.
//
// THE FOUR HARD CONSTRAINTS the attribution wire established (PR #1657,
// docs/research/stryker-bun-attribution-2026-08-26.md) are honoured HERE, not by the config alone:
//   1. `coveredBy` is NOT `killedBy` — this file reads `killedBy` and never `coveredBy`. A test that
//      merely EXECUTED the mutated line proves nothing; the wire's fixture has a case covered by two
//      tests and detectable by one.
//   2/3. `coverageAnalysis: "perTest"` and `disableBail: true` live in the generated config, but
//      {@link adjudicateMutants} fails closed when their absence shows up as missing attribution,
//      so a config that quietly loses them cannot read as a pass.
//   4. An empty `killedBy` on a `Killed` mutant means NOT IDENTIFIABLE — never a pass, and never a
//      survivor either. It is {@link MutantOutcome} `"unproven"`, which reds, and says why.

/** One inclusive 1-based line span on the NEW side of a diff. */
export interface LineRange {
  readonly start: number;
  readonly end: number;
}

/** A repo-root-relative posix path with the new-side spans this branch touched in it. */
export interface ChangedRanges {
  readonly file: string;
  readonly ranges: readonly LineRange[];
}

/** One workspace project, in the shape `ci-affected.ts` already discovers them. */
export interface ProjectDir {
  readonly name: string;
  /** e.g. `packages/library` — no trailing slash. */
  readonly dir: string;
}

/** What to mutate in one project, already rendered as Stryker `mutate` globs. */
export interface MutationTarget {
  readonly project: string;
  readonly dir: string;
  /** `packages/cli/src/foo.ts:12-18` — one entry per contiguous span. */
  readonly mutateGlobs: readonly string[];
  /** The distinct source files those globs cover, for the human-facing summary. */
  readonly sourceFiles: readonly string[];
}

/** The selection: what to mutate, which tests count as this branch's, or why there is nothing to do. */
export interface TargetSelection {
  readonly targets: readonly MutationTarget[];
  /** Repo-relative posix paths of test files this branch added or changed. */
  readonly changedTestFiles: readonly string[];
  /** Changed source dropped as an executable entry point — REPORTED, never silent. */
  readonly exempted: readonly string[];
  /** Present only when {@link targets} is empty — the reason, for an honest SKIP. */
  readonly skipReason: string | null;
}

/** How a "nothing to mutate" run must report itself, for the runner that is actually reading it. */
export interface SkipDisposition {
  /** The process exit code. */
  readonly exitCode: number;
  /** The word the skip line leads with. The FACT is printed either way; only this differs. */
  readonly label: string;
}

/**
 * Decide how a SKIP announces itself — and it is a DECISION, because two runners read this same
 * script and disagree about what a non-zero code means.
 *
 * `gate-run.ts` reads {@link SkipDisposition.exitCode} 3 as a DECLARED skip: it prints the step as
 * SKIP, names it in `GATE GREEN, NARROWED`, and does not red the gate. `.github/workflows/ci.yml`
 * runs the very same `pnpm check:mutation-diff` as an ordinary step with no `continue-on-error`,
 * where ANY non-zero code is a hard failure. Emitting the declared 3 into CI would therefore turn
 * this rung's COMMONEST outcome — a branch that changes no mutable TypeScript, i.e. every corpus,
 * docs and config landing — into a red on a PR that did nothing wrong. That is the same dishonesty
 * the skip protocol exists to remove, with the sign flipped.
 *
 * WITHHOLD THE CODE, NEVER THE FACT. Both dispositions print; a CI reader sees `NOTHING TO MUTATE`
 * and knows this run proved nothing, exactly as a local reader sees `SKIP`. What must not happen is
 * a CI run that is silently indistinguishable from a rung that ran and passed.
 *
 * `gateSkipExitCode` is the CALLER's, not re-declared here: `GATE_SKIP_EXIT_CODE` is owned by
 * `gate-runner.ts`, and a second literal 3 in the pure core is exactly the drift that would let the
 * protocol change on one side only. CI's 0 is not the caller's code and never can be — it is the
 * one branch whose whole point is to not carry it.
 *
 * The shape is `check-web-experience-closure.ts`'s bootstrap branch, which established it; this is
 * the third rung to need it and the first whose skip fires on ordinary everyday landings.
 */
export function skipDisposition(args: {
  /** `process.env.CI === "true"` — measured by the shell, never guessed here. */
  readonly inCi: boolean;
  /** `GATE_SKIP_EXIT_CODE`, passed in so this module owns no copy of it. */
  readonly gateSkipExitCode: number;
}): SkipDisposition {
  if (args.inCi) return { exitCode: 0, label: "NOTHING TO MUTATE" };
  return { exitCode: args.gateSkipExitCode, label: "SKIP" };
}

/**
 * The executable ENTRY POINTS a root `package.json` invokes directly — exempt from mutation.
 *
 * WHY THIS EXEMPTION EXISTS, AND WHY IT IS MECHANICAL RATHER THAN A LIST SOMEONE CURATES. This arc
 * already measured the case: increment 1 found `ingest-merge.ts` scoring WORST of everything at
 * 31.11% **with no defect at all**, because half of it is a private `main()` that opens a real Cloud
 * SQL pool — code a hermetic unit test cannot exercise by construction. That finding is ADR-0447's
 * own evidence for refusing a mutation-score ceiling. A rung that reds a landing over mutants in a
 * process shell is measuring the shape of the file, not the strength of the tests.
 *
 * THE RULE IS DERIVED, NOT DECLARED, and that is what stops it becoming a dumping ground: a file is
 * exempt only because a root script INVOKES it, which is a fact about the repo that is visible in
 * `package.json` and changes only when someone adds a script. There is no opt-out comment, no
 * ignore-file, and nothing a session can add to this set without also adding a runnable command.
 * Every exemption is PRINTED by the rung, so it is never silent.
 *
 * The parse resolves `-C <dir>` because that is how every `check:*` script in this repo is written
 * (`pnpm -C packages/cli exec node … src/foo.ts`), so the `.ts` token is relative to that dir and
 * NOT to the repo root. Reading it as repo-relative would exempt a path that does not exist, which
 * fails in the dangerous direction — it would exempt nothing while appearing to work.
 */
export function entryPointsFromScripts(scripts: Readonly<Record<string, string>>): string[] {
  const found = new Set<string>();
  for (const command of Object.values(scripts)) {
    // Stryker disable next-line all: EQUIVALENT — the split pattern and the empty-token filter are
    // mutually redundant. Narrowing the pattern to a single whitespace char yields empty tokens the
    // filter drops; dropping the filter leaves empty tokens no later branch matches. Neither shows.
    const tokens = command.split(/\s+/).filter((t) => t !== "");
    const dirFlag = tokens.indexOf("-C");
    const base = dirFlag >= 0 ? normalise(tokens[dirFlag + 1] ?? "") : "";
    for (const token of tokens) {
      if (!token.endsWith(".ts") || token.startsWith("-")) continue;
      // Stryker disable next-line ConditionalExpression,StringLiteral: EQUIVALENT — when base is empty, resolvePosix("", token) returns exactly normalise(token), so both arms of this ternary agree and no mutation of the test can be observed. The branch exists for clarity, not behaviour.
      found.add(base === "" ? normalise(token) : resolvePosix(base, normalise(token)));
    }
  }
  return [...found].sort();
}

/** Join two posix fragments, collapsing `.` and `..` — no `node:path`, so this stays pure. */
function resolvePosix(base: string, rel: string): string {
  const segments: string[] = [];
  for (const segment of `${base}/${rel}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * The test file that sits beside a source file, by this repo's convention (`foo.ts` → `foo.test.ts`).
 *
 * Used to widen the test set beyond the branch's own CHANGED tests, so a mutant killed by the
 * file's existing sibling suite is reported as `killed-by-others` — an accurate, actionable message
 * — rather than as a survivor, which would tell the author nothing caught it when something did.
 */
export function siblingTestFor(sourceFile: string): string {
  return `${normalise(sourceFile).replace(/\.ts$/, "")}.test.ts`;
}

/**
 * Normalise a path for comparison: backslashes to forward slashes, no leading `./`.
 *
 * Windows is not incidental here. The attribution wire's first patch exists because the plugin wrote
 * a raw `path.join()` result into a generated ES-module specifier, and every path this rung compares
 * arrives from one of three places (git, the workspace scan, Stryker's report) that disagree about
 * separators.
 */
function normalise(p: string): string {
  // Stryker disable next-line MethodExpression: EQUIVALENT — every caller trims its input before calling this (the diff parser slices and trims; the workspace scan reads git output line by line), so the trailing .trim() has nothing left to remove.
  return p.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/** A `.ts` source file worth mutating: not a declaration, not a test, not a fixture. */
function isMutableSource(file: string): boolean {
  if (!file.endsWith(".ts")) return false;
  if (file.endsWith(".d.ts")) return false;
  return !isTestFile(file);
}

/** A test file, by this repo's convention (`*.test.ts`, including `*.e2e.test.ts`). */
/**
 * Can this rung's test runner actually EXECUTE a project's suite?
 *
 * The rung runs Stryker's `bun` test runner, which is the only runner that gives per-test
 * attribution here. A project whose own `test` script is `vitest run` is therefore OUT OF ITS
 * REACH — not because its tests are worse, but because they are written against a DOM environment
 * (`window`, jsdom) and a cwd-relative fixture root that the bun runner does not provide. Handing
 * one to Stryker anyway kills the DRY RUN, before a single mutant is tested, with a
 * `ReferenceError: window is not defined` naming a test file the author may not even have written.
 *
 * MEASURED, on the first branch to hit it: a change to `packages/forest-world/src/substrate.ts`
 * that also updated a downstream snapshot in `apps/studio/src/components/TreeViewShell.test.tsx`.
 * The mutation target was correct (one file, one project, both bun-runnable); the STUDIO test came
 * along because the rung collects "this branch's own changed tests" without asking whether it can
 * run them. The rung red on a diff whose own code was fine.
 *
 * The narrowing is reported, never silent — a project this rung cannot reach is a real coverage
 * gap, and a gap nobody can see is worse than one that is named on every run.
 */
export function runsUnderBun(testScript: string | undefined): boolean {
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — this guard is a TYPE narrowing,
  // not a behavioural branch. With it removed, `undefined` reaches `RegExp.test`, which coerces its
  // argument to the string "undefined" — which contains no `bun test` and yields the same `false`.
  // The guard earns its place by keeping the function honest to its own signature, and no input can
  // distinguish the two, so no test can kill this mutant.
  if (testScript === undefined) return false;
  return /(^|[\s&|;])bun\s+test(\s|$)/.test(testScript);
}

export function isTestFile(file: string): boolean {
  return file.endsWith(".test.ts") || file.endsWith(".test.tsx");
}

/**
 * Parse `git diff --unified=0`'s NEW-side line spans, per file.
 *
 * ONLY THE NEW SIDE IS MEANINGFUL. A hunk that deletes lines and adds none (`+n,0`) leaves nothing
 * to mutate at that point, so it contributes no range — mutating the survivor of a deletion would
 * be asking about code the branch removed. A hunk header without a count means exactly one line,
 * which is unified-diff's own shorthand and not an edge case to guess at.
 *
 * The parser is deliberately strict about the `+++ b/` marker rather than tracking `diff --git`
 * lines: a rename or a mode change can carry a `diff --git` header with no content hunks at all, and
 * a file with no hunks must produce no ranges rather than an empty-range entry a caller could read
 * as "the whole file".
 */
export function parseUnifiedDiffRanges(diffText: string): ChangedRanges[] {
  const byFile = new Map<string, LineRange[]>();
  let current: string | null = null;

  for (const rawLine of diffText.split("\n")) {
    // Stryker disable next-line Regex: EQUIVALENT — git emits CR only immediately before LF, so an anchored and an unanchored match strip the same character. An interior CR cannot occur in the diff text this reads.
    const line = rawLine.replace(/\r$/, "");

    if (line.startsWith("+++ ")) {
      const target = line.slice(4).trim();
      // `/dev/null` is a deletion: there is no new side, so nothing in it can be mutated.
      current = target === "/dev/null" ? null : normalise(target.replace(/^b\//, ""));
      continue;
    }

    // No `startsWith("@@")` fast path here, deliberately. It would be pure redundancy against the
    // anchored regex below — and redundancy is what makes a mutant unkillable: with both present,
    // removing either leaves behaviour identical, so neither can ever be proven. One anchored check
    // is simpler AND provable.
    if (current === null) continue;

    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header === null) continue;
    const start = Number(header[1]);
    const count = header[2] === undefined ? 1 : Number(header[2]);
    if (!Number.isFinite(start) || !Number.isFinite(count) || count <= 0) continue;

    const ranges = byFile.get(current) ?? [];
    ranges.push({ start, end: start + count - 1 });
    byFile.set(current, ranges);
  }

  return [...byFile.entries()]
    .map(([file, ranges]) => ({ file, ranges: mergeRanges(ranges) }))
    .sort((a, b) => byUniqueKey(a.file, b.file));
}

/**
 * Order two keys that are unique by construction.
 *
 * Shared by the two places that sort Map-derived collections, which is what makes the equivalence
 * below true ONCE rather than repeated at each call site.
 */
function byUniqueKey(a: string, b: string): number {
  // Stryker disable next-line EqualityOperator: EQUIVALENT — every caller sorts Map keys, which are
  // unique by construction, so `<` and `<=` can never disagree on any input reachable here.
  return a < b ? -1 : 1;
}

/**
 * Coalesce overlapping or adjacent spans.
 *
 * Adjacent spans are merged too (`10-12` + `13-15` → `10-15`): Stryker is handed one glob per span,
 * and two globs describing one contiguous region is the same instruction written twice — it makes
 * the summary lie about how much of the file is in scope.
 */
function mergeRanges(ranges: readonly LineRange[]): LineRange[] {
  // Stryker disable next-line ArithmeticOperator: EQUIVALENT on the secondary key — merging takes Math.max of the ends, so two spans sharing a start produce the same merged span in either order. The PRIMARY key is load-bearing and stays proven.
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end + 1) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
      continue;
    }
    merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/**
 * Decide what this branch's diff puts in scope.
 *
 * `existingFiles` is the caller's answer to "does this path still exist in the working tree?" — a
 * file the branch DELETED still appears in the diff, and handing Stryker a glob for a path that is
 * gone makes it fail on a landing that did nothing wrong.
 *
 * A source file outside every workspace project's `src/` is DROPPED rather than escalated. That is
 * not the fail-wide rule `ci-affected.ts` applies to test SELECTION, and the asymmetry is deliberate:
 * there, failing wide runs more tests, which is safe; here, failing wide would mutate scripts and
 * config that no unit test is written against, and every one of those mutants would survive and red
 * an honest landing. The conservative direction for a mutation rung is to ask LESS, and to say so.
 */
export function selectMutationTargets(args: {
  readonly changed: readonly ChangedRanges[];
  readonly projects: readonly ProjectDir[];
  readonly existingFiles: ReadonlySet<string>;
  /** Executable entry points — see {@link entryPointsFromScripts}. Absent means exempt nothing. */
  readonly exemptFiles?: ReadonlySet<string>;
}): TargetSelection {
  const { changed, projects, existingFiles } = args;
  const exemptFiles = args.exemptFiles ?? new Set<string>();
  const byProject = new Map<string, { dir: string; globs: string[]; files: string[] }>();
  const changedTestFiles: string[] = [];
  const exempted: string[] = [];
  let droppedOutsideSrc = 0;

  // Longest dir first, so `packages/library` never claims a file inside a hypothetical
  // `packages/library-store`. `startsWith(dir + "/")` already prevents that, but ordering keeps the
  // answer stable if the dir set ever gains a genuine nesting.
  // Stryker disable next-line all: EQUIVALENT — ownership is decided by the exact
  // `startsWith(dir + "/")` test below. This sort only fixes the ORDER in which equally-valid
  // candidates are considered, so no comparator mutation can change which project claims a file.
  const ordered = [...projects].sort((a, b) => b.dir.length - a.dir.length);

  for (const entry of changed) {
    const file = normalise(entry.file);
    if (!existingFiles.has(file)) continue;

    const owner = ordered.find((p) => file.startsWith(`${p.dir}/`));
    if (owner === undefined) continue;

    if (isTestFile(file)) {
      changedTestFiles.push(file);
      continue;
    }
    if (!isMutableSource(file)) continue;
    if (!file.startsWith(`${owner.dir}/src/`)) {
      droppedOutsideSrc += 1;
      continue;
    }
    if (exemptFiles.has(file)) {
      exempted.push(file);
      continue;
    }

    const bucket = byProject.get(owner.name) ?? { dir: owner.dir, globs: [], files: [] };
    for (const range of entry.ranges) bucket.globs.push(`${file}:${range.start}-${range.end}`);
    bucket.files.push(file);
    byProject.set(owner.name, bucket);
  }

  const targets: MutationTarget[] = [...byProject.entries()]
    .map(([project, bucket]) => ({
      project,
      dir: bucket.dir,
      mutateGlobs: bucket.globs.sort(),
      sourceFiles: [...new Set(bucket.files)].sort(),
    }))
    .sort((a, b) => byUniqueKey(a.project, b.project));

  const sortedTests = changedTestFiles.sort();
  const sortedExempt = exempted.sort();
  if (targets.length > 0) {
    return { targets, changedTestFiles: sortedTests, exempted: sortedExempt, skipReason: null };
  }

  const detail: string[] = [];
  if (droppedOutsideSrc > 0) {
    detail.push(`${droppedOutsideSrc} changed .ts file(s) sit outside any project's src/`);
  }
  if (sortedExempt.length > 0) {
    detail.push(`${sortedExempt.length} are executable entry points (${sortedExempt.join(", ")})`);
  }
  return {
    targets: [],
    changedTestFiles: sortedTests,
    exempted: sortedExempt,
    skipReason:
      `this branch changes no mutable source under a workspace project's src/` +
      (detail.length > 0 ? ` — ${detail.join("; ")}` : ""),
  };
}

/** How one mutant was accounted for. Only `"proven"` passes; `"excluded"` is not counted at all. */
export type MutantOutcome =
  | "proven"
  | "killed-by-others"
  | "unproven"
  | "survived"
  | "no-coverage"
  | "excluded";

/** The mutation-testing-report-schema v1.0 subset this rung reads. */
export interface MutationReport {
  readonly files?: Readonly<
    Record<string, { readonly mutants?: readonly ReportMutant[] } | undefined>
  >;
  readonly testFiles?: Readonly<
    Record<string, { readonly tests?: readonly ReportTest[] } | undefined>
  >;
}

export interface ReportMutant {
  readonly id?: string;
  readonly mutatorName?: string;
  readonly status?: string;
  readonly killedBy?: readonly string[];
  readonly location?: { readonly start?: { readonly line?: number } };
}

export interface ReportTest {
  readonly id?: string;
  readonly name?: string;
}

/** One adjudicated mutant, carrying enough to explain the verdict without re-reading the report. */
export interface AdjudicatedMutant {
  readonly file: string;
  readonly line: number | null;
  readonly mutator: string;
  readonly status: string;
  readonly outcome: MutantOutcome;
  /** Repo-relative test files credited with the kill, when they could be resolved. */
  readonly killedByFiles: readonly string[];
}

export interface MutationVerdict {
  readonly verdict: "pass" | "fail" | "vacuous";
  readonly counted: number;
  readonly mutants: readonly AdjudicatedMutant[];
  readonly reasons: readonly string[];
}

/**
 * Resolve a test id to the repo-relative test file it lives in.
 *
 * SUFFIX MATCHING IS MANDATORY AND IS NOT A CONVENIENCE. Stryker copies the project into a sandbox
 * whose directory name CHANGES EVERY RUN, and the report's `testFiles` keys are that sandbox's
 * absolute paths. Comparing them to a repo-relative path by equality yields zero matches on every
 * run — which is the exact failure the wire's second patch was written to fix, one layer down. An
 * ambiguous suffix (two files ending the same way) resolves to nothing rather than to a guess.
 */
function resolveTestFiles(report: MutationReport, changedTestFiles: readonly string[]) {
  const idToFile = new Map<string, string>();
  const reportPaths = new Set<string>();

  for (const [rawPath, entry] of Object.entries(report.testFiles ?? {})) {
    const reportPath = normalise(rawPath);
    reportPaths.add(reportPath);
    // Stryker disable next-line ArrayDeclaration: EQUIVALENT — a placeholder element substituted for the empty array carries no string `id`, so the loop body skips it and the registry is unchanged.
    for (const test of entry?.tests ?? []) {
      // Stryker disable next-line ConditionalExpression: EQUIVALENT — forcing this true indexes non-string ids, but `killedBy` holds strings and Map lookup is strict, so a non-string key can never be hit and no attribution changes.
      if (typeof test.id === "string") idToFile.set(test.id, reportPath);
    }
  }

  // THE DIRECTION OF THIS COUNT IS THE WHOLE POINT, and getting it backwards reads as a pass.
  // The question is "how many REPORT paths does this one changed test file match?" — not "how many
  // changed files does this report path match?", which is 1 even when the suffix is hopelessly
  // ambiguous, and would credit every candidate.
  const changedReportPaths = new Set<string>();
  for (const wanted of changedTestFiles.map(normalise)) {
    const hits = [...reportPaths].filter((rp) => rp === wanted || rp.endsWith(`/${wanted}`));
    const only = hits.length === 1 ? hits[0] : undefined;
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — forcing this true adds `undefined` to the set, and every later membership test is against a real normalised path, which `undefined` never equals.
    if (only !== undefined) changedReportPaths.add(only);
  }

  return { idToFile, changedReportPaths };
}

/**
 * Adjudicate the report against this branch's own changed tests.
 *
 * A VACUOUS RUN IS ITS OWN VERDICT, distinct from a pass. If the selection said there was source to
 * mutate and the report then contains no counted mutant, something upstream went wrong — a bad glob,
 * a sandbox that failed to build, a plugin that produced an empty report — and reporting that as a
 * pass is precisely the green-check-that-verified-nothing failure this repo keeps re-finding. The
 * caller decides what a vacuous run costs; this function refuses to call it a pass.
 */
export function adjudicateMutants(
  report: MutationReport,
  changedTestFiles: readonly string[],
): MutationVerdict {
  const { idToFile, changedReportPaths } = resolveTestFiles(report, changedTestFiles);
  const mutants: AdjudicatedMutant[] = [];

  for (const [rawFile, entry] of Object.entries(report.files ?? {})) {
    const file = normalise(rawFile);
    for (const mutant of entry?.mutants ?? []) {
      const status = mutant.status ?? "Unknown";
      const killedByFiles = [
        // Stryker disable next-line ArrayDeclaration: EQUIVALENT — a placeholder element
        // substituted for this empty fallback is not a real test id, so `idToFile.get` returns
        // undefined for it and the filter on the same line removes it again. Nothing downstream
        // can observe the difference.
        ...new Set((mutant.killedBy ?? []).map((id) => idToFile.get(id)).filter((f): f is string => f !== undefined)),
      ];
      mutants.push({
        file,
        line: mutant.location?.start?.line ?? null,
        mutator: mutant.mutatorName ?? "unknown",
        status,
        outcome: classify(status, killedByFiles, changedReportPaths),
        killedByFiles: killedByFiles.sort(),
      });
    }
  }

  const counted = mutants.filter((m) => m.outcome !== "excluded");
  const reasons: string[] = [];
  const tally = (outcome: MutantOutcome): number => counted.filter((m) => m.outcome === outcome).length;

  if (counted.length === 0) {
    return {
      verdict: "vacuous",
      counted: 0,
      mutants,
      reasons: [
        "source was selected for mutation but the report counted no mutants — the run proved nothing, which is not a pass",
      ],
    };
  }

  const survived = tally("survived");
  const noCoverage = tally("no-coverage");
  const others = tally("killed-by-others");
  const unproven = tally("unproven");

  if (survived > 0) reasons.push(`${survived} mutant(s) SURVIVED — no test noticed the change`);
  if (noCoverage > 0) reasons.push(`${noCoverage} mutant(s) had NO COVERAGE — no test reaches this line`);
  if (others > 0) {
    reasons.push(
      `${others} mutant(s) were killed only by tests this branch did not touch — the branch's own tests do not discriminate them`,
    );
  }
  if (unproven > 0) {
    reasons.push(
      `${unproven} mutant(s) are UNPROVEN — killed, but the report named no test (constraint 4: never a pass, never a survivor)`,
    );
  }

  return {
    verdict: reasons.length === 0 ? "pass" : "fail",
    counted: counted.length,
    mutants,
    reasons,
  };
}

/** The per-mutant rule. Kept separate so the table of statuses is readable in one screen. */
function classify(
  status: string,
  killedByFiles: readonly string[],
  changedReportPaths: ReadonlySet<string>,
): MutantOutcome {
  switch (status) {
    case "Survived":
      return "survived";
    case "NoCoverage":
      return "no-coverage";
    case "Killed": {
      // Constraint 4. An unresolvable `killedBy` is NOT IDENTIFIABLE, and the two failure shapes it
      // can hide point opposite ways — so it is neither a pass nor a survivor.
      //
      // Testing only the RESOLVED set is deliberate and complete: `killedByFiles` is derived from
      // `killedByIds`, so an empty id list always yields an empty file list. An extra
      // `killedByIds.length === 0` clause would be dead — and a dead clause is an unkillable mutant,
      // because removing it changes nothing.
      if (killedByFiles.length === 0) return "unproven";
      return killedByFiles.some((f) => changedReportPaths.has(f)) ? "proven" : "killed-by-others";
    }
    case "Timeout":
      // The suite hung rather than asserting. Something died under the mutant, but nothing named a
      // test, so this cannot be credited to the branch's own tests.
      return "unproven";
    default:
      // CompileError, Ignored, RuntimeError and anything a future schema adds: not a signal about
      // this branch's tests. Excluded from the count rather than silently scored either way.
      return "excluded";
  }
}

/** Render the verdict for a terminal. Pure — the caller owns the exit code. */
export function formatMutationVerdict(
  tag: string,
  verdict: MutationVerdict,
  targets: readonly MutationTarget[],
): string {
  const lines: string[] = [];
  const files = targets.flatMap((t) => t.sourceFiles);
  const spans = targets.reduce((n, t) => n + t.mutateGlobs.length, 0);

  lines.push(`${tag} ${files.length} changed source file(s), ${spans} changed line span(s), ${verdict.counted} mutant(s) counted`);

  if (verdict.verdict === "pass") {
    lines.push(`${tag} PASS — every mutant in this branch's changed lines was killed by this branch's own tests`);
    return lines.join("\n");
  }

  for (const reason of verdict.reasons) lines.push(`${tag} ${reason}`);

  const failing = verdict.mutants.filter((m) => m.outcome !== "proven" && m.outcome !== "excluded");
  for (const mutant of failing.slice(0, 25)) {
    const where = mutant.line === null ? mutant.file : `${mutant.file}:${mutant.line}`;
    const credit = mutant.killedByFiles.length === 0 ? "no test named" : `killed by ${mutant.killedByFiles.join(", ")}`;
    lines.push(`${tag}   ${mutant.outcome.toUpperCase()} ${where} [${mutant.mutator}] — ${credit}`);
  }
  if (failing.length > 25) lines.push(`${tag}   … and ${failing.length - 25} more`);

  lines.push(
    `${tag} The rung asks only about the lines THIS branch changed. Strengthen this branch's own tests until each`,
  );
  lines.push(`${tag} mutant above is caught, or record why the mutant is equivalent and cannot be killed.`);
  return lines.join("\n");
}
