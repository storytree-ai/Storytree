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
    kind: "increment",
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
    kind: "increment",
    doc: plan,
    createdAt: "2026-07-02T00:00:00Z",
    updatedAt: "2026-07-03T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.arcRef, "asset:example-arc");
});

test("ADR-0267 D4: an open question's arcRef surfaces on the wire with NO renderer change", () => {
  // The typed-edge projection is kind-AGNOSTIC — it reads `arcRef` off the doc rather than
  // switching on `plan`. So the containment edge ADR-0267 D4 adds to the open-question kind reaches
  // the studio's GuidanceAsset wire for free. This test pins that: if someone later narrows the
  // projection to plan-only, the arc surface would silently stop seeing which questions are stamped.
  const question = {
    kind: "open-question",
    id: "oq-blocked-meaning",
    title: "What exactly qualifies as blocked?",
    description: "ADR-0267 D7 names blocked but declines to define it",
    references: [],
    stakes: "The surface cannot render a blocked state until this is settled.",
    statement: "What qualifies an arc as blocked?",
    context: "D7 names it as distinct from waiting.",
    options: "a | b",
    arcRef: "asset:arc-orientation-surface-arc",
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
  };
  const rendered = renderStoredDoc({
    id: "oq-blocked-meaning",
    kind: "open-question",
    doc: question,
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
  });
  assert.equal(rendered.arcRef, "asset:arc-orientation-surface-arc");
  // An UNSTAMPED question omits it entirely (absent-by-default, never an empty string).
  const { arcRef: _dropped, ...unstamped } = question;
  const renderedUnstamped = renderStoredDoc({
    id: "oq-orphan",
    kind: "open-question",
    doc: { ...unstamped, id: "oq-orphan" },
    createdAt: "2026-07-30T00:00:00Z",
    updatedAt: "2026-07-30T00:00:00Z",
  });
  assert.equal(renderedUnstamped.arcRef, undefined);
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

/**
 * ADR-0223's `dependsOn` crosses on the PASS-THROUGH branch too — deliberately NOT the same rule as
 * the three typed NAVIGATION edges above, and the boundary is worth stating because the two look
 * alike.
 *
 * `lte-passthrough-and-degraded-carry-no-typed-edges` exists to stop a STALE LEFTOVER leaking: a
 * `stepRefs`-shaped property on a body-bearing doc is residue from some prior structured shape, and
 * this branch cannot tell current data from residue, so it reads only the known AssetDocLike keys.
 * That contract is untouched here and still holds.
 *
 * `dependsOn` on a body-bearing doc is not residue: `buildLibraryDoc` deliberately PRESERVES an
 * authored edge across a body-bearing studio save (the test below), so a collapsed structured unit
 * can legitimately arrive here carrying a current one.
 *
 * HISTORY, because this crossing's original justification is now false and a reader would otherwise
 * re-derive it: it was added by PR #1330 because `hasStringBody` routed every `increment` down this
 * branch — the kind carries a per-kind content field literally named `body` — silently dropping 106
 * of the corpus's 660 authored edges. `bodyIsContentField` fixed that classification at its root, so
 * an increment now renders structurally and its edge crosses there. This branch's crossing survives
 * on its own merits, above, and is no longer load-bearing for the DAG.
 */
test("dependsOn crosses the pass-through branch — a body-bearing doc keeps its authored dependency edge", () => {
  const stored: StoredDoc = {
    id: "collapsed-pattern",
    kind: "pattern",
    doc: {
      id: "collapsed-pattern",
      category: "pattern",
      title: "A collapsed pattern",
      description: "d",
      body: "a pre-rendered body",
      references: [],
      dependsOn: ["asset:some-arc", "doc:decisions/0223-....md"],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    },
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  assert.equal(rendered.body, "a pre-rendered body", "still the pass-through branch");
  assert.equal(rendered.fields, undefined);
  assert.deepEqual(
    rendered.dependsOn,
    ["asset:some-arc", "doc:decisions/0223-....md"],
    "the authored dependency edge survives the pass-through branch, order preserved",
  );
  // The three navigation edges still do NOT cross here — the older contract is unchanged.
  assert.equal(rendered.stepRefs, undefined);
  assert.equal(rendered.branchEdges, undefined);
});

test("dependsOn is absent (never []) on a pass-through doc that carries no authored edge", () => {
  const stored: StoredDoc = {
    id: "plain-template",
    kind: "template",
    doc: {
      id: "plain-template",
      category: "template",
      title: "T",
      description: "d",
      body: "b",
      references: [],
    },
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  // Absent, not `[]` — "carries no authored edge" and "authored, and stands on nothing" are
  // different facts, and ADR-0223 keeps the field `.optional()` precisely to tell them apart.
  assert.equal(renderStoredDoc(stored).dependsOn, undefined);
});

test("buildLibraryDoc preserves dependsOn across a body-bearing write it cannot express", () => {
  // The studio editor's AssetWriteInput has no `dependsOn` field (curation is a CLI concern), and
  // this branch rebuilds the doc from scratch — so without an explicit carry, one save through the
  // studio would silently wipe an artifact's authored edges.
  const existing: StoredDoc = {
    id: "edited-unit",
    kind: "pattern",
    doc: {
      id: "edited-unit",
      category: "pattern",
      title: "old",
      description: "old",
      body: "old body",
      references: [],
      dependsOn: ["asset:bedrock"],
      createdAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };

  const doc = buildLibraryDoc(
    {
      id: "edited-unit",
      category: "pattern",
      title: "new",
      description: "new",
      body: "new body",
      references: [],
    },
    existing,
  );

  assert.deepEqual(doc["dependsOn"], ["asset:bedrock"], "the authored edge survives a studio save");
});

test("buildLibraryDoc carries a LEGACY `standsOn` across too, so the rename deletes no edge (ADR-0402)", () => {
  // Migration #7 runs at the WRITE boundary, on the doc this function hands back — so an edge only
  // survives the rename window if it REACHES that boundary. The structured branch starts from
  // `{...existingDoc}` and carries the legacy key for free; this branch builds a fresh doc, so
  // reading only the new key would silently delete the edge of every row not yet migrated.
  const existing: StoredDoc = {
    id: "unmigrated-unit",
    kind: "pattern",
    doc: {
      id: "unmigrated-unit",
      category: "pattern",
      title: "old",
      description: "old",
      body: "old body",
      references: [],
      standsOn: ["asset:bedrock"],
      createdAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  };

  const doc = buildLibraryDoc(
    {
      id: "unmigrated-unit",
      category: "pattern",
      title: "new",
      description: "new",
      body: "new body",
      references: [],
    },
    existing,
  );

  assert.deepEqual(
    doc["dependsOn"],
    ["asset:bedrock"],
    "an un-migrated row's edge arrives under the NEW key, not on the floor",
  );

  // An already-migrated row wins outright — the legacy read is a fallback, never an override.
  const both = buildLibraryDoc(
    {
      id: "unmigrated-unit",
      category: "pattern",
      title: "new",
      description: "new",
      body: "new body",
      references: [],
    },
    {
      ...existing,
      doc: { ...(existing.doc as Record<string, unknown>), dependsOn: ["asset:current"] },
    },
  );
  assert.deepEqual(both["dependsOn"], ["asset:current"]);
});

/**
 * THE `increment` MISCLASSIFICATION (ADR-0363 D2's blocker, measured against the live store
 * 2026-08-14: 703 of 703 increments took the pass-through branch).
 *
 * `hasStringBody` asked "does this doc carry a string `body`?" as a proxy for "is it already
 * rendered?". The proxy holds for every kind but one: `increment` declares `body` as a per-kind
 * CONTENT field (KIND_SPECS), so a structured increment answered yes and returned early — before
 * `fields`, before the typed edges. Its `fields` never reached the studio editor, and its `cites`
 * — the ONLY join between the knowledge graph and the work graph (ADR-0306 D2) — never crossed at
 * all, which is why the depth-from-work join was blocked rather than merely unbuilt.
 *
 * The classifier is now `bodyIsContentField`, which asks the schema instead of guessing: `body` is
 * a rendered body UNLESS this kind declares it as content. That is why the fixture below is
 * validated through `upcastAndValidate` — the contract is that a REAL increment renders
 * structurally, so a fixture that drifted out of the schema would prove nothing.
 */
test("an increment renders on the STRUCTURED branch: fields, arcRef, status and cites all cross", () => {
  const increment = upcastAndValidate({
    kind: "increment",
    id: "some-increment",
    title: "An increment",
    description: "d",
    objective: "do the thing",
    body: "the increment's authored body prose",
    references: [],
    arcRef: "asset:some-arc",
    status: "proposal",
    parked: "2026-08-01T00:00:00Z",
    cites: ["story:studio", "capability:library-dag-canvas", "asset:some-guidance"],
    dependsOn: ["asset:some-arc"],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  });
  const stored: StoredDoc = {
    id: "some-increment",
    kind: "increment",
    doc: increment as unknown as Record<string, unknown>,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  const rendered = renderStoredDoc(stored);

  // The body is DERIVED from the per-kind fields, not the raw `body` field passed through.
  assert.equal(
    rendered.body,
    "**The objective.** do the thing\n\n## The increment\n\nthe increment's authored body prose",
  );
  // `as never`: upcastAndValidate returns the whole LibraryDoc union (the body-bearing asset arm
  // included), which renderBody's Knowledge parameter does not accept — the file's existing idiom.
  assert.equal(
    rendered.body,
    renderBody(increment as never),
    "byte-identical to the canonical renderer",
  );
  assert.equal(rendered.category, "increment");

  // `fields` is what the studio editor edits — absent on the pass-through branch, so an increment
  // could not be edited structurally at all before this.
  assert.deepEqual(rendered.fields, {
    objective: "do the thing",
    body: "the increment's authored body prose",
  });

  assert.equal(rendered.arcRef, "asset:some-arc");
  assert.equal(rendered.status, "proposal");
  assert.deepEqual(rendered.dependsOn, ["asset:some-arc"]);
  // The work-hierarchy join (ADR-0306 D2). Order preserved, all three CiteRef schemes.
  assert.deepEqual(rendered.cites, [
    "story:studio",
    "capability:library-dag-canvas",
    "asset:some-guidance",
  ]);
});

test("cites is absent (never []) on a structured doc that cites nothing", () => {
  // ADR-0306 D2: an increment citing nothing is CORRECT rather than under-specified (greenfield
  // work, planning, ADR authoring), so no surface may read an absent `cites` as a defect — which
  // means absent and empty must stay distinguishable on the wire.
  const increment = upcastAndValidate({
    kind: "increment",
    id: "uncited-increment",
    title: "An increment",
    description: "d",
    objective: "do the thing",
    body: "prose",
    references: [],
    arcRef: "asset:some-arc",
    status: "proposal",
    parked: "2026-08-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  });
  const rendered = renderStoredDoc({
    id: "uncited-increment",
    kind: "increment",
    doc: increment as unknown as Record<string, unknown>,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  });
  assert.equal(rendered.cites, undefined);

  // And a kind that has no `cites` at all never grows one.
  const principle = renderStoredDoc({
    id: "p",
    kind: "principle",
    doc: {
      kind: "principle",
      id: "p",
      title: "P",
      description: "d",
      references: [],
      statement: "s",
      why: "w",
      howToApply: "h",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(principle.cites, undefined);
});

test("cites never leaks onto the pass-through or degraded branch", () => {
  // The same rule as the three navigation edges (lte-passthrough-and-degraded-carry-no-typed-edges):
  // on a doc this code cannot faithfully parse, a `cites`-shaped property is indistinguishable from
  // residue, so it stays off the wire.
  const passThrough = renderStoredDoc({
    id: "template-with-leftover",
    kind: "template",
    doc: {
      id: "template-with-leftover",
      category: "template",
      title: "T",
      description: "d",
      body: "b",
      references: [],
      cites: ["story:studio"],
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(passThrough.body, "b", "still the pass-through branch");
  assert.equal(passThrough.cites, undefined);

  const degraded = renderStoredDoc({
    id: "from-the-future",
    kind: "from-the-future",
    doc: {
      kind: "from-the-future",
      id: "from-the-future",
      title: "Navigator",
      description: "d",
      references: [],
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      cites: ["story:studio"],
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.notEqual(degraded.degraded, undefined, "still degrades, never throws");
  assert.equal(degraded.cites, undefined);
});

test("a body-bearing doc of a kind that does NOT declare `body` as content still passes through", () => {
  // The regression this classifier had to avoid. A structured kind whose stored doc carries a
  // PRE-RENDERED body (a unit collapsed by an older studio save) must keep passing through: routing
  // it structurally would call renderBody over per-kind fields it does not have and silently render
  // an EMPTY body, destroying the only copy of its prose on the wire.
  //
  // Measured against the live store 2026-08-14: 716 docs carry a string `body` — 703 increments and
  // 13 category-bearing templates, and ZERO structured non-increment docs. So this guard protects a
  // shape the corpus does not currently hold; it is written because `buildLibraryDoc`'s body-bearing
  // branch can still produce one, and the failure would be silent data loss rather than an error.
  const rendered = renderStoredDoc({
    id: "collapsed-guardrail",
    kind: "guardrail",
    doc: {
      id: "collapsed-guardrail",
      kind: "guardrail",
      category: "guardrail",
      title: "A collapsed guardrail",
      description: "d",
      body: "## Rule\n\nthe one and only copy of this prose",
      references: [],
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(rendered.body, "## Rule\n\nthe one and only copy of this prose");
  assert.equal(rendered.fields, undefined, "not re-shaped as a structured doc");
});
