import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";

/**
 * Unit D of the ADR-0118 workflow-first reshape: `tree` absorbs gate INSPECTION. The focused
 * `tree <story>` view now renders a per-gate "Reliability gates:" block (id, kind, signed-verdict
 * glyph) — the brownfield obligation set that was only in the standalone `gate list`. `gate list`
 * stays as a back-compat alias (no verb relocated — the inspection is absorbed into the orientation
 * surface, not renamed), so there is no new alias-coverage row; this proves the absorption + coexistence.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("tree <story> absorbs the gate inspection — renders a per-gate Reliability gates block (ADR-0118)", async () => {
  const env = await run(["tree", "library"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /Reliability gates:/, "the focused view carries the per-gate inspection");
  // each gate row carries its kind — the inspection content that was `gate list`
  assert.match(env.body, /kind=(observe|build-tests|integrate)/);
});

test("the per-gate block is conditional — the bare `tree` story list has no Reliability gates block", async () => {
  const env = await run(["tree"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.doesNotMatch(env.body, /Reliability gates:/);
});

test("`gate list <story>` still works as a back-compat alias and points at the tree inspection", async () => {
  const env = await run(["gate", "list", "library"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /Reliability gates for "library"/);
  // it teaches that the same inspection now reads in the orientation surface
  assert.ok((env.next ?? []).some((n) => /storytree tree library/.test(n)), "gate list points at tree");
});
