/**
 * Tests for the pre-spawn claim decision seam (ADR-0138 §3, capability E1):
 * `resolveSpawnClaim` takes a `ClaimResult` and returns the orchestrator's pre-spawn decision —
 * `{ proceed: true }` when the claim was acquired, or `{ proceed: false; heldBy }` when refused,
 * surfacing the holder so the orchestrator can name who has the story and wait or pick other work.
 *
 * The seam is PURE: a ClaimResult in, a SpawnDecision out — no store, no clock, no spawn.
 * The type-only shapes below mirror @storytree/notice-board's ClaimDocT / ClaimResult;
 * they are defined inline so this file imports ONLY node: builtins and relative modules
 * (the worktree has no node_modules — a package value import would crash the proof run).
 *
 * Named for their contract ids (ADR-0122 / ADR-0126):
 *   - scs-acquired-fresh-proceeds     — acquired (fresh) → proceed: true, no heldBy
 *   - scs-acquired-reclaimed-proceeds — acquired (reclaimed stale holder) → proceed: true, no heldBy
 *   - scs-refused-exposes-holder      — refused → proceed: false with heldBy surfacing the holder
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolveSpawnClaim } from "./spawn-claim.js";

// ---------------------------------------------------------------------------
// Inline type mirrors (erased by tsx — no runtime cost, no package resolution)
// ---------------------------------------------------------------------------

interface ClaimDocLike {
  unitId: string;
  sessionId: string;
  branch: string;
  intent: string;
  claimedAt: string;
  heartbeatAt: string;
}

type ClaimResultLike =
  | { acquired: true; claim: ClaimDocLike; reclaimed: boolean }
  | { acquired: false; heldBy: ClaimDocLike };

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function sampleClaim(over: Partial<ClaimDocLike> = {}): ClaimDocLike {
  return {
    unitId: "take-claim-at-spawn",
    sessionId: "silly-brattain-484392",
    branch: "claude/silly-brattain-484392",
    intent: "orchestrate",
    claimedAt: "2026-06-30T00:00:00.000Z",
    heartbeatAt: "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// scs-acquired-fresh-proceeds — a freshly-acquired claim yields proceed: true
// ---------------------------------------------------------------------------

test("scs-acquired-fresh-proceeds: acquired (fresh) claim → { proceed: true } with no heldBy", () => {
  const result: ClaimResultLike = {
    acquired: true,
    claim: sampleClaim(),
    reclaimed: false,
  };
  const decision = resolveSpawnClaim(result);
  assert.equal(decision.proceed, true, "a freshly-acquired claim must produce proceed: true");
  assert.ok(
    !("heldBy" in decision),
    "a proceed:true decision must carry no heldBy field — there is no holder to report",
  );
});

// ---------------------------------------------------------------------------
// scs-acquired-reclaimed-proceeds — reclaiming a stale holder still yields proceed: true
// ---------------------------------------------------------------------------

test("scs-acquired-reclaimed-proceeds: acquired (reclaimed stale holder) → { proceed: true } with no heldBy", () => {
  const result: ClaimResultLike = {
    acquired: true,
    claim: sampleClaim({ intent: "orchestrate" }),
    reclaimed: true,
  };
  const decision = resolveSpawnClaim(result);
  assert.equal(
    decision.proceed,
    true,
    "reclaiming a stale-holder's claim must still produce proceed: true — the caller now holds the claim",
  );
  assert.ok(
    !("heldBy" in decision),
    "a proceed:true decision must carry no heldBy even when the acquire was a reclaim",
  );
});

// ---------------------------------------------------------------------------
// scs-refused-exposes-holder — a refused claim yields proceed: false and surfaces the holder
// ---------------------------------------------------------------------------

test("scs-refused-exposes-holder: refused → { proceed: false } surfacing sessionId / branch / intent", () => {
  const holder = sampleClaim({
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    intent: "real",
  });
  const result: ClaimResultLike = { acquired: false, heldBy: holder };

  const decision = resolveSpawnClaim(result);
  assert.equal(
    decision.proceed,
    false,
    "a refused claim must produce proceed: false so the orchestrator waits or picks other work",
  );

  // Narrow to the refused branch for the holder assertions.
  if (decision.proceed) throw new Error("expected proceed: false — test precondition violated");

  assert.equal(
    decision.heldBy.sessionId,
    "clever-cannon-1ff4cb",
    "heldBy.sessionId must name the live holder so the orchestrator can report who has the story",
  );
  assert.equal(
    decision.heldBy.branch,
    "claude/clever-cannon-1ff4cb",
    "heldBy.branch must carry the holder's branch for the wait-for-merge message",
  );
  assert.equal(
    decision.heldBy.intent,
    "real",
    "heldBy.intent must carry the holder's work kind (informational, for the refusal message)",
  );
});
