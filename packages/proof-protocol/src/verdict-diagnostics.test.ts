/**
 * DIAGNOSTICS LEG for the verdict refinements (arc `test-strength-beyond-red-green-arc`
 * increment 4, realising ADR-0447 D3).
 *
 * READ THE HONEST HEADLINE FIRST — `proof.ts` scored 71.43% and that number is NOT a weak-validator
 * finding. Every mutant that changes whether a verdict is ACCEPTED OR REJECTED is already killed by
 * `criterion-binding.test.ts` and `shapes.test.ts`. Verified by hand at the head of this increment:
 * the whole-condition mutations on both `Verdict` refinements and on `CriterionVerdict` die today.
 * What survives is exactly two things — the error MESSAGES (cosmetic, left surviving on purpose,
 * baseline §4d) and the issue PATHS. So this file closes a diagnostic-quality gap, not a hole in
 * what the schema lets through, and it is deliberately labelled that way rather than dressed up as
 * the same kind of find as `attestation-binding.test.ts` next door.
 *
 * WHY THE PATHS ARE WORTH PINNING ANYWAY, when the messages are not. They are different classes.
 * A message is human-readable prose and pinning it makes the suite brittle for no fault-detection
 * gain. A `path` is structured, machine-read data that this repo's own renderers consume —
 * `packages/library/src/library-doc.ts` builds its missing-field list from `issue.path`, and
 * `packages/drive/src/uat-drive.ts` puts it into a refusal reason an operator reads. A refinement
 * pointing at the wrong field sends a caller to fix the field they already supplied.
 *
 * AND ONE OF THESE PATHS IS REAL LOGIC, not a constant. `Verdict`'s present-together refinement
 * computes its path as `hasCriterion ? ["revisionId"] : ["criterionId"]` — deliberately naming the
 * ABSENT half of the pair, so the error tells you which field to add. Nothing exercised that
 * ternary in either direction, so inverting it, blanking it, or emptying it to `[]` was invisible.
 * That is the assertion below with the most to say.
 *
 * ⚠ THE INSTRUMENT IS A HAND-WRITTEN TABLE, AND A PROPERTY WOULD BE THE WRONG TOOL HERE.
 * This is increment 2's finding turning up a second time, in a new costume. The subject is a FIXED
 * two-case mapping (criterion present -> point at revisionId; revision present -> point at
 * criterionId), so there is nothing to quantify over — and any property phrased against the
 * schema's own output would derive its expectation from its subject and could never fail. Every
 * expected path below is therefore written out by hand, independent of the code under test.
 * ADR-0447 D3's "additive, never sole proof" cuts both ways: a property is not the default either.
 *
 * THREE SURVIVORS ARE LEFT ALIVE ON PURPOSE, and they are EQUIVALENT MUTANTS rather than gaps —
 * a third class beside the baseline's "real hole" and "cosmetic". In `CriterionVerdict`'s
 * `criterionId === undefined || revisionId === undefined`, replacing `||` with `&&`, and replacing
 * either operand with `false`, all survive. They survive because `Verdict`'s own present-together
 * refinement already runs first, so the mixed states (one id without the other) can never reach
 * `CriterionVerdict` as a SUCCESS — the schema is redundant there by construction. Measured across
 * all four id-presence states, `success` is IDENTICAL for the original and all three mutants; they
 * differ only in whether a SECOND issue is appended at the same path `criterionId`. Killing them
 * would mean asserting a duplicate-diagnostic count, which pins behaviour nobody wants and would go
 * red the moment someone sensibly de-duplicates. Left alive, and recorded, rather than chased.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CriterionVerdict, Verdict } from "./index.js";

const CRITERION = "uatc_0123456789abcdef01234567";
const OTHER_CRITERION = "uatc_aaaaaaaaaaaaaaaaaaaaaaaa";
const REVISION = "uatr1:0123456789abcdef";

/** A well-formed non-criterion verdict — every field valid, so only the refinements can reject. */
const VERDICT = {
  unitId: CRITERION,
  proofMode: "operator-attested" as const,
  outcome: "pass" as const,
  commitSha: "abc123",
  signer: "owner@example.com",
  runId: "run-1",
  evidence: [],
  at: "2026-08-26T00:00:00.000Z",
};

/**
 * The structural shape of a zod result, so this helper can take BOTH `Verdict` and
 * `CriterionVerdict` — which are different `ZodEffects` types and share no named supertype.
 */
type ParseResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly error: { readonly issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey> }> };
    };

/** The issue paths a rejection reports, as dotted strings — the shape a renderer would show. */
function pathsOf(result: ParseResult): string[] {
  assert.equal(result.success, false, "this case must be rejected before its paths mean anything");
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

/**
 * The ternary, in BOTH directions. Each row's expected path is the id that is ABSENT — the field
 * the caller has to supply. A single row would not distinguish the correct ternary from an
 * inverted one, which is exactly why both are here.
 */
test("a half-bound verdict points at the MISSING half of the criterion pair", () => {
  const CASES: ReadonlyArray<{ label: string; doc: Record<string, unknown>; expected: string }> = [
    {
      label: "criterionId supplied, revisionId absent",
      doc: { ...VERDICT, criterionId: CRITERION },
      expected: "revisionId",
    },
    {
      label: "revisionId supplied, criterionId absent",
      doc: { ...VERDICT, unitId: "some-unit", revisionId: REVISION },
      expected: "criterionId",
    },
  ];

  for (const { label, doc, expected } of CASES) {
    assert.deepEqual(
      pathsOf(Verdict.safeParse(doc)),
      [expected],
      `${label}: the error must name the id that is missing, not the one already supplied`,
    );
  }
});

/**
 * The second `Verdict` refinement: a verdict carrying a criterion pair may not name a DIFFERENT
 * unit. Its path is a constant, but nothing asserted it, so `path: []` and `path: [""]` survived.
 */
test("a criterion verdict whose unitId names another criterion points at unitId", () => {
  assert.deepEqual(
    pathsOf(
      Verdict.safeParse({
        ...VERDICT,
        unitId: OTHER_CRITERION,
        criterionId: CRITERION,
        revisionId: REVISION,
      }),
    ),
    ["unitId"],
    "the error must name unitId, the field that disagrees with the bound criterion",
  );
});

/**
 * `CriterionVerdict` over the one state its own refinement is REACHABLE in: a plain verdict
 * carrying neither id, which `Verdict` accepts and `CriterionVerdict` must not. (The mixed states
 * are unreachable as successes — see the header's note on the three equivalent mutants.)
 */
test("a criterion verdict carrying neither id is refused, and points at criterionId", () => {
  const plain = { ...VERDICT, unitId: "some-unit" };

  // CONTROL: plain `Verdict` accepts it. Without this the assertion below would also pass if the
  // doc were malformed for some unrelated reason.
  assert.equal(
    Verdict.safeParse(plain).success,
    true,
    "a legacy/non-criterion verdict remains readable through Verdict",
  );

  assert.deepEqual(pathsOf(CriterionVerdict.safeParse(plain)), ["criterionId"]);
});
