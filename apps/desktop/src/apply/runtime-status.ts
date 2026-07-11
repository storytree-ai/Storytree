// Runtime status for the desktop's /api/health (ADR-0181 Decision 3 — version visibility).
//
// The desktop serves a pinned-`main` runtime worktree (ADR-0181). This module answers the two
// questions that make its version VISIBLE and its staleness ACTIONABLE, alongside the code-stamp's
// running SHA (code-stamp.ts): which BRANCH the runtime worktree is on (it must be `main` — anything
// else is a misconfiguration the operator should see), and how many commits it is BEHIND `origin/main`
// (0 = up to date; N = a merged fix is waiting for a rebuild & relaunch). The behind count reflects the
// last `git fetch` — the rebuild fetches (rebuild.ts), so it refreshes on every apply; between applies
// it is an honest "as of last fetch" figure, never a live network hit on each health poll.
//
// Advisory + never throws (the code-stamp contract): no git / no repo / a slow spawn just yields null,
// and health answers without the field. The pure composition over injected readers is the CI-provable
// core; the real git spawns are the operator-attested sidecar glue.

import { execFile } from "node:child_process";

/** The /api/health `runtime` field — the runtime worktree's branch and its distance behind `main`. */
export interface RuntimeStatus {
  /** The branch the runtime worktree is on — expected `main`. null when git can't answer. */
  branch: string | null;
  /** Commits HEAD is BEHIND `origin/main` as of the last fetch (0 = current). null on any failure. */
  behind: number | null;
}

/**
 * `git rev-parse --abbrev-ref HEAD` in `root`; null on ANY failure (git missing, not a repo, timeout,
 * a detached HEAD prints `HEAD` which we surface verbatim — the caller reads "not main"). `windowsHide`
 * so the sidecar (no console) never pops a terminal per probe. git is a real .exe, so no shell.
 */
export function gitBranch(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: root, windowsHide: true, timeout: 5_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const branch = stdout.trim();
        resolve(branch.length > 0 ? branch : null);
      },
    );
  });
}

/**
 * `git rev-list --count HEAD..origin/main` in `root` — the number of commits `origin/main` is ahead of
 * HEAD (i.e. how far behind the runtime worktree is). null on ANY failure (no `origin/main` ref yet, git
 * missing, a non-numeric output). `windowsHide` for the console-less sidecar.
 */
export function gitBehindMain(root: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["rev-list", "--count", "HEAD..origin/main"],
      { cwd: root, windowsHide: true, timeout: 5_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const n = Number(stdout.trim());
        resolve(Number.isInteger(n) && n >= 0 ? n : null);
      },
    );
  });
}

/**
 * The raw `git fetch origin` in `root` — rejects on any failure (offline, no `origin`, timeout). Attested
 * glue like {@link gitBranch}; wrapped by {@link fetchOriginBestEffort}, which is what callers use.
 * `windowsHide` for the console-less sidecar; bounded by a short timeout so a wedged network can't hang.
 */
function gitFetchOrigin(root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("git", ["fetch", "origin"], { cwd: root, windowsHide: true, timeout: 20_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Best-effort `git fetch origin` so {@link gitBehindMain} reads a TRUTHFUL behind-count at launch. The
 * count is otherwise "as of the last fetch" (the rebuild fetches — ADR-0181 — but between rebuilds a
 * freshly-launched app under-reports and the update banner never fires). The desktop fires this ONCE at
 * startup when serving a pinned runtime worktree — a single launch fetch, NOT a per-poll network hit
 * (ADR-0181 keeps the health poll network-free).
 *
 * NEVER rejects: a failure (offline, no `origin`, a slow network) is swallowed so a network hiccup can
 * neither block nor crash sidecar startup — the behind-count then simply stays as of the previous fetch.
 * The `run` seam is injectable so this swallow-failures contract is unit-provable offline (no real git).
 */
export function fetchOriginBestEffort(
  root: string,
  run: (root: string) => Promise<void> = gitFetchOrigin,
): Promise<void> {
  return run(root).catch(() => undefined);
}

/**
 * The per-request runtime-status probe. Reads the runtime worktree's branch and its behind-`main`
 * distance each call (both advisory — a null from either just omits that field, never a throw).
 * `readBranch`/`readBehind` default to the real git reads; the test injects scripted readers so no
 * real git or repo is needed.
 */
export function createRuntimeStatusProbe(
  root: string,
  readBranch: (root: string) => Promise<string | null> = gitBranch,
  readBehind: (root: string) => Promise<number | null> = gitBehindMain,
): () => Promise<RuntimeStatus> {
  return async () => {
    const [branch, behind] = await Promise.all([readBranch(root), readBehind(root)]);
    return { branch, behind };
  };
}
