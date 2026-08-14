import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  type AliveProbe,
  type OwnershipSummary,
  type SpawnRecord,
  type SpawnRegistryIo,
  classifySpawn,
  clearExitedRecords,
  deregisterSpawn,
  formatSpawnRecord,
  holdsLiveWork,
  listRegisteredSessions,
  parseSpawnRecord,
  readOwnership,
  registerSpawn,
  sanitizeSessionId,
  spawnRecordPath,
  summarizeOwnership,
} from "./spawn-registry.js";

const ROOT = path.join("/tmp", "spawns");
const NOW = Date.parse("2026-08-14T12:00:00.000Z");

function record(over: Partial<SpawnRecord> = {}): SpawnRecord {
  return {
    sessionId: "shared-box-ownership",
    branch: "worktree-shared-box-ownership",
    pid: 4242,
    command: "storytree library artifact edit foo --pg",
    cwd: "/c/code/storytree/.claude/worktrees/shared-box-ownership",
    startedAt: "2026-08-14T11:30:00.000Z",
    ...over,
  };
}

/** An in-memory {@link SpawnRegistryIo} — the whole registry is exercised with no filesystem. */
function memoryIo(seed: Record<string, string> = {}): SpawnRegistryIo & { files: Map<string, string> } {
  const files = new Map<string, string>(Object.entries(seed));
  const norm = (p: string) => p.replaceAll("\\", "/");
  return {
    files,
    mkdirp: () => {},
    writeText: (filePath, text) => {
      files.set(norm(filePath), text);
    },
    readText: (filePath) => {
      const text = files.get(norm(filePath));
      if (text === undefined) throw new Error(`ENOENT ${filePath}`);
      return text;
    },
    remove: (filePath) => {
      files.delete(norm(filePath));
    },
    listDir: (dir) => {
      const prefix = `${norm(dir)}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const head = rest.split("/")[0];
        if (head !== undefined && head.length > 0) names.add(head);
      }
      return [...names];
    },
  };
}

const allAlive: AliveProbe = () => true;
const allDead: AliveProbe = () => false;

// ---------------------------------------------------------------------------
// The record format
// ---------------------------------------------------------------------------

test("a record round-trips through format → parse", () => {
  const parsed = parseSpawnRecord(formatSpawnRecord(record()));
  assert.ok("record" in parsed);
  assert.deepEqual(parsed.record, record());
});

test("a half-written record parses as a REASON, never as a throw", () => {
  // A process killed mid-write leaves exactly this. It must not abort the read of its siblings.
  const parsed = parseSpawnRecord('{"sessionId":"a","pid":1,"comm');
  assert.ok("reason" in parsed);
  assert.match(parsed.reason, /interrupted/);
});

test("a record with no usable pid or sessionId is refused, not defaulted", () => {
  // Defaulting either field would attribute someone's process to the wrong owner, which is the one
  // thing the registry must never do.
  assert.ok("reason" in parseSpawnRecord(JSON.stringify({ sessionId: "a" })));
  assert.ok("reason" in parseSpawnRecord(JSON.stringify({ sessionId: "a", pid: 0 })));
  assert.ok("reason" in parseSpawnRecord(JSON.stringify({ sessionId: "a", pid: -3 })));
  assert.ok("reason" in parseSpawnRecord(JSON.stringify({ sessionId: "  ", pid: 5 })));
  assert.ok("reason" in parseSpawnRecord("[]"));
});

test("optional fields degrade to placeholders rather than dropping the record", () => {
  const parsed = parseSpawnRecord(JSON.stringify({ sessionId: "a", pid: 7 }));
  assert.ok("record" in parsed);
  assert.equal(parsed.record.command, "(unrecorded)");
  assert.equal(parsed.record.branch, "");
});

// ---------------------------------------------------------------------------
// The ownership key
// ---------------------------------------------------------------------------

test("a session id carrying path separators cannot escape its own directory", () => {
  // `STORYTREE_SESSION_ID` is unvalidated env. A separator here would write the record into another
  // session's directory — the cross-session reach the whole registry exists to prevent.
  assert.equal(sanitizeSessionId("../other-session"), "other-session");
  assert.equal(sanitizeSessionId("a/b\\c"), "a-b-c");
  assert.equal(sanitizeSessionId("   "), "unnamed-session");
  assert.equal(sanitizeSessionId("claude/brave-lamarr-85d3f2"), "claude-brave-lamarr-85d3f2");
});

test("the record path is per-session and per-pid, so two writers never share a file", () => {
  const a = spawnRecordPath(ROOT, "sess-a", 1);
  const b = spawnRecordPath(ROOT, "sess-b", 1);
  const c = spawnRecordPath(ROOT, "sess-a", 2);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.equal(path.basename(a), "1.json");
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test("classify: alive is live, gone is LEAKED (it exited without de-registering)", () => {
  assert.equal(classifySpawn(record(), allAlive, NOW).state, "live");
  assert.equal(classifySpawn(record(), allDead, NOW).state, "leaked");
});

test("classify: a probe that cannot tell reports UNKNOWN, never a bucket", () => {
  assert.equal(classifySpawn(record(), () => "unknown", NOW).state, "unknown");
});

test("classify: age comes from startedAt, and an unparseable stamp is null rather than 0", () => {
  // 0 would render as "just started", which is a fabricated fact about work that may be hours old.
  assert.equal(classifySpawn(record(), allAlive, NOW).ageMs, 30 * 60_000);
  assert.equal(classifySpawn(record({ startedAt: "" }), allAlive, NOW).ageMs, null);
  assert.equal(classifySpawn(record({ startedAt: "not a date" }), allAlive, NOW).ageMs, null);
});

test("classify: a clock behind the record floors the age at 0 rather than going negative", () => {
  assert.equal(classifySpawn(record(), allAlive, Date.parse("2026-08-14T11:00:00.000Z")).ageMs, 0);
});

// ---------------------------------------------------------------------------
// holdsLiveWork — the inert gate
// ---------------------------------------------------------------------------

function summary(over: Partial<OwnershipSummary> = {}): OwnershipSummary {
  return { sessionId: "s", live: [], leaked: [], unknown: [], unreadable: [], ...over };
}

test("holdsLiveWork: an UNKNOWN record blocks inert exactly as a live one does", () => {
  // The arc's whole failure mode is a session declaring itself inert while holding live work. A
  // record the probe could not judge is work that MAY be running; folding it into "absent" is the
  // confident false terminal this gate exists to refuse.
  const one = classifySpawn(record(), () => "unknown", NOW);
  assert.equal(holdsLiveWork(summary({ unknown: [one] })), true);
  assert.equal(holdsLiveWork(summary({ live: [classifySpawn(record(), allAlive, NOW)] })), true);
});

test("holdsLiveWork: leaked and unreadable records do NOT block inert", () => {
  // A leaked record is work that already ended; a torn file is a failure to observe one process,
  // not evidence of a live one. Blocking on either would leave a session no way to ever finish.
  assert.equal(holdsLiveWork(summary({ leaked: [classifySpawn(record(), allDead, NOW)] })), false);
  assert.equal(holdsLiveWork(summary({ unreadable: [{ filePath: "x", reason: "torn" }] })), false);
});

// ---------------------------------------------------------------------------
// Register → read → de-register
// ---------------------------------------------------------------------------

test("register writes one record a read finds, and de-register removes it", () => {
  const io = memoryIo();
  const filePath = registerSpawn(record(), io, ROOT);
  assert.ok(filePath !== null);

  const before = readOwnership("shared-box-ownership", io, allAlive, NOW, ROOT);
  assert.equal(before.live.length, 1);
  assert.equal(before.live[0]?.record.command, "storytree library artifact edit foo --pg");

  deregisterSpawn(filePath, io);
  assert.equal(readOwnership("shared-box-ownership", io, allAlive, NOW, ROOT).live.length, 0);
});

test("registration FAILS SILENT — a write that throws leaves the command unharmed", () => {
  // Instrumentation must never break the thing it instruments (a read-only home, a full disk).
  const io = memoryIo();
  io.writeText = () => {
    throw new Error("EROFS");
  };
  assert.equal(registerSpawn(record(), io, ROOT), null);
});

test("a read of a session that has spawned nothing is an EMPTY inventory, not an error", () => {
  const empty = readOwnership("never-ran-anything", memoryIo(), allAlive, NOW, ROOT);
  assert.equal(empty.live.length, 0);
  assert.equal(empty.unreadable.length, 0);
  assert.equal(holdsLiveWork(empty), false);
});

test("one torn record does not hide its readable siblings", () => {
  const io = memoryIo();
  registerSpawn(record({ pid: 1 }), io, ROOT);
  registerSpawn(record({ pid: 2 }), io, ROOT);
  io.writeText(spawnRecordPath(ROOT, "shared-box-ownership", 3), '{"sessionId":"x","p');

  const read = readOwnership("shared-box-ownership", io, allAlive, NOW, ROOT);
  assert.equal(read.live.length, 2);
  assert.equal(read.unreadable.length, 1);
});

test("a read never crosses into another session's directory", () => {
  const io = memoryIo();
  registerSpawn(record({ sessionId: "mine", pid: 1 }), io, ROOT);
  registerSpawn(record({ sessionId: "theirs", pid: 2 }), io, ROOT);

  const mine = readOwnership("mine", io, allAlive, NOW, ROOT);
  assert.deepEqual(mine.live.map((c) => c.record.pid), [1]);
  assert.deepEqual(listRegisteredSessions(io, ROOT), ["mine", "theirs"]);
});

test("non-JSON entries in a session directory are ignored, not reported as torn records", () => {
  const io = memoryIo();
  registerSpawn(record({ pid: 1 }), io, ROOT);
  io.writeText(path.join(ROOT, "shared-box-ownership", "README"), "not a record");
  const read = readOwnership("shared-box-ownership", io, allAlive, NOW, ROOT);
  assert.equal(read.live.length, 1);
  assert.equal(read.unreadable.length, 0);
});

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

test("clear removes ONLY the leaked records and reports what it kept", () => {
  const io = memoryIo();
  registerSpawn(record({ pid: 1 }), io, ROOT);
  registerSpawn(record({ pid: 2 }), io, ROOT);
  registerSpawn(record({ pid: 3 }), io, ROOT);

  // pid 2 is gone, pid 3 cannot be judged, pid 1 is running.
  const probe: AliveProbe = (pid) => (pid === 2 ? false : pid === 3 ? "unknown" : true);
  const read = readOwnership("shared-box-ownership", io, probe, NOW, ROOT);
  const result = clearExitedRecords(read, io, ROOT);

  assert.deepEqual(result, { cleared: 1, keptLive: 1, keptUnknown: 1 });
  const after = readOwnership("shared-box-ownership", io, probe, NOW, ROOT);
  assert.deepEqual(after.live.concat(after.unknown).map((c) => c.record.pid).sort(), [1, 3]);
});

test("clear on a clean inventory removes nothing and says so", () => {
  const io = memoryIo();
  registerSpawn(record({ pid: 1 }), io, ROOT);
  const read = readOwnership("shared-box-ownership", io, allAlive, NOW, ROOT);
  assert.deepEqual(clearExitedRecords(read, io, ROOT), { cleared: 0, keptLive: 1, keptUnknown: 0 });
});

test("summarizeOwnership buckets by state and carries the unreadable list through", () => {
  const live = classifySpawn(record({ pid: 1 }), allAlive, NOW);
  const leaked = classifySpawn(record({ pid: 2 }), allDead, NOW);
  const unknown = classifySpawn(record({ pid: 3 }), () => "unknown", NOW);
  const s = summarizeOwnership("s", [live, leaked, unknown], [{ filePath: "f", reason: "torn" }]);
  assert.deepEqual(s.live.map((c) => c.record.pid), [1]);
  assert.deepEqual(s.leaked.map((c) => c.record.pid), [2]);
  assert.deepEqual(s.unknown.map((c) => c.record.pid), [3]);
  assert.equal(s.unreadable.length, 1);
});
