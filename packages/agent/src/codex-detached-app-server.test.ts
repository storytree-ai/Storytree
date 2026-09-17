import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  openPinnedCodexDetachedThread,
  type CodexDetachedThread,
  type OpenPinnedCodexDetachedThreadArgs,
} from "./index.js";
import {
  codexDetachedPlatformFor,
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
  private delayCalls = 0;
  private readonly delays: number[] = [];
  private readonly clearedTimers: number[] = [];
  private readonly timers = new Map<number, { readonly at: number; readonly callback: () => void }>();

  now(): number { return this.current; }

  get pendingTimerCount(): number { return this.timers.size; }
  get delayCallCount(): number { return this.delayCalls; }
  get delayDurations(): readonly number[] { return this.delays; }
  get clearedTimerHandles(): readonly number[] { return this.clearedTimers; }

  setTimeout(callback: () => void, ms: number): ReturnType<CodexDetachedClock["setTimeout"]> {
    if (this.timers.size >= 100) throw new Error("manual clock timer runaway");
    const id = this.nextId++;
    this.timers.set(id, { at: this.current + ms, callback });
    return id;
  }

  clearTimeout(handle: ReturnType<CodexDetachedClock["setTimeout"]>): void {
    if (typeof handle !== "number") throw new Error("manual clock received a non-numeric timer handle");
    const id = handle;
    this.clearedTimers.push(id);
    this.timers.delete(id);
  }

  async delay(ms: number): Promise<void> {
    this.delayCalls += 1;
    if (this.delayCalls > 100) throw new Error("manual clock delay runaway");
    this.delays.push(ms);
    this.current += ms;
  }

  advance(ms: number): void {
    this.current += ms;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.current)
      .sort((left, right) => left[1].at - right[1].at);
    for (const [id, timer] of due) {
      if (!this.timers.delete(id)) continue;
      timer.callback();
    }
  }
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

class SettlementWallError extends Error {
  constructor(label: string) {
    super(`TEST SETTLEMENT WALL: ${label}`);
  }
}

interface SettlementGuard {
  drain(): Promise<void>;
  assertDrained(): void;
}

async function mustSettle<T>(
  operation: Promise<T>,
  label: string,
  guard: SettlementGuard,
  assertDrainedOnSuccess = false,
): Promise<T> {
  let operationSettled = false;
  const observed = operation.then(
    (value) => {
      operationSettled = true;
      return { kind: "fulfilled" as const, value };
    },
    (error: unknown) => {
      operationSettled = true;
      return { kind: "rejected" as const, error };
    },
  );
  let watchdog!: ReturnType<typeof setTimeout>;
  const wall = new Promise<{ readonly kind: "wall" }>((resolve) => {
    watchdog = setTimeout(() => { resolve({ kind: "wall" }); }, 2_000);
  });
  const outcome = await Promise.race([observed, wall]);
  clearTimeout(watchdog);
  if (outcome.kind === "wall") {
    await guard.drain();
    await flush();
    assert.equal(operationSettled, true, `${label} remained pending after its deterministic drain`);
    guard.assertDrained();
    throw new SettlementWallError(label);
  }
  if (outcome.kind === "rejected") {
    guard.assertDrained();
    throw outcome.error;
  }
  if (assertDrainedOnSuccess) guard.assertDrained();
  return outcome.value;
}

async function waitForMethod(
  writes: readonly RpcMessage[],
  method: string,
  drain: () => Promise<void>,
): Promise<RpcMessage> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const found = writes.findLast((message) => message.method === method);
    if (found !== undefined) return found;
    await flush();
  }
  await drain();
  throw new Error(`${method} was not written`);
}

async function waitUntil(
  predicate: () => boolean,
  description: string,
  drain: () => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flush();
  }
  await drain();
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

function expectWindowsOwner(
  owner: CodexDetachedOwner | undefined,
  pid: number,
  descriptor: string,
): CodexDetachedOwner {
  assert.ok(owner !== undefined);
  assert.equal(owner.kind, "windows-process-tree");
  assert.equal(owner.rootPid, pid);
  const separator = owner.token.indexOf("\u0000");
  assert.match(
    owner.token.slice(0, separator),
    /^runtime:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:generation:[0-9]+$/u,
  );
  assert.equal(owner.token.slice(separator + 1), descriptor);
  return owner;
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
  readonly nativeRootTerminate?: (timeoutMs: number) => Promise<void>;
  readonly provisionalTerminateGetterFailure?: unknown;
  readonly nativeRootGetterFailure?: unknown;
  readonly includeNativeRoot?: boolean;
  readonly omitProvisionalTerminate?: boolean;
  readonly omitProvisionalObserve?: boolean;
  readonly responder?: Responder;
  readonly end?: () => void;
  readonly spawnError?: unknown;
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
  const nativeRootTerminationTimeouts: number[] = [];
  const defaultAuthCalls: Parameters<CodexDetachedRuntime["runDefaultAuth"]>[0][] = [];
  let provisionalTerminations = 0;
  let nativeRootTerminations = 0;
  let ended = 0;
  let live = true;
  let spawned = false;
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
  };
  if (options.includeNativeRoot === true) {
    Object.assign(process, { terminateRoot: async (timeoutMs: number) => {
      nativeRootTerminations += 1;
      nativeRootTerminationTimeouts.push(timeoutMs);
      if (options.nativeRootTerminate !== undefined) {
        await options.nativeRootTerminate(timeoutMs);
      } else {
        live = false;
        events!.exit(0, "SIGTERM");
      }
    } });
  }
  if (options.omitProvisionalTerminate !== true) {
    Object.assign(process, { terminateTree: async (timeoutMs: number) => {
      provisionalTerminations += 1;
      provisionalTerminationTimeouts.push(timeoutMs);
      if (options.provisionalTerminate !== undefined) await options.provisionalTerminate(timeoutMs);
      else live = false;
    } });
  }
  if (options.omitProvisionalObserve !== true) {
    Object.assign(process, { observeTree: async (timeoutMs: number) => {
      provisionalObservationTimeouts.push(timeoutMs);
      return options.provisionalObserve === undefined
        ? live
        : await options.provisionalObserve(timeoutMs);
    } });
  }
  if ("provisionalTerminateGetterFailure" in options) {
    Object.defineProperty(process, "terminateTree", {
      configurable: true,
      get: () => { throw options.provisionalTerminateGetterFailure; },
    });
  }
  if ("nativeRootGetterFailure" in options) {
    Object.defineProperty(process, "terminateRoot", {
      configurable: true,
      get: () => { throw options.nativeRootGetterFailure; },
    });
  }

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
      spawned = true;
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

  const assertDrained = (): void => {
    assert.equal(clock.pendingTimerCount, 0, "a settled fake operation leaves no armed clock timer");
    if (spawned) assert.equal(ended, 1, "a settled terminal fake operation closes its child once");
  };
  const drain = async (): Promise<void> => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      clock.advance(2_147_483_647);
      await flush();
      if (spawned && ended === 0 && events !== undefined) {
        live = false;
        events.error(new Error("test settlement drain"));
        await flush();
      }
      if (clock.pendingTimerCount === 0 && (!spawned || ended === 1)) break;
    }
    if (spawned) live = false;
  };
  const guard: SettlementGuard = { drain, assertDrained };
  const rawOpen = createOpenPinnedCodexDetachedThread(runtime);
  const open = async (callArgs: Parameters<typeof rawOpen>[0]): Promise<CodexDetachedThread> => {
    const thread = await mustSettle(rawOpen(callArgs), "detached thread open", guard);
    return {
      ...thread,
      startTurn: async (prompt) => await mustSettle(thread.startTurn(prompt), "detached turn", guard),
      probe: async () => await mustSettle(thread.probe(), "detached probe", guard),
      terminate: async () => await mustSettle(
        thread.terminate(),
        "detached termination",
        guard,
        true,
      ),
    };
  };
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
    nativeRootTerminationTimeouts,
    defaultAuthCalls,
    runtime,
    open,
    drain,
    args,
    get events() { return events!; },
    get ended() { return ended; },
    get provisionalTerminations() { return provisionalTerminations; },
    get nativeRootTerminations() { return nativeRootTerminations; },
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
  assert.equal(codexDetachedPlatformFor("win32"), "windows");
  assert.equal(codexDetachedPlatformFor("linux"), "posix");

  const owner = ownerFor(platform, 431, "owned-group");
  const protocol: RpcMessage[] = [];
  const terminationRequests: CodexDetachedOwner[] = [];
  const ownershipRequests: Array<{ pid: number; platform: "posix" | "windows"; timeoutMs: number }> = [];
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
    observeOwnership: async (request) => {
      ownershipRequests.push(request);
      return alive ? owner : undefined;
    },
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
  const protocolIds = protocol
    .filter((message) => message.id !== undefined)
    .map((message) => message.id!);
  assert.equal(protocolIds.length, 2);
  assert.equal(protocolIds.every(Number.isSafeInteger), true);
  assert.notEqual(protocolIds[0], protocolIds[1]);
  assert.deepEqual(protocol, [
    {
      id: protocolIds[0],
      method: "initialize",
      params: { clientInfo: { name: "storytree", version: "0.0.0" } },
    },
    { method: "initialized", params: {} },
    {
      id: protocolIds[1],
      method: "thread/start",
      params: {
        model: "requested-model",
        config: { model_reasoning_effort: "requested-effort" },
        ephemeral: true,
      },
    },
  ]);
  assert.deepEqual(await thread.probe(), { live: true, rateLimits: { primary: null, secondary: null } });
  assert.deepEqual(await thread.startTurn("  do the bounded work  "), { turnId: "response-turn", status: "inProgress" });
  await Promise.all([thread.terminate(), thread.terminate()]);
  await thread.terminate();
  assert.equal(ended, 1);
  assert.deepEqual(terminationRequests, [owner]);
  assert.deepEqual(ownershipRequests, Array.from({ length: 4 }, () => ({
    pid: 431,
    platform,
    timeoutMs: 100,
  })));
});

test("staged-protocol-returns-response-produced-identity: the public opener ignores every private construction seam", async () => {
  const originalDefaultAuth = codexDetachedProductionRuntime.runDefaultAuth;
  const hiddenReads: string[] = [];
  let publicAuthCommand: Parameters<CodexDetachedRuntime["runDefaultAuth"]>[0] | undefined;
  const hostileArgs: OpenPinnedCodexDetachedThreadArgs = {
    cwd: process.cwd(),
    env: {},
    model: "requested-model",
    reasoningEffort: "requested-effort",
    timeoutMs: 100,
  };
  for (const key of [
    "authRunner",
    "spawn",
    "observeOwnership",
    "observeLiveness",
    "terminateOwnedTree",
  ]) {
    Object.defineProperty(hostileArgs, key, {
      configurable: true,
      get: () => {
        hiddenReads.push(key);
        throw new Error(`public opener read private seam ${key}`);
      },
    });
  }

  assert.equal(Reflect.set(
    codexDetachedProductionRuntime,
    "runDefaultAuth",
    async (command) => {
      publicAuthCommand = command;
      return { code: 1, stdout: "", stderr: "not logged in" };
    },
  ), true);
  try {
    await assert.rejects(
      openPinnedCodexDetachedThread(hostileArgs),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Codex is not authenticated with a ChatGPT-managed login");
        return true;
      },
    );
  } finally {
    assert.equal(Reflect.set(
      codexDetachedProductionRuntime,
      "runDefaultAuth",
      originalDefaultAuth,
    ), true);
  }
  assert.deepEqual(hiddenReads, []);
  assert.deepEqual(publicAuthCommand, {
    args: ["login", "status"],
    cwd: process.cwd(),
    env: {},
    timeoutMs: 100,
  });
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
    await assert.rejects(
      harness.open(harness.args({ authRunner })),
      /not authenticated|authentication preflight failed/,
    );
    assert.equal(resolutions, 0);
    assert.equal(harness.commands.length, 0);
  }
  const success = createHarness();
  const customAuthCommands: Array<{ args: string[]; timeoutMs: number }> = [];
  const thread = await success.open(success.args({
    authRunner: async (command) => {
      customAuthCommands.push(command);
      return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
    },
  }));
  assert.deepEqual(customAuthCommands, [{ args: ["login", "status"], timeoutMs: 40 }]);
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

  const maximumTimeout = createHarness();
  const maximumTimeouts: number[] = [];
  await assert.rejects(maximumTimeout.open(maximumTimeout.args({
    timeoutMs: 2_147_483_647,
    authRunner: async (command) => {
      maximumTimeouts.push(command.timeoutMs);
      return { code: 1, stdout: "", stderr: "" };
    },
  })), /not authenticated/);
  assert.deepEqual(maximumTimeouts, [2_147_483_647]);

  let settleLateAuth: (() => void) | undefined;
  const hangingDefault = createHarness({
    defaultAuth: async () => await new Promise((resolve) => {
      settleLateAuth = () => { resolve({ code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" }); };
    }),
  });
  const hangingArgs = hangingDefault.args({ timeoutMs: 19 });
  Reflect.deleteProperty(hangingArgs, "authRunner");
  const hangingOpen = hangingDefault.open(hangingArgs);
  await waitUntil(
    () => hangingDefault.defaultAuthCalls.length === 1,
    "default auth call",
    hangingDefault.drain,
  );
  hangingDefault.clock.advance(19);
  await assert.rejects(hangingOpen, /authentication preflight timed out/);
  settleLateAuth?.();
});

test("pinned-command-scrubs-env-and-spawns-detached: composes the exact command and native detached process", async () => {
  const harness = createHarness();
  const absoluteOverride = path.resolve("tools", "codex.exe");
  const paddedOverride = `  ${absoluteOverride}\t`;
  const thread = await harness.open(harness.args({
    cwd: "C:\\bounded-worktree",
    env: {
      STORYTREE_CODEX_EXECUTABLE: paddedOverride,
      KEEP_ME: "yes",
      OPENAI_API_KEY: "secret-a",
      Codex_Access_Token: "secret-b",
    },
  }));
  assert.deepEqual(harness.commands, [{
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\bounded-worktree",
    env: { STORYTREE_CODEX_EXECUTABLE: paddedOverride, KEEP_ME: "yes" },
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
  assert.equal(spawned.terminateRoot, undefined, "a native child without kill exposes no root terminator");
  assert.equal(await spawned.observeTree!(31), undefined, "a PID without an acquired token is not owned");
  await assert.rejects(spawned.terminateTree!(29), /owner is unavailable/);
  assert.equal(execCalls.length, 0);
  const firstOwner = expectWindowsOwner(
    await runtime.acquireOwnership(901, 31),
    901,
    "codex.exe\u0000901\u0000Console\u00004",
  );
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
  (listeners["child:exit"] as (code: number | null, signal: NodeJS.Signals | null) => void)(7, "SIGTERM");
  assert.deepEqual(forwardedExits, [{ code: 7, signal: "SIGTERM" }]);
  const callsBeforeExitedRootAcquisition = execCalls.length;
  assert.equal(await spawned.observeTree!(29), false, "native exit closes the spawned generation");
  assert.equal(await runtime.acquireOwnership(901, 27), undefined);
  assert.equal(execCalls.length, callsBeforeExitedRootAcquisition);
  await runtime.terminateOwnedTree(firstOwner, 27);
  assert.equal(execCalls.length, callsBeforeExitedRootAcquisition, "a known exited root cannot reach taskkill");

  lowLevelTaskRow = '"codex.exe","901","Console","4","13,000 K"';
  const respawned = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  const callsBeforeRespawnAcquisition = execCalls.length;
  assert.equal(await respawned.observeTree!(26), undefined, "same-pid respawn has no inherited owner token");
  await assert.rejects(respawned.terminateTree!(26), /owner is unavailable/);
  assert.equal(execCalls.length, callsBeforeRespawnAcquisition);
  expectWindowsOwner(
    await runtime.acquireOwnership(901, 26),
    901,
    "codex.exe\u0000901\u0000Console\u00004",
  );
  lowLevelTaskRow = '"codex.exe","901","Console","4","99,000 K"';
  assert.equal(await respawned.observeTree!(26), true, "mutable memory usage is not a root identity field");
  lowLevelTaskRow = '"other.exe","901","Console","4","13,000 K"';
  assert.equal(
    await respawned.observeTree!(26),
    false,
    "a changed provisional descriptor closes the captured generation during observation",
  );
  const callsAfterChangedObservation = execCalls.length;
  lowLevelTaskRow = '"codex.exe","901","Console","4","13,000 K"';
  assert.equal(await respawned.observeTree!(26), false, "a closed provisional generation cannot reopen");
  assert.equal(execCalls.length, callsAfterChangedObservation);
  const killsBeforeChangedDescriptor = execCalls.filter((call) => call.executable === "taskkill").length;
  await respawned.terminateTree!(26);
  assert.equal(
    execCalls.filter((call) => call.executable === "taskkill").length,
    killsBeforeChangedDescriptor,
    "a changed provisional token never reaches taskkill",
  );
  assert.equal(await respawned.observeTree!(26), false, "token loss remains dead for the provisional controller");

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

  lowLevelTaskRow = '"codex.exe","901","Console","4","14,500 K"';
  const changedDuringTermination = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  await runtime.acquireOwnership(901, 24);
  lowLevelTaskRow = '"other.exe","901","Console","4","14,500 K"';
  const killsBeforeChangedProvisional = execCalls.filter((call) => call.executable === "taskkill").length;
  await changedDuringTermination.terminateTree!(24);
  assert.equal(
    execCalls.filter((call) => call.executable === "taskkill").length,
    killsBeforeChangedProvisional,
    "a changed spawned-root descriptor is never a taskkill target",
  );

  lowLevelTaskRow = '"codex.exe","901","Console","4","15,000 K"';
  const missingDuringTermination = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  await runtime.acquireOwnership(901, 24);
  lowLevelTaskRow = "INFO: No tasks are running which match the specified criteria.";
  const killsBeforeMissingProvisional = execCalls.filter((call) => call.executable === "taskkill").length;
  await missingDuringTermination.terminateTree!(24);
  assert.equal(
    execCalls.filter((call) => call.executable === "taskkill").length,
    killsBeforeMissingProvisional,
  );
  const callsAfterMissingProvisional = execCalls.length;
  assert.equal(await missingDuringTermination.observeTree!(24), false);
  assert.equal(execCalls.length, callsAfterMissingProvisional, "missing provisional ownership is irreversible");

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
  await assert.rejects(ownershipLost.terminateTree!(24), /owner is unavailable/);
  assert.equal(execCalls.length, callsAfterLostAcquisition, "a failed exact acquisition closes that spawn generation");

  const nativeRootSignals: NodeJS.Signals[] = [];
  let nativeKillResult = true;
  nativeChild.kill = (signal) => {
    nativeRootSignals.push(signal);
    return nativeKillResult;
  };
  lowLevelTaskRow = '"codex.exe","901","Console","4","16,000 K"';
  const nativeRequested = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  await runtime.acquireOwnership(901, 23);
  const callsBeforeNativeRequest = execCalls.length;
  await nativeRequested.terminateRoot!(23);
  assert.deepEqual(nativeRootSignals, ["SIGTERM"]);
  assert.equal(await nativeRequested.observeTree!(23), true);
  assert.equal(
    execCalls.length,
    callsBeforeNativeRequest,
    "a requested native termination observes its captured generation without re-reading a reusable pid",
  );
  (listeners["child:exit"] as (code: number | null, signal: NodeJS.Signals | null) => void)(0, "SIGTERM");
  assert.equal(await nativeRequested.observeTree!(23), false, "native exit dominates the requested state");

  lowLevelTaskRow = '"codex.exe","901","Console","4","17,000 K"';
  const refusedNative = runtime.spawn({
    executable: absoluteOverride,
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: { KEEP: "yes" },
  }, { stdout: () => undefined, error: () => undefined, exit: () => undefined });
  await runtime.acquireOwnership(901, 22);
  nativeKillResult = false;
  await assert.rejects(
    refusedNative.terminateRoot!(22),
    (error: unknown) => {
      assert.equal((error as Error).message, "Codex app-server native root termination was not sent");
      return true;
    },
  );
  const callsBeforeRefusedObservation = execCalls.length;
  assert.equal(await refusedNative.observeTree!(22), true);
  assert.equal(execCalls.length, callsBeforeRefusedObservation + 1, "a refused native kill is never latched as requested");

  const spawnFailure = createHarness({ spawnError: new Error("spawn failed") });
  await assert.rejects(spawnFailure.open(spawnFailure.args()), /spawn failed/);
  const nonErrorSpawnFailure = createHarness({ spawnError: "raw spawn detail" });
  await assert.rejects(nonErrorSpawnFailure.open(nonErrorSpawnFailure.args()), (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server spawn failed");
    return true;
  });

  let rawBoundaryEnds = 0;
  const rawBoundary = createHarness();
  await assert.rejects(rawBoundary.open(rawBoundary.args({
    spawn: () => ({
      get pid(): number { throw "raw process boundary detail"; },
      write: () => undefined,
      end: () => { rawBoundaryEnds += 1; },
      terminateTree: async () => undefined,
      observeTree: async () => false,
    }),
  })), (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server operation failed");
    assert.equal((error as Error).message.includes("raw process"), false);
    return true;
  });
  assert.equal(rawBoundaryEnds, 1);
});

test("posix-group-owner-is-observed-probed-and-terminated: uses the exact negative process group for every OS operation", async () => {
  const calls: Array<{ pid: number; signal: NodeJS.Signals | 0 }> = [];
  const nativeRootSignals: NodeJS.Signals[] = [];
  let posixExit: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  const forwardedExits: Array<{ code: number | null; signal: NodeJS.Signals | null }> = [];
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
      kill: (signal) => { nativeRootSignals.push(signal); return true; },
      once: (event, listener) => {
        if (event === "exit") posixExit = listener as typeof posixExit;
      },
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
    exit: (code, signal) => { forwardedExits.push({ code, signal }); },
  });
  await provisional.terminateRoot!(24);
  assert.deepEqual(nativeRootSignals, ["SIGTERM"]);
  posixExit?.(3, "SIGTERM");
  assert.deepEqual(forwardedExits, [{ code: 3, signal: "SIGTERM" }]);
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
  live = false;
  assert.equal(await runtime.acquireOwnership(71, 25), undefined, "ESRCH cannot acquire a POSIX group");
  live = true;
  observationUnavailable = true;
  assert.equal(await runtime.acquireOwnership(71, 25), undefined, "EPERM is unavailable, never acquired");
  observationUnavailable = false;
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

test("posix-group-owner-is-observed-probed-and-terminated: public owner mutation cannot redirect cleanup authority", async () => {
  const acquired = ownerFor("posix", 701, "pgid:701");
  const harness = createHarness({ platform: "posix", pid: 701, candidate: acquired });
  const thread = await harness.open(harness.args());
  const expectedOwner: CodexDetachedOwner = {
    kind: "posix-process-group",
    rootPid: 701,
    token: "pgid:701",
  };

  assert.equal(Object.isFrozen(thread.owner), true);
  assert.equal(Reflect.set(thread.owner, "rootPid", 999), false);
  assert.equal(Reflect.set(thread.owner, "token", "pgid:999"), false);
  assert.deepEqual(thread.owner, expectedOwner);
  assert.deepEqual(await thread.probe(), {
    live: true,
    rateLimits: { primary: null, secondary: null },
  });
  await thread.terminate();
  assert.deepEqual(harness.terminations, [expectedOwner]);
  assert.equal(harness.terminations.some((owner) => owner.rootPid === 999), false);
});

test("windows-tree-owner-is-observed-probed-and-terminated: parses the exact tasklist pid and issues one rooted tree kill", async () => {
  const calls: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  let row = '"codex.exe","123","Console","4","12,000 K"';
  let tasklistError = false;
  let nextSpawnPid: number | undefined;
  const runtime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => ({
      pid: nextSpawnPid,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { once: () => undefined, write: () => undefined, end: () => undefined },
      once: () => undefined,
    }),
    execFile: async (executable, args, options) => {
      calls.push({ executable, args, timeout: options.timeout });
      if (executable === "tasklist" && tasklistError) throw new Error("tasklist unavailable");
      return { stdout: executable === "tasklist" ? `${row}\r\n` : "SUCCESS", stderr: "" };
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    runDefaultAuth: managedTestAuth,
  });
  const spawnGeneration = (pid: number): void => {
    nextSpawnPid = pid;
    runtime.spawn({ executable: "codex.exe", args: [], cwd: "C:\\repo", env: {} }, {
      stdout: () => undefined,
      error: () => undefined,
      exit: () => undefined,
    });
    nextSpawnPid = undefined;
  };
  const acquireSpawned = async (pid: number): Promise<CodexDetachedOwner | undefined> => {
    spawnGeneration(pid);
    return await runtime.acquireOwnership(pid, 55);
  };

  const callsBeforeUnspawned = calls.length;
  assert.equal(await runtime.acquireOwnership(777, 55), undefined);
  assert.equal(calls.length, callsBeforeUnspawned, "an unspawned pid never reaches tasklist or taskkill");
  const owner = expectWindowsOwner(
    await acquireSpawned(123),
    123,
    "codex.exe\u0000123\u0000Console\u00004",
  );
  row = ' \t"co""dex.exe","132","RDP""Tcp#1","42","12,000 K" \t';
  expectWindowsOwner(
    await acquireSpawned(132),
    132,
    'co"dex.exe\u0000132\u0000RDP"Tcp#1\u000042',
  );
  row = '"noise.exe","999","Console","1","1 K"\n"codex.exe","133","Console","12","2 K"';
  expectWindowsOwner(
    await acquireSpawned(133),
    133,
    "codex.exe\u0000133\u0000Console\u000012",
  );
  row = 'prefix"codex.exe","134","Console","4","10 K"';
  assert.equal(await acquireSpawned(134), undefined, "CSV rows are anchored at the start");
  row = '"codex.exe","135","Console","4","10 K"suffix';
  assert.equal(await acquireSpawned(135), undefined, "CSV rows are anchored at the end");
  row = '"codex.exe","123","Console","4","99,000 K"';
  assert.deepEqual(await runtime.observeOwnership(owner, 55), { status: "live", owner });
  assert.deepEqual(
    await runtime.acquireOwnership(123, 55),
    owner,
    "reacquiring the same descriptor returns the exact generation owner",
  );
  const callsBeforeForgedOwners = calls.length;
  const wrongHostOwner: CodexDetachedOwner = { ...owner, kind: "posix-process-group" };
  assert.deepEqual(await runtime.observeOwnership(wrongHostOwner, 55), { status: "unavailable" });
  await assert.rejects(runtime.terminateOwnedTree(wrongHostOwner, 55), /kind does not match/);
  const forgedPidOwner: CodexDetachedOwner = { ...owner, rootPid: 321 };
  assert.deepEqual(await runtime.observeOwnership(forgedPidOwner, 55), { status: "unavailable" });
  await assert.rejects(runtime.terminateOwnedTree(forgedPidOwner, 55), /Windows owner is unavailable/);
  assert.equal(calls.length, callsBeforeForgedOwners, "forged host and root fields never reach tasklist or taskkill");

  row = '"codex.exe","136","Console","4","10 K"';
  const reacquiredOwner = await acquireSpawned(136);
  assert.ok(reacquiredOwner !== undefined);
  assert.deepEqual(await runtime.acquireOwnership(136, 55), reacquiredOwner);
  row = '"other.exe","136","Console","4","10 K"';
  assert.equal(await runtime.acquireOwnership(136, 55), undefined, "a changed descriptor closes reacquisition");
  const callsBeforeClosedReacquisition = calls.length;
  assert.equal(await runtime.acquireOwnership(136, 55), undefined);
  assert.equal(calls.length, callsBeforeClosedReacquisition, "closed reacquisition never re-inspects a reused pid");

  row = '"codex.exe","9123","Console","4","10 K"';
  assert.equal(await acquireSpawned(124), undefined, "substring pids are never accepted");
  row = '"codex.exe","125","Console","4","10 K"\r\n"codex.exe","125","Console","4","11 K"';
  assert.equal(await acquireSpawned(125), undefined, "duplicate exact roots are ambiguous");
  row = "INFO: No tasks are running which match the specified criteria.";
  assert.equal(await acquireSpawned(126), undefined, "tasklist exit zero without a row is dead");
  tasklistError = true;
  assert.deepEqual(await runtime.observeOwnership(owner, 55), { status: "unavailable" });
  tasklistError = false;

  row = '"codex.exe","123","Console","4","12,000 K"';
  await runtime.terminateOwnedTree(owner, 55);
  assert.deepEqual(calls.at(-1), {
    executable: "taskkill",
    args: ["/PID", "123", "/T", "/F"],
    timeout: 55,
  });

  row = '"codex.exe","127","Console","4","12,000 K"';
  const missingOwner = await acquireSpawned(127);
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
  const changedTerminationOwner = await acquireSpawned(128);
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
  const changedObservationOwner = await acquireSpawned(129);
  assert.ok(changedObservationOwner !== undefined);
  row = '"other.exe","129","Console","4","10 K"';
  assert.deepEqual(
    await runtime.observeOwnership(changedObservationOwner, 55),
    { status: "dead" },
    "a descriptor mismatch is dead for the requested owner, never a different live owner",
  );
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
  const disappearingOwner = await acquireSpawned(131);
  assert.ok(disappearingOwner !== undefined);
  row = "INFO: No tasks are running which match the specified criteria.";
  assert.deepEqual(await runtime.observeOwnership(disappearingOwner, 55), { status: "dead" });
  row = '"codex.exe","131","Console","4","12,000 K"';
  const callsBeforeDisappearanceReuse = calls.length;
  assert.deepEqual(await runtime.observeOwnership(disappearingOwner, 55), { status: "dead" });
  assert.equal(calls.length, callsBeforeDisappearanceReuse, "a disappeared owner cannot reopen on pid reuse");
});

test("windows-tree-owner-is-observed-probed-and-terminated: same-pid generations never share closure or kill authority", async () => {
  type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;
  const exitListeners: ExitListener[] = [];
  const calls: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  const runtime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => ({
      pid: 606,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { once: () => undefined, write: () => undefined, end: () => undefined },
      once: (event, listener) => {
        if (event === "exit") exitListeners.push(listener as ExitListener);
      },
    }),
    execFile: async (executable, args, options) => {
      calls.push({ executable, args, timeout: options.timeout });
      return {
        stdout: executable === "tasklist"
          ? '"codex.exe","606","Console","8","10,000 K"\r\n'
          : "SUCCESS",
        stderr: "",
      };
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    runDefaultAuth: managedTestAuth,
  });
  const command: CodexAppServerCommand = {
    executable: "codex.exe",
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: {},
  };
  const events: CodexAppServerProcessEvents = {
    stdout: () => undefined,
    error: () => undefined,
    exit: () => undefined,
  };

  const first = runtime.spawn(command, events);
  const firstOwner = expectWindowsOwner(
    await runtime.acquireOwnership(606, 41),
    606,
    "codex.exe\u0000606\u0000Console\u00008",
  );
  const firstExit = exitListeners[0]!;
  const second = runtime.spawn(command, events);
  const secondOwner = expectWindowsOwner(
    await runtime.acquireOwnership(606, 42),
    606,
    "codex.exe\u0000606\u0000Console\u00008",
  );
  assert.notEqual(firstOwner.token, secondOwner.token, "same descriptor and pid still get distinct generations");

  const callsBeforeStaleHandles = calls.length;
  assert.equal(await first.observeTree!(43), false);
  await first.terminateTree!(43);
  assert.deepEqual(await runtime.observeOwnership({ ...firstOwner }, 43), { status: "dead" });
  await runtime.terminateOwnedTree({ ...firstOwner }, 43);
  assert.equal(calls.length, callsBeforeStaleHandles, "stale handles never inspect or kill the reused pid");
  assert.equal(calls.some((call) => call.executable === "taskkill"), false);

  assert.equal(await second.observeTree!(44), true);
  assert.deepEqual(
    await runtime.observeOwnership({ ...secondOwner }, 44),
    { status: "live", owner: secondOwner },
  );
  firstExit(0, null);
  assert.equal(await second.observeTree!(45), true, "a late old-generation exit cannot poison the new child");
  assert.deepEqual(
    await runtime.observeOwnership({ ...secondOwner }, 45),
    { status: "live", owner: secondOwner },
  );
  assert.deepEqual(
    await runtime.acquireOwnership(606, 45),
    secondOwner,
    "a late old-generation exit cannot erase the replacement's acquisition identity",
  );

  await runtime.terminateOwnedTree({ ...secondOwner }, 46);
  assert.deepEqual(calls.filter((call) => call.executable === "taskkill"), [{
    executable: "taskkill",
    args: ["/PID", "606", "/T", "/F"],
    timeout: 46,
  }]);
  exitListeners[1]!(0, "SIGTERM");
  const callsBeforeClosedProbe = calls.length;
  assert.deepEqual(await runtime.observeOwnership({ ...secondOwner }, 47), { status: "dead" });
  assert.equal(calls.length, callsBeforeClosedProbe);
});

test("windows-tree-owner-is-observed-probed-and-terminated: in-flight inspection cannot reopen or kill a closed generation", async () => {
  type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;
  type ExecResult = { readonly stdout: string; readonly stderr: string };
  const exitListeners: ExitListener[] = [];
  const calls: string[] = [];
  let deferTasklist = false;
  let resolveTasklist: ((result: ExecResult) => void) | undefined;
  const descriptorRow = '"codex.exe","808","Console","6","10,000 K"\r\n';
  const runtime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => ({
      pid: 808,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { once: () => undefined, write: () => undefined, end: () => undefined },
      once: (event, listener) => {
        if (event === "exit") exitListeners.push(listener as ExitListener);
      },
    }),
    execFile: async (executable) => {
      calls.push(executable);
      if (executable === "taskkill") return { stdout: "SUCCESS", stderr: "" };
      if (!deferTasklist) return { stdout: descriptorRow, stderr: "" };
      return await new Promise<ExecResult>((resolve) => { resolveTasklist = resolve; });
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    runDefaultAuth: managedTestAuth,
  });
  const command: CodexAppServerCommand = {
    executable: "codex.exe",
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: {},
  };
  const events: CodexAppServerProcessEvents = {
    stdout: () => undefined,
    error: () => undefined,
    exit: () => undefined,
  };

  runtime.spawn(command, events);
  deferTasklist = true;
  const staleAcquisition = runtime.acquireOwnership(808, 61);
  await flush();
  runtime.spawn(command, events);
  resolveTasklist?.({ stdout: descriptorRow, stderr: "" });
  assert.equal(await staleAcquisition, undefined, "a superseded acquisition cannot attach to the replacement pid");

  deferTasklist = false;
  const secondOwner = expectWindowsOwner(
    await runtime.acquireOwnership(808, 62),
    808,
    "codex.exe\u0000808\u0000Console\u00006",
  );
  deferTasklist = true;
  const racedObservation = runtime.observeOwnership(secondOwner, 63);
  await flush();
  exitListeners[1]!(0, null);
  resolveTasklist?.({ stdout: descriptorRow, stderr: "" });
  assert.deepEqual(await racedObservation, { status: "dead" });

  deferTasklist = false;
  runtime.spawn(command, events);
  const thirdOwner = expectWindowsOwner(
    await runtime.acquireOwnership(808, 64),
    808,
    "codex.exe\u0000808\u0000Console\u00006",
  );
  deferTasklist = true;
  const racedTermination = runtime.terminateOwnedTree(thirdOwner, 65);
  await flush();
  exitListeners[2]!(0, null);
  resolveTasklist?.({ stdout: descriptorRow, stderr: "" });
  await racedTermination;
  assert.equal(calls.includes("taskkill"), false, "an exited generation cannot be killed after inspection resolves");

  deferTasklist = false;
  const fourth = runtime.spawn(command, events);
  expectWindowsOwner(
    await runtime.acquireOwnership(808, 66),
    808,
    "codex.exe\u0000808\u0000Console\u00006",
  );
  deferTasklist = true;
  const racedProvisionalObservation = fourth.observeTree!(67);
  await flush();
  exitListeners[3]!(0, null);
  resolveTasklist?.({ stdout: descriptorRow, stderr: "" });
  assert.equal(await racedProvisionalObservation, false, "a closed spawned generation cannot reopen after inspection");

  deferTasklist = false;
  const fifth = runtime.spawn(command, events);
  expectWindowsOwner(
    await runtime.acquireOwnership(808, 68),
    808,
    "codex.exe\u0000808\u0000Console\u00006",
  );
  deferTasklist = true;
  const racedProvisionalTermination = fifth.terminateTree!(69);
  await flush();
  exitListeners[4]!(0, null);
  resolveTasklist?.({ stdout: descriptorRow, stderr: "" });
  await racedProvisionalTermination;
  assert.equal(calls.includes("taskkill"), false, "a closed spawned generation cannot be killed after inspection");
});

test("windows-tree-owner-is-observed-probed-and-terminated: opaque owners never cross runtime instances", async () => {
  const createRuntime = (
    calls: Array<{ executable: string; args: readonly string[]; timeout: number }>,
  ): CodexDetachedRuntime => createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => ({
      pid: 707,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: { once: () => undefined, write: () => undefined, end: () => undefined },
      once: () => undefined,
    }),
    execFile: async (executable, args, options) => {
      calls.push({ executable, args, timeout: options.timeout });
      return {
        stdout: executable === "tasklist"
          ? '"codex.exe","707","Console","3","10,000 K"\r\n'
          : "SUCCESS",
        stderr: "",
      };
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    runDefaultAuth: managedTestAuth,
  });
  const callsA: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  const callsB: Array<{ executable: string; args: readonly string[]; timeout: number }> = [];
  const runtimeA = createRuntime(callsA);
  const runtimeB = createRuntime(callsB);
  const command: CodexAppServerCommand = {
    executable: "codex.exe",
    args: ["app-server", "--stdio"],
    cwd: "C:\\repo",
    env: {},
  };
  const events: CodexAppServerProcessEvents = {
    stdout: () => undefined,
    error: () => undefined,
    exit: () => undefined,
  };
  runtimeA.spawn(command, events);
  runtimeB.spawn(command, events);
  const ownerA = expectWindowsOwner(
    await runtimeA.acquireOwnership(707, 51),
    707,
    "codex.exe\u0000707\u0000Console\u00003",
  );
  const ownerB = expectWindowsOwner(
    await runtimeB.acquireOwnership(707, 52),
    707,
    "codex.exe\u0000707\u0000Console\u00003",
  );
  assert.notEqual(ownerA.token, ownerB.token);

  const callsBeforeForeignOwner = callsB.length;
  assert.deepEqual(
    await runtimeB.observeOwnership({ ...ownerA }, 53),
    { status: "unavailable" },
  );
  await assert.rejects(
    runtimeB.terminateOwnedTree({ ...ownerA }, 53),
    /Windows owner is unavailable/,
  );
  assert.equal(callsB.length, callsBeforeForeignOwner, "a foreign token never reaches tasklist or taskkill");
  assert.equal(callsB.some((call) => call.executable === "taskkill"), false);
  assert.deepEqual(
    await runtimeB.observeOwnership({ ...ownerB }, 54),
    { status: "live", owner: ownerB },
  );
});

test("pinned-command-scrubs-env-and-spawns-detached: production runtime reaps a real detached child", async () => {
  const platform = process.platform === "win32" ? "windows" as const : "posix" as const;
  const runtime = codexDetachedProductionRuntime;
  assert.equal(runtime.platform, platform);
  const pinnedEntrypoint = runtime.resolvePinnedEntrypoint();
  assert.equal(path.isAbsolute(pinnedEntrypoint), true);
  assert.equal(path.basename(pinnedEntrypoint), "codex.js");
  assert.equal(path.basename(path.dirname(pinnedEntrypoint)), "bin");
  assert.equal(path.basename(path.dirname(path.dirname(pinnedEntrypoint))), "codex");
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
    let exactTerminationSent = false;
    let nativeFallbackNeeded = false;
    if (owner !== undefined) {
      let observation: CodexDetachedOwnerObservation | undefined;
      try { observation = await runtime.observeOwnership(owner, 500); }
      catch { nativeFallbackNeeded = true; }
      if (observation?.status === "live" && sameTestOwner(owner, observation.owner)) {
        try {
          await runtime.terminateOwnedTree(owner, 500);
          exactTerminationSent = true;
        } catch {
          nativeFallbackNeeded = true;
        }
      } else if (observation?.status === "unavailable") {
        nativeFallbackNeeded = true;
      }
    } else {
      let provisionalLive: boolean | undefined;
      try { provisionalLive = await child.observeTree!(500); }
      catch { provisionalLive = undefined; }
      if (provisionalLive === true) {
        try {
          await child.terminateTree!(500);
          exactTerminationSent = true;
        } catch {
          nativeFallbackNeeded = true;
        }
      } else if (provisionalLive === undefined) {
        nativeFallbackNeeded = true;
      }
    }
    if (nativeFallbackNeeded) await child.terminateRoot!(500);

    const cleanupDeadline = Date.now() + 3_000;
    let live: boolean | undefined;
    try { live = await child.observeTree!(500); }
    catch { live = undefined; }
    if (live === undefined && exactTerminationSent && !nativeFallbackNeeded) {
      await child.terminateRoot!(500);
      nativeFallbackNeeded = true;
      live = await child.observeTree!(500);
    }
    while (live === true && Date.now() < cleanupDeadline) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
      live = await child.observeTree!(500);
    }
    assert.equal(
      live,
      false,
      "the captured production ownership seam confirms the stand-in generation dead",
    );
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

  type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;
  let nativeExit: ExitListener | undefined;
  let nativeEnds = 0;
  const nativeSignals: NodeJS.Signals[] = [];
  const nativeExecs: string[] = [];
  const nativeRuntime = createCodexDetachedRuntime({
    platform: "windows",
    nativeSpawn: () => ({
      pid: 733,
      stdout: { on: () => undefined },
      stderr: { on: () => undefined },
      stdin: {
        once: () => undefined,
        write: () => undefined,
        end: () => { nativeEnds += 1; },
      },
      kill: (signal) => {
        nativeSignals.push(signal);
        nativeExit?.(0, signal);
        return true;
      },
      once: (event, listener) => {
        if (event === "exit") nativeExit = listener as ExitListener;
      },
    }),
    execFile: async (executable) => {
      nativeExecs.push(executable);
      if (executable === "taskkill") throw new Error("an unowned numeric tree must not be killed");
      return {
        stdout: "INFO: No tasks are running which match the specified criteria.",
        stderr: "",
      };
    },
    signal: () => { throw new Error("Windows must not signal a POSIX group"); },
    resolvePinnedEntrypoint: () => path.resolve("node_modules", "@openai", "codex", "bin", "codex.js"),
    runDefaultAuth: managedTestAuth,
  });
  const openNative = createOpenPinnedCodexDetachedThread(nativeRuntime);
  await assert.rejects(openNative({
    cwd: process.cwd(),
    env: {},
    model: "model",
    reasoningEffort: "high",
    timeoutMs: 100,
    authRunner: managedTestAuth,
  }), /exact Codex process ownership was not acquired/);
  assert.deepEqual(nativeExecs, ["tasklist"]);
  assert.deepEqual(nativeSignals, ["SIGTERM"]);
  assert.equal(nativeEnds, 1);
});

test("ownership-acquisition-failure-reaps-spawned-child: provisional cleanup is bounded and uses the normalized timeout", async () => {
  const missingTerminator = createHarness({
    candidate: undefined,
    omitProvisionalTerminate: true,
  });
  await assert.rejects(
    missingTerminator.open(missingTerminator.args({ timeoutMs: 15 })),
    /cleanup failed.*provisional Codex process cleanup is unavailable/,
  );
  assert.equal(missingTerminator.provisionalTerminations, 0);

  const missingObserver = createHarness({
    candidate: undefined,
    omitProvisionalObserve: true,
  });
  await assert.rejects(
    missingObserver.open(missingObserver.args({ timeoutMs: 16 })),
    /cleanup failed.*death observation was unavailable/,
  );
  assert.equal(missingObserver.provisionalTerminations, 1);

  const provisionalGetter = createHarness({
    candidate: undefined,
    includeNativeRoot: true,
    provisionalTerminateGetterFailure: "raw provisional getter detail",
  });
  await assert.rejects(
    provisionalGetter.open(provisionalGetter.args({ timeoutMs: 16 })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "exact Codex process ownership was not acquired");
      assert.equal(error.message.includes("raw provisional getter"), false);
      return true;
    },
  );
  assert.equal(provisionalGetter.ended, 1, "a throwing provisional getter cannot skip I/O close");
  assert.equal(provisionalGetter.provisionalTerminations, 0);
  assert.equal(provisionalGetter.nativeRootTerminations, 1, "native fallback still reaps the child");
  assert.equal(provisionalGetter.live, false);

  const unavailableProvisionalGetter = createHarness({
    candidate: undefined,
    provisionalTerminateGetterFailure: "raw provisional getter detail",
    provisionalObserve: async () => false,
  });
  await assert.rejects(
    unavailableProvisionalGetter.open(unavailableProvisionalGetter.args({ timeoutMs: 16 })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "Codex app-server cleanup failed: Codex provisional termination failed",
      );
      assert.equal(error.message.includes("raw provisional getter"), false);
      return true;
    },
  );
  assert.equal(unavailableProvisionalGetter.provisionalTerminations, 0);
  assert.equal(unavailableProvisionalGetter.nativeRootTerminations, 0);

  const successfulProvisional = createHarness({
    candidate: undefined,
    includeNativeRoot: true,
    provisionalObserve: async () => false,
  });
  await assert.rejects(
    successfulProvisional.open(successfulProvisional.args({ timeoutMs: 16 })),
    /exact Codex process ownership was not acquired/,
  );
  assert.equal(successfulProvisional.provisionalTerminations, 1);
  assert.equal(
    successfulProvisional.nativeRootTerminations,
    0,
    "successful provisional cleanup never widens to the native root fallback",
  );

  const nonErrorTerminator = createHarness({
    candidate: undefined,
    provisionalTerminate: async () => { throw "raw provisional detail"; },
    provisionalObserve: async () => false,
  });
  await assert.rejects(nonErrorTerminator.open(nonErrorTerminator.args({ timeoutMs: 16 })), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex provisional termination failed",
    );
    return true;
  });

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
  await waitUntil(
    () => terminatorHang.provisionalTerminations === 1,
    "provisional termination",
    terminatorHang.drain,
  );
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
  await waitUntil(
    () => observerHang.provisionalObservationTimeouts.length === 1,
    "provisional observation",
    observerHang.drain,
  );
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
  const requestIds = valid.writes
    .filter((message) => message.id !== undefined)
    .map((message) => message.id!);
  assert.equal(requestIds.length, 2);
  assert.equal(requestIds.every(Number.isSafeInteger), true);
  assert.notEqual(requestIds[0], requestIds[1]);
  assert.deepEqual(valid.writes[0], {
    id: requestIds[0],
    method: "initialize",
    params: { clientInfo: { name: "storytree", version: "0.0.0" } },
  });
  assert.deepEqual(valid.writes[1], { method: "initialized", params: {} });
  assert.deepEqual(valid.writes.at(-1), {
    id: requestIds[1],
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
    const identity: Record<string, unknown> = {};
    identity.id = "thread";
    if (invalid === undefined) delete identity.id; else identity.id = invalid;
    invalidThreads.push({ thread: identity, model: "model", reasoningEffort: "effort" });
  }
  for (const field of ["model", "reasoningEffort"] as const) {
    for (const invalid of [undefined, null, 0, "", " \t "]) {
      const result: Record<string, unknown> = {};
      result.thread = { id: "thread" };
      result.model = "model";
      result.reasoningEffort = "effort";
      if (invalid === undefined) delete result[field]; else result[field] = invalid;
      invalidThreads.push(result);
    }
  }
  for (const invalid of invalidThreads) await rejectsInvalidOpenResult({ initialize: {}, thread: invalid });
});

test("jsonl-fragments-and-correlates-responses: streams UTF-8, accepts notifications, and resolves concurrent replies by id", async () => {
  const harness = createHarness({ responder: () => undefined });
  const opening = harness.open(harness.args());
  const initialize = await waitForMethod(harness.writes, "initialize", harness.drain);
  assert.equal(initialize.id, 1);
  const encoded = new TextEncoder().encode(`${JSON.stringify({ id: initialize.id, result: { serverInfo: { name: "Codex ☃" } } })}\n`);
  const snowman = [...encoded].findIndex((value, index, all) => value === 0xe2 && all[index + 1] === 0x98);
  harness.emitRaw(encoded.slice(0, snowman + 1));
  harness.emitRaw(encoded.slice(snowman + 1));
  await flush();
  assert.equal(harness.writes.at(-1)?.method, "thread/start");
  const threadStart = harness.writes.at(-1)!;
  assert.equal(threadStart.id, 2);
  harness.emitRaw(` \t\r\n${JSON.stringify({ method: "thread/started", params: { id: "notice" } })}\n`);
  const identityFrame = new TextEncoder().encode(`${JSON.stringify({
    id: threadStart.id,
    result: { thread: { id: "streamed-☃-thread" }, model: "streamed-model", reasoningEffort: "high" },
  })}\n`);
  const identitySnowman = [...identityFrame].findIndex((value, index, all) => value === 0xe2 && all[index + 1] === 0x98);
  harness.emitRaw(identityFrame.slice(0, identitySnowman + 1));
  harness.emitRaw(identityFrame.slice(identitySnowman + 1));
  const thread = await opening;
  assert.equal(thread.threadId, "streamed-☃-thread");

  const turnPromise = thread.startTurn("exact prompt");
  const probePromise = thread.probe();
  const turnRequest = await waitForMethod(harness.writes, "turn/start", harness.drain);
  const limitsRequest = await waitForMethod(
    harness.writes,
    "account/rateLimits/read",
    harness.drain,
  );
  assert.equal(turnRequest.id, 3);
  assert.equal(limitsRequest.id, 4);
  assert.deepEqual(limitsRequest, {
    id: limitsRequest.id,
    method: "account/rateLimits/read",
    params: null,
  });
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
  const frameRows: Array<{ readonly frame: (id: number) => string; readonly message: string }> = [
    { frame: () => "{not-json}\n", message: "Codex app-server emitted malformed JSONL" },
    { frame: () => "null\n", message: "Codex app-server emitted a non-object JSONL message" },
    { frame: () => `${JSON.stringify({ value: "no id or method" })}\n`, message: "Codex app-server emitted malformed JSONL" },
    { frame: () => `${JSON.stringify({ method: "notice", result: {} })}\n`, message: "Codex app-server emitted malformed JSONL" },
    { frame: () => `${JSON.stringify({ method: "notice", error: {} })}\n`, message: "Codex app-server emitted malformed JSONL" },
    { frame: () => `${JSON.stringify({ id: "1", result: {} })}\n`, message: "Codex app-server emitted an invalid response id" },
    { frame: () => `${JSON.stringify({ id: Number.MAX_SAFE_INTEGER + 1, result: {} })}\n`, message: "Codex app-server emitted an invalid response id" },
    { frame: () => `${JSON.stringify({ id: 999, result: {} })}\n`, message: "Codex app-server emitted an unknown response id" },
    { frame: (id) => `${JSON.stringify({ id })}\n`, message: "Codex app-server emitted a malformed response" },
    { frame: (id) => `${JSON.stringify({ id, result: {}, error: { code: -1 } })}\n`, message: "Codex app-server emitted a malformed response" },
    { frame: (id) => `${JSON.stringify({ id, error: { code: -1, message: "raw secret must not escape" } })}\n`, message: "Codex app-server RPC error" },
  ];
  for (const row of frameRows) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    harness.setResponder(() => undefined);
    const pending = thread.startTurn("fault me");
    await flush();
    const id = harness.writes.at(-1)!.id!;
    harness.emitRaw(row.frame(id));
    await assert.rejects(pending, (error: unknown) => {
      assert.equal((error as Error).message, row.message);
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
  await waitForMethod(concurrent.writes, "account/rateLimits/read", concurrent.drain);
  concurrent.emitRaw("{broken}\n");
  const settled = await Promise.allSettled([pendingTurn, pendingProbe]);
  assert.deepEqual(settled.map((result) => result.status), ["rejected", "rejected"]);
  assert.deepEqual(
    settled.map((result) => (result as PromiseRejectedResult).reason.message),
    [
      "Codex app-server emitted malformed JSONL",
      "Codex app-server emitted malformed JSONL",
    ],
  );
  assert.equal(concurrent.terminations.length, 1);

  const requestWrite = createHarness();
  const requestThread = await requestWrite.open(requestWrite.args());
  requestWrite.setResponder((message) => {
    if (message.method === "turn/start") throw new Error("request write broke");
  });
  await assert.rejects(requestThread.startTurn("write"), /request write failed/);
  assert.equal(requestWrite.terminations.length, 1);
  assert.equal(requestWrite.clock.pendingTimerCount, 0, "a failed write clears its request timer");

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
  const copiedBeforeSpawn = createHarness({
    beforeSpawnReturn: (events) => {
      const chunk = new TextEncoder().encode('{"method":"server/ready","params":{}}\n');
      events.stdout(chunk);
      chunk.fill("x".charCodeAt(0));
    },
  });
  const copiedBeforeSpawnThread = await copiedBeforeSpawn.open(copiedBeforeSpawn.args());
  await copiedBeforeSpawnThread.terminate();

  const beforeSpawn = createHarness({
    beforeSpawnReturn: (events) => { events.stdout("{malformed before spawn returned}\n"); },
  });
  await assert.rejects(beforeSpawn.open(beforeSpawn.args()), /malformed JSONL/);
  assert.equal(beforeSpawn.provisionalTerminations, 1);
  assert.equal(beforeSpawn.ended, 1);

  for (const event of ["error", "exit"] as const) {
    const beforeSpawnFault = createHarness({
      beforeSpawnReturn: (events) => {
        if (event === "error") events.error(new Error("pre-spawn process error"));
        else events.exit(9, null);
      },
    });
    await assert.rejects(
      beforeSpawnFault.open(beforeSpawnFault.args()),
      event === "error" ? /process error/ : /exited early/,
    );
    assert.equal(beforeSpawnFault.provisionalTerminations, 1);
  }

  const windowsPreOwnershipExit = createHarness({
    platform: "windows",
    includeNativeRoot: true,
    beforeSpawnReturn: (events) => { events.exit(0, null); },
  });
  await assert.rejects(windowsPreOwnershipExit.open(windowsPreOwnershipExit.args()), /exited early/);
  assert.equal(windowsPreOwnershipExit.provisionalTerminations, 0);
  assert.equal(windowsPreOwnershipExit.nativeRootTerminations, 0);

  const callbackThenSpawnFailure = createHarness();
  await assert.rejects(
    callbackThenSpawnFailure.open(callbackThenSpawnFailure.args({
      spawn: (_command, events) => {
        events.error(new Error("synchronous callback before throw"));
        throw "raw spawn failure";
      },
    })),
    (error: unknown) => {
      assert.equal((error as Error).message, "Codex app-server spawn failed");
      return true;
    },
  );

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

  const windowsProcessError = createHarness({ platform: "windows" });
  const windowsProcessErrorThread = await windowsProcessError.open(windowsProcessError.args());
  windowsProcessError.setResponder(() => undefined);
  const windowsErrorPending = windowsProcessErrorThread.startTurn("error is not exit");
  await waitForMethod(windowsProcessError.writes, "turn/start", windowsProcessError.drain);
  windowsProcessError.events.error(new Error("Windows pipe error"));
  await assert.rejects(windowsErrorPending, /process error/);
  assert.deepEqual(windowsProcessError.terminations, [windowsProcessError.candidate]);

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
  await waitForMethod(delayedCleanup.writes, "turn/start", delayedCleanup.drain);
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
  await waitForMethod(reentrant.writes, "turn/start", reentrant.drain);
  reentrant.events.error(new Error("initial process fault"));
  await assert.rejects(reentrantPending, /process error/);
  assert.equal(reentrant.ended, 1);
  assert.equal(reentrant.terminations.length, 1);

  const cleanupFailure = createHarness({
    terminate: async () => { throw new Error("secret cleanup diagnostic"); },
  });
  const cleanupFailureThread = await cleanupFailure.open(cleanupFailure.args());
  cleanupFailure.setResponder(() => undefined);
  const pendingDuringCleanupFailure = [
    cleanupFailureThread.startTurn("pending cleanup failure"),
    cleanupFailureThread.probe(),
  ];
  await waitForMethod(
    cleanupFailure.writes,
    "account/rateLimits/read",
    cleanupFailure.drain,
  );
  cleanupFailure.events.error(new Error("first spontaneous fault"));
  const cleanupFailureResults = await Promise.allSettled(pendingDuringCleanupFailure);
  for (const result of cleanupFailureResults) {
    assert.equal(result.status, "rejected");
    assert.equal(
      (result as PromiseRejectedResult).reason.message,
      "Codex app-server cleanup failed: Codex owner termination failed",
    );
  }
  await assert.rejects(
    cleanupFailureThread.probe(),
    /cleanup failed: Codex owner termination failed/,
  );
  assert.equal(cleanupFailure.terminations.length, 1);

  const cleanupBeforeThrow = createHarness({
    terminate: async () => { throw "non-error cleanup rejection"; },
  });
  const cleanupBeforeThrowThread = await cleanupBeforeThrow.open(cleanupBeforeThrow.args());
  await assert.rejects(
    cleanupBeforeThrowThread.startTurn(" \t "),
    /cleanup failed: Codex owner termination failed/,
  );

  const simultaneousTimeouts = createHarness();
  const timeoutThread = await simultaneousTimeouts.open(simultaneousTimeouts.args({ timeoutMs: 23 }));
  simultaneousTimeouts.setResponder(() => undefined);
  const firstTimeout = timeoutThread.startTurn("first timer owns the fault");
  await waitForMethod(simultaneousTimeouts.writes, "turn/start", simultaneousTimeouts.drain);
  const secondTimeout = timeoutThread.probe();
  await waitForMethod(
    simultaneousTimeouts.writes,
    "account/rateLimits/read",
    simultaneousTimeouts.drain,
  );
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
      authRunner: async (command) => {
        seen.push(command.timeoutMs);
        return { code: 1, stdout: "", stderr: "" };
      },
    });
    if (timeoutMs === undefined) Reflect.deleteProperty(callArgs, "timeoutMs");
    else Object.assign(callArgs, { timeoutMs });
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
  })), /not authenticated/);
  assert.deepEqual(explicitSeen, [17]);

  const initialize = createHarness({ responder: () => undefined });
  const initializePending = initialize.open(initialize.args({ timeoutMs: 12 }));
  await waitForMethod(initialize.writes, "initialize", initialize.drain);
  initialize.clock.advance(12);
  await assert.rejects(initializePending, /initialize timed out/);
  assert.equal(initialize.terminations.length, 1);

  const threadStart = createHarness({
    responder: (message, events) => {
      if (message.method === "initialize") events.stdout(`${JSON.stringify({ id: message.id, result: {} })}\n`);
    },
  });
  const threadPending = threadStart.open(threadStart.args({ timeoutMs: 13 }));
  await waitForMethod(threadStart.writes, "thread/start", threadStart.drain);
  threadStart.clock.advance(13);
  await assert.rejects(threadPending, /thread\/start timed out/);
  assert.equal(threadStart.terminations.length, 1);

  const turn = createHarness();
  const turnThread = await turn.open(turn.args({ timeoutMs: 14 }));
  turn.setResponder(() => undefined);
  const turnPending = turnThread.startTurn("bounded turn");
  await waitForMethod(turn.writes, "turn/start", turn.drain);
  turn.clock.advance(14);
  await assert.rejects(turnPending, /turn\/start timed out/);
  assert.equal(turn.terminations.length, 1);

  const limits = createHarness();
  const limitsThread = await limits.open(limits.args({ timeoutMs: 16 }));
  limits.setResponder(() => undefined);
  const limitsPending = limitsThread.probe();
  await waitForMethod(limits.writes, "account/rateLimits/read", limits.drain);
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
  assert.equal(
    successfulTimers.clock.pendingTimerCount,
    0,
    "successful requests clear every timer before it can expire",
  );
  successfulTimers.clock.advance(111);
  await flush();
  assert.equal(successfulTimers.terminations.length, 0, "successful requests release every armed timer");
  assert.deepEqual(await successfulThread.startTurn("still healthy"), {
    turnId: "response-turn",
    status: "inProgress",
  });
  await successfulThread.terminate();
  assert.equal(successfulTimers.clock.pendingTimerCount, 0);
  assert.equal(
    new Set(successfulTimers.clock.clearedTimerHandles).size,
    successfulTimers.clock.clearedTimerHandles.length,
    "settled requests are removed before terminal cleanup and every timer is cleared once",
  );

  const timerRegistration = createHarness();
  const timerRegistrationThread = await timerRegistration.open(timerRegistration.args());
  const setTimeoutNormally = timerRegistration.clock.setTimeout.bind(timerRegistration.clock);
  const clearTimeoutNormally = timerRegistration.clock.clearTimeout.bind(timerRegistration.clock);
  const clearedHandles: unknown[] = [];
  timerRegistration.clock.setTimeout = () => {
    timerRegistration.clock.setTimeout = setTimeoutNormally;
    throw "raw timer registration detail";
  };
  timerRegistration.clock.clearTimeout = (handle) => {
    clearedHandles.push(handle);
    clearTimeoutNormally(handle);
  };
  await assert.rejects(timerRegistrationThread.startTurn("timer registration"), (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server request timer failed");
    assert.equal((error as Error).message.includes("raw timer"), false);
    return true;
  });
  assert.equal(clearedHandles.includes(undefined), false, "a failed registration never clears a nonexistent handle");

  const timerCleanup = createHarness();
  const timerCleanupThread = await timerCleanup.open(timerCleanup.args());
  const clearAfterFailure = timerCleanup.clock.clearTimeout.bind(timerCleanup.clock);
  timerCleanup.clock.clearTimeout = (handle) => {
    timerCleanup.clock.clearTimeout = clearAfterFailure;
    throw "raw timer cleanup detail";
  };
  await assert.rejects(timerCleanupThread.startTurn("timer cleanup"), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex app-server request timer cleanup failed",
    );
    assert.equal((error as Error).message.includes("raw timer"), false);
    return true;
  });
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

  for (const malformedPrompt of [null, undefined, 17, {}, []] as const) {
    const harness = createHarness();
    const thread = await harness.open(harness.args());
    await assert.rejects(
      thread.startTurn(malformedPrompt as string),
      /prompt must not be blank/,
    );
    assert.equal(harness.writes.at(-1)?.method, "thread/start");
    assert.equal(
      harness.terminations.length,
      1,
      "a malformed runtime prompt must close the staged controller rather than leak it",
    );
    await assert.rejects(thread.probe(), /prompt must not be blank/);
  }

  const invalidTurns: unknown[] = [null, [], "invalid", {}, { turn: null }, { turn: [] }, { turn: {} }];
  for (const field of ["id", "status"] as const) {
    for (const invalid of [undefined, null, 0, "", " \t ", ...(field === "status" ? ["accepted", "unknown"] : [])]) {
      const identity: Record<string, unknown> = {};
      identity.id = "turn";
      identity.status = "inProgress";
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
  await waitUntil(
    () => raceLivenessCalls === 1,
    "raced liveness observation",
    racedFault.drain,
  );
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
  const pendingTermination = createHarness();
  const pendingTerminationThread = await pendingTermination.open(pendingTermination.args());
  pendingTermination.setResponder(() => undefined);
  const terminatedRequest = pendingTerminationThread.startTurn("pending at termination");
  await waitForMethod(
    pendingTermination.writes,
    "turn/start",
    pendingTermination.drain,
  );
  await pendingTerminationThread.terminate();
  await assert.rejects(terminatedRequest, (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server terminated");
    return true;
  });

  let releaseClosingTermination: (() => void) | undefined;
  const stdoutDuringClosing = createHarness({
    terminate: async () => await new Promise<void>((resolve) => { releaseClosingTermination = resolve; }),
  });
  const stdoutDuringClosingThread = await stdoutDuringClosing.open(stdoutDuringClosing.args());
  const closingTermination = stdoutDuringClosingThread.terminate();
  await waitUntil(
    () => stdoutDuringClosing.terminations.length === 1,
    "closing owner termination",
    stdoutDuringClosing.drain,
  );
  stdoutDuringClosing.emitRaw("{malformed while closing}\n");
  stdoutDuringClosing.live = false;
  releaseClosingTermination?.();
  await closingTermination;
  assert.deepEqual(
    await stdoutDuringClosingThread.probe(),
    { live: false, rateLimits: undefined },
    "stdout arriving during cleanup cannot replace terminal closed state with a protocol fault",
  );

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

  const alreadyDead = createHarness({ includeNativeRoot: true });
  const alreadyDeadThread = await alreadyDead.open(alreadyDead.args());
  alreadyDead.live = false;
  await alreadyDeadThread.terminate();
  assert.deepEqual(alreadyDead.terminations, []);
  assert.equal(alreadyDead.nativeRootTerminations, 0, "a dead owner is never signalled through its native handle");

  const lateEvents = createHarness();
  const lateEventsThread = await lateEvents.open(lateEvents.args());
  await lateEventsThread.terminate();
  const writesAfterClose = lateEvents.writes.length;
  const terminationsAfterClose = lateEvents.terminations.length;
  lateEvents.emitRaw("{malformed after close}\n");
  lateEvents.events.error(new Error("late error"));
  lateEvents.events.exit(0, null);
  await flush();
  assert.equal(lateEvents.terminations.length, terminationsAfterClose);
  assert.deepEqual(await lateEventsThread.probe(), { live: false, rateLimits: undefined });
  await assert.rejects(
    lateEventsThread.startTurn("after close"),
    (error: unknown) => {
      assert.equal((error as Error).message, "Codex app-server is unavailable");
      return true;
    },
  );
  assert.equal(lateEvents.writes.length, writesAfterClose, "closed controllers never write another request");

  let endDuringClose!: ReturnType<typeof createHarness>;
  endDuringClose = createHarness({
    end: () => { endDuringClose.events.error(new Error("synchronous end error")); },
  });
  const endDuringCloseThread = await endDuringClose.open(endDuringClose.args());
  await endDuringCloseThread.terminate();
  assert.equal(endDuringClose.terminations.length, 1);
  assert.deepEqual(await endDuringCloseThread.probe(), { live: false, rateLimits: undefined });

  const changedOwner = createHarness({
    platform: "windows",
    includeNativeRoot: true,
    observe: async (expected) => ({
      status: "live",
      owner: { ...expected, token: `${expected.token}-changed` },
    }),
  });
  const changedOwnerThread = await changedOwner.open(changedOwner.args());
  await changedOwnerThread.terminate();
  assert.deepEqual(changedOwner.terminations, []);
  assert.equal(changedOwner.nativeRootTerminations, 0, "a changed owner is never signalled through its native handle");

  let racedObservationCalls = 0;
  let releaseRacedObservation: (() => void) | undefined;
  const exitDuringObservation = createHarness({
    platform: "windows",
    includeNativeRoot: true,
    observe: async (expected) => {
      racedObservationCalls += 1;
      return await new Promise<CodexDetachedOwnerObservation>((resolve) => {
        releaseRacedObservation = () => { resolve({ status: "live", owner: expected }); };
      });
    },
  });
  const exitDuringObservationThread = await exitDuringObservation.open(exitDuringObservation.args());
  const racedTermination = exitDuringObservationThread.terminate();
  await waitUntil(
    () => racedObservationCalls === 1,
    "pre-termination owner observation",
    exitDuringObservation.drain,
  );
  exitDuringObservation.events.exit(0, null);
  releaseRacedObservation?.();
  await racedTermination;
  assert.deepEqual(exitDuringObservation.terminations, [], "root exit during re-observation closes the kill window");
  assert.equal(
    exitDuringObservation.nativeRootTerminations,
    0,
    "root exit during re-observation also closes the native-handle kill window",
  );

  let exitDuringTerminateObservations = 0;
  let exitDuringTerminate!: ReturnType<typeof createHarness>;
  exitDuringTerminate = createHarness({
    platform: "windows",
    observe: async (expected) => {
      exitDuringTerminateObservations += 1;
      return { status: "live", owner: expected };
    },
    terminate: async () => {
      exitDuringTerminate.events.exit(0, "SIGTERM");
    },
  });
  const exitingThread = await exitDuringTerminate.open(exitDuringTerminate.args());
  await exitingThread.terminate();
  assert.equal(exitDuringTerminateObservations, 1, "root exit ends death polling without another observation");
  assert.deepEqual(exitDuringTerminate.terminations, [exitDuringTerminate.candidate]);
  assert.deepEqual(await exitingThread.probe(), { live: false, rateLimits: undefined });
  await exitingThread.terminate();
  assert.equal(exitDuringTerminateObservations, 1, "closed generation probes never re-observe the pid");
  assert.deepEqual(exitDuringTerminate.terminations, [exitDuringTerminate.candidate]);
  await assert.rejects(exitingThread.startTurn("already closed"), /app-server is unavailable/);

  const terminatorError = createHarness({ terminate: async () => { throw new Error("tree kill failed"); } });
  const terminatorThread = await terminatorError.open(terminatorError.args());
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(terminatorThread.terminate(), (error: unknown) => {
      assert.equal((error as Error).message, "Codex app-server cleanup failed: Codex owner termination failed");
      return true;
    });
  }
  assert.equal(terminatorError.terminations.length, 1);
  assert.deepEqual(
    terminatorError.provisionalObservationTimeouts,
    [],
    "an absent native root handle keeps death polling on the exact public owner",
  );

  const terminationFallback = createHarness({
    includeNativeRoot: true,
    terminate: async () => { throw new Error("tree kill failed"); },
  });
  const terminationFallbackThread = await terminationFallback.open(terminationFallback.args({ timeoutMs: 31 }));
  await assert.rejects(terminationFallbackThread.terminate(), (error: unknown) => {
    assert.equal((error as Error).message, "Codex app-server cleanup failed: Codex owner termination failed");
    return true;
  });
  assert.deepEqual(terminationFallback.terminations, [terminationFallback.candidate]);
  assert.equal(terminationFallback.nativeRootTerminations, 1);
  assert.deepEqual(terminationFallback.nativeRootTerminationTimeouts, [31]);
  assert.deepEqual(
    terminationFallback.provisionalObservationTimeouts,
    [31],
    "native fallback awaits the captured generation's death",
  );
  assert.equal(terminationFallback.live, false);

  const nativeGetter = createHarness({
    includeNativeRoot: true,
    nativeRootGetterFailure: "raw native getter detail",
    terminate: async () => { throw new Error("tree kill failed"); },
  });
  const nativeGetterThread = await nativeGetter.open(nativeGetter.args());
  await assert.rejects(nativeGetterThread.terminate(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Codex app-server cleanup failed: Codex owner termination failed");
    assert.equal(error.message.includes("raw native getter"), false);
    return true;
  });
  assert.equal(nativeGetter.ended, 1, "a throwing native getter cannot skip I/O close");
  assert.deepEqual(nativeGetter.terminations, [nativeGetter.candidate]);
  assert.equal(nativeGetter.nativeRootTerminations, 0);

  const rawCleanup = createHarness();
  const rawCleanupArgs = rawCleanup.args();
  const rawCleanupThread = await rawCleanup.open(rawCleanupArgs);
  Object.defineProperty(rawCleanupArgs, "observeLiveness", {
    configurable: true,
    get: () => { throw "raw cleanup getter detail"; },
  });
  await assert.rejects(rawCleanupThread.terminate(), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(
      error.message,
      "Codex app-server cleanup failed: Codex app-server cleanup failed",
    );
    assert.equal(error.message.includes("raw cleanup getter"), false);
    return true;
  });
  assert.equal(rawCleanup.ended, 1);

  const unavailableBeforeKill = createHarness({
    observe: async () => ({ status: "unavailable" }),
  });
  const unavailableBeforeKillThread = await unavailableBeforeKill.open(unavailableBeforeKill.args());
  await assert.rejects(
    unavailableBeforeKillThread.terminate(),
    /ownership observation was unavailable before termination/,
  );
  assert.deepEqual(unavailableBeforeKill.terminations, []);

  const unavailableFallback = createHarness({
    includeNativeRoot: true,
    observe: async () => ({ status: "unavailable" }),
  });
  const unavailableFallbackThread = await unavailableFallback.open(unavailableFallback.args({ timeoutMs: 32 }));
  await assert.rejects(unavailableFallbackThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex app-server ownership observation was unavailable before termination",
    );
    return true;
  });
  assert.deepEqual(unavailableFallback.terminations, []);
  assert.equal(unavailableFallback.nativeRootTerminations, 1);
  assert.deepEqual(unavailableFallback.nativeRootTerminationTimeouts, [32]);
  assert.deepEqual(
    unavailableFallback.provisionalObservationTimeouts,
    [32],
    "unavailable exact observation falls back to the captured generation and confirms its death",
  );
  assert.equal(unavailableFallback.live, false);

  const livenessDiagnostic = createHarness();
  const livenessDiagnosticThread = await livenessDiagnostic.open(livenessDiagnostic.args({
    observeLiveness: async () => { throw "raw liveness diagnostic"; },
  }));
  await assert.rejects(livenessDiagnosticThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex owner liveness observation failed",
    );
    return true;
  });

  let ownershipDiagnosticCalls = 0;
  const ownershipDiagnostic = createHarness();
  const ownershipDiagnosticThread = await ownershipDiagnostic.open(ownershipDiagnostic.args({
    observeOwnership: async () => {
      ownershipDiagnosticCalls += 1;
      if (ownershipDiagnosticCalls === 1) return ownershipDiagnostic.candidate;
      throw "raw ownership diagnostic";
    },
  }));
  await assert.rejects(ownershipDiagnosticThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex owner observation failed",
    );
    return true;
  });

  let windowsExitThenThrow!: ReturnType<typeof createHarness>;
  windowsExitThenThrow = createHarness({
    platform: "windows",
    includeNativeRoot: true,
    terminate: async () => {
      windowsExitThenThrow.events.exit(0, "SIGTERM");
      throw new Error("termination reported failure after exit");
    },
  });
  const windowsExitThenThrowThread = await windowsExitThenThrow.open(windowsExitThenThrow.args());
  await assert.rejects(windowsExitThenThrowThread.terminate(), /owner termination failed/);
  assert.equal(windowsExitThenThrow.nativeRootTerminations, 0, "an exited Windows generation is never signalled again");

  let posixExitThenThrow!: ReturnType<typeof createHarness>;
  posixExitThenThrow = createHarness({
    platform: "posix",
    includeNativeRoot: true,
    terminate: async () => {
      posixExitThenThrow.events.exit(0, "SIGTERM");
      throw new Error("POSIX tree termination failed");
    },
  });
  const posixExitThenThrowThread = await posixExitThenThrow.open(posixExitThenThrow.args());
  await assert.rejects(posixExitThenThrowThread.terminate(), /owner termination failed/);
  assert.equal(posixExitThenThrow.nativeRootTerminations, 1, "a POSIX exit event does not revoke the native child handle");

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
  assert.equal(stillLive.clock.delayCallCount, 2);

  const exactDeadline = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => ({ status: "live", owner: expected }),
  });
  exactDeadline.clock.advance(7);
  const exactDeadlineThread = await exactDeadline.open(exactDeadline.args({ timeoutMs: 25 }));
  await assert.rejects(exactDeadlineThread.terminate(), /did not become dead/);
  assert.deepEqual(exactDeadline.clock.delayDurations, [10, 10, 5]);

  let frozenDelayCalls = 0;
  const frozenClock = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => ({ status: "live", owner: expected }),
  });
  frozenClock.clock.delay = async () => { frozenDelayCalls += 1; };
  const frozenClockThread = await frozenClock.open(frozenClock.args({ timeoutMs: 20 }));
  await assert.rejects(frozenClockThread.terminate(), /did not become dead/);
  assert.equal(frozenDelayCalls, 3, "fixed polling bounds cleanup even when the collaborator clock stalls");

  const nonErrorClock = createHarness({
    terminate: async () => undefined,
    observe: async (expected) => ({ status: "live", owner: expected }),
  });
  const nonErrorClockThread = await nonErrorClock.open(nonErrorClock.args());
  nonErrorClock.clock.now = () => { throw "raw clock detail"; };
  await assert.rejects(nonErrorClockThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex app-server death observation failed",
    );
    assert.equal((error as Error).message.includes("raw clock detail"), false);
    return true;
  });

  const boundedTimerRegistration = createHarness();
  const boundedTimerRegistrationThread = await boundedTimerRegistration.open(boundedTimerRegistration.args());
  const restoreBoundedSet = boundedTimerRegistration.clock.setTimeout.bind(boundedTimerRegistration.clock);
  const restoreRegistrationClear = boundedTimerRegistration.clock.clearTimeout.bind(boundedTimerRegistration.clock);
  const registrationClearHandles: unknown[] = [];
  boundedTimerRegistration.clock.setTimeout = () => {
    boundedTimerRegistration.clock.setTimeout = restoreBoundedSet;
    throw "raw bounded timer registration detail";
  };
  boundedTimerRegistration.clock.clearTimeout = (handle) => {
    registrationClearHandles.push(handle);
    restoreRegistrationClear(handle);
  };
  await assert.rejects(boundedTimerRegistrationThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex owner observation failed",
    );
    assert.equal((error as Error).message.includes("raw bounded"), false);
    return true;
  });
  assert.equal(registrationClearHandles.includes(undefined), false);

  const boundedTimerCleanup = createHarness();
  const boundedTimerCleanupThread = await boundedTimerCleanup.open(boundedTimerCleanup.args());
  const restoreBoundedClear = boundedTimerCleanup.clock.clearTimeout.bind(boundedTimerCleanup.clock);
  boundedTimerCleanup.clock.clearTimeout = (handle) => {
    boundedTimerCleanup.clock.clearTimeout = restoreBoundedClear;
    restoreBoundedClear(handle);
    throw "raw bounded timer cleanup detail";
  };
  await assert.rejects(boundedTimerCleanupThread.terminate(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Codex app-server cleanup failed: Codex owner observation timer cleanup failed",
    );
    assert.equal((error as Error).message.includes("raw bounded"), false);
    return true;
  });

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
  await waitUntil(() => delayCalls === 1, "cleanup delay", hangingDelay.drain);
  hangingDelay.clock.advance(23);
  await assert.rejects(hangingDelayCleanup, /cleanup failed.*cleanup delay timed out/);
  settleDelay?.();

  const endError = createHarness({ end: () => { throw new Error("stdin close failed"); } });
  const endErrorThread = await endError.open(endError.args());
  await assert.rejects(endErrorThread.terminate(), /protocol close failed/);
  assert.equal(endError.terminations.length, 1, "I/O close failure does not skip tree termination");

  let settleOwnerTermination: (() => void) | undefined;
  const hangingTerminator = createHarness({
    includeNativeRoot: true,
    terminate: async () => await new Promise<void>((resolve) => { settleOwnerTermination = resolve; }),
  });
  const hangingTerminatorThread = await hangingTerminator.open(hangingTerminator.args({ timeoutMs: 24 }));
  const hangingTermination = hangingTerminatorThread.terminate();
  await waitUntil(
    () => hangingTerminator.terminations.length === 1,
    "owner termination",
    hangingTerminator.drain,
  );
  hangingTerminator.clock.advance(24);
  await assert.rejects(hangingTermination, /cleanup failed.*owner termination timed out/);
  assert.equal(hangingTerminator.nativeRootTerminations, 1);
  assert.deepEqual(hangingTerminator.nativeRootTerminationTimeouts, [24]);
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
  await waitUntil(
    () => ownerObservations === 1,
    "owner observation",
    hangingObserver.drain,
  );
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
  await waitUntil(
    () => livenessCalls === 1,
    "liveness observation",
    hangingLiveness.drain,
  );
  hangingLiveness.clock.advance(28);
  assert.deepEqual(await livenessProbe, { live: "unavailable", rateLimits: undefined });
  hangLiveness = false;
  settleLiveness?.(undefined);
  await hangingLivenessThread.terminate();
});
