import test from "node:test";
import assert from "node:assert/strict";

import { runDoctor, NODE_MAJOR_FLOOR, type DoctorObservations } from "./doctor.js";
import { buildEscalationBlob } from "./escalation-blob.js";
import {
  startGuide,
  stepGuide,
  directiveFor,
  formatGuideDirective,
  type GuideEvent,
  type GuideState,
  type GuideTurn,
} from "./guide-loop.js";

/**
 * The machine floor for the D6 GUIDE REPAIR LOOP (ADR-0207). The desktop guide's conversation is
 * narration over this pure state machine, so its VALUE — sequencing doctor -> propose -> confirm ->
 * re-run the installer step -> re-doctor -> escalate, and terminating — is proven here (Stage-1), with
 * the two load-bearing ADR-0207 invariants asserted at the loop level:
 *   • D6 repair-vocabulary: a confirmed installer repair emits a RunInstallerStep naming the SAME
 *     `install.ps1` @step the probe's fixStep names (no drift, carried through the real planner).
 *   • D3 never-handle-credentials: `claude-login` is proposed as an instruction and, on confirm, emits
 *     an instruct-dev directive — NEVER a run-installer-step. storytree never executes/captures the login.
 * Reports are built from real {@link runDoctor} over crafted observations, so the loop is proven against
 * the actual probe/plan/escalation policy, not hand-forged reports.
 */

/** A fully-healthy environment — every probe PASSes (mirrors doctor.test.ts / repair-planner.test.ts). */
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

const obs = (over: Partial<DoctorObservations>): DoctorObservations => ({ ...HEALTHY, ...over });
const report = (over: Partial<DoctorObservations>) => runDoctor(obs(over));

/** Drive the loop from start through a sequence of events, returning every turn (start turn first). */
function drive(events: readonly GuideEvent[]): GuideTurn[] {
  const turns: GuideTurn[] = [startGuide()];
  let state: GuideState = turns[0]!.state;
  for (const ev of events) {
    const t = stepGuide(state, ev);
    turns.push(t);
    state = t.state;
  }
  return turns;
}

const last = (turns: GuideTurn[]) => turns[turns.length - 1]!;

// ---------------------------------------------------------------------------

test("gl-starts-by-running-doctor: the session opens by asking the caller to run doctor", () => {
  const { state, directive } = startGuide();
  assert.equal(state.phase, "need-doctor");
  assert.equal(directive.kind, "run-doctor");
});

test("gl-healthy-report-ends-healthy: a clean report terminates in say-healthy, no repairs proposed", () => {
  const turns = drive([{ type: "doctored", report: report({}) }]);
  const { state, directive } = last(turns);
  assert.equal(state.phase, "healthy");
  assert.equal(directive.kind, "say-healthy");
  // No propose ever happened.
  assert.ok(!turns.some((t) => t.directive.kind === "propose"));
});

test("gl-single-installer-repair-round-trips-to-healthy: node FAIL -> propose -> confirm -> run step -> re-doctor -> healthy", () => {
  const nodeAbsent = report({ nodeMajor: null });
  const turns = drive([
    { type: "doctored", report: nodeAbsent }, // -> propose(node)
    { type: "confirm" }, // -> run-installer-step
    { type: "acted" }, // -> re-doctor (need-doctor)
    { type: "doctored", report: report({}) }, // node now fixed -> healthy
  ]);

  // The propose then the installer step then success.
  const propose = turns[1]!;
  assert.equal(propose.directive.kind, "propose");

  const runStep = turns[2]!;
  assert.equal(runStep.directive.kind, "run-installer-step");

  const reDoctor = turns[3]!;
  assert.equal(reDoctor.state.phase, "need-doctor");

  assert.equal(last(turns).directive.kind, "say-healthy");
});

test("gl-repair-vocabulary-no-drift: the run-installer-step names the SAME @step the probe fixStep names (D6)", () => {
  const nodeAbsent = report({ nodeMajor: null });
  const nodeProbe = nodeAbsent.probes.find((p) => p.name === "node")!;
  assert.equal(nodeProbe.fixStep, "node"); // guards the fixture against a doctor change

  const turns = drive([{ type: "doctored", report: nodeAbsent }, { type: "confirm" }]);
  const dir = last(turns).directive;
  assert.equal(dir.kind, "run-installer-step");
  assert.equal(dir.kind === "run-installer-step" && dir.step, nodeProbe.fixStep);
});

test("gl-D3-login-is-instructed-never-executed: claude-login proposes an instruction; confirm -> instruct-dev, NEVER run-installer-step", () => {
  const loginAbsent = report({ claudeLoggedIn: false });
  const turns = drive([{ type: "doctored", report: loginAbsent }, { type: "confirm" }]);

  const propose = turns[1]!;
  assert.equal(propose.directive.kind, "propose");
  assert.ok(propose.directive.kind === "propose" && propose.directive.action.kind === "instruction");
  assert.ok(propose.directive.kind === "propose" && propose.directive.action.executable === false);

  const afterConfirm = last(turns);
  assert.equal(afterConfirm.directive.kind, "instruct-dev");

  // The loop NEVER offers to run an installer step for login (D3: storytree never executes the credential).
  assert.ok(!turns.some((t) => t.directive.kind === "run-installer-step"));
});

test("gl-login-still-absent-after-devs-attempt-escalates-identity: instruct -> acted -> re-doctor still absent -> escalate(identity)", () => {
  const loginAbsent = report({ claudeLoggedIn: false });
  const turns = drive([
    { type: "doctored", report: loginAbsent }, // propose(login instruction)
    { type: "confirm" }, // instruct-dev
    { type: "acted" }, // dev tried -> re-doctor
    { type: "doctored", report: loginAbsent }, // still absent -> escalate
  ]);
  const { state, directive } = last(turns);
  assert.equal(state.phase, "escalated");
  assert.equal(directive.kind, "escalate");
  assert.ok(directive.kind === "escalate" && directive.blob.needed);
  assert.ok(
    directive.kind === "escalate" && directive.blob.unmet.some((u) => u.probe === "claude-login" && u.category === "identity"),
  );
});

test("gl-access-refused-is-not-healthy-escalates: no FAILs but repo access refused -> escalate(access), never say-healthy", () => {
  // repo-fetchable refused is a WARN (report.ok stays true), but it is an owner-side block.
  const accessRefused = report({ remoteReachable: false });
  assert.equal(accessRefused.ok, true); // a WARN does not break doctor's own ok — the loop must be stricter
  const turns = drive([{ type: "doctored", report: accessRefused }]);
  const { state, directive } = last(turns);
  assert.equal(state.phase, "escalated");
  assert.equal(directive.kind, "escalate");
  assert.ok(directive.kind === "escalate" && directive.blob.unmet.some((u) => u.category === "access"));
  assert.ok(!turns.some((t) => t.directive.kind === "say-healthy"));
});

test("gl-terminates-when-a-step-does-not-fix-its-probe: same node FAIL twice -> tried once -> stuck, no infinite loop", () => {
  const nodeAbsent = report({ nodeMajor: null });
  const turns = drive([
    { type: "doctored", report: nodeAbsent }, // propose(node)
    { type: "confirm" }, // run step
    { type: "acted" }, // re-doctor
    { type: "doctored", report: nodeAbsent }, // node STILL absent
  ]);
  const { state } = last(turns);
  // node is not owner-escalatable, so the residue is a defensive dead end — terminal, not a re-propose.
  assert.equal(state.phase, "stuck");
  // It proposed node exactly once.
  assert.equal(turns.filter((t) => t.directive.kind === "propose").length, 1);
});

test("gl-decline-skips-the-probe: declining node moves on without enacting it", () => {
  const nodeAbsent = report({ nodeMajor: null });
  const turns = drive([
    { type: "doctored", report: nodeAbsent }, // propose(node)
    { type: "decline" }, // skip node
  ]);
  // node FAIL is the only failure and is not owner-side -> stuck after decline, never a run-installer-step.
  assert.equal(last(turns).state.phase, "stuck");
  assert.ok(!turns.some((t) => t.directive.kind === "run-installer-step"));
});

test("gl-repairs-in-dependency-order: git + node both FAIL -> git proposed first (probe order)", () => {
  const gitAndNode = report({ gitPresent: false, nodeMajor: null });
  const turns = drive([{ type: "doctored", report: gitAndNode }]);
  const dir = last(turns).directive;
  assert.equal(dir.kind, "propose");
  assert.ok(dir.kind === "propose" && dir.action.probe === "git"); // git precedes node in doctor's probe order
});

test("gl-terminal-states-are-idempotent: stepping a healthy/escalated state with any event no-ops", () => {
  const healthy = drive([{ type: "doctored", report: report({}) }]);
  const healthyState = last(healthy).state;
  for (const ev of [{ type: "confirm" }, { type: "acted" }, { type: "decline" }] as const) {
    const t = stepGuide(healthyState, ev);
    assert.equal(t.state.phase, "healthy");
    assert.equal(t.directive.kind, "say-healthy");
  }
});

test("gl-directiveFor-is-total: every phase yields a directive", () => {
  const phases: GuideState["phase"][] = [
    "need-doctor",
    "proposing",
    "acting",
    "awaiting-dev",
    "healthy",
    "escalated",
    "stuck",
  ];
  const rep = report({ nodeMajor: null });
  const action = { kind: "installer-step" as const, probe: "node", step: "node", instruction: "x", executable: true as const };
  const blob = buildEscalationBlob(report({ claudeLoggedIn: false })); // a real owner-side blob keeps the fixture honest
  for (const phase of phases) {
    const state: GuideState = { phase, attempted: [], report: rep, plan: { actions: [action], empty: false }, action, blob };
    const d = directiveFor(state);
    assert.ok(typeof d.kind === "string");
    assert.ok(formatGuideDirective(d).length > 0); // renders a non-empty line for every directive
  }
});
