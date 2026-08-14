import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { type SpawnRegistryIo, registerSpawn, spawnRecordPath } from "@storytree/drive";

import { type OwnDeps, ownCommand, ownHelp } from "./own.js";

const ROOT = path.join("/tmp", "own-test-spawns");
const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const SELF = 999;

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

function deps(over: Partial<OwnDeps> = {}): OwnDeps {
  return {
    io: memoryIo(),
    root: ROOT,
    now: () => NOW,
    sessionId: () => "mine",
    probe: () => true,
    selfPid: SELF,
    // Nothing in this suite may signal a real process. The default terminator is inert and the
    // default sleep returns instantly, so the reclaim path is exercised at full speed and offline.
    terminate: () => true,
    sleep: () => {},
    stopTiming: { gracefulWaitMs: 0, forceWaitMs: 0 },
    ...over,
  };
}

function seed(
  io: SpawnRegistryIo,
  sessionId: string,
  pid: number,
  command = "storytree build node x --real",
): void {
  registerSpawn(
    {
      sessionId,
      branch: `worktree-${sessionId}`,
      pid,
      command,
      cwd: `/c/code/storytree/.claude/worktrees/${sessionId}`,
      startedAt: "2026-08-14T11:15:00.000Z",
    },
    io,
    ROOT,
  );
}

test("own: an empty inventory says nothing is running, and says what it cannot see", () => {
  const env = ownCommand([], deps());
  assert.equal(env.ok, true);
  assert.match(env.body, /No registered background work/);
  // The coverage caveat is not optional prose: an inventory read as a census of the box would be
  // the same false clear this command exists to remove.
  assert.match(env.body, /Only registered work appears here/);
});

test("own: live work is named, with the pid and the command, and flagged as NOT inert", () => {
  const io = memoryIo();
  seed(io, "mine", 4242, "storytree library artifact edit foo --pg");
  const env = ownCommand([], deps({ io }));
  assert.match(env.body, /LIVE: 1/);
  assert.match(env.body, /NOT inert/);
  assert.match(env.body, /pid 4242/);
  assert.match(env.body, /library artifact edit foo --pg/);
});

test("own: the reader never counts ITSELF as outstanding work", () => {
  // Every CLI invocation registers, `own` included. Counting itself would make the honest answer —
  // "nothing is running, this session may go inert" — unreachable by construction.
  const io = memoryIo();
  seed(io, "mine", SELF, "storytree own");
  const env = ownCommand([], deps({ io }));
  assert.match(env.body, /No registered background work/);
});

test("own: an UNKNOWN probe is reported as running, never quietly dropped", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand([], deps({ io, probe: () => "unknown" }));
  assert.match(env.body, /LIVE: 1/);
  assert.match(env.body, /UNKNOWN/);
});

test("own: a record whose process is gone is shown as leaked, not as live", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand([], deps({ io, probe: () => false }));
  assert.match(env.body, /LIVE: none/);
  assert.match(env.body, /died without de-registering/);
  assert.match(env.body, /storytree own clear/);
});

test("own: a torn record is reported by path, not swallowed", () => {
  const io = memoryIo();
  io.writeText(spawnRecordPath(ROOT, "mine", 7), '{"sessionId":"mi');
  const env = ownCommand([], deps({ io }));
  assert.match(env.body, /could not be read/);
});

test("own --all: attributes every session's work to its OWNER and marks which is yours", () => {
  const io = memoryIo();
  seed(io, "mine", 1);
  seed(io, "theirs", 2);
  const env = ownCommand(["--all"], deps({ io }));
  assert.match(env.body, /mine {2}\(you\)/);
  assert.match(env.body, /theirs/);
  // The whole point of the attribution: a reclaim scoped by owner instead of by start time.
  assert.match(env.body, /start-time sweep/);
});

test("own --all: works with no session identity, because attribution is not self-scoped", () => {
  const io = memoryIo();
  seed(io, "theirs", 2);
  const env = ownCommand(["--all"], deps({ io, sessionId: () => null }));
  assert.equal(env.ok, true);
  assert.match(env.body, /theirs/);
});

test("own: the primary checkout is REFUSED rather than answered with a false empty", () => {
  // No identity means no session directory to read, so a bare read there would print "nothing is
  // running" — a clear this command has no basis for. It refuses and points at `--all`.
  const env = ownCommand([], deps({ sessionId: () => null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a session identity/);
  assert.match(env.body, /storytree own --all/);
});

test("own clear: removes the dead records and keeps the live ones, reporting both", () => {
  const io = memoryIo();
  seed(io, "mine", 1);
  seed(io, "mine", 2);
  const env = ownCommand(["clear"], deps({ io, probe: (pid) => pid === 1 }));
  assert.match(env.body, /forgot 1 record/);
  assert.match(env.body, /kept 1 LIVE record/);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 2).replaceAll("\\", "/")), false);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 1).replaceAll("\\", "/")), true);
});

test("own clear: an unjudgeable record is KEPT — unknown is not dead", () => {
  const io = memoryIo();
  seed(io, "mine", 1);
  const env = ownCommand(["clear"], deps({ io, probe: () => "unknown" }));
  assert.match(env.body, /nothing to clear/);
  assert.match(env.body, /unknown is not dead/);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 1).replaceAll("\\", "/")), true);
});

test("own clear: never reaches into another session's records", () => {
  const io = memoryIo();
  seed(io, "theirs", 5);
  ownCommand(["clear"], deps({ io, probe: () => false }));
  assert.equal(io.files.has(spawnRecordPath(ROOT, "theirs", 5).replaceAll("\\", "/")), true);
});

test("own --help names the closing-leg use, which is the reason the verb exists", () => {
  assert.match(ownHelp().body, /inert/);
});

// ---------------------------------------------------------------------------
// `own stop` — the reclaim
// ---------------------------------------------------------------------------

test("own stop: a process that dies is reported STOPPED, and its record is cleared", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  // A process modelled the way a real one behaves: alive until it is signalled, gone afterwards.
  // The probe must not be a call-counter — the inventory read probes each row before `stop` does.
  let alive = true;
  let signalled = 0;
  const env = ownCommand(
    ["stop", "4242"],
    deps({
      io,
      probe: () => alive,
      terminate: () => {
        signalled += 1;
        alive = false;
        return true;
      },
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /pid 4242 +STOPPED \(graceful\)/);
  assert.equal(signalled, 1);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 4242).replaceAll("\\", "/")), false);
});

test("own stop: a process that SURVIVES is reported honestly and exits non-ok", () => {
  // The defect this verb exists to fix: `TaskStop` reports success while the detached child keeps
  // running and keeps its port. A stop that under-delivered must never read as a success.
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand(["stop", "4242"], deps({ io, probe: () => true }));
  assert.equal(env.ok, false);
  assert.match(env.body, /STILL RUNNING after a forced stop/);
  assert.match(env.body, /SURVIVED the stop/);
  // And the row stays, so the next inventory still shows the work.
  assert.equal(io.files.has(spawnRecordPath(ROOT, "mine", 4242).replaceAll("\\", "/")), true);
});

test("own stop: a signal that was DELIVERED does not make the report a success", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand(
    ["stop", "4242"],
    deps({ io, terminate: () => true, probe: () => true }),
  );
  assert.equal(env.ok, false);
});

test("own stop: an unjudgeable probe is UNCONFIRMED — not a stop", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand(["stop", "4242"], deps({ io, probe: () => "unknown" }));
  assert.equal(env.ok, false);
  assert.match(env.body, /UNCONFIRMED/);
  assert.match(env.body, /treat it as running/);
});

test("own stop: a SIBLING's pid is refused, attributed, and never signalled", () => {
  // The safety property of the arc. This is the assertion that a reclaim cannot become the
  // cross-session kill a start-time sweep performs.
  const io = memoryIo();
  seed(io, "mine", 1);
  seed(io, "theirs", 99);
  let signalled = 0;
  const env = ownCommand(
    ["stop", "99"],
    deps({
      io,
      terminate: () => {
        signalled += 1;
        return true;
      },
    }),
  );
  assert.equal(env.ok, false);
  assert.equal(signalled, 0);
  assert.match(env.body, /REFUSED — not this session's work/);
  assert.match(env.body, /owned by "theirs"/);
  assert.equal(io.files.has(spawnRecordPath(ROOT, "theirs", 99).replaceAll("\\", "/")), true);
});

test("own stop: an unregistered pid is refused rather than signalled blind", () => {
  const io = memoryIo();
  seed(io, "mine", 1);
  let signalled = 0;
  const env = ownCommand(
    ["stop", "31337"],
    deps({
      io,
      terminate: () => {
        signalled += 1;
        return true;
      },
    }),
  );
  assert.equal(env.ok, false);
  assert.equal(signalled, 0);
  assert.match(env.body, /no session registered it/);
});

test("own stop: with no pid it refuses and points at the inventory", () => {
  const env = ownCommand(["stop"], deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /needs the pid/);
  assert.match(env.body, /storytree own/);
});

test("own stop: a non-numeric argument is named, not silently ignored", () => {
  const io = memoryIo();
  seed(io, "mine", 4242);
  const env = ownCommand(["stop", "all"], deps({ io, probe: () => false }));
  assert.equal(env.ok, false);
  assert.match(env.body, /not a pid/);
});

test("own stop: a stale record is reported as already gone, and nothing is signalled at its pid", () => {
  // A dead pid may have been reused by the OS, so signalling it would hit an unrelated process.
  const io = memoryIo();
  seed(io, "mine", 4242);
  let signalled = 0;
  const env = ownCommand(
    ["stop", "4242"],
    deps({
      io,
      probe: () => false,
      terminate: () => {
        signalled += 1;
        return true;
      },
    }),
  );
  assert.equal(env.ok, true);
  assert.equal(signalled, 0);
  assert.match(env.body, /already gone/);
});

test("own stop: the primary checkout is refused — it owns no rows to reclaim", () => {
  const env = ownCommand(["stop", "4242"], deps({ sessionId: () => null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a session identity/);
});

test("own: live rows hand back the stop command already typed out", () => {
  // A caller made to re-read pids off the rows is a caller who reaches for a process-table sweep.
  const io = memoryIo();
  seed(io, "mine", 11);
  seed(io, "mine", 12);
  const env = ownCommand([], deps({ io }));
  assert.match(env.body, /Reclaim it: storytree own stop 11 12/);
});

test("own: an idle session is offered no reclaim line", () => {
  assert.doesNotMatch(ownCommand([], deps()).body, /Reclaim it/);
});
