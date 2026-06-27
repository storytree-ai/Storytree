import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";

/**
 * Unit C of the ADR-0118 workflow-first reshape: the `witness` WORKFLOW — the human/operator proof
 * surface that cuts across adopt AND build (you witness a story's UAT either way), so it is its own
 * top-level workflow. The per-test UAT proof (`witness list`/`witness attest`, was `uat`) and the
 * lower-rigor ADR-0044 vouch (`witness vouch`, was `attest`) relocate here; `uat`/`attest` keep working
 * as back-compat aliases. Offline routing tests; the uat/attest engines are covered in uat/attest tests.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("witness (bare) shows the workflow help: list · attest · vouch + the back-compat aliases", async () => {
  const env = await run(["witness"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /storytree witness list <story-id>/);
  assert.match(env.body, /storytree witness attest <story>#uat-<n>/);
  assert.match(env.body, /storytree witness vouch <story>#uat-<n>/);
  assert.match(env.body, /storytree witness vouch list/);
  // teaches the verdict-vs-vouch distinction and advertises the aliases
  assert.match(env.body, /operator-attested/);
  assert.match(env.body, /uat list/);
  assert.match(env.body, /attest/);
});

test("top help lists the witness workflow", async () => {
  const env = await run([], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /^\s*witness\b/m, "top help lists the witness area");
});

test("witness list <story> routes to the per-test UAT read path (was `uat list`)", async () => {
  const env = await run(["witness", "list", "library"], { store: await seeded() });
  assert.equal(env.ok, true);
  // either the story's UAT tests render, or it honestly says there are none — both are the uat-list path
  assert.match(env.body, /UAT tests for "library"|declares no UAT tests/);
});

test("witness vouch <test> routes to the attestation-vouch record path (was `attest`) — refuses offline", async () => {
  const env = await run(["witness", "vouch", "library#uat-1"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /live store|--pg/);
});

test("witness vouch list <test> routes to the vouch history path (was `attest list`) — refuses offline", async () => {
  const env = await run(["witness", "vouch", "list", "library#uat-1"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /live store|--pg/);
});

test("witness attest <test> routes to the operator-attested write path (was `uat attest`) — refuses offline", async () => {
  const env = await run(["witness", "attest", "library#uat-1"], { store: await seeded() });
  // offline it cannot persist a verdict; whatever the refusal, it is not an ok pass
  assert.equal(env.ok, false);
});
