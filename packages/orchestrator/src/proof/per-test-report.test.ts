import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  allocatePerTestReportPath,
  nodeTestReporterArgs,
  perTestReportFile,
  perTestReporterUrl,
  readBunJunitReport,
  readNodeTestReport,
  readPerTestReportText,
  readVitestJsonReport,
} from "./per-test-report.js";
import type { ReportedTest } from "./per-test-report.js";

// The fixtures are CAPTURED, not hand-written: one shapes file run on 2026-09-15 under Node 24.15.0 (tsx,
// through the spine's reporter), Bun 1.4.0 (junit) and vitest 3.2.6 (json). Only the absolute `file`
// fields were dropped from node's lines, and vitest's rows were trimmed to the fields the reader reads.

/** node:test, the spine's reporter: pass, assertion red, TypeError red, nesting, a duplicate title, every skip and todo form. */
const NODE_SHAPES = [
  '{"type":"test:pass","name":"passes: add sums","nesting":0,"line":1,"column":107,"testNumber":1,"testType":"test"}',
  '{"type":"test:fail","name":"fails-assertion: wrong expectation","nesting":0,"line":1,"column":163,"testNumber":2,"testType":"test","failureType":"testCodeFailure","errorCode":"ERR_TEST_FAILURE","causeName":"AssertionError","causeCode":"ERR_ASSERTION","causeMessage":"Expected values to be strictly equal:"}',
  '{"type":"test:fail","name":"fails-typeerror: calls a missing method","nesting":0,"line":1,"column":237,"testNumber":3,"testType":"test","failureType":"testCodeFailure","errorCode":"ERR_TEST_FAILURE","causeName":"TypeError","causeMessage":"o.x is not a function"}',
  '{"type":"test:pass","name":"leaf","nesting":2,"line":1,"column":352,"testNumber":1,"testType":"test"}',
  '{"type":"test:pass","name":"inner","nesting":1,"line":1,"column":330,"testNumber":1,"testType":"suite"}',
  '{"type":"test:pass","name":"leaf","nesting":1,"line":1,"column":398,"testNumber":2,"testType":"test"}',
  '{"type":"test:pass","name":"outer","nesting":0,"line":1,"column":308,"testNumber":4,"testType":"suite"}',
  '{"type":"test:pass","name":"same title","nesting":1,"line":1,"column":464,"testNumber":1,"testType":"test"}',
  '{"type":"test:pass","name":"same title","nesting":1,"line":1,"column":514,"testNumber":2,"testType":"test"}',
  '{"type":"test:pass","name":"dup","nesting":0,"line":1,"column":444,"testNumber":5,"testType":"suite"}',
  '{"type":"test:pass","name":"skip-modifier","nesting":0,"line":1,"column":571,"testNumber":6,"skip":true,"testType":"test"}',
  '{"type":"test:pass","name":"skip-options","nesting":0,"line":1,"column":624,"testNumber":7,"skip":true,"testType":"test"}',
  '{"type":"test:pass","name":"skip-runtime","nesting":0,"line":1,"column":688,"testNumber":8,"skip":"host-conditional","testType":"test"}',
  '{"type":"test:fail","name":"todo-modifier-failing","nesting":0,"line":1,"column":746,"testNumber":9,"todo":true,"testType":"test","failureType":"testCodeFailure","errorCode":"ERR_TEST_FAILURE","causeName":"AssertionError","causeCode":"ERR_ASSERTION","causeMessage":"Expected values to be strictly equal:"}',
  '{"type":"test:fail","name":"todo-options-failing","nesting":0,"line":1,"column":807,"testNumber":10,"todo":true,"testType":"test","failureType":"testCodeFailure","errorCode":"ERR_TEST_FAILURE","causeName":"AssertionError","causeCode":"ERR_ASSERTION","causeMessage":"Expected values to be strictly equal:"}',
  '{"type":"test:pass","name":"todo-options-passing","nesting":0,"line":1,"column":879,"testNumber":11,"todo":true,"testType":"test"}',
  '{"type":"test:summary","success":false,"counts":{"tests":13,"failed":2}}',
].join("\n");

/** node:test, a file whose static import does not resolve: one synthetic row named after the file. */
const NODE_LOAD_FAILURE =
  '{"type":"test:fail","name":"load-failure.test.ts","nesting":0,"line":1,"column":1,"testNumber":1,"testType":"test","failureType":"testCodeFailure","errorCode":"ERR_TEST_FAILURE","causeName":"String","causeMessage":"test failed"}';

/** node:test, a test calling `process.exit(0)` mid-run: one synthetic PASSING row, and no row for the test that had already passed. */
const NODE_EXIT_ZERO =
  '{"type":"test:pass","name":"exit-zero.test.ts","nesting":0,"line":1,"column":1,"testNumber":1,"testType":"test"}';

/** bun junit for the same shapes file. */
const BUN_SHAPES = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="13" assertions="0" failures="2" skipped="6" time="0.5394654">
  <testsuite name="shapes.test.ts" file="shapes.test.ts" tests="13" assertions="0" failures="2" skipped="6" time="0.0241699" hostname="">
    <testcase name="passes: add sums" classname="" time="0.001315" file="shapes.test.ts" line="5" assertions="0" />
    <testcase name="fails-assertion: wrong expectation" classname="" time="0.0012" file="shapes.test.ts" line="7" assertions="0">
      <failure type="AssertionError" message="Expected values to be strictly equal:&#10;&#10;5 !== 6&#10;">AssertionError: Expected values to be strictly equal:&#10;&#10;5 !== 6&#10;</failure>
    </testcase>
    <testcase name="fails-typeerror: calls a missing method" classname="" time="0.000125" file="shapes.test.ts" line="9" assertions="0">
      <failure type="TypeError" message="({}).x is not a function. (In &apos;({}).x()&apos;, &apos;({}).x&apos; is undefined)">TypeError: ({}).x is not a function.</failure>
    </testcase>
    <testsuite name="outer" file="shapes.test.ts" line="11" tests="2" assertions="0" failures="0" skipped="0" time="0" hostname="">
      <testsuite name="inner" file="shapes.test.ts" line="12" tests="1" assertions="0" failures="0" skipped="0" time="0" hostname="">
        <testcase name="leaf" classname="inner &gt; outer" time="0.000028" file="shapes.test.ts" line="13" assertions="0" />
      </testsuite>
      <testcase name="leaf" classname="outer" time="0.000023" file="shapes.test.ts" line="15" assertions="0" />
    </testsuite>
    <testsuite name="dup" file="shapes.test.ts" line="18" tests="2" assertions="0" failures="0" skipped="0" time="0" hostname="">
      <testcase name="same title" classname="dup" time="0.000019" file="shapes.test.ts" line="19" assertions="0" />
      <testcase name="same title" classname="dup" time="0.000011" file="shapes.test.ts" line="20" assertions="0" />
    </testsuite>
    <testcase name="skip-modifier" classname="" time="0" file="shapes.test.ts" line="23" assertions="0">
      <skipped />
    </testcase>
    <testcase name="skip-options" classname="" time="0" file="shapes.test.ts" line="25" assertions="0">
      <skipped />
    </testcase>
    <testcase name="skip-runtime" classname="" time="0.000023" file="shapes.test.ts" line="27" assertions="0">
      <skipped />
    </testcase>
    <testcase name="todo-modifier-failing" classname="" time="0" file="shapes.test.ts" line="29" assertions="0">
      <skipped message="TODO" />
    </testcase>
    <testcase name="todo-options-failing" classname="" time="0" file="shapes.test.ts" line="31" assertions="0">
      <skipped message="TODO" />
    </testcase>
    <testcase name="todo-options-passing" classname="" time="0" file="shapes.test.ts" line="33" assertions="0">
      <skipped message="TODO" />
    </testcase>
  </testsuite>
</testsuites>`;

/** vitest json for its own shapes file (vitest API), trimmed to the fields the reader reads. */
const VITEST_SHAPES = JSON.stringify({
  testResults: [
    {
      name: "C:/scratch/V1-shapes/shapes.test.ts",
      status: "failed",
      message: "",
      assertionResults: [
        { ancestorTitles: [], title: "passes: one plus one", status: "passed", failureMessages: [] },
        {
          ancestorTitles: [],
          title: "fails-assertion: wrong expectation",
          status: "failed",
          failureMessages: ["AssertionError: expected 2 to be 3 // Object.is equality\n    at shapes.test.ts:6:17"],
        },
        {
          ancestorTitles: [],
          title: "fails-typeerror: calls a missing method",
          status: "failed",
          failureMessages: ["TypeError: o.x is not a function\n    at shapes.test.ts:10:7"],
        },
        { ancestorTitles: ["outer", "inner"], title: "leaf", status: "passed", failureMessages: [] },
        { ancestorTitles: ["outer"], title: "leaf", status: "passed", failureMessages: [] },
        { ancestorTitles: ["dup"], title: "same title", status: "passed", failureMessages: [] },
        { ancestorTitles: ["dup"], title: "same title", status: "passed", failureMessages: [] },
        { ancestorTitles: [], title: "skip-modifier", status: "skipped", failureMessages: [] },
        { ancestorTitles: [], title: "skip-options", status: "skipped", failureMessages: [] },
        { ancestorTitles: [], title: "skip-runtime", status: "skipped", failureMessages: [] },
        { ancestorTitles: [], title: "todo-modifier", status: "todo", failureMessages: [] },
        { ancestorTitles: [], title: "fails-modifier", status: "passed", failureMessages: [] },
      ],
    },
  ],
});

/** vitest json for a file whose import does not resolve: a failed file entry with no test rows. */
const VITEST_LOAD_FAILURE = JSON.stringify({
  testResults: [
    {
      name: "C:/scratch/V2-load-failure/load-failure.test.ts",
      status: "failed",
      message: "Cannot find module './absent.js' imported from 'C:/scratch/V2-load-failure/load-failure.test.ts'",
      assertionResults: [],
    },
  ],
});

const outcomes = (rows: readonly ReportedTest[]): string[] =>
  rows.map((r) => `${r.path.join(" > ")} = ${r.outcome}`);

test("runner-reports-read-per-test: node:test's reporter reads into one row per leaf test with its title path and outcome", () => {
  const rows = readNodeTestReport(NODE_SHAPES);
  assert.deepEqual(outcomes(rows), [
    "passes: add sums = passed",
    "fails-assertion: wrong expectation = failed",
    "fails-typeerror: calls a missing method = failed",
    "outer > inner > leaf = passed",
    "outer > leaf = passed",
    "dup > same title = passed",
    "dup > same title = passed",
    "skip-modifier = skipped",
    "skip-options = skipped",
    "skip-runtime = skipped",
    "todo-modifier-failing = todo",
    "todo-options-failing = todo",
    "todo-options-passing = todo",
  ]);
  // Suites are containers, never rows; the duplicate title stays TWO rows so the review can refuse it.
  const assertion = rows[1];
  assert.equal(assertion?.errorName, "AssertionError");
  assert.equal(assertion?.errorCode, "ERR_ASSERTION");
  const typeError = rows[2];
  assert.equal(typeError?.errorName, "TypeError");
  assert.equal(typeError?.errorCode, undefined, "node carries no code for a TypeError, so it can never read as ERR_ASSERTION");
});

test("runner-reports-read-per-test: node's skip rows are test:pass and its failing todos test:fail, and neither reads as a pass or a red", () => {
  const rows = readNodeTestReport(NODE_SHAPES);
  for (const name of ["skip-modifier", "skip-options", "skip-runtime"]) {
    assert.equal(rows.find((r) => r.path.at(-1) === name)?.outcome, "skipped", name);
  }
  // A failing todo is a `test:fail` that does not fail the run; a reader keyed on the event type alone
  // would count it a real red.
  for (const name of ["todo-modifier-failing", "todo-options-failing", "todo-options-passing"]) {
    assert.equal(rows.find((r) => r.path.at(-1) === name)?.outcome, "todo", name);
  }
});

test("runner-reports-read-per-test: a load failure and an early exit leave node one FILE-level row, never the declared tests", () => {
  assert.deepEqual(outcomes(readNodeTestReport(NODE_LOAD_FAILURE)), ["load-failure.test.ts = failed"]);
  // The early exit reads as a single PASSING row: exactly the shape that must never advance a green.
  assert.deepEqual(outcomes(readNodeTestReport(NODE_EXIT_ZERO)), ["exit-zero.test.ts = passed"]);
});

test("runner-reports-read-per-test: node reads a subtest's parent as a container, not a row", () => {
  const lines = [
    '{"type":"test:fail","name":"child","nesting":1,"testType":"test","causeName":"AssertionError","causeCode":"ERR_ASSERTION","causeMessage":"x"}',
    '{"type":"test:fail","name":"parent","nesting":0,"testType":"test","causeName":"Error","causeMessage":"1 subtest failed"}',
  ].join("\n");
  assert.deepEqual(outcomes(readNodeTestReport(lines)), ["parent > child = failed"]);
});

test("runner-reports-read-per-test: bun's junit reads the title path below its per-file wrapper, with skips and todos apart", () => {
  const rows = readBunJunitReport(BUN_SHAPES);
  assert.deepEqual(outcomes(rows), [
    "passes: add sums = passed",
    "fails-assertion: wrong expectation = failed",
    "fails-typeerror: calls a missing method = failed",
    "outer > inner > leaf = passed",
    "outer > leaf = passed",
    "dup > same title = passed",
    "dup > same title = passed",
    "skip-modifier = skipped",
    "skip-options = skipped",
    "skip-runtime = skipped",
    "todo-modifier-failing = todo",
    "todo-options-failing = todo",
    "todo-options-passing = todo",
  ]);
  assert.equal(rows[1]?.errorName, "AssertionError");
  assert.equal(rows[1]?.message, "Expected values to be strictly equal:");
  assert.equal(rows[2]?.errorName, "TypeError");
});

test("runner-reports-read-per-test: vitest's json reads ancestry, skips and todos, and a load failure as one file row", () => {
  const rows = readVitestJsonReport(VITEST_SHAPES);
  assert.deepEqual(outcomes(rows), [
    "passes: one plus one = passed",
    "fails-assertion: wrong expectation = failed",
    "fails-typeerror: calls a missing method = failed",
    "outer > inner > leaf = passed",
    "outer > leaf = passed",
    "dup > same title = passed",
    "dup > same title = passed",
    "skip-modifier = skipped",
    "skip-options = skipped",
    "skip-runtime = skipped",
    "todo-modifier = todo",
    // `test.fails` is marked nowhere in the report: it reads passed while its assertion fails. At red that
    // is an early pass the review refuses; at green its now-passing assertion reads failed.
    "fails-modifier = passed",
  ]);
  assert.equal(rows[1]?.errorName, "AssertionError");
  assert.equal(rows[1]?.message, "AssertionError: expected 2 to be 3 // Object.is equality");
  assert.equal(rows[2]?.errorName, "TypeError");

  assert.deepEqual(outcomes(readVitestJsonReport(VITEST_LOAD_FAILURE)), ["load-failure.test.ts = failed"]);
});

test("runner-reports-read-per-test: a status the reader does not name reads `other`, never passed", () => {
  const text = JSON.stringify({
    testResults: [{ name: "x.test.ts", status: "passed", assertionResults: [{ ancestorTitles: [], title: "t", status: "disabled", failureMessages: [] }] }],
  });
  assert.deepEqual(outcomes(readVitestJsonReport(text)), ["t = other"]);
});

test("runner-reports-read-per-test: readPerTestReportText routes each channel to its reader", () => {
  assert.equal(readPerTestReportText("node-test", NODE_SHAPES).length, 13);
  assert.equal(readPerTestReportText("bun-junit", BUN_SHAPES).length, 13);
  assert.equal(readPerTestReportText("vitest-json", VITEST_SHAPES).length, 12);
});

test("runner-reports-read-per-test: node's reporter flags name spec to stdout BESIDE the spine's reporter", () => {
  const args = nodeTestReporterArgs("/tmp/report.jsonl");
  assert.deepEqual(args, [
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    `--test-reporter=${perTestReporterUrl()}`,
    "--test-reporter-destination=/tmp/report.jsonl",
  ]);
  assert.match(perTestReporterUrl(), /^file:\/\/.*per-test-reporter\.mjs$/);
});

test("per-test-report-rides-the-observation: the report file is cleared before it is trusted, and read as absent, present or unreadable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "storytree-per-test-report-"));
  try {
    const reportPath = join(dir, "report.jsonl");
    const source = perTestReportFile("node-test", reportPath);

    assert.deepEqual(source.read(), { channel: "node-test", present: false, rows: [] });

    await writeFile(reportPath, NODE_LOAD_FAILURE);
    const read = source.read();
    assert.equal(read.present, true);
    assert.equal(read.rows.length, 1);

    assert.deepEqual(source.reset(), { ok: true });
    assert.equal(existsSync(reportPath), false, "a stale report never survives into the next observation");
    assert.deepEqual(source.reset(), { ok: true }, "clearing an absent report is the normal first observation");

    await writeFile(reportPath, "{ not json");
    const unreadable = source.read();
    assert.equal(unreadable.present, true);
    assert.deepEqual(unreadable.rows, []);
    assert.match(unreadable.unreadable ?? "", /could not parse/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("per-test-report-rides-the-observation: a report path is unique per allocation and lives outside any worktree", () => {
  const a = allocatePerTestReportPath("run-1", "unit/x", "bun-junit");
  const b = allocatePerTestReportPath("run-1", "unit/x", "bun-junit");
  assert.notEqual(a, b);
  assert.ok(a.startsWith(tmpdir()));
  assert.match(a, /\.xml$/);
  assert.match(allocatePerTestReportPath("r", "u", "node-test"), /\.jsonl$/);
  assert.match(allocatePerTestReportPath("r", "u", "vitest-json"), /\.json$/);
});
