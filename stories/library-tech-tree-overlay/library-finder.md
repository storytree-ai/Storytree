---
id: "library-finder"
tier: capability
story: library-tech-tree-overlay
title: "A client-side search finder over the loaded corpus with a kind sub-line and lifted selection"
outcome: "A search box over the loaded corpus (assets on id/title/description/body, ADRs on title/id only) renders a ranked results list — each result a title over a muted kind sub-line, ADR results carrying their status — and lifts the picked selection via onSelect for the focus subgraph; its ranking and behaviour machine-witnessed, its appearance operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-drawer-shell]
decisions: [185, 70, 161, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a vitest
# jsdom component test importing a NOT-YET-EXISTING component (LibraryFinder.tsx) and a NOT-YET-EXISTING
# pure ranking module (librarySearch.ts) — both under apps/studio/src (red = module-not-found at HEAD),
# then writes them (green). The clean red→green heart is the PURE `searchCorpus(query, assets, docs)`
# ranking function; the component is the search box + results list around it.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the RANKING/BEHAVIOUR ONLY — assets
# match on id/title/description/body, ADRs on title/id only (never body — trap g, no docContent fetch),
# a short/empty query yields nothing, each result renders a title + a kindLabel sub-line (an `arc` asset
# reads "epic", never the raw key — trap j), an ADR result also shows its status, and clicking a result
# invokes onSelect and marks the selection. The finder's APPEARANCE (does the results list read as a
# forest-cozy lens over the world; the muted sub-line styling; the selected-row highlight colour) and its
# real MOUNTING into LibraryDrawer's `library-drawer-peek-slot` are the story's operator-attested UAT leg 2
# (the look is witnessed, never a machine visual verdict; do NOT add a visual/colour assertion here, and do
# NOT edit LibraryDrawer.tsx / TreeView.tsx in this `real:` scope — the finder is proven in isolation and
# takes assets/docs/onSelect as PROPS, the placement is the orchestrator's supplement glue after PASS).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this
# cap declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio).
# install: true (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lf-`-named contract test —
# including the pure searchCorpus ones — lives in LibraryFinder.test.tsx, which imports searchCorpus from
# ../lib/librarySearch.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryFinder.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryFinder.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibraryFinder.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryFinder.tsx"
        - "apps/studio/src/lib/librarySearch.ts"
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
        - "src/components/LibraryFinder.test.tsx"
---

# A client-side search finder over the loaded corpus with a kind sub-line and lifted selection

**Outcome —** A search box over the loaded corpus (assets matched on id/title/description/body, ADRs
matched on title/id only) renders a ranked results list — each result a title over a muted kind sub-line,
ADR results carrying their status — and lifts the picked selection via `onSelect` for the focus subgraph
(increment 3); its ranking and behaviour machine-witnessed, its appearance operator-attested.

**Depends on —** [`library-drawer-shell`](library-drawer-shell.md). The finder is the surface that fills
the shell's reserved **peek body slot** (`library-drawer-peek-slot`, `LibraryDrawer.tsx:111`) — the shell
walks the closed↔peek↔dive state machine and reserves the empty slot; this capability is what mounts into
it. That mount is the orchestrator's supplement glue AFTER this leaf's PASS (mirroring how increment 1's
real mounting into `TreeView.tsx` was outside its `real:` scope) — so this capability edits NEITHER
`LibraryDrawer.tsx` NOR `TreeView.tsx`; it proves the finder in isolation, driven by props. It holds no
backend seam — it reads the corpus that is ALREADY on the wire via `useAppData()` (the `studio` story's
library backend), taken as `assets`/`docs` props so the component is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW two-stage.** Neither
> `apps/studio/src/components/LibraryFinder.tsx` nor `apps/studio/src/lib/librarySearch.ts` exists at HEAD
> (verified 2026-07-11 — `ls` returns absent for both, and for the test file). This capability authors them
> test-first: a new vitest jsdom test drives the pure `searchCorpus` ranking and the finder's render /
> selection behaviour, RED at HEAD (module-not-found), GREEN once both modules are written. Its
> RANKING/BEHAVIOUR is machine-witnessed; its APPEARANCE inside the real drawer (the forest-cozy look, the
> muted sub-line, the selected-row highlight) and its real mounting into the shell's peek slot are the
> story's operator-attested UAT leg 2 (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED
> from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the FINDER AS A WHOLE — a pure ranking
function over the loaded corpus PLUS a behavioural React component that renders the ranked results as a
title-over-kind-sub-line list, shows an ADR result's status, and lifts the picked selection through an
`onSelect` callback — spanning the ranking heart, the results render, the kind-label routing, and the
selection lift, exercised in jsdom. It is the search surface that drives increment 3's focus subgraph
(the selection is the subgraph's centre); the subgraph, the dive body, and the overview are those
increments' jobs, gated on this selection.

SEARCH-ONLY, NO KIND FILTER CHIPS (ADR-0185 dec 2). The finder is search-first: a single query box that
narrows the corpus client-side. Do NOT build kind filter chips, a category picker, or facet controls —
navigation is by search and then by graph-walking the focus subgraph (increment 3), the Factorio
focus-on-selection model. One input, one ranked list, one selection.

THE PURE HEART — `searchCorpus(query, assets, docs)` (the clean red→green core, unit-testable without
jsdom). A pure ranking function in a NEW module `apps/studio/src/lib/librarySearch.ts`, taking the query
plus the loaded `assets: GuidanceAsset[]` and `docs: DocMeta[]` (both already in `useAppData()` —
`appData.ts`), returning a ranked, flat list of results. Each result carries what the row needs to render:
the `id`, the `title`, the `category` (an asset's own `category`; `'adr'` for a doc), a source discriminant
(asset vs doc), and — for a doc — its `status` (`DocMeta.status`, present only for `group === 'Decisions'`).
The ranking is sensible, not clever: a hit in a strong field (id / title) outranks a hit only in a weak
field (an asset's `description` / `body`). This function is the leaf's red→green heart; several `lf-`
contracts assert it directly (they live in the ONE test file but import it from `../lib/librarySearch`).

THE MATCH SURFACE — ASSETS WIDE, ADRs NARROW (trap g). An **asset** matches on `id` / `title` /
`description` / `body` — all four are on the `GuidanceAsset` wire (`types.ts`), already loaded, so the
match is free. An **ADR / doc** matches on `title` / `id` ONLY — `DocMeta` (`types.ts`) is a LIGHTWEIGHT
listing that carries no body, and the finder must NEVER call `docContent()` or fetch anything beyond what
`useAppData()` already holds (a search keystroke that fans out 184 ADR-body fetches is the trap). Do NOT
match a doc on its `excerpt` either — title/id only, exactly as ADR-0185 dec 3 has ADRs "searchable … 
bodies fetched on demand" (the on-demand body is increment 4's dive, not the finder's match).

THE KIND SUB-LINE ROUTES THROUGH `kindLabel` (trap j — NEVER a hand-rolled map). Each result renders two
lines: the `title`, and below it a muted **kind sub-line** whose text is `kindLabel(category, arcDisplay)`
(`apps/studio/src/lib/kindDisplay.ts`) — the ONE place a kind KEY maps to its display text (ADR-0183 D1).
Read the preference with the `useArcDisplay()` hook (as `Library.tsx:36,38` does). This is load-bearing:
an `arc` asset MUST render its `kindLabel` text ("epic" under the default preference), NEVER the raw key
`"arc"` — a hand-rolled `category → label` map here would make the finder read "arc" while every other
studio surface reads "Epic". Pin this in a contract (`lf-result-renders-title-and-kind-subline-via-kindLabel`).

SELECTION IS LIFTED, NOT OWNED (the seam to increment 3). Clicking a result invokes an `onSelect(result)`
callback the finder is handed as a prop — the finder does NOT own where the selection goes (increment 3's
focus subgraph centres on it). The finder DOES mark the currently-selected row (a stable `aria-current` /
`data-selected` marker) so the operator sees what they picked, but the selection STATE is lifted to the
caller via `onSelect`. Take `selectedId` (or the selected result) as a prop too, so the marked row is
deterministically drivable in jsdom — mirroring how the shell took `search` as a prop.

THE EMPTY / SHORT QUERY YIELDS NOTHING (the empty state is increment 5, not here). An empty, whitespace,
or too-short query returns NO results from `searchCorpus` and the finder renders no result rows (a bare
box). The whole-corpus dot-constellation overview that fills the empty state is increment 5's job (ADR-0185
dec 4) — do NOT render it here. Minimum to green: no query → no rows.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0185 dec 5 + ADR-0070). The finder follows the map's
forest-cozy palette (the world's CSS variables, as the shell does), NOT neutral-admin white and NEVER the
black-terminal look. The muted sub-line styling, the selected-row highlight colour, and how the list reads
as part of the world are WITNESSED by the owner (UAT leg 2), never a machine visual verdict — do NOT author
a visual/colour/appearance assertion in this cap's tests (assert the sub-line TEXT and the selection MARKER,
never their styling).

OFFLINE-TESTABLE IN JSDOM (the `ReviewToggle.test.tsx` / `LibraryDrawer.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent` (type into the box, click a
result). No backend seam to mock (the finder holds no `api` call — it takes `assets`/`docs` as props); the
pure `searchCorpus` tests need no jsdom at all but still live in the one test file (ADR-0122 coverage). No
real `fetch`, no `docContent`, no socket, no DB, no Electron. The component imports no agent/drive/model
(the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the finder: `searchCorpus(query, assets, docs)` ranks asset matches (id/title/description/
body) above ADR matches (title/id only, never body), yields nothing for a short/empty query; and the
`<LibraryFinder>` component renders each result as a title over a `kindLabel` sub-line (an `arc` asset reads
"epic"), shows an ADR result's status, and invokes `onSelect` (marking the picked row) on click — entirely
in jsdom, no backend, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the pure
`searchCorpus` ranking, the results render, the `kindLabel` routing, and the selection lift are all real. It
would:

1. Call `searchCorpus("<term>", assets, docs)` directly with a small fixed corpus (a few `GuidanceAsset`s
   spanning kinds — including an `arc` — and a couple of `DocMeta` ADRs). Assert an asset whose `title`/`id`
   matches ranks above one that matches only in `body`/`description`, and that a term present ONLY in an ADR
   body/excerpt does NOT surface that ADR (ADRs match title/id only — no fetch).
2. Call `searchCorpus("", …)` and `searchCorpus("  ", …)` (and a 1-char query if the floor is length-gated).
   Assert an empty result list — the empty-state overview is increment 5.
3. Render `<LibraryFinder assets={…} docs={…} onSelect={spy} />` in jsdom, type a matching query into the
   box, and assert each result row renders the `title` and a muted kind sub-line whose text is
   `kindLabel(category, arcDisplay)` — an `arc` asset's sub-line reads "epic" (the default preference), NOT
   the raw key `"arc"` (trap j pinned).
4. Assert an ADR (doc) result additionally renders its `status` (from `DocMeta.status`), where an asset
   result does not (assets carry no status).
5. Click a result row. Assert `onSelect` is invoked with that result (the selection lifted for increment 3),
   and the clicked row is marked selected (`aria-current` / `data-selected`) — driven by the `selectedId`
   prop so the marker is deterministic.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryFinder.test.tsx`; the pure-ranking contracts import `searchCorpus` from
`../lib/librarySearch`). Per ADR-0122 (`storytree coverage`) each contract id is the lead of a
distinctly-named test, so the coverage check reports 6/6 against the ONE `real.testFile`. None of these is
an APPEARANCE assertion — the look (forest-cozy palette, the muted sub-line styling, the selected-row
highlight) is the story's operator-attested UAT leg 2 (ADR-0070).

1. **`lf-search-ranks-asset-matches-across-fields`** — `searchCorpus` matches assets on id/title/description/body, ranked strong-field first
   - **asserts —** `searchCorpus(query, assets, docs)` returns an asset whose `id`/`title` matches the query,
     and also an asset that matches only in `description`/`body`; the id/title hit is ranked ABOVE the
     body-only hit (a sensible strong-field-first order, not clever relevance). All four asset fields are
     match surfaces.
   - **covers —** `apps/studio/src/lib/librarySearch.ts` (the pure asset match + rank)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx` (net-new, vitest; imports `searchCorpus`).
2. **`lf-adrs-matched-on-title-and-id-only`** — ADRs match on title/id only, never body/excerpt (no fetch)
   - **asserts —** `searchCorpus` surfaces an ADR (`DocMeta`) whose `title` or `id` matches the query, but
     does NOT surface an ADR when the query appears only in a body/excerpt-like field — `DocMeta` carries no
     body and the finder never fetches one (trap g). No `docContent`/fetch is called.
   - **covers —** `apps/studio/src/lib/librarySearch.ts` (the doc match — title/id only)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx`.
3. **`lf-short-or-empty-query-yields-no-results`** — an empty/whitespace/too-short query returns nothing
   - **asserts —** `searchCorpus("", …)`, `searchCorpus("   ", …)` (and a below-floor 1-char query, if the
     floor is length-gated) each return an empty result list, and `<LibraryFinder>` with such a query renders
     no result rows. The whole-corpus overview that fills the empty state is increment 5, not here.
   - **covers —** `apps/studio/src/lib/librarySearch.ts` + `apps/studio/src/components/LibraryFinder.tsx` (the empty-query guard)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx`.
4. **`lf-result-renders-title-and-kind-subline-via-kindLabel`** — each result renders a title + a `kindLabel` kind sub-line; an `arc` reads "epic", never the raw key
   - **asserts —** rendering `<LibraryFinder>` over a corpus that includes an `arc` asset, each result row
     shows its `title` and a muted kind sub-line whose text is `kindLabel(category, arcDisplay)`; the `arc`
     asset's sub-line reads "epic" (the default preference), and the raw key `"arc"` does NOT appear as the
     sub-line text. The sub-line routes through `kindLabel` — NEVER a hand-rolled `category → label` map
     (trap j).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the result row — title + `kindLabel` sub-line)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx`.
5. **`lf-adr-result-shows-status`** — an ADR result additionally renders its status
   - **asserts —** an ADR (doc) result renders its `status` (from `DocMeta.status`, e.g. "accepted") as a
     status marker on the row, whereas an asset result (which carries no status) renders none. ADR status is
     surfaced; asset rows are not forced to carry a status they lack.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the doc-result status marker)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx`.
6. **`lf-click-invokes-onselect-and-marks-selection`** — clicking a result invokes `onSelect` and marks the picked row
   - **asserts —** clicking a result row invokes the `onSelect` callback with that result (the selection
     lifted for increment 3's focus subgraph), and the row identified by the `selectedId` prop is marked
     selected (`aria-current` / `data-selected`). Selection STATE is lifted to the caller; the finder only
     reflects it.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the `onClick`→`onSelect` lift + the selected-row marker)
   - **proven by —** `apps/studio/src/components/LibraryFinder.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the finder as a new pure module + a new
component, test-first.

- **The new test —** `apps/studio/src/components/LibraryFinder.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryDrawer.test.tsx` /
  `ReviewToggle.test.tsx` shape; NO real `fetch`/`docContent`/socket/DB/Electron). Import `{ searchCorpus }`
  from `"../lib/librarySearch"` and `{ LibraryFinder }` from `"./LibraryFinder"`. Name each test for its
  contract id (`lf-…`) so `storytree coverage library-finder` reports 6/6 (ADR-0122) — the pure-ranking
  contracts (1–3) live in THIS one file too, since coverage scans only `real.testFile`.
- **The RED the spine observes (before IMPLEMENT) —** the imports resolve NOTHING — neither
  `apps/studio/src/lib/librarySearch.ts` nor `apps/studio/src/components/LibraryFinder.tsx` exists at HEAD, so
  the test fails module-not-found (the net-new missing-symbol red, ADR-0057).
- **The GREEN —** write the two modules. `apps/studio/src/lib/librarySearch.ts`: a pure
  `searchCorpus(query, assets, docs)` — assets matched on id/title/description/body, ADRs (docs) matched on
  title/id only, empty/short query → no results, strong-field-first ranking, returning flat results that
  carry `{ id, title, category, source, status? }`. `apps/studio/src/components/LibraryFinder.tsx`: a search
  box + results list taking `assets`/`docs`/`onSelect`/`selectedId` as PROPS, rendering each result as a
  title over a `kindLabel(category, arcDisplay)` sub-line (via `useArcDisplay()`), showing an ADR result's
  status, and invoking `onSelect` + marking the selected row on click. MOUNTING it into the shell's
  `library-drawer-peek-slot` and the forest-cozy appearance are witnessed under the story's UAT leg 2
  (operator-attested, ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the imports
  resolve, the assertions hold, and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Search-only, no filter chips** — one query box, one ranked list, one selection (ADR-0185 dec 2); do NOT
  build kind filter chips or a category picker (navigation is search then graph-walk).
- **Assets wide, ADRs narrow** — assets match id/title/description/body; ADRs match title/id ONLY, never body
  or excerpt, and the finder NEVER fetches an ADR body (`lf-adrs-matched-on-title-and-id-only`, trap g). No
  `docContent`, no fetch beyond `useAppData()`.
- **Kind sub-line via `kindLabel`, never a hand-rolled map** — the sub-line text is
  `kindLabel(category, arcDisplay)` so an `arc` reads "epic" like every other surface
  (`lf-result-renders-title-and-kind-subline-via-kindLabel`, trap j).
- **Selection is lifted, not owned** — clicking a result invokes the `onSelect` prop and marks the row; the
  selection state lives with the caller for increment 3 (`lf-click-invokes-onselect-and-marks-selection`).
- **Empty state is increment 5** — a short/empty query renders nothing here
  (`lf-short-or-empty-query-yields-no-results`); do NOT render the dot constellation (minimum to green).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the ranking, the sub-line TEXT,
  the status, and the selection MARKER; the forest-cozy look, the muted styling, and the highlight colour are
  the story's UAT leg 2. Do not author a visual verdict, and do NOT edit `LibraryDrawer.tsx` or `TreeView.tsx`
  in the `real:` scope (the mount into the peek slot is the orchestrator's supplement glue after PASS; the
  component is proven in isolation, driven by props).
