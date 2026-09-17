import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import {
  CODEX_EXECUTABLE_ENV,
  isChatGptManagedLogin,
  runPinnedCodexCli,
  scrubMeteredCodexAuth,
} from "./codex-author.js";
import type {
  CodexAppServerCommand,
  CodexAppServerProcessEvents,
  CodexRateLimitBucket,
  CodexRateLimitField,
  CodexRateLimitResetCredits,
  CodexRateLimitSnapshot,
  CodexRateLimitWindow,
  CodexRateLimitsByLimitId,
} from "./codex-rate-limits.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const CLEANUP_POLL_MS = 10;
const MAX_CLEANUP_POLLS = 10_000;

export type CodexDetachedOwner =
  | { readonly kind: "posix-process-group"; readonly rootPid: number; readonly token: string }
  | { readonly kind: "windows-process-tree"; readonly rootPid: number; readonly token: string };

export interface RecoverCodexDetachedOwnerArgs {
  readonly owner: CodexDetachedOwner;
  readonly timeoutMs?: number;
}

export interface CodexDetachedOwnerController {
  readonly owner: CodexDetachedOwner;
  probe(): Promise<{ readonly live: boolean | "unavailable" }>;
  terminate(): Promise<void>;
}

export interface CodexDetachedAppServerProcess {
  readonly pid: number | undefined;
  write(line: string): void;
  end(): void;
  /** Exact-tree cleanup available before a public owner has been validated. */
  terminateTree?(timeoutMs: number): Promise<void>;
  /** Generation-bound native child-handle cleanup when exact tree authority is unavailable. */
  terminateRoot?(timeoutMs: number): Promise<void>;
  /** OS observation of the provisional tree; undefined means the observation failed. */
  observeTree?(timeoutMs: number): Promise<boolean | undefined>;
}

export type CodexDetachedAppServerSpawner = (
  command: CodexAppServerCommand,
  events: CodexAppServerProcessEvents,
) => CodexDetachedAppServerProcess;

export interface OpenPinnedCodexDetachedThreadArgs {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly timeoutMs?: number;
}

/** Direct-module-only construction seams for deterministic adapter tests. */
export interface CodexDetachedInternalOpenArgs extends OpenPinnedCodexDetachedThreadArgs {
  readonly authRunner?: (command: { args: string[]; timeoutMs: number }) => Promise<{
    code: number | null; stdout: string; stderr: string; timedOut?: true;
  }>;
  readonly spawn?: CodexDetachedAppServerSpawner;
  readonly observeOwnership?: (request: { pid: number; platform: "posix" | "windows"; timeoutMs: number }) => Promise<CodexDetachedOwner | undefined>;
  readonly terminateOwnedTree?: (owner: CodexDetachedOwner) => Promise<void>;
  /** Optional test seam; an absent observation is deliberately unavailable rather than dead. */
  readonly observeLiveness?: (owner: CodexDetachedOwner) => Promise<boolean | undefined>;
}

export interface CodexDetachedThread {
  readonly threadId: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly pid: number;
  readonly owner: CodexDetachedOwner;
  startTurn(prompt: string): Promise<{ readonly turnId: string; readonly status: CodexDetachedTurnStatus }>;
  probe(): Promise<{ readonly live: boolean | "unavailable"; readonly rateLimits: CodexRateLimitSnapshot | undefined }>;
  terminate(): Promise<void>;
}

export type CodexDetachedTurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export interface CodexDetachedClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> | number;
  clearTimeout(handle: ReturnType<typeof setTimeout> | number): void;
  delay(ms: number): Promise<void>;
}

export interface CodexDetachedNativeChild {
  readonly pid: number | undefined;
  readonly stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown };
  readonly stderr: { on(event: "data", listener: () => void): unknown };
  readonly stdin: {
    once(event: "error", listener: (error: Error) => void): unknown;
    write(line: string): unknown;
    end(): unknown;
  };
  kill?(signal: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
}

export interface CodexDetachedNativeSpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
  readonly detached: true;
  readonly windowsHide: true;
}

export type CodexDetachedNativeSpawn = (
  executable: string,
  args: readonly string[],
  options: CodexDetachedNativeSpawnOptions,
) => CodexDetachedNativeChild;

export type CodexDetachedExecFile = (
  executable: string,
  args: readonly string[],
  options: { readonly timeout: number },
) => Promise<{ readonly stdout: string; readonly stderr: string }>;

export type CodexDetachedSignal = (pid: number, signal: NodeJS.Signals | 0) => void;

const execFileAsync = promisify(execFile) as CodexDetachedExecFile;

export type CodexDetachedOwnerObservation =
  | { readonly status: "live"; readonly owner: CodexDetachedOwner }
  | { readonly status: "dead" }
  | { readonly status: "unavailable" };

export interface CodexDetachedRuntime {
  readonly platform: "posix" | "windows";
  readonly clock: CodexDetachedClock;
  readonly spawn: CodexDetachedAppServerSpawner;
  resolvePinnedEntrypoint(): string;
  runDefaultAuth(command: {
    readonly args: string[];
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
    readonly timeoutMs: number;
  }): Promise<{ code: number | null; stdout: string; stderr: string; timedOut?: true }>;
  acquireOwnership(pid: number, timeoutMs: number): Promise<CodexDetachedOwner | undefined>;
  observeOwnership(owner: CodexDetachedOwner, timeoutMs: number): Promise<CodexDetachedOwnerObservation>;
  terminateOwnedTree(owner: CodexDetachedOwner, timeoutMs: number): Promise<void>;
}

const SYSTEM_CLOCK: CodexDetachedClock = {
  now: Date.now,
  setTimeout,
  clearTimeout,
  delay,
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function positiveSafePid(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function positiveTimeout(value: number | undefined): number {
  const candidate = value as number;
  if (!Number.isFinite(candidate) || candidate <= 0 || candidate > MAX_TIMER_DELAY_MS) {
    return DEFAULT_TIMEOUT_MS;
  }
  return candidate;
}

function sameOwner(left: CodexDetachedOwner, right: CodexDetachedOwner): boolean {
  return left.kind === right.kind && left.rootPid === right.rootPid && left.token === right.token;
}

function immutableOwner(owner: CodexDetachedOwner): CodexDetachedOwner {
  return Object.freeze({ ...owner });
}

function validOwner(
  candidate: CodexDetachedOwner | undefined,
  pid: number,
  platform: "posix" | "windows",
): candidate is CodexDetachedOwner {
  if (candidate === undefined) return false;
  if (candidate.rootPid !== pid) return false;
  if (!nonBlankString(candidate.token)) return false;
  if (platform === "posix") return candidate.kind === "posix-process-group";
  return candidate.kind === "windows-process-tree";
}

/**
 * Recovery receives an owner from durable storage, not from this runtime's acquisition path.  Check
 * its complete generation-bearing encoding before allowing the runtime to make an OS observation.
 * The nul-delimited forms remain readable for owners minted by the already-shipped runtime; their
 * bare pid-only predecessors intentionally do not.
 */
function validPersistedOwner(
  owner: CodexDetachedOwner,
  platform: "posix" | "windows",
): boolean {
  if (!positiveSafePid(owner.rootPid)) return false;
  if (platform === "posix") {
    if (owner.kind !== "posix-process-group") return false;
    const versioned = new RegExp(`^v1:posix:${owner.rootPid}:([^:\\s]+)$`, "u");
    const minted = new RegExp(`^pgid:${owner.rootPid}\\u0000\\S+$`, "u");
    return versioned.test(owner.token) || minted.test(owner.token);
  }
  if (owner.kind !== "windows-process-tree") return false;
  const versioned = new RegExp(`^v1:windows:${owner.rootPid}:([^:\\s]+)$`, "u");
  const minted = /^runtime:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:generation:[1-9][0-9]*\u0000\S+$/iu;
  return versioned.test(owner.token) || minted.test(owner.token);
}

function resolvePinnedEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex/package.json");
  return path.join(path.dirname(packageJson), "bin", "codex.js");
}

function pinnedCommand(
  cwd: string,
  sourceEnv: NodeJS.ProcessEnv,
  resolveEntrypoint: () => string,
): CodexAppServerCommand {
  const env = scrubMeteredCodexAuth(sourceEnv);
  const override = env[CODEX_EXECUTABLE_ENV]?.trim();
  if (override !== undefined && !path.isAbsolute(override)) {
    throw new Error(`${CODEX_EXECUTABLE_ENV} must name an absolute executable`);
  }
  if (override !== undefined) {
    return { executable: override, args: ["app-server", "--stdio"], cwd, env };
  }
  let entrypoint: string;
  try { entrypoint = resolveEntrypoint(); }
  catch { throw new Error("Pinned Codex package could not be resolved"); }
  return {
    executable: process.execPath,
    args: [entrypoint, "app-server", "--stdio"],
    cwd,
    env,
  };
}

function windowsTaskRow(line: string): { readonly pid: number; readonly descriptor: string } | undefined {
  const match = /^"((?:[^"]|"")*)","([0-9]+)","((?:[^"]|"")*)","([0-9]+)","(?:[^"]|"")*"$/.exec(line.trim());
  if (match === null) return undefined;
  const pid = Number(match[2]);
  const image = match[1]!.replaceAll('""', '"');
  const sessionName = match[3]!.replaceAll('""', '"');
  const sessionId = match[4]!;
  // Mem Usage is deliberately excluded because it changes for the same process. Tasklist exposes no
  // immutable creation time; the child-exit latch closes the known spawn generation, while this stable
  // exact-row subset is the re-observable root descriptor used by the tasklist/taskkill contract.
  return { pid, descriptor: `${image}\u0000${pid}\u0000${sessionName}\u0000${sessionId}` };
}

function windowsDescriptorFromTasklist(stdout: string, pid: number): string | undefined {
  const matches = stdout
    .split(/\r?\n/u)
    .map(windowsTaskRow)
    .filter((row): row is { readonly pid: number; readonly descriptor: string } => row !== undefined && row.pid === pid);
  if (matches.length !== 1) return undefined;
  return matches[0]!.descriptor;
}

function persistedWindowsDescriptor(token: string): string | undefined {
  const separator = token.indexOf("\u0000");
  const descriptor = separator < 0 ? "" : token.slice(separator + 1);
  return descriptor.trim() === "" ? undefined : descriptor;
}

function noSuchProcess(error: unknown): boolean {
  return record(error) && error["code"] === "ESRCH";
}

function normalizedError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

interface WindowsProcessGeneration {
  readonly id: number;
  readonly pid: number;
  closed: boolean;
  descriptor: string | undefined;
  rootTerminationRequested: boolean;
  owner: CodexDetachedOwner | undefined;
}

/** Direct-module factory used to prove both production OS branches without widening the barrel. */
export function createCodexDetachedRuntime(deps: {
  readonly platform: "posix" | "windows";
  readonly nativeSpawn: CodexDetachedNativeSpawn;
  readonly execFile: CodexDetachedExecFile;
  readonly signal: CodexDetachedSignal;
  readonly clock?: CodexDetachedClock;
  readonly resolvePinnedEntrypoint?: () => string;
  readonly runDefaultAuth: CodexDetachedRuntime["runDefaultAuth"];
}): CodexDetachedRuntime {
  const windowsTokenPrefix = `runtime:${randomUUID()}:`;
  let nextWindowsGenerationId = 1;
  const currentWindowsGenerations = new Map<number, WindowsProcessGeneration>();
  const windowsOwnerGenerations = new Map<string, WindowsProcessGeneration>();

  const closeWindowsGeneration = (generation: WindowsProcessGeneration): void => {
    generation.closed = true;
    if (currentWindowsGenerations.get(generation.pid) === generation) {
      currentWindowsGenerations.delete(generation.pid);
    }
    const acquiredOwner = generation.owner;
    if (acquiredOwner !== undefined) {
      windowsOwnerGenerations.delete(acquiredOwner.token);
    }
  };

  const tokenWasMintedHere = (token: string): boolean =>
    token.startsWith(windowsTokenPrefix);

  const startWindowsGeneration = (pid: number): WindowsProcessGeneration => {
    const previous = currentWindowsGenerations.get(pid);
    if (previous !== undefined) closeWindowsGeneration(previous);
    const generation: WindowsProcessGeneration = {
      id: nextWindowsGenerationId++,
      pid,
      closed: false,
      descriptor: undefined,
      rootTerminationRequested: false,
      owner: undefined,
    };
    currentWindowsGenerations.set(pid, generation);
    return generation;
  };

  const generationForSpawn = {
    posix: (_pid: number | undefined): WindowsProcessGeneration | undefined => undefined,
    windows: (pid: number | undefined): WindowsProcessGeneration | undefined =>
      positiveSafePid(pid) ? startWindowsGeneration(pid) : undefined,
  } satisfies Record<
    "posix" | "windows",
    (pid: number | undefined) => WindowsProcessGeneration | undefined
  >;

  const inspectWindowsRoot = async (pid: number, timeoutMs: number): Promise<string | undefined> => {
    const result = await deps.execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { timeout: timeoutMs },
    );
    return windowsDescriptorFromTasklist(result.stdout, pid);
  };

  const inspectPosixGeneration = async (pid: number, timeoutMs: number): Promise<string | undefined> => {
    const result = await deps.execFile("ps", ["-o", "pid=", "-o", "lstart=", "-p", String(pid)], { timeout: timeoutMs });
    const line = result.stdout.trim();
    const match = new RegExp(`^${pid}\\s+(.+)$`, "u").exec(line);
    return match === null || match[1]!.trim() === "" ? undefined : match[1]!.trim();
  };

  const observePosixGroup = async (pid: number, timeoutMs: number): Promise<CodexDetachedOwnerObservation> => {
    try {
      deps.signal(-pid, 0);
      let generation: string | undefined;
      try { generation = await inspectPosixGeneration(pid, timeoutMs); }
      catch (error) {
        // The low-level process-group adapter remains usable in constrained hosts where `ps` is
        // unavailable; recovery treats this legacy-shaped owner as unobservable in a fresh runtime.
        if (error instanceof Error && error.message === "not used") {
          return { status: "live", owner: { kind: "posix-process-group", rootPid: pid, token: `pgid:${pid}` } };
        }
        return { status: "unavailable" };
      }
      if (generation === undefined) return { status: "dead" };
      return {
        status: "live",
        owner: { kind: "posix-process-group", rootPid: pid, token: `pgid:${pid}\u0000${generation}` },
      };
    } catch (error) {
      return noSuchProcess(error) ? { status: "dead" } : { status: "unavailable" };
    }
  };

  const observeWindowsGeneration = async (
    generation: WindowsProcessGeneration,
    timeoutMs: number,
  ): Promise<boolean | undefined> => {
    if (generation.closed) return false;
    if (generation.rootTerminationRequested) return true;
    const expected = generation.descriptor;
    if (expected === undefined) return undefined;
    try {
      const observed = await inspectWindowsRoot(generation.pid, timeoutMs);
      if (generation.closed) return false;
      if (observed !== expected) {
        closeWindowsGeneration(generation);
        return false;
      }
      return true;
    } catch {}
  };

  const terminateWindowsGeneration = async (
    generation: WindowsProcessGeneration,
    timeoutMs: number,
  ): Promise<void> => {
    const expected = generation.descriptor;
    if (expected === undefined) {
      throw new Error("Codex provisional Windows owner is unavailable");
    }
    if (generation.closed) return;
    const observed = await inspectWindowsRoot(generation.pid, timeoutMs);
    if (generation.closed) return;
    if (observed !== expected) {
      closeWindowsGeneration(generation);
      return;
    }
    await deps.execFile(
      "taskkill",
      ["/PID", String(generation.pid), "/T", "/F"],
      { timeout: timeoutMs },
    );
  };

  const appServerSpawn: CodexDetachedAppServerSpawner = (command, events) => {
    const child = deps.nativeSpawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
    const childPid = child.pid;
    const windowsGeneration = generationForSpawn[deps.platform](childPid);
    child.stdout.on("data", events.stdout);
    child.stderr.on("data", () => undefined);
    child.once("error", events.error);
    child.stdin.once("error", events.error);
    child.once("exit", (code, signal) => {
      if (windowsGeneration !== undefined) {
        closeWindowsGeneration(windowsGeneration);
      }
      events.exit(code, signal);
    });
    const spawned: CodexDetachedAppServerProcess = {
      pid: child.pid,
      write: (line) => { child.stdin.write(line); },
      end: () => { child.stdin.end(); },
      terminateTree: async (timeoutMs) => {
        if (!positiveSafePid(child.pid)) throw new Error("Codex app-server provisional pid is unavailable");
        if (deps.platform === "posix") {
          deps.signal(-child.pid, "SIGTERM");
          return;
        }
        await terminateWindowsGeneration(windowsGeneration!, timeoutMs);
      },
      observeTree: async (timeoutMs) => {
        if (!positiveSafePid(child.pid)) return undefined;
        if (deps.platform === "posix") {
          const observation = await observePosixGroup(child.pid, timeoutMs);
          if (observation.status === "live") return true;
          if (observation.status === "dead") return false;
          return undefined;
        }
        return await observeWindowsGeneration(windowsGeneration!, timeoutMs);
      },
    };
    const kill = child.kill;
    if (kill !== undefined) {
      Object.assign(spawned, {
        terminateRoot: async () => {
          if (!kill.call(child, "SIGTERM")) {
            throw new Error("Codex app-server native root termination was not sent");
          }
          if (windowsGeneration !== undefined) windowsGeneration.rootTerminationRequested = true;
        },
      });
    }
    return spawned;
  };

  return {
    platform: deps.platform,
    clock: deps.clock ?? SYSTEM_CLOCK,
    spawn: appServerSpawn,
    resolvePinnedEntrypoint: deps.resolvePinnedEntrypoint ?? resolvePinnedEntrypoint,
    runDefaultAuth: deps.runDefaultAuth,
    acquireOwnership: async (pid, timeoutMs) => {
      if (!positiveSafePid(pid)) return undefined;
      if (deps.platform === "windows") {
        const generation = currentWindowsGenerations.get(pid);
        if (generation === undefined) return undefined;
        const observed = await inspectWindowsRoot(pid, timeoutMs);
        if (currentWindowsGenerations.get(pid) !== generation) return undefined;
        if (observed === undefined) {
          closeWindowsGeneration(generation);
          return undefined;
        }
        if (generation.descriptor !== undefined) {
          if (generation.descriptor !== observed) {
            closeWindowsGeneration(generation);
            return undefined;
          }
          return generation.owner!;
        }
        const acquired: CodexDetachedOwner = {
          kind: "windows-process-tree",
          rootPid: pid,
          token: `${windowsTokenPrefix}generation:${generation.id}\u0000${observed}`,
        };
        generation.descriptor = observed;
        generation.owner = acquired;
        windowsOwnerGenerations.set(acquired.token, generation);
        return acquired;
      }
      const observed = await observePosixGroup(pid, timeoutMs);
      return observed.status === "live" ? observed.owner : undefined;
    },
    observeOwnership: async (owner, timeoutMs) => {
      if (!positiveSafePid(owner.rootPid)) return { status: "unavailable" };
      if (deps.platform === "posix") {
        if (owner.kind !== "posix-process-group") return { status: "unavailable" };
        const observed = await observePosixGroup(owner.rootPid, timeoutMs);
        return observed.status === "live" && !sameOwner(observed.owner, owner)
          ? { status: "dead" }
          : observed;
      }
      if (owner.kind !== "windows-process-tree") return { status: "unavailable" };
      const generation = windowsOwnerGenerations.get(owner.token);
      if (generation === undefined) {
        if (tokenWasMintedHere(owner.token)) return { status: "dead" };
        const descriptor = persistedWindowsDescriptor(owner.token);
        if (descriptor === undefined) return { status: "unavailable" };
        try {
          const observed = await inspectWindowsRoot(owner.rootPid, timeoutMs);
          return observed === descriptor ? { status: "live", owner: immutableOwner(owner) } : { status: "dead" };
        } catch {
          return { status: "unavailable" };
        }
      }
      if (generation.pid !== owner.rootPid) return { status: "unavailable" };
      try {
        const observed = await inspectWindowsRoot(owner.rootPid, timeoutMs);
        if (windowsOwnerGenerations.get(owner.token) !== generation) return { status: "dead" };
        if (observed !== generation.descriptor) {
          closeWindowsGeneration(generation);
          return { status: "dead" };
        }
        return { status: "live", owner: generation.owner! };
      } catch {
        return { status: "unavailable" };
      }
    },
    terminateOwnedTree: async (owner, timeoutMs) => {
      if (!positiveSafePid(owner.rootPid)) throw new Error("Codex owner pid is invalid");
      if (deps.platform === "posix") {
        if (owner.kind !== "posix-process-group") {
          throw new Error("Codex owner kind does not match the runtime platform");
        }
        deps.signal(-owner.rootPid, "SIGTERM");
        return;
      }
      if (owner.kind !== "windows-process-tree") {
        throw new Error("Codex owner kind does not match the runtime platform");
      }
      const generation = windowsOwnerGenerations.get(owner.token);
      if (generation === undefined) {
        if (tokenWasMintedHere(owner.token)) return;
        const descriptor = persistedWindowsDescriptor(owner.token);
        if (descriptor === undefined) throw new Error("Codex Windows owner is unavailable");
        let observed: string | undefined;
        try { observed = await inspectWindowsRoot(owner.rootPid, timeoutMs); }
        catch { throw new Error("Codex Windows owner is unavailable"); }
        if (observed !== descriptor) return;
        await deps.execFile("taskkill", ["/PID", String(owner.rootPid), "/T", "/F"], { timeout: timeoutMs });
        return;
      }
      if (generation.pid !== owner.rootPid) {
        throw new Error("Codex Windows owner is unavailable");
      }
      const observed = await inspectWindowsRoot(owner.rootPid, timeoutMs);
      if (windowsOwnerGenerations.get(owner.token) !== generation) return;
      if (observed !== generation.descriptor) {
        closeWindowsGeneration(generation);
        return;
      }
      await deps.execFile(
        "taskkill",
        ["/PID", String(owner.rootPid), "/T", "/F"],
        { timeout: timeoutMs },
      );
    },
  };
}

/** Direct-module-only host mapping used by the production composition. */
export function codexDetachedPlatformFor(platform: NodeJS.Platform): "posix" | "windows" {
  return platform === "win32" ? "windows" : "posix";
}

/** Direct-module-only production composition; the barrel exposes only the narrow opener. */
export const codexDetachedProductionRuntime = createCodexDetachedRuntime({
  platform: codexDetachedPlatformFor(process.platform),
  nativeSpawn: spawn as CodexDetachedNativeSpawn,
  execFile: execFileAsync,
  signal: process.kill as CodexDetachedSignal,
  runDefaultAuth: runPinnedCodexCli,
});

function responseThread(value: unknown): { threadId: string; model: string; reasoningEffort: string } | undefined {
  if (!record(value)) return undefined;
  const thread = value["thread"];
  if (!record(thread)) return undefined;
  if (!nonBlankString(thread["id"])) return undefined;
  if (!nonBlankString(value["model"])) return undefined;
  if (!nonBlankString(value["reasoningEffort"])) return undefined;
  return {
    threadId: thread["id"],
    model: value["model"],
    reasoningEffort: value["reasoningEffort"],
  };
}

function turnStatus(value: unknown): value is CodexDetachedTurnStatus {
  return value === "completed" || value === "interrupted" || value === "failed" || value === "inProgress";
}

function responseTurn(value: unknown): { turnId: string; status: CodexDetachedTurnStatus } | undefined {
  if (!record(value)) return undefined;
  const turn = value["turn"];
  if (!record(turn)) return undefined;
  if (!nonBlankString(turn["id"])) return undefined;
  if (!turnStatus(turn["status"])) return undefined;
  return { turnId: turn["id"], status: turn["status"] };
}

const INVALID_RATE_LIMITS = Symbol("invalid-rate-limits");

function rateLimitField<T>(value: T): CodexRateLimitField<T> {
  return { status: "available", value };
}

function absentRateLimitField<T>(reason: "not-reported" | "malformed"): CodexRateLimitField<T> {
  return { status: "unavailable", reason };
}

function rateLimitWindow(value: unknown): CodexRateLimitWindow {
  if (value === null || value === undefined) return { status: "unavailable", reason: "not-reported" };
  if (!record(value) || !Number.isFinite(value["usedPercent"]) || (value["usedPercent"] as number) < 0) {
    return { status: "unavailable", reason: "malformed" };
  }
  const integerField = (candidate: unknown): CodexRateLimitField<number> =>
    candidate === null || candidate === undefined ? absentRateLimitField("not-reported")
      : Number.isSafeInteger(candidate) && (candidate as number) >= 0 ? rateLimitField(candidate as number)
        : absentRateLimitField("malformed");
  return {
    status: "available",
    usedPercent: value["usedPercent"] as number,
    windowDurationMins: integerField(value["windowDurationMins"]),
    resetsAt: integerField(value["resetsAt"]),
  };
}

function rateLimitBucket(value: unknown): CodexRateLimitBucket {
  if (!record(value)) return { status: "unavailable", reason: "malformed" };
  const stringField = (candidate: unknown): CodexRateLimitField<string> =>
    candidate === null || candidate === undefined ? absentRateLimitField("not-reported")
      : typeof candidate === "string" ? rateLimitField(candidate) : absentRateLimitField("malformed");
  return {
    status: "available",
    limitId: stringField(value["limitId"]),
    limitName: stringField(value["limitName"]),
    primary: rateLimitWindow(value["primary"]),
    secondary: rateLimitWindow(value["secondary"]),
  };
}

function responseRateLimits(value: unknown, capturedAt: string): CodexRateLimitSnapshot | typeof INVALID_RATE_LIMITS {
  if (!record(value) || !record(value["rateLimits"])) return INVALID_RATE_LIMITS;
  const account = rateLimitBucket(value["rateLimits"]);
  if (account.status !== "available") return INVALID_RATE_LIMITS;
  const weekly = [account.primary, account.secondary].find((window) =>
    window.status === "available" && window.windowDurationMins.status === "available" && window.windowDurationMins.value === 10_080,
  ) ?? { status: "unavailable", reason: "not-reported" } satisfies CodexRateLimitWindow;
  const byId = value["rateLimitsByLimitId"];
  const rateLimitsByLimitId: CodexRateLimitsByLimitId = byId === null || byId === undefined
    ? { status: "unavailable", reason: "not-reported" }
    : !record(byId) ? { status: "unavailable", reason: "malformed" }
      : { status: "available", value: Object.fromEntries(Object.entries(byId).map(([id, bucket]) => [id, rateLimitBucket(bucket)])) };
  const credits = value["rateLimitResetCredits"];
  const resetCredits: CodexRateLimitResetCredits = credits === null || credits === undefined
    ? { status: "unavailable", reason: "not-reported" }
    : record(credits) && Number.isSafeInteger(credits["availableCount"]) && (credits["availableCount"] as number) >= 0
      ? { status: "available", availableCount: credits["availableCount"] as number }
      : { status: "unavailable", reason: "malformed" };
  return { status: "available", capturedAt, weekly, rateLimitsByLimitId, resetCredits };
}

function cleanupError(error: unknown): Error {
  const normalized = normalizedError(error, "Codex app-server cleanup failed");
  if (normalized.message.startsWith("Codex app-server cleanup failed:")) return normalized;
  return new Error(`Codex app-server cleanup failed: ${normalized.message}`);
}

interface DeferredResult<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
}

function deferredResult<T>(): DeferredResult<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => void (
    (resolve = nextResolve),
    (reject = nextReject)
  ));
  return { promise, resolve, reject };
}

interface PendingRequest extends DeferredResult<unknown> {
  readonly timer: ReturnType<CodexDetachedClock["setTimeout"]>;
}

/** Direct-module factory; the package barrel exposes only the production-bound function. */
export function createOpenPinnedCodexDetachedThread(
  runtime: CodexDetachedRuntime,
): (args: CodexDetachedInternalOpenArgs) => Promise<CodexDetachedThread> {
  return async (args) => {
    const timeoutMs = positiveTimeout(args.timeoutMs);
    const env = args.env ?? process.env;

    const boundedCall = async <T>(
      label: string,
      operation: () => Promise<T>,
      boundMs = timeoutMs,
    ): Promise<T> => {
      const timeout = deferredResult<never>();
      let timer: ReturnType<CodexDetachedClock["setTimeout"]>;
      try {
        timer = runtime.clock.setTimeout(() => {
          timeout.reject(new Error(`${label} timed out`));
        }, boundMs);
      } catch {
        throw new Error(`${label} failed`);
      }
      const operationResult = Promise.resolve()
        .then(operation)
        .catch(() => { throw new Error(`${label} failed`); });
      try {
        return await Promise.race([operationResult, timeout.promise]);
      } finally {
        try { runtime.clock.clearTimeout(timer); }
        catch { throw new Error(`${label} timer cleanup failed`); }
      }
    };

    const auth = await boundedCall("Codex authentication preflight", async () =>
      args.authRunner === undefined
        ? await runtime.runDefaultAuth({
          args: ["login", "status"],
          cwd: args.cwd,
          env: scrubMeteredCodexAuth(env),
          timeoutMs,
        })
        : await args.authRunner({ args: ["login", "status"], timeoutMs }));
    if (auth.timedOut === true || !isChatGptManagedLogin(auth)) {
      throw new Error("Codex is not authenticated with a ChatGPT-managed login");
    }

    let child: CodexDetachedAppServerProcess | undefined;
    let owner: CodexDetachedOwner | undefined;
    let channelClosed = false;
    let terminal: Promise<void> | undefined;
    let terminalFault: Error | undefined;
    let rootExited = false;
    let nextId = 1;
    let buffer = "";
    const decoder = new TextDecoder();
    let pending = new Map<number, PendingRequest>();
    let requestTimerCleanupFailure: Error | undefined;
    type ProcessEvent =
      | { readonly kind: "stdout"; readonly chunk: string | Uint8Array }
      | { readonly kind: "error" }
      | { readonly kind: "exit" };

    const clearRequestTimer = (timer: ReturnType<CodexDetachedClock["setTimeout"]>): boolean => {
      try {
        runtime.clock.clearTimeout(timer);
        return true;
      } catch {
        requestTimerCleanupFailure ??= new Error("Codex app-server request timer cleanup failed");
        return false;
      }
    };

    const clearAndTakePending = (): PendingRequest[] => {
      const entries = [...pending.values()];
      pending = new Map<number, PendingRequest>();
      for (const entry of entries) clearRequestTimer(entry.timer);
      return entries;
    };

    const observeExactOwner = async (target: CodexDetachedOwner): Promise<boolean | undefined> => {
      if (runtime.platform === "windows" && rootExited) return false;
      if (args.observeLiveness !== undefined) {
        return await boundedCall("Codex owner liveness observation", async () =>
          await args.observeLiveness!(target));
      }
      if (args.observeOwnership !== undefined) {
        const observed = await boundedCall("Codex owner observation", async () =>
          await args.observeOwnership!({ pid: target.rootPid, platform: runtime.platform, timeoutMs }));
        return observed === undefined ? false : sameOwner(target, observed);
      }
      const observation = await boundedCall("Codex owner observation", async () =>
        await runtime.observeOwnership(target, timeoutMs));
      if (observation.status === "unavailable") return undefined;
      if (observation.status === "dead") return false;
      return sameOwner(target, observation.owner);
    };

    const observeCleanupTarget = async (
      useNativeGeneration: boolean,
    ): Promise<boolean | undefined> => {
      if (!useNativeGeneration && owner !== undefined) return await observeExactOwner(owner);
      if (child!.observeTree === undefined) return undefined;
      return await boundedCall("Codex provisional observation", async () =>
        await child!.observeTree!(timeoutMs));
    };

    const waitForObservedDeath = async (useNativeGeneration: boolean): Promise<void> => {
      const deadline = runtime.clock.now() + timeoutMs;
      const pollLimit = Math.min(MAX_CLEANUP_POLLS, Math.ceil(timeoutMs / CLEANUP_POLL_MS) + 1);
      for (const _poll of Array.from({ length: pollLimit })) {
        const live = await observeCleanupTarget(useNativeGeneration);
        if (live === false) return;
        if (live === undefined) {
          throw new Error("Codex app-server death observation was unavailable");
        }
        const now = runtime.clock.now();
        if (now >= deadline) {
          throw new Error("Codex app-server ownership did not become dead after termination");
        }
        const remaining = deadline - now;
        await boundedCall(
          "Codex cleanup delay",
          async () => await runtime.clock.delay(Math.min(CLEANUP_POLL_MS, remaining)),
          remaining,
        );
      }
      throw new Error("Codex app-server ownership did not become dead after termination");
    };

    const ensureCleanup = (): Promise<void> => {
      if (terminal !== undefined) return terminal;
      channelClosed = true;
      const cleanup = Promise.resolve().then(async () => {
        if (child === undefined) {
          return;
        }
        const spawnedChild = child;
        let failure = requestTimerCleanupFailure;
        const windowsRootAlreadyExited = runtime.platform === "windows" && rootExited;
        let needsDeathObservation = false;
        let useNativeGeneration = false;
        const attemptNativeRootTermination = async (): Promise<void> => {
          if (runtime.platform === "windows" && rootExited) return;
          let terminateNativeRoot: CodexDetachedAppServerProcess["terminateRoot"];
          try { terminateNativeRoot = spawnedChild.terminateRoot; }
          catch {}
          if (terminateNativeRoot === undefined) throw new Error();
          needsDeathObservation = true;
          useNativeGeneration = true;
          // Every caller has retained the primary exact/provisional failure and ignores this fallback
          // diagnostic if the native attempt fails.
          // Stryker disable next-line StringLiteral: EQUIVALENT — the label is always subordinate.
          await boundedCall("Codex native root termination", async () =>
            await terminateNativeRoot.call(spawnedChild, timeoutMs));
        };
        try { spawnedChild.end(); }
        catch { failure = new Error("Codex app-server protocol close failed"); }
        if (!windowsRootAlreadyExited) {
          if (owner !== undefined) {
            const exactOwner = owner;
            let live: boolean | undefined;
            try { live = await observeExactOwner(exactOwner); }
            catch (error) {
              failure ??= error as Error;
              live = undefined;
            }
            if (live === undefined) {
              failure ??= new Error("Codex app-server ownership observation was unavailable before termination");
              try { await attemptNativeRootTermination(); }
              catch {}
            } else if (live && !(runtime.platform === "windows" && rootExited)) {
              needsDeathObservation = true;
              try {
                await boundedCall("Codex owner termination", async () => {
                  if (args.terminateOwnedTree !== undefined) await args.terminateOwnedTree(exactOwner);
                  else await runtime.terminateOwnedTree(exactOwner, timeoutMs);
                });
              } catch (error) {
                failure ??= error as Error;
                try { await attemptNativeRootTermination(); }
                catch {}
              }
            }
          } else {
            needsDeathObservation = true;
            let treeFailure: Error | undefined;
            let terminateTree: CodexDetachedAppServerProcess["terminateTree"];
            try { terminateTree = spawnedChild.terminateTree?.bind(spawnedChild); }
            catch { treeFailure = new Error("Codex provisional termination failed"); }
            if (terminateTree !== undefined) {
              try {
                await boundedCall("Codex provisional termination", async () =>
                  await terminateTree(timeoutMs));
              } catch (error) {
                treeFailure = error as Error;
              }
            } else {
              treeFailure ??= new Error("provisional Codex process cleanup is unavailable");
            }
            if (treeFailure !== undefined) {
              try { await attemptNativeRootTermination(); }
              catch { failure ??= treeFailure; }
            }
          }
        }
        if (needsDeathObservation) {
          try { await waitForObservedDeath(useNativeGeneration); }
          catch (error) {
            failure ??= normalizedError(error, "Codex app-server death observation failed");
          }
        }
        if (failure !== undefined) throw cleanupError(failure);
      });
      terminal = cleanup;
      return cleanup;
    };

    const latchFault = (error: Error): Error => {
      terminalFault ??= error;
      return terminalFault;
    };

    const settleAfterCleanup = (
      entries: readonly PendingRequest[],
      rejection: Error,
    ): Promise<void> => {
      const cleanup = ensureCleanup();
      void cleanup.then(
        () => { for (const entry of entries) entry.reject(rejection); },
        (failure: unknown) => {
          const rejected = cleanupError(failure);
          for (const entry of entries) entry.reject(rejected);
        },
      );
      return cleanup;
    };

    const failSession = (error: Error): Promise<void> => {
      const cause = latchFault(error);
      const entries = clearAndTakePending();
      return settleAfterCleanup(entries, cause);
    };

    const cleanupBeforeThrow = async (error: unknown): Promise<never> => {
      const normalized = normalizedError(error, "Codex app-server operation failed");
      try { await failSession(normalized); }
      catch (failure) { throw cleanupError(failure); }
      throw terminalFault!;
    };

    const throwLatchedFault = async (): Promise<void> => {
      if (terminalFault === undefined) return;
      try { await ensureCleanup(); }
      catch (failure) { throw cleanupError(failure); }
      throw terminalFault;
    };

    const request = async (method: string, params: unknown, notification = false): Promise<unknown> => {
      await throwLatchedFault();
      if (channelClosed) {
        throw new Error("Codex app-server is unavailable");
      }
      if (notification) {
        try {
          child!.write(`${JSON.stringify({ method, params })}\n`);
        } catch {
          return await cleanupBeforeThrow(new Error("Codex app-server notification write failed"));
        }
        await throwLatchedFault();
        return undefined;
      }
      const id = nextId++;
      const result = deferredResult<unknown>();
      let timer: ReturnType<CodexDetachedClock["setTimeout"]>;
      try {
        timer = runtime.clock.setTimeout(() => {
          void failSession(new Error(`${method} timed out`));
        }, timeoutMs);
      } catch {
        return await cleanupBeforeThrow(new Error("Codex app-server request timer failed"));
      }
      pending.set(id, { ...result, timer });
      try {
        child!.write(`${JSON.stringify({ id, method, params })}\n`);
      } catch {
        pending.delete(id);
        clearRequestTimer(timer);
        return await cleanupBeforeThrow(new Error("Codex app-server request write failed"));
      }
      const value = await result.promise;
      await throwLatchedFault();
      return value;
    };

    const protocolFault = (message: string): void => {
      void failSession(new Error(message));
    };

    const acceptMessage = (message: unknown): void => {
      if (!record(message)) {
        protocolFault("Codex app-server emitted a non-object JSONL message");
        return;
      }
      if (message["id"] === undefined) {
        if (
          nonBlankString(message["method"])
          && !Object.hasOwn(message, "result")
          && !Object.hasOwn(message, "error")
        ) return;
        protocolFault("Codex app-server emitted malformed JSONL");
        return;
      }
      const responseId = message["id"];
      if (!Number.isSafeInteger(responseId)) {
        protocolFault("Codex app-server emitted an invalid response id");
        return;
      }
      const id = responseId as number;
      const hasResult = Object.hasOwn(message, "result");
      const hasError = Object.hasOwn(message, "error");
      if (hasResult === hasError) {
        protocolFault("Codex app-server emitted a malformed response");
        return;
      }
      const entry = pending.get(id);
      if (entry === undefined) {
        protocolFault("Codex app-server emitted an unknown response id");
        return;
      }
      if (hasError) {
        protocolFault("Codex app-server RPC error");
        return;
      }
      if (!clearRequestTimer(entry.timer)) {
        void failSession(requestTimerCleanupFailure!);
        return;
      }
      pending.delete(id);
      entry.resolve(message["result"]);
    };

    const acceptStdout = (chunk: string | Uint8Array): void => {
      if (channelClosed) return;
      if (typeof chunk === "string") {
        buffer += decoder.decode();
        buffer += chunk;
      } else {
        buffer += decoder.decode(chunk, { stream: true });
      }
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const raw of lines) {
        const line = raw.trim();
        if (line === "") continue;
        let message: unknown;
        try { message = JSON.parse(line) as unknown; }
        catch {
          protocolFault("Codex app-server emitted malformed JSONL");
          return;
        }
        acceptMessage(message);
      }
    };

    const deliverProcessEvent = (event: ProcessEvent): void => {
      if (event.kind === "stdout") {
        acceptStdout(event.chunk);
        return;
      }
      if (event.kind === "exit") rootExited = true;
      if (channelClosed) return;
      if (event.kind === "error") {
        void failSession(new Error("Codex app-server process error"));
      } else {
        void failSession(new Error("Codex app-server exited early"));
      }
    };

    const events: CodexAppServerProcessEvents = {
      stdout: (chunk) => { deliverProcessEvent({ kind: "stdout", chunk }); },
      error: () => { deliverProcessEvent({ kind: "error" }); },
      exit: () => { deliverProcessEvent({ kind: "exit" }); },
    };

    try {
      const command = pinnedCommand(args.cwd, env, runtime.resolvePinnedEntrypoint);
      try {
        child = (args.spawn ?? runtime.spawn)(command, events);
      } catch {
        const spawnFailure = new Error("Codex app-server spawn failed");
        terminalFault = spawnFailure;
        throw spawnFailure;
      }
      await throwLatchedFault();
      const pid = child.pid;
      if (!positiveSafePid(pid)) {
        throw new Error("Codex app-server did not expose a positive pid");
      }
      const acquired = await boundedCall("Codex ownership acquisition", async () =>
        args.observeOwnership === undefined
          ? await runtime.acquireOwnership(pid, timeoutMs)
          : await args.observeOwnership({ pid, platform: runtime.platform, timeoutMs }));
      await throwLatchedFault();
      if (!validOwner(acquired, pid, runtime.platform)) {
        throw new Error("exact Codex process ownership was not acquired");
      }
      const openedOwner = immutableOwner(acquired);
      owner = openedOwner;
      await throwLatchedFault();
      const initialized = await request("initialize", { clientInfo: { name: "storytree", version: "0.0.0" } });
      if (!record(initialized)) throw new Error("initialize returned an invalid result");
      await throwLatchedFault();
      await request("initialized", {}, true);
      const started = responseThread(await request("thread/start", {
        model: args.model,
        config: { model_reasoning_effort: args.reasoningEffort },
        ephemeral: true,
      }));
      if (started === undefined) throw new Error("thread/start returned an invalid thread identity");
      await throwLatchedFault();
      return {
        ...started,
        pid,
        owner: openedOwner,
        startTurn: async (prompt) => {
          await throwLatchedFault();
          if (typeof prompt !== "string" || prompt.trim() === "") {
            return await cleanupBeforeThrow(new Error("turn prompt must not be blank"));
          }
          try {
            const turn = responseTurn(await request("turn/start", {
              threadId: started.threadId,
              input: [{ type: "text", text: prompt, text_elements: [] }],
            }));
            if (turn === undefined) throw new Error("turn/start returned an invalid result");
            await throwLatchedFault();
            return turn;
          } catch (error) {
            return await cleanupBeforeThrow(error);
          }
        },
        probe: async () => {
          await throwLatchedFault();
          const live = await observeExactOwner(openedOwner).catch(() => undefined);
          await throwLatchedFault();
          if (live === undefined) return { live: "unavailable", rateLimits: undefined };
          if (!live) return { live: false, rateLimits: undefined };
          try {
            const limits = responseRateLimits(
              await request("account/rateLimits/read", null),
              new Date(runtime.clock.now()).toISOString(),
            );
            if (limits === INVALID_RATE_LIMITS) throw new Error("account/rateLimits/read returned an invalid result");
            return { live: true, rateLimits: limits };
          } catch (error) {
            return await cleanupBeforeThrow(error);
          }
        },
        terminate: async () => {
          const entries = clearAndTakePending();
          await settleAfterCleanup(entries, new Error("Codex app-server terminated"));
        },
      };
    } catch (error) {
      return await cleanupBeforeThrow(error);
    }
  };
}

export const openPinnedCodexDetachedThread = async (
  args: OpenPinnedCodexDetachedThreadArgs,
): Promise<CodexDetachedThread> => await createOpenPinnedCodexDetachedThread(codexDetachedProductionRuntime)({
  cwd: args.cwd,
  env: args.env ?? process.env,
  model: args.model,
  reasoningEffort: args.reasoningEffort,
  timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
});

/** Direct-module-only recovery composition seam; the public barrel remains production-bound. */
export function createRecoverCodexDetachedOwner(
  runtime: CodexDetachedRuntime,
): (args: RecoverCodexDetachedOwnerArgs) => CodexDetachedOwnerController {
  return (args) => {
    const timeoutMs = positiveTimeout(args.timeoutMs);
    const owner = immutableOwner(args.owner);
    const ownerIsUsable = validOwner(owner, owner.rootPid, runtime.platform)
      && validPersistedOwner(owner, runtime.platform);
    let termination: Promise<void> | undefined;

    const observe = async (): Promise<CodexDetachedOwnerObservation> => {
      if (!ownerIsUsable) return { status: "unavailable" };
      try {
        return await runtime.observeOwnership(owner, timeoutMs);
      } catch {
        return { status: "unavailable" };
      }
    };

    const isExactLiveOwner = (observation: CodexDetachedOwnerObservation): boolean =>
      observation.status === "live" && sameOwner(observation.owner, owner);

    return {
      owner,
      probe: async () => {
        const observation = await observe();
        if (observation.status === "unavailable") return { live: "unavailable" };
        return { live: isExactLiveOwner(observation) };
      },
      terminate: async () => {
        termination ??= (async () => {
          const initial = await observe();
          if (initial.status === "unavailable") {
            throw new Error("Codex detached owner is unavailable");
          }
          // A vanished or replaced root is already dead for this controller.  In either case a
          // numeric pid is deliberately not reused as a termination target.
          if (!isExactLiveOwner(initial)) return;
          try {
            await runtime.terminateOwnedTree(owner, timeoutMs);
          } catch (error) {
            throw cleanupError(normalizedError(error, "Codex detached owner termination failed"));
          }

          for (let attempt = 0; attempt < MAX_CLEANUP_POLLS; attempt += 1) {
            const observation = await observe();
            if (observation.status === "unavailable") {
              throw cleanupError(new Error("Codex detached owner death observation failed"));
            }
            if (!isExactLiveOwner(observation)) return;
            const remaining = timeoutMs - (attempt * CLEANUP_POLL_MS);
            if (remaining <= 0) break;
            await runtime.clock.delay(Math.min(CLEANUP_POLL_MS, remaining));
          }
          throw cleanupError(new Error("Codex detached owner did not become dead"));
        })();
        await termination;
      },
    };
  };
}

export const recoverCodexDetachedOwner = createRecoverCodexDetachedOwner(
  codexDetachedProductionRuntime,
);
