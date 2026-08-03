/**
 * Claim-release honesty (the second instance of the ADR-0199 class).
 *
 * THE DEFECT THIS CLOSES. A session declares its claim, runs `node build --real` / `story build
 * --real`, and afterwards holds NO claim — so `check:declared` FAILs at the merge ceremony, hours
 * after whatever cleared it, naming only the symptom. Nothing released it deliberately and nothing
 * warned. Measured on session `competent-cohen-ba0e29` / unit `context-traversal-capture`, and the
 * event log names the path exactly:
 *
 *   seq=969 claimed  intent="orchestrate"   <- the session's own declare
 *   seq=978 claimed  intent="real"          <- the build re-claims the SAME (unit, session) row
 *   seq=981 released intent="real"          <- the build's `finally` DELETES it
 *
 * The build takes its per-unit write-claim (ADR-0121) under the LAUNCHING session's identity, and
 * `events.node_claim` is keyed `(unit_id, session_id)` — so the build's take does not create a
 * second row, it OVERWRITES the session's own (the re-entrant branch of `PgClaimStore.claim`), and
 * the unconditional release in the build's `finally` then destroys it. The build had no way to know:
 * `claimHeld` was true because ITS take succeeded.
 *
 * This is precisely the shape ADR-0199 removed from PRESENCE — `withPresence` declared the build
 * under the launching session's identity and retired that session's row in its `finally`. The claim
 * layer kept it. node-build.ts even asserted the opposite in a comment ("the launching session's own
 * declaration survives its builds"), which was true of presence and false of claims.
 *
 * TWO HALVES, AND THE SECOND IS THE DURABLE ONE.
 *   1. {@link decideClaimExit} — a run releases only a claim its OWN take created. When it merely
 *      refreshed a claim the session already held, it borrowed the row and leaves it.
 *   2. {@link releaseClaimWithNotice} — every release that is NOT an explicit ceremony names the
 *      claim, the caller and the time. A silent release becomes structurally impossible, so the
 *      THIRD instance of this class is discovered at the moment it happens.
 *
 * WHO MUST NOT ROUTE THROUGH HERE. The deliberate releases are not the thing being reported:
 * `noticeboard done` (`releaseClaimsBySession`, ADR-0142) is the session saying so, and the CI
 * merge-clear (`releaseBranchClaims`, ADR-0142/0200 — the branch died, the work landed) is the
 * ledger's authoritative machine release, which already logs its own line. Both stay untouched.
 */

import type { ClaimDocT } from "@storytree/notice-board";

/** The three facts a release warning must carry, per the proposal: the claim, the caller, the time. */
export interface ReleaseNotice {
  /** The unit whose claim is going away. */
  unitId: string;
  /** The session that held it. */
  sessionId: string;
  /** WHO released it — the code path, not the session (e.g. `node build --real`). */
  caller: string;
  /** When, ISO-8601. */
  at: string;
}

/** What a run should do with the claim it is holding when it exits. */
export type ClaimExitDecision =
  /** The run's own take created this row: releasing it restores the ledger to how it was found. */
  | { action: "release" }
  /** The run refreshed a row the session already held: it borrowed the claim, so it leaves it. */
  | { action: "keep"; displaced: ClaimDocT };

/**
 * PURE: the borrow-vs-take decision, from the `displaced` claim `PgClaimStore.claim()` now reports.
 *
 * `displaced` is the caller's OWN pre-existing row that the take absorbed — the re-entrant work row,
 * or the shared exploring/waiting row the work take folds. `undefined` means the take genuinely
 * created a row that did not exist for this session, and releasing it on the way out is correct
 * (that is the ADR-0121 mutex working, and it must keep working).
 *
 * Deliberately NOT "restore the previous grade/intent". The measured harm is the row VANISHING —
 * `check:declared` FAILs on a missing row, not on a stale intent — and re-authoring the displaced
 * row's grade adds a store write path with its own failure modes for a harm nobody has observed.
 * What the run displaced is REPORTED instead ({@link displacedClaimNotice}), so if that ever does
 * bite, it bites visibly.
 */
export function decideClaimExit(displaced: ClaimDocT | undefined): ClaimExitDecision {
  return displaced === undefined ? { action: "release" } : { action: "keep", displaced };
}

/**
 * PURE: the warning an unexplicit release emits. Names the claim, the caller and the time, and says
 * what the reader should do — because the symptom (`check:declared` FAIL: "holds NO live claim")
 * surfaces arbitrarily far from this moment, which is what made the original instance expensive.
 */
export function unexplicitReleaseWarning(notice: ReleaseNotice): string {
  return [
    `[claim] WARNING — the claim on "${notice.unitId}" (session "${notice.sessionId}") was RELEASED at ${notice.at}`,
    `        by: ${notice.caller} — not by an explicit \`noticeboard done\`.`,
    "        If this session still needs the claim, `check:declared` will FAIL at the merge ceremony",
    "        (ADR-0200 D3) with \"holds NO live claim\". Re-take it with:",
    `          pnpm storytree noticeboard declare --node ${notice.unitId} --pg`,
    "        This is reported at the moment it happens because the same class went silent once before",
    "        (ADR-0199) and was only discovered a full gate cycle later.",
  ].join("\n");
}

/**
 * PURE: what a run says when it exits holding a claim it did not take. Not a warning — nothing is
 * wrong — but the displacement is worth stating, because the run DID overwrite the row's intent and
 * grade on the way in, and a session reading the board should know why its intent changed.
 */
export function displacedClaimNotice(caller: string, displaced: ClaimDocT): string {
  return (
    `[claim] "${displaced.unitId}" was already claimed by this session before ${caller} ran — the run ` +
    `refreshed it (intent is now "${displaced.intent}" → the run's) and LEAVES IT IN PLACE on exit. ` +
    "A run releases only a claim its own take created (ADR-0199's class), so your declaration " +
    "survives its builds."
  );
}

/** The narrow slice of the claim store a notified release needs, plus its injectable surroundings. */
export interface ReleaseDeps {
  /** Real: `PgClaimStore.release`. Resolves true when a row was actually deleted. */
  release: (unitId: string, sessionId: string) => Promise<boolean>;
  /** Where the warning goes. Default: stderr — a warning must not pollute an envelope on stdout. */
  log?: (message: string) => void;
  /** Real: `() => new Date()`. */
  now?: () => Date;
}

/**
 * Release a claim and SAY SO. The one entry point for every release that is not a deliberate
 * ceremony verb — a build teardown, a rollback — so that "a claim went away and nothing mentioned
 * it" is no longer a reachable state.
 *
 * Warns only when a row was actually deleted: a no-op release (nothing held) is not an event, and
 * warning about it would train the reader to ignore the line.
 *
 * FAIL-SOFT, exactly as the call sites it replaces were: a store failure is swallowed and reported,
 * never thrown. A release failure must not fail an otherwise-good build — the claim then ages out
 * via stale-reclaim.
 */
export async function releaseClaimWithNotice(
  deps: ReleaseDeps,
  input: { unitId: string; sessionId: string; caller: string },
): Promise<boolean> {
  const log = deps.log ?? ((m: string) => console.error(m));
  const now = deps.now ?? ((): Date => new Date());
  try {
    const released = await deps.release(input.unitId, input.sessionId);
    if (released) {
      log(
        unexplicitReleaseWarning({
          unitId: input.unitId,
          sessionId: input.sessionId,
          caller: input.caller,
          at: now().toISOString(),
        }),
      );
    }
    return released;
  } catch (err) {
    log(
      `[claim] release of "${input.unitId}" by ${input.caller} FAILED (ignored — the claim ages out ` +
        `via stale-reclaim): ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
