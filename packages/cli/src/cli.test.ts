import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/core";
import { loadCorpus } from "@storytree/store";

import { run } from "./commands.js";
import { formatEnvelope } from "./envelope.js";

/**
 * Offline tests (ADR-0022): seed an InMemoryStore from the studio data files via loadCorpus — no
 * Cloud SQL, no API key — and drive `run` exactly as `main` does. Asserts the choose-your-own-
 * adventure contract: a map with a total, drill-in to one artifact, list a category, and that misses
 * are guidance (ok:false + next), never throws.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("library dashboard reports a total + categories and maps artifacts by id", async () => {
  const env = await run(["library"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /Library: OK — \d+ artifacts across \d+ categories\./);
  assert.match(env.body, /edit-first-curation/);
  // The envelope always carries `next` branches.
  assert.match(formatEnvelope(env), /\nnext:\n/);
});

test("artifact <id> prints the artifact with its id and body", async () => {
  const env = await run(["library", "artifact", "edit-first-curation"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /id: edit-first-curation/);
  assert.match(env.body, /[Ee]dit/);
});

test("artifact list <category> returns rows and a doctrine pointer", async () => {
  const env = await run(["library", "artifact", "list", "principle"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /principle {2}\(\d+\)/);
  assert.ok(env.doctrine && env.doctrine.length > 0, "list emits a doctrine pointer");
});

test("unknown id is guidance (ok:false + next), not a throw", async () => {
  const env = await run(["library", "artifact", "does-not-exist"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "does-not-exist"/);
  assert.ok(env.next && env.next.length > 0);
});

test("unknown category lists the available categories", async () => {
  const env = await run(["library", "artifact", "list", "bogus"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown category "bogus"\. available categories:/);
});

test("an unknown area is guided back to library", async () => {
  const env = await run(["wat"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown area "wat"/);
});
