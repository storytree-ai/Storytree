import { test } from "node:test";
import assert from "node:assert/strict";

import type { Store, StoredDoc } from "@storytree/base";
import { InMemoryStore } from "@storytree/base";
import { loadCorpus } from "@storytree/store";

import { renderDoctrine, renderDoctrines } from "./doctrine.js";

/** A store with one pattern artifact whose description is the doctrine gloss. */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "edit-first-curation",
    kind: "pattern",
    doc: {
      kind: "pattern",
      title: "Edit-first curation",
      description: "Edit is the default; authoring a new artifact is the justified exception.",
      statement: "Edit the closest existing artifact by default.",
      problem: "Duplicate artifacts split authority.",
      approach: "Search before you write.",
      tradeoffs: "Up-front search vs downstream split authority.",
      references: [],
    },
  });
  return store;
}

test("renders <id> — <gloss>  (explore command) sourced from the artifact's description", async () => {
  const line = await renderDoctrine(await seeded(), "edit-first-curation");
  assert.equal(
    line,
    "edit-first-curation — Edit is the default; authoring a new artifact is the justified exception.  (storytree library artifact edit-first-curation)",
  );
});

test("the line is a POINTER, not the artifact body inlined", async () => {
  const line = await renderDoctrine(await seeded(), "edit-first-curation");
  // the explore command is present...
  assert.match(line, /storytree library artifact edit-first-curation/);
  // ...but the body fields (statement / problem / approach) are NOT inlined
  assert.doesNotMatch(line, /Search before you write/);
  assert.doesNotMatch(line, /split authority/);
});

test("a missing artifact is fail-soft: a bare pointer line, never blank, never a throw", async () => {
  const line = await renderDoctrine(new InMemoryStore(), "edit-first-curation");
  assert.equal(line, "edit-first-curation  (storytree library artifact edit-first-curation)");
});

test("a store that throws is fail-soft: the bare pointer, not a crash", async () => {
  const throwingStore = {
    async getDoc(): Promise<StoredDoc | null> {
      throw new Error("store is down");
    },
  } as unknown as Store;
  const line = await renderDoctrine(throwingStore, "edit-first-curation");
  assert.equal(line, "edit-first-curation  (storytree library artifact edit-first-curation)");
});

test("renderDoctrines preserves order and renders each", async () => {
  const store = await seeded();
  const lines = await renderDoctrines(store, ["edit-first-curation", "ghost-id"]);
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^edit-first-curation — /);
  assert.equal(lines[1], "ghost-id  (storytree library artifact ghost-id)");
});

test("offline against the real corpus seed: the doctrine resolves with the explore command", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const line = await renderDoctrine(store, "edit-first-curation");
  assert.match(line, /^edit-first-curation — .+ {2}\(storytree library artifact edit-first-curation\)$/);
});
