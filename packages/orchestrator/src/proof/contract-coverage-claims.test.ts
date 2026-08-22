import test from "node:test";
import assert from "node:assert/strict";

import { analyzeObservedTests, classifyBehaviourClaims } from "./contract-coverage.js";

/**
 * The INVERSE classifier (`classifyBehaviourClaims`) — "which declared contract claims this asserted
 * behaviour?", the direction contract-coverage structurally cannot answer.
 *
 * The headline red→green: a running, substantively-asserting behaviour that NO declared contract
 * names is reported CONTRACTLESS, so an ADR-0294 D2 deletion can see up front that no lower-tier node
 * is available to cite and it would have to fall back to quoting a test title. Everything else here
 * defends that verdict against the four ways it could be produced dishonestly — an inherited claim
 * missed, a grouping suite counted as a behaviour, a hollow test treated as evidence, and an unread
 * title reported as an absent claim.
 */

/** Parse a fixture source into observed tests — the classifier's real input, never a hand-built one. */
const observe = (src: string): ReturnType<typeof analyzeObservedTests> => analyzeObservedTests(src);

test("classifyBehaviourClaims: a substantive behaviour NO contract names is CONTRACTLESS (the citation gap)", () => {
  const src = `
    test("contention resolves: a live holder refuses the claim and is named", () => {
      assert.equal(res.acquired, false);
    });
  `;
  const report = classifyBehaviourClaims({
    unitId: "claim-store-work-time",
    contractIds: ["release-claims-by-branch-clears-the-branch", "work-claim-request-carries-work-intent"],
    observed: observe(src),
  });
  assert.deepEqual(report.claimed, [], "no declared contract names this assertion");
  assert.deepEqual(report.unreadable, [], "the title read cleanly — this is a claim gap, not a blind spot");
  assert.equal(report.contractless.length, 1);
  assert.equal(
    report.contractless[0]?.title,
    "contention resolves: a live holder refuses the claim and is named",
  );
});

test("classifyBehaviourClaims: authoring the contract MOVES that same behaviour to claimed (the green)", () => {
  const src = `
    test("claim-contention-refuses-and-names-the-holder: a live holder refuses the claim and is named", () => {
      assert.equal(res.acquired, false);
    });
  `;
  const report = classifyBehaviourClaims({
    unitId: "claim-store-work-time",
    contractIds: ["release-claims-by-branch-clears-the-branch", "claim-contention-refuses-and-names-the-holder"],
    observed: observe(src),
  });
  assert.deepEqual(report.contractless, [], "the gap closed");
  assert.equal(report.claimed.length, 1);
  assert.equal(report.claimed[0]?.contractId, "claim-contention-refuses-and-names-the-holder");
});

test("classifyBehaviourClaims: a contract named on the enclosing SUITE claims the leaf beneath it", () => {
  // The `describe("<id>: …")` convention puts the id on the suite; the behaviour is the inner `it`.
  // Matching the leaf title in isolation would report a genuinely-claimed behaviour as contractless.
  const src = `
    describe("rc-scene-honesty-wall: the claim layer never wears bloom vocabulary", () => {
      it("no bloom token anywhere on the claim layer", () => {
        assert.equal(node.kind, "claim");
      });
    });
  `;
  const report = classifyBehaviourClaims({
    unitId: "render-core",
    contractIds: ["rc-scene-honesty-wall"],
    observed: observe(src),
  });
  assert.deepEqual(report.contractless, []);
  assert.equal(report.claimed.length, 1, "the suite claims the leaf; the suite is not itself a behaviour");
  assert.equal(report.claimed[0]?.title, "no bloom token anywhere on the claim layer");
  assert.equal(
    report.claimed[0]?.effectiveTitle,
    "rc-scene-honesty-wall: the claim layer never wears bloom vocabulary / no bloom token anywhere on the claim layer",
  );
});

test("classifyBehaviourClaims: a GROUPING suite is not counted as an asserted behaviour", () => {
  // Counting it would inflate the gap with titles that claim nothing and are not meant to.
  const src = `
    describe("SceneView — the studio scene mapper", () => {
      it("cc-1: paints the parcel", () => { assert.ok(el); });
      it("paints the trail", () => { assert.ok(el); });
    });
  `;
  const report = classifyBehaviourClaims({
    unitId: "u",
    contractIds: ["cc-1"],
    observed: observe(src),
  });
  assert.equal(report.claimed.length + report.contractless.length, 2, "two leaves, not three nodes");
  assert.deepEqual(
    report.contractless.map((b) => b.title),
    ["paints the trail"],
    "the grouping describe is absent from BOTH buckets",
  );
});

test("classifyBehaviourClaims: a hollow or skipped test is no behaviour at all (ADR-0126)", () => {
  const src = `
    test("asserts nothing whatsoever", () => { const x = 1; });
    test("asserts only a constant", () => { assert.ok(true); });
    test.skip("would assert, but never runs", () => { assert.equal(a, b); });
    test("really asserts something", () => { assert.equal(a, b); });
  `;
  const report = classifyBehaviourClaims({ unitId: "u", contractIds: [], observed: observe(src) });
  assert.deepEqual(
    report.contractless.map((b) => b.title),
    ["really asserts something"],
    "a citation cannot rest on a test that asserts nothing or never runs",
  );
});

test("classifyBehaviourClaims: an UNREAD title is reported apart from a missing claim, never merged", () => {
  // The module's two folds point opposite ways: hollowness folds toward covered, readability toward
  // uncovered. Merging them here would over-state the gap by exactly the size of the blind spot.
  const src = `
    test(\`built at \${runtime} — the dynamic half is invisible to a static reader\`, () => {
      assert.equal(a, b);
    });
  `;
  const report = classifyBehaviourClaims({ unitId: "u", contractIds: ["cc-1"], observed: observe(src) });
  assert.deepEqual(report.contractless, [], "an unread title is NOT evidence that no contract claims it");
  assert.equal(report.unreadable.length, 1);
});

test("classifyBehaviourClaims: a duplicate contract id collapses and the FIRST declared match wins", () => {
  const src = `
    test("cc-b: and cc-a are both named here", () => { assert.equal(a, b); });
  `;
  const report = classifyBehaviourClaims({
    unitId: "u",
    contractIds: ["cc-a", "cc-a", "cc-b"],
    observed: observe(src),
  });
  assert.equal(report.claimed.length, 1);
  assert.equal(report.claimed[0]?.contractId, "cc-a", "declared order decides, not title order");
});

test("classifyBehaviourClaims: a capability declaring NO contracts claims none of its surface", () => {
  const src = `test("some real behaviour", () => { assert.equal(a, b); });`;
  const report = classifyBehaviourClaims({ unitId: "u", contractIds: [], observed: observe(src) });
  assert.deepEqual(report.claimed, []);
  assert.equal(report.contractless.length, 1);
});

test("analyzeObservedTests: every observed test carries its enclosing suite titles, outermost first", () => {
  const src = `
    describe("outer", () => {
      describe("inner", () => {
        it("leaf", () => { assert.equal(a, b); });
      });
    });
  `;
  const observed = observe(src);
  const byName = new Map(observed.map((t) => [t.name, t.ancestors]));
  assert.deepEqual(byName.get("outer"), []);
  assert.deepEqual(byName.get("inner"), ["outer"]);
  assert.deepEqual(byName.get("leaf"), ["outer", "inner"]);
});

test("classifyBehaviourClaims: two suites cannot collide into one another's container key", () => {
  // Container detection compares ancestry PATHS, so the key must be injective. A separator-joined
  // key is forgeable by a title containing the separator: here `describe("a | b")` with a leaf under
  // it would share a naive `a|b` key with the nested `describe("a") > describe("b")` pair, and the
  // outer suite of the nested pair would be silently reclassified as a leaf behaviour (or the leaf
  // as a container). Length-prefixing the segments is what rules that out.
  const src = `
    describe("a | b", () => {
      it("flat leaf", () => { assert.equal(x, y); });
    });
    describe("a", () => {
      describe("b", () => {
        it("nested leaf", () => { assert.equal(x, y); });
      });
    });
  `;
  const report = classifyBehaviourClaims({ unitId: "u", contractIds: [], observed: observe(src) });
  assert.deepEqual(
    report.contractless.map((b) => b.title).sort(),
    ["flat leaf", "nested leaf"],
    "exactly the two leaves — no suite promoted to a behaviour, no leaf demoted to a container",
  );
});
