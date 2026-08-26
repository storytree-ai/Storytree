import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";

import type { DecisionDiscoveryFigure } from "./decision-discovery.js";
import type { DecisionDiscoveryOutcome } from "./decision-discovery-gather.js";

/**
 * QUESTION 4 of `storytree factory health` — the DECISION DISCOVERY section's RENDER (ADR-0444).
 *
 * The gate ordering itself is proven in `decision-discovery.test.ts`; what is at stake here is that
 * the SURFACE carries the window, the reference and the sample, that a refusing figure reaches the
 * reader as a named condition rather than a number, and that what the instrument is blind to is in
 * its own output rather than only in its docs.
 *
 * The reader is stubbed at the `deps.factory` seam — the same seam the churn walk uses, and for a
 * sharper reason: the real one sweeps this machine's host transcripts AND dials the live decision
 * log, neither of which belongs in a credential-free suite (ADR-0302 D3).
 */

function reading(
  figures: DecisionDiscoveryFigure[],
  refusals: string[] = [],
): DecisionDiscoveryOutcome {
  return {
    scannedFiles: 3990,
    unavailable: null,
    reading: {
      declaredFrom: "2026-08-23T00:00:00.000Z",
      declaredTo: undefined,
      observedFrom: "2026-08-23T04:11:02.000Z",
      observedTo: "2026-08-26T09:41:55.000Z",
      windowsReadingADecision: 18,
      readsResolved: 74,
      decisionsInLog: 447,
      figures,
      minimumArm: 29,
      powered: figures.some((f) => f.alarmed && f.movement !== null),
      refusals,
      altitudePEditorial: 0.1322,
      altitudePLexical: 0.9381,
    },
  };
}

const NOT_COMPARABLE_REACH: DecisionDiscoveryFigure = {
  key: "reach",
  label: "reach",
  alarmed: false,
  comparison: null,
  currentRate: null,
  referenceRate: 370 / 414,
  movement: null,
  status: "not-comparable",
  condition:
    "REACH is cumulative COVERAGE, not a rate: fewer context windows can only cover fewer decisions.",
};

function chainFigure(
  status: DecisionDiscoveryFigure["status"],
  movement: number | null,
): DecisionDiscoveryFigure {
  const spoke = movement !== null;
  return {
    key: "chain-depth",
    label: "chain depth",
    alarmed: true,
    comparison: spoke
      ? {
          measure: "chain depth",
          before: { rate: 0.506, low: 0.457, high: 0.555 },
          beforeCount: 203,
          beforeTotal: 401,
          after: { rate: 0.3, low: 0.25, high: 0.36 },
          afterCount: 90,
          afterTotal: 300,
          verdict: status === "tripwire" ? "FALL" : status === "improved" ? "RISE" : "NO CHANGE",
          sessionsNeeded: 29,
          minimumArm: 29,
          detectableFall: 0.5,
        }
      : null,
    currentRate: spoke ? 0.3 : null,
    referenceRate: 0.506,
    movement,
    status,
    condition: spoke
      ? null
      : "this window carries 18 context window(s); 29 are needed to resolve a 50% relative fall from the reference",
  };
}

function withReading(outcome: DecisionDiscoveryOutcome) {
  return {
    store: new InMemoryStore(),
    factory: { decisionDiscovery: async () => outcome },
  };
}

const QUIET = () => reading([chainFigure("underpowered", null), NOT_COMPARABLE_REACH]);

test("the decision-discovery section carries its window, its reference, its sample and what it is BLIND to", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.equal(env.ok, true);
  assert.match(env.body, /CAN A SESSION STILL FIND THE DECISIONS IT NEEDS\?/);
  assert.match(env.body, /reference: FROZEN 2026-08-23 — 401 context window\(s\)/);
  assert.match(
    env.body,
    /sample:\s+18 context window\(s\) that read a decision, 74 read\(s\), 447 decision\(s\)/,
  );
  assert.match(
    env.body,
    /3990 transcript file\(s\) swept — this reading is a property of ONE machine's history/,
  );
  // The over-reading guard is part of the OUTPUT, not just the docs (ADR-0444's Consequences).
  assert.match(env.body, /blind to: comprehension, correctness, cost/);
  // Matched within one rendered line — `wrap()` breaks at 96 columns, so a longer fragment
  // would assert against the wrapper rather than against the sentence.
  assert.match(env.body, /"this did not get worse"/);
});

test("an underpowered figure prints the failed condition and NO number a reader could compare", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.match(env.body, /chain depth\s+\[UNDERPOWERED\]\s+ref 50\.6%/);
  assert.match(env.body, /29 are needed to resolve a 50% relative fall/);
  // The whole point: no current rate is rendered, because a number beside a reference gets compared
  // to it whatever caveat follows on the next line.
  assert.doesNotMatch(env.body, /\[UNDERPOWERED\]\s+\d/);
});

test("reach is reported as NOT COMPARABLE rather than silently dropped or falsely alarmed", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.match(env.body, /reach\s+\[not comparable\]\s+ref 89\.4%/);
  assert.match(env.body, /cumulative COVERAGE, not a rate/);
  assert.doesNotMatch(env.body, /\[not comparable\]\s+\d/);
});

test("a material adverse move renders a TRIPWIRE that refuses to say what moved it", async () => {
  const env = await run(
    ["factory", "health", "decisions"],
    withReading(reading([chainFigure("tripwire", -20.6), NOT_COMPARABLE_REACH])),
  );

  assert.match(env.body, /chain depth\s+\[TRIPWIRE\]\s+30\.0%/);
  assert.match(env.body, /-20\.6 points/);
  assert.match(env.body, /never says what moved it/);
  // ADR-0316 D1: a tripwire is a LABEL. It must never become an exit code.
  assert.equal(env.ok, true);
});

test("an improvement is reported and is never an alarm", async () => {
  const env = await run(
    ["factory", "health", "decisions"],
    withReading(reading([chainFigure("improved", 8.4), NOT_COMPARABLE_REACH])),
  );

  assert.match(env.body, /chain depth\s+\[improved\]/);
  assert.match(env.body, /\+8\.4 points/);
  assert.doesNotMatch(env.body, /TRIPWIRE/);
});

test("the altitude NULL and the deferred fourth figure are both STATED, never silently absent", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.match(env.body, /altitude\s+\[null\]\s+p = 0\.1322 \(editorial\) \/ 0\.9381 \(lexical\)/);
  assert.match(env.body, /null has no worse direction to/);
  assert.match(env.body, /offer-to-follow\s+\[deferred\]/);
  assert.match(env.body, /deferred, not missing/);
});

test("a reading that MEASURED NOTHING names each cause and suppresses every direction", async () => {
  const env = await run(
    ["factory", "health", "decisions"],
    withReading(
      reading(
        [chainFigure("underpowered", null), NOT_COMPARABLE_REACH],
        ["no decision reads were observed in this window"],
      ),
    ),
  );

  assert.match(env.body, /REFUSED — this reading measured nothing:/);
  assert.match(env.body, /no decision reads were observed in this window/);
});

test("a reading that could not be TAKEN refuses with its reason and prints no table of zeros", async () => {
  const env = await run(
    ["factory", "health", "decisions"],
    withReading({
      reading: null,
      unavailable: "the decision log could not be READ at all (bring the DB up: pnpm db:up)",
      scannedFiles: 0,
    }),
  );

  assert.equal(env.ok, true, "an unavailable reading is reported, never an error exit (ADR-0316 D1)");
  assert.match(env.body, /REFUSED: the decision log could not be READ at all/);
  assert.doesNotMatch(env.body, /chain depth/);
});

test("asking for question 4 alone does not run the other three", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.doesNotMatch(env.body, /IS RECURRENCE BEING EXTINGUISHED/);
  assert.doesNotMatch(env.body, /HOW MANY DISTINCT BOTTLENECKS ARE LIVE/);
  assert.doesNotMatch(env.body, /IS COUPLING CHURN FALLING/);
});
