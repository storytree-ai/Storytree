import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_NODE_PREFIX,
  decisionLabel,
  decisionNodeId,
  decisionNumberOfNodeId,
  isDecisionNodeId,
  parseDecisionPointer,
  renderCombinedNodeId,
} from "./decision-pointer.js";

test("decision-pointer-resolves-both-live-spellings: the two forms name the same decision", () => {
  const bare = parseDecisionPointer("doc:decisions/0223-the-knowledge-dag-is-an-authored.md");
  const prefixed = parseDecisionPointer("doc:docs/decisions/0223-the-knowledge-dag-is-an-authored.md");

  assert.deepEqual(bare, { number: 223, spelling: "decisions" });
  assert.deepEqual(prefixed, { number: 223, spelling: "docs/decisions" });
  // The whole point of ADR-0403 dec 7: the two spellings must land on ONE node, or a walk resolves
  // half the corpus's pointers and reports a densely-wired graph as a sparse one.
  assert.equal(decisionNodeId(bare!.number), decisionNodeId(prefixed!.number));
});

test("decision-pointer-keeps-the-spelling-rather-than-normalising-it-away: an author's form is reported", () => {
  // Normalising silently would make a regression in EITHER spelling invisible: the count would stay
  // whole while one form quietly stopped resolving.
  assert.notEqual(
    parseDecisionPointer("doc:decisions/0001-a.md")?.spelling,
    parseDecisionPointer("doc:docs/decisions/0001-a.md")?.spelling,
  );
});

test("decision-pointer-folds-windows-separators: a backslash-authored pointer resolves the same", () => {
  assert.deepEqual(parseDecisionPointer("doc:docs\\decisions\\0403-a-title.md"), {
    number: 403,
    spelling: "docs/decisions",
  });
});

test("decision-pointer-refuses-a-foreign-decisions-directory: only OUR two spellings resolve", () => {
  // Anchored at the start of the relative path deliberately: a vendored tree with its own
  // `decisions/` numbering would otherwise collide with the decision log.
  assert.equal(parseDecisionPointer("doc:vendor/decisions/0223-not-ours.md"), null);
  assert.equal(parseDecisionPointer("doc:legacy/docs/decisions/0223-not-ours.md"), null);
});

test("decision-pointer-refuses-a-non-decision-doc-pointer: `doc:` names any repository file", () => {
  assert.equal(parseDecisionPointer("doc:research/a-survey.md"), null);
  assert.equal(parseDecisionPointer("doc:decisions/README.md"), null, "no four-digit number");
  assert.equal(parseDecisionPointer("doc:decisions/0223.md"), null, "no `NNNN-` separator");
  assert.equal(parseDecisionPointer("doc:decisions/0223-a.txt"), null, "not markdown");
  assert.equal(parseDecisionPointer("doc:decisions/nested/0223-a.md"), null, "not directly inside");
  assert.equal(parseDecisionPointer("asset:merge-ceremony"), null, "an artifact pointer");
  assert.equal(parseDecisionPointer("0223-a.md"), null, "no scheme at all");
});

test("decision-pointer-node-id-cannot-collide-with-an-artifact-id: the colon is the guard", () => {
  const id = decisionNodeId(223);
  assert.equal(id, "decision:0223");
  // `asset:` pointers admit `[A-Za-z0-9_-]+` (see `DependsOnRef` in knowledge.ts), so an artifact id
  // can never carry a colon — which is what makes the two id spaces disjoint by construction.
  assert.ok(id.includes(":"), "the namespace separator is what keeps the two id spaces apart");
  assert.equal(/^[A-Za-z0-9_-]+$/.test(id), false, "not a legal artifact id");
  assert.equal(isDecisionNodeId("ADR-0223"), false, "the LABEL form is a legal artifact id, so it is not the node id");
});

test("decision-pointer-round-trips-node-id-and-number: and refuses a malformed one", () => {
  assert.equal(decisionNumberOfNodeId(decisionNodeId(7)), 7);
  assert.equal(decisionNodeId(7), `${DECISION_NODE_PREFIX}0007`);
  assert.equal(isDecisionNodeId(decisionNodeId(7)), true);
  // Strict about the four-digit shape, so a malformed id reads as "not a decision" rather than
  // resolving to NaN and rendering as `ADR-NaN`.
  assert.equal(decisionNumberOfNodeId("decision:oops"), null);
  assert.equal(decisionNumberOfNodeId("decision:7"), null);
  assert.equal(decisionNumberOfNodeId("merge-ceremony"), null);
});

test("decision-pointer-renders-decisions-as-labels-and-artifacts-as-themselves", () => {
  assert.equal(decisionLabel(223), "ADR-0223");
  assert.equal(renderCombinedNodeId(decisionNodeId(223)), "ADR-0223");
  assert.equal(renderCombinedNodeId("merge-ceremony"), "merge-ceremony");
});
