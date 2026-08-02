import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { LegacyUatDispositionLedger } from "./legacy-uat-disposition.js";
import { parseUatTestCriteria } from "./uat-test-criteria.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const storiesDir = path.join(repoRoot, "stories");

test("disk-canonical UAT corpus has authored exact identities and a complete explicit cutover ledger", () => {
  const criteria = readdirSync(storiesDir)
    .sort()
    .flatMap((storyId) => {
      const storyPath = path.join(storiesDir, storyId, "story.md");
      if (!existsSync(storyPath)) return [];
      return parseUatTestCriteria(storyId, readFileSync(storyPath, "utf8"));
    });

  assert.ok(criteria.length >= 282, "the migrated 282-criterion cutover corpus remains present");
  assert.equal(
    new Set(criteria.map((criterion) => criterion.criterionId)).size,
    criteria.length,
    "authored criterion ids are globally unique",
  );

  const ledger = LegacyUatDispositionLedger.parse(
    JSON.parse(readFileSync(path.join(storiesDir, "uat-legacy-dispositions.json"), "utf8")),
  );
  assert.equal(ledger.dispositions.length, 282, "every positional key present at cutover was reviewed");
  assert.equal(
    new Set(ledger.dispositions.map((entry) => entry.legacyTestId)).size,
    ledger.dispositions.length,
  );
  assert.ok(
    ledger.dispositions.every(
      (entry) =>
        entry.rationale.trim().length > 0 &&
        (entry.disposition === "mapped" ||
          entry.disposition === "superseded" ||
          entry.disposition === "unresolved"),
    ),
    "every legacy key has an explicit, reviewable disposition",
  );
});
