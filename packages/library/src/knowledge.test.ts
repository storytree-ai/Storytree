import { test } from "node:test";
import assert from "node:assert/strict";

import { EPHEMERAL_KINDS, KIND_SPECS, Knowledge, knownFieldsForKind, type KnowledgeKind } from "./knowledge.js";
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
  // `plan` requires two STRUCTURED (non-KIND_SPECS) fields at birth (ADR-0183 D2/D3): the arc it
  // cites and the git anchor its freshness check runs against.
  if (kind === "plan") {
    doc["arcRef"] = "asset:parity-arc";
    doc["anchor"] = { sha: "0123abc", date: "2026-07-11" };
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

test("agent kind: the step→refs association (ADR-0156 §4 / ADR-0161) validates and fails closed", () => {
  // An agent with NO stepRefs still validates — the field is optional (pre-population world).
  assert.doesNotThrow(() => validateLibraryDoc(minimalDoc("agent")), "stepRefs is optional");

  // A well-formed step→refs map validates: each entry keys a step to ordered asset: refs.
  const valid = {
    ...minimalDoc("agent"),
    stepRefs: [
      { step: "session_start", refs: ["asset:merge-ceremony", "asset:pull-based-context-architecture"] },
      { step: "3", refs: [] }, // a step with no attached refs is legal (empty outbound edges)
    ],
  };
  assert.doesNotThrow(() => validateLibraryDoc(valid), "a well-formed step→refs map validates");

  // A ref that is not an asset: pointer fails closed (same discipline as context/rules).
  const badRef = { ...minimalDoc("agent"), stepRefs: [{ step: "1", refs: ["doc:decisions/0156.md"] }] };
  assert.throws(() => validateLibraryDoc(badRef), "a doc:/prose ref in a step must be rejected");

  // A missing / empty step key fails closed.
  const noStep = { ...minimalDoc("agent"), stepRefs: [{ refs: ["asset:merge-ceremony"] }] };
  assert.throws(() => validateLibraryDoc(noStep), "a step entry with no step key must be rejected");
  const emptyStep = { ...minimalDoc("agent"), stepRefs: [{ step: "", refs: [] }] };
  assert.throws(() => validateLibraryDoc(emptyStep), "an empty step key must be rejected");

  // A stray field inside a step entry fails closed (AgentStepRef is .strict()).
  const strayInEntry = {
    ...minimalDoc("agent"),
    stepRefs: [{ step: "1", refs: [], note: "drift" }],
  };
  assert.throws(() => validateLibraryDoc(strayInEntry), "a stray field in a step entry must be rejected");

  // Regression guard for the .extend() approach: adding stepRefs must NOT relax the agent object's
  // .strict() — an unknown TOP-LEVEL field is still rejected even when stepRefs is present.
  const strayTopLevel = { ...valid, notInTheSpec: "drift" };
  assert.throws(
    () => validateLibraryDoc(strayTopLevel),
    ".extend() must preserve .strict(): an unknown top-level agent field is still rejected",
  );

  // stepRefs is agent-only: a non-agent kind must reject it (it is not in commonShape).
  const onAPrinciple = { ...minimalDoc("principle"), stepRefs: [{ step: "1", refs: [] }] };
  assert.throws(() => validateLibraryDoc(onAPrinciple), "stepRefs on a non-agent kind must be rejected");
});

test("process kind: the branch-edge graph (ADR-0154 follow-on / ADR-0161) validates and fails closed", () => {
  // A process with NO branchEdges still validates — the field is optional (all existing process docs
  // predate it, so this back-compat is exactly what avoids a CURRENT_SCHEMA_VERSION bump / migration).
  assert.doesNotThrow(() => validateLibraryDoc(minimalDoc("process")), "branchEdges is optional");

  // A well-formed branch-edge array validates: each edge is an asset: ref + an optional one-line gloss.
  const valid = {
    ...minimalDoc("process"),
    branchEdges: [
      { ref: "asset:merge-ceremony", label: "the landing ceremony" },
      { ref: "asset:pull-based-context-architecture" }, // label is optional (a bare outbound edge)
    ],
  };
  const parsed = validateLibraryDoc(valid) as {
    branchEdges?: ReadonlyArray<{ ref: string; label?: string }>;
  };
  // The parsed edges are EXACTLY `{ ref, label? }` — the shape the shared emitter's NodeEdge
  // (packages/drive/src/envelope.ts) consumes, so inc 7b maps branchEdges → ContextNode.edges with no
  // translation layer (ADR-0161 decision 2). Renaming/retyping a field reds this assertion.
  assert.deepEqual(parsed.branchEdges, [
    { ref: "asset:merge-ceremony", label: "the landing ceremony" },
    { ref: "asset:pull-based-context-architecture" },
  ]);

  // A ref that is not an asset: pointer fails closed (same discipline as context/rules/stepRefs).
  const badRef = { ...minimalDoc("process"), branchEdges: [{ ref: "doc:decisions/0154.md" }] };
  assert.throws(() => validateLibraryDoc(badRef), "a doc:/prose ref in a branch-edge must be rejected");

  // A missing ref fails closed — an edge must have a target.
  const noRef = { ...minimalDoc("process"), branchEdges: [{ label: "no target" }] };
  assert.throws(() => validateLibraryDoc(noRef), "a branch-edge with no ref must be rejected");

  // A wrong-typed ref fails closed.
  const numberRef = { ...minimalDoc("process"), branchEdges: [{ ref: 3 }] };
  assert.throws(() => validateLibraryDoc(numberRef), "a non-string ref must be rejected");

  // A present-but-empty label fails closed — a degenerate gloss (label is `min(1).optional()`).
  const emptyLabel = {
    ...minimalDoc("process"),
    branchEdges: [{ ref: "asset:merge-ceremony", label: "" }],
  };
  assert.throws(() => validateLibraryDoc(emptyLabel), "an empty label must be rejected");

  // A stray field inside an edge fails closed (ProcessBranchEdge is .strict()).
  const strayInEdge = {
    ...minimalDoc("process"),
    branchEdges: [{ ref: "asset:merge-ceremony", note: "drift" }],
  };
  assert.throws(() => validateLibraryDoc(strayInEdge), "a stray field in a branch-edge must be rejected");

  // Regression guard for the .extend() approach: adding branchEdges must NOT relax the process object's
  // .strict() — an unknown TOP-LEVEL field is still rejected even when branchEdges is present.
  const strayTopLevel = { ...valid, notInTheSpec: "drift" };
  assert.throws(
    () => validateLibraryDoc(strayTopLevel),
    ".extend() must preserve .strict(): an unknown top-level process field is still rejected",
  );

  // branchEdges is process-only: a non-process kind must reject it (it is not in commonShape).
  const onAPrinciple = { ...minimalDoc("principle"), branchEdges: [{ ref: "asset:merge-ceremony" }] };
  assert.throws(() => validateLibraryDoc(onAPrinciple), "branchEdges on a non-process kind must be rejected");
});

test("friction kind (ADR-0168 D2/D3): evidence is required, fail-closed", () => {
  // A minimal friction doc (statement + evidence + impact) validates; the lifecycle fields
  // (route / routeReason / provenance / reinforcedBy) are all optional at capture.
  assert.doesNotThrow(() => validateLibraryDoc(minimalDoc("friction")), "minimal friction doc validates");

  // An evidence-free doc is refused strict-parse — the structural anti-slop floor (D3).
  const noEvidence: Record<string, unknown> = { ...minimalDoc("friction") };
  delete noEvidence["evidence"];
  assert.throws(() => validateLibraryDoc(noEvidence), "an evidence-free friction doc must be rejected");

  // An empty-string evidence is refused too (Markdown is min(1)).
  const emptyEvidence = { ...minimalDoc("friction"), evidence: "" };
  assert.throws(() => validateLibraryDoc(emptyEvidence), "empty evidence must be rejected");
});

test("friction kind: route is the closed adjudication enum, never free prose", () => {
  // Every route ADR-0168 D2 names validates.
  for (const route of [
    "adr",
    "tool",
    "principle",
    "guardrail",
    "process",
    "definition",
    "edit-existing",
    "nothing",
  ]) {
    assert.doesNotThrow(
      () => validateLibraryDoc({ ...minimalDoc("friction"), route }),
      `route ${route} must validate`,
    );
  }

  // Free prose in route fails closed — classification is adjudication's, and only from the enum.
  const prose = { ...minimalDoc("friction"), route: "probably an ADR?" };
  assert.throws(() => validateLibraryDoc(prose), "a non-enum route must be rejected");

  // routeReason is plain optional markdown.
  assert.doesNotThrow(() =>
    validateLibraryDoc({
      ...minimalDoc("friction"),
      route: "nothing",
      routeReason: "reconstructible from ADR-0162 just-in-time (justification question 2)",
    }),
  );
});

test("friction kind: structured provenance {branch, date, source} replaces the prose provenance", () => {
  // The capture provenance is STRUCTURED on this kind (ADR-0168 D2) — unlike the commonShape
  // markdown attribution line every other kind carries.
  const valid = {
    ...minimalDoc("friction"),
    provenance: { branch: "claude/example-1", date: "2026-07-06", source: "retro" },
  };
  const parsed = validateLibraryDoc(valid) as {
    provenance?: { branch: string; date: string; source: string };
  };
  assert.deepEqual(parsed.provenance, {
    branch: "claude/example-1",
    date: "2026-07-06",
    source: "retro",
  });

  // Both capture sources validate; anything else fails closed (D2 names exactly two).
  assert.doesNotThrow(() =>
    validateLibraryDoc({
      ...minimalDoc("friction"),
      provenance: { branch: "b", date: "2026-07-06", source: "run-analysis" },
    }),
  );
  const badSource = {
    ...minimalDoc("friction"),
    provenance: { branch: "b", date: "2026-07-06", source: "vibes" },
  };
  assert.throws(() => validateLibraryDoc(badSource), "an unknown provenance source must be rejected");

  // A prose (string) provenance on friction fails closed — the structured shape is the field.
  const proseProvenance = { ...minimalDoc("friction"), provenance: "filed by a retro" };
  assert.throws(() => validateLibraryDoc(proseProvenance), "string provenance on friction must be rejected");

  // Regression: the override must not leak — every OTHER kind keeps the markdown provenance line.
  assert.doesNotThrow(() =>
    validateLibraryDoc({ ...minimalDoc("principle"), provenance: "graduated from memory, 2026-06-14" }),
  );

  // A stray field inside provenance fails closed (FrictionProvenance is .strict()).
  const stray = {
    ...minimalDoc("friction"),
    provenance: { branch: "b", date: "2026-07-06", source: "retro", severity: "high" },
  };
  assert.throws(() => validateLibraryDoc(stray), "a stray provenance field must be rejected");
});

test("friction kind: a reinforcement without its own evidence is refused (ADR-0168 D2)", () => {
  // Recurrence reinforces, never duplicates — and each reinforcement carries ITS OWN evidence.
  const valid = {
    ...minimalDoc("friction"),
    reinforcedBy: [
      { branch: "claude/example-2", date: "2026-07-07", evidence: "same TS2307 after merge, PR #999" },
    ],
  };
  const parsed = validateLibraryDoc(valid) as {
    reinforcedBy?: ReadonlyArray<{ branch: string; date: string; evidence: string }>;
  };
  assert.deepEqual(parsed.reinforcedBy, [
    { branch: "claude/example-2", date: "2026-07-07", evidence: "same TS2307 after merge, PR #999" },
  ]);

  // A reinforcement entry with NO evidence fails closed.
  const noEvidence = {
    ...minimalDoc("friction"),
    reinforcedBy: [{ branch: "b", date: "2026-07-07" }],
  };
  assert.throws(() => validateLibraryDoc(noEvidence), "a reinforcement without evidence must be rejected");

  // Empty-string evidence fails closed too.
  const emptyEvidence = {
    ...minimalDoc("friction"),
    reinforcedBy: [{ branch: "b", date: "2026-07-07", evidence: "" }],
  };
  assert.throws(() => validateLibraryDoc(emptyEvidence), "empty reinforcement evidence must be rejected");

  // A stray field inside an entry fails closed (FrictionReinforcement is .strict()).
  const stray = {
    ...minimalDoc("friction"),
    reinforcedBy: [{ branch: "b", date: "2026-07-07", evidence: "e", votes: 3 }],
  };
  assert.throws(() => validateLibraryDoc(stray), "a stray reinforcement field must be rejected");

  // Regression guard for the .extend() approach: the friction object stays .strict().
  const strayTopLevel = { ...valid, notInTheSpec: "drift" };
  assert.throws(
    () => validateLibraryDoc(strayTopLevel),
    ".extend() must preserve .strict(): an unknown top-level friction field is still rejected",
  );

  // The lifecycle fields are friction-only: a non-friction kind must reject them.
  const onAPrinciple = {
    ...minimalDoc("principle"),
    reinforcedBy: [{ branch: "b", date: "2026-07-07", evidence: "e" }],
  };
  assert.throws(() => validateLibraryDoc(onAPrinciple), "reinforcedBy on a non-friction kind must be rejected");
  const routeOnAPrinciple = { ...minimalDoc("principle"), route: "nothing" };
  assert.throws(() => validateLibraryDoc(routeOnAPrinciple), "route on a non-friction kind must be rejected");
});

test("arc kind (ADR-0183 D1): the increment log validates and fails closed", () => {
  // A freshly-born arc has no landings yet — `increments` is optional.
  assert.doesNotThrow(() => validateLibraryDoc(minimalDoc("arc")), "increments is optional");

  // A well-formed landing log validates; `pr` is optional (an owner attestation or an honest halt
  // can close an increment without its own PR).
  const valid = {
    ...minimalDoc("arc"),
    increments: [
      { date: "2026-07-11", pr: "#676", outcome: "kinds landed; plan tier next" },
      { date: "2026-07-12", outcome: "halted at the owner-attested look leg" },
    ],
  };
  const parsed = validateLibraryDoc(valid) as {
    increments?: ReadonlyArray<{ date: string; pr?: string; outcome: string }>;
  };
  assert.deepEqual(parsed.increments, [
    { date: "2026-07-11", pr: "#676", outcome: "kinds landed; plan tier next" },
    { date: "2026-07-12", outcome: "halted at the owner-attested look leg" },
  ]);

  // An increment without an outcome fails closed — a dateline with no record is not a landing.
  const noOutcome = { ...minimalDoc("arc"), increments: [{ date: "2026-07-11" }] };
  assert.throws(() => validateLibraryDoc(noOutcome), "an increment without outcome must be rejected");

  // An increment without a date fails closed.
  const noDate = { ...minimalDoc("arc"), increments: [{ outcome: "landed" }] };
  assert.throws(() => validateLibraryDoc(noDate), "an increment without date must be rejected");

  // A stray field inside an increment fails closed (ArcIncrement is .strict()).
  const stray = {
    ...minimalDoc("arc"),
    increments: [{ date: "2026-07-11", outcome: "landed", files: ["a.ts"] }],
  };
  assert.throws(() => validateLibraryDoc(stray), "a stray increment field must be rejected");

  // Regression guard for the .extend() approach: the arc object stays .strict().
  const strayTopLevel = { ...valid, notInTheSpec: "drift" };
  assert.throws(
    () => validateLibraryDoc(strayTopLevel),
    ".extend() must preserve .strict(): an unknown top-level arc field is still rejected",
  );

  // increments is arc-only: a non-arc kind must reject it (it is not in commonShape).
  const onAPrinciple = {
    ...minimalDoc("principle"),
    increments: [{ date: "2026-07-11", outcome: "landed" }],
  };
  assert.throws(() => validateLibraryDoc(onAPrinciple), "increments on a non-arc kind must be rejected");
});

test("plan kind (ADR-0183 D2/D3): born citing its arc, git-anchored, status enum-fenced", () => {
  // The minimal plan (objective + decomposition + arcRef + anchor) validates; status defaults to draft.
  const parsed = validateLibraryDoc(minimalDoc("plan")) as { status?: string; arcRef?: string };
  assert.equal(parsed.status, "draft", "an unstated status parses as draft — a plan is born a draft");
  assert.equal(parsed.arcRef, "asset:parity-arc");

  // A plan WITHOUT its arc is refused — a plan is born citing its arc (D3: the edge lives on the child).
  const orphan: Record<string, unknown> = { ...minimalDoc("plan") };
  delete orphan["arcRef"];
  assert.throws(() => validateLibraryDoc(orphan), "an arc-less plan must be rejected");

  // The arcRef is a typed asset: pointer — doc:/prose refs fail closed (the ref-list discipline).
  const docRef = { ...minimalDoc("plan"), arcRef: "doc:decisions/0183.md" };
  assert.throws(() => validateLibraryDoc(docRef), "a doc: arcRef must be rejected");

  // A plan WITHOUT its git anchor is refused — the freshness check has nothing to run against.
  const unanchored: Record<string, unknown> = { ...minimalDoc("plan") };
  delete unanchored["anchor"];
  assert.throws(() => validateLibraryDoc(unanchored), "an unanchored plan must be rejected");

  // A non-SHA anchor fails closed.
  const badSha = { ...minimalDoc("plan"), anchor: { sha: "main", date: "2026-07-11" } };
  assert.throws(() => validateLibraryDoc(badSha), "a branch name is not an anchor — must be rejected");
  const noDate = { ...minimalDoc("plan"), anchor: { sha: "0123abc" } };
  assert.throws(() => validateLibraryDoc(noDate), "an anchor without a date must be rejected");
  // A full 40-char SHA validates too.
  assert.doesNotThrow(() =>
    validateLibraryDoc({
      ...minimalDoc("plan"),
      anchor: { sha: "6df02e16e45793015d75fd59d42787987f021f70", date: "2026-07-11" },
    }),
  );

  // Every lifecycle state D2 names validates; free prose fails closed (the FrictionRoute precedent).
  for (const status of ["draft", "ready", "consumed", "superseded", "retired"]) {
    assert.doesNotThrow(
      () => validateLibraryDoc({ ...minimalDoc("plan"), status }),
      `status ${status} must validate`,
    );
  }
  const proseStatus = { ...minimalDoc("plan"), status: "half-done, mostly" };
  assert.throws(() => validateLibraryDoc(proseStatus), "a non-enum status must be rejected");

  // A stray field inside the anchor fails closed (PlanAnchor is .strict()).
  const strayInAnchor = {
    ...minimalDoc("plan"),
    anchor: { sha: "0123abc", date: "2026-07-11", branch: "main" },
  };
  assert.throws(() => validateLibraryDoc(strayInAnchor), "a stray anchor field must be rejected");

  // Regression guard for the .extend() approach: the plan object stays .strict().
  const strayTopLevel = { ...minimalDoc("plan"), notInTheSpec: "drift" };
  assert.throws(
    () => validateLibraryDoc(strayTopLevel),
    ".extend() must preserve .strict(): an unknown top-level plan field is still rejected",
  );

  // The lifecycle fields are plan-only: a non-plan kind must reject them.
  const arcRefOnAPrinciple = { ...minimalDoc("principle"), arcRef: "asset:parity-arc" };
  assert.throws(() => validateLibraryDoc(arcRefOnAPrinciple), "arcRef on a non-plan kind must be rejected");
  const anchorOnAnArc = { ...minimalDoc("arc"), anchor: { sha: "0123abc", date: "2026-07-11" } };
  assert.throws(() => validateLibraryDoc(anchorOnAnArc), "anchor on a non-plan kind must be rejected");
});

test("EPHEMERAL_KINDS (ADR-0183 D2): plan is ephemeral, every member is a real kind, arcs are durable", () => {
  assert.ok(EPHEMERAL_KINDS.has("plan"), "plan is the first ephemeral kind");
  assert.ok(!EPHEMERAL_KINDS.has("arc"), "arc is durable — curated in the ceremonies like any kind");
  for (const kind of EPHEMERAL_KINDS) {
    assert.ok(Object.hasOwn(KIND_SPECS, kind), `ephemeral kind ${kind} must be a KIND_SPECS key`);
  }
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

test("knownFieldsForKind: exact schema fields per kind (KIND_SPECS body + schema extras), null for non-kinds", () => {
  // arc carries the KIND_SPECS narrative fields AND the schema-level `increments` extra.
  const arc = knownFieldsForKind("arc");
  assert.ok(arc, "arc is a known kind");
  for (const f of ["intent", "endState", "increments", "id", "title", "description"]) {
    assert.ok(arc!.has(f), `arc field set includes ${f}`);
  }
  assert.ok(!arc!.has("endstate"), "a typo'd field is absent (this is what the CLI guard keys on)");

  // Every structured kind resolves; the set is never empty.
  for (const kind of KINDS) {
    const fields = knownFieldsForKind(kind);
    assert.ok(fields && fields.size > 0, `${kind} has a non-empty known-field set`);
    assert.ok(fields!.has("kind"), `${kind} always carries the kind discriminator`);
  }

  // A rendered LibraryAsset (category, not kind) and an unknown kind are both null.
  assert.equal(knownFieldsForKind("template"), null);
  assert.equal(knownFieldsForKind("from-the-future"), null);
});
