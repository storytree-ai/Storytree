import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { KIND_SPECS, type KnowledgeKind } from "@storytree/library";
import { UAT_CRITERION_DETAIL_SEED_DIR } from "@storytree/uat-criterion";
import { parseCriteria, Criterion } from "@storytree/model-uat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertPilotMigrationComplete,
  isMigratedCriterion,
  reportPilotMigration,
  PILOT_STORY_IDS,
} from "./index.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PATHS = { repoRoot: REPO_ROOT };

test("uat-1: Library surface admits the detail kind", () => {
  const kind = "uat-criterion" as KnowledgeKind;
  assert.ok(Object.hasOwn(KIND_SPECS, kind));
  const specs = KIND_SPECS[kind];
  assert.ok(specs.some((s) => s.field === "action" && s.lead === true));
  assert.ok(specs.some((s) => s.field === "successConditions"));
  assert.ok(specs.some((s) => s.field === "evidenceExpectations"));
  assert.equal(
    specs.some((s) => s.field === "title" || s.lead === true && s.field !== "action"),
    false,
  );
  assert.equal(UAT_CRITERION_DETAIL_SEED_DIR, "apps/studio/data/seed-kinds/uat-criterion/");
});

test("uat-2: Zero legacy-unresolved on the three pilots", () => {
  for (const storyId of PILOT_STORY_IDS) {
    const body = readFileSync(join(REPO_ROOT, "stories", storyId, "story.md"), "utf8");
    for (const c of parseCriteria(storyId, body)) {
      assert.notEqual(c.witness, "either", c.criterionId);
      if (c.witness === "model") {
        assert.ok(c.tier === "advanced" || c.tier === "frontier");
      }
    }
  }
});

test("uat-3: Every pilot criterion has a resolvable detail", () => {
  assert.doesNotThrow(() => assertPilotMigrationComplete(PATHS));
});

test("uat-4: Silent model default is refused", () => {
  const untagged = Criterion.parse({
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:0123456789abcdef",
    title: "Legacy",
  });
  assert.equal(untagged.witness, "either");
  assert.equal(isMigratedCriterion(untagged), false);
});

test("uat-5: Migration counts are observable", () => {
  const report = reportPilotMigration(PATHS);
  assert.equal(report.totals.criteria, 22);
  assert.equal(report.totals.detailPointers, 22);
  assert.ok((report.totals.byWitness.machine ?? 0) > 0);
  assert.ok((report.totals.byWitness.human ?? 0) > 0);
});

test("uat-6: Public barrel exports the harness", async () => {
  const mod = await import("@storytree/model-uat-pilot");
  assert.equal(typeof mod.assertPilotMigrationComplete, "function");
  assert.equal(typeof mod.reportPilotMigration, "function");
  assert.equal(typeof mod.isMigratedCriterion, "function");
  assert.deepEqual([...mod.PILOT_STORY_IDS], [...PILOT_STORY_IDS]);
});
