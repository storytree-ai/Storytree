import test from "node:test";
import assert from "node:assert/strict";
import { Criterion, parseCriteria } from "@storytree/model-uat";
import { UAT_CRITERION_DETAIL_KIND, UatCriterionDetail } from "./detail-kind.js";
import {
  DetailArtifactId,
  CriterionDetailBinding,
  bindDetail,
  displayTitle,
  parseCriterionPointers,
} from "./criterion-pointer.js";

/**
 * Offline unit tests for the `criterion-detail-pointer` capability (ADR-0209 D5/D6):
 * a story criterion points to its detail artifact by id WITHOUT ceding the
 * one-line title. The pointer wraps a `@storytree/model-uat` `Criterion`
 * (unchanged — witness/tier ownership stays there) with a validated detail
 * artifact id; `displayTitle` always reads the criterion's one-liner, never
 * the pointed-at detail body's prose, even when a resolved detail is present.
 */

const STORY = "demo-story";

// ── DetailArtifactId: validated, unknown/empty ids refused ─────────────────

test("DetailArtifactId: a well-formed single-token id is accepted", () => {
  assert.equal(DetailArtifactId.safeParse("demo-story#uat-1").success, true);
});

test("DetailArtifactId: an empty id is refused", () => {
  assert.equal(DetailArtifactId.safeParse("").success, false);
});

test("DetailArtifactId: a whitespace-only id is refused", () => {
  assert.equal(DetailArtifactId.safeParse("   ").success, false);
});

test("DetailArtifactId: a multi-token id is refused (not a single stable id)", () => {
  assert.equal(DetailArtifactId.safeParse("two words").success, false);
});

// ── bindDetail: the binding is validated and pass-through preserves the criterion ──

test("bindDetail: binds a classified criterion to a well-formed detail id", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Decompose", witness: "machine" });
  const binding = bindDetail(criterion, "demo-story#detail-1");
  assert.equal(binding.detailArtifactId, "demo-story#detail-1");
  assert.deepEqual(binding.criterion, criterion);
  assert.equal(CriterionDetailBinding.safeParse(binding).success, true);
});

test("bindDetail: does not move witness/tier ownership out of model-uat — a model criterion's tier passes through unchanged", () => {
  const criterion = Criterion.parse({
    id: "demo-story#uat-2",
    title: "Model judged",
    witness: "model",
    tier: "advanced",
  });
  const binding = bindDetail(criterion, "demo-story#detail-2");
  assert.equal(binding.criterion.witness, "model");
  assert.equal(binding.criterion.tier, "advanced");
});

test("bindDetail: throws for an empty detail artifact id", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Decompose" });
  assert.throws(() => bindDetail(criterion, ""), /detail/i);
});

test("bindDetail: throws for a whitespace-only detail artifact id", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Decompose" });
  assert.throws(() => bindDetail(criterion, "   "), /detail/i);
});

test("bindDetail: throws for a multi-token (malformed) detail artifact id", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Decompose" });
  assert.throws(() => bindDetail(criterion, "not a single id"), /detail/i);
});

test("CriterionDetailBinding: rejects unknown fields (strict)", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Decompose" });
  assert.equal(
    CriterionDetailBinding.safeParse({ criterion, detailArtifactId: "d-1", extra: true }).success,
    false,
  );
});

// ── displayTitle: story stays display-canonical, the detail cannot redefine it ──

test("displayTitle: returns the criterion's one-liner from a bare binding (no resolved detail)", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "The one-line title" });
  const binding = bindDetail(criterion, "demo-story#detail-1");
  assert.equal(displayTitle(binding), "The one-line title");
});

test("displayTitle: still returns the criterion's title even when a resolved detail body is attached", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "The one-line title" });
  const detail = UatCriterionDetail.parse({
    kind: UAT_CRITERION_DETAIL_KIND,
    id: "demo-story#uat-1",
    action: "This is a much longer procedural description of what the walk actually does.",
    successConditions: "A completely different sentence describing success.",
    evidenceExpectations: "Attach a transcript.",
  });
  const title = displayTitle({ criterion, detail });
  assert.equal(title, "The one-line title", "the detail body must never silently redefine the title");
  assert.notEqual(title, detail.action);
  assert.notEqual(title, detail.successConditions);
});

test("displayTitle: deletion check — if the pointer's title-forwarding were removed, this would fail", () => {
  const criterion = Criterion.parse({ id: "demo-story#uat-1", title: "Exact one-liner" });
  assert.equal(displayTitle({ criterion }), "Exact one-liner");
});

// ── parseCriterionPointers: the extended annotation grammar (a `(detail: <id>)` tag) ──

const POINTER_BODY = `## UAT Test Criteria

1. **Untagged, no pointer** _(witness: machine)_: exercises the machine witness with no detail pointer.
2. **Model with pointer** _(witness: model)(tier: advanced)(detail: demo-story#detail-2)_: a model-judged leg pointing at its detail.
3. **Legacy with pointer** _(detail: demo-story#detail-3)_: an untagged-witness legacy leg that still points at a detail.
4. **Detail tag first** _(detail: demo-story#detail-4)(witness: human)_: tag order must not matter.
`;

test("parseCriterionPointers: a criterion with no (detail: ...) tag yields no pointer", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  assert.equal(pointers.some((p) => p.criterion.id === "demo-story#uat-1"), false);
});

test("parseCriterionPointers: exactly the three tagged legs produce pointers", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  assert.equal(pointers.length, 3);
  assert.deepEqual(
    pointers.map((p) => p.criterion.id).sort(),
    ["demo-story#uat-2", "demo-story#uat-3", "demo-story#uat-4"],
  );
});

test("parseCriterionPointers: a model-witness leg's pointer carries its detail id and its tier unchanged", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  const pointer = pointers.find((p) => p.criterion.id === "demo-story#uat-2");
  assert.ok(pointer, "pointer for uat-2 must exist");
  assert.equal(pointer!.detailArtifactId, "demo-story#detail-2");
  assert.equal(pointer!.criterion.witness, "model");
  assert.equal(pointer!.criterion.tier, "advanced");
  assert.equal(displayTitle(pointer!), "Model with pointer");
});

test("parseCriterionPointers: a legacy untagged-witness leg can still carry a detail pointer", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  const pointer = pointers.find((p) => p.criterion.id === "demo-story#uat-3");
  assert.ok(pointer, "pointer for uat-3 must exist");
  assert.equal(pointer!.detailArtifactId, "demo-story#detail-3");
  assert.equal(pointer!.criterion.witness, "either");
});

test("parseCriterionPointers: the (detail: ...) tag parses regardless of tag order", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  const pointer = pointers.find((p) => p.criterion.id === "demo-story#uat-4");
  assert.ok(pointer, "pointer for uat-4 must exist");
  assert.equal(pointer!.detailArtifactId, "demo-story#detail-4");
  assert.equal(pointer!.criterion.witness, "human");
});

test("parseCriterionPointers: every returned pointer validates against CriterionDetailBinding", () => {
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  for (const pointer of pointers) {
    assert.equal(CriterionDetailBinding.safeParse(pointer).success, true);
  }
});

test("parseCriterionPointers: re-parsing the same body is deterministic", () => {
  const first = parseCriterionPointers(STORY, POINTER_BODY);
  const second = parseCriterionPointers(STORY, POINTER_BODY);
  assert.deepEqual(first, second);
});

test("parseCriterionPointers: agrees with parseCriteria on the underlying criterion for a pointed leg", () => {
  const criteria = parseCriteria(STORY, POINTER_BODY);
  const pointers = parseCriterionPointers(STORY, POINTER_BODY);
  const criterion = criteria.find((c) => c.id === "demo-story#uat-2");
  const pointer = pointers.find((p) => p.criterion.id === "demo-story#uat-2");
  assert.deepEqual(pointer!.criterion, criterion);
});

test("parseCriterionPointers: a story with no UAT section yields []", () => {
  assert.deepEqual(parseCriterionPointers(STORY, "# Just a heading\n\nno uat here\n"), []);
});

test("parseCriterionPointers: an empty (detail: ) tag is refused, not silently dropped", () => {
  const body = "## UAT Test Criteria\n\n1. **Bad pointer** _(detail: )_: an empty id must be refused.\n";
  assert.throws(() => parseCriterionPointers(STORY, body), /detail/i);
});

test("parseCriterionPointers: a multi-token (detail: two words) tag is refused", () => {
  const body =
    "## UAT Test Criteria\n\n1. **Bad pointer** _(detail: two words)_: a multi-token id must be refused.\n";
  assert.throws(() => parseCriterionPointers(STORY, body), /detail/i);
});
