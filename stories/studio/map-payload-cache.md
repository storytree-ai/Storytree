---
id: "map-payload-cache"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "A reloaded studio paints the forest from its persisted payloads"
outcome: "An operator who reloads the studio sees the forest paint from the last visit's persisted payloads instead of waiting on a cold server walk."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [240]
# BROWNFIELD R1: nothing is cached at any layer today (ADR-0240 context), so a full browser reload
# re-walks /api/tree (208 KB, 1141 ms cold) and /api/docs (277 markdown files re-parsed, 9.3 s cold)
# before the map can stop showing "Growing the world…". AUTHOR_TEST first proves the stamped
# paint-then-revalidate semantics against the real App + real TreeView; IMPLEMENT adds ONE pure
# client module plus the minimal wiring at the existing boot/tree-load sites. NO server change.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/App.payload-cache.test.tsx", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/lib/payloadCache.ts", "apps/studio/src/App.tsx", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/StoreBanner.tsx"]
  real:
    testFile: "apps/studio/src/App.payload-cache.test.tsx"
    sourceFile: "apps/studio/src/App.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/App.payload-cache.test.tsx", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/lib/payloadCache.ts", "apps/studio/src/App.tsx", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/StoreBanner.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is Vitest, not node:test. The focused proof runs the one integration file under
    # jsdom against the REAL TreeView — a mocked map would hollow every paint contract below.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/App.payload-cache.test.tsx"
---

# A reloaded studio paints the forest from its persisted payloads

**Outcome —** An operator who reloads the studio sees the forest paint from the last visit's persisted
payloads instead of waiting on a cold server walk.

## Why this is one capability

The journey is one reload: the operator refreshes the page and the world is already there, with the
refetch happening behind it. This is a FULL browser reload — not the SPA route change
[`map-route-retention`](map-route-retention.md) already covers; a reload loses every in-memory value,
so retention cannot help it.

Both persisted payloads belong to that one paint and cannot be split from it. `/api/tree` is what the
map draws; `/api/docs` is the read-only corpus index the boot load waits on before any app surface
renders. Caching only one leaves the other's cold walk on the critical path, so neither half removes
the blank wait on its own — they share the precondition (a reload holding a valid persisted entry) and
the single observable (a painted world instead of "Growing the world…"). The stamping, eviction, and
revalidation are not separable either: they are what makes the paint honest rather than a stale
screenshot, and a paint without them is a defect, not a smaller increment.

This is ADR-0240 decision 2's SECOND stage only — cache and persist the payloads client-side. It is
client-side work: no server route, header, ETag, or memoization changes (that is stage 3), and the
boot's serialisation order is untouched (stage 4). Sharing a file with a sibling increment creates no
`depends_on` edge.

## Guidance

- **Cache exactly the two READ-ONLY payloads.** `/api/tree` and `/api/docs` are reads with no write
  path, so a persisted copy can only ever be behind, never contradict an edit the operator just made.
  `/api/assets` and `/api/comments` are MUTABLE — create/update/delete flow through them — so they are
  never persisted here: putting a staleness surface inside a write path is a separate decision, not
  this increment. Whatever residual boot wait those two mutable payloads cost stays exactly as it is
  today; removing it is stage 4's de-serialisation, not this unit's.
- **Paint, then ALWAYS revalidate (ADR-0240 decision 3).** A cached paint NEVER replaces a fetch. Both
  `/api/tree` and `/api/docs` are still requested on every boot exactly as they are today, and the
  resolved payload reconciles the painted view — a story, capability, tier, status, or document the
  fresh payload adds must appear, and one it no longer carries must disappear. The cache removes the
  blank wait; it never becomes the source of truth, and a boot must never end with the operator looking
  at cached content while a resolved response sits unused.
- **Never paint a live coordination signal from cache.** The tree payload carries the in-flight
  coordination seeds — `builds` (the orbiting build wisps) and the `claims` seed slot — which say what
  a session is doing *right now*. A wisp restored from a previous page load is an active misstatement
  about the present, so the cached paint seeds the world's structure WITHOUT them: no build wisp, no
  claim wisp, no departure. They arrive only with the revalidated payload and the existing
  `/api/activity` poll. Structural/authored state — the stories, capabilities, tiers, statuses,
  coverage, edges — is exactly what a cached paint MAY carry. Do not launder the distinction by
  persisting the seeds and filtering them at render: an entry that never holds them cannot leak them.
- **Cached proof state is visibly provisional.** Crowns and verdicts painted from a previous payload
  must not be indistinguishable from freshly-confirmed ones (ADR-0240 decision 3 — cached paint is
  never cached truth). While revalidation is in flight, the map carries an observable
  provisional/revalidating state over its proof presentation; it clears when the revalidation resolves.
  A revalidation that FAILS must leave the map still marked provisional — never silently promoted to
  confirmed. No particular visual design is prescribed; the requirement is that the state is present,
  observable, and honestly cleared. The existing store-health honesty (the load screens, the banner,
  the asleep-vs-fault distinction) is not weakened to make a reload look faster.
- **Two independent stamps and a shape check, or no paint.** A persisted entry is validated BEFORE it
  is ever painted, on three guards, any one of which evicts it:
  1. a CLIENT-side stamp that moves with the bundle, so a schema-changing merge cannot paint an old
     shape into a new client. This guard must be decidable synchronously on the very first paint,
     BEFORE any network response — a stamp that needs a fetch to check is useless, because the paint it
     is meant to protect has already happened. It must change whenever the persisted shape or the
     bundle that wrote it changes;
  2. the SERVER code stamp already exposed on `/api/health` as `code.head` — recorded with the entry at
     write time and compared when health resolves; a different head evicts the entry so no later paint
     can use it;
  3. a structural shape check of the entry itself, so a truncated, hand-edited, or foreign value can
     never reach the world builder.
  Neither the storage mechanism nor the exact stamp derivation is prescribed. What is fixed: an entry
  failing ANY of the three is evicted and never painted.
- **Degrade to today's behaviour, never to a crash.** A store that is unavailable (reads or writes
  throw), full (a quota refusal on write), or corrupt (an unparseable entry) leaves the studio behaving
  EXACTLY as it does today: a cold paint, both fetches, an honest "Growing the world…" while they are
  in flight, no unhandled error, and never a blocked boot. Persistence is an accelerator; the product
  must be indifferent to its absence.
- **Keep the implementation boundary small.** The stamped cache is ONE new pure client module,
  `apps/studio/src/lib/payloadCache.ts` — read/write/stamp/evict/shape-check with no React, no `fetch`,
  and no import of the world builder — so its semantics are provable directly. The only wiring points
  are `apps/studio/src/App.tsx` (the `loadInitial` corpus arm) and
  `apps/studio/src/components/TreeView.tsx` (`reloadTree` and the world's first paint).
  `apps/studio/src/components/StoreBanner.tsx` is in scope for ONE narrow reason: it already owns the
  single `/api/health` poll that reads `code.head`, so the server-stamp guard is served by LIFTING that
  already-fetched stamp — never by a second poller, a second health request, or any change to the
  banner's phases, messages, or recovery behaviour. Adding a poller instead of lifting the stamp is the
  wrong fix and is refused.
- **Change no server code.** No `Cache-Control`, no `ETag`, no server memoization, no invalidation, no
  new route or field. `apps/studio/server/**`, `@storytree/app-surface`, the scene graph, the hash
  router, and the renderer are all untouched — the increment is client-side only.
- **Prove it as an integration test.** Add `apps/studio/src/App.payload-cache.test.tsx` (Vitest +
  jsdom), mounting the real App with the REAL `TreeView` and controlled Studio API responses — a
  probe stand-in for the map would hollow every paint contract, so only the non-participating global
  chrome may be stubbed. Its test titles carry every contract id below, each as ONE plain string
  literal with the declared id leading it — never a concatenation and never a locally-invented id.
  The coverage scan is a static AST scan (ADR-0126), so a title assembled with `+` reads as UNCOVERED
  even when the id is the first thing in it. *(This read: keep the generic real-build catalog companion
  `packages/cli/src/node-build.test.ts` in lockstep so its exact buildable-capability catalog includes
  `map-payload-cache`, calling that catalog assertion discoverability regression evidence. That is now
  false: ADR-0341 D4 replaced the hand-maintained catalogue with one DERIVED from the specs on disk, so
  authoring this spec IS the registration and there is no list to append to. The file stays in
  `scope.testGlobs`/`real.scope.testGlobs` for the derivation test itself, which is unaffected. Corrected
  in place per ADR-0139.)*

## Integration test

1. Boot the real App with an EMPTY store and controlled membership/corpus/tree responses. Assert the
   cold path is unchanged — both `/api/tree` and `/api/docs` are requested, the map shows its existing
   "Growing the world…" placeholder until the tree resolves — and that the entry written afterwards
   holds the tree payload and the doc index only, with no asset or comment data.
2. Reload into a second App instance over the entry written in step 1, holding `/api/tree` and
   `/api/docs` pending. Assert the world paints from the entry with no resolved tree response, the
   "Growing the world…" placeholder is never the reload experience, and both requests were still
   issued.
3. Resolve the pending tree/docs responses with a payload that differs from the entry (a story added, a
   story removed, a status changed, a document added). Assert the painted view reconciles to the fresh
   payload in both directions.
4. Repeat the cached reload with an entry whose payload carries in-flight coordination data. Assert no
   build wisp, claim wisp, or departure is painted from it, and that a wisp appears only once the
   revalidated payload and the `/api/activity` poll answer.
5. On the same cached reload, assert the map's proof presentation carries an observable provisional
   state while revalidation is in flight; that it clears when revalidation resolves; and that a
   revalidation which REJECTS leaves it still provisional rather than reading as confirmed.
6. Drive the cache module directly for the pre-network guards: an entry stamped by a different client
   bundle, and a structurally malformed entry, are both refused and evicted with no network response
   available. Assert the App boots cold in each case, and that no world is ever built from the refused
   entry.
7. Resolve `/api/health` with a `code.head` different from the one recorded with the entry. Assert the
   entry is evicted and a subsequent boot over the same store paints cold rather than from it.
8. Repeat the reload with (a) a store whose reads and writes throw, (b) a store whose write is refused
   as over-quota, and (c) an unparseable entry. Assert each boot completes exactly as the step-1 cold
   path, with no unhandled rejection and no blocked boot.
9. Run the generic real-build catalog regression and assert its exact buildable-capability catalog names
   `map-payload-cache`; this keeps the authored capability visible to the real-build path.

## Contracts

1. **`map-payload-cache-persists-only-read-only-payloads`**
   - **asserts —** a completed boot writes ONE entry holding the `/api/tree` payload's structural state
     and the `/api/docs` index; the mutable `/api/assets` and `/api/comments` results are never
     written to the store by any path.
2. **`map-payload-cache-paints-then-always-revalidates`**
   - **asserts —** with a valid entry, the world paints before any tree response resolves (never the
     "Growing the world…" placeholder), `/api/tree` and `/api/docs` are still both requested, and the
     resolved payloads reconcile the painted view in both directions — an added node appears and a
     removed one disappears.
3. **`map-payload-cache-withholds-live-coordination-signals`**
   - **asserts —** a cached paint seeds structural/authored state only: no build wisp, claim wisp, or
     departure is rendered from the entry, and the entry itself carries no in-flight coordination rows.
     Coordination wisps appear only from the revalidated payload and the existing activity poll.
4. **`map-payload-cache-marks-cached-proof-state-provisional`**
   - **asserts —** while revalidation is in flight, the map exposes an observable provisional state over
     the proof presentation painted from cache, distinguishable from freshly-confirmed; it clears on a
     resolved revalidation and REMAINS on a failed one.
5. **`map-payload-cache-refuses-a-foreign-stamp-or-a-malformed-entry`**
   - **asserts —** an entry whose client stamp differs from the running bundle's, or that fails the
     structural shape check, is evicted and never painted — decided synchronously on the first paint,
     with no network response consulted.
6. **`map-payload-cache-evicts-on-a-server-code-stamp-change`**
   - **asserts —** the entry records the server `code.head` from `/api/health` at write time, and a
     health response carrying a different head evicts it, so no later boot paints from it.
7. **`map-payload-cache-degrades-to-a-cold-paint`**
   - **asserts —** an unavailable, quota-refusing, or corrupt store leaves the studio on exactly today's
     cold path — both fetches, the existing placeholder, a completed boot — with no unhandled error and
     no blocked boot.

## Explicitly outside this increment

- **Caching or persisting `/api/assets` and `/api/comments`.** Both are MUTABLE — create, update, and
  delete flow through them — so persisting them would place a staleness surface inside a write path.
  That is a separate decision with its own reconciliation and invalidation questions, not part of this
  increment.
- Boot de-serialisation: the corpus load gate's ORDER is untouched, so the residual wait the mutable
  payloads still impose on the app stage stays exactly as it is today (ADR-0240 stage 4).
- Any server change: `Cache-Control`, `ETag`, server-side memoization of the `stories/` or `docs/`
  walks, mtime invalidation, or a new/changed route or payload field (ADR-0240 stage 3).
- Persisting or restoring the BUILT world/scene, the camera, selection, or any derived render state;
  this increment persists wire payloads only, and the client world/scene build is unchanged.
- LOD, density, culling, aggregation, scene-graph redesign, renderer choice, or any owner-visible change
  to the world's look. ADR-0240 deliberately sequences that LAST, behind its own ADR and an owner
  attestation of the look.
- Any regression of `map-route-retention`'s SPA route retention, or of the existing `SceneView` memo,
  stable-scene-identity, and idle-frozen-ticker protections in `@storytree/app-surface`.
- Weakening any existing store-health honesty — the load screens, the banner, or the asleep-vs-fault
  distinction — to make a reload appear faster.
