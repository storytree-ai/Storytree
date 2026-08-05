import { readdirSync, readFileSync } from "node:fs";
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
  RETIRED_CHECKS,
  SHARED_ENVIRONMENT_CHECKS,
  UNWIRED_MARKER,
  evaluateGateOrder,
  firstExpensiveIndex,
  lastExpensiveIndex,
} from "./gate-order.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliSrc = fileURLToPath(new URL(".", import.meta.url));

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
  const steps = chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:late");
  assert.equal(firstExpensiveIndex(steps), 1);
  assert.equal(lastExpensiveIndex(steps), 2);
});

// ── axis 1: cheap-first ──────────────────────────────────────────────────────

test("evaluateGateOrder passes a plan whose cheap checks all precede the expensive legs", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:late"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(v.verdict, "ok");
  assert.deepEqual(v.misordered, []);
});

test("evaluateGateOrder FAILS a cheap check stranded behind the expensive legs, naming the fix", () => {
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm -r typecheck && pnpm -r test && pnpm check:agents"),
    earlyChecks: new Set(["check:boundaries", "check:agents"]),
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
    steps: chain("pnpm check:verification-decay && pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:verification-decay"]);
  assert.match(v.message, /may be a sibling session's/);
});

test("evaluateGateOrder measures axis 2 against the LAST expensive leg, not the first", () => {
  // Between typecheck and test is still ahead of the session's own answer.
  const v = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm check:verification-decay && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.premature, ["check:verification-decay"]);
});

// ── fail-closed ──────────────────────────────────────────────────────────────

test("evaluateGateOrder fails CLOSED on a plan with no recognised expensive leg", () => {
  // "nothing is on the wrong side of the wall" is vacuously true when the wall was never found.
  const v = evaluateGateOrder({
    steps: chain("pnpm check:boundaries && pnpm check:verification-decay"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(v.verdict, "fail");
  assert.match(v.message, /expensive legs were not recognised/);
});

test("evaluateGateOrder fails CLOSED on a declared check the plan no longer runs — either set", () => {
  const early = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set(["check:boundaries"]),
  });
  assert.equal(early.verdict, "fail");
  assert.deepEqual(early.missing, ["check:boundaries"]);
  assert.match(early.message, /not in the plan at all/);

  const late = evaluateGateOrder({
    steps: chain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set<string>(),
    lateChecks: new Set(["check:verification-decay"]),
  });
  assert.equal(late.verdict, "fail");
  assert.deepEqual(late.missing, ["check:verification-decay"]);
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

test("the REAL gate plan is exactly the nine audited survivors in their declared order", () => {
  assert.deepEqual(
    GATE_PLAN.map((step) => step.command),
    [
      "pnpm check:boundaries",
      "pnpm check:mirror-conformance",
      "pnpm check:web-grounding",
      "pnpm check:web-engine",
      "pnpm -r typecheck",
      "pnpm -r test",
      "pnpm check:guidance",
      "pnpm check:agents",
      "pnpm check:verification-decay",
    ],
  );
});

test("the three live/shared checks are pinned LATE", () => {
  for (const check of ["check:guidance", "check:agents", "check:verification-decay"]) {
    assert.ok(SHARED_ENVIRONMENT_CHECKS.has(check));
    assert.ok(!PRE_EXPENSIVE_CHECKS.has(check));
    const at = GATE_PLAN.findIndex((s) => s.check === check);
    assert.notEqual(at, -1, `the gate plan must still run ${check}`);
    assert.ok(at > lastExpensiveIndex(GATE_PLAN), `${check} must run after the expensive legs`);
  }
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

// ── the tombstone vs. the real source tree (ADR-0311 D2/D5) ──────────────────
//
// The three tests above guard a check that EXISTS but never runs. These guard the mirror image: a
// check that RUNS NOWHERE but still exists. ADR-0311 kept the retired implementations deliberately
// and named the cost in its Consequences — "discoverable code whose unwired status must not be
// mistaken for a forgotten gate rung" — without paying it. These pay it, mechanically, so the
// status cannot rot back into prose.

/** Every distinct file the tombstone claims survived, deduped across checks that shared one. */
function retiredSources(): string[] {
  return [...new Set([...RETIRED_CHECKS.values()].flatMap((entry) => entry.sources))].sort();
}

/** The `src/<name>.ts` entrypoints the root `check:*` scripts actually invoke. */
function wiredEntrypoints(): Set<string> {
  const wired = new Set<string>();
  for (const [name, command] of Object.entries(rootScripts())) {
    if (!name.startsWith("check:")) continue;
    for (const [, file] of command.matchAll(/\bsrc\/([\w.-]+\.ts)\b/g)) {
      if (file !== undefined) wired.add(file);
    }
  }
  return wired;
}

test("no retired check has quietly returned as a root script", () => {
  // A retired name reappearing in package.json is either a deliberate re-wiring — which ADR-0311 D5
  // says needs fresh production-catch evidence and an ADR, not just a script line — or an
  // accident. Either way the tombstone above is then lying, and this is where that surfaces.
  const resurrected = [...RETIRED_CHECKS.keys()].filter((name) => Object.hasOwn(rootScripts(), name));

  assert.deepEqual(
    resurrected,
    [],
    `these checks are declared RETIRED but the root package.json declares them: ${resurrected.join(", ")}. ` +
      "Re-wiring a retired rung needs new evidence and an ADR (ADR-0311 D5); if that happened, remove " +
      "it from RETIRED_CHECKS, add it to GATE_PLAN, and drop its UNWIRED banner.",
  );
});

test("every surviving retired source exists and carries the UNWIRED banner", () => {
  // THE LOAD-BEARING ONE. This is what stops a tested, confident-looking, wired-to-nothing fence
  // from reading as enforcement — the defect that put a false "enforced rather than merely advised"
  // claim into the `test-creation-principles` artifact a day after `check:test-timing` was retired.
  const unmarked: string[] = [];
  const missing: string[] = [];

  for (const file of retiredSources()) {
    let body: string;
    try {
      body = readFileSync(path.join(cliSrc, file), "utf8");
    } catch {
      missing.push(file);
      continue;
    }
    if (!body.includes(UNWIRED_MARKER)) unmarked.push(file);
  }

  assert.deepEqual(
    missing,
    [],
    `RETIRED_CHECKS names ${missing.join(", ")}, which no longer exist. A deleted source is fine — ` +
      "drop it from the inventory so the tombstone keeps describing the real tree.",
  );
  assert.deepEqual(
    unmarked,
    [],
    `these retired sources do not carry the \`${UNWIRED_MARKER}\` banner: ${unmarked.join(", ")}. ` +
      "Each still compiles and its own tests still pass, so without the banner a reader has no way " +
      "to tell it enforces nothing. Add the banner, or — if it was re-wired — update RETIRED_CHECKS.",
  );
});

test("every check-shaped source file is either wired into the gate or declared retired", () => {
  // The completeness half: the two tests above only judge files someone remembered to inventory.
  // This one judges the DIRECTORY, so a newly orphaned check cannot slip in unlisted and a session
  // reading `RETIRED_CHECKS` can trust it to be the whole tombstone rather than a sample.
  const wired = wiredEntrypoints();
  const retired = new Set(retiredSources());
  const unaccounted = readdirSync(cliSrc)
    .filter((file) => /^check-.+\.ts$|.+-check\.ts$/.test(file) && !file.endsWith(".test.ts"))
    .filter((file) => !wired.has(file) && !retired.has(file))
    .sort();

  assert.deepEqual(
    unaccounted,
    [],
    `these files look like gate checks but are neither invoked by a root check:* script nor listed ` +
      `in RETIRED_CHECKS: ${unaccounted.join(", ")}. Wire it, or declare it retired and banner it — ` +
      "an unaccounted check-shaped file is exactly the ambiguity this inventory exists to remove.",
  );
});
