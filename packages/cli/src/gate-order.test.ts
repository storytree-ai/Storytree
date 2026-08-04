import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPENSIVE_STEPS,
  GATE_PLAN,
  type GateStep,
  NON_GATE_CHECK_SCRIPTS,
  PRE_EXPENSIVE_CHECKS,
  SHARED_ENVIRONMENT_CHECKS,
  evaluateGateOrder,
  firstExpensiveIndex,
  lastExpensiveIndex,
} from "./gate-order.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** The REAL root scripts — a missing `gate` script is a failure, never a skip. */
function rootScripts(): Record<string, string> {
  const raw: unknown = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const scripts = (raw as { scripts?: Record<string, string> }).scripts;
  assert.ok(scripts !== undefined, "the root package.json must declare scripts");
  assert.equal(typeof scripts["gate"], "string", "the root package.json must declare a `gate` script");
  return scripts;
}

/** Terse fixture builder for the evaluator's unit tests. */
function chain(spec: string): GateStep[] {
  return spec
    .split("&&")
    .map((raw) => raw.trim())
    .filter((command) => command !== "")
    .map((command) => {
      const name = /\bpnpm\s+(check:[\w-]+)/.exec(command)?.[1];
      return { command, check: name ?? undefined };
    });
}

// ── the walls ────────────────────────────────────────────────────────────────

test("firstExpensiveIndex finds the earliest minutes-cost leg, lastExpensiveIndex the latest", () => {
  const steps = chain("pnpm check:manifest && pnpm -r typecheck && pnpm -r test && pnpm check:late");
  assert.equal(firstExpensiveIndex(steps), 1);
  assert.equal(lastExpensiveIndex(steps), 2);
});

// ── axis 1: cheap-first ──────────────────────────────────────────────────────

test("evaluateGateOrder passes a plan whose cheap checks all precede the expensive legs", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:declared && pnpm -r typecheck && pnpm -r test && pnpm check:late"),
    earlyChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "ok");
  assert.deepEqual(v.misordered, []);
});

test("evaluateGateOrder FAILS a cheap check stranded behind the expensive legs, naming the fix", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:manifest && pnpm -r typecheck && pnpm -r test && pnpm check:agents"),
    earlyChecks: new Set(["check:manifest", "check:agents"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.misordered, ["check:agents"]);
  assert.match(v.message, /run AFTER/);
  assert.match(v.message, /GATE_PLAN/);
});

// ── axis 2: the session's own work before the shared environment ─────────────

test("evaluateGateOrder FAILS a shared-environment check that runs before the expensive legs", () => {
  // The axis-2 regression: a check that can red on a sibling's state, ahead of the session's own answer.
  const v = evaluateGateOrder({
    steps: chain("pnpm check:declared && pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:declared"]);
  assert.match(v.message, /may be a sibling session's/);
});

test("evaluateGateOrder measures axis 2 against the LAST expensive leg, not the first", () => {
  // Between typecheck and test is still ahead of the session's own answer.
  const v = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm check:declared && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:declared"]);
});

// ── fail-closed ──────────────────────────────────────────────────────────────

test("evaluateGateOrder fails CLOSED on a plan with no recognised expensive leg", () => {
  // "nothing is on the wrong side of the wall" is vacuously true when the wall was never found.
  const v = evaluateGateOrder({
    steps: chain("pnpm check:manifest && pnpm check:declared"),
    earlyChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.match(v.message, /expensive legs were not recognised/);
});

test("evaluateGateOrder fails CLOSED on a declared check the plan no longer runs — either set", () => {
  const early = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set(["check:manifest"]),
  });
  assert.equal(early.verdict, "fail");
  assert.deepEqual(early.missing, ["check:manifest"]);
  assert.match(early.message, /not in the plan at all/);

  const late = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:declared"]),
  });
  assert.equal(late.verdict, "fail");
  assert.deepEqual(late.missing, ["check:declared"]);
});

// ── the REAL plan ────────────────────────────────────────────────────────────

test("the REAL gate plan honours BOTH ordering axes", () => {
  const v = evaluateGateOrder({
    steps: GATE_PLAN,
    earlyChecks: PRE_EXPENSIVE_CHECKS,
    lateChecks: SHARED_ENVIRONMENT_CHECKS,
  });
  assert.equal(v.verdict, "ok", v.message);
});

test("the REAL gate plan still runs both expensive legs (the wall the axes are measured against)", () => {
  for (const leg of EXPENSIVE_STEPS) {
    assert.ok(
      GATE_PLAN.some((s) => s.command.includes(leg)),
      `the gate plan must still run \`${leg}\``,
    );
  }
});

test("check:declared — the claim rung — is pinned LATE, and the move is deliberate", () => {
  // It sat cheap-first until 2026-08-04. Under the run-every-step runner an early red no longer
  // hides the rest, and its lobby arm reds on another session's dirt (ADR-0245 D5.2 D3 forbids this
  // session remediating it) — so it must not precede the session's own answer. Pinned by name in
  // BOTH directions so neither position can drift back in silence. Reasoning: gate-order.ts header.
  assert.ok(SHARED_ENVIRONMENT_CHECKS.has("check:declared"));
  assert.ok(!PRE_EXPENSIVE_CHECKS.has("check:declared"));

  const at = GATE_PLAN.findIndex((s) => s.check === "check:declared");
  assert.notEqual(at, -1, "the gate plan must still run check:declared");
  assert.ok(at > lastExpensiveIndex(GATE_PLAN), "check:declared must run after the expensive legs");
});

test("the two ordering sets are disjoint — no check may be pinned both early and late", () => {
  const both = [...PRE_EXPENSIVE_CHECKS].filter((n) => SHARED_ENVIRONMENT_CHECKS.has(n));
  assert.deepEqual(both, [], "a check pinned to both sides makes the invariant unsatisfiable");
});

test("every step in the plan carries a subject, a cost, and a stated reason", () => {
  for (const step of GATE_PLAN) {
    assert.ok(step.why.length > 0, `${step.command} must record WHY it is ${step.subject}`);
    assert.equal(
      step.cost,
      EXPENSIVE_STEPS.some((leg) => step.command.includes(leg)) ? "minutes" : "seconds",
      `${step.command}: declared cost must match whether it is an expensive leg`,
    );
  }
});

test("the plan's subject classification agrees with the two pinned sets", () => {
  for (const step of GATE_PLAN) {
    if (step.check === undefined) continue;
    if (SHARED_ENVIRONMENT_CHECKS.has(step.check)) {
      assert.equal(step.subject, "shared-environment", `${step.check} is pinned late`);
    } else if (PRE_EXPENSIVE_CHECKS.has(step.check)) {
      assert.equal(step.subject, "own-work", `${step.check} is pinned cheap-first`);
    }
  }
});

// ── the plan vs. the real package.json ───────────────────────────────────────

test("every step the plan names is a script the root package.json actually declares", () => {
  const scripts = rootScripts();
  for (const step of GATE_PLAN) {
    if (step.check === undefined) continue;
    assert.ok(
      Object.hasOwn(scripts, step.check),
      `GATE_PLAN runs \`${step.check}\`, which the root package.json does not declare`,
    );
  }
});

test("every check:* script the repo declares is IN the plan, or excluded with a reason", () => {
  // THE LOAD-BEARING ONE. Without it, adding a check to package.json and forgetting the plan makes
  // the gate silently never run it — a new instance of the exact defect class this arc guards
  // (`asset:unrun-check-is-unverified-not-refuted`). A silent skip must be impossible to introduce.
  const planned = new Set(GATE_PLAN.map((s) => s.check).filter((c) => c !== undefined));
  const unplanned = Object.keys(rootScripts())
    .filter((name) => name.startsWith("check:"))
    .filter((name) => !planned.has(name) && !NON_GATE_CHECK_SCRIPTS.has(name));

  assert.deepEqual(
    unplanned,
    [],
    `these check:* scripts exist but the gate never runs them: ${unplanned.join(", ")}. ` +
      `Add each to GATE_PLAN, or to NON_GATE_CHECK_SCRIPTS with the reason it is deliberately out.`,
  );
});

test("every deliberate exclusion still names a real script — a stale exemption is removed, not kept", () => {
  const scripts = rootScripts();
  for (const [name, reason] of NON_GATE_CHECK_SCRIPTS) {
    assert.ok(Object.hasOwn(scripts, name), `NON_GATE_CHECK_SCRIPTS excludes \`${name}\`, which no longer exists`);
    assert.ok(reason.length > 0, `${name} must record why it is out of the gate`);
  }
});

test("the root `gate` script invokes the runner, so GATE_PLAN is what actually runs", () => {
  // The plan is only the source of truth while the script points at the runner that walks it. If the
  // `gate` script is ever reverted to an `&&` chain, every assertion above becomes decoration.
  assert.match(rootScripts()["gate"] ?? "", /gate-run\.ts/);
});
