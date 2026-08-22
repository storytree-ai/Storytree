import assert from "node:assert/strict";
import test from "node:test";

import {
  adrDocId,
  adrNumberOfArtifactId,
  parseDecisionPointer,
} from "./decision-pointer.js";
import {
  extractAdrTitle,
  parseAdrDocument,
  renderAdrDocument,
  type AdrDocumentFields,
} from "./adr-doc.js";

/**
 * The canonical five-section decision — 311 of the 403 committed records carry exactly this shape.
 * Kept as a LITERAL rather than read off disk: `docs/decisions/**` is mapped by the affected-scope
 * classifier to cli + drive + app-surface (ADR-0394/0399, a MEASURED reader map), and a library test
 * that read the tree would make that map wrong — a decision edit would stop running the suite that
 * had just become one of its readers.
 */
const CANONICAL = `---
status: accepted
decided: 2026-08-21
arc: decision-log-home-arc
amends: [139, 223]
---
# ADR-0403: The decision log becomes ordinary artifacts in Postgres

## Status

accepted (2026-08-21)

## Context

Some context.

## Decision

**1. It moves.**

## Consequences

Things follow.

## References

- [ADR-0302](0302-online-or-nothing.md)
`;

test("adr-doc-parses-the-canonical-record: frontmatter becomes typed fields and the body survives whole", () => {
  const fields = parseAdrDocument(403, CANONICAL);

  assert.equal(fields.number, 403);
  assert.equal(fields.status, "accepted");
  assert.equal(fields.decided, "2026-08-21");
  assert.equal(fields.arc, "decision-log-home-arc");
  assert.deepEqual(fields.amends, [139, 223]);
  assert.deepEqual(fields.supersedes, []);
  assert.equal(fields.loadBearing, false);
  assert.equal(fields.title, "The decision log becomes ordinary artifacts in Postgres");
  // The body is EVERYTHING after the closing fence, including the H1 — a decision record is one
  // document, and the whole reason it is carried as a single field is that 92 of 403 records carry
  // headings a fixed section table has no name for.
  assert.ok(fields.body.startsWith("# ADR-0403: "));
  assert.ok(fields.body.includes("## References"));
  assert.equal(fields.body, CANONICAL.slice(CANONICAL.indexOf("\n---\n") + "\n---\n".length));
});

test("adr-doc-round-trip-is-byte-identical: ADR-0403 dec 9's authorability property", () => {
  // The property the round-trip edit verb rests on: pull a decision to a file, change nothing, write
  // it back, and the stored document is the same bytes. A single drifting byte per pass would make
  // every no-op edit show up as a diff and the tier's history unreadable.
  const once = renderAdrDocument(parseAdrDocument(403, CANONICAL));
  const twice = renderAdrDocument(parseAdrDocument(403, once));
  assert.equal(twice, once);
  assert.deepEqual(parseAdrDocument(403, once), parseAdrDocument(403, twice));
});

test("adr-doc-round-trip-preserves-unknown-sections: a record with its own headings loses nothing", () => {
  // 92 of 403 committed records carry headings outside the canonical five — `## What this does NOT
  // decide`, `## Options weighed and rejected`, a dated `## Reaffirmation`. This is the measurement
  // that decided the kind's shape, so it is the case a regression would break first.
  const odd = `---
status: accepted
---
# ADR-0201: A record with its own shape

## Status

accepted

## Owner decisions (2026-06-14)

The owner said so.

## What this does NOT decide

Nothing else.
`;
  const fields = parseAdrDocument(201, odd);
  assert.ok(fields.body.includes("## Owner decisions (2026-06-14)"));
  assert.ok(fields.body.includes("## What this does NOT decide"));
  assert.equal(renderAdrDocument(fields), odd);
});

test("adr-doc-omits-defaulted-frontmatter-keys: an absent edge list is not written back as empty", () => {
  // 107 of 403 records carry no `amends` key at all. Emitting `amends: []` for them would make every
  // one differ from its own source for no information gained — and would then differ AGAIN from a
  // hand-edited round trip that dropped it, which is how a "byte-identical" claim quietly stops
  // being true.
  const minimal = `---
status: proposed
---
# ADR-0001: A bare record
`;
  const rendered = renderAdrDocument(parseAdrDocument(1, minimal));
  assert.equal(rendered, minimal);
  assert.ok(!rendered.includes("amends"));
  assert.ok(!rendered.includes("supersedes"));
  assert.ok(!rendered.includes("load_bearing"));
});

test("adr-doc-carries-the-load-bearing-tag-and-supersedes-edge: both survive a round trip", () => {
  const tagged = `---
status: accepted
decided: 2026-06-01
supersedes: [86]
load_bearing: true
---
# ADR-0139: Correct in place
`;
  const fields = parseAdrDocument(139, tagged);
  assert.equal(fields.loadBearing, true);
  assert.deepEqual(fields.supersedes, [86]);
  assert.deepEqual(fields.amends, []);
  assert.equal(renderAdrDocument(fields), tagged);
});

test("adr-doc-refuses-a-retired-frontmatter-key: `supersedes_in_part` fails loudly rather than dropping", () => {
  // ADR-0139 retired the key. Silently dropping it on the way into a row would ERASE the edge the
  // retirement exists to force someone to re-express as `amends`, and the row would then read as a
  // decision with no lineage at all.
  const stale = `---
status: accepted
supersedes_in_part: [12]
---
# ADR-0099: A record with a retired key
`;
  assert.throws(() => parseAdrDocument(99, stale), /unknown frontmatter key/);
});

test("adr-doc-refuses-a-missing-or-unterminated-frontmatter-block: no silent default state", () => {
  assert.throws(() => parseAdrDocument(1, "# ADR-0001: No frontmatter\n"), /no frontmatter block/);
  assert.throws(() => parseAdrDocument(1, "---\nstatus: accepted\n"), /unterminated frontmatter block/);
});

test("adr-doc-refuses-a-bad-status-or-edge-list: a mistyped value never becomes a default", () => {
  assert.throws(() => parseAdrDocument(1, "---\nstatus: acepted\n---\nbody\n"));
  assert.throws(
    () => parseAdrDocument(1, "---\nstatus: accepted\namends: 139\n---\nbody\n"),
    /must be a list of numbers/,
  );
  assert.throws(
    () => parseAdrDocument(1, '---\nstatus: accepted\namends: ["139"]\n---\nbody\n'),
    /must contain positive integers/,
  );
});

test("adr-doc-takes-the-number-from-the-caller-not-the-heading: a heading is prose, a filename is an allocation", () => {
  // The filename is what the ADR-0050 allocator RESERVED; the H1 is prose anyone can edit. Keying a
  // row off the heading would let a typo re-key the row or collide with another decision's — and
  // both look like a successful write. All 403 committed records agree with their filenames today,
  // so this pins a guard rather than repairing a known rot.
  const mismatched = `---
status: accepted
---
# ADR-0122: A capability declares where its contract tests live
`;
  const fields = parseAdrDocument(353, mismatched);
  assert.equal(fields.number, 353);
  assert.equal(fields.title, "A capability declares where its contract tests live");
  assert.equal(adrDocId(fields.number), "adr-0353");
});

test("adr-doc-id-round-trips-and-refuses-a-near-miss: `adr-` alone is not a decision", () => {
  assert.equal(adrDocId(403), "adr-0403");
  assert.equal(adrDocId(1), "adr-0001");
  assert.equal(adrNumberOfArtifactId("adr-0403"), 403);
  // The collision the four-digit shape guards: a legal artifact id that merely begins `adr-` must
  // read as "not a decision", never resolve to NaN and render as `ADR-NaN`.
  assert.equal(adrNumberOfArtifactId("adr-health-notes"), null);
  assert.equal(adrNumberOfArtifactId("adr-403"), null);
  assert.equal(adrNumberOfArtifactId("merge-ceremony"), null);
});

test("adr-doc-artifact-pointer-resolves-through-the-one-parser: the third spelling joins the other two", () => {
  // ADR-0403 dec 7's whole mechanism: every reader already routes through `parseDecisionPointer`, so
  // the post-migration spelling arrives for free and a corpus mid-rewrite reads the same as one
  // either side of it.
  assert.deepEqual(parseDecisionPointer("asset:adr-0403"), { number: 403, spelling: "asset" });
  assert.equal(
    parseDecisionPointer("asset:adr-0403")?.number,
    parseDecisionPointer("doc:decisions/0403-a-title.md")?.number,
  );
  // A `asset:` pointer at an ordinary artifact is emphatically NOT a decision.
  assert.equal(parseDecisionPointer("asset:merge-ceremony"), null);
});

test("adr-doc-extracts-a-title-or-honestly-reports-none: a bodiless record does not invent one", () => {
  assert.equal(extractAdrTitle("# ADR-0403: A title\n\ntext"), "A title");
  assert.equal(extractAdrTitle("no heading here"), "");
  assert.equal(extractAdrTitle("## ADR-0403: not an H1"), "");
});

test("adr-doc-normalises-crlf: a windows-authored record parses to the same fields", () => {
  const crlf = CANONICAL.replace(/\n/g, "\r\n");
  const fields: AdrDocumentFields = parseAdrDocument(403, crlf);
  assert.deepEqual(fields, parseAdrDocument(403, CANONICAL));
});
