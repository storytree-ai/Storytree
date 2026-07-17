import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "./load-corpus.js";
import { libraryTemplates } from "../templates.js";

/**
 * ADR-0210 parity: after re-homing the `template` artifacts out of the retired generated
 * `assets.json` into `libraryTemplates()`, the migration must still seed every template. This runs
 * the REAL `loadCorpus` against an `InMemoryStore` — fully offline (it reads the repo's
 * `knowledge.json` and the in-process `libraryTemplates()`; no DB, no API key), so a half-done
 * re-home that silently dropped the templates fails here.
 */
test("loadCorpus seeds all 13 templates (re-homed from assets.json) plus the knowledge units", async () => {
  const store = new InMemoryStore();
  const result = await loadCorpus(store);

  const templates = libraryTemplates();
  assert.equal(result.templates, templates.length, "every library template is loaded");
  assert.equal(result.templates, 13, "the 13 canonical templates are loaded");
  assert.ok(result.knowledge > 0, "the structured knowledge units are still loaded");

  for (const tpl of templates) {
    const stored = await store.getDoc(tpl.id);
    assert.ok(stored, `${tpl.id} is present in the store`);
    assert.equal(stored.kind, "template", `${tpl.id} is stored under kind "template"`);
  }
});
