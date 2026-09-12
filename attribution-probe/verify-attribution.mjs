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
const EPSILON = "PROBE_EPSILON halves";
const ZETA = "PROBE_ZETA negates";

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
  {
    // ── THE RUNTIME-SKIP ARM (ADR-0566) ──
    // THIS IS THE ONE THAT FAILS IF THE FOURTH PATCH HUNK IS LOST, and it fails as a SURVIVOR
    // rather than as a mis-named killer. `runtime-skip.test.ts` opens with a test that calls
    // `t.skip()` mid-test; the plugin's preload has already allocated that test a coverage bucket,
    // while the inspector reports it `skip` and the mapper drops it from the test side. Buckets then
    // outnumber tests, the positional pairing truncates, and PROBE_EPSILON's bucket is attributed to
    // PROBE_ZETA — so nothing covers `epsilon`, Stryker runs ZETA against this mutant, ZETA never
    // calls epsilon, and the report says `Survived`. One runtime skip in a 34-test file took a real
    // run from 33 survivors to 134.
    line: 35,
    replacement: "n * 2",
    why: "epsilon(8) is 4 under `/` and 16 under `*`; only PROBE_EPSILON calls epsilon, and it runs AFTER a test that skips at runtime.",
    status: "Killed",
    killedBy: [EPSILON],
  },
  {
    // The second half of the pair. Under the defect this one still passes — the clamp merges the
    // shifted tail onto the LAST test, which is ZETA — which is exactly why one test after the skip
    // would not be enough and there are two.
    line: 40,
    replacement: "+n",
    why: "zeta(3) is -3 under `-n` and 3 under `+n`; only PROBE_ZETA calls zeta.",
    status: "Killed",
    killedBy: [ZETA],
  },
];

/**
 * A report test-file that is not a test file means the runner could not say which file a test it ran
 * belongs to — the INDEPENDENT tell for the same defect the two expectations above catch, and the one
 * `packages/cli/src/mutation-diff.ts` fails closed on (`unattributedTestFiles`). An unpaired test
 * loses its project file, so Stryker records it under the raw inspector url; for a `node:test` suite
 * under bun that is the literal string `node:test`, and Stryker itself warns
 * `not found in input files … This shouldn't happen`.
 */
function pseudoTestFiles(report) {
  return Object.keys(report.testFiles ?? {}).filter((p) => !/\.test\.tsx?$/.test(p.replace(/\\/g, "/")));
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

/** Stryker reports test ids; resolve them to bare test names (the sandbox path prefix varies per run). */
const testNames = new Map();
for (const file of Object.values(report.testFiles ?? {})) {
  for (const test of file.tests ?? []) {
    // Any of the probe's test files, not just `subject.test.ts` — greedy on purpose so a name
    // carrying the sandbox path AND a file segment still reduces to the bare test title.
    testNames.set(test.id, String(test.name).replace(/^.*\.test\.ts > /, ""));
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

const pseudo = pseudoTestFiles(report);
if (pseudo.length > 0) {
  failures.push(
    `the report attributes tests to ${pseudo.map((p) => `"${p}"`).join(", ")}, which is not a test file — ` +
      `the runner could not say which file those tests ran in, so its per-test coverage map is built ` +
      `from a truncated pairing (ADR-0566)`,
  );
  lines.push(`  FAIL  pseudo test file(s): ${pseudo.join(", ")}`);
} else {
  lines.push(`  ok    every reported test file is a real test file`);
}

console.log(
  `Attribution probe: ${EXPECTED.length} hand-written expectations + 1 structural check against ${reportPath}\n`,
);
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
