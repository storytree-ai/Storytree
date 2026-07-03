---
id: "block-position-comment-anchor"
tier: capability
story: library-review
title: "A comment is anchored to a block position, not a text span"
outcome: "A comment's anchor records which BLOCK it attaches to (a stable block position within the rendered topic), not a text-quote span; the W3C text-quote anchor shape (quote/prefix/suffix/startOffset) is gone from the stored comment model, and a block-anchored comment validates at the store's write boundary."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (R1, editsExisting): the
# CommentAnchor shape ALREADY exists in packages/library/src/store/pg-comment-store.ts (the stored
# mirror) — the leaf REPLACES its text-quote fields with a block-position anchor, ADDS a runtime
# write-boundary normalizer (`normalizeCommentAnchor`), and adds the assertions into the EXISTING
# pg-comment-store.test.ts. The RED the spine observes is a NEW assertion that calls the runtime
# `normalizeCommentAnchor` — asserting a `kind: 'block'` anchor with a block handle is returned
# canonical (quote-span fields stripped) and a legacy/`text`/unknown kind downgrades to a safe default.
# It fails at HEAD because `normalizeCommentAnchor` does NOT EXIST — a required RUNTIME WITNESS. The
# proof runs under tsx (`node --import tsx --test`), which strips types WITHOUT typechecking, so the
# type-only shape flip alone produces no runtime failure; the observed red MUST be a runtime behaviour
# whose absence at HEAD the runner can see, and the missing normalizer is exactly that. The PURE helpers
# (mergeCommentPatch, normalizeCommentAnchor) + the module-imports-and-constructs checks all run OFFLINE
# in this suite (node:test, no DB) — the live SQL list/create/update/remove over events.comment* stays
# human-verified behind STORYTREE_DB_LIVE, exactly as today.
#
# install: true + a typecheck wall — the suite imports the package's own types across modules and the
# proof runs in a fresh worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2). SINGLE
# LITERAL test file (no `*`), so the default node:test proof on the one file is legal — no proofCommand
# (the @storytree/library suite is node:test, NOT vitest, unlike the studio frontend caps).
#
# NOTE the studio-side mirror (apps/studio/src/types.ts CommentAnchor + apiRouter.ts readAnchor) is the
# SAME shape and is updated in lockstep, but the leaf's RED→GREEN oracle is the store shape in
# @storytree/library (one package, one suite); the studio readAnchor change is carried as part of the
# same edit and re-proven by capability 5 (the feed) + 7/9 (the frontend + removal). Keeping the leaf's
# proof to ONE package suite is the standalone-resilient-library discipline.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/store/**/*.test.ts"]
    sourceGlobs: ["packages/library/src/store/**/*.ts"]
  real:
    editsExisting: true
    testFile: "packages/library/src/store/pg-comment-store.test.ts"
    sourceFile: "packages/library/src/store/pg-comment-store.ts"
    scope:
      testGlobs: ["packages/library/src/store/pg-comment-store.test.ts"]
      sourceGlobs: ["packages/library/src/store/pg-comment-store.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# A comment is anchored to a block position, not a text span

**Outcome —** A comment's anchor records which BLOCK it attaches to (a stable block position within
the rendered topic), not a text-quote span; the W3C text-quote anchor shape
(`quote`/`prefix`/`suffix`/`startOffset`) is gone from the stored comment model, and a block-anchored
comment validates at the store's write boundary.

**Depends on —** (root — no within-story upstream)

> **Proof status (honest) — BUILT via the prove-it-gate (run `real-mr22bwt5`, signed PASS, verdict
> @ `879608f`, an ancestor of main; coverage 3/3).** The runtime write-boundary normalizer
> `normalizeCommentAnchor` lives at `packages/library/src/store/pg-comment-store.ts:61-87`: a
> `kind: 'block'` anchor (with its `blockId` handle) returns canonical, the legacy
> `quote`/`prefix`/`suffix`/`startOffset` span fields are stripped, and a legacy/`text`/unknown kind
> downgrades to the safe `topic` default; `create`/`update` apply it so the stored doc is always
> canonical. **Landed nuance vs the authored outcome:** the text-quote fields remain on the
> `CommentAnchor` interface (`:31`) as optional `@deprecated` LEGACY fields (so existing stored docs
> and fixtures stay valid TypeScript) — they never survive the write boundary, but the interface is
> not span-free; the canonical STORED shape is. The `bpa-*` contract tests run in
> `pg-comment-store.test.ts` (node:test, offline). **Consolidation glue (not leaf-proven):** the
> studio mirror moved in lockstep (`apps/studio/src/types.ts` `CommentAnchor` + `apiRouter.ts`
> `readAnchor`), commit `8607e57`. Frontmatter stays `proposed` — status is earned through the rollup
> (the house convention).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: it is a cohesive change to ONE module's anchor model — the
stored `CommentAnchor` shape, the pure merge that preserves it across a patch, and the canonical
block-anchored doc that the store persists — proven by integration over the store's pure surface (the
real `mergeCommentPatch` + the real module construction against a block-anchored `Comment`), not a
single isolated string assertion. It is the DATA-MODEL half of the block-position move; the inline
rendering of that anchor is the frontend `inline-comment-thread` cap, and the feed that serves it is
`review-refresh-feed`.

THE BLOCK ANCHOR SHAPE (the model — ADR-0140). The anchor gains `kind: 'block'` and a block handle
(the leaf's call between a block INDEX and a derived stable block ID — see the story's open call #1;
recommend the stable-id route, mirroring the heading slugs `Markdown.tsx` already mints). It KEEPS
`kind: 'topic'` (a whole-topic comment) and MAY keep `kind: 'section'` (a heading is just a coarse
block). It DROPS `kind: 'text'` and the `quote`/`prefix`/`suffix`/`startOffset` fields — a comment no
longer carries a text span. The consuming AI infers what a block comment refers to from the block
position + the block's text, NOT from a stored quote.

THE SHAPE NEEDS A RUNTIME WITNESS (why the proof asserts a normalizer, not the type). The interface is
type-only — under the tsx runner (`node --import tsx --test`) types are stripped without a typecheck,
so flipping the `kind` union alone changes nothing the test can OBSERVE at run time. So the model is
given a runtime write boundary: an exported `normalizeCommentAnchor(rawAnchor)` that (a) accepts a
`kind: 'block'` anchor with a block handle and returns it canonical, (b) DROPS the dead
`quote`/`prefix`/`suffix`/`startOffset` fields, and (c) downgrades a legacy/unknown/`text` kind to a
safe default (`topic`, never an unfindable locator) — precisely mirroring the studio's `readAnchor`
precedent (`apiRouter.ts` ~:269). `create`/`update` apply it at the write boundary so the stored doc is
always canonical. This is the behaviour the proof asserts, and its absence at HEAD is the observed red.

THE STORE IS THE ORACLE, the studio mirror rides along. The RED→GREEN proof lives in ONE package —
`@storytree/library`'s `pg-comment-store.ts` + its node:test suite. The studio-side mirror
(`apps/studio/src/types.ts` `CommentAnchor`, `apps/studio/server/apiRouter.ts` `readAnchor` ~:269) is
the SAME shape and must move in lockstep (the leaf carries that edit), but it is NOT this cap's proof
oracle — keeping the leaf's red→green inside one package suite is the standalone-resilient-library
discipline (a library exercised end-to-end by a test that imports it directly). The `readAnchor`
normalisation change is re-proven downstream by `review-refresh-feed` (cap 5) and the frontend/removal
caps (7/9).

OFFLINE-TESTABLE BY THE PURE SURFACE. Every assertion runs over the pure `normalizeCommentAnchor` +
the pure `mergeCommentPatch` + the module's import/construct (a bare object stands in for a `Pool` — the
constructor issues no SQL, exactly as `pg-comment-store.test.ts:79-87` does today) against a
block-anchored `Comment` literal — no store, no clock, no DB. The live SQL (list/create/update/remove
over `events.comment*`) stays human-verified behind `STORYTREE_DB_LIVE`, unchanged by this cap.

## Integration test

**Goal —** Prove that the stored comment model anchors to a BLOCK position (not a text span): the real
`normalizeCommentAnchor` returns a `kind: 'block'` anchor (with a block handle, NO
`quote`/`prefix`/`suffix`/`startOffset`) canonical and downgrades a legacy/`text`/unknown kind to a safe
default; a block-anchored `Comment` round-trips through the real `mergeCommentPatch` without losing or
mutating its anchor.

The integration test exercises this capability against its **real in-store collaborators** — the real
`normalizeCommentAnchor` + the real `mergeCommentPatch` + the real `PgCommentStore` construction over a
block-anchored `Comment` — no stubs within the store module. It would:

1. Call `normalizeCommentAnchor({ kind: 'block', block: <handle>, … })` → assert the returned anchor is
   `kind === 'block'`, carries the block handle, and has NO `quote`/`prefix`/`suffix`/`startOffset`
   (the dead text-quote fields are stripped, not carried through). This is the RUNTIME witness that
   fails at HEAD, where `normalizeCommentAnchor` does not exist.
2. Call `normalizeCommentAnchor` on a legacy/`text`/unknown anchor (`{ kind: 'text', quote: '…' }`) →
   assert it downgrades to the safe default (`kind === 'topic'`, no dangling text-quote span), mirroring
   the studio `readAnchor` posture (a bare/under-specified anchor never becomes an unfindable locator).
3. Construct a block-anchored `Comment` (`anchor: { kind: 'block', block: <handle>, … }`, no quote
   fields), run `mergeCommentPatch(blockComment, { body: 'edited' })` → assert the body changes and the
   block anchor is preserved byte-for-byte (the anchor is not a patchable field; the merge leaves it
   intact). Then run `mergeCommentPatch(blockComment, { resolved: true, resolvedAt: <ts> })` → assert
   resolve toggles without disturbing the block anchor (the resolve fan-out the story UAT leg relies on).
4. Assert the input is not mutated and a new object is returned (the existing merge invariants hold for
   a block anchor exactly as for the old shape).
5. Assert the module imports and `new PgCommentStore({} as Pool)` constructs with `list`/`create`/
   `update`/`remove` present (the offline smoke that the shape change did not break the store surface).

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/library` suite), no DB. None exist yet; each is the assertion a contract test WILL prove
once authored (re-cite at real `file:line` when built). Per ADR-0122 each contract id leads a
distinctly-named test so `storytree coverage block-position-comment-anchor` reports 3/3.

1. **`bpa-block-anchor-is-the-stored-shape`** — the write boundary normalizes to a block-position anchor
   - **asserts —** the runtime `normalizeCommentAnchor` returns a `kind: 'block'` anchor (with its block
     handle) canonical and with the dead `quote`/`prefix`/`suffix`/`startOffset` fields STRIPPED, and
     downgrades a legacy/`text`/unknown kind to the safe default (`topic`, never an unfindable locator).
     At HEAD this assertion fails because `normalizeCommentAnchor` does not exist — the required runtime
     witness for a shape change the tsx (no-typecheck) runner would otherwise not observe.
   - **covers —** `packages/library/src/store/pg-comment-store.ts:61-87` (`normalizeCommentAnchor` — canonical `kind: 'block'`, quote-span fields stripped, `text`/unknown downgraded to `topic`) + `:31` (`CommentAnchor` — the block shape)
2. **`bpa-merge-preserves-the-block-anchor`** — patching a comment preserves its block anchor
   - **asserts —** `mergeCommentPatch` over a block-anchored comment changes `body` / toggles
     `resolved`+`resolvedAt` while leaving the block anchor intact (the anchor is not patchable), does
     not mutate the input, and returns a new object.
   - **covers —** `packages/library/src/store/pg-comment-store.ts:116` (`mergeCommentPatch` — the anchor is not a patchable field; the merge invariants hold for the block shape)
3. **`bpa-store-constructs-over-the-new-shape`** — the store surface is intact after the shape change
   - **asserts —** the module imports without throwing and `new PgCommentStore({} as Pool)` constructs
     with `list`/`create`/`update`/`remove` present (the constructor issues no SQL) — the block-anchor
     change did not break the store's surface.
   - **covers —** `packages/library/src/store/pg-comment-store.ts:133` (`PgCommentStore` — constructs over the new shape; `normalizeCommentAnchor` applied at the `create`/`update` write boundary)

## Guidance — the slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, EDITS-EXISTING): replace the anchor model in place,
test-first.

- **The edited test —** `packages/library/src/store/pg-comment-store.test.ts` (`node:test` +
  `node:assert/strict`, the package convention). Import `normalizeCommentAnchor` and add the normalizer
  assertions above; rewrite the `sampleComment` anchor to the block shape (or add a `sampleBlockComment`
  helper). Name each test for its contract id (`bpa-…`) so `storytree coverage` reports 3/3 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the new normalizer assertions fail against HEAD
  because `normalizeCommentAnchor` does NOT EXIST in `pg-comment-store.ts` — the import/call throws, an
  observed runtime red. A RUNTIME WITNESS is required here, not optional: the proof runs under tsx
  (`node --import tsx --test`), which strips types WITHOUT typechecking, so the type-only `kind`-union
  flip alone produces no runtime failure — the legitimate observed red is the *absence of the
  normalizer's runtime behaviour* at HEAD, not a type error and not a stale text-quote value.
- **The GREEN —** in `packages/library/src/store/pg-comment-store.ts`: (1) add the exported
  `normalizeCommentAnchor(rawAnchor)` — returns a `kind: 'block'` anchor with its handle canonical,
  strips `quote`/`prefix`/`suffix`/`startOffset`, and downgrades a legacy/`text`/unknown kind to `topic`
  (mirroring the studio `readAnchor`); (2) change `CommentAnchor` to `kind: 'topic' | 'section' | 'block'`,
  add the block handle field, and remove `quote`/`prefix`/`suffix`/`startOffset`; (3) apply
  `normalizeCommentAnchor` at the write boundary in `create`/`update` so the stored doc is always
  canonical. Carry the SAME change into the studio mirror (`apps/studio/src/types.ts` `CommentAnchor`,
  and `apps/studio/server/apiRouter.ts` `readAnchor` so a POST normalises to a block anchor and a
  bare/under-specified anchor downgrades to `topic`, never an unfindable locator). After it, the
  assertions hold and the `@storytree/library` suite + typecheck stay green.

Rules:

- **Block, not span** — the stored anchor records WHICH block, never a `quote`/`prefix`/`suffix` text
  span. The text-quote fields are removed, not deprecated-in-place.
- **Keep the merge invariants** — `mergeCommentPatch` still never overwrites `id`, ignores `undefined`,
  applies explicit `null`, and does not mutate the input (the block anchor changes the shape, not the
  merge semantics).
- **The store is the proof oracle** — the red→green lives in `@storytree/library`'s node:test suite;
  the studio mirror moves in lockstep but is re-proven downstream (caps 5 / 7 / 9), not here.
- **No live DB in the proof** — the pure helpers + import/construct run offline; the live SQL stays
  human-verified behind `STORYTREE_DB_LIVE`.
