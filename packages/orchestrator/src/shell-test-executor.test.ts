import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";

import {
  DEFAULT_PROOF_TIMEOUT_MS,
  ShellTestExecutor,
  UNVETTED_GREEN_NOTE,
  defaultClassifyKind,
  isScrubbedEnvKey,
  nodeEvalExecutor,
  runShellCommand,
} from "./shell-test-executor.js";

// These spawn the SAME Node binary running this test — fully offline, no files, no network.

test("nodeEvalExecutor: a green script (exit 0) is observed as green", async () => {
  const exec = nodeEvalExecutor({ ok: "process.exit(0)" });
  const obs = await exec.run("ok");
  // The shape gained a `note` under `oracle-veto-covers-custom-proof-commands`: this executor wires
  // no assert-oracle cross-check, so its green now says so. What this case asserts — exit 0 is
  // observed GREEN, under this testId — is unchanged; the vetting stamp is asserted on its own below.
  assert.equal(obs.result, "green");
  assert.equal(obs.testId, "ok");
});

test("nodeEvalExecutor: an exit-1 script is a red with kind 'runtime'", async () => {
  const exec = nodeEvalExecutor({ bad: "process.exit(1)" });
  const obs = await exec.run("bad");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "runtime");
  assert.equal(obs.testId, "bad");
});

test("nodeEvalExecutor: a compile-shaped message + exit 1 is a red with kind 'compile'", async () => {
  const exec = nodeEvalExecutor({
    compile: 'console.error("error: cannot find name X"); process.exit(1)',
  });
  const obs = await exec.run("compile");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "compile");
});

test("ENV HONESTY: the spawned observer never inherits NODE_TEST* (the forged-green channel)", async () => {
  // THIS process runs under `node --test`, so NODE_TEST_CONTEXT is set right now. A spawned
  // `node --test <file>` that inherited it would act as a runner child and could exit 0 without
  // running the file — a forged green. The executor must scrub every NODE_TEST* var.
  assert.ok(
    Object.keys(process.env).some((k) => k.startsWith("NODE_TEST")),
    "precondition: the suite itself runs under node --test",
  );
  const exec = nodeEvalExecutor({
    scrubbed:
      "process.exit(Object.keys(process.env).some((k) => k.startsWith('NODE_TEST')) ? 1 : 0)",
  });
  const obs = await exec.run("scrubbed");
  assert.equal(obs.result, "green", "the child saw a NODE_TEST* variable — the scrub failed");
});

test("ShellTestExecutor: a red is DATA — run resolves, does not throw", async () => {
  const exec = nodeEvalExecutor({ bad: "process.exit(2)" });
  // Must not reject: a non-zero exit is a red observation, not a spawn error.
  const obs = await exec.run("bad");
  assert.equal(obs.result, "red");
});

test("ShellTestExecutor: stdout-only compile shape classifies as compile", async () => {
  const exec = nodeEvalExecutor({
    c: 'console.log("SyntaxError: unexpected token"); process.exit(1)',
  });
  const obs = await exec.run("c");
  assert.equal(obs.kind, "compile");
});

test("ShellTestExecutor: a custom classifyKind overrides the default heuristic", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(1)"] }),
    classifyKind: () => "compile",
  });
  const obs = await exec.run("any");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "compile");
});

// ── The classifier told the truth about Node's own errors (`gate-the-right-kind-red`) ────────────

test("defaultClassifyKind reads Node's REAL module-resolution errors as compile, not runtime", () => {
  // THE bug. The alternatives were TypeScript's wording (`cannot find name`, `no such module`), and
  // matched none of what Node prints — so a net-new node's unresolved import, the single most common
  // structural red in the corpus, classified as `runtime` and was stamped that way on every verdict's
  // evidence. Nothing consumed the answer, so nothing ever went red over it.
  const asCompile = [
    "Error: Cannot find module './thing.js'\nERR_MODULE_NOT_FOUND",
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'nope' imported from /x/y.ts",
    "TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension \".ts\"",
    "SyntaxError: Unexpected token",
    "src/x.ts(3,5): error TS2304: cannot find name 'Foo'",
  ];
  for (const text of asCompile) {
    assert.equal(
      defaultClassifyKind({ stdout: "", stderr: text, code: 1 }),
      "compile",
      `should be compile: ${text.split("\n")[0]}`,
    );
  }
  // ...and a real assertion failure is still runtime — the widening must not swallow everything.
  assert.equal(
    defaultClassifyKind({
      stdout: "",
      stderr: "AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n1 !== 2",
      code: 1,
    }),
    "runtime",
  );
});

test("ShellTestExecutor: a MEASURED red-kind wins over the text heuristic and is stamped oracle-count", async () => {
  const exec = new ShellTestExecutor({
    // Output that the TEXT heuristic would read as `compile`...
    command: () => ({
      file: process.execPath,
      args: ["-e", 'console.error("Cannot find module \'./x.js\'"); process.exit(1)'],
    }),
    // ...while the MEASUREMENT says an assertion really ran and failed. The measurement wins.
    measureRedKind: () => "runtime",
  });
  const obs = await exec.run("any");
  assert.equal(obs.result, "red");
  assert.equal(obs.kind, "runtime");
  assert.equal(obs.kindBasis, "oracle-count");
});

test("ShellTestExecutor: an UNMEASURABLE red falls back to the heuristic and is stamped output-text", async () => {
  // `measureRedKind` returning undefined means "cannot measure" — NOT a kind. It must degrade to the
  // heuristic with the honest basis, so the phase gate stays disarmed rather than refusing on a guess.
  const exec = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      args: ["-e", 'console.error("Cannot find module \'./x.js\'"); process.exit(1)'],
    }),
    measureRedKind: () => undefined,
  });
  const obs = await exec.run("any");
  assert.equal(obs.kind, "compile");
  assert.equal(obs.kindBasis, "output-text");
});

test("ShellTestExecutor: a genuine spawn failure (ENOENT) rejects, not a silent green", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: "definitely-not-a-real-binary-xyz", args: [] }),
  });
  await assert.rejects(() => exec.run("nope"), /failed to spawn/);
});

test("ShellTestExecutor: passes cwd through to the spawned process", async () => {
  const target = tmpdir();
  const exec = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      // Print the child's resolved cwd so we can assert it matches what we passed.
      args: ["-e", "process.stdout.write(process.cwd())"],
      cwd: target,
    }),
  });
  // Capture via the same machinery: green means exit 0; we verify cwd via a second probe.
  const obs = await exec.run("cwd");
  assert.equal(obs.result, "green");
  // Second probe: child exits 0 only if its cwd resolves to the same realpath as `target`.
  const check = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      args: [
        "-e",
        `process.exit(require('fs').realpathSync(process.cwd()) === require('fs').realpathSync(${JSON.stringify(target)}) ? 0 : 1)`,
      ],
      cwd: target,
    }),
  });
  assert.equal((await check.run("cwd2")).result, "green");
});

// ── runShellCommand: the shared runner (CONFIRM observations + the leaf's feedback tools) ──

test("runShellCommand captures stdout, stderr, and a non-zero exit code as DATA", async () => {
  const out = await runShellCommand({
    file: process.execPath,
    args: ["-e", "console.log('out-line'); console.error('err-line'); process.exit(3)"],
  });
  assert.equal(out.code, 3);
  assert.match(out.stdout, /out-line/);
  assert.match(out.stderr, /err-line/);
});

test("runShellCommand rejects on a genuine spawn failure (the command never ran)", async () => {
  await assert.rejects(
    () => runShellCommand({ file: "definitely-not-a-real-binary-xyz", args: [] }),
    /failed to spawn/,
  );
});

test("ENV HONESTY: secret-shaped vars never reach the spawned process (output flows to the leaf)", async () => {
  // The leaf authors the test file the proof command executes, and the feedback tool returns the
  // command's OUTPUT to the model — a test that prints process.env must find no credentials.
  process.env["STORYTREE_FAKE_TOKEN"] = "leak-me";
  process.env["STORYTREE_FAKE_PLAIN"] = "pass-through";
  try {
    const out = await runShellCommand({
      file: process.execPath,
      args: [
        "-e",
        "process.stdout.write(`${process.env.STORYTREE_FAKE_TOKEN ?? 'absent'}|${process.env.STORYTREE_FAKE_PLAIN ?? 'absent'}`)",
      ],
    });
    assert.equal(out.stdout, "absent|pass-through");
  } finally {
    delete process.env["STORYTREE_FAKE_TOKEN"];
    delete process.env["STORYTREE_FAKE_PLAIN"];
  }
});

test("ADR-0064 ENV FORCE: cmd.env is merged LAST and OVERRIDES an inherited (prod) value", async () => {
  // The DB-backed proof honesty wall: the spine forces STORYTREE_DB_NAME to the disposable test DB,
  // and that value must WIN even when the parent process points at production — so a db-backed proof
  // can never reach prod through an inherited env.
  process.env["STORYTREE_DB_NAME"] = "storytree"; // the parent points at PRODUCTION
  try {
    const out = await runShellCommand({
      file: process.execPath,
      args: ["-e", "process.stdout.write(process.env.STORYTREE_DB_NAME ?? 'absent')"],
      env: { STORYTREE_DB_NAME: "storytree_test" }, // the spine forces the disposable DB
    });
    assert.equal(out.stdout, "storytree_test", "cmd.env must override the inherited prod value");
  } finally {
    delete process.env["STORYTREE_DB_NAME"];
  }
});

test("ADR-0064 ENV FORCE: cmd.env injects a var the parent never set", async () => {
  assert.equal(process.env["STORYTREE_INJECTED_ONLY"], undefined, "precondition: unset in parent");
  const out = await runShellCommand({
    file: process.execPath,
    args: ["-e", "process.stdout.write(process.env.STORYTREE_INJECTED_ONLY ?? 'absent')"],
    env: { STORYTREE_INJECTED_ONLY: "from-spine" },
  });
  assert.equal(out.stdout, "from-spine");
});

test("isScrubbedEnvKey: the real credential names are scrubbed; benign names are not", () => {
  for (const key of [
    "CLAUDE_CODE_OAUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "AWS_SECRET_ACCESS_KEY",
    "MY_PASSWORD",
    "NODE_TEST_CONTEXT",
  ]) {
    assert.equal(isScrubbedEnvKey(key), true, `${key} must be scrubbed`);
  }
  for (const key of ["PATH", "HOME", "USERPROFILE", "STORYTREE_STUDIO_STORE", "ComSpec"]) {
    assert.equal(isScrubbedEnvKey(key), false, `${key} must pass through`);
  }
});

// ── runShellCommand: the fail-closed timeout (a hung proof must never wedge the gate) ──
// The spine OBSERVES red/green by spawning a proof command through this ONE runner. If a proof leaks
// an OS handle (a DB connector/socket/timer) and never exits, an UNBOUNDED spawn hangs the CONFIRM
// observation INDEFINITELY — wedging the whole gate drive (hit driving library#gate-5, 2026-06-25).
// A bounded timeout + SIGKILL makes a hung proof fail CLOSED: the child is killed → observed red.
// The probe sleeps far longer than the injected timeout but SELF-TERMINATES (exit 0) if never killed,
// so the test itself never leaks a handle (the very `real-test-must-not-leak-a-handle` discipline this
// backstop enforces) and a regression FAILS fast instead of hanging the suite forever.

test("runShellCommand: a command that outruns its timeout is SIGKILLed and observed as red (code null), not a reject", async () => {
  const out = await runShellCommand({
    file: process.execPath,
    // `setInterval(() => {}, 1000)` would hang FOREVER (the real bug shape); a finite over-long sleep
    // proves the SAME kill path while keeping THIS test leak-free + regression-fast.
    args: ["-e", "setTimeout(() => {}, 4000)"],
    timeoutMs: 200,
  });
  // Killed by a signal → no exit code: `code` is null (ShellRunResult.code is `number | null` for
  // exactly this). null !== 0, so a consumer reads it as RED — never a green, never a spawn-failure
  // reject. Before the fix the timeout is ignored, the sleep runs to exit 0, and this asserts red→fail.
  assert.equal(out.code, null);
});

test("ShellTestExecutor: a hung proof command is observed as a red TestObservation within the timeout (never a wedge)", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({
      file: process.execPath,
      args: ["-e", "setTimeout(() => {}, 4000)"],
      timeoutMs: 200,
    }),
  });
  const obs = await exec.run("hang");
  assert.equal(obs.result, "red");
});

test("DEFAULT_PROOF_TIMEOUT_MS is a positive, finite production default (the backstop is always armed)", () => {
  // execFile treats 0/undefined as NO timeout, so the spine-wide default must be a positive finite
  // number — otherwise an absent cmd.timeoutMs would silently disable the fail-closed backstop.
  assert.equal(Number.isFinite(DEFAULT_PROOF_TIMEOUT_MS), true);
  assert.ok(DEFAULT_PROOF_TIMEOUT_MS > 0);
});

test("defaultClassifyKind: classifies TS-diagnostic and missing-symbol shapes as compile", () => {
  assert.equal(
    defaultClassifyKind({ stdout: "", stderr: "TS2304: blah", code: 1 }),
    "compile",
  );
  assert.equal(
    defaultClassifyKind({ stdout: "x is not defined", stderr: "", code: 1 }),
    "compile",
  );
  assert.equal(
    defaultClassifyKind({ stdout: "AssertionError", stderr: "", code: 1 }),
    "runtime",
  );
});

// ── `oracle-veto-covers-custom-proof-commands`: a green says whether it was VETTED ────────────────
// ADR-0211's assert-oracle veto is wired only for the DEFAULT `node --import tsx --test <file>`
// command. Custom-`proofCommand` nodes — package suites, vitest, and structurally EVERY ADR-0098 R2
// `refactorForTests` node, whose schema refine REQUIRES a proofCommand — keep exit-code-only
// observation. That narrowing is defensible; leaving it INVISIBLE is not. A vetted green and an
// unvetted one were byte-identical in the signed verdict, so no reader could tell which they held.

test("a green with NO oracle cross-check is stamped UNVETTED (the gap is visible, not silent)", async () => {
  // nodeEvalExecutor wires no verifyGreen — the exit-code-only shape a custom proofCommand gets.
  const exec = nodeEvalExecutor({ ok: "process.exit(0)" });
  const obs = await exec.run("ok");

  assert.equal(obs.result, "green");
  assert.equal(
    obs.note,
    UNVETTED_GREEN_NOTE,
    "an unvetted green must SAY it is unvetted rather than look like a vetted one",
  );
});

// `custom-proof-command-red-accounting`: the note above is now a FALLBACK. Once the resolver started
// wiring the guard onto every custom command that could carry one, an unaccounted route stopped meaning
// "nobody wired an oracle" and started meaning "no oracle is POSSIBLE here" — which is a different fact
// per route, so the executor takes the classifier's own sentence instead of a standing disclaimer.

test("a resolver-supplied unvetted note replaces the generic one, and still reads as unvetted", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(0)"] }),
    unvettedNote: "unvetted: exit-code-only — the proof runs vitest, which asserts through chai",
  });
  const obs = await exec.run("t");

  assert.equal(obs.result, "green");
  assert.match(obs.note ?? "", /^unvetted: exit-code-only/);
  assert.match(obs.note ?? "", /vitest/, "the route's OWN reason, not the standing disclaimer");
  assert.notEqual(obs.note, UNVETTED_GREEN_NOTE);
});

test("a supplied unvetted note is IGNORED when a cross-check IS wired — a green cannot claim both", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(0)"] }),
    verifyGreen: () => ({ ok: true, note: "assert-oracle: 3 assertion(s) executed" }),
    unvettedNote: "unvetted: exit-code-only — should never be reached",
  });
  const obs = await exec.run("t");

  assert.equal(obs.note, "assert-oracle: 3 assertion(s) executed");
});

test("a green WITH a passing oracle cross-check carries that check's own note (vetted, and says how)", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(0)"] }),
    verifyGreen: () => ({ ok: true, note: "assert-oracle: 7 assertion(s) executed" }),
  });
  const obs = await exec.run("t");

  assert.equal(obs.result, "green");
  assert.equal(obs.note, "assert-oracle: 7 assertion(s) executed");
  assert.notEqual(obs.note, UNVETTED_GREEN_NOTE, "a VETTED green must never read as unvetted");
});

test("a vetoed green is still a fail-closed RED carrying the veto reason (ADR-0211 unchanged)", async () => {
  const exec = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", "process.exit(0)"] }),
    verifyGreen: () => ({ ok: false, reason: "0 assertions executed" }),
  });
  const obs = await exec.run("t");

  assert.equal(obs.result, "red");
  assert.equal(obs.note, "0 assertions executed");
});
