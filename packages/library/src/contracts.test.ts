import test from "node:test";
import assert from "node:assert/strict";

import { parseContracts } from "./contracts.js";

/**
 * `parseContracts` (ADR-0020 coverage-honesty follow-on): the `## Contracts` prose parser. Pure —
 * fed a markdown body, returns the declared contract ids + titles. Mirrors `reliability-gates.test.ts`.
 */

// A realistic capability body: a Contracts section with a prose intro + multi-line items (asserts
// bullets that carry their OWN code spans), bounded by a following `##` section. Modelled on
// stories/desktop/shared-forest-connection.md and stories/notice-board/declare-presence.md.
const BODY = `# A capability

## Guidance

Some guidance prose with a \`code span\` in it.

## Contracts (3)

The test-proven leaf behaviours — each one isolated test, collaborators stubbed.

1. **\`presence-doc-fail-closed\`** — an unattributable or silent declaration is refused
   - **asserts —** parsing a doc with a missing \`workingOn\`, \`sessionId\`, or \`branch\` throws.
   - **proven by —** \`packages/notice-board/src/presence.test.ts\` (real at HEAD)
2. **\`staleness-is-derived\`** — freshness is a pure function of \`lastSeenAt\` vs \`now\`
   - **asserts —** the classifier returns fresh/stale/possibly-dead bands.
3. **\`fr-bounded-never-hangs\`** — a hanging broker is bounded by a deadline
   - **covers —** \`apps/desktop/src/backend/forest-readiness.ts\` *(provisional path)*

## Guidance — the slice that earns the verdict

Trailing prose that must NOT be parsed as a contract, even with a 1. numbered line here.
`;

test("parseContracts pulls each contract id + title from the `## Contracts` section", () => {
  const contracts = parseContracts(BODY);
  assert.deepEqual(
    contracts.map((c) => c.id),
    ["presence-doc-fail-closed", "staleness-is-derived", "fr-bounded-never-hangs"],
  );
  // The title is the item lead after the id, the leading dash stripped.
  assert.equal(contracts[0]!.title, "an unattributable or silent declaration is refused");
  assert.equal(contracts[2]!.title, "a hanging broker is bounded by a deadline");
});

test("parseContracts bounds the section at the next `##` — trailing numbered prose is not a contract", () => {
  // The trailing `## Guidance` section contains "a 1. numbered line" but no item is captured from it.
  const ids = parseContracts(BODY).map((c) => c.id);
  assert.equal(ids.length, 3);
  assert.ok(!ids.some((id) => id.includes("numbered")));
});

test("parseContracts: a numbered item WITHOUT a bold code-span id is skipped (not a contract decl)", () => {
  const body = `## Contracts

1. **\`real-contract\`** — has an id
2. just a plain numbered note, no bold id span
3. **\`another-one\`** — also has an id
`;
  assert.deepEqual(
    parseContracts(body).map((c) => c.id),
    ["real-contract", "another-one"],
  );
});

test("parseContracts collapses a duplicate id to its first occurrence", () => {
  const body = `## Contracts

1. **\`dup\`** — first
2. **\`dup\`** — second (a copy-paste slip)
`;
  assert.deepEqual(parseContracts(body).map((c) => c.id), ["dup"]);
});

test("parseContracts: a body with no `## Contracts` section yields [] (backward-compatible)", () => {
  assert.deepEqual(parseContracts("# A story\n\n## Story UAT\n\n1. a leg\n"), []);
});

test("parseContracts: a contract id but no title falls back to the id (title is non-empty)", () => {
  const contracts = parseContracts("## Contracts\n\n1. **\`bare-id\`**\n");
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0]!.id, "bare-id");
  assert.equal(contracts[0]!.title, "bare-id");
});

// ---------------------------------------------------------------------------
// Declared obligations (ADR-0262): the labelled sub-bullets, no longer discarded
// ---------------------------------------------------------------------------

test("parseContracts captures each contract's labelled obligations, label normalised + text verbatim", () => {
  const contracts = parseContracts(BODY);
  // Contract 1 declares BOTH an `asserts` and a `proven by`; the em-dash separator sits INSIDE the
  // bold span in the authored form (`**asserts —**`) and is stripped from the label, never the text.
  assert.deepEqual(contracts[0]!.obligations, [
    {
      label: "asserts",
      text: "parsing a doc with a missing `workingOn`, `sessionId`, or `branch` throws.",
    },
    { label: "proven by", text: "`packages/notice-board/src/presence.test.ts` (real at HEAD)" },
  ]);
  // Contract 3 declares only a `covers` — the label set is read off the prose, never assumed.
  assert.deepEqual(contracts[2]!.obligations, [
    { label: "covers", text: "`apps/desktop/src/backend/forest-readiness.ts` *(provisional path)*" },
  ]);
});

test("parseContracts: an obligation's wrapped continuation lines join into one text", () => {
  // The authored corpus wraps at ~100 cols, so almost every real `asserts` spans several lines.
  const body = `## Contracts

1. **\`wrapped\`** — a contract whose obligation wraps
   - **asserts —** the child id is composed from declared build identity ALONE — the parent
     session id, the run id, and the unit id — and is byte-identical across repeated
     observation.
`;
  const [c] = parseContracts(body);
  // `obligations` is optional on the SCHEMA (absent = hand-constructed, never parsed), so asserting
  // the parser always supplies it is part of the claim, not a type-checker formality.
  const obligations = c!.obligations;
  assert.ok(obligations !== undefined);
  assert.equal(obligations.length, 1);
  assert.equal(
    obligations[0]!.text,
    "the child id is composed from declared build identity ALONE — the parent session id, " +
      "the run id, and the unit id — and is byte-identical across repeated observation.",
  );
});

test("parseContracts: the `falsifiability` obligation is captured under its own label", () => {
  // The label the friction item `contract-without-a-falsifiability-clause-…` turns on: a contract
  // that declares what must FAIL is structurally distinguishable from one that does not.
  const body = `## Contracts

1. **\`capacity-never-inferred\`** — capacity is never inferred
   - **asserts —** no emitted event carries a capacity absent from its input.
   - **falsifiability —** an implementation supplying capacity from a table must FAIL this contract.
`;
  const [c] = parseContracts(body);
  const obligations = c!.obligations;
  assert.ok(obligations !== undefined);
  assert.deepEqual(
    obligations.map((o) => o.label),
    ["asserts", "falsifiability"],
  );
  assert.match(obligations[1]!.text, /must FAIL this contract\.$/);
});

test("parseContracts: the contract id on the first line is never read as an obligation label", () => {
  // The id is itself a bold span (`**\`id\`**`); only lines AFTER the item lead are scanned, mirroring
  // the same first-line-only discipline `itemTitle` already applies.
  const [c] = parseContracts("## Contracts\n\n1. **\`the-id\`** — a title\n   - **asserts —** something real.\n");
  assert.deepEqual(c!.obligations, [{ label: "asserts", text: "something real." }]);
});

test("parseContracts: a contract declaring no sub-bullets yields an EMPTY obligation list, not absent", () => {
  // Empty means "parsed, and it declares none" — distinct from the field being absent, which means
  // "this ContractDecl was hand-constructed, never parsed from a spec". Two different facts.
  const [c] = parseContracts("## Contracts\n\n1. **\`bare\`** — no bullets under it\n");
  assert.deepEqual(c!.obligations, []);
});

test("parseContracts: a wrapped item lead before the first bullet is not swallowed into an obligation", () => {
  // `1. **\`id\`** — title text that\n   wraps.` — the wrap is title prose, not obligation prose.
  const body = `## Contracts

1. **\`wrapped-lead\`** — the audit's population is every and only parsed machine UAT
   criteria.
   - **asserts —** row count equals the machine-criterion count.
`;
  const [c] = parseContracts(body);
  assert.deepEqual(c!.obligations, [
    { label: "asserts", text: "row count equals the machine-criterion count." },
  ]);
});
