---
id: "dev-server-persistence-backbone"
tier: capability
story: studio-foundation
title: "Dev-server persistence backbone"
outcome: "Data written through the studio's API survives a dev-server restart."
status: "proposed"
proof_mode: "integration-test"
depends_on: []
---

# Dev-server persistence backbone

**Outcome —** Data written through the studio's API survives a dev-server restart.

**Depends on —** *(none — a root capability)*

> **Proof status (honest) —** CODE EXISTS AND RUNS; NO AUTOMATED PROOF. Fully implemented and live under `pnpm --filter studio dev` (vite.config.ts mounts the plugin; the server logs the data-api line on boot; assets.json holds 88 seeded records served through the real readStore path). Exercised by hand via the UI during development. But package.json defines only dev/build/preview/typecheck; no vitest/jest; zero .test/.spec files; no scripted integration test. NOT proven, NOT verified-green — all 15 contracts and the integration test are retrospective specs awaiting a runner.

## Guidance

WHY THIS IS A CAPABILITY, NOT A STORY OR CONTRACT: its honest proof is one integration test — POST, restart the process, GET — run over the real wire against real fs and the git-tracked JSON (real in-story collaborators, no stubs). No single isolated contract captures 'survives restart'; that needs two processes sharing one disk. But it is not a story either: it has no operator-facing outcome of its own — it is the persistence organ the React capabilities lean on. Everything bundled here shares ONE file mechanism (readStore/writeStore), ONE namespace seam, and that ONE integration path.

RESTART-SURVIVAL IS IMPLICIT, NOT EXPLICIT: there is no snapshot/flush/WAL code. Durability falls out of the architecture — every mutation calls writeStore synchronously to disk (devApi.ts:221,238,246,299,311,319) and every read calls readStore from disk (no in-memory cache anywhere). State lives ONLY in apps/studio/data/*.json, so a new process re-reads it. To rebuild: never add an in-memory cache without write-through, or restart-survival silently breaks.

REGISTRATION ORDER IS LOAD-BEARING: the middleware is added directly inside configureServer (devApi.ts:358), NOT in a returned post-hook. Vite runs returned hooks AFTER its SPA history-fallback (which rewrites everything to index.html). Registering directly means /api/* is matched first. Get this wrong and every /api call returns the HTML shell with 200 — a failure the contracts can't catch (they call handlers directly), so it must be asserted by the integration test against the real running server.

DEV-ONLY BY DESIGN: this backbone exists only under `vite` dev (configureServer never runs in `vite build`; see devApi.ts:8-10). Scope is exactly `pnpm --filter studio dev`; do not run the integration test against a built/preview bundle expecting persistence.

PATCH RE-VALIDATES THE WHOLE MERGED RECORD: asset PATCH (devApi.ts:308) spreads existing+patch+`id:existing.id` back through readAssetInput, re-locking the id AND re-running every guard on the merged result. createdAt is preserved by explicit carry-over (devApi.ts:309), not by the validator.

KNOWN DRIFT HAZARD: ASSET_CATEGORIES is hand-duplicated at devApi.ts:25-33 from src/types.ts:128-136 (the server can't trivially import a src value in plugin context). Contract dpb-asset-categories-allowlist-matches-types exists solely to fail if they diverge. (Verified: both arrays are ['definition','principle','pattern','guardrail','techstack','template','adr'] — 7 entries, including the seeded `template` category and the defined-but-unseeded `adr` category.)

SEED-STATE FOR THE INTEGRATION TEST: comments.json ships as [] and assets.json ships with 88 records (verified). The test must delete its probe rows at the end — these are git-tracked files and residue dirties the tree. Use collision-unlikely probe ids (e.g. 'it-probe').

NO HARNESS EXISTS YET: package.json has no test runner; zero .test/.spec files. Contracts describe the isolated unit test that WOULD prove each leaf (pure functions or handler calls with readStore/writeStore/fetch stubbed); the integration test is the across-the-wire restart walkthrough against the real fs and the real connect server. Implementing either means first adding a runner (e.g. vitest) — net-new work, not a recording of something already green.

## Integration test

**Goal —** Prove that data written through the studio's /api survives a dev-server restart — the load-bearing persistence seam every React capability leans on.

The integration test exercises this capability against its **real in-story
collaborators** — the real connect-middleware seam, the real fs, and the git-tracked JSON
stores — with **no stubs within the organism** (ADR-0010 §2/§5). It spans two processes
sharing one disk, which is exactly why this is an integration test and not a single
isolated contract: no one assertion captures "survives restart". (The `depends_on` is
empty — this is a root capability, so the test rides nothing else in-story.)

The integration test would, against the real running backbone:

1. Start the dev server: `pnpm --filter studio dev`; assert it logs the `storytree data api: ... store → apps/studio/data/` line (devApi.ts:353-355), proving the plugin mounted on the real connect server.
2. GET http://localhost:5173/api/comments → 200 with [] (seeded-empty store read through readStore's real-file path, devApi.ts:186-196); GET /api/assets → 200 with the 88 seeded records, proving the store is served from disk, not memory.
3. POST /api/comments with { topicKind:'doc', topicId:'decisions/0002-work-hierarchy-story-capability-contract.md', body:'restart-proof note', anchor:{kind:'topic'} } → 201; capture the server-stamped id (randomUUID) and assert resolved:false, createdAt set (devApi.ts:209-222).
4. POST /api/assets with a fresh kebab id { id:'it-probe', category:'pattern', title:'Probe', description:'d', body:'b', references:[] } → 201 with createdAt===updatedAt (devApi.ts:296-300).
5. GET /api/comments?topicId=decisions/0002-work-hierarchy-story-capability-contract.md → 200 returning exactly the comment just posted, proving the topicId query filter selects the new row (devApi.ts:189-196).
6. PATCH /api/comments?id=<captured-id> with { resolved:true } → 200; assert resolved:true and a non-null resolvedAt (devApi.ts:233-239). PATCH /api/assets?id=it-probe with { title:'Probe 2' } → 200 with the same createdAt but a bumped updatedAt (devApi.ts:303-312).
7. Stop the dev server (kill the Vite process) — discarding ALL in-memory state; the only survivor is the JSON on disk.
8. Restart `pnpm --filter studio dev` (a brand-new process).
9. GET /api/comments?topicId=decisions/0002-work-hierarchy-story-capability-contract.md → 200 and assert the comment is STILL there with resolved:true and its resolvedAt; GET /api/assets → the 88 seeds PLUS it-probe with title 'Probe 2'. This is the core proof: the write made before the restart is read back after it.
10. DELETE /api/comments?id=<captured-id> → 200 {ok:true}; DELETE /api/assets?id=it-probe → 200 {ok:true}. GET both again → the probe rows are gone and assets.json is back to its 88 seeded records, leaving the git-tracked stores clean (devApi.ts:242-248, 315-321).

## Contracts (15)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`dpb-api-namespace-precedes-spa-fallback`** — The /api middleware claims the /api/* namespace and passes everything else through
   - **asserts —** Invoking the middleware registered by configureServer with a request whose url starts with /api/ routes into a handler (does NOT call next), while a non-/api url (e.g. /index.html) calls next() exactly once — proving /api is owned before Vite's SPA fallback.
   - **covers —** `apps/studio/server/devApi.ts:358-371`
2. **`dpb-error-thrown-becomes-json-envelope`** — A thrown HttpError is serialised to its status + {error} JSON
   - **asserts —** When a routed handler throws new HttpError(404,'unknown endpoint'), the response statusCode is 404 and the body is {"error":"unknown endpoint"}; a non-HttpError throw yields statusCode 500 with its message.
   - **covers —** `apps/studio/server/devApi.ts:372-375`
3. **`dpb-readstore-falls-back-when-absent-or-blank`** — readStore returns the fallback for a missing or blank file
   - **asserts —** readStore(<nonexistent path>, []) resolves to [], and readStore(<whitespace-only file>, []) also resolves to [] rather than throwing a JSON parse error.
   - **covers —** `apps/studio/server/devApi.ts:83-87`
4. **`dpb-writestore-then-readstore-roundtrip-persists`** — writeStore persists pretty JSON that readStore reads back identically
   - **asserts —** After writeStore(tmpFile,[{a:1}]) — creating parent dirs as needed — readStore(tmpFile,[]) deep-equals [{a:1}], and the file content is 2-space-indented JSON terminated by a newline.
   - **covers —** `apps/studio/server/devApi.ts:89-92`
5. **`dpb-comments-get-filters-by-topic`** — GET /api/comments filters by topicId and topicKind
   - **asserts —** Given a store of comments across two topicIds, handleComments on a GET whose url carries ?topicId=X returns only the X comments; with no query params it returns all.
   - **covers —** `apps/studio/server/devApi.ts:188-196`
6. **`dpb-comments-post-stamps-server-fields`** — POST /api/comments stamps id, createdAt, resolved=false and persists
   - **asserts —** A valid POST body produces a 201 whose returned comment has a generated id, ISO createdAt, resolved=false/resolvedAt=null, and writeStore is called once with the new comment appended.
   - **covers —** `apps/studio/server/devApi.ts:199-222`
7. **`dpb-comments-post-rejects-bad-topickind`** — POST /api/comments rejects a topicKind outside {doc,asset} and missing body/topicId
   - **asserts —** A POST with topicKind='channel' throws HttpError(400,'topicKind must be "doc" or "asset"'); an empty body throws 400 'comment body is required'; an empty topicId throws 400 'topicId is required'.
   - **covers —** `apps/studio/server/devApi.ts:204-208`
8. **`dpb-comments-patch-resolved-sets-resolvedat`** — PATCH /api/comments?id toggles resolved and stamps/clears resolvedAt
   - **asserts —** Patching an existing comment with {resolved:true} returns it with resolved=true and a non-null resolvedAt; patching {resolved:false} returns resolvedAt=null; a body-only patch leaves resolved untouched.
   - **covers —** `apps/studio/server/devApi.ts:225-239`
9. **`dpb-comments-mutate-unknown-id-404`** — PATCH/DELETE on an unknown comment id is a 404
   - **asserts —** handleComments PATCH or DELETE with ?id=missing (no matching row) throws HttpError(404,'comment not found') and does not call writeStore.
   - **covers —** `apps/studio/server/devApi.ts:227-228, 242-245`
10. **`dpb-asset-input-requires-kebab-slug`** — readAssetInput rejects a non-kebab-case id
   - **asserts —** readAssetInput({id:'Not Slug',...valid}) throws HttpError(400,'id must be a kebab-case slug (a-z, 0-9, hyphens)'); a clean slug like 'deep-modules' passes the isValidSlug gate.
   - **covers —** `apps/studio/server/devApi.ts:253-254, 263`
11. **`dpb-asset-input-requires-known-category-and-fields`** — readAssetInput rejects an unknown category and missing title/description/body
   - **asserts —** A category not in ASSET_CATEGORIES throws 400 'invalid category'; empty title/description/body each throw their specific 400 ('title is required', etc.).
   - **covers —** `apps/studio/server/devApi.ts:264-267`
12. **`dpb-asset-post-duplicate-id-409`** — POST /api/assets with an existing id is a 409
   - **asserts —** handleAssets POST whose validated id already exists in the store throws HttpError(409,'an asset with id "<id>" already exists') and does not call writeStore.
   - **covers —** `apps/studio/server/devApi.ts:293-294`
13. **`dpb-asset-patch-relocks-id-preserves-createdat`** — PATCH /api/assets re-locks id to the existing row and preserves createdAt while bumping updatedAt
   - **asserts —** Patching asset 'x' with a body that also carries {id:'y'} returns an asset whose id is still 'x', whose createdAt equals the original, and whose updatedAt differs from createdAt.
   - **covers —** `apps/studio/server/devApi.ts:303-312`
14. **`dpb-asset-categories-allowlist-matches-types`** — The server ASSET_CATEGORIES allow-list equals the canonical types.ts list
   - **asserts —** The ASSET_CATEGORIES array in server/devApi.ts deep-equals ASSET_CATEGORIES exported from src/types.ts — both the 7-entry list ['definition','principle','pattern','guardrail','techstack','template','adr'] — a guard against the duplicated allow-list drifting.
   - **covers —** `apps/studio/server/devApi.ts:25-33`
15. **`dpb-api-client-unwraps-error-envelope`** — api.ts http<T> throws the server's {error} message on a non-ok response
   - **asserts —** http<T> given a stubbed fetch returning {ok:false,status:409,text:()=>'{"error":"dup"}'} rejects with Error('dup'); on ok it resolves to the parsed body; an empty body parses to null.
   - **covers —** `apps/studio/src/api.ts:12-24`
