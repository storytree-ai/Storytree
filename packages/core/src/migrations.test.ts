import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  upcast,
} from "./migrations.js";
import { validateLibraryDoc, upcastAndValidate } from "./store.js";

/**
 * Migration-registry + write-boundary upcaster tests (design §5:
 * docs/research/library-schema-migrations-and-health-checks.md). Offline (no DB, no API key).
 */

// A v0 structured definition unit that still carries a stray retired `seeAlso` field — the
// concurrently-authored old-shape doc from the incident (§1b pain-point #2). No schemaVersion yet.
function v0DefinitionWithSeeAlso(): Record<string, unknown> {
  return {
    kind: "definition",
    id: "test-term",
    title: "Test term",
    description: "A test definition for migration coverage.",
    references: ["doc:decisions/0017-knowledge-tier.md"],
    seeAlso: ["asset:proof-mode"], // retired field — must be dropped by migration #1
    oneLine: "A throwaway definition used only by the migration test suite.",
    whatItIs: "The exact meaning, stated precisely for the test.",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

// A rendered LibraryAsset (template) — has `category` + `body`, NO structured `kind`. Its schema is
// .strict() with no schemaVersion field, so upcast must leave it untouched.
function templateAsset(): Record<string, unknown> {
  return {
    id: "template-definition",
    category: "template",
    title: "Definition template",
    description: "The blank definition template.",
    body: "**In one line.** _What this term means._\n\n## What it is\n\n_..._",
    references: [],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
  };
}

test("upcast: v0 structured unit drops seeAlso, stamps schemaVersion, and validates", () => {
  const out = upcast(v0DefinitionWithSeeAlso());
  assert.equal("seeAlso" in out, false, "retired seeAlso dropped");
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION, "stamped to current version");
  assert.equal(CURRENT_SCHEMA_VERSION, 1, "current version is 1 (seeAlso-to-sources)");
  // The forwarded doc passes the strict validator (it would have been rejected un-upcast).
  const validated = validateLibraryDoc(out);
  assert.equal((validated as { schemaVersion?: number }).schemaVersion, 1);
});

test("upcast: idempotent — upcast(upcast(x)) deep-equals upcast(x)", () => {
  const once = upcast(v0DefinitionWithSeeAlso());
  const twice = upcast(once);
  assert.deepEqual(twice, once);
});

test("upcast: LibraryAsset/template passes through UNCHANGED (no schemaVersion) and still validates", () => {
  const asset = templateAsset();
  const out = upcast(asset);
  assert.deepEqual(out, asset, "asset passes through byte-for-byte");
  assert.equal("schemaVersion" in out, false, "no schemaVersion stamped onto an asset");
  // A LibraryAsset is .strict(); a stray schemaVersion would have thrown here.
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcastAndValidate: forwards a v0 doc instead of rejecting it", () => {
  // Bare validateLibraryDoc would throw on the stray seeAlso; upcastAndValidate forwards it.
  assert.throws(() => validateLibraryDoc(v0DefinitionWithSeeAlso()));
  const out = upcastAndValidate(v0DefinitionWithSeeAlso());
  assert.equal((out as { schemaVersion?: number }).schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal("seeAlso" in (out as Record<string, unknown>), false);
});

test("MIGRATIONS: registry is ordered and reaches CURRENT_SCHEMA_VERSION", () => {
  for (let i = 1; i < MIGRATIONS.length; i++) {
    const prev = MIGRATIONS[i - 1];
    const cur = MIGRATIONS[i];
    assert.ok(prev && cur && cur.version > prev.version, "migration versions strictly increasing");
  }
  const top = MIGRATIONS[MIGRATIONS.length - 1];
  assert.equal(top?.version, CURRENT_SCHEMA_VERSION, "top migration matches current version");
});
