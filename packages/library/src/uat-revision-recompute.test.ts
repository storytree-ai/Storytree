import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalUatCriterionContent,
  criterionRevisionId,
  parseUatTestCriteria,
  recomputeUatRevisionIds,
} from "./uat-test-criteria.js";

const A = "uatc_0123456789abcdef01234567";
const B = "uatc_89abcdef0123456701234567";

/** Author one criterion item whose `(revision-id:)` correctly binds its own canonical content. */
function bound(ordinal: number, criterionId: string, prose: string, extra = ""): string {
  const unbound = `${ordinal}. ${prose} ${extra}`.trimEnd();
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(unbound));
  return `${ordinal}. ${prose} _(criterion-id: ${criterionId})_ _(revision-id: ${revisionId})_ ${extra}`.trimEnd();
}

function section(...items: string[]): string {
  return `## UAT Test Criteria\n\n${items.join("\n")}\n`;
}

test("a clean story reports no drift and is returned byte-identical", () => {
  const body = section(
    bound(1, A, "**First** _(witness: human)_: one."),
    bound(2, B, "**Second** _(witness: machine)_: two."),
  );
  const result = recomputeUatRevisionIds("demo", body);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.drifted, []);
  assert.equal(result.body, body);
});

test("an edited criterion is reported as drifted, naming authored and expected", () => {
  const original = bound(1, A, "**Claim** _(witness: human)_: the original prose.");
  const authoredRevisionId = /\(revision-id:\s*([^)]*)\)/.exec(original)![1]!.trim();
  // The edit the ceremony actually makes: prose inside the hashed canonical content changes.
  const edited = original.replace("the original prose.", "the revised prose.");
  const body = section(edited, bound(2, B, "**Untouched** _(witness: machine)_: two."));

  // Pre-condition: the drift is real — the parser refuses the whole story until it is recomputed.
  assert.throws(() => parseUatTestCriteria("demo", body), /does not bind current content/);

  const result = recomputeUatRevisionIds("demo", body);
  assert.equal(result.checked, 2);
  assert.equal(result.drifted.length, 1);
  const [drift] = result.drifted;
  assert.equal(drift!.criterionId, A);
  assert.equal(drift!.authoredRevisionId, authoredRevisionId);
  assert.notEqual(drift!.expectedRevisionId, authoredRevisionId);
});

test("the rewrite makes the previously-throwing story parse, and records the superseded revision", () => {
  const original = bound(1, A, "**Claim** _(witness: human)_: the original prose.");
  const authoredRevisionId = /\(revision-id:\s*([^)]*)\)/.exec(original)![1]!.trim();
  const body = section(original.replace("the original prose.", "the revised prose."));

  const result = recomputeUatRevisionIds("demo", body);
  const parsed = parseUatTestCriteria("demo", result.body);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]!.criterionId, A, "identity is authored and immutable — never renumbered");
  assert.equal(parsed[0]!.revisionId, result.drifted[0]!.expectedRevisionId);
  assert.equal(
    parsed[0]!.previousRevisionId,
    authoredRevisionId,
    "the superseded value is recorded as (previous-revision-id:), preserving lineage",
  );
});

test("recomputing is idempotent — a rewritten body reports no further drift", () => {
  const body = section(
    bound(1, A, "**Claim** _(witness: human)_: the original prose.").replace(
      "the original prose.",
      "the revised prose.",
    ),
  );
  const once = recomputeUatRevisionIds("demo", body);
  const twice = recomputeUatRevisionIds("demo", once.body);
  assert.deepEqual(twice.drifted, []);
  assert.equal(twice.body, once.body);
});

test("an existing previous-revision-id is advanced, never duplicated", () => {
  const first = bound(1, A, "**Claim** _(witness: human)_: v1.");
  const firstRevisionId = /\(revision-id:\s*([^)]*)\)/.exec(first)![1]!.trim();
  const second = bound(1, A, "**Claim** _(witness: human)_: v2.", `_(previous-revision-id: ${firstRevisionId})_`);
  const secondRevisionId = /\(revision-id:\s*([^)]*)\)/.exec(second)![1]!.trim();

  const body = section(second.replace("v2.", "v3."));
  const result = recomputeUatRevisionIds("demo", body);
  // A second (previous-revision-id:) annotation would make the parser throw on the duplicate.
  const parsed = parseUatTestCriteria("demo", result.body);
  assert.equal(parsed[0]!.previousRevisionId, secondRevisionId);
  assert.equal((result.body.match(/\(previous-revision-id:/g) ?? []).length, 1);
});

test("a fused annotation run is recomputed like a standalone one", () => {
  // The second written form: the whole annotation run inside one underscore pair (the shape a grep
  // census misses). The recompute must handle it, since it is what the corpus actually contains.
  const prose = "**Claim**: fused annotations.";
  const unbound = `1. ${prose} _(witness: machine)(detail: demo#uat-1)_`;
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(unbound));
  const item = `1. ${prose} _(criterion-id: ${A})(revision-id: ${revisionId})_ _(witness: machine)(detail: demo#uat-1)_`;
  assert.deepEqual(recomputeUatRevisionIds("demo", section(item)).drifted, []);

  const edited = item.replace("fused annotations.", "fused annotations, edited.");
  const result = recomputeUatRevisionIds("demo", section(edited));
  assert.equal(result.drifted.length, 1);
  const parsed = parseUatTestCriteria("demo", result.body);
  assert.equal(parsed[0]!.criterionId, A);
  assert.equal(parsed[0]!.previousRevisionId, revisionId);
  assert.equal(parsed[0]!.witness, "machine");
});

test("a story with no UAT section is inspected and left alone", () => {
  const body = "## Something Else\n\n1. Not a criterion.\n";
  const result = recomputeUatRevisionIds("demo", body);
  assert.equal(result.checked, 0);
  assert.deepEqual(result.drifted, []);
  assert.equal(result.body, body);
});

test("prose outside the criterion list survives the rewrite untouched", () => {
  const original = bound(1, A, "**Claim** _(witness: human)_: the original prose.");
  const body = `# Story\n\nIntro prose.\n\n${section(original.replace("original", "revised"))}\n## After\n\nTrailing prose.\n`;
  const result = recomputeUatRevisionIds("demo", body);
  assert.equal(result.drifted.length, 1);
  assert.match(result.body, /^# Story\n\nIntro prose\./);
  assert.match(result.body, /## After\n\nTrailing prose\.\n$/);
});
