import test from "node:test";
import assert from "node:assert/strict";

import {
  parseReliabilityGates,
  reliabilityGateId,
  ReliabilityGate,
  RELIABILITY_GATE_KINDS,
} from "./reliability-gates.js";

// ---------------------------------------------------------------------------
// Id scheme
// ---------------------------------------------------------------------------

test("reliabilityGateId is the stable <story>#gate-<n> scheme (1-based)", () => {
  assert.equal(reliabilityGateId("proof-protocol", 1), "proof-protocol#gate-1");
  assert.equal(reliabilityGateId("storage-protocol", 3), "storage-protocol#gate-3");
});

// ---------------------------------------------------------------------------
// No section → []
// ---------------------------------------------------------------------------

test("a story with no `## Reliability Gates` section yields []", () => {
  const body = "# A story\n\n## Story UAT\n\n1. **A UAT leg** _(witness: machine)_\n";
  assert.deepEqual(parseReliabilityGates("s", body), []);
});

// ---------------------------------------------------------------------------
// Parses kind + proofCommand
// ---------------------------------------------------------------------------

test("parses each numbered gate: positional id, title, kind, and the backticked proofCommand", () => {
  const body = [
    "## Reliability Gates",
    "",
    "1. **The port's own suite is green** _(gate: observe)_ `pnpm --filter @storytree/proof-protocol test`.",
    "   Success — the zod shapes + validators pass offline.",
    "2. **Cross-boundary safeParse** _(gate: observe)_ `pnpm --filter @storytree/store test`.",
    "",
    "## Proof",
  ].join("\n");
  const gates = parseReliabilityGates("proof-protocol", body);
  assert.equal(gates.length, 2);
  assert.deepEqual(gates[0], {
    id: "proof-protocol#gate-1",
    title: "The port's own suite is green",
    kind: "observe",
    covers: [],
    proofCommand: "pnpm --filter @storytree/proof-protocol test",
  });
  assert.equal(gates[1]!.id, "proof-protocol#gate-2");
  assert.equal(gates[1]!.proofCommand, "pnpm --filter @storytree/store test");
});

test("the proofCommand is read AFTER the kind tag — a backticked term in the TITLE is not mistaken for it", () => {
  // Regression: storage-protocol's title contains `InMemoryStore`; the command must still be the
  // backticked command that follows the `(gate: observe)` tag, not the first backtick span overall.
  const body = [
    "## Reliability Gates",
    "",
    "1. **The seam + its `InMemoryStore` parity are green** _(gate: observe)_ `pnpm --filter @storytree/storage-protocol test`.",
  ].join("\n");
  const gates = parseReliabilityGates("storage-protocol", body);
  assert.equal(gates.length, 1);
  assert.equal(gates[0]!.kind, "observe");
  assert.equal(gates[0]!.proofCommand, "pnpm --filter @storytree/storage-protocol test");
});

test("a command WRAPPED across prose lines is normalized to one clean command (no embedded newline)", () => {
  const body = [
    "## Reliability Gates",
    "",
    "1. **The seam parity is green** _(gate: observe)_ `pnpm --filter",
    "   @storytree/storage-protocol test`.",
  ].join("\n");
  const gates = parseReliabilityGates("storage-protocol", body);
  assert.equal(gates[0]!.proofCommand, "pnpm --filter @storytree/storage-protocol test");
});

test("an untagged gate defaults to `observe` (the conservative brownfield default)", () => {
  const body = "## Reliability Gates\n\n1. **Just observe it** `pnpm test`.\n";
  const gates = parseReliabilityGates("s", body);
  assert.equal(gates.length, 1);
  assert.equal(gates[0]!.kind, "observe");
  assert.equal(gates[0]!.proofCommand, "pnpm test");
});

test("parses build-tests and integrate kinds (no proofCommand required)", () => {
  const body = [
    "## Reliability Gates",
    "",
    "1. **Add tests for the legacy parser** _(gate: build-tests)_ — no TDD coverage today.",
    "2. **Fold the existing suite under one capability** _(gate: integrate)_.",
  ].join("\n");
  const gates = parseReliabilityGates("brown", body);
  assert.equal(gates[0]!.kind, "build-tests");
  assert.equal(gates[0]!.proofCommand, undefined);
  assert.equal(gates[1]!.kind, "integrate");
});

// ---------------------------------------------------------------------------
// Fail-closed: an explicit-but-invalid kind THROWS (never silently defaulted)
// ---------------------------------------------------------------------------

test("an explicit but invalid gate kind throws (refuse, do not default)", () => {
  const body = "## Reliability Gates\n\n1. **Sneaky** _(gate: rubberstamp)_ `pnpm test`.\n";
  assert.throws(() => parseReliabilityGates("s", body), /invalid gate kind "rubberstamp"/);
});

// ---------------------------------------------------------------------------
// Schema is strict
// ---------------------------------------------------------------------------

test("ReliabilityGate rejects an unknown field and an unknown kind (strict)", () => {
  const valid = { id: "s#gate-1", title: "t", kind: "observe" as const };
  // `covers` defaults to [] (ADR-0097 additive) — a doc that omits it round-trips, gaining the default.
  assert.deepEqual(ReliabilityGate.parse(valid), { ...valid, covers: [] });
  assert.equal(ReliabilityGate.safeParse({ ...valid, rogue: 1 }).success, false);
  assert.equal(ReliabilityGate.safeParse({ ...valid, kind: "nope" }).success, false);
});

// ---------------------------------------------------------------------------
// (covers: …) capability coverage (ADR-0097)
// ---------------------------------------------------------------------------

test("parses a `(covers: a, b)` tag into the trimmed capability id list, alongside kind + command", () => {
  const body = [
    "## Reliability Gates",
    "",
    "1. **The library suite is green** _(gate: observe)_ _(covers: schema-validation, migrate-on-write, health-gate)_ `pnpm --filter @storytree/library test`.",
  ].join("\n");
  const gates = parseReliabilityGates("library", body);
  assert.equal(gates.length, 1);
  assert.deepEqual(gates[0]!.covers, ["schema-validation", "migrate-on-write", "health-gate"]);
  // the (covers:) tag does not disturb the kind or the proofCommand extraction
  assert.equal(gates[0]!.kind, "observe");
  assert.equal(gates[0]!.proofCommand, "pnpm --filter @storytree/library test");
});

test("a gate with no `(covers:)` tag covers nothing ([] default)", () => {
  const body = "## Reliability Gates\n\n1. **Just observe it** _(gate: observe)_ `pnpm test`.\n";
  const gates = parseReliabilityGates("s", body);
  assert.deepEqual(gates[0]!.covers, []);
});

test("the gate kinds are exactly observe | build-tests | integrate", () => {
  assert.deepEqual([...RELIABILITY_GATE_KINDS], ["observe", "build-tests", "integrate"]);
});

// ---------------------------------------------------------------------------
// (build: <node-id>) build reference (ADR-0098 U2)
// ---------------------------------------------------------------------------

test("parses a `(build: <node-id>)` tag into buildNode, alongside kind + covers", () => {
  const body = [
    "## Reliability Gates",
    "",
    "1. **Seed orchestration gets a tested seam** _(gate: build-tests)_ _(build: seed-runner)_ _(covers: seed-corpus-scripts)_.",
  ].join("\n");
  const gates = parseReliabilityGates("library", body);
  assert.equal(gates.length, 1);
  assert.equal(gates[0]!.buildNode, "seed-runner");
  // the (build:) tag does not disturb the kind or the (covers:) extraction
  assert.equal(gates[0]!.kind, "build-tests");
  assert.deepEqual(gates[0]!.covers, ["seed-corpus-scripts"]);
});

test("a gate with no `(build:)` tag has no buildNode (undefined)", () => {
  const body = "## Reliability Gates\n\n1. **Just observe it** _(gate: observe)_ `pnpm test`.\n";
  const gates = parseReliabilityGates("s", body);
  assert.equal(gates[0]!.buildNode, undefined);
});

test("ReliabilityGate round-trips an explicit buildNode and rejects a blank one (strict)", () => {
  const valid = {
    id: "library#gate-4",
    title: "t",
    kind: "build-tests" as const,
    buildNode: "seed-runner",
  };
  assert.deepEqual(ReliabilityGate.parse(valid), { ...valid, covers: [] });
  // min(1): an empty buildNode is refused (a build reference that names nothing).
  assert.equal(ReliabilityGate.safeParse({ ...valid, buildNode: "" }).success, false);
});
