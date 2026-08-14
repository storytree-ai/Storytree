import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { ClaimDocT, ClaimResult } from "@storytree/notice-board";

import {
  authorizeCodexWriter,
  buildCodexContainmentBundle,
  candidateCorepackPnpmDistPaths,
  codexSessionContainmentCommand,
  codexToolchainCommand,
  defaultCodexContainmentIo,
  defaultCodexToolchainStagingIo,
  decideInteractiveCodexToolUse,
  parseCodexVersion,
  planCodexToolchainStaging,
  promoteBootstrapClaimsToWork,
  resolveCodexSessionTopology,
  resolvePinnedPnpmVersion,
  type BootstrapClaimLedger,
  type CodexContainmentIo,
  type CodexGitProbe,
  type CodexToolchainStagingIo,
} from "./codex-session-containment.js";

const NOW = new Date("2026-08-12T06:00:00.000Z");
const ROOT = path.resolve("C:/code/storytree");
const CURRENT = path.join(ROOT, ".claude", "worktrees", "codex-current");
const SIBLING = path.join(ROOT, ".claude", "worktrees", "codex-sibling");
const GIT_DIR = path.join(ROOT, ".git", "worktrees", "codex-current");
const COMMON_DIR = path.join(ROOT, ".git");

/**
 * Read from the workspace's own `packageManager` via the production helper rather than written down
 * here — a literal would be a second source of truth that could drift from the repository silently.
 */
const PINNED_PNPM_VERSION = (() => {
  const version = resolvePinnedPnpmVersion(readFileSync(path.resolve("../../package.json"), "utf8"));
  if (typeof version !== "string") throw new Error(`root packageManager is not a pinned pnpm: ${version.reason}`);
  return version;
})();

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

function promotingLedger(
  answer: (unitId: string) => ClaimResult | Promise<ClaimResult>,
): { ledger: BootstrapClaimLedger; calls: Array<{ unitId: string; sessionId: string; branch: string }> } {
  const calls: Array<{ unitId: string; sessionId: string; branch: string }> = [];
  return {
    calls,
    ledger: {
      async upgrade(unitId, sessionId, opts) {
        calls.push({ unitId, sessionId, branch: opts.branch });
        return await answer(unitId);
      },
    },
  };
}

test("the lobby bootstrap promotes its exploring claims to the work grade the writer needs", async () => {
  const { ledger, calls } = promotingLedger((unitId) => ({
    acquired: true,
    reclaimed: false,
    claim: claim({ unitId, grade: "work" }),
  }));

  const result = await promoteBootstrapClaimsToWork({
    ledger,
    nodes: ["codex-session-lifecycle"],
    sessionId: "codex-current",
    branch: "claude/codex-current",
    intent: "close the containment gap",
  });

  assert.deepEqual(result, { ok: true, promoted: ["codex-session-lifecycle"] });
  assert.deepEqual(calls, [
    {
      unitId: "codex-session-lifecycle",
      sessionId: "codex-current",
      branch: "claude/codex-current",
    },
  ]);

  // The whole point: what the ceremony leaves must now satisfy the writer gate for the same
  // identity. An exploring claim does not, which is the defect this closes.
  const promoted = claim({ grade: "work" });
  assert.equal(authorizeCodexWriter(topology(), [promoted], NOW).ok, true);
  assert.equal(authorizeCodexWriter(topology(), [claim({ grade: "exploring" })], NOW).ok, false);
});

test("bootstrap promotion fails closed on a refusal, a wrong grade, or a mismatched identity", async () => {
  const held = claim({ sessionId: "codex-sibling", branch: "claude/codex-sibling" });
  const cases: Array<[string, ClaimResult | "throw", RegExp]> = [
    ["queued behind a holder", { acquired: false, heldBy: held }, /REFUSED — held by codex-sibling/],
    [
      "grade did not land on work",
      { acquired: true, reclaimed: false, claim: claim({ grade: "exploring" }) },
      /returned grade exploring, not work/,
    ],
    [
      "claim stamped to another branch",
      { acquired: true, reclaimed: false, claim: claim({ branch: "claude/other" }) },
      /not the minted codex-current\/claude\/codex-current/,
    ],
    ["the ledger threw", "throw", /FAILED: ledger unreachable/],
  ];

  for (const [name, answer, message] of cases) {
    const { ledger } = promotingLedger(() => {
      if (answer === "throw") throw new Error("ledger unreachable");
      return answer;
    });
    const result = await promoteBootstrapClaimsToWork({
      ledger,
      nodes: ["codex-session-lifecycle"],
      sessionId: "codex-current",
      branch: "claude/codex-current",
      intent: "close the containment gap",
    });
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.match(result.reason, message, name);
  }

  // A partial promotion is a refusal that NAMES what already landed — a caller reading it as
  // success would launch a writer the per-write hook must then refuse.
  const { ledger: partial } = promotingLedger((unitId) =>
    unitId === "first"
      ? { acquired: true, reclaimed: false, claim: claim({ unitId }) }
      : { acquired: false, heldBy: held },
  );
  const mixed = await promoteBootstrapClaimsToWork({
    ledger: partial,
    nodes: ["first", "second"],
    sessionId: "codex-current",
    branch: "claude/codex-current",
    intent: "close the containment gap",
  });
  assert.equal(mixed.ok, false);
  if (!mixed.ok) assert.match(mixed.reason, /already promoted: first/);

  const empty = await promoteBootstrapClaimsToWork({
    ledger: promotingLedger(() => assert.fail("must not reach the ledger")).ledger,
    nodes: [],
    sessionId: "codex-current",
    branch: "claude/codex-current",
    intent: "close the containment gap",
  });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /claimed nothing/);
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

  // ADR-0364 D1 INVERTS what this file may name. Under ADR-0355 the profile named exactly one
  // worktree and the sibling's absence WAS the fence; the standing grant covers the whole worktrees
  // area, so the sibling is named and permitted here on purpose. That is the accepted cost, and the
  // isolation it used to carry is now carried by the hook — asserted below in its own test.
  assert.match(toml, new RegExp(norm(CURRENT).split("/").at(-1) ?? "codex-current", "i"));
  assert.match(
    toml,
    new RegExp(norm(SIBLING).split("/").at(-1) ?? "codex-sibling", "i"),
    "the standing grant deliberately covers registered siblings; the hook is what refuses them",
  );
  assert.match(bundle.operatorReadme, /generated, not installed/i);
  assert.match(bundle.operatorReadme, /SELECT-only database principal/i);
  assert.match(bundle.operatorReadme, /only fence/i);
  assert.match(bundle.operatorReadme, /blast radius is every\nworktree/i);
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
  assert.doesNotMatch(bundle.trustedActuatorScript, /--sandbox|dangerously-bypass|sandbox_mode/);

  // ADR-0364 D4: the actuator installs and exits. No `launch` verb, no nested Codex child, and no
  // revert — the three things that together made write authority a process lifetime.
  assert.match(bundle.trustedActuatorScript, /exact grammar is install, with no arguments/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /launch --worktree/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /\$CodexArguments/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /Install-Policy \$Config\.lobbyPolicy/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /restoreActuatorScript/);
  assert.match(bundle.trustedActuatorScript, /Install-Policy \$Config\.standingPolicy/);

  // One standing policy, so two sessions resolve the SAME receipt. The old assertion was the exact
  // opposite ("concurrent writers never alias policy receipts") because a per-session path existed
  // only so the actuator could swap files around a launcher. There is no launcher to swap around.
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
  assert.equal(bundle.policyPath, otherBundle.policyPath, "one standing policy serves every session");
  assert.equal(bundle.requirementsToml, otherBundle.requirementsToml, "and so does one requirements file");
  assert.match(bundle.policyPath.replaceAll("\\", "/"), /\/sessions\/standing-[a-f0-9]{24}\.json$/);

  // The policy may not carry the narrowing back in through the side door.
  const receipt = JSON.parse(bundle.sessionPolicyJson) as Record<string, unknown>;
  assert.equal(receipt["mode"], "standing");
  assert.equal(norm(String(receipt["worktreesRoot"])), norm(path.join(ROOT, ".claude", "worktrees")));
  for (const forbidden of ["currentWorktree", "sessionId", "branch", "launchClaimIds"]) {
    assert.equal(receipt[forbidden], undefined, `standing policy must not pin ${forbidden}`);
  }
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

  // ADR-0364 D3 restated as the invariant it actually is. The old assertion was `doesNotMatch(/"write"/)`
  // on a lobby-only file, which a single standing requirements file can no longer satisfy — one file
  // now declares the worktrees grant regardless of where it was generated. The property that MATTERS
  // is unchanged and is stronger stated this way: no write grant reaches outside the worktrees area,
  // so the lobby's own files stay read-only.
  const worktreesRoot = norm(path.join(ROOT, ".claude", "worktrees"));
  let grantedSection: string | null = null;
  for (const line of bundle.requirementsToml.split("\n")) {
    const section = /^\[permissions\.[^.]+\.filesystem\.(".*")\]$/.exec(line.trim());
    if (section?.[1]) grantedSection = norm(JSON.parse(section[1]) as string);
    else if (/^"\." = "write"$/.test(line.trim())) {
      assert.ok(
        grantedSection !== null &&
          (grantedSection === worktreesRoot || grantedSection.startsWith(`${worktreesRoot}/`)),
        `write grant escapes the worktrees area: ${grantedSection}`,
      );
    }
  }
  assert.match(bundle.operatorReadme, /worktree create|mints one claimed worktree/i);
  assert.match(bundle.operatorReadme, /lobby stays read-only/i);
  assert.match(bundle.operatorReadme, /fail-closed until device management configures a hash-pinned/i);

  // The remaining assertions execute the generated Windows actuator itself. Its portable
  // contract is covered above; Linux CI has no powershell.exe process to exercise.
  if (process.platform !== "win32") return;

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

  const retiredLaunch = invoke(["launch", "--worktree", ROOT]);
  assert.equal(retiredLaunch.status, 2, retiredLaunch.stderr);
  assert.match(retiredLaunch.stderr, /unknown subcommand 'launch'/i, "ADR-0364 D4 retires the launch verb");

  const extraInstallFlag = invoke(["install", "--sandbox", "danger-full-access"]);
  assert.equal(extraInstallFlag.status, 2, extraInstallFlag.stderr);
  assert.match(extraInstallFlag.stderr, /exact grammar is install/i);

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

test("the work grade is required where the fence now lives, and scratch survives the launcher", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);

  // ADR-0355 D2 requires the live-claim check to fail CLOSED. A gradeless claim used to satisfy it,
  // which admitted exactly the exploring row the bootstrap leaves behind. The actuator's copy of that
  // check went with its launcher (ADR-0364 D4), so the assertion moves to the hook — which is the
  // only place it now runs, and where the JS side still carried the fail-open the PowerShell had closed.
  assert.match(bundle.managedHookScript, /claim\.grade === "work"/);
  assert.doesNotMatch(bundle.managedHookScript, /claim\.grade === undefined/);
  assert.doesNotMatch(bundle.trustedActuatorScript, /Assert-LiveClaim/);

  // The profile grants write only under the worktrees area, so scratch has to live inside a worktree
  // or the toolchain cannot start inside its own grant. With no launcher to set TEMP for a child,
  // bootstrap creates the directory and the task points TEMP/TMP at it (recorded in the readme).
  assert.match(bundle.trustedActuatorScript, /New-WorktreeScratch \$Created\.topLevel/);
  assert.match(bundle.trustedActuatorScript, /'\.storytree-scratch'/);
  assert.match(bundle.operatorReadme, /point TEMP and TMP at <its worktree>\/\.storytree-scratch/);

  // The credential is auth.json, not the whole tree — denying the tree hid the skills the same
  // directory advertises. Both halves now name the same file.
  //
  // Asserted structurally rather than against a literal path: the TOML embeds `JSON.stringify` of a
  // real absolute path, so the separator is the HOST's (`\\` on Windows, `/` on the Linux runner).
  // Every `.codex` filesystem SECTION must name auth.json; the writer profile's in-worktree
  // `".codex" = "deny"` is a key, not a section, so it is deliberately not caught here.
  const codexDenySections = bundle.requirementsToml
    .split("\n")
    .filter((line) => line.startsWith("[permissions.") && line.includes(".codex"));
  assert.ok(codexDenySections.length > 0, "expected at least one .codex deny section");
  for (const section of codexDenySections) {
    assert.match(section, /auth\.json"\]$/, `must deny the credential, not the tree: ${section}`);
  }
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
  assert.match(configuredBootstrap.operatorReadme, /bootstrap\s+— mints one claimed worktree[\s\S]*Enabled by the configured hash-pinned/i);
  assert.match(configuredBootstrap.trustedActuatorScript, /Assert-PinnedCommand/);
  assert.match(configuredBootstrap.trustedActuatorScript, /--primary/);
});

/**
 * ADR-0364 D7's precondition: a contained task must be able to run the repository toolchain at all.
 * `%ProgramData%` ships managed Node and the Codex payload and nothing else, so `pnpm gate` and
 * `pnpm storytree …` are unreachable from a claimed worktree — the profile denies neither, they simply
 * do not exist there.
 */
test("the task toolchain is one hash-pinned file, reported honestly when absent", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const base = {
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  };

  // The actuator TEMPLATE always carries the pin-checking code, so asserting on its text would prove
  // nothing about configuration — the embedded config is what varies, so that is what is read.
  const actuatorConfig = (script: string): Record<string, unknown> => {
    const encoded = /FromBase64String\("([A-Za-z0-9+/=]+)"\)/.exec(script);
    if (!encoded?.[1]) assert.fail("actuator script carries no embedded config");
    return JSON.parse(Buffer.from(encoded[1], "base64").toString("utf8")) as Record<string, unknown>;
  };

  // Absent: reported as null and named in both operator surfaces. A task left to GUESS its toolchain
  // is the failure mode this replaces, so silence is not an acceptable rendering of "not configured".
  const unconfigured = buildCodexContainmentBundle(base);
  if (!unconfigured.ok) assert.fail(unconfigured.reason);
  assert.equal(unconfigured.toolchainCommand, null);
  assert.match(unconfigured.operatorReadme, /NOT CONFIGURED — a contained task cannot run any pnpm/);
  assert.equal(actuatorConfig(unconfigured.trustedActuatorScript)["toolchainPayload"], null);

  // Held to the SAME administrator-owned, hash-pinned bar as every other payload.
  const outside = buildCodexContainmentBundle({
    ...base,
    toolchainPayload: { path: path.resolve("C:/code/storytree/pnpm.cjs"), sha256: "a".repeat(64) },
  });
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.match(outside.reason, /under managedDir/i);

  const unpinned = buildCodexContainmentBundle({
    ...base,
    toolchainPayload: {
      path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"),
      sha256: "9.15.0",
    },
  });
  assert.equal(unpinned.ok, false);
  if (!unpinned.ok) assert.match(unpinned.reason, /SHA-256 pin/i);

  const configured = buildCodexContainmentBundle({
    ...base,
    toolchainPayload: {
      path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"),
      sha256: "c".repeat(64),
    },
  });
  if (!configured.ok) assert.fail(configured.reason);
  assert.deepEqual(configured.toolchainCommand, [
    base.managedNodePath,
    path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"),
  ]);
  assert.deepEqual(actuatorConfig(configured.trustedActuatorScript)["toolchainPayload"], {
    path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"),
    sha256: "c".repeat(64),
  });
  // Verified before any work, so a bad hash costs no mint, and carried in the ONE envelope the
  // lifecycle already hands back — with no launcher there is no environment for a task to inherit.
  assert.match(
    configured.trustedActuatorScript,
    /Assert-PinnedPayload 'toolchain payload'[\s\S]*Invoke-Exact \$Payload/,
    "the pin is checked BEFORE the mint, so a bad hash costs no worktree",
  );
  assert.match(configured.trustedActuatorScript, /toolchainCommand = \$Toolchain/);
  assert.match(configured.trustedActuatorScript, /scratch = \$Scratch/);

  // Corepack is deliberately not the mechanism: it would need the network this profile disables and a
  // cache outside the grant. If this ever regresses to a Corepack shim it must be a decision, not a drift.
  assert.doesNotMatch(configured.operatorReadme, /ships? Corepack\b(?!.*downloader)/);
  assert.match(configured.operatorReadme, /NOT COREPACK/);
  assert.match(configured.requirementsToml, /\[permissions\.storytree_codex_current\.network\]\nenabled = false/);
});

/**
 * The claim above — that ONE pinned file plus managed Node runs a real workspace command with no
 * Corepack, no network and no PATH entry — is the whole basis for the payload's shape, so it is
 * measured rather than asserted. Skipped unless the host actually has both, because a fabricated
 * stand-in would prove nothing about the real toolchain.
 */
test("the pinned single-file pnpm really does run a workspace command under managed Node", (t) => {
  const managedNode = path.join(
    process.env["ProgramData"] ?? "C:\\ProgramData",
    "OpenAI", "Codex", "Storytree", "payloads", "node.exe",
  );
  const pnpmDist = path.join(
    process.env["LOCALAPPDATA"] ?? "",
    "node", "corepack", "v1", "pnpm", PINNED_PNPM_VERSION, "dist", "pnpm.cjs",
  );
  if (process.platform !== "win32" || !existsSync(managedNode) || !existsSync(pnpmDist)) {
    t.skip(`needs the managed payload Node and a resolved pnpm ${PINNED_PNPM_VERSION} on this host`);
    return;
  }

  const command = codexToolchainCommand(managedNode, pnpmDist);
  assert.deepEqual(command, [managedNode, pnpmDist]);

  const version = spawnSync(command[0] as string, [...command.slice(1), "--version"], {
    encoding: "utf8",
    // No PATH at all: the point is that this command needs none.
    env: { ...process.env, PATH: "", Path: "" },
  });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(
    version.stdout.trim(),
    PINNED_PNPM_VERSION,
    "the pinned toolchain must be the version packageManager names, or it disagrees with the lockfile",
  );
});

test("resolvePinnedPnpmVersion reads the exact pnpm the workspace pins, or fails closed", () => {
  assert.equal(resolvePinnedPnpmVersion(JSON.stringify({ packageManager: "pnpm@9.15.0" })), "9.15.0");

  const missing = resolvePinnedPnpmVersion(JSON.stringify({}));
  assert.equal(typeof missing, "object");
  if (typeof missing !== "string") assert.match(missing.reason, /not a pinned pnpm version/);

  const wrongManager = resolvePinnedPnpmVersion(JSON.stringify({ packageManager: "yarn@4.0.0" }));
  if (typeof wrongManager !== "string") assert.match(wrongManager.reason, /not a pinned pnpm version/);

  const range = resolvePinnedPnpmVersion(JSON.stringify({ packageManager: "pnpm@^9.15.0" }));
  if (typeof range !== "string") assert.match(range.reason, /not a pinned pnpm version/);

  const malformedJson = resolvePinnedPnpmVersion("{not json");
  if (typeof malformedJson !== "string") assert.match(malformedJson.reason, /not valid JSON/);
});

test("candidateCorepackPnpmDistPaths checks the exact Corepack cache layout per platform", () => {
  const win = candidateCorepackPnpmDistPaths({ LOCALAPPDATA: "C:\\Users\\op\\AppData\\Local" }, "win32", "9.15.0");
  assert.deepEqual(win, [
    path.join("C:\\Users\\op\\AppData\\Local", "node", "corepack", "v1", "pnpm", "9.15.0", "dist", "pnpm.cjs"),
  ]);

  const mac = candidateCorepackPnpmDistPaths({ HOME: "/Users/op" }, "darwin", "9.15.0");
  assert.deepEqual(mac, [
    path.join("/Users/op", "Library", "Caches", "node", "corepack", "v1", "pnpm", "9.15.0", "dist", "pnpm.cjs"),
  ]);

  const linux = candidateCorepackPnpmDistPaths(
    { XDG_CACHE_HOME: "/home/op/.cache" },
    "linux",
    "9.15.0",
  );
  assert.deepEqual(linux, [
    path.join("/home/op/.cache", "node", "corepack", "v1", "pnpm", "9.15.0", "dist", "pnpm.cjs"),
  ]);

  // No XDG_CACHE_HOME set: falls back to ~/.cache, never silently to nothing.
  const linuxFallback = candidateCorepackPnpmDistPaths({ HOME: "/home/op" }, "linux", "9.15.0");
  assert.deepEqual(linuxFallback, [
    path.join("/home/op", ".cache", "node", "corepack", "v1", "pnpm", "9.15.0", "dist", "pnpm.cjs"),
  ]);
});

function stagingIo(overrides: Partial<CodexToolchainStagingIo> = {}): CodexToolchainStagingIo {
  return {
    readWorkspacePackageJson: () => JSON.stringify({ packageManager: "pnpm@9.15.0" }),
    exists: () => false,
    sha256File: () => "f".repeat(64),
    env: { LOCALAPPDATA: "C:\\Users\\op\\AppData\\Local" },
    platform: "win32",
    managedDir: () => path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    ...overrides,
  };
}

test("planCodexToolchainStaging locates, hashes, and emits the exact operator steps", () => {
  const source = path.join(
    "C:\\Users\\op\\AppData\\Local",
    "node", "corepack", "v1", "pnpm", "9.15.0", "dist", "pnpm.cjs",
  );
  const plan = planCodexToolchainStaging(
    stagingIo({ exists: (target) => target === source, sha256File: () => "A".repeat(64) }),
  );
  if (!plan.ok) assert.fail(plan.reason);
  assert.equal(plan.pnpmVersion, "9.15.0");
  assert.equal(plan.sourcePath, source);
  // Hash is normalised to lowercase — the same casing `managedPayload()` requires elsewhere.
  assert.equal(plan.sha256, "a".repeat(64));
  assert.equal(plan.stagedPath, path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"));
  assert.deepEqual(plan.pin, { path: plan.stagedPath, sha256: "a".repeat(64) });
  assert.ok(plan.steps.some((line) => line.includes("Copy-Item")));
  assert.ok(plan.steps.some((line) => line.includes(JSON.stringify(plan.pin))));
  assert.ok(plan.steps.some((line) => line.includes("CertUtil") && line.includes(plan.stagedPath)));
});

test("planCodexToolchainStaging fails closed on an unpinned version rather than guessing", () => {
  const plan = planCodexToolchainStaging(
    stagingIo({ readWorkspacePackageJson: () => JSON.stringify({ packageManager: "pnpm@catalog:" }) }),
  );
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.reason, /not a pinned pnpm version/);
});

test("planCodexToolchainStaging fails closed and names every checked path when nothing is cached", () => {
  const plan = planCodexToolchainStaging(stagingIo({ exists: () => false }));
  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.match(plan.reason, /could not find a cached pnpm@9\.15\.0 distribution/);
    assert.match(plan.reason, /dist[/\\]pnpm\.cjs/);
  }
});

test("planCodexToolchainStaging fails closed on a malformed computed digest rather than mis-hashing", () => {
  const plan = planCodexToolchainStaging(stagingIo({ exists: () => true, sha256File: () => "not-a-hash" }));
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.reason, /not a well-formed SHA-256 hash/);
});

test("planCodexToolchainStaging never throws — an IO exception is reported, not propagated", () => {
  const plan = planCodexToolchainStaging(
    stagingIo({
      readWorkspacePackageJson: () => {
        throw new Error("no such file");
      },
    }),
  );
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.reason, /could not plan toolchain staging/);
});

/**
 * The default IO against the REAL workspace: proof that `defaultCodexToolchainStagingIo` actually
 * finds and hashes what's on disk, not just that the pure planner behaves on fakes. Skipped off
 * Windows or when this host has never resolved the pinned pnpm through Corepack — a fabricated
 * stand-in would prove nothing about the real toolchain, same rationale as the test above it.
 */
test("the default toolchain staging IO finds and hashes the real cached pnpm on this host", (t) => {
  const expected = path.join(
    process.env["LOCALAPPDATA"] ?? "",
    "node", "corepack", "v1", "pnpm", PINNED_PNPM_VERSION, "dist", "pnpm.cjs",
  );
  if (process.platform !== "win32" || !existsSync(expected)) {
    t.skip(`needs a resolved pnpm ${PINNED_PNPM_VERSION} in the Corepack cache on this host`);
    return;
  }
  const plan = planCodexToolchainStaging(defaultCodexToolchainStagingIo);
  if (!plan.ok) assert.fail(plan.reason);
  assert.equal(plan.pnpmVersion, PINNED_PNPM_VERSION);
  assert.equal(path.resolve(plan.sourcePath), path.resolve(expected));
  assert.match(plan.sha256, /^[a-f0-9]{64}$/);
});

test("operatorReadme is sharpened by a staging plan only while toolchainPayload is unconfigured", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const base = {
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  };
  const plan = planCodexToolchainStaging(
    stagingIo({
      exists: () => true,
      sha256File: () => "b".repeat(64),
    }),
  );
  if (!plan.ok) assert.fail(plan.reason);

  const unconfigured = buildCodexContainmentBundle({ ...base, toolchainStaging: plan });
  if (!unconfigured.ok) assert.fail(unconfigured.reason);
  assert.match(unconfigured.operatorReadme, /STAGING \(computed on this machine, nothing written\)/);
  assert.match(unconfigured.operatorReadme, /pnpm@9\.15\.0 found at/);
  assert.ok(unconfigured.operatorReadme.includes(JSON.stringify(plan.pin)));

  // A failed plan is reported honestly too — never silently dropped.
  const failedPlan = planCodexToolchainStaging(stagingIo({ exists: () => false }));
  const stillUnconfigured = buildCodexContainmentBundle({ ...base, toolchainStaging: failedPlan });
  if (!stillUnconfigured.ok) assert.fail(stillUnconfigured.reason);
  assert.match(stillUnconfigured.operatorReadme, /STAGING \(computed on this machine\): could not find/);

  // Once an operator has actually configured toolchainPayload, the staging hint is moot — the
  // configured branch renders, never a redundant staging block.
  const configured = buildCodexContainmentBundle({
    ...base,
    toolchainPayload: {
      path: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree/payloads/pnpm.cjs"),
      sha256: "c".repeat(64),
    },
    toolchainStaging: plan,
  });
  if (!configured.ok) assert.fail(configured.reason);
  assert.doesNotMatch(configured.operatorReadme, /STAGING \(computed/);
});

test("the dry-run command wires a staging plan through to the printed bundle when the IO supplies one", async () => {
  const plan = planCodexToolchainStaging(
    stagingIo({ exists: () => true, sha256File: () => "d".repeat(64) }),
  );
  if (!plan.ok) assert.fail(plan.reason);
  const io: CodexContainmentIo = {
    probeGit: () => worktreeProbe(),
    canonicalize: norm,
    codexVersion: () => "codex-cli 0.145.0",
    managedDir: () => path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: () => path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: () => [process.execPath],
    writeFile: () => assert.fail("must never write"),
    toolchainStaging: () => plan,
  };
  const ledger = { claimsBySession: async () => [claim()] };

  const dry = await codexSessionContainmentCommand({ write: false }, { ledger, now: () => NOW }, io);
  assert.equal(dry.ok, true);
  assert.match(dry.body, /toolchain staging:\s+pnpm@9\.15\.0 located at/);
  assert.match(dry.body, /STAGING \(computed on this machine, nothing written\)/);

  // A throwing staging seam degrades to the generic prose rather than failing the whole dry run.
  const throwing: CodexContainmentIo = {
    ...io,
    toolchainStaging: () => {
      throw new Error("boom");
    },
  };
  const survived = await codexSessionContainmentCommand({ write: false }, { ledger, now: () => NOW }, throwing);
  assert.equal(survived.ok, true);
  assert.doesNotMatch(survived.body, /boom/);
  assert.match(survived.body, /NOT CONFIGURED — a contained task cannot run any pnpm/);
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

/**
 * ADR-0364's whole decision in one assertion.
 *
 * The profile no longer names one worktree, so the sibling refusal it used to carry has nowhere to
 * live except here. This drives the RENDERED hook — the artifact that actually runs — rather than the
 * pure twin, because the defect being guarded against is specifically a hook that narrows on a path
 * baked into the policy file at install time. Such a hook passes every test written against the twin
 * and silently widens the fence to every worktree in production.
 *
 * Both directions are exercised, because they fail differently: reaching ACROSS into a sibling is a
 * target check, while WALKING INTO one is an identity check. A hook could get either right alone.
 */
test("a session claiming one worktree is refused in a sibling the profile itself permits", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);

  const temp = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-sibling-"));
  const gitScript = path.join(temp, "fake-git.mjs");
  const claimScript = path.join(temp, "fake-claims.mjs");
  const hookScript = path.join(temp, "managed-hook.mjs");
  const policyPath = path.join(temp, "standing.json");

  writeFileSync(
    gitScript,
    [
      'const key = process.argv.slice(2).join(" ");',
      "const responses = JSON.parse(process.env.FAKE_GIT_RESPONSES);",
      "if (!(key in responses)) process.exit(9);",
      "process.stdout.write(responses[key]);",
    ].join("\n"),
  );
  // The ledger answers with the session's REAL live claim every time. Handing the hook a genuine
  // work claim and watching it refuse anyway is the point: nothing weaker than the claim-to-worktree
  // binding can be what produces the refusal.
  writeFileSync(
    claimScript,
    [
      'let input = ""; for await (const chunk of process.stdin) input += chunk;',
      'if (JSON.parse(input).readMode !== "live-claims-required") process.exit(8);',
      "process.stdout.write(JSON.stringify({ claims: JSON.parse(process.env.FAKE_CLAIMS) }));",
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
  writeFileSync(hookScript, bundle.managedHookScript);
  writeFileSync(policyPath, bundle.sessionPolicyJson);

  // Precondition, asserted rather than assumed: the OS profile permits BOTH worktrees. If this ever
  // stops being true the test below still passes while proving nothing about the hook.
  const grantedRoot = norm(path.join(ROOT, ".claude", "worktrees"));
  assert.ok(
    bundle.requirementsToml
      .split("\n")
      .some((line) => line.startsWith("[permissions.") && norm(line).includes(grantedRoot)),
    "the standing profile must grant the area containing both worktrees",
  );

  const gitFor = (topLevel: string, gitDir: string, branch: string) =>
    JSON.stringify({
      "rev-parse --path-format=absolute --show-toplevel": topLevel,
      "rev-parse --path-format=absolute --git-dir": gitDir,
      "rev-parse --path-format=absolute --git-common-dir": COMMON_DIR,
      "rev-parse --abbrev-ref HEAD": branch,
      "worktree list --porcelain": worktreeProbe().worktreeList,
    });

  const run = (gitResponses: string, event: unknown) =>
    spawnSync(process.execPath, [hookScript, "pre-tool-use", policyPath], {
      input: JSON.stringify(event),
      encoding: "utf8",
      env: {
        ...process.env,
        FAKE_GIT_RESPONSES: gitResponses,
        FAKE_CLAIMS: JSON.stringify([claim()]),
      },
    });

  const inCurrent = gitFor(CURRENT, GIT_DIR, "claude/codex-current");
  const inSibling = gitFor(
    SIBLING,
    path.join(ROOT, ".git", "worktrees", "codex-sibling"),
    "claude/codex-sibling",
  );

  // Control: the claimed worktree is admitted, so a refusal below is the fence and not a broken harness.
  const admitted = run(inCurrent, {
    hook_event_name: "PreToolUse",
    cwd: CURRENT,
    tool_name: "Write",
    tool_input: { file_path: path.join(CURRENT, "packages", "cli", "src", "x.ts") },
  });
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.equal(admitted.stdout, "", "the claimed worktree is still admitted");

  // (a) Reaching ACROSS: standing in A, writing into B.
  const across = run(inCurrent, {
    hook_event_name: "PreToolUse",
    cwd: CURRENT,
    tool_name: "Write",
    tool_input: { file_path: path.join(SIBLING, "owned-by-someone-else.ts") },
  });
  assert.equal(across.status, 0, across.stderr);
  assert.match(
    JSON.parse(across.stdout).hookSpecificOutput.permissionDecisionReason,
    /outside the current claimed worktree/i,
    "a cross-worktree target is refused even though the profile permits it",
  );

  // (b) WALKING IN: the same live claim, but the process is now standing in B. Git derives B's
  // identity, which the claim does not name, so the claim stops admitting anything here.
  const walkedIn = run(inSibling, {
    hook_event_name: "PreToolUse",
    cwd: SIBLING,
    tool_name: "Write",
    tool_input: { file_path: path.join(SIBLING, "owned-by-someone-else.ts") },
  });
  assert.equal(walkedIn.status, 0, walkedIn.stderr);
  assert.match(
    JSON.parse(walkedIn.stdout).hookSpecificOutput.permissionDecisionReason,
    /no live work claim/i,
    "walking into a sibling does not carry the claim with it",
  );

  // And shell, which the hook admits on cwd alone, must not become the way around either direction.
  const shellInSibling = run(inSibling, {
    hook_event_name: "PreToolUse",
    cwd: SIBLING,
    tool_name: "Bash",
    tool_input: { command: "echo compromised > owned.ts" },
  });
  assert.equal(shellInSibling.status, 0, shellInSibling.stderr);
  assert.match(
    JSON.parse(shellInSibling.stdout).hookSpecificOutput.permissionDecisionReason,
    /no live work claim/i,
  );
});

/**
 * The standing policy no longer carries a `mode`, so the hook reads WHICH decision applies from the
 * topology it observes (ADR-0364 D1/D3). That swap is easy to get subtly wrong in the safe-looking
 * direction — one file now serves the lobby too, and a lobby process must still be refused writes
 * without ever needing a claim to be refused them.
 */
test("the standing policy still refuses the lobby, and asks no ledger to do it", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);

  const temp = mkdtempSync(path.join(os.tmpdir(), "storytree-codex-lobby-hook-"));
  const gitScript = path.join(temp, "fake-git.mjs");
  const claimScript = path.join(temp, "exploding-claims.mjs");
  const hookScript = path.join(temp, "managed-hook.mjs");
  const policyPath = path.join(temp, "standing.json");

  writeFileSync(
    gitScript,
    [
      'const key = process.argv.slice(2).join(" ");',
      "const responses = JSON.parse(process.env.FAKE_GIT_RESPONSES);",
      "if (!(key in responses)) process.exit(9);",
      "process.stdout.write(responses[key]);",
    ].join("\n"),
  );
  // A probe that CANNOT succeed. In the lobby the hook must never reach it; if it does, this test
  // fails closed and says so, rather than passing on a refusal that came from the wrong reason.
  writeFileSync(claimScript, 'process.stderr.write("the lobby must not consult the ledger"); process.exit(7);');

  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: temp,
    managedNodePath: process.execPath,
    gitCommand: [process.execPath, gitScript],
    claimProbeCommand: [process.execPath, claimScript],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  writeFileSync(hookScript, bundle.managedHookScript);
  writeFileSync(policyPath, bundle.sessionPolicyJson);

  const env = {
    ...process.env,
    FAKE_GIT_RESPONSES: JSON.stringify({
      "rev-parse --path-format=absolute --show-toplevel": ROOT,
      "rev-parse --path-format=absolute --git-dir": COMMON_DIR,
      "rev-parse --path-format=absolute --git-common-dir": COMMON_DIR,
      "rev-parse --abbrev-ref HEAD": "main",
      "worktree list --porcelain": worktreeProbe().worktreeList,
    }),
  };
  const run = (event: unknown) =>
    spawnSync(process.execPath, [hookScript, "pre-tool-use", policyPath], {
      input: JSON.stringify(event),
      encoding: "utf8",
      env,
    });

  const write = run({
    hook_event_name: "PreToolUse",
    cwd: ROOT,
    tool_name: "Write",
    tool_input: { file_path: path.join(ROOT, "packages", "cli", "src", "x.ts") },
  });
  assert.equal(write.status, 0, write.stderr);
  assert.match(
    JSON.parse(write.stdout).hookSpecificOutput.permissionDecisionReason,
    /lobby is read-only/i,
  );
  assert.doesNotMatch(write.stderr, /must not consult the ledger/);

  const read = run({
    hook_event_name: "PreToolUse",
    cwd: ROOT,
    tool_name: "Read",
    tool_input: { file_path: path.join(ROOT, "CLAUDE.md") },
  });
  assert.equal(read.status, 0, read.stderr);
  assert.equal(read.stdout, "", "reading the lobby stays allowed");
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

test("--toolchain-payload mints the pin FROM THE FILE, so no digest is transcribed by hand", async () => {
  const managed = path.resolve("C:/ProgramData/OpenAI/Codex/Storytree");
  const staged = path.join(managed, "payloads", "pnpm.cjs");
  const hashed: string[] = [];
  const io: CodexContainmentIo = {
    probeGit: () => worktreeProbe(),
    canonicalize: norm,
    codexVersion: () => "codex-cli 0.145.0",
    managedDir: () => managed,
    managedNodePath: () => path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: () => [process.execPath],
    writeFile: () => {
      throw new Error("never");
    },
    sha256File: (target) => {
      hashed.push(target);
      return "a".repeat(64);
    },
  };
  const ledger = { claimsBySession: async () => [claim()] };

  const pinned = await codexSessionContainmentCommand(
    { toolchainPayload: staged },
    { ledger, now: () => NOW },
    io,
  );
  assert.equal(pinned.ok, true);
  assert.deepEqual(hashed, [staged], "the pin is hashed from the staged file itself");

  // A path that cannot be hashed REFUSES rather than quietly emitting a bundle with no toolchain —
  // a caller who passed the flag is asking for a bundle that carries one, and "success" without it
  // reads as done while a contained task still cannot run a single workspace command.
  const broken = await codexSessionContainmentCommand(
    { toolchainPayload: path.join(managed, "payloads", "absent.cjs") },
    { ledger, now: () => NOW },
    {
      ...io,
      sha256File: () => {
        throw new Error("ENOENT");
      },
    },
  );
  assert.equal(broken.ok, false);
  assert.match(broken.body, /could not hash --toolchain-payload/u);

  const relative = await codexSessionContainmentCommand(
    { toolchainPayload: "payloads/pnpm.cjs" },
    { ledger, now: () => NOW },
    io,
  );
  assert.equal(relative.ok, false);
  assert.match(relative.body, /must be an absolute path/u);
});

test("an INSTALLABLE bundle refuses a hook interpreter outside the administrator-owned root", () => {
  // managedNodePath defaults to process.execPath, so generating from an ordinary shell silently
  // wrote a user-writable Node into the hook command of a MACHINE-WIDE boundary. Under ADR-0364 the
  // hook is the only fence left, so whoever can replace its interpreter replaces the fence.
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const managed = path.resolve("C:/ProgramData/OpenAI/Codex/Storytree");
  const base = {
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: managed,
    gitCommand: [process.execPath],
  } as const;
  const outsideNode = path.resolve("C:/Users/someone/AppData/Local/node/node.exe");

  // The DRY RUN stays runnable from any shell — that surface costs nothing and refusing it would
  // remove an inspection path for no gain.
  const inspection = buildCodexContainmentBundle({ ...base, managedNodePath: outsideNode });
  assert.equal(inspection.ok, true, "a dry run must still be generatable from an ordinary shell");

  // Configuring codexPayload is what declares "I mean to install this", and that is where it binds.
  const installable = buildCodexContainmentBundle({
    ...base,
    managedNodePath: outsideNode,
    codexPayload: { path: path.join(managed, "payloads", "codex.exe"), sha256: "c".repeat(64) },
  });
  assert.equal(installable.ok, false);
  if (installable.ok) assert.fail("expected a refusal");
  assert.match(installable.reason, /administrator-owned Node under/u);
  assert.match(installable.reason, /only fence/u);

  const correct = buildCodexContainmentBundle({
    ...base,
    managedNodePath: path.join(managed, "payloads", "node.exe"),
    codexPayload: { path: path.join(managed, "payloads", "codex.exe"), sha256: "c".repeat(64) },
  });
  assert.equal(correct.ok, true, "the managed Node is exactly what an installable bundle must use");
});

test("the rendered actuator's Write-Atomic really OVERWRITES an existing file under 5.1", (t) => {
  // A pure-text assertion cannot catch this one, which is why it executes. Windows PowerShell 5.1
  // binds $null to a [string] parameter as the EMPTY STRING, so `[IO.File]::Replace($T,$D,$null)`
  // threw "The path is not of a legal form." before touching the disk. Only the EXISTING-target
  // branch reaches Replace, so the first install onto an empty managed directory passed and every
  // RE-install was impossible — exactly the operation ADR-0364 requires to swap the ADR-0355
  // per-worktree profile for the standing one. Falsified by reverting to $null: this test fails and
  // no text-level assertion does.
  if (process.platform !== "win32") {
    t.skip("Windows PowerShell 5.1 string-binding behaviour is what is under test");
    return;
  }
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);

  const writeAtomic = /function Write-Atomic[\s\S]*?\n\}/u.exec(bundle.trustedActuatorScript);
  if (!writeAtomic) assert.fail("the rendered actuator carries no Write-Atomic function");

  const dir = mkdtempSync(path.join(os.tmpdir(), "storytree-write-atomic-"));
  try {
    const target = path.join(dir, "existing.mjs");
    writeFileSync(target, "ORIGINAL", "utf8");
    const script = path.join(dir, "probe.ps1");
    // Same strict-mode preamble the actuator runs under, so a latent binder error cannot pass here
    // and fail in the real script.
    writeFileSync(
      script,
      [
        "Set-StrictMode -Version Latest",
        '$ErrorActionPreference = "Stop"',
        writeAtomic[0],
        `Write-Atomic ${JSON.stringify(target)} "REPLACED"`,
      ].join("\n"),
      "utf8",
    );
    const run = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, `Write-Atomic failed over an existing file: ${run.stderr}`);
    assert.equal(readFileSync(target, "utf8"), "REPLACED");
    assert.deepEqual(
      readdirSync(dir).filter((entry) => entry.endsWith(".tmp")),
      [],
      "a failed or half-done replace must leave no temp file behind",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command can pin ALL THREE staged payloads, so the bundle it emits is installable", async () => {
  // The gap this closes: `--toolchain-payload` was the only payload flag, so every bundle the CLI
  // could generate carried a null codexPayload and a null worktreeCreatePayload. The actuator parses
  // and installs NOTHING in that state — `install` refuses at `Assert-PinnedPayload 'Codex payload'`
  // and `bootstrap` at the worktree-create payload — so the repository could describe the boundary
  // but never emit one an operator could actually install.
  const managed = path.resolve("C:/ProgramData/OpenAI/Codex/Storytree");
  const stagedPnpm = path.join(managed, "payloads", "pnpm.cjs");
  const stagedCodex = path.join(managed, "payloads", "codex-0.145.0.exe");
  const stagedNode = path.join(managed, "payloads", "node.exe");
  const hashed: string[] = [];
  const io: CodexContainmentIo = {
    probeGit: () => worktreeProbe(),
    canonicalize: norm,
    codexVersion: () => "codex-cli 0.145.0",
    managedDir: () => managed,
    // The MANAGED Node, because this bundle is meant to be installable — an installable bundle
    // generated by any other interpreter is refused, which is the neighbouring test's subject.
    managedNodePath: () => stagedNode,
    gitCommand: () => [process.execPath],
    writeFile: () => {
      throw new Error("never");
    },
    sha256File: (target) => {
      hashed.push(target);
      return "b".repeat(64);
    },
  };
  const ledger = { claimsBySession: async () => [claim()] };
  const readConfig = (body: string): Record<string, unknown> => {
    const encoded = /FromBase64String\("([A-Za-z0-9+/=]+)"\)/.exec(body);
    if (!encoded?.[1]) assert.fail("generated actuator carries no embedded config");
    return JSON.parse(Buffer.from(encoded[1], "base64").toString("utf8")) as Record<string, unknown>;
  };

  // The regression itself: the flags absent leaves both pins null, which is exactly the bundle that
  // refuses to install.
  const stranded = await codexSessionContainmentCommand({}, { ledger, now: () => NOW }, io);
  assert.equal(stranded.ok, true);
  const strandedConfig = readConfig(stranded.body);
  assert.equal(strandedConfig["codexPayload"], null);
  assert.equal(strandedConfig["worktreeCreatePayload"], null);

  const pinned = await codexSessionContainmentCommand(
    {
      toolchainPayload: stagedPnpm,
      codexPayload: stagedCodex,
      worktreeCreatePayload: stagedNode,
    },
    { ledger, now: () => NOW },
    io,
  );
  assert.equal(pinned.ok, true);
  assert.deepEqual(
    hashed,
    [stagedPnpm, stagedCodex, stagedNode],
    "every pin is hashed from the staged file itself — no digest is transcribed by hand",
  );
  const config = readConfig(pinned.body);
  assert.deepEqual(config["codexPayload"], { path: stagedCodex, sha256: "b".repeat(64) });

  // The worktree-create flag names the managed NODE, and the bundle pins the creator SCRIPT itself as
  // its fixed argument — so the pin an operator supplies can never silently become a different
  // command than the one this repository generated.
  const creator = config["worktreeCreatePayload"] as {
    path: string;
    sha256: string;
    fixedArguments: readonly { path: string; sha256: string }[];
  };
  assert.equal(creator.path, stagedNode);
  assert.equal(creator.fixedArguments.length, 1);
  assert.equal(
    creator.fixedArguments[0]?.path,
    path.join(managed, "storytree-codex-worktree-create.mjs"),
  );
  assert.match(creator.fixedArguments[0]?.sha256 ?? "", /^[a-f0-9]{64}$/u);

  for (const [flag, opts] of [
    ["--codex-payload", { codexPayload: "payloads/codex.exe" }],
    ["--worktree-create-payload", { worktreeCreatePayload: "payloads/node.exe" }],
  ] as const) {
    const relative = await codexSessionContainmentCommand(opts, { ledger, now: () => NOW }, io);
    assert.equal(relative.ok, false, `${flag} must refuse a relative path`);
    assert.match(relative.body, new RegExp(`${flag} must be an absolute path`, "u"));
  }
});

test("storytree-owned secrets are denied as ONE folder, while the vendor paths stay named", () => {
  const authority = authorizeCodexWriter(topology(), [claim()], NOW);
  if (!authority.ok) assert.fail(authority.reason);
  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: "codex-cli 0.145.0",
    managedDir: path.resolve("C:/ProgramData/OpenAI/Codex/Storytree"),
    managedNodePath: path.resolve("C:/Program Files/nodejs/node.exe"),
    // Explicit, like every neighbouring test: the generator refuses a bundle whose Git executable it
    // cannot name absolutely, and the ambient `git` that satisfies that on this Windows box does not
    // on the Linux CI runner. Omitting it passes locally and fails only in CI.
    gitCommand: [process.execPath],
  });
  if (!bundle.ok) assert.fail(bundle.reason);
  const encoded = /FromBase64String\("([A-Za-z0-9+/=]+)"\)/.exec(bundle.trustedActuatorScript);
  if (!encoded?.[1]) assert.fail("actuator script carries no embedded config");
  const acl = (
    JSON.parse(Buffer.from(encoded[1], "base64").toString("utf8")) as Record<string, unknown>
  )["credentialAclPaths"] as string[];
  assert.ok(Array.isArray(acl));

  const storytree = acl.filter((p) => /\.storytree/iu.test(p));
  assert.equal(storytree.length, 1, `expected one storytree deny, got ${JSON.stringify(storytree)}`);
  assert.doesNotMatch(
    storytree[0] as string,
    /secrets\.json$/iu,
    "the ACL must deny the storytree FOLDER as a unit — a per-file deny means every new secret " +
      "needs someone to reason about a new grant, which is the failure mode the folder home removes",
  );

  // Deliberately NOT folded into that folder: both are recreated in their default locations by their
  // own vendors, and redirecting gcloud via CLOUDSDK_CONFIG fails OPEN if it is ever unset.
  assert.ok(
    acl.some((p) => /[\\/]\.codex[\\/]auth\.json$/iu.test(p)),
    "the Codex credential stays named as a file, not swallowed by a tree deny",
  );
  assert.ok(acl.some((p) => /gcloud/iu.test(p)), "gcloud stays named individually");
});
