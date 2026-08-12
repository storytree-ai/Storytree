import test from "node:test";
import assert from "node:assert/strict";

import {
  ClaimDoc,
  ClaimGrade,
  ClaimRole,
  claimGrade,
  claimRole,
  roleFromLegacyIntent,
  roleForWorkKind,
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

test("heartbeat-bump-shape-resets-without-reacquire: bumpHeartbeat resets heartbeatAt to `now`, so a stale claim is no longer reclaimable", () => {
  const now = new Date("2026-06-27T12:00:00.000Z");
  // A claim whose heartbeat is two thresholds old → stale (the precondition the contract names).
  const stale = sample({ heartbeatAt: new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString() });
  assert.equal(isReclaimable(stale, now), true, "precondition: the claim is stale");

  const bumped = bumpHeartbeat(stale, now);
  assert.equal(bumped.heartbeatAt, now.toISOString(), "heartbeat reset to now");
  assert.equal(isReclaimable(bumped, now), false, "the bumped claim is no longer reclaimable");
});

test("heartbeat-bump-shape-resets-without-reacquire: bumpHeartbeat changes ONLY heartbeatAt (every other field preserved), and never mutates the input", () => {
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

test("work-claim-request-carries-work-intent: workClaimRequest stamps ROLE from the work kind, preserving attribution", () => {
  const base = {
    unitId: "wisp-as-story-claim",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
  };
  const edit = workClaimRequest({ ...base, kind: "edit" });
  const orchestrate = workClaimRequest({ ...base, kind: "orchestrate" });

  // The kind lands in the TYPED field now (ADR-0346 D3). It used to be stamped over `intent`,
  // which is what made the column 55% the literal string "orchestrate".
  assert.equal(edit.role, "authoring");
  assert.equal(orchestrate.role, "supplementing");
  for (const req of [edit, orchestrate]) {
    assert.equal(req.unitId, base.unitId);
    assert.equal(req.sessionId, base.sessionId);
    assert.equal(req.branch, base.branch);
  }
});

test("work-claim-request-carries-work-intent: workClaimRequest carries the caller's PROSE through as intent, never the kind (ADR-0346 D3)", () => {
  const req = workClaimRequest({
    unitId: "noticeboard-cli",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    kind: "orchestrate",
    intent: "splitting the claim intent into a typed role and prose",
  });
  assert.equal(req.intent, "splitting the claim intent into a typed role and prose");
  assert.equal(req.role, "supplementing", "the kind still decides the typed role");
  // The regression this closes: the prose must not be overwritten by the kind word.
  assert.notEqual(req.intent, "orchestrate");
});

test("work-claim-request-carries-work-intent: workClaimRequest prose omitted leaves intent EMPTY — never the kind word as a stand-in", () => {
  const req = workClaimRequest({
    unitId: "noticeboard-cli",
    sessionId: "clever-cannon-1ff4cb",
    branch: "claude/clever-cannon-1ff4cb",
    kind: "orchestrate",
  });
  assert.equal(req.intent, "", "no prose supplied is an EMPTY prose field, not a constant");
  assert.equal(req.role, "supplementing");
});

test("roleForWorkKind: the one join between the outer loop's kinds and the map's roles", () => {
  assert.equal(roleForWorkKind("edit"), "authoring");
  assert.equal(roleForWorkKind("orchestrate"), "supplementing");
});

// ── the intent/role split (ADR-0346 D3) ──────────────────────────────────────

test("ClaimRole: accepts exactly the three roles, refuses anything else", () => {
  for (const role of ["authoring", "proving", "supplementing"]) {
    assert.equal(ClaimRole.parse(role), role);
  }
  // Never the proof colours — the honesty wall (ADR-0045): a claim is work, not a verdict.
  assert.throws(() => ClaimRole.parse("green"));
  assert.throws(() => ClaimRole.parse("bloom"));
  assert.throws(() => ClaimRole.parse("orchestrate"), "the KIND vocabulary is not the role one");
  assert.throws(() => ClaimRole.parse(""));
});

test("ClaimDoc: role is OPTIONAL — every pre-split doc parses unchanged (back-compat)", () => {
  // `sample()` carries NO role field — exactly the shape every row written before D3 has.
  const parsed = ClaimDoc.parse(sample());
  assert.equal(parsed.role, undefined, "absent stays absent — no invented default on the doc");
  assert.equal(ClaimDoc.parse({ ...sample(), role: "proving" }).role, "proving");
  assert.throws(() => ClaimDoc.parse({ ...sample(), role: "orchestrating" }));
});

test("roleFromLegacyIntent: the migration ramp itself — every legacy word, and the fall-through", () => {
  // Tested BY NAME rather than only through `claimRole`, because this switch is the whole
  // back-compat contract: until the rows are rewritten it is what the majority of the ledger reads
  // through, and it must agree byte-for-byte with the switch the map applies to `intent` today.
  assert.equal(roleFromLegacyIntent("edit"), "authoring");
  assert.equal(roleFromLegacyIntent("authoring"), "authoring");
  assert.equal(roleFromLegacyIntent("real"), "proving");
  assert.equal(roleFromLegacyIntent("proving"), "proving");
  assert.equal(roleFromLegacyIntent("orchestrate"), "supplementing");
  assert.equal(roleFromLegacyIntent("supplementing"), "supplementing");
  // Anything else — including every post-split prose row — is honest glue, never a throw.
  assert.equal(roleFromLegacyIntent("story:real"), "supplementing", "the 21% variant is NOT 'real'");
  assert.equal(roleFromLegacyIntent(""), "supplementing");
  assert.equal(roleFromLegacyIntent("Edit"), "supplementing", "the match is exact, never folded");
});

test("claimRole: a typed role wins; an absent one is DERIVED from the legacy intent string", () => {
  // Typed: read as written, whatever the prose says.
  assert.equal(claimRole({ role: "proving", intent: "anything at all" }), "proving");
  // Absent: exactly today's switch — the one the map applies to `intent` for the wisp colour.
  assert.equal(claimRole({ intent: "edit" }), "authoring");
  assert.equal(claimRole({ intent: "authoring" }), "authoring");
  assert.equal(claimRole({ intent: "real" }), "proving");
  assert.equal(claimRole({ intent: "proving" }), "proving");
  assert.equal(claimRole({ intent: "orchestrate" }), "supplementing");
  assert.equal(claimRole({ intent: "supplementing" }), "supplementing");
});

test("claimRole: an unrecognised intent falls through to supplementing, never a throw", () => {
  // The prose rows the split produces land here, and so does anything malformed. A claim must
  // always render, and always render NON-green (ADR-0045) — the same fall-through the map takes.
  assert.equal(claimRole({ intent: "splitting the claim intent into a typed role" }), "supplementing");
  assert.equal(claimRole({ intent: "" }), "supplementing");
  // …and the pre-split sample, whose intent IS one of the recognised words, still reads as itself.
  assert.equal(claimRole(ClaimDoc.parse(sample())), "proving", "sample()'s intent is 'real'");
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
  // No role supplied: the row stays role-less and `claimRole` derives `supplementing` from the
  // prose — exactly what an exploring wisp already renders as (ADR-0346 D3's pull-based migration).
  assert.equal(req.role, undefined);
  assert.equal(claimRole({ intent: req.intent ?? "" }), "supplementing");
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
  assert.equal(bare.role, undefined, "no role supplied leaves the row role-less, to be derived");
  const withIntent = waitingClaimRequest({ ...base, intent: "queued for the store increment" });
  assert.equal(withIntent.intent, "queued for the store increment");
  const withRole = waitingClaimRequest({ ...base, role: "proving" });
  assert.equal(withRole.role, "proving", "a supplied role rides through (ADR-0346 D3)");
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
    intent: "holding the capability while I drive the split",
  });
  // The store stamps claimedAt/heartbeatAt; the stamped request must be a legitimate ClaimDoc.
  const stampedAt = "2026-06-29T00:00:00.000Z";
  const doc = ClaimDoc.parse({ ...req, claimedAt: stampedAt, heartbeatAt: stampedAt });
  assert.equal(doc.intent, "holding the capability while I drive the split");
  assert.equal(doc.role, "supplementing", "the typed role survives the round-trip too");
  assert.equal(doc.unitId, "wisp-as-story-claim");
});

// ── groupClaimsBySession (ADR-0200 D7): the pure by-session ledger fold ───────

import { classifyClaims, groupClaimsBySession, liveClaims } from "./claim.js";

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

test("groupClaimsBySession: decides each entry's ROLE once — typed when written, derived when not", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const fresh = now.toISOString();
  const claims: ClaimDocT[] = [
    // Post-split: a typed role beside genuinely free prose.
    sample({ unitId: "story-a", sessionId: "s1", branch: "claude/s1", grade: "work", role: "supplementing", intent: "wiring the dock's stale marker", claimedAt: "2026-07-16T11:00:00.000Z", heartbeatAt: fresh }),
    // Pre-split: no role at all, its role still inside the intent word — the majority of the ledger.
    sample({ unitId: "story-b", sessionId: "s2", branch: "claude/s2", grade: "work", intent: "real", claimedAt: "2026-07-16T11:30:00.000Z", heartbeatAt: fresh }),
  ];
  const groups = groupClaimsBySession(claims, now);
  assert.equal(groups[0]?.claims[0]?.role, "supplementing");
  assert.equal(groups[0]?.claims[0]?.intent, "wiring the dock's stale marker", "prose rides through unparsed");
  assert.equal(groups[1]?.claims[0]?.role, "proving", "the pre-split row's role is DERIVED, not absent");
  assert.equal(groups[1]?.claims[0]?.intent, "real");
});

test("groupClaimsBySession: stale claims are MARKED, never dropped; a fully-stale session is a stale group", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleBeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS * 2).toISOString();
  const claims: ClaimDocT[] = [
    sample({ unitId: "story-a", sessionId: "dead", grade: "work", heartbeatAt: staleBeat, claimedAt: "2026-07-16T09:00:00.000Z" }),
    sample({ unitId: "story-b", sessionId: "live", grade: "exploring", heartbeatAt: now.toISOString(), claimedAt: "2026-07-16T11:00:00.000Z" }),
    sample({ unitId: "story-c", sessionId: "live", grade: "work", heartbeatAt: staleBeat, claimedAt: "2026-07-16T10:00:00.000Z" }),
  ];
  const groups = groupClaimsBySession(claims, now);
  // The dead session RENDERS — this is the defect ADR-0346 D1 makes load-bearing: a dropped ghost
  // is a row the per-unit view still shows, and under a binding fence it blocks a live session.
  assert.equal(groups.length, 2);
  const dead = groups.find((g) => g.sessionId === "dead");
  assert.equal(dead?.stale, true, "a session whose every row is stale is a DARK group, not an absent one");
  assert.equal(dead?.claims[0]?.stale, true);

  const live = groups.find((g) => g.sessionId === "live");
  assert.equal(live?.stale, false, "one live row is enough to keep the session live");
  assert.deepEqual(
    live?.claims.map((c) => [c.unitId, c.stale]),
    [["story-c", true], ["story-b", false]],
    "the live session's stale row rides through marked (work outranks exploring in the fold's order)",
  );
  assert.equal(live?.claims.find((c) => c.unitId === "story-c")?.heartbeatAgeMs, CLAIM_STALE_RECLAIM_MS * 2);
});

// ── classifyClaims / liveClaims: the ONE stale predicate every surface consults ───────────────

test("classifyClaims: marks each row via isReclaimable, preserving input order and dropping nothing", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleBeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS - 60_000).toISOString();
  const rows = [
    sample({ unitId: "ghost", heartbeatAt: staleBeat }),
    sample({ unitId: "fresh", heartbeatAt: now.toISOString() }),
  ];
  const marked = classifyClaims(rows, now);
  assert.deepEqual(marked.map((m) => [m.claim.unitId, m.stale]), [["ghost", true], ["fresh", false]]);
  assert.equal(marked[0]?.heartbeatAgeMs, CLAIM_STALE_RECLAIM_MS + 60_000);
  assert.equal(marked[1]?.heartbeatAgeMs, 0);
});

test("classifyClaims: a future heartbeat (clock skew) clamps to 0 and is never stale", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const marked = classifyClaims([sample({ heartbeatAt: "2026-07-16T12:00:05.000Z" })], now);
  assert.equal(marked[0]?.heartbeatAgeMs, 0);
  assert.equal(marked[0]?.stale, false);
});

test("liveClaims: the live subset only, on the SAME threshold the store enforces in SQL", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");
  const staleBeat = new Date(now.getTime() - CLAIM_STALE_RECLAIM_MS).toISOString();
  const rows = [
    sample({ unitId: "ghost-work", grade: "work", heartbeatAt: staleBeat }),
    sample({ unitId: "live-work", grade: "work", heartbeatAt: now.toISOString() }),
  ];
  assert.deepEqual(liveClaims(rows, now).map((c) => c.unitId), ["live-work"]);
  // Exactly AT the threshold is stale — isReclaimable is `>=`, and the store's SQL agrees.
  assert.equal(liveClaims(rows, now).length, 1);
  // An injected threshold moves both together; there is no second constant to drift.
  assert.deepEqual(liveClaims(rows, now, CLAIM_STALE_RECLAIM_MS * 4).map((c) => c.unitId), [
    "ghost-work",
    "live-work",
  ]);
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

// ── foldDepartures (ADR-0200 D7): the pure wisp-out departure fold ────────────

import { foldDepartures, DEPARTURE_WINDOW_MS, type ClaimDeparture } from "./claim.js";

const DEP_NOW = new Date("2026-07-16T12:00:00.000Z");

/** A raw departure row as the store's `recentDepartures` returns it. */
function departureRow(over: Partial<ClaimDeparture> = {}): ClaimDeparture {
  return {
    unitId: "chat-session-stream",
    sessionId: "sess-A",
    doc: { ...sample(), grade: "work" },
    at: new Date(DEP_NOW.getTime() - 30_000).toISOString(),
    ...over,
  };
}

test("DEPARTURE_WINDOW_MS: the Stage-1 default is 2 minutes", () => {
  assert.equal(DEPARTURE_WINDOW_MS, 120_000);
});

test("foldDepartures: a single departure maps to the departed-claim shape, ageMs from the caller's now", () => {
  const folded = foldDepartures([departureRow()], DEP_NOW);
  assert.deepEqual(folded, [
    {
      unitId: "chat-session-stream",
      sessionId: "sess-A",
      grade: "work",
      ageMs: 30_000,
      at: new Date(DEP_NOW.getTime() - 30_000).toISOString(),
    },
  ]);
});

test("foldDepartures: deterministic order — newest first (at DESC), ties break on unitId", () => {
  const older = new Date(DEP_NOW.getTime() - 90_000).toISOString();
  const newer = new Date(DEP_NOW.getTime() - 10_000).toISOString();
  const folded = foldDepartures(
    [
      departureRow({ unitId: "story-b", at: older }),
      departureRow({ unitId: "story-z", at: newer }),
      departureRow({ unitId: "story-a", at: newer }),
    ],
    DEP_NOW,
  );
  assert.deepEqual(
    folded.map((d) => d.unitId),
    ["story-a", "story-z", "story-b"],
    "newest first, at-ties alphabetical on unitId",
  );
});

test("foldDepartures: ageMs clamps to zero on a future `at` (clock skew), never negative", () => {
  const future = new Date(DEP_NOW.getTime() + 5_000).toISOString();
  const folded = foldDepartures([departureRow({ at: future })], DEP_NOW);
  assert.equal(folded[0]?.ageMs, 0);
});

test("foldDepartures: grade reads off the released doc via claimGrade — every grade, absent → work", () => {
  const at = new Date(DEP_NOW.getTime() - 1_000).toISOString();
  const cases: Array<[unknown, string]> = [
    [{ ...sample(), grade: "exploring" }, "exploring"],
    [{ ...sample(), grade: "waiting" }, "waiting"],
    [{ ...sample(), grade: "work" }, "work"],
    [sample(), "work"], // pre-grade doc: absent grade IS the work claim (ADR-0200 D2 back-compat)
  ];
  for (const [doc, expected] of cases) {
    const folded = foldDepartures([departureRow({ doc, at })], DEP_NOW);
    assert.equal(folded[0]?.grade, expected, `doc grade → ${expected}`);
  }
});

test("foldDepartures: a malformed doc degrades to work, never a throw (the fold is a courtesy read)", () => {
  const at = new Date(DEP_NOW.getTime() - 1_000).toISOString();
  for (const doc of [null, undefined, "junk", 42, { grade: "sneaky" }, { grade: 7 }]) {
    const folded = foldDepartures([departureRow({ doc, at })], DEP_NOW);
    assert.equal(folded[0]?.grade, "work", `malformed doc ${JSON.stringify(doc)} folds as work`);
  }
});

test("foldDepartures: a row older than the window is DROPPED (defense in depth behind the store's SQL bound)", () => {
  const inside = new Date(DEP_NOW.getTime() - (DEPARTURE_WINDOW_MS - 1_000)).toISOString();
  const outside = new Date(DEP_NOW.getTime() - (DEPARTURE_WINDOW_MS + 1_000)).toISOString();
  const folded = foldDepartures(
    [departureRow({ unitId: "story-in", at: inside }), departureRow({ unitId: "story-out", at: outside })],
    DEP_NOW,
  );
  assert.deepEqual(folded.map((d) => d.unitId), ["story-in"], "the aged-out row never renders");
});

test("foldDepartures: an explicit windowMs overrides the default", () => {
  const tenSecondsAgo = new Date(DEP_NOW.getTime() - 10_000).toISOString();
  // Default 2 min → kept; a 5 s override → dropped.
  assert.equal(foldDepartures([departureRow({ at: tenSecondsAgo })], DEP_NOW).length, 1);
  assert.equal(foldDepartures([departureRow({ at: tenSecondsAgo })], DEP_NOW, 5_000).length, 0);
});

test("foldDepartures: empty in, empty out", () => {
  assert.deepEqual(foldDepartures([], DEP_NOW), []);
});
