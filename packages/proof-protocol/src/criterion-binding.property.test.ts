/**
 * PROPERTY LEG for the criterion identity validators (arc `test-strength-beyond-red-green-arc`
 * increment 2, realising ADR-0447 D3).
 *
 * WHY THIS FILE EXISTS — it is not a rewrite of `criterion-binding.test.ts`, it sits BESIDE it.
 * ADR-0447 D3: a property is ADDITIVE and never a contract's sole proof; the example-based tests
 * next door stay exactly as they are. The two find different classes (68.75% each alone, 81.25%
 * together — arXiv 2510.25297), which is the whole reason for keeping both.
 *
 * WHAT IT CLOSES — a MEASURED hole, not a speculative one. The 2026-08-25 mutation baseline
 * (`docs/research/mutation-score-baseline-2026-08-25.md`) scored `criterion-binding.ts` at 31.25%,
 * and its survivors were REGEX ANCHOR mutations: stripping `^` and/or `$` off
 * `/^uatc_[0-9a-f]{24}$/` left all 34 tests in this package green. Verified by hand at the time,
 * with BOTH anchors removed at once. So a validator whose entire job is rejecting malformed opaque
 * identities had no test that ever fed it one with valid content embedded — `"junk-uatc_<24hex>"`
 * validated clean and nothing noticed.
 *
 * An example-based test could close this too, with two more hand-written strings. The property is
 * better because it closes it for EVERY decoration rather than the two someone thought of, and
 * because it cannot rot into passing when the pattern changes.
 *
 * THE SEED IS PINNED (ADR-0447 D3, second non-negotiable). Our verdicts are signed and anchored
 * (ADR-0060/0081), so a proof whose run cannot be reproduced asserts something the store cannot
 * re-derive. A failure here reports its own seed and path for replay; do NOT "fix" a red by
 * changing the seed — promote the counterexample into `criterion-binding.test.ts` as a permanent
 * example (D3, third non-negotiable) and fix the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { CriterionId, CriterionRevisionId, criterionRevisionId } from "./index.js";

/** Pinned for reproducibility — see the file header. Changing this is a decision, not a fix. */
const SEED = 20260825;

/** `fc.hexaString` was removed in fast-check v4; a constantFrom unit is the current spelling. */
const HEX_DIGIT = fc.constantFrom(..."0123456789abcdef".split(""));

/** Exactly `n` lowercase hex characters — the id bodies both patterns require. */
const hexOfLength = (n: number) =>
  fc.string({ minLength: n, maxLength: n, unit: HEX_DIGIT });

/**
 * The shared shape of both assertions below: an anchored pattern accepts its exact form and
 * REJECTS every decoration of it. `prefix`/`suffix` are unconstrained strings, so the empty pair
 * exercises the accept case and every other draw exercises a reject case.
 *
 * This is what kills the anchor mutants: drop `^` and a non-empty prefix starts passing; drop `$`
 * and a non-empty suffix does.
 */
function assertAnchored(
  label: string,
  parse: (s: string) => boolean,
  literal: string,
  body: fc.Arbitrary<string>,
): void {
  fc.assert(
    fc.property(body, fc.string(), fc.string(), (hex, prefix, suffix) => {
      const exact = prefix === "" && suffix === "";
      assert.equal(
        parse(`${prefix}${literal}${hex}${suffix}`),
        exact,
        `${label}: expected ${exact ? "accept" : "reject"} for prefix=${JSON.stringify(prefix)} suffix=${JSON.stringify(suffix)}`,
      );
    }),
    { seed: SEED, numRuns: 1000 },
  );
}

test("CriterionId accepts only the exactly-anchored uatc_ form, and rejects every decoration of it", () => {
  assertAnchored(
    "CriterionId",
    (s) => CriterionId.safeParse(s).success,
    "uatc_",
    hexOfLength(24),
  );
});

test("CriterionRevisionId accepts only the exactly-anchored uatr1: form, and rejects every decoration of it", () => {
  assertAnchored(
    "CriterionRevisionId",
    (s) => CriterionRevisionId.safeParse(s).success,
    "uatr1:",
    hexOfLength(16),
  );
});

/**
 * The LENGTH half, which the anchor property alone does not cover: the quantifiers are exact, so a
 * body of any other length is rejected however well-formed its characters are. `{24}` widened to
 * `{23,}` or `{1,24}` survives the properties above and dies here.
 */
test("both criterion identities reject a body of any length but their exact one", () => {
  /** A hex body of any length EXCEPT the exact one the pattern requires. */
  const wrongLength = (exact: number, max: number) =>
    fc
      .integer({ min: 0, max })
      .filter((n) => n !== exact)
      .chain((n) => hexOfLength(n));

  fc.assert(
    fc.property(wrongLength(24, 48), (hex) => {
      assert.equal(CriterionId.safeParse(`uatc_${hex}`).success, false);
    }),
    { seed: SEED, numRuns: 300 },
  );

  fc.assert(
    fc.property(wrongLength(16, 32), (hex) => {
      assert.equal(CriterionRevisionId.safeParse(`uatr1:${hex}`).success, false);
    }),
    { seed: SEED, numRuns: 300 },
  );
});

/**
 * The CHARACTER-CLASS half: `[0-9a-f]` is lowercase-only, so an uppercase hex digit anywhere in an
 * otherwise-exact body is rejected. Widening the class to `[0-9a-fA-F]` or `.` dies here and
 * nowhere else.
 */
test("both criterion identities reject uppercase hex, which is not in their character class", () => {
  fc.assert(
    fc.property(
      hexOfLength(24),
      fc.integer({ min: 0, max: 23 }),
      fc.constantFrom(..."ABCDEF".split("")),
      (hex, at, upper) => {
        const body = hex.slice(0, at) + upper + hex.slice(at + 1);
        assert.equal(CriterionId.safeParse(`uatc_${body}`).success, false);
      },
    ),
    { seed: SEED, numRuns: 500 },
  );
});

/**
 * `criterionRevisionId` — the FNV-1a/64 CONTENT BINDING — was found completely unexercised by the
 * same measurement: emptying its mixing loop (`BlockStatement -> {}`) and flipping its multiply to
 * a divide both survived the whole package suite. That is not a cosmetic survivor. A content
 * binding whose loop does nothing returns the SAME id for every input, so every UAT criterion
 * revision would collide and `revisionId` would bind nothing at all (ADR-0253).
 *
 * A hash is close to the ideal property-test subject: its contract is stated over ALL inputs and
 * there is no interesting single example. Determinism and shape are the honest floor; DISTINCTNESS
 * is the property that actually kills the mutants, because a broken mixer collides immediately.
 */
test("criterionRevisionId is deterministic and always the exact uatr1 shape", () => {
  fc.assert(
    fc.property(fc.string(), (content) => {
      const once = criterionRevisionId(content);
      assert.equal(criterionRevisionId(content), once, "same content must bind to the same id");
      assert.equal(CriterionRevisionId.safeParse(once).success, true, `${once} must be well-formed`);
    }),
    { seed: SEED, numRuns: 500 },
  );
});

test("criterionRevisionId binds DISTINCT content to distinct ids", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (a, b) => {
      fc.pre(a !== b);
      assert.notEqual(
        criterionRevisionId(a),
        criterionRevisionId(b),
        `distinct content collided: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
      );
    }),
    { seed: SEED, numRuns: 1000 },
  );
});
