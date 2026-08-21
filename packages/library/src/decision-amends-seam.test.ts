import assert from "node:assert/strict";
import test from "node:test";

import { decisionAmendsResolver } from "./decision-amends-seam.js";

test("decision-amends-seam-never-reads-supersedes: the parameter type performs the exclusion", () => {
  // `AdrMeta`-shaped rows carry both edge types. The resolver's PARAMETER TYPE does not, so the
  // field is unreachable — there is no filtering here for a later edit to forget. This asserts the
  // consequence, since the type-level guard cannot be asserted at runtime.
  // Declared as its own variable rather than inline, so this is a genuine ASSIGNABILITY check —
  // an inline literal would trip TypeScript's excess-property rule and prove something narrower.
  const adrShaped: { number: number; amends: readonly number[]; supersedes: readonly number[] } = {
    number: 403,
    amends: [139, 223],
    supersedes: [86],
  };
  const resolver = decisionAmendsResolver([adrShaped]);

  assert.deepEqual([...resolver.amendsOf(403)], [139, 223]);
  assert.equal(Object.keys(resolver).includes("supersedesOf"), false, "one verb, and only one");
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
