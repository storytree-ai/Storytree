import test from "node:test";
import assert from "node:assert/strict";
import { UAT_CRITERION_DETAIL_KIND } from "./detail-kind.js";
import {
  isStoryAuthorWriteAllowed,
  LIBRARY_SEED_KIND_ROOT,
  UAT_CRITERION_DETAIL_SEED_DIR,
} from "./story-author-scope.js";

/**
 * story-author's widened write fence (ADR-0209 D5): a pure `(relPath: string) => boolean`
 * predicate that admits the atomic pair — the existing work-hierarchy surface (`stories/**`) and
 * the NEW detail-kind seed surface — and fail-closed denies every other Library kind's seed path
 * plus every foreign (package / app / ADR / unrelated) path. Offline, no SDK, no store — a pure
 * function over a path string, mirroring the shape `runSpawnStoryAuthor`'s `isWriteAllowed` needs.
 *
 * The seed-corpus layout this predicate is fenced against: per-kind subdirectories under a shared
 * root (`LIBRARY_SEED_KIND_ROOT`), one subdirectory per Library kind — `uat-criterion`'s subdir is
 * named FROM the `UAT_CRITERION_DETAIL_KIND` constant (not a disconnected literal), so the fence
 * and the kind schema can never silently drift apart.
 */

test("scope-admits-stories-and-detail-seed: the atomic pair is writable", () => {
  // The existing work-hierarchy surface — preserved.
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/story.md"), true);
  assert.equal(isStoryAuthorWriteAllowed("stories/demo-story/some-capability.md"), true);

  // The detail-kind seed surface — identified by the UAT_CRITERION_DETAIL_KIND constant, not a
  // literal disconnected from the kind schema.
  assert.ok(
    UAT_CRITERION_DETAIL_SEED_DIR.includes(UAT_CRITERION_DETAIL_KIND),
    "the detail-kind seed dir must be built from the detail-kind constant",
  );
  const detailPath = `${UAT_CRITERION_DETAIL_SEED_DIR}demo-story#uat-1.json`;
  assert.equal(isStoryAuthorWriteAllowed(detailPath), true);

  // A nested detail-seed path is admitted too (a subdirectory under the kind's seed dir).
  assert.equal(
    isStoryAuthorWriteAllowed(`${UAT_CRITERION_DETAIL_SEED_DIR}nested/demo-story#uat-2.json`),
    true,
  );
});

test("scope-denies-other-library-kinds: the seed-canonical exception stays narrow", () => {
  // Neighbouring kinds on the SAME corpus file layout (the shared per-kind seed root) must be
  // refused — extending ADR-0055's seed-canonical class to uat-criterion is not a blanket grant.
  assert.equal(isStoryAuthorWriteAllowed(`${LIBRARY_SEED_KIND_ROOT}agent/story-author.json`), false);
  assert.equal(
    isStoryAuthorWriteAllowed(`${LIBRARY_SEED_KIND_ROOT}principle/some-principle.json`),
    false,
  );
  assert.equal(
    isStoryAuthorWriteAllowed(`${LIBRARY_SEED_KIND_ROOT}friction/some-friction.json`),
    false,
  );

  // A prefix-collision on the kind segment must not smuggle a write through (path-boundary, not
  // a naive startsWith): "uat-criterion-extra" is a DIFFERENT kind directory than "uat-criterion".
  assert.equal(
    isStoryAuthorWriteAllowed(`${LIBRARY_SEED_KIND_ROOT}uat-criterion-extra/some-doc.json`),
    false,
  );
});

test("scope-denies-packages-and-foreign-paths: implementation and unrelated surfaces stay closed", () => {
  assert.equal(
    isStoryAuthorWriteAllowed("packages/uat-criterion/src/story-author-scope.ts"),
    false,
  );
  assert.equal(isStoryAuthorWriteAllowed("apps/studio/src/components/Foo.tsx"), false);
  // The shared knowledge seed file itself carries every OTHER kind too — not narrowly the detail
  // surface, so it stays out of scope.
  assert.equal(isStoryAuthorWriteAllowed("apps/studio/data/knowledge.json"), false);
  assert.equal(
    isStoryAuthorWriteAllowed("docs/decisions/0209-model-uat-promotion.md"),
    false,
  );
  assert.equal(isStoryAuthorWriteAllowed("README.md"), false);
  assert.equal(isStoryAuthorWriteAllowed("package.json"), false);

  // A path-boundary trap on the hierarchy prefix itself: "stories-other/" is NOT "stories/".
  assert.equal(isStoryAuthorWriteAllowed("stories-other/foo.md"), false);
});
