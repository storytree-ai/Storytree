import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTest, UatTestWitness } from "./uat-tests.js";
import {
  isUnresolvedWitness,
  RESOLVED_WITNESSES,
  resolvedWitnessOf,
  resolveWitness,
  unresolvedUatLegs,
} from "./witness-resolution.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function leg(witness: UatTestWitness, n = 1): UatTest {
  return { id: `story#uat-${n}`, title: `leg ${n}`, witness, wouldBe: false };
}

function gate(kind: ReliabilityGate["kind"], n = 1): ReliabilityGate {
  return { id: `story#gate-${n}`, title: `gate ${n}`, kind, covers: [] };
}

// ---------------------------------------------------------------------------
// resolveWitness — the asymmetric rule (ADR-0106 d.2)
// ---------------------------------------------------------------------------

test("resolve: an explicit `human` leg stays human", () => {
  assert.deepEqual(resolveWitness(leg("human"), [gate("observe")]), { witness: "human" });
});

test("resolve: an UNDECIDED `either` leg resolves to human (fail-closed, never machine from coverage alone)", () => {
  // The crux of ADR-0106 d.2: even with an observe suite present, an undecided leg is NOT promoted to
  // machine — that would fail open and silently drop the human. `either` → human, always.
  assert.deepEqual(resolveWitness(leg("either"), [gate("observe")]), { witness: "human" });
  assert.deepEqual(resolveWitness(leg("either"), []), { witness: "human" });
});

test("resolve: a `machine` leg with an existing observe gate routes to observe (named by the gate)", () => {
  assert.deepEqual(resolveWitness(leg("machine"), [gate("observe", 1)]), {
    witness: "machine",
    coverage: "observe",
    observedBy: "story#gate-1",
  });
});

test("resolve: a `machine` leg with NO observe gate defers to build-tests (the promise of a real test)", () => {
  assert.deepEqual(resolveWitness(leg("machine"), []), { witness: "machine", coverage: "build-tests" });
  // A build-tests / integrate gate is not a suite to observe — still build-tests.
  assert.deepEqual(resolveWitness(leg("machine"), [gate("build-tests"), gate("integrate", 2)]), {
    witness: "machine",
    coverage: "build-tests",
  });
});

test("resolve: with several observe gates the FIRST (declared order) is named the cover", () => {
  const res = resolveWitness(leg("machine"), [gate("observe", 1), gate("observe", 2)]);
  assert.deepEqual(res, { witness: "machine", coverage: "observe", observedBy: "story#gate-1" });
});

test("resolve: a build-tests gate BEFORE an observe gate still routes to observe (the observe suite wins)", () => {
  const res = resolveWitness(leg("machine"), [gate("build-tests", 1), gate("observe", 2)]);
  assert.deepEqual(res, { witness: "machine", coverage: "observe", observedBy: "story#gate-2" });
});

// ---------------------------------------------------------------------------
// resolvedWitnessOf — the binary projection the studio reads (ADR-0106 d.5)
// ---------------------------------------------------------------------------

test("resolvedWitnessOf: the binary projection is one of the two resolved witnesses, never `either`", () => {
  assert.equal(resolvedWitnessOf(leg("human"), []), "human");
  assert.equal(resolvedWitnessOf(leg("either"), [gate("observe")]), "human");
  assert.equal(resolvedWitnessOf(leg("machine"), [gate("observe")]), "machine");
  assert.equal(resolvedWitnessOf(leg("machine"), []), "machine");
  for (const w of ["human", "machine", "either"] as const) {
    assert.ok((RESOLVED_WITNESSES as readonly string[]).includes(resolvedWitnessOf(leg(w), [])));
  }
});

// ---------------------------------------------------------------------------
// The "no `either` at rest" guard (ADR-0106 d.1)
// ---------------------------------------------------------------------------

test("isUnresolvedWitness: only `either` is unresolved", () => {
  assert.equal(isUnresolvedWitness("either"), true);
  assert.equal(isUnresolvedWitness("human"), false);
  assert.equal(isUnresolvedWitness("machine"), false);
});

test("unresolvedUatLegs: returns the legs still `either` (the invariant violation), empty when clean", () => {
  const legs = [leg("machine", 1), leg("either", 2), leg("human", 3), leg("either", 4)];
  assert.deepEqual(
    unresolvedUatLegs(legs).map((l) => l.id),
    ["story#uat-2", "story#uat-4"],
  );
  assert.deepEqual(unresolvedUatLegs([leg("human", 1), leg("machine", 2)]), []);
});
