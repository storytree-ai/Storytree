/**
 * The Codex CLI live leaf. One `codex exec` turn authors one phase slice while the deterministic
 * spine remains the only red/green/verdict authority.
 *
 * Authentication and promotion controls are intentionally redundant:
 * - `codex login status` must report the exact ChatGPT-managed method before a model can run;
 * - metered credential environment variables are removed from both child processes;
 * - the CLI runs from a disposable replica, never the real workspace, with network disabled;
 * - the spine observes the replica and alone promotes an explicit target set.
 *
 * ADR-0390 withdrew Storytree's managed Codex permission profiles and hook boundary. The retained
 * phase author therefore requests Codex's unfenced native mode explicitly and relies on the
 * disposable replica plus exact, observed promotion instead of the retired containment machinery.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

import type { AuthoringPhase, AuthorResult, PhaseAuthor } from "./phase-author.js";
import type { TokenUsage } from "./model-events.js";

export const DEFAULT_CODEX_MODEL = "gpt-5.6-terra";
export const CODEX_EXECUTABLE_ENV = "STORYTREE_CODEX_EXECUTABLE";

const CHATGPT_LOGIN_STATUS = "Logged in using ChatGPT";
const AUTH_ENV_NAMES = new Set(["openai_api_key", "codex_api_key", "codex_access_token"]);

export interface CodexCommand {
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
}

export interface CodexCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  signal?: NodeJS.Signals;
}

/** Injectable process seam. The default resolves the CLI wrapper pinned by `@openai/codex`. */
export type CodexRunner = (command: CodexCommand) => Promise<CodexCommandResult>;

export interface CodexWriteViolation {
  phase: AuthoringPhase;
  tool: string;
  path: string;
  reason: string;
}

export interface CodexRunInfo {
  source: "codex-leaf";
  phase: AuthoringPhase;
  subtype: "success" | "error";
  turns: 1;
  model: string;
  usage?: TokenUsage;
  reasoningOutputTokens?: number;
  reasoning?: string[];
  messages?: string[];
  changedPaths?: string[];
}

/** Exact spine-authored packing list for one phase; neither field accepts globs. */
export interface CodexPromotionManifest {
  allowedTargets: string[];
  requiredTargets: string[];
}

/** Deterministic failure seam for rollback tests; production resolution never supplies it. */
export interface CodexPromotionFaults {
  afterApply?: (relPath: string, appliedCount: number) => void | Promise<void>;
  beforeRestore?: (relPath: string) => void | Promise<void>;
}

export interface CodexPhaseAuthorArgs {
  cwd: string;
  /** Hook-level phase globs, mirroring the spine's PathWriteScope. */
  writeGlobs: { AUTHOR_TEST: string[]; IMPLEMENT: string[] };
  /** Exact finite packing lists authored by the spine before either phase starts. */
  promotionManifests?: {
    AUTHOR_TEST: CodexPromotionManifest;
    IMPLEMENT: CodexPromotionManifest;
  };
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
  model?: string;
  /**
   * Rendered red-builder / green-builder bodies. Required on the real CLI path so a live leaf is
   * never silently substituted with generic instructions. Omission is legal only with `runner`.
   */
  phasePrompts?: { AUTHOR_TEST: string; IMPLEMENT: string };
  runner?: CodexRunner;
  env?: NodeJS.ProcessEnv;
  /** @internal Test-only fault seam, accepted only together with an injected runner. */
  promotionFaults?: CodexPromotionFaults;
}

interface ParsedCodexStream {
  completed: boolean;
  error?: string;
  usage?: TokenUsage;
  reasoningOutputTokens?: number;
  reasoning: string[];
  messages: string[];
  changedPaths: string[];
}

function finiteCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** Remove every case variant of all metered/non-persisted Codex auth variables. */
export function scrubMeteredCodexAuth(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name, value]) => {
      return value !== undefined && !AUTH_ENV_NAMES.has(name.toLowerCase());
    }),
  );
}

/**
 * Exact status proof: exit zero and the sole output line identifying ChatGPT-managed login.
 * The npm-pinned Windows wrapper forwards the native binary's status line on stderr, while the
 * direct binary emits it on stdout, so either single channel is accepted but extra output is not.
 */
export function isChatGptManagedLogin(result: CodexCommandResult): boolean {
  if (result.code !== 0) return false;
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  return (
    (stdout === CHATGPT_LOGIN_STATUS && stderr === "") ||
    (stderr === CHATGPT_LOGIN_STATUS && stdout === "")
  );
}

function validPhaseGlobs(globs: string[]): boolean {
  return globs.every(
    (glob) =>
      typeof glob === "string" &&
      glob.length > 0 &&
      !glob.includes("\0") &&
      !glob.includes("\\") &&
      !path.isAbsolute(glob) &&
      glob !== "." &&
      glob !== ".." &&
      !glob.startsWith("../") &&
      !glob.includes("/../"),
  );
}

const GLOB_MAGIC = /[*?[\]{}()!+@]/;
const WINDOWS_DEVICE_COMPONENT = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

function normalizeExactTarget(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    /[<>:"|\\\x00-\x1f\x7f]/.test(value) ||
    GLOB_MAGIC.test(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    return undefined;
  }
  const normalized = path.posix.normalize(value);
  const components = value.split("/");
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    components.some(
      (component) =>
        component.endsWith(".") ||
        component.endsWith(" ") ||
        WINDOWS_DEVICE_COMPONENT.test(component),
    )
  ) {
    return undefined;
  }
  return normalized;
}

function targetKey(relPath: string): string {
  return relPath;
}

function snapshotState(
  snapshot: Map<string, ReplicaPathState>,
  relPath: string,
): ReplicaPathState | undefined {
  return snapshot.get(relPath);
}

function validatePromotionManifest(manifest: CodexPromotionManifest | undefined):
  | { ok: true; allowed: Map<string, string>; required: Map<string, string> }
  | { ok: false } {
  if (
    manifest === undefined ||
    !Array.isArray(manifest.allowedTargets) ||
    !Array.isArray(manifest.requiredTargets) ||
    manifest.allowedTargets.length === 0 ||
    manifest.requiredTargets.length === 0
  ) {
    return { ok: false };
  }
  const collect = (values: string[]): Map<string, string> | undefined => {
    const result = new Map<string, string>();
    const caseFolded = new Set<string>();
    for (const value of values) {
      const normalized = normalizeExactTarget(value);
      if (normalized === undefined) return undefined;
      const key = targetKey(normalized);
      const folded = normalized.toLowerCase();
      // Authorization remains exact-case. Case folding is used only to reject an ambiguous packing
      // list that aliases on ordinary Windows volumes but diverges in a case-sensitive NTFS dir.
      if (result.has(key) || caseFolded.has(folded)) return undefined;
      result.set(key, normalized);
      caseFolded.add(folded);
    }
    return result;
  };
  const allowed = collect(manifest.allowedTargets);
  const required = collect(manifest.requiredTargets);
  if (
    allowed === undefined ||
    required === undefined ||
    [...required.keys()].some((key) => !allowed.has(key))
  ) {
    return { ok: false };
  }
  return { ok: true, allowed, required };
}

/** Pure command construction exported so offline tests pin every security-relevant flag. */
export function buildCodexExecArgs(args: {
  model: string;
  cwd: string;
}): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--strict-config",
    "--sandbox",
    "danger-full-access",
    "--model",
    args.model,
    "--cd",
    args.cwd,
    "--config",
    'approval_policy="never"',
    "--config",
    'web_search="disabled"',
    "--config",
    'forced_login_method="chatgpt"',
    "--config",
    'model_provider="openai"',
    "--config",
    "mcp_servers={}",
    "--config",
    "agents.enabled=false",
    "--config",
    "features.hooks=false",
    "--config",
    "features.apps=false",
    "--config",
    "features.remote_plugin=false",
    "--config",
    "features.multi_agent=false",
    "--config",
    // The legacy shell tool registration also carries Codex's apply_patch tool. The disposable
    // replica and exact promotion manifest remain the phase boundary.
    "features.shell_tool=true",
    "--config",
    "features.unified_exec=false",
    "-",
  ];
}

function eventMessage(event: Record<string, unknown>): string | undefined {
  const message = event["message"];
  if (typeof message === "string" && message.length > 0) return message;
  const error = event["error"];
  if (typeof error === "object" && error !== null) {
    const errorMessage = (error as Record<string, unknown>)["message"];
    if (typeof errorMessage === "string" && errorMessage.length > 0) return errorMessage;
  }
  return undefined;
}

/** Parse and validate the JSONL contract. Missing/multiple turns or malformed events fail closed. */
export function parseCodexJsonl(stdout: string): ParsedCodexStream {
  const parsed: ParsedCodexStream = {
    completed: false,
    reasoning: [],
    messages: [],
    changedPaths: [],
  };
  let starts = 0;
  let completions = 0;
  for (const [index, line] of stdout.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return { ...parsed, error: `malformed Codex JSONL at line ${index + 1}` };
    }
    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      return { ...parsed, error: `malformed Codex event at line ${index + 1}` };
    }
    const record = event as Record<string, unknown>;
    const type = record["type"];
    if (type === "turn.started") starts += 1;
    if (type === "turn.failed" || type === "error") {
      parsed.error = eventMessage(record) ?? `Codex emitted ${String(type)}`;
    }
    if (type === "turn.completed") {
      completions += 1;
      const rawUsage = record["usage"];
      if (typeof rawUsage !== "object" || rawUsage === null) {
        parsed.error = "Codex completed without readable usage";
        continue;
      }
      const usage = rawUsage as Record<string, unknown>;
      const inputTokens = finiteCount(usage["input_tokens"]);
      const outputTokens = finiteCount(usage["output_tokens"]);
      const cached = finiteCount(usage["cached_input_tokens"]) ?? 0;
      const cacheWrite = finiteCount(usage["cache_write_input_tokens"]) ?? 0;
      const reasoning = finiteCount(usage["reasoning_output_tokens"]);
      if (inputTokens === undefined || outputTokens === undefined) {
        parsed.error = "Codex completed with malformed token usage";
        continue;
      }
      parsed.usage = {
        inputTokens,
        cacheCreationInputTokens: cacheWrite,
        cacheReadInputTokens: cached,
        outputTokens,
      };
      if (reasoning !== undefined) parsed.reasoningOutputTokens = reasoning;
    }
    if (
      (type === "item.completed" || type === "item.updated") &&
      typeof record["item"] === "object" &&
      record["item"] !== null
    ) {
      const item = record["item"] as Record<string, unknown>;
      if (item["type"] === "reasoning" && typeof item["text"] === "string") {
        parsed.reasoning.push(item["text"]);
      }
      if (item["type"] === "agent_message" && typeof item["text"] === "string") {
        parsed.messages.push(item["text"]);
      }
      if (type === "item.completed" && item["type"] === "file_change") {
        const changes = item["changes"];
        if (!Array.isArray(changes)) {
          parsed.error = "Codex file_change event carries malformed changes";
        } else {
          for (const change of changes) {
            if (
              typeof change !== "object" ||
              change === null ||
              typeof (change as Record<string, unknown>)["path"] !== "string"
            ) {
              parsed.error = "Codex file_change event carries an unreadable path";
              continue;
            }
            parsed.changedPaths.push((change as { path: string }).path);
          }
        }
      }
    }
  }
  if (starts !== 1 || completions !== 1) {
    parsed.error ??= `Codex phase slice must contain exactly one turn (started=${starts}, completed=${completions})`;
  }
  parsed.completed = parsed.error === undefined && starts === 1 && completions === 1;
  return parsed;
}

function resolvePinnedCodexEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex/package.json");
  return path.join(path.dirname(packageJson), "bin", "codex.js");
}

/** Production runner for the pinned official CLI wrapper. */
export const runPinnedCodexCli: CodexRunner = async (command) => {
  const configuredExecutable = command.env[CODEX_EXECUTABLE_ENV]?.trim();
  if (configuredExecutable !== undefined && !path.isAbsolute(configuredExecutable)) {
    throw new Error(`${CODEX_EXECUTABLE_ENV} must name an absolute executable`);
  }
  const entrypoint = configuredExecutable === undefined ? resolvePinnedCodexEntrypoint() : undefined;
  return await new Promise<CodexCommandResult>((resolve, reject) => {
    const child = spawn(
      configuredExecutable ?? process.execPath,
      configuredExecutable === undefined ? [entrypoint!, ...command.args] : command.args,
      {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.once("error", reject);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("exit", (code, signal) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        ...(signal === null ? {} : { signal }),
      });
    });
    child.stdin.end(command.stdin ?? "");
  });
};

export function genericPhasePrompt(phase: AuthoringPhase): string {
  return (
    `You are Storytree's ${phase} phase leaf. Author only the requested phase deliverable inside ` +
    "the supplied write scope. Do not run tests or claim a verdict; the deterministic spine " +
    "observes red and green out of band. Stop once the deliverable is written."
  );
}

const REPLICA_EXCLUDED_PARTS = new Set([
  ".git",
  ".codex",
  ".claude",
  ".gate-logs",
  "node_modules",
]);

/** Ignored, managed-profile-writable parent for real Codex phase replicas. */
export function codexProductionReplicaRoot(cwd: string): string {
  let candidate = path.resolve(cwd);
  const filesystemRoot = path.parse(candidate).root;
  while (candidate !== filesystemRoot && !existsSync(path.join(candidate, ".git"))) {
    candidate = path.dirname(candidate);
  }
  const claimedRoot = existsSync(path.join(candidate, ".git")) ? candidate : path.resolve(cwd);
  return path.join(claimedRoot, ".gate-logs", "codex-replicas");
}

function includeInReplica(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  if (rel === "") return true;
  return !rel
    .split(path.sep)
    .some(
      (part) =>
        REPLICA_EXCLUDED_PARTS.has(part) ||
        part.startsWith(".storytree-codex-"),
    );
}

interface ReplicaPathState {
  kind: "file" | "symlink" | "other";
  digest: string;
  mode: number;
}

interface ReplicaChange {
  relPath: string;
  before?: ReplicaPathState;
  after?: ReplicaPathState;
}

export interface DisposableReplica {
  dir: string;
  /** False only for legacy injected-runner tests whose synthetic cwd does not exist. */
  seeded: boolean;
}

function digest(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function snapshotReplica(root: string): Promise<Map<string, ReplicaPathState>> {
  const snapshot = new Map<string, ReplicaPathState>();
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relPath = path.relative(root, absolute).replaceAll("\\", "/");
      if (relPath === ".git" || relPath.startsWith(".git/")) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const stat = await fs.lstat(absolute);
      if (entry.isFile()) {
        snapshot.set(relPath, {
          kind: "file",
          digest: digest(await fs.readFile(absolute)),
          mode: stat.mode & 0o777,
        });
      } else if (entry.isSymbolicLink()) {
        snapshot.set(relPath, {
          kind: "symlink",
          digest: digest(await fs.readlink(absolute)),
          mode: stat.mode & 0o777,
        });
      } else {
        snapshot.set(relPath, {
          kind: "other",
          digest: `${stat.size}:${stat.mtimeMs}`,
          mode: stat.mode & 0o777,
        });
      }
    }
  };
  await walk(root);
  return snapshot;
}

function observedReplicaChanges(
  before: Map<string, ReplicaPathState>,
  after: Map<string, ReplicaPathState>,
): ReplicaChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: ReplicaChange[] = [];
  for (const relPath of paths) {
    const beforeState = before.get(relPath);
    const afterState = after.get(relPath);
    if (
      beforeState?.kind === afterState?.kind &&
      beforeState?.digest === afterState?.digest &&
      beforeState?.mode === afterState?.mode
    ) {
      continue;
    }
    changes.push({
      relPath,
      ...(beforeState === undefined ? {} : { before: beforeState }),
      ...(afterState === undefined ? {} : { after: afterState }),
    });
  }
  return changes;
}

/** @internal Exported for no-model boundary tests. */
export async function prepareCodexDisposableReplica(
  source: string,
  injected: boolean,
): Promise<DisposableReplica> {
  const parent = injected ? os.tmpdir() : codexProductionReplicaRoot(source);
  if (!injected) await fs.mkdir(parent, { recursive: true });
  const replica = await fs.mkdtemp(
    path.join(parent, injected ? "storytree-codex-workspace-" : "phase-"),
  );
  try {
    const sourceExists = await fs.stat(source).then(
      (stat) => stat.isDirectory(),
      () => false,
    );
    if (sourceExists) {
      // Production replicas live below source, so copy admitted top-level entries individually.
      // Copying source wholesale would encounter the replica parent and recurse into itself.
      const entries = await fs.readdir(source, { withFileTypes: true });
      for (const entry of entries) {
        const candidate = path.join(source, entry.name);
        if (!includeInReplica(source, candidate)) continue;
        await fs.cp(candidate, path.join(replica, entry.name), {
          recursive: true,
          filter: (nested) => includeInReplica(source, nested),
        });
      }
    } else if (!injected) {
      throw new Error(`workspace does not exist: ${source}`);
    }
    return { dir: replica, seeded: sourceExists };
  } catch (error) {
    await fs.rm(replica, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

interface RealFileBackup {
  exists: boolean;
  content?: Buffer;
  mode?: number;
}

interface StagedReplicaChange {
  relPath: string;
  content?: Buffer;
  mode?: number;
}

function insideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

async function assertNoSymlinkParents(root: string, target: string): Promise<void> {
  const rel = path.relative(root, path.dirname(target));
  if (rel === "") return;
  let cursor = root;
  for (const part of rel.split(path.sep)) {
    cursor = path.join(cursor, part);
    let stat;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`target parent is not a real workspace directory: ${cursor}`);
    }
  }
}

async function readRealBackup(target: string): Promise<RealFileBackup> {
  let stat;
  try {
    stat = await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
  if (!stat.isFile()) {
    throw new Error(`real target is not a regular file: ${target}`);
  }
  if (stat.nlink !== 1) {
    throw new Error(`real target has ${stat.nlink} hard links and cannot be promoted safely: ${target}`);
  }
  return {
    exists: true,
    content: await fs.readFile(target),
    mode: stat.mode & 0o777,
  };
}

function backupMatchesReplicaBefore(
  backup: RealFileBackup,
  before: ReplicaPathState | undefined,
): boolean {
  if (before === undefined) return !backup.exists;
  return (
    before.kind === "file" &&
    backup.exists &&
    backup.content !== undefined &&
    digest(backup.content) === before.digest &&
    backup.mode === before.mode
  );
}

async function restoreRealTargets(
  realRoot: string,
  backups: Map<string, RealFileBackup>,
  faults?: CodexPromotionFaults,
): Promise<string[]> {
  const failures: string[] = [];
  for (const [relPath, backup] of [...backups.entries()].reverse()) {
    try {
      await faults?.beforeRestore?.(relPath);
      const target = path.resolve(realRoot, relPath);
      if (!backup.exists) {
        await fs.rm(target, { force: true });
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, backup.content!);
      await fs.chmod(target, backup.mode!);
    } catch (error) {
      failures.push(`${relPath}: ${(error as Error).message}`);
    }
  }
  return failures;
}

/**
 * Stage every admitted replica result before touching the real workspace, then apply only that
 * observed subset. A preflight or verification failure leaves (or restores) every real target.
 */
async function promoteReplicaChanges(args: {
  replicaRoot: string;
  realRoot: string;
  changes: ReplicaChange[];
  faults?: CodexPromotionFaults;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const staged: StagedReplicaChange[] = [];
  const backups = new Map<string, RealFileBackup>();
  try {
    for (const change of args.changes) {
      const replicaTarget = path.resolve(args.replicaRoot, change.relPath);
      const realTarget = path.resolve(args.realRoot, change.relPath);
      if (!insideRoot(args.replicaRoot, replicaTarget) || !insideRoot(args.realRoot, realTarget)) {
        throw new Error(`target escapes its workspace: ${change.relPath}`);
      }
      await assertNoSymlinkParents(args.replicaRoot, replicaTarget);
      await assertNoSymlinkParents(args.realRoot, realTarget);
      if (change.before !== undefined && change.before.kind !== "file") {
        throw new Error(`replica target was not a regular file before the run: ${change.relPath}`);
      }
      const backup = await readRealBackup(realTarget);
      if (!backupMatchesReplicaBefore(backup, change.before)) {
        throw new Error(`real target changed while Codex authored its replica: ${change.relPath}`);
      }
      backups.set(change.relPath, backup);
      if (change.after === undefined) {
        staged.push({ relPath: change.relPath });
        continue;
      }
      if (change.after.kind !== "file") {
        throw new Error(`replica target is not a regular file: ${change.relPath}`);
      }
      const content = await fs.readFile(replicaTarget);
      if (digest(content) !== change.after.digest) {
        throw new Error(`replica target changed while promotion was staged: ${change.relPath}`);
      }
      staged.push({ relPath: change.relPath, content, mode: change.after.mode });
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }

  try {
    let appliedCount = 0;
    for (const change of staged) {
      const target = path.resolve(args.realRoot, change.relPath);
      const current = await readRealBackup(target);
      const expected = backups.get(change.relPath)!;
      if (
        current.exists !== expected.exists ||
        (current.exists &&
          (current.content === undefined ||
            expected.content === undefined ||
            digest(current.content) !== digest(expected.content) ||
            current.mode !== expected.mode))
      ) {
        throw new Error(`real target changed before promotion applied: ${change.relPath}`);
      }
      if (change.content === undefined) {
        await fs.rm(target, { force: true });
      } else {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, change.content);
        await fs.chmod(target, change.mode!);
      }
      appliedCount += 1;
      await args.faults?.afterApply?.(change.relPath, appliedCount);
    }
    for (const change of staged) {
      const target = path.resolve(args.realRoot, change.relPath);
      const actual = await readRealBackup(target);
      if (change.content === undefined) {
        if (actual.exists) throw new Error(`deleted target still exists: ${change.relPath}`);
      } else if (
        !actual.exists ||
        actual.content === undefined ||
        (digest(actual.content) !== digest(change.content) || actual.mode !== change.mode)
      ) {
        throw new Error(`promoted target does not match the replica: ${change.relPath}`);
      }
    }
    return { ok: true };
  } catch (error) {
    const restoreFailures = await restoreRealTargets(args.realRoot, backups, args.faults);
    return {
      ok: false,
      error:
        (error as Error).message +
        (restoreFailures.length === 0
          ? "; all staged targets were restored"
          : `; rollback incomplete after attempting every target: ${restoreFailures.join("; ")}`),
    };
  }
}

export class CodexPhaseAuthor implements PhaseAuthor {
  readonly runtime = "codex" as const;
  readonly runs: CodexRunInfo[] = [];
  readonly violations: CodexWriteViolation[] = [];
  readonly feedbackRuns: [] = [];
  /** Codex cannot run feedback commands; registered proofs remain spine-only and out of band. */
  readonly feedbackToolNames: [] = [];
  readonly #args: CodexPhaseAuthorArgs;
  readonly #runner: CodexRunner;
  readonly #injectedRunner: boolean;

  constructor(args: CodexPhaseAuthorArgs) {
    this.#args = { ...args, cwd: path.resolve(args.cwd) };
    this.#injectedRunner = args.runner !== undefined;
    this.#runner = args.runner ?? runPinnedCodexCli;
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
    if (this.#args.promotionFaults !== undefined && !this.#injectedRunner) {
      return { ok: false, error: "Codex promotion fault injection requires an injected runner" };
    }
    if (
      !this.#injectedRunner &&
      (this.#args.phasePrompts === undefined ||
        this.#args.phasePrompts[phase].trim().length === 0)
    ) {
      return {
        ok: false,
        error: `Codex live author requires an injected rendered ${phase} phase prompt`,
      };
    }
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return { ok: false, error: "Codex phase brief is empty" };
    }
    const phaseGlobs = this.#args.writeGlobs[phase];
    if (!Array.isArray(phaseGlobs) || !validPhaseGlobs(phaseGlobs)) {
      return { ok: false, error: `Codex ${phase} write globs are malformed` };
    }
    const declaredManifest = this.#args.promotionManifests?.[phase];
    if (!this.#injectedRunner && declaredManifest === undefined) {
      return {
        ok: false,
        error: `Codex live author requires an exact ${phase} promotion manifest`,
      };
    }
    const manifest = validatePromotionManifest(declaredManifest);
    if (declaredManifest !== undefined && !manifest.ok) {
      return { ok: false, error: `Codex ${phase} promotion manifest is malformed` };
    }

    const childEnv = scrubMeteredCodexAuth(this.#args.env ?? process.env);
    let auth: CodexCommandResult;
    try {
      auth = await this.#runner({
        args: ["login", "status"],
        cwd: this.#args.cwd,
        env: childEnv,
      });
    } catch (error) {
      return { ok: false, error: `Codex authentication probe failed: ${(error as Error).message}` };
    }
    if (!isChatGptManagedLogin(auth)) {
      const detail = (auth.stdout || auth.stderr).trim() || `exit ${auth.code ?? "none"}`;
      return {
        ok: false,
        error: `Codex subscription auth required; login status was '${detail}'`,
      };
    }

    let replica: DisposableReplica | undefined;
    let beforeSnapshot: Map<string, ReplicaPathState> | undefined;
    try {
      replica = await prepareCodexDisposableReplica(this.#args.cwd, this.#injectedRunner);
    } catch (error) {
      if (replica !== undefined) {
        await fs.rm(replica.dir, { recursive: true, force: true }).catch(() => undefined);
      }
      return { ok: false, error: `Codex phase setup failed: ${(error as Error).message}` };
    }
    const replicaDir = replica.dir;
    try {
      if (replica.seeded) beforeSnapshot = await snapshotReplica(replicaDir);
    } catch (error) {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
      return { ok: false, error: `Codex phase setup failed: ${(error as Error).message}` };
    }
    const allowedPromptTargets = manifest.ok
      ? [...manifest.allowed.values()]
      : [phaseGlobs[0]!];
    const requiredPromptTargets = manifest.ok
      ? [...manifest.required.values()]
      : [phaseGlobs[0]!];
    const model = this.#args.model ?? DEFAULT_CODEX_MODEL;
    const agentBody = this.#args.phasePrompts?.[phase] ?? genericPhasePrompt(phase);
    const renderTargets = (targets: string[]): string =>
      targets.map((target) => `- \`${target}\``).join("\n");
    const fullPrompt =
      `${agentBody.trim()}\n\n## Phase brief\n${prompt.trim()}\n\n` +
      "The spine will run all registered proof commands after you stop; their verdict is not yours.\n\n" +
      "You are working in a disposable replica, not the real build workspace. The spine's exact " +
      `allowed target set for this phase is:\n${renderTargets(allowedPromptTargets)}\n\n` +
      `Required outputs:\n${renderTargets(requiredPromptTargets)}\n\n` +
      "After you stop, the spine will observe the complete replica diff and promote only the " +
      "observed allowed subset. One unlisted change refuses the whole phase; your final response " +
      "and file-change report are not promotion evidence.";

    let execution: CodexCommandResult;
    try {
      execution = await this.#runner({
        args: buildCodexExecArgs({
          model,
          cwd: replicaDir,
        }),
        cwd: replicaDir,
        env: childEnv,
        stdin: fullPrompt,
      });
    } catch (error) {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
      return { ok: false, error: `Codex exec failed to start: ${(error as Error).message}` };
    }

    try {
      const violationStart = this.violations.length;
      const parsed = parseCodexJsonl(execution.stdout);
      let afterSnapshot: Map<string, ReplicaPathState> | undefined;
      let changes: ReplicaChange[] = [];
      let observedPaths: string[];
      if (replica.seeded) {
        try {
          afterSnapshot = await snapshotReplica(replicaDir);
        } catch (error) {
          return { ok: false, error: `Codex replica observation failed: ${(error as Error).message}` };
        }
        changes = observedReplicaChanges(beforeSnapshot!, afterSnapshot);
        observedPaths = changes.map((change) => change.relPath);
      } else {
        // A runner-injected test may use a deliberately synthetic cwd. Keep that process seam useful,
        // but never confuse its reported paths with the filesystem evidence required in production.
        observedPaths = [];
        for (const reportedPath of parsed.changedPaths) {
          const absolute = path.resolve(replicaDir, reportedPath);
          if (!insideRoot(replicaDir, absolute)) {
            this.violations.push({
              phase,
              tool: "file_change",
              path: reportedPath,
              reason: `Codex reported a path outside its disposable replica: ${reportedPath}`,
            });
            continue;
          }
          observedPaths.push(path.relative(replicaDir, absolute).replaceAll("\\", "/"));
        }
        observedPaths = [...new Set(observedPaths)].sort();
      }

      const refusedPaths: string[] = [];
      for (const observedPath of observedPaths) {
        const listed = manifest.ok && manifest.allowed.has(targetKey(observedPath));
        const phaseAllowed = this.#args.isWriteAllowed(phase, observedPath);
        if ((manifest.ok && !listed) || !phaseAllowed) {
          refusedPaths.push(observedPath);
          this.violations.push({
            phase,
            tool: "file_change",
            path: observedPath,
            reason:
              `observed replica path '${observedPath}' is ` +
              (!listed ? "not in the spine-authored promotion manifest" : `refused by the ${phase} predicate`),
          });
        }
      }
      const phaseViolations = this.violations.slice(violationStart);
      const run: CodexRunInfo = {
        source: "codex-leaf",
        phase,
        subtype:
          execution.code === 0 &&
          parsed.completed &&
          phaseViolations.length === 0
            ? "success"
            : "error",
        turns: 1,
        model,
        ...(parsed.usage === undefined ? {} : { usage: parsed.usage }),
        ...(parsed.reasoningOutputTokens === undefined
          ? {}
          : { reasoningOutputTokens: parsed.reasoningOutputTokens }),
        ...(parsed.reasoning.length === 0 ? {} : { reasoning: parsed.reasoning }),
        ...(parsed.messages.length === 0 ? {} : { messages: parsed.messages }),
        changedPaths: observedPaths,
      };
      this.runs.push(run);
      const failRun = (error: string): AuthorResult => {
        run.subtype = "error";
        return { ok: false, error };
      };

      if (phaseViolations.length > 0) {
        return failRun(
          refusedPaths.length > 0
            ? `Codex phase promotion refused in full; observed unlisted or out-of-scope paths: ${refusedPaths.join(", ")}`
            : `Codex phase scope was violated: ${phaseViolations[0]?.reason ?? "write refused"}`,
        );
      }
      if (execution.code !== 0) {
        const detail = execution.stderr.trim() || parsed.error || `exit ${execution.code ?? "none"}`;
        return failRun(`Codex exec failed: ${detail}`);
      }
      if (!parsed.completed) {
        return failRun(parsed.error ?? "Codex exec produced no completed turn");
      }
      if (!replica.seeded) {
        if (observedPaths.length === 0) {
          return failRun("Codex completed without reporting a file change in the synthetic runner seam");
        }
        if (
          manifest.ok &&
          !observedPaths.some((observedPath) => manifest.required.has(targetKey(observedPath)))
        ) {
          return failRun("Codex completed without an observed required target change");
        }
        return { ok: true };
      }
      if (!manifest.ok) {
        return failRun(`Codex ${phase} promotion requires an exact finite manifest`);
      }
      const missingRequired = [...manifest.required.values()].filter(
        (requiredPath) =>
          afterSnapshot === undefined || snapshotState(afterSnapshot, requiredPath)?.kind !== "file",
      );
      if (missingRequired.length > 0) {
        return failRun(
          `Codex required target is missing or not a regular file after the run: ${missingRequired.join(", ")}`,
        );
      }
      if (!observedPaths.some((observedPath) => manifest.required.has(targetKey(observedPath)))) {
        return failRun("Codex completed without an observed required target change");
      }
      const promoted = await promoteReplicaChanges({
        replicaRoot: replicaDir,
        realRoot: this.#args.cwd,
        changes,
        ...(this.#args.promotionFaults === undefined
          ? {}
          : { faults: this.#args.promotionFaults }),
      });
      if (!promoted.ok) {
        return failRun(`Codex replica promotion failed: ${promoted.error}`);
      }
      return { ok: true };
    } finally {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
