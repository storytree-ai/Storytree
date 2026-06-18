import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore } from "@storytree/base";
import { CURRENT_SCHEMA_VERSION } from "@storytree/library";
import { batchMigrate } from "./batch-migrate.js";

/**
 * Offline batch-migrate tests (design §3 "eager batch":
 * docs/research/library-schema-migrations-and-health-checks.md). Runs against InMemoryStore — NO
 * DB, NO API key. InMemoryStore.upsertDoc stores the doc as-is (no write-boundary upcast), so a
 * seeded v0 doc stays v0 until batchMigrate forwards it — exactly the lazy/eager split we test.
 */

// A v0 structured definition unit (no schemaVersion, carries the retired `seeAlso`) — the
// concurrently-authored old-shape doc from the incident (§1b pain-point #2).
function v0Definition(): Record<string, unknown> {
  return {
    kind: "definition",
    id: "test-term",
    title: "Test term",
    description: "A test definition for batch-migrate coverage.",
    references: ["doc:decisions/0017-knowledge-tier.md"],
    seeAlso: ["asset:proof-mode"], // retired field — migration #1 must drop it
    oneLine: "A throwaway definition used only by the batch-migrate test suite.",
    whatItIs: "The exact meaning, stated precisely for the test.",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

test("batchMigrate: upgrades a v0 structured doc to CURRENT_SCHEMA_VERSION in place", async () => {
  const store = new InMemoryStore();
  const v0 = v0Definition();
  await store.upsertDoc({ id: v0["id"] as string, kind: v0["kind"] as string, doc: v0 });

  // Seeded as-is: still v0, still carrying the retired field.
  const before = await store.getDoc("test-term");
  assert.equal((before?.doc as Record<string, unknown>)["schemaVersion"], undefined);
  assert.equal("seeAlso" in (before?.doc as Record<string, unknown>), true);

  const result = await batchMigrate(store);
  assert.equal(result.scanned, 1, "one artifact scanned");
  assert.equal(result.upgraded, 1, "the v0 doc was upgraded");

  const after = await store.getDoc("test-term");
  const doc = after?.doc as Record<string, unknown>;
  assert.equal(doc["schemaVersion"], CURRENT_SCHEMA_VERSION, "stamped to current version");
  assert.equal("seeAlso" in doc, false, "retired seeAlso dropped");
  // Other content preserved.
  assert.equal(doc["title"], "Test term");
  assert.deepEqual(doc["references"], ["doc:decisions/0017-knowledge-tier.md"]);
});

test("batchMigrate: re-running is a no-op (0 upgraded)", async () => {
  const store = new InMemoryStore();
  const v0 = v0Definition();
  await store.upsertDoc({ id: v0["id"] as string, kind: v0["kind"] as string, doc: v0 });

  const first = await batchMigrate(store);
  assert.equal(first.upgraded, 1);

  const second = await batchMigrate(store);
  assert.equal(second.scanned, 1, "still one artifact");
  assert.equal(second.upgraded, 0, "already at current version — nothing to do");
});

test("batchMigrate: leaves a non-structured asset untouched", async () => {
  const store = new InMemoryStore();
  const asset = {
    id: "template-definition",
    category: "template",
    title: "Definition template",
    description: "The blank definition template.",
    body: "**In one line.** _What this term means._",
    references: [],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
  };
  await store.upsertDoc({ id: asset.id, kind: "template", doc: asset });

  const result = await batchMigrate(store);
  assert.equal(result.scanned, 1);
  assert.equal(result.upgraded, 0, "an asset has no schemaVersion to bump — passthrough");

  const after = await store.getDoc("template-definition");
  assert.equal("schemaVersion" in (after?.doc as Record<string, unknown>), false);
});
