---
id: "author-library-artifact"
tier: capability
story: studio
title: "Author, edit, and delete Library artifacts"
outcome: "An admin durably changes the Library's contents through the structured editor form, and the store — not the form — is what refuses invalid or unauthorised writes."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone, browse-library]
---

# Author, edit, and delete Library artifacts

**Outcome —** An admin durably changes the Library's contents through the structured editor form,
and the store — not the form — is what refuses invalid or unauthorised writes.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md),
[`browse-library`](browse-library.md)

> ## ⚠ RE-SCOPED, 2026-08-31 — `prove-unproven-capabilities-arc` inc-25, Group 2
>
> **The journey is intact — open the editor, create, edit, delete, land on the detail — and every
> mechanism under it changed.** Verified at source, 2026-08-31, in this worktree:
>
> - **The form is STRUCTURED now, not free-markdown.** `AssetEditor` renders per-kind fields from
>   `KIND_SPECS` (`src/lib/knowledgeFields.ts`, imported through `@storytree/library/knowledge`), and
>   for a structured kind the BODY IS DERIVED from those fields by `renderBody` rather than typed.
>   Only a body-only kind (`template` / `adr`) still authors markdown directly. The old spec's
>   "fill Body (markdown)" step is true for two kinds out of the set and false for the rest.
> - **There are per-category TEMPLATES and required sections.** `src/lib/templates.ts` supplies a
>   `Start from template` prefill (body-only kinds) and `requiredSections` — the load-bearing case
>   being `guardrail`, which the editor REFUSES to save without an "Enforced by" section, because
>   naming its deterministic enforcement is what separates a guardrail from a pattern.
> - **There is an RBAC GATE, and it is the outcome's real subject.** `createMembersPolicy`
>   (`server/guestPolicy.ts`) makes every non-comment write admin-only: a member reading the corpus
>   gets 200s and a `POST /api/assets` 403; a non-member gets 403 with a `requestAccess` marker on
>   everything but `GET /api/me`. The old spec, written for the open localhost posture, described no
>   authorization at all. The open dev posture still exists (`DEV_ME` is `role: 'admin'`), so this is
>   a POSTURE difference, not a contradiction — but a spec that names only the open one is describing
>   half the product.
> - **The handlers moved and the validation SPLIT IN TWO.** `readAssetInput` and `handleAssets` live
>   in `server/apiRouter.ts` now, so every `devApi.ts:NNN` citation below pointed at nothing.
>   And `readAssetInput` is no longer the whole guard: it checks the slug, the category, title and
>   description, and then requires EITHER a non-empty `body` OR a non-empty `fields` — the per-field
>   structural validation happens further down, at the STORE's zod write boundary, and
>   `assetWriteError` maps a `ZodError` to 400 and an `AssetConflictError` to 409. So the duplicate-id
>   409 is now the store's answer, not a pre-write existence check in the handler.
> - **The store is not a JSON file by default.** `selectedStore()` returns `pg` unless
>   `STORYTREE_STUDIO_STORE=json`; `apps/studio/data/assets.json` does not exist and the offline
>   backend writes a gitignored `assets.runtime.json` it derives on first read. "Durably changes"
>   means the shared Cloud SQL store in the live posture.
> - **The `browse-library` edge survives, narrowed with its target.** That capability is itself
>   narrowed in this pass onto the artifact DETAIL render; the post-mutation
>   `refreshAssets()` → `navigate(assetHref(saved.id))` tail still lands there, and the delete
>   confirm gate lives in `AssetView.remove()`, so the edge is if anything tighter than before.
>
> ## ⚠ AND A GAP THAT IS NOT PART OF THE RE-SCOPE — surfaced separately so it is not folded away
>
> **EDIT AND DELETE HAVE NO AUTOMATED COVERAGE OF ANY ERA, IN ANY POSTURE.** This is a standing hole
> in the studio's proof surface, independent of every wording change above, and it is recorded here
> because this is the capability that owns those two verbs.
>
> Measured 2026-08-31 across the whole `apps/studio` suite: no test anywhere issues a
> `PATCH /api/assets` or a `DELETE /api/assets`; there is no `AssetEditor.test.tsx` and no
> `AssetView.test.tsx`. What IS covered is CREATE, and only create —
> `server/serveApi.integration.test.ts` drives `POST /api/assets` end to end through
> `createStudioServer` over a real socket with the real gate (a member 403, the bootstrap-seed admin
> 201, and a structured `friction` write accepted with its per-kind fields), and
> `server/guestPolicy.test.ts` proves the gate's own decision for `POST /api/assets`.
>
> So the specific things nothing proves are: the id RE-LOCK on PATCH (the one-liner below, the whole
> reason a body carrying a different id cannot rename a record); `createdAt` preservation and the
> `updatedAt` bump; the 404 on PATCH/DELETE of an unknown id; the delete confirm gate; the editor's
> required-section and required-field refusals; and the slug auto-derive. The re-scope does not
> close any of them and does not pretend to.
>
> **NO `proof:` BLOCK IS AUTHORED HERE, and the absence is the finding.** Attaching one on the
> strength of the create-path coverage would sign a verdict for a capability whose title names three
> verbs and whose proof reaches one.

## Guidance

**VALIDATION IS NOW THREE LAYERS, AND THE CONTRACTS TARGET THE TWO DURABLE ONES.** (1) The editor's
own refusals, which are the only place some rules exist at all: `missingRequiredFields` for a
structured kind, `missingSections`/`requiredSections` for a body-only kind. (2) `readAssetInput` in
`server/apiRouter.ts` — the slug shape, the category allowlist, non-empty title and description, and
the either/or on `body`/`fields`. (3) The store's zod write boundary, reached through
`backend.createAsset` / `updateAsset` and surfaced by `assetWriteError` as 400 (ZodError) or 409
(`AssetConflictError`). Layer 1 is genuinely load-bearing and must not be dismissed as "client-side
guards" the way the old text did — the guardrail "Enforced by" rule has no server enforcement.

**THE ID RE-LOCK MOVED BUT DID NOT WEAKEN, AND IT IS EASY TO MISS TWICE.** `handleAssets`'s PATCH arm
builds `readAssetInput({ ...(await readJsonBody(req)), id })` where `id` comes from the QUERY STRING
and is applied LAST. The spread order is load-bearing: a body carrying a different id cannot rename
the record. The disabled Id input in edit mode is only the UI half of that lock. Note the shape
changed — it used to spread over `existing`, so `createdAt` was carried in the handler; the record's
identity and timestamps are the store's business now.

**THE NEW+EDIT MERGE IS STILL ONE COMPONENT AND ONE `save()`.** `AssetEditor` switches on a `mode`
prop; `save()` branches `api.updateAsset(id, input)` vs `api.createAsset(input)` and shares one
`refreshAssets()` → `navigate(assetHref(saved.id))` tail. There is no optimistic local mutation, so
what renders after any save is the re-read corpus — which is why the detail footer's timestamps are
ground truth for an integration test.

**EDIT MODE CARRIES THE SAME THREE-WAY HONESTY BRANCH AS THE DETAIL RENDER.** `mode === 'edit'` with
no matching asset does not immediately say "not found": `assetsStatus === 'loading'` says the corpus
is loading, `'error'` names the failure, and only `ready` renders the not-found box. Same reason as
`browse-library`'s — `map-boot-independence` lets a Library route mount before `/api/assets`
resolves.

**THE LIVE PREVIEW IS A REAL DERIVATION, NOT A TEXTAREA ECHO — and for a structured kind it is the
thing that gets SAVED.** `renderFieldsPreview` runs the library's own `renderBody`, so the preview is
byte-identical to the body the store will hold, and `save()` passes exactly that `previewBody` as
`input.body`. The store re-derives on read, so the stored body never becomes authoritative over the
fields.

**NO ID GENERATION.** An artifact's id is the user-supplied slug (auto-derived from the title by
`slugify` until the id field is touched). Unlike comments, nothing mints one server-side.

**THE POSTURE FORK, stated once so no contract has to restate it.** Open dev (`pnpm --filter studio
dev`, no policy): `DEV_ME` is `role: 'admin'`, writes are unguarded, and this is the posture the old
spec described. Hosted (`server/serve.ts` behind IAP): `createMembersPolicy` gates by
`(method, path, access)` — user management admin-only by path, asset and other non-comment writes
admin-only by method, comment writes open to members and scoped to their own, and the write-broker
the single non-comment exception a `builder` may make.

## Integration test

**Goal —** An admin durably changes the Library's contents through the editor form — creating a
structured artifact from its per-kind fields, editing it, then deleting it — each mutation surviving
as a real change in the store; and a member attempting the same write is refused by the server rather
than by the form.

The integration test exercises author-library-artifact against its **real in-story collaborators** —
the real `POST` / `PATCH` / `DELETE /api/assets` handlers and the real store behind them
(`dev-server-persistence-backbone`), and the real detail render each save/delete navigates into
(`browse-library`) — with **no stubs within the organism** (ADR-0010 §2/§5). It runs against the
offline JSON backend (`STORYTREE_STUDIO_STORE=json`, the seam ADR-0010 §5 permits) so it leaves no
residue in the shared store, and it uses a collision-unlikely probe id. It would:

1. Start the studio and open `#/asset/new`. Assert `AssetEditor` mounts in `new` mode with an empty
   form and the id input ENABLED.
2. Type a Title. Assert the Id field auto-derives its slug live while the id is untouched; then edit
   the Id directly and assert a later Title change no longer moves it.
3. Choose a STRUCTURED kind and assert the form renders that kind's fields from `KIND_SPECS` — with
   their headings as labels and their placeholders — rather than a free markdown Body box.
4. Attempt to save with a required field blank. Assert the EDITOR refuses, naming the missing field,
   and that no request is issued. Then choose `guardrail` in a body-only flow, omit "Enforced by",
   and assert the editor refuses with the discriminating reason — that without it the unit is a
   pattern, not a guardrail. These two refusals exist ONLY in the editor; no server layer repeats
   them.
5. Fill the required fields and assert the live preview renders the DERIVED body — byte-identical to
   what `renderBody` produces for those fields — and that it updates as the fields change.
6. Click Create. Assert `POST /api/assets` returns 201, the app refreshes the corpus and navigates to
   `#/asset/<slug>`, and the detail renders with `created` equal to `updated`.
7. Assert durability of the create by reading it back from the store on a fresh read, and assert the
   stored record carries its structured `fields`, not only the derived body.
8. POST the SAME id again and assert 409 — the store's conflict, mapped by `assetWriteError`, not a
   pre-write existence check.
9. From the detail click Edit. Assert the form pre-fills from the existing artifact with the Id input
   DISABLED, change a field, and save. Assert `PATCH /api/assets?id=<slug>` returns 200 and that a
   body carrying a DIFFERENT id does not rename the record — the query-string id wins because it is
   spread last. Assert `createdAt` is preserved and `updatedAt` has advanced, and that the detail's
   footer shows it.
10. Click Delete and DISMISS the confirm. Assert nothing happens — no DELETE issued, the record still
    present. Click Delete again and ACCEPT. Assert `DELETE /api/assets?id=<slug>` returns
    `{ok:true}`, the app navigates to the Library lens, and the record is gone from the store.
11. Assert `PATCH` and `DELETE` for an id that does not exist both answer 404 rather than silently
    succeeding.
12. THE AUTHORIZATION LEG. Under the hosted posture with a MEMBER identity, assert
    `POST`/`PATCH`/`DELETE /api/assets` are all refused 403 by the gate before any handler runs,
    while `GET /api/assets` is 200 — so the refusal is the server's and does not depend on the UI
    hiding a button.

## Contracts (12)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). The `covers —` lines are the CURRENT homes, re-verified 2026-08-31. Where a contract has
a real test today it says so; the rest are the gap recorded in the banner above, and contracts 8–11
in particular are the EDIT and DELETE hole.

1. **`ala-title-derives-slug-until-id-touched`** — New-mode title edit auto-fills the id from the slug until the id is touched
   - **asserts —** In `mode='new'` with the id untouched, typing a Title sets `form.id` to `slugify(title)`; once the id field has been edited, a later title change leaves `form.id` unchanged. In `mode='edit'` the derive never fires.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` `onTitle`
2. **`ala-structured-kind-renders-its-kind-fields`** — A structured kind renders per-kind fields, not a markdown body box
   - **asserts —** Selecting a structured category renders one input per `fieldSpecsFor(category)` entry, labelled from the spec heading with its placeholder, and renders no free Body textarea; a body-only category (`template` / `adr`) renders the Body textarea and no per-kind fields.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` + `src/lib/knowledgeFields.ts`
3. **`ala-required-field-refusal-is-editor-side`** — A structured kind with a required field blank cannot be saved
   - **asserts —** `missingRequiredFields` returning a non-empty list makes `save()` set the naming error and issue NO api call. This refusal has no server counterpart — `readAssetInput` accepts any non-empty `fields` — so its only home is here.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` `save` + `src/lib/knowledgeFields.ts` `missingRequiredFields`
4. **`ala-guardrail-requires-enforced-by`** — A guardrail body without an "Enforced by" section cannot be saved
   - **asserts —** `missingSections(body, requiredSections('guardrail'))` non-empty makes `save()` refuse with the discriminating reason (name the gate / schema / DB constraint / code path, or it is a pattern); a body carrying either a `## Enforced by` heading or an inline `**Enforced by.**` sentence satisfies it, matched case-insensitively as a substring.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` `save` + `src/lib/templates.ts`
5. **`ala-preview-is-the-derived-body-that-gets-saved`** — The live preview is the same derivation the save persists
   - **asserts —** For a structured kind, `renderFieldsPreview(category, fields)` equals the library's `renderBody` output for those fields, and `save()` passes that exact string as `input.body` — the preview is not a separate render path.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` + `src/lib/knowledgeFields.ts` `renderFieldsPreview`
6. **`ala-save-routes-create-vs-update-by-mode`** — Submit calls createAsset in new mode and updateAsset(id) in edit mode, then navigates to the saved id
   - **asserts —** `save()` invokes `api.createAsset(input)` when `mode='new'` and `api.updateAsset(id, input)` when `mode='edit'`; on the resolved asset it calls `refreshAssets()` then `navigate(assetHref(saved.id))`.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` `save`
7. **`ala-save-error-surfaces-message-and-does-not-navigate`** — A rejected save surfaces the server's message and stays put
   - **asserts —** When the api call rejects (e.g. the 409 conflict envelope), `save()` sets the error text shown in the form, clears `busy`, and never calls `navigate`.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx` `save`
8. **`ala-edit-mode-distinguishes-unloaded-from-absent`** — Edit mode for a missing id tells three states apart
   - **asserts —** In `mode='edit'` with no matching asset: `assetsStatus 'loading'` says the corpus is loading, `'error'` names the failure and surfaces `assetsError`, and only `'ready'` renders the not-found box with a link back to the lens. The form renders in none of the three.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx`
9. **`ala-server-validates-asset-input`** — readAssetInput rejects a bad slug, an unknown category, and an empty required scalar
   - **asserts —** `readAssetInput` throws `HttpError(400)` for a non-kebab id, for a category outside `ASSET_CATEGORIES`, for an empty title, and for an empty description; and — the either/or that replaced the old flat "body is required" — it throws only when BOTH `body` and `fields` are empty, accepting a fields-only structured input and a body-only one alike. `provenance` is carried when present and omitted when blank.
   - **covers —** `apps/studio/server/apiRouter.ts` `readAssetInput`
10. **`ala-asset-write-error-maps-store-failures`** — A store write failure becomes the right status
   - **asserts —** `assetWriteError` maps an `AssetConflictError` to 409 with its message, a `ZodError` to 400 naming the structured-doc validation failure, an existing `HttpError` through unchanged, and anything else to 500 — so a duplicate id 409s from the store rather than from a handler-side existence check.
   - **covers —** `apps/studio/server/apiRouter.ts` `assetWriteError`
11. **`ala-patch-relocks-id-from-the-query-string`** — PATCH re-locks the id to the route's, and 404s an unknown one
   - **asserts —** `handleAssets` PATCH for `?id=x` with a body also carrying `{id:'y'}` calls `backend.updateAsset('x', …)` with an input whose id is `'x'` — the query id is spread LAST — and throws `HttpError(404,'asset not found')` when the backend returns null.
   - **covers —** `apps/studio/server/apiRouter.ts` `handleAssets` (the PATCH arm)
12. **`ala-delete-requires-confirm-and-404s-a-noop`** — Delete fires only after the confirm gate, and an unknown id is a 404
   - **asserts —** In `AssetView.remove()`, `window.confirm` returning false issues no `deleteAsset`, no refresh and no navigate; returning true calls `api.deleteAsset(id)`, then `refreshAssets()`, then `navigate(libraryHref())`. Server-side, `handleAssets` DELETE throws `HttpError(404,'asset not found')` when `backend.deleteAsset` reports nothing removed.
   - **covers —** `apps/studio/src/components/AssetView.tsx` `remove` + `apps/studio/server/apiRouter.ts` `handleAssets` (the DELETE arm)

**Proven elsewhere, recorded so it is not re-authored here.** The CREATE path's server half — the
gate's 403 for a member, the 201 for an admin, and a structured `friction` write accepted with its
per-kind fields — is driven end to end through the real route table over a real socket by
`apps/studio/server/serveApi.integration.test.ts`, and the gate's own decision for
`POST /api/assets` by `apps/studio/server/guestPolicy.test.ts`. Those are real coverage of this
capability's create verb. They are named here rather than claimed as this unit's proof, because a
`proof:` block naming them would report three verbs green on the evidence of one.
