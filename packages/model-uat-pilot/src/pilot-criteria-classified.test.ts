import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCriteria } from "@storytree/model-uat";
import { PILOT_STORY_IDS } from "./pilot-cast.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

test("pilot-stories-have-zero-either: every pilot criterion is classified", () => {
  for (const storyId of PILOT_STORY_IDS) {
    const body = readFileSync(join(REPO_ROOT, "stories", storyId, "story.md"), "utf8");
    const criteria = parseCriteria(storyId, body);
    assert.ok(criteria.length > 0, `${storyId} has criteria`);
    for (const c of criteria) {
      assert.notEqual(c.witness, "either", `${c.criterionId} must not be either`);
      assert.ok(
        c.witness === "machine" || c.witness === "model" || c.witness === "human",
        `${c.criterionId} witness=${c.witness}`,
      );
    }
  }
});

test("pilot-model-legs-declare-tier: model floors are explicit; non-model carry none", () => {
  for (const storyId of PILOT_STORY_IDS) {
    const body = readFileSync(join(REPO_ROOT, "stories", storyId, "story.md"), "utf8");
    for (const c of parseCriteria(storyId, body)) {
      if (c.witness === "model") {
        assert.ok(c.tier === "advanced" || c.tier === "frontier", `${c.criterionId} needs tier`);
      } else {
        assert.equal(c.tier, undefined, `${c.criterionId} must not carry tier`);
      }
    }
  }
});

test("pilot-cast-is-exactly-the-three-stories: D8 cast is locked", () => {
  assert.deepEqual([...PILOT_STORY_IDS], [
    "drive-machinery",
    "library-review",
    "library-tech-tree-overlay",
  ]);
});
