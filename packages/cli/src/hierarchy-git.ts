import { execFileSync } from "node:child_process";

/**
 * The git reads the work-hierarchy projection is stamped and judged by (`map-freshness-arc` inc-02).
 *
 * Everything here answers with `null` on any failure rather than throwing, for the reason
 * `check-ownership-totality.ts`'s own `git()` gives: each CALLER decides what its absence means, and
 * keeping that decision at the call site is what lets a failure name WHICH read broke. "No
 * `origin/main` here" and "`stories/` is not in this tree" are different repairs.
 *
 * ## Why a TREE id and not a commit
 *
 * `git rev-parse <ref>:stories` is the git object id of the `stories/` DIRECTORY at that ref — a
 * content hash over the whole subtree. Two commits whose `stories/` are byte-identical share it, so
 * it answers "is this the same tree?" exactly, across squash merges, rebases and merge refs, none of
 * which preserve a commit sha. That is the property the freshness rule needs and a commit sha cannot
 * give (a squashed branch's commits do not exist on `main` at all).
 */

/** Run git at `root`, returning trimmed stdout — or `null` on ANY failure. */
export function git(root: string, args: readonly string[]): string | null {
  try {
    const out = execFileSync("git", [...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/** The env var that repoints the freshness comparison at another ref (CI, a fork, a probe). */
export const BASE_REF_ENV = "STORYTREE_HIERARCHY_BASE_REF";

/** The ref the mirror is judged against: the env override, else `origin/main`. */
export function resolveBaseRef(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[BASE_REF_ENV]?.trim();
  return override !== undefined && override.length > 0 ? override : "origin/main";
}

/** The git tree object id of `stories/` at `ref` — the freshness key. `null` if `ref` is unknown. */
export function storiesTreeSha(root: string, ref: string): string | null {
  return git(root, ["rev-parse", `${ref}:stories`]);
}

/** The commit `ref` names. Provenance only — never judged (a squash merge discards it). */
export function commitShaOf(root: string, ref: string): string | null {
  return git(root, ["rev-parse", ref]);
}

/** `ref`'s committer date, ISO-8601 — how the judge tells a stale mirror from a stale local ref. */
export function committedAt(root: string, ref: string): string | null {
  return git(root, ["log", "-1", "--format=%cI", ref]);
}

/**
 * Whether `stories/` carries uncommitted changes, including untracked files.
 *
 * Load-bearing in BOTH callers. The loader refuses to stamp a dirty tree, because the stamp would
 * name a tree id that does not describe what was actually projected — a mirror carrying a confident,
 * wrong provenance is worse than no mirror. The check declines to compare a dirty tree, because an
 * unstaged edit is in no tree id and would read as a store that had drifted.
 *
 * `null` when git could not answer — which both callers treat as dirty, fail-closed.
 */
export function storiesDirty(root: string): boolean | null {
  const out = git(root, ["status", "--porcelain", "--", "stories"]);
  return out === null ? null : out.length > 0;
}
