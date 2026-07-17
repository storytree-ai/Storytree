import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  classifyWorktree,
  parseWorktreeList,
  gatherSnapshots,
  pruneWorktrees,
  removeOne,
  DEFAULT_THRESHOLD_MS,
  type WorktreeIo,
  type WorktreeSnapshot,
  type PrunePolicy,
  type WorktreeVerdict,
  type PruneOptions,
} from "./worktree.js";

/**
 * `storytree worktree prune` — the worktree-hygiene reaper (ADR-0142 / ADR-0033).
 *
 * The safety policy is the whole risk surface (this command deletes directories), so it is proven
 * PURE with fixtures — `classifyWorktree` decides reap/keep from a snapshot, no git and no fs. The
 * gather + execute layers are then driven through an injected {@link WorktreeIo} so the wiring
 * (porcelain parse, orphan detection, dry-run-removes-nothing, --force removes, the cap) is grounded
 * without touching the real repo.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRIMARY = path.join(os.tmpdir(), "st-wt-test", "primary");
const WT_DIR = path.join(PRIMARY, ".claude", "worktrees");
const wt = (name: string): string => path.join(WT_DIR, name);

const NOW = 1_700_000_000_000;
const IDLE_MTIME = NOW - 100 * 3_600_000; // 100 h ago → idle (> 48 h)
const RECENT_MTIME = NOW - 1 * 3_600_000; // 1 h ago → active

function policy(overrides: Partial<PrunePolicy> = {}): PrunePolicy {
  return {
    now: NOW,
    thresholdMs: DEFAULT_THRESHOLD_MS,
    primaryRoot: PRIMARY,
    currentWorktree: wt("current"),
    includeDetached: false,
    liveSessions: new Set<string>(),
    ...overrides,
  };
}

function snap(overrides: Partial<WorktreeSnapshot> & { name: string }): WorktreeSnapshot {
  return {
    path: wt(overrides.name),
    kind: "registered",
    detached: false,
    branch: `claude/${overrides.name}`,
    merged: true,
    dirty: false,
    mtimeMs: IDLE_MTIME,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyWorktree — the safety policy
// ---------------------------------------------------------------------------

test("REAP: a registered worktree merged into origin/main, clean, and idle is reaped", () => {
  const v = classifyWorktree(snap({ name: "merged-idle" }), policy());
  assert.equal(v.decision, "reap");
  assert.match(v.reason, /merged into origin\/main, clean, idle/);
});

test("KEEP: an unmerged branch is never reaped (live work)", () => {
  const v = classifyWorktree(snap({ name: "live", merged: false }), policy());
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /not merged/);
});

test("KEEP: the current worktree is kept even when merged + clean + idle (force cannot override)", () => {
  const v = classifyWorktree(snap({ name: "current" }), policy());
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /current worktree/);
});

test("KEEP: the primary checkout is never reaped", () => {
  const v = classifyWorktree(
    snap({ name: "primary-ish", path: PRIMARY }),
    policy(),
  );
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /primary checkout/);
});

test("KEEP: a worktree whose session holds a live claim on the ledger (--pg, ADR-0200 D6) is kept though merged + idle", () => {
  const v = classifyWorktree(snap({ name: "busy" }), policy({ liveSessions: new Set(["busy"]) }));
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /live session/);
});

test("KEEP: a dirty tree is kept (uncommitted changes)", () => {
  const v = classifyWorktree(snap({ name: "dirty", dirty: true }), policy());
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /uncommitted/);
});

test("KEEP: merged but recently active is kept (a session may be mid branch-next)", () => {
  const v = classifyWorktree(snap({ name: "just-merged", mtimeMs: RECENT_MTIME }), policy());
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /active < 48h/);
});

test("KEEP: a detached-HEAD worktree is kept by default (an intentional gate may live there)", () => {
  const v = classifyWorktree(
    snap({ name: "adr-gate", detached: true, branch: null }),
    policy(),
  );
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /detached HEAD.*include-detached/);
});

test("REAP: a detached-HEAD worktree IS reaped with --include-detached when idle", () => {
  const v = classifyWorktree(
    snap({ name: "adr-gate", detached: true, branch: null }),
    policy({ includeDetached: true }),
  );
  assert.equal(v.decision, "reap");
  assert.match(v.reason, /detached HEAD, idle/);
});

test("KEEP: a detached-HEAD worktree recently active is kept even with --include-detached", () => {
  const v = classifyWorktree(
    snap({ name: "adr-gate", detached: true, branch: null, mtimeMs: RECENT_MTIME }),
    policy({ includeDetached: true }),
  );
  assert.equal(v.decision, "keep");
});

test("REAP: an orphaned dir (absent from git worktree list), idle, is reaped", () => {
  const v = classifyWorktree(
    snap({ name: "orphan-old", kind: "orphan", branch: null, merged: false }),
    policy(),
  );
  assert.equal(v.decision, "reap");
  assert.match(v.reason, /orphaned .* idle/);
});

test("KEEP: an orphaned dir that is recently active is kept", () => {
  const v = classifyWorktree(
    snap({ name: "orphan-new", kind: "orphan", branch: null, merged: false, mtimeMs: RECENT_MTIME }),
    policy(),
  );
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /active < 48h/);
});

test("KEEP: an orphaned dir with visible uncommitted work is kept", () => {
  const v = classifyWorktree(
    snap({ name: "orphan-dirty", kind: "orphan", branch: null, merged: false, dirty: true }),
    policy(),
  );
  assert.equal(v.decision, "keep");
  assert.match(v.reason, /uncommitted/);
});

test("unknown mtime (0) counts as very old → an orphan with no stat is reap-eligible", () => {
  const v = classifyWorktree(
    snap({ name: "orphan-zero", kind: "orphan", branch: null, merged: false, mtimeMs: 0 }),
    policy(),
  );
  assert.equal(v.decision, "reap");
});

test("a shorter --threshold keeps a young-but-idle-enough worktree reapable", () => {
  const twoHourOld = snap({ name: "two-h", mtimeMs: NOW - 2 * 3_600_000 });
  assert.equal(classifyWorktree(twoHourOld, policy()).decision, "keep"); // 48h default
  assert.equal(
    classifyWorktree(twoHourOld, policy({ thresholdMs: 1 * 3_600_000 })).decision,
    "reap",
  );
});

// ---------------------------------------------------------------------------
// parseWorktreeList — the porcelain
// ---------------------------------------------------------------------------

test("parseWorktreeList: parses branch + detached records, strips refs/heads/", () => {
  const porcelain = [
    `worktree ${PRIMARY}`,
    "HEAD 1111111",
    "branch refs/heads/main",
    "",
    `worktree ${wt("feature")}`,
    "HEAD 2222222",
    "branch refs/heads/claude/feature",
    "",
    `worktree ${wt("gate")}`,
    "HEAD 3333333",
    "detached",
    "",
  ].join("\n");
  const parsed = parseWorktreeList(porcelain);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[1], { path: wt("feature"), branch: "claude/feature", detached: false });
  assert.deepEqual(parsed[2], { path: wt("gate"), branch: null, detached: true });
});

// ---------------------------------------------------------------------------
// A configurable fake IO
// ---------------------------------------------------------------------------

interface FakeConfig {
  /** basename → registered entry (branch|detached). Rendered into `worktree list --porcelain`. */
  readonly registered: Record<string, { branch: string | null; detached?: boolean }>;
  /** basenames on disk under the worktrees dir (superset of registered names). */
  readonly onDisk: string[];
  /** basenames whose HEAD is an ancestor of origin/main. */
  readonly merged: Set<string>;
  /** basenames with a dirty working tree. */
  readonly dirty?: Set<string>;
  /** basename → activity mtime; default idle. */
  readonly mtimes?: Record<string, number>;
  readonly currentWorktree?: string;
}

interface FakeIo extends WorktreeIo {
  readonly removed: string[];
  readonly gitRemoved: string[];
  pruneCalled: boolean;
}

function makeIo(cfg: FakeConfig): FakeIo {
  const removed: string[] = [];
  const gitRemoved: string[] = [];
  const state = { pruneCalled: false };
  const nameOf = (p: string): string => path.basename(p);

  const porcelain = [
    // The primary itself is always listed (and must be ignored by gather).
    `worktree ${PRIMARY}`,
    "HEAD 0000000",
    "branch refs/heads/main",
    "",
    ...Object.entries(cfg.registered).flatMap(([name, e]) => [
      `worktree ${wt(name)}`,
      "HEAD abc1234",
      e.detached ? "detached" : `branch refs/heads/${e.branch ?? name}`,
      "",
    ]),
  ].join("\n");

  // The batched `git branch --merged` output: the branch string of each merged, non-detached entry.
  const mergedBranchList = Object.entries(cfg.registered)
    .filter(([name, e]) => cfg.merged.has(name) && e.detached !== true)
    .map(([name, e]) => e.branch ?? name)
    .join("\n");

  const io: FakeIo = {
    removed,
    gitRemoved,
    get pruneCalled() {
      return state.pruneCalled;
    },
    set pruneCalled(v: boolean) {
      state.pruneCalled = v;
    },
    runGit(args) {
      const a = [...args];
      // `-C <dir> …` is a per-worktree probe; resolve it first so the toplevel echo is the dir itself.
      if (a[0] === "-C") {
        const dir = a[1] ?? "";
        const name = nameOf(dir);
        if (a.includes("--show-toplevel")) return dir; // a real worktree's toplevel IS the dir
        if (a.includes("merge-base")) {
          if (cfg.merged.has(name)) return "";
          throw new Error("not an ancestor");
        }
        if (a.includes("status")) return cfg.dirty?.has(name) ? " M file.ts" : "";
        throw new Error(`unexpected -C git call: ${a.join(" ")}`);
      }
      if (a[0] === "rev-parse" && a.includes("--git-common-dir")) return path.join(PRIMARY, ".git");
      if (a[0] === "rev-parse" && a.includes("--show-toplevel")) return cfg.currentWorktree ?? wt("current");
      if (a[0] === "worktree" && a[1] === "list") return porcelain;
      if (a[0] === "branch" && a.includes("--merged")) return mergedBranchList;
      if (a[0] === "worktree" && a[1] === "prune") {
        state.pruneCalled = true;
        return "";
      }
      if (a[0] === "worktree" && a[1] === "remove") {
        const target = a[a.length - 1];
        if (target !== undefined) gitRemoved.push(target);
        return "";
      }
      throw new Error(`unexpected git call: ${a.join(" ")}`);
    },
    listChildDirs(dir) {
      return normEq(dir, WT_DIR) ? [...cfg.onDisk] : [];
    },
    statMtimeMs(dir) {
      return cfg.mtimes?.[nameOf(dir)] ?? IDLE_MTIME;
    },
    hasOwnGit(dir) {
      // Registered worktrees carry their own .git; on-disk-only orphans (husks) do not.
      return Object.prototype.hasOwnProperty.call(cfg.registered, nameOf(dir));
    },
    removeDir(dir) {
      removed.push(dir);
    },
  };
  return io;
}

function normEq(a: string, b: string): boolean {
  const n = (p: string): string => path.resolve(p).replace(/[/\\]+$/, "").toLowerCase();
  return n(a) === n(b);
}

// ---------------------------------------------------------------------------
// gatherSnapshots — git + fs → snapshots
// ---------------------------------------------------------------------------

test("gatherSnapshots: registered-under-managed + orphans; the primary is ignored", () => {
  const io = makeIo({
    registered: {
      "merged-idle": { branch: "claude/merged-idle" },
      gate: { branch: null, detached: true },
    },
    onDisk: ["merged-idle", "gate", "orphan-old"],
    merged: new Set(["merged-idle"]),
  });
  const snaps = gatherSnapshots(io, { primaryRoot: PRIMARY, worktreesDir: WT_DIR });
  const byName = new Map(snaps.map((s) => [s.name, s]));

  assert.equal(snaps.length, 3, "two registered + one orphan; primary excluded");
  assert.equal(byName.get("merged-idle")?.kind, "registered");
  assert.equal(byName.get("merged-idle")?.merged, true);
  assert.equal(byName.get("gate")?.detached, true);
  assert.equal(byName.get("orphan-old")?.kind, "orphan");
  assert.ok(!byName.has(path.basename(PRIMARY)), "the primary is never a snapshot");
});

// ---------------------------------------------------------------------------
// pruneWorktrees — dry-run / force / cap / hook
// ---------------------------------------------------------------------------

const baseOpts: PruneOptions = {
  force: false,
  yes: false,
  hook: false,
  cap: null,
  includeDetached: false,
  thresholdMs: DEFAULT_THRESHOLD_MS,
  liveSessions: new Set(),
};

function scenarioIo(): FakeIo {
  // merged-idle → reap; live → keep (unmerged); orphan-old → reap; current → keep (self).
  return makeIo({
    registered: {
      "merged-idle": { branch: "claude/merged-idle" },
      live: { branch: "claude/live" },
      current: { branch: "claude/current" },
    },
    onDisk: ["merged-idle", "live", "current", "orphan-old"],
    merged: new Set(["merged-idle", "current"]),
    currentWorktree: wt("current"),
  });
}

test("DRY RUN (default) removes nothing and names the reap targets", () => {
  const io = scenarioIo();
  const env = pruneWorktrees(baseOpts, { io, now: () => NOW });
  assert.equal(env.ok, true);
  assert.match(env.body, /DRY RUN/);
  assert.match(env.body, /would reap 2/); // merged-idle + orphan-old
  assert.equal(io.removed.length, 0, "dry run must not remove");
  assert.equal(io.gitRemoved.length, 0);
  assert.equal(io.pruneCalled, false);
});

test("--force WITHOUT --yes still removes nothing (asks for confirmation)", () => {
  const io = scenarioIo();
  const env = pruneWorktrees({ ...baseOpts, force: true }, { io, now: () => NOW });
  assert.equal(env.ok, true);
  assert.match(env.body, /add --yes/);
  assert.equal(io.removed.length, 0);
  assert.equal(io.gitRemoved.length, 0);
});

test("--force --yes reaps: registered via git worktree remove, orphan via rm, then prunes", () => {
  const io = scenarioIo();
  const env = pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW });
  assert.equal(env.ok, true);
  assert.match(env.body, /Reaped 2/);
  assert.deepEqual(io.gitRemoved, [wt("merged-idle")], "the registered reap goes through git");
  assert.deepEqual(io.removed, [wt("orphan-old")], "the orphan reap goes through rm");
  assert.equal(io.pruneCalled, true, "dangling admin entries pruned after removal");
});

test("--cap bounds the number reaped and reports the remainder", () => {
  const io = makeIo({
    registered: {},
    onDisk: ["orphan-a", "orphan-b", "orphan-c"],
    merged: new Set(),
  });
  const env = pruneWorktrees({ ...baseOpts, force: true, yes: true, cap: 2 }, { io, now: () => NOW });
  assert.equal(io.removed.length, 2, "only the cap is removed");
  assert.match(env.body, /Reaped 2/);
  assert.match(env.body, /Capped: 1 more/);
});

test("hook mode reports ok even when git context cannot be resolved (never breaks a session)", () => {
  const brokenIo: WorktreeIo = {
    runGit() {
      throw new Error("not a git repo");
    },
    listChildDirs: () => [],
    statMtimeMs: () => 0,
    hasOwnGit: () => false,
    removeDir: () => {},
  };
  const env = pruneWorktrees({ ...baseOpts, hook: true, force: true, yes: true }, { io: brokenIo });
  assert.equal(env.ok, true, "hook mode swallows the failure");
});

test("live sessions passed in (--pg) protect a merged + idle worktree from the reaper", () => {
  const io = scenarioIo();
  const env = pruneWorktrees(
    { ...baseOpts, force: true, yes: true, liveSessions: new Set(["merged-idle"]) },
    { io, now: () => NOW },
  );
  // merged-idle is now protected → only orphan-old remains reapable.
  assert.deepEqual(io.gitRemoved, [], "no registered reap — merged-idle is live");
  assert.deepEqual(io.removed, [wt("orphan-old")]);
});

test("confirm-clean: a merged + idle worktree that is actually DIRTY is downgraded to keep (not reaped)", () => {
  const io = makeIo({
    registered: { "merged-dirty": { branch: "claude/merged-dirty" } },
    onDisk: ["merged-dirty"],
    merged: new Set(["merged-dirty"]),
    dirty: new Set(["merged-dirty"]), // uncommitted work discovered by the confirm pass
    currentWorktree: wt("elsewhere"),
  });
  const env = pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW });
  assert.match(env.body, /Reaped 0/);
  assert.equal(io.gitRemoved.length, 0, "the deferred dirty check spared it");
  assert.equal(io.removed.length, 0);
});

test("a husk (no own .git) is never probed for dirt — the confirm pass short-circuits with no git status", () => {
  // The primary is DIRTY (the real bug: `git status` in a husk walks up to the primary). The fake's
  // status only answers under `-C <name>` for a REGISTERED name; a husk has hasOwnGit=false, so
  // worktreeDirty must return before ever calling status. onDisk husks with no registry entry reap.
  const io = makeIo({
    registered: {},
    onDisk: ["husk-a", "husk-b"],
    merged: new Set(),
  });
  const env = pruneWorktrees({ ...baseOpts, force: true, yes: true }, { io, now: () => NOW });
  assert.match(env.body, /Reaped 2/);
  assert.deepEqual(io.removed.sort(), [wt("husk-a"), wt("husk-b")].sort());
});

// ---------------------------------------------------------------------------
// removeOne — the git-first, rm-fallback contract
// ---------------------------------------------------------------------------

test("removeOne: a registered reap falls back to rm when git worktree remove throws", () => {
  const io: WorktreeIo = {
    runGit(args) {
      if (args[0] === "worktree" && args[1] === "remove") throw new Error("locked");
      return "";
    },
    listChildDirs: () => [],
    statMtimeMs: () => 0,
    hasOwnGit: () => true,
    removeDir(_dir) {
      /* records success */
    },
  };
  const verdict: WorktreeVerdict = {
    path: wt("wedged"),
    name: "wedged",
    kind: "registered",
    decision: "reap",
    reason: "test",
  };
  const res = removeOne(io, verdict);
  assert.equal(res.ok, true);
  assert.equal(res.method, "rm", "fell back to the raw delete");
});
