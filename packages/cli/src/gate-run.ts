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

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GATE_PLAN, type GateStep } from "./gate-order.js";
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

  const total = GATE_PLAN.length;
  console.log(
    `${TAG} running ${total} steps${failFast ? " (--fail-fast: stops at the first red)" : ""}. ` +
      `Every step runs and is reported PASS / FAIL / NOT RUN; the gate is green only if all pass.`,
  );

  const results = runGate({
    steps: GATE_PLAN,
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
