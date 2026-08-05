import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runDoctor,
  formatDoctorReport,
  doctorCommand,
  dependencyCurrency,
  probeHostedRead,
  classifyHostedReadStatus,
  HOSTED_READ_REFUSED_DETAIL,
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
 *
 * And one invariant of doctor's own: a probe claims EXACTLY what it observed. The presence/currency
 * split (`checkout-provisioned` vs `dependencies-current`) is where that is proven — see the
 * regression block below for what a presence probe wording itself as a currency verdict cost.
 */

/** A fully-healthy environment — every probe PASSes. */
const HEALTHY: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  dependencyCurrency: "current",
  remoteReachable: true,
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
  dependencyCurrency: "unknown",
  remoteReachable: false,
  claudeCliPresent: false,
  claudeLoggedIn: false,
  checkoutBehind: null,
  hostedRead: "unconfigured",
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

// --- dependency currency: presence is not currency ----------------------------------------------
// REGRESSION. `checkout-provisioned` observes only `node_modules/.modules.yaml` — that an install
// once COMPLETED here — yet reported "workspace dependencies are installed", a claim about WHICH
// dependencies that presence cannot support. A checkout installed against an OLDER pnpm-lock.yaml
// than it now has passed that probe, so doctor asserted the workspace was fine when the wrong deps
// were linked — in exactly the scenario doctor is run to disambiguate (a dev hits TS2307 on a package
// they never touched and asks doctor which half is broken). The split below is the fix: probe 3 keeps
// its own question, and the currency claim moves to a probe that actually observes it.

test("RED: a provisioned checkout on an OLDER lockfile is reported STALE, not 'dependencies installed'", () => {
  const report = runDoctor({ ...HEALTHY, dependencyCurrency: "stale" });
  const currency = report.probes.find((p) => p.name === "dependencies-current")!;
  assert.equal(currency.level, "WARN", "stale deps must surface, not hide behind the presence probe");
  assert.match(currency.detail, /OLDER pnpm-lock\.yaml/, "the detail names the actual condition");
  // The other half of the regression: presence still PASSes (it is genuinely true), so this exact
  // report shape — a PASS on provisioned beside a WARN on currency — is what used to be unreachable.
  const provisioned = report.probes.find((p) => p.name === "checkout-provisioned")!;
  assert.equal(provisioned.level, "PASS", "an install DID complete here — probe 3's question is unchanged");
  assert.match(provisioned.detail, /\.modules\.yaml/, "probe 3's detail states the marker it observed");
});

test("the provisioned PASS detail no longer claims anything about WHICH dependencies are installed", () => {
  const provisioned = runDoctor(HEALTHY).probes.find((p) => p.name === "checkout-provisioned")!;
  // It may say an install is present; it may not say the dependencies are (the currency claim).
  assert.doesNotMatch(
    provisioned.detail,
    /dependencies are installed/,
    "presence must not be worded as a verdict on the dependencies themselves",
  );
});

test("stale deps WARN and never FAIL — a refresh is not a broken install (the freshness precedent)", () => {
  for (const dependencyCurrency of ["stale", "unknown"] as const) {
    const report = runDoctor({ ...HEALTHY, dependencyCurrency });
    const probe = report.probes.find((p) => p.name === "dependencies-current")!;
    assert.equal(probe.level, "WARN", `${dependencyCurrency} must WARN`);
    assert.equal(report.ok, true, `${dependencyCurrency} must not fail an otherwise-healthy checkout`);
    assert.ok(probe.fixHint !== undefined, `${dependencyCurrency} must carry a fix hint`);
    // NO fixStep: install.ps1's Test-Provisioned is presence-based, so re-running @step:provision would
    // report "already satisfied" and install nothing. Naming it would be a FALSE repair vocabulary.
    assert.equal(probe.fixStep, undefined, "no installer step repairs staleness — the fix is instructed");
  }
});

test("the stale fix hint gives the one-step fix AND names the symptom that misattributes it", () => {
  const probe = runDoctor({ ...HEALTHY, dependencyCurrency: "stale" }).probes.find(
    (p) => p.name === "dependencies-current",
  )!;
  assert.match(probe.fixHint ?? "", /pnpm install/, "the one-step fix");
  assert.match(probe.fixHint ?? "", /TS2307|ERR_MODULE_NOT_FOUND/, "names the error that blames the wrong package");
});

test("a current checkout PASSes — the healthy case pays no new noise", () => {
  const probe = runDoctor(HEALTHY).probes.find((p) => p.name === "dependencies-current")!;
  assert.equal(probe.level, "PASS");
  assert.equal(probe.fixHint, undefined);
});

test("the three currency states read differently (an undetermined probe is not a pass)", () => {
  const detailOf = (dependencyCurrency: DoctorObservations["dependencyCurrency"]): string =>
    runDoctor({ ...HEALTHY, dependencyCurrency }).probes.find((p) => p.name === "dependencies-current")!.detail;
  const details = (["current", "stale", "unknown"] as const).map(detailOf);
  assert.equal(new Set(details).size, 3, "each state must be distinguishable in the report");
});

// The OBSERVATION half, against real files on a real disk — `lockfileAdvanced` is deliberately not
// injectable (provision-worktree.test.ts's pattern), so these drive the same code the shell runs.

/** A throwaway checkout: `.modules.yaml` marks a completed install, `lock` seeds the lockfile pair. */
function makeCheckout(provisioned: boolean, lock?: { wanted?: string; current?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "st-doctor-deps-"));
  if (provisioned) {
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".modules.yaml"), "hoistPattern:\n  - '*'\n");
  }
  if (lock?.wanted !== undefined) writeFileSync(join(dir, "pnpm-lock.yaml"), lock.wanted);
  if (lock?.current !== undefined) {
    mkdirSync(join(dir, "node_modules", ".pnpm"), { recursive: true });
    writeFileSync(join(dir, "node_modules", ".pnpm", "lock.yaml"), lock.current);
  }
  return dir;
}

const LOCK_OLD = "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      zod: 3.23.8\n";
const LOCK_NEW = `${LOCK_OLD}  packages/new-organism:\n    dependencies:\n      zod: 3.23.8\n`;

test("dependencyCurrency: the lockfile advancing under a provisioned checkout reads as stale", () => {
  const root = makeCheckout(true, { wanted: LOCK_NEW, current: LOCK_OLD });
  try {
    assert.equal(dependencyCurrency(root, true), "stale");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dependencyCurrency: a checkout installed against today's lockfile reads as current", () => {
  const root = makeCheckout(true, { wanted: LOCK_NEW, current: LOCK_NEW });
  try {
    assert.equal(dependencyCurrency(root, true), "current");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// THE TRAP, and the reason currency is a union rather than a boolean. `lockfileAdvanced` FAILS OPEN —
// a missing lockfile on either side returns false — which is right for the hook it was written for
// ("never reinstall on a guess") and would be a LIE here: a checkout with no dependencies at all would
// read as "current", reproducing the over-claim this whole probe exists to remove.
test("dependencyCurrency: an unprovisioned checkout is UNKNOWN — never 'current' via the fail-open", () => {
  const bare = makeCheckout(false, { wanted: LOCK_NEW });
  const noSnapshot = makeCheckout(true, { wanted: LOCK_NEW }); // provisioned, but nothing to compare to
  const noLockfile = makeCheckout(true, { current: LOCK_NEW }); // not a pnpm root
  try {
    assert.equal(dependencyCurrency(bare, false), "unknown", "no install ⇒ nothing is known about the deps");
    assert.equal(dependencyCurrency(noSnapshot, true), "unknown", "no pnpm snapshot ⇒ not comparable");
    assert.equal(dependencyCurrency(noLockfile, true), "unknown", "no lockfile ⇒ not comparable");
  } finally {
    for (const d of [bare, noSnapshot, noLockfile]) rmSync(d, { recursive: true, force: true });
  }
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
test("doctorCommand shapes an ok:false envelope on a broken env and routes to the installer", async () => {
  const env = await doctorCommand([], { observe: () => BROKEN, checkoutDir: "/x" });
  assert.equal(env.ok, false);
  assert.match(env.body, /FAIL/);
  assert.ok((env.next ?? []).some((n) => n.includes("install")));
});

test("doctorCommand shapes an ok:true envelope on a healthy env", async () => {
  const env = await doctorCommand([], { observe: () => HEALTHY, checkoutDir: "/x" });
  assert.equal(env.ok, true);
  assert.match(env.body, /setup is healthy/);
});

test("formatDoctorReport renders one greppable line per probe plus a fix line under each non-PASS", () => {
  const text = formatDoctorReport(runDoctor(BROKEN));
  for (const name of [
    "git",
    "node",
    "checkout-provisioned",
    "dependencies-current",
    "claude-cli",
    "claude-login",
  ]) {
    assert.ok(text.includes(name), `report should name the ${name} probe`);
  }
  assert.match(text, /fix:/, "a failing report must print fix hints");
});

// --- D4 hosted live read (ADR-0207 D4/D6) --------------------------------------------------------
// The gap this closes: without it a dev with GitHub Read but NO IAP grant was told "setup is
// healthy", then hit a broken live read. Every state is a WARN — D4 makes the offline checkout the
// zero-credential FALLBACK, so an unreachable live read degrades exploring rather than breaking it.

test("hosted-read: a reachable hosted studio PASSes", () => {
  const probe = runDoctor(HEALTHY).probes.find((p) => p.name === "hosted-read")!;
  assert.equal(probe.level, "PASS");
});

test("hosted-read: every non-ok state WARNs — never FAILs (the offline seed is the fallback)", () => {
  for (const hostedRead of ["refused", "unconfigured", "unreachable"] as const) {
    const report = runDoctor({ ...HEALTHY, hostedRead });
    const probe = report.probes.find((p) => p.name === "hosted-read")!;
    assert.equal(probe.level, "WARN", `${hostedRead} must WARN, not FAIL`);
    assert.equal(report.ok, true, `${hostedRead} must not break doctor's ok (no FAIL)`);
    assert.ok(probe.fixHint !== undefined, `${hostedRead} must carry a fix hint`);
    assert.equal(probe.fixStep, undefined, "no hosted-read state is repaired by an installer step");
  }
});

test("hosted-read: each state's detail is distinguishable (different remedies, different messages)", () => {
  const detailOf = (hostedRead: DoctorObservations["hostedRead"]): string =>
    runDoctor({ ...HEALTHY, hostedRead }).probes.find((p) => p.name === "hosted-read")!.detail;
  const details = (["ok", "refused", "unconfigured", "unreachable"] as const).map(detailOf);
  assert.equal(new Set(details).size, 4, "all four hosted-read states must read differently");
  // The refusal detail is the shared constant escalation-blob discriminates on — no drift.
  assert.equal(detailOf("refused"), HOSTED_READ_REFUSED_DETAIL);
});

test("probeHostedRead: no configured URL is 'unconfigured', never a false 'refused'", async () => {
  assert.equal(await probeHostedRead(undefined), "unconfigured");
  assert.equal(await probeHostedRead(""), "unconfigured");
  assert.equal(await probeHostedRead("   "), "unconfigured");
});

test("probeHostedRead: a network failure is 'unreachable' — offline is never reported as revoked", async () => {
  // An unroutable host: whatever the failure mode, it must not read as an access verdict.
  assert.equal(await probeHostedRead("http://127.0.0.1:9"), "unreachable");
});

test("classifyHostedReadStatus: only a real identity rejection reads as 'refused'", () => {
  // ok
  for (const s of [200, 204, 299]) assert.equal(classifyHostedReadStatus(s), "ok", `${s}`);
  // refused: the IAP login redirect, and explicit identity rejections
  for (const s of [301, 302, 303, 307, 401, 403]) assert.equal(classifyHostedReadStatus(s), "refused", `${s}`);
  // NOT refused: a 404 means the URL is not a studio (misconfiguration), a 5xx means it is unwell.
  // Classifying either as "refused" would send the owner a spurious IAP-grant escalation.
  for (const s of [400, 404, 418, 500, 502, 503]) assert.equal(classifyHostedReadStatus(s), "unreachable", `${s}`);
});

test("probeHostedRead: builds the /api/health URL, sends redirect:manual, and maps the status", async () => {
  let seenUrl = "";
  let seenRedirect: string | undefined;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(url);
    seenRedirect = init?.redirect;
    return new Response(null, { status: 302 });
  }) as unknown as typeof fetch;

  // A trailing slash must not double up in the path.
  const state = await probeHostedRead("https://studio.example.com/", fakeFetch);
  assert.equal(seenUrl, "https://studio.example.com/api/health");
  assert.equal(seenRedirect, "manual", "an IAP login redirect must never be followed to a false 200");
  assert.equal(state, "refused");
});
