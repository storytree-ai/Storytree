---
id: "library-selection-card"
tier: capability
story: library-tech-tree-overlay
title: "A pinned selection card in the side panel renders what is selected — an asset's title/kind/description (description looked up from the loaded corpus, since SearchResult carries none) or an ADR's title/status/load-bearing badge — with an Open button; null renders nothing and a stale selection renders tolerantly off the SearchResult alone"
outcome: "A pinned SELECTION CARD (ADR-0188 dec 3 — the structural fix for the attested blank-panel bug) renders what is currently selected. Props: `selection: SearchResult | null`, `assets: GuidanceAsset[]`, `docs: DocMeta[]`, `onOpen: (r: SearchResult) => void`. A null selection renders nothing. An ASSET selection renders its title, its kind via `kindLabel(category, useArcDisplay())` (never a hand-rolled map), and its DESCRIPTION looked up from `assets` by id via the pure `apps/studio/src/lib/selectionDetail.ts` helper (SearchResult carries no description). An ADR selection renders its title, its status, and a LOAD-BEARING badge exactly when the matching `DocMeta.loadBearing` is true (read-only consumption of the inc-6 optional wire field — no `types.ts` edit). An `Open`-labelled button (the word \"Open\") fires `onOpen(selection)`. A STALE selection whose id is absent from the corpus renders tolerantly off the `SearchResult` alone (title + kind, no description, no crash — the inc-3 real-data crash-class guard). The card's BEHAVIOUR is machine-witnessed; its styling is operator-attested."
status: proposed
proof_mode: integration-test
depends_on: [library-finder]
decisions: [188, 187, 185, 70, 23]
# Node-borne proof config (ADR-0057 keystone). NET-NEW capability — both the component
# (`apps/studio/src/components/LibrarySelectionCard.tsx`) and its pure detail-lookup helper
# (`apps/studio/src/lib/selectionDetail.ts`) are authored fresh, so the RED the spine observes is a
# MODULE-NOT-FOUND red (the test imports a component/helper that does not yet exist at HEAD), GREEN once both
# are authored. real.sourceFile = the NEW LibrarySelectionCard.tsx; real.scope.sourceGlobs names BOTH the
# component AND the NET-NEW pure helper (the multi-sourceGlob precedent from `library-open-trigger.md` /
# `library-overview.md`, ADR-0122 one-real.testFile discipline). real.testFile = a NET-NEW
# LibrarySelectionCard.test.tsx that drives the card's render + Open wiring in jsdom.
# FRONTEND-BUILDER TWO-STAGE (ADR-0070): this `real:` arm proves the BEHAVIOUR ONLY — the null-renders-nothing
# gate, the asset title/kind/description render (description resolved by the pure helper from the corpus, since
# SearchResult carries none), the ADR title/status/load-bearing-badge render (read-only off DocMeta.loadBearing),
# the Open button firing `onOpen(selection)`, and the stale-selection tolerant render. The card's APPEARANCE
# (the card styling, the badge look, the layout) is the story's operator-attested UAT leg (ADR-0188 dec 3/7,
# ADR-0070) — do NOT author a visual/colour/pixel/animation assertion here, and do NOT edit `TreeView.tsx` in
# this `real:` scope (the card mount + the AppData-backed `assets`/`docs`/`selection`/`onOpen` wiring is the
# orchestrator's supplement glue after PASS — plan §G).
#
# CRITICAL — apps/studio is VITEST + jsdom (@testing-library/react), NOT node:test (apps/studio/vitest.config.ts,
# include src/**/*.test.{ts,tsx}). The default `node --test` real proof cannot run a `.test.tsx`. So this cap
# declares a `real.proofCommand` running the ONE test file under vitest (cwd = apps/studio). install: true
# (fresh-worktree tsx + tsc + vitest, ADR-0031 §2) + a typecheck wall. SCOPE = apps/studio/src.
# COVERAGE (ADR-0122): `storytree coverage` scans ONLY real.testFile, so EVERY `lsel-`-named contract test lives
# in LibrarySelectionCard.test.tsx. Its TITLE must carry the unique `lsel-` id or coverage silently drops N-1/N
# past the signed green (`sdk-leaf-drops-contract-id-test-names` — this arc's 5th-occurrence class risk; the fix
# if it happens is TEST-TITLE-ONLY, never an assertion/source edit).
#
# FENCE (inc-6 read-only): the load-bearing badge READS the EXISTING optional `DocMeta.loadBearing?` field the
# inc-6 wire already lands (verified in apps/studio/src/types.ts) — do NOT edit `apps/studio/src/types.ts` or
# `apps/studio/server/**`, and define no new type; reuse the EXISTING `SearchResult` (`../lib/librarySearch`),
# `GuidanceAsset`/`DocMeta` (`../types`), and `kindLabel`/`useArcDisplay` (`../lib/kindDisplay`).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/LibrarySelectionCard.test.tsx"
    sourceFile: "apps/studio/src/components/LibrarySelectionCard.tsx"
    scope:
      testGlobs: ["apps/studio/src/components/LibrarySelectionCard.test.tsx"]
      sourceGlobs:
        - "apps/studio/src/components/LibrarySelectionCard.tsx"
        - "apps/studio/src/lib/selectionDetail.ts"
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
        - "src/components/LibrarySelectionCard.test.tsx"
---

# The pinned selection card — the permanent home of "what am I looking at"

**Outcome —** A pinned SELECTION CARD (ADR-0188 dec 3 — the structural fix for the attested blank-panel bug)
renders what is currently selected. Its props are `selection: SearchResult | null`, `assets: GuidanceAsset[]`,
`docs: DocMeta[]`, and `onOpen: (r: SearchResult) => void`. A null selection renders nothing. An ASSET selection
renders its title, its kind via `kindLabel(category, useArcDisplay())` (NEVER a hand-rolled category→label map),
and its DESCRIPTION looked up from `assets` by id via the pure `apps/studio/src/lib/selectionDetail.ts` helper
(the `SearchResult` carries no description). An ADR selection renders its title, its status, and a LOAD-BEARING
badge exactly when the matching `DocMeta.loadBearing` is true (a READ-ONLY consumption of the inc-6 optional
wire field — no `types.ts` edit). An `Open`-labelled button (the word "Open") fires `onOpen(selection)`. A STALE
selection whose id is absent from the loaded corpus renders tolerantly off the `SearchResult` alone (title +
kind, no description, no crash — the inc-3 real-data crash-class guard). The card's BEHAVIOUR is
machine-witnessed; its styling is the story's operator-attested UAT leg.

**Depends on —** [`library-finder`](library-finder.md). The card renders the finder's lifted `SearchResult`
selection (the same `SearchResult` the finder / subgraph / overview lift) and resolves its detail from the same
loaded corpus the finder searches (`assets`/`docs`). It needs the delivered finder's selection shape as its
precondition, so `depends_on: [library-finder]`. It holds no backend seam — the card reads only the loaded
corpus already handed in as props and lifts through `onOpen`, so it is deterministically drivable in jsdom.

> **Proof status (honest) — `proposed`, NET-NEW (module-not-found RED).** Neither
> `apps/studio/src/components/LibrarySelectionCard.tsx` nor `apps/studio/src/lib/selectionDetail.ts` exists at
> HEAD (verified 2026-07-12). This capability authors both: a NET-NEW vitest jsdom test
> (`LibrarySelectionCard.test.tsx`) imports the not-yet-existing component + helper and drives the
> null-renders-nothing gate, the asset title/kind/description render, the ADR title/status/load-bearing-badge
> render, the Open button firing `onOpen(selection)`, and the stale-selection tolerant render — RED at HEAD as a
> MODULE-NOT-FOUND red (the imports don't resolve), GREEN once both are authored. Its BEHAVIOUR is
> machine-witnessed; its styling is the story's operator-attested UAT leg (ADR-0070). Status stays `proposed` —
> `healthy` is only ever DERIVED from signed verdicts (ADR-0020), never authored.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SELECTION CARD AS A WHOLE — a behavioural
React component that renders nothing for a null selection, resolves an asset's description / an ADR's
load-bearing flag from the loaded corpus via a pure helper, renders title/kind/(description|status+badge), fires
`onOpen` from its Open button, and survives a stale selection whose id is gone from the corpus — spanning the
null gate, the asset branch, the ADR branch, the Open wiring, and the tolerant-lookup guard, exercised in jsdom.
It is the pinned "what am I looking at" home ADR-0188 dec 3 introduces (the structural fix for the attested
blank-panel bug); the category shelf (`library-category-shelf`) and the top drawer handle
(`library-top-drawer`, which replaced the retired `library-lens-minimise` per ADR-0191) are their own
increments, and the Open document overlay `onOpen` feeds is `library-open-overlay`'s job.

THE PURE DETAIL-LOOKUP HEART LIVES IN `selectionDetail.ts` (NET-NEW, no React). `SearchResult` carries only
`{ id, title, category, source, status? }` — NO description and NO load-bearing flag (verified in
`../lib/librarySearch` / `../types`). So the card must LOOK UP the extra detail from the loaded corpus. Author a
NET-NEW pure lib `apps/studio/src/lib/selectionDetail.ts` that, given a `SearchResult` + `assets` + `docs`,
resolves the display detail: for an asset selection (`source:'asset'`) the matching `GuidanceAsset.description`
found by id (or `undefined` when no asset matches); for an ADR selection (`source:'doc'`) the matching
`DocMeta.loadBearing` (and, if the leaf routes status through the helper, its status) found by id (or
`undefined` when no doc matches). It MUST be TOLERANT — an id absent from the corpus resolves to `undefined`,
never a throw or an index-out-of-bounds (the inc-3 real-data crash-class guard). Keep it PURE (input → output,
no `useState`, no DOM) so it proves directly. Pin the asset-description lookup in
`lsel-asset-shows-title-kind-and-description` and the tolerant-absent path in `lsel-stale-selection-renders-tolerantly`.

NULL RENDERS NOTHING. When `selection` is `null` the card renders nothing (returns null) — no card container, no
Open button. This is the honest empty state; the blank-panel bug the card fixes was a NON-null selection whose
detail never rendered, which the asset/ADR branches below cover. Pin the null gate in `lsel-null-renders-nothing`.

AN ASSET SELECTION — title, kind via `kindLabel`, description from the corpus. For `source:'asset'` render the
selection's title, its kind via `kindLabel(result.category, useArcDisplay())` (NEVER a hand-rolled
category→label map — an `arc` asset reads "epic", ADR-0183 D1), and the DESCRIPTION resolved from `assets` by id
through the pure `selectionDetail.ts` helper (the `SearchResult` has none). Assert the title, the `kindLabel`
kind, and the looked-up description. Pin it in `lsel-asset-shows-title-kind-and-description`.

AN ADR SELECTION — title, status, and a load-bearing badge (read-only off DocMeta). For `source:'doc'`
(`category:'adr'`) render the selection's title, its status, and a LOAD-BEARING badge rendered exactly when the
matching `DocMeta.loadBearing` (resolved from `docs` by id) is `true` — and NOT rendered when it is `false` or
absent. This is a READ-ONLY consumption of the inc-6 optional `DocMeta.loadBearing?` wire field (verified
present in `apps/studio/src/types.ts`): do NOT edit `types.ts`, do NOT add a field, just read it. Assert the
title, the status, the badge PRESENT for a load-bearing ADR, and the badge ABSENT for a non-load-bearing ADR.
Pin it in `lsel-adr-shows-status-and-loadbearing-badge`.

THE OPEN BUTTON FIRES `onOpen(selection)`. The card carries an `Open`-labelled button whose label is the word
**"Open"** (NOT "Dive"); clicking it invokes `onOpen(selection)` with the current selection. Assert the "Open"
label and that `onOpen` fires WITH the selection. Pin it in `lsel-open-button-fires-onopen`.

A STALE SELECTION RENDERS TOLERANTLY (the inc-3 real-data crash-class guard). A selection whose id is ABSENT
from the loaded corpus (a stale pick, a corpus that reloaded) still renders off the `SearchResult` ALONE — its
title + kind — with NO description (the asset lookup resolved `undefined`) and NO crash. This is the same
crash-class the staged inc-3 studio hit against real data that the jsdom gate missed: the lookup helper is
tolerant, and the card degrades to the `SearchResult`'s own fields rather than throwing. Pin it in
`lsel-stale-selection-renders-tolerantly`.

REUSE THE EXISTING TYPES — DEFINE NO NEW ONE (the inc-6/7 fence). `selection` uses the EXISTING `SearchResult`
from `../lib/librarySearch`; `assets`/`docs` use the EXISTING `GuidanceAsset`/`DocMeta` from `../types`; the
kind label uses the EXISTING `kindLabel`/`useArcDisplay` from `../lib/kindDisplay`. Do NOT define a new type,
and do NOT touch `apps/studio/src/types.ts` or `apps/studio/server/**` — the load-bearing badge is a read-only
consumer of the inc-6 field, and the inc-6/7 wire is a file-disjoint lane (plan §Lanes FENCE).

APPEARANCE IS OPERATOR-ATTESTED, NOT ASSERTED (ADR-0188 dec 3/7 + ADR-0070). The card follows the map's
forest-cozy palette (the world's CSS variables), NOT neutral-admin white. The card container styling, the
load-bearing badge look, the layout, and the Open button styling are WITNESSED by the owner (the shared inc-9/10
attestation), never a machine visual verdict — do NOT author a visual/colour/pixel/animation assertion in this
cap's tests (assert the null gate, the asset title/kind/description, the ADR title/status/badge-presence, the
Open→`onOpen` wiring, and the tolerant stale render, never their styling).

OFFLINE-TESTABLE IN JSDOM (the `LibraryFinder.test.tsx` / `LibraryDrawer.test.tsx` discipline).
`@vitest-environment jsdom`, `@testing-library/react` for render / `fireEvent` (click the Open button). No
backend seam to mock — the card takes `selection`/`assets`/`docs`/`onOpen` as props and renders from the loaded
corpus. No real `fetch`, no socket, no DB, no Electron. The component imports no agent/drive/model (the
`modelPathBoundary.test.ts` wall stays green).

## Integration test

**Goal —** Prove the pinned selection card: null renders nothing; an asset selection renders title + `kindLabel`
kind + the corpus-looked-up description; an ADR selection renders title + status + a load-bearing badge exactly
when `DocMeta.loadBearing` is true; the Open button fires `onOpen(selection)`; and a stale selection whose id is
absent from the corpus renders tolerantly off the `SearchResult` alone (title + kind, no description, no crash)
— entirely in jsdom, driven by props.

The integration test exercises this capability against its own composition (no backend seam) — the pure detail
helper, the null gate, the asset branch, the ADR branch, the Open wiring, and the tolerant-lookup guard are all
real. It would:

1. Render `<LibrarySelectionCard selection={null} assets={…} docs={…} onOpen={vi.fn()} />` and assert nothing
   renders (no card container, no Open button).
2. Render with an asset `SearchResult` whose id IS in `assets`. Assert the title, the `kindLabel` kind (an `arc`
   asset reads "epic"), and the description looked up from `assets` by the pure helper all render.
3. Render with an ADR `SearchResult` (`source:'doc'`, `category:'adr'`) whose id IS in `docs` with
   `loadBearing:true`. Assert the title, the status, and the load-bearing badge render. Render another ADR whose
   `DocMeta.loadBearing` is false/absent and assert NO badge renders.
4. Render with any non-null selection, `fireEvent.click` the "Open" button, and assert `onOpen` is invoked once
   WITH the selection.
5. Render with a selection whose id is ABSENT from `assets`/`docs` (a stale pick). Assert the card renders the
   `SearchResult`'s own title + kind, no description, and does not throw (the inc-3 crash-class guard).

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/LibrarySelectionCard.test.tsx`). Per ADR-0122 (`storytree coverage`) each contract
id is the lead of a distinctly-named test, so the coverage check reports 5/5 against the ONE `real.testFile`.
None of these is an APPEARANCE assertion — the look (the card styling, the badge look, the layout) is the
story's operator-attested UAT leg (ADR-0070).

1. **`lsel-null-renders-nothing`** — a null selection renders nothing
   - **asserts —** with `selection={null}` the card renders nothing (returns null) — no card container and no
     Open button in the DOM.
   - **covers —** `apps/studio/src/components/LibrarySelectionCard.tsx` (the null gate)
   - **proven by —** `apps/studio/src/components/LibrarySelectionCard.test.tsx` (net-new, vitest jsdom).
2. **`lsel-asset-shows-title-kind-and-description`** — an asset selection shows its title, its kindLabel kind, and its corpus-looked-up description
   - **asserts —** for a `source:'asset'` selection whose id is in `assets`, the card renders the title, the
     kind via `kindLabel(category, useArcDisplay())` (an `arc` reads "epic", never the raw key), and the
     DESCRIPTION resolved from `assets` by id through the pure `selectionDetail.ts` helper (the `SearchResult`
     carries no description).
   - **covers —** `apps/studio/src/components/LibrarySelectionCard.tsx` (the asset branch) and
     `apps/studio/src/lib/selectionDetail.ts` (the asset-description lookup)
   - **proven by —** `apps/studio/src/components/LibrarySelectionCard.test.tsx`.
3. **`lsel-adr-shows-status-and-loadbearing-badge`** — an ADR selection shows its title, status, and a load-bearing badge exactly when DocMeta.loadBearing is true
   - **asserts —** for a `source:'doc'` (`category:'adr'`) selection, the card renders the title, its status,
     and a LOAD-BEARING badge rendered exactly when the matching `DocMeta.loadBearing` (resolved from `docs` by
     id) is `true` — and NO badge when it is false/absent. A READ-ONLY consumption of the inc-6 optional
     `DocMeta.loadBearing?` field (no `types.ts` edit).
   - **covers —** `apps/studio/src/components/LibrarySelectionCard.tsx` (the ADR branch) and
     `apps/studio/src/lib/selectionDetail.ts` (the load-bearing lookup)
   - **proven by —** `apps/studio/src/components/LibrarySelectionCard.test.tsx`.
4. **`lsel-open-button-fires-onopen`** — the "Open" button fires onOpen with the selection
   - **asserts —** the card carries an `Open`-labelled button (its label is the word "Open", NOT "Dive");
     `fireEvent.click` invokes `onOpen(selection)` once WITH the current selection.
   - **covers —** `apps/studio/src/components/LibrarySelectionCard.tsx` (the Open button → `onOpen`)
   - **proven by —** `apps/studio/src/components/LibrarySelectionCard.test.tsx`.
5. **`lsel-stale-selection-renders-tolerantly`** — a selection whose id is absent from the corpus renders off the SearchResult alone, no description, no crash
   - **asserts —** a selection whose id is ABSENT from `assets`/`docs` renders the `SearchResult`'s own title +
     kind, NO description (the lookup resolved `undefined`), and does NOT throw — the inc-3 real-data
     crash-class guard (the tolerant `selectionDetail.ts` lookup).
   - **covers —** `apps/studio/src/components/LibrarySelectionCard.tsx` (the tolerant render) and
     `apps/studio/src/lib/selectionDetail.ts` (the tolerant-absent lookup)
   - **proven by —** `apps/studio/src/components/LibrarySelectionCard.test.tsx`.

## Guidance — the net-new slice that earns the signed verdict

The rung toward `healthy` (ADR-0057 §3, NET-NEW): author the pure detail helper + the card component,
test-first, against a module-not-found red.

- **The new test —** `apps/studio/src/components/LibrarySelectionCard.test.tsx` (`@vitest-environment jsdom`,
  vitest + `@testing-library/react` — the studio package convention, the `LibraryFinder.test.tsx` /
  `LibraryDrawer.test.tsx` shape; NO real `fetch`/socket/DB/Electron). Import `{ LibrarySelectionCard }` from
  `"./LibrarySelectionCard"`, the pure helper from `"../lib/selectionDetail"`, and
  `import type { SearchResult } from "../lib/librarySearch"` / `GuidanceAsset`/`DocMeta` from `"../types"` for
  the fixtures — define NO new type. Name each test for its contract id (`lsel-…`) so
  `storytree coverage library-selection-card` reports 5/5 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a MODULE-NOT-FOUND red: the test imports
  `LibrarySelectionCard` and `selectionDetail`, neither of which exists at HEAD, so the file fails to resolve.
  This is the net-new red the spine observes (ADR-0057).
- **The GREEN —** author `apps/studio/src/lib/selectionDetail.ts` (the pure, tolerant asset-description /
  ADR-load-bearing lookup) and `apps/studio/src/components/LibrarySelectionCard.tsx`: return null for a null
  selection; for an asset render title + `kindLabel` kind + the looked-up description; for an ADR render title +
  status + a load-bearing badge exactly when `DocMeta.loadBearing` is true; render an `Open` button firing
  `onOpen(selection)`; and degrade to the `SearchResult`'s own title + kind (no description, no crash) for a
  stale selection. WIRING the card's mount + the AppData-backed `assets`/`docs`/`selection`/`onOpen`
  composition into `TreeView.tsx` and the forest-cozy appearance are witnessed under the story's
  operator-attested UAT leg (ADR-0070), NOT asserted in CI and NOT in this `real:` scope. After it, the new
  test's assertions hold and `pnpm --filter studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Null renders nothing** (`lsel-null-renders-nothing`).
- **An asset renders title + `kindLabel` kind + the corpus-looked-up description** (`lsel-asset-shows-title-kind-and-description`)
  — `kindLabel(category, useArcDisplay())`, never a hand-rolled map; the description is resolved by the pure
  `selectionDetail.ts` helper (the `SearchResult` carries none).
- **An ADR renders title + status + a load-bearing badge exactly when `DocMeta.loadBearing` is true**
  (`lsel-adr-shows-status-and-loadbearing-badge`) — a read-only consumption of the inc-6 field; no `types.ts`
  edit.
- **The "Open" button fires `onOpen(selection)`** (`lsel-open-button-fires-onopen`) — the word "Open", not
  "Dive".
- **A stale selection renders tolerantly off the `SearchResult` alone** (`lsel-stale-selection-renders-tolerantly`,
  the inc-3 crash-class guard) — title + kind, no description, no crash.
- **Reuse the existing `SearchResult`/`GuidanceAsset`/`DocMeta`/`kindLabel`, touch no `types.ts`/`server`**
  (inc-6/7 fence) — define no new type.
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the render/wiring behaviour; the
  card styling and badge look are the shared inc-9/10 look leg. Do NOT author a visual verdict, and do NOT edit
  `TreeView.tsx` in the `real:` scope (the mount is the orchestrator's supplement glue after PASS — plan §G).
- **Every `lsel-` contract test TITLE carries its unique id** or `storytree coverage` silently drops coverage
  (`sdk-leaf-drops-contract-id-test-names`, this arc's 5th-occurrence class risk — the fix if it happens is
  TEST-TITLE-ONLY, never an assertion/source edit).
