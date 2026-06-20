import { reapableSessions } from "../presence.js";
import type { PresenceDeclarationDoc } from "../presence.js";

/**
 * The possibly-dead presence sweep (ADR-0079, amends ADR-0041). The merge-retire backstop
 * (`ingest-merge.ts`) is a correct but structurally insufficient ONE-SHOT: it retires exactly
 * one session id (the merged branch's tail), once, at merge time. It cannot catch a session
 * that re-declared presence AFTER its PR merged (clobbering the merge-time `done`), whose work
 * merged under a DIFFERENT branch, or whose PR was CLOSED not merged. Those rows linger as
 * `status=active` zombies — the noisy parked-dock condition ADR-0041 reserved a data-side
 * janitor for.
 *
 * This sweep is that janitor: list the active rows, select the possibly-dead ones
 * (`reapableSessions`), and flip each to `done`. It runs piggy-backed on the existing
 * merge-retire CI step, so it reuses that step's keyless auth + DB pool — no new cron, IAM, or
 * terraform.
 *
 * HARD CONTRACT — FAIL-SOFT. Presence is advisory (ADR-0033, "never-blocking"). Every failure
 * path — a list that never returns, one row's write throwing — is caught and logged; the sweep
 * NEVER rejects, so it can never fail the merge job it rides on.
 *
 * Retiring is NON-destructive: a quiet-but-alive session re-declares on its next heartbeat and
 * the upsert (`PgPresenceStore.declare`) flips it back to active/fresh.
 */

/** The structural slice of `PgPresenceStore` the sweep needs — keeps the unit test offline. */
export interface ReaperStore {
  listActive(): Promise<PresenceDeclarationDoc[]>;
  done(sessionId: string, lastSeenAt: string): Promise<unknown>;
}

/**
 * Sweep every possibly-dead active presence row to `done`, FAIL-SOFT. Returns the number of
 * rows actually retired (0 on any list failure, or when nothing is possibly-dead).
 *
 * Each `done()` preserves the row's ORIGINAL `lastSeenAt` so the retired record stays truthful
 * about when the session was last active; the appended `done` event's `at` captures the reap
 * time. A single row's write throwing is logged and skipped — it does not abort the rest.
 */
export async function reapStaleSessions(
  store: ReaperStore,
  now: Date,
  log: (msg: string) => void = console.log,
): Promise<number> {
  let active: PresenceDeclarationDoc[];
  try {
    active = await store.listActive();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[reaper] could not list active sessions (advisory — ignored): ${message}`);
    return 0;
  }

  const stale = reapableSessions(active, now);
  if (stale.length === 0) {
    log(`[reaper] no possibly-dead sessions to sweep (${active.length} active).`);
    return 0;
  }

  let retired = 0;
  for (const d of stale) {
    try {
      await store.done(d.sessionId, d.lastSeenAt);
      retired++;
      log(`[reaper] retired possibly-dead session "${d.sessionId}" (last seen ${d.lastSeenAt}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[reaper] retire failed for "${d.sessionId}" (advisory — ignored): ${message}`);
    }
  }
  log(`[reaper] swept ${retired}/${stale.length} possibly-dead session(s).`);
  return retired;
}
