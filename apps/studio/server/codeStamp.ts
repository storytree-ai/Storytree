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
import { setTimeout as delay } from 'node:timers/promises';

/** The /api/health `code` field: what this server process serves vs what the checkout holds. */
export interface CodeStamp {
  /** Git HEAD when the server process started — the code it actually loaded. */
  startedAt: string;
  /** Git HEAD on disk now. */
  head: string;
  /** `head !== startedAt`: the checkout moved under the running server → restart needed. */
  stale: boolean;
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

/** Pure comparison half, unit-testable without moving HEAD: null unless both shas resolved. */
export function buildCodeStamp(startedAt: string | null, head: string | null): CodeStamp | null {
  if (!startedAt || !head) return null;
  return { startedAt, head, stale: head !== startedAt };
}

/**
 * Capture HEAD ONCE, at server start (call this from configureServer — dev-only, and before
 * any pull can land), and return the per-request probe: re-read HEAD from disk and compare.
 * A health poll every few seconds spawns one short-lived git each — fine for a dev server.
 */
export function createCodeStampProbe(repoRoot: string): () => Promise<CodeStamp | null> {
  const startedAt = gitHead(repoRoot);
  return async () => buildCodeStamp(await startedAt, await gitHead(repoRoot));
}
