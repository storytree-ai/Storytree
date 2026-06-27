import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyContractCoverage,
  classifyDeclaredCoverage,
  extractTestNames,
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
  // The real convention (declare-presence ↔ presence.test.ts).
  assert.equal(
    testNameCoversContract("presence-doc-fail-closed: schema validation", "presence-doc-fail-closed"),
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
  // The real declare-presence ↔ presence.test.ts convention: three contracts, three named suites.
  const report = classifyContractCoverage({
    unitId: "declare-presence",
    contractIds: ["presence-doc-fail-closed", "staleness-is-derived", "declaration-upsert-merge"],
    testNames: [
      "presence-doc-fail-closed: schema validation",
      "staleness-is-derived: freshness is a pure function of lastSeenAt vs now",
      "declaration-upsert-merge: mergeDeclaration is pure and stable",
      "reapable-selection: reapableSessions picks active AND possibly-dead rows only",
    ],
  });
  assert.deepEqual(report.uncovered, []);
  assert.equal(report.covered.length, 3);
  assert.ok(report.contracts.every((c) => c.covered));
  // The covering test name is surfaced (the honesty trail).
  assert.deepEqual(report.contracts[0]!.coveredBy, ["presence-doc-fail-closed: schema validation"]);
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
