import assert from "node:assert/strict";
import test from "node:test";

import {
  type AliveProbe,
  type ClassifiedSpawn,
  type SpawnRecord,
  type SpawnRegistryIo,
  registerSpawn,
  spawnRecordPath,
  summarizeOwnership,
} from "./spawn-registry.js";
import {
  type StopMode,
  type StopSpawnDeps,
  resolveStopTargets,
  stopLeftWorkRunning,
  stopSpawn,
  stopSpawns,
} from "./spawn-stop.js";

const ROOT = "/tmp/stop-test-spawns";

function record(pid: number, sessionId = "mine"): SpawnRecord {
  return {
    sessionId,
    branch: `worktree-${sessionId}`,
    pid,
    command: "storytree library artifact edit foo --pg",
    cwd: `/c/code/storytree/.claude/worktrees/${sessionId}`,
    startedAt: "2026-08-14T11:15:00.000Z",
  };
}

function classified(pid: number, sessionId = "mine"): ClassifiedSpawn {
  return { record: record(pid, sessionId), state: "live", ageMs: 60_000 };
}

function memoryIo(): SpawnRegistryIo & { files: Map<string, string> } {
  const files = new Map<string, string>();
  const norm = (p: string) => p.replaceAll("\\", "/");
  return {
    files,
    mkdirp: () => {},
    writeText: (p, text) => {
      files.set(norm(p), text);
    },
    readText: (p) => {
      const text = files.get(norm(p));
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    remove: (p) => {
      files.delete(norm(p));
    },
    listDir: (dir) => {
      const prefix = `${norm(dir)}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const head = key.slice(prefix.length).split("/")[0];
        if (head !== undefined && head.length > 0) names.add(head);
      }
      return [...names];
    },
  };
}

/**
 * A scripted probe: answers in sequence, then repeats its last answer forever. Lets a test say
 * exactly what the OS reported at each rung, which is the only thing the ladder is allowed to
 * conclude from.
 */
function scriptedProbe(...answers: (boolean | "unknown")[]): AliveProbe {
  let i = 0;
  return () => answers[Math.min(i++, answers.length - 1)] ?? false;
}

function deps(over: Partial<StopSpawnDeps> = {}): StopSpawnDeps {
  return {
    terminate: () => true,
    probe: () => false,
    sleep: () => {},
    timing: { gracefulWaitMs: 0, forceWaitMs: 0 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

test("stop: a process that dies on the graceful rung is stopped, and never gets forced", () => {
  const calls: StopMode[] = [];
  const result = stopSpawn(
    classified(4242),
    deps({
      probe: scriptedProbe(true, false),
      terminate: (_pid, mode) => {
        calls.push(mode);
        return true;
      },
    }),
  );
  assert.equal(result.outcome, "stopped");
  assert.equal(result.viaMode, "graceful");
  // Escalation is conditional. A verb that always forces would deny every process its exit handlers,
  // which are what de-register the record and flush whatever it was mid-write on.
  assert.deepEqual(calls, ["graceful"]);
});

test("stop: a process that survives the graceful rung is forced, and the force is verified", () => {
  const calls: StopMode[] = [];
  const result = stopSpawn(
    classified(4242),
    deps({
      probe: scriptedProbe(true, true, false),
      terminate: (_pid, mode) => {
        calls.push(mode);
        return true;
      },
    }),
  );
  assert.equal(result.outcome, "stopped");
  assert.equal(result.viaMode, "force");
  assert.deepEqual(calls, ["graceful", "force"]);
});

test("stop: a process still alive after the force rung is reported STILL RUNNING", () => {
  // THE CASE THE FRICTION ENTRY IS ABOUT. `TaskStop` reports success here; this must not.
  const result = stopSpawn(classified(4242), deps({ probe: () => true }));
  assert.equal(result.outcome, "still-running");
  assert.equal(stopLeftWorkRunning(result), true);
});

test("stop: a DELIVERED signal is not a verdict — a terminator that succeeds proves nothing", () => {
  // The whole module in one assertion: the terminator reports total success at every rung and the
  // process is still there. The outcome must follow the PROBE, not the signal.
  const result = stopSpawn(
    classified(4242),
    deps({ terminate: () => true, probe: () => true }),
  );
  assert.equal(result.outcome, "still-running");
});

test("stop: a terminator that could not deliver still yields `stopped` if the process is gone", () => {
  // The mirror of the rule above, and the reason the return value is ignored rather than merely
  // distrusted: `taskkill` exits non-zero for an already-dead pid, which is not a failure to stop.
  const result = stopSpawn(
    classified(4242),
    deps({ terminate: () => false, probe: scriptedProbe(true, false) }),
  );
  assert.equal(result.outcome, "stopped");
});

test("stop: a probe that cannot answer after the force rung is UNCONFIRMED, never stopped", () => {
  const result = stopSpawn(
    classified(4242),
    deps({ probe: scriptedProbe(true, true, "unknown") }),
  );
  assert.equal(result.outcome, "unconfirmed");
  // Unknown is not dead. Treating it as a success is the false clear the arc was filed about.
  assert.equal(stopLeftWorkRunning(result), true);
});

test("stop: an unknown probe on the GRACEFUL rung escalates rather than concluding", () => {
  const calls: StopMode[] = [];
  const result = stopSpawn(
    classified(4242),
    deps({
      probe: scriptedProbe(true, "unknown", false),
      terminate: (_pid, mode) => {
        calls.push(mode);
        return true;
      },
    }),
  );
  assert.deepEqual(calls, ["graceful", "force"]);
  assert.equal(result.outcome, "stopped");
});

test("stop: a pid that was already dead is reported as such, not as a kill", () => {
  const calls: StopMode[] = [];
  const result = stopSpawn(
    classified(4242),
    deps({
      probe: () => false,
      terminate: (_pid, mode) => {
        calls.push(mode);
        return true;
      },
    }),
  );
  assert.equal(result.outcome, "already-gone");
  assert.equal(result.viaMode, null);
  // Nothing is signalled at a dead pid: the OS may already have handed it to someone else.
  assert.deepEqual(calls, []);
});

test("stop: the ladder waits between signalling and re-probing", () => {
  const waits: number[] = [];
  stopSpawn(
    classified(4242),
    deps({
      probe: () => true,
      sleep: (ms) => waits.push(ms),
      timing: { gracefulWaitMs: 1500, forceWaitMs: 500 },
    }),
  );
  // Re-probing immediately would report every process as still running and force every one of them.
  assert.deepEqual(waits, [1500, 500]);
});

// ---------------------------------------------------------------------------
// The record, which is the evidence
// ---------------------------------------------------------------------------

test("stop: a confirmed death clears the registry row", () => {
  const io = memoryIo();
  registerSpawn(record(4242), io, ROOT);
  const result = stopSpawn(
    classified(4242),
    deps({ probe: scriptedProbe(true, false), io, root: ROOT }),
  );
  assert.equal(result.recordCleared, true);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 4242).replaceAll("\\", "/")), false);
});

test("stop: a FAILED stop leaves the row standing — the inventory must keep showing it", () => {
  const io = memoryIo();
  registerSpawn(record(4242), io, ROOT);
  const result = stopSpawn(classified(4242), deps({ probe: () => true, io, root: ROOT }));
  assert.equal(result.outcome, "still-running");
  assert.equal(result.recordCleared, false);
  // Clearing here would report a clean inventory over a process that is still writing.
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 4242).replaceAll("\\", "/")), true);
});

test("stop: an UNCONFIRMED stop also leaves the row standing", () => {
  const io = memoryIo();
  registerSpawn(record(4242), io, ROOT);
  const result = stopSpawn(
    classified(4242),
    deps({ probe: scriptedProbe(true, true, "unknown"), io, root: ROOT }),
  );
  assert.equal(result.recordCleared, false);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 4242).replaceAll("\\", "/")), true);
});

test("stop: several targets run in the order given, each judged on its own", () => {
  const results = stopSpawns(
    [classified(1), classified(2)],
    deps({ probe: (pid) => pid === 2 }),
  );
  assert.deepEqual(
    results.map((r) => [r.record.pid, r.outcome]),
    [
      [1, "already-gone"],
      [2, "still-running"],
    ],
  );
});

// ---------------------------------------------------------------------------
// The ownership fence
// ---------------------------------------------------------------------------

function summary(sessionId: string, pids: number[]) {
  return summarizeOwnership(
    sessionId,
    pids.map((pid) => classified(pid, sessionId)),
    [],
  );
}

test("targets: a pid this session owns resolves to a target", () => {
  const { targets, unowned } = resolveStopTargets(summary("mine", [10, 11]), [11]);
  assert.deepEqual(targets.map((t) => t.record.pid), [11]);
  assert.deepEqual(unowned, []);
});

test("targets: a SIBLING's pid is refused, and the refusal names who holds it", () => {
  // The safety property of the whole arc. A start-time sweep has no ownership signal to filter on,
  // so it kills a sibling's live run; here the sibling's pid is not a target at all.
  const { targets, unowned } = resolveStopTargets(
    summary("mine", [10]),
    [99],
    [summary("sibling", [99])],
  );
  assert.deepEqual(targets, []);
  assert.deepEqual(unowned, [{ pid: 99, heldBy: "sibling" }]);
});

test("targets: a pid no session registered is refused as unregistered, not silently killed", () => {
  const { targets, unowned } = resolveStopTargets(summary("mine", [10]), [4242]);
  assert.deepEqual(targets, []);
  assert.deepEqual(unowned, [{ pid: 4242, heldBy: "not-registered" }]);
});

test("targets: leaked and unknown rows are stoppable — a leaked row may be a live process", () => {
  // A leaked record means the process did not de-register. Under pid reuse or a crashed-but-alive
  // tree that is not proof it is gone, so it stays reclaimable rather than being filtered out.
  const mine = summarizeOwnership(
    "mine",
    [
      { record: record(10), state: "leaked", ageMs: 1 },
      { record: record(11), state: "unknown", ageMs: 1 },
    ],
    [],
  );
  const { targets } = resolveStopTargets(mine, [10, 11]);
  assert.deepEqual(targets.map((t) => t.record.pid), [10, 11]);
});

test("targets: a repeated pid is stopped once", () => {
  const { targets } = resolveStopTargets(summary("mine", [10]), [10, 10, 10]);
  assert.equal(targets.length, 1);
});

test("targets: the requested order is preserved, so the report reads back in the order asked", () => {
  const { targets } = resolveStopTargets(summary("mine", [10, 11, 12]), [12, 10]);
  assert.deepEqual(targets.map((t) => t.record.pid), [12, 10]);
});
