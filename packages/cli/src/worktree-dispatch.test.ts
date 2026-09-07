import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";
import { worktreeHelp, type WorktreeIo } from "./worktree.js";

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

test("liveness-is-observed-not-self-reported: the help pins `worktree activity`'s whole entry, read-only default included", () => {
  // Pinned as a BLOCK, not probed line by line. Help text is pure string literals, so a regex over
  // one line leaves every other line free to be emptied — and the two facts a reader most needs
  // here are the ones a partial match drops: that a bare run writes NOTHING, and that a stamp can
  // only move a claim forward. Someone reading this to decide whether `--pg` is safe reads exactly
  // those two lines.
  const body = worktreeHelp().body;
  const start = body.indexOf("  storytree worktree activity");
  assert.notEqual(start, -1, "the help must carry a `worktree activity` entry at all");
  assert.equal(
    body.slice(start, body.indexOf("\n\n", start)),
    [
      "  storytree worktree activity [--pg]         WHAT THE LEDGER IS TOLD about liveness (ADR-0535 D2):",
      "                                             observed file change per claimed worktree, with the",
      "                                             signal that bound it and every refusal's reason.",
      "                                             Bare = read-only. --pg writes the stamps, which only",
      "                                             ever move a claim FORWARD, never back.",
    ].join("\n"),
  );
});

test("run: an unknown worktree sub-command is rejected, and every REAL one is named in the guidance", async () => {
  const env = await run(["worktree", "bogus"], { store: new InMemoryStore() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown worktree command "bogus"/);
  // Pinned whole: a verb added to the dispatch but forgotten here is a verb nobody discovers, and
  // the refusal is the one place a mistyped sub-command reads the list.
  assert.deepEqual(env.next, [
    'storytree worktree create --node <story> --intent "<what>" --pg',
    "storytree worktree prune",
    "storytree worktree drain",
    "storytree worktree idle",
    "storytree worktree activity",
    "storytree worktree --help",
  ]);
});

test("run: every worktree sub-command in the allow-list actually ROUTES — none falls through to the refusal", async () => {
  // The allow-list is a chain of `sub !== "…"` tests, and dropping one does not error anywhere a
  // unit test of the verb can see: the sub-command simply falls through and answers "unknown
  // worktree command", with the implementation perfectly healthy. Only driving each one through
  // `run(...)` catches it, so each is driven — `create` excepted, since it MINTS a worktree.
  for (const sub of ["prune", "drain", "idle", "activity"]) {
    const env = await run(["worktree", sub], {
      store: new InMemoryStore(),
      worktree: { io: activityIo(), now: () => NOW, idle: activityIdle },
    });
    assert.doesNotMatch(
      env.body,
      /unknown worktree command/,
      `\`worktree ${sub}\` fell through the dispatch allow-list`,
    );
  }
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

// ── ADR-0535 D2: `worktree activity` — what the ledger is TOLD about liveness ──
//
// These go through `run(...)` on purpose. A sub-command missing from the dispatch allow-list does
// not error anywhere a unit test of the function can see it: it falls through and answers "unknown
// worktree command", with the implementation perfectly healthy. Only the end-to-end route catches it.

/** Two registered worktrees: one admin-bound and recently touched, one husk with no admin dir. */
function activityIo(): WorktreeIo {
  return {
    ...fakeIo(),
    runGit(args) {
      const a = [...args];
      if (a[0] === "rev-parse" && a.includes("--git-common-dir")) return path.join(PRIMARY, ".git");
      if (a[0] === "rev-parse" && a.includes("--show-toplevel")) return wt("current");
      if (a[0] === "worktree" && a[1] === "list") {
        return [
          `worktree ${wt("live-one")}`,
          "HEAD 0000000",
          "branch refs/heads/claude/live-one",
          "",
          `worktree ${wt("husk-one")}`,
          "HEAD 0000000",
          "detached",
          "",
        ].join("\n");
      }
      throw new Error(`unexpected git call: ${a.join(" ")}`);
    },
  };
}

/** The injected idle reader: `live-one` is admin-bound and fresh; `husk-one` fell back. */
const activityIdle = (dir: string) =>
  path.basename(dir) === "live-one"
    ? {
        dir,
        admin: path.join(PRIMARY, ".git", "worktrees", "live-one"),
        signals: new Map([["index", NOW - 60_000]]),
        binding: "index",
        mtimeMs: NOW - 60_000,
        fellBack: false,
      }
    : {
        dir,
        admin: null,
        signals: new Map([["<dir>", NOW - 120_000]]),
        binding: "<dir>",
        mtimeMs: NOW - 120_000,
        fellBack: true,
      };

test("run: `worktree activity` is a READ — it reports the plan and writes nothing", async () => {
  let stamped = 0;
  const env = await run(["worktree", "activity"], {
    store: new InMemoryStore(),
    presence: {
      ledger: {
        take: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
        upgrade: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
        downgrade: async () => true,
        release: async () => true,
        claimsFor: async () => [],
        claimsBySession: async () => [],
        stampActivity: async () => {
          stamped += 1;
          return 3;
        },
      },
    },
    worktree: { io: activityIo(), now: () => NOW, idle: activityIdle },
  });

  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /WORKTREE ACTIVITY/);
  assert.match(env.body, /live-one/, "the admin-bound worktree vouches for its session");
  assert.match(env.body, /refused \(fell-back\): husk-one/, "and the husk is refused, by name");
  assert.match(env.body, /read-only\. Pass --pg/);
  assert.equal(stamped, 0, "a bare read must never write to the ledger");
});

test("run: `worktree activity --pg` writes the observed stamps and reports the count", async () => {
  const batches: { sessionId: string; observedAt: string }[][] = [];
  const env = await run(["worktree", "activity", "--pg"], {
    store: new InMemoryStore(),
    presence: {
      ledger: {
        take: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
        upgrade: async () => ({ acquired: true as const, reclaimed: false, claim: null as never }),
        downgrade: async () => true,
        release: async () => true,
        claimsFor: async () => [],
        claimsBySession: async () => [],
        stampActivity: async (stamps) => {
          batches.push(stamps.map((s) => ({ ...s })));
          return 2;
        },
      },
    },
    worktree: { io: activityIo(), now: () => NOW, idle: activityIdle },
  });

  assert.equal(env.ok, true, env.body);
  assert.equal(batches.length, 1, "one batched write for the whole box");
  assert.deepEqual(
    batches[0],
    [{ sessionId: "live-one", observedAt: new Date(NOW - 60_000).toISOString() }],
    "the OBSERVED moment travels, not `now` — and the husk contributes nothing",
  );
  assert.match(env.body, /wrote 2 claim rows forward/);
});

test("run: `worktree activity --pg` with no live ledger refuses and points at db:up", async () => {
  const env = await run(["worktree", "activity", "--pg"], {
    store: new InMemoryStore(),
    worktree: { io: activityIo(), now: () => NOW, idle: activityIdle },
  });
  assert.equal(env.ok, false);
  // Both halves of the message, and both `next` entries: the refusal has to say what is missing AND
  // offer the read-only run, or a session that cannot bring the DB up learns nothing it can act on.
  assert.equal(
    env.body,
    "worktree activity --pg needs the live claim ledger, and none is composed.\nbring the DB up first: pnpm db:up",
  );
  assert.deepEqual(env.next, ["pnpm db:up", "storytree worktree activity"]);
});

test("run: `worktree activity` with NO injected seams drives the REAL git + fs defaults", async () => {
  // The seams are optional, so every other test in this file proves the sweep against fakes — and a
  // suite gets greener the more thoroughly a seam is mocked, which is exactly how a default nobody
  // exercises ships broken. This one injects nothing: real `git worktree list --porcelain`, real
  // `readIdleSignals`, real clock, against this actual checkout. It asserts the SHAPE rather than
  // the contents, because the contents are whatever this machine happens to hold.
  const env = await run(["worktree", "activity"], { store: new InMemoryStore() });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /^WORKTREE ACTIVITY — what the ledger is told about liveness/);
  assert.match(env.body, /\d+ worktrees observed · \d+ session ids vouched for · \d+ refused\./);
  assert.match(env.body, /read-only\. Pass --pg to write these stamps to the claim ledger\.$/);
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
