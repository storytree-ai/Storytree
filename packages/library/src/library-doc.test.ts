import test from "node:test";
import assert from "node:assert/strict";
import { explainDocValidationError, upcastAndValidate, validateLibraryDoc } from "./library-doc.js";

/**
 * Write-boundary validator tests for {@link validateLibraryDoc} (ADR-0017: zod-validated at write).
 * Moved here WITH the knowledge schema from `packages/core/src/store.test.ts` (ADR-0068 step 4) so
 * the schema and its boundary tests are co-located. The discriminated-union + per-kind coverage
 * lives in `knowledge.test.ts`; these cases pin the LibraryDoc UNION (structured Knowledge OR
 * rendered LibraryAsset) and the loud-throw contract.
 */

test("validateLibraryDoc accepts a well-formed knowledge doc", () => {
  const doc = {
    kind: "principle",
    id: "p1",
    title: "Less is more",
    description: "one line",
    statement: "Prefer the smaller surface.",
    why: "Smaller surfaces are easier to prove.",
    howToApply: "Ask: can this be removed?",
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(doc);
  assert.ok("kind" in parsed && parsed.kind === "principle");
});

test("validateLibraryDoc accepts a generated template artifact", () => {
  const tpl = {
    id: "template-principle",
    category: "template",
    title: "Template · principle",
    description: "the shape a principle conforms to",
    body: "**The principle.** _..._",
    references: [],
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(tpl);
  assert.ok("category" in parsed && parsed.category === "template");
});

test("validateLibraryDoc accepts a general edited asset (any category + body)", () => {
  // The studio edits a structured unit and persists it in rendered form: a body-bearing asset
  // whose category is NOT 'template' (here a 'definition'). The generalised boundary accepts it.
  const asset = {
    id: "owned-loop",
    category: "definition",
    title: "Owned loop",
    description: "the agent loop we build and own",
    body: "**In one line.** The loop we own end to end.\n\n## What it is\n\nOurs.",
    references: ["doc:decisions/0019-...md"],
    createdAt: "2026-06-08T00:00:00Z",
    updatedAt: "2026-06-08T00:00:00Z",
  };
  const parsed = validateLibraryDoc(asset);
  assert.ok("category" in parsed && parsed.category === "definition");
  assert.ok("body" in parsed && typeof parsed.body === "string");
});

test("validateLibraryDoc throws on malformed input (loud write boundary)", () => {
  assert.throws(() => validateLibraryDoc({ kind: "principle", id: "p1" }));
  assert.throws(() => validateLibraryDoc({ kind: "not-a-kind" }));
  assert.throws(() => validateLibraryDoc({ category: "template", id: "t1" })); // missing body/title
});

// ---------------------------------------------------------------------------
// explainDocValidationError — the invalid_union dump, read back as one arm
// (the `friction-capture-surface-is-itself-high-friction` item, route `tool`)
// ---------------------------------------------------------------------------

/** Run a doc through the real write boundary and hand the thrown error to the explainer. */
function explain(doc: unknown): string {
  try {
    upcastAndValidate(doc);
  } catch (e) {
    return explainDocValidationError(doc, e);
  }
  throw new Error("expected the doc to fail validation");
}

const STAMPED = {
  kind: "friction",
  provenance: { branch: "b", date: "2026-07-29", source: "retro" },
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
} as const;

test("explainDocValidationError names the real defect, not the other union arm's keys", () => {
  // The item's own reproduction: a friction doc authored with `body` instead of the required
  // statement/evidence/impact triple. The raw throw reports BOTH arms, and the LibraryAsset arm
  // calls `kind`/`provenance`/`schemaVersion` unrecognized — keys the CLI stamps and the caller
  // cannot remove. The explanation must name the FRICTION arm's issues and only those.
  const msg = explain({ ...STAMPED, id: "x", title: "T", description: "d", body: "prose" });

  assert.match(msg, /friction artifact schema/);
  assert.match(msg, /missing required field\(s\): statement, evidence, impact/);
  assert.match(msg, /field\(s\) this kind does not have: body/);
  // The keys the caller cannot remove must NOT be reported as the problem.
  for (const stamped of ["kind", "provenance", "schemaVersion"]) {
    assert.ok(
      !new RegExp(`does not have:[^\\n]*\\b${stamped}\\b`).test(msg),
      `stamped key "${stamped}" must not be blamed: ${msg}`,
    );
  }
});

test("explainDocValidationError distinguishes a near-miss field name from the required one", () => {
  // The 2026-07-29 reinforcement: `summary` used where commonShape requires `description`. The raw
  // union dump blamed [summary, statement, evidence, impact, kind, provenance, schemaVersion] —
  // four of which are the CORRECT friction body fields.
  const msg = explain({
    ...STAMPED,
    id: "x",
    title: "T",
    summary: "d",
    statement: "s",
    evidence: "`e`",
    impact: "i",
  });

  assert.match(msg, /missing required field\(s\): description/);
  assert.match(msg, /field\(s\) this kind does not have: summary/);
  for (const correct of ["statement", "evidence", "impact"]) {
    assert.ok(
      !new RegExp(`does not have:[^\\n]*\\b${correct}\\b`).test(msg),
      `required field "${correct}" must not be blamed: ${msg}`,
    );
  }
  // And it says what the kind DOES take, the `artifact edit --set` "editable fields" treatment.
  assert.match(msg, /a friction artifact takes: .*\bdescription\b/);
});

test("explainDocValidationError diagnoses the rendered-asset arm from `category`", () => {
  const msg = explain({ id: "t1", category: "template", title: "T" }); // no description/body
  assert.match(msg, /rendered artifact \(category "template"\) schema/);
  assert.match(msg, /missing required field\(s\): description, body/);
});

test("explainDocValidationError names the kinds when the kind itself is unknown", () => {
  const msg = explain({ kind: "frictoin", id: "x" });
  assert.match(msg, /unknown artifact kind "frictoin"/);
  assert.match(msg, /friction/); // the real kind is in the offered list
});

test("explainDocValidationError falls back to the raw message rather than guessing", () => {
  // No `kind` and no `category` — there is no single arm to check against, so the raw union error
  // survives (a diagnosis it cannot make honestly is never invented).
  const msg = explain({ id: "x", title: "T" });
  assert.match(msg, /invalid_union|Invalid input/);
  assert.match(msg, /neither a `kind`.*nor a `category`/s);
});
