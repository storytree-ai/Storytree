import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore, type StoredDoc } from "@storytree/base";
import { CURRENT_SCHEMA_VERSION } from "@storytree/library";
import { loadCorpus } from "@storytree/store";

import {
  libraryHealth,
  libraryHealthCheap,
  worstLevel,
  gateFailures,
  levelCounts,
  GATE_CHECKS,
  type CheckResult,
} from "./health.js";

/**
 * Health-check tests (design §4: docs/research/library-schema-migrations-and-health-checks.md).
 * OFFLINE — no DB, no API key. Two parts:
 *  (a) pure-function tests with stubbed docs for each level of each check;
 *  (b) a SEED gate test — load the corpus into an InMemoryStore and assert gateFailures() is EMPTY
 *      (the GATE-class checks — schema-conformance / retired-field / version-floor — are clean on the
 *      stamped seed). This is what makes `pnpm -r test` (ADR-0022) enforce migration health.
 */

const BASE_OPTS = { currentSchemaVersion: CURRENT_SCHEMA_VERSION, retiredFields: ["seeAlso"] };

/** A valid, current-version structured definition unit (the body that lives in StoredDoc.doc). */
function validDefinitionBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "definition",
    id: "good-term",
    title: "Good term",
    description: "A valid definition for the health tests.",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    references: [],
    oneLine: "A throwaway definition used only by the health test suite.",
    whatItIs: "The exact meaning, stated precisely for the test.",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...over,
  };
}

/** Wrap a doc body as a StoredDoc (kind mirrors the body's kind/category). */
function stored(body: Record<string, unknown>): StoredDoc {
  const kind =
    typeof body.kind === "string"
      ? body.kind
      : typeof body.category === "string"
        ? body.category
        : "";
  return {
    id: typeof body.id === "string" ? body.id : "",
    kind,
    doc: body,
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

function find(results: readonly CheckResult[], name: string): CheckResult {
  const r = results.find((x) => x.name === name);
  assert.ok(r, `missing check ${name}`);
  return r;
}

// --- (a) pure-function tests -------------------------------------------------------------------

test("schema-conformance PASS on a valid current-version structured doc", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "schema-conformance").level, "PASS");
});

test("schema-conformance FAIL on a structured doc missing a required field", () => {
  // Drop the required `whatItIs` — upcastAndValidate can't forward it, so it throws => FAIL.
  const bad = validDefinitionBody();
  delete bad.whatItIs;
  const results = libraryHealth([stored(bad)], BASE_OPTS);
  const r = find(results, "schema-conformance");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("good-term")), "names the offending id");
});

test("schema-conformance skips non-structured (template) docs", () => {
  // A template asset has no structured `kind`; it is not subject to the schema-conformance check.
  const tpl = stored({ id: "template-definition", category: "template", title: "T", description: "d", body: "b", references: [] });
  const results = libraryHealth([tpl], BASE_OPTS);
  assert.equal(find(results, "schema-conformance").level, "PASS");
});

test("retired-field PASS when no doc carries a retired field", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "retired-field").level, "PASS");
});

test("retired-field FAIL when a doc still carries 'seeAlso' in its stored body", () => {
  // The stored body carries seeAlso (a concurrently-authored old-shape doc). retired-field inspects
  // the STORED body directly, so it catches this even though schema-conformance would upcast it away.
  const results = libraryHealth([stored(validDefinitionBody({ seeAlso: ["asset:x"] }))], BASE_OPTS);
  const r = find(results, "retired-field");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("seeAlso")));
});

test("version-floor PASS when every structured doc is at the current version", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "version-floor").level, "PASS");
});

test("version-floor FAIL when a structured doc sits below the current version", () => {
  const results = libraryHealth([stored(validDefinitionBody({ schemaVersion: 0 }))], BASE_OPTS);
  const r = find(results, "version-floor");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("good-term")));
});

test("referential-integrity PASS when every pointer resolves", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["asset:b"] }));
  const b = stored(validDefinitionBody({ id: "b" }));
  const results = libraryHealth([a, b], { ...BASE_OPTS, docExists: () => true });
  assert.equal(find(results, "referential-integrity").level, "PASS");
});

test("referential-integrity FAIL on a dangling asset: pointer (a real graph break)", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["asset:ghost"] }));
  const results = libraryHealth([a], BASE_OPTS);
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "FAIL");
  assert.ok(r.lines.some((l) => l.includes("asset:ghost")));
});

test("referential-integrity WARN on a dangling doc: pointer (softer — a doc can move)", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, docExists: () => false });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("doc:missing/file.md")));
});

test("referential-integrity skips doc: resolution when no docExists is injected", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], BASE_OPTS); // no docExists
  assert.equal(find(results, "referential-integrity").level, "PASS");
});

test("count-reconciliation PASS when structured count == generatedAssetCount", () => {
  const results = libraryHealth([stored(validDefinitionBody())], { ...BASE_OPTS, generatedAssetCount: 1 });
  assert.equal(find(results, "count-reconciliation").level, "PASS");
});

test("count-reconciliation WARN on a mismatch (stale generated views)", () => {
  const results = libraryHealth([stored(validDefinitionBody())], { ...BASE_OPTS, generatedAssetCount: 99 });
  assert.equal(find(results, "count-reconciliation").level, "WARN");
});

test("count-reconciliation degrades to PASS when no count is injected", () => {
  const results = libraryHealth([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(find(results, "count-reconciliation").level, "PASS");
});

test("worstLevel / gateFailures / levelCounts agree on a FAIL-class break", () => {
  // A missing required field -> schema-conformance FAIL (a GATE check).
  const bad = validDefinitionBody();
  delete bad.whatItIs;
  const results = libraryHealth([stored(bad)], BASE_OPTS);
  assert.equal(worstLevel(results), "FAIL");
  const gf = gateFailures(results);
  assert.equal(gf.length, 1);
  assert.equal(gf[0]?.name, "schema-conformance");
  assert.ok(GATE_CHECKS.has("schema-conformance"));
  assert.equal(levelCounts(results).fail, 1);
});

test("gateFailures is EMPTY when only a WARN-class check is non-green", () => {
  // A dangling doc: pointer -> referential-integrity WARN (NOT a gate check) => no gate failures.
  const a = stored(validDefinitionBody({ id: "a", references: ["doc:missing/file.md"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, docExists: () => false });
  assert.equal(worstLevel(results), "WARN");
  assert.deepEqual(gateFailures(results), []);
});

test("libraryHealthCheap omits the fs-heavy referential-integrity check", () => {
  const cheap = libraryHealthCheap([stored(validDefinitionBody())], BASE_OPTS);
  assert.equal(cheap.find((r) => r.name === "referential-integrity"), undefined);
  assert.ok(cheap.find((r) => r.name === "schema-conformance"));
});

// --- (b) SEED gate test ------------------------------------------------------------------------

test("SEED gate: the stamped corpus has NO gate failures (schema/retired/version clean)", async () => {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const docs = await store.queryDocs();
  const results = libraryHealth(docs, BASE_OPTS);
  const gf = gateFailures(results);
  assert.deepEqual(
    gf.map((r) => `${r.name}: ${r.lines.join("; ")}`),
    [],
    "the GATE-class checks must be clean on the stamped seed",
  );
  // referential-integrity / count-reconciliation may be WARN — do NOT assert them as gating here.
});
