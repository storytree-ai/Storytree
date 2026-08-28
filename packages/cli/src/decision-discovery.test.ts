import { test } from "node:test";
import assert from "node:assert/strict";

import { wilsonInterval } from "./amends-reach.js";
import {
  composeDecisionDiscoveryReading,
  computeDecisionDiscovery,
  decisionDiscoveryRefusals,
  ALTITUDE_IS_A_NULL,
  BLINDNESS,
  OFFER_TO_FOLLOW_RETIRED,
  REACH_COHORT_BLINDNESS,
  REACH_IS_COVERAGE,
  reachCohort,
  reachComparability,
  reportWideFloor,
  DETECTABLE_FALL,
  FROZEN_DECISIONS_IN_LOG,
  FROZEN_DECISIONS_REACHED,
  FROZEN_WINDOWS_READING_A_DECISION,
  FROZEN_WINDOWS_WALKING_A_CHAIN,
} from "./decision-discovery.js";

import type { DecisionReachArm } from "./decision-discovery.js";
import type {
  ChainDepthReading,
  DecisionReadBaseline,
  DecisionReadObservation,
  DecisionSupportGraph,
} from "./decision-read-baseline.js";

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

/** Decision numbers 1..n. Dense, which the real log nearly is — 464 numbers across a range of 471. */
function denseNumbers(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1);
}

/**
 * A reach arm, defaulting to the FROZEN WINDOW ITSELF — 401 sliced windows reading 370 of the 414
 * cohort decisions. Every case below states only what it varies from the reference, so a test that
 * moves one axis cannot quietly move another.
 */
function reachArm(
  input: {
    readonly windowsKept?: number;
    readonly windowsAvailable?: number;
    readonly reachedNumbers?: readonly number[];
    readonly decisionsInLog?: number;
  } = {},
): DecisionReachArm {
  const windowsKept = input.windowsKept ?? FROZEN_WINDOWS_READING_A_DECISION;
  const reached = input.reachedNumbers ?? denseNumbers(FROZEN_DECISIONS_REACHED);
  return {
    decisionNumbers: denseNumbers(input.decisionsInLog ?? FROZEN_DECISIONS_IN_LOG),
    windowsAvailable: input.windowsAvailable ?? windowsKept,
    slice:
      windowsKept === 0
        ? null
        : baselineFixture({
            chainDepthByWindow: chainDepth({
              identified: windowsKept,
              withAnyDecisionRead: windowsKept,
              walkingAChain: 0,
            }),
            reachByWindow: reached.map((decision) => ({ decision, sessions: 1, reads: 1 })),
          }),
  };
}

/**
 * A reach arm that cannot form a slice — the shape EVERY chain-depth case below wants.
 *
 * Deliberately explicit rather than defaulted: a comparable reach arm raises the report-wide floor
 * from 29 windows to 401, so a chain-depth test that silently acquired one would go underpowered for
 * a reason its own name never mentions.
 */
function noReach(): DecisionReachArm {
  return reachArm({ windowsKept: 0, windowsAvailable: 0 });
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
    reachArm(),
  );

  const chain = figureOf(reading, "chain-depth");
  assert.equal(chain.status, "holds", "the reference held against itself must not move");
  assert.equal(chain.movement, 0);
  assert.equal(chain.currentRate, chain.referenceRate);
  assert.equal(chain.comparison?.verdict, "NO CHANGE");
  assert.deepEqual(reading.refusals, []);

  // `-inc-02`: reach's half of the same falsifier. Fed the frozen window's own numbers it must
  // reproduce 370 of 414 EXACTLY — the only thing proving this arm and `probe:decision-baseline`
  // are on one series rather than two experiments sharing a name.
  const reach = figureOf(reading, "reach");
  assert.equal(reach.alarmed, true, "reach rejoined the alarm in -inc-02");
  assert.equal(reach.status, "holds");
  assert.equal(reach.movement, 0);
  assert.equal(reach.comparison?.afterCount, FROZEN_DECISIONS_REACHED);
  assert.equal(reach.comparison?.afterTotal, FROZEN_DECISIONS_IN_LOG);
  assert.equal(reach.currentRate, reach.referenceRate);
  assert.equal(reading.reachArm.cohortReached, FROZEN_DECISIONS_REACHED);
  assert.equal(reading.reachArm.windowsKept, FROZEN_WINDOWS_READING_A_DECISION);
});

test("a thin window names the failed condition instead of printing a number", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 8, withAnyDecisionRead: 8, walkingAChain: 1 }),
    }),
    noReach(),
  );

  const chain = figureOf(reading, "chain-depth");
  assert.equal(chain.status, "underpowered");
  // The number is what the guard exists to withhold: 1 of 8 is a 38-point fall on its face.
  assert.equal(chain.movement, null, "an underpowered arm must not report a movement");
  assert.equal(chain.currentRate, null, "nor a rate a reader would compare to the reference");
  assert.equal(reading.powered, false);
  assert.match(chain.condition ?? "", /this window carries 8 context window\(s\)/);
  assert.match(chain.condition ?? "", new RegExp(`${String(reading.minimumArm)} are needed`));
  // The EFFECT SIZE the floor was derived from. Without it the sentence names a number and not the
  // question it answers, and a mis-scaled constant would read as a plausible different threshold.
  assert.match(chain.condition ?? "", /resolve a 50% relative fall from the reference/);
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
    noReach(),
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

test("a time-sliced reach would have manufactured a catastrophic fall — the gate is what stops it", () => {
  // THE CONTROL AND THE SUBJECT IN ONE RUN. `-inc-01` modelled a 20-window sample at ~11% against a
  // reference of 89.4%. Below: what that comparison WOULD have returned if it had been allowed to
  // run, and what the gate returns instead. The first assertion is the whole reason reach was pulled
  // from the alarm — the fall is real arithmetic on a real shape, and it measures nothing but window
  // length. The Bernoulli power check cannot catch it: reach's arm is the 414 decisions, not the 20.
  const wouldHaveRead = wilsonInterval(47, FROZEN_DECISIONS_IN_LOG);
  assert.ok(
    wouldHaveRead.high < FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG,
    "the un-gated 20-window comparison is a TRIPWIRE on its face — that is what is being prevented",
  );

  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 20, withAnyDecisionRead: 20, walkingAChain: 10 }),
    }),
    reachArm({ windowsKept: 0, windowsAvailable: 20, reachedNumbers: denseNumbers(47) }),
  );

  const reach = figureOf(reading, "reach");
  assert.equal(reach.status, "not-comparable", "20 windows cannot be compared against 401");
  assert.notEqual(reach.status, "tripwire");
  assert.equal(reach.movement, null);
  assert.equal(reach.currentRate, null, "a rate printed beside a reference WILL be compared to it");
  assert.equal(reading.reachArm.cohortReached, null, "nor a numerator, which is the same number twice");
  // The DISTANCE to the gate, not just the refusal: a reader can watch "20 of 401" accumulate.
  assert.match(reach.condition ?? "", /this machine's history carries 20 context window\(s\) that read/);
  assert.match(reach.condition ?? "", /a decision since the freeze; reach is read over a trailing 401,/);
  assert.match(reach.condition ?? "", /the reference's own count, and a shorter slice would report a fall it manufactured itself/);
  assert.equal(reading.reachArm.windowsAvailable, 20);
});

test("reach fires the tripwire when coverage really falls, and holds when it does not", () => {
  const at = (reached: number) =>
    figureOf(
      computeDecisionDiscovery(
        baselineFixture({
          chainDepthByWindow: chainDepth({
            identified: FROZEN_WINDOWS_READING_A_DECISION,
            withAnyDecisionRead: FROZEN_WINDOWS_READING_A_DECISION,
            walkingAChain: FROZEN_WINDOWS_WALKING_A_CHAIN,
          }),
        }),
        reachArm({ reachedNumbers: denseNumbers(reached) }),
      ),
      "reach",
    );

  // DRIVEN ACROSS THE THRESHOLD IN ONE RUN, with the reference itself as the control. An alarm that
  // is never shown firing is an alarm nobody has evidence can fire.
  const held = at(FROZEN_DECISIONS_REACHED);
  assert.equal(held.status, "holds");

  const fell = at(300);
  assert.equal(fell.status, "tripwire", "72.5% against an 89.4% reference is outside the interval, downward");
  assert.ok((fell.movement ?? 0) < 0);
  assert.equal(fell.comparison?.verdict, "FALL");
  assert.equal(fell.key, "reach", "a SPEAKING figure names itself too, and by the same key as a refusing one");
  assert.equal(fell.label, "reach");
  assert.equal(fell.arm, "decision", "the arm is a property of the measure, not of whether it spoke");

  const rose = at(405);
  assert.equal(rose.status, "improved", "an improvement is reported (D2) and is never an alarm");
  assert.ok((rose.movement ?? 0) > 0);
});

test("a GROWING decision log cannot manufacture a reach fall — the denominator is pinned", () => {
  // THE FAULT FOUND WHILE BUILDING `-inc-02`, and it is not in the increment's body. The log grew
  // 414 -> 464 between the freeze and 2026-08-28. Read against a LIVE denominator, the same 370
  // decisions being found reads 79.7%, which is outside the reference's own interval — a TRIPWIRE
  // manufactured by DECIDING MORE THINGS, and it would have fired on the day this slice landed.
  const unpinned = wilsonInterval(FROZEN_DECISIONS_REACHED, 464);
  assert.ok(
    unpinned.high < FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG,
    "the live-denominator comparison is a TRIPWIRE on its face — that is what the cohort prevents",
  );

  const reading = computeDecisionDiscovery(
    baselineFixture({ decisionsInLog: 464 }),
    reachArm({ decisionsInLog: 464, reachedNumbers: denseNumbers(FROZEN_DECISIONS_REACHED) }),
  );

  const reach = figureOf(reading, "reach");
  assert.equal(reach.status, "holds", "the same 370 decisions found is not a regression");
  assert.equal(reach.comparison?.afterTotal, FROZEN_DECISIONS_IN_LOG, "the arm is the cohort, never the live log");
  assert.equal(reading.reachArm.cohortDecisions, FROZEN_DECISIONS_IN_LOG);
  assert.equal(reading.reachArm.cohortHighestNumber, FROZEN_DECISIONS_IN_LOG, "1..414 dense, so the cohort ends at 414");
});

test("decisions decided AFTER the freeze are outside the cohort and cannot flatter reach either", () => {
  // The pin cuts both ways, and the flattering direction is the one nobody would report. A window
  // that read 370 of the OLD decisions and every one of the 50 new ones must still read 89.4%.
  const withNewOnes = computeDecisionDiscovery(
    baselineFixture({ decisionsInLog: 464 }),
    reachArm({
      decisionsInLog: 464,
      reachedNumbers: [...denseNumbers(FROZEN_DECISIONS_REACHED), ...Array.from({ length: 50 }, (_, i) => 415 + i)],
    }),
  );
  const reach = figureOf(withNewOnes, "reach");
  assert.equal(reach.comparison?.afterCount, FROZEN_DECISIONS_REACHED, "reads outside the cohort are not counted");
  assert.equal(reach.status, "holds");
});

test("a REFUSING reach figure is still an ALARMED figure, with no rate and its reference intact", () => {
  // Every field of the refusing branch, because a refusal is the shape this figure takes on every
  // machine today: if `alarmed` silently flipped, reach would leave the alarm without anyone reading
  // a different word on the surface.
  const reach = figureOf(
    computeDecisionDiscovery(baselineFixture(), reachArm({ windowsKept: 0, windowsAvailable: 7 })),
    "reach",
  );
  assert.equal(reach.alarmed, true, "reach is IN the alarm even when this window cannot feed it");
  assert.equal(reach.key, "reach", "a refusing figure still names itself — the render keys its detail block off this");
  assert.equal(reach.label, "reach", "and still carries the label the render prints beside the refusal");
  assert.equal(reach.arm, "decision", "its arm counts decisions, which is why it is handed no window floor");
  assert.equal(reach.comparison, null, "a comparison that does not mean the same thing on both sides is not one");
  assert.equal(reach.currentRate, null);
  assert.equal(reach.movement, null);
  assert.equal(
    reach.referenceRate,
    FROZEN_DECISIONS_REACHED / FROZEN_DECISIONS_IN_LOG,
    "the reference is a literal and is available whether or not the figure spoke",
  );
});

test("a comparable reach over a reading that MEASURED NOTHING is underpowered, not incomparable", () => {
  // The two refusing states are never interchangeable: `not-comparable` means the measurement does
  // not mean the same thing here, `underpowered` means it does and this reading is blind. They have
  // different remedies, and this is the branch where a comparable slice meets a blind instrument.
  const reading = computeDecisionDiscovery(
    baselineFixture({ readsObserved: 0 }),
    reachArm(),
  );
  const reach = figureOf(reading, "reach");
  assert.ok(reading.refusals.length > 0);
  assert.equal(reach.status, "underpowered", "the slice was fine; the reading was not");
  assert.notEqual(reach.status, "not-comparable");
  assert.match(reach.condition ?? "", /this reading measured nothing — see the refusals above/);
  // And the floor that BOUND here is reach's 401-window requirement, not chain depth's own sizing of
  // 29 — the two differ, which is the only state that can tell a maximum from a minimum.
  assert.equal(reading.minimumArm, FROZEN_WINDOWS_READING_A_DECISION);
  assert.match(figureOf(reading, "chain-depth").condition ?? "", /401 are needed/);
  assert.equal(reach.movement, null);
  assert.equal(reading.reachArm.cohortReached, null);
});

test("when BOTH refusals apply at once, reach reports NOT-COMPARABLE and never underpowered", () => {
  // The precedence case, and the reason the status is an `&&` rather than an `||`. When a reading
  // measured nothing AND the slice could not be formed, the two diagnoses are not equal in rank:
  // "this window is too small" invites someone to wait for more windows, while "this measurement
  // does not mean the same thing here" says waiting is not the remedy. Naming the recoverable one
  // first would send a reader to accumulate windows that could never make the figure comparable.
  const reading = computeDecisionDiscovery(
    baselineFixture({ readsObserved: 0 }),
    reachArm({ windowsKept: 0, windowsAvailable: 7 }),
  );
  const reach = figureOf(reading, "reach");
  assert.ok(reading.refusals.length > 0, "the reading did measure nothing");
  assert.equal(reach.status, "not-comparable", "incomparability outranks a thin window");
  assert.match(reach.condition ?? "", /7 context window\(s\)/, "and the condition is the COMPARABILITY one");
  assert.doesNotMatch(reach.condition ?? "", /measured nothing/);
});

test("a log too short to form the cohort refuses, naming the cohort rather than the window", () => {
  const reading = computeDecisionDiscovery(
    baselineFixture({ decisionsInLog: 100 }),
    reachArm({ decisionsInLog: 100, reachedNumbers: denseNumbers(90) }),
  );
  const reach = figureOf(reading, "reach");
  assert.equal(reach.status, "not-comparable");
  assert.match(reach.condition ?? "", /the decision log holds 100 decision\(s\)/);
  assert.match(reach.condition ?? "", /the frozen cohort needs 414/);
  assert.match(reach.condition ?? "", /the population the reference measured cannot be formed/);
  assert.doesNotMatch(reach.condition ?? "", /context window/, "this refusal is about the COHORT, not the window");
  assert.equal(reading.reachArm.cohortHighestNumber, 100, "the cohort's own extent is reported even when short");
});

test("the cohort is the LOWEST-numbered decisions, and reports the population it actually took", () => {
  // Sparse by design: the real log holds 464 numbers across a range of 471, so a cohort computed as
  // "numbers at or below N" would be the wrong size. It is the lowest COUNT, and the highest number
  // in it is reported so a population that quietly moved is visible rather than assumed away.
  // SHUFFLED, deliberately. Handed an already-ascending list, the sort could be deleted and every
  // assertion below would still pass — the diff-scoped mutation rung caught exactly that.
  const sparse = denseNumbers(500).filter((n) => n % 7 !== 0);
  const shuffled = [...sparse.slice(200), ...sparse.slice(0, 200).reverse()];
  assert.notDeepEqual(shuffled, sparse, "the input must not already be in cohort order");
  const cohort = reachCohort(shuffled);
  assert.deepEqual([...cohort], [...cohort].sort((a, b) => a - b), "the cohort is returned ascending");
  assert.ok(
    (cohort[cohort.length - 1] ?? 0) < Math.max(...shuffled),
    "the cohort is the LOWEST numbers, never the first ones it was handed",
  );
  assert.equal(cohort.length, FROZEN_DECISIONS_IN_LOG);
  assert.equal(cohort[0], 1);
  assert.ok((cohort[cohort.length - 1] ?? 0) > FROZEN_DECISIONS_IN_LOG, "gaps push the cohort's top number up");
  assert.ok(cohort.every((n) => sparse.includes(n)), "every cohort member is a decision the log holds");

  // Short is SHORT — never silently a smaller cohort that would read as a full one.
  assert.equal(reachCohort(denseNumbers(10)).length, 10);
});

test("reach can never speak over a thinner window than chain depth needs", () => {
  // The invariant that lets reach be handed NO floor: its comparability gate demands 401 context
  // windows, 13.8x the 29 chain depth needs, and both count the SAME population of windows. Asserted
  // rather than argued in a comment, because it is what stops a maximum being taken across a count
  // of windows and a count of decisions.
  const chainFloor = reportWideFloor([FROZEN_WINDOWS_WALKING_A_CHAIN / FROZEN_WINDOWS_READING_A_DECISION]);
  assert.ok(FROZEN_WINDOWS_READING_A_DECISION > chainFloor);

  for (let windows = 0; windows <= FROZEN_WINDOWS_READING_A_DECISION; windows += 40) {
    const comparable =
      reachComparability({
        windowsAvailable: windows,
        windowsKept: windows === FROZEN_WINDOWS_READING_A_DECISION ? windows : 0,
        cohortDecisions: FROZEN_DECISIONS_IN_LOG,
      }) === null;
    if (comparable) assert.ok(windows >= chainFloor, "reach spoke over a window chain depth could not use");
  }

  // And end to end: when reach speaks, the report-wide floor has risen to reach's own requirement
  // and chain depth still clears it, because the slice was taken from the very windows it counts.
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({
        identified: FROZEN_WINDOWS_READING_A_DECISION,
        withAnyDecisionRead: FROZEN_WINDOWS_READING_A_DECISION,
        walkingAChain: FROZEN_WINDOWS_WALKING_A_CHAIN,
      }),
    }),
    reachArm(),
  );
  assert.equal(reading.minimumArm, FROZEN_WINDOWS_READING_A_DECISION);
  assert.equal(figureOf(reading, "chain-depth").status, "holds", "chain depth is not silenced by reach joining");
  assert.equal(reading.powered, true);
});

test("a non-comparable reach leaves chain depth alarming at its own 29-window floor", () => {
  // The other half of the same fence: reach contributes NOTHING to the floor while it refuses, so
  // admitting it to the alarm cannot quietly raise the bar chain depth has been clearing since
  // `-inc-01`. This is the regression that would silence the rail on every machine.
  const reading = computeDecisionDiscovery(
    baselineFixture({
      chainDepthByWindow: chainDepth({ identified: 40, withAnyDecisionRead: 40, walkingAChain: 8 }),
    }),
    reachArm({ windowsKept: 0, windowsAvailable: 40 }),
  );
  assert.equal(reading.minimumArm, 29);
  assert.equal(figureOf(reading, "chain-depth").status, "tripwire", "20% against 50.6% over 40 windows still speaks");
  assert.equal(figureOf(reading, "reach").status, "not-comparable");
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
    noReach(),
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
      noReach(),
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

// ---------------------------------------------------------------------------
// The COMPOSITION — the two-arm assembly every real reading goes through
// ---------------------------------------------------------------------------

/**
 * A support graph of `count` decisions with one walkable edge, so the vacuity check passes and the
 * reading is about the slice rather than about a blind instrument.
 */
function bigLog(count: number): DecisionSupportGraph {
  return {
    decisions: denseNumbers(count),
    amends: [],
    dependsOn: [{ from: 2, to: 1 }],
    decisionsCarryingDependsOn: 1,
    dependsOnNonDecisionTargets: 0,
  };
}

/** One read of `decision` by window `w`, `minute` minutes into 2026-09-01. */
function readAt(w: number, decision: number, minute: number): DecisionReadObservation {
  return {
    slotId: `slot-${String(w % 7)}`,
    windowId: `win-${String(w).padStart(5, "0")}`,
    nodeId: `adr-${String(decision).padStart(4, "0")}`,
    at: new Date(Date.UTC(2026, 8, 1, 0, minute)).toISOString(),
    surface: "host-transcript-file-read",
  };
}

test("composition: the slice takes exactly the reference's window count and reach then speaks", () => {
  // 450 post-freeze windows, each reading one decision.
  const reads = Array.from({ length: 450 }, (_, i) => readAt(i, (i % 414) + 1, i));
  const reading = composeDecisionDiscoveryReading({
    reads,
    support: bigLog(464),
    declaredFrom: "2026-08-23T00:00:00.000Z",
    declaredTo: undefined,
  });

  assert.equal(reading.reachArm.windowsAvailable, 450, "every post-freeze window is available to slice from");
  assert.equal(reading.reachArm.windowsKept, FROZEN_WINDOWS_READING_A_DECISION, "the slice takes the reference's own count");
  assert.equal(reading.reachArm.cohortDecisions, FROZEN_DECISIONS_IN_LOG);
  assert.equal(reading.reachArm.cohortHighestNumber, FROZEN_DECISIONS_IN_LOG, "1..464 dense, so the 414 lowest end at 414");
  assert.ok(reading.reachArm.cohortReached !== null, "a comparable slice earns reach a numerator");
  assert.equal(figureOf(reading, "reach").comparison?.afterTotal, FROZEN_DECISIONS_IN_LOG, "the arm is the cohort, not the 464-decision log");
  // The whole-reading arm is the FULL declared window; only reach is sliced.
  assert.equal(reading.windowsReadingADecision, 450);
  assert.equal(reading.decisionsInLog, 464);
});

test("composition: the slice can NEVER reach back past the declared window into the reference", () => {
  // THE TRAP THIS ORDERING EXISTS TO PREVENT. 300 windows sit after the freeze and 300 before it. A
  // slice free to reach further back would find 600 windows, fill its 401, and compare the reference
  // against itself — reporting "no change" for the best possible reason and the worst possible one.
  const after = Array.from({ length: 300 }, (_, i) => readAt(i, (i % 414) + 1, i));
  const before = Array.from({ length: 300 }, (_, i) => ({
    ...readAt(10_000 + i, (i % 414) + 1, i),
    at: new Date(Date.UTC(2026, 6, 1, 0, i)).toISOString(),
  }));
  const reading = composeDecisionDiscoveryReading({
    reads: [...before, ...after],
    support: bigLog(464),
    declaredFrom: "2026-08-23T00:00:00.000Z",
    declaredTo: undefined,
  });

  assert.equal(reading.reachArm.windowsAvailable, 300, "the 300 pre-freeze windows are not available to the slice");
  assert.equal(reading.reachArm.windowsKept, 0, "and it refuses rather than borrowing them to reach 401");
  assert.equal(figureOf(reading, "reach").status, "not-comparable");
  assert.equal(reading.windowsReadingADecision, 300, "the declared window excluded them from every figure");
});

test("composition: a machine too short to slice still gets its chain-depth figure", () => {
  // The everyday shape today: reach refuses for want of history, and the rail the section rests on
  // is untouched — 40 windows is above chain depth's 29-window floor.
  const reads = Array.from({ length: 40 }, (_, i) => readAt(i, (i % 414) + 1, i));
  const reading = composeDecisionDiscoveryReading({
    reads,
    support: bigLog(464),
    declaredFrom: "2026-08-23T00:00:00.000Z",
    declaredTo: undefined,
  });

  assert.equal(reading.reachArm.windowsKept, 0);
  assert.equal(figureOf(reading, "reach").status, "not-comparable");
  assert.equal(reading.minimumArm, 29, "a refusing reach contributes nothing to the floor");
  assert.notEqual(figureOf(reading, "chain-depth").status, "not-comparable", "chain depth is a rate and is always comparable");
});

test("composition: both arms are the SAME arithmetic, so the sliced one cannot drift", () => {
  // Handed exactly 401 windows, the slice keeps all of them, and the two baselines must therefore
  // agree on every window-grained figure. A second implementation would show up right here.
  const reads = Array.from({ length: FROZEN_WINDOWS_READING_A_DECISION }, (_, i) => readAt(i, (i % 414) + 1, i));
  const reading = composeDecisionDiscoveryReading({
    reads,
    support: bigLog(464),
    declaredFrom: "2026-08-23T00:00:00.000Z",
    declaredTo: undefined,
  });

  assert.equal(reading.reachArm.windowsKept, reading.windowsReadingADecision);
  assert.equal(reading.reachArm.observedFrom, reading.observedFrom);
  assert.equal(reading.reachArm.observedTo, reading.observedTo);
});

// ---------------------------------------------------------------------------
// The STATED REASONS — pinned as text, because a refusal that loses its reason is just a refusal
// ---------------------------------------------------------------------------

/**
 * These constants ARE the instrument's published explanations, and the section's whole contract is
 * that a figure which refuses says WHY. Each is assembled from several concatenated fragments, and a
 * fragment that quietly went empty would leave a sentence that still reads fluently while having
 * dropped the clause a reader needs — the failure is invisible in the output and invisible in a
 * regex that happened to match a surviving fragment. So every fragment is named here.
 *
 * This is deliberately a change-detector, and that is the point: changing this prose SHOULD require
 * saying so out loud, the same discipline the frozen reference constants are held to.
 */
test("every fragment of the section's stated reasons is present and load-bearing", () => {
  for (const [name, phrases] of [
    [
      "REACH_IS_COVERAGE",
      [
        "REACH is cumulative COVERAGE, not a rate:",
        "it is a function of HOW MANY windows looked and HOW MANY decisions there were to cover",
        "never of how long the window was",
        "trailing fixed COUNT of 401 context window(s)",
        "the reference's own",
        "against a denominator pinned to the",
        "414 lowest-numbered (oldest) decisions in the log",
        "so that neither a shorter window nor a longer decision log can manufacture a fall",
      ],
    ],
    [
      "REACH_COHORT_BLINDNESS",
      [
        "Pinning the denominator costs two things, stated rather than discovered",
        "reach says NOTHING about whether decisions made AFTER the freeze are being found",
        'it cannot tell "harder to find" apart from "deliberately consolidated away"',
        "ADR-0139's consolidation pass exists to shrink the set worth reading",
        "would show here as a fall",
      ],
    ],
    [
      "OFFER_TO_FOLLOW_RETIRED",
      [
        "OFFER-TO-FOLLOW is RETIRED, not missing and no longer deferred (ADR-0464 D7)",
        "ADR-0464 D1 deleted the citation-derived offer surface",
        "the `--from-offer` flag and the candidate-set recording",
        "there are no offers to follow and nothing to re-freeze",
        "It was NOT re-baselined first, deliberately",
        "re-freezing against a substrate in motion is the failure ADR-0444 D7 forbids",
        "CHAIN DEPTH is the surviving falsifier",
        "it reads host transcripts, never the trace store",
        // The closing clause, and the one that makes the falsifier claim FALSIFIABLE rather than
        // reassuring: it names where the evidence would appear if the deletion was wrong.
        "decisions they needed now that the offer surface is gone, it shows there",
      ],
    ],
    [
      "ALTITUDE_IS_A_NULL",
      ["ALTITUDE is not a rate", "reads do not cluster by", "under two independent classifiers", "A null has no worse direction to move in"],
    ],
    [
      "BLINDNESS",
      ["blind to: comprehension, correctness, cost", "whether the decisions being found are the", "A read is not comprehension", 'A green reading means "this did not get worse"'],
    ],
  ] as const) {
    const text = { REACH_IS_COVERAGE, REACH_COHORT_BLINDNESS, OFFER_TO_FOLLOW_RETIRED, ALTITUDE_IS_A_NULL, BLINDNESS }[name];
    for (const phrase of phrases) {
      assert.ok(text.includes(phrase), `${name} lost the clause: "${phrase}"`);
    }
  }
});
