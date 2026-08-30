import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_NODE_PREFIX,
  adrDocId,
  decisionLabel,
  decisionNodeId,
  decisionNumberOfNodeId,
  isDecisionNodeId,
  parseDecisionPointer,
  renderCombinedNodeId,
  resolveDecisionSpelling,
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

test("decision-pointer-folds-the-legacy-file-spelling-onto-the-row-id: a pre-ADR-0403 read resolves", () => {
  // The exact shape a trace written before the migration records: the agent opened the FILE, so the
  // file path is what the recorder saw. Today that decision is the row `adr-0311`.
  assert.equal(
    resolveDecisionSpelling("doc:decisions/0311-retire-gate-rungs-that-cannot-show-evidence.md"),
    "adr-0311",
  );
  assert.equal(resolveDecisionSpelling("doc:docs/decisions/0311-retire-gate-rungs.md"), "adr-0311");
  assert.equal(resolveDecisionSpelling("asset:adr-0311"), "adr-0311");
  // A Windows-authored path folds too — `parseDecisionPointer` normalises the separator, and a
  // resolver that only handled `/` would leave every trace recorded on this machine unresolved.
  assert.equal(resolveDecisionSpelling("doc:docs\\decisions\\0311-retire.md"), "adr-0311");
  // ALL FOUR LAND ON ONE STRING. That is the property the panel's distinct-artifact count rests on:
  // a trace spanning the migration must not report one decision as two reads.
  assert.equal(
    new Set(
      [
        "doc:decisions/0311-a.md",
        "doc:docs/decisions/0311-a.md",
        "asset:adr-0311",
        "adr-0311",
      ].map(resolveDecisionSpelling),
    ).size,
    1,
  );
});

test("decision-pointer-fold-is-total-and-never-guesses: an unresolvable id is returned untouched", () => {
  // ABSENT IS NOT DEPTH 0. Each of these must come back as itself, so the lookup that follows finds
  // nothing and reports absent — rather than being rounded onto a decision that was never read.
  for (const id of [
    "doc:decisions/no-number-here.md", // a decisions/ file with no four-digit prefix
    "doc:decisions/311-short.md", // three digits — not the log's shape
    "doc:docs/research/bun-runtime-probe-2026-08-22.md", // a research note, not a decision
    "doc:vendor/decisions/0001-foreign.md", // a foreign directory's own numbering
    "doc:decisions/0311-nested/inner.md", // the number is a directory, not the file
    "merge-ceremony", // an ordinary artifact id
    "adr-health-notes", // begins `adr-` and is not a decision
    "story:studio", // a work anchor, outside this graph entirely
    "library artifact", // a CLI token the recorder minted
    "", // the empty string, which no branch may claim
  ]) {
    assert.equal(resolveDecisionSpelling(id), id, `must be returned untouched: ${id}`);
  }
});

test("decision-pointer-fold-is-idempotent: folding an already-folded id changes nothing", () => {
  // The panel folds at two seams (the dedup and the lookup) and a legacy id may pass through both.
  const once = resolveDecisionSpelling("doc:decisions/0403-the-decision-log-moves.md");
  assert.equal(resolveDecisionSpelling(once), once);
  assert.equal(once, adrDocId(403));
});
