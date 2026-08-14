import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateStandsOnAcyclicity,
  standsOnNodes,
  type StandsOnSource,
} from "./knowledge-dag.js";

/**
 * ADR-0223 D3's corpus-wide acyclicity guard, as a pure function over stored rows.
 *
 * Everything here is hermetic by construction — literal `StandsOnSource` rows, no store, no
 * credential (ADR-0302 D3). The rung that dials the live corpus is
 * `packages/cli/src/check-library-dag-acyclic.ts`; it decides nothing these tests do not.
 */

function row(id: string, standsOn?: unknown, extra?: Record<string, unknown>): StandsOnSource {
  return { id, doc: { kind: "definition", id, ...extra, ...(standsOn === undefined ? {} : { standsOn }) } };
}

test("library-dag-corpus-projects-pointers-to-node-ids: an `asset:` pointer resolves onto the node it names", () => {
  const nodes = standsOnNodes([row("a", ["asset:b"]), row("b", [])]);
  assert.deepEqual(nodes, [
    { id: "a", standsOn: ["b"] },
    { id: "b", standsOn: [] },
  ]);

  // The regression this exists for: WITHOUT the prefix strip, `asset:b` is absent from the graph,
  // the detector treats it as a leaf, and a genuine two-node cycle reports clean.
  const cyclic = evaluateStandsOnAcyclicity([row("a", ["asset:b"]), row("b", ["asset:a"])]);
  assert.equal(cyclic.acyclic, false);
  assert.deepEqual(
    cyclic.cycles.map((c) => c.line),
    ["a → b → a"],
  );
});

test("library-dag-corpus-projects-pointers-to-node-ids: a `doc:` ADR target stays a sink, never a node", () => {
  // ADR-0223 D4: ADRs are tier 0 — they carry no standsOn and are not Library artifacts, so a
  // target that names one is absent from the graph and cannot close a cycle.
  const nodes = standsOnNodes([row("a", ["doc:decisions/0223-the-knowledge-dag.md", "asset:b"])]);
  assert.deepEqual(nodes[0]?.standsOn, ["doc:decisions/0223-the-knowledge-dag.md", "b"]);

  const verdict = evaluateStandsOnAcyclicity([
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
  const hostile: StandsOnSource[] = [
    { id: "null-doc", doc: null },
    { id: "undefined-doc", doc: undefined },
    { id: "string-doc", doc: "not an object" },
    { id: "no-field", doc: { kind: "definition" } },
    { id: "not-an-array", doc: { standsOn: "asset:b" } },
    { id: "mixed", doc: { standsOn: ["asset:b", 42, null, { nested: true }, ""] } },
    { id: "empty-target", doc: { standsOn: ["asset:"] } },
  ];
  const nodes = standsOnNodes(hostile);
  assert.deepEqual(
    nodes.map((n) => n.standsOn),
    [[], [], [], [], [], ["b"], []],
  );
  assert.equal(evaluateStandsOnAcyclicity(hostile).acyclic, true);
});

test("library-dag-corpus-reports-its-denominators: a green names how much it judged", () => {
  // A corpus guard answering only pass/fail cannot distinguish "no cycles" from "read nothing".
  const empty = evaluateStandsOnAcyclicity([]);
  assert.deepEqual(empty, { acyclic: true, docsScanned: 0, edgesScanned: 0, cycles: [] });

  const real = evaluateStandsOnAcyclicity([
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
  const verdict = evaluateStandsOnAcyclicity([
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
