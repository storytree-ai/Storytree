import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ClaimDocT } from "@storytree/notice-board";
import type { ClaimAuditEvent } from "@storytree/notice-board/store";
import {
  FileMintboxSupervisorAdapter,
  mintboxSupervisorTransitionQueueSize,
  type MintboxClaimLedgerReader,
  type MintboxCoordinatorCommand,
  type MintboxHandleProbe,
  type MintboxRendererClaimIdentity,
  type MintboxSupervisorEnvelope,
  type MintboxSupervisorRuntime,
} from "./mintbox-supervisor-adapter.js";
import {
  MINTBOX_COORDINATOR_DIGEST_MAX_BYTES,
  MINTBOX_DIGEST_LIST_LIMIT,
  MINTBOX_DIGEST_TEXT_LIMIT,
  type MintboxDetachedHandle,
  type MintboxSupervisorEvent,
  type MintboxWakeRequest,
} from "./mintbox-supervisor.js";

const facts = { ready3dLanes: ["canopy"], blocked3dLanes: ["shadows"], parallelSessionCount: 1 };
const event: MintboxSupervisorEvent = {
  kind: "completion",
  subject: "terrain",
  deliveryId: "delivery-72",
  occurredAt: "2026-09-16T01:00:00.000Z",
  summary: "terrain landed green",
};
const command: MintboxCoordinatorCommand = {
  executable: "codex",
  args: ["exec", "--model", "gpt-6-astra"],
};

interface CoordinatorRegistry {
  readonly handles: Map<string, MintboxDetachedHandle>;
  spawnCount: number;
}

class RecordingRuntime implements MintboxSupervisorRuntime {
  readonly ensureCalls: Array<{ readonly id: string; readonly wake: MintboxWakeRequest; readonly command: MintboxCoordinatorCommand }> = [];
  readonly probeCalls: MintboxDetachedHandle[] = [];
  readonly probes = new Map<string, MintboxHandleProbe>();
  failBeforeSpawn = false;
  afterEnsure: ((id: string) => Promise<void>) | undefined;

  constructor(private readonly registry: CoordinatorRegistry = { handles: new Map(), spawnCount: 0 }) {}

  async ensureCoordinator(id: string, wake: MintboxWakeRequest, coordinatorCommand: MintboxCoordinatorCommand): Promise<MintboxDetachedHandle> {
    this.ensureCalls.push({ id, wake, command: coordinatorCommand });
    if (this.failBeforeSpawn) throw new Error("simulated crash before launch");
    let handle = this.registry.handles.get(id);
    if (handle === undefined) {
      this.registry.spawnCount += 1;
      const baseHandle: MintboxDetachedHandle = {
        id,
        role: "coordinator",
        pid: 4_000 + this.registry.spawnCount,
        host: "mintbox",
        detached: true,
        startedAt: new Date(wake.digest.event.occurredAt).toISOString(),
        health: "running",
        model: wake.model,
        effort: wake.effort,
      };
      handle = wake.architecture ? { ...baseHandle, architecture: true } : baseHandle;
      this.registry.handles.set(id, handle);
    }
    if (this.afterEnsure !== undefined) await this.afterEnsure(id);
    return handle;
  }

  async probeHandle(handle: MintboxDetachedHandle): Promise<MintboxHandleProbe> {
    this.probeCalls.push(handle);
    return this.probes.get(handle.id) ?? "unknown";
  }
}

async function fixture(t: { after(callback: () => Promise<void>): void }): Promise<{ readonly root: string; readonly statePath: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mintbox-supervisor-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, statePath: path.join(root, "supervisor.json") };
}

function adapter(statePath: string, runtime: MintboxSupervisorRuntime): FileMintboxSupervisorAdapter {
  return new FileMintboxSupervisorAdapter({ statePath, coordinatorCommand: command, initialFacts: facts, runtime });
}

function adapterWithRendererClaim(
  statePath: string,
  runtime: MintboxSupervisorRuntime,
  claimLedger: MintboxClaimLedgerReader,
  rendererClaimIdentity: MintboxRendererClaimIdentity,
): FileMintboxSupervisorAdapter {
  return new FileMintboxSupervisorAdapter({
    statePath,
    coordinatorCommand: command,
    initialFacts: facts,
    runtime,
    claimLedger,
    rendererClaimIdentity,
  });
}

class RecordingClaimLedger implements MintboxClaimLedgerReader {
  readonly claimReads: string[] = [];
  readonly historyReads: string[] = [];
  released = false;
  claims: ClaimDocT[] | undefined;
  releaseEvents: ClaimAuditEvent[] | undefined;

  async claimsFor(unitId: string): Promise<ClaimDocT[]> {
    this.claimReads.push(unitId);
    if (this.claims !== undefined) return this.claims;
    return this.released ? [] : [{
      unitId,
      sessionId: "renderer-proof-session",
      branch: "proof/renderer",
      intent: "active rendering proof",
      grade: "work",
      claimedAt: "2026-09-16T00:00:00.000Z",
      heartbeatAt: "2026-09-16T00:00:00.000Z",
    }];
  }

  async history(unitId: string): Promise<ClaimAuditEvent[]> {
    this.historyReads.push(unitId);
    if (this.releaseEvents !== undefined) return this.releaseEvents;
    if (!this.released) return [];
    return [{
      type: "released",
      sessionId: "renderer-proof-session",
      doc: {
        unitId,
        sessionId: "renderer-proof-session",
        branch: "proof/renderer",
        intent: "active rendering proof",
        grade: "work",
        claimedAt: "2026-09-16T00:00:00.000Z",
        heartbeatAt: "2026-09-16T00:00:00.000Z",
      } satisfies ClaimDocT,
      at: "2026-09-16T02:00:00.000Z",
    }];
  }
}

function rendererClaimDoc(
  identity: MintboxRendererClaimIdentity,
  overrides: Partial<ClaimDocT> = {},
): ClaimDocT {
  return {
    unitId: identity.unitId,
    sessionId: identity.sessionId,
    branch: "proof/renderer",
    intent: "active rendering proof",
    grade: "work",
    claimedAt: identity.claimedAt ?? "2026-09-16T00:00:00.000Z",
    heartbeatAt: identity.claimedAt ?? "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function rendererReleaseEvent(
  identity: MintboxRendererClaimIdentity,
  overrides: Partial<{ type: string; sessionId: string; doc: unknown }> = {},
): ClaimAuditEvent {
  return {
    type: "released",
    sessionId: identity.sessionId,
    doc: rendererClaimDoc(identity),
    at: "2026-09-16T02:00:00.000Z",
    ...overrides,
  } as ClaimAuditEvent;
}

async function readEnvelope(statePath: string): Promise<MintboxSupervisorEnvelope> {
  return JSON.parse(await fs.readFile(statePath, "utf8")) as MintboxSupervisorEnvelope;
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

function mutableClone<T>(value: T): Mutable<T> {
  return structuredClone(value) as Mutable<T>;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string, timeoutMs = 1_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function waitForTransitionEntry(
  entered: Promise<void>,
  transition: Promise<unknown>,
  label: string,
): Promise<void> {
  const outcome = await bounded(Promise.race([
    entered.then(() => ({ kind: "entered" as const })),
    transition.then(
      () => ({ kind: "settled" as const }),
      (error: unknown) => ({ kind: "rejected" as const, error }),
    ),
  ]), label);
  if (outcome.kind === "rejected") throw outcome.error;
  if (outcome.kind === "settled") throw new Error(`${label} settled before entering the runtime`);
}

async function assertInvalidEnvelope(
  statePath: string,
  envelope: unknown,
  expectedIssue?: string,
): Promise<Error> {
  await fs.writeFile(statePath, `${JSON.stringify(envelope)}\n`, "utf8");
  let caught: unknown;
  try {
    await adapter(statePath, new RecordingRuntime()).recover();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error, "invalid durable state must reject");
  assert.equal(caught.message, "Invalid Mintbox supervisor durable state");
  const cause = caught.cause as { readonly issues?: readonly { readonly message?: string }[] } | undefined;
  assert.ok(cause !== undefined, "invalid durable state retains its diagnostic cause");
  if (expectedIssue !== undefined) {
    assert.ok(cause.issues?.some((issue) => issue.message === expectedIssue), `missing Zod issue: ${expectedIssue}`);
  }
  return caught;
}

async function createPopulatedEnvelope(statePath: string): Promise<MintboxSupervisorEnvelope> {
  const runtime = new RecordingRuntime();
  const supervisor = adapter(statePath, runtime);
  await supervisor.observeProtectedRenderer({
    id: "renderer-proof", role: "renderer", pid: 51, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  });
  await supervisor.recordHandle({
    id: "worker-canopy", role: "worker", pid: 52, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:01:00.000Z", health: "running", model: "gpt-5.6-terra", effort: "high", lane: "canopy",
  });
  return supervisor.handleEvent(event);
}

async function createPendingEnvelope(statePath: string): Promise<MintboxSupervisorEnvelope> {
  const runtime = new RecordingRuntime();
  runtime.failBeforeSpawn = true;
  await assert.rejects(adapter(statePath, runtime).handleEvent(event), /simulated crash before launch/);
  return readEnvelope(statePath);
}

function digestAtByteSize(template: MintboxWakeRequest["digest"], targetBytes: number): Mutable<MintboxWakeRequest["digest"]> {
  const digest = mutableClone(template);
  digest.event.subject = "a";
  digest.event.summary = "";
  digest.workers = Array.from({ length: MINTBOX_DIGEST_LIST_LIMIT }, (_, index) => ({
    id: `w${index}`,
    health: "running" as const,
    model: "a",
    effort: "a",
    lane: "a",
  }));
  digest.renderer = { id: "a", health: "unknown", blocker: "a" };
  digest.ready3dLanes = Array.from({ length: MINTBOX_DIGEST_LIST_LIMIT }, () => "");
  digest.blocked3dLanes = Array.from({ length: MINTBOX_DIGEST_LIST_LIMIT }, () => "");
  digest.lastOutcome = "a";
  const slots: Array<{ get(): string; set(value: string): void }> = [
    { get: () => digest.event.subject, set: (value) => { digest.event.subject = value; } },
    { get: () => digest.event.summary ?? "", set: (value) => { digest.event.summary = value; } },
    ...digest.workers.flatMap((worker) => [
      { get: () => worker.id, set: (value: string) => { worker.id = value; } },
      { get: () => worker.model, set: (value: string) => { worker.model = value; } },
      { get: () => worker.effort, set: (value: string) => { worker.effort = value; } },
      { get: () => worker.lane ?? "", set: (value: string) => { worker.lane = value; } },
    ]),
    { get: () => digest.renderer.id ?? "", set: (value) => { digest.renderer.id = value; } },
    { get: () => digest.renderer.blocker ?? "", set: (value) => { digest.renderer.blocker = value; } },
    ...digest.ready3dLanes.map((_lane, index) => ({
      get: () => digest.ready3dLanes[index]!,
      set: (value: string) => { digest.ready3dLanes[index] = value; },
    })),
    ...digest.blocked3dLanes.map((_lane, index) => ({
      get: () => digest.blocked3dLanes[index]!,
      set: (value: string) => { digest.blocked3dLanes[index] = value; },
    })),
    { get: () => digest.lastOutcome ?? "", set: (value) => { digest.lastOutcome = value; } },
  ];
  let size = Buffer.byteLength(JSON.stringify(digest), "utf8");
  assert.ok(size < targetBytes);
  for (const slot of slots) {
    let value = slot.get();
    while (size + 6 <= targetBytes && value.length < MINTBOX_DIGEST_TEXT_LIMIT) {
      value += "\0";
      size += 6;
    }
    slot.set(value);
    if (size === targetBytes) break;
  }
  if (size < targetBytes) {
    const slot = slots.find((candidate) => candidate.get().length + targetBytes - size <= MINTBOX_DIGEST_TEXT_LIMIT);
    assert.ok(slot !== undefined, "a bounded digest slot can absorb the final byte delta");
    slot.set(`${slot.get()}${"a".repeat(targetBytes - size)}`);
  }
  assert.equal(Buffer.byteLength(JSON.stringify(digest), "utf8"), targetBytes);
  return digest;
}

test("constructor rejects blank paths, commands, and non-string arguments with exact diagnostics", () => {
  const runtime = new RecordingRuntime();
  const invalidArguments = ["exec"];
  Reflect.set(invalidArguments, 1, 7);
  const make = (overrides: Partial<ConstructorParameters<typeof FileMintboxSupervisorAdapter>[0]>) => () => new FileMintboxSupervisorAdapter({
    statePath: "supervisor.json",
    coordinatorCommand: command,
    initialFacts: facts,
    runtime,
    ...overrides,
  });
  assert.throws(make({ statePath: " \t " }), { message: "Mintbox supervisor statePath is required" });
  assert.throws(make({ coordinatorCommand: { executable: " \n", args: [] } }), { message: "Mintbox coordinator executable is required" });
  assert.throws(make({
    coordinatorCommand: { executable: "codex", args: invalidArguments },
  }), { message: "Mintbox coordinator arguments must be strings" });
});

test("constructor snapshots commands with and without an explicit working directory", async (t) => {
  const { root } = await fixture(t);
  const noCwdRuntime = new RecordingRuntime();
  await adapter(path.join(root, "without-cwd.json"), noCwdRuntime).handleEvent(event);
  assert.equal(Object.hasOwn(noCwdRuntime.ensureCalls[0]!.command, "cwd"), false);
  assert.deepEqual(noCwdRuntime.ensureCalls[0]!.command, command);

  const mutableArgs = ["exec", "--model", "gpt-6-astra"];
  const withCwdRuntime = new RecordingRuntime();
  const withCwd = new FileMintboxSupervisorAdapter({
    statePath: path.join(root, "with-cwd.json"),
    coordinatorCommand: { executable: "codex", args: mutableArgs, cwd: root },
    initialFacts: facts,
    runtime: withCwdRuntime,
  });
  mutableArgs[0] = "mutated-after-construction";
  await withCwd.handleEvent({ ...event, deliveryId: "with-cwd" });
  assert.deepEqual(withCwdRuntime.ensureCalls[0]!.command, {
    executable: "codex",
    args: ["exec", "--model", "gpt-6-astra"],
    cwd: root,
  });
});

test("a durable pending wake is awaited before action and a persistence failure performs no action", async (t) => {
  const { root, statePath } = await fixture(t);
  const runtime = new RecordingRuntime();
  runtime.failBeforeSpawn = true;
  await assert.rejects(adapter(statePath, runtime).handleEvent(event), /simulated crash before launch/);
  const persisted = await readEnvelope(statePath);
  assert.equal(persisted.pendingWake?.id, "mintbox-coordinator:completion:terrain:delivery-72");
  assert.deepEqual(persisted.state.wakeKeys, ["completion:terrain:delivery-72"]);
  assert.equal(runtime.ensureCalls.length, 1, "the action observes the already-persisted pending intent");

  const blockedParent = path.join(root, "not-a-directory");
  await fs.writeFile(blockedParent, "blocks durable state", "utf8");
  const noActionRuntime = new RecordingRuntime();
  await assert.rejects(adapter(path.join(blockedParent, "state.json"), noActionRuntime).handleEvent(event));
  assert.equal(noActionRuntime.ensureCalls.length, 0);
});

test("a fresh instance drains a pre-launch pending wake exactly once", async (t) => {
  const { statePath } = await fixture(t);
  const registry: CoordinatorRegistry = { handles: new Map(), spawnCount: 0 };
  const crashedRuntime = new RecordingRuntime(registry);
  crashedRuntime.failBeforeSpawn = true;
  await assert.rejects(adapter(statePath, crashedRuntime).handleEvent(event), /simulated crash before launch/);

  const recoveryRuntime = new RecordingRuntime(registry);
  const recovered = await adapter(statePath, recoveryRuntime).recover();
  assert.equal(registry.spawnCount, 1);
  assert.equal(recoveryRuntime.ensureCalls.length, 1);
  assert.equal(recovered.pendingWake, null);
  assert.equal(recovered.state.handles.at(-1)?.id, "mintbox-coordinator:completion:terrain:delivery-72");
  await adapter(statePath, recoveryRuntime).handleEvent(event);
  assert.equal(registry.spawnCount, 1, "replayed delivery remains deduplicated after recovery");
});

test("fresh recovery creates one newline-terminated state file and unchanged recovery does not rewrite it", async (t) => {
  const { statePath } = await fixture(t);
  const runtime = new RecordingRuntime();
  const supervisor = adapter(statePath, runtime);
  const fresh = await supervisor.recover();
  assert.deepEqual(fresh.state.handles, []);
  assert.equal((await fs.readFile(statePath, "utf8")).endsWith("\n"), true);
  await delay(20);
  const before = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  await supervisor.recover();
  const after = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  assert.equal(after, before, "loading unchanged state performs no atomic rewrite");
  await delay(0);
  assert.equal(mintboxSupervisorTransitionQueueSize(), 0);
});

test("recording an identical handle is a durable no-op", async (t) => {
  const { statePath } = await fixture(t);
  const supervisor = adapter(statePath, new RecordingRuntime());
  const worker: MintboxDetachedHandle = {
    id: "worker-no-op", role: "worker", pid: 54, host: "mintbox", detached: true,
    startedAt: event.occurredAt, health: "running", model: "gpt-5.6-terra", effort: "high",
  };
  await supervisor.recordHandle(worker);
  await delay(20);
  const before = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  const repeated = await supervisor.recordHandle(worker);
  const after = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  assert.equal(after, before);
  assert.equal(repeated.state.handles.length, 1);
});

test("three overlapping transitions retain one queue until the final flight settles, then clean it", async (t) => {
  const { statePath } = await fixture(t);
  const entered = [deferred(), deferred()];
  const releases = [deferred(), deferred()];
  const transitions: Promise<unknown>[] = [];
  let ensureIndex = 0;
  const runtime = new RecordingRuntime();
  runtime.afterEnsure = async () => {
    const index = ensureIndex++;
    if (index < 2) {
      entered[index]!.resolve();
      await releases[index]!.promise;
    }
  };
  const supervisor = adapter(statePath, runtime);
  let queueAfterSecondStarted: number | undefined;
  let queueWhileSecondHeld: number | undefined;
  let queueAfterAllSettled: number | undefined;
  let operationError: unknown;
  let cleanupError: unknown;
  try {
    const first = Promise.resolve(supervisor.handleEvent({ ...event, deliveryId: "queue-first" }));
    transitions.push(first);
    await waitForTransitionEntry(entered[0]!.promise, first, "first transition entry");
    const second = Promise.resolve(supervisor.handleEvent({ ...event, deliveryId: "queue-second" }));
    transitions.push(second);
    queueAfterSecondStarted = mintboxSupervisorTransitionQueueSize();
    releases[0]!.resolve();
    await bounded(first, "first transition completion");
    await waitForTransitionEntry(entered[1]!.promise, second, "second transition entry");
    queueWhileSecondHeld = mintboxSupervisorTransitionQueueSize();
    const third = Promise.resolve(supervisor.handleEvent({ ...event, deliveryId: "queue-third" }));
    transitions.push(third);
    releases[1]!.resolve();
    await bounded(Promise.all(transitions), "three-flight completion");
    await delay(0);
    queueAfterAllSettled = mintboxSupervisorTransitionQueueSize();
  } catch (error) {
    operationError = error;
  } finally {
    releases[0]!.resolve();
    releases[1]!.resolve();
    try {
      await bounded(Promise.allSettled(transitions), "three-flight cleanup", 2_000);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (operationError !== undefined) throw operationError;
  if (cleanupError !== undefined) throw cleanupError;
  assert.equal(queueAfterSecondStarted, 1);
  assert.equal(queueWhileSecondHeld, 1, "the first cleanup cannot delete its queued successor");
  assert.equal(queueAfterAllSettled, 0, "the last settled tail is removed");
});

test("post-launch pre-final-save recovery rediscovers the deterministic coordinator instead of spawning twice", async (t) => {
  const { root, statePath } = await fixture(t);
  const pendingBackup = path.join(root, "pending-backup.json");
  const registry: CoordinatorRegistry = { handles: new Map(), spawnCount: 0 };
  const crashingRuntime = new RecordingRuntime(registry);
  crashingRuntime.afterEnsure = async () => {
    await fs.rename(statePath, pendingBackup);
    await fs.mkdir(statePath);
  };
  await assert.rejects(adapter(statePath, crashingRuntime).handleEvent(event));
  assert.equal(registry.spawnCount, 1);
  assert.equal((await fs.readdir(root)).some((entry) => entry.endsWith(".tmp")), false, "failed atomic rename cleans its sibling temp file");
  await fs.rm(statePath, { recursive: true, force: true });
  await fs.rename(pendingBackup, statePath);

  const recoveryRuntime = new RecordingRuntime(registry);
  const recovered = await adapter(statePath, recoveryRuntime).recover();
  assert.equal(registry.spawnCount, 1, "idempotent ensure returns the coordinator launched before the crash");
  assert.equal(recoveryRuntime.ensureCalls[0]?.id, "mintbox-coordinator:completion:terrain:delivery-72");
  assert.equal(recovered.pendingWake, null);
  assert.equal(recovered.state.handles.filter((handle) => handle.role === "coordinator").length, 1);
});

test("duplicate and concurrent event delivery starts at most one coordinator", async (t) => {
  const { statePath } = await fixture(t);
  const registry: CoordinatorRegistry = { handles: new Map(), spawnCount: 0 };
  const runtime = new RecordingRuntime(registry);
  const supervisor = adapter(statePath, runtime);
  const peer = adapter(statePath, runtime);
  await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? supervisor : peer).handleEvent(event)));
  assert.equal(registry.spawnCount, 1);
  assert.equal(runtime.ensureCalls.length, 1);
  await Promise.all([
    supervisor.handleEvent({ ...event, deliveryId: "concurrent-a" }),
    peer.handleEvent({ ...event, deliveryId: "concurrent-b" }),
  ]);
  assert.equal(registry.spawnCount, 3);
  const persisted = await readEnvelope(statePath);
  assert.deepEqual([...persisted.state.wakeKeys].sort(), [
    "completion:terrain:delivery-72",
    "completion:terrain:concurrent-a",
    "completion:terrain:concurrent-b",
  ].sort());
  assert.deepEqual(
    persisted.state.handles.filter((handle) => handle.role === "coordinator").map((handle) => handle.id).sort(),
    [
      "mintbox-coordinator:completion:terrain:delivery-72",
      "mintbox-coordinator:completion:terrain:concurrent-a",
      "mintbox-coordinator:completion:terrain:concurrent-b",
    ].sort(),
  );
});

test("a fresh adapter acquires the SQLite mutex after the previous holder process exits", async (t) => {
  const { statePath } = await fixture(t);
  const lockPath = `${statePath}.lock.sqlite`;
  const holder = spawnSync(process.execPath, ["-e", [
    'import { DatabaseSync } from "node:sqlite";',
    `const database = new DatabaseSync(${JSON.stringify(lockPath)});`,
    'database.exec("BEGIN IMMEDIATE");',
    "process.exit(0);",
  ].join("\n")], { encoding: "utf8" });
  assert.equal(holder.status, 0, holder.stderr);
  const runtime = new RecordingRuntime();
  const recovered = await adapter(statePath, runtime).handleEvent(event);
  assert.equal(recovered.pendingWake, null);
  assert.equal(runtime.ensureCalls.length, 1);
  assert.ok((await fs.stat(lockPath)).isFile());
});

test("an active cross-process SQLite holder releases into the same bounded-wait lock", async (t) => {
  const { statePath } = await fixture(t);
  const lockPath = `${statePath}.lock.sqlite`;
  const holder = spawn(process.execPath, ["--input-type=module", "-e", [
    'import { DatabaseSync } from "node:sqlite";',
    `const database = new DatabaseSync(${JSON.stringify(lockPath)});`,
    'database.exec("BEGIN IMMEDIATE");',
    'process.stdout.write("locked\\n");',
    'process.on("message", (message) => {',
    '  if (message !== "release") return;',
    "  setTimeout(() => { database.close(); process.disconnect(); }, 150);",
    "});",
  ].join("\n")], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  if (holder.stdout === null || holder.stderr === null) throw new Error("lock holder pipes were not created");
  const holderStdout = holder.stdout;
  const holderStderr = holder.stderr;
  let stderr = "";
  holderStderr.setEncoding("utf8");
  holderStderr.on("data", (chunk: string) => { stderr += chunk; });
  const exited = new Promise<number | null>((resolve, reject) => {
    holder.once("error", reject);
    holder.once("exit", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    holderStdout.setEncoding("utf8");
    holderStdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.includes("locked")) resolve();
    });
    holder.once("exit", (code) => reject(new Error(`lock holder exited early with ${code}: ${output}\n${stderr}`)));
  });
  assert.equal(holder.send("release"), true);
  const startedAt = Date.now();
  let recovered: MintboxSupervisorEnvelope | undefined;
  let recoveryError: unknown;
  try {
    recovered = await adapter(statePath, new RecordingRuntime()).recover();
  } catch (error) {
    recoveryError = error;
  }
  const elapsed = Date.now() - startedAt;
  assert.equal(await exited, 0, stderr);
  if (recoveryError !== undefined) throw recoveryError;
  assert.ok(recovered !== undefined);
  assert.equal(recovered.pendingWake, null);
  assert.ok(elapsed >= 75, "the adapter waited for the active holder instead of bypassing its lock database");
  assert.ok((await fs.stat(lockPath)).isFile());
});

test("a lock database open failure keeps the adapter diagnostic instead of failing in cleanup", async (t) => {
  const { statePath } = await fixture(t);
  const lockPath = `${statePath}.lock.sqlite`;
  await fs.mkdir(lockPath, { recursive: true });
  let caught: unknown;
  try {
    await adapter(statePath, new RecordingRuntime()).recover();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.equal(caught.message, `Unable to acquire Mintbox supervisor lock ${lockPath}`);
  assert.ok(caught.cause instanceof Error);
});

test("every coordinator handle identity mismatch leaves the durable intent pending", async (t) => {
  const { root } = await fixture(t);
  const makeHandle = (id: string, wake: MintboxWakeRequest): MintboxDetachedHandle => {
    const baseHandle = {
      id,
      role: "coordinator",
      pid: 4_099,
      host: "mintbox",
      detached: true,
      startedAt: wake.digest.event.occurredAt,
      health: "running",
      model: wake.model,
      effort: wake.effort,
    } satisfies MintboxDetachedHandle;
    return wake.architecture ? { ...baseHandle, architecture: true } : baseHandle;
  };
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly architecture: boolean;
    readonly alter: (handle: MintboxDetachedHandle) => MintboxDetachedHandle;
  }> = [
    { name: "id", architecture: false, alter: (handle) => ({ ...handle, id: "wrong-id" }) },
    { name: "role", architecture: false, alter: (handle) => ({ ...handle, role: "worker" }) },
    { name: "model", architecture: false, alter: (handle) => ({ ...handle, model: "wrong-model" }) },
    { name: "effort", architecture: true, alter: (handle) => ({ ...handle, effort: "high" }) },
    { name: "missing-architecture", architecture: true, alter: ({ architecture: _architecture, ...handle }) => handle },
    { name: "unexpected-architecture", architecture: false, alter: (handle) => ({ ...handle, architecture: true }) },
  ];
  for (const mismatch of cases) {
    const statePath = path.join(root, `${mismatch.name}.json`);
    const runtime: MintboxSupervisorRuntime = {
      probeHandle: async () => "unknown",
      ensureCoordinator: async (id, wake) => mismatch.alter(makeHandle(id, wake)),
    };
    const deliveryId = `mismatch-${mismatch.name}`;
    const expectedWakeId = `mintbox-coordinator:completion:terrain:${deliveryId}`;
    await assert.rejects(adapter(statePath, runtime).handleEvent({
      ...event,
      deliveryId,
      architecture: mismatch.architecture,
    }), { message: `Mintbox ensureCoordinator returned a handle that does not match wake ${expectedWakeId}` });
    const persisted = await readEnvelope(statePath);
    assert.equal(persisted.pendingWake?.id, expectedWakeId);
    assert.equal(persisted.pendingWake?.architecture, mismatch.architecture);
    assert.equal(persisted.state.handles.some((handle) => handle.role === "coordinator"), false);
  }
});

test("matching high and xhigh coordinator handles are durably accepted", async (t) => {
  const { root } = await fixture(t);
  for (const architecture of [false, true]) {
    const statePath = path.join(root, architecture ? "xhigh.json" : "high.json");
    const runtime = new RecordingRuntime();
    const accepted = await adapter(statePath, runtime).handleEvent({
      ...event,
      deliveryId: architecture ? "accept-xhigh" : "accept-high",
      architecture,
    });
    const coordinator = accepted.state.handles.find((handle) => handle.role === "coordinator");
    assert.equal(coordinator?.effort, architecture ? "xhigh" : "high");
    assert.equal(coordinator?.architecture === true, architecture);
    assert.equal(accepted.pendingWake, null);
  }
});

test("fresh recovery probes persisted handles, refreshes health, and treats unknown renderer liveness as protected", async (t) => {
  const { statePath } = await fixture(t);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 51, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  };
  const worker: MintboxDetachedHandle = {
    id: "worker-canopy", role: "worker", pid: 52, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:01:00.000Z", health: "running", model: "gpt-5.6-terra", effort: "high", lane: "canopy",
  };
  const initialRuntime = new RecordingRuntime();
  const initial = adapter(statePath, initialRuntime);
  await initial.observeProtectedRenderer(renderer);
  await initial.recordHandle(worker);

  const liveRuntime = new RecordingRuntime();
  liveRuntime.probes.set(renderer.id, "running");
  liveRuntime.probes.set(worker.id, "running");
  const live = await adapter(statePath, liveRuntime).recover();
  assert.equal(live.protectedRenderer?.handleId, renderer.id);
  assert.equal(live.state.handles.find((handle) => handle.id === renderer.id)?.pid, renderer.pid);

  const recoveryRuntime = new RecordingRuntime();
  recoveryRuntime.probes.set(renderer.id, "unknown");
  recoveryRuntime.probes.set(worker.id, "finished");
  const recovered = await adapter(statePath, recoveryRuntime).recover();
  assert.deepEqual(recoveryRuntime.probeCalls.map((handle) => handle.id).sort(), [renderer.id, worker.id]);
  assert.equal(recovered.state.handles.find((handle) => handle.id === renderer.id)?.health, "running");
  assert.equal(recovered.state.handles.find((handle) => handle.id === worker.id)?.health, "finished");
  assert.equal(recovered.protectedRenderer?.handleId, renderer.id);
  assert.equal(recovered.state.handles.find((handle) => handle.id === renderer.id)?.pid, renderer.pid);
});

test("reconciliation persists missing handles and updates renderer health only through its two ownership routes", async (t) => {
  const { root } = await fixture(t);
  const seedPath = path.join(root, "seed.json");
  const base = await createPopulatedEnvelope(seedPath);

  const run = async (
    name: string,
    edit: (envelope: Mutable<MintboxSupervisorEnvelope>) => void,
    probe: MintboxHandleProbe,
  ): Promise<MintboxSupervisorEnvelope> => {
    const statePath = path.join(root, `${name}.json`);
    const envelope = mutableClone(base);
    edit(envelope);
    await fs.writeFile(statePath, `${JSON.stringify(envelope)}\n`, "utf8");
    const runtime = new RecordingRuntime();
    runtime.probes.set("renderer-proof", probe);
    const recovered = await adapter(statePath, runtime).recover();
    assert.deepEqual(await readEnvelope(statePath), recovered, "reconciled health is durable");
    return recovered;
  };

  const workerMissingPath = path.join(root, "worker-missing.json");
  await fs.writeFile(workerMissingPath, `${JSON.stringify(base)}\n`, "utf8");
  const workerRuntime = new RecordingRuntime();
  workerRuntime.probes.set("worker-canopy", "missing");
  const workerMissing = await adapter(workerMissingPath, workerRuntime).recover();
  assert.equal(workerMissing.state.handles.find((handle) => handle.id === "worker-canopy")?.health, "failed");
  assert.equal(workerMissing.state.facts.rendererHealth, "running");
  assert.deepEqual(await readEnvelope(workerMissingPath), workerMissing);

  const workerCollisionPath = path.join(root, "worker-renderer-facts-collision.json");
  const workerCollisionEnvelope = mutableClone(base);
  workerCollisionEnvelope.state.facts.rendererId = "worker-canopy";
  workerCollisionEnvelope.state.facts.rendererHealth = "running";
  await fs.writeFile(workerCollisionPath, `${JSON.stringify(workerCollisionEnvelope)}\n`, "utf8");
  const workerCollisionRuntime = new RecordingRuntime();
  workerCollisionRuntime.probes.set("worker-canopy", "finished");
  const workerCollision = await adapter(workerCollisionPath, workerCollisionRuntime).recover();
  assert.equal(workerCollision.state.handles.find((handle) => handle.id === "worker-canopy")?.health, "finished");
  assert.equal(workerCollision.state.facts.rendererHealth, "running", "a worker id collision cannot update renderer facts");

  const factOwned = await run("fact-owned", (envelope) => {
    envelope.protectedRenderer = null;
  }, "blocked");
  assert.equal(factOwned.state.facts.rendererHealth, "blocked");

  const protectionOwned = await run("protection-owned", (envelope) => {
    envelope.state.facts.rendererId = "another-renderer";
  }, "finished");
  assert.equal(protectionOwned.state.facts.rendererHealth, "finished");

  const unrelated = await run("unrelated", (envelope) => {
    envelope.protectedRenderer = null;
    envelope.state.facts.rendererId = "another-renderer";
  }, "failed");
  assert.equal(unrelated.state.handles.find((handle) => handle.id === "renderer-proof")?.health, "failed");
  assert.equal(unrelated.state.facts.rendererHealth, "running");
});

test("renderer remains observe-only through live, unknown, failed, and disappeared observations", async (t) => {
  const { statePath } = await fixture(t);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 61, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  };
  const runtime = new RecordingRuntime();
  const supervisor = adapter(statePath, runtime);
  await assert.rejects(supervisor.observeProtectedRenderer({
    ...renderer,
    id: "not-a-renderer",
    role: "worker",
  }), { message: "A protected Mintbox renderer must have renderer role" });
  await supervisor.observeProtectedRenderer(renderer);
  const repeated = await supervisor.observeProtectedRenderer(renderer);
  assert.equal(repeated.protectedRenderer?.handleId, renderer.id);
  await assert.rejects(supervisor.observeProtectedRenderer({
    ...renderer,
    id: "replacement-renderer",
    pid: 62,
  }), /protected renderer.*cannot be replaced/i);
  assert.equal((await readEnvelope(statePath)).protectedRenderer?.handleId, renderer.id);

  const noEvidence = await supervisor.handleEvent({ ...event, deliveryId: "protected-no-evidence" });
  assert.deepEqual(noEvidence.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "held" });
  const otherRenderer = await supervisor.handleEvent({
    ...event,
    deliveryId: "protected-other-renderer",
    rendererEvidence: { rendererId: "some-other-renderer", terminal: "failure", claim: "released" },
  });
  assert.deepEqual(otherRenderer.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "held" });

  for (const [n, rendererEvidence] of [
    { rendererId: renderer.id, terminal: "failure", claim: "released" },
    { rendererId: renderer.id, terminal: "disappeared", claim: "released" },
    { rendererId: renderer.id, terminal: "green", claim: "held" },
  ].entries()) {
    const result = await supervisor.handleEvent({ ...event, deliveryId: `protected-${n}`, rendererEvidence } as MintboxSupervisorEvent);
    assert.equal(result.protectedRenderer?.handleId, renderer.id);
    assert.equal(result.protectedRenderer?.terminal, rendererEvidence.terminal);
    assert.equal(result.protectedRenderer?.claim, rendererEvidence.claim);
    assert.equal(result.state.handles.find((handle) => handle.id === renderer.id)?.pid, renderer.pid);
    assert.deepEqual(runtime.ensureCalls.at(-1)?.wake.digest.event.rendererEvidence, rendererEvidence);
  }
  const ensureCount = runtime.ensureCalls.length;
  const replayedWithAlteredEvidence = await supervisor.handleEvent({
    ...event,
    deliveryId: "protected-0",
    rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
  });
  assert.equal(replayedWithAlteredEvidence.protectedRenderer?.handleId, renderer.id);
  assert.equal(runtime.ensureCalls.length, ensureCount, "a replay cannot change evidence or create another wake");
  const released = await supervisor.handleEvent({
    ...event,
    deliveryId: "protected-release",
    rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
  });
  assert.equal(released.protectedRenderer, null);
  assert.equal(released.state.handles.find((handle) => handle.id === renderer.id)?.pid, renderer.pid);
  assert.deepEqual(runtime.ensureCalls.at(-1)?.wake.digest.event.rendererEvidence, {
    rendererId: renderer.id,
    terminal: "green",
    claim: "released",
  });
});

test("mintbox-active-proof-is-observe-only: recovery observes the live renderer claim without changing its handle", async (t) => {
  const { statePath } = await fixture(t);
  const ledger = new RecordingClaimLedger();
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session" };
  const runtime = new RecordingRuntime();
  const supervisor = adapterWithRendererClaim(statePath, runtime, ledger, identity);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 71, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  };
  await supervisor.observeProtectedRenderer(renderer);

  const recovered = await supervisor.recover();

  assert.deepEqual(ledger.claimReads, [identity.unitId], "recovery observes the renderer claim through the notice-board reader");
  assert.deepEqual(ledger.historyReads, [], "a matching live row does not consult released-claim history");
  assert.deepEqual(recovered.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "held" });
  assert.deepEqual(recovered.state.handles.find((handle) => handle.id === renderer.id), renderer);
  assert.equal(runtime.ensureCalls.length, 0, "observation does not replace the protected renderer with a coordinator");
});

test("mintbox-green-release-is-the-adoption-boundary: a fresh coordinator adopts only after green and released claim evidence", async (t) => {
  const { statePath } = await fixture(t);
  const ledger = new RecordingClaimLedger();
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session" };
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 72, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  };
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  await supervisor.observeProtectedRenderer(renderer);

  const greenWhileClaimed = await supervisor.handleEvent({
    ...event,
    deliveryId: "renderer-green-before-claim-release",
    rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
  });
  assert.deepEqual(greenWhileClaimed.protectedRenderer, { handleId: renderer.id, terminal: "green", claim: "held" });

  ledger.released = true;
  const freshCoordinator = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  const eligible = await freshCoordinator.recover();

  assert.equal(eligible.protectedRenderer, null, "the fresh coordinator sees the lane only after the ledger confirms release");
  assert.deepEqual(ledger.claimReads, [identity.unitId, identity.unitId]);
});

test("mintbox-active-proof-is-observe-only: an absent live row without a released audit event keeps the active proof held", async (t) => {
  const { statePath } = await fixture(t);
  const ledger = new RecordingClaimLedger();
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session" };
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 73, host: "mintbox", detached: true,
    startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
  };
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  await supervisor.observeProtectedRenderer(renderer);
  ledger.released = true;
  ledger.releaseEvents = [];

  const recovered = await supervisor.recover();

  assert.deepEqual(recovered.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "held" });
  assert.deepEqual(recovered.state.handles.find((handle) => handle.id === renderer.id), renderer);
  assert.deepEqual(ledger.historyReads, [identity.unitId]);
});

test("mintbox-green-release-is-the-adoption-boundary: a release for another claim incarnation cannot make a green proof eligible", async (t) => {
  const { statePath } = await fixture(t);
  const ledger = new RecordingClaimLedger();
  const claimedAt = "2026-09-16T00:00:00.000Z";
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session", claimedAt };
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 74, host: "mintbox", detached: true,
    startedAt: claimedAt, health: "running", model: "renderer-runtime", effort: "n/a",
  };
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  await supervisor.observeProtectedRenderer(renderer);
  await supervisor.handleEvent({
    ...event,
    deliveryId: "renderer-green-without-matching-release",
    rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
  });
  ledger.released = true;
  ledger.releaseEvents = [{
    type: "released",
    sessionId: identity.sessionId,
    doc: {
      unitId: identity.unitId,
      sessionId: identity.sessionId,
      branch: "proof/renderer",
      intent: "active rendering proof",
      grade: "work",
      claimedAt: "2026-09-16T00:01:00.000Z",
      heartbeatAt: "2026-09-16T00:01:00.000Z",
    } satisfies ClaimDocT,
    at: "2026-09-16T02:00:00.000Z",
  }];

  const recovered = await adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity).recover();

  assert.deepEqual(recovered.protectedRenderer, { handleId: renderer.id, terminal: "green", claim: "held" });
  assert.deepEqual(ledger.historyReads, [identity.unitId]);
});

test("half-configured claim verification preserves legacy release behavior", async (t) => {
  const { root } = await fixture(t);
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session" };
  const ledger = new RecordingClaimLedger();
  for (const variant of [
    { name: "ledger-only", options: { claimLedger: ledger } },
    { name: "identity-only", options: { rendererClaimIdentity: identity } },
  ] as const) {
    const statePath = path.join(root, `${variant.name}.json`);
    const renderer: MintboxDetachedHandle = {
      id: "renderer-proof", role: "renderer", pid: 75, host: "mintbox", detached: true,
      startedAt: "2026-09-16T00:00:00.000Z", health: "running", model: "renderer-runtime", effort: "n/a",
    };
    await adapter(statePath, new RecordingRuntime()).observeProtectedRenderer(renderer);
    const partial = new FileMintboxSupervisorAdapter({
      statePath,
      coordinatorCommand: command,
      initialFacts: facts,
      runtime: new RecordingRuntime(),
      ...variant.options,
    });

    const released = await partial.handleEvent({
      ...event,
      deliveryId: `half-configured-${variant.name}`,
      rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
    });

    assert.equal(released.protectedRenderer, null, `${variant.name} must not pretend ledger verification is configured`);
  }
});

test("claim reconciliation durably marks release, reacquires the exact live claim, and no-ops repeated states", async (t) => {
  const { statePath } = await fixture(t);
  const claimedAt = "2026-09-16T00:00:00.000Z";
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session", claimedAt };
  const ledger = new RecordingClaimLedger();
  ledger.claims = [];
  ledger.releaseEvents = [rendererReleaseEvent(identity)];
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 76, host: "mintbox", detached: true,
    startedAt: claimedAt, health: "running", model: "renderer-runtime", effort: "n/a",
  };
  await supervisor.observeProtectedRenderer(renderer);

  const released = await supervisor.recover();
  assert.deepEqual(released.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "released" });
  assert.deepEqual(await readEnvelope(statePath), released, "the verified release transition is durable");
  await delay(30);
  const beforeRepeatedRelease = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  const repeatedRelease = await supervisor.recover();
  const afterRepeatedRelease = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  assert.deepEqual(repeatedRelease.protectedRenderer, released.protectedRenderer);
  assert.equal(afterRepeatedRelease, beforeRepeatedRelease, "an already released protection is not rewritten");

  ledger.claims = [rendererClaimDoc(identity)];
  ledger.releaseEvents = [];
  const reacquired = await supervisor.recover();
  assert.deepEqual(reacquired.protectedRenderer, { handleId: renderer.id, terminal: "active", claim: "held" });
  assert.deepEqual(await readEnvelope(statePath), reacquired, "the exact live incarnation restores held protection");
  await delay(30);
  const beforeRepeatedHeld = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  const repeatedHeld = await supervisor.recover();
  const afterRepeatedHeld = (await fs.stat(statePath, { bigint: true })).mtimeNs;
  assert.deepEqual(repeatedHeld.protectedRenderer, reacquired.protectedRenderer);
  assert.equal(afterRepeatedHeld, beforeRepeatedHeld, "an already held protection is not rewritten");
  assert.deepEqual(ledger.historyReads, [identity.unitId, identity.unitId]);
});

test("live claim reconciliation requires the exact session and incarnation", async (t) => {
  const { statePath } = await fixture(t);
  const claimedAt = "2026-09-16T00:00:00.000Z";
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session", claimedAt };
  const ledger = new RecordingClaimLedger();
  ledger.claims = [];
  ledger.releaseEvents = [rendererReleaseEvent(identity)];
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 77, host: "mintbox", detached: true,
    startedAt: claimedAt, health: "running", model: "renderer-runtime", effort: "n/a",
  };
  await supervisor.observeProtectedRenderer(renderer);
  assert.equal((await supervisor.recover()).protectedRenderer?.claim, "released");
  ledger.releaseEvents = [];

  for (const [name, claim] of [
    ["wrong-session", rendererClaimDoc(identity, { sessionId: "another-renderer-session" })],
    ["wrong-incarnation", rendererClaimDoc(identity, { claimedAt: "2026-09-16T00:01:00.000Z" })],
  ] as const) {
    ledger.claims = [claim];
    const reconciled = await supervisor.recover();
    assert.deepEqual(
      reconciled.protectedRenderer,
      { handleId: renderer.id, terminal: "active", claim: "released" },
      `${name} cannot reacquire the protected renderer`,
    );
  }
});

test("released history requires a valid event and exact unit, session, and incarnation", async (t) => {
  const { root } = await fixture(t);
  const claimedAt = "2026-09-16T00:00:00.000Z";
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session", claimedAt };
  const invalidEvents = [
    ["wrong-type", rendererReleaseEvent(identity, { type: "claimed" })],
    ["wrong-event-session", rendererReleaseEvent(identity, { sessionId: "another-renderer-session" })],
    ["missing-doc", rendererReleaseEvent(identity, { doc: undefined })],
    ["null-doc", rendererReleaseEvent(identity, { doc: null })],
    ["wrong-unit", rendererReleaseEvent(identity, { doc: rendererClaimDoc(identity, { unitId: "another-rendering-proof" }) })],
    ["wrong-doc-session", rendererReleaseEvent(identity, { doc: rendererClaimDoc(identity, { sessionId: "another-renderer-session" }) })],
    ["wrong-incarnation", rendererReleaseEvent(identity, { doc: rendererClaimDoc(identity, { claimedAt: "2026-09-16T00:01:00.000Z" }) })],
  ] as const;

  for (const [name, invalidEvent] of invalidEvents) {
    const statePath = path.join(root, `${name}.json`);
    const ledger = new RecordingClaimLedger();
    const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
    const renderer: MintboxDetachedHandle = {
      id: "renderer-proof", role: "renderer", pid: 78, host: "mintbox", detached: true,
      startedAt: claimedAt, health: "running", model: "renderer-runtime", effort: "n/a",
    };
    await supervisor.observeProtectedRenderer(renderer);
    await supervisor.handleEvent({
      ...event,
      deliveryId: `green-before-invalid-release-${name}`,
      rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
    });
    ledger.claims = [];
    ledger.releaseEvents = [invalidEvent];

    const recovered = await supervisor.recover();

    assert.deepEqual(
      recovered.protectedRenderer,
      { handleId: renderer.id, terminal: "green", claim: "held" },
      `${name} is not release evidence for this protected renderer`,
    );
  }
});

test("a verified release arriving before green makes the later green event adoptable", async (t) => {
  const { statePath } = await fixture(t);
  const claimedAt = "2026-09-16T00:00:00.000Z";
  const identity = { unitId: "rendering-engine-proof", sessionId: "renderer-proof-session", claimedAt };
  const ledger = new RecordingClaimLedger();
  ledger.claims = [];
  ledger.releaseEvents = [rendererReleaseEvent(identity)];
  const supervisor = adapterWithRendererClaim(statePath, new RecordingRuntime(), ledger, identity);
  const renderer: MintboxDetachedHandle = {
    id: "renderer-proof", role: "renderer", pid: 79, host: "mintbox", detached: true,
    startedAt: claimedAt, health: "running", model: "renderer-runtime", effort: "n/a",
  };
  await supervisor.observeProtectedRenderer(renderer);
  assert.deepEqual(
    (await supervisor.recover()).protectedRenderer,
    { handleId: renderer.id, terminal: "active", claim: "released" },
  );

  const eligible = await supervisor.handleEvent({
    ...event,
    deliveryId: "verified-release-before-green",
    rendererEvidence: { rendererId: renderer.id, terminal: "green", claim: "released" },
  });

  assert.equal(eligible.protectedRenderer, null);
});

test("renderer evidence is harmless when no renderer is protected", async (t) => {
  const { statePath } = await fixture(t);
  const runtime = new RecordingRuntime();
  const result = await adapter(statePath, runtime).handleEvent({
    ...event,
    deliveryId: "unprotected-renderer-evidence",
    rendererEvidence: { rendererId: "renderer-proof", terminal: "green", claim: "released" },
  });
  assert.equal(result.protectedRenderer, null);
});

test("corrupt or unsupported durable state fails closed without resetting dedupe", async (t) => {
  const { statePath } = await fixture(t);
  for (const [corrupt, causeKind] of [
    ["{not-json", "syntax"],
    [JSON.stringify({ version: 99, state: {}, pendingWake: null, protectedRenderer: null }), "schema"],
  ] as const) {
    await fs.writeFile(statePath, corrupt, "utf8");
    const runtime = new RecordingRuntime();
    let caught: unknown;
    try {
      await adapter(statePath, runtime).recover();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error);
    assert.equal(caught.message, "Invalid Mintbox supervisor durable state");
    assert.ok(caught.cause instanceof Error);
    if (causeKind === "syntax") assert.ok(caught.cause instanceof SyntaxError);
    else assert.ok("issues" in caught.cause);
    assert.equal(await fs.readFile(statePath, "utf8"), corrupt);
    assert.equal(runtime.ensureCalls.length, 0);
    assert.equal(runtime.probeCalls.length, 0);
  }
});

test("a non-ENOENT state read error fails closed with its original cause", async (t) => {
  const { statePath } = await fixture(t);
  await fs.mkdir(statePath);
  let caught: unknown;
  try {
    await adapter(statePath, new RecordingRuntime()).recover();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.equal(caught.message, "Invalid Mintbox supervisor durable state");
  assert.ok(caught.cause instanceof Error);
  assert.notEqual((caught.cause as NodeJS.ErrnoException).code, "ENOENT");
});

test("a runtime handle outside the durable schema leaves the previously persisted wake intact", async (t) => {
  const { statePath } = await fixture(t);
  let ensureCount = 0;
  const runtime: MintboxSupervisorRuntime = {
    probeHandle: async () => "unknown",
    ensureCoordinator: async (id, wake) => {
      ensureCount += 1;
      const baseHandle = {
        id, role: "coordinator", pid: 4_500, host: "mintbox", detached: true,
        startedAt: wake.digest.event.occurredAt,
        health: "running",
        model: wake.model,
        effort: wake.effort,
      } satisfies MintboxDetachedHandle;
      const handle = wake.architecture
        ? { ...baseHandle, architecture: true as const }
        : baseHandle;
      Reflect.set(handle, "health", "invalid-health");
      return handle;
    },
  };
  await assert.rejects(adapter(statePath, runtime).handleEvent(event), { message: "Invalid Mintbox supervisor durable state" });
  assert.equal(ensureCount, 1);
  const durable = await readEnvelope(statePath);
  assert.equal(durable.pendingWake?.id, "mintbox-coordinator:completion:terrain:delivery-72");
  assert.equal(durable.state.handles.length, 0);
});

test("durable state accepts every supported health, event kind, usage boundary, and coordinator policy", async (t) => {
  const { root } = await fixture(t);
  const base = await createPopulatedEnvelope(path.join(root, "base.json"));
  for (const health of ["running", "finished", "failed", "blocked"] as const) {
    const statePath = path.join(root, `health-${health}.json`);
    const envelope = mutableClone(base);
    envelope.state.handles.find((handle) => handle.id === "worker-canopy")!.health = health;
    await fs.writeFile(statePath, `${JSON.stringify(envelope)}\n`, "utf8");
    assert.equal((await adapter(statePath, new RecordingRuntime()).recover()).state.handles.find(
      (handle) => handle.id === "worker-canopy",
    )?.health, health);
  }
  for (const percentage of [0, 100]) {
    const statePath = path.join(root, `usage-${percentage}.json`);
    const envelope = mutableClone(base);
    envelope.state.lastWeeklyUsagePercent = percentage;
    await fs.writeFile(statePath, `${JSON.stringify(envelope)}\n`, "utf8");
    assert.equal((await adapter(statePath, new RecordingRuntime()).recover()).state.lastWeeklyUsagePercent, percentage);
  }
  const xhighPath = path.join(root, "xhigh-handle.json");
  const xhigh = mutableClone(base);
  const coordinator = xhigh.state.handles.find((handle) => handle.role === "coordinator")!;
  coordinator.effort = "xhigh";
  coordinator.architecture = true;
  await fs.writeFile(xhighPath, `${JSON.stringify(xhigh)}\n`, "utf8");
  assert.equal((await adapter(xhighPath, new RecordingRuntime()).recover()).state.handles.find(
    (handle) => handle.role === "coordinator",
  )?.architecture, true);

  const pending = await createPendingEnvelope(path.join(root, "pending-seed.json"));
  for (const kind of ["completion", "failure", "dependency-release", "empty-ready-worker", "owner-attestation-gate"] as const) {
    const statePath = path.join(root, `kind-${kind}.json`);
    const envelope = mutableClone(pending);
    envelope.pendingWake!.digest.event.kind = kind;
    await fs.writeFile(statePath, `${JSON.stringify(envelope)}\n`, "utf8");
    const runtime = new RecordingRuntime();
    await adapter(statePath, runtime).recover();
    assert.equal(runtime.ensureCalls[0]?.wake.digest.event.kind, kind);
  }
});

test("forged durable envelopes fail closed on every cross-field invariant", async (t) => {
  const { root } = await fixture(t);
  const base = await createPopulatedEnvelope(path.join(root, "valid-base.json"));
  const pending = await createPendingEnvelope(path.join(root, "valid-pending.json"));
  type InvalidCase = {
    readonly name: string;
    readonly source: MintboxSupervisorEnvelope;
    readonly issue?: string;
    readonly edit: (envelope: Mutable<MintboxSupervisorEnvelope>) => void;
  };
  const cases: readonly InvalidCase[] = [
    {
      name: "coordinator-model",
      source: base,
      issue: "invalid coordinator model",
      edit: (envelope) => { envelope.state.handles.find((handle) => handle.role === "coordinator")!.model = "not-astra"; },
    },
    {
      name: "coordinator-effort",
      source: base,
      issue: "invalid coordinator effort",
      edit: (envelope) => { envelope.state.handles.find((handle) => handle.role === "coordinator")!.effort = "medium"; },
    },
    {
      name: "xhigh-without-architecture",
      source: base,
      issue: "xhigh coordinator lacks architecture evidence",
      edit: (envelope) => { envelope.state.handles.find((handle) => handle.role === "coordinator")!.effort = "xhigh"; },
    },
    {
      name: "false-architecture-marker",
      source: base,
      edit: (envelope) => {
        Reflect.set(envelope.state.handles.find((handle) => handle.role === "worker")!, "architecture", false);
      },
    },
    {
      name: "blank-identity",
      source: base,
      edit: (envelope) => { envelope.state.handles.find((handle) => handle.role === "worker")!.host = " \t"; },
    },
    {
      name: "duplicate-handle",
      source: base,
      issue: "duplicate handle id",
      edit: (envelope) => { envelope.state.handles.push(mutableClone(envelope.state.handles[0]!)); },
    },
    {
      name: "duplicate-wake-key",
      source: base,
      issue: "duplicate wake key",
      edit: (envelope) => { envelope.state.wakeKeys.push(envelope.state.wakeKeys[0]!); },
    },
    {
      name: "usage-below-zero",
      source: base,
      edit: (envelope) => { envelope.state.lastWeeklyUsagePercent = -1; },
    },
    {
      name: "usage-above-hundred",
      source: base,
      edit: (envelope) => { envelope.state.lastWeeklyUsagePercent = 101; },
    },
    {
      name: "wake-id",
      source: pending,
      issue: "wake id does not match dedupe key",
      edit: (envelope) => { envelope.pendingWake!.id = "wrong-wake-id"; },
    },
    {
      name: "high-with-architecture",
      source: pending,
      issue: "wake effort does not match architecture evidence",
      edit: (envelope) => { envelope.pendingWake!.architecture = true; },
    },
    {
      name: "xhigh-without-wake-architecture",
      source: pending,
      issue: "wake effort does not match architecture evidence",
      edit: (envelope) => { envelope.pendingWake!.effort = "xhigh"; },
    },
    {
      name: "orphaned-pending-wake",
      source: pending,
      issue: "pending wake lacks persisted dedupe key",
      edit: (envelope) => { envelope.state.wakeKeys = []; },
    },
    {
      name: "unknown-event-kind",
      source: pending,
      edit: (envelope) => { envelope.pendingWake!.digest.event.kind = "" as "completion"; },
    },
    {
      name: "oversized-digest-identity",
      source: pending,
      edit: (envelope) => { envelope.pendingWake!.digest.event.subject = "x".repeat(MINTBOX_DIGEST_TEXT_LIMIT + 1); },
    },
    {
      name: "protected-renderer-missing",
      source: base,
      issue: "protected renderer lacks its durable handle",
      edit: (envelope) => { envelope.protectedRenderer!.handleId = "missing-renderer"; },
    },
    {
      name: "protected-worker",
      source: base,
      issue: "protected renderer lacks its durable handle",
      edit: (envelope) => { envelope.protectedRenderer!.handleId = "worker-canopy"; },
    },
    {
      name: "released-green-renderer",
      source: base,
      issue: "released renderer cannot remain protected",
      edit: (envelope) => {
        envelope.protectedRenderer!.terminal = "green";
        envelope.protectedRenderer!.claim = "released";
      },
    },
  ];
  for (const invalid of cases) {
    const envelope = mutableClone(invalid.source);
    invalid.edit(envelope);
    await assertInvalidEnvelope(path.join(root, `${invalid.name}.json`), envelope, invalid.issue);
  }
});

test("durable digest validation accepts exactly 64 KiB and rejects the next byte", async (t) => {
  const { root } = await fixture(t);
  const pending = await createPendingEnvelope(path.join(root, "byte-seed.json"));
  const exactPath = path.join(root, "exact-limit.json");
  const exact = mutableClone(pending);
  exact.pendingWake!.digest = digestAtByteSize(exact.pendingWake!.digest, MINTBOX_COORDINATOR_DIGEST_MAX_BYTES);
  await fs.writeFile(exactPath, `${JSON.stringify(exact)}\n`, "utf8");
  const runtime = new RecordingRuntime();
  await adapter(exactPath, runtime).recover();
  assert.equal(Buffer.byteLength(JSON.stringify(runtime.ensureCalls[0]!.wake.digest), "utf8"), MINTBOX_COORDINATOR_DIGEST_MAX_BYTES);

  const oversized = mutableClone(pending);
  oversized.pendingWake!.digest = digestAtByteSize(
    oversized.pendingWake!.digest,
    MINTBOX_COORDINATOR_DIGEST_MAX_BYTES + 1,
  );
  await assertInvalidEnvelope(path.join(root, "over-limit.json"), oversized);
});

test("oversized adapter inputs produce a bounded transcript-free wake and preserve the injected command", async (t) => {
  const { statePath } = await fixture(t);
  const long = "界".repeat(500);
  const runtime = new RecordingRuntime();
  const supervisor = new FileMintboxSupervisorAdapter({
    statePath,
    coordinatorCommand: command,
    initialFacts: {
      ready3dLanes: Array.from({ length: 20 }, () => long),
      blocked3dLanes: Array.from({ length: 20 }, () => long),
      parallelSessionCount: 3,
      rendererBlocker: long,
      lastOutcome: long,
    },
    runtime,
  });
  await supervisor.recordHandle({
    id: long, role: "worker", pid: 71, host: "mintbox", detached: true,
    startedAt: event.occurredAt, health: "running", model: long, effort: long, lane: long, outcome: long,
  });
  await supervisor.handleEvent({
    ...event,
    subject: long,
    deliveryId: "oversized",
    occurredAt: `2026-09-16T01:00:00.${"1".repeat(500)}Z`,
    summary: long,
  });
  const call = runtime.ensureCalls[0];
  assert.ok(call);
  assert.deepEqual(call.command, command);
  const serialized = JSON.stringify(call.wake.digest);
  assert.ok(Buffer.byteLength(serialized, "utf8") <= MINTBOX_COORDINATOR_DIGEST_MAX_BYTES);
  assert.equal(serialized.includes('"transcript"'), false);
  assert.equal(call.wake.digest.workers[0]?.id.length, 280);
  assert.equal(call.wake.digest.workers[0]?.model.length, 280);
  assert.equal(call.wake.digest.event.occurredAt, "2026-09-16T01:00:00.111Z");
});
