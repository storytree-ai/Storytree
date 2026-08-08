import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore, type StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION } from "@storytree/library";
import { loadFixtureCorpus } from "@storytree/library/fixture";

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
 *  (b) a FIXTURE gate test — load `@storytree/library/fixture` into an InMemoryStore and assert
 *      gateFailures() is EMPTY (the GATE-class checks — schema-conformance / retired-field /
 *      version-floor — are clean on it). This is what makes `pnpm -r test` (ADR-0022) enforce the
 *      health ENGINE offline.
 *
 * WHAT (b) DOES NOT COVER, because its subject changed under it. It was written as a SEED gate over
 * `apps/studio/data/knowledge.json`, the committed mirror of the corpus — so a green run once did
 * mean the real corpus was schema-clean. ADR-0302 D1 DELETED that file, and the loader it now calls
 * reads a frozen 13-artifact literal that ADR-0302 D3 says is "deliberately NOT a mirror and never
 * reconciled, so it drifts by design". A green run therefore proves the three GATE-class checks
 * classify a known-clean corpus correctly, and says NOTHING about the live one — which on 2026-08-08
 * was RED on two of those three while this suite passed.
 *
 * That is not a hole to plug here. `storytree library --check` reads the live corpus on demand and
 * is deliberately not a merge gate (ADR-0026 §5, "by design, not every push"); making one would need
 * production-catch evidence and an ADR (ADR-0311 D5, `asset:justify-a-gate-rung`). What this comment
 * buys is that nobody reads a green `pnpm -r test` as the corpus being watched —
 * `stories/cli/verification-decay-instruments.md` already classes this suite as "five checks over a
 * frozen fixture corpus", proving facts about a JUDGE rather than about the world.
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

test("referential-integrity WARNs on a dangling node: pointer (ADR-0107 D2's third token)", () => {
  // A `node:<id>` ref used to fall through every arm and be silently ignored, so a citation of a
  // retired story dangled invisibly. WARN, not FAIL — like doc:, it points OUT of the library.
  const a = stored(validDefinitionBody({ id: "a", references: ["node:no-such-story"] }));
  const results = libraryHealth([a], { ...BASE_OPTS, nodeExists: () => false });
  const r = find(results, "referential-integrity");
  assert.equal(r.level, "WARN");
  assert.ok(r.lines.some((l) => l.includes("node:no-such-story")));
  assert.deepEqual(gateFailures(results), [], "still WARN-class — never a gate break");
});

test("referential-integrity PASSes a resolving node: pointer, and skips it with no resolver", () => {
  const a = stored(validDefinitionBody({ id: "a", references: ["node:cli"] }));
  assert.equal(
    find(libraryHealth([a], { ...BASE_OPTS, nodeExists: () => true }), "referential-integrity").level,
    "PASS",
  );
  assert.equal(
    find(libraryHealth([a], BASE_OPTS), "referential-integrity").level,
    "PASS",
    "no nodeExists injected => node: resolution is skipped, never failed",
  );
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

// --- (b) FIXTURE gate test ---------------------------------------------------------------------

test("FIXTURE gate: the frozen fixture corpus has NO gate failures (schema/retired/version clean)", async () => {
  const store = new InMemoryStore();
  await loadFixtureCorpus(store);
  const docs = await store.queryDocs();
  const results = libraryHealth(docs, BASE_OPTS);
  const gf = gateFailures(results);
  assert.deepEqual(
    gf.map((r) => `${r.name}: ${r.lines.join("; ")}`),
    [],
    "the GATE-class checks must be clean on the frozen fixture (NOT a claim about the live corpus)",
  );
  // referential-integrity may be WARN — do NOT assert it as gating here.
});
