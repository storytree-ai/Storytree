import { pathToFileURL } from "node:url";
import { createPool, closePool } from "@storytree/library/store";
import type { PoolHandle } from "@storytree/library/store";
import { PgClaimStore } from "./claim-store.js";

/**
 * Merge-clear backstop (ADR-0138 §4 / ADR-0200): when a branch's PR merges, release ALL of
 * its `events.node_claim` rows AUTHORITATIVELY. The merge to main IS the "this branch's work
 * landed and it's over" fact — the guaranteed machine clear the claim ledger needs.
 *
 * CI's automerge job runs this writer (as a keyless WIF service account) AFTER the merge
 * lands, keyed on the merged PR's full head ref. It does NOT append a per-unit `work_event`
 * (merge-changed files don't map to story ids — the world's landed-work signal is verdict
 * blooms, a separate path).
 *
 * The presence half this writer once carried (retireMergedSession / the stale-session reaper,
 * ADR-0033 / ADR-0041 / ADR-0079) was RETIRED with the presence core (ADR-0200 D7): the claim
 * ledger is the one session machinery, and this merge clear is its authoritative release.
 *
 * HARD CONTRACT — FAIL-SOFT, ALWAYS exit 0. The merge already landed; the claim is advisory
 * coordination state. Every failure path — DB idle-stopped, no rows, a non-session branch, a
 * bad arg — is caught, logged, and exits cleanly. This writer must NEVER fail the merge job.
 */

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
 * success, or `-1` when the call threw (DB down, transient) — caught and logged, NEVER rethrown.
 * A release failure must not fail the merge job (the merge already landed; the claim is advisory
 * coordination state). The trace-driven staleness reclaim (A2) is the backstop if a clear is ever
 * missed.
 *
 * NOTE: keyed on the FULL branch (`claude/<slug>` or a `claude/real/<unit>-<run>` promotion branch)
 * — `node_claim.branch` stores the full branch, and the claim is per-unit, not per-session.
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
 * Script entry: read the merged head ref from argv/env, open a live keyless pool, release the
 * branch's claims, then tear down. NEVER invoked during tests (entry-guarded). Wraps EVERY path
 * so the process exits 0 no matter what.
 *
 *   STORYTREE_DB_USER=<iam-email> \
 *   npx tsx packages/notice-board/src/store/ingest-merge.ts <head-ref>
 *
 * Env overrides argv (CI sets STORYTREE_MERGED_HEAD_REF).
 */
async function main(): Promise<void> {
  const headRef = process.env["STORYTREE_MERGED_HEAD_REF"] ?? process.argv[2];

  if (headRef === undefined || headRef.trim().length === 0) {
    console.log("[ingest-merge] no head ref provided — nothing to do (no-op).");
    return; // exit 0
  }
  // The FULL branch (never a tail-derived id) — node_claim is keyed by branch.
  const branch = headRef.trim();

  let handle: PoolHandle | undefined;
  try {
    handle = await createPool();
    // Release ALL of the merged branch's node_claim rows (ADR-0138 §4 — the guaranteed machine
    // clear of the story-claim wisp, the fix for "never cleared"). Fail-soft — never rethrows.
    await releaseBranchClaims(new PgClaimStore(handle.pool), branch);
  } catch (err) {
    // Pool acquisition / connector failure (DB idle-stopped, no creds) — advisory, ignore.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ingest-merge] could not connect / release (advisory — ignored): ${message}`);
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
  // merge has already landed; a claim-release failure must not fail the merge job.
  main().catch((err: unknown) => {
    console.log(`[ingest-merge] unexpected error (advisory — ignored): ${String(err)}`);
  });
}
