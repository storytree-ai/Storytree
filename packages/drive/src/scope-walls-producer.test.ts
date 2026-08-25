import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { SCOPE_EVENT_KIND, ScopeEventDoc } from "@storytree/proof-protocol";
import type { NodeSpec } from "@storytree/orchestrator";

import { driveNode } from "./node-build.js";

/**
 * The PRODUCER half of ADR-0446, end to end through production code.
 *
 * The increment this lands on names the trap directly: a counter that can only ever read zero —
 * "recorded but never written, written but never read, or READ FROM A PATH PRODUCTION DOES NOT
 * TAKE". `scope-walls.test.ts` proves the fold and `scope-reading.test.ts` proves the whole chain
 * over a forced refusal; neither would notice if `driveNode` stopped calling the append. THIS test
 * is that link: it drives a real node spec through the real dry-run walk and asserts the rows exist.
 * Delete the `appendSliceScope` call in `node-build.ts` and this goes red.
 *
 * A dry-run's store is in-memory, so the rows honestly die with the run — the same posture usage
 * accounting and the verdict already take. What is being asserted is the WIRING, which is identical
 * on the `--real --store pg` path where the rows persist.
 */

/** A spec-borne proof config is what makes a node driveable (ADR-0057); the dry-run walk itself
 *  proves the synthetic add(2,3) pair in a temp workspace, never this node's real files. */
function dryRunnableSpec(id: string): NodeSpec {
  return {
    id,
    tier: "capability",
    title: "a unit the dry run can walk",
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
    buildConfig: {
      command: { file: "node", args: ["--test"] },
      scope: { testGlobs: ["*.test.cjs"], sourceGlobs: ["impl.cjs"] },
    },
    guidance: undefined,
    uatTestCriteria: [],
    reliabilityGates: [],
    contracts: [],
    file: `stories/${id}.md`,
  };
}

async function scopeDocsFrom(store: InMemoryStore): Promise<ScopeEventDoc[]> {
  const events = await store.readEvents();
  return events
    .filter((e) => e.kind === SCOPE_EVENT_KIND)
    .map((e) => ScopeEventDoc.parse(e.doc));
}

test("scope-producer: a real dry-run walk BANKS a row for every authoring slice it armed", async () => {
  const store = new InMemoryStore();
  const result = await driveNode(dryRunnableSpec("scope-producer-probe"), {
    mode: "dry-run",
    store,
    runId: "run-scope-1",
    signer: "tester@example.com",
  });
  assert.equal(result.resolved, true, "the spec must resolve, or nothing downstream runs");

  const docs = await scopeDocsFrom(store);
  // The gate walks AUTHOR_TEST then IMPLEMENT; each is a slice the write fence was armed for.
  assert.deepEqual(
    docs.map((d) => d.phase),
    ["AUTHOR_TEST", "IMPLEMENT"],
    "the wiring must fire on the ordinary path, not only in the fold's own tests",
  );
  for (const doc of docs) {
    assert.equal(doc.armed, true);
    assert.equal(doc.unitId, "scope-producer-probe");
    assert.equal(doc.runId, "run-scope-1");
    // The OWNED LOOP is the dry-run leaf, and it is one of the two mechanisms whose refusals had
    // nowhere to land before this. Its rows must carry its own side of the no-path disagreement.
    assert.equal(doc.source, "owned-loop");
    assert.equal(doc.noPathDisposition, "passed-through");
    // The scripted leaf writes only in-scope, so this is the ARMED-AND-SILENT case: a zero that
    // exists, which is the entire difference between this and the pre-ADR-0446 world.
    assert.deepEqual(doc.refusals, []);
  }
});

test("scope-producer: a spec that never resolves banks NOTHING — no slice, no row", async () => {
  // The honest under-report. A walk that never armed a wall must not leave a denominator behind:
  // an invented row would make an unobserved fence look like an observed one.
  const store = new InMemoryStore();
  const spec = { ...dryRunnableSpec("scope-producer-unresolvable"), buildConfig: undefined };
  const result = await driveNode(spec, {
    mode: "dry-run",
    store,
    runId: "run-scope-2",
    signer: "tester@example.com",
  });
  assert.equal(result.resolved, false);
  assert.deepEqual(await scopeDocsFrom(store), []);
});
