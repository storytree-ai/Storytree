import type { Status } from "@storytree/verdict-contract";

/**
 * The proven-status predicate (ADR-0007 + ADR-0020). MOVED here from `@storytree/core`'s `proof.ts`
 * (ADR-0068 step 1): identifying the proven status is the farmer organism's ruler. `Status` is read
 * from the verdict CONTRACT's duplicate (decoupled from where the work-hierarchy schema lives).
 *
 * Is this status the proven / `healthy` state?
 *
 * NOTE (ADR-0020): `healthy` is NON-AUTHORABLE. This predicate exists only to identify the
 * proven status; it does NOT grant it. Reaching `healthy` is possible ONLY through a signed
 * verdict event flowing through the prove-it-gate — enforcement lives in the gate and the
 * loader, never in the `Status` enum (which structurally cannot stop an author from typing
 * `healthy`). Treat author-supplied `healthy` as a value to reject, not honour.
 */
export function isProvenStatus(status: Status): boolean {
  return status === "healthy";
}
