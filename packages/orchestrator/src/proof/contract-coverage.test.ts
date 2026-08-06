import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyContractCoverage,
  classifyDeclaredCoverage,
  extractTestNames,
  extractVouchingTestNames,
  analyzeObservedTests,
  readTestSurface,
  testNameCoversContract,
} from "./contract-coverage.js";

/**
 * The CONTRACT-COVERAGE classifier (ADR-0020 coverage-honesty follow-on). The headline red→green:
 * a unit with an UNCOVERED contract is flagged (the gap a signed `--real` green leaves open); a
 * fully-covered unit passes. Pure — fixtures in, report out; no store/git/clock.
 */

// ---------------------------------------------------------------------------
// testNameCoversContract — boundary-aware name match
// ---------------------------------------------------------------------------

test("testNameCoversContract: the `describe(\"<id>: …\")` convention matches", () => {
  // The real convention (deploy-health-signal ↔ deploy-health.test.ts).
  assert.equal(
    testNameCoversContract(
      "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
      "deploy-health-red-run-classifies-loud",
    ),
    true,
  );
});

test("testNameCoversContract: a shorter id does NOT match a longer contract's test (boundary)", () => {
  // `fr-bounded` must not be considered covered by a test named for `fr-bounded-never-hangs` — the
  // trailing `-` is an id-token char, so it is not a token boundary.
  assert.equal(
    testNameCoversContract("fr-bounded-never-hangs: the deadline holds", "fr-bounded"),
    false,
  );
  // …but the FULL id matches its own test.
  assert.equal(
    testNameCoversContract("fr-bounded-never-hangs: the deadline holds", "fr-bounded-never-hangs"),
    true,
  );
});

test("testNameCoversContract: the id is matched as a whole token anywhere in the name", () => {
  assert.equal(testNameCoversContract("the staleness-is-derived band is pure", "staleness-is-derived"), true);
  // A bare prefix that runs into more id chars is not a token match.
  assert.equal(testNameCoversContract("staleness-is-derivedX", "staleness-is-derived"), false);
});

test("testNameCoversContract: an empty contract id never matches", () => {
  assert.equal(testNameCoversContract("anything", ""), false);
});

// ---------------------------------------------------------------------------
// extractTestNames — static name extraction
// ---------------------------------------------------------------------------

test("extractTestNames pulls describe/test/it names (double, single, backtick, modifiers)", () => {
  const src = `
import test from "node:test";
describe("presence-doc-fail-closed: schema validation", () => {});
test('staleness-is-derived: bands are pure', () => {});
it(\`declaration-upsert-merge: merge is stable\`, () => {});
test.skip("fr-bounded-never-hangs: deadline", () => {});
it.only("only-this-one", () => {});
`;
  assert.deepEqual(extractTestNames(src), [
    "presence-doc-fail-closed: schema validation",
    "staleness-is-derived: bands are pure",
    "declaration-upsert-merge: merge is stable",
    "fr-bounded-never-hangs: deadline",
    "only-this-one",
  ]);
});

test("extractTestNames does NOT mistake a word ending in a call name (commit/mytest) for a test", () => {
  const src = `
function commit(msg) {}
const mytest = ("not a test");
describe("real-suite", () => {});
`;
  assert.deepEqual(extractTestNames(src), ["real-suite"]);
});

// ---------------------------------------------------------------------------
// extractVouchingTestNames / analyzeObservedTests — hollow-test detection (ADR-0126)
// ---------------------------------------------------------------------------

test("extractVouchingTestNames: a substantive assertion vouches; assert(true) is hollow", () => {
  const src = `
    describe("real-contract: bounded", () => {
      it("returns within the deadline", () => { assert.ok(result.bounded); });
    });
    describe("hollow-contract: bounded", () => {
      it("works", () => { assert(true); });
    });
  `;
  const vouching = extractVouchingTestNames(src);
  // The real suite vouches (it names the contract AND a nested test asserts substantively).
  assert.ok(vouching.includes("real-contract: bounded"));
  // The hollow suite does NOT — `assert(true)` proves nothing, so it cannot vouch for its contract.
  assert.ok(!vouching.includes("hollow-contract: bounded"));
});

test("extractVouchingTestNames: a test with NO assertion does not vouch", () => {
  const src = `it("c-x: does setup only", () => { const v = compute(); doThing(v); });`;
  assert.deepEqual(extractVouchingTestNames(src), []);
});

test("extractVouchingTestNames: a skipped test never vouches, even with a real assertion", () => {
  // Named but never runs — `.skip`/`.todo` cannot vouch (it asserts nothing at runtime).
  assert.deepEqual(
    extractVouchingTestNames(`it.skip("c-x: real but skipped", () => { assert.equal(actual, expected); });`),
    [],
  );
  // Skip propagates to nested tests — a real `it` under a skipped `describe` still never runs.
  assert.deepEqual(
    extractVouchingTestNames(`describe.skip("c-x: suite off", () => { it("inner", () => { assert.ok(v); }); });`),
    [],
  );
});

test("extractVouchingTestNames: expect(true).toBe(true) is hollow; expect(x).toBe(n) is substantive", () => {
  assert.deepEqual(extractVouchingTestNames(`it("c-a: x", () => { expect(true).toBe(true); });`), []);
  assert.deepEqual(extractVouchingTestNames(`it("c-b: x", () => { expect(result).toBe(5); });`), ["c-b: x"]);
});

test("extractVouchingTestNames: a constant-only assertion (assert.equal(1, 1)) is hollow", () => {
  assert.deepEqual(extractVouchingTestNames(`it("c-x: tautology", () => { assert.equal(1, 1); });`), []);
});

test("extractVouchingTestNames: a describe named for the contract vouches via a substantive nested it", () => {
  const src = `
    describe("fr-bounded-never-hangs: the deadline holds", () => {
      it("rejects when the broker never accepts", async () => {
        await assert.rejects(connect(brokerThatHangs));
      });
    });
  `;
  assert.ok(extractVouchingTestNames(src).includes("fr-bounded-never-hangs: the deadline holds"));
});

test("analyzeObservedTests: surfaces name/skipped/vouches per observed test, in source order", () => {
  const src = `
    describe("a: real", () => { it("inner-a", () => { assert.ok(x); }); });
    it.skip("b: skipped", () => { assert.ok(y); });
    it("c: hollow", () => { assert(true); });
  `;
  const observed = analyzeObservedTests(src);
  const byName = (n: string) => observed.find((o) => o.name === n);
  assert.equal(byName("a: real")?.vouches, true);
  assert.equal(byName("b: skipped")?.skipped, true);
  assert.equal(byName("b: skipped")?.vouches, false);
  assert.equal(byName("c: hollow")?.vouches, false);
  // Source order is preserved (the describe lead before its inner it).
  assert.deepEqual(observed.map((o) => o.name).slice(0, 2), ["a: real", "inner-a"]);
});

test("RED→GREEN (ADR-0126): a contract named only by a HOLLOW test reads UNCOVERED; a substantive test covers it", () => {
  const contractIds = ["fr-bounded-never-hangs"];
  const hollow = `describe("fr-bounded-never-hangs: deadline", () => { it("works", () => { assert(true); }); });`;
  const real = `describe("fr-bounded-never-hangs: deadline", () => { it("rejects on hang", async () => { await assert.rejects(connect(hangs)); }); });`;
  // Hollow: the name IS present, but the test proves nothing — the contract is honestly UNCOVERED.
  const hollowReport = classifyContractCoverage({
    unitId: "u",
    contractIds,
    testNames: extractVouchingTestNames(hollow),
  });
  assert.deepEqual(hollowReport.uncovered, ["fr-bounded-never-hangs"]);
  // Real: the SAME contract is covered once the test asserts something substantive.
  const realReport = classifyContractCoverage({
    unitId: "u",
    contractIds,
    testNames: extractVouchingTestNames(real),
  });
  assert.deepEqual(realReport.covered, ["fr-bounded-never-hangs"]);
});

test("contrast: static name-presence (extractTestNames) counts the hollow test — the gap ADR-0126 closes", () => {
  const hollow = `describe("fr-bounded-never-hangs: deadline", () => { it("works", () => { assert(true); }); });`;
  // The OLD signal: name-presence sees the contract NAMED → would (over-)count it as covered.
  assert.ok(extractTestNames(hollow).some((n) => n.includes("fr-bounded-never-hangs")));
  // The NEW signal: the hollow test does not vouch → the contract is honestly uncovered.
  assert.ok(!extractVouchingTestNames(hollow).includes("fr-bounded-never-hangs: deadline"));
});

// ---------------------------------------------------------------------------
// Static TITLE READING — the readability axis (found 2026-08-06 via PR #1172)
//
// The readability axis is NOT the hollowness axis. Hollowness folds toward "covered" (ADR-0126:
// never tell an honest author their real test does not count); readability folds toward
// "uncovered" (an unread title vouches for nothing). The bug these pin: a title the checker COULD
// read statically was being folded as if it were unreadable, which routed an honest test into the
// uncovered bucket — the exact outcome ADR-0126's bias forbids.
//
// NB (the negative control): an ordinary-title fixture passes with the blind spot fully intact, so
// every test here uses a title shape the old extractor could not read.
// ---------------------------------------------------------------------------

test("readTitle: a `+`-concatenated title is READ (PR #1172 — six honest tests read 0/6 uncovered)", () => {
  // The shape a leaf authors when a title is too long for one line. Fully static, trivially foldable.
  const src = `
    test("osra-offer-set-is-stable: the offer set is stable across " +
         "repeated renders", () => { assert.deepEqual(first, second); });
  `;
  assert.deepEqual(extractVouchingTestNames(src), [
    "osra-offer-set-is-stable: the offer set is stable across repeated renders",
  ]);
});

test("readTitle: concatenation folds recursively (3-way) and through parentheses", () => {
  const src = `
    test("c-a" + ("-three: " + "folded recursively"), () => { assert.ok(v); });
    test(("c-b: parenthesised literal"), () => { assert.ok(w); });
  `;
  assert.deepEqual(extractVouchingTestNames(src), [
    "c-a-three: folded recursively",
    "c-b: parenthesised literal",
  ]);
});

test("readTitle: only LITERALS fold — a runtime operand is never evaluated, just elided", () => {
  // The static text is read (it still carries the id prefix, mirroring the template rule); the
  // runtime operand is elided, NEVER evaluated. `suffix` must not appear in the name.
  const src = `test("c-x: static lead " + suffix, () => { assert.ok(v); });`;
  assert.deepEqual(extractVouchingTestNames(src), ["c-x: static lead "]);
});

test("readTitle: a fully-dynamic title is OBSERVED as unread, not silently dropped", () => {
  // The honesty point: "could not parse this title" and "no test names this contract" are DIFFERENT
  // facts. The old extractor bucketed both as absent, so a signed 0/N could not be read back.
  const src = `test(titleFromAVariable, () => { assert.ok(v); });`;
  const observed = analyzeObservedTests(src);
  assert.equal(observed.length, 1, "the test call is observed even though its title is unreadable");
  assert.equal(observed[0]?.titleFullyStatic, false);
  assert.equal(observed[0]?.name, "", "no static text was readable");
  // …and it vouches for NOTHING — the readability fold stays closed toward "uncovered".
  assert.deepEqual(extractVouchingTestNames(src), []);
});

test("readTestSurface: separates 'could not read the title' from 'no such test' (the two facts)", () => {
  const src = `
    test("c-a: fully static and read", () => { assert.ok(v); });
    test(fromAVariable, () => { assert.ok(w); });
    test(\`c-c: template with \${sub}\`, () => { assert.ok(x); });
  `;
  const surface = readTestSurface(src);
  // Only the readable titles reach the classifier…
  assert.deepEqual(surface.vouching, ["c-a: fully static and read", "c-c: template with "]);
  // …and the two titles that were NOT fully static are COUNTED, so a 0/N report can say WHY.
  assert.equal(surface.unreadTitles, 2);
  // A surface with nothing to flag reports zero (no false alarm on ordinary titles).
  assert.equal(readTestSurface(`test("c-a: plain", () => { assert.ok(v); });`).unreadTitles, 0);
});

test("readTitle: a concatenated title still obeys hollow-test detection (ADR-0126 is untouched)", () => {
  // Reading the title must not smuggle a hollow test past the vouching rule — the two axes compose.
  const hollow = `test("c-x: reads fine but " + "proves nothing", () => { assert(true); });`;
  assert.deepEqual(extractVouchingTestNames(hollow), []);
  const skipped = `test.skip("c-x: reads fine but " + "never runs", () => { assert.equal(a, b); });`;
  assert.deepEqual(extractVouchingTestNames(skipped), []);
});

test("RED→GREEN (PR #1172): a contract named ONLY by a concatenated title reads COVERED", () => {
  // The end-to-end regression: this is what stamped `coverage 0/6` onto a signed --real verdict
  // while all six tests existed, named their contracts verbatim, asserted substantively, and passed.
  const src = `
    test("osra-offer-set-is-stable: the offer set is stable " +
         "across repeated renders", () => { assert.deepEqual(first, second); });
  `;
  const report = classifyContractCoverage({
    unitId: "offer-set-render-agreement",
    contractIds: ["osra-offer-set-is-stable"],
    testNames: extractVouchingTestNames(src),
  });
  assert.deepEqual(report.uncovered, []);
  assert.deepEqual(report.covered, ["osra-offer-set-is-stable"]);
});

// ---------------------------------------------------------------------------
// classifyContractCoverage — the headline red→green
// ---------------------------------------------------------------------------

test("RED: a declared contract with no observed test is flagged UNCOVERED", () => {
  const report = classifyContractCoverage({
    unitId: "shared-forest-connection",
    contractIds: [
      "fr-ready-when-broker-accepts-builder",
      "fr-fails-closed-with-guidance-when-unbrokered",
      "fr-bounded-never-hangs",
      "fr-write-brokers-not-direct",
    ],
    // The leaf authored a test for only ONE contract — the documented drop (fr-bounded-never-hangs et al).
    testNames: ["fr-ready-when-broker-accepts-builder: a reachable broker reports ready"],
  });
  assert.deepEqual(report.covered, ["fr-ready-when-broker-accepts-builder"]);
  assert.deepEqual(report.uncovered, [
    "fr-fails-closed-with-guidance-when-unbrokered",
    "fr-bounded-never-hangs",
    "fr-write-brokers-not-direct",
  ]);
  // The dropped robustness contract is explicitly flagged not-covered.
  const bounded = report.contracts.find((c) => c.contractId === "fr-bounded-never-hangs");
  assert.equal(bounded?.covered, false);
  assert.deepEqual(bounded?.coveredBy, []);
});

test("GREEN: every declared contract named by a test classifies fully covered (none uncovered)", () => {
  // The real deploy-health-signal ↔ deploy-health.test.ts convention: three contracts, three named
  // suites (re-grounded here when declare-presence was retired by ADR-0200).
  const report = classifyContractCoverage({
    unitId: "deploy-health-signal",
    contractIds: [
      "deploy-health-red-run-classifies-loud",
      "deploy-health-green-run-classifies-quiet",
      "deploy-health-no-signal-classifies-unknown",
    ],
    testNames: [
      "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
      "deploy-health-green-run-classifies-quiet: a green newest run formats one quiet line",
      "deploy-health-no-signal-classifies-unknown: no completed run reads UNVERIFIED",
      "an-extra-undeclared-suite: extra test names never confuse the classifier",
    ],
  });
  assert.deepEqual(report.uncovered, []);
  assert.equal(report.covered.length, 3);
  assert.ok(report.contracts.every((c) => c.covered));
  // The covering test name is surfaced (the honesty trail).
  assert.deepEqual(report.contracts[0]!.coveredBy, [
    "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
  ]);
});

test("classifyContractCoverage preserves declared order and collapses a duplicate id", () => {
  const report = classifyContractCoverage({
    unitId: "u",
    contractIds: ["c-b", "c-a", "c-b"], // out of order + a duplicate
    testNames: ["c-a: covered"],
  });
  assert.deepEqual(
    report.contracts.map((c) => c.contractId),
    ["c-b", "c-a"], // declared order, duplicate collapsed
  );
  assert.deepEqual(report.uncovered, ["c-b"]);
});

test("classifyContractCoverage: a unit with no declared contracts is vacuously covered", () => {
  const report = classifyContractCoverage({ unitId: "u", contractIds: [], testNames: ["x: y"] });
  assert.deepEqual(report.contracts, []);
  assert.deepEqual(report.covered, []);
  assert.deepEqual(report.uncovered, []);
});

test("classifyDeclaredCoverage maps parsed ContractDecls to their ids", () => {
  const report = classifyDeclaredCoverage(
    "u",
    [
      { id: "c-a", title: "A" },
      { id: "c-b", title: "B" },
    ],
    ["c-a: covered"],
  );
  assert.deepEqual(report.covered, ["c-a"]);
  assert.deepEqual(report.uncovered, ["c-b"]);
});
