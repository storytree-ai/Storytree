---
id: "map-boot-independence"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "The forest map's own fetch starts as soon as membership resolves"
outcome: "An operator's forest map begins fetching its own data as soon as membership resolves, instead of waiting on Library-corpus payloads the map never reads."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [240]
# BROWNFIELD R1: the map is still serialised behind two Library-corpus payloads today. `loadInitial`
# (App.tsx:111) awaits `Promise.all([api.listAssets(), api.listComments()])` and only then sets
# `status = 'ready'`; `<TreeView>` is rendered ONLY inside `{status === 'ready' && …}` (App.tsx:239),
# and `TreeView`'s `reloadTree` runs in a mount effect — so the mount IS the fetch, and the map's
# `/api/tree` request cannot start until both corpus payloads resolve. Measured on the running
# studio: `/api/assets` is 574,609 bytes (ADR-0240's "561 KB" exactly), ~62-147 ms warm;
# `/api/comments` is 2 bytes (`[]`) on the json store and has NO reader anywhere in
# `apps/studio/src`. AUTHOR_TEST first proves the boot ordering, the dead-fetch removal, and the two
# honesty properties against the REAL App + REAL TreeView; IMPLEMENT removes one gate and one dead
# fetch from the existing boot composition and teaches the assets consumers a not-yet-loaded state.
# NO server change.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/App.boot-independence.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx", "apps/studio/src/components/TreeView.pan.test.tsx", "apps/studio/src/components/ReviewEditor.test.tsx", "apps/studio/src/components/LibraryOpenOverlay.test.tsx", "apps/studio/src/components/LibraryDiveBody.test.tsx", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/App.tsx", "apps/studio/src/lib/appData.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/AssetView.tsx", "apps/studio/src/components/AssetEditor.tsx", "apps/studio/src/components/LibraryFocusGraph.tsx", "apps/studio/src/components/LibrarySelectionCard.tsx"]
  real:
    testFile: "apps/studio/src/App.boot-independence.test.tsx"
    sourceFile: "apps/studio/src/App.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/App.boot-independence.test.tsx", "apps/studio/src/components/TreeViewShell.test.tsx", "apps/studio/src/components/TreeView.pan.test.tsx", "apps/studio/src/components/ReviewEditor.test.tsx", "apps/studio/src/components/LibraryOpenOverlay.test.tsx", "apps/studio/src/components/LibraryDiveBody.test.tsx", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/App.tsx", "apps/studio/src/lib/appData.ts", "apps/studio/src/components/TreeView.tsx", "apps/studio/src/components/AssetView.tsx", "apps/studio/src/components/AssetEditor.tsx", "apps/studio/src/components/LibraryFocusGraph.tsx", "apps/studio/src/components/LibrarySelectionCard.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is Vitest, not node:test. The focused proof runs the one integration file
    # under jsdom against the REAL App and the REAL TreeView — a mocked map would hollow the
    # ordering contract (the map's mount IS its fetch), so the map must be the real one.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/App.boot-independence.test.tsx"
---

# The forest map's own fetch starts as soon as membership resolves

**Outcome —** An operator's forest map begins fetching its own data as soon as membership resolves,
instead of waiting on Library-corpus payloads the map never reads.

## Why this is one capability

The journey is one boot: the operator opens the studio, membership resolves, and the map starts
pulling its own world immediately rather than queueing behind a Library corpus it will not look at
until it opens a drawer. That is one outcome with one precondition (a member's boot) and one
observable (`/api/tree` in flight before the corpus payloads resolve).

The two payloads cannot be split from each other, because they sit in the SAME blocking `await`.
`loadInitial` (`App.tsx:111`) resolves `Promise.all([api.listAssets(), api.listComments()])` and only
then flips `status` to `ready`, and `<TreeView>` is rendered only inside `{status === 'ready' && …}`
(`App.tsx:239`). A `Promise.all` waits for the slower of the two, so acting on one alone frees
nothing: dropping the comments fetch while assets still gate leaves 574,609 bytes on the critical
path, and deferring assets while comments still gate leaves a boot round-trip for a payload no
component reads. Both halves of that one `await` have to go for the map's fetch to start.

The honesty requirements are not separable from the deferral either. Deferring `/api/assets` opens a
window in which `assets === []` while the truth is "not loaded yet", and a surface that renders that
window as an empty Library corpus is ADR-0240 decision 3's failure — cached paint is never cached
truth — reached through deferral instead of caching. A deferral without that guard is not a smaller
increment; it is the defect this unit exists to prevent, which is the splitting rule's answer: the
guard shares the precondition and the observable with the deferral it makes safe.

This is ADR-0240 decision 2's FOURTH stage — de-serialise the boot. Stage 2
([`map-payload-cache`](map-payload-cache.md)) already took the `/api/docs` third of it, so what is
left is the remaining pair. It is client-side work: no server route, header, ETag, or memoization
change (that was stage 3, [`map-server-memo`](map-server-memo.md)). Sharing a file with a sibling
increment creates no `depends_on` edge — stages 2 and 3 both say the same. It is no longer the last
stage before density: ADR-0272 decision 3 de-sequenced that budget, and what followed here was
stage 5, [`compositor-pan-transform`](compositor-pan-transform.md) — pan moved off the SVG `<g>`
transform onto a compositor-only wrapper.

## Guidance

- **The prescribed mechanism is wrong about half the pair, and that is why this unit is shaped as it
  is.** ADR-0240's Consequences describe stage 4 as "de-serialise the remaining pair — `/api/assets`
  and `/api/comments`", framing BOTH as deferrals. Probed against the code before anything was
  written, one of them is not a deferral candidate at all (next two bullets). This is the THIRD
  ADR-0240-prescribed mechanism on this arc to fail a pre-build probe — after stage 2's server code
  stamp, which arrives only after the paint it was meant to gate, and stage 3's directory mtime,
  which does not move when file content changes — and it fails the SAME way the ADR's own correction
  names: a mechanism written down at design time that cannot see the thing it is meant to handle.
  Deferring a fetch nobody reads would have been a faithful reading of the ADR and still the wrong
  build. Record this in the increment log, not as a re-decision: every decision in ADR-0240 stands.
- **`/api/comments` is a DEAD boot fetch — it is REMOVED, not deferred.** Established by probe, and
  not to be re-derived: no component anywhere in `apps/studio/src` destructures `comments` (or
  `refreshComments`) from `useAppData()`. Its only helper, `openCount` (`lib/appData.ts:29`), has
  ZERO callers. The `appData.ts` header comment still claims the collection feeds "sidebar badges",
  but `Sidebar.tsx` is now a single static Library link — the per-category rail retired with
  ADR-0185 decision 6. The live comment surfaces own their own data: `InlineCommentThread` holds its
  own `useState<Comment[]>` (`InlineCommentThread.tsx:45`) and fetches per topic, and `ReviewBlocks`
  polls its own combined feed (`ReviewBlocks.tsx:76`). `refreshComments` (`App.tsx:69`) is called
  only from `onStoreRecovered`, inside `App.tsx` itself. Measured on the running studio the payload
  is 2 bytes (`[]`) — that SIZE is store-dependent (the live pg store carries real comments), but
  the zero-reader finding is store-independent, and it is the finding that decides the treatment.
  Deferring it would keep a boot round-trip AND leave a context field that is permanently empty:
  a field that lies. So the dead path goes — the boot fetch, the `AppData` collection, its unused
  refresher, and `openCount` — together with the header comment that describes a rail that no longer
  exists.
- **`/api/assets` IS a genuine deferral, and ADR-0240's reasoning about it holds.** Measured:
  574,609 bytes (the ADR's "561 KB" exactly), ~62-147 ms warm against an already-warm server. Its
  readers are the Library routes (`AssetView`, `AssetEditor`, `ReviewEditor`) and, inside
  `TreeView`, the `libraryAssets` memo (`TreeView.tsx:1651`, over the `useAppData()` read at 1640)
  — used at exactly two call sites, 2735 and 2743, both inside the Library drawer's canvas
  (`LibraryFocusGraph`, `LibrarySelectionCard`). Nothing on the map's first paint reads it. The
  ADR's claim that the map "does not need it until the Library drawer is opened" is confirmed.
- **`/api/me` is an irreducible prerequisite and stays exactly where it is.** Measured 2.7 ms / 100
  B. ADR-0043 is why: non-members never load the corpus, and they would be 403'd anyway. The floor
  this unit leaves behind is precise — `/api/me` resolves a member, and THEN `/api/tree`,
  `/api/docs`, and `/api/assets` are all in flight independently of one another. "As soon as
  membership resolves" is a ceiling as well as a floor: starting the map's fetch BEFORE membership
  resolves, or for a non-member, is a defect, not an optimisation.
- **Remove exactly one gate, not two.** `treeMounted` (`App.tsx:31`) is stage 1's route-retention
  rule and it stays the gate for MOUNTING the map: a direct load of a non-tree route still does not
  mount `TreeView` and still does not fetch the tree. What this unit removes is the SECOND gate —
  `status` — which withholds the map for a reason that has nothing to do with the map. On a direct
  `#/tree` load `treeMounted` is already true from the first render, so `status` is the only thing
  standing between membership resolving and the map's fetch.
- **A consumer reading assets must be able to tell not-yet-loaded from genuinely-empty.** This is a
  PROPERTY, and the mechanism is the leaf's call — a status alongside the collection, a nullable
  value, a discriminated union, whatever types cleanly. What is fixed: while `/api/assets` is in
  flight, no surface presents an empty Library corpus as the answer, and when it resolves to a
  genuinely empty corpus that IS presented, distinguishably. Three surfaces are exposed to the
  window — the Library routes and the drawer canvas named above — and today none of them can tell,
  because today the whole app is withheld until assets resolve. The window is created by this unit,
  so closing it belongs to this unit.
- **An assets failure must not blank the map, and must not vanish either.** Today `status ===
  'error'` blanks the entire content area (`App.tsx:230`), map included. After this change a failed
  `/api/assets` must leave the map mounted and painting — the map has its own honest `loadError`
  path and it stays — but the failure must still be visible where assets actually matter, rather
  than degrading into a silent empty corpus. Dropping the error surface to buy a faster boot is
  trading honesty for speed and is refused; this is decision 3 applied to failure rather than to
  staleness.
- **The store-health screens are NOT in the way — leave every one of them untouched.** `LoadScreen`
  switches on `loadState`, derived by `deriveLoadState(meStatus, me, storePhase, elapsedMs)`
  (`App.tsx:161-163`); it never reads `status`. So this unit can and must leave the load screens,
  the `StoreBanner`, the asleep-vs-fault distinction, and the TAKING-LONGER ageing exactly as they
  are. A boot that paints sooner by hiding a degraded store is a defect (ADR-0240 decision 3).
- **The removal ripples through the existing `AppData` fixtures, and typecheck is what enforces it.**
  Five test files construct an `AppData` value by hand and will stop compiling when the collection
  and its refresher leave the interface: `TreeViewShell.test.tsx`, `TreeView.pan.test.tsx`,
  `ReviewEditor.test.tsx`, `LibraryOpenOverlay.test.tsx`, `LibraryDiveBody.test.tsx`. They are in
  scope for that reason only — update the fixture shape, change no assertion in them.
- **Keep the implementation boundary small, and change no server code.** The primary edit is the
  boot composition in `apps/studio/src/App.tsx` plus the context shape in
  `apps/studio/src/lib/appData.ts`; the assets consumers named above are in scope only to learn the
  not-yet-loaded state. `apps/studio/server/**` is untouched: no route, header, ETag, memo, or
  payload-field change, and no new endpoint. The hash router, the scene graph, and the renderer are
  untouched too.
- **Prove it as an integration test.** Add `apps/studio/src/App.boot-independence.test.tsx` (Vitest +
  jsdom), mounting the real App with the REAL `TreeView` and controlled Studio API responses — only
  the non-participating global chrome may be stubbed, exactly as stages 1 and 2 did. The decisive
  mechanism already exists in `App.payload-cache.test.tsx`: its `deferred<T>()` helper lets a test
  hold `listAssets` unresolved and still assert `api.tree` was called. That is precisely how the
  ordering contract proves, and it must fail today — today `api.tree` is never called while assets
  pend, because `TreeView` is never mounted. Test titles carry every contract id below, each as ONE
  plain string literal with the declared id LEADING it — never a concatenation and never a
  locally-invented id. The coverage scan is a static AST scan (ADR-0126), so a title assembled with
  `+` reads as UNCOVERED even when the id is the first thing in it. Every contract below has a real
  test with a real assertion: stage 3 signed PASS while printing `coverage 0/9`, six of its nine
  contracts having no test at all, so the contract list here is deliberately tight and each one is
  provable from this single file.
- **Do not skip the catalog companion again — it was declared and skipped on BOTH prior stages.**
  `packages/cli/src/node-build.test.ts` (~line 506) holds an alphabetical REAL-buildable capability
  catalog that must name `map-boot-independence` (it sorts FIRST among the `map-*` entries, ahead of
  `map-build-seeds-terminal`). It is listed in BOTH `scope.testGlobs` and `real.scope.testGlobs`
  here — and it was listed in both globs on stage 2 and again on stage 3, and skipped both times.
  The reason it keeps being missed is structural, not careless: the real build observes only the
  TARGET package's suite, so nothing in the green it signs can see this assertion. It is
  discoverability regression evidence, not another implementation surface; add the id and move on.

## Integration test

1. Boot the real App on `#/tree` with `/api/me` resolving a member and `api.listAssets` held PENDING
   via the `deferred<T>()` helper. Assert `api.tree` was nonetheless called and the map mounted and
   painted, with no assets response available. Assert `api.listComments` was never called by any
   boot path. This is the core red: today `TreeView` is withheld behind `status === 'ready'`, so
   `api.tree` is never reached.
2. Assert the not-before fence in three shapes: with `/api/me` PENDING, `api.tree` is not called;
   with `/api/me` resolving a NON-member, neither `api.tree` nor `api.listAssets` is ever called
   (ADR-0043); and on a direct load of a NON-tree route, the map neither mounts nor fetches (stage
   1's `treeMounted` rule is the mount gate and is unchanged).
3. Resolve the pending `listAssets` from step 1 and open the Library drawer over the map. Assert the
   drawer's assets consumers receive the resolved corpus — the deferral is a deferral, not a drop.
4. Repeat step 1 and, while `listAssets` is still pending, reach each assets consumer (the drawer
   canvas and a Library route). Assert none of them presents an empty Library corpus as the answer,
   and that a not-yet-loaded state is observable. Then resolve with an EMPTY corpus and assert the
   genuinely-empty presentation appears and is distinguishable from the pending one.
5. Repeat step 1 and REJECT `listAssets`. Assert the map stays mounted and painting and its own
   `loadError` path is untouched; that the whole content area is not blanked; and that the failure
   is reported where assets matter, rather than degrading into a silent empty corpus.
6. Assert the dead path is gone at the seam: no boot path calls `api.listComments`, and the app
   context exposes no permanently-empty comment collection. Then drive a per-topic comment surface
   and assert it still fetches and renders its own comments — the `/api/comments` route and
   `api.listComments()` both stay, and only the dead boot fetch and the dead context field go.
7. Drive the load-screen inputs — a membership error, a store that is asleep, a store that is
   faulted, and the TAKING-LONGER ageing — and assert each screen, the banner, and the
   asleep-vs-fault distinction behave exactly as they do today, and that the map is never mounted
   behind a load screen.
8. Assert the prior stages are intact from this same boot: a hash-route change away from the map
   leaves the visited `TreeView` mounted and parked (stage 1); and a persisted entry with a foreign
   client stamp, or a structurally malformed one, is still refused before any paint, while a
   `/api/health` `code.head` change still evicts (stage 2).
9. Run the generic real-build catalog regression and assert its exact buildable-capability catalog
   names `map-boot-independence`; this keeps the authored capability visible to the real-build path.

## Contracts

1. **`map-boot-independence-starts-the-map-fetch-once-membership-resolves`**
   - **asserts —** with `/api/me` resolved for a member and `/api/assets` still PENDING, `/api/tree`
     is requested and the map mounts and paints; and the fetch starts no earlier than that — not
     while `/api/me` is pending, never for a non-member, and never on a route where stage 1's
     retention rule does not mount the map.
2. **`map-boot-independence-drops-the-dead-comments-boot-fetch`**
   - **asserts —** no boot path calls `api.listComments` and the app context carries no
     permanently-empty comment collection or unused refresher, while a per-topic comment surface
     still fetches and renders its own comments unchanged.
3. **`map-boot-independence-distinguishes-unloaded-assets-from-empty`**
   - **asserts —** while `/api/assets` is in flight, no assets consumer presents an empty Library
     corpus as the answer and a not-yet-loaded state is observable; a resolved EMPTY corpus IS
     presented and is distinguishable from that state; and a resolved non-empty corpus reaches the
     drawer's consumers in full.
4. **`map-boot-independence-surfaces-an-assets-failure-without-blanking-the-map`**
   - **asserts —** a rejected `/api/assets` leaves the map mounted and painting with its own
     `loadError` path untouched and the content area not blanked, and the failure is still reported
     where assets matter rather than degrading into a silent empty corpus.
5. **`map-boot-independence-leaves-the-store-health-screens-intact`**
   - **asserts —** the membership-error, asleep, faulted, and TAKING-LONGER screens, the banner, and
     the asleep-vs-fault distinction behave exactly as they do today, and the map is never mounted
     behind a load screen. A REGRESSION guard: it passes before and after, and the file's red comes
     from contracts 1-4.
6. **`map-boot-independence-preserves-the-prior-stages-guards`**
   - **asserts —** stage 1's SPA route retention still keeps a visited map mounted and parked, and
     stage 2's pre-paint guards (foreign client stamp, malformed entry) and `code.head` evictor all
     still fire. A REGRESSION guard, as above; stage 3's server-side memo and validators are
     protected by the no-server-change fence and by stage 3's own suite, not from this file.

## Explicitly outside this increment

- **Density, LOD, culling, aggregation, scene-graph redesign, or renderer choice** — and any change
  to `packages/forest-world`, `@storytree/app-surface`, or the world's look that the owner would
  see. ADR-0272 decision 3 DE-SEQUENCES density: flora is 62.8% of the map and deleting all of it
  reaches only 133 ms (7.6 fps); deleting flora *and* every ground cell (82% of the map) reaches
  only 33 ms. A 16.7 ms budget affords ~2,800 elements, so ~85% of the map would have to disappear
  to fix pan by density alone. It is not retired as an idea, but it may only return against its own
  fresh evidence, for a cost it can actually pay down (mount, not pan) — and it is not this unit,
  which is about ORDER, not element count. ADR-0240 decision 4 keeps it undesigned until its own
  increment, behind its own ADR and an owner attestation.
- Any regression of stage 1's SPA route retention, of stage 2's three cache guards (the client
  stamp, the server `code.head` evictor, the structural shape check), or of stage 3's corpus memo
  and its ETag / `no-cache` validators.
- Weakening store-health honesty — the load screens, the banner, the asleep-vs-fault distinction —
  in any direction. A boot that paints sooner by hiding a degraded store is a defect, not a faster
  boot.
- Caching, persisting, or validating the MUTABLE `/api/assets` payload, and any validator on a write
  path. Stages 2 and 3 both deliberately refused this; de-serialising is about ORDER, not staleness,
  and putting a staleness surface inside a write path remains a separate decision.
- Removing the `/api/comments` HTTP route, `api.listComments()`, or any per-topic comment surface
  (`InlineCommentThread`, `ReviewBlocks`, the review feed). Only the dead BOOT fetch and the dead
  `AppData` field — with the unused refresher, `openCount`, and the stale header comment that
  describes them — are removed.
- Any server change. This increment is `apps/studio/src/**` only: no route, header, ETag,
  memoization, payload-field, or endpoint change under `apps/studio/server/**`.
- Persisting or restoring the built world/scene, the camera, or any derived render state; and any
  change to the hash router, to `/api/docs`'s already-independent fetch, or to what stage 2
  persists.
