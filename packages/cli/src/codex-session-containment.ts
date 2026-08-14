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

import type { ClaimDocT, ClaimResult } from "@storytree/notice-board";
import { claimGrade, liveClaims } from "@storytree/notice-board";

import type { Envelope } from "./envelope.js";
import { buildManagedCodexLiveClaimProbe } from "./codex-live-claim-probe-bundle.js";
import { buildManagedCodexWorktreeCreate } from "./codex-worktree-create-bundle.js";

export const MIN_CODEX_PERMISSION_PROFILE_VERSION = "0.138.0";
export const CODEX_WRITER_PROFILE = "storytree_codex_current";
export const CODEX_PHASE_AUTHOR_PROFILE = "storytree_codex_phase_author";
export const CODEX_LOBBY_PROFILE = "storytree_codex_lobby";

/**
 * Where repository-minted worktrees live, relative to the primary checkout. ADR-0364 D1 grants this
 * whole area once instead of naming one worktree per launch, so the path has to be derivable without
 * a session — it is, because the primary checkout is the one thing a standing profile may pin.
 */
export const CODEX_WORKTREES_SEGMENTS: readonly string[] = [".claude", "worktrees"];

export function codexWorktreesRoot(primaryCheckout: string): string {
  return path.join(primaryCheckout, ...CODEX_WORKTREES_SEGMENTS);
}

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
  /**
   * The exact `[managedNode, pinnedPnpm]` prefix a contained task runs workspace commands through, or
   * null when no toolchain payload is configured. Null means a contained task cannot run `pnpm`
   * at all — report that, never paper over it.
   */
  readonly toolchainCommand: readonly string[] | null;
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
  /**
   * Optional administrator-owned, hash-pinned SINGLE-FILE pnpm distribution (`dist/pnpm.cjs`) which
   * the managed Node runs directly. See {@link codexToolchainCommand} for why this is one file and
   * not Corepack.
   */
  readonly toolchainPayload?: Readonly<{ path: string; sha256: string }>;
}

/**
 * The exact command a contained task uses to reach the repository toolchain: managed Node, then the
 * pinned single-file pnpm distribution. Everything after it is ordinary pnpm argv.
 *
 * **Corepack is deliberately NOT what ships, and the increment that asked for "pnpm/Corepack" was
 * wrong about the mechanism rather than about the need.** On this host `pnpm` is a Corepack shim that
 * runs `node <corepack>/dist/pnpm.js`, and Corepack RESOLVES the version in `packageManager` by
 * downloading it into a per-user cache. A contained task can do neither: the standing writer profile
 * sets `network.enabled = false`, and the Corepack cache lives outside the granted worktrees area. So
 * shipping Corepack would ship a downloader that cannot download into a directory it cannot write.
 *
 * pnpm's own `dist/pnpm.cjs` is a single self-contained file that needs no network, no cache and no
 * PATH entry — which also makes it the only shape `Assert-PinnedPayload` can pin in one hash. Proven
 * on the managed payload Node (`node.exe dist/pnpm.cjs -C <worktree> storytree doctor` completed a
 * real workspace command, tsx resolution included).
 *
 * The version is NOT chosen here: it must be the one `packageManager` names, because the workspace's
 * lockfile is what it has to agree with. Pinning a different pnpm would be a silent toolchain
 * divergence that no gate rung would notice.
 */
export function codexToolchainCommand(
  managedNodePath: string,
  toolchainPayloadPath: string,
): readonly string[] {
  return [managedNodePath, toolchainPayloadPath];
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

/**
 * The narrow ledger seam the lobby bootstrap needs — structurally `PgClaimStore.upgrade`, kept as an
 * interface so the promotion is provable without a database.
 */
export interface BootstrapClaimLedger {
  upgrade(
    unitId: string,
    sessionId: string,
    opts: { branch: string; intent: string },
  ): Promise<ClaimResult>;
}

export type WriterPromotionResult =
  | { readonly ok: true; readonly promoted: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Promote a freshly minted session's bootstrap claims from `exploring` to `work`.
 *
 * `storytree worktree create` takes EXPLORING claims (ADR-0200 D3: the shared "someone is reading
 * here" row), but {@link authorizeCodexWriter} admits a writer only on a live WORK claim naming this
 * session and branch. Nothing bridged the two, so a bootstrap that "succeeded" handed back a worktree
 * whose writer could never be authorised — the ceremony's own refusal, arriving one process too late.
 * The Claude flow promotes via a separate `noticeboard declare`; the lobby actuator has no second
 * turn to spend, so the promotion is part of the same fail-closed operation.
 *
 * Fail-closed throughout: a throw, a queued arm, a grade that did not land on `work`, or a claim
 * stamped to a different session/branch all REFUSE. A partially promoted set is reported as a
 * refusal naming what did land, because a caller that reads it as success would launch a writer the
 * hook must then refuse per-write.
 */
export async function promoteBootstrapClaimsToWork(args: {
  readonly ledger: BootstrapClaimLedger;
  readonly nodes: readonly string[];
  readonly sessionId: string;
  readonly branch: string;
  readonly intent: string;
}): Promise<WriterPromotionResult> {
  if (args.nodes.length === 0) {
    return { ok: false, reason: "no claimed node to promote — the bootstrap claimed nothing" };
  }
  if (args.sessionId.trim().length === 0 || args.branch.trim().length === 0) {
    return { ok: false, reason: "promotion needs a non-blank session identity and branch" };
  }

  const promoted: string[] = [];
  const refuse = (detail: string): WriterPromotionResult => ({
    ok: false,
    reason:
      `${detail}` +
      (promoted.length > 0
        ? ` (already promoted: ${promoted.join(", ")} — release them or re-run the bootstrap)`
        : ""),
  });

  for (const unitId of args.nodes) {
    let result: ClaimResult;
    try {
      result = await args.ledger.upgrade(unitId, args.sessionId, {
        branch: args.branch,
        intent: args.intent,
      });
    } catch (error) {
      return refuse(
        `work-claim promotion on "${unitId}" FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!result.acquired) {
      return refuse(
        `work-claim promotion on "${unitId}" REFUSED — held by ${result.heldBy.sessionId} ` +
          `(branch ${result.heldBy.branch}, intent "${result.heldBy.intent}")`,
      );
    }
    if (claimGrade(result.claim) !== "work") {
      return refuse(
        `work-claim promotion on "${unitId}" returned grade ${claimGrade(result.claim)}, not work`,
      );
    }
    if (result.claim.sessionId !== args.sessionId || result.claim.branch !== args.branch) {
      return refuse(
        `work-claim promotion on "${unitId}" landed on ${result.claim.sessionId}/${result.claim.branch}, ` +
          `not the minted ${args.sessionId}/${args.branch}`,
      );
    }
    promoted.push(unitId);
  }

  return { ok: true, promoted };
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
    // The CREDENTIAL is `.codex/auth.json`, not the whole `.codex` tree. Denying the tree also hid
    // the skills/plugins the same directory advertises, so a contained task could not read the
    // instructions it was told to follow — a cost with no matching protection, and one the ACL half
    // (`credentialAclPaths`) never paid: it has always denied `auth.json` alone. The two halves now
    // agree, and the credential stays unreadable either way.
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

/**
 * The ONE standing managed requirements file (ADR-0364 D1).
 *
 * It no longer varies with the caller's location, because varying it is exactly the policy window
 * ADR-0364 removes: under ADR-0355 the actuator installed a writer file naming one worktree and
 * reverted to a lobby file in its `finally`, so write authority lived only as long as the launcher.
 * All three profiles are now declared together and installed once.
 *
 * `default_permissions` is the writer profile, and that does NOT widen the lobby (D3): the writer
 * profile still `extends = ":read-only"` and its only write grant is the worktrees area, which the
 * lobby's own files are not inside. The lobby profile stays declared so the read-only wall remains an
 * explicit statement rather than an inference from an absent grant.
 *
 * The per-worktree `.git`/`.codex` denies survive the change for every worktree registered when the
 * file is generated. A worktree minted LATER is covered by the managed hook alone — that is the
 * accepted cost ADR-0364 names, not an oversight, and it is why the hook may not be weakened.
 */
function renderManagedRequirements(args: {
  authority: CodexLobbyTopology | CodexWriterAuthority;
  managedDir: string;
  managedNodePath: string;
  policyPath: string;
  hookScriptPath: string;
}): string {
  const profile = CODEX_WRITER_PROFILE;
  const worktreesRoot = codexWorktreesRoot(args.authority.primaryCheckout);
  const knownWorktrees = args.authority.registeredWorktrees.filter(
    (root) => insidePath(worktreesRoot, root) && !samePath(worktreesRoot, root),
  );
  const command = (mode: string) =>
    safeHookCommand(args.managedNodePath, args.hookScriptPath, mode, args.policyPath);
  const lines = [
    "# Generated by Storytree for ADR-0355 as amended by ADR-0364 (standing worktrees grant).",
    "# Administrator-owned; do not place in the repository. Installed ONCE — never swapped around a",
    "# launcher. The worktree a session may write in is decided by its LIVE CLAIM, in the managed",
    "# hook, on every covered tool call. That hook is the only fence; weakening it weakens everything.",
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
    `${CODEX_PHASE_AUTHOR_PROFILE} = true`,
    `${CODEX_LOBBY_PROFILE} = true`,
    "",
    `[permissions.${profile}]`,
    `description = ${tomlString(
      "Storytree: write only in the worktree this session holds a live work claim on.",
    )}`,
    'extends = ":read-only"',
    "",
    `[permissions.${profile}.filesystem]`,
    '":minimal" = "read"',
    ...renderCredentialDenies(profile),
    "",
    `[permissions.${profile}.filesystem.${tomlString(worktreesRoot)}]`,
    '"." = "write"',
    ...knownWorktrees.flatMap((worktree) => [
      "",
      `[permissions.${profile}.filesystem.${tomlString(worktree)}]`,
      '".git" = "deny"',
      '".codex" = "deny"',
    ]),
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
    ...knownWorktrees.flatMap((worktree) => [
      "",
      `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}.filesystem.${tomlString(worktree)}]`,
      '".gate-logs/codex-replicas" = "write"',
    ]),
    "",
    `[permissions.${CODEX_PHASE_AUTHOR_PROFILE}.network]`,
    "enabled = false",
    "",
    `[permissions.${CODEX_LOBBY_PROFILE}]`,
    `description = ${tomlString(
      "Storytree lobby: read-only. Retained as the explicit statement of ADR-0364 D3.",
    )}`,
    'extends = ":read-only"',
    "",
    `[permissions.${CODEX_LOBBY_PROFILE}.filesystem]`,
    '":minimal" = "read"',
    ...renderCredentialDenies(CODEX_LOBBY_PROFILE),
    "",
    `[permissions.${CODEX_LOBBY_PROFILE}.network]`,
    "enabled = false",
  ];

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
  const claudeSlot = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)\s*$/.exec(topLevel);
  const sessionId = claudeSlot ? claudeSlot[1] : path.basename(gitDir.replace(/[/\\]+$/, ""));
  return { location, topLevel, gitDir, commonDir, primaryCheckout, branch, sessionId, registeredWorktrees: registered };
}

// ADR-0364 D1: the standing policy pins the primary checkout and the granted worktrees area, and
// NOTHING session-shaped. It deliberately does not carry a worktree, branch, or session id, because
// under a standing grant those are properties of the process the hook is being called for, not of an
// install performed earlier — and a pin baked in at install time would either refuse every session
// but one, or (far worse) be trusted as the narrowing while the process sat somewhere else.
function assertExpectedTopology(policy, observed) {
  if (!samePath(policy.primaryCheckout, observed.primaryCheckout)) {
    throw new Error("primary checkout changed between install and hook");
  }
  if (observed.location === "worktree" && !insidePath(policy.worktreesRoot, observed.topLevel)) {
    throw new Error("current worktree is outside the granted worktrees area");
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
    sessionId: observed.sessionId,
    observedTopology: observed,
    event,
  });
  const parsed = JSON.parse(run(probe, [], request));
  if (!parsed || !Array.isArray(parsed.claims)) throw new Error("live claim probe returned malformed JSON");
  return parsed.claims;
}

// The claim is asked about the OBSERVED session identity, which Git derives from the worktree this
// process is actually standing in. That is what makes the claim the narrowing (ADR-0364 D2): a
// session that walks into a sibling worktree resolves to the SIBLING's identity, which its claim
// does not name, so it is refused there even though the OS profile grants the whole area.
function authority(observed, claims) {
  const held = claims.filter((claim) => claim && claim.sessionId === observed.sessionId &&
    claim.grade === "work" && claim.branch === observed.branch);
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
  const auth = authority(observed, claims);
  if (!auth.ok) return { allow: false, tool, paths: [], reason: auth.reason };
  // The writable root is the worktree the CLAIM admits, re-derived here — never a path the policy
  // file carried in from install time. Under ADR-0364's standing grant the OS profile permits the
  // whole worktrees area, so this line is the sibling-worktree fence; reading it from the policy
  // would silently widen the fence to every worktree and nothing else would catch it.
  const claimedWorktree = observed.topLevel;
  if (typeof event.cwd !== "string") return { allow: false, tool, paths: [], reason: "hook input carries no working directory" };
  const cwd = canonicalize(event.cwd);
  if (!insidePath(claimedWorktree, cwd)) {
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
    if (!insidePath(claimedWorktree, resolved)) {
      return { allow: false, tool, paths, reason: "target resolves outside the current claimed worktree" };
    }
    const rel = comparable(resolved).slice(comparable(claimedWorktree).length + 1);
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
  // One standing policy serves both locations, so WHICH decision applies is read from the observed
  // topology rather than from a mode chosen when the file was installed (ADR-0364 D1/D3). A process
  // in the lobby gets the read-only decision; a process in a worktree must produce a live claim.
  const inWorktree = observed.location === "worktree";
  const claims = inWorktree ? readLiveClaims(policy, observed, event) : [];
  const decision = inWorktree ? decideWriter(policy, observed, claims, event) : decideLobby(event);
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
  # ADR-0364 D4: the actuator no longer hosts a session, so it never verifies a session's worktree,
  # branch, or identity. It runs from the lobby, and the lobby is all it pins. The per-session
  # verification lives where the authority now lives — in the managed hook, per tool call.
  if ($Observed.location -ne $Expected.location) { Fail "Git topology does not match the selected policy" }
  if (-not (Same-Path $Observed.primaryCheckout $Expected.primaryCheckout)) { Fail "primary checkout changed from generated policy" }
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
function New-WorktreeScratch([string] $Worktree) {
  # The profile grants ":minimal" read plus write under the worktrees area ONLY, so the inherited
  # per-user TEMP is not writable by the contained process. tsx and Playwright both create scratch
  # eagerly (Playwright's "playwright-artifacts-*"), so without a writable TEMP inside the grant the
  # toolchain fails at launch rather than at any boundary the profile is trying to enforce. Keeping
  # scratch INSIDE the worktree means it needs no second grant and dies with the worktree.
  #
  # ADR-0364 D4 removed the launcher that used to SET $env:TEMP for a child process, so this creates
  # the directory and nothing more: a task with no parent of ours must point TEMP/TMP at it itself,
  # before running the toolchain. The operator readme states that step, and it is exercised by the
  # codex-managed-toolchain-payload increment, where a workspace command first genuinely runs.
  $Scratch = Join-Path $Worktree '.storytree-scratch'
  [IO.Directory]::CreateDirectory($Scratch) | Out-Null
  return $Scratch
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
  if ($RawArgs.Count -eq 0) { Fail "expected exactly bootstrap or install" }
  $Verb = $RawArgs[0]
  if ($Verb -eq 'bootstrap') {
    if ($RawArgs.Count -ne 5 -or $RawArgs[1] -ne '--node' -or $RawArgs[3] -ne '--intent') { Fail "exact grammar is bootstrap --node <capability> --intent <text>" }
    $Node = $RawArgs[2]; $Intent = $RawArgs[4]
    if ($Node -notmatch '^[a-z0-9][a-z0-9-]{1,127}$') { Fail "--node must be one capability identifier" }
    if ([string]::IsNullOrWhiteSpace($Intent) -or $Intent.Length -gt 1024 -or $Intent.IndexOf([char]0) -ge 0 -or $Intent.IndexOf([char]10) -ge 0 -or $Intent.IndexOf([char]13) -ge 0) { Fail "--intent must be one non-empty line of at most 1024 characters" }
  } elseif ($Verb -eq 'install') {
    if ($RawArgs.Count -ne 1) { Fail "exact grammar is install, with no arguments" }
  } else { Fail "unknown subcommand '$Verb'" }

  $Mutex = [Threading.Mutex]::new($false, 'Global\StorytreeCodexContainmentLifecycle')
  $HasMutex = $Mutex.WaitOne()
  if (-not $HasMutex) { Fail "could not acquire lifecycle mutex" }

  if ($Verb -eq 'bootstrap') {
    if ($Config.expected.location -ne 'lobby') { Fail "bootstrap is available only from a generated lobby policy" }
    $Payload = Assert-PinnedCommand 'worktree-create payload' $Config.worktreeCreatePayload
    # The toolchain pin is verified BEFORE any work, so a bad hash costs no mint. Its ABSENCE is not
    # fatal: minting needs no pnpm (the creator payload runs as the operator), and a host that has not
    # installed the toolchain yet should still get a worktree. What must never happen is a task being
    # left to GUESS, so an unconfigured toolchain is reported as null rather than omitted.
    $Toolchain = $null
    if ($null -ne $Config.toolchainPayload) {
      $ToolchainPath = Assert-PinnedPayload 'toolchain payload' $Config.toolchainPayload
      $Toolchain = @([string]$Config.nodePath, $ToolchainPath)
    }
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
    $Scratch = New-WorktreeScratch $Created.topLevel
    # Everything the task needs to actually work, in the one envelope the lifecycle already hands
    # back: where it may write, where its scratch is (ADR-0364 D4 left setting TEMP/TMP to the task),
    # and the exact toolchain command. With no launcher there is no environment to inherit, so an
    # envelope that named only the worktree would hand back a workspace nothing could build.
    [Console]::Out.WriteLine((@{
      topLevel = $Created.topLevel; gitDir = $Created.gitDir; commonDir = $Created.commonDir;
      primaryCheckout = $Created.primaryCheckout; branch = $Created.branch;
      location = $Created.location; sessionId = $Created.sessionId;
      scratch = $Scratch; toolchainCommand = $Toolchain
    } | ConvertTo-Json -Depth 4 -Compress))
  } else {
    # ADR-0364 D1/D4: install the STANDING policy and exit. There is no policy window, no nested
    # Codex child, and nothing to revert in a finally block — write authority is no longer this
    # process's lifetime. What a session may write is decided per tool call by the managed hook
    # from its live claim, which is why installing this file is now the actuator's whole job here.
    $ObservedLobby = Probe-Git ([string]$Config.expected.primaryCheckout)
    Assert-ExpectedTopology $ObservedLobby $Config.expected
    $CodexPayload = Assert-PinnedPayload 'Codex payload' $Config.codexPayload
    Install-Policy $Config.standingPolicy
    # Materialise/refresh Codex's restricted local account without a model turn, then carve
    # credential paths out at the Windows ACL layer. Native Windows deny_read alone does not bind
    # shell subprocesses, so the DACL is the physical read boundary. These are machine state, so
    # they are established once at install rather than around each session.
    & $CodexPayload sandbox --include-managed-config -P ([string]$Config.activeProfile) -C $ObservedLobby.topLevel -- $env:ComSpec /d /c exit 0
    if ($LASTEXITCODE -ne 0) { Fail "Codex sandbox setup attestation failed" }
    Protect-SandboxCredentials
    Scrub-WriterTokens
    [Console]::Out.WriteLine((@{ installed = $true; requirementsPath = [string]$Config.requirementsPath; profile = [string]$Config.activeProfile } | ConvertTo-Json -Compress))
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
  const toolchainExecutable = managedPayload(args.toolchainPayload, args.managedDir, "toolchainPayload");
  if (toolchainExecutable !== null && "ok" in toolchainExecutable) return toolchainExecutable;
  const toolchainCommand =
    toolchainExecutable === null
      ? null
      : codexToolchainCommand(args.managedNodePath, toolchainExecutable.path);
  const worktreesRoot = codexWorktreesRoot(args.authority.primaryCheckout);
  // ADR-0364 D1: ONE standing policy, so its identity is derived from the two things a standing
  // install may pin and from nothing session-shaped. Two sessions therefore resolve the SAME path,
  // which is the point — under ADR-0355 a per-session receipt existed so the actuator could swap it
  // around a launcher, and there is no longer a launcher to swap it around.
  const policyIdentity = createHash("sha256")
    .update(JSON.stringify({ mode: "standing", primaryCheckout: args.authority.primaryCheckout, worktreesRoot }))
    .digest("hex")
    .slice(0, 24);
  const policyPath = path.join(args.managedDir, "sessions", `standing-${policyIdentity}.json`);
  const hookScriptPath = path.join(args.managedDir, "storytree-codex-containment-hook.mjs");
  const trustedActuatorScriptPath = path.join(
    args.managedDir,
    "storytree-codex-trusted-actuator.ps1",
  );
  const requirementsPath = path.join(path.dirname(args.managedDir), "requirements.toml");
  const policy = {
    schemaVersion: 2,
    mode: "standing",
    primaryCheckout: args.authority.primaryCheckout,
    worktreesRoot,
    gitCommand,
    claimProbeCommand,
    note:
      "Standing grant (ADR-0364). This file carries NO worktree, branch, or session identity: which " +
      "worktree a process may write in is decided by the live claim, re-read by the managed hook on " +
      "every covered tool call. It is not a receipt, and it is not the narrowing.",
  };
  const requirementsToml = renderManagedRequirements({
    authority: args.authority,
    managedDir: args.managedDir,
    managedNodePath: args.managedNodePath,
    policyPath,
    hookScriptPath,
  });
  // The actuator runs from the LOBBY for both of its verbs now (ADR-0364 D4), so there is one
  // expectation and it never carries a session. `bootstrap` mints a worktree there; `install` writes
  // the standing policy there. Neither hosts a Codex session, so neither needs to know about one.
  const expected = { location: "lobby", primaryCheckout: args.authority.primaryCheckout };
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
  const trustedActuatorConfig = {
    schemaVersion: 2,
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
    toolchainPayload: toolchainExecutable,
    hookScript: base64(MANAGED_CODEX_HOOK_SCRIPT),
    claimProbeScript: base64(managedClaimProbeScript),
    worktreeCreateScript: base64(managedWorktreeCreateScript),
    activeProfile: CODEX_WRITER_PROFILE,
    expected,
    // ONE policy, installed once. There is no `activePolicy`/`lobbyPolicy` pair and no
    // `restoreActuatorScript`, because there is nothing to swap back to (ADR-0364 D1).
    standingPolicy: {
      policyPath,
      policyJson: base64(`${JSON.stringify(policy, null, 2)}\n`),
      requirementsToml: base64(requirementsToml),
    },
  };
  const trustedActuatorScript = MANAGED_CODEX_TRUSTED_ACTUATOR_TEMPLATE.replace(
    "__CONFIG_BASE64__",
    base64(JSON.stringify(trustedActuatorConfig)),
  );
  const operatorReadme = [
    "GENERATED, NOT INSTALLED. ONE standing Codex profile (ADR-0364), installed once and never",
    "swapped around a launcher. It grants write over the worktrees area, not over one named worktree.",
    "",
    "THE MANAGED HOOK IS THE ONLY FENCE. The OS profile deliberately permits every worktree under",
    "the granted area; which one a session may write in is decided by its LIVE WORK CLAIM, re-read by",
    "the hook on each covered tool call from the Git identity of the worktree the process is actually",
    "standing in. That is wider at the coarse layer than ADR-0355's per-worktree profile, and ADR-0364",
    "accepts the cost knowingly: if the hook is bypassed or ever fails open, the blast radius is every",
    "worktree rather than one. Anyone weakening the hook is weakening everything — review it that way.",
    "The session policy JSON carries no worktree, branch, or session id, and is not a claim receipt.",
    "",
    "The lobby stays read-only, and that is the wall that matters. The standing profile still extends",
    "\":read-only\" and its only write grant is the worktrees area, which the lobby's own files are not",
    "inside; the lobby profile stays declared so the wall is an explicit statement, not an inference.",
    "",
    "The generated hook reads claims through the standalone live-claim probe installed beside it. Its",
    "keyless impersonated identity is a SELECT-only database principal; missing source ADC,",
    "impersonation authority, or transport fails closed.",
    "Native Windows shell reads do not honor profile deny_read rules. The trusted actuator therefore",
    "refreshes the Codex sandbox account and places explicit filesystem DACL denies over ADC,",
    "Storytree secrets, and Codex subscription auth. Those are machine state, applied once at install.",
    "",
    "Trusted actuator verbs, both run from the lobby, neither hosting a Codex session:",
    `  install    — writes the standing requirements/policy/hook set to ${requirementsPath}.`,
    "  bootstrap  — mints one claimed worktree and its .storytree-scratch directory. " +
      (worktreeCreatePayload === null
        ? "Fail-closed until device management configures a hash-pinned worktree-create payload."
        : "Enabled by the configured hash-pinned managed Node executable plus the generated pinned entry script."),
    "There is no `launch` verb and no nested Codex child: write authority is no longer a process",
    "lifetime, so nothing needs to hold a policy window open.",
    "",
    "SCRATCH IS NOW THE TASK'S OWN FIRST STEP. With no launcher there is no parent to set TEMP/TMP,",
    "and the inherited per-user TEMP is outside the grant, so tsx and Playwright fail at launch rather",
    "than at any boundary. A contained task must point TEMP and TMP at <its worktree>/.storytree-scratch",
    "(bootstrap creates it) before running the toolchain.",
    "",
    "THE TOOLCHAIN IS A PINNED SINGLE FILE, NOT COREPACK, and that is a correction rather than a",
    "shortcut. On this host `pnpm` is a Corepack shim, and Corepack RESOLVES the version named in",
    "`packageManager` by downloading it into a per-user cache — so shipping Corepack ships a downloader",
    "into a profile with `network.enabled = false` and no write access to that cache. pnpm's own",
    "`dist/pnpm.cjs` is self-contained: no network, no cache, no PATH entry, and one hash to pin.",
    toolchainCommand === null
      ? "  NOT CONFIGURED — a contained task cannot run any pnpm workspace command until device"
      : `  ${toolchainCommand.join(" ")} <ordinary pnpm argv>`,
    toolchainCommand === null
      ? "  management installs a hash-pinned dist/pnpm.cjs under the managed payloads directory."
      : "  Invoke it with -C <worktree>, or from the worktree as cwd. The pinned version MUST be the one",
    toolchainCommand === null
      ? "  Until then `pnpm gate` and `pnpm storytree …` are unreachable from a claimed worktree."
      : "  `packageManager` names: a different pnpm would disagree with the lockfile silently.",
    "",
    "Per-worktree \".git\"/\".codex\" denies are emitted for every worktree registered when this file is",
    "generated; a worktree minted later is covered by the hook alone. The shared Git common directory",
    "stays read-only, so commit, branch, worktree cleanup, and lobby bootstrap still need exact",
    "trusted actuators — `git worktree add` writes into the lobby's .git/worktrees, which is why",
    "bootstrap remains a privileged step rather than something a contained task performs.",
    "",
    "Before calling this operational, live smoke: lobby write refused; a claimed worktree admitted; a",
    "registered SIBLING worktree refused under a profile that permits it at the OS layer. Hook coverage",
    "must also be inventoried against the deployed Codex version because specialised and hosted tools",
    "may bypass PreToolUse.",
    `Trusted actuator artifact: ${trustedActuatorScriptPath}. Install refuses until a hash-pinned Codex`,
    "payload is configured. Managed hook scripts are installed separately by device management.",
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
    toolchainCommand,
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
      bundle.toolchainCommand === null
        ? "task toolchain:    NOT CONFIGURED — a contained task cannot run pnpm workspace commands"
        : `task toolchain:    ${bundle.toolchainCommand.join(" ")}`,
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
