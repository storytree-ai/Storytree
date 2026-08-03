import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Criterion } from "@storytree/model-uat";
import {
  assertPilotMigrationComplete,
  isMigratedCriterion,
  reportPilotMigration,
} from "./pilot-migration-harness.js";
import { PILOT_STORY_IDS } from "./pilot-cast.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PATHS = { repoRoot: REPO_ROOT };

test("harness-asserts-pilot-complete: real corpus + seed pass", () => {
  assert.doesNotThrow(() => assertPilotMigrationComplete(PATHS));
});

test("harness-refuses-silent-model-default: untagged fixture is not migrated", () => {
  const untagged = Criterion.parse({
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:0123456789abcdef",
    title: "Untagged legacy",
    // witness defaults to either
  });
  assert.equal(untagged.witness, "either");
  assert.equal(isMigratedCriterion(untagged), false);
  assert.notEqual(untagged.witness, "model");
});

test("harness-reports-migration-counts: measurement signal", () => {
  const report = reportPilotMigration(PATHS);
  assert.equal(report.stories.length, PILOT_STORY_IDS.length);
  // ADR-0294 (2026-08-03) deletes story-UAT criteria that duplicate lower-tier proof, so the pilot's
  // absolute criterion total is no longer stable and the magic `22` that stood here was retired. The
  // measurement signal this case exists for is the RELATIONSHIP, not the population: every pilot
  // criterion carries a detail pointer, and every criterion is accounted for by exactly one witness
  // bucket. Both survive any number of deletions; a re-pinned total would just break again next pass.
  assert.ok(report.totals.criteria > 0, "the pilot cast still declares criteria");
  assert.equal(report.totals.detailPointers, report.totals.criteria, "full detail-pointer coverage");
  assert.equal(
    (report.totals.byWitness.machine ?? 0) +
      (report.totals.byWitness.human ?? 0) +
      (report.totals.byWitness.model ?? 0),
    report.totals.criteria,
    "every criterion lands in exactly one witness bucket",
  );
  for (const s of report.stories) {
    assert.equal(s.detailCoverage, 1);
    assert.ok(PILOT_STORY_IDS.includes(s.storyId));
  }
});
