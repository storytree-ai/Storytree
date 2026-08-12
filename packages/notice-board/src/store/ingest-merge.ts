import { pathToFileURL } from "node:url";
import { createPool, closePool } from "@storytree/library/store";
import type { PoolHandle } from "@storytree/library/store";
import { PgClaimStore } from "./claim-store.js";

/**
 * Merge-clear backstop (ADR-0138 §4 / ADR-0200): when a branch's PR merges, release ALL of
 * its `events.node_claim` rows AUTHORITATIVELY. The merge to main IS the "this branch's work
 * landed and it's over" fact — the guaranteed machine clear the claim ledger needs.
 *
 * TWO CALLERS, DELIBERATELY (ADR-0345 D4 / ADR-0304 D3 — the merge-queue prerequisite):
 *   1. `ci.yml`'s `automerge` job, keyed on the merged PR's head ref. `pull_request`-only and
 *      gated on `steps.merge.outputs.merged == 'true'` — so under a MERGE QUEUE, where
 *      `gh pr merge` queues rather than merges, that gate is false for every PR and this
 *      caller never fires.
 *   2. `claim-release.yml`, keyed on the merge that ACTUALLY landed on `main`. This is the
 *      queue-reachable path: it is what keeps the guarantee true once the queue is switched on,
 *      and it also closes a gap that exists TODAY — a merge taken by hand in the GitHub UI runs
 *      no `automerge` job and has never released its claims.
 *
 * BOTH CAN FIRE FOR ONE MERGE, and that must be a clean no-op — see {@link releaseBranchClaims}.
 *
 * It does NOT append a per-unit `work_event` (merge-changed files don't map to story ids — the
 * world's landed-work signal is verdict blooms, a separate path).
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
 * IDEMPOTENT — the property the two callers above depend on, and PROVEN rather than assumed
 * (`ingest-merge.test.ts` offline, `claim-store-release-by-branch.live.test.ts` against a real DB).
 * A second release of the same branch finds no rows: it deletes nothing, appends no `released`
 * audit event, promotes nobody, and returns 0. In particular it does NOT disturb the waiter the
 * FIRST release promoted — that session's row carries its OWN branch, and this release is keyed on
 * `branch` alone. So a merge seen by both callers costs one wasted query, never a lost claim.
 *
 * NOTE: keyed on the FULL branch, whatever its shape — `claude/<slug>`, a `claude/real/<unit>-<run>`
 * promotion branch, or a `worktree-…` lobby-ceremony branch (ADR-0200 D3). `node_claim.branch`
 * stores the full branch, and the claim is per-unit, not per-session. The CI wiring must never
 * filter on a branch-name prefix (the `claude/*` gate cost PR #1024's claim its machine clear).
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
 * Split the caller-supplied head ref(s) into the branches to release — newline- OR
 * comma-separated, trimmed, blanks dropped, order-preserving dedupe.
 *
 * ONE MERGE IS NOT ALWAYS ONE BRANCH. `ci.yml`'s automerge job passes exactly one head ref, but a
 * MERGE QUEUE lands a BATCH: with `max_entries_to_merge > 1` several PRs are merged and arrive as a
 * single `push` to `main`, so `claim-release.yml` resolves N head refs from one event. Releasing
 * them in one process reuses the pool — the Cloud SQL connector handshake is the expensive part, so
 * the alternative (a process per ref) would pay it N times.
 *
 * Deliberately NOT shape-filtered: claims are keyed on the FULL branch and ANY shape can hold them
 * (`claude/*`, `claude/real/*`, the ADR-0200 D3 lobby's `worktree-…`). The `claude/*` gate this
 * writer's CI wiring once carried is what cost PR #1024's claim its machine clear.
 */
export function parseMergedHeadRefs(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const branch = part.trim();
    if (branch.length === 0 || seen.has(branch)) continue;
    seen.add(branch);
    refs.push(branch);
  }
  return refs;
}

/**
 * Script entry: read the merged head ref(s) from env/argv, open ONE live keyless pool, release each
 * branch's claims, then tear down. NEVER invoked during tests (entry-guarded).
 *
 *   STORYTREE_DB_USER=<iam-email> \
 *   npx tsx packages/notice-board/src/store/ingest-merge.ts <head-ref> [<head-ref>...]
 *
 * Env overrides argv (CI sets STORYTREE_MERGED_HEAD_REF; newline- or comma-separated for a batch).
 *
 * EXIT CODE — 0 always, UNLESS `STORYTREE_CLAIM_RELEASE_STRICT=1`. The default is the hard
 * fail-soft contract the `automerge` job depends on: the merge has already landed and the claim is
 * advisory, so a DB-down release must never fail that job. But `claim-release.yml` gates NOTHING —
 * no merge, no deploy — so a silent green there would rebuild exactly the failure class ADR-0345 D4
 * is fixing (a release that quietly stops happening, invisible until someone hits a stale ADR-0270
 * refusal months later). It sets STRICT so a failed release is a RED run that costs nothing but is
 * impossible to miss. The merge job never sets it.
 */
async function main(): Promise<void> {
  const branches = parseMergedHeadRefs(
    process.env["STORYTREE_MERGED_HEAD_REF"] ?? process.argv.slice(2).join("\n"),
  );
  const strict = process.env["STORYTREE_CLAIM_RELEASE_STRICT"] === "1";

  if (branches.length === 0) {
    console.log("[ingest-merge] no head ref provided — nothing to do (no-op).");
    return; // exit 0 — an empty set is a legitimate outcome, not a failure, in either mode
  }

  let handle: PoolHandle | undefined;
  try {
    handle = await createPool();
    const store = new PgClaimStore(handle.pool);
    // Release ALL of each merged branch's node_claim rows (ADR-0138 §4 — the guaranteed machine
    // clear of the story-claim wisp, the fix for "never cleared"). Fail-soft — never rethrows.
    const results: number[] = [];
    for (const branch of branches) {
      results.push(await releaseBranchClaims(store, branch));
    }
    const failed = results.filter((n) => n === -1).length;
    if (failed > 0 && strict) {
      console.log(
        `::error::[ingest-merge] ${failed} of ${branches.length} branch release(s) failed — ` +
          `those branches KEEP their claims (ADR-0138 §4). Re-run this workflow with the branch ` +
          `name, or release by hand: storytree noticeboard release --node <unit> --pg`,
      );
      process.exitCode = 1;
    }
  } catch (err) {
    // Pool acquisition / connector failure (DB idle-stopped, no creds) — advisory, ignore.
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ingest-merge] could not connect / release (advisory — ignored): ${message}`);
    if (strict) {
      console.log(
        `::error::[ingest-merge] could not connect — NO claims were released for ` +
          `${branches.join(", ")}. They keep their claims until this is re-run.`,
      );
      process.exitCode = 1;
    }
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
  // Deliberately the INVERSE of load-corpus.ts by DEFAULT: we set no non-zero exit code, because
  // the merge has already landed and a claim-release failure must not fail the merge job. The one
  // exception is STRICT mode (see main()), which only the standalone claim-release workflow sets —
  // it gates nothing, so there it can afford to be loud. An unexpected throw is swallowed in both
  // modes: main() already converted every KNOWN failure into its own strict-mode exit code, so a
  // throw reaching here is an unknown, and failing the merge job on an unknown is the wrong trade.
  main().catch((err: unknown) => {
    console.log(`[ingest-merge] unexpected error (advisory — ignored): ${String(err)}`);
  });
}
