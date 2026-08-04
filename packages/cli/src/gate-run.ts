// `pnpm gate` — the runner that walks GATE_PLAN, runs EVERY step, and reports per-step.
//
// This is the thin I/O shell. The plan and its ordering invariant are `gate-order.ts`; the walk, the
// three statuses and the exit rule are the pure `gate-runner.ts`, which is where the WHY is written
// down. This file only: resolves the repo root, checks the plan against the real `package.json`,
// spawns each step, and prints.
//
// FAIL-CLOSED BEFORE IT RUNS ANYTHING. A planned step naming a script the root `package.json` does
// not declare would otherwise surface as a shell error mid-run; it refuses up front instead, because
// a plan that has drifted from the scripts it names is not a plan anyone should be reading verdicts
// from. The converse — a `check:*` script that exists but is NOT in the plan, which would make the
// gate silently never run it — is fenced by `gate-order.test.ts` in `pnpm -r test` rather than here,
// so it fails on the branch that adds the check rather than for whoever next runs the gate.
//
// OUTPUT CONTRACT. Every step's banner and result stream as it happens, so a run that is KILLED
// still leaves per-step outcomes in the log rather than nothing; the summary table at the end is the
// same information collected. Steps inherit stdio, so each check prints exactly what it always did.
// Callers that read only the exit code (`scripts/gate-bg.sh` via PIPESTATUS) are unaffected: any
// step not passing still exits non-zero.
//
// NOT PARALLELISED, deliberately — steps share a working tree, a live DB, and `pnpm -r` already fans
// out internally. Interleaved output and shared connections are a different unit with different
// risks, and mixing them in would make this one's proof about scheduling instead of about reporting.
//
// AFFECTED SCOPE (ADR-0304 D1/D2). Before walking the plan this resolves what the branch changes and
// narrows the two expensive legs to those packages plus their dependents, through the SAME classifier
// CI runs (`ci-affected.ts`) — one implementation, because two that could disagree would mean a local
// pass stopped predicting a CI pass. The git reading is here; the judgement is `gate-scope.ts`.
// Every failure mode widens to the full `-r` run, and `--full` / `STORYTREE_GATE_FULL=1` forces it.
// `--scope` prints the decision and exits, so "what will my gate actually test?" is a question you
// ask rather than infer from a five-minute run.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverWorkspaceProjects, pnpmArgsFor, type AffectedScope } from "./ci-affected.js";
import {
  GATE_PLAN,
  type GateStep,
  PRE_EXPENSIVE_CHECKS,
  SHARED_ENVIRONMENT_CHECKS,
  evaluateGateOrder,
  isExpensiveStep,
} from "./gate-order.js";
import {
  gitLines,
  localAffectedScope,
  renderScopeNotice,
  scopeGatePlan,
  type LocalDiff,
} from "./gate-scope.js";
import {
  type GateExecution,
  gateExitCode,
  renderGateSummary,
  runGate,
  tallyGate,
} from "./gate-runner.js";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const TAG = "[gate]";

/** Every script name the root `package.json` declares. */
function rootScriptNames(): Set<string> {
  const raw: unknown = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const scripts = (raw as { scripts?: Record<string, unknown> }).scripts ?? {};
  return new Set(Object.keys(scripts));
}

/** Run one read-only git command in the repo root. */
function git(args: string[]): { ok: boolean; stdout: string; detail: string } {
  const res = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (res.error !== undefined || res.status !== 0) {
    const detail = res.error?.message ?? res.stderr?.trim() ?? `exit ${res.status}`;
    return { ok: false, stdout: "", detail: `git ${args.join(" ")} failed: ${detail}` };
  }
  return { ok: true, stdout: res.stdout, detail: "" };
}

/**
 * What this branch changes on top of `main` — the local analogue of CI's `HEAD^1..HEAD` on the PR
 * merge commit (ADR-0304 D2).
 *
 * THE WORKING TREE IS PART OF THE ANSWER, and that is the whole reason this cannot just reuse the CI
 * shell. A session runs the gate mid-flight: its changes may be committed, staged, unstaged or
 * untracked. `git diff <merge-base>` with no second revision compares that base to the WORKING TREE,
 * which covers the first three; `ls-files --others` adds the fourth. A file the session has not
 * committed yet is still a file this run must test.
 *
 * `origin/main` STALENESS IS SAFE IN THE ONLY DIRECTION THAT MATTERS. An unfetched `origin/main` puts
 * the merge base further back, so the diff gets WIDER and more packages are selected — never fewer.
 * A missing `origin/main` is not an error either; it is simply the full run.
 */
function localDiff(): LocalDiff {
  const base = git(["merge-base", "origin/main", "HEAD"]);
  if (!base.ok) {
    return {
      ok: false,
      reason: "no merge-base with origin/main (unfetched, shallow, or detached) — the full suite is the backstop",
    };
  }
  const mergeBase = base.stdout.trim();
  if (mergeBase === "") {
    return { ok: false, reason: "merge-base with origin/main resolved to nothing — running the full suite" };
  }
  // --no-renames: a rename must list BOTH paths, so the old file's project is selected too.
  const tracked = git(["diff", "--name-only", "--no-renames", mergeBase]);
  if (!tracked.ok) return { ok: false, reason: tracked.detail };
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  if (!untracked.ok) return { ok: false, reason: untracked.detail };
  return { ok: true, files: [...gitLines(tracked.stdout), ...gitLines(untracked.stdout)] };
}

/** Resolve the scope, absorbing any surprise into the conservative answer. */
function resolveScope(full: boolean): AffectedScope {
  if (full) return { mode: "full", reason: "forced by --full / STORYTREE_GATE_FULL" };
  try {
    return localAffectedScope(localDiff(), discoverWorkspaceProjects(repoRoot));
  } catch (err) {
    return { mode: "full", reason: `unexpected error resolving scope: ${(err as Error).message}` };
  }
}

/** Run one step in the repo root, inheriting stdio so it prints exactly what it always did. */
function executeStep(step: GateStep): GateExecution {
  const res = spawnSync(step.command, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true,
  });
  if (res.error !== undefined) {
    return { exitCode: null, note: `could not start: ${res.error.message}` };
  }
  // Killed mid-flight: it produced no verdict, so it is UNVERIFIED rather than failed.
  if (res.signal !== null && res.signal !== undefined) {
    return { exitCode: null, unverified: true, note: `killed by ${res.signal}` };
  }
  return { exitCode: res.status };
}

function main(): void {
  const argv = process.argv.slice(2);
  const failFast =
    argv.includes("--fail-fast") || (process.env["STORYTREE_GATE_FAIL_FAST"] ?? "") !== "";
  const forceFull = argv.includes("--full") || (process.env["STORYTREE_GATE_FULL"] ?? "") !== "";

  // --- the plan must match the scripts it names ------------------------------------------------
  const declared = rootScriptNames();
  const unknown = GATE_PLAN.filter(
    (s) => s.check !== undefined && !declared.has(s.check),
  ).map((s) => s.check);
  if (unknown.length > 0) {
    console.error(
      `${TAG} REFUSED — GATE_PLAN names ${unknown.length} script(s) the root package.json does not ` +
        `declare: ${unknown.join(", ")}.`,
    );
    console.error(
      `${TAG}   The plan has drifted from the scripts it runs; fix packages/cli/src/gate-order.ts ` +
        `(or re-add the script) before trusting any verdict from it.`,
    );
    process.exitCode = 1;
    return;
  }

  // --- affected scope (ADR-0304 D1/D2) ----------------------------------------------------------
  const scope = resolveScope(forceFull);
  const steps = scopeGatePlan(GATE_PLAN, pnpmArgsFor(scope));

  // `--scope` answers "what will my gate actually test?" without spending the run to find out. The
  // narrowing is only trustworthy if it is inspectable: a session that reads FULL where it expected
  // a narrow scope has learned something (a root file crept into the diff), and one that reads a
  // narrow scope can see exactly which projects carry the proof.
  if (argv.includes("--scope")) {
    console.log(`${TAG} ${renderScopeNotice(scope)}`);
    console.log(`${TAG} the two expensive legs would run as:`);
    for (const step of steps.filter((s) => isExpensiveStep(s.command))) {
      console.log(`${TAG}   ${step.command}`);
    }
    return;
  }

  // FAIL-CLOSED ON THE REWRITE ITSELF. `evaluateGateOrder` is the invariant that keeps cheap checks
  // ahead of the expensive legs and shared-environment checks behind them; it refuses a plan whose
  // expensive legs it cannot find. Re-running it over the SCOPED plan is what stops a rewrite from
  // quietly producing a plan nobody is judging any more — the failure mode ADR-0304 names as the
  // accepted risk of this whole change ("an under-computed graph lets a genuine break through, and
  // the failure is silent"). A refusal here is a bug in the scoping, so it says so and runs nothing.
  const order = evaluateGateOrder({
    steps,
    earlyChecks: PRE_EXPENSIVE_CHECKS,
    lateChecks: SHARED_ENVIRONMENT_CHECKS,
  });
  if (order.verdict !== "ok") {
    console.error(`${TAG} REFUSED — the affected-scoped plan no longer satisfies the gate's ordering invariant:`);
    for (const line of order.message.split("\n")) console.error(`${TAG}   ${line}`);
    console.error(
      `${TAG}   This is a defect in the scope rewrite (packages/cli/src/gate-scope.ts), not in your ` +
        `branch. Re-run with \`pnpm gate --full\` to gate meanwhile.`,
    );
    process.exitCode = 1;
    return;
  }

  // --- interruption ------------------------------------------------------------------------------
  // A step inherits stdio and runs synchronously, so on Ctrl+C the OS delivers the signal to the
  // child too and `executeStep` reports it. This flag covers the gap BETWEEN steps.
  // Registering a handler suppresses Node's default exit-on-signal, which is what lets the summary
  // print at all; a SECOND signal must therefore still be able to kill the runner outright, or Ctrl+C
  // would stop working. First one stops the walk gracefully, second one exits.
  let interrupted = false;
  const signals = ["SIGINT", "SIGTERM"] as const;
  const onSignal = (sig: string) => () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log(`\n${TAG} ${sig} — stopping after the current step; remaining steps report NOT RUN.`);
  };
  const handlers = signals.map((sig) => {
    const handler = onSignal(sig);
    process.on(sig, handler);
    return [sig, handler] as const;
  });

  const total = steps.length;
  console.log(
    `${TAG} running ${total} steps${failFast ? " (--fail-fast: stops at the first red)" : ""}. ` +
      `Every step runs and is reported PASS / FAIL / NOT RUN; the gate is green only if all pass.`,
  );
  console.log(`${TAG} ${renderScopeNotice(scope)}`);
  if (scope.mode === "affected") {
    console.log(
      `${TAG} CI classifies the same diff with the same rules (ADR-0304 D2) and re-proves the merged ` +
        `tree; \`pnpm gate --full\` runs every package here.`,
    );
  }

  const results = runGate({
    steps,
    execute: executeStep,
    failFast,
    shouldStop: () => interrupted,
    onStepStart: (step, index) => {
      console.log(`\n${TAG} ─── [${index + 1}/${total}] ${step.command} ───`);
    },
    onStepDone: (result, index) => {
      const suffix = result.note !== undefined ? ` — ${result.note}` : "";
      console.log(`${TAG} [${index + 1}/${total}] ${result.status.toUpperCase()}: ${result.command}${suffix}`);
    },
  });

  // A registered signal listener keeps the event loop alive, which would hang the gate here instead
  // of letting it exit with the verdict it just computed.
  for (const [sig, handler] of handlers) process.off(sig, handler);

  for (const line of renderGateSummary(results)) console.log(line);

  const tally = tallyGate(results);
  if (tally.notRun > 0 && !failFast && !interrupted) {
    console.log(
      `${TAG} note: ${tally.notRun} step(s) did not run. Under the default run-all mode that means ` +
        `the run was interrupted or a step was killed — not that they passed.`,
    );
  }
  process.exitCode = gateExitCode(results);
}

main();
