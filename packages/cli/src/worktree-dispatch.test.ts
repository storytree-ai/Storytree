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

// ── ADR-0200 D6: prune's live-session consult is the CLAIM LEDGER, not presence ──

test("run: `worktree prune --pg` keeps a worktree whose session holds a live claim (ADR-0200 D6)", async () => {
  const io = fakeIo();
  const nowIso = new Date(NOW).toISOString();
  const ledger = {
    // The ClaimLedgerStoreLike half (unused by prune) — minimal stubs.
    take: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    upgrade: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    downgrade: async () => true,
    release: async () => true,
    claimsFor: async () => [],
    // The read half prune consults: the reapable worktree's basename IS a live claim's session id.
    listLiveClaims: async () => [
      {
        unitId: "some-story",
        sessionId: "orphan-old",
        branch: "claude/x",
        intent: "still working",
        claimedAt: nowIso,
        heartbeatAt: nowIso,
      },
    ],
    claimsBySession: async () => [],
  };
  const env = await run(["worktree", "prune", "--force", "--yes", "--pg"], {
    store: new InMemoryStore(),
    presence: { ledger },
    worktree: { io, now: () => NOW },
  });
  assert.equal(env.ok, true);
  assert.equal(io.removed.length, 0, "a worktree with a live claim on the ledger must be KEPT");
  assert.match(env.body, /Reaped 0/);
});

test("run: `worktree prune --pg` with a THROWING ledger falls back to the offline heuristic", async () => {
  const io = fakeIo();
  const ledger = {
    take: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    upgrade: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
    downgrade: async () => true,
    release: async () => true,
    claimsFor: async () => [],
    listLiveClaims: async (): Promise<never[]> => {
      throw new Error("ledger unreachable");
    },
    claimsBySession: async () => [],
  };
  const env = await run(["worktree", "prune", "--force", "--yes", "--pg"], {
    store: new InMemoryStore(),
    presence: { ledger },
    worktree: { io, now: () => NOW },
  });
  assert.equal(env.ok, true, "an unreadable ledger degrades, never crashes");
  assert.deepEqual(io.removed, [wt("orphan-old")], "the offline mtime heuristic still reaps");
});
