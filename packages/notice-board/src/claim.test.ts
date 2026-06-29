import test from "node:test";
import assert from "node:assert/strict";

import {
  ClaimDoc,
  CLAIM_STALE_RECLAIM_MS,
  isReclaimable,
  bumpHeartbeat,
  workClaimRequest,
  type ClaimDocT,
} from "./claim.js";

/**
 * Pure tests for the claim shape + the reclaim predicate — no I/O, no DB. The atomic SQL that
 * enforces the same reclaim condition lives in `store/claim-store.ts` (exercised offline by its
 * control-flow test + the live-gated atomic test).
 */

function sample(over: Partial<ClaimDocT> = {}): ClaimDocT {
  return {
    unitId: "chat-session-stream",
    sessionId: "silly-brattain-484392",
    branch: "claude/silly-brattain-484392",
    intent: "real",
    claimedAt: "2026-06-27T00:00:00.000Z",
    heartbeatAt: "2026-06-27T00:00:00.000Z",
    ...over,
  };
}

test("ClaimDoc: parses a well-formed claim", () => {
  const parsed = ClaimDoc.parse(sample());
  assert.equal(parsed.unitId, "chat-session-stream");
  assert.equal(parsed.intent, "real");
});

test("ClaimDoc: intent defaults to empty string when omitted", () => {
  const { intent: _omit, ...rest } = sample();
  const parsed = ClaimDoc.parse(rest);
  assert.equal(parsed.intent, "");
});

test("ClaimDoc: fail-closed on blank attribution (unitId / sessionId / branch)", () => {
  assert.throws(() => ClaimDoc.parse(sample({ unitId: "   " })), /non-blank/);
  assert.throws(() => ClaimDoc.parse(sample({ sessionId: "" })), /non-blank/);
  assert.throws(() => ClaimDoc.parse(sample({ branch: " \t " })), /non-blank/);
});

test("ClaimDoc: strict — an unknown (e.g. derived) field is rejected, not stripped", () => {
  assert.throws(() => ClaimDoc.parse({ ...sample(), stale: true }), /Unrecognized key/);
});

test("isReclaimable: a fresh claim (heartbeat = now) is NOT reclaimable", () => {
  const now = new Date("2026-06-27T00:00:00.000Z");
  assert.equal(isReclaimable(sample({ heartbeatAt: now.toISOString() }), now), false);
});

test("isReclaimable: just under the threshold is NOT reclaimable; at/over IS", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");
  const justUnder = new Date(now.getTime() - (CLAIM_STALE_RECLAIM_MS - 1_000)).toISOString();
  const exactlyAt = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS).toISOString();
  const wellOver = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 3).toISOString();
  assert.equal(isReclaimable(sample({ heartbeatAt: justUnder }), now), false);
  assert.equal(isReclaimable(sample({ heartbeatAt: exactlyAt }), now), true);
  assert.equal(isReclaimable(sample({ heartbeatAt: wellOver }), now), true);
});

test("isReclaimable: an explicit staleMs overrides the default", () => {
  const now = new Date("2026-06-27T00:10:00.000Z");
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1_000).toISOString();
  // Default 2h → not yet reclaimable; a 5-minute override → reclaimable.
  assert.equal(isReclaimable(sample({ heartbeatAt: tenMinutesAgo }), now), false);
  assert.equal(isReclaimable(sample({ heartbeatAt: tenMinutesAgo }), now, 5 * 60 * 1_000), true);
});

// ── bumpHeartbeat (A2, ADR-0138 §4): the pure mid-flight liveness refresh ─────

test("bumpHeartbeat: resets heartbeatAt to `now`, so a stale claim is no longer reclaimable", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");
  // A claim whose heartbeat is two thresholds old → stale (the precondition the contract names).
  const stale = sample({ heartbeatAt: new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString() });
  assert.equal(isReclaimable(stale, now), true, "precondition: the claim is stale");

  const bumped = bumpHeartbeat(stale, now);
  assert.equal(bumped.heartbeatAt, now.toISOString(), "heartbeat reset to now");
  assert.equal(isReclaimable(bumped, now), false, "the bumped claim is no longer reclaimable");
});

test("bumpHeartbeat: changes ONLY heartbeatAt (every other field preserved), and never mutates the input", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");
  const claim = sample({ heartbeatAt: "2026-06-27T00:00:00.000Z" });
  const bumped = bumpHeartbeat(claim, now);

  // Identical to the input save for heartbeatAt.
  assert.deepEqual({ ...bumped, heartbeatAt: claim.heartbeatAt }, claim);
  // Pure: a new object, and the input's heartbeat is untouched.
  assert.notEqual(bumped, claim);
  assert.equal(claim.heartbeatAt, "2026-06-27T00:00:00.000Z", "the input claim is not mutated");
});

// ── workClaimRequest (A3, ADR-0138 §3): the pure work-time request builder ────

test("workClaimRequest: stamps intent from the work kind, preserving attribution", () => {
  const base = {
    unitId: "wisp-as-story-claim",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
  };
  const edit = workClaimRequest({ ...base, kind: "edit" });
  const orchestrate = workClaimRequest({ ...base, kind: "orchestrate" });

  assert.equal(edit.intent, "edit");
  assert.equal(orchestrate.intent, "orchestrate");
  for (const req of [edit, orchestrate]) {
    assert.equal(req.unitId, base.unitId);
    assert.equal(req.sessionId, base.sessionId);
    assert.equal(req.branch, base.branch);
  }
});

test("workClaimRequest: the built request round-trips through ClaimDoc.parse once the store stamps timestamps", () => {
  const req = workClaimRequest({
    unitId: "wisp-as-story-claim",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    kind: "orchestrate",
  });
  // The store stamps claimedAt/heartbeatAt; the stamped request must be a legitimate ClaimDoc.
  const stampedAt = "2026-06-29T00:00:00.000Z";
  const doc = ClaimDoc.parse({ ...req, claimedAt: stampedAt, heartbeatAt: stampedAt });
  assert.equal(doc.intent, "orchestrate");
  assert.equal(doc.unitId, "wisp-as-story-claim");
});
