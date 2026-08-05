import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  upcast,
} from "./migrations.js";
import { validateLibraryDoc, upcastAndValidate } from "./library-doc.js";

/**
 * Migration-registry + write-boundary upcaster tests (design §5:
 * docs/research/library-schema-migrations-and-health-checks.md). Offline (no DB, no API key).
 */

// A v0 structured definition unit that still carries a stray retired `seeAlso` field — the
// concurrently-authored old-shape doc from the incident (§1b pain-point #2). No schemaVersion yet.
function v0DefinitionWithSeeAlso(): Record<string, unknown> {
  return {
    kind: "definition",
    id: "test-term",
    title: "Test term",
    description: "A test definition for migration coverage.",
    references: ["doc:decisions/0017-knowledge-tier.md"],
    seeAlso: ["asset:proof-mode"], // retired field — must be dropped by migration #1
    oneLine: "A throwaway definition used only by the migration test suite.",
    whatItIs: "The exact meaning, stated precisely for the test.",
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
}

// A rendered LibraryAsset (template) — has `category` + `body`, NO structured `kind`. Its schema is
// .strict() with no schemaVersion field, so upcast must leave it untouched.
function templateAsset(): Record<string, unknown> {
  return {
    id: "template-definition",
    category: "template",
    title: "Definition template",
    description: "The blank definition template.",
    body: "**In one line.** _What this term means._\n\n## What it is\n\n_..._",
    references: [],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
  };
}

test("upcast: v0 structured unit drops seeAlso, stamps schemaVersion, and validates", () => {
  const out = upcast(v0DefinitionWithSeeAlso());
  assert.equal("seeAlso" in out, false, "retired seeAlso dropped");
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION, "stamped to current version");
  assert.equal(CURRENT_SCHEMA_VERSION, 5, "current version is 5 (arc-increments-fold)");
  // The forwarded doc passes the strict validator (it would have been rejected un-upcast).
  const validated = validateLibraryDoc(out);
  assert.equal((validated as { schemaVersion?: number }).schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("upcast: idempotent — upcast(upcast(x)) deep-equals upcast(x)", () => {
  const once = upcast(v0DefinitionWithSeeAlso());
  const twice = upcast(once);
  assert.deepEqual(twice, once);
});

test("upcast: LibraryAsset/template passes through UNCHANGED (no schemaVersion) and still validates", () => {
  const asset = templateAsset();
  const out = upcast(asset);
  assert.deepEqual(out, asset, "asset passes through byte-for-byte");
  assert.equal("schemaVersion" in out, false, "no schemaVersion stamped onto an asset");
  // A LibraryAsset is .strict(); a stray schemaVersion would have thrown here.
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcastAndValidate: forwards a v0 doc instead of rejecting it", () => {
  // Bare validateLibraryDoc would throw on the stray seeAlso; upcastAndValidate forwards it.
  assert.throws(() => validateLibraryDoc(v0DefinitionWithSeeAlso()));
  const out = upcastAndValidate(v0DefinitionWithSeeAlso());
  assert.equal((out as { schemaVersion?: number }).schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal("seeAlso" in (out as Record<string, unknown>), false);
});

// A v1 agent unit in the PRE-RESHAPE shape (PR #48): prose authority walls + requiredReading +
// prose rules/antiPatterns. Migration #2 must drop the walls, extract the asset: refs into the
// typed context/rules/antiPatterns lists, and validate against the reshaped schema.
function v1AgentPreReshape(): Record<string, unknown> {
  return {
    kind: "agent",
    id: "test-agent",
    title: "Test agent",
    description: "A test agent for migration coverage.",
    schemaVersion: 1,
    oneLine: "A throwaway agent used only by the migration test suite.",
    role: "Exists to exercise migration #2.",
    owns: "The migration fixture surface.",
    doesNotTouch: "Anything real.",
    authority: "May do nothing.",
    outcome: "The migration test passes.",
    requiredReading:
      "ADR-0020 and the corpus. Doctrine: `asset:reference-dont-restate` (candidate), `asset:edit-first-curation`.",
    tools: "Read-only fixtures.",
    workflow: "1. Run. 2. Stop.",
    rules: "- **Edit first** -> `asset:edit-first-curation`.\n- A role-shape rule with no citation.",
    antiPatterns: "- Restating doctrine -> `asset:reference-dont-restate`.",
    escalation: "Surface everything.",
    references: ["doc:decisions/0029-agents-as-library-artifact-category.md", "asset:edit-first-curation"],
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  };
}

test("upcast: v1 agent unit is reshaped — walls dropped, refs extracted, validates at v2", () => {
  const out = upcast(v1AgentPreReshape());
  for (const gone of ["owns", "doesNotTouch", "authority", "requiredReading"]) {
    assert.equal(gone in out, false, `${gone} dropped by the reshape`);
  }
  assert.deepEqual(out["context"], ["asset:reference-dont-restate", "asset:edit-first-curation"]);
  assert.deepEqual(out["rules"], ["asset:edit-first-curation"]);
  assert.deepEqual(out["antiPatterns"], ["asset:reference-dont-restate"]);
  assert.equal(out["escalation"], "Surface everything.", "escalation prose carries");
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION);
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcast: v1 agent with no asset refs in requiredReading falls back to references", () => {
  const doc = v1AgentPreReshape();
  doc["requiredReading"] = "ADR-0032 and the corpus only — no asset refs here.";
  delete doc["rules"];
  delete doc["antiPatterns"];
  const out = upcast(doc);
  assert.deepEqual(out["context"], ["asset:edit-first-curation"], "context from references");
  assert.equal("rules" in out, false, "absent optional ref-list stays absent");
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcast: agent reshape is idempotent and leaves non-agent kinds untouched by #2", () => {
  const once = upcast(v1AgentPreReshape());
  assert.deepEqual(upcast(once), once);
  // open-question also has a `context` field (markdown prose) — #2 must not touch it.
  const oq = upcast({
    kind: "open-question",
    id: "test-oq",
    title: "Test OQ",
    description: "fixture",
    schemaVersion: 1,
    stakes: "None.",
    statement: "Is the fixture fine?",
    context: "Prose context, not a ref list.",
    options: "A vs B.",
    references: [],
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  });
  assert.equal(oq["context"], "Prose context, not a ref list.");
  assert.doesNotThrow(() => validateLibraryDoc(oq));
});

// Migration #3 (ADR-0135): docs/glossary.md is retired, so the glossary-projection metadata
// (glossarySection / glossaryTerm / glossaryBody) is stripped — it no longer exists in the schema —
// and the now-dangling `doc:glossary.md` citation each unit carried is dropped.
test("upcast: migration #3 strips glossary* fields + the doc:glossary.md citation, stamps v3", () => {
  const out = upcast({
    kind: "definition",
    id: "spine",
    title: "spine",
    description: "the control-flow layer",
    schemaVersion: 2,
    references: ["doc:glossary.md", "doc:decisions/0005-deterministic-spine.md", "asset:leaf"],
    oneLine: "The control-flow layer.",
    whatItIs: "The deterministic routing layer.",
    glossarySection: "Studio & tooling",
    glossaryTerm: "**spine**",
    glossaryBody: "the canonical glossary paragraph",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  });
  for (const gone of ["glossarySection", "glossaryTerm", "glossaryBody"]) {
    assert.equal(gone in out, false, `${gone} stripped`);
  }
  assert.deepEqual(
    out["references"],
    ["doc:decisions/0005-deterministic-spine.md", "asset:leaf"],
    "the dangling doc:glossary.md citation is dropped; the other refs are kept in order",
  );
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION, "stamped to the current version");
  // The stripped doc passes the strict validator (the glossary fields are gone from the schema).
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcast: migration #3 is a no-op on a doc with no glossary projection (idempotent)", () => {
  const clean = {
    kind: "principle",
    id: "red-green",
    title: "Red-green",
    description: "prove it",
    schemaVersion: 2,
    references: ["doc:decisions/0010-proof-modes.md"],
    statement: "Red, then green.",
    why: "Evidence over assertion.",
    howToApply: "Write the failing test first.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
  const out = upcast(clean);
  assert.deepEqual(out["references"], ["doc:decisions/0010-proof-modes.md"], "refs untouched");
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION, "still stamped to the current version");
  assert.deepEqual(upcast(out), out, "idempotent");
});

// ---------------------------------------------------------------------------
// Migration #4 — ADR-0305 D2/D4: the increment body and status collapse.
// ---------------------------------------------------------------------------

/** A v3 plan doc in the PRE-COLLAPSE shape: five body headings + a five-value status. */
function v3PlanPreCollapse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    // The PRE-rename key on purpose: migration #4 is kind-scoped on `plan`, and it runs BEFORE
    // migration #5 (the re-key) on any doc pinned below 4 — so it can only ever see `plan`.
    kind: "plan",
    id: "parity-plan",
    title: "Parity plan",
    description: "A plan used only by the migration test suite.",
    schemaVersion: 3,
    references: [],
    arcRef: "asset:parity-arc",
    anchor: { sha: "0123abc", date: "2026-07-11" },
    status: "consumed",
    objective: "Prove the collapse folds the body without losing a path.",
    decomposition: "Unit one touches `packages/library/src/knowledge.ts` — `--real` red→green.",
    lanes: "Lane A is `packages/cli/src/plan.ts`; lane B is independent.",
    budgets: "16 turns for the one-file unit.",
    traps: "Watch `packages/drive/src/arc-rollup.ts` — it reads status defensively.",
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
    ...overrides,
  };
}

test("upcast: migration #4 folds the four dropped headings into `body`, keeping every backtick path", () => {
  const out = upcast(v3PlanPreCollapse());
  for (const gone of ["decomposition", "lanes", "budgets", "traps"]) {
    assert.equal(gone in out, false, `${gone} is removed from the doc`);
  }
  const body = out["body"];
  assert.equal(typeof body, "string", "the required `body` field is synthesised");
  const text = body as string;
  for (const heading of ["## Decomposition", "## Lanes", "## Budgets", "## Traps"]) {
    assert.ok(text.includes(heading), `${heading} survives the fold as a markdown heading`);
  }
  // THE load-bearing property (ADR-0305 D4): the freshness check mines BACKTICK-quoted paths out of
  // the body, so a fold that dropped or reflowed them would silently turn a checkable increment into
  // a VACUOUS one. Every path named in the old five headings must still be findable in the new one.
  for (const p of [
    "`packages/library/src/knowledge.ts`",
    "`packages/cli/src/plan.ts`",
    "`packages/drive/src/arc-rollup.ts`",
  ]) {
    assert.ok(text.includes(p), `the backtick path ${p} survives the fold`);
  }
  // The folded doc passes the strict validator — un-upcast it would have been rejected twice over
  // (a stray `decomposition`, and a `consumed` no longer in the enum).
  assert.throws(() => validateLibraryDoc(v3PlanPreCollapse()));
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("upcast: migration #4 remaps every retired status, and is idempotent on the new vocabulary", () => {
  const remap: Record<string, string> = {
    draft: "proposal",
    ready: "ready",
    consumed: "active",
    superseded: "closed",
    retired: "closed",
  };
  for (const [before, after] of Object.entries(remap)) {
    const out = upcast(v3PlanPreCollapse({ status: before }));
    assert.equal(out["status"], after, `${before} → ${after}`);
    assert.doesNotThrow(() => validateLibraryDoc(out), `the remapped ${after} validates`);
    // Re-running must not move it again — the map carries the new values through unchanged.
    assert.deepEqual(upcast(out), out, `idempotent for ${before}`);
  }
  // An absent or unrecognised status lands on the birth default rather than an invalid literal.
  const noStatus = v3PlanPreCollapse();
  delete noStatus["status"];
  assert.equal(upcast(noStatus)["status"], "proposal", "an absent status becomes proposal");
  assert.equal(upcast(v3PlanPreCollapse({ status: "half-done" }))["status"], "proposal");
});

test("upcast: migration #5 re-keys the plan tier and backfills the fields its invariants require", () => {
  // THE TRAP THIS PINS: `upcast` skips anything `isStructuredKnowledge` rejects, and that predicate
  // asks whether `kind` is a CURRENT KIND_SPECS key — so a rename would make every stored row under
  // the old key un-upcastable, and the migration written to fix them would never run on them.
  const out = upcast(v3PlanPreCollapse({ status: "consumed" }));
  assert.equal(out["kind"], "increment", "the retired key is re-keyed, not skipped");
  assert.equal(out["schemaVersion"], CURRENT_SCHEMA_VERSION);
  assert.doesNotThrow(() => validateLibraryDoc(out));

  // A `closed` row MUST gain an `outcome` — the 10 live rows migration 4 mapped from
  // `superseded`/`retired` predate the field entirely, and declaring the invariant without this
  // backfill would brick exactly the documents the fold exists to preserve.
  const closed = upcast(v3PlanPreCollapse({ status: "retired" }));
  assert.equal(closed["status"], "closed");
  const outcome = closed["outcome"] as Record<string, unknown>;
  assert.equal(outcome["date"], "2026-07-11", "the date comes from the doc's OWN timestamp, not a clock");
  assert.match(String(outcome["note"]), /recoverable only from `events.library_event`/);
  assert.doesNotThrow(() => validateLibraryDoc(closed));

  // A `proposal` row MUST gain `parked` — and from its own createdAt, never "now": `parked` is the
  // delivery ceiling's comparison point, so a clock-stamped migration would reset every waiting
  // entry's age to zero and silence the recurrences that select it.
  const parked = upcast(v3PlanPreCollapse({ status: "draft" }));
  assert.equal(parked["status"], "proposal");
  assert.equal(parked["parked"], "2026-07-11T00:00:00.000Z");
  assert.doesNotThrow(() => validateLibraryDoc(parked));

  // Idempotent, and it never overwrites a stamp the doc already carries.
  assert.deepEqual(upcast(parked), parked);
  const own = upcast(v3PlanPreCollapse({ status: "draft", parked: "2026-01-01T00:00:00.000Z" }));
  assert.equal(own["parked"], "2026-01-01T00:00:00.000Z", "an existing parked stamp is preserved");
});

test("upcast: migration #5 drops the arc's two folded arrays, so a stored arc stays writable", () => {
  const arc = {
    kind: "arc",
    id: "map-arc",
    title: "Map",
    description: "d",
    schemaVersion: 4,
    references: [],
    intent: "i",
    endState: "e",
    increments: [{ date: "2026-07-01", pr: "#640", outcome: "landed" }],
    proposals: [{ id: "p", title: "t", parked: "2026-07-01", summary: "s", motivation: "m" }],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-01",
  };
  // Un-upcast it is REFUSED — the schema no longer declares either array (ADR-0305 D1).
  assert.throws(() => validateLibraryDoc(arc));
  const out = upcast({ ...arc });
  assert.equal("increments" in out, false);
  assert.equal("proposals" in out, false);
  assert.equal(out["intent"], "i", "the narrative is untouched");
  assert.doesNotThrow(() => validateLibraryDoc(out));
  assert.deepEqual(upcast(out), out, "idempotent");

  // The entries themselves are NOT created here: a per-doc transform cannot mint documents, so
  // MOVING them into increment rows is the one-shot backfill's job. This is the ramp, not the fold.
});

test("upcast: migration #4 no-ops on every other kind, and synthesises a body from `objective`", () => {
  // A non-plan doc carrying a same-named field must be untouched — the transform is kind-scoped.
  const principle = {
    kind: "principle",
    id: "red-green",
    title: "Red-green",
    description: "prove it",
    schemaVersion: 3,
    references: [],
    statement: "Red, then green.",
    why: "Evidence over assertion.",
    howToApply: "Write the failing test first.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
  };
  assert.deepEqual(upcast(principle), { ...principle, schemaVersion: CURRENT_SCHEMA_VERSION });

  // `body` is REQUIRED, so a plan whose four optional headings were ALL absent still needs one; the
  // required `objective` is the honest fallback (an empty string would fail Markdown's min length).
  const bare = v3PlanPreCollapse();
  for (const f of ["decomposition", "lanes", "budgets", "traps"]) delete bare[f];
  const out = upcast(bare);
  assert.equal(out["body"], "Prove the collapse folds the body without losing a path.");
  assert.doesNotThrow(() => validateLibraryDoc(out));
});

test("MIGRATIONS: registry is ordered and reaches CURRENT_SCHEMA_VERSION", () => {
  for (let i = 1; i < MIGRATIONS.length; i++) {
    const prev = MIGRATIONS[i - 1];
    const cur = MIGRATIONS[i];
    assert.ok(prev && cur && cur.version > prev.version, "migration versions strictly increasing");
  }
  const top = MIGRATIONS[MIGRATIONS.length - 1];
  assert.equal(top?.version, CURRENT_SCHEMA_VERSION, "top migration matches current version");
});
