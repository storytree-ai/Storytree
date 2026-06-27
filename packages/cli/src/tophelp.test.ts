import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";

/**
 * Unit E (final) of the ADR-0118 workflow-first reshape: the top-help GOAL-FIRST flip. The discovery
 * surface now leads with the proof WORKFLOWS (adopt · build · witness · tree) and demotes the grain
 * verbs (node/story/gate/uat/attest) out of the primary area list into a back-compat-aliases note —
 * they still resolve (the cli-aliases suite proves that), they are just no longer advertised as
 * top-level peers. This is the surface the choose-your-own-adventure agent meets first.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("top help leads with the proof workflows (adopt · build · witness · tree)", async () => {
  const env = await run([], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /proof workflows/i, "a goal-first workflows section heads the surface");
  for (const wf of ["adopt", "build", "witness", "tree"]) {
    assert.match(env.body, new RegExp(`^\\s*${wf}\\b`, "m"), `${wf} is surfaced as a top workflow`);
  }
});

test("top help demotes the grain verbs to a back-compat-aliases note (not primary area lines)", async () => {
  const env = await run([], { store: await seeded() });
  // the relocations are taught in the alias note (no silent breakage)
  assert.match(env.body, /back-compat alias/i);
  assert.match(env.body, /node build → build node/);
  assert.match(env.body, /gate run → adopt gate/);
  assert.match(env.body, /uat list\|attest → witness list\|attest/);
  // the OLD primary area lines for the grain verbs are gone (demoted, ADR-0118)
  assert.doesNotMatch(env.body, /^\s+node\s+drive ONE node through the prove-it-gate \(/m);
  assert.doesNotMatch(env.body, /^\s+uat\s+per-test UAT proof/m);
  assert.doesNotMatch(env.body, /^\s+gate\s+brownfield reliability gates/m);
});

test("top help still surfaces the just-in-time doctrine pointer (unchanged by the flip)", async () => {
  const env = await run([], { store: await seeded() });
  assert.ok(
    (env.doctrine ?? []).some((d) => /pull-based-context-architecture/.test(d)),
    "the CYOA doctrine pointer is preserved",
  );
});

test("the dissolved grain verbs still resolve from the dispatch (the aliases the note promises)", async () => {
  const store = await seeded();
  // a couple of spot-checks that the demoted verbs are not broken — full coverage is in cli-aliases.test.ts
  const nodeResolve = await run(["node", "resolve", "library-cli"], { store });
  assert.equal(nodeResolve.ok, true, "`node resolve` (demoted) still resolves");
  const uatList = await run(["uat", "list", "library"], { store });
  assert.equal(uatList.ok, true, "`uat list` (demoted) still resolves");
});
