import test from "node:test";
import assert from "node:assert/strict";

import { searchProse } from "./search-prose.js";

/**
 * The searchable prose of a structured artifact (ADR-0464 D3).
 *
 * This is the half of the ranked-population repair that no tier rule could substitute for: without
 * it the index sees a guardrail's 165-character description and none of its `rule`, `statement`,
 * `enforcedBy` or `failureMode`, and no amount of re-weighting can promote text nobody read.
 *
 * The cases are written against the REAL `KIND_SPECS` table rather than an injected one, because the
 * whole point of reading that table is that a field added to a kind becomes searchable without
 * anyone editing this module. A test that supplied its own spec list would prove the loop works and
 * say nothing about whether it is pointed at the schema.
 */

test("a structured kind yields its section fields, in KIND_SPECS order, blank-line separated", () => {
  const prose = searchProse("guardrail", {
    statement: "The content invariants can never be bypassed.",
    rule: "A gate refuses invalid work, it does not warn.",
    enforcedBy: "The gate is the sole writer of trunk-promotion events.",
    failureMode: "Work that fails its invariants reaches the trunk.",
  });
  // EXACT, including the separator: `guardrail`'s lead field is `statement`, and the order is the
  // table's, not the object literal's — which is what makes this an assertion about the schema.
  assert.equal(
    prose,
    "The content invariants can never be bypassed.\n\n" +
      "A gate refuses invalid work, it does not warn.\n\n" +
      "The gate is the sole writer of trunk-promotion events.\n\n" +
      "Work that fails its invariants reaches the trunk.",
  );
});

test("the fields it harvests are the ones the corpus actually stores prose in", () => {
  // A definition keeps its meaning in `oneLine` / `whatItIs` / `whatItIsNot` and NOTHING in a `body`.
  // Before this module, that meant the definition tier was ranked on its description alone.
  const prose = searchProse("definition", {
    oneLine: "An organ within a story.",
    whatItIs: "Independently viable, proven by integration tests.",
    whatItIsNot: "It no longer carries the UAT.",
  });
  assert.match(prose, /organ within a story/);
  assert.match(prose, /integration tests/);
  assert.match(prose, /no longer carries the UAT/);
});

test("an unknown kind yields NOTHING rather than throwing — the store outlives the binary", () => {
  // `renderBody` throws here on purpose. This must not: it runs over whatever the store holds,
  // including rendered kinds with no spec entry (`template`) and rows a running binary is older
  // than, and one unrecognised row must not take the whole search down. The empty string is what
  // lets the caller fall back to a `body`.
  assert.equal(searchProse("template", { body: "a scaffold" }), "");
  assert.equal(searchProse("no-such-kind", { rule: "x" }), "");
});

test("a REF-LIST field is not prose and never enters the index", () => {
  // `asset:` pointers would make an artifact findable by the ids it cites, so a search for
  // `merge-ceremony` would return each agent that stands on it above the ceremony itself. Edges are
  // extracted separately, where a reader can act on them.
  const prose = searchProse("agent", { role: "The session loop.", standsOn: ["asset:merge-ceremony"] });
  assert.equal(prose, "The session loop.");
});

test("a non-string field is skipped, so structured state never becomes a search term", () => {
  const prose = searchProse("guardrail", { statement: "Real prose.", rule: 7, enforcedBy: null });
  assert.equal(prose, "Real prose.");
});

test("an absent or empty field emits nothing — never a stray separator", () => {
  // The separator is load-bearing for the assertion above: an empty field admitted here would show
  // up as a blank block, which is how a "harmless" empty string turns into a token boundary.
  assert.equal(searchProse("guardrail", { statement: "One.", rule: "", enforcedBy: "Two." }), "One.\n\nTwo.");
  assert.equal(searchProse("guardrail", {}), "");
});
