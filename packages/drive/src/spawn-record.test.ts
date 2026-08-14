// The SHARED spawn-record definition — proved from both sides of the language boundary.
//
// WHY THIS SUITE EXISTS (`shared-box-session-ownership-arc`, increment 2). `storytree own` can only
// report work that REGISTERED itself, and until now the only registrars were the CLI entry point and
// the gate runner — both TypeScript, both importing `spawn-registry.ts`. The detached spawners that
// actually outlive their session are NOT TypeScript: `scripts/studio.mjs` is plain Node ESM by
// decision (it must run before any workspace install), so it could not import the registry at all.
//
// The tempting fix is for the launcher to hand-write the same JSON into the same directory. That
// duplicates the FORMAT, and a duplicated format drifts silently in the one direction that matters:
// the launcher keeps writing records `storytree own` has quietly stopped reading, and the inventory
// reports a clean bill over a live vite server — the exact false clear this arc exists to remove.
//
// So the format is EXTRACTED into `spawn-record.mjs` (plain ESM, importable by both), and this suite
// holds the two halves together:
//
//   1. IDENTICAL FUNCTIONS, not merely identical output — asserted by reference. A future edit that
//      re-inlines a copy into the TypeScript side fails here rather than in production six weeks on.
//   2. A RECORD WRITTEN BY THE PLAIN-ESM SIDE IS READ BY THE TYPESCRIPT SIDE. That round trip is the
//      real contract: the launcher writes, `storytree own` reads.
//   3. The honesty rules the registry already keeps hold for the new registrar too — identity-gated
//      (the primary checkout and CI register nothing) and fail-silent (instrumentation never breaks
//      the command it instruments).
//   4. The identity ANSWER agrees with the notice board's. Two derivations of "who am I" that can
//      disagree would file a session's work under a name its own `storytree own` never looks up.

import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { deriveIdentity } from "./noticeboard.js";
import {
  formatSpawnRecord,
  nodeAliveProbe,
  nodeSpawnRegistryIo,
  readOwnership,
  spawnRecordPath,
} from "./spawn-registry.js";
import {
  deriveSpawnIdentity,
  formatSpawnRecord as mjsFormatSpawnRecord,
  registerDetachedSpawn,
  removeSpawnRecord,
  removeSpawnRecordForPid,
  spawnRecordPath as mjsSpawnRecordPath,
} from "./spawn-record.mjs";

const roots: string[] = [];

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-spawn-record-"));
  roots.push(root);
  return root;
}

after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/** A `runGit` that answers from a fixed table, so identity is exercised with no repository. */
function scriptedGit(answers: Record<string, string>): (args: string[]) => string {
  return (args) => {
    const key = args.join(" ");
    const answer = answers[key];
    if (answer === undefined) throw new Error(`unscripted git: ${key}`);
    return answer;
  };
}

// The four shapes ADR-0033 D1 distinguishes. Shared by both derivations below, because a table used
// by only one of them proves nothing about whether they agree.
const IDENTITY_SCENARIOS: ReadonlyArray<{
  readonly name: string;
  readonly git: (args: string[]) => string;
}> = [
  {
    name: "a .claude worktree — rule 1",
    git: scriptedGit({
      "rev-parse --show-toplevel": "C:/code/storytree/.claude/worktrees/agent-abc",
      "rev-parse --abbrev-ref HEAD": "worktree-agent-abc",
    }),
  },
  {
    name: "any other registered linked worktree — rule 2",
    git: scriptedGit({
      "rev-parse --show-toplevel": "/home/x/.codex/worktrees/n/storytree",
      "rev-parse --path-format=absolute --git-dir": "/repo/.git/worktrees/storytree3",
      "rev-parse --path-format=absolute --git-common-dir": "/repo/.git",
      "rev-parse --abbrev-ref HEAD": "codex-branch",
    }),
  },
  {
    name: "the primary checkout — rule 3, no identity",
    git: scriptedGit({
      "rev-parse --show-toplevel": "/repo",
      "rev-parse --path-format=absolute --git-dir": "/repo/.git",
      "rev-parse --path-format=absolute --git-common-dir": "/repo/.git",
    }),
  },
  {
    name: "git unavailable (CI without a checkout) — no identity",
    git: () => {
      throw new Error("git: not found");
    },
  },
];

describe("the spawn record has ONE definition, shared across the language boundary", () => {
  test("the TypeScript registry re-exports the plain-ESM functions, it does not re-implement them", () => {
    // Reference equality, deliberately. Equal OUTPUT today is what a fresh copy also has; only the
    // same function object proves nothing was duplicated.
    assert.equal(
      spawnRecordPath,
      mjsSpawnRecordPath,
      "spawn-registry.ts must re-export spawnRecordPath from spawn-record.mjs, not define its own",
    );
    assert.equal(
      formatSpawnRecord,
      mjsFormatSpawnRecord,
      "spawn-registry.ts must re-export formatSpawnRecord from spawn-record.mjs, not define its own",
    );
  });

  test("a record written by the plain-ESM registrar is read and classified by the TypeScript reader", () => {
    const root = tempRoot();
    const filePath = registerDetachedSpawn(
      { pid: process.pid, command: "studio dev server (vite)", cwd: "/repo/apps/studio" },
      { root, identity: { sessionId: "agent-abc", branch: "worktree-agent-abc" } },
    );
    assert.ok(filePath !== null, "the registrar must report where it wrote the record");

    const summary = readOwnership(
      "agent-abc",
      nodeSpawnRegistryIo(),
      nodeAliveProbe,
      Date.now(),
      root,
    );
    assert.equal(summary.unreadable.length, 0, "the reader must parse what the writer wrote");
    assert.equal(summary.live.length, 1);
    const entry = summary.live[0];
    assert.ok(entry !== undefined);
    assert.equal(entry.record.pid, process.pid);
    assert.equal(entry.record.sessionId, "agent-abc");
    assert.equal(entry.record.branch, "worktree-agent-abc");
    assert.equal(entry.record.command, "studio dev server (vite)");
    assert.equal(entry.record.cwd, "/repo/apps/studio");

    // De-registration is the other half of the contract: the launcher's `down` must be able to
    // retire the row it created, or every stopped studio leaves a leaked record behind.
    removeSpawnRecord(filePath);
    const after = readOwnership("agent-abc", nodeSpawnRegistryIo(), nodeAliveProbe, Date.now(), root);
    assert.equal(after.live.length, 0);
    assert.equal(after.leaked.length, 0);
  });

  test("the record lands at the path the TypeScript side computes for it", () => {
    const root = tempRoot();
    const filePath = registerDetachedSpawn(
      { pid: 4242, command: "x", cwd: "/tmp" },
      { root, identity: { sessionId: "agent abc/../escape", branch: "b" } },
    );
    // The sanitised path is shared, so a session id carrying a separator cannot write into another
    // session's directory — the cross-session reach the whole registry exists to prevent.
    assert.equal(filePath, spawnRecordPath(root, "agent abc/../escape", 4242));
    assert.ok(fs.existsSync(filePath ?? ""));
  });
});

describe("the new registrar keeps the registry's honesty rules", () => {
  test("registration is IDENTITY-GATED: no identity registers nothing at all", () => {
    const root = tempRoot();
    const filePath = registerDetachedSpawn(
      { pid: 4242, command: "x", cwd: "/tmp" },
      { root, identity: null },
    );
    assert.equal(filePath, null, "a null identity must register nothing");
    assert.equal(
      fs.existsSync(root) && fs.readdirSync(root).length,
      0,
      "the primary checkout and CI must leave no trace in the registry",
    );
  });

  test("registration is FAIL-SILENT: an unwritable root returns null and throws nothing", () => {
    const root = tempRoot();
    // A FILE where the registry wants a directory — the cheap, portable stand-in for a read-only
    // home or a full disk. Instrumentation must never break the command it instruments.
    const blocked = path.join(root, "blocked");
    fs.writeFileSync(blocked, "not a directory");
    const filePath = registerDetachedSpawn(
      { pid: 4242, command: "x", cwd: "/tmp" },
      { root: blocked, identity: { sessionId: "agent-abc", branch: "b" } },
    );
    assert.equal(filePath, null);
  });

  test("de-registration is idempotent and silent on a record that is already gone", () => {
    const root = tempRoot();
    assert.doesNotThrow(() => {
      removeSpawnRecord(path.join(root, "nothing", "1.json"));
    });
  });

  test("a stopper that never held the path can still retire the row, BY PID", () => {
    // `studio:down` reaps by PORT as well as by pid file, so it routinely stops a process whose
    // registration path this process never saw — an orphaned vite from an earlier launch. Without a
    // by-pid retirement its row would survive the stop and read as leaked work that is actually gone.
    const root = tempRoot();
    const identity = { sessionId: "agent-abc", branch: "b" };
    const filePath = registerDetachedSpawn({ pid: 4242, command: "vite", cwd: "/x" }, { root, identity });
    assert.ok(filePath !== null);

    assert.equal(removeSpawnRecordForPid(4242, { root, identity }), true);
    assert.equal(fs.existsSync(filePath), false);
    // Idempotent, and honest about having found nothing the second time.
    assert.equal(removeSpawnRecordForPid(4242, { root, identity }), false);
  });

  test("a by-pid retirement CANNOT reach another session's row", () => {
    // The same fence `own stop` enforces, and for the same reason: on this box a pid discovered by
    // port scan may belong to a SIBLING's server. The path is built from this checkout's identity,
    // so a sibling's row is unreachable from here rather than merely discouraged.
    const root = tempRoot();
    const sibling = { sessionId: "agent-sibling", branch: "b" };
    const theirs = registerDetachedSpawn({ pid: 4242, command: "vite", cwd: "/x" }, { root, identity: sibling });
    assert.ok(theirs !== null);

    const removed = removeSpawnRecordForPid(4242, { root, identity: { sessionId: "agent-mine", branch: "b" } });
    assert.equal(removed, false, "a sibling's row must not be retired by this session");
    assert.equal(fs.existsSync(theirs), true, "the sibling's record must survive untouched");
  });

  test("a by-pid retirement with NO identity removes nothing", () => {
    const root = tempRoot();
    const identity = { sessionId: "agent-abc", branch: "b" };
    const filePath = registerDetachedSpawn({ pid: 4242, command: "vite", cwd: "/x" }, { root, identity });
    assert.ok(filePath !== null);
    assert.equal(removeSpawnRecordForPid(4242, { root, identity: null }), false);
    assert.equal(fs.existsSync(filePath), true);
  });

  test("STORYTREE_SESSION_ID wins, so a spawned runtime inherits its parent session", () => {
    const git = scriptedGit({
      "rev-parse --show-toplevel": "C:/code/storytree/.claude/worktrees/agent-abc",
      "rev-parse --abbrev-ref HEAD": "worktree-agent-abc",
    });
    assert.deepEqual(deriveSpawnIdentity(git, { STORYTREE_SESSION_ID: "  parent-session  " }), {
      sessionId: "parent-session",
      branch: "worktree-agent-abc",
    });
    // Blank is not an override — it is an unset variable that happens to be present.
    assert.deepEqual(deriveSpawnIdentity(git, { STORYTREE_SESSION_ID: "   " }), {
      sessionId: "agent-abc",
      branch: "worktree-agent-abc",
    });
  });
});

describe("the launcher's identity answer agrees with the notice board's", () => {
  // Two derivations of "who am I" that can disagree would file a session's spawned work under a name
  // its own `storytree own` never looks up — a row that exists and is invisible, which is strictly
  // worse than no row at all. This pins them together over the shapes ADR-0033 D1 distinguishes.
  for (const scenario of IDENTITY_SCENARIOS) {
    test(scenario.name, () => {
      assert.deepEqual(
        deriveSpawnIdentity(scenario.git, {}),
        deriveIdentity(scenario.git),
        "deriveSpawnIdentity must answer exactly what the notice board's deriveIdentity answers",
      );
    });
  }
});
