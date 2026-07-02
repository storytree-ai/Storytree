/**
 * Claim-gated spawn gate (ADR-0138 §3 / §4, capability claim-gated-spawn).
 *
 * Every spawn is claim-gated: the story-claim is acquired BEFORE the spawn
 * function runs, a refusal names the holder and spawns nothing, and each
 * trace signal bumps the claim heartbeat so a live spawn never ages out.
 *
 * The E1 seam (resolveSpawnClaim, ./spawn-claim.ts) is consumed here — not
 * stubbed — so the real decision logic is exercised by the proof.
 *
 * Imports only node: builtins and relative files — install-free proof run.
 */

import { resolveSpawnClaim } from "./spawn-claim.js";
import type { ClaimHolder } from "./spawn-claim.js";

// ---------------------------------------------------------------------------
// Injected store seam (structural — mirrors PgClaimStore's public surface)
// ---------------------------------------------------------------------------

/** Structural mirror of notice-board's ClaimRequest. */
interface ClaimRequest {
  unitId: string;
  sessionId: string;
  branch: string;
  intent?: string;
}

/** Structural mirror of notice-board's ClaimDocT / ClaimHolder. */
interface ClaimDoc {
  unitId: string;
  sessionId: string;
  branch: string;
  intent: string;
  claimedAt: string;
  heartbeatAt: string;
}

/** Structural mirror of notice-board's ClaimResult. */
type ClaimResultLike =
  | { acquired: true; claim: ClaimDoc; reclaimed: boolean }
  | { acquired: false; heldBy: ClaimDoc };

/** The injected store seam: claim() + bumpHeartbeat(). */
export interface ClaimStore {
  claim(req: ClaimRequest): Promise<ClaimResultLike>;
  bumpHeartbeat(unitId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Gate API
// ---------------------------------------------------------------------------

export interface ClaimGatedSpawnArgs {
  /** The story/unit being claimed — blank triggers the fail-closed no-unit refusal. */
  unitId: string;
  /** The calling session id (stamped into the claim request). */
  sessionId: string;
  /** The calling branch (stamped into the claim request). */
  branch: string;
  /**
   * The work kind / role (stamped as `intent` on the claim request per ADR-0138 §5
   * so the wisp colour layer can read the role).
   */
  kind: string;
  /** Injected claim store — the real pg store in production, a recording fake in tests. */
  store: ClaimStore;
  /**
   * The function to spawn. Receives an `onTrace` callback that callers feed
   * with SDK turn / tool-call events; each call bumps the claim heartbeat so
   * the live claim never ages out during an active spawn (ADR-0138 §4).
   */
  spawnFn: (onTrace: (msg: unknown) => void) => Promise<unknown>;
}

export type ClaimGatedSpawnResult =
  | { ok: true; result: unknown }
  | { ok: false; reason: "held"; heldBy: ClaimHolder }
  | { ok: false; reason: "no-unit" };

// ---------------------------------------------------------------------------
// Gate implementation
// ---------------------------------------------------------------------------

/**
 * Claim-at-spawn gate: acquire the story claim, then run the spawn.
 *
 * Returns `{ ok: true }` when the claim is acquired and the spawn completes.
 * Returns `{ ok: false, reason: "held", heldBy }` when another session holds
 * the story — a wait, never an error; the spawn fn is never invoked.
 * Returns `{ ok: false, reason: "no-unit" }` for a blank unitId — fail-closed
 * before any I/O; the gate exposes no claim-free spawn path (ADR-0138 §3).
 */
export async function claimGatedSpawn({
  unitId,
  sessionId,
  branch,
  kind,
  store,
  spawnFn,
}: ClaimGatedSpawnArgs): Promise<ClaimGatedSpawnResult> {
  // 4. Fail-closed input wall: blank unitId → no claim call, no spawn
  if (!unitId) {
    return { ok: false, reason: "no-unit" };
  }

  // 1. Claim BEFORE spawn — the mechanical definition of "claim-gated"
  //    intent = kind so the wisp colour layer can read the role (ADR-0138 §5)
  const claimResult = await store.claim({
    unitId,
    sessionId,
    branch,
    intent: kind,
  });

  // E1 seam: map ClaimResult → SpawnDecision (real import, never stubbed)
  const decision = resolveSpawnClaim(claimResult);

  // 2. Refusal: a wait, never an error — surface the holder verbatim
  if (!decision.proceed) {
    return { ok: false, reason: "held", heldBy: decision.heldBy };
  }

  // 3. Run spawn with a trace hook.
  //    Each `onTrace` call fires a bumpHeartbeat() and collects the promise
  //    so the gate can await all bumps before returning — ensuring they
  //    complete within the gate's lifetime (the test observes synchronously
  //    after await claimGatedSpawn).
  const bumpPromises: Promise<void>[] = [];

  function onTrace(_msg: unknown): void {
    bumpPromises.push(store.bumpHeartbeat(unitId));
  }

  const result = await spawnFn(onTrace);

  // Await every heartbeat bump; a dead session emits nothing → bumpPromises
  // stays empty → ages out truthfully (no self-reported ping, no zombie).
  await Promise.all(bumpPromises);

  return { ok: true, result };
}
