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

  // ADR-0294 retired the `>= 282` floor that stood here. That assertion encoded the ADR-0253 cutover
  // moment ("the migrated 282-criterion corpus remains present"), and it was true only while criteria
  // were never deleted. ADR-0294 D2 deletes every criterion whose proof already exists one rung down —
  // deliberately, and targeting roughly 60 — so a population floor would now fail BY DESIGN and is
  // corrected in place (ADR-0139: an accepted record carries no overtaken prose; `git log -p` holds it).
  // What is still load-bearing, and is asserted below, is the part deletion must NOT touch: the cutover
  // LEDGER is frozen at 282 reviewed keys, and a deleted criterion's history becomes `superseded`
  // rather than silently dropped (ADR-0294 Cost/watch; ADR-0253 D4).
  assert.ok(criteria.length > 0, "the disk-canonical corpus still declares UAT criteria");
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

  // ADR-0294 D2's honesty wall, as far as a machine can check it. No mechanical check can verify that
  // the named lower-tier node ACTUALLY proves the deleted claim — the ADR says so explicitly, and that
  // adjudication stays human. What IS checkable: a criterion deleted by that pass must leave a
  // `superseded` entry that NAMES where the proof now lives, so a reader can audit the claim rather
  // than discovering an unexplained absence.
  for (const entry of ledger.dispositions) {
    if (entry.disposition !== "superseded") continue;
    assert.match(
      entry.rationale,
      /ADR-0294/,
      `${entry.legacyTestId}: a superseded disposition must cite the deciding ADR`,
    );
    assert.match(
      entry.rationale,
      /proven by the (capability|contract|capabilities)|proven in two places|is proven by/,
      `${entry.legacyTestId}: a superseded disposition must NAME the lower-tier node that proves the deleted claim (ADR-0294 D2)`,
    );
  }
});
