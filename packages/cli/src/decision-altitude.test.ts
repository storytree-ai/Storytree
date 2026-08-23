import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agreementBetween,
  altitudeVacuity,
  averageRanks,
  classifyAltitudeLexically,
  clusteringVerdict,
  computeAltitudeReading,
  drawHeldOutSample,
  kruskalWallisH,
  median,
  resolveLabelSet,
  type AltitudeClass,
  type AltitudeLabel,
  type AltitudeReadingInput,
} from "./decision-altitude.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The real resolver's shape, narrowed to what `resolveLabelSet` needs. */
function resolver(id: string): { number: number } | null {
  const match = /^adr-(\d{4})$/.exec(id);
  return match === null ? null : { number: Number(match[1]) };
}

function labelMap(entries: readonly [number, AltitudeClass][]): Map<number, AltitudeClass> {
  return new Map(entries);
}

/** Twelve decisions, four per class — above the vacuity floor, so a healthy reading is available. */
function readingInput(overrides: Partial<AltitudeReadingInput> = {}): AltitudeReadingInput {
  return {
    decisionsInLog: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    labels: labelMap([
      [1, "executive"],
      [2, "executive"],
      [3, "executive"],
      [4, "executive"],
      [5, "property"],
      [6, "property"],
      [7, "property"],
      [8, "property"],
      [9, "existence"],
      [10, "existence"],
      [11, "existence"],
      [12, "existence"],
    ]),
    reach: [
      { decision: 1, sessions: 10 },
      { decision: 5, sessions: 4 },
      { decision: 9, sessions: 1 },
    ],
    sessionsInDenominator: 40,
    amends: [],
    dependsOn: [],
    seed: 7,
    iterations: 200,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Label resolution — the fence: one resolution point, nothing string-compared
// ---------------------------------------------------------------------------

test("resolveLabelSet: resolves ids to numbers through the injected resolver", () => {
  const labels: AltitudeLabel[] = [
    { id: "adr-0011", altitude: "executive" },
    { id: "adr-0139", altitude: "property" },
  ];
  const resolved = resolveLabelSet(labels, resolver);
  assert.equal(resolved.byDecision.get(11), "executive");
  assert.equal(resolved.byDecision.get(139), "property");
  assert.deepEqual(resolved.unresolved, []);
});

test("resolveLabelSet: an id no resolver knows is REPORTED, never dropped in silence", () => {
  const resolved = resolveLabelSet(
    [
      { id: "adr-0011", altitude: "executive" },
      { id: "decision-eleven", altitude: "property" },
    ],
    resolver,
  );
  assert.equal(resolved.byDecision.size, 1);
  assert.deepEqual(resolved.unresolved, ["decision-eleven"]);
});

test("resolveLabelSet: a resolver that knows nothing yields an EMPTY join and says so", () => {
  const resolved = resolveLabelSet([{ id: "adr-0011", altitude: "executive" }], () => null);
  assert.equal(resolved.byDecision.size, 0);
  assert.equal(resolved.unresolved.length, 1);
});

test("resolveLabelSet: two ids resolving to one decision are reported as duplicates", () => {
  const resolved = resolveLabelSet(
    [
      { id: "adr-0011", altitude: "executive" },
      { id: "adr-0011", altitude: "property" },
    ],
    resolver,
  );
  assert.deepEqual(resolved.duplicates, [11]);
});

// ---------------------------------------------------------------------------
// PASS B — the lexical classifier
// ---------------------------------------------------------------------------

test("classifyAltitudeLexically: vendor-and-ceremony prose classifies EXECUTIVE", () => {
  const verdict = classifyAltitudeLexically({
    title: "Adopt the Claude Agent SDK as a live runtime",
    decisionText:
      "Adopt the Claude Agent SDK as a live agent runtime, authenticated via the subscription. " +
      "The owner runs the merge ceremony; cost is billed to the subscription rather than per token.",
  });
  assert.equal(verdict.altitude, "executive");
});

test("classifyAltitudeLexically: deontic prose classifies PROPERTY", () => {
  const verdict = classifyAltitudeLexically({
    title: "A synthetic smoke verdict must never derive a green unit",
    decisionText:
      "A synthetic proof must never derive a healthy unit. The invariant is fail-closed and is " +
      "enforced: the spine refuses a green it did not observe, always, and the rule binds " +
      "regardless of which executor produced it.",
  });
  assert.equal(verdict.altitude, "property");
});

test("classifyAltitudeLexically: repo-shaped prose classifies EXISTENCE", () => {
  const verdict = classifyAltitudeLexically({
    title: "Extract the build drivers into packages/drive",
    decisionText:
      "Carve the drivers out of packages/cli/src into a new packages/drive package. The module " +
      "gains a store seam and a schema; apps/studio imports the new package.",
  });
  assert.equal(verdict.altitude, "existence");
});

test("classifyAltitudeLexically: BLIND — the same text scores the same whatever its reach", () => {
  // The blindness is structural: there is no reach parameter to pass. This asserts the consequence
  // that matters — the verdict is a pure function of the two text fields and nothing else.
  const input = { title: "Retire the notice board", decisionText: "Delete the module." };
  assert.deepEqual(classifyAltitudeLexically(input), classifyAltitudeLexically(input));
});

test("classifyAltitudeLexically: ORDER-INDEPENDENT — a shared /g/ regex's lastIndex cannot leak", () => {
  // A module-level /g/ pattern reused across calls carries `lastIndex`, so the SECOND call would
  // score differently from the first for identical text. Silent, and it would make a committed
  // second opinion depend on what was classified before it.
  const a = { title: "Extract the drivers into packages/drive", decisionText: "A new package." };
  const b = { title: "Never bypass the gate", decisionText: "The rule always binds; it refuses." };
  const aFirst = [classifyAltitudeLexically(a), classifyAltitudeLexically(b)];
  const bFirst = [classifyAltitudeLexically(b), classifyAltitudeLexically(a)];
  assert.deepEqual(aFirst[0], bFirst[1]);
  assert.deepEqual(aFirst[1], bFirst[0]);
});

test("classifyAltitudeLexically: scores are per-1000-char DENSITIES, comparable between decisions", () => {
  // The precise claim, and the loose one ("padding cannot swing the class") is FALSE: all three
  // families share one divisor, so it cancels in the argmax. What the normalisation buys is that two
  // texts of the same SIGNAL DENSITY score alike however long they are — which is the only thing
  // that makes a fixed NEAR_TIE threshold mean anything. Drop the divisor and the long text scores
  // four times the short one.
  // BOTH fixtures must clear DENSITY_WINDOW: the divisor has a `max(1, …)` floor, so a body under
  // 1000 characters is not divided at all and two short texts would compare as raw counts.
  const unit = "The rule always binds and the gate refuses. ";
  const short = classifyAltitudeLexically({ title: "", decisionText: unit.repeat(30) });
  const long = classifyAltitudeLexically({ title: "", decisionText: unit.repeat(90) });
  assert.ok(short.scores.property > 1, "the fixture must actually score, or this proves nothing");
  assert.ok(
    Math.abs(short.scores.property - long.scores.property) < 0.5,
    `densities should match: ${String(short.scores.property)} vs ${String(long.scores.property)}`,
  );
});

test("classifyAltitudeLexically: the CLASS is the argmax of the weighted hits, stated exactly", () => {
  // Guards the header's precise claim against a future reader who "fixes" the divisor into
  // something per-family and silently changes what the classifier decides.
  const verdict = classifyAltitudeLexically({
    title: "Extract the drivers into packages/drive",
    decisionText: "A new package. The module gains a schema.",
  });
  assert.equal(verdict.altitude, "existence");
  assert.ok(verdict.scores.existence > verdict.scores.property);
  assert.ok(verdict.scores.existence > verdict.scores.executive);
});

test("classifyAltitudeLexically: a near-tie is REPORTED rather than hidden behind the argmax", () => {
  const verdict = classifyAltitudeLexically({ title: "", decisionText: "" });
  assert.equal(verdict.nearTie, true);
  // Precedence tie-break: existence first, per the rubric.
  assert.equal(verdict.altitude, "existence");
});

// ---------------------------------------------------------------------------
// Ranks and the statistic
// ---------------------------------------------------------------------------

test("averageRanks: ties share the average rank", () => {
  assert.deepEqual(averageRanks([5, 1, 5, 3]), [3.5, 1, 3.5, 2]);
});

test("averageRanks: an all-ties vector ranks every element identically", () => {
  assert.deepEqual(averageRanks([2, 2, 2, 2]), [2.5, 2.5, 2.5, 2.5]);
});

test("median: even-length vectors average the middle pair", () => {
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test("kruskalWallisH: fewer than two populated groups is 0, never a number", () => {
  assert.equal(kruskalWallisH([[1, 2, 3]]), 0);
  assert.equal(kruskalWallisH([[1, 2, 3], []]), 0);
});

test("kruskalWallisH: separated groups score far above interleaved ones", () => {
  const separated = kruskalWallisH([
    [1, 2, 3, 4],
    [11, 12, 13, 14],
  ]);
  const interleaved = kruskalWallisH([
    [1, 3, 11, 13],
    [2, 4, 12, 14],
  ]);
  assert.ok(separated > interleaved, `${separated} should exceed ${interleaved}`);
});

test("kruskalWallisH: an all-identical population is 0 after the tie correction", () => {
  assert.equal(
    kruskalWallisH([
      [4, 4, 4],
      [4, 4, 4],
    ]),
    0,
  );
});

// ---------------------------------------------------------------------------
// The permutation test — it must be able to say BOTH things
// ---------------------------------------------------------------------------

test("clusteringVerdict: a PLANTED effect comes back significant", () => {
  const verdict = clusteringVerdict(
    [
      [20, 21, 22, 23, 24, 25],
      [10, 11, 12, 13, 14, 15],
      [0, 1, 2, 3, 4, 5],
    ],
    { seed: 1, iterations: 2000 },
  );
  assert.ok(verdict.pValue < 0.01, `expected a small p, got ${verdict.pValue}`);
  assert.ok(verdict.medianSpread > 0);
});

test("clusteringVerdict: an INTERLEAVED population comes back not significant", () => {
  // The positive control's mirror. Without this, a test suite that only ever plants an effect would
  // pass against a verdict function hard-wired to report significance.
  const verdict = clusteringVerdict(
    [
      [0, 3, 6, 9, 12, 15],
      [1, 4, 7, 10, 13, 16],
      [2, 5, 8, 11, 14, 17],
    ],
    { seed: 1, iterations: 2000 },
  );
  assert.ok(verdict.pValue > 0.2, `expected a large p, got ${verdict.pValue}`);
});

test("clusteringVerdict: the p-value is DETERMINISTIC for a declared seed", () => {
  const groups = [
    [5, 6, 7],
    [1, 2, 3],
    [9, 10, 11],
  ];
  const first = clusteringVerdict(groups, { seed: 42, iterations: 500 });
  const second = clusteringVerdict(groups, { seed: 42, iterations: 500 });
  assert.equal(first.pValue, second.pValue);
  assert.equal(first.statistic, second.statistic);
});

test("clusteringVerdict: the p-value can never read as exactly 0 on finite evidence", () => {
  const verdict = clusteringVerdict(
    [
      [100, 101, 102, 103, 104, 105],
      [0, 1, 2, 3, 4, 5],
    ],
    { seed: 3, iterations: 100 },
  );
  assert.ok(verdict.pValue > 0);
  assert.equal(verdict.pValue, 1 / 101);
});

// ---------------------------------------------------------------------------
// Agreement — the number the increment says is worth more than the join
// ---------------------------------------------------------------------------

test("agreementBetween: identical passes agree at rate 1 with kappa 1", () => {
  const a = labelMap([
    [1, "executive"],
    [2, "property"],
    [3, "existence"],
  ]);
  const reading = agreementBetween(a, new Map(a));
  assert.equal(reading.compared, 3);
  assert.equal(reading.rate, 1);
  assert.equal(reading.kappa, 1);
});

test("agreementBetween: kappa punishes agreement that the marginals alone would produce", () => {
  // Both passes call everything `existence`. The raw rate is a perfect 1 and means nothing; expected
  // agreement is also 1, so kappa is undefined rather than flattering — and says so with null.
  const a = labelMap([
    [1, "existence"],
    [2, "existence"],
    [3, "existence"],
  ]);
  const reading = agreementBetween(a, new Map(a));
  assert.equal(reading.rate, 1);
  assert.equal(reading.expectedByChance, 1);
  assert.equal(reading.kappa, null);
});

test("agreementBetween: total disagreement is a NEGATIVE kappa", () => {
  const a = labelMap([
    [1, "executive"],
    [2, "property"],
  ]);
  const b = labelMap([
    [1, "property"],
    [2, "executive"],
  ]);
  const reading = agreementBetween(a, b);
  assert.equal(reading.agreed, 0);
  assert.ok(reading.kappa !== null && reading.kappa < 0);
});

test("agreementBetween: only the decisions BOTH passes labelled enter the rate", () => {
  const a = labelMap([
    [1, "executive"],
    [2, "property"],
    [3, "existence"],
  ]);
  const b = labelMap([
    [1, "executive"],
    [9, "property"],
  ]);
  const reading = agreementBetween(a, b);
  assert.equal(reading.compared, 1);
  assert.equal(reading.onlyInA, 2);
  assert.equal(reading.onlyInB, 1);
  assert.equal(reading.rate, 1);
});

test("agreementBetween: the confusion matrix names WHERE the passes part", () => {
  const a = labelMap([
    [1, "executive"],
    [2, "executive"],
  ]);
  const b = labelMap([
    [1, "executive"],
    [2, "property"],
  ]);
  const cell = agreementBetween(a, b).confusion.find((c) => c.a === "executive" && c.b === "property");
  assert.equal(cell?.count, 1);
});

test("agreementBetween: nothing in common compares nothing, and reports 0 rather than a rate", () => {
  const reading = agreementBetween(labelMap([[1, "executive"]]), labelMap([[2, "property"]]));
  assert.equal(reading.compared, 0);
  assert.equal(reading.rate, 0);
  assert.equal(reading.kappa, null);
});

// ---------------------------------------------------------------------------
// THE JOIN
// ---------------------------------------------------------------------------

test("computeAltitudeReading: an UNREAD decision enters as a ZERO, not as a missing row", () => {
  // The load-bearing assertion of the whole file. Nine of the twelve decisions have no reach row. If
  // they were dropped, every class would hold ONE observation and the means would read 10 / 4 / 1 —
  // three classes compared on the subset selected by the outcome under test.
  const reading = computeAltitudeReading(readingInput());
  assert.equal(reading.clustering.observationsCompared, 12);
  const executive = reading.classCounts.find((c) => c.altitude === "executive")!;
  assert.equal(executive.decisions, 4);
  assert.equal(executive.read, 1);
  assert.equal(executive.neverRead, 3);
  // Drop the zeros and this reads 10 over one observation instead of 2.5 over four.
  assert.equal(executive.meanReach, 2.5);
  assert.equal(executive.medianReach, 0);
});

test("computeAltitudeReading: every denominator of the subject is reported", () => {
  const reading = computeAltitudeReading(
    readingInput({
      decisionsInLog: [1, 2, 3, 4, 5, 6, 7],
      labels: labelMap([
        [1, "executive"],
        [3, "property"],
        [5, "existence"],
        [999, "existence"],
      ]),
    }),
  );
  assert.equal(reading.decisionsInLog, 7);
  assert.equal(reading.decisionsClassified, 3);
  assert.equal(reading.decisionsUnclassified, 4);
  assert.equal(reading.labelsOntoUnknownDecisions, 1);
});

test("computeAltitudeReading: reach rows that join no classified decision are counted apart", () => {
  const reading = computeAltitudeReading(
    readingInput({
      labels: labelMap([[1, "executive"]]),
      reach: [
        { decision: 1, sessions: 10 },
        { decision: 5, sessions: 4 },
      ],
    }),
  );
  assert.equal(reading.reachRowsObserved, 2);
  assert.equal(reading.reachRowsJoined, 1);
  assert.equal(reading.reachRowsUnjoined, 1);
});

test("computeAltitudeReading: shares are taken over the classified log and the grand total reach", () => {
  const reading = computeAltitudeReading(readingInput());
  assert.equal(reading.totalReach, 15);
  const property = reading.classCounts.find((c) => c.altitude === "property")!;
  assert.equal(property.shareOfLog, 4 / 12);
  assert.equal(property.shareOfReach, 4 / 15);
});

// ---------------------------------------------------------------------------
// Edge crossing — the two support populations stay APART (ADR-0419 D1)
// ---------------------------------------------------------------------------

test("computeAltitudeReading: amends and dependsOn are counted APART and the union is labelled", () => {
  const reading = computeAltitudeReading(
    readingInput({
      amends: [
        { from: 1, to: 5 },
        { from: 9, to: 10 },
      ],
      dependsOn: [{ from: 2, to: 6 }],
    }),
  );
  const amends = reading.edgeCrossings.find((c) => c.population === "amends")!;
  const dependsOn = reading.edgeCrossings.find((c) => c.population === "dependsOn")!;
  const union = reading.edgeCrossings.find((c) => c.population === "union-adjacency")!;
  assert.equal(amends.edges, 2);
  assert.equal(dependsOn.edges, 1);
  assert.equal(union.edges, 3);
  // The union is reported BESIDE the pair, never instead of it: all three rows are present.
  assert.equal(reading.edgeCrossings.length, 3);
});

test("computeAltitudeReading: within-class and cross-class edges are separated", () => {
  const reading = computeAltitudeReading(
    readingInput({
      amends: [
        { from: 1, to: 2 }, // executive -> executive
        { from: 1, to: 5 }, // executive -> property
        { from: 9, to: 10 }, // existence -> existence
      ],
    }),
  );
  const amends = reading.edgeCrossings.find((c) => c.population === "amends")!;
  assert.equal(amends.joined, 3);
  assert.equal(amends.withinClass, 2);
  assert.equal(amends.crossClass, 1);
  assert.equal(amends.byPair.find((p) => p.from === "executive" && p.to === "property")?.count, 1);
});

test("computeAltitudeReading: an edge with an unclassified endpoint is UNJOINED, never within-class", () => {
  const reading = computeAltitudeReading(
    readingInput({
      labels: labelMap([[1, "executive"]]),
      amends: [{ from: 1, to: 5 }],
    }),
  );
  const amends = reading.edgeCrossings.find((c) => c.population === "amends")!;
  assert.equal(amends.joined, 0);
  assert.equal(amends.unjoined, 1);
  assert.equal(amends.withinClass, 0);
  assert.equal(amends.crossClass, 0);
});

// ---------------------------------------------------------------------------
// VACUITY — "no clustering" and "nothing was classified" must not print alike
// ---------------------------------------------------------------------------

test("altitudeVacuity: a healthy reading reports NO reasons", () => {
  assert.deepEqual(computeAltitudeReading(readingInput()).vacuity, []);
});

test("altitudeVacuity: an empty decision log is a reason", () => {
  const reading = computeAltitudeReading(readingInput({ decisionsInLog: [], labels: new Map() }));
  assert.ok(reading.vacuity.some((r) => r.includes("0 decisions")));
});

test("altitudeVacuity: labels that resolve onto nothing are a reason, not a quiet zero", () => {
  const reading = computeAltitudeReading(
    readingInput({ labels: labelMap([[999, "existence"]]), reach: [{ decision: 1, sessions: 3 }] }),
  );
  assert.ok(reading.vacuity.some((r) => r.includes("NONE carries an altitude label")));
});

test("altitudeVacuity: a collapsed taxonomy is a reason — one bucket cannot report an absence", () => {
  const decisions = Array.from({ length: 12 }, (_, i) => i + 1);
  const reading = computeAltitudeReading(
    readingInput({
      decisionsInLog: decisions,
      labels: labelMap(decisions.map((d) => [d, "existence"] as [number, AltitudeClass])),
      reach: decisions.map((d) => ({ decision: d, sessions: d })),
    }),
  );
  assert.ok(reading.vacuity.some((r) => r.includes("the taxonomy collapsed")));
});

test("altitudeVacuity: an empty reach record is a reason, never 'agents ignore the log'", () => {
  const reading = computeAltitudeReading(readingInput({ reach: [] }));
  assert.ok(reading.vacuity.some((r) => r.includes("0 reach rows")));
});

test("altitudeVacuity: reach rows that join NOTHING are a distinct reason from having none", () => {
  const reading = computeAltitudeReading(
    readingInput({ reach: [{ decision: 4242, sessions: 9 }] }),
  );
  assert.ok(reading.vacuity.some((r) => r.includes("NONE joined a classified decision")));
});

test("altitudeVacuity: an all-zero reach vector is reported rather than read as 'no clustering'", () => {
  const reading = computeAltitudeReading(readingInput({ reach: [{ decision: 1, sessions: 0 }] }));
  assert.ok(reading.vacuity.some((r) => r.includes("reach of 0")));
});

test("altitudeVacuity: too few observations to test is its own reason", () => {
  const reading = computeAltitudeReading(
    readingInput({
      decisionsInLog: [1, 2, 3],
      labels: labelMap([
        [1, "executive"],
        [2, "property"],
        [3, "existence"],
      ]),
      reach: [
        { decision: 1, sessions: 5 },
        { decision: 2, sessions: 3 },
      ],
      iterations: 100,
    }),
  );
  assert.ok(reading.vacuity.some((r) => r.includes("below the floor")));
});

test("altitudeVacuity: a real NO-CLUSTERING result carries no vacuity reason at all", () => {
  // The distinction the whole module exists for: this reading finds no effect AND measured its
  // subject, so it prints as a finding rather than as an instrument failure.
  const decisions = Array.from({ length: 30 }, (_, i) => i + 1);
  const classes: AltitudeClass[] = ["executive", "property", "existence"];
  const reading = computeAltitudeReading(
    readingInput({
      decisionsInLog: decisions,
      labels: labelMap(decisions.map((d) => [d, classes[d % 3]!] as [number, AltitudeClass])),
      reach: decisions.map((d) => ({ decision: d, sessions: (d * 7) % 11 })),
      iterations: 500,
    }),
  );
  assert.deepEqual(reading.vacuity, []);
  assert.ok(reading.clustering.pValue > 0.2, `expected no effect, got p=${reading.clustering.pValue}`);
});

// ---------------------------------------------------------------------------
// The held-out sample
// ---------------------------------------------------------------------------

test("drawHeldOutSample: the same seed and population draw the same sample", () => {
  const population = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(
    drawHeldOutSample(population, { seed: 11, size: 10 }),
    drawHeldOutSample(population, { seed: 11, size: 10 }),
  );
});

test("drawHeldOutSample: a different seed draws a different sample", () => {
  const population = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.notDeepEqual(
    drawHeldOutSample(population, { seed: 11, size: 10 }),
    drawHeldOutSample(population, { seed: 12, size: 10 }),
  );
});

test("drawHeldOutSample: input ORDER cannot change the draw", () => {
  const ascending = Array.from({ length: 60 }, (_, i) => i + 1);
  const shuffled = [...ascending].reverse();
  assert.deepEqual(
    drawHeldOutSample(ascending, { seed: 5, size: 12 }),
    drawHeldOutSample(shuffled, { seed: 5, size: 12 }),
  );
});

test("drawHeldOutSample: it draws without replacement and never over-draws", () => {
  const population = [1, 2, 3, 4, 5];
  const sample = drawHeldOutSample(population, { seed: 5, size: 99 });
  assert.equal(sample.length, 5);
  assert.equal(new Set(sample).size, 5);
});
