import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDecisionDiscovery,
  decisionDiscoveryRefusals,
  reportWideFloor,
  DETECTABLE_FALL,
  FROZEN_DECISIONS_IN_LOG,
  FROZEN_DECISIONS_REACHED,
  FROZEN_WINDOWS_READING_A_DECISION,
  FROZEN_WINDOWS_WALKING_A_CHAIN,
} from "./decision-discovery.js";

import type { ChainDepthReading, DecisionReadBaseline } from "./decision-read-baseline.js";

/**
 * THE FALSIFIER for the DECISION DISCOVERY reading (ADR-0444, `decision-discovery-kpi-arc-inc-01`).
 *
 * Two of these cases are the increment's own declared falsifier and the rest are the traps the
 * closing arc paid to learn. The self-calibration case is the one that matters most: fed the frozen
 * window's own numbers the reading must reproduce the reference EXACTLY and report no movement,
 * because that is the only thing proving this instrument and `probe:decision-baseline` are on one
 * series rather than being two experiments that happen to share a name.
 */

/** A chain-depth reading at window grain — only the three fields the section reads ever vary. */
function chainDepth(input: {
  identified: number;
  withAnyDecisionRead: number;
  walkingAChain: number;
}): ChainDepthReading {
  return {
    grain: "window",
    sessionsIdentified: input.identified,
    sessionsWithAnyDecisionRead: input.withAnyDecisionRead,
    sessionsWalkingAChain: input.walkingAChain,
    histogram: [],
    maxDepth: 0,
    deepestSessionId: null,
    deepestChain: [],
  };
}

/**
 * A baseline carrying only what this section reads, with everything else at a healthy default.
 *
 * The OFFER fields are all zero and stay zero — the section computes no offer figure and never
 * reads the trace store, so every real run arrives in exactly this shape. That is the whole point
 * of the `offer-free baseline is not vacuous` case below.
 */
function baselineFixture(overrides: Partial<DecisionReadBaseline> = {}): DecisionReadBaseline {
  const chain = chainDepth({ identified: 100, withAnyDecisionRead: 100, walkingAChain: 51 });
  return {
    declaredFrom: "2026-08-23T00:00:00.000Z",
    declaredTo: undefined,
    observedFrom: "2026-08-23T01:00:00.000Z",
    observedTo: "2026-08-26T09:00:00.000Z",
    decisionsInLog: 444,
    amendsEdges: 0,
    dependsOnEdges: 517,
    decisionsCarryingDependsOn: 210,
    dependsOnNonDecisionTargets: 0,
    readsObserved: 600,
    readsResolved: 600,
    readsUnresolved: 0,
    readsOntoUnknownDecisions: 0,
    readSpellings: [],
    readSurfaces: [],
    readsWithWindowId: 600,
    readsWithoutWindowId: 0,
    reachByWindow: [],
    reachBySlot: [],
    decisionsReachedByWindow: 200,
    decisionsReachedBySlot: 200,
    decisionsNeverRead: 244,
    chainDepthByWindow: chain,
    chainDepthBySlot: chain,
    poolingFactor: 1,
    vacuity: [],
    ...overrides,
  };
}

function figureOf(reading: ReturnType<typeof computeDecisionDiscovery>, key: string) {
  const figure = reading.figures.find((f) => f.key === key);
  assert.ok(figure !== undefined, `expected a ${key} figure in the reading`);
  return figure;
}

// ---------------------------------------------------------------------------
// The declared falsifier
// ---------------------------------------------------------------------------

test("fed the frozen window, the reading reproduces the reference exactly and reports no movement", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({
        identified: FROZEN_WINDOWS_READING_A_DECISION,
        withAnyDecisionRead: FROZEN_WINDOWS_READING_A_DECISION,
        walkingAChain: FROZEN_WINDOWS_WALKING_A_CHAIN,
      }),
      decisionsInLog: FROZEN_DECISIONS_IN_LOG,
      decisionsReachedByWindow: FROZEN_DECISIONS_REACHED,
    }),
  );

  const chain = figureOf(reading, "chain-depth");
  assert.equal(chain.status, "holds", "the reference held against itself must not move");
  assert.equal(chain.movement, 0);
  assert.equal(chain.currentRate, chain.referenceRate);
  assert.equal(chain.comparison?.verdict, "NO CHANGE");
  assert.deepEqual(reading.refusals, []);
});

test("a thin window names the failed condition instead of printing a number", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 8, withAnyDecisionRead: 8, walkingAChain: 1 }),
    }),
  );

  const chain = figureOf(reading, "chain-depth");
  assert.equal(chain.status, "underpowered");
  // The number is what the guard exists to withhold: 1 of 8 is a 38-point fall on its face.
  assert.equal(chain.movement, null, "an underpowered arm must not report a movement");
  assert.equal(chain.currentRate, null, "nor a rate a reader would compare to the reference");
  assert.equal(reading.powered, false);
  assert.match(chain.condition ?? "", /8 context window\(s\)/);
  assert.match(chain.condition ?? "", new RegExp(String(reading.minimumArm)));
});

// ---------------------------------------------------------------------------
// The two traps the closing arc paid to learn
// ---------------------------------------------------------------------------

test("the report-wide floor is the LEAST sensitive alarmed sizing, never the cheapest", () => {
  // Measured with this repo's own `sessionsToDetect`: a halving costs 6 observations from 89.4% and
  // 29 from 50.6%. A floor that took the cheap one would let a high-base-rate figure speak alone.
  const cheap = reportWideFloor([FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG]);
  const dear = reportWideFloor([FROZEN_WINDOWS_WALKING_A_CHAIN / FROZEN_WINDOWS_READING_A_DECISION]);
  assert.ok(cheap < dear, `expected the 89% figure to size cheaper than the 51% one (${String(cheap)} vs ${String(dear)})`);
  assert.equal(reportWideFloor([FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG, FROZEN_WINDOWS_WALKING_A_CHAIN / FROZEN_WINDOWS_READING_A_DECISION]), dear);
  assert.equal(reportWideFloor([]), 0, "no alarmed figures is a floor of zero, never a crash");
});

test("a zero-observation arm yields null, never a full-record fall differenced out of nothing", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 3, withAnyDecisionRead: 0, walkingAChain: 0 }),
    }),
  );

  const chain = figureOf(reading, "chain-depth");
  // 0/0 has a rate of 0 by convention, and 0 minus 50.6% is the `depth -1.00` fault verbatim.
  assert.equal(chain.movement, null);
  assert.equal(chain.status, "underpowered");
  assert.notEqual(chain.status, "tripwire", "nobody having looked is not a regression");
});

// ---------------------------------------------------------------------------
// The comparability gate
// ---------------------------------------------------------------------------

test("reach refuses as NOT COMPARABLE, because cumulative coverage is not a per-window rate", () => {
  // Modelled against the reference's own shape, a 20-window sample reads reach at ~11% against a
  // reference of 89.4% — a catastrophic TRIPWIRE manufactured entirely out of window length. The
  // Bernoulli power check cannot catch it, because reach's arm is the 414 decisions, not the windows.
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 20, withAnyDecisionRead: 20, walkingAChain: 10 }),
      decisionsInLog: 444,
      decisionsReachedByWindow: 50,
    }),
  );

  const reach = figureOf(reading, "reach");
  assert.equal(reach.alarmed, false, "reach must not be in the alarm while it is not comparable");
  assert.equal(reach.status, "not-comparable");
  assert.equal(reach.movement, null);
  assert.equal(reach.currentRate, null, "a rate printed beside a reference WILL be compared to it");
  assert.match(reach.condition ?? "", /cumulative COVERAGE/);
  assert.ok(reach.referenceRate > 0.89, "the reference rate is a literal and is always available");
});

test("reach stays out of the alarm this increment even when the window is comparable", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({
        identified: FROZEN_WINDOWS_READING_A_DECISION + 50,
        withAnyDecisionRead: FROZEN_WINDOWS_READING_A_DECISION + 50,
        walkingAChain: 200,
      }),
    }),
  );

  const reach = figureOf(reading, "reach");
  assert.equal(reach.alarmed, false);
  assert.ok(reach.currentRate !== null, "a comparable window earns reach a printed rate");
  assert.equal(reading.figures.filter((f) => f.alarmed).length, 1, "chain depth alone alarms today");
});

// ---------------------------------------------------------------------------
// The vacuity scoping — the case that would silently disable the whole section
// ---------------------------------------------------------------------------

// THE "AN OFFER-FREE BASELINE IS NOT VACUOUS HERE" TEST WAS DELETED HERE BY ADR-0464 D7.
//
// It pinned why `decisionDiscoveryRefusals` reimplements the non-offer vacuity checks instead of
// reusing `decisionReadBaselineVacuity`: that shared function reported `offersObserved === 0` as a
// vacuity reason, and this section never read the trace store, so reusing it wholesale would have made
// every real run here report itself as measuring nothing.
//
// The shared function no longer carries an offer-side reason, so the divergence it documented no
// longer exists and the test's own premise — a baseline that is "offer-free" as distinct from a
// normally-offer-carrying one — is unstateable: there is no baseline shape that carries offers to be
// free of. It is deleted rather than edited, because an edited version would assert only that a
// healthy baseline has no refusals, which the healthy-reading tests above already cover.
//
// `decisionDiscoveryRefusals` itself is UNCHANGED and still separate. Merging it back into the shared
// check is now possible but is a behaviour change to the factory-health surface, and belongs to
// whoever owns that reading rather than to this deletion.

test("a blind instrument refuses with each cause named separately, never one collapsed flag", () => {
  assert.deepEqual(decisionDiscoveryRefusals(baselineFixture()), []);

  const emptyLog = decisionDiscoveryRefusals(baselineFixture({ decisionsInLog: 0 }));
  assert.match(emptyLog.join(" "), /decision log read as EMPTY/);

  const noEdges = decisionDiscoveryRefusals(baselineFixture({ amendsEdges: 0, dependsOnEdges: 0 }));
  assert.match(noEdges.join(" "), /both support-edge populations/);

  // ANDed, never `amends`-alone: the migration emptied that column deliberately (ADR-0431).
  assert.deepEqual(decisionDiscoveryRefusals(baselineFixture({ amendsEdges: 0, dependsOnEdges: 517 })), []);

  const noReads = decisionDiscoveryRefusals(baselineFixture({ readsObserved: 0 }));
  assert.match(noReads.join(" "), /no decision reads were observed/);

  const noWindowIds = decisionDiscoveryRefusals(
    baselineFixture({ chainDepthByWindow: chainDepth({ identified: 0, withAnyDecisionRead: 0, walkingAChain: 0 }) }),
  );
  assert.match(noWindowIds.join(" "), /no read carried a context-window id/);
});

test("every direction is suppressed when the reading measured nothing, however large the arm", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      readsObserved: 0,
      chainDepthByWindow: chainDepth({
        identified: FROZEN_WINDOWS_READING_A_DECISION,
        withAnyDecisionRead: FROZEN_WINDOWS_READING_A_DECISION,
        walkingAChain: 20,
      }),
    }),
  );

  // The arm is large enough to resolve a halving, so power alone would have let this speak — a
  // 45-point "fall" off an instrument that observed no reads at all.
  const chain = figureOf(reading, "chain-depth");
  assert.ok(reading.refusals.length > 0);
  assert.equal(chain.movement, null);
  assert.equal(chain.status, "underpowered");
  assert.equal(reading.powered, false);
});

// ---------------------------------------------------------------------------
// Direction, once it is earned
// ---------------------------------------------------------------------------

test("the tripwire fires on a material adverse move and only on one", () => {
  const powered = (walkingAChain: number) =>
    computeDecisionDiscovery(
      baselineFixture({
        chainDepthByWindow: chainDepth({ identified: 300, withAnyDecisionRead: 300, walkingAChain }),
      }),
    );

  const fell = figureOf(powered(90), "chain-depth");
  assert.equal(fell.status, "tripwire", "30% against a 50.6% reference is outside the interval, downward");
  assert.ok((fell.movement ?? 0) < 0);

  const held = figureOf(powered(152), "chain-depth");
  assert.equal(held.status, "holds", "50.7% is the reference, not a movement");

  const rose = figureOf(powered(240), "chain-depth");
  assert.equal(rose.status, "improved", "an improvement is reported (D2) and is never an alarm");
  assert.ok((rose.movement ?? 0) > 0);
});

test("the detectable effect is a constant a caller cannot tune the floor with", () => {
  // A caller free to vary the effect could lower the floor until a figure spoke. It is a constant.
  assert.equal(DETECTABLE_FALL, 0.5);
});
