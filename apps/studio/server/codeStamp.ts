// Code stamp — the "checkout moved under a running server" probe for /api/health.
//
// The detached dev server (pnpm studio:up) keeps serving whatever code it loaded at start;
// after a git pull/merge the process is silently stale — new endpoints answer 404 ("unknown
// endpoint"), the served bundle is old, and the only schema-aware staleness signal (the
// library schemaVersion skew pair) never fires because routes, not schemas, moved (the
// 2026-06-14 /api/presence incident). The honest, backend-independent signal is the one this
// module computes: the git HEAD the server process STARTED on vs the checkout's HEAD on disk
// NOW. They differ → the checkout moved under the running server → restart it. No client-side
// build stamp is needed (and with Vite HMR a client stamp can skew independently anyway).
//
// Everything here is advisory and never throws: no git, no repo, or a slow spawn just means
// "no stamp" and health answers without the `code` field.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** The /api/health `code` field: what this server process serves vs what the checkout holds. */
export interface CodeStamp {
  /** Git HEAD when the server process started — the code it actually loaded. */
  startedAt: string;
  /** Git HEAD on disk now. */
  head: string;
  /** `head !== startedAt`: the checkout moved under the running server → restart needed. */
  stale: boolean;
  /**
   * IDENTITY, not staleness: the absolute directory this server process reads git from — WHICH
   * copy of the code it is serving. The three fields above compare the running copy against
   * ITSELF, so they stay green in the failure this one exists for: every change on this project is
   * written in a worktree, but the harness preview tool starts the dev server in the directory the
   * SESSION was launched from (the main checkout), so an agent can verify a visual change against
   * a page rendered from UNCHANGED code and record it as proof. Measured once, August 2026. The
   * preview tool is harness code and this repo holds only the server list it reads, so no change
   * here can alter the directory — hence detection rather than prevention. One command now answers
   * "is this page my working copy?" (`verification-integrity-arc`, owner-chosen option 2 of three).
   *
   * READ FROM THE RUNNING PROCESS, never from the request: it is the root captured when the probe
   * was constructed at server start, `path.resolve`d, and it is the same directory every `git`
   * call below is spawned in. A field reporting what the caller already believes would be a green
   * check that verified nothing.
   *
   * ⚠ ONE CONFIGURED INPUT, named rather than left silent. `resolveStudioPaths` resolves this root
   * as explicit-override > `STORYTREE_REPO_ROOT` > derived-from-the-studio-root (ADR-0246, the
   * foreign-project forest), so under an override it names the CONTENT root, which need not be the
   * tree the server's own module graph was loaded from. It is still process state rather than
   * request or build-time state, and it is deliberately the directory git is read from, because
   * reporting any OTHER directory than the one `stale` is computed in would make this response
   * internally inconsistent. In the ordinary un-overridden case — every dev session — the two are
   * the same tree.
   */
  directory: string;
  /**
   * The branch of that same directory, `git rev-parse --abbrev-ref HEAD`. Git's literal answer,
   * passed through: `HEAD` means a DETACHED checkout, which is a real and common state for the
   * main checkout on this box (the worktree-repair hook detaches it in place) and is exactly the
   * signal that the served copy is not a worktree. Omitted, never `undefined`, when git can't name
   * one — the whole module is advisory.
   */
  branch?: string;
}

/**
 * One `git rev-parse HEAD` attempt in `repoRoot`; null on ANY failure (git missing, not a repo,
 * a transiently-held ref lock, timeout, a non-sha output).
 * windowsHide because the detached studio server has no console — without it every spawn pops
 * a terminal window on Windows (the dbControl.ts lesson). git is a real .exe, so no shell.
 */
function gitHeadOnce(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: repoRoot, windowsHide: true, timeout: 5_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const sha = stdout.trim();
        resolve(/^[0-9a-f]{40,64}$/.test(sha) ? sha : null);
      },
    );
  });
}

/**
 * Call `read` until it returns non-null, retrying once per entry in `backoffsMs` (sleeping that
 * long before each retry). Returns the first non-null result, or null if every attempt — the
 * initial read plus all retries — yielded null. A successful first read pays no backoff.
 *
 * The retry knob behind {@link gitHead}, kept PURE of git so the transient-failure handling is
 * unit-testable without spawning a real, racy `rev-parse` (the same reason {@link buildCodeStamp}
 * is split out): a fake reader proves "retries then succeeds" and "gives up after N" deterministically.
 */
export async function readWithRetry<T>(
  read: () => Promise<T | null>,
  backoffsMs: readonly number[],
): Promise<T | null> {
  let value = await read();
  for (let i = 0; value === null && i < backoffsMs.length; i++) {
    await delay(backoffsMs[i]!);
    value = await read();
  }
  return value;
}

/**
 * Backoffs for {@link gitHead}'s retries: three tries after the first read, ~350ms total. Sized
 * to outlast a briefly-held ref lock, not a real outage — a genuine "not a repo" fails fast on
 * every attempt and still returns null promptly.
 */
const GIT_HEAD_BACKOFFS_MS = [50, 100, 200] as const;

/**
 * `git rev-parse HEAD` in `repoRoot`; null when there is genuinely no answer (git missing, not a
 * repo). Retries a null read a few times with a short backoff first: a single `rev-parse` can
 * transiently fail while a ref lock is briefly held by concurrent git in the SAME checkout — a
 * merge landing, or a parallel `git worktree` op sharing the linked-worktree refs (which also
 * flaked this module's own suite under `pnpm -r test`, where the `@storytree/cli` git tests churn
 * worktrees next to it). The reads that matter are ONE-SHOT — the server-start `startedAt` capture
 * in {@link createCodeStampProbe} — so a transient null there would LASTINGLY disable the staleness
 * signal for that process; a bounded retry buys real robustness. Never throws.
 */
export function gitHead(repoRoot: string): Promise<string | null> {
  return readWithRetry(() => gitHeadOnce(repoRoot), GIT_HEAD_BACKOFFS_MS);
}

/**
 * One `git rev-parse --abbrev-ref HEAD` attempt in `repoRoot`; null on ANY failure, same contract
 * and same `windowsHide` reason as {@link gitHeadOnce}. Accepts git's answer verbatim — including
 * the literal `HEAD` of a detached checkout — rejecting only what cannot be a ref name: empty,
 * whitespace-bearing (`git check-ref-format` forbids it), or absurdly long.
 */
function gitBranchOnce(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoRoot, windowsHide: true, timeout: 5_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const name = stdout.trim();
        resolve(/^\S{1,255}$/.test(name) ? name : null);
      },
    );
  });
}

/**
 * `git rev-parse --abbrev-ref HEAD` in `repoRoot`; null when there is genuinely no answer. Shares
 * {@link gitHead}'s bounded retry for the same ref-lock reason — it is read from the same checkout,
 * at the same moment, and a concurrent git op that can flake one can flake the other. Never throws.
 */
export function gitBranch(repoRoot: string): Promise<string | null> {
  return readWithRetry(() => gitBranchOnce(repoRoot), GIT_HEAD_BACKOFFS_MS);
}

/**
 * Pure comparison half, unit-testable without moving HEAD: null unless both shas resolved.
 *
 * `directory` is required because a stamp with no identity is what the caller already had; `branch`
 * is optional and is OMITTED rather than set to `undefined` when absent (`exactOptionalPropertyTypes`
 * — an explicit `undefined` would serialise as a missing key anyway, but the type would lie).
 */
export function buildCodeStamp(
  startedAt: string | null,
  head: string | null,
  directory: string,
  branch: string | null,
): CodeStamp | null {
  if (!startedAt || !head) return null;
  const stamp: CodeStamp = { startedAt, head, stale: head !== startedAt, directory };
  if (branch) stamp.branch = branch;
  return stamp;
}

/**
 * Capture HEAD ONCE, at server start (call this from configureServer — dev-only, and before
 * any pull can land), and return the per-request probe: re-read HEAD from disk and compare.
 *
 * The DIRECTORY is captured once too, and from the argument this probe was constructed with —
 * that is what makes it the running process's own state rather than anything a request could
 * colour. The BRANCH is re-read per request beside `head`, because both describe the checkout as
 * it is NOW (only `startedAt` describes load time), so it can never go stale. The two reads run
 * concurrently: a health poll every few seconds now spawns two short-lived gits instead of one,
 * but pays one git's latency, not two — fine for a dev server.
 */
export function createCodeStampProbe(repoRoot: string): () => Promise<CodeStamp | null> {
  const directory = path.resolve(repoRoot);
  const startedAt = gitHead(directory);
  return async () => {
    const [head, branch] = await Promise.all([gitHead(directory), gitBranch(directory)]);
    return buildCodeStamp(await startedAt, head, directory, branch);
  };
}
