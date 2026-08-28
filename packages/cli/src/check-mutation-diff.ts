// `pnpm check:mutation-diff` — the diff-scoped mutation rung (ADR-0458 / `diff-scoped-mutation-rung`).
//
// Mutate ONLY the lines this branch changed, and require this branch's OWN new or changed tests to
// kill those mutants. The adjudication is `mutation-diff.ts`, which is pure and unit-tested; this
// file is the I/O shell: resolve the diff, generate a Stryker config, run it, read the report.
//
// EXIT CODES follow the gate's own vocabulary (`gate-order.ts`):
//   0  every mutant in the changed lines was killed by this branch's own tests
//   1  at least one was not — or the run could not be trusted
//   3  SKIP: this branch changes no mutable source, so there is nothing to mutate. A declared,
//      opt-in skip, never inferred — the runner prints it as SKIP and the gate reads GREEN, NARROWED.
//      LOCAL ONLY. `.github/workflows/ci.yml` runs this as an ordinary step where any non-zero code
//      is a hard failure, so in CI that same state prints `NOTHING TO MUTATE` and exits 0 — the fact
//      is stated either way and only the code differs. See `skipDisposition` for why.
//
// WHY THE SCOPE CLASSIFIER IS IMPORTED RATHER THAN RE-DERIVED. `diff-scoped-mutation-rung` makes this
// a ship condition: `ci-affected.ts` already owns "what does this branch affect", it is the SAME
// classifier the local gate and CI both use (ADR-0195 / ADR-0304 D2), and a second one means a local
// pass stops predicting a CI pass. This rung takes its workspace projects from
// `discoverWorkspaceProjects` and nothing else.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverWorkspaceProjects } from "./ci-affected.js";
import { GATE_SKIP_EXIT_CODE } from "./gate-runner.js";
import {
  adjudicateMutants,
  type ChangedRanges,
  entryPointsFromScripts,
  formatMutationVerdict,
  isTestFile,
  isSpawnUatTest,
  type MutationReport,
  type MutationTarget,
  parseUnifiedDiffRanges,
  runsUnderBun,
  selectMutationTargets,
  siblingTestFor,
  skipDisposition,
} from "./mutation-diff.js";
import {
  type BaseRefChoice,
  chooseBaseRef,
  VacuousOwnershipSweep,
} from "./ownership-totality.js";

const TAG = "[mutation-diff]";
const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

const CONFIG_FILE = "stryker.mutation-diff.conf.mjs";
const REPORT_FILE = "reports/mutation-diff.json";

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: GIT_MAX_BUFFER });
}

/**
 * `git` that reports "did not resolve" as `null` instead of throwing — for the probe-shaped calls.
 *
 * ITS STDERR IS DISCARDED, and that is the difference from {@link git} above rather than an
 * oversight. A probe asks a question whose "no" is a NORMAL ANSWER: `merge-base origin/main HEAD`
 * on a CI checkout is EXPECTED to fail, because `fetch-depth: 2` fetches no `origin/main` — that
 * is the whole reason {@link chooseBaseRef} exists. git writes `fatal: Not a valid object name
 * origin/main` to stderr anyway, and with stderr inherited that line lands in the CI log of every
 * PR, on the HEALTHY path, immediately above a PASS. Measured on PR #1668's own run, the first
 * time this rung ran in CI. A red `fatal:` printed by a step that then succeeds is worse than
 * noise: it invites a session to diagnose a break that is not there, and it teaches everyone to
 * read past `fatal:` lines that sometimes DO matter.
 *
 * `check-ownership-totality.ts`'s `git()` silences its probe for exactly this reason and has since
 * it was written; this rung reuses that check's `chooseBaseRef` and simply failed to copy the
 * stdio with it. {@link git} keeps stderr INHERITED on purpose — its callers ask questions whose
 * failure is a genuine fault worth seeing.
 */
function gitOrNull(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}

/**
 * The revision this branch is charged against.
 *
 * REUSED, NOT RE-DERIVED — {@link chooseBaseRef} is `check:ownership-totality`'s already-tested
 * judge, and the reason it is not simply `merge-base origin/main HEAD` is the same here as there:
 * CI checks out the PR MERGE ref at `fetch-depth: 2` and fetches no `origin/main`, so the local
 * answer and the CI answer are different refs for the same question. A second copy of that decision
 * would drift, and this rung would then disagree with the ownership rung about what "this branch
 * changed" even means.
 */
function resolveBaseRef(): BaseRefChoice {
  return chooseBaseRef({
    eventName: process.env["GITHUB_EVENT_NAME"],
    hasSecondParent: gitOrNull(["rev-parse", "--verify", "--quiet", "HEAD^2"]) !== null,
    mergeBase: gitOrNull(["merge-base", "origin/main", "HEAD"]),
  });
}

/**
 * The branch's changed line spans, working tree included.
 *
 * The same three-part answer `gate-run.ts` assembles for scope, for the same reason: a session runs
 * the gate mid-flight, so its changes may be committed, staged, unstaged or untracked. `git diff
 * <merge-base>` with no second revision covers the first three; `ls-files --others` adds the fourth.
 *
 * An untracked file is entirely new, so every line of it is in scope — there is no diff to parse and
 * no earlier version any of it could have been inherited from.
 */
function changedRanges(base: BaseRefChoice): ChangedRanges[] {
  const diff = git(["diff", "--unified=0", "--no-renames", base.ref]);
  const ranges = [...parseUnifiedDiffRanges(diff)];

  const untracked = git(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  for (const file of untracked) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const abs = path.join(repoRoot, file);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n").length;
    ranges.push({ file, ranges: [{ start: 1, end: Math.max(lines, 1) }] });
  }

  return ranges;
}

/**
 * The Stryker config for this run, generated rather than committed.
 *
 * Generated because its `mutate` list IS the diff — it is different on every branch, so a committed
 * file could only ever be stale. The four hard constraints the attribution wire established are
 * written here explicitly, each beside the failure it prevents, because a config that silently loses
 * one of them produces a report that still LOOKS fine.
 */
function writeConfig(targets: readonly MutationTarget[], testFiles: readonly string[]): void {
  const body = `// GENERATED by check-mutation-diff.ts for this branch's diff — do not commit, do not edit.
export default {
  testRunner: "bun",
  plugins: ["@hughescr/stryker-bun-runner"],
  // Constraint 2: without perTest there is no per-test attribution at all, and the rung's entire
  // question ("did THIS branch's tests kill it?") becomes unanswerable.
  coverageAnalysis: "perTest",
  // Constraint 3: with Stryker's default bail the plugin stops at the first failing test, so
  // killedBy holds only whichever covering test ran first — the branch's own new test can be
  // missing from it even though it also kills, and the rung would red a landing that did its job.
  disableBail: true,
  mutate: ${JSON.stringify(targets.flatMap((t) => t.mutateGlobs))},
  bun: { testFiles: ${JSON.stringify(testFiles)} },
  reporters: ["json"],
  jsonReporter: { fileName: ${JSON.stringify(REPORT_FILE)} },
  concurrency: 4,
  timeoutMS: 60000,
  tempDirName: ".stryker-tmp",
  // typescript@7 exports no compiler API (ADR-0400 D3), so Stryker's tsconfig preprocessor throws if
  // it finds a real one. Pointing at a path that does not exist is the fix increment 1 established.
  tsconfigFile: "stryker-no-tsconfig.json",
};
`;
  writeFileSync(path.join(repoRoot, CONFIG_FILE), body, "utf8");
}

/**
 * The tests to run: this branch's own changed tests, plus each mutated file's existing sibling suite.
 *
 * DELIBERATELY NARROW, and the first attempt proved why. Handing Stryker the whole project's test
 * set ran `packages/cli`'s entire suite — integration tests that spawn child processes included —
 * inside a sandbox that also contains this rung's own generated config, and the dry run died before
 * a single mutant was tested. It was also the wrong shape on cost: the rung asks about a handful of
 * changed lines, so running hundreds of unrelated test files to answer it is work with no bearing
 * on the question.
 *
 * The sibling suite is included even when the branch did not touch it, and that is not slack: it is
 * what lets a mutant killed by the file's EXISTING tests be reported as `killed-by-others` rather
 * than as a survivor. Both are red, but only one tells the author the truth about what happened.
 */
function testFilesFor(
  targets: readonly MutationTarget[],
  changedTestFiles: readonly string[],
): string[] {
  const files = new Set<string>(changedTestFiles.filter(isTestFile).filter((f) => !isSpawnUatTest(f)));
  for (const target of targets) {
    for (const source of target.sourceFiles) {
      const sibling = siblingTestFor(source);
      if (isSpawnUatTest(sibling)) continue;
      if (existsSync(path.join(repoRoot, sibling))) files.add(sibling);
    }
  }
  return [...files].sort();
}


/** A workspace project's own `test` script, or `undefined` when it declares none. */
function testScriptOf(dir: string): string | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, dir, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    return manifest.scripts?.test;
  } catch {
    return undefined;
  }
}

function main(): void {
  const base = resolveBaseRef();
  console.log(`${TAG} base: ${base.because}`);

  const ranges = changedRanges(base);
  const existingFiles = new Set(
    ranges.map((r) => r.file).filter((f) => existsSync(path.join(repoRoot, f))),
  );
  const rootScripts = (
    JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    }
  ).scripts;
  // NARROW TO WHAT THE BUN RUNNER CAN ACTUALLY EXECUTE, and say what that leaves out.
  // A `vitest run` project's suite needs a DOM environment this runner does not provide, so handing
  // Stryker one kills the dry run before a single mutant is tested — see {@link runsUnderBun}.
  const allProjects = discoverWorkspaceProjects(repoRoot);
  const projects = allProjects.filter((p) => runsUnderBun(testScriptOf(p.dir)));
  const outOfReach = allProjects.filter((p) => !runsUnderBun(testScriptOf(p.dir)));
  const touchedOutOfReach = outOfReach.filter((p) =>
    ranges.some((r) => r.file.split("\\").join("/").startsWith(`${p.dir}/`)),
  );
  for (const p of touchedOutOfReach) {
    console.log(
      `${TAG} NARROWED: ${p.dir} is out of this rung's reach — its own test script is ` +
        `\`${(testScriptOf(p.dir) ?? "(none)").trim()}\`, and Stryker's bun runner cannot execute it. ` +
        "This branch's changes there are neither mutated nor used as covering tests.",
    );
  }

  const selection = selectMutationTargets({
    changed: ranges,
    projects,
    existingFiles,
    exemptFiles: new Set(entryPointsFromScripts(rootScripts ?? {})),
  });

  for (const file of selection.exempted) {
    // Loud, never silent: an exemption a reader cannot see is indistinguishable from a file the
    // rung simply failed to notice.
    console.log(`${TAG} EXEMPT (executable entry point, invoked by a root script): ${file}`);
  }

  if (selection.targets.length === 0) {
    // The commonest outcome this rung has, and the one CI cannot inherit the code for — a corpus,
    // docs or config landing changes no mutable TypeScript. `skipDisposition` owns the fork.
    const skip = skipDisposition({
      inCi: process.env["CI"] === "true",
      gateSkipExitCode: GATE_SKIP_EXIT_CODE,
    });
    console.log(`${TAG} ${skip.label} — ${selection.skipReason ?? "nothing to mutate"}`);
    if (skip.exitCode !== 0) process.exit(skip.exitCode);
    return;
  }

  if (selection.changedTestFiles.length === 0) {
    console.error(`${TAG} this branch changes source under src/ but adds or changes NO test file:`);
    for (const target of selection.targets) {
      for (const file of target.sourceFiles) console.error(`${TAG}   ${file}`);
    }
    console.error(`${TAG} the rung asks whether THIS branch's own tests kill the mutants in its own`);
    console.error(`${TAG} changed lines. With no changed test, the answer is no by construction.`);
    process.exit(1);
  }

  const testFiles = testFilesFor(selection.targets, selection.changedTestFiles);
  const spans = selection.targets.reduce((n, t) => n + t.mutateGlobs.length, 0);
  console.log(
    `${TAG} mutating ${spans} changed line span(s) across ${selection.targets.flatMap((t) => t.sourceFiles).length} file(s) in ${selection.targets.length} project(s)`,
  );

  // NEVER SILENT: an excluded acceptance leg is named, on the same rule every other exemption here
  // follows. See {@link isSpawnUatTest} for the measured reason and the cost being accepted.
  const excludedUat = selection.changedTestFiles.filter(isSpawnUatTest);
  if (excludedUat.length > 0) {
    console.log(
      `${TAG} excluding ${excludedUat.length} spawn-based acceptance leg(s) from the mutation ` +
        `runner — they spawn a real binary and a real fixture server, which cannot survive Stryker's ` +
        `re-runs and abort the whole rung: ${excludedUat.join(", ")}`,
    );
  }

  // Every changed test was an acceptance leg and no sibling unit suite exists — there is no witness
  // to attribute a kill to, so running Stryker would prove nothing about this branch. Reported as a
  // SKIP through the same disposition every other "nothing to mutate" branch uses, so CI (which must
  // never see the reserved skip code) gets a plain 0 and a named reason.
  if (testFiles.length === 0) {
    const disposition = skipDisposition({
      inCi: process.env["CI"] === "true",
      gateSkipExitCode: GATE_SKIP_EXIT_CODE,
    });
    console.log(
      `${TAG} ${disposition.label} — this branch's only changed tests are spawn-based acceptance ` +
        `legs, which are excluded above, and no sibling unit suite covers the changed source. ` +
        `Nothing would be proved by mutating.`,
    );
    process.exit(disposition.exitCode);
  }

  mkdirSync(path.join(repoRoot, "reports"), { recursive: true });
  rmSync(path.join(repoRoot, REPORT_FILE), { force: true });
  writeConfig(selection.targets, testFiles);

  try {
    const run = spawnSync("pnpm", ["exec", "stryker", "run", CONFIG_FILE], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    const reportPath = path.join(repoRoot, REPORT_FILE);
    if (!existsSync(reportPath)) {
      console.error(`${TAG} Stryker produced no report (exit ${run.status ?? "unknown"}) — nothing was proved`);
      process.exit(1);
    }

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as MutationReport;
    const verdict = adjudicateMutants(report, selection.changedTestFiles);
    const body = formatMutationVerdict(TAG, verdict, selection.targets);

    if (verdict.verdict === "pass") {
      console.log(body);
      return;
    }
    console.error(body);
    process.exit(1);
  } finally {
    rmSync(path.join(repoRoot, CONFIG_FILE), { force: true });
  }
}

try {
  main();
} catch (err) {
  if (err instanceof VacuousOwnershipSweep) {
    // No base revision means the rung cannot tell which lines are this branch's — so it has proved
    // NOTHING, which is a loud failure and never a skip. A skip here would be indistinguishable
    // from "your branch touched no source", the one answer this state cannot support.
    console.error(`${TAG} BLIND RUNG — ${err.message}`);
    console.error(`${TAG} run \`git fetch origin\` so \`origin/main\` resolves, then re-run`);
    process.exit(1);
  }
  throw err;
}
