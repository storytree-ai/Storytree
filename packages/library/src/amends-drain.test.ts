import test from "node:test";
import assert from "node:assert/strict";

import {
  mentioningParagraphs,
  rehomeWorklistBySource,
  type AmendsAnnotationDecision,
} from "./index.js";

/**
 * ADR-0419 Decision 3's drain worklist — the SOURCE-partitioned rehoming view and the evidence it
 * carries.
 *
 * Hermetic by construction: literal rows, no store, no credential (ADR-0302 D3), no clock. The
 * subject is a DIAGNOSTIC — `probe:amends-drain` prints it and no gate rung runs it — so this suite
 * is the only thing holding it, exactly as `amends-annotation.test.ts` is for its sibling judge.
 *
 * MUTATION-TESTED on 2026-08-23, from a clean baseline each time:
 *
 *   - `rehomeWorklistBySource` stubbed to return empty rows with all-zero counts → **9 of 10 RED**.
 *     The single survivor is `mentioning-paragraphs-bounds-its-match-and-honours-its-cap`, which
 *     exercises {@link mentioningParagraphs} alone and never calls the worklist — correct by
 *     construction.
 *   - `mentioningParagraphs` stubbed to `return []` unconditionally (every edge looks like plain
 *     support) → **3 of 10 RED**. The narrowest of the three, and the one that matters most: an
 *     empty paragraph list is the probe's stated hint of PLAIN SUPPORT, so a silently-blind
 *     extractor would push a draining session toward rehoming edges that are real amendments.
 *     THE FIRST RUN FOUND A REAL HOLE HERE — `amends-drain-flags-a-source-that-says-nothing-about-
 *     its-target` asserted only an empty list and SURVIVED the stub, since a blind extractor
 *     satisfies an absence assertion perfectly. It now carries a positive control in the same read.
 *   - The PARTITION inverted — rows keyed by target instead of by source, the realistic regression
 *     and the one ADR-0419 names as losing data at exit code 0 → **4 of 10 RED**.
 *
 * Reverted, all 10 GREEN. If a future edit makes this file pass against a stubbed worklist, the edit
 * is wrong, not the suite.
 */

/** One decision row. `status` defaults to accepted, the only state that puts an edge in the drain. */
function adr(
  decisionNumber: number,
  fields: { status?: string; amends?: readonly number[]; body?: string } = {},
): AmendsAnnotationDecision {
  return {
    number: decisionNumber,
    status: fields.status ?? "accepted",
    amends: fields.amends ?? [],
    body: fields.body ?? `# ADR-${String(decisionNumber).padStart(4, "0")}: a decision`,
  };
}

/** A body naming no decision at all — no H1, so it cannot accidentally mention its own number. */
const SILENT = "## Status\n\naccepted (2026-08-23)\n\n## Decision\n\nSomething was decided.\n";

test("amends-drain-partitions-by-source: one amender with three targets is ONE row, not three", () => {
  const worklist = rehomeWorklistBySource([
    adr(500, { amends: [10, 20, 30] }),
    adr(10, { body: SILENT }),
    adr(20, { body: SILENT }),
    adr(30, { body: SILENT }),
  ]);

  // THE PARTITION IS THE POINT (ADR-0419's write-partition hazard). Rehoming writes the SOURCE's
  // `amends` array, so three edges from one amender must arrive as a single unit of work — a
  // target-keyed grouping would hand the same array to three writers.
  assert.equal(worklist.sources.length, 1);
  assert.equal(worklist.sources[0]?.number, 500);
  assert.deepEqual(
    worklist.sources[0]?.edges.map((e) => e.target),
    [10, 20, 30],
  );
});

test("amends-drain-groups-many-amenders-of-one-target-separately: six amenders are six rows", () => {
  const rows = [adr(20, { body: SILENT })];
  for (const source of [271, 300, 311, 324, 346, 419]) rows.push(adr(source, { amends: [20] }));

  const worklist = rehomeWorklistBySource(rows);

  // The inverse of the case above, and the one that proves the two views are genuinely different.
  // ADR-0020 is ADR-0419's worst case: six amendments, none named. For ANNOTATION that is one
  // coherent pass over ADR-0020's body; for REHOMING it is six separate writes to six sources.
  assert.equal(worklist.sources.length, 6);
  assert.deepEqual(
    worklist.sources.map((s) => s.number),
    [271, 300, 311, 324, 346, 419],
  );
  assert.equal(worklist.edgesScanned, 6);
  assert.equal(worklist.edgesSilent, 6);
});

test("amends-drain-reports-its-denominators: an empty read says nothing was measured", () => {
  const empty = rehomeWorklistBySource([]);
  assert.deepEqual(empty.sources, []);
  assert.equal(empty.decisionsScanned, 0);
  assert.equal(empty.edgesScanned, 0);
  assert.equal(empty.edgesResolved, 0);
  assert.equal(empty.edgesSilent, 0);

  // A drained corpus and an unread one must not print alike. Three real decisions with no edges is
  // a DIFFERENT state from three decisions nobody read, and only the denominator separates them.
  const noEdges = rehomeWorklistBySource([adr(1), adr(2), adr(3)]);
  assert.deepEqual(noEdges.sources, []);
  assert.equal(noEdges.decisionsScanned, 3);
  assert.equal(noEdges.edgesScanned, 0);
});

test("amends-drain-carries-the-source-prose-as-evidence: the amender's own words travel with the edge", () => {
  const source = adr(419, {
    amends: [402],
    body: [
      "# ADR-0419: support edges move to dependsOn",
      "",
      "**Amends** ADR-0402 — D2 kept `amends` unrenamed on the grounds that it means more than",
      "depends on. That reasoning is upheld, not reversed.",
      "",
      "## Context",
      "",
      "An unrelated paragraph mentioning nothing.",
    ].join("\n"),
  });

  const worklist = rehomeWorklistBySource([source, adr(402, { body: SILENT })]);
  const edge = worklist.sources[0]?.edges[0];

  assert.equal(edge?.target, 402);
  assert.equal(edge?.sourceParagraphs.length, 1);
  // BYTE-EXACT (bar the trim). The verdict is editorial and is made on this prose, so a paraphrase
  // here would be the third-hand summary the whole arc exists to avoid.
  assert.match(String(edge?.sourceParagraphs[0]), /D2 kept `amends` unrenamed/);
  assert.doesNotMatch(String(edge?.sourceParagraphs[0]), /unrelated paragraph/);
});

test("amends-drain-flags-a-source-that-says-nothing-about-its-target: the plain-support hint", () => {
  // The strongest available hint of PLAIN SUPPORT — a source naming a target in its `amends` field
  // while its body never discusses it. It is a HINT and not a verdict, which is why the module
  // reports it and classifies nothing; the probe prints that caveat beside it.
  //
  // ⚠ CARRIES A POSITIVE CONTROL, and it is not decoration. Asserting an EMPTY list alone cannot
  // fail against a blind extractor — `mentioningParagraphs` stubbed to `return []` satisfies it
  // perfectly, and this test originally survived exactly that mutation. The second source proves
  // the extractor was WORKING in the same read that reported nothing for the first, which is the
  // only way an absence assertion means anything (`an-expectation-derived-from-its-subject-cannot-fail`).
  const worklist = rehomeWorklistBySource([
    adr(500, { amends: [10], body: SILENT }),
    adr(501, { amends: [10], body: "## Context\n\nThis narrows ADR-0010's second clause.\n" }),
    adr(10, { body: SILENT }),
  ]);

  const silentSource = worklist.sources.find((s) => s.number === 500);
  assert.deepEqual(silentSource?.edges[0]?.sourceParagraphs, []);
  assert.equal(silentSource?.edges[0]?.targetMentionsSource, false);

  const speakingSource = worklist.sources.find((s) => s.number === 501);
  assert.equal(speakingSource?.edges[0]?.sourceParagraphs.length, 1);
  assert.match(String(speakingSource?.edges[0]?.sourceParagraphs[0]), /narrows ADR-0010's second clause/);
});

test("amends-drain-marks-an-annotated-edge: a target naming its amender is not silent", () => {
  const worklist = rehomeWorklistBySource([
    adr(500, { amends: [10] }),
    adr(10, { body: "## Decision\n\nNarrowed by ADR-0500 to the read-obligation case.\n" }),
  ]);

  const edge = worklist.sources[0]?.edges[0];
  assert.equal(edge?.targetMentionsSource, true);
  assert.equal(worklist.edgesSilent, 0);
  assert.equal(worklist.edgesResolved, 1);
});

test("amends-drain-counts-only-accepted-sources: proposed and superseded amenders own no drain work", () => {
  const rows = [
    adr(500, { status: "proposed", amends: [10] }),
    adr(501, { status: "superseded", amends: [10] }),
    adr(10, { body: SILENT }),
  ];

  const worklist = rehomeWorklistBySource(rows);

  // Matched POSITIVELY on `accepted`, never by excluding `superseded` — `decision-pointer.ts`'s
  // rule. A proposed amender has not been decided and a superseded one is dead, so neither reaches
  // into anything, which is the same line `loadBearingReach` draws.
  assert.deepEqual(worklist.sources, []);
  assert.equal(worklist.edgesScanned, 0);
  assert.equal(worklist.decisionsScanned, 3);

  const accepted = rehomeWorklistBySource([adr(500, { amends: [10] }), adr(10, { body: SILENT })]);
  assert.equal(accepted.edgesScanned, 1);
});

test("amends-drain-separates-a-dangling-target-from-a-silent-one", () => {
  const worklist = rehomeWorklistBySource([adr(500, { amends: [9999] })]);
  const edge = worklist.sources[0]?.edges[0];

  // An unresolvable pointer is a DIFFERENT fault (`adr-edge-integrity`, ADR-0037 §3). Folding it
  // into the burndown would make a broken pointer indistinguishable from a missing annotation, so
  // it is resolved-false and excluded from `edgesSilent` while still counting as a scanned edge.
  assert.equal(edge?.targetResolved, false);
  assert.equal(edge?.targetStatus, "(unresolved)");
  assert.equal(worklist.edgesScanned, 1);
  assert.equal(worklist.edgesResolved, 0);
  assert.equal(worklist.edgesSilent, 0);
});

test("amends-drain-is-total-over-untrusted-rows: duplicate numbers, duplicate and malformed edges", () => {
  const worklist = rehomeWorklistBySource([
    // FIRST row wins on a duplicate number, matching `evaluateAmendsAnnotation` and
    // `findDependsOnCycles` — re-pointing a number at a later row silently re-targets every edge.
    adr(500, { amends: [10, 10, Number.NaN as number, -3, 3.5, 20] }),
    adr(500, { amends: [999] }),
    adr(10, { body: SILENT }),
    adr(20, { body: SILENT }),
  ]);

  assert.equal(worklist.decisionsScanned, 3);
  assert.equal(worklist.sources.length, 1);
  // Duplicates deduped and malformed entries skipped, so the denominator counts EDGES rather than
  // array slots — the same arithmetic the annotation judge does, so the two views are comparable.
  assert.deepEqual(
    worklist.sources[0]?.edges.map((e) => e.target),
    [10, 20],
  );
  assert.equal(worklist.edgesScanned, 2);
  assert.deepEqual(mentioningParagraphs("", 10), []);
});

test("mentioning-paragraphs-bounds-its-match-and-honours-its-cap", () => {
  const body = [
    "A paragraph about ADR-0020.",
    "",
    "A paragraph about 10419 and 20419, which name nothing.",
    "",
    "Another about ADR-20, the short form.",
    "",
    "A third about 0020.",
    "",
    "A fourth about ADR-0020, past the cap.",
  ].join("\n");

  // The padding rule is the one tightening that is not optional: an unpadded bare match would make
  // `20 minutes` annotate ADR-0020, the very decision ADR-0419 names as the worst case.
  const found = mentioningParagraphs(body, 20);
  assert.equal(found.length, 3);
  assert.match(String(found[0]), /A paragraph about ADR-0020/);
  assert.match(String(found[1]), /the short form/);
  assert.doesNotMatch(found.join("\n"), /10419/);
  assert.doesNotMatch(found.join("\n"), /past the cap/);

  // TOTAL over untrusted input rather than throwing — the read side of what may become a
  // fail-closed rung, where a surprise row must not be where the gate goes down.
  assert.deepEqual(mentioningParagraphs(body, 0), []);
  assert.deepEqual(mentioningParagraphs(body, 3.5), []);
  assert.deepEqual(mentioningParagraphs(body, 20, 1).length, 1);
});
