import { pathToFileURL } from "node:url";
import { createPool, closePool } from "@storytree/library/store";
import type { PoolHandle } from "@storytree/library/store";
import { PgPresenceStore } from "./presence-store.js";
import { PgClaimStore } from "./claim-store.js";
import { reapStaleSessions } from "./reaper.js";

/**
 * Merge-retire backstop (ADR-0033 / ADR-0041): when a session's PR merges, retire its
 * presence row AUTHORITATIVELY. The merge to main IS the "this session's work landed and
 * it's over" fact — the one the racy `SessionEnd` hook misses when a fresh worktree is
 * deleted before the hook fires `done`, leaving the `events.session` row `status=active`
 * to linger as a possibly-dead wisp/dock entry forever.
 *
 * CI's automerge job runs this writer (as a keyless WIF service account) AFTER the merge
 * lands, deriving the sessionId from the merged PR's head ref. It is purely a presence
 * cleanup: it does NOT append a per-unit `work_event` (merge-changed files don't map to
 * story ids — the world's landed-work signal is verdict blooms, a separate path).
 *
 * HARD CONTRACT — FAIL-SOFT, ALWAYS exit 0. The merge already landed; presence is advisory
 * (ADR-0033, "advisory-only, never-blocking"). Every failure path — DB idle-stopped, no
 * row, a non-session branch, a bad arg — is caught, logged, and exits cleanly. This writer
 * must NEVER fail the merge job.
 *
 * `PgPresenceStore.done()` already returns `null` harmlessly when no projection row exists
 * (a non-claude branch, an already-retired session) — so calling it unconditionally is
 * safe and simply no-ops for anything that isn't a live session row.
 */

/** The structural slice of `PgPresenceStore` this writer needs — keeps the unit test offline. */
export interface MergeRetireStore {
  done(sessionId: string, lastSeenAt: string): Promise<unknown>;
}

/**
 * Derive the presence `sessionId` from a git head ref: the tail segment after the last
 * `/`. Mirrors `deriveIdentity` (packages/drive/src/noticeboard.ts), whose sessionId is the
 * worktree basename — for `claude/<slug>-<hash>` worktrees the branch tail equals that
 * basename. A ref with no `/` (or a bare sessionId passed by the manual one-shot) is
 * returned unchanged, so this is safe to apply to either a full head ref or a plain id.
 */
export function sessionIdFromBranch(headRef: string): string {
  const trimmed = headRef.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Retire one merged session's presence row, FAIL-SOFT. Calls `store.done(sessionId,
 * mergedAt)`; a `null` return (no such row) is a clean no-op, and ANY thrown error (DB
 * down, transient) is caught and logged — never rethrown. Returns `true` when `done()`
 * resolved (whether it retired a row or no-op'd), `false` when it threw. Either outcome is
 * a successful, non-fatal run from the merge job's perspective.
 */
export async function retireMergedSession(
  store: MergeRetireStore,
  sessionId: string,
  mergedAt: string,
  log: (msg: string) => void = console.log,
): Promise<boolean> {
  try {
    const result = await store.done(sessionId, mergedAt);
    if (result === null) {
      log(`[ingest-merge] no presence row for "${sessionId}" — nothing to retire (no-op).`);
    } else {
      log(`[ingest-merge] retired presence for "${sessionId}" (merged at ${mergedAt}).`);
    }
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[ingest-merge] presence retire failed for "${sessionId}" (advisory — ignored): ${message}`);
    return false;
  }
}

/** The structural slice of `PgClaimStore` this writer needs — keeps the unit test offline. */
export interface BranchClaimReleaseStore {
  releaseClaimsByBranch(branch: string): Promise<number>;
}

/**
 * Release ALL of a merged branch's `events.node_claim` rows, FAIL-SOFT — the guaranteed machine
 * clear the wisp-claim needs (ADR-0138 §4). This is the fix for the "never cleared" failure mode
 * that once demoted coordination presence (ADR-0124, superseded): the merge to main IS the
 * authoritative "this branch's work is done" fact, so the merge job releases its story-claim. Calls
 * `store.releaseClaimsByBranch(branch)` (capability `claim-store-work-time`, A1), which drops every
 * row whose `branch` column equals `branch` and appends a `released` audit event per cleared claim,
 * in one transaction — and, under the ADR-0200 grade ledger, atomically promotes each freed unit's
 * oldest live waiter INSIDE that same store transaction (nothing to wire here: the promotion is the
 * store method's own contract).
 *
 * Returns the released count (>= 0, where 0 is a clean no-op — a branch holding no claims) on
 * success, or `-1` when the call threw (DB down, transient) — caught and logged, NEVER rethrown,
 * exactly like the presence retire. A release failure must not fail the merge job (the merge already
 * landed; the claim is advisory coordination state). The trace-driven staleness reclaim (A2) is the
 * backstop if a clear is ever missed.
 *
 * NOTE: keyed on the FULL branch (`claude/<slug>` or a `claude/real/<unit>-<run>` promotion branch),
 * NOT the tail-derived sessionId the presence retire uses — `node_claim.branch` stores the full
 * branch, and the claim is per-unit, not per-session.
 */
export async function releaseBranchClaims(
  store: BranchClaimReleaseStore,
  branch: string,
  log: (msg: string) => void = console.log,
): Promise<number> {
  try {
    const released = await store.releaseClaimsByBranch(branch);
    if (released === 0) {
      log(`[ingest-merge] no claims held by "${branch}" — nothing to release (no-op).`);
    } else {
      log(`[ingest-merge] released ${released} claim(s) for branch "${branch}".`);
    }
    return released;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[ingest-merge] claim release failed for "${branch}" (advisory — ignored): ${message}`);
    return -1;
  }
}

/**
 * Script entry: read the head ref (or bare sessionId) + the merged-at timestamp from
 * argv/env, open a live keyless pool, retire the session, then tear down. NEVER invoked
 * during tests (entry-guarded). Wraps EVERY path so the process exits 0 no matter what.
 *
 *   STORYTREE_DB_USER=<iam-email> \
 *   npx tsx packages/store/src/ingest-merge.ts <head-ref-or-sessionId> <iso-timestamp>
 *
 * Env overrides argv (CI sets STORYTREE_MERGED_HEAD_REF / STORYTREE_MERGED_AT).
 */
async function main(): Promise<void> {
  const headRef = process.env["STORYTREE_MERGED_HEAD_REF"] ?? process.argv[2];
  // Env may be set to an EMPTY string by a CI expression (`?? ` only catches null/undefined),
  // so coalesce on non-empty and fall back to now (≈ merge time — the writer runs right after).
  const mergedAtRaw = process.env["STORYTREE_MERGED_AT"]?.trim() || process.argv[3]?.trim() || "";
  const mergedAt = mergedAtRaw.length > 0 ? mergedAtRaw : new Date().toISOString();

  if (headRef === undefined || headRef.trim().length === 0) {
    console.log("[ingest-merge] no head ref / sessionId provided — nothing to do (no-op).");
    return; // exit 0
  }
  const sessionId = sessionIdFromBranch(headRef);
  // The FULL branch (not the tail-derived sessionId) — node_claim is keyed by branch.
  const branch = headRef.trim();

  let handle: PoolHandle | undefined;
  try {
    handle = await createPool();
    const store = new PgPresenceStore(handle.pool);
    // 1) Retire THIS merged session's row (the authoritative "its work landed" fact).
    await retireMergedSession(store, sessionId, mergedAt);
    // 2) Then sweep ALL possibly-dead active rows (ADR-0079, amends ADR-0041). The merge-retire
    //    above is a one-shot per branch tail; the sweep is the data-side janitor that also
    //    catches sessions that re-declared after their merge, merged under a different branch,
    //    or never merged at all. Both reuse this one keyless pool. Fail-soft — never rethrows.
    await reapStaleSessions(store, new Date());
    // 3) Release ALL of the merged branch's node_claim rows (ADR-0138 §4 — the guaranteed machine
    //    clear of the story-claim wisp, the fix for "never cleared"). Keyed on the full head-ref
    //    branch, not the presence sessionId. Reuses this same pool; fail-soft — never rethrows.
    await releaseBranchClaims(new PgClaimStore(handle.pool), branch);
  } catch (err) {
    // Pool acquisition / connector failure (DB idle-stopped, no creds) — advisory, ignore.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ingest-merge] could not connect / retire (advisory — ignored): ${message}`);
  } finally {
    if (handle !== undefined) {
      try {
        await closePool(handle.pool, handle.connector);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[ingest-merge] pool teardown error (ignored): ${message}`);
      }
    }
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  // Deliberately the INVERSE of load-corpus.ts: we NEVER set a non-zero exit code. The
  // merge has already landed; a presence-cleanup failure must not fail the merge job.
  main().catch((err: unknown) => {
    console.log(`[ingest-merge] unexpected error (advisory — ignored): ${String(err)}`);
  });
}
