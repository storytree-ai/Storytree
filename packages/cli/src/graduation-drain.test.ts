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
const CTX: GraduationDrainContext = {
  currentBranch: "claude/some-session",
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
