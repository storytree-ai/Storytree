/**
 * The REAL-mode build workspace (drive-machinery Phase F): a FRESH, DETACHED git worktree of the
 * driving repo, so the leaf authors against the node's real source at real repo paths while the
 * session's own working tree stays untouched. The worktree shares the repo's object store, so the
 * spine's post-green commit (see {@link commitAuthored}) is a REAL commit object the signed
 * verdict's `commitSha` points at — the GATE's clean-tree check then reads genuine `git status`,
 * never an injected fake.
 *
 * Lifecycle honesty: after {@link BuildWorktree.remove} the authored commit is UNREFERENCED
 * (dangling — recoverable until gc, but on no branch). Landing an authored change is later work
 * (promotion); iteration one proves the drive, it does not merge code.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

/** A live build worktree: the checkout root, the HEAD it was cut from, and its own teardown. */
export interface BuildWorktree {
  /** The worktree checkout root (the leaf's cwd and the proof command's cwd). */
  root: string;
  /** The commit the worktree was cut from (`git rev-parse HEAD` at creation). */
  headSha: string;
  /** Remove the worktree registration and the temp directory (best-effort, idempotent). */
  remove(): Promise<void>;
}

/**
 * Cut a fresh detached worktree of `repoRoot`'s HEAD under the OS temp dir. The directory is
 * created by `git worktree add` itself (inside a private mkdtemp parent so teardown can remove
 * everything even if git's own removal hiccups).
 */
export async function createBuildWorktree(repoRoot: string): Promise<BuildWorktree> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-real-"));
  const root = path.join(parent, "wt");
  await runGit(["worktree", "add", "--detach", root, "HEAD"], repoRoot);
  const headSha = (await runGit(["rev-parse", "HEAD"], root)).trim();

  let removed = false;
  return {
    root,
    headSha,
    remove: async (): Promise<void> => {
      if (removed) return;
      removed = true;
      try {
        await runGit(["worktree", "remove", "--force", root], repoRoot);
      } catch {
        // Best-effort: fall through to the directory removal + prune below.
      }
      await fs.rm(parent, { recursive: true, force: true });
      try {
        await runGit(["worktree", "prune"], repoRoot);
      } catch {
        // Pruning is housekeeping; a failure here must not mask the build result.
      }
    },
  };
}

/**
 * The SPINE-side commit of whatever the leaf authored (Phase F's clean-tree answer): called after
 * CONFIRM_GREEN, before the GATE reads the tree, so the gate's clean-tree requirement is met by a
 * REAL commit — never by faking `clean: true`. Attribution is explicit: the committer identity is
 * the spine acting for the resolved signer (passed per-command, no global config touched).
 *
 * Returns `committed: false` when the tree is already clean (nothing authored — the gate will then
 * attest the unchanged HEAD, which is honest: the proof ran against what HEAD already held).
 */
export async function commitAuthored(args: {
  worktreeRoot: string;
  message: string;
  /** The signer the commit is attributed to (email; the name is the spine's fixed identity). */
  author: string;
}): Promise<{ committed: boolean; commitSha: string }> {
  const porcelain = (await runGit(["status", "--porcelain"], args.worktreeRoot)).trim();
  if (porcelain.length === 0) {
    const sha = (await runGit(["rev-parse", "HEAD"], args.worktreeRoot)).trim();
    return { committed: false, commitSha: sha };
  }
  await runGit(["add", "-A"], args.worktreeRoot);
  await runGit(
    [
      "-c",
      "user.name=storytree-spine",
      "-c",
      `user.email=${args.author}`,
      "commit",
      "-m",
      args.message,
    ],
    args.worktreeRoot,
  );
  const sha = (await runGit(["rev-parse", "HEAD"], args.worktreeRoot)).trim();
  return { committed: true, commitSha: sha };
}

/** Run a git command in `cwd`, resolving stdout; rejects (loud) on a non-zero exit. */
function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(`git ${args.join(" ")} failed in ${cwd}: ${error.message}\n${stderr}`, {
          cause: error,
        }),
      );
    });
  });
}
