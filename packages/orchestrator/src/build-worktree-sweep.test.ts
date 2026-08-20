import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_TEMP_PREFIX,
  STALE_BUILD_WORKTREE_MS,
  createBuildWorktree,
  sweepStaleBuildWorktrees,
} from "./build-worktree.js";

/**
 * The stale build-worktree sweep (arc worktree-reaper-eligibility, increment 2).
 *
 * The defect these lock down: teardown is best-effort, so a Windows file-lock it could not outlast
 * left the temp tree on disk — and the comment that handed that residue to `storytree worktree
 * prune` was wrong, because the reaper's universe is filtered to `.claude/worktrees/` and a path
 * under the OS temp dir was never LOOKED AT. Measured on the dev box 2026-08-20 before this landed:
 * 241 stale `storytree-real-*` trees, oldest 2026-07-04, 6.6 GB across 188,043 files.
 *
 * Every case here runs against its OWN fake temp dir with an injected clock, so nothing touches the
 * real one — except the last, which proves the wiring on a real mint.
 */

/** repo root: packages/orchestrator/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

const NOW = Date.UTC(2026, 7, 20, 12, 0, 0);
const HOUR = 3_600_000;

/**
 * Make a directory under `tmp` whose mtime reads `ageH` hours before {@link NOW}.
 *
 * `fill` runs BEFORE the clock is set, because writing into a directory bumps the directory's own
 * mtime — which is exactly the activity proxy the sweep reads, and the reason a tree still being
 * written into can never age out from under a live build.
 */
async function aged(
  tmp: string,
  name: string,
  ageH: number,
  fill?: (dir: string) => Promise<void>,
): Promise<string> {
  const dir = path.join(tmp, name);
  await fs.mkdir(dir, { recursive: true });
  if (fill !== undefined) await fill(dir);
  const when = new Date(NOW - ageH * HOUR);
  await fs.utimes(dir, when, when);
  return dir;
}

async function fakeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "sweep-fixture-"));
}

test("sweeps a stale untracked temp tree, holds the fresh one, the tracked one, and anything not ours", async () => {
  const tmp = await fakeTmp();
  try {
    // Content, so a bare rmdir would not be enough to make this pass.
    const stale = await aged(tmp, `${BUILD_TEMP_PREFIX}staleXX`, 200, (d) =>
      fs.writeFile(path.join(d, "node_modules.txt"), "1.4 GB, in spirit\n"),
    );
    const fresh = await aged(tmp, `${BUILD_TEMP_PREFIX}freshXX`, 2);
    // A live build registers `<parent>/wt`, so the PARENT is protected by its child's registration.
    const tracked = await aged(tmp, `${BUILD_TEMP_PREFIX}liveXXX`, 200, async (d) => {
      await fs.mkdir(path.join(d, "wt"), { recursive: true });
    });
    const foreign = await aged(tmp, "someone-elses-tempdir", 200);

    const result = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW,
      listRegistered: async () => [path.join(tracked, "wt")],
    });

    assert.equal(result.scanned, 3, "only the three prefixed dirs are ours to consider");
    assert.deepEqual(result.swept, [stale]);
    assert.equal(result.held, 2);

    // The RED this replaces: before the sweep existed, `stale` outlived every build forever.
    await assert.rejects(() => fs.stat(stale), "the stale tree is gone");
    await fs.stat(fresh);
    await fs.stat(tracked);
    await fs.stat(foreign);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("the threshold is the reaper's own 48h, and it is the only thing holding a fresh tree back", async () => {
  const tmp = await fakeTmp();
  try {
    // 47 h old: inside the threshold by an hour, so a concurrent build cannot be swept out from
    // under itself even once it has torn its registration down.
    const nearly = await aged(tmp, `${BUILD_TEMP_PREFIX}nearlyX`, 47);
    const held = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW,
      listRegistered: async () => [],
    });
    assert.deepEqual(held.swept, []);
    await fs.stat(nearly);

    // The same tree, one hour later.
    const swept = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW + HOUR,
      listRegistered: async () => [],
    });
    assert.deepEqual(swept.swept, [nearly]);
    assert.equal(STALE_BUILD_WORKTREE_MS, 48 * HOUR);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("the sweep is capped, so housekeeping can never stall a mint; the rest waits for the next one", async () => {
  const tmp = await fakeTmp();
  try {
    for (const n of ["a", "b", "c", "d", "e"]) await aged(tmp, `${BUILD_TEMP_PREFIX}cap${n}XX`, 200);
    const first = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW,
      cap: 2,
      listRegistered: async () => [],
    });
    assert.equal(first.swept.length, 2);
    assert.equal(first.held, 3);

    const second = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW,
      cap: 2,
      listRegistered: async () => [],
    });
    assert.equal(second.swept.length, 2);
    assert.equal((await fs.readdir(tmp)).length, 1, "progress every mint, never all at once");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("liveness it cannot establish holds EVERYTHING — a sweep never guesses about a build in flight", async () => {
  const tmp = await fakeTmp();
  try {
    const ancient = await aged(tmp, `${BUILD_TEMP_PREFIX}oldXXX`, 2000);
    const result = await sweepStaleBuildWorktrees(REPO_ROOT, {
      tmpDir: tmp,
      now: NOW,
      listRegistered: async () => {
        throw new Error("git worktree list failed");
      },
    });
    assert.deepEqual(result.swept, []);
    assert.equal(result.held, 1);
    await fs.stat(ancient);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test("an absent temp dir is a no-op, not a build failure", async () => {
  const result = await sweepStaleBuildWorktrees(REPO_ROOT, {
    tmpDir: path.join(os.tmpdir(), "sweep-fixture-does-not-exist-9f2a"),
    now: NOW,
    listRegistered: async () => [],
  });
  assert.deepEqual(result, { scanned: 0, swept: [], held: 0 });
});

test("every mint runs the sweep — the delegation the old teardown comment made now lands somewhere", async () => {
  const tmp = await fakeTmp();
  try {
    const stale = await aged(tmp, `${BUILD_TEMP_PREFIX}mintXXX`, 500);
    const wt = await createBuildWorktree(REPO_ROOT, {
      sweepStale: { tmpDir: tmp, now: NOW, listRegistered: async () => [] },
    });
    try {
      await assert.rejects(() => fs.stat(stale), "the mint swept the residue of the mints before it");
    } finally {
      await wt.remove();
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
