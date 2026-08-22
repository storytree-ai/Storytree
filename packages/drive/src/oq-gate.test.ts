import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredDoc } from "@storytree/storage-protocol";
import type { NodeSpec } from "@storytree/orchestrator";
import type { Comment } from "@storytree/library/store";

import { classifyOpenQuestions, oqHygieneGate } from "./oq-gate.js";

function oq(id: string, references: string[]): StoredDoc {
  return {
    id,
    kind: "open-question",
    doc: { id, kind: "open-question", title: `title of ${id}`, references },
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
}

function comment(
  topicId: string,
  author: string,
  resolved: boolean,
  createdAt: string,
): Comment {
  return {
    id: `${topicId}-${createdAt}`,
    topicKind: "asset",
    topicId,
    anchor: {
      kind: "topic",
      headingSlug: null,
      headingText: null,
      quote: null,
      prefix: null,
      suffix: null,
      startOffset: null,
      color: null,
    },
    body: "x",
    author,
    createdAt,
    resolved,
    resolvedAt: resolved ? createdAt : null,
  };
}

function story(decisions: number[]): NodeSpec {
  return {
    id: "s",
    tier: "story",
    title: "s",
    outcome: "o",
    status: "proposed",
    proofMode: "UAT",
    uatWitness: undefined,
    story: undefined,
    dependsOn: [],
    consumedBy: [],
    artifactEdges: [],
    capabilities: [],
    decisions,
    buildConfig: undefined,
    guidance: undefined,
    uatTestCriteria: [],
    reliabilityGates: [],
    contracts: [],
    file: "s/story.md",
  };
}

const REF_17 = "doc:decisions/0017-cross-cutting-knowledge-tier.md";
/** The SAME decision, in the corpus's other live spelling (ADR-0403 dec 7). */
const REF_17_REPO_RELATIVE = "doc:docs/decisions/0017-cross-cutting-knowledge-tier.md";

// --- classifyOpenQuestions -----------------------------------------------------------------------

test("an OQ with no reference to a deciding ADR is excluded", () => {
  const rows = classifyOpenQuestions([oq("a", ["doc:decisions/0013-x.md", "asset:b"])], [], [17]);
  assert.deepEqual(rows, []);
});

/**
 * THE FAIL-OPEN REGRESSION GUARD (ADR-0403 dec 7). This gate used to carry its own
 * `/^doc:decisions\/(\d{4})-/`, so an OQ authored with the repo-relative spelling was silently not
 * pulled into the intersection: the gate reported a clean story while having checked less than it
 * claimed. Both spellings must reach the SAME row, and the non-decision `doc:` must still be
 * excluded — a test covering only the majority spelling reproduces the bug it exists to prevent.
 */
test("BOTH live doc: spellings pull the same OQ in, and a non-decision doc: pulls in nothing", () => {
  const bare = classifyOpenQuestions([oq("a", [REF_17])], [], [17]);
  const repoRelative = classifyOpenQuestions([oq("a", [REF_17_REPO_RELATIVE])], [], [17]);
  assert.deepEqual(repoRelative, bare, "the spelling is not what decides whether the gate looks");
  assert.deepEqual(repoRelative[0]?.adrs, [17]);

  const notADecision = classifyOpenQuestions(
    [oq("a", ["doc:research/decision-log-readers-census-2026-08-22.md", "doc:docs/glossary.md"])],
    [],
    [17],
  );
  assert.deepEqual(notADecision, [], "a `doc:` pointer at any other file is not a deciding ADR");
});

test("an OQ citing a deciding ADR repo-relatively is classified, not skipped", () => {
  const rows = classifyOpenQuestions(
    [oq("a", [REF_17_REPO_RELATIVE])],
    [comment("a", "operator", false, "2026-06-12T01:00:00.000Z")],
    [17],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.state, "unprocessed-answer");
});

test("live + an unprocessed answer on a repo-relatively-cited OQ still REFUSES", async () => {
  const out = await oqHygieneGate(story([17]), true, {
    load: () =>
      Promise.resolve({
        openQuestions: [oq("oq-x", [REF_17_REPO_RELATIVE])],
        comments: [comment("oq-x", "operator", false, "2026-06-12T01:00:00.000Z")],
      }),
  });
  assert.notEqual(out.refusal, null, "the gate must not fail open on the other live spelling");
  assert.match(out.refusal!.body, /oq-x/);
});

test("no operator comment -> awaiting-answer", () => {
  const rows = classifyOpenQuestions([oq("a", [REF_17])], [], [17]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.state, "awaiting-answer");
  assert.deepEqual(rows[0]?.adrs, [17]);
});

test("an unresolved operator answer -> unprocessed-answer", () => {
  const rows = classifyOpenQuestions(
    [oq("a", [REF_17])],
    [comment("a", "operator", false, "2026-06-12T01:00:00.000Z")],
    [17],
  );
  assert.equal(rows[0]?.state, "unprocessed-answer");
});

test("all operator answers resolved -> engaged", () => {
  const rows = classifyOpenQuestions(
    [oq("a", [REF_17])],
    [comment("a", "operator", true, "2026-06-12T01:00:00.000Z")],
    [17],
  );
  assert.equal(rows[0]?.state, "engaged");
});

test("a session follow-up AFTER the unresolved answer -> engaged (the unclear-answer path)", () => {
  const rows = classifyOpenQuestions(
    [oq("a", [REF_17])],
    [
      comment("a", "operator", false, "2026-06-12T01:00:00.000Z"),
      comment("a", "session-x", false, "2026-06-12T02:00:00.000Z"),
    ],
    [17],
  );
  assert.equal(rows[0]?.state, "engaged");
});

test("a session comment BEFORE the unresolved answer does not engage it", () => {
  const rows = classifyOpenQuestions(
    [oq("a", [REF_17])],
    [
      comment("a", "session-x", false, "2026-06-12T00:30:00.000Z"),
      comment("a", "operator", false, "2026-06-12T01:00:00.000Z"),
    ],
    [17],
  );
  assert.equal(rows[0]?.state, "unprocessed-answer");
});

// --- oqHygieneGate --------------------------------------------------------------------------------

test("a story with no decisions: nothing to check, never refuses", async () => {
  const out = await oqHygieneGate(story([]), true, {
    load: () => Promise.reject(new Error("must not be called")),
  });
  assert.equal(out.refusal, null);
  assert.match(out.lines.join("\n"), /nothing to check/);
});

test("a dry-run is unchecked and never refuses", async () => {
  const out = await oqHygieneGate(story([17]), false, {
    load: () => Promise.reject(new Error("must not be called")),
  });
  assert.equal(out.refusal, null);
  assert.match(out.lines.join("\n"), /unchecked/);
});

test("live + an unprocessed answer -> REFUSED, naming the OQ and the three paths", async () => {
  const out = await oqHygieneGate(story([17]), true, {
    load: () =>
      Promise.resolve({
        openQuestions: [oq("oq-x", [REF_17])],
        comments: [comment("oq-x", "operator", false, "2026-06-12T01:00:00.000Z")],
      }),
  });
  assert.notEqual(out.refusal, null);
  assert.match(out.refusal!.body, /REFUSED/);
  assert.match(out.refusal!.body, /oq-x/);
  assert.match(out.refusal!.body, /post a follow-up comment/);
});

test("live + only awaiting answers -> WARN lines, no refusal", async () => {
  const out = await oqHygieneGate(story([17]), true, {
    load: () => Promise.resolve({ openQuestions: [oq("oq-x", [REF_17])], comments: [] }),
  });
  assert.equal(out.refusal, null);
  assert.match(out.lines.join("\n"), /WARN/);
  assert.match(out.lines.join("\n"), /oq-x/);
});

test("live + an unreachable store -> UNCHECKED line, never refuses blind", async () => {
  const out = await oqHygieneGate(story([17]), true, {
    load: () => Promise.reject(new Error("connect ECONNREFUSED")),
  });
  assert.equal(out.refusal, null);
  assert.match(out.lines.join("\n"), /UNCHECKED/);
});

test("live + clean state -> a clean line", async () => {
  const out = await oqHygieneGate(story([17]), true, {
    load: () =>
      Promise.resolve({
        openQuestions: [oq("oq-x", [REF_17])],
        comments: [comment("oq-x", "operator", true, "2026-06-12T01:00:00.000Z")],
      }),
  });
  assert.equal(out.refusal, null);
  assert.match(out.lines.join("\n"), /clean/);
});
