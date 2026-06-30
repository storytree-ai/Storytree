/**
 * Pre-spawn claim decision seam (ADR-0138 §3, capability E1).
 *
 * `resolveSpawnClaim` maps a `ClaimResult` from the notice-board store to the
 * orchestrator's pre-spawn decision — `{ proceed: true }` when the claim was
 * acquired (fresh or reclaimed), or `{ proceed: false; heldBy }` when refused,
 * surfacing the holder so the orchestrator can name who has the story and wait
 * for its merge or pick other work.
 *
 * PURE: ClaimResult in, SpawnDecision out — no store, no clock, no spawn.
 * Imports only node: builtins (none needed) and relative modules (none needed),
 * so the proof run stays install-free with no node_modules.
 *
 * E2 (wiring into headless-orchestrator.ts before spawn) is DEFERRED behind
 * ADR-0137 Phase 3 / ADR-0108 Phase 3 drive-authority — do NOT build now.
 */

// ---------------------------------------------------------------------------
// Shapes — mirror @storytree/notice-board's ClaimDocT / ClaimResult.
// Defined here so callers that import only types pay no runtime cost.
// ---------------------------------------------------------------------------

export interface ClaimHolder {
  sessionId: string;
  branch: string;
  intent: string;
  unitId: string;
  claimedAt: string;
  heartbeatAt: string;
}

export type ClaimResult =
  | { acquired: true; claim: ClaimHolder; reclaimed: boolean }
  | { acquired: false; heldBy: ClaimHolder };

export type SpawnDecision =
  | { proceed: true }
  | { proceed: false; heldBy: ClaimHolder };

// ---------------------------------------------------------------------------
// Core seam
// ---------------------------------------------------------------------------

/**
 * Resolves the orchestrator's pre-spawn decision from a ClaimResult.
 *
 * - Acquired (fresh or reclaimed stale): `{ proceed: true }` — the caller now
 *   holds the claim and may spawn.
 * - Refused (live holder): `{ proceed: false; heldBy }` — surface the holder's
 *   sessionId / branch / intent so the orchestrator can report who has the story
 *   and decide to wait for the merge or pick other work.
 */
export function resolveSpawnClaim(result: ClaimResult): SpawnDecision {
  if (result.acquired) {
    return { proceed: true };
  }
  return { proceed: false, heldBy: result.heldBy };
}
