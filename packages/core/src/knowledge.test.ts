import { test } from "node:test";
import assert from "node:assert/strict";

import { KIND_SPECS, Knowledge, type KnowledgeKind } from "./knowledge.js";
import { renderBody, generateTemplate } from "./knowledge-render.js";
import { validateLibraryDoc } from "./library-doc.js";

/**
 * KIND_SPECS ↔ zod parity (ADR-0018 one-table-three-consumers; ADR-0029 Q4 drift guard).
 * The schema, renderer and template generator are all DERIVED from KIND_SPECS, so the one
 * way a new kind can half-land is an enumeration that wasn't taught it — these tests make
 * that a red gate rather than a silent gap.
 */

const KINDS = Object.keys(KIND_SPECS) as KnowledgeKind[];

/** A minimal valid doc for a kind: common fields + every REQUIRED spec field. */
function minimalDoc(kind: KnowledgeKind): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    kind,
    id: `parity-${kind}`,
    title: `parity ${kind}`,
    description: "parity-suite fixture",
    references: [],
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
  for (const spec of KIND_SPECS[kind]) {
    if (spec.required) {
      doc[spec.field] = spec.refList === true ? [`asset:parity-${spec.field}`] : `content for ${spec.field}`;
    }
  }
  return doc;
}

test("KIND_SPECS and the Knowledge union enumerate the same kinds", () => {
  const unionKinds = Knowledge.options
    .map((option) => option.shape.kind.value)
    .sort();
  assert.deepEqual([...KINDS].sort(), unionKinds);
});

test("every kind has exactly one lead field", () => {
  for (const kind of KINDS) {
    const leads = KIND_SPECS[kind].filter((s) => s.lead);
    assert.equal(leads.length, 1, `${kind} must have exactly one lead field`);
  }
});

test("every kind: required fields validate, a missing required field fails closed", () => {
  for (const kind of KINDS) {
    const doc = minimalDoc(kind);
    assert.doesNotThrow(() => validateLibraryDoc(doc), `${kind}: minimal doc should validate`);
    for (const spec of KIND_SPECS[kind]) {
      if (!spec.required) continue;
      const rest: Record<string, unknown> = { ...doc };
      delete rest[spec.field];
      assert.throws(
        () => validateLibraryDoc(rest),
        `${kind}: dropping required ${spec.field} must fail`,
      );
    }
  }
});

test("every kind: .strict() rejects a field outside its KIND_SPECS table", () => {
  for (const kind of KINDS) {
    const doc = { ...minimalDoc(kind), notInTheSpec: "drift" };
    assert.throws(() => validateLibraryDoc(doc), `${kind}: unknown field must be rejected`);
  }
});

test("renderBody of an all-placeholder doc reproduces generateTemplate byte-for-byte", () => {
  for (const kind of KINDS) {
    const doc = minimalDoc(kind);
    // A refList placeholder is prose (not a valid asset: ref), so render the raw doc — this test
    // pins renderer<->template parity; schema acceptance is the minimal-doc test's job.
    for (const spec of KIND_SPECS[kind]) {
      doc[spec.field] = spec.refList === true ? [spec.placeholder] : spec.placeholder;
    }
    assert.equal(
      renderBody(doc as never),
      generateTemplate(kind),
      `${kind}: renderer and template generator must derive from the same table`,
    );
  }
});

test("agent kind: the ADR-0029 required/optional split holds (owner reshape, 2026-06-11)", () => {
  const required = KIND_SPECS.agent.filter((s) => s.required).map((s) => s.field);
  const optional = KIND_SPECS.agent.filter((s) => !s.required).map((s) => s.field);
  assert.deepEqual(required, ["oneLine", "role", "outcome", "context", "tools", "workflow"]);
  assert.deepEqual(optional, ["rules", "antiPatterns", "escalation"]);
});

test("agent kind: context/rules/antiPatterns are typed asset: ref-lists", () => {
  const refListFields = KIND_SPECS.agent.filter((s) => s.refList === true).map((s) => s.field);
  assert.deepEqual(refListFields, ["context", "rules", "antiPatterns"]);

  // A doc:/ADR ref in a ref-list fails closed — ADRs are searched, never preloaded.
  const banned = {
    ...minimalDoc("agent"),
    context: ["doc:decisions/0029-agents-as-library-artifact-category.md"],
  };
  assert.throws(() => validateLibraryDoc(banned), "doc: refs must be rejected in context");

  // Prose (non-ref) entries fail closed too — the field is a manifest, not markdown.
  const prose = { ...minimalDoc("agent"), rules: ["never restate the doctrine"] };
  assert.throws(() => validateLibraryDoc(prose), "prose entries must be rejected in rules");

  // A required ref-list must be non-empty.
  const empty = { ...minimalDoc("agent"), context: [] };
  assert.throws(() => validateLibraryDoc(empty), "empty required context must be rejected");

  // An optional ref-list may be absent, and valid refs validate.
  const valid = {
    ...minimalDoc("agent"),
    context: ["asset:edit-first-curation", "asset:reference-dont-restate"],
    rules: ["asset:reference-dont-restate"],
  };
  assert.doesNotThrow(() => validateLibraryDoc(valid));
});

test("renderBody: an unknown kind throws a DIAGNOSTIC error, not `specs is not iterable`", () => {
  // The stale-server incident (2026-06-11): code older than the data met a kind it had no
  // KIND_SPECS entry for and threw a bare iteration error deep in /api/assets.
  assert.throws(
    () => renderBody({ kind: "from-the-future" } as never),
    /unknown knowledge kind "from-the-future".*older than the stored doc/,
  );
});

test("renderBody: a ref-list renders as one bullet per ref; an empty optional list emits nothing", () => {
  const doc = validateLibraryDoc({
    ...minimalDoc("agent"),
    context: ["asset:a-one", "asset:b-two"],
    rules: [],
  });
  const body = renderBody(doc as never);
  assert.ok(body.includes("## Context\n\n- asset:a-one\n- asset:b-two"), "bulleted ref-list");
  assert.ok(!body.includes("## Rules"), "empty ref-list emits no heading");
});
