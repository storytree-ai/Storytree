---
id: "library-category-shelf"
tier: capability
story: library-tech-tree-overlay
title: "The finder's idle state is a category shelf (one row per corpus category + a Decisions/ADRs row, each with its count, all derived from the loaded corpus) and each category is a removable search scope: picking one lists all its artifacts, subsequent typing filters within the scope, clearing returns to the shelf — the signed lf-* query path stays byte-green"
outcome: "With no query and no scope the finder shows a CATEGORY SHELF (ADR-0188 dec 2): one row per category PRESENT in the loaded corpus — grouped from `assets` by `category`, never a hardcoded kind list — plus a Decisions (ADRs) row from `docs`, each row carrying its count (the pure grouping/count heart is `apps/studio/src/lib/libraryShelf.ts`). Clicking a category row turns it into a removable SCOPE CHIP: the list shows ALL of that category's artifacts with no query floor (this is browse, not search), and the Decisions row scopes to `docs`. Typing while scoped runs `searchCorpus(query, assets, docs)` filtered to the scope's category; the input placeholder NAMES the scope when scoped and is generic otherwise; clearing the chip (with an empty query) returns to the shelf. A scoped row click lifts `onSelect` with the finder-parity `SearchResult`, unchanged. The shelf/scope BEHAVIOUR is machine-witnessed; the shelf's appearance (full-width input, shelf styling, icons) is operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [188, 187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). BROWNFIELD (editsExisting: true) — this REWORKS the signed
# inc-2 finder (`apps/studio/src/components/LibraryFinder.tsx`, green at HEAD with its `lf-*` contracts) to add
# the idle category shelf + the scope-chip browse/search model ADR-0188 dec 2 settles. The rework is ADDITIVE
# around the EXISTING query path: with a typed query and no scope the finder still ranks via `searchCorpus`
# exactly as before, so the signed `lf-*` contracts in `LibraryFinder.test.tsx` stay byte-green (they drive a
# typed query and no scope). The pure grouping/count/category-listing heart is a NET-NEW pure lib
# `apps/studio/src/lib/libraryShelf.ts` (no React), so real.scope.sourceGlobs names BOTH the reworked component
# AND the new lib (the multi-sourceGlob precedent from `library-open-trigger.md` / `library-overview.md`, ADR-0122
# one-real.testFile discipline). real.sourceFile picks ONE representative (LibraryFinder.tsx); real.testFile is a
# NET-NEW `LibraryCategoryShelf.test.tsx` that drives the shelf/scope/browse/search behaviour in jsdom.
# The RED the spine observes is a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT module-not-found): at
# HEAD the finder renders only the search-box + ranked-results path (no shelf, no scope chip), so the shelf test
# fails; the NET-NEW `libraryShelf.ts` heart makes its OWN import a module-not-found until authored, which the
# same failing run subsumes.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY — the idle shelf (rows +
# counts derived from the corpus), the category→scope-chip transition, the scoped browse-all-then-filter, the
# clear-chip-returns-to-shelf round-trip, the scope-named placeholder, and the unchanged `onSelect` lift. The
# shelf's APPEARANCE (the full-width search input, the shelf row styling, any category icons, the scope-chip
# look) is the story's operator-attested UAT leg (ADR-0188 dec 2/7, ADR-0070) — do NOT author a visual/colour/
# pixel/animation assertion here, and do NOT edit `TreeView.tsx` in this `real:` scope (the finder mount + the
# AppData-backed `assets`/`docs` composition is the orchestrator's supplement glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this cap
# declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio). install: true
# (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lcs-`-named contract test lives
# in LibraryCategoryShelf.test.tsx. Its TITLE must carry the unique `lcs-` id or coverage silently drops
# N-1/N past the signed green (`sdk-leaf-drops-contract-id-test-names` — this arc's 5th-occurrence class risk;
# the fix if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibraryCategoryShelf.test.tsx"
    sourceFile: "apps/studio/src/components/LibraryFinder.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/LibraryCategoryShelf.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibraryFinder.tsx"
        - "apps/studio/src/lib/libraryShelf.ts"
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
        - "src/components/LibraryCategoryShelf.test.tsx"
---

# The category shelf — idle browse + a removable search scope over the loaded corpus

**Outcome —** With no query and no scope the finder shows a CATEGORY SHELF (ADR-0188 dec 2): one row per
category PRESENT in the loaded corpus — grouped from `assets` by their `category`, never a hardcoded kind
list — plus a Decisions (ADRs) row from `docs`, each row carrying its count. The pure grouping/count/
category-listing heart lives in `apps/studio/src/lib/libraryShelf.ts` (no React). Clicking a category row
turns it into a removable SCOPE CHIP: the list shows ALL of that category's artifacts with NO query floor (this
is browse, not search), and the Decisions row scopes to `docs`. Typing while scoped runs
`searchCorpus(query, assets, docs)` filtered to the scope's category; the search input placeholder NAMES the
scope when scoped and is generic otherwise; clearing the chip (with an empty query) returns to the shelf. A
scoped row click lifts `onSelect` with the finder-parity `SearchResult` (the lift is unchanged). The shelf/
scope BEHAVIOUR is machine-witnessed; the shelf's appearance (the full-width input, shelf styling, icons) is
the story's operator-attested UAT leg.

**Depends on —** [`library-finder`](library-finder.md). This capability REWORKS the landed finder
(`LibraryFinder.tsx`, inc 2) — it adds the idle shelf and the scope-chip model around the finder's existing
`searchCorpus` query path, reusing the finder's `assets`/`docs`/`onSelect` props and its `SearchResult` lift. It
needs the delivered finder (its search heart, its result-row rendering, its selection lift) as its precondition,
so `depends_on: [library-finder]`. It holds no backend seam — the shelf and scoped browse read only the loaded
corpus already handed in as props (`assets`/`docs`), so it is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, BROWNFIELD re-author (editsExisting).** `LibraryFinder.tsx` EXISTS and
> is green at HEAD on its search-box + ranked-results path (verified 2026-07-12 — no idle shelf, no scope chip;
> `searchCorpus` returns `[]` for an empty query, so the finder simply shows no rows when idle). This capability
> reworks it: a NET-NEW vitest jsdom test (`LibraryCategoryShelf.test.tsx`) drives the idle shelf (rows + counts
> derived from the corpus), the category→scope-chip transition, the scoped browse-all-then-filter, the
> clear-chip round-trip, the scope-named placeholder, and the unchanged `onSelect` lift — RED at HEAD as a
> FAILING-ASSERTION red (the shelf/scope behaviour is absent; the NET-NEW `libraryShelf.ts` import is
> module-not-found until authored, subsumed by the same failing run), GREEN once the finder is reworked and
> `libraryShelf.ts` authored. Its BEHAVIOUR is machine-witnessed; its APPEARANCE is the story's
> operator-attested UAT leg (ADR-0070). Status stays `proposed` — `healthy` is only ever DERIVED from signed
> verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the IDLE-BROWSE + SCOPED-SEARCH MODEL AS A WHOLE
— a behavioural rework of the finder that (a) derives a category shelf from the loaded corpus, (b) turns a
category into a removable scope chip that browses all its artifacts, (c) filters within the scope as the user
types, and (d) returns to the shelf when the chip clears — spanning the pure grouping heart, the shelf render,
the scope-chip state machine, and the scoped search/browse path, exercised in jsdom. It is the browse-entry
half of ADR-0188 dec 2; the pinned selection card (`library-selection-card`) and the top drawer handle
(`library-top-drawer`, which replaced the retired `library-lens-minimise` per ADR-0191) are their own increments.

THE PURE GROUPING/COUNT/LISTING HEART LIVES IN `libraryShelf.ts` (NET-NEW, no React). The shelf is DERIVED,
never hardcoded (ADR-0188 dec 2 — "derived from the loaded corpus, never hardcoded"). Author a NET-NEW pure lib
`apps/studio/src/lib/libraryShelf.ts` that groups `assets` by their `category` to produce one shelf entry per
category PRESENT (its `category` + its count), plus a Decisions entry from `docs` (its count) — a category with
zero assets in the loaded corpus gets NO row, and the Decisions row is present only when `docs` is non-empty
(or, per the leaf's call, always present with its `docs.length` count — assert the count, not the presence
rule's edge). The same lib carries the category-listing heart: given a scoped category (an `AssetCategory`, or
the Decisions/`adr` pseudo-scope), return ALL of that category's artifacts as finder-parity `SearchResult`s
(`{ source:'asset', category }` for an artifact / `{ source:'doc', category:'adr', ...status }` for an ADR) with
NO query floor — this is the browse list the scope chip shows before any typing. Keep it PURE (input → output,
no `useState`, no DOM) so it proves directly. Pin the grouping heart in `lcs-shelf-groups-corpus-by-category`.

THE IDLE STATE RENDERS THE SHELF (empty query + no scope). When the finder has an empty query and no active
scope, it renders the category shelf (one row per shelf entry from the pure heart, each showing its category
label via `kindLabel(category, useArcDisplay())` — NEVER a hand-rolled category→label map, ADR-0183 D1 — and
its count; plus the Decisions row with its count). Give shelf rows a DISTINCT testid (e.g.
`library-shelf-row-<category>` / a `library-shelf-decisions-row`), NOT the `library-finder-row-<id>` result-row
prefix — this is the fence that keeps `lf-short-or-empty-query-yields-no-results` byte-green (see the FENCE
below). Pin the idle shelf in `lcs-idle-renders-category-shelf`.

A CATEGORY CLICK BECOMES A REMOVABLE SCOPE CHIP THAT BROWSES ALL ITS ARTIFACTS. Clicking a shelf row sets a
component-local scope state (the category, or the Decisions/`adr` pseudo-scope) — rendered as a removable scope
CHIP — and the list switches to ALL of that category's artifacts via the pure listing heart, with NO query
floor (browse, dec 2: "the panel lists the category's artifacts"). The Decisions row scopes to `docs`. Scope
state is component-local, exactly like `query` (dec 2 — "categories are a browse ENTRY, not filter chrome
bolted onto results"; the finder still owns no cross-render selection). Pin it in
`lcs-category-click-scopes-and-lists-all`.

TYPING WHILE SCOPED FILTERS WITHIN THE SCOPE; THE PLACEHOLDER NAMES IT. With a scope active, typing a query
runs `searchCorpus(query, assets, docs)` and FILTERS the results to the scope's category (an artifact scope
keeps only `source:'asset'` results whose `category` matches; the Decisions scope keeps only `source:'doc'`
results). The search input's placeholder NAMES the active scope (e.g. "Search <category>…") when scoped and is
generic (e.g. "Search library…") otherwise. Assert the scoped filtering AND the scope-named-vs-generic
placeholder. Pin it in `lcs-scoped-typing-filters-within-scope`.

CLEARING THE CHIP RETURNS TO THE SHELF. Removing the scope chip (with an empty query) clears the scope state and
the finder renders the category shelf again (the idle state). Pin the round-trip in
`lcs-clear-chip-returns-to-shelf`.

THE `onSelect` LIFT IS UNCHANGED — a scoped/browse row click still lifts the finder-parity `SearchResult`. A
click on a row in the scoped browse list (or a scoped search result) invokes `onSelect(result)` with the SAME
finder-parity `SearchResult` the inc-2 finder lifts — this is the inc-2 selection lift, unchanged; the shelf/
scope wrap it, they don't replace it. Pin it in `lcs-scoped-row-click-lifts-searchresult`.

FENCE — THE SIGNED `lf-*` CONTRACTS STAY BYTE-GREEN (do NOT disturb `LibraryFinder.test.tsx`). The inc-2 finder
contracts (`lf-search-ranks-asset-matches-across-fields`, `lf-adrs-matched-on-title-and-id-only`,
`lf-short-or-empty-query-yields-no-results`, `lf-result-renders-title-and-kind-subline-via-kindLabel`,
`lf-adr-result-shows-status`, `lf-click-invokes-onselect-and-marks-selection`) drive the finder with a TYPED
query and NO scope. The rework is ADDITIVE around that path: with a typed query and no scope the finder still
ranks via `searchCorpus` and renders `library-finder-row-<id>` result rows exactly as before, and
`lf-short-or-empty-query-yields-no-results` (which counts `library-finder-row-` rows under an EMPTY query) stays
green because the idle SHELF rows carry a DISTINCT testid, never the result-row prefix — zero result rows under
an empty query still holds. `LibraryFinder.test.tsx` is OUTSIDE this cap's `real.scope` (its `testGlobs` is
`LibraryCategoryShelf.test.tsx` only), so the leaf CANNOT and MUST NOT edit it — keep the existing prop surface
and the result-row testid so it stays green with zero edits. Do NOT rename or disturb the `lf-*` test titles.

REUSE THE EXISTING `SearchResult` — DEFINE NO NEW TYPE (the inc-7 fence). The shelf listing and the scoped
results lift the EXISTING `SearchResult` from `../lib/librarySearch` — the same discriminated shape the finder
already lifts. Do NOT define a new type and do NOT touch `apps/studio/src/types.ts` or `apps/studio/server/**`
— that is the inc-6/inc-7 lane, file-disjoint (plan §Lanes FENCE). The shelf-entry shape (`{ category, count }`)
is a local `libraryShelf.ts` type, not a wire type.

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0188 dec 2/7 + ADR-0070). The shelf follows the map's
forest-cozy palette (the world's CSS variables, as the finder does), NOT neutral-admin white. The full-width
search input, the shelf row styling, any category icons, and the scope-chip look are WITNESSED by the owner
(the shared inc-9/10 attestation), never a machine visual verdict — do NOT author a visual/colour/pixel/
animation assertion in this cap's tests (assert the shelf rows + counts, the scope-chip transition, the scoped
browse/filter, the clear-chip round-trip, the placeholder text, and the `onSelect` lift, never their styling).

OFFLINE-TESTABLE IN JSDOM (the `LibraryFinder.test.tsx` discipline). `@vitest-environment jsdom`,
`@testing-library/react` for render / `fireEvent` (type into the input, click a shelf row, click the chip's
remove control, click a browse/result row). No backend seam to mock — the finder takes `assets`/`docs`/
`onSelect` as props and renders from the loaded corpus. No real `fetch`, no socket, no DB, no Electron. The
component imports no agent/drive/model (the `modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the category-shelf browse + scoped-search model: idle (empty query, no scope) renders one
shelf row per corpus category + a Decisions row, each with its count (derived, not hardcoded); clicking a
category becomes a removable scope chip that lists ALL that category's artifacts; typing while scoped filters
`searchCorpus` results to the scope and the placeholder names the scope; clearing the chip returns to the shelf;
a scoped/browse row click lifts the finder-parity `SearchResult` via `onSelect` — entirely in jsdom, driven by
props — with the signed `lf-*` query path byte-green.

The integration test exercises this capability against its own composition (no backend seam) — the pure shelf
heart, the shelf render, the scope-chip state, the scoped browse/search, and the `onSelect` lift are all real.
It would:

1. Call the pure `libraryShelf.ts` heart over a small fixed corpus (assets across two or three categories + a
   couple of docs) and assert it yields one entry per PRESENT category with the right count (a category with no
   assets yields no entry) plus a Decisions entry with `docs.length`.
2. Render `<LibraryFinder assets={…} docs={…} onSelect={vi.fn()} />` in jsdom with no query. Assert the idle
   category shelf renders — one shelf row per present category + a Decisions row, each showing its count — and
   that NO `library-finder-row-` result row is present (the shelf rows carry a distinct testid).
3. `fireEvent.click` a category shelf row. Assert a removable scope chip appears and the list shows ALL of that
   category's artifacts (no query floor). Click the Decisions row (separately) and assert it scopes to the docs.
4. With a scope active, type a query into the input. Assert `searchCorpus` results are filtered to the scope's
   category, and that the input placeholder names the scope (vs a generic placeholder when unscoped).
5. Remove the scope chip with an empty query. Assert the category shelf renders again (back to idle).
6. Click a row in the scoped browse/results list and assert `onSelect` is invoked with that row's finder-parity
   `SearchResult` (the unchanged inc-2 lift).

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibraryCategoryShelf.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract
id is the lead of a distinctly-named test, so the coverage check reports 6/6 against the ONE `real.testFile`.
None of these is an APPEARANCE assertion — the look (the full-width input, the shelf styling, the scope-chip
look) is the story's operator-attested UAT leg (ADR-0070).

1. **`lcs-shelf-groups-corpus-by-category`** — the pure heart derives one shelf entry per corpus category (grouped from assets, never hardcoded) + a Decisions entry, each with its count
   - **asserts —** `libraryShelf.ts`'s pure heart, over a fixed corpus, yields one entry per category PRESENT
     in `assets` (grouped by `category`, NEVER a hardcoded kind list) with that category's count, plus a
     Decisions entry from `docs` carrying `docs.length`; a category with no assets in the corpus yields no
     entry. Pure input → output (no React).
   - **covers —** `apps/studio/src/lib/libraryShelf.ts` (the grouping/count heart)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx` (net-new, vitest jsdom).
2. **`lcs-idle-renders-category-shelf`** — idle (empty query, no scope) renders the category shelf, not a result list
   - **asserts —** with no query and no scope, `<LibraryFinder>` renders one shelf row per present category +
     a Decisions row, each showing its count (via the pure heart), each labelled through
     `kindLabel(category, useArcDisplay())`; and NO `library-finder-row-` result row is present (the shelf rows
     carry a DISTINCT testid — the fence that keeps `lf-short-or-empty-query-yields-no-results` byte-green).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the idle-state shelf render)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx`.
3. **`lcs-category-click-scopes-and-lists-all`** — clicking a category becomes a removable scope chip and lists ALL that category's artifacts (no query floor)
   - **asserts —** `fireEvent.click` on a category shelf row sets a component-local scope (rendered as a
     removable scope chip) and the list switches to ALL of that category's artifacts via the pure listing heart
     with NO query floor (browse); the Decisions row scopes to `docs`. Scope state is component-local (like
     `query`).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the scope-chip state + scoped browse list) and
     `apps/studio/src/lib/libraryShelf.ts` (the category-listing heart)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx`.
4. **`lcs-scoped-typing-filters-within-scope`** — typing while scoped filters searchCorpus to the scope; the placeholder names the scope
   - **asserts —** with a scope active, typing a query runs `searchCorpus(query, assets, docs)` and filters the
     results to the scope's category (artifact scope → only matching `source:'asset'` results; Decisions scope →
     only `source:'doc'` results); and the input placeholder NAMES the active scope when scoped and is generic
     when unscoped.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the scoped search filter + the scope-named placeholder)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx`.
5. **`lcs-clear-chip-returns-to-shelf`** — clearing the scope chip (with an empty query) returns to the category shelf
   - **asserts —** removing the scope chip with an empty query clears the scope and re-renders the category
     shelf (back to the idle state — the shelf rows return, the browse/results list is gone).
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the clear-scope → shelf round-trip)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx`.
6. **`lcs-scoped-row-click-lifts-searchresult`** — a scoped/browse row click lifts onSelect with the finder-parity SearchResult (unchanged)
   - **asserts —** clicking a row in the scoped browse/results list invokes `onSelect(result)` with the row's
     finder-parity `SearchResult` (`{ source:'asset', category }` for an artifact / `{ source:'doc',
     category:'adr', ...status }` for an ADR) — the SAME shape the inc-2 finder lifts; the shelf/scope wrap the
     inc-2 lift, they do not replace it.
   - **covers —** `apps/studio/src/components/LibraryFinder.tsx` (the unchanged `onSelect` lift from a scoped/browse row)
   - **proven by —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx`.

## Guidance — the brownfield slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, BROWNFIELD editsExisting): rework the signed finder into the
category-shelf browse + scoped-search model, test-first, with the `lf-*` query path byte-green.

- **The new test —** `apps/studio/src/components/LibraryCategoryShelf.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` shape; NO
  real `fetch`/socket/DB/Electron). Import `{ LibraryFinder }` from `"./LibraryFinder"`, the pure heart from
  `"../lib/libraryShelf"`, and `import type { SearchResult, ... } from "../lib/librarySearch"` / the corpus
  fixtures — define NO new wire type. Name each test for its contract id (`lcs-…`) so
  `storytree coverage library-category-shelf` reports 6/6 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a FAILING-ASSERTION red (LibraryFinder.tsx exists — NOT
  module-not-found): at HEAD the finder renders only the search-box + ranked-results path, so the idle-shelf /
  scope-chip / scoped-browse assertions fail; the NET-NEW `libraryShelf.ts` import is module-not-found until
  authored, subsumed by the same failing run. This is the brownfield red the spine observes against the
  search-only finder at HEAD (ADR-0057).
- **The GREEN —** author `apps/studio/src/lib/libraryShelf.ts` (the pure grouping/count/category-listing heart)
  and rework `apps/studio/src/components/LibraryFinder.tsx`: render the idle category shelf (rows + counts from
  the pure heart, distinct testid) when there is no query and no scope; add component-local scope state; on a
  category click set the scope, show a removable chip, and browse ALL that category's artifacts (no query
  floor); on typing while scoped filter `searchCorpus` to the scope and name the scope in the placeholder; on
  clearing the chip (empty query) return to the shelf; keep the `onSelect` lift unchanged. Keep the existing
  `assets`/`docs`/`onSelect`/`selectedId` prop surface and the `library-finder-row-<id>` result-row testid so
  `LibraryFinder.test.tsx` (OUTSIDE this `real.scope`) stays byte-green with zero edits. WIRING the finder's
  mount + the AppData-backed `assets`/`docs` composition into `TreeView.tsx` and the forest-cozy appearance are
  witnessed under the story's operator-attested UAT leg (ADR-0070), NOT asserted in CI and NOT in this `real:`
  scope. After it, the new test's assertions hold and `pnpm --filter studio test` +
  `pnpm --filter studio typecheck` stay green.

Rules:

- **The idle state is the derived category shelf** (`lcs-idle-renders-category-shelf`,
  `lcs-shelf-groups-corpus-by-category`, ADR-0188 dec 2) — rows grouped from the loaded corpus, never a
  hardcoded kind list; the pure heart lives in `libraryShelf.ts`.
- **A category is a removable scope chip that browses all its artifacts** (`lcs-category-click-scopes-and-lists-all`)
  — no query floor; the Decisions row scopes to docs; scope state is component-local like `query`.
- **Typing while scoped filters within the scope; the placeholder names it** (`lcs-scoped-typing-filters-within-scope`).
- **Clearing the chip returns to the shelf** (`lcs-clear-chip-returns-to-shelf`).
- **The `onSelect` lift is unchanged** (`lcs-scoped-row-click-lifts-searchresult`) — the finder-parity
  `SearchResult`, the inc-2 lift wrapped, not replaced.
- **The signed `lf-*` contracts stay byte-green** — additive around the existing query path; shelf rows carry a
  distinct testid; do NOT edit `LibraryFinder.test.tsx` (outside this `real.scope`) or disturb the `lf-*`
  titles.
- **Reuse the existing `SearchResult`, touch no `types.ts`/`server`** (inc-6/7 fence) — define no new wire type.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the shelf/scope/browse/search
  behaviour; the full-width input, shelf styling, and icons are the shared inc-9/10 look leg. Do NOT author a
  visual verdict, and do NOT edit `TreeView.tsx` in the `real:` scope (the mount is the orchestrator's
  supplement glue after PASS — plan §G).
- **Every `lcs-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's 5th-occurrence class risk — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
