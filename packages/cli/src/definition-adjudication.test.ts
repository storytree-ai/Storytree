import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ADJUDICATED_WITHOUT_EDGES,
  evaluateDefinitionAdjudication,
  isVacuousDefinitionRead,
  VACUOUS_DEFINITION_READ_FLOOR,
  type AdjudicationRow,
} from "./definition-adjudication.js";

/**
 * ADR-0468 D3's rung, proven hermetically. Every assertion here is over a LITERAL corpus, never the
 * live store — the store-reading half is `check-definition-adjudication.ts` and this leg is
 * credential-free (ADR-0302 D3).
 */

/** One row, in the store's shape. `edges: null` means the field is absent, as it is on a fresh doc. */
function row(id: string, kind: string, edges: readonly string[] | null): AdjudicationRow {
  if (edges === null) return { id, kind, doc: { kind, id } };
  return { id, kind, doc: { kind, id, dependsOn: [...edges] } };
}

/** A corpus big enough to clear the blind-read floor, all definitions adjudicated one way or another. */
function healthyCorpus(): AdjudicationRow[] {
  const rows: AdjudicationRow[] = [row("adr-0010", "adr", null), row("adr-0007", "adr", null)];
  for (let i = 0; i < VACUOUS_DEFINITION_READ_FLOOR; i += 1) {
    rows.push(row(`term-${i}`, "definition", ["asset:adr-0010"]));
  }
  return rows;
}

test("definition-adjudication-passes-on-both-shapes: an authored edge and a named exemption both count", () => {
  const rows = healthyCorpus();
  rows.push(row("rests-on-nothing", "definition", null));
  const verdict = evaluateDefinitionAdjudication(rows, new Set(["rests-on-nothing"]));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.scanned, VACUOUS_DEFINITION_READ_FLOOR + 1);
  assert.equal(verdict.withEdges, VACUOUS_DEFINITION_READ_FLOOR);
  assert.equal(verdict.edges, VACUOUS_DEFINITION_READ_FLOOR);
  assert.deepEqual(verdict.exempt, ["rests-on-nothing"]);
  assert.deepEqual(verdict.unadjudicated, []);
});

test("definition-adjudication-refuses-the-padding-rule: an exemption is a PASS, not a tolerated miss", () => {
  // The load-bearing negative. A rung reading "every definition carries at least one edge" is the
  // one ADR-0468 D3 refuses, because it prices the tier toward padding (ADR-0464's candidate D).
  // This asserts the refusal is REAL: a corpus where every single definition is exempt still passes.
  const rows: AdjudicationRow[] = [];
  const exempt = new Set<string>();
  for (let i = 0; i < VACUOUS_DEFINITION_READ_FLOOR; i += 1) {
    rows.push(row(`bare-${i}`, "definition", null));
    exempt.add(`bare-${i}`);
  }
  const verdict = evaluateDefinitionAdjudication(rows, exempt);

  assert.equal(verdict.ok, true, "a fully-exempt tier is adjudicated, and adjudicated is the bar");
  assert.equal(verdict.withEdges, 0);
  assert.equal(verdict.edges, 0);
  assert.equal(verdict.exempt.length, VACUOUS_DEFINITION_READ_FLOOR);
});

test("definition-adjudication-names-the-unadjudicated: no edge and no exemption is the primary red", () => {
  const rows = healthyCorpus();
  rows.push(row("nobody-decided-this", "definition", null));
  rows.push(row("nor-this", "definition", []));
  const verdict = evaluateDefinitionAdjudication(rows, new Set());

  assert.equal(verdict.ok, false);
  // An EMPTY array is not an authored edge — the field is `.optional()` and never `.default([])`,
  // so `[]` on a definition is the same unadjudicated state as an absent key, not a quiet pass.
  assert.deepEqual(verdict.unadjudicated, ["nobody-decided-this", "nor-this"]);
});

test("definition-adjudication-reds-a-stale-exemption: the list may only be right about the present", () => {
  // The half that stops the allowlist rotting into a dumping ground: an exemption whose subject has
  // since gained edges is a claim that is no longer true, and it reds rather than being ignored.
  const rows = healthyCorpus();
  rows.push(row("gained-an-edge", "definition", ["asset:adr-0007"]));
  const verdict = evaluateDefinitionAdjudication(rows, new Set(["gained-an-edge"]));

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.staleExemptions, ["gained-an-edge"]);
  assert.deepEqual(verdict.unadjudicated, []);
});

test("definition-adjudication-reds-a-phantom-exemption: an exemption must name a live definition", () => {
  const rows = healthyCorpus();
  // Two ways to be a phantom: naming nothing at all, and naming a row of another kind.
  const verdict = evaluateDefinitionAdjudication(rows, new Set(["never-existed", "adr-0010"]));

  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.phantomExemptions, ["adr-0010", "never-existed"]);
});

test("definition-adjudication-reds-a-dangling-target: an authored edge that rotted is worse than none", () => {
  const rows = healthyCorpus();
  rows.push(row("points-nowhere", "definition", ["asset:adr-9999", "doc:research/whatever.md"]));
  const verdict = evaluateDefinitionAdjudication(rows, new Set());

  assert.equal(verdict.ok, false);
  // Only the `asset:` half is resolvable against corpus ids — a `doc:` target is a repo relpath and
  // is deliberately not judged here, which is why it does not appear.
  assert.deepEqual(verdict.danglingTargets, ["points-nowhere -> asset:adr-9999"]);
});

test("definition-adjudication-is-blind-below-the-floor: a thin read reports UNVERIFIED, never PASS", () => {
  const thin = [row("adr-0010", "adr", null), row("only-one", "definition", ["asset:adr-0010"])];
  const verdict = evaluateDefinitionAdjudication(thin, new Set());

  // The verdict itself is clean — which is exactly the trap. `ok` alone would have this reporting a
  // healthy tier off a read that saw one row of it.
  assert.equal(verdict.ok, true);
  assert.equal(isVacuousDefinitionRead(verdict), true);
  const full = evaluateDefinitionAdjudication(healthyCorpus(), new Set());
  assert.equal(isVacuousDefinitionRead(full), false);
});

test("definition-adjudication-sorts-every-list: the output is a worklist a human reads, not a bag", () => {
  // Each list names ids for someone to go and fix, so ORDER is part of the output. Asserted from
  // inputs that arrive DELIBERATELY out of order — a fixture that happens to be sorted already
  // proves nothing about the sort, which is how a sortedness claim goes vacuously green.
  const rows = healthyCorpus();
  for (const id of ["zulu", "alpha", "mike"]) rows.push(row(id, "definition", null));
  for (const id of ["zeta-exempt", "alpha-exempt"]) rows.push(row(id, "definition", null));
  for (const id of ["zed-stale", "abe-stale"]) rows.push(row(id, "definition", ["asset:adr-0010"]));
  rows.push(row("zz-dangler", "definition", ["asset:adr-9999", "asset:adr-8888"]));
  const verdict = evaluateDefinitionAdjudication(
    rows,
    new Set(["zeta-exempt", "alpha-exempt", "zed-stale", "abe-stale", "zz-phantom", "aa-phantom"]),
  );

  assert.deepEqual(verdict.unadjudicated, ["alpha", "mike", "zulu"]);
  assert.deepEqual(verdict.exempt, ["alpha-exempt", "zeta-exempt"]);
  assert.deepEqual(verdict.staleExemptions, ["abe-stale", "zed-stale"]);
  assert.deepEqual(verdict.phantomExemptions, ["aa-phantom", "zz-phantom"]);
  assert.deepEqual(verdict.danglingTargets, [
    "zz-dangler -> asset:adr-8888",
    "zz-dangler -> asset:adr-9999",
  ]);
});

test("definition-adjudication-tolerates-a-surprise-row: a malformed doc reads as no edges, never a throw", () => {
  // The read side of a fail-closed gate must never be where an unexpected row takes the gate down —
  // that failure looks identical to a real red. A row written by another branch's schema projects as
  // unadjudicated, which is a nameable finding, rather than as a crash.
  const rows = healthyCorpus();
  rows.push({ id: "weird", kind: "definition", doc: null });
  const notArray = { kind: "definition", dependsOn: "not-an-array" };
  rows.push({ id: "weirder", kind: "definition", doc: notArray });
  // Not an object at all — a row whose payload came back as a scalar.
  rows.push({ id: "weirdest", kind: "definition", doc: "a string, somehow" });
  // ...and MISSING, which is the case the `typeof` half of the guard exists for and the only one
  // that separates it from the `=== null` half. `null` is caught by either clause, and a scalar
  // falls through harmlessly to an absent key — but a property read on `undefined` THROWS, and a
  // fail-closed rung must never be taken down by the row it was meant to report.
  rows.push({ id: "absent-payload", kind: "definition", doc: undefined });
  const verdict = evaluateDefinitionAdjudication(rows, new Set());

  assert.deepEqual(verdict.unadjudicated, ["absent-payload", "weird", "weirder", "weirdest"]);
});

test("definition-adjudication-filters-junk-entries: a non-string or empty pointer is not an edge", () => {
  // The defensive read's inner half. A row carrying `[null, 42, ""]` has authored NOTHING, so it
  // must count as unadjudicated rather than as a definition with three edges — and an empty string
  // in particular would otherwise sail through as a pointer, then reach the dangling check as
  // `-> ` with nothing after it.
  const rows = healthyCorpus();
  const junkOnly = { kind: "definition", dependsOn: [null, 42, "", { x: 1 }] };
  rows.push({ id: "all-junk", kind: "definition", doc: junkOnly });
  const mixed = { kind: "definition", dependsOn: ["", "asset:adr-0010", 7] };
  rows.push({ id: "part-junk", kind: "definition", doc: mixed });
  const verdict = evaluateDefinitionAdjudication(rows, new Set());

  assert.deepEqual(verdict.unadjudicated, ["all-junk"], "a row of junk authored no edge");
  assert.equal(verdict.withEdges, VACUOUS_DEFINITION_READ_FLOOR + 1);
  // `part-junk` contributes exactly ONE edge — the junk is dropped, not counted and not resolved.
  assert.equal(verdict.edges, VACUOUS_DEFINITION_READ_FLOOR + 1);
  assert.deepEqual(verdict.danglingTargets, []);
});

test("definition-adjudication-exemptions-are-pinned: the live list is four ids and changing it is visible", () => {
  // Spelled out so that adding or removing an exemption is a deliberate edit with a test to update,
  // never something a refactor does quietly. The prose reason for each lives beside the set.
  assert.deepEqual([...ADJUDICATED_WITHOUT_EDGES].sort(), [
    "fixture",
    "ndjson",
    "probe",
    "proof-hash",
  ]);
});
