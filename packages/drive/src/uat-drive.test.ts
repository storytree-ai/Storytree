import test from "node:test";
import assert from "node:assert/strict";

import type { UatTestCriterionSource } from "@storytree/library";

import {
  auditDriveReportTiming,
  auditDrivePrompt,
  classifyUatDrivePlatform,
  classifyBackgroundToolEnd,
  classifyDriveExecutionProgress,
  CODEX_CHATGPT_SUBSCRIPTION_DRIVER,
  claudeSubscriptionChildEnv,
  codexExecArguments,
  codexSubscriptionChildEnv,
  driveReportObservedAt,
  driveSurfaceUrl,
  isModelDrivenGate,
  parseDriveReport,
  projectTerminalVisibleText,
  resolveUatDriveProvider,
  selectDriveTargets,
  selectWitnessableDrive,
  uatDriveIsolationClause,
  uatDriveTaskPrompt,
  UAT_DRIVE_AUTONOMY_CLAUSE,
  UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE,
  UAT_DRIVE_HONESTY_CLAUSE,
  UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE,
  UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE,
  UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE,
  UAT_DRIVE_REPORT_FENCE,
  UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE,
  UAT_DRIVE_TOOLING_CLAUSE,
  UAT_DRIVE_WEB_TOOLING_CLAUSE,
  UAT_DRIVE_WITNESS_ENTRY,
  UatDriveRecord,
  verifyCodexSubscriptionAuth,
  type DriveGate,
  type DriveIsolation,
  type DriveRow,
  type DriveWitnessDeps,
  type DriveWitnessPolicy,
  type UatDriveSpec,
} from "./uat-drive.js";

// The offline half of ADR-0295 D1's executor. The RUN is deliberately out-of-band (it spends
// subscription-funded model time, ADR-0010 §5); everything decidable without spending is decided
// here, exactly as `dogfood-probe.test.ts` does for gate-7.

const JOURNEY = [
  "1. **The map shows the story** _(witness: machine)_ _(proof-gate: demo#gate-1)_: open the studio at",
  "   `/`, find the story's flower, click it. _(criterion-id: uatc_0123456789abcdef01234567)_",
  "   **Success —** the traversal panel opens on that story.",
].join("\n");

const ISOLATION: DriveIsolation = {
  sessionId: "uat-drive~uatc_0123456789abcdef01234567~4242",
  surfacePort: 5311,
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  scratchDir: "/tmp/storytree-uat-drive/demo",
  ceilingMinutes: 30,
  startAt: "2026-08-21T00:00:00.000Z",
  reportBy: "2026-08-21T00:28:00.000Z",
  deadlineAt: "2026-08-21T00:30:00.000Z",
  reportCleanupBufferMinutes: 2,
};

const SPEC: UatDriveSpec = {
  storyId: "demo",
  storyTitle: "The demo story",
  storyOutcome: "A reader can walk from the map into a story.",
  criterionId: "uatc_0123456789abcdef01234567",
  journey: JOURNEY,
  platform: "web-or-cli",
  isolation: ISOLATION,
};

const NATIVE_JOURNEY = [
  "7. **Pressing Enter runs the seeded command.** The member presses Enter in the native shell,",
  "   unmodified, and observes the real build reach its end state.",
].join("\n");

const NATIVE_SPEC: UatDriveSpec = {
  ...SPEC,
  journey: NATIVE_JOURNEY,
  platform: "electron-native-shell",
};

const AUTHORED_REAL_ELECTRON_BOUNDARY_JOURNEY = [
  "2. **The credentials surface is one-way — nothing reads back.**",
  "   In the running Electron app the member stores a credential through the desktop surface.",
  "   **Success —** the real preload bridge is asserted over the real `contextBridge`, not a jsdom fake.",
].join("\n");

// ── which legs this driver owns ──────────────────────────────────────────────

function src(over: {
  id: string;
  witness?: "human" | "machine" | "either";
  proofGateId?: string;
}): UatTestCriterionSource {
  return {
    criterion: {
      criterionId: over.id,
      revisionId: `uatr1:${over.id.slice(-16)}`,
      title: `leg ${over.id}`,
      witness: over.witness ?? "either",
      wouldBe: false,
      ...(over.proofGateId !== undefined ? { proofGateId: over.proofGateId } : {}),
    },
    source: `1. **leg ${over.id}** journey prose`,
  };
}

const DRIVE_GATE: DriveGate = {
  id: "demo#gate-2",
  kind: "observe",
  proofCommand: `pnpm --filter @storytree/drive exec node --import tsx src/${UAT_DRIVE_WITNESS_ENTRY} demo uatc_aaaaaaaaaaaaaaaaaaaaaaaa`,
};
const SUITE_GATE: DriveGate = {
  id: "demo#gate-1",
  kind: "observe",
  proofCommand: "pnpm --filter @storytree/studio test",
};

test("isModelDrivenGate: only a command-bearing observe gate running the witness entry", () => {
  assert.equal(isModelDrivenGate(DRIVE_GATE), true);
  assert.equal(isModelDrivenGate(SUITE_GATE), false);
  assert.equal(isModelDrivenGate({ id: "demo#gate-3", kind: "build-tests" }), false);
  assert.equal(isModelDrivenGate({ id: "demo#gate-4", kind: "observe" }), false, "no command → not ours");
});

test("Codex subscription boundary: only the non-interactive Codex exec path is invoked", () => {
  assert.deepEqual(codexExecArguments("C:/tmp/report.md"), [
    "--sandbox",
    "danger-full-access",
    "--ask-for-approval",
    "never",
    "exec",
    "--output-last-message",
    "C:/tmp/report.md",
    "-",
  ]);
  assert.equal(CODEX_CHATGPT_SUBSCRIPTION_DRIVER, "codex-chatgpt-subscription");
});

test("Codex subscription boundary: API and Anthropic credentials cannot reach a drive", () => {
  const child = codexSubscriptionChildEnv(
    {
      OPENAI_API_KEY: "api-key",
      OPENAI_BASE_URL: "https://example.test",
      ANTHROPIC_API_KEY: "anthropic-key",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-token",
      KEEP: "yes",
    },
    ISOLATION,
  );
  assert.equal(child.OPENAI_API_KEY, undefined);
  assert.equal(child.OPENAI_BASE_URL, undefined);
  assert.equal(child.ANTHROPIC_API_KEY, undefined);
  assert.equal(child.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(child.KEEP, "yes");
});

test("Codex subscription boundary: only ChatGPT login status is accepted", () => {
  assert.equal(verifyCodexSubscriptionAuth("Logged in using ChatGPT\n", {}).ok, true);
  assert.equal(verifyCodexSubscriptionAuth("Logged in using an API key\n", {}).ok, false);
  assert.equal(verifyCodexSubscriptionAuth("Logged in using ChatGPT\n", { OPENAI_API_KEY: "present" }).ok, false);
});

test("UAT provider setting: Codex is the default and Claude is explicit", () => {
  assert.deepEqual(resolveUatDriveProvider(undefined), { ok: true, provider: "codex" });
  assert.deepEqual(resolveUatDriveProvider("  "), { ok: true, provider: "codex" });
  assert.deepEqual(resolveUatDriveProvider("claude"), { ok: true, provider: "claude" });
  assert.equal(resolveUatDriveProvider("api").ok, false);
});

test("Claude subscription boundary: its explicit route never inherits metered API credentials", () => {
  const child = claudeSubscriptionChildEnv(
    {
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-token",
      ANTHROPIC_API_KEY: "anthropic-key",
      OPENAI_API_KEY: "openai-key",
      KEEP: "yes",
    },
    ISOLATION,
  );
  assert.equal(child.CLAUDE_CODE_OAUTH_TOKEN, "subscription-token");
  assert.equal(child.ANTHROPIC_API_KEY, undefined);
  assert.equal(child.OPENAI_API_KEY, undefined);
  assert.equal(child.KEEP, "yes");
});

test("selectDriveTargets: with nothing named, drives exactly the bound model-driven machine legs", () => {
  const sources = [
    src({ id: "uatc_aaaaaaaaaaaaaaaaaaaaaaaa", witness: "machine", proofGateId: "demo#gate-2" }),
    src({ id: "uatc_bbbbbbbbbbbbbbbbbbbbbbbb", witness: "machine", proofGateId: "demo#gate-1" }),
    src({ id: "uatc_cccccccccccccccccccccccc", witness: "human" }),
    src({ id: "uatc_dddddddddddddddddddddddd", witness: "machine" }),
  ];
  const sel = selectDriveTargets(sources, [DRIVE_GATE, SUITE_GATE]);
  assert.deepEqual(
    sel.targets.map((t) => t.criterionId),
    ["uatc_aaaaaaaaaaaaaaaaaaaaaaaa"],
    "a suite-bound machine leg, a human leg and an unbound leg are all somebody else's business",
  );
  assert.deepEqual(sel.unknown, []);
});

test("selectDriveTargets: a NAMED criterion is driven even though it is not flipped or bound yet", () => {
  // ADR-0348 D5's ordering: drive first, then flip the witness and bind the gate in ONE change. If
  // this required a binding, the flip would have to come first and every sibling machine leg in the
  // story would stop signing ("no partial verdict").
  const unflipped = src({ id: "uatc_eeeeeeeeeeeeeeeeeeeeeeee", witness: "human" });
  const sel = selectDriveTargets([unflipped], [], ["uatc_eeeeeeeeeeeeeeeeeeeeeeee"]);
  assert.equal(sel.targets.length, 1);
  assert.equal(sel.targets[0]?.gateId, undefined);
  assert.equal(sel.targets[0]?.journey, unflipped.source);
});

test("selectDriveTargets: a criterion id the story does not declare is reported, not ignored", () => {
  const sel = selectDriveTargets([src({ id: "uatc_ffffffffffffffffffffffff" })], [], ["uatc_000000000000000000000000"]);
  assert.deepEqual(sel.targets, []);
  assert.deepEqual(sel.unknown, ["uatc_000000000000000000000000"]);
});

test("native-shell platform is derived from authored criterion prose, never a story-id registry", () => {
  assert.equal(classifyUatDrivePlatform(NATIVE_JOURNEY), "electron-native-shell");
  assert.equal(
    classifyUatDrivePlatform("Launch the real app with Playwright's `_electron` harness."),
    "electron-native-shell",
  );
  assert.equal(classifyUatDrivePlatform("Launch with the _electron harness."), "electron-native-shell");
  assert.equal(classifyUatDrivePlatform(JOURNEY), "web-or-cli");

  const source = src({
    id: "uatc_999999999999999999999999",
    witness: "machine",
    proofGateId: "demo#gate-2",
  });
  const selection = selectDriveTargets([{ ...source, source: NATIVE_JOURNEY }], [DRIVE_GATE]);
  assert.equal(selection.targets[0]?.platform, "electron-native-shell");
});

test("authored real-Electron boundary language selects native-shell without loose Electron false positives", () => {
  assert.equal(
    classifyUatDrivePlatform(AUTHORED_REAL_ELECTRON_BOUNDARY_JOURNEY),
    "electron-native-shell",
  );
  assert.equal(
    classifyUatDrivePlatform(
      "In the installed Electron application, assert the actual preload bridge over the actual contextBridge.",
    ),
    "electron-native-shell",
    "equivalent explicit runtime + real bridge language carries the same platform contract",
  );
  assert.equal(
    classifyUatDrivePlatform("The running local backend proves that the real Electron main wired the bridge."),
    "electron-native-shell",
    "the explicitly real Electron main is itself a native product boundary",
  );

  for (const incidental of [
    "The browser documentation mentions Electron and contextBridge, but this journey drives Chromium.",
    "No Electron or preload is needed; drive the web page.",
    "The Electron main implementation is described below.",
    "In the running Electron app, inspect an ordinary DOM heading.",
    "Assert the real contextBridge shape in an isolated component test.",
  ]) {
    assert.equal(
      classifyUatDrivePlatform(incidental),
      "web-or-cli",
      `incidental or one-sided marker must not select native-shell: ${incidental}`,
    );
  }
});

test("authored real-Electron boundary receives native tooling and audit rejects Chromium substitution", () => {
  const spec: UatDriveSpec = {
    ...SPEC,
    journey: AUTHORED_REAL_ELECTRON_BOUNDARY_JOURNEY,
    platform: classifyUatDrivePlatform(AUTHORED_REAL_ELECTRON_BOUNDARY_JOURNEY),
  };
  assert.equal(spec.platform, "electron-native-shell");

  const prompt = uatDriveTaskPrompt(spec);
  assert.ok(prompt.includes(UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE));
  assert.ok(!prompt.includes(UAT_DRIVE_WEB_TOOLING_CLAUSE));
  assert.match(prompt, /Playwright's `_electron`/);
  assert.match(prompt, /apps\/desktop\/e2e\/harness\.mjs/);
  assert.match(prompt, /`win\.mouse`/);
  assert.equal(auditDrivePrompt(prompt, spec).ok, true);

  const chromiumOnly = prompt.replace(
    UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE,
    UAT_DRIVE_WEB_TOOLING_CLAUSE,
  );
  assert.ok(
    auditDrivePrompt(chromiumOnly, spec).missing.includes(
      "the native-shell platform boundary (Chromium substitution)",
    ),
  );
});

// ── the prompt ───────────────────────────────────────────────────────────────

test("uatDriveTaskPrompt: carries the authored journey VERBATIM (never a paraphrase)", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(
    prompt.includes(JOURNEY.trim()),
    "the journey must be handed over unedited — a paraphrase is the driver authoring its own acceptance claim",
  );
  assert.match(prompt, /demo/);
  assert.match(prompt, /A reader can walk from the map into a story\./);
});

test("uatDriveTaskPrompt: native-shell criteria require installed Electron and real window pointer input", () => {
  const prompt = uatDriveTaskPrompt(NATIVE_SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE));
  assert.ok(!prompt.includes(UAT_DRIVE_WEB_TOOLING_CLAUSE));
  assert.match(prompt, /Playwright's `_electron`/);
  assert.match(prompt, /apps\/desktop\/e2e\/harness\.mjs/);
  assert.match(prompt, /`win\.mouse`/);
  assert.match(prompt, /never.*(?:locator.*click|`locator\.click\(\)`)/i);
});

test("uatDriveTaskPrompt: carries ADR-0348 D4's autonomy clause (no per-step authorization)", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_AUTONOMY_CLAUSE));
  // The two things D4 actually changes, asserted as behaviour rather than as a quoted blob.
  assert.match(prompt, /do not stop to ask\s+for authorization step by step/i);
  assert.match(prompt, /open-question/i);
});

test("uatDriveTaskPrompt: forbids editing source to make the journey pass", () => {
  assert.match(uatDriveTaskPrompt(SPEC), /Do not edit repository source to make the journey pass/i);
});

// The tooling clause is guarded against the three failures the first seven live drives actually
// produced (2026-08-12) — an invented 40-min poll harness that outlived its own session, a driver
// that attached to a SIBLING worktree's studio instead of starting its own, and artifacts written
// into the working tree, which then refused the next drive. Each is asserted as the property it
// buys, not as a quoted blob, so rewording the guidance is free but dropping it is not.

test("uatDriveTaskPrompt: names the INSTALLED Playwright setup rather than 'browser control'", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_TOOLING_CLAUSE));
  assert.match(prompt, /@playwright\/test/);
  assert.match(prompt, /apps\/studio\/playwright\.config\.ts/);
  assert.match(prompt, /retain-on-failure/, "ADR-0295 D4's cheap retention must be pointed at");
  assert.doesNotMatch(
    prompt,
    /use whatever this repository actually offers/i,
    "the vague phrasing this clause replaced — a driver that reads it hand-rolls a harness",
  );
});

test("uatDriveTaskPrompt: forbids an unbounded wait, an inherited server, and artifacts in the tree", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.match(prompt, /BOUND every wait/);
  assert.match(prompt, /recorded\s+as a MISS/, "the driver must know an overrun yields no report at all");
  assert.match(prompt, /do NOT attach to whatever is already listening/);
  assert.match(prompt, /OUTSIDE the repository, or under an\s+already-ignored path/);
});

test("classifyBackgroundToolEnd: a completed exact-tool result outranks a later control-channel loss", () => {
  assert.deepEqual(
    classifyBackgroundToolEnd("playwright-42", {
      toolId: "playwright-42",
      terminalResult: "complete",
      persistedResultArtifact: "complete",
      processOutcome: "failed",
      controlChannel: "lost",
    }),
    {
      kind: "tool-ended",
      mayClaimHostTermination: false,
      reason: "the exact background tool reached a terminal product end",
    },
  );
});

test("classifyBackgroundToolEnd: a persisted exact-tool result survives expected app teardown", () => {
  const result = classifyBackgroundToolEnd("playwright-42", {
    toolId: "playwright-42",
    terminalResult: "absent",
    persistedResultArtifact: "complete",
    processOutcome: "unknown",
    controlChannel: "lost",
  });
  assert.equal(result.kind, "tool-ended");
  assert.equal(result.mayClaimHostTermination, false);
});

test("classifyBackgroundToolEnd: host termination requires exact-tool process evidence and no completed result", () => {
  const terminated = classifyBackgroundToolEnd("playwright-42", {
    toolId: "playwright-42",
    terminalResult: "absent",
    persistedResultArtifact: "absent",
    processOutcome: "host-terminated",
    controlChannel: "lost",
  });
  assert.equal(terminated.kind, "host-terminated");
  assert.equal(terminated.mayClaimHostTermination, true);

  const wrongTool = classifyBackgroundToolEnd("playwright-42", {
    toolId: "cdp-probe-99",
    terminalResult: "absent",
    persistedResultArtifact: "absent",
    processOutcome: "host-terminated",
    controlChannel: "lost",
  });
  assert.equal(wrongTool.kind, "unresolved");
  assert.equal(wrongTool.mayClaimHostTermination, false);
});

test("classifyDriveExecutionProgress: input/cursor/control-only churn does not prove execution began", () => {
  const progress = classifyDriveExecutionProgress({
    expectedProcessId: "terminal-build-42",
    rawTerminalChanged: true,
    semanticTerminalOutput: "",
  });
  assert.equal(progress.kind, "unresolved");
  assert.equal(progress.executionBegan, false);
  assert.match(progress.reason, /input, cursor, or control/i);
});

test("classifyDriveExecutionProgress: only semantic output or exact process/result evidence proves a start", () => {
  const semantic = classifyDriveExecutionProgress({
    expectedProcessId: "terminal-build-42",
    rawTerminalChanged: true,
    semanticTerminalOutput: "Building capability compose-build-command…",
  });
  assert.equal(semantic.kind, "started");
  assert.equal(semantic.executionBegan, true);

  const exactProcess = classifyDriveExecutionProgress({
    expectedProcessId: "terminal-build-42",
    rawTerminalChanged: false,
    semanticTerminalOutput: "",
    process: { processId: "terminal-build-42", outcome: "running" },
  });
  assert.equal(exactProcess.kind, "started");

  const wrongProcess = classifyDriveExecutionProgress({
    expectedProcessId: "terminal-build-42",
    rawTerminalChanged: true,
    semanticTerminalOutput: "",
    process: { processId: "cursor-probe-99", outcome: "completed" },
  });
  assert.equal(wrongProcess.kind, "unresolved");
  assert.equal(wrongProcess.executionBegan, false);

  const exactResult = classifyDriveExecutionProgress({
    expectedProcessId: "terminal-build-42",
    rawTerminalChanged: false,
    semanticTerminalOutput: "",
    result: { processId: "terminal-build-42", complete: true },
  });
  assert.equal(exactResult.kind, "started");
});

test("projectTerminalVisibleText: PSReadLine colour controls cannot hide an exactly seeded command", () => {
  const exactCommand =
    "pnpm storytree story build map-terminal-build --real --store pg --runtime claude";
  const rawSnapshot = [
    "\u001b]0;PowerShell\u0007\u001b[?25l",
    "\u001b[93mpnpm\u001b[37m storytree story build map-terminal-build ",
    "\u001b[90m--real\u001b[37m \u001b[90m--store\u001b[37m pg ",
    "\u001b[90m--runtime\u001b[37m claude\u001b[0m",
    "\r\nsemantic output: build queued for process terminal-build-42\r\n",
    "\u001b[?25h",
  ].join("");

  assert.equal(
    rawSnapshot.includes(exactCommand),
    false,
    "the measured false negative: colour-preserving product bytes are not printable text",
  );

  const visible = projectTerminalVisibleText(rawSnapshot);
  assert.ok(visible.includes(exactCommand), "the printable command is compared through visible text");
  assert.match(visible, /semantic output: build queued for process terminal-build-42/);
  assert.doesNotMatch(visible, /[\u001b\u0007]/, "terminal controls are not printable evidence");
  assert.match(rawSnapshot, /\u001b\[93m/, "the projector does not alter the raw diagnostic snapshot");
});

test("uatDriveTaskPrompt: terminal snapshots are asserted through visible text, never raw bytes", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE));
  assert.match(prompt, /projectTerminalVisibleText/);
  assert.match(prompt, /never compare/i);
  assert.match(prompt, /colour-preserving raw snapshot with `\.includes\(exactCommand\)`/i);
  assert.match(prompt, /exact process.*result identity/i);
});

test("uatDriveTaskPrompt: reconciles the exact background tool before claiming host termination", () => {
  const prompt = uatDriveTaskPrompt(SPEC);
  assert.ok(prompt.includes(UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE));
  assert.match(prompt, /exact tool's terminal result/i);
  assert.match(prompt, /lost CDP or control channel/i);
  assert.match(prompt, /cannot override an already-complete product end/i);
});

test("auditDrivePrompt: the REAL prompt keeps every guarded property", () => {
  const audit = auditDrivePrompt(uatDriveTaskPrompt(SPEC), SPEC);
  assert.equal(audit.ok, true, `drive prompt lost: ${audit.missing.join(", ")}`);
  assert.deepEqual(audit.missing, []);
});

/** A prompt carrying every guarded property EXCEPT the ones a case deliberately omits. */
/** The report contract's `surface` line, as `auditDrivePrompt` looks for it — parameterized by port. */
const SURFACE_CONTRACT = `"surface": "${driveSurfaceUrl(ISOLATION.surfacePort)}" | null`;
const FAILURE_CAUSE_CONTRACT = '"failureCause": "journey-failed" | "report-by-reached"';

function promptWithout(...omit: readonly string[]): string {
  return [
    JOURNEY,
    UAT_DRIVE_HONESTY_CLAUSE,
    "```" + UAT_DRIVE_REPORT_FENCE,
    UAT_DRIVE_TOOLING_CLAUSE,
    UAT_DRIVE_WEB_TOOLING_CLAUSE,
    UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE,
    UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE,
    UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE,
    UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE,
    uatDriveIsolationClause(ISOLATION),
    SURFACE_CONTRACT,
    FAILURE_CAUSE_CONTRACT,
  ]
    .filter((part) => !omit.includes(part))
    .join("\n");
}

test("auditDrivePrompt: a prompt that PARAPHRASES the journey fails the audit (the teeth)", () => {
  const paraphrased = promptWithout(JOURNEY).replace(
    /^/,
    "Click the flower and check the panel opens.\n",
  );
  const audit = auditDrivePrompt(paraphrased, SPEC);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.missing, ["the authored journey prose, verbatim"]);
});

test("auditDrivePrompt: dropping an honesty or harness clause fails", () => {
  assert.deepEqual(auditDrivePrompt(promptWithout(UAT_DRIVE_HONESTY_CLAUSE), SPEC).missing, [
    "the honesty clause",
  ]);
  assert.deepEqual(
    auditDrivePrompt(promptWithout("```" + UAT_DRIVE_REPORT_FENCE), SPEC).missing,
    ["the report contract fence"],
  );
  assert.deepEqual(auditDrivePrompt(promptWithout(UAT_DRIVE_TOOLING_CLAUSE), SPEC).missing, [
    "the tooling clause",
  ]);
  assert.deepEqual(
    auditDrivePrompt(promptWithout(UAT_DRIVE_BACKGROUND_RESULT_RECONCILIATION_CLAUSE), SPEC).missing,
    ["the background-tool result reconciliation clause"],
  );
  assert.deepEqual(
    auditDrivePrompt(promptWithout(UAT_DRIVE_PROGRESS_EVIDENCE_CLAUSE), SPEC).missing,
    ["the execution-progress evidence clause"],
  );
  assert.deepEqual(
    auditDrivePrompt(promptWithout(UAT_DRIVE_TERMINAL_VISIBLE_TEXT_CLAUSE), SPEC).missing,
    ["the terminal visible-text evidence clause"],
  );
  assert.deepEqual(
    auditDrivePrompt(promptWithout(UAT_DRIVE_REPORT_BY_CLOCK_CLAUSE), SPEC).missing,
    ["the runner-authoritative UTC reportBy comparison clause"],
  );
  assert.deepEqual(auditDrivePrompt(promptWithout(uatDriveIsolationClause(ISOLATION)), SPEC).missing, [
    "the isolation clause",
  ]);
  assert.deepEqual(auditDrivePrompt(promptWithout(SURFACE_CONTRACT), SPEC).missing, [
    "the report contract's `surface` field, naming this drive's reserved URL",
  ]);
  assert.deepEqual(auditDrivePrompt(promptWithout(FAILURE_CAUSE_CONTRACT), SPEC).missing, [
    "the report contract's typed failure cause",
  ]);
});

test("auditDrivePrompt: a native-shell prompt refuses Chromium or renderer-locator substitution", () => {
  const prompt = uatDriveTaskPrompt(NATIVE_SPEC);
  assert.equal(auditDrivePrompt(prompt, NATIVE_SPEC).ok, true);

  const chromiumOnly = prompt.replace(
    UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE,
    UAT_DRIVE_WEB_TOOLING_CLAUSE,
  );
  const audit = auditDrivePrompt(chromiumOnly, NATIVE_SPEC);
  assert.equal(audit.ok, false);
  assert.ok(audit.missing.includes("the native-shell Electron tooling clause"));
  assert.ok(audit.missing.includes("the native-shell platform boundary (Chromium substitution)"));

  const locatorOnly = prompt.replace(
    UAT_DRIVE_NATIVE_SHELL_TOOLING_CLAUSE,
    "Use plain Chromium; call scrollIntoViewIfNeeded() and locator.click() on the renderer node.",
  );
  assert.ok(
    auditDrivePrompt(locatorOnly, NATIVE_SPEC).missing.includes("the native-shell Electron tooling clause"),
  );

  const mismatchedPlatform: UatDriveSpec = { ...NATIVE_SPEC, platform: "web-or-cli" };
  assert.ok(
    auditDrivePrompt(uatDriveTaskPrompt(mismatchedPlatform), mismatchedPlatform).missing.includes(
      "the criterion-derived platform binding",
    ),
  );
});

test("auditDrivePrompt: a prompt built for a DIFFERENT drive fails its own audit", () => {
  // The isolation clause is parameterized, so the audit is only meaningful if it rebuilds the clause
  // from THIS spec. A prompt carrying another drive's port and session id would sail through a
  // constant-comparison audit while telling the driver to walk somebody else's surface.
  const other: UatDriveSpec = {
    ...SPEC,
    isolation: { ...ISOLATION, sessionId: "uat-drive~other~99", surfacePort: 5399 },
  };
  const audit = auditDrivePrompt(uatDriveTaskPrompt(other), SPEC);
  assert.equal(audit.ok, false);
  // BOTH parameterized properties catch it, and that is the point rather than noise: the surface
  // contract names the reserved URL too, so a prompt built for another drive is refused twice over —
  // once for telling the driver to walk port 5399, and once for inviting it to REPORT port 5399 as
  // its own. A single-property audit here would have been one edit away from missing the swap.
  assert.deepEqual(audit.missing, [
    "the isolation clause",
    "the report contract's `surface` field, naming this drive's reserved URL",
  ]);
});

// ── the report contract ──────────────────────────────────────────────────────

function fenced(body: string): string {
  return ["I walked the journey.", "```" + UAT_DRIVE_REPORT_FENCE, body, "```"].join("\n");
}

test("parseDriveReport: reads a well-formed report", () => {
  const res = parseDriveReport(
    fenced(
      JSON.stringify({
        outcome: "pass",
        summary: "Opened the studio, clicked the flower, the panel opened.",
        steps: [{ step: "click the flower", outcome: "pass", note: "panel opened" }],
      }),
    ),
  );
  assert.equal(res.ok, true);
  assert.ok(res.ok);
  assert.equal(res.report.outcome, "pass");
  assert.equal(res.report.steps.length, 1);
  assert.equal(res.report.escalated, false, "escalated defaults false");
});

test("parseDriveReport: takes the LAST block (a driver that redrafts mid-run)", () => {
  const text = [
    fenced(JSON.stringify({ outcome: "pass", summary: "first draft" })),
    fenced(
      JSON.stringify({
        outcome: "fail",
        failureCause: "journey-failed",
        summary: "on re-reading, step 2 never happened",
      }),
    ),
  ].join("\n\n");
  const res = parseDriveReport(text);
  assert.ok(res.ok);
  assert.equal(res.report.outcome, "fail");
  assert.equal(res.report.summary, "on re-reading, step 2 never happened");
});

test("deadline report timing: runner UTC refuses the measured premature exhaustion without touching ordinary fails", () => {
  const deadlineFail = {
    outcome: "fail" as const,
    failureCause: "report-by-reached" as const,
    summary: "Stopped because reportBy had elapsed.",
    steps: [],
    escalated: false,
  };
  const timing = {
    reportBy: "2026-08-21T19:21:50.000Z",
    reportObservedAt: "2026-08-21T18:54:18.589Z",
  };

  const premature = auditDriveReportTiming(deadlineFail, timing);
  assert.equal(premature.ok, false);
  assert.ok(!premature.ok);
  assert.match(premature.reason, /before reportBy/i);

  assert.deepEqual(
    auditDriveReportTiming(deadlineFail, {
      ...timing,
      reportObservedAt: "2026-08-21T19:21:50.001Z",
    }),
    { ok: true },
  );
  assert.deepEqual(
    auditDriveReportTiming(
      { ...deadlineFail, failureCause: "journey-failed", summary: "The product assertion failed." },
      timing,
    ),
    { ok: true },
    "an ordinary product fail remains admissible before reportBy",
  );
  assert.equal(
    driveReportObservedAt(
      Date.parse("2026-08-21T19:30:00.000Z"),
      Date.parse("2026-08-21T18:54:18.589Z"),
    ),
    "2026-08-21T18:54:18.589Z",
    "Codex final-message host mtime wins over a wrapper that returns late",
  );
});

test("parseDriveReport: NO report is a refusal, never an implied pass", () => {
  const res = parseDriveReport("Everything worked great! The journey passes.");
  assert.equal(res.ok, false);
  assert.ok(!res.ok);
  assert.match(res.reason, /MISS, not a pass/);
});

test("parseDriveReport: unreadable JSON and an off-contract shape both refuse", () => {
  const broken = parseDriveReport(fenced("{ outcome: pass,,, }"));
  assert.ok(!broken.ok);
  assert.match(broken.reason, /not valid JSON/);

  const offContract = parseDriveReport(fenced(JSON.stringify({ outcome: "maybe", summary: "eh" })));
  assert.ok(!offContract.ok);
  assert.match(offContract.reason, /does not satisfy the contract/);

  const noSummary = parseDriveReport(fenced(JSON.stringify({ outcome: "pass" })));
  assert.ok(!noSummary.ok, "a report with no summary is off-contract");

  const unclassifiedFail = parseDriveReport(
    fenced(JSON.stringify({ outcome: "fail", summary: "stopped without a typed cause" })),
  );
  assert.ok(!unclassifiedFail.ok, "a fail without a typed cause cannot bypass timing audit");
});

test("parseDriveReport: an escalation (ADR-0348 D4) round-trips with its question id", () => {
  const res = parseDriveReport(
    fenced(
      JSON.stringify({
        outcome: "fail",
        failureCause: "journey-failed",
        summary: "unsure whether to merge the PR the journey asks for; asked the owner",
        escalated: true,
        openQuestionId: "oq-should-the-drive-merge",
      }),
    ),
  );
  assert.ok(res.ok);
  assert.equal(res.report.escalated, true);
  assert.equal(res.report.openQuestionId, "oq-should-the-drive-merge");
});

// ── the record shape ─────────────────────────────────────────────────────────

test("UatDriveRecord: rejects an unknown field (nothing forgeable rides along)", () => {
  const base = {
    storyId: "demo",
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:deadbeefdeadbeef",
    outcome: "pass",
    commitSha: "abc1234",
    runId: "uat-drive:1",
    driver: "claude-code",
    summary: "walked it",
    at: "2026-08-12T00:00:00.000Z",
  };
  assert.ok(UatDriveRecord.safeParse(base).success);
  assert.equal(
    UatDriveRecord.safeParse({ ...base, proofMode: "story", signer: "spine" }).success,
    false,
    "a drive record must never be shaped like a signed verdict — no model signs its own proof",
  );
});

// ── the witness selector ─────────────────────────────────────────────────────

const NOW = new Date("2026-08-12T00:00:00.000Z");
const POLICY: DriveWitnessPolicy = {
  criterionId: "uatc_0123456789abcdef01234567",
  revisionId: "uatr1:deadbeefdeadbeef",
  freshnessDays: 90,
};
const DEPS: DriveWitnessDeps = { ancestorOfHead: () => true, now: () => NOW };

function row(over: Partial<DriveRow> = {}): DriveRow {
  return {
    criterionId: POLICY.criterionId,
    revisionId: POLICY.revisionId,
    outcome: "pass",
    commitSha: "abc1234def",
    runId: "uat-drive:1",
    driver: "claude-code",
    at: "2026-08-10T00:00:00.000Z",
    ...over,
  };
}

test("selectWitnessableDrive: a fresh landed pass over the current revision witnesses", () => {
  const res = selectWitnessableDrive([row()], POLICY, DEPS);
  assert.ok(res.ok);
  assert.equal(res.drive.runId, "uat-drive:1");
});

test("selectWitnessableDrive: no rows at all names the repair (run the driver)", () => {
  const res = selectWitnessableDrive([], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /run the driver/);
});

test("selectWitnessableDrive: a re-authored journey INVALIDATES the drive (the honesty wall)", () => {
  const res = selectWitnessableDrive([row({ revisionId: "uatr1:0000000000000000" })], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /the journey prose changed since it was driven/);
});

test("selectWitnessableDrive: a fail, a stale pass, and an unlanded commit each disqualify", () => {
  const failed = selectWitnessableDrive([row({ outcome: "fail" })], POLICY, DEPS);
  assert.ok(!failed.ok);
  assert.match(failed.reasons.join("\n"), /outcome "fail", not "pass"/);

  const stale = selectWitnessableDrive([row({ at: "2026-01-01T00:00:00.000Z" })], POLICY, DEPS);
  assert.ok(!stale.ok);
  assert.match(stale.reasons.join("\n"), /is stale/);

  const unlanded = selectWitnessableDrive([row()], POLICY, { ...DEPS, ancestorOfHead: () => false });
  assert.ok(!unlanded.ok);
  assert.match(unlanded.reasons.join("\n"), /not an ancestor of HEAD/);
});

test("selectWitnessableDrive: a drive for a DIFFERENT criterion never witnesses this one", () => {
  const res = selectWitnessableDrive([row({ criterionId: "uatc_ffffffffffffffffffffffff" })], POLICY, DEPS);
  assert.ok(!res.ok);
  assert.match(res.reasons.join("\n"), /is for criterion uatc_ffffffffffffffffffffffff/);
});

test("selectWitnessableDrive: picks the LATEST qualifying pass, past disqualified siblings", () => {
  const res = selectWitnessableDrive(
    [
      row({ runId: "old", at: "2026-08-01T00:00:00.000Z" }),
      row({ runId: "failed", outcome: "fail", at: "2026-08-11T00:00:00.000Z" }),
      row({ runId: "newest", at: "2026-08-09T00:00:00.000Z" }),
    ],
    POLICY,
    DEPS,
  );
  assert.ok(res.ok);
  assert.equal(res.drive.runId, "newest");
});
