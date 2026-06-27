import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";

/**
 * Unit B of the ADR-0118 workflow-first reshape: `adopt gate` — the OBSERVE gate primitive relocates
 * under the adopt workflow (observe-and-sign ONE observe gate, was `gate run <g>`). ADR-0118 un-conflates
 * the old `gate run` phase fork at the surface: observe → `adopt gate`, build-tests → `build gate --real`
 * (Unit A). `gate run <g>` stays as the back-compat alias (same code path). These offline tests prove the
 * routing + the alias; the observe-and-sign behaviour itself is covered exhaustively in gate.test.ts.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("adopt help surfaces the `adopt gate` observe primitive and points build-tests at `build gate --real`", async () => {
  const env = await run(["adopt"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree adopt gate <story>#gate-<n>/);
  // teaches the un-conflation: a build-tests gate is NOT adoption — it is earned by `build gate --real`
  assert.match(env.body, /build gate .*--real/);
});

test("adopt gate routes to the gate observe RUN path (no id → the gate-run 'needs a gate id' guidance)", async () => {
  const env = await run(["adopt", "gate"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a gate id/);
});

test("adopt gate <g> is the back-compat alias of `gate run <g>` — identical envelope", async () => {
  const store = await seeded();
  const viaAdopt = await run(["adopt", "gate", "library#gate-1", "--store", "memory"], { store });
  const viaGateRun = await run(["gate", "run", "library#gate-1", "--store", "memory"], { store });
  assert.deepEqual(viaAdopt, viaGateRun, "`adopt gate <g>` and `gate run <g>` are one code path");
});

test("the adopt area still runs adoption and classifies plan (unchanged by the gate primitive)", async () => {
  const store = await seeded();
  // plan stays offline + read-only
  const plan = await run(["adopt", "plan", "library"], { store });
  assert.equal(plan.ok, true);
  assert.match(plan.body, /Adoption plan for "library"/);
  // a bare `adopt <story>` run still refuses offline (no --pg) — routing to runAdopt, not the gate path
  const runAdopt = await run(["adopt", "library"], { store });
  assert.equal(runAdopt.ok, false);
});
