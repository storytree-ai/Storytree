---
id: "library-dive-body"
tier: capability
story: library-tech-tree-overlay
title: "The dive body panel — an artifact's full body + Sources over the map, reusing AssetView / DocView"
outcome: "Opening an artifact renders its FULL body + Sources over the map into the shell's reserved dive slot, REUSING the existing body renderers — AssetView for assets (body + Sources from the already-loaded corpus, NO fetch) and DocView for ADRs (body via the FIRST on-demand api.docContent fetch this arc allows) — routed off the finder's centred librarySelection on the SearchResult.source discriminant (never category) and opened via the drawer bar's existing Dive button; its routing and behaviour machine-witnessed, its appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [185, 70, 122, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component (LibraryDiveBody.tsx) and a NOT-YET-EXISTING
# pure router module (diveBody.ts) — both under apps/studio/src (red = module-not-found at HEAD),
# then writes them (green). The clean red→green heart is the PURE `planDive(selection)` router; the
# component is the thin render layer that reuses the EXISTING AssetView / DocView renderers around it.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the ROUTING/BEHAVIOUR ONLY — planDive
# routes on the SearchResult.source discriminant ('asset' | 'doc'), NEVER category (an ADR is source:'doc'
# but category:'adr' — trap): null → empty, source:'asset' → asset, source:'doc' → doc; the component
# renders the empty/prompt state with no selection (mounting NEITHER AssetView NOR DocView, no fetch), an
# asset selection through AssetView (body + Sources from the loaded corpus, NO docContent fetch), a doc
# selection through DocView (which calls the STUBBED api.docContent(id) and renders its markdown), and a
# rejected api.docContent surfaces DocView's error state without crashing the panel (the inc-3-crash-class
# guard at the data boundary). The dive body's APPEARANCE (does the full-body reading pane read as one
# forest-cozy lens over the map with the drawer collapsed to a bar; the empty/prompt state styling; the
# reading-pane legibility) and its real MOUNTING into TreeView's `diveSlot` composition are the story's
# operator-attested UAT leg 4 (the look is witnessed, never a machine visual verdict; do NOT add a
# visual/colour assertion here, and do NOT edit TreeView.tsx or LibraryDrawer.tsx in this `real:` scope —
# the dive body is proven in isolation and takes `selection` as a PROP, the diveSlot prop add on the shell
# and the diveSlot={<LibraryDiveBody …/>} mount in TreeView are the orchestrator's supplement glue after
# PASS, exactly as the finder's / subgraph's mount was — trap k).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `ldb-`-named contract test —
# including the pure planDive ones — lives in LibraryDiveBody.test.tsx, which imports planDive from
# ../lib/diveBody.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryDiveBody.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryDiveBody.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryDiveBody.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryDiveBody.tsx"
        - "apps/studio/src/lib/diveBody.ts"
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest (jsdom), not node:test — run the ONE test file under vitest.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/LibraryDiveBody.test.tsx"
---

# The dive body panel — an artifact's full body + Sources over the map, reusing AssetView / DocView

**Outcome —** Opening an artifact renders its FULL body + Sources over the map into the shell's reserved
`library-drawer-dive-slot` (ADR-0185 dec 1), REUSING the existing body renderers: `AssetView` for assets
(body + Sources from the already-loaded corpus, NO fetch) and `DocView` for ADRs (body via
`api.docContent(id)` — the FIRST on-demand fetch this arc allows, ADR-0185 dec 3/4). It is routed off the
finder's centred `librarySelection` on the `SearchResult.source` discriminant (never `category`) and opened
via the drawer bar's EXISTING "Dive" button; its routing and behaviour machine-witnessed, its appearance
operator-attested.

**Depends on —** [`library-finder`](library-finder.md). The dive renders the finder's lifted
`librarySelection`: the finder lifts a full `SearchResult` via `onSelect` (recon fact — not just an id),
which `TreeView.tsx` holds as `librarySelection` (`useState<SearchResult | null>`). That selection is the
dive's INPUT — `planDive(selection)` routes it to the right renderer. The dive is functionally INDEPENDENT
of the focus subgraph (increment 3) — settled in plan-5: it consumes the finder's selection directly, not
the subgraph's graph-walk, so it depends only on `library-finder`. The dive mounts into the shell's
EXISTING single `diveSlot` node when the drawer is in the dive state (the shell collapses to a bar, ADR-0185
dec 1), so `LibraryDrawer.tsx` is NOT touched (its `lds-*`/`ldw-*` tests stay byte-green — trap k). That
`diveSlot` prop add on the shell and the `diveSlot={<LibraryDiveBody …/>}` mount in TreeView are the
orchestrator's supplement glue AFTER this leaf's PASS (mirroring how increments 1–3's real mounting was
outside their `real:` scope) — so this capability edits NEITHER `TreeView.tsx` NOR `LibraryDrawer.tsx`; it
proves the dive in isolation, driven by props. It holds no backend seam of its own — the body renderers it
reuses read `useAppData()` and own their own fetch/loading/error states (AssetView reads the already-loaded
corpus; DocView owns the `api.docContent` fetch), so the panel takes only `selection` as a prop and is
deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW two-stage.** Neither
> `apps/studio/src/lib/diveBody.ts` nor `apps/studio/src/components/LibraryDiveBody.tsx` exists at HEAD
> (verified 2026-07-12 — `ls` returns absent for both, and for the test file). This capability authors them
> test-first: a new vitest jsdom test drives the pure `planDive` router and the panel's render /
> reuse-of-AssetView-DocView / fetch-error behaviour, RED at HEAD (module-not-found), GREEN once both
> modules are written. Its ROUTING/BEHAVIOUR is machine-witnessed; its APPEARANCE inside the real drawer
> (the full-body reading pane over the map, the drawer collapsed to a bar, the forest-cozy palette, the
> empty/prompt state styling) and its real mounting into the shell's `diveSlot` are the story's
> operator-attested UAT leg 4 (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED from
> signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the DIVE BODY AS A WHOLE — a pure router that
maps a `SearchResult | null` to a render plan PLUS a behavioural React component that mounts the right
EXISTING body renderer for that plan (the empty/prompt state, `AssetView` for an asset, `DocView` for an
ADR), spanning the routing heart, the reuse of AssetView/DocView, the on-demand `docContent` fetch through
DocView, and the fetch-error guard, exercised in jsdom. It is the reading surface that turns the finder's
single selection into a full-body dive over the map; the wire extension and the deep-link are those
increments' jobs, gated on this dive.

REUSE, DON'T HAND-ROLL — the dive is a ROUTER around two EXISTING renderers. `AssetView` and `DocView`
already exist and already render an artifact's full body — `AssetView` renders an asset's body + its
Sources from the already-loaded corpus (no fetch), and `DocView` renders an ADR's body via its own
`api.docContent(id)` fetch (with its own loading/error states). The dive body is a THIN layer that picks
which of the two to mount for the current selection; it is NOT a new markdown renderer, a new Sources
renderer, or a new fetch. Do NOT reimplement body rendering here — the whole point is that the reading pane
is the studio's existing, already-styled artifact view, now surfaced over the map.

THE PURE HEART — `planDive(selection)` (the clean red→green core, unit-testable without jsdom). A pure
function in a NEW module `apps/studio/src/lib/diveBody.ts`, taking the centred selection
(`SearchResult | null`) and returning a render plan:
`type DiveRenderPlan = { kind: 'empty' } | { kind: 'asset'; id: string } | { kind: 'doc'; id: string }`
and `planDive(selection: SearchResult | null): DiveRenderPlan` — `null → { kind: 'empty' }`;
`source === 'asset' → { kind: 'asset', id }`; `source === 'doc' → { kind: 'doc', id }`. It routes on the
`SearchResult.source` discriminant (`'asset' | 'doc'`), NEVER on `category`. This is load-bearing: an ADR is
`source: 'doc'` but `category: 'adr'` — routing on `category` would send an ADR down the wrong (asset) path.
Pure, no fetch/DOM/context. This function is the leaf's red→green heart; two `ldb-` contracts assert it
directly (they live in the ONE test file but import it from `../lib/diveBody`).

ROUTE ON `source`, NEVER `category` (the discriminant trap). The `SearchResult.source` field is the
`'asset' | 'doc'` discriminant that says WHICH renderer to reach for; `category` is the kind label (`'adr'`,
`'arc'`, a definition kind, …) and is NOT a renderer selector. An ADR result carries `source: 'doc'` and
`category: 'adr'` — it must route to `DocView`, not `AssetView`. Pin it in
`ldb-plandive-routes-on-source-not-category` (an ADR result routes to `doc`, never `asset`). A hand-rolled
`category`-based switch here would break every ADR dive.

THE THIN RENDER LAYER — `LibraryDiveBody.tsx` (a router around AssetView/DocView). A component in a NEW file
`apps/studio/src/components/LibraryDiveBody.tsx` taking `{ selection: SearchResult | null }` as PROPS,
calling `planDive(selection)`, and rendering: `empty` → an empty/prompt state (a bare "pick an artifact"
prompt, mounting NEITHER renderer); `asset` → `<AssetView id={plan.id} />`; `doc` →
`<DocView id={plan.id} />`. Root `<div className="library-dive-body" data-testid="library-dive-body">`. It
holds NO data of its own — AssetView and DocView read `useAppData()` and own their own fetch/loading/error
states, so the panel is a pure switch. Take `selection` as a prop so the dive is deterministically drivable
in jsdom — mirroring how the shell took `search`, the finder took `assets`/`docs`/`selectedId`, and the
subgraph took `selection`/`onFocus` as props.

THE `docContent` FETCH IS DocView's — AND IT IS THE FIRST ONE THIS ARC ALLOWS (ADR-0185 dec 3/4). Increments
1–3 read only the already-loaded corpus (no fetch beyond the wire). This increment is where an ADR's body is
fetched ON DEMAND, through DocView's own `api.docContent(id)` call, exactly when the operator dives an ADR —
the "bodies fetched on demand" of ADR-0185 dec 3. The asset path stays fetch-free: `AssetView` renders the
asset body + Sources from the already-loaded corpus. So the dive fetches ONLY for a doc dive, and only
through DocView. In the jsdom test, STUB `api.docContent` for the doc path (assert the stub is called with
the id and its returned `markdown` renders); assert the asset path calls NO `docContent`. Pin the routing in
`ldb-asset-selection-renders-assetview-body-and-sources` (asset → AssetView, no fetch) and
`ldb-doc-selection-fetches-and-renders-markdown` (doc → DocView → stubbed `docContent` → markdown).

THE FETCH-ERROR GUARD (the inc-3-crash-class boundary). When DocView's `api.docContent` REJECTS, the doc
dive path must surface DocView's error state and NOT throw/crash the panel — the same class of
data-boundary crash the increment-3 staging walk caught (a real-data crash the jsdom gate missed). Prove the
data boundary: with the stubbed `api.docContent` rejecting, the panel still renders (its error state shows),
it does not throw. Pin it in `ldb-doc-fetch-error-surfaces-error-not-crash`.

THE EMPTY / PROMPT STATE (no selection). With `selection: null`, `planDive` returns `{ kind: 'empty' }` and
the panel renders a bare empty/prompt state — mounting NEITHER `AssetView` NOR `DocView`, and calling no
fetch. This is minimum-to-green: a prompt, not a rich empty-state constellation (that overview is increment
5's job). Pin it in `ldb-empty-state-no-selection`.

DEEP-LINK IS DEFERRED TO INCREMENT 7 (slow growth). The `#/asset|doc/<id>` deep-link (the hash still drives
the live standalone page, ADR-0185 dec 7) is increment 7's job — this increment opens the dive PURELY from
the in-memory `librarySelection`, touches no hash, and builds NO `diveHref` helper speculatively. Minimum to
green: a selection in, the right renderer out. Do NOT reach for the hash here.

THE "DIVE" BUTTON ALREADY EXISTS (the opener). The dive is OPENED via the drawer bar's EXISTING "Dive"
button (the closed↔peek↔dive state machine the shell already ships) — this capability does NOT add a new
opener control; it fills the `diveSlot` the shell reserves when it enters the dive state. Wiring the opener
to the mount is the orchestrator's supplement glue (the `diveSlot` prop + the TreeView mount), not this
leaf's scope (trap k).

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5/6 + ADR-0070). The dive follows the map's
forest-cozy palette (the world's CSS variables, as the shell/finder/subgraph do), NOT neutral-admin white
and NEVER the black-terminal look. The full-body reading pane over the map (the drawer collapsed to a bar),
the reading-pane legibility, and the empty/prompt state styling are WITNESSED by the owner (UAT leg 4),
never a machine visual verdict — do NOT author a visual/colour/layout assertion in this cap's tests (assert
the routing, which renderer mounts, the stubbed `docContent` call + rendered markdown, and the error-state
guard, never their styling). Surface the STILL-UNSIGNED drawer-shell + finder + subgraph look legs at the
SAME attestation (trap l), rather than letting them sit unsigned. Witness the look at
`?overlay=library#/tree`.

OFFLINE-TESTABLE IN JSDOM (the `LibraryFinder.test.tsx` / `LibraryFocusGraph.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render. Component tests wrap `<LibraryDiveBody>`
in the AppData provider (AssetView/DocView read `useAppData()`) and STUB `api.docContent` for the doc path;
the pure `planDive` tests need no jsdom at all but still live in the one test file (ADR-0122 coverage). No
real `fetch` beyond the stubbed `docContent`, no socket, no DB, no Electron. The component imports no
agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the dive body: `planDive(selection)` routes on the `SearchResult.source` discriminant
(`null → empty`, `source:'asset' → asset`, `source:'doc' → doc`, an ADR routing to `doc` never `asset`);
and the `<LibraryDiveBody selection={…}>` component renders the empty/prompt state with no selection
(mounting neither renderer, no fetch), mounts `AssetView` for an asset selection (body + Sources from the
loaded corpus, no `docContent` fetch), mounts `DocView` for a doc selection (which calls the STUBBED
`api.docContent(id)` and renders its markdown), and surfaces DocView's error state without crashing when
`api.docContent` rejects — entirely in jsdom, driven by props, the only fetch the stubbed `docContent`.

The integration test exercises this capability against its own composition — the pure `planDive` router, the
reuse of the real AssetView/DocView renderers, and the fetch-error guard are all real (only `api.docContent`
is stubbed). It would:

1. Call `planDive(null)` directly and assert `{ kind: 'empty' }`. Call `planDive` with a `source:'asset'`
   result and assert `{ kind: 'asset', id }`; with a `source:'doc'` result and assert `{ kind: 'doc', id }`;
   with an ADR result (`source:'doc'`, `category:'adr'`) and assert it routes to `doc`, NOT `asset` (the
   discriminant is `source`, not `category`).
2. Render `<LibraryDiveBody selection={null} />` in jsdom. Assert the panel renders the empty/prompt state,
   mounts NEITHER `AssetView` NOR `DocView`, and calls no fetch.
3. Render `<LibraryDiveBody selection={assetResult} />` wrapped in the AppData provider over a loaded corpus.
   Assert the asset's body + its Sources render (through `AssetView`) and that `api.docContent`/fetch is NOT
   called (assets read the loaded corpus).
4. Render `<LibraryDiveBody selection={docResult} />` wrapped in the AppData provider with `api.docContent`
   STUBBED to resolve a known `markdown`. Assert `DocView` mounts, the stubbed `api.docContent(id)` is
   called with the doc id, and the returned `markdown` renders.
5. Render `<LibraryDiveBody selection={docResult} />` with `api.docContent` STUBBED to REJECT. Assert the doc
   dive path surfaces DocView's error state and the panel does NOT throw/crash (the inc-3-crash-class guard
   at the data boundary).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryDiveBody.test.tsx`; the pure-router contracts import `planDive` from
`../lib/diveBody`). Per ADR-0122 (`storytree coverage`) each contract id is the lead of a distinctly-named
test, so the coverage check reports 6/6 against the ONE `real.testFile`. None of these is an APPEARANCE
assertion — the look (the full-body reading pane over the map, the drawer collapsed to a bar, the forest-cozy
palette, the empty/prompt state styling) is the story's operator-attested UAT leg 4 (ADR-0070).

1. **`ldb-plandive-empty-on-null`** — `planDive(null)` returns `{ kind: 'empty' }`
   - **asserts —** the pure `planDive(null)` returns `{ kind: 'empty' }` (no selection → the empty render
     plan). Pure, no jsdom/fetch/DOM.
   - **covers —** `apps/studio/src/lib/diveBody.ts` (the null → empty branch of the router)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx` (net-new, vitest; imports `planDive`).
2. **`ldb-plandive-routes-on-source-not-category`** — `planDive` routes on the `source` discriminant, never `category`; an ADR routes to `doc`
   - **asserts —** `planDive` returns `{ kind: 'asset', id }` for a `source:'asset'` result and
     `{ kind: 'doc', id }` for a `source:'doc'` result; an ADR result (`source:'doc'`, `category:'adr'`)
     routes to `doc`, NOT `asset` — the discriminant is `source`, never `category`. Pure.
   - **covers —** `apps/studio/src/lib/diveBody.ts` (the `source`-discriminant routing)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx`.
3. **`ldb-empty-state-no-selection`** — with no selection the panel renders the empty/prompt state and mounts no renderer
   - **asserts —** rendering `<LibraryDiveBody selection={null} />` shows the empty/prompt state, mounts
     NEITHER `AssetView` NOR `DocView`, and calls no fetch. The rich empty-state overview is increment 5.
   - **covers —** `apps/studio/src/components/LibraryDiveBody.tsx` (the empty/prompt render branch)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx`.
4. **`ldb-asset-selection-renders-assetview-body-and-sources`** — an asset selection renders AssetView's body + Sources, with no fetch
   - **asserts —** rendering `<LibraryDiveBody selection={assetResult} />` (in the AppData provider over a
     loaded corpus) mounts `AssetView` and renders the asset's body + its Sources from the loaded corpus,
     with NO `api.docContent`/fetch call (assets are already on the wire — trap g carries over).
   - **covers —** `apps/studio/src/components/LibraryDiveBody.tsx` (the asset → `AssetView` branch)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx`.
5. **`ldb-doc-selection-fetches-and-renders-markdown`** — a doc selection mounts DocView, which calls the stubbed `docContent` and renders its markdown
   - **asserts —** rendering `<LibraryDiveBody selection={docResult} />` (in the AppData provider, with
     `api.docContent` STUBBED to resolve a known `markdown`) mounts `DocView`, which calls the stubbed
     `api.docContent(id)` with the doc id and renders the returned `markdown` — the FIRST on-demand fetch this
     arc allows (ADR-0185 dec 3/4), owned by DocView.
   - **covers —** `apps/studio/src/components/LibraryDiveBody.tsx` (the doc → `DocView` branch)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx`.
6. **`ldb-doc-fetch-error-surfaces-error-not-crash`** — a rejected `docContent` surfaces DocView's error state without crashing the panel
   - **asserts —** when the stubbed `api.docContent` REJECTS, the doc dive path surfaces DocView's error
     state and the panel does NOT throw/crash — the inc-3-crash-class guard at the data boundary (a real-data
     crash the earlier jsdom gate missed).
   - **covers —** `apps/studio/src/components/LibraryDiveBody.tsx` (the doc-path error surfacing at the data boundary)
   - **proven by —** `apps/studio/src/components/LibraryDiveBody.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the dive body as a new pure router module
+ a new thin render component that reuses the existing AssetView/DocView renderers, test-first.

- **The new test —** `apps/studio/src/components/LibraryDiveBody.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` /
  `LibraryFocusGraph.test.tsx` shape; NO real `fetch`/socket/DB/Electron — the only fetch is the STUBBED
  `api.docContent`). Import `{ planDive }` from `"../lib/diveBody"` and `{ LibraryDiveBody }` from
  `"./LibraryDiveBody"`. Wrap the component in the AppData provider (AssetView/DocView read `useAppData()`)
  and stub `api.docContent` for the doc path. Name each test for its contract id (`ldb-…`) so
  `storytree coverage library-dive-body` reports 6/6 (ADR-0122) — the pure `planDive` contracts (1–2) live in
  THIS one file too, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the imports resolve NOTHING — neither
  `apps/studio/src/lib/diveBody.ts` nor `apps/studio/src/components/LibraryDiveBody.tsx` exists at HEAD, so
  the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write the two modules. `apps/studio/src/lib/diveBody.ts`: the pure
  `type DiveRenderPlan = { kind: 'empty' } | { kind: 'asset'; id: string } | { kind: 'doc'; id: string }` and
  `planDive(selection: SearchResult | null): DiveRenderPlan` — `null → empty`, `source:'asset' → asset`,
  `source:'doc' → doc`, routing on `source` never `category`, no fetch/DOM/context.
  `apps/studio/src/components/LibraryDiveBody.tsx`: a thin render layer taking `{ selection }` as PROPS,
  calling `planDive`, and rendering the empty/prompt state, `<AssetView id={plan.id} />`, or
  `<DocView id={plan.id} />` — root `<div className="library-dive-body" data-testid="library-dive-body">`,
  holding no data of its own (the reused renderers own their `useAppData()` read + fetch/loading/error).
  MOUNTING it into TreeView's `diveSlot` composition (the `diveSlot` prop add on the shell +
  `diveSlot={<LibraryDiveBody selection={librarySelection} />}` in TreeView) and the forest-cozy appearance
  are witnessed under the story's UAT leg 4 (operator-attested, ADR-0070), NOT asserted in CI and NOT in this
  `real:` scope. After it, the imports resolve, the assertions hold, and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.

Rules:

- **Route on `source`, never `category`** — `planDive` maps `null → empty`, `source:'asset' → asset`,
  `source:'doc' → doc`; an ADR (`source:'doc'`, `category:'adr'`) routes to `doc`
  (`ldb-plandive-empty-on-null`, `ldb-plandive-routes-on-source-not-category`). A `category`-based switch
  would break every ADR dive.
- **Reuse AssetView / DocView, don't hand-roll a renderer** — the dive is a router around the EXISTING body
  renderers; do NOT reimplement markdown/Sources rendering
  (`ldb-asset-selection-renders-assetview-body-and-sources`,
  `ldb-doc-selection-fetches-and-renders-markdown`).
- **The `docContent` fetch is DocView's, and it is stubbed in the test** — the doc path is the first
  on-demand fetch this arc allows (ADR-0185 dec 3/4), owned by DocView; the asset path stays fetch-free; stub
  `api.docContent` in jsdom (`ldb-doc-selection-fetches-and-renders-markdown`).
- **Empty/prompt state with no selection** — no selection renders a bare prompt, mounting no renderer, no
  fetch (`ldb-empty-state-no-selection`); the rich empty-state overview is increment 5 (slow growth).
- **Guard the fetch-error boundary** — a rejected `docContent` surfaces DocView's error state without
  crashing the panel (`ldb-doc-fetch-error-surfaces-error-not-crash`, the inc-3-crash-class guard).
- **Deep-link is deferred to increment 7** — inc-4 opens the dive purely from the in-memory
  `librarySelection`, touches no hash, builds no `diveHref` helper speculatively (slow growth).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the routing, which renderer
  mounts, the stubbed `docContent` call + rendered markdown, and the error-state guard; the full-body reading
  pane over the map, the drawer collapsed to a bar, the forest-cozy palette, and the empty/prompt state
  styling are the story's UAT leg 4 (surface the still-unsigned shell/finder/subgraph look legs at the same
  attestation — trap l). Do not author a visual verdict, and do NOT edit `TreeView.tsx` or `LibraryDrawer.tsx`
  in the `real:` scope (the `diveSlot` prop add + the TreeView mount are the orchestrator's supplement glue
  after PASS; the dive is proven in isolation, driven by props — trap k). `LibraryDrawer.test.tsx`
  (`lds-*`/`ldw-*`), `LibraryFinder.test.tsx` (`lf-*`), and `LibraryFocusGraph.test.tsx` (`lfg-*`) must all
  stay green.
