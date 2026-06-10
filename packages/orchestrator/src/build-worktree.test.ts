import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { createBuildWorktree, commitAuthored } from "./build-worktree.js";
import { gitTreeState } from "./prove-it-gate.js";

/**
 * The REAL-mode workspace helper (Phase F), tested against THIS repo's real git: a fresh detached
 * worktree is cut, the spine-side commit really commits, and teardown removes both the checkout
 * and the registration. All offline (local git only — no network, no SDK).
 */

/** repo root: packages/orchestrator/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

test("createBuildWorktree cuts a detached worktree at HEAD; commitAuthored earns real cleanliness; remove tears down", async () => {
  const wt = await createBuildWorktree(REPO_ROOT);
  try {
    // A real checkout of this repo at a real commit.
    assert.match(wt.headSha, /^[0-9a-f]{40}$/);
    await fs.access(path.join(wt.root, "package.json"));
    await fs.access(path.join(wt.root, "packages", "core", "src"));

    // Fresh = clean, at the same commit the worktree was cut from.
    const fresh = await gitTreeState(wt.root)();
    assert.equal(fresh.clean, true);
    assert.equal(fresh.commitSha, wt.headSha);

    // An authored (leaf-shaped) change dirties the REAL tree — no faking involved.
    const authored = path.join(wt.root, "packages", "core", "src", "wt-probe.txt");
    await fs.writeFile(authored, "authored inside the build worktree\n");
    const dirty = await gitTreeState(wt.root)();
    assert.equal(dirty.clean, false);

    // The spine-side commit: cleanliness is EARNED by a real commit, attributed to the signer.
    const committed = await commitAuthored({
      worktreeRoot: wt.root,
      message: "test: spine-side commit of authored files",
      author: "tester@example.com",
    });
    assert.equal(committed.committed, true);
    assert.notEqual(committed.commitSha, wt.headSha);
    const after = await gitTreeState(wt.root)();
    assert.equal(after.clean, true);
    assert.equal(after.commitSha, committed.commitSha);

    // Idempotent on an already-clean tree: nothing to commit, HEAD unchanged.
    const again = await commitAuthored({
      worktreeRoot: wt.root,
      message: "test: no-op",
      author: "tester@example.com",
    });
    assert.equal(again.committed, false);
    assert.equal(again.commitSha, committed.commitSha);
  } finally {
    await wt.remove();
  }

  // Teardown removed the checkout (and remove() is idempotent).
  await assert.rejects(fs.access(wt.root));
  await wt.remove();
});
