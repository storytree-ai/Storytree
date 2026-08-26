#!/usr/bin/env node
// Verify that mutation-kill ATTRIBUTION is real, by checking a Stryker report against a
// hand-written expectation of which test kills which mutant.
//
// WHY THIS EXISTS. `@hughescr/stryker-bun-runner` is unofficial, single-maintainer surface, and
// this repo already knows its commonest defect class is "a green check that verified nothing".
// An attribution instrument that always named the FIRST covering test would look like it worked
// while being useless -- so the fixture is built so that a constant answer, a coverage-shaped
// answer, and a whole-suite answer are each provably wrong.
//
// THE EXPECTATIONS BELOW ARE DERIVED FROM THE FIXTURE'S ARITHMETIC, NOT FROM ANY REPORT.
// Do not "fix" a failure here by copying what the report said -- an expectation derived from its
// own subject cannot fail. Re-derive it from attribution-probe/src/subject.ts by hand.
//
// Usage: node attribution-probe/verify-attribution.mjs [path-to-report.json]

import fs from "node:fs";

const reportPath = process.argv[2] ?? "reports/attribution-probe.json";

if (!fs.existsSync(reportPath)) {
  console.error(`No report at ${reportPath}. Run \`pnpm mutation:attribution-probe\` first.`);
  process.exit(1);
}

const ALPHA = "PROBE_ALPHA adds one";
const BETA = "PROBE_BETA uppercases";
const BLIND = "PROBE_DELTA_BLIND covers delta but discriminates nothing";
const SHARP = "PROBE_DELTA_SHARP doubles three";
const GAMMA = "PROBE_GAMMA returns small for a small input";

/**
 * Hand-derived from attribution-probe/src/subject.ts. Each entry is keyed by the mutant's
 * source line and its replacement text, and states the COMPLETE set of tests that can kill it
 * (the probe runs with `disableBail: true`, so a partial set is a real failure, not a bail artifact).
 */
const EXPECTED = [
  {
    line: 6,
    replacement: "n - 1",
    why: "alpha(1) is 2 under `n + 1` and 0 under `n - 1`; only PROBE_ALPHA calls alpha.",
    status: "Killed",
    killedBy: [ALPHA],
  },
  {
    line: 11,
    replacement: "s.toLowerCase()",
    why: 'beta("ab") is "AB" uppercased and "ab" lowercased; only PROBE_BETA calls beta.',
    status: "Killed",
    killedBy: [BETA],
  },
  {
    // THE LOAD-BEARING CASE. Two tests cover this mutant; exactly one can detect it.
    // If an implementation reports both, it is reporting COVERAGE and calling it attribution.
    line: 16,
    replacement: "n / 2",
    why: "delta(0) is 0 under both `*` and `/`, so PROBE_DELTA_BLIND cannot detect it; delta(3) is 6 vs 1.5, so only PROBE_DELTA_SHARP can.",
    status: "Killed",
    killedBy: [SHARP],
    alsoCoveredBy: [BLIND, SHARP],
  },
  {
    // Both delta tests DO kill this one -- emptying the body returns undefined, which fails both
    // assertions. Proves the instrument can report a set larger than one when that is the truth.
    line: 15,
    replacement: "{}",
    why: "an emptied delta returns undefined, which fails both delta(0)===0 and delta(3)===6.",
    status: "Killed",
    killedBy: [BLIND, SHARP],
  },
  {
    // Attributed to the LAST test in file order -- a constant "first test" answer fails here.
    line: 24,
    replacement: '""',
    why: 'gamma(1) returns "small"; blanking it fails only PROBE_GAMMA.',
    status: "Killed",
    killedBy: [GAMMA],
  },
  {
    // Survivors must stay survivors. Attribution must not convert a survivor into a kill.
    line: 21,
    replacement: "n >= 1000",
    why: "gamma(1) takes the same branch under `>` and `>=`, so nothing detects this.",
    status: "Survived",
    killedBy: [],
  },
];

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

/** Stryker reports test ids; resolve them to bare test names (the sandbox path prefix varies per run). */
const testNames = new Map();
for (const file of Object.values(report.testFiles ?? {})) {
  for (const test of file.tests ?? []) {
    testNames.set(test.id, String(test.name).replace(/^.*?subject\.test\.ts > /, ""));
  }
}

const mutants = Object.values(report.files ?? {}).flatMap((file) => file.mutants ?? []);
if (mutants.length === 0) {
  console.error("Report contains no mutants -- the run did not do anything.");
  process.exit(1);
}

const resolve = (ids) => (ids ?? []).map((id) => testNames.get(id) ?? id).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const failures = [];
const lines = [];

for (const expectation of EXPECTED) {
  const found = mutants.filter(
    (m) => m.location.start.line === expectation.line && String(m.replacement).trim() === expectation.replacement,
  );

  if (found.length !== 1) {
    failures.push(
      `line ${expectation.line} replacement ${expectation.replacement}: expected exactly 1 matching mutant, found ${found.length}`,
    );
    continue;
  }

  const mutant = found[0];
  const actualKilledBy = resolve(mutant.killedBy);
  const expectedKilledBy = [...expectation.killedBy].sort();
  const problems = [];

  if (mutant.status !== expectation.status) {
    problems.push(`status ${mutant.status} (expected ${expectation.status})`);
  }
  if (!same(actualKilledBy, expectedKilledBy)) {
    problems.push(`killedBy ${JSON.stringify(actualKilledBy)} (expected ${JSON.stringify(expectedKilledBy)})`);
  }
  if (expectation.alsoCoveredBy) {
    const actualCoveredBy = resolve(mutant.coveredBy);
    const expectedCoveredBy = [...expectation.alsoCoveredBy].sort();
    if (!same(actualCoveredBy, expectedCoveredBy)) {
      problems.push(`coveredBy ${JSON.stringify(actualCoveredBy)} (expected ${JSON.stringify(expectedCoveredBy)})`);
    }
  }

  if (problems.length > 0) {
    failures.push(`line ${expectation.line} (${expectation.replacement}): ${problems.join("; ")}\n      ${expectation.why}`);
    lines.push(`  FAIL  L${expectation.line} ${expectation.replacement}`);
  } else {
    lines.push(`  ok    L${expectation.line} ${String(expectation.replacement).padEnd(16)} -> ${JSON.stringify(actualKilledBy)}`);
  }
}

console.log(`Attribution probe: ${EXPECTED.length} hand-written expectations against ${reportPath}\n`);
console.log(lines.join("\n"));

if (failures.length > 0) {
  console.error(`\nATTRIBUTION PROBE FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nThis means mutation-kill attribution is NOT trustworthy on this machine/toolchain.\n" +
      "Do not build or rely on a diff-scoped mutation rung until it passes.",
  );
  process.exit(1);
}

console.log("\nATTRIBUTION PROBE PASSED — killedBy names the test that actually killed each mutant,");
console.log("distinguishes killing from merely covering, and leaves survivors as survivors.");
