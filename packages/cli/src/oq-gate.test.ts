import { test } from "node:test";
import assert from "node:assert/strict";

import type { StoredDoc } from "@storytree/base";
import type { NodeSpec } from "@storytree/orchestrator";
import type { Comment } from "@storytree/store";

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
    capabilities: [],
    decisions,
    buildConfig: undefined,
    guidance: undefined,
    uatTests: [],
    file: "s/story.md",
  };
}

const REF_17 = "doc:decisions/0017-cross-cutting-knowledge-tier.md";

// --- classifyOpenQuestions -----------------------------------------------------------------------

test("an OQ with no reference to a deciding ADR is excluded", () => {
  const rows = classifyOpenQuestions([oq("a", ["doc:decisions/0013-x.md", "asset:b"])], [], [17]);
  assert.deepEqual(rows, []);
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
