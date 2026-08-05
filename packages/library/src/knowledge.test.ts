import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EPHEMERAL_KINDS,
  KIND_SPECS,
  Knowledge,
  knownFieldsForKind,
  type KnowledgeKind,
} from "./knowledge.js";
import { renderBody, generateTemplate } from "./knowledge-render.js";
import { validateLibraryDoc } from "./library-doc.js";
import { CURRENT_SCHEMA_VERSION, upcast } from "./migrations.js";

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

test("arc kind (ADR-0298 D1): the parked-work list validates and fails closed on the ceiling's own fields", () => {
  const parked = {
    id: "widen-the-identity-derivation",
    title: "Session identity derives from any registered linked worktree",
    parked: "2026-08-03T00:06:56.911Z",
    summary: "Widen the noticeboard's identity derivation to admit any git-registered linked worktree.",
    motivation: "The claim is mandatory and the verb refuses, so a whole runtime is fenced out of landing work.",
  };

  // An arc with no parked work is normal — `proposals` is optional, exactly like `increments`.
  assert.doesNotThrow(() => validateLibraryDoc(minimalDoc("arc")), "proposals is optional");

  // The five optional body fields are the retired `proposal` KIND_SPECS table, carried verbatim, so
  // nothing a proposal could say has nowhere to go (ADR-0298 D1).
  const full = {
    ...minimalDoc("arc"),
    proposals: [
      {
        ...parked,
        change: "deriveIdentity admits any `git worktree list` entry, not only `.claude/worktrees/<name>`.",
        scope: "packages/drive/src/noticeboard.ts and its CLI dispatch, plus tests.",
        migration: "1. widen the helper. 2. red-green a Codex-shaped path. 3. re-check presence-hook.sh.",
        readiness: "No precondition — the change is local and covered by unit tests.",
        risks: "A wider prefix could admit a path that is not a session; the git registration check fences it.",
        frictionRefs: ["friction-codex-root-session-cannot-declare-presence"],
      },
    ],
  };
  const parsedFull = validateLibraryDoc(full) as { proposals?: ReadonlyArray<Record<string, unknown>> };
  assert.equal(parsedFull.proposals?.length, 1);
  assert.equal(parsedFull.proposals?.[0]?.["scope"], "packages/drive/src/noticeboard.ts and its CLI dispatch, plus tests.");

  // `realized` is ABSENT while parked — that absence is what the delivery ceiling reads as "still
  // pressing" (ADR-0298 D3), so it must never be defaulted into existence.
  const stillParked = { ...minimalDoc("arc"), proposals: [parked] };
  const parsedParked = validateLibraryDoc(stillParked) as {
    proposals?: ReadonlyArray<{ realized?: unknown }>;
  };
  assert.equal(parsedParked.proposals?.[0]?.realized, undefined, "an unrealized entry must carry no realized field");

  // ...and when the work lands it carries the landing.
  const done = {
    ...minimalDoc("arc"),
    proposals: [{ ...parked, realized: { date: "2026-08-04", pr: "#1130" } }],
  };
  const parsedDone = validateLibraryDoc(done) as {
    proposals?: ReadonlyArray<{ realized?: { date: string; pr?: string } }>;
  };
  assert.deepEqual(parsedDone.proposals?.[0]?.realized, { date: "2026-08-04", pr: "#1130" });

  // THE CEILING'S TWO LOAD-BEARING FIELDS FAIL CLOSED. `parked` is the comparison point a recurrence
  // is dated against; an entry without one is unevaluable, so it is refused at the schema rather than
  // silently sitting quiet forever.
  for (const [drop, why] of [
    ["parked", "the delivery ceiling has no date to compare a recurrence against"],
    ["id", "the entry is unaddressable, so `arc proposal realize` can never discharge it"],
    ["title", "a parked entry with no title is unreadable in a list or a gate report"],
    ["summary", "an entry with no statement of the change is not a parked remedy"],
    ["motivation", "an entry with no reason is exactly the thin filing the tier exists to prevent"],
  ] as const) {
    const without: Record<string, unknown> = { ...parked };
    delete without[drop];
    assert.throws(
      () => validateLibraryDoc({ ...minimalDoc("arc"), proposals: [without] }),
      `a parked entry without \`${drop}\` must be rejected: ${why}`,
    );
  }

  // A stray field inside an entry fails closed (ArcProposal is .strict()) — including the one a
  // session migrating off the retired kind would most plausibly carry over.
  assert.throws(
    () => validateLibraryDoc({ ...minimalDoc("arc"), proposals: [{ ...parked, kind: "proposal" }] }),
    "a stray entry field must be rejected",
  );
  assert.throws(
    () => validateLibraryDoc({ ...minimalDoc("arc"), proposals: [{ ...parked, realized: { pr: "#1130" } }] }),
    "a realization without a date must be rejected",
  );

  // proposals is arc-only: it is not in commonShape, so no other kind may grow a parallel tier.
  assert.throws(
    () => validateLibraryDoc({ ...minimalDoc("principle"), proposals: [parked] }),
    "proposals on a non-arc kind must be rejected",
  );
});

test("the `proposal` KIND is retired (ADR-0298 D1) — it is gone from the union and KIND_SPECS", () => {
  // Deliberately asserted rather than left to the KIND_SPECS↔zod parity tests above: those iterate
  // over what EXISTS, so a re-added kind would satisfy every one of them. This is the guard against
  // the kind quietly coming back — the whole decision is that there is exactly ONE place an unstarted
  // intention lives, and a second one is the failure ADR-0298 exists to end.
  assert.equal(Object.hasOwn(KIND_SPECS, "proposal"), false, "KIND_SPECS must carry no proposal entry");
  assert.throws(
    () => Knowledge.parse({ ...minimalDoc("open-question"), kind: "proposal" }),
    "the discriminated union must not accept a proposal doc",
  );
});

test("arc kind (ADR-0239 D1): the stored lifecycle flag defaults to active and is enum-fenced", () => {
  // OPTIONAL-WITH-DEFAULT (the `plan.status` precedent): an arc authored before the field validates
  // unchanged and parses as `active`. This is what makes ADR-0239 D1 a zero-migration change — no
  // CURRENT_SCHEMA_VERSION bump, and every one of the live arcs keeps validating.
  const born = validateLibraryDoc(minimalDoc("arc")) as { lifecycle?: string };
  assert.equal(born.lifecycle, "active", "an unstated lifecycle parses as active — an arc is born in flight");

  // The closing transition round-trips.
  const closed = validateLibraryDoc({ ...minimalDoc("arc"), lifecycle: "closed" }) as { lifecycle?: string };
  assert.equal(closed.lifecycle, "closed");

  // Enum-fenced: free prose and plan's wider vocabulary both fail closed (an arc has two states —
  // ADR-0196 D1's table gives it no `open` column, and D2 judged the five-state enum over-modelled).
  for (const bad of ["done", "archived", "retired", "consumed", "", "CLOSED"]) {
    assert.throws(
      () => validateLibraryDoc({ ...minimalDoc("arc"), lifecycle: bad }),
      `lifecycle "${bad}" must be rejected — the enum is the fence against a free-prose state`,
    );
  }

  // lifecycle is arc-only: no other kind grows a second status surface off it (ADR-0196 D4).
  const onAPrinciple = { ...minimalDoc("principle"), lifecycle: "closed" };
  assert.throws(() => validateLibraryDoc(onAPrinciple), "lifecycle on a non-arc kind must be rejected");
  const onAPlan = { ...minimalDoc("plan"), lifecycle: "closed" };
  assert.throws(() => validateLibraryDoc(onAPlan), "lifecycle on a plan must be rejected");
});

test("plan kind (ADR-0183 D2/D3): born citing its arc, git-anchored, status enum-fenced", () => {
  // The minimal increment (objective + body + arcRef + anchor) validates; status defaults to
  // `proposal` — decided, not started (ADR-0305 D2, which dropped `draft` outright).
  const parsed = validateLibraryDoc(minimalDoc("plan")) as { status?: string; arcRef?: string };
  assert.equal(parsed.status, "proposal", "an unstated status parses as proposal — decided, not started");
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

  // Every lifecycle state ADR-0305 D2 names validates; free prose fails closed (the FrictionRoute
  // precedent).
  for (const status of ["proposal", "ready", "active", "closed"]) {
    assert.doesNotThrow(
      () => validateLibraryDoc({ ...minimalDoc("plan"), status }),
      `status ${status} must validate`,
    );
  }
  const proseStatus = { ...minimalDoc("plan"), status: "half-done, mostly" };
  assert.throws(() => validateLibraryDoc(proseStatus), "a non-enum status must be rejected");

  // The four RETIRED states fail closed at the schema (ADR-0305 D2). This is the fence that makes
  // migration 4 obligatory rather than cosmetic: a stored `consumed` row is now INVALID, so the
  // upcaster has to remap it before validation or the next write of that doc is refused.
  for (const gone of ["draft", "consumed", "superseded", "retired"]) {
    assert.throws(
      () => validateLibraryDoc({ ...minimalDoc("plan"), status: gone }),
      `the retired status "${gone}" must be rejected — the enum is the fence, migration 4 the ramp`,
    );
  }

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

  // `arcRef` is carried by exactly TWO kinds — plan (ADR-0183 D3) and open-question (ADR-0267 D4).
  // Every OTHER kind still rejects it, so the containment edge cannot sprout on an arbitrary
  // artifact and quietly widen what an arc claims to contain.
  const arcRefOnAPrinciple = { ...minimalDoc("principle"), arcRef: "asset:parity-arc" };
  assert.throws(() => validateLibraryDoc(arcRefOnAPrinciple), "arcRef on a principle must be rejected");
  const anchorOnAnArc = { ...minimalDoc("arc"), anchor: { sha: "0123abc", date: "2026-07-11" } };
  assert.throws(() => validateLibraryDoc(anchorOnAnArc), "anchor on a non-plan kind must be rejected");
});

test("open-question kind (ADR-0267 D4): an OPTIONAL arcRef nests the question inside an arc", () => {
  // OPTIONAL, unlike `plan.arcRef` which is required. This is what makes it a zero-migration change:
  // every open-question doc authored before the field still validates, so there is no
  // CURRENT_SCHEMA_VERSION bump (the `Arc.increments` / `Agent.stepRefs` precedent).
  const unstamped = validateLibraryDoc(minimalDoc("open-question")) as { arcRef?: string };
  assert.equal(unstamped.arcRef, undefined, "a question can be raised before any arc owns it");

  // The stamp round-trips.
  const stamped = validateLibraryDoc({
    ...minimalDoc("open-question"),
    arcRef: "asset:arc-orientation-surface-arc",
  }) as { arcRef?: string };
  assert.equal(stamped.arcRef, "asset:arc-orientation-surface-arc");

  // Same typed `asset:` pointer as the plan's — `doc:`/ADR refs and bare prose fail closed, so the
  // derived query on the arc side never has to interpret a free-form parent.
  for (const bad of ["doc:decisions/0267.md", "arc-orientation-surface-arc", "asset:", ""]) {
    assert.throws(
      () => validateLibraryDoc({ ...minimalDoc("open-question"), arcRef: bad }),
      `arcRef "${bad}" must be rejected — the containment edge is a typed asset: pointer`,
    );
  }

  // .extend() preserved .strict(): an unknown top-level field is still refused.
  assert.throws(
    () => validateLibraryDoc({ ...minimalDoc("open-question"), notInTheSpec: "drift" }),
    ".extend() must preserve .strict() on the open-question kind",
  );

  // The question does NOT gain the plan's other lifecycle fields — only the containment edge moved.
  assert.throws(
    () => validateLibraryDoc({ ...minimalDoc("open-question"), anchor: { sha: "0123abc", date: "2026-07-11" } }),
    "anchor is plan-only — an open question is not git-anchored",
  );
});

test("ADR-0267 D4 is a ZERO-migration change: every registered migration no-ops on an arcRef", () => {
  // ADR-0267's Consequences ask for exactly this re-verification rather than taking the
  // stepRefs/increments precedent on faith. The pin must NOT have moved, and an already-current
  // stamped question must survive the upcaster with its edge intact.
  // ADR-0267's own change added an OPTIONAL field and bumped nothing. The pin has since moved to 4
  // for an unrelated reason (ADR-0305 D2/D4's increment reshape, which REMOVES fields and so cannot
  // be a zero-migration change) — what this guards is that no migration strips the edge.
  assert.equal(CURRENT_SCHEMA_VERSION, 4, "the pin tracks migrations.ts, not this ADR's change");
  const stamped = {
    ...minimalDoc("open-question"),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    arcRef: "asset:arc-orientation-surface-arc",
  };
  const upcasted = upcast({ ...stamped }) as { arcRef?: string };
  assert.equal(upcasted.arcRef, "asset:arc-orientation-surface-arc", "no migration may strip the edge");

  // And a LAGGING (pre-pin) stamped question is forward-migrated rather than rejected.
  const lagging: Record<string, unknown> = { ...stamped, schemaVersion: 0 };
  const migrated = upcast(lagging) as { arcRef?: string; schemaVersion?: number };
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.arcRef, "asset:arc-orientation-surface-arc");
  assert.doesNotThrow(() => validateLibraryDoc(migrated));
});

test("EPHEMERAL_KINDS (ADR-0183 D2): plan is ephemeral, every member is a real kind, arcs are not", () => {
  assert.ok(EPHEMERAL_KINDS.has("plan"), "plan is the first ephemeral kind");
  // An arc is NOT ephemeral — it is durable live state that outlives the plans it contains. This was
  // once one of two kind-partitions and had to be kept distinct from the seed scope; ADR-0302 D4
  // deleted SEED_SCOPE_KINDS with the ceremonies it bounded, so ephemerality is now the only
  // partition over kinds and there is nothing left to conflate it with.
  assert.ok(!EPHEMERAL_KINDS.has("arc"), "arc is durable live state, not disposable choreography");
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
