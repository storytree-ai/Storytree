// phase-activity — the CLI-drive's phase WRITE for the red-green wisp (ADR-0048 §3 v2).
//
// The orchestrator stays PURE (ADR-0048 "No orchestrator impurity"): `proveUnit` only invokes an
// injected `onPhase` observer as it commits to each phase. The activity WRITE lives here in the
// drive — exactly where the initial `building` mark is written (node-build.ts) — so the gate never
// touches presence/activity. `phaseActivityWriter` builds that observer over an injected store:
// each phase appends a FRESH `building` work-event carrying the live phase. `inFlightBuilds()` reads
// the LATEST `building` row per unit (DISTINCT ON … ORDER BY seq DESC), so the newest phase wins and
// the wisp re-colours as the spine walks red→green.
//
// It is NOT a new lifecycle word (ADR-0048 "No new lifecycle word"): the event stays `building`; the
// phase rides as a field on the doc (WorkEventDoc.phase). And the write is ADVISORY (like
// withPresence): a store hiccup is swallowed so a board/DB failure can never fail the build it
// observes.

import { workEvent } from "@storytree/orchestrator";
import type { BuildPhase, Tier } from "@storytree/proof-protocol";

/** The narrow append seam the phase write needs — satisfied by any Store (PgWorkStore / InMemory)
 *  and by an offline fake, so the writer never reaches for a real pool. */
export interface PhaseActivityStore {
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }): Promise<unknown>;
}

/** Which build the phase marks belong to — the same identity the initial `building` mark carries. */
export interface PhaseActivityTarget {
  unitId: string;
  runId: string;
  /** The work tier (feeds events.work_event.tier); omitted → the column defaults to "unknown". */
  tier?: Tier;
  /** The work-event actor (the resolved signer). */
  signer: string;
}

/**
 * Build the `onPhase` observer `proveUnit` invokes: each phase appends a phase-stamped `building`
 * work-event for `(unitId, runId)`. Advisory — a store failure is swallowed (the build's result is
 * identical with a dead board). Returns a callback typed to the gate's `onPhase` signature.
 */
export function phaseActivityWriter(
  store: PhaseActivityStore,
  target: PhaseActivityTarget,
): (phase: BuildPhase) => Promise<void> {
  return async (phase: BuildPhase): Promise<void> => {
    try {
      await store.appendEvent(
        workEvent(
          {
            unitId: target.unitId,
            event: "building",
            runId: target.runId,
            phase,
            ...(target.tier !== undefined ? { tier: target.tier } : {}),
          },
          target.signer,
        ),
      );
    } catch {
      // Advisory by construction (ADR-0048 / ADR-0033 Decision 3): the phase write must never fail
      // the build it observes. A dead DB just leaves the wisp on its coarse band.
    }
  };
}
