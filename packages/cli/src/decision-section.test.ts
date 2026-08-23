import assert from "node:assert/strict";
import { test } from "node:test";

import { decisionSection } from "./decision-altitude.js";

// ---------------------------------------------------------------------------
// The `\Z` regression fence
//
// JavaScript has no `\Z` anchor. A section extractor written as
// `/^##\s+Decision[^\n]*\n([\s\S]*?)(?=^##\s|\Z)/mi` compiles its second alternation branch to a
// LITERAL `z`, so every section is cut at its first one. The first draft of this increment did
// exactly that and silently truncated 228 of 416 sections — 30 of them to under 200 characters —
// while still returning plausible prose, which is why nothing about the output looked wrong.
// ---------------------------------------------------------------------------

test("decisionSection: a 'z' inside the prose does NOT terminate the section", () => {
  const body = [
    "## Status",
    "accepted",
    "",
    "## Decision",
    "Operationalize the three proof modes, then normalize the vocabulary.",
    "",
    "## Consequences",
    "Some consequence.",
  ].join("\n");
  const section = decisionSection(body);
  assert.ok(section.includes("normalize the vocabulary"), `truncated at a literal z: ${section}`);
  assert.ok(!section.includes("Some consequence"));
});

test("decisionSection: it stops at the NEXT h2 heading", () => {
  const body = "## Decision\nThe decision prose.\n\n## Consequences\nNot this.";
  assert.equal(decisionSection(body), "The decision prose.");
});

test("decisionSection: an h3 inside the section does not end it", () => {
  const body = "## Decision\nLead.\n\n### D1 — a sub-heading\nMore.\n\n## Consequences\nNo.";
  const section = decisionSection(body);
  assert.ok(section.includes("D1 — a sub-heading"));
  assert.ok(section.includes("More."));
  assert.ok(!section.includes("No."));
});

test("decisionSection: a body with no Decision heading falls back to the WHOLE body", () => {
  // A fallback of "" would hand the classifier an empty string and produce a near-tie verdict that
  // reads as a classification rather than as an absence.
  const body = "Some decision that never used the house headings.";
  assert.equal(decisionSection(body), body);
});

test("decisionSection: a trailing section with no following heading runs to the end", () => {
  const body = "## Context\nWhy.\n\n## Decision\nEverything after here, including a z.";
  assert.equal(decisionSection(body), "Everything after here, including a z.");
});

test("decisionSection: fenced code is removed, so quoted snippets supply no signal words", () => {
  const body = "## Decision\nBefore.\n\n```ts\nconst neverAlwaysMustPackage = 1;\n```\n\nAfter.";
  const section = decisionSection(body);
  assert.ok(!section.includes("neverAlwaysMustPackage"));
  assert.ok(section.includes("Before."));
  assert.ok(section.includes("After."));
});

test("decisionSection: whitespace is collapsed, so formatting cannot move a density score", () => {
  const body = "## Decision\nOne.\n\n\n\n   Two.\n";
  assert.equal(decisionSection(body), "One. Two.");
});

test("decisionSection: the heading match is case- and suffix-tolerant", () => {
  const body = "## decision — the call\nThe prose.\n\n## Consequences\nNo.";
  assert.equal(decisionSection(body), "The prose.");
});
