import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  runDoctor,
  formatDoctorReport,
  doctorCommand,
  NODE_MAJOR_FLOOR,
  type DoctorObservations,
} from "./doctor.js";

/**
 * The machine floor for `storytree doctor` (ADR-0207 D6). doctor is the keystone the installer
 * verifies with and the guide wraps, so its VALUE — the level/fix-hint policy over the setup
 * observations — is proven here by a red→green sweep over the pure {@link runDoctor}, plus the two
 * load-bearing ADR-0207 invariants encoded as structural assertions:
 *   • D6 repair-vocabulary: every installer-repairable probe's `fixStep` names a REAL `# @step:`
 *     marker in `infra/install.ps1` (the single source of the repair steps — no drift).
 *   • D3 never-handle-credentials: the `claude-login` probe carries NO `fixStep` (its fix is a dev
 *     action storytree instructs, never an installer step it executes).
 */

/** A fully-healthy environment — every probe PASSes. */
const HEALTHY: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  remoteReachable: true,
  seedReadable: true,
  claudeCliPresent: true,
  claudeLoggedIn: true,
  checkoutBehind: 0,
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
};

test("GREEN: a healthy environment passes every probe and the report is ok", () => {
  const report = runDoctor(HEALTHY);
  assert.equal(report.failing, 0, "no probe should fail on a healthy env");
  assert.equal(report.warning, 0, "no probe should warn on a healthy env");
  assert.ok(report.ok, "report.ok must be true when nothing fails");
  assert.ok(report.probes.every((p) => p.level === "PASS"));
  assert.ok(report.probes.every((p) => p.fixHint === undefined), "PASS probes carry no fix hint");
});

test("RED: a fresh environment fails the fixable invariants, each with a fix hint", () => {
  const report = runDoctor(BROKEN);
  assert.ok(!report.ok, "report.ok must be false when a probe fails");
  assert.ok(report.failing >= 5, "git/node/provision/seed/claude-cli/login should all fail");
  // Every non-PASS probe must carry an actionable fix hint (the doctor's whole point).
  for (const p of report.probes) {
    if (p.level !== "PASS") {
      assert.ok(p.fixHint && p.fixHint.length > 0, `${p.name} (${p.level}) must carry a fix hint`);
    }
  }
});

test("Node below the floor FAILs even when node is present", () => {
  const report = runDoctor({ ...HEALTHY, nodeMajor: NODE_MAJOR_FLOOR - 1 });
  const node = report.probes.find((p) => p.name === "node");
  assert.equal(node?.level, "FAIL");
  assert.equal(node?.fixStep, "node");
});

test("offline-capable: undetermined remote/freshness WARN (never FAIL) so doctor runs offline", () => {
  const offline = runDoctor({ ...HEALTHY, remoteReachable: null, checkoutBehind: null });
  assert.ok(offline.ok, "an offline probe must not break the report (WARN, not FAIL)");
  assert.equal(offline.probes.find((p) => p.name === "repo-fetchable")?.level, "WARN");
  assert.equal(offline.probes.find((p) => p.name === "checkout-current")?.level, "WARN");
});

test("a behind checkout WARNs (a freshness pull, not a broken invariant)", () => {
  const behind = runDoctor({ ...HEALTHY, checkoutBehind: 3 });
  assert.ok(behind.ok, "being behind main is a WARN, not a failure");
  const p = behind.probes.find((p) => p.name === "checkout-current");
  assert.equal(p?.level, "WARN");
  assert.match(p?.detail ?? "", /3 commit/);
});

// --- ADR-0207 D3: never handle credentials ------------------------------------------------------
test("D3: the claude-login probe detects-and-instructs — it carries NO installer fixStep", () => {
  const report = runDoctor(BROKEN);
  const login = report.probes.find((p) => p.name === "claude-login");
  assert.equal(login?.level, "FAIL");
  assert.equal(login?.fixStep, undefined, "login is a dev action, never an installer step (D3)");
  assert.match(login?.fixHint ?? "", /claude/i);
});

// --- ADR-0207 D6: the fix vocabulary IS the installer's idempotent steps ------------------------
const installScript = readFileSync(
  fileURLToPath(new URL("../../../infra/install.ps1", import.meta.url)),
  "utf8",
);
const INSTALLER_STEPS = new Set(
  [...installScript.matchAll(/#\s*@step:([a-z0-9-]+)/g)].map((m) => m[1]),
);

test("D6: every probe fixStep names a real install.ps1 @step (the repair vocabulary, no drift)", () => {
  const report = runDoctor(BROKEN);
  const withStep = report.probes.filter((p) => p.fixStep !== undefined);
  assert.ok(withStep.length >= 4, "several probes should repair via an installer step");
  for (const p of withStep) {
    assert.ok(
      INSTALLER_STEPS.has(p.fixStep!),
      `probe '${p.name}' fixStep '${p.fixStep}' must be a real # @step: in install.ps1 (D6 repair vocabulary)`,
    );
  }
});

// --- the shell + rendering ----------------------------------------------------------------------
test("doctorCommand shapes an ok:false envelope on a broken env and routes to the installer", () => {
  const env = doctorCommand([], { observe: () => BROKEN, checkoutDir: "/x" });
  assert.equal(env.ok, false);
  assert.match(env.body, /FAIL/);
  assert.ok((env.next ?? []).some((n) => n.includes("install")));
});

test("doctorCommand shapes an ok:true envelope on a healthy env", () => {
  const env = doctorCommand([], { observe: () => HEALTHY, checkoutDir: "/x" });
  assert.equal(env.ok, true);
  assert.match(env.body, /setup is healthy/);
});

test("formatDoctorReport renders one greppable line per probe plus a fix line under each non-PASS", () => {
  const text = formatDoctorReport(runDoctor(BROKEN));
  for (const name of ["git", "node", "checkout-provisioned", "seed-readable", "claude-cli", "claude-login"]) {
    assert.ok(text.includes(name), `report should name the ${name} probe`);
  }
  assert.match(text, /fix:/, "a failing report must print fix hints");
});
