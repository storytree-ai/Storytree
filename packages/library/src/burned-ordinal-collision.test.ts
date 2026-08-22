import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  describeBurnedOrdinalCollisions,
  findBurnedOrdinalCollisions,
  type BurnedOrdinalCollisionStory,
} from "./burned-ordinal-collision.js";
import { LegacyUatDispositionLedger } from "./legacy-uat-disposition.js";
import { canonicalUatCriterionContent, criterionRevisionId } from "./uat-test-criteria.js";

const STORY = "demo-story";

/** An authored UAT item whose `(revision-id:)` binds its own content, as the real parser demands. */
function leg(ordinal: number, prose: string): string {
  const id = `uatc_${ordinal.toString(16).padStart(24, "0")}`;
  const item = `${ordinal}. ${prose}`;
  return `${item} _(criterion-id: ${id})_ _(revision-id: ${criterionRevisionId(canonicalUatCriterionContent(item))})_`;
}

function story(...legs: readonly string[]): BurnedOrdinalCollisionStory[] {
  return [
    {
      storyId: STORY,
      sourcePath: `stories/${STORY}/story.md`,
      body: `## UAT Test Criteria\n\n${legs.join("\n")}\n`,
    },
  ];
}

/** A cutover ledger for `demo-story#uat-1..4`, with the named ordinals deleted (burned). */
function ledgerWithBurned(burned: readonly number[]): LegacyUatDispositionLedger {
  return LegacyUatDispositionLedger.parse({
    version: 1,
    dispositions: [1, 2, 3, 4].map((ordinal) =>
      burned.includes(ordinal)
        ? {
            legacyTestId: `${STORY}#uat-${ordinal}`,
            reviewedAt: "2026-08-03",
            disposition: "superseded",
            rationale: `Deleted by ADR-0294 D2: duplicates lower-tier proof, proven by the capability x-${ordinal}.`,
          }
        : {
            legacyTestId: `${STORY}#uat-${ordinal}`,
            reviewedAt: "2026-08-03",
            disposition: "unresolved",
            rationale: "Unresolved at cutover.",
          },
    ),
  });
}

// ── THE RED FIXTURE ─────────────────────────────────────────────────────────
// This is the exact 2026-08-06 `studio-cloud` incident in miniature, and it is what makes this
// suite worth its wall clock: legs 2 and 3 are deleted, and the survivor that was leg 4 is
// renumbered DOWN onto 2 to close the gap. Every identity-reading rung stays green — the criterion
// id and the revision are carried across untouched, which is precisely why the real pass believed
// the move was free — so if `findBurnedOrdinalCollisions` returns nothing here, it is checking
// nothing, and the corpus sweep below is a false green.

test("a survivor renumbered onto a burned ordinal is REPORTED (the studio-cloud incident)", () => {
  const survivor = leg(2, "**Revoke** _(witness: machine)_: access ends.");
  const collisions = findBurnedOrdinalCollisions(story(leg(1, "**Grant**: works."), survivor), ledgerWithBurned([2, 3]));

  assert.equal(collisions.length, 1, "the leg sitting on burned ordinal 2 is caught");
  const [collision] = collisions;
  assert.equal(collision?.ordinal, 2);
  assert.equal(collision?.legacyTestId, `${STORY}#uat-2`);
  assert.equal(collision?.title, "Revoke");
  assert.equal(collision?.sourcePath, `stories/${STORY}/story.md`);
  // The criterion REPORTED is the live one, not the deleted one the key really denotes — the
  // mis-attribution itself is what a reader has to see to make the repair.
  assert.equal(collision?.criterionId, "uatc_000000000000000000000002");
  assert.match(collision?.burnedRationale ?? "", /ADR-0294 D2/);

  const described = describeBurnedOrdinalCollisions(collisions);
  assert.match(described, /demo-story#uat-2/);
  assert.match(described, /renumber the live leg back/i);
});

test("every burned ordinal a story reuses is reported, not just the first", () => {
  // `drive-machinery` on 2026-08-22: three survivors renumbered down over two burned keys.
  const collisions = findBurnedOrdinalCollisions(
    story(leg(1, "**The REAL build**: green."), leg(2, "**Land it**: merged."), leg(3, "**Dogfood**: used.")),
    ledgerWithBurned([1, 2]),
  );
  assert.deepEqual(collisions.map((collision) => collision.ordinal), [1, 2]);
});

// ── NEGATIVE CONTROLS ───────────────────────────────────────────────────────
// A check that reds on everything is as useless as one that reds on nothing. These pin the three
// shapes that are LEGITIMATE, so a future tightening cannot quietly start failing honest corpora.

test("a survivor left in its cutover position is not a collision", () => {
  // The repaired shape: 2 and 3 are deleted and the GAP IS KEPT, so 4 still denotes leg 4.
  const collisions = findBurnedOrdinalCollisions(
    story(leg(1, "**Grant**: works."), leg(4, "**Revoke** _(witness: machine)_: access ends.")),
    ledgerWithBurned([2, 3]),
  );
  assert.deepEqual(collisions, []);
});

test("an ordinal above every cutover key is a post-cutover leg and is free", () => {
  const collisions = findBurnedOrdinalCollisions(
    story(leg(1, "**Grant**: works."), leg(9, "**New leg**: authored since.")),
    ledgerWithBurned([2, 3, 4]),
  );
  assert.deepEqual(collisions, []);
});

test("`unresolved` and `mapped` keys do not burn their ordinal", () => {
  // `unresolved` is the normal state of a surviving leg — reading it as burned would red the whole
  // corpus. `mapped` names the live criterion that BELONGS at the ordinal.
  const ledger = LegacyUatDispositionLedger.parse({
    version: 1,
    dispositions: [
      {
        legacyTestId: `${STORY}#uat-1`,
        reviewedAt: "2026-08-03",
        disposition: "mapped",
        criterionId: "uatc_000000000000000000000001",
        revisionId: "uatr1:0000000000000001",
        rationale: "Mapped at cutover.",
      },
      {
        legacyTestId: `${STORY}#uat-2`,
        reviewedAt: "2026-08-03",
        disposition: "unresolved",
        rationale: "Unresolved at cutover.",
      },
    ],
  });
  assert.deepEqual(
    findBurnedOrdinalCollisions(story(leg(1, "**Grant**: works."), leg(2, "**Sign in**: works.")), ledger),
    [],
  );
});

test("a story with no UAT section, and a ledger with no burned keys, both report nothing", () => {
  const noSection: BurnedOrdinalCollisionStory[] = [
    { storyId: STORY, sourcePath: `stories/${STORY}/story.md`, body: "# Just a story\n" },
  ];
  assert.deepEqual(findBurnedOrdinalCollisions(noSection, ledgerWithBurned([1, 2, 3, 4])), []);
  assert.deepEqual(findBurnedOrdinalCollisions(story(leg(1, "**Grant**: works.")), ledgerWithBurned([])), []);
});

test("a burned key only burns ITS OWN story's ordinal", () => {
  const ledger = ledgerWithBurned([1]);
  const other: BurnedOrdinalCollisionStory[] = [
    { storyId: "other-story", sourcePath: "stories/other-story/story.md", body: `## UAT Test Criteria\n\n${leg(1, "**Grant**: works.")}\n` },
  ];
  assert.deepEqual(findBurnedOrdinalCollisions(other, ledger), []);
});

// ── THE CORPUS SWEEP ────────────────────────────────────────────────────────

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const storiesDir = path.join(repoRoot, "stories");

test("no live UAT leg in the disk-canonical corpus reuses a burned ledger ordinal", () => {
  const stories = readdirSync(storiesDir)
    .sort()
    .flatMap((storyId): BurnedOrdinalCollisionStory[] => {
      const storyPath = path.join(storiesDir, storyId, "story.md");
      if (!existsSync(storyPath)) return [];
      return [
        { storyId, sourcePath: `stories/${storyId}/story.md`, body: readFileSync(storyPath, "utf8") },
      ];
    });
  assert.ok(stories.length > 0, "the disk-canonical corpus still declares stories");

  const ledger = LegacyUatDispositionLedger.parse(
    JSON.parse(readFileSync(path.join(storiesDir, "uat-legacy-dispositions.json"), "utf8")),
  );
  // Guard the sweep's own reach: if the ledger ever held no superseded key, this test would pass
  // while comparing nothing at all.
  assert.ok(
    ledger.dispositions.some((entry) => entry.disposition === "superseded"),
    "the ledger carries burned keys for this sweep to check against",
  );

  // `equal` on the COUNT, not `deepEqual` on the rows: the described failure already names every
  // colliding story, ordinal, criterion and the rationale the key is already spent on, and a
  // deep-diff of five multi-hundred-character rationales buries it.
  const collisions = findBurnedOrdinalCollisions(stories, ledger);
  assert.equal(collisions.length, 0, describeBurnedOrdinalCollisions(collisions));
});
