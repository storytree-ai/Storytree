import test from "node:test";
import assert from "node:assert/strict";
import { validateLibraryDoc } from "./library-doc.js";

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
