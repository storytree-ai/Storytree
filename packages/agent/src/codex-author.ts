/**
 * The Codex CLI live leaf. One `codex exec` turn authors one phase slice while the deterministic
 * spine remains the only red/green/verdict authority.
 *
 * Authentication and confinement are intentionally redundant:
 * - `codex login status` must report the exact ChatGPT-managed method before a model can run;
 * - metered credential environment variables are removed from both child processes;
 * - the CLI runs in a disposable replica, never the real workspace, with network disabled;
 * - a vetted PreToolUse hook refuses shell, MCP, agents, unknown local tools, and out-of-scope
 *   replica writes before action. The spine alone promotes one exact replica file to the target.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthoringPhase, AuthorResult, PhaseAuthor } from "./phase-author.js";
import type { TokenUsage } from "./model-events.js";

export const DEFAULT_CODEX_MODEL = "gpt-5.6-terra";

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

export interface CodexPhaseAuthorArgs {
  cwd: string;
  /** Hook-level phase globs, mirroring the spine's PathWriteScope. */
  writeGlobs: { AUTHOR_TEST: string[]; IMPLEMENT: string[] };
  /**
   * Exact workspace-relative files the spine may promote a staged result to per phase. Production
   * callers supply these from the real proof's testFile/sourceFile. Codex itself receives no
   * workspace write access.
   */
  permissionPaths?: { AUTHOR_TEST: string[]; IMPLEMENT: string[] };
  isWriteAllowed: (phase: AuthoringPhase, relPath: string) => boolean;
  model?: string;
  /**
   * Rendered red-builder / green-builder bodies. Required on the real CLI path so a live leaf is
   * never silently substituted with generic instructions. Omission is legal only with `runner`.
   */
  phasePrompts?: { AUTHOR_TEST: string; IMPLEMENT: string };
  runner?: CodexRunner;
  env?: NodeJS.ProcessEnv;
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

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function shellCommand(node: string, hook: string, windows: boolean): string {
  if (windows) {
    const quote = (value: string): string => `"${value.replaceAll('"', '\\"')}"`;
    return `${quote(node)} ${quote(hook)}`;
  }
  const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
  return `${quote(node)} ${quote(hook)}`;
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

function hookConfig(hookPath: string): string {
  const posix = shellCommand(process.execPath, hookPath, false);
  const windows = shellCommand(process.execPath, hookPath, true);
  return (
    `[{ matcher = "*", hooks = [{ type = "command", command = ${tomlString(posix)}, ` +
    `command_windows = ${tomlString(windows)}, timeout = 30, ` +
    `statusMessage = "Enforcing Storytree phase scope" }] }]`
  );
}

/** Pure command construction exported so offline tests pin every security-relevant flag. */
export function buildCodexExecArgs(args: {
  model: string;
  cwd: string;
  hookPath: string;
}): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--dangerously-bypass-hook-trust",
    "--strict-config",
    "--model",
    args.model,
    "--cd",
    args.cwd,
    "--sandbox",
    "workspace-write",
    "--config",
    'approval_policy="never"',
    "--config",
    "sandbox_workspace_write.network_access=false",
    ...(process.platform === "win32"
      ? ["--config", 'windows.sandbox="elevated"']
      : []),
    "--config",
    `hooks.PreToolUse=${hookConfig(args.hookPath)}`,
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
    "features.hooks=true",
    "--config",
    "features.apps=false",
    "--config",
    "features.remote_plugin=false",
    "--config",
    "features.multi_agent=false",
    "--config",
    // The legacy shell tool registration also carries Codex's apply_patch tool. Bash itself is
    // denied by PreToolUse, and the OS profile independently limits any bypass to exact phase files.
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
  const entrypoint = resolvePinnedCodexEntrypoint();
  return await new Promise<CodexCommandResult>((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...command.args], {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
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

function genericPhasePrompt(phase: AuthoringPhase): string {
  return (
    `You are Storytree's ${phase} phase leaf. Author only the requested phase deliverable inside ` +
    "the supplied write scope. Do not run tests or claim a verdict; the deterministic spine " +
    "observes red and green out of band. Stop once the deliverable is written."
  );
}

function readViolationLines(text: string, phase: AuthoringPhase): CodexWriteViolation[] {
  const violations: CodexWriteViolation[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (
        typeof value["tool"] === "string" &&
        typeof value["path"] === "string" &&
        typeof value["reason"] === "string"
      ) {
        violations.push({
          phase,
          tool: value["tool"],
          path: value["path"],
          reason: value["reason"],
        });
      }
    } catch {
      violations.push({
        phase,
        tool: "(hook)",
        path: "(no path)",
        reason: "scope hook emitted a malformed violation report",
      });
    }
  }
  return violations;
}

const REPLICA_EXCLUDED_PARTS = new Set([".git", ".codex", ".claude", "node_modules"]);

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

async function initializeDisposableGit(cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["init", "--quiet"], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            Buffer.concat(stderr).toString("utf8").trim() ||
              `git init exited ${code ?? "without a code"}`,
          ),
        );
      }
    });
  });
}

async function prepareDisposableReplica(source: string, injected: boolean): Promise<string> {
  const replica = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-codex-workspace-"));
  try {
    if (!injected) {
      await fs.cp(source, replica, {
        recursive: true,
        filter: (candidate) => includeInReplica(source, candidate),
      });
      await initializeDisposableGit(replica);
    }
    return replica;
  } catch (error) {
    await fs.rm(replica, { recursive: true, force: true }).catch(() => undefined);
    throw error;
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
    const permissionPaths = this.#args.permissionPaths?.[phase];
    if (!this.#injectedRunner && permissionPaths === undefined) {
      return {
        ok: false,
        error: `Codex live author requires exact injected ${phase} permission paths`,
      };
    }
    if (
      permissionPaths !== undefined &&
      (permissionPaths.length !== 1 ||
        !validPhaseGlobs(permissionPaths) ||
        permissionPaths.some((entry) => entry.includes("*") || entry.includes("?")))
    ) {
      return { ok: false, error: `Codex ${phase} permission paths are malformed` };
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

    let replicaDir: string | undefined;
    try {
      replicaDir = await prepareDisposableReplica(this.#args.cwd, this.#injectedRunner);
    } catch (error) {
      if (replicaDir !== undefined) {
        await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
      }
      return { ok: false, error: `Codex phase setup failed: ${(error as Error).message}` };
    }
    const reportPath = path.join(replicaDir, ".storytree-codex-hook-report.jsonl");
    const targetRel = permissionPaths?.[0] ?? phaseGlobs[0]!;
    const hookPath = fileURLToPath(new URL("./codex-scope-hook.mjs", import.meta.url));
    const policy = Buffer.from(
      JSON.stringify({
        phase,
        cwd: replicaDir,
        writeGlobs: this.#args.writeGlobs,
      }),
      "utf8",
    ).toString("base64url");
    const model = this.#args.model ?? DEFAULT_CODEX_MODEL;
    const agentBody =
      this.#args.phasePrompts?.[phase] ?? genericPhasePrompt(phase);
    const fullPrompt =
      `${agentBody.trim()}\n\n## Phase brief\n${prompt.trim()}\n\n` +
      "The spine will run all registered proof commands after you stop; their verdict is not yours.\n\n" +
      `You are working in a disposable replica, not the real build workspace. Write the complete ` +
      `replacement at \`${targetRel}\` in this replica. The spine will validate that exact file and ` +
      "promote only it to the real phase target after you stop; every other replica change is discarded.";

    let execution: CodexCommandResult;
    try {
      execution = await this.#runner({
        args: buildCodexExecArgs({
          model,
          cwd: replicaDir,
          hookPath,
        }),
        cwd: replicaDir,
        env: {
          ...childEnv,
          STORYTREE_CODEX_HOOK_POLICY: policy,
          STORYTREE_CODEX_HOOK_REPORT: reportPath,
        },
        stdin: fullPrompt,
      });
    } catch (error) {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
      return { ok: false, error: `Codex exec failed to start: ${(error as Error).message}` };
    }

    try {
      const report = await fs.readFile(reportPath, "utf8").catch(() => "");
      this.violations.push(...readViolationLines(report, phase));
      const parsed = parseCodexJsonl(execution.stdout);
      let targetReported = false;
      for (const changedPath of parsed.changedPaths) {
        const absolute = path.resolve(replicaDir, changedPath);
        const rel = path.relative(replicaDir, absolute).replaceAll("\\", "/");
        const inside = rel !== ".." && !rel.startsWith("../") && !path.isAbsolute(rel);
        const allowed = inside && this.#args.isWriteAllowed(phase, rel);
        if (rel === targetRel) targetReported = true;
        if (!allowed || (!this.#injectedRunner && rel !== targetRel)) {
          this.violations.push({
            phase,
            tool: "file_change",
            path: changedPath,
            reason: `Codex reported a replica write refused by the injected ${phase} target`,
          });
        }
      }
      const run: CodexRunInfo = {
        source: "codex-leaf",
        phase,
        subtype:
          execution.code === 0 &&
          parsed.completed &&
          this.violations.every((violation) => violation.phase !== phase)
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
        changedPaths: parsed.changedPaths,
      };
      this.runs.push(run);

      if (this.violations.some((violation) => violation.phase === phase)) {
        return {
          ok: false,
          error: `Codex phase scope was violated: ${
            this.violations.find((violation) => violation.phase === phase)?.reason ?? "write refused"
          }`,
        };
      }
      if (execution.code !== 0) {
        const detail = execution.stderr.trim() || parsed.error || `exit ${execution.code ?? "none"}`;
        return { ok: false, error: `Codex exec failed: ${detail}` };
      }
      if (!parsed.completed) {
        return { ok: false, error: parsed.error ?? "Codex exec produced no completed turn" };
      }
      if (this.#injectedRunner) {
        if (parsed.changedPaths.length === 0) {
          run.subtype = "error";
          return { ok: false, error: "Codex completed without reporting a file change" };
        }
        return { ok: true };
      }
      if (!targetReported) {
        run.subtype = "error";
        const detail = parsed.messages.at(-1)?.trim();
        return {
          ok: false,
          error:
            `Codex completed without reporting the exact target change '${targetRel}'` +
            (detail === undefined || detail.length === 0 ? "" : `: ${detail}`),
        };
      }
      let authored: Buffer;
      try {
        authored = await fs.readFile(path.resolve(replicaDir, targetRel));
      } catch {
        run.subtype = "error";
        const detail = parsed.messages.at(-1)?.trim();
        return {
          ok: false,
          error:
            "Codex completed without producing its exact replica target" +
            (detail === undefined || detail.length === 0 ? "" : `: ${detail}`),
        };
      }
      if (!this.#args.isWriteAllowed(phase, targetRel)) {
        run.subtype = "error";
        return {
          ok: false,
          error: `Codex staged target was refused by the injected ${phase} predicate`,
        };
      }
      try {
        const target = path.resolve(this.#args.cwd, targetRel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, authored);
      } catch (error) {
        run.subtype = "error";
        return { ok: false, error: `Codex replica promotion failed: ${(error as Error).message}` };
      }
      return { ok: true };
    } finally {
      await fs.rm(replicaDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
