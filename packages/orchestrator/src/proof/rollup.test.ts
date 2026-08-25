import test from "node:test";
import assert from "node:assert/strict";

import type { Verdict } from "@storytree/proof-protocol";
import { WORK_EVENT_KIND, SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

import { hasSignedVerdict, rollupStatus, workEvent } from "./rollup.js";
import { rollupParitySuite } from "./rollup-parity.js";

/**
 * The rollup truth table (ADR-0006/0020): status is DERIVED off the event log, `healthy` only via
 * a signed pass verdict, and the projection is conservative — anything malformed, mis-addressed,
 * or unproven grants nothing. All offline, all pure.
 */

let seq = 0;
function ev(kind: string, doc: unknown): StoreEvent {
  seq += 1;
  return {
    seq,
    id: `e${seq}`,
    kind,
    type: "created",
    doc,
    actor: "tester",
    at: "2026-06-10T00:00:00.000Z",
  };
}

function verdict(unitId: string, outcome: "pass" | "fail"): Verdict {
  return {
    unitId,
    proofMode: "capability",
    outcome,
    commitSha: "cafebabe",
    signer: "tester@example.com",
    runId: "run-1",
    outputVersion: "v1",
    evidence: [],
    at: "2026-06-10T00:00:00.000Z",
  };
}

test("rollup: no events => null (authored status stands)", () => {
  assert.equal(rollupStatus("u1", []), null);
});

test("rollup: building without a later pass => building", () => {
  const events = [ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r1" })];
  assert.equal(rollupStatus("u1", events), "building");
});

test("rollup: building then signed pass => healthy", () => {
  const events = [
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r1" }),
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
  ];
  assert.equal(rollupStatus("u1", events), "healthy");
});

test("rollup: a pass followed by a NEW building event => STILL healthy (ADR-0416 D3/D4 — proof is durable)", () => {
  // BEHAVIOUR CHANGE, deliberate. This asserted `building` until ADR-0416 landed: the fold was plain
  // last-event-wins, so merely STARTING a rebuild un-proved the unit, and if that run never ended in
  // a signature the green never came back. Measured on the live store 2026-08-25, five units sat in
  // exactly that state — traversal-event-vocabulary (passed 27 Jul, overwritten 12 Aug),
  // multi-adapter-replay, semantic-growth-replay-view, write-broker, compose-build-command — and two
  // of them were the ONLY thing holding context-traversal-telemetry and context-traversal-spawn off
  // a green crown. ADR-0416 D3: only EVIDENCE the outcome is broken leaves green, and a `building`
  // mark is not evidence of anything; the in-flight fact rides the session wisp instead.
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r2" }),
  ];
  assert.equal(rollupStatus("u1", events), "healthy");
});

test("rollup: a pass followed by `proposed` => STILL healthy (ADR-0416 D5 — never back to proposed)", () => {
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "proposed" }),
  ];
  assert.equal(rollupStatus("u1", events), "healthy");
});

test("rollup: only a signed FAIL takes a proven unit out of green (ADR-0416 D3)", () => {
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r2" }),
    ev(SIGNING_EVENT_KIND, verdict("u1", "fail")),
  ];
  assert.equal(rollupStatus("u1", events), "unhealthy");
  // …and a rebuild started after the failure does not launder it back either.
  assert.equal(
    rollupStatus("u1", [...events, ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r3" })]),
    "unhealthy",
  );
});

test("rollup: `retired` is the ONE work event that still outranks proof (ADR-0038 / ADR-0416 D5)", () => {
  // An explicit, named, auditable withdrawal — the transition D5 requires — as opposed to an absence
  // of proof, which may never reset anything. It also clears the durable baseline, so a resurrected
  // unit's later lifecycle marks behave like a fresh one's rather than being ignored forever.
  const retired = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "retired" }),
  ];
  assert.equal(rollupStatus("u1", retired), "retired");
  assert.equal(
    rollupStatus("u1", [...retired, ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r9" })]),
    "building",
  );
});

test("rollup: hasSignedVerdict answers only for a SIGNED verdict, never a work event", () => {
  assert.equal(hasSignedVerdict("u1", [ev(WORK_EVENT_KIND, { unitId: "u1", event: "building" })]), false);
  assert.equal(hasSignedVerdict("u1", [ev(SIGNING_EVENT_KIND, verdict("u1", "pass"))]), true);
  assert.equal(hasSignedVerdict("u1", [ev(SIGNING_EVENT_KIND, verdict("u1", "fail"))]), true);
  assert.equal(hasSignedVerdict("u1", [ev(SIGNING_EVENT_KIND, verdict("other", "pass"))]), false);
});

test("rollup: a fail verdict never grants progress", () => {
  // fail with no history: still null — a failed attempt invents nothing.
  assert.equal(rollupStatus("u1", [ev(SIGNING_EVENT_KIND, verdict("u1", "fail"))]), null);
  // fail during building: stays building.
  assert.equal(
    rollupStatus("u1", [
      ev(WORK_EVENT_KIND, { unitId: "u1", event: "building" }),
      ev(SIGNING_EVENT_KIND, verdict("u1", "fail")),
    ]),
    "building",
  );
});

test("rollup: a fail verdict demotes a prior healthy to unhealthy", () => {
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(SIGNING_EVENT_KIND, verdict("u1", "fail")),
  ];
  assert.equal(rollupStatus("u1", events), "unhealthy");
});

test("rollup: a retired work event is terminal off-tree state", () => {
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "retired" }),
  ];
  assert.equal(rollupStatus("u1", events), "retired");
});

test("rollup: a malformed signing doc grants nothing (never over-claim healthy)", () => {
  // The model could only ever FORGE prose, not a Verdict: a signing event whose doc is not a
  // full signed Verdict — missing signer/commit, or a bare 'pass' string — is ignored.
  assert.equal(rollupStatus("u1", [ev(SIGNING_EVENT_KIND, "pass")]), null);
  assert.equal(
    rollupStatus("u1", [ev(SIGNING_EVENT_KIND, { unitId: "u1", outcome: "pass" })]),
    null,
  );
});

test("rollup: another unit's pass grants nothing", () => {
  assert.equal(rollupStatus("u1", [ev(SIGNING_EVENT_KIND, verdict("u2", "pass"))]), null);
});

test("rollup: out-of-order seq is sorted before walking", () => {
  const building = ev(WORK_EVENT_KIND, { unitId: "u1", event: "building" });
  const pass = ev(SIGNING_EVENT_KIND, verdict("u1", "pass"));
  // pass has the LATER seq; handing the array reversed must not change the answer.
  assert.equal(rollupStatus("u1", [pass, building]), "healthy");
});

test("workEvent validates and shapes the append payload", () => {
  const e = workEvent({ unitId: "u1", event: "building", runId: "r1" }, "tester");
  assert.deepEqual(e, {
    id: "r1:u1",
    kind: WORK_EVENT_KIND,
    type: "created",
    doc: { unitId: "u1", event: "building", runId: "r1" },
    actor: "tester",
  });
  assert.throws(() => workEvent({ unitId: "u1", event: "promoted" as never }, "tester"));
});

// The reusable parity discipline, run against the in-memory reference impl (mirrors storeParitySuite).
rollupParitySuite("InMemoryStore", () => new InMemoryStore());
