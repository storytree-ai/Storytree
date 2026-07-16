import test from "node:test";
import assert from "node:assert/strict";

import {
  ClaimDoc,
  ClaimGrade,
  claimGrade,
  CLAIM_STALE_RECLAIM_MS,
  isReclaimable,
  bumpHeartbeat,
  workClaimRequest,
  exploringClaimRequest,
  waitingClaimRequest,
  oldestLiveWaiter,
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

// ── claim grades (ADR-0200 D2): exploring / waiting / work on the one ledger ──

test("ClaimGrade: accepts exactly the three grades, refuses anything else", () => {
  for (const grade of ["exploring", "waiting", "work"]) {
    assert.equal(ClaimGrade.parse(grade), grade);
  }
  assert.throws(() => ClaimGrade.parse("building"));
  assert.throws(() => ClaimGrade.parse(""));
});

test("ClaimDoc: grade defaults to 'work' — every pre-grade doc parses unchanged (back-compat)", () => {
  // `sample()` carries NO grade field — exactly today's producers' shape; .strict() must accept it.
  const parsed = ClaimDoc.parse(sample());
  assert.equal(parsed.grade, "work");
});

test("ClaimDoc: an explicit exploring/waiting grade parses; an unknown grade is refused", () => {
  assert.equal(ClaimDoc.parse({ ...sample(), grade: "exploring" }).grade, "exploring");
  assert.equal(ClaimDoc.parse({ ...sample(), grade: "waiting" }).grade, "waiting");
  assert.throws(() => ClaimDoc.parse({ ...sample(), grade: "hovering" }));
});

test("claimGrade: reads the effective grade — 'work' when absent (the pre-grade doc)", () => {
  assert.equal(claimGrade({}), "work");
  assert.equal(claimGrade({ grade: "exploring" }), "exploring");
  assert.equal(claimGrade(ClaimDoc.parse(sample())), "work");
});

test("ClaimDoc: a graded doc still fail-closes on blank attribution", () => {
  assert.throws(() => ClaimDoc.parse({ ...sample({ unitId: "  " }), grade: "exploring" }), /non-blank/);
});

test("workClaimRequest: stamps grade 'work' (the exclusive mutex, ADR-0200 D2)", () => {
  const req = workClaimRequest({
    unitId: "wisp-as-story-claim",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    kind: "edit",
  });
  assert.equal(req.grade, "work");
});

test("exploringClaimRequest: stamps grade 'exploring' and carries the intent prose on the claim row", () => {
  const req = exploringClaimRequest({
    unitId: "noticeboard-claim-ledger",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    intent: "reading the store half before deciding the queue shape",
  });
  assert.equal(req.grade, "exploring");
  assert.equal(req.intent, "reading the store half before deciding the queue shape");
  assert.equal(req.unitId, "noticeboard-claim-ledger");
  // Round-trips: once the store stamps timestamps, the request is a legitimate graded ClaimDoc.
  const stampedAt = "2026-07-16T00:00:00.000Z";
  const doc = ClaimDoc.parse({ ...req, claimedAt: stampedAt, heartbeatAt: stampedAt });
  assert.equal(doc.grade, "exploring");
  assert.equal(doc.intent, "reading the store half before deciding the queue shape");
});

test("waitingClaimRequest: stamps grade 'waiting'; intent optional, defaults omitted-safe", () => {
  const base = {
    unitId: "noticeboard-claim-ledger",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
  };
  const bare = waitingClaimRequest(base);
  assert.equal(bare.grade, "waiting");
  const withIntent = waitingClaimRequest({ ...base, intent: "queued for the store increment" });
  assert.equal(withIntent.intent, "queued for the store increment");
  // Round-trips through ClaimDoc.parse once the store stamps timestamps.
  const stampedAt = "2026-07-16T00:00:00.000Z";
  const doc = ClaimDoc.parse({ ...bare, claimedAt: stampedAt, heartbeatAt: stampedAt });
  assert.equal(doc.grade, "waiting");
});

// ── oldestLiveWaiter (ADR-0200 D2): the pure promotion pick for the queue ─────

/** A waiting-grade sample with per-waiter attribution + timestamps. */
function waiter(sessionId: string, claimedAt: string, heartbeatAt: string = claimedAt): ClaimDocT {
  return ClaimDoc.parse({
    unitId: "noticeboard-claim-ledger",
    sessionId,
    branch: `claude/${sessionId}`,
    intent: "queued",
    grade: "waiting",
    claimedAt,
    heartbeatAt,
  });
}

test("oldestLiveWaiter: picks the oldest waiter by claimedAt", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const early = waiter("early-waiter-111111", "2026-07-16T10:00:00.000Z", now.toISOString());
  const late = waiter("late-waiter-222222", "2026-07-16T11:00:00.000Z", now.toISOString());
  assert.equal(oldestLiveWaiter([late, early], now), early);
});

test("oldestLiveWaiter: drops stale waiters (dead sessions never win promotion)", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleHeartbeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();
  // The OLDEST waiter by claimedAt is stale — the younger live one must win.
  const staleOldest = waiter("stale-waiter-333333", "2026-07-16T08:00:00.000Z", staleHeartbeat);
  const liveYounger = waiter("live-waiter-444444", "2026-07-16T11:00:00.000Z", now.toISOString());
  assert.equal(isReclaimable(staleOldest, now), true, "precondition: the oldest waiter is stale");
  assert.equal(oldestLiveWaiter([staleOldest, liveYounger], now), liveYounger);
});

test("oldestLiveWaiter: no waiters / all stale → undefined (nothing to promote)", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleHeartbeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();
  assert.equal(oldestLiveWaiter([], now), undefined);
  assert.equal(oldestLiveWaiter([waiter("stale-waiter-555555", "2026-07-16T08:00:00.000Z", staleHeartbeat)], now), undefined);
});

test("oldestLiveWaiter: an explicit staleMs overrides the default (mirrors isReclaimable)", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1_000).toISOString();
  const w = waiter("live-waiter-666666", "2026-07-16T10:00:00.000Z", tenMinutesAgo);
  // Default 2h → live; a 5-minute override → stale, so nothing to promote.
  assert.equal(oldestLiveWaiter([w], now), w);
  assert.equal(oldestLiveWaiter([w], now, 5 * 60 * 1_000), undefined);
});

test("oldestLiveWaiter: claimedAt ties break stably to the first-listed waiter", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const at = "2026-07-16T10:00:00.000Z";
  const first = waiter("tie-waiter-777777", at, now.toISOString());
  const second = waiter("tie-waiter-888888", at, now.toISOString());
  assert.equal(oldestLiveWaiter([first, second], now), first);
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

// ── groupClaimsBySession (ADR-0200 D7): the pure by-session ledger fold ───────

import { groupClaimsBySession } from "./claim.js";

test("groupClaimsBySession: groups by session, strongest grade first within a group", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const fresh = now.toISOString();
  const claims: ClaimDocT[] = [
    sample({ unitId: "story-a", sessionId: "s1", branch: "claude/s1", grade: "exploring", intent: "reading", claimedAt: "2026-07-16T11:00:00.000Z", heartbeatAt: fresh }),
    sample({ unitId: "story-b", sessionId: "s1", branch: "claude/s1", grade: "work", intent: "building", claimedAt: "2026-07-16T11:30:00.000Z", heartbeatAt: fresh }),
    sample({ unitId: "story-a", sessionId: "s2", branch: "claude/s2", grade: "waiting", intent: "", claimedAt: "2026-07-16T11:45:00.000Z", heartbeatAt: fresh }),
  ];
  const groups = groupClaimsBySession(claims, now);
  assert.equal(groups.length, 2);
  // s1's oldest claim (11:00) predates s2's (11:45) → s1 first.
  assert.equal(groups[0]?.sessionId, "s1");
  assert.equal(groups[0]?.branch, "claude/s1");
  // Within s1: work outranks exploring despite being claimed later.
  assert.deepEqual(groups[0]?.claims.map((c) => c.unitId), ["story-b", "story-a"]);
  assert.deepEqual(groups[0]?.claims.map((c) => c.grade), ["work", "exploring"]);
  assert.equal(groups[1]?.sessionId, "s2");
  assert.equal(groups[1]?.claims[0]?.grade, "waiting");
});

test("groupClaimsBySession: stale claims are dropped; a fully-stale session has no group", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleBeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();
  const claims: ClaimDocT[] = [
    sample({ unitId: "story-a", sessionId: "dead", grade: "work", heartbeatAt: staleBeat }),
    sample({ unitId: "story-b", sessionId: "live", grade: "exploring", heartbeatAt: now.toISOString(), claimedAt: "2026-07-16T11:00:00.000Z" }),
    sample({ unitId: "story-c", sessionId: "live", grade: "work", heartbeatAt: staleBeat, claimedAt: "2026-07-16T10:00:00.000Z" }),
  ];
  const groups = groupClaimsBySession(claims, now);
  assert.equal(groups.length, 1, "the dead session never renders");
  assert.equal(groups[0]?.sessionId, "live");
  assert.deepEqual(groups[0]?.claims.map((c) => c.unitId), ["story-b"], "the live session's stale row is dropped too");
});

test("groupClaimsBySession: ageMs measures claimedAt→now, clamped to zero; claimedAt is carried", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const claimedAt = "2026-07-16T11:15:00.000Z"; // 45 minutes before now
  const future = "2026-07-16T12:00:01.000Z"; // clock skew — clamps to 0
  const groups = groupClaimsBySession(
    [
      sample({ unitId: "story-a", sessionId: "s1", grade: "exploring", claimedAt, heartbeatAt: now.toISOString() }),
      sample({ unitId: "story-b", sessionId: "s1", grade: "exploring", claimedAt: future, heartbeatAt: now.toISOString() }),
    ],
    now,
  );
  const byUnit = new Map(groups[0]?.claims.map((c) => [c.unitId, c]));
  assert.equal(byUnit.get("story-a")?.ageMs, 45 * 60 * 1_000);
  assert.equal(byUnit.get("story-a")?.claimedAt, claimedAt);
  assert.equal(byUnit.get("story-b")?.ageMs, 0, "a future claimedAt clamps to 0, never negative");
});

test("groupClaimsBySession: an absent grade folds as work (pre-grade back-compat), and intent rides through", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const { grade: _omit, ...preGrade } = sample({ unitId: "story-a", sessionId: "s1", intent: "real", claimedAt: "2026-07-16T11:00:00.000Z", heartbeatAt: now.toISOString() });
  const groups = groupClaimsBySession([preGrade], now);
  assert.equal(groups[0]?.claims[0]?.grade, "work");
  assert.equal(groups[0]?.claims[0]?.intent, "real");
});

test("groupClaimsBySession: empty in, empty out; deterministic session tie-break on sessionId", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  assert.deepEqual(groupClaimsBySession([], now), []);
  const at = "2026-07-16T11:00:00.000Z";
  const groups = groupClaimsBySession(
    [
      sample({ unitId: "story-a", sessionId: "zz-later", grade: "exploring", claimedAt: at, heartbeatAt: now.toISOString() }),
      sample({ unitId: "story-b", sessionId: "aa-first", grade: "exploring", claimedAt: at, heartbeatAt: now.toISOString() }),
    ],
    now,
  );
  assert.deepEqual(groups.map((g) => g.sessionId), ["aa-first", "zz-later"], "equal oldest ages tie-break alphabetically");
});

// ── digestOverlapDeltas (ADR-0200 D4): the pure cursor-once delta digest ──────

import { digestOverlapDeltas, type OverlapDelta } from "./claim.js";

function delta(over: Partial<OverlapDelta> & Pick<OverlapDelta, "seq" | "type">): OverlapDelta {
  return {
    unitId: "notice-board",
    sessionId: "sess-other",
    at: "2026-07-16T12:00:00.000Z",
    ...over,
  };
}

test("digestOverlapDeltas: empty in, empty out", () => {
  assert.deepEqual(digestOverlapDeltas([]), []);
});

test("digestOverlapDeltas: one exploring event renders the D4 headline line with the intent prose", () => {
  const lines = digestOverlapDeltas([
    delta({ seq: 7, type: "claimed", grade: "exploring", intent: "reading the spine" }),
  ]);
  assert.deepEqual(lines, ['session sess-other is exploring notice-board ("reading the spine")']);
});

test("digestOverlapDeltas: every event type maps to an explicit phrase — nothing silently drops", () => {
  const cases: Array<[Partial<OverlapDelta> & Pick<OverlapDelta, "seq" | "type">, string]> = [
    [{ seq: 1, type: "claimed", grade: "waiting" }, "session sess-other is waiting on notice-board"],
    [{ seq: 2, type: "claimed", grade: "work" }, "session sess-other took the WORK claim on notice-board"],
    [{ seq: 3, type: "claimed" }, "session sess-other took the WORK claim on notice-board"], // absent grade = work (pre-grade back-compat)
    [{ seq: 4, type: "upgraded" }, "session sess-other upgraded to the WORK claim on notice-board"],
    [{ seq: 5, type: "queued" }, "session sess-other queued for the work slot on notice-board"],
    [{ seq: 6, type: "released" }, "session sess-other released notice-board"],
    [{ seq: 7, type: "reclaimed" }, "session sess-other RECLAIMED the work claim on notice-board (stale holder evicted)"],
    [{ seq: 8, type: "promoted" }, "session sess-other was promoted to the WORK claim on notice-board"],
    [{ seq: 9, type: "downgraded", grade: "exploring" }, "session sess-other downgraded to exploring on notice-board"],
    [{ seq: 10, type: "conflict-refused" }, "session sess-other tried to take the WORK claim on notice-board (refused — slot held)"],
    [{ seq: 11, type: "some-future-type" }, "session sess-other some-future-type on notice-board"],
  ];
  for (const [d, expected] of cases) {
    assert.deepEqual(digestOverlapDeltas([delta(d)]), [expected], `type=${d.type} grade=${String(d.grade)}`);
  }
});

test("digestOverlapDeltas: several events on ONE unit collapse to a single digest line carrying the latest", () => {
  const lines = digestOverlapDeltas([
    delta({ seq: 1, type: "claimed", grade: "exploring", sessionId: "sess-a" }),
    delta({ seq: 2, type: "upgraded", sessionId: "sess-a" }),
    delta({ seq: 3, type: "released", sessionId: "sess-a" }),
  ]);
  assert.deepEqual(lines, [
    "notice-board: 3 claim events — latest: session sess-a released notice-board",
  ]);
});

test("digestOverlapDeltas: units keep first-seen order; a blank intent renders no suffix", () => {
  const lines = digestOverlapDeltas([
    delta({ seq: 1, type: "claimed", grade: "exploring", unitId: "story-b", intent: "   " }),
    delta({ seq: 2, type: "queued", unitId: "story-a" }),
  ]);
  assert.deepEqual(lines, [
    "session sess-other is exploring story-b",
    "session sess-other queued for the work slot on story-a",
  ]);
});
