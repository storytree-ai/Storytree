import test from "node:test";
import assert from "node:assert/strict";

import { StoryBaselineScope, Verdict, storyBaselineFingerprint, storyBaselineScope } from "./index.js";

/**
 * The story-baseline SHAPE (ADR-0416 D6): what a whole-story pass records about the scope it covered,
 * so "declared later" is computable and expansion can be shown beside a durable green.
 */

test("baseline: the fingerprint is stable under declaration ORDER", () => {
  // Reordering a story's `capabilities:` list is not expansion — the same discipline that keeps
  // moving a UAT item up the list from minting a new revision.
  const a = storyBaselineFingerprint(["cap-b", "cap-a"], ["g2", "g1"]);
  const b = storyBaselineFingerprint(["cap-a", "cap-b"], ["g1", "g2"]);
  assert.equal(a, b);
});

test("baseline: the fingerprint is stable under DUPLICATES", () => {
  assert.equal(
    storyBaselineFingerprint(["cap-a", "cap-a"], ["g1"]),
    storyBaselineFingerprint(["cap-a"], ["g1"]),
  );
});

test("baseline: adding a capability or an obligation MOVES the fingerprint", () => {
  const base = storyBaselineFingerprint(["cap-a"], ["g1"]);
  assert.notEqual(base, storyBaselineFingerprint(["cap-a", "cap-b"], ["g1"]));
  assert.notEqual(base, storyBaselineFingerprint(["cap-a"], ["g1", "g2"]));
});

test("baseline: a capability and an obligation sharing a string cannot swap places unnoticed", () => {
  // The two lists are hashed under distinct labelled sections, so the same id moving from one set to
  // the other is a real change of scope and reads as one.
  assert.notEqual(storyBaselineFingerprint(["x"], []), storyBaselineFingerprint([], ["x"]));
});

test("baseline: the constructor sorts, de-duplicates, and pins a fingerprint its own lists produce", () => {
  const scope = storyBaselineScope(["cap-b", "cap-a", "cap-a"], ["g2", "g1"]);
  assert.deepEqual(scope.capabilityIds, ["cap-a", "cap-b"]);
  assert.deepEqual(scope.obligationIds, ["g1", "g2"]);
  assert.equal(scope.fingerprint, storyBaselineFingerprint(scope.capabilityIds, scope.obligationIds));
});

test("baseline: a hand-built scope whose fingerprint is malformed is REFUSED", () => {
  assert.equal(
    StoryBaselineScope.safeParse({ capabilityIds: [], obligationIds: [], fingerprint: "nope" }).success,
    false,
  );
});

test("baseline: the verdict field is ADDITIVE — a verdict without it round-trips unchanged", () => {
  const base = {
    unitId: "some-story",
    proofMode: "story" as const,
    outcome: "pass" as const,
    commitSha: "abc123",
    signer: "owner@example.com",
    runId: "run-1",
    evidence: [],
    at: "2026-08-25T00:00:00.000Z",
  };
  const parsed = Verdict.parse(base);
  assert.equal(parsed.storyBaseline, undefined);

  const withScope = Verdict.parse({ ...base, storyBaseline: storyBaselineScope(["cap-a"], ["g1"]) });
  assert.deepEqual(withScope.storyBaseline?.capabilityIds, ["cap-a"]);
});
