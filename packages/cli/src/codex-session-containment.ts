/**
 * Repository-testable half of ADR-0355's interactive Codex boundary.
 *
 * This module deliberately stops at generation. `%ProgramData%` requirements, managed hook
 * scripts, the per-process Windows permission-profile selection, and the final live smoke are
 * administrator-owned work. A repository command that could install or widen those things would
 * put the boundary back under the writer it is meant to contain.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import type { ClaimDocT } from "@storytree/notice-board";
import { claimGrade, liveClaims } from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";
import { buildManagedCodexLiveClaimProbe } from "./codex-live-claim-probe-bundle.js";
import { buildManagedCodexWorktreeCreate } from "./codex-worktree-create-bundle.js";

export const MIN_CODEX_PERMISSION_PROFILE_VERSION = "0.138.0";
export const CODEX_WRITER_PROFILE = "storytree_codex_current";
export const CODEX_PHASE_AUTHOR_PROFILE = "storytree_codex_phase_author";
export const CODEX_LOBBY_PROFILE = "storytree_codex_lobby";

export interface CodexGitProbe {
  readonly topLevel: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly branch: string;
  readonly worktreeList: string;
}

interface TopologyBase {
  readonly ok: true;
  readonly primaryCheckout: string;
  readonly registeredWorktrees: readonly string[];
}

export interface CodexLobbyTopology extends TopologyBase {
  readonly location: "lobby";
}

export interface CodexWorktreeTopology extends TopologyBase {
  readonly location: "worktree";
  readonly currentWorktree: string;
  readonly siblingWorktrees: readonly string[];
  readonly sessionId: string;
  readonly branch: string;
  readonly gitDir: string;
  readonly commonDir: string;
}

export type CodexSessionTopology = CodexLobbyTopology | CodexWorktreeTopology;
export type TopologyResult = CodexSessionTopology | { readonly ok: false; readonly reason: string };

export interface CodexWriterAuthority extends CodexWorktreeTopology {
  readonly liveClaimIds: readonly string[];
}

export type WriterAuthorityResult =
  | CodexWriterAuthority
  | { readonly ok: false; readonly reason: string };

export interface ParsedCodexVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly supported: boolean;
}

export interface CodexContainmentBundle {
  readonly ok: true;
  readonly requirementsPath: string;
  readonly managedDir: string;
  readonly policyPath: string;
  readonly hookScriptPath: string;
  readonly claimProbeScriptPath: string;
  readonly worktreeCreateScriptPath: string;
  readonly trustedActuatorScriptPath: string;
  readonly requirementsToml: string;
  readonly sessionPolicyJson: string;
  readonly managedHookScript: string;
  readonly managedClaimProbeScript: string;
  readonly managedWorktreeCreateScript: string;
  readonly trustedActuatorScript: string;
  readonly operatorReadme: string;
}

export interface BuildBundleArgs {
  readonly authority: CodexLobbyTopology | CodexWriterAuthority;
  readonly codexVersion: string;
  readonly managedDir: string;
  readonly managedNodePath: string;
  /** Absolute administrator-owned Git command (executable first, fixed prefix arguments after). */
  readonly gitCommand?: readonly string[];
  /** Absolute trusted probe which re-reads live claims and returns `{claims:[...]}` on every call. */
  readonly claimProbeCommand?: readonly string[];
  /** Optional administrator-owned, hash-pinned native Codex executable under the managed directory. */
  readonly codexPayload?: Readonly<{ path: string; sha256: string }>;
  /** Optional administrator-owned, hash-pinned managed Node executable for the generated creator. */
  readonly worktreeCreatePayload?: Readonly<{ path: string; sha256: string }>;
}

function comparable(value: string): string {
  const slashed = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function samePath(left: string, right: string): boolean {
  return comparable(left) === comparable(right);
}

function insidePath(root: string, candidate: string): boolean {
  const base = comparable(root);
  const target = comparable(candidate);
  return target === base || target.startsWith(`${base}/`);
}

function parseRegisteredWorktrees(porcelain: string): string[] {
  return porcelain
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter((line) => line.length > 0);
}

function sessionIdFor(topLevel: string, gitDir: string): string {
  const claude = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(topLevel);
  if (claude?.[1]) return claude[1];
  return path.basename(gitDir.replace(/[/\\]+$/, ""));
}

/**
 * Resolve the current checkout only from Git's own topology and registry. No caller-supplied root,
 * session id, or sibling allowlist participates in the answer.
 */
export function resolveCodexSessionTopology(
  probe: CodexGitProbe,
  io: { canonicalize: (target: string) => string },
): TopologyResult {
  try {
    const topLevel = io.canonicalize(probe.topLevel);
    const gitDir = io.canonicalize(probe.gitDir);
    const commonDir = io.canonicalize(probe.commonDir);
    const primaryCheckout = io.canonicalize(path.dirname(probe.commonDir));
    const registeredWorktrees = parseRegisteredWorktrees(probe.worktreeList).map(io.canonicalize);
    const registrations = registeredWorktrees.filter((root) => samePath(root, topLevel));
    if (registrations.length !== 1) {
      return {
        ok: false,
        reason:
          `current checkout resolves to ${topLevel}, but Git reports ${registrations.length} ` +
          "matching registrations — it is not exactly one registered worktree",
      };
    }

    if (samePath(gitDir, commonDir)) {
      if (!samePath(topLevel, primaryCheckout)) {
        return {
          ok: false,
          reason: "Git reports a primary checkout whose top-level disagrees with its common directory",
        };
      }
      return {
        ok: true,
        location: "lobby",
        primaryCheckout,
        registeredWorktrees,
      };
    }

    if (probe.branch.trim().length === 0 || probe.branch.trim() === "HEAD") {
      return { ok: false, reason: "the registered worktree is detached or has no current branch" };
    }
    const sessionId = sessionIdFor(topLevel, gitDir);
    if (sessionId.length === 0) {
      return { ok: false, reason: "Git topology produced no repository-minted session identity" };
    }
    return {
      ok: true,
      location: "worktree",
      primaryCheckout,
      registeredWorktrees,
      currentWorktree: topLevel,
      siblingWorktrees: registeredWorktrees.filter(
        (root) => !samePath(root, topLevel) && !samePath(root, primaryCheckout),
      ),
      sessionId,
      branch: probe.branch.trim(),
      gitDir,
      commonDir,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `could not canonicalise the current Git topology: ${String(error)}`,
    };
  }
}

export function parseCodexVersion(raw: string): ParsedCodexVersion | null {
  const match = /(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(raw.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return {
    major,
    minor,
    patch,
    supported: major > 0 || minor > 138 || (minor === 138 && patch >= 0),
  };
}

/** A writer starts only with a fresh work-grade claim stamped to this Git-derived identity/branch. */
export function authorizeCodexWriter(
  topology: CodexWorktreeTopology,
  claims: readonly ClaimDocT[],
  now: Date,
): WriterAuthorityResult {
  const fresh = liveClaims(claims, now).filter(
    (claim) => claim.sessionId === topology.sessionId && claimGrade(claim) === "work",
  );
  if (fresh.length === 0) {
    return {
      ok: false,
      reason: `no live work claim exists for session ${topology.sessionId}; the Codex writer stays read-only`,
    };
  }
  const currentBranch = fresh.filter((claim) => claim.branch === topology.branch);
  if (currentBranch.length === 0) {
    return {
      ok: false,
      reason:
        `the live work claim does not name current branch ${topology.branch}; ` +
        "refusing a stale or rewound worktree identity",
    };
  }
  return {
    ...topology,
    liveClaimIds: [...new Set(currentBranch.map((claim) => claim.unitId))].sort(),
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function safeHookCommand(nodePath: string, scriptPath: string, mode: string, policyPath: string): string {
  const quote = (value: string) => `"${value.replaceAll('"', '\\"')}"`;
  return [nodePath, scriptPath, mode, policyPath].map(quote).join(" ");
}

function renderHookGroup(
  event: "SessionStart" | "PreToolUse" | "PermissionRequest",
  matcher: string,
  command: string,
  status: string,
): string[] {
  return [
    `[[hooks.${event}]]`,
    `matcher = ${tomlString(matcher)}`,
    "",
    `[[hooks.${event}.hooks]]`,
    'type = "command"',
    `command = ${tomlString(command)}`,
    `command_windows = ${tomlString(command)}`,
    "timeout = 30",
    `statusMessage = ${tomlString(status)}`,
  ];
}

function credentialRoots(): string[] {
  const roots = [
    process.env["APPDATA"] ? path.join(process.env["APPDATA"], "gcloud") : undefined,
    process.env["APPDATA"]
      ? path.join(process.env["APPDATA"], "gcloud", "application_default_credentials.json")
      : undefined,
    path.join(process.env["USERPROFILE"] ?? os.homedir(), ".config", "gcloud"),
    process.env["CLOUDSDK_CONFIG"],
    process.env["GOOGLE_APPLICATION_CREDENTIALS"],
    path.join(process.env["USERPROFILE"] ?? os.homedir(), ".storytree"),
    path.join(process.env["USERPROFILE"] ?? os.homedir(), ".storytree", "secrets.json"),
    path.join(process.env["USERPROFILE"] ?? os.homedir(), ".codex"),
    path.join(process.env["USERPROFILE"] ?? os.homedir(), ".codex", "auth.json"),
  ].filter((value): value is string => typeof value === "string" && path.isAbsolute(value));
  return [...new Map(roots.map((root) => [comparable(root), path.resolve(root)])).values()];
}

function credentialAclPaths(): string[] {
  const home = process.env["USERPROFILE"] ?? os.homedir();
  return [
    process.env["APPDATA"] ? path.join(process.env["APPDATA"], "gcloud") : undefined,
    path.join(home, ".config", "gcloud"),
    process.env["CLOUDSDK_CONFIG"],
    process.env["GOOGLE_APPLICATION_CREDENTIALS"],
    path.join(home, ".storytree", "secrets.json"),
    path.join(home, ".codex", "auth.json"),
  ].filter((value): value is string => typeof value === "string" && path.isAbsolute(value));
}

function renderCredentialDenies(profile: string): string[] {
  return credentialRoots().flatMap((root) => [
    "",
    `[permissions.${profile}.filesystem.${tomlString(root)}]`,
    '"." = "deny"',
  ]);
}

function renderManagedRequirements(args: {
  authority: CodexLobbyTopology | CodexWriterAuthority;
  managedDir: string;
  managedNodePath: string;
  policyPath: string;
  hookScriptPath: string;
}): string {
  const writer = args.authority.location === "worktree";
  const profile = writer ? CODEX_WRITER_PROFILE : CODEX_LOBBY_PROFILE;
  const command = (mode: string) =>
    safeHookCommand(args.managedNodePath, args.hookScriptPath, mode, args.policyPath);
  const lines = [
    "# Generated by Storytree for ADR-0355. Administrator-owned; do not place in the repository.",
    `# Requires Codex >= ${MIN_CODEX_PERMISSION_PROFILE_VERSION}. Older clients ignore this boundary.`,
    `default_permissions = ${tomlString(profile)}`,
    "allow_managed_hooks_only = true",
    "",
    "[features]",
    "hooks = true",
    "",
    "[windows]",
    'allowed_sandbox_implementations = ["elevated"]',
    "",
    "[allowed_permission_profiles]",
    `${profile} = true`,
    ...(writer ? [`${CODEX_PHASE_AUTHOR_PROFILE} = true`] : []),
    "",
    `[permissions.${profile}]`,
    `description = ${tomlString(
      writer
        ? "Storytree: write only in this process's current claimed worktree."
        : "Storytree lobby: read-only until the trusted worktree actuator hands off.",
    )}`,
    'extends = ":read-only"',
    "",
    `[permissions.${profile}.filesystem]`,
    '":minimal" = "read"',
    ...renderCredentialDenies(profile),
  ];

  if (args.authority.location === "worktree") {
    lines.push(
      "",
      `[permissions.${profile}.filesystem.${tomlString(args.authority.currentWorktree)}]`,
      '"." = "write"',
      '".git" = "deny"',
      '".codex" = "deny"',
      "",
      `[permissions.${profile}.network]`,
      "enabled = false",
      "",
      `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}]`,
      `description = ${tomlString(
        "Storytree factory phase author: write only inside disposable Codex replicas.",
      )}`,
      'extends = ":read-only"',
      "",
      `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}.filesystem]`,
      '":minimal" = "read"',
      ...renderCredentialDenies(CODEX_PHASE_AUTHOR_PROFILE),
      "",
      `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}.filesystem.${tomlString(args.authority.currentWorktree)}]`,
      '".gate-logs/codex-replicas" = "write"',
      "",
      `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}.network]`,
      "enabled = false",
    );
  }

  lines.push(
    "",
    "[hooks]",
    `windows_managed_dir = ${tomlString(args.managedDir)}`,
    "",
    ...renderHookGroup(
      "SessionStart",
      "startup|resume|clear|compact",
      command("session-start"),
      "Verifying Storytree session authority",
    ),
    "",
    ...renderHookGroup(
      "PreToolUse",
      "*",
      command("pre-tool-use"),
      "Checking current claimed worktree",
    ),
    "",
    ...renderHookGroup(
      "PermissionRequest",
      "*",
      command("permission-request"),
      "Recording refused permission widening",
    ),
    "",
  );
  return lines.join("\n");
}

/**
 * Self-contained managed-hook transport. Device management writes these exact bytes under
 * `hooks.windows_managed_dir`; the repository command only prints them. The live-claim reader is a
 * separate administrator-owned executable because its database credentials and Cloud SQL transport
 * must not be embedded in an agent-writable repository. Its protocol is deliberately tiny:
 * stdin carries `{readMode:"live-claims-required", sessionId, observedTopology, event}` and stdout
 * must be `{claims:[...]}`. Missing, slow, non-zero, or malformed probes fail closed.
 */
export const MANAGED_CODEX_HOOK_SCRIPT = String.raw`#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
const policyPath = process.argv[3];

function fail(reason) {
  process.stderr.write("Storytree Codex managed hook failed closed: " + reason + "\n");
  process.exitCode = 2;
}

function comparable(value) {
  const slashed = path.resolve(value).replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? slashed.toLowerCase() : slashed;
}

function samePath(left, right) {
  return comparable(left) === comparable(right);
}

function insidePath(root, candidate) {
  const base = comparable(root);
  const target = comparable(candidate);
  return target === base || target.startsWith(base + "/");
}

function canonicalize(target) {
  let candidate = path.resolve(target);
  const missing = [];
  while (!existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error("no existing ancestor for " + target);
    missing.unshift(path.basename(candidate));
    candidate = parent;
  }
  return path.join(realpathSync.native(candidate), ...missing);
}

function command(value, name) {
  if (!Array.isArray(value) || value.length === 0 || value.some((part) => typeof part !== "string")) {
    throw new Error(name + " is not an exact command array");
  }
  if (!path.isAbsolute(value[0])) throw new Error(name + " executable is not absolute");
  return value;
}

function run(exact, args, stdin) {
  return execFileSync(exact[0], [...exact.slice(1), ...args], {
    encoding: "utf8",
    input: stdin,
    timeout: 30000,
    windowsHide: true,
  }).trim();
}

function registeredWorktrees(raw) {
  return raw.replaceAll("\r\n", "\n").split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => canonicalize(line.slice("worktree ".length).trim()));
}

function probeGit(policy) {
  const git = command(policy.gitCommand, "gitCommand");
  const topLevel = canonicalize(run(git, ["rev-parse", "--path-format=absolute", "--show-toplevel"]));
  const gitDir = canonicalize(run(git, ["rev-parse", "--path-format=absolute", "--git-dir"]));
  const commonDir = canonicalize(run(git, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const branch = run(git, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const registered = registeredWorktrees(run(git, ["worktree", "list", "--porcelain"]));
  if (registered.filter((root) => samePath(root, topLevel)).length !== 1) {
    throw new Error("current checkout is not exactly one Git-registered worktree");
  }
  const primaryCheckout = canonicalize(path.dirname(commonDir));
  const location = samePath(gitDir, commonDir) ? "lobby" : "worktree";
  if (location === "lobby" && !samePath(topLevel, primaryCheckout)) {
    throw new Error("primary checkout disagrees with Git common directory");
  }
  if (location === "worktree" && (!branch || branch === "HEAD")) {
    throw new Error("current linked worktree is detached");
  }
  return { location, topLevel, gitDir, commonDir, primaryCheckout, branch, registeredWorktrees: registered };
}

function assertExpectedTopology(policy, observed) {
  const expectedLocation = policy.mode === "writer" ? "worktree" : policy.mode;
  if (expectedLocation !== observed.location) throw new Error("checkout changed between launch and hook");
  if (!samePath(policy.primaryCheckout, observed.primaryCheckout)) {
    throw new Error("primary checkout changed between launch and hook");
  }
  if (policy.mode === "writer") {
    if (!samePath(policy.currentWorktree, observed.topLevel)) {
      throw new Error("current worktree changed between launch and hook");
    }
    if (policy.branch !== observed.branch) throw new Error("current branch changed from launch authority");
  }
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

function readLiveClaims(policy, observed, event) {
  const probe = command(policy.claimProbeCommand, "claimProbeCommand");
  const request = JSON.stringify({
    protocolVersion: 1,
    readMode: "live-claims-required",
    sessionId: policy.sessionId,
    observedTopology: observed,
    event,
  });
  const parsed = JSON.parse(run(probe, [], request));
  if (!parsed || !Array.isArray(parsed.claims)) throw new Error("live claim probe returned malformed JSON");
  return parsed.claims;
}

function authority(policy, observed, claims) {
  const held = claims.filter((claim) => claim && claim.sessionId === policy.sessionId &&
    (claim.grade === undefined || claim.grade === "work") && claim.branch === observed.branch);
  if (held.length === 0) return { ok: false, reason: "no live work claim exists for this session/current branch" };
  return { ok: true };
}

function patchTargets(commandText) {
  if (typeof commandText !== "string" || commandText.includes("\0")) {
    return { ok: false, reason: "apply_patch carries ambiguous or unreadable patch text" };
  }
  const lines = commandText.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || !lines.includes("*** End Patch")) {
    return { ok: false, reason: "apply_patch carries an ambiguous patch envelope" };
  }
  const paths = [];
  for (const line of lines) {
    const operation = /^\*\*\* (?:Add File|Delete File|Update File): (.+)$/.exec(line);
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (operation && operation[1]) paths.push(operation[1]);
    if (move && move[1]) paths.push(move[1]);
  }
  return paths.length ? { ok: true, paths } : { ok: false, reason: "apply_patch carries no unambiguous file target" };
}

const PATH_KEY = /^(?:file_?path|path|target|destination|directory|root|cwd|old_?path|new_?path)$/i;
function collectPathFields(value, key, into) {
  if (typeof value === "string") {
    if (PATH_KEY.test(key || "")) into.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectPathFields(item, key, into);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collectPathFields(child, childKey, into);
  }
  return into;
}

const READ_ONLY = new Set(["Read", "Glob", "Grep", "read_file", "list_dir", "list_files", "search_files", "view_image"]);
function writerLike(tool) { return /write|edit|patch|delete|remove|move|rename|create|mkdir|copy/i.test(tool); }

function decideWriter(policy, observed, claims, event) {
  const tool = typeof event.tool_name === "string" ? event.tool_name : "(unknown)";
  const auth = authority(policy, observed, claims);
  if (!auth.ok) return { allow: false, tool, paths: [], reason: auth.reason };
  if (typeof event.cwd !== "string") return { allow: false, tool, paths: [], reason: "hook input carries no working directory" };
  const cwd = canonicalize(event.cwd);
  if (!insidePath(policy.currentWorktree, cwd)) {
    return { allow: false, tool, paths: [cwd], reason: "tool working directory is outside the current claimed worktree" };
  }
  if (event.hook_event_name === "PermissionRequest") {
    return { allow: false, tool, paths: [], reason: "permission widening is unavailable under the strict Storytree profile" };
  }
  if (event.hook_event_name === "SessionStart" || READ_ONLY.has(tool) || tool === "Bash" || tool === "exec_command" || tool === "unified_exec") {
    return { allow: true, tool, paths: [] };
  }
  let targets;
  if (tool === "apply_patch") {
    const parsed = patchTargets(event.tool_input && event.tool_input.command);
    if (!parsed.ok) return { allow: false, tool, paths: [], reason: parsed.reason };
    targets = parsed.paths;
  } else {
    targets = collectPathFields(event.tool_input, "", []);
    if (writerLike(tool) && targets.length === 0) {
      return { allow: false, tool, paths: [], reason: "write-like tool carries no extractable target" };
    }
  }
  const paths = [];
  for (const target of targets) {
    if (!target || target.includes("\0") || /[\r\n]/.test(target)) {
      return { allow: false, tool, paths, reason: "tool target is malformed or ambiguous" };
    }
    const resolved = canonicalize(path.isAbsolute(target) ? target : path.resolve(cwd, target));
    paths.push(resolved);
    if (!insidePath(policy.currentWorktree, resolved)) {
      return { allow: false, tool, paths, reason: "target resolves outside the current claimed worktree" };
    }
    const rel = comparable(resolved).slice(comparable(policy.currentWorktree).length + 1);
    if (rel === ".git" || rel.startsWith(".git/") || rel === ".codex" || rel.startsWith(".codex/")) {
      return { allow: false, tool, paths, reason: "target resolves to protected repository/session metadata" };
    }
  }
  return { allow: true, tool, paths };
}

function decideLobby(event) {
  const tool = typeof event.tool_name === "string" ? event.tool_name : "(unknown)";
  if (event.hook_event_name === "SessionStart" || READ_ONLY.has(tool)) return { allow: true, tool, paths: [] };
  return { allow: false, tool, paths: [], reason: "the Storytree lobby is read-only and no bootstrap actuator is installed" };
}

function emitDecision(eventName, decision) {
  if (decision.allow) return;
  if (eventName === "PermissionRequest") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PermissionRequest", decision: { behavior: "deny", message: decision.reason }
    } }));
    return;
  }
  if (eventName === "PreToolUse") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: decision.reason
    } }));
    return;
  }
  fail(decision.reason);
}

try {
  if (!policyPath || !["session-start", "pre-tool-use", "permission-request"].includes(mode)) {
    throw new Error("mode/policy arguments are malformed");
  }
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const event = JSON.parse(await readStdin());
  const expectedEvent = mode === "session-start" ? "SessionStart" : mode === "pre-tool-use" ? "PreToolUse" : "PermissionRequest";
  if (!event || event.hook_event_name !== expectedEvent) throw new Error("hook event does not match managed command mode");
  const observed = probeGit(policy);
  assertExpectedTopology(policy, observed);
  const claims = policy.mode === "writer" ? readLiveClaims(policy, observed, event) : [];
  const decision = policy.mode === "writer" ? decideWriter(policy, observed, claims, event) : decideLobby(event);
  emitDecision(expectedEvent, decision);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
`;

/**
 * Administrator-owned lifecycle boundary. The generated copy contains only data derived from the
 * selected bundle; it never imports or invokes repository code. Device management may install this
 * script, while the repository command remains a dry-run generator.
 */
const MANAGED_CODEX_TRUSTED_ACTUATOR_TEMPLATE = String.raw`#requires -Version 5.1
[CmdletBinding(PositionalBinding = $false)]
param([Parameter(ValueFromRemainingArguments = $true)][string[]] $RawArgs)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Config = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("__CONFIG_BASE64__")) | ConvertFrom-Json
$Mutex = $null
$HasMutex = $false

function Fail([string] $Message) { throw "Storytree Codex trusted actuator refused: $Message" }
function Same-Path([string] $Left, [string] $Right) {
  return [string]::Equals([IO.Path]::GetFullPath($Left).TrimEnd('\'), [IO.Path]::GetFullPath($Right).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}
function Canonical-Existing([string] $Target) {
  if (-not [IO.Path]::IsPathRooted($Target)) { Fail "path must be absolute" }
  return (Get-Item -LiteralPath $Target -Force -ErrorAction Stop).FullName
}
function Assert-PinnedPayload([string] $Name, $Payload) {
  if ($null -eq $Payload -or [string]::IsNullOrWhiteSpace([string]$Payload.path) -or [string]::IsNullOrWhiteSpace([string]$Payload.sha256)) {
    Fail "$Name is not configured as an administrator-owned hash-pinned payload"
  }
  $PayloadPath = Canonical-Existing ([string]$Payload.path)
  $ManagedRoot = [IO.Path]::GetFullPath([string]$Config.managedDir).TrimEnd('\') + '\'
  if (-not $PayloadPath.StartsWith($ManagedRoot, [StringComparison]::OrdinalIgnoreCase)) { Fail "$Name is outside the administrator-owned managed directory" }
  $Observed = (Get-FileHash -LiteralPath $PayloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Observed -ne ([string]$Payload.sha256).ToLowerInvariant()) { Fail "$Name hash does not match the generated pin" }
  return $PayloadPath
}
function Assert-PinnedCommand([string] $Name, $Payload) {
  $Executable = Assert-PinnedPayload $Name $Payload
  $Command = @($Executable)
  foreach ($Fixed in @($Payload.fixedArguments)) {
    $Command += Assert-PinnedPayload ($Name + ' fixed argument') $Fixed
  }
  if ($Command.Count -lt 2) { Fail "$Name carries no hash-pinned fixed entry script" }
  return $Command
}
function Invoke-Exact($Command, [string[]] $Tail, [AllowNull()][string] $InputText) {
  if ($null -eq $Command -or $Command.Count -lt 1 -or -not [IO.Path]::IsPathRooted([string]$Command[0])) { Fail "managed command is not exact and absolute" }
  $Executable = [string]$Command[0]
  $Arguments = @()
  if ($Command.Count -gt 1) { $Arguments += @($Command | Select-Object -Skip 1) }
  $Arguments += $Tail
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    if ($null -eq $InputText) { $Output = & $Executable @Arguments 2>&1 } else { $Output = $InputText | & $Executable @Arguments 2>&1 }
    $CommandExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
  if ($CommandExit -ne 0) {
    $Detail = (($Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
    if ($Detail.Length -gt 2048) { $Detail = $Detail.Substring($Detail.Length - 2048) }
    Fail "managed command exited $CommandExit$(if ($Detail) { ': ' + $Detail } else { '' })"
  }
  return (($Output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
}
function Probe-Git([string] $RequestedWorktree) {
  $Top = Canonical-Existing (Invoke-Exact $Config.gitCommand @('-C', $RequestedWorktree, 'rev-parse', '--path-format=absolute', '--show-toplevel') $null)
  if (-not (Same-Path $Top $RequestedWorktree)) { Fail "requested directory is not its independently resolved Git top-level" }
  $GitDir = Canonical-Existing (Invoke-Exact $Config.gitCommand @('-C', $Top, 'rev-parse', '--path-format=absolute', '--git-dir') $null)
  $CommonDir = Canonical-Existing (Invoke-Exact $Config.gitCommand @('-C', $Top, 'rev-parse', '--path-format=absolute', '--git-common-dir') $null)
  $Branch = Invoke-Exact $Config.gitCommand @('-C', $Top, 'rev-parse', '--abbrev-ref', 'HEAD') $null
  if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq 'HEAD') { Fail "worktree is detached" }
  $Porcelain = Invoke-Exact $Config.gitCommand @('-C', $Top, 'worktree', 'list', '--porcelain') $null
  $Registered = @($Porcelain -split [char]10 | Where-Object { $_ -like 'worktree *' } | ForEach-Object { [IO.Path]::GetFullPath($_.Substring(9).Trim()) })
  if (@($Registered | Where-Object { Same-Path $_ $Top }).Count -ne 1) { Fail "checkout is not exactly one Git-registered worktree" }
  $Primary = Canonical-Existing (Split-Path -Parent $CommonDir)
  $Location = if (Same-Path $GitDir $CommonDir) { 'lobby' } else { 'worktree' }
  if ($Location -eq 'lobby' -and -not (Same-Path $Top $Primary)) { Fail "lobby disagrees with Git common directory" }
  $SessionId = if ($Top -match '[\\/]\.claude[\\/]worktrees[\\/]([^\\/]+)$') { $Matches[1] } else { Split-Path -Leaf $GitDir }
  return [pscustomobject]@{ topLevel = $Top; gitDir = $GitDir; commonDir = $CommonDir; primaryCheckout = $Primary; branch = $Branch; location = $Location; sessionId = $SessionId }
}
function Assert-ExpectedTopology($Observed, $Expected) {
  if ($Observed.location -ne $Expected.location) { Fail "Git topology does not match the selected policy" }
  if (-not (Same-Path $Observed.primaryCheckout $Expected.primaryCheckout)) { Fail "primary checkout changed from generated policy" }
  if ($Expected.location -eq 'worktree') {
    if (-not (Same-Path $Observed.topLevel $Expected.currentWorktree)) { Fail "launch worktree differs from generated policy" }
    if ($Observed.branch -ne $Expected.branch -or $Observed.sessionId -ne $Expected.sessionId) { Fail "session identity or branch changed from generated policy" }
  }
}
function Assert-LiveClaim($Observed) {
  $Request = @{ protocolVersion = 1; readMode = 'live-claims-required'; sessionId = $Observed.sessionId; observedTopology = $Observed; event = @{ source = 'trusted-launcher' } } | ConvertTo-Json -Depth 8 -Compress
  $Response = Invoke-Exact $Config.claimProbeCommand @() $Request | ConvertFrom-Json
  $Held = @($Response.claims | Where-Object { $_.sessionId -eq $Observed.sessionId -and $_.branch -eq $Observed.branch -and ($null -eq $_.grade -or $_.grade -eq 'work') })
  if ($Held.Count -lt 1) { Fail "no live work claim admits this session/current branch" }
}
function Decode([string] $Encoded) { return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Encoded)) }
function Write-Atomic([string] $Target, [string] $Content) {
  $Parent = Split-Path -Parent $Target
  [IO.Directory]::CreateDirectory($Parent) | Out-Null
  $Temp = Join-Path $Parent ('.' + [IO.Path]::GetFileName($Target) + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($Temp, $Content, [Text.UTF8Encoding]::new($false))
    if ([IO.File]::Exists($Target)) { [IO.File]::Replace($Temp, $Target, $null) } else { [IO.File]::Move($Temp, $Target) }
  } finally { if ([IO.File]::Exists($Temp)) { [IO.File]::Delete($Temp) } }
}
function Install-Policy($Policy) {
  Write-Atomic ([string]$Config.hookScriptPath) (Decode ([string]$Config.hookScript))
  Write-Atomic ([string]$Config.claimProbeScriptPath) (Decode ([string]$Config.claimProbeScript))
  Write-Atomic ([string]$Config.worktreeCreateScriptPath) (Decode ([string]$Config.worktreeCreateScript))
  Write-Atomic ([string]$Policy.policyPath) (Decode ([string]$Policy.policyJson))
  # Requirements move last: Codex can never observe a profile before its exact hook/policy exists.
  Write-Atomic ([string]$Config.requirementsPath) (Decode ([string]$Policy.requirementsToml))
}
function Scrub-WriterTokens() {
  # The managed claim broker uses standard keyless ADC discovery; bearer-token variables are never
  # inherited by the model process. Filesystem profile denies protect the underlying credential files.
  foreach ($Name in @('GOOGLE_OAUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'GCP_ACCESS_TOKEN')) {
    Remove-Item -LiteralPath ('Env:' + $Name) -ErrorAction SilentlyContinue
  }
}
function Protect-SandboxCredentials() {
  $Account = New-Object Security.Principal.NTAccount($env:COMPUTERNAME, 'CodexSandboxUsers')
  try { $Sid = $Account.Translate([Security.Principal.SecurityIdentifier]).Value }
  catch { Fail "CodexSandboxUsers is unavailable after sandbox setup" }
  foreach ($Target in @($Config.credentialAclPaths)) {
    if (-not (Test-Path -LiteralPath ([string]$Target))) { continue }
    $Item = Get-Item -LiteralPath ([string]$Target) -Force
    $Rule = if ($Item.PSIsContainer) { '*' + $Sid + ':(OI)(CI)(RX)' } else { '*' + $Sid + ':(R)' }
    & icacls.exe $Item.FullName /deny $Rule | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "could not deny the Codex sandbox account access to a credential path" }
  }
}

try {
  if ($RawArgs.Count -eq 0) { Fail "expected exactly bootstrap or launch" }
  $Verb = $RawArgs[0]
  if ($Verb -eq 'bootstrap') {
    if ($RawArgs.Count -ne 5 -or $RawArgs[1] -ne '--node' -or $RawArgs[3] -ne '--intent') { Fail "exact grammar is bootstrap --node <capability> --intent <text>" }
    $Node = $RawArgs[2]; $Intent = $RawArgs[4]
    if ($Node -notmatch '^[a-z0-9][a-z0-9-]{1,127}$') { Fail "--node must be one capability identifier" }
    if ([string]::IsNullOrWhiteSpace($Intent) -or $Intent.Length -gt 1024 -or $Intent.IndexOf([char]0) -ge 0 -or $Intent.IndexOf([char]10) -ge 0 -or $Intent.IndexOf([char]13) -ge 0) { Fail "--intent must be one non-empty line of at most 1024 characters" }
  } elseif ($Verb -eq 'launch') {
    if ($RawArgs.Count -ne 3 -or $RawArgs[1] -ne '--worktree') { Fail "exact grammar is launch --worktree <canonical-path>" }
  } else { Fail "unknown subcommand '$Verb'" }

  $Mutex = [Threading.Mutex]::new($false, 'Global\StorytreeCodexContainmentLifecycle')
  $HasMutex = $Mutex.WaitOne()
  if (-not $HasMutex) { Fail "could not acquire lifecycle mutex" }

  if ($Verb -eq 'bootstrap') {
    if ($Config.expected.location -ne 'lobby') { Fail "bootstrap is available only from a generated lobby policy" }
    $Payload = Assert-PinnedCommand 'worktree-create payload' $Config.worktreeCreatePayload
    $ObservedLobby = Probe-Git ([string]$Config.expected.primaryCheckout)
    Assert-ExpectedTopology $ObservedLobby $Config.expected
    $ResultText = Invoke-Exact $Payload @('--node', $Node, '--intent', $Intent, '--primary', $ObservedLobby.topLevel) $null
    # The ceremony deliberately streams pnpm-install diagnostics to stderr. Invoke-Exact combines
    # both streams for an honest failure message, so the exact payload's final stdout line is the
    # machine response and everything before it is operator diagnostics.
    $ResultLine = @($ResultText -split [char]10 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1]
    $Result = $ResultLine | ConvertFrom-Json
    if ($null -eq $Result.worktree) { Fail "worktree-create payload returned no worktree" }
    $Created = Probe-Git (Canonical-Existing ([string]$Result.worktree))
    if ($Created.location -ne 'worktree' -or -not (Same-Path $Created.primaryCheckout $Config.expected.primaryCheckout)) { Fail "created checkout is not a linked worktree of this lobby" }
    [Console]::Out.WriteLine(($Created | ConvertTo-Json -Compress))
  } else {
    $CanonicalWorktree = Canonical-Existing $RawArgs[2]
    $Observed = Probe-Git $CanonicalWorktree
    Assert-ExpectedTopology $Observed $Config.expected
    if ($Observed.location -eq 'worktree') { Assert-LiveClaim $Observed }
    $CodexPayload = Assert-PinnedPayload 'Codex payload' $Config.codexPayload
    Install-Policy $Config.activePolicy
    try {
      # Materialise/refresh Codex's restricted local account without a model turn, then carve
      # credential paths out at the Windows ACL layer. Native Windows deny_read alone does not bind
      # shell subprocesses, so the DACL is the physical read boundary.
      & $CodexPayload sandbox --include-managed-config -P ([string]$Config.activeProfile) -C $CanonicalWorktree -- $env:ComSpec /d /c exit 0
      if ($LASTEXITCODE -ne 0) { Fail "Codex sandbox setup attestation failed" }
      Protect-SandboxCredentials
      Scrub-WriterTokens
      # Exact pinned launch surface: payload, -C, canonical worktree. No sandbox/profile/config widening flags.
      $CodexArguments = @('-C', $CanonicalWorktree)
      & $CodexPayload @CodexArguments
      $CodexExit = $LASTEXITCODE
      if ($CodexExit -ne 0) { Fail "pinned Codex exited $CodexExit" }
    } finally {
      Install-Policy $Config.lobbyPolicy
      if (-not [string]::IsNullOrWhiteSpace([string]$Config.restoreActuatorScript)) {
        Write-Atomic ([string]$Config.trustedActuatorScriptPath) (Decode ([string]$Config.restoreActuatorScript))
      }
    }
  }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 2
} finally {
  if ($HasMutex -and $null -ne $Mutex) { $Mutex.ReleaseMutex() }
  if ($null -ne $Mutex) { $Mutex.Dispose() }
}
`;

function managedPayload(
  payload: BuildBundleArgs["codexPayload"],
  managedDir: string,
  name: string,
): NonNullable<BuildBundleArgs["codexPayload"]> | null | { readonly ok: false; readonly reason: string } {
  if (payload === undefined) return null;
  if (!path.isAbsolute(payload.path) || !insidePath(managedDir, payload.path)) {
    return { ok: false, reason: `${name} must be an absolute administrator-owned path under managedDir` };
  }
  if (!/^[a-f0-9]{64}$/i.test(payload.sha256)) {
    return { ok: false, reason: `${name} must carry one SHA-256 pin` };
  }
  return { path: payload.path, sha256: payload.sha256.toLowerCase() };
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function exactManagedCommand(
  command: readonly string[] | undefined,
  fallback: readonly string[],
  name: string,
): readonly string[] | { readonly ok: false; readonly reason: string } {
  const resolved = command ?? fallback;
  if (resolved.length === 0 || !path.isAbsolute(resolved[0] ?? "")) {
    return { ok: false, reason: `${name} must name an absolute administrator-owned executable` };
  }
  if (resolved.some((part) => part.trim().length === 0 || /[\r\n\0]/.test(part))) {
    return { ok: false, reason: `${name} carries a blank or malformed argument` };
  }
  return [...resolved];
}

export function buildCodexContainmentBundle(
  args: BuildBundleArgs,
): CodexContainmentBundle | { readonly ok: false; readonly reason: string } {
  const version = parseCodexVersion(args.codexVersion);
  if (version === null || !version.supported) {
    return {
      ok: false,
      reason:
        `Codex ${MIN_CODEX_PERMISSION_PROFILE_VERSION} or later is required because earlier clients ` +
        "ignore allowed_permission_profiles and managed default_permissions",
    };
  }
  if (!path.isAbsolute(args.managedDir) || !path.isAbsolute(args.managedNodePath)) {
    return { ok: false, reason: "managed hook directory and Node executable must be absolute" };
  }
  const gitCommand = exactManagedCommand(
    args.gitCommand,
    [path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Git", "cmd", "git.exe")],
    "gitCommand",
  );
  if ("ok" in gitCommand) return gitCommand;
  const claimProbeScriptPath = path.join(args.managedDir, "storytree-codex-live-claim-probe.mjs");
  const worktreeCreateScriptPath = path.join(
    args.managedDir,
    "storytree-codex-worktree-create.mjs",
  );
  const claimProbeCommand = exactManagedCommand(
    args.claimProbeCommand,
    [args.managedNodePath, claimProbeScriptPath],
    "claimProbeCommand",
  );
  if ("ok" in claimProbeCommand) return claimProbeCommand;
  const codexPayload = managedPayload(args.codexPayload, args.managedDir, "codexPayload");
  if (codexPayload !== null && "ok" in codexPayload) return codexPayload;
  const worktreeCreateExecutable = managedPayload(
    args.worktreeCreatePayload,
    args.managedDir,
    "worktreeCreatePayload",
  );
  if (worktreeCreateExecutable !== null && "ok" in worktreeCreateExecutable) {
    return worktreeCreateExecutable;
  }
  const policyIdentity = createHash("sha256")
    .update(
      JSON.stringify(
        args.authority.location === "lobby"
          ? { mode: "lobby", primaryCheckout: args.authority.primaryCheckout }
          : {
              mode: "writer",
              sessionId: args.authority.sessionId,
              branch: args.authority.branch,
              currentWorktree: args.authority.currentWorktree,
              liveClaimIds: args.authority.liveClaimIds,
            },
      ),
    )
    .digest("hex")
    .slice(0, 24);
  const policyPath = path.join(
    args.managedDir,
    "sessions",
    `${args.authority.location === "lobby" ? "lobby" : "writer"}-${policyIdentity}.json`,
  );
  const hookScriptPath = path.join(args.managedDir, "storytree-codex-containment-hook.mjs");
  const trustedActuatorScriptPath = path.join(
    args.managedDir,
    "storytree-codex-trusted-actuator.ps1",
  );
  const requirementsPath = path.join(path.dirname(args.managedDir), "requirements.toml");
  const policy =
    args.authority.location === "lobby"
      ? {
          schemaVersion: 1,
          mode: "lobby",
          primaryCheckout: args.authority.primaryCheckout,
          gitCommand,
          note: "Evidence only. The administrator-owned hook must independently re-resolve Git.",
        }
      : {
          schemaVersion: 1,
          mode: "writer",
          sessionId: args.authority.sessionId,
          branch: args.authority.branch,
          currentWorktree: args.authority.currentWorktree,
          primaryCheckout: args.authority.primaryCheckout,
          gitCommand,
          claimProbeCommand,
          launchClaimIds: args.authority.liveClaimIds,
          note:
            "Launch evidence only. Claims must be re-read live by the managed hook; this file is not a receipt.",
        };
  const requirementsToml = renderManagedRequirements({
    authority: args.authority,
    managedDir: args.managedDir,
    managedNodePath: args.managedNodePath,
    policyPath,
    hookScriptPath,
  });
  const lobbyAuthority: CodexLobbyTopology = {
    ok: true,
    location: "lobby",
    primaryCheckout: args.authority.primaryCheckout,
    registeredWorktrees: args.authority.registeredWorktrees,
  };
  const lobbyIdentity = createHash("sha256")
    .update(JSON.stringify({ mode: "lobby", primaryCheckout: lobbyAuthority.primaryCheckout }))
    .digest("hex")
    .slice(0, 24);
  const lobbyPolicyPath = path.join(args.managedDir, "sessions", `lobby-${lobbyIdentity}.json`);
  const lobbyPolicyJson = `${JSON.stringify(
    {
      schemaVersion: 1,
      mode: "lobby",
      primaryCheckout: lobbyAuthority.primaryCheckout,
      gitCommand,
      note: "Evidence only. The administrator-owned hook must independently re-resolve Git.",
    },
    null,
    2,
  )}\n`;
  const lobbyRequirementsToml = renderManagedRequirements({
    authority: lobbyAuthority,
    managedDir: args.managedDir,
    managedNodePath: args.managedNodePath,
    policyPath: lobbyPolicyPath,
    hookScriptPath,
  });
  const expected =
    args.authority.location === "lobby"
      ? { location: "lobby", primaryCheckout: args.authority.primaryCheckout }
      : {
          location: "worktree",
          primaryCheckout: args.authority.primaryCheckout,
          currentWorktree: args.authority.currentWorktree,
          sessionId: args.authority.sessionId,
          branch: args.authority.branch,
        };
  const managedClaimProbeScript = buildManagedCodexLiveClaimProbe();
  const managedWorktreeCreateScript = buildManagedCodexWorktreeCreate();
  const worktreeCreatePayload =
    worktreeCreateExecutable === null
      ? null
      : {
          ...worktreeCreateExecutable,
          fixedArguments: [
            {
              path: worktreeCreateScriptPath,
              sha256: createHash("sha256").update(managedWorktreeCreateScript).digest("hex"),
            },
          ],
        };
  const commonActuatorConfig = {
    schemaVersion: 1,
    managedDir: args.managedDir,
    nodePath: args.managedNodePath,
    requirementsPath,
    hookScriptPath,
    claimProbeScriptPath,
    worktreeCreateScriptPath,
    trustedActuatorScriptPath,
    gitCommand,
    claimProbeCommand,
    credentialAclPaths: credentialAclPaths(),
    codexPayload,
    worktreeCreatePayload,
    hookScript: base64(MANAGED_CODEX_HOOK_SCRIPT),
    claimProbeScript: base64(managedClaimProbeScript),
    worktreeCreateScript: base64(managedWorktreeCreateScript),
    lobbyPolicy: {
      policyPath: lobbyPolicyPath,
      policyJson: base64(lobbyPolicyJson),
      requirementsToml: base64(lobbyRequirementsToml),
    },
  };
  const lobbyActuatorConfig = {
    ...commonActuatorConfig,
    activeProfile: CODEX_LOBBY_PROFILE,
    expected: { location: "lobby", primaryCheckout: args.authority.primaryCheckout },
    activePolicy: commonActuatorConfig.lobbyPolicy,
    restoreActuatorScript: null,
  };
  const lobbyActuatorScript = MANAGED_CODEX_TRUSTED_ACTUATOR_TEMPLATE.replace(
    "__CONFIG_BASE64__",
    base64(JSON.stringify(lobbyActuatorConfig)),
  );
  const trustedActuatorConfig =
    args.authority.location === "lobby"
      ? lobbyActuatorConfig
      : {
          ...commonActuatorConfig,
          activeProfile: CODEX_WRITER_PROFILE,
          expected,
          activePolicy: {
            policyPath,
            policyJson: base64(`${JSON.stringify(policy, null, 2)}\n`),
            requirementsToml: base64(requirementsToml),
          },
          restoreActuatorScript: base64(lobbyActuatorScript),
        };
  const trustedActuatorScript = MANAGED_CODEX_TRUSTED_ACTUATOR_TEMPLATE.replace(
    "__CONFIG_BASE64__",
    base64(JSON.stringify(trustedActuatorConfig)),
  );
  const operatorReadme =
    args.authority.location === "lobby"
      ? [
          "GENERATED, NOT INSTALLED. This is the read-only Codex lobby profile.",
          "The bundle includes DATA for an administrator-owned exact actuator for the equivalent of",
          "`storytree worktree create`; the repository command still installs nothing. Bootstrap stays",
          worktreeCreatePayload === null
            ? "fail-closed until device management configures a hash-pinned worktree-create payload."
            : "enabled by the configured hash-pinned managed Node executable plus the generated pinned entry script.",
          "Generic shell,",
          "git, package installation, and arbitrary .git access are not granted. Restart or hand off",
          "under a freshly generated writer profile after the actuator completes.",
          "Managed hook scripts are installed separately by device management.",
          "Do not call containment operational until the three-write live smoke passes.",
          `Trusted actuator artifact: ${trustedActuatorScriptPath}`,
        ].join("\n")
      : [
          "GENERATED, NOT INSTALLED. This profile names exactly one current claimed worktree.",
          "Install requirements and hook/policy files through administrator-owned device management,",
          "then start Codex through a launcher the writer cannot edit, select, or widen. The managed",
          "hook must independently re-resolve Git and re-read the live claim ledger on each covered",
          "write; the session policy JSON is launch evidence, never a claim receipt. The generated hook",
          "does that through the generated standalone live-claim probe installed beside it. Its",
          "keyless impersonated identity is a SELECT-only database principal; missing source ADC,",
          "impersonation authority, or transport fails closed.",
          "Native Windows shell reads do not honor profile deny_read rules. The trusted actuator",
          "therefore refreshes the Codex sandbox account and places explicit filesystem DACL denies",
          "over ADC, Storytree secrets, and Codex subscription auth before any model turn.",
          "Concurrency contract: each policy receipt has a content-addressed session path. The trusted",
          "launcher atomically writes the global requirements, spawns Codex, and waits for SessionStart",
          "before another launch may rewrite them. The deployed Codex must snapshot that selected",
          "profile and hook command at process start; without an attested snapshot, launches serialize",
          "for the entire process lifetime and concurrent writer sessions are not operational.",
          "The linked worktree's .git file and shared Git common directory remain read-only. Commit,",
          "branch, worktree cleanup, and lobby bootstrap therefore need exact trusted actuators.",
          "Before calling this operational, live smoke: lobby write refused; this worktree admitted;",
          "one registered sibling worktree refused. Hook coverage must also be inventoried against the",
          "deployed Codex version because specialised and hosted tools may bypass PreToolUse.",
          `Trusted actuator artifact: ${trustedActuatorScriptPath}. It serializes the full Codex lifetime`,
          "and restores the lobby policy on exit; launch refuses until a hash-pinned Codex payload is configured.",
        ].join("\n");
  return {
    ok: true,
    requirementsPath,
    managedDir: args.managedDir,
    policyPath,
    hookScriptPath,
    claimProbeScriptPath,
    worktreeCreateScriptPath,
    trustedActuatorScriptPath,
    requirementsToml,
    sessionPolicyJson: `${JSON.stringify(policy, null, 2)}\n`,
    managedHookScript: MANAGED_CODEX_HOOK_SCRIPT,
    managedClaimProbeScript,
    managedWorktreeCreateScript,
    trustedActuatorScript,
    operatorReadme,
  };
}

export interface InteractiveCodexHookEvent {
  readonly hook_event_name?: unknown;
  readonly cwd?: unknown;
  readonly tool_name?: unknown;
  readonly tool_input?: unknown;
}

export type InteractiveCodexToolDecision =
  | { readonly allow: true; readonly tool: string; readonly paths: readonly string[] }
  | {
      readonly allow: false;
      readonly tool: string;
      readonly paths: readonly string[];
      readonly reason: string;
    };

function deny(tool: string, paths: readonly string[], reason: string): InteractiveCodexToolDecision {
  return { allow: false, tool, paths, reason };
}

function patchTargets(command: unknown): { ok: true; paths: string[] } | { ok: false; reason: string } {
  if (typeof command !== "string" || command.includes("\0")) {
    return { ok: false, reason: "apply_patch carries ambiguous or unreadable patch text" };
  }
  const lines = command.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "*** Begin Patch" || !lines.includes("*** End Patch")) {
    return { ok: false, reason: "apply_patch carries an ambiguous patch envelope" };
  }
  const paths: string[] = [];
  for (const line of lines) {
    const operation = /^\*\*\* (?:Add File|Delete File|Update File): (.+)$/.exec(line);
    const move = /^\*\*\* Move to: (.+)$/.exec(line);
    if (operation?.[1]) paths.push(operation[1]);
    if (move?.[1]) paths.push(move[1]);
  }
  return paths.length > 0
    ? { ok: true, paths }
    : { ok: false, reason: "apply_patch carries no unambiguous file target" };
}

const PATH_KEY = /^(?:file_?path|path|target|destination|directory|root|cwd|old_?path|new_?path)$/i;

function collectPathFields(value: unknown, key = "", into: string[] = []): string[] {
  if (typeof value === "string") {
    if (PATH_KEY.test(key)) into.push(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathFields(item, key, into);
    return into;
  }
  if (typeof value === "object" && value !== null) {
    for (const [childKey, child] of Object.entries(value)) collectPathFields(child, childKey, into);
  }
  return into;
}

function writerLike(tool: string): boolean {
  return /write|edit|patch|delete|remove|move|rename|create|mkdir|copy/i.test(tool);
}

const READ_ONLY_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "read_file",
  "list_dir",
  "list_files",
  "search_files",
  "view_image",
]);

function normalizeHookTarget(
  cwd: string,
  target: string,
  canonicalize: (target: string) => string,
): { ok: true; path: string } | { ok: false; reason: string } {
  if (target.length === 0 || target.includes("\0") || /[\r\n]/.test(target)) {
    return { ok: false, reason: "tool target is malformed or ambiguous" };
  }
  try {
    return { ok: true, path: canonicalize(path.isAbsolute(target) ? target : path.resolve(cwd, target)) };
  } catch (error) {
    return { ok: false, reason: `tool target could not be canonicalised: ${String(error)}` };
  }
}

/**
 * Pure managed-hook decision. Its caller must supply a branch and claim set read at this hook
 * invocation — cached launch policy is deliberately insufficient.
 */
export function decideInteractiveCodexToolUse(args: {
  readonly topology: CodexWorktreeTopology;
  readonly claims: readonly ClaimDocT[];
  readonly now: Date;
  readonly currentBranch: string;
  readonly event: InteractiveCodexHookEvent | unknown;
  readonly canonicalize: (target: string) => string;
}): InteractiveCodexToolDecision {
  const event = args.event;
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return deny("(unknown)", [], "malformed managed hook input");
  }
  const hook = event as InteractiveCodexHookEvent;
  const tool = typeof hook.tool_name === "string" ? hook.tool_name : "(unknown)";
  if (hook.hook_event_name === "PermissionRequest") {
    return deny(tool, [], "permission widening is unavailable under the strict Storytree profile");
  }
  if (hook.hook_event_name !== "PreToolUse" && hook.hook_event_name !== "SessionStart") {
    return deny(tool, [], "unexpected managed hook event");
  }
  if (args.currentBranch !== args.topology.branch) {
    return deny(tool, [], `current branch changed from ${args.topology.branch} to ${args.currentBranch}`);
  }
  const authority = authorizeCodexWriter(args.topology, args.claims, args.now);
  if (!authority.ok) return deny(tool, [], authority.reason);
  if (typeof hook.cwd !== "string") return deny(tool, [], "hook input carries no canonical working directory");
  let cwd: string;
  try {
    cwd = args.canonicalize(hook.cwd);
  } catch (error) {
    return deny(tool, [], `working directory could not be canonicalised: ${String(error)}`);
  }
  if (!insidePath(authority.currentWorktree, cwd)) {
    return deny(tool, [cwd], "tool working directory is outside the current claimed worktree");
  }
  if (hook.hook_event_name === "SessionStart") return { allow: true, tool, paths: [] };
  if (READ_ONLY_TOOLS.has(tool)) return { allow: true, tool, paths: [] };

  // Shell/unified exec can express paths in a programming language, not a stable JSON field. The
  // hook checks its cwd and live authority; the exact/subtree OS profile is what contains writes.
  if (tool === "Bash" || tool === "exec_command" || tool === "unified_exec") {
    return { allow: true, tool, paths: [] };
  }

  let rawTargets: string[];
  if (tool === "apply_patch") {
    const input = hook.tool_input as { command?: unknown } | null;
    const parsed = patchTargets(input?.command);
    if (!parsed.ok) return deny(tool, [], parsed.reason);
    rawTargets = parsed.paths;
  } else {
    rawTargets = collectPathFields(hook.tool_input);
    if (writerLike(tool) && rawTargets.length === 0) {
      return deny(tool, [], `write-like tool '${tool}' carries no extractable target`);
    }
  }

  const paths: string[] = [];
  for (const target of rawTargets) {
    const normalized = normalizeHookTarget(cwd, target, args.canonicalize);
    if (!normalized.ok) return deny(tool, paths, normalized.reason);
    paths.push(normalized.path);
    if (!insidePath(authority.currentWorktree, normalized.path)) {
      return deny(tool, paths, `'${target}' resolves outside the current claimed worktree`);
    }
    const relative = comparable(normalized.path).slice(comparable(authority.currentWorktree).length + 1);
    if (relative === ".git" || relative.startsWith(".git/") || relative === ".codex" || relative.startsWith(".codex/")) {
      return deny(tool, paths, `'${target}' resolves to protected repository/session metadata`);
    }
  }
  return { allow: true, tool, paths };
}

export interface CodexContainmentIo {
  readonly probeGit: () => CodexGitProbe;
  readonly canonicalize: (target: string) => string;
  readonly codexVersion: () => string;
  readonly managedDir: () => string;
  readonly managedNodePath: () => string;
  /** Test/deployment seam for the administrator-owned exact Git executable. */
  readonly gitCommand?: () => readonly string[];
  /** Present for proof that this repository command never installs ProgramData. */
  readonly writeFile: (target: string, body: string) => void;
}

function canonicalizeExistingPrefix(target: string): string {
  let candidate = path.resolve(target);
  const missing: string[] = [];
  while (!existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error(`no existing ancestor for ${target}`);
    missing.unshift(path.basename(candidate));
    candidate = parent;
  }
  return path.join(realpathSync.native(candidate), ...missing);
}

export const defaultCodexContainmentIo: CodexContainmentIo = {
  probeGit: () => ({
    topLevel: (execFileSync("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], {
      encoding: "utf8",
    }) as string).trim(),
    gitDir: (execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
      encoding: "utf8",
    }) as string).trim(),
    commonDir: (execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
    }) as string).trim(),
    branch: (execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }) as string).trim(),
    worktreeList: execFileSync("git", ["worktree", "list", "--porcelain"], {
      encoding: "utf8",
    }) as string,
  }),
  canonicalize: canonicalizeExistingPrefix,
  codexVersion: () => {
    try {
      return (execFileSync("codex", ["--version"], { encoding: "utf8" }) as string).trim();
    } catch {
      // WindowsApps can expose a `codex.exe` path that this non-AppContainer child cannot execute.
      // The factory's pinned CLI is the launcher payload in that case, so inspect THAT executable
      // rather than treating an inaccessible desktop alias as an unknown/old version.
      const root = (execFileSync(
        "git",
        ["rev-parse", "--path-format=absolute", "--show-toplevel"],
        { encoding: "utf8" },
      ) as string).trim();
      const pinned = path.join(
        root,
        "packages",
        "agent",
        "node_modules",
        "@openai",
        "codex",
        "bin",
        "codex.js",
      );
      return (execFileSync(process.execPath, [pinned, "--version"], {
        encoding: "utf8",
      }) as string).trim();
    }
  },
  managedDir: () => path.join(process.env["ProgramData"] ?? "C:\\ProgramData", "OpenAI", "Codex", "Storytree"),
  managedNodePath: () => process.execPath,
  writeFile: () => {
    throw new Error("the repository containment command never writes administrator-owned files");
  },
};

export interface CodexContainmentLedger {
  claimsBySession(sessionId: string, opts?: { includeStale?: boolean }): Promise<ClaimDocT[]>;
}

export async function codexSessionContainmentCommand(
  opts: { readonly write?: boolean; readonly help?: boolean },
  deps: { readonly ledger: CodexContainmentLedger | null; readonly now: () => Date },
  io: CodexContainmentIo = defaultCodexContainmentIo,
): Promise<Envelope> {
  const next = ["storytree write-authority codex --pg", "storytree worktree create --help"];
  if (opts.help) {
    return {
      ok: true,
      body: [
        "storytree write-authority codex — DRY-RUN the ADR-0355 managed Codex bundle.",
        "",
        "Run in the lobby for a read-only bootstrap plan, or in a currently claimed worktree with",
        "--pg for the single-worktree writer plan. This command never installs ProgramData; managed",
        "requirements, hooks, and the Windows profile are administrator-owned.",
      ].join("\n"),
      next,
    };
  }
  if (opts.write) {
    return {
      ok: false,
      body:
        "REFUSED — machine-wide Codex containment installation is an administrator-owned action. " +
        "This repository command generates a dry run only and cannot write or widen ProgramData.",
      next,
    };
  }
  let topology: TopologyResult;
  let version: string;
  try {
    topology = resolveCodexSessionTopology(io.probeGit(), { canonicalize: io.canonicalize });
    version = io.codexVersion();
  } catch (error) {
    return { ok: false, body: `could not probe Codex/Git containment prerequisites: ${String(error)}`, next };
  }
  if (!topology.ok) return { ok: false, body: `REFUSED — ${topology.reason}`, next };

  let authority: CodexLobbyTopology | CodexWriterAuthority;
  if (topology.location === "lobby") {
    authority = topology;
  } else {
    if (deps.ledger === null) {
      return {
        ok: false,
        body: "REFUSED — a writer bundle requires the live claim ledger (--pg); no claim, no writer profile.",
        next,
      };
    }
    const claims = await deps.ledger.claimsBySession(topology.sessionId, { includeStale: true });
    const decided = authorizeCodexWriter(topology, claims, deps.now());
    if (!decided.ok) return { ok: false, body: `REFUSED — ${decided.reason}`, next };
    authority = decided;
  }

  const bundle = buildCodexContainmentBundle({
    authority,
    codexVersion: version,
    managedDir: io.managedDir(),
    managedNodePath: io.managedNodePath(),
    ...(io.gitCommand === undefined ? {} : { gitCommand: io.gitCommand() }),
  });
  if (!bundle.ok) return { ok: false, body: `REFUSED — ${bundle.reason}`, next };
  return {
    ok: true,
    body: [
      "DRY RUN — generated, not installed.",
      "",
      `requirements.toml: ${bundle.requirementsPath}`,
      `managed hook:      ${bundle.hookScriptPath} (installed separately by device management)`,
      `live claim probe:  ${bundle.claimProbeScriptPath} (installed separately by device management)`,
      `worktree creator:  ${bundle.worktreeCreateScriptPath} (installed separately by device management)`,
      `trusted actuator:  ${bundle.trustedActuatorScriptPath} (installed separately by device management)`,
      `session policy:    ${bundle.policyPath}`,
      "",
      bundle.operatorReadme,
      "",
      "--- requirements.toml ---",
      bundle.requirementsToml,
      `--- ${path.basename(bundle.policyPath)} ---`,
      bundle.sessionPolicyJson.trimEnd(),
      "--- storytree-codex-containment-hook.mjs ---",
      bundle.managedHookScript.trimEnd(),
      "--- storytree-codex-live-claim-probe.mjs ---",
      bundle.managedClaimProbeScript.trimEnd(),
      "--- storytree-codex-worktree-create.mjs ---",
      bundle.managedWorktreeCreateScript.trimEnd(),
      "--- storytree-codex-trusted-actuator.ps1 ---",
      bundle.trustedActuatorScript.trimEnd(),
    ].join("\n"),
    next,
  };
}
