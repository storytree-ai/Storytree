import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { NodeSpec } from "@storytree/orchestrator";

import { driveNode } from "./node-build.js";
import type { DriveNodeArgs } from "./node-build.js";

/**
 * The PRODUCER half of ADR-0350's causal edge, end to end through production code.
 *
 * ADR-0350 D4 refuses a dormant field: the schema lands only alongside a real producer, "proven by
 * a test that fails when the stamp is dropped". THIS is that test for the emitting side — delete
 * the `causedBy` spread on the `building` mark in `driveNode` and the first assertion goes red.
 *
 * HOW IT STAYS CHEAP: `driveNode` appends the `building` lifecycle mark BEFORE it resolves the spec
 * into a runnable proof. A spec that carries no `proof:` block and matches no registry entry fails
 * to resolve, so the drive returns early — after the event we are asserting on, and before any
 * workspace build, leaf spend or gate walk. The event log is the whole subject here.
 */

/** A spec that deliberately does not resolve: no `proof:` block, no registry entry for the id. */
function unresolvableSpec(id: string): NodeSpec {
  return {
    id,
    tier: "capability",
    title: "a unit that cannot be built",
    outcome: "n/a",
    status: "mapped",
    proofMode: "contract-test",
    uatWitness: undefined,
    story: undefined,
    dependsOn: [],
    consumedBy: [],
    artifactEdges: [],
    capabilities: [],
    decisions: [],
    buildConfig: undefined,
    guidance: undefined,
    uatTestCriteria: [],
    reliabilityGates: [],
    contracts: [],
    file: `stories/${id}.md`,
  };
}

async function driveWith(claimEventSeq?: number): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  const args: DriveNodeArgs = {
    mode: "dry-run",
    store,
    runId: "run-causal-1",
    signer: "tester@example.com",
  };
  if (claimEventSeq !== undefined) args.claimEventSeq = claimEventSeq;
  const result = await driveNode(unresolvableSpec("causal-edge-probe"), args);
  // The drive stops at the unresolvable spec — which is the point: the building mark is already in
  // the log, and no build, spend or gate walk happened to get it there.
  assert.equal(result.resolved, false);
  return store;
}

test("ADR-0350: the `building` mark names the CLAIM that authorised the write", async () => {
  const store = await driveWith(4412);
  const events = await store.readEvents();
  const building = events.find((e) => (e.doc as { event?: string }).event === "building");

  assert.ok(building, "the building lifecycle mark is appended before the spec resolves");
  // The whole point of the pair: claim_event carries session_id, work_event carries actor, neither
  // carries a run_id, and no key joins them — so this edge is the only record of which claim
  // authorised which build.
  assert.deepEqual(building.causedBy, { stream: "claim_event", seq: 4412 });
});

test("ADR-0350 D2: with NO claim to name, the mark carries NO edge — never a guessed one", async () => {
  const store = await driveWith(undefined);
  const events = await store.readEvents();
  const building = events.find((e) => (e.doc as { event?: string }).event === "building");

  assert.ok(building);
  // A dry-run, a live smoke and any non-worktree build take no claim at all. Under-reporting is the
  // ACCEPTED failure mode; inferring a plausible cause from what happened nearby is the banned one.
  assert.ok(!("causedBy" in building), "absent stays absent — no null, no nearest-preceding guess");
});

test("ADR-0350 D6: the causal edge does not touch runId — they are different axes", async () => {
  const store = await driveWith(4412);
  const events = await store.readEvents();
  const building = events.find((e) => (e.doc as { event?: string }).event === "building");

  // Correlation groups a run; causation links two events. Stamping one must not disturb the other.
  assert.equal((building?.doc as { runId?: string }).runId, "run-causal-1");
  assert.deepEqual(building?.causedBy, { stream: "claim_event", seq: 4412 });
});
