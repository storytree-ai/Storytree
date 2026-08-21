import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDependsOnAcyclicity,
  dependsOnNodes,
  isVacuousDependsOnRead,
  VACUOUS_DEPENDS_ON_READ_FLOOR,
  type DependsOnSource,
} from "./knowledge-dag.js";
import { FIXTURE_CORPUS_UNITS } from "./fixture/corpus.js";

/**
 * ADR-0223 D3's corpus-wide acyclicity guard, as a pure function over stored rows.
 *
 * Everything here is hermetic by construction — literal `DependsOnSource` rows, no store, no
 * credential (ADR-0302 D3). The rung that dials the live corpus is
 * `packages/cli/src/check-library-dag-acyclic.ts`; it decides nothing these tests do not.
 */

function row(id: string, dependsOn?: unknown, extra?: Record<string, unknown>): DependsOnSource {
  return { id, doc: { kind: "definition", id, ...extra, ...(dependsOn === undefined ? {} : { dependsOn }) } };
}

test("library-dag-corpus-projects-pointers-to-node-ids: an `asset:` pointer resolves onto the node it names", () => {
  const nodes = dependsOnNodes([row("a", ["asset:b"]), row("b", [])]);
  assert.deepEqual(nodes, [
    { id: "a", dependsOn: ["b"] },
    { id: "b", dependsOn: [] },
  ]);

  // The regression this exists for: WITHOUT the prefix strip, `asset:b` is absent from the graph,
  // the detector treats it as a leaf, and a genuine two-node cycle reports clean.
  const cyclic = evaluateDependsOnAcyclicity([row("a", ["asset:b"]), row("b", ["asset:a"])]);
  assert.equal(cyclic.acyclic, false);
  assert.deepEqual(
    cyclic.cycles.map((c) => c.line),
    ["a → b → a"],
  );
});

test("library-dag-corpus-projects-pointers-to-node-ids: a `doc:` ADR target stays a sink, never a node", () => {
  // ADR-0223 D4: ADRs are tier 0 — they carry no dependsOn and are not Library artifacts, so a
  // target that names one is absent from the graph and cannot close a cycle.
  const nodes = dependsOnNodes([row("a", ["doc:decisions/0223-the-knowledge-dag.md", "asset:b"])]);
  assert.deepEqual(nodes[0]?.dependsOn, ["doc:decisions/0223-the-knowledge-dag.md", "b"]);

  const verdict = evaluateDependsOnAcyclicity([
    row("a", ["doc:decisions/0223-the-knowledge-dag.md"]),
    row("b", ["doc:decisions/0223-the-knowledge-dag.md"]),
  ]);
  assert.equal(verdict.acyclic, true);
  assert.equal(verdict.edgesScanned, 2);
});

test("library-dag-corpus-projection-is-total-over-untrusted-rows: a malformed row projects as no edges, never a throw", () => {
  // The read side of a fail-closed gate must not be where a surprise row takes the gate down: that
  // failure is indistinguishable from a real cycle. Malformed docs are refused at the WRITE
  // boundary; here every shape below must project to an edge-free node.
  const hostile: DependsOnSource[] = [
    { id: "null-doc", doc: null },
    { id: "undefined-doc", doc: undefined },
    { id: "string-doc", doc: "not an object" },
    { id: "no-field", doc: { kind: "definition" } },
    { id: "not-an-array", doc: { dependsOn: "asset:b" } },
    { id: "mixed", doc: { dependsOn: ["asset:b", 42, null, { nested: true }, ""] } },
    { id: "empty-target", doc: { dependsOn: ["asset:"] } },
  ];
  const nodes = dependsOnNodes(hostile);
  assert.deepEqual(
    nodes.map((n) => n.dependsOn),
    [[], [], [], [], [], ["b"], []],
  );
  assert.equal(evaluateDependsOnAcyclicity(hostile).acyclic, true);
});

test("library-dag-corpus-reports-its-denominators: a green names how much it judged", () => {
  // A corpus guard answering only pass/fail cannot distinguish "no cycles" from "read nothing".
  const empty = evaluateDependsOnAcyclicity([]);
  assert.deepEqual(empty, { acyclic: true, docsScanned: 0, edgesScanned: 0, cycles: [] });

  const real = evaluateDependsOnAcyclicity([
    row("agent", ["asset:process", "asset:principle"]),
    row("process", ["asset:principle"]),
    row("principle", ["doc:decisions/0223-x.md"]),
    row("unrelated"),
  ]);
  assert.equal(real.acyclic, true);
  assert.equal(real.docsScanned, 4);
  assert.equal(real.edgesScanned, 4);
});

test("library-dag-corpus-reports-every-distinct-cycle: each is a closed, rendered path", () => {
  const verdict = evaluateDependsOnAcyclicity([
    row("self", ["asset:self"]),
    row("x", ["asset:y"]),
    row("y", ["asset:z"]),
    row("z", ["asset:x"]),
    row("clean", ["asset:x"]),
  ]);

  assert.equal(verdict.acyclic, false);
  assert.equal(verdict.cycles.length, 2);
  for (const cycle of verdict.cycles) {
    assert.equal(cycle.path[0], cycle.path.at(-1), "every reported path is closed");
    assert.equal(cycle.line, cycle.path.join(" → "));
  }
  assert.deepEqual(
    verdict.cycles.map((c) => c.line).sort(),
    ["self → self", "x → y → z → x"],
  );
});

// ---------------------------------------------------------------------------
// ADR-0402 READ TOLERANCE — the rename must not blind the reader (TEMPORARY:
// delete with `depends-on-compat.ts` once no stored row can carry `standsOn`).
// ---------------------------------------------------------------------------

/** A stored row in the PRE-rename shape: the raw payload carries `standsOn` and was never upcast. */
function legacyRow(id: string, standsOn: unknown): DependsOnSource {
  return { id, doc: { kind: "definition", id, standsOn } };
}

test("library-dag-corpus-projects-pointers-to-node-ids: an un-upcast `standsOn` row still yields its edges (ADR-0402)", () => {
  // THE DEFECT THIS PINS, measured against the live store on the rename branch: migration #7 runs at
  // the WRITE boundary, nothing upcasts on READ, so every stored row still spelling the edge
  // `standsOn` went invisible — `PASS — no dependsOn cycle across 1701 artifacts (0 authored edges)`.
  const nodes = dependsOnNodes([legacyRow("a", ["asset:b"]), legacyRow("b", [])]);
  assert.deepEqual(nodes, [
    { id: "a", dependsOn: ["b"] },
    { id: "b", dependsOn: [] },
  ]);

  // And the gate can SEE a cycle authored under the old spelling — the whole point of the tolerance,
  // since a blind reader reports every cycle as clean.
  const cyclic = evaluateDependsOnAcyclicity([legacyRow("a", ["asset:b"]), legacyRow("b", ["asset:a"])]);
  assert.equal(cyclic.acyclic, false);
  assert.deepEqual(cyclic.cycles.map((c) => c.line), ["a → b → a"]);
  assert.equal(cyclic.edgesScanned, 2, "the legacy edges are COUNTED, not merely traversed");

  // A MIXED corpus is the real transition state — one row migrated, one not — and a cycle spanning
  // the two spellings is exactly what a half-tolerant reader would miss.
  const mixed = evaluateDependsOnAcyclicity([
    { id: "a", doc: { kind: "definition", id: "a", dependsOn: ["asset:b"] } },
    legacyRow("b", ["asset:a"]),
  ]);
  assert.equal(mixed.acyclic, false);
  assert.deepEqual(mixed.cycles.map((c) => c.line), ["a → b → a"]);
});

test("library-dag-corpus-projects-pointers-to-node-ids: the NEW key wins outright when a row carries both", () => {
  // The legacy read is a fallback, never an override: a migrated row is authoritative even if a
  // stray old key survived beside it.
  const nodes = dependsOnNodes([
    { id: "a", doc: { kind: "definition", id: "a", dependsOn: ["asset:current"], standsOn: ["asset:stale"] } },
  ]);
  assert.deepEqual(nodes, [{ id: "a", dependsOn: ["current"] }]);

  // A non-array under either key is still "no edges" rather than a throw (TOTAL over untrusted input).
  assert.deepEqual(dependsOnNodes([legacyRow("a", "asset:b")]), [{ id: "a", dependsOn: [] }]);
  assert.deepEqual(dependsOnNodes([{ id: "a", doc: null }]), [{ id: "a", dependsOn: [] }]);
});

test("library-dag-corpus-projects-pointers-to-node-ids: a big corpus with ZERO edges is UNVERIFIED, not clean", () => {
  // An instrument that cannot see its subject must not report success. `acyclic` stays TRUE — a
  // corpus with no edges genuinely has no cycles — so the vacuity verdict is deliberately separate:
  // it is a fact about the READ, and the caller decides what an unverifiable read costs it.
  const blind = Array.from({ length: VACUOUS_DEPENDS_ON_READ_FLOOR }, (_, i) => row(`n${i}`, []));
  const verdict = evaluateDependsOnAcyclicity(blind);
  assert.equal(verdict.acyclic, true, "the judge does not lie in the other direction");
  assert.equal(verdict.edgesScanned, 0);
  assert.equal(isVacuousDependsOnRead(verdict), true, "at the floor, zero edges can only be blindness");

  // ONE edge anywhere in that same corpus acquits it: the reader demonstrably resolves the field.
  const sighted = [...blind.slice(0, -1), row("nLast", ["asset:n0"])];
  assert.equal(isVacuousDependsOnRead(evaluateDependsOnAcyclicity(sighted)), false);
});

test("library-dag-corpus-projects-pointers-to-node-ids: 'nothing to check' never reds — the empty corpus and the real fixture", () => {
  // An EMPTY corpus has nothing to be blind to. Zero artifacts and zero edges is the honest bottom,
  // not a defect, and a threshold that fired here would red every freshly created store.
  assert.equal(isVacuousDependsOnRead(evaluateDependsOnAcyclicity([])), false);

  // THE FIXTURE IS THE BOUNDARY THAT MATTERS, so it is asserted against the REAL frozen literal
  // rather than a hand-made stand-in. It carries no authored edge by design — if the threshold
  // tripped here that would mean the threshold shape is wrong, not that the fixture needs changing.
  const fixtureRows: DependsOnSource[] = FIXTURE_CORPUS_UNITS.map((unit) => ({
    id: (unit as { id: string }).id,
    doc: unit as unknown as Record<string, unknown>,
  }));
  const fixtureVerdict = evaluateDependsOnAcyclicity(fixtureRows);
  assert.ok(fixtureVerdict.docsScanned > 0, "the fixture is not empty");
  assert.ok(
    fixtureVerdict.docsScanned < VACUOUS_DEPENDS_ON_READ_FLOOR,
    `the fixture (${fixtureVerdict.docsScanned}) must stay below the floor (${VACUOUS_DEPENDS_ON_READ_FLOOR}) — ` +
      "if it ever grows past it, RAISE THE FLOOR or give the fixture a real edge; never delete this test",
  );
  assert.equal(isVacuousDependsOnRead(fixtureVerdict), false, "the hermetic fixture must never red this");
});
