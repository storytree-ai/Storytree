import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCommentPatch,
  PgCommentStore,
  type Comment,
  type CommentPatch,
} from "./pg-comment-store.js";

/**
 * Offline: the PURE patch-merge helper + that the module imports without throwing. The live SQL
 * (list/create/update/remove over events.comment*) only runs behind STORYTREE_DB_LIVE === '1' and is
 * verified by the human afterwards.
 */

function sampleComment(over: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    topicKind: "doc",
    topicId: "decisions/0017-...md",
    anchor: {
      kind: "section",
      headingSlug: "why",
      headingText: "Why",
      quote: null,
      prefix: null,
      suffix: null,
      startOffset: null,
      color: null,
    },
    body: "original",
    author: "operator",
    createdAt: "2026-06-01T00:00:00Z",
    resolved: false,
    resolvedAt: null,
    ...over,
  };
}

test("mergeCommentPatch applies present fields and leaves the rest", () => {
  const merged = mergeCommentPatch(sampleComment(), { body: "edited" });
  assert.equal(merged.body, "edited");
  assert.equal(merged.author, "operator", "untouched fields preserved");
  assert.equal(merged.topicId, "decisions/0017-...md");
});

test("mergeCommentPatch never overwrites the id", () => {
  const merged = mergeCommentPatch(sampleComment(), { id: "hacked" } as never);
  assert.equal(merged.id, "c1", "id is fixed");
});

test("mergeCommentPatch ignores undefined but applies explicit null (resolve toggle)", () => {
  const resolved = mergeCommentPatch(sampleComment(), {
    resolved: true,
    resolvedAt: "2026-06-02T00:00:00Z",
  });
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.resolvedAt, "2026-06-02T00:00:00Z");

  // Un-resolving: explicit null IS applied.
  const reopened = mergeCommentPatch(resolved, { resolved: false, resolvedAt: null });
  assert.equal(reopened.resolved, false);
  assert.equal(reopened.resolvedAt, null);

  // Undefined is ignored (no-op patch keeps the existing value). Cast: exactOptionalPropertyTypes
  // forbids assigning `undefined` to the typed field, but a runtime-undefined value can still arrive
  // (e.g. a JSON body with an explicit `"body": undefined` dropped to undefined), and must be ignored.
  const noop = mergeCommentPatch(resolved, { body: undefined } as unknown as CommentPatch);
  assert.equal(noop.body, resolved.body);
});

test("mergeCommentPatch does not mutate the input doc", () => {
  const original = sampleComment();
  const merged = mergeCommentPatch(original, { body: "changed" });
  assert.equal(original.body, "original", "input is not mutated");
  assert.notEqual(merged, original, "returns a new object");
});

test("PgCommentStore module imports and constructs from a pool-like object", () => {
  // No SQL is issued by the constructor, so a bare object stands in for a Pool offline.
  const store = new PgCommentStore({} as never);
  assert.ok(store instanceof PgCommentStore);
  assert.equal(typeof store.list, "function");
  assert.equal(typeof store.create, "function");
  assert.equal(typeof store.update, "function");
  assert.equal(typeof store.remove, "function");
});
