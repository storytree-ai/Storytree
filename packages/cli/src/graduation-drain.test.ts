import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGraduationDrain,
  DEFAULT_GRADUATION_DRAIN_CONFIG,
  type GraduationCandidate,
  type GraduationDrainContext,
} from "./graduation-drain.js";

// The gate runs today, on a named branch, against a park ledger that is present and parseable. The
// existing cases all use UNSTAMPED candidates, so every one of them exercises the ADR-0301 charged
// default: with no `metadata.branch` anywhere, `chargedCount === liveCount` and the pre-ADR-0301
// behaviour must be reproduced exactly. That is deliberate rather than incidental — the stamp only
// exists going forward, so an unstamped queue is what every real machine had on the day it landed.
// `inFlightBranches` is EMPTY here on purpose (ADR-0371): an empty set disables the in-flight
// exclusion entirely, so every pre-existing case below keeps its exact pre-ADR-0371 semantics and
// still proves what it always proved. The in-flight cases opt in explicitly.
const CTX: GraduationDrainContext = {
  currentBranch: "claude/some-session",
  inFlightBranches: new Set(),
  currentDate: "2026-07-27",
  ledgerUsable: true,
};
const N = DEFAULT_GRADUATION_DRAIN_CONFIG.liveCeiling; // 4
const M = DEFAULT_GRADUATION_DRAIN_CONFIG.overdueCeilingDays; // 21

/** `count` brand-new candidates (no park record) — the ordinary way this queue grows. */
function fresh(count: number): GraduationCandidate[] {
  return Array.from({ length: count }, (_v, i) => ({ name: `new-${i}`, status: "new" as const }));
}

/** `count` parked candidates, silenced under a holding lease. */
function parked(count: number): GraduationCandidate[] {
  return Array.from({ length: count }, (_v, i) => ({ name: `parked-${i}`, status: "parked" as const }));
}

/** One lease-expired candidate whose lease ran out `days` ago. */
function expiredFor(days: number, name = "stale"): GraduationCandidate {
  const expiry = new Date(Date.parse(CTX.currentDate) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { name, status: "expired", leaseExpiredOn: expiry };
}

test("gd-empty-is-ok: nothing live and nothing parked is OK, with no breach", () => {
  const v = evaluateGraduationDrain([], CTX);
  assert.equal(v.level, "ok");
  assert.equal(v.total, 0);
  assert.equal(v.liveCount, 0);
  assert.equal(v.oldestOverdueDays, null);
  assert.deepEqual(v.breaches, []);
  assert.equal(v.suppressed, undefined);
});

test("gd-parked-never-counts: a large parked backlog under lease is OK (ADR-0202 D4)", () => {
  // The authoring machine's real shape: 100 parked, nothing live.
  const v = evaluateGraduationDrain(parked(100), CTX);
  assert.equal(v.level, "ok");
  assert.equal(v.total, 100);
  assert.equal(v.parkedCount, 100);
  assert.equal(v.liveCount, 0);
  assert.deepEqual(v.breaches, []);
});

test("gd-warn-preserved: one live candidate still WARNs — the ceiling never quiets the old signal", () => {
  // Load-bearing against gaming the ceiling by softening the check beneath it: counts of 1..N kept
  // their pre-ceiling WARN level rather than gaining an OK band.
  for (const live of [1, 2, 3, N]) {
    const v = evaluateGraduationDrain([...fresh(live), ...parked(50)], CTX);
    assert.equal(v.level, "warn", `${live} live should WARN, not OK`);
    assert.deepEqual(v.breaches, []);
  }
});

test("gd-baseline-ships-green: exactly N live is WARN, not RED (breach is strictly above)", () => {
  // N was baselined at what the first real sweep found (4 live: 2 new, 2 changed, 0 expired), so the
  // ceiling shipped green on an honest baseline.
  const v = evaluateGraduationDrain(
    [...fresh(2), { name: "c1", status: "changed" }, { name: "c2", status: "changed" }],
    CTX,
  );
  assert.equal(v.liveCount, N);
  assert.equal(v.newCount, 2);
  assert.equal(v.changedCount, 2);
  assert.equal(v.expiredCount, 0);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-count-axis-reds: N+1 live candidates breach the count ceiling", () => {
  const v = evaluateGraduationDrain(fresh(N + 1), CTX);
  assert.equal(v.level, "red");
  assert.equal(v.liveCount, N + 1);
  assert.equal(v.breaches.length, 1);
  assert.match(v.breaches[0] ?? "", /live candidate backlog 5 exceeds the ceiling \(N=4\)/);
  assert.equal(v.suppressed, undefined);
});

test("gd-count-axis-catches-the-rot: the 31→58 growth ADR-0168 cites reds the gate", () => {
  // The measured failure this ceiling exists for: `check:graduation-worklist` grew 31→58 in one
  // session and drained nothing, and every one of those counts exited 0.
  for (const live of [31, 58]) {
    const v = evaluateGraduationDrain(fresh(live), CTX);
    assert.equal(v.level, "red", `${live} live must red`);
    assert.equal(v.liveCount, live);
  }
});

test("gd-staleness-axis-reds: a SMALL queue with a long-overdue lease reds on age alone", () => {
  // The hole a count-only ceiling cannot see: 2 live is far under N, but one lease expired long ago.
  const v = evaluateGraduationDrain([expiredFor(M + 1), { name: "n1", status: "new" }], CTX);
  assert.equal(v.liveCount, 2);
  assert.ok(v.liveCount <= N, "the count axis must be satisfied, so only age can be redding");
  assert.equal(v.level, "red");
  assert.equal(v.oldestOverdueDays, M + 1);
  assert.equal(v.oldestOverdueName, "stale");
  assert.equal(v.breaches.length, 1);
  assert.match(v.breaches[0] ?? "", /past the ceiling \(M=21d\)/);
});

test("gd-axes-never-summed: at N live AND exactly M overdue, neither breaches — so neither does the pair", () => {
  // The friction shape (ADR-0168 D4): two INDEPENDENT thresholds, each redding on its own. Sitting at
  // both boundaries must stay WARN — a summed or averaged rule would red here.
  const v = evaluateGraduationDrain([expiredFor(M), ...fresh(N - 1)], CTX);
  assert.equal(v.liveCount, N);
  assert.equal(v.oldestOverdueDays, M);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-both-axes-report-independently: a breach on each yields two distinct breaches", () => {
  const v = evaluateGraduationDrain([expiredFor(M + 5), ...fresh(N)], CTX);
  assert.equal(v.level, "red");
  assert.equal(v.breaches.length, 2);
  assert.ok(v.breaches.some((b) => /exceeds the ceiling \(N=/.test(b)));
  assert.ok(v.breaches.some((b) => /past the ceiling \(M=/.test(b)));
});

test("gd-oldest-overdue-wins: the most overdue expired candidate is the one named", () => {
  const v = evaluateGraduationDrain([expiredFor(3, "recent"), expiredFor(40, "ancient"), expiredFor(12, "mid")], CTX);
  assert.equal(v.oldestOverdueDays, 40);
  assert.equal(v.oldestOverdueName, "ancient");
});

// ---------------------------------------------------------------------------
// False-positive guards — what the ceiling must NOT fire on
// ---------------------------------------------------------------------------

test("gd-guard-unusable-ledger-never-reds: an absent/corrupt ledger reports the breach, never enforces it", () => {
  // MEASURED, not hypothetical. The park ledger is the only thing distinguishing a reviewed candidate
  // from an un-reviewed one, so an unreadable ledger reclassifies every memory `new`: on the authoring
  // machine 4 live becomes 104. Fail-closed on the QUEUE, fail-open on the SUBSTRATE.
  const flooded = fresh(104);
  const usable = evaluateGraduationDrain(flooded, { ...CTX, ledgerUsable: true });
  const unusable = evaluateGraduationDrain(flooded, { ...CTX, ledgerUsable: false });

  // The differential control: identical worklists, and ONLY the ledger's usability differs.
  assert.equal(usable.level, "red");
  assert.equal(unusable.level, "warn");
  assert.equal(unusable.liveCount, 104);
  // Reported, never dropped (ADR-0095: no silent caps).
  assert.deepEqual(unusable.breaches, usable.breaches);
  assert.match(unusable.suppressed ?? "", /substrate, not the queue/);
});

test("gd-guard-no-phantom-suppression: an unusable ledger under the ceiling reports nothing suppressed", () => {
  const v = evaluateGraduationDrain(fresh(2), { ...CTX, ledgerUsable: false });
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
  assert.equal(v.suppressed, undefined);
});

test("gd-guard-expired-without-a-date: counts toward N only, and never invents an age", () => {
  // An `expired` candidate whose expiry date could not be derived must under-report staleness rather
  // than fabricate a number.
  const v = evaluateGraduationDrain([{ name: "dateless", status: "expired" }, ...fresh(2)], CTX);
  assert.equal(v.expiredCount, 1);
  assert.equal(v.liveCount, 3);
  assert.equal(v.oldestOverdueDays, null);
  assert.equal(v.oldestOverdueName, null);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-guard-unparseable-date-is-not-a-breach: a malformed expiry contributes no age", () => {
  const v = evaluateGraduationDrain([{ name: "bad", status: "expired", leaseExpiredOn: "not-a-date" }], CTX);
  assert.equal(v.oldestOverdueDays, null);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-guard-future-expiry-is-clamped: a lease expiring tomorrow is 0d overdue, never negative", () => {
  const v = evaluateGraduationDrain([expiredFor(-5, "future")], CTX);
  assert.equal(v.oldestOverdueDays, 0);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-guard-parked-do-not-dilute: parked candidates neither breach nor mask a real breach", () => {
  // 1000 parked alongside a genuine count breach must still red — the ceiling reads `live`, not total.
  const v = evaluateGraduationDrain([...parked(1000), ...fresh(N + 1)], CTX);
  assert.equal(v.total, 1000 + N + 1);
  assert.equal(v.parkedCount, 1000);
  assert.equal(v.level, "red");
});

test("gd-config-is-injectable: a tightened ceiling reds a queue the default admits", () => {
  const queue = fresh(N);
  assert.equal(evaluateGraduationDrain(queue, CTX).level, "warn");
  const tightened = evaluateGraduationDrain(queue, CTX, {
    liveCeiling: N - 1,
    overdueCeilingDays: M,
  });
  assert.equal(tightened.level, "red");
});

// ---------------------------------------------------------------------------
// ADR-0301 — the own-homework exclusion, in `friction-drain.ts`'s direction
// ---------------------------------------------------------------------------

/** `count` brand-new candidates stamped with a writing branch. */
function freshFrom(branch: string, count: number, prefix = "m"): GraduationCandidate[] {
  return Array.from({ length: count }, (_v, i) => ({
    name: `${prefix}-${branch}-${i}`,
    status: "new" as const,
    branch,
  }));
}

test("gd-own-not-charged: a session's OWN just-written memories cannot trip its own ceiling", () => {
  // ADR-0168 D4's property, finally reachable here: "a retro that files its cap-3 can never trip its
  // own ceiling". N+3 live, ALL this session's, so the charged backlog is 0.
  const v = evaluateGraduationDrain(freshFrom(CTX.currentBranch ?? "", N + 3), CTX);
  assert.equal(v.liveCount, N + 3, "the WARN line still counts them — nothing goes quiet");
  assert.equal(v.ownCount, N + 3);
  assert.equal(v.chargedCount, 0);
  assert.equal(v.level, "warn");
  assert.deepEqual(v.breaches, []);
});

test("gd-sibling-charged: another session's memories ARE charged — the drain is a librarian pass", () => {
  // The direction that separates this from `check:corpus-content` (ADR-0290), where a sibling's drift
  // is never charged. Draining this queue commits nothing under your name, so a sibling's memory is a
  // legitimate obligation; excusing it would make the ceiling unreachable on a machine-shared queue.
  const v = evaluateGraduationDrain(freshFrom("claude/someone-else", N + 1), CTX);
  assert.equal(v.siblingCount, N + 1);
  assert.equal(v.ownCount, 0);
  assert.equal(v.chargedCount, N + 1);
  assert.equal(v.level, "red");
});

test("gd-unstamped-charged: an UNATTRIBUTED memory is charged, never excused as `not yours`", () => {
  // The `friction-drain.ts` `isOwnItem` direction exactly. If absence excused, the whole backlog would
  // drain by going anonymous — and on the day this landed EVERY memory on the machine was unstamped.
  const v = evaluateGraduationDrain(fresh(N + 1), CTX);
  assert.equal(v.unattributedCount, N + 1);
  assert.equal(v.chargedCount, N + 1);
  assert.equal(v.level, "red");
});

test("gd-pre-adr0301-parity: an unstamped queue behaves EXACTLY as it did before the exclusion", () => {
  // The migration guarantee. `chargedCount === liveCount` for every unstamped queue, so nothing about
  // the ceiling's reach changed on landing day.
  for (const n of [0, 1, N, N + 1, N + 20]) {
    const v = evaluateGraduationDrain(fresh(n), CTX);
    assert.equal(v.chargedCount, v.liveCount, `n=${n}`);
    assert.equal(v.level, n > N ? "red" : n > 0 ? "warn" : "ok", `n=${n}`);
  }
});

test("gd-mixed: own memories are subtracted, and the REMAINDER still reds on its own", () => {
  const v = evaluateGraduationDrain(
    [...freshFrom(CTX.currentBranch ?? "", 10, "mine"), ...freshFrom("claude/other", N + 1, "theirs")],
    CTX,
  );
  assert.equal(v.ownCount, 10);
  assert.equal(v.siblingCount, N + 1);
  assert.equal(v.liveCount, 10 + N + 1);
  assert.equal(v.chargedCount, N + 1);
  assert.equal(v.level, "red");
  assert.match(v.breaches[0] ?? "", /10 of 15 live excluded as this session's own/);
});

test("gd-detached-head-charges-everything: with no branch, NOTHING is excluded", () => {
  // Fail-closed on an unmeasurable session identity: a stamped queue that would otherwise be excluded
  // is charged in full rather than excused.
  const queue = freshFrom("claude/mine", N + 1);
  assert.equal(evaluateGraduationDrain(queue, { ...CTX, currentBranch: null }).chargedCount, N + 1);
  assert.equal(evaluateGraduationDrain(queue, { ...CTX, currentBranch: null }).level, "red");
});

test("gd-own-expired-not-stale: the staleness axis skips your own, and still fires on a sibling's", () => {
  // The two axes must agree about whose backlog they measure, or the exclusion would leak: an own
  // candidate excluded from the COUNT could still red the gate through the AGE axis.
  const mine = { ...expiredFor(M + 30, "mine-stale"), branch: CTX.currentBranch ?? "" };
  assert.equal(evaluateGraduationDrain([mine], CTX).level, "warn");
  assert.equal(evaluateGraduationDrain([mine], CTX).oldestOverdueDays, null);

  const theirs = { ...expiredFor(M + 30, "their-stale"), branch: "claude/other" };
  const v = evaluateGraduationDrain([theirs], CTX);
  assert.equal(v.level, "red");
  assert.equal(v.oldestOverdueName, "their-stale");
});

test("gd-substrate-guard-survives: an unusable ledger still SUPPRESSES a charged breach", () => {
  // Constraint (c), carried verbatim from the parked entry: an absent/unreadable ledger reclassifies
  // every memory `new` (measured: 4 live becomes 104), so it must suppress rather than red — and the
  // authorship exclusion must not have quietly become a second path to enforcement.
  const v = evaluateGraduationDrain(freshFrom("claude/other", N + 1), { ...CTX, ledgerUsable: false });
  assert.notEqual(v.level, "red");
  assert.ok(v.breaches.length > 0, "the breach is still COMPUTED");
  assert.match(v.suppressed ?? "", /park ledger is absent or unreadable/);
});

// ---------------------------------------------------------------------------
// ADR-0371 — the IN-FLIGHT exclusion: "mine" generalised to "still being written"
// ---------------------------------------------------------------------------

test("gd-inflight-reproduces-pr1124: a verified drain is no longer undone by sibling sessions mid-flight", () => {
  // THE MEASURED FAILURE THIS INCREMENT EXISTS FOR, as a differential control. In PR #1124 a
  // librarian drained this queue, VERIFIED `OK — no live agent-memory candidates`, and was RED again
  // at 7 live within ~15 minutes — all 7 written by SIBLING sessions between 20:56 and 21:11, none
  // belonging to the drainer, with nothing the drainer could have done differently.
  //
  // The two arms differ in ONE input: whether those 7 authoring branches have merged yet.
  const siblings = ["claude/s1", "claude/s2", "claude/s3", "claude/s4", "claude/s5", "claude/s6", "claude/s7"];
  const queue: GraduationCandidate[] = siblings.map((branch, i) => ({
    name: `sibling-memory-${i}`,
    status: "new",
    branch,
  }));

  // ARM A — the #1124 moment: every one of those sessions is still running, nothing has merged.
  const midFlight = evaluateGraduationDrain(queue, { ...CTX, inFlightBranches: new Set(siblings) });
  assert.equal(midFlight.liveCount, 7, "the queue is still REPORTED in full — nothing goes quiet");
  assert.equal(midFlight.inFlightCount, 7);
  assert.equal(midFlight.chargedCount, 0, "none of it is this session's obligation yet");
  assert.equal(midFlight.level, "warn", "the verified drain HOLDS — this is what #1124 needed");
  assert.deepEqual(midFlight.breaches, []);

  // ARM B — the same 7 memories once their branches have landed: their knowledge is now everyone's,
  // so the backlog is real and the ceiling must fire exactly as it did before.
  const merged = evaluateGraduationDrain(queue, { ...CTX, inFlightBranches: new Set() });
  assert.equal(merged.inFlightCount, 0);
  assert.equal(merged.chargedCount, 7);
  assert.equal(merged.level, "red", "a MERGED sibling's memory is still charged — this is not an amnesty");
});

test("gd-inflight-is-a-subset-of-siblings: the ADR-0301 authorship identity still reconciles", () => {
  // `inFlightCount` is deliberately a SUBSET of `siblingCount`, not a fourth disjoint column, so the
  // printed split can never stop adding up to `liveCount`.
  const v = evaluateGraduationDrain(
    [
      ...freshFrom(CTX.currentBranch ?? "", 2, "mine"),
      ...freshFrom("claude/flying", 3, "live"),
      ...freshFrom("claude/landed", 2, "dead"),
      ...fresh(1),
    ],
    { ...CTX, inFlightBranches: new Set(["claude/flying"]) },
  );
  assert.equal(v.ownCount, 2);
  assert.equal(v.siblingCount, 5, "ALL non-own stamped candidates, in flight or not");
  assert.equal(v.inFlightCount, 3, "the in-flight subset of those 5");
  assert.equal(v.unattributedCount, 1);
  assert.equal(v.ownCount + v.siblingCount + v.unattributedCount, v.liveCount);
  assert.equal(v.chargedCount, v.liveCount - v.ownCount - v.inFlightCount);
  assert.equal(v.chargedCount, 3, "2 merged siblings + 1 unstamped");
});

test("gd-inflight-never-excuses-own-twice: the current session's branch in the set is not double-counted", () => {
  // The current branch is by definition unmerged, so it WILL be in the in-flight set on any real
  // machine. Counting it as both own and in-flight would make `chargedCount` go negative.
  const own = CTX.currentBranch ?? "";
  const v = evaluateGraduationDrain(freshFrom(own, 5), {
    ...CTX,
    inFlightBranches: new Set([own, "claude/other"]),
  });
  assert.equal(v.ownCount, 5);
  assert.equal(v.inFlightCount, 0, "own is excluded as OWN, never additionally as in-flight");
  assert.equal(v.chargedCount, 0);
  assert.ok(v.chargedCount >= 0, "the charged arithmetic can never go negative");
});

test("gd-inflight-unstamped-still-charged: liveness cannot be claimed by going anonymous", () => {
  // The `friction-drain.ts` direction, preserved: only a POSITIVE branch match excludes. An unstamped
  // memory has no branch to be in flight, so a queue that drops its stamps gets no amnesty.
  const v = evaluateGraduationDrain(fresh(N + 1), {
    ...CTX,
    inFlightBranches: new Set(["claude/whatever"]),
  });
  assert.equal(v.inFlightCount, 0);
  assert.equal(v.unattributedCount, N + 1);
  assert.equal(v.chargedCount, N + 1);
  assert.equal(v.level, "red");
});

test("gd-inflight-unknown-branch-is-charged: a branch git cannot resolve is never excused", () => {
  // A branch deleted on merge (ADR-0142) or written on another machine is simply ABSENT from the
  // in-flight set. Absent must mean CHARGED, or the exclusion would grow by losing information.
  const v = evaluateGraduationDrain(freshFrom("claude/deleted-on-merge", N + 1), {
    ...CTX,
    inFlightBranches: new Set(["claude/some-other-live-one"]),
  });
  assert.equal(v.inFlightCount, 0);
  assert.equal(v.chargedCount, N + 1);
  assert.equal(v.level, "red");
});

test("gd-inflight-expired-not-stale: the exclusion holds on the AGE axis too, and does not leak", () => {
  // The `gd-own-expired-not-stale` property, generalised. If in-flight were excused on the COUNT axis
  // only, a sibling's long-overdue lease would still red the gate through the AGE axis and the
  // exclusion would be worthless.
  const theirs = { ...expiredFor(M + 30, "their-stale"), branch: "claude/flying" };
  const flying = evaluateGraduationDrain([theirs], { ...CTX, inFlightBranches: new Set(["claude/flying"]) });
  assert.equal(flying.level, "warn");
  assert.equal(flying.oldestOverdueDays, null, "an in-flight candidate contributes no age");

  // ...and the moment that branch lands, the same candidate reds on age alone.
  const landed = evaluateGraduationDrain([theirs], { ...CTX, inFlightBranches: new Set() });
  assert.equal(landed.level, "red");
  assert.equal(landed.oldestOverdueName, "their-stale");
});

test("gd-inflight-substrate-guard-survives: an unusable ledger still SUPPRESSES, exclusion or not", () => {
  // Constraint carried forward verbatim: the in-flight exclusion must not have quietly become a
  // second path to enforcement past the substrate guard.
  const v = evaluateGraduationDrain(freshFrom("claude/landed", N + 1), {
    ...CTX,
    inFlightBranches: new Set(["claude/flying"]),
    ledgerUsable: false,
  });
  assert.notEqual(v.level, "red");
  assert.ok(v.breaches.length > 0, "the breach is still COMPUTED");
  assert.match(v.suppressed ?? "", /park ledger is absent or unreadable/);
});

test("gd-inflight-breach-names-both-exclusions: charged is reconcilable from the breach line alone", () => {
  const v = evaluateGraduationDrain(
    [
      ...freshFrom(CTX.currentBranch ?? "", 3, "mine"),
      ...freshFrom("claude/flying", 2, "live"),
      ...freshFrom("claude/landed", N + 1, "dead"),
    ],
    { ...CTX, inFlightBranches: new Set(["claude/flying"]) },
  );
  assert.equal(v.level, "red");
  assert.match(v.breaches[0] ?? "", /3 of 10 live excluded as this session's own/);
  assert.match(v.breaches[0] ?? "", /2 excluded as other sessions still in flight/);
});

test("gd-inflight-empty-set-is-exact-parity: ADR-0371 changes nothing until a set is supplied", () => {
  // The migration guarantee, mirroring `gd-pre-adr0301-parity`. An empty in-flight set must reproduce
  // the pre-ADR-0371 verdict exactly for every queue shape.
  for (const n of [0, 1, N, N + 1, N + 20]) {
    const stamped = evaluateGraduationDrain(freshFrom("claude/other", n), CTX);
    assert.equal(stamped.inFlightCount, 0, `n=${n}`);
    assert.equal(stamped.chargedCount, stamped.liveCount, `n=${n}`);
    assert.equal(stamped.level, n > N ? "red" : n > 0 ? "warn" : "ok", `n=${n}`);
  }
});

test("gd-parked-never-attributed: a parked candidate counts in no authorship column", () => {
  // Parked candidates are silenced by their lease, not by whose they are — mixing them into the
  // authorship split would make `own + sibling + unattributed` stop reconciling with `liveCount`.
  const v = evaluateGraduationDrain(
    [...parked(5).map((p) => ({ ...p, branch: "claude/other" })), ...freshFrom("claude/other", 2)],
    CTX,
  );
  assert.equal(v.parkedCount, 5);
  assert.equal(v.siblingCount, 2);
  assert.equal(v.ownCount + v.siblingCount + v.unattributedCount, v.liveCount);
});
