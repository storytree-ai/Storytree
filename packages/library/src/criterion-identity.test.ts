import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalUatCriterionContent,
  criterionRevisionId,
  parseUatTestCriteria,
} from "./uat-test-criteria.js";

const A = "uatc_0123456789abcdef01234567";
const B = "uatc_89abcdef0123456701234567";
const C = "uatc_fedcba987654321001234567";

function item(
  ordinal: number,
  criterionId: string,
  prose: string,
  extra = "",
): string {
  const unbound = `${ordinal}. ${prose} ${extra}`.trimEnd();
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(unbound));
  return `${ordinal}. ${prose} _(criterion-id: ${criterionId})_ _(revision-id: ${revisionId})_ ${extra}`.trimEnd();
}

test("authored criterion ids, not ordinals, own identity", () => {
  const body = `## UAT Test Criteria\n\n${item(1, A, "**First** _(witness: human)_: one.")}\n${item(2, B, "**Second** _(witness: machine)_: two.")}`;
  const parsed = parseUatTestCriteria("demo", body);
  assert.deepEqual(parsed.map((criterion) => criterion.criterionId), [A, B]);
});

test("reordering and renumbering change neither identity nor revision", () => {
  const first = item(1, A, "**First** _(witness: human)_: one.");
  const second = item(2, B, "**Second** _(witness: machine)_: two.");
  const before = parseUatTestCriteria("demo", `## UAT Test Criteria\n\n${first}\n${second}`);
  const after = parseUatTestCriteria(
    "demo",
    `## UAT Test Criteria\n\n${second.replace(/^2\./, "7.")}\n${first.replace(/^1\./, "9.")}`,
  );
  assert.deepEqual(
    after.map(({ criterionId, revisionId }) => ({ criterionId, revisionId })),
    before.toReversed().map(({ criterionId, revisionId }) => ({ criterionId, revisionId })),
  );
});

test("a same-claim revision keeps criterionId and advances through previousRevisionId", () => {
  const oldLine = item(1, A, "**Claim** _(witness: human)_: old meaning.");
  const [oldCriterion] = parseUatTestCriteria("demo", `## UAT Test Criteria\n\n${oldLine}`);
  assert.ok(oldCriterion);
  const nextExtra = `_(previous-revision-id: ${oldCriterion.revisionId})_`;
  const nextLine = item(1, A, "**Claim** _(witness: human)_: revised meaning.", nextExtra);
  const [nextCriterion] = parseUatTestCriteria("demo", `## UAT Test Criteria\n\n${nextLine}`);
  assert.ok(nextCriterion);
  assert.equal(nextCriterion.criterionId, oldCriterion.criterionId);
  assert.notEqual(nextCriterion.revisionId, oldCriterion.revisionId);
  assert.equal(nextCriterion.previousRevisionId, oldCriterion.revisionId);
});

test("split, merge, and replacement work carry new ids with explicit lineage", () => {
  const body = `## UAT Test Criteria\n\n${item(1, B, "**Split child**: child.", `_(lineage: split-from ${A})_`)}\n${item(2, C, "**Merged claim**: merged.", `_(lineage: merged-from ${A},${B})_`)}\n${item(3, A, "**Replacement**: replacement.", `_(lineage: replaces ${C})_`)}`;
  const parsed = parseUatTestCriteria("demo", body);
  assert.deepEqual(parsed[0]?.lineage, { kind: "split-from", criterionIds: [A] });
  assert.deepEqual(parsed[1]?.lineage, { kind: "merged-from", criterionIds: [A, B] });
  assert.deepEqual(parsed[2]?.lineage, { kind: "replaces", criterionIds: [C] });
});

test("missing authored identity, duplicate identity, and stale content hash are refused", () => {
  assert.throws(
    () => parseUatTestCriteria("demo", "## UAT Test Criteria\n\n1. **No id**: nope."),
    /criterion-id/i,
  );
  const one = item(1, A, "**One**: one.");
  const two = item(2, A, "**Two**: two.");
  assert.throws(
    () => parseUatTestCriteria("demo", `## UAT Test Criteria\n\n${one}\n${two}`),
    /duplicate criterion-id/i,
  );
  assert.throws(
    () => parseUatTestCriteria("demo", `## UAT Test Criteria\n\n${one.replace("one.", "changed.")}`),
    /revision-id.*content/i,
  );
});
