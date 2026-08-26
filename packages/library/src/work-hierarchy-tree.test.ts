// THE FOLD FROM THE PROJECTION BACK TO A MAP READ (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// The projection carries RAW authored facts (`work-hierarchy-projection.ts`); this is its inverse —
// the READER's rules applied to those facts. The two are a pair, which is why they live and are
// proven together.
//
// WHAT THIS FILE OWNS: that the rules are applied HERE and are not present in the stored data. Every
// case asserts BOTH halves — the raw fact still in the snapshot, and the folded result out of it —
// because a test that only checked the output would pass just as well if the rule had migrated into
// the loader, which is precisely the drift the split exists to prevent.
//
// WHAT IT DOES NOT OWN: agreement with `readTree`. That is a cross-reader claim and cannot be made
// from inside this package — `apps/studio/server/hierarchyLiveRead.test.ts` drives one tree through
// both readers and compares field for field.

import test from "node:test";
import assert from "node:assert/strict";

import { foldWorkHierarchy } from "./work-hierarchy-tree.js";
import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion } from "./uat-test-criteria.js";
import type {
  ProjectedCapability,
  ProjectedStory,
  WorkHierarchySnapshot,
} from "./work-hierarchy-projection.js";

// Fixtures are built as the REAL types rather than asserted into them. The compiler then checks each
// one, so a projection field that changes shape breaks here instead of quietly leaving a test that
// describes a schema nobody uses any more.

function criterion(
  criterionId: string,
  revisionId: string,
  wouldBe = false,
): UatTestCriterion {
  return {
    criterionId,
    revisionId,
    title: `leg ${criterionId}`,
    witness: "machine",
    wouldBe,
  };
}

function gate(id: string, retired: boolean, covers: string[]): ReliabilityGate {
  return {
    id,
    title: `gate ${id}`,
    kind: "observe",
    proofCommand: "pnpm test",
    retired,
    covers,
  };
}

function snapshot(
  stories: ProjectedStory[],
  capabilities: ProjectedCapability[] = [],
): WorkHierarchySnapshot {
  return {
    schemaVersion: 1,
    commitSha: "c",
    storiesTreeSha: "t",
    generatedAt: "2026-08-26T00:00:00.000Z",
    generator: "test",
    stories,
    capabilities,
  };
}

function story(overrides: Partial<ProjectedStory> & { id: string }): ProjectedStory {
  return {
    title: "S",
    outcome: "o",
    status: "building",
    proofMode: "UAT",
    uatWitness: "machine",
    dependsOn: [],
    consumedBy: [],
    decisions: [],
    building: false,
    capabilities: [],
    uatTestCriteria: [],
    reliabilityGates: [],
    ...overrides,
  };
}

function capability(id: string, contractCount: number): ProjectedCapability {
  return {
    id,
    storyId: "s",
    title: id.toUpperCase(),
    outcome: "",
    status: "healthy",
    proofMode: "integration-test",
    dependsOn: [],
    contractCount,
  };
}

test("work-hierarchy-projection-carries-raw-authored-facts — the READER resolves an undeclared witness, and the store still holds null", () => {
  const snap = snapshot([story({ id: "quiet", uatWitness: null })]);
  const folded = foldWorkHierarchy(snap);

  // Both halves. If the fail-closed default ever migrates into the loader, the first assertion breaks
  // — and that migration is what would hand every reader a second, invisible staleness axis.
  assert.equal(snap.stories[0]!.uatWitness, null);
  assert.equal(folded.stories[0]!.uatWitness, "human");
});

test("work-hierarchy-projection-carries-raw-authored-facts — the READER drops would-be criteria, and the store still carries them", () => {
  const snap = snapshot([
    story({
      id: "s",
      uatTestCriteria: [
        criterion("uatc_1", "uatr1:aaa"),
        criterion("uatc_2", "uatr1:bbb", true),
      ],
    }),
  ]);
  const folded = foldWorkHierarchy(snap);

  assert.equal(snap.stories[0]!.uatTestCriteria.length, 2);
  assert.deepEqual(folded.uatCriteriaByStory.get("s"), [
    { criterionId: "uatc_1", revisionId: "uatr1:aaa" },
  ]);
});

test("work-hierarchy-projection-carries-raw-authored-facts — the READER drops retired gates from coverage, and the store still carries them", () => {
  const snap = snapshot([
    story({
      id: "s",
      reliabilityGates: [gate("g1", false, ["cap-a"]), gate("g2", true, ["cap-b"])],
    }),
  ]);
  const folded = foldWorkHierarchy(snap);

  assert.equal(snap.stories[0]!.reliabilityGates.length, 2);
  // ADR-0436: a gate retired in place leaves the coverage set with the obligation union, or a
  // withdrawn gate would still green a capability.
  assert.deepEqual(folded.coverageByStory.get("s"), [{ id: "g1", covers: ["cap-a"] }]);
});

test("work-hierarchy-projection-carries-raw-authored-facts — capabilities render in DECLARATION order, not table order", () => {
  const snap = snapshot(
    [story({ id: "s", capabilities: ["z-cap", "a-cap"] })],
    [capability("a-cap", 1), capability("z-cap", 2)],
  );
  const folded = foldWorkHierarchy(snap);

  // The map draws them in the order the story's frontmatter declares, so a re-ordering is a real
  // difference. Sorting here would silently erase one.
  assert.deepEqual(folded.stories[0]!.capabilities.map((c) => c.id), ["z-cap", "a-cap"]);
  assert.equal(folded.stories[0]!.capabilities[0]!.testCount, 2);
});

test("work-hierarchy-projection-is-total-over-an-unreadable-spec — an error story contributes no obligations", () => {
  const snap = snapshot([
    story({
      id: "broken",
      error: "could not parse",
      uatTestCriteria: [criterion("uatc_1", "uatr1:aaa")],
      reliabilityGates: [gate("g1", false, ["cap-a"])],
    }),
  ]);
  const folded = foldWorkHierarchy(snap);

  // `readTree` collects its three maps inside the `try`, so a throwing spec contributes none. A crown
  // rolled up over criteria nobody could confirm are still authored is a green with no reader.
  assert.equal(folded.stories[0]!.error, "could not parse");
  assert.equal(folded.uatTestCriteriaByStory.has("broken"), false);
  assert.equal(folded.uatCriteriaByStory.has("broken"), false);
  assert.equal(folded.coverageByStory.has("broken"), false);
});

test("work-hierarchy-projection-is-total-over-an-unreadable-spec — a declared capability with no row becomes an error node, never a silent omission", () => {
  const snap = snapshot([story({ id: "s", capabilities: ["ghost"] })], []);
  const folded = foldWorkHierarchy(snap);

  // A story rendering fewer capabilities than it declares is the same class of quiet under-claim this
  // whole arc closes — and one that would be invisible on the map.
  assert.equal(folded.stories[0]!.capabilities.length, 1);
  assert.equal(folded.stories[0]!.capabilities[0]!.id, "ghost");
  assert.match(folded.stories[0]!.capabilities[0]!.error ?? "", /missing from the projection/);
});

test("work-hierarchy-projection-mirrors-the-checkout — the crown obligation set is recorded even when it is empty", () => {
  const snap = snapshot([story({ id: "empty" })]);
  const folded = foldWorkHierarchy(snap);

  // ADR-0443 D2/D3: gating on a non-empty set would skip the crown for exactly the stories D2
  // unblocks — the ones whose every obligation is unsignable — leaving them grey forever.
  assert.equal(folded.uatTestCriteriaByStory.has("empty"), true);
  assert.deepEqual(folded.uatTestCriteriaByStory.get("empty"), []);
});

test("work-hierarchy-projection-mirrors-the-checkout — story order is stable across reads of one snapshot", () => {
  const snap = snapshot([story({ id: "zebra" }), story({ id: "alpha" })]);

  // The store's rows come back from a SELECT with no ORDER BY, which Postgres guarantees nothing
  // about. Without a sort here an island's position in the payload could change between polls for no
  // authored reason.
  assert.deepEqual(foldWorkHierarchy(snap).stories.map((s) => s.id), ["alpha", "zebra"]);
  assert.deepEqual(
    foldWorkHierarchy(snap).stories.map((s) => s.id),
    foldWorkHierarchy(snap).stories.map((s) => s.id),
  );
});
