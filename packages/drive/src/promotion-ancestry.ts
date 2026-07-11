/**
 * The pure core of reliability gate `drive-machinery#gate-5` — Story UAT leg 4 ("Land it"), ADR-0184.
 *
 * Leg 4's success condition — "the proven commit is reachable from `main`" — is a free, deterministic
 * git-ancestry fact, not a human judgment. A commit promoted NON-SQUASH stays an ancestor of the
 * trunk; a squash-merge orphans its original SHA (a NEW commit replaces it). So a proven commit being
 * an ancestor of HEAD proves BOTH halves of leg 4 at once: it reached the mainline AND was not
 * squashed away.
 *
 * This module is pure (the git calls are behind an injected {@link CommitOracle}), so its teeth are
 * covered by a shallow-safe `*.test.ts`. The git-touching runnable that the gate actually invokes is
 * `promotion-ancestry.check.ts` (kept out of `pnpm -r test` because it pins real landed commits that a
 * shallow CI checkout lacks).
 */
import { execFileSync } from "node:child_process";

/** One attested REAL-proof commit: a spine-signed `--real` verdict promoted non-squash into `main`. */
export interface ProvenCommit {
  readonly sha: string;
  readonly node: string;
}

/**
 * The drive machinery's attested REAL-proof commits (`stories/drive-machinery/story.md`). Add a row
 * when a new drive-machinery node earns a signed REAL verdict that lands.
 */
export const PROVEN_COMMITS: readonly ProvenCommit[] = [
  { sha: "0e8f4ba", node: "verdict-line" },
  { sha: "47c9e43", node: "node-resolve-report" },
  { sha: "c49e179", node: "uat-machine-proof-binding" },
  { sha: "28be1de", node: "uat-machine-gate-resolution" },
  { sha: "a7389fb", node: "uat-bound-command-adoption" },
];

/** Answers, for one commit sha, whether git can see the object and whether it is an ancestor of HEAD. */
export interface CommitOracle {
  present(sha: string): boolean;
  ancestorOfHead(sha: string): boolean;
}

/**
 * PURE: the proven commits git can no longer reach from HEAD — an empty list means every proof is in
 * the mainline history. A present-but-not-ancestor commit was squashed away / orphaned; an absent
 * object cannot be verified (and so is reported, not silently passed).
 */
export function orphanedProvenCommits(
  commits: readonly ProvenCommit[],
  oracle: CommitOracle,
): string[] {
  const orphaned: string[] = [];
  for (const { sha, node } of commits) {
    if (!oracle.present(sha)) {
      orphaned.push(`${sha} (${node}) — commit object not found`);
    } else if (!oracle.ancestorOfHead(sha)) {
      orphaned.push(`${sha} (${node}) — NOT an ancestor of HEAD (squashed away / orphaned?)`);
    }
  }
  return orphaned;
}

/** The real git-backed oracle. Each probe throws-to-false, so a missing object reads as absent. */
export function realGitOracle(): CommitOracle {
  return {
    present(sha: string): boolean {
      try {
        execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
    ancestorOfHead(sha: string): boolean {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** True when the checkout is a shallow clone (old proof-commit objects would be absent). */
export function isShallowClone(): boolean {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim() ===
      "true"
    );
  } catch {
    return false;
  }
}
