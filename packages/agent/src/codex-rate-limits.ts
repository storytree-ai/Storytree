/**
 * Turn-free Codex subscription usage observation through the pinned CLI's app-server.
 *
 * The app-server protocol is staged JSONL over stdio: initialize, initialized, then
 * account/rateLimits/read. No thread or turn method is reachable from this module. Missing account
 * facts remain typed absences; this reader makes no quota cutoff or build-admission decision.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";

import { CODEX_EXECUTABLE_ENV, scrubMeteredCodexAuth } from "./codex-author.js";

const INITIALIZE_REQUEST_ID = 1;
const RATE_LIMIT_REQUEST_ID = 2;
const WEEKLY_WINDOW_MINUTES = 10_080;

export const DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS = 60_000;

export type CodexRateLimitField<T> =
  | { readonly status: "available"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: "not-reported" | "malformed" };

export interface CodexRateLimitWindowAvailable {
  readonly status: "available";
  readonly usedPercent: number;
  readonly windowDurationMins: CodexRateLimitField<number>;
  readonly resetsAt: CodexRateLimitField<number>;
}

export type CodexRateLimitWindow =
  | CodexRateLimitWindowAvailable
  | { readonly status: "unavailable"; readonly reason: "not-reported" | "malformed" };

export interface CodexRateLimitBucketAvailable {
  readonly status: "available";
  readonly limitId: CodexRateLimitField<string>;
  readonly limitName: CodexRateLimitField<string>;
  readonly primary: CodexRateLimitWindow;
  readonly secondary: CodexRateLimitWindow;
}

export type CodexRateLimitBucket =
  | CodexRateLimitBucketAvailable
  | { readonly status: "unavailable"; readonly reason: "malformed" };

export type CodexRateLimitsByLimitId =
  | {
      readonly status: "available";
      readonly value: Readonly<Record<string, CodexRateLimitBucket>>;
    }
  | { readonly status: "unavailable"; readonly reason: "not-reported" | "malformed" };

export type CodexRateLimitResetCredits =
  | { readonly status: "available"; readonly availableCount: number }
  | { readonly status: "unavailable"; readonly reason: "not-reported" | "malformed" };

export type CodexRateLimitUnavailableReason =
  | "spawn-failed"
  | "process-error"
  | "process-exited"
  | "timed-out"
  | "protocol-error"
  | "rpc-error"
  | "invalid-response";

export interface CodexRateLimitSnapshotUnavailable {
  readonly status: "unavailable";
  readonly reason: CodexRateLimitUnavailableReason;
  readonly detail?: string;
}

export interface CodexRateLimitSnapshotAvailable {
  readonly status: "available";
  readonly capturedAt: string;
  readonly weekly: CodexRateLimitWindow;
  readonly rateLimitsByLimitId: CodexRateLimitsByLimitId;
  readonly resetCredits: CodexRateLimitResetCredits;
}

export type CodexRateLimitSnapshot =
  | CodexRateLimitSnapshotAvailable
  | CodexRateLimitSnapshotUnavailable;

export interface CodexAppServerCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface CodexAppServerProcessEvents {
  readonly stdout: (chunk: string | Uint8Array) => void;
  readonly error: (error: Error) => void;
  readonly exit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface CodexAppServerProcess {
  write(line: string): void;
  end(): void;
  kill(): void;
}

export type CodexAppServerSpawner = (
  command: CodexAppServerCommand,
  events: CodexAppServerProcessEvents,
) => CodexAppServerProcess;

export interface CodexNativeAppServerChild {
  readonly stdout: {
    on(event: "data", listener: (chunk: Buffer) => void): unknown;
  };
  readonly stderr: {
    on(event: "data", listener: () => void): unknown;
  };
  readonly stdin: {
    once(event: "error", listener: (error: Error) => void): unknown;
    write(line: string): unknown;
    end(): unknown;
  };
  once(event: "error", listener: (error: Error) => void): unknown;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(): unknown;
}

export interface CodexNativeAppServerSpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: readonly ["pipe", "pipe", "pipe"];
  readonly windowsHide: true;
}

export type CodexNativeAppServerSpawn = (
  executable: string,
  args: readonly string[],
  options: CodexNativeAppServerSpawnOptions,
) => CodexNativeAppServerChild;

export interface CodexRateLimitClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

export interface ReadCodexRateLimitSnapshotArgs {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly spawn?: CodexAppServerSpawner;
  readonly clock?: CodexRateLimitClock;
}

const SYSTEM_CLOCK: CodexRateLimitClock = {
  now: Date.now,
  setTimeout,
  clearTimeout,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field<T>(value: T): CodexRateLimitField<T> {
  return { status: "available", value };
}

function absentField<T>(reason: "not-reported" | "malformed"): CodexRateLimitField<T> {
  return { status: "unavailable", reason };
}

function optionalString(value: unknown): CodexRateLimitField<string> {
  if (value === null || value === undefined) return absentField("not-reported");
  return typeof value === "string" ? field(value) : absentField("malformed");
}

function optionalNonNegativeInteger(value: unknown): CodexRateLimitField<number> {
  if (value === null || value === undefined) return absentField("not-reported");
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? field(value as number)
    : absentField("malformed");
}

function validPercent(value: unknown): value is number {
  // The pinned app-server schema leaves this unbounded, and its backend value can describe an
  // overage. Preserve that signal for later policy instead of silently turning 101% into absence.
  return Number.isFinite(value) && (value as number) >= 0;
}

function parseWindow(value: unknown): CodexRateLimitWindow {
  if (value === null || value === undefined) {
    return { status: "unavailable", reason: "not-reported" };
  }
  if (!isRecord(value) || !validPercent(value["usedPercent"])) {
    return { status: "unavailable", reason: "malformed" };
  }
  return {
    status: "available",
    usedPercent: value["usedPercent"],
    windowDurationMins: optionalNonNegativeInteger(value["windowDurationMins"]),
    resetsAt: optionalNonNegativeInteger(value["resetsAt"]),
  };
}

function parseBucket(value: Record<string, unknown>): CodexRateLimitBucketAvailable;
function parseBucket(value: unknown): CodexRateLimitBucket;
function parseBucket(value: unknown): CodexRateLimitBucket {
  if (!isRecord(value)) return { status: "unavailable", reason: "malformed" };
  return {
    status: "available",
    limitId: optionalString(value["limitId"]),
    limitName: optionalString(value["limitName"]),
    primary: parseWindow(value["primary"]),
    secondary: parseWindow(value["secondary"]),
  };
}

function parseLimitsById(value: unknown): CodexRateLimitsByLimitId {
  if (value === null || value === undefined) {
    return { status: "unavailable", reason: "not-reported" };
  }
  if (!isRecord(value)) return { status: "unavailable", reason: "malformed" };
  return {
    status: "available",
    value: Object.fromEntries(
      Object.entries(value).map(([limitId, bucket]) => [limitId, parseBucket(bucket)]),
    ),
  };
}

function parseResetCredits(value: unknown): CodexRateLimitResetCredits {
  if (value === null || value === undefined) {
    return { status: "unavailable", reason: "not-reported" };
  }
  // Stryker disable next-line ConditionalExpression: EQUIVALENT for JSON-domain values — every
  // non-record also lacks a valid `availableCount` and reaches the same malformed result; the guard
  // exists to keep property access explicit and safe rather than to choose a different observation.
  if (!isRecord(value)) return { status: "unavailable", reason: "malformed" };
  const availableCount = value["availableCount"];
  return Number.isSafeInteger(availableCount) && (availableCount as number) >= 0
    ? { status: "available", availableCount: availableCount as number }
    : { status: "unavailable", reason: "malformed" };
}

function weeklyWindow(bucket: CodexRateLimitBucketAvailable): CodexRateLimitWindow {
  for (const window of [bucket.primary, bucket.secondary]) {
    if (
      window.status === "available" &&
      // Stryker disable next-line ConditionalExpression: EQUIVALENT — an unavailable field has no
      // `value`, so forcing this narrowing check true still cannot equal the weekly duration below.
      window.windowDurationMins.status === "available" &&
      window.windowDurationMins.value === WEEKLY_WINDOW_MINUTES
    ) {
      return window;
    }
  }
  return { status: "unavailable", reason: "not-reported" };
}

function unavailable(
  reason: CodexRateLimitUnavailableReason,
  detail?: string,
): CodexRateLimitSnapshotUnavailable {
  return detail === undefined ? { status: "unavailable", reason } : { status: "unavailable", reason, detail };
}

function parseRateLimitResponse(
  value: unknown,
  capturedAt: string,
): CodexRateLimitSnapshot {
  if (!isRecord(value) || !isRecord(value["rateLimits"])) {
    return unavailable(
      "invalid-response",
      "account/rateLimits/read did not return a rateLimits object",
    );
  }
  const account = parseBucket(value["rateLimits"]);
  return {
    status: "available",
    capturedAt,
    weekly: weeklyWindow(account),
    rateLimitsByLimitId: parseLimitsById(value["rateLimitsByLimitId"]),
    resetCredits: parseResetCredits(value["rateLimitResetCredits"]),
  };
}

function resolvePinnedCodexEntrypoint(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex/package.json");
  return path.join(path.dirname(packageJson), "bin", "codex.js");
}

function buildAppServerCommand(
  cwd: string,
  sourceEnv: NodeJS.ProcessEnv,
): CodexAppServerCommand {
  const env = scrubMeteredCodexAuth(sourceEnv);
  const configuredExecutable = env[CODEX_EXECUTABLE_ENV]?.trim();
  if (configuredExecutable !== undefined && !path.isAbsolute(configuredExecutable)) {
    throw new Error(`${CODEX_EXECUTABLE_ENV} must name an absolute executable`);
  }
  return configuredExecutable === undefined
    ? {
        executable: process.execPath,
        args: [resolvePinnedCodexEntrypoint(), "app-server", "--stdio"],
        cwd,
        env,
      }
    : { executable: configuredExecutable, args: ["app-server", "--stdio"], cwd, env };
}

/** Build the concrete stdio adapter separately so the operating-system boundary is injectable. */
export function createCodexAppServerSpawner(
  nativeSpawn: CodexNativeAppServerSpawn,
): CodexAppServerSpawner {
  return (command, events) => {
    const child = nativeSpawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => events.stdout(chunk));
    // Drain diagnostics so a noisy refusal cannot fill the pipe and wedge the bounded read. The RPC
    // error remains the typed public observation; stderr is not parsed into account state.
    child.stderr.on("data", () => undefined);
    child.once("error", events.error);
    child.stdin.once("error", events.error);
    child.once("exit", events.exit);
    return {
      write: (line) => {
        child.stdin.write(line);
      },
      end: () => child.stdin.end(),
      kill: () => {
        child.kill();
      },
    };
  };
}

/** Direct-module export for proving the production composition without exposing it from the barrel. */
export const spawnCodexAppServer = createCodexAppServerSpawner(
  spawn as CodexNativeAppServerSpawn,
);

function rpcErrorDetail(value: unknown): string {
  if (!isRecord(value)) return "app-server returned an RPC error";
  const code = typeof value["code"] === "number" ? String(value["code"]) : "unknown";
  const message = typeof value["message"] === "string" ? value["message"] : "unknown error";
  return `app-server RPC ${code}: ${message}`;
}

/**
 * Read the current Codex account limits without starting a thread or model turn.
 *
 * The whole staged exchange is bounded. Production uses the repository-pinned CLI wrapper and the
 * saved ChatGPT login after removing every metered credential environment variable.
 */
export async function readCodexRateLimitSnapshot(
  args: ReadCodexRateLimitSnapshotArgs,
): Promise<CodexRateLimitSnapshot> {
  const clock = args.clock ?? SYSTEM_CLOCK;
  const appServerSpawn = args.spawn ?? spawnCodexAppServer;
  const configuredTimeout = args.timeoutMs ?? DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS;

  return await new Promise<CodexRateLimitSnapshot>((resolve) => {
    let child: CodexAppServerProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let state: "initialize" | "rate-limit" | "exit" = "initialize";
    let stdout = "";
    let pendingSnapshot: CodexRateLimitSnapshotAvailable | undefined;
    const decoder = new TextDecoder();

    const releaseTimer = (): void => {
      if (timer === undefined) return;
      clock.clearTimeout(timer);
      timer = undefined;
    };

    const stopProcess = (process: CodexAppServerProcess): void => {
      try {
        process.end();
      } catch {
        // The result already describes why this exchange is unavailable.
      }
      try {
        process.kill();
      } catch {
        // A process that already disappeared still leaves the same typed observation.
      }
    };

    const finish = (result: CodexRateLimitSnapshot, stopChild: boolean): void => {
      if (settled) return;
      settled = true;
      releaseTimer();
      if (stopChild) {
        // Stryker disable next-line ConditionalExpression: EQUIVALENT — before assignment, calling
        // `stopProcess(undefined)` only enters its two guarded catches; after assignment this is true.
        if (child !== undefined) stopProcess(child);
      }
      resolve(result);
    };

    const write = (message: unknown): boolean => {
      try {
        child!.write(`${JSON.stringify(message)}\n`);
        return true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        finish(unavailable("process-error", detail), true);
        return false;
      }
    };

    const acceptMessage = (message: unknown): void => {
      if (!isRecord(message)) {
        finish(unavailable("protocol-error", "app-server emitted a non-object JSONL message"), true);
        return;
      }
      if (state === "initialize" && message["id"] === INITIALIZE_REQUEST_ID) {
        if (message["error"] !== undefined) {
          finish(unavailable("rpc-error", rpcErrorDetail(message["error"])), true);
          return;
        }
        if (!isRecord(message["result"])) {
          finish(unavailable("protocol-error", "initialize returned no result object"), true);
          return;
        }
        state = "rate-limit";
        if (!write({ method: "initialized" })) return;
        write({ id: RATE_LIMIT_REQUEST_ID, method: "account/rateLimits/read", params: null });
        return;
      }
      if (state !== "rate-limit" || message["id"] !== RATE_LIMIT_REQUEST_ID) return;
      if (message["error"] !== undefined) {
        finish(unavailable("rpc-error", rpcErrorDetail(message["error"])), true);
        return;
      }
      const parsed = parseRateLimitResponse(
        message["result"],
        new Date(clock.now()).toISOString(),
      );
      if (parsed.status !== "available") {
        finish(parsed, true);
        return;
      }
      pendingSnapshot = parsed;
      // Stryker disable next-line StringLiteral: EQUIVALENT — this is a terminal sentinel; every
      // string other than the two active phase names has identical message-routing behaviour.
      state = "exit";
      try {
        child!.end();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        finish(unavailable("process-error", detail), true);
      }
    };

    const acceptStdout = (chunk: string | Uint8Array): void => {
      // Stryker disable next-line ConditionalExpression: RESOURCE GUARD — downstream settled guards
      // preserve the answer, while this one prevents needless decoding and buffering after it.
      if (settled) return;
      stdout += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      const lines = stdout.split("\n");
      // `split` always returns at least one member, including for the empty string.
      stdout = lines.pop()!;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line === "") continue;
        let message: unknown;
        try {
          message = JSON.parse(line) as unknown;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          finish(unavailable("protocol-error", `malformed app-server JSONL: ${detail}`), true);
          return;
        }
        acceptMessage(message);
        // Stryker disable next-line ConditionalExpression: RESOURCE GUARD — `acceptMessage` already
        // ignores every later line once settled; returning here only avoids parsing inert tail data.
        if (settled) return;
      }
    };

    const events: CodexAppServerProcessEvents = {
      stdout: acceptStdout,
      error: (error) => finish(unavailable("process-error", error.message), true),
      exit: (code, signal) => {
        // Stryker disable next-line ConditionalExpression: EQUIVALENT — `finish` has the same settled
        // guard, and this callback performs no work before reaching it.
        if (settled) return;
        if (pendingSnapshot !== undefined && code === 0 && signal === null) {
          finish(pendingSnapshot, false);
          return;
        }
        finish(
          unavailable(
            "process-exited",
            `app-server exited before the rate-limit response (code=${code ?? "none"}, signal=${signal ?? "none"})`,
          ),
          false,
        );
      },
    };

    let command: CodexAppServerCommand;
    try {
      command = buildAppServerCommand(args.cwd, args.env ?? process.env);
      const spawnedChild = appServerSpawn(command, events);
      child = spawnedChild;
      if (settled) {
        // An injected spawner may report failure before it returns its process handle. Do not arm
        // the bound or send initialize after the public observation has already resolved.
        stopProcess(spawnedChild);
        return;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      resolve(unavailable("spawn-failed", detail));
      return;
    }

    timer = clock.setTimeout(() => {
      finish(unavailable("timed-out"), true);
    }, timeoutMs);
    write({
      id: INITIALIZE_REQUEST_ID,
      method: "initialize",
      params: { clientInfo: { name: "storytree", version: "0.0.0" } },
    });
  });
}
