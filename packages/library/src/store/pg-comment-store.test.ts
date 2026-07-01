import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCommentPatch,
  PgCommentStore,
  type Comment,
  type CommentPatch,
} from "./pg-comment-store.js";
// Namespace import so we can probe `normalizeCommentAnchor` at runtime without triggering an
// ESM "does not provide an export named X" SyntaxError at module-evaluation time (the function
// is not yet exported at HEAD; a named-import binding would throw before any test runs).
import * as PgCommentStoreNS from "./pg-comment-store.js";

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

test("bpa-merge-preserves-the-block-anchor: mergeCommentPatch preserves a block anchor across body/resolve edits and does not mutate", () => {
  const blockComment = sampleComment({
    anchor: { kind: "block", blockId: "b-introduction", headingSlug: null, headingText: null, color: null },
  });
  const edited = mergeCommentPatch(blockComment, {
    body: "edited",
    resolved: true,
    resolvedAt: "2026-06-02T00:00:00Z",
  });
  assert.equal(edited.body, "edited", "body patch applied");
  assert.equal(edited.resolved, true, "resolve toggled");
  assert.equal(edited.anchor.kind, "block", "the block anchor kind survives the merge");
  assert.equal(edited.anchor.blockId, "b-introduction", "the blockId survives the merge (anchor is not patchable)");
  assert.equal(blockComment.body, "original", "input is not mutated");
  assert.notEqual(edited, blockComment, "returns a new object");
});

test("bpa-store-constructs-over-the-new-shape: PgCommentStore module imports and constructs from a pool-like object", () => {
  // No SQL is issued by the constructor, so a bare object stands in for a Pool offline.
  const store = new PgCommentStore({} as never);
  assert.ok(store instanceof PgCommentStore);
  assert.equal(typeof store.list, "function");
  assert.equal(typeof store.create, "function");
  assert.equal(typeof store.update, "function");
  assert.equal(typeof store.remove, "function");
});

// ---------------------------------------------------------------------------
// block-position-comment-anchor (cap): normalizeCommentAnchor write boundary
//
// The new anchor model (ADR-0140) drops kind:'text' and the text-span fields
// (quote/prefix/suffix/startOffset), adds kind:'block' + a stable blockId, and
// exposes a normalizeCommentAnchor() function that enforces the canonical shape
// at every write boundary. These tests pin that runtime behaviour.
//
// We access normalizeCommentAnchor via the module namespace rather than a named
// ESM binding: a named import for a not-yet-exported symbol throws
// "does not provide an export named X" at module-evaluation time (wrong-kind red).
// The namespace-property route gives us `undefined` at HEAD, which the helper
// asserts is a function — a clean behaviour-assertion failure (right-kind red).
// ---------------------------------------------------------------------------

/**
 * Locate normalizeCommentAnchor via the module namespace, assert it is callable,
 * then call it.  Fails with an AssertionError at HEAD (the function is not yet
 * exported); passes once the implementation exports it.
 */
function callNormalizeAnchor(raw: unknown): Record<string, unknown> {
  const fn = (PgCommentStoreNS as Record<string, unknown>)["normalizeCommentAnchor"];
  assert.equal(
    typeof fn,
    "function",
    "normalizeCommentAnchor must be exported from pg-comment-store (not yet implemented)",
  );
  return (fn as (r: unknown) => Record<string, unknown>)(raw);
}

test("bpa-block-anchor-is-the-stored-shape: normalizeCommentAnchor returns a block anchor canonical (blockId kept, legacy text-span fields stripped)", () => {
  // A raw incoming anchor that carries both the new blockId AND the legacy text-span
  // fields that the normaliser must strip.
  const canonical = callNormalizeAnchor({
    kind: "block",
    blockId: "b-introduction",
    headingSlug: null,
    headingText: null,
    quote: "some surrounding text", // legacy — must be stripped
    prefix: "before",              // legacy — must be stripped
    suffix: "after",               // legacy — must be stripped
    startOffset: 3,                // legacy — must be stripped
    color: null,
  });

  assert.equal(canonical["kind"], "block", "kind:block is preserved");
  assert.equal(canonical["blockId"], "b-introduction", "blockId is preserved in canonical block anchor");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "quote"),
    "quote must be stripped from a block anchor",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "prefix"),
    "prefix must be stripped from a block anchor",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "suffix"),
    "suffix must be stripped from a block anchor",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "startOffset"),
    "startOffset must be stripped from a block anchor",
  );
});

test("normalizeCommentAnchor: legacy text kind is downgraded to topic and stripped of text-span fields", () => {
  // kind:'text' is the legacy shape that must never reach the store; it is
  // downgraded to the safe 'topic' default (mirrors studio readAnchor precedent).
  const canonical = callNormalizeAnchor({
    kind: "text",
    headingSlug: null,
    headingText: null,
    quote: "a text quote",
    prefix: null,
    suffix: null,
    startOffset: 0,
    color: null,
  });

  assert.equal(canonical["kind"], "topic", "text kind must be downgraded to the safe topic default");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "quote"),
    "quote must be stripped when text kind is downgraded to topic",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "startOffset"),
    "startOffset must be stripped when text kind is downgraded to topic",
  );
});

test("normalizeCommentAnchor: unknown/future kind is downgraded to topic (safe default)", () => {
  const canonical = callNormalizeAnchor({
    kind: "future-unknown-kind",
    headingSlug: null,
    headingText: null,
    color: null,
  });
  assert.equal(
    canonical["kind"],
    "topic",
    "an unknown kind must be downgraded to topic rather than stored as an unfindable locator",
  );
});

test("normalizeCommentAnchor: section kind passes through with headingSlug preserved", () => {
  // section is kept (a heading is a coarse block); the normaliser must not strip it.
  const canonical = callNormalizeAnchor({
    kind: "section",
    headingSlug: "why",
    headingText: "Why",
    color: null,
  });
  assert.equal(canonical["kind"], "section", "section kind is preserved");
  assert.equal(canonical["headingSlug"], "why", "headingSlug is preserved for section anchor");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(canonical, "quote"),
    "quote must not appear on a canonical section anchor",
  );
});
