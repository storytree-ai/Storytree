import { execFile, spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { promisify } from "node:util";

import {
  CODEX_EXECUTABLE_ENV,
  isChatGptManagedLogin,
  runPinnedCodexCli,
  scrubMeteredCodexAuth,
} from "./codex-author.js";
import type { CodexAppServerCommand, CodexAppServerProcessEvents } from "./codex-rate-limits.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 60_000;

export type CodexDetachedOwner =
  | { readonly kind: "posix-process-group"; readonly rootPid: number; readonly token: string }
  | { readonly kind: "windows-process-tree"; readonly rootPid: number; readonly token: string };

export interface CodexDetachedAppServerProcess {
  readonly pid: number | undefined;
  write(line: string): void;
  end(): void;
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
  /** Compatibility assertion for injected adapters; production always observes the host OS. */
  readonly platform: "posix" | "windows";
  readonly timeoutMs?: number;
  readonly authRunner?: (command: { args: string[]; timeoutMs: number }) => Promise<{
    code: number | null; stdout: string; stderr: string; timedOut?: true;
  }>;
  readonly spawn?: CodexDetachedAppServerSpawner;
  readonly observeOwnership?: (request: { pid: number; platform: "posix" | "windows"; timeoutMs: number }) => Promise<CodexDetachedOwner | undefined>;
  readonly terminateOwnedTree?: (owner: CodexDetachedOwner) => Promise<void>;
  /** Optional test seam; an absent observation is deliberately not treated as live. */
  readonly observeLiveness?: (owner: CodexDetachedOwner) => Promise<boolean | undefined>;
}

export interface CodexDetachedThread {
  readonly threadId: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly pid: number;
  readonly owner: CodexDetachedOwner;
  startTurn(prompt: string): Promise<{ readonly turnId: string; readonly status: string }>;
  probe(): Promise<{ readonly live: boolean; readonly rateLimits: unknown }>;
  terminate(): Promise<void>;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveTimeout(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function hostPlatform(): "posix" | "windows" {
  return process.platform === "win32" ? "windows" : "posix";
}

function isExactOwner(
  candidate: CodexDetachedOwner | undefined,
  pid: number,
  platform: "posix" | "windows",
): candidate is CodexDetachedOwner {
  return candidate !== undefined && candidate.rootPid === pid && Number.isSafeInteger(candidate.rootPid) &&
    candidate.token.trim() !== "" &&
    (platform === "posix" ? candidate.kind === "posix-process-group" : candidate.kind === "windows-process-tree");
}

function pinnedCommand(cwd: string, sourceEnv: NodeJS.ProcessEnv): CodexAppServerCommand {
  const env = scrubMeteredCodexAuth(sourceEnv);
  const override = env[CODEX_EXECUTABLE_ENV]?.trim();
  if (override !== undefined && !path.isAbsolute(override)) {
    throw new Error(`${CODEX_EXECUTABLE_ENV} must name an absolute executable`);
  }
  if (override !== undefined) return { executable: override, args: ["app-server", "--stdio"], cwd, env };
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@openai/codex/package.json");
  return { executable: process.execPath, args: [path.join(path.dirname(packageJson), "bin", "codex.js"), "app-server", "--stdio"], cwd, env };
}

function spawnDetachedAppServer(command: CodexAppServerCommand, events: CodexAppServerProcessEvents): CodexDetachedAppServerProcess {
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd,
    env: command.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  child.stdout.on("data", events.stdout);
  child.stderr.on("data", () => undefined);
  child.once("error", events.error);
  child.stdin.once("error", events.error);
  child.once("exit", events.exit);
  return { pid: child.pid, write: (line) => { child.stdin.write(line); }, end: () => { child.stdin.end(); } };
}

async function acquireProductionOwnership(pid: number, platform: "posix" | "windows"): Promise<CodexDetachedOwner | undefined> {
  if (platform === "posix") {
    try {
      // kill(pid, 0) is an OS observation, and the detached spawn made this PID its own process group.
      process.kill(-pid, 0);
      return { kind: "posix-process-group", rootPid: pid, token: String(pid) };
    } catch { return undefined; }
  }
  try {
    await execFileAsync("tasklist", ["/FI", `PID eq ${pid}`, "/NH"]);
    return { kind: "windows-process-tree", rootPid: pid, token: String(pid) };
  } catch { return undefined; }
}

async function productionLiveness(owner: CodexDetachedOwner): Promise<boolean | undefined> {
  try {
    if (owner.kind === "posix-process-group") {
      process.kill(-owner.rootPid, 0);
      return true;
    }
    const { stdout } = await execFileAsync("tasklist", ["/FI", `PID eq ${owner.rootPid}`, "/NH"]);
    return stdout.includes(String(owner.rootPid));
  } catch { return false; }
}

async function terminateProductionTree(owner: CodexDetachedOwner): Promise<void> {
  if (owner.kind === "posix-process-group") {
    process.kill(-owner.rootPid, "SIGTERM");
    return;
  }
  await execFileAsync("taskkill", ["/PID", String(owner.rootPid), "/T", "/F"]);
}

function responseThread(value: unknown): { threadId: string; model: string; reasoningEffort: string } | undefined {
  if (!record(value) || !record(value["thread"])) return undefined;
  const thread = value["thread"];
  return typeof thread["id"] === "string" && thread["id"].trim() !== "" &&
      typeof thread["model"] === "string" && thread["model"].trim() !== "" &&
      typeof thread["reasoningEffort"] === "string" && thread["reasoningEffort"].trim() !== ""
    ? { threadId: thread["id"], model: thread["model"], reasoningEffort: thread["reasoningEffort"] }
    : undefined;
}

function responseTurn(value: unknown): { turnId: string; status: string } | undefined {
  if (!record(value) || !record(value["turn"])) return undefined;
  const turn = value["turn"];
  return typeof turn["id"] === "string" && turn["id"].trim() !== "" &&
      typeof turn["status"] === "string" && turn["status"].trim() !== ""
    ? { turnId: turn["id"], status: turn["status"] }
    : undefined;
}

/** Open exactly one authenticated, staged Codex app-server thread. */
export async function openPinnedCodexDetachedThread(args: OpenPinnedCodexDetachedThreadArgs): Promise<CodexDetachedThread> {
  const timeoutMs = positiveTimeout(args.timeoutMs);
  const env = args.env ?? process.env;
  const platform = hostPlatform();
  const authRunner = args.authRunner ?? (async (command: { args: string[]; timeoutMs: number }) =>
    await runPinnedCodexCli({ args: command.args, cwd: args.cwd, env: scrubMeteredCodexAuth(env), timeoutMs: command.timeoutMs }));
  const auth = await authRunner({ args: ["login", "status"], timeoutMs });
  if (auth.timedOut === true || !isChatGptManagedLogin(auth)) {
    throw new Error("Codex is not authenticated with a ChatGPT-managed login");
  }

  let child: CodexDetachedAppServerProcess | undefined;
  let owner: CodexDetachedOwner | undefined;
  let closed = false;
  let exited = false;
  let terminal: Promise<void> | undefined;
  let nextId = 1;
  let buffer = "";
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const failPending = (error: Error): void => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  };
  const liveness = async (): Promise<boolean | undefined> => {
    if (owner === undefined || exited) return false;
    if (args.observeLiveness !== undefined) return await args.observeLiveness(owner);
    if (args.observeOwnership !== undefined) {
      if (closed) return false;
      const observed = await args.observeOwnership({ pid: owner.rootPid, platform, timeoutMs });
      return isExactOwner(observed, owner.rootPid, platform);
    }
    return await productionLiveness(owner);
  };
  const terminate = (): Promise<void> => terminal ??= (async () => {
    closed = true;
    failPending(new Error("Codex app-server terminated"));
    try { child?.end(); } catch { /* close cannot weaken exact tree cleanup */ }
    if (owner === undefined) return;
    await (args.terminateOwnedTree ?? terminateProductionTree)(owner);
    const alive = await liveness();
    if (alive !== false) throw new Error("Codex app-server ownership did not become dead after termination");
  })();
  const request = (method: string, params: unknown, notification = false): Promise<unknown> => {
    if (child === undefined || closed || exited) return Promise.reject(new Error("Codex app-server is unavailable"));
    if (notification) {
      try { child.write(`${JSON.stringify({ method, params })}\n`); return Promise.resolve(undefined); }
      catch (error) { void terminate(); return Promise.reject(error instanceof Error ? error : new Error(String(error))); }
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); void terminate(); reject(new Error(`${method} timed out`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { child!.write(`${JSON.stringify({ id, method, params })}\n`); }
      catch (error) { pending.delete(id); clearTimeout(timer); void terminate(); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  };
  const events: CodexAppServerProcessEvents = {
    stdout: (chunk) => {
      buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const raw of lines) {
        if (raw.trim() === "") continue;
        try {
          const message = JSON.parse(raw) as unknown;
          if (!record(message) || typeof message["id"] !== "number" || !Number.isSafeInteger(message["id"])) { failPending(new Error("Codex app-server emitted malformed JSONL")); void terminate(); return; }
          const responseId = message["id"];
          const entry = pending.get(responseId); if (entry === undefined) continue;
          pending.delete(responseId); clearTimeout(entry.timer);
          if (message["error"] !== undefined) entry.reject(new Error("Codex app-server RPC error")); else entry.resolve(message["result"]);
        } catch { failPending(new Error("Codex app-server emitted malformed JSONL")); void terminate(); return; }
      }
    },
    error: (error) => { failPending(error); void terminate(); },
    exit: () => { exited = true; failPending(new Error("Codex app-server exited early")); },
  };
  try {
    child = (args.spawn ?? spawnDetachedAppServer)(pinnedCommand(args.cwd, env), events);
    const pid = child.pid;
    if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0) throw new Error("Codex app-server did not expose a positive pid");
    owner = args.observeOwnership === undefined
      ? await acquireProductionOwnership(pid, platform)
      : await args.observeOwnership({ pid, platform, timeoutMs });
    if (!isExactOwner(owner, pid, platform) || args.platform !== platform) {
      throw new Error("exact Codex process ownership was not acquired");
    }
    const initialized = await request("initialize", { clientInfo: { name: "storytree", version: "0.0.0" } });
    if (!record(initialized)) throw new Error("initialize returned an invalid result");
    await request("initialized", {}, true);
    const started = responseThread(await request("thread/start", { model: args.model, reasoningEffort: args.reasoningEffort }));
    if (started === undefined) throw new Error("thread/start returned an invalid thread identity");
    return {
      ...started, pid, owner,
      startTurn: async (prompt) => {
        if (prompt.trim() === "") throw new Error("turn prompt must not be blank");
        try {
          const turn = responseTurn(await request("turn/start", { threadId: started.threadId, input: prompt }));
          if (turn === undefined) throw new Error("turn/start returned an invalid result");
          return turn;
        } catch (error) { await terminate(); throw error; }
      },
      probe: async () => {
        const live = await liveness();
        if (live !== true) return { live: false, rateLimits: undefined };
        try {
          const result = await request("account/rateLimits/read", null);
          return { live: true, rateLimits: record(result) ? result["rateLimits"] : undefined };
        } catch (error) { await terminate(); throw error; }
      },
      terminate,
    };
  } catch (error) {
    await terminate().catch(() => undefined);
    throw error;
  }
}
