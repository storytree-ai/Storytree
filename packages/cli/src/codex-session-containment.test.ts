import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { ClaimDocT } from "@storytree/notice-board";

import {
  authorizeCodexWriter,
  buildCodexContainmentBundle,
  codexSessionContainmentCommand,
  defaultCodexContainmentIo,
  decideInteractiveCodexToolUse,
  parseCodexVersion,
  resolveCodexSessionTopology,
  type CodexContainmentIo,
  type CodexGitProbe,
} from "./codex-session-containment.js";

const NOW = new Date("2026-08-12T06:00:00.000Z");
const ROOT = path.resolve("C:/code/storytree");
const CURRENT = path.join(ROOT, ".claude", "worktrees", "codex-current");
const SIBLING = path.join(ROOT, ".claude", "worktrees", "codex-sibling");
const GIT_DIR = path.join(ROOT, ".git", "worktrees", "codex-current");
const COMMON_DIR = path.join(ROOT, ".git");

test("the production containment IO probes this registered checkout and pinned Codex", () => {
  const probe = defaultCodexContainmentIo.probeGit();
  assert.equal(
    path.relative(path.resolve(probe.topLevel), path.resolve(process.cwd())).replaceAll("\\", "/"),
    "packages/cli",
  );
  assert.ok(path.isAbsolute(probe.gitDir));
  assert.ok(path.isAbsolute(probe.commonDir));
  assert.match(defaultCodexContainmentIo.codexVersion(), /^codex-cli \d+\.\d+\.\d+/);
  assert.equal(defaultCodexContainmentIo.managedNodePath(), process.execPath);
  assert.ok(
    process.platform === "win32"
      ? path.isAbsolute(defaultCodexContainmentIo.managedDir())
      : path.win32.isAbsolute(defaultCodexContainmentIo.managedDir()),
  );
  assert.equal(
    defaultCodexContainmentIo.canonicalize(path.join(probe.topLevel, "not-created-yet", "file.txt")),
    path.join(probe.topLevel, "not-created-yet", "file.txt"),
  );
  assert.throws(() => defaultCodexContainmentIo.writeFile("ignored", "ignored"), /never writes/);
});

function norm(value: string): string {
  const resolved = path.resolve(value).replaceAll("\\", "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function worktreeProbe(overrides: Partial<CodexGitProbe> = {}): CodexGitProbe {
  return {
    topLevel: CURRENT,
    gitDir: GIT_DIR,
    commonDir: COMMON_DIR,
    branch: "claude/codex-current",
    worktreeList: [
      `worktree ${ROOT}`,
      "HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "branch refs/heads/main",
      "",
      `worktree ${CURRENT}`,
      "HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "branch refs/heads/claude/codex-current",
      "",
      `worktree ${SIBLING}`,
      "HEAD cccccccccccccccccccccccccccccccccccccccc",
      "branch refs/heads/claude/codex-sibling",
      "",
    ].join("\n"),
    ...overrides,
  };
}

function claim(overrides: Partial<ClaimDocT> = {}): ClaimDocT {
  return {
    unitId: "codex-session-lifecycle",
    sessionId: "codex-current",
    branch: "claude/codex-current",
    intent: "implement strict Codex containment",
    grade: "work",
    role: "supplementing",
    claimedAt: "2026-08-12T05:00:00.000Z",
    heartbeatAt: "2026-08-12T05:59:00.000Z",
    ...overrides,
  };
}

function topology() {
  const result = resolveCodexSessionTopology(worktreeProbe(), {
    canonicalize: norm,
  });
  if (!result.ok) assert.fail(result.reason);
  assert.equal(result.location, "worktree");
  if (result.location !== "worktree") throw new Error("expected a linked worktree");
  return result;
}

test("Codex permission profiles require 0.138.0 or later", () => {
  assert.deepEqual(parseCodexVersion("codex-cli 0.138.0"), {
    major: 0,
    minor: 138,
    patch: 0,
    supported: true,
  });
  assert.equal(parseCodexVersion("codex 0.137.9")?.supported, false);
  assert.equal(parseCodexVersion("not a version"), null);
});

test("Git topology independently distinguishes the lobby from one registered linked worktree", () => {
  const linked = topology();
  assert.equal(linked.sessionId, "codex-current");
  assert.equal(norm(linked.currentWorktree), norm(CURRENT));
  assert.equal(norm(linked.primaryCheckout), norm(ROOT));
  assert.deepEqual(linked.siblingWorktrees.map(norm), [norm(SIBLING)]);

  const lobby = resolveCodexSessionTopology(
    worktreeProbe({ topLevel: ROOT, gitDir: COMMON_DIR, branch: "main" }),
    { canonicalize: norm },
  );
  assert.equal(lobby.ok, true);
  if (lobby.ok) assert.equal(lobby.location, "lobby");

  const unregistered = resolveCodexSessionTopology(
    worktreeProbe({ topLevel: path.join(ROOT, "copy") }),
    { canonicalize: norm },
  );
  assert.equal(unregistered.ok, false);
  if (!unregistered.ok) assert.match(unregistered.reason, /not exactly one registered worktree/i);
});

test("writer authority requires a fresh work claim for this session and current branch", () => {
  const current = topology();
  assert.equal(authorizeCodexWriter(current, [claim()], NOW).ok, true);

  for (const [name, claims, message] of [
    ["absent", [], /no live work claim/i],
    ["stale", [claim({ heartbeatAt: "2026-08-12T02:00:00.000Z" })], /no live work claim/i],
    ["exploring", [claim({ grade: "exploring" })], /no live work claim/i],
    ["wrong branch", [claim({ branch: "claude/other" })], /current branch/i],
  ] as const) {
    const result = authorizeCodexWriter(current, claims, NOW);
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.match(result.reason, message, name);
  }
});

test("managed bundle selects one exact profile, omits full access, and never mixes sandbox_mode", () => {
  const current = topology();
  const authority = authorizeCodexWriter(current, [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);

  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);

  const toml = bundle.requirementsToml;
  assert.match(toml, /default_permissions = "storytree_codex_current"/);
  assert.match(toml, /\[allowed_permission_profiles\]/);
  assert.match(toml, /storytree_codex_current = true/);
  assert.match(toml, /storytree_codex_phase_author = true/);
  assert.match(toml, /\.gate-logs\/codex-replicas/);
  assert.match(toml, /\.storytree/i);
  assert.match(toml, /gcloud/i);
  assert.doesNotMatch(toml, /danger-full-access/);
  assert.doesNotMatch(toml, /sandbox_mode|allowed_sandbox_modes/);
  assert.match(toml, /allowed_sandbox_implementations = \["elevated"\]/);
  assert.match(toml, /allow_managed_hooks_only = true/);
  assert.match(toml, /\[features\]\nhooks = true/);
  assert.match(toml, /windows_managed_dir/);
  assert.match(toml, /\[\[hooks\.SessionStart\]\]/);
  assert.match(toml, /\[\[hooks\.PreToolUse\]\]/);
  assert.match(toml, /\[\[hooks\.PermissionRequest\]\]/);
  assert.match(toml, /"\.git" = "deny"/);
  assert.match(toml, /"\.codex" = "deny"/);
  assert.match(toml, new RegExp(norm(CURRENT).split("/").at(-1) ?? "codex-current", "i"));
  assert.doesNotMatch(toml, new RegExp(norm(SIBLING).split("/").at(-1) ?? "codex-sibling", "i"));
  assert.match(bundle.operatorReadme, /generated, not installed/i);
  assert.match(bundle.operatorReadme, /SELECT-only database principal/i);
  assert.match(bundle.operatorReadme, /snapshot that selected[\s\S]*at process start/i);
  assert.match(bundle.operatorReadme, /global requirements/i);
  assert.match(bundle.operatorReadme, /live smoke/i);
  assert.match(bundle.trustedActuatorScript, /CodexSandboxUsers/);
  assert.match(bundle.trustedActuatorScript, /icacls\.exe[\s\S]*\/deny/);
  assert.match(bundle.trustedActuatorScript, /sandbox --include-managed-config -P/);
  assert.match(bundle.trustedActuatorScriptPath, /storytree-codex-trusted-actuator\.ps1$/i);
  assert.match(bundle.trustedActuatorScript, /Global\\StorytreeCodexContainmentLifecycle/);
  assert.match(bundle.trustedActuatorScript, /bootstrap --node <capability> --intent <text>/);
  assert.match(bundle.trustedActuatorScript, /Get-Item -LiteralPath \$Target -Force/);
  assert.doesNotMatch(
    bundle.trustedActuatorScript,
    /ForEach-Object \{ Canonical-Existing \$_\.Substring\(9\)\.Trim\(\) \}/,
  );
  assert.match(bundle.trustedActuatorScript, /\$ErrorActionPreference = 'Continue'/);
  assert.match(bundle.trustedActuatorScript, /launch --worktree <canonical-path>/);
  assert.match(bundle.trustedActuatorScript, /\$CodexArguments = @\('-C', \$CanonicalWorktree\)/);
  assert.match(bundle.trustedActuatorScript, /& \$CodexPayload @CodexArguments/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /--sandbox|dangerously-bypass|sandbox_mode/);
  assert.match(bundle.trustedActuatorScript, /Install-Policy \$Config\.lobbyPolicy/);

  const otherBundle = buildCodexContainmentBundle({
    authority: {
      ...authority,
      sessionId: "codex-other",
      branch: "claude/codex-other",
      currentWorktree: path.join(ROOT, ".claude", "worktrees", "codex-other"),
    },
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  });
  if (!otherBundle.ok) assert.fail(otherBundle.reason);
  assert.notEqual(bundle.policyPath, otherBundle.policyPath, "concurrent writers never alias policy receipts");
  assert.match(bundle.policyPath.replaceAll("\\", "/"), /\/sessions\/writer-[a-f0-9]{24}\.json$/);
});

test("generated live-claim probe is a self-contained fail-closed production bundle", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-claim-probe-"));
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: temp,
    managedNodePath: process.execPath,
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  writeFileSync(bundle.claimProbeScriptPath, bundle.managedClaimProbeScript);
  assert.ok(bundle.managedClaimProbeScript.length > 100_000, "production dependencies are bundled");
  assert.doesNotMatch(bundle.managedClaimProbeScript, /from\s+["']@storytree\//);
  assert.doesNotMatch(bundle.managedClaimProbeScript, /import\(["']@storytree\//);

  const invalid = spawnSync(process.execPath, [bundle.claimProbeScriptPath], {
    input: JSON.stringify({ protocolVersion: 1, readMode: "cached", sessionId: "codex-current" }),
    encoding: "utf8",
  });
  assert.equal(invalid.status, 2, invalid.stderr);
  assert.match(invalid.stderr, /failed closed/i);

  writeFileSync(bundle.worktreeCreateScriptPath, bundle.managedWorktreeCreateScript);
  assert.ok(
    bundle.managedWorktreeCreateScript.length > 100_000,
    "production worktree-creation dependencies are bundled",
  );
  assert.doesNotMatch(bundle.managedWorktreeCreateScript, /from\s+["']@storytree\//);
  const invalidCreate = spawnSync(process.execPath, [bundle.worktreeCreateScriptPath, "--node", "x"], {
    encoding: "utf8",
  });
  assert.equal(invalidCreate.status, 2, invalidCreate.stderr);
  assert.match(invalidCreate.stderr, /failed closed/i);
});

test("lobby bundle remains read-only and names only the trusted bootstrap actuator", () => {
  const lobby = resolveCodexSessionTopology(
    worktreeProbe({ topLevel: ROOT, gitDir: COMMON_DIR, branch: "main" }),
    { canonicalize: norm },
  );
  if (!lobby.ok) assert.fail(lobby.reason);
  assert.equal(lobby.location, "lobby");
  if (lobby.location !== "lobby") assert.fail("expected lobby topology");
  const bundle = buildCodexContainmentBundle({
    authority: lobby,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  assert.match(bundle.requirementsToml, /storytree_codex_lobby/);
  assert.doesNotMatch(bundle.requirementsToml, /"write"/);
  assert.match(bundle.operatorReadme, /worktree create/);
  assert.match(bundle.operatorReadme, /generic shell[\s\S]*not granted/i);
  assert.match(bundle.operatorReadme, /fail-closed[\s\S]*hash-pinned worktree-create payload/i);

  const script = path.join(mkdtempSync(path.join(os.tmpdir(), "storytree-codex-actuator-")), "actuator.ps1");
  writeFileSync(script, bundle.trustedActuatorScript);
  const invoke = (args: readonly string[]) =>
    spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
      { encoding: "utf8" },
    );

  const malformed = invoke(["bootstrap", "--node", "codex-session-lifecycle"]);
  assert.equal(malformed.status, 2, malformed.stderr);
  assert.match(malformed.stderr, /exact grammar is bootstrap/i);

  const extraLaunchFlag = invoke(["launch", "--worktree", ROOT, "--sandbox", "danger-full-access"]);
  assert.equal(extraLaunchFlag.status, 2, extraLaunchFlag.stderr);
  assert.match(extraLaunchFlag.stderr, /exact grammar is launch/i);

  const unavailableBootstrap = invoke([
    "bootstrap",
    "--node",
    "codex-session-lifecycle",
    "--intent",
    "create one claimed worktree",
  ]);
  assert.equal(unavailableBootstrap.status, 2, unavailableBootstrap.stderr);
  assert.match(unavailableBootstrap.stderr, /hash-pinned|not configured|trusted actuator refused/i);
});

test("trusted payload configuration is absolute, administrator-owned, and hash-pinned", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const base = {
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  };
  const outside = buildCodexContainmentBundle({
    ...base,
    codexPayload: { path: path.resolve("C:/code/storytree/codex.js"), sha256: "a".repeat(64) },
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.match(outside.reason, /under managedDir/i);

  const malformedHash = buildCodexContainmentBundle({
    ...base,
    codexPayload: {
      path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/codex.js"),
      sha256: "latest",
    },
  });
  assert.equal(malformedHash.ok, false);
  if (!malformedHash.ok) assert.match(malformedHash.reason, /SHA-256 pin/i);

  const bootstrapLobby = resolveCodexSessionTopology(
    worktreeProbe({ topLevel: ROOT, gitDir: COMMON_DIR, branch: "main" }),
    { canonicalize: norm },
  );
  if (!bootstrapLobby.ok || bootstrapLobby.location !== "lobby") {
    assert.fail("expected the bootstrap fixture to resolve as a lobby");
  }
  const configuredBootstrap = buildCodexContainmentBundle({
    ...base,
    authority: bootstrapLobby,
    worktreeCreatePayload: {
      path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/node.exe"),
      sha256: "b".repeat(64),
    },
  });
  if (!configuredBootstrap.ok) assert.fail(configuredBootstrap.reason);
  assert.match(configuredBootstrap.operatorReadme, /bootstrap stays[\s\S]*enabled/i);
  assert.match(configuredBootstrap.trustedActuatorScript, /Assert-PinnedCommand/);
  assert.match(configuredBootstrap.trustedActuatorScript, /--primary/);
});

test("rendered managed hook re-probes Git and live claims on every write, then maps decisions", () => {
  const current = topology();
  const authority = authorizeCodexWriter(current, [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);

  const temp = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-hook-"));
  const gitScript = path.join(temp, "fake-git.mjs");
  const claimScript = path.join(temp, "fake-claims.mjs");
  const hookScript = path.join(temp, "managed-hook.mjs");
  const policyPath = path.join(temp, "active-session.json");
  const claimCounter = path.join(temp, "claim-count.txt");
  const gitLog = path.join(temp, "git-log.txt");

  writeFileSync(
    gitScript,
    [
      'import { appendFileSync } from "node:fs";',
      'const key = process.argv.slice(2).join(" ");',
      'appendFileSync(process.env.FAKE_GIT_LOG, `${key}\\n`);',
      'const responses = JSON.parse(process.env.FAKE_GIT_RESPONSES);',
      'if (!(key in responses)) process.exit(9);',
      'process.stdout.write(responses[key]);',
    ].join("\n"),
  );
  writeFileSync(
    claimScript,
    [
      'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
      'let input = ""; for await (const chunk of process.stdin) input += chunk;',
      'const request = JSON.parse(input);',
      'if (request.readMode !== "live-claims-required") process.exit(8);',
      'const counter = process.env.FAKE_CLAIM_COUNTER;',
      'const n = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;',
      'writeFileSync(counter, String(n + 1));',
      'const sequence = JSON.parse(process.env.FAKE_CLAIM_SEQUENCE);',
      'process.stdout.write(JSON.stringify({ claims: sequence[n] ?? [] }));',
    ].join("\n"),
  );

  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: temp,
    managedNodePath: process.execPath,
    gitCommand: [process.execPath, gitScript],
    claimProbeCommand: [process.execPath, claimScript],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  assert.match(bundle.managedHookScript, /live-claims-required/);
  assert.match(bundle.managedHookScript, /permissionDecision/);
  writeFileSync(hookScript, bundle.managedHookScript);
  writeFileSync(policyPath, bundle.sessionPolicyJson);

  const responses = {
    "rev-parse --path-format=absolute --show-toplevel": CURRENT,
    "rev-parse --path-format=absolute --git-dir": GIT_DIR,
    "rev-parse --path-format=absolute --git-common-dir": COMMON_DIR,
    "rev-parse --abbrev-ref HEAD": "claude/codex-current",
    "worktree list --porcelain": worktreeProbe().worktreeList,
  };
  const event = JSON.stringify({
    hook_event_name: "PreToolUse",
    cwd: CURRENT,
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: packages/cli/src/x.ts\n*** End Patch",
    },
  });
  const env = {
    ...process.env,
    FAKE_GIT_LOG: gitLog,
    FAKE_GIT_RESPONSES: JSON.stringify(responses),
    FAKE_CLAIM_COUNTER: claimCounter,
    FAKE_CLAIM_SEQUENCE: JSON.stringify([[claim()], []]),
  };
  const first = spawnSync(process.execPath, [hookScript, "pre-tool-use", policyPath], {
    input: event,
    encoding: "utf8",
    env,
  });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, "", "allow maps to silent exit 0");

  const second = spawnSync(process.execPath, [hookScript, "pre-tool-use", policyPath], {
    input: event,
    encoding: "utf8",
    env,
  });
  assert.equal(second.status, 0, second.stderr);
  const denial = JSON.parse(second.stdout) as {
    hookSpecificOutput: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string };
  };
  assert.equal(denial.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(denial.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denial.hookSpecificOutput.permissionDecisionReason, /no live work claim/i);
  assert.equal(readFileSync(claimCounter, "utf8"), "2", "claim probe runs once per covered write");
  assert.equal(
    readFileSync(gitLog, "utf8").match(/rev-parse --abbrev-ref HEAD/g)?.length,
    2,
    "current branch is independently re-read on each write",
  );

  const widening = spawnSync(process.execPath, [hookScript, "permission-request", policyPath], {
    input: JSON.stringify({
      hook_event_name: "PermissionRequest",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "escape" },
    }),
    encoding: "utf8",
    env: { ...env, FAKE_CLAIM_SEQUENCE: JSON.stringify([[claim()], [claim()], [claim()]]) },
  });
  assert.equal(widening.status, 0, widening.stderr);
  assert.equal(
    JSON.parse(widening.stdout).hookSpecificOutput.decision.behavior,
    "deny",
    "PermissionRequest maps to Codex's deny response",
  );
});

test("rendered managed hook fail-closes when its trusted live-claim probe cannot run", () => {
  const current = topology();
  const authority = authorizeCodexWriter(current, [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const temp = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-hook-fail-"));
  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: temp,
    managedNodePath: process.execPath,
    gitCommand: [process.execPath, path.join(temp, "missing-git.mjs")],
    claimProbeCommand: [process.execPath, path.join(temp, "missing-claim-probe.mjs")],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  const hookScript = path.join(temp, "managed-hook.mjs");
  const policyPath = path.join(temp, "active-session.json");
  writeFileSync(hookScript, bundle.managedHookScript);
  writeFileSync(policyPath, bundle.sessionPolicyJson);
  const result = spawnSync(process.execPath, [hookScript, "pre-tool-use", policyPath], {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
    }),
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /failed closed/i);
});

test("interactive hook admits current targets and refuses siblings, traversal, and ambiguity", () => {
  const current = topology();
  const live = [claim()];
  const decide = (event: unknown, claims: ClaimDocT[] = live, branch = current.branch) =>
    decideInteractiveCodexToolUse({
      topology: current,
      claims,
      now: NOW,
      currentBranch: branch,
      event,
      canonicalize: norm,
    });

  const inside = decide({
    hook_event_name: "PreToolUse",
    cwd: CURRENT,
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Update File: packages/cli/src/x.ts\n*** End Patch",
    },
  });
  assert.equal(inside.allow, true);

  for (const [name, event, message] of [
    [
      "sibling",
      {
        hook_event_name: "PreToolUse",
        cwd: CURRENT,
        tool_name: "Write",
        tool_input: { file_path: path.join(SIBLING, "owned.ts") },
      },
      /outside the current claimed worktree/i,
    ],
    [
      "traversal",
      {
        hook_event_name: "PreToolUse",
        cwd: CURRENT,
        tool_name: "Edit",
        tool_input: { path: "../../lobby.ts" },
      },
      /outside the current claimed worktree/i,
    ],
    [
      "ambiguous patch",
      {
        hook_event_name: "PreToolUse",
        cwd: CURRENT,
        tool_name: "apply_patch",
        tool_input: { command: "not a Codex patch envelope" },
      },
      /ambiguous/i,
    ],
    [
      "unknown writer",
      {
        hook_event_name: "PreToolUse",
        cwd: CURRENT,
        tool_name: "filesystem_write_blob",
        tool_input: { contents: "x" },
      },
      /no extractable target/i,
    ],
  ] as const) {
    const result = decide(event);
    assert.equal(result.allow, false, name);
    if (!result.allow) assert.match(result.reason, message, name);
  }

  assert.equal(
    decide({
      hook_event_name: "PreToolUse",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
    }).allow,
    true,
    "shell is guarded by the OS profile; the hook checks its cwd and live authority",
  );

  const released = decide(
    {
      hook_event_name: "PreToolUse",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
    },
    [],
  );
  assert.equal(released.allow, false);
  if (!released.allow) assert.match(released.reason, /no live work claim/i);

  const rewound = decide(
    {
      hook_event_name: "PreToolUse",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "pnpm test" },
    },
    live,
    "claude/rewound",
  );
  assert.equal(rewound.allow, false);
  if (!rewound.allow) assert.match(rewound.reason, /branch changed/i);
});

test("PermissionRequest never widens the strict profile", () => {
  const current = topology();
  const result = decideInteractiveCodexToolUse({
    topology: current,
    claims: [claim()],
    now: NOW,
    currentBranch: current.branch,
    event: {
      hook_event_name: "PermissionRequest",
      cwd: CURRENT,
      tool_name: "Bash",
      tool_input: { command: "write outside" },
    },
    canonicalize: norm,
  });
  assert.equal(result.allow, false);
  if (!result.allow) assert.match(result.reason, /widening is unavailable/i);
});

test("dry-run command emits a bundle but the repository command never installs ProgramData", async () => {
  const writes: string[] = [];
  const io: CodexContainmentIo = {
    probeGit: () => worktreeProbe(),
    canonicalize: norm,
    codexVersion: () => "codex-cli 0.145.0",
    managedDir: () => path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: () => path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: () => [process.execPath],
    writeFile: (target) => writes.push(target),
  };
  const ledger = { claimsBySession: async () => [claim()] };

  const dry = await codexSessionContainmentCommand({ write: false }, { ledger, now: () => NOW }, io);
  assert.equal(dry.ok, true);
  assert.match(dry.body, /DRY RUN/i);
  assert.match(dry.body, /requirements\.toml/);
  assert.deepEqual(writes, []);

  const attempted = await codexSessionContainmentCommand(
    { write: true },
    { ledger, now: () => NOW },
    io,
  );
  assert.equal(attempted.ok, false);
  assert.match(attempted.body, /administrator-owned action/i);
  assert.deepEqual(writes, []);
});
