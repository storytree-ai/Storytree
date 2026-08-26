/**
 * BINDING LEG for `Attestation`'s testId ↔ criterionId rule (arc `test-strength-beyond-red-green-arc`
 * increment 4, realising ADR-0447 D3).
 *
 * WHAT IT CLOSES — a MEASURED hole, re-measured at the head of this increment rather than taken on
 * trust. `attestations.ts` scored 57.14% in the 2026-08-25 baseline
 * (`docs/research/mutation-score-baseline-2026-08-25.md`) and still scored 57.14% here. Its
 * survivors were dominated by the whole refinement being emptied — `BlockStatement -> {}` on the
 * `superRefine` body, and `if (value.testId !== value.criterionId)` -> `if (false)`.
 *
 * VERIFIED BY HAND BEFORE THIS FILE WAS WRITTEN, which is what turned a survivor into a finding:
 * with the refinement emptied, an attestation whose `testId` names a DIFFERENT criterion than its
 * `criterionId` PARSES CLEAN — `success: true` where the real schema returns `success: false`. So
 * the one rule this schema adds over its own base (ADR-0253's exact-criterion binding) had no test
 * that ever fed it a mismatch.
 *
 * WHY THE EXISTING TEST DID NOT COVER IT — `criterion-binding.test.ts` does assert
 * `Attestation.safeParse(base).success === false`, but `base` omits BOTH ids, so it fails on the
 * required fields and the refinement is never reached. A rejection for the wrong reason reads
 * exactly like a rejection for the right one, which is why only mutation found this.
 *
 * WHY IT MATTERS BEYOND THE SCORE — a vouch is keyed by TEST id and never rolls up to a story
 * (ADR-0044 d.2), so a mismatched pair is an attestation filed against the wrong criterion.
 * `StoredAttestation` is the read shape of the append-only log and is a UNION with the legacy
 * positional shape, so the assertion below also pins that the union does not launder a mismatch
 * through its legacy branch. This is the "another organism silently mis-accepts" case the
 * ADR-0068 §3 boundary exists to prevent.
 *
 * ⚠ WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT — this file asserts the issue's `path` and
 * never its `message`. The two are not the same class. A message is human-readable prose, and
 * pinning it makes the suite brittle for no fault-detection gain (baseline §4d), so the blanked
 * message mutants in this file are left surviving ON PURPOSE. A `path` is structured, machine-read
 * data: this repo's own error renderers join it and show it to operators
 * (`packages/library/src/library-doc.ts` builds its missing-field list from `issue.path`;
 * `packages/drive/src/uat-drive.ts` puts it in a refusal reason), so a refinement pointing at the
 * wrong field is a real, user-visible defect.
 *
 * SEED PINNED (ADR-0447 D3). See `criterion-binding.property.test.ts` for why, and for what to do
 * with a counterexample: promote it here as a permanent example and fix the code — never re-roll
 * the seed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { Attestation, StoredAttestation } from "./index.js";

/** Pinned for reproducibility — see the file header. Changing this is a decision, not a fix. */
const SEED = 20260826;

const CRITERION = "uatc_0123456789abcdef01234567";
const OTHER_CRITERION = "uatc_aaaaaaaaaaaaaaaaaaaaaaaa";
const REVISION = "uatr1:0123456789abcdef";

/** Everything an attestation needs EXCEPT the identity fields under test. */
const BASE = {
  outcome: "pass",
  witness: "human",
  signer: "owner@example.com",
  at: "2026-08-26T00:00:00.000Z",
} as const;

/** `fc.hexaString` was removed in fast-check v4; a constantFrom unit is the current spelling. */
const HEX_DIGIT = fc.constantFrom(..."0123456789abcdef".split(""));
const hexOfLength = (n: number) => fc.string({ minLength: n, maxLength: n, unit: HEX_DIGIT });

test("a current attestation whose testId names a DIFFERENT criterion is REFUSED", () => {
  const mismatched = {
    ...BASE,
    testId: OTHER_CRITERION,
    criterionId: CRITERION,
    revisionId: REVISION,
  };

  // The whole point: both ids are individually WELL-FORMED, so nothing but the cross-field
  // refinement can reject this. Emptying that refinement makes this doc parse clean.
  const parsed = Attestation.safeParse(mismatched);
  assert.equal(parsed.success, false, "a testId naming another criterion must not parse");

  // The issue points at the offending FIELD (structured, machine-read — see the header).
  assert.ok(!parsed.success);
  assert.deepEqual(
    parsed.error.issues.map((issue) => issue.path.join(".")),
    ["testId"],
    "the refinement must point a reader at testId, the field that has to change",
  );

  // The read shape of the append-only log must not launder the mismatch through its LEGACY branch.
  // `LegacyAttestation` is strict, so it rejects the two id fields outright; the union therefore
  // has no accepting branch and a mis-filed vouch cannot enter the log by either door.
  assert.equal(
    StoredAttestation.safeParse(mismatched).success,
    false,
    "the stored union must reject a mismatch rather than fall back to the legacy shape",
  );

  // CONTROL, in the other direction: the same doc with the pair agreeing is accepted, so the
  // assertion above is about the BINDING and not about some unrelated field being malformed.
  assert.equal(
    Attestation.safeParse({ ...mismatched, testId: CRITERION }).success,
    true,
    "an attestation whose testId equals its criterionId must parse",
  );
});

/**
 * The all-inputs half. The example above pins one pair; this states the contract over EVERY pair —
 * an attestation parses if and only if its two ids are the same string. It is what would catch a
 * comparison that is merely PARTIAL (a `startsWith`, a prefix compare, a length check), which one
 * hand-picked pair of maximally-different ids cannot distinguish from a correct one.
 *
 * The expectation is computed from the two GENERATED bodies, never read back off the schema, so
 * mutating the schema cannot move it (`an-expectation-derived-from-its-subject-cannot-fail`).
 */
test("an attestation parses exactly when its testId and criterionId are the same id", () => {
  fc.assert(
    fc.property(hexOfLength(24), hexOfLength(24), (a, b) => {
      const doc = {
        ...BASE,
        testId: `uatc_${a}`,
        criterionId: `uatc_${b}`,
        revisionId: REVISION,
      };
      assert.equal(
        Attestation.safeParse(doc).success,
        a === b,
        `expected ${a === b ? "accept" : "reject"} for testId=uatc_${a} criterionId=uatc_${b}`,
      );
    }),
    { seed: SEED, numRuns: 500 },
  );
});
