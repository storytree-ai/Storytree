---
id: "library-typed-edges"
tier: capability
story: library-tech-tree-overlay
title: "The three ALREADY-STORED structured typed-edge fields (agent `stepRefs`, process `branchEdges`, plan `arcRef`) surface onto the rendered GuidanceAsset wire shape via renderStoredDoc's STRUCTURED branch; MACHINE-ONLY, no look leg"
outcome: "Every stored structured Knowledge doc that carries a typed-edge field lands that field on the GuidanceAsset wire shape via `renderStoredDoc` (packages/library/src/store/render-doc.ts): an `agent` doc's `stepRefs` (`Array<{ step: string; refs: string[] }>`), a `process` doc's `branchEdges` (`Array<{ ref: string; label?: string }>`), and a `plan` doc's `arcRef` (an `asset:<id>` string) each ride onto the `RenderedAsset` — read directly off the parsed `knowledge` object in the FINAL structured return, spread-when-present / absent-by-default (undefined, never an empty array), exactly the existing `provenance?` / `fields?` idiom. These three are `.extend()` schema metadata OUTSIDE the KIND_SPECS body table, so `extractFields()` (which iterates `KIND_SPECS[doc.kind]` only) never surfaces them — they fall on the floor at the wire boundary today; THIS capability closes that gap with a separate typed read in the structured branch, NOT a change to `extractFields` and NOT a KIND_SPECS addition. This is INVISIBLE PLUMBING — pure DATA on the wire with NO look leg and NO operator-attested UAT leg; nothing renders differently until a later increment (inc-9) draws with the edges. Each field's surfacing, the undefined-by-absence back-compat, and the pass-through/degraded emptiness are all machine-witnessed."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [187, 185, 161, 122]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (editsExisting): the wire adapter
# `renderStoredDoc` ALREADY exists in packages/library/src/store/render-doc.ts and the three schema
# fields ALREADY exist on the Knowledge kinds (knowledge.ts: Agent.stepRefs, Process.branchEdges,
# Plan.arcRef). The leaf ADDS a typed read of those fields in the STRUCTURED branch (the final
# `knowledge` return, render-doc.ts ~L219-233), spread onto RenderedAsset when present, and ADDS the 5
# `lte-` assertions into the EXISTING render-doc.test.ts. The RED the spine observes is a NEW runtime
# assertion: the test calls the real `renderStoredDoc(stored)` on a stored fixture carrying a typed edge
# and asserts the RETURNED object carries `stepRefs`/`branchEdges`/`arcRef` with the right VALUES — at
# HEAD they are `undefined` (not surfaced), so `assert.deepEqual(rendered.stepRefs, [...])` FAILS.
#
# CRITICAL — the RED must be a RUNTIME behaviour, not type-only. The proof runs under tsx
# (`node --import tsx --test`), which strips types WITHOUT typechecking — so ADDING an optional field to
# the RenderedAsset interface alone produces NO runtime failure. The legitimate observed red is the
# ABSENCE of the surfaced VALUE at run time: the fixture-driven `assert.deepEqual` against a concrete
# `stepRefs`/`branchEdges`/`arcRef` value fails at HEAD because the field is not read off `knowledge`
# yet, and holds once render-doc.ts spreads it (the block-position-comment-anchor runtime-witness
# precedent). Author the assertions as VALUE checks over the returned object, never as a type check.
#
# install: true + a typecheck wall — the suite imports the package's own types across modules and the
# proof runs in a fresh worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2). SINGLE LITERAL
# test file (no `*`), so the default node:test proof on the one file is legal — NO proofCommand (the
# @storytree/library suite is node:test, NOT vitest, unlike the studio-side sibling
# library-adr-wire-signals; the block-position-comment-anchor precedent).
#
# MACHINE-ONLY: this cap is pure DATA on the wire — NO look leg, NO operator-attested UAT leg (contrast
# the sibling library-overview whose appearance is UAT leg 5; this one has NONE, exactly like inc-6
# library-adr-wire-signals). The `toGuidanceAsset` carry-through (apps/studio/server/libraryBackend.ts),
# the GuidanceAsset type additions (apps/studio/src/types.ts), and the node-build.test.ts snapshot insert
# are AFTER-PASS SUPPLEMENT GLUE, explicitly OUT of the leaf's `real:` scope (which is render-doc.ts +
# render-doc.test.ts ONLY) — the leaf must NOT edit libraryBackend.ts, types.ts, or any signed inc-1..6
# source.
#
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lte-`-named contract test
# lives in this ONE file (packages/library/src/store/render-doc.test.ts), importing `renderStoredDoc` by
# the relative specifier `./render-doc.js`.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/store/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/store/**/*.ts"]
  real:
    editsExisting: true
    testFile: "packages/library/src/store/render-doc.test.ts"
    sourceFile: "packages/library/src/store/render-doc.ts"
    scope:
      testGlobs: ["packages/library/src/store/render-doc.test.ts"]
      sourceGlobs: ["packages/library/src/store/render-doc.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# The typed edges onto the wire — agent stepRefs + process branchEdges + plan arcRef via renderStoredDoc (machine-only plumbing)

**Outcome —** Every stored structured Knowledge doc that carries a typed-edge field lands that field on
the GuidanceAsset wire shape via `renderStoredDoc` (`packages/library/src/store/render-doc.ts`): an
`agent` doc's `stepRefs` (`Array<{ step: string; refs: string[] }>`), a `process` doc's `branchEdges`
(`Array<{ ref: string; label?: string }>`), and a `plan` doc's `arcRef` (an `asset:<id>` string) each
ride onto the `RenderedAsset` — read directly off the parsed `knowledge` object in the FINAL structured
return, spread-when-present / absent-by-default (undefined, never an empty array), exactly the existing
`provenance?` / `fields?` idiom. This is **INVISIBLE PLUMBING** — pure DATA on the wire with **NO look
leg** and **NO operator-attested UAT leg**; nothing renders differently until inc-9 draws with the
edges. Each field's surfacing, the undefined-by-absence back-compat, and the pass-through/degraded
emptiness are all machine-witnessed.

**Depends on —** [`library-finder`](library-finder.md). This is the arc's shared foundational
SEQUENCING anchor that every sibling increment cites (incs 2-6 all anchored on it) — **not a hard code
edge**. `renderStoredDoc` is a standalone pure function over a `StoredDoc`; it imports nothing from the
finder. The `depends_on` records the increment's place in the `library-tech-tree-overlay` arc ordering
(the finder established the studio's library backend seam these overlay increments extend), consistent
with how increments 2, 3, 4, 5, and 6 anchored on the same finder. `render-doc` is functionally
independent — this capability's `real:` red→green surface is `render-doc.ts` + `render-doc.test.ts`
only.

> **Proof status (honest) — `proposed`, EDITS-EXISTING.** `renderStoredDoc` and its test file
> `packages/library/src/store/render-doc.test.ts` BOTH exist at HEAD, and so do the three schema fields
> (`Agent.stepRefs`, `Process.branchEdges`, `Plan.arcRef` in `knowledge.ts`) — but the wire adapter does
> NOT surface them: `extractFields()` iterates `KIND_SPECS[doc.kind]` only, and these three are
> `.extend()` schema metadata OUTSIDE the KIND_SPECS body table, so they fall on the floor at the wire
> boundary. This capability closes that gap test-first: 5 new `lte-` assertions ADDED to the EXISTING
> `render-doc.test.ts` call the real `renderStoredDoc(stored)` on stored fixtures and assert the returned
> `RenderedAsset` carries `stepRefs` / `branchEdges` / `arcRef` with the right VALUES — RED at HEAD (the
> fields are `undefined`, not surfaced), GREEN once `render-doc.ts` reads them off `knowledge` in the
> structured branch and spreads them when present. The whole cap is machine-witnessed — there is NO look
> leg and NO operator-attested UAT leg this increment (contrast the sibling `library-overview`, whose
> appearance is the story's UAT leg 5; this one has none — it is invisible plumbing, exactly like inc-6
> `library-adr-wire-signals`). Status stays `proposed` — `healthy` is only ever DERIVED from signed
> verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the TYPED-EDGE SURFACING AS A WHOLE — a
coherent enrichment of the structured wire boundary that spans three distinct kind-specific fields (an
agent's `stepRefs`, a process's `branchEdges`, a plan's `arcRef`), the undefined-by-absence back-compat
that every existing structured doc still round-trips unchanged, and the emptiness on the non-structured
(pass-through / degraded) branches. That is a coherent behavioural surface (5 contracts) proven by a
single adapter read, not a single assertion. The `toGuidanceAsset` carry-through and the drawing that
make these edges VISIBLE are a later increment's / the after-pass glue's job, gated on this surfacing.

MACHINE-ONLY — THERE IS NO LOOK LEG. This capability puts pure DATA on the wire. Unlike the sibling
`library-overview` (whose appearance is the story's operator-attested UAT leg 5), this increment has
**NO appearance to witness and NO operator-attested UAT leg** — exactly like inc-6
`library-adr-wire-signals`. Nothing renders differently when it lands: the typed edges sit on the
`RenderedAsset` waiting for inc-9 to draw the tech-tree lineage lines with them (per ADR-0187). Do NOT
author any visual / colour / stroke / pixel / animation assertion, and do NOT frame any part of this as
owner-witnessed — the whole proof is machine-witnessed pure logic over stored fixtures.

THE GAP THIS CLOSES — `extractFields` IS KIND_SPECS-ONLY, THE THREE FIELDS LIVE OUTSIDE IT. The three
typed-edge fields are `.extend()` schema metadata on the Knowledge kinds, deliberately NOT KIND_SPECS
body sections (they do not round-trip through the rendered markdown body — like `references`):

- `stepRefs` on `agent` — `knowledge.ts`: `Agent = buildKindSchema("agent").extend({ stepRefs:
  z.array(AgentStepRef).optional(), … })`, where `AgentStepRef = { step: string; refs: string[] }`
  (`refs` is `AssetRef[]`).
- `branchEdges` on `process` — `knowledge.ts`: `Process = buildKindSchema("process").extend({
  branchEdges: z.array(ProcessBranchEdge).optional() })`, where `ProcessBranchEdge = { ref: string;
  label?: string }` (`ref` is `AssetRef`, `label` optional).
- `arcRef` on `plan` — `knowledge.ts`: `Plan = buildKindSchema("plan").extend({ arcRef: AssetRef,
  anchor, status })`; `arcRef` is a REQUIRED `asset:<id>` string.

`extractFields(doc)` (render-doc.ts) iterates `KIND_SPECS[doc.kind]` ONLY, so it never sees these — they
fall on the floor at the wire boundary today. THIS is the gap. The fix is a SEPARATE typed read of
`knowledge.stepRefs` / `knowledge.branchEdges` / `knowledge.arcRef` in the STRUCTURED branch of
`renderStoredDoc` — **NOT** a change to `extractFields` (it stays KIND_SPECS-only) and **NOT** a
KIND_SPECS addition (that would wrongly render them into the markdown body).

THE SURFACING RIDES THE STRUCTURED BRANCH ONLY (the final `knowledge` return, render-doc.ts ~L219-233).
`renderStoredDoc` has three exits: (1) the pass-through branch (`hasStringBody` — a body-bearing
template / rendered asset), (2) the degraded branch (`degradeReason !== null` — an unknown kind / newer
`schemaVersion`), and (3) the structured branch (the final `const knowledge = doc as Knowledge` return
that already spreads `provenance?` and `fields`). The typed edges are surfaced ONLY on branch (3), the
faithfully-parsed structured return — read off the `knowledge` object and spread onto the returned
`RenderedAsset` when present. The pass-through and degraded branches carry NONE of the three (they never
faithfully parsed a structured kind), and NEVER throw — the extraction rides only the structured branch,
which is the sole exit that has a typed `knowledge` in hand.

SPREAD-WHEN-PRESENT / ABSENT-BY-DEFAULT (the back-compat idiom). The three fields are OPTIONAL on the
`RenderedAsset` interface and are spread onto the returned object ONLY when present on `knowledge` —
mirroring the EXISTING `...(typeof knowledge.provenance === "string" && knowledge.provenance ?
{ provenance } : {})` idiom (and inc-6's `DocMeta.loadBearing?` / `references?`). An agent with no
`stepRefs`, a process with no `branchEdges`, and every NON-typed-edge structured kind (a `definition`, a
`principle`, …) omit ALL THREE fields on the wire — `undefined` by absence, NEVER an empty array. This
is a pure enrichment: NO migration, NO `CURRENT_SCHEMA_VERSION` bump, every existing structured doc
round-trips unchanged.

DO NOT TOUCH `extractFields`, DO NOT ADD TO KIND_SPECS. `extractFields` stays KIND_SPECS-only — the
typed edges are read directly off the parsed `knowledge` object in the structured return, not folded
into the `fields` bag. Adding them to KIND_SPECS would wrongly render them into the markdown body and
break the round-trip. The read is a small typed access + a conditional spread, adjacent to the existing
`fields: extractFields(knowledge)` line.

CORPUS EDGE-DATA AUTHORING STAYS LIBRARIAN WORK. This increment wires the FIELDS that already exist on
the schema — it authors NO edge data. Populating `stepRefs` / `branchEdges` / `arcRef` values ONTO
artifacts is librarian curation, out of scope here. The leaf proves the surfacing over literal stored
fixtures it constructs in the test; it does not touch the corpus, the seed, or the live store.

NUMBERS-FREE — THE CARRY-THROUGH + THE DRAW ARE AFTER-PASS SUPPLEMENT GLUE, OUT OF THE `real:` SCOPE. The
leaf's `real:` red→green surface is `render-doc.ts` + `render-doc.test.ts` ONLY. The `toGuidanceAsset`
carry-through (`apps/studio/server/libraryBackend.ts`), the `GuidanceAsset` type additions
(`apps/studio/src/types.ts`), and the `node-build.test.ts` REAL-buildable snapshot insert are AFTER-PASS
SUPPLEMENT GLUE — explicitly OUT of the leaf's `real:` scope. The leaf must NOT edit `libraryBackend.ts`,
`types.ts`, or any signed inc-1..6 source; it proves the surfacing in isolation, driven by literal
`StoredDoc` fixtures.

OFFLINE-TESTABLE, NODE:TEST (no DB, no vitest). `render-doc.ts` is a pure adapter over a `StoredDoc`; the
existing `render-doc.test.ts` is `node:test` + `node:assert/strict` (the `@storytree/library` package
convention — NOT vitest, unlike the studio-side sibling `library-adr-wire-signals`). Every new `lte-`
assertion runs offline over literal `StoredDoc` fixtures the test constructs — NO store, NO clock, NO DB,
NO socket. The test imports `renderStoredDoc` by the relative specifier `./render-doc.js`.

COVERAGE — EVERY `lte-` TEST TITLE CARRIES A UNIQUE ID (the coverage-drop trap). Per ADR-0122,
`storytree coverage` scans ONLY `real.testFile`, so all 5 `lte-` contract tests live in the ONE file
`packages/library/src/store/render-doc.test.ts`, each an isolated `node:test` `test(...)` whose title
LEADS with its unique contract id. **Trap — this exact class has recurred 4× on THIS arc
(`sdk-leaf-drops-contract-id-test-names` / `friction-leaf-duplicate-contract-id-silently-drops-coverage`,
the invent → duplicate → rename pattern):** if two test titles share (or drop, or rename) a contract id,
coverage silently reports N-1/N. The fix is **TEST-TITLE-ONLY** — give each of the 5 `test(...)` a
distinct title leading with its exact `lte-…` id below, verbatim, so coverage reports 5/5. Do NOT invent
new ids, do NOT rename these, do NOT collapse two contracts into one test.

## Integration test

**Goal —** Prove the typed-edge surfacing: `renderStoredDoc(stored)` reads `knowledge.stepRefs` /
`knowledge.branchEdges` / `knowledge.arcRef` off a faithfully-parsed STRUCTURED doc and spreads each onto
the returned `RenderedAsset` with structure + values preserved; omits all three (undefined, never an
empty array) for a structured doc that lacks the field and for a non-typed-edge structured kind; and
carries NONE of the three — never throwing — on the pass-through (body-bearing) and degraded
(unknown-kind) branches. Entirely pure, over literal `StoredDoc` fixtures, under `node:test`.

The integration test exercises this capability against its own composition (no backend seam) — the pure
adapter is the whole surface. The RED it observes is a RUNTIME value check, not a type check: it asserts
the RETURNED object's field VALUES, which are `undefined` at HEAD (the tsx runner strips types without
typechecking, so an interface-only addition would produce no red — the value assertion is the legitimate
witness). It would:

1. Construct a stored `agent` doc carrying `stepRefs: [{ step, refs: ['asset:a', 'asset:b'] }]`, call
   `renderStoredDoc(stored)`, and `assert.deepEqual(rendered.stepRefs, [...])` — structure and the
   ORDERED `refs` preserved. FAILS at HEAD (`rendered.stepRefs === undefined`).
2. Construct a stored `process` doc carrying `branchEdges: [{ ref: 'asset:x', label: 'why' },
   { ref: 'asset:y' }]`, call `renderStoredDoc`, and assert `rendered.branchEdges` preserves each edge —
   the optional `label` present on the first and ABSENT on the second (never a phantom empty string).
3. Construct a stored `plan` doc, call `renderStoredDoc`, and assert `rendered.arcRef === 'asset:<id>'`
   (the `asset:` string).
4. Construct (a) an `agent` doc with NO `stepRefs` and (b) a `definition` doc (a non-typed-edge
   structured kind), call `renderStoredDoc` on each, and assert BOTH omit all three fields —
   `rendered.stepRefs`/`branchEdges`/`arcRef` are all `undefined` (undefined-by-absence, never an empty
   array). The back-compat idiom.
5. Construct (a) a body-bearing pass-through doc (a `template-*` / rendered asset with a string `body`)
   and (b) a degraded doc (an unknown kind), call `renderStoredDoc` on each, and assert BOTH carry NONE
   of the three fields and that neither call THROWS — the surfacing rides ONLY the faithfully-parsed
   structured branch.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `@storytree/library` suite
(`node:test` + `node:assert/strict`, `packages/library/src/store/render-doc.test.ts`, importing
`renderStoredDoc` by `./render-doc.js`), no DB. Per ADR-0122 (`storytree coverage`) each contract id
LEADS a distinctly-named test, so the coverage check reports 5/5 against the ONE `real.testFile`. None of
these is an APPEARANCE assertion — this capability is machine-only plumbing with NO look leg and NO
operator-attested UAT leg. **Use these exact ids verbatim as the authoritative list (the coverage-drop
trap — do NOT rename, drop, or merge any).**

1. **`lte-agent-steprefs-surface`** — a stored `agent` doc carrying `stepRefs` surfaces `stepRefs` on the RenderedAsset
   - **asserts —** `renderStoredDoc(stored)` over a structured `agent` doc carrying `stepRefs`
     (`Array<{ step, refs }>`) returns a `RenderedAsset` whose `stepRefs` equals the input — the `{ step,
     refs }` structure preserved and the `refs` array ORDER preserved. At HEAD `rendered.stepRefs` is
     `undefined` (not surfaced), so the `deepEqual` fails — the runtime witness for a field the tsx
     (no-typecheck) runner would not otherwise observe.
   - **covers —** `packages/library/src/store/render-doc.ts` (the structured branch's typed read of `knowledge.stepRefs`, spread onto `RenderedAsset`)
   - **proven by —** `packages/library/src/store/render-doc.test.ts` (editsExisting, node:test; imports `renderStoredDoc` by `./render-doc.js`).
2. **`lte-process-branchedges-surface`** — a stored `process` doc carrying `branchEdges` surfaces `branchEdges`, the optional `label` preserved-when-present / absent-when-omitted
   - **asserts —** `renderStoredDoc` over a structured `process` doc carrying `branchEdges`
     (`Array<{ ref, label? }>`) returns `branchEdges` preserving each edge's `ref`, with the optional
     `label` present on an edge that has one and ABSENT on an edge that omits it (never a phantom empty
     string).
   - **covers —** `packages/library/src/store/render-doc.ts` (the structured branch's typed read of `knowledge.branchEdges`)
   - **proven by —** `packages/library/src/store/render-doc.test.ts`.
3. **`lte-plan-arcref-surface`** — a stored `plan` doc surfaces `arcRef` as the `asset:<id>` string
   - **asserts —** `renderStoredDoc` over a structured `plan` doc returns `arcRef` equal to the doc's
     `asset:<id>` string (the required plan→arc containment ref).
   - **covers —** `packages/library/src/store/render-doc.ts` (the structured branch's typed read of `knowledge.arcRef`)
   - **proven by —** `packages/library/src/store/render-doc.test.ts`.
4. **`lte-optional-edges-omitted-when-absent`** — a structured doc without the field, AND a non-typed-edge structured kind, both OMIT all three fields (undefined, never `[]`)
   - **asserts —** `renderStoredDoc` over (a) an `agent` doc with NO `stepRefs` and (b) a `definition`
     doc (a structured kind that carries none of the three) returns a `RenderedAsset` where
     `stepRefs` / `branchEdges` / `arcRef` are all `undefined` — omitted by absence, never an empty
     array. The spread-when-present / absent-by-default back-compat idiom (`provenance?` precedent).
   - **covers —** `packages/library/src/store/render-doc.ts` (the conditional spread — a field absent from `knowledge` is omitted from `RenderedAsset`)
   - **proven by —** `packages/library/src/store/render-doc.test.ts`.
5. **`lte-passthrough-and-degraded-carry-no-typed-edges`** — a body-bearing pass-through doc AND a degraded/unknown-kind doc both carry NONE of the three and NEVER throw
   - **asserts —** `renderStoredDoc` over (a) a body-bearing pass-through doc (a `template-*` / rendered
     asset with a string `body`) and (b) a degraded doc (an unknown kind that hits the `degradeReason`
     branch) returns a `RenderedAsset` carrying NONE of `stepRefs` / `branchEdges` / `arcRef`, and
     NEITHER call throws — the extraction rides ONLY the faithfully-parsed structured branch.
   - **covers —** `packages/library/src/store/render-doc.ts` (the pass-through + degraded branches carry no typed edges; the surfacing is structured-branch-only)
   - **proven by —** `packages/library/src/store/render-doc.test.ts`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, EDITS-EXISTING): surface the three typed-edge fields on
the structured wire branch, test-first.

- **The edited test —** `packages/library/src/store/render-doc.test.ts` (`node:test` +
  `node:assert/strict`, the package convention). Import `{ renderStoredDoc }` from `"./render-doc.js"`
  (already imported), and ADD the 5 `lte-` assertions above, each over a literal `StoredDoc` fixture the
  test constructs (an `agent` with `stepRefs`, a `process` with `branchEdges`, a `plan` with `arcRef`, an
  `agent` without `stepRefs` + a `definition`, a body-bearing pass-through + an unknown-kind degraded).
  Name each test for its contract id (`lte-…`) so `storytree coverage library-typed-edges` reports 5/5
  (ADR-0122) — all 5 contracts live in THIS one file, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the new assertions fail against HEAD because
  `renderStoredDoc` does NOT surface the three fields — `rendered.stepRefs` / `branchEdges` / `arcRef`
  are all `undefined`, so the `assert.deepEqual`/`assert.equal` against the concrete expected VALUES
  fails. A RUNTIME WITNESS is required here, not optional: the proof runs under tsx (`node --import tsx
  --test`), which strips types WITHOUT typechecking, so ADDING the optional fields to the `RenderedAsset`
  interface alone produces no runtime failure — the legitimate observed red is the *absence of the
  surfaced VALUE* at HEAD (the block-position-comment-anchor runtime-witness precedent). Author the
  assertions as VALUE checks over the returned object, never as a type check.
- **The GREEN —** in `packages/library/src/store/render-doc.ts`: (1) add the three optional fields to the
  `RenderedAsset` interface — `stepRefs?: Array<{ step: string; refs: string[] }>`, `branchEdges?:
  Array<{ ref: string; label?: string }>`, `arcRef?: string`; (2) in the FINAL structured `knowledge`
  return (~L219-233), read them off the typed `knowledge` object and spread each onto the returned object
  ONLY when present — mirroring the existing `...(typeof knowledge.provenance === "string" &&
  knowledge.provenance ? { provenance } : {})` idiom (e.g. `...(knowledge.stepRefs ? { stepRefs:
  knowledge.stepRefs } : {})`, and likewise for `branchEdges` / `arcRef`). Do NOT touch `extractFields`
  (it stays KIND_SPECS-only), do NOT add the fields to KIND_SPECS, and do NOT surface them on the
  pass-through or degraded branches. After it, the import resolves, the assertions hold, and
  `pnpm --filter @storytree/library test` + `pnpm --filter @storytree/library typecheck` stay green.

The `toGuidanceAsset` carry-through (`apps/studio/server/libraryBackend.ts`), the `GuidanceAsset` type
additions (`apps/studio/src/types.ts`), and the `node-build.test.ts` REAL-buildable snapshot insert are
AFTER-PASS SUPPLEMENT GLUE — explicitly OUT of the leaf's `real:` scope (which is `render-doc.ts` +
`render-doc.test.ts` only). The leaf must NOT edit `libraryBackend.ts`, `types.ts`, or any signed
inc-1..6 source; it proves the surfacing in isolation over literal `StoredDoc` fixtures.

Rules:

- **The three fields live OUTSIDE KIND_SPECS — read them off `knowledge`, don't touch `extractFields`** —
  `stepRefs` / `branchEdges` / `arcRef` are `.extend()` schema metadata (not KIND_SPECS body sections),
  so `extractFields` (KIND_SPECS-only) never surfaces them; add a separate typed read in the structured
  return, and do NOT add them to KIND_SPECS (`lte-agent-steprefs-surface`,
  `lte-process-branchedges-surface`, `lte-plan-arcref-surface`).
- **Surface ONLY on the faithfully-parsed structured branch** — the pass-through (body-bearing) and
  degraded (unknown-kind) branches carry NONE of the three and never throw; the extraction rides only the
  final `knowledge` return (`lte-passthrough-and-degraded-carry-no-typed-edges`).
- **Spread-when-present / absent-by-default (undefined, not `[]`)** — a structured doc without the field,
  and every non-typed-edge structured kind, omit all three; NO migration, NO `CURRENT_SCHEMA_VERSION`
  bump, mirroring the existing `provenance?` / `fields?` and inc-6's `loadBearing?` / `references?`
  (`lte-optional-edges-omitted-when-absent`).
- **Preserve structure + order + optionality** — `stepRefs` keeps `{ step, refs }` and the ordered
  `refs`; `branchEdges` keeps each `ref` with `label` present-when-present / absent-when-omitted (never a
  phantom empty string); `arcRef` is the `asset:<id>` string
  (`lte-agent-steprefs-surface`, `lte-process-branchedges-surface`, `lte-plan-arcref-surface`).
- **The leaf authors NO edge data** — this increment wires the FIELDS that already exist on the schema;
  populating `stepRefs` / `branchEdges` / `arcRef` values ONTO artifacts stays librarian curation, out of
  scope. The leaf proves the surfacing over literal fixtures, touching no corpus / seed / live store.
- **Machine-only — no look leg, no operator-attested UAT leg** — this capability is pure data on the
  wire; nothing renders differently until inc-9 draws with the edges. Do NOT author a visual / colour /
  stroke / pixel / animation assertion, and do NOT frame any part of it as owner-witnessed (contrast the
  sibling `library-overview`, whose appearance is UAT leg 5 — this one has none, exactly like inc-6
  `library-adr-wire-signals`). The whole proof is machine-witnessed pure logic.
- **The carry-through + the draw are after-pass glue, out of the `real:` scope** — the leaf edits
  `render-doc.ts` + `render-doc.test.ts` ONLY; the `libraryBackend.ts` `toGuidanceAsset` carry-through,
  the `types.ts` `GuidanceAsset` additions, and the `node-build.test.ts` snapshot insert are the
  orchestrator's supplement glue after PASS — the leaf must NOT edit them or any signed inc-1..6 source.
- **Every `lte-` test title carries a unique id, verbatim** — coverage scans only `real.testFile` and
  silently drops N-1/N on a shared / dropped / renamed id (the recurring
  `sdk-leaf-drops-contract-id-test-names` /
  `friction-leaf-duplicate-contract-id-silently-drops-coverage` class, 4× on this arc); the fix is
  TEST-TITLE-ONLY — 5 distinctly-titled `test(...)`, each leading with its exact `lte-…` id above, so
  coverage reports 5/5.
