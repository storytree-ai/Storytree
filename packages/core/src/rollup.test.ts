import test from "node:test";
import assert from "node:assert/strict";

import type { Verdict } from "./proof.js";
import {
  rollupStatus,
  rollupParitySuite,
  workEvent,
  WORK_EVENT_KIND,
  SIGNING_EVENT_KIND,
} from "./rollup.js";
import { InMemoryStore } from "./store.js";
import type { StoreEvent } from "./store.js";

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

test("rollup: a pass followed by a NEW building event => building (a rebuild supersedes)", () => {
  const events = [
    ev(SIGNING_EVENT_KIND, verdict("u1", "pass")),
    ev(WORK_EVENT_KIND, { unitId: "u1", event: "building", runId: "r2" }),
  ];
  assert.equal(rollupStatus("u1", events), "building");
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
