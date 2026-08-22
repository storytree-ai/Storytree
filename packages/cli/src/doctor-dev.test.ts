import test from "node:test";
import assert from "node:assert/strict";

import { lobbyDenyRules, type ManifestRootSlice } from "@storytree/drive";

import {
  GUIDE_ANCHORS,
  MACHINE_GUIDE,
  adcCredentialsPath,
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
  assert.ok(probes.length >= 6, "the group is six probes");
  for (const p of probes) {
    assert.equal(p.level, "PASS", `${p.name} should pass on a healthy dev machine`);
    assert.equal(p.fixHint, undefined, `${p.name} must carry no fix hint while it passes`);
  }
});

test("the group covers exactly the six invariants the explorer set says nothing about", () => {
  assert.deepEqual(
    devProbes(DEV_HEALTHY).map((p) => p.name),
    [
      "gcloud-adc",
      "db-reachable",
      "secrets-file",
      "gh-auth",
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
 * three of these six can never FAIL for stated reasons (doctor's offline invariant, a guardrail
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
    writeAuthority: "absent",
    worktreeIdentity: "no-identity",
  };
  const probes = devProbes(broken);
  assert.equal(probes.filter((p) => p.level === "PASS").length, 0, "the fixture must break all six");
  for (const p of probes) {
    const hint = p.fixHint ?? "";
    const m = new RegExp(`${MACHINE_GUIDE.replace(/[.]/g, "\\.")}(#[a-z0-9-]+)`).exec(hint);
    assert.ok(m !== null, `${p.name}'s hint must name ${MACHINE_GUIDE}#<anchor>`);
    assert.ok(anchors.has(m[1]!), `${p.name} points at unknown anchor ${m[1]}`);
  }
});

test("only the two probes an installer step genuinely repairs carry a fixStep", () => {
  // ADR-0207 D6's repair vocabulary: a fixStep names an idempotent `install.ps1 @step:` re-run. The
  // rest of this group repairs through a guide step or a storytree verb, and naming an installer
  // step that would NOT repair them would be a false entry (the dependencies-current precedent).
  const broken = devProbes({
    ...DEV_HEALTHY,
    gcloudAdc: "absent",
    dbReachable: "unreachable",
    ghAuth: "absent",
    writeAuthority: "absent",
    worktreeIdentity: "primary-checkout",
  });
  assert.deepEqual(
    broken.filter((p) => p.fixStep !== undefined).map((p) => p.name),
    ["gh-auth"],
    "only gh-auth's remedy IS an installer step",
  );
});

// ---------------------------------------------------------------------------
// PURE classifiers — the platform-sensitive and parse-sensitive halves.
// ---------------------------------------------------------------------------

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
} as unknown as ManifestRootSlice;
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
  for (const name of ["gcloud-adc", "db-reachable", "secrets-file", "gh-auth", "write-authority", "worktree-identity"]) {
    assert.equal(bare.probes.find((p) => p.name === name), undefined, `${name} must not run unasked`);
  }
});

test("scope: supplying dev observations IS asking for the group — no second flag to drift", () => {
  const dev = runDoctor(EXPLORER_HEALTHY, DEV_HEALTHY);
  assert.equal(dev.scope, "dev");
  assert.equal(dev.probes.length, runDoctor(EXPLORER_HEALTHY).probes.length + 6);
  assert.equal(dev.ok, true);
});

test("a bare sweep NEVER prints an unqualified green — it names the group it did not run", () => {
  // THE WHOLE POINT OF THE OPT-IN BEING SURVIVABLE. Without this line, `storytree doctor` on an
  // unprovisioned dev machine says "setup is healthy" and a blind self-onboarding agent reads that
  // as permission to stop — converting an unverified machine into an authoritative green.
  const text = formatDoctorReport(runDoctor(EXPLORER_HEALTHY));
  assert.match(text, /explorer setup is healthy/);
  assert.ok(text.includes(DEV_SCOPE_NOT_RUN), "the skipped group must be named in the summary");
  assert.match(text, /--dev/, "…and the flag that runs it");
});

test("a dev-scoped sweep drops the not-run line and says which persona it cleared", () => {
  const text = formatDoctorReport(runDoctor(EXPLORER_HEALTHY, DEV_HEALTHY));
  assert.match(text, /dev setup is healthy/);
  assert.ok(!text.includes(DEV_SCOPE_NOT_RUN), "nothing was skipped, so nothing may be reported as skipped");
  assert.match(text, /explorer \+ dev setup check/, "the header states the scope it actually ran");
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
    writeAuthority: "absent",
    worktreeIdentity: "primary-checkout",
  });
  assert.equal(report.ok, false);
  assert.equal(report.failing, 3, "ADC, the secrets file and gh auth are genuinely unmet invariants");
  assert.doesNotMatch(formatDoctorReport(report), /setup is healthy/);
});
