import test from "node:test";
import assert from "node:assert/strict";
import type { StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION } from "../migrations.js";
import { renderBody } from "../knowledge-render.js";
import { upcastAndValidate } from "../library-doc.js";
import { renderStoredDoc, buildLibraryDoc } from "./render-doc.js";

/**
 * Offline + pure: renderStoredDoc maps a StoredDoc into the GuidanceAsset wire shape. Two paths:
 * a structured Knowledge unit (body DERIVED via renderBody, category = kind) and a body-bearing
 * asset/template (body passed THROUGH, category = the doc's own).
 */

test("renderStoredDoc derives the body of a structured principle (category = kind)", () => {
  const principle = {
    kind: "principle",
    id: "less-is-more",
    title: "Less is more",
    description: "prefer the smaller surface",
    references: ["doc:decisions/0017-...md"],
    statement: "Prefer the smaller surface.",
    why: "Smaller surfaces are easier to prove.",
    howToApply: "Ask: can this be removed?",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "less-is-more",
    kind: "principle",
    doc: principle,
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.id, "less-is-more");
  assert.equal(rendered.category, "principle", "category is the stored kind");
  assert.equal(rendered.degraded, undefined, "a current-shape doc is never flagged");
  assert.equal(rendered.title, "Less is more");
  assert.equal(rendered.description, "prefer the smaller surface");
  assert.deepEqual(rendered.references, ["doc:decisions/0017-...md"]);
  // Body is derived, byte-for-byte, from the structured fields.
  assert.equal(rendered.body, renderBody(principle as never));
  assert.match(rendered.body, /\*\*The principle\.\*\* Prefer the smaller surface\./);
  assert.match(rendered.body, /## Why/);
  // Timestamps come from the StoredDoc envelope, not the inner doc.
  assert.equal(rendered.createdAt, "2026-06-02T00:00:00Z");
  assert.equal(rendered.updatedAt, "2026-06-03T00:00:00Z");
});

test("renderStoredDoc passes through a template's string body (category from the doc)", () => {
  const template = {
    id: "template-principle",
    category: "template",
    title: "Template · principle",
    description: "the shape a principle conforms to",
    body: "**The principle.** _The judgement rule, in one sentence._",
    references: [],
  };
  const stored: StoredDoc = {
    id: "template-principle",
    kind: "template",
    doc: template,
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.category, "template", "category from the doc, not derived");
  assert.equal(rendered.body, template.body, "string body passed through verbatim");
  assert.equal(rendered.title, "Template · principle");
  assert.deepEqual(rendered.references, []);
});

test("renderStoredDoc on an edited asset (body present, non-template category) passes through", () => {
  // A structured unit the studio edited and re-stored in rendered form keeps its own category.
  const edited = {
    id: "owned-loop",
    category: "definition",
    title: "Owned loop",
    description: "the agent loop we own",
    body: "**In one line.** Ours, end to end.",
    references: ["doc:decisions/0019-...md"],
  };
  const stored: StoredDoc = {
    id: "owned-loop",
    kind: "definition",
    doc: edited,
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);
  assert.equal(rendered.category, "definition");
  assert.equal(rendered.body, edited.body);
  assert.equal(rendered.updatedAt, "2026-06-05T00:00:00Z");
});

test("renderStoredDoc falls back to the stored kind when a body doc omits category", () => {
  const stored: StoredDoc = {
    id: "x",
    kind: "pattern",
    doc: { id: "x", title: "T", description: "d", body: "b" },
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
  };
  const rendered = renderStoredDoc(stored);
  assert.equal(rendered.category, "pattern");
});

// ---- fail-soft on data newer than the code (the studio version-skew incident, 2026-06-11) ----

test("renderStoredDoc DEGRADES (never throws) on a kind this code does not know", () => {
  // What a stale server sees after a newer session adds a kind: no KIND_SPECS entry at all.
  const stored: StoredDoc = {
    id: "navigator",
    kind: "from-the-future",
    doc: {
      kind: "from-the-future",
      id: "navigator",
      title: "Navigator",
      description: "a unit from a newer schema",
      references: ["asset:spine"],
      schemaVersion: 99,
      oneLine: "A future-kind unit.",
      manifest: ["asset:spine", "asset:leaf"],
      createdAt: "2026-06-11T00:00:00Z",
      updatedAt: "2026-06-11T00:00:00Z",
    },
    createdAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.category, "from-the-future");
  assert.equal(rendered.title, "Navigator");
  assert.match(rendered.degraded ?? "", /kind "from-the-future" is unknown/);
  // The body carries the diagnosis + remedy, then a raw view of every content field.
  assert.match(rendered.body, /older than the stored doc/);
  assert.match(rendered.body, /pnpm studio:down/);
  assert.match(rendered.body, /## oneLine\n\nA future-kind unit\./);
  assert.match(rendered.body, /## manifest\n\n- asset:spine\n- asset:leaf/);
  assert.equal(rendered.fields, undefined, "no structured fields — the editor must not re-shape it");
});

test("renderStoredDoc DEGRADES on a known kind whose schemaVersion is newer than the code", () => {
  // A known kind, but the row was migrated by newer code: renderBody would silently drop the
  // fields this code's KIND_SPECS doesn't know — degrade and show everything instead.
  const stored: StoredDoc = {
    id: "less-is-more",
    kind: "principle",
    doc: {
      kind: "principle",
      id: "less-is-more",
      title: "Less is more",
      description: "d",
      references: [],
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      statement: "Prefer the smaller surface.",
      why: "Smaller surfaces are easier to prove.",
      howToApply: "Ask: can this be removed?",
      brandNewField: "added by a newer migration",
      createdAt: "2026-06-11T00:00:00Z",
      updatedAt: "2026-06-11T00:00:00Z",
    },
    createdAt: "2026-06-11T00:00:00Z",
    updatedAt: "2026-06-11T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.match(
    rendered.degraded ?? "",
    new RegExp(
      `schemaVersion ${CURRENT_SCHEMA_VERSION + 1} is newer than this server's schema \\(version ${CURRENT_SCHEMA_VERSION}\\)`,
    ),
  );
  assert.match(rendered.body, /## statement\n\nPrefer the smaller surface\./);
  assert.match(rendered.body, /## brandNewField\n\nadded by a newer migration/, "nothing dropped");
  assert.equal(rendered.fields, undefined);
});

// ---- option C (oq-library-doc-shape): structured fields survive an edit round-trip ----

test("renderStoredDoc carries the per-kind fields of a structured unit on the wire", () => {
  const definition = {
    kind: "definition",
    id: "spine",
    title: "spine",
    description: "the control-flow layer",
    references: [],
    oneLine: "The control-flow layer.",
    whatItIs: "The deterministic routing layer.",
    whatItIsNot: "Not the leaf.",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "spine",
    kind: "definition",
    doc: definition,
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
  };
  const rendered = renderStoredDoc(stored);
  assert.deepEqual(rendered.fields, {
    oneLine: "The control-flow layer.",
    whatItIs: "The deterministic routing layer.",
    whatItIsNot: "Not the leaf.",
  });
  // The body is still the derived render — fields are an ADDITION, not a replacement.
  assert.equal(rendered.body, renderBody(definition as never));
});

test("a body-only (template) read carries NO fields", () => {
  const stored: StoredDoc = {
    id: "template-definition",
    kind: "template",
    doc: { id: "template-definition", category: "template", title: "T", description: "d", body: "b" },
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
  };
  assert.equal(renderStoredDoc(stored).fields, undefined);
});

test("buildLibraryDoc(fields) persists a STRUCTURED doc that round-trips with no structure loss", () => {
  const input = {
    id: "spine",
    category: "definition",
    title: "spine",
    description: "the control-flow layer",
    body: "IGNORED derived body",
    references: ["doc:decisions/0017-cross-cutting-knowledge-tier.md"],
    fields: {
      oneLine: "The control-flow layer.",
      whatItIs: "The deterministic routing layer.",
      whatItIsNot: "Not the leaf.",
    },
  };
  const doc = buildLibraryDoc(input, null);
  // A structured doc: kind set, no rendered body / category leaked in.
  assert.equal(doc["kind"], "definition");
  assert.equal(doc["body"], undefined);
  assert.equal(doc["category"], undefined);
  assert.equal(doc["whatItIs"], "The deterministic routing layer.");
  // It validates as a structured Knowledge doc at the store's write boundary.
  assert.doesNotThrow(() => upcastAndValidate(doc));

  // Round-trip: render it back and the fields are byte-identical (the OQ's whole point).
  const rendered = renderStoredDoc({
    id: "spine",
    kind: "definition",
    doc,
    createdAt: "2026-06-02T00:00:00Z",
    updatedAt: "2026-06-03T00:00:00Z",
  });
  assert.deepEqual(rendered.fields, input.fields);
});

test("buildLibraryDoc merges over the existing doc, preserving write-only metadata", () => {
  const existing: StoredDoc = {
    id: "spine",
    kind: "definition",
    doc: {
      kind: "definition",
      id: "spine",
      title: "spine",
      description: "old",
      references: [],
      oneLine: "old one-line",
      whatItIs: "old what-it-is",
      schemaVersion: 1,
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
    },
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
  const doc = buildLibraryDoc(
    {
      id: "spine",
      category: "definition",
      title: "spine (edited)",
      description: "new",
      body: "",
      references: [],
      fields: { oneLine: "new one-line", whatItIs: "new what-it-is" },
    },
    existing,
  );
  // Edited fields win; the write-only schemaVersion + original createdAt survive the edit — the
  // editor never sends them, so they must ride through the merge from the existing doc, not the input.
  assert.equal(doc["oneLine"], "new one-line");
  assert.equal(doc["title"], "spine (edited)");
  assert.equal(doc["schemaVersion"], 1);
  assert.equal(doc["createdAt"], "2026-06-01T00:00:00Z");
});

test("buildLibraryDoc omits an empty optional field (clears its section cleanly)", () => {
  const existing: StoredDoc = {
    id: "spine",
    kind: "definition",
    doc: {
      kind: "definition", id: "spine", title: "spine", description: "d", references: [],
      oneLine: "x", whatItIs: "y", whatItIsNot: "to be cleared",
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z",
    },
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
  };
  const doc = buildLibraryDoc(
    {
      id: "spine", category: "definition", title: "spine", description: "d", body: "", references: [],
      fields: { oneLine: "x", whatItIs: "y", whatItIsNot: "   " },
    },
    existing,
  );
  assert.equal(doc["whatItIsNot"], undefined, "blank optional field is dropped, not stored as ''");
});

test("buildLibraryDoc without fields (template) persists a body-bearing asset", () => {
  const doc = buildLibraryDoc(
    {
      id: "template-adr",
      category: "template",
      title: "Template — adr",
      description: "scaffold",
      body: "# ADR-NNNN",
      references: [],
    },
    null,
  );
  assert.equal(doc["body"], "# ADR-NNNN");
  assert.equal(doc["category"], "template");
  assert.equal(doc["kind"], undefined, "a body-only doc has no structured kind");
  assert.doesNotThrow(() => upcastAndValidate(doc));
});

// ---- library-typed-edges: the three already-stored typed-edge fields ride the structured wire ----

test("lte-agent-steprefs-surface: an agent doc's stepRefs surface on the GuidanceAsset wire shape", () => {
  const agent = {
    kind: "agent",
    id: "example-agent",
    title: "Example agent",
    description: "an example agent for the typed-edge contract",
    references: [],
    oneLine: "The agent in one line.",
    role: "The full role prose.",
    outcome: "The observable success criteria.",
    context: ["asset:ctx-a"],
    tools: "Read/Write, least authority.",
    workflow: "session_start orientation, then the ordered steps.",
    stepRefs: [
      { step: "session_start", refs: ["asset:context-a", "asset:context-b"] },
      { step: "step_two", refs: ["asset:context-c"] },
    ],
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "example-agent",
    kind: "agent",
    doc: agent,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.deepEqual(rendered.stepRefs, [
    { step: "session_start", refs: ["asset:context-a", "asset:context-b"] },
    { step: "step_two", refs: ["asset:context-c"] },
  ]);
});

test("lte-process-branchedges-surface: a process doc's branchEdges surface on the GuidanceAsset wire shape", () => {
  const process = {
    kind: "process",
    id: "example-process",
    title: "Example process",
    description: "an example process for the typed-edge contract",
    references: [],
    statement: "The ceremony statement.",
    trigger: "The observable trigger condition.",
    steps: "1. Do the thing.",
    surfaces: "`storytree example` touches the tree.",
    failureModes: "Skipping a step breaks X.",
    branchEdges: [
      { ref: "asset:next-node", label: "hop to the next node" },
      { ref: "asset:another-node" },
    ],
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "example-process",
    kind: "process",
    doc: process,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.deepEqual(rendered.branchEdges, [
    { ref: "asset:next-node", label: "hop to the next node" },
    { ref: "asset:another-node" },
  ]);
});

test("lte-plan-arcref-surface: a plan doc's arcRef surfaces on the GuidanceAsset wire shape", () => {
  const plan = {
    kind: "plan",
    id: "example-plan",
    title: "Example plan",
    description: "an example plan for the typed-edge contract",
    references: [],
    objective: "Deliver the typed-edge contract.",
    decomposition: "1. lte-agent-stepRefs. 2. lte-process-branchEdges.",
    arcRef: "asset:example-arc",
    anchor: { sha: "abc1234", date: "2026-07-01" },
    status: "ready",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const stored: StoredDoc = {
    id: "example-plan",
    kind: "plan",
    doc: plan,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.arcRef, "asset:example-arc");
});

test("lte-optional-edges-omitted-when-absent: a structured doc with no typed-edge field omits all three, never an empty array", () => {
  const agentNoStepRefs = {
    kind: "agent",
    id: "quiet-agent",
    title: "Quiet agent",
    description: "an agent authored before stepRefs existed",
    references: [],
    oneLine: "One line.",
    role: "Role.",
    outcome: "Outcome.",
    context: ["asset:ctx-a"],
    tools: "Tools.",
    workflow: "Workflow.",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const renderedAgent = renderStoredDoc({
    id: "quiet-agent",
    kind: "agent",
    doc: agentNoStepRefs,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(renderedAgent.stepRefs, undefined);
  assert.equal(Object.hasOwn(renderedAgent, "stepRefs"), false, "absent, not an own key at all");

  const processNoBranchEdges = {
    kind: "process",
    id: "quiet-process",
    title: "Quiet process",
    description: "a process authored before branchEdges existed",
    references: [],
    statement: "Statement.",
    trigger: "Trigger.",
    steps: "Steps.",
    surfaces: "Surfaces.",
    failureModes: "Failure modes.",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const renderedProcess = renderStoredDoc({
    id: "quiet-process",
    kind: "process",
    doc: processNoBranchEdges,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(renderedProcess.branchEdges, undefined);
  assert.equal(Object.hasOwn(renderedProcess, "branchEdges"), false, "absent, not an own key at all");

  // A non-typed-edge structured kind (a principle) never carries any of the three.
  const principle = {
    kind: "principle",
    id: "unrelated-principle",
    title: "Unrelated principle",
    description: "no typed edges apply to this kind",
    references: [],
    statement: "A statement.",
    why: "A why.",
    howToApply: "How to apply.",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const renderedPrinciple = renderStoredDoc({
    id: "unrelated-principle",
    kind: "principle",
    doc: principle,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(renderedPrinciple.stepRefs, undefined);
  assert.equal(renderedPrinciple.branchEdges, undefined);
  assert.equal(renderedPrinciple.arcRef, undefined);
});

test("lte-passthrough-and-degraded-carry-no-typed-edges: the pass-through and degraded branches never carry a typed edge, even when the raw stored doc has one", () => {
  // Pass-through: a body-bearing doc that happens to carry a raw stepRefs-shaped property (e.g. a
  // leftover from a prior structured shape) must not leak it onto the wire — this branch only
  // reads the known AssetDocLike keys.
  const passThroughStored: StoredDoc = {
    id: "template-with-leftover",
    kind: "template",
    doc: {
      id: "template-with-leftover",
      category: "template",
      title: "T",
      description: "d",
      body: "b",
      references: [],
      stepRefs: [{ step: "x", refs: ["asset:y"] }],
      branchEdges: [{ ref: "asset:y" }],
      arcRef: "asset:z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const renderedPassThrough = renderStoredDoc(passThroughStored);
  assert.equal(renderedPassThrough.stepRefs, undefined);
  assert.equal(renderedPassThrough.branchEdges, undefined);
  assert.equal(renderedPassThrough.arcRef, undefined);

  // Degraded: an unknown-kind doc that also happens to carry a raw arcRef-shaped property must not
  // leak it either, and must still never throw.
  const degradedStored: StoredDoc = {
    id: "from-the-future",
    kind: "from-the-future",
    doc: {
      kind: "from-the-future",
      id: "from-the-future",
      title: "Navigator",
      description: "a unit from a newer schema",
      references: [],
      schemaVersion: 99,
      arcRef: "asset:some-arc",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };
  const renderedDegraded = renderStoredDoc(degradedStored);
  assert.notEqual(renderedDegraded.degraded, undefined, "still degrades, never throws");
  assert.equal(renderedDegraded.arcRef, undefined);
});
