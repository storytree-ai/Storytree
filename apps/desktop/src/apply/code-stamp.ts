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
import { readFile } from "node:fs/promises";

/** The /api/health `code` field — what the running server serves vs what the checkout holds now. */
export interface CodeStamp {
  /**
   * The commit the RUNNING BUILD was produced at — the git SHA `build:electron` stamped into the
   * desktop bundle (preferred), or, for an un-stamped older build, the git HEAD the sidecar started on.
   * This is "the code the app is actually running", which `head` (the checkout on disk now) is measured against.
   */
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
 * Read the build stamp `scripts/write-build-stamp.mjs` writes at `build:electron` time — the git SHA
 * the desktop bundle was produced at, as `{ "sha": "<40-64 hex>" }` at `<dist>/build-stamp.json`.
 * `null` on ANY failure (no stamp file — an un-stamped older build — a malformed file — a non-sha or
 * null `sha`), so {@link createCodeStampProbe} falls back to HEAD-at-spawn and an un-stamped build
 * behaves exactly as before (no regression, never a false stale).
 */
export async function readBuildStamp(buildStampPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(buildStampPath, "utf8")) as { sha?: unknown };
    const sha = parsed.sha;
    return typeof sha === "string" && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Return the per-request freshness probe. `startedAt` — "the code the app is running" — is captured
 * ONCE at sidecar start: the BUILD STAMP the desktop bundle was produced at (preferred), falling back
 * to git HEAD-at-spawn when there is no stamp. The build stamp is what makes a stale build OBSERVABLE
 * even when HEAD-at-spawn is fresh: a `git pull` + relaunch WITHOUT a rebuild leaves the served
 * dist/electron bundle behind while the tsx sidecar's own HEAD reads current — so HEAD-at-spawn alone
 * says "fresh" (silent) while the build stamp still points at the old commit (stale, correctly). Each
 * probe re-reads HEAD from disk and compares. `readHead`/`readBuilt` default to real git/fs; the test
 * injects scripted readers so no real git, repo, or file is needed.
 */
export function createCodeStampProbe(
  repoRoot: string,
  buildStampPath: string,
  readHead: (root: string) => Promise<string | null> = gitHead,
  readBuilt: (path: string) => Promise<string | null> = readBuildStamp,
): () => Promise<CodeStamp | null> {
  const startedAt = (async (): Promise<string | null> =>
    (await readBuilt(buildStampPath)) ?? (await readHead(repoRoot)))();
  return async () => buildCodeStamp(await startedAt, await readHead(repoRoot));
}
