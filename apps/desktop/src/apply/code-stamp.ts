// Code stamp for the desktop sidecar's /api/health (ADR-0164 Phase 1 — the Rail-2 trigger signal).
//
// The Rail-2 trigger for a rebuild is "the checkout's git-HEAD ADVANCED under the running app" — a
// merged fix was fast-forwarded in. The hosted/dev studio already computes this (apps/studio/server/
// codeStamp.ts) and the shared StoreBanner already RENDERS it (the "checkout moved" banner). But the
// desktop app is served by THIS sidecar, whose /api/health never carried the `code` field — so the
// banner never fired in the desktop app, and there was nothing to turn into an action.
//
// This is a deliberate RE-COMPOSITION, not an import of apps/studio/server (a forbidden surface→surface
// coupling, ADR-0100 — the whole sidecar re-composes its drivers). The pure comparison `buildCodeStamp`
// is the CI-provable core; the git reads are the operator-attested sidecar glue. Everything here is
// advisory and never throws: no git / no repo / a slow spawn just means "no stamp" and health answers
// without the `code` field (the same contract the studio helper honours).

import { execFile } from "node:child_process";

/** The /api/health `code` field — what the running server serves vs what the checkout holds now. */
export interface CodeStamp {
  /** Git HEAD when the app's sidecar started — the code it actually loaded. */
  startedAt: string;
  /** Git HEAD on disk now. */
  head: string;
  /** `head !== startedAt`: the checkout moved under the running app → a rebuild would apply it. */
  stale: boolean;
}

/**
 * The pure comparison half — unit-testable without moving HEAD. `null` unless BOTH shas resolved (a
 * missing stamp is an honest absence, never a false `stale`). Mirrors the studio helper exactly so the
 * two surfaces can never disagree about what "moved" means.
 */
export function buildCodeStamp(startedAt: string | null, head: string | null): CodeStamp | null {
  if (!startedAt || !head) return null;
  return { startedAt, head, stale: head !== startedAt };
}

/**
 * `git rev-parse HEAD` in `repoRoot`; `null` on ANY failure (git missing, not a repo, timeout, a
 * non-sha output). `windowsHide` so the sidecar (no console) never pops a terminal per probe. git is a
 * real .exe, so no shell. The `runGit` seam is injectable so the probe factory is testable offline.
 */
export function gitHead(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["rev-parse", "HEAD"],
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
 * Capture HEAD ONCE at sidecar start (call from `main()` before any pull can land) and return the
 * per-request probe: re-read HEAD from disk and compare. A health poll every few seconds spawns one
 * short-lived git each — fine for a local app. `read` defaults to {@link gitHead}; the test injects a
 * scripted reader so no real git or repo is needed.
 */
export function createCodeStampProbe(
  repoRoot: string,
  read: (root: string) => Promise<string | null> = gitHead,
): () => Promise<CodeStamp | null> {
  const startedAt = read(repoRoot);
  return async () => buildCodeStamp(await startedAt, await read(repoRoot));
}
