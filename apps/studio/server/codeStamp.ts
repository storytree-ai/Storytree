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
 * `git rev-parse HEAD` in `repoRoot`; null on ANY failure (git missing, not a repo, timeout).
 * windowsHide because the detached studio server has no console — without it every spawn pops
 * a terminal window on Windows (the dbControl.ts lesson). git is a real .exe, so no shell.
 */
export function gitHead(repoRoot: string): Promise<string | null> {
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
