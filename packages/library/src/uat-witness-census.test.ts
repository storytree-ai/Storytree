import test from "node:test";
import assert from "node:assert/strict";

import { censusUatWitnesses, type UatWitnessCensusStory } from "./uat-witness-census.js";
import { canonicalUatCriterionContent, criterionRevisionId } from "./uat-test-criteria.js";

let nextId = 0;
function criterionId(): string {
  nextId += 1;
  return `uatc_${nextId.toString(16).padStart(24, "0")}`;
}

/** Author one criterion item whose `(revision-id:)` binds its own canonical content. */
function item(ordinal: number, prose: string, annotations: string): string {
  const unbound = `${ordinal}. ${prose} ${annotations}`.trimEnd();
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(unbound));
  return `${ordinal}. ${prose} _(criterion-id: ${criterionId()})_ _(revision-id: ${revisionId})_ ${annotations}`.trimEnd();
}

/** The STANDALONE written form — what a grep for `_(witness: x)_` can see. */
function standalone(ordinal: number, witness: string): string {
  return item(ordinal, `**Leg ${ordinal}**: a claim.`, `_(witness: ${witness})_`);
}

/** The FUSED written form — the tag sharing one underscore pair with a detail pointer. */
function fused(ordinal: number, witness: string, storyId: string): string {
  return item(ordinal, `**Leg ${ordinal}**: a claim.`, `_(witness: ${witness})(detail: ${storyId}#uat-${ordinal})_`);
}

function story(storyId: string, ...items: string[]): UatWitnessCensusStory {
  return {
    storyId,
    sourcePath: `stories/${storyId}/story.md`,
    body: `## UAT Test Criteria\n\n${items.join("\n")}\n`,
  };
}

/**
 * The corpus that reproduces the measured defect: human legs written BOTH ways, so a census that
 * only sees the standalone form silently undercounts while looking complete.
 */
function mixedCorpus(): UatWitnessCensusStory[] {
  return [
    story("alpha", standalone(1, "human"), fused(2, "human", "alpha"), standalone(3, "machine")),
    story("beta", fused(1, "human", "beta"), fused(2, "machine", "beta")),
    story("gamma", standalone(1, "either")),
  ];
}

/** The grep-shaped instrument the friction item names: a scan for the standalone literal only. */
function standaloneGrepCount(stories: readonly UatWitnessCensusStory[], witness: string): number {
  const pattern = new RegExp(`_\\(witness: ${witness}\\)_`, "g");
  return stories.reduce((n, s) => n + (s.body.match(pattern) ?? []).length, 0);
}

test("the census counts BOTH written forms of the witness tag", () => {
  const census = censusUatWitnesses(mixedCorpus());
  assert.equal(census.total, 6);
  assert.equal(census.byWitness.human, 3);
  assert.equal(census.byWitness.machine, 2);
  assert.equal(census.byWitness.either, 1);
});

test("the census and the grep DISAGREE, and the grep is the one that undercounts", () => {
  // The non-vacuity control. If the fixture carried only standalone tags both instruments would
  // agree, and this suite would pass while proving nothing — so pin that they genuinely differ,
  // in the direction the defect had (grep < parser), and pin both numbers.
  const stories = mixedCorpus();
  const census = censusUatWitnesses(stories);
  const grep = standaloneGrepCount(stories, "human");

  assert.equal(grep, 1, "the standalone-literal scan sees only the one standalone human leg");
  assert.equal(census.byWitness.human, 3, "the parser sees every human leg, fused or not");
  assert.ok(grep < census.byWitness.human, "the grep undercounts — this is the defect being fixed");
});

test("the story population is counted per witness, not just the leg population", () => {
  // The measured defect got the STORY count wrong too (10 vs 17), so it is counted, not derived.
  const census = censusUatWitnesses(mixedCorpus());
  assert.equal(census.storiesByWitness.human, 2, "alpha and beta hold human legs; gamma does not");
  assert.equal(census.storiesByWitness.machine, 2);
  assert.equal(census.storiesByWitness.either, 1);
  assert.equal(census.storiesWithCriteria, 3);
});

test("every counted leg is attributable to its story and source path", () => {
  const rows = censusUatWitnesses(mixedCorpus()).rows.filter((r) => r.witness === "human");
  assert.deepEqual(
    rows.map((r) => `${r.storyId} ${r.sourcePath}`),
    [
      "alpha stories/alpha/story.md",
      "alpha stories/alpha/story.md",
      "beta stories/beta/story.md",
    ],
  );
});

test("rows are ordered by source path, so a census is reproducible across readers", () => {
  const stories = mixedCorpus();
  const forward = censusUatWitnesses(stories);
  const reversed = censusUatWitnesses([...stories].reverse());
  assert.deepEqual(
    reversed.rows.map((r) => r.criterionId),
    forward.rows.map((r) => r.criterionId),
  );
});

test("a story with no UAT section contributes nothing and does not break the census", () => {
  const stories = [
    ...mixedCorpus(),
    { storyId: "delta", sourcePath: "stories/delta/story.md", body: "# Delta\n\nNo UAT here.\n" },
  ];
  const census = censusUatWitnesses(stories);
  assert.equal(census.total, 6);
  assert.equal(census.storiesWithCriteria, 3);
});

test("an unparseable story is REFUSED, never silently dropped from the count", () => {
  // A census that skipped a story it could not read would under-report exactly like the grep did.
  const broken: UatWitnessCensusStory = {
    storyId: "broken",
    sourcePath: "stories/broken/story.md",
    body: "## UAT Test Criteria\n\n1. **Stale** _(criterion-id: uatc_aaaaaaaaaaaaaaaaaaaaaaaa)_ _(revision-id: uatr1:0000000000000000)_\n",
  };
  assert.throws(() => censusUatWitnesses([...mixedCorpus(), broken]), /stories\/broken\/story\.md/);
});

test("a would-be UAT section is counted separately from proven-intent criteria", () => {
  const wouldBe: UatWitnessCensusStory = {
    storyId: "epsilon",
    sourcePath: "stories/epsilon/story.md",
    body: `## UAT Test Criteria (would-be)\n\n${standalone(1, "human")}\n`,
  };
  const census = censusUatWitnesses([...mixedCorpus(), wouldBe]);
  assert.equal(census.total, 7);
  assert.equal(census.byWitness.human, 4);
  assert.equal(census.wouldBe, 1, "would-be legs are visible, so a reader can exclude them knowingly");
});
