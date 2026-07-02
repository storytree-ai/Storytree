/**
 * Integration tests for claim-gated-spawn (ADR-0138 §3 / §4, capability claim-gated-spawn):
 * The claim-at-spawn gate — every spawn is claim-gated.
 *
 * Contracts tested (all 4 from stories/chat-subagent-spawn/claim-gated-spawn.md):
 *
 *   1. cgs-claim-precedes-every-spawn
 *      — store.claim() is invoked with the work-kind intent BEFORE the spawn fn runs;
 *        the spawn fn runs exactly once on an acquired claim.
 *
 *   2. cgs-refusal-surfaces-the-holder-and-spawns-nothing
 *      — on { acquired: false, heldBy } the gate returns a typed wait decision carrying
 *        the holder's sessionId / branch / intent verbatim; the spawn fn is NEVER invoked.
 *
 *   3. cgs-trace-bumps-the-heartbeat
 *      — each trace signal fed to the gate's hook during a running spawn bumps the claim
 *        heartbeat via store.bumpHeartbeat(); a session that stops emitting stops bumping
 *        (ages out truthfully — no self-reported ping, no zombie).
 *
 *   4. cgs-no-claim-free-spawn-path
 *      — a blank unitId is a fail-closed typed refusal; store.claim() is never called and
 *        the spawn fn is never invoked — the gate exposes no bypass arm.
 *
 * Every test is OFFLINE: the store and spawnFn are injected recording fakes — no pg, no
 * live SDK spend. Both already-built seams are consumed by the implementation via real
 * imports, not stubbed — the E1 decision (resolveSpawnClaim, ./spawn-claim.ts) and the
 * work-time request builder (workClaimRequest, @storytree/notice-board; the package
 * import is why the cap's real proof carries the install + typecheck arm). Only the
 * injected store is a fake.
 */

import test from "node:test";
import assert from "node:assert/strict";

// RED: claim-gated-spawn.ts does not exist yet — module-not-found is the right-kind red.
import { claimGatedSpawn } from "./claim-gated-spawn.js";

// Type-only import from the already-built E1 seam (erased at runtime — no node_modules needed).
import type { ClaimHolder } from "./spawn-claim.js";

// ---------------------------------------------------------------------------
// Inline structural types
// (mirrors @storytree/notice-board shapes without a package value import;
//  erased by tsx at runtime — no crash even with no node_modules)
// ---------------------------------------------------------------------------

/** Structural mirror of notice-board's ClaimDocT. */
interface ClaimDocLike {
  unitId: string;
  sessionId: string;
  branch: string;
  intent: string;
  claimedAt: string;
  heartbeatAt: string;
}

/** Structural mirror of notice-board's ClaimRequest. */
interface ClaimRequestLike {
  unitId: string;
  sessionId: string;
  branch: string;
  intent?: string;
}

/** Structural mirror of notice-board's ClaimResult. */
type ClaimResultLike =
  | { acquired: true; claim: ClaimDocLike; reclaimed: boolean }
  | { acquired: false; heldBy: ClaimDocLike };

/** The injected store seam: claim() + bumpHeartbeat() (mirrors PgClaimStore's public surface). */
interface ClaimStore {
  claim(req: ClaimRequestLike): Promise<ClaimResultLike>;
  bumpHeartbeat(unitId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function sampleClaimDoc(overrides: Partial<ClaimDocLike> = {}): ClaimDocLike {
  return {
    unitId: "chat-subagent-spawn",
    sessionId: "silly-brattain-484392",
    branch: "claude/silly-brattain-484392",
    intent: "orchestrate",
    claimedAt: "2026-07-01T00:00:00.000Z",
    heartbeatAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Recording store that GRANTS the claim; optional callbacks for observing calls. */
function grantingStore(opts: {
  onClaim?: (req: ClaimRequestLike) => void;
  onBump?: (unitId: string) => void;
} = {}): ClaimStore {
  return {
    async claim(req) {
      opts.onClaim?.(req);
      return { acquired: true, claim: sampleClaimDoc({ unitId: req.unitId }), reclaimed: false };
    },
    async bumpHeartbeat(unitId) {
      opts.onBump?.(unitId);
    },
  };
}

/** Recording store that REFUSES the claim with the supplied live holder. */
function refusingStore(holder: ClaimDocLike): ClaimStore {
  return {
    async claim(_req) {
      return { acquired: false, heldBy: holder };
    },
    async bumpHeartbeat(_unitId) {},
  };
}

// ---------------------------------------------------------------------------
// 1. cgs-claim-precedes-every-spawn
//    The claim is acquired BEFORE the spawn fn runs; intent = the work kind.
// ---------------------------------------------------------------------------

test("cgs-claim-precedes-every-spawn: store.claim() is called with the work-kind intent BEFORE the spawn fn, and the spawn fn runs exactly once on an acquired claim", async () => {
  const callOrder: string[] = [];
  let capturedRequest: ClaimRequestLike | undefined;

  const store = grantingStore({
    onClaim(req) {
      capturedRequest = req;
      callOrder.push("claim");
    },
  });

  let spawnRunCount = 0;

  const result = await claimGatedSpawn({
    unitId: "chat-subagent-spawn",
    sessionId: "sess-alpha",
    branch: "claude/sess-alpha",
    kind: "orchestrate",
    store,
    spawnFn: async (_onTrace: (msg: unknown) => void) => {
      spawnRunCount += 1;
      callOrder.push("spawn");
      return "spawned";
    },
  });

  assert.equal(result.ok, true, "the gate must succeed when the claim is acquired");

  // Claim must precede spawn — this is the mechanical definition of "claim-gated"
  assert.equal(
    callOrder[0],
    "claim",
    "store.claim() must be the FIRST call — the claim gates the spawn, so the spawn cannot run before the claim",
  );
  assert.equal(
    callOrder[1],
    "spawn",
    "the spawn fn must run AFTER the claim is acquired (second in the call order)",
  );
  assert.equal(
    spawnRunCount,
    1,
    "the spawn fn must run exactly once on an acquired claim — not zero (which would skip the work) and not twice",
  );

  // Intent must be the work kind (workClaimRequest stamps kind → intent per ADR-0138 §5)
  assert.equal(
    capturedRequest?.intent,
    "orchestrate",
    "the claim request's intent must be the work kind ('orchestrate') so the wisp colour layer can read the role (ADR-0138 §5)",
  );
  assert.equal(
    capturedRequest?.unitId,
    "chat-subagent-spawn",
    "the claim request must target the right unit",
  );
  assert.equal(
    capturedRequest?.sessionId,
    "sess-alpha",
    "sessionId must pass through to the claim request",
  );
  assert.equal(
    capturedRequest?.branch,
    "claude/sess-alpha",
    "branch must pass through to the claim request",
  );
});

test("cgs-claim-precedes-every-spawn: the 'edit' work kind is also stamped as intent (not hard-coded to 'orchestrate')", async () => {
  let capturedRequest: ClaimRequestLike | undefined;
  const store = grantingStore({ onClaim: (req) => { capturedRequest = req; } });

  await claimGatedSpawn({
    unitId: "some-unit",
    sessionId: "sess-edit",
    branch: "claude/sess-edit",
    kind: "edit",
    store,
    spawnFn: async (_onTrace: (msg: unknown) => void) => "ok",
  });

  assert.equal(
    capturedRequest?.intent,
    "edit",
    "an 'edit' kind must stamp intent as 'edit' — the gate is not hard-coded to 'orchestrate'",
  );
});

// ---------------------------------------------------------------------------
// 2. cgs-refusal-surfaces-the-holder-and-spawns-nothing
//    A held story is a wait that names the holder; the spawn fn is NEVER invoked.
// ---------------------------------------------------------------------------

test("cgs-refusal-surfaces-the-holder-and-spawns-nothing: a refused claim returns a typed wait decision naming the holder verbatim; spawn fn is never invoked", async () => {
  const holder = sampleClaimDoc({
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    intent: "real",
    unitId: "chat-subagent-spawn",
  });

  let spawnRunCount = 0;

  const result = await claimGatedSpawn({
    unitId: "chat-subagent-spawn",
    sessionId: "sess-beta",
    branch: "claude/sess-beta",
    kind: "orchestrate",
    store: refusingStore(holder),
    spawnFn: async (_onTrace: (msg: unknown) => void) => {
      spawnRunCount += 1;
      return "spawned";
    },
  });

  assert.equal(
    result.ok,
    false,
    "a refused claim must return ok: false — this is a wait, never a silent drop (ADR-0138 §2)",
  );
  if (result.ok) return; // TypeScript narrowing; control never reaches here given the assertion above

  // The refusal must carry reason: "held" so the orchestrator can distinguish a wait from an input error
  assert.equal(
    (result as { reason?: string }).reason,
    "held",
    "refusal reason must be 'held' (a wait — another session holds the story) not 'error' or 'no-unit'",
  );

  // The holder must be surfaced VERBATIM (ADR-0138 §2 — the orchestrator names who has the story)
  const heldBy = (result as { heldBy: ClaimHolder }).heldBy;
  assert.ok(heldBy !== undefined, "the refused result must carry a heldBy field (never absent)");
  assert.equal(
    heldBy.sessionId,
    "clever-cannon-1ff4cb",
    "heldBy.sessionId must name the live holder so the orchestrator can tell the user who has it",
  );
  assert.equal(
    heldBy.branch,
    "claude/clever-cannon-1ff4cb",
    "heldBy.branch must carry the holder's branch for the wait-for-merge message",
  );
  assert.equal(
    heldBy.intent,
    "real",
    "heldBy.intent must carry the holder's work kind (informational — for the refusal message)",
  );

  assert.equal(
    spawnRunCount,
    0,
    "the spawn fn must NEVER be invoked when the claim is refused — no subagent without the claim (ADR-0138 §3)",
  );
});

// ---------------------------------------------------------------------------
// 3. cgs-trace-bumps-the-heartbeat
//    Each trace signal fed to the gate's hook bumps the claim heartbeat through
//    the injected store. A session that stops emitting stops bumping (ages out
//    truthfully — no zombie ping).
// ---------------------------------------------------------------------------

test("cgs-trace-bumps-the-heartbeat: each trace signal bumps bumpHeartbeat() exactly once, targeting the right unit", async () => {
  const bumpCalls: string[] = [];

  const store: ClaimStore = {
    async claim(req) {
      return { acquired: true, claim: sampleClaimDoc({ unitId: req.unitId }), reclaimed: false };
    },
    async bumpHeartbeat(unitId) {
      bumpCalls.push(unitId);
    },
  };

  const result = await claimGatedSpawn({
    unitId: "chat-subagent-spawn",
    sessionId: "sess-gamma",
    branch: "claude/sess-gamma",
    kind: "orchestrate",
    store,
    spawnFn: async (onTrace: (msg: unknown) => void) => {
      // Simulate three SDK messages arriving mid-spawn (system init, an assistant turn, the result)
      onTrace({ type: "system", subtype: "init" });
      onTrace({ type: "assistant", message: { content: [{ type: "text", text: "thinking…" }] } });
      onTrace({ type: "result", subtype: "success", is_error: false });
      return "done";
    },
  });

  assert.equal(result.ok, true, "the gate must succeed when the claim is acquired");

  assert.equal(
    bumpCalls.length,
    3,
    "bumpHeartbeat must be called exactly once per trace signal — not batched, not skipped (each signal = one heartbeat)",
  );
  // Every bump must target the claimed unit
  for (const id of bumpCalls) {
    assert.equal(
      id,
      "chat-subagent-spawn",
      "each bumpHeartbeat call must target the claimed unit — never a different id",
    );
  }
});

test("cgs-trace-bumps-the-heartbeat: a spawn fn that emits no signals produces zero heartbeat bumps (ages out truthfully — no self-reported zombie ping)", async () => {
  const bumpCalls: string[] = [];

  const store: ClaimStore = {
    async claim(req) {
      return { acquired: true, claim: sampleClaimDoc({ unitId: req.unitId }), reclaimed: false };
    },
    async bumpHeartbeat(unitId) {
      bumpCalls.push(unitId);
    },
  };

  await claimGatedSpawn({
    unitId: "chat-subagent-spawn",
    sessionId: "sess-dead",
    branch: "claude/sess-dead",
    kind: "orchestrate",
    store,
    spawnFn: async (_onTrace: (msg: unknown) => void) => {
      // A dead session — no trace signals are emitted
      return "done-silently";
    },
  });

  assert.equal(
    bumpCalls.length,
    0,
    "a spawn fn that emits no trace signals must produce zero heartbeat bumps — the dead session ages out truthfully (ADR-0138 §4)",
  );
});

// ---------------------------------------------------------------------------
// 4. cgs-no-claim-free-spawn-path
//    A blank unitId is a fail-closed typed refusal: no claim call, no spawn.
//    The gate exposes no bypass arm.
// ---------------------------------------------------------------------------

test("cgs-no-claim-free-spawn-path: a blank unitId is a fail-closed typed refusal — store.claim() is never called, spawn fn is never invoked", async () => {
  let claimCalled = false;
  let spawnCalled = false;

  const store: ClaimStore = {
    async claim(_req) {
      claimCalled = true;
      return { acquired: true, claim: sampleClaimDoc(), reclaimed: false };
    },
    async bumpHeartbeat(_unitId) {},
  };

  const result = await claimGatedSpawn({
    unitId: "", // blank — the fail-closed input wall
    sessionId: "sess-delta",
    branch: "claude/sess-delta",
    kind: "orchestrate",
    store,
    spawnFn: async (_onTrace: (msg: unknown) => void) => {
      spawnCalled = true;
      return "spawned";
    },
  });

  assert.equal(
    result.ok,
    false,
    "a blank unitId must produce a typed refusal (ok: false) — the gate exposes no claim-free spawn path",
  );
  if (result.ok) return;

  assert.equal(
    (result as { reason?: string }).reason,
    "no-unit",
    "refusal reason must be 'no-unit' (distinguishes the input-validation wall from a 'held' wait)",
  );

  assert.equal(
    claimCalled,
    false,
    "store.claim() must NEVER be called when unitId is blank — fail-closed before any I/O, not after",
  );
  assert.equal(
    spawnCalled,
    false,
    "the spawn fn must NEVER be invoked when unitId is blank — the gate has no bypass arm (ADR-0138 §3)",
  );

  // Whitespace-only is blank too (the nonBlank rule notice-board's ClaimDoc enforces):
  // the wall must trip BEFORE the store, not lean on the store's own refusal.
  const wsResult = await claimGatedSpawn({
    unitId: "   ",
    sessionId: "sess-delta",
    branch: "claude/sess-delta",
    kind: "orchestrate",
    store,
    spawnFn: async (_onTrace: (msg: unknown) => void) => {
      spawnCalled = true;
      return "spawned";
    },
  });

  assert.equal(wsResult.ok, false, "a whitespace-only unitId must refuse exactly like an empty one");
  if (wsResult.ok) return;
  assert.equal(
    (wsResult as { reason?: string }).reason,
    "no-unit",
    "a whitespace-only unitId must be the same fail-closed 'no-unit' refusal",
  );
  assert.equal(
    claimCalled,
    false,
    "store.claim() must NEVER be called for a whitespace-only unitId — fail-closed before any I/O",
  );
  assert.equal(
    spawnCalled,
    false,
    "the spawn fn must NEVER be invoked for a whitespace-only unitId",
  );
});
