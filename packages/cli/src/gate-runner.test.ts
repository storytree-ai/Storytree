import test from "node:test";
import assert from "node:assert/strict";

import type { GateStep } from "./gate-order.js";
import {
  GATE_SKIP_EXIT_CODE,
  type GateExecution,
  type GateStepResult,
  gateExitCode,
  renderGateSummary,
  runGate,
  tallyGate,
} from "./gate-runner.js";

// Stub steps, never the real gate: the runner's contract is about SEQUENCING and REPORTING, and
// driving it through 25 real minutes would prove nothing extra while making the suite untestable.
function steps(...names: string[]): GateStep[] {
  return names.map((n) => ({ command: `pnpm ${n}`, check: n.startsWith("check:") ? n : undefined }));
}

/** An executor that reads exit codes off a table and RECORDS which steps it was actually asked to run. */
function scripted(codes: Record<string, number>) {
  const ran: string[] = [];
  const execute = (step: GateStep): GateExecution => {
    ran.push(step.command);
    return { exitCode: codes[step.command] ?? 0 };
  };
  return { ran, execute };
}

/** A monotonic fake clock — never a real timer (ADR-0276: wall clock is not a gate-tier assertion). */
function fakeClock(): () => number {
  let t = 0;
  return () => (t += 5);
}

const byCommand = (results: readonly GateStepResult[], command: string): GateStepResult => {
  const hit = results.find((r) => r.command === command);
  assert.ok(hit !== undefined, `no result for ${command}`);
  return hit;
};

// ── the defect this exists to close ──────────────────────────────────────────

test("a failing step does NOT stop the walk — every later step still executes and reports", () => {
  // The 2026-08-02 shape: check:declared reds at link 2, and under `&&` the four steps behind it —
  // including both that judge the session's own diff — were never run and never mentioned.
  const { ran, execute } = scripted({ "pnpm check:declared": 1 });
  const plan = steps("check:manifest", "check:declared", "-r typecheck", "-r test", "check:coverage");

  const results = runGate({ steps: plan, execute, now: fakeClock() });

  assert.deepEqual(ran, [
    "pnpm check:manifest",
    "pnpm check:declared",
    "pnpm -r typecheck",
    "pnpm -r test",
    "pnpm check:coverage",
  ]);
  assert.equal(byCommand(results, "pnpm check:declared").status, "fail");
  assert.equal(byCommand(results, "pnpm -r typecheck").status, "pass");
  assert.equal(byCommand(results, "pnpm -r test").status, "pass");
  assert.equal(byCommand(results, "pnpm check:coverage").status, "pass");
  assert.equal(gateExitCode(results), 1, "a red anywhere still fails the gate");
});

test("several independent failures are ALL reported, not just the first", () => {
  // The 2026-07-29 shape: a flake early hid a genuine check:corpus-content RED behind it.
  const { execute } = scripted({ "pnpm -r test": 1, "pnpm check:corpus-content": 1 });
  const plan = steps("-r test", "check:corpus-content", "check:node-version");

  const results = runGate({ steps: plan, execute, now: fakeClock() });

  assert.deepEqual(tallyGate(results), { pass: 1, fail: 2, notRun: 0, skip: 0 });
  assert.equal(byCommand(results, "pnpm check:corpus-content").status, "fail");
});

test("every step gets exactly one result, in plan order — an absent row can never mean 'passed'", () => {
  const { execute } = scripted({ "pnpm check:b": 1 });
  const plan = steps("check:a", "check:b", "check:c");

  const results = runGate({ steps: plan, execute, now: fakeClock() });

  assert.equal(results.length, plan.length);
  assert.deepEqual(
    results.map((r) => r.command),
    plan.map((s) => s.command),
  );
});

// ── SKIP is a fourth status: it RAN, and it verified nothing ─────────────────

test("a step exiting the reserved code reports SKIP, never PASS — the measured defect", () => {
  // The 2026-08-01 shape (#1051): nothing flaked and the chain exited 0, while DB-backed checks had
  // silently opted out. PASS was computed from the exit code, so opting out and verifying were
  // indistinguishable. Today's live instance is `check:web-grounding` with no `web/` submodule.
  const { execute } = scripted({ "pnpm check:web-grounding": GATE_SKIP_EXIT_CODE });
  const plan = steps("check:web-grounding", "check:boundaries");

  const results = runGate({ steps: plan, execute, now: fakeClock() });

  assert.equal(byCommand(results, "pnpm check:web-grounding").status, "skip");
  assert.notEqual(
    byCommand(results, "pnpm check:web-grounding").status,
    "pass",
    "a step that verified nothing must never read as PASS",
  );
  assert.deepEqual(tallyGate(results), { pass: 1, fail: 0, notRun: 0, skip: 1 });
});

test("a SKIP does not red the gate, and the summary says green is NARROWED", () => {
  const { execute } = scripted({ "pnpm check:web-grounding": GATE_SKIP_EXIT_CODE });
  const results = runGate({ steps: steps("check:web-grounding", "check:boundaries"), execute, now: fakeClock() });

  assert.equal(gateExitCode(results), 0, "a legitimate opt-out must not train sessions to ignore reds");

  const summary = renderGateSummary(results).join("\n");
  assert.match(summary, /SKIP {3}\s+pnpm check:web-grounding/, "the skipped step is named in the table");
  assert.match(summary, /GATE GREEN, NARROWED/, "green with a skip must not read as unqualified green");
  assert.match(summary, /SKIP is UNVERIFIED too/, "the reader is told what a skip did and did not prove");
});

test("SKIP and NOT RUN stay distinct — same epistemic class, different cause", () => {
  const { execute } = scripted({ "pnpm check:a": GATE_SKIP_EXIT_CODE, "pnpm check:b": 1 });
  const plan = steps("check:a", "check:b", "check:c");

  const results = runGate({ steps: plan, execute, failFast: true, now: fakeClock() });

  assert.equal(byCommand(results, "pnpm check:a").status, "skip", "asked, and answered 'nothing to check'");
  assert.equal(byCommand(results, "pnpm check:c").status, "not-run", "never asked at all");
  assert.equal(gateExitCode(results), 1, "the real red still fails the gate");
});

test("a SKIP never stops the walk — only a real failure can, and only under --fail-fast", () => {
  const { ran, execute } = scripted({ "pnpm check:a": GATE_SKIP_EXIT_CODE });
  const plan = steps("check:a", "check:b", "check:c");

  const results = runGate({ steps: plan, execute, failFast: true, now: fakeClock() });

  assert.deepEqual(ran, ["pnpm check:a", "pnpm check:b", "pnpm check:c"], "a skip is not a red");
  assert.equal(gateExitCode(results), 0);
});

test("the reserved skip code is not a value any ordinary failure produces", () => {
  // If a check could land on it by accident, a genuine failure would stop being counted.
  assert.notEqual(GATE_SKIP_EXIT_CODE, 0, "0 is PASS");
  assert.notEqual(GATE_SKIP_EXIT_CODE, 1, "1 is what process.exit(1) and an uncaught throw produce");
  assert.notEqual(GATE_SKIP_EXIT_CODE, 2, "2 is conventional shell misuse / bad arguments");

  const { execute } = scripted({ "pnpm check:a": 1, "pnpm check:b": 2 });
  const results = runGate({ steps: steps("check:a", "check:b"), execute, now: fakeClock() });
  assert.equal(byCommand(results, "pnpm check:a").status, "fail");
  assert.equal(byCommand(results, "pnpm check:b").status, "fail");
});

// ── NOT RUN is a third status, never collapsed into a neighbour ──────────────

test("--fail-fast reports the remainder NOT RUN — it never omits them and never calls them PASS", () => {
  const { ran, execute } = scripted({ "pnpm check:b": 1 });
  const plan = steps("check:a", "check:b", "check:c", "check:d");

  const results = runGate({ steps: plan, execute, failFast: true, now: fakeClock() });

  assert.deepEqual(ran, ["pnpm check:a", "pnpm check:b"], "nothing after the red is executed");
  assert.equal(byCommand(results, "pnpm check:c").status, "not-run");
  assert.equal(byCommand(results, "pnpm check:d").status, "not-run");
  assert.equal(byCommand(results, "pnpm check:c").exitCode, null);
  assert.equal(gateExitCode(results), 1);
});

test("an interrupted walk reports the untouched steps NOT RUN rather than green", () => {
  let calls = 0;
  const plan = steps("check:a", "check:b", "check:c");
  const results = runGate({
    steps: plan,
    execute: () => ({ exitCode: 0 }),
    // Interrupted after the first step.
    shouldStop: () => ++calls > 1,
    now: fakeClock(),
  });

  assert.equal(byCommand(results, "pnpm check:a").status, "pass");
  assert.equal(byCommand(results, "pnpm check:b").status, "not-run");
  assert.equal(byCommand(results, "pnpm check:c").status, "not-run");
  assert.equal(gateExitCode(results), 1, "not-run is unverified — it can never bank a pass");
});

test("a step KILLED mid-flight is NOT RUN (unverified), not FAIL — and it stops the walk", () => {
  const plan = steps("check:a", "check:b", "check:c");
  const results = runGate({
    steps: plan,
    execute: (step) =>
      step.command === "pnpm check:b"
        ? { exitCode: null, unverified: true, note: "killed by SIGINT" }
        : { exitCode: 0 },
    now: fakeClock(),
  });

  assert.equal(byCommand(results, "pnpm check:b").status, "not-run");
  assert.equal(byCommand(results, "pnpm check:b").note, "killed by SIGINT");
  assert.equal(byCommand(results, "pnpm check:c").status, "not-run");
});

test("a step that could not be SPAWNED is a FAIL — nothing ran, and nothing may pass on its behalf", () => {
  const plan = steps("check:a");
  const results = runGate({
    steps: plan,
    execute: () => ({ exitCode: null, note: "could not start: ENOENT" }),
    now: fakeClock(),
  });

  assert.equal(byCommand(results, "pnpm check:a").status, "fail");
  assert.equal(gateExitCode(results), 1);
});

// ── the exit rule: this must remain a gate that CAN go red ───────────────────

test("gateExitCode is 0 only when EVERY step passed", () => {
  const pass = (command: string): GateStepResult => ({
    command,
    status: "pass",
    exitCode: 0,
    durationMs: 1,
  });
  assert.equal(gateExitCode([pass("a"), pass("b")]), 0);
  assert.equal(
    gateExitCode([pass("a"), { command: "b", status: "fail", exitCode: 1, durationMs: 1 }]),
    1,
  );
  assert.equal(
    gateExitCode([pass("a"), { command: "b", status: "not-run", exitCode: null, durationMs: 0 }]),
    1,
    "an unverified step must never be reported green",
  );
});

test("an EMPTY run is red — a gate that proved nothing has not earned a pass", () => {
  // The `cannot-fail` guard for this module: a runner handed no steps must not exit 0.
  assert.equal(gateExitCode([]), 1);
});

// ── the summary a session actually reads ─────────────────────────────────────

test("the summary distinguishes FAIL from NOT RUN, and says what NOT RUN means", () => {
  const { execute } = scripted({ "pnpm check:b": 1 });
  const results = runGate({
    steps: steps("check:a", "check:b", "check:c"),
    execute,
    failFast: true,
    now: fakeClock(),
  });

  const text = renderGateSummary(results).join("\n");
  assert.match(text, /PASS\s+pnpm check:a/);
  assert.match(text, /FAIL\s+pnpm check:b/);
  assert.match(text, /NOT RUN\s+pnpm check:c/);
  assert.match(text, /1 passed, 1 failed, 0 skipped, 1 not run/);
  assert.match(text, /NOT RUN is UNVERIFIED, not passed/);
  assert.match(text, /GATE RED/);
});

test("an all-green run says so, and lists no FAILED or NOT RUN section", () => {
  const results = runGate({
    steps: steps("check:a", "check:b"),
    execute: () => ({ exitCode: 0 }),
    now: fakeClock(),
  });

  const text = renderGateSummary(results).join("\n");
  assert.match(text, /GATE GREEN — every step ran and passed/);
  assert.doesNotMatch(text, /NOT RUN/);
  assert.doesNotMatch(text, /FAILED:/);
});
