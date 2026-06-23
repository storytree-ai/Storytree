import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyFork,
  sweepDecisions,
  blockedHaltReport,
  resolvedBriefContext,
  type DecisionFork,
} from "./decision-sweep.js";

/**
 * ADR-0098 (U4) — the pre-build batch decision-sweep, proven PURE/OFFLINE (no store, git, clock). The
 * load-bearing contract: a KEY design fork (the d.5 owner-fork bar) HALTS the drive when unresolved;
 * a ROUTINE within-pocket choice does NOT. Plus the partition, the resolved-fork brief threading, and
 * the owner-facing report formatters.
 */

/** A fork that trips none of the three d.5 signals (a routine within-pocket choice). */
function routineFork(over: Partial<DecisionFork> = {}): DecisionFork {
  return {
    id: "test-layout",
    question: "Where should the new test file live?",
    changesPublicSeam: false,
    materiallyDifferentStrategies: false,
    crossCuttingOrIrreversible: false,
    ...over,
  };
}

// ── classifyFork: the d.5 bar ────────────────────────────────────────────────

test("classifyFork escalates a fork that trips ANY single d.5 signal; routine trips none", () => {
  assert.equal(classifyFork(routineFork()), "leaf");
  assert.equal(classifyFork(routineFork({ changesPublicSeam: true })), "escalate");
  assert.equal(classifyFork(routineFork({ materiallyDifferentStrategies: true })), "escalate");
  assert.equal(classifyFork(routineFork({ crossCuttingOrIrreversible: true })), "escalate");
  // All three at once is still one escalation (no double-counting in the disposition).
  assert.equal(
    classifyFork({
      changesPublicSeam: true,
      materiallyDifferentStrategies: true,
      crossCuttingOrIrreversible: true,
    }),
    "escalate",
  );
});

// ── sweepDecisions: partition + halt gate ─────────────────────────────────────

test("an UNRESOLVED key fork blocks the sweep (the drive HALTS — never a silent guess)", () => {
  const sweep = sweepDecisions({
    gateId: "library#gate-4",
    pocket: "seed-runner",
    forks: [
      routineFork({ changesPublicSeam: true, id: "seam-shape", question: "Inject a Pool, or the Store + a loader fn?" }),
    ],
  });
  assert.equal(sweep.clear, false);
  assert.equal(sweep.blocked.length, 1);
  assert.equal(sweep.blocked[0]?.id, "seam-shape");
  assert.deepEqual(sweep.escalated.map((d) => d.id), ["seam-shape"]);
  assert.deepEqual(sweep.routine, []);
  assert.deepEqual(sweep.resolved, []);
  assert.equal(sweep.gateId, "library#gate-4");
  assert.equal(sweep.pocket, "seed-runner");
});

test("a RESOLVED key fork clears the sweep and lands in `resolved` (it threads into the brief)", () => {
  const sweep = sweepDecisions({
    gateId: "g#gate-1",
    forks: [
      routineFork({
        crossCuttingOrIrreversible: true,
        id: "comment-seam",
        question: "Grow storage-protocol with a comment seam, or keep Pg-only + a live-gated test?",
        resolution: "Keep Pg-only; prove via a live-gated createTestPool test (owner D3).",
      }),
    ],
  });
  assert.equal(sweep.clear, true);
  assert.deepEqual(sweep.blocked, []);
  assert.equal(sweep.resolved.length, 1);
  assert.equal(sweep.resolved[0]?.resolved, true);
});

test("a ROUTINE choice NEVER blocks — even unresolved the leaf owns it", () => {
  const sweep = sweepDecisions({
    gateId: "g#gate-1",
    forks: [routineFork(), routineFork({ id: "name", question: "What to name the extracted helper?" })],
  });
  assert.equal(sweep.clear, true);
  assert.deepEqual(sweep.blocked, []);
  assert.equal(sweep.routine.length, 2);
  assert.deepEqual(sweep.escalated, []);
});

test("a BLANK resolution counts as unresolved — a whitespace answer still HALTS a key fork", () => {
  const sweep = sweepDecisions({
    gateId: "g#gate-1",
    forks: [routineFork({ changesPublicSeam: true, resolution: "   " })],
  });
  assert.equal(sweep.clear, false);
  assert.equal(sweep.blocked.length, 1);
});

test("a mixed sweep partitions correctly and preserves the surfaced order", () => {
  const sweep = sweepDecisions({
    gateId: "g#gate-1",
    forks: [
      routineFork({ id: "a-routine" }),
      routineFork({ id: "b-key-open", changesPublicSeam: true }),
      routineFork({ id: "c-key-settled", materiallyDifferentStrategies: true, resolution: "strategy X" }),
      routineFork({ id: "d-routine" }),
    ],
  });
  assert.deepEqual(sweep.decisions.map((d) => d.id), ["a-routine", "b-key-open", "c-key-settled", "d-routine"]);
  assert.deepEqual(sweep.routine.map((d) => d.id), ["a-routine", "d-routine"]);
  assert.deepEqual(sweep.escalated.map((d) => d.id), ["b-key-open", "c-key-settled"]);
  assert.deepEqual(sweep.blocked.map((d) => d.id), ["b-key-open"]); // the one unresolved key fork
  assert.deepEqual(sweep.resolved.map((d) => d.id), ["c-key-settled"]);
  assert.equal(sweep.clear, false); // b-key-open is still open
});

test("the empty case is CLEAR (a drive with no surfaced forks proceeds — backward compatible)", () => {
  const sweep = sweepDecisions({ gateId: "g#gate-1", forks: [] });
  assert.equal(sweep.clear, true);
  assert.deepEqual(sweep.decisions, []);
  assert.deepEqual(sweep.blocked, []);
});

// ── report formatters ─────────────────────────────────────────────────────────

test("blockedHaltReport names each unresolved key fork and why it's the owner's call", () => {
  const sweep = sweepDecisions({
    gateId: "library#gate-4",
    pocket: "seed-runner",
    forks: [
      routineFork({ changesPublicSeam: true, id: "seam", question: "Pool or Store+loader?" }),
      routineFork({ crossCuttingOrIrreversible: true, id: "boundary", question: "Touch storage-protocol?" }),
    ],
  });
  const report = blockedHaltReport(sweep);
  assert.match(report, /HALTED library#gate-4 \(pocket: seed-runner\): 2 key design forks are unresolved/);
  assert.match(report, /escalate ownership,/);
  assert.match(report, /Pool or Store\+loader\?  \[seam\]/);
  assert.match(report, /changes a public seam\/signature other code depends on/);
  assert.match(report, /Touch storage-protocol\?  \[boundary\]/);
  assert.match(report, /is cross-cutting or irreversible/);
});

test("resolvedBriefContext threads ONLY owner-settled key forks; null when nothing is settled", () => {
  // A routine fork (even with a resolution) and an unresolved key fork are NOT threaded.
  const withoutSettled = sweepDecisions({
    gateId: "g#gate-1",
    forks: [routineFork({ resolution: "the leaf's own choice, not threaded" })],
  });
  assert.equal(resolvedBriefContext(withoutSettled), null);

  const settled = sweepDecisions({
    gateId: "g#gate-1",
    forks: [
      routineFork({ id: "noise" }), // routine — must not appear
      routineFork({ changesPublicSeam: true, id: "open-key", question: "still open?" }), // unresolved key — must not appear
      routineFork({
        materiallyDifferentStrategies: true,
        id: "settled-key",
        question: "Which extraction strategy?",
        resolution: "Extract a runSeed(deps) core.",
      }),
    ],
  });
  // open-key is unresolved → the whole sweep would HALT; but resolvedBriefContext renders the settled
  // set regardless (the driver only reaches it on a clear sweep). Assert it carries ONLY the settled key.
  const ctx = resolvedBriefContext(settled);
  assert.ok(ctx !== null);
  assert.match(ctx, /Owner-settled design decisions/);
  assert.match(ctx, /Which extraction strategy\?/);
  assert.match(ctx, /Extract a runSeed\(deps\) core\./);
  assert.doesNotMatch(ctx, /still open\?/);
  assert.doesNotMatch(ctx, /noise/);
});
