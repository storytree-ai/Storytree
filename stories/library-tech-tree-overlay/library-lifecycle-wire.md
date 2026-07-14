---
id: "library-lifecycle-wire"
tier: capability
story: library-tech-tree-overlay
title: "One pure, browser-safe lifecycle projection `lifecycleOf(kind, doc) → open | active | archived` in @storytree/library (root barrel, no node: imports) maps every stored per-kind vocabulary onto ADR-0196's universal triad; AND `renderStoredDoc` serializes a plan doc's `status` onto the GuidanceAsset wire (mirroring arcRef) so the studio can project plan lifecycle. MACHINE-ONLY, no look leg."
outcome: "A single pure projection `lifecycleOf` lives in `packages/library/src/lifecycle.ts` and is re-exported from the `@storytree/library` root barrel (browser-safe — NO `node:`/`pg`/`fs` import, so the studio keeps bundling the barrel). Given a kind + the doc's lifecycle-bearing fields it returns exactly one of `open` | `active` | `archived` (ADR-0196 D1): a `friction` with no `route` → open / any `route` (adr|tool|principle|guardrail|process|definition|edit-existing|nothing) → archived; a `plan` `status` draft → open / ready → active / consumed|superseded|retired → archived; an `adr` frontmatter status proposed → open / accepted → active / superseded → archived; `open-question`/`proposal` → open; `arc` → active; every durable kind (definition, principle, pattern, guardrail, techstack, process, agent, template) → active (D2: an explicit closed-state WRITE lands only when a surface needs it — this projection never invents an absent state). AND `renderStoredDoc` (`packages/library/src/store/render-doc.ts`) reads a `plan` doc's `status` off the parsed `knowledge` object on the FINAL structured branch and spreads it onto the `RenderedAsset` — spread-when-present / absent-by-default (undefined, never a phantom value), exactly the `arcRef` idiom already there; every non-plan structured doc, and the pass-through/degraded branches, carry NO `status`. This is INVISIBLE PLUMBING + a pure projection — NO look leg, NO operator-attested UAT leg (contrast the sibling `library-lifecycle-shelf`, whose Active|All toggle appearance is operator-attested). The per-kind mapping, the browser-safe barrel export, the plan-status wire crossing, and the undefined-by-absence back-compat are all machine-witnessed."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [196, 188, 183, 168]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (editsExisting: true): the wire
# adapter `renderStoredDoc` ALREADY exists (packages/library/src/store/render-doc.ts) and already
# spreads `arcRef` on the structured branch — the leaf ADDS the parallel `status` read there. The pure
# projection `packages/library/src/lifecycle.ts` is NET-NEW: its own import is module-not-found until
# authored, which the same failing run subsumes (the `library-category-shelf` net-new-`libraryShelf.ts`
# precedent). real.sourceFile picks ONE representative — the EXISTING edited render-doc.ts (editsExisting
# means the sourceFile exists at HEAD); real.scope.sourceGlobs names BOTH the reworked adapter AND the
# net-new lifecycle.ts (the multi-sourceGlob precedent from library-category-shelf). real.testFile is a
# NET-NEW `packages/library/src/lifecycle.test.ts` holding EVERY `llw-` contract (coverage scans ONE file).
#
# CRITICAL — the RED must be a RUNTIME behaviour, not type-only. The proof runs under tsx (`node --import
# tsx --test`), which strips types WITHOUT typechecking — so ADDING an optional `status?` to RenderedAsset
# alone produces NO runtime failure. The legitimate observed reds are: (a) `import { lifecycleOf }` is
# module-not-found (net-new lifecycle.ts) at HEAD; (b) the fixture-driven `assert.equal(rendered.status, …)`
# on a stored plan doc FAILS at HEAD because render-doc.ts does not read `knowledge.status` yet. Author
# every assertion as a VALUE check over the returned object / the projection's return, never as a type check
# (the `library-typed-edges` block-position-comment-anchor runtime-witness precedent).
#
# install: true + a typecheck wall — the suite imports the package's own types across modules and the proof
# runs in a fresh worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2). SINGLE node:test file
# (no `*`), so the default node:test proof on the one file is legal — NO proofCommand (the @storytree/library
# suite is node:test, NOT vitest, unlike the studio-side sibling library-lifecycle-shelf; the
# block-position-comment-anchor precedent).
#
# MACHINE-ONLY: this cap is a pure projection + pure DATA on the wire — NO look leg, NO operator-attested UAT
# leg (exactly like inc-6 library-adr-wire-signals and inc-7 library-typed-edges; contrast the sibling
# library-lifecycle-shelf whose Active|All toggle appearance IS operator-attested). The `toGuidanceAsset`
# carry-through of plan `status` (apps/studio/server/libraryBackend.ts), the `GuidanceAsset.status?` type
# mirror (apps/studio/src/types.ts), the CLI's friction-lifecycle.ts becoming a consumer/re-export (ADR-0196
# D3), and the node-build.test.ts snapshot insert are AFTER-PASS SUPPLEMENT GLUE — explicitly OUT of the
# leaf's `real:` scope (lifecycle.ts + render-doc.ts + lifecycle.test.ts ONLY). The leaf must NOT edit
# libraryBackend.ts, types.ts, friction-lifecycle.ts, or any signed source.
#
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `llw-`-named contract test
# lives in this ONE file (packages/library/src/lifecycle.test.ts). Its TITLE must carry the unique `llw-` id
# verbatim or coverage silently drops N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` —
# this arc's recurring class; the fix if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/**/*.ts"]
  real:
    editsExisting: true
    testFile: "packages/library/src/lifecycle.test.ts"
    sourceFile: "packages/library/src/store/render-doc.ts"
    scope:
      testGlobs: ["packages/library/src/lifecycle.test.ts"]
      sourceGlobs:
        - "packages/library/src/lifecycle.ts"
        - "packages/library/src/store/render-doc.ts"
        # The barrel re-export IS in scope: llw-lifecycleof-exported-and-browser-safe covers
        # index.ts (`export * from "./lifecycle.js"`), so the write fence must admit it — the
        # first real run failed closed at CONFIRM_GREEN with three scope-wall hits on exactly
        # this file (run real-mrkq0bfp, 2026-07-15).
        - "packages/library/src/index.ts"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
    # real.scope.sourceGlobs names TWO edited source files (the net-new lifecycle.ts + the reworked
    # render-doc.ts), broader than the single literal `sourceFile` — so the spec MUST declare a
    # real.proofCommand (a suite that exercises the edited code), not lean on the default single-file
    # node:test. The @storytree/library `test` suite (`node --import tsx --test "src/**/*.test.ts"`)
    # runs lifecycle.test.ts — which imports BOTH lifecycle.ts and ./store/render-doc.js — so the
    # RED/GREEN it observes spans both edited files. Still node:test (NOT vitest, unlike the studio
    # sibling); coverage scans only real.testFile regardless.
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
---

# The unified lifecycle projection + the plan-status wire (machine-only plumbing)

**Outcome —** One pure, browser-safe projection `lifecycleOf(kind, doc) → open | active | archived` lives in
`packages/library/src/lifecycle.ts` and is re-exported from the `@storytree/library` root barrel (the barrel
the studio bundles — so `lifecycle.ts` carries **NO `node:`/`pg`/`fs` import**). It maps every stored per-kind
vocabulary onto ADR-0196's universal triad (D1): `friction` no `route` → open / any `route` → archived; `plan`
`status` draft → open / ready → active / consumed|superseded|retired → archived; `adr` status proposed → open /
accepted → active / superseded → archived; `open-question`/`proposal` → open; `arc` → active; every durable
kind → active. **AND** `renderStoredDoc` (`packages/library/src/store/render-doc.ts`) serializes a `plan` doc's
`status` onto the `GuidanceAsset` wire — read off the parsed `knowledge` object on the FINAL structured branch
and spread-when-present / absent-by-default, exactly the `arcRef` idiom already there — so the studio can
project plan lifecycle. This is **INVISIBLE PLUMBING + a pure projection** — **NO look leg, NO operator-attested
UAT leg** (the sibling `library-lifecycle-shelf` owns the operator-attested Active|All toggle appearance). Every
behaviour here is machine-witnessed.

**Depends on —** [`library-finder`](library-finder.md). This is the arc's shared foundational SEQUENCING anchor
every overlay increment cites (incs 2–12 anchored on it) — **not a hard code edge**. `lifecycleOf` is a
standalone pure function over a kind + a `{ route?, status? }` shape, and `renderStoredDoc` is a standalone pure
adapter over a `StoredDoc`; neither imports the finder. The `depends_on` records this increment's place in the
`library-tech-tree-overlay` arc ordering (the finder established the studio's library backend seam these overlay
increments extend), consistent with how `library-typed-edges` (inc 7) anchored on the same finder. This
capability's `real:` red→green surface is `lifecycle.ts` + `render-doc.ts` + `lifecycle.test.ts` only.

> **Proof status (honest) — `proposed`, EDITS-EXISTING.** `renderStoredDoc` and its structured-branch `arcRef`
> spread EXIST at HEAD; the leaf ADDS the parallel `status` read beside them. `packages/library/src/lifecycle.ts`
> is NET-NEW — its `lifecycleOf` import is module-not-found until authored, subsumed by the same failing run
> (the `library-category-shelf` net-new-`libraryShelf.ts` precedent). New `llw-` assertions in the NET-NEW
> `packages/library/src/lifecycle.test.ts` call the real `lifecycleOf` over literal kind+field fixtures and the
> real `renderStoredDoc(stored)` over a literal plan `StoredDoc`, asserting VALUES — RED at HEAD (the module is
> absent; `rendered.status` is `undefined`), GREEN once `lifecycle.ts` is authored, re-exported from the barrel,
> and `render-doc.ts` reads `knowledge.status` on the structured branch. The whole cap is machine-witnessed —
> NO look leg and NO operator-attested UAT leg this increment (exactly like inc-6 `library-adr-wire-signals` /
> inc-7 `library-typed-edges`). Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts
> (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the UNIVERSAL LIFECYCLE PROJECTION AS A WHOLE — a
coherent mapping that spans four distinct stored vocabularies (friction `route`, plan `status`, adr status, and
the stateless-kind defaults), the browser-safe barrel surfacing the studio bundles, AND the plan-`status` wire
crossing that lets the studio project the one vocabulary that does NOT already ride the wire. That is a coherent
behavioural surface (6 contracts) proven by one pure module + one adapter read, not a single assertion. It is
the projection HALF of ADR-0196 D3; the studio shelf that DRAWS the projection is the sibling
`library-lifecycle-shelf`.

MACHINE-ONLY — THERE IS NO LOOK LEG. This capability puts a pure projection in the barrel and pure DATA on the
wire. Unlike the sibling `library-lifecycle-shelf` (whose Active|All toggle + state-chip appearance is the
story's operator-attested UAT leg, ADR-0070), this increment has **NO appearance to witness and NO
operator-attested UAT leg** — exactly like inc-6 `library-adr-wire-signals` and inc-7 `library-typed-edges`. Do
NOT author any visual / colour / stroke / pixel / animation assertion, and do NOT frame any part of this as
owner-witnessed — the whole proof is machine-witnessed pure logic over literal fixtures.

THE PROJECTION IS PURE AND BROWSER-SAFE — IT LIVES IN THE ROOT BARREL, NOT THE `store/` SUBPATH. `lifecycleOf`
is the single place ADR-0196's mapping lives (D4: "any new stateful kind MUST route through it — a second
ad-hoc status surface is the failure mode this ADR exists to end"). Author it in `packages/library/src/lifecycle.ts`
with a signature like `lifecycleOf(kind: string, doc: { route?: string | null; status?: string | null }):
Lifecycle` (`Lifecycle = 'open' | 'active' | 'archived'`), re-export it from the root barrel
(`packages/library/src/index.ts`, `export * from "./lifecycle.js"`), and keep the module **browser-safe** — NO
`node:` / `pg` / `fs` import, because the studio bundles the root barrel (the barrel's own header invariant:
"Pure zod, browser-safe: no `node:` imports in this entry"). It reads ONLY the kind + the two lifecycle-bearing
fields — it must NOT import the studio's `GuidanceAsset`/`DocMeta` types (the studio ADAPTS by calling it with
`fields.route` / the wire `status` / `DocMeta.status`); the projection owns the mapping, not the wire shape. Pin
the browser-safe barrel export in `llw-lifecycleof-exported-and-browser-safe`.

THE PER-KIND MAPPING IS ADR-0196 D1 VERBATIM — NO INVENTED CLOSED STATES. Branch on `kind`:

- `friction` — `route` present (any of the closed `FrictionRoute` set, INCLUDING the `nothing` tombstone) →
  `archived`; no/empty `route` → `open`. Friction is NEVER `active` (D1: "— (never load-bearing)"). This collapses
  ADR-0168 D2's `routed` and `archived` into `archived` (D2: both are "dealt with"; `route` stays the audit
  detail).
- `plan` — `status` `draft` → `open`, `ready` → `active`, `consumed`/`superseded`/`retired` → `archived` (D2:
  the five stored states stay STORED; the projection is the display path).
- `adr` — status `proposed` → `open`, `accepted` → `active`, `superseded` → `archived` (D2: the ADR frontmatter
  vocabulary is DECLARED the ADR-local spelling of the universal triad; `proposed` is the owner-ratification
  inbox = `open`).
- `open-question` / `proposal` → `open` (unanswered / under consideration).
- `arc` → `active` (in flight). D2: an arc's CLOSED-state write lands only when a surface needs to WRITE the
  transition — this projection returns the in-flight default and NEVER invents an `archived` an absent field
  can't witness.
- durable kinds — `definition`, `principle`, `pattern`, `guardrail`, `techstack`, `process`, `agent`, `template`
  → `active` (the evergreen default; soft-retire is a future WRITE, not a projected state).

Pin friction+plan in `llw-friction-and-plan-project-lifecycle`, adr+defaults in `llw-adr-and-defaults-project-lifecycle`.
Return the in-flight/active default for any unrecognised kind — never throw (a projection over a corpus that
grows kinds must degrade to `active`, never crash a shelf).

THE PLAN-`status` WIRE CROSSING RIDES THE STRUCTURED BRANCH ONLY (render-doc.ts, beside the `arcRef` spread).
`plan`'s `status` is `.extend()` schema metadata (like `arcRef` — NOT a KIND_SPECS body field), so `extractFields`
never surfaces it; it falls on the floor at the wire boundary today. THIS is the gap. Add a typed read of
`knowledge.status` in the FINAL structured `knowledge` return (`render-doc.ts` ~L232–256, right beside the
existing `...(typeof typedEdges.arcRef === "string" && typedEdges.arcRef ? { arcRef: … } : {})`), spread onto the
returned `RenderedAsset` ONLY when present — a fresh optional `status?: string` on `RenderedAsset`. The
pass-through (body-bearing) and degraded (unknown-kind / newer-schemaVersion) branches carry NONE of it and NEVER
throw — the surfacing rides only the faithfully-parsed structured branch (the `arcRef` precedent exactly). Do
NOT touch `extractFields` (it stays KIND_SPECS-only) and do NOT add `status` to KIND_SPECS. Pin the crossing in
`llw-plan-status-crosses-the-wire`, the absence in `llw-non-plan-docs-carry-no-status`.

SPREAD-WHEN-PRESENT / ABSENT-BY-DEFAULT (the back-compat idiom). `status` is OPTIONAL on `RenderedAsset` and is
spread onto the returned object ONLY when present on `knowledge` — mirroring the existing `arcRef` /
`provenance?` idiom. A `plan` with no `status` (the schema defaults it to `draft`, but a hand-built fixture may
omit it) and every non-plan structured kind omit `status` on the wire — `undefined` by absence, never a phantom
value. Pure enrichment: NO migration, NO `CURRENT_SCHEMA_VERSION` bump, every existing structured doc
round-trips unchanged.

THE CLI'S `friction-lifecycle.ts` RE-EXPORT IS AFTER-PASS GLUE, OUT OF THE `real:` SCOPE (ADR-0196 D3). D3 says
"the CLI's `friction-lifecycle.ts` becomes a consumer/re-export" of the new `lifecycleOf`, and "the drain
ceiling's counting is untouched." That reconciliation (the CLI's `lifecycleOf(route)` friction helper folding
onto the universal `lifecycleOf`, keeping the drain gate's `open`-only counting intact) is the orchestrator's
supplement glue AFTER this leaf's PASS — the leaf must NOT edit `packages/cli/src/friction-lifecycle.ts`,
`friction.ts`, or `friction-drain.ts`. The leaf proves the projection in isolation over literal fixtures.

OFFLINE-TESTABLE, NODE:TEST (no DB, no vitest). Both `lifecycle.ts` and `render-doc.ts` are pure functions; the
existing `render-doc.test.ts` is `node:test` + `node:assert/strict` (the `@storytree/library` package
convention — NOT vitest, unlike the studio-side sibling `library-lifecycle-shelf`). Every new `llw-` assertion
runs offline over literal fixtures the test constructs — NO store, NO clock, NO DB, NO socket. The test imports
`lifecycleOf` from `./index.js` (the barrel, to prove the browser-safe re-export) and/or `./lifecycle.js`, and
`renderStoredDoc` from `./store/render-doc.js`.

COVERAGE — EVERY `llw-` TEST TITLE CARRIES A UNIQUE ID (the coverage-drop trap). Per ADR-0122,
`storytree coverage` scans ONLY `real.testFile`, so all 6 `llw-` contract tests live in the ONE file
`packages/library/src/lifecycle.test.ts`, each an isolated `node:test` `test(...)` whose title LEADS with its
exact `llw-…` id below, verbatim. **Trap — this class has recurred on THIS arc
(`sdk-leaf-drops-contract-id-test-names`, the invent → duplicate → rename pattern):** if two test titles share
(or drop, or rename) a contract id, coverage silently reports N-1/N. The fix is **TEST-TITLE-ONLY** — give each
of the 6 `test(...)` a distinct title leading with its exact `llw-…` id, verbatim. Do NOT invent new ids, do NOT
rename these, do NOT collapse two contracts into one test.

## Integration test

**Goal —** Prove the universal lifecycle projection + the plan-`status` wire crossing: `lifecycleOf(kind, doc)`
maps friction `route`, plan `status`, adr status, and the stateless-kind defaults onto exactly one of
`open`/`active`/`archived` (ADR-0196 D1); it is importable from the `@storytree/library` root barrel and its
module is browser-safe (no `node:`/`pg`/`fs` import); and `renderStoredDoc(stored)` reads a plan doc's `status`
off the faithfully-parsed structured branch and spreads it onto the returned `RenderedAsset`, while every
non-plan structured doc and the pass-through/degraded branches carry NONE of it — never throwing. Entirely pure,
over literal fixtures, under `node:test`.

The integration test exercises this capability against its own composition (no backend seam) — the pure
projection and the pure adapter are the whole surface. The RED it observes is RUNTIME (the tsx runner strips
types without typechecking): the `lifecycleOf` import is module-not-found at HEAD, and the `rendered.status`
VALUE is `undefined` at HEAD. It would:

1. Call `lifecycleOf('friction', { route: undefined })` → `'open'`; `lifecycleOf('friction', { route: 'tool' })`
   and `lifecycleOf('friction', { route: 'nothing' })` → `'archived'` (any route, tombstone included). Then
   `lifecycleOf('plan', { status: 'draft' })` → `'open'`, `'ready'` → `'active'`, `'consumed'`/`'superseded'`/
   `'retired'` → `'archived'`.
2. Call `lifecycleOf('adr', { status: 'proposed' })` → `'open'`, `'accepted'` → `'active'`, `'superseded'` →
   `'archived'`; `lifecycleOf('open-question', {})` and `lifecycleOf('proposal', {})` → `'open'`;
   `lifecycleOf('arc', {})` → `'active'`; and each durable kind (`definition`, `principle`, `pattern`,
   `guardrail`, `techstack`, `process`, `agent`, `template`) → `'active'`.
3. Import `{ lifecycleOf }` from `./index.js` (the root barrel) and assert it is a function that projects a
   sample correctly; read the `lifecycle.ts` source text and assert it contains NO `node:` / `pg` / `fs` import
   specifier (the browser-safe witness the studio bundle depends on).
4. Construct a stored `plan` doc carrying `status: 'ready'`, call `renderStoredDoc(stored)`, and assert
   `rendered.status === 'ready'` (the wire crossing). FAILS at HEAD (`rendered.status === undefined`).
5. Construct (a) a non-plan structured doc (a `principle`) and (b) a body-bearing pass-through doc and (c) a
   degraded (unknown-kind) doc, call `renderStoredDoc` on each, and assert NONE carries `status` (undefined) and
   that no call throws — the crossing rides ONLY the faithfully-parsed structured plan branch.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `@storytree/library` suite
(`node:test` + `node:assert/strict`, `packages/library/src/lifecycle.test.ts`), no DB. Per ADR-0122
(`storytree coverage`) each contract id LEADS a distinctly-named test, so the coverage check reports 6/6 against
the ONE `real.testFile`. None of these is an APPEARANCE assertion — this capability is machine-only plumbing with
NO look leg and NO operator-attested UAT leg. **Use these exact ids verbatim as the authoritative list (the
coverage-drop trap — do NOT rename, drop, or merge any).**

1. **`llw-friction-and-plan-project-lifecycle`** — friction `route` and plan `status` project onto the universal triad
   - **asserts —** `lifecycleOf('friction', { route })` returns `'open'` for no/empty route and `'archived'` for
     ANY route in the closed set (`adr`/`tool`/`principle`/`guardrail`/`process`/`definition`/`edit-existing`/
     `nothing`, tombstone included) — never `'active'`; and `lifecycleOf('plan', { status })` returns `'open'`
     for `draft`, `'active'` for `ready`, `'archived'` for each of `consumed`/`superseded`/`retired` (ADR-0196
     D1/D2).
   - **covers —** `packages/library/src/lifecycle.ts` (the friction + plan branches)
   - **proven by —** `packages/library/src/lifecycle.test.ts` (net-new, node:test; imports `lifecycleOf`).
2. **`llw-adr-and-defaults-project-lifecycle`** — adr status + the stateless-kind defaults project onto the triad; unknown kinds degrade to active
   - **asserts —** `lifecycleOf('adr', { status })` returns `'open'`/`'active'`/`'archived'` for `proposed`/
     `accepted`/`superseded`; `open-question` and `proposal` → `'open'`; `arc` → `'active'`; every durable kind
     (`definition`, `principle`, `pattern`, `guardrail`, `techstack`, `process`, `agent`, `template`) →
     `'active'`; and an unrecognised kind returns `'active'` (never throws). ADR-0196 D1: absent states are never
     invented.
   - **covers —** `packages/library/src/lifecycle.ts` (the adr + default branches)
   - **proven by —** `packages/library/src/lifecycle.test.ts`.
3. **`llw-lifecycleof-exported-and-browser-safe`** — `lifecycleOf` is re-exported from the `@storytree/library` root barrel and its module carries no node import
   - **asserts —** `import { lifecycleOf } from "./index.js"` resolves to a function that projects a sample kind
     correctly (the root barrel re-exports it, so the browser bundle can consume it); AND the `lifecycle.ts`
     source text contains NO `node:` / `pg` / `fs` import specifier (the browser-safe invariant the studio bundle
     depends on — the barrel's "no `node:` imports in this entry" header).
   - **covers —** `packages/library/src/lifecycle.ts` + `packages/library/src/index.ts` (the barrel re-export, browser-safe)
   - **proven by —** `packages/library/src/lifecycle.test.ts`.
4. **`llw-plan-status-crosses-the-wire`** — a stored plan doc surfaces `status` on the RenderedAsset (structured branch)
   - **asserts —** `renderStoredDoc(stored)` over a structured `plan` doc carrying `status: 'ready'` returns a
     `RenderedAsset` whose `status === 'ready'` (the required plan-lifecycle wire crossing). At HEAD
     `rendered.status` is `undefined` (not surfaced), so the value assertion FAILS — the runtime witness for a
     field the tsx (no-typecheck) runner would not otherwise observe.
   - **covers —** `packages/library/src/store/render-doc.ts` (the structured branch's typed read of `knowledge.status`, spread onto `RenderedAsset`)
   - **proven by —** `packages/library/src/lifecycle.test.ts` (imports `renderStoredDoc` by `./store/render-doc.js`).
5. **`llw-non-plan-docs-carry-no-status`** — a non-plan structured doc omits `status` (undefined, spread-when-present idiom)
   - **asserts —** `renderStoredDoc` over a non-plan structured doc (a `principle`) returns a `RenderedAsset`
     where `status` is `undefined` — omitted by absence, never a phantom value; the spread-when-present /
     absent-by-default back-compat idiom (the `arcRef` precedent).
   - **covers —** `packages/library/src/store/render-doc.ts` (the conditional spread — a doc without `status` omits it)
   - **proven by —** `packages/library/src/lifecycle.test.ts`.
6. **`llw-passthrough-and-degraded-carry-no-status`** — a body-bearing pass-through doc AND a degraded/unknown-kind doc both carry no `status` and never throw
   - **asserts —** `renderStoredDoc` over (a) a body-bearing pass-through doc (a `template-*` / rendered asset
     with a string `body`) and (b) a degraded doc (an unknown kind that hits the `degradeReason` branch) returns
     a `RenderedAsset` carrying NO `status`, and NEITHER call throws — the crossing rides ONLY the
     faithfully-parsed structured branch.
   - **covers —** `packages/library/src/store/render-doc.ts` (the pass-through + degraded branches carry no `status`)
   - **proven by —** `packages/library/src/lifecycle.test.ts`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, EDITS-EXISTING): author the pure projection, re-export it
browser-safe, and cross plan `status` onto the wire — test-first.

- **The new test —** `packages/library/src/lifecycle.test.ts` (`node:test` + `node:assert/strict`, the package
  convention). Import `{ lifecycleOf }` from `"./index.js"` (the barrel, to prove the browser-safe re-export) and
  `{ renderStoredDoc }` from `"./store/render-doc.js"`, and ADD the 6 `llw-` assertions above, each over literal
  fixtures the test constructs. Name each test for its contract id (`llw-…`) so
  `storytree coverage library-lifecycle-wire` reports 6/6 (ADR-0122) — all 6 contracts live in THIS one file.
- **The RED the spine observes (before IMPLEMENT) —** (a) `import { lifecycleOf }` is module-not-found at HEAD
  (net-new `lifecycle.ts`); (b) the `rendered.status` VALUE is `undefined` at HEAD because `renderStoredDoc` does
  not read `knowledge.status` yet. A RUNTIME WITNESS is required here, not optional: the proof runs under tsx
  (`node --import tsx --test`), which strips types WITHOUT typechecking, so ADDING the optional `status?` field to
  `RenderedAsset` alone produces no runtime failure — author the assertions as VALUE checks over the returned
  object / the projection's return, never as a type check (the `library-typed-edges` runtime-witness precedent).
- **The GREEN —** (1) author `packages/library/src/lifecycle.ts` with `lifecycleOf(kind, doc)` mapping per
  ADR-0196 D1 (friction/plan/adr/defaults), browser-safe (no `node:`/`pg`/`fs`); (2) re-export it from
  `packages/library/src/index.ts` (`export * from "./lifecycle.js"`); (3) in `render-doc.ts`, add the optional
  `status?: string` to `RenderedAsset` and, in the FINAL structured `knowledge` return (~L238–256, beside the
  `arcRef` spread), read `knowledge.status` off the typed object and spread it ONLY when present — mirroring
  `...(typeof typedEdges.arcRef === "string" && typedEdges.arcRef ? { arcRef } : {})`. Do NOT touch
  `extractFields`, do NOT add `status` to KIND_SPECS, and do NOT surface it on the pass-through or degraded
  branches. After it, the assertions hold and `pnpm --filter @storytree/library test` +
  `pnpm --filter @storytree/library typecheck` stay green.

The `toGuidanceAsset` carry-through of plan `status` (`apps/studio/server/libraryBackend.ts`), the
`GuidanceAsset.status?` type mirror (`apps/studio/src/types.ts`), the CLI's `friction-lifecycle.ts` becoming a
consumer/re-export (ADR-0196 D3), and the `node-build.test.ts` snapshot insert are AFTER-PASS SUPPLEMENT GLUE —
explicitly OUT of the leaf's `real:` scope (which is `lifecycle.ts` + `render-doc.ts` + `lifecycle.test.ts`
only). The leaf must NOT edit `libraryBackend.ts`, `types.ts`, `friction-lifecycle.ts`, or any signed source.

Rules:

- **The projection is pure + browser-safe + barrel-exported — the mapping's SINGLE home** — author `lifecycleOf`
  in `packages/library/src/lifecycle.ts` (no `node:`/`pg`/`fs`), re-export from the root barrel; any new stateful
  kind routes through it (ADR-0196 D4 — a second ad-hoc status surface is the failure this ADR ends)
  (`llw-lifecycleof-exported-and-browser-safe`).
- **The per-kind mapping is ADR-0196 D1 verbatim — no invented closed states** — friction (route → open/archived,
  never active), plan (draft/ready/consumed|superseded|retired), adr (proposed/accepted/superseded),
  open-question/proposal → open, arc → active, durable kinds → active; an unrecognised kind degrades to `active`,
  never throws (`llw-friction-and-plan-project-lifecycle`, `llw-adr-and-defaults-project-lifecycle`).
- **Plan `status` crosses the wire on the structured branch only, spread-when-present** — read `knowledge.status`
  beside the `arcRef` spread; the pass-through and degraded branches carry NONE and never throw; a non-plan doc
  omits it (undefined, never a phantom); NO migration, NO `CURRENT_SCHEMA_VERSION` bump, NOT via `extractFields`
  / KIND_SPECS (`llw-plan-status-crosses-the-wire`, `llw-non-plan-docs-carry-no-status`,
  `llw-passthrough-and-degraded-carry-no-status`).
- **The projection owns the mapping, not the wire shape** — `lifecycleOf` reads only `kind` + `{ route?, status? }`;
  it must NOT import the studio's `GuidanceAsset`/`DocMeta` types (the studio ADAPTS by calling it with
  `fields.route` / the wire `status` / `DocMeta.status`).
- **Machine-only — no look leg, no operator-attested UAT leg** — this capability is a pure projection + pure data
  on the wire; do NOT author a visual / colour / stroke / pixel / animation assertion, and do NOT frame any part
  of it as owner-witnessed (contrast the sibling `library-lifecycle-shelf`, whose Active|All toggle appearance IS
  operator-attested — this one has none, exactly like inc-6 `library-adr-wire-signals` / inc-7
  `library-typed-edges`).
- **The CLI re-export + the studio carry-through + the type mirror are after-pass glue, out of the `real:` scope**
  — the leaf edits `lifecycle.ts` + `render-doc.ts` + `lifecycle.test.ts` ONLY; the `friction-lifecycle.ts`
  re-export (ADR-0196 D3), the `libraryBackend.ts` `toGuidanceAsset` carry-through, the `types.ts`
  `GuidanceAsset.status?` mirror, and the `node-build.test.ts` snapshot insert are the orchestrator's supplement
  glue after PASS — the leaf must NOT edit them or any signed source.
- **Every `llw-` test title carries a unique id, verbatim** — coverage scans only `real.testFile` and silently
  drops N-1/N on a shared / dropped / renamed id (the recurring `sdk-leaf-drops-contract-id-test-names` class on
  this arc); the fix is TEST-TITLE-ONLY — 6 distinctly-titled `test(...)`, each leading with its exact `llw-…`
  id above, so coverage reports 6/6.
