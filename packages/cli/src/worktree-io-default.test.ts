import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  defaultWorktreeIo,
  gatherSnapshots,
  resolveContext,
  worktreeDirty,
} from "./worktree.js";

/**
 * `defaultWorktreeIo` — the PRODUCTION IO of the worktree reaper, driven against REAL git and a REAL
 * filesystem (`a-mocked-seam-leaves-its-default-implementation-unproven`).
 *
 * WHY THIS FILE EXISTS. The reaper's safety policy is proven with fixtures (`worktree.test.ts`) and
 * its idle proxy against a real fs (`worktree-idle-signal.test.ts`) — but every one of those tests
 * injects a `WorktreeIo` fake, so FOUR of the five production members had never run under test:
 * `runGit`, `listChildDirs`, `hasOwnGit`, and `removeDir`. A green suite said nothing about them.
 *
 * That is not a hypothetical shape here — it is this exact file's history. `statMtimeMs` was the
 * fifth member, and the reflog defect that let `.claude/worktrees/` reach ~93 GB lived inside it,
 * invisible to a fully green suite for weeks because every test mocked it away. `statMtimeMs` now has
 * `worktree-idle-signal.test.ts`; these are its four untested siblings, closed the same way — real
 * substrate, no fake.
 *
 * WHAT A FAKE STRUCTURALLY CANNOT PROVE, and why each of these is worth a real substrate:
 *   - `runGit` TRIMS. Every caller compares its output as an exact string (`normPath(top) !== normPath(dir)`,
 *     `headSha !== mainSha`), so a stray trailing newline is a silent wrong answer, and a fake that
 *     returns pre-trimmed strings can never catch it.
 *   - `listChildDirs` must return DIRECTORIES only and swallow a missing dir. A file admitted as a
 *     worktree becomes a reap candidate.
 *   - `hasOwnGit` decides whether `worktreeDirty` may run `git status` in a dir at all — the guard that
 *     stops a husk's probe walking UP into the primary checkout and reporting the PRIMARY's dirty
 *     state as the husk's. Only a real nested checkout can prove git actually walks up.
 *   - `removeDir` is the destructive member. It must really delete, and — the arm no fake reaches — it
 *     must THROW rather than silently report success when the delete does not take.
 *
 * COST DISCIPLINE. Real git is spawn-expensive on Windows, so ONE repository is built for the whole
 * file and the members that touch no git (`listChildDirs`, `removeDir`) run against plain temp
 * directories instead. Tests use distinct worktree/husk names and never assert over the shared
 * managed dir as a whole, so they stay order-independent in everything they claim.
 */

// ---------------------------------------------------------------------------
// Real-git fixture: a primary checkout + a real origin/main ref, built once
// ---------------------------------------------------------------------------

const git = (args: readonly string[], cwd: string): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/** The temp root holding the shared repository. */
let root = "";
/** The primary checkout — `<root>/main`. */
let primary = "";
/** `<primary>/.claude/worktrees` — the managed dir the reaper scans. */
let worktreesDir = "";

/**
 * Build a faithful miniature of the real layout: a primary checkout on `main`, a real
 * `refs/remotes/origin/main` (what `git branch --merged` and `git worktree add` resolve against),
 * and `.claude/worktrees/`. `.claude/` is gitignored exactly as the real repo needs it to be, so a
 * worktree cut inside the tree never registers as the primary's own uncommitted change.
 *
 * The remote-tracking ref is SET DIRECTLY rather than pushed to a bare origin: nothing in this file
 * fetches, so a real remote would buy no fidelity — `branch --merged` and `worktree add` read the
 * ref itself — and it costs three git spawns.
 */
before(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "st-wt-io-"));
  primary = path.join(root, "main");

  mkdirSync(primary, { recursive: true });
  git(["init", "-b", "main"], primary);
  git(["config", "user.email", "fixture@storytree.test"], primary);
  git(["config", "user.name", "fixture"], primary);
  // gc must never fire mid-test and rewrite the admin files the reaper reads.
  git(["config", "gc.auto", "0"], primary);
  // Keep the fixture's line endings inert — a CRLF rewrite would dirty files nothing touched.
  git(["config", "core.autocrlf", "false"], primary);
  writeFileSync(path.join(primary, ".gitignore"), ".claude/\n", "utf8");
  writeFileSync(path.join(primary, "seed.txt"), "seed\n", "utf8");
  git(["add", "-A"], primary);
  git(["commit", "-m", "seed"], primary);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"], primary);

  worktreesDir = path.join(primary, ".claude", "worktrees");
  mkdirSync(worktreesDir, { recursive: true });
});

after(() => {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A temp dir the OS still holds is the OS's problem, never a test failure.
  }
});

/** Cut a REAL worktree at `.claude/worktrees/<name>` on a fresh branch off origin/main. */
function addWorktree(name: string): string {
  const dir = path.join(worktreesDir, name);
  git(["worktree", "add", "-b", `claude/${name}`, dir, "refs/remotes/origin/main"], primary);
  return dir;
}

/** A husk: real bytes on disk under the managed dir, with no git link of its own. */
function addHusk(name: string): string {
  const dir = path.join(worktreesDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "residue.txt"), "left over\n", "utf8");
  return dir;
}

/** A plain temp directory for the members that touch no git at all. */
function withTempDir(fn: (dir: string) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "st-wt-fs-"));
    try {
      await fn(dir);
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        // As above — teardown never fails a test.
      }
    }
  };
}

// ---------------------------------------------------------------------------
// runGit — the member every other probe is built on
// ---------------------------------------------------------------------------

test("defaultWorktreeIo.runGit: returns real git stdout TRIMMED, and throws on a non-zero exit", () => {
  // The trim is load-bearing: callers compare this output as an exact string, so a surviving
  // trailing newline is a silent wrong answer everywhere it is used.
  const branch = defaultWorktreeIo.runGit(["-C", primary, "rev-parse", "--abbrev-ref", "HEAD"]);
  assert.equal(branch, "main", "the branch name must come back exactly, with no surrounding whitespace");
  assert.equal(branch, branch.trim(), "runGit must trim — a trailing newline breaks every equality check");

  const sha = defaultWorktreeIo.runGit(["-C", primary, "rev-parse", "HEAD"]);
  assert.match(sha, /^[0-9a-f]{40}$/, "a trimmed sha is exactly 40 hex chars — no newline, no padding");

  // The failure contract the probes rely on: git's non-zero exit must SURFACE as a throw, because
  // `worktreeDirty` / `mergedBranchSet` / `detachedMerged` all encode "not merged" / "not dirty" as
  // a caught exception. A default that swallowed the error would answer those questions wrongly.
  assert.throws(
    () => defaultWorktreeIo.runGit(["-C", primary, "rev-parse", "--verify", "refs/heads/no-such-branch"]),
    "a failing git command must throw, never return an empty string",
  );
});

// ---------------------------------------------------------------------------
// listChildDirs — what the orphan scan admits (pure fs, no repo needed)
// ---------------------------------------------------------------------------

test(
  "defaultWorktreeIo.listChildDirs: real subdirectories only — files are never admitted, a missing dir is empty",
  withTempDir((dir) => {
    mkdirSync(path.join(dir, "some-worktree"), { recursive: true });
    mkdirSync(path.join(dir, "orphan-husk"), { recursive: true });
    // A stray FILE in the managed dir must not be admitted: everything this returns becomes a
    // candidate snapshot, and a candidate is something the reaper may delete.
    writeFileSync(path.join(dir, "notes.txt"), "not a worktree\n", "utf8");

    assert.deepEqual(
      defaultWorktreeIo.listChildDirs(dir).sort(),
      ["orphan-husk", "some-worktree"],
      "only directories are candidates",
    );

    // The catch arm: a repo with no `.claude/worktrees/` at all is the common case on a fresh clone,
    // and it must read as "nothing to scan", not blow up the SessionStart hook.
    assert.deepEqual(
      defaultWorktreeIo.listChildDirs(path.join(dir, "does-not-exist")),
      [],
      "an absent directory yields no candidates rather than throwing",
    );
  }),
);

// ---------------------------------------------------------------------------
// hasOwnGit — the husk guard, proven against a REAL nested checkout
// ---------------------------------------------------------------------------

test("defaultWorktreeIo.hasOwnGit: true for a real worktree (.git FILE) and the primary (.git DIR), false for a husk", () => {
  const live = addWorktree("live-one");
  const husk = addHusk("left-behind");

  // The two shapes differ on disk — a worktree's `.git` is a FILE, the primary's is a DIRECTORY —
  // and the production probe must accept both (it stats, it does not test for a file).
  assert.equal(defaultWorktreeIo.hasOwnGit(live), true, "a real worktree carries its own .git file");
  assert.equal(defaultWorktreeIo.hasOwnGit(primary), true, "the primary carries its own .git directory");
  assert.equal(defaultWorktreeIo.hasOwnGit(husk), false, "a husk has files but no git link of its own");
});

test("worktreeDirty over the REAL io: a husk never inherits the primary's dirty state (the guard git's walk-up would defeat)", () => {
  const live = addWorktree("clean-one");
  const husk = addHusk("husk-one");

  assert.equal(worktreeDirty(defaultWorktreeIo, live), false, "a freshly cut worktree is clean");

  // Make the PRIMARY genuinely dirty. Real git, asked inside the husk, walks UP and answers with
  // the primary's status — so without the hasOwnGit guard the husk would read dirty and be kept
  // forever. This is the case a fake `hasOwnGit` can assert but never actually demonstrate.
  writeFileSync(path.join(primary, "seed.txt"), "primary is dirty now\n", "utf8");
  assert.notEqual(git(["status", "--porcelain"], primary), "", "fixture precondition: the primary really is dirty");
  assert.notEqual(
    git(["-C", husk, "status", "--porcelain"], primary),
    "",
    "fixture precondition: real git INSIDE the husk walks up and reports the primary's changes",
  );

  assert.equal(
    worktreeDirty(defaultWorktreeIo, husk),
    false,
    "the husk has nothing of its own to lose — it must not inherit the primary's dirty state",
  );

  // …and a genuinely dirty worktree still reads dirty, so the guard above is not simply blind.
  writeFileSync(path.join(live, "seed.txt"), "edited in the worktree\n", "utf8");
  assert.equal(
    worktreeDirty(defaultWorktreeIo, live),
    true,
    "uncommitted work in a REAL worktree must still be seen",
  );
});

// ---------------------------------------------------------------------------
// removeDir — the destructive member (pure fs, no repo needed)
// ---------------------------------------------------------------------------

test(
  "defaultWorktreeIo.removeDir: really deletes a deep nested tree (the node_modules shape)",
  withTempDir((dir) => {
    const target = path.join(dir, "to-remove");
    const deep = path.join(target, "node_modules", ".pnpm", "some-pkg@1.0.0", "node_modules", "dist");
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, "index.js"), "// bytes\n", "utf8");
    writeFileSync(path.join(target, "top.txt"), "top\n", "utf8");

    defaultWorktreeIo.removeDir(target);
    assert.equal(existsSync(target), false, "the whole tree must be gone, not just its top level");

    // force:true — a target already gone is the reaper's success case, never an error.
    defaultWorktreeIo.removeDir(target);
    assert.equal(existsSync(target), false, "removing an absent dir is a no-op, not a throw");
  }),
);

/**
 * Hold `dir` open as a live child process's working directory. On Windows this is a real sharing
 * lock: the directory cannot be removed while the child lives, which is precisely the
 * "files held by a straggler process" condition `defaultRemoveDir`'s win32 arm was written for.
 */
async function withLockedDir(dir: string, fn: () => void): Promise<void> {
  const child = spawn(process.execPath, ["-e", "process.stdout.write('ready');setTimeout(()=>{},30000)"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "ignore"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the locking child never signalled ready")), 15_000);
      child.stdout?.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    fn();
  } finally {
    child.kill();
    // Give Windows a moment to actually release the handle before teardown deletes it.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

if (process.platform === "win32") {
  test(
    "defaultRemoveDir (win32 arm): a delete that cannot take THROWS — it never reports a phantom reap",
    withTempDir(async (dir) => {
      const target = path.join(dir, "held-open");
      mkdirSync(target, { recursive: true });
      writeFileSync(path.join(target, "held.txt"), "in use\n", "utf8");

      await withLockedDir(target, () => {
        // The full win32 ladder runs here and every rung fails: rmSync throws EPERM, the
        // `rmdir /s /q` fallback exits non-zero (sharing violation), and the final rmSync throws
        // again. The contract that matters is what happens NEXT — `removeOne` turns a throw into
        // `ok:false, method:"failed"`, so a swallowed error would print "reaped" for a directory
        // still sitting on disk, and the reaper's own summary would be a lie.
        assert.throws(
          () => defaultWorktreeIo.removeDir(target),
          "a delete that did not take must surface as a throw, not a silent success",
        );
        assert.equal(existsSync(target), true, "the locked directory is genuinely still there");
      });
    }),
  );
} else {
  test(
    "defaultRemoveDir (win32 arm) (skipped: win32-only fallback, and this host is not Windows)",
    { skip: true },
    () => {},
  );
}

// ---------------------------------------------------------------------------
// The whole default IO, composed — the production path end to end
// ---------------------------------------------------------------------------

test("resolveContext + gatherSnapshots over the REAL defaultWorktreeIo: registered and orphaned worktrees, from real git", () => {
  const live = addWorktree("registered-live");
  addHusk("orphan-husk");

  // `resolveContext` / `gatherSnapshots` ask git about the CURRENT checkout (no `-C`), so the
  // production path is only reachable by standing where a real caller stands. This file gets its own
  // process under `node --test`, so the chdir cannot leak into another test file.
  const cwd = process.cwd();
  process.chdir(primary);
  try {
    const ctx = resolveContext(defaultWorktreeIo);
    assert.equal(
      path.resolve(ctx.primaryRoot).toLowerCase(),
      path.resolve(primary).toLowerCase(),
      "the primary root is derived from git's own --git-common-dir",
    );
    assert.equal(
      path.resolve(ctx.worktreesDir).toLowerCase(),
      path.resolve(worktreesDir).toLowerCase(),
      "the managed dir hangs off the primary root",
    );

    const snapshots = gatherSnapshots(defaultWorktreeIo, ctx);
    const byName = new Map(snapshots.map((s) => [s.name, s]));

    const registered = byName.get("registered-live");
    assert.ok(registered, "the real `git worktree list --porcelain` output must yield the cut worktree");
    assert.equal(registered.kind, "registered");
    assert.equal(registered.branch, "claude/registered-live", "the refs/heads/ prefix is stripped");
    assert.equal(registered.detached, false);
    assert.equal(registered.locked, false);
    assert.equal(registered.merged, true, "a branch cut off origin/main with no commits is already merged");
    assert.ok(registered.mtimeMs > 0, "the real idle proxy found at least one activity signal");

    const orphan = byName.get("orphan-husk");
    assert.ok(orphan, "a dir git does not track must be gathered as an orphan");
    assert.equal(orphan.kind, "orphan");
    assert.equal(orphan.branch, null);
    assert.equal(orphan.locked, false, "git cannot lock what it does not track");

    // The primary itself is a registered worktree, but it lives OUTSIDE `.claude/worktrees/` and
    // must never enter the candidate set — the anchor the policy is forbidden to reap.
    assert.equal(
      snapshots.some((s) => path.resolve(s.path).toLowerCase() === path.resolve(primary).toLowerCase()),
      false,
      "the primary checkout is never gathered as a candidate",
    );

    // A real `git worktree lock` must reach the snapshot with its reason — the unconditional keep,
    // read here from git's own porcelain rather than a hand-written fixture string.
    git(["worktree", "lock", "--reason", "claude session registered-live (pid 4242)", live], primary);
    const relocked = gatherSnapshots(defaultWorktreeIo, ctx).find((s) => s.name === "registered-live");
    assert.equal(relocked?.locked, true, "a real lock is visible to the production parse");
    assert.equal(relocked?.lockReason, "claude session registered-live (pid 4242)");
    git(["worktree", "unlock", live], primary);
  } finally {
    process.chdir(cwd);
  }
});
