import test from "node:test";
import assert from "node:assert/strict";

import {
  bodyReferencesDecision,
  evaluateAmendsAnnotation,
  isVacuousAmendsAnnotationRead,
  VACUOUS_AMENDS_ANNOTATION_READ_FLOOR,
  type AmendsAnnotationDecision,
} from "./amends-annotation.js";

/**
 * ADR-0419 Decision 4's in-place annotation floor, as a pure judge over decision rows.
 *
 * Hermetic by construction — literal rows, no store, no credential (ADR-0302 D3), no clock. The
 * subject is UNWIRED: no gate rung runs it (see the module header), so these tests are the only
 * thing standing between the predicate and the `an-expectation-derived-from-its-subject-cannot-fail`
 * class it exists to avoid.
 *
 * MUTATION-TESTED, which is the only reason to believe them. The predicate was deliberately broken
 * three ways on 2026-08-23 and the suite re-run against each, from a clean baseline every time:
 *
 *   - `evaluateAmendsAnnotation` stubbed to return a clean, all-zero verdict unconditionally →
 *     **12 of 13 RED**. The single survivor is the spelling case, which exercises
 *     {@link bodyReferencesDecision} alone and never calls the judge — correct by construction.
 *   - `bodyReferencesDecision` stubbed to `return true` unconditionally (every body "annotates"
 *     everything) → **7 of 13 RED**.
 *   - The DIRECTION inverted — the amender's body searched for the target's number instead of the
 *     reverse, which is the realistic regression → **7 of 13 RED**.
 *
 * Reverted, all 13 GREEN. The first run found a real hole: `amends-annotation-expects-from-the-field-
 * not-the-prose` originally asserted only zeros and SURVIVED the stub, so it now carries a positive
 * control. If a future edit makes this file pass against a stubbed judge, the edit is wrong, not the
 * suite.
 */

/** One decision row. `status` defaults to accepted, because that is the state that obliges anything. */
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

/** A body that mentions nothing at all — no H1, so it cannot accidentally name its own number. */
const SILENT = "## Status\n\naccepted (2026-08-23)\n\n## Decision\n\nSomething was decided.\n";

test("amends-annotation-reports-its-denominators: an empty read is green and says nothing was measured", () => {
  const verdict = evaluateAmendsAnnotation([]);

  // The flag alone is vacuously true — which is precisely why it is never read alone.
  assert.equal(verdict.annotated, true);
  assert.equal(verdict.decisionsScanned, 0);
  assert.equal(verdict.edgesScanned, 0);
  assert.equal(verdict.edgesJudged, 0);
  assert.equal(verdict.edgesAnnotated, 0);
  assert.equal(verdict.edgesUnannotated, 0);
  assert.equal(verdict.targetsScanned, 0);
  assert.deepEqual(verdict.unannotatedTargets, []);

  // A corpus with decisions but no amendments is honestly green: it owes nothing. The denominator
  // is what separates it from the empty read above.
  const noEdges = evaluateAmendsAnnotation([adr(1), adr(2), adr(3)]);
  assert.equal(noEdges.annotated, true);
  assert.equal(noEdges.decisionsScanned, 3);
  assert.equal(noEdges.edgesScanned, 0);
});

test("amends-annotation-vacuity-is-a-rule-not-a-printed-number: a real-sized log with zero edges is blind", () => {
  // Below the floor, "this corpus genuinely has no amendments" is a plausible truth — the hermetic
  // fixture holds zero `adr` rows at all. At or above it, that explanation has run out.
  const small = evaluateAmendsAnnotation([adr(1), adr(2)]);
  assert.equal(isVacuousAmendsAnnotationRead(small), false);

  const wide: AmendsAnnotationDecision[] = [];
  for (let n = 1; n <= VACUOUS_AMENDS_ANNOTATION_READ_FLOOR + 20; n += 1) wide.push(adr(n));
  const blind = evaluateAmendsAnnotation(wide);
  assert.equal(blind.annotated, true, "the graph itself owes nothing — vacuity is a fact about the READ");
  assert.equal(isVacuousAmendsAnnotationRead(blind), true);

  // One real edge acquits the read, however large the log.
  const sighted = evaluateAmendsAnnotation([...wide.slice(1), adr(999, { amends: [1] }), adr(1)]);
  assert.equal(sighted.edgesScanned, 1);
  assert.equal(isVacuousAmendsAnnotationRead(sighted), false);
});

test("amends-annotation-catches-a-silent-target: an accepted amender whose target never names it", () => {
  // The failure ADR-0419 measured: 174 live edges, 58 targets naming none of their amenders.
  const verdict = evaluateAmendsAnnotation([
    adr(139, { body: SILENT }),
    adr(419, { amends: [139], body: "# ADR-0419: ...\n\n**Amends** ADR-0139 — D4's floor is not holding." }),
  ]);

  assert.equal(verdict.annotated, false);
  assert.equal(verdict.decisionsScanned, 2);
  assert.equal(verdict.edgesScanned, 1);
  assert.equal(verdict.edgesJudged, 1);
  assert.equal(verdict.edgesAnnotated, 0);
  assert.equal(verdict.edgesUnannotated, 1);
  assert.equal(verdict.targetsScanned, 1);
  assert.equal(verdict.targetsAnnotated, 0);
  assert.deepEqual(verdict.unannotatedTargets, [
    { number: 139, status: "accepted", acceptedAmenders: 1, missingAmenders: [419] },
  ]);
});

test("amends-annotation-passes-an-annotated-target: a mention in the target body discharges the edge", () => {
  const verdict = evaluateAmendsAnnotation([
    adr(139, { body: "## Status\n\naccepted — **amended by ADR-0419**, which narrowed D4.\n" }),
    adr(419, { amends: [139], body: SILENT }),
  ]);

  assert.equal(verdict.annotated, true);
  assert.equal(verdict.edgesScanned, 1);
  assert.equal(verdict.edgesAnnotated, 1);
  assert.equal(verdict.edgesUnannotated, 0);
  assert.equal(verdict.targetsScanned, 1);
  assert.equal(verdict.targetsAnnotated, 1);
  assert.deepEqual(verdict.unannotatedTargets, []);
});

test("amends-annotation-obligation-is-on-the-target: the amender describing what it amends discharges nothing", () => {
  // The easy inversion. ADR-0419's own body carries `**Amends** ADR-0402` paragraphs; they are the
  // amender speaking, and the reader of ADR-0402 never sees them.
  const verdict = evaluateAmendsAnnotation([
    adr(402, { body: SILENT }),
    adr(419, { amends: [402], body: "**Amends** ADR-0402 — D2's asymmetry is upheld, not reversed." }),
  ]);

  assert.equal(verdict.annotated, false);
  assert.deepEqual(verdict.unannotatedTargets.map((t) => t.number), [402]);
});

test("amends-annotation-expects-from-the-field-not-the-prose: `amended by` prose is never the expectation", () => {
  // The `an-expectation-derived-from-its-subject-cannot-fail` fence, as a test. If the expected set
  // were ever re-derived by scanning bodies for "amended by" lines, this corpus would read as one
  // annotated edge — and the check could never fail again.
  const verdict = evaluateAmendsAnnotation([
    adr(139, { body: "## Status\n\naccepted — amended by ADR-0419.\n" }),
    adr(419, { amends: [], body: SILENT }),
  ]);

  assert.equal(verdict.edgesScanned, 0, "no `amends` FIELD entry means no edge, whatever the prose says");
  assert.equal(verdict.targetsScanned, 0);
  assert.equal(verdict.edgesAnnotated, 0);

  // THE POSITIVE CONTROL, and it is not optional. The three assertions above are satisfied by a
  // judge that returns clean unconditionally — they were the ONE case that survived the
  // stub-the-judge mutation run, which is exactly how a green-that-verified-nothing gets written.
  // The same bodies with the FIELD populated must produce the edge the prose alone could not.
  const withField = evaluateAmendsAnnotation([
    adr(139, { body: "## Status\n\naccepted — amended by ADR-0419.\n" }),
    adr(419, { amends: [139], body: SILENT }),
  ]);
  assert.equal(withField.edgesScanned, 1);
  assert.equal(withField.targetsScanned, 1);
  assert.equal(withField.edgesAnnotated, 1);
});

test("amends-annotation-counts-only-accepted-amenders: proposed and superseded edges oblige nothing", () => {
  // Same rule `loadBearingReach` applies: a proposed amender has not been decided and a superseded
  // one is dead, so neither reaches into anything (ADR-0139).
  const verdict = evaluateAmendsAnnotation([
    adr(139, { body: SILENT }),
    adr(300, { status: "proposed", amends: [139], body: SILENT }),
    adr(301, { status: "superseded", amends: [139], body: SILENT }),
  ]);

  assert.equal(verdict.decisionsScanned, 3);
  assert.equal(verdict.edgesScanned, 0);
  assert.equal(verdict.annotated, true);
  assert.deepEqual(verdict.unannotatedTargets, []);

  // ...and flipping ONE of them to accepted makes the same corpus owe exactly one annotation.
  const flipped = evaluateAmendsAnnotation([
    adr(139, { body: SILENT }),
    adr(300, { status: "accepted", amends: [139], body: SILENT }),
    adr(301, { status: "superseded", amends: [139], body: SILENT }),
  ]);
  assert.equal(flipped.edgesScanned, 1);
  assert.equal(flipped.edgesUnannotated, 1);
  assert.deepEqual(flipped.unannotatedTargets[0]?.missingAmenders, [300]);
});

test("amends-annotation-reports-what-a-target-still-owes: six amenders, four named, two outstanding", () => {
  // ADR-0020's live shape (six accepted amendments, none named) is the worst case the ADR names;
  // this is the partial version, which is what a batch drain actually watches.
  const target = adr(20, {
    body: "## Status\n\naccepted — amended by ADR-0060 (write scope), 0081 (persistence), " +
      "ADR-0192 and asset:adr-0252 (review).\n",
  });
  const verdict = evaluateAmendsAnnotation([
    target,
    adr(60, { amends: [20], body: SILENT }),
    adr(81, { amends: [20], body: SILENT }),
    adr(192, { amends: [20], body: SILENT }),
    adr(252, { amends: [20], body: SILENT }),
    adr(259, { amends: [20], body: SILENT }),
    adr(276, { amends: [20], body: SILENT }),
  ]);

  assert.equal(verdict.annotated, false);
  assert.equal(verdict.edgesScanned, 6);
  assert.equal(verdict.edgesJudged, 6);
  assert.equal(verdict.edgesAnnotated, 4);
  assert.equal(verdict.edgesUnannotated, 2);
  assert.equal(verdict.targetsScanned, 1);
  assert.equal(verdict.targetsAnnotated, 0);
  assert.deepEqual(verdict.unannotatedTargets, [
    { number: 20, status: "accepted", acceptedAmenders: 6, missingAmenders: [259, 276] },
  ]);
});

test("amends-annotation-counts-a-dangling-target-without-flipping-the-verdict", () => {
  // An unresolvable pointer is `adr-edge-integrity`'s fault to report (ADR-0037 §3). Folding it in
  // here would make a broken edge indistinguishable from a missing annotation.
  const verdict = evaluateAmendsAnnotation([
    adr(419, { amends: [139, 8888], body: SILENT }),
    adr(139, { body: "amended by 0419 — D4 gained a mechanical floor." }),
  ]);

  assert.equal(verdict.edgesScanned, 2);
  assert.equal(verdict.edgesJudged, 1);
  assert.equal(verdict.edgesAnnotated, 1);
  assert.equal(verdict.danglingEdges, 1);
  assert.deepEqual(verdict.danglingTargets, [8888]);
  assert.equal(verdict.annotated, true);
  assert.deepEqual(verdict.unannotatedTargets, []);
});

test("amends-annotation-is-total-over-untrusted-rows: duplicates, malformed entries and empty bodies", () => {
  const verdict = evaluateAmendsAnnotation([
    // A duplicate `amends` entry is one EDGE, not two — the denominator counts edges, not slots.
    adr(419, { amends: [139, 139, Number.NaN, 3.5, 0, -7], body: SILENT }),
    adr(139, { body: "" }),
    // FIRST row wins on a duplicate number: a later row must not silently re-target the edge above.
    adr(139, { body: "amended by ADR-0419, which is the annotation this row would forge." }),
  ]);

  assert.equal(verdict.decisionsScanned, 2);
  assert.equal(verdict.edgesScanned, 1);
  assert.equal(verdict.malformedTargets, 4);
  assert.equal(verdict.edgesUnannotated, 1, "the FIRST 139 row — the one with the empty body — is judged");
  assert.deepEqual(verdict.unannotatedTargets[0]?.missingAmenders, [419]);

  // And an entirely unreadable status is simply not `accepted`, never a throw.
  const odd = evaluateAmendsAnnotation([adr(1, { status: "", amends: [2] }), adr(2, { body: SILENT })]);
  assert.equal(odd.edgesScanned, 0);
});

test("amends-annotation-orders-its-burndown-deterministically: two runs must print identically", () => {
  const rows: AmendsAnnotationDecision[] = [
    adr(300, { amends: [42, 7], body: SILENT }),
    adr(100, { amends: [42], body: SILENT }),
    adr(7, { body: SILENT }),
    adr(42, { body: SILENT }),
    adr(200, { amends: [42], body: SILENT }),
  ];
  const forward = evaluateAmendsAnnotation(rows);
  const reversed = evaluateAmendsAnnotation([...rows].reverse());

  assert.deepEqual(forward.unannotatedTargets, [
    { number: 7, status: "accepted", acceptedAmenders: 1, missingAmenders: [300] },
    { number: 42, status: "accepted", acceptedAmenders: 3, missingAmenders: [100, 200, 300] },
  ]);
  assert.deepEqual(reversed.unannotatedTargets, forward.unannotatedTargets);
  assert.equal(forward.edgesScanned, 4);
  assert.equal(forward.edgesUnannotated, 4);
  assert.equal(forward.targetsScanned, 2);
});

test("amends-annotation-matches-the-spellings-the-corpus-writes: padded runs, ADR- labels, and boundaries", () => {
  // The spellings that COUNT.
  for (const body of [
    "amended by 0419",
    "see ADR-0419",
    "see adr-0419 for the floor",
    "asset:adr-0419",
    "(#0419)",
    "ADR–0419 — an en dash, which the bare padded run still catches",
    "ADR 419",
    "adr-419",
  ]) {
    assert.equal(bodyReferencesDecision(body, 419), true, `expected a match in ${JSON.stringify(body)}`);
  }

  // The boundaries. A four-digit run inside a longer number is not a mention.
  for (const body of ["10419", "20419", "04190", "no mention at all", ""]) {
    assert.equal(bodyReferencesDecision(body, 419), false, `expected NO match in ${JSON.stringify(body)}`);
  }

  // THE PADDING RULE, which is the one tightening that is not optional. Without it `20 minutes`
  // would annotate ADR-0020 — the very decision ADR-0419 names as the worst case in the corpus.
  assert.equal(bodyReferencesDecision("this took 20 minutes and 20 seconds", 20), false);
  assert.equal(bodyReferencesDecision("the year 2026 and the 2020s", 20), false);
  assert.equal(bodyReferencesDecision("amended by 0020", 20), true);
  assert.equal(bodyReferencesDecision("see ADR-20", 20), true);

  // TOTAL over nonsense numbers rather than throwing.
  for (const bad of [0, -1, 3.5, Number.NaN]) {
    assert.equal(bodyReferencesDecision("0000 -1 3.5 NaN", bad), false);
  }
});

test("amends-annotation-catches-absence-never-thinness: a bare number passes and still fails ADR-0139 D4", () => {
  // The declared limit, asserted so nobody later reads a green as compliance. `adr list` already
  // derives and prints the edge, so this body is the double-entry ADR-0037 §1 forbids — and the
  // predicate says PASS. The editorial bar stays a librarian's.
  const verdict = evaluateAmendsAnnotation([
    adr(139, { body: "## Status\n\naccepted — amended by 0419.\n" }),
    adr(419, { amends: [139], body: SILENT }),
  ]);

  assert.equal(verdict.annotated, true);
  assert.equal(verdict.edgesAnnotated, 1);

  // ...and the same is true of a mention that annotates nothing whatsoever. This is the CEILING the
  // module header declares: any mention counts, so the reported figure is the optimistic end.
  const incidental = evaluateAmendsAnnotation([
    adr(139, { body: "## Context\n\nWe ran 0419 traversal probes over the corpus.\n" }),
    adr(419, { amends: [139], body: SILENT }),
  ]);
  assert.equal(incidental.annotated, true);
});
