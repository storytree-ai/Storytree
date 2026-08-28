import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { run } from "./commands.js";

import type { DecisionDiscoveryFigure, DecisionDiscoveryReading } from "./decision-discovery.js";
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

/** The reach arm as it reads on a machine too short to slice — the everyday shape today. */
const UNSLICED_REACH_ARM = {
  windowsRequired: 401,
  windowsAvailable: 18,
  windowsKept: 0,
  observedFrom: undefined,
  observedTo: undefined,
  cohortDecisions: 414,
  cohortHighestNumber: 421,
  cohortReached: null,
} as const;

function reading(
  figures: DecisionDiscoveryFigure[],
  refusals: string[] = [],
  reachArm: DecisionDiscoveryReading["reachArm"] = UNSLICED_REACH_ARM,
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
      reachArm,
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
  arm: "decision",
  alarmed: true,
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
    arm: "context window",
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

  // `-inc-02`: a refusal a reader can WATCH rather than take on faith. The distance to the gate and
  // the population the figure is pinned to are both on the surface, not only in the docs.
  assert.match(env.body, /slice:\s+18 of the 401 context window\(s\)/);
  assert.match(env.body, /cohort:\s+the 414 lowest-numbered decision\(s\), up to ADR-0421/);
  assert.match(env.body, /decisions made AFTER the freeze are being found/);

  // The arm block belongs to REACH and to nothing else. Attached to chain depth as well it would
  // read as a property of the whole section, and the cohort would be taken as its denominator too.
  const chainBlock = env.body.slice(env.body.indexOf("chain depth"), env.body.indexOf("reach "));
  assert.doesNotMatch(chainBlock, /slice:/);
  assert.doesNotMatch(chainBlock, /cohort:/);
  // And the chain-depth figure carries NO trailing detail at all — asserting only the absence of
  // reach's two labels would pass for any other block appended under the wrong figure.
  assert.equal(
    chainBlock.split("\n").filter((line) => line.trim() !== "").length,
    3,
    "chain depth renders its status line and its two wrapped condition lines, and nothing else — " +
      "asserting only the ABSENCE of reach's two labels would pass for any other block appended here",
  );
});

test("a reach TRIPWIRE renders its slice, its cohort and the numerator behind the fall", async () => {
  // The render path for a SPEAKING reach — the one that never runs on a machine this size, and would
  // otherwise reach `main` having been executed by nothing.
  const env = await run(
    ["factory", "health", "decisions"],
    withReading(
      reading(
        [
          chainFigure("holds", 0.4),
          {
            key: "reach",
            label: "reach",
            arm: "decision",
            alarmed: true,
            comparison: {
              measure: "reach",
              before: { rate: 0.8937, low: 0.86, high: 0.92 },
              beforeCount: 370,
              beforeTotal: 414,
              after: { rate: 0.7246, low: 0.679, high: 0.766 },
              afterCount: 300,
              afterTotal: 414,
              verdict: "FALL",
              sessionsNeeded: 6,
              minimumArm: 0,
              detectableFall: 0.5,
            },
            currentRate: 0.7246,
            referenceRate: 370 / 414,
            movement: -16.9,
            status: "tripwire",
            condition: null,
          },
        ],
        [],
        {
          windowsRequired: 401,
          windowsAvailable: 540,
          windowsKept: 401,
          observedFrom: "2026-09-02T00:00:00.000Z",
          observedTo: "2026-09-21T00:00:00.000Z",
          cohortDecisions: 414,
          cohortHighestNumber: 421,
          cohortReached: 300,
        },
      ),
    ),
  );

  assert.match(env.body, /reach\s+\[TRIPWIRE\]\s+72\.5%/);
  assert.match(env.body, /-16\.9 points/);
  assert.match(env.body, /slice:\s+the trailing 401 context window\(s\), 2026-09-02/);
  assert.match(env.body, /cohort:.*up to ADR-0421, of which 300 were read/);
  assert.match(env.body, /never says what moved it/);
  // A SPEAKING figure's block is closed the same way a refusing one's is. Without the separator the
  // reach detail runs straight into the altitude figure below it, and the cohort's blindness note
  // reads as though it qualified altitude — attaching a caveat to the wrong measurement.
  const lines = env.body.split("\n");
  const cohortAt = lines.findIndex((l) => l.includes("cohort:"));
  assert.ok(cohortAt > 0);
  const nextFigure = lines.findIndex((l, i) => i > cohortAt && /^ {2}altitude\s/.test(l));
  assert.ok(nextFigure > cohortAt, "altitude follows the reach block");
  assert.equal(lines[nextFigure - 1]?.trim(), "", "and a blank line separates them");
  // ADR-0316 D1: a tripwire is a LABEL on both figures now, never an exit code.
  assert.equal(env.ok, true);
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

test("the altitude NULL and the RETIRED fourth figure are both STATED, never silently absent", async () => {
  const env = await run(["factory", "health", "decisions"], withReading(QUIET()));

  assert.match(env.body, /altitude\s+\[null\]\s+p = 0\.1322 \(editorial\) \/ 0\.9381 \(lexical\)/);
  assert.match(env.body, /null has no worse direction to/);

  // CORRECTED 2026-08-28 (`-inc-02`): the surface said `[deferred]` and promised a rejoin "once the
  // traversal work has settled". ADR-0464 D1 deleted the offer surface itself, so the figure lost its
  // SUBJECT; a surface still advertising a rejoin would send a future session to wait for a substrate
  // that was removed rather than stabilised. `[deferred]` must not come back without its subject.
  assert.match(env.body, /offer-to-follow\s+\[retired\]/);
  assert.doesNotMatch(env.body, /offer-to-follow\s+\[deferred\]/);
  assert.match(env.body, /RETIRED, not missing and no longer deferred/);
  assert.match(env.body, /CHAIN DEPTH is the surviving falsifier/);
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

test("the reach arm's every rendered branch is reachable and says something different", async () => {
  // Four branches meet here — sliced / unsliced x cohort-formed / cohort-short — plus the two
  // `(nothing)` fallbacks for a slice whose extent could not be read. Each is rendered by a real
  // reading somewhere, and an unexercised branch is one nobody knows works.
  const withArm = async (arm: DecisionDiscoveryReading["reachArm"]) =>
    (await run(["factory", "health", "decisions"], withReading(reading([chainFigure("holds", 0.4), NOT_COMPARABLE_REACH], [], arm)))).body;

  const shortCohort = await withArm({
    windowsRequired: 401,
    windowsAvailable: 3,
    windowsKept: 0,
    observedFrom: undefined,
    observedTo: undefined,
    cohortDecisions: 12,
    cohortHighestNumber: null,
    cohortReached: null,
  });
  assert.match(shortCohort, /cohort:\s+12 decision\(s\) — SHORT of the frozen cohort/);
  assert.match(shortCohort, /slice:\s+3 of the 401 context window\(s\) the trailing slice needs/);

  // A slice was FORMED but carries no readable extent — the two `(nothing)` fallbacks. They must
  // print the word rather than an empty gap, or the line reads as a range that was measured.
  const noExtent = await withArm({
    windowsRequired: 401,
    windowsAvailable: 401,
    windowsKept: 401,
    observedFrom: undefined,
    observedTo: undefined,
    cohortDecisions: 414,
    cohortHighestNumber: 421,
    cohortReached: 370,
  });
  assert.match(noExtent, /slice:\s+the trailing 401 context window\(s\), \(nothing\) -> \(nothing\)/);
  assert.match(noExtent, /up to ADR-0421, of which 370 were read/);
});

/** The section's own indent, as a literal — the render pads detail lines to align under the label. */
const DETAIL_INDENT = " ".repeat(20);

test("the reach block's EXACT shape — its indent, its separator, and a cohort line with no numerator", async () => {
  // Asserted line-for-line rather than by a tolerant `\s+` match, because every part of this block's
  // shape is load-bearing and a tolerant match cannot see any of it: an indent collapsed to zero
  // makes a wrapped explanation read as a new figure, and a lost blank separator runs two figures
  // together. Both look like a working render to a regex that only asks whether the words appear.
  const body = (await run(["factory", "health", "decisions"], withReading(QUIET()))).body;
  const lines = body.split("\n");
  const head = lines.findIndex((l) => /^ {2}reach\s+\[not comparable]/.test(l));
  assert.ok(head > 0, "the refusing reach figure is rendered");

  // The CONDITION reaches the reader. `?? ""` rather than `&& ""`: the latter renders every
  // condition as the empty string, which is a silent refusal — the word without the reason.
  assert.ok(
    lines[head + 1]?.startsWith(DETAIL_INDENT),
    "the condition is wrapped UNDER the figure, not flush against the margin",
  );
  assert.match(lines[head + 1] ?? "", /REACH is cumulative COVERAGE/);

  const slice = lines.find((l) => l.includes("slice:"));
  const cohort = lines.find((l) => l.includes("cohort:"));
  assert.equal(slice, `${DETAIL_INDENT}slice:  18 of the 401 context window(s) the trailing slice needs`);
  // NO ", of which N were read" — this arm never spoke, so there is no numerator to print. Appending
  // one anyway would print `of which null were read`, a number a reader would take for a reading.
  assert.equal(cohort, `${DETAIL_INDENT}cohort: the 414 lowest-numbered decision(s), up to ADR-0421`);

  const cohortAt = lines.indexOf(cohort ?? "");
  const after = lines.slice(cohortAt + 1);
  const blank = after.findIndex((l) => l.trim() === "");
  const explanation = after.slice(0, blank);
  assert.ok(explanation.length > 0, "the standing explanation follows the cohort line");
  assert.ok(
    explanation.every((l) => l.startsWith(DETAIL_INDENT)),
    "every explanation line is indented under the figure, so none reads as a figure of its own",
  );
  assert.notEqual(blank, -1, "the figure's block is CLOSED by a blank line before the next figure");
});

test("an UNDERPOWERED reach renders its own branch, and is not silently drawn as not-comparable", async () => {
  // The third render branch. It had no test at all: `not-comparable` and the speaking branches were
  // both covered, so the one that says "the measurement is fine and this window is too small" was
  // reaching `main` executed by nothing. The two words are not interchangeable — they have different
  // remedies, and only one of them is waited out.
  const underpowered: DecisionDiscoveryFigure = {
    ...NOT_COMPARABLE_REACH,
    status: "underpowered",
    condition: "this reading measured nothing — see the refusals above",
  };
  const body = (await run(["factory", "health", "decisions"], withReading(reading([chainFigure("underpowered", null), underpowered])))).body;
  const lines = body.split("\n");
  const head = lines.findIndex((l) => /^ {2}reach\s+\[UNDERPOWERED]/.test(l));
  assert.ok(head > 0, "reach renders as UNDERPOWERED, in its own words");
  assert.doesNotMatch(lines[head] ?? "", /not comparable/, "and never borrows the other refusal's word");
  assert.match(lines[head + 1] ?? "", /this reading measured nothing/, "carrying its own condition");
  assert.ok(lines.some((l) => l === `${DETAIL_INDENT}slice:  18 of the 401 context window(s) the trailing slice needs`),
    "an underpowered reach still shows the DISTANCE to its gate — the refusal a reader can watch");
  assert.ok(lines.slice(head).some((l) => l.trim() === ""), "its block is closed by a blank line too");
});

test("a figure that refused WITHOUT a stated condition renders no stray text in its place", async () => {
  // The `?? ""` fallback, exercised — on BOTH refusing branches, because it is written out twice and
  // a fallback proven on one branch says nothing about the other. Today every refusal carries a
  // condition, so this is a defensive arm; the failure it prevents is the ugly one, a `null`
  // reaching the wrapper and printing the word "null" indented under a figure, where it reads as
  // the reason the figure refused.
  for (const [status, mark] of [
    ["not-comparable", "\\[not comparable]"],
    ["underpowered", "\\[UNDERPOWERED]"],
  ] as const) {
    const mute: DecisionDiscoveryFigure = { ...NOT_COMPARABLE_REACH, status, condition: null };
    const body = (await run(["factory", "health", "decisions"], withReading(reading([chainFigure("underpowered", null), mute])))).body;
    const lines = body.split("\n");
    const head = lines.findIndex((l) => new RegExp(`^ {2}reach\\s+${mark}`).test(l));
    assert.ok(head > 0, `reach renders its ${status} branch`);
    const end = lines.findIndex((l, i) => i > head && l.trim() === "");
    assert.ok(!lines.slice(head, end).some((l) => l.trim() === "null"), `no stringified null on the ${status} branch`);
    assert.equal(lines[head + 1]?.includes("slice:"), true, `the arm follows immediately on the ${status} branch`);
  }
});

test("a not-comparable refusal with no condition still closes its block", async () => {
  const mute: DecisionDiscoveryFigure = { ...NOT_COMPARABLE_REACH, condition: null };
  const body = (await run(["factory", "health", "decisions"], withReading(reading([chainFigure("underpowered", null), mute])))).body;
  const lines = body.split("\n");
  const head = lines.findIndex((l) => /^ {2}reach\s+\[not comparable]/.test(l));
  assert.ok(head > 0);
  // Scoped to the reach block: `null` is a legitimate WORD elsewhere in this section — altitude is
  // rendered `[null]` and described as a null finding — so a body-wide search would be satisfied by
  // the wrong text and prove nothing about this figure.
  const blockEnd = lines.findIndex((l, i) => i > head && l.trim() === "");
  const block = lines.slice(head, blockEnd);
  assert.ok(!block.some((l) => l.trim() === "null"), "no stringified null is printed as the reason");
  assert.equal(lines[head + 1]?.includes("slice:"), true, "the arm follows immediately — no blank filler line");
});

test("the RETIRED figure's reason is wrapped and indented under it, not flush against the margin", async () => {
  // Same shape as the reach block, and the same failure: at a zero indent the retirement's several
  // wrapped lines stop reading as one figure's explanation and start reading as loose prose about
  // the section — which is exactly the reassurance a retired figure must not project.
  const body = (await run(["factory", "health", "decisions"], withReading(QUIET()))).body;
  const lines = body.split("\n");
  const head = lines.findIndex((l) => /^ {2}offer-to-follow\s+\[retired]/.test(l));
  assert.ok(head > 0, "offer-to-follow renders as retired");
  const reason = lines.slice(head + 1, lines.findIndex((l, i) => i > head && l.trim() === ""));
  assert.ok(reason.length > 1, "the reason wraps over several lines");
  assert.ok(
    reason.every((l) => l.startsWith(DETAIL_INDENT)),
    "every one of them is indented under the figure it explains",
  );
  assert.match(reason.join(" "), /RETIRED, not missing and no longer deferred/);
});
