import assert from "node:assert/strict";
import test from "node:test";
import {
  AttemptDifferenceKind,
  INNER_LOOP_EVENT_KIND,
  InnerLoopEventDoc,
} from "./inner-loop-event.js";

const identity = { unitId: "unit", incrementId: "increment", runId: "run" } as const;

function expectSingleIssue(input: unknown, path: string, message: string): void {
  const result = InnerLoopEventDoc.safeParse(input);
  if (result.success) assert.fail("expected validation failure");
  assert.deepEqual(result.error.issues, [{ code: "custom", path: [path], message }]);
}

test("inner-loop event protocol pins its durable kind and retry-difference vocabulary", () => {
  assert.equal(INNER_LOOP_EVENT_KIND, "inner-loop");
  assert.deepEqual(AttemptDifferenceKind.options, [
    "changed-input",
    "fixed-defect",
    "new-observation",
    "revised-test",
  ]);
});

test("inner-loop events round-trip every durable event family", () => {
  const events = [
    { event: "attempt", ...identity },
    {
      event: "grant",
      ...identity,
      attempts: 2,
      kind: "fixed-defect",
      difference: "fixed the parser",
    },
    { event: "signed-pass", ...identity },
    {
      event: "adjudication",
      ...identity,
      disposition: "land",
      mayRefuse: false,
      escalates: false,
      reason: "the signed verdict lands",
    },
  ] as const;

  for (const event of events) assert.deepEqual(InnerLoopEventDoc.parse(event), event);
});

test("inner-loop events are strict and reject blank identity", () => {
  assert.throws(() => InnerLoopEventDoc.parse({ event: "attempt", ...identity, extra: true }));
  for (const key of ["unitId", "incrementId", "runId"] as const) {
    expectSingleIssue(
      { event: "attempt", ...identity, [key]: "   " },
      key,
      "must not be blank",
    );
  }
});

test("grants require a positive whole count and an actual recorded difference", () => {
  const grant = {
    event: "grant",
    ...identity,
    attempts: 1,
    kind: "fixed-defect",
    difference: "fixed the failing parser",
  } as const;

  assert.deepEqual(InnerLoopEventDoc.parse(grant), grant);
  for (const attempts of [0, -1, 1.5]) assert.throws(() => InnerLoopEventDoc.parse({ ...grant, attempts }));
  assert.throws(() => InnerLoopEventDoc.parse({ ...grant, kind: "better-spec" }));
  assert.throws(() => InnerLoopEventDoc.parse({ ...grant, difference: "   " }));
});

test("adjudications preserve the exact deterministic landing disposition", () => {
  const shapes = [
    ["land", false, false, undefined],
    ["land-and-measure", false, false, undefined],
    ["land-and-declare-gap", false, true, undefined],
    ["rework", true, false, undefined],
    ["refuse", true, false, "ADR-0232 D5"],
  ] as const;

  for (const [disposition, mayRefuse, escalates, namedRule] of shapes) {
    const base = {
      event: "adjudication",
      ...identity,
      disposition,
      mayRefuse,
      escalates,
      reason: "the deterministic ruler decided this",
    };
    const event = namedRule === undefined ? base : { ...base, namedRule };
    assert.deepEqual(InnerLoopEventDoc.parse(event), event);
  }
});

test("adjudications reject impossible refusal, escalation, and rule combinations", () => {
  const base = {
    event: "adjudication",
    ...identity,
    reason: "the deterministic ruler decided this",
  } as const;
  const invalid = [
    { ...base, disposition: "land", mayRefuse: true, escalates: false },
    { ...base, disposition: "land", mayRefuse: false, escalates: true },
    { ...base, disposition: "land-and-measure", mayRefuse: false, escalates: true },
    { ...base, disposition: "land-and-declare-gap", mayRefuse: false, escalates: false },
    { ...base, disposition: "rework", mayRefuse: false, escalates: false },
    { ...base, disposition: "rework", mayRefuse: true, escalates: true },
    { ...base, disposition: "refuse", mayRefuse: true, escalates: false },
    {
      ...base,
      disposition: "land",
      mayRefuse: false,
      escalates: false,
      namedRule: "ADR-0232 D5",
    },
  ];

  for (const event of invalid) assert.throws(() => InnerLoopEventDoc.parse(event));
  expectSingleIssue(invalid[0], "mayRefuse", "land requires mayRefuse=false");
  expectSingleIssue(invalid[1], "escalates", "land requires escalates=false");
  expectSingleIssue(invalid[6], "namedRule", "a refusal must name the standing rule");
  expectSingleIssue(invalid[7], "namedRule", "only a refusal may name a rule");
});
