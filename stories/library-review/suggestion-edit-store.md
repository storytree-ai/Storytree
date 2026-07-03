---
id: "suggestion-edit-store"
tier: capability
story: library-review
title: "A proposed edit persists as a suggestion record with an open/accepted/rejected status"
outcome: "A proposed edit persists as a suggestion record — author, topic, the targeted block, the proposed replacement, and the original it replaces — with a status `open`/`accepted`/`rejected`, through a validated event-sourced store boundary, and the pure status-transition helper enforces open→accepted / open→rejected and refuses re-deciding a closed suggestion."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable. NET-NEW (R2, no editsExisting): the leaf authors a NEW source file
# packages/library/src/store/pg-suggestion-store.ts (the event+projection store, mirroring
# pg-comment-store.ts) and a NEW node:test file pg-suggestion-store.test.ts. The RED the spine observes
# is a module-not-found / missing-symbol red: the test imports `applySuggestionTransition` /
# `mergeSuggestionPatch` / `PgSuggestionStore` from a source file that does not exist at HEAD (the
# net-new red, ADR-0057). The pure transition + merge helpers run OFFLINE (no DB), exactly the
# pg-comment-store discipline (pure helpers tested in-suite; live SQL human-verified behind
# STORYTREE_DB_LIVE).
#
# install: true + a typecheck wall — the new module imports the package's zod types across modules and
# the proof runs in a fresh worktree (ADR-0031 §2). SINGLE LITERAL test file → the default node:test
# proof on the one file is legal (the @storytree/library suite is node:test, not vitest); no
# proofCommand.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/store/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/store/**/*.ts"]
  real:
    testFile: "packages/library/src/store/pg-suggestion-store.test.ts"
    sourceFile: "packages/library/src/store/pg-suggestion-store.ts"
    scope:
      testGlobs: ["packages/library/src/store/pg-suggestion-store.test.ts"]
      sourceGlobs: ["packages/library/src/store/pg-suggestion-store.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# A proposed edit persists as a suggestion record with an open/accepted/rejected status

**Outcome —** A proposed edit persists as a suggestion record — author, topic, the targeted block, the
proposed replacement, and the original it replaces — with a status `open`/`accepted`/`rejected`,
through a validated event-sourced store boundary, and the pure status-transition helper enforces
open→accepted / open→rejected and refuses re-deciding a closed suggestion.

**Depends on —** (root — no within-story upstream)

> **Proof status (honest) — BUILT via the prove-it-gate (run `real-mr24u2mt`, signed PASS, verdict
> @ `d597d36`, an ancestor of main; coverage 4/4).** The leaf authored
> `packages/library/src/store/pg-suggestion-store.ts` exactly as specified: the fail-closed
> `SuggestionSchema` zod boundary (`:25-40`, applied at `create` via `SuggestionSchema.parse`,
> `:152`), the pure `applySuggestionTransition` state machine (`:61` — open→accepted/rejected,
> closed refuses re-decision), the pure `mergeSuggestionPatch` (`:89`, the `mergeCommentPatch`
> invariants), and the `PgSuggestionStore` event+projection class (`:119`, mirroring
> `PgCommentStore`). The `ses-*` contract tests run in `pg-suggestion-store.test.ts` (node:test,
> offline; live SQL stays behind `STORYTREE_DB_LIVE`). Frontmatter stays `proposed` — status is
> earned through the rollup (the house convention).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: it is a cohesive new store — the suggestion record schema,
the pure status-transition state machine that guards open→accepted / open→rejected, the pure patch
merge, and the event-sourced persistence surface — proven by integration over its pure surface against
real suggestion records (a directory of mixed statuses), not a single isolated assertion. It is the
DATA half of the suggestions-as-proposals model; the accept/reject ROUTE that drives the transitions
over HTTP is the separate `accept-reject-suggestion-api` cap, and the rendering is `collapsed-suggestion-view`.

WHY A SEPARATE STORE FROM COMMENTS (the splitting-rule, ADR-0010). A suggestion is NOT a comment: it
carries a proposed replacement + the original + a three-state status with owner/admin-gated
transitions, where a comment carries a body + a resolved boolean. The outcomes differ (a proposal to
apply vs a thread post) and the status models differ (open/accepted/rejected vs resolved), so they are
two records in two stores, not one combined "review-event" store (the story's open call #2, recorded).

THE SUGGESTION RECORD SHAPE (the model — ADR-0140). A suggestion is the house JSONB doc stored
verbatim (mirror `pg-comment-store`): `{ id, topicKind: 'doc'|'asset', topicId, block: <handle>,
proposed: <string>, original: <string>, status: 'open'|'accepted'|'rejected', author, createdAt,
decidedBy: string|null, decidedAt: string|null }`. `block` is the same block handle the comment anchor
uses (cap 1) — a suggestion targets a block. `proposed` is the replacement prose; `original` is enough
of the replaced prose to render the collapsed "show change" view (cap 8). `decidedBy`/`decidedAt` are
stamped on accept/reject.

THE STATUS STATE MACHINE IS PURE (the testable core). `applySuggestionTransition(current, action)`
where `action` is `accept` | `reject`: from `open` it returns `accepted` / `rejected` (stamping the
decider/timestamp the caller supplies); from a CLOSED status (`accepted`/`rejected`) it REFUSES (a
loud throw / a typed refusal) — a closed suggestion cannot be re-decided. This pure function is the
oracle the route (cap 3) calls; pinning it here (offline) keeps the transition logic provable without a
DB or HTTP.

VALIDATE AT THE WRITE BOUNDARY (the house discipline). The store validates the suggestion doc at its
write boundary (a zod schema, fail-closed on a blank author / unknown status / missing
proposed/block), exactly as the library docs are validated (`validateLibraryDoc`) and the user docs are
(`User.parse`). A bogus status (`'merged'`) or a blank `proposed` is refused, not persisted.

OFFLINE-TESTABLE BY THE PURE SURFACE. Every assertion runs over `applySuggestionTransition`,
`mergeSuggestionPatch`, the suggestion schema's `.parse`, and `new PgSuggestionStore({} as Pool)`
(constructor issues no SQL) — no store, no clock, no DB. The live SQL (list/create/transition over
`events.suggestion*`) stays human-verified behind `STORYTREE_DB_LIVE`, the `pg-comment-store` pattern.

## Integration test

**Goal —** Prove that a proposed edit persists as a validated suggestion record with a three-state
status, that the pure transition machine drives open→accepted / open→rejected and refuses re-deciding a
closed one, and that a malformed suggestion is refused at the write boundary — all over the pure
surface, no DB.

The integration test exercises this capability against its **real in-store collaborators** — the real
suggestion schema + `applySuggestionTransition` + `mergeSuggestionPatch` over an in-memory directory of
suggestion records, no stubs within the store module. It would:

1. Validate a well-formed `{ status: 'open', proposed, original, block, author, … }` doc through the
   suggestion schema → it parses; a doc with `status: 'merged'` (bogus) or a blank `proposed` → refused
   at the write boundary (fail-closed).
2. `applySuggestionTransition('open', 'accept', decider)` → returns `accepted` with `decidedBy`/
   `decidedAt` stamped; `applySuggestionTransition('open', 'reject', decider)` → returns `rejected`.
3. `applySuggestionTransition('accepted', 'reject', …)` and `('rejected', 'accept', …)` → BOTH refuse
   (a closed suggestion cannot be re-decided) — the idempotency / no-re-decide guard.
4. `mergeSuggestionPatch` over an existing suggestion applies a status/decider change while never
   overwriting `id`, ignoring `undefined`, applying explicit `null`, and not mutating the input (the
   `mergeCommentPatch` invariants for the suggestion shape).
5. The module imports and `new PgSuggestionStore({} as Pool)` constructs with `list`/`create`/
   `transition` (or `update`) present — the offline smoke that the store surface is wired.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/library` suite), no DB. None exist yet; each is the assertion a contract test WILL prove
once authored (re-cite at real `file:line` when built). Per ADR-0122 each contract id leads a
distinctly-named test so `storytree coverage suggestion-edit-store` reports 4/4.

1. **`ses-record-validates-at-the-boundary`** — a well-formed suggestion validates, a malformed one is refused
   - **asserts —** the suggestion schema parses a complete `{ status:'open', proposed, original,
     block, author, topicKind, topicId, createdAt }` doc and refuses a blank `proposed`, an unknown
     `status` (`'merged'`), and a blank author — fail-closed at the write boundary.
   - **covers —** `packages/library/src/store/pg-suggestion-store.ts:25-40` (`SuggestionSchema` — the fail-closed zod boundary, applied at the store's `create` via `SuggestionSchema.parse`, `:152`)
2. **`ses-open-transitions-to-accepted-or-rejected`** — the pure transition drives open → accepted / rejected
   - **asserts —** `applySuggestionTransition('open','accept',decider)` returns `accepted` with
     `decidedBy`/`decidedAt` stamped, and `('open','reject',decider)` returns `rejected` — the only two
     legal moves from `open`.
   - **covers —** `packages/library/src/store/pg-suggestion-store.ts:61-78` (`applySuggestionTransition` — the open→accepted/rejected branch stamps `decidedBy`/`decidedAt`)
3. **`ses-closed-suggestion-cannot-be-re-decided`** — a decided suggestion refuses a second transition
   - **asserts —** `applySuggestionTransition('accepted','reject',…)` and `('rejected','accept',…)`
     both refuse (a loud throw / typed refusal) — a closed suggestion is terminal; re-deciding is
     rejected.
   - **covers —** `packages/library/src/store/pg-suggestion-store.ts:67-71` (`applySuggestionTransition` — the non-`open` guard throws; a closed suggestion is terminal)
4. **`ses-merge-and-store-surface`** — the patch merge keeps the invariants and the store constructs
   - **asserts —** `mergeSuggestionPatch` applies a present field, never overwrites `id`, ignores
     `undefined`, applies explicit `null`, and does not mutate the input; the module imports and
     `new PgSuggestionStore({} as Pool)` constructs with its read/write surface present (no SQL on
     construct).
   - **covers —** `packages/library/src/store/pg-suggestion-store.ts:89-98` (`mergeSuggestionPatch` — the
     `mergeCommentPatch` invariants) + `:119` (`PgSuggestionStore` — constructs with no SQL)

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the suggestion store as a new
module, test-first.

- **The new test —** `packages/library/src/store/pg-suggestion-store.test.ts` (`node:test` +
  `node:assert/strict`, the package convention — mirror `pg-comment-store.test.ts`). Import the schema +
  `applySuggestionTransition` + `mergeSuggestionPatch` + `PgSuggestionStore` from `"./pg-suggestion-store.js"`.
  Name each test for its contract id (`ses-…`) so `storytree coverage` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `pg-suggestion-store.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057).
- **The GREEN —** write `packages/library/src/store/pg-suggestion-store.ts`: the suggestion zod schema
  (fail-closed at the boundary), the pure `applySuggestionTransition` state machine (open → accepted /
  rejected; closed → refuse), the pure `mergeSuggestionPatch` (the `mergeCommentPatch` invariants), and
  the `PgSuggestionStore` event+projection class (atomic append `events.suggestion_event` + upsert
  `events.suggestion`, mirroring `PgCommentStore`; its `schema.sql` rows + `migrate.ts` registration
  carried alongside). Export it from the `@storytree/library/store` subpath so the studio's PgBackend
  can instantiate it (cap 3 / cap 5). After it, the import resolves, the assertions hold, and the
  `@storytree/library` suite + typecheck stay green.

Rules:

- **A suggestion is a proposal, never a direct write** — the store persists the proposal; applying the
  edit (on accept) is the route's job (cap 3) through the admin asset-write path, NOT a side effect of
  creating the suggestion.
- **The transition machine is pure + terminal** — open → accepted/rejected only; a closed suggestion
  refuses re-decision. Pinned offline (`ses-*`).
- **Validate at the write boundary** — fail-closed on a blank `proposed` / unknown `status` / blank
  author (the house discipline).
- **No live DB in the proof** — pure helpers + schema + import/construct run offline; the live SQL stays
  human-verified behind `STORYTREE_DB_LIVE` (the `pg-comment-store` pattern).
