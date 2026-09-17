import { execFile, spawn } from "node:child_process";
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
import type { CodexAppServerCommand, CodexAppServerProcessEvents } from "./codex-rate-limits.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const CLEANUP_POLL_MS = 10;

export type CodexDetachedOwner =
  | { readonly kind: "posix-process-group"; readonly rootPid: number; readonly token: string }
  | { readonly kind: "windows-process-tree"; readonly rootPid: number; readonly token: string };

export interface CodexDetachedAppServerProcess {
  readonly pid: number | undefined;
  write(line: string): void;
  end(): void;
  /** Exact-tree cleanup available before a public owner has been validated. */
  terminateTree?(timeoutMs: number): Promise<void>;
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
  probe(): Promise<{ readonly live: boolean | "unavailable"; readonly rateLimits: Readonly<Record<string, unknown>> | undefined }>;
  terminate(): Promise<void>;
}

export type CodexDetachedTurnStatus = "completed" | "interrupted" | "failed" | "inProgress";

export interface CodexDetachedClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
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

function positiveSafePid(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  if (value <= 0) return DEFAULT_TIMEOUT_MS;
  if (value > MAX_TIMER_DELAY_MS) return DEFAULT_TIMEOUT_MS;
  return value;
}

function sameOwner(left: CodexDetachedOwner, right: CodexDetachedOwner): boolean {
  return left.kind === right.kind && left.rootPid === right.rootPid && left.token === right.token;
}

function validOwner(
  candidate: CodexDetachedOwner | undefined,
  pid: number,
  platform: "posix" | "windows",
): candidate is CodexDetachedOwner {
  if (candidate === undefined) return false;
  if (!positiveSafePid(candidate.rootPid)) return false;
  if (candidate.rootPid !== pid) return false;
  if (!nonBlankString(candidate.token)) return false;
  if (platform === "posix") return candidate.kind === "posix-process-group";
  return candidate.kind === "windows-process-tree";
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

function windowsTaskRow(line: string): { readonly pid: number; readonly token: string } | undefined {
  const match = /^"((?:[^"]|"")*)","([0-9]+)","((?:[^"]|"")*)","([0-9]+)","(?:[^"]|"")*"$/.exec(line.trim());
  if (match === null) return undefined;
  const pid = Number(match[2]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  const image = match[1]!.replaceAll('""', '"');
  const sessionName = match[3]!.replaceAll('""', '"');
  const sessionId = match[4]!;
  // Mem Usage is deliberately excluded because it changes for the same process. Tasklist exposes no
  // immutable creation time; the child-exit latch closes the known spawn generation, while this stable
  // exact-row subset is the re-observable root descriptor used by the tasklist/taskkill contract.
  return { pid, token: `${image}\u0000${pid}\u0000${sessionName}\u0000${sessionId}` };
}

function windowsOwnerFromTasklist(stdout: string, pid: number): CodexDetachedOwner | undefined {
  const matches = stdout
    .split(/\r?\n/u)
    .map(windowsTaskRow)
    .filter((row): row is { readonly pid: number; readonly token: string } => row !== undefined && row.pid === pid);
  if (matches.length !== 1) return undefined;
  return { kind: "windows-process-tree", rootPid: pid, token: matches[0]!.token };
}

function noSuchProcess(error: unknown): boolean {
  return record(error) && error["code"] === "ESRCH";
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
  const windowsSpawnOwners = new Map<number, CodexDetachedOwner>();
  const windowsClosedRoots = new Set<number>();

  const inspectWindowsRoot = async (pid: number, timeoutMs: number): Promise<CodexDetachedOwner | undefined> => {
    const result = await deps.execFile(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { timeout: timeoutMs },
    );
    return windowsOwnerFromTasklist(result.stdout, pid);
  };

  const observePosixGroup = (pid: number): CodexDetachedOwnerObservation => {
    try {
      deps.signal(-pid, 0);
      return {
        status: "live",
        owner: { kind: "posix-process-group", rootPid: pid, token: `pgid:${pid}` },
      };
    } catch (error) {
      return noSuchProcess(error) ? { status: "dead" } : { status: "unavailable" };
    }
  };

  const observeSpawnedTree = async (pid: number, timeoutMs: number): Promise<boolean | undefined> => {
    if (!positiveSafePid(pid)) return undefined;
    if (deps.platform === "posix") {
      const observation = observePosixGroup(pid);
      if (observation.status === "live") return true;
      if (observation.status === "dead") return false;
      return undefined;
    }
    if (windowsClosedRoots.has(pid)) return false;
    const expected = windowsSpawnOwners.get(pid);
    if (expected === undefined) return undefined;
    try {
      const observed = await inspectWindowsRoot(pid, timeoutMs);
      if (observed === undefined || !sameOwner(expected, observed)) {
        windowsSpawnOwners.delete(pid);
        windowsClosedRoots.add(pid);
        return false;
      }
      return true;
    } catch {
      return undefined;
    }
  };

  const terminateSpawnedTree = async (pid: number, timeoutMs: number): Promise<void> => {
    if (!positiveSafePid(pid)) throw new Error("Codex app-server provisional pid is invalid");
    if (deps.platform === "posix") {
      deps.signal(-pid, "SIGTERM");
      return;
    }
    if (windowsClosedRoots.has(pid)) return;
    const expected = windowsSpawnOwners.get(pid);
    if (expected === undefined) {
      throw new Error("Codex provisional Windows owner is unavailable");
    }
    const observed = await inspectWindowsRoot(pid, timeoutMs);
    if (windowsClosedRoots.has(pid) || observed === undefined || !sameOwner(expected, observed)) {
      windowsSpawnOwners.delete(pid);
      windowsClosedRoots.add(pid);
      return;
    }
    await deps.execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: timeoutMs });
  };

  const appServerSpawn: CodexDetachedAppServerSpawner = (command, events) => {
    const child = deps.nativeSpawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    });
    if (deps.platform === "windows" && child.pid !== undefined) windowsClosedRoots.delete(child.pid);
    child.stdout.on("data", events.stdout);
    child.stderr.on("data", () => undefined);
    child.once("error", events.error);
    child.stdin.once("error", events.error);
    child.once("exit", (code, signal) => {
      if (deps.platform === "windows" && child.pid !== undefined) {
        windowsSpawnOwners.delete(child.pid);
        windowsClosedRoots.add(child.pid);
      }
      events.exit(code, signal);
    });
    return {
      pid: child.pid,
      write: (line) => { child.stdin.write(line); },
      end: () => { child.stdin.end(); },
      terminateTree: async (timeoutMs) => {
        if (!positiveSafePid(child.pid)) throw new Error("Codex app-server provisional pid is unavailable");
        await terminateSpawnedTree(child.pid, timeoutMs);
      },
      observeTree: async (timeoutMs) => {
        if (!positiveSafePid(child.pid)) return undefined;
        return await observeSpawnedTree(child.pid, timeoutMs);
      },
    };
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
        if (windowsClosedRoots.has(pid)) return undefined;
        const observed = await inspectWindowsRoot(pid, timeoutMs);
        if (observed === undefined) {
          windowsSpawnOwners.delete(pid);
          windowsClosedRoots.add(pid);
        } else {
          windowsSpawnOwners.set(pid, observed);
        }
        return observed;
      }
      const observation = observePosixGroup(pid);
      return observation.status === "live" ? observation.owner : undefined;
    },
    observeOwnership: async (owner, timeoutMs) => {
      if (!positiveSafePid(owner.rootPid)) return { status: "unavailable" };
      if (deps.platform === "posix") {
        if (owner.kind !== "posix-process-group") return { status: "unavailable" };
        return observePosixGroup(owner.rootPid);
      }
      if (owner.kind !== "windows-process-tree") return { status: "unavailable" };
      if (windowsClosedRoots.has(owner.rootPid)) return { status: "dead" };
      try {
        const observed = await inspectWindowsRoot(owner.rootPid, timeoutMs);
        if (observed === undefined) {
          windowsSpawnOwners.delete(owner.rootPid);
          windowsClosedRoots.add(owner.rootPid);
          return { status: "dead" };
        }
        if (!sameOwner(owner, observed)) windowsClosedRoots.add(owner.rootPid);
        return { status: "live", owner: observed };
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
      if (windowsClosedRoots.has(owner.rootPid)) return;
      const observed = await inspectWindowsRoot(owner.rootPid, timeoutMs);
      if (windowsClosedRoots.has(owner.rootPid) || observed === undefined || !sameOwner(owner, observed)) {
        windowsSpawnOwners.delete(owner.rootPid);
        windowsClosedRoots.add(owner.rootPid);
        return;
      }
      await deps.execFile(
        "taskkill",
        ["/PID", String(owner.rootPid), "/T", "/F"],
        { timeout: timeoutMs },
      );
      windowsSpawnOwners.delete(owner.rootPid);
    },
  };
}

/** Direct-module-only production composition; the barrel exposes only the narrow opener. */
export const codexDetachedProductionRuntime = createCodexDetachedRuntime({
  platform: process.platform === "win32" ? "windows" : "posix",
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

function responseRateLimits(value: unknown): Readonly<Record<string, unknown>> | typeof INVALID_RATE_LIMITS {
  if (!record(value)) return INVALID_RATE_LIMITS;
  const rateLimits = value["rateLimits"];
  return record(rateLimits) ? rateLimits : INVALID_RATE_LIMITS;
}

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function cleanupError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith("Codex app-server cleanup failed:")) return error;
  const message = error instanceof Error ? error.message : "unknown cleanup failure";
  return new Error(`Codex app-server cleanup failed: ${message}`);
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
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
    ): Promise<T> =>
      await new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = runtime.clock.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(`${label} timed out`));
        }, boundMs);
        void Promise.resolve().then(operation).then(
          (value) => {
            if (settled) return;
            settled = true;
            runtime.clock.clearTimeout(timer);
            resolve(value);
          },
          () => {
            if (settled) return;
            settled = true;
            runtime.clock.clearTimeout(timer);
            reject(new Error(`${label} failed`));
          },
        );
      });

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
    let channelState: "opening" | "open" | "closing" | "closed" = "opening";
    let terminal: Promise<void> | undefined;
    let terminalFault: Error | undefined;
    let spawnReturned = false;
    let rootExited = false;
    let nextId = 1;
    let buffer = "";
    const decoder = new TextDecoder();
    const pending = new Map<number, PendingRequest>();
    type ProcessEvent =
      | { readonly kind: "stdout"; readonly chunk: string | Uint8Array }
      | { readonly kind: "error" }
      | { readonly kind: "exit" };
    const queuedEvents: ProcessEvent[] = [];

    const clearAndTakePending = (): PendingRequest[] => {
      const entries = [...pending.values()];
      pending.clear();
      for (const entry of entries) runtime.clock.clearTimeout(entry.timer);
      return entries;
    };

    const observeExactOwner = async (): Promise<boolean | undefined> => {
      if (owner === undefined) return false;
      if (owner.kind === "windows-process-tree" && rootExited) return false;
      if (args.observeLiveness !== undefined) {
        return await boundedCall("Codex owner liveness observation", async () =>
          await args.observeLiveness!(owner!));
      }
      if (args.observeOwnership !== undefined) {
        const observed = await boundedCall("Codex owner observation", async () =>
          await args.observeOwnership!({ pid: owner!.rootPid, platform: runtime.platform, timeoutMs }));
        return observed === undefined ? false : sameOwner(owner, observed);
      }
      const observation = await boundedCall("Codex owner observation", async () =>
        await runtime.observeOwnership(owner!, timeoutMs));
      if (observation.status === "unavailable") return undefined;
      if (observation.status === "dead") return false;
      return sameOwner(owner, observation.owner);
    };

    const observeCleanupTarget = async (): Promise<boolean | undefined> => {
      if (owner !== undefined) return await observeExactOwner();
      if (child?.observeTree === undefined) return undefined;
      return await boundedCall("Codex provisional observation", async () =>
        await child!.observeTree!(timeoutMs));
    };

    const waitForObservedDeath = async (): Promise<void> => {
      const deadline = runtime.clock.now() + timeoutMs;
      for (;;) {
        const live = await observeCleanupTarget();
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
    };

    const ensureCleanup = (): Promise<void> => {
      if (terminal !== undefined) return terminal;
      channelState = "closing";
      let resolveCleanup!: () => void;
      let rejectCleanup!: (error: unknown) => void;
      const sharedCleanup = new Promise<void>((resolve, reject) => {
        resolveCleanup = resolve;
        rejectCleanup = reject;
      });
      terminal = sharedCleanup;
      const cleanupRun = (async () => {
        if (child === undefined) {
          channelState = "closed";
          return;
        }
        let failure: unknown;
        const windowsRootAlreadyExited = runtime.platform === "windows" && rootExited;
        let needsDeathObservation = owner === undefined && !windowsRootAlreadyExited;
        try { child.end(); }
        catch { failure = new Error("Codex app-server protocol close failed"); }
        try {
          if (windowsRootAlreadyExited) {
            // A Windows PID is no longer an ownership handle after its root exits.
          } else if (owner !== undefined) {
            needsDeathObservation = false;
            const live = await observeExactOwner();
            if (live === undefined) {
              throw new Error("Codex app-server ownership observation was unavailable before termination");
            }
            if (live) {
              if (runtime.platform === "windows" && rootExited) {
                needsDeathObservation = false;
              } else {
                needsDeathObservation = true;
                await boundedCall("Codex owner termination", async () => {
                  if (args.terminateOwnedTree !== undefined) await args.terminateOwnedTree(owner!);
                  else await runtime.terminateOwnedTree(owner!, timeoutMs);
                });
              }
            }
          } else {
            if (child.terminateTree === undefined) {
              throw new Error("provisional Codex process cleanup is unavailable");
            }
            await boundedCall("Codex provisional termination", async () =>
              await child!.terminateTree!(timeoutMs));
          }
        } catch (error) {
          failure ??= error;
        }
        if (needsDeathObservation) {
          try { await waitForObservedDeath(); }
          catch (error) { failure ??= error; }
        }
        channelState = "closed";
        if (failure !== undefined) throw cleanupError(failure);
      })();
      void cleanupRun.then(resolveCleanup, rejectCleanup);
      return sharedCleanup;
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
      void cleanup.catch(() => undefined);
      return cleanup;
    };

    const failSession = (error: Error): Promise<void> => {
      const cause = latchFault(error);
      const entries = clearAndTakePending();
      return settleAfterCleanup(entries, cause);
    };

    const cleanupBeforeThrow = async (error: Error): Promise<never> => {
      try { await failSession(error); }
      catch (failure) { throw cleanupError(failure); }
      throw terminalFault ?? error;
    };

    const throwLatchedFault = async (): Promise<void> => {
      if (terminalFault === undefined) return;
      try { await ensureCleanup(); }
      catch (failure) { throw cleanupError(failure); }
      throw terminalFault;
    };

    const request = async (method: string, params: unknown, notification = false): Promise<unknown> => {
      await throwLatchedFault();
      if (child === undefined || channelState !== "open") {
        throw new Error("Codex app-server is unavailable");
      }
      if (notification) {
        try {
          child.write(`${JSON.stringify({ method, params })}\n`);
        } catch {
          return await cleanupBeforeThrow(new Error("Codex app-server notification write failed"));
        }
        await throwLatchedFault();
        return undefined;
      }
      const id = nextId++;
      const result = await new Promise<unknown>((resolve, reject) => {
        const timer = runtime.clock.setTimeout(() => {
          void failSession(new Error(`${method} timed out`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          child!.write(`${JSON.stringify({ id, method, params })}\n`);
        } catch {
          void failSession(new Error("Codex app-server request write failed"));
        }
      });
      await throwLatchedFault();
      return result;
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
      if (typeof responseId !== "number" || !Number.isSafeInteger(responseId)) {
        protocolFault("Codex app-server emitted an invalid response id");
        return;
      }
      const hasResult = Object.hasOwn(message, "result");
      const hasError = Object.hasOwn(message, "error");
      if (hasResult === hasError) {
        protocolFault("Codex app-server emitted a malformed response");
        return;
      }
      const entry = pending.get(responseId);
      if (entry === undefined) {
        protocolFault("Codex app-server emitted an unknown response id");
        return;
      }
      if (hasError) {
        protocolFault("Codex app-server RPC error");
        return;
      }
      pending.delete(responseId);
      runtime.clock.clearTimeout(entry.timer);
      entry.resolve(message["result"]);
    };

    const acceptStdout = (chunk: string | Uint8Array): void => {
      if (channelState === "closing" || channelState === "closed") return;
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
        if (terminal !== undefined) return;
      }
    };

    const deliverProcessEvent = (event: ProcessEvent): void => {
      if (event.kind === "stdout") {
        acceptStdout(event.chunk);
        return;
      }
      if (event.kind === "exit") rootExited = true;
      if (channelState === "closing" || channelState === "closed") return;
      if (event.kind === "error") {
        void failSession(new Error("Codex app-server process error"));
      } else {
        void failSession(new Error("Codex app-server exited early"));
      }
    };

    const receiveProcessEvent = (event: ProcessEvent): void => {
      if (!spawnReturned) {
        queuedEvents.push(event.kind === "stdout" && typeof event.chunk !== "string"
          ? { kind: "stdout", chunk: event.chunk.slice() }
          : event);
        return;
      }
      deliverProcessEvent(event);
    };

    const events: CodexAppServerProcessEvents = {
      stdout: (chunk) => { receiveProcessEvent({ kind: "stdout", chunk }); },
      error: () => { receiveProcessEvent({ kind: "error" }); },
      exit: () => { receiveProcessEvent({ kind: "exit" }); },
    };

    try {
      const command = pinnedCommand(args.cwd, env, runtime.resolvePinnedEntrypoint);
      try {
        child = (args.spawn ?? runtime.spawn)(command, events);
      } catch {
        throw new Error("Codex app-server spawn failed");
      }
      spawnReturned = true;
      for (const event of queuedEvents) deliverProcessEvent(event);
      queuedEvents.length = 0;
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
      owner = acquired;
      await throwLatchedFault();
      if (channelState !== "opening") await throwLatchedFault();
      channelState = "open";
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
      if (channelState !== "open") await throwLatchedFault();
      return {
        ...started,
        pid,
        owner,
        startTurn: async (prompt) => {
          await throwLatchedFault();
          if (prompt.trim() === "") {
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
            return await cleanupBeforeThrow(asError(error, "turn/start failed"));
          }
        },
        probe: async () => {
          await throwLatchedFault();
          let live: boolean | undefined;
          try { live = await observeExactOwner(); }
          catch { live = undefined; }
          await throwLatchedFault();
          if (live === undefined) return { live: "unavailable", rateLimits: undefined };
          if (!live) return { live: false, rateLimits: undefined };
          try {
            const limits = responseRateLimits(await request("account/rateLimits/read", null));
            if (limits === INVALID_RATE_LIMITS) throw new Error("account/rateLimits/read returned an invalid result");
            return { live: true, rateLimits: limits };
          } catch (error) {
            return await cleanupBeforeThrow(asError(error, "rate-limit probe failed"));
          }
        },
        terminate: async () => {
          const entries = clearAndTakePending();
          await settleAfterCleanup(entries, new Error("Codex app-server terminated"));
        },
      };
    } catch (error) {
      return await cleanupBeforeThrow(asError(error, "Codex app-server open failed"));
    }
  };
}

export const openPinnedCodexDetachedThread: (
  args: OpenPinnedCodexDetachedThreadArgs,
) => Promise<CodexDetachedThread> = createOpenPinnedCodexDetachedThread(codexDetachedProductionRuntime);
