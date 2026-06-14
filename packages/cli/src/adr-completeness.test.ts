import test from "node:test";
import assert from "node:assert/strict";

import { adrCompleteness } from "./adr-completeness.js";
import { scaffold } from "./adr.js";

/**
 * ADR-0059 (gate-as-proof): the structural-completeness check is RED against the real
 * `storytree adr new` scaffold and GREEN against a complete PROPOSED record — never requiring
 * `status: accepted` (acceptance stays a human flip). This is the per-artifact "test" the
 * prove-it-gate drives red→green via edit-existing (ADR-0057 C).
 */

const FILE = "0059-gate-as-proof.md";

/** A complete PROPOSED record: sections filled, a decided date, no `<…>` placeholders, the edge declared. */
const COMPLETE_PROPOSED = [
  "---",
  "status: proposed",
  "decided: 2026-06-15",
  "supersedes: [57]",
  "---",
  "# ADR-0059: Gate-as-proof",
  "",
  "## Status",
  "",
  "proposed — decided 2026-06-15 by the owner; gate-as-proof makes authoring buildable.",
  "",
  "**Supersedes** ADR-0057 — extends its expansion plan.",
  "",
  "## Context",
  "",
  "The infrastructure is built; we dogfood the inner loop. A generic `Array<string>` is fine here.",
  "",
  "## Decision",
  "",
  "Authoring earns a verdict via its structural gate.",
  "",
  "## Consequences",
  "",
  "Good: authoring becomes buildable. Bad: one completeness test per ADR.",
  "",
  "## References",
  "",
  "- ADR-0057.",
  "",
].join("\n");

test("RED against the real scaffold: missing `decided:` and unfilled `<…>` placeholders", () => {
  const fails = adrCompleteness(FILE, scaffold(59, "Gate-as-proof", { supersedes: [57], amends: [] }), {
    supersedes: [57],
  });
  assert.ok(fails.length > 0, "the scaffold must be incomplete");
  assert.ok(
    fails.some((f) => /decided/.test(f)),
    `expected a 'decided' failure, got: ${fails.join(" | ")}`,
  );
  assert.ok(
    fails.some((f) => /placeholder/.test(f)),
    `expected a placeholder failure, got: ${fails.join(" | ")}`,
  );
  // The scaffold DID declare the supersedes edge, so that is NOT a failure.
  assert.ok(!fails.some((f) => /declared supersedes/.test(f)));
});

test("GREEN against a complete PROPOSED record — acceptance is NOT required (the human-flip wall)", () => {
  assert.deepEqual(adrCompleteness(FILE, COMPLETE_PROPOSED, { supersedes: [57] }), []);
  // The `Array<string>` generic must NOT trip the placeholder detector (no internal whitespace).
});

test("a comma-bearing generic in CODE does not false-trip the placeholder detector", () => {
  // `Map<string, number>` has internal whitespace, so the bare regex would flag it — but it is in an
  // inline code span, which is stripped before the scan. A finished ADR can discuss generics freely.
  const withGeneric = COMPLETE_PROPOSED.replace(
    "Authoring earns a verdict via its structural gate.",
    "We thread a `Map<string, number>` and a fenced block:\n\n```ts\ntype X = Record<string, number>;\n```\n",
  );
  assert.deepEqual(adrCompleteness(FILE, withGeneric, { supersedes: [57] }), []);
});

test("a complete ACCEPTED record also passes (completeness is status-agnostic, never forces a status)", () => {
  const accepted = COMPLETE_PROPOSED.replace("status: proposed", "status: accepted").replace(
    "proposed — decided",
    "accepted — decided",
  );
  assert.deepEqual(adrCompleteness(FILE, accepted, { supersedes: [57] }), []);
});

test("a DECLARED edge missing from the frontmatter is a completeness failure", () => {
  const noEdge = COMPLETE_PROPOSED.replace("supersedes: [57]\n", "").replace(
    "\n**Supersedes** ADR-0057 — extends its expansion plan.\n",
    "",
  );
  const fails = adrCompleteness(FILE, noEdge, { supersedes: [57] });
  assert.ok(
    fails.some((f) => /declared supersedes ADR-0057/.test(f)),
    `expected a missing-edge failure, got: ${fails.join(" | ")}`,
  );
});

test("a missing required section is a failure", () => {
  const noDecision = COMPLETE_PROPOSED.replace(/## Decision\n\n[^\n]+\n/, "");
  assert.ok(adrCompleteness(FILE, noDecision).some((f) => /Decision/.test(f)));
});

test("malformed frontmatter returns the parse failure (not a crash)", () => {
  const fails = adrCompleteness(FILE, "no frontmatter here\n");
  assert.equal(fails.length, 1);
  assert.match(fails[0] ?? "", /frontmatter invalid/);
});
