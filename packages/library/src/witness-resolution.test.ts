import test from "node:test";
import assert from "node:assert/strict";

import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion, UatTestCriterionWitness } from "./uat-test-criteria.js";
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

function leg(witness: UatTestCriterionWitness, n = 1, proofGateId?: string): UatTestCriterion {
  return {
    id: `story#uat-${n}`,
    title: `leg ${n}`,
    witness,
    wouldBe: false,
    ...(proofGateId !== undefined ? { proofGateId } : {}),
  };
}

function gate(kind: ReliabilityGate["kind"], n = 1, proofCommand?: string): ReliabilityGate {
  return {
    id: `story#gate-${n}`,
    title: `gate ${n}`,
    kind,
    covers: [],
    ...(proofCommand !== undefined ? { proofCommand } : {}),
  };
}

/**
 * Loosely-typed accessor for the fields a REFUSED machine resolution carries
 * (`uat-machine-gate-resolution`) — read through `unknown` so this test can assert on the shape
 * before the production type declares it, without fighting the compiler over a union member that
 * doesn't exist yet.
 */
function asRefused(res: unknown): { witness: string; coverage: string; reason: string } {
  return res as { witness: string; coverage: string; reason: string };
}

// ---------------------------------------------------------------------------
// resolveWitness — the asymmetric rule (ADR-0106 d.2) — human/either UNCHANGED by this unit
// ---------------------------------------------------------------------------

test("resolve: an explicit `human` leg stays human", () => {
  assert.deepEqual(resolveWitness(leg("human"), [gate("observe", 1, "pnpm test")]), {
    witness: "human",
  });
});

test("resolve: an UNDECIDED `either` leg resolves to human (fail-closed, never machine from coverage alone)", () => {
  assert.deepEqual(resolveWitness(leg("either"), [gate("observe", 1, "pnpm test")]), {
    witness: "human",
  });
  assert.deepEqual(resolveWitness(leg("either"), []), { witness: "human" });
});

// ---------------------------------------------------------------------------
// resolveWitness — machine legs: EXACT `proofGateId` binding (uat-machine-gate-resolution)
//
// A `machine` leg resolves ONLY to the gate its `proofGateId` names, exactly — never to the
// first `observe` gate found, never by ordering, never by `(covers:)` inference. Any binding
// gap (missing, unknown, non-observe, or commandless) is an explicit refusal, never a silent
// downgrade to `build-tests` or `human`.
// ---------------------------------------------------------------------------

test("resolve: a `machine` leg bound to its exact, command-bearing observe gate resolves to observe, naming THAT gate", () => {
  const bound = gate("observe", 1, "pnpm test");
  assert.deepEqual(resolveWitness(leg("machine", 1, "story#gate-1"), [bound]), {
    witness: "machine",
    coverage: "observe",
    observedBy: "story#gate-1",
    proofCommand: "pnpm test",
  });
});

test("resolve: the bound gate id is matched EXACTLY — an earlier, differently-id'd observe gate is never substituted (no first-observe fallback, no ordering inference)", () => {
  const other = gate("observe", 1, "pnpm test:other");
  const bound = gate("observe", 2, "pnpm test:bound");
  // The leg names gate-2; gate-1 (an unrelated observe gate) is listed FIRST and would win under
  // a first-observe-found rule. It must not: the exact binding wins regardless of order.
  assert.deepEqual(resolveWitness(leg("machine", 1, "story#gate-2"), [other, bound]), {
    witness: "machine",
    coverage: "observe",
    observedBy: "story#gate-2",
    proofCommand: "pnpm test:bound",
  });
});

test("resolve: a `machine` leg with NO proof-gate binding is refused — never silently falls back to an existing observe gate", () => {
  const res = asRefused(resolveWitness(leg("machine", 1), [gate("observe", 1, "pnpm test")]));
  assert.equal(res.witness, "machine");
  assert.equal(res.coverage, "refused");
  assert.match(res.reason, /proof-gate|binding/i);
});

test("resolve: a `machine` leg bound to an UNKNOWN gate id is refused, never matched to an unrelated gate", () => {
  const res = asRefused(
    resolveWitness(leg("machine", 1, "story#gate-99"), [gate("observe", 1, "pnpm test")]),
  );
  assert.equal(res.witness, "machine");
  assert.equal(res.coverage, "refused");
  assert.match(res.reason, /story#gate-99/);
});

test("resolve: a `machine` leg bound to a NON-OBSERVE gate (build-tests/integrate) is refused, never silently reclassified via a different gate's kind", () => {
  const resBuildTests = asRefused(
    resolveWitness(leg("machine", 1, "story#gate-1"), [gate("build-tests", 1)]),
  );
  assert.equal(resBuildTests.witness, "machine");
  assert.equal(resBuildTests.coverage, "refused");
  assert.match(resBuildTests.reason, /observe/i);

  const resIntegrate = asRefused(
    resolveWitness(leg("machine", 1, "story#gate-1"), [gate("integrate", 1)]),
  );
  assert.equal(resIntegrate.coverage, "refused");
});

test("resolve: a `machine` leg bound to an observe gate with NO declared proof command is refused", () => {
  const res = asRefused(resolveWitness(leg("machine", 1, "story#gate-1"), [gate("observe", 1)]));
  assert.equal(res.witness, "machine");
  assert.equal(res.coverage, "refused");
  assert.match(res.reason, /command/i);
});

// ---------------------------------------------------------------------------
// resolvedWitnessOf — the binary projection the studio reads (ADR-0106 d.5)
// ---------------------------------------------------------------------------

test("resolvedWitnessOf: the binary projection is one of the two resolved witnesses, never `either` — including a refused machine leg", () => {
  assert.equal(resolvedWitnessOf(leg("human"), []), "human");
  assert.equal(resolvedWitnessOf(leg("either"), [gate("observe", 1, "pnpm test")]), "human");
  assert.equal(
    resolvedWitnessOf(leg("machine", 1, "story#gate-1"), [gate("observe", 1, "pnpm test")]),
    "machine",
  );
  // Even a REFUSED machine leg (no binding at all) still projects "machine" — a refusal is a
  // binding defect to fix, never a silent downgrade to the human-confirm affordance.
  assert.equal(resolvedWitnessOf(leg("machine"), []), "machine");
  for (const w of ["human", "machine", "either"] as const) {
    assert.ok((RESOLVED_WITNESSES as readonly string[]).includes(resolvedWitnessOf(leg(w), [])));
  }
});

// ---------------------------------------------------------------------------
// The "no `either` at rest" guard (ADR-0106 d.1) — unaffected by this unit
// ---------------------------------------------------------------------------

test("isUnresolvedWitness: only `either` is unresolved", () => {
  assert.equal(isUnresolvedWitness("either"), true);
  assert.equal(isUnresolvedWitness("human"), false);
  assert.equal(isUnresolvedWitness("machine"), false);
});

test("unresolvedUatLegs: returns the legs still `either` (the invariant violation), empty when clean", () => {
  const legs = [leg("machine", 1, "story#gate-1"), leg("either", 2), leg("human", 3), leg("either", 4)];
  assert.deepEqual(
    unresolvedUatLegs(legs).map((l) => l.id),
    ["story#uat-2", "story#uat-4"],
  );
  assert.deepEqual(unresolvedUatLegs([leg("human", 1), leg("machine", 2, "story#gate-1")]), []);
});
