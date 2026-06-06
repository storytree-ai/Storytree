---
id: "author-library-artifact"
tier: capability
story: studio-foundation
title: "Author, edit, and delete Library artifacts"
outcome: "An operator durably changes the Library's contents through the editor form."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone, browse-library]
---

# Author, edit, and delete Library artifacts

**Outcome —** An operator durably changes the Library's contents through the editor form.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md), [`browse-library`](browse-library.md)

> **Proof status (honest) —** HONEST: code exists and runs. All cited behaviours are implemented in the real working studio (AssetEditor.tsx, AssetView.tsx, server/devApi.ts, api.ts) and the app launches under `pnpm --filter studio dev`, mutating apps/studio/data/assets.json on disk. But there is NO automated proof yet: apps/studio has no test suite and no scripted integration-test runner. Every contract describes the isolated unit test that WOULD prove its leaf (collaborators stubbed) but none is written; the integration test is an unautomated prose walkthrough against the real in-story collaborators. SPEC-AUTHORED RETROSPECTIVELY over already-built code — must not be called 'proven' or 'healthy' until the contracts are implemented and the integration test executed.

## Guidance

Validation is enforced in TWO independent layers and the contracts deliberately target the server one. The editor form carries client-side HTML guards (required attributes; the Id input's pattern="[a-z0-9]+(?:-[a-z0-9]+)*" at AssetEditor.tsx:144; select constrained to ASSET_CATEGORIES), but the DURABLE guard is server-side readAssetInput (devApi.ts:253-276). The honest leaf behaviour lives at the server, since it holds regardless of the form — so the validation/dup/relock/delete contracts are unit tests of devApi functions, not of the React form.

The id re-lock is a one-liner that's easy to miss: PATCH does readAssetInput({ ...existing, ...body, id: existing.id }) (devApi.ts:308). The spread order is load-bearing — existing.id is applied LAST, so even a body that sends a different id cannot rename the record. This is the integration test's 'server re-locks id even if the body carries a different one' clause, and the id input being disabled in the edit form (AssetEditor.tsx:143) is only the UI half of that lock.

The new+edit merge is real, not cosmetic: ONE component (AssetEditor) switches on a `mode` prop, and there is a SINGLE save() that branches create-vs-update on mode (AssetEditor.tsx:95-98) but shares one refreshAssets()→navigate(assetHref(saved.id)) tail (AssetEditor.tsx:99-100). Both editor and view re-sync via AppData.refreshAssets, which simply re-fetches GET /api/assets (App.tsx:26-27) — there is no optimistic local mutation, so the rendered result after any save/delete is the re-read store, which is why the integration test treats the on-screen footer timestamps as ground truth. The two code-derived depends_on edges (ADR-0010 §3) fall straight out of this: every save()/remove() calls the backbone's POST/PATCH/DELETE /api/assets handlers (dev-server-persistence-backbone), and every post-mutation navigate lands on browse-library's AssetView / Library surfaces — read off the call graph, not a UAT need.

The store is plain JSON files (apps/studio/data/assets.json) written by writeStore (devApi.ts:89-92); there is NO id generation for assets — the id is the user-supplied slug (unlike comments, which get randomUUID). The whole backend is a Vite dev-server middleware plugin, present only under `pnpm --filter studio dev`; a production `vite build` has no /api, so this capability is dev-scoped by design.

The live preview (AssetEditor.tsx:208-213) renders form.body through the same <Markdown> component as the detail view, so 'watch the live markdown preview' is genuinely the rendered output, not a textarea echo; it shows a 'Nothing yet.' placeholder until body is non-empty.

## Integration test

**Goal —** An operator durably changes the Library's contents through the editor form — creating, editing, then deleting one artifact, each mutation surviving as a real change to the dev-server's assets.json store.

The integration test exercises author-library-artifact against its **real in-story
collaborators** — `dev-server-persistence-backbone` (the real POST/PATCH/DELETE
/api/assets handlers that durably mutate assets.json) and `browse-library` (the AssetView
/ Library surfaces each save/delete navigates into) — with **no stubs within the
organism** (ADR-0010 §2/§5). These are its two code-derived `depends_on` edges, exercised
live. It would:

1. Start the real studio with `pnpm --filter studio dev` and open the running app; note the current Library so the new artifact is distinguishable.
2. Navigate to #/asset/new. Assert the shared AssetEditor mounts in 'new' mode with an empty form (AssetEditor.tsx:63-66) and the id input ENABLED.
3. Type a Title, e.g. 'Minimal First Probe'. Assert the Id field auto-derives to 'minimal-first-probe' live as you type — driven by slugify() while idTouched is false (AssetEditor.tsx:74-80, lib/markdown.ts:7-16). Do not touch the Id field.
4. Pick a Category from the select (e.g. 'pattern'); fill Description (one line), Body (markdown), and References as a comma-separated list like 'doc:decisions/0002-work-hierarchy-story-capability-contract.md, asset:deep-modules'.
5. Assert the live Preview pane re-renders the Body markdown as you edit it (AssetEditor.tsx:208-213) — proving the editor's preview reflects current input, not a stale snapshot.
6. Click 'Create artifact'. The form POSTs to /api/assets via api.createAsset (api.ts:50-51); the real backbone server validates input, rejects no duplicate, stamps createdAt==updatedAt (devApi.ts:291-300), appends to assets.json and returns 201.
7. Assert the app calls refreshAssets() (re-fetch GET /api/assets, App.tsx:26-27) then navigates to #/asset/minimal-first-probe (AssetEditor.tsx:99-100), landing on browse-library's rendered AssetView showing the title, lede, rendered body, references resolved to links, and a footer where 'created' equals 'updated' (AssetView.tsx:53-77).
8. Assert durability of the create: read apps/studio/data/assets.json and confirm a new record with id 'minimal-first-probe' and equal createdAt/updatedAt now exists on disk.
9. From the detail view click 'Edit' (AssetView.tsx:80-82) → #/asset/minimal-first-probe/edit. Assert the AssetEditor mounts in 'edit' mode PRE-FILLED from the existing asset (AssetEditor.tsx:52-62) with the Id input visibly DISABLED (AssetEditor.tsx:143).
10. Change the Description and Body, then click 'Save changes'. The form PATCHes /api/assets?id=minimal-first-probe via api.updateAsset (api.ts:52-53). Assert the server re-locks the id ({ ...existing, ...body, id: existing.id }), preserves the original createdAt, and bumps updatedAt to now (devApi.ts:303-313), returning 200.
11. Land back on browse-library's rendered detail (refresh + navigate to saved.id) and assert the footer now shows 'updated' LATER than 'created', with the same id, and the edited body rendered (AssetView.tsx:75-76).
12. From the detail view click 'Delete' (AssetView.tsx:83-85). Assert a browser confirm dialog appears ('Delete artifact "…"?', AssetView.tsx:35); dismiss it once and assert NOTHING happens (no DELETE fired, record still present).
13. Click 'Delete' again and ACCEPT the confirm. The app DELETEs /api/assets?id=minimal-first-probe via api.deleteAsset (api.ts:54-55); the server removes it from assets.json and returns { ok: true } (devApi.ts:315-321). The app calls refreshAssets() and navigates to #/library (AssetView.tsx:36-38).
14. Assert you land on browse-library's Library list with the artifact gone, and that the record is absent from apps/studio/data/assets.json on disk — closing the create→edit→delete loop as durable store mutations, leaving the git-tracked store clean.

## Contracts (10)

The test-proven leaf behaviours — each **one isolated automated test** with
collaborators stubbed (ADR-0002). No automated tests exist yet; each entry is the
assertion a contract test *would* prove, with the real code it covers.

1. **`ala-title-derives-slug-until-id-touched`** — New-mode title edit auto-fills the id from the slug until the id is touched
   - **asserts —** In mode='new' with idTouched false, onTitle('Some Title') sets form.id to slugify('Some Title') ('some-title'); once the id field has been edited (idTouched true), a later title change leaves form.id unchanged.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx:74-80,48,139-142`
2. **`ala-edit-mode-prefills-and-locks-id`** — Edit mode pre-fills the form from the existing asset and disables the id input
   - **asserts —** In mode='edit' with an existing asset in context, the effect populates form fields from that asset (references joined to a comma string) and the Id input renders disabled.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx:46,52-62,143`
3. **`ala-save-routes-create-vs-update-by-mode`** — Submit calls createAsset in new mode and updateAsset(id) in edit mode, then navigates to the saved id
   - **asserts —** Submitting the form invokes api.createAsset(input) when mode='new' and api.updateAsset(id,input) when mode='edit'; on the resolved asset it calls refreshAssets() then navigate(assetHref(saved.id)).
   - **covers —** `apps/studio/src/components/AssetEditor.tsx:82-100`
4. **`ala-save-error-surfaces-message`** — A rejected save surfaces the error message and does not navigate
   - **asserts —** When the stubbed api call rejects with Error('an asset with id "x" already exists'), submit sets the error text shown in the form and never calls navigate.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx:94-105,196`
5. **`ala-edit-not-found-guard`** — Edit mode for an unknown id renders the not-found notice instead of the form
   - **asserts —** In mode='edit' when no asset in context matches the id, the component renders the 'Artifact not found' box with a Back-to-Library link and no form.
   - **covers —** `apps/studio/src/components/AssetEditor.tsx:46,108-117`
6. **`ala-delete-requires-confirm`** — Delete fires the API only after the confirm gate is accepted
   - **asserts —** In AssetView.remove(), when window.confirm returns false no deleteAsset/refresh/navigate occurs; when it returns true api.deleteAsset(id) is called, then refreshAssets(), then navigate(libraryHref()).
   - **covers —** `apps/studio/src/components/AssetView.tsx:34-39`
7. **`ala-server-validates-asset-input`** — The server rejects invalid asset input with 400 (slug, category, required fields)
   - **asserts —** readAssetInput throws HttpError(400) when id is not a kebab-case slug, when category is not in ASSET_CATEGORIES, or when title/description/body is empty; otherwise it returns the normalised input.
   - **covers —** `apps/studio/server/devApi.ts:253-276`
8. **`ala-server-post-rejects-duplicate-id`** — POST rejects a duplicate id with 409 and otherwise stamps createdAt==updatedAt
   - **asserts —** handleAssets POST throws HttpError(409) when an asset with the same id already exists in the store; for a fresh id it creates a record whose createdAt equals updatedAt and returns 201.
   - **covers —** `apps/studio/server/devApi.ts:291-301`
9. **`ala-server-patch-relocks-id-and-preserves-createdat`** — PATCH re-locks the id and preserves createdAt while bumping updatedAt
   - **asserts —** handleAssets PATCH builds the next record from { ...existing, ...body, id: existing.id }, so a body carrying a different id cannot change the stored id; createdAt is kept from the existing record and updatedAt is set to now (>= createdAt); a missing id 404s.
   - **covers —** `apps/studio/server/devApi.ts:303-313`
10. **`ala-server-delete-404-on-noop`** — DELETE of an unknown id is a 404 no-op
   - **asserts —** handleAssets DELETE throws HttpError(404) when filtering the store by the requested id removes nothing (length unchanged); for an existing id it writes the shrunken array and returns { ok: true }.
   - **covers —** `apps/studio/server/devApi.ts:315-321`
