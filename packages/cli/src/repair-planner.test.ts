import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runDoctor, NODE_MAJOR_FLOOR, type DoctorObservations } from "./doctor.js";
import { planRepairs, formatRepairPlan } from "./repair-planner.js";

/**
 * The machine floor for the D6 TOP-layer repair planner (ADR-0207). The guide's conversational repair
 * loop is narration over {@link planRepairs}, so its VALUE — turning a doctor report into an ordered,
 * boundary-honouring repair plan — is proven here by a red->green sweep over the pure function, plus
 * the two load-bearing ADR-0207 invariants encoded structurally:
 *   • D6 repair-vocabulary: every installer-step action names a REAL `# @step:` in `infra/install.ps1`
 *     (the single source of the repair steps — no drift), and the plan preserves dependency order.
 *   • D3 never-handle-credentials: the `claude-login` failure becomes an INSTRUCTION action with no
 *     installer step and `executable: false` — storytree instructs, it never executes-and-captures.
 */

/** A fully-healthy environment — every probe PASSes (mirrors doctor.test.ts). */
const HEALTHY: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  remoteReachable: true,
  seedReadable: true,
  claudeCliPresent: true,
  claudeLoggedIn: true,
  checkoutBehind: 0,
  hostedRead: "ok",
};

/** A fresh, un-set-up environment — every fixable invariant is unmet. */
const BROKEN: DoctorObservations = {
  gitPresent: false,
  nodeMajor: null,
  provisioned: false,
  remoteReachable: false,
  seedReadable: false,
  claudeCliPresent: false,
  claudeLoggedIn: false,
  checkoutBehind: null,
  hostedRead: "unconfigured",
};

test("GREEN: a healthy report yields an EMPTY plan (nothing to repair)", () => {
  const plan = planRepairs(runDoctor(HEALTHY));
  assert.ok(plan.empty, "a healthy report must plan no repairs");
  assert.equal(plan.actions.length, 0);
  assert.equal(formatRepairPlan(plan), "No repairs needed — setup is healthy.");
});

test("offline-but-otherwise-healthy yields an EMPTY plan (WARNs are advisory, not repairs)", () => {
  const plan = planRepairs(runDoctor({ ...HEALTHY, remoteReachable: null, checkoutBehind: 3 }));
  assert.ok(plan.empty, "WARN-only reports (offline remote, behind checkout) are not repair targets");
  assert.equal(plan.actions.length, 0);
});

test("RED: a fresh environment yields an ordered repair plan, one action per FAILing probe", () => {
  const report = runDoctor(BROKEN);
  const plan = planRepairs(report);
  assert.ok(!plan.empty, "a broken report must plan repairs");
  // Exactly the FAILing probes become actions — WARNs (repo-fetchable, checkout-current) do not.
  const failingNames = report.probes.filter((p) => p.level === "FAIL").map((p) => p.name);
  assert.deepEqual(plan.actions.map((a) => a.probe), failingNames, "one action per FAIL, in report order");
  // Every action carries a non-empty, plain-language instruction.
  for (const a of plan.actions) {
    assert.ok(a.instruction.length > 0, `${a.probe} action must carry an instruction`);
  }
});

test("dependency order is preserved: git before node before checkout-provisioned", () => {
  const names = planRepairs(runDoctor(BROKEN)).actions.map((a) => a.probe);
  const gi = names.indexOf("git");
  const ni = names.indexOf("node");
  const pi = names.indexOf("checkout-provisioned");
  assert.ok(gi >= 0 && ni > gi && pi > ni, `prerequisites must come first (got ${names.join(", ")})`);
});

// --- ADR-0207 D3: never handle credentials ------------------------------------------------------
test("D3: the claude-login repair is an INSTRUCTION carrying no executable installer step", () => {
  const login = planRepairs(runDoctor(BROKEN)).actions.find((a) => a.probe === "claude-login");
  assert.ok(login, "a fresh env must surface the claude-login repair");
  assert.equal(login.kind, "instruction", "login is a dev action, never an installer step (D3)");
  assert.equal(login.executable, false, "storytree instructs; it never executes-and-captures (D3)");
  assert.ok(!("step" in login), "an instruction action carries no installer @step");
  assert.match(login.instruction, /claude/i);
});

// --- ADR-0207 D6: the repair vocabulary IS the installer's idempotent steps ---------------------
const installScript = readFileSync(
  fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url)),
  "utf8",
);
const INSTALLER_STEPS = new Set([...installScript.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]));

test("D6: every installer-step action names a real install.ps1 @step (repair vocabulary, no drift)", () => {
  const stepActions = planRepairs(runDoctor(BROKEN)).actions.filter((a) => a.kind === "installer-step");
  assert.ok(stepActions.length >= 4, "several failures should repair via an installer step");
  for (const a of stepActions) {
    assert.equal(a.executable, true, `${a.probe} installer step must be executable`);
    assert.ok(
      a.kind === "installer-step" && INSTALLER_STEPS.has(a.step),
      `action '${a.probe}' step must be a real # @step: in install.ps1 (D6 repair vocabulary)`,
    );
  }
});

test("formatRepairPlan renders a numbered step per action, tagging installer steps vs dev actions", () => {
  const text = formatRepairPlan(planRepairs(runDoctor(BROKEN)));
  assert.match(text, /Repair plan/);
  assert.match(text, /@step:git/, "an installer step names its @step");
  assert.match(text, /storytree can't/, "the D3 dev-action is marked as one storytree cannot enact");
});
