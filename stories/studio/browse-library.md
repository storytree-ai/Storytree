---
id: "browse-library"
tier: capability
story: studio
title: "Render one Library artifact's detail"
outcome: "An operator opens a single Library artifact and reads its rendered detail, and a corpus that has not loaded is never presented as an artifact that does not exist."
status: "proposed"
proof_mode: "integration-test"
depends_on: [dev-server-persistence-backbone]
---

# Render one Library artifact's detail

**Outcome —** An operator opens a single Library artifact and reads its rendered detail, and a corpus
that has not loaded is never presented as an artifact that does not exist.

**Depends on —** [`dev-server-persistence-backbone`](dev-server-persistence-backbone.md)

> ## ⚠ RE-SCOPED AND NARROWED, 2026-08-31 — `prove-unproven-capabilities-arc` inc-25, Group 2
>
> **The BROWSE half of this unit did not change implementation — it moved to another STORY. The VIEW
> half stayed here, and is what this unit now is.** Read that distinction carefully, because the
> tempting move is the wrong one: re-scoping this spec onto the constellation Library would author a
> second unit describing an outcome `library-tech-tree-overlay` already owns in full, which is the
> `one-way-to-do-things` defect rather than a correction.
>
> **What moved (verified at source, 2026-08-31, in this worktree):**
> - `apps/studio/src/components/Library.tsx` — the chip grid, the `all (88)` counts, the
>   `String.includes` search, the `No artifacts match.` empty state, the gloss banner — is DELETED.
>   Contracts 1–6 below described that file exclusively.
> - The `#/library` route is RETIRED. `parseRoute` has no `library` variant, `/library` and
>   `/library/<category>` both resolve to the tree route, and `libraryHref()` returns
>   `?overlay=library#/tree` (`apps/studio/src/lib/route.ts`). Contract 7 described a router arm that
>   no longer exists. This was done deliberately by
>   `library-tech-tree-overlay`'s own `library-retire-standalone-page` capability, on ADR-0185 dec 6,
>   after the owner attested the lens on 2026-07-15.
> - The replacement is a WHOLE STORY: `stories/library-tech-tree-overlay/`, outcome *"An operator
>   explores the knowledge corpus as a tech-tree lens pulled down over the living forest map"*,
>   decomposed into seventeen capabilities (the drawer shell, the ranked finder, the category and
>   lifecycle shelves, the DAG canvas, the overview constellation, the permanent lens, the Open
>   overlay, the selection card, the typed-edge wire …). Its sources live under `apps/studio/src`
>   under the ADR-0192 landlord rule — a declared HOSTED-STORY edge, `depends_on: [studio, library]`
>   — so finding those components in this story's territory is not evidence that this story owns
>   them.
>
> **What stayed, and why this unit survives rather than retiring.** ADR-0185 dec 6 explicitly
> PRESERVED the `#/asset/<id>` deep link and the detail render, and `library-tech-tree-overlay`
> consumes rather than re-authors it: `LibraryDiveBody` is *"a THIN router around two EXISTING
> renderers, never a new one"* — `AssetView` for an artifact, `DocView` for a document — and the Open
> overlay reuses that body verbatim. So `AssetView` is a studio-owned surface with a live operator
> route, two live callers, and a real outcome of its own. Retiring this unit outright would leave it
> with no capability owner at all, which is precisely the capability-grain ownership hole this arc's
> Group 3 exists to record; narrowing the unit onto the half that stayed keeps the grain honest and
> keeps `author-library-artifact`'s edge onto it true.
>
> **`seed-library-corpus` IS DROPPED FROM `depends_on`.** That capability is RETIRED in this same
> pass — the seeder, both of its inputs and its output file are all deleted — so the
> data-provenance edge onto `assets.json` has no target. The corpus now arrives over
> `GET /api/assets` from the live store (or, offline, from the JSON backend's derive-on-first-read
> seed), which is the persistence backbone's concern and is already the surviving edge.
>
> **`read-corpus` IS ALSO DROPPED FROM `depends_on`.** The edge existed for `RefLink`: an artifact's
> `doc:` citation rendered as an in-app link into `DocView`. ADR-0477 D1 retired the library's
> `references` field entirely, `AssetView` renders no `Sources` block, and `RefLink` no longer
> exists — so this unit's code calls nothing of `read-corpus`'s. `AssetView` and `DocView` are now
> SIBLING renderers that `LibraryDiveBody` routes between; neither consumes the other. Contracts 10
> and 11 below went with the field.
>
> **NO `proof:` BLOCK IS AUTHORED HERE, and the absence is the finding.** Real coverage exists for
> the constellation surfaces — but that coverage belongs to `library-tech-tree-overlay`'s
> capabilities, not to this one, and borrowing it would be naming a command that only looks like it
> exercises the thing. What this narrowed unit needs is named under § Coverage.

## Guidance

**THE ONE `dev-server-persistence-backbone` EDGE, read off the code.** The detail render's whole data
path is `GET /api/assets` → `AppData.assets`; `AssetView` does not fetch, it looks the id up in the
already-loaded corpus (`assets.find((a) => a.id === id)`). The read route is the backbone's handler
and the `/api/*` dispatch is the backbone's registration, so that is the coupling and the only one.

**THE NOT-YET-LOADED / GENUINELY-ABSENT DISTINCTION IS THE INTERESTING BEHAVIOUR HERE, and it is new
since the first authoring.** A Library route can mount before `/api/assets` resolves —
`map-boot-independence` (ADR-0240 stage 4) removed the boot gate that used to prevent that, on
purpose. So `AssetView` branches on `assetsStatus` BEFORE it branches on the lookup miss: `loading`
renders "Loading the Library corpus…", `error` renders a named failure carrying `assetsError`, and
only `ready` lets a miss render "Artifact not found". Presenting an initial empty `assets` array as
"no artifact with that id" is the confident-wrongness failure this ordering closes, and it is the
half of this unit most worth a test.
⚠ AND NOTE WHAT THIS SURFACE DOES *NOT* DO — recorded so a later reader does not assume it.
`src/lib/docsIndex.ts` exports `unresolvedAssetReason` precisely so the not-yet-loaded / genuinely
absent distinction is WORDED IN ONE PLACE and two surfaces cannot drift into saying different things
about the same state. `AssetView` does not use it: it inlines its own two strings, and the only
consumer is `RelevantAdrs` in `TreeView.tsx`. So the drift this helper exists to prevent is live
here. That is a finding for whoever builds the contracts below, not something to fix by editing app
source from a spec.

**TWO LIVE ENTRY POINTS, AND THEY ARE NOT INTERCHANGEABLE.** (a) The `#/asset/<id>` route, parsed by
`parseRoute` and dispatched in `App.tsx`'s `RouteView` — this is the deep link ADR-0185 dec 6
preserved. (b) `LibraryDiveBody`'s `plan.kind === 'asset'` arm, which mounts the same component
inside the overlay story's drawer and Open overlay. (b) belongs to
`library-tech-tree-overlay`; what this unit owes it is a stable component contract, which is why the
component takes only `id` and reads everything else from context.

**WHAT THE DETAIL ACTUALLY RENDERS TODAY** (`apps/studio/src/components/AssetView.tsx`): a crumb
(`library / <id>`, the `library` word linking to `libraryHref()` — the lens, not the retired page); a
kind chip whose LABEL comes from `kindLabel(category, arcDisplay)` rather than the raw category, so
an `arc` shows as "epic" by default (ADR-0183 D1), with `ASSET_CATEGORY_GLOSS` as its title and
beside it; the title and the description lede; the body through `ReviewEditor` (ADR-0146's
view/edit split-pane, wrapped in `ReviewToggle`), not a bare `<Markdown>`; the `provenance`
attribution line if present (ADR-0095 D8 — a DIFFERENT field from the retired `references`, and it
deliberately kept its home when the `Sources` block went); an id/created/updated footer; and the Edit
and Delete actions.

**THE DELETE CONFIRM LIVES HERE, THE WRITE BELONGS TO `author-library-artifact`.** `AssetView.remove()`
owns the `window.confirm` gate and the post-delete `refreshAssets()` → `navigate(libraryHref())`
tail. The edge runs the other way — `author-library-artifact` depends on THIS unit because its
post-mutation navigate lands on this render — so the delete CONFIRM contract is authored over there
with the rest of the mutation set, not duplicated here.

**THE TAXONOMY IS STILL A CLOSED SCHEMA OBSERVED THROUGH ITS CONSUMERS, and it has grown.**
`ASSET_CATEGORIES` / `ASSET_CATEGORY_GLOSS` (`src/types.ts`) is no longer the seven-entry list this
spec once described — `friction` and `arc`, among others, arrived as structured Library kinds. Do not
re-pin a count here; the drift guard that matters is the server-vs-client allowlist one, and it is
owned by `dev-server-persistence-backbone`.

## Coverage — what exists today, and what does not

Recorded so the gap is visible rather than inferred. This is NOT a proof claim.

**Exercised by NOTHING.** There is no `AssetView.test.tsx`, and no suite anywhere drives this
component. Specifically unproven: the three-way `loading` / `error` / `not-found` branch — the
behaviour above that is most worth having; the crumb's link target after the `#/library` retirement;
`kindLabel`'s arc→"epic" substitution in this surface; that `provenance` renders and the retired
`references` does not; and the footer's created/updated formatting.

**Adjacent coverage that must NOT be mistaken for this unit's.**
`src/components/LibraryDiveBody.test.tsx`, `LibraryOpenOverlay.test.tsx`, `LibrarySelectionCard.test.tsx`
and their siblings are `library-tech-tree-overlay` capabilities' proofs; they exercise the ROUTER
around this component, and several stub it. `src/App.boot-independence.test.tsx` proves the
not-yet-loaded distinction reaches the drawer's consumers, which is that capability's contract about
the CONTEXT object, not this one's about this render.

## Integration test

**Goal —** An operator opens one artifact by its `#/asset/<id>` deep link and reads its rendered
detail; and while the Library corpus is still in flight, or has failed, the same route says so rather
than reporting the artifact absent.

The integration test exercises browse-library against its **real in-story collaborator** — the real
`dev-server-persistence-backbone` read route serving `GET /api/assets`, reached through the real
`api` client and the real `AppData` context — with **no stubs within the organism** (ADR-0010 §2/§5).
It drives the real `App` with the transport doubled, the house style
`App.docs-index-honesty.test.tsx` and `App.boot-independence.test.tsx` already set, rather than
mocking the `api` module. It would:

1. With `/api/assets` answering a corpus containing one structured artifact, open `#/asset/<id>`
   COLD — no prior in-app navigation. Assert the detail renders: the `library / <id>` crumb whose
   `library` link points at `libraryHref()` (the lens href, NOT `#/library`), the kind chip, the
   title, the description lede, and the body.
2. Assert an `arc` artifact's chip reads `epic` while its stored category is still `arc` — the label
   is a display substitution, not a data one (ADR-0183 D1).
3. Assert an artifact carrying `provenance` renders its attribution line, and that NO `Sources` /
   references block renders for any artifact (ADR-0477 D1 retired that field; a `Sources` pane
   reappearing is the regression this leg guards).
4. THE HONESTY LEGS, and the reason this unit still exists. With `/api/assets` still PENDING, open
   `#/asset/<id>` and assert the route reports the corpus as loading — NOT "Artifact not found".
   Then with `/api/assets` REJECTED, assert it names the failure and surfaces `assetsError` — again
   not "not found".
5. With `/api/assets` RESOLVED and the id genuinely absent from it, assert "Artifact not found"
   DOES render, carrying the id and a link back to the lens — so the three states are mutually
   distinguishable rather than one fallback wearing three hats.
6. Assert the same component renders the same artifact when mounted through `LibraryDiveBody`'s
   asset arm rather than through the route — the stable contract the overlay story consumes.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). The eleven contracts this spec carried before 2026-08-31 are gone with their subjects:
1–6 covered the deleted `Library.tsx`, 7 covered the retired `{name:'library'}` router arm (whose
retirement is proven by `library-retire-standalone-page`'s own `lret-` contracts in
`src/lib/route.test.ts`), and 10–11 covered `RefLink`, deleted with the `references` field at
ADR-0477 D1. Contract 8 survives, narrowed; contract 9 is split into the four honest states below.

1. **`bl-asset-route-parses-id`** — The router maps `#/asset/<id>` to an asset route with the decoded id
   - **asserts —** `parseRoute('#/asset/deep-modules')` yields `{name:'asset',id:'deep-modules'}`, a percent-encoded id round-trips through `decodeURIComponent`, and the `/edit` and `new` sub-routes yield `asset-edit` / `asset-new` instead — the three arms stay distinct.
   - **covers —** `apps/studio/src/lib/route.ts` `parseRoute` (the `/asset/` arm)
2. **`bl-assetview-renders-resolved-detail`** — A resolved artifact renders chip, title, lede, body and footer
   - **asserts —** Given an `assets` context containing the requested id and `assetsStatus: 'ready'`, `AssetView` renders the kind chip with `ASSET_CATEGORY_GLOSS` as its gloss, the title, the description lede, the body, and an id/created/updated footer.
   - **covers —** `apps/studio/src/components/AssetView.tsx`
3. **`bl-assetview-chip-label-is-display-only`** — The chip shows the display label, never the raw category
   - **asserts —** An artifact of category `arc` renders its chip as `epic` under the default arc display while `asset.category` is unchanged; a category with no substitution renders its own name.
   - **covers —** `apps/studio/src/components/AssetView.tsx` + `src/lib/kindDisplay.ts` `kindLabel`
4. **`bl-assetview-renders-provenance-not-references`** — Provenance renders; the retired citation block does not
   - **asserts —** An artifact carrying `provenance` renders that attribution line as markdown; an artifact without it renders no attribution container; and no `Sources` / references list renders in either case (ADR-0477 D1).
   - **covers —** `apps/studio/src/components/AssetView.tsx`
5. **`bl-assetview-distinguishes-unloaded-from-absent`** — A pending or failed corpus is never reported as a missing artifact
   - **asserts —** For an id absent from `assets`: with `assetsStatus: 'loading'` the surface says the corpus is loading; with `'error'` it names the failure and surfaces `assetsError`; with `'ready'` — and ONLY then — it renders "Artifact not found" carrying the id. The three renders are mutually distinguishable.
   - **covers —** `apps/studio/src/components/AssetView.tsx` (its own inline branch — NOT `unresolvedAssetReason`, which this surface does not call; see § Guidance)
6. **`bl-assetview-crumb-points-at-the-lens`** — The back-link targets the lens, not the retired standalone page
   - **asserts —** Both the crumb's `library` link and the not-found box's "Back to the Library" link resolve to `libraryHref()` — a string carrying `overlay=library` and the `#/tree` hash — and neither is `#/library` (ADR-0185 dec 6).
   - **covers —** `apps/studio/src/components/AssetView.tsx` + `src/lib/route.ts` `libraryHref`
