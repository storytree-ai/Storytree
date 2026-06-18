import test from "node:test";
import assert from "node:assert/strict";
import { UatTest, parseUatTests, uatTestId } from "./uat-tests.js";

/**
 * Offline unit tests for the `uat-test-units` capability (ADR-0044 d.1). The two
 * contracts: `stable-addressable-tests` (UAT prose → stable, unique ids + titles,
 * re-parse-stable) and `witness-kind-validated` (witness enum validated, invalid
 * refused, absent defaults conservatively).
 */

const STORY = "demo-story";

/** A story body mirroring the `## Story UAT (would-be)` shape, with mixed witness tags. */
const BODY = `---
id: demo-story
---

# Demo

Some framing prose.

## Story UAT (would-be)

1. **Decompose** _(witness: machine)_: a story's UAT prose resolves to addressable ids.
   **Success —** each test has a stable id and a witness.
2. **Human relay** _(witness: human)_: the owner tells the agent "test 2 works".
   **Success —** one signal for that test id, signer = the owner.
3. **Machine:** an automated UAT run attests a machine test.
   **Success —** a machine signal for that test id.
4. **No roll-up:** all of a story's tests are attested.
   **Success —** the world island's hue is unchanged.

## Open modeling calls

- not a UAT test.
`;

// ── stable-addressable-tests ────────────────────────────────────────────────

test("stable-addressable-tests: prose resolves to positional <story>#uat-<n> ids with titles", () => {
  const tests = parseUatTests(STORY, BODY);
  assert.equal(tests.length, 4, "four numbered UAT items → four tests");
  assert.deepEqual(
    tests.map((t) => t.id),
    ["demo-story#uat-1", "demo-story#uat-2", "demo-story#uat-3", "demo-story#uat-4"],
    "ids are positional <story>#uat-<n>",
  );
  assert.deepEqual(
    tests.map((t) => t.title),
    ["Decompose", "Human relay", "Machine", "No roll-up"],
    "titles are the bold leads, colon stripped",
  );
});

test("stable-addressable-tests: ids are unique", () => {
  const tests = parseUatTests(STORY, BODY);
  assert.equal(new Set(tests.map((t) => t.id)).size, tests.length, "no duplicate ids");
});

test("stable-addressable-tests: re-parsing the same body is stable (deep-equal)", () => {
  assert.deepEqual(parseUatTests(STORY, BODY), parseUatTests(STORY, BODY), "deterministic");
});

test("stable-addressable-tests: uatTestId is the single id scheme home", () => {
  assert.equal(uatTestId("s", 3), "s#uat-3");
});

test("stable-addressable-tests: a story with no UAT section yields [] (backward-compatible)", () => {
  assert.deepEqual(parseUatTests(STORY, "# Just a heading\n\nno uat here\n"), []);
});

test("stable-addressable-tests: only the Story UAT section is parsed, not other numbered lists", () => {
  const body = `## Capabilities

1. one
2. two

## Story UAT

1. **Only this one:** counts.
`;
  const tests = parseUatTests(STORY, body);
  assert.equal(tests.length, 1, "the Capabilities list is ignored");
  assert.equal(tests[0]!.title, "Only this one");
});

// ── witness-kind-validated ──────────────────────────────────────────────────

test("witness-kind-validated: declared witness tags are honoured", () => {
  const tests = parseUatTests(STORY, BODY);
  assert.equal(tests[0]!.witness, "machine", "explicit (witness: machine)");
  assert.equal(tests[1]!.witness, "human", "explicit (witness: human)");
});

test("witness-kind-validated: absent witness defaults conservatively to either", () => {
  const tests = parseUatTests(STORY, BODY);
  assert.equal(tests[2]!.witness, "either", "no tag → either");
  assert.equal(tests[3]!.witness, "either", "no tag → either");
});

test("witness-kind-validated: the schema refuses an invalid witness value", () => {
  assert.throws(
    () => UatTest.parse({ id: "s#uat-1", title: "t", witness: "nobody" }),
    "unknown witness refused at the schema boundary",
  );
});

test("witness-kind-validated: the schema default applies when witness is omitted", () => {
  const parsed = UatTest.parse({ id: "s#uat-1", title: "t" });
  assert.equal(parsed.witness, "either", "omitted → either");
});

test("witness-kind-validated: an explicit but invalid prose tag is refused (not defaulted)", () => {
  const body = "## Story UAT\n\n1. **Bad** (witness: nobody): oops.\n";
  assert.throws(() => parseUatTests(STORY, body), /invalid witness/, "refused, not silently either");
});

test("witness-kind-validated: the schema is strict — unknown fields rejected", () => {
  assert.throws(() => UatTest.parse({ id: "s#uat-1", title: "t", witness: "human", extra: 1 }));
});
