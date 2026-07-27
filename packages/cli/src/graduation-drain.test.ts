import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateGraduationDrain,
  DEFAULT_GRADUATION_DRAIN_CONFIG,
  type GraduationCandidate,
  type GraduationDrainContext,
} from "./graduation-drain.js";

// The gate runs today, against a park ledger that is present and parseable.
const CTX: GraduationDrainContext = { currentDate: "2026-07-27", ledgerUsable: true };
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
