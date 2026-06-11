import { test } from "node:test";
import assert from "node:assert/strict";

import { KIND_SPECS, Knowledge, type KnowledgeKind } from "./knowledge.js";
import { renderBody, generateTemplate } from "./knowledge-render.js";
import { validateLibraryDoc } from "./store.js";

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
    if (spec.required) doc[spec.field] = `content for ${spec.field}`;
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
    for (const spec of KIND_SPECS[kind]) doc[spec.field] = spec.placeholder;
    const parsed = validateLibraryDoc(doc);
    assert.equal(
      renderBody(parsed as never),
      generateTemplate(kind),
      `${kind}: renderer and template generator must derive from the same table`,
    );
  }
});

test("agent kind: the ADR-0029 Q5 required/optional split holds", () => {
  const required = KIND_SPECS.agent.filter((s) => s.required).map((s) => s.field);
  const optional = KIND_SPECS.agent.filter((s) => !s.required).map((s) => s.field);
  assert.deepEqual(required, [
    "oneLine",
    "role",
    "owns",
    "authority",
    "outcome",
    "requiredReading",
    "tools",
    "workflow",
  ]);
  assert.deepEqual(optional, ["doesNotTouch", "rules", "antiPatterns", "escalation"]);
});
