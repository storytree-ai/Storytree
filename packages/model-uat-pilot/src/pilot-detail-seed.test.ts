import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCriteria } from "@storytree/model-uat";
import { parseCriterionPointers, DetailArtifactId } from "@storytree/uat-criterion";
import { PILOT_STORY_IDS } from "./pilot-cast.js";

/**
 * Detail-pointer coverage over the three pilot stories.
 *
 * Two of these tests used to open each detail BODY from the committed seed directory
 * (`apps/studio/data/seed-kinds/uat-criterion/`) and re-validate it. ADR-0307 D5 retired that
 * directory — the tier is live-canonical, so a body lives only in the shared store. Rather than
 * putting a database behind `pnpm -r test` (hermetic by design), each is re-expressed as the
 * property it was actually protecting, asserted against what a story file can honestly witness:
 *
 *   - "seed bodies are real" was really *every criterion points at a well-formed, unique detail id*.
 *     The body's existence is a live-store question and does not belong in a package unit test.
 *   - "story stays display-canonical" was really *the story owns the one-line title and the detail
 *     never supplies one*. `displayTitle()` ignores its detail argument entirely, so loading a body
 *     never tested that; the real fence is the detail schema's refusal of a `title` field, pinned in
 *     `@storytree/uat-criterion`'s own detail-kind.test.ts. What this file can still witness is that
 *     the story-side title is present and non-empty on every pointing criterion.
 */

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function storyBody(storyId: string): string {
  return readFileSync(join(REPO_ROOT, "stories", storyId, "story.md"), "utf8");
}

test("every-pilot-criterion-has-detail-pointer: full coverage", () => {
  for (const storyId of PILOT_STORY_IDS) {
    const body = storyBody(storyId);
    const criteria = parseCriteria(storyId, body);
    const pointers = parseCriterionPointers(storyId, body);
    assert.equal(pointers.length, criteria.length, `${storyId} pointer coverage`);
  }
});

test("every-pilot-detail-pointer-is-well-formed-and-unique", () => {
  for (const storyId of PILOT_STORY_IDS) {
    const seen = new Set<string>();
    for (const binding of parseCriterionPointers(storyId, storyBody(storyId))) {
      const parsed = DetailArtifactId.safeParse(binding.detailArtifactId);
      assert.ok(
        parsed.success,
        `${storyId}: malformed detail pointer "${binding.detailArtifactId}"`,
      );
      assert.equal(
        seen.has(binding.detailArtifactId),
        false,
        `${storyId}: two criteria point at the same detail id "${binding.detailArtifactId}"`,
      );
      seen.add(binding.detailArtifactId);
    }
  }
});

test("detail-does-not-redefine-title: the story supplies every one-liner", () => {
  for (const storyId of PILOT_STORY_IDS) {
    for (const binding of parseCriterionPointers(storyId, storyBody(storyId))) {
      assert.equal(
        typeof binding.criterion.title,
        "string",
        `${storyId}: ${binding.criterion.criterionId} must carry a story-owned title`,
      );
      assert.ok(
        binding.criterion.title.trim().length > 0,
        `${storyId}: ${binding.criterion.criterionId} has an empty story-owned title`,
      );
    }
  }
});
