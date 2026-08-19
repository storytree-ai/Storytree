import test from "node:test";
import assert from "node:assert/strict";

import {
  UatTestCriterion,
  canonicalUatCriterionContent,
  criterionRevisionId,
  parseUatTestCriteria,
} from "./uat-test-criteria.js";

const STORY = "demo-story";

function line(ordinal: number, prose: string): string {
  const id = `uatc_${ordinal.toString(16).padStart(24, "0")}`;
  const revision = criterionRevisionId(canonicalUatCriterionContent(`${ordinal}. ${prose}`));
  return `${ordinal}. ${prose} _(criterion-id: ${id})_ _(revision-id: ${revision})_`;
}

const BODY = `## UAT Test Criteria (would-be)

${line(1, "**Decompose** _(witness: machine)_ _(proof-gate: demo-story#gate-2)_: stable.")}
${line(2, "**Human relay** _(witness: human)_: observed.")}
${line(3, "**Undecided:** conservative default.")}

## Other

1. not a criterion.
`;

test("parser reads authored criteria, titles, witnesses, and would-be state", () => {
  const criteria = parseUatTestCriteria(STORY, BODY);
  assert.equal(criteria.length, 3);
  assert.deepEqual(criteria.map((criterion) => criterion.title), ["Decompose", "Human relay", "Undecided"]);
  assert.deepEqual(criteria.map((criterion) => criterion.witness), ["machine", "human", "either"]);
  assert.ok(criteria.every((criterion) => criterion.wouldBe));
});

test("plain heading creates hard obligations and the legacy heading remains readable", () => {
  const item = line(1, "**A leg** _(witness: human)_: works.");
  const modern = parseUatTestCriteria(STORY, `## UAT Test Criteria\n\n${item}`);
  const legacy = parseUatTestCriteria(STORY, `## Story UAT\n\n${item}`);
  assert.deepEqual(modern, legacy);
  assert.equal(modern[0]?.wouldBe, false);
});

test("no UAT section yields an empty list", () => {
  assert.deepEqual(parseUatTestCriteria(STORY, "# Just a story\n"), []);
});

test("invalid witness is refused and an absent witness stays either", () => {
  const bad = line(1, "**Bad** _(witness: nobody)_: nope.");
  assert.throws(() => parseUatTestCriteria(STORY, `## UAT Test Criteria\n\n${bad}`), /invalid witness/i);
  assert.equal(parseUatTestCriteria(STORY, `## UAT Test Criteria\n\n${line(1, "**Open**: later.")}`)[0]?.witness, "either");
});

test("proof-gate binding is exact and malformed/duplicate bindings are refused", () => {
  assert.equal(parseUatTestCriteria(STORY, BODY)[0]?.proofGateId, "demo-story#gate-2");
  const malformed = line(1, "**Bad** _(witness: machine)_ _(proof-gate: nope)_: no.");
  assert.throws(() => parseUatTestCriteria(STORY, `## UAT Test Criteria\n\n${malformed}`), /malformed proof-gate/i);
  const duplicate = line(1, "**Bad** _(proof-gate: demo-story#gate-1)_ _(proof-gate: demo-story#gate-2)_: no.");
  assert.throws(() => parseUatTestCriteria(STORY, `## UAT Test Criteria\n\n${duplicate}`), /duplicate proof-gate/i);
});

// ── the authored witness-basis (ADR-0357 D2/D3) ────────────────────────────────────────────────

const uat = (prose: string) => `## UAT Test Criteria\n\n${line(1, prose)}`;

test("a human leg's authored basis is read, and an absent one is simply absent", () => {
  const stated = uat(
    "**Native picker** _(witness: human)_ _(witness-basis: dialog.showOpenDialog is an Electron " +
      "main-process modal and Playwright drives the renderer; retired when the spine owns OS-level " +
      "automation.)_: it opens.",
  );
  assert.equal(
    parseUatTestCriteria(STORY, stated)[0]?.witnessBasis,
    "dialog.showOpenDialog is an Electron main-process modal and Playwright drives the renderer; " +
      "retired when the spine owns OS-level automation.",
  );
  assert.equal(parseUatTestCriteria(STORY, uat("**Bare** _(witness: human)_: works."))[0]?.witnessBasis, undefined);
});

test("the basis tag cannot be confused with the witness tag it sits beside", () => {
  // `(witness-basis:` does not contain the literal `(witness:`, so neither tag can read the other's
  // value — the witness stays a witness even when the basis names a witness-ish word.
  const criterion = parseUatTestCriteria(
    STORY,
    uat("**Both** _(witness: human)_ _(witness-basis: no machine harness reaches it; retired by one.)_: ok."),
  )[0];
  assert.equal(criterion?.witness, "human");
  assert.equal(criterion?.witnessBasis, "no machine harness reaches it; retired by one.");
});

test("a basis that would LOOK satisfied while saying nothing is refused (empty, duplicate)", () => {
  assert.throws(
    () => parseUatTestCriteria(STORY, uat("**Empty** _(witness: human)_ _(witness-basis:   )_: no.")),
    /empty witness-basis/i,
  );
  assert.throws(
    () =>
      parseUatTestCriteria(
        STORY,
        uat("**Twice** _(witness: human)_ _(witness-basis: first.)_ _(witness-basis: second.)_: no."),
      ),
    /duplicate witness-basis/i,
  );
});

test("a machine leg carrying a basis is REFUSED, not ignored — a flip must drop the dead prose", () => {
  assert.throws(
    () => parseUatTestCriteria(STORY, uat("**Flipped** _(witness: machine)_ _(witness-basis: stale.)_: no.")),
    /machine leg states no witness-basis/i,
  );
  assert.equal(
    UatTestCriterion.safeParse({
      criterionId: "uatc_0123456789abcdef01234567",
      revisionId: "uatr1:0123456789abcdef",
      title: "A criterion",
      witness: "machine",
      witnessBasis: "stale",
    }).success,
    false,
  );
});

test("the basis is INSIDE the hashed content, so authoring one advances the revision", () => {
  // The ordering constraint ADR-0357 names: witness-basis is not an identity annotation, so
  // canonicalUatCriterionContent keeps it and the authored (revision-id:) must be recomputed.
  const bare = "1. **A leg** _(witness: human)_: works.";
  const withBasis = "1. **A leg** _(witness: human)_ _(witness-basis: no harness reaches it; a new one retires it.)_: works.";
  assert.notEqual(
    criterionRevisionId(canonicalUatCriterionContent(bare)),
    criterionRevisionId(canonicalUatCriterionContent(withBasis)),
  );
});

test("schema defaults remain conservative but exact identity/revision are mandatory", () => {
  const base = {
    criterionId: "uatc_0123456789abcdef01234567",
    revisionId: "uatr1:0123456789abcdef",
    title: "A criterion",
  };
  const parsed = UatTestCriterion.parse(base);
  assert.equal(parsed.witness, "either");
  assert.equal(parsed.wouldBe, false);
  assert.equal(UatTestCriterion.safeParse({ title: "missing binding" }).success, false);
  assert.equal(UatTestCriterion.safeParse({ ...base, extra: true }).success, false);
});
