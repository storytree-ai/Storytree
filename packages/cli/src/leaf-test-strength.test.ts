import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  EXCLUSION_REASONS,
  aggregate,
  classifyVerdict,
  coveredScorePair,
  hasBoundHash,
  hasObservedRed,
  lookupFromResolved,
  mergeFailed,
  mergeScored,
  pct,
  reach,
  renderPopulation,
  renderReadingMarkdown,
  resolvePopulation,
  scorePair,
  selectUnits,
  splitByAuthoringShape,
  statusesFromReport,
  strykerConfigBody,
  tallyMutants,
  vitestConfigBody,
  type LeafPair,
  type MutantTally,
  type PairScore,
  type SpecLookup,
  type StoredVerdict,
} from "./leaf-test-strength.js";

// ---------------------------------------------------------------------------------------------
// Fixtures. Every count below is DISTINCT on purpose: a fixture whose buckets share a number
// cannot tell a swapped bucket from a correct one, which is the shape
// `a-balanced-fixture-makes-a-branch-swap-unkillable` records.
// ---------------------------------------------------------------------------------------------

function verdict(over: Partial<StoredVerdict> = {}): StoredVerdict {
  return {
    seq: 1,
    unitId: "alpha",
    runId: "real-abc",
    proofMode: "capability",
    outcome: "pass",
    commitSha: "deadbeef",
    at: "2026-09-05T00:00:00.000Z",
    evidenceKinds: ["observation:red", "observation:green"],
    ...over,
  };
}

function pair(unitId: string, over: Partial<LeafPair> = {}): LeafPair {
  return {
    unitId,
    testFile: `packages/x/src/${unitId}.test.ts`,
    sourceFile: `packages/x/src/${unitId}.ts`,
    suiteOracle: false,
    editsExisting: false,
    refactorForTests: false,
    ...over,
  };
}

const found = (unitId: string): SpecLookup => ({ kind: "real", pair: pair(unitId) });

// ---------------------------------------------------------------------------------------------
// Evidence predicates
// ---------------------------------------------------------------------------------------------

test("an observed red is what makes a verdict a red→green proof", () => {
  assert.equal(hasObservedRed({ evidenceKinds: ["observation:red", "observation:green"] }), true);
  assert.equal(hasObservedRed({ evidenceKinds: ["observation:green"] }), false);
  assert.equal(hasObservedRed({ evidenceKinds: ["operator-attested"] }), false);
  assert.equal(hasObservedRed({ evidenceKinds: [] }), false);
});

test("boundHash presence is keyed off a real value — absent and empty are both absent", () => {
  assert.equal(hasBoundHash({ boundHash: "fnv1:abc" }), true);
  assert.equal(hasBoundHash({ boundHash: undefined }), false);
  assert.equal(hasBoundHash({}), false);
  // An empty string is a stamp nobody made. Counting it would inflate the one figure this reading
  // exists to report honestly.
  assert.equal(hasBoundHash({ boundHash: "" }), false);
});

// ---------------------------------------------------------------------------------------------
// Per-verdict classification
// ---------------------------------------------------------------------------------------------

test("a resolving pass with an observed red is included, carrying its pair", () => {
  const r = classifyVerdict(verdict(), found);
  assert.equal(r.kind, "included");
  assert.equal(r.kind === "included" ? r.pair.unitId : "", "alpha");
});

test("each miss lands in its own named bucket, never a shared one", () => {
  const cases: readonly [SpecLookup, string][] = [
    [{ kind: "spec-missing" }, "spec-missing"],
    [{ kind: "no-proof-config" }, "no-proof-config"],
    [{ kind: "no-real-arm" }, "no-real-arm"],
  ];
  for (const [lookup, reason] of cases) {
    const r = classifyVerdict(verdict(), () => lookup);
    assert.equal(r.kind, "excluded");
    assert.equal(r.kind === "excluded" ? r.reason : "", reason);
  }
});

test("a failed verdict is excluded as not-a-pass BEFORE anything else is asked", () => {
  // The order is the assertion. This verdict would also fail the red check and would also fail
  // spec resolution, so a classifier that ran the checks in any other order would name a different
  // reason — and the reason is what the report prints.
  let lookedUp = false;
  const r = classifyVerdict(verdict({ outcome: "fail", evidenceKinds: [] }), () => {
    lookedUp = true;
    return { kind: "spec-missing" };
  });
  assert.equal(r.kind === "excluded" ? r.reason : "", "not-a-pass");
  assert.equal(lookedUp, false, "a failed verdict must not cost a spec lookup");
});

test("a green with no observed red is excluded before the spec is consulted", () => {
  let lookedUp = false;
  const r = classifyVerdict(verdict({ evidenceKinds: ["observation:green"] }), () => {
    lookedUp = true;
    return { kind: "spec-missing" };
  });
  assert.equal(r.kind === "excluded" ? r.reason : "", "no-observed-red");
  assert.equal(lookedUp, false);
});

// ---------------------------------------------------------------------------------------------
// Population resolution
// ---------------------------------------------------------------------------------------------

test("the population dedupes by unit and counts each unit's re-proofs", () => {
  const report = resolvePopulation(
    [
      verdict({ seq: 1, unitId: "alpha" }),
      verdict({ seq: 2, unitId: "alpha" }),
      verdict({ seq: 3, unitId: "alpha" }),
      verdict({ seq: 4, unitId: "beta" }),
    ],
    found,
  );
  assert.equal(report.verdictsSeen, 4);
  assert.equal(report.verdictsIncluded, 4, "every verdict is included…");
  assert.equal(report.pairs.length, 2, "…but a re-proved unit contributes ONE pair, not three");
  assert.deepEqual(report.proofsPerUnit, { alpha: 3, beta: 1 });
});

test("pairs come back ordered by unit id, whatever order the verdicts arrived in", () => {
  const report = resolvePopulation(
    [verdict({ seq: 1, unitId: "zulu" }), verdict({ seq: 2, unitId: "alpha" })],
    found,
  );
  assert.deepEqual(
    report.pairs.map((p) => p.unitId),
    ["alpha", "zulu"],
  );
});

test("every exclusion bucket is present at zero — an empty bucket is a measurement", () => {
  const report = resolvePopulation([verdict()], found);
  assert.deepEqual(Object.keys(report.excluded).sort(), [...EXCLUSION_REASONS].sort());
  for (const reason of EXCLUSION_REASONS) assert.equal(report.excluded[reason], 0);
});

test("exclusion counts are per-reason, and an excluded verdict contributes no pair", () => {
  const report = resolvePopulation(
    [
      verdict({ seq: 1, unitId: "alpha" }),
      verdict({ seq: 2, unitId: "gone" }),
      verdict({ seq: 3, unitId: "gone" }),
      verdict({ seq: 4, unitId: "dry", outcome: "fail" }),
    ],
    (id) => (id === "alpha" ? found(id) : id === "gone" ? { kind: "spec-missing" } : { kind: "no-real-arm" }),
  );
  assert.equal(report.verdictsIncluded, 1);
  assert.equal(report.excluded["spec-missing"], 2);
  assert.equal(report.excluded["not-a-pass"], 1);
  assert.equal(report.excluded["no-real-arm"], 0, "the fail is counted ONCE, by its first reason");
  assert.deepEqual(report.pairs.map((p) => p.unitId), ["alpha"]);
});

test("boundHash coverage is counted over EVERY verdict, included or not", () => {
  const report = resolvePopulation(
    [
      verdict({ seq: 1, boundHash: "fnv1:aaa" }),
      verdict({ seq: 2, outcome: "fail", boundHash: "fnv1:bbb" }),
      verdict({ seq: 3 }),
    ],
    found,
  );
  assert.equal(report.verdictsWithBoundHash, 2);
  assert.equal(report.verdictsIncluded, 2);
});

test("the rendered population names the missing anchor only when the count really is zero", () => {
  const none = renderPopulation(resolvePopulation([verdict()], found));
  assert.match(none, /carrying a boundHash: {4}0/);
  assert.match(none, /ADR-0016's span anchor is stamped on NONE/);

  // The non-zero arm is pinned as a WHOLE LINE, not swept: `doesNotMatch(/stamped on NONE/)` passes
  // over an empty-string arm mutated to any other text, which is the survivor a sweep let through.
  const some = renderPopulation(resolvePopulation([verdict({ boundHash: "fnv1:aaa" })], found));
  const anchorLine = some.split("\n").find((l) => l.includes("carrying a boundHash"));
  assert.equal(anchorLine, "  carrying a boundHash:    1", "no note at all when one is stamped");
});

test("the rendered population prints every reason line, including the zeroes", () => {
  const text = renderPopulation(resolvePopulation([verdict()], found));
  for (const reason of EXCLUSION_REASONS) {
    assert.match(text, new RegExp(`${reason}\\s+0`), `${reason} must be printed even at zero`);
  }
  assert.match(text, /distinct units in the population: 1/);
});

// ---------------------------------------------------------------------------------------------
// Spec lookup mapping
// ---------------------------------------------------------------------------------------------

test("lookupFromResolved names all four states", () => {
  assert.deepEqual(lookupFromResolved("a", null, false), { kind: "spec-missing" });
  assert.deepEqual(lookupFromResolved("a", null, true), { kind: "no-proof-config" });
  assert.deepEqual(lookupFromResolved("a", {}, true), { kind: "no-real-arm" });
  assert.deepEqual(lookupFromResolved("a", { real: undefined }, true), { kind: "no-real-arm" });
});

test("a missing spec beats a resolved config — an id nothing on disk answers is spec-missing", () => {
  // `specFound: false` with a non-null config is contradictory input; the reader must not report a
  // pair for a unit whose spec it never found.
  assert.deepEqual(
    lookupFromResolved("a", { real: { testFile: "t.ts", sourceFile: "s.ts" } }, false),
    { kind: "spec-missing" },
  );
});

test("a real arm carries its flags through, and each flag is read independently", () => {
  const got = lookupFromResolved(
    "unit-x",
    {
      real: {
        testFile: "packages/x/src/a.test.ts",
        sourceFile: "packages/x/src/a.ts",
        proofCommand: { file: "pnpm", args: ["test"] },
        editsExisting: true,
      },
    },
    true,
  );
  assert.equal(got.kind, "real");
  assert.deepEqual(got.kind === "real" ? got.pair : null, {
    unitId: "unit-x",
    testFile: "packages/x/src/a.test.ts",
    sourceFile: "packages/x/src/a.ts",
    suiteOracle: true,
    editsExisting: true,
    refactorForTests: false,
  });
});

test("suiteOracle is false only when no proofCommand is declared at all", () => {
  const bare = lookupFromResolved("u", { real: { testFile: "t.ts", sourceFile: "s.ts" } }, true);
  assert.equal(bare.kind === "real" ? bare.pair.suiteOracle : null, false);
  const withCmd = lookupFromResolved(
    "u",
    { real: { testFile: "t.ts", sourceFile: "s.ts", proofCommand: {} } },
    true,
  );
  assert.equal(withCmd.kind === "real" ? withCmd.pair.suiteOracle : null, true);
});

test("refactorForTests and editsExisting are separate axes", () => {
  const r2 = lookupFromResolved(
    "u",
    { real: { testFile: "t.ts", sourceFile: "s.ts", refactorForTests: true } },
    true,
  );
  assert.equal(r2.kind === "real" ? r2.pair.refactorForTests : null, true);
  assert.equal(r2.kind === "real" ? r2.pair.editsExisting : null, false);
});

// ---------------------------------------------------------------------------------------------
// Tally and score
// ---------------------------------------------------------------------------------------------

test("every status lands in its own bucket, and an unknown one is excluded rather than scored", () => {
  const tally = tallyMutants([
    ...Array<string>(2).fill("Killed"),
    ...Array<string>(3).fill("Survived"),
    ...Array<string>(4).fill("Timeout"),
    ...Array<string>(5).fill("NoCoverage"),
    ...Array<string>(6).fill("CompileError"),
    "SomethingStrykerAddedLater",
    "",
  ]);
  assert.deepEqual(tally, { killed: 2, survived: 3, timeout: 4, noCoverage: 5, excluded: 8 });
});

test("an empty report tallies to all zeroes rather than throwing", () => {
  assert.deepEqual(tallyMutants([]), {
    killed: 0,
    survived: 0,
    timeout: 0,
    noCoverage: 0,
    excluded: 0,
  });
});

test("the denominator is the four scored buckets — never `excluded`", () => {
  const tally: MutantTally = { killed: 3, survived: 1, timeout: 2, noCoverage: 4, excluded: 5 };
  const got = scorePair(tally);
  assert.equal(got.denominator, 10, "3+1+2+4; the 5 excluded mutants say nothing about the test");
  assert.equal(got.score, 0.3);
});

test("a timeout is NOT credited as a kill", () => {
  // The lenient reading (Stryker's own) would score this 100%. This repo's rung calls a Timeout
  // `unproven`, and so does this reading — the timeouts stay visible so the lenient figure is
  // recomputable, but they never inflate the headline.
  const got = scorePair({ killed: 1, survived: 0, timeout: 3, noCoverage: 0, excluded: 0 });
  assert.equal(got.denominator, 4);
  assert.equal(got.score, 0.25);
});

test("no mutants is an ABSENCE, never a zero score", () => {
  const got = scorePair({ killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 7 });
  assert.equal(got.denominator, 0);
  assert.equal(got.score, undefined);
  assert.equal(pct(got.score), "n/a (no mutants)");
});

test("a genuine zero and an absence render differently", () => {
  const zero = scorePair({ killed: 0, survived: 5, timeout: 0, noCoverage: 0, excluded: 0 });
  assert.equal(zero.score, 0);
  assert.equal(pct(zero.score), "0.0%");
  assert.notEqual(pct(zero.score), pct(undefined));
});

test("pct renders one decimal place", () => {
  assert.equal(pct(1), "100.0%");
  assert.equal(pct(0.6180339), "61.8%");
});

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

function scored(over: Partial<PairScore> & { tally: MutantTally }): PairScore {
  const { score, denominator } = scorePair(over.tally);
  return {
    pair: pair("u"),
    score,
    denominator,
    testChangedSinceProof: undefined,
    ...over,
  };
}

test("the pooled score weights by mutants and the mean weights by pair — and they differ", () => {
  const agg = aggregate([
    scored({ tally: { killed: 1, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 } }), // 1/1
    scored({ tally: { killed: 1, survived: 3, timeout: 0, noCoverage: 0, excluded: 0 } }), // 1/4
  ]);
  assert.equal(agg.pooledScore, 0.4, "2 killed of 5 mutants");
  assert.equal(agg.meanOfPairScores, 0.625, "(100% + 25%) / 2");
  assert.notEqual(agg.pooledScore, agg.meanOfPairScores);
});

test("a pair that generated no mutants counts as a pair but not toward the mean", () => {
  const agg = aggregate([
    scored({ tally: { killed: 3, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 } }),
    scored({ tally: { killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 2 } }),
  ]);
  assert.equal(agg.pairs, 2);
  assert.equal(agg.pairsWithMutants, 1);
  assert.equal(agg.meanOfPairScores, 0.75);
  assert.equal(agg.pooledScore, 0.75);
  assert.equal(agg.totals.excluded, 2, "excluded mutants are still summed, just not scored");
});

test("aggregating nothing yields absences, not zeroes", () => {
  const agg = aggregate([]);
  assert.equal(agg.pairs, 0);
  assert.equal(agg.pooledScore, undefined);
  assert.equal(agg.meanOfPairScores, undefined);
  assert.deepEqual(agg.totals, { killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 });
});

test("totals sum every bucket independently", () => {
  const agg = aggregate([
    scored({ tally: { killed: 1, survived: 2, timeout: 3, noCoverage: 4, excluded: 5 } }),
    scored({ tally: { killed: 10, survived: 20, timeout: 30, noCoverage: 40, excluded: 50 } }),
  ]);
  assert.deepEqual(agg.totals, { killed: 11, survived: 22, timeout: 33, noCoverage: 44, excluded: 55 });
});

// ---------------------------------------------------------------------------------------------
// Report reading
// ---------------------------------------------------------------------------------------------

test("statuses are read from every file in the report, not looked up by path", () => {
  // Stryker keys `files` by whatever path form it resolved. A reader that looked the mutate path up
  // would return [] on any key mismatch, which is indistinguishable from "no mutants" — the one
  // absence this reading must never fake.
  const statuses = statusesFromReport({
    files: {
      "C:/abs/win/style/src/a.ts": { mutants: [{ status: "Killed" }, { status: "Survived" }] },
      "src/a.ts": { mutants: [{ status: "Timeout" }] },
    },
  });
  assert.deepEqual(statuses.sort(), ["Killed", "Survived", "Timeout"]);
});

test("a report with no files, no mutants, or no status degrades to an empty/blank reading", () => {
  assert.deepEqual(statusesFromReport({}), []);
  assert.deepEqual(statusesFromReport({ files: {} }), []);
  assert.deepEqual(statusesFromReport({ files: { "a.ts": { mutants: [] } } }), []);
  assert.deepEqual(statusesFromReport({ files: { "a.ts": {} } }), []);
  assert.deepEqual(statusesFromReport({ files: { "a.ts": undefined } }), []);
  // A mutant with no status is an unknown status, which tallies as excluded — never as a kill.
  assert.deepEqual(statusesFromReport({ files: { "a.ts": { mutants: [{}] } } }), [""]);
  assert.equal(tallyMutants(statusesFromReport({ files: { "a.ts": { mutants: [{}] } } })).killed, 0);
});

// ---------------------------------------------------------------------------------------------
// Generated configs. Asserted by IMPORTING the generated module and reading the OBJECT, not by
// sweeping the text for substrings: `includes-sweep-cannot-see-a-blanked-generated-line` records
// that a per-line containment sweep over generated source proves almost nothing.
// ---------------------------------------------------------------------------------------------

async function loadGenerated(body: string, ext: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "leaf-strength-conf-"));
  try {
    const file = path.join(dir, `conf.${ext}`);
    writeFileSync(file, body, "utf8");
    const mod = (await import(pathToFileURL(file).href)) as { default: Record<string, unknown> };
    return mod.default;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the bun config mutates exactly the source file and runs exactly the test file", async () => {
  const conf = await loadGenerated(
    strykerConfigBody(
      { sourceFile: "packages/x/src/a.ts", testFile: "packages/x/src/a.test.ts" },
      "reports/r.json",
      3,
      { kind: "bun" },
    ),
    "mjs",
  );
  assert.equal(conf["testRunner"], "bun");
  assert.deepEqual(conf["mutate"], ["packages/x/src/a.ts"]);
  assert.deepEqual((conf["bun"] as { testFiles: string[] }).testFiles, ["packages/x/src/a.test.ts"]);
  // Isolation IS the measurement: exactly one test file, so every kill is the authored test's.
  assert.equal((conf["bun"] as { testFiles: string[] }).testFiles.length, 1);
  assert.equal(conf["coverageAnalysis"], "off");
  assert.equal(conf["disableBail"], true);
  assert.equal(conf["concurrency"], 3);
  assert.deepEqual(conf["jsonReporter"], { fileName: "reports/r.json" });
  // The bun runner must not silently inherit bun's 5 s per-test default (a slow test comes back as
  // a Timeout, which this reading refuses to credit as a kill).
  assert.deepEqual((conf["bun"] as { bunArgs: string[] }).bunArgs, ["--timeout", "300000"]);
  assert.equal(conf["tsconfigFile"], "stryker-no-tsconfig.json");
  assert.equal(conf["vitest"], undefined);
});

test("the vitest config names the narrowed project config and disables `related`", async () => {
  const conf = await loadGenerated(
    strykerConfigBody(
      { sourceFile: "apps/studio/src/a.ts", testFile: "apps/studio/src/a.test.ts" },
      "reports/r.json",
      4,
      { kind: "vitest", configFile: "apps/studio/vitest.leaf-strength.config.ts" },
    ),
    "mjs",
  );
  assert.equal(conf["testRunner"], "vitest");
  assert.deepEqual(conf["vitest"], {
    configFile: "apps/studio/vitest.leaf-strength.config.ts",
    related: false,
  });
  assert.deepEqual(conf["mutate"], ["apps/studio/src/a.ts"]);
  assert.equal(conf["bun"], undefined, "the bun arm must not leak into a vitest run");
});

test("both arms carry the same budget and sandbox settings", async () => {
  const one = { sourceFile: "s.ts", testFile: "t.test.ts" };
  const bun = await loadGenerated(strykerConfigBody(one, "r.json", 4, { kind: "bun" }), "mjs");
  const vit = await loadGenerated(
    strykerConfigBody(one, "r.json", 4, { kind: "vitest", configFile: "c.ts" }),
    "mjs",
  );
  for (const conf of [bun, vit]) {
    assert.equal(conf["timeoutFactor"], 6);
    assert.equal(conf["timeoutMS"], 120000);
    assert.equal(conf["tempDirName"], ".stryker-tmp");
    assert.deepEqual(conf["reporters"], ["json"]);
  }
});

test("the narrowed vitest config includes exactly the one project-relative test file", () => {
  const body = vitestConfigBody("src/lib/worldCamera.test.ts");
  // The include list is the whole narrowing, so it is asserted as an exact encoded array rather
  // than by containment — a sweep would pass on a list that had grown a second entry.
  assert.match(body, /include: \["src\/lib\/worldCamera\.test\.ts"\] \},/);
  // It EXTENDS the project's own config: dropping the spread would drop the React plugin and the
  // `self`→globalThis setup file, and every test would fail for reasons unrelated to the mutant.
  assert.match(body, /import base from '\.\/vitest\.config\.js';/);
  assert.match(body, /\.\.\.base,/);
  assert.match(body, /\.\.\.\(base\.test \?\? \{\}\),/);
  // A function-form config cannot be spread; it must refuse loudly rather than produce a config
  // that silently drops everything.
  assert.match(body, /typeof base === 'function'/);
});

// ---------------------------------------------------------------------------------------------
// The authoring-shape split
// ---------------------------------------------------------------------------------------------

test("the split separates net-new from edits-existing, and neither equals the pooled figure", () => {
  const split = splitByAuthoringShape([
    scored({
      pair: pair("net", { editsExisting: false }),
      tally: { killed: 9, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 },
    }),
    scored({
      pair: pair("edit", { editsExisting: true }),
      tally: { killed: 1, survived: 9, timeout: 0, noCoverage: 0, excluded: 0 },
    }),
  ]);
  assert.equal(split.netNew.pairs, 1);
  assert.equal(split.editsExisting.pairs, 1);
  assert.equal(split.netNew.pooledScore, 0.9);
  assert.equal(split.editsExisting.pooledScore, 0.1);
  // The whole reason for the split: pooling these two would report 50%, which is true of neither
  // subset and is the number a reader would quote.
  assert.equal(aggregate([
    scored({ pair: pair("net", { editsExisting: false }), tally: { killed: 9, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 } }),
    scored({ pair: pair("edit", { editsExisting: true }), tally: { killed: 1, survived: 9, timeout: 0, noCoverage: 0, excluded: 0 } }),
  ]).pooledScore, 0.5);
});

test("an empty side of the split reports an absence, not a zero", () => {
  const split = splitByAuthoringShape([
    scored({
      pair: pair("net", { editsExisting: false }),
      tally: { killed: 2, survived: 2, timeout: 0, noCoverage: 0, excluded: 0 },
    }),
  ]);
  assert.equal(split.editsExisting.pairs, 0);
  assert.equal(split.editsExisting.pooledScore, undefined);
  assert.equal(pct(split.editsExisting.pooledScore), "n/a (no mutants)");
  assert.equal(split.netNew.pooledScore, 0.5);
});

test("refactorForTests does not move a pair across the split — editsExisting alone decides", () => {
  const split = splitByAuthoringShape([
    scored({
      pair: pair("r2", { editsExisting: false, refactorForTests: true }),
      tally: { killed: 1, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 },
    }),
  ]);
  assert.equal(split.netNew.pairs, 1);
  assert.equal(split.editsExisting.pairs, 0);
});

// ---------------------------------------------------------------------------------------------
// Golden output. Both renderers are prose, and prose is where a per-assertion sweep proves least:
// a containment check passes over a line that has silently lost half its meaning
// (`includes-sweep-cannot-see-a-blanked-generated-line`). These pin the WHOLE string, so every
// literal in them is constrained by exactly one assertion.
// ---------------------------------------------------------------------------------------------

test("renderPopulation's whole output is pinned, including the zero rows", () => {
  const report = resolvePopulation(
    [
      verdict({ seq: 1, unitId: "alpha" }),
      verdict({ seq: 2, unitId: "beta", outcome: "fail" }),
      verdict({ seq: 3, unitId: "gamma", evidenceKinds: ["observation:green"] }),
    ],
    found,
  );
  assert.equal(
    renderPopulation(report),
    [
      "verdicts read:             3",
      "  carrying a boundHash:    0   <- ADR-0016's span anchor is stamped on NONE of them; resolution falls back to the spec",
      "  resolved to a leaf pair: 1",
      "  excluded:",
      "    not-a-pass         1",
      "    no-observed-red    1",
      "    spec-missing       0",
      "    no-proof-config    0",
      "    no-real-arm        0",
      "",
      "distinct units in the population: 1",
    ].join("\n"),
  );
});

test("vitestConfigBody's whole output is pinned", () => {
  assert.equal(
    vitestConfigBody("src/a.test.ts"),
    [
      "// GENERATED by leaf-test-strength.run.ts for one leaf pair — do not commit, do not edit.",
      "import { fileURLToPath } from 'node:url';",
      "",
      "import base from './vitest.config.js';",
      "",
      "const root = fileURLToPath(new URL('.', import.meta.url));",
      "",
      "if (typeof base === 'function') {",
      "  throw new Error('leaf-test-strength cannot narrow a function-form vitest config.');",
      "}",
      "",
      "export default {",
      "  ...base,",
      "  root,",
      '  test: { ...(base.test ?? {}), root, include: ["src/a.test.ts"] },',
      "};",
      "",
    ].join("\n"),
  );
});

test("strykerConfigBody's whole bun output is pinned", () => {
  assert.equal(
    strykerConfigBody({ sourceFile: "s.ts", testFile: "t.test.ts" }, "r.json", 2, { kind: "bun" }),
    [
      "// GENERATED by leaf-test-strength.run.ts for one leaf pair — do not commit, do not edit.",
      "export default {",
      '  testRunner: "bun",',
      '  plugins: ["@hughescr/stryker-bun-runner"],',
      "  bun: {",
      '    testFiles: ["t.test.ts"],',
      '    bunArgs: ["--timeout", "300000"],',
      "    timeout: 180000,",
      "  },",
      '  coverageAnalysis: "off",',
      "  disableBail: true,",
      '  mutate: ["s.ts"],',
      '  reporters: ["json"],',
      '  jsonReporter: { fileName: "r.json" },',
      "  concurrency: 2,",
      "  timeoutFactor: 6,",
      "  timeoutMS: 120000,",
      '  tempDirName: ".stryker-tmp",',
      '  tsconfigFile: "stryker-no-tsconfig.json",',
      "};",
      "",
    ].join("\n"),
  );
});

test("strykerConfigBody's whole vitest output is pinned", () => {
  assert.equal(
    strykerConfigBody({ sourceFile: "s.ts", testFile: "t.test.ts" }, "r.json", 2, {
      kind: "vitest",
      configFile: "apps/studio/vitest.leaf-strength.config.ts",
    }),
    [
      "// GENERATED by leaf-test-strength.run.ts for one leaf pair — do not commit, do not edit.",
      "export default {",
      '  testRunner: "vitest",',
      '  plugins: ["@stryker-mutator/vitest-runner"],',
      '  vitest: { configFile: "apps/studio/vitest.leaf-strength.config.ts", related: false },',
      '  coverageAnalysis: "off",',
      "  disableBail: true,",
      '  mutate: ["s.ts"],',
      '  reporters: ["json"],',
      '  jsonReporter: { fileName: "r.json" },',
      "  concurrency: 2,",
      "  timeoutFactor: 6,",
      "  timeoutMS: 120000,",
      '  tempDirName: ".stryker-tmp",',
      '  tsconfigFile: "stryker-no-tsconfig.json",',
      "};",
      "",
    ].join("\n"),
  );
});

// ---------------------------------------------------------------------------------------------
// Covered score and reach — the two figures that keep an UNREACHED file out of a strength claim
// ---------------------------------------------------------------------------------------------

test("the covered score excludes NoCoverage from its denominator; the whole-file score does not", () => {
  // The measured shape: a test that reaches 4 of 2553 mutants and kills none of the 4.
  const tally: MutantTally = { killed: 0, survived: 4, timeout: 0, noCoverage: 2549, excluded: 0 };
  assert.equal(scorePair(tally).denominator, 2553);
  assert.equal(scorePair(tally).score, 0);
  assert.equal(coveredScorePair(tally).denominator, 4);
  assert.equal(coveredScorePair(tally).score, 0);
  // Reach is what tells the two 0%s apart: this pair's test barely executes the file at all.
  assert.ok((reach(tally) ?? 1) < 0.002);
});

test("a timeout counts as reached but not as killed", () => {
  const tally: MutantTally = { killed: 3, survived: 1, timeout: 2, noCoverage: 4, excluded: 0 };
  assert.equal(coveredScorePair(tally).denominator, 6, "3+1+2 — the timeouts were reached");
  assert.equal(coveredScorePair(tally).score, 0.5);
  assert.equal(reach(tally), 0.6, "6 of 10");
});

test("a test that reaches nothing has no covered score and no strength claim", () => {
  const tally: MutantTally = { killed: 0, survived: 0, timeout: 0, noCoverage: 12, excluded: 0 };
  assert.equal(coveredScorePair(tally).score, undefined);
  assert.equal(coveredScorePair(tally).denominator, 0);
  assert.equal(scorePair(tally).score, 0, "the whole-file figure is a real 0 — every mutant lived");
  assert.equal(reach(tally), 0);
});

test("no mutants at all leaves reach undefined rather than 0", () => {
  const none: MutantTally = { killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 3 };
  assert.equal(reach(none), undefined);
  assert.notEqual(reach(none), 0);
});

test("full reach is 1 and a fully-killing test scores the same on both figures", () => {
  const tally: MutantTally = { killed: 5, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 };
  assert.equal(reach(tally), 1);
  assert.equal(scorePair(tally).score, 1);
  assert.equal(coveredScorePair(tally).score, 1);
});

test("the aggregate carries all three pooled figures, and they differ when reach is partial", () => {
  const agg = aggregate([
    scored({ tally: { killed: 3, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 } }),
    scored({ tally: { killed: 0, survived: 1, timeout: 0, noCoverage: 15, excluded: 0 } }),
  ]);
  assert.equal(agg.pooledScore, 0.15, "3 killed of 20 mutants");
  assert.equal(agg.pooledCoveredScore, 0.6, "3 killed of the 5 reached");
  assert.equal(agg.pooledReach, 0.25, "5 of 20 reached");
  assert.notEqual(agg.pooledScore, agg.pooledCoveredScore);
});

// ---------------------------------------------------------------------------------------------
// The markdown reading — pinned whole, for the same reason the other two renderers are
// ---------------------------------------------------------------------------------------------

test("the markdown reading carries every denominator and both subsets", () => {
  const md = renderReadingMarkdown(
    [
      scored({
        pair: pair("net-strong", { editsExisting: false }),
        tally: { killed: 9, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 },
        testChangedSinceProof: false,
      }),
      scored({
        pair: pair("edit-weak", { editsExisting: true }),
        tally: { killed: 1, survived: 1, timeout: 0, noCoverage: 8, excluded: 0 },
        testChangedSinceProof: true,
      }),
    ],
    5,
    [{ unitId: "broken", error: "no report" }],
  );
  assert.equal(
    md,
    [
      "**2 of 5 pairs scored** (1 could not be run — listed below).",
      "",
      "| subset | pairs | mutants | score (whole file) | score (covered only) | reach |",
      "|---|---:|---:|---:|---:|---:|",
      "| **all scored** | 2 | 20 | 50.0% | 83.3% | 60.0% |",
      "| net-new | 1 | 10 | 90.0% | 90.0% | 100.0% |",
      "| edits-existing *(lower bound)* | 1 | 10 | 10.0% | 50.0% | 20.0% |",
      "",
      "Mean of per-pair whole-file scores: **50.0%** over 2 pair(s) that generated any mutant.",
      "",
      "| unit | shape | mutants | score | covered | reach | k/s/t/n | test file since proof |",
      "|---|---|---:|---:|---:|---:|---|---|",
      "| `net-strong` | net-new | 10 | 90.0% | 90.0% | 100.0% | 9/1/0/0 | same |",
      "| `edit-weak` | edits | 10 | 10.0% | 50.0% | 20.0% | 1/1/0/8 | edited |",
      "",
      "**Could not be run:**",
      "",
      "- `broken` — no report",
    ].join("\n"),
  );
});

test("the markdown rows are ordered strongest-first, and an unknown staleness renders as `?`", () => {
  const md = renderReadingMarkdown(
    [
      scored({
        pair: pair("weak"),
        tally: { killed: 1, survived: 9, timeout: 0, noCoverage: 0, excluded: 0 },
      }),
      scored({
        pair: pair("strong"),
        tally: { killed: 9, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 },
      }),
    ],
    2,
    [],
  );
  const rows = md.split("\n").filter((l) => l.startsWith("| `"));
  assert.deepEqual(rows.map((r) => r.split(" ")[1]), ["`strong`", "`weak`"]);
  assert.ok(rows.every((r) => r.endsWith("| ? |")), "staleness the caller could not establish");
  // PINNED WHOLE, not swept: with no failures the table must END at its last pair row. A
  // `doesNotMatch(/Could not be run/)` passes over an empty branch mutated to emit any OTHER junk
  // line, which is exactly the `[] -> ["Stryker was here"]` survivor a sweep here let through.
  assert.equal(
    md.split("\n").slice(-2).join("\n"),
    [
      "| `strong` | net-new | 10 | 90.0% | 90.0% | 100.0% | 9/1/0/0 | ? |",
      "| `weak` | net-new | 10 | 10.0% | 10.0% | 100.0% | 1/9/0/0 | ? |",
    ].join("\n"),
    "nothing follows the last pair row when nothing failed",
  );
});

test("a pair with no mutants sorts last and renders its absence, never a 0%", () => {
  // Without this the `?? -1` in the sort comparator is unconstrained: every other case has a
  // defined score on both sides, so a mutant that drops the fallback is never observed.
  const md = renderReadingMarkdown(
    [
      scored({
        pair: pair("no-mutants"),
        tally: { killed: 0, survived: 0, timeout: 0, noCoverage: 0, excluded: 4 },
      }),
      scored({
        pair: pair("weakest-real"),
        tally: { killed: 0, survived: 7, timeout: 0, noCoverage: 0, excluded: 0 },
      }),
    ],
    2,
    [],
  );
  const rows = md.split("\n").filter((l) => l.startsWith("| `"));
  assert.deepEqual(
    rows.map((r) => r.split(" ")[1]),
    ["`weakest-real`", "`no-mutants`"],
    "a genuine 0% outranks an absence",
  );
  assert.match(rows[1] ?? "", /n\/a \(no mutants\)/);
  assert.match(rows[0] ?? "", /\| 0\.0% \|/);
});

// ---------------------------------------------------------------------------------------------
// Subset re-runs — selecting units, and merging onto what a previous run banked
// ---------------------------------------------------------------------------------------------

test("an empty --units filter means EVERYTHING, not nothing", () => {
  const pairs = [pair("a"), pair("b")];
  const got = selectUnits(pairs, []);
  assert.deepEqual(got.selected.map((p) => p.unitId), ["a", "b"]);
  assert.deepEqual(got.unmatched, []);
});

test("--units selects only the named pairs and reports names that matched nothing", () => {
  const pairs = [pair("a"), pair("b"), pair("c")];
  const got = selectUnits(pairs, ["b", "typo"]);
  assert.deepEqual(got.selected.map((p) => p.unitId), ["b"]);
  assert.deepEqual(got.unmatched, ["typo"], "a typo must surface, not silently select nothing");
});

test("merging a re-run keeps every banked pair and replaces only the re-run ones", () => {
  // INSERTION ORDER IS DELIBERATELY NOT SORTED ORDER (`zulu`, `mike`, then `alpha`): a merge that
  // returned map order would pass on an already-sorted fixture and reorder a real reading.
  const banked = [
    scored({ pair: pair("zulu"), tally: { killed: 1, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 } }),
    scored({ pair: pair("mike"), tally: { killed: 2, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 } }),
  ];
  const fresh = [
    scored({ pair: pair("mike"), tally: { killed: 5, survived: 5, timeout: 0, noCoverage: 0, excluded: 0 } }),
    scored({ pair: pair("alpha"), tally: { killed: 3, survived: 0, timeout: 0, noCoverage: 0, excluded: 0 } }),
  ];
  const merged = mergeScored(banked, fresh);
  assert.deepEqual(merged.map((s) => s.pair.unitId), ["alpha", "mike", "zulu"], "sorted, not map order");
  assert.equal(merged[0]?.tally.killed, 3);
  assert.equal(merged[1]?.tally.killed, 5, "the re-run wins on a pair it re-scored");
  assert.equal(merged[2]?.tally.killed, 1, "an untouched banked pair survives the merge");
});

test("merging nothing onto a banked reading changes nothing — the --population case", () => {
  const banked = [
    scored({ pair: pair("a"), tally: { killed: 4, survived: 1, timeout: 0, noCoverage: 0, excluded: 0 } }),
  ];
  assert.deepEqual(mergeScored(banked, []), banked);
  assert.deepEqual(mergeFailed([{ unitId: "x", error: "e" }], [], new Set()), [
    { unitId: "x", error: "e" },
  ]);
});

test("a unit that now SCORES drops out of the could-not-be-run list, and the rest come back sorted", () => {
  const merged = mergeFailed(
    [
      { unitId: "zulu", error: "old reason" },
      { unitId: "fixed", error: "old reason" },
      { unitId: "mike", error: "old reason" },
    ],
    [{ unitId: "alpha", error: "a better reason" }],
    new Set(["fixed"]),
  );
  assert.deepEqual(
    merged.map((f) => f.unitId),
    ["alpha", "mike", "zulu"],
    "sorted, not map order — the fixture's insertion order is deliberately not sorted",
  );
  assert.equal(merged[0]?.error, "a better reason");
});
