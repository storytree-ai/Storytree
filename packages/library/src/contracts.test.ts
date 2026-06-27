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
