import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import type { WorktreeIo } from "./worktree.js";

/**
 * The `worktree` DISPATCH wiring (ADR-0142 / ADR-0033): `run` routes the `worktree` area to the
 * leaf-proven `pruneWorktrees` with the injected {@link WorktreeIo} seam and clock, parses the
 * destructive flags (`--force`/`--yes`/`--cap`), and defaults to a dry run. The policy's own truths
 * live in worktree.test.ts; this file only proves the glue — help, sub-command routing, and that
 * `--force --yes` reaches the removal while the bare command removes nothing.
 */

const PRIMARY = path.join(os.tmpdir(), "st-wt-dispatch", "primary");
const WT_DIR = path.join(PRIMARY, ".claude", "worktrees");
const wt = (name: string): string => path.join(WT_DIR, name);
const NOW = 1_700_000_000_000;

function normEq(a: string, b: string): boolean {
  const n = (p: string): string => path.resolve(p).replace(/[/\\]+$/, "").toLowerCase();
  return n(a) === n(b);
}

/** A minimal IO with one idle orphan husk (a reap candidate) and one live registered worktree. */
function fakeIo(): WorktreeIo & { readonly removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    runGit(args) {
      const a = [...args];
      if (a[0] === "-C") return ""; // show-toplevel / merge-base / status — husk path never reaches here
      if (a[0] === "rev-parse" && a.includes("--git-common-dir")) return path.join(PRIMARY, ".git");
      if (a[0] === "rev-parse" && a.includes("--show-toplevel")) return wt("current");
      if (a[0] === "worktree" && a[1] === "list") {
        return [`worktree ${PRIMARY}`, "HEAD 0000000", "branch refs/heads/main", ""].join("\n");
      }
      if (a[0] === "branch" && a.includes("--merged")) return "";
      if (a[0] === "worktree" && (a[1] === "prune" || a[1] === "remove")) return "";
      throw new Error(`unexpected git call: ${a.join(" ")}`);
    },
    listChildDirs: (dir) => (normEq(dir, WT_DIR) ? ["orphan-old"] : []),
    statMtimeMs: () => NOW - 100 * 3_600_000, // idle
    hasOwnGit: () => false, // husk
    removeDir(dir) {
      removed.push(dir);
    },
  };
}

test("run: `worktree --help` returns the worktree help envelope", async () => {
  const env = await run(["worktree", "--help"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree worktree — worktree lifecycle hygiene/);
});

test("run: an unknown worktree sub-command is rejected with guidance", async () => {
  const env = await run(["worktree", "bogus"], { store: new InMemoryStore() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown worktree command "bogus"/);
});

test("run: `worktree prune` (default) is a dry run — nothing is removed", async () => {
  const io = fakeIo();
  const env = await run(["worktree", "prune"], {
    store: new InMemoryStore(),
    worktree: { io, now: () => NOW },
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /DRY RUN/);
  assert.equal(io.removed.length, 0, "the default must not remove anything");
});

test("run: `worktree prune --force --yes` reaches the removal path", async () => {
  const io = fakeIo();
  const env = await run(["worktree", "prune", "--force", "--yes"], {
    store: new InMemoryStore(),
    worktree: { io, now: () => NOW },
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /Reaped 1/);
  assert.deepEqual(io.removed, [wt("orphan-old")]);
});

test("run: `--force` WITHOUT `--yes` removes nothing (confirmation required)", async () => {
  const io = fakeIo();
  const env = await run(["worktree", "prune", "--force"], {
    store: new InMemoryStore(),
    worktree: { io, now: () => NOW },
  });
  assert.match(env.body, /add --yes/);
  assert.equal(io.removed.length, 0);
});
