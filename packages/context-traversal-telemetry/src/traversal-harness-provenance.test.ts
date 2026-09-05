/**
 * The provenance table, the census and the ingest receipt — ADR-0484 D5, capability
 * `traversal-event-vocabulary`.
 *
 * WHAT EACH CASE HAS TO BE ABLE TO FAIL AT. The failure this module exists to prevent is a SECONDARY
 * reading presented as a primary one, so every case here is written so that the collapse it guards
 * against is what reds it — a table that answered `storytree-own` for an unknown surface, a census
 * that summed the tiers, a scope string emptied of its narrowness clause, or a receipt that reported
 * a never-run ingest the same way it reports a measured zero.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  censusTraversalProvenance,
  describeHarnessIngest,
  HARNESS_INGEST_ADAPTERS,
  HARNESS_INGEST_RECEIPT_EXT,
  HarnessIngestReceipt,
  harnessIngestReceiptFileName,
  mergeHarnessIngestRun,
  PROVENANCE_PRECEDENCE,
  TRAVERSAL_SURFACE_PROVENANCE,
  traversalProvenanceOf,
  UNCLASSIFIED_SURFACE,
} from "./traversal-harness-provenance.js";

const HARNESS_SURFACE_IDS = [
  "host-transcript-file-read",
  "host-transcript-grep",
  "host-transcript-shell",
  "host-transcript-cli-read",
] as const;

const OWN_SURFACE_IDS = [
  "library-dashboard",
  "library-artifact",
  "library-search",
  "library-query",
  "library-tree-focus",
  "library-inbound",
  "tree",
  "agents",
  "arc",
  "adr",
  "open-question",
  "increment",
  "friction",
  // Joined 2026-09-05 with `storytree resteer list` (ADR-0515).
  "resteer",
] as const;

// ---------------------------------------------------------------------------
// the table
// ---------------------------------------------------------------------------

test("every host-transcript surface is classified harness-derived, never our own", () => {
  for (const surfaceId of HARNESS_SURFACE_IDS) {
    const row = traversalProvenanceOf(surfaceId);
    assert.equal(row.provenance, "harness-derived", surfaceId);
    assert.equal(row.surfaceId, surfaceId);
  }
});

test("every live-observer surface is classified storytree-own, never harness-derived", () => {
  for (const surfaceId of OWN_SURFACE_IDS) {
    const row = traversalProvenanceOf(surfaceId);
    assert.equal(row.provenance, "storytree-own", surfaceId);
    assert.equal(row.surfaceId, surfaceId);
  }
});

test("the table names both tiers and nothing else", () => {
  // A table holding only one tier can answer "is this harness-derived?" only by absence, which is
  // the very inference this module removes. Both populations must actually be in it.
  const tiers = Object.values(TRAVERSAL_SURFACE_PROVENANCE).map((row) => row.provenance);
  assert.ok(tiers.includes("storytree-own"));
  assert.ok(tiers.includes("harness-derived"));
  assert.ok(!tiers.includes("unclassified"), "a declared row is never unclassified");
  assert.equal(
    Object.keys(TRAVERSAL_SURFACE_PROVENANCE).length,
    OWN_SURFACE_IDS.length + HARNESS_SURFACE_IDS.length,
  );
});

test("an unknown surface is unclassified and CARRIES ITS OWN ID, never defaulted into a tier", () => {
  const row = traversalProvenanceOf("some-adapter-nobody-declared");
  assert.equal(row.provenance, "unclassified");
  // The id has to travel or a render cannot name what it could not classify.
  assert.equal(row.surfaceId, "some-adapter-nobody-declared");
  assert.notEqual(row.provenance, "storytree-own");
});

test("an event carrying no surface at all is unclassified, and does not throw", () => {
  const row = traversalProvenanceOf(undefined);
  assert.equal(row.provenance, "unclassified");
  assert.equal(row, UNCLASSIFIED_SURFACE);
});

test("every row states a recorder and a scope, and the harness rows state their narrowness", () => {
  for (const row of Object.values(TRAVERSAL_SURFACE_PROVENANCE)) {
    assert.ok(row.recorder.length > 0, `${row.surfaceId} states no recorder`);
    assert.ok(row.scope.length > 0, `${row.surfaceId} states no scope`);
  }
  // The narrowness clause is the deliverable: every harness surface is DECISION-only, and a reader
  // counting `host-transcript-file-read` as "files the agent read" is wrong by construction.
  for (const surfaceId of HARNESS_SURFACE_IDS) {
    const row = traversalProvenanceOf(surfaceId);
    assert.match(row.scope, /DECISION|decision/, `${surfaceId} does not state what it can observe`);
  }
});

test("the CLI-read surface declares the overlap; the three file-shaped ones declare none", () => {
  // The distinction is load-bearing: it says exactly where the secondary source is a second sighting
  // of an act we already recorded, and where it is the ONLY witness there has ever been.
  assert.equal(traversalProvenanceOf("host-transcript-cli-read").overlaps, "library-artifact");
  for (const surfaceId of ["host-transcript-file-read", "host-transcript-grep", "host-transcript-shell"]) {
    assert.equal(
      traversalProvenanceOf(surfaceId).overlaps,
      undefined,
      `${surfaceId} claims an overlap our own log has never been able to record`,
    );
  }
});

test("the precedence sentence names which tier wins, and it is ours", () => {
  assert.match(PROVENANCE_PRECEDENCE, /storytree log is authoritative/);
  assert.match(PROVENANCE_PRECEDENCE, /SECONDARY/);
});

// ---------------------------------------------------------------------------
// the census
// ---------------------------------------------------------------------------

test("the census counts the two recorders APART rather than summing them", () => {
  const census = censusTraversalProvenance([
    "library-artifact",
    "library-artifact",
    "host-transcript-file-read",
    "host-transcript-cli-read",
    "host-transcript-cli-read",
    "host-transcript-cli-read",
  ]);
  assert.equal(census.own, 2);
  assert.equal(census.harness, 4);
  assert.equal(census.unclassified, 0);
  assert.equal(census.total, 6);
  // Summing them is the exact failure: 6 "reads" of which four are secondary must never read as six.
  assert.notEqual(census.own, census.total);
});

test("an unclassified surface is its own count and never falls into either tier", () => {
  const census = censusTraversalProvenance(["arc", "brand-new-adapter-surface"]);
  assert.equal(census.own, 1);
  assert.equal(census.harness, 0);
  assert.equal(census.unclassified, 1);
  assert.equal(census.total, 2);
});

test("an event with NO surface is counted, not dropped — the denominator stays honest", () => {
  const census = censusTraversalProvenance(["adr", undefined, undefined]);
  assert.equal(census.withoutSurface, 2);
  assert.equal(census.total, 3);
  assert.equal(census.own, 1);
  // It must not be silently folded into any tier.
  assert.equal(census.own + census.harness + census.unclassified + census.withoutSurface, census.total);
  assert.equal(census.surfaces.length, 1);
});

test("the census lists only surfaces PRESENT, most frequent first then by id", () => {
  const census = censusTraversalProvenance([
    "host-transcript-shell",
    "adr",
    "adr",
    "arc",
  ]);
  assert.deepEqual(
    census.surfaces.map((row) => [row.surfaceId, row.count]),
    [
      ["adr", 2],
      ["arc", 1],
      ["host-transcript-shell", 1],
    ],
  );
  // Never the whole table: a surface nothing recorded must not appear with a zero, which would read
  // as an observation of absence.
  assert.ok(census.surfaces.every((row) => row.count > 0));
});

test("each listed surface carries its own scope and overlap, so a render need not re-look-up", () => {
  const census = censusTraversalProvenance(["host-transcript-cli-read"]);
  const [row] = census.surfaces;
  assert.ok(row !== undefined);
  assert.equal(row.provenance, "harness-derived");
  assert.equal(row.overlaps, "library-artifact");
  assert.equal(row.scope, traversalProvenanceOf("host-transcript-cli-read").scope);
});

// ---------------------------------------------------------------------------
// the ingest receipt
// ---------------------------------------------------------------------------

test("NEVER RUN and a measured zero do not print the same way", () => {
  const never = describeHarnessIngest(null);
  assert.match(never, /NEVER RUN/);
  assert.match(never, /UNMEASURED, not zero/);

  const measured = describeHarnessIngest({
    runs: {
      "host-transcript-decision-read": { at: "2026-08-31T01:02:03Z", observed: 0, appended: 0 },
    },
  });
  assert.doesNotMatch(measured, /NEVER RUN/);
  assert.match(measured, /host-transcript-decision-read last ran 2026-08-31T01:02:03Z/);
  assert.match(measured, /observed 0, appended 0/);
  assert.notEqual(never, measured);
});

test("a receipt naming one adapter says the OTHER never ran, rather than staying silent", () => {
  const line = describeHarnessIngest({
    runs: { "host-transcript-occupancy": { at: "2026-08-31T00:00:00Z", observed: 3, appended: 3 } },
  });
  assert.match(line, /host-transcript-decision-read never run/);
});

test("an empty runs record is the never-run answer, not a partial one", () => {
  // A receipt file can exist with nothing in it; that is still "nobody has measured this".
  assert.match(describeHarnessIngest({ runs: {} }), /NEVER RUN/);
});

test("merging a run keeps the other adapter's row and replaces its own", () => {
  const first = mergeHarnessIngestRun(null, "host-transcript-occupancy", {
    at: "2026-08-30T00:00:00Z",
    observed: 1,
    appended: 1,
  });
  const second = mergeHarnessIngestRun(first, "host-transcript-decision-read", {
    at: "2026-08-30T01:00:00Z",
    observed: 5,
    appended: 5,
  });
  const third = mergeHarnessIngestRun(second, "host-transcript-occupancy", {
    at: "2026-08-31T00:00:00Z",
    observed: 2,
    appended: 0,
  });

  assert.deepEqual(third.runs["host-transcript-decision-read"], {
    at: "2026-08-30T01:00:00Z",
    observed: 5,
    appended: 5,
  });
  assert.deepEqual(third.runs["host-transcript-occupancy"], {
    at: "2026-08-31T00:00:00Z",
    observed: 2,
    appended: 0,
  });
  // Pure: the inputs are not mutated, so a caller may keep the value it read from disk.
  assert.equal(first.runs["host-transcript-decision-read"], undefined);
  assert.deepEqual(second.runs["host-transcript-occupancy"], {
    at: "2026-08-30T00:00:00Z",
    observed: 1,
    appended: 1,
  });
});

test("the receipt schema refuses a negative count and an unknown key", () => {
  assert.equal(
    HarnessIngestReceipt.safeParse({
      runs: { "host-transcript-occupancy": { at: "2026-08-31T00:00:00Z", observed: -1, appended: 0 } },
    }).success,
    false,
  );
  assert.equal(
    HarnessIngestReceipt.safeParse({
      runs: { "host-transcript-occupancy": { at: "", observed: 0, appended: 0 } },
    }).success,
    false,
  );
  assert.equal(
    HarnessIngestReceipt.safeParse({ runs: {}, extra: 1 }).success,
    false,
  );
});

test("a receipt written by a LATER adapter still parses on this reader", () => {
  // Refusing the whole file because it names an adapter this build has not heard of would lose the
  // answer to "has anything ever looked at this session" in order to learn nothing.
  const parsed = HarnessIngestReceipt.safeParse({
    runs: { "host-transcript-something-new": { at: "2026-09-01T00:00:00Z", observed: 7, appended: 7 } },
  });
  assert.equal(parsed.success, true);
  // …and it still reports NEVER RUN for the two adapters this build knows, which is true.
  assert.match(describeHarnessIngest(parsed.success ? parsed.data : null), /NEVER RUN/);
});

test("the receipt file name is one spelling, beside the trace", () => {
  assert.equal(HARNESS_INGEST_RECEIPT_EXT, ".ingest.json");
  assert.equal(harnessIngestReceiptFileName("nice-bose-6e4501"), "nice-bose-6e4501.ingest.json");
  assert.equal(HARNESS_INGEST_ADAPTERS.length, 2);
});

test("a trace holding harness readings but no receipt is NOT reported as never run", () => {
  // The third answer, and the one a two-state design gets wrong: every harness-derived event already
  // on disk was ingested before receipts existed. "Never run" over a trace that visibly carries those
  // readings denies an observation the replay is showing; "measured" would date a look nobody
  // recorded. The honest line says the readings are there and their last look cannot be dated.
  const line = describeHarnessIngest(null, 8);
  assert.doesNotMatch(line, /NEVER RUN/);
  assert.match(line, /NO RECEIPT/);
  assert.match(line, /8 harness-derived reading\(s\)/);
  assert.match(line, /cannot\s+be dated/);
});

test("with no harness reading at all, no receipt is still the never-run answer", () => {
  assert.match(describeHarnessIngest(null, 0), /NEVER RUN/);
  // The default is the conservative one, so a caller that has not counted gets the same answer.
  assert.equal(describeHarnessIngest(null), describeHarnessIngest(null, 0));
});

test("a receipt outranks the harness count: a measured session is dated whatever it holds", () => {
  const line = describeHarnessIngest(
    { runs: { "host-transcript-occupancy": { at: "2026-08-31T00:00:00Z", observed: 4, appended: 4 } } },
    8,
  );
  assert.doesNotMatch(line, /NO RECEIPT/);
  assert.doesNotMatch(line, /NEVER RUN/);
  assert.match(line, /host-transcript-occupancy last ran/);
});

// ---------------------------------------------------------------------------
// the prose IS the deliverable, so it is asserted clause by clause
// ---------------------------------------------------------------------------
//
// Deliverables 2 and 3 are SENTENCES: that a harness reading is secondary, and what each harness
// surface can actually observe. A row whose scope had been emptied would still pass a
// `length > 0` check as long as one of its concatenated halves survived — so each half is named
// here by a phrase that carries the claim, not by its exact wording.

test("the unclassified reading says what it is and what to do with it", () => {
  // Its id is EMPTY on the shared constant — the id travels only on the per-call copy, so a reader
  // cannot be handed a fabricated surface name.
  assert.equal(UNCLASSIFIED_SURFACE.surfaceId, "");
  assert.match(UNCLASSIFIED_SURFACE.recorder, /no adapter has declared/);
  assert.match(UNCLASSIFIED_SURFACE.scope, /not in the provenance table/);
  assert.match(UNCLASSIFIED_SURFACE.scope, /Weigh it as neither tier/);
});

test("an own row says the argv shape IS the observation — no recovery, no text matching", () => {
  const own = traversalProvenanceOf("library-artifact");
  assert.match(own.recorder, /in our own process as the command ran/);
  assert.match(own.scope, /the argv shape IS the observation/);
  assert.match(own.scope, /no text matching and no after-the-fact recovery/);
});

test("a harness row says it is read AFTERWARDS and is never ambient", () => {
  for (const surfaceId of HARNESS_SURFACE_IDS) {
    const row = traversalProvenanceOf(surfaceId);
    assert.match(row.recorder, /read back AFTERWARDS/, surfaceId);
    assert.match(row.recorder, /never ambient/, surfaceId);
  }
});

test("each harness surface states its OWN narrowness, clause by clause", () => {
  // The file read is the one a reader takes for general file capture, so it carries the loudest
  // denial and the reason it can only be historical.
  const file = traversalProvenanceOf("host-transcript-file-read").scope;
  assert.match(file, /and NOTHING ELSE/);
  assert.match(file, /not general file capture/);
  assert.match(file, /deleted whole/);
  assert.match(file, /can only be empty for anything since/);

  // The grep is narrower still: a directory grep names no file and is not seen at all.
  const grep = traversalProvenanceOf("host-transcript-grep").scope;
  assert.match(grep, /exact path of a harness grep/);
  assert.match(grep, /invisible here/);

  // The shell scrape declares its own under-reporting rather than presenting a floor as a census.
  const shell = traversalProvenanceOf("host-transcript-shell").scope;
  assert.match(shell, /scraped out of an opaque shell command/);
  assert.match(shell, /under-reports/);

  // The store route is the only one a post-migration session can produce, and the only duplicate.
  const cli = traversalProvenanceOf("host-transcript-cli-read").scope;
  assert.match(cli, /the only shape a/);
  assert.match(cli, /DUPLICATES an act/);
  assert.match(cli, /our own log already recorded/);
});

test("the ingest line separates its adapters, so two rows never read as one sentence", () => {
  const line = describeHarnessIngest({
    runs: {
      "host-transcript-occupancy": { at: "2026-08-31T00:00:00Z", observed: 1, appended: 1 },
      "host-transcript-decision-read": { at: "2026-08-31T01:00:00Z", observed: 2, appended: 2 },
    },
  });
  assert.match(line, /^harness ingest: /);
  assert.match(line, /appended 1\); host-transcript-decision-read last ran/);
  assert.match(line, /\.$/);
});

test("an empty list censuses to zeros through the same fold as a full one", () => {
  // There is no empty-input shortcut: the loop produces the zero census itself, so this asserts the
  // ordinary path rather than a constant somebody could change independently of it.
  const census = censusTraversalProvenance([]);
  assert.deepEqual(census, {
    total: 0,
    own: 0,
    harness: 0,
    unclassified: 0,
    withoutSurface: 0,
    surfaces: [],
  });
});
