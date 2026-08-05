import test from "node:test";
import assert from "node:assert/strict";
import { isStoryAuthorWriteAllowed } from "./story-author-scope.js";

/**
 * story-author's write fence: a pure `(relPath: string) => boolean` predicate that admits the
 * work-hierarchy surface (`stories/**`) and fail-closed denies every foreign path. Offline, no SDK,
 * no store — a pure function over a path string, mirroring the shape `runSpawnWriteScoped`'s
 * `isWriteAllowed` needs.
 *
 * ADR-0209 D5 once widened this fence to a second root — a per-kind seed directory under
 * `apps/studio/data/seed-kinds/`, so story-author could author a criterion and its detail BODY as
 * one atomic pair of file writes. ADR-0307 D5 withdrew the seed-canonical posture: detail bodies are
 * authored into the live store, so the second half of the pair is no longer a file write and the
 * fence has one root again.
 *
 * These tests therefore assert the fence's PROPERTIES — one admitted root, boundary-aware matching,
 * fail-closed on everything else — rather than pinning any particular directory constant. That is
 * deliberate: the previous versions asserted a literal seed path, which is exactly the kind of
 * assertion that has to be rewritten when a decision moves rather than failing on a real regression.
 */

test("scope-admits-stories: the work-hierarchy surface is writable", () => {
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/story.md"), true);
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/some-capability.md"), true);
  // Arbitrarily nested paths under the admitted root are in scope.
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/nested/deeper/notes.md"), true);
});

test("scope-admits-exactly-one-root: no seed/corpus surface is writable any more (ADR-0307 D5)", () => {
  // The retired second root, and its neighbouring kinds on the same layout. A detail body is now a
  // live-store write (`library artifact new|edit … --pg`), never a committed file — so NOTHING under
  // the old per-kind seed root is admitted, including the kind this package owns.
  assert.equal(
    isStoryAuthorWriteAllowed("apps/studio/data/seed-kinds/uat-criterion/demo-story#uat-1.json"),
    false,
  );
  assert.equal(
    isStoryAuthorWriteAllowed("apps/studio/data/seed-kinds/agent/story-author.json"),
    false,
  );
  assert.equal(
    isStoryAuthorWriteAllowed("apps/studio/data/seed-kinds/principle/some-principle.json"),
    false,
  );
});

test("scope-denies-packages-and-foreign-paths: implementation and unrelated surfaces stay closed", () => {
  assert.equal(isStoryAuthorWriteAllowed("packages/uat-criterion/src/story-author-scope.ts"), false);
  assert.equal(isStoryAuthorWriteAllowed("apps/studio/src/components/Foo.tsx"), false);
  // The shared knowledge seed file carries every Library kind — never story-author's surface.
  assert.equal(isStoryAuthorWriteAllowed("apps/studio/data/knowledge.json"), false);
  assert.equal(isStoryAuthorWriteAllowed("docs/decisions/0209-model-uat-promotion.md"), false);
  assert.equal(isStoryAuthorWriteAllowed("README.md"), false);
  assert.equal(isStoryAuthorWriteAllowed("package.json"), false);
});

test("scope-matches-on-path-boundaries: a prefix collision cannot smuggle a write through", () => {
  // "stories-other/" shares a prefix with "stories/" but is a DIFFERENT directory.
  assert.equal(isStoryAuthorWriteAllowed("stories-other/foo.md"), false);
  assert.equal(isStoryAuthorWriteAllowed("my-stories/foo.md"), false);
});

test("scope-is-fail-closed-on-traversal: `..` never escapes the admitted root", () => {
  assert.equal(isStoryAuthorWriteAllowed("stories/../packages/uat-criterion/src/index.ts"), false);
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/../../README.md"), false);
  // Windows-style separators normalise before the check, so traversal is caught either way.
  assert.equal(isStoryAuthorWriteAllowed("stories\\..\\README.md"), false);
});
