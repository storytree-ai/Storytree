import { createRequire } from "node:module";
import * as path from "node:path";

import {
  CODEX_EXECUTABLE_ENV,
  isChatGptManagedLogin,
  scrubMeteredCodexAuth,
} from "./codex-author.js";
import { spawnCodexAppServer } from "./codex-rate-limits.js";
import type {
  CodexAppServerCommand,
  CodexAppServerProcessEvents,
} from "./codex-rate-limits.js";

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
  readonly platform: "posix" | "windows";
  readonly timeoutMs?: number;
  readonly authRunner?: (command: { args: string[]; timeoutMs: number }) => Promise<{
    code: number | null; stdout: string; stderr: string;
  }>;
  readonly spawn?: CodexDetachedAppServerSpawner;
  readonly observeOwnership?: (request: { pid: number; platform: "posix" | "windows"; timeoutMs: number }) => Promise<CodexDetachedOwner | undefined>;
  readonly terminateOwnedTree?: (owner: CodexDetachedOwner) => Promise<void>;
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

const DEFAULT_TIMEOUT_MS = 60_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return {
    executable: process.execPath,
    args: [path.join(path.dirname(packageJson), "bin", "codex.js"), "app-server", "--stdio"],
    cwd,
    env,
  };
}

function positiveTimeout(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function responseThread(value: unknown): { threadId: string; model: string; reasoningEffort: string } | undefined {
  if (!record(value) || !record(value["thread"])) return undefined;
  const thread = value["thread"];
  return typeof thread["id"] === "string" && thread["id"].length > 0 &&
      typeof thread["model"] === "string" && thread["model"].length > 0 &&
      typeof thread["reasoningEffort"] === "string" && thread["reasoningEffort"].length > 0
    ? { threadId: thread["id"], model: thread["model"], reasoningEffort: thread["reasoningEffort"] }
    : undefined;
}

/** Open exactly one authenticated, staged Codex app-server thread. */
export async function openPinnedCodexDetachedThread(
  args: OpenPinnedCodexDetachedThreadArgs,
): Promise<CodexDetachedThread> {
  const timeoutMs = positiveTimeout(args.timeoutMs);
  const env = args.env ?? process.env;
  const authRunner = args.authRunner ?? (async () => ({ code: 1, stdout: "", stderr: "auth runner unavailable" }));
  const auth = await authRunner({ args: ["login", "status"], timeoutMs });
  if (!isChatGptManagedLogin(auth)) throw new Error("Codex is not authenticated with a ChatGPT-managed login");

  let child: CodexDetachedAppServerProcess | undefined;
  let owner: CodexDetachedOwner | undefined;
  let terminated: Promise<void> | undefined;
  let nextId = 1;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const failPending = (error: Error): void => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  };
  const terminate = (): Promise<void> => terminated ??= (async () => {
    failPending(new Error("Codex app-server terminated"));
    try { child?.end(); } catch { /* cleanup remains best effort */ }
    if (owner !== undefined) await (args.terminateOwnedTree ?? (async () => undefined))(owner);
  })();
  const request = (method: string, params: unknown, notification = false): Promise<unknown> => {
    if (child === undefined) return Promise.reject(new Error("Codex app-server is unavailable"));
    if (notification) {
      try { child.write(`${JSON.stringify({ method, params })}\n`); return Promise.resolve(undefined); }
      catch (error) { void terminate(); return Promise.reject(error); }
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); void terminate(); reject(new Error(`${method} timed out`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { child!.write(`${JSON.stringify({ id, method, params })}\n`); }
      catch (error) { pending.delete(id); clearTimeout(timer); void terminate(); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  };
  let buffer = "";
  const events: CodexAppServerProcessEvents = {
    stdout: (chunk) => {
      buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        try {
          const message = JSON.parse(line) as unknown;
          if (!record(message) || typeof message["id"] !== "number") continue;
          const entry = pending.get(message["id"]); if (entry === undefined) continue;
          pending.delete(message["id"]); clearTimeout(entry.timer);
          if (message["error"] !== undefined) entry.reject(new Error("Codex app-server RPC error")); else entry.resolve(message["result"]);
        } catch { failPending(new Error("Codex app-server emitted malformed JSONL")); void terminate(); }
      }
    },
    error: (error) => { failPending(error); void terminate(); },
    exit: () => { failPending(new Error("Codex app-server exited early")); },
  };
  try {
    child = (args.spawn ?? (spawnCodexAppServer as unknown as CodexDetachedAppServerSpawner))(pinnedCommand(args.cwd, env), events);
    const spawnedPid = child.pid;
    if (typeof spawnedPid !== "number" || !Number.isSafeInteger(spawnedPid) || spawnedPid <= 0) throw new Error("Codex app-server did not expose a positive pid");
    const pid = spawnedPid;
    owner = await (args.observeOwnership ?? (async () => undefined))({ pid, platform: args.platform, timeoutMs });
    if (owner === undefined || owner.rootPid !== pid || (args.platform === "posix" ? owner.kind !== "posix-process-group" : owner.kind !== "windows-process-tree")) throw new Error("exact Codex process ownership was not acquired");
    await request("initialize", { clientInfo: { name: "storytree", version: "0.0.0" } });
    await request("initialized", {}, true);
    const started = responseThread(await request("thread/start", { model: args.model, reasoningEffort: args.reasoningEffort }));
    if (started === undefined) throw new Error("thread/start returned an invalid thread identity");
    return {
      ...started, pid, owner,
      startTurn: async (prompt) => {
        if (prompt.trim() === "") throw new Error("turn prompt must not be blank");
        const result = await request("turn/start", { threadId: started.threadId, input: prompt });
        if (!record(result) || !record(result["turn"]) || typeof result["turn"]["id"] !== "string" || typeof result["turn"]["status"] !== "string") { await terminate(); throw new Error("turn/start returned an invalid result"); }
        return { turnId: result["turn"]["id"], status: result["turn"]["status"] };
      },
      probe: async () => ({ live: terminated === undefined, rateLimits: (await request("account/rateLimits/read", null) as Record<string, unknown>)["rateLimits"] }),
      terminate,
    };
  } catch (error) {
    await terminate();
    throw error;
  }
}
