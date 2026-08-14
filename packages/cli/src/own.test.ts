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
