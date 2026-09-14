/**
 * escalation-is-admitted-only-through-the-phase-bound-validator (ADR-0569 D1/D2): an authoring
 * escalation is a typed record whose `phase` and `kind` come ONLY from the phase that raised it —
 * never read off the caller's input — admitted through one pure, throw-free validator the agent
 * package publishes: `parseAuthoringEscalation`.
 *
 * RED phase: `parseAuthoringEscalation` does not exist yet on `phase-author.ts` or the barrel.
 * The module is imported as a NAMESPACE (`import * as`) rather than by name, so the test file
 * itself always LOADS cleanly whether or not the export exists yet — a named import of a symbol
 * the module does not (yet) provide would fail to link at all, which is a different, wrong-kind
 * red. Every assertion below is a genuine runtime assertion failure: first that the function is
 * published at all, then — once it is — that it behaves exactly as ADR-0569 D1 specifies.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import * as PhaseAuthorModule from "./phase-author.js";

type AuthoringPhase = "AUTHOR_TEST" | "IMPLEMENT";

type ParseAuthoringEscalation = (
  phase: AuthoringPhase,
  input: unknown,
) =>
  | { ok: true; escalation: Record<string, unknown> }
  | { ok: false; reason: string };

const parseAuthoringEscalation = (PhaseAuthorModule as Record<string, unknown>)
  .parseAuthoringEscalation as ParseAuthoringEscalation | undefined;

/** Fails with one clear assertion (never a crash) when the validator isn't published yet. */
function mustParse(): ParseAuthoringEscalation {
  assert.equal(
    typeof parseAuthoringEscalation,
    "function",
    "parseAuthoringEscalation must be exported as a function from phase-author.ts",
  );
  return parseAuthoringEscalation as ParseAuthoringEscalation;
}

describe("escalation-is-admitted-only-through-the-phase-bound-validator", () => {
  it("is published as a function from phase-author.ts", () => {
    assert.equal(typeof parseAuthoringEscalation, "function");
  });

  it("derives phase and kind from the raising phase, ignoring any phase/kind the input carries", () => {
    const parse = mustParse();
    const result = parse("AUTHOR_TEST", {
      phase: "IMPLEMENT", // must be ignored — the function's own argument wins
      kind: "unsatisfiable-test", // must be ignored — kind is derived, never read from input
      statement: "no automated oracle can observe this contract",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.escalation, {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "no automated oracle can observe this contract",
    });
  });

  it("builds the IMPLEMENT shape carrying the assertion the test demands", () => {
    const parse = mustParse();
    const result = parse("IMPLEMENT", {
      statement: "the test demands byte-identical whitespace no transform can produce",
      assertion: "assert.equal(output, expectedBytes)",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.escalation, {
      phase: "IMPLEMENT",
      kind: "unsatisfiable-test",
      statement: "the test demands byte-identical whitespace no transform can produce",
      assertion: "assert.equal(output, expectedBytes)",
    });
  });

  it("refuses an IMPLEMENT escalation with no assertion named", () => {
    const parse = mustParse();
    const result = parse("IMPLEMENT", {
      statement: "the test demands byte-identical whitespace no transform can produce",
    });
    assert.equal(result.ok, false);
  });

  it("an AUTHOR_TEST escalation never carries an assertion, whatever the input holds", () => {
    const parse = mustParse();
    const result = parse("AUTHOR_TEST", {
      statement: "cannot pin this without a real clock",
      assertion: "smuggled in anyway",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal("assertion" in result.escalation, false);
  });

  it("trims statement and assertion and refuses a blank one either side", () => {
    const parse = mustParse();

    const trimmedStatement = parse("AUTHOR_TEST", { statement: "   padded on both sides   " });
    assert.equal(trimmedStatement.ok, true);
    if (trimmedStatement.ok) {
      assert.equal(trimmedStatement.escalation.statement, "padded on both sides");
    }

    const trimmedAssertion = parse("IMPLEMENT", {
      statement: "the fixture rounds to 3 decimal places, the test wants 5",
      assertion: "   assert.equal(x, 1.23456)   ",
    });
    assert.equal(trimmedAssertion.ok, true);
    if (trimmedAssertion.ok) {
      assert.equal(trimmedAssertion.escalation.assertion, "assert.equal(x, 1.23456)");
    }

    const blankStatement = parse("AUTHOR_TEST", { statement: "    " });
    assert.equal(blankStatement.ok, false);

    const blankAssertion = parse("IMPLEMENT", {
      statement: "a real statement",
      assertion: "   ",
    });
    assert.equal(blankAssertion.ok, false);
  });

  it("names the offending field — or the non-object input — in every refusal's reason", () => {
    const parse = mustParse();
    const phases: AuthoringPhase[] = ["AUTHOR_TEST", "IMPLEMENT"];

    /** Returns a refusal's reason, failing loud if the input was admitted instead. */
    const reasonFor = (phase: AuthoringPhase, input: unknown): string => {
      const result = parse(phase, input);
      assert.equal(result.ok, false, `${phase} must refuse ${JSON.stringify(input)}`);
      return result.ok ? "" : result.reason;
    };

    // A missing, blank or non-string `statement`, in either phase. A well-formed assertion rides
    // along, so `statement` is the ONLY offending field and the reason must blame it alone.
    for (const phase of phases) {
      for (const input of [
        { assertion: "assert.equal(x, 1)" },
        { statement: "   ", assertion: "assert.equal(x, 1)" },
        { statement: 7, assertion: "assert.equal(x, 1)" },
      ]) {
        const reason = reasonFor(phase, input);
        const label = `${phase} ${JSON.stringify(input)}`;
        assert.match(reason, /statement/, `${label}: the reason must name statement`);
        assert.doesNotMatch(reason, /assertion/, `${label}: the assertion is well-formed and must not be blamed`);
      }
    }

    // A missing, blank or non-string `assertion` on IMPLEMENT, beside a well-formed statement.
    for (const input of [
      { statement: "why" },
      { statement: "why", assertion: "   " },
      { statement: "why", assertion: 9 },
    ]) {
      const reason = reasonFor("IMPLEMENT", input);
      const label = `IMPLEMENT ${JSON.stringify(input)}`;
      assert.match(reason, /assertion/, `${label}: the reason must name assertion`);
      assert.doesNotMatch(reason, /statement/, `${label}: the statement is well-formed and must not be blamed`);
    }

    // A PRESENT but malformed assertion is refused on AUTHOR_TEST too, and named there as well.
    for (const input of [
      { statement: "why", assertion: "   " },
      { statement: "why", assertion: 9 },
    ]) {
      const reason = reasonFor("AUTHOR_TEST", input);
      const label = `AUTHOR_TEST ${JSON.stringify(input)}`;
      assert.match(reason, /assertion/, `${label}: the reason must name assertion`);
      assert.doesNotMatch(reason, /statement/, `${label}: the statement is well-formed and must not be blamed`);
    }

    // A whole input that is not an object at all: the reason names THAT problem, in either phase.
    for (const phase of phases) {
      for (const input of [null, undefined, "a bare string", 42]) {
        assert.match(
          reasonFor(phase, input),
          /must be an object/,
          `${phase} ${String(input)}: the reason must say the input is not an object`,
        );
      }
    }
  });

  it("never throws for any input shape — it fails closed with a reason instead", () => {
    const parse = mustParse();
    const garbageInputs: unknown[] = [
      null,
      undefined,
      42,
      "a bare string",
      [],
      {},
      { statement: 7 },
      { statement: "ok", assertion: 9 },
      Symbol("nope"),
    ];
    for (const input of garbageInputs) {
      let result: { ok: boolean } | undefined;
      assert.doesNotThrow(() => {
        result = parse("AUTHOR_TEST", input);
      });
      assert.equal(result?.ok, false);

      let implResult: { ok: boolean } | undefined;
      assert.doesNotThrow(() => {
        implResult = parse("IMPLEMENT", input);
      });
      assert.equal(implResult?.ok, false);
    }
  });

  it("is pure — repeated calls with the same input produce byte-identical results", () => {
    const parse = mustParse();
    const input = { statement: "same input, every time" };
    const first = parse("AUTHOR_TEST", input);
    const second = parse("AUTHOR_TEST", input);
    assert.deepEqual(first, second);
  });

  it("is published from the package barrel (index.ts) as the same function", async () => {
    const barrel = (await import("./index.js")) as Record<string, unknown>;
    assert.equal(typeof barrel.parseAuthoringEscalation, "function");
    assert.equal(barrel.parseAuthoringEscalation, parseAuthoringEscalation);
  });
});
