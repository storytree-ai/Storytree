import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { isChatGptManagedLogin, type CodexCommandResult } from "@storytree/agent";
import { lobbyDenyRules, type ManifestRootSlice } from "@storytree/drive";

import {
  GUIDE_ANCHORS,
  TOOLCHAIN_COMMANDS,
  TOOLCHAIN_PROBE_SCRIPT,
  classifyToolchainShell,
  MACHINE_GUIDE,
  adcCredentialsPath,
  PINNED_CODEX_WRAPPER,
  classifyCodexCli,
  classifyCodexLogin,
  codexCommand,
  codexReading,
  gatherCodexReading,
  repoRootFromHere,
  classifyDbReachability,
  classifySecretsFile,
  classifyWorktreeIdentity,
  classifyWriteAuthority,
  devProbes,
  guideStep,
  type DevObservations,
} from "./doctor-dev.js";
import {
  DEV_SCOPE_NOT_RUN,
  NODE_MAJOR_FLOOR,
  doctorHelp,
  formatDoctorReport,
  runDoctor,
  type DoctorObservations,
} from "./doctor.js";
import { measureGuidanceSurface } from "./session-cost.js";

/**
 * The machine floor for the DEV-PERSONA probe group (`second-box-absorbs-the-expensive-work-arc`
 * inc-05).
 *
 * THIS SUITE IS WRITTEN AGAINST ONE FAULT CLASS, which is this project's commonest: a probe that
 * CANNOT go red is worse than no probe, because it converts an unverified machine into an
 * authoritative green. So every probe below is MUTATION-TESTED rather than merely exercised — for
 * each one the healthy fixture is broken at exactly the observation the probe reads, and the test
 * asserts the probe stops passing AND that its detail names the actual condition. A test that only
 * asserted the green would pass just as well over a probe hard-coded to PASS.
 *
 * `MUTATIONS` below is the machine-checkable form of that: one entry per dev probe, each naming the
 * observation to break and the level it must reach. The final test asserts the table covers EVERY
 * probe the group emits, so a probe added later without a mutation fails this suite rather than
 * shipping unproven.
 *
 * THE SECOND-ORDER TRAP THIS SUITE ALSO GUARDS: these probes were authored on Windows. Anything
 * platform-sensitive is a pure function over an injected `platform`, and is asserted on BOTH values
 * from one machine ({@link adcCredentialsPath}), so a Windows-shaped probe cannot silently no-op on
 * the Linux box the arc exists to stand up.
 */

/** A dev machine with everything provisioned — every dev probe PASSes. */
const DEV_HEALTHY: DevObservations = {
  gcloudAdc: "present",
  dbReachable: "reachable",
  dbElapsedMs: 412,
  secretsFile: {
    file: "ok",
    keysInFile: ["CLAUDE_CODE_OAUTH_TOKEN", "STORYTREE_DB_USER"],
    keysFromEnvOnly: [],
    keysMissing: [],
  },
  ghAuth: "authenticated",
  // Both shell shapes answer — the state a correctly-configured POSIX box reaches, and the only one
  // that may PASS. `login-only` is the honest steady state for a box whose dotfiles are as good as
  // dotfiles get, which is why it is a WARN below rather than part of this fixture.
  toolchainShell: "resolvable",
  toolchainShellReadings: { login: ["node", "pnpm", "bun"], plain: ["node", "pnpm", "bun"], unavailable: null },
  bun: "present",
  bunVersion: "1.4.0",
  // A box set up for BOTH Codex journeys: the product on PATH (the interactive driver) and a
  // ChatGPT-managed login (the only credential ADR-0232 accepts, and the one the prove-it leaf
  // requires). `workspace-only` — what `pnpm install` alone leaves — is a WARN below, not part of
  // this fixture, because a box that cannot start a Codex session is not a fully provisioned one.
  codexCli: "path",
  codexVersion: "codex-cli 0.145.0",
  codexLogin: "chatgpt",
  writeAuthority: "installed",
  worktreeIdentity: "linked",
};

/** The explorer half, all green — so a dev-probe verdict is never confounded by an explorer row. */
const EXPLORER_HEALTHY: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  unlinked: false,
  dependencyCurrency: "current",
  remoteReachable: true,
  claudeCliPresent: true,
  claudeLoggedIn: true,
  claudeTokenPresent: false,
  checkoutBehind: 0,
  hostedRead: "ok",
  guidanceSurface: measureGuidanceSurface([]),
};

const probeNamed = (obs: DevObservations, name: string) =>
  devProbes(obs).find((p) => p.name === name);

// ---------------------------------------------------------------------------
// GREEN — the healthy dev machine, and the shape of the whole group.
// ---------------------------------------------------------------------------

test("GREEN: a fully provisioned dev machine passes every dev probe, with no fix hints", () => {
  const probes = devProbes(DEV_HEALTHY);
  assert.ok(probes.length >= 10, "the group is ten probes");
  for (const p of probes) {
    assert.equal(p.level, "PASS", `${p.name} should pass on a healthy dev machine`);
    assert.equal(p.fixHint, undefined, `${p.name} must carry no fix hint while it passes`);
  }
});

test("the group covers exactly the ten invariants the explorer set says nothing about", () => {
  // ORDER IS ASSERTED, not just membership, because these read as a report and a reader scans them
  // top to bottom. The middle band is the INVOCATION probes — `bun`, then the two Codex rows — every
  // one of which answers "does this tool actually answer when we run it?", and they are read in
  // order of how much of the machine's work they gate. `toolchain-shell` closes that band by asking
  // the same question of a shell that is NOT doctor's own, so the band reads outward from doctor's
  // own process. The two below it are WARNs about isolation and about where you are standing.
  //
  // `codex-login` MUST follow `codex-cli`: when no Codex binary answers, the login is undetermined
  // BECAUSE of the row above it, and a reader scanning top to bottom meets the cause before the
  // consequence.
  assert.deepEqual(
    devProbes(DEV_HEALTHY).map((p) => p.name),
    [
      "gcloud-adc",
      "db-reachable",
      "secrets-file",
      "gh-auth",
      "bun",
      "codex-cli",
      "codex-login",
      "toolchain-shell",
      "write-authority",
      "worktree-identity",
    ],
  );
});

// ---------------------------------------------------------------------------
// THE MUTATION TABLE — break the condition, confirm the probe reds.
// ---------------------------------------------------------------------------

/**
 * One row per dev probe: the observation to break, the level that break must reach, and a pattern
 * the resulting detail must match. `expected` is deliberately per-probe rather than uniformly FAIL —
 * three of these seven can never FAIL for stated reasons (doctor's offline invariant, a guardrail
 * whose absence costs isolation rather than capability, and a probe about where you are standing) —
 * and encoding that here is what stops a later edit quietly promoting or demoting one.
 */
const MUTATIONS: ReadonlyArray<{
  readonly probe: string;
  readonly why: string;
  readonly broken: Partial<DevObservations>;
  readonly expected: "FAIL" | "WARN";
  readonly detail: RegExp;
}> = [
  {
    probe: "gcloud-adc",
    why: "no application-default credentials ⇒ keyless Cloud SQL IAM has nothing to present",
    broken: { gcloudAdc: "absent" },
    expected: "FAIL",
    detail: /application-default credentials/i,
  },
  {
    probe: "db-reachable",
    why: "the live store did not answer",
    broken: { dbReachable: "unreachable", dbElapsedMs: 45_000 },
    expected: "WARN",
    detail: /did not answer within 45s/,
  },
  {
    probe: "secrets-file",
    why: "a credential resolvable from nowhere",
    broken: {
      secretsFile: {
        file: "absent",
        keysInFile: [],
        keysFromEnvOnly: [],
        keysMissing: ["CLAUDE_CODE_OAUTH_TOKEN", "STORYTREE_DB_USER"],
      },
    },
    expected: "FAIL",
    detail: /STORYTREE_DB_USER/,
  },
  {
    probe: "gh-auth",
    why: "without it the machine cannot open a PR, so it cannot land anything",
    broken: { ghAuth: "unauthenticated" },
    expected: "FAIL",
    detail: /not authenticated/,
  },
  {
    probe: "bun",
    why: "21 packages run their tests through it, so without it the gate cannot be trusted",
    broken: { bun: "absent", bunVersion: null },
    expected: "FAIL",
    detail: /not resolvable on PATH/,
  },
  {
    // THE MEASURED FALSE HEALTHY this arc exists to remove. On the owner's Linux box, 2026-08-28:
    // `codex` was not on PATH, `~/.codex/auth.json` did not exist, and `storytree doctor --dev`
    // printed "0 failing, 3 warning, 16 passing - dev setup is healthy" without a single row about
    // Codex. This mutation is that box.
    probe: "codex-cli",
    why: "no Codex binary answers at all, so NEITHER Codex journey can run here",
    broken: { codexCli: "absent", codexVersion: null, codexLogin: "undetermined" },
    expected: "WARN",
    detail: /neither on PATH nor the pinned wrapper/,
  },
  {
    // The commonest reading in the fleet, and deliberately NOT the same row as `absent`: `pnpm
    // install` leaves EVERY provisioned box here. The leaf can run; an interactive Codex session
    // cannot be started. Collapsing the two would report a box that can prove work as one that
    // cannot, or the reverse.
    probe: "codex-cli",
    why: "only the pinned leaf wrapper answers, so `--runtime codex` works and no session can start",
    broken: { codexCli: "workspace-only", codexVersion: "codex-cli 0.145.0" },
    expected: "WARN",
    detail: /only the pinned leaf wrapper/,
  },
  {
    probe: "codex-login",
    why: "no ChatGPT sign-in has been done, so `--runtime codex` refuses however installed Codex is",
    broken: { codexLogin: "logged-out" },
    expected: "WARN",
    detail: /reports no login/,
  },
  {
    // ADR-0232's forbidden shape. It is a LOGIN — `codex login status` exits 0 — so a probe keyed on
    // the exit code alone would call this healthy while every `--runtime codex` build refused.
    probe: "codex-login",
    why: "a login exists but is not ChatGPT-managed, which is the one kind the leaf refuses",
    broken: { codexLogin: "other" },
    expected: "WARN",
    detail: /NOT ChatGPT-managed/,
  },
  {
    // A question that could not be put has not been answered — `toolchain-shell`'s `no-shell` rule.
    probe: "codex-login",
    why: "no Codex binary could be invoked to ask, so the credential state is unknown, not absent",
    broken: { codexCli: "absent", codexVersion: null, codexLogin: "undetermined" },
    expected: "WARN",
    detail: /not determined/,
  },
  {
    probe: "write-authority",
    why: "no deny block ⇒ the primary checkout is writable by the file tools",
    broken: { writeAuthority: "absent" },
    expected: "WARN",
    detail: /no deny block/,
  },
  {
    probe: "worktree-identity",
    why: "the primary checkout has no claimable identity, so `noticeboard declare` refuses",
    broken: { worktreeIdentity: "primary-checkout" },
    expected: "WARN",
    detail: /PRIMARY CHECKOUT/,
  },
  {
    // THE MEASURED BREAKAGE. `~/.bashrc` puts the toolchain BELOW bash's own non-interactive early
    // return, so nothing but an interactive shell ever reaches it — and this group reported the
    // machine healthy throughout, because every other probe runs inside doctor's own shell.
    probe: "toolchain-shell",
    why: "no shell but doctor's own resolves the toolchain, so ssh- and hook-driven work all dies",
    broken: {
      toolchainShell: "unresolvable",
      toolchainShellReadings: { login: [], plain: [], unavailable: null },
    },
    expected: "FAIL",
    detail: /no shell but doctor's own/,
  },
  {
    // The residue state, and deliberately NOT a FAIL: a plain non-login shell never sources
    // `~/.bashrc`, so this is where a correctly-configured box lands and a red here would be permanent.
    probe: "toolchain-shell",
    why: "only a login shell resolves the toolchain, which no ~/.bashrc edit can ever change",
    broken: {
      toolchainShell: "login-only",
      toolchainShellReadings: { login: ["node", "pnpm", "bun"], plain: [], unavailable: null },
    },
    expected: "WARN",
    detail: /only a LOGIN shell/,
  },
  {
    // The second-order trap, asserted rather than trusted: on Windows this must read UNKNOWN, never a
    // silent PASS for a mechanism only ever exercised on Linux.
    probe: "toolchain-shell",
    why: "the shell-shape split is a POSIX mechanism and cannot be asserted on Windows",
    broken: {
      toolchainShell: "no-shell",
      toolchainShellReadings: { login: null, plain: null, unavailable: "not-posix" },
    },
    expected: "WARN",
    detail: /POSIX mechanism/,
  },
  {
    probe: "toolchain-shell",
    why: "bash could not be invoked, so neither shell shape could be asked",
    broken: {
      toolchainShell: "no-shell",
      toolchainShellReadings: { login: null, plain: null, unavailable: "no-bash" },
    },
    expected: "WARN",
    detail: /bash could not be invoked/,
  },
];

for (const m of MUTATIONS) {
  test(`RED (mutation): ${m.probe} stops passing when ${m.why}`, () => {
    const probe = probeNamed({ ...DEV_HEALTHY, ...m.broken }, m.probe);
    assert.ok(probe !== undefined, `${m.probe} must still be emitted when broken`);
    assert.notEqual(probe.level, "PASS", `${m.probe} must not pass over a broken machine`);
    assert.equal(probe.level, m.expected, `${m.probe} must reach exactly ${m.expected}`);
    assert.match(probe.detail, m.detail, `${m.probe}'s detail must name the actual condition`);
    assert.ok(probe.fixHint !== undefined && probe.fixHint.length > 0, `${m.probe} must carry a fix hint`);
  });
}

test("the mutation table covers EVERY dev probe — a new probe cannot ship unproven", () => {
  const emitted = devProbes(DEV_HEALTHY).map((p) => p.name).sort();
  const mutated = [...new Set(MUTATIONS.map((m) => m.probe))].sort();
  assert.deepEqual(mutated, emitted, "every emitted probe needs a mutation that reds it");
});

// ---------------------------------------------------------------------------
// Per-probe policy that the table cannot express.
// ---------------------------------------------------------------------------

test("db-reachable can never FAIL — doctor's offline invariant would break if it could", () => {
  // The same rule repo-fetchable and hosted-read follow: an unreachable database is
  // indistinguishable from an offline doctor, and doctor never reports a broken environment merely
  // because doctor ran with no network. Asserted over EVERY non-reachable state, not just one.
  for (const dbReachable of ["unreachable", "not-attempted"] as const) {
    const report = runDoctor(EXPLORER_HEALTHY, { ...DEV_HEALTHY, dbReachable, dbElapsedMs: null });
    const probe = report.probes.find((p) => p.name === "db-reachable")!;
    assert.equal(probe.level, "WARN", `${dbReachable} must WARN`);
    assert.equal(report.ok, true, `${dbReachable} must not break an otherwise-healthy dev sweep`);
  }
});

test("db-reachable: a missing credential is NOT reported as a database outage", () => {
  // The over-claim this state exists to prevent. `createPool` refuses without STORYTREE_DB_USER, so
  // attributing that to the database sends the reader down the db:up / cold-start / ADR-0250 tree
  // rooted at the wrong substrate. Both details must be distinguishable, and the hint must point at
  // the credential rather than at the database.
  const notAttempted = probeNamed({ ...DEV_HEALTHY, dbReachable: "not-attempted", dbElapsedMs: null }, "db-reachable")!;
  const unreachable = probeNamed({ ...DEV_HEALTHY, dbReachable: "unreachable", dbElapsedMs: 45_000 }, "db-reachable")!;
  assert.notEqual(notAttempted.detail, unreachable.detail);
  assert.match(notAttempted.detail, /STORYTREE_DB_USER/);
  assert.match(notAttempted.fixHint ?? "", /CREDENTIAL gap, not a database one/);
});

test("db-reachable's unreachable hint carries both traps that make this probe lie", () => {
  const probe = probeNamed({ ...DEV_HEALTHY, dbReachable: "unreachable", dbElapsedMs: 45_000 }, "db-reachable")!;
  assert.match(probe.fixHint ?? "", /COLD-STARTING/, "a RUNNABLE instance mid-cold-start is not a wedge");
  assert.match(probe.fixHint ?? "", /SATURATED/, "a loaded box makes the probe report a false refusal");
  assert.match(probe.fixHint ?? "", /db:up/, "and the one idempotent step that repairs it");
});

test("secrets-file: an env-only credential WARNs — it works now and will not survive a worktree", () => {
  // Neither a PASS nor a FAIL, and both wrong answers are reachable. Env ALWAYS wins over the file
  // (CLAUDE.md), so the credential genuinely resolves — but the file exists precisely because it
  // survives sessions and git worktrees, which an exported variable does not.
  const probe = probeNamed(
    {
      ...DEV_HEALTHY,
      secretsFile: {
        file: "absent",
        keysInFile: [],
        keysFromEnvOnly: ["STORYTREE_DB_USER"],
        keysMissing: [],
      },
    },
    "secrets-file",
  )!;
  assert.equal(probe.level, "WARN");
  assert.match(probe.detail, /environment only/);
  assert.match(probe.fixHint ?? "", /will not survive a fresh session or a new git worktree/);
});

test("secrets-file: a BLANK value is a gap, so it reaches the same FAIL as an absent one", () => {
  // The classifier is what applies presentEnv's rule; this asserts the PROBE does not soften it back
  // into a pass. Reading `VAR=` as a credential once made a healthy database report itself
  // unreachable for ~25 minutes (packages/drive/src/secrets.ts).
  const blank = classifySecretsFile('{"CLAUDE_CODE_OAUTH_TOKEN":"tok","STORYTREE_DB_USER":"   "}', {});
  const probe = probeNamed({ ...DEV_HEALTHY, secretsFile: blank }, "secrets-file")!;
  assert.equal(probe.level, "FAIL");
  assert.match(probe.detail, /STORYTREE_DB_USER/);
  assert.match(probe.fixHint ?? "", /BLANK value is a gap/);
});

test("D3: no dev probe's detail or hint can carry a credential VALUE", () => {
  // The structural half of never-handle-credentials. Every observation this group takes is a name or
  // a state — there is no field on DevObservations that could hold a value — so this asserts the one
  // thing a future edit could break: that a rendered report over a fixture carrying a recognisable
  // secret never reproduces it. The fixture's "values" exist only inside the classifier's input.
  const withSecrets = classifySecretsFile(
    '{"CLAUDE_CODE_OAUTH_TOKEN":"sk-ant-SENTINEL-VALUE","STORYTREE_DB_USER":"person@example.com"}',
    {},
  );
  const text = devProbes({ ...DEV_HEALTHY, secretsFile: withSecrets })
    .map((p) => `${p.detail} ${p.fixHint ?? ""}`)
    .join("\n");
  assert.doesNotMatch(text, /SENTINEL-VALUE/, "no probe may echo a credential value");
  assert.doesNotMatch(text, /person@example\.com/, "…nor the IAM principal");
  assert.match(text, /CLAUDE_CODE_OAUTH_TOKEN/, "key NAMES are the whole reportable surface");
});

test("gh-auth: the two failure shapes have different remedies and different installer steps", () => {
  const unauth = probeNamed({ ...DEV_HEALTHY, ghAuth: "unauthenticated" }, "gh-auth")!;
  const absent = probeNamed({ ...DEV_HEALTHY, ghAuth: "absent" }, "gh-auth")!;
  assert.equal(unauth.fixStep, "github-auth", "installed-but-signed-out is a sign-in");
  assert.equal(absent.fixStep, "gh-cli", "not installed is an install");
  assert.notEqual(unauth.detail, absent.detail);
});

test("write-authority: UNKNOWN is a distinct verdict and never reads as installed", () => {
  // The platform escape. The wall has only ever been exercised on Windows, so a state that cannot be
  // computed must surface as undetermined rather than as a pass — the second-order trap this
  // increment was warned about is a Windows-shaped probe silently greening an unprovisioned Linux box.
  const unknown = probeNamed({ ...DEV_HEALTHY, writeAuthority: "unknown" }, "write-authority")!;
  assert.equal(unknown.level, "WARN");
  assert.match(unknown.detail, /not determined/);
  assert.match(unknown.fixHint ?? "", /only ever been exercised on Windows/);
});

test("write-authority: all four states read differently (different causes, different remedies)", () => {
  const details = (["installed", "stale", "absent", "unknown"] as const).map(
    (writeAuthority) => probeNamed({ ...DEV_HEALTHY, writeAuthority }, "write-authority")!.detail,
  );
  assert.equal(new Set(details).size, 4);
});

test("worktree-identity: the primary checkout explains the refusal it is about to cause", () => {
  const probe = probeNamed({ ...DEV_HEALTHY, worktreeIdentity: "primary-checkout" }, "worktree-identity")!;
  assert.match(probe.detail, /noticeboard declare/, "it names the verb that will refuse");
  assert.match(probe.fixHint ?? "", /worktree create|git worktree add/, "and the one step that fixes it");
  assert.match(probe.fixHint ?? "", /deliberate/, "the refusal is by design, not a defect to route around");
});

// ---------------------------------------------------------------------------
// The repair vocabulary — every hint points at a real, agreed guide anchor.
// ---------------------------------------------------------------------------

test("the guide anchors are exactly the six agreed with the guide's author", () => {
  // Frozen by AGREEMENT, not observation: the guide is written on a parallel branch, so this is a
  // contract fixed up front. Asserting the literal set is what makes a later rename a red here
  // rather than six silently dead pointers — the guide file itself cannot be the check, because a
  // check that no-ops while the file is absent is the vacuous green this whole suite is about.
  assert.deepEqual(Object.values(GUIDE_ANCHORS), [
    "#1-bootstrap-the-machine",
    "#2-the-three-sign-ins",
    "#3-the-secrets-file",
    "#4-work-from-a-linked-worktree",
    "#5-install-the-write-authority-wall",
    "#6-prove-it",
  ]);
  assert.equal(guideStep("secrets"), `${MACHINE_GUIDE}#3-the-secrets-file`);
});

test("every non-PASS dev probe points at a REAL guide anchor (no drift, no dead pointer)", () => {
  const anchors = new Set<string>(Object.values(GUIDE_ANCHORS));
  const broken: DevObservations = {
    gcloudAdc: "absent",
    dbReachable: "unreachable",
    dbElapsedMs: 45_000,
    secretsFile: {
      file: "absent",
      keysInFile: [],
      keysFromEnvOnly: [],
      keysMissing: ["CLAUDE_CODE_OAUTH_TOKEN", "STORYTREE_DB_USER"],
    },
    ghAuth: "absent",
    bun: "absent",
    bunVersion: null,
    codexCli: "absent",
    codexVersion: null,
    codexLogin: "undetermined",
    toolchainShell: "unresolvable",
    toolchainShellReadings: { login: [], plain: [], unavailable: null },
    writeAuthority: "absent",
    worktreeIdentity: "no-identity",
  };
  const probes = devProbes(broken);
  assert.equal(probes.filter((p) => p.level === "PASS").length, 0, "the fixture must break all ten");
  for (const p of probes) {
    const hint = p.fixHint ?? "";
    const m = new RegExp(`${MACHINE_GUIDE.replace(/[.]/g, "\\.")}(#[a-z0-9-]+)`).exec(hint);
    assert.ok(m !== null, `${p.name}'s hint must name ${MACHINE_GUIDE}#<anchor>`);
    assert.ok(anchors.has(m[1]!), `${p.name} points at unknown anchor ${m[1]}`);
  }
});

test("only the probes an installer step genuinely repairs carry a fixStep", () => {
  // ADR-0207 D6's repair vocabulary: a fixStep names an idempotent `install.ps1 @step:` re-run. The
  // rest of this group repairs through a guide step or a storytree verb, and naming an installer
  // step that would NOT repair them would be a false entry (the dependencies-current precedent).
  //
  // `codex-login` is the load-bearing exclusion and the reason this test is worth its lines: a Codex
  // sign-in is a browser action only the operator can take, so NO installer step can produce it —
  // exactly the boundary `claude-credential` holds on the explorer side (ADR-0207 D3 / ADR-0430 D6).
  // Its neighbour `codex-cli` DOES carry one, because installing a CLI is precisely what a step does.
  const broken = devProbes({
    ...DEV_HEALTHY,
    gcloudAdc: "absent",
    dbReachable: "unreachable",
    ghAuth: "absent",
    bun: "absent",
    bunVersion: null,
    codexCli: "absent",
    codexVersion: null,
    codexLogin: "logged-out",
    toolchainShell: "unresolvable",
    toolchainShellReadings: { login: [], plain: [], unavailable: null },
    writeAuthority: "absent",
    worktreeIdentity: "primary-checkout",
  });
  assert.deepEqual(
    broken.filter((p) => p.fixStep !== undefined).map((p) => p.name),
    ["gh-auth", "codex-cli"],
    "an install IS an installer step; a sign-in never is",
  );
  // The VALUE, not just the presence: a fixStep naming a marker `install.ps1` does not declare is a
  // dead entry in the repair vocabulary, and `-Step <name>` fails loudly rather than repairing.
  // Asserted on BOTH non-PASS shapes, because they are separate object literals in the source.
  for (const codexCli of ["workspace-only", "absent"] as const) {
    assert.equal(
      probeNamed({ ...DEV_HEALTHY, codexCli, codexVersion: null }, "codex-cli")!.fixStep,
      "codex-cli",
      `${codexCli} must name the installer step that genuinely repairs it`,
    );
  }
  assert.equal(probeNamed(DEV_HEALTHY, "codex-cli")!.fixStep, undefined, "a PASSing probe carries no fix at all");
});

// ---------------------------------------------------------------------------
// PURE classifiers — the platform-sensitive and parse-sensitive halves.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The Codex group — `codex-onboarding-journey-arc`.
// ---------------------------------------------------------------------------

/** `codex login status` results, as the two binaries actually emit them. */
const CHATGPT_ON_STDOUT: CodexCommandResult = { code: 0, stdout: "Logged in using ChatGPT", stderr: "" };
const CHATGPT_ON_STDERR: CodexCommandResult = { code: 0, stdout: "", stderr: "Logged in using ChatGPT" };
/** MEASURED on the owner's Linux box 2026-08-28 against the pinned wrapper 0.145.0. */
const NOT_LOGGED_IN: CodexCommandResult = { code: 1, stdout: "", stderr: "Not logged in" };
const API_KEY_LOGIN: CodexCommandResult = { code: 0, stdout: "Logged in using an API key", stderr: "" };
const ANSWERED: CodexCommandResult = { code: 0, stdout: "codex-cli 0.145.0", stderr: "" };
const REFUSED: CodexCommandResult = { code: 1, stdout: "", stderr: "boom" };

test("classifyCodexLogin agrees with the LEAF's own predicate on every shape — no second definition", () => {
  // THE ANTI-DRIFT ASSERTION, and the reason `isChatGptManagedLogin` is imported rather than
  // restated. The probe's whole claim is "this machine can run `--runtime codex`", which is only
  // true while its PASS condition is the leaf's refusal condition inverted. A re-implementation that
  // merely looked right — matching the phrase anywhere in either channel, say — would pass over a
  // machine whose builds all refuse, which is this arc's false healthy in a subtler mask.
  const shapes: readonly CodexCommandResult[] = [
    CHATGPT_ON_STDOUT,
    CHATGPT_ON_STDERR,
    NOT_LOGGED_IN,
    API_KEY_LOGIN,
    REFUSED,
    // The leaf's strictness itself: the right line on one channel plus ANY other output is refused,
    // and so is the right line at a non-zero exit.
    { code: 0, stdout: "Logged in using ChatGPT", stderr: "warning: update available" },
    { code: 1, stdout: "Logged in using ChatGPT", stderr: "" },
  ];
  for (const shape of shapes) {
    assert.equal(
      classifyCodexLogin(shape) === "chatgpt",
      isChatGptManagedLogin(shape),
      `the probe and the leaf must agree on ${JSON.stringify(shape)}`,
    );
  }
});

test("classifyCodexLogin: an API-key login is NOT logged-out — ADR-0232 refuses it, and says so", () => {
  // Both are non-PASS, so a probe could get away with conflating them — and then the fix hint would
  // tell an operator holding a working API key to "run codex login", omitting the one fact that
  // matters: the key is stripped before every run and cannot be made to work (ADR-0232).
  assert.equal(classifyCodexLogin(API_KEY_LOGIN), "other");
  assert.equal(classifyCodexLogin(NOT_LOGGED_IN), "logged-out");
  assert.notEqual(
    probeNamed({ ...DEV_HEALTHY, codexLogin: "other" }, "codex-login")!.detail,
    probeNamed({ ...DEV_HEALTHY, codexLogin: "logged-out" }, "codex-login")!.detail,
  );
});

test("classifyCodexLogin: a question that could not be put is undetermined, never a pass", () => {
  assert.equal(classifyCodexLogin(null), "undetermined");
});

test("classifyCodexCli: the PRODUCT wins, the wrapper is the fallback, a non-zero exit is no answer", () => {
  assert.equal(classifyCodexCli(ANSWERED, ANSWERED), "path");
  assert.equal(classifyCodexCli(null, ANSWERED), "workspace-only");
  assert.equal(classifyCodexCli(REFUSED, ANSWERED), "workspace-only", "a refusal is not an answer");
  assert.equal(classifyCodexCli(null, null), "absent");
  assert.equal(classifyCodexCli(REFUSED, REFUSED), "absent");
});

test("codexReading: the PRODUCT is asked first, and the login is asked of the binary that answered", () => {
  // The RESOLUTION ORDER is the logic here, and it is not cosmetic: the two binaries read the SAME
  // `~/.codex/auth.json`, so either is a valid login witness — but only one of them exists on a box
  // that never installed the product, and asking a binary that is not there would report `logged-out`
  // for a machine whose credential is fine. Recording the calls is what pins that.
  const calls: string[][] = [];
  const runner = (answers: Record<string, CodexCommandResult | null>) =>
    (file: string, args: readonly string[]) => {
      calls.push([file, ...args]);
      // `login` is matched anywhere in the argv, not at [0]: the wrapper is invoked as
      // `node <wrapper> login status`, so its verb is never the first argument.
      return answers[args.includes("login") ? "login" : file === "codex" ? "path" : "wrapper"] ?? null;
    };

  calls.length = 0;
  const both = codexReading(runner({ path: ANSWERED, wrapper: ANSWERED, login: CHATGPT_ON_STDOUT }), "/w/codex.js");
  assert.deepEqual(both, { cli: "path", version: "codex-cli 0.145.0", login: "chatgpt" });
  assert.deepEqual(calls.at(-1), ["codex", "login", "status"], "the PRODUCT is the login witness when present");

  assert.deepEqual(
    calls,
    [["codex", "--version"], [process.execPath, "/w/codex.js", "--version"], ["codex", "login", "status"]],
    "both binaries are asked their version, each with its own argv",
  );

  calls.length = 0;
  const leafOnly = codexReading(runner({ path: null, wrapper: ANSWERED, login: NOT_LOGGED_IN }), "/w/codex.js");
  assert.deepEqual(leafOnly, { cli: "workspace-only", version: "codex-cli 0.145.0", login: "logged-out" });
  assert.deepEqual(
    calls.at(-1),
    [process.execPath, "/w/codex.js", "login", "status"],
    "with no product, the pinned WRAPPER answers the login — the credential is not asked of nothing",
  );
});

test("codexReading: with no wrapper on disk it is never invoked, and nothing is asked about the login", () => {
  // `wrapper: null` is "the pinned wrapper is not on this disk", which is what an unprovisioned
  // checkout looks like. Spawning a path that does not exist would be harmless but would also make
  // the reading depend on spawn-error shapes rather than on the fact we already know.
  const calls: string[][] = [];
  const reading = codexReading((file, args) => {
    calls.push([file, ...args]);
    return null;
  }, null);
  assert.deepEqual(reading, { cli: "absent", version: null, login: "undetermined" });
  assert.deepEqual(calls, [["codex", "--version"]], "exactly one question was asked, and it was the product's");
});

test("codexReading: a wrapper that REFUSED --version is not then asked for a version or a login", () => {
  // THE `absent`-WITH-A-WRAPPER-ON-DISK SHAPE, which the two tests above cannot reach: they reach
  // `absent` only by having no wrapper at all, so nothing there distinguishes "the wrapper answered
  // null" from "the wrapper answered badly". A broken or half-installed `@openai/codex` — present on
  // disk, exiting non-zero — is that second thing, and it is what makes both ternaries in
  // `codexReading` load-bearing rather than decorative.
  //
  // Two ways it goes wrong if the `workspace-only` arms stop being guarded: the report grows a
  // VERSION scraped off a refusal ("boom"), and the login is asked of a binary that just proved it
  // cannot answer — turning an honest `undetermined` into a confident `logged-out`, which is the
  // false-certainty half of this arc's own failure. (Both were live mutants: doctor-dev.ts:1163 and
  // :1170, surviving because nothing exercised this shape.)
  const calls: string[][] = [];
  const reading = codexReading((file, args) => {
    calls.push([file, ...args]);
    // The wrapper refuses `--version` and WOULD answer the login — so a probe that asked anyway
    // gets a real, wrong answer rather than a null that hides the bug.
    return args.includes("login") ? NOT_LOGGED_IN : file === "codex" ? null : REFUSED;
  }, "/w/codex.js");
  assert.deepEqual(reading, { cli: "absent", version: null, login: "undetermined" });
  assert.deepEqual(
    calls,
    [["codex", "--version"], [process.execPath, "/w/codex.js", "--version"]],
    "both were asked their version, and NEITHER was asked about the login",
  );
});

test("codexReading: the version comes off whichever channel answered, and blank is null not empty", () => {
  const onStderr: CodexCommandResult = { code: 0, stdout: "", stderr: "  codex-cli 0.145.0  " };
  assert.equal(codexReading(() => onStderr, null).version, "codex-cli 0.145.0", "stderr is read AND trimmed");
  const onStdout: CodexCommandResult = { code: 0, stdout: "  codex-cli 0.145.0  ", stderr: "noise" };
  assert.equal(codexReading(() => onStdout, null).version, "codex-cli 0.145.0", "stdout wins, and is trimmed");
  const silent: CodexCommandResult = { code: 0, stdout: "  ", stderr: "" };
  assert.equal(codexReading(() => silent, null).version, null, "a blank version is an absent one, never ''");
});

test("codexReading: the version is read off the binary that DECIDED the state, not whichever answered", () => {
  // Both can answer with DIFFERENT versions — a globally-installed product beside the pinned leaf
  // wrapper is the ordinary case. The row says "the Codex CLI answered on PATH (<v>)", so `<v>` has
  // to be the PRODUCT's; reporting the wrapper's there would be a true number against a false claim.
  const run = (file: string): CodexCommandResult => ({
    code: 0,
    stdout: file === "codex" ? "codex-cli 9.9.9" : "codex-cli 0.145.0",
    stderr: "",
  });
  assert.equal(codexReading(run, "/w/codex.js").version, "codex-cli 9.9.9", "the product decided `path`");
  assert.equal(
    codexReading((file) => (file === "codex" ? null : run(file)), "/w/codex.js").version,
    "codex-cli 0.145.0",
    "with no product, the wrapper decided `workspace-only` and its version is the honest one",
  );
});

test("gatherCodexReading: the impure shell composes without throwing, and finds no wrapper where none is", () => {
  // The one line the injected seam cannot reach: finding the wrapper on disk. Asserted against a
  // root that provably has none, so the verdict does not depend on whether the CI box happens to
  // have Codex installed — only that a missing wrapper can never be reported as a present one.
  const reading = gatherCodexReading("/storytree-no-such-root-9f2a");
  assert.notEqual(reading.cli, "workspace-only", "no wrapper on that disk, so that state is unreachable");
  assert.ok(["path", "absent"].includes(reading.cli), "and the reading is still well-formed");
});

test("codexCommand: it INVOKES, keeps both channels apart, and returns null when nothing can be run", () => {
  // The plumbing under the seam, exercised for real rather than mocked — because the two things it
  // must get right are exactly the two a mock would assume. (1) Both channels survive SEPARATELY:
  // `isChatGptManagedLogin` decides on stdout and stderr independently, so a collapsed reading would
  // silently reclassify a healthy login. (2) A binary that cannot be spawned is `null` — "could not
  // ask" — never a zero-exit answer.
  const both = codexCommand(process.execPath, [
    "-e",
    "process.stdout.write('OUT'); process.stderr.write('ERR')",
  ]);
  assert.deepEqual(both, { code: 0, stdout: "OUT", stderr: "ERR" }, "text, not Buffers, and not merged");

  const failed = codexCommand(process.execPath, ["-e", "process.exit(3)"]);
  assert.deepEqual(failed, { code: 3, stdout: "", stderr: "" }, "a non-zero exit is an ANSWER, not a null");

  assert.equal(
    codexCommand("storytree-no-such-binary-a7f3", ["--version"]),
    null,
    "an unspawnable binary could not be asked — that is null, never a result",
  );

  // (3) THE SECOND HALF OF THE GUARD, which the three cases above never reach: a child killed by a
  // SIGNAL sets no `error` at all and reports `status: null`. Without the `status === null` operand
  // the reading would leave here as `{ code: null }` and every downstream `code === 0` comparison
  // would quietly be false-by-accident rather than false-by-decision. (It was a live mutant —
  // doctor-dev.ts:1092 — because nothing produced a signalled child.)
  //
  // Asserted BY PLATFORM rather than skipped, because the two platforms genuinely differ and a
  // skipped test is one that proves nothing (ADR-0211/0249): POSIX delivers the signal, while
  // Windows has no signals and Node emulates SIGKILL as a TerminateProcess, so the same child exits
  // with a CODE there and is a perfectly ordinary answer.
  const signalled = codexCommand(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"]);
  if (process.platform === "win32") {
    assert.notEqual(signalled, null, "Windows has no signals — that child exited with a code");
  } else {
    assert.equal(signalled, null, "a signal-killed child never answered — null, never `{ code: null }`");
  }
});

test("PINNED_CODEX_WRAPPER names the leaf's real bin path, and the repo root resolves to this workspace", () => {
  // The one place this module reaches into another package's private node_modules layout. Asserted
  // rather than assumed: a rename upstream would otherwise demote every box from `workspace-only` to
  // `absent` at once, and the report would read as "Codex was uninstalled" on a machine nothing
  // happened to.
  assert.deepEqual(PINNED_CODEX_WRAPPER.split(/[/\\]/), [
    "packages",
    "agent",
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  ]);
  assert.ok(
    existsSync(join(repoRootFromHere(), "pnpm-workspace.yaml")),
    "repoRootFromHere must resolve to the workspace root, or the wrapper is looked for in the wrong place",
  );
});

test("the Codex fix hints INSTRUCT — each names the action, and the credential hints name ADR-0232's one route", () => {
  // These hints are the "instruct" half of detect-and-instruct, so their CONTENT is the deliverable,
  // not decoration. Pinned phrase by phrase because a hint that lost its middle sentence would still
  // be a non-empty string pointing at a real anchor, and every weaker assertion would pass over it.
  const hint = (o: Partial<DevObservations>, name: string) => probeNamed({ ...DEV_HEALTHY, ...o }, name)!.fixHint ?? "";

  const workspaceOnly = hint({ codexCli: "workspace-only" }, "codex-cli");
  assert.match(workspaceOnly, /`pnpm install` alone leaves/, "it says what this state IS");
  assert.match(workspaceOnly, /--runtime codex.*NOT for an interactive Codex session/s, "…which half works");
  assert.match(workspaceOnly, /npm install -g @openai\/codex/, "…the action, if you want the other half");
  assert.match(workspaceOnly, /only ever drives Claude.*nothing is wrong/s, "…and that this may be no defect at all");

  const absent = hint({ codexCli: "absent", codexVersion: null }, "codex-cli");
  assert.match(absent, /NEITHER Codex journey/, "both halves are down");
  assert.match(absent, /pinned by packages\/agent/, "…the leaf's binary has a known source");
  assert.match(absent, /check `checkout-provisioned` first/, "…so the likely cause is a neighbouring probe");
  assert.match(absent, /no root needed/, "…and the remedy needs no escalation to a human with a password");

  const apiKey = hint({ codexLogin: "other" }, "codex-login");
  assert.match(apiKey, /ADR-0232 accepts subscription \(ChatGPT-managed\) auth ONLY/, "the rule");
  assert.match(apiKey, /OPENAI_API_KEY \/ CODEX_API_KEY \/ CODEX_ACCESS_TOKEN are stripped/, "why the key cannot work");
  assert.match(apiKey, /Codex subscription auth required/, "the refusal the reader will actually see");
  assert.match(apiKey, /never mints or handles the credential/, "and the boundary storytree keeps");

  const loggedOut = hint({ codexLogin: "logged-out" }, "codex-login");
  assert.match(loggedOut, /run `codex login`/, "the action");
  assert.match(loggedOut, /BINARY and never/, "THE COUPLING — install gives the binary, not the credential");
  // The middle clause names WHICH work the sign-in unblocks, and it is the only sentence in the
  // report that connects a missing credential to a failing `--runtime codex` build. Pinned because
  // it was a live mutant (doctor-dev.ts:635): emptied, the hint still matched every other assertion
  // here and still ended at a real guide anchor — it just stopped saying what the step is FOR.
  assert.match(loggedOut, /makes `--runtime codex` builds — and an interactive/, "…which work it unblocks");
  assert.match(loggedOut, /actually work/, "and what the step buys");

  const undetermined = hint({ codexCli: "absent", codexVersion: null, codexLogin: "undetermined" }, "codex-login");
  assert.match(undetermined, /the `codex-cli` finding, not a credential one/, "it routes to the row that owns it");
  assert.match(undetermined, /never reads as a pass/, "and says why it is not silence");

  // Every one of them ENDS by sending the reader somewhere, in the exact `See <guide>#<anchor>.`
  // form the anchor test keys on. Asserted as the whole phrase rather than just the anchor: a hint
  // that lost its "See " and its full stop still contains a valid-looking path, and the anchor test
  // would keep passing over a sentence that had come apart.
  const tail = `See ${guideStep("bootstrap")}.`;
  for (const [label, text] of [
    ["codex-cli/workspace-only", workspaceOnly],
    ["codex-cli/absent", absent],
    ["codex-login/other", apiKey],
    ["codex-login/logged-out", loggedOut],
    ["codex-login/undetermined", undetermined],
  ] as const) {
    assert.ok(text.endsWith(tail), `${label} must end with "${tail}", got: …${text.slice(-60)}`);
  }
});

test("the Codex details report the VERSION when one was read, and say so plainly when none was", () => {
  // The `??` fallback, both ways. A mutated `??` leaves the PASS row reading `(...)` with an empty
  // parenthesis on a box that answered — plausible enough to scan past.
  assert.match(probeNamed({ ...DEV_HEALTHY }, "codex-cli")!.detail, /answered on PATH \(codex-cli 0\.145\.0\)/);
  assert.match(probeNamed({ ...DEV_HEALTHY, codexVersion: null }, "codex-cli")!.detail, /\(version unreported\)/);
  assert.match(
    probeNamed({ ...DEV_HEALTHY, codexCli: "workspace-only" }, "codex-cli")!.detail,
    /wrapper in packages\/agent\/node_modules answered \(codex-cli 0\.145\.0\)/,
  );
  assert.match(
    probeNamed({ ...DEV_HEALTHY, codexCli: "workspace-only", codexVersion: null }, "codex-cli")!.detail,
    /answered \(version unreported\)/,
  );
});

test("the PASS details assert exactly what was observed and never a stronger neighbour", () => {
  assert.match(probeNamed(DEV_HEALTHY, "codex-login")!.detail, /no value is read/, "presence by name only (D3)");
  assert.match(probeNamed(DEV_HEALTHY, "codex-login")!.detail, /ChatGPT-managed/, "…and WHICH login it is");
});

test("neither Codex probe can FAIL — Codex is opt-in, so a Claude-only box is not broken", () => {
  // ADR-0030 makes the Claude Agent SDK the default and Codex opt-in, so a box with no Codex is a
  // complete configuration that simply cannot do Codex work. A FAIL would red the whole fleet
  // permanently, and a permanently-red doctor teaches readers to ignore doctor — the vacuous green
  // wearing the other mask. Asserted over EVERY non-healthy state, not one, so a later edit cannot
  // promote a single arm quietly.
  for (const codexCli of ["workspace-only", "absent"] as const) {
    for (const codexLogin of ["other", "logged-out", "undetermined"] as const) {
      const obs = { ...DEV_HEALTHY, codexCli, codexVersion: null, codexLogin };
      const report = runDoctor(EXPLORER_HEALTHY, obs);
      for (const name of ["codex-cli", "codex-login"]) {
        assert.equal(report.probes.find((p) => p.name === name)!.level, "WARN", `${name}/${codexCli}/${codexLogin}`);
      }
      assert.equal(report.ok, true, "a Codex-less box must not break an otherwise-healthy dev sweep");
    }
  }
});

test("REGRESSION: the measured box can no longer be reported over in silence", () => {
  // The exact machine state this arc was chartered on, and the exact failure. Before these two rows
  // existed, `storytree doctor --dev` on the owner's Linux box printed "0 failing, 3 warning, 16
  // passing - dev setup is healthy" and did not mention Codex ANYWHERE — no `codex` on PATH, no
  // `~/.codex/auth.json`, and a reader looking for the answer found no row to read. The report may
  // still say the box is healthy (it is, for Claude work); what it may never do again is say nothing.
  const measuredBox: DevObservations = {
    ...DEV_HEALTHY,
    codexCli: "workspace-only",
    codexVersion: "codex-cli 0.145.0",
    codexLogin: "logged-out",
  };
  const text = formatDoctorReport(runDoctor(EXPLORER_HEALTHY, measuredBox));
  assert.match(text, /codex-cli/, "the report must carry a row about the Codex CLI");
  assert.match(text, /codex-login/, "…and one about the Codex credential");
  assert.match(text, /only the pinned leaf wrapper/, "and it must name what IS present, not just what is not");
  assert.match(text, /reports no login/, "and that the credential is the binding gap");
});

test("adcCredentialsPath: Windows uses %APPDATA%\\gcloud, POSIX uses ~/.config/gcloud", () => {
  // AUTHORED ON WINDOWS, ASSERTED FOR BOTH. Hard-coding either location would silently report
  // "absent" on the other platform — a FAIL handed to a correctly-provisioned machine, which is the
  // exact second-order defect this increment was told to design against.
  const win = adcCredentialsPath({ APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "C:\\Users\\x", "win32");
  assert.match(win, /AppData[/\\]Roaming[/\\]gcloud[/\\]application_default_credentials\.json$/);

  const posix = adcCredentialsPath({}, "/home/x", "linux");
  assert.match(posix, /[/\\]home[/\\]x[/\\]\.config[/\\]gcloud[/\\]application_default_credentials\.json$/);
});

test("adcCredentialsPath: gcloud's own precedence — explicit file, then CLOUDSDK_CONFIG, then default", () => {
  assert.equal(
    adcCredentialsPath({ GOOGLE_APPLICATION_CREDENTIALS: "/keys/adc.json", CLOUDSDK_CONFIG: "/cfg" }, "/home/x", "linux"),
    "/keys/adc.json",
  );
  assert.match(
    adcCredentialsPath({ CLOUDSDK_CONFIG: "/cfg" }, "/home/x", "linux"),
    /[/\\]cfg[/\\]application_default_credentials\.json$/,
  );
  // A BLANK override is a gap, not a path — presentEnv's rule, or every join resolves against root.
  assert.match(adcCredentialsPath({ GOOGLE_APPLICATION_CREDENTIALS: "  " }, "/home/x", "linux"), /\.config/);
  // Windows with no APPDATA falls through rather than producing a garbage path.
  assert.match(adcCredentialsPath({}, "C:\\Users\\x", "win32"), /\.config/);
});

test("classifySecretsFile: names only — the returned state can hold no value", () => {
  const state = classifySecretsFile('{"CLAUDE_CODE_OAUTH_TOKEN":"tok-1","STORYTREE_DB_USER":"a@b.c"}', {});
  assert.equal(state.file, "ok");
  assert.deepEqual(state.keysInFile, ["CLAUDE_CODE_OAUTH_TOKEN", "STORYTREE_DB_USER"]);
  assert.deepEqual(state.keysMissing, []);
  assert.doesNotMatch(JSON.stringify(state), /tok-1|a@b\.c/, "no value may reach the state object");
});

test("classifySecretsFile: absent, unreadable and not-an-object are three distinct states", () => {
  assert.equal(classifySecretsFile(null, {}).file, "absent");
  assert.equal(classifySecretsFile("{not json", {}).file, "unreadable");
  assert.equal(classifySecretsFile("[]", {}).file, "unreadable", "an array is not a key/value doc");
  assert.equal(classifySecretsFile('"a string"', {}).file, "unreadable");
});

test("classifySecretsFile: the env fills a gap the file leaves, and is reported as env-only", () => {
  const state = classifySecretsFile('{"CLAUDE_CODE_OAUTH_TOKEN":"tok"}', { STORYTREE_DB_USER: "a@b.c" });
  assert.deepEqual(state.keysInFile, ["CLAUDE_CODE_OAUTH_TOKEN"]);
  assert.deepEqual(state.keysFromEnvOnly, ["STORYTREE_DB_USER"]);
  assert.deepEqual(state.keysMissing, []);
});

test("classifySecretsFile: blank on BOTH sides is missing — the hydrator would use neither", () => {
  const state = classifySecretsFile('{"STORYTREE_DB_USER":""}', { STORYTREE_DB_USER: "   " });
  assert.ok(state.keysMissing.includes("STORYTREE_DB_USER"));
  assert.deepEqual(state.keysFromEnvOnly, []);
});

/** A manifest slice the rule generator yields real rules for. */
const MANIFEST_DOC: ManifestRootSlice = {
  root: { dirs: { packages: {}, docs: {} }, files: { "README.md": {} } },
};
const MANIFEST = JSON.stringify(MANIFEST_DOC);

/**
 * The rules the wall generator produces for MANIFEST — derived through `lobbyDenyRules` itself
 * rather than hard-coded, so this suite asserts against the LIVE generator. A frozen copy here would
 * keep passing after the generator changed, which is the same vacuous green in test clothing.
 */
const EXPECTED_RULES = lobbyDenyRules(MANIFEST_DOC, "/repo");

test("classifyWriteAuthority: an installed block reads installed; a partial one reads STALE", () => {
  // `stale` is the state a presence-only check cannot see, and it is the one the derived block
  // actually reaches: a new top-level entry leaves the wall short by exactly that path.
  assert.ok(EXPECTED_RULES.length > 1, "the fixture must yield enough rules for a partial install");
  assert.equal(classifyWriteAuthority(null, MANIFEST, "/repo"), "absent", "no settings file ⇒ genuinely no block");

  assert.equal(
    classifyWriteAuthority(JSON.stringify({ permissions: { deny: EXPECTED_RULES } }), MANIFEST, "/repo"),
    "installed",
  );
  assert.equal(
    classifyWriteAuthority(JSON.stringify({ permissions: { deny: EXPECTED_RULES.slice(1) } }), MANIFEST, "/repo"),
    "stale",
    "a block missing one derived rule is stale, not installed",
  );
  assert.equal(
    classifyWriteAuthority(JSON.stringify({ permissions: { deny: ["Write(/other/**)"] } }), MANIFEST, "/repo"),
    "absent",
  );
});

test("classifyWriteAuthority: every undeterminable input is UNKNOWN, never a silent pass", () => {
  // THE VACUOUS-GREEN GUARD. Each of these would otherwise resolve to `installed`, reporting an
  // enforcing wall over a machine that has none. The empty-rule-set case is the subtlest:
  // `[].every(...)` is `true`, so an empty expectation is satisfied by an empty wall.
  assert.equal(classifyWriteAuthority(null, null, "/repo"), "unknown", "no manifest ⇒ nothing to derive from");
  assert.equal(classifyWriteAuthority(null, "{not json", "/repo"), "unknown", "unparseable manifest");
  assert.equal(
    classifyWriteAuthority("{not json", MANIFEST, "/repo"),
    "unknown",
    "an unreadable settings file cannot prove the block is absent",
  );
  // A manifest whose shape the generator cannot walk at all (no `root`) — it throws, and a throw is
  // an undetermined answer, not an absent wall.
  assert.equal(classifyWriteAuthority(JSON.stringify({}), JSON.stringify({}), "/repo"), "unknown");
  // The zero-rule case, reached through the injected generator. It is UNREACHABLE through the real
  // one — today's `lobbyDenyRules` always emits the EXTRA_DENIED_DIRS floor — which is exactly why
  // the generator is injectable: an unreachable guard is one no test can red, and a guard no test
  // can red is the same vacuous green it was written to prevent.
  assert.equal(
    classifyWriteAuthority(JSON.stringify({ permissions: { deny: [] } }), MANIFEST, "/repo", () => []),
    "unknown",
    "an EMPTY expected rule set must never read as installed",
  );
  // And the mutation that proves the guard is load-bearing: with rules to compare, the same empty
  // wall reads `absent` — so the `unknown` above came from the guard and not from the comparison.
  assert.equal(
    classifyWriteAuthority(JSON.stringify({ permissions: { deny: [] } }), MANIFEST, "/repo"),
    "absent",
  );
});

test("classifyWorktreeIdentity: linked, the deliberate primary-checkout refusal, and no-identity", () => {
  assert.equal(classifyWorktreeIdentity(true, "/repo/.git/worktrees/w", "/repo/.git"), "linked");
  // Equal dirs with no identity is the ADR-0033 D1 refusal — the lobby has none to claim under.
  assert.equal(classifyWorktreeIdentity(false, "/repo/.git", "/repo/.git"), "primary-checkout");
  // Windows separators and a trailing slash must not manufacture a false "no-identity".
  assert.equal(classifyWorktreeIdentity(false, "C:\\repo\\.git\\", "C:/repo/.git"), "primary-checkout");
  // git could not answer at all (not a repo, or no git on PATH).
  assert.equal(classifyWorktreeIdentity(false, null, null), "no-identity");
  // Registered but unclaimable — the unregistered/half-created husk shape.
  assert.equal(classifyWorktreeIdentity(false, "/repo/.git/worktrees/w", "/repo/.git"), "no-identity");
});

test("classifyDbReachability: no credential short-circuits to not-attempted, with no elapsed time", () => {
  assert.deepEqual(classifyDbReachability(false, null), { state: "not-attempted", elapsedMs: null });
  // Even if a caller somehow supplies a result, an absent credential is the honest answer.
  assert.deepEqual(classifyDbReachability(false, { reachable: true, elapsedMs: 5 }), {
    state: "not-attempted",
    elapsedMs: null,
  });
  assert.deepEqual(classifyDbReachability(true, { reachable: true, elapsedMs: 412 }), {
    state: "reachable",
    elapsedMs: 412,
  });
  assert.deepEqual(classifyDbReachability(true, { reachable: false, elapsedMs: 45_000 }), {
    state: "unreachable",
    elapsedMs: 45_000,
  });
});

// ---------------------------------------------------------------------------
// Composition with the explorer group — scope, and the narrowed-green line.
// ---------------------------------------------------------------------------

test("scope: a bare sweep is byte-for-byte the explorer set — the dev group is opt-in", () => {
  const bare = runDoctor(EXPLORER_HEALTHY);
  assert.equal(bare.scope, "explorer");
  for (const name of ["gcloud-adc", "db-reachable", "secrets-file", "gh-auth", "write-authority", "worktree-identity", "toolchain-shell", "codex-cli", "codex-login"]) {
    assert.equal(bare.probes.find((p) => p.name === name), undefined, `${name} must not run unasked`);
  }
});

test("scope: supplying dev observations IS asking for the group — no second flag to drift", () => {
  const dev = runDoctor(EXPLORER_HEALTHY, DEV_HEALTHY);
  assert.equal(dev.scope, "dev");
  assert.equal(dev.probes.length, runDoctor(EXPLORER_HEALTHY).probes.length + 10);
  assert.equal(dev.ok, true);
});

test("a bare sweep NEVER prints an unqualified green — it names the group it did not run", () => {
  // THE WHOLE POINT OF THE OPT-IN BEING SURVIVABLE. Without this line, `storytree doctor` on an
  // unprovisioned dev machine says "setup is healthy" and a blind self-onboarding agent reads that
  // as permission to stop — converting an unverified machine into an authoritative green.
  const text = formatDoctorReport(runDoctor(EXPLORER_HEALTHY));
  assert.match(text, /explorer setup is healthy/);
  assert.ok(text.includes(DEV_SCOPE_NOT_RUN), "the skipped group must be named in the summary");
  // The line has to name what it did not check, or it is a disclaimer with no content. `Codex
  // runtime` is asserted by name because it is the newest member and the one a reader is most
  // likely to be hunting for — the arc that added it exists because the report used to be silent.
  assert.match(DEV_SCOPE_NOT_RUN, /the Codex runtime/, "the skipped group must SAY it includes Codex");
  assert.match(DEV_SCOPE_NOT_RUN, /worktree identity/, "…and still name the rest of the group");
  assert.match(text, /--dev/, "…and the flag that runs it");
});

test("a dev-scoped sweep drops the not-run line and says which persona it cleared", () => {
  const text = formatDoctorReport(runDoctor(EXPLORER_HEALTHY, DEV_HEALTHY));
  assert.match(text, /dev setup is healthy/);
  assert.ok(!text.includes(DEV_SCOPE_NOT_RUN), "nothing was skipped, so nothing may be reported as skipped");
  assert.match(text, /explorer \+ dev setup check/, "the header states the scope it actually ran");
});

test("the --dev help says what the group covers, and a reader looking for Codex finds it there", () => {
  // The help is where someone decides whether to pay for the slower sweep, so an omission from it is
  // the same failure one rung up: a capability the machine has and nobody knows to ask for.
  const body = doctorHelp().body;
  assert.match(body, /storytree doctor --dev/, "the flag itself");
  assert.match(body, /whether Codex is installed and\s+logged in/, "…and that the group answers the Codex question");
  assert.match(body, /Bun/, "…and Bun, the other machine dependency pnpm cannot supply");
  assert.match(body, /SELECT 1/, "…and why it is the slower one");
  assert.match(body, /`pnpm db:probe` runs/, "…named as the verb a reader already knows");
});

test("a dev FAIL breaks the whole report's ok — the sweep is not advisory", () => {
  const report = runDoctor(EXPLORER_HEALTHY, { ...DEV_HEALTHY, gcloudAdc: "absent" });
  assert.equal(report.ok, false, "an unmet dev invariant must exit non-zero, like any other FAIL");
  assert.equal(report.failing, 1);
});

test("a fully-broken dev machine with a green explorer half is REPORTED broken, not healthy", () => {
  // The scenario in one assertion: every explorer probe passes (the machine reads fine) and the
  // machine can do no work at all. Before this group that report said "setup is healthy".
  const report = runDoctor(EXPLORER_HEALTHY, {
    gcloudAdc: "absent",
    dbReachable: "not-attempted",
    dbElapsedMs: null,
    secretsFile: {
      file: "absent",
      keysInFile: [],
      keysFromEnvOnly: [],
      keysMissing: ["CLAUDE_CODE_OAUTH_TOKEN", "STORYTREE_DB_USER"],
    },
    ghAuth: "absent",
    bun: "absent",
    bunVersion: null,
    codexCli: "absent",
    codexVersion: null,
    codexLogin: "undetermined",
    toolchainShell: "unresolvable",
    toolchainShellReadings: { login: [], plain: [], unavailable: null },
    writeAuthority: "absent",
    worktreeIdentity: "primary-checkout",
  });
  assert.equal(report.ok, false);
  assert.equal(
    report.failing,
    5,
    "ADC, the secrets file, gh auth, bun and the toolchain shell are genuinely unmet invariants — " +
      "bun joined them when 21 packages moved their tests onto it, and toolchain-shell joined them " +
      "because a machine no OTHER shell can drive runs no hook and answers no ssh-driven command",
  );
  assert.doesNotMatch(formatDoctorReport(report), /setup is healthy/);
});

// ---------------------------------------------------------------------------
// classifyToolchainShell — the shell-shape verdict, PURE over an injected platform + two readings.
// ---------------------------------------------------------------------------
//
// Every state is reachable here without spawning anything, which is the point: the producer runs two
// real shells, and a suite that could only exercise the states THIS box happens to be in would prove
// the probe on Windows and nowhere else — the second-order trap this module is built against.

const ALL: readonly string[] = [...TOOLCHAIN_COMMANDS];

test("classifyToolchainShell: both shapes resolving is the only PASSable state", () => {
  assert.equal(
    classifyToolchainShell("linux", { login: ALL, plain: ALL, unavailable: null }),
    "resolvable",
  );
});

test("classifyToolchainShell: the PLAIN shape decides — it is the shell sshd and the hook actually get", () => {
  // Order is the argument. A machine where the strictest shape answers needs no further question, so
  // `plain` is checked first and `login-only` is literally "the strict shape failed, the loose one did not".
  assert.equal(
    classifyToolchainShell("linux", { login: ALL, plain: [], unavailable: null }),
    "login-only",
  );
  assert.equal(
    classifyToolchainShell("linux", { login: [], plain: ALL, unavailable: null }),
    "resolvable",
    "if the strict shape answers, the machine works for automation whatever the login shape does",
  );
});

test("classifyToolchainShell: a PARTIAL answer is not a working shell", () => {
  // The measured shape of the breakage is total, but a shell that finds node and not pnpm still
  // returns `pnpm: command not found` to every gate invocation. Every command or none.
  assert.equal(
    classifyToolchainShell("linux", { login: ["node", "pnpm"], plain: ["node"], unavailable: null }),
    "unresolvable",
  );
});

test("classifyToolchainShell: neither shape resolving is the FAIL state (the measured breakage)", () => {
  assert.equal(
    classifyToolchainShell("linux", { login: [], plain: [], unavailable: null }),
    "unresolvable",
  );
});

test("classifyToolchainShell: WINDOWS is no-shell — never a PASS for a mechanism only Linux exercises", () => {
  // THE SECOND-ORDER TRAP, asserted from the machine that would otherwise be silently green. Note the
  // readings are DELIBERATELY the healthy ones: even handed a perfect answer, win32 must not pass,
  // because on Windows there is no login/non-login dotfile split for that answer to be about.
  assert.equal(
    classifyToolchainShell("win32", { login: ALL, plain: ALL, unavailable: null }),
    "no-shell",
  );
});

test("classifyToolchainShell: an unaskable shell is no-shell, never a silent pass", () => {
  assert.equal(
    classifyToolchainShell("linux", { login: null, plain: null, unavailable: "no-bash" }),
    "no-shell",
  );
  assert.equal(
    classifyToolchainShell("darwin", { login: null, plain: ALL, unavailable: null }),
    "no-shell",
    "one unaskable shape is enough — a comparison needs both halves",
  );
});

test("the two no-shell producers are told APART in the report, not merged into one verdict", () => {
  // One state, two genuinely different causes with different remedies (run it on Linux vs install
  // bash). classifyWriteAuthority's precedent: the state may be shared, the DETAIL may not be.
  const detailFor = (unavailable: "not-posix" | "no-bash"): string =>
    devProbes({
      ...DEV_HEALTHY,
      toolchainShell: "no-shell",
      toolchainShellReadings: { login: null, plain: null, unavailable },
    }).find((p) => p.name === "toolchain-shell")!.detail;
  assert.notEqual(detailFor("not-posix"), detailFor("no-bash"));
  assert.match(detailFor("not-posix"), /POSIX/);
  assert.match(detailFor("no-bash"), /bash could not be invoked/);
});

test("the toolchain-shell detail NAMES what each shape found, so the reader can act on it", () => {
  const probe = devProbes({
    ...DEV_HEALTHY,
    toolchainShell: "login-only",
    toolchainShellReadings: { login: ["node", "pnpm", "bun"], plain: [], unavailable: null },
  }).find((p) => p.name === "toolchain-shell")!;
  assert.match(probe.detail, /a login shell finds node, pnpm, bun/);
  assert.match(probe.detail, /a plain non-interactive shell finds nothing/);
});

test("the login-only hint does NOT send the reader back to ~/.bashrc — the one edit that cannot work", () => {
  // The whole reason this state is called out separately. A plain non-login shell never sources
  // ~/.bashrc, so the obvious remedy fails silently and repeatedly; the hint has to say so and name
  // the only two things that DO reach that shape.
  const hint = devProbes({
    ...DEV_HEALTHY,
    toolchainShell: "login-only",
    toolchainShellReadings: { login: [...ALL], plain: [], unavailable: null },
  }).find((p) => p.name === "toolchain-shell")!.fixHint!;
  assert.match(hint, /never sources it/);
  assert.match(hint, /BASH_ENV/);
});

// ---------------------------------------------------------------------------
// The probe SCRIPT — the one part of the producer a test on this machine can still fence.
// ---------------------------------------------------------------------------
//
// HONEST LIMIT, stated rather than papered over: the producer spawns two real shells, and
// `process.platform` here is win32, so the SPAWNING half is exercised only on the Linux box. What
// this machine can still prove is the script's contract, and the bug below is the one a reader
// could not otherwise catch by inspection.

test("the probe script asks for exactly the toolchain — no second list to drift", () => {
  for (const command of TOOLCHAIN_COMMANDS) {
    assert.ok(TOOLCHAIN_PROBE_SCRIPT.includes(command), `the script must ask for ${command}`);
  }
});

test("the probe script ends with `exit 0` — found-nothing must not be misreported as no-bash", () => {
  // THE BUG THIS FENCES. Without it the loop's status is the LAST `command -v`, so a shell that
  // resolved NOTHING — precisely the state being hunted — exits non-zero, throws in the producer, and
  // comes back as "bash could not be invoked". Two different verdicts with two different remedies,
  // and the wrong one sends the reader off to install a shell they already have.
  assert.match(TOOLCHAIN_PROBE_SCRIPT, /;\s*exit 0$/);
});
