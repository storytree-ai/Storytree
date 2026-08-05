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
  // a named lower-tier node ACTUALLY proves the deleted claim — the ADR says so explicitly, and that
  // adjudication stays human. What IS checkable: a deleted criterion must leave a `superseded` entry
  // that cites the deciding ADR and ACCOUNTS for the claim, so a reader can audit it rather than
  // discovering an unexplained absence.
  //
  // Both halves used to be pinned to ADR-0294 specifically — the only pass that had ever superseded a
  // criterion, and one that always deleted for the same reason (the proof exists one rung down).
  // ADR-0307 D5 supersedes for a genuinely different reason: the leg's SUBJECT is withdrawn (the
  // seed-canonical posture, and the reconciler that implemented it, no longer exist), so there is no
  // lower-tier node to point at and demanding one would force a false citation. So the check now
  // encodes the property rather than one pass's phrasing: cite SOME deciding ADR, and account for the
  // claim in one of the two honest ways. Re-pinning to /ADR-0294|ADR-0307/ would just re-arm the same
  // break for the next pass.
  for (const entry of ledger.dispositions) {
    if (entry.disposition !== "superseded") continue;
    assert.match(
      entry.rationale,
      /ADR-\d{4}/,
      `${entry.legacyTestId}: a superseded disposition must cite the deciding ADR`,
    );
    // Either the proof MOVED (name where it now lives) or the claim was WITHDRAWN (say so). A
    // rationale that does neither leaves the deleted claim unaccounted for.
    const namesWhereProofMoved =
      /proven by the (capability|contract|capabilities)|proven in two places|is proven by/.test(
        entry.rationale,
      );
    const declaresClaimWithdrawn = /withdrawn|retired|no longer exists?/.test(entry.rationale);
    assert.ok(
      namesWhereProofMoved || declaresClaimWithdrawn,
      `${entry.legacyTestId}: a superseded disposition must either NAME the lower-tier node that ` +
        `proves the deleted claim (ADR-0294 D2) or state that the claim itself was withdrawn`,
    );
  }
});
