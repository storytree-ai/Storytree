/**
 * MEMBERSHIP LEG for every enum this package publishes (arc `test-strength-beyond-red-green-arc`
 * increment 2, realising ADR-0447 D3).
 *
 * WHAT IT CLOSES — the second MEASURED hole from the 2026-08-25 mutation baseline
 * (`docs/research/mutation-score-baseline-2026-08-25.md`): `enums.ts` scored 65.22% with EIGHT
 * surviving `StringLiteral` mutants and `work-event.ts` with one more. Replacing an enum member
 * with `""` left the whole package green, because no test ever constructed that state. The
 * headline instance: deleting `"retired"` from `WorkEventDoc`'s event enum was invisible to all 34
 * tests. These are wire shapes other organisms `.safeParse()` across the ADR-0068 §3 boundary, so
 * a silently-dropped member is a silently-rejected message.
 *
 * ⚠ THE TRAP THIS FILE IS BUILT AROUND — an expectation derived from its subject cannot fail.
 * The obvious spelling is `for (const m of ProofMode.options) assert.ok(ProofMode.parse(m))`, and
 * it is WORTHLESS: mutate the enum and `.options` mutates with it, so the assertion tracks the
 * mutant and stays green. That is the repo's commonest defect class wearing a property-test
 * costume. Every expected set below is therefore a HAND-WRITTEN LITERAL, independent of the
 * subject — which is exactly what makes it able to fail.
 *
 * So this file is deliberately TWO halves with different jobs:
 *   - the literal-set assertion, which is example-based and is what kills the mutants;
 *   - the property, which quantifies over everything OUTSIDE the set and is what a hand-written
 *     example cannot cover.
 * ADR-0447 D3's "additive, never sole proof" is not a slogan here — the property alone would not
 * have closed this hole, and that is a finding worth keeping rather than smoothing over.
 *
 * SEED PINNED (ADR-0447 D3). See `criterion-binding.property.test.ts` for why, and for what to do
 * with a counterexample.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  BuildPhase,
  ColourState,
  Outcome,
  ProofMode,
  Status,
  Tier,
  UatWitness,
  WorkEventDoc,
} from "./index.js";

const SEED = 20260825;

/** Every published enum, with its members written out BY HAND — never read from the subject. */
const ENUMS: ReadonlyArray<{
  name: string;
  schema: { safeParse: (v: unknown) => { success: boolean }; options: readonly string[] };
  members: readonly string[];
}> = [
  { name: "Tier", schema: Tier, members: ["story", "capability", "contract"] },
  {
    name: "Status",
    schema: Status,
    members: ["proposed", "building", "healthy", "unhealthy", "mapped", "retired"],
  },
  {
    name: "ProofMode",
    schema: ProofMode,
    members: ["contract", "capability", "story", "operator-attested", "adopted"],
  },
  { name: "Outcome", schema: Outcome, members: ["pass", "fail"] },
  { name: "UatWitness", schema: UatWitness, members: ["human", "machine"] },
  {
    name: "BuildPhase",
    schema: BuildPhase,
    members: ["AUTHOR_TEST", "CONFIRM_RED", "IMPLEMENT", "CONFIRM_GREEN", "GATE"],
  },
  {
    name: "ColourState",
    schema: ColourState,
    members: ["authoring", "proving", "supplementing"],
  },
];

test("every published enum's member set is EXACTLY the hand-written one, member for member", () => {
  for (const { name, schema, members } of ENUMS) {
    assert.deepEqual(
      [...schema.options].sort(),
      [...members].sort(),
      `${name}: the enum's members drifted from the set this test declares. If the change is ` +
        `intended, update the literal here — that edit is the point, not an obstacle.`,
    );
    for (const m of members) {
      assert.equal(schema.safeParse(m).success, true, `${name}: "${m}" must parse`);
    }
  }
});

test("no string outside a published enum's member set parses as one of its members", () => {
  for (const { name, schema, members } of ENUMS) {
    fc.assert(
      fc.property(fc.string(), (s) => {
        fc.pre(!members.includes(s));
        assert.equal(schema.safeParse(s).success, false, `${name}: "${s}" must NOT parse`);
      }),
      { seed: SEED, numRuns: 300 },
    );
  }
});

/**
 * `WorkEventDoc.event` is an INLINE enum rather than a published one, so it is not in `ENUMS` and
 * has to be exercised through the doc. This is the exact member (`"retired"`) whose deletion the
 * baseline found invisible.
 */
const WORK_EVENTS = ["proposed", "building", "retired"] as const;

test("WorkEventDoc accepts exactly its three event states and rejects any other", () => {
  for (const event of WORK_EVENTS) {
    assert.equal(
      WorkEventDoc.safeParse({ unitId: "some-unit", event }).success,
      true,
      `WorkEventDoc must accept event "${event}"`,
    );
  }

  fc.assert(
    fc.property(fc.string(), (event) => {
      fc.pre(!(WORK_EVENTS as readonly string[]).includes(event));
      assert.equal(WorkEventDoc.safeParse({ unitId: "some-unit", event }).success, false);
    }),
    { seed: SEED, numRuns: 300 },
  );
});
