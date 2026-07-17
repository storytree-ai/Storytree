import test from "node:test";
import assert from "node:assert/strict";
import {
  UAT_CRITERION_DETAIL_KIND,
  UatCriterionDetailRef,
  UatCriterionDetail,
} from "./detail-kind.js";

/**
 * Offline unit tests for the `uat-detail-kind` capability (ADR-0209 D5/D6): a
 * detailed UAT criterion is a structured Library artifact kind whose body carries
 * the proof-bearing fields — action, success conditions, evidence expectations,
 * and optional `asset:` refs to reusable principles/processes — and that must
 * never grow a second, competing display-title authority (the story stays
 * display-canonical, ADR-0209 D6).
 */

const WELL_FORMED = {
  kind: UAT_CRITERION_DETAIL_KIND,
  id: "demo-story#uat-1",
  action: "Run the canonical CLI invocation end-to-end.",
  successConditions: "The command exits 0 and the artifact is written to disk.",
  evidenceExpectations: "Attach the command transcript and the written file's sha256.",
  refs: ["asset:merge-ceremony", "asset:baseline-preservation"],
};

// ── round-trip: a well-formed detail validates ─────────────────────────────

test("detail-kind-round-trips-proof-bearing-body: the kind constant is a non-empty stable string", () => {
  assert.equal(typeof UAT_CRITERION_DETAIL_KIND, "string");
  assert.ok(UAT_CRITERION_DETAIL_KIND.length > 0);
});

test("detail-kind-round-trips-proof-bearing-body: a well-formed detail parses and round-trips", () => {
  const parsed = UatCriterionDetail.parse(WELL_FORMED);
  assert.equal(parsed.kind, UAT_CRITERION_DETAIL_KIND);
  assert.equal(parsed.id, WELL_FORMED.id);
  assert.equal(parsed.action, WELL_FORMED.action);
  assert.equal(parsed.successConditions, WELL_FORMED.successConditions);
  assert.equal(parsed.evidenceExpectations, WELL_FORMED.evidenceExpectations);
  assert.deepEqual(parsed.refs, WELL_FORMED.refs);
});

test("detail-kind-round-trips-proof-bearing-body: optional refs default to [] when omitted", () => {
  const { refs, ...withoutRefs } = WELL_FORMED;
  const parsed = UatCriterionDetail.parse(withoutRefs);
  assert.deepEqual(parsed.refs, []);
});

test("detail-kind-round-trips-proof-bearing-body: an asset: ref is accepted by the shared ref schema", () => {
  assert.ok(UatCriterionDetailRef.safeParse("asset:merge-ceremony").success);
});

test("detail-kind-round-trips-proof-bearing-body: re-parsing the same body is deterministic", () => {
  const first = UatCriterionDetail.parse(WELL_FORMED);
  const second = UatCriterionDetail.parse(WELL_FORMED);
  assert.deepEqual(first, second);
});

// ── refusal: malformed bodies are refused at the boundary ──────────────────

test("detail-kind-refuses-malformed: a wrong kind literal is refused", () => {
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, kind: "something-else" }).success,
    false,
  );
});

test("detail-kind-refuses-malformed: a missing action is refused", () => {
  const { action: _action, ...rest } = WELL_FORMED;
  assert.equal(UatCriterionDetail.safeParse(rest).success, false);
});

test("detail-kind-refuses-malformed: an empty action is refused", () => {
  assert.equal(UatCriterionDetail.safeParse({ ...WELL_FORMED, action: "" }).success, false);
});

test("detail-kind-refuses-malformed: a missing successConditions is refused", () => {
  const { successConditions: _sc, ...rest } = WELL_FORMED;
  assert.equal(UatCriterionDetail.safeParse(rest).success, false);
});

test("detail-kind-refuses-malformed: an empty successConditions is refused", () => {
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, successConditions: "" }).success,
    false,
  );
});

test("detail-kind-refuses-malformed: a missing evidenceExpectations is refused", () => {
  const { evidenceExpectations: _ee, ...rest } = WELL_FORMED;
  assert.equal(UatCriterionDetail.safeParse(rest).success, false);
});

test("detail-kind-refuses-malformed: an empty evidenceExpectations is refused", () => {
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, evidenceExpectations: "" }).success,
    false,
  );
});

test("detail-kind-refuses-malformed: a missing stable id is refused", () => {
  const { id: _id, ...rest } = WELL_FORMED;
  assert.equal(UatCriterionDetail.safeParse(rest).success, false);
});

test("detail-kind-refuses-malformed: an empty stable id is refused", () => {
  assert.equal(UatCriterionDetail.safeParse({ ...WELL_FORMED, id: "" }).success, false);
});

test("detail-kind-refuses-malformed: a ref not shaped asset:<id> is refused", () => {
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, refs: ["doc:some/path.md"] }).success,
    false,
  );
  assert.equal(UatCriterionDetailRef.safeParse("doc:some/path.md").success, false);
});

test("detail-kind-refuses-malformed: an unknown field is refused (strict)", () => {
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, extra: "unexpected" }).success,
    false,
  );
});

test("detail-kind-refuses-malformed: whitespace-only required text fields carry no real content and are refused", () => {
  // A required text field must carry real content (Test creation principles:
  // "real content over existence") — a string of only whitespace satisfies
  // `.min(1)` on length but conveys no actual action/success/evidence text,
  // so the schema must refuse it rather than accept it as present.
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, action: "   " }).success,
    false,
    "a whitespace-only action must be refused",
  );
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, successConditions: "\t\n" }).success,
    false,
    "a whitespace-only successConditions must be refused",
  );
  assert.equal(
    UatCriterionDetail.safeParse({ ...WELL_FORMED, evidenceExpectations: "  " }).success,
    false,
    "a whitespace-only evidenceExpectations must be refused",
  );
});

// ── refusal: the detail is not a second title authority (ADR-0209 D6) ──────

test("detail-kind-refuses-title-redefinition: a competing `title` field is refused", () => {
  const result = UatCriterionDetail.safeParse({
    ...WELL_FORMED,
    title: "A silently redefined display title",
  });
  assert.equal(result.success, false, "the detail schema must not admit a title field");
});

test("detail-kind-refuses-title-redefinition: the parsed shape carries no title-shaped key at all", () => {
  const parsed = UatCriterionDetail.parse(WELL_FORMED);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "title"), false);
  assert.deepEqual(Object.keys(UatCriterionDetail.shape).includes("title"), false);
});
