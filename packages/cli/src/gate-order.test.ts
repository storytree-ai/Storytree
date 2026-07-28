import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPENSIVE_STEPS,
  PRE_EXPENSIVE_CHECKS,
  evaluateGateOrder,
  firstExpensiveIndex,
  parseGateChain,
} from "./gate-order.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** The REAL root `gate` script — the thing under test; a missing one is a failure, never a skip. */
function realGateScript(): string {
  const raw: unknown = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const scripts = (raw as { scripts?: Record<string, unknown> }).scripts;
  const gate = scripts?.["gate"];
  assert.equal(typeof gate, "string", "the root package.json must declare a `gate` script");
  return gate as string;
}

// ── the parser ──────────────────────────────────────────────────────────────

test("parseGateChain splits on && and names each step's check", () => {
  const steps = parseGateChain("pnpm check:manifest && pnpm -r typecheck && pnpm check:declared");
  assert.deepEqual(
    steps.map((s) => s.check),
    ["check:manifest", undefined, "check:declared"],
  );
  assert.equal(steps[1]?.command, "pnpm -r typecheck");
});

test("firstExpensiveIndex finds the earliest minutes-cost leg, not the last", () => {
  const steps = parseGateChain("pnpm check:manifest && pnpm -r typecheck && pnpm -r test");
  assert.equal(firstExpensiveIndex(steps), 1);
});

// ── the invariant ───────────────────────────────────────────────────────────

test("evaluateGateOrder passes a chain whose cheap checks all precede the expensive legs", () => {
  const v = evaluateGateOrder({
    steps: parseGateChain("pnpm check:declared && pnpm -r typecheck && pnpm -r test && pnpm check:late"),
    earlyChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "ok");
  assert.deepEqual(v.misordered, []);
});

test("evaluateGateOrder FAILS a cheap check stranded behind the expensive legs, naming the fix", () => {
  const v = evaluateGateOrder({
    steps: parseGateChain("pnpm check:manifest && pnpm -r typecheck && pnpm -r test && pnpm check:declared"),
    earlyChecks: new Set(["check:manifest", "check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.misordered, ["check:declared"]);
  assert.match(v.message, /run AFTER/);
  assert.match(v.message, /root package\.json `gate` script/);
});

test("evaluateGateOrder fails CLOSED on a chain with no recognised expensive leg", () => {
  // "nothing runs after the wall" is vacuously true when the wall was never found.
  const v = evaluateGateOrder({
    steps: parseGateChain("pnpm check:manifest && pnpm check:declared"),
    earlyChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.match(v.message, /expensive legs were not recognised/);
});

test("evaluateGateOrder fails CLOSED on a declared cheap-first check the chain no longer runs", () => {
  const v = evaluateGateOrder({
    steps: parseGateChain("pnpm -r typecheck && pnpm -r test"),
    earlyChecks: new Set(["check:declared"]),
  });
  assert.equal(v.verdict, "fail");
  assert.deepEqual(v.missing, ["check:declared"]);
  assert.match(v.message, /not in the chain at all/);
});

// ── the real chain ──────────────────────────────────────────────────────────

test("the REAL gate chain runs every seconds-cost check before typecheck and test", () => {
  const v = evaluateGateOrder({
    steps: parseGateChain(realGateScript()),
    earlyChecks: PRE_EXPENSIVE_CHECKS,
  });
  assert.equal(v.verdict, "ok", v.message);
});

test("check:declared — the claim rung — is one of the checks pinned ahead of the expensive legs", () => {
  // The rung whose late position was filed four times in five days (see gate-order.ts). Pinned by
  // name so removing it from the set is a deliberate edit rather than a quiet regression.
  assert.ok(PRE_EXPENSIVE_CHECKS.has("check:declared"));

  const steps = parseGateChain(realGateScript());
  const at = steps.findIndex((s) => s.check === "check:declared");
  assert.notEqual(at, -1, "the gate chain must run check:declared");
  assert.ok(at < firstExpensiveIndex(steps), "check:declared must run before the expensive legs");
});

test("the REAL gate chain still runs both expensive legs (the wall this invariant is measured against)", () => {
  const chain = realGateScript();
  for (const leg of EXPENSIVE_STEPS) {
    assert.ok(chain.includes(leg), `the gate chain must still run \`${leg}\``);
  }
});
