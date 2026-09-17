import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  openPinnedCodexDetachedThread,
  type CodexDetachedThread,
  type OpenPinnedCodexDetachedThreadArgs,
} from "./index.js";
import {
  codexDetachedProductionRuntime,
  createCodexDetachedRuntime,
  createOpenPinnedCodexDetachedThread,
  type CodexDetachedAppServerProcess,
  type CodexDetachedClock,
  type CodexDetachedNativeChild,
  type CodexDetachedNativeSpawnOptions,
  type CodexDetachedOwner,
  type CodexDetachedOwnerObservation,
  type CodexDetachedRuntime,
} from "./codex-detached-app-server.js";
import type { CodexAppServerCommand, CodexAppServerProcessEvents } from "./codex-rate-limits.js";

type RpcMessage = { readonly id?: number; readonly method?: string; readonly params?: unknown };
type Responder = (message: RpcMessage, events: CodexAppServerProcessEvents) => void;

class ManualClock implements CodexDetachedClock {
  private current = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { readonly at: number; readonly callback: () => void }>();

  now(): number { return this.current; }

  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = this.nextId++;
    this.timers.set(id, { at: this.current + ms, callback });
    return id as unknown as ReturnType<typeof setTimeout>;
  }

  clearTimeout(handle: ReturnType<typeof setTimeout>): void {
    this.timers.delete(handle as unknown as number);
  }

  async delay(ms: number): Promise<void> {
    this.current += ms;
  }

  advance(ms: number): void {
    this.current += ms;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.current)
      .sort((left, right) => left[1].at - right[1].at);
    for (const [id, timer] of due) {
      this.timers.delete(id);
      timer.callback();
    }
  }
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

async function waitForMethod(
  writes: readonly RpcMessage[],
  method: string,
): Promise<RpcMessage> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const found = writes.findLast((message) => message.method === method);
    if (found !== undefined) return found;
    await flush();
  }
  throw new Error(`${method} was not written`);
}

async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`${description} was not observed`);
}

function ownerFor(platform: "posix" | "windows", pid: number, token = `owner-${pid}`): CodexDetachedOwner {
  return platform === "windows"
    ? { kind: "windows-process-tree", rootPid: pid, token }
    : { kind: "posix-process-group", rootPid: pid, token };
}

function sameTestOwner(left: CodexDetachedOwner, right: CodexDetachedOwner): boolean {
  return left.kind === right.kind && left.rootPid === right.rootPid && left.token === right.token;
}

function defaultResponder(message: RpcMessage, events: CodexAppServerProcessEvents): void {
  if (message.method === "initialize") {
    events.stdout(`${JSON.stringify({ id: message.id, result: { serverInfo: { name: "codex" } } })}\n`);
  }
  if (message.method === "thread/start") {
    events.stdout(`${JSON.stringify({
      id: message.id,
      result: {
        thread: { id: "response-thread" },
        model: "response-model",
        reasoningEffort: "response-effort",
      },
    })}\n`);
  }
  if (message.method === "turn/start") {
    events.stdout(`${JSON.stringify({ id: message.id, result: { turn: { id: "response-turn", status: "inProgress" } } })}\n`);
  }
  if (message.method === "account/rateLimits/read") {
    events.stdout(`${JSON.stringify({ id: message.id, result: { rateLimits: { primary: null, secondary: null } } })}\n`);
  }
}

async function managedTestAuth(): Promise<{ code: number; stdout: string; stderr: string }> {
  return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
}

interface HarnessOptions {
  readonly platform?: "posix" | "windows";
  readonly pid?: number | undefined;
  readonly candidate?: CodexDetachedOwner | undefined;
  readonly acquire?: (pid: number, timeoutMs: number) => Promise<CodexDetachedOwner | undefined>;
  readonly observe?: (owner: CodexDetachedOwner, timeoutMs: number) => Promise<CodexDetachedOwnerObservation>;
  readonly terminate?: (owner: CodexDetachedOwner, timeoutMs: number) => Promise<void>;
  readonly provisionalTerminate?: (timeoutMs: number) => Promise<void>;
  readonly provisionalObserve?: (timeoutMs: number) => Promise<boolean | undefined>;
  readonly responder?: Responder;
  readonly end?: () => void;
  readonly spawnError?: Error;
  readonly resolvePinnedEntrypoint?: () => string;
  readonly beforeSpawnReturn?: (events: CodexAppServerProcessEvents) => void;
  readonly defaultAuth?: CodexDetachedRuntime["runDefaultAuth"];
}

function createHarness(options: HarnessOptions = {}) {
  const platform = options.platform ?? "posix";
  const pid = options.pid === undefined && !("pid" in options) ? 701 : options.pid;
  const candidate = options.candidate === undefined && !("candidate" in options)
    ? ownerFor(platform, pid ?? 701)
    : options.candidate;
  const clock = new ManualClock();
  const commands: CodexAppServerCommand[] = [];
  const writes: RpcMessage[] = [];
  const terminations: CodexDetachedOwner[] = [];
  const provisionalTerminationTimeouts: number[] = [];
  const provisionalObservationTimeouts: number[] = [];
  const defaultAuthCalls: Parameters<CodexDetachedRuntime["runDefaultAuth"]>[0][] = [];
  let provisionalTerminations = 0;
  let ended = 0;
  let live = true;
  let events: CodexAppServerProcessEvents | undefined;
  let responder = options.responder ?? defaultResponder;

  const process: CodexDetachedAppServerProcess = {
    pid,
    write: (line) => {
      const message = JSON.parse(line) as RpcMessage;
      writes.push(message);
      responder(message, events!);
    },
    end: () => {
      ended += 1;
      options.end?.();
    },
    terminateTree: async (timeoutMs) => {
      provisionalTerminations += 1;
      provisionalTerminationTimeouts.push(timeoutMs);
      if (options.provisionalTerminate !== undefined) await options.provisionalTerminate(timeoutMs);
      else live = false;
    },
    observeTree: async (timeoutMs) => {
      provisionalObservationTimeouts.push(timeoutMs);
      return options.provisionalObserve === undefined
        ? live
        : await options.provisionalObserve(timeoutMs);
    },
  };

  const runtime: CodexDetachedRuntime = {
    platform,
    clock,
    resolvePinnedEntrypoint: options.resolvePinnedEntrypoint ?? (() => "C:\\repo\\node_modules\\@openai\\codex\\bin\\codex.js"),
    runDefaultAuth: async (command) => {
      defaultAuthCalls.push(command);
      return options.defaultAuth === undefined
        ? { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }
        : await options.defaultAuth(command);
    },
    spawn: (command, nextEvents) => {
      if (options.spawnError !== undefined) throw options.spawnError;
      commands.push(command);
      events = nextEvents;
      options.beforeSpawnReturn?.(nextEvents);
      return process;
    },
    acquireOwnership: async (rootPid, timeoutMs) => options.acquire === undefined
      ? candidate
      : await options.acquire(rootPid, timeoutMs),
    observeOwnership: async (expectedOwner, timeoutMs) => {
      if (options.observe !== undefined) return await options.observe(expectedOwner, timeoutMs);
      return live && candidate !== undefined
        ? { status: "live", owner: candidate }
        : { status: "dead" };
    },
    terminateOwnedTree: async (target, timeoutMs) => {
      terminations.push(target);
      if (options.terminate !== undefined) await options.terminate(target, timeoutMs);
      else live = false;
    },
  };

  const open = createOpenPinnedCodexDetachedThread(runtime);
  const args = (overrides: Partial<Parameters<typeof open>[0]> = {}): Parameters<typeof open>[0] => ({
    cwd: "C:\\repo",
    env: { STORYTREE_SAFE_VALUE: "kept" },
    model: "requested-model",
    reasoningEffort: "requested-effort",
    timeoutMs: 40,
    authRunner: async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }),
    ...overrides,
  });

  return {
    platform,
    pid,
    candidate,
    clock,
    commands,
    writes,
    terminations,
    provisionalTerminationTimeouts,
    provisionalObservationTimeouts,
    defaultAuthCalls,
    runtime,
    open,
    args,
    get events() { return events!; },
    get ended() { return ended; },
    get provisionalTerminations() { return provisionalTerminations; },
    get live() { return live; },
    set live(value: boolean) { live = value; },
    setResponder(next: Responder) { responder = next; },
    emitJson(value: unknown) { events!.stdout(`${JSON.stringify(value)}\n`); },
    emitRaw(value: string | Uint8Array) { events!.stdout(value); },
  };
}

test("staged-protocol-returns-response-produced-identity: stages one authenticated host-owned thread, then uses and terminates that exact owner", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const publicEntry: (
    args: OpenPinnedCodexDetachedThreadArgs,
  ) => Promise<CodexDetachedThread> = openPinnedCodexDetachedThread;
  assert.equal(typeof publicEntry, "function");
  assert.equal(codexDetachedProductionRuntime.platform, platform);

  const owner = ownerFor(platform, 431, "owned-group");
  const protocol: RpcMessage[] = [];
  const terminationRequests: CodexDetachedOwner[] = [];
  const authCommands: Parameters<CodexDetachedRuntime["runDefaultAuth"]>[0][] = [];
  let alive = true;
  let ended = 0;

  const runtime = createCodexDetachedRuntime({
    platform,
    nativeSpawn: () => { throw new Error("internal spawn override was not used"); },
    execFile: async () => { throw new Error("internal ownership override was not used"); },
    signal: () => { throw new Error("internal ownership override was not used"); },
    runDefaultAuth: async (command) => {
      authCommands.push(command);
      return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
    },
    resolvePinnedEntrypoint: () => path.resolve("node_modules", "@openai", "codex", "bin", "codex.js"),
  });
  const open = createOpenPinnedCodexDetachedThread(runtime);
  const thread = await open({
    cwd: process.cwd(),
    env: { STORYTREE_SAFE_VALUE: "kept", OPENAI_API_KEY: "metered", Codex_Access_Token: "metered-too" },
    model: "requested-model",
    reasoningEffort: "requested-effort",
    timeoutMs: 100,
    spawn: (command, events) => {
      assert.equal(JSON.stringify(command).includes("metered"), false);
      return {
        pid: 431,
        write: (line) => {
          const message = JSON.parse(line) as RpcMessage;
          protocol.push(message);
          defaultResponder(message, events);
        },
        end: () => { ended += 1; },
        terminateTree: async () => { alive = false; },
        observeTree: async () => alive,
      };
    },
    observeOwnership: async () => alive ? owner : undefined,
    terminateOwnedTree: async (target) => { terminationRequests.push(target); alive = false; },
  });

  assert.deepEqual(authCommands, [{
    args: ["login", "status"],
    cwd: process.cwd(),
    env: { STORYTREE_SAFE_VALUE: "kept" },
    timeoutMs: 100,
  }]);

  assert.deepEqual(
    { threadId: thread.threadId, model: thread.model, reasoningEffort: thread.reasoningEffort, pid: thread.pid, owner: thread.owner },
    { threadId: "response-thread", model: "response-model", reasoningEffort: "response-effort", pid: 431, owner },
  );
  assert.deepEqual(protocol.map((message) => message.method), ["initialize", "initialized", "thread/start"]);
  assert.deepEqual(await thread.probe(), { live: true, rateLimits: { primary: null, secondary: null } });
  assert.deepEqual(await thread.startTurn("  do the bounded work  "), { turnId: "response-turn", status: "inProgress" });
  await Promise.all([thread.terminate(), thread.terminate()]);
  await thread.terminate();
  assert.equal(ended, 1);
  assert.deepEqual(terminationRequests, [owner]);
});

test("auth-refusal-and-timeout-never-spawn: only exact managed authentication reaches process creation", async () => {
  const rows = [
    async () => ({ code: 1, stdout: "", stderr: "not logged in" }),
    async () => ({ code: 0, stdout: "Logged in using an API key\n", stderr: "" }),
    async () => ({ code: 0, stdout: "Logged in using ChatGPT\nextra", stderr: "" }),
    async () => ({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "", timedOut: true as const }),
    async (): Promise<never> => { throw new Error("auth runner failed"); },
  ];
  for (const authRunner of rows) {
    let resolutions = 0;
    const harness = createHarness({
      resolvePinnedEntrypoint: () => {
        resolutions += 1;
        return path.resolve("node_modules", "@openai", "codex", "bin", "codex.js");
      },
    });
    await assert.rejects(harness.open(harness.args({ authRunner })));
    assert.equal(resolutions, 0);
    assert.equal(harness.commands.length, 0);
  }
  const success = createHarness();
  const thread = await success.open(success.args());
  assert.equal(success.commands.length, 1);
  assert.deepEqual(success.commands[0], {
    executable: process.execPath,
    args: ["C:\\repo\\node_modules\\@openai\\codex\\bin\\codex.js", "app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { STORYTREE_SAFE_VALUE: "kept" },
  });
  await thread.terminate();

  const defaultPath = createHarness();
  const defaultArgs = defaultPath.args({
    cwd: path.resolve("bounded-auth-cwd"),
    env: {
      KEEP_ME: "yes",
      OPENAI_API_KEY: "must-be-scrubbed",
      Codex_Access_Token: "must-also-be-scrubbed",
    },
    timeoutMs: 23,
  });
  Reflect.deleteProperty(defaultArgs, "authRunner");
  const defaultThread = await defaultPath.open(defaultArgs);
  assert.deepEqual(defaultPath.defaultAuthCalls, [{
    args: ["login", "status"],
    cwd: path.resolve("bounded-auth-cwd"),
    env: { KEEP_ME: "yes" },
    timeoutMs: 23,
  }]);
  await defaultThread.terminate();

  let settleLateAuth: (() => void) | undefined;
  const hangingDefault = createHarness({
    defaultAuth: async () => await new Promise((resolve) => {
      settleLateAuth = () => { resolve({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }); };
    }),
  });
  const hangingArgs = hangingDefault.args({ timeoutMs: 19 });
  Reflect.deleteProperty(hangingArgs, "authRunner");
  const hangingOpen = hangingDefault.open(hangingArgs);
  await waitUntil(() => hangingDefault.defaultAuthCalls.length === 1, "default auth call");
  hangingDefault.clock.advance(19);
  await assert.rejects(hangingOpen, /authentication preflight timed out/);
  settleLateAuth?.();
});

test("pinned-command-scrubs-env-and-spawns-detached: composes the exact command and native detached process", async () => {
  const harness = createHarness();
  const absoluteOverride = path.resolve("tools", "codex.exe");
  const thread = await harness.open(harness.args({
    cwd: "C:\\bounded-worktree",
    env: {
      STORYTREE_CODEX_EXECUTABLE: absoluteOverride,
      KEEP_ME: "yes",
      OPENAI_API_KEY: "secret-a",
      Codex_Access_Token: "secret-b",
    },
  }));
  assert.deepEqual(harness.commands, [{
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\bounded-worktree",
    env: { STORYTREE_CODEX_EXECUTABLE: absoluteOverride, KEEP_ME: "yes" },
  }]);
  await thread.terminate();

  const relative = createHarness();
  await assert.rejects(relative.open(relative.args({
    env: { STORYTREE_CODEX_EXECUTABLE: "relative-codex.exe" },
  })), /must name an absolute executable/);
  assert.equal(relative.commands.length, 0);

  const resolutionFailure = createHarness({
    resolvePinnedEntrypoint: () => { throw new Error("pinned package resolution failed"); },
  });
  await assert.rejects(resolutionFailure.open(resolutionFailure.args()), (error: unknown) => {
    assert.equal((error as Error).message, "Pinned Codex package could not be resolved");
    return true;
  });
  assert.equal(resolutionFailure.commands.length, 0);

  const nativeCalls: Array<{ executable: string; args: readonly string[]; options: CodexDetachedNativeSpawnOptions }> = [];
  const execCalls: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  let lowLevelTaskRow = '"codex.exe","901","Console","4","12,000 K"';
  let lowLevelTasklistError = false;
  const listeners: Record<string, unknown> = {};
  const nativeWrites: string[] = [];
  let nativeEnds = 0;
  const nativeChild: CodexDetachedNativeChild = {
    pid: 901,
    stdout: { on: (event, listener) => { listeners[`stdout:${event}`] = listener; } },
    stderr: { on: (event, listener) => { listeners[`stderr:${event}`] = listener; } },
    stdin: {
      once: (event, listener) => { listeners[`stdin:${event}`] = listener; },
      write: (line) => { nativeWrites.push(line); },
      end: () => { nativeEnds += 1; },
    },
    once: (event, listener) => { listeners[`child:${event}`] = listener; },
  };
  const runtime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: (executable, args, options) => { nativeCalls.push({ executable, args, options }); return nativeChild; },
    execFile: async (executable, args, options) => {
      execCalls.push({ executable, args, timeout: options.timeout });
      if (executable === "tasklist" && lowLevelTasklistError) throw new Error("tasklist unavailable");
      return {
        stdout: executable === "tasklist" ? `${lowLevelTaskRow}\r\n` : "SUCCESS",
        stderr: "",
      };
    },
    signal: () => undefined,
    runDefaultAuth: managedTestAuth,
  });
  const forwardedStdout: Array<string | Uint8Array> = [];
  const forwardedErrors: Error[] = [];
  const forwardedExits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];
  const spawned = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, {
    stdout: (chunk) => { forwardedStdout.push(chunk); },
    error: (error) => { forwardedErrors.push(error); },
    exit: (code, signal) => { forwardedExits.push({ code, signal }); },
  });
  assert.deepEqual(nativeCalls, [{
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    options: { cwd: "C:\\repo", env: { KEEP: "yes" }, stdio: ["pipe", "pipe", "pipe"], detached: true, windowsHide: true },
  }]);
  assert.deepEqual(Object.keys(listeners).sort(), ["child:error", "child:exit", "stderr:data", "stdin:error", "stdout:data"]);
  const stdoutChunk = Buffer.from("one JSONL frame");
  const childError = new Error("child fault");
  const stdinError = new Error("stdin fault");
  (listeners["stdout:data"] as (chunk: Buffer) => void)(stdoutChunk);
  (listeners["stderr:data"] as (chunk: Buffer) => void)(Buffer.from("ignored diagnostic"));
  (listeners["child:error"] as (error: Error) => void)(childError);
  (listeners["stdin:error"] as (error: Error) => void)(stdinError);
  spawned.write("request\n");
  spawned.end();
  assert.deepEqual(forwardedStdout, [stdoutChunk]);
  assert.deepEqual(forwardedErrors, [childError, stdinError]);
  assert.deepEqual(nativeWrites, ["request\n"]);
  assert.equal(nativeEnds, 1);
  assert.equal(await spawned.observeTree!(31), undefined, "a PID without an acquired token is not owned");
  await assert.rejects(spawned.terminateTree!(29), /owner is unavailable/);
  assert.equal(execCalls.length, 0);
  assert.deepEqual(await runtime.acquireOwnership(901, 31), {
    kind: "windows-process-tree",
    rootPid: 901,
    token: "codex.exe\u0000901\u0000Console\u00004",
  });
  assert.equal(await spawned.observeTree!(31), true);
  await spawned.terminateTree!(29);
  assert.deepEqual(execCalls, [
    {
      executable: "tasklist",
      args: ["/FI", "PID eq 901", "/FO", "CSV", "/NH"],
      timeout: 31,
    },
    {
      executable: "tasklist",
      args: ["/FI", "PID eq 901", "/FO", "CSV", "/NH"],
      timeout: 31,
    },
    {
      executable: "tasklist",
      args: ["/FI", "PID eq 901", "/FO", "CSV", "/NH"],
      timeout: 29,
    },
    { executable: "taskkill", args: ["/PID", "901", "/T", "/F"], timeout: 29 },
  ]);
  lowLevelTasklistError = true;
  const callsBeforeTasklistFailure = execCalls.length;
  assert.equal(await spawned.observeTree!(28), undefined);
  await assert.rejects(spawned.terminateTree!(28), /tasklist unavailable/);
  assert.equal(execCalls.length, callsBeforeTasklistFailure + 2);
  lowLevelTasklistError = false;
  lowLevelTaskRow = "INFO: No tasks are running which match the specified criteria.";
  assert.equal(await spawned.observeTree!(29), false, "the retained provisional token can confirm root death");
  (listeners["child:exit"] as (code: number | null, signal: NodeJS.Signals | null) => void)(7, "SIGTERM");
  assert.deepEqual(forwardedExits, [{ code: 7, signal: "SIGTERM" }]);
  const callsBeforeExitedRootAcquisition = execCalls.length;
  assert.equal(await runtime.acquireOwnership(901, 27), undefined);
  assert.equal(execCalls.length, callsBeforeExitedRootAcquisition);
  await runtime.terminateOwnedTree({
    kind: "windows-process-tree",
    rootPid: 901,
    token: "codex.exe\u0000901\u0000Console\u00004",
  }, 27);
  assert.equal(execCalls.length, callsBeforeExitedRootAcquisition, "a known exited root cannot reach taskkill");

  lowLevelTaskRow = '"codex.exe","901","Console","4","13,000 K"';
  const respawned = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  assert.deepEqual(await runtime.acquireOwnership(901, 26), {
    kind: "windows-process-tree",
    rootPid: 901,
    token: "codex.exe\u0000901\u0000Console\u00004",
  });
  lowLevelTaskRow = '"codex.exe","901","Console","4","99,000 K"';
  assert.equal(await respawned.observeTree!(26), true, "mutable memory usage is not a root identity field");
  lowLevelTaskRow = '"other.exe","901","Console","4","13,000 K"';
  const killsBeforeChangedProvisional = execCalls.filter((call) => call.executable === "taskkill").length;
  await respawned.terminateTree!(26);
  assert.equal(
    execCalls.filter((call) => call.executable === "taskkill").length,
    killsBeforeChangedProvisional,
    "a changed provisional token never reaches taskkill",
  );
  assert.equal(await respawned.observeTree!(26), false, "token loss is dead for the provisional controller");

  lowLevelTaskRow = '"codex.exe","901","Console","4","14,000 K"';
  const reused = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  await runtime.acquireOwnership(901, 25);
  const killsBeforeReuse = execCalls.filter((call) => call.executable === "taskkill").length;
  await reused.terminateTree!(25);
  assert.equal(
    execCalls.filter((call) => call.executable === "taskkill").length,
    killsBeforeReuse + 1,
    "a newly spawned root may reuse a pid only after acquiring its new token",
  );

  lowLevelTaskRow = "INFO: No tasks are running which match the specified criteria.";
  const ownershipLost = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  assert.equal(await runtime.acquireOwnership(901, 24), undefined);
  const callsAfterLostAcquisition = execCalls.length;
  assert.equal(await ownershipLost.observeTree!(24), false);
  await ownershipLost.terminateTree!(24);
  assert.equal(execCalls.length, callsAfterLostAcquisition, "a failed exact acquisition closes that spawn generation");

  const spawnFailure = createHarness({ spawnError: new Error("spawn failed") });
  await assert.rejects(spawnFailure.open(spawnFailure.args()), /spawn failed/);
});

test("posix-group-owner-is-observed-probed-and-terminated: uses the exact negative process group for every OS operation", async () => {
  const calls: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = [];
  let spawnedPid: number | undefined = 71;
  let live = true;
  let observationUnavailable = false;
  const runtime = createCodexDetachedRuntime({
    platform: "posix",
    nativeSpawn: () => ({
      pid: spawnedPid,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { once: () => undefined, write: () => undefined, end: () => undefined },
      once: () => undefined,
    }),
    execFile: async () => { throw new Error("not used"); },
    runDefaultAuth: managedTestAuth,
    signal: (pid, signal) => {
      calls.push({ pid, signal });
      if (signal === 0 && observationUnavailable) throw Object.assign(new Error("permission"), { code: "EPERM" });
      if (signal === 0 && !live) throw Object.assign(new Error("gone"), { code: "ESRCH" });
      if (signal === "SIGTERM") live = false;
    },
  });
  const provisional = runtime.spawn({ executable: "codex", args: [], cwd: process.cwd(), env: {} }, {
    stdout: () => undefined,
    error: () => undefined,
    exit: () => undefined,
  });
  assert.equal(await provisional.observeTree!(24), true);
  observationUnavailable = true;
  assert.equal(await provisional.observeTree!(24), undefined);
  observationUnavailable = false;
  await provisional.terminateTree!(24);
  assert.equal(await provisional.observeTree!(24), false);
  assert.deepEqual(calls, [
    { pid: -71, signal: 0 },
    { pid: -71, signal: 0 },
    { pid: -71, signal: "SIGTERM" },
    { pid: -71, signal: 0 },
  ]);
  calls.length = 0;
  live = true;
  const owner = await runtime.acquireOwnership(71, 25);
  assert.deepEqual(owner, { kind: "posix-process-group", rootPid: 71, token: "pgid:71" });
  assert.deepEqual(await runtime.observeOwnership(owner!, 25), { status: "live", owner });
  observationUnavailable = true;
  assert.deepEqual(await runtime.observeOwnership(owner!, 25), { status: "unavailable" });
  observationUnavailable = false;
  await runtime.terminateOwnedTree(owner!, 25);
  assert.deepEqual(await runtime.observeOwnership(owner!, 25), { status: "dead" });
  assert.deepEqual(calls, [
    { pid: -71, signal: 0 },
    { pid: -71, signal: 0 },
    { pid: -71, signal: 0 },
    { pid: -71, signal: "SIGTERM" },
    { pid: -71, signal: 0 },
  ]);

  for (const invalidPid of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const callsBefore: number = calls.length;
    const invalidOwner: CodexDetachedOwner = {
      kind: "posix-process-group",
      rootPid: invalidPid,
      token: "invalid-owner",
    };
    assert.equal(await runtime.acquireOwnership(invalidPid, 33), undefined);
    assert.deepEqual(await runtime.observeOwnership(invalidOwner, 33), { status: "unavailable" });
    await assert.rejects(runtime.terminateOwnedTree(invalidOwner, 33), /owner pid is invalid/);
    assert.equal(calls.length, callsBefore, "an invalid runtime owner never reaches a POSIX signal");
  }

  const wrongKindOwner: CodexDetachedOwner = {
    kind: "windows-process-tree",
    rootPid: 71,
    token: "windows-owner",
  };
  const callsBeforeWrongKind = calls.length;
  assert.deepEqual(await runtime.observeOwnership(wrongKindOwner, 33), { status: "unavailable" });
  await assert.rejects(runtime.terminateOwnedTree(wrongKindOwner, 33), /kind does not match/);
  assert.equal(calls.length, callsBeforeWrongKind, "a Windows owner never reaches a POSIX signal");

  for (const invalidPid of [
    undefined,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    spawnedPid = invalidPid;
    const spawned = runtime.spawn({ executable: "codex", args: [], cwd: process.cwd(), env: {} }, {
      stdout: () => undefined,
      error: () => undefined,
      exit: () => undefined,
    });
    const callsBefore: number = calls.length;
    assert.equal(await spawned.observeTree!(33), undefined);
    await assert.rejects(spawned.terminateTree!(33), /pid is unavailable/);
    assert.equal(calls.length, callsBefore, "an invalid child pid never reaches a POSIX signal");
  }
});

test("windows-tree-owner-is-observed-probed-and-terminated: parses the exact tasklist pid and issues one rooted tree kill", async () => {
  const calls: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  let row = '"codex.exe","123","Console","4","12,000 K"';
  let tasklistError = false;
  const runtime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => { throw new Error("not used"); },
    execFile: async (executable, args, options) => {
      calls.push({ executable, args, timeout: options.timeout });
      if (executable === "tasklist" && tasklistError) throw new Error("tasklist unavailable");
      return { stdout: executable === "tasklist" ? `${row}\r\n` : "SUCCESS", stderr: "" };
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    runDefaultAuth: managedTestAuth,
  });
  const owner = await runtime.acquireOwnership(123, 55);
  assert.deepEqual(owner, {
    kind: "windows-process-tree",
    rootPid: 123,
    token: "codex.exe\u0000123\u0000Console\u00004",
  });
  row = '"codex.exe","123","Console","4","99,000 K"';
  assert.deepEqual(await runtime.observeOwnership(owner!, 55), { status: "live", owner });
  row = '"codex.exe","9123","Console","4","10 K"';
  assert.equal(await runtime.acquireOwnership(124, 55), undefined, "substring pids are never accepted");
  row = '"codex.exe","125","Console","4","10 K"\r\n"codex.exe","125","Console","4","11 K"';
  assert.equal(await runtime.acquireOwnership(125, 55), undefined, "duplicate exact roots are ambiguous");
  row = "INFO: No tasks are running which match the specified criteria.";
  assert.equal(await runtime.acquireOwnership(126, 55), undefined, "tasklist exit zero without a row is dead");
  tasklistError = true;
  assert.deepEqual(await runtime.observeOwnership(owner!, 55), { status: "unavailable" });
  tasklistError = false;

  row = '"codex.exe","123","Console","4","12,000 K"';
  await runtime.terminateOwnedTree(owner!, 55);
  assert.deepEqual(calls.at(-1), {
    executable: "taskkill",
    args: ["/PID", "123", "/T", "/F"],
    timeout: 55,
  });

  row = '"codex.exe","127","Console","4","12,000 K"';
  const missingOwner = await runtime.acquireOwnership(127, 55);
  assert.ok(missingOwner !== undefined);
  row = "INFO: No tasks are running which match the specified criteria.";
  const killsBeforeMissingOwner = calls.filter((call) => call.executable === "taskkill").length;
  await runtime.terminateOwnedTree(missingOwner, 55);
  assert.equal(
    calls.filter((call) => call.executable === "taskkill").length,
    killsBeforeMissingOwner,
    "a missing root is re-observed but never signalled",
  );
  row = '"codex.exe","127","Console","4","12,000 K"';
  const callsBeforeMissingReappearance = calls.length;
  assert.deepEqual(await runtime.observeOwnership(missingOwner, 55), { status: "dead" });
  assert.equal(calls.length, callsBeforeMissingReappearance, "lost ownership cannot reopen on pid reuse");

  row = '"codex.exe","128","Console","4","12,000 K"';
  const changedTerminationOwner = await runtime.acquireOwnership(128, 55);
  assert.ok(changedTerminationOwner !== undefined);
  row = '"other.exe","128","Console","4","10 K"';
  const killsBeforeChangedOwner = calls.filter((call) => call.executable === "taskkill").length;
  await runtime.terminateOwnedTree(changedTerminationOwner, 55);
  assert.equal(
    calls.filter((call) => call.executable === "taskkill").length,
    killsBeforeChangedOwner,
    "a changed token is re-observed but never signalled",
  );
  row = '"codex.exe","128","Console","4","12,000 K"';
  const callsBeforeChangedReappearance = calls.length;
  assert.deepEqual(await runtime.observeOwnership(changedTerminationOwner, 55), { status: "dead" });
  assert.equal(calls.length, callsBeforeChangedReappearance, "changed ownership cannot reopen on pid reuse");

  row = '"codex.exe","129","Console","4","12,000 K"';
  const changedObservationOwner = await runtime.acquireOwnership(129, 55);
  assert.ok(changedObservationOwner !== undefined);
  row = '"other.exe","129","Console","4","10 K"';
  const changed = await runtime.observeOwnership(changedObservationOwner, 55);
  assert.equal(changed.status, "live");
  assert.notEqual(changed.status === "live" ? changed.owner.token : "", changedObservationOwner.token);
  row = '"codex.exe","129","Console","4","12,000 K"';
  assert.deepEqual(await runtime.observeOwnership(changedObservationOwner, 55), { status: "dead" });
  assert.deepEqual(calls[0], {
    executable: "tasklist",
    args: ["/FI", "PID eq 123", "/FO", "CSV", "/NH"],
    timeout: 55,
  });

  for (const invalidPid of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const callsBefore: number = calls.length;
    const invalidOwner: CodexDetachedOwner = {
      kind: "windows-process-tree",
      rootPid: invalidPid,
      token: "invalid-owner",
    };
    assert.equal(await runtime.acquireOwnership(invalidPid, 55), undefined);
    assert.deepEqual(await runtime.observeOwnership(invalidOwner, 55), { status: "unavailable" });
    await assert.rejects(runtime.terminateOwnedTree(invalidOwner, 55), /owner pid is invalid/);
    assert.equal(calls.length, callsBefore, "an invalid runtime owner never reaches tasklist or taskkill");
  }

  const wrongKindOwner: CodexDetachedOwner = {
    kind: "posix-process-group",
    rootPid: 130,
    token: "pgid:130",
  };
  const callsBeforeWrongKind = calls.length;
  assert.deepEqual(await runtime.observeOwnership(wrongKindOwner, 55), { status: "unavailable" });
  await assert.rejects(runtime.terminateOwnedTree(wrongKindOwner, 55), /kind does not match/);
  assert.equal(calls.length, callsBeforeWrongKind, "a POSIX owner never reaches tasklist or taskkill");

  row = '"codex.exe","131","Console","4","12,000 K"';
  const disappearingOwner = await runtime.acquireOwnership(131, 55);
  assert.ok(disappearingOwner !== undefined);
  row = "INFO: No tasks are running which match the specified criteria.";
  assert.deepEqual(await runtime.observeOwnership(disappearingOwner, 55), { status: "dead" });
  row = '"codex.exe","131","Console","4","12,000 K"';
  const callsBeforeDisappearanceReuse = calls.length;
  assert.deepEqual(await runtime.observeOwnership(disappearingOwner, 55), { status: "dead" });
  assert.equal(calls.length, callsBeforeDisappearanceReuse, "a disappeared owner cannot reopen on pid reuse");
});

test("pinned-command-scrubs-env-and-spawns-detached: production runtime reaps a real detached child", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const runtime = codexDetachedProductionRuntime;
  assert.equal(runtime.platform, platform);
  let processError: Error | undefined;
  const child = runtime.spawn({
    executable: process.execPath,
    args: ["-e", "setInterval(() => undefined, 1_000)"],
    cwd: process.cwd(),
    env: { ...process.env },
  }, {
    stdout: () => undefined,
    error: (error) => { processError = error; },
    exit: () => undefined,
  });
  assert.equal(typeof child.pid, "number");
  const pid = child.pid!;
  let owner: CodexDetachedOwner | undefined;
  try {
    const acquisitionDeadline = Date.now() + 3_000;
    do {
      owner = await runtime.acquireOwnership(pid, 1_000);
      if (owner === undefined) await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
    } while (owner === undefined && Date.now() < acquisitionDeadline);
    assert.ok(owner !== undefined, "the production adapter acquires the real child root");
    assert.deepEqual(await runtime.observeOwnership(owner, 1_000), { status: "live", owner });
    await runtime.terminateOwnedTree(owner, 1_000);
    const deathDeadline = Date.now() + 3_000;
    let observation: CodexDetachedOwnerObservation;
    do {
      observation = await runtime.observeOwnership(owner, 1_000);
      if (observation.status !== "dead") {
        await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
      }
    } while (observation.status !== "dead" && Date.now() < deathDeadline);
    assert.deepEqual(observation, { status: "dead" });
    assert.equal(processError, undefined);
  } finally {
    try {
      if (owner !== undefined) {
        const observation = await runtime.observeOwnership(owner, 500);
        if (observation.status === "live" && sameTestOwner(owner, observation.owner)) {
          await runtime.terminateOwnedTree(owner, 500);
        }
      }
    } catch { /* the direct pid fallback below still reaps the stand-in */ }
    try { process.kill(pid, "SIGKILL"); }
    catch { /* already gone */ }
  }
});

test("owner-validation-rejects-invalid-pid-root-kind-and-token: rejects every invalid boundary and performs provisional cleanup", async () => {
  const invalidPids: Array<number | undefined> = [undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];
  for (const pid of invalidPids) {
    const harness = createHarness({ pid });
    await assert.rejects(harness.open(harness.args()), /positive pid/);
    assert.equal(harness.provisionalTerminations, 1);
    assert.equal(harness.ended, 1);
  }

  const invalidOwners: Array<CodexDetachedOwner | undefined> = [
    undefined,
    { kind: "posix-process-group", rootPid: 0, token: "token" },
    { kind: "posix-process-group", rootPid: -1, token: "token" },
    { kind: "posix-process-group", rootPid: 701.5, token: "token" },
    { kind: "posix-process-group", rootPid: Number.NaN, token: "token" },
    { kind: "posix-process-group", rootPid: Number.POSITIVE_INFINITY, token: "token" },
    { kind: "posix-process-group", rootPid: Number.MAX_SAFE_INTEGER + 1, token: "token" },
    { kind: "posix-process-group", rootPid: 702, token: "token" },
    { kind: "windows-process-tree", rootPid: 701, token: "token" },
    { kind: "posix-process-group", rootPid: 701, token: "" },
    { kind: "posix-process-group", rootPid: 701, token: " \t " },
  ];
  for (const candidate of invalidOwners) {
    const harness = createHarness({ candidate });
    await assert.rejects(harness.open(harness.args()), /exact Codex process ownership/);
    assert.equal(harness.provisionalTerminations, 1);
    assert.deepEqual(harness.terminations, [], "an untrusted candidate is never used as a kill target");
  }

  const windowsWrongKind = createHarness({
    platform: "windows",
    candidate: { kind: "posix-process-group", rootPid: 701, token: "wrong-kind" },
  });
  await assert.rejects(windowsWrongKind.open(windowsWrongKind.args()), /exact Codex process ownership/);
  assert.equal(windowsWrongKind.provisionalTerminations, 1);
  assert.deepEqual(windowsWrongKind.terminations, []);
});

test("ownership-acquisition-failure-reaps-spawned-child: unavailable, thrown, and bounded acquisition failures confirm provisional death", async () => {
  const unavailable = createHarness({ acquire: async () => undefined });
  await assert.rejects(unavailable.open(unavailable.args()), /ownership/);
  assert.equal(unavailable.provisionalTerminations, 1);
  assert.equal(unavailable.live, false);

  const thrown = createHarness({ acquire: async () => { throw new Error("ownership probe failed"); } });
  await assert.rejects(thrown.open(thrown.args()), /ownership acquisition failed/);
  assert.equal(thrown.provisionalTerminations, 1);
  assert.equal(thrown.live, false);

  let settleLateAcquisition: ((owner: CodexDetachedOwner | undefined) => void) | undefined;
  const timedOut = createHarness({
    acquire: async () => await new Promise<CodexDetachedOwner | undefined>((resolve) => { settleLateAcquisition = resolve; }),
  });
  const pending = timedOut.open(timedOut.args({ timeoutMs: 15 }));
  await flush();
  timedOut.clock.advance(15);
  await assert.rejects(pending, /ownership acquisition timed out/);
  settleLateAcquisition?.(undefined);
  await flush();
  assert.equal(timedOut.provisionalTerminations, 1);
  assert.equal(timedOut.live, false);
});

test("ownership-acquisition-failure-reaps-spawned-child: provisional cleanup is bounded and uses the normalized timeout", async () => {
  const terminatorThrow = createHarness({
    candidate: undefined,
    provisionalTerminate: async () => { throw new Error("secret terminator detail"); },
    provisionalObserve: async () => false,
  });
  await assert.rejects(
    terminatorThrow.open(terminatorThrow.args({ timeoutMs: 17 })),
    /cleanup failed.*provisional termination failed/,
  );
  assert.deepEqual(terminatorThrow.provisionalTerminationTimeouts, [17]);
  assert.deepEqual(terminatorThrow.provisionalObservationTimeouts, [17]);

  let settleTerminator: (() => void) | undefined;
  const terminatorHang = createHarness({
    candidate: undefined,
    provisionalTerminate: async () => await new Promise<void>((resolve) => { settleTerminator = resolve; }),
    provisionalObserve: async () => false,
  });
  const hangingTermination = terminatorHang.open(terminatorHang.args({ timeoutMs: 18 }));
  await waitUntil(() => terminatorHang.provisionalTerminations === 1, "provisional termination");
  terminatorHang.clock.advance(18);
  await assert.rejects(hangingTermination, /cleanup failed.*provisional termination timed out/);
  assert.deepEqual(terminatorHang.provisionalTerminationTimeouts, [18]);
  assert.deepEqual(terminatorHang.provisionalObservationTimeouts, [18]);
  settleTerminator?.();

  const observerThrow = createHarness({
    candidate: undefined,
    provisionalObserve: async () => { throw new Error("secret observer detail"); },
  });
  await assert.rejects(
    observerThrow.open(observerThrow.args({ timeoutMs: 21 })),
    /cleanup failed.*provisional observation failed/,
  );
  assert.deepEqual(observerThrow.provisionalTerminationTimeouts, [21]);
  assert.deepEqual(observerThrow.provisionalObservationTimeouts, [21]);

  let settleObserver: ((live: boolean) => void) | undefined;
  const observerHang = createHarness({
    candidate: undefined,
    provisionalObserve: async () => await new Promise<boolean>((resolve) => { settleObserver = resolve; }),
  });
  const hangingObservation = observerHang.open(observerHang.args({ timeoutMs: 22 }));
  await waitUntil(() => observerHang.provisionalObservationTimeouts.length === 1, "provisional observation");
  observerHang.clock.advance(22);
  await assert.rejects(hangingObservation, /cleanup failed.*provisional observation timed out/);
  assert.deepEqual(observerHang.provisionalTerminationTimeouts, [22]);
  assert.deepEqual(observerHang.provisionalObservationTimeouts, [22]);
  settleObserver?.(false);
});

async function rejectsInvalidOpenResult(options: {
  readonly initialize?: unknown;
  readonly thread?: unknown;
}): Promise<void> {
  const harness = createHarness({
    responder: (message, events) => {
      if (message.method === "initialize") {
        events.stdout(`${JSON.stringify({ id: message.id, result: options.initialize })}\n`);
      }
      if (message.method === "thread/start") {
        events.stdout(`${JSON.stringify({ id: message.id, result: options.thread })}\n`);
      }
    },
  });
  await assert.rejects(harness.open(harness.args()), /invalid|malformed/);
  assert.equal(harness.terminations.length, 1);
  assert.equal(harness.live, false);
}

test("initialize-notification-thread-order-returns-response-identity: validates every identity field and stages no turn", async () => {
  const valid = createHarness();
  const thread = await valid.open(valid.args());
  assert.deepEqual(
    { threadId: thread.threadId, model: thread.model, reasoningEffort: thread.reasoningEffort },
    { threadId: "response-thread", model: "response-model", reasoningEffort: "response-effort" },
  );
  assert.deepEqual(valid.writes.map((message) => message.method), ["initialize", "initialized", "thread/start"]);
  assert.deepEqual(valid.writes.at(-1), {
    id: valid.writes.at(-1)!.id,
    method: "thread/start",
    params: {
      model: "requested-model",
      config: { model_reasoning_effort: "requested-effort" },
      ephemeral: true,
    },
  });
  assert.equal(valid.writes.some((message) => message.method === "turn/start"), false);
  await thread.terminate();

  for (const initialize of [null, [], "invalid", 0, false]) {
    await rejectsInvalidOpenResult({
      initialize,
      thread: { thread: { id: "t" }, model: "m", reasoningEffort: "e" },
    });
  }
  const invalidThreads: unknown[] = [
    null,
    [],
    "invalid",
    {},
    { thread: null },
    { thread: [] },
    { thread: {} },
  ];
  for (const invalid of [undefined, null, 0, "", " \t "]) {
    const identity: Record<string, unknown> = { id: "thread" };
    if (invalid === undefined) delete identity.id; else identity.id = invalid;
    invalidThreads.push({ thread: identity, model: "model", reasoningEffort: "effort" });
  }
  for (const field of ["model", "reasoningEffort"] as const) {
    for (const invalid of [undefined, null, 0, "", " \t "]) {
      const result: Record<string, unknown> = {
        thread: { id: "thread" },
        model: "model",
        reasoningEffort: "effort",
      };
      if (invalid === undefined) delete result[field]; else result[field] = invalid;
      invalidThreads.push(result);
    }
  }
  for (const invalid of invalidThreads) await rejectsInvalidOpenResult({ initialize: {}, thread: invalid });
});

test("jsonl-fragments-and-correlates-responses: streams UTF-8, accepts notifications, and resolves concurrent replies by id", async () => {
  const harness = createHarness({ responder: () => undefined });
  const opening = harness.open(harness.args());
  const initialize = await waitForMethod(harness.writes, "initialize");
  const encoded = new TextEncoder().encode(`${JSON.stringify({ id: initialize.id, result: { serverInfo: { name: "Codex ☃" } } })}\n`);
  const snowman = [...encoded].findIndex((value, index, all) => value === 0xe2 && all[index + 1] === 0x98);
  harness.emitRaw(encoded.slice(0, snowman + 1));
  harness.emitRaw(encoded.slice(snowman + 1));
  await flush();
  assert.equal(harness.writes.at(-1)?.method, "thread/start");
  const threadStart = harness.writes.at(-1)!;
  harness.emitRaw(`\n${JSON.stringify({ method: "thread/started", params: { id: "notice" } })}\n${JSON.stringify({
    id: threadStart.id,
    result: { thread: { id: "streamed-thread" }, model: "streamed-model", reasoningEffort: "high" },
  })}\n`);
  const thread = await opening;
  assert.equal(thread.threadId, "streamed-thread");

  const turnPromise = thread.startTurn("exact prompt");
  const probePromise = thread.probe();
  await flush();
  const turnRequest = harness.writes.find((message) => message.method === "turn/start")!;
  const limitsRequest = harness.writes.find((message) => message.method === "account/rateLimits/read")!;
  harness.emitRaw(`${JSON.stringify({ method: "account/updated", params: {} })}\n${JSON.stringify({
    id: limitsRequest.id,
    result: { rateLimits: { primary: { usedPercent: 12 } } },
  })}\n${JSON.stringify({
    id: turnRequest.id,
    result: { turn: { id: "reverse-turn", status: "completed" } },
  })}\n`);
  assert.deepEqual(await probePromise, { live: true, rateLimits: { primary: { usedPercent: 12 } } });
  assert.deepEqual(await turnPromise, { turnId: "reverse-turn", status: "completed" });
  await thread.terminate();
});

test("jsonl-rpc-write-and-exit-faults-clean-up: every protocol and process fault settles pending work after exact cleanup", async () => {
  const frameRows: Array<(id: number) => string> = [
    () => "{not-json}\n",
    () => "null\n",
    () => `${JSON.stringify({ value: "no id or method" })}\n`,
    () => `${JSON.stringify({ method: "notice", result: {} })}\n`,
    () => `${JSON.stringify({ method: "notice", error: {} })}\n`,
    () => `${JSON.stringify({ id: "1", result: {} })}\n`,
    () => `${JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1, result: {} })}\n`,
    () => `${JSON.stringify({ id: 999, result: {} })}\n`,
    (id) => `${JSON.stringify({ id })}\n`,
    (id) => `${JSON.stringify({ id, result: {}, error: { code: -1 } })}\n`,
    (id) => `${JSON.stringify({ id, error: { code: -1, message: "raw secret must not escape" } })}\n`,
  ];
  for (const frame of frameRows) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder(() => undefined);
    const pending = thread.startTurn("fault me");
    await flush();
    const id = harness.writes.at(-1)!.id!;
    harness.emitRaw(frame(id));
    await assert.rejects(pending, (error: unknown) => {
      assert.match((error as Error).message, /Codex app-server|turn\/start/);
      assert.equal((error as Error).message.includes("raw secret"), false);
      return true;
    });
    assert.equal(harness.terminations.length, 1);
    assert.equal(harness.live, false);
  }

  const concurrent = createHarness();
  const concurrentThread = await concurrent.open(concurrent.args());
  concurrent.setResponder(() => undefined);
  const pendingTurn = concurrentThread.startTurn("pending one");
  const pendingProbe = concurrentThread.probe();
  await waitForMethod(concurrent.writes, "account/rateLimits/read");
  concurrent.emitRaw("{broken}\n");
  const settled = await Promise.allSettled([pendingTurn, pendingProbe]);
  assert.deepEqual(settled.map((result) => result.status), ["rejected", "rejected"]);
  assert.equal(concurrent.terminations.length, 1);

  const requestWrite = createHarness();
  const requestThread = await requestWrite.open(requestWrite.args());
  requestWrite.setResponder((message) => {
    if (message.method === "turn/start") throw new Error("request write broke");
  });
  await assert.rejects(requestThread.startTurn("write"), /request write failed/);
  assert.equal(requestWrite.terminations.length, 1);

  const notificationWrite = createHarness({
    responder: (message, events) => {
      if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
      if (message.method === "initialized") throw new Error("notification write broke");
    },
  });
  await assert.rejects(notificationWrite.open(notificationWrite.args()), /notification write failed/);
  assert.equal(notificationWrite.terminations.length, 1);

  for (const event of ["error", "exit"] as const) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder(() => undefined);
    const pending = thread.startTurn("pending during process fault");
    await flush();
    if (event === "error") harness.events.error(new Error("pipe broke"));
    else harness.events.exit(1, null);
    await assert.rejects(pending, event === "error" ? /process error/ : /exited early/);
    assert.equal(harness.terminations.length, 1, "root exit does not count as owned-tree death");
    assert.equal(harness.live, false);
  }
});

test("jsonl-rpc-write-and-exit-faults-clean-up: terminal faults are monotonic across spawn and response races", async () => {
  const beforeSpawn = createHarness({
    beforeSpawnReturn: (events) => { events.stdout("{malformed before spawn returned}\n"); },
  });
  await assert.rejects(beforeSpawn.open(beforeSpawn.args()), /malformed JSONL/);
  assert.equal(beforeSpawn.provisionalTerminations, 1);
  assert.equal(beforeSpawn.ended, 1);

  for (const event of ["error", "exit"] as const) {
    const afterResponse = createHarness({
      responder: (message, events) => {
        defaultResponder(message, events);
        if (message.method === "thread/start") {
          if (event === "error") events.error(new Error("secret process diagnostic"));
          else events.exit(17, null);
        }
      },
    });
    await assert.rejects(
      afterResponse.open(afterResponse.args()),
      event === "error" ? /process error/ : /exited early/,
    );
    assert.equal(afterResponse.terminations.length, 1);
    assert.equal(afterResponse.ended, 1);
  }

  const spontaneous = createHarness();
  const thread = await spontaneous.open(spontaneous.args());
  spontaneous.events.error(new Error("raw secret must not escape"));
  await assert.rejects(thread.startTurn("must not reopen"), (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server process error");
    return true;
  });
  await assert.rejects(thread.probe(), /Codex app-server process error/);
  assert.equal(spontaneous.terminations.length, 1);
  assert.equal(spontaneous.writes.some((message) => message.method === "turn/start"), false);

  const duplicate = createHarness();
  const duplicateThread = await duplicate.open(duplicate.args());
  duplicate.setResponder((message, events) => {
    if (message.method !== "turn/start") return;
    const response = JSON.stringify({
      id: message.id,
      result: { turn: { id: "only-once", status: "completed" } },
    });
    events.stdout(`${response}\n${response}\n`);
  });
  await assert.rejects(duplicateThread.startTurn("duplicate response"), /unknown response id/);
  await assert.rejects(duplicateThread.probe(), /unknown response id/);
  assert.equal(duplicate.terminations.length, 1);

  let finishCleanup: (() => void) | undefined;
  const delayedCleanup = createHarness({
    terminate: async () => await new Promise<void>((resolve) => { finishCleanup = resolve; }),
  });
  const delayedThread = await delayedCleanup.open(delayedCleanup.args());
  delayedCleanup.setResponder(() => undefined);
  const pendingTurn = delayedThread.startTurn("wait for cleanup");
  await waitForMethod(delayedCleanup.writes, "turn/start");
  let settled = false;
  void pendingTurn.then(() => { settled = true; }, () => { settled = true; });
  delayedCleanup.emitRaw("{fault}\n");
  await flush();
  assert.equal(settled, false, "pending RPC remains unsettled while exact cleanup is in flight");
  delayedCleanup.live = false;
  finishCleanup?.();
  await assert.rejects(pendingTurn, /malformed JSONL/);

  let reentrant!: ReturnType<typeof createHarness>;
  reentrant = createHarness({
    end: () => { reentrant.events.error(new Error("synchronous close fault")); },
  });
  const reentrantThread = await reentrant.open(reentrant.args());
  reentrant.setResponder(() => undefined);
  const reentrantPending = reentrantThread.startTurn("cleanup once");
  await waitForMethod(reentrant.writes, "turn/start");
  reentrant.events.error(new Error("initial process fault"));
  await assert.rejects(reentrantPending, /process error/);
  assert.equal(reentrant.ended, 1);
  assert.equal(reentrant.terminations.length, 1);

  const simultaneousTimeouts = createHarness();
  const timeoutThread = await simultaneousTimeouts.open(simultaneousTimeouts.args({ timeoutMs: 23 }));
  simultaneousTimeouts.setResponder(() => undefined);
  const firstTimeout = timeoutThread.startTurn("first timer owns the fault");
  await waitForMethod(simultaneousTimeouts.writes, "turn/start");
  const secondTimeout = timeoutThread.probe();
  await waitForMethod(simultaneousTimeouts.writes, "account/rateLimits/read");
  simultaneousTimeouts.clock.advance(23);
  const timedOut = await Promise.allSettled([firstTimeout, secondTimeout]);
  for (const result of timedOut) {
    assert.equal(result.status, "rejected");
    assert.match((result as PromiseRejectedResult).reason.message, /turn\/start timed out/);
  }
  await assert.rejects(timeoutThread.probe(), /turn\/start timed out/);
  assert.equal(simultaneousTimeouts.terminations.length, 1);
});

test("windows-tree-owner-is-observed-probed-and-terminated: root exit and owner change are never taskkill targets", async () => {
  for (const changeToken of [false, true]) {
    let changed = false;
    let observations = 0;
    const harness = createHarness({
      platform: "windows",
      observe: async (expected) => {
        observations += 1;
        return {
          status: "live",
          owner: changed && changeToken ? { ...expected, token: `${expected.token}-reused` } : expected,
        };
      },
    });
    const thread = await harness.open(harness.args());
    changed = true;
    harness.events.exit(0, null);
    await assert.rejects(thread.probe(), /exited early/);
    assert.deepEqual(harness.terminations, []);
    assert.equal(harness.ended, 1);
    assert.equal(observations, 0, "the observed root exit is already ownership loss, not a new tasklist target");
  }

  const changedBeforeTerminate = createHarness({
    platform: "windows",
    observe: async (expected) => ({
      status: "live",
      owner: { ...expected, token: `${expected.token}-reused` },
    }),
  });
  const changedThread = await changedBeforeTerminate.open(changedBeforeTerminate.args());
  await changedThread.terminate();
  assert.deepEqual(changedBeforeTerminate.terminations, []);
});

test("request-timeouts-use-safe-bound-and-clean-up: every request phase expires deterministically and reaps before rejection", async () => {
  for (const timeoutMs of [
    undefined,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
  ]) {
    const harness = createHarness();
    const seen: number[] = [];
    const callArgs = harness.args({
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      authRunner: async (command) => {
        seen.push(command.timeoutMs);
        return { code: 1, stdout: "", stderr: "" };
      },
    });
    if (timeoutMs === undefined) Reflect.deleteProperty(callArgs, "timeoutMs");
    await assert.rejects(harness.open(callArgs), /not authenticated/);
    assert.deepEqual(seen, [60_000]);
  }
  const explicit = createHarness();
  const explicitSeen: number[] = [];
  await assert.rejects(explicit.open(explicit.args({
    timeoutMs: 17,
    authRunner: async (command) => {
      explicitSeen.push(command.timeoutMs);
      return { code: 1, stdout: "", stderr: "" };
    },
  })));
  assert.deepEqual(explicitSeen, [17]);

  const initialize = createHarness({ responder: () => undefined });
  const initializePending = initialize.open(initialize.args({ timeoutMs: 12 }));
  await waitForMethod(initialize.writes, "initialize");
  initialize.clock.advance(12);
  await assert.rejects(initializePending, /initialize timed out/);
  assert.equal(initialize.terminations.length, 1);

  const threadStart = createHarness({
    responder: (message, events) => {
      if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
    },
  });
  const threadPending = threadStart.open(threadStart.args({ timeoutMs: 13 }));
  await waitForMethod(threadStart.writes, "thread/start");
  threadStart.clock.advance(13);
  await assert.rejects(threadPending, /thread\/start timed out/);
  assert.equal(threadStart.terminations.length, 1);

  const turn = createHarness();
  const turnThread = await turn.open(turn.args({ timeoutMs: 14 }));
  turn.setResponder(() => undefined);
  const turnPending = turnThread.startTurn("bounded turn");
  await waitForMethod(turn.writes, "turn/start");
  turn.clock.advance(14);
  await assert.rejects(turnPending, /turn\/start timed out/);
  assert.equal(turn.terminations.length, 1);

  const limits = createHarness();
  const limitsThread = await limits.open(limits.args({ timeoutMs: 16 }));
  limits.setResponder(() => undefined);
  const limitsPending = limitsThread.probe();
  await waitForMethod(limits.writes, "account/rateLimits/read");
  limits.clock.advance(16);
  await assert.rejects(limitsPending, /account\/rateLimits\/read timed out/);
  assert.equal(limits.terminations.length, 1);

  const successfulTimers = createHarness();
  const successfulThread = await successfulTimers.open(successfulTimers.args({ timeoutMs: 11 }));
  assert.deepEqual(await successfulThread.startTurn("first success"), {
    turnId: "response-turn",
    status: "inProgress",
  });
  assert.deepEqual(await successfulThread.probe(), {
    live: true,
    rateLimits: { primary: null, secondary: null },
  });
  successfulTimers.clock.advance(111);
  await flush();
  assert.equal(successfulTimers.terminations.length, 0, "successful requests release every armed timer");
  assert.deepEqual(await successfulThread.startTurn("still healthy"), {
    turnId: "response-turn",
    status: "inProgress",
  });
  await successfulThread.terminate();
});

test("turn-prompt-and-response-failures-clean-up: validates prompt and every returned turn field", async () => {
  for (const prompt of ["", " ", "\t\r\n"]) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    const before = harness.writes.length;
    await assert.rejects(thread.startTurn(prompt), /prompt must not be blank/);
    assert.equal(harness.writes.length, before);
    assert.equal(harness.terminations.length, 1);
    await assert.rejects(thread.probe(), /prompt must not be blank/);
  }

  const invalidTurns: unknown[] = [null, [], "invalid", {}, { turn: null }, { turn: [] }, { turn: {} }];
  for (const field of ["id", "status"] as const) {
    for (const invalid of [undefined, null, 0, "", " \t ", ...(field === "status" ? ["accepted", "unknown"] : [])]) {
      const identity: Record<string, unknown> = { id: "turn", status: "inProgress" };
      if (invalid === undefined) delete identity[field]; else identity[field] = invalid;
      invalidTurns.push({ turn: identity });
    }
  }
  for (const invalid of invalidTurns) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder((message, events) => {
      if (message.method === "turn/start") events.stdout(`${JSON.stringify({ id: message.id, result: invalid })}\n`);
    });
    await assert.rejects(thread.startTurn("exact prompt"), /invalid|malformed/);
    assert.equal(harness.terminations.length, 1);
    await assert.rejects(thread.probe(), /turn\/start returned an invalid result/);
  }

  for (const status of ["completed", "interrupted", "failed", "inProgress"] as const) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder((message, events) => {
      if (message.method === "turn/start") {
        events.stdout(`${JSON.stringify({ id: message.id, result: { turn: { id: status, status } } })}\n`);
      }
    });
    assert.deepEqual(await thread.startTurn(status), { turnId: status, status });
    await thread.terminate();
  }

  const valid = createHarness();
  const thread = await valid.open(valid.args());
  const turn = await thread.startTurn("  exact prompt  ");
  assert.deepEqual(turn, { turnId: "response-turn", status: "inProgress" });
  assert.deepEqual(valid.writes.at(-1), {
    id: valid.writes.at(-1)!.id,
    method: "turn/start",
    params: {
      threadId: "response-thread",
      input: [{ type: "text", text: "  exact prompt  ", text_elements: [] }],
    },
  });
  await thread.terminate();
});

test("probe-tristate-and-same-channel-rate-limits: preserves live, dead, unavailable, changed-owner, and malformed observations", async () => {
  const live = createHarness();
  const liveThread = await live.open(live.args());
  assert.deepEqual(await liveThread.probe(), { live: true, rateLimits: { primary: null, secondary: null } });
  assert.equal(live.commands.length, 1);
  await liveThread.terminate();

  const dead = createHarness();
  const deadThread = await dead.open(dead.args());
  dead.live = false;
  const beforeDead = dead.writes.length;
  assert.deepEqual(await deadThread.probe(), { live: false, rateLimits: undefined });
  assert.equal(dead.writes.length, beforeDead);

  const unavailable = createHarness({ observe: async () => ({ status: "unavailable" }) });
  const unavailableThread = await unavailable.open(unavailable.args());
  const beforeUnavailable = unavailable.writes.length;
  assert.deepEqual(await unavailableThread.probe(), { live: "unavailable", rateLimits: undefined });
  assert.equal(unavailable.writes.length, beforeUnavailable);

  const observationError = createHarness({ observe: async () => { throw new Error("probe unavailable"); } });
  const observationErrorThread = await observationError.open(observationError.args());
  assert.deepEqual(await observationErrorThread.probe(), { live: "unavailable", rateLimits: undefined });

  const changedOwnerRows: Array<(expected: CodexDetachedOwner) => CodexDetachedOwner> = [
    (expected) => expected.kind === "posix-process-group"
      ? { kind: "windows-process-tree", rootPid: expected.rootPid, token: expected.token }
      : { kind: "posix-process-group", rootPid: expected.rootPid, token: expected.token },
    (expected) => ({ ...expected, rootPid: expected.rootPid + 1 }),
    (expected) => ({ ...expected, token: `${expected.token}-reused` }),
  ];
  for (const changeOwner of changedOwnerRows) {
    const changed = createHarness({
      observe: async (expected) => ({ status: "live", owner: changeOwner(expected) }),
    });
    const changedThread = await changed.open(changed.args());
    const writesBeforeProbe = changed.writes.length;
    assert.deepEqual(await changedThread.probe(), { live: false, rateLimits: undefined });
    assert.equal(changed.writes.length, writesBeforeProbe);
    await changedThread.terminate();
    assert.deepEqual(changed.terminations, []);
  }

  const exited = createHarness();
  const exitedThread = await exited.open(exited.args());
  const writesBeforeExit = exited.writes.length;
  exited.events.exit(0, null);
  await assert.rejects(exitedThread.probe(), /exited early/);
  assert.equal(exited.writes.length, writesBeforeExit);
  assert.equal(exited.terminations.length, 1);

  let raceLivenessCalls = 0;
  let releaseRaceLiveness: ((live: boolean | undefined) => void) | undefined;
  const racedFault = createHarness();
  const racedThread = await racedFault.open(racedFault.args({
    observeLiveness: async () => {
      raceLivenessCalls += 1;
      if (raceLivenessCalls === 1) {
        return await new Promise<boolean | undefined>((resolve) => { releaseRaceLiveness = resolve; });
      }
      return racedFault.live;
    },
  }));
  const racedProbe = racedThread.probe();
  await waitUntil(() => raceLivenessCalls === 1, "raced liveness observation");
  racedFault.events.error(new Error("fault during liveness"));
  releaseRaceLiveness?.(false);
  await assert.rejects(racedProbe, /process error/);
  assert.equal(racedFault.terminations.length, 1);

  for (const invalid of [undefined, null, [], "invalid", 0, {}, { rateLimits: null }, { rateLimits: [] }]) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder((message, events) => {
      if (message.method === "account/rateLimits/read") {
        const response = invalid === undefined ? { id: message.id, result: {} } : { id: message.id, result: invalid };
        events.stdout(`${JSON.stringify(response)}\n`);
      }
    });
    await assert.rejects(thread.probe(), /invalid/);
    assert.equal(harness.terminations.length, 1);
  }
});

test("termination-is-idempotent-bounded-and-confirms-death: shares cleanup and rejects every unconfirmed terminal state", async () => {
  let reads = 0;
  const polling = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => {
      reads += 1;
      return reads >= 3 ? { status: "dead" } : { status: "live", owner: expected };
    },
  });
  const pollingThread = await polling.open(polling.args({ timeoutMs: 25 }));
  await Promise.all([pollingThread.terminate(), pollingThread.terminate()]);
  await pollingThread.terminate();
  assert.deepEqual(polling.terminations, [polling.candidate]);
  assert.equal(polling.ended, 1);
  assert.equal(reads, 3);

  const alreadyDead = createHarness();
  const alreadyDeadThread = await alreadyDead.open(alreadyDead.args());
  alreadyDead.live = false;
  await alreadyDeadThread.terminate();
  assert.deepEqual(alreadyDead.terminations, []);

  const changedOwner = createHarness({
    platform: "windows",
    observe: async (expected) => ({
      status: "live",
      owner: { ...expected, token: `${expected.token}-changed` },
    }),
  });
  const changedOwnerThread = await changedOwner.open(changedOwner.args());
  await changedOwnerThread.terminate();
  assert.deepEqual(changedOwner.terminations, []);

  let racedObservationCalls = 0;
  let releaseRacedObservation: (() => void) | undefined;
  const exitDuringObservation = createHarness({
    platform: "windows",
    observe: async (expected) => {
      racedObservationCalls += 1;
      return await new Promise<CodexDetachedOwnerObservation>((resolve) => {
        releaseRacedObservation = () => { resolve({ status: "live", owner: expected }); };
      });
    },
  });
  const exitDuringObservationThread = await exitDuringObservation.open(exitDuringObservation.args());
  const racedTermination = exitDuringObservationThread.terminate();
  await waitUntil(() => racedObservationCalls === 1, "pre-termination owner observation");
  exitDuringObservation.events.exit(0, null);
  releaseRacedObservation?.();
  await racedTermination;
  assert.deepEqual(exitDuringObservation.terminations, [], "root exit during re-observation closes the kill window");

  let exitDuringTerminate!: ReturnType<typeof createHarness>;
  exitDuringTerminate = createHarness({
    terminate: async () => {
      exitDuringTerminate.live = false;
      exitDuringTerminate.events.exit(0, "SIGTERM");
    },
  });
  const exitingThread = await exitDuringTerminate.open(exitDuringTerminate.args());
  await exitingThread.terminate();
  assert.deepEqual(await exitingThread.probe(), { live: false, rateLimits: undefined });
  await assert.rejects(exitingThread.startTurn("already closed"), /app-server is unavailable/);

  const terminatorError = createHarness({ terminate: async () => { throw new Error("tree kill failed"); } });
  const terminatorThread = await terminatorError.open(terminatorError.args());
  await assert.rejects(terminatorThread.terminate(), /cleanup failed.*owner termination failed/);
  await assert.rejects(terminatorThread.terminate(), /cleanup failed.*owner termination failed/);
  assert.equal(terminatorError.terminations.length, 1);

  const unavailableBeforeKill = createHarness({
    observe: async () => ({ status: "unavailable" }),
  });
  const unavailableBeforeKillThread = await unavailableBeforeKill.open(unavailableBeforeKill.args());
  await assert.rejects(
    unavailableBeforeKillThread.terminate(),
    /ownership observation was unavailable before termination/,
  );
  assert.deepEqual(unavailableBeforeKill.terminations, []);

  let phase = 0;
  const unavailableAfterKill = createHarness({
    terminate: async () => { phase = 1; },
    observe: async (expected) => phase === 0
      ? { status: "live", owner: expected }
      : { status: "unavailable" },
  });
  const unavailableThread = await unavailableAfterKill.open(unavailableAfterKill.args());
  await assert.rejects(unavailableThread.terminate(), /death observation was unavailable/);

  const stillLive = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => ({ status: "live", owner: expected }),
  });
  const stillLiveThread = await stillLive.open(stillLive.args({ timeoutMs: 20 }));
  await assert.rejects(stillLiveThread.terminate(), /did not become dead/);

  let settleDelay: (() => void) | undefined;
  let delayCalls = 0;
  const hangingDelay = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => ({ status: "live", owner: expected }),
  });
  hangingDelay.clock.delay = async () => {
    delayCalls += 1;
    await new Promise<void>((resolve) => { settleDelay = resolve; });
  };
  const hangingDelayThread = await hangingDelay.open(hangingDelay.args({ timeoutMs: 23 }));
  const hangingDelayCleanup = hangingDelayThread.terminate();
  await waitUntil(() => delayCalls === 1, "cleanup delay");
  hangingDelay.clock.advance(23);
  await assert.rejects(hangingDelayCleanup, /cleanup failed.*cleanup delay timed out/);
  settleDelay?.();

  const endError = createHarness({ end: () => { throw new Error("stdin close failed"); } });
  const endErrorThread = await endError.open(endError.args());
  await assert.rejects(endErrorThread.terminate(), /protocol close failed/);
  assert.equal(endError.terminations.length, 1, "I/O close failure does not skip tree termination");

  let settleOwnerTermination: (() => void) | undefined;
  const hangingTerminator = createHarness({
    terminate: async () => await new Promise<void>((resolve) => { settleOwnerTermination = resolve; }),
  });
  const hangingTerminatorThread = await hangingTerminator.open(hangingTerminator.args({ timeoutMs: 24 }));
  const hangingTermination = hangingTerminatorThread.terminate();
  await waitUntil(() => hangingTerminator.terminations.length === 1, "owner termination");
  hangingTerminator.clock.advance(24);
  await assert.rejects(hangingTermination, /cleanup failed.*owner termination timed out/);
  settleOwnerTermination?.();

  let ownerObservations = 0;
  let settleOwnerObservation: ((observation: CodexDetachedOwnerObservation) => void) | undefined;
  const hangingObserver = createHarness({
    observe: async () => {
      ownerObservations += 1;
      return await new Promise<CodexDetachedOwnerObservation>((resolve) => { settleOwnerObservation = resolve; });
    },
  });
  const hangingObserverThread = await hangingObserver.open(hangingObserver.args({ timeoutMs: 26 }));
  const hangingObservation = hangingObserverThread.terminate();
  await waitUntil(() => ownerObservations === 1, "owner observation");
  hangingObserver.clock.advance(26);
  await assert.rejects(hangingObservation, /cleanup failed.*owner observation timed out/);
  settleOwnerObservation?.({ status: "dead" });

  let hangLiveness = true;
  let livenessCalls = 0;
  let settleLiveness: ((live: boolean | undefined) => void) | undefined;
  const hangingLiveness = createHarness();
  const hangingLivenessThread = await hangingLiveness.open(hangingLiveness.args({
    timeoutMs: 28,
    observeLiveness: async () => {
      livenessCalls += 1;
      if (!hangLiveness) return hangingLiveness.live;
      return await new Promise<boolean | undefined>((resolve) => { settleLiveness = resolve; });
    },
  }));
  const livenessProbe = hangingLivenessThread.probe();
  await waitUntil(() => livenessCalls === 1, "liveness observation");
  hangingLiveness.clock.advance(28);
  assert.deepEqual(await livenessProbe, { live: "unavailable", rateLimits: undefined });
  hangLiveness = false;
  settleLiveness?.(undefined);
  await hangingLivenessThread.terminate();
});
