---
id: "dev-server-persistence-backbone"
tier: capability
story: studio
title: "The studio's API backbone — one route table, two mounts, a swappable store"
outcome: "Every studio surface reaches its data through one /api/* route table that claims the namespace before the SPA fallback, answers a failure as a typed JSON envelope rather than an HTML shell, and persists through a store seam whose writes survive the process that made them."
status: "proposed"
proof_mode: "integration-test"
depends_on: []
---

# The studio's API backbone — one route table, two mounts, a swappable store

**Outcome —** Every studio surface reaches its data through one `/api/*` route table that claims the
namespace before the SPA fallback, answers a failure as a typed JSON envelope rather than an HTML
shell, and persists through a store seam whose writes survive the process that made them.

**Depends on —** *(none — a root capability)*

> ## ⚠ RE-SCOPED, 2026-08-31 — `prove-unproven-capabilities-arc` inc-25, Group 2
>
> **This capability was routed here rather than adopted, and the routing reason is worth keeping.**
> Increment 22 sorted it into the ADOPT pile on the strength of `apps/studio` now running
> `vitest run src/ server/` over dozens of suites — which is true, and which is not the same as this
> unit being proven. Increment 23 corrected it: all fifteen contracts cited line ranges in
> `apps/studio/server/devApi.ts`, and that file holds none of the code they describe. Adopting on
> that basis would have attached a signed verdict to a claim false in the specific way ADR-0465 D2 is
> least able to tolerate.
>
> **What actually moved (verified at source, 2026-08-31, in this worktree):**
> - **The route table left.** `handleApiRequest` and every handler — docs, assets, comments, users,
>   attestations, health, activity, claims, tree, arcs, traversal, suggestions, the write-broker —
>   live in `apps/studio/server/apiRouter.ts`, together with `readAssetInput`, `safeDocPath`, the
>   central `catch`, and the status mapping. That table is owned by `studio-cloud`'s `serve-mode`
>   capability: ONE table for two mounts.
> - **`devApi.ts` is now 123 lines of VITE WIRING.** It resolves paths, picks the backend, primes
>   three lazy imports and the pg pool, installs the dev-server resilience guard, logs the data-api
>   line, tears the pool down on close, and registers ONE middleware that delegates to
>   `handleApiRequest`. It re-exports three handlers for existing tests. Nothing else.
> - **`readStore` / `writeStore` are gone from the API layer entirely.** They are now
>   module-private functions of `apps/studio/server/libraryBackend.ts`, used only by `JsonBackend`.
> - **The JSON store is no longer the default.** `selectedStore()` returns `pg` unless
>   `STORYTREE_STUDIO_STORE=json`. `apps/studio/data/assets.json` does not exist; the offline backend
>   writes a GITIGNORED `assets.runtime.json` it derives on first read, and `apps/studio/data/` holds
>   two files, `comments.json` and `unit-status.json`.
> - **So "survives a dev-server restart" is no longer the whole outcome, or even the usual one.** In
>   the default posture durability is Cloud SQL's, and the interesting property is the SEAM — that
>   two backends answer one `LibraryBackend` interface and every surface reaches data through it —
>   not a JSON file surviving a `kill`.
>
> **NO `proof:` BLOCK IS AUTHORED HERE, AND THE ABSENCE IS THE FINDING — but read the gap precisely,
> because it is narrower than "unproven".** Real coverage exists and is substantial; it is named
> under § Coverage below with what it does and does not reach. Naming a command that only looks like
> it exercises this unit is the failure this re-scope exists to avoid.

## Guidance

**WHY THIS IS STILL A CAPABILITY, NOT A STORY OR A CONTRACT.** No isolated contract captures
"reaches its data through one table" or "survives the process that wrote it" — the first needs the
real dispatch and the second needs two readers that share no memory. But it has no operator-facing
outcome of its own: it is the organ the surface capabilities lean on. Everything bundled here shares
ONE dispatch seam, ONE store interface, and ONE integration path.

**THE NAME IS NOW HALF WRONG AND IS KEPT ON PURPOSE.** "dev-server" was accurate when
`configureServer` was the only mount. The same table is mounted by `server/serve.ts` for the hosted
studio behind IAP, so this capability is not dev-scoped any more. The id is left alone because it is
referenced by three sibling specs and by the story's dependency graph; renaming it would be a
graph-wide edit for a cosmetic gain. Read `dev-server` as historical.

**REGISTRATION ORDER IS STILL LOAD-BEARING, AND IT SURVIVED THE MOVE VERBATIM.** The middleware is
added directly inside `configureServer`, NOT in a returned post-hook: Vite runs returned hooks AFTER
its SPA history fallback, which rewrites everything to `index.html`. Registering directly means
`/api/*` is matched first. Get this wrong and every `/api` call returns the HTML shell with 200 — a
failure no handler-level contract can catch, because the handlers are never reached. The middleware's
own rule is one line: a pathname not starting with `/api/` calls `next()`, everything else goes to
`handleApiRequest`.

**THE ERROR ENVELOPE IS ONE CENTRAL `catch` WITH FOUR ARMS, and the two middle ones are the
interesting ones.** `HttpError` → its own status + `{error, ...details}`; a `LastAdminError`,
identified by `name` alone so neither the route layer nor the JSON backend has to import the store's
class, → 409; `isConnectionError` → 503 carrying the "start the DB" remedy, so the UI can tell a
stopped store from a server bug; anything else → 500. An unmatched path throws
`HttpError(404,'unknown endpoint')` into the same catch.

**THE STORE SEAM IS THE `LibraryBackend` INTERFACE, AND `selectedStore()` IS THE FORK.**
`createBackend` returns `PgBackend` (Cloud SQL, the default) or `JsonBackend` (the offline opt-out,
`STORYTREE_STUDIO_STORE=json`: no DB, $0, per-worktree state). Every handler talks to the interface,
never to a file or a pool — which is what lets one route table serve both postures and lets an
integration test pin the offline seam (ADR-0010 §5) without stubbing anything inside the organism.

**DURABILITY IN THE JSON POSTURE IS STILL IMPLICIT, NOT EXPLICIT.** There is no snapshot, flush or
WAL. Every mutation calls `writeStore` synchronously to disk and every read calls `readStore` from
disk; there is no in-memory cache anywhere in `JsonBackend`. State lives only in
`apps/studio/data/*.json`, so a new reader re-reads it. To rebuild: never add a cache without
write-through, or restart-survival silently breaks. `readStore` falls back for a MISSING file and,
separately, for a present-but-BLANK one — `raw.trim() ? JSON.parse(raw) : fallback` — so a truncated
write degrades to empty rather than throwing a parse error at the handler.

**THE SEED IS DERIVE-ON-FIRST-READ AND MUST STAY IDEMPOTENT.** `JsonBackend` seeds
`assets.runtime.json` from `loadSeedUnits` on a cold store only; a present store is never re-seeded,
which is what lets an operator's edit survive a restart. Without a loader, an absent store reads
empty — the pre-ADR-0210 behaviour the integration tests rely on.

**KNOWN DRIFT HAZARD — IT SURVIVED THE MOVE, AND SO MUST ITS GUARD.** `ASSET_CATEGORIES` is still
hand-duplicated: `apps/studio/server/apiRouter.ts` vs `apps/studio/src/types.ts`. The server cannot
trivially import a `src` value in plugin context. Do NOT re-pin the list's LENGTH in a contract the
way the old text did (it said seven; the set has grown since) — assert the two arrays are equal, which
is the only assertion that cannot go stale.

**THE MEMO AND ITS VALIDATORS ARE `map-server-memo`'s, NOT THIS UNIT'S.** `/api/docs` and `/api/tree`
answer through `memoizeCorpusWalk` with `no-cache` + `ETag`; that capability proves it. This one owns
the dispatch those routes ride, and must leave their bodies unchanged.

**PATHS.** `resolveStudioPaths` puts the JSON store at `apps/studio/data/`:
`assets.runtime.json` (gitignored), `comments.json`, `users.json`, `attestations.json`. A probe row
in a git-tracked file is residue; use `assets.runtime.json` or a temp dir, and collision-unlikely ids.

## Coverage — what exists today, and what does not

Recorded so the gap is visible rather than inferred, and so nobody re-litigates the increment-22
adopt call. This is NOT a proof claim.

**Genuinely exercised through the REAL route table, over a REAL socket** (`pnpm --filter studio
test`): nine suites build a server through `createStudioServer` (or drive `handleApiRequest`
directly) and therefore run the real dispatch, the real gate and the real central error mapping —
`serveApi`, `reviewFeedApi`, `writeBrokerApi`, `uatAttestApi`, `storeDoorApi`, `suggestionCreateApi`,
`suggestionDecisionApi`, `suggestionAcceptApplyApi`, and `mapServerMemo`. That is real, load-bearing
coverage of this capability's dispatch-and-envelope half, and it is why this unit is not described as
unproven.

**The store seam's own durability IS proven, at the backend grain:**
`server/libraryBackend.seed.test.ts` seeds a cold store, writes an asset through `createAsset`, then
opens a SECOND `JsonBackend` over the same directory and reads the edit back — a real
`writeStore` → `readStore` round trip across readers that share no memory, plus the
absent-store-reads-empty fallback.

**Exercised by NOTHING — and this is the specific list, not a general disclaimer:**
- **The Vite middleware's own ordering rule.** Every suite above mounts `server/serve.ts`; none
  mounts the `configureServer` plugin. So "`/api/*` is claimed before the SPA fallback, and a
  non-`/api` url calls `next()` exactly once" — the failure mode that returns an HTML shell with
  200 — is asserted nowhere.
- **`readStore`'s BLANK-file arm.** The seed suite covers the ABSENT file; the `raw.trim()` fallback
  for a present-but-empty file is untouched.
- **`api.ts`'s `http<T>` error-envelope unwrap** — that a non-ok response rejects with the server's
  `{error}` message rather than a status string, and that an empty body parses to null.
- **`isConnectionError` → 503 and `isLastAdminError` → 409** as behaviours of the central catch. Note
  the trap here: eight of the seventeen `*.integration.test.ts` suites build their own miniature
  server and RE-IMPLEMENT the `HttpError`→JSON mapping inline (`arcsApi.integration.test.ts` does it
  in four lines). Those suites prove their own handler; they do not exercise this catch, and reading
  the file list as if they did is how this capability came to look adopt-eligible.
- **The `ASSET_CATEGORIES` drift guard.** The duplication is live and nothing compares the two lists.

## Integration test

**Goal —** Prove that every studio surface reaches its data through ONE `/api/*` table that claims
the namespace ahead of the SPA fallback, that a failure comes back as a typed JSON envelope rather
than an HTML shell, and that a write made through it is read back by a process that never held it.

The integration test exercises this capability against its **real in-story collaborators** — the real
Vite middleware registration, the real route table, the real store seam and a real filesystem — with
**no stubs within the organism** (ADR-0010 §2/§5). It pins the offline JSON seam
(`STORYTREE_STUDIO_STORE=json`, permitted by ADR-0010 §5) over a TEMP data dir, so it spans two
processes without touching the shared store or dirtying a git-tracked file. (`depends_on` is empty —
this is a root capability, so the test rides nothing else in-story.) It would:

1. Start the Vite dev server over a temp data dir and assert it logs the
   `storytree data api: docs ← …/ · library/comments → …` line naming the SELECTED store — proving
   the plugin mounted on the real connect server and picked a backend.
2. THE ORDERING LEG, and the reason this is an integration test at all. `GET /api/nope` must answer
   **404 with `content-type: application/json` and a `{"error":"unknown endpoint"}` body** — NOT a
   200 carrying the `index.html` shell. Then `GET /` must answer the SPA shell, proving the
   middleware passed a non-`/api` url through with `next()` rather than swallowing the namespace.
   Assert on the content type, not only the status: an HTML shell served at 200 is exactly the
   failure this leg exists to catch, and a status-only assertion would miss it.
3. `GET /api/assets` → 200 with the derived offline seed (its size read from the derivation seam,
   never pinned — the fixture drifts by design, ADR-0302 D1). `GET /api/comments` → 200 `[]`.
4. POST a probe artifact → 201 with `createdAt === updatedAt`. POST the same id again → **409**,
   carrying the store's conflict message through `assetWriteError` — the envelope, not a throw.
5. POST a comment → 201 with a server-stamped id, ISO `createdAt`, `resolved:false`. PATCH it
   `{resolved:true}` → 200 with a non-null `resolvedAt`; PATCH `{resolved:false}` → `resolvedAt`
   back to null. (The comment STORE and its routes are deliberately retained by ADR-0425 dec 5 even
   though no studio surface writes a comment; this leg is what keeps that retention honest rather
   than dead.)
6. PATCH the probe artifact with a body carrying a DIFFERENT id → 200, and the stored id is
   unchanged: the query-string id is spread last.
7. Stop the process, discarding all in-memory state — the only survivor is what is on disk.
8. Start a SECOND process over the same temp data dir and, without any prior write,
   `GET /api/assets` and `GET /api/comments`. Assert the probe artifact is present with its edit and
   the comment with its `resolvedAt`. This is the core proof: a write made before the restart is read
   back after it, by a process that never held it.
9. Blank one store file to whitespace and `GET` it: assert an EMPTY collection, not a 500 — the
   `readStore` fallback degrading a truncated write rather than throwing a parse error at the
   handler.
10. DELETE both probe rows → 200 `{ok:true}` each; DELETE either again → 404. Assert the temp stores
    are back to their seeded state, so the walk leaves no residue.

## Contracts (14)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). The `covers —` lines are the CURRENT homes, re-verified 2026-08-31; the fifteen this spec
carried before all cited `apps/studio/server/devApi.ts`, which holds none of this code. Where a
contract has a real test today it says so; the rest are the gap recorded under § Coverage.

1. **`dpb-api-namespace-precedes-spa-fallback`** — The Vite middleware claims `/api/*` and passes everything else through
   - **asserts —** The middleware registered by `configureServer` routes a request whose url starts with `/api/` into `handleApiRequest` and does NOT call `next()`; a non-`/api` url (e.g. `/index.html`) calls `next()` exactly once and reaches no handler. Registration happens directly in `configureServer`, not in a returned post-hook.
   - **covers —** `apps/studio/server/devApi.ts` `configureServer` (the middleware)
2. **`dpb-httperror-becomes-json-envelope`** — A thrown HttpError is serialised to its status + `{error}` JSON
   - **asserts —** When a routed handler throws `new HttpError(404,'unknown endpoint')`, the response is 404 with body `{"error":"unknown endpoint"}`; an `HttpError` carrying `details` merges them into the same object; an unrecognised throw yields 500 with its message.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleApiRequest` (the central catch)
3. **`dpb-connection-failure-becomes-503-with-remedy`** — A store-down error is 503, not 500
   - **asserts —** `isConnectionError` returns true for the pg admin-shutdown / connection codes and the socket codes, and false for an `HttpError`, an `AssetConflictError`, a `ZodError` and a `LastAdminError`; the catch answers such an error 503 carrying the "start the DB" remedy so the UI can offer the button.
   - **covers —** `apps/studio/server/apiRouter.ts` `isConnectionError` + the central catch
4. **`dpb-last-admin-violation-becomes-409-by-name`** — A last-admin guard violation is 409, identified by `name` alone
   - **asserts —** An error whose `name` is `LastAdminError` — thrown as the real class by the pg store and as a tagged `Error` by the JSON backend — is answered 409 with its message, without either layer importing the store's class.
   - **covers —** `apps/studio/server/apiRouter.ts` `isLastAdminError` + the central catch
5. **`dpb-readstore-falls-back-when-absent-or-blank`** — readStore returns the fallback for a missing OR blank file
   - **asserts —** `readStore(<nonexistent>, [])` resolves to `[]`, and `readStore(<whitespace-only file>, [])` also resolves to `[]` rather than throwing a JSON parse error.
   - **covers —** `apps/studio/server/libraryBackend.ts` `readStore` (module-private) — the ABSENT arm has a test via `server/libraryBackend.seed.test.ts`; the BLANK arm has none
6. **`dpb-writestore-then-readstore-roundtrip-persists`** — writeStore persists pretty JSON that readStore reads back identically
   - **asserts —** After `writeStore(tmpFile,[{a:1}])` — creating parent dirs as needed — `readStore(tmpFile,[])` deep-equals `[{a:1}]`, and the file content is 2-space-indented JSON terminated by a newline.
   - **covers —** `apps/studio/server/libraryBackend.ts` `writeStore` — HAS A TEST at the backend grain: `server/libraryBackend.seed.test.ts` (create → reopen → read back)
7. **`dpb-json-seed-is-cold-store-only`** — The derive-on-first-read seed never clobbers a present store
   - **asserts —** `JsonBackend` with a seed loader derives and writes the runtime store on a cold read; a SECOND backend over the same dir does not re-seed, so an asset created through the first is still there; with no loader, an absent store reads `[]`.
   - **covers —** `apps/studio/server/libraryBackend.ts` `JsonBackend` — HAS A TEST: `server/libraryBackend.seed.test.ts`
8. **`dpb-selectedstore-forks-the-backend`** — The store fork is one env var and the default is pg
   - **asserts —** `selectedStore()` returns `'json'` only for `STORYTREE_STUDIO_STORE === 'json'` and `'pg'` for unset, empty, or any other value; `createBackend` returns a `JsonBackend` for the former and a `PgBackend` for the latter, and both satisfy the `LibraryBackend` interface.
   - **covers —** `apps/studio/server/libraryBackend.ts` `selectedStore` / `createBackend`
9. **`dpb-comments-get-filters-by-topic`** — GET /api/comments filters by topicId
   - **asserts —** Given comments across two topicIds, `handleComments` on a GET carrying `?topicId=X` returns only the X comments; with no query params it returns all.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleComments`
10. **`dpb-comments-post-stamps-server-fields-and-validates`** — POST /api/comments stamps the server fields and rejects bad input
   - **asserts —** A valid POST yields 201 with a generated id, ISO `createdAt`, `resolved:false` / `resolvedAt:null`, persisted once; a `topicKind` outside `{doc,asset}`, an empty body and an empty topicId each throw their specific 400.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleComments`
11. **`dpb-comments-patch-resolved-sets-and-clears-resolvedat`** — PATCH toggles resolved and stamps/clears resolvedAt; an unknown id 404s
   - **asserts —** `{resolved:true}` returns the comment with a non-null `resolvedAt`; `{resolved:false}` clears it to null; a BODY-ONLY patch leaves `resolved` and `resolvedAt` untouched; PATCH or DELETE with an id matching no row throws 404 and persists nothing. (Retained deliberately under ADR-0425 dec 5 — the store outlives the retired surface.)
   - **covers —** `apps/studio/server/apiRouter.ts` `handleComments`
12. **`dpb-asset-input-validates-slug-category-and-either-body-or-fields`** — readAssetInput's guard, including the either/or that replaced "body is required"
   - **asserts —** `HttpError(400)` for a non-kebab id, for a category outside `ASSET_CATEGORIES`, for an empty title and for an empty description; and a 400 only when BOTH `body` and `fields` are empty — a fields-only structured input and a body-only one both pass.
   - **covers —** `apps/studio/server/apiRouter.ts` `readAssetInput`
13. **`dpb-asset-patch-relocks-id-from-the-query-string`** — PATCH re-locks the id to the route's and 404s an unknown one
   - **asserts —** `handleAssets` PATCH for `?id=x` with a body carrying `{id:'y'}` calls `updateAsset('x', …)` with an input whose id is `'x'`; a backend returning null yields `HttpError(404,'asset not found')`.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleAssets`
14. **`dpb-asset-categories-allowlist-matches-types`** — The server allow-list equals the canonical client list
   - **asserts —** `ASSET_CATEGORIES` in `server/apiRouter.ts` deep-equals `ASSET_CATEGORIES` exported from `src/types.ts`. Assert EQUALITY, never a pinned length or a literal list — the set grows, and a pinned count is a guard that goes stale in the reassuring direction.
   - **covers —** `apps/studio/server/apiRouter.ts` + `apps/studio/src/types.ts`

**One contract of the old fifteen is homeless and is recorded rather than dropped.**
`dpb-api-client-unwraps-error-envelope` — that `http<T>` in `apps/studio/src/api.ts` rejects with the
server's `{error}` message on a non-ok response and parses an empty body to null — is the CLIENT half
of contract 2 and is exercised by nothing. It is left out of the numbered set because `api.ts` is
story-grain infrastructure no capability owns (the same shape `arc-orientation-lens` records for
`api.ts` / `poll.ts` / `types.ts` / `route.ts`), and quietly annexing it here would invent an
ownership claim rather than record one. The honest state is: the envelope has a server author and no
client author.
