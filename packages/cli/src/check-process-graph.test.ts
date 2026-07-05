import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus, processGraphViolations } from "@storytree/library/store";

/**
 * `check:process-graph` — the process branch-edge GRAPH integrity gate (ADR-0161 decision 5).
 *
 * The compute (processGraphViolations) is unit-tested exhaustively over fixtures in the library
 * (render-process.test.ts): a dangling branch-edge and a cycle each RED; a clean multi-node graph and a
 * graph-less corpus pass. This CLI test grounds the gate on the REAL seed corpus — the same offline
 * load the `pnpm check:process-graph` shell runs — so the invariant is pinned into `pnpm -r test`: the
 * day a real `process` is given a dangling or cyclic branch-edge, this reds immediately, not only at
 * the gate step. A NO-OP today (no seed process carries branchEdges), exactly as intended.
 */
test("check:process-graph — the real seed's process graph is sound (resolve + acyclic; the honest no-op today)", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const violations = await processGraphViolations(store);
  assert.deepEqual(violations, [], `the seed process graph must stay sound:\n${violations.join("\n")}`);
});
