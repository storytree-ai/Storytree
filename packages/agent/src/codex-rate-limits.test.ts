/**
 * `codex-rate-limit-snapshot-before-turns`: the pinned Codex app-server can report subscription
 * usage without opening a thread or spending a model turn. These tests drive only an injected
 * interactive process; the standing suite never reads the operator's account.
 */
import assert from "node:assert/strict";
import * as path from "node:path";
import test from "node:test";

import {
  createCodexAppServerSpawner,
  DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS,
  readCodexRateLimitSnapshot,
  spawnCodexAppServer,
} from "./codex-rate-limits.js";
import type {
  CodexAppServerCommand,
  CodexAppServerProcess,
  CodexAppServerProcessEvents,
  CodexAppServerSpawner,
  CodexNativeAppServerChild,
  CodexNativeAppServerSpawn,
  CodexRateLimitClock,
  CodexRateLimitSnapshot,
} from "./codex-rate-limits.js";

const CAPTURED_AT_MS = Date.parse("2026-09-16T00:00:00.000Z");

interface FakeClockHarness {
  readonly clock: CodexRateLimitClock;
  readonly armedFor: number[];
  readonly cleared: unknown[];
  fire(): void;
}

function fakeClock(now = CAPTURED_AT_MS): FakeClockHarness {
  const armedFor: number[] = [];
  const cleared: unknown[] = [];
  let callback: (() => void) | undefined;
  const handle = Object.create(null) as ReturnType<typeof setTimeout>;
  return {
    armedFor,
    cleared,
    clock: {
      now: () => now,
      setTimeout: (next, ms) => {
        callback = next;
        armedFor.push(ms);
        return handle;
      },
      clearTimeout: (received) => {
        cleared.push(received);
        callback = undefined;
      },
    },
    fire: () => {
      const pending = callback;
      assert.ok(pending, "the app-server probe did not arm its bound");
      pending();
    },
  };
}

interface FakeAppServer {
  readonly spawn: CodexAppServerSpawner;
  readonly commands: CodexAppServerCommand[];
  readonly writes: string[];
  readonly writeAttempts: { count: number };
  readonly ended: { count: number };
  readonly killed: { count: number };
  stdout(chunk: string | Uint8Array): void;
  message(value: unknown): void;
  error(error: Error): void;
  exit(code?: number | null, signal?: NodeJS.Signals | null): void;
}

function fakeAppServer(
  options: {
    readonly spawnError?: unknown;
    readonly synchronousError?: Error;
    readonly writeErrorAt?: number;
    readonly writeError?: unknown;
    readonly endError?: unknown;
    readonly killError?: unknown;
  } = {},
): FakeAppServer {
  const commands: CodexAppServerCommand[] = [];
  const writes: string[] = [];
  const writeAttempts = { count: 0 };
  const ended = { count: 0 };
  const killed = { count: 0 };
  let events: CodexAppServerProcessEvents | undefined;
  const process: CodexAppServerProcess = {
    write: (line) => {
      writeAttempts.count += 1;
      if (writeAttempts.count === options.writeErrorAt) throw options.writeError ?? new Error("write failed");
      writes.push(line);
    },
    end: () => {
      ended.count += 1;
      if (options.endError !== undefined) throw options.endError;
    },
    kill: () => {
      killed.count += 1;
      if (options.killError !== undefined) throw options.killError;
    },
  };
  return {
    commands,
    writes,
    writeAttempts,
    ended,
    killed,
    spawn: (command, nextEvents) => {
      if (options.spawnError !== undefined) throw options.spawnError;
      commands.push(command);
      events = nextEvents;
      if (options.synchronousError !== undefined) nextEvents.error(options.synchronousError);
      return process;
    },
    stdout: (chunk) => {
      assert.ok(events, "the fake app-server has not been spawned");
      events.stdout(chunk);
    },
    message: (value) => {
      assert.ok(events, "the fake app-server has not been spawned");
      events.stdout(`${JSON.stringify(value)}\n`);
    },
    error: (error) => {
      assert.ok(events, "the fake app-server has not been spawned");
      events.error(error);
    },
    exit: (code = 0, signal = null) => {
      assert.ok(events, "the fake app-server has not been spawned");
      events.exit(code, signal);
    },
  };
}

function writtenMessages(server: FakeAppServer): unknown[] {
  return server.writes.map((line) => JSON.parse(line) as unknown);
}

function begin(
  server = fakeAppServer(),
  clock = fakeClock(),
  env: NodeJS.ProcessEnv = {},
) {
  const pending = readCodexRateLimitSnapshot({
    cwd: process.cwd(),
    env,
    spawn: server.spawn,
    clock: clock.clock,
  });
  return { server, clock, pending };
}

function initialize(server: FakeAppServer): void {
  server.message({
    id: 1,
    result: {
      userAgent: "codex_cli_rs/0.145.0",
      platformFamily: "windows",
      platformOs: "windows",
      codexHome: "C:\\codex",
    },
  });
}

function rateLimitResult(result: unknown) {
  return { id: 2, result };
}

function emptyRateLimitsResult() {
  return {
    rateLimits: { primary: null, secondary: null },
    rateLimitsByLimitId: {},
    rateLimitResetCredits: { availableCount: 0 },
  };
}

async function settled<T>(pending: Promise<T>): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const guard = setTimeout(
      () => reject(new Error("the injected app-server exchange did not settle")),
      1_000,
    );
    void pending.then(
      (value) => {
        clearTimeout(guard);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(guard);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

async function snapshotFromResult(
  result: unknown,
  options: { readonly clock?: FakeClockHarness; readonly server?: FakeAppServer } = {},
): Promise<CodexRateLimitSnapshot> {
  const server = options.server ?? fakeAppServer();
  const clock = options.clock ?? fakeClock();
  const pending = readCodexRateLimitSnapshot({
    cwd: process.cwd(),
    spawn: server.spawn,
    clock: clock.clock,
  });
  initialize(server);
  server.message(rateLimitResult(result));
  server.exit(0);
  return await settled(pending);
}

test("the native adapter wires the bounded JSONL process without touching account state", () => {
  assert.equal(typeof spawnCodexAppServer, "function", "the production adapter is composed at module load");

  let stdoutListener: ((chunk: Buffer) => void) | undefined;
  let stderrListener: (() => void) | undefined;
  let childErrorListener: ((error: Error) => void) | undefined;
  let stdinErrorListener: ((error: Error) => void) | undefined;
  let exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
  const stdinWrites: string[] = [];
  const stdinEnds = { count: 0 };
  const kills = { count: 0 };

  const nativeChild: CodexNativeAppServerChild = {
    stdout: {
      on: (event: string, listener: (chunk: Buffer) => void) => {
        assert.equal(event, "data");
        stdoutListener = listener;
      },
    },
    stderr: {
      on: (event: string, listener: () => void) => {
        assert.equal(event, "data");
        stderrListener = listener;
      },
    },
    stdin: {
      once: (event: string, listener: (error: Error) => void) => {
        assert.equal(event, "error");
        stdinErrorListener = listener;
      },
      write: (line: string) => stdinWrites.push(line),
      end: () => {
        stdinEnds.count += 1;
      },
    },
    once: (event: string, listener: unknown) => {
      if (event === "error") childErrorListener = listener as (error: Error) => void;
      if (event === "exit") {
        exitListener = listener as (code: number | null, signal: NodeJS.Signals | null) => void;
      }
    },
    kill: () => {
      kills.count += 1;
    },
  };

  const spawnCalls: Array<{
    readonly executable: string;
    readonly args: readonly string[];
    readonly options: Parameters<CodexNativeAppServerSpawn>[2];
  }> = [];
  const nativeSpawn: CodexNativeAppServerSpawn = (executable, args, options) => {
    spawnCalls.push({ executable, args, options });
    return nativeChild;
  };
  const received = {
    stdout: [] as Array<string | Uint8Array>,
    errors: [] as Error[],
    exits: [] as Array<readonly [number | null, NodeJS.Signals | null]>,
  };
  const adapter = createCodexAppServerSpawner(nativeSpawn);
  const command: CodexAppServerCommand = {
    executable: process.execPath,
    args: ["fixture", "--stdio"],
    cwd: process.cwd(),
    env: { STORYTREE_SAFE_VALUE: "kept" },
  };
  const processHandle = adapter(command, {
    stdout: (chunk) => received.stdout.push(chunk),
    error: (error) => received.errors.push(error),
    exit: (code, signal) => received.exits.push([code, signal]),
  });

  assert.deepEqual(spawnCalls, [{
    executable: process.execPath,
    args: ["fixture", "--stdio"],
    options: {
      cwd: process.cwd(),
      env: { STORYTREE_SAFE_VALUE: "kept" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  }]);
  assert.ok(stdoutListener);
  assert.ok(stderrListener, "stderr is drained even though it is not interpreted as account state");
  assert.ok(childErrorListener);
  assert.ok(stdinErrorListener);
  assert.ok(exitListener);

  const bytes = Buffer.from("snapshot\n");
  stdoutListener(bytes);
  stderrListener();
  childErrorListener(new Error("child failed"));
  stdinErrorListener(new Error("stdin failed"));
  exitListener(7, "SIGTERM");
  processHandle.write("initialize\n");
  processHandle.end();
  processHandle.kill();

  assert.equal(received.stdout[0], bytes);
  assert.deepEqual(received.errors.map((error) => error.message), ["child failed", "stdin failed"]);
  assert.deepEqual(received.exits, [[7, "SIGTERM"]]);
  assert.deepEqual(stdinWrites, ["initialize\n"]);
  assert.equal(stdinEnds.count, 1);
  assert.equal(kills.count, 1);
});

test("the turn-free probe stages initialize before the rate-limit read and returns weekly plus per-model usage", async () => {
  const server = fakeAppServer();
  const clock = fakeClock();
  const env = {
    OPENAI_API_KEY: "must-not-cross",
    codex_api_key: "must-not-cross-either",
    Codex_Access_Token: "also-metered",
    STORYTREE_CODEX_EXECUTABLE: `  ${process.execPath}  `,
    STORYTREE_SAFE_VALUE: "kept",
  };
  const pending = readCodexRateLimitSnapshot({
    cwd: process.cwd(),
    env,
    spawn: server.spawn,
    clock: clock.clock,
  });

  assert.deepEqual(writtenMessages(server), [
    {
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "storytree", version: "0.0.0" } },
    },
  ]);
  assert.equal(server.commands.length, 1);
  assert.equal(server.commands[0]?.executable, process.execPath);
  assert.deepEqual(server.commands[0]?.args, ["app-server", "--stdio"]);
  assert.equal(server.commands[0]?.env["STORYTREE_SAFE_VALUE"], "kept");
  assert.equal(
    Object.keys(server.commands[0]?.env ?? {}).some((name) =>
      ["openai_api_key", "codex_api_key", "codex_access_token"].includes(name.toLowerCase())),
    false,
  );

  // The parser accepts both split and coalesced stdout chunks and ignores unrelated notifications.
  server.stdout('{"method":"account/rateLimits/updated","params":{}}\n{"id":1,');
  server.stdout(
    '"result":{"userAgent":"codex_cli_rs/0.145.0","platformFamily":"windows",' +
      '"platformOs":"windows","codexHome":"C:\\\\codex"}}\n',
  );
  assert.deepEqual(writtenMessages(server).slice(1), [
    { method: "initialized" },
    { id: 2, method: "account/rateLimits/read", params: null },
  ]);
  assert.equal(
    server.writes.some((line) => /thread\/start|turn\/start|rateLimitResetCredit\/consume/.test(line)),
    false,
    "the observational probe must not start a model turn or spend a reset credit",
  );

  server.message(rateLimitResult({
    rateLimits: {
      limitId: "codex",
      limitName: null,
      primary: { usedPercent: 6, windowDurationMins: 10_080, resetsAt: 1_789_984_107 },
      secondary: null,
    },
    rateLimitsByLimitId: {
      codex_bengalfox: {
        limitId: "codex_bengalfox",
        limitName: "GPT-5.3-Codex-Spark",
        primary: { usedPercent: 2, windowDurationMins: 300, resetsAt: 1_789_542_311 },
        secondary: { usedPercent: 9, windowDurationMins: 10_080, resetsAt: null },
      },
    },
    rateLimitResetCredits: { availableCount: 1, credits: null },
  }));
  assert.equal(server.ended.count, 1, "a completed read closes app-server stdin");
  server.exit(0);

  assert.deepEqual(await settled(pending), {
    status: "available",
    capturedAt: "2026-09-16T00:00:00.000Z",
    weekly: {
      status: "available",
      usedPercent: 6,
      windowDurationMins: { status: "available", value: 10_080 },
      resetsAt: { status: "available", value: 1_789_984_107 },
    },
    rateLimitsByLimitId: {
      status: "available",
      value: {
        codex_bengalfox: {
          status: "available",
          limitId: { status: "available", value: "codex_bengalfox" },
          limitName: { status: "available", value: "GPT-5.3-Codex-Spark" },
          primary: {
            status: "available",
            usedPercent: 2,
            windowDurationMins: { status: "available", value: 300 },
            resetsAt: { status: "available", value: 1_789_542_311 },
          },
          secondary: {
            status: "available",
            usedPercent: 9,
            windowDurationMins: { status: "available", value: 10_080 },
            resetsAt: { status: "unavailable", reason: "not-reported" },
          },
        },
      },
    },
    resetCredits: { status: "available", availableCount: 1 },
  });
  assert.deepEqual(clock.armedFor, [DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS]);
  assert.equal(clock.cleared.length, 1, "the settled child releases its bound");
  assert.equal(server.killed.count, 0);
});

test("the public barrel exposes the reader and the default command uses the pinned Codex wrapper", async () => {
  const barrel = await import("./index.js");
  assert.equal(barrel.readCodexRateLimitSnapshot, readCodexRateLimitSnapshot);

  const server = fakeAppServer();
  const clock = fakeClock();
  const { pending } = begin(server, clock);
  assert.equal(server.commands.length, 1);
  assert.equal(server.commands[0]?.executable, process.execPath);
  assert.deepEqual(server.commands[0]?.args.slice(-2), ["app-server", "--stdio"]);
  assert.equal(
    server.commands[0]?.args[0]?.endsWith(
      path.join("@openai", "codex", "bin", "codex.js"),
    ),
    true,
  );

  clock.fire();
  assert.deepEqual(await settled(pending), { status: "unavailable", reason: "timed-out" });
});

test("the production clock timestamps and bounds a turn-free injected process", async () => {
  const server = fakeAppServer();
  const before = Date.now();
  const pending = readCodexRateLimitSnapshot({ cwd: process.cwd(), spawn: server.spawn });
  initialize(server);
  server.message(rateLimitResult({
    rateLimits: { primary: null, secondary: null },
    rateLimitsByLimitId: {},
    rateLimitResetCredits: { availableCount: 0 },
  }));
  server.exit(0);
  const result = await settled(pending);
  const after = Date.now();

  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  const capturedAt = Date.parse(result.capturedAt);
  assert.ok(capturedAt >= before && capturedAt <= after, "the snapshot uses the system clock at capture");
});

test("explicit timeout bounds are honored and invalid bounds fall back to the default", async () => {
  const cases = [
    { timeoutMs: 123, expected: 123 },
    { timeoutMs: 0, expected: DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS },
    { timeoutMs: -1, expected: DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS },
    { timeoutMs: Number.NaN, expected: DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS },
    { timeoutMs: Number.POSITIVE_INFINITY, expected: DEFAULT_CODEX_RATE_LIMIT_TIMEOUT_MS },
  ];

  for (const entry of cases) {
    const server = fakeAppServer();
    const clock = fakeClock();
    const pending = readCodexRateLimitSnapshot({
      cwd: process.cwd(),
      spawn: server.spawn,
      clock: clock.clock,
      timeoutMs: entry.timeoutMs,
    });
    assert.deepEqual(clock.armedFor, [entry.expected]);
    clock.fire();
    assert.deepEqual(await settled(pending), { status: "unavailable", reason: "timed-out" });
  }
});

test("weekly selection follows the declared duration, while absent model data and resets stay unavailable", async () => {
  const { server, pending } = begin();
  initialize(server);
  server.message(rateLimitResult({
    rateLimits: {
      primary: { usedPercent: 91, windowDurationMins: 300, resetsAt: 123 },
      secondary: { usedPercent: 14, windowDurationMins: 10_080, resetsAt: null },
    },
    rateLimitsByLimitId: null,
    rateLimitResetCredits: null,
  }));
  server.exit(0);

  const result = await settled(pending);
  assert.deepEqual(result, {
    status: "available",
    capturedAt: "2026-09-16T00:00:00.000Z",
    weekly: {
      status: "available",
      usedPercent: 14,
      windowDurationMins: { status: "available", value: 10_080 },
      resetsAt: { status: "unavailable", reason: "not-reported" },
    },
    rateLimitsByLimitId: { status: "unavailable", reason: "not-reported" },
    resetCredits: { status: "unavailable", reason: "not-reported" },
  });
  assert.equal(JSON.stringify(result).includes('"value":0'), false);
});

test("a present empty per-model map is different from one the app-server did not report", async () => {
  const { server, pending } = begin();
  initialize(server);
  server.message(rateLimitResult({
    rateLimits: { primary: null, secondary: null },
    rateLimitsByLimitId: {},
  }));
  server.exit(0);

  const result = await settled(pending);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(result.weekly, { status: "unavailable", reason: "not-reported" });
  assert.deepEqual(result.rateLimitsByLimitId, { status: "available", value: {} });
});

test("usage above 100 percent remains an available observation", async () => {
  const { server, pending } = begin();
  initialize(server);
  server.message(rateLimitResult({
    rateLimits: {
      primary: { usedPercent: 101, windowDurationMins: 10_080, resetsAt: 1_800_000_000 },
    },
    rateLimitsByLimitId: {
      overdrawn_model: {
        limitId: "overdrawn_model",
        primary: { usedPercent: 127, windowDurationMins: 300, resetsAt: 1_800_000_100 },
      },
    },
  }));
  server.exit(0);

  const result = await settled(pending);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.weekly.status === "available" && result.weekly.usedPercent, 101);
  const model = result.rateLimitsByLimitId.status === "available"
    ? result.rateLimitsByLimitId.value["overdrawn_model"]
    : undefined;
  assert.equal(model?.status === "available" && model.primary.status === "available"
    ? model.primary.usedPercent
    : undefined, 127);
});

test("malformed per-model buckets are isolated while valid account usage survives", async () => {
  const { server, pending } = begin();
  initialize(server);
  server.message(rateLimitResult({
    rateLimits: {
      primary: { usedPercent: 0, windowDurationMins: 10_080, resetsAt: 1_800_000_000 },
    },
    rateLimitsByLimitId: {
      malformed_model: "not a bucket",
      sparse_model: {
        limitId: null,
        primary: { usedPercent: 3, windowDurationMins: null, resetsAt: null },
        secondary: null,
      },
    },
  }));
  server.exit(0);

  const result = await settled(pending);
  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.equal(result.weekly.status, "available");
  assert.deepEqual(result.rateLimitsByLimitId, {
    status: "available",
    value: {
      malformed_model: { status: "unavailable", reason: "malformed" },
      sparse_model: {
        status: "available",
        limitId: { status: "unavailable", reason: "not-reported" },
        limitName: { status: "unavailable", reason: "not-reported" },
        primary: {
          status: "available",
          usedPercent: 3,
          windowDurationMins: { status: "unavailable", reason: "not-reported" },
          resetsAt: { status: "unavailable", reason: "not-reported" },
        },
        secondary: { status: "unavailable", reason: "not-reported" },
      },
    },
  });
});

test("malformed and boundary scalar facts stay typed without erasing valid siblings", async () => {
  const result = await snapshotFromResult({
    rateLimits: {
      limitId: 99,
      limitName: {},
      primary: { usedPercent: "6", windowDurationMins: 10_080, resetsAt: 0 },
      secondary: { usedPercent: 0, windowDurationMins: 0, resetsAt: 0 },
    },
    rateLimitsByLimitId: {
      invalid_percent: {
        limitId: 7,
        limitName: 8,
        primary: { usedPercent: -1, windowDurationMins: 10_080, resetsAt: 1 },
        secondary: { usedPercent: "2", windowDurationMins: 10_080, resetsAt: 2 },
      },
      invalid_integers: {
        limitId: "",
        limitName: "Integer boundaries",
        primary: { usedPercent: 0, windowDurationMins: -1, resetsAt: 1.5 },
        secondary: {
          usedPercent: 1,
          windowDurationMins: 0,
          resetsAt: Number.MAX_SAFE_INTEGER + 1,
        },
      },
      missing_fields: {
        primary: { usedPercent: 0 },
      },
    },
    rateLimitResetCredits: { availableCount: -1 },
  });

  assert.equal(result.status, "available");
  if (result.status !== "available") return;
  assert.deepEqual(result.weekly, { status: "unavailable", reason: "not-reported" });
  assert.deepEqual(result.resetCredits, { status: "unavailable", reason: "malformed" });
  assert.deepEqual(result.rateLimitsByLimitId, {
    status: "available",
    value: {
      invalid_percent: {
        status: "available",
        limitId: { status: "unavailable", reason: "malformed" },
        limitName: { status: "unavailable", reason: "malformed" },
        primary: { status: "unavailable", reason: "malformed" },
        secondary: { status: "unavailable", reason: "malformed" },
      },
      invalid_integers: {
        status: "available",
        limitId: { status: "available", value: "" },
        limitName: { status: "available", value: "Integer boundaries" },
        primary: {
          status: "available",
          usedPercent: 0,
          windowDurationMins: { status: "unavailable", reason: "malformed" },
          resetsAt: { status: "unavailable", reason: "malformed" },
        },
        secondary: {
          status: "available",
          usedPercent: 1,
          windowDurationMins: { status: "available", value: 0 },
          resetsAt: { status: "unavailable", reason: "malformed" },
        },
      },
      missing_fields: {
        status: "available",
        limitId: { status: "unavailable", reason: "not-reported" },
        limitName: { status: "unavailable", reason: "not-reported" },
        primary: {
          status: "available",
          usedPercent: 0,
          windowDurationMins: { status: "unavailable", reason: "not-reported" },
          resetsAt: { status: "unavailable", reason: "not-reported" },
        },
        secondary: { status: "unavailable", reason: "not-reported" },
      },
    },
  });
});

test("missing, malformed, empty, and zero-valued collections remain distinct", async () => {
  const account = { primary: null, secondary: null };

  const missing = await snapshotFromResult({ rateLimits: account });
  assert.equal(missing.status, "available");
  if (missing.status !== "available") return;
  assert.deepEqual(missing.rateLimitsByLimitId, { status: "unavailable", reason: "not-reported" });
  assert.deepEqual(missing.resetCredits, { status: "unavailable", reason: "not-reported" });

  const malformedContainers = await snapshotFromResult({
    rateLimits: account,
    rateLimitsByLimitId: [],
    rateLimitResetCredits: [],
  });
  assert.equal(malformedContainers.status, "available");
  if (malformedContainers.status !== "available") return;
  assert.deepEqual(malformedContainers.rateLimitsByLimitId, {
    status: "unavailable",
    reason: "malformed",
  });
  assert.deepEqual(malformedContainers.resetCredits, { status: "unavailable", reason: "malformed" });

  const zero = await snapshotFromResult({
    rateLimits: account,
    rateLimitsByLimitId: {},
    rateLimitResetCredits: { availableCount: 0 },
  });
  assert.equal(zero.status, "available");
  if (zero.status !== "available") return;
  assert.deepEqual(zero.rateLimitsByLimitId, { status: "available", value: {} });
  assert.deepEqual(zero.resetCredits, { status: "available", availableCount: 0 });

  const fractional = await snapshotFromResult({
    rateLimits: account,
    rateLimitResetCredits: { availableCount: 1.5 },
  });
  assert.equal(fractional.status, "available");
  if (fractional.status !== "available") return;
  assert.deepEqual(fractional.resetCredits, { status: "unavailable", reason: "malformed" });
});

test("the probe returns typed process and protocol absences instead of throwing or inventing usage", async (t) => {
  await t.test("synchronous spawn failures preserve Error and non-Error details", async () => {
    for (const [spawnError, detail] of [[new Error("spawn exploded"), "spawn exploded"], [42, "42"]] as const) {
      const server = fakeAppServer({ spawnError });
      const result = await settled(readCodexRateLimitSnapshot({
        cwd: process.cwd(),
        spawn: server.spawn,
        clock: fakeClock().clock,
      }));
      assert.deepEqual(result, { status: "unavailable", reason: "spawn-failed", detail });
    }
  });

  await t.test("a synchronous process callback is cleaned up before initialization", async () => {
    const server = fakeAppServer({ synchronousError: new Error("failed immediately") });
    const clock = fakeClock();
    const result = await settled(readCodexRateLimitSnapshot({
      cwd: process.cwd(),
      spawn: server.spawn,
      clock: clock.clock,
    }));
    assert.deepEqual(result, {
      status: "unavailable",
      reason: "process-error",
      detail: "failed immediately",
    });
    assert.equal(server.ended.count, 1);
    assert.equal(server.killed.count, 1);
    assert.deepEqual(clock.armedFor, [], "a settled spawn cannot arm or write after resolution");
    assert.deepEqual(clock.cleared, [], "no nonexistent timer is cleared");
    assert.deepEqual(server.writes, []);
  });

  await t.test("an asynchronous process error", async () => {
    const { server, pending } = begin();
    server.error(new Error("pipe broke"));
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "process-error",
      detail: "pipe broke",
    });
    assert.equal(server.ended.count, 1);
    assert.equal(server.killed.count, 1, "a process or pipe error cannot leave the probe alive");
  });

  await t.test("a relative executable override is refused before spawn", async () => {
    const server = fakeAppServer();
    const pending = readCodexRateLimitSnapshot({
      cwd: process.cwd(),
      env: { STORYTREE_CODEX_EXECUTABLE: "codex" },
      spawn: server.spawn,
      clock: fakeClock().clock,
    });
    assert.equal(server.commands.length, 0);
    const result = await settled(pending);
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, "spawn-failed");
    assert.match(result.detail ?? "", /must name an absolute executable/);
  });

  await t.test("write failures settle and clean up without sending later stages", async () => {
    const initial = fakeAppServer({ writeErrorAt: 1, writeError: "initial write refused" });
    const initialResult = await settled(readCodexRateLimitSnapshot({
      cwd: process.cwd(),
      spawn: initial.spawn,
      clock: fakeClock().clock,
    }));
    assert.deepEqual(initialResult, {
      status: "unavailable",
      reason: "process-error",
      detail: "initial write refused",
    });
    assert.equal(initial.writeAttempts.count, 1);
    assert.equal(initial.ended.count, 1);
    assert.equal(initial.killed.count, 1);

    const initialized = fakeAppServer({ writeErrorAt: 2, writeError: new Error("notify refused") });
    const { pending } = begin(initialized);
    initialize(initialized);
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "process-error",
      detail: "notify refused",
    });
    assert.equal(initialized.writeAttempts.count, 2, "a failed initialized notification stops the exchange");
    assert.equal(initialized.ended.count, 1);
    assert.equal(initialized.killed.count, 1);
  });

  await t.test("stdin close failures and cleanup failures stay typed", async () => {
    const endFailure = fakeAppServer({ endError: "close refused" });
    const { pending } = begin(endFailure);
    initialize(endFailure);
    endFailure.message(rateLimitResult(emptyRateLimitsResult()));
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "process-error",
      detail: "close refused",
    });
    assert.equal(endFailure.ended.count, 2, "cleanup retries the close before killing the child");
    assert.equal(endFailure.killed.count, 1);

    const cleanupFailure = fakeAppServer({
      endError: new Error("already closed"),
      killError: new Error("already gone"),
    });
    const clock = fakeClock();
    const cleanupPending = readCodexRateLimitSnapshot({
      cwd: process.cwd(),
      spawn: cleanupFailure.spawn,
      clock: clock.clock,
    });
    clock.fire();
    assert.deepEqual(await settled(cleanupPending), { status: "unavailable", reason: "timed-out" });
    assert.equal(cleanupFailure.ended.count, 1);
    assert.equal(cleanupFailure.killed.count, 1);
  });

  await t.test("exit before a response is exact and does not re-stop an exited child", async () => {
    for (const [code, signal, detail] of [
      [7, null, "app-server exited before the rate-limit response (code=7, signal=none)"],
      [null, "SIGTERM", "app-server exited before the rate-limit response (code=none, signal=SIGTERM)"],
      [0, null, "app-server exited before the rate-limit response (code=0, signal=none)"],
    ] as const) {
      const { server, pending } = begin();
      server.exit(code, signal);
      assert.deepEqual(await settled(pending), {
        status: "unavailable",
        reason: "process-exited",
        detail,
      });
      assert.equal(server.ended.count, 0);
      assert.equal(server.killed.count, 0);
    }
  });

  await t.test("malformed and non-object JSONL messages fail closed", async () => {
    const malformed = begin();
    malformed.server.stdout("{definitely not json}\n");
    const malformedResult = await settled(malformed.pending);
    assert.equal(malformedResult.status, "unavailable");
    assert.equal(malformedResult.reason, "protocol-error");
    assert.match(malformedResult.detail ?? "", /^malformed app-server JSONL: /);
    assert.equal(malformed.server.killed.count, 1);

    for (const line of ["42\n", "null\n", "[]\n"]) {
      const nonObject = begin();
      nonObject.server.stdout(line);
      assert.deepEqual(await settled(nonObject.pending), {
        status: "unavailable",
        reason: "protocol-error",
        detail: "app-server emitted a non-object JSONL message",
      });
      assert.equal(nonObject.server.killed.count, 1);
    }
  });

  await t.test("initialize requires an object result", async () => {
    const { server, pending } = begin();
    server.message({ id: 1, result: null });
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "protocol-error",
      detail: "initialize returned no result object",
    });
    assert.equal(server.killed.count, 1);
  });

  await t.test("RPC errors preserve valid details and type malformed details explicitly", async () => {
    const cases = [
      {
        error: { code: -32_000, message: "not logged in" },
        detail: "app-server RPC -32000: not logged in",
      },
      { error: "refused", detail: "app-server returned an RPC error" },
      { error: { code: "bad", message: 42 }, detail: "app-server RPC unknown: unknown error" },
    ];
    for (const entry of cases) {
      const { server, pending } = begin();
      server.message({ id: 1, error: entry.error });
      assert.deepEqual(await settled(pending), {
        status: "unavailable",
        reason: "rpc-error",
        detail: entry.detail,
      });
      assert.equal(server.ended.count, 1);
      assert.equal(server.killed.count, 1);
    }

    const rateStage = begin();
    initialize(rateStage.server);
    rateStage.server.message({ id: 2, error: { code: 401, message: "login expired" } });
    assert.deepEqual(await settled(rateStage.pending), {
      status: "unavailable",
      reason: "rpc-error",
      detail: "app-server RPC 401: login expired",
    });
    assert.equal(rateStage.server.killed.count, 1);
  });

  await t.test("out-of-phase and wrong-id messages cannot advance the exchange", async () => {
    const { server, pending } = begin();
    server.message(rateLimitResult(emptyRateLimitsResult()));
    assert.equal(server.ended.count, 0, "request id 2 before initialize is ignored");
    assert.equal(server.writes.length, 1);

    initialize(server);
    assert.equal(server.writes.length, 3);
    server.message({ id: 1, result: {} });
    assert.equal(server.writes.length, 3, "a stale initialize response cannot restart the stages");
    server.message({ id: 3, result: emptyRateLimitsResult() });
    assert.equal(server.ended.count, 0, "an unrelated response id cannot complete the read");

    server.message(rateLimitResult(emptyRateLimitsResult()));
    assert.equal(server.ended.count, 1);
    server.exit(0);
    assert.equal((await settled(pending)).status, "available");
  });

  await t.test("a malformed rate-limit payload stops the child", async () => {
    const { server, pending } = begin();
    initialize(server);
    server.message(rateLimitResult({ rateLimitsByLimitId: {} }));
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "invalid-response",
      detail: "account/rateLimits/read did not return a rateLimits object",
    });
    assert.equal(server.ended.count, 1);
    assert.equal(server.killed.count, 1);
  });
});

test("UTF-8 chunks, blank lines, and coalesced protocol messages preserve exact model names", async () => {
  const { server, pending } = begin();
  const wire = [
    "",
    "   ",
    JSON.stringify({ method: "account/rateLimits/updated", params: {} }),
    JSON.stringify({ id: 1, result: { userAgent: "codex_cli_rs/0.145.0" } }),
    JSON.stringify(rateLimitResult({
      rateLimits: { primary: null, secondary: null },
      rateLimitsByLimitId: {
        unicode_model: {
          limitId: "unicode_model",
          limitName: "Mødel",
          primary: { usedPercent: 1, windowDurationMins: 300, resetsAt: 1_800_000_000 },
        },
      },
      rateLimitResetCredits: { availableCount: 0 },
    })),
    "",
  ].join("\n");
  const bytes = Buffer.from(wire, "utf8");
  const multibyte = Buffer.from("ø", "utf8");
  const splitAt = bytes.indexOf(multibyte) + 1;
  assert.ok(splitAt > 0, "the fixture contains a multibyte code point");

  server.stdout(bytes.subarray(0, splitAt));
  assert.deepEqual(writtenMessages(server), [
    { id: 1, method: "initialize", params: { clientInfo: { name: "storytree", version: "0.0.0" } } },
    { method: "initialized" },
    { id: 2, method: "account/rateLimits/read", params: null },
  ]);
  server.stdout(bytes.subarray(splitAt));
  server.exit(0);

  const result = await settled(pending);
  assert.equal(result.status, "available");
  if (result.status !== "available" || result.rateLimitsByLimitId.status !== "available") return;
  const model = result.rateLimitsByLimitId.value["unicode_model"];
  assert.equal(model?.status, "available");
  if (model?.status !== "available") return;
  assert.deepEqual(model.limitName, { status: "available", value: "Mødel" });
});

test("a parsed snapshot is published only after a clean app-server exit", async () => {
  for (const [code, signal, detail] of [
    [7, null, "app-server exited before the rate-limit response (code=7, signal=none)"],
    [0, "SIGTERM", "app-server exited before the rate-limit response (code=0, signal=SIGTERM)"],
  ] as const) {
    const { server, pending } = begin();
    initialize(server);
    server.message(rateLimitResult(emptyRateLimitsResult()));
    assert.equal(server.ended.count, 1);
    server.exit(code, signal);
    assert.deepEqual(await settled(pending), {
      status: "unavailable",
      reason: "process-exited",
      detail,
    });
    assert.equal(server.ended.count, 1, "an exit event does not close stdin twice");
    assert.equal(server.killed.count, 0, "an already-exited child is not killed");
  }
});

test("the injected clock bounds the whole staged exchange and kills the child once", async () => {
  const server = fakeAppServer();
  const clock = fakeClock();
  const pending = readCodexRateLimitSnapshot({
    cwd: process.cwd(),
    spawn: server.spawn,
    clock: clock.clock,
  });

  clock.fire();
  assert.deepEqual(await settled(pending), { status: "unavailable", reason: "timed-out" });
  assert.equal(server.ended.count, 1);
  assert.equal(server.killed.count, 1);
  assert.equal(clock.cleared.length, 1);

  server.exit(0);
  server.error(new Error("late error"));
  server.stdout("{late malformed output}\n");
  assert.equal(server.ended.count, 1, "late events cannot re-run end cleanup");
  assert.equal(server.killed.count, 1, "late child events cannot re-run cleanup");
});
