import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createBuildWorktree,
  commitAuthored,
  promoteRealPass,
  platformShellCommand,
  runRegressionSuite,
  runWorktreeTypecheck,
} from "./build-worktree.js";
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
    await fs.access(path.join(wt.root, "packages", "base", "src"));

    // Fresh = clean, at the same commit the worktree was cut from.
    const fresh = await gitTreeState(wt.root)();
    assert.equal(fresh.clean, true);
    assert.equal(fresh.commitSha, wt.headSha);

    // An authored (leaf-shaped) change dirties the REAL tree — no faking involved.
    const authored = path.join(wt.root, "packages", "base", "src", "wt-probe.txt");
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

// ── Fixture repos for promotion tests (NEVER this repo — branch refs must not pollute it) ─

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error === null) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} failed: ${error.message}\n${stderr}`));
    });
  });
}

/** A throwaway local repo with one commit (identity pinned — no global config reliance). */
async function fixtureRepo(): Promise<{ root: string; sha: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-promote-fixture-"));
  await git(["init", "-b", "main"], root);
  await git(["config", "user.email", "tester@example.com"], root);
  await git(["config", "user.name", "fixture"], root);
  await git(["config", "commit.gpgsign", "false"], root);
  await fs.writeFile(path.join(root, "a.txt"), "fixture\n");
  await git(["add", "-A"], root);
  await git(["commit", "-m", "fixture: initial"], root);
  const sha = (await git(["rev-parse", "HEAD"], root)).trim();
  return { root, sha };
}

test("promoteRealPass parks the proven commit on a run-unique branch (no origin → local only, kept)", async () => {
  const fixture = await fixtureRepo();
  try {
    const promoted = await promoteRealPass({
      repoRoot: fixture.root,
      unitId: "some-node",
      runId: "real-test1",
      commitSha: fixture.sha,
    });
    assert.equal(promoted.branch, "claude/real/some-node-real-test1");
    assert.equal(promoted.commitSha, fixture.sha);
    assert.equal(promoted.pushed, false);
    assert.match(promoted.detail, /no origin remote/);
    // The branch ref REALLY points at the proven commit (preservation is real, not reported).
    const tip = (await git(["rev-parse", promoted.branch], fixture.root)).trim();
    assert.equal(tip, fixture.sha);

    // A retried run gets a FRESH branch (runId in the name — no collision with the first).
    const retry = await promoteRealPass({
      repoRoot: fixture.root,
      unitId: "some-node",
      runId: "real-test2",
      commitSha: fixture.sha,
    });
    assert.equal(retry.branch, "claude/real/some-node-real-test2");
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

test("promoteRealPass pushes to origin when one exists; push:false withholds but still parks", async () => {
  const fixture = await fixtureRepo();
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-promote-origin-"));
  try {
    await git(["init", "--bare", "-b", "main"], bare);
    await git(["remote", "add", "origin", bare], fixture.root);

    const promoted = await promoteRealPass({
      repoRoot: fixture.root,
      unitId: "pushed-node",
      runId: "real-test3",
      commitSha: fixture.sha,
    });
    assert.equal(promoted.pushed, true);
    assert.match(promoted.detail, /pushed to /);
    // The proven commit reached origin — the branch tip in the bare repo IS the verdict's sha.
    const originTip = (await git(["rev-parse", "refs/heads/" + promoted.branch], bare)).trim();
    assert.equal(originTip, fixture.sha);

    // push:false (regression-red preservation): local branch exists, origin never sees it.
    const withheld = await promoteRealPass({
      repoRoot: fixture.root,
      unitId: "pushed-node",
      runId: "real-test4",
      commitSha: fixture.sha,
      push: false,
    });
    assert.equal(withheld.pushed, false);
    assert.match(withheld.detail, /withheld/);
    const localTip = (await git(["rev-parse", withheld.branch], fixture.root)).trim();
    assert.equal(localTip, fixture.sha);
    await assert.rejects(git(["rev-parse", "refs/heads/" + withheld.branch], bare));
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
    await fs.rm(bare, { recursive: true, force: true });
  }
});

test("createBuildWorktree install seam: the injected installer runs in the worktree; a failure tears the worktree down and throws", async () => {
  const seen: string[] = [];
  const wt = await createBuildWorktree(REPO_ROOT, {
    install: true,
    installRunner: async (root) => {
      seen.push(root);
    },
  });
  try {
    assert.equal(seen.length, 1);
    assert.equal(seen[0], wt.root);
  } finally {
    await wt.remove();
  }

  // Install failure: fail-closed — no half-installed worktree survives to look buildable.
  await assert.rejects(
    createBuildWorktree(REPO_ROOT, {
      install: true,
      installRunner: async () => {
        throw new Error("simulated pnpm failure");
      },
    }),
    /dependency install failed/,
  );
});

test("createBuildWorktree addDeps seam: the injected dep-adder runs AFTER install; a failure tears the worktree down and throws (ADR-0064 §2)", async () => {
  const order: string[] = [];
  let addRoot: string | undefined;
  const wt = await createBuildWorktree(REPO_ROOT, {
    install: true,
    installRunner: async () => {
      order.push("install");
    },
    addDeps: [{ packageName: "@storytree/core", deps: ["tree-sitter", "tree-sitter-typescript"] }],
    addDepsRunner: async (root, groups) => {
      addRoot = root;
      order.push("add:" + groups.map((g) => `${g.packageName}=${g.deps.join(",")}`).join("|"));
    },
  });
  try {
    // The dep-adder ran in the worktree root, AFTER install, with the exact group forwarded.
    assert.equal(addRoot, wt.root, "the dep-adder runs in the worktree root");
    assert.deepEqual(order, ["install", "add:@storytree/core=tree-sitter,tree-sitter-typescript"]);
  } finally {
    await wt.remove();
  }

  // A failed `pnpm add` tears the worktree down + throws (fail-closed, same posture as install).
  await assert.rejects(
    createBuildWorktree(REPO_ROOT, {
      install: true,
      installRunner: async () => {},
      addDeps: [{ packageName: "@storytree/core", deps: ["does-not-exist"] }],
      addDepsRunner: async () => {
        throw new Error("simulated pnpm add failure");
      },
    }),
    /spine dependency add.*failed.*torn down/s,
  );
});

test("runWorktreeTypecheck / runRegressionSuite observe green/red by exit code only (offline node -e)", async () => {
  // The same honest observation the gate makes — exit 0 is the only green channel. Offline by
  // construction: the command IS the seam (any file+argv), so a `node -e` stands in for tsc/pnpm.
  const cmd = (script: string): { file: string; args: string[] } => ({
    file: process.execPath,
    args: ["-e", script],
  });

  const tcGreen = await runWorktreeTypecheck({ command: cmd("process.exit(0)"), cwd: os.tmpdir() });
  assert.equal(tcGreen.result, "green");
  // The declare-presence lesson: a type error is a RED (exit non-zero), never an exception — the
  // caller turns it into push-withheld, not a crash.
  const tcRed = await runWorktreeTypecheck({
    command: cmd("console.error('error TS2375: exactOptionalPropertyTypes'); process.exit(2)"),
    cwd: os.tmpdir(),
  });
  assert.equal(tcRed.result, "red");

  const suiteGreen = await runRegressionSuite({ command: cmd("process.exit(0)"), cwd: os.tmpdir() });
  assert.equal(suiteGreen.result, "green");
  const suiteRed = await runRegressionSuite({ command: cmd("process.exit(1)"), cwd: os.tmpdir() });
  assert.equal(suiteRed.result, "red");
});

test("platformShellCommand wraps pnpm via cmd.exe on win32 and passes everything else through", () => {
  const pnpm = { file: "pnpm", args: ["--filter", "@storytree/core", "test"], cwd: "/x" };
  const onWin = platformShellCommand(pnpm, "win32");
  assert.notEqual(onWin.file, "pnpm");
  assert.match(onWin.file, /cmd/i);
  assert.deepEqual(onWin.args, ["/d", "/s", "/c", "pnpm", "--filter", "@storytree/core", "test"]);
  assert.equal(onWin.cwd, "/x");

  const onLinux = platformShellCommand(pnpm, "linux");
  assert.deepEqual(onLinux, pnpm);

  const node = { file: process.execPath, args: ["-e", "0"] };
  assert.deepEqual(platformShellCommand(node, "win32"), node);
});

test("platformShellCommand preserves per-command env through the win32 pnpm rewrap (ADR-0064)", () => {
  // The DB-backed proof forces STORYTREE_DB_NAME via cmd.env; the win32 cmd.exe rewrap must carry it
  // through, or a db-backed pnpm proof would lose its isolated-DB env on Windows.
  const pnpm = {
    file: "pnpm",
    args: ["--filter", "@storytree/store", "test"],
    cwd: "/ws",
    env: { STORYTREE_DB_NAME: "storytree_test" },
  };
  const onWin = platformShellCommand(pnpm, "win32");
  assert.match(onWin.file, /cmd/i);
  assert.deepEqual(onWin.env, { STORYTREE_DB_NAME: "storytree_test" });
  // Passthrough (non-pnpm or non-win32) returns the command verbatim — env already present.
  assert.deepEqual(platformShellCommand(pnpm, "linux"), pnpm);
});
