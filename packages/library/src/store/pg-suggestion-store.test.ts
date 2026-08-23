import test from "node:test";
import assert from "node:assert/strict";
import {
  applySuggestionTransition,
  mergeSuggestionPatch,
  PgSuggestionStore,
  SuggestionSchema,
  type Suggestion,
  type SuggestionPatch,
} from "./pg-suggestion-store.js";

/**
 * Offline: the PURE helpers (schema validation, status state machine, patch merge) + that the
 * module imports without throwing. The live SQL (list/create/transition over events.suggestion*)
 * only runs behind STORYTREE_DB_LIVE === '1' and is verified by the human afterwards.
 */

function sampleSuggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "s1",
    topicKind: "doc",
    topicId: "decisions/0140-block-anchor.md",
    block: "b-introduction",
    proposed: "The new replacement text.",
    original: "The original text fragment being replaced.",
    status: "open",
    author: "operator",
    createdAt: "2026-07-01T00:00:00Z",
    decidedBy: null,
    decidedAt: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Schema validation — the write boundary
// ---------------------------------------------------------------------------

test("ses-record-validates-at-the-boundary: SuggestionSchema accepts a valid open suggestion", () => {
  const doc = sampleSuggestion();
  const parsed = SuggestionSchema.parse(doc);
  assert.equal(parsed.id, "s1");
  assert.equal(parsed.status, "open");
  assert.equal(parsed.decidedBy, null);
  assert.equal(parsed.decidedAt, null);
});

test("SuggestionSchema accepts a valid accepted suggestion with decidedBy/decidedAt stamped", () => {
  const doc = sampleSuggestion({
    status: "accepted",
    decidedBy: "operator",
    decidedAt: "2026-07-01T01:00:00Z",
  });
  const parsed = SuggestionSchema.parse(doc);
  assert.equal(parsed.status, "accepted");
  assert.equal(parsed.decidedBy, "operator");
  assert.equal(parsed.decidedAt, "2026-07-01T01:00:00Z");
});

test("SuggestionSchema refuses a blank author", () => {
  assert.throws(
    () => SuggestionSchema.parse(sampleSuggestion({ author: "" })),
    /author|string/i,
    "blank author must be refused at the write boundary",
  );
});

test("SuggestionSchema refuses an unknown status (e.g. merged)", () => {
  assert.throws(
    () => SuggestionSchema.parse({ ...sampleSuggestion(), status: "merged" }),
    /invalid_enum_value|status|merged/i,
    "unknown status must be refused at the write boundary",
  );
});

test("SuggestionSchema refuses a blank proposed field", () => {
  assert.throws(
    () => SuggestionSchema.parse(sampleSuggestion({ proposed: "" })),
    /proposed|string/i,
    "blank proposed must be refused at the write boundary",
  );
});

test("SuggestionSchema refuses a blank block handle", () => {
  assert.throws(
    () => SuggestionSchema.parse(sampleSuggestion({ block: "" })),
    /block|string/i,
    "blank block handle must be refused at the write boundary",
  );
});

// ---------------------------------------------------------------------------
// applySuggestionTransition — the pure status state machine
// ---------------------------------------------------------------------------

test("ses-open-transitions-to-accepted-or-rejected: applySuggestionTransition open→accepted stamps decidedBy and decidedAt", () => {
  const open = sampleSuggestion({ status: "open" });
  const result = applySuggestionTransition(open, "accept", "admin-user", "2026-07-01T02:00:00Z");
  assert.equal(result.status, "accepted", "status transitions to accepted");
  assert.equal(result.decidedBy, "admin-user", "decidedBy is stamped");
  assert.equal(result.decidedAt, "2026-07-01T02:00:00Z", "decidedAt is stamped");
  // The rest of the suggestion is unchanged
  assert.equal(result.proposed, open.proposed);
  assert.equal(result.original, open.original);
  assert.equal(result.block, open.block);
  assert.equal(result.author, open.author);
});

test("applySuggestionTransition open→rejected stamps decidedBy and decidedAt", () => {
  const open = sampleSuggestion({ status: "open" });
  const result = applySuggestionTransition(open, "reject", "admin-user", "2026-07-01T02:00:00Z");
  assert.equal(result.status, "rejected", "status transitions to rejected");
  assert.equal(result.decidedBy, "admin-user", "decidedBy is stamped");
  assert.equal(result.decidedAt, "2026-07-01T02:00:00Z", "decidedAt is stamped");
});

test("ses-closed-suggestion-cannot-be-re-decided: applySuggestionTransition refuses re-deciding an accepted suggestion", () => {
  const accepted = sampleSuggestion({
    status: "accepted",
    decidedBy: "admin-user",
    decidedAt: "2026-07-01T01:00:00Z",
  });
  assert.throws(
    () => applySuggestionTransition(accepted, "reject", "other-user", "2026-07-01T02:00:00Z"),
    /closed|already|accepted|decided/i,
    "re-deciding a closed accepted suggestion must throw",
  );
});

test("applySuggestionTransition refuses re-deciding a rejected suggestion", () => {
  const rejected = sampleSuggestion({
    status: "rejected",
    decidedBy: "admin-user",
    decidedAt: "2026-07-01T01:00:00Z",
  });
  assert.throws(
    () => applySuggestionTransition(rejected, "accept", "other-user", "2026-07-01T02:00:00Z"),
    /closed|already|rejected|decided/i,
    "re-deciding a closed rejected suggestion must throw",
  );
});

test("applySuggestionTransition does not mutate the input suggestion", () => {
  const open = sampleSuggestion({ status: "open" });
  const statusBefore = open.status;
  applySuggestionTransition(open, "accept", "admin-user", "2026-07-01T02:00:00Z");
  assert.equal(open.status, statusBefore, "input suggestion is not mutated");
});

// ---------------------------------------------------------------------------
// mergeSuggestionPatch — the pure patch-merge helper
// ---------------------------------------------------------------------------

test("ses-merge-and-store-surface: mergeSuggestionPatch applies present fields and leaves the rest", () => {
  const suggestion = sampleSuggestion();
  const patched = mergeSuggestionPatch(suggestion, { proposed: "New replacement." });
  assert.equal(patched.proposed, "New replacement.", "proposed field updated");
  assert.equal(patched.author, "operator", "untouched fields preserved");
  assert.equal(patched.topicId, "decisions/0140-block-anchor.md");
});

test("mergeSuggestionPatch never overwrites the id", () => {
  const suggestion = sampleSuggestion();
  const patched = mergeSuggestionPatch(suggestion, { id: "hacked" } as never);
  assert.equal(patched.id, "s1", "id is fixed and cannot be patched");
});

test("mergeSuggestionPatch ignores undefined but applies explicit null", () => {
  const accepted = sampleSuggestion({
    status: "accepted",
    decidedBy: "admin-user",
    decidedAt: "2026-07-01T01:00:00Z",
  });
  // Explicit null is applied.
  const reopened = mergeSuggestionPatch(accepted, { decidedBy: null, decidedAt: null });
  assert.equal(reopened.decidedBy, null, "explicit null for decidedBy is applied");
  assert.equal(reopened.decidedAt, null, "explicit null for decidedAt is applied");

  // Undefined is ignored (no-op patch keeps the existing value).
  // See `pg-comment-store.test.ts` — an explicit `undefined` the type system forbids and the
  // merge is specified to ignore.
  const explicitUndefined: Record<string, unknown> = {};
  explicitUndefined["proposed"] = undefined;
  const noop = mergeSuggestionPatch(accepted, explicitUndefined as SuggestionPatch);
  assert.equal(noop.proposed, accepted.proposed, "undefined field is ignored");
});

test("mergeSuggestionPatch does not mutate the input suggestion", () => {
  const original = sampleSuggestion();
  const patched = mergeSuggestionPatch(original, { proposed: "changed" });
  assert.equal(original.proposed, "The new replacement text.", "input is not mutated");
  assert.notEqual(patched, original, "returns a new object");
});

// ---------------------------------------------------------------------------
// PgSuggestionStore — store construction (offline: no SQL issued by constructor)
// ---------------------------------------------------------------------------

test("PgSuggestionStore module imports and constructs from a pool-like object", () => {
  // No SQL is issued by the constructor, so a bare object stands in for a Pool offline.
  const store = new PgSuggestionStore({} as never);
  assert.ok(store instanceof PgSuggestionStore);
  assert.equal(typeof store.list, "function");
  assert.equal(typeof store.create, "function");
  assert.equal(typeof store.transition, "function");
});
