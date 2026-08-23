import assert from "node:assert/strict";
import test from "node:test";

import { decisionAmendsResolver } from "./decision-amends-seam.js";

test("decision-amends-seam-never-reads-supersedes: the parameter type performs the exclusion", () => {
  // `AdrMeta`-shaped rows carry both edge types. The resolver's PARAMETER TYPE does not, so the
  // field is unreachable — there is no filtering here for a later edit to forget. This asserts the
  // consequence, since the type-level guard cannot be asserted at runtime.
  // Declared as its own variable rather than inline, so this is a genuine ASSIGNABILITY check —
  // an inline literal would trip TypeScript's excess-property rule and prove something narrower.
  interface AdrShapedShape { number: number; amends: readonly number[]; supersedes: readonly number[] }

  const adrShaped: AdrShapedShape = {
    number: 403,
    amends: [139, 223],
    supersedes: [86],
  };
  const resolver = decisionAmendsResolver([adrShaped]);

  assert.deepEqual([...resolver.amendsOf(403)], [139, 223]);
  assert.equal(Object.keys(resolver).includes("supersedesOf"), false, "no door for it");
});

test("decision-amends-seam-has-no-edge-type-parameter: two verbs, each naming one edge", () => {
  // ADR-0419 D1 added a SECOND support edge, which is the exact moment a shared `edgesOf(n, kind)`
  // would otherwise have been born — and a resolver taking a flag is eventually called with the
  // wrong one. What is asserted is the consequence of the fence, since arity is the only part of a
  // type signature visible at runtime: each verb takes ONE argument, the decision number, so there
  // is no position at which `"supersedes"` could be passed.
  const resolver = decisionAmendsResolver([{ number: 403, amends: [139], dependsOn: ["asset:x"] }]);

  assert.equal(resolver.amendsOf.length, 1, "the decision number, and nothing else");
  assert.equal(resolver.dependsOnOf.length, 1, "the decision number, and nothing else");
  assert.deepEqual(
    Object.entries(resolver)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort(),
    ["amendsOf", "dependsOnOf"],
    "exactly two edge verbs, each named for the one edge it answers",
  );
});

test("decision-amends-seam-carries-dependsOn-and-still-never-reads-supersedes (ADR-0419 D1)", () => {
  // The fence has to survive the second support edge. A row carrying all three fields is handed
  // over whole — assignability is the test, so this is a declared variable rather than a literal —
  // and `supersedes` must be unreachable through EITHER verb, not merely absent from `amendsOf`.
  interface AdrShapedShape {
    number: number;
    amends: readonly number[];
    supersedes: readonly number[];
    dependsOn: readonly string[];
  }

  const adrShaped: AdrShapedShape = {
    number: 419,
    amends: [139],
    supersedes: [86],
    dependsOn: ["doc:decisions/0403-a-title.md", "asset:merge-ceremony"],
  };
  const resolver = decisionAmendsResolver([adrShaped]);

  assert.deepEqual([...resolver.amendsOf(419)], [139]);
  assert.deepEqual(
    [...resolver.dependsOnOf(419)],
    ["doc:decisions/0403-a-title.md", "asset:merge-ceremony"],
    "raw pointers, unparsed — the walk owns resolution, through the one parser",
  );
  // 86 is the superseded decision. It must appear in NEITHER answer, at neither spelling.
  const everything = JSON.stringify([resolver.amendsOf(419), resolver.dependsOnOf(419)]);
  assert.equal(everything.includes("86"), false, "supersedes cannot leak through the new verb");
  assert.equal(Object.keys(resolver).includes("supersedesOf"), false, "still no door for it");
});

test("decision-amends-seam-separates-a-blind-reader-from-an-unwired-log (ADR-0419 D3)", () => {
  // 0 resolvable `dependsOn` edges has two utterly different causes, and on 2026-08-23 BOTH were
  // true at once: zero of 412 rows carried the field, AND the frontmatter-shaped reader has no such
  // field to carry. PRESENCE is counted, so an empty-but-present list still says "this reader can
  // see it" — an edge count alone can never make that distinction.
  const blindReader = decisionAmendsResolver([{ number: 1, amends: [] }, { number: 2, amends: [] }]);
  assert.equal(blindReader.decisionsCarryingDependsOn, 0, "the reader supplies no such field");
  assert.deepEqual([...blindReader.dependsOnOf(1)], [], "and answers empty, rather than throwing");

  const sightedReader = decisionAmendsResolver([
    { number: 1, amends: [], dependsOn: [] },
    { number: 2, amends: [], dependsOn: [] },
  ]);
  assert.equal(sightedReader.decisionsCarryingDependsOn, 2, "read, and genuinely carrying none");
});

test("decision-amends-seam-first-row-wins-WHOLESALE-on-a-duplicate-number", () => {
  // A later row must not contribute a `dependsOn` to an earlier row's `amends`: that would compose
  // a decision no author ever wrote, out of two rows that disagree about which one is current.
  const resolver = decisionAmendsResolver([
    { number: 1, amends: [2] },
    { number: 1, amends: [3], dependsOn: ["doc:decisions/0004-a.md"] },
  ]);

  assert.deepEqual([...resolver.amendsOf(1)], [2]);
  assert.deepEqual([...resolver.dependsOnOf(1)], [], "the losing row's field is not merged in");
  assert.equal(resolver.decisionsCarryingDependsOn, 0, "nor counted toward the denominator");
});

test("decision-amends-seam-copies-its-dependsOn-input: a caller's array cannot mutate the resolver", () => {
  const dependsOn = ["doc:decisions/0002-a.md"];
  const resolver = decisionAmendsResolver([{ number: 1, amends: [], dependsOn }]);
  dependsOn.push("doc:decisions/0003-a.md");

  assert.deepEqual([...resolver.dependsOnOf(1)], ["doc:decisions/0002-a.md"]);
});

test("decision-amends-seam-reports-its-own-denominator: a thin read can never hide", () => {
  // Required rather than convenient: a resolver that answers `amendsOf` for nothing makes a walk
  // report a shallow depth that looks exactly like a corpus whose wiring is shallow.
  const resolver = decisionAmendsResolver([
    { number: 1, amends: [] },
    { number: 2, amends: [1] },
  ]);

  assert.deepEqual([...resolver.decisions].sort((a, b) => a - b), [1, 2]);
  assert.equal(decisionAmendsResolver([]).decisions.length, 0);
});

test("decision-amends-seam-is-total: an unheld decision answers empty rather than throwing", () => {
  // The walk resolves pointers authored by a corpus this resolver did not author, so an unknown
  // number is an expected input, never an exceptional one.
  const resolver = decisionAmendsResolver([{ number: 1, amends: [2] }]);

  assert.deepEqual([...resolver.amendsOf(9999)], []);
});

test("decision-amends-seam-first-row-wins-on-a-duplicate-number", () => {
  // Matching `findDependsOnCycles` and `evaluateDepthFromWork`: re-pointing a number at a later row
  // would silently re-parent everything beneath it.
  const resolver = decisionAmendsResolver([
    { number: 1, amends: [2] },
    { number: 1, amends: [3] },
  ]);

  assert.deepEqual([...resolver.amendsOf(1)], [2]);
  assert.equal(resolver.decisions.length, 1);
});

test("decision-amends-seam-copies-its-input: a caller's array cannot mutate the resolver", () => {
  const amends = [2, 3];
  const resolver = decisionAmendsResolver([{ number: 1, amends }]);
  amends.push(4);

  assert.deepEqual([...resolver.amendsOf(1)], [2, 3]);
});
